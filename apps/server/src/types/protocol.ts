export type HealthResponse = {
  status: 'ok';
  service: 'droplink-server';
  timestamp: string;
};

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
