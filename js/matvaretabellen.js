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
/** @type {{ id: string, name: string, norm: string }[] | null} */
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
      norm: normalizeSearch(`${f.foodName || ''} ${(f.searchKeywords || []).join(' ')}`),
    });
  }
  searchRows.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
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
  if (!searchRows) return [];
  const q = normalizeSearch(query);
  if (q.length < 2) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const out = [];
  for (const row of searchRows) {
    if (!words.every((w) => row.norm.includes(w))) continue;
    out.push({ id: row.id, name: row.name });
    if (out.length >= limit) break;
  }
  return out;
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
  return 100;
}

export function unitLabel(unit) {
  if (unit === 'g') return 'g';
  if (unit === 'dl') return 'dl';
  if (unit === 'glass') return 'glass';
  return unit;
}

export function portionHint(unit) {
  if (unit === 'glass') return '1 glass = 2 dl (200 g) med mindre tabellen angir annet';
  if (unit === 'dl') return '1 dl ≈ 100 g';
  return '';
}

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
