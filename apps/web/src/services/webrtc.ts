import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { DataMessage, FileCompleteMessage, FileStartMessage, IceCandidate, SignalingDescription } from '@droplink/shared';

const serverUrl = import.meta.env.VITE_SERVER_URL ?? (import.meta.env.DEV ? 'http://localhost:3001' : '');
const FILE_CHUNK_SIZE = 64 * 1024;
const BUFFERED_AMOUNT_LIMIT = 1024 * 1024;

type ConnectionState = 'idle' | 'connecting' | 'reconnecting' | 'connected' | 'disconnected' | 'failed';
export type ReceivedFile = { id: string; name: string; size: number; url: string };
export type Transfer = { id: string; name: string; size: number; transferred: number; status: 'Preparing' | 'Transferring' | 'Completed' | 'Interrupted' };

export function useWebRtc(roomId: string | undefined, participantId: string | undefined, sessionToken: string | undefined, isInitiator: boolean) {
  const [state, setState] = useState<ConnectionState>('idle');
  const [messages, setMessages] = useState<DataMessage[]>([]);
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const incomingFileRef = useRef<{ metadata: FileStartMessage; chunks: ArrayBuffer[] } | undefined>(undefined);

  useEffect(() => {
    if (!roomId) return;
    const nextSocket = io(serverUrl || undefined, { autoConnect: false, path: '/socket.io', reconnection: true, reconnectionAttempts: 8, reconnectionDelay: 1000, reconnectionDelayMax: 10000, randomizationFactor: 0.25 });
    const peer = new RTCPeerConnection({
      iceServers: import.meta.env.VITE_STUN_SERVER_URL ? [{ urls: import.meta.env.VITE_STUN_SERVER_URL }] : [],
    });
    peerRef.current = peer;
    setSocket(nextSocket);
    setState('connecting');

    const sendOffer = async () => {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      nextSocket.emit('offer', peer.localDescription);
    };

    const attachChannel = (channel: RTCDataChannel) => {
      channelRef.current = channel;
      channel.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          incomingFileRef.current?.chunks.push(event.data);
          if (incomingFileRef.current) {
            const fileId = incomingFileRef.current.metadata.fileId;
            const transferred = incomingFileRef.current.chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
            setTransfers((current) => current.map((transfer) => transfer.id === fileId ? { ...transfer, transferred } : transfer));
          }
          return;
        }
        try {
          const message = JSON.parse(event.data as string) as DataMessage | FileStartMessage | FileCompleteMessage;
          if (message.type === 'text') setMessages((current) => [...current, { ...message, sender: 'peer' }]);
          if (message.type === 'file-start') {
            incomingFileRef.current = { metadata: message, chunks: [] };
            setTransfers((current) => [...current, { id: message.fileId, name: message.name, size: message.size, transferred: 0, status: 'Transferring' }]);
          }
          if (message.type === 'file-complete' && incomingFileRef.current?.metadata.fileId === message.fileId) {
            const { metadata, chunks } = incomingFileRef.current;
            const blob = new Blob(chunks, { type: metadata.mimeType });
            setTransfers((current) => current.map((transfer) => transfer.id === metadata.fileId ? { ...transfer, transferred: metadata.size, status: 'Completed' } : transfer));
            setReceivedFiles((current) => [...current, { id: metadata.fileId, name: metadata.name, size: metadata.size, url: URL.createObjectURL(blob) }]);
            incomingFileRef.current = undefined;
          }
        } catch {
          setState('failed');
        }
      };
      channel.onopen = () => setState('connected');
      channel.onclose = () => {
        setTransfers((current) => current.map((transfer) => transfer.status === 'Preparing' || transfer.status === 'Transferring' ? { ...transfer, status: 'Interrupted' } : transfer));
        setState('disconnected');
      };
      channel.onerror = () => setState('failed');
    };

    peer.onicecandidate = (event) => {
      if (event.candidate) nextSocket.emit('ice-candidate', event.candidate.toJSON());
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed') setState('failed');
      if (peer.connectionState === 'disconnected' || peer.connectionState === 'closed') {
        setState('disconnected');
      }
    };
    peer.ondatachannel = (event) => attachChannel(event.channel);
    if (isInitiator) attachChannel(peer.createDataChannel('droplink'));

    let hasConnected = false;
    nextSocket.on('connect', () => {
      if (hasConnected) {
        window.location.reload();
        return;
      }
      hasConnected = true;
      nextSocket.emit('join-room', { roomId, participantId, sessionToken });
    });
    nextSocket.on('connect_error', () => setState('reconnecting'));
    nextSocket.io.on('reconnect_attempt', () => setState('reconnecting'));
    nextSocket.io.on('reconnect_failed', () => setState('failed'));
    nextSocket.on('peer-ready', () => { if (isInitiator) void sendOffer(); });
    nextSocket.on('offer', async (description: SignalingDescription) => {
      await peer.setRemoteDescription(description);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      nextSocket.emit('answer', peer.localDescription);
    });
    nextSocket.on('answer', (description: SignalingDescription) => {
      void peer.setRemoteDescription(description);
    });
    nextSocket.on('ice-candidate', (candidate: IceCandidate) => {
      void peer.addIceCandidate(candidate);
    });
    nextSocket.on('peer-left', () => setState('disconnected'));
    nextSocket.on('disconnect', () => { setState('reconnecting'); peer.close(); });
    nextSocket.on('room-error', () => setState('failed'));
    nextSocket.connect();

    return () => {
      nextSocket.disconnect();
      peer.close();
      setSocket(null);
      setState('idle');
    };
  }, [isInitiator, participantId, roomId, sessionToken]);

  const sendText = (text: string) => {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== 'open') return false;
    const message: DataMessage = { type: 'text', id: crypto.randomUUID(), timestamp: Date.now(), text, sender: 'local' };
    channel.send(JSON.stringify(message));
    setMessages((current) => [...current, message]);
    return true;
  };

  const sendFile = async (file: File) => {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== 'open') return false;
    const fileId = crypto.randomUUID();
    const totalChunks = Math.ceil(file.size / FILE_CHUNK_SIZE);
    const metadata: FileStartMessage = { type: 'file-start', fileId, name: file.name, size: file.size, mimeType: file.type || 'application/octet-stream', totalChunks };
    setTransfers((current) => [...current, { id: fileId, name: file.name, size: file.size, transferred: 0, status: 'Preparing' }]);
    channel.send(JSON.stringify(metadata));
    channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LIMIT;
    for (let offset = 0; offset < file.size; offset += FILE_CHUNK_SIZE) {
      if (channel.readyState !== 'open') {
        setTransfers((current) => current.map((transfer) => transfer.id === fileId ? { ...transfer, status: 'Interrupted' } : transfer));
        return false;
      }
      while (channel.bufferedAmount > BUFFERED_AMOUNT_LIMIT) {
        await new Promise<void>((resolve) => {
          const resume = () => {
            channel.removeEventListener('bufferedamountlow', resume);
            resolve();
          };
          channel.addEventListener('bufferedamountlow', resume, { once: true });
          window.setTimeout(resume, 1000);
        });
        if (channel.readyState !== 'open') {
          setTransfers((current) => current.map((transfer) => transfer.id === fileId ? { ...transfer, status: 'Interrupted' } : transfer));
          return false;
        }
      }
      try {
        channel.send(await file.slice(offset, offset + FILE_CHUNK_SIZE).arrayBuffer());
      } catch {
        setTransfers((current) => current.map((transfer) => transfer.id === fileId ? { ...transfer, status: 'Interrupted' } : transfer));
        return false;
      }
      setTransfers((current) => current.map((transfer) => transfer.id === fileId ? { ...transfer, transferred: Math.min(offset + FILE_CHUNK_SIZE, file.size), status: 'Transferring' } : transfer));
    }
    try {
      channel.send(JSON.stringify({ type: 'file-complete', fileId } satisfies FileCompleteMessage));
    } catch {
      setTransfers((current) => current.map((transfer) => transfer.id === fileId ? { ...transfer, status: 'Interrupted' } : transfer));
      return false;
    }
    setTransfers((current) => current.map((transfer) => transfer.id === fileId ? { ...transfer, transferred: file.size, status: 'Completed' } : transfer));
    return true;
  };

  return { state, socket, dataChannel: channelRef.current, messages, receivedFiles, transfers, sendText, sendFile };
}
