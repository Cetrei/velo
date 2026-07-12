import { readdirSync, statSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const DESKTOP_DIR = join('apps', 'desktop');
const TAURI_TARGET = join('target', 'release');

function findExe(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.exe'))
    .map(f => join(dir, f));
}

function collect() {
  const baseDist = (process.env.VELO_DIST_DIR || 'bin/').replace(/\\/g, '/');
  const distDir = join(baseDist, 'desktop');

  const exes = findExe(TAURI_TARGET);
  
  if (exes.length === 0) {
    console.error('[COLLECT] No .exe found in', TAURI_TARGET);
    process.exit(1);
  }

  if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });

  const src = exes[0]; // asume uno solo
  const dest = join(distDir, basename(src));
  copyFileSync(src, dest);
  console.log(`[COLLECT] ${src} -> ${dest}`);
}

collect();