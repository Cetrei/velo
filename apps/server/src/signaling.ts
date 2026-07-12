import type { Server, Socket } from 'socket.io';
import type { SignalingPayload, PairingPayload } from 'shared-types';
import { formatLog, LogMessage } from './log-messages';
import { canJoinRoom, consumePairing, registerRoomJoin, registerRoomLeave } from './pairing';

const socketRoomMap = new Map<string, string>();

function isValidPairingPayload(payload: unknown): payload is PairingPayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const candidate = payload as Record<string, unknown>;
  return typeof candidate.roomId === 'string' && typeof candidate.passkey === 'string';
}

function isValidSignalingPayload(payload: unknown): payload is SignalingPayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const candidate = payload as Record<string, unknown>;
  const hasValidType = candidate.type === 'offer' || candidate.type === 'answer' || candidate.type === 'candidate';
  return typeof candidate.roomId === 'string' && hasValidType && typeof candidate.data === 'object';
}

function handleJoinRoom(socket: Socket, payload: unknown): void {
  if (!isValidPairingPayload(payload)) {
    console.warn(formatLog(LogMessage.PairingKeyMismatch, { roomId: 'unknown' }));
    return;
  }

  const { roomId, passkey } = payload;

  if (!consumePairing(roomId, passkey)) {
    return;
  }

  if (!canJoinRoom(roomId)) {
    console.warn(formatLog(LogMessage.RoomFull, { roomId }));
    return;
  }

  socket.join(roomId);
  socketRoomMap.set(socket.id, roomId);
  registerRoomJoin(roomId);
  console.log(formatLog(LogMessage.RoomJoined, { peerId: socket.id, roomId }));
}

function handleSignal(io: Server, socket: Socket, payload: unknown): void {
  if (!isValidSignalingPayload(payload)) {
    return;
  }

  const room = io.sockets.adapter.rooms.get(payload.roomId);
  if (!room || !room.has(socket.id)) {
    console.warn(formatLog(LogMessage.PairingKeyMismatch, { roomId: payload.roomId }));
    return;
  }
  socket.to(payload.roomId).emit('signal', payload);
}

function handleDisconnect(socket: Socket): void {
  const roomId = socketRoomMap.get(socket.id);
  socketRoomMap.delete(socket.id);
  if (roomId) {
    registerRoomLeave(roomId);
  }
  console.log(formatLog(LogMessage.PeerDisconnected, { peerId: socket.id, roomId: roomId ?? 'unknown' }));
}

export function registerSignalingHandlers(io: Server, socket: Socket): void {
  socket.on('join-room', (payload: unknown) => handleJoinRoom(socket, payload));
  socket.on('signal', (payload: unknown) => handleSignal(io, socket, payload));
  socket.on('disconnect', () => handleDisconnect(socket));
}
