import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getClientEnvironment } from './lib/environment';
import { Host } from './views/Host';
import { Viewer } from './views/Viewer';
import { Sandbox } from './views/Sandbox';

function useCloseSplashscreenWhenReady(environment: ReturnType<typeof getClientEnvironment>): void {
  useEffect(() => {
    if (environment !== 'DESKTOP_VIEWER') {
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        invoke('close_splashscreen').catch((error) => {
          console.error('[WEB] close_splashscreen invoke failed, main window will stay hidden', error);
        });
      });
    });
  }, [environment]);
}

export function App() {
  const environment = getClientEnvironment();
  useCloseSplashscreenWhenReady(environment);

  if (environment === 'MOBILE_HOST') return <Host />;
  if (environment === 'DESKTOP_VIEWER') return <Viewer />;
  return <Sandbox />;
}
