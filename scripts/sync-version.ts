import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TAURI_CONF_PATH = join('apps', 'desktop', 'tauri.conf.json');
const ANDROID_VARIABLES_PATH = join('apps', 'web', 'android', 'variables.gradle');
const VERSION_TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)$/;

type SemVer = { major: number; minor: number; patch: number };

function parseVersionTag(tag: string): SemVer {
  const match = tag.match(VERSION_TAG_PATTERN);
  if (!match) {
    console.error(`[SYNC-VERSION] Tag "${tag}" does not match vX.Y.Z (e.g. v1.4.2)`);
    process.exit(1);
  }
  const [, major, minor, patch] = match;
  return { major: Number(major), minor: Number(minor), patch: Number(patch) };
}

function toVersionName(version: SemVer): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function toVersionCode(version: SemVer): number {
  return version.major * 1_000_000 + version.minor * 1_000 + version.patch;
}

function updateTauriConf(versionName: string): void {
  const content = readFileSync(TAURI_CONF_PATH, 'utf-8');
  const updated = content.replace(/"version":\s*"[^"]*"/, `"version": "${versionName}"`);
  if (updated === content) {
    console.error(`[SYNC-VERSION] Could not find a "version" field to replace in ${TAURI_CONF_PATH}`);
    process.exit(1);
  }
  writeFileSync(TAURI_CONF_PATH, updated);
  console.log(`[SYNC-VERSION] ${TAURI_CONF_PATH} -> version: "${versionName}"`);
}

function updateAndroidVariables(versionName: string, versionCode: number): void {
  const content = readFileSync(ANDROID_VARIABLES_PATH, 'utf-8');
  let updated = content.replace(/veloVersionName\s*=\s*'[^']*'/, `veloVersionName = '${versionName}'`);
  updated = updated.replace(/veloVersionCode\s*=\s*\d+/, `veloVersionCode = ${versionCode}`);
  if (updated === content) {
    console.error(`[SYNC-VERSION] Could not find veloVersionName/veloVersionCode in ${ANDROID_VARIABLES_PATH}`);
    process.exit(1);
  }
  writeFileSync(ANDROID_VARIABLES_PATH, updated);
  console.log(`[SYNC-VERSION] ${ANDROID_VARIABLES_PATH} -> veloVersionName: '${versionName}', veloVersionCode: ${versionCode}`);
}

function resolveTag(): string {
  const argTag = process.argv[2];
  if (argTag) return argTag;
  const envTag = process.env.GITHUB_REF_NAME;
  if (envTag) return envTag;
  console.error('[SYNC-VERSION] Usage: bun scripts/sync-version.ts vX.Y.Z (or set GITHUB_REF_NAME)');
  process.exit(1);
}

function main(): void {
  const tag = resolveTag();
  const version = parseVersionTag(tag);
  const versionName = toVersionName(version);
  const versionCode = toVersionCode(version);

  updateTauriConf(versionName);
  updateAndroidVariables(versionName, versionCode);
}

main();
