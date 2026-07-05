/**
 * app.js – oppstart, tema, ruter og navigasjon.
 */

import * as store from './store.js';
import * as sync from './sync.js';
import * as api from './api.js';
import { initContent, checkContentUpdate } from './content.js';

import * as home from './views/home.js';
import * as workout from './views/workout.js';
import * as logging from './views/logging.js';
import * as history from './views/history.js';
import * as statistics from './views/statistics.js';
import * as bodyweight from './views/bodyweight.js';
import * as exercises from './views/exercises.js';
import * as exerciseLibrary from './views/exercise-library.js';
import * as settings from './views/settings.js';

/** Rutetabell: sti → render-funksjon. */
const routes = {
  hjem: home.render,
  okt: workout.render,
  logg: logging.render,
  historikk: history.render,
  ovelse: history.renderExercise,
  statistikk: statistics.render,
  kroppsvekt: bodyweight.render,
  ovelser: exercises.render,
  bibliotek: exerciseLibrary.render,
  innstillinger: settings.render,
};

/** Setter tema-attributt på <html> ut fra innstilling. */
export function applyTheme(theme = store.getSetting('theme')) {
  let resolved = theme;
  if (theme === 'auto') {
    resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = resolved === 'light' ? '#f4f6f9' : '#0b0e13';
}

/** Parser '#/rute/param?nokkel=verdi'. */
function parseHash() {
  const hash = location.hash.replace(/^#\/?/, '') || store.getSetting('startPage');
  const [pathPart, queryPart] = hash.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  return { route: segments[0] || 'hjem', params: segments.slice(1), query };
}

async function renderRoute() {
  const { route, params, query } = parseHash();
  const renderFn = routes[route] || home.render;
  const main = document.getElementById('app');
  main.scrollTop = 0;
  window.scrollTo(0, 0);
  try {
    await renderFn(main, params, query);
  } catch (err) {
    console.error(err);
    main.innerHTML = `<p class="tomt">Noe gikk galt: ${err.message}</p>`;
  }
}

/** Liten indikator øverst når appen er frakoblet eller har ventende endringer. */
function setupSyncBadge() {
  const badge = document.getElementById('synk-indikator');
  sync.onChange((st) => {
    if (!st.online) {
      badge.textContent = 'Frakoblet – endringer lagres lokalt';
      badge.className = 'vis frakoblet';
    } else if (st.pending > 0) {
      badge.textContent = `${st.pending} endringer venter på synk`;
      badge.className = 'vis venter';
    } else {
      badge.className = '';
    }
  });
}

async function main() {
  await store.initSettings();
  applyTheme();
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (store.getSetting('theme') === 'auto') applyTheme();
  });

  await initContent({ force: true });
  await sync.init();
  await store.ensureDefaultExercises();
  await store.migrateExerciseCatalogIds();
  setupSyncBadge();

  window.addEventListener('hashchange', renderRoute);
  window.addEventListener('content-updated', () => renderRoute());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkContentUpdate();
  });
  await renderRoute();

  // Førstegangsbruk: pek mot innstillinger hvis tilkobling mangler.
  if (!api.isConfigured() && !sessionStorage.getItem('tj_hintVist')) {
    sessionStorage.setItem('tj_hintVist', '1');
    const badge = document.getElementById('synk-indikator');
    badge.textContent = 'Ikke koblet til Google Sheets – se Innstillinger';
    badge.className = 'vis venter';
    setTimeout(() => { if (sync.state.online && sync.state.pending === 0) badge.className = ''; }, 6000);
  }

  // Service worker for offline-støtte.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* f.eks. file:// under utvikling */ });
  }
}

main();
