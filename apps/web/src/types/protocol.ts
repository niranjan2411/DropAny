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

export type TextMessage = {
  type: 'text';
  id: string;
  timestamp: number;
  text: string;
  sender: 'local' | 'peer';
};

export type FileStartMessage = {
  type: 'file-start';
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  totalChunks: number;
};

export type FileCompleteMessage = {
  type: 'file-complete';
  fileId: string;
};
