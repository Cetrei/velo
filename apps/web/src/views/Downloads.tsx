import { VeloIcon } from '../components/VeloIcon';
import { PlatformReleaseColumn } from '../components/PlatformReleaseColumn';
import { useReleases } from '../hooks/useReleases';
import { getReleasesRepoUrl, type VeloRelease } from '../lib/releases';

function toWindowsEntries(releases: VeloRelease[]) {
  return releases
    .filter((release) => release.windowsAsset !== null)
    .map((release) => ({ release, asset: release.windowsAsset! }));
}

function toAndroidEntries(releases: VeloRelease[]) {
  return releases
    .filter((release) => release.androidAsset !== null)
    .map((release) => ({ release, asset: release.androidAsset! }));
}

export function Downloads() {
  const { releases, error } = useReleases();

  return (
    <main className="flex min-h-screen flex-col items-center gap-10 bg-velo-background px-6 py-16 text-velo-text-primary">
      <header className="flex flex-col items-center gap-3 text-center">
        <VeloIcon size={40} />
        <h1 className="text-2xl font-semibold">Download Velo</h1>
        <p className="max-w-md text-sm text-velo-text-secondary">
          Grab the Windows installer for your PC and the Android app for your phone. Both talk to each other
          out of the box.
        </p>
      </header>

      {error && <p className="text-sm text-velo-coral">{error}</p>}

      {!releases && !error && <p className="text-sm text-velo-text-secondary">Loading releases…</p>}

      {releases && (
        <div className="flex w-full max-w-3xl flex-col gap-6 sm:flex-row">
          <PlatformReleaseColumn
            platformLabel="Windows"
            installHint="Run the installer, pick where Velo goes, done."
            entries={toWindowsEntries(releases)}
          />
          <PlatformReleaseColumn
            platformLabel="Android"
            installHint="Install the APK, then allow it if your phone warns you."
            entries={toAndroidEntries(releases)}
          />
        </div>
      )}

      <a href={getReleasesRepoUrl()} className="text-xs text-velo-text-secondary underline">
        View source on GitHub
      </a>
    </main>
  );
}
