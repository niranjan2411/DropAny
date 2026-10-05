export type SignalingDescription = {
  type: 'offer' | 'answer';
  sdp?: string;
};

export type IceCandidate = {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment?: string | null;
};

export type SignalingEvents = {
  'join-room': (payload: { identifier: string }) => void;
  offer: (payload: SignalingDescription) => void;
  answer: (payload: SignalingDescription) => void;
  'ice-candidate': (payload: IceCandidate) => void;
  'peer-ready': () => void;
  'peer-left': () => void;
  'room-error': (payload: { error: string }) => void;
};
