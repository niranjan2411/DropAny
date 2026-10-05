import { describe, expect, it } from 'vitest';
import { RoomError, RoomManager } from './roomManager.js';

describe('RoomManager', () => {
  it('creates a secure room with a six-digit code', () => {
    const room = new RoomManager().create();
    expect(room.id).toHaveLength(64);
    expect(room.displayCode).toMatch(/^\d{6}$/);
    expect(room.participants).toBe(1);
  });

  it('rejects a third participant', () => {
    const manager = new RoomManager();
    const room = manager.create();
    manager.join(room.displayCode);
    expect(() => manager.join(room.displayCode)).toThrow(new RoomError('ROOM_FULL'));
  });

  it('expires rooms after the configured TTL', () => {
    const manager = new RoomManager(1);
    const room = manager.create();
    expect(manager.cleanup(room.expiresAt + 1)).toBe(1);
    expect(() => manager.get(room.id)).toThrow(new RoomError('ROOM_NOT_FOUND'));
  });
});
