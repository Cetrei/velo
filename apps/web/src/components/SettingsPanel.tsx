import { useConfig } from '../hooks/useConfig';

export function SettingsPanel() {
  const { config, error, saveConfig } = useConfig();

  if (error) {
    return <p className="text-sm text-velo-coral">{error}</p>;
  }

  if (!config) {
    return <p className="text-sm text-velo-text-secondary">Loading settings...</p>;
  }

  function updateFps(nextFps: number) {
    if (!config) return;
    saveConfig({ ...config, video: { ...config.video, target_fps: nextFps } });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-velo-surface p-4">
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
    </div>
  );
}
