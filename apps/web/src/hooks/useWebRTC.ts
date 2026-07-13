import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type {
  SessionJoinPayload,
  PeerPresencePayload,
  PeerRole,
  SignalingPayload,
  RoomSyncPayload,
  JoinRejectedPayload,
  NegotiationStage,
} from 'shared-types';
import { createSignalingSocket, loadSystemConfig, loadUserConfig } from '../lib/signaling-client';
import { getDeviceName } from '../lib/device-identity';
import { generateSessionId } from '../lib/session-id';

export type WebRtcStage = NegotiationStage;
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
const MAX_STAGE_HISTORY_ENTRIES = 50;

export interface RemotePeerInfo {
  peerId: string;
  role: PeerRole;
}

export interface StageTransition {
  stage: WebRtcStage;
  detail?: string;
  timestamp: number;
}

interface UseWebRtcOptions {
  signalingUrl: string;
  roomId: string;
  otp: string;
  role: PeerRole;
  isInitiator: boolean;
  localStream?: MediaStream | null;
  readyToJoin?: boolean;
}

type StageListener = (stage: WebRtcStage, detail?: string) => void;
type RemoteStreamListener = (stream: MediaStream | null) => void;
type RemotePeerListener = (peer: RemotePeerInfo | null) => void;
type StageHistoryListener = (history: StageTransition[]) => void;

interface ConnectionHandle {
  sessionId: string;
  socket: Socket;
  peer: RTCPeerConnection;
  stageListeners: Set<StageListener>;
  streamListeners: Set<RemoteStreamListener>;
  peerListeners: Set<RemotePeerListener>;
  stageHistoryListeners: Set<StageHistoryListener>;
  currentStage: WebRtcStage;
  currentRemoteStream: MediaStream | null;
  currentRemotePeer: RemotePeerInfo | null;
  stageHistory: StageTransition[];
  refCount: number;
  hasSentOffer: boolean;
  waitingForPeerTimer: ReturnType<typeof setTimeout> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  teardown: () => void;
}

const activeConnections = new Map<string, ConnectionHandle>();

function connectionKey(roomId: string, role: PeerRole): string {
  return `${roomId}::${role}`;
}

function logStage(role: PeerRole, roomId: string, sessionId: string, stage: WebRtcStage, detail?: string): void {
  const suffix = detail ? ` (${detail})` : '';
  console.log(`[WEBRTC][${role}][${roomId || 'no-room'}][session:${sessionId.slice(0, 8)}] stage -> ${stage}${suffix}`);
}

function logWarn(role: PeerRole, roomId: string, sessionId: string, message: string): void {
  console.warn(`[WEBRTC][${role}][${roomId || 'no-room'}][session:${sessionId.slice(0, 8)}] ${message}`);
}

function appendStageHistory(handle: ConnectionHandle, stage: WebRtcStage, detail?: string): void {
  const transition: StageTransition = { stage, detail, timestamp: Date.now() };
  handle.stageHistory = [...handle.stageHistory, transition].slice(-MAX_STAGE_HISTORY_ENTRIES);
  handle.stageHistoryListeners.forEach((listener) => listener(handle.stageHistory));
}

function setHandleStage(handle: ConnectionHandle, role: PeerRole, roomId: string, stage: WebRtcStage, detail?: string): void {
  handle.currentStage = stage;
  logStage(role, roomId, handle.sessionId, stage, detail);
  appendStageHistory(handle, stage, detail);
  handle.stageListeners.forEach((listener) => listener(stage, detail));
}

function setHandleRemoteStream(handle: ConnectionHandle, stream: MediaStream | null): void {
  handle.currentRemoteStream = stream;
  handle.streamListeners.forEach((listener) => listener(stream));
}

function setHandleRemotePeer(handle: ConnectionHandle, peer: RemotePeerInfo | null): void {
  handle.currentRemotePeer = peer;
  handle.peerListeners.forEach((listener) => listener(peer));
}

function clearWaitingForPeerTimer(handle: ConnectionHandle): void {
  if (handle.waitingForPeerTimer) {
    clearTimeout(handle.waitingForPeerTimer);
    handle.waitingForPeerTimer = null;
  }
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

async function sendOffer(peer: RTCPeerConnection, socket: Socket, roomId: string, role: PeerRole, sessionId: string): Promise<void> {
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
  logStage(role, roomId, sessionId, 'negotiating', 'offer sent');
}

async function handleIncomingSignal(
  peer: RTCPeerConnection,
  socket: Socket,
  roomId: string,
  role: PeerRole,
  sessionId: string,
  payload: SignalingPayload,
): Promise<void> {
  if (payload.type === 'candidate') {
    await peer.addIceCandidate(payload.data as RTCIceCandidateInit);
    return;
  }
  if (payload.type === 'offer') {
    logStage(role, roomId, sessionId, 'negotiating', 'offer received');
    await peer.setRemoteDescription(payload.data as RTCSessionDescriptionInit);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    const response: SignalingPayload = { roomId, senderId: socket.id ?? 'unknown', targetId: 'peer', type: 'answer', data: answer };
    socket.emit('signal', response);
    logStage(role, roomId, sessionId, 'negotiating', 'answer sent');
    return;
  }
  if (payload.type === 'answer') {
    logStage(role, roomId, sessionId, 'negotiating', 'answer received');
    await peer.setRemoteDescription(payload.data as RTCSessionDescriptionInit);
  }
}

function describeJoinRejection(reason: JoinRejectedPayload['reason']): string {
  switch (reason) {
    case 'otp_invalid':
      return 'pairing code was rejected by the server (invalid)';
    case 'otp_expired':
      return 'pairing code expired before the connection completed';
    case 'room_full':
      return 'room already has two devices connected';
    case 'malformed_payload':
      return 'client sent a malformed join request (internal bug)';
    default:
      return `join rejected: ${reason}`;
  }
}

function createConnection(
  key: string,
  sessionId: string,
  signalingUrl: string,
  roomId: string,
  otp: string,
  role: PeerRole,
  isInitiator: boolean,
  localStream: MediaStream | null | undefined,
): ConnectionHandle {
  let isTornDown = false;

  const handle: ConnectionHandle = {
    sessionId,
    socket: null as unknown as Socket,
    peer: null as unknown as RTCPeerConnection,
    stageListeners: new Set(),
    streamListeners: new Set(),
    peerListeners: new Set(),
    stageHistoryListeners: new Set(),
    currentStage: 'idle',
    currentRemoteStream: null,
    currentRemotePeer: null,
    stageHistory: [],
    refCount: 0,
    hasSentOffer: false,
    waitingForPeerTimer: null,
    reconnectTimer: null,
    teardown: () => {},
  };

  function stageIfActive(stage: WebRtcStage, detail?: string) {
    if (isTornDown) return;
    setHandleStage(handle, role, roomId, stage, detail);
  }

  async function trySendOfferOnce(peer: RTCPeerConnection, socket: Socket) {
    if (!isInitiator || handle.hasSentOffer || isTornDown) return;
    handle.hasSentOffer = true;
    await sendOffer(peer, socket, roomId, role, sessionId);
  }

  async function connect() {
    stageIfActive('loadingConfig');
    const [systemConfig, userConfig] = await Promise.all([loadSystemConfig(signalingUrl), loadUserConfig(signalingUrl)]);
    if (isTornDown) return;

    stageIfActive('connectingSocket');
    const socket = createSignalingSocket(signalingUrl);
    handle.socket = socket;
    const peer = new RTCPeerConnection({ iceServers: systemConfig.ice_servers });
    handle.peer = peer;
    handle.hasSentOffer = false;

    localStream?.getTracks().forEach((track) => peer.addTrack(track, localStream));
    attachIceHandler(peer, socket, roomId);

    peer.ontrack = (event) => {
      setHandleRemoteStream(handle, event.streams[0] ?? null);
      logStage(role, roomId, sessionId, 'negotiating', 'remote track received');
    };
    peer.oniceconnectionstatechange = () => {
      const iceState = peer.iceConnectionState;
      logStage(role, roomId, sessionId, 'negotiating', `ice: ${iceState}`);
      if (iceState === 'failed') {
        stageIfActive('failed', 'ICE connection failed');
      }
    };
    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;
      logStage(role, roomId, sessionId, 'negotiating', `peer connection: ${state}`);
      if (state === 'connected') {
        clearWaitingForPeerTimer(handle);
        stageIfActive('connected');
      } else if (state === 'failed') {
        stageIfActive('failed', 'RTCPeerConnection reported failed');
        if (userConfig.enable_reconnection_loop && !isTornDown) {
          handle.reconnectTimer = setTimeout(connect, userConfig.reconnection_interval_ms);
        }
      }
    };

    socket.on('connect_error', (connectError) => {
      logWarn(role, roomId, sessionId, `socket connect_error: ${connectError.message}`);
      stageIfActive('socketError', connectError.message);
    });

    socket.on('join-rejected', (payload: JoinRejectedPayload) => {
      if (payload.roomId !== roomId) return;
      const detail = describeJoinRejection(payload.reason);
      logWarn(role, roomId, sessionId, `join-room rejected: ${detail}`);
      stageIfActive('failed', detail);
    });

    socket.on('room-sync', (payload: RoomSyncPayload) => {
      if (payload.roomId !== roomId) return;
      logStage(role, roomId, sessionId, 'joiningRoom', `room-sync received, ${payload.peers.length} other peer(s)`);
      const firstPeer = payload.peers[0];
      if (firstPeer) {
        clearWaitingForPeerTimer(handle);
        setHandleRemotePeer(handle, { peerId: firstPeer.peerId, role: firstPeer.role });
        stageIfActive('negotiating', `peer ${firstPeer.peerId} (${firstPeer.role}) present via room-sync`);
        trySendOfferOnce(peer, socket).catch((offerError) => {
          logWarn(role, roomId, sessionId, `failed to send offer after room-sync: ${String(offerError)}`);
        });
      } else if (handle.currentStage !== 'connected' && handle.currentStage !== 'negotiating') {
        stageIfActive('waitingForPeer');
      }
    });

    socket.on('peer-joined', (payload: PeerPresencePayload) => {
      if (payload.roomId !== roomId) return;
      setHandleRemotePeer(handle, { peerId: payload.peerId, role: payload.role });
      clearWaitingForPeerTimer(handle);
      stageIfActive('negotiating', `peer ${payload.peerId} (${payload.role}) present`);
      trySendOfferOnce(peer, socket).catch((offerError) => {
        logWarn(role, roomId, sessionId, `failed to send offer after peer join: ${String(offerError)}`);
      });
    });
    socket.on('peer-left', (payload: { roomId: string; peerId: string }) => {
      if (payload.roomId !== roomId) return;
      setHandleRemotePeer(handle, null);
      stageIfActive('peerLeft');
    });
    socket.on('peer-disconnected-by-remote', (payload: { roomId: string }) => {
      if (payload.roomId !== roomId) return;
      setHandleRemotePeer(handle, null);
      stageIfActive('peerLeft', 'remote disconnected explicitly');
    });
    socket.on('signal', (payload: SignalingPayload) => {
      handleIncomingSignal(peer, socket, roomId, role, sessionId, payload).catch((signalError) => {
        logWarn(role, roomId, sessionId, `failed to handle incoming signal (${payload.type}): ${String(signalError)}`);
      });
    });

    stageIfActive('joiningRoom');
    const joinPayload: SessionJoinPayload = { roomId, passkey: otp, role, deviceName: getDeviceName(), sessionId };
    socket.emit('join-room', joinPayload);

    stageIfActive('waitingForPeer');
    handle.waitingForPeerTimer = setTimeout(() => {
      if (isTornDown) return;
      logWarn(role, roomId, sessionId, `no peer joined within ${WAITING_FOR_PEER_TIMEOUT_MS}ms of joining the room`);
      stageIfActive('failed', 'timed out waiting for the other device');
    }, WAITING_FOR_PEER_TIMEOUT_MS);
  }

  handle.teardown = () => {
    if (isTornDown) return;
    isTornDown = true;
    if (handle.reconnectTimer) clearTimeout(handle.reconnectTimer);
    clearWaitingForPeerTimer(handle);
    handle.peer?.close();
    handle.socket?.disconnect();
    activeConnections.delete(key);
  };

  connect().catch((connectError) => {
    logWarn(role, roomId, sessionId, `connect() failed: ${String(connectError)}`);
    stageIfActive('failed', 'unexpected error during connection setup');
  });

  return handle;
}

export function useWebRtc({ signalingUrl, roomId, otp, role, isInitiator, localStream, readyToJoin = true }: UseWebRtcOptions) {
  const [stage, setStage] = useState<WebRtcStage>('idle');
  const [stageDetail, setStageDetail] = useState<string | undefined>(undefined);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remotePeer, setRemotePeer] = useState<RemotePeerInfo | null>(null);
  const [stageHistory, setStageHistory] = useState<StageTransition[]>([]);
  const handleRef = useRef<ConnectionHandle | null>(null);
  const keyRef = useRef<string | null>(null);
  const signalingUrlRef = useRef(signalingUrl);
  signalingUrlRef.current = signalingUrl;

  useEffect(() => {
    if (!readyToJoin || !roomId || !otp) {
      return;
    }

    const key = connectionKey(roomId, role);
    let handle = activeConnections.get(key);

    if (!handle) {
      const sessionId = generateSessionId();
      handle = createConnection(key, sessionId, signalingUrlRef.current, roomId, otp, role, isInitiator, localStream);
      activeConnections.set(key, handle);
    }

    handle.refCount += 1;
    handleRef.current = handle;
    keyRef.current = key;

    const stageListener: StageListener = (nextStage, detail) => {
      setStage(nextStage);
      setStageDetail(detail);
    };
    const streamListener: RemoteStreamListener = (stream) => setRemoteStream(stream);
    const peerListener: RemotePeerListener = (peer) => setRemotePeer(peer);
    const stageHistoryListener: StageHistoryListener = (history) => setStageHistory(history);

    handle.stageListeners.add(stageListener);
    handle.streamListeners.add(streamListener);
    handle.peerListeners.add(peerListener);
    handle.stageHistoryListeners.add(stageHistoryListener);

    setStage(handle.currentStage);
    setStageDetail(undefined);
    setRemoteStream(handle.currentRemoteStream);
    setRemotePeer(handle.currentRemotePeer);
    setStageHistory(handle.stageHistory);

    return () => {
      handle!.stageListeners.delete(stageListener);
      handle!.streamListeners.delete(streamListener);
      handle!.peerListeners.delete(peerListener);
      handle!.stageHistoryListeners.delete(stageHistoryListener);
      handle!.refCount -= 1;

      if (handle!.refCount <= 0) {
        const teardownTimer = setTimeout(() => {
          if (handle!.refCount <= 0) {
            handle!.teardown();
          }
        }, 250);
        void teardownTimer;
      }
    };
  }, [signalingUrl, roomId, otp, role, isInitiator, localStream, readyToJoin]);

  function disconnect() {
    const handle = handleRef.current;
    const key = keyRef.current;
    if (!handle || !key) return;
    handle.socket?.emit('disconnect-peer', { roomId });
    handle.teardown();
    setStage('idle');
    setRemoteStream(null);
    setRemotePeer(null);
  }

  return {
    stage,
    stageDetail,
    connectionState: STAGE_TO_CONNECTION_STATE[stage],
    remoteStream,
    remotePeer,
    stageHistory,
    disconnect,
    peer: handleRef.current?.peer ?? null,
    socket: handleRef.current?.socket ?? null,
  };
}
