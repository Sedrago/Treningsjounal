/**
 * views/strength.js – Styrketrening: én side for program, logging og maler.
 */

import * as store from '../store.js';
import { initContent, getCatalogByCategory, getCatalogEntry, getDescription } from '../content.js';
import { openForm } from './exercises.js';
import { descriptionBlock, bindDescriptionToggles } from './exercise-library.js';
import { mountSetLogger } from '../session-log.js';
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
  let done = 0;
  for (const item of items) {
    const logged = new Set((setsByEx.get(item.exerciseId) || []).map((s) => s.setNumber)).size;
    if (logged >= item.goalSets) done += 1;
  }
  return { done, total: items.length };
}

function statusLine(plan, items, todaySets) {
  if (!items.length) return 'Tomt program';
  const { done, total } = sessionProgress(items, todaySets);
  if (!todaySets.length) return `${total} øvelse${total === 1 ? '' : 'r'} klar`;
  if (done >= total) return `Fullført ${done}/${total} øvelser i dag`;
  return `Pågår – ${done}/${total} øvelser fullført`;
}

const FOCUS_KEY = 'styrkeFocusEx';
const SESSION_KEY = 'styrkeSessionActive';
const TEKNIKK_KEY = 'styrkeTeknikkEx';
const EXPAND_KEY = 'styrkeRadUtvid';

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

function resolveActive(items, setsByEx, exMap) {
  if (!items.length) return null;

  const focusId = sessionStorage.getItem(FOCUS_KEY);
  let exIndex = focusId ? items.findIndex((it) => it.exerciseId === focusId) : -1;
  const explicitFocus = exIndex >= 0;

  if (exIndex < 0) {
    exIndex = items.findIndex((it) => {
      const logged = new Set((setsByEx.get(it.exerciseId) || []).map((s) => s.setNumber)).size;
      return logged < it.goalSets;
    });
  }
  if (exIndex < 0) exIndex = 0;

  const item = items[exIndex];
  const exercise = exMap.get(item.exerciseId);
  const persisted = setsByEx.get(item.exerciseId) || [];
  const loggedNums = new Set(persisted.map((s) => s.setNumber));

  let setNum = 1;
  for (let n = 1; n <= item.goalSets; n++) {
    if (!loggedNums.has(n)) {
      setNum = n;
      break;
    }
    setNum = n;
  }

  const allDone = loggedNums.size >= item.goalSets;
  if (allDone && explicitFocus) {
    return { exIndex, item, exercise, setNum: item.goalSets, allComplete: false };
  }

  if (allDone && !explicitFocus) {
    const nextIdx = items.findIndex((it, i) => {
      if (i <= exIndex) return false;
      const logged = new Set((setsByEx.get(it.exerciseId) || []).map((s) => s.setNumber)).size;
      return logged < it.goalSets;
    });
    if (nextIdx >= 0) {
      const nextItem = items[nextIdx];
      const nextPersisted = setsByEx.get(nextItem.exerciseId) || [];
      const nextLogged = new Set(nextPersisted.map((s) => s.setNumber));
      let nextSet = 1;
      for (let n = 1; n <= nextItem.goalSets; n++) {
        if (!nextLogged.has(n)) {
          nextSet = n;
          break;
        }
      }
      return {
        exIndex: nextIdx,
        item: nextItem,
        exercise: exMap.get(nextItem.exerciseId),
        setNum: nextSet,
        allComplete: false,
      };
    }
    return { exIndex, item, exercise, setNum, allComplete: true };
  }

  return { exIndex, item, exercise, setNum, allComplete: false };
}

/** Eksportert for hjemskjermen. */
export async function homeStrengthLabel() {
  const enriched = await store.getEnrichedSets();
  const today = todayStr();
  const plan = await store.getActivePlan();
  const items = plan?.items || [];
  const todaySets = enriched.filter((s) => s.date === today);
  if (!items.length && !todaySets.length) {
    return { title: 'Styrketrening', sub: 'Bygg dagens program' };
  }
  const { done, total } = sessionProgress(items, todaySets);
  if (todaySets.length && done < total) {
    return { title: 'Fortsett styrketrening', sub: `${done}/${total || items.length} øvelser fullført` };
  }
  if (items.length && !todaySets.length) {
    return { title: 'Styrketrening', sub: `${items.length} øvelse${items.length === 1 ? '' : 'r'} klar` };
  }
  return { title: 'Styrketrening', sub: statusLine(plan, items, todaySets) };
}

export async function render(container) {
  await initContent();
  const enriched = await store.getEnrichedSets();
  const today = todayStr();
  const todaySets = enriched.filter((s) => s.date === today);
  const exercises = await store.getExercises({ includeInactive: true });
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const plan = await store.getActivePlan();
  const items = plan?.items || [];
  const stats = categoryStats(enriched);
  const workouts = await store.getWorkouts();
  const todayWorkout = workouts.find((w) => w.date === today) || null;

  const setsByEx = groupBy(todaySets, (s) => s.exerciseId);
  const { done: progDone, total: progTotal } = sessionProgress(items, todaySets);
  const allProgramDone = items.length > 0 && progDone >= progTotal && progTotal > 0;
  const hasPartialLog = todaySets.length > 0 && !allProgramDone;

  // Fortsett automatisk hvis økt pågår; ellers kreves «Start økt».
  if (allProgramDone || !items.length) {
    sessionStorage.removeItem(SESSION_KEY);
  } else if (hasPartialLog) {
    sessionStorage.setItem(SESSION_KEY, '1');
  }
  const sessionActive = sessionStorage.getItem(SESSION_KEY) === '1' && items.length > 0;
  const active = sessionActive ? resolveActive(items, setsByEx, exMap) : null;
  const teknikkOpenId = sessionStorage.getItem(TEKNIKK_KEY);
  const expandedId = sessionStorage.getItem(EXPAND_KEY);

  container.classList.toggle('app--styrke-oktt', sessionActive);

  const rows = items.map((item, i) => {
    const ex = exMap.get(item.exerciseId);
    const name = ex ? ex.name : 'Ukjent øvelse';
    const cat = ex ? store.categoryById(ex.category) : null;
    const logged = new Set((setsByEx.get(item.exerciseId) || []).map((s) => s.setNumber)).size;
    const done = logged >= item.goalSets;
    const isActive = sessionActive && active && active.exIndex === i && !allProgramDone;
    const isExpanded = expandedId === item.exerciseId;
    const showDetails = isExpanded;
    const compact = !isExpanded;
    const showTeknikk = isExpanded && teknikkOpenId === item.exerciseId;
    const hasTeknikk = ex && (getDescription(ex) || ex.notes?.trim() || ex.video?.trim());

    const progress = sessionActive ? `
      <span class="styrke-rad-fremdrift dus liten">${logged}/${item.goalSets}</span>` : '';

    const expandBtn = `
        <button type="button" class="ikon-knapp styrke-rad-utvid" data-handling="utvid"
          aria-label="${isExpanded ? 'Skjul valg' : 'Vis valg'}" aria-expanded="${isExpanded ? 'true' : 'false'}">⌄</button>`;

    const setVelger = showDetails ? `
        <span class="plan-sett-velger">
          <button type="button" class="plan-sett-knapp" data-handling="sett-minus" aria-label="Færre sett">−</button>
          <span class="plan-sett-antall">${item.goalSets} sett</span>
          <button type="button" class="plan-sett-knapp" data-handling="sett-pluss" aria-label="Flere sett">+</button>
        </span>` : '';

    const rowActions = showDetails ? `
        <span class="plan-rad-handlinger">
          <button type="button" class="ikon-knapp" data-handling="opp" aria-label="Flytt opp" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="ikon-knapp" data-handling="ned" aria-label="Flytt ned" ${i === items.length - 1 ? 'disabled' : ''}>↓</button>
          ${hasTeknikk ? '<button type="button" class="ikon-knapp styrke-teknikk-knapp" data-handling="teknikk" aria-label="Vis teknikk" aria-pressed="' + (showTeknikk ? 'true' : 'false') + '">i</button>' : ''}
          <button type="button" class="ikon-knapp" data-handling="fjern" aria-label="Fjern">✕</button>
        </span>` : '';

    return `
      <div class="plan-rad styrke-rad styrke-rad--liste ${sessionActive ? 'styrke-rad--oktt' : ''} ${done ? 'ferdig' : ''} ${isActive ? 'styrke-rad--aktiv' : ''} ${compact ? 'styrke-rad--kompakt' : 'styrke-rad--utvidet'}"
        data-idx="${i}" data-ex-id="${item.exerciseId}">
        <div class="styrke-lenke">
          <span class="plan-rekkefolge">${done ? '✓' : i + 1}</span>
          ${cat ? `<span class="styrke-rad-kat">${categoryIconHtml(cat, 'kategori-ikon styrke-kat-ikon')}</span>` : ''}
          <span class="plan-okt-info">
            <span class="plan-navn">${esc(name)}</span>
          </span>
        </div>
        ${progress}
        ${expandBtn}
        ${setVelger}
        ${rowActions}
        ${showTeknikk ? renderInlineTeknikk(ex, cat) : ''}
      </div>`;
  }).join('');

  const menuItems = [
    { action: 'historikk', label: 'Hent fra tidligere økt' },
    { action: 'mal', label: 'Lagrede programmer' },
    ...(items.length ? [{ action: 'lagre-mal', label: 'Lagre som program' }] : []),
    ...(items.length ? [{ action: 'tom', label: 'Tøm program', farlig: true }] : []),
    ...(sessionActive ? [{ action: 'pause', label: 'Pause økt' }] : []),
  ];

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/hjem" class="tilbake" aria-label="Tilbake til hjem">‹</a>
      <div>
        <h1>Styrketrening</h1>
        <p class="dus">${formatDateLong(today)} · ${esc(statusLine(plan, items, todaySets))}</p>
      </div>
    </header>

    <section class="kort styrke-program" aria-label="Dagens program">
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

    ${!sessionActive && items.length ? '<button type="button" class="knapp primaer stor" id="start-okt">Start økt</button>' : ''}
    <button type="button" class="knapp sekundaer bred" id="legg-til-ovelse">+ Legg til øvelse</button>

    <section class="kort">
      <label class="felt-navn" for="okt-notat">Notat for økten</label>
      <textarea id="okt-notat" class="inndata" rows="2"
        placeholder="Dagsform, fokus …">${esc(todayWorkout?.notes || '')}</textarea>
    </section>

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
    if (plan && !newItems.length) {
      await store.deletePlan(plan.id);
    } else if (plan) {
      await store.savePlan({ ...plan, items: newItems, date: today });
    } else if (newItems.length) {
      await store.savePlan({ items: newItems, status: 'aktiv', date: today });
    }
    render(container);
  }

  container.querySelector('#okt-notat')?.addEventListener('input', debounce(async (e) => {
    const w = await store.getOrCreateTodayWorkout();
    w.notes = e.target.value;
    await store.saveWorkout(w);
  }, 600));

  function addExercise(exercise) {
    const next = [...items.map((it) => ({ ...it })), {
      exerciseId: exercise.id,
      goalSets: Number(exercise.goalSets),
    }];
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
        }, () => render(container));
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
          await store.loadTemplateIntoActive(templateId);
        } else {
          const existing = new Set(items.map((it) => it.exerciseId));
          const merged = [...items.map((it) => ({ ...it }))];
          for (const it of tpl.items) {
            if (!existing.has(it.exerciseId)) merged.push({ ...it });
          }
          await updateItems(merged);
        }
        toast(`«${tpl.name || 'Program'}» lastet inn`, 'suksess');
      });
    } else if (action === 'lagre-mal') {
      openSaveTemplateSheet(host, items, async (name) => {
        await store.saveAsTemplate(name, items.map((it) => ({ ...it })));
        toast(`Programmet «${name}» er lagret`, 'suksess');
      });
    } else if (action === 'tom') {
      if (!confirm('Tømme hele programmet? Loggede sett i dag beholdes.')) return;
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(FOCUS_KEY);
      sessionStorage.removeItem(TEKNIKK_KEY);
      sessionStorage.removeItem(EXPAND_KEY);
      if (plan) await store.deletePlan(plan.id);
      render(container);
    } else if (action === 'pause') {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(FOCUS_KEY);
      sessionStorage.removeItem(TEKNIKK_KEY);
      sessionStorage.removeItem(EXPAND_KEY);
      render(container);
    }
  }

  container.querySelector('#start-okt')?.addEventListener('click', () => {
    if (!items.length) return;
    sessionStorage.setItem(SESSION_KEY, '1');
    render(container);
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
        render(container);
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
          render(container);
          return;
        }
        if (action === 'teknikk') {
          const open = sessionStorage.getItem(TEKNIKK_KEY) === row.dataset.exId;
          if (open) sessionStorage.removeItem(TEKNIKK_KEY);
          else sessionStorage.setItem(TEKNIKK_KEY, row.dataset.exId);
          render(container);
          return;
        }
        if (action === 'teknikk-lukk') {
          if (e.target.closest('[data-handling="video"]')) return;
          sessionStorage.removeItem(TEKNIKK_KEY);
          render(container);
          return;
        }
        const next = items.map((it) => ({ ...it }));
        if (action === 'fjern') next.splice(idx, 1);
        else if (action === 'opp' && idx > 0) [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
        else if (action === 'ned' && idx < next.length - 1) [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
        else if (action === 'sett-minus') next[idx].goalSets = Math.max(1, next[idx].goalSets - 1);
        else if (action === 'sett-pluss') next[idx].goalSets = Math.min(10, next[idx].goalSets + 1);
        await updateItems(next);
      });
    });
    row.querySelector('.styrke-rad-teknikk')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        sessionStorage.removeItem(TEKNIKK_KEY);
        render(container);
      }
    });
  });

  container.querySelector('.styrke-rad--aktiv')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

  const sessionHost = container.querySelector('#oktt-panel');
  if (sessionActive) {
    const workout = todayWorkout || await store.getOrCreateTodayWorkout();
    const moodHost = container.querySelector('#oktt-mood');
    if (moodHost && await workoutNeedsMood(workout.id)) {
      mountMoodInline(moodHost, { workoutId: workout.id, onDone: () => render(container) });
    } else if (moodHost) {
      moodHost.innerHTML = '';
    }
  }

  if (sessionActive && allProgramDone) {
    sessionHost.innerHTML = `
      <div class="oktt-panel oktt-panel--overlay oktt-ferdig">
        <p class="oktt-overlay-tittel"><strong>Program fullført</strong></p>
        <button type="button" class="knapp primaer oktt-lagre" id="oktt-ferdig">Ferdig</button>
      </div>`;
    sessionHost.querySelector('#oktt-ferdig').addEventListener('click', () => {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(FOCUS_KEY);
      sessionStorage.removeItem(TEKNIKK_KEY);
      sessionStorage.removeItem(EXPAND_KEY);
      render(container);
    });
  } else if (sessionActive && active?.exercise) {
    const exSets = setsByEx.get(active.item.exerciseId) || [];
    const persistedSet = exSets.find((s) => s.setNumber === active.setNum) || null;
    const prevSet = exSets.find((s) => s.setNumber === active.setNum - 1)
      || (await store.getLastSessionForExercise(active.item.exerciseId, today))?.sets?.[active.setNum - 1]
      || (await store.getLastSessionForExercise(active.item.exerciseId, today))?.sets?.slice(-1)[0]
      || null;

    await mountSetLogger(sessionHost, {
      exercise: active.exercise,
      setNumber: active.setNum,
      goalSets: active.item.goalSets,
      persistedSet,
      templateSet: prevSet,
      compact: true,
      onSaved: () => {
        sessionStorage.removeItem(FOCUS_KEY);
        toast('Sett lagret', 'suksess');
        render(container);
      },
    });
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

/** Bunn-ark: velg blant mine øvelser + biblioteket for en kategori. */
async function openExercisePicker(host, categoryId, planItems, onPick, onEdited) {
  const category = store.categoryById(categoryId);
  const mine = await store.getExercisesByCategory(categoryId);
  const activeCatalogIds = new Set(await store.getActiveCatalogIds());
  const catalogRest = getCatalogByCategory(categoryId)
    .filter((c) => !activeCatalogIds.has(c.id));
  const inPlan = new Set(planItems.map((it) => it.exerciseId));
  const mineById = new Map(mine.map((e) => [e.id, e]));

  const mineRows = mine.map((e) => `
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

  const bibRows = catalogRest.map((c) => `
    <article class="plan-bib-rad" data-id="${esc(c.id)}">
      <div class="plan-bib-topp">
        <h3 class="plan-bib-navn">${esc(c.name)}</h3>
        <button type="button" class="plan-bib-bruk" data-id="${esc(c.id)}">Bruk denne →</button>
      </div>
      ${descriptionBlock(c.description, 120)}
    </article>`).join('');

  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Velg øvelse for ${esc(category.name)}">
      <div class="ark-hode">
        <h2 class="kategori-tittel">${categoryIconHtml(category)} ${esc(category.name)}</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      ${mineRows ? `<p class="felt-navn plan-bib-tittel">Mine øvelser</p>${mineRows}` : '<p class="dus liten">Ingen egne øvelser i kategorien ennå.</p>'}
      ${bibRows ? `<p class="felt-navn plan-bib-tittel">Fra biblioteket</p>${bibRows}` : ''}
      <form class="ny-ovelse-skjema">
        <input type="text" class="inndata" name="navn" placeholder="Ny øvelse …" aria-label="Navn på ny øvelse">
        <button type="submit" class="knapp sekundaer">Legg til</button>
      </form>
    </div>`;

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));
  bindDescriptionToggles(host, (id) => {
    const entry = getCatalogEntry(id);
    if (entry?.description) return entry.description;
    const ex = mineById.get(id);
    return ex ? exercisePickerDescription(ex) : '';
  });

  host.querySelectorAll('.plan-bib-bruk').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      const catalogEntry = getCatalogEntry(btn.dataset.id);
      if (catalogEntry) {
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
      const dayItems = [...byEx.entries()].map(([exerciseId, exSets]) => ({
        exerciseId,
        goalSets: new Set(exSets.map((s) => s.setNumber)).size || exSets.length,
      })).filter((it) => exMap.has(it.exerciseId));
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
    </div>`;

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));
  host.querySelectorAll('.plan-bib-bruk[data-modus]').forEach((btn) => {
    btn.addEventListener('click', () => {
      host.innerHTML = '';
      onSelect(btn.dataset.id, btn.dataset.modus === 'erstatt');
    });
  });
}

function openSaveTemplateSheet(host, items, onSave) {
  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Lagre program">
      <div class="ark-hode">
        <h2>Lagre som program</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <p class="dus liten">${items.length} øvelse${items.length === 1 ? '' : 'r'} lagres som mal du kan gjenbruke senere.</p>
      <form id="lagre-mal-skjema">
        <label class="felt-navn" for="mal-navn">Navn</label>
        <input type="text" class="inndata" id="mal-navn" placeholder="F.eks. Uke A" required autofocus>
        <button type="submit" class="knapp primaer bred">Lagre program</button>
      </form>
    </div>`;

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));
  host.querySelector('#lagre-mal-skjema').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = host.querySelector('#mal-navn').value.trim();
    if (!name) return;
    host.innerHTML = '';
    onSave(name);
  });
}
