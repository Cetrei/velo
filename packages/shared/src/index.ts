export interface SignalingPayload {
  roomId: string;
  senderId: string;
  targetId: string;
  type: 'offer' | 'answer' | 'candidate';
  data: RTCSessionDescriptionInit | RTCIceCandidateInit;
}

export interface PairingPayload {
  roomId: string;
  passkey: string;
}

export * from './config-schema';
