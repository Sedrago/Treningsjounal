/**
 * views/calendar.js – ukekalender med planlagte og loggede styrkeøkter.
 */

import * as store from '../store.js';
import { groupBy } from '../stats.js';
import {
  esc, formatDateShort, datesForWeek, addDaysStr, weekdayShort,
  todayStr, summarizeSet,
} from '../utils.js';

function weekLabel(weekDates) {
  const a = formatDateShort(weekDates[0]);
  const b = formatDateShort(weekDates[6]);
  return a === b ? a : `${a} – ${b}`;
}

function buildWeekHash(fra) {
  return `#/kalender?fra=${fra}`;
}

function renderPlanItems(items, exMap) {
  if (!items?.length) return '';
  return items.map((it) => {
    const ex = exMap.get(it.exerciseId);
    const name = ex?.name || 'Ukjent øvelse';
    return `<li class="kalender-ovelse"><span class="kalender-ovelse-navn">${esc(name)}</span>
      <span class="dus liten">${it.goalSets} sett</span></li>`;
  }).join('');
}

function renderLoggedItems(byEx, units) {
  if (!byEx.size) return '';
  return [...byEx.entries()].map(([, exSets]) => {
    const mode = exSets[0].logMode || 'weight';
    const sorted = exSets.sort((a, b) => a.setNumber - b.setNumber);
    const summary = sorted.map((s) => summarizeSet(s, mode, units)).join(' · ');
    return `<li class="kalender-ovelse kalender-ovelse--logget">
      <span class="kalender-ovelse-navn">${esc(exSets[0].exerciseName)}</span>
      <span class="dus liten">${esc(summary)}</span></li>`;
  }).join('');
}

function dayLink(date, today, hasLog, hasPlan) {
  if (date === today) return '#/styrke';
  if (hasLog) return `#/rediger-okt/${date}`;
  if (hasPlan) return `#/styrke?dato=${date}`;
  return `#/styrke?dato=${date}`;
}

function dayStatus(date, today, hasLog, hasPlan) {
  if (hasLog) return 'logget';
  if (date < today && hasPlan) return 'bommet';
  if (date === today && hasPlan) return 'i-dag';
  if (date === today) return 'i-dag';
  if (date > today && hasPlan) return 'planlagt';
  return 'tom';
}

export async function render(container, params, query = {}) {
  const today = todayStr();
  const anchor = query.fra && /^\d{4}-\d{2}-\d{2}$/.test(query.fra) ? query.fra : today;
  const weekDates = datesForWeek(anchor);
  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];

  const [scheduled, enriched, exercises] = await Promise.all([
    store.getScheduledPlans({ from: weekStart, to: weekEnd }),
    store.getEnrichedSets(),
    store.getExercises({ includeInactive: true }),
  ]);
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const units = store.getSetting('units');
  const planByDate = new Map(scheduled.map((p) => [p.date, p]));
  const setsByDate = groupBy(enriched, (s) => s.date);

  const columns = weekDates.map((date) => {
    const plan = planByDate.get(date);
    const daySets = setsByDate.get(date) || [];
    const byEx = groupBy(daySets, (s) => s.exerciseId);
    const hasLog = daySets.length > 0;
    const hasPlan = Boolean(plan?.items?.length);
    const status = dayStatus(date, today, hasLog, hasPlan);
    const title = plan?.name || (hasLog ? 'Logget økt' : '');

    let body = '';
    if (hasLog) {
      body = `<ul class="kalender-ovelse-liste">${renderLoggedItems(byEx, units)}</ul>`;
    } else if (hasPlan) {
      body = `<ul class="kalender-ovelse-liste">${renderPlanItems(plan.items, exMap)}</ul>`;
    } else {
      body = '<p class="dus liten kalender-tom">Ingen plan</p>';
    }

    const badge = status === 'bommet' ? '<span class="kalender-badge kalender-badge--bommet">Ikke gjennomført</span>'
      : status === 'planlagt' ? '<span class="kalender-badge">Planlagt</span>'
        : status === 'logget' ? '<span class="kalender-badge kalender-badge--logget">Logget</span>'
          : '';

    const actionLabel = date === today ? 'Gå til økt'
      : hasLog ? 'Rediger økt'
        : hasPlan ? 'Rediger plan'
          : 'Planlegg';

    return `
      <article class="kalender-kolonne kalender-kolonne--${status}" data-dato="${date}">
        <header class="kalender-kolonne-hode">
          <span class="kalender-ukedag">${weekdayShort(date)}</span>
          <span class="kalender-dato">${formatDateShort(date).replace(/ \d{4}$/, '')}</span>
          ${date === today ? '<span class="kalender-i-dag">I dag</span>' : ''}
        </header>
        ${title ? `<p class="kalender-program-tittel">${esc(title)}</p>` : ''}
        ${badge}
        <div class="kalender-innhold">${body}</div>
        <a href="${dayLink(date, today, hasLog, hasPlan)}" class="kalender-lenke">${actionLabel} →</a>
      </article>`;
  }).join('');

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/hjem" class="tilbake" aria-label="Tilbake til hjem">‹</a>
      <h1>Kalender</h1>
    </header>

    <div class="kalender-uke-nav">
      <a href="${buildWeekHash(addDaysStr(weekStart, -7))}" class="ikon-knapp kalender-pil" aria-label="Forrige uke">‹</a>
      <span class="kalender-uke-label">${weekLabel(weekDates)}</span>
      <a href="${buildWeekHash(addDaysStr(weekStart, 7))}" class="ikon-knapp kalender-pil" aria-label="Neste uke">›</a>
    </div>
    <a href="${buildWeekHash(today)}" class="knapp sekundaer liten kalender-i-dag-knapp">Denne uken</a>

    <div class="kalender-scroll" tabindex="0" aria-label="Ukevisning">
      <div class="kalender-rad">${columns}</div>
    </div>
  `;
}
