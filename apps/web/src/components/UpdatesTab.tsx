import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, CircleAlert, Download, Loader2, RefreshCw, XCircle, Sparkles } from 'lucide-react';
import type { useUpdater } from '../hooks/useUpdater';
import type { useAndroidUpdater } from '../hooks/useAndroidUpdater';
import type { useBackendUpdater } from '../hooks/useBackendUpdater';
import { getClientEnvironment } from '../lib/environment';
import { describeProgressPhase, progressPhaseFraction, type UpdateProgressEvent } from '../hooks/useUpdateProgress';

type DesktopUpdater = ReturnType<typeof useUpdater>;
type AndroidUpdaterHook = ReturnType<typeof useAndroidUpdater>;
type BackendUpdater = ReturnType<typeof useBackendUpdater>;

type RowVisualState = 'idle' | 'checking' | 'ready' | 'installing' | 'error' | 'cancelled';

const STATE_ICONS: Record<RowVisualState, LucideIcon> = {
  idle: CheckCircle2,
  checking: Loader2,
  ready: Download,
  installing: Loader2,
  error: CircleAlert,
  cancelled: XCircle,
};

const STATE_ICON_STYLES: Record<RowVisualState, string> = {
  idle: 'text-velo-emerald',
  checking: 'text-velo-text-secondary animate-spin',
  ready: 'text-velo-indigo',
  installing: 'text-velo-indigo animate-spin',
  error: 'text-velo-coral',
  cancelled: 'text-velo-text-secondary',
};

const STATE_DESCRIPTIONS: Record<RowVisualState, string> = {
  idle: 'Up to date',
  checking: 'Checking for a newer version',
  ready: 'A newer version is available',
  installing: 'Update in progress',
  error: 'The last check or update failed',
  cancelled: 'The last update was cancelled',
};

function StateIcon({ state }: { state: RowVisualState }) {
  const Icon = STATE_ICONS[state];
  return (
    <span title={STATE_DESCRIPTIONS[state]}>
      <Icon size={18} className={STATE_ICON_STYLES[state]} strokeWidth={2} />
    </span>
  );
}

interface UpdateRowProps {
  label: string;
  visualState: RowVisualState;
  statusLabel: string;
  currentVersion: string | null;
  targetVersion: string | null;
  isChecking: boolean;
  isUpdateReady: boolean;
  isInstalling: boolean;
  onCheck: () => void;
  onInstall: () => void;
  onCancel?: () => void;
  progress?: UpdateProgressEvent | null;
  scopeNote?: string;
}

function ProgressBar({ progress }: { progress: UpdateProgressEvent | null | undefined }) {
  const fraction = progressPhaseFraction(progress ?? null);
  if (fraction === null) return null;

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-velo-surface">
      <div
        className="h-full rounded-full bg-velo-indigo transition-all duration-300"
        style={{ width: `${Math.max(4, fraction * 100)}%` }}
      />
    </div>
  );
}

function VersionTransition({ current, target }: { current: string | null; target: string | null }) {
  if (!target) {
    return <span className="text-xs text-velo-text-secondary">{current ? `v${current}` : 'Unknown version'}</span>;
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-velo-text-secondary">
      <span>{current ? `v${current}` : 'Unknown'}</span>
      <RefreshCw size={11} className="text-velo-indigo" />
      <span className="font-medium text-velo-text-primary">{`v${target}`}</span>
    </span>
  );
}

function UpdateRow({
  label,
  visualState,
  statusLabel,
  currentVersion,
  targetVersion,
  isChecking,
  isUpdateReady,
  isInstalling,
  onCheck,
  onInstall,
  onCancel,
  progress,
  scopeNote,
}: UpdateRowProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-velo-background px-4 py-3.5 transition-colors hover:border-white/10">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <StateIcon state={visualState} />
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-velo-text-primary">{label}</span>
            {isInstalling ? (
              <span className="text-xs text-velo-text-secondary">{statusLabel}</span>
            ) : (
              <VersionTransition current={currentVersion} target={isUpdateReady ? targetVersion : null} />
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isInstalling && onCancel && (
            <button
              onClick={onCancel}
              title="Cancel this update"
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-velo-text-secondary transition-colors hover:bg-velo-coral/10 hover:text-velo-coral"
            >
              Cancel
            </button>
          )}
          {isUpdateReady && !isInstalling && (
            <button
              onClick={onInstall}
              title={`Update to v${targetVersion}`}
              className="flex items-center gap-1.5 rounded-lg bg-velo-indigo px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-transform hover:brightness-110 active:scale-95"
            >
              <Download size={13} />
              Update
            </button>
          )}
          {!isUpdateReady && !isInstalling && (
            <button
              onClick={onCheck}
              disabled={isChecking}
              title="Check for a newer version"
              className="flex items-center gap-1.5 rounded-lg bg-velo-surface px-3 py-1.5 text-xs font-medium text-velo-text-secondary transition-colors hover:text-velo-text-primary disabled:opacity-40"
            >
              {isChecking && <Loader2 size={13} className="animate-spin" />}
              {isChecking ? 'Checking' : 'Check for updates'}
            </button>
          )}
        </div>
      </div>
      {isInstalling && (
        <div className="flex flex-col gap-1.5 pl-8">
          <ProgressBar progress={progress} />
          <span className="text-xs text-velo-text-secondary">{describeProgressPhase(progress ?? null)}</span>
        </div>
      )}
      {scopeNote && (isInstalling || visualState === 'cancelled') && (
        <p className="pl-8 text-xs text-velo-text-secondary/80">{scopeNote}</p>
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

function toVisualState(status: string, isReady: boolean, isInstalling: boolean, isChecking: boolean): RowVisualState {
  if (status === 'error') return 'error';
  if (status === 'cancelled') return 'cancelled';
  if (isInstalling) return 'installing';
  if (isReady) return 'ready';
  if (isChecking) return 'checking';
  return 'idle';
}

function DesktopAppUpdateRow({ updater }: { updater: DesktopUpdater }) {
  const { status, currentVersion, latestVersion, runCheck, installNow } = updater;
  const isChecking = status === 'checking';
  const isReady = status === 'ready';
  const isInstalling = status === 'installing';

  return (
    <UpdateRow
      label="Desktop app"
      visualState={toVisualState(status, isReady, isInstalling, isChecking)}
      statusLabel={describeSimpleVersionStatus(status, currentVersion, latestVersion)}
      currentVersion={currentVersion}
      targetVersion={latestVersion}
      isChecking={isChecking}
      isUpdateReady={isReady}
      isInstalling={isInstalling}
      onCheck={runCheck}
      onInstall={installNow}
      scopeNote="Velo will restart automatically once this finishes."
    />
  );
}

function AndroidAppUpdateRow({ updater }: { updater: AndroidUpdaterHook }) {
  const { status, currentVersion, version, runCheck, installNow } = updater;
  const isChecking = status === 'checking';
  const isReady = status === 'ready';
  const isInstalling = status === 'downloading' || status === 'installing';

  return (
    <UpdateRow
      label="Android app"
      visualState={toVisualState(status, isReady, isInstalling, isChecking)}
      statusLabel={describeSimpleVersionStatus(status, currentVersion, version)}
      currentVersion={currentVersion}
      targetVersion={version}
      isChecking={isChecking}
      isUpdateReady={isReady}
      isInstalling={isInstalling}
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
  const isChecking = status === 'checking';
  const isReady = status === 'ready';
  const isInstalling = status === 'installing';

  return (
    <UpdateRow
      label="Backend"
      visualState={toVisualState(status, isReady, isInstalling, isChecking)}
      statusLabel={describeBackendStatus(status, isInstalled, currentVersion, latestVersion)}
      currentVersion={currentVersion}
      targetVersion={latestVersion}
      isChecking={isChecking}
      isUpdateReady={isReady}
      isInstalling={isInstalling}
      onCheck={runCheck}
      onInstall={installNow}
      onCancel={cancelNow}
      progress={progress}
      scopeNote="Only the backend is affected. Camera streaming can be briefly interrupted, but the rest of the app stays usable."
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
    <div className="flex flex-col gap-3 rounded-2xl bg-velo-surface p-4">
      <div className="flex items-center gap-2 border-b border-velo-background pb-3">
        <Sparkles size={16} className="text-velo-indigo" />
        <h2 className="text-sm font-medium text-velo-text-primary">Updates</h2>
      </div>
      <div className="flex flex-col gap-2">
        {environment === 'DESKTOP_VIEWER' && desktopUpdater && <DesktopAppUpdateRow updater={desktopUpdater} />}
        {environment === 'DESKTOP_VIEWER' && backendUpdater && <BackendUpdateRow updater={backendUpdater} />}
        {environment === 'MOBILE_HOST' && androidUpdater && <AndroidAppUpdateRow updater={androidUpdater} />}
        {environment === 'WEB_SANDBOX' && (
          <p className="text-sm text-velo-text-secondary">Updates are only available in the Desktop or Android apps.</p>
        )}
      </div>
    </div>
  );
}
