/**
 * relay-api.js – klient mot Treningsjournal Relay (programdeling / QR / innboks).
 *
 * Henting (meta/fetch) krever bare relay-URL.
 * Publisering krever publiseringsnøkkel.
 * Partner-innboks krever registrert brukernavn + enhetsnøkkel.
 */

const RELAY_URL_KEY = 'tj_relayUrl';
const RELAY_PUBLISH_KEY = 'tj_relayPublishKey';
const RELAY_IDENTITY_KEY = 'tj_relayIdentity';

/** Synkroniseres via Settings-arket (samme regneark som journalen). */
export const RELAY_SETTING_USERNAME = 'relayUsername';
export const RELAY_SETTING_DEVICE_SECRET = 'relayDeviceSecret';

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

export function getRelayIdentity() {
  try {
    const raw = localStorage.getItem(RELAY_IDENTITY_KEY);
    if (!raw) return { username: '', deviceSecret: '' };
    const data = JSON.parse(raw);
    return {
      username: String(data.username || ''),
      deviceSecret: String(data.deviceSecret || ''),
    };
  } catch {
    return { username: '', deviceSecret: '' };
  }
}

export async function setRelayIdentity({ username, deviceSecret }, { sync = true } = {}) {
  const next = {
    username: String(username || '').trim().toLowerCase(),
    deviceSecret: String(deviceSecret || '').trim(),
  };
  const current = getRelayIdentity();
  if (current.username === next.username && current.deviceSecret === next.deviceSecret) return;

  localStorage.setItem(RELAY_IDENTITY_KEY, JSON.stringify(next));
  if (sync) {
    const { setSetting } = await import('./store.js');
    await setSetting(RELAY_SETTING_USERNAME, next.username);
    await setSetting(RELAY_SETTING_DEVICE_SECRET, next.deviceSecret);
  }
}

export async function clearRelayIdentity({ sync = true } = {}) {
  localStorage.removeItem(RELAY_IDENTITY_KEY);
  if (sync) {
    const { setSetting } = await import('./store.js');
    await setSetting(RELAY_SETTING_USERNAME, '');
    await setSetting(RELAY_SETTING_DEVICE_SECRET, '');
  }
}

/** Brukes ved synk / oppstart – Settings-arket er kilden. */
export async function applyIdentityFromSettings(username, deviceSecret, { sync = false } = {}) {
  const u = String(username ?? '').trim().toLowerCase();
  const s = String(deviceSecret ?? '').trim();
  if (u && s) {
    await setRelayIdentity({ username: u, deviceSecret: s }, { sync });
    return;
  }
  if (username !== undefined && deviceSecret !== undefined && !u && !s) {
    await clearRelayIdentity({ sync });
  }
}

/** Eksisterende brukere: push lokalt relay-brukernavn til Settings-arket én gang. */
export async function migrateRelayIdentityToSettings() {
  const local = getRelayIdentity();
  if (!local.username || !local.deviceSecret) return;
  const { getSetting } = await import('./store.js');
  const sheetUser = String(getSetting(RELAY_SETTING_USERNAME) ?? '').trim();
  const sheetSecret = String(getSetting(RELAY_SETTING_DEVICE_SECRET) ?? '').trim();
  if (sheetUser && sheetSecret) return;
  await setRelayIdentity(local, { sync: true });
}

export function hasRelayIdentity() {
  const { username, deviceSecret } = getRelayIdentity();
  return Boolean(username && deviceSecret);
}

export function isRelayConfigured() {
  return Boolean(getRelayUrl().includes('script.google.com'));
}

export function canPublishToRelay() {
  return isRelayConfigured() && Boolean(getRelayPublishKey());
}

export function canUseRelayInbox() {
  return isRelayConfigured() && hasRelayIdentity();
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

function authPayload(extra = {}) {
  const { username, deviceSecret } = getRelayIdentity();
  if (!username || !deviceSecret) {
    throw new Error('Registrer brukernavn under Innstillinger → Programdeling');
  }
  return { username, deviceSecret, ...extra };
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

async function relayPost(action, payload = {}, { usePublishKey = true } = {}) {
  const url = getRelayUrl();
  if (!url) throw new Error('Relay-URL er ikke satt');
  const envelope = { action, payload };
  if (usePublishKey) {
    const key = getRelayPublishKey();
    if (!key) throw new Error('Publiseringsnøkkel mangler');
    envelope.key = key;
  }
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

export function relayRegister(username) {
  return relayGet('register', { username: String(username || '').trim() });
}

export function relayInvitePartner(toUsername) {
  return relayGet('invitePartner', authPayload({ toUsername: String(toUsername || '').trim() }));
}

export function relayAcceptPartner(fromUsername) {
  return relayGet('acceptPartner', authPayload({ fromUsername: String(fromUsername || '').trim() }));
}

export function relayRejectPartner(fromUsername) {
  return relayGet('rejectPartner', authPayload({ fromUsername: String(fromUsername || '').trim() }));
}

export function relayListPartners() {
  return relayGet('listPartners', authPayload());
}

export function relayListPendingInvites() {
  return relayGet('listPendingInvites', authPayload());
}

export function relayListInbox() {
  return relayGet('listInbox', authPayload());
}

export function relayFetchInbox(id, { markRead = false } = {}) {
  return relayGet('fetchInbox', authPayload({ id: String(id || ''), markRead }));
}

export function relayDismissInbox(id) {
  return relayGet('dismissInbox', authPayload({ id: String(id || '') }));
}

export function relaySendProgram({ toUsername, program, title, expiresInDays = 30 }) {
  return relayPost('sendProgram', authPayload({
    toUsername: String(toUsername || '').trim(),
    program,
    title,
    expiresInDays,
  }), { usePublishKey: false });
}

/** Sjekker innboks ved oppstart; returnerer antall uleste. */
export async function checkRelayInboxQuietly() {
  if (!canUseRelayInbox()) return 0;
  try {
    const { items } = await relayListInbox();
    return items?.length || 0;
  } catch {
    return 0;
  }
}
