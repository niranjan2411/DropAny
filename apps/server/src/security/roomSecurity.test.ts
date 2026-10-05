import { describe, expect, it } from 'vitest';
import { DISPLAY_CODE_PATTERN, JoinAttemptTracker, isIceCandidate, isRoomIdentifier, isSignalingDescription } from './roomSecurity.js';

describe('room security', () => {
  it('accepts only six-digit codes or high-entropy room IDs', () => {
    expect(isRoomIdentifier('123456')).toBe(true);
    expect(isRoomIdentifier('a'.repeat(64))).toBe(true);
    expect(isRoomIdentifier('12345')).toBe(false);
    expect(isRoomIdentifier('room-id')).toBe(false);
    expect(DISPLAY_CODE_PATTERN.test('123456')).toBe(true);
  });

  it('validates bounded signaling payloads', () => {
    expect(isSignalingDescription({ type: 'offer', sdp: 'v=0' })).toBe(true);
    expect(isSignalingDescription({ type: 'offer', sdp: 'x'.repeat(32_769) })).toBe(false);
    expect(isIceCandidate({ candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 })).toBe(true);
    expect(isIceCandidate({ candidate: 1, sdpMid: '0', sdpMLineIndex: 0 })).toBe(false);
  });

  it('blocks repeated failures and resets after a valid attempt', () => {
    const tracker = new JoinAttemptTracker(60_000, 2, 1_000);
    expect(tracker.allowed('ip')).toBe(true);
    tracker.failure('ip');
    tracker.failure('ip');
    expect(tracker.allowed('ip')).toBe(false);
    tracker.success('ip');
    expect(tracker.allowed('ip')).toBe(true);
  });
});
