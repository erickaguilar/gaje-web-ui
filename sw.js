/**
 * 🧬 GAJE Helix — Service Worker (PWA Offline Runtime)
 * Configurado dinámicamente mediante config.js
 */

try {
  importScripts('/static/js/config.js');
} catch (e) {
  console.warn('[GAJE-SW] No se pudo cargar config.js de forma síncrona, usando fallback:', e);
}

const VERSION = (self.GAJE_CONFIG && self.GAJE_CONFIG.version) ? self.GAJE_CONFIG.version : '1.7.1';
const CACHE_NAME = `gaje-helix-pwa-v${VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/docs.html',
  '/architecture.html',
  '/manifest.json',
  `/static/css/base.css?v=${VERSION}`,
  `/static/css/chat.css?v=${VERSION}`,
  `/static/css/docs.css?v=${VERSION}`,
  `/static/css/architecture.css?v=${VERSION}`,
  '/static/icons/gaje-icon.svg',
  '/static/icons/y2k/sprite.svg',
  '/static/js/config.js',
  `/static/js/ui.js?v=${VERSION}`,
  `/static/js/storage.js?v=${VERSION}`,
  `/static/js/chat.js?v=${VERSION}`,
  '/static/js/wasm_worker.js',
  `/static/partials/chat_toolbar.html?v=${VERSION}`,
  `/static/partials/header.html?v=${VERSION}`
];

self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[GAJE-SW] Cache prefetch error:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // No interceptar peticiones de modelos binarios (.flat) ni endpoints /api/
  if (url.pathname.endsWith('.flat') || url.pathname.startsWith('/api/') || url.hostname.includes('huggingface.co')) {
    return;
  }

  // Network-First Strategy para asegurar actualizaciones instantáneas
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});
