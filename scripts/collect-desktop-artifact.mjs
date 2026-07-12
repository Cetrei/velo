import { mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const NSIS_BUNDLE_DIR = join('apps', 'desktop', 'target', 'release', 'bundle', 'nsis');
const OUTPUT_DIR = 'bin';

function findInstallerFile(bundleDir) {
  if (!existsSync(bundleDir)) return null;
  const entries = readdirSync(bundleDir);
  return entries.find((entry) => entry.endsWith('.exe')) ?? null;
}

function copyInstallerToBin() {
  const installerFile = findInstallerFile(NSIS_BUNDLE_DIR);
  if (!installerFile) {
    console.error(`[BUILD] No NSIS installer found in ${NSIS_BUNDLE_DIR}. Did bun run build:desktop succeed?`);
    process.exit(1);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const sourcePath = join(NSIS_BUNDLE_DIR, installerFile);
  const destinationPath = join(OUTPUT_DIR, installerFile);
  copyFileSync(sourcePath, destinationPath);
  console.log(`[BUILD] Windows installer copied to ${destinationPath}`);
}

copyInstallerToBin();
