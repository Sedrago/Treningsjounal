/**
 * stats.js – alle statistikkberegninger. Rene funksjoner som opererer på
 * "berikede sett" fra store.getEnrichedSets() (sett med dato, øvelsesnavn
 * og kategori).
 */

import { epley1RM, isoWeekKey, parseDate, startOfWeek, todayStr, windowStartStr, daysAgoStr } from './utils.js';

/** Volum for ett sett (kg × reps). */
export function setVolume(s) {
  return (s.weight || 0) * (s.reps || 0);
}

/** Summerer volum for en liste sett. */
export function totalVolume(sets) {
  return sets.reduce((sum, s) => sum + setVolume(s), 0);
}

/** Unike treningsdatoer, sortert stigende. */
export function workoutDates(sets) {
  return [...new Set(sets.map((s) => s.date))].sort();
}

/**
 * Ukestreak: antall sammenhengende uker med minst én økt,
 * regnet bakover fra inneværende uke (inneværende uke teller
 * selv om den ennå ikke har økt, så streaken ikke "brytes" midt i uken).
 */
export function weekStreak(sets) {
  const weeks = new Set(sets.map((s) => isoWeekKey(parseDate(s.date))));
  if (!weeks.size) return 0;
  let streak = 0;
  const cursor = startOfWeek(new Date());
  // Inneværende uke teller hvis trent; hvis ikke, hopp til forrige uke.
  if (!weeks.has(isoWeekKey(cursor))) cursor.setDate(cursor.getDate() - 7);
  while (weeks.has(isoWeekKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}

/**
 * Streak i rullerende 7-dagersperioder: minst én treningsdag per periode,
 * regnet bakover fra i dag.
 */
export function rollingWeekStreak(sets) {
  const dateSet = new Set(workoutDates(sets));
  if (!dateSet.size) return 0;
  let streak = 0;
  let endOffset = 0;
  while (true) {
    let found = false;
    for (let i = 0; i < 7; i++) {
      if (dateSet.has(daysAgoStr(endOffset + i))) {
        found = true;
        break;
      }
    }
    if (!found) break;
    streak += 1;
    endOffset += 7;
  }
  return streak;
}

/** Streak etter valgt modus: 'rolling7' | 'calendar'. */
export function trainingStreak(sets, mode = 'rolling7') {
  return mode === 'calendar' ? weekStreak(sets) : rollingWeekStreak(sets);
}

/** Sett som telles som arbeidssett (RIR registrert og ≤ grense). */
export function isWorkingSet(set, maxRir = 4) {
  if (set.rir == null || set.rir === '') return false;
  return Number(set.rir) <= Number(maxRir);
}

/** Antall arbeidssett i en liste. */
export function countWorkingSets(sets, maxRir = 4) {
  return sets.filter((s) => isWorkingSet(s, maxRir)).length;
}

/** Antall unike treningsdager i inneværende kalenderuke. */
export function daysThisWeek(sets) {
  const monday = startOfWeek(new Date());
  const mondayStr = todayStr(monday);
  return new Set(sets.filter((s) => s.date >= mondayStr).map((s) => s.date)).size;
}

/** Antall unike treningsdager siste 7 dager (inkl. i dag). */
export function daysLast7Days(sets) {
  const since = windowStartStr(7);
  return new Set(sets.filter((s) => s.date >= since).map((s) => s.date)).size;
}

/** Summer minutter fra aerob-aktiviteter siden gitt dato. */
export function aerobicMinutesSince(rows, sinceDate) {
  return rows
    .filter((r) => r.date >= sinceDate)
    .reduce((sum, r) => sum + (Number(r.minutes) || 0), 0);
}

/** Beste estimerte 1RM for en øvelses sett. */
export function best1RM(sets) {
  return sets.reduce((best, s) => Math.max(best, epley1RM(s.weight, s.reps)), 0);
}

/** Personlig rekord: settet med høyest vekt (flest reps som tiebreak). */
export function personalRecord(sets) {
  let pr = null;
  for (const s of sets) {
    if (!s.weight) continue;
    if (!pr || s.weight > pr.weight || (s.weight === pr.weight && (s.reps || 0) > (pr.reps || 0))) {
      pr = s;
    }
  }
  return pr;
}

/** Beste volum i én enkelt økt for en øvelse. */
export function bestSessionVolume(sets) {
  const byDate = groupBy(sets, (s) => s.date);
  let best = { date: null, volume: 0 };
  for (const [date, daySets] of byDate) {
    const vol = totalVolume(daySets);
    if (vol > best.volume) best = { date, volume: vol };
  }
  return best;
}

/** Grupperer til Map. */
export function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

/** Volum per ISO-uke: [{week, volume}] sortert stigende. */
export function volumePerWeek(sets, numWeeks = 12) {
  const result = [];
  const cursor = startOfWeek(new Date());
  cursor.setDate(cursor.getDate() - 7 * (numWeeks - 1));
  const byWeek = groupBy(sets, (s) => isoWeekKey(parseDate(s.date)));
  for (let i = 0; i < numWeeks; i++) {
    const key = isoWeekKey(cursor);
    result.push({ week: key, label: key.split('-W')[1], volume: totalVolume(byWeek.get(key) || []) });
    cursor.setDate(cursor.getDate() + 7);
  }
  return result;
}

/** Antall økter per ISO-uke. */
export function frequencyPerWeek(sets, numWeeks = 12) {
  const result = [];
  const cursor = startOfWeek(new Date());
  cursor.setDate(cursor.getDate() - 7 * (numWeeks - 1));
  const byWeek = groupBy(sets, (s) => isoWeekKey(parseDate(s.date)));
  for (let i = 0; i < numWeeks; i++) {
    const key = isoWeekKey(cursor);
    const weekSets = byWeek.get(key) || [];
    result.push({ week: key, label: key.split('-W')[1], count: new Set(weekSets.map((s) => s.date)).size });
    cursor.setDate(cursor.getDate() + 7);
  }
  return result;
}

/** Estimert 1RM per økt for én øvelse: [{date, oneRM}]. */
export function oneRMHistory(exerciseSets) {
  const byDate = groupBy(exerciseSets, (s) => s.date);
  return [...byDate.entries()]
    .map(([date, sets]) => ({ date, oneRM: best1RM(sets) }))
    .filter((p) => p.oneRM > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Gjennomsnittlig RIR for sett som har RIR registrert. */
export function avgRir(sets) {
  const withRir = sets.filter((s) => s.rir != null && s.rir !== '');
  if (!withRir.length) return null;
  return withRir.reduce((sum, s) => sum + Number(s.rir), 0) / withRir.length;
}

/** Antall økter per kategori: Map(categoryId → antall unike datoer). */
export function sessionsPerCategory(sets) {
  const map = new Map();
  const byCat = groupBy(sets, (s) => s.category);
  for (const [cat, catSets] of byCat) {
    map.set(cat, new Set(catSets.map((s) => s.date)).size);
  }
  return map;
}

/** Favorittøvelser: øvelser sortert etter antall økter de inngår i. */
export function favoriteExercises(sets, limit = 5) {
  const byEx = groupBy(sets, (s) => s.exerciseId);
  return [...byEx.entries()]
    .map(([id, exSets]) => ({
      exerciseId: id,
      name: exSets[0].exerciseName,
      sessions: new Set(exSets.map((s) => s.date)).size,
    }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, limit);
}

/**
 * Heatmap-data: Map('YYYY-MM-DD' → volum) for de siste `days` dagene.
 */
export function heatmapData(sets, days = 182) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = todayStr(cutoff);
  const map = new Map();
  for (const s of sets) {
    if (s.date < cutoffStr) continue;
    map.set(s.date, (map.get(s.date) || 0) + setVolume(s));
  }
  return map;
}

/** Volumendring i prosent: siste 30 dager mot de 30 før. Null hvis for lite data. */
export function volumeTrend30(sets) {
  const now = new Date();
  const d30 = new Date(now); d30.setDate(d30.getDate() - 30);
  const d60 = new Date(now); d60.setDate(d60.getDate() - 60);
  const s30 = todayStr(d30);
  const s60 = todayStr(d60);
  const recent = totalVolume(sets.filter((s) => s.date >= s30));
  const previous = totalVolume(sets.filter((s) => s.date >= s60 && s.date < s30));
  if (previous <= 0 || recent <= 0) return null;
  return ((recent - previous) / previous) * 100;
}

/** Antall dager siden en kategori sist ble trent. Null hvis aldri. */
export function daysSinceCategory(sets, categoryId) {
  const catSets = sets.filter((s) => s.category === categoryId);
  if (!catSets.length) return null;
  const last = catSets.reduce((max, s) => (s.date > max ? s.date : max), '0000');
  return Math.round((parseDate(todayStr()) - parseDate(last)) / 86400000);
}
