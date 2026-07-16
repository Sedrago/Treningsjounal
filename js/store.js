/**
 * store.js – datalaget. All lesing og skriving av data går gjennom denne modulen.
 *
 * Skriv-operasjoner lagres umiddelbart lokalt (IndexedDB) og legges i synk-køen,
 * slik at appen fungerer helt uten nett. Slettinger er "myke" (deleted-flagg)
 * for å kunne synkroniseres trygt mot Google Sheets.
 */

import * as db from './db.js';
import { scheduleFlush } from './sync.js';
import { uuid, nowIso, todayStr, addDaysStr } from './utils.js';

/** Legger en operasjon i synk-køen og planlegger sending. */
async function queueOp(entity, op, data) {
  await db.enqueue({ entity, op, data });
  scheduleFlush();
}

/** De faste bevegelseskategoriene. */
export const KATEGORIER = [
  { id: 'horisontal-push', name: 'Horisontal push', icon: 'images/horisontal_push.jpg', priority: 1 },
  { id: 'horisontal-pull', name: 'Horisontal pull', icon: 'images/horisontal_pull.jpg', priority: 2 },
  { id: 'vertikal-push', name: 'Vertikal push', icon: 'images/vertikal_push.jpg', priority: 3 },
  { id: 'vertikal-pull', name: 'Vertikal pull', icon: 'images/vertikal_pull.jpg', priority: 4 },
  { id: 'kneboy', name: 'Knebøydominant', icon: 'images/squat.jpg', priority: 5 },
  { id: 'hoftehengsel', name: 'Hoftehengsel', icon: 'images/hinge.jpg', priority: 6 },
  { id: 'core', name: 'Core', icon: 'images/core.jpg', priority: 7 },
  { id: 'valgfri', name: 'Valgfri tilleggsøvelse', icon: 'images/valgfri.jpg', priority: 8 },
];

/** Ikon for aerob/utholdenhet (brukes på hjemskjermen). */
export const AEROB_ICON = 'images/utholdenhet.jpg';

export function categoryById(id) {
  return KATEGORIER.find((k) => k.id === id) || null;
}

/** Standardinnstillinger. */
export const DEFAULT_SETTINGS = {
  theme: 'dark',            // 'dark' | 'light' | 'auto'
  units: 'metric',          // 'metric' | 'imperial'
  restTimes: '90,120,180',  // sekunder, kommaseparert
  defaultWeightKg: 50,
  defaultReps: 8,
  defaultEffort: 3,         // effortPillOptions: 0 Fail, 1 1–2, 3 Mod, 5 Lett
  startPage: 'hjem',        // 'hjem' | 'styrke'
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

/** Subjektiv intensitet for aerob økt (1–5). */
export const AEROBIC_INTENSITY = [
  { value: 1, name: 'Veldig lett' },
  { value: 2, name: 'Lett' },
  { value: 3, name: 'Moderat' },
  { value: 4, name: 'Hard' },
  { value: 5, name: 'Veldig hard' },
];

export function aerobicIntensityLabel(value) {
  if (value == null || value === '') return null;
  return AEROBIC_INTENSITY.find((q) => q.value === Number(value))?.name || null;
}

/** Hvordan en øvelse logges: vekt, egenvekt eller varighet. */
export const LOG_MODES = [
  { id: 'weight', name: 'Vekt + reps' },
  { id: 'bodyweight', name: 'Egenvekt + reps' },
  { id: 'duration', name: 'Varighet' },
];

const LOG_MODE_IDS = new Set(LOG_MODES.map((m) => m.id));

/**
 * Retter øvelser der logMode havnet i deleted-feltet etter skjemaskift i Sheets.
 * (Egen øvelse opprettet etterpå, f.eks. Leggmaskin, er som regel allerede riktig.)
 */
export function repairExerciseFromSheet(ex) {
  if (!ex || !LOG_MODE_IDS.has(ex.deleted)) return ex;
  const ts = typeof ex.catalogId === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(ex.catalogId)
    ? ex.catalogId
    : null;
  return {
    ...ex,
    logMode: ex.deleted,
    deleted: ex.updatedAt === true,
    updatedAt: ts || (typeof ex.updatedAt === 'string' ? ex.updatedAt : ex.updatedAt),
    catalogId: (ex.catalogId && !ts ? ex.catalogId : null) || ex.id,
  };
}

export function logModeOf(exercise) {
  const ex = repairExerciseFromSheet(exercise);
  const mode = ex?.logMode || 'weight';
  return LOG_MODES.some((m) => m.id === mode) ? mode : 'weight';
}

/** Standardmål ved opprettelse av øvelse – tomme (ingen forhåndsdefinerte sett/reps). */
export function defaultGoals() {
  return { goalSets: null, goalRepsMin: null, goalRepsMax: null };
}

/** Utgangspunkter for logging fra innstillinger. */
export function logDefaults() {
  return {
    weightKg: Number(getSetting('defaultWeightKg')) || 50,
    reps: Number(getSetting('defaultReps')) || 8,
    effort: Number(getSetting('defaultEffort')) ?? 3,
  };
}

function goalNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function resolveGoalsForSave(ex, existing) {
  const explicit = {
    goalSets: goalNumber(ex.goalSets),
    goalRepsMin: goalNumber(ex.goalRepsMin),
    goalRepsMax: goalNumber(ex.goalRepsMax),
  };
  const hasExplicit = explicit.goalSets || explicit.goalRepsMin || explicit.goalRepsMax;
  if (hasExplicit) {
    return {
      goalSets: explicit.goalSets ?? existing?.goalSets ?? null,
      goalRepsMin: explicit.goalRepsMin ?? existing?.goalRepsMin ?? null,
      goalRepsMax: explicit.goalRepsMax ?? existing?.goalRepsMax ?? null,
    };
  }
  if (ex.applyDefaultGoals) return defaultGoals();
  if (existing) {
    return {
      goalSets: existing.goalSets ?? null,
      goalRepsMin: existing.goalRepsMin ?? null,
      goalRepsMax: existing.goalRepsMax ?? null,
    };
  }
  return { goalSets: null, goalRepsMin: null, goalRepsMax: null };
}

export function goalTextFor(exercise) {
  const mode = logModeOf(exercise);
  const sets = goalNumber(exercise?.goalSets);
  const min = goalNumber(exercise?.goalRepsMin);
  const max = goalNumber(exercise?.goalRepsMax);
  if (!sets || !min || !max) return '';
  if (mode === 'duration') return `${sets} × ${min}–${max} s`;
  return `${sets} × ${min}–${max}`;
}

/** Midtpunkt av reps-mål, ellers utgangspunkt fra innstillinger. */
export function repMidpoint(exercise) {
  const min = goalNumber(exercise?.goalRepsMin);
  const max = goalNumber(exercise?.goalRepsMax);
  if (min && max) return Math.round((min + max) / 2);
  if (min) return min;
  if (max) return max;
  return logDefaults().reps;
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
    .map(repairExerciseFromSheet)
    .filter((e) => !e.deleted && (includeInactive || e.active !== false))
    .sort((a, b) => a.name.localeCompare(b.name, 'no'));
}

export async function getExercisesByCategory(categoryId, opts) {
  const all = await getExercises(opts || {});
  return all.filter((e) => e.category === categoryId);
}

export function getExercise(id) {
  return db.get('exercises', id).then(repairExerciseFromSheet);
}

/** Lagrer en øvelse (ny eller endret). catalogId settes kun ved opprettelse eller migrering. */
export async function saveExercise(ex) {
  const existing = ex.id ? await db.get('exercises', ex.id) : null;
  const goals = resolveGoalsForSave(ex, existing);
  const record = {
    id: ex.id || uuid(),
    name: ex.name.trim(),
    category: ex.category,
    catalogId: ex.catalogId ?? existing?.catalogId ?? '',
    notes: ex.notes || '',
    video: ex.video || '',
    active: ex.active !== false,
    ...goals,
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

/** Map catalogId → brukerens øvelsespost (inkl. inaktive). */
export async function getUserExercisesByCatalogId() {
  const all = await db.getAll('exercises');
  const map = new Map();
  for (const ex of all) {
    if (ex.deleted) continue;
    const key = ex.catalogId || ex.id;
    if (key) map.set(key, repairExerciseFromSheet(ex));
  }
  return map;
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
    applyDefaultGoals: true,
  });
}

/** Fjerner katalogøvelse fra appen (historikk beholdes). */
export async function removeExerciseFromCatalog(catalogId) {
  const ex = await findExerciseByCatalogId(catalogId);
  if (ex && !ex.deleted) await deleteExercise(ex.id);
}

/** Legger inn startpakken (grunnleggende øvelser fra katalogen). */
export async function addStarterPack(entries) {
  let added = 0;
  for (const entry of entries) {
    const existing = await findExerciseByCatalogId(entry.id);
    if (existing && !existing.deleted) continue;
    await addExerciseFromCatalog(entry.id, entry);
    added++;
  }
  return added;
}

/** Antall startpakke-øvelser brukeren mangler. */
export async function countMissingStarterExercises(entries) {
  if (!entries?.length) return 0;
  const userMap = await getUserExercisesByCatalogId();
  return entries.filter((e) => !userMap.has(e.id)).length;
}

/**
 * Eksisterende bruker med øvelser men uten startpakke får den lagt inn én gang.
 * Nye brukere (tom liste) velger selv via knapp på Øvelser.
 */
export async function ensureStarterPackForExistingUser(entries) {
  if (!entries?.length) return 0;
  if (await db.getMeta('starterPackAutoApplied')) return 0;

  const all = await db.getAll('exercises');
  const hasAnyExercise = all.some((e) => !e.deleted);
  if (!hasAnyExercise) return 0;

  const userMap = await getUserExercisesByCatalogId();
  const hasAnyStarter = entries.some((e) => userMap.has(e.id));
  if (hasAnyStarter) {
    await db.setMeta('starterPackAutoApplied', '1');
    return 0;
  }

  const added = await addStarterPack(entries);
  if (added > 0) await db.setMeta('starterPackAutoApplied', '1');
  return added;
}

/* ---------- Økter ---------- */

export async function getWorkouts() {
  const all = await db.getAll('workouts');
  return all.filter((w) => !w.deleted).sort((a, b) => b.date.localeCompare(a.date));
}

export function getWorkout(id) {
  return db.get('workouts', id);
}

/** Finner økt for en gitt dato, eller null. */
export async function getWorkoutByDate(date) {
  const existing = (await db.getByIndex('workouts', 'date', date)).find((w) => !w.deleted);
  return existing || null;
}

/** Finner eller oppretter økt for en gitt dato. */
export async function getOrCreateWorkoutForDate(date, { retroactive = false } = {}) {
  const existing = await getWorkoutByDate(date);
  if (existing) return existing;
  const workout = {
    id: uuid(),
    date,
    startedAt: retroactive ? null : nowIso(),
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

/** Finner dagens økt, eller oppretter en ny. */
export async function getOrCreateTodayWorkout() {
  return getOrCreateWorkoutForDate(todayStr());
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
    intensity: entry.intensity === '' || entry.intensity == null ? null : Number(entry.intensity),
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

/* ---------- Planlagt økt ---------- */

/** Parser items-feltet (lagres som JSON-streng for Sheets-kompatibilitet). */
function parsePlanItems(plan) {
  if (!plan) return plan;
  let items = plan.items;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch { items = []; }
  }
  return { ...plan, items: Array.isArray(items) ? items : [] };
}

function planRecord(plan, existing = null) {
  const status = plan.status || 'planlagt';
  return {
    id: plan.id || uuid(),
    date: plan.date || todayStr(),
    name: plan.name ?? existing?.name ?? '',
    items: JSON.stringify(plan.items ?? (existing ? parsePlanItems(existing).items : [])),
    status,
    sourceTemplateId: plan.sourceTemplateId ?? existing?.sourceTemplateId ?? '',
    deleted: false,
    updatedAt: nowIso(),
  };
}

/** Én gangs migrering: aktiv → planlagt, dedupliser per dato. */
export async function migratePlanModelOnce() {
  if (await db.getMeta('planModelV2')) return;

  const all = await db.getAll('plans');
  const today = todayStr();

  for (const p of all) {
    if (p.deleted || p.status === 'mal' || p.status === 'fullfort') continue;
    if (p.status === 'aktiv') {
      const next = { ...p, status: 'planlagt', date: p.date || today, updatedAt: nowIso() };
      await db.put('plans', next);
      await queueOp('plan', 'upsert', next);
    }
  }

  const refreshed = await db.getAll('plans');
  const byDate = new Map();
  for (const p of refreshed) {
    if (p.deleted || p.status !== 'planlagt') continue;
    const prev = byDate.get(p.date);
    if (!prev || (p.updatedAt || '') > (prev.updatedAt || '')) byDate.set(p.date, p);
  }
  for (const p of refreshed) {
    if (p.deleted || p.status !== 'planlagt') continue;
    const keeper = byDate.get(p.date);
    if (keeper && keeper.id !== p.id) {
      p.deleted = true;
      p.updatedAt = nowIso();
      await db.put('plans', p);
      await queueOp('plan', 'upsert', p);
    }
  }

  await db.setMeta('planModelV2', '1');
}

/** Planlagt program for én dato (eller null). */
export async function getScheduledPlan(date) {
  await migratePlanModelOnce();
  const all = await db.getAll('plans');
  const matches = all
    .filter((p) => !p.deleted && p.status === 'planlagt' && p.date === date)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return matches.length ? parsePlanItems(matches[0]) : null;
}

/** Planlagte programmer i et datointervall (inklusive). */
export async function getScheduledPlans({ from, to }) {
  await migratePlanModelOnce();
  const all = await db.getAll('plans');
  return all
    .filter((p) => !p.deleted && p.status === 'planlagt' && p.date >= from && p.date <= to)
    .map(parsePlanItems)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Program for en dato – primært planlagt (default i dag). */
export async function getWorkoutPlanForDate(date = todayStr()) {
  const scheduled = await getScheduledPlan(date);
  if (scheduled) return scheduled;

  const all = await db.getAll('plans');
  const legacy = all
    .filter((p) => !p.deleted && p.status === 'aktiv' && p.date === date)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return legacy.length ? parsePlanItems(legacy[0]) : null;
}

/** @deprecated – bruk getWorkoutPlanForDate(todayStr()). */
export async function getActivePlan() {
  return getWorkoutPlanForDate(todayStr());
}

/** Dagens program på Styrketrening-siden. */
export async function getTodayWorkoutPlan() {
  return getWorkoutPlanForDate(todayStr());
}

/** Lagrer / oppdaterer planlagt program for en dato. Sletter posten hvis items er tom. */
export async function savePlanForDate(date, { items, name, id, sourceTemplateId } = {}) {
  const existing = id
    ? parsePlanItems(await db.get('plans', id))
    : await getScheduledPlan(date);

  if (items && !items.length) {
    if (existing?.id) await deletePlan(existing.id);
    return null;
  }

  if (existing?.id) {
    return savePlan({
      ...existing,
      items: items ?? existing.items,
      name: name ?? existing.name,
      sourceTemplateId: sourceTemplateId ?? existing.sourceTemplateId,
      date,
      status: 'planlagt',
    });
  }

  if (!items?.length) return null;

  return savePlan({
    id,
    items,
    name: name || '',
    date,
    status: 'planlagt',
    sourceTemplateId: sourceTemplateId || '',
  });
}

/** Lagrede programmaler (status mal). */
export async function getSavedTemplates() {
  await migratePlanModelOnce();
  const all = await db.getAll('plans');
  return all
    .filter((p) => !p.deleted && p.status === 'mal')
    .map(parsePlanItems)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '') || (a.name || '').localeCompare(b.name || '', 'no'));
}

/**
 * Lagrer plan/mal. items: [{exerciseId, goalSets}] i ønsket rekkefølge.
 * planlagt: maks én per dato. mal: bibliotek uten kalenderbinding.
 */
export async function savePlan(plan) {
  await migratePlanModelOnce();
  const status = plan.status || 'planlagt';
  const existing = plan.id ? await db.get('plans', plan.id) : null;
  const record = planRecord(plan, existing);

  if (status === 'planlagt') {
    const all = await db.getAll('plans');
    for (const p of all) {
      if (!p.deleted && p.status === 'planlagt' && p.date === record.date && p.id !== record.id) {
        p.deleted = true;
        p.updatedAt = nowIso();
        await db.put('plans', p);
        await queueOp('plan', 'upsert', p);
      }
    }
  }

  if (status === 'aktiv') {
    const all = await db.getAll('plans');
    for (const p of all) {
      if (!p.deleted && p.status === 'aktiv' && p.id !== record.id) {
        p.status = 'fullfort';
        p.updatedAt = nowIso();
        await db.put('plans', p);
        await queueOp('plan', 'upsert', p);
      }
    }
  }

  await db.put('plans', record);
  await queueOp('plan', 'upsert', record);
  return parsePlanItems(record);
}

/**
 * Lagrer nåværende øktliste som navngitt mal.
 * scheduleDate: valgfri kalenderdato for en planlagt kopi.
 */
export async function saveAsTemplate(name, items, { scheduleDate = null } = {}) {
  const template = await savePlan({
    name: name.trim(),
    items: items.map((it) => ({ ...it })),
    status: 'mal',
    date: todayStr(),
    sourceTemplateId: '',
  });
  if (scheduleDate) {
    await schedulePlanFromItems(scheduleDate, items, {
      name: name.trim(),
      sourceTemplateId: template.id,
    });
  }
  return template;
}

/** Oppretter eller erstatter planlagt program på dato fra øvelsesliste. */
export async function schedulePlanFromItems(date, items, { name = '', sourceTemplateId = '' } = {}) {
  return savePlanForDate(date, {
    items: items.map((it) => ({ ...it })),
    name,
    sourceTemplateId,
  });
}

/** Kopier mal inn i program for en dato (default i dag). */
export async function scheduleTemplate(templateId, date) {
  return loadTemplateIntoDate(templateId, date);
}

/** Flytt planlagt program til ny dato (erstatter evt. eksisterende plan der). */
export async function reschedulePlan(planId, newDate) {
  const raw = await db.get('plans', planId);
  if (!raw || raw.deleted || raw.status !== 'planlagt') return null;
  const plan = parsePlanItems(raw);
  const existing = await getScheduledPlan(newDate);
  if (existing && existing.id !== planId) await deletePlan(existing.id);
  return savePlan({ ...plan, date: newDate, status: 'planlagt' });
}

/** Kopier planlagte økter fra én uke til en annen (man–søn). */
export async function copyWeekPlans(sourceMonday, targetMonday) {
  let copied = 0;
  for (let i = 0; i < 7; i++) {
    const srcDate = addDaysStr(sourceMonday, i);
    const tgtDate = addDaysStr(targetMonday, i);
    const plan = await getScheduledPlan(srcDate);
    if (!plan?.items?.length) continue;
    await schedulePlanFromItems(tgtDate, plan.items, {
      name: plan.name,
      sourceTemplateId: plan.sourceTemplateId,
    });
    copied += 1;
  }
  return copied;
}

/** Kopier mal inn i program for en dato (default i dag). */
export async function loadTemplateIntoDate(templateId, date = todayStr()) {
  const raw = await db.get('plans', templateId);
  if (!raw || raw.deleted || raw.status !== 'mal') return null;
  const tpl = parsePlanItems(raw);
  return schedulePlanFromItems(date, tpl.items, {
    name: tpl.name || '',
    sourceTemplateId: templateId,
  });
}

/** @deprecated – bruk loadTemplateIntoDate. */
export async function loadTemplateIntoActive(templateId) {
  return loadTemplateIntoDate(templateId, todayStr());
}

/** Markerer planen som fullført (ved avsluttet økt). */
export async function completePlan(id) {
  const p = await db.get('plans', id);
  if (!p || p.deleted) return;
  p.status = 'fullfort';
  p.updatedAt = nowIso();
  await db.put('plans', p);
  await queueOp('plan', 'upsert', p);
}

/** Sletter (forkaster) planen. */
export async function deletePlan(id) {
  const p = await db.get('plans', id);
  if (!p) return;
  p.deleted = true;
  p.updatedAt = nowIso();
  await db.put('plans', p);
  await queueOp('plan', 'upsert', p);
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
  for (const s of ['exercises', 'workouts', 'sets', 'bodyweight', 'aerobic', 'sleep', 'mood', 'plans', 'settings', 'queue', 'meta']) {
    await db.clearStore(s);
  }
  Object.assign(settingsCache, DEFAULT_SETTINGS);
}
