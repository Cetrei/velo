const VERSION_TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)$/;
const BACKEND_VERSION_TAG_PATTERN = /^backend-v(\d+)\.(\d+)\.(\d+)$/;

function parseVersionArg(): string {
  const arg = process.argv[2];
  if (!arg) {
    console.error('[RELEASE] Usage: bun scripts/release.ts vX.Y.Z (e.g. v1.4.2) or backend-vX.Y.Z (e.g. backend-v1.4.2)');
    process.exit(1);
  }
  if (!VERSION_TAG_PATTERN.test(arg) && !BACKEND_VERSION_TAG_PATTERN.test(arg)) {
    console.error(`[RELEASE] "${arg}" does not match vX.Y.Z or backend-vX.Y.Z (e.g. v1.4.2 or backend-v1.4.2)`);
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
