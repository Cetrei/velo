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

export function registerRoomJoin(roomId: string): void {
  const currentCount = roomPeerCounts.get(roomId) ?? 0;
  roomPeerCounts.set(roomId, currentCount + 1);
}

export function registerRoomLeave(roomId: string): void {
  const currentCount = roomPeerCounts.get(roomId) ?? 0;
  if (currentCount <= 1) {
    roomPeerCounts.delete(roomId);
    return;
  }
  roomPeerCounts.set(roomId, currentCount - 1);
}
