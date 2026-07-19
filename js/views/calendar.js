/**
 * views/calendar.js – ukekalender for planlagte og loggede økter.
 */

import * as store from '../store.js';
import { groupBy } from '../stats.js';
import {
  esc, formatDateShort, datesForWeek, addDaysStr, weekdayShort,
  todayStr, summarizeSet, toast,
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
  const units = store.getSetting('units');
  return items.map((it) => {
    const ex = exMap.get(it.exerciseId);
    const name = ex?.name || 'Ukjent øvelse';
    const hint = store.planItemSuggestionText(it, ex, units);
    return `<li class="kalender-ovelse"><span class="kalender-ovelse-navn">${esc(name)}</span>
      <span class="dus liten">${esc(hint)}</span></li>`;
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
  return `#/styrke?dato=${date}`;
}

function dayStatus(date, today, hasLog, hasPlan) {
  if (hasLog) return 'logget';
  if (date < today && hasPlan) return 'bommet';
  if (date === today) return 'i-dag';
  if (hasPlan) return 'planlagt';
  return 'tom';
}

function openPickTemplateSheet(host, templates, onPick) {
  const rows = templates.map((t) => `
    <button type="button" class="velger-rad" data-id="${t.id}">
      <span class="velger-navn">${esc(t.name || 'Uten navn')}</span>
      <span class="velger-info dus">${t.items.length} øvelse${t.items.length === 1 ? '' : 'r'}</span>
    </button>`).join('');

  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Velg program">
      <div class="ark-hode">
        <h2>Legg program på dag</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      ${rows || '<p class="tomt">Ingen lagrede programmer. <a href="#/programmer">Opprett program</a></p>'}
      <a href="#/programmer" class="knapp sekundaer bred">Gå til programmer</a>
    </div>`;

  const close = () => { host.innerHTML = ''; };
  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', close));
  host.querySelectorAll('[data-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      close();
      onPick(btn.dataset.id);
    });
  });
}

function openDayActionSheet(host, { date, hasLog, hasPlan, plan, templates, today, rerender }) {
  const dateLabel = formatDateShort(date);
  let body = '';

  if (hasLog) {
    body = `
      <a href="#/rediger-okt/${date}" class="knapp sekundaer bred">Rediger logget økt</a>
      ${date === today ? '<a href="#/styrke" class="knapp sekundaer bred">Gå til styrke</a>' : ''}`;
  } else if (hasPlan) {
    body = `
      <a href="${dayLink(date, today, hasLog, hasPlan)}" class="knapp primaer bred">${date === today ? 'Start økt' : 'Se plan'}</a>
      <button type="button" class="knapp sekundaer bred" data-handling="bytt">Bytt program</button>
      <button type="button" class="knapp sekundaer bred farlig" data-handling="fjern">Fjern plan</button>`;
  } else {
    body = `
      <button type="button" class="knapp primaer bred" data-handling="velg">Velg program</button>
      <a href="#/programmer" class="knapp sekundaer bred">Gå til programmer</a>`;
  }

  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Dag ${dateLabel}">
      <div class="ark-hode">
        <h2>${dateLabel}</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      ${plan?.name ? `<p class="dus">${esc(plan.name)}</p>` : ''}
      <div class="kalender-dag-handlinger">${body}</div>
    </div>`;

  const close = () => { host.innerHTML = ''; };
  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', close));

  host.querySelector('[data-handling="velg"]')?.addEventListener('click', () => {
    close();
    if (!templates.length) {
      location.hash = '#/programmer';
      return;
    }
    openPickTemplateSheet(host, templates, async (templateId) => {
      await store.scheduleTemplate(templateId, date);
      toast('Program lagt på kalenderen', 'suksess');
      rerender();
    });
  });

  host.querySelector('[data-handling="bytt"]')?.addEventListener('click', () => {
    close();
    openPickTemplateSheet(host, templates, async (templateId) => {
      await store.scheduleTemplate(templateId, date);
      toast('Program oppdatert', 'suksess');
      rerender();
    });
  });

  host.querySelector('[data-handling="fjern"]')?.addEventListener('click', async () => {
    if (!confirm(`Fjerne planen for ${dateLabel}?`)) return;
    close();
    if (plan?.id) await store.deletePlan(plan.id);
    toast('Plan fjernet', 'suksess');
    rerender();
  });
}

function bindPlanner(container, { templates, weekStart, planByDate, query, rerender }) {
  const host = container.querySelector('#kalender-skjema-vert');
  const today = todayStr();

  container.querySelectorAll('.kalender-kolonne[data-dag="1"]').forEach((col) => {
    col.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      const date = col.dataset.dato;
      const plan = planByDate.get(date) || null;
      const hasLog = col.classList.contains('kalender-kolonne--logget');
      const hasPlan = Boolean(plan?.items?.length);
      openDayActionSheet(host, {
        date,
        hasLog,
        hasPlan,
        plan,
        templates,
        today,
        rerender,
      });
    });
  });

  container.querySelector('#kopier-forrige-uke')?.addEventListener('click', async () => {
    const sourceMonday = addDaysStr(weekStart, -7);
    const n = await store.copyWeekPlans(sourceMonday, weekStart);
    toast(n ? `${n} planlagte dager kopiert fra forrige uke` : 'Ingen planer å kopiere fra forrige uke', n ? 'suksess' : 'info');
    rerender();
  });
}

export async function render(container, params, query = {}) {
  const today = todayStr();
  const anchor = query.fra && /^\d{4}-\d{2}-\d{2}$/.test(query.fra) ? query.fra : today;
  const weekDates = datesForWeek(anchor);
  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];

  const [scheduled, enriched, exercises, templates] = await Promise.all([
    store.getScheduledPlans({ from: weekStart, to: weekEnd }),
    store.getEnrichedSets(),
    store.getExercises({ includeInactive: true }),
    store.getSavedTemplates(),
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
    const title = hasPlan ? (plan.name || '') : (hasLog ? 'Logget økt' : '');

    let body = '';
    if (hasLog) {
      body = `<ul class="kalender-ovelse-liste">${renderLoggedItems(byEx, units)}</ul>`;
    } else if (hasPlan) {
      body = `<ul class="kalender-ovelse-liste">${renderPlanItems(plan.items, exMap)}</ul>`;
    } else {
      body = '<p class="dus liten kalender-tom">Trykk for å legge til program</p>';
    }

    const badge = status === 'bommet' ? '<span class="kalender-badge kalender-badge--bommet">Ikke gjennomført</span>'
      : status === 'planlagt' ? '<span class="kalender-badge">Planlagt</span>'
        : status === 'logget' ? '<span class="kalender-badge kalender-badge--logget">Logget</span>'
          : '';

    const actionLabel = date === today && (hasLog || hasPlan) ? 'Gå til økt'
      : date === today ? 'Planlegg'
      : hasLog ? 'Rediger økt'
        : hasPlan ? 'Se plan'
          : 'Planlegg';

    return `
      <article class="kalender-kolonne kalender-kolonne--${status}"
        data-dato="${date}" data-dag="1" ${plan?.id ? `data-plan-id="${plan.id}" data-plan-navn="${esc(plan.name || '')}"` : ''}>
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

    <p class="dus liten kalender-intro">Trykk på en dag for å legge til eller endre program. <a href="#/programmer">Administrer programmer</a></p>

    <div class="kalender-uke-nav">
      <a href="${buildWeekHash(addDaysStr(weekStart, -7))}" class="ikon-knapp kalender-pil" aria-label="Forrige uke">‹</a>
      <span class="kalender-uke-label">${weekLabel(weekDates)}</span>
      <a href="${buildWeekHash(addDaysStr(weekStart, 7))}" class="ikon-knapp kalender-pil" aria-label="Neste uke">›</a>
    </div>
    <div class="kalender-uke-handlinger">
      <a href="${buildWeekHash(today)}" class="knapp sekundaer liten">Denne uken</a>
      <button type="button" class="knapp sekundaer liten" id="kopier-forrige-uke">Kopier forrige uke</button>
    </div>

    <div class="kalender-scroll" tabindex="0" aria-label="Ukevisning">
      <div class="kalender-rad">${columns}</div>
    </div>
    <div id="kalender-skjema-vert"></div>
  `;

  bindPlanner(container, {
    templates,
    weekStart,
    planByDate,
    query,
    rerender: () => render(container, params, query),
  });
}
