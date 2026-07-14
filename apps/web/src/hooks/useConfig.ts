import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { UserConfig } from 'shared-types';
import { getClientEnvironment } from '../lib/environment';

export type { UserConfig };

const NOT_DESKTOP_ERROR = '[WEB] Connection and video settings can only be changed from the Velo Desktop app';

export function useConfig() {
  const [config, setConfig] = useState<UserConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isDesktop = getClientEnvironment() === 'DESKTOP_VIEWER';

  useEffect(() => {
    if (!isDesktop) {
      setError(NOT_DESKTOP_ERROR);
      return;
    }
    invoke<UserConfig>('get_user_config')
      .then(setConfig)
      .catch(() => setError('[WEB] Failed to load user config from desktop backend'));
  }, [isDesktop]);

  const saveConfig = useCallback(
    async (nextConfig: UserConfig) => {
      if (!isDesktop) {
        throw new Error(NOT_DESKTOP_ERROR);
      }
      await invoke('save_user_config', { newConfig: nextConfig });
      setConfig(nextConfig);
    },
    [isDesktop],
  );

  return { config, error, saveConfig, isDesktop };
}
