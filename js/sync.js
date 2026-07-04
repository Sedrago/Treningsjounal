/**
 * sync.js – synkronisering mellom lokal IndexedDB og Google Sheets.
 *
 * Strategi (lokal-først):
 *   1. Alle skriv går til IndexedDB + synk-kø umiddelbart.
 *   2. flush() sender køen til serveren når det er nett.
 *   3. pull() henter hele datasettet og erstatter lokale lagre
 *      (Google Sheets er sannhetskilden). Pull gjøres kun når køen er tom,
 *      slik at lokale endringer aldri overskrives.
 *
 * Synk trigges: ved oppstart, når appen får nett igjen, når appen
 * hentes frem (visibilitychange) og etter skriv (debounced).
 */

import * as db from './db.js';
import * as api from './api.js';

const listeners = new Set();
let syncing = false;
let flushTimer = null;

export const state = {
  lastSync: null,      // ISO-tidspunkt for siste vellykkede synk
  lastError: null,
  pending: 0,
  online: navigator.onLine,
};

/** Abonner på endringer i synk-status. */
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function notify() {
  state.pending = await db.queueCount();
  state.online = navigator.onLine;
  listeners.forEach((fn) => fn(state));
}

/** Sender køen til serveren. Returnerer true hvis alt gikk bra. */
export async function flush() {
  if (!api.isConfigured() || !navigator.onLine || syncing) return false;
  const queue = await db.getQueue();
  if (!queue.length) return true;
  syncing = true;
  try {
    // Send i bolker på 50 for å holde hvert kall raskt.
    for (let i = 0; i < queue.length; i += 50) {
      const batch = queue.slice(i, i + 50);
      await api.push(batch.map(({ entity, op, data }) => ({ entity, op, data })));
      await db.removeQueueItems(batch.map((q) => q.qid));
    }
    state.lastError = null;
    state.lastSync = new Date().toISOString();
    await db.setMeta('lastSync', state.lastSync);
    return true;
  } catch (err) {
    state.lastError = err.message;
    return false;
  } finally {
    syncing = false;
    notify();
  }
}

/** Henter alt fra serveren og erstatter lokale data. Krever tom kø. */
export async function pull() {
  if (!api.isConfigured() || !navigator.onLine || syncing) return false;
  const pendingCount = await db.queueCount();
  if (pendingCount > 0) return false;
  syncing = true;
  try {
    const data = await api.pullAll();
    await db.replaceAll('exercises', data.exercises || []);
    await db.replaceAll('workouts', data.workouts || []);
    await db.replaceAll('sets', data.sets || []);
    await db.replaceAll('bodyweight', data.bodyweight || []);
    // Innstillinger flettes (server vinner), apiKey holdes utenfor klienten.
    const settings = data.settings || {};
    for (const [key, value] of Object.entries(settings)) {
      if (key === 'apiKey') continue;
      await db.put('settings', { key, value });
    }
    state.lastError = null;
    state.lastSync = new Date().toISOString();
    await db.setMeta('lastSync', state.lastSync);
    return true;
  } catch (err) {
    state.lastError = err.message;
    return false;
  } finally {
    syncing = false;
    notify();
  }
}

/** Full synk: send kø, hent deretter ferske data. */
export async function fullSync() {
  const flushed = await flush();
  if (flushed) await pull();
  return !state.lastError;
}

/** Planlegger en flush litt frem i tid (kalles etter skriv). */
export function scheduleFlush() {
  notify();
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => flush(), 3000);
}

/** Kobler opp automatisk synkronisering. */
export async function init() {
  state.lastSync = await db.getMeta('lastSync');
  window.addEventListener('online', () => { notify(); flush(); });
  window.addEventListener('offline', () => notify());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') flush();
  });
  notify();
  if (api.isConfigured() && navigator.onLine) {
    await fullSync();
  }
}
