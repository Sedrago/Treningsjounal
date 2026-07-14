/**
 * content.js – innholdspakke for øvelsesbeskrivelser (og senere bilder).
 *
 * Beskrivelser lever i data/ovelsesinnhold.json og oppdateres med app-versjonen.
 * Ved oppstart sjekkes alltid om server har nyere versjon enn det som er lastet.
 */

import * as db from './db.js';

/** Laveste støttede versjon (under dette avvises pakken). */
const MIN_CONTENT_VERSION = 7;

/** Norske etiketter for utstyr i katalogen. */
export const EQUIPMENT_LABELS = {
  barbell: 'Stang',
  dumbbell: 'Manual',
  'body only': 'Kroppsvekt',
  cable: 'Kabler',
  machine: 'Maskin',
  kettlebells: 'Kettlebells',
  bands: 'Strikkbånd',
  other: 'Annet',
  'medicine ball': 'Medisinball',
  'exercise ball': 'Gymball',
  'foam roll': 'Foam roller',
  'e-z curl bar': 'EZ-stang',
};

/** Norske etiketter for primære muskelgrupper. */
export const MUSCLE_LABELS = {
  quadriceps: 'Quadriceps',
  shoulders: 'Skuldre',
  abdominals: 'Mage',
  chest: 'Bryst',
  hamstrings: 'Hamstrings',
  triceps: 'Triceps',
  biceps: 'Biceps',
  lats: 'Latissimus',
  'middle back': 'Midtre rygg',
  calves: 'Legger',
  'lower back': 'Korsrygg',
  forearms: 'Underarmer',
  glutes: 'Setemuskler',
  traps: 'Trapez',
  adductors: 'Adduktorer',
  neck: 'Nakke',
  abductors: 'Abduktorer',
};

export function equipmentLabel(id) {
  if (!id) return 'Uspesifisert';
  return EQUIPMENT_LABELS[id] || id;
}

export function muscleLabel(id) {
  return MUSCLE_LABELS[id] || id;
}

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
    equipment: raw.equipment || '',
    primaryMuscles: Array.isArray(raw.primaryMuscles) ? raw.primaryMuscles : [],
    starter: Boolean(raw.starter),
  };
}

/** Id-er for grunnleggende startpakke (3–4 per kategori). */
export function getStarterPackIds() {
  if (!pack?.starterPack?.length) return [];
  return pack.starterPack;
}

/** Katalogposter i startpakken. */
export function getStarterPackEntries() {
  if (!pack) return [];
  return getStarterPackIds()
    .map((id) => entryToCatalog(id, pack.entries[id]))
    .filter(Boolean);
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

/** Filtrer katalogen på kategori, utstyr, muskel og navn. */
export function filterCatalog({
  categoryId = null,
  equipment = null,
  muscle = null,
  query = '',
} = {}) {
  const q = query.trim().toLowerCase();
  let list = getAllCatalogEntries();
  if (categoryId) list = list.filter((e) => e.category === categoryId);
  if (equipment) list = list.filter((e) => (e.equipment || '') === equipment);
  if (muscle) list = list.filter((e) => (e.primaryMuscles || []).includes(muscle));
  if (q) list = list.filter((e) => e.name.toLowerCase().includes(q));
  return list;
}

/** Søk i katalogen på navn. */
export function searchCatalog(query, { categoryId = null } = {}) {
  return filterCatalog({ categoryId, query });
}

/** Utstyr og muskelgrupper som finnes i katalogen (for filterchips). */
export function getCatalogFilterOptions() {
  const equipment = new Set();
  const muscles = new Set();
  for (const entry of getAllCatalogEntries()) {
    equipment.add(entry.equipment || '');
    for (const muscle of entry.primaryMuscles || []) muscles.add(muscle);
  }
  return {
    equipment: [...equipment].sort((a, b) => equipmentLabel(a).localeCompare(equipmentLabel(b), 'no')),
    muscles: [...muscles].sort((a, b) => muscleLabel(a).localeCompare(muscleLabel(b), 'no')),
  };
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
