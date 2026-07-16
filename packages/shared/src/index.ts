export interface SignalingPayload {
  roomId: string;
  senderId: string;
  targetId: string;
  type: 'offer' | 'answer' | 'candidate';
  data: RTCSessionDescriptionInit | RTCIceCandidateInit;
}

export type PeerRole = 'host' | 'viewer';

/**
 * Deliberately has no `role` field. Role is not something a client declares - it is assigned by
 * the signaling server based on which of the room's two role slots (host/viewer) is free at join
 * time, so that "the device that generates the pairing code becomes host" falls out naturally
 * (it joins its own freshly-created room first, taking the free host slot) without either device
 * needing to know or announce which one it is in advance. See apps/server/src/pairing.ts's
 * resolveRoleForFreshJoin and the RoomSyncPayload.you field this join eventually produces, which is
 * how the joining client learns its own assigned role.
 */
export interface SessionJoinPayload {
  roomId: string;
  passkey: string;
  deviceName: string;
  sessionId: string;
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

/**
 * Requests that the signaling server flip role assignments within a room: with two peers
 * present, both roles swap (host becomes viewer and vice versa); with only the requester
 * present, the requester's own role flips. This is the manual fallback for the rare case where
 * resolveRoleForFreshJoin's identity-based reclaim (see apps/server/src/pairing.ts) still leaves
 * a room with the 'wrong' device holding 'host', or where a room's recognized host never
 * reconnects and its lone peer would otherwise wait forever. See RoomSyncPayload, which the
 * server re-sends to every peer in the room after a swap succeeds.
 */
export interface RoleSwapRequestPayload {
  roomId: string;
}

export interface RelayFrameMetadata {
  roomId: string;
  width: number;
  height: number;
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
