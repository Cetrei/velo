import { useUpdater } from '../hooks/useUpdater';
import { useAndroidUpdater } from '../hooks/useAndroidUpdater';
import { useBackendUpdater } from '../hooks/useBackendUpdater';
import { getClientEnvironment } from '../lib/environment';
import { describeProgressPhase } from '../hooks/useUpdateProgress';

interface UpdateRowProps {
  label: string;
  currentVersionLabel: string;
  isChecking: boolean;
  isUpdateReady: boolean;
  isInstalling: boolean;
  onCheck: () => void;
  onInstall: () => void;
  progressLabel?: string;
}

function UpdateRow({
  label,
  currentVersionLabel,
  isChecking,
  isUpdateReady,
  isInstalling,
  onCheck,
  onInstall,
  progressLabel,
}: UpdateRowProps) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-velo-background px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-velo-text-primary">{label}</span>
          <span className="text-xs text-velo-text-secondary">{currentVersionLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          {isUpdateReady ? (
            <button
              onClick={onInstall}
              disabled={isInstalling}
              className="rounded bg-velo-indigo px-3 py-1 text-sm text-velo-text-primary disabled:opacity-40"
            >
              {isInstalling ? 'Installing…' : 'Install update'}
            </button>
          ) : (
            <button
              onClick={onCheck}
              disabled={isChecking}
              className="rounded bg-velo-surface px-3 py-1 text-sm text-velo-text-secondary disabled:opacity-40"
            >
              {isChecking ? 'Checking…' : 'Check for updates'}
            </button>
          )}
        </div>
      </div>
      {isInstalling && progressLabel && <span className="text-xs text-velo-text-secondary">{progressLabel}</span>}
    </div>
  );
}

function DesktopAppUpdateRow() {
  const { status, currentVersion, latestVersion, runCheck, installNow } = useUpdater();

  function describeStatus(): string {
    if (status === 'checking') return currentVersion ? `Checking, currently v${currentVersion}\u2026` : 'Checking\u2026';
    if (status === 'error') return currentVersion ? `Check failed, currently v${currentVersion}` : 'Check failed';
    if (status === 'ready') return `Update available: v${latestVersion} (currently v${currentVersion})`;
    return currentVersion ? `Up to date (v${currentVersion})` : 'Up to date';
  }

  return (
    <UpdateRow
      label="Desktop app"
      currentVersionLabel={describeStatus()}
      isChecking={status === 'checking'}
      isUpdateReady={status === 'ready'}
      isInstalling={status === 'installing'}
      onCheck={runCheck}
      onInstall={installNow}
    />
  );
}

function AndroidAppUpdateRow() {
  const { status, currentVersion, version, runCheck, installNow } = useAndroidUpdater();

  function describeStatus(): string {
    if (status === 'checking') return currentVersion ? `Checking, currently v${currentVersion}\u2026` : 'Checking\u2026';
    if (status === 'error') return currentVersion ? `Check failed, currently v${currentVersion}` : 'Check failed';
    if (status === 'ready') return `Update available: v${version} (currently v${currentVersion})`;
    return currentVersion ? `Up to date (v${currentVersion})` : 'Up to date';
  }

  return (
    <UpdateRow
      label="Android app"
      currentVersionLabel={describeStatus()}
      isChecking={status === 'checking'}
      isUpdateReady={status === 'ready'}
      isInstalling={status === 'downloading' || status === 'installing'}
      onCheck={runCheck}
      onInstall={installNow}
    />
  );
}

function BackendUpdateRow() {
  const { status, isInstalled, currentVersion, latestVersion, progress, runCheck, installNow } = useBackendUpdater();

  const isBusy = status === 'checking' || status === 'installing';

  function describeStatus(): string {
    if (status === 'ready') {
      return currentVersion
        ? `Update available: v${latestVersion} (currently v${currentVersion})`
        : `Update available: v${latestVersion}`;
    }
    if (!isInstalled) return 'Not installed';
    return currentVersion ? `Installed (v${currentVersion})` : 'Installed';
  }

  return (
    <UpdateRow
      label="Backend"
      currentVersionLabel={describeStatus()}
      isChecking={status === 'checking'}
      isUpdateReady={status === 'ready'}
      isInstalling={isBusy && status === 'installing'}
      onCheck={runCheck}
      onInstall={installNow}
      progressLabel={describeProgressPhase(progress)}
    />
  );
}

export function UpdatesTab() {
  const environment = getClientEnvironment();

  return (
    <div className="flex flex-col gap-2">
      {environment === 'DESKTOP_VIEWER' && <DesktopAppUpdateRow />}
      {environment === 'DESKTOP_VIEWER' && <BackendUpdateRow />}
      {environment === 'MOBILE_HOST' && <AndroidAppUpdateRow />}
      {environment === 'WEB_SANDBOX' && (
        <p className="text-sm text-velo-text-secondary">Updates are only available in the Desktop or Android apps.</p>
      )}
    </div>
  );
}
