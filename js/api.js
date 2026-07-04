/**
 * api.js – klient mot Google Apps Script Web App.
 *
 * Apps Script redirecter POST-kall og mister body underveis – da svarer
 * doGet med statustekst (HTTP 200, men ikke JSON). Løsning: send alt
 * som GET med én urlencodet «data»-parameter i query-strengen.
 */

const URL_KEY = 'tj_apiUrl';
const APIKEY_KEY = 'tj_apiKey';

/** Konservativ grense for GET-URL (Safari ~2048 tegn). */
const MAX_URL_LEN = 1800;

export function getApiUrl() {
  return localStorage.getItem(URL_KEY) || '';
}

export function setApiUrl(url) {
  localStorage.setItem(URL_KEY, normalizeUrl(url));
}

export function getApiKey() {
  return localStorage.getItem(APIKEY_KEY) || '';
}

export function setApiKey(key) {
  localStorage.setItem(APIKEY_KEY, key.trim());
}

export function isConfigured() {
  return Boolean(getApiUrl() && getApiKey());
}

/** Normaliserer Web App-URL (trim, /dev → /exec). */
export function normalizeUrl(url) {
  let u = String(url || '').trim();
  u = u.replace(/\/+$/, '');
  if (u.endsWith('/dev')) u = u.slice(0, -4) + '/exec';
  return u;
}

/** Bygger full GET-URL for et API-kall. */
function buildUrl(action, payload = {}) {
  const envelope = { key: getApiKey(), action, payload };
  const params = new URLSearchParams({ data: JSON.stringify(envelope) });
  return `${getApiUrl()}?${params.toString()}`;
}

/** Parser JSON-svar fra serveren. */
async function parseResponse(res) {
  const text = (await res.text()).trim();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    if (text.includes('Treningsjournal-API kjører')) {
      throw new Error(
        'Serveren svarer uten API-modus. Lim inn nyeste Kode.gs i Apps Script '
        + 'og redeploy (Distribuer → Administrer distribusjoner → Ny versjon).'
      );
    }
    if (text.includes('<!DOCTYPE') || text.includes('<html')) {
      throw new Error(
        'Serveren returnerte en nettside i stedet for JSON. '
        + 'Sjekk at URL-en slutter på /exec og at tilgang er «Alle».'
      );
    }
    throw new Error(`Ugyldig svar fra server (${res.status}).`);
  }
  if (!json.ok) throw new Error(json.error || 'Ukjent serverfeil');
  return json.data;
}

/** GET-kall – eneste metode som fungerer pålitelig mot Apps Script Web Apps. */
async function callGet(action, payload = {}) {
  const url = buildUrl(action, payload);
  if (url.length > MAX_URL_LEN) {
    throw new Error('URL_FOR_STOR');
  }
  const res = await fetch(url, { method: 'GET', redirect: 'follow' });
  return parseResponse(res);
}

/**
 * Utfører et API-kall.
 * @param {string} action  f.eks. 'ping', 'pull', 'push'
 * @param {object} payload
 */
export async function call(action, payload = {}) {
  if (!isConfigured()) throw new Error('API ikke konfigurert');
  if (!getApiUrl().includes('script.google.com')) {
    throw new Error('URL-en ser feil ut – den skal starte med https://script.google.com/macros/s/…');
  }

  try {
    return await callGet(action, payload);
  } catch (err) {
    if (err instanceof TypeError || /load failed|failed to fetch|networkerror/i.test(err.message)) {
      throw new Error(
        'Kunne ikke nå serveren. Sjekk URL (/exec), tilgang («Alle») og at Kode.gs er redeployet.'
      );
    }
    throw err;
  }
}

/** Tester tilkoblingen. */
export function ping() {
  return call('ping');
}

/** Henter hele datasettet fra Google Sheets. */
export function pullAll() {
  return call('pull');
}

/**
 * Sender operasjoner til serveren. Deler opp i bolker hvis URL-en blir for lang.
 */
export async function push(ops) {
  if (!ops.length) return { applied: 0, results: [] };
  const batches = chunkOpsForUrl(ops);
  const allResults = [];
  for (const batch of batches) {
    const result = await call('push', { ops: batch });
    allResults.push(result);
  }
  return { applied: ops.length, results: allResults };
}

/** Deler ops i bolker som passer innenfor MAX_URL_LEN. */
function chunkOpsForUrl(ops) {
  const batches = [];
  let current = [];
  for (const op of ops) {
    const tryBatch = [...current, op];
    try {
      if (buildUrl('push', { ops: tryBatch }).length <= MAX_URL_LEN) {
        current = tryBatch;
      } else {
        if (current.length) batches.push(current);
        current = [op];
        if (buildUrl('push', { ops: current }).length > MAX_URL_LEN) {
          throw new Error('En enkelt synk-operasjon er for stor til å sendes.');
        }
      }
    } catch {
      if (current.length) batches.push(current);
      current = [op];
    }
  }
  if (current.length) batches.push(current);
  return batches;
}
