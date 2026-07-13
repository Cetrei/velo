export enum LogMessage {
  ServerStarted = 'started',
  ConfigReadFailed = 'config_read_failed',
  InvalidEnvPort = 'invalid_env_port',
  RoomJoined = 'room_joined',
  PairingKeyMismatch = 'pairing_key_mismatch',
  PairingPayloadInvalid = 'pairing_payload_invalid',
  SignalRejectedNotInRoom = 'signal_rejected_not_in_room',
  SignalRelayed = 'signal_relayed',
  PeerDisconnected = 'peer_disconnected',
  PairingCreated = 'pairing_created',
  RoomFull = 'room_full',
  RateLimitExceeded = 'rate_limit_exceeded',
}

const MESSAGES: Record<LogMessage, string> = {
  [LogMessage.ServerStarted]: '[SIGNALING] Server listening on port {port}',
  [LogMessage.ConfigReadFailed]: '[SIGNALING] Failed to read or parse system.yml',
  [LogMessage.InvalidEnvPort]: '[SIGNALING] Invalid VELO_SIGNALING_PORT env value: {value}',
  [LogMessage.RoomJoined]: '[SIGNALING] Peer {peerId} joined room {roomId} as {role}',
  [LogMessage.PairingKeyMismatch]: '[SIGNALING] Pairing key mismatch or expired OTP for room {roomId}, dropping join',
  [LogMessage.PairingPayloadInvalid]: '[SIGNALING] Malformed join-room payload from socket {peerId}, dropping join',
  [LogMessage.SignalRejectedNotInRoom]: '[SIGNALING] Rejected {signalType} from peer {peerId} for room {roomId}: socket is not a member of that room',
  [LogMessage.SignalRelayed]: '[SIGNALING] Relayed {signalType} from peer {peerId} in room {roomId}',
  [LogMessage.PeerDisconnected]: '[SIGNALING] Peer {peerId} disconnected from room {roomId}',
  [LogMessage.PairingCreated]: '[SIGNALING] Pairing OTP created for room {roomId}',
  [LogMessage.RoomFull]: '[SIGNALING] Rejected join for room {roomId}, already at peer capacity',
  [LogMessage.RateLimitExceeded]: '[SIGNALING] Rate limit exceeded for {peerId} on {eventName}',
};

export function formatLog(message: LogMessage, params: Record<string, string | number> = {}): string {
  let text = MESSAGES[message];
  for (const [key, value] of Object.entries(params)) {
    text = text.replace(`{${key}}`, String(value));
  }
  return text;
}
