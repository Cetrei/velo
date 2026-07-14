import { useCallback, useEffect, useRef, useState } from 'react';
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';
import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';
import { getClientEnvironment } from '../lib/environment';
import type { UpdateProgressEvent } from './useUpdateProgress';

export type UpdaterStatus = 'idle' | 'checking' | 'ready' | 'installing' | 'error';

const PROGRESS_EMIT_INTERVAL_MS = 150;

/// Adapts the Tauri updater plugin's own DownloadEvent shape (Started /
/// Progress / Finished, chunked) into the same UpdateProgressEvent shape
/// the backend updater emits, so both rows in the Updates tab can share
/// one progress bar and phase-description renderer instead of each having
/// bespoke UI.
function createDownloadProgressTracker(onProgress: (progress: UpdateProgressEvent) => void) {
  let receivedBytes = 0;
  let totalBytes: number | undefined;
  let startedAt = 0;
  let lastEmitAt = 0;

  return function trackEvent(event: DownloadEvent) {
    if (event.event === 'Started') {
      totalBytes = event.data.contentLength ?? undefined;
      startedAt = Date.now();
      lastEmitAt = 0;
      onProgress({ phase: 'downloading', received_bytes: 0, total_bytes: totalBytes, bytes_per_sec: 0 });
      return;
    }
    if (event.event === 'Progress') {
      receivedBytes += event.data.chunkLength;
      const now = Date.now();
      if (now - lastEmitAt < PROGRESS_EMIT_INTERVAL_MS) return;
      lastEmitAt = now;
      const elapsedSeconds = Math.max((now - startedAt) / 1000, 0.001);
      const bytesPerSec = Math.round(receivedBytes / elapsedSeconds);
      onProgress({ phase: 'downloading', received_bytes: receivedBytes, total_bytes: totalBytes, bytes_per_sec: bytesPerSec });
      return;
    }
    onProgress({ phase: 'installing_new' });
  };
}

export function useUpdater() {
  const [status, setStatus] = useState<UpdaterStatus>('idle');
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [progress, setProgress] = useState<UpdateProgressEvent | null>(null);
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
    setProgress({ phase: 'checking_release' });
    const trackEvent = createDownloadProgressTracker(setProgress);
    try {
      await update.downloadAndInstall(trackEvent);
      setProgress({ phase: 'done', version: update.version });
      await relaunch();
    } catch (error) {
      console.warn('[DESKTOP_UPDATER] failed to install desktop update', error);
      setProgress({ phase: 'failed', message: 'Failed to download or install the update' });
      setStatus('error');
    }
  }, []);

  const dismiss = useCallback(() => {
    setStatus('idle');
    setProgress(null);
  }, []);

  return { status, currentVersion, latestVersion, progress, runCheck, installNow, dismiss };
}
