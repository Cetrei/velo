import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parse } from 'yaml';
import { validateSystemConfig, validateUserConfig, type SystemConfig, type UserConfig } from 'shared-types';
import { formatLog, LogMessage } from './log-messages';

const DEV_CONFIG_DIR = join('..', '..', 'config');

function isCompiledBinary(): boolean {
  return !/^bun(\.exe)?$/i.test(basename(process.execPath));
}

function resolveConfigDir(): string {
  const override = process.env.VELO_CONFIG_DIR;
  if (override) return override;
  if (isCompiledBinary()) return join(dirname(process.execPath), 'config');
  return DEV_CONFIG_DIR;
}

const SYSTEM_CONFIG_PATH = join(resolveConfigDir(), 'system.yml');
const USER_CONFIG_PATH = join(resolveConfigDir(), 'user.yml');

function readYamlFile(path: string): unknown {
  try {
    const raw = readFileSync(path, 'utf-8');
    return parse(raw);
  } catch (error) {
    console.error(formatLog(LogMessage.ConfigReadFailed), error);
    throw new Error(formatLog(LogMessage.ConfigReadFailed));
  }
}

function applyEnvOverrides(systemConfig: SystemConfig): SystemConfig {
  const envPort = process.env.VELO_SIGNALING_PORT;
  if (!envPort) {
    return systemConfig;
  }
  const parsedPort = Number(envPort);
  if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
    throw new Error(formatLog(LogMessage.InvalidEnvPort, { value: envPort }));
  }
  return { ...systemConfig, network: { ...systemConfig.network, signaling_port: parsedPort } };
}

export function readSystemConfig(): SystemConfig {
  const systemConfig = validateSystemConfig(readYamlFile(SYSTEM_CONFIG_PATH));
  return applyEnvOverrides(systemConfig);
}

export function readUserConfig(): UserConfig {
  return validateUserConfig(readYamlFile(USER_CONFIG_PATH));
}

export type { SystemConfig, UserConfig };
