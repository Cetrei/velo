import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getClientEnvironment } from '../lib/environment';

const CORE_STATUS_POLL_INTERVAL_MS = 5000;

interface CoreStatusResponse {
  running: boolean;
  installed: boolean;
  version: string | null;
}

/// Read-only, no actions. Velo-Core installs and updates itself
/// automatically on every app startup (core_manager::ensure_core_installed_and_loaded),
/// so unlike useServerUpdater/useTunnelStatus there is no start/stop/restart/update
/// to expose here, only a periodic snapshot for the Console tab.
export function useCoreStatus() {
  const [status, setStatus] = useState<CoreStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (getClientEnvironment() !== 'DESKTOP_VIEWER') return;
    try {
      const coreStatus = await invoke<CoreStatusResponse>('get_core_status');
      setStatus(coreStatus);
      setError(null);
    } catch (statusError) {
      console.warn('[CORE_STATUS] failed to read Velo-Core status', statusError);
      setError('[WEB] Failed to read Velo-Core status');
    }
  }, []);

  useEffect(() => {
    refresh();
    const intervalId = setInterval(refresh, CORE_STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [refresh]);

  return { status, error };
}
