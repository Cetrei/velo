import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getClientEnvironment } from '../lib/environment';

interface TunnelStatusResponse {
  running: boolean;
  installed: boolean;
  version: string | null;
}

export function useTunnelStatus(managed: boolean) {
  const [status, setStatus] = useState<TunnelStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (getClientEnvironment() !== 'DESKTOP_VIEWER') return;
    try {
      const tunnelStatus = await invoke<TunnelStatusResponse>('get_tunnel_status');
      setStatus(tunnelStatus);
      setError(null);
    } catch (statusError) {
      console.warn('[TUNNEL_STATUS] failed to read managed tunnel status', statusError);
      setError('[WEB] Failed to read managed tunnel status');
    }
  }, []);

  useEffect(() => {
    if (!managed) return;
    refresh();
  }, [managed, refresh]);

  return { status, error, refresh };
}
