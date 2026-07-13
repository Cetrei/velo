export interface SignalingPayload {
  roomId: string;
  senderId: string;
  targetId: string;
  type: 'offer' | 'answer' | 'candidate';
  data: RTCSessionDescriptionInit | RTCIceCandidateInit;
}

export type PeerRole = 'host' | 'viewer';

export interface PairingPayload {
  roomId: string;
  passkey: string;
  role: PeerRole;
}

export interface PeerPresencePayload {
  roomId: string;
  peerId: string;
  role: PeerRole;
}

export interface DisconnectPayload {
  roomId: string;
}

export * from './config-schema';
