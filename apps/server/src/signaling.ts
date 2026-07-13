import type { Server, Socket } from 'socket.io';
import type {
  SignalingPayload,
  SessionJoinPayload,
  PeerPresencePayload,
  DisconnectPayload,
  RoomSyncPayload,
  RoomPeerSnapshot,
  JoinRejectedPayload,
} from 'shared-types';
import { formatLog, LogMessage } from './log-messages';
import {
  evaluateJoin,
  getAllPeersInRoom,
  getOtherPeersInRoom,
  getPeerRecord,
  getSessionIdForSocket,
  reattachSocketToSession,
  registerRoomJoin,
  registerRoomLeave,
  type RoomPeerRecord,
} from './pairing';

const socketRoomMap = new Map<string, string>();
const UNKNOWN_DEVICE_NAME = 'unknown-device';

function sanitizeDeviceName(deviceName: unknown): string {
  if (typeof deviceName !== 'string' || deviceName.trim().length === 0) {
    return UNKNOWN_DEVICE_NAME;
  }
  return deviceName.slice(0, 64);
}

function isValidSessionJoinPayload(payload: unknown): payload is SessionJoinPayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const candidate = payload as Record<string, unknown>;
  const hasValidRole = candidate.role === 'host' || candidate.role === 'viewer';
  return (
    typeof candidate.roomId === 'string' &&
    typeof candidate.passkey === 'string' &&
    typeof candidate.sessionId === 'string' &&
    candidate.sessionId.length > 0 &&
    hasValidRole
  );
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

function toSnapshot(record: RoomPeerRecord): RoomPeerSnapshot {
  return {
    peerId: record.socketId,
    role: record.role as RoomPeerSnapshot['role'],
    deviceName: record.deviceName,
    sessionId: record.sessionId,
  };
}

function sendRoomSync(socket: Socket, roomId: string, sessionId: string): void {
  const you = getPeerRecord(roomId, sessionId);
  if (!you) {
    return;
  }
  const otherPeers = getOtherPeersInRoom(roomId, sessionId);
  const payload: RoomSyncPayload = {
    roomId,
    you: toSnapshot(you),
    peers: otherPeers.map(toSnapshot),
  };
  socket.emit('room-sync', payload);
  console.log(
    formatLog(LogMessage.RoomSyncSent, { sessionId, roomId, peerCount: getAllPeersInRoom(roomId).length }),
  );
}

function notifyOtherPeersOfJoin(socket: Socket, roomId: string, snapshot: RoomPeerSnapshot): void {
  const presence: PeerPresencePayload = {
    roomId,
    peerId: snapshot.peerId,
    role: snapshot.role,
    deviceName: snapshot.deviceName,
    sessionId: snapshot.sessionId,
  };
  socket.to(roomId).emit('peer-joined', presence);
}

function rejectJoin(socket: Socket, roomId: string, reason: JoinRejectedPayload['reason']): void {
  const payload: JoinRejectedPayload = { roomId, reason };
  socket.emit('join-rejected', payload);
}

function handleJoinRoom(socket: Socket, payload: unknown): void {
  if (!isValidSessionJoinPayload(payload)) {
    console.warn(formatLog(LogMessage.PairingPayloadInvalid, { peerId: socket.id }));
    rejectJoin(socket, typeof (payload as any)?.roomId === 'string' ? (payload as any).roomId : '', 'malformed_payload');
    return;
  }

  const { roomId, passkey, role, sessionId } = payload;
  const deviceName = sanitizeDeviceName(payload.deviceName);

  const outcome = evaluateJoin(roomId, passkey, sessionId);

  if (outcome.kind === 'rejected') {
    rejectJoin(socket, roomId, outcome.reason);
    return;
  }

  socket.join(roomId);
  socketRoomMap.set(socket.id, roomId);

  if (outcome.kind === 'joined_fresh') {
    registerRoomJoin(roomId, socket.id, sessionId, role, deviceName);
    const you = getPeerRecord(roomId, sessionId);
    if (you) {
      notifyOtherPeersOfJoin(socket, roomId, toSnapshot(you));
    }
    console.log(formatLog(LogMessage.RoomJoined, { sessionId, deviceName, peerId: socket.id, roomId, role }));
  } else {
    reattachSocketToSession(roomId, socket.id, sessionId);
    console.log(formatLog(LogMessage.RoomResynced, { sessionId, deviceName, peerId: socket.id, roomId, role }));
  }

  sendRoomSync(socket, roomId, sessionId);
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
  const sessionId = getSessionIdForSocket(socket.id);

  if (!roomId || !sessionId) {
    console.log(
      formatLog(LogMessage.PeerDisconnected, {
        sessionId: 'unknown',
        deviceName: UNKNOWN_DEVICE_NAME,
        peerId: socket.id,
        roomId: 'unknown',
      }),
    );
    return;
  }

  const record = getPeerRecord(roomId, sessionId);
  const deviceName = record?.deviceName ?? UNKNOWN_DEVICE_NAME;
  registerRoomLeave(roomId, sessionId);
  notifyRoomOfLeave(socket, roomId);
  console.log(formatLog(LogMessage.PeerDisconnected, { sessionId, deviceName, peerId: socket.id, roomId }));
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

  const sessionId = getSessionIdForSocket(socket.id);
  const record = sessionId ? getPeerRecord(roomId, sessionId) : null;
  const deviceName = record?.deviceName ?? UNKNOWN_DEVICE_NAME;

  notifyRoomOfLeave(socket, roomId);
  socket.to(roomId).emit('peer-disconnected-by-remote', { roomId });
  socket.leave(roomId);
  socketRoomMap.delete(socket.id);
  if (sessionId) {
    registerRoomLeave(roomId, sessionId);
  }
  console.log(
    formatLog(LogMessage.PeerDisconnected, { sessionId: sessionId ?? 'unknown', deviceName, peerId: socket.id, roomId }),
  );
}

export function registerSignalingHandlers(io: Server, socket: Socket): void {
  socket.on('join-room', (payload: unknown) => handleJoinRoom(socket, payload));
  socket.on('signal', (payload: unknown) => handleSignal(io, socket, payload));
  socket.on('disconnect-peer', (payload: unknown) => handleDisconnectPeer(socket, payload));
  socket.on('disconnect', () => handleDisconnect(socket));
}
