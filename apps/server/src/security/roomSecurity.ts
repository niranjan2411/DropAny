export const ROOM_ID_PATTERN = /^[a-f0-9]{64}$/;
export const PARTICIPANT_ID_PATTERN = /^[a-f0-9]{32}$/;
export const SESSION_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
export const DISPLAY_CODE_PATTERN = /^\d{6}$/;

export function isRoomIdentifier(value: unknown): value is string {
  return typeof value === 'string' && (DISPLAY_CODE_PATTERN.test(value) || ROOM_ID_PATTERN.test(value));
}

export function isAuthorizedSession(value: unknown): value is string {
  return typeof value === 'string' && SESSION_TOKEN_PATTERN.test(value);
}

export function isParticipantIdentifier(value: unknown): value is string {
  return typeof value === 'string' && PARTICIPANT_ID_PATTERN.test(value);
}

export function isSignalingDescription(value: unknown): value is { type: 'offer' | 'answer'; sdp?: string } {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return (payload.type === 'offer' || payload.type === 'answer') && (payload.sdp === undefined || (typeof payload.sdp === 'string' && payload.sdp.length <= 32_768));
}

export function isIceCandidate(value: unknown): value is { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null; usernameFragment?: string | null } {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.candidate === 'string' && payload.candidate.length <= 8_192 && (typeof payload.sdpMid === 'string' || payload.sdpMid === null) && (typeof payload.sdpMLineIndex === 'number' || payload.sdpMLineIndex === null);
}

type AttemptState = { windowStarted: number; failures: number; blockedUntil: number };

export class JoinAttemptTracker {
  private readonly states = new Map<string, AttemptState>();
  constructor(private readonly windowMs: number, private readonly maxAttempts: number, private readonly blockMs: number) {}

  allowed(key: string, now = Date.now()): boolean {
    const state = this.states.get(key);
    if (!state) return true;
    if (state.blockedUntil > now) return false;
    if (now - state.windowStarted >= this.windowMs) {
      this.states.delete(key);
      return true;
    }
    return state.failures < this.maxAttempts;
  }

  success(key: string): void { this.states.delete(key); }

  failure(key: string, now = Date.now()): void {
    const current = this.states.get(key);
    const state = current && now - current.windowStarted < this.windowMs ? current : { windowStarted: now, failures: 0, blockedUntil: 0 };
    state.failures += 1;
    if (state.failures >= this.maxAttempts) {
      const multiplier = Math.min(4, Math.max(1, Math.floor(state.failures / this.maxAttempts)));
      state.blockedUntil = now + this.blockMs * multiplier;
    }
    this.states.set(key, state);
  }
}
