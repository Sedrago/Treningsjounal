/**
 * store.js – datalaget. All lesing og skriving av data går gjennom denne modulen.
 *
 * Skriv-operasjoner lagres umiddelbart lokalt (IndexedDB) og legges i synk-køen,
 * slik at appen fungerer helt uten nett. Slettinger er "myke" (deleted-flagg)
 * for å kunne synkroniseres trygt mot Google Sheets.
 */

import * as db from './db.js';
import { scheduleFlush } from './sync.js';
import { uuid, nowIso, todayStr } from './utils.js';

/** Legger en operasjon i synk-køen og planlegger sending. */
async function queueOp(entity, op, data) {
  await db.enqueue({ entity, op, data });
  scheduleFlush();
}

/** De faste bevegelseskategoriene. */
export const KATEGORIER = [
  { id: 'horisontal-push', name: 'Horisontal push', icon: '💪', priority: 1 },
  { id: 'horisontal-pull', name: 'Horisontal pull', icon: '🚣', priority: 2 },
  { id: 'vertikal-push', name: 'Vertikal push', icon: '🙌', priority: 3 },
  { id: 'vertikal-pull', name: 'Vertikal pull', icon: '🧗', priority: 4 },
  { id: 'kneboy', name: 'Knebøydominant', icon: '🦵', priority: 5 },
  { id: 'hoftehengsel', name: 'Hoftehengsel', icon: '🏋️', priority: 6 },
  { id: 'core', name: 'Core', icon: '🧘', priority: 7 },
  { id: 'valgfri', name: 'Valgfri tilleggsøvelse', icon: '⭐', priority: 8 },
];

export function categoryById(id) {
  return KATEGORIER.find((k) => k.id === id) || null;
}

/** Standardøvelser som legges inn automatisk første gang (tom øvelsesliste). */
const DEFAULT_OVELSER = [
  // Horisontal push
  { id: 'def-hp-benk', name: 'Benkpress', category: 'horisontal-push' },
  { id: 'def-hp-man', name: 'Manualpress', category: 'horisontal-push' },
  { id: 'def-hp-skra', name: 'Skrå benk', category: 'horisontal-push' },
  { id: 'def-hp-push', name: 'Push-ups', category: 'horisontal-push' },
  { id: 'def-hp-dips', name: 'Dips', category: 'horisontal-push' },
  // Horisontal pull
  { id: 'def-hpl-row', name: 'Stangroing', category: 'horisontal-pull' },
  { id: 'def-hpl-1arm', name: 'En-arms row', category: 'horisontal-pull' },
  { id: 'def-hpl-face', name: 'Face pulls', category: 'horisontal-pull' },
  { id: 'def-hpl-kabel', name: 'Kabel roing', category: 'horisontal-pull' },
  // Vertikal push
  { id: 'def-vp-mil', name: 'Militærpress', category: 'vertikal-push' },
  { id: 'def-vp-man', name: 'Manualpress skuldre', category: 'vertikal-push' },
  { id: 'def-vp-arnold', name: 'Arnold press', category: 'vertikal-push' },
  // Vertikal pull
  { id: 'def-vpl-pull', name: 'Pull-ups', category: 'vertikal-pull' },
  { id: 'def-vpl-chin', name: 'Chin-ups', category: 'vertikal-pull' },
  { id: 'def-vpl-lat', name: 'Lat pulldown', category: 'vertikal-pull' },
  // Knebøydominant
  { id: 'def-kb-kne', name: 'Knebøy', category: 'kneboy' },
  { id: 'def-kb-front', name: 'Front squats', category: 'kneboy' },
  { id: 'def-kb-bulgar', name: 'Bulgarsk split squat', category: 'kneboy' },
  { id: 'def-kb-bein', name: 'Beinpress', category: 'kneboy' },
  // Hoftehengsel
  { id: 'def-hh-mark', name: 'Markløft', category: 'hoftehengsel' },
  { id: 'def-hh-rdl', name: 'Rumensk markløft', category: 'hoftehengsel' },
  { id: 'def-hh-hip', name: 'Hip thrust', category: 'hoftehengsel' },
  { id: 'def-hh-good', name: 'Good morning', category: 'hoftehengsel' },
  // Core
  { id: 'def-core-plank', name: 'Plank', category: 'core' },
  { id: 'def-core-dead', name: 'Dead bug', category: 'core' },
  { id: 'def-core-pallof', name: 'Pallof press', category: 'core' },
  { id: 'def-core-crunch', name: 'Crunches', category: 'core' },
];

/**
 * Legger inn standardøvelser hvis listen er tom.
 * Kalles ved oppstart og etter synk fra tom server.
 * @returns {boolean} true hvis øvelser ble lagt til
 */
export async function ensureDefaultExercises() {
  const existing = await db.getAll('exercises');
  if (existing.some((e) => !e.deleted)) return false;
  for (const tpl of DEFAULT_OVELSER) {
    await saveExercise({ ...tpl, catalogId: tpl.id, notes: '', video: '', active: true });
  }
  return true;
}

/**
 * Setter catalogId på standardøvelser som mangler det (engangsmigrering).
 * Beskrivelser hentes fra innholdspakken via catalogId – lagres ikke i brukerdata.
 */
export async function migrateExerciseCatalogIds() {
  if (await db.getMeta('catalogIdMigrated')) return false;
  const all = await db.getAll('exercises');
  let changed = false;
  for (const ex of all) {
    if (ex.deleted || ex.catalogId) continue;
    if (!ex.id.startsWith('def-')) continue;
    ex.catalogId = ex.id;
    ex.updatedAt = nowIso();
    await db.put('exercises', ex);
    await queueOp('exercise', 'upsert', ex);
    changed = true;
  }
  await db.setMeta('catalogIdMigrated', '1');
  return changed;
}

/** Standardinnstillinger. */
export const DEFAULT_SETTINGS = {
  theme: 'dark',            // 'dark' | 'light' | 'auto'
  units: 'metric',          // 'metric' | 'imperial'
  restTimes: '90,120,180',  // sekunder, kommaseparert
  defaultRir: 2,
  defaultSets: 3,
  defaultRepsMin: 8,
  defaultRepsMax: 10,
  startPage: 'hjem',        // 'hjem' | 'okt'
  streakMode: 'rolling7',   // 'rolling7' | 'calendar'
  workingSetRirMax: 4,      // sett med RIR ≤ dette telles som arbeidssett
};

/** Typer aerob aktivitet. */
export const AEROBIC_TYPES = [
  { id: 'run', name: 'Løping' },
  { id: 'bike', name: 'Sykkel' },
  { id: 'row', name: 'Roing' },
  { id: 'walk', name: 'Gåtur' },
  { id: 'other', name: 'Annet' },
];

export function aerobicTypeById(id) {
  return AEROBIC_TYPES.find((t) => t.id === id) || AEROBIC_TYPES[AEROBIC_TYPES.length - 1];
}

/** Hvordan en øvelse logges: vekt, egenvekt eller varighet. */
export const LOG_MODES = [
  { id: 'weight', name: 'Vekt + reps' },
  { id: 'bodyweight', name: 'Egenvekt + reps' },
  { id: 'duration', name: 'Varighet' },
];

export function logModeOf(exercise) {
  const mode = exercise?.logMode || 'weight';
  return LOG_MODES.some((m) => m.id === mode) ? mode : 'weight';
}

export function goalTextFor(exercise) {
  const mode = logModeOf(exercise);
  const sets = exercise.goalSets || 3;
  const min = exercise.goalRepsMin;
  const max = exercise.goalRepsMax;
  if (mode === 'duration') return `${sets} × ${min}–${max} s`;
  return `${sets} × ${min}–${max}`;
}

/* ---------- Innstillinger ---------- */

const settingsCache = {};

export async function initSettings() {
  const rows = await db.getAll('settings');
  Object.assign(settingsCache, DEFAULT_SETTINGS);
  rows.forEach((r) => { settingsCache[r.key] = r.value; });
}

export function getSetting(key) {
  return settingsCache[key] !== undefined ? settingsCache[key] : DEFAULT_SETTINGS[key];
}

export async function setSetting(key, value) {
  settingsCache[key] = value;
  await db.put('settings', { key, value });
  await queueOp('setting', 'upsert', { key, value: String(value) });
}

/* ---------- Øvelser ---------- */

export async function getExercises({ includeInactive = false } = {}) {
  const all = await db.getAll('exercises');
  return all
    .filter((e) => !e.deleted && (includeInactive || e.active !== false))
    .sort((a, b) => a.name.localeCompare(b.name, 'no'));
}

export async function getExercisesByCategory(categoryId, opts) {
  const all = await getExercises(opts || {});
  return all.filter((e) => e.category === categoryId);
}

export function getExercise(id) {
  return db.get('exercises', id);
}

/** Lagrer en øvelse (ny eller endret). catalogId settes kun ved opprettelse eller migrering. */
export async function saveExercise(ex) {
  const existing = ex.id ? await db.get('exercises', ex.id) : null;
  const record = {
    id: ex.id || uuid(),
    name: ex.name.trim(),
    category: ex.category,
    catalogId: ex.catalogId ?? existing?.catalogId ?? '',
    notes: ex.notes || '',
    video: ex.video || '',
    active: ex.active !== false,
    goalSets: Number(ex.goalSets) || Number(getSetting('defaultSets')),
    goalRepsMin: Number(ex.goalRepsMin) || Number(getSetting('defaultRepsMin')),
    goalRepsMax: Number(ex.goalRepsMax) || Number(getSetting('defaultRepsMax')),
    logMode: logModeOf(ex),
    deleted: false,
    updatedAt: nowIso(),
  };
  await db.put('exercises', record);
  await queueOp('exercise', 'upsert', record);
  return record;
}

export async function deleteExercise(id) {
  const ex = await db.get('exercises', id);
  if (!ex) return;
  ex.deleted = true;
  ex.updatedAt = nowIso();
  await db.put('exercises', ex);
  await queueOp('exercise', 'upsert', ex);
}

/** Finner øvelse koblet til en katalog-id (inkl. slettede). */
export async function findExerciseByCatalogId(catalogId) {
  const all = await db.getAll('exercises');
  return all.find((e) => e.catalogId === catalogId || e.id === catalogId) || null;
}

/** Sjekker om katalogøvelsen er aktiv i brukerens bibliotek. */
export async function isCatalogInApp(catalogId) {
  const ex = await findExerciseByCatalogId(catalogId);
  return Boolean(ex && !ex.deleted && ex.active !== false);
}

/** catalogId for alle øvelser som ikke er slettet. */
export async function getActiveCatalogIds() {
  const all = await db.getAll('exercises');
  return all
    .filter((e) => !e.deleted)
    .map((e) => e.catalogId || e.id)
    .filter(Boolean);
}

/** Legger katalogøvelse til i brukerens bibliotek. */
export async function addExerciseFromCatalog(catalogId, catalogEntry) {
  const existing = await findExerciseByCatalogId(catalogId);
  if (existing) {
    return saveExercise({
      ...existing,
      name: catalogEntry.name,
      category: catalogEntry.category,
      catalogId,
      deleted: false,
      active: true,
    });
  }
  return saveExercise({
    id: catalogId,
    catalogId,
    name: catalogEntry.name,
    category: catalogEntry.category,
    notes: '',
    video: '',
    active: true,
  });
}

/** Fjerner katalogøvelse fra appen (historikk beholdes). */
export async function removeExerciseFromCatalog(catalogId) {
  const ex = await findExerciseByCatalogId(catalogId);
  if (ex && !ex.deleted) await deleteExercise(ex.id);
}

/* ---------- Økter ---------- */

export async function getWorkouts() {
  const all = await db.getAll('workouts');
  return all.filter((w) => !w.deleted).sort((a, b) => b.date.localeCompare(a.date));
}

export function getWorkout(id) {
  return db.get('workouts', id);
}

/** Finner dagens økt, eller oppretter en ny. */
export async function getOrCreateTodayWorkout() {
  const today = todayStr();
  const existing = (await db.getByIndex('workouts', 'date', today)).find((w) => !w.deleted);
  if (existing) return existing;
  const workout = {
    id: uuid(),
    date: today,
    startedAt: nowIso(),
    duration: 0,
    bodyweight: null,
    notes: '',
    deleted: false,
    updatedAt: nowIso(),
  };
  await db.put('workouts', workout);
  await queueOp('workout', 'upsert', workout);
  return workout;
}

export async function saveWorkout(workout) {
  workout.updatedAt = nowIso();
  await db.put('workouts', workout);
  await queueOp('workout', 'upsert', workout);
  return workout;
}

export async function deleteWorkout(id) {
  const w = await db.get('workouts', id);
  if (!w) return;
  w.deleted = true;
  w.updatedAt = nowIso();
  await db.put('workouts', w);
  await queueOp('workout', 'upsert', w);
  // Slett tilhørende sett.
  const sets = await db.getByIndex('sets', 'workoutId', id);
  for (const s of sets) {
    if (!s.deleted) await deleteSet(s.id);
  }
}

/** Oppdaterer øktens varighet basert på tid siden start. */
export async function touchWorkoutDuration(workoutId) {
  const w = await db.get('workouts', workoutId);
  if (!w || !w.startedAt) return;
  const minutes = Math.max(1, Math.round((Date.now() - new Date(w.startedAt).getTime()) / 60000));
  // Ignorer urimelige verdier (glemt åpen økt over natten o.l.).
  if (minutes <= 240 && minutes !== w.duration) {
    w.duration = minutes;
    await saveWorkout(w);
  }
}

/* ---------- Sett ---------- */

export async function getAllSets() {
  const all = await db.getAll('sets');
  return all.filter((s) => !s.deleted);
}

export async function getSetsForWorkout(workoutId) {
  const all = await db.getByIndex('sets', 'workoutId', workoutId);
  return all.filter((s) => !s.deleted).sort((a, b) => a.setNumber - b.setNumber);
}

export async function getSetsForExercise(exerciseId) {
  const all = await db.getByIndex('sets', 'exerciseId', exerciseId);
  return all.filter((s) => !s.deleted);
}

export async function saveSet(set) {
  const record = {
    id: set.id || uuid(),
    workoutId: set.workoutId,
    exerciseId: set.exerciseId,
    setNumber: Number(set.setNumber) || 1,
    weight: set.weight === '' || set.weight == null ? null : Number(set.weight),
    reps: set.reps === '' || set.reps == null ? null : Number(set.reps),
    rir: set.rir === '' || set.rir == null ? null : Number(set.rir),
    durationSec: set.durationSec === '' || set.durationSec == null ? null : Number(set.durationSec),
    rest: set.rest == null ? null : Number(set.rest),
    comment: set.comment || '',
    deleted: false,
    updatedAt: nowIso(),
  };
  await db.put('sets', record);
  await queueOp('set', 'upsert', record);
  return record;
}

export async function deleteSet(id) {
  const s = await db.get('sets', id);
  if (!s) return;
  s.deleted = true;
  s.updatedAt = nowIso();
  await db.put('sets', s);
  await queueOp('set', 'upsert', s);
}

/* ---------- Kroppsvekt ---------- */

export async function getBodyweights() {
  const all = await db.getAll('bodyweight');
  return all.filter((b) => !b.deleted).sort((a, b) => b.date.localeCompare(a.date));
}

export async function saveBodyweight(bw) {
  const record = {
    id: bw.id || uuid(),
    date: bw.date || todayStr(),
    weight: Number(bw.weight),
    fatPct: bw.fatPct === '' || bw.fatPct == null ? null : Number(bw.fatPct),
    comment: bw.comment || '',
    deleted: false,
    updatedAt: nowIso(),
  };
  await db.put('bodyweight', record);
  await queueOp('bodyweight', 'upsert', record);
  return record;
}

export async function deleteBodyweight(id) {
  const b = await db.get('bodyweight', id);
  if (!b) return;
  b.deleted = true;
  b.updatedAt = nowIso();
  await db.put('bodyweight', b);
  await queueOp('bodyweight', 'upsert', b);
}

/* ---------- Aerob trening ---------- */

export async function getAerobicSessions() {
  const all = await db.getAll('aerobic');
  return all.filter((a) => !a.deleted).sort((a, b) => b.date.localeCompare(a.date));
}

export async function saveAerobicSession(entry) {
  const record = {
    id: entry.id || uuid(),
    date: entry.date || todayStr(),
    minutes: Math.max(1, Number(entry.minutes) || 0),
    activity: entry.activity || 'other',
    comment: entry.comment || '',
    deleted: false,
    updatedAt: nowIso(),
  };
  await db.put('aerobic', record);
  await queueOp('aerobic', 'upsert', record);
  return record;
}

export async function deleteAerobicSession(id) {
  const row = await db.get('aerobic', id);
  if (!row) return;
  row.deleted = true;
  row.updatedAt = nowIso();
  await db.put('aerobic', row);
  await queueOp('aerobic', 'upsert', row);
}

/* ---------- Søvn ---------- */

/** Valgfri kvalitetsskala 1–5. */
export const SLEEP_QUALITY = [
  { value: 1, name: 'Dårlig' },
  { value: 2, name: 'Litt dårlig' },
  { value: 3, name: 'OK' },
  { value: 4, name: 'Bra' },
  { value: 5, name: 'Utmerket' },
];

export function sleepQualityLabel(value) {
  if (value == null || value === '') return null;
  return SLEEP_QUALITY.find((q) => q.value === Number(value))?.name || null;
}

export async function getSleepEntries() {
  const all = await db.getAll('sleep');
  return all.filter((s) => !s.deleted).sort((a, b) => b.date.localeCompare(a.date));
}

export async function saveSleepEntry(entry) {
  const record = {
    id: entry.id || uuid(),
    date: entry.date || todayStr(),
    hours: Math.min(24, Math.max(0, Number(entry.hours) || 0)),
    quality: entry.quality === '' || entry.quality == null ? null : Number(entry.quality),
    comment: entry.comment || '',
    deleted: false,
    updatedAt: nowIso(),
  };
  await db.put('sleep', record);
  await queueOp('sleep', 'upsert', record);
  return record;
}

export async function deleteSleepEntry(id) {
  const row = await db.get('sleep', id);
  if (!row) return;
  row.deleted = true;
  row.updatedAt = nowIso();
  await db.put('sleep', row);
  await queueOp('sleep', 'upsert', row);
}

/* ---------- Dagsform (humør) ---------- */

export async function getMoodEntries() {
  const all = await db.getAll('mood');
  return all
    .filter((m) => !m.deleted)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function saveMoodEntry(entry) {
  const record = {
    id: entry.id || uuid(),
    date: entry.date || todayStr(),
    value: Math.min(100, Math.max(0, Math.round(Number(entry.value) || 0))),
    context: entry.context || 'app',
    workoutId: entry.workoutId || null,
    deleted: false,
    updatedAt: nowIso(),
  };
  await db.put('mood', record);
  await queueOp('mood', 'upsert', record);
  return record;
}

export async function deleteMoodEntry(id) {
  const row = await db.get('mood', id);
  if (!row) return;
  row.deleted = true;
  row.updatedAt = nowIso();
  await db.put('mood', row);
  await queueOp('mood', 'upsert', row);
}

/* ---------- Sammensatte spørringer ---------- */

/**
 * Bygger et komplett bilde av treningshistorikken:
 * hvert sett beriket med dato, øvelsesnavn og kategori. Brukes av
 * statistikk, assistent og historikk.
 */
export async function getEnrichedSets() {
  const [sets, workouts, exercises] = await Promise.all([
    getAllSets(), getWorkouts(), getExercises({ includeInactive: true }),
  ]);
  const woMap = new Map(workouts.map((w) => [w.id, w]));
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  return sets
    .filter((s) => woMap.has(s.workoutId) && exMap.has(s.exerciseId))
    .map((s) => {
      const w = woMap.get(s.workoutId);
      const e = exMap.get(s.exerciseId);
      return { ...s, date: w.date, exerciseName: e.name, category: e.category, logMode: logModeOf(e) };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.setNumber - b.setNumber);
}

/**
 * Siste økt (dato) der en gitt øvelse ble logget, med settene.
 * @returns {{date:string, sets:object[]}|null}
 */
export async function getLastSessionForExercise(exerciseId, beforeDate = null) {
  const sets = await getSetsForExercise(exerciseId);
  if (!sets.length) return null;
  const workouts = await getWorkouts();
  const woMap = new Map(workouts.map((w) => [w.id, w]));
  const byDate = new Map();
  for (const s of sets) {
    const w = woMap.get(s.workoutId);
    if (!w) continue;
    if (beforeDate && w.date >= beforeDate) continue;
    if (!byDate.has(w.date)) byDate.set(w.date, []);
    byDate.get(w.date).push(s);
  }
  if (!byDate.size) return null;
  const lastDate = [...byDate.keys()].sort().pop();
  const daySets = byDate.get(lastDate).sort((a, b) => a.setNumber - b.setNumber);
  return { date: lastDate, sets: daySets };
}

/** Sletter alle lokale data (brukes fra innstillinger). */
export async function wipeLocalData() {
  for (const s of ['exercises', 'workouts', 'sets', 'bodyweight', 'aerobic', 'sleep', 'mood', 'settings', 'queue', 'meta']) {
    await db.clearStore(s);
  }
  Object.assign(settingsCache, DEFAULT_SETTINGS);
}
