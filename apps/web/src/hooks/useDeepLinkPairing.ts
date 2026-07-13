import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { getPairingFromUrl, getPairingFromUrlString, type PairingFromUrl } from '../lib/pairing';

export interface DeepLinkPairingResult {
  pairing: PairingFromUrl | null;
  reset: () => void;
}

export function useDeepLinkPairing(): DeepLinkPairingResult {
  const [pairing, setPairing] = useState<PairingFromUrl | null>(() => getPairingFromUrl());

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    App.getLaunchUrl().then((result) => {
      if (!result?.url) return;
      const parsed = getPairingFromUrlString(result.url);
      if (parsed) setPairing(parsed);
    });

    const listenerHandle = App.addListener('appUrlOpen', (event) => {
      const parsed = getPairingFromUrlString(event.url);
      if (parsed) setPairing(parsed);
    });

    return () => {
      listenerHandle.then((handle) => handle.remove());
    };
  }, []);

  const reset = useCallback(() => {
    setPairing(null);
  }, []);

  return { pairing, reset };
}
