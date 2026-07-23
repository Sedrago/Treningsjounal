/**
 * views/strength.js – Styrketrening: én side for program, logging og maler.
 */

import * as store from '../store.js';
import { initContent, getDescription } from '../content.js';
import { mountSetLogger, completedSetsHtml, bindCompletedSetsList, PANEL_EXPANDED_KEY } from '../session-log.js';
import { mountMoodInline, workoutNeedsMood } from '../mood-prompt.js';
import { groupBy } from '../stats.js';
import { defaultProgramName, openSaveTemplateSheet } from '../program-ui.js';
import { categoryStats, openCategoryPicker, openExercisePicker } from '../program-pickers.js';
import {
  esc, formatDateShort, formatDateLong, todayStr,
  toast, categoryIconHtml, debounce, planMalSelector,
} from '../utils.js';

function sessionProgress(items, todaySets) {
  const setsByEx = groupBy(todaySets, (s) => s.exerciseId);
  let started = 0;
  for (const item of items) {
    if ((setsByEx.get(item.exerciseId) || []).length) started += 1;
  }
  return { started, total: items.length };
}

function statusLine(plan, items, todaySets, sessionEnded = false) {
  if (sessionEnded && todaySets.length) return 'Økt avsluttet i dag';
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
    <div class="plan-mal-felt" data-plan-mal="${esc(item.exerciseId)}">
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
  const block = host.dataset?.planMal === String(item.exerciseId)
    ? host
    : host.querySelector(planMalSelector(item.exerciseId));
  if (!block) return store.sanitizePlanItem({ exerciseId: item.exerciseId });
  const raw = { exerciseId: item.exerciseId };
  block.querySelectorAll('.plan-mal-inp').forEach((inp) => {
    const v = inp.value.trim();
    if (v) raw[inp.dataset.felt] = v;
  });
  return store.sanitizePlanItem(raw);
}

function exerciseIdsForItem(item, exMap) {
  const ex = store.getExerciseFromMap(exMap, item.exerciseId);
  return [...new Set([item.exerciseId, ex?.id, ex?.catalogId].filter(Boolean))];
}

function setsForPlanItem(item, setsByEx, exMap) {
  const seen = new Set();
  const out = [];
  for (const id of exerciseIdsForItem(item, exMap)) {
    for (const s of setsByEx.get(id) || []) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }
  }
  return out.sort((a, b) => a.setNumber - b.setNumber);
}

function findItemIndexByFocus(items, focusId, exMap) {
  if (!focusId) return -1;
  return items.findIndex((it) => exerciseIdsForItem(it, exMap).includes(focusId));
}

function previousSetTemplate(exSets, setNum) {
  if (setNum <= 1) return null;
  const prev = exSets.find((s) => s.setNumber === setNum - 1);
  if (prev) return prev;
  return exSets
    .filter((s) => s.setNumber < setNum)
    .sort((a, b) => b.setNumber - a.setNumber)[0] || null;
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
  let exIndex = findItemIndexByFocus(items, focusId, exMap);

  if (exIndex < 0) {
    exIndex = items.findIndex((it) => !setsForPlanItem(it, setsByEx, exMap).length);
    if (exIndex < 0) exIndex = 0;
  }

  const item = items[exIndex];
  sessionStorage.setItem(FOCUS_KEY, item.exerciseId);
  const exercise = store.getExerciseFromMap(exMap, item.exerciseId);
  const persisted = setsForPlanItem(item, setsByEx, exMap);
  const setNum = nextSetNumber(persisted);

  return { exIndex, item, exercise, setNum };
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
  const workout = await store.getWorkoutByDate(today);
  if (workout?.sessionCompletedAt && todaySets.length) {
    return { title: 'Styrketrening', sub: 'Økt avsluttet i dag' };
  }
  if (!items.length && !todaySets.length) {
    return { title: 'Styrketrening', sub: 'Se kalender eller velg program' };
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
  const exMap = store.buildExerciseMap(exercises);
  const plan = await store.getWorkoutPlanForDate(viewDate);
  const items = plan?.items || [];
  const stats = categoryStats(enriched);
  const workouts = await store.getWorkouts();
  const dayWorkout = workouts.find((w) => w.date === viewDate) || null;

  const setsByEx = groupBy(daySets, (s) => s.exerciseId);
  const hasPartialLog = daySets.length > 0;
  const sessionEndedToday = Boolean(dayWorkout?.sessionCompletedAt);

  if (!isToday || !items.length) {
    if (!isToday) sessionStorage.removeItem(SESSION_KEY);
  }
  const sessionActive = isToday && items.length > 0
    && !sessionEndedToday
    && sessionStorage.getItem(SESSION_KEY) === '1';
  const active = sessionActive ? resolveActive(items, setsByEx, exMap) : null;
  const teknikkOpenId = sessionStorage.getItem(TEKNIKK_KEY);
  const expandedId = sessionStorage.getItem(EXPAND_KEY);

  container.classList.toggle('app--styrke-oktt', sessionActive);

  const rows = items.map((item, i) => {
    const ex = store.getExerciseFromMap(exMap, item.exerciseId);
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
    const completedSetsBlock = !sessionActive && showDetails && ex
      ? completedSetsHtml(ex, exSetsToday, store.getSetting('units'))
      : '';

    return `
      <div class="plan-rad styrke-rad styrke-rad--liste ${sessionActive ? 'styrke-rad--oktt' : ''} ${isActive ? 'styrke-rad--aktiv' : ''} ${compact ? 'styrke-rad--kompakt' : 'styrke-rad--utvidet'}"
        data-idx="${i}" data-ex-id="${esc(item.exerciseId)}">
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
    ...(items.length ? [{ action: 'lagre-mal', label: 'Lagre som program' }] : []),
    ...(items.length ? [{ action: 'tom', label: 'Tøm program', farlig: true }] : []),
    ...(isToday && !sessionEndedToday && hasPartialLog
      ? [{ action: 'avslutt', label: 'Avslutt økt' }]
      : []),
  ];

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/styrketrening" class="tilbake" aria-label="Tilbake til styrketrening">‹</a>
      <div>
        <h1>Styrketrening</h1>
        <p class="dus">${formatDateLong(viewDate)}${plan?.name ? ` · ${esc(plan.name)}` : ''}${isToday ? ` · ${esc(statusLine(plan, items, daySets, sessionEndedToday))}` : viewDate > today ? ' · Planlagt' : ''}</p>
        <p class="styrke-nav-lenker dus liten"><a href="#/programmer">Programmer</a> · <a href="#/kalender">Kalender</a></p>
      </div>
    </header>

    ${isToday && !items.length && !daySets.length ? `
    <section class="kort">
      <p class="dus">Ingen program planlagt i dag. <a href="#/kalender">Se kalender</a> eller <a href="#/programmer">velg program</a>.</p>
    </section>` : ''}

    <section class="kort styrke-program" aria-label="${isToday ? 'Dagens program' : 'Program'}">
      <div class="styrke-program-hode">
        <h2 class="kort-tittel">Program${items.length ? ` (${items.length})` : ''}</h2>
        ${menuItems.length ? `
        <div class="styrke-meny-wrap">
          <button type="button" class="ikon-knapp styrke-meny" id="program-meny" aria-label="Programmeny" aria-haspopup="menu" aria-expanded="false">☰</button>
          <div class="styrke-meny-popover skjult" id="program-meny-liste" role="menu">
            ${menuItems.map((m) => m.sep
    ? '<div class="styrke-meny-skille" role="separator"></div>'
    : `<button type="button" class="styrke-meny-valg ${m.farlig ? 'farlig' : ''}" role="menuitem" data-program-handling="${m.action}">${esc(m.label)}</button>`).join('')}
          </div>
        </div>` : ''}
      </div>
      <div id="styrke-liste">${rows}</div>
    </section>

    ${isToday && !sessionActive && !sessionEndedToday && items.length
      ? `<button type="button" class="knapp primaer stor" id="start-okt">${hasPartialLog ? 'Fortsett økt' : 'Start økt'}</button>`
      : ''}
    ${isToday && sessionEndedToday && hasPartialLog
      ? '<p class="dus liten styrke-okt-avsluttet">Økt avsluttet for i dag. Loggede sett finnes i historikk.</p>'
      : ''}
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
    menuList?.classList.add('skjult');
    menuBtn?.setAttribute('aria-expanded', 'false');
  }

  function openMenu() {
    if (!menuList || !menuBtn) return;
    menuList.classList.remove('skjult');
    const rect = menuBtn.getBoundingClientRect();
    const width = menuList.offsetWidth || 220;
    menuList.style.top = `${Math.round(rect.bottom + 4)}px`;
    menuList.style.left = `${Math.round(Math.max(8, rect.right - width))}px`;
    menuList.style.right = 'auto';
    menuBtn.setAttribute('aria-expanded', 'true');
  }

  menuBtn?.addEventListener('click', (e) => {
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
    if (action === 'legg-til') {
      openCategoryPicker(host, stats, (catId) => {
        openExercisePicker(host, catId, items, (ex) => {
          host.innerHTML = '';
          addExercise(ex);
          toast(`«${ex.name}» lagt til`, 'suksess');
        }, () => render(container, params, query));
      });
    } else if (action === 'avslutt') {
      if (!confirm('Avslutte økten for i dag? Loggede sett beholdes.')) return;
      await store.completeStrengthSession(viewDate);
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(FOCUS_KEY);
      sessionStorage.removeItem(TEKNIKK_KEY);
      sessionStorage.removeItem(EXPAND_KEY);
      toast('Økt avsluttet', 'suksess');
      render(container, params, query);
    } else if (action === 'lagre-mal') {
      openSaveTemplateSheet(host, items, exMap, setsByEx, viewDate, async ({ name, scheduleDate, saveItems }) => {
        const finalName = name || defaultProgramName(saveItems, scheduleDate || viewDate);
        await store.saveAsTemplate(finalName, saveItems, { scheduleDate });
        toast(scheduleDate
          ? `«${finalName}» lagret og lagt på ${formatDateShort(scheduleDate)}`
          : `Programmet «${finalName}» er lagret`, 'suksess');
      });
    } else if (action === 'tom') {
      if (!confirm('Tømme hele programmet? Loggede sett beholdes.')) return;
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(FOCUS_KEY);
      sessionStorage.removeItem(TEKNIKK_KEY);
      sessionStorage.removeItem(EXPAND_KEY);
      await store.savePlanForDate(viewDate, { id: plan?.id, items: [], name: '', sourceTemplateId: '' });
      render(container, params, query);
    }
  }

  container.querySelector('#start-okt')?.addEventListener('click', async () => {
    if (!items.length) return;
    if (isToday) await store.reopenStrengthSession(viewDate);
    sessionStorage.setItem(SESSION_KEY, '1');
    sessionStorage.setItem(PANEL_EXPANDED_KEY, '1');
    render(container, params, query);
  });

  container.querySelector('#legg-til-ovelse')?.addEventListener('click', () => handleProgramAction('legg-til'));

  menuList?.querySelectorAll('[data-program-handling]').forEach((btn) => {
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
        sessionStorage.setItem(PANEL_EXPANDED_KEY, '1');
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
    const exSets = setsForPlanItem(active.item, setsByEx, exMap);
    const persistedSet = exSets.find((s) => s.setNumber === active.setNum) || null;
    const prevSet = previousSetTemplate(exSets, active.setNum);

    await mountSetLogger(sessionHost, {
      exercise: active.exercise,
      setNumber: active.setNum,
      persistedSet,
      templateSet: prevSet,
      planItem: active.item,
      completedSets: exSets.filter((s) => s.setNumber !== active.setNum),
      compact: true,
      beforeDate: today,
      onSaved: () => {
        sessionStorage.setItem(FOCUS_KEY, active.item.exerciseId);
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
