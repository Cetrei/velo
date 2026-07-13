import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { UserConfig } from 'shared-types';

export type { UserConfig };

export function useConfig() {
  const [config, setConfig] = useState<UserConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<UserConfig>('get_user_config')
      .then(setConfig)
      .catch(() => setError('[WEB] Failed to load user config from desktop backend'));
  }, []);

  const saveConfig = useCallback(async (nextConfig: UserConfig) => {
    await invoke('save_user_config', { newConfig: nextConfig });
    setConfig(nextConfig);
  }, []);

  return { config, error, saveConfig };
}
