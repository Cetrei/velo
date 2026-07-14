import { registerPlugin } from '@capacitor/core';

export interface VeloUpdaterPlugin {
  canRequestInstallPackages(): Promise<{ granted: boolean }>;
  requestInstallPackagesPermission(): Promise<void>;
  downloadAndInstall(options: { downloadUrl: string }): Promise<void>;
}

export const VeloUpdater = registerPlugin<VeloUpdaterPlugin>('VeloUpdater');
