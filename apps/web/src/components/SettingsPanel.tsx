import { useConfig, type UserConfig } from '../hooks/useConfig';
import { ConnectionModeSettings } from './ConnectionModeSettings';
import { SettingsTabs, type SettingsTabId } from './SettingsTabs';

interface SettingsPanelProps {
  initialTab?: SettingsTabId;
}

interface UserTabProps {
  config: UserConfig;
  saveConfig: (nextConfig: UserConfig) => Promise<void>;
}

const RESOLUTION_PRESETS = [
  { label: '640x480', width: 640, height: 480 },
  { label: '1280x720', width: 1280, height: 720 },
  { label: '1920x1080', width: 1920, height: 1080 },
];

const BITRATE_PRESETS_KBPS = [1500, 2500, 4000, 6000];

function FpsField({ config, saveConfig }: UserTabProps) {
  function updateFps(nextFps: number) {
    saveConfig({ ...config, video: { ...config.video, target_fps: nextFps } });
  }

  return (
    <label className="flex items-center justify-between text-sm text-velo-text-secondary">
      Target FPS
      <select
        value={config.video.target_fps}
        onChange={(event) => updateFps(Number(event.target.value))}
        className="rounded bg-velo-background px-2 py-1 text-velo-text-primary"
      >
        <option value={24}>24</option>
        <option value={30}>30</option>
        <option value={60}>60</option>
      </select>
    </label>
  );
}

function ResolutionField({ config, saveConfig }: UserTabProps) {
  function updateResolution(label: string) {
    const preset = RESOLUTION_PRESETS.find((entry) => entry.label === label);
    if (!preset) return;
    saveConfig({ ...config, video: { ...config.video, resolution: { width: preset.width, height: preset.height } } });
  }

  const currentLabel = `${config.video.resolution.width}x${config.video.resolution.height}`;

  return (
    <label className="flex items-center justify-between text-sm text-velo-text-secondary">
      Resolution
      <select
        value={currentLabel}
        onChange={(event) => updateResolution(event.target.value)}
        className="rounded bg-velo-background px-2 py-1 text-velo-text-primary"
      >
        {RESOLUTION_PRESETS.map((preset) => (
          <option key={preset.label} value={preset.label}>
            {preset.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function BitratePresetField({ config, saveConfig }: UserTabProps) {
  function updateBitrate(value: number) {
    saveConfig({ ...config, video: { ...config.video, max_bitrate_kbps: value } });
  }

  return (
    <label className="flex items-center justify-between text-sm text-velo-text-secondary">
      Max bitrate
      <select
        value={config.video.max_bitrate_kbps}
        onChange={(event) => updateBitrate(Number(event.target.value))}
        className="rounded bg-velo-background px-2 py-1 text-velo-text-primary"
      >
        {BITRATE_PRESETS_KBPS.map((kbps) => (
          <option key={kbps} value={kbps}>
            {kbps} kbps
          </option>
        ))}
      </select>
    </label>
  );
}

function LaunchOnBootField({ config, saveConfig }: UserTabProps) {
  return (
    <label className="flex items-center justify-between text-sm text-velo-text-secondary">
      Launch on boot
      <input
        type="checkbox"
        checked={config.behavior.launch_on_boot}
        onChange={(event) =>
          saveConfig({ ...config, behavior: { ...config.behavior, launch_on_boot: event.target.checked } })
        }
      />
    </label>
  );
}

function MinimizeToTrayField({ config, saveConfig }: UserTabProps) {
  return (
    <label className="flex items-center justify-between text-sm text-velo-text-secondary">
      Minimize to tray
      <input
        type="checkbox"
        checked={config.behavior.minimize_to_tray}
        onChange={(event) =>
          saveConfig({ ...config, behavior: { ...config.behavior, minimize_to_tray: event.target.checked } })
        }
      />
    </label>
  );
}

function ReconnectionLoopField({ config, saveConfig }: UserTabProps) {
  return (
    <label className="flex items-center justify-between text-sm text-velo-text-secondary">
      Auto reconnect
      <input
        type="checkbox"
        checked={config.behavior.enable_reconnection_loop}
        onChange={(event) =>
          saveConfig({ ...config, behavior: { ...config.behavior, enable_reconnection_loop: event.target.checked } })
        }
      />
    </label>
  );
}

function DevModeToggleField({ config, saveConfig }: UserTabProps) {
  return (
    <label className="flex items-center justify-between text-sm text-velo-text-secondary">
      Developer diagnostics
      <input
        type="checkbox"
        checked={config.behavior.dev_mode_enabled}
        onChange={(event) =>
          saveConfig({ ...config, behavior: { ...config.behavior, dev_mode_enabled: event.target.checked } })
        }
      />
    </label>
  );
}

function UserTab({ config, saveConfig }: UserTabProps) {
  return (
    <div className="flex flex-col gap-3">
      <FpsField config={config} saveConfig={saveConfig} />
      <ResolutionField config={config} saveConfig={saveConfig} />
      <BitratePresetField config={config} saveConfig={saveConfig} />
      <LaunchOnBootField config={config} saveConfig={saveConfig} />
      <MinimizeToTrayField config={config} saveConfig={saveConfig} />
      <ReconnectionLoopField config={config} saveConfig={saveConfig} />
      <DevModeToggleField config={config} saveConfig={saveConfig} />
      <ConnectionModeSettings
        connection={config.connection}
        onChange={(connection) => saveConfig({ ...config, connection })}
      />
    </div>
  );
}

function ReconnectionIntervalField({ config, saveConfig }: UserTabProps) {
  function updateInterval(value: number) {
    saveConfig({ ...config, behavior: { ...config.behavior, reconnection_interval_ms: value } });
  }

  return (
    <label className="flex items-center justify-between text-sm text-velo-text-secondary">
      Reconnection interval (ms)
      <input
        type="number"
        min={100}
        step={100}
        value={config.behavior.reconnection_interval_ms}
        onChange={(event) => updateInterval(Number(event.target.value))}
        className="w-24 rounded bg-velo-background px-2 py-1 text-velo-text-primary"
      />
    </label>
  );
}

function ExactBitrateField({ config, saveConfig }: UserTabProps) {
  function updateBitrate(value: number) {
    saveConfig({ ...config, video: { ...config.video, max_bitrate_kbps: value } });
  }

  return (
    <label className="flex items-center justify-between text-sm text-velo-text-secondary">
      Exact max bitrate (kbps)
      <input
        type="number"
        min={100}
        step={100}
        value={config.video.max_bitrate_kbps}
        onChange={(event) => updateBitrate(Number(event.target.value))}
        className="w-24 rounded bg-velo-background px-2 py-1 text-velo-text-primary"
      />
    </label>
  );
}

function DeveloperSettingsTab({ config, saveConfig }: UserTabProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-velo-indigo/40 p-3">
      <p className="text-xs text-velo-text-secondary">
        Raw values, override the presets in User settings.
      </p>
      <ReconnectionIntervalField config={config} saveConfig={saveConfig} />
      <ExactBitrateField config={config} saveConfig={saveConfig} />
    </div>
  );
}

export function SettingsPanel({ initialTab }: SettingsPanelProps) {
  const { config, error, saveConfig, isDesktop } = useConfig();

  if (error) {
    return (
      <p className="text-sm text-velo-coral">
        {isDesktop ? error : 'Connection mode, resolution, and FPS are managed on the Velo Desktop app. Open Settings there to change them.'}
      </p>
    );
  }

  if (!config) {
    return <p className="text-sm text-velo-text-secondary">Loading settings...</p>;
  }

  return (
    <SettingsTabs
      isSystemTabVisible={config.behavior.dev_mode_enabled}
      initialTab={initialTab}
      renderUserTab={() => <UserTab config={config} saveConfig={saveConfig} />}
      renderSystemTab={() => <DeveloperSettingsTab config={config} saveConfig={saveConfig} />}
    />
  );
}
