/**
 * content.js – innholdspakke for øvelsesbeskrivelser (og senere bilder).
 *
 * Beskrivelser lever i data/ovelsesinnhold.json og oppdateres med app-versjonen.
 * Brukerdata (notater, mål osv.) lagres separat og røres ikke her.
 */

let pack = null;

/** Laster innholdspakken (kalles ved oppstart). */
export async function initContent() {
  if (pack) return;
  const res = await fetch('data/ovelsesinnhold.json');
  if (!res.ok) throw new Error('Kunne ikke laste øvelsesinnhold');
  pack = await res.json();
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
