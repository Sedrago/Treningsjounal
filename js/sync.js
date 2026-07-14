/**
 * sync.js – synkronisering mellom lokal IndexedDB og Google Sheets.
 *
 * Strategi (lokal-først):
 *   1. Alle skriv går til IndexedDB + synk-kø umiddelbart.
 *   2. flush() sender køen til serveren (fortløpende, debounced).
 *   3. pull() henter hele datasettet – kun ved oppstart og manuell synk.
 *
 * Synk skjer stille i bakgrunnen og blokkerer ikke UI.
 */

import * as db from './db.js';
import * as api from './api.js';

const listeners = new Set();
let syncing = false;
let flushTimer = null;
let startupSyncStarted = false;

export const state = {
  lastSync: null,      // ISO – siste vellykkede henting fra server (pull)
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

/** Sender køen til serveren. Oppdaterer ikke lastSync (kun opplasting). */
export async function flush() {
  if (!api.isConfigured() || !navigator.onLine || syncing) return false;
  const queue = await db.getQueue();
  if (!queue.length) return true;
  syncing = true;
  try {
    for (let i = 0; i < queue.length; i += 50) {
      const batch = queue.slice(i, i + 50);
      await api.push(batch.map(({ entity, op, data }) => ({ entity, op, data })));
      await db.removeQueueItems(batch.map((q) => q.qid));
    }
    state.lastError = null;
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
    await db.replaceAll('aerobic', data.aerobic || []);
    await db.replaceAll('sleep', data.sleep || []);
    await db.replaceAll('mood', data.mood || []);
    await db.replaceAll('plans', data.plans || []);
    const settings = data.settings || {};
    for (const [key, value] of Object.entries(settings)) {
      if (key === 'apiKey') continue;
      await db.put('settings', { key, value });
    }
    const { initSettings } = await import('./store.js');
    await initSettings();

    state.lastError = null;
    state.lastSync = new Date().toISOString();
    await db.setMeta('lastSync', state.lastSync);
    await db.setMeta('lastSyncError', '');
    window.dispatchEvent(new CustomEvent('sync-complete'));
    return true;
  } catch (err) {
    state.lastError = err.message;
    await db.setMeta('lastSyncError', state.lastError);
    return false;
  } finally {
    syncing = false;
    notify();
  }
}

/** Full synk: send kø, hent deretter ferske data (manuell knapp). */
export async function fullSync() {
  const flushed = await flush();
  if (!flushed) return false;
  const pulled = await pull();
  return pulled && !state.lastError;
}

/** Planlegger opplasting litt frem i tid (kalles etter hvert skriv). */
export function scheduleFlush() {
  notify();
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => flush(), 3000);
}

/** Flush + pull ved oppstart – blokkerer ikke UI. */
function runStartupSync() {
  if (startupSyncStarted || !api.isConfigured() || !navigator.onLine) return;
  startupSyncStarted = true;
  (async () => {
    await flush();
    await pull();
  })().finally(() => notify());
}

/** Kobler opp automatisk synkronisering. Blokkerer ikke UI. */
export async function init() {
  state.lastSync = await db.getMeta('lastSync');
  state.lastError = (await db.getMeta('lastSyncError')) || null;

  window.addEventListener('online', () => {
    notify();
    flush();
  });
  window.addEventListener('offline', () => notify());

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      clearTimeout(flushTimer);
      flush();
    }
  });

  notify();
  runStartupSync();
}
