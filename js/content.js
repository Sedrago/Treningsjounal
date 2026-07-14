/**
 * content.js – innholdspakke for øvelsesbeskrivelser (og senere bilder).
 *
 * Beskrivelser lever i data/ovelsesinnhold.json og oppdateres med app-versjonen.
 * Ved oppstart sjekkes alltid om server har nyere versjon enn det som er lastet.
 */

import * as db from './db.js';

/** Laveste støttede versjon (under dette avvises pakken). */
const MIN_CONTENT_VERSION = 6;

/** Minst tid mellom bakgrunnssjekk når appen hentes frem (1 time). */
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

let pack = null;

/** Absolutt URL til innholdsfil. */
function contentJsonUrl({ bust = false } = {}) {
  let base = location.pathname;
  if (base.endsWith('.html')) {
    base = base.replace(/\/[^/]+$/, '/');
  } else if (!base.endsWith('/')) {
    base = `${base}/`;
  }
  const url = new URL(`${base}data/ovelsesinnhold.json`, location.origin);
  url.searchParams.set('min', String(MIN_CONTENT_VERSION));
  if (bust) url.searchParams.set('t', String(Date.now()));
  return url.href;
}

/** URL uten cache-bust (for offline-fallback i Cache API). */
function contentCacheUrl() {
  return contentJsonUrl({ bust: false });
}

function validatePack(data) {
  if (!data?.entries || data.version < MIN_CONTENT_VERSION) {
    throw new Error(`Ugyldig innholdspakke (v${data?.version ?? '?'})`);
  }
}

async function loadFromCacheFallback() {
  if (!('caches' in window)) return false;
  try {
    const names = await caches.keys();
    for (const name of names) {
      if (!name.startsWith('treningsjournal-')) continue;
      const cache = await caches.open(name);
      const res = await cache.match(contentCacheUrl());
      if (!res) continue;
      const data = await res.json();
      validatePack(data);
      pack = data;
      return true;
    }
  } catch (err) {
    console.warn('Kunne ikke lese innhold fra cache:', err);
  }
  return false;
}

/**
 * Laster innholdspakke fra service worker-cache (rask oppstart).
 * @returns {boolean}
 */
export async function initContentFromCache() {
  if (pack?.version >= MIN_CONTENT_VERSION) return true;
  return loadFromCacheFallback();
}

/**
 * Henter innholdspakke fra nettet og oppdaterer hvis versjonen er nyere.
 * @param {{ force?: boolean }} opts force=true hopper over throttle
 * @returns {boolean} true hvis brukbar pakke finnes
 */
export async function initContent({ force = false } = {}) {
  if (!force && pack) {
    const last = Number(await db.getMeta('contentLastCheck', 0));
    if (Date.now() - last < CHECK_INTERVAL_MS) return true;
  }

  const previousVersion = pack?.version ?? Number(await db.getMeta('contentVersion', 0));

  try {
    const res = await fetch(contentJsonUrl({ bust: true }), { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    validatePack(data);

    const now = String(Date.now());
    await db.setMeta('contentLastCheck', now);

    if (pack && pack.version === data.version) return true;

    pack = data;
    await db.setMeta('contentVersion', String(data.version));

    if (data.version > previousVersion) {
      window.dispatchEvent(new CustomEvent('content-updated', {
        detail: { version: data.version, previous: previousVersion },
      }));
    }
    return true;
  } catch (err) {
    console.warn('Kunne ikke laste øvelsesinnhold:', err);
    if (pack) return true;
    return loadFromCacheFallback();
  }
}

/** Sjekk for ny innholdsversjon når appen hentes frem (throttlet). */
export async function checkContentUpdate() {
  if (!navigator.onLine) return false;
  return initContent({ force: false });
}

/** Tving ny innlasting (f.eks. etter deploy under utvikling). */
export async function reloadContent() {
  pack = null;
  return initContent({ force: true });
}

export function isContentLoaded() {
  return pack?.version >= MIN_CONTENT_VERSION;
}

function entryToCatalog(id, raw) {
  if (!raw) return null;
  return {
    id,
    name: raw.name || id,
    category: raw.category || '',
    description: raw.description || '',
  };
}

/** @returns {object|null} Katalogpost med id, name, category, description. */
export function getCatalogEntry(catalogId) {
  if (!pack || !catalogId) return null;
  return entryToCatalog(catalogId, pack.entries[catalogId]);
}

/** Alle katalogøvelser, sortert på navn. */
export function getAllCatalogEntries() {
  if (!pack) return [];
  return Object.entries(pack.entries)
    .map(([id, raw]) => entryToCatalog(id, raw))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

/** Søk i katalogen på navn. */
export function searchCatalog(query, { categoryId = null } = {}) {
  const q = query.trim().toLowerCase();
  let list = getAllCatalogEntries();
  if (categoryId) list = list.filter((e) => e.category === categoryId);
  if (!q) return list;
  return list.filter((e) => e.name.toLowerCase().includes(q));
}

/** Alle katalogøvelser i én kategori, sortert på navn. */
export function getCatalogByCategory(categoryId) {
  if (!pack) return [];
  return Object.entries(pack.entries)
    .filter(([, raw]) => raw.category === categoryId)
    .map(([id, raw]) => entryToCatalog(id, raw))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

/** Antall katalogøvelser som ikke finnes i brukerens aktive bibliotek. */
export function countCatalogNotInApp(activeCatalogIds) {
  if (!pack) return 0;
  const inApp = new Set(activeCatalogIds);
  return Object.keys(pack.entries).filter((id) => !inApp.has(id)).length;
}

/** @returns {string} Teknikkbeskrivelse for en øvelse, eller tom streng. */
export function getDescription(exercise) {
  if (!exercise || !pack) return '';
  const key = exercise.catalogId || exercise.id;
  return pack.entries[key]?.description || '';
}

/** Versjon av innholdspakken som er lastet. */
export function contentVersion() {
  return pack?.version ?? 0;
}
