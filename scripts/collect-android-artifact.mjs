import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const APK_SOURCE_PATH = join('apps', 'web', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const OUTPUT_DIR = 'bin';
const OUTPUT_FILE_NAME = 'velo.apk';

function copyApkToBin() {
  if (!existsSync(APK_SOURCE_PATH)) {
    console.error(`[BUILD] No APK found at ${APK_SOURCE_PATH}. Did the Gradle assembleRelease task succeed?`);
    process.exit(1);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const destinationPath = join(OUTPUT_DIR, OUTPUT_FILE_NAME);
  copyFileSync(APK_SOURCE_PATH, destinationPath);
  console.log(`[BUILD] Android APK copied to ${destinationPath}`);
}

copyApkToBin();
