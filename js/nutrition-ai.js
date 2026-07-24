/**
 * nutrition-ai.js – strukturér måltid via OpenAI (Apps Script), match Matvaretabellen.
 */

import * as api from './api.js';
import * as db from './db.js';
import {
  ensureMatvaretabellenLoaded,
  searchFoodsRanked,
  getFoodById,
  macrosForPortion,
  gramsPerUnit,
} from './matvaretabellen.js';
import * as store from './store.js';

const CACHE_META = 'mealStructureCacheV1';
const SPREAD_G_PER_STK = 15;

/** Mengde (g) per enhet + antall fra parser amount/unit (valgfritt matvare for stk/glass). */
export function derivePortionAndCount(amount, unit, food = null) {
  const u = normalizeUnit(unit);
  const amt = Number(amount);
  const n = Number.isFinite(amt) && amt > 0 ? amt : 1;

  if (u === 'g') {
    return { portionG: n, count: 1 };
  }
  if (u === 'dl') {
    return { portionG: 100, count: n };
  }
  if (u === 'glass') {
    const pg = food ? gramsPerUnit(food, 'glass') : 200;
    return { portionG: pg, count: n };
  }
  if (u === 'stk') {
    const pg = food ? gramsPerUnit(food, 'stk') : null;
    return { portionG: pg, count: n };
  }
  return { portionG: n, count: 1 };
}

function applyPortionModel(row) {
  if (row.brandEstimate) return row;
  const food = row.foodId ? getFoodById(row.foodId) : null;
  const { portionG, count } = derivePortionAndCount(row.amount, row.unit, food);
  const pg = row.portionG != null && Number(row.portionG) > 0 ? Number(row.portionG) : portionG;
  const c = row.count != null && Number(row.count) > 0 ? Number(row.count) : count;
  return { ...row, portionG: pg, count: c, unit: 'g' };
}

export function rowTotalGrams(row) {
  if (row.brandEstimate) return null;
  const pg = Number(row.portionG);
  const c = Number(row.count ?? 1);
  if (Number.isFinite(pg) && pg > 0 && Number.isFinite(c) && c > 0) return pg * c;
  const food = row.foodId ? getFoodById(row.foodId) : null;
  if (food && row.amount != null) return macrosForPortion(food, row.amount, row.unit || 'g').grams;
  return 0;
}

function normalizeUnit(unit) {
  const u = String(unit || 'g').toLowerCase();
  if (u === 'skive' || u === 'stk') return 'stk';
  if (u === 'glass' || u === 'dl' || u === 'g') return u;
  return 'g';
}

/** Visningsnavn når Matvaretabellen ikke har treff. */
export function missingFoodLabel(row) {
  const name = String(row.originalQuery || row.query || row.raw || '').trim() || 'ukjent';
  return `Ingen treff: ${name}`;
}

function flattenStructuredLines(lines) {
  const out = [];
  for (const line of lines || []) {
    if (line.parts?.length) {
      for (const p of line.parts) {
        out.push({
          raw: line.raw || p.query,
          query: p.query,
          amount: p.amount,
          unit: p.unit,
          assumed: p.assumed,
          assumptionNote: p.assumptionNote,
        });
      }
    } else if (line.query) {
      out.push(line);
    }
  }
  return out;
}

function applySpreadDefaults(items) {
  const stkByRaw = new Map();
  for (const it of items) {
    if (normalizeUnit(it.unit) === 'stk' && it.amount) {
      stkByRaw.set(it.raw, Number(it.amount));
    }
  }
  return items.map((it) => {
    let amount = it.amount != null ? Number(it.amount) : null;
    let unit = normalizeUnit(it.unit);
    let assumed = Boolean(it.assumed);
    let assumptionNote = it.assumptionNote || '';

    if ((amount == null || !Number.isFinite(amount)) && unit === 'g' && assumed) {
      const stk = stkByRaw.get(it.raw);
      if (stk) {
        amount = SPREAD_G_PER_STK * stk;
        assumptionNote = assumptionNote || `${SPREAD_G_PER_STK} g per stk (antatt)`;
      }
    }
    if (amount == null || !Number.isFinite(amount)) amount = 1;
    return { ...it, amount, unit, assumed, assumptionNote };
  });
}

function shouldAutoPickFood(hits) {
  if (hits.length <= 1) return true;
  const [a, b] = hits;
  if (a.score >= 120 && a.score - (b?.score || 0) >= 35) return true;
  return false;
}

async function pickFoodId(raw, query, hits) {
  if (!hits.length) return null;
  if (shouldAutoPickFood(hits)) return hits[0].id;
  const { foodId } = await api.call('nutritionPickFood', {
    raw,
    query,
    candidates: hits.slice(0, 8).map((h) => ({ id: h.id, name: h.name })),
  });
  return foodId || hits[0].id;
}

async function fetchSearchSuggestions(noHitLines) {
  if (!noHitLines.length) return new Map();
  try {
    const data = await api.call('nutritionSuggestSearch', { lines: noHitLines });
    const map = new Map();
    for (const it of data?.items || []) {
      if (it.id != null) map.set(String(it.id), it);
    }
    return map;
  } catch {
    return new Map();
  }
}

function normalizeAiEstimate(est) {
  if (!est || typeof est !== 'object') return null;
  const proteinG = Number(est.proteinG);
  const carbsG = Number(est.carbsG);
  const fatG = est.fatG != null && est.fatG !== '' ? Number(est.fatG) : null;
  const kcal = est.kcal != null && est.kcal !== '' ? Number(est.kcal) : null;
  const has = (Number.isFinite(proteinG) && proteinG > 0)
    || (Number.isFinite(carbsG) && carbsG > 0)
    || (Number.isFinite(fatG) && fatG > 0)
    || (Number.isFinite(kcal) && kcal > 0);
  if (!has) return null;
  return {
    proteinG: Number.isFinite(proteinG) ? proteinG : 0,
    carbsG: Number.isFinite(carbsG) ? carbsG : 0,
    fatG: fatG != null && Number.isFinite(fatG) ? fatG : null,
    kcal: kcal != null && Number.isFinite(kcal) ? kcal : null,
  };
}

/** Skaler AI-estimat når mengde endres (samme enhet). */
export function scaleAiMacrosFromBasis(basis, amount, unit) {
  if (!basis?.macros) return null;
  if (unit !== basis.unit) return { ...basis.macros };
  const baseAmt = Number(basis.amount) || 1;
  const factor = (Number(amount) || 0) / baseAmt;
  const m = basis.macros;
  return {
    proteinG: (m.proteinG || 0) * factor,
    carbsG: (m.carbsG || 0) * factor,
    fatG: m.fatG != null ? m.fatG * factor : null,
    kcal: m.kcal != null ? m.kcal * factor : null,
  };
}

async function getCachedStructure(text) {
  const cache = (await db.getMeta(CACHE_META, null)) || {};
  const key = text.trim().toLowerCase();
  return cache[key] || null;
}

async function setCachedStructure(text, lines) {
  const cache = (await db.getMeta(CACHE_META, null)) || {};
  const key = text.trim().toLowerCase();
  cache[key] = { lines, at: new Date().toISOString() };
  const keys = Object.keys(cache);
  if (keys.length > 40) {
    keys.sort((a, b) => (cache[a].at || '').localeCompare(cache[b].at || ''));
    delete cache[keys[0]];
  }
  await db.setMeta(CACHE_META, cache);
}

export async function structureMealText(text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Skriv inn hva du spiste');
  const cached = await getCachedStructure(trimmed);
  if (cached?.lines?.length) return { lines: cached.lines, fromCache: true };
  const data = await api.call('nutritionStructure', { text: trimmed });
  if (!data?.lines?.length) throw new Error('Kunne ikke tolke måltidet');
  await setCachedStructure(trimmed, data.lines);
  return { lines: data.lines, fromCache: false };
}

/**
 * @returns {Promise<Array<{
 *   raw, query, originalQuery, foodId, foodName, amount, unit, assumed, assumptionNote,
 *   candidates, macros, missingFood, missingHint
 * }>>}
 */
export async function resolveMealFromText(text) {
  await ensureMatvaretabellenLoaded();
  const { lines } = await structureMealText(text);
  const flat = applySpreadDefaults(flattenStructuredLines(lines));

  const preliminary = [];
  flat.forEach((item, index) => {
    const originalQuery = String(item.query || '').trim();
    if (!originalQuery) return;
    preliminary.push({
      item,
      index,
      originalQuery,
      query: originalQuery,
      hits: searchFoodsRanked(originalQuery, 10),
    });
  });

  const noHitLines = preliminary
    .filter((p) => !p.hits.length)
    .map((p) => ({
      id: String(p.index),
      raw: p.item.raw || p.originalQuery,
      query: p.originalQuery,
      amount: p.item.amount,
      unit: p.item.unit,
    }));

  const suggestById = await fetchSearchSuggestions(noHitLines);

  const resolved = [];
  for (const p of preliminary) {
    const { item, originalQuery } = p;
    let query = p.query;
    let hits = p.hits;
    let missingHint = '';
    let macrosFromAi = false;
    let aiMacroBasis = null;

    if (!hits.length) {
      const sug = suggestById.get(String(p.index));
      if (sug?.hint) missingHint = String(sug.hint).trim();
      const retryQ = sug?.searchQuery ? String(sug.searchQuery).trim() : '';
      if (retryQ && retryQ.toLowerCase() !== query.toLowerCase()) {
        query = retryQ;
        hits = searchFoodsRanked(query, 10);
      }
    }

    const foodId = hits.length ? await pickFoodId(item.raw || originalQuery, query, hits) : null;
    const food = foodId ? getFoodById(foodId) : null;
    const amount = item.amount;
    const unit = item.unit;
    let macros = food ? macrosForPortion(food, amount, unit) : null;

    if (!food) {
      const sug = suggestById.get(String(p.index));
      const est = normalizeAiEstimate(sug?.estimate);
      if (est) {
        macros = est;
        macrosFromAi = true;
        aiMacroBasis = { amount, unit, macros: { ...est } };
      }
    }

    const rowBase = {
      raw: item.raw || originalQuery,
      query,
      originalQuery,
      amount,
      unit,
      assumed: item.assumed,
      assumptionNote: item.assumptionNote || '',
    };

    resolved.push(applyPortionModel({
      ...rowBase,
      foodId: food?.foodId || foodId,
      foodName: food?.foodName || missingFoodLabel(rowBase),
      candidates: hits.map((h) => ({ id: h.id, name: h.name })),
      macros,
      missingFood: !food,
      missingHint: !food ? missingHint : '',
      macrosFromAi: !food && macrosFromAi,
      aiMacroBasis: !food ? aiMacroBasis : null,
    }));
  }

  if (!resolved.length) throw new Error('Ingen matvarelinjer å slå opp');
  const withMacros = resolved.map((r) => recomputeRowMacros(r));
  return Promise.all(withMacros.map(async (row) => {
    if (row.brandEstimate || row.macrosFromAi || !row.foodId) return row;
    if (row.portionG != null && Number(row.portionG) > 0) return row;
    const last = await store.getLastPortionGramsForFood(row.foodId);
    if (last == null) return row;
    return recomputeRowMacros({ ...row, portionG: last });
  }));
}

/**
 * Merkevare / restaurant — kun AI-estimat (ett API-kall, ingen Matvaretabellen).
 */
export async function resolveBrandMealFromText(text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Skriv inn hva du spiste');
  const data = await api.call('nutritionBrandEstimate', { text: trimmed });
  const items = data?.items || [];
  if (!items.length) throw new Error('Kunne ikke estimere næring');

  const rows = [];
  for (const item of items) {
    const label = String(item.label || '').trim();
    const est = normalizeAiEstimate(item.estimate);
    if (!label || !est) continue;
    const amount = 1;
    const unit = 'stk';
    rows.push({
      raw: trimmed,
      query: label,
      originalQuery: label,
      amount,
      unit,
      foodId: null,
      foodName: label,
      candidates: [],
      macros: { ...est },
      missingFood: true,
      missingHint: item.hint ? String(item.hint).trim() : '',
      macrosFromAi: true,
      brandEstimate: true,
      aiMacroBasis: { amount, unit, macros: { ...est } },
    });
  }
  if (!rows.length) throw new Error('Kunne ikke estimere næring');
  return rows;
}

export function sumResolvedMacros(rows) {
  const sum = { proteinG: 0, carbsG: 0, fatG: 0, kcal: 0 };
  for (const r of rows) {
    if (!r.macros) continue;
    sum.proteinG += r.macros.proteinG || 0;
    sum.carbsG += r.macros.carbsG || 0;
    sum.fatG += r.macros.fatG || 0;
    sum.kcal += r.macros.kcal || 0;
  }
  return sum;
}

export function recomputeRowMacros(row) {
  const r = applyPortionModel(row);
  const food = r.foodId ? getFoodById(r.foodId) : null;
  if (food) {
    const totalG = rowTotalGrams(r);
    return {
      ...r,
      foodName: food.foodName,
      macros: totalG > 0 ? macrosForPortion(food, totalG, 'g') : null,
      missingFood: false,
      missingHint: '',
      macrosFromAi: false,
      aiMacroBasis: null,
      unit: 'g',
    };
  }
  if (r.macrosFromAi && r.aiMacroBasis) {
    const name = row.brandEstimate
      ? (row.originalQuery || row.query || row.foodName)
      : missingFoodLabel(row);
    return {
      ...row,
      foodName: name,
      macros: scaleAiMacrosFromBasis(row.aiMacroBasis, row.amount, row.unit),
      missingFood: true,
    };
  }
  return {
    ...row,
    foodName: missingFoodLabel(row),
    macros: null,
    missingFood: true,
    macrosFromAi: false,
    aiMacroBasis: null,
  };
}
