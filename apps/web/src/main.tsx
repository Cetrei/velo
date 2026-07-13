import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initDevLogger } from './lib/dev-logger';
import './index.css';

initDevLogger();

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('[WEB] Root element not found, cannot mount the application');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
