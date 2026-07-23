/**
 * matvaretabellen.js – Mattilsynets Matvaretabell (cache, søk, makro per porsjon).
 * Verdier i tabellen er per 100 g (væsker: 1 dl ≈ 100 g).
 */

import * as db from './db.js';

function roundMacroG(n) {
  return Math.round(Number(n) * 10) / 10;
}

const FOODS_URL = 'https://www.matvaretabellen.no/api/nb/foods.json';
const META_FOODS = 'matvaretabellenFoodsV1';
const META_FETCHED = 'matvaretabellenFetchedAt';

/** @type {Map<string, object> | null} */
let byId = null;
/** @type {{ id: string, name: string, nameNorm: string, keywordsNorm: string }[] | null} */
let searchRows = null;
let loadPromise = null;

function normalizeSearch(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

function constituentQty(food, nutrientId) {
  const row = (food.constituents || []).find(
    (c) => c.nutrientId === nutrientId && c.quantity != null && Number.isFinite(Number(c.quantity)),
  );
  return row ? Number(row.quantity) : 0;
}

function firstSegmentNorm(name) {
  const seg = String(name || '').split(',')[0] || '';
  return normalizeSearch(seg);
}

/** Treff på produktnavn (første ledd), ikke tilfeldig delstreng som «melk» i «melkepålegg». */
function segmentMatchesWord(segmentNorm, word) {
  if (!word) return false;
  if (segmentNorm === word) return true;
  const tokens = segmentNorm.split(/[^a-z0-9æøå]+/).filter(Boolean);
  return tokens.some((t) => {
    if (t === word) return true;
    if (t.endsWith(word) && t.length <= word.length + 10) return true;
    return false;
  });
}

function firstSegmentPrefixBonus(first, fullQuery) {
  if (first === fullQuery) return 70;
  const tokens = first.split(/[^a-z0-9æøå]+/).filter(Boolean);
  if (tokens[0] === fullQuery) return 70;
  if (tokens[0]?.endsWith(fullQuery) && tokens[0].length <= fullQuery.length + 10) return 55;
  return 0;
}

function searchScore(name, keywordsNorm, words, fullQuery) {
  const nameNorm = normalizeSearch(name);
  const haystack = `${nameNorm} ${keywordsNorm}`.trim();
  if (!words.every((w) => haystack.includes(w))) return -1;

  const first = firstSegmentNorm(name);
  let score = 0;

  if (words.every((w) => segmentMatchesWord(first, w))) {
    score += 100;
  } else if (words.every((w) => first.includes(w))) {
    score += 55;
  } else {
    score += 18;
  }

  score += firstSegmentPrefixBonus(first, fullQuery);
  if (nameNorm.startsWith(fullQuery) && !firstSegmentPrefixBonus(first, fullQuery)) score += 25;

  for (const w of words) {
    if (segmentMatchesWord(first, w)) score += 35;
    else if (first.includes(w)) score += 12;
    else if (nameNorm.includes(w)) score += 4;
  }

  const commas = (name.match(/,/g) || []).length;
  if (commas >= 2 && !words.every((w) => first.includes(w))) score -= 28;
  if (/hjemmebakt|restaurant|fastfood|kantine/i.test(name)) score -= 35;
  if (/,\s*med\s+/i.test(name) && !words.every((w) => first.includes(w))) score -= 40;

  score -= Math.min(35, Math.floor(name.length / 6));
  return score;
}

function buildIndexes(foods) {
  byId = new Map();
  searchRows = [];
  for (const f of foods) {
    const id = f.foodId;
    if (!id) continue;
    byId.set(id, f);
    searchRows.push({
      id,
      name: f.foodName || '',
      nameNorm: normalizeSearch(f.foodName || ''),
      keywordsNorm: normalizeSearch((f.searchKeywords || []).join(' ')),
    });
  }
}

async function fetchAndCacheFoods() {
  const res = await fetch(FOODS_URL);
  if (!res.ok) throw new Error(`Matvaretabellen: ${res.status}`);
  const data = await res.json();
  const foods = data.foods || [];
  await db.setMeta(META_FOODS, foods);
  await db.setMeta(META_FETCHED, new Date().toISOString());
  buildIndexes(foods);
  return foods;
}

/** Laster matvarer (IndexedDB eller nett første gang). */
export function ensureMatvaretabellenLoaded() {
  if (byId && searchRows) return Promise.resolve(true);
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    let foods = await db.getMeta(META_FOODS, null);
    if (!foods?.length) {
      await fetchAndCacheFoods();
      return true;
    }
    buildIndexes(foods);
    return true;
  })().catch((err) => {
    loadPromise = null;
    throw err;
  });
  return loadPromise;
}

export function isMatvaretabellenCached() {
  return Boolean(byId?.size);
}

export function getFoodById(foodId) {
  return byId?.get(foodId) || null;
}

/**
 * @param {string} query
 * @param {number} limit
 * @returns {{ id: string, name: string }[]}
 */
export function searchFoods(query, limit = 25) {
  return searchFoodsRanked(query, limit).map(({ id, name }) => ({ id, name }));
}

export function searchFoodsRanked(query, limit = 25) {
  if (!searchRows) return [];
  const q = normalizeSearch(query);
  if (q.length < 2) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const ranked = [];
  for (const row of searchRows) {
    const score = searchScore(row.name, row.keywordsNorm, words, q);
    if (score < 0) continue;
    ranked.push({ id: row.id, name: row.name, score });
  }
  ranked.sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.name.localeCompare(b.name, 'nb'));
  return ranked.slice(0, limit);
}

/** Gram per 1 enhet (glass = 2 dl med mindre tabellen har glass-porsjon). */
export function gramsPerUnit(food, unit) {
  if (unit === 'g') return 1;
  if (unit === 'dl') return 100;
  if (unit === 'glass') {
    const portions = food?.portions || [];
    const glass = portions.find((p) => /glass/i.test(p.portionName || '') && p.unit === 'g');
    if (glass?.quantity) return Number(glass.quantity);
    return 200;
  }
  if (unit === 'stk' || unit === 'skive') {
    const portions = food?.portions || [];
    const stk = portions.find((p) => /stk|skive|stykk|brød/i.test(p.portionName || '') && p.unit === 'g');
    if (stk?.quantity) return Number(stk.quantity);
    return 35;
  }
  return 100;
}

export function unitLabel(unit) {
  if (unit === 'g') return 'g';
  if (unit === 'dl') return 'dl';
  if (unit === 'glass') return 'glass';
  if (unit === 'stk' || unit === 'skive') return 'stk';
  return unit;
}

export function portionHint(unit) {
  if (unit === 'glass') return '1 glass = 2 dl (200 g) med mindre tabellen angir annet';
  if (unit === 'dl') return '1 dl ≈ 100 g';
  if (unit === 'stk' || unit === 'skive') return '1 stk fra tabellens porsjon, ellers ca. 35 g';
  return '';
}

export const MATVARE_UNITS = [
  { id: 'g', label: 'g' },
  { id: 'dl', label: 'dl' },
  { id: 'glass', label: 'glass' },
  { id: 'stk', label: 'stk' },
];

/** @returns {{ proteinG, carbsG, fatG, kcal, grams }} */
export function macrosForPortion(food, amount, unit) {
  const amt = Math.max(0, Number(amount) || 0);
  const grams = amt * gramsPerUnit(food, unit);
  const f = grams / 100;
  return {
    grams,
    proteinG: roundMacroG(constituentQty(food, 'Protein') * f),
    carbsG: roundMacroG(constituentQty(food, 'Karbo') * f),
    fatG: roundMacroG(constituentQty(food, 'Fett') * f),
    kcal: Math.round((food.calories?.quantity || constituentQty(food, 'Energi') || 0) * f),
  };
}

export function formatIntakeNote(foodName, amount, unit) {
  const u = unitLabel(unit);
  const amt = Number(amount);
  const amtStr = Number.isFinite(amt) && Math.abs(amt - Math.round(amt)) < 1e-9
    ? String(Math.round(amt))
    : String(amt);
  return `${foodName} · ${amtStr} ${u}`;
}
