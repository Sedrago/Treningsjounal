/**
 * sw.js – service worker: cacher app-skallet slik at appen fungerer offline.
 * Selve treningsdataene bor i IndexedDB og berøres ikke av denne.
 */

const CACHE = 'flowbooster-v109';

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'data/ovelsesinnhold.json',
  'js/app.js',
  'js/utils.js',
  'js/db.js',
  'js/store.js',
  'js/legacy-exercises.js',
  'js/content.js',
  'js/exercise-filters.js',
  'js/api.js',
  'js/sync.js',
  'js/stats.js',
  'js/momentum.js',
  'js/home-insight.js',
  'js/assistant.js',
  'js/partner-momentum.js',
  'js/charts.js',
  'js/pickers.js',
  'js/session-log.js',
  'js/timer.js',
  'js/importexport.js',
  'js/program-share.js',
  'js/relay-api.js',
  'js/setup-share.js',
  'js/mood-prompt.js',
  'js/nutrition-ui.js',
  'js/program-ui.js',
  'js/program-pickers.js',
  'js/views/programs.js',
  'js/views/program-edit.js',
  'js/views/home.js',
  'js/views/strength.js',
  'js/views/logging.js',
  'js/views/history.js',
  'js/views/calendar.js',
  'js/views/session-edit.js',
  'js/views/statistics.js',
  'js/views/bodyweight.js',
  'js/views/aerobic.js',
  'js/views/anaerob.js',
  'js/views/sleep.js',
  'js/views/mood.js',
  'js/views/nutrition.js',
  'js/views/strength-hub.js',
  'js/views/log-hub.js',
  'js/views/exercises.js',
  'js/views/exercise-library.js',
  'js/views/settings.js',
  'js/views/program-import.js',
  'js/views/inbox.js',
  'js/views/setup-import.js',
  'icons/flowbooster-logo.png',
  'icons/flowbooster-logo-dark.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png',
  'icons/apple-touch-icon.png',
  'images/core.jpg',
  'images/hinge.jpg',
  'images/horisontal_pull.jpg',
  'images/horisontal_push.jpg',
  'images/squat.jpg',
  'images/utholdenhet.jpg',
  'images/valgfri.jpg',
  'images/vertikal_pull.jpg',
  'images/vertikal_push.jpg',
];

/** Lagrer innholdspakke under stabil nøkkel (uten t= cache-bust). */
function contentCacheKey(url) {
  const u = new URL(url);
  if (!u.pathname.endsWith('/data/ovelsesinnhold.json')) return url;
  u.searchParams.delete('t');
  return u.href;
}

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
  if (url.origin !== location.origin || event.request.method !== 'GET') return;

  // Innholdspakke: nett først, cache kun som offline-reserve.
  if (url.pathname.endsWith('/data/ovelsesinnhold.json')) {
    const cacheKey = contentCacheKey(event.request.url);
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(cacheKey, copy));
          }
          return response;
        })
        .catch(() => caches.match(cacheKey))
    );
    return;
  }

  // JS/CSS: nett først slik at oppdateringer treffer med én gang.
  if (/\.(js|css)$/.test(url.pathname)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

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
