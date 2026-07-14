export interface IceServerConfig {
  urls: string;
}

export interface TurnRelayConfig {
  realm: string;
  port: number;
  tls_port: number;
}

export interface ReleasesSourceConfig {
  repo: string;
}

export interface SystemConfig {
  version: string;
  network: {
    signaling_port: number;
    /** Only consumed by apps/web's vite.config.ts for the local dev server port. Not read at runtime in production; apps/web is deployed statically to Cloudflare Pages, which ignores this. */
    web_server_port: number;
    ice_servers: IceServerConfig[];
    /** Non-secret TURN relay coordinates. The actual credential is never stored here: it is minted per-request by apps/server from TURN_STATIC_AUTH_SECRET (env-only) and expires after a short TTL. Absent when no TURN relay is deployed yet, in which case the app falls back to STUN-only. */
    turn?: TurnRelayConfig;
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
  /** Where the Desktop updater and the Android in-app updater look for new releases. GitHub Releases remains the true source of version metadata and binaries, even though apps/web itself is deployed to Cloudflare Pages. Defaults to the Velo repo if config/system.yml omits this block, since older configs predate this field. */
  releases?: ReleasesSourceConfig;
}

export type ConnectionMode = 'stun_p2p' | 'cloudflare_relay' | 'usb';

export interface StunP2pConnectionConfig {
  turn?: {
    url: string;
    username: string;
    credential: string;
  };
}

export interface CloudflareRelayConnectionConfig {
  tunnel_token: string;
  /**
   * Desktop only. When true and tunnel_token is non-empty, Velo Desktop spawns and manages
   * cloudflared itself (see apps/desktop/src/tunnel_manager.rs) instead of requiring the user
   * to run `cloudflared tunnel run` manually per docs/MANUAL_STEPS.md. Ignored on mobile, since
   * only the desktop process can own a locally spawned cloudflared child process.
   */
  managed: boolean;
}

export interface ConnectionConfig {
  mode: ConnectionMode;
  stun_p2p: StunP2pConnectionConfig;
  cloudflare_relay: CloudflareRelayConnectionConfig;
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
    dev_mode_enabled: boolean;
  };
  android: {
    enable_foreground_service: boolean;
    wake_lock_level: string;
    show_notification: boolean;
  };
  connection: ConnectionConfig;
  /** Desktop only. Whether the server sidecar should autostart when the desktop app launches. Toggling this in the UI also starts or stops the live process immediately, this field only controls what happens on the next app launch. Optional because it postdates this config shape; older user.yml files on disk default to enabled. */
  server?: {
    enabled: boolean;
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

function validateTurn(turn: unknown, fieldPath: string): asserts turn is TurnRelayConfig {
  assertField(isRecord(turn), fieldPath);
  const record = turn as Record<string, unknown>;
  assertField(typeof record.realm === 'string', `${fieldPath}.realm`);
  assertField(typeof record.port === 'number', `${fieldPath}.port`);
  assertField(typeof record.tls_port === 'number', `${fieldPath}.tls_port`);
}

const DEFAULT_RELEASES_REPO = 'Cetrei/velo';

function validateReleases(releases: unknown, fieldPath: string): asserts releases is ReleasesSourceConfig {
  assertField(isRecord(releases), fieldPath);
  const record = releases as Record<string, unknown>;
  assertField(typeof record.repo === 'string' && record.repo.length > 0, `${fieldPath}.repo`);
}

function validateNetwork(network: unknown): asserts network is SystemConfig['network'] {
  assertField(isRecord(network), 'network');
  const record = network as Record<string, unknown>;
  assertField(typeof record.signaling_port === 'number', 'network.signaling_port');
  assertField(typeof record.web_server_port === 'number', 'network.web_server_port');
  validateIceServers(record.ice_servers, 'network.ice_servers');
  if (record.turn !== undefined) {
    validateTurn(record.turn, 'network.turn');
  }
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
  if (record.releases !== undefined) {
    validateReleases(record.releases, 'releases');
    return { ...record, releases: record.releases } as unknown as SystemConfig;
  }
  return { ...record, releases: { repo: DEFAULT_RELEASES_REPO } } as unknown as SystemConfig;
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
  assertField(typeof record.dev_mode_enabled === 'boolean', 'behavior.dev_mode_enabled');
}

function validateAndroid(android: unknown): asserts android is UserConfig['android'] {
  assertField(isRecord(android), 'android');
  const record = android as Record<string, unknown>;
  assertField(typeof record.enable_foreground_service === 'boolean', 'android.enable_foreground_service');
  assertField(typeof record.wake_lock_level === 'string', 'android.wake_lock_level');
  assertField(typeof record.show_notification === 'boolean', 'android.show_notification');
}

const CONNECTION_MODES: ConnectionMode[] = ['stun_p2p', 'cloudflare_relay', 'usb'];

function validateStunP2p(stunP2p: unknown, fieldPath: string): asserts stunP2p is StunP2pConnectionConfig {
  assertField(isRecord(stunP2p), fieldPath);
  const record = stunP2p as Record<string, unknown>;
  if (record.turn === undefined) return;
  assertField(isRecord(record.turn), `${fieldPath}.turn`);
  const turn = record.turn as Record<string, unknown>;
  assertField(typeof turn.url === 'string', `${fieldPath}.turn.url`);
  assertField(typeof turn.username === 'string', `${fieldPath}.turn.username`);
  assertField(typeof turn.credential === 'string', `${fieldPath}.turn.credential`);
}

const DEFAULT_CLOUDFLARE_RELAY_MANAGED = false;

function validateCloudflareRelay(cloudflareRelay: unknown, fieldPath: string): asserts cloudflareRelay is CloudflareRelayConnectionConfig {
  assertField(isRecord(cloudflareRelay), fieldPath);
  const record = cloudflareRelay as Record<string, unknown>;
  assertField(typeof record.tunnel_token === 'string', `${fieldPath}.tunnel_token`);
  if (record.managed === undefined) {
    record.managed = DEFAULT_CLOUDFLARE_RELAY_MANAGED;
    return;
  }
  assertField(typeof record.managed === 'boolean', `${fieldPath}.managed`);
}

function validateConnection(connection: unknown): asserts connection is ConnectionConfig {
  assertField(isRecord(connection), 'connection');
  const record = connection as Record<string, unknown>;
  assertField(typeof record.mode === 'string' && CONNECTION_MODES.includes(record.mode as ConnectionMode), 'connection.mode');
  validateStunP2p(record.stun_p2p, 'connection.stun_p2p');
  validateCloudflareRelay(record.cloudflare_relay, 'connection.cloudflare_relay');
}

const DEFAULT_SERVER_ENABLED = true;

function validateServer(server: unknown, fieldPath: string): asserts server is NonNullable<UserConfig['server']> {
  assertField(isRecord(server), fieldPath);
  const record = server as Record<string, unknown>;
  assertField(typeof record.enabled === 'boolean', `${fieldPath}.enabled`);
}

export function validateUserConfig(value: unknown): UserConfig {
  assertField(isRecord(value), 'root');
  const record = value as Record<string, unknown>;
  validateVideo(record.video);
  validateBehavior(record.behavior);
  validateAndroid(record.android);
  validateConnection(record.connection);
  if (record.server !== undefined) {
    validateServer(record.server, 'server');
    return { ...record, server: record.server } as unknown as UserConfig;
  }
  const legacyBackend = record.backend;
  if (isRecord(legacyBackend) && typeof legacyBackend.enabled === 'boolean') {
    return { ...record, server: { enabled: legacyBackend.enabled } } as unknown as UserConfig;
  }
  return { ...record, server: { enabled: DEFAULT_SERVER_ENABLED } } as unknown as UserConfig;
}
