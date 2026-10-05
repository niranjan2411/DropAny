import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createRoomHandlers } from './api/rooms.js';
import { createPersistentRoomManager } from './rooms/persistentRoomManager.js';
import type { HealthResponse, IceCandidate, SignalingDescription } from './types/protocol.js';

const port = Number(process.env.PORT ?? 3001);
const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';
const app = express();
const httpServer = createServer(app);
const roomManager = await createPersistentRoomManager({
  ttlSeconds: Number(process.env.ROOM_TTL_SECONDS ?? 600),
  graceSeconds: Number(process.env.PARTICIPANT_RECONNECT_GRACE_SECONDS ?? 60),
  maxParticipants: Number(process.env.MAX_ROOM_PARTICIPANTS ?? 2),
  redisUrl: process.env.REDIS_URL,
});

app.use(cors({ origin: clientUrl }));
app.use(helmet());
app.use(express.json({ limit: '256kb' }));

const roomCreationLimit = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false });
const roomJoinLimit = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
const visitorLimit = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false });

const roomHandlers = createRoomHandlers(roomManager);
app.post('/api/rooms', roomCreationLimit, roomHandlers.create);
app.post('/api/rooms/join', roomJoinLimit, roomHandlers.join);
app.post('/api/rooms/reconnect', roomHandlers.reconnect);
app.post('/api/rooms/leave', roomHandlers.leave);
app.get('/api/rooms/:identifier', roomHandlers.get);

app.get('/api/health', (_request, response) => {
  const payload: HealthResponse = {
    status: 'ok',
    service: 'droplink-server',
    timestamp: new Date().toISOString(),
  };
  response.json(payload);
});

app.get('/api/ice-servers', (_request, response) => {
  const iceServers: Array<{ urls: string; username?: string; credential?: string }> = [];
  if (process.env.STUN_SERVER_URL) iceServers.push({ urls: process.env.STUN_SERVER_URL });
  if (process.env.TURN_SERVER_URL && process.env.TURN_USERNAME && process.env.TURN_PASSWORD) {
    iceServers.push({ urls: process.env.TURN_SERVER_URL, username: process.env.TURN_USERNAME, credential: process.env.TURN_PASSWORD });
  }
  response.json({ iceServers });
});

app.post('/api/visits', visitorLimit, async (request, response) => {
  const visitorId = typeof request.body?.visitorId === 'string' ? request.body.visitorId.trim() : '';
  if (!/^[a-zA-Z0-9-]{16,128}$/.test(visitorId)) {
    response.status(400).json({ error: 'Invalid visitor identifier.' });
    return;
  }
  response.json({ total: await roomManager.registerVisit(visitorId) });
});

const io = new Server(httpServer, { cors: { origin: clientUrl } });
io.on('connection', (socket) => {
  socket.on('join-room', async ({ roomId, participantId, sessionToken }: { roomId: string; participantId: string; sessionToken: string }) => {
    if (![roomId, participantId, sessionToken].every((value) => typeof value === 'string' && value.length > 0)) {
      socket.emit('room-error', { error: 'Enter a valid room code.' });
      return;
    }
    try {
      const room = await roomManager.reconnect(roomId, participantId, sessionToken);
      socket.join(room.id);
      socket.data.roomId = room.id;
      socket.data.participantId = participantId;
      socket.to(room.id).emit('peer-ready');
      socket.emit('peer-ready');
    } catch {
      socket.emit('room-error', { error: 'Room expired or unavailable.' });
    }
  });

  const relay = <T>(event: string, payload: T) => {
    const roomId = socket.data.roomId as string | undefined;
    if (roomId) socket.to(roomId).emit(event, payload);
  };
  socket.on('offer', (payload: SignalingDescription) => relay('offer', payload));
  socket.on('answer', (payload: SignalingDescription) => relay('answer', payload));
  socket.on('ice-candidate', (payload: IceCandidate) => relay('ice-candidate', payload));

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId as string | undefined;
    const participantId = socket.data.participantId as string | undefined;
    if (roomId && participantId) {
      void roomManager.disconnect(roomId, participantId);
      socket.to(roomId).emit('peer-left');
    }
  });
});

setInterval(() => void roomManager.cleanup(), 30_000).unref();

httpServer.listen(port, () => {
  console.log(`DropLink server listening on http://localhost:${port}`);
});
