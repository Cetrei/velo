import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getClientEnvironment } from '../lib/environment';
import { useUpdateProgress } from './useUpdateProgress';

export type ServerUpdaterStatus =
  | 'idle'
  | 'checking'
  | 'ready'
  | 'installing'
  | 'cancelled'
  | 'uninstalling'
  | 'starting'
  | 'stopping'
  | 'restarting'
  | 'error';

const SERVER_UPDATE_PROGRESS_EVENT = 'server-update-progress';

interface ServerStatusResponse {
  running: boolean;
  installed: boolean;
  version: string | null;
}

interface ServerUpdateInfoResponse {
  available: boolean;
  current_version: string | null;
  latest_version: string | null;
}

export function useServerUpdater() {
  const [status, setStatus] = useState<ServerUpdaterStatus>('idle');
  const [isInstalled, setIsInstalled] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const { progress, reset: resetProgress } = useUpdateProgress(SERVER_UPDATE_PROGRESS_EVENT);

  const applyServerStatus = useCallback((serverStatus: ServerStatusResponse) => {
    setIsInstalled(serverStatus.installed);
    setIsRunning(serverStatus.running);
    setCurrentVersion(serverStatus.version);
  }, []);

  const loadRunningStatus = useCallback(async () => {
    if (getClientEnvironment() !== 'DESKTOP_VIEWER') return;
    try {
      const serverStatus = await invoke<ServerStatusResponse>('get_server_status');
      applyServerStatus(serverStatus);
    } catch (error) {
      console.warn('[SERVER_UPDATER] failed to read running server status', error);
    }
  }, [applyServerStatus]);

  const runCheck = useCallback(async () => {
    if (getClientEnvironment() !== 'DESKTOP_VIEWER') return;

    setStatus('checking');
    try {
      const updateInfo = await invoke<ServerUpdateInfoResponse>('check_server_update');
      setCurrentVersion(updateInfo.current_version);
      setLatestVersion(updateInfo.latest_version);
      setStatus(updateInfo.available ? 'ready' : 'idle');
    } catch (error) {
      console.warn('[SERVER_UPDATER] failed to check for server updates', error);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    loadRunningStatus();
    runCheck();
  }, [loadRunningStatus, runCheck]);

  const installNow = useCallback(async () => {
    setStatus('installing');
    resetProgress();
    try {
      const serverStatus = await invoke<ServerStatusResponse>('install_server_update');
      applyServerStatus(serverStatus);
      setLatestVersion(null);
      setStatus('idle');
    } catch (error) {
      const wasCancelled = typeof error === 'string' && error === 'cancelled';
      if (wasCancelled) {
        setStatus('cancelled');
        return;
      }
      console.warn('[SERVER_UPDATER] failed to install server update', error);
      setStatus('error');
    }
  }, [applyServerStatus, resetProgress]);

  const installFromFile = useCallback(
    async (file: File) => {
      setStatus('installing');
      resetProgress();
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const serverStatus = await invoke<ServerStatusResponse>('install_server_from_bytes', { bytes: Array.from(bytes) });
        applyServerStatus(serverStatus);
        setLatestVersion(null);
        setStatus('idle');
      } catch (error) {
        console.warn('[SERVER_UPDATER] failed to install server from a local file', error);
        setStatus('error');
      }
    },
    [applyServerStatus, resetProgress],
  );

  const startNow = useCallback(async () => {
    setStatus('starting');
    try {
      const serverStatus = await invoke<ServerStatusResponse>('start_server');
      applyServerStatus(serverStatus);
      setStatus('idle');
    } catch (error) {
      console.warn('[SERVER_UPDATER] failed to start server', error);
      setStatus('error');
    }
  }, [applyServerStatus]);

  const stopNow = useCallback(async () => {
    setStatus('stopping');
    try {
      const serverStatus = await invoke<ServerStatusResponse>('stop_server');
      applyServerStatus(serverStatus);
      setStatus('idle');
    } catch (error) {
      console.warn('[SERVER_UPDATER] failed to stop server', error);
      setStatus('error');
    }
  }, [applyServerStatus]);

  const restartNow = useCallback(async () => {
    setStatus('restarting');
    try {
      const serverStatus = await invoke<ServerStatusResponse>('restart_server');
      applyServerStatus(serverStatus);
      setStatus('idle');
    } catch (error) {
      console.warn('[SERVER_UPDATER] failed to restart server', error);
      setStatus('error');
    }
  }, [applyServerStatus]);

  const cancelNow = useCallback(async () => {
    try {
      await invoke('cancel_server_update');
    } catch (error) {
      console.warn('[SERVER_UPDATER] failed to cancel server update', error);
    }
  }, []);

  const uninstallNow = useCallback(async () => {
    setStatus('uninstalling');
    try {
      const serverStatus = await invoke<ServerStatusResponse>('uninstall_server');
      applyServerStatus(serverStatus);
      setLatestVersion(null);
      setStatus('idle');
    } catch (error) {
      console.warn('[SERVER_UPDATER] failed to uninstall server', error);
      setStatus('error');
    }
  }, [applyServerStatus]);

  const dismiss = useCallback(() => {
    setStatus('idle');
  }, []);

  return {
    status,
    isInstalled,
    isRunning,
    currentVersion,
    latestVersion,
    progress,
    runCheck,
    installNow,
    installFromFile,
    cancelNow,
    startNow,
    stopNow,
    restartNow,
    uninstallNow,
    dismiss,
  };
}
