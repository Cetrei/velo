export enum LogMessage {
  ServerStarted = 'started',
  ConfigReadFailed = 'config_read_failed',
  InvalidEnvPort = 'invalid_env_port',
  RoomJoined = 'room_joined',
  RoomResynced = 'room_resynced',
  PairingKeyMismatch = 'pairing_key_mismatch',
  PairingPayloadInvalid = 'pairing_payload_invalid',
  RoomSyncSent = 'room_sync_sent',
  SignalRejectedNotInRoom = 'signal_rejected_not_in_room',
  SignalRelayed = 'signal_relayed',
  PeerDisconnected = 'peer_disconnected',
  PairingCreated = 'pairing_created',
  RoomFull = 'room_full',
  RateLimitExceeded = 'rate_limit_exceeded',
  TurnRelayNotConfigured = 'turn_relay_not_configured',
  RelayFrameRejectedNotInRoom = 'relay_frame_rejected_not_in_room',
}

const MESSAGES: Record<LogMessage, string> = {
  [LogMessage.ServerStarted]: '[SIGNALING] Server listening on port {port}',
  [LogMessage.ConfigReadFailed]: '[SIGNALING] Failed to read or parse system.yml',
  [LogMessage.InvalidEnvPort]: '[SIGNALING] Invalid VELO_SIGNALING_PORT env value: {value}',
  [LogMessage.RoomJoined]: '[SIGNALING] Session {sessionId} ({deviceName}, socket {peerId}) joined room {roomId} as {role}',
  [LogMessage.RoomResynced]: '[SIGNALING] Session {sessionId} ({deviceName}, socket {peerId}) resynced room {roomId} as {role}, OTP not consumed',
  [LogMessage.PairingKeyMismatch]: '[SIGNALING] Pairing key mismatch or expired OTP for room {roomId}, dropping join',
  [LogMessage.PairingPayloadInvalid]: '[SIGNALING] Malformed join-room payload from socket {peerId}, dropping join',
  [LogMessage.RoomSyncSent]: '[SIGNALING] Sent room-sync to session {sessionId} for room {roomId}, {peerCount} peer(s) total',
  [LogMessage.SignalRejectedNotInRoom]: '[SIGNALING] Rejected {signalType} from peer {peerId} for room {roomId}: socket is not a member of that room',
  [LogMessage.SignalRelayed]: '[SIGNALING] Relayed {signalType} from peer {peerId} in room {roomId}',
  [LogMessage.PeerDisconnected]: '[SIGNALING] Session {sessionId} ({deviceName}, socket {peerId}) disconnected from room {roomId}',
  [LogMessage.PairingCreated]: '[SIGNALING] Pairing OTP created for room {roomId}',
  [LogMessage.RoomFull]: '[SIGNALING] Rejected join for room {roomId}, already at peer capacity',
  [LogMessage.RateLimitExceeded]: '[SIGNALING] Rate limit exceeded for {peerId} on {eventName}',
  [LogMessage.TurnRelayNotConfigured]: '[SIGNALING] /config/turn-credentials requested but no TURN relay is configured (missing TURN_STATIC_AUTH_SECRET env or config/system.yml network.turn), falling back to STUN-only ICE servers',
  [LogMessage.RelayFrameRejectedNotInRoom]: '[SIGNALING] Rejected relay-frame from peer {peerId} for room {roomId}: socket is not a member of that room',
};

export function formatLog(message: LogMessage, params: Record<string, string | number> = {}): string {
  let text = MESSAGES[message];
  for (const [key, value] of Object.entries(params)) {
    text = text.replace(`{${key}}`, String(value));
  }
  return text;
}
