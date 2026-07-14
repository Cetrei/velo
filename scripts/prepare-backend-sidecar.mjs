import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const WINDOWS_TARGET_TRIPLE = 'x86_64-pc-windows-msvc';
const COMPILED_BACKEND_PATH = join('bin', 'backend', 'velo-backend.exe');
const SIDECAR_DIR = join('apps', 'desktop', 'binaries');
const SIDECAR_PATH = join(SIDECAR_DIR, `velo-backend-${WINDOWS_TARGET_TRIPLE}.exe`);

function prepare() {
  if (!existsSync(COMPILED_BACKEND_PATH)) {
    console.error('[PREPARE-SIDECAR] No compiled backend found at', COMPILED_BACKEND_PATH);
    console.error('[PREPARE-SIDECAR] Run "bun run build:server" before building desktop.');
    process.exit(1);
  }

  if (!existsSync(SIDECAR_DIR)) mkdirSync(SIDECAR_DIR, { recursive: true });

  copyFileSync(COMPILED_BACKEND_PATH, SIDECAR_PATH);
  console.log(`[PREPARE-SIDECAR] ${COMPILED_BACKEND_PATH} -> ${SIDECAR_PATH}`);
}

prepare();
