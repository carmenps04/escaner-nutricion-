import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Copia el lector de texto (OCR) a dist/ocr al compilar, igual que en la app del gimnasio: la lectura
 * de fotos se hace dentro del móvil, sin servidores externos ni claves de API.
 */
function ocrAssets(): Plugin {
  return {
    name: 'ocr-assets',
    apply: 'build',
    closeBundle() {
      const out = 'dist/ocr';
      mkdirSync(out, { recursive: true });
      cpSync('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`);
      for (const f of readdirSync('node_modules/tesseract.js-core')) {
        if (f.endsWith('.wasm.js')) cpSync(`node_modules/tesseract.js-core/${f}`, `${out}/${f}`);
      }
      cpSync('node_modules/@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz', `${out}/spa.traineddata.gz`);
    },
  };
}

/**
 * Genera dist/sw.js (para usar la app sin conexión) con la lista de archivos de esta compilación.
 * Cada despliegue cambia la versión, así el móvil descarta la caché anterior.
 */
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const f of readdirSync(dir)) {
          const full = join(dir, f);
          if (statSync(full).isDirectory()) { if (f !== 'ocr') walk(full); }
          else files.push('./' + full.slice('dist/'.length));
        }
      };
      walk('dist');
      const version = Date.now().toString(36);
      const tpl = readFileSync('src/sw-template.js', 'utf8');
      writeFileSync('dist/sw.js', tpl.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(['./', ...files.filter((f) => f !== './sw.js')])));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), ocrAssets(), serviceWorker()],
  define: {
    __APP_VERSION__: JSON.stringify(
      new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
    ),
  },
  build: { chunkSizeWarningLimit: 900 },
  // Solo para las pruebas de sincronización entre dispositivos: Firebase de mentira.
  resolve: process.env.FAKE_FIREBASE
    ? { alias: { 'firebase/app': '/tests/fake-firebase/app.js', 'firebase/auth': '/tests/fake-firebase/auth.js', 'firebase/firestore': '/tests/fake-firebase/firestore.js' } }
    : undefined,
});
