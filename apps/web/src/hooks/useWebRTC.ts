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
  ConnectionConfig,
  RelayFrameMetadata,
} from 'shared-types';
import { createSignalingSocket, loadIceServers, loadUserConfig } from '../lib/signaling-client';
import { getDeviceName } from '../lib/device-identity';
import { generateSessionId } from '../lib/session-id';
import { captureJpegFrame, drawJpegFrameToCanvas } from '../lib/frame-relay';

const RELAY_FRAME_INTERVAL_MS = 1000 / 30;

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

export interface RemotePeerInfo {
  peerId: string;
  role: PeerRole;
  deviceName: string;
}

interface UseWebRtcOptions {
  signalingUrl: string;
  roomId: string;
  otp: string;
  role: PeerRole;
  isInitiator: boolean;
  localStream?: MediaStream | null;
  readyToJoin?: boolean;
  connectionMode?: ConnectionConfig['mode'];
  connectionConfig?: ConnectionConfig;
}

type StageListener = (stage: WebRtcStage, detail?: string) => void;
type RemoteStreamListener = (stream: MediaStream | null) => void;
type RemotePeerListener = (peer: RemotePeerInfo | null) => void;

interface ConnectionHandle {
  sessionId: string;
  socket: Socket;
  peer: RTCPeerConnection | null;
  stageListeners: Set<StageListener>;
  streamListeners: Set<RemoteStreamListener>;
  peerListeners: Set<RemotePeerListener>;
  currentStage: WebRtcStage;
  currentRemoteStream: MediaStream | null;
  currentRemotePeer: RemotePeerInfo | null;
  refCount: number;
  hasSentOffer: boolean;
  waitingForPeerTimer: ReturnType<typeof setTimeout> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  relayFrameTimer: ReturnType<typeof setInterval> | null;
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

function setHandleStage(handle: ConnectionHandle, role: PeerRole, roomId: string, stage: WebRtcStage, detail?: string): void {
  handle.currentStage = stage;
  logStage(role, roomId, handle.sessionId, stage, detail);
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

const ICE_CANDIDATE_TYPE_LABELS: Record<string, string> = {
  host: 'direct (same network)',
  srflx: 'STUN reflexive (public IP behind NAT)',
  prflx: 'peer reflexive (discovered during negotiation)',
  relay: 'TURN relay',
};

function describeCandidateType(candidateType: string | undefined): string {
  if (!candidateType) return 'unknown';
  return ICE_CANDIDATE_TYPE_LABELS[candidateType] ?? candidateType;
}

interface IceCandidateStatsShape extends RTCStats {
  candidateType?: string;
}

async function reportIceFailureDiagnostics(
  peer: RTCPeerConnection,
  role: PeerRole,
  roomId: string,
  sessionId: string,
): Promise<void> {
  const stats = await peer.getStats();
  const localCandidates = new Map<string, IceCandidateStatsShape>();
  const remoteCandidates = new Map<string, IceCandidateStatsShape>();
  const candidatePairs: RTCIceCandidatePairStats[] = [];

  stats.forEach((report) => {
    if (report.type === 'local-candidate') localCandidates.set(report.id, report as IceCandidateStatsShape);
    if (report.type === 'remote-candidate') remoteCandidates.set(report.id, report as IceCandidateStatsShape);
    if (report.type === 'candidate-pair') candidatePairs.push(report as RTCIceCandidatePairStats);
  });

  if (candidatePairs.length === 0) {
    logWarn(role, roomId, sessionId, '[ICE_DIAGNOSTICS] no candidate pairs were ever formed, ICE gathering likely produced zero usable candidates on one side');
    return;
  }

  candidatePairs.forEach((pair) => {
    const local = localCandidates.get(pair.localCandidateId ?? '');
    const remote = remoteCandidates.get(pair.remoteCandidateId ?? '');
    const localType = describeCandidateType(local?.candidateType);
    const remoteType = describeCandidateType(remote?.candidateType);
    logWarn(
      role,
      roomId,
      sessionId,
      `[ICE_DIAGNOSTICS] pair state=${pair.state} local=${localType} remote=${remoteType} nominated=${Boolean(pair.nominated)}`,
    );
  });

  const everHadRelayCandidate = Array.from(localCandidates.values()).some((candidate) => candidate.candidateType === 'relay');
  if (!everHadRelayCandidate) {
    logWarn(
      role,
      roomId,
      sessionId,
      '[ICE_DIAGNOSTICS] no relay (TURN) candidate was ever gathered, only STUN/host candidates were tried, this connection has no fallback for symmetric NAT',
    );
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

function mergeUserTurnServer(iceServers: RTCIceServer[], connectionConfig: ConnectionConfig | undefined): RTCIceServer[] {
  const userTurn = connectionConfig?.stun_p2p.turn;
  if (!userTurn || !userTurn.url) return iceServers;

  return [...iceServers, { urls: userTurn.url, username: userTurn.username, credential: userTurn.credential }];
}

function startRelayFrameLoop(
  handle: ConnectionHandle,
  socket: Socket,
  roomId: string,
  localStream: MediaStream | null | undefined,
): void {
  if (!localStream) return;

  const sourceVideo = document.createElement('video');
  sourceVideo.srcObject = localStream;
  sourceVideo.muted = true;
  sourceVideo.play().catch(() => {});

  const captureCanvas = document.createElement('canvas');

  handle.relayFrameTimer = setInterval(() => {
    captureJpegFrame(sourceVideo, captureCanvas)
      .then((frame) => {
        if (!frame) return;
        const metadata: RelayFrameMetadata = { roomId, width: frame.width, height: frame.height };
        socket.emit('relay-frame', metadata, frame.bytes);
      })
      .catch(() => {});
  }, RELAY_FRAME_INTERVAL_MS);
}

function attachRelayFrameReceiver(handle: ConnectionHandle, socket: Socket, roomId: string): void {
  const receiveCanvas = document.createElement('canvas');
  let syntheticStream: MediaStream | null = null;

  socket.on('relay-frame', (metadata: RelayFrameMetadata, bytes: ArrayBuffer) => {
    if (metadata.roomId !== roomId) return;

    drawJpegFrameToCanvas(receiveCanvas, bytes)
      .then(() => {
        if (!syntheticStream) {
          syntheticStream = receiveCanvas.captureStream(30);
          setHandleRemoteStream(handle, syntheticStream);
        }
      })
      .catch(() => {});
  });
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
  connectionMode: ConnectionConfig['mode'],
  connectionConfig: ConnectionConfig | undefined,
): ConnectionHandle {
  let isTornDown = false;

  const handle: ConnectionHandle = {
    sessionId,
    socket: null as unknown as Socket,
    peer: null,
    stageListeners: new Set(),
    streamListeners: new Set(),
    peerListeners: new Set(),
    currentStage: 'idle',
    currentRemoteStream: null,
    currentRemotePeer: null,
    refCount: 0,
    hasSentOffer: false,
    waitingForPeerTimer: null,
    reconnectTimer: null,
    relayFrameTimer: null,
    teardown: () => {},
  };

  function stageIfActive(stage: WebRtcStage, detail?: string) {
    if (isTornDown) return;
    setHandleStage(handle, role, roomId, stage, detail);
  }

  function teardownActiveSocketAndPeer(): void {
    if (handle.relayFrameTimer) {
      clearInterval(handle.relayFrameTimer);
      handle.relayFrameTimer = null;
    }
    handle.peer?.close();
    handle.socket?.disconnect();
  }

  async function trySendOfferOnce(peer: RTCPeerConnection | null, socket: Socket) {
    if (!peer || !isInitiator || handle.hasSentOffer || isTornDown) return;
    handle.hasSentOffer = true;
    await sendOffer(peer, socket, roomId, role, sessionId);
  }

  function markConnectedInRelayModeIfPeerPresent(): void {
    if (connectionMode !== 'cloudflare_relay' || isTornDown) return;
    clearWaitingForPeerTimer(handle);
    stageIfActive('connected');
  }

  function setUpPeerConnectionTransport(socket: Socket, iceServers: RTCIceServer[], userConfig: { enable_reconnection_loop: boolean; reconnection_interval_ms: number }): RTCPeerConnection {
    const peer = new RTCPeerConnection({ iceServers: mergeUserTurnServer(iceServers, connectionConfig) });
    handle.peer = peer;

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
        reportIceFailureDiagnostics(peer, role, roomId, sessionId).catch((diagnosticsError) => {
          logWarn(role, roomId, sessionId, `failed to collect ICE diagnostics: ${String(diagnosticsError)}`);
        });
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

    socket.on('signal', (payload: SignalingPayload) => {
      handleIncomingSignal(peer, socket, roomId, role, sessionId, payload).catch((signalError) => {
        logWarn(role, roomId, sessionId, `failed to handle incoming signal (${payload.type}): ${String(signalError)}`);
      });
    });

    return peer;
  }

  function setUpRelayTransport(socket: Socket): void {
    handle.peer = null;
    attachRelayFrameReceiver(handle, socket, roomId);
    if (isInitiator) {
      startRelayFrameLoop(handle, socket, roomId, localStream);
    }
  }

  async function connect() {
    teardownActiveSocketAndPeer();
    stageIfActive('loadingConfig');
    const [iceServers, userConfig] = await Promise.all([loadIceServers(signalingUrl), loadUserConfig(signalingUrl)]);
    if (isTornDown) return;

    stageIfActive('connectingSocket');
    const socket = createSignalingSocket(signalingUrl);
    handle.socket = socket;
    handle.hasSentOffer = false;

    const isRelayMode = connectionMode === 'cloudflare_relay';
    const peer = isRelayMode ? null : setUpPeerConnectionTransport(socket, iceServers, userConfig);
    if (isRelayMode) {
      setUpRelayTransport(socket);
    }

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
        setHandleRemotePeer(handle, { peerId: firstPeer.peerId, role: firstPeer.role, deviceName: firstPeer.deviceName });
        stageIfActive('negotiating', `peer ${firstPeer.peerId} (${firstPeer.role}, ${firstPeer.deviceName}) present via room-sync`);
        trySendOfferOnce(peer, socket).catch((offerError) => {
          logWarn(role, roomId, sessionId, `failed to send offer after room-sync: ${String(offerError)}`);
        });
        markConnectedInRelayModeIfPeerPresent();
      } else if (handle.currentStage !== 'connected' && handle.currentStage !== 'negotiating') {
        stageIfActive('waitingForPeer');
      }
    });

    socket.on('peer-joined', (payload: PeerPresencePayload) => {
      if (payload.roomId !== roomId) return;
      const joinedDeviceName = payload.deviceName ?? 'unknown device';
      setHandleRemotePeer(handle, { peerId: payload.peerId, role: payload.role, deviceName: joinedDeviceName });
      clearWaitingForPeerTimer(handle);
      stageIfActive('negotiating', `peer ${payload.peerId} (${payload.role}, ${joinedDeviceName}) present`);
      trySendOfferOnce(peer, socket).catch((offerError) => {
        logWarn(role, roomId, sessionId, `failed to send offer after peer join: ${String(offerError)}`);
      });
      markConnectedInRelayModeIfPeerPresent();
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
    teardownActiveSocketAndPeer();
    activeConnections.delete(key);
  };

  connect().catch((connectError) => {
    logWarn(role, roomId, sessionId, `connect() failed: ${String(connectError)}`);
    stageIfActive('failed', 'unexpected error during connection setup');
  });

  return handle;
}

export function useWebRtc({
  signalingUrl,
  roomId,
  otp,
  role,
  isInitiator,
  localStream,
  readyToJoin = true,
  connectionMode = 'stun_p2p',
  connectionConfig,
}: UseWebRtcOptions) {
  const [stage, setStage] = useState<WebRtcStage>('idle');
  const [stageDetail, setStageDetail] = useState<string | undefined>(undefined);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remotePeer, setRemotePeer] = useState<RemotePeerInfo | null>(null);
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
      handle = createConnection(
        key,
        sessionId,
        signalingUrlRef.current,
        roomId,
        otp,
        role,
        isInitiator,
        localStream,
        connectionMode,
        connectionConfig,
      );
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

    handle.stageListeners.add(stageListener);
    handle.streamListeners.add(streamListener);
    handle.peerListeners.add(peerListener);

    setStage(handle.currentStage);
    setStageDetail(undefined);
    setRemoteStream(handle.currentRemoteStream);
    setRemotePeer(handle.currentRemotePeer);

    return () => {
      handle!.stageListeners.delete(stageListener);
      handle!.streamListeners.delete(streamListener);
      handle!.peerListeners.delete(peerListener);
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
  }, [signalingUrl, roomId, otp, role, isInitiator, localStream, readyToJoin, connectionMode, connectionConfig]);

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
    disconnect,
    peer: handleRef.current?.peer ?? null,
    socket: handleRef.current?.socket ?? null,
  };
}
