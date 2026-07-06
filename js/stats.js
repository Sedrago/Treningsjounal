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

/** Oppsummert søvn siden gitt dato. */
export function sleepSummarySince(rows, sinceDate) {
  const recent = rows.filter((r) => r.date >= sinceDate);
  if (!recent.length) return null;
  const avgHours = recent.reduce((sum, r) => sum + (Number(r.hours) || 0), 0) / recent.length;
  const withQuality = recent.filter((r) => r.quality != null && r.quality !== '');
  const avgQuality = withQuality.length
    ? withQuality.reduce((sum, r) => sum + Number(r.quality), 0) / withQuality.length
    : null;
  return {
    nights: recent.length,
    avgHours: Math.round(avgHours * 10) / 10,
    avgQuality: avgQuality != null ? Math.round(avgQuality * 10) / 10 : null,
  };
}

/** Gjennomsnittlig søvntimer per ISO-uke (siste `numWeeks`). */
export function sleepHoursPerWeek(rows, numWeeks = 12) {
  const result = [];
  const cursor = startOfWeek(new Date());
  cursor.setDate(cursor.getDate() - 7 * (numWeeks - 1));
  const byWeek = groupBy(rows, (r) => isoWeekKey(parseDate(r.date)));
  for (let i = 0; i < numWeeks; i++) {
    const key = isoWeekKey(cursor);
    const weekRows = byWeek.get(key) || [];
    const avg = weekRows.length
      ? weekRows.reduce((s, r) => s + (Number(r.hours) || 0), 0) / weekRows.length
      : null;
    result.push({
      week: key,
      label: key.split('-W')[1],
      value: avg != null ? Math.round(avg * 10) / 10 : null,
    });
    cursor.setDate(cursor.getDate() + 7);
  }
  return result;
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

/* ---------- Saldo (mengde, intensitet, styrke) ---------- */

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** ISO-uker siste `numWeeks`, stigende. */
function recentWeeks(numWeeks) {
  const result = [];
  const cursor = startOfWeek(new Date());
  cursor.setDate(cursor.getDate() - 7 * (numWeeks - 1));
  for (let i = 0; i < numWeeks; i++) {
    const week = isoWeekKey(cursor);
    result.push({ week, label: week.split('-W')[1], index: i });
    cursor.setDate(cursor.getDate() + 7);
  }
  return result;
}

/** Normaliserer uke-serie til saldo der 100 = median av inntil 8 foregående uker. */
function toSaldoIndex(values) {
  return values.map((v, i) => {
    if (v == null) return null;
    const priors = values.slice(Math.max(0, i - 8), i).filter((x) => x != null);
    if (!priors.length) return 100;
    const base = median(priors);
    if (!base) return 100;
    return Math.round((v / base) * 1000) / 10;
  });
}

/** Mengdedose for én uke (arbeidssett + treningsdager + aerob). */
function weekVolumeDose(weekSets, weekAerob, maxRir) {
  const days = new Set(weekSets.map((s) => s.date)).size;
  const aerMin = weekAerob.reduce((sum, r) => sum + (Number(r.minutes) || 0), 0);
  if (!weekSets.length && !aerMin) return null;
  const ws = countWorkingSets(weekSets, maxRir);
  return ws + days * 3 + Math.round(aerMin / 5);
}

/** Innsats-score for arbeidssett (høyere = hardere). */
function weekIntensityScore(weekSets, maxRir) {
  const working = weekSets.filter((s) => isWorkingSet(s, maxRir) && s.rir != null);
  if (!working.length) return null;
  const avg = avgRir(working);
  return avg == null ? null : 10 - avg;
}

/**
 * Bygger best e1RM per øvelse per uke-indeks.
 * @returns {Map<string, Map<number, number>>}
 */
function exerciseE1rmByWeekIndex(enrichedSets, weeks) {
  const weekIndex = new Map(weeks.map((w) => [w.week, w.index]));
  const byEx = new Map();
  for (const s of enrichedSets) {
    if (!s.weight || !s.reps) continue;
    const idx = weekIndex.get(isoWeekKey(parseDate(s.date)));
    if (idx == null) continue;
    const rm = epley1RM(s.weight, s.reps);
    if (!rm) continue;
    if (!byEx.has(s.exerciseId)) byEx.set(s.exerciseId, new Map());
    const wm = byEx.get(s.exerciseId);
    wm.set(idx, Math.max(wm.get(idx) || 0, rm));
  }
  return byEx;
}

/** Aggregert styrkeforhold for uke: median(e1RM / egen baseline) per øvelse. */
function weekStrengthRatio(weekIndex, exByWeekIdx) {
  const ratios = [];
  for (const idxMap of exByWeekIdx.values()) {
    const current = idxMap.get(weekIndex);
    if (!current) continue;
    const priors = [];
    for (let j = 0; j < weekIndex; j++) {
      if (idxMap.has(j)) priors.push(idxMap.get(j));
    }
    if (!priors.length) continue;
    const baseline = median(priors.slice(-8));
    if (baseline > 0) ratios.push(current / baseline);
  }
  return ratios.length ? median(ratios) : null;
}

/**
 * Ukentlig saldo for mengde, intensitet og styrke.
 * 100 = ditt vanlige nivå (median av inntil 8 foregående uker med data).
 *
 * @returns {{ weeks: Array, latest: { volume, intensity, strength, strengthExercises }|null }}
 */
export function saldoHistory(enrichedSets, aerobicRows, { maxRir = 4, numWeeks = 12 } = {}) {
  const weeks = recentWeeks(numWeeks);
  const setsByWeek = groupBy(enrichedSets, (s) => isoWeekKey(parseDate(s.date)));
  const aerobByWeek = groupBy(aerobicRows || [], (r) => isoWeekKey(parseDate(r.date)));
  const exByWeekIdx = exerciseE1rmByWeekIndex(enrichedSets, weeks);

  const rawVolume = [];
  const rawIntensity = [];
  const rawStrength = [];
  const strengthCounts = [];

  for (const { week, index } of weeks) {
    const weekSets = setsByWeek.get(week) || [];
    const weekAerob = aerobByWeek.get(week) || [];
    rawVolume.push(weekVolumeDose(weekSets, weekAerob, maxRir));
    rawIntensity.push(weekIntensityScore(weekSets, maxRir));
    const ratio = weekStrengthRatio(index, exByWeekIdx);
    rawStrength.push(ratio);
    strengthCounts.push(ratio != null ? countStrengthExercises(index, exByWeekIdx) : 0);
  }

  const volumeIdx = toSaldoIndex(rawVolume);
  const intensityIdx = toSaldoIndex(rawIntensity);
  const strengthIdx = rawStrength.map((r) => (r == null ? null : Math.round(r * 1000) / 10));

  const result = weeks.map((w, i) => ({
    week: w.week,
    label: w.label,
    volume: volumeIdx[i],
    intensity: intensityIdx[i],
    strength: strengthIdx[i],
    strengthExercises: strengthCounts[i],
  }));

  let latest = null;
  for (let i = result.length - 1; i >= 0; i--) {
    const r = result[i];
    if (r.volume != null || r.intensity != null || r.strength != null) {
      latest = r;
      break;
    }
  }

  return { weeks: result, latest };
}

function countStrengthExercises(weekIndex, exByWeekIdx) {
  let n = 0;
  for (const idxMap of exByWeekIdx.values()) {
    if (!idxMap.has(weekIndex)) continue;
    let hasPrior = false;
    for (let j = 0; j < weekIndex; j++) {
      if (idxMap.has(j)) { hasPrior = true; break; }
    }
    if (hasPrior) n += 1;
  }
  return n;
}

/** Heatmap: antall arbeidssett per dag (mengde, ikke kg). */
export function heatmapActivityData(sets, maxRir = 4, days = 182) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = todayStr(cutoff);
  const map = new Map();
  for (const s of sets) {
    if (s.date < cutoffStr) continue;
    if (!isWorkingSet(s, maxRir) && s.reps == null) continue;
    const add = isWorkingSet(s, maxRir) ? 1 : 0.3;
    map.set(s.date, (map.get(s.date) || 0) + add);
  }
  return map;
}
