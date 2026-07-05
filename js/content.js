/**
 * content.js – innholdspakke for øvelsesbeskrivelser (og senere bilder).
 *
 * Beskrivelser lever i data/ovelsesinnhold.json og oppdateres med app-versjonen.
 * Brukerdata (notater, mål osv.) lagres separat og røres ikke her.
 */

const EXPECTED_VERSION = 3;

let pack = null;

/** Absolutt URL til innholdsfil, uavhengig av hash og import.meta. */
function contentJsonUrl() {
  let base = location.pathname;
  if (base.endsWith('.html')) {
    base = base.replace(/\/[^/]+$/, '/');
  } else if (!base.endsWith('/')) {
    base = `${base}/`;
  }
  const url = new URL(`${base}data/ovelsesinnhold.json`, location.origin);
  url.searchParams.set('v', String(EXPECTED_VERSION));
  return url.href;
}

/** Laster innholdspakken (kalles ved oppstart). Feiler stille – appen virker uten beskrivelser. */
export async function initContent() {
  if (pack?.version >= EXPECTED_VERSION) return true;
  pack = null;
  try {
    const res = await fetch(contentJsonUrl(), { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data?.entries || data.version < EXPECTED_VERSION) {
      throw new Error(`Ugyldig innholdspakke (v${data?.version ?? '?'})`);
    }
    pack = data;
    return true;
  } catch (err) {
    console.warn('Kunne ikke laste øvelsesinnhold:', err);
    return false;
  }
}

export function isContentLoaded() {
  return pack?.version >= EXPECTED_VERSION;
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

/** Alle katalogøvelser i én kategori, sortert på navn. */
export function getCatalogByCategory(categoryId) {
  if (!pack) return [];
  return Object.entries(pack.entries)
    .filter(([, raw]) => raw.category === categoryId)
    .map(([id, raw]) => entryToCatalog(id, raw))
    .sort((a, b) => a.name.localeCompare(b.name, 'no'));
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

/** Versjon av innholdspakken (for fremtidige migreringer). */
export function contentVersion() {
  return pack?.version ?? 0;
}
