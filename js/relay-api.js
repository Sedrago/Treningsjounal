/**
 * relay-api.js – klient mot Treningsjournal Relay (programdeling / QR).
 *
 * Henting (meta/fetch) krever bare relay-URL.
 * Publisering krever i tillegg publiseringsnøkkel.
 */

const RELAY_URL_KEY = 'tj_relayUrl';
const RELAY_PUBLISH_KEY = 'tj_relayPublishKey';

export function getRelayUrl() {
  return localStorage.getItem(RELAY_URL_KEY) || '';
}

export function setRelayUrl(url) {
  localStorage.setItem(RELAY_URL_KEY, String(url || '').trim().replace(/\/+$/, ''));
}

export function getRelayPublishKey() {
  return localStorage.getItem(RELAY_PUBLISH_KEY) || '';
}

export function setRelayPublishKey(key) {
  localStorage.setItem(RELAY_PUBLISH_KEY, String(key || '').trim());
}

export function isRelayConfigured() {
  return Boolean(getRelayUrl().includes('script.google.com'));
}

export function canPublishToRelay() {
  return isRelayConfigured() && Boolean(getRelayPublishKey());
}

function normalizeRelayUrl(url) {
  let u = String(url || '').trim().replace(/\/+$/, '');
  if (u.endsWith('/dev')) u = u.slice(0, -4) + '/exec';
  return u;
}

/** Deep link for QR og deling. */
export function programImportUrl(code) {
  const base = `${location.origin}${location.pathname}`.replace(/\/+$/, '/');
  return `${base}#/program?k=${encodeURIComponent(String(code || '').trim().toUpperCase())}`;
}

/** QR-bilde via QuickChart (krever nett ved visning). */
export function qrImageUrl(text, size = 280) {
  return `https://quickchart.io/qr?text=${encodeURIComponent(text)}&size=${size}&margin=2&dark=000000&light=ffffff`;
}

async function parseRelayResponse(res) {
  const text = (await res.text()).trim();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    if (text.includes('Treningsjournal Relay kjører')) {
      throw new Error('Relay svarer uten API-modus. Sjekk at Relay.gs er deployet.');
    }
    throw new Error(`Ugyldig svar fra relay (${res.status}).`);
  }
  if (!json.ok) throw new Error(json.error || 'Ukjent relay-feil');
  return json.data;
}

async function relayGet(action, payload = {}) {
  const url = getRelayUrl();
  if (!url) throw new Error('Relay-URL er ikke satt');
  const params = new URLSearchParams({
    data: JSON.stringify({ action, payload }),
  });
  const res = await fetch(`${normalizeRelayUrl(url)}?${params.toString()}`, {
    method: 'GET',
    redirect: 'follow',
  });
  return parseRelayResponse(res);
}

async function relayPost(action, payload = {}) {
  const url = getRelayUrl();
  const key = getRelayPublishKey();
  if (!url) throw new Error('Relay-URL er ikke satt');
  if (!key) throw new Error('Publiseringsnøkkel mangler');
  const envelope = { key, action, payload };
  const res = await fetch(normalizeRelayUrl(url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(JSON.stringify(envelope))}`,
    redirect: 'follow',
  });
  return parseRelayResponse(res);
}

export function relayPing() {
  return relayGet('ping');
}

export function relayMeta(code) {
  return relayGet('meta', { code: String(code || '').trim() });
}

export function relayFetch(code, pin) {
  const payload = { code: String(code || '').trim() };
  if (pin != null && String(pin).trim()) payload.pin = String(pin).trim();
  return relayGet('fetch', payload);
}

export function relayPublish({ program, title, code, expiresInDays = 30, pin, replaceIfExists = true }) {
  return relayPost('publish', {
    program,
    title,
    code: code ? String(code).trim().toUpperCase() : undefined,
    expiresInDays,
    pin: pin ? String(pin).trim() : undefined,
    replaceIfExists,
  });
}

export function relayUpdate(opts) {
  return relayPost('update', { ...opts, replaceIfExists: true });
}

export function relayUnpublish(code) {
  return relayPost('unpublish', { code: String(code || '').trim() });
}
