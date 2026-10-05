import { useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { useWebRtc } from './services/webrtc';
import { QrScanner } from './components/QrScanner';
import { clearSession, fetchWithRetry, readSession, writeSession } from './services/session';
import './styles.css';

type Room = {
  id: string;
  displayCode: string;
  expiresAt: number;
  participantId: string;
  sessionToken: string;
  role: 'initiator' | 'joiner';
};

const apiUrl = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

function App() {
  const [room, setRoom] = useState<Room>();
  const [isInitiator, setIsInitiator] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [messageText, setMessageText] = useState('');
  const [fileError, setFileError] = useState('');
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [restoring, setRestoring] = useState(() => Boolean(readSession()));
  const connection = useWebRtc(room?.id, room?.participantId, room?.sessionToken, isInitiator);
  const persistRoom = (payload: Room) => writeSession({ roomId: payload.id, displayCode: payload.displayCode, expiresAt: payload.expiresAt, participantId: payload.participantId, sessionToken: payload.sessionToken, role: payload.role });

  useEffect(() => {
    const stored = readSession();
    if (!stored) { setRestoring(false); return; }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchWithRetry(`${apiUrl}/api/rooms/reconnect`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(stored) });
        if (!response.ok) throw new Error('expired');
        const payload = await response.json() as Room;
        if (!cancelled) { setRoom(payload); setIsInitiator(payload.role === 'initiator'); }
      } catch {
        clearSession();
        if (!cancelled) setError('This room has expired.');
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!room) return;
    const update = () => setTimeLeft(Math.max(0, room.expiresAt - Date.now()));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [room]);

  useEffect(() => {
    const token = window.location.pathname.startsWith('/join/') ? window.location.pathname.slice(6) : '';
    if (token) setJoinCode(token);
  }, []);

  const sendMessage = () => {
    if (connection.sendText(messageText.trim())) setMessageText('');
  };

  const chooseFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    if (!files.length) return;
    if (connection.state !== 'connected') setFileError('Connect both devices before sending a file.');
    else for (const file of files) if (!await connection.sendFile(file)) { setFileError('Transfer interrupted. Try again.'); break; }
    event.target.value = '';
  };

  const createRoom = async () => {
    setError('');
    try {
      const response = await fetchWithRetry(`${apiUrl}/api/rooms`, { method: 'POST' });
      if (!response.ok) throw new Error('create');
      const payload = await response.json() as Room;
      persistRoom(payload);
      setRoom(payload);
      setIsInitiator(true);
    } catch {
      setError('Unable to create a room. Please try again.');
    }
  };

  const joinRoom = async () => {
    setError('');
    try {
      const response = await fetchWithRetry(`${apiUrl}/api/rooms/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: joinCode.replace(/\s/g, '') }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Unable to join this room.');
      persistRoom(payload);
      setRoom(payload);
      setIsInitiator(false);
    } catch (joinError) {
      setError(joinError instanceof Error && joinError.message !== 'Failed to fetch' ? joinError.message : 'The connection is taking longer than usual.');
    }
  };

  const leaveRoom = async () => {
    if (room) await fetch(`${apiUrl}/api/rooms/leave`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roomId: room.id, participantId: room.participantId }) }).catch(() => undefined);
    clearSession();
    setRoom(undefined);
  };

  if (room) {
    return (
      <main className="shell">
        <header className="topbar"><strong>DropLink</strong><span>Temporary room</span></header>
        <section className="room-panel">
          <div className="room-heading">
            <div><p className="eyebrow">Room {room.displayCode.slice(0, 3)} {room.displayCode.slice(3)}</p><h1>{connection.state === 'connected' ? 'Connected' : 'Connecting...'}</h1></div>
            <span className={`status status-${connection.state}`}><i />{connection.state}</span>
          </div>
          <div className="room-invite"><QRCodeCanvas value={`${window.location.origin}/join/${room.id}`} size={150} includeMargin /><div><p className="muted">Scan to join this room</p><p className="room-code">{room.displayCode.slice(0, 3)} {room.displayCode.slice(3)}</p><div className="invite-actions"><button className="secondary" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/join/${room.id}`)}>Copy link</button><button className="secondary" onClick={() => void navigator.clipboard.writeText(room.displayCode)}>Copy code</button></div></div></div>
          <p className="muted">{timeLeft > 0 ? `Room expires in ${Math.floor(timeLeft / 60000)}:${String(Math.floor(timeLeft / 1000) % 60).padStart(2, '0')}` : 'This room has expired.'}</p>
          {connection.state !== 'connected' && <p className="muted">{connection.state === 'disconnected' ? 'The other device disconnected.' : connection.state === 'failed' ? 'Unable to connect. Please check that both devices are online.' : 'Waiting for the other device to join this room.'}</p>}
          <div className="transfer-placeholder"><span className="drop-icon">↕</span><h2>Ready to share</h2><p>Choose one or more files to send directly to the other device.</p><label className="file-button">Choose files<input type="file" multiple onChange={chooseFiles} disabled={connection.state !== 'connected'} /></label>{fileError && <small className="error">{fileError}</small>}</div>
          {connection.transfers.length > 0 && <section className="transfers"><h2>Transfers</h2>{connection.transfers.map((transfer) => <div className="transfer" key={transfer.id}><div><strong>{transfer.name}</strong><span>{transfer.status} · {Math.round((transfer.transferred / transfer.size) * 100)}%</span></div><progress value={transfer.transferred} max={transfer.size} /></div>)}</section>}
          {connection.receivedFiles.length > 0 && <section className="received"><h2>Received files</h2>{connection.receivedFiles.map((file) => <div className="received-file" key={file.id}><span>{file.name}</span><a href={file.url} download={file.name}>Download</a></div>)}</section>}
          <section className="chat" aria-label="Chat">
            <h2>Chat</h2>
            <div className="messages">{connection.messages.map((message) => <p key={message.id}><strong>{message.sender === 'local' ? 'You' : 'Peer'}</strong>{message.text}</p>)}</div>
            <div className="chat-compose"><textarea aria-label="Message" rows={2} placeholder="Type a message..." value={messageText} onChange={(event) => setMessageText(event.target.value)} /><button onClick={sendMessage} disabled={connection.state !== 'connected' || !messageText.trim()}>Send</button></div>
          </section>
          {(connection.state === 'disconnected' || connection.state === 'failed') && <button onClick={leaveRoom}>Create new connection</button>}
          <button className="secondary" onClick={leaveRoom}>Leave room</button>
        </section>
      </main>
    );
  }

  if (restoring) return <main className="shell home-shell"><section className="hero"><p className="eyebrow">Restoring session</p><h1>Reconnecting...</h1><p className="lede">The room is waking up. Your temporary session is being restored.</p></section></main>;

  return (
    <main className="shell home-shell">
      <header className="topbar"><strong>DropLink</strong><span>Private by design</span></header>
      <section className="hero">
        <p className="eyebrow">Send without the ceremony</p>
        <h1>Files move better<br /><em>between your devices.</em></h1>
        <p className="lede">Create a temporary room, connect two screens, and share directly. No account. No phone number.</p>
        <div className="actions"><button onClick={createRoom}>Create room <span>→</span></button><div className="join-action"><input aria-label="Room code" inputMode="numeric" placeholder="Room code" value={joinCode} onChange={(event) => setJoinCode(event.target.value)} /><button className="secondary" onClick={joinRoom}>Join room</button><button className="secondary" onClick={() => setScanning(true)}>Scan QR</button></div></div>
        {scanning && <QrScanner onResult={(value) => { setJoinCode(value.split('/join/').pop() ?? value); setScanning(false); }} onClose={() => setScanning(false)} />}
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      <section className="principles"><div><b>01</b><span>Temporary rooms</span></div><div><b>02</b><span>No account required</span></div><div><b>03</b><span>Direct device-to-device</span></div><div><b>04</b><span>No permanent storage</span></div></section>
    </main>
  );
}

export default App;
