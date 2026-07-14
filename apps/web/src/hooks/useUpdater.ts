import { useCallback, useEffect, useRef, useState } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';
import { getClientEnvironment } from '../lib/environment';

export type UpdaterStatus = 'idle' | 'checking' | 'ready' | 'installing' | 'error';

export function useUpdater() {
  const [status, setStatus] = useState<UpdaterStatus>('idle');
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const pendingUpdateRef = useRef<Update | null>(null);

  const runCheck = useCallback(async () => {
    if (getClientEnvironment() !== 'DESKTOP_VIEWER') return;

    setStatus('checking');
    try {
      const [installedVersion, update] = await Promise.all([getVersion(), check()]);
      setCurrentVersion(installedVersion);

      if (!update) {
        setLatestVersion(null);
        setStatus('idle');
        return;
      }
      pendingUpdateRef.current = update;
      setLatestVersion(update.version);
      setStatus('ready');
    } catch (error) {
      console.warn('[DESKTOP_UPDATER] failed to check for desktop updates', error);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  const installNow = useCallback(async () => {
    const update = pendingUpdateRef.current;
    if (!update) return;

    setStatus('installing');
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch (error) {
      console.warn('[DESKTOP_UPDATER] failed to install desktop update', error);
      setStatus('error');
    }
  }, []);

  const dismiss = useCallback(() => {
    setStatus('idle');
  }, []);

  return { status, currentVersion, latestVersion, runCheck, installNow, dismiss };
}
