import type { Server, Socket } from 'socket.io';
import type { SignalingPayload } from 'shared-types';
import { formatLog, LogMessage } from './log-messages';

function handleJoinRoom(socket: Socket, roomId: string): void {
  if (!roomId) {
    return;
  }
  socket.join(roomId);
  console.log(formatLog(LogMessage.RoomJoined, { peerId: socket.id, roomId }));
}

function handleSignal(io: Server, socket: Socket, payload: SignalingPayload): void {
  const room = io.sockets.adapter.rooms.get(payload.roomId);
  if (!room || !room.has(socket.id)) {
    console.warn(formatLog(LogMessage.PairingKeyMismatch, { roomId: payload.roomId }));
    return;
  }
  socket.to(payload.roomId).emit('signal', payload);
}

export function registerSignalingHandlers(io: Server, socket: Socket): void {
  socket.on('join-room', (roomId: string) => handleJoinRoom(socket, roomId));
  socket.on('signal', (payload: SignalingPayload) => handleSignal(io, socket, payload));
  socket.on('disconnect', () => {
    console.log(formatLog(LogMessage.PeerDisconnected, { peerId: socket.id, roomId: 'unknown' }));
  });
}
