import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import Mudanza, { unregisterOldWorker } from './components/Mudanza.tsx';
import './styles.css';

/** Versión publicada en la dirección antigua: solo el aviso de mudanza. */
const MUDANZA = import.meta.env.VITE_MUDANZA === '1';

// Safari en iPhone ignora user-scalable=no en pestañas normales; esto bloquea el gesto de pellizcar.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

// Uso sin conexión (solo en la versión publicada, no en desarrollo).
if (MUDANZA) {
  void unregisterOldWorker();
} else if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* sin service worker la app funciona igual, con conexión */ });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {MUDANZA ? <Mudanza /> : <App />}
  </StrictMode>,
);
