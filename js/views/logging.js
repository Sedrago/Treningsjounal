/**
 * views/logging.js – logging av sett: accordion, vekthjul og pills.
 * Autolagring. Forhåndsutfylling fra forrige økt; ellers kopier sett 1 til resten.
 */

import * as store from '../store.js';
import * as timer from '../timer.js';
import { initContent, getDescription } from '../content.js';
import {
  mountWeightWheel, mountPillRow, mountDurationWheel,
  mountRepStrip, effortPillOptions, rirToEffort,
} from '../pickers.js';
import {
  esc, formatDateShort, todayStr, debounce,
  weightUnit, summarizeSet, categoryIconHtml,
} from '../utils.js';

function emptySet(exerciseId, n) {
  return {
    exerciseId,
    setNumber: n,
    weight: null,
    reps: null,
    durationSec: null,
    rir: null,
    comment: '',
  };
}

function isComplete(set, logMode, showWeight) {
  if (logMode === 'duration') return set.durationSec != null;
  if (logMode === 'bodyweight' && !showWeight) return set.reps != null;
  return set.weight != null && set.reps != null;
}

function copySetValues(from, to, logMode) {
  if (logMode === 'duration') {
    to.durationSec = from.durationSec;
  } else {
    to.weight = from.weight;
    to.reps = from.reps;
  }
  to.rir = from.rir;
}

function summaryText(set, logMode, units, showWeight) {
  if (!isComplete(set, logMode, showWeight) && set.reps == null && set.durationSec == null) {
    return 'Ikke logget';
  }
  const parts = [summarizeSet(set, logMode, units)];
  if (set.rir != null) {
    const effort = effortPillOptions().find((o) => o.value === rirToEffort(set.rir));
    if (effort) parts.push(effort.label);
  }
  return parts.join(' · ');
}

export async function render(container, params) {
  await initContent();
  const exerciseId = params[0];
  const exercise = await store.getExercise(exerciseId);
  if (!exercise) {
    container.innerHTML = '<p class="tomt">Fant ikke øvelsen.</p>';
    return;
  }

  const category = store.categoryById(exercise.category);
  const logMode = store.logModeOf(exercise);
  const units = store.getSetting('units');
  const unit = weightUnit(units);
  const today = todayStr();
  const defaultRir = Number(store.getSetting('defaultRir'));

  const lastSession = await store.getLastSessionForExercise(exerciseId, today);
  const workouts = await store.getWorkouts();
  const todayWorkout = workouts.find((w) => w.date === today) || null;
  let persisted = [];
  if (todayWorkout) {
    persisted = (await store.getSetsForWorkout(todayWorkout.id))
      .filter((s) => s.exerciseId === exerciseId)
      .sort((a, b) => a.setNumber - b.setNumber);
  }

  const goalText = store.goalTextFor(exercise);
  const description = getDescription(exercise);
  const restTimes = String(store.getSetting('restTimes')).split(',')
    .map((t) => parseInt(t.trim(), 10)).filter((t) => t > 0);

  const useFirstSetTemplate = !lastSession && !persisted.length;
  let showWeight = logMode === 'weight'
    || (logMode === 'bodyweight' && persisted.some((s) => s.weight != null));

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/styrke" class="tilbake" aria-label="Tilbake til styrketrening">‹</a>
      <div>
        <h1>${esc(exercise.name)}</h1>
        <p class="dus">${category ? `${categoryIconHtml(category, 'kategori-ikon liten')} ${esc(category.name)} · ` : ''}Mål: ${goalText}
          · <a href="#/ovelse/${exercise.id}">historikk</a></p>
        ${lastSession ? `<p class="dus liten forrige-kompakt">Forrige (${formatDateShort(lastSession.date)}): ${esc(lastSession.sets.map((s) => summarizeSet(s, logMode, units)).join(' / '))}</p>` : ''}
      </div>
    </header>

    ${description ? `
    <details class="kort teknikk-panel">
      <summary class="teknikk-summary">Teknikk</summary>
      <p class="teknikk-tekst">${esc(description)}</p>
      ${exercise.notes ? `<p class="teknikk-notater"><span class="dus">Mine notater:</span> ${esc(exercise.notes)}</p>` : ''}
      ${exercise.video ? `<p class="teknikk-video"><a href="${esc(exercise.video)}" target="_blank" rel="noopener">Se video ↗</a></p>` : ''}
    </details>` : exercise.notes || exercise.video ? `
    <section class="kort teknikk-panel">
      ${exercise.notes ? `<p class="teknikk-notater">${esc(exercise.notes)}</p>` : ''}
      ${exercise.video ? `<p class="teknikk-video"><a href="${esc(exercise.video)}" target="_blank" rel="noopener">Se video ↗</a></p>` : ''}
    </section>` : ''}

    <section class="kort sett-accordion-wrap" aria-label="Dagens sett">
      ${logMode === 'bodyweight' ? `
      <label class="bryter-rad logg-tilleggsvekt">
        <input type="checkbox" id="tilleggsvekt" ${showWeight ? 'checked' : ''}>
        <span>Tilleggsvekt (veste, skive …)</span>
      </label>` : ''}
      <div id="sett-accordion" class="sett-accordion"></div>
      <button type="button" class="knapp sekundaer bred" id="nytt-sett">+ Legg til sett</button>
    </section>

    <section class="hvile-linje" aria-label="Hviletimer">
      <span class="dus">Hvile:</span>
      ${restTimes.map((t) => `<button type="button" class="knapp hvile" data-sek="${t}">${t} s</button>`).join('')}
    </section>
  `;

  const accordion = container.querySelector('#sett-accordion');
  const rows = [];
  let activeIndex = 0;

  async function persistRow(row) {
    const s = row.set;
    const hasContent = s.weight != null || s.reps != null
      || s.durationSec != null || s.rir != null || s.comment;
    if (!hasContent) return;
    const workout = await store.getOrCreateTodayWorkout();
    s.workoutId = workout.id;
    const saved = await store.saveSet(s);
    s.id = saved.id;
    await store.touchWorkoutDuration(workout.id);
  }

  function propagateFromFirst() {
    if (!useFirstSetTemplate || !rows.length) return;
    const first = rows[0].set;
    if (!isComplete(first, logMode, showWeight)) return;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].touched) continue;
      copySetValues(first, rows[i].set, logMode);
      rows[i].save();
      syncPickers(rows[i]);
      updatePanelHeader(rows[i]);
    }
  }

  function syncPickers(row) {
    if (!row.pickers) return;
    const s = row.set;
    if (row.pickers.weight) row.pickers.weight.setKg(s.weight);
    if (row.pickers.reps) row.pickers.reps.setValue(s.reps);
    if (row.pickers.rir) row.pickers.rir.setValue(s.rir);
    if (row.pickers.duration) row.pickers.duration.setValue(s.durationSec);
  }

  function updatePanelHeader(row) {
    const done = isComplete(row.set, logMode, showWeight);
    row.el.classList.toggle('ferdig', done);
    row.summaryEl.textContent = summaryText(row.set, logMode, units, showWeight);
    row.badgeEl.textContent = done ? '✓' : '';
    row.badgeEl.classList.toggle('skjult', !done);
  }

  function openPanel(index) {
    if (index < 0 || index >= rows.length) return;
    activeIndex = index;
    rows.forEach((row, i) => {
      const open = i === index;
      row.el.classList.toggle('apen', open);
      row.el.classList.toggle('lukket', !open);
      row.headBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) ensurePickers(row);
    });
    rows[index].el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function onFieldChange(row) {
    updatePanelHeader(row);
    if (row.index === 0) propagateFromFirst();
  }

  function ensurePickers(row) {
    if (row.pickers) {
      syncPickers(row);
      return;
    }
    const host = row.bodyEl;
    row.pickers = {};

    if (logMode === 'duration') {
      const durHost = document.createElement('div');
      host.appendChild(durHost);
      row.pickers.duration = mountDurationWheel(durHost, {
        valueSec: row.set.durationSec,
        onChange: (v) => {
          row.touched = true;
          row.set.durationSec = v;
          onFieldChange(row);
        },
      });
    } else {
      if (logMode === 'weight' || showWeight) {
        const wHost = document.createElement('div');
        host.appendChild(wHost);
        row.pickers.weight = mountWeightWheel(wHost, {
          valueKg: row.set.weight,
          units,
          onChange: (kg) => {
            row.touched = true;
            row.set.weight = kg;
            onFieldChange(row);
          },
        });
      }
      const repsHost = document.createElement('div');
      host.appendChild(repsHost);
      row.pickers.reps = mountRepStrip(repsHost, {
        value: row.set.reps,
        centerHint: store.repMidpoint(exercise) ?? 8,
        onChange: (v) => {
          row.touched = true;
          row.set.reps = v;
          onFieldChange(row);
        },
      });
    }

    const rirHost = document.createElement('div');
    host.appendChild(rirHost);
    row.pickers.rir = mountPillRow(rirHost, {
      label: 'Innsats',
      options: effortPillOptions(),
      value: rirToEffort(row.set.rir ?? defaultRir),
      onChange: (v) => {
        row.touched = true;
        row.set.rir = v;
        onFieldChange(row);
      },
    });

    const lagreBtn = document.createElement('button');
    lagreBtn.type = 'button';
    lagreBtn.className = 'knapp primaer bred oktt-lagre';
    lagreBtn.textContent = 'Lagre sett →';
    lagreBtn.addEventListener('click', async () => {
      if (!isComplete(row.set, logMode, showWeight)) return;
      await persistRow(row);
      updatePanelHeader(row);
      if (row.index === 0) propagateFromFirst();
      if (row.index + 1 < rows.length) openPanel(row.index + 1);
    });
    host.appendChild(lagreBtn);

    const actions = document.createElement('div');
    actions.className = 'sett-panel-handlinger';
    actions.innerHTML = `
      <button type="button" class="knapp sekundaer liten" data-handling="kommentar">Kommentar</button>
      <button type="button" class="knapp sekundaer liten fare" data-handling="slett">Slett sett</button>`;
    host.appendChild(actions);

    const comment = document.createElement('input');
    comment.type = 'text';
    comment.className = `inndata sett-kommentar ${row.set.comment ? '' : 'skjult'}`;
    comment.placeholder = 'Kommentar …';
    comment.value = row.set.comment || '';
    comment.addEventListener('input', () => {
      row.set.comment = comment.value;
      row.save();
    });
    host.appendChild(comment);

    actions.querySelector('[data-handling="kommentar"]').addEventListener('click', () => {
      comment.classList.toggle('skjult');
      if (!comment.classList.contains('skjult')) comment.focus();
    });
    actions.querySelector('[data-handling="slett"]').addEventListener('click', async () => {
      if (rows.length <= 1) return;
      if (row.set.id) await store.deleteSet(row.set.id);
      row.pickers?.weight?.destroy();
      row.pickers?.reps?.destroy();
      row.pickers?.rir?.destroy();
      row.pickers?.duration?.destroy();
      rows.splice(row.index, 1);
      row.el.remove();
      renumber();
      openPanel(Math.min(activeIndex, rows.length - 1));
    });
  }

  function buildPanel(setData, index) {
    const row = {
      set: { ...setData },
      touched: false,
      index,
      save: null,
      pickers: null,
      el: document.createElement('div'),
    };
    row.save = debounce(() => persistRow(row), 400);

    row.el.className = 'sett-panel lukket';
    row.el.innerHTML = `
      <button type="button" class="sett-panel-hode" aria-expanded="false">
        <span class="sett-nr">${setData.setNumber}</span>
        <span class="sett-panel-tittel">Sett ${setData.setNumber}</span>
        <span class="sett-panel-badge skjult" aria-hidden="true"></span>
        <span class="sett-panel-oppsummert"></span>
      </button>
      <div class="sett-panel-innhold"></div>`;

    row.headBtn = row.el.querySelector('.sett-panel-hode');
    row.bodyEl = row.el.querySelector('.sett-panel-innhold');
    row.summaryEl = row.el.querySelector('.sett-panel-oppsummert');
    row.badgeEl = row.el.querySelector('.sett-panel-badge');

    row.headBtn.addEventListener('click', () => {
      if (row.el.classList.contains('apen')) return;
      openPanel(rows.indexOf(row));
    });

    updatePanelHeader(row);
    return row;
  }

  function renumber() {
    rows.forEach((row, i) => {
      row.index = i;
      const n = i + 1;
      row.set.setNumber = n;
      row.el.querySelector('.sett-nr').textContent = n;
      row.el.querySelector('.sett-panel-tittel').textContent = `Sett ${n}`;
      if (row.set.id) row.save();
    });
  }

  function addSet(setData) {
    const row = buildPanel(setData, rows.length);
    rows.push(row);
    accordion.appendChild(row.el);
    return row;
  }

  if (persisted.length) {
    persisted.forEach((s) => addSet({ ...s, exerciseId }));
  } else {
    const n = Number(exercise.goalSets);
    const prev = lastSession?.sets;
    for (let i = 1; i <= n; i++) {
      const prevSet = prev?.[i - 1] || prev?.[prev.length - 1];
      const set = emptySet(exerciseId, i);
      if (prevSet) {
        copySetValues(prevSet, set, logMode);
        if (set.rir == null) set.rir = rirToEffort(defaultRir);
      } else {
        set.rir = rirToEffort(defaultRir);
      }
      addSet(set);
    }
  }

  const firstIncomplete = rows.findIndex((r) => !isComplete(r.set, logMode, showWeight));
  openPanel(firstIncomplete >= 0 ? firstIncomplete : 0);

  if (logMode === 'bodyweight') {
    container.querySelector('#tilleggsvekt').addEventListener('change', (e) => {
      showWeight = e.target.checked;
      rows.forEach((row) => {
        if (!showWeight) row.set.weight = null;
        row.pickers?.weight?.destroy();
        row.pickers?.reps?.destroy();
        row.pickers?.rir?.destroy();
        row.pickers?.duration?.destroy();
        row.pickers = null;
        row.bodyEl.innerHTML = '';
        updatePanelHeader(row);
        row.save();
      });
      if (rows[activeIndex]) ensurePickers(rows[activeIndex]);
    });
  }

  container.querySelector('#nytt-sett').addEventListener('click', () => {
    const last = rows[rows.length - 1]?.set;
    const set = emptySet(exerciseId, rows.length + 1);
    if (last) copySetValues(last, set, logMode);
    addSet(set);
    renumber();
    openPanel(rows.length - 1);
  });

  container.querySelectorAll('.hvile').forEach((btn) => {
    btn.addEventListener('click', () => timer.start(parseInt(btn.dataset.sek, 10)));
  });
}
