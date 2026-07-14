import { useEffect, useState } from 'react';
import { getSignalingUrl, resolveSignalingUrl } from '../lib/pairing';

/**
 * Desktop only. Starts with the env-based fallback so the UI has something to render
 * immediately, then swaps to the bundled backend's localhost URL once resolved.
 */
export function useSignalingUrl(): string {
  const [signalingUrl, setSignalingUrl] = useState(() => getSignalingUrl());

  useEffect(() => {
    let cancelled = false;

    resolveSignalingUrl().then((resolvedUrl) => {
      if (!cancelled) setSignalingUrl(resolvedUrl);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return signalingUrl;
}
