import { randomInt, randomUUID } from 'node:crypto';
import type { PeerRole } from 'shared-types';
import { formatLog, LogMessage } from './log-messages';

const OTP_TTL_MS = 120_000;
const OTP_LENGTH = 6;
const MAX_PEERS_PER_ROOM = 2;

interface PendingPairing {
  roomId: string;
  otp: string;
  expiresAt: number;
}

interface SwapOutcome {
  succeeded: boolean;
  newHostDeviceName: string | null;
}

export interface RoomPeerRecord {
  socketId: string;
  sessionId: string;
  role: PeerRole;
  deviceName: string;
}

const pendingPairings = new Map<string, PendingPairing>();
const roomPeersBySession = new Map<string, Map<string, RoomPeerRecord>>();
const socketToSession = new Map<string, string>();

/**
 * Tracks which device (by its persisted, locally-generated deviceName - there is no stronger
 * per-device identity in this system) is recognized as a room's host, independent of the
 * transient RoomPeerRecord entries that get wiped when both peers disconnect. This is what lets
 * resolveRoleForFreshJoin give the host slot back to the same physical device on reconnect
 * instead of whichever device's join-room request happens to reach the server first. Seeded at
 * room-creation time from the creator's deviceName when the client supplies one (see
 * createPairing), and kept up to date whenever a fresh join or a role swap changes who holds
 * 'host'. Deliberately never pruned on room-empty, only overwritten - see resolveRoleForFreshJoin
 * and swapRoomRoles for how staleness (the recognized host never comes back) is handled.
 */
const roomHostDeviceName = new Map<string, string>();

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

export function createPairing(creatorDeviceName?: string): PendingPairing {
  pruneExpiredPairings();
  const roomId = randomUUID();
  const otp = generateOtp();
  const pairing: PendingPairing = { roomId, otp, expiresAt: Date.now() + OTP_TTL_MS };
  pendingPairings.set(roomId, pairing);
  if (creatorDeviceName) {
    roomHostDeviceName.set(roomId, creatorDeviceName);
  }
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
  role: PeerRole,
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

/**
 * Assigns a role to a freshly-joining peer. `evaluateJoin` already guarantees at most one
 * existing peer by the time this runs (a room_full rejection happens before a fresh join is ever
 * registered), so there is at most one occupied slot to check.
 *
 * If the 'host' slot is already occupied by an existing peer, the joiner gets 'viewer' - this
 * part is unchanged from the original free-slot rule.
 *
 * If the 'host' slot is free, this now checks roomHostDeviceName instead of granting it to
 * whichever device asks first:
 * - No host has been recorded for this room yet -> this joiner becomes host, and is recorded as
 *   the room's recognized host. This is the normal first-join case (the pairing code generator's
 *   own client, or a room created before deviceName-based tracking existed).
 * - A host is recorded and this joiner's deviceName matches it -> reclaim, stays host. This is
 *   the reconnect case the identity tracking exists for.
 * - A host is recorded and this joiner's deviceName does NOT match it -> assigned 'viewer'
 *   instead of taking the free slot. This is the fix for the race described when this function
 *   was first written: previously, if both peers dropped and reconnected near-simultaneously,
 *   whichever join-room request reached the server first won the host slot regardless of which
 *   physical device it was. Now the slot is reserved for the recognized host to reclaim.
 *
 * Accepted tradeoff, deliberately not engineered around: if the recognized host's device never
 * reconnects (uninstalled, deviceName storage cleared, permanently offline), the other device is
 * stuck as 'viewer' with the 'host' slot reserved for a device that is never coming back - this
 * would otherwise be a deadlock. `swapRoomRoles` (the server side of the manual "swap roles" UI
 * action) is the intended way out: a lone peer can flip its own role, which also overwrites
 * roomHostDeviceName, releasing the stale reservation.
 */
export function resolveRoleForFreshJoin(roomId: string, deviceName: string): PeerRole {
  const occupiedRoles = new Set(getAllPeersInRoom(roomId).map((peer) => peer.role));
  if (occupiedRoles.has('host')) {
    return 'viewer';
  }

  const recognizedHost = roomHostDeviceName.get(roomId);
  if (!recognizedHost || recognizedHost === deviceName) {
    roomHostDeviceName.set(roomId, deviceName);
    return 'host';
  }
  return 'viewer';
}

/**
 * Flips role assignments within a room, the server side of the manual "swap roles" UI fallback.
 * With two peers present, both roles swap. With only one peer present (its counterpart is
 * offline or never reconnected), that lone peer's own role flips instead - this is what breaks
 * the stale-reservation deadlock resolveRoleForFreshJoin's doc comment describes. Either way,
 * roomHostDeviceName is updated to whichever deviceName now holds 'host' (or cleared if nobody
 * does), so future joins are resolved against the swap's outcome, not the pre-swap assignment.
 */
export function swapRoomRoles(roomId: string): SwapOutcome {
  const peersInRoom = getAllPeersInRoom(roomId);
  if (peersInRoom.length === 0) {
    return { succeeded: false, newHostDeviceName: null };
  }

  peersInRoom.forEach((peer) => {
    peer.role = peer.role === 'host' ? 'viewer' : 'host';
  });

  const newHost = peersInRoom.find((peer) => peer.role === 'host') ?? null;
  if (newHost) {
    roomHostDeviceName.set(roomId, newHost.deviceName);
  } else {
    roomHostDeviceName.delete(roomId);
  }
  return { succeeded: true, newHostDeviceName: newHost?.deviceName ?? null };
}
