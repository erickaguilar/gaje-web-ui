/**
 * 🧬 GAJE Helix — Service Worker (PWA Offline Runtime)
 */

const CACHE_NAME = 'gaje-helix-pwa-v1.7.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/docs.html',
  '/architecture.html',
  '/manifest.json',
  '/static/css/base.css',
  '/static/css/chat.css',
  '/static/css/docs.css',
  '/static/css/architecture.css',
  '/static/icons/gaje-icon.svg',
  '/static/icons/y2k/sprite.svg',
  '/static/js/ui.js',
  '/static/js/storage.js',
  '/static/js/chat.js',
  '/static/js/wasm_worker.js',
  '/static/partials/chat_toolbar.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[GAJE-SW] Cache prefetch error:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // No interceptar peticiones de modelos pesados (.flat de Hugging Face o /api/)
  if (url.pathname.endsWith('.flat') || url.pathname.startsWith('/api/') || url.hostname.includes('huggingface.co')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
