/**
 * api.js – klient mot Google Apps Script Web App.
 *
 * Alle kall er POST med content-type text/plain for å unngå CORS-preflight,
 * som Apps Script ikke støtter. Payload og svar er JSON.
 *
 * Web App-URL og API-nøkkel lagres i localStorage slik at de er
 * tilgjengelige før IndexedDB er åpnet.
 */

const URL_KEY = 'tj_apiUrl';
const APIKEY_KEY = 'tj_apiKey';

export function getApiUrl() {
  return localStorage.getItem(URL_KEY) || '';
}

export function setApiUrl(url) {
  localStorage.setItem(URL_KEY, url.trim());
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

/**
 * Utfører et API-kall.
 * @param {string} action  f.eks. 'ping', 'pull', 'push'
 * @param {object} payload
 */
export async function call(action, payload = {}) {
  if (!isConfigured()) throw new Error('API ikke konfigurert');
  const res = await fetch(getApiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ key: getApiKey(), action, payload }),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Ukjent serverfeil');
  return json.data;
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
