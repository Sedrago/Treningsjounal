/**
 * partner-momentum.js – momentum-deling med partnere (kun score-serie, lokalt + relay).
 */

import * as relay from './relay-api.js';

const STORAGE_KEY = 'tj_partnerMomentum';

export const PARTNER_LINE_COLORS = ['#5b9bd5', '#6eb8a8', '#9a8fd4', '#c4a574', '#88a0b8'];

function defaultState() {
  return {
    showByDefault: true,
    panelOpen: false,
    visible: {},
    lastSeenUpdated: {},
    cache: {},
  };
}

export function loadPartnerMomentumState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    return defaultState();
  }
}

export function savePartnerMomentumState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function partnerColor(username) {
  let h = 0;
  const s = String(username || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return PARTNER_LINE_COLORS[Math.abs(h) % PARTNER_LINE_COLORS.length];
}

export function partnerDisplayName(username) {
  return String(username || '').replace(/^@/, '');
}

/** @param {Array<{ date: string, value: number }>} selfSeries */
export function alignPartnerToSelfSeries(selfSeries, partnerSeries) {
  const byDate = new Map((partnerSeries || []).map((p) => [p.date, p.value]));
  return selfSeries.map((p) => {
    const v = byDate.get(p.date);
    return v == null || !Number.isFinite(Number(v)) ? null : Number(v);
  });
}

export function hasUnreadPartnerSync(state) {
  for (const [username, entry] of Object.entries(state.cache || {})) {
    if (!entry?.updatedAt) continue;
    if (state.lastSeenUpdated[username] !== entry.updatedAt) return true;
  }
  return false;
}

export function markPartnerSyncSeen(state) {
  const next = { ...state, lastSeenUpdated: { ...state.lastSeenUpdated } };
  for (const [username, entry] of Object.entries(state.cache || {})) {
    if (entry?.updatedAt) next.lastSeenUpdated[username] = entry.updatedAt;
  }
  return next;
}

export async function loadPartnerUsernames() {
  if (!relay.canUseRelayInbox()) return [];
  const { partners } = await relay.relayListPartners();
  return partners || [];
}

/**
 * @param {Array<{ date: string, value: number }>} ownSeries
 * @returns {Promise<{ state: object, partnerUsernames: string[] }>}
 */
export async function syncPartnerMomentum(ownSeries) {
  let state = loadPartnerMomentumState();
  if (!relay.canUseRelayInbox()) {
    return { state, partnerUsernames: [] };
  }

  const series = (ownSeries || []).map((p) => ({
    date: p.date,
    value: Math.round(Number(p.value) || 0),
  }));

  const { partners: partnerUsernames } = await relay.relayListPartners();
  const names = partnerUsernames || [];

  if (series.length >= 2) {
    await relay.relayPushMomentum({ series });
  }

  const fetched = await relay.relayFetchPartnersMomentum();
  const nextCache = { ...state.cache };

  for (const row of fetched.partners || []) {
    const u = row.username;
    if (!u) continue;
    nextCache[u] = {
      updatedAt: row.updatedAt || '',
      series: row.series || [],
    };
    if (state.visible[u] === undefined) state.visible[u] = true;
  }

  for (const key of Object.keys(nextCache)) {
    if (!names.includes(key)) delete nextCache[key];
  }

  state = {
    ...state,
    cache: nextCache,
    visible: { ...state.visible },
  };
  for (const u of names) {
    if (state.visible[u] === undefined) state.visible[u] = true;
  }

  savePartnerMomentumState(state);
  return { state, partnerUsernames: names };
}

const PARTNER_SYNC_TIMEOUT_MS = 12_000;

/** Relay-synk uten å blokkere UI (timeout ved treg/kald relay). */
export function runPartnerMomentumSyncInBackground(ownSeries, onSuccess) {
  if (!relay.canUseRelayInbox()) return;
  const work = syncPartnerMomentum(ownSeries);
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Partner sync timeout')), PARTNER_SYNC_TIMEOUT_MS);
  });
  Promise.race([work, timeout])
    .then((result) => {
      if (onSuccess) onSuccess(result);
    })
    .catch((err) => {
      console.warn('[FlowBooster] Partner momentum:', err?.message || err);
    });
}

export function listPartnersForDisplay(state, partnerUsernames) {
  return (partnerUsernames || []).map((username) => ({
    username,
    color: partnerColor(username),
    label: partnerDisplayName(username),
    series: state.cache[username]?.series || [],
    updatedAt: state.cache[username]?.updatedAt || '',
    visible: state.visible[username] !== false,
  }));
}

export function buildMomentumOverlays(selfLabeledSeries, state, partners) {
  const base = selfLabeledSeries.map((p) => ({ label: p.label, date: p.date, value: p.value }));

  const showChart = (state.showByDefault || state.panelOpen)
    && partners.some((p) => p.visible);

  if (!showChart) {
    return { points: base, overlays: [] };
  }

  const overlays = partners
    .filter((p) => p.visible)
    .map((p) => ({
      id: p.username,
      color: p.color,
      values: alignPartnerToSelfSeries(selfLabeledSeries, p.series),
    }));

  return { points: base, overlays };
}
