/**
 * 🧬 GAJE Helix — Service Worker (PWA Offline Runtime)
 */

const CACHE_NAME = 'gaje-helix-pwa-v1.7.1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/docs.html',
  '/architecture.html',
  '/manifest.json',
  '/static/css/base.css?v=1.7.1',
  '/static/css/chat.css?v=1.7.1',
  '/static/css/docs.css?v=1.7.1',
  '/static/css/architecture.css?v=1.7.1',
  '/static/icons/gaje-icon.svg',
  '/static/icons/y2k/sprite.svg',
  '/static/js/ui.js?v=1.7.1',
  '/static/js/storage.js?v=1.7.1',
  '/static/js/chat.js?v=1.7.1',
  '/static/js/wasm_worker.js',
  '/static/partials/chat_toolbar.html?v=1.7.1',
  '/static/partials/header.html?v=1.7.1'
];

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

  // No interceptar peticiones de modelos pesados (.flat) ni APIs
  if (url.pathname.endsWith('.flat') || url.pathname.startsWith('/api/') || url.hostname.includes('huggingface.co')) {
    return;
  }

  // Network-First Strategy para asegurar actualizaciones inmediatas en móvil
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
