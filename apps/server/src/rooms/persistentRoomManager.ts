import { randomBytes, randomInt } from 'node:crypto';
import { createClient } from 'redis';
import type { RoomErrorCode } from './roomManager.js';

export type ParticipantRole = 'initiator' | 'joiner';
export type Participant = { participantId: string; sessionToken: string; role: ParticipantRole; status: 'connected' | 'disconnected'; disconnectedAt?: number };
export type RoomAccess = { id: string; displayCode: string; createdAt: number; expiresAt: number; lastActivity: number; participants: number; participantId: string; sessionToken: string; role: ParticipantRole };
export type PublicRoom = Omit<RoomAccess, 'participantId' | 'sessionToken' | 'role'>;

type RoomRecord = Omit<RoomAccess, 'participantId' | 'sessionToken' | 'role' | 'participants'> & { participants: Participant[] };

export class PersistentRoomError extends Error {
  constructor(public readonly code: RoomErrorCode | 'SESSION_INVALID') { super(code); }
}

export class PersistentRoomManager {
  private readonly memory = new Map<string, RoomRecord>();
  private readonly ttlMs: number;
  private readonly graceMs: number;
  private readonly maxParticipants: number;
  private readonly redis?: any;
  private visitCount = 0;
  private readonly visitorIds = new Set<string>();

  constructor(options: { ttlSeconds: number; graceSeconds: number; maxParticipants: number; redis?: any }) {
    this.ttlMs = options.ttlSeconds * 1000;
    this.graceMs = options.graceSeconds * 1000;
    this.maxParticipants = options.maxParticipants;
    this.redis = options.redis;
  }

  async create(): Promise<RoomAccess> {
    const now = Date.now();
    const room: RoomRecord = { id: randomBytes(32).toString('hex'), displayCode: this.newDisplayCode(), createdAt: now, expiresAt: now + this.ttlMs, lastActivity: now, participants: [this.newParticipant('initiator')] };
    await this.save(room);
    return this.access(room, room.participants[0]);
  }

  async join(identifier: string): Promise<RoomAccess> {
    const room = await this.find(identifier);
    if (!room) throw new PersistentRoomError('ROOM_NOT_FOUND');
    if (room.participants.length >= this.maxParticipants) throw new PersistentRoomError('ROOM_FULL');
    const participant = this.newParticipant('joiner');
    room.participants.push(participant);
    this.touch(room);
    await this.save(room);
    return this.access(room, participant);
  }

  async reconnect(roomId: string, participantId: string, sessionToken: string): Promise<RoomAccess> {
    const room = await this.find(roomId);
    if (!room) throw new PersistentRoomError('ROOM_NOT_FOUND');
    const participant = room.participants.find((candidate) => candidate.participantId === participantId && candidate.sessionToken === sessionToken);
    if (!participant || (participant.status === 'disconnected' && participant.disconnectedAt && Date.now() - participant.disconnectedAt > this.graceMs)) {
      throw new PersistentRoomError('SESSION_INVALID');
    }
    participant.status = 'connected';
    participant.disconnectedAt = undefined;
    this.touch(room);
    await this.save(room);
    return this.access(room, participant);
  }

  async get(identifier: string): Promise<PublicRoom> {
    const room = await this.find(identifier);
    if (!room) throw new PersistentRoomError('ROOM_NOT_FOUND');
    return { id: room.id, displayCode: room.displayCode, createdAt: room.createdAt, expiresAt: room.expiresAt, lastActivity: room.lastActivity, participants: room.participants.length };
  }

  async registerVisit(visitorId: string): Promise<number> {
    if (this.redis) {
      const added = await this.redis.set(`droplink:visitor:${visitorId}`, '1', { NX: true });
      if (added) return Number(await this.redis.incr('droplink:visits'));
      const total = await this.redis.get('droplink:visits');
      return Number(total ?? 0);
    }
    if (this.visitorIds.has(visitorId)) return this.visitCount;
    this.visitorIds.add(visitorId);
    this.visitCount += 1;
    return this.visitCount;
  }

  async disconnect(roomId: string, participantId: string): Promise<void> {
    const room = await this.find(roomId, false);
    const participant = room?.participants.find((candidate) => candidate.participantId === participantId);
    if (!room || !participant) return;
    participant.status = 'disconnected';
    participant.disconnectedAt = Date.now();
    await this.save(room);
  }

  async leave(roomId: string, participantId: string, sessionToken: string): Promise<void> {
    const room = await this.find(roomId, false);
    if (!room) return;
    const authorized = room.participants.some((participant) => participant.participantId === participantId && participant.sessionToken === sessionToken);
    if (!authorized) throw new PersistentRoomError('SESSION_INVALID');
    room.participants = room.participants.filter((participant) => participant.participantId !== participantId);
    if (room.participants.length === 0) {
      await this.remove(room);
      return;
    }
    this.touch(room);
    await this.save(room);
  }

  async cleanup(now = Date.now()): Promise<number> {
    let removed = 0;
    for (const room of this.memory.values()) {
      if (room.expiresAt <= now) { this.memory.delete(room.id); removed += 1; continue; }
      room.participants = room.participants.filter((participant) => !participant.disconnectedAt || now - participant.disconnectedAt <= this.graceMs);
      if (room.participants.length === 0) { this.memory.delete(room.id); removed += 1; }
    }
    return removed;
  }

  private async find(identifier: string, required = true): Promise<RoomRecord | undefined> {
    let room: RoomRecord | undefined;
    if (this.redis) {
      const roomId = (await this.redis.get(this.codeKey(identifier))) ?? identifier;
      const raw = await this.redis.get(this.roomKey(roomId));
      room = raw ? JSON.parse(raw) as RoomRecord : undefined;
    } else {
      room = [...this.memory.values()].find((candidate) => candidate.id === identifier || candidate.displayCode === identifier);
    }
    if (!room) { if (required) throw new PersistentRoomError('ROOM_NOT_FOUND'); return undefined; }
    if (room.expiresAt <= Date.now()) { await this.remove(room); throw new PersistentRoomError('ROOM_EXPIRED'); }
    const before = room.participants.length;
    room.participants = room.participants.filter((participant) => !participant.disconnectedAt || Date.now() - participant.disconnectedAt <= this.graceMs);
    if (room.participants.length !== before) {
      if (room.participants.length === 0) { await this.remove(room); if (required) throw new PersistentRoomError('ROOM_NOT_FOUND'); return undefined; }
      await this.save(room);
    }
    return room;
  }

  private async save(room: RoomRecord): Promise<void> {
    this.memory.set(room.id, room);
    if (!this.redis) return;
    const ttl = Math.max(1, Math.ceil((room.expiresAt - Date.now()) / 1000));
    await this.redis.set(this.roomKey(room.id), JSON.stringify(room), { EX: ttl });
    await this.redis.set(this.codeKey(room.displayCode), room.id, { EX: ttl });
  }

  private async remove(room: RoomRecord): Promise<void> {
    this.memory.delete(room.id);
    if (this.redis) await this.redis.del([this.roomKey(room.id), this.codeKey(room.displayCode)]);
  }

  private access(room: RoomRecord, participant: Participant): RoomAccess {
    return { id: room.id, displayCode: room.displayCode, createdAt: room.createdAt, expiresAt: room.expiresAt, lastActivity: room.lastActivity, participants: room.participants.length, participantId: participant.participantId, sessionToken: participant.sessionToken, role: participant.role };
  }

  private touch(room: RoomRecord): void { const now = Date.now(); room.lastActivity = now; room.expiresAt = now + this.ttlMs; }
  private newParticipant(role: ParticipantRole): Participant { return { participantId: randomBytes(16).toString('hex'), sessionToken: randomBytes(32).toString('hex'), role, status: 'connected' }; }
  private newDisplayCode(): string { let code = ''; do code = randomInt(100000, 1000000).toString(); while ([...this.memory.values()].some((room) => room.displayCode === code)); return code; }
  private roomKey(id: string): string { return `droplink:room:${id}`; }
  private codeKey(code: string): string { return `droplink:code:${code}`; }
}

export async function createPersistentRoomManager(options: { ttlSeconds: number; graceSeconds: number; maxParticipants: number; redisUrl?: string }) {
  if (!options.redisUrl) return new PersistentRoomManager(options);
  const redis = createClient({ url: options.redisUrl });
  redis.on('error', (error) => console.error('Redis connection error', error.message));
  try {
    await redis.connect();
    return new PersistentRoomManager({ ...options, redis });
  } catch (error) {
    console.warn('Redis unavailable; using temporary in-memory room state.', error instanceof Error ? error.message : error);
    return new PersistentRoomManager(options);
  }
}
