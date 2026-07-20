/**
 * app.js – oppstart, tema, ruter og navigasjon.
 */

import * as store from './store.js';
import * as sync from './sync.js';
import * as api from './api.js';
import { initContent, initContentFromCache, checkContentUpdate, getStarterPackEntries } from './content.js';
import { toast, esc } from './utils.js';

import * as home from './views/home.js';
import * as strength from './views/strength.js';
import * as logging from './views/logging.js';
import * as history from './views/history.js';
import * as statistics from './views/statistics.js';
import * as bodyweight from './views/bodyweight.js';
import * as aerobic from './views/aerobic.js';
import * as anaerob from './views/anaerob.js';
import * as sleep from './views/sleep.js';
import * as mood from './views/mood.js';
import * as exercises from './views/exercises.js';
import { maybeShowMoodPrompt } from './mood-prompt.js';
import * as exerciseLibrary from './views/exercise-library.js';
import * as sessionEdit from './views/session-edit.js';
import * as calendar from './views/calendar.js';
import * as programs from './views/programs.js';
import * as programEdit from './views/program-edit.js';
import * as settings from './views/settings.js';
import * as programImport from './views/program-import.js';
import * as inbox from './views/inbox.js';
import * as setupImport from './views/setup-import.js';
import * as nutrition from './views/nutrition.js';
import * as strengthHub from './views/strength-hub.js';
import * as logHub from './views/log-hub.js';
import * as relay from './relay-api.js';

/** Rutetabell: sti → render-funksjon. */
const routes = {
  hjem: home.render,
  styrke: strength.render,
  okt: strength.render,
  planlegg: strength.render,
  logg: logging.render,
  historikk: history.render,
  kalender: calendar.render,
  programmer: (container, params, query) => {
    if (params[0] === 'rediger' && params[1]) return programEdit.render(container, params.slice(1), query);
    return programs.render(container, params, query);
  },
  'rediger-okt': sessionEdit.render,
  ovelse: history.renderExercise,
  statistikk: statistics.render,
  kroppsvekt: bodyweight.render,
  inntak: nutrition.render,
  aerob: aerobic.render,
  anaerob: anaerob.render,
  sovn: sleep.render,
  folelse: mood.render,
  ovelser: exercises.render,
  bibliotek: exerciseLibrary.render,
  innstillinger: settings.render,
  program: programImport.render,
  innboks: inbox.render,
  oppsett: setupImport.render,
  styrketrening: strengthHub.render,
  logging: logHub.render,
  innsikt: statistics.render,
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
  let start = store.getSetting('startPage');
  if (start === 'okt') start = 'styrke';
  const hash = location.hash.replace(/^#\/?/, '') || start;
  const [pathPart, queryPart] = hash.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  let route = segments[0] || 'hjem';
  if (route === 'okt' || route === 'planlegg') route = 'styrke';
  return { route, params: segments.slice(1), query };
}

async function applyStarterPackIfNeeded() {
  const entries = getStarterPackEntries();
  const added = await store.ensureStarterPackForExistingUser(entries);
  if (added > 0) toast(`${added} startøvelser lagt til`, 'suksess');
  return added;
}

async function renderRoute() {
  const { route, params, query } = parseHash();
  const renderFn = routes[route] || home.render;
  const main = document.getElementById('app');
  main.classList.remove('app--styrke-oktt');
  main.scrollTop = 0;
  window.scrollTo(0, 0);
  try {
    await renderFn(main, params, query);
    await maybeShowMoodPrompt(route);
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

let lastInboxHintCount = -1;

async function checkRelayInboxOnStart() {
  const count = await relay.checkRelayInboxQuietly();
  if (count <= 0 || count === lastInboxHintCount) return;
  lastInboxHintCount = count;
  toast(`${count} ny${count === 1 ? '' : 'e'} program${count === 1 ? '' : 'mer'} i innboksen — se #/innboks`, 'info');
}

async function main() {
  await store.initSettings();
  await relay.migrateRelayIdentityToSettings();
  await relay.applyIdentityFromSettings(
    store.getSetting('relayUsername'),
    store.getSetting('relayDeviceSecret'),
    { sync: false },
  );
  await store.migratePlanModelOnce();
  applyTheme();
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (store.getSetting('theme') === 'auto') applyTheme();
  });

  setupSyncBadge();

  window.addEventListener('hashchange', renderRoute);
  window.addEventListener('content-updated', () => applyStarterPackIfNeeded().then(() => renderRoute()));
  window.addEventListener('sync-complete', () => applyStarterPackIfNeeded().then(() => renderRoute()));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkContentUpdate();
      maybeShowMoodPrompt(parseHash().route);
      checkRelayInboxOnStart();
    }
  });

  // Vis UI raskt – cache først, nett og synk i bakgrunnen.
  await initContentFromCache();
  await applyStarterPackIfNeeded();
  await renderRoute();

  checkRelayInboxOnStart();

  sync.init();
  initContent({ force: false }).then(async (ok) => {
    if (ok) {
      await applyStarterPackIfNeeded();
      renderRoute();
    }
  });

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

main().catch((err) => {
  console.error(err);
  const el = document.getElementById('app');
  if (el) el.innerHTML = `<p class="tomt">Kunne ikke starte appen: ${esc(err.message)}</p>`;
});
