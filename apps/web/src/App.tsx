import { getClientEnvironment } from './lib/environment';
import { Host } from './views/Host';
import { Viewer } from './views/Viewer';
import { Sandbox } from './views/Sandbox';

export function App() {
  const environment = getClientEnvironment();

  if (environment === 'MOBILE_HOST') return <Host />;
  if (environment === 'DESKTOP_VIEWER') return <Viewer />;
  return <Sandbox />;
}
