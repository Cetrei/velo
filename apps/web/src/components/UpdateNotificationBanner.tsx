import { useUpdater } from '../hooks/useUpdater';
import { useAndroidUpdater } from '../hooks/useAndroidUpdater';
import { useBackendUpdater } from '../hooks/useBackendUpdater';
import { getClientEnvironment } from '../lib/environment';

interface UpdateNotificationBannerProps {
  onOpenUpdates: () => void;
}

function useAnyUpdateReady(): boolean {
  const environment = getClientEnvironment();
  const desktopUpdater = useUpdater();
  const androidUpdater = useAndroidUpdater();
  const backendUpdater = useBackendUpdater();

  if (environment === 'DESKTOP_VIEWER') {
    return desktopUpdater.status === 'ready' || backendUpdater.status === 'ready';
  }
  if (environment === 'MOBILE_HOST') {
    return androidUpdater.status === 'ready';
  }
  return false;
}

export function UpdateNotificationBanner({ onOpenUpdates }: UpdateNotificationBannerProps) {
  const isUpdateReady = useAnyUpdateReady();

  if (!isUpdateReady) return null;

  return (
    <button
      onClick={onOpenUpdates}
      className="fixed bottom-4 right-4 z-20 flex items-center gap-2 rounded-2xl bg-velo-surface px-4 py-3 text-sm text-velo-text-primary shadow-lg transition-colors hover:border hover:border-velo-indigo"
    >
      <span className="h-2 w-2 rounded-full bg-velo-emerald" />
      Update available
    </button>
  );
}
