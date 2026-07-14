import { useCallback, useEffect, useRef, useState } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getClientEnvironment } from '../lib/environment';

export type UpdaterStatus = 'idle' | 'checking' | 'ready' | 'installing' | 'error';

export function useUpdater() {
  const [status, setStatus] = useState<UpdaterStatus>('idle');
  const [version, setVersion] = useState<string | null>(null);
  const pendingUpdateRef = useRef<Update | null>(null);

  const runCheck = useCallback(async () => {
    if (getClientEnvironment() !== 'DESKTOP_VIEWER') return;

    setStatus('checking');
    try {
      const update = await check();
      if (!update) {
        setStatus('idle');
        return;
      }
      pendingUpdateRef.current = update;
      setVersion(update.version);
      setStatus('ready');
    } catch {
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
    } catch {
      setStatus('error');
    }
  }, []);

  const dismiss = useCallback(() => {
    setStatus('idle');
  }, []);

  return { status, version, runCheck, installNow, dismiss };
}
