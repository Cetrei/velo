import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ANDROID_DIR = join('apps', 'web', 'android');
const GRADLEW_WINDOWS = 'gradlew.bat';
const GRADLEW_UNIX = './gradlew';

function resolveGradleJavaHome(): string | undefined {
  const path = process.env.ANDROID_JAVA_HOME;
  if (!path) return undefined;
  if (!existsSync(path)) {
    console.error(`[BUILD] ANDROID_JAVA_HOME not found: ${path}`);
    process.exit(1);
  }
  return path;
}

function resolveJavaVersion(): number {
  const home = resolveGradleJavaHome();
  if (!home) return 21;
  const match = home.match(/jdk-(\d+)/);
  return match ? parseInt(match[1]!, 10) : 21;
}

function resolveGradlewCommand(): string {
  return process.platform === 'win32' ? GRADLEW_WINDOWS : GRADLEW_UNIX;
}

function writeGradleProperties(javaVersion: number): void {
  const propsPath = join(ANDROID_DIR, 'gradle.properties');
  const existing = existsSync(propsPath) ? readFileSync(propsPath, 'utf-8') : '';
  const marker = '# --- VELD ---';
  const base = existing.includes(marker) ? existing.split(marker)[0] : existing;
  const lines = [
    `${marker}`,
    `veloJavaVersion=${javaVersion}`,
    `veloAndroidHome=${(process.env.ANDROID_HOME || '').replace(/\\/g, '/')}`,
    `veloAndroidDistDir=${((process.env.VELO_DIST_DIR || 'bin/') + "android/").replace(/\\/g, '/')}`,
  ];
  writeFileSync(propsPath, base + lines.join('\n') + '\n');
}

function writeCapacitorBuildGradle(javaVersion: number): void {
  const content = `def javaVersion = (project.findProperty("veloJavaVersion") ?: "${javaVersion}").toInteger()

android {
  compileOptions {
      sourceCompatibility JavaVersion.toVersion(javaVersion)
      targetCompatibility JavaVersion.toVersion(javaVersion)
  }
}

apply from: "../capacitor-cordova-android-plugins/cordova.variables.gradle"

if (hasProperty('postBuildExtras')) {
  postBuildExtras()
}
`;
  writeFileSync(join(ANDROID_DIR, 'capacitor.build.gradle'), content);
}

function runGradleTask(taskName: string): void {
  const javaVersion = resolveJavaVersion();
  const gradleJavaHome = resolveGradleJavaHome();
  const gradlewCommand = resolveGradlewCommand();

  writeGradleProperties(javaVersion);
  writeCapacitorBuildGradle(javaVersion);

  if (gradleJavaHome) {
    console.log(`[BUILD] JAVA_HOME: ${gradleJavaHome}`);
  }

  const result = spawnSync(gradlewCommand, [taskName], {
    cwd: ANDROID_DIR,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      ...(gradleJavaHome ? { JAVA_HOME: gradleJavaHome } : {}),
    },
  });

  if (result.status !== 0) {
    console.error(`[BUILD] Gradle failed: ${taskName} (${result.status})`);
    process.exit(result.status ?? 1);
  }
}

const taskName = process.argv[2];
if (!taskName) {
  console.error('[BUILD] Usage: bun scripts/run-gradle-task.ts <task>');
  process.exit(1);
}

runGradleTask(taskName);