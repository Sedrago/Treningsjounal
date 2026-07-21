/**
 * momentum.js – momentum-score: glidende bilde av treningsperiode (0–100).
 * Vekter kan justeres etter erfaring; pillar-logikk er samlet her.
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

function recoveryMultiplier(daysSince) {
  if (daysSince == null) return 1;
  if (daysSince <= 1) return 0.25;
  if (daysSince === 2) return 0.75;
  return 1;
}

function intensityMultiplier(catSets) {
  if (!catSets.length) return 1;
  const rirs = catSets.map((s) => s.rir).filter((r) => r != null && Number.isFinite(Number(r)));
  if (!rirs.length) return 1;
  const mean = rirs.reduce((a, b) => a + Number(b), 0) / rirs.length;
  return Math.min(1.12, 1 + Math.max(0, (3 - mean) * 0.035));
}

function lastCategoryDateBefore(sets, categoryId, beforeDate) {
  let last = null;
  for (const s of sets) {
    if (s.category !== categoryId || s.date >= beforeDate) continue;
    if (!last || s.date > last) last = s.date;
  }
  return last;
}

function setsForCategoryOnDate(sets, categoryId, date) {
  return sets.filter((s) => s.category === categoryId && s.date === date);
}

function strengthDaily(date, sets) {
  const trained = MAIN_CATEGORIES.filter((cat) => setsForCategoryOnDate(sets, cat.id, date).length);
  if (!trained.length) return 0;

  let sum = 0;
  for (const cat of trained) {
    const last = lastCategoryDateBefore(sets, cat.id, date);
    const daysSince = last ? daysBetween(last, date) : null;
    const catSets = setsForCategoryOnDate(sets, cat.id, date);
    sum += recoveryMultiplier(daysSince) * intensityMultiplier(catSets);
  }
  return Math.min(1, sum / 3.5);
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

function smoothSeries(values, window = 3) {
  return values.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

function recomputeTotal(daily) {
  const total = Object.entries(PILLAR_WEIGHTS).reduce(
    (sum, [key, w]) => sum + w * (daily.pillars[key] || 0),
    0,
  );
  return { ...daily, total: Math.min(1, total) };
}

function simulateStrengthAdd(date, sets, categoryId) {
  const fake = [...sets, { date, category: categoryId, rir: 2 }];
  return strengthDaily(date, fake);
}

function buildTips(today, dailyScores, sets, ctx) {
  const baseline = momentumAsOf(today, dailyScores);
  const todayEntry = dailyScores.get(today) || computeDailyScore(today, ctx);
  const candidates = [];

  const tryTip = (label, href, apply) => {
    const nextPillars = { ...todayEntry.pillars, ...apply() };
    const nextDaily = recomputeTotal({ pillars: nextPillars });
    const sim = new Map(dailyScores);
    sim.set(today, nextDaily);
    const delta = momentumAsOf(today, sim) - baseline;
    if (delta > 0.15) candidates.push({ label, href, delta });
  };

  if ((todayEntry.pillars.strength ?? 0) < 0.9) {
    const ready = MAIN_CATEGORIES
      .filter((cat) => !setsForCategoryOnDate(sets, cat.id, today).length)
      .map((cat) => {
        const last = lastCategoryDateBefore(sets, cat.id, today);
        const daysSince = last ? daysBetween(last, today) : 999;
        return { cat, daysSince };
      })
      .filter(({ daysSince }) => daysSince >= 2)
      .sort((a, b) => b.daysSince - a.daysSince);

    for (const { cat } of ready.slice(0, 3)) {
      tryTip(`Tren ${cat.name.toLowerCase()}`, '#/styrke', () => ({
        strength: simulateStrengthAdd(today, sets, cat.id),
      }));
    }

    if (!ready.length && (todayEntry.pillars.strength ?? 0) < 0.2) {
      tryTip('Start styrketrening', '#/styrke', () => ({ strength: 0.35 }));
    }
  }

  if ((todayEntry.pillars.protein ?? 0) < 0.95) {
    tryTip('Logg proteininntak', '#/inntak', () => ({ protein: 1 }));
  }

  if ((todayEntry.pillars.sleep ?? 0) < 0.5) {
    tryTip('Logg søvn', '#/sovn', () => ({ sleep: 1 }));
  }

  if ((todayEntry.pillars.aerobic ?? 0) < 0.5) {
    tryTip('Logg aerob økt', '#/aerob', () => ({ aerobic: 0.85 }));
  }

  if ((todayEntry.pillars.lactate ?? 0) < 0.5 && (todayEntry.pillars.strength ?? 0) > 0.2) {
    tryTip('Registrer anaerob innsats', '#/anaerob', () => ({ lactate: 1 }));
  }

  candidates.sort((a, b) => b.delta - a.delta);

  const out = [];
  const seen = new Set();
  for (const c of candidates) {
    const key = c.href === '#/styrke' ? 'styrke' : c.href;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: c.label, href: c.href });
    if (out.length >= 5) break;
  }

  if (!out.length && !sets.length) {
    out.push({ label: 'Kom i gang med styrketrening', href: '#/styrke' });
  }

  return out;
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

  const tips = buildTips(today, dailyScores, sets, ctx);

  return {
    today: series[series.length - 1].value,
    series,
    tips,
  };
}
