import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TAURI_CONF_PATH = join('apps', 'desktop', 'tauri.conf.json');
const ANDROID_VARIABLES_PATH = join('apps', 'web', 'android', 'variables.gradle');
const SERVER_PACKAGE_JSON_PATH = join('apps', 'server', 'package.json');
const VERSION_TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)$/;
const BACKEND_VERSION_TAG_PATTERN = /^backend-v(\d+)\.(\d+)\.(\d+)$/;

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

function parseBackendVersionTag(tag: string): SemVer {
  const match = tag.match(BACKEND_VERSION_TAG_PATTERN);
  if (!match) {
    console.error(`[SYNC-VERSION] Tag "${tag}" does not match backend-vX.Y.Z (e.g. backend-v1.4.2)`);
    process.exit(1);
  }
  const [, major, minor, patch] = match;
  return { major: Number(major), minor: Number(minor), patch: Number(patch) };
}

function isBackendTag(tag: string): boolean {
  return tag.startsWith('backend-v');
}

function toVersionName(version: SemVer): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function toVersionCode(version: SemVer): number {
  return version.major * 1_000_000 + version.minor * 1_000 + version.patch;
}

function stripBom(raw: string): string {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

function readJsonFile(path: string): { raw: string; parsed: Record<string, unknown> } {
  const raw = stripBom(readFileSync(path, 'utf-8'));
  try {
    return { raw, parsed: JSON.parse(raw) };
  } catch (error) {
    const firstBytes = Buffer.from(raw.slice(0, 40)).toString('hex');
    console.error(`[SYNC-VERSION] Failed to parse ${path} as JSON: ${(error as Error).message}`);
    console.error(`[SYNC-VERSION] First 40 chars as hex: ${firstBytes}`);
    process.exit(1);
  }
}

function detectIndent(raw: string): string {
  const match = raw.match(/\n([ \t]+)"/);
  return match ? match[1] : '  ';
}

function detectLineEnding(raw: string): string {
  return raw.includes('\r\n') ? '\r\n' : '\n';
}

function updateTauriConf(versionName: string): void {
  const { raw, parsed } = readJsonFile(TAURI_CONF_PATH);
  if (!('version' in parsed)) {
    console.error(`[SYNC-VERSION] No "version" field present at the top level of ${TAURI_CONF_PATH}`);
    process.exit(1);
  }
  const previousVersion = parsed.version;
  parsed.version = versionName;
  const indent = detectIndent(raw);
  const eol = detectLineEnding(raw);
  const serialized = JSON.stringify(parsed, null, indent).replace(/\n/g, eol) + eol;
  writeFileSync(TAURI_CONF_PATH, serialized, 'utf-8');
  const changeNote = previousVersion === versionName ? '(already up to date)' : `"${previousVersion}" -> "${versionName}"`;
  console.log(`[SYNC-VERSION] ${TAURI_CONF_PATH} -> version: ${changeNote}`);
}

function updateAndroidVariables(versionName: string, versionCode: number): void {
  const content = stripBom(readFileSync(ANDROID_VARIABLES_PATH, 'utf-8'));
  const namePattern = /veloVersionName\s*=\s*['"][^'"]*['"]/;
  const codePattern = /veloVersionCode\s*=\s*\d+/;

  if (!namePattern.test(content)) {
    console.error(`[SYNC-VERSION] Could not find veloVersionName in ${ANDROID_VARIABLES_PATH}`);
    console.error(`[SYNC-VERSION] Full file content as read from disk:`);
    console.error(content);
    process.exit(1);
  }
  if (!codePattern.test(content)) {
    console.error(`[SYNC-VERSION] Could not find veloVersionCode in ${ANDROID_VARIABLES_PATH}`);
    console.error(`[SYNC-VERSION] Full file content as read from disk:`);
    console.error(content);
    process.exit(1);
  }

  const updated = content
    .replace(namePattern, `veloVersionName = '${versionName}'`)
    .replace(codePattern, `veloVersionCode = ${versionCode}`);

  writeFileSync(ANDROID_VARIABLES_PATH, updated, 'utf-8');
  console.log(`[SYNC-VERSION] ${ANDROID_VARIABLES_PATH} -> veloVersionName: '${versionName}', veloVersionCode: ${versionCode}`);
}

function updateServerPackageJson(versionName: string): void {
  const { raw, parsed } = readJsonFile(SERVER_PACKAGE_JSON_PATH);
  if (!('version' in parsed)) {
    console.error(`[SYNC-VERSION] No "version" field present at the top level of ${SERVER_PACKAGE_JSON_PATH}`);
    process.exit(1);
  }
  const previousVersion = parsed.version;
  parsed.version = versionName;
  const indent = detectIndent(raw);
  const eol = detectLineEnding(raw);
  const serialized = JSON.stringify(parsed, null, indent).replace(/\n/g, eol) + eol;
  writeFileSync(SERVER_PACKAGE_JSON_PATH, serialized, 'utf-8');
  const changeNote = previousVersion === versionName ? '(already up to date)' : `"${previousVersion}" -> "${versionName}"`;
  console.log(`[SYNC-VERSION] ${SERVER_PACKAGE_JSON_PATH} -> version: ${changeNote}`);
}

function resolveTag(): string {
  const argTag = process.argv[2];
  if (argTag) return argTag;
  const envTag = process.env.GITHUB_REF_NAME;
  if (envTag) return envTag;
  console.error('[SYNC-VERSION] Usage: bun scripts/sync-version.ts vX.Y.Z (or set GITHUB_REF_NAME)');
  process.exit(1);
}

function syncBackendVersion(tag: string): void {
  const version = parseBackendVersionTag(tag);
  updateServerPackageJson(toVersionName(version));
}

function syncAppVersion(tag: string): void {
  const version = parseVersionTag(tag);
  const versionName = toVersionName(version);
  const versionCode = toVersionCode(version);

  updateTauriConf(versionName);
  updateAndroidVariables(versionName, versionCode);
}

function main(): void {
  const tag = resolveTag();
  if (isBackendTag(tag)) {
    syncBackendVersion(tag);
    return;
  }
  syncAppVersion(tag);
}

main();
