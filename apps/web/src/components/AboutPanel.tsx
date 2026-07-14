import { VeloIcon } from './VeloIcon';
import { useUpdater } from '../hooks/useUpdater';
import { useAndroidUpdater } from '../hooks/useAndroidUpdater';
import { useBackendUpdater } from '../hooks/useBackendUpdater';
import { getClientEnvironment } from '../lib/environment';

const REPO_URL = 'https://github.com/Cetrei/velo';

interface AboutPanelProps {
  isDevModeEnabled?: boolean;
  onDevModeChange?: (nextEnabled: boolean) => void;
}

function MobileDevModeToggle({
  isDevModeEnabled,
  onDevModeChange,
}: {
  isDevModeEnabled: boolean;
  onDevModeChange: (nextEnabled: boolean) => void;
}) {
  return (
    <label className="flex w-full items-center justify-between text-sm text-velo-text-secondary">
      Developer diagnostics
      <input type="checkbox" checked={isDevModeEnabled} onChange={(event) => onDevModeChange(event.target.checked)} />
    </label>
  );
}

function AboutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-velo-text-secondary">{label}</span>
      <span className="text-velo-text-primary">{value}</span>
    </div>
  );
}

function DesktopVersionRows() {
  const { currentVersion } = useUpdater();
  const { currentVersion: backendVersion } = useBackendUpdater();

  return (
    <>
      <AboutRow label="Desktop app" value={currentVersion ? `v${currentVersion}` : 'Unknown'} />
      <AboutRow label="Backend" value={backendVersion ? `v${backendVersion}` : 'Not running'} />
    </>
  );
}

function AndroidVersionRow() {
  const { currentVersion } = useAndroidUpdater();
  return <AboutRow label="Android app" value={currentVersion ? `v${currentVersion}` : 'Unknown'} />;
}

export function AboutPanel({ isDevModeEnabled, onDevModeChange }: AboutPanelProps) {
  const environment = getClientEnvironment();

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl bg-velo-surface p-6 text-center">
      <VeloIcon size={56} />
      <div className="flex flex-col gap-1">
        <span className="text-lg font-semibold text-velo-text-primary">Velo</span>
        <span className="text-sm text-velo-text-secondary">
          Turns an Android phone into a Windows virtual camera over WebRTC.
        </span>
      </div>
      <div className="flex w-full flex-col gap-2">
        {environment === 'DESKTOP_VIEWER' && <DesktopVersionRows />}
        {environment === 'MOBILE_HOST' && <AndroidVersionRow />}
        {environment === 'MOBILE_HOST' && isDevModeEnabled !== undefined && onDevModeChange && (
          <MobileDevModeToggle isDevModeEnabled={isDevModeEnabled} onDevModeChange={onDevModeChange} />
        )}
      </div>
      <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-xs text-velo-indigo underline">
        Source and documentation
      </a>
    </div>
  );
}
