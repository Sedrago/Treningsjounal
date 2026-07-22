/**
 * momentum.js – momentum-score: glidende bilde av treningsperiode (0–100).
 * Styrke: rullerende 7 dager per kategori — frekvens 75/92/100 % ved 1–3 dager, ~3 dager mellom er optimalt.
 */

import { KATEGORIER, nutritionGoalG, sleepGoalHours } from './store.js';
import { addDaysStr, daysAgoStr, daysBetween, todayStr } from './utils.js';

export const MOMENTUM_WINDOW = 21;
export const MOMENTUM_DECAY_TAU = 7;

/** Andeler av dagscore (sum = 1). */
export const PILLAR_WEIGHTS = {
  strength: 0.52,
  protein: 0.18,
  sleep: 0.15,
  aerobic: 0.10,
  lactate: 0.05,
};

const MAIN_CATEGORIES = KATEGORIER.filter((k) => k.id !== 'valgfri');

const STRENGTH_WEEK_DAYS = 7;

/** Antall ganger kategorien er trent (distinkte dager) i vinduet som slutter på date. */
function trainingDatesForCategoryInWindow(sets, categoryId, endDate, windowDays = STRENGTH_WEEK_DAYS) {
  const start = addDaysStr(endDate, -(windowDays - 1));
  const dates = new Set();
  for (const s of sets) {
    if (s.category !== categoryId || s.date < start || s.date > endDate) continue;
    dates.add(s.date);
  }
  return [...dates].sort();
}

/** Optimalt ~3 dager mellom to økter; straff for for tett (1–2 dager). */
function spacingQuality(sortedDates) {
  if (sortedDates.length < 2) return 1;
  let total = 0;
  for (let i = 1; i < sortedDates.length; i++) {
    const gap = daysBetween(sortedDates[i - 1], sortedDates[i]);
    if (gap <= 1) total += 0.25;
    else if (gap === 2) total += 0.75;
    else if (gap === 3 || gap === 4) total += 1;
    else total += Math.max(0.55, 1 - (gap - 4) * 0.08);
  }
  return total / (sortedDates.length - 1);
}

/** Frekvens per kategori (distinkte dager / 7): 1 → 75 %, 2 → 92 %, 3+ → 100 % (ingen ekstra over 3). */
function frequencyQuality(sessionDays) {
  if (sessionDays === 0) return 0;
  if (sessionDays === 1) return 0.75;
  if (sessionDays === 2) return 0.92;
  return 1;
}

function categoryStrengthScoreRolling(categoryId, date, sets) {
  const dates = trainingDatesForCategoryInWindow(sets, categoryId, date);
  if (!dates.length) return 0;
  return frequencyQuality(dates.length) * spacingQuality(dates);
}

/**
 * Styrke-pilar (0–1): snitt over hovedkategorier ut fra siste 7 dager —
 * 3 treningsdager per kategori (siste 7) og ~3 dager mellom gir høyest score.
 */
function strengthDaily(date, sets) {
  if (!MAIN_CATEGORIES.length) return 0;
  let sum = 0;
  for (const cat of MAIN_CATEGORIES) {
    sum += categoryStrengthScoreRolling(cat.id, date, sets);
  }
  return sum / MAIN_CATEGORIES.length;
}

function proteinDaily(date, proteinByDate, goalG) {
  if (!goalG) return 0;
  const g = proteinByDate.get(date) || 0;
  return Math.min(1, g / goalG);
}

function sleepDaily(date, sleepByDate, goalH) {
  const h = sleepByDate.get(date);
  if (h == null || !Number.isFinite(h)) return 0;
  return Math.min(1, h / goalH);
}

function aerobicDaily(date, aerobByDate) {
  const sessions = aerobByDate.get(date);
  if (!sessions?.length) return 0;
  let best = 0;
  for (const s of sessions) {
    let score = 0.65;
    const mins = Number(s.minutes) || 0;
    if (mins >= 20) score += 0.15;
    if (mins >= 40) score += 0.1;
    const intensity = Number(s.intensity);
    if (intensity >= 4) score += 0.1;
    else if (intensity >= 3) score += 0.05;
    best = Math.max(best, Math.min(1, score));
  }
  return best;
}

function lactateDaily(date, lactateByDate) {
  const v = lactateByDate.get(date);
  if (v === true) return 1;
  return 0;
}

function computeDailyScore(date, ctx) {
  const pillars = {
    strength: strengthDaily(date, ctx.sets),
    protein: proteinDaily(date, ctx.proteinByDate, ctx.proteinGoal),
    sleep: sleepDaily(date, ctx.sleepByDate, ctx.sleepGoal),
    aerobic: aerobicDaily(date, ctx.aerobByDate),
    lactate: lactateDaily(date, ctx.lactateByDate),
  };
  const total = Object.entries(PILLAR_WEIGHTS).reduce(
    (sum, [key, w]) => sum + w * (pillars[key] || 0),
    0,
  );
  return { pillars, total: Math.min(1, total) };
}

function dayWeight(ageDays) {
  return Math.exp(-ageDays / MOMENTUM_DECAY_TAU);
}

/** Momentum-score på en gitt dag (0–100) ut fra dagscore-historikk. */
export function momentumAsOf(targetDate, dailyScores) {
  let weighted = 0;
  let wSum = 0;
  for (let age = 0; age < MOMENTUM_WINDOW; age++) {
    const date = addDaysStr(targetDate, -age);
    const w = dayWeight(age);
    weighted += w * (dailyScores.get(date)?.total ?? 0);
    wSum += w;
  }
  if (!wSum) return 0;
  return Math.round(Math.min(100, Math.max(0, (weighted / wSum) * 100)));
}

function smoothSeries(values, window = 5) {
  return values.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

function pillarStatusText(pct) {
  if (pct >= 95) return 'Godt dekket i dag';
  if (pct >= 50) return 'Delvis i dag';
  if (pct > 0) return 'Påbegynt i dag';
  return 'Ikke logget i dag';
}

function strengthLoggedOnDate(date, sets) {
  return MAIN_CATEGORIES.some(
    (cat) => sets.some((s) => s.category === cat.id && s.date === date),
  );
}

/** Styrke-pilar er 7-dagers rullerende; status skal reflektere om du logget styrke den dagen. */
function strengthFactorStatus(pillarPct, date, sets) {
  if (!strengthLoggedOnDate(date, sets)) return 'Ikke logget i dag';
  return pillarStatusText(pillarPct);
}

export const MOMENTUM_FACTORS = [
  { id: 'strength', label: 'Styrketrening', href: '#/styrketrening' },
  { id: 'protein', label: 'Protein', href: '#/inntak' },
  { id: 'sleep', label: 'Søvn', href: '#/sovn' },
  { id: 'aerobic', label: 'Aerob', href: '#/aerob' },
  { id: 'lactate', label: 'Anaerob', href: '#/anaerob' },
];

function buildFactors(pillars, { date, sets }) {
  return MOMENTUM_FACTORS.map((f) => {
    const raw = pillars[f.id] ?? 0;
    const pct = Math.round(Math.min(100, Math.max(0, raw * 100)));
    const status = f.id === 'strength'
      ? strengthFactorStatus(pct, date, sets)
      : pillarStatusText(pct);
    return {
      ...f,
      pct,
      status,
    };
  });
}

function indexProteinByDate(intakes) {
  const map = new Map();
  for (const row of intakes || []) {
    if (row.deleted) continue;
    map.set(row.date, (map.get(row.date) || 0) + (row.proteinG || 0));
  }
  return map;
}

function indexSleepByDate(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (row.deleted) continue;
    map.set(row.date, row.hours);
  }
  return map;
}

function indexAerobByDate(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (row.deleted) continue;
    if (!map.has(row.date)) map.set(row.date, []);
    map.get(row.date).push(row);
  }
  return map;
}

function indexLactateByDate(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (row.deleted) continue;
    map.set(row.date, row.produced);
  }
  return map;
}

/**
 * Beregner momentum-serie og handlingsforslag.
 * @param {{ sets, foodIntakes?, sleep?, aerobic?, lactate? }} input
 */
export function computeMomentum(input) {
  const today = todayStr();
  const sets = input.sets || [];
  const ctx = {
    sets,
    proteinByDate: indexProteinByDate(input.foodIntakes),
    sleepByDate: indexSleepByDate(input.sleep),
    aerobByDate: indexAerobByDate(input.aerobic),
    lactateByDate: indexLactateByDate(input.lactate),
    proteinGoal: nutritionGoalG('proteinDailyGoalG', 150),
    sleepGoal: sleepGoalHours(),
  };

  const dailyScores = new Map();
  for (let i = 45; i >= 0; i--) {
    const date = daysAgoStr(i);
    dailyScores.set(date, computeDailyScore(date, ctx));
  }

  const rawSeries = [];
  for (let i = 20; i >= 0; i--) {
    const date = daysAgoStr(i);
    rawSeries.push({
      date,
      label: i === 0 ? 'i dag' : i === 7 ? '7d' : '',
      value: momentumAsOf(date, dailyScores),
    });
  }

  const smoothed = smoothSeries(rawSeries.map((p) => p.value));
  const series = rawSeries.map((p, i) => ({
    ...p,
    value: Math.round(smoothed[i]),
  }));

  const todayEntry = dailyScores.get(today) || computeDailyScore(today, ctx);
  const factors = buildFactors(todayEntry.pillars, { date: today, sets });

  const change = series.length >= 2
    ? series[series.length - 1].value - series[series.length - 2].value
    : 0;

  return {
    today: series[series.length - 1].value,
    change,
    series,
    pillarsToday: todayEntry.pillars,
    factors,
    proteinGoal: ctx.proteinGoal,
    proteinG: ctx.proteinByDate.get(today) || 0,
  };
}
