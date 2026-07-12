import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cetrei.velo',
  appName: 'Velo',
  webDir: 'dist',
  server: {
    url: "https://velo-app.cetrei.dev",
    cleartext: false
  }
};

export default config;
