import { useUpdater } from '../hooks/useUpdater';

export function UpdateBanner() {
  const { status, version, installNow, dismiss } = useUpdater();

  if (status !== 'ready' && status !== 'installing') return null;

  return (
    <div className="fixed bottom-4 right-4 flex items-center gap-3 rounded-2xl bg-velo-surface px-4 py-3 shadow-lg">
      <span className="text-sm text-velo-text-primary">
        {status === 'installing' ? 'Installing update...' : `Update ready: v${version}`}
      </span>
      {status === 'ready' && (
        <>
          <button
            onClick={installNow}
            className="rounded bg-velo-indigo px-3 py-1 text-sm text-velo-text-primary"
          >
            Restart now
          </button>
          <button onClick={dismiss} className="text-sm text-velo-text-secondary">
            Later
          </button>
        </>
      )}
    </div>
  );
}
