import { randomInt, randomUUID } from 'node:crypto';
import { formatLog, LogMessage } from './log-messages';

const OTP_TTL_MS = 120_000;
const OTP_LENGTH = 6;
const MAX_PEERS_PER_ROOM = 2;

interface PendingPairing {
  roomId: string;
  otp: string;
  expiresAt: number;
}

export interface RoomPeerRecord {
  socketId: string;
  sessionId: string;
  role: string;
  deviceName: string;
}

const pendingPairings = new Map<string, PendingPairing>();
const roomPeersBySession = new Map<string, Map<string, RoomPeerRecord>>();
const socketToSession = new Map<string, string>();

function generateOtp(): string {
  const min = 10 ** (OTP_LENGTH - 1);
  const max = 10 ** OTP_LENGTH - 1;
  return randomInt(min, max + 1).toString();
}

function pruneExpiredPairings(): void {
  const now = Date.now();
  for (const [roomId, pairing] of pendingPairings) {
    if (pairing.expiresAt <= now) {
      pendingPairings.delete(roomId);
    }
  }
}

export function createPairing(): PendingPairing {
  pruneExpiredPairings();
  const roomId = randomUUID();
  const otp = generateOtp();
  const pairing: PendingPairing = { roomId, otp, expiresAt: Date.now() + OTP_TTL_MS };
  pendingPairings.set(roomId, pairing);
  console.log(formatLog(LogMessage.PairingCreated, { roomId }));
  return pairing;
}

export function findRoomIdByOtp(otp: string): string | null {
  pruneExpiredPairings();
  for (const pairing of pendingPairings.values()) {
    if (pairing.otp === otp) {
      return pairing.roomId;
    }
  }
  return null;
}

export type JoinOutcome =
  | { kind: 'joined_fresh' }
  | { kind: 'resynced' }
  | { kind: 'rejected'; reason: 'otp_invalid' | 'otp_expired' | 'room_full' };

function getExistingSessionRecord(roomId: string, sessionId: string): RoomPeerRecord | null {
  return roomPeersBySession.get(roomId)?.get(sessionId) ?? null;
}

function countPeersExcluding(roomId: string, sessionId: string): number {
  const peersInRoom = roomPeersBySession.get(roomId);
  if (!peersInRoom) {
    return 0;
  }
  return Array.from(peersInRoom.keys()).filter((existingSessionId) => existingSessionId !== sessionId).length;
}

export function evaluateJoin(roomId: string, otp: string, sessionId: string): JoinOutcome {
  const existingRecord = getExistingSessionRecord(roomId, sessionId);
  if (existingRecord) {
    return { kind: 'resynced' };
  }

  pruneExpiredPairings();
  const pairing = pendingPairings.get(roomId);
  if (!pairing) {
    console.warn(formatLog(LogMessage.PairingKeyMismatch, { roomId }));
    return { kind: 'rejected', reason: 'otp_expired' };
  }
  if (pairing.otp !== otp) {
    console.warn(formatLog(LogMessage.PairingKeyMismatch, { roomId }));
    return { kind: 'rejected', reason: 'otp_invalid' };
  }

  const otherPeerCount = countPeersExcluding(roomId, sessionId);
  if (otherPeerCount + 1 > MAX_PEERS_PER_ROOM) {
    return { kind: 'rejected', reason: 'room_full' };
  }

  return { kind: 'joined_fresh' };
}

export function registerRoomJoin(
  roomId: string,
  socketId: string,
  sessionId: string,
  role: string,
  deviceName: string,
): void {
  const peersInRoom = roomPeersBySession.get(roomId) ?? new Map<string, RoomPeerRecord>();
  peersInRoom.set(sessionId, { socketId, sessionId, role, deviceName });
  roomPeersBySession.set(roomId, peersInRoom);
  socketToSession.set(socketId, sessionId);

  const otherPeerCount = countPeersExcluding(roomId, sessionId);
  if (otherPeerCount + 1 >= MAX_PEERS_PER_ROOM) {
    pendingPairings.delete(roomId);
  }
}

export function reattachSocketToSession(roomId: string, socketId: string, sessionId: string): void {
  const record = getExistingSessionRecord(roomId, sessionId);
  if (!record) {
    return;
  }
  record.socketId = socketId;
  socketToSession.set(socketId, sessionId);
}

export function registerRoomLeave(roomId: string, sessionId: string): void {
  socketToSession.forEach((existingSessionId, socketId) => {
    if (existingSessionId === sessionId) {
      socketToSession.delete(socketId);
    }
  });

  const peersInRoom = roomPeersBySession.get(roomId);
  if (!peersInRoom) {
    return;
  }
  peersInRoom.delete(sessionId);
  if (peersInRoom.size === 0) {
    roomPeersBySession.delete(roomId);
  }
}

export function getSessionIdForSocket(socketId: string): string | null {
  return socketToSession.get(socketId) ?? null;
}

export function getRoomIdForSession(sessionId: string): string | null {
  for (const [roomId, peersInRoom] of roomPeersBySession) {
    if (peersInRoom.has(sessionId)) {
      return roomId;
    }
  }
  return null;
}

export function getPeerRecord(roomId: string, sessionId: string): RoomPeerRecord | null {
  return getExistingSessionRecord(roomId, sessionId);
}

export function getOtherPeersInRoom(roomId: string, sessionId: string): RoomPeerRecord[] {
  const peersInRoom = roomPeersBySession.get(roomId);
  if (!peersInRoom) {
    return [];
  }
  return Array.from(peersInRoom.values()).filter((peer) => peer.sessionId !== sessionId);
}

export function getAllPeersInRoom(roomId: string): RoomPeerRecord[] {
  const peersInRoom = roomPeersBySession.get(roomId);
  if (!peersInRoom) {
    return [];
  }
  return Array.from(peersInRoom.values());
}
