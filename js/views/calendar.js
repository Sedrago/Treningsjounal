/**
 * views/calendar.js – rullerende kalender for planlagte og loggede økter.
 */

import * as store from '../store.js';
import { groupBy } from '../stats.js';
import {
  esc, formatDateShort, datesAround, addDaysStr, weekdayShort,
  todayStr, summarizeSet, toast,
} from '../utils.js';

const DAYS_BACK = 7;
const DAYS_FORWARD = 7;
const PERIOD_DAYS = DAYS_BACK + DAYS_FORWARD + 1;

function rangeLabel(dates) {
  const a = formatDateShort(dates[0]);
  const b = formatDateShort(dates[dates.length - 1]);
  return a === b ? a : `${a} – ${b}`;
}

function buildCalendarHash(anchor) {
  return `#/kalender?fra=${anchor}`;
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

async function copyPreviousPeriod(rangeDates) {
  let copied = 0;
  for (const date of rangeDates) {
    const srcDate = addDaysStr(date, -PERIOD_DAYS);
    const plan = await store.getScheduledPlan(srcDate);
    if (!plan?.items?.length) continue;
    await store.schedulePlanFromItems(date, plan.items, {
      name: plan.name,
      sourceTemplateId: plan.sourceTemplateId,
    });
    copied += 1;
  }
  return copied;
}

function bindPlanner(container, { templates, planByDate, rangeDates, rerender }) {
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

  container.querySelector('#kopier-forrige-periode')?.addEventListener('click', async () => {
    const n = await copyPreviousPeriod(rangeDates);
    toast(
      n ? `${n} planlagte dager kopiert fra forrige periode` : 'Ingen planer å kopiere fra forrige periode',
      n ? 'suksess' : 'info',
    );
    rerender();
  });
}

export async function render(container, params, query = {}) {
  const today = todayStr();
  const anchor = query.fra && /^\d{4}-\d{2}-\d{2}$/.test(query.fra) ? query.fra : today;
  const rangeDates = datesAround(anchor, DAYS_BACK, DAYS_FORWARD);
  const rangeStart = rangeDates[0];
  const rangeEnd = rangeDates[rangeDates.length - 1];
  const onToday = anchor === today;

  const [scheduled, enriched, exercises, templates] = await Promise.all([
    store.getScheduledPlans({ from: rangeStart, to: rangeEnd }),
    store.getEnrichedSets(),
    store.getExercises({ includeInactive: true }),
    store.getSavedTemplates(),
  ]);
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const units = store.getSetting('units');
  const planByDate = new Map(scheduled.map((p) => [p.date, p]));
  const setsByDate = groupBy(enriched, (s) => s.date);

  const columns = rangeDates.map((date) => {
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

    <p class="dus liten kalender-intro">7 dager tilbake og 7 frem. Trykk på en dag for å legge til eller endre program. <a href="#/programmer">Administrer programmer</a></p>

    <div class="kalender-uke-nav">
      <a href="${buildCalendarHash(addDaysStr(anchor, -PERIOD_DAYS))}" class="ikon-knapp kalender-pil" aria-label="Forrige periode">‹</a>
      <span class="kalender-uke-label">${rangeLabel(rangeDates)}</span>
      <a href="${buildCalendarHash(addDaysStr(anchor, PERIOD_DAYS))}" class="ikon-knapp kalender-pil" aria-label="Neste periode">›</a>
    </div>
    <div class="kalender-uke-handlinger">
      ${onToday ? '' : `<a href="${buildCalendarHash(today)}" class="knapp sekundaer liten">I dag</a>`}
      <button type="button" class="knapp sekundaer liten" id="kopier-forrige-periode">Kopier forrige periode</button>
    </div>

    <div class="kalender-scroll" tabindex="0" aria-label="Kalendervisning">
      <div class="kalender-rad">${columns}</div>
    </div>
    <div id="kalender-skjema-vert"></div>
  `;

  bindPlanner(container, {
    templates,
    planByDate,
    rangeDates,
    rerender: () => render(container, params, query),
  });

  container.querySelector('.kalender-kolonne--i-dag')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
}
