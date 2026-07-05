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
