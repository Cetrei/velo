import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getClientEnvironment } from '../lib/environment';
import { useUpdateProgress } from './useUpdateProgress';

const TUNNEL_UPDATE_PROGRESS_EVENT = 'tunnel-update-progress';

export type TunnelActionStatus = 'idle' | 'restarting' | 'stopping' | 'error';

interface TunnelStatusResponse {
  running: boolean;
  installed: boolean;
  version: string | null;
}

export function useTunnelStatus(managed: boolean) {
  const [status, setStatus] = useState<TunnelStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<TunnelActionStatus>('idle');
  const { progress, reset: resetProgress } = useUpdateProgress(TUNNEL_UPDATE_PROGRESS_EVENT);

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

  const restartNow = useCallback(async () => {
    setActionStatus('restarting');
    resetProgress();
    try {
      const tunnelStatus = await invoke<TunnelStatusResponse>('restart_managed_tunnel');
      setStatus(tunnelStatus);
      setError(null);
      setActionStatus('idle');
    } catch (restartError) {
      console.warn('[TUNNEL_STATUS] failed to restart managed tunnel', restartError);
      setError('[WEB] Failed to restart managed tunnel');
      setActionStatus('error');
    }
  }, [resetProgress]);

  const stopNow = useCallback(async () => {
    setActionStatus('stopping');
    try {
      const tunnelStatus = await invoke<TunnelStatusResponse>('stop_managed_tunnel');
      setStatus(tunnelStatus);
      setError(null);
      setActionStatus('idle');
    } catch (stopError) {
      console.warn('[TUNNEL_STATUS] failed to stop managed tunnel', stopError);
      setError('[WEB] Failed to stop managed tunnel');
      setActionStatus('error');
    }
  }, []);

  return { status, error, actionStatus, progress, refresh, restartNow, stopNow };
}
