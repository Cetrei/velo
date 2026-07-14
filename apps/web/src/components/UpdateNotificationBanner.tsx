interface UpdateNotificationBannerProps {
  isUpdateReady: boolean;
  onOpenUpdates: () => void;
}

export function UpdateNotificationBanner({ isUpdateReady, onOpenUpdates }: UpdateNotificationBannerProps) {
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
