import { randomBytes, randomInt } from 'node:crypto';

export type Room = {
  id: string;
  displayCode: string;
  createdAt: number;
  expiresAt: number;
  lastActivity: number;
  participants: number;
};

export type RoomErrorCode = 'ROOM_NOT_FOUND' | 'ROOM_EXPIRED' | 'ROOM_FULL';

export class RoomError extends Error {
  constructor(public readonly code: RoomErrorCode) {
    super(code);
  }
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly ttlMs: number;
  private readonly maxParticipants: number;

  constructor(ttlSeconds = 600, maxParticipants = 2) {
    this.ttlMs = ttlSeconds * 1000;
    this.maxParticipants = maxParticipants;
  }

  create(): Room {
    const now = Date.now();
    const room: Room = {
      id: randomBytes(32).toString('hex'),
      displayCode: this.newDisplayCode(),
      createdAt: now,
      expiresAt: now + this.ttlMs,
      lastActivity: now,
      participants: 1,
    };
    this.rooms.set(room.id, room);
    return room;
  }

  join(identifier: string): Room {
    const room = this.find(identifier);
    if (room.participants >= this.maxParticipants) {
      throw new RoomError('ROOM_FULL');
    }
    room.participants += 1;
    this.touch(room);
    return room;
  }

  leave(identifier: string): void {
    const room = this.find(identifier, false);
    if (!room) return;
    room.participants = Math.max(0, room.participants - 1);
    this.touch(room);
  }

  get(identifier: string): Room {
    return this.find(identifier);
  }

  cleanup(now = Date.now()): number {
    let removed = 0;
    for (const [id, room] of this.rooms) {
      if (room.expiresAt <= now || room.participants === 0) {
        this.rooms.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  private find(identifier: string, required = true): Room {
    const room = [...this.rooms.values()].find(
      (candidate) => candidate.id === identifier || candidate.displayCode === identifier,
    );
    if (!room) {
      if (required) throw new RoomError('ROOM_NOT_FOUND');
      return undefined as never;
    }
    if (room.expiresAt <= Date.now()) {
      this.rooms.delete(room.id);
      throw new RoomError('ROOM_EXPIRED');
    }
    return room;
  }

  private touch(room: Room): void {
    const now = Date.now();
    room.lastActivity = now;
    room.expiresAt = now + this.ttlMs;
  }

  private newDisplayCode(): string {
    let code = '';
    do {
      code = randomInt(100000, 1000000).toString();
    } while ([...this.rooms.values()].some((room) => room.displayCode === code));
    return code;
  }
}
