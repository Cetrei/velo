export enum LogMessage {
  ServerStarted = 'started',
  ConfigReadFailed = 'config_read_failed',
  InvalidEnvPort = 'invalid_env_port',
  RoomJoined = 'room_joined',
  PairingKeyMismatch = 'pairing_key_mismatch',
  PeerDisconnected = 'peer_disconnected',
}

const MESSAGES: Record<LogMessage, string> = {
  [LogMessage.ServerStarted]: '[SIGNALING] Server listening on port {port}',
  [LogMessage.ConfigReadFailed]: '[SIGNALING] Failed to read or parse system.yml',
  [LogMessage.InvalidEnvPort]: '[SIGNALING] Invalid VELO_SIGNALING_PORT env value: {value}',
  [LogMessage.RoomJoined]: '[SIGNALING] Peer {peerId} joined room {roomId}',
  [LogMessage.PairingKeyMismatch]: '[SIGNALING] Pairing key mismatch for room {roomId}, dropping handshake',
  [LogMessage.PeerDisconnected]: '[SIGNALING] Peer {peerId} disconnected from room {roomId}',
};

export function formatLog(message: LogMessage, params: Record<string, string | number> = {}): string {
  let text = MESSAGES[message];
  for (const [key, value] of Object.entries(params)) {
    text = text.replace(`{${key}}`, String(value));
  }
  return text;
}
