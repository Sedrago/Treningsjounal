/**
 * legacy-exercises.js – norske standardøvelser fra gammel seed (før katalog/startpakke).
 *
 * Kjennetegn: id og catalogId starter med «def-», finnes ikke i ovelsesinnhold.json.
 */

/** @type {ReadonlyArray<{ id: string, name: string, category: string }>} */
export const LEGACY_DEFAULT_EXERCISES = [
  { id: 'def-hp-benk', name: 'Benkpress', category: 'horisontal-push' },
  { id: 'def-hp-man', name: 'Manualpress', category: 'horisontal-push' },
  { id: 'def-hp-skra', name: 'Skrå benk', category: 'horisontal-push' },
  { id: 'def-hp-push', name: 'Push-ups', category: 'horisontal-push' },
  { id: 'def-hp-dips', name: 'Dips', category: 'horisontal-push' },
  { id: 'def-hpl-row', name: 'Stangroing', category: 'horisontal-pull' },
  { id: 'def-hpl-1arm', name: 'En-arms row', category: 'horisontal-pull' },
  { id: 'def-hpl-face', name: 'Face pulls', category: 'horisontal-pull' },
  { id: 'def-hpl-kabel', name: 'Kabel roing', category: 'horisontal-pull' },
  { id: 'def-vp-mil', name: 'Militærpress', category: 'vertikal-push' },
  { id: 'def-vp-man', name: 'Manualpress skuldre', category: 'vertikal-push' },
  { id: 'def-vp-arnold', name: 'Arnold press', category: 'vertikal-push' },
  { id: 'def-vpl-pull', name: 'Pull-ups', category: 'vertikal-pull' },
  { id: 'def-vpl-chin', name: 'Chin-ups', category: 'vertikal-pull' },
  { id: 'def-vpl-lat', name: 'Lat pulldown', category: 'vertikal-pull' },
  { id: 'def-kb-kne', name: 'Knebøy', category: 'kneboy' },
  { id: 'def-kb-front', name: 'Front squats', category: 'kneboy' },
  { id: 'def-kb-bulgar', name: 'Bulgarsk split squat', category: 'kneboy' },
  { id: 'def-kb-bein', name: 'Beinpress', category: 'kneboy' },
  { id: 'def-hh-mark', name: 'Markløft', category: 'hoftehengsel' },
  { id: 'def-hh-rdl', name: 'Rumensk markløft', category: 'hoftehengsel' },
  { id: 'def-hh-hip', name: 'Hip thrust', category: 'hoftehengsel' },
  { id: 'def-hh-good', name: 'Good morning', category: 'hoftehengsel' },
  { id: 'def-core-plank', name: 'Plank', category: 'core' },
  { id: 'def-core-dead', name: 'Dead bug', category: 'core' },
  { id: 'def-core-pallof', name: 'Pallof press', category: 'core' },
  { id: 'def-core-crunch', name: 'Crunches', category: 'core' },
];

const LEGACY_IDS = new Set(LEGACY_DEFAULT_EXERCISES.map((e) => e.id));

export function isLegacyDefaultExercise(ex) {
  if (!ex || ex.deleted) return false;
  const id = String(ex.id || '');
  const catalogId = String(ex.catalogId || '');
  if (LEGACY_IDS.has(id) || LEGACY_IDS.has(catalogId)) return true;
  return id.startsWith('def-') || catalogId.startsWith('def-');
}
