import { useCallback, useEffect, useState } from 'react';
import { Preferences } from '@capacitor/preferences';
import type { ConnectionConfig } from 'shared-types';

/**
 * Backed by Capacitor Preferences instead of raw localStorage. On native Android this
 * survives APK updates the same way SharedPreferences does; on plain browser/WEB_SANDBOX
 * Capacitor's own web implementation transparently falls back to localStorage, so no
 * environment branching is needed here.
 */
const STORAGE_KEY = 'velo:connection-config';

const DEFAULT_CONNECTION_CONFIG: ConnectionConfig = {
  mode: 'stun_p2p',
  stun_p2p: {},
  cloudflare_relay: { tunnel_token: '', managed: false },
};

function parseStoredConnectionConfig(raw: string | null): ConnectionConfig {
  if (!raw) return DEFAULT_CONNECTION_CONFIG;

  try {
    return { ...DEFAULT_CONNECTION_CONFIG, ...JSON.parse(raw) };
  } catch {
    console.warn('[WEB] Failed to parse stored connection config, using defaults');
    return DEFAULT_CONNECTION_CONFIG;
  }
}

export function useLocalConnectionConfig() {
  const [connection, setConnection] = useState<ConnectionConfig>(DEFAULT_CONNECTION_CONFIG);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    Preferences.get({ key: STORAGE_KEY })
      .then(({ value }) => setConnection(parseStoredConnectionConfig(value)))
      .catch(() => console.warn('[WEB] Failed to read connection config from device storage'))
      .finally(() => setIsLoaded(true));
  }, []);

  const saveConnection = useCallback((next: ConnectionConfig) => {
    setConnection(next);
    Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(next) }).catch(() => {
      console.warn('[WEB] Failed to persist connection config to device storage');
    });
  }, []);

  return { connection, saveConnection, isLoaded };
}
