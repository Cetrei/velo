import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGE_JSON_PATH = join(import.meta.dir, '..', 'package.json');
const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

type BumpKind = 'major' | 'minor' | 'patch';

interface PackageJsonRead {
  raw: string;
  parsed: Record<string, unknown>;
}

function parseBumpKind(): BumpKind | null {
  const args = process.argv.slice(2);
  if (args.includes('--major')) return 'major';
  if (args.includes('--minor')) return 'minor';
  if (args.includes('--patch')) return 'patch';
  return null;
}

function readPackageJson(): PackageJsonRead {
  const raw = readFileSync(PACKAGE_JSON_PATH, 'utf-8');
  return { raw, parsed: JSON.parse(raw) };
}

function parseSemver(version: string): [number, number, number] {
  const match = version.match(SEMVER_PATTERN);
  if (!match) {
    console.error(`[DEPLOY_WEB] apps/web/package.json version "${version}" is not a plain X.Y.Z semver`);
    process.exit(1);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function bumpVersion(version: string, kind: BumpKind): string {
  const [major, minor, patch] = parseSemver(version);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function writeNextVersion(nextVersion: string): void {
  const { raw, parsed } = readPackageJson();
  parsed.version = nextVersion;
  const indentMatch = raw.match(/\n( +)"/);
  const indent = indentMatch ? indentMatch[1] : '  ';
  writeFileSync(PACKAGE_JSON_PATH, `${JSON.stringify(parsed, null, indent)}\n`, 'utf-8');
}

function applyVersionBumpIfRequested(): void {
  const bumpKind = parseBumpKind();
  if (!bumpKind) {
    console.log('[DEPLOY_WEB] No --major/--minor/--patch flag given, deploying without a version bump');
    return;
  }

  const { parsed } = readPackageJson();
  const currentVersion = String(parsed.version);
  const nextVersion = bumpVersion(currentVersion, bumpKind);
  writeNextVersion(nextVersion);
  console.log(`[DEPLOY_WEB] apps/web version ${currentVersion} -> ${nextVersion}`);
}

function runOrExit(command: string[]): void {
  const result = Bun.spawnSync(command, { stdout: 'inherit', stderr: 'inherit' });
  if (!result.success) {
    console.error(`[DEPLOY_WEB] ${command.join(' ')} failed`);
    process.exit(1);
  }
}

function main(): void {
  applyVersionBumpIfRequested();
  runOrExit(['bun', 'run', 'build']);
  runOrExit(['wrangler', 'pages', 'deploy', 'dist', '--project-name=velo']);
}

main();
