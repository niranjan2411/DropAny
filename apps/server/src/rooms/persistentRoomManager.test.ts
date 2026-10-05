import { describe, expect, it } from 'vitest';
import { PersistentRoomError, PersistentRoomManager } from './persistentRoomManager.js';

describe('PersistentRoomManager', () => {
  it('counts each anonymous visitor ID only once', async () => {
    const manager = new PersistentRoomManager({ ttlSeconds: 600, graceSeconds: 60, maxParticipants: 2 });
    await expect(manager.registerVisit('visitor-one-123456')).resolves.toBe(1);
    await expect(manager.registerVisit('visitor-one-123456')).resolves.toBe(1);
    await expect(manager.registerVisit('visitor-two-123456')).resolves.toBe(2);
  });

  it('keeps a disconnected participant during the grace period', async () => {
    const manager = new PersistentRoomManager({ ttlSeconds: 600, graceSeconds: 60, maxParticipants: 2 });
    const room = await manager.create();
    await manager.disconnect(room.id, room.participantId);
    await expect(manager.reconnect(room.id, room.participantId, room.sessionToken)).resolves.toMatchObject({ participantId: room.participantId });
  });

  it('rejects an invalid session token', async () => {
    const manager = new PersistentRoomManager({ ttlSeconds: 600, graceSeconds: 60, maxParticipants: 2 });
    const room = await manager.create();
    await expect(manager.reconnect(room.id, room.participantId, 'wrong')).rejects.toThrow(new PersistentRoomError('SESSION_INVALID'));
  });

  it('requires the session token to leave', async () => {
    const manager = new PersistentRoomManager({ ttlSeconds: 600, graceSeconds: 60, maxParticipants: 2 });
    const room = await manager.create();
    await expect(manager.leave(room.id, room.participantId, 'wrong')).rejects.toThrow(new PersistentRoomError('SESSION_INVALID'));
    await expect(manager.leave(room.id, room.participantId, room.sessionToken)).resolves.toBeUndefined();
  });
});
