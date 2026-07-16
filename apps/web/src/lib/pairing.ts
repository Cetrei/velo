import { invoke } from '@tauri-apps/api/core';

const DEFAULT_SIGNALING_PORT = '4001';

/**
 * Resolves the signaling server's base URL.
 *
 * Production: uses VITE_SIGNALING_URL, a build-time env var (e.g. https://velo-signal.cetrei.dev)
 * pointing at the Cloudflare Tunnel in front of apps/server. This is required because apps/web
 * and apps/server are deployed to different hosts (Cloudflare Pages vs. a local Docker container),
 * so the signaling server can no longer be derived from window.location.hostname + a port.
 *
 * Local development fallback: if VITE_SIGNALING_URL is unset, falls back to the current hostname
 * with the signaling port, matching how `bun run dev:server` and `bun run dev:web` run side by side
 * on localhost.
 *
 * Only used directly by the phone (MOBILE_HOST), which reaches the desktop's bundled backend
 * over the network. The desktop app itself should call resolveSignalingUrl instead, since it can
 * talk to its own bundled backend on localhost without going through this env-based lookup.
 */
export function getSignalingUrl(): string {
  const configuredUrl = import.meta.env.VITE_SIGNALING_URL as string | undefined;
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '');
  }
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  return `${protocol}//${window.location.hostname}:${DEFAULT_SIGNALING_PORT}`;
}

interface DesktopSystemConfig {
  network: { signaling_port: number };
}

async function resolveLocalBackendSignalingUrl(): Promise<string | null> {
  try {
    const systemConfig = await invoke<DesktopSystemConfig>('get_system_config');
    return `http://127.0.0.1:${systemConfig.network.signaling_port}`;
  } catch (configError) {
    console.warn('[WEB] Failed to read local backend signaling port, falling back to configured signaling URL', configError);
    return null;
  }
}

/**
 * Resolves the signaling URL for the desktop app: the bundled backend runs on the same machine,
 * so this always prefers localhost over VITE_SIGNALING_URL. Falls back to getSignalingUrl only if
 * the local backend's port cannot be read, e.g. bundled config is missing.
 *
 * TODO-ARCH: no manual override exists yet for when the bundled backend is not installed or not
 * running. Needs a settings field (and matching Rust config) before this fallback is meaningful.
 */
export async function resolveSignalingUrl(): Promise<string> {
  const localUrl = await resolveLocalBackendSignalingUrl();
  return localUrl ?? getSignalingUrl();
}

export interface PairingFromUrl {
  roomId: string;
  otp: string;
}

export function getPairingFromUrl(): PairingFromUrl | null {
  const params = new URLSearchParams(window.location.search);
  return extractPairingFromParams(params);
}

export function getPairingFromUrlString(url: string): PairingFromUrl | null {
  try {
    const parsed = new URL(url);
    return extractPairingFromParams(parsed.searchParams);
  } catch {
    return null;
  }
}

function extractPairingFromParams(params: URLSearchParams): PairingFromUrl | null {
  const roomId = params.get('room');
  const otp = params.get('otp');
  if (!roomId || !otp) {
    return null;
  }
  return { roomId, otp };
}

interface CreatePairingResponse {
  roomId: string;
  otp: string;
  expiresAt: number;
}

/**
 * creatorDeviceName is optional but should be passed whenever the caller has one available
 * (see getDeviceName in lib/device-identity.ts). The signaling server records it as the room's
 * recognized host, so that if this device disconnects and reconnects into the same room later,
 * resolveRoleForFreshJoin can give the host slot back to it instead of a race with whichever
 * device's join-room request happens to arrive first. Not required because callers other than
 * the room creator (or callers not yet updated) should still get a working, if less robust,
 * room - see apps/server/src/pairing.ts's resolveRoleForFreshJoin for the fallback behavior when
 * no creator identity was recorded.
 */
export async function createPairing(signalingUrl: string, creatorDeviceName?: string): Promise<CreatePairingResponse> {
  const response = await fetch(`${signalingUrl}/pairing/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceName: creatorDeviceName }),
  });
  if (!response.ok) {
    throw new Error('[WEB] Failed to create pairing session with signaling server');
  }
  return (await response.json()) as CreatePairingResponse;
}

export async function resolvePairingByOtp(signalingUrl: string, otp: string): Promise<PairingFromUrl> {
  const response = await fetch(`${signalingUrl}/pairing/resolve/${otp}`);
  if (!response.ok) {
    throw new Error('[WEB] No active pairing found for that code');
  }
  const body = (await response.json()) as { roomId: string };
  return { roomId: body.roomId, otp };
}

export function buildPairingUrl(baseUrl: string, roomId: string, otp: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('room', roomId);
  url.searchParams.set('otp', otp);
  return url.toString();
}

export function buildPairingDeepLink(roomId: string, otp: string): string {
  return `velo://pair?room=${encodeURIComponent(roomId)}&otp=${encodeURIComponent(otp)}`;
}
