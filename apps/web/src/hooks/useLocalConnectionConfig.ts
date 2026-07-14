import { useCallback, useState } from 'react';
import type { ConnectionConfig } from 'shared-types';

const STORAGE_KEY = 'velo:connection-config';

const DEFAULT_CONNECTION_CONFIG: ConnectionConfig = {
  mode: 'stun_p2p',
  stun_p2p: {},
  cloudflare_relay: { tunnel_token: '' },
};

function readStoredConnectionConfig(): ConnectionConfig {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_CONNECTION_CONFIG;

  try {
    return { ...DEFAULT_CONNECTION_CONFIG, ...JSON.parse(raw) };
  } catch {
    console.warn('[WEB] Failed to parse stored connection config, using defaults');
    return DEFAULT_CONNECTION_CONFIG;
  }
}

export function useLocalConnectionConfig() {
  const [connection, setConnection] = useState<ConnectionConfig>(readStoredConnectionConfig);

  const saveConnection = useCallback((next: ConnectionConfig) => {
    setConnection(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  return { connection, saveConnection };
}
