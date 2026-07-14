import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const VERSION_TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)$/;
const BACKEND_VERSION_TAG_PATTERN = /^backend-v(\d+)\.(\d+)\.(\d+)$/;
const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const BACKEND_FLAG = '--backend';
const WEB_FLAG = '--web';
const WEB_PACKAGE_JSON_PATH = join('apps', 'web', 'package.json');

type SemVer = [number, number, number];
type BumpKind = 'major' | 'minor' | 'patch';
type ReleaseTarget = 'app' | 'backend' | 'web';

interface PackageJsonRead {
  raw: string;
  parsed: Record<string, unknown>;
}

function parseBumpFlag(arg: string): BumpKind | null {
  if (arg === '--major') return 'major';
  if (arg === '--minor') return 'minor';
  if (arg === '--patch') return 'patch';
  return null;
}

function findBumpFlag(): BumpKind | null {
  const args = process.argv.slice(2);
  for (const arg of args) {
    const kind = parseBumpFlag(arg);
    if (kind) return kind;
  }
  return null;
}

function parseReleaseTarget(): ReleaseTarget {
  const args = process.argv.slice(2);
  if (args.includes(BACKEND_FLAG)) return 'backend';
  if (args.includes(WEB_FLAG)) return 'web';
  return 'app';
}

function isTargetFlag(arg: string): boolean {
  return arg === BACKEND_FLAG || arg === WEB_FLAG;
}

function listVersionTags(target: ReleaseTarget): string[] {
  const pattern = target === 'backend' ? 'backend-v*' : 'v*';
  const result = Bun.spawnSync(['git', 'tag', '--list', pattern]);
  return result.stdout.toString().split('\n').map((line) => line.trim()).filter(Boolean);
}

function parseSemverTag(tag: string, target: ReleaseTarget): SemVer | null {
  const pattern = target === 'backend' ? BACKEND_VERSION_TAG_PATTERN : VERSION_TAG_PATTERN;
  const match = tag.match(pattern);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a: SemVer, b: SemVer): number {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function findLatestVersionTag(target: ReleaseTarget): SemVer {
  const parsed = listVersionTags(target)
    .map((tag) => parseSemverTag(tag, target))
    .filter((entry): entry is SemVer => entry !== null);
  if (parsed.length === 0) return [0, 0, 0];
  return parsed.reduce((latest, candidate) => (compareSemver(candidate, latest) > 0 ? candidate : latest));
}

function bumpSemver([major, minor, patch]: SemVer, kind: BumpKind, target: ReleaseTarget): string {
  const prefix = target === 'backend' ? 'backend-v' : 'v';
  if (kind === 'major') return `${prefix}${major + 1}.0.0`;
  if (kind === 'minor') return `${prefix}${major}.${minor + 1}.0`;
  return `${prefix}${major}.${minor}.${patch + 1}`;
}

function resolveVersionTagFromBumpFlag(kind: BumpKind, target: ReleaseTarget): string {
  const latest = findLatestVersionTag(target);
  const nextTag = bumpSemver(latest, kind, target);
  const latestLabel = target === 'backend' ? `backend-v${latest.join('.')}` : `v${latest.join('.')}`;
  console.log(`[RELEASE] Latest ${target} tag ${latestLabel}, bumping ${kind} -> ${nextTag}`);
  return nextTag;
}

function parseVersionArg(target: ReleaseTarget): string {
  const args = process.argv.slice(2);
  const arg = args.find((value) => !isTargetFlag(value));
  if (!arg) {
    console.error('[RELEASE] Usage: bun scripts/release.ts vX.Y.Z | backend-vX.Y.Z | --major | --minor | --patch [--backend]');
    process.exit(1);
  }

  const bumpKind = parseBumpFlag(arg);
  if (bumpKind) {
    return resolveVersionTagFromBumpFlag(bumpKind, target);
  }

  if (!VERSION_TAG_PATTERN.test(arg) && !BACKEND_VERSION_TAG_PATTERN.test(arg)) {
    console.error(`[RELEASE] "${arg}" does not match vX.Y.Z, backend-vX.Y.Z, or --major/--minor/--patch`);
    process.exit(1);
  }
  return arg;
}

function runGitCommand(args: string[]): void {
  const result = Bun.spawnSync(['git', ...args], { stdout: 'inherit', stderr: 'inherit' });
  if (!result.success) {
    console.error(`[RELEASE] git ${args.join(' ')} failed`);
    process.exit(1);
  }
}

function runGit(args: string[]): { success: boolean; stdout: string } {
  const result = Bun.spawnSync(['git', ...args]);
  return { success: result.success, stdout: result.stdout.toString() };
}

function tagExistsLocally(tag: string): boolean {
  const result = Bun.spawnSync(['git', 'rev-parse', '-q', '--verify', `refs/tags/${tag}`]);
  return result.success;
}

function hasUncommittedChanges(): boolean {
  const result = Bun.spawnSync(['git', 'status', '--porcelain']);
  return result.stdout.toString().trim().length > 0;
}

function createAndPushTag(tag: string): void {
  console.log(`[RELEASE] Creating tag ${tag}`);
  runGitCommand(['tag', tag]);
  console.log(`[RELEASE] Pushing ${tag} to origin, this triggers .github/workflows/release.yml`);
  runGitCommand(['push', 'origin', tag]);
  console.log(`[RELEASE] Done. Track the build at https://github.com/Cetrei/velo/actions`);
}

function readPackageJson(path: string): PackageJsonRead {
  const raw = readFileSync(path, 'utf-8');
  return { raw, parsed: JSON.parse(raw) };
}

function parseSemver(version: string, path: string): SemVer {
  const match = version.match(SEMVER_PATTERN);
  if (!match) {
    console.error(`[RELEASE] ${path} version "${version}" is not a plain X.Y.Z semver`);
    process.exit(1);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function bumpPlainSemver(version: string, kind: BumpKind, path: string): string {
  const [major, minor, patch] = parseSemver(version, path);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function writeNextVersion(path: string, nextVersion: string): void {
  const { raw, parsed } = readPackageJson(path);
  parsed.version = nextVersion;
  const indentMatch = raw.match(/\n( +)"/);
  const indent = indentMatch ? indentMatch[1] : '  ';
  writeFileSync(path, `${JSON.stringify(parsed, null, indent)}\n`, 'utf-8');
}

function hasUncommittedChangeAt(path: string): boolean {
  const result = runGit(['status', '--porcelain', '--', path]);
  return result.stdout.trim().length > 0;
}

function commitVersionBump(path: string, nextVersion: string, label: string): void {
  const hasChangeToCommit = hasUncommittedChangeAt(path);
  if (!hasChangeToCommit) {
    console.warn(`[RELEASE] ${path} has no tracked changes to commit, skipping auto-commit`);
    return;
  }

  const added = runGit(['add', path]);
  if (!added.success) {
    console.warn(`[RELEASE] git add ${path} failed, leaving the bump uncommitted`);
    return;
  }

  const commitMessage = `chore(${label}): bump version to ${nextVersion}`;
  const committed = runGit(['commit', '-m', commitMessage, '--', path]);
  if (!committed.success) {
    console.warn('[RELEASE] git commit for the version bump failed, leaving the bump uncommitted');
    return;
  }
  console.log(`[RELEASE] Committed version bump: "${commitMessage}"`);
}

function applyWebVersionBumpIfRequested(): void {
  const bumpKind = findBumpFlag();
  if (!bumpKind) {
    console.log('[RELEASE] No --major/--minor/--patch flag given, deploying web without a version bump');
    return;
  }

  const { parsed } = readPackageJson(WEB_PACKAGE_JSON_PATH);
  const currentVersion = String(parsed.version);
  const nextVersion = bumpPlainSemver(currentVersion, bumpKind, WEB_PACKAGE_JSON_PATH);
  writeNextVersion(WEB_PACKAGE_JSON_PATH, nextVersion);
  console.log(`[RELEASE] apps/web version ${currentVersion} -> ${nextVersion}`);
  commitVersionBump(WEB_PACKAGE_JSON_PATH, nextVersion, 'web');
}

function runOrExit(command: string[], cwd?: string): void {
  const result = Bun.spawnSync(command, { stdout: 'inherit', stderr: 'inherit', cwd });
  if (!result.success) {
    console.error(`[RELEASE] ${command.join(' ')} failed`);
    process.exit(1);
  }
}

function releaseWeb(): void {
  applyWebVersionBumpIfRequested();
  const webDir = join('apps', 'web');
  runOrExit(['bun', 'run', 'build'], webDir);
  runOrExit(['wrangler', 'pages', 'deploy', 'dist', '--project-name=velo'], webDir);
  console.log('[RELEASE] Web deploy complete. This target does not create a git tag or push to origin.');
}

function releaseTagged(target: ReleaseTarget): void {
  const tag = parseVersionArg(target);

  if (hasUncommittedChanges()) {
    console.error('[RELEASE] Uncommitted changes detected. Commit or stash before tagging a release.');
    process.exit(1);
  }

  if (tagExistsLocally(tag)) {
    console.error(`[RELEASE] Tag ${tag} already exists locally. Choose a new version.`);
    process.exit(1);
  }

  createAndPushTag(tag);
}

function main(): void {
  const target = parseReleaseTarget();
  if (target === 'web') {
    releaseWeb();
    return;
  }
  releaseTagged(target);
}

main();
