import { useEffect, useState } from 'react';
import { fetchPublishedReleases, type VeloRelease } from '../lib/releases';
import { loadReleasesRepo } from '../lib/signaling-client';
import { getSignalingUrl } from '../lib/pairing';

interface UseReleasesResult {
  releases: VeloRelease[] | null;
  error: string | null;
}

function loadReleasesRepoOrFail(signalingUrl: string): Promise<string> {
  return loadReleasesRepo(signalingUrl).catch((repoError: unknown) => {
    console.error('[WEB] Failed to load releases repo from signaling server', repoError);
    throw new Error('[WEB] Could not reach the signaling server to load release settings');
  });
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
    const signalingUrl = getSignalingUrl();

    loadReleasesRepoOrFail(signalingUrl)
      .then((repo) => fetchPublishedReleasesOrFail(repo))
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
