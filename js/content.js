/**
 * content.js – innholdspakke for øvelsesbeskrivelser (og senere bilder).
 *
 * Beskrivelser lever i data/ovelsesinnhold.json og oppdateres med app-versjonen.
 * Brukerdata (notater, mål osv.) lagres separat og røres ikke her.
 */

let pack = null;

/** Laster innholdspakken (kalles ved oppstart). Feiler stille – appen virker uten beskrivelser. */
export async function initContent() {
  if (pack) return true;
  try {
    const url = new URL('../data/ovelsesinnhold.json', import.meta.url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    pack = await res.json();
    return true;
  } catch (err) {
    console.warn('Kunne ikke laste øvelsesinnhold:', err);
    return false;
  }
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
