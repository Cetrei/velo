import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getClientEnvironment } from '../lib/environment';
import { useUpdateProgress } from './useUpdateProgress';

export type BackendUpdaterStatus = 'idle' | 'checking' | 'ready' | 'installing' | 'uninstalling' | 'starting' | 'stopping' | 'restarting' | 'error';

const BACKEND_UPDATE_PROGRESS_EVENT = 'backend-update-progress';

interface BackendStatusResponse {
  running: boolean;
  installed: boolean;
  version: string | null;
}

interface BackendUpdateInfoResponse {
  available: boolean;
  current_version: string | null;
  latest_version: string | null;
}

export function useBackendUpdater() {
  const [status, setStatus] = useState<BackendUpdaterStatus>('idle');
  const [isInstalled, setIsInstalled] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const { progress, reset: resetProgress } = useUpdateProgress(BACKEND_UPDATE_PROGRESS_EVENT);

  const applyBackendStatus = useCallback((backendStatus: BackendStatusResponse) => {
    setIsInstalled(backendStatus.installed);
    setIsRunning(backendStatus.running);
    setCurrentVersion(backendStatus.version);
  }, []);

  const loadRunningStatus = useCallback(async () => {
    if (getClientEnvironment() !== 'DESKTOP_VIEWER') return;
    try {
      const backendStatus = await invoke<BackendStatusResponse>('get_backend_status');
      applyBackendStatus(backendStatus);
    } catch (error) {
      console.warn('[BACKEND_UPDATER] failed to read running backend status', error);
    }
  }, [applyBackendStatus]);

  const runCheck = useCallback(async () => {
    if (getClientEnvironment() !== 'DESKTOP_VIEWER') return;

    setStatus('checking');
    try {
      const updateInfo = await invoke<BackendUpdateInfoResponse>('check_backend_update');
      setCurrentVersion(updateInfo.current_version);
      setLatestVersion(updateInfo.latest_version);
      setStatus(updateInfo.available ? 'ready' : 'idle');
    } catch (error) {
      console.warn('[BACKEND_UPDATER] failed to check for backend updates', error);
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
      const backendStatus = await invoke<BackendStatusResponse>('install_backend_update');
      applyBackendStatus(backendStatus);
      setLatestVersion(null);
      setStatus('idle');
    } catch (error) {
      console.warn('[BACKEND_UPDATER] failed to install backend update', error);
      setStatus('error');
    }
  }, [applyBackendStatus, resetProgress]);

  const startNow = useCallback(async () => {
    setStatus('starting');
    try {
      const backendStatus = await invoke<BackendStatusResponse>('start_backend');
      applyBackendStatus(backendStatus);
      setStatus('idle');
    } catch (error) {
      console.warn('[BACKEND_UPDATER] failed to start backend', error);
      setStatus('error');
    }
  }, [applyBackendStatus]);

  const stopNow = useCallback(async () => {
    setStatus('stopping');
    try {
      const backendStatus = await invoke<BackendStatusResponse>('stop_backend');
      applyBackendStatus(backendStatus);
      setStatus('idle');
    } catch (error) {
      console.warn('[BACKEND_UPDATER] failed to stop backend', error);
      setStatus('error');
    }
  }, [applyBackendStatus]);

  const restartNow = useCallback(async () => {
    setStatus('restarting');
    try {
      const backendStatus = await invoke<BackendStatusResponse>('restart_backend');
      applyBackendStatus(backendStatus);
      setStatus('idle');
    } catch (error) {
      console.warn('[BACKEND_UPDATER] failed to restart backend', error);
      setStatus('error');
    }
  }, [applyBackendStatus]);

  const uninstallNow = useCallback(async () => {
    setStatus('uninstalling');
    try {
      const backendStatus = await invoke<BackendStatusResponse>('uninstall_backend');
      applyBackendStatus(backendStatus);
      setLatestVersion(null);
      setStatus('idle');
    } catch (error) {
      console.warn('[BACKEND_UPDATER] failed to uninstall backend', error);
      setStatus('error');
    }
  }, [applyBackendStatus]);

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
    startNow,
    stopNow,
    restartNow,
    uninstallNow,
    dismiss,
  };
}
