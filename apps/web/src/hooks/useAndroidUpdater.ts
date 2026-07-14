import { useCallback, useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { fetchPublishedReleases, getReleasesRepo, type VeloRelease } from '../lib/releases';
import { VeloUpdater } from '../lib/android-updater';
import { getClientEnvironment } from '../lib/environment';

export type AndroidUpdaterStatus = 'idle' | 'checking' | 'ready' | 'downloading' | 'installing' | 'error';

function parseVersionParts(versionName: string): number[] {
  return versionName.split('.').map((part) => Number.parseInt(part, 10) || 0);
}

function isNewerVersion(candidate: string, current: string): boolean {
  const candidateParts = parseVersionParts(candidate);
  const currentParts = parseVersionParts(current);
  const length = Math.max(candidateParts.length, currentParts.length);

  for (let index = 0; index < length; index += 1) {
    const candidatePart = candidateParts[index] ?? 0;
    const currentPart = currentParts[index] ?? 0;
    if (candidatePart !== currentPart) return candidatePart > currentPart;
  }
  return false;
}

export function useAndroidUpdater() {
  const [status, setStatus] = useState<AndroidUpdaterStatus>('idle');
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [availableRelease, setAvailableRelease] = useState<VeloRelease | null>(null);

  const runCheck = useCallback(async () => {
    if (getClientEnvironment() !== 'MOBILE_HOST') return;

    setStatus('checking');
    try {
      const [appInfo, releases] = await Promise.all([App.getInfo(), fetchPublishedReleases(getReleasesRepo())]);
      setCurrentVersion(appInfo.version);
      const latestWithAndroidAsset = releases.find((release) => release.androidAsset !== null);

      if (!latestWithAndroidAsset || !isNewerVersion(latestWithAndroidAsset.versionName, appInfo.version)) {
        setAvailableRelease(null);
        setStatus('idle');
        return;
      }

      setAvailableRelease(latestWithAndroidAsset);
      setStatus('ready');
    } catch (error) {
      console.warn('[ANDROID_UPDATER] failed to check for android updates', error);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  const installNow = useCallback(async () => {
    const release = availableRelease;
    const apkAsset = release?.androidAsset;
    if (!apkAsset) return;

    setStatus('downloading');
    try {
      const permission = await VeloUpdater.canRequestInstallPackages();
      if (!permission.granted) {
        await VeloUpdater.requestInstallPackagesPermission();
        setStatus('error');
        return;
      }

      setStatus('installing');
      await VeloUpdater.downloadAndInstall({ downloadUrl: apkAsset.downloadUrl });
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }, [availableRelease]);

  const dismiss = useCallback(() => {
    setStatus('idle');
  }, []);

  return { status, currentVersion, version: availableRelease?.versionName ?? null, runCheck, installNow, dismiss };
}
