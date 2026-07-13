import { readdirSync, statSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const BUNDLE_DIR = join('target', 'release', 'bundle', 'nsis');
const DIST_DIR = join('bin', 'desktop');

function findInstaller(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('-setup.exe'))
    .map(f => join(dir, f));
}

function collect() {
  const installers = findInstaller(BUNDLE_DIR);

  if (installers.length === 0) {
    console.error('[COLLECT] No NSIS installer found in', BUNDLE_DIR);
    console.error('[COLLECT] Did tauri build finish successfully? Check target/release/bundle/');
    process.exit(1);
  }

  if (!existsSync(DIST_DIR)) mkdirSync(DIST_DIR, { recursive: true });

  const src = installers[0];
  const dest = join(DIST_DIR, 'velo-setup.exe');
  copyFileSync(src, dest);

  console.log(`[COLLECT] Installer: ${src} -> ${dest}`);
}

collect();