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

const pendingPairings = new Map<string, PendingPairing>();
const roomPeerCounts = new Map<string, number>();
const roomPeerRoles = new Map<string, Map<string, string>>();

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

export function consumePairing(roomId: string, otp: string): boolean {
  pruneExpiredPairings();
  const pairing = pendingPairings.get(roomId);
  if (!pairing || pairing.otp !== otp) {
    console.warn(formatLog(LogMessage.PairingKeyMismatch, { roomId }));
    return false;
  }
  pendingPairings.delete(roomId);
  return true;
}

export function canJoinRoom(roomId: string): boolean {
  const currentCount = roomPeerCounts.get(roomId) ?? 0;
  return currentCount < MAX_PEERS_PER_ROOM;
}

export function registerRoomJoin(roomId: string, peerId: string, role: string): void {
  const currentCount = roomPeerCounts.get(roomId) ?? 0;
  roomPeerCounts.set(roomId, currentCount + 1);

  const rolesInRoom = roomPeerRoles.get(roomId) ?? new Map<string, string>();
  rolesInRoom.set(peerId, role);
  roomPeerRoles.set(roomId, rolesInRoom);
}

export function registerRoomLeave(roomId: string, peerId: string): void {
  const currentCount = roomPeerCounts.get(roomId) ?? 0;
  if (currentCount <= 1) {
    roomPeerCounts.delete(roomId);
    roomPeerRoles.delete(roomId);
    return;
  }
  roomPeerCounts.set(roomId, currentCount - 1);

  const rolesInRoom = roomPeerRoles.get(roomId);
  rolesInRoom?.delete(peerId);
}

export function getPeerRole(roomId: string, peerId: string): string | null {
  return roomPeerRoles.get(roomId)?.get(peerId) ?? null;
}

export function getOtherPeersInRoom(roomId: string, peerId: string): Array<{ peerId: string; role: string }> {
  const rolesInRoom = roomPeerRoles.get(roomId);
  if (!rolesInRoom) {
    return [];
  }
  return Array.from(rolesInRoom.entries())
    .filter(([otherPeerId]) => otherPeerId !== peerId)
    .map(([otherPeerId, role]) => ({ peerId: otherPeerId, role }));
}
