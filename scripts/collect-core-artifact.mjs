import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BUILT_DLL_PATH = join('target', 'release', 'vcam_driver.dll');
const DIST_DIR = join('bin', 'core');
const DIST_FILENAME = 'velo_core.dll';

function collect() {
  if (!existsSync(BUILT_DLL_PATH)) {
    console.error('[COLLECT] No compiled Velo-Core dylib found at', BUILT_DLL_PATH);
    console.error('[COLLECT] Did cargo build --release --manifest-path crates/vcam-driver/Cargo.toml finish successfully?');
    process.exit(1);
  }

  if (!existsSync(DIST_DIR)) mkdirSync(DIST_DIR, { recursive: true });

  const dest = join(DIST_DIR, DIST_FILENAME);
  copyFileSync(BUILT_DLL_PATH, dest);

  console.log(`[COLLECT] Velo-Core: ${BUILT_DLL_PATH} -> ${dest}`);
}

collect();
