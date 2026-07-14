import { useCallback, useEffect, useState } from 'react';
import { Preferences } from '@capacitor/preferences';

/**
 * Android-only developer diagnostics toggle. Backed by Capacitor Preferences, mirroring
 * useLocalConnectionConfig, since Android has no config/user.yml of its own (that file lives
 * on Desktop only). Toggling this updates React state directly, so the Console nav section
 * appears or disappears immediately without an app restart.
 */
const STORAGE_KEY = 'velo:dev-mode-enabled';

export function useLocalDevMode() {
  const [isDevModeEnabled, setIsDevModeEnabled] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    Preferences.get({ key: STORAGE_KEY })
      .then(({ value }) => setIsDevModeEnabled(value === 'true'))
      .catch(() => console.warn('[WEB] Failed to read dev mode preference from device storage'))
      .finally(() => setIsLoaded(true));
  }, []);

  const setDevModeEnabled = useCallback((nextEnabled: boolean) => {
    setIsDevModeEnabled(nextEnabled);
    Preferences.set({ key: STORAGE_KEY, value: String(nextEnabled) }).catch(() => {
      console.warn('[WEB] Failed to persist dev mode preference to device storage');
    });
  }, []);

  return { isDevModeEnabled, setDevModeEnabled, isLoaded };
}
