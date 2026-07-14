import { readdirSync, statSync, copyFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const ANDROID_DIR = join('apps', 'web', 'android');
const GRADLE_PROPS = join(ANDROID_DIR, 'gradle.properties');
const VARIABLES_GRADLE = join(ANDROID_DIR, 'variables.gradle');

function readProp(key) {
  if (!existsSync(GRADLE_PROPS)) return undefined;
  const content = readFileSync(GRADLE_PROPS, 'utf-8');
  const match = content.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return match ? match[1].trim() : undefined;
}

function readAppVersion() {
  if (!existsSync(VARIABLES_GRADLE)) return 'unknown';
  const content = readFileSync(VARIABLES_GRADLE, 'utf-8');
  const match = content.match(/veloVersionName\s*=\s*['"]([^'"]+)['"]/);
  return match ? match[1] : 'unknown';
}

function findFiles(dir, ext) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findFiles(full, ext));
    } else if (entry.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

function collect() {
  const outputDir = join(ANDROID_DIR, 'app', 'build', 'outputs');
  const apks = findFiles(outputDir, '.apk');

  if (apks.length === 0) {
    console.error('[COLLECT] No APK found under', outputDir);
    process.exit(1);
  }

  const releaseApk = apks.find(p => p.includes('release')) || apks[0];
  const distDir = (readProp('veloAndroidDistDir') || 'dist/android').replace(/\\/g, '/');

  if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });

  // Matches the desktop installer's naming scheme (Velo_<version>_x64-setup.exe)
  // so both platforms are identifiable at a glance on the GitHub Releases page.
  const dest = join(distDir, `Velo_${readAppVersion()}.apk`);
  copyFileSync(releaseApk, dest);
  
  console.log(`[COLLECT] ${releaseApk} -> ${dest}`);
}

collect();