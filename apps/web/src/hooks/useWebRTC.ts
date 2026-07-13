import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { PairingPayload, PeerPresencePayload, PeerRole, SignalingPayload } from 'shared-types';
import { createSignalingSocket, loadSystemConfig, loadUserConfig } from '../lib/signaling-client';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed';

interface UseWebRtcOptions {
  signalingUrl: string;
  roomId: string;
  otp: string;
  role: PeerRole;
  isInitiator: boolean;
  localStream?: MediaStream | null;
}

export interface RemotePeerInfo {
  peerId: string;
  role: PeerRole;
}

function createPeerConnection(iceServers: RTCIceServer[]): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers });
}

function attachIceHandler(peer: RTCPeerConnection, socket: Socket, roomId: string): void {
  peer.onicecandidate = (event) => {
    if (!event.candidate) return;
    const payload: SignalingPayload = {
      roomId,
      senderId: socket.id ?? 'unknown',
      targetId: 'peer',
      type: 'candidate',
      data: event.candidate.toJSON(),
    };
    socket.emit('signal', payload);
  };
}

async function sendOffer(peer: RTCPeerConnection, socket: Socket, roomId: string): Promise<void> {
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  const payload: SignalingPayload = {
    roomId,
    senderId: socket.id ?? 'unknown',
    targetId: 'peer',
    type: 'offer',
    data: offer,
  };
  socket.emit('signal', payload);
}

async function handleIncomingSignal(peer: RTCPeerConnection, socket: Socket, roomId: string, payload: SignalingPayload): Promise<void> {
  if (payload.type === 'candidate') {
    await peer.addIceCandidate(payload.data as RTCIceCandidateInit);
    return;
  }
  if (payload.type === 'offer') {
    await peer.setRemoteDescription(payload.data as RTCSessionDescriptionInit);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    const response: SignalingPayload = { roomId, senderId: socket.id ?? 'unknown', targetId: 'peer', type: 'answer', data: answer };
    socket.emit('signal', response);
    return;
  }
  if (payload.type === 'answer') {
    await peer.setRemoteDescription(payload.data as RTCSessionDescriptionInit);
  }
}

function attachPresenceHandlers(
  socket: Socket,
  roomId: string,
  setRemotePeer: (peer: RemotePeerInfo | null) => void,
): void {
  socket.on('peer-joined', (payload: PeerPresencePayload) => {
    if (payload.roomId !== roomId) return;
    setRemotePeer({ peerId: payload.peerId, role: payload.role });
  });
  socket.on('peer-left', (payload: { roomId: string; peerId: string }) => {
    if (payload.roomId !== roomId) return;
    setRemotePeer(null);
  });
  socket.on('peer-disconnected-by-remote', (payload: { roomId: string }) => {
    if (payload.roomId !== roomId) return;
    setRemotePeer(null);
  });
}

export function useWebRtc({ signalingUrl, roomId, otp, role, isInitiator, localStream }: UseWebRtcOptions) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remotePeer, setRemotePeer] = useState<RemotePeerInfo | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let isCancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    async function connect() {
      const [systemConfig, userConfig] = await Promise.all([
        loadSystemConfig(signalingUrl),
        loadUserConfig(signalingUrl),
      ]);
      if (isCancelled) return;

      const socket = createSignalingSocket(signalingUrl);
      socketRef.current = socket;
      const peer = createPeerConnection(systemConfig.ice_servers);
      peerRef.current = peer;

      localStream?.getTracks().forEach((track) => peer.addTrack(track, localStream));
      peer.ontrack = (event) => setRemoteStream(event.streams[0] ?? null);
      peer.onconnectionstatechange = () => {
        const state = peer.connectionState;
        setConnectionState(state === 'connected' ? 'connected' : state === 'failed' ? 'failed' : 'disconnected');
        if ((state === 'failed' || state === 'disconnected') && userConfig.enable_reconnection_loop && !isCancelled) {
          reconnectTimer = setTimeout(connect, userConfig.reconnection_interval_ms);
        }
      };

      attachIceHandler(peer, socket, roomId);
      attachPresenceHandlers(socket, roomId, setRemotePeer);
      socket.on('signal', (payload: SignalingPayload) => handleIncomingSignal(peer, socket, roomId, payload));
      const pairingPayload: PairingPayload = { roomId, passkey: otp, role };
      socket.emit('join-room', pairingPayload);
      setConnectionState('connecting');

      if (isInitiator) {
        await sendOffer(peer, socket, roomId);
      }
    }

    connect();

    return () => {
      isCancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      peerRef.current?.close();
      socketRef.current?.disconnect();
    };
  }, [signalingUrl, roomId, otp, role, isInitiator, localStream]);

  const disconnect = useCallback(() => {
    socketRef.current?.emit('disconnect-peer', { roomId });
    peerRef.current?.close();
    socketRef.current?.disconnect();
    setConnectionState('disconnected');
    setRemoteStream(null);
    setRemotePeer(null);
  }, [roomId]);

  return {
    connectionState,
    remoteStream,
    remotePeer,
    disconnect,
    peer: peerRef.current,
    socket: socketRef.current,
  };
}
