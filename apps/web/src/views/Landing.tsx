import { VeloIcon } from '../components/VeloIcon';

const GITHUB_REPO_URL = 'https://github.com/Cetrei/velo';

interface LandingProps {
  onUseInBrowser: () => void;
  onGoToDownloads: () => void;
}

export function Landing({ onUseInBrowser, onGoToDownloads }: LandingProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 bg-velo-background px-6 text-center text-velo-text-primary">
      <div className="flex flex-col items-center gap-5">
        <VeloIcon size={56} />
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Velo</h1>
          <p className="max-w-sm text-sm text-velo-text-secondary">
            Turn your Android phone into a webcam for your Windows PC. No cables, no accounts, no
            paid services, just a peer to peer stream between the two.
          </p>
        </div>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <button
          onClick={onUseInBrowser}
          className="rounded-xl bg-velo-indigo px-6 py-3 text-sm font-medium text-white"
        >
          Use it from this phone's browser
        </button>
        <button
          onClick={onGoToDownloads}
          className="rounded-xl bg-velo-surface px-6 py-3 text-sm font-medium text-velo-text-primary"
        >
          Download the apps
        </button>
        <a
          href={GITHUB_REPO_URL}
          className="rounded-xl px-6 py-3 text-sm font-medium text-velo-text-secondary underline"
        >
          View source on GitHub
        </a>
      </div>
    </main>
  );
}
