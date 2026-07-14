const VERSION_TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)$/;
const BACKEND_VERSION_TAG_PATTERN = /^backend-v(\d+)\.(\d+)\.(\d+)$/;

type SemVer = [number, number, number];
type BumpKind = 'major' | 'minor' | 'patch';

function parseBumpFlag(arg: string): BumpKind | null {
  if (arg === '--major') return 'major';
  if (arg === '--minor') return 'minor';
  if (arg === '--patch') return 'patch';
  return null;
}

function listVersionTags(): string[] {
  const result = Bun.spawnSync(['git', 'tag', '--list', 'v*']);
  return result.stdout.toString().split('\n').map((line) => line.trim()).filter(Boolean);
}

function parseSemverTag(tag: string): SemVer | null {
  const match = tag.match(VERSION_TAG_PATTERN);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a: SemVer, b: SemVer): number {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function findLatestVersionTag(): SemVer {
  const parsed = listVersionTags()
    .map(parseSemverTag)
    .filter((entry): entry is SemVer => entry !== null);
  if (parsed.length === 0) return [0, 0, 0];
  return parsed.reduce((latest, candidate) => (compareSemver(candidate, latest) > 0 ? candidate : latest));
}

function bumpSemver([major, minor, patch]: SemVer, kind: BumpKind): string {
  if (kind === 'major') return `v${major + 1}.0.0`;
  if (kind === 'minor') return `v${major}.${minor + 1}.0`;
  return `v${major}.${minor}.${patch + 1}`;
}

function resolveVersionTagFromBumpFlag(kind: BumpKind): string {
  const latest = findLatestVersionTag();
  const nextTag = bumpSemver(latest, kind);
  console.log(`[RELEASE] Latest tag v${latest.join('.')}, bumping ${kind} -> ${nextTag}`);
  return nextTag;
}

function parseVersionArg(): string {
  const arg = process.argv[2];
  if (!arg) {
    console.error('[RELEASE] Usage: bun scripts/release.ts vX.Y.Z | backend-vX.Y.Z | --major | --minor | --patch');
    process.exit(1);
  }

  const bumpKind = parseBumpFlag(arg);
  if (bumpKind) {
    return resolveVersionTagFromBumpFlag(bumpKind);
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

function main(): void {
  const tag = parseVersionArg();

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

main();
