import { useEffect, useState } from 'react';
import { fetchPublishedReleases, getReleasesRepo, type VeloRelease } from '../lib/releases';

interface UseReleasesResult {
  releases: VeloRelease[] | null;
  error: string | null;
}

function fetchPublishedReleasesOrFail(repo: string): Promise<VeloRelease[]> {
  return fetchPublishedReleases(repo).catch((githubError: unknown) => {
    console.error('[WEB] Failed to fetch releases from GitHub', githubError);
    throw githubError instanceof Error ? githubError : new Error('[WEB] Failed to load release list from GitHub');
  });
}

export function useReleases(): UseReleasesResult {
  const [releases, setReleases] = useState<VeloRelease[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchPublishedReleasesOrFail(getReleasesRepo())
      .then((result) => {
        if (!cancelled) setReleases(result);
      })
      .catch((finalError: unknown) => {
        if (cancelled) return;
        setError(finalError instanceof Error ? finalError.message : '[WEB] Failed to load release list from GitHub');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { releases, error };
}
