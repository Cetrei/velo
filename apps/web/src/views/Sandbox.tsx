import { useCallback, useState } from 'react';
import { getPairingFromUrl, getSignalingUrl, type PairingFromUrl } from '../lib/pairing';
import { PairingChoice } from '../components/PairingChoice';
import { PairingCodeEntry } from '../components/PairingCodeEntry';
import { StreamingView } from './Host';
import { Landing } from './Landing';
import { Downloads } from './Downloads';

type SandboxRoute = 'landing' | 'downloads' | 'enterCode';

function resolveRouteFromPath(): SandboxRoute {
  return window.location.pathname.startsWith('/downloads') ? 'downloads' : 'landing';
}

export function Sandbox() {
  const [urlPairing] = useState<PairingFromUrl | null>(() => getPairingFromUrl());
  const [route, setRoute] = useState<SandboxRoute>(() => resolveRouteFromPath());
  const [hasChosenBrowser, setHasChosenBrowser] = useState(false);
  const [activePairing, setActivePairing] = useState<PairingFromUrl | null>(null);

  const handleContinueInBrowser = useCallback(() => {
    if (!urlPairing) return;
    setActivePairing(urlPairing);
    setHasChosenBrowser(true);
  }, [urlPairing]);

  const handleExit = useCallback(() => {
    setActivePairing(null);
    setHasChosenBrowser(false);
    setRoute('landing');
  }, []);

  if (activePairing) {
    return <StreamingView pairing={activePairing} onExit={handleExit} />;
  }

  if (urlPairing && !hasChosenBrowser) {
    return <PairingChoice pairing={urlPairing} onContinueInBrowser={handleContinueInBrowser} />;
  }

  if (route === 'downloads') {
    return <Downloads />;
  }

  if (route === 'enterCode') {
    return <PairingCodeEntry signalingUrl={getSignalingUrl()} onPaired={setActivePairing} />;
  }

  return (
    <Landing
      onUseInBrowser={() => setRoute('enterCode')}
      onGoToDownloads={() => setRoute('downloads')}
    />
  );
}
