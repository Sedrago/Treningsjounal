/**
 * sw.js – service worker: cacher app-skallet slik at appen fungerer offline.
 * Selve treningsdataene bor i IndexedDB og berøres ikke av denne.
 */

const CACHE = 'treningsjournal-v1';

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/utils.js',
  'js/db.js',
  'js/store.js',
  'js/api.js',
  'js/sync.js',
  'js/stats.js',
  'js/assistant.js',
  'js/charts.js',
  'js/timer.js',
  'js/importexport.js',
  'js/views/home.js',
  'js/views/workout.js',
  'js/views/logging.js',
  'js/views/history.js',
  'js/views/statistics.js',
  'js/views/bodyweight.js',
  'js/views/exercises.js',
  'js/views/settings.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // API-kall (Apps Script) og andre domener går alltid rett på nettet.
  if (url.origin !== location.origin || event.request.method !== 'GET') return;

  // App-skall: cache først, oppdater i bakgrunnen (stale-while-revalidate).
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
