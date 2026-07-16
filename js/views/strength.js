/**
 * views/strength.js – Styrketrening: én side for program, logging og maler.
 */

import * as store from '../store.js';
import { initContent, getCatalogByCategory, getCatalogEntry, getDescription, filterCatalog, getCatalogFilterOptions } from '../content.js';
import {
  renderExerciseFilterSelects, bindExerciseFilterSelects, matchesUserExerciseFilter,
} from '../exercise-filters.js';
import { openForm } from './exercises.js';
import { descriptionBlock, bindDescriptionToggles } from './exercise-library.js';
import { mountSetLogger, completedSetsHtml, bindCompletedSetsList } from '../session-log.js';
import * as programShare from '../program-share.js';
import * as relay from '../relay-api.js';
import { mountMoodInline, workoutNeedsMood } from '../mood-prompt.js';
import { groupBy } from '../stats.js';
import {
  esc, formatDateShort, formatDateLong, relativeDays, todayStr,
  toast, windowStartStr, categoryIconHtml, debounce,
} from '../utils.js';

function categoryStats(enriched) {
  const since14 = windowStartStr(14);
  const today = todayStr();
  const stats = new Map();
  for (const k of store.KATEGORIER) {
    stats.set(k.id, { lastDate: null, recent: 0 });
  }
  const byCat = groupBy(enriched, (s) => s.category);
  for (const [cat, sets] of byCat) {
    const st = stats.get(cat);
    if (!st) continue;
    st.lastDate = sets.reduce((max, s) => (s.date > max ? s.date : max), '0000');
    if (st.lastDate === '0000') st.lastDate = null;
    st.recent = new Set(sets.filter((s) => s.date >= since14 && s.date <= today).map((s) => s.date)).size;
  }
  return stats;
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.round((new Date().setHours(0, 0, 0, 0) - new Date(y, m - 1, d).getTime()) / 86400000);
}

function sessionProgress(items, todaySets) {
  const setsByEx = groupBy(todaySets, (s) => s.exerciseId);
  let started = 0;
  for (const item of items) {
    if ((setsByEx.get(item.exerciseId) || []).length) started += 1;
  }
  return { started, total: items.length };
}

function statusLine(plan, items, todaySets) {
  if (!items.length) return 'Tomt program';
  const { started, total } = sessionProgress(items, todaySets);
  if (!todaySets.length) return `${total} øvelse${total === 1 ? '' : 'r'} klar`;
  if (started >= total) return `${total} øvelse${total === 1 ? '' : 'r'} logget i dag`;
  return `Pågår – ${started}/${total} øvelser startet`;
}

const FOCUS_KEY = 'styrkeFocusEx';
const SESSION_KEY = 'styrkeSessionActive';
const TEKNIKK_KEY = 'styrkeTeknikkEx';
const EXPAND_KEY = 'styrkeRadUtvid';

function planMalFieldsHtml(item, ex, { editable }) {
  if (!ex) return '';
  const logMode = store.logModeOf(ex);
  const showWeight = logMode === 'weight';
  const hint = store.planItemSuggestionText(item, ex);
  if (!editable) {
    return hint ? `<p class="plan-mal-hint dus liten">${esc(hint)}</p>` : '';
  }
  const val = (key) => item[key] ?? '';
  return `
    <div class="plan-mal-felt" data-plan-mal="${item.exerciseId}">
      <p class="felt-navn liten">Foreslått (valgfritt)</p>
      <div class="plan-mal-rad">
        <label class="plan-mal-celle">
          <span class="dus">Sett</span>
          <input type="number" class="inndata plan-mal-inp" data-felt="suggestedSets"
            value="${val('suggestedSets')}" min="1" max="20" placeholder="–" inputmode="numeric" aria-label="Foreslåtte sett">
        </label>
        <label class="plan-mal-celle">
          <span class="dus">Reps</span>
          <input type="number" class="inndata plan-mal-inp" data-felt="suggestedReps"
            value="${val('suggestedReps')}" min="1" max="99" placeholder="–" inputmode="numeric" aria-label="Foreslåtte reps">
        </label>
        ${showWeight ? `
        <label class="plan-mal-celle">
          <span class="dus">Vekt (kg)</span>
          <input type="number" class="inndata plan-mal-inp" data-felt="suggestedWeightKg"
            value="${val('suggestedWeightKg')}" min="0" step="0.5" placeholder="–" inputmode="decimal" aria-label="Foreslått vekt i kg">
        </label>` : ''}
      </div>
    </div>`;
}

function planItemFromMalFields(item, host) {
  const block = host.querySelector(`[data-plan-mal="${item.exerciseId}"]`);
  if (!block) return store.sanitizePlanItem({ exerciseId: item.exerciseId });
  const raw = { exerciseId: item.exerciseId };
  block.querySelectorAll('.plan-mal-inp').forEach((inp) => {
    const v = inp.value.trim();
    if (v) raw[inp.dataset.felt] = v;
  });
  return store.sanitizePlanItem(raw);
}

function nextSetNumber(persisted) {
  if (!persisted.length) return 1;
  const nums = persisted.map((s) => s.setNumber);
  const max = Math.max(...nums);
  for (let n = 1; n <= max; n++) {
    if (!nums.includes(n)) return n;
  }
  return max + 1;
}

function resolveActive(items, setsByEx, exMap) {
  if (!items.length) return null;

  const focusId = sessionStorage.getItem(FOCUS_KEY);
  let exIndex = focusId ? items.findIndex((it) => it.exerciseId === focusId) : -1;

  if (exIndex < 0) {
    exIndex = items.findIndex((it) => !(setsByEx.get(it.exerciseId) || []).length);
    if (exIndex < 0) exIndex = 0;
  }

  const item = items[exIndex];
  const exercise = exMap.get(item.exerciseId);
  const persisted = setsByEx.get(item.exerciseId) || [];
  const setNum = nextSetNumber(persisted);

  return { exIndex, item, exercise, setNum };
}

function exercisePickerDescription(exercise) {
  const description = getDescription(exercise);
  const notes = exercise.notes?.trim();
  if (description && notes) return `${description}\n\nMine notater: ${notes}`;
  return description || notes || '';
}

function renderInlineTeknikk(exercise, category) {
  if (!exercise) return '';
  const description = getDescription(exercise);
  const notes = exercise.notes?.trim();
  const video = exercise.video?.trim();
  if (!description && !notes && !video) return '';

  return `
    <div class="styrke-rad-teknikk" data-handling="teknikk-lukk" role="button" tabindex="0" aria-label="Skjul teknikk">
      <p class="styrke-teknikk-navn">${category ? `${categoryIconHtml(category, 'kategori-ikon liten')} ` : ''}${esc(exercise.name)}</p>
      ${description ? `<p class="styrke-teknikk-tekst">${esc(description)}</p>` : ''}
      ${notes ? `<p class="styrke-teknikk-notater dus liten">Mine notater: ${esc(notes)}</p>` : ''}
      ${video ? `<p class="styrke-teknikk-video"><a href="${esc(video)}" target="_blank" rel="noopener" data-handling="video">Se video ↗</a></p>` : ''}
    </div>`;
}

/** Eksportert for hjemskjermen. */
export async function homeStrengthLabel() {
  const enriched = await store.getEnrichedSets();
  const today = todayStr();
  const plan = await store.getTodayWorkoutPlan();
  const items = plan?.items || [];
  const todaySets = enriched.filter((s) => s.date === today);
  if (!items.length && !todaySets.length) {
    return { title: 'Styrketrening', sub: 'Bygg dagens program' };
  }
  const { started, total } = sessionProgress(items, todaySets);
  if (todaySets.length && started < total) {
    return { title: 'Fortsett styrketrening', sub: `${started}/${total || items.length} øvelser startet` };
  }
  if (items.length && !todaySets.length) {
    return { title: 'Styrketrening', sub: `${items.length} øvelse${items.length === 1 ? '' : 'r'} klar` };
  }
  return { title: 'Styrketrening', sub: statusLine(plan, items, todaySets) };
}

export async function render(container, params, query = {}) {
  await initContent();
  const enriched = await store.getEnrichedSets();
  const today = todayStr();
  const viewDate = query.dato && /^\d{4}-\d{2}-\d{2}$/.test(query.dato) ? query.dato : today;
  const isToday = viewDate === today;
  const daySets = enriched.filter((s) => s.date === viewDate);
  const exercises = await store.getExercises({ includeInactive: true });
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const plan = await store.getWorkoutPlanForDate(viewDate);
  const items = plan?.items || [];
  const stats = categoryStats(enriched);
  const workouts = await store.getWorkouts();
  const dayWorkout = workouts.find((w) => w.date === viewDate) || null;

  const setsByEx = groupBy(daySets, (s) => s.exerciseId);
  const hasPartialLog = daySets.length > 0;

  if (!isToday || !items.length) {
    if (!isToday) sessionStorage.removeItem(SESSION_KEY);
  } else if (hasPartialLog) {
    sessionStorage.setItem(SESSION_KEY, '1');
  }
  const sessionActive = isToday && sessionStorage.getItem(SESSION_KEY) === '1' && items.length > 0;
  const active = sessionActive ? resolveActive(items, setsByEx, exMap) : null;
  const teknikkOpenId = sessionStorage.getItem(TEKNIKK_KEY);
  const expandedId = sessionStorage.getItem(EXPAND_KEY);

  container.classList.toggle('app--styrke-oktt', sessionActive);

  const rows = items.map((item, i) => {
    const ex = exMap.get(item.exerciseId);
    const name = ex ? ex.name : 'Ukjent øvelse';
    const cat = ex ? store.categoryById(ex.category) : null;
    const logged = (setsByEx.get(item.exerciseId) || []).length;
    const isActive = sessionActive && active && active.exIndex === i;
    const isExpanded = expandedId === item.exerciseId;
    const showDetails = isExpanded;
    const compact = !isExpanded;
    const showTeknikk = isExpanded && teknikkOpenId === item.exerciseId;
    const hasTeknikk = ex && (getDescription(ex) || ex.notes?.trim() || ex.video?.trim());

    const progress = sessionActive && logged
      ? `<span class="styrke-rad-fremdrift dus liten">${logged} sett</span>` : '';

    const expandBtn = `
        <button type="button" class="ikon-knapp styrke-rad-utvid" data-handling="utvid"
          aria-label="${isExpanded ? 'Skjul valg' : 'Vis valg'}" aria-expanded="${isExpanded ? 'true' : 'false'}">⌄</button>`;

    const rowActions = showDetails ? `
        <span class="plan-rad-handlinger">
          <button type="button" class="ikon-knapp" data-handling="opp" aria-label="Flytt opp" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="ikon-knapp" data-handling="ned" aria-label="Flytt ned" ${i === items.length - 1 ? 'disabled' : ''}>↓</button>
          ${hasTeknikk ? '<button type="button" class="ikon-knapp styrke-teknikk-knapp" data-handling="teknikk" aria-label="Vis teknikk" aria-pressed="' + (showTeknikk ? 'true' : 'false') + '">i</button>' : ''}
          <button type="button" class="ikon-knapp" data-handling="fjern" aria-label="Fjern">✕</button>
        </span>` : '';

    const exSetsToday = setsByEx.get(item.exerciseId) || [];
    const suggestionHint = !showDetails && store.planItemSuggestionText(item, ex);
    const malBlock = showDetails
      ? planMalFieldsHtml(item, ex, { editable: !sessionActive })
      : '';
    const completedSetsBlock = sessionActive && showDetails && ex
      ? completedSetsHtml(ex, exSetsToday, store.getSetting('units'))
      : '';

    return `
      <div class="plan-rad styrke-rad styrke-rad--liste ${sessionActive ? 'styrke-rad--oktt' : ''} ${isActive ? 'styrke-rad--aktiv' : ''} ${compact ? 'styrke-rad--kompakt' : 'styrke-rad--utvidet'}"
        data-idx="${i}" data-ex-id="${item.exerciseId}">
        <div class="styrke-lenke">
          <span class="plan-rekkefolge">${i + 1}</span>
          ${cat ? `<span class="styrke-rad-kat">${categoryIconHtml(cat, 'kategori-ikon styrke-kat-ikon')}</span>` : ''}
          <span class="plan-okt-info">
            <span class="plan-navn">${esc(name)}</span>
            ${suggestionHint ? `<span class="plan-mal-hint dus liten">${esc(suggestionHint)}</span>` : ''}
          </span>
        </div>
        ${progress}
        ${expandBtn}
        ${rowActions}
        ${malBlock}
        ${completedSetsBlock ? `<div class="styrke-fullforte">${completedSetsBlock}</div>` : ''}
        ${showTeknikk ? renderInlineTeknikk(ex, cat) : ''}
      </div>`;
  }).join('');

  const menuItems = [
    { action: 'kalender', label: 'Kalender' },
    { action: 'historikk', label: 'Hent fra tidligere økt' },
    { action: 'mal', label: 'Lagrede programmer' },
    { action: 'importer', label: 'Importer program' },
    ...(isToday && daySets.length ? [{ action: 'lagre-fra-logging', label: 'Lagre program fra dagens logging' }] : []),
    ...(items.length ? [{ action: 'lagre-mal', label: 'Lagre som program' }] : []),
    ...(items.length ? [{ action: 'tom', label: 'Tøm program', farlig: true }] : []),
    ...(sessionActive ? [{ action: 'pause', label: 'Pause økt' }] : []),
  ];

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/hjem" class="tilbake" aria-label="Tilbake til hjem">‹</a>
      <div>
        <h1>Styrketrening</h1>
        <p class="dus">${formatDateLong(viewDate)}${plan?.name ? ` · ${esc(plan.name)}` : ''}${isToday ? ` · ${esc(statusLine(plan, items, daySets))}` : viewDate > today ? ' · Planlagt' : ''}</p>
      </div>
    </header>

    <section class="kort styrke-program" aria-label="${isToday ? 'Dagens program' : 'Program'}">
      <div class="styrke-program-hode">
        <h2 class="kort-tittel">Program${items.length ? ` (${items.length})` : ''}</h2>
        <div class="styrke-meny-wrap">
          <button type="button" class="ikon-knapp styrke-meny" id="program-meny" aria-label="Programmeny" aria-haspopup="menu" aria-expanded="false">☰</button>
          <div class="styrke-meny-popover skjult" id="program-meny-liste" role="menu">
            ${menuItems.map((m) => `
              <button type="button" class="styrke-meny-valg ${m.farlig ? 'farlig' : ''}" role="menuitem" data-program-handling="${m.action}">${esc(m.label)}</button>`).join('')}
          </div>
        </div>
      </div>
      <div id="styrke-liste">${rows}</div>
    </section>

    ${isToday && !sessionActive && items.length ? '<button type="button" class="knapp primaer stor" id="start-okt">Start økt</button>' : ''}
    <button type="button" class="knapp sekundaer bred" id="legg-til-ovelse">+ Legg til øvelse</button>

    ${isToday ? `
    <section class="kort">
      <label class="felt-navn" for="okt-notat">Notat for økten</label>
      <textarea id="okt-notat" class="inndata" rows="2"
        placeholder="Dagsform, fokus …">${esc(dayWorkout?.notes || '')}</textarea>
    </section>` : ''}

    ${sessionActive ? `
    <div class="oktt-bunn" id="oktt-bunn">
      <div class="oktt-mood" id="oktt-mood"></div>
      <div class="oktt-overlay" id="oktt-panel" role="region" aria-label="Logg sett"></div>
    </div>` : ''}
    <div id="velger-vert"></div>
  `;

  const host = container.querySelector('#velger-vert');
  const menuBtn = container.querySelector('#program-meny');
  const menuList = container.querySelector('#program-meny-liste');

  function closeMenu() {
    menuList.classList.add('skjult');
    menuBtn.setAttribute('aria-expanded', 'false');
  }

  function openMenu() {
    menuList.classList.remove('skjult');
    menuBtn.setAttribute('aria-expanded', 'true');
  }

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menuList.classList.contains('skjult')) {
      openMenu();
      setTimeout(() => document.addEventListener('click', closeMenu, { once: true }), 0);
    } else {
      closeMenu();
    }
  });

  async function updateItems(newItems) {
    await store.savePlanForDate(viewDate, {
      id: plan?.id,
      items: newItems,
      name: plan?.name || '',
      sourceTemplateId: plan?.sourceTemplateId || '',
    });
    render(container, params, query);
  }

  container.querySelector('#okt-notat')?.addEventListener('input', debounce(async (e) => {
    const w = await store.getOrCreateWorkoutForDate(viewDate, { retroactive: viewDate < today });
    w.notes = e.target.value;
    await store.saveWorkout(w);
  }, 600));

  function addExercise(exercise) {
    const next = [...items.map((it) => ({ ...it })), { exerciseId: exercise.id }];
    return updateItems(next);
  }

  async function handleProgramAction(action) {
    closeMenu();
    if (action === 'kalender') {
      location.hash = '#/kalender';
    } else if (action === 'legg-til') {
      openCategoryPicker(host, stats, (catId) => {
        openExercisePicker(host, catId, items, (ex) => {
          host.innerHTML = '';
          addExercise(ex);
          toast(`«${ex.name}» lagt til`, 'suksess');
        }, () => render(container, params, query));
      });
    } else if (action === 'historikk') {
      openCopySheet(host, enriched, exMap, async (dayItems) => {
        const existing = new Set(items.map((it) => it.exerciseId));
        const merged = [...items.map((it) => ({ ...it }))];
        for (const it of dayItems) {
          if (!existing.has(it.exerciseId)) merged.push(it);
        }
        await updateItems(merged);
        toast('Øvelser hentet fra tidligere økt', 'suksess');
      });
    } else if (action === 'mal') {
      openTemplatesSheet(host, exMap, async (templateId, replace) => {
        const templates = await store.getSavedTemplates();
        const tpl = templates.find((t) => t.id === templateId);
        if (!tpl?.items?.length) return;
        if (replace && items.length && !confirm('Erstatt nåværende program med malen?')) return;
        if (replace) {
          await store.loadTemplateIntoDate(templateId, viewDate);
        } else {
          const existing = new Set(items.map((it) => it.exerciseId));
          const merged = [...items.map((it) => ({ ...it }))];
          for (const it of tpl.items) {
            if (!existing.has(it.exerciseId)) merged.push({ ...it });
          }
          await updateItems(merged);
        }
        toast(`«${tpl.name || 'Program'}» lastet inn`, 'suksess');
        render(container, params, query);
      });
    } else if (action === 'importer') {
      openImportProgramSheet(host, exMap, async () => {
        render(container, params, query);
      });
    } else if (action === 'lagre-fra-logging') {
      const saveItems = programShare.itemsFromLoggedSession(daySets, items);
      if (!saveItems.length) {
        toast('Ingen loggede sett å lagre fra', 'feil');
        return;
      }
      openSaveTemplateSheet(host, saveItems, exMap, setsByEx, viewDate, async ({ name, scheduleDate, saveItems: outItems }) => {
        await store.saveAsTemplate(name, outItems, { scheduleDate });
        toast(scheduleDate
          ? `«${name}» lagret fra dagens logging og lagt på ${formatDateShort(scheduleDate)}`
          : `Programmet «${name}» er lagret fra dagens logging`, 'suksess');
      }, {
        title: 'Lagre program fra dagens logging',
        intro: `${saveItems.length} øvelse${saveItems.length === 1 ? '' : 'r'} med mål hentet fra det du logget i dag.`,
        defaultName: plan?.name ? `${plan.name} (logget)` : `Økt ${formatDateShort(viewDate)}`,
        goalsChecked: true,
      });
    } else if (action === 'lagre-mal') {
      openSaveTemplateSheet(host, items, exMap, setsByEx, viewDate, async ({ name, scheduleDate, saveItems }) => {
        await store.saveAsTemplate(name, saveItems, { scheduleDate });
        toast(scheduleDate
          ? `«${name}» lagret og lagt på ${formatDateShort(scheduleDate)}`
          : `Programmet «${name}» er lagret`, 'suksess');
      });
    } else if (action === 'tom') {
      if (!confirm('Tømme hele programmet? Loggede sett beholdes.')) return;
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(FOCUS_KEY);
      sessionStorage.removeItem(TEKNIKK_KEY);
      sessionStorage.removeItem(EXPAND_KEY);
      if (plan) await store.deletePlan(plan.id);
      render(container, params, query);
    } else if (action === 'pause') {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(FOCUS_KEY);
      sessionStorage.removeItem(TEKNIKK_KEY);
      sessionStorage.removeItem(EXPAND_KEY);
      render(container, params, query);
    }
  }

  container.querySelector('#start-okt')?.addEventListener('click', () => {
    if (!items.length) return;
    sessionStorage.setItem(SESSION_KEY, '1');
    render(container, params, query);
  });

  container.querySelector('#legg-til-ovelse')?.addEventListener('click', () => handleProgramAction('legg-til'));

  menuList.querySelectorAll('[data-program-handling]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleProgramAction(btn.dataset.programHandling);
    });
  });

  container.querySelectorAll('.styrke-rad').forEach((row) => {
    const idx = Number(row.dataset.idx);
    if (sessionActive) {
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-handling]')) return;
        sessionStorage.setItem(FOCUS_KEY, row.dataset.exId);
        if (sessionStorage.getItem(TEKNIKK_KEY) && sessionStorage.getItem(TEKNIKK_KEY) !== row.dataset.exId) {
          sessionStorage.removeItem(TEKNIKK_KEY);
        }
        if (sessionStorage.getItem(EXPAND_KEY) && sessionStorage.getItem(EXPAND_KEY) !== row.dataset.exId) {
          sessionStorage.removeItem(EXPAND_KEY);
        }
        render(container, params, query);
      });
    }
    row.querySelectorAll('[data-handling]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = btn.dataset.handling;
        if (action === 'utvid') {
          const open = sessionStorage.getItem(EXPAND_KEY) === row.dataset.exId;
          if (open) {
            sessionStorage.removeItem(EXPAND_KEY);
            sessionStorage.removeItem(TEKNIKK_KEY);
          } else {
            sessionStorage.setItem(EXPAND_KEY, row.dataset.exId);
          }
          render(container, params, query);
          return;
        }
        if (action === 'teknikk') {
          const open = sessionStorage.getItem(TEKNIKK_KEY) === row.dataset.exId;
          if (open) sessionStorage.removeItem(TEKNIKK_KEY);
          else sessionStorage.setItem(TEKNIKK_KEY, row.dataset.exId);
          render(container, params, query);
          return;
        }
        if (action === 'teknikk-lukk') {
          if (e.target.closest('[data-handling="video"]')) return;
          sessionStorage.removeItem(TEKNIKK_KEY);
          render(container, params, query);
          return;
        }
        const next = items.map((it) => ({ ...it }));
        if (action === 'fjern') next.splice(idx, 1);
        else if (action === 'opp' && idx > 0) [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
        else if (action === 'ned' && idx < next.length - 1) [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
        await updateItems(next);
      });
    });
    row.querySelector('.styrke-rad-teknikk')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        sessionStorage.removeItem(TEKNIKK_KEY);
        render(container, params, query);
      }
    });
  });

  container.querySelectorAll('.styrke-fullforte').forEach((el) => {
    bindCompletedSetsList(el, { onDelete: () => render(container, params, query) });
  });

  if (!sessionActive) {
    container.querySelectorAll('.plan-mal-felt').forEach((block) => {
      block.querySelectorAll('.plan-mal-inp').forEach((inp) => {
        inp.addEventListener('blur', async () => {
          const exId = block.dataset.planMal;
          const idx = items.findIndex((it) => it.exerciseId === exId);
          if (idx < 0) return;
          const next = items.map((it) => ({ ...it }));
          next[idx] = planItemFromMalFields(items[idx], block);
          await store.savePlanForDate(viewDate, {
            id: plan?.id,
            items: next,
            name: plan?.name || '',
            sourceTemplateId: plan?.sourceTemplateId || '',
          });
          items[idx] = next[idx];
        });
      });
    });
  }

  container.querySelector('.styrke-rad--aktiv')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

  const sessionHost = container.querySelector('#oktt-panel');
  if (sessionActive) {
    const workout = dayWorkout || await store.getOrCreateTodayWorkout();
    const moodHost = container.querySelector('#oktt-mood');
    if (moodHost && await workoutNeedsMood(workout.id)) {
      mountMoodInline(moodHost, { workoutId: workout.id, onDone: () => render(container, params, query) });
    } else if (moodHost) {
      moodHost.innerHTML = '';
    }
  }

  if (sessionActive && active?.exercise) {
    const exSets = setsByEx.get(active.item.exerciseId) || [];
    const persistedSet = exSets.find((s) => s.setNumber === active.setNum) || null;
    const prevSet = exSets.find((s) => s.setNumber === active.setNum - 1)
      || exSets.slice().sort((a, b) => b.setNumber - a.setNumber)[0]
      || (await store.getLastSessionForExercise(active.item.exerciseId, today))?.sets?.slice(-1)[0]
      || null;

    await mountSetLogger(sessionHost, {
      exercise: active.exercise,
      setNumber: active.setNum,
      persistedSet,
      templateSet: prevSet,
      planItem: active.item,
      completedSets: exSets.filter((s) => s.setNumber !== active.setNum),
      compact: true,
      onSaved: () => {
        toast('Sett lagret', 'suksess');
        render(container, params, query);
      },
      onDeleted: () => render(container, params, query),
    });
  } else if (sessionActive) {
    sessionHost.innerHTML = '';
  }

  if (sessionActive) {
    requestAnimationFrame(() => {
      const bunn = container.querySelector('#oktt-bunn');
      if (bunn) container.style.setProperty('--oktt-overlay-h', `${bunn.offsetHeight + 12}px`);
    });
  }
}

/** Bunn-ark: velg kategori (sortert etter lengst siden sist). */
function openCategoryPicker(host, stats, onCategory) {
  const sortedCats = [...store.KATEGORIER].sort((a, b) => {
    const da = daysSince(stats.get(a.id).lastDate);
    const db_ = daysSince(stats.get(b.id).lastDate);
    if (da == null && db_ == null) return a.priority - b.priority;
    if (da == null) return -1;
    if (db_ == null) return 1;
    return db_ - da;
  });

  const cards = sortedCats.map((k) => {
    const st = stats.get(k.id);
    const days = daysSince(st.lastDate);
    return `
      <button type="button" class="velger-rad styrke-kat-rad" data-kategori="${k.id}">
        <span class="velger-navn kategori-tittel">${categoryIconHtml(k, 'kategori-ikon liten')} ${esc(k.name)}</span>
        <span class="velger-info dus">${days == null ? 'Aldri' : days === 0 ? 'I dag' : `${days}d siden`}</span>
      </button>`;
  }).join('');

  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Velg kategori">
      <div class="ark-hode">
        <h2>Velg kategori</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      ${cards}
    </div>`;

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));
  host.querySelectorAll('.styrke-kat-rad').forEach((btn) => {
    btn.addEventListener('click', () => onCategory(btn.dataset.kategori));
  });
}

/** Bunn-ark: velg øvelse fra katalogen for en kategori. */
async function openExercisePicker(host, categoryId, planItems, onPick, onEdited) {
  const category = store.categoryById(categoryId);
  const catalog = getCatalogByCategory(categoryId);
  const activeCatalogIds = new Set(await store.getActiveCatalogIds());
  const inPlan = new Set(planItems.map((it) => it.exerciseId));
  const mine = await store.getExercisesByCategory(categoryId);
  const mineById = new Map(mine.map((e) => [e.id, e]));
  const catalogRest = catalog.filter((c) => !activeCatalogIds.has(c.id));
  const filterOptions = getCatalogFilterOptions({ categoryId });

  let filters = { utstyr: '', muskel: '' };
  let searchQuery = '';

  function currentFilters() {
    return { ...filters, q: searchQuery };
  }

  function filteredMine() {
    return mine.filter((e) => matchesUserExerciseFilter(e, currentFilters()));
  }

  function filteredCatalog() {
    return filterCatalog({
      categoryId,
      equipment: filters.utstyr || null,
      muscle: filters.muskel || null,
      query: searchQuery,
    }).filter((c) => !activeCatalogIds.has(c.id));
  }

  function renderMineRows(list) {
    if (!list.length) {
      if (!mine.length) return '<p class="dus liten">Ingen aktive øvelser i kategorien ennå.</p>';
      return '<p class="dus liten">Ingen øvelser matcher filteret.</p>';
    }
    return list.map((e) => `
    <article class="plan-bib-rad plan-mine-rad" data-id="${e.id}">
      <div class="plan-bib-topp">
        <h3 class="plan-bib-navn">${esc(e.name)}${inPlan.has(e.id) ? ' <span class="dus">✓ i programmet</span>' : ''}</h3>
        <span class="plan-mine-handlinger">
          <button type="button" class="ikon-knapp plan-rediger" data-id="${e.id}" aria-label="Rediger øvelse">✎</button>
          <button type="button" class="plan-bib-bruk" data-id="${e.id}" ${inPlan.has(e.id) ? 'disabled' : ''}>Bruk denne →</button>
        </span>
      </div>
      ${descriptionBlock(exercisePickerDescription(e), 120)}
    </article>`).join('');
  }

  function renderCatalogRows(list) {
    if (!list.length) {
      if (!catalogRest.length) return '<p class="dus liten">Alle katalogøvelser er allerede lagt til.</p>';
      return '<p class="dus liten">Ingen øvelser matcher filteret.</p>';
    }
    return list.map((c) => `
    <article class="plan-bib-rad" data-id="${esc(c.id)}" data-catalog="1">
      <div class="plan-bib-topp">
        <h3 class="plan-bib-navn">${esc(c.name)}</h3>
        <button type="button" class="plan-bib-bruk" data-id="${esc(c.id)}">Legg til og bruk →</button>
      </div>
      ${descriptionBlock(c.description, 120)}
    </article>`).join('');
  }

  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Velg øvelse for ${esc(category.name)}">
      <div class="ark-hode">
        <h2 class="kategori-tittel">${categoryIconHtml(category)} ${esc(category.name)}</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <div id="picker-filtre">
        ${renderExerciseFilterSelects({ filters, filterOptions, showCategory: false })}
      </div>
      <input type="search" class="inndata sok picker-sok" id="picker-sok" placeholder="Søk på øvelsesnavn …" aria-label="Søk øvelser">
      <p class="felt-navn plan-bib-tittel">Mine øvelser</p>
      <div id="picker-mine">${renderMineRows(filteredMine())}</div>
      <details class="plan-bib-seksjon" id="picker-katalog">
        <summary class="plan-bib-tittel plan-bib-toggle">Fra katalogen <span class="dus liten" id="picker-katalog-antall">(${catalogRest.length})</span></summary>
        <div id="picker-katalog-liste">${renderCatalogRows(filteredCatalog())}</div>
      </details>
      <form class="ny-ovelse-skjema">
        <input type="text" class="inndata" name="navn" placeholder="Ny egen øvelse …" aria-label="Navn på ny øvelse">
        <button type="submit" class="knapp sekundaer">Legg til</button>
      </form>
    </div>`;

  const filterRoot = host.querySelector('#picker-filtre');
  const mineEl = host.querySelector('#picker-mine');
  const catalogListEl = host.querySelector('#picker-katalog-liste');
  const catalogCountEl = host.querySelector('#picker-katalog-antall');
  const catalogDetails = host.querySelector('#picker-katalog');
  const searchEl = host.querySelector('#picker-sok');

  function redrawLists() {
    const catalogOpen = catalogDetails.open;
    const filtered = filteredCatalog();
    mineEl.innerHTML = renderMineRows(filteredMine());
    catalogListEl.innerHTML = renderCatalogRows(filtered);
    catalogCountEl.textContent = `(${filtered.length})`;
    catalogDetails.open = catalogOpen;
    bindPickerEvents();
    bindDescriptionToggles(host, (id) => {
      const entry = getCatalogEntry(id);
      if (entry?.description) return entry.description;
      const ex = mineById.get(id);
      return ex ? exercisePickerDescription(ex) : '';
    });
  }

  function bindPickerEvents() {
    host.querySelectorAll('.plan-bib-bruk').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        const row = btn.closest('[data-catalog]');
        if (row) {
          const catalogEntry = getCatalogEntry(btn.dataset.id);
          if (!catalogEntry) return;
          const ex = await store.addExerciseFromCatalog(catalogEntry.id, catalogEntry);
          host.innerHTML = '';
          onPick(ex);
          return;
        }
        const ex = await store.getExercise(btn.dataset.id);
        if (!ex) return;
        host.innerHTML = '';
        onPick(ex);
      });
    });

    host.querySelectorAll('.plan-rediger').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ex = await store.getExercise(btn.dataset.id);
        if (!ex) return;
        openForm(host, ex, () => onEdited());
      });
    });
  }

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));

  bindExerciseFilterSelects(filterRoot, (next) => {
    filters = next;
    redrawLists();
  });

  let searchTimer;
  searchEl.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = searchEl.value.trim();
      redrawLists();
    }, 300);
  });

  bindPickerEvents();
  bindDescriptionToggles(host, (id) => {
    const entry = getCatalogEntry(id);
    if (entry?.description) return entry.description;
    const ex = mineById.get(id);
    return ex ? exercisePickerDescription(ex) : '';
  });

  host.querySelector('.ny-ovelse-skjema').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = e.target.navn.value.trim();
    if (!name) return;
    const ex = await store.saveExercise({ name, category: categoryId, applyDefaultGoals: true });
    host.innerHTML = '';
    onPick(ex);
  });
}

function openCopySheet(host, enriched, exMap, onCopy) {
  const byDate = groupBy(enriched, (s) => s.date);
  const days = [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 30);

  const rows = days.map(([date, sets]) => {
    const byEx = groupBy(sets, (s) => s.exerciseId);
    const names = [...byEx.values()].map((exSets) => exSets[0].exerciseName);
    return `
      <button type="button" class="velger-rad plan-kopi-rad" data-dato="${date}">
        <span class="velger-navn">${formatDateShort(date)} <span class="dus">(${relativeDays(date)})</span></span>
        <span class="velger-info dus plan-kopi-ovelser">${esc(names.join(' · '))}</span>
      </button>`;
  }).join('');

  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Hent fra tidligere økt">
      <div class="ark-hode">
        <h2>Hent fra tidligere økt</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <p class="dus liten">Legger til øvelser som ikke allerede finnes i programmet.</p>
      ${rows || '<p class="tomt">Ingen tidligere økter ennå.</p>'}
    </div>`;

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));
  host.querySelectorAll('.plan-kopi-rad').forEach((btn) => {
    btn.addEventListener('click', () => {
      const date = btn.dataset.dato;
      const sets = enriched.filter((s) => s.date === date);
      const byEx = groupBy(sets, (s) => s.exerciseId);
      const dayItems = [...byEx.keys()]
        .filter((exerciseId) => exMap.has(exerciseId))
        .map((exerciseId) => ({ exerciseId }));
      host.innerHTML = '';
      onCopy(dayItems);
    });
  });
}

async function openTemplatesSheet(host, exMap, onSelect) {
  const templates = await store.getSavedTemplates();

  const rows = templates.map((t) => {
    const names = t.items
      .map((it) => exMap.get(it.exerciseId)?.name)
      .filter(Boolean)
      .slice(0, 4);
    const extra = t.items.length > 4 ? ` +${t.items.length - 4}` : '';
    return `
      <div class="velger-rad styrke-mal-rad" data-id="${t.id}">
        <div class="styrke-mal-info">
          <span class="velger-navn">${esc(t.name || 'Uten navn')}</span>
          <span class="velger-info dus">${t.items.length} øvelse${t.items.length === 1 ? '' : 'r'} · ${esc(names.join(', '))}${extra}</span>
        </div>
        <span class="styrke-mal-handlinger">
          <button type="button" class="plan-bib-bruk" data-id="${t.id}" data-modus="erstatt">Bruk →</button>
          <button type="button" class="plan-bib-bruk dus" data-id="${t.id}" data-modus="legg-til">+ Legg til</button>
          <button type="button" class="plan-bib-bruk dus" data-id="${t.id}" data-handling="eksporter" aria-label="Eksporter program">↗</button>
        </span>
      </div>`;
  }).join('');

  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Lagrede programmer">
      <div class="ark-hode">
        <h2>Lagrede programmer</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      ${rows || '<p class="tomt">Ingen lagrede programmer ennå. Bygg et program og trykk «Lagre som program».</p>'}
      <button type="button" class="knapp sekundaer bred" id="mal-importer">Importer program</button>
    </div>`;

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));
  host.querySelectorAll('.plan-bib-bruk[data-modus]').forEach((btn) => {
    btn.addEventListener('click', () => {
      host.innerHTML = '';
      onSelect(btn.dataset.id, btn.dataset.modus === 'erstatt');
    });
  });
  host.querySelectorAll('[data-handling="eksporter"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tpl = templates.find((t) => t.id === btn.dataset.id);
      if (!tpl) return;
      openExportProgramSheet(host, tpl, exMap);
    });
  });
  host.querySelector('#mal-importer')?.addEventListener('click', () => {
    openImportProgramSheet(host, exMap, () => { host.innerHTML = ''; });
  });
}

function openExportProgramSheet(host, template, exMap) {
  const payload = programShare.buildProgramPayload(template.name, template.items, exMap);
  const code = programShare.programShareCode(payload);
  const canPublish = relay.canPublishToRelay();

  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Eksporter program">
      <div class="ark-hode">
        <h2>Eksporter program</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <p class="dus liten">«${esc(template.name || 'Program')}» — kun øvelser og foreslåtte mål, ingen treningslogger.</p>
      <div class="program-del-knapper">
        <button type="button" class="knapp primaer bred" id="prog-last-ned">Last ned JSON-fil</button>
        <button type="button" class="knapp sekundaer bred" id="prog-kopier-kode">Kopier delingskode</button>
        ${typeof navigator.share === 'function' ? '<button type="button" class="knapp sekundaer bred" id="prog-del">Del …</button>' : ''}
      </div>
      <label class="felt-navn" for="prog-kode">Delingskode</label>
      <textarea class="inndata program-kode-felt" id="prog-kode" rows="4" readonly>${esc(code)}</textarea>
      <p class="dus liten">Partner kan lime koden inn under «Importer program», eller åpne JSON-filen.</p>

      ${canPublish ? `
      <hr class="program-del-skille">
      <h3 class="program-del-under-tittel">Publiser til gruppe</h3>
      <p class="dus liten">Lag en QR-kode som flere kan skanne (f.eks. plakat på veggen).</p>
      <label class="felt-navn" for="prog-publiser-dager">Gyldig i (dager)</label>
      <input type="number" class="inndata" id="prog-publiser-dager" value="30" min="1" max="365" inputmode="numeric">
      <label class="felt-navn" for="prog-publiser-pin">PIN (valgfri)</label>
      <input type="text" class="inndata" id="prog-publiser-pin" inputmode="numeric" autocomplete="off" placeholder="F.eks. 4829">
      <label class="felt-navn" for="prog-publiser-kode">Egen kode (valgfri)</label>
      <input type="text" class="inndata" id="prog-publiser-kode" autocapitalize="characters" autocomplete="off" placeholder="Auto-genereres">
      <button type="button" class="knapp primaer bred" id="prog-publiser">Publiser og vis QR</button>
      ` : relay.isRelayConfigured() ? `
      <p class="dus liten program-relay-hint">Legg inn publiseringsnøkkel under Innstillinger for å publisere til gruppe.</p>
      ` : `
      <p class="dus liten program-relay-hint">Sett Relay-URL under Innstillinger for QR-import fra gruppe.</p>
      `}
    </div>`;

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));
  host.querySelector('#prog-last-ned').addEventListener('click', () => {
    programShare.exportProgramFile(payload);
    toast('Programfil lastet ned', 'suksess');
  });
  host.querySelector('#prog-kopier-kode').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast('Delingskode kopiert', 'suksess');
    } catch {
      host.querySelector('#prog-kode').select();
      toast('Kunne ikke kopiere — merk teksten manuelt', 'feil');
    }
  });
  host.querySelector('#prog-del')?.addEventListener('click', async () => {
    try {
      const file = new File([JSON.stringify(payload, null, 2)], programShare.defaultExportFilename(template.name), { type: 'application/json' });
      await navigator.share({
        title: template.name || 'Treningsprogram',
        text: `Treningsprogram: ${template.name || 'Program'}`,
        files: [file],
      });
    } catch {
      try {
        await navigator.share({
          title: template.name || 'Treningsprogram',
          text: code,
        });
      } catch {
        toast('Deling avbrutt', 'info');
      }
    }
  });
  host.querySelector('#prog-publiser')?.addEventListener('click', async () => {
    const btn = host.querySelector('#prog-publiser');
    btn.disabled = true;
    try {
      const result = await relay.relayPublish({
        program: payload,
        title: template.name,
        code: host.querySelector('#prog-publiser-kode')?.value,
        expiresInDays: Number(host.querySelector('#prog-publiser-dager')?.value) || 30,
        pin: host.querySelector('#prog-publiser-pin')?.value,
      });
      openPublishedProgramSheet(host, result, template.name);
    } catch (err) {
      toast(err.message || 'Publisering feilet', 'feil');
      btn.disabled = false;
    }
  });
}

function openPublishedProgramSheet(host, result, fallbackTitle) {
  const importUrl = relay.programImportUrl(result.code);
  const qrUrl = relay.qrImageUrl(importUrl);
  const title = result.title || fallbackTitle || 'Program';

  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Publisert program">
      <div class="ark-hode">
        <h2>Publisert</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <p class="dus liten">«${esc(title)}» er tilgjengelig for import til ${formatDateShort(result.expiresAt?.slice(0, 10))}.</p>
      <div class="program-qr-wrap">
        <img class="program-qr-img" src="${esc(qrUrl)}" width="280" height="280" alt="QR-kode for programimport">
      </div>
      <p class="felt-navn liten program-relay-kode">Kode: <strong>${esc(result.code)}</strong></p>
      <label class="felt-navn" for="prog-import-lenke">Importlenke</label>
      <input type="text" class="inndata" id="prog-import-lenke" readonly value="${esc(importUrl)}">
      <div class="program-del-knapper">
        <button type="button" class="knapp sekundaer bred" id="prog-kopier-lenke">Kopier lenke</button>
        <button type="button" class="knapp sekundaer bred" id="prog-skriv-ut">Skriv ut plakat</button>
      </div>
    </div>`;

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));
  host.querySelector('#prog-kopier-lenke').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(importUrl);
      toast('Lenke kopiert', 'suksess');
    } catch {
      host.querySelector('#prog-import-lenke').select();
    }
  });
  host.querySelector('#prog-skriv-ut').addEventListener('click', () => {
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) {
      toast('Kunne ikke åpne utskrift — tillat popups', 'feil');
      return;
    }
    w.document.write(`<!DOCTYPE html><html lang="nb"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>
        body { font-family: system-ui, sans-serif; text-align: center; padding: 24px; }
        h1 { font-size: 1.5rem; margin-bottom: 8px; }
        p { color: #444; }
        img { margin: 16px auto; display: block; }
        .kode { font-size: 1.25rem; letter-spacing: 0.15em; margin-top: 12px; }
      </style></head><body>
      <h1>${esc(title)}</h1>
      <p>Skann for å importere programmet i Treningsjournal</p>
      <img src="${esc(qrUrl)}" width="320" height="320" alt="">
      <p class="kode">${esc(result.code)}</p>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  });
}

function openImportProgramSheet(host, exMap, onDone) {
  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Importer program">
      <div class="ark-hode">
        <h2>Importer program</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <p class="dus liten">Lim inn delingskode, relay-kode (f.eks. K7M2XP), eller velg en JSON-fil. Kun programstruktur importeres — ikke logger.</p>
      <form id="prog-import-skjema">
        ${relay.isRelayConfigured() ? `
        <label class="felt-navn" for="prog-import-relay">Relay-kode</label>
        <div class="program-relay-rad">
          <input type="text" class="inndata" id="prog-import-relay" autocapitalize="characters" placeholder="F.eks. K7M2XP">
          <button type="button" class="knapp sekundaer" id="prog-import-relay-apne">Hent</button>
        </div>
        ` : ''}
        <label class="felt-navn" for="prog-import-tekst">Delingskode eller JSON</label>
        <textarea class="inndata" id="prog-import-tekst" rows="5" placeholder="Lim inn kode her …"></textarea>

        <label class="felt-navn" for="prog-import-fil">Eller velg fil</label>
        <input type="file" class="inndata" id="prog-import-fil" accept=".json,application/json">

        <label class="bryter-rad">
          <input type="checkbox" id="prog-import-auto" checked>
          <span>Legg til manglende øvelser automatisk</span>
        </label>

        <div id="prog-import-forhåndsvis" class="program-import-preview skjult"></div>

        <button type="submit" class="knapp primaer bred">Importer til lagrede programmer</button>
      </form>
    </div>`;

  const textEl = host.querySelector('#prog-import-tekst');
  const fileEl = host.querySelector('#prog-import-fil');
  const previewEl = host.querySelector('#prog-import-forhåndsvis');
  let pendingData = null;

  async function refreshPreview() {
    const fromFile = fileEl.files?.[0];
    let text = textEl.value.trim();
    if (fromFile) {
      text = await fromFile.text();
    }
    if (!text) {
      previewEl.classList.add('skjult');
      previewEl.innerHTML = '';
      pendingData = null;
      return;
    }
    try {
      const data = programShare.parseProgramImport(text);
      pendingData = data;
      const lines = (data.exercises || []).map((ref) => {
        const parts = [ref.name || ref.catalogId || 'Ukjent'];
        if (ref.suggestedSets && ref.suggestedReps) parts.push(`${ref.suggestedSets}×${ref.suggestedReps}`);
        else if (ref.suggestedSets) parts.push(`${ref.suggestedSets} sett`);
        if (ref.suggestedWeightKg) parts.push(`${ref.suggestedWeightKg} kg`);
        return `<li>${esc(parts.join(' · '))}</li>`;
      }).join('');
      previewEl.innerHTML = `
        <p class="felt-navn liten">${esc(data.name || 'Program')} · ${data.exercises?.length || 0} øvelse${data.exercises?.length === 1 ? '' : 'r'}</p>
        <ul class="program-import-liste">${lines}</ul>`;
      previewEl.classList.remove('skjult');
    } catch (err) {
      pendingData = null;
      previewEl.innerHTML = `<p class="program-import-feil liten">${esc(err.message || 'Ugyldig program')}</p>`;
      previewEl.classList.remove('skjult');
    }
  }

  textEl.addEventListener('input', refreshPreview);
  fileEl.addEventListener('change', () => {
    if (fileEl.files?.[0]) textEl.value = '';
    refreshPreview();
  });

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));

  host.querySelector('#prog-import-relay-apne')?.addEventListener('click', () => {
    const k = host.querySelector('#prog-import-relay')?.value.trim();
    if (!k) {
      toast('Skriv inn relay-kode', 'feil');
      return;
    }
    location.hash = `#/program?k=${encodeURIComponent(k.toUpperCase())}`;
  });

  host.querySelector('#prog-import-skjema').addEventListener('submit', async (e) => {
    e.preventDefault();
    await refreshPreview();
    if (!pendingData) {
      toast('Lim inn gyldig programkode eller velg fil først', 'feil');
      return;
    }
    const autoAdd = host.querySelector('#prog-import-auto').checked;
    try {
      const { name, items, warnings } = await programShare.importProgramData(pendingData, { autoAddMissing: autoAdd });
      await store.saveAsTemplate(name, items);
      host.innerHTML = '';
      const warn = warnings.length ? ` (${warnings.length} hoppet over)` : '';
      toast(`«${name}» importert${warn}`, warnings.length ? 'info' : 'suksess');
      onDone?.();
    } catch (err) {
      toast(err.message || 'Import feilet', 'feil');
    }
  });
}

function openSaveTemplateSheet(host, items, exMap, setsByEx, defaultDate, onSave, opts = {}) {
  const {
    title = 'Lagre som program',
    intro = `${items.length} øvelse${items.length === 1 ? '' : 'r'} lagres i biblioteket ditt som gjenbrukbar mal.`,
    defaultName = '',
    goalsChecked = false,
  } = opts;
  const today = todayStr();
  const malRows = items.map((it) => {
    const ex = exMap.get(it.exerciseId);
    const name = ex?.name || 'Ukjent øvelse';
    const logMode = ex ? store.logModeOf(ex) : 'weight';
    const showWeight = logMode === 'weight';
    const val = (key) => it[key] ?? '';
    return `
      <div class="plan-mal-lagre-rad" data-mal-ex="${it.exerciseId}">
        <span class="plan-mal-lagre-navn">${esc(name)}</span>
        <div class="plan-mal-rad plan-mal-rad--kompakt">
          <label class="plan-mal-celle">
            <span class="dus">Sett</span>
            <input type="number" class="inndata mal-mal-inp" data-felt="suggestedSets"
              value="${val('suggestedSets')}" min="1" max="20" placeholder="–" inputmode="numeric">
          </label>
          <label class="plan-mal-celle">
            <span class="dus">Reps</span>
            <input type="number" class="inndata mal-mal-inp" data-felt="suggestedReps"
              value="${val('suggestedReps')}" min="1" max="99" placeholder="–" inputmode="numeric">
          </label>
          ${showWeight ? `
          <label class="plan-mal-celle">
            <span class="dus">kg</span>
            <input type="number" class="inndata mal-mal-inp" data-felt="suggestedWeightKg"
              value="${val('suggestedWeightKg')}" min="0" step="0.5" placeholder="–" inputmode="decimal">
          </label>` : ''}
        </div>
      </div>`;
  }).join('');

  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="${esc(title)}">
      <div class="ark-hode">
        <h2>${esc(title)}</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <p class="dus liten">${intro}</p>
      <form id="lagre-mal-skjema">
        <label class="felt-navn" for="mal-navn">Navn</label>
        <input type="text" class="inndata" id="mal-navn" placeholder="F.eks. Uke A" value="${esc(defaultName)}" required autofocus>

        <label class="bryter-rad">
          <input type="checkbox" id="mal-med-mal" ${goalsChecked ? 'checked' : ''}>
          <span>Inkluder mål per øvelse</span>
        </label>

        <div id="mal-mal-wrap" class="${goalsChecked ? '' : 'skjult'}">
          <div class="plan-mal-liste">${malRows}</div>
          <button type="button" class="knapp sekundaer liten" id="mal-fra-logging">Fyll inn fra dagens logging</button>
        </div>

        <label class="bryter-rad">
          <input type="checkbox" id="mal-planlegg">
          <span>Legg også på kalender</span>
        </label>

        <div id="mal-dato-wrap" class="skjult">
          <label class="felt-navn" for="mal-dato">Dato</label>
          <input type="date" class="inndata" id="mal-dato" value="${defaultDate}" min="${today}">
        </div>

        <button type="submit" class="knapp primaer bred">Lagre program</button>
      </form>
    </div>`;

  const malCb = host.querySelector('#mal-med-mal');
  const malWrap = host.querySelector('#mal-mal-wrap');
  malCb.addEventListener('change', () => {
    malWrap.classList.toggle('skjult', !malCb.checked);
  });

  host.querySelector('#mal-fra-logging')?.addEventListener('click', () => {
    for (const it of items) {
      const row = host.querySelector(`[data-mal-ex="${it.exerciseId}"]`);
      if (!row) continue;
      const sug = store.suggestionsFromLoggedSets(setsByEx.get(it.exerciseId) || []);
      row.querySelectorAll('.mal-mal-inp').forEach((inp) => {
        const v = sug[inp.dataset.felt];
        inp.value = v != null ? v : '';
      });
    }
    toast('Mål hentet fra dagens logging', 'suksess');
  });

  const planleggCb = host.querySelector('#mal-planlegg');
  const datoWrap = host.querySelector('#mal-dato-wrap');
  planleggCb.addEventListener('change', () => {
    datoWrap.classList.toggle('skjult', !planleggCb.checked);
  });

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));
  host.querySelector('#lagre-mal-skjema').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = host.querySelector('#mal-navn').value.trim();
    if (!name) return;
    const scheduleDate = planleggCb.checked ? host.querySelector('#mal-dato').value : null;
    let saveItems;
    if (malCb.checked) {
      saveItems = items.map((it) => {
        const row = host.querySelector(`[data-mal-ex="${it.exerciseId}"]`);
        const raw = { exerciseId: it.exerciseId };
        row?.querySelectorAll('.mal-mal-inp').forEach((inp) => {
          const v = inp.value.trim();
          if (v) raw[inp.dataset.felt] = v;
        });
        return store.sanitizePlanItem(raw);
      });
    } else {
      saveItems = items.map((it) => store.sanitizePlanItem({ exerciseId: it.exerciseId }));
    }
    host.innerHTML = '';
    onSave({ name, scheduleDate, saveItems });
  });
}
