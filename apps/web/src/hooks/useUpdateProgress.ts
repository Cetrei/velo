import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getClientEnvironment } from '../lib/environment';

export type UpdateProgressPhase =
  | 'checking_release'
  | 'downloading'
  | 'removing_old'
  | 'installing_new'
  | 'starting'
  | 'done'
  | 'failed';

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

export function describeProgressPhase(progress: UpdateProgressEvent | null): string {
  if (!progress) return '';
  switch (progress.phase) {
    case 'checking_release':
      return 'Checking latest release…';
    case 'downloading': {
      const received = formatBytes(progress.received_bytes ?? 0);
      const total = progress.total_bytes ? formatBytes(progress.total_bytes) : null;
      const speed = formatBytesPerSec(progress.bytes_per_sec ?? 0);
      return total ? `Downloading ${received} / ${total} (${speed})` : `Downloading ${received} (${speed})`;
    }
    case 'removing_old':
      return 'Removing old binary…';
    case 'installing_new':
      return 'Installing new binary…';
    case 'starting':
      return 'Starting…';
    case 'done':
      return progress.version ? `Updated to ${progress.version}` : 'Update complete';
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
    removing_old: 0.75,
    installing_new: 0.85,
    starting: 0.95,
    done: 1,
    failed: 0,
  };

  if (progress.phase === 'downloading' && progress.total_bytes) {
    const downloadFraction = (progress.received_bytes ?? 0) / progress.total_bytes;
    return 0.1 + downloadFraction * 0.6;
  }

  return phaseWeights[progress.phase];
}
