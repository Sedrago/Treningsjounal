/**
 * program-share.js – eksport/import av treningsprogram (kun struktur + mål, ingen logger).
 */

import * as store from './store.js';
import { getCatalogEntry } from './content.js';
import { groupBy } from './stats.js';
import { todayStr } from './utils.js';

export const PROGRAM_FORMAT = 'treningsjournal-program';
export const PROGRAM_VERSION = 1;

function download(filename, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function safeFilename(name) {
  const base = String(name || 'program').trim().replace(/[^\w\s-æøåÆØÅ]/gi, '').trim();
  return base || 'program';
}

/** Bygger portable program-payload fra navn, items og øvelseskart. */
export function buildProgramPayload(name, items, exMap) {
  const exercises = (items || []).map((item) => {
    const ex = exMap.get(item.exerciseId);
    if (!ex) return null;
    const ref = {
      name: ex.name,
      category: ex.category,
    };
    if (ex.catalogId) ref.catalogId = ex.catalogId;
    if (item.suggestedSets != null) ref.suggestedSets = item.suggestedSets;
    if (item.suggestedReps != null) ref.suggestedReps = item.suggestedReps;
    if (item.suggestedWeightKg != null) ref.suggestedWeightKg = item.suggestedWeightKg;
    return ref;
  }).filter(Boolean);

  return {
    format: PROGRAM_FORMAT,
    version: PROGRAM_VERSION,
    exportedAt: new Date().toISOString(),
    name: String(name || 'Program').trim() || 'Program',
    exercises,
  };
}

export function exportProgramFile(payload) {
  const filename = `treningsjournal-program-${safeFilename(payload.name)}.json`;
  download(filename, JSON.stringify(payload, null, 2), 'application/json');
}

/** Kompakt delingskode (base64url) for liming i melding. */
export function programShareCode(payload) {
  const json = JSON.stringify(payload);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function parseProgramShareCode(code) {
  const trimmed = String(code || '').trim();
  if (!trimmed) throw new Error('Tom delingskode');
  const b64 = trimmed.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const json = decodeURIComponent(escape(atob(b64 + pad)));
  return JSON.parse(json);
}

/** Parser JSON-fil eller delingskode. */
export function parseProgramImport(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('Tom fil');
  if (trimmed.startsWith('{')) {
    const data = JSON.parse(trimmed);
    if (data.format && data.format !== PROGRAM_FORMAT) {
      throw new Error('Ukjent programformat');
    }
    if (!Array.isArray(data.exercises)) throw new Error('Mangler øvelsesliste');
    return data;
  }
  return parseProgramShareCode(trimmed);
}

/** Matcher importert øvelse mot lokalt bibliotek; oppretter ved behov. */
export async function resolveImportExercise(ref, { autoAdd = true } = {}) {
  if (!ref?.name && !ref?.catalogId) return null;

  if (ref.catalogId) {
    const existing = await store.findExerciseByCatalogId(ref.catalogId);
    if (existing && !existing.deleted) return existing;
    if (autoAdd) {
      const entry = getCatalogEntry(ref.catalogId);
      if (entry) return store.addExerciseFromCatalog(ref.catalogId, entry);
    }
  }

  if (ref.name && ref.category) {
    const mine = await store.getExercisesByCategory(ref.category);
    const match = mine.find((e) => e.name.toLowerCase() === ref.name.toLowerCase());
    if (match) return match;
    if (autoAdd) {
      return store.saveExercise({
        name: ref.name,
        category: ref.category,
        applyDefaultGoals: true,
      });
    }
  }

  return null;
}

/**
 * Importerer program til lokale maler.
 * @returns {{ name, items, warnings: string[] }}
 */
export async function importProgramData(data, { autoAddMissing = true } = {}) {
  const warnings = [];
  const items = [];

  for (const ref of data.exercises || []) {
    const ex = await resolveImportExercise(ref, { autoAdd: autoAddMissing });
    if (!ex) {
      warnings.push(`Fant ikke «${ref.name || ref.catalogId || 'ukjent'}»`);
      continue;
    }
    items.push(store.sanitizePlanItem({
      exerciseId: ex.id,
      suggestedSets: ref.suggestedSets,
      suggestedReps: ref.suggestedReps,
      suggestedWeightKg: ref.suggestedWeightKg,
    }));
  }

  if (!items.length) throw new Error('Ingen øvelser kunne importeres');

  return {
    name: String(data.name || 'Importert program').trim() || 'Importert program',
    items,
    warnings,
  };
}

/** Program-items fra loggede sett (rekkefølge: plan først, deretter resten). */
export function itemsFromLoggedSession(daySets, planItems) {
  const setsByEx = groupBy(daySets, (s) => s.exerciseId);
  const order = [];
  const seen = new Set();

  for (const item of planItems || []) {
    if (setsByEx.has(item.exerciseId) && !seen.has(item.exerciseId)) {
      order.push(item.exerciseId);
      seen.add(item.exerciseId);
    }
  }
  for (const exId of setsByEx.keys()) {
    if (!seen.has(exId)) {
      order.push(exId);
      seen.add(exId);
    }
  }

  return order.map((exerciseId) => {
    const sug = store.suggestionsFromLoggedSets(setsByEx.get(exerciseId) || []);
    return store.sanitizePlanItem({ exerciseId, ...sug });
  });
}

export function defaultExportFilename(name) {
  return `treningsjournal-program-${safeFilename(name)}-${todayStr()}.json`;
}
