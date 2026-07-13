import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { PairingPayload, PeerPresencePayload, PeerRole, SignalingPayload } from 'shared-types';
import { createSignalingSocket, loadSystemConfig, loadUserConfig } from '../lib/signaling-client';
import { getDeviceName } from '../lib/device-identity';

export type WebRtcStage =
  | 'idle'
  | 'loadingConfig'
  | 'connectingSocket'
  | 'joiningRoom'
  | 'waitingForPeer'
  | 'negotiating'
  | 'connected'
  | 'peerLeft'
  | 'socketError'
  | 'failed';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed';

const STAGE_TO_CONNECTION_STATE: Record<WebRtcStage, ConnectionState> = {
  idle: 'idle',
  loadingConfig: 'connecting',
  connectingSocket: 'connecting',
  joiningRoom: 'connecting',
  waitingForPeer: 'connecting',
  negotiating: 'connecting',
  connected: 'connected',
  peerLeft: 'disconnected',
  socketError: 'failed',
  failed: 'failed',
};

const WAITING_FOR_PEER_TIMEOUT_MS = 30_000;

interface UseWebRtcOptions {
  signalingUrl: string;
  roomId: string;
  otp: string;
  role: PeerRole;
  isInitiator: boolean;
  localStream?: MediaStream | null;
  readyToJoin?: boolean;
}

export interface RemotePeerInfo {
  peerId: string;
  role: PeerRole;
}

function logStage(role: PeerRole, roomId: string, stage: WebRtcStage, detail?: string): void {
  const suffix = detail ? ` (${detail})` : '';
  console.log(`[WEBRTC][${role}][${roomId || 'no-room'}] stage -> ${stage}${suffix}`);
}

function logWarn(role: PeerRole, roomId: string, message: string): void {
  console.warn(`[WEBRTC][${role}][${roomId || 'no-room'}] ${message}`);
}

function createPeerConnection(iceServers: RTCIceServer[]): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers });
}

function attachIceHandler(peer: RTCPeerConnection, socket: Socket, roomId: string, role: PeerRole): void {
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

async function sendOffer(peer: RTCPeerConnection, socket: Socket, roomId: string, role: PeerRole): Promise<void> {
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
  logStage(role, roomId, 'negotiating', 'offer sent');
}

async function handleIncomingSignal(
  peer: RTCPeerConnection,
  socket: Socket,
  roomId: string,
  role: PeerRole,
  payload: SignalingPayload,
): Promise<void> {
  if (payload.type === 'candidate') {
    await peer.addIceCandidate(payload.data as RTCIceCandidateInit);
    return;
  }
  if (payload.type === 'offer') {
    logStage(role, roomId, 'negotiating', 'offer received');
    await peer.setRemoteDescription(payload.data as RTCSessionDescriptionInit);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    const response: SignalingPayload = { roomId, senderId: socket.id ?? 'unknown', targetId: 'peer', type: 'answer', data: answer };
    socket.emit('signal', response);
    logStage(role, roomId, 'negotiating', 'answer sent');
    return;
  }
  if (payload.type === 'answer') {
    logStage(role, roomId, 'negotiating', 'answer received');
    await peer.setRemoteDescription(payload.data as RTCSessionDescriptionInit);
  }
}

export function useWebRtc({ signalingUrl, roomId, otp, role, isInitiator, localStream, readyToJoin = true }: UseWebRtcOptions) {
  const [stage, setStage] = useState<WebRtcStage>('idle');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remotePeer, setRemotePeer] = useState<RemotePeerInfo | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!readyToJoin) {
      return;
    }

    let isCancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let waitingForPeerTimer: ReturnType<typeof setTimeout> | null = null;
    let hasSentOffer = false;

    function setStageIfActive(nextStage: WebRtcStage, detail?: string) {
      if (isCancelled) return;
      setStage(nextStage);
      logStage(role, roomId, nextStage, detail);
    }

    function clearWaitingForPeerTimer() {
      if (waitingForPeerTimer) {
        clearTimeout(waitingForPeerTimer);
        waitingForPeerTimer = null;
      }
    }

    async function trySendOfferOnce(peer: RTCPeerConnection, socket: Socket) {
      if (!isInitiator || hasSentOffer || isCancelled) return;
      hasSentOffer = true;
      await sendOffer(peer, socket, roomId, role);
    }

    async function connect() {
      setStageIfActive('loadingConfig');
      const [systemConfig, userConfig] = await Promise.all([
        loadSystemConfig(signalingUrl),
        loadUserConfig(signalingUrl),
      ]);
      if (isCancelled) return;

      setStageIfActive('connectingSocket');
      const socket = createSignalingSocket(signalingUrl);
      socketRef.current = socket;
      const peer = createPeerConnection(systemConfig.ice_servers);
      peerRef.current = peer;
      hasSentOffer = false;

      localStream?.getTracks().forEach((track) => peer.addTrack(track, localStream));
      attachIceHandler(peer, socket, roomId, role);
      peer.ontrack = (event) => {
        setRemoteStream(event.streams[0] ?? null);
        logStage(role, roomId, 'negotiating', 'remote track received');
      };
      peer.oniceconnectionstatechange = () => {
        const iceState = peer.iceConnectionState;
        logStage(role, roomId, 'negotiating', `ice: ${iceState}`);
        if (iceState === 'failed') {
          setStageIfActive('failed', 'ICE connection failed');
        }
      };
      peer.onconnectionstatechange = () => {
        const state = peer.connectionState;
        logStage(role, roomId, 'negotiating', `peer connection: ${state}`);
        if (state === 'connected') {
          clearWaitingForPeerTimer();
          setStageIfActive('connected');
        } else if (state === 'failed') {
          setStageIfActive('failed', 'RTCPeerConnection reported failed');
          if (userConfig.enable_reconnection_loop && !isCancelled) {
            reconnectTimer = setTimeout(connect, userConfig.reconnection_interval_ms);
          }
        }
      };

      socket.on('connect_error', (connectError) => {
        logWarn(role, roomId, `socket connect_error: ${connectError.message}`);
        setStageIfActive('socketError', connectError.message);
      });

      socket.on('peer-joined', (payload: PeerPresencePayload) => {
        if (payload.roomId !== roomId) return;
        setRemotePeer({ peerId: payload.peerId, role: payload.role });
        clearWaitingForPeerTimer();
        setStageIfActive('negotiating', `peer ${payload.peerId} (${payload.role}) present`);
        trySendOfferOnce(peer, socket).catch((offerError) => {
          logWarn(role, roomId, `failed to send offer after peer join: ${String(offerError)}`);
        });
      });
      socket.on('peer-left', (payload: { roomId: string; peerId: string }) => {
        if (payload.roomId !== roomId) return;
        setRemotePeer(null);
        setStageIfActive('peerLeft');
      });
      socket.on('peer-disconnected-by-remote', (payload: { roomId: string }) => {
        if (payload.roomId !== roomId) return;
        setRemotePeer(null);
        setStageIfActive('peerLeft', 'remote disconnected explicitly');
      });
      socket.on('signal', (payload: SignalingPayload) => {
        handleIncomingSignal(peer, socket, roomId, role, payload).catch((signalError) => {
          logWarn(role, roomId, `failed to handle incoming signal (${payload.type}): ${String(signalError)}`);
        });
      });

      setStageIfActive('joiningRoom');
      const pairingPayload: PairingPayload = { roomId, passkey: otp, role, deviceName: getDeviceName() };
      socket.emit('join-room', pairingPayload);

      setStageIfActive('waitingForPeer');
      waitingForPeerTimer = setTimeout(() => {
        if (isCancelled) return;
        logWarn(role, roomId, `no peer joined within ${WAITING_FOR_PEER_TIMEOUT_MS}ms of joining the room`);
        setStageIfActive('failed', 'timed out waiting for the other device');
      }, WAITING_FOR_PEER_TIMEOUT_MS);
    }

    const startupTimer = setTimeout(() => {
      if (isCancelled) return;
      connect();
    }, 0);

    return () => {
      isCancelled = true;
      clearTimeout(startupTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearWaitingForPeerTimer();
      peerRef.current?.close();
      socketRef.current?.disconnect();
    };
  }, [signalingUrl, roomId, otp, role, isInitiator, localStream, readyToJoin]);

  const disconnect = useCallback(() => {
    socketRef.current?.emit('disconnect-peer', { roomId });
    peerRef.current?.close();
    socketRef.current?.disconnect();
    setStage('idle');
    setRemoteStream(null);
    setRemotePeer(null);
  }, [roomId]);

  return {
    stage,
    connectionState: STAGE_TO_CONNECTION_STATE[stage],
    remoteStream,
    remotePeer,
    disconnect,
    peer: peerRef.current,
    socket: socketRef.current,
  };
}
