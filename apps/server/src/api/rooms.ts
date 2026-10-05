import type { RequestHandler } from 'express';
import { PersistentRoomError, type PersistentRoomManager } from '../rooms/persistentRoomManager.js';

const errorStatus: Record<PersistentRoomError['code'], number> = {
  ROOM_NOT_FOUND: 404,
  ROOM_EXPIRED: 410,
  ROOM_FULL: 409,
  SESSION_INVALID: 410,
};

const errorMessage: Record<PersistentRoomError['code'], string> = {
  ROOM_NOT_FOUND: 'Room not found.',
  ROOM_EXPIRED: 'Room expired.',
  ROOM_FULL: 'This room is full.',
  SESSION_INVALID: 'This room session has expired.',
};

export const createRoomHandlers = (roomManager: PersistentRoomManager) => {
  const create: RequestHandler = async (_request, response) => {
    response.status(201).json(await roomManager.create());
  };

  const join: RequestHandler = async (request, response) => {
    const identifier = typeof request.body?.identifier === 'string' ? request.body.identifier.trim() : '';
    if (!identifier || identifier.length > 128) {
      response.status(400).json({ error: 'Enter a valid room code.' });
      return;
    }
    try {
      response.json(await roomManager.join(identifier));
    } catch (error) {
      if (error instanceof PersistentRoomError) {
        response.status(errorStatus[error.code]).json({ error: errorMessage[error.code] });
        return;
      }
      response.status(500).json({ error: 'Unable to join this room.' });
    }
  };

  const reconnect: RequestHandler = async (request, response) => {
    const { roomId, participantId, sessionToken } = request.body ?? {};
    if (![roomId, participantId, sessionToken].every((value) => typeof value === 'string' && value.length > 0)) {
      response.status(400).json({ error: 'Invalid session.' });
      return;
    }
    try {
      response.json(await roomManager.reconnect(roomId, participantId, sessionToken));
    } catch (error) {
      if (error instanceof PersistentRoomError) {
        response.status(error.code === 'SESSION_INVALID' ? 410 : errorStatus[error.code]).json({ error: error.code === 'SESSION_INVALID' ? 'This room session has expired.' : errorMessage[error.code] });
        return;
      }
      response.status(500).json({ error: 'Unable to restore this room.' });
    }
  };

  const leave: RequestHandler = async (request, response) => {
    const { roomId, participantId } = request.body ?? {};
    if (typeof roomId !== 'string' || typeof participantId !== 'string') {
      response.status(400).json({ error: 'Invalid session.' });
      return;
    }
    await roomManager.leave(roomId, participantId);
    response.status(204).end();
  };

  const get: RequestHandler = async (request, response) => {
    const identifier = typeof request.params.identifier === 'string' ? request.params.identifier : '';
    try {
      response.json(await roomManager.get(identifier));
    } catch (error) {
      if (error instanceof PersistentRoomError) {
        response.status(errorStatus[error.code]).json({ error: errorMessage[error.code] });
        return;
      }
      response.status(500).json({ error: 'Unable to load this room.' });
    }
  };

  return { create, join, reconnect, leave, get };
};
