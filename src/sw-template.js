// Service worker: permite abrir la app y usar el lector de fotos sin conexión.
// - La página (index.html) se pide primero a la red, para tener siempre la última versión; si no hay
//   conexión, se usa la copia guardada.
// - Los archivos con huella en el nombre (assets/…) y los del lector (ocr/…) se sirven desde la caché.
// - Las búsquedas en Open Food Facts se guardan para poder repetirlas sin conexión.
const VERSION = '__VERSION__';
const SHELL = `shell-${VERSION}`;
const OCR = 'ocr-v1';
const API = 'off-api-v1';
const PRECACHE = __PRECACHE__;
// Los scripts de tipo «module» se piden con la cabecera Origin; si el servidor responde con
// «Vary: Origin», la caché no los encontraría sin ignoreVary.
const MATCH = { ignoreVary: true };

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (e) {
    const cached = await cache.match(request, { ...MATCH, ignoreSearch: request.mode === 'navigate' });
    if (cached) return cached;
    throw e;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, MATCH);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.hostname.endsWith('openfoodfacts.org') && url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API, 8000));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL, 4000).catch(() => caches.match('./', MATCH)));
  } else if (url.pathname.includes('/ocr/')) {
    event.respondWith(cacheFirst(request, OCR));
  } else {
    event.respondWith(caches.match(request, MATCH).then((r) => r || fetch(request)));
  }
});
