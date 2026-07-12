import { io, type Socket } from 'socket.io-client';

interface SystemConfigResponse {
  ice_servers: RTCIceServer[];
  signaling_port: number;
}

interface UserConfigResponse {
  reconnection_interval_ms: number;
  enable_reconnection_loop: boolean;
  target_fps: number;
}

let cachedSystemConfig: SystemConfigResponse | null = null;
let cachedUserConfig: UserConfigResponse | null = null;

async function fetchConfig<T>(url: string, cache: T | null, setCache: (value: T) => void): Promise<T> {
  if (cache !== null) {
    return cache;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`[WEB] Failed to fetch config from ${url}`);
  }
  const parsed = (await response.json()) as T;
  setCache(parsed);
  return parsed;
}

export function loadSystemConfig(signalingUrl: string): Promise<SystemConfigResponse> {
  return fetchConfig(`${signalingUrl}/config/system`, cachedSystemConfig, (value) => {
    cachedSystemConfig = value;
  });
}

export function loadUserConfig(signalingUrl: string): Promise<UserConfigResponse> {
  return fetchConfig(`${signalingUrl}/config/user`, cachedUserConfig, (value) => {
    cachedUserConfig = value;
  });
}

export function createSignalingSocket(signalingUrl: string): Socket {
  return io(signalingUrl, { transports: ['websocket'] });
}
