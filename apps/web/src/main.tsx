import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('[WEB] Root element not found, cannot mount the application');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
