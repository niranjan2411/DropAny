import { describe, expect, it } from 'vitest';
import { PersistentRoomError, PersistentRoomManager } from './persistentRoomManager.js';

describe('PersistentRoomManager', () => {
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
});
