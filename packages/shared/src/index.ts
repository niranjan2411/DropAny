export type HealthResponse = {
  status: 'ok';
  service: 'droplink-server';
  timestamp: string;
};

export * from './protocol/index.js';
