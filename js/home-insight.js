/**
 * home-insight.js – infolinje(r) på hjem: momentum-tips og drypp fra Innsikt.
 */

import { getMessages, balanceSince } from './assistant.js';
import { PILLAR_WEIGHTS } from './momentum.js';
import { volumeTrend30 } from './stats.js';
import { fmtNum, fmtMacroG, windowStartStr } from './utils.js';

const PILLAR_LABELS = {
  strength: 'Styrketrening',
  protein: 'Protein',
  sleep: 'Søvn',
  aerobic: 'Aerob',
  lactate: 'Anaerob',
};

/** @typedef {{ text: string, href?: string }} HomeInfoSlide */

function pushUnique(list, slide) {
  if (!slide?.text) return;
  const key = slide.text.trim();
  if (list.some((s) => s.text.trim() === key)) return;
  list.push(slide);
}

function weakestPillarLabel(pillars) {
  let best = null;
  for (const [key, weight] of Object.entries(PILLAR_WEIGHTS)) {
    const gap = (1 - (pillars[key] ?? 0)) * weight;
    if (!best || gap > best.gap) best = { key, gap };
  }
  if (!best || best.gap < 0.06) return null;
  return PILLAR_LABELS[best.key];
}

/** @returns {HomeInfoSlide[]} */
function collectMomentumSlides({
  sets,
  pillars,
  proteinG,
  proteinGoal,
  momentumToday,
  momentumChange,
  series,
}) {
  /** @type {HomeInfoSlide[]} */
  const slides = [];

  if (!sets.length) {
    pushUnique(slides, { text: 'Start med styrketrening under Momentum.' });
    return slides;
  }

  const proteinLeft = proteinGoal > 0 ? Math.max(0, Math.round((proteinGoal - proteinG) * 10) / 10) : 0;
  if (proteinLeft >= 25 && (pillars.protein ?? 0) < 0.85) {
    pushUnique(slides, { text: `Ca. ${fmtMacroG(proteinLeft)} g protein igjen til målet i dag.`, href: '#/inntak' });
  }

  if ((pillars.sleep ?? 0) < 0.3) {
    pushUnique(slides, { text: 'Ingen søvn registrert i natt — logg under Momentum.', href: '#/sovn' });
  }

  const weak = weakestPillarLabel(pillars);
  if (weak) {
    pushUnique(slides, { text: `${weak} har størst effekt på scoren i dag.` });
  }

  if ((pillars.strength ?? 0) < 0.5) {
    pushUnique(slides, {
      text: 'Størst utbytte av styrke: tren hver kategori ca. 2 ganger i uken, helst med tre dager mellom.',
      href: '#/styrketrening',
    });
  }
  if ((pillars.aerobic ?? 0) < 0.5) {
    pushUnique(slides, { text: 'Aerob aktivitet teller mot momentum — logg minutter.', href: '#/aerob' });
  }
  if ((pillars.lactate ?? 0) < 0.5) {
    pushUnique(slides, { text: 'Anaerob innsats (f.eks. intervaller) kan heve scoren.', href: '#/anaerob' });
  }

  const trend = volumeTrend30(sets);
  if (trend !== null && Math.abs(trend) >= 8) {
    const dir = trend > 0 ? 'opp' : 'ned';
    pushUnique(slides, {
      text: `Volum ${dir} ${fmtNum(Math.abs(trend), 0)} % siste måned.`,
      href: '#/innsikt',
    });
  }

  if (series?.length >= 7) {
    const vals = series.map((p) => p.value);
    const max = Math.max(...vals);
    if (momentumToday >= max - 1 && momentumToday >= 55) {
      pushUnique(slides, { text: 'Du er nær beste momentum på tre uker.' });
    }
  }

  if (momentumChange > 0) {
    pushUnique(slides, { text: `Momentum +${momentumChange} siden i går — fortsett.` });
  } else if (momentumChange < 0) {
    pushUnique(slides, { text: `Momentum ${momentumChange} siden i går — logg det som gjenstår.` });
  }

  pushUnique(slides, { text: 'Logg det som gjenstår under Momentum.' });
  return slides;
}

/** @returns {HomeInfoSlide[]} */
function collectInnsiktSlides(sets) {
  /** @type {HomeInfoSlide[]} */
  const slides = [];

  for (const m of getMessages(sets)) {
    if (m.text.startsWith('Velkommen')) {
      pushUnique(slides, { text: m.text, href: '#/styrketrening' });
      continue;
    }
    pushUnique(slides, { text: m.text, href: '#/innsikt' });
  }

  if (sets.length) {
    const since7 = windowStartStr(7);
    const balance = balanceSince(sets, since7);
    if (balance.missing.length) {
      const names = balance.missing.map((k) => k.name.toLowerCase()).join(', ');
      pushUnique(slides, {
        text: `Mangler siste 7 dager: ${names}.`,
        href: '#/innsikt',
      });
    }
  }

  return slides;
}

function interleaveSlides(momentum, innsikt) {
  /** @type {HomeInfoSlide[]} */
  const out = [];
  let mi = 0;
  let ii = 0;
  while (mi < momentum.length || ii < innsikt.length) {
    if (mi < momentum.length) out.push(momentum[mi++]);
    if (ii < innsikt.length) out.push(innsikt[ii++]);
  }
  return out;
}

/**
 * Liste for roterende infofelt på hjem (momentum + Innsikt).
 * @returns {HomeInfoSlide[]}
 */
export function buildHomeInfoRotation({
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
    return [{ text: 'Koble appen til Google Sheets under Innstillinger.', href: '#/innstillinger' }];
  }

  if (syncState && !syncState.online && syncState.pending > 0) {
    return [{ text: `${syncState.pending} endringer venter — synk når du er på nett.` }];
  }

  if (syncState?.lastError) {
    return [{ text: `Synk-feil: ${syncState.lastError}`, href: '#/innstillinger' }];
  }

  const momentum = collectMomentumSlides({
    sets,
    pillars,
    proteinG,
    proteinGoal,
    momentumToday,
    momentumChange,
    series,
  });

  const innsikt = collectInnsiktSlides(sets).filter(
    (s) => !momentum.some((m) => m.text.trim() === s.text.trim()),
  );

  const merged = interleaveSlides(momentum, innsikt);
  return merged.length ? merged : [{ text: 'Logg det som gjenstår under Momentum.' }];
}

/**
 * @returns {HomeInfoSlide}
 */
export function pickHomeInsight(params) {
  return buildHomeInfoRotation(params)[0];
}
