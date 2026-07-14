import { useUpdater } from '../hooks/useUpdater';
import { useAndroidUpdater } from '../hooks/useAndroidUpdater';
import { useBackendUpdater } from '../hooks/useBackendUpdater';
import { useConfig } from '../hooks/useConfig';
import { getClientEnvironment } from '../lib/environment';

interface UpdateRowProps {
  label: string;
  currentVersionLabel: string;
  isChecking: boolean;
  isUpdateReady: boolean;
  isInstalling: boolean;
  onCheck: () => void;
  onInstall: () => void;
}

function UpdateRow({
  label,
  currentVersionLabel,
  isChecking,
  isUpdateReady,
  isInstalling,
  onCheck,
  onInstall,
}: UpdateRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-velo-background px-4 py-3">
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
  const {
    status,
    isInstalled,
    isRunning,
    currentVersion,
    latestVersion,
    runCheck,
    installNow,
    startNow,
    uninstallNow,
  } = useBackendUpdater();
  const { config, saveConfig } = useConfig();

  const isBusy = status === 'checking' || status === 'installing' || status === 'starting' || status === 'uninstalling';
  const isEnabled = config?.backend?.enabled ?? true;

  function describeStatus(): string {
    if (status === 'ready') return `Update available: v${latestVersion}`;
    if (!isInstalled) return 'Not installed';
    if (!isRunning) return currentVersion ? `Installed (v${currentVersion}), stopped` : 'Installed, stopped';
    return currentVersion ? `Running v${currentVersion}` : 'Running';
  }

  function toggleEnabled(nextEnabled: boolean) {
    if (!config) return;
    saveConfig({ ...config, backend: { enabled: nextEnabled } });
    if (nextEnabled) {
      startNow();
    } else {
      uninstallNow();
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-velo-background px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-velo-text-primary">Backend</span>
          <span className="text-xs text-velo-text-secondary">{describeStatus()}</span>
        </div>
        <label className="flex items-center gap-2 text-xs text-velo-text-secondary">
          Enabled
          <input
            type="checkbox"
            checked={isEnabled}
            disabled={isBusy || !config}
            onChange={(event) => toggleEnabled(event.target.checked)}
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        {status === 'ready' ? (
          <button
            onClick={installNow}
            disabled={isBusy}
            className="rounded bg-velo-indigo px-3 py-1 text-sm text-velo-text-primary disabled:opacity-40"
          >
            Install update
          </button>
        ) : (
          <button
            onClick={isInstalled ? runCheck : installNow}
            disabled={isBusy}
            className="rounded bg-velo-surface px-3 py-1 text-sm text-velo-text-secondary disabled:opacity-40"
          >
            {isBusy
              ? status === 'checking'
                ? 'Checking…'
                : 'Installing…'
              : isInstalled
                ? 'Check for updates'
                : 'Install'}
          </button>
        )}
        {isInstalled && !isRunning && (
          <button
            onClick={startNow}
            disabled={isBusy}
            className="rounded bg-velo-surface px-3 py-1 text-sm text-velo-text-secondary disabled:opacity-40"
          >
            {status === 'starting' ? 'Starting…' : 'Start'}
          </button>
        )}
        {isInstalled && (
          <button
            onClick={uninstallNow}
            disabled={isBusy}
            className="rounded bg-velo-surface px-3 py-1 text-sm text-velo-coral disabled:opacity-40"
          >
            {status === 'uninstalling' ? 'Uninstalling…' : 'Uninstall'}
          </button>
        )}
      </div>
    </div>
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
