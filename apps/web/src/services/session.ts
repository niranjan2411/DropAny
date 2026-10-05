export type StoredSession = {
  roomId: string;
  displayCode: string;
  expiresAt: number;
  participantId: string;
  sessionToken: string;
  role: 'initiator' | 'joiner';
};

const key = 'droplink.session';

export function readSession(): StoredSession | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as StoredSession : undefined;
  } catch {
    return undefined;
  }
}

export function writeSession(session: StoredSession): void {
  localStorage.setItem(key, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(key);
}

export async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const waits = [0, 1000, 2500, 5000];
  let lastError: unknown;
  for (const wait of waits) {
    if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait));
    try {
      const response = await fetch(input, init);
      if (response.status >= 500) throw new Error(`Server returned ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('The connection is taking longer than usual.');
}
