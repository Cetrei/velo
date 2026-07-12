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
 */
export function getSignalingUrl(): string {
  const configuredUrl = import.meta.env.VITE_SIGNALING_URL as string | undefined;
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '');
  }
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  return `${protocol}//${window.location.hostname}:${DEFAULT_SIGNALING_PORT}`;
}

export function getRoomIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('room');
}

export function generateRoomId(): string {
  return crypto.randomUUID();
}

export function buildPairingUrl(baseUrl: string, roomId: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('room', roomId);
  return url.toString();
}
