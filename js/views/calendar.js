/**
 * views/calendar.js – ukekalender med maler, dra-og-slipp og planlagte økter.
 */

import * as store from '../store.js';
import { groupBy } from '../stats.js';
import {
  esc, formatDateShort, datesForWeek, addDaysStr, weekdayShort,
  todayStr, summarizeSet, toast,
} from '../utils.js';

const DRAG_TEMPLATE = 'text/tj-template';
const DRAG_PLAN = 'text/tj-plan';

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
  return `#/styrke?dato=${date}`;
}

function dayStatus(date, today, hasLog, hasPlan) {
  if (hasLog) return 'logget';
  if (date < today && hasPlan) return 'bommet';
  if (date === today) return 'i-dag';
  if (hasPlan) return 'planlagt';
  return 'tom';
}

function renderTemplateCards(templates, exMap, selectedId) {
  if (!templates.length) {
    return `<p class="dus liten mal-strip-tom">Ingen lagrede programmer ennå. Lagre et program under Styrketrening → ☰ → Lagre som program.</p>`;
  }
  return templates.map((t) => {
    const names = t.items
      .map((it) => exMap.get(it.exerciseId)?.name)
      .filter(Boolean)
      .slice(0, 3);
    const extra = t.items.length > 3 ? ` +${t.items.length - 3}` : '';
    return `
      <button type="button" class="mal-kort ${selectedId === t.id ? 'mal-kort--valgt' : ''}"
        draggable="true" data-template-id="${t.id}" aria-label="Program ${esc(t.name || 'Uten navn')}">
        <span class="mal-kort-navn">${esc(t.name || 'Uten navn')}</span>
        <span class="dus liten">${t.items.length} øvelse${t.items.length === 1 ? '' : 'r'}</span>
        <span class="dus liten mal-kort-preview">${esc(names.join(' · '))}${extra}</span>
        <span class="mal-kort-hint dus liten">Dra til dag · trykk for å velge</span>
      </button>`;
  }).join('');
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
      ${rows || '<p class="tomt">Ingen lagrede programmer.</p>'}
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

function bindPlanner(container, { templates, weekStart, query, rerender }) {
  let selectedTemplateId = null;
  const host = container.querySelector('#kalender-skjema-vert');

  function setSelected(id) {
    selectedTemplateId = selectedTemplateId === id ? null : id;
    container.querySelectorAll('.mal-kort').forEach((el) => {
      el.classList.toggle('mal-kort--valgt', el.dataset.templateId === selectedTemplateId);
    });
  }

  container.querySelectorAll('.mal-kort').forEach((card) => {
    card.addEventListener('click', () => setSelected(card.dataset.templateId));
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData(DRAG_TEMPLATE, card.dataset.templateId);
      e.dataTransfer.effectAllowed = 'copy';
      card.classList.add('mal-kort--drar');
    });
    card.addEventListener('dragend', () => card.classList.remove('mal-kort--drar'));
  });

  container.querySelectorAll('.kalender-dra').forEach((handle) => {
    handle.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      e.dataTransfer.setData(DRAG_PLAN, handle.dataset.planId);
      e.dataTransfer.effectAllowed = 'move';
      handle.closest('.kalender-kolonne')?.classList.add('kalender-kolonne--drar');
    });
    handle.addEventListener('dragend', () => {
      container.querySelectorAll('.kalender-kolonne--drar').forEach((el) => el.classList.remove('kalender-kolonne--drar'));
    });
  });

  container.querySelectorAll('.kalender-kolonne[data-drop="1"]').forEach((col) => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes(DRAG_PLAN) ? 'move' : 'copy';
      col.classList.add('kalender-kolonne--over');
    });
    col.addEventListener('dragleave', (e) => {
      if (!col.contains(e.relatedTarget)) col.classList.remove('kalender-kolonne--over');
    });
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('kalender-kolonne--over');
      if (col.classList.contains('kalender-kolonne--logget')) {
        toast('Dagen har allerede logget økt', 'info');
        return;
      }
      const date = col.dataset.dato;
      const templateId = e.dataTransfer.getData(DRAG_TEMPLATE);
      const planId = e.dataTransfer.getData(DRAG_PLAN);
      try {
        if (templateId) {
          await store.scheduleTemplate(templateId, date);
          toast('Program lagt på kalenderen', 'suksess');
        } else if (planId) {
          await store.reschedulePlan(planId, date);
          toast('Plan flyttet', 'suksess');
        }
        rerender();
      } catch (err) {
        toast(err.message || 'Kunne ikke oppdatere kalenderen');
      }
    });

    col.addEventListener('click', async (e) => {
      if (e.target.closest('a, button, .kalender-dra')) return;
      const date = col.dataset.dato;
      if (col.classList.contains('kalender-kolonne--logget')) return;
      if (selectedTemplateId) {
        await store.scheduleTemplate(selectedTemplateId, date);
        toast('Program lagt på kalenderen', 'suksess');
        selectedTemplateId = null;
        rerender();
        return;
      }
      if (col.dataset.planId || col.classList.contains('kalender-kolonne--logget')) return;
      if (!templates.length) {
        location.hash = '#/styrke';
        return;
      }
      openPickTemplateSheet(host, templates, async (templateId) => {
        await store.scheduleTemplate(templateId, date);
        toast('Program lagt på kalenderen', 'suksess');
        rerender();
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
    const title = plan?.name || (hasLog ? 'Logget økt' : '');
    const canMovePlan = hasPlan && !hasLog && plan?.id;

    let body = '';
    if (hasLog) {
      body = `<ul class="kalender-ovelse-liste">${renderLoggedItems(byEx, units)}</ul>`;
    } else if (hasPlan) {
      body = `<ul class="kalender-ovelse-liste">${renderPlanItems(plan.items, exMap)}</ul>`;
    } else {
      body = '<p class="dus liten kalender-tom">Slipp program her eller trykk for å velge</p>';
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
      <article class="kalender-kolonne kalender-kolonne--${status}"
        data-dato="${date}" data-drop="1" ${plan?.id ? `data-plan-id="${plan.id}"` : ''}>
        <header class="kalender-kolonne-hode">
          <span class="kalender-ukedag">${weekdayShort(date)}</span>
          <span class="kalender-dato">${formatDateShort(date).replace(/ \d{4}$/, '')}</span>
          ${date === today ? '<span class="kalender-i-dag">I dag</span>' : ''}
          ${canMovePlan ? `<button type="button" class="kalender-dra" draggable="true" data-plan-id="${plan.id}" aria-label="Flytt plan">⠿</button>` : ''}
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

    <section class="mal-strip" aria-label="Lagrede programmer">
      <div class="mal-strip-hode">
        <h2 class="kort-tittel">Lagrede programmer</h2>
        <p class="dus liten">Dra til en dag, eller trykk program → trykk dag</p>
      </div>
      <div class="mal-strip-scroll">${renderTemplateCards(templates, exMap, null)}</div>
    </section>

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
    query,
    rerender: () => render(container, params, query),
  });
}
