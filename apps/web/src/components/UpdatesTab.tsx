import type { useUpdater } from '../hooks/useUpdater';
import type { useAndroidUpdater } from '../hooks/useAndroidUpdater';
import type { useBackendUpdater } from '../hooks/useBackendUpdater';
import { getClientEnvironment } from '../lib/environment';
import { describeProgressPhase, progressPhaseFraction, type UpdateProgressEvent } from '../hooks/useUpdateProgress';

type DesktopUpdater = ReturnType<typeof useUpdater>;
type AndroidUpdaterHook = ReturnType<typeof useAndroidUpdater>;
type BackendUpdater = ReturnType<typeof useBackendUpdater>;

interface UpdateRowProps {
  label: string;
  statusLabel: string;
  isChecking: boolean;
  isUpdateReady: boolean;
  isInstalling: boolean;
  onCheck: () => void;
  onInstall: () => void;
  onCancel?: () => void;
  progress?: UpdateProgressEvent | null;
}

function ProgressBar({ progress }: { progress: UpdateProgressEvent | null | undefined }) {
  const fraction = progressPhaseFraction(progress ?? null);
  if (fraction === null) return null;

  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-velo-surface">
      <div
        className="h-full rounded-full bg-velo-indigo transition-all duration-300"
        style={{ width: `${Math.max(4, fraction * 100)}%` }}
      />
    </div>
  );
}

function UpdateRow({
  label,
  statusLabel,
  isChecking,
  isUpdateReady,
  isInstalling,
  onCheck,
  onInstall,
  onCancel,
  progress,
}: UpdateRowProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-velo-background px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-velo-text-primary">{label}</span>
          <span className="text-xs text-velo-text-secondary">{statusLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          {isInstalling && onCancel && (
            <button
              onClick={onCancel}
              className="rounded px-3 py-1 text-sm text-velo-text-secondary hover:text-velo-coral"
            >
              Cancel
            </button>
          )}
          {isUpdateReady && !isInstalling && (
            <button
              onClick={onInstall}
              className="rounded bg-velo-indigo px-3 py-1 text-sm text-white"
            >
              Update
            </button>
          )}
          {!isUpdateReady && !isInstalling && (
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
      {isInstalling && (
        <div className="flex flex-col gap-1.5">
          <ProgressBar progress={progress} />
          <span className="text-xs text-velo-text-secondary">{describeProgressPhase(progress ?? null)}</span>
        </div>
      )}
    </div>
  );
}

function describeSimpleVersionStatus(status: string, currentVersion: string | null, targetVersion: string | null): string {
  if (status === 'checking') return currentVersion ? `Checking, currently v${currentVersion}\u2026` : 'Checking\u2026';
  if (status === 'error') return currentVersion ? `Check failed, currently v${currentVersion}` : 'Check failed';
  if (status === 'ready') return `v${targetVersion} available (currently v${currentVersion})`;
  return currentVersion ? `Up to date, v${currentVersion}` : 'Up to date';
}

function DesktopAppUpdateRow({ updater }: { updater: DesktopUpdater }) {
  const { status, currentVersion, latestVersion, runCheck, installNow } = updater;

  return (
    <UpdateRow
      label="Desktop app"
      statusLabel={describeSimpleVersionStatus(status, currentVersion, latestVersion)}
      isChecking={status === 'checking'}
      isUpdateReady={status === 'ready'}
      isInstalling={status === 'installing'}
      onCheck={runCheck}
      onInstall={installNow}
    />
  );
}

function AndroidAppUpdateRow({ updater }: { updater: AndroidUpdaterHook }) {
  const { status, currentVersion, version, runCheck, installNow } = updater;

  return (
    <UpdateRow
      label="Android app"
      statusLabel={describeSimpleVersionStatus(status, currentVersion, version)}
      isChecking={status === 'checking'}
      isUpdateReady={status === 'ready'}
      isInstalling={status === 'downloading' || status === 'installing'}
      onCheck={runCheck}
      onInstall={installNow}
    />
  );
}

function describeBackendStatus(
  status: string,
  isInstalled: boolean,
  currentVersion: string | null,
  latestVersion: string | null,
): string {
  if (status === 'ready') {
    return currentVersion ? `v${latestVersion} available (currently v${currentVersion})` : `v${latestVersion} available`;
  }
  if (status === 'cancelled') return 'Update cancelled';
  if (!isInstalled) return 'Not installed';
  return currentVersion ? `Up to date, v${currentVersion}` : 'Installed';
}

function BackendUpdateRow({ updater }: { updater: BackendUpdater }) {
  const { status, isInstalled, currentVersion, latestVersion, progress, runCheck, installNow, cancelNow } = updater;

  return (
    <UpdateRow
      label="Backend"
      statusLabel={describeBackendStatus(status, isInstalled, currentVersion, latestVersion)}
      isChecking={status === 'checking'}
      isUpdateReady={status === 'ready'}
      isInstalling={status === 'installing'}
      onCheck={runCheck}
      onInstall={installNow}
      onCancel={cancelNow}
      progress={progress}
    />
  );
}

interface UpdatesTabProps {
  desktopUpdater?: DesktopUpdater;
  backendUpdater?: BackendUpdater;
  androidUpdater?: AndroidUpdaterHook;
}

export function UpdatesTab({ desktopUpdater, backendUpdater, androidUpdater }: UpdatesTabProps) {
  const environment = getClientEnvironment();

  return (
    <div className="flex flex-col gap-2">
      {environment === 'DESKTOP_VIEWER' && desktopUpdater && <DesktopAppUpdateRow updater={desktopUpdater} />}
      {environment === 'DESKTOP_VIEWER' && backendUpdater && <BackendUpdateRow updater={backendUpdater} />}
      {environment === 'MOBILE_HOST' && androidUpdater && <AndroidAppUpdateRow updater={androidUpdater} />}
      {environment === 'WEB_SANDBOX' && (
        <p className="text-sm text-velo-text-secondary">Updates are only available in the Desktop or Android apps.</p>
      )}
    </div>
  );
}
