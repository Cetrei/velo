export interface IceServerConfig {
  urls: string;
}

export interface SystemConfig {
  version: string;
  network: {
    signaling_port: number;
    /** Only consumed by apps/web's vite.config.ts for the local dev server port. Not read at runtime in production; apps/web is deployed statically to Cloudflare Pages, which ignores this. */
    web_server_port: number;
    ice_servers: IceServerConfig[];
  };
  webrtc: {
    sdp_semantics: string;
    max_packet_size: number;
    rtp_timeout_ms: number;
  };
  driver: {
    windows_com_clsid: string;
    device_friendly_name: string;
    format: string;
  };
  logging: {
    level: string;
    format: string;
  };
}

export interface UserConfig {
  video: {
    resolution: { width: number; height: number };
    target_fps: number;
    max_bitrate_kbps: number;
  };
  behavior: {
    launch_on_boot: boolean;
    minimize_to_tray: boolean;
    enable_reconnection_loop: boolean;
    reconnection_interval_ms: number;
  };
  android: {
    enable_foreground_service: boolean;
    wake_lock_level: string;
    show_notification: boolean;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assertField(condition: boolean, fieldPath: string): void {
  if (!condition) {
    throw new Error(`[CONFIG] Missing or invalid field: ${fieldPath}`);
  }
}

function validateIceServers(value: unknown, fieldPath: string): asserts value is IceServerConfig[] {
  assertField(Array.isArray(value) && value.length > 0, fieldPath);
  for (const entry of value as unknown[]) {
    assertField(isRecord(entry) && typeof entry.urls === 'string', `${fieldPath}[].urls`);
  }
}

function validateNetwork(network: unknown): asserts network is SystemConfig['network'] {
  assertField(isRecord(network), 'network');
  const record = network as Record<string, unknown>;
  assertField(typeof record.signaling_port === 'number', 'network.signaling_port');
  assertField(typeof record.web_server_port === 'number', 'network.web_server_port');
  validateIceServers(record.ice_servers, 'network.ice_servers');
}

function validateWebrtc(webrtc: unknown): asserts webrtc is SystemConfig['webrtc'] {
  assertField(isRecord(webrtc), 'webrtc');
  const record = webrtc as Record<string, unknown>;
  assertField(typeof record.sdp_semantics === 'string', 'webrtc.sdp_semantics');
  assertField(typeof record.max_packet_size === 'number', 'webrtc.max_packet_size');
  assertField(typeof record.rtp_timeout_ms === 'number', 'webrtc.rtp_timeout_ms');
}

function validateDriver(driver: unknown): asserts driver is SystemConfig['driver'] {
  assertField(isRecord(driver), 'driver');
  const record = driver as Record<string, unknown>;
  assertField(typeof record.windows_com_clsid === 'string', 'driver.windows_com_clsid');
  assertField(typeof record.device_friendly_name === 'string', 'driver.device_friendly_name');
  assertField(typeof record.format === 'string', 'driver.format');
}

function validateLogging(logging: unknown): asserts logging is SystemConfig['logging'] {
  assertField(isRecord(logging), 'logging');
  const record = logging as Record<string, unknown>;
  assertField(typeof record.level === 'string', 'logging.level');
  assertField(typeof record.format === 'string', 'logging.format');
}

export function validateSystemConfig(value: unknown): SystemConfig {
  assertField(isRecord(value), 'root');
  const record = value as Record<string, unknown>;
  assertField(typeof record.version === 'string', 'version');
  validateNetwork(record.network);
  validateWebrtc(record.webrtc);
  validateDriver(record.driver);
  validateLogging(record.logging);
  return record as unknown as SystemConfig;
}

function validateResolution(resolution: unknown): asserts resolution is { width: number; height: number } {
  assertField(isRecord(resolution), 'video.resolution');
  const record = resolution as Record<string, unknown>;
  assertField(typeof record.width === 'number', 'video.resolution.width');
  assertField(typeof record.height === 'number', 'video.resolution.height');
}

function validateVideo(video: unknown): asserts video is UserConfig['video'] {
  assertField(isRecord(video), 'video');
  const record = video as Record<string, unknown>;
  validateResolution(record.resolution);
  assertField(typeof record.target_fps === 'number', 'video.target_fps');
  assertField(typeof record.max_bitrate_kbps === 'number', 'video.max_bitrate_kbps');
}

function validateBehavior(behavior: unknown): asserts behavior is UserConfig['behavior'] {
  assertField(isRecord(behavior), 'behavior');
  const record = behavior as Record<string, unknown>;
  assertField(typeof record.launch_on_boot === 'boolean', 'behavior.launch_on_boot');
  assertField(typeof record.minimize_to_tray === 'boolean', 'behavior.minimize_to_tray');
  assertField(typeof record.enable_reconnection_loop === 'boolean', 'behavior.enable_reconnection_loop');
  assertField(typeof record.reconnection_interval_ms === 'number', 'behavior.reconnection_interval_ms');
}

function validateAndroid(android: unknown): asserts android is UserConfig['android'] {
  assertField(isRecord(android), 'android');
  const record = android as Record<string, unknown>;
  assertField(typeof record.enable_foreground_service === 'boolean', 'android.enable_foreground_service');
  assertField(typeof record.wake_lock_level === 'string', 'android.wake_lock_level');
  assertField(typeof record.show_notification === 'boolean', 'android.show_notification');
}

export function validateUserConfig(value: unknown): UserConfig {
  assertField(isRecord(value), 'root');
  const record = value as Record<string, unknown>;
  validateVideo(record.video);
  validateBehavior(record.behavior);
  validateAndroid(record.android);
  return record as unknown as UserConfig;
}
