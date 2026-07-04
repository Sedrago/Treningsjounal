/**
 * api.js – klient mot Google Apps Script Web App.
 *
 * Apps Script har begrenset CORS-støtte. Vi sender derfor POST med
 * urlencoded body (data=…) uten Content-Type-header – det unngår
 * preflight og fungerer på tvers av Safari, Chrome og GitHub Pages.
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
  u = u.replace(/\/+$/, '');
  if (u.endsWith('/dev')) u = u.slice(0, -4) + '/exec';
  return u;
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

/**
 * POST med urlencoded body – anbefalt metode for Apps Script Web Apps.
 * Ingen Content-Type-header (unngår CORS preflight).
 */
async function callPostForm(action, payload = {}) {
  const envelope = { key: getApiKey(), action, payload };
  const body = `data=${encodeURIComponent(JSON.stringify(envelope))}`;
  const res = await fetch(getApiUrl(), {
    method: 'POST',
    body,
    redirect: 'follow',
  });
  return parseResponse(res);
}

/**
 * GET-reserve – brukes bare hvis POST feiler med nettverksfeil.
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
    return await callPostForm(action, payload);
  } catch (err) {
    // Nettverksfeil – prøv GET som reserve (ping/pull).
    if ((err instanceof TypeError || /load failed|failed to fetch|networkerror/i.test(err.message))
        && (action === 'ping' || action === 'pull')) {
      return callGet(action, payload);
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
