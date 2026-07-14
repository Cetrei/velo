import { useEffect, useState } from 'react';
import { fetchPublishedReleases, type VeloRelease } from '../lib/releases';
import { loadReleasesRepo } from '../lib/signaling-client';
import { getSignalingUrl } from '../lib/pairing';

interface UseReleasesResult {
  releases: VeloRelease[] | null;
  error: string | null;
}

export function useReleases(): UseReleasesResult {
  const [releases, setReleases] = useState<VeloRelease[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const signalingUrl = getSignalingUrl();
    loadReleasesRepo(signalingUrl)
      .then((repo) => fetchPublishedReleases(repo))
      .then(setReleases)
      .catch(() => setError('[WEB] Failed to load release list from GitHub'));
  }, []);

  return { releases, error };
}
