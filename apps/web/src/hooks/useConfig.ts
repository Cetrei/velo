import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface UserConfig {
  video: {
    resolution: { width: number; height: number };
    target_fps: number;
    max_bitrate_kbps: number;
  };
  behavior: {
    launch_on_boot: boolean;
    minimize_to_tray: boolean;
    enable_reconnection_loop: boolean;
    reconnection_interval_ms: number;
  };
  android: {
    enable_foreground_service: boolean;
    wake_lock_level: string;
    show_notification: boolean;
  };
}

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
