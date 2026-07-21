/**
 * home-insight.js – én prioritert infolinje på hjem (under makro-barer).
 */

import { getMessages } from './assistant.js';
import { PILLAR_WEIGHTS } from './momentum.js';
import { volumeTrend30 } from './stats.js';
import { fmtNum } from './utils.js';

const PILLAR_LABELS = {
  strength: 'Styrketrening',
  protein: 'Protein',
  sleep: 'Søvn',
  aerobic: 'Aerob',
  lactate: 'Anaerob',
};

function weakestPillarLabel(pillars) {
  let best = null;
  for (const [key, weight] of Object.entries(PILLAR_WEIGHTS)) {
    const gap = (1 - (pillars[key] ?? 0)) * weight;
    if (!best || gap > best.gap) best = { key, gap };
  }
  if (!best || best.gap < 0.06) return null;
  return PILLAR_LABELS[best.key];
}

function aggregatedTrainingInsight(sets) {
  const messages = getMessages(sets);
  for (const m of messages) {
    if (m.text.startsWith('Velkommen')) return { text: m.text, href: '#/styrketrening' };
    if (m.text.includes('ikke trent') || m.text.includes('ikke gjort')) {
      return { text: 'Noen bevegelsesmønstre har hvilet lenge — se Innsikt.', href: '#/innsikt' };
    }
    if (m.icon === '⚖️') {
      return { text: 'Push og pull er litt ujevnt siste uke — se Innsikt.', href: '#/innsikt' };
    }
    if (m.icon === '📈' || m.icon === '📉') return { text: m.text, href: '#/innsikt' };
  }
  return null;
}

/**
 * @returns {{ text: string, href?: string }}
 */
export function pickHomeInsight({
  sets,
  pillars,
  proteinG,
  proteinGoal,
  momentumToday,
  momentumChange,
  series,
  apiConfigured,
  syncState,
}) {
  if (!apiConfigured) {
    return { text: 'Koble appen til Google Sheets under Innstillinger.', href: '#/innstillinger' };
  }

  if (syncState && !syncState.online && syncState.pending > 0) {
    return { text: `${syncState.pending} endringer venter — synk når du er på nett.` };
  }

  if (syncState?.lastError) {
    return { text: `Synk-feil: ${syncState.lastError}`, href: '#/innstillinger' };
  }

  if (!sets.length) {
    return { text: 'Start med styrketrening under Momentum.' };
  }

  const proteinLeft = proteinGoal > 0 ? Math.max(0, Math.round(proteinGoal - proteinG)) : 0;
  if (proteinLeft >= 25 && (pillars.protein ?? 0) < 0.85) {
    return { text: `Ca. ${proteinLeft} g protein igjen til målet i dag.` };
  }

  if ((pillars.sleep ?? 0) < 0.3) {
    return { text: 'Ingen søvn registrert i natt — logg under Momentum.' };
  }

  const weak = weakestPillarLabel(pillars);
  if (weak) {
    return { text: `${weak} har størst effekt på scoren i dag.` };
  }

  const training = aggregatedTrainingInsight(sets);
  if (training) return training;

  const trend = volumeTrend30(sets);
  if (trend !== null && Math.abs(trend) >= 8) {
    const dir = trend > 0 ? 'opp' : 'ned';
    return { text: `Volum ${dir} ${fmtNum(Math.abs(trend), 0)} % siste måned.`, href: '#/innsikt' };
  }

  if (series?.length >= 7) {
    const vals = series.map((p) => p.value);
    const max = Math.max(...vals);
    if (momentumToday >= max - 1 && momentumToday >= 55) {
      return { text: 'Du er nær beste momentum på tre uker.' };
    }
  }

  if (momentumChange > 0) {
    return { text: `Momentum ${momentumChange > 0 ? '+' : ''}${momentumChange} siden i går — fortsett.` };
  }

  return { text: 'Logg det som gjenstår under Momentum.' };
}
