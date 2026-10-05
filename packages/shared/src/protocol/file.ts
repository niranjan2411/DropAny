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
