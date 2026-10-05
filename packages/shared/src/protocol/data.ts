export type TextMessage = {
  type: 'text';
  id: string;
  timestamp: number;
  text: string;
  sender: 'local' | 'peer';
};

export type DataMessage = TextMessage;
