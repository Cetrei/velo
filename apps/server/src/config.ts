import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { validateSystemConfig, validateUserConfig, type SystemConfig, type UserConfig } from 'shared-types';
import { formatLog, LogMessage } from './log-messages';

const SYSTEM_CONFIG_PATH = '../../config/system.yml';
const USER_CONFIG_PATH = '../../config/user.yml';

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
