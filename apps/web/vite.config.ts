import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const SYSTEM_CONFIG_PATH = '../../config/system.yml';

function readWebServerPort(): number {
  const raw = readFileSync(SYSTEM_CONFIG_PATH, 'utf-8');
  const parsed = parse(raw);
  return parsed.network.web_server_port;
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: readWebServerPort(),
  },
});
