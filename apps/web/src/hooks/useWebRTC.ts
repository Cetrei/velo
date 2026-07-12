import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { PairingPayload, SignalingPayload } from 'shared-types';
import { createSignalingSocket, loadSystemConfig, loadUserConfig } from '../lib/signaling-client';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed';

interface UseWebRtcOptions {
  signalingUrl: string;
  roomId: string;
  otp: string;
  isInitiator: boolean;
  localStream?: MediaStream | null;
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

export function useWebRtc({ signalingUrl, roomId, otp, isInitiator, localStream }: UseWebRtcOptions) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
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
      socket.on('signal', (payload: SignalingPayload) => handleIncomingSignal(peer, socket, roomId, payload));
      const pairingPayload: PairingPayload = { roomId, passkey: otp };
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
  }, [signalingUrl, roomId, otp, isInitiator, localStream]);

  return { connectionState, remoteStream, peer: peerRef.current, socket: socketRef.current };
}
