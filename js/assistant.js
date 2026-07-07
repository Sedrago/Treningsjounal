/**
 * assistant.js – journal-assistent: minner om hva som ikke er trent.
 * Ingen progresjons- eller treningsråd – det er brukerens egen jobb.
 */

import { KATEGORIER } from './store.js';
import { daysSinceCategory, volumeTrend30, groupBy } from './stats.js';
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
 * Bevegelsesbalanse siden gitt dato: antall treningsdager per kategori,
 * pluss hvilke kategorier som mangler.
 */
export function balanceSince(enrichedSets, sinceDate) {
  const recent = enrichedSets.filter((s) => s.date >= sinceDate);
  const counts = new Map();
  for (const k of KATEGORIER) counts.set(k.id, 0);
  const byCat = groupBy(recent, (s) => s.category);
  for (const [cat, catSets] of byCat) {
    counts.set(cat, new Set(catSets.map((s) => s.date)).size);
  }
  const missing = KATEGORIER.filter((k) => k.id !== 'valgfri' && counts.get(k.id) === 0);
  return { counts, missing };
}

/** @deprecated Bruk balanceSince med windowStartStr(7). */
export function weeklyBalance(enrichedSets, mondayStr) {
  return balanceSince(enrichedSets, mondayStr);
}
