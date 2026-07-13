export interface SignalingPayload {
  roomId: string;
  senderId: string;
  targetId: string;
  type: 'offer' | 'answer' | 'candidate';
  data: RTCSessionDescriptionInit | RTCIceCandidateInit;
}

export type PeerRole = 'host' | 'viewer';

export interface SessionJoinPayload {
  roomId: string;
  passkey: string;
  role: PeerRole;
  deviceName: string;
  sessionId: string;
}

export interface PairingPayload {
  roomId: string;
  passkey: string;
  role: PeerRole;
  deviceName?: string;
}

export interface PeerPresencePayload {
  roomId: string;
  peerId: string;
  role: PeerRole;
  deviceName?: string;
  sessionId?: string;
}

export interface RoomPeerSnapshot {
  peerId: string;
  role: PeerRole;
  deviceName: string;
  sessionId: string;
}

export interface RoomSyncPayload {
  roomId: string;
  you: RoomPeerSnapshot;
  peers: RoomPeerSnapshot[];
}

export interface DisconnectPayload {
  roomId: string;
}

export type NegotiationStage =
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

export interface JoinRejectedPayload {
  roomId: string;
  reason: 'otp_invalid' | 'otp_expired' | 'room_full' | 'malformed_payload';
}

export * from './config-schema';
