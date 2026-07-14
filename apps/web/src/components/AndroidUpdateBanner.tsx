import { useAndroidUpdater } from '../hooks/useAndroidUpdater';

export function AndroidUpdateBanner() {
  const { status, version, installNow, dismiss } = useAndroidUpdater();

  if (status !== 'ready' && status !== 'downloading' && status !== 'installing') return null;

  function describeStatus(): string {
    if (status === 'downloading') return 'Downloading update...';
    if (status === 'installing') return 'Opening installer...';
    return `Update available: v${version}`;
  }

  return (
    <div className="fixed bottom-4 left-4 z-20 flex items-center gap-3 rounded-2xl bg-velo-surface px-4 py-3 shadow-lg">
      <span className="text-sm text-velo-text-primary">{describeStatus()}</span>
      {status === 'ready' && (
        <>
          <button onClick={installNow} className="rounded bg-velo-indigo px-3 py-1 text-sm text-velo-text-primary">
            Update now
          </button>
          <button onClick={dismiss} className="text-sm text-velo-text-secondary">
            Later
          </button>
        </>
      )}
    </div>
  );
}
