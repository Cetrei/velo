import { useEffect, useState } from 'react';
import { fetchPublishedReleases, type VeloRelease } from '../lib/releases';

interface UseReleasesResult {
  releases: VeloRelease[] | null;
  error: string | null;
}

export function useReleases(): UseReleasesResult {
  const [releases, setReleases] = useState<VeloRelease[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPublishedReleases()
      .then(setReleases)
      .catch(() => setError('[WEB] Failed to load release list from GitHub'));
  }, []);

  return { releases, error };
}
