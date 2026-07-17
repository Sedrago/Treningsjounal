/**
 * setup-share.js – personlig oppsettskode / QR for Google Sheets-tilkobling.
 */

import * as api from './api.js';
import * as relay from './relay-api.js';

export const SETUP_FORMAT = 'treningsjournal-setup';
export const SETUP_VERSION = 1;

function toBase64Url(json) {
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(code) {
  const trimmed = String(code || '').trim();
  if (!trimmed) throw new Error('Tom oppsettskode');
  const b64 = trimmed.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  return decodeURIComponent(escape(atob(b64 + pad)));
}

/** Bygger portable oppsett-payload fra gjeldende innstillinger. */
export function buildSetupPayload({ includeRelay = true } = {}) {
  const apiUrl = api.getApiUrl();
  const apiKey = api.getApiKey();
  if (!apiUrl || !apiKey) throw new Error('Fyll inn Web App-URL og API-nøkkel først');

  const payload = {
    format: SETUP_FORMAT,
    version: SETUP_VERSION,
    exportedAt: new Date().toISOString(),
    apiUrl,
    apiKey,
  };

  if (includeRelay && relay.isRelayConfigured()) {
    payload.relayUrl = relay.getRelayUrl();
  }

  if (includeRelay && relay.hasRelayIdentity()) {
    const { username, deviceSecret } = relay.getRelayIdentity();
    payload.relayUsername = username;
    payload.relayDeviceSecret = deviceSecret;
  }

  return payload;
}

export function setupShareCode(payload) {
  return toBase64Url(JSON.stringify(payload));
}

export function parseSetupShareCode(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('Tom oppsettskode');
  if (trimmed.startsWith('{')) {
    const data = JSON.parse(trimmed);
    validateSetupPayload(data);
    return data;
  }
  return validateSetupPayload(JSON.parse(fromBase64Url(trimmed)));
}

function validateSetupPayload(data) {
  if (!data || typeof data !== 'object') throw new Error('Ugyldig oppsettskode');
  if (data.format !== SETUP_FORMAT) throw new Error('Ukjent oppsettsformat');
  if (!data.apiUrl || !String(data.apiUrl).includes('script.google.com')) {
    throw new Error('Mangler gyldig Web App-URL');
  }
  if (!data.apiKey || !String(data.apiKey).trim()) throw new Error('Mangler API-nøkkel');
  return data;
}

/** Deep link for QR og e-post (kode i query – fjernes etter import). */
export function setupImportUrl(code) {
  const base = `${location.origin}${location.pathname}`.replace(/\/+$/, '/');
  return `${base}#/oppsett?c=${encodeURIComponent(code)}`;
}

export function qrImageUrl(text, size = 280) {
  return relay.qrImageUrl(text, size);
}

export function maskApiKey(key) {
  const k = String(key || '');
  if (k.length <= 4) return '••••';
  return `••••${k.slice(-4)}`;
}

export function shortenUrl(url) {
  const u = String(url || '');
  if (u.length <= 48) return u;
  return `${u.slice(0, 28)}…${u.slice(-14)}`;
}

/** Lagrer oppsett lokalt og tester tilkoblingen. */
export async function applySetupPayload(data) {
  const payload = validateSetupPayload(data);
  api.setApiUrl(payload.apiUrl);
  api.setApiKey(payload.apiKey);
  if (payload.relayUrl) relay.setRelayUrl(payload.relayUrl);
  if (payload.relayUsername && payload.relayDeviceSecret) {
    await relay.setRelayIdentity({
      username: payload.relayUsername,
      deviceSecret: payload.relayDeviceSecret,
    });
  }
  await api.ping();
  return payload;
}

/** Fjerner oppsettskode fra adresselinjen etter import. */
export function clearSetupCodeFromHash() {
  if (!location.hash.includes('c=')) return;
  history.replaceState(null, '', `${location.pathname}${location.search}#/oppsett`);
}
