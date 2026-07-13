import type { Server, Socket } from 'socket.io';
import type { SignalingPayload, PairingPayload, PeerPresencePayload, DisconnectPayload } from 'shared-types';
import { formatLog, LogMessage } from './log-messages';
import {
  canJoinRoom,
  consumePairing,
  getOtherPeersInRoom,
  getPeerDeviceName,
  registerRoomJoin,
  registerRoomLeave,
} from './pairing';

const socketRoomMap = new Map<string, string>();
const UNKNOWN_DEVICE_NAME = 'unknown-device';

function sanitizeDeviceName(deviceName: unknown): string {
  if (typeof deviceName !== 'string' || deviceName.trim().length === 0) {
    return UNKNOWN_DEVICE_NAME;
  }
  return deviceName.slice(0, 64);
}

function isValidPairingPayload(payload: unknown): payload is PairingPayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const candidate = payload as Record<string, unknown>;
  const hasValidRole = candidate.role === 'host' || candidate.role === 'viewer';
  return typeof candidate.roomId === 'string' && typeof candidate.passkey === 'string' && hasValidRole;
}

function isValidDisconnectPayload(payload: unknown): payload is DisconnectPayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const candidate = payload as Record<string, unknown>;
  return typeof candidate.roomId === 'string';
}

function isValidSignalingPayload(payload: unknown): payload is SignalingPayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const candidate = payload as Record<string, unknown>;
  const hasValidType = candidate.type === 'offer' || candidate.type === 'answer' || candidate.type === 'candidate';
  return typeof candidate.roomId === 'string' && hasValidType && typeof candidate.data === 'object';
}

function notifyExistingPeersOfJoin(socket: Socket, roomId: string, role: string, deviceName: string): void {
  const presence: PeerPresencePayload = { roomId, peerId: socket.id, role: role as PeerPresencePayload['role'], deviceName };
  socket.to(roomId).emit('peer-joined', presence);

  const otherPeers = getOtherPeersInRoom(roomId, socket.id);
  otherPeers.forEach((peer) => {
    const existingPresence: PeerPresencePayload = {
      roomId,
      peerId: peer.peerId,
      role: peer.role as PeerPresencePayload['role'],
      deviceName: peer.deviceName,
    };
    socket.emit('peer-joined', existingPresence);
  });
}

function handleJoinRoom(socket: Socket, payload: unknown): void {
  if (!isValidPairingPayload(payload)) {
    console.warn(formatLog(LogMessage.PairingPayloadInvalid, { peerId: socket.id }));
    return;
  }

  const { roomId, passkey, role } = payload;
  const deviceName = sanitizeDeviceName(payload.deviceName);

  if (!consumePairing(roomId, passkey)) {
    return;
  }

  if (!canJoinRoom(roomId)) {
    console.warn(formatLog(LogMessage.RoomFull, { roomId }));
    return;
  }

  socket.join(roomId);
  socketRoomMap.set(socket.id, roomId);
  registerRoomJoin(roomId, socket.id, role, deviceName);
  notifyExistingPeersOfJoin(socket, roomId, role, deviceName);
  console.log(formatLog(LogMessage.RoomJoined, { peerId: socket.id, roomId, role, deviceName }));
}

function handleSignal(io: Server, socket: Socket, payload: unknown): void {
  if (!isValidSignalingPayload(payload)) {
    return;
  }

  const room = io.sockets.adapter.rooms.get(payload.roomId);
  if (!room || !room.has(socket.id)) {
    console.warn(
      formatLog(LogMessage.SignalRejectedNotInRoom, {
        signalType: payload.type,
        peerId: socket.id,
        roomId: payload.roomId,
      }),
    );
    return;
  }
  console.log(formatLog(LogMessage.SignalRelayed, { signalType: payload.type, peerId: socket.id, roomId: payload.roomId }));
  socket.to(payload.roomId).emit('signal', payload);
}

function notifyRoomOfLeave(socket: Socket, roomId: string): void {
  const presence: Pick<PeerPresencePayload, 'roomId' | 'peerId'> = { roomId, peerId: socket.id };
  socket.to(roomId).emit('peer-left', presence);
}

function handleDisconnect(socket: Socket): void {
  const roomId = socketRoomMap.get(socket.id);
  socketRoomMap.delete(socket.id);
  if (roomId) {
    const deviceName = getPeerDeviceName(roomId, socket.id) ?? UNKNOWN_DEVICE_NAME;
    registerRoomLeave(roomId, socket.id);
    notifyRoomOfLeave(socket, roomId);
    console.log(formatLog(LogMessage.PeerDisconnected, { peerId: socket.id, roomId, deviceName }));
    return;
  }
  console.log(formatLog(LogMessage.PeerDisconnected, { peerId: socket.id, roomId: 'unknown', deviceName: UNKNOWN_DEVICE_NAME }));
}

function handleDisconnectPeer(socket: Socket, payload: unknown): void {
  if (!isValidDisconnectPayload(payload)) {
    return;
  }

  const { roomId } = payload;
  const ownedRoomId = socketRoomMap.get(socket.id);
  if (ownedRoomId !== roomId) {
    return;
  }

  const deviceName = getPeerDeviceName(roomId, socket.id) ?? UNKNOWN_DEVICE_NAME;
  notifyRoomOfLeave(socket, roomId);
  socket.to(roomId).emit('peer-disconnected-by-remote', { roomId });
  socket.leave(roomId);
  socketRoomMap.delete(socket.id);
  registerRoomLeave(roomId, socket.id);
  console.log(formatLog(LogMessage.PeerDisconnected, { peerId: socket.id, roomId, deviceName }));
}

export function registerSignalingHandlers(io: Server, socket: Socket): void {
  socket.on('join-room', (payload: unknown) => handleJoinRoom(socket, payload));
  socket.on('signal', (payload: unknown) => handleSignal(io, socket, payload));
  socket.on('disconnect-peer', (payload: unknown) => handleDisconnectPeer(socket, payload));
  socket.on('disconnect', () => handleDisconnect(socket));
}
