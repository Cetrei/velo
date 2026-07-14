import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getClientEnvironment } from '../lib/environment';

export type UpdateProgressPhase =
  | 'checking_release'
  | 'downloading'
  | 'paused'
  | 'verifying'
  | 'backing_up'
  | 'removing_old'
  | 'installing_new'
  | 'starting'
  | 'done'
  | 'cancelled'
  | 'failed'
  | 'rolled_back';

export interface UpdateProgressEvent {
  phase: UpdateProgressPhase;
  received_bytes?: number;
  total_bytes?: number | null;
  bytes_per_sec?: number;
  version?: string;
  message?: string;
}

export function useUpdateProgress(eventName: string) {
  const [progress, setProgress] = useState<UpdateProgressEvent | null>(null);

  useEffect(() => {
    if (getClientEnvironment() !== 'DESKTOP_VIEWER') return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    listen<UpdateProgressEvent>(eventName, (event) => {
      setProgress(event.payload);
    })
      .then((stop) => {
        if (cancelled) {
          stop();
          return;
        }
        unlisten = stop;
      })
      .catch((error) => {
        console.warn(`[UPDATE_PROGRESS] failed to listen for ${eventName}`, error);
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [eventName]);

  function reset() {
    setProgress(null);
  }

  return { progress, reset };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;
  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(1)} MB`;
}

export function formatBytesPerSec(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatSecondsRemaining(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s left`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} min left`;
}

export function estimateSecondsRemaining(progress: UpdateProgressEvent | null): number | null {
  if (!progress || progress.phase !== 'downloading') return null;
  const { received_bytes: received, total_bytes: total, bytes_per_sec: speed } = progress;
  if (!total || !speed || received === undefined || speed <= 0) return null;
  const remainingBytes = total - received;
  if (remainingBytes <= 0) return 0;
  return remainingBytes / speed;
}

export function describeProgressPhase(progress: UpdateProgressEvent | null): string {
  if (!progress) return '';
  switch (progress.phase) {
    case 'checking_release':
      return 'Checking for the latest release…';
    case 'downloading': {
      const received = formatBytes(progress.received_bytes ?? 0);
      const total = progress.total_bytes ? formatBytes(progress.total_bytes) : null;
      const speed = formatBytesPerSec(progress.bytes_per_sec ?? 0);
      const secondsRemaining = estimateSecondsRemaining(progress);
      const remainingLabel = secondsRemaining !== null ? `, ${formatSecondsRemaining(secondsRemaining)}` : '';
      return total
        ? `Downloading ${received} of ${total} (${speed}${remainingLabel})`
        : `Downloading ${received} (${speed})`;
    }
    case 'paused':
      return 'Paused, ready to resume…';
    case 'verifying':
      return 'Verifying download…';
    case 'backing_up':
      return 'Backing up the current version…';
    case 'removing_old':
      return 'Removing the old version…';
    case 'installing_new':
      return 'Installing the new version…';
    case 'starting':
      return 'Starting the updated backend…';
    case 'done':
      return progress.version ? `Updated to ${progress.version}` : 'Update complete';
    case 'cancelled':
      return 'Update cancelled';
    case 'rolled_back':
      return progress.message ?? 'Update failed, rolled back to the previous version';
    case 'failed':
      return progress.message ?? 'Update failed';
    default:
      return '';
  }
}

export function progressPhaseFraction(progress: UpdateProgressEvent | null): number | null {
  if (!progress) return null;
  const phaseWeights: Record<UpdateProgressPhase, number> = {
    checking_release: 0.05,
    downloading: 0.1,
    paused: 0.1,
    verifying: 0.7,
    backing_up: 0.75,
    removing_old: 0.75,
    installing_new: 0.85,
    starting: 0.95,
    done: 1,
    cancelled: 0,
    failed: 0,
    rolled_back: 0,
  };

  if (progress.phase === 'downloading' && progress.total_bytes) {
    const downloadFraction = (progress.received_bytes ?? 0) / progress.total_bytes;
    return 0.1 + downloadFraction * 0.6;
  }

  return phaseWeights[progress.phase];
}
