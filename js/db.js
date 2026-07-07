/**
 * db.js – tynn promise-basert innpakning rundt IndexedDB.
 *
 * Lagre (object stores):
 *   exercises, workouts, sets, bodyweight, aerobic, sleep, mood  – data (keyPath: id)
 *   settings                               – nøkkel/verdi (keyPath: key)
 *   queue                                  – synk-kø (autoIncrement)
 *   meta                                   – intern metadata (keyPath: key)
 */

const DB_NAME = 'treningsjournal';
const DB_VERSION = 4;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;
      if (oldVersion < 1) {
        const ex = db.createObjectStore('exercises', { keyPath: 'id' });
        ex.createIndex('category', 'category');
        const wo = db.createObjectStore('workouts', { keyPath: 'id' });
        wo.createIndex('date', 'date');
        const st = db.createObjectStore('sets', { keyPath: 'id' });
        st.createIndex('workoutId', 'workoutId');
        st.createIndex('exerciseId', 'exerciseId');
        const bw = db.createObjectStore('bodyweight', { keyPath: 'id' });
        bw.createIndex('date', 'date');
        db.createObjectStore('settings', { keyPath: 'key' });
        db.createObjectStore('queue', { keyPath: 'qid', autoIncrement: true });
        db.createObjectStore('meta', { keyPath: 'key' });
      }
      if (oldVersion < 2 && !db.objectStoreNames.contains('aerobic')) {
        const ae = db.createObjectStore('aerobic', { keyPath: 'id' });
        ae.createIndex('date', 'date');
      }
      if (oldVersion < 3 && !db.objectStoreNames.contains('sleep')) {
        const sl = db.createObjectStore('sleep', { keyPath: 'id' });
        sl.createIndex('date', 'date');
      }
      if (oldVersion < 4 && !db.objectStoreNames.contains('mood')) {
        const md = db.createObjectStore('mood', { keyPath: 'id' });
        md.createIndex('date', 'date');
        md.createIndex('workoutId', 'workoutId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    const result = fn(store);
    t.oncomplete = () => resolve(result.__value !== undefined ? result.__value : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

function reqToValue(request, holder) {
  request.onsuccess = () => { holder.__value = request.result; };
  return holder;
}

/** Henter én rad. */
export function get(store, key) {
  const holder = {};
  return tx(store, 'readonly', (s) => reqToValue(s.get(key), holder));
}

/** Henter alle rader i et lager. */
export function getAll(store) {
  const holder = {};
  return tx(store, 'readonly', (s) => reqToValue(s.getAll(), holder));
}

/** Henter alle rader via indeks. */
export function getByIndex(store, indexName, value) {
  const holder = {};
  return tx(store, 'readonly', (s) => reqToValue(s.index(indexName).getAll(value), holder));
}

/** Lagrer (upsert) én rad. */
export function put(store, obj) {
  return tx(store, 'readwrite', (s) => { s.put(obj); return obj; });
}

/** Lagrer mange rader i én transaksjon. */
export function putMany(store, items) {
  return tx(store, 'readwrite', (s) => { items.forEach((i) => s.put(i)); return items.length; });
}

/** Sletter én rad. */
export function remove(store, key) {
  return tx(store, 'readwrite', (s) => { s.delete(key); return key; });
}

/** Tømmer et lager helt. */
export function clearStore(store) {
  return tx(store, 'readwrite', (s) => { s.clear(); return true; });
}

/** Tømmer et lager og fyller det med nye rader (atomisk). */
export function replaceAll(store, items) {
  return tx(store, 'readwrite', (s) => {
    s.clear();
    items.forEach((i) => s.put(i));
    return items.length;
  });
}

/* ---------- Synk-kø ---------- */

/**
 * Legger en operasjon i synk-køen.
 * @param {{entity:string, op:'upsert'|'delete', data:object}} operation
 */
export function enqueue(operation) {
  return put('queue', { ...operation, ts: Date.now() });
}

/** Alle ventende operasjoner, eldst først. */
export function getQueue() {
  return getAll('queue');
}

/** Fjerner utførte operasjoner fra køen. */
export function removeQueueItems(qids) {
  return tx('queue', 'readwrite', (s) => { qids.forEach((id) => s.delete(id)); return qids.length; });
}

/** Antall ventende operasjoner. */
export async function queueCount() {
  const items = await getAll('queue');
  return items.length;
}

/* ---------- Meta ---------- */

export async function getMeta(key, def = null) {
  const row = await get('meta', key);
  return row ? row.value : def;
}

export function setMeta(key, value) {
  return put('meta', { key, value });
}
