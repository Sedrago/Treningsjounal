/**
 * assistant.js – den smarte treningsassistenten.
 *
 * Analyserer historikken og gir rådgivende meldinger og forslag.
 * Assistenten bestemmer aldri – den foreslår.
 */

import { KATEGORIER } from './store.js';
import { daysSinceCategory, volumeTrend30, best1RM, groupBy } from './stats.js';
import { fmtNum } from './utils.js';

/**
 * Kategori-analyse: dager siden hver kategori sist ble trent.
 * @returns {Array<{category:object, days:number|null}>} sortert med lengst siden først.
 */
export function categoryStatus(enrichedSets) {
  return KATEGORIER
    .filter((k) => k.id !== 'valgfri')
    .map((k) => ({ category: k, days: daysSinceCategory(enrichedSets, k.id) }))
    .sort((a, b) => {
      if (a.days === null) return -1; // aldri trent → høyest prioritet
      if (b.days === null) return 1;
      return b.days - a.days;
    });
}

/** Neste anbefalte kategori (lengst siden sist). */
export function nextRecommendedCategory(enrichedSets) {
  const status = categoryStatus(enrichedSets);
  return status.length ? status[0] : null;
}

/**
 * Genererer assistentmeldinger for hjemskjermen.
 * @returns {Array<{icon:string, text:string}>}
 */
export function getMessages(enrichedSets) {
  const messages = [];
  if (!enrichedSets.length) {
    messages.push({ icon: '👋', text: 'Velkommen! Opprett øvelsene dine under «Øvelser», og start din første økt.' });
    return messages;
  }

  // 1. Forsømte kategorier (mest forsømt først, maks 2).
  const neglected = categoryStatus(enrichedSets)
    .filter((s) => s.days === null || s.days >= 7)
    .slice(0, 2);
  for (const n of neglected) {
    if (n.days === null) {
      messages.push({ icon: '🆕', text: `Du har ennå ikke trent ${n.category.name.toLowerCase()}.` });
    } else {
      messages.push({ icon: '⏰', text: `Du har ikke gjort ${n.category.name.toLowerCase()} på ${n.days} dager.` });
    }
  }

  // 2. Balanse mellom motsatte mønstre.
  const pairs = [
    ['kneboy', 'hoftehengsel'],
    ['horisontal-push', 'horisontal-pull'],
    ['vertikal-push', 'vertikal-pull'],
  ];
  for (const [aId, bId] of pairs) {
    const imbalance = patternImbalance(enrichedSets, aId, bId);
    if (imbalance) messages.push(imbalance);
  }

  // 3. Volumtrend siste måned.
  const trend = volumeTrend30(enrichedSets);
  if (trend !== null && Math.abs(trend) >= 5) {
    if (trend > 0) {
      messages.push({ icon: '📈', text: `Du har økt volumet med ${fmtNum(trend, 0)} % siste måned.` });
    } else {
      messages.push({ icon: '📉', text: `Volumet er ned ${fmtNum(-trend, 0)} % siste måned.` });
    }
  }

  return messages.slice(0, 4);
}

/** Sjekker om ett mønster er trent ≥3 ganger siden motparten sist ble trent. */
function patternImbalance(sets, aId, bId) {
  const KAT = Object.fromEntries(KATEGORIER.map((k) => [k.id, k]));
  for (const [x, y] of [[aId, bId], [bId, aId]]) {
    const yDates = [...new Set(sets.filter((s) => s.category === y).map((s) => s.date))].sort();
    if (!yDates.length) continue;
    const lastY = yDates[yDates.length - 1];
    const xSince = new Set(sets.filter((s) => s.category === x && s.date > lastY).map((s) => s.date)).size;
    if (xSince >= 3) {
      return {
        icon: '⚖️',
        text: `${KAT[x].name} er trent ${xSince} ganger siden sist ${KAT[y].name.toLowerCase()}.`,
      };
    }
  }
  return null;
}

/**
 * Progresjonsforslag for en øvelse, basert på forrige økt og øvelsens mål.
 *
 * Regler:
 *  - Alle sett nådde øvre repsgrense (og RIR ≥ 1) → foreslå å øke vekten.
 *  - Estimert 1RM har falt >10 % fra beste av siste 5 økter → foreslå å redusere.
 *
 * @param {object} exercise  øvelsen (med goalSets/goalRepsMin/goalRepsMax)
 * @param {{date:string, sets:object[]}|null} lastSession
 * @param {object[]} exerciseSets  alle sett for øvelsen (beriket med dato)
 * @returns {{type:'increase'|'decrease'|null, text:string}|null}
 */
export function progressionSuggestion(exercise, lastSession, exerciseSets) {
  if (!lastSession || !lastSession.sets.length) return null;
  const sets = lastSession.sets.filter((s) => s.weight != null && s.reps != null);
  if (!sets.length) return null;

  const goalMax = exercise.goalRepsMax || 10;
  const goalSets = exercise.goalSets || 3;
  const topWeight = Math.max(...sets.map((s) => s.weight));

  // Regel 1: alle planlagte sett nådde øvre grense.
  const complete = sets.length >= goalSets;
  const allAtTop = sets.every((s) => s.reps >= goalMax);
  const notGrinding = sets.every((s) => s.rir == null || s.rir >= 1);
  if (complete && allAtTop && notGrinding) {
    const increment = topWeight >= 60 ? 2.5 : 1.25;
    const suggested = topWeight + increment;
    return {
      type: 'increase',
      text: `Alle sett nådde ${goalMax} reps sist. Forsøk ${fmtNum(suggested)} kg i dag.`,
      weight: suggested,
    };
  }

  // Regel 2: betydelig fall i estimert 1RM.
  const byDate = groupBy(exerciseSets, (s) => s.date);
  const recentDates = [...byDate.keys()].sort().slice(-5);
  if (recentDates.length >= 3) {
    const bestRecent = Math.max(...recentDates.slice(0, -1).map((d) => best1RM(byDate.get(d))));
    const lastRM = best1RM(byDate.get(recentDates[recentDates.length - 1]));
    if (bestRecent > 0 && lastRM > 0 && lastRM < bestRecent * 0.9) {
      const suggested = Math.round(topWeight * 0.9 / 2.5) * 2.5;
      return {
        type: 'decrease',
        text: `Prestasjonen har falt siste øktene. Vurder å gå ned til ~${fmtNum(suggested)} kg og bygg opp igjen.`,
        weight: suggested,
      };
    }
  }

  return null;
}

/**
 * Ukentlig bevegelsesbalanse: antall økter per kategori denne uken,
 * pluss hvilke kategorier som mangler.
 */
export function weeklyBalance(enrichedSets, mondayStr) {
  const thisWeek = enrichedSets.filter((s) => s.date >= mondayStr);
  const counts = new Map();
  for (const k of KATEGORIER) counts.set(k.id, 0);
  const byCat = groupBy(thisWeek, (s) => s.category);
  for (const [cat, catSets] of byCat) {
    counts.set(cat, new Set(catSets.map((s) => s.date)).size);
  }
  const missing = KATEGORIER.filter((k) => k.id !== 'valgfri' && counts.get(k.id) === 0);
  return { counts, missing };
}
