import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cetrei.velo',
  appName: 'Velo',
  webDir: 'dist',
  androidDir: '../android',
  server: {
    url: 'https://velo.cetrei.dev',
    cleartext: false,
  },
};

export default config;
