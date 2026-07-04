/**
 * api.js – klient mot Google Apps Script Web App.
 *
 * Apps Script har begrenset CORS-støtte. Strategi:
 *   - ping og pull: GET (fungerer pålitelig i Safari/iPhone)
 *   - push: POST uten Content-Type-header (unngår CORS preflight)
 *
 * Web App-URL og API-nøkkel lagres i localStorage.
 */

const URL_KEY = 'tj_apiUrl';
const APIKEY_KEY = 'tj_apiKey';

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
  // Fjern trailing slash.
  u = u.replace(/\/+$/, '');
  // /dev krever innlogging – /exec er riktig for produksjon.
  if (u.endsWith('/dev')) u = u.slice(0, -4) + '/exec';
  return u;
}

/** Parser JSON-svar fra serveren. */
async function parseResponse(res) {
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    const hint = text.includes('<!DOCTYPE') || text.includes('<html')
      ? ' Serveren returnerte HTML i stedet for JSON – sjekk at URL-en slutter på /exec og at tilgang er satt til «Alle».'
      : '';
    throw new Error(`Ugyldig svar fra server (${res.status}).${hint}`);
  }
  if (!json.ok) throw new Error(json.error || 'Ukjent serverfeil');
  return json.data;
}

/**
 * GET-kall – brukes for ping og pull (CORS-vennlig).
 */
async function callGet(action, payload = {}) {
  const params = new URLSearchParams({
    key: getApiKey(),
    action,
    payload: JSON.stringify(payload),
  });
  const res = await fetch(`${getApiUrl()}?${params.toString()}`, {
    method: 'GET',
    redirect: 'follow',
  });
  return parseResponse(res);
}

/**
 * POST-kall – brukes for push (større payload).
 * Ingen Content-Type-header: da unngås CORS preflight i de fleste nettlesere.
 */
async function callPost(action, payload = {}) {
  const res = await fetch(getApiUrl(), {
    method: 'POST',
    body: JSON.stringify({ key: getApiKey(), action, payload }),
    redirect: 'follow',
  });
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
    // Lesende kall via GET (best Safari-støtte).
    if (action === 'ping' || action === 'pull') {
      return await callGet(action, payload);
    }
    return await callPost(action, payload);
  } catch (err) {
    // «Load failed» / «Failed to fetch» = nettverk eller CORS blokkert.
    if (err instanceof TypeError || /load failed|failed to fetch|networkerror/i.test(err.message)) {
      throw new Error(
        'Kunne ikke nå serveren. Sjekk: (1) URL slutter på /exec, '
        + '(2) tilgang er «Alle», (3) du har oppdatert Kode.gs med nyeste versjon og redeployet.'
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

/** Sender en liste operasjoner til serveren. */
export function push(ops) {
  return call('push', { ops });
}
