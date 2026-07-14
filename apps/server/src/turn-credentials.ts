import { createHmac } from 'node:crypto';
import type { TurnRelayConfig } from 'shared-types';

const CREDENTIAL_TTL_SECONDS = 3600;

export interface TurnCredentials {
  urls: string[];
  username: string;
  credential: string;
}

export interface CredentialedIceServer {
  urls: string;
  username: string;
  credential: string;
}

function buildTurnUrls(turn: TurnRelayConfig): string[] {
  return [
    `turn:${turn.realm}:${turn.port}?transport=udp`,
    `turn:${turn.realm}:${turn.port}?transport=tcp`,
    `turns:${turn.realm}:${turn.tls_port}?transport=tcp`,
  ];
}

function signUsername(username: string, secret: string): string {
  return createHmac('sha1', secret).update(username).digest('base64');
}

export function generateTurnCredentials(turn: TurnRelayConfig, secret: string): TurnCredentials {
  const expiresAt = Math.floor(Date.now() / 1000) + CREDENTIAL_TTL_SECONDS;
  const username = `${expiresAt}:velo`;
  return {
    urls: buildTurnUrls(turn),
    username,
    credential: signUsername(username, secret),
  };
}

export function turnCredentialsToIceServers(credentials: TurnCredentials): CredentialedIceServer[] {
  return credentials.urls.map((url) => ({
    urls: url,
    username: credentials.username,
    credential: credentials.credential,
  }));
}
