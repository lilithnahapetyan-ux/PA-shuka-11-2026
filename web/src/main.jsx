import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fonts are bundled with the site (no request to Google): Latin + Armenian.
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/noto-sans-armenian';
import './styles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
