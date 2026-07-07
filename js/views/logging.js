/**
 * views/logging.js – logging av sett for én øvelse.
 *
 * Alt lagres automatisk: en rad skrives til databasen så snart den har
 * innhold, og hver endring lagres fortløpende (debounced). Ingen lagre-knapp.
 */

import * as store from '../store.js';
import * as timer from '../timer.js';
import { initContent, getDescription } from '../content.js';
import {
  esc, fmtNum, formatDateShort, todayStr, debounce,
  toDisplayWeight, fromInputWeight, weightUnit,
  fmtClock, parseDurationInput, summarizeSet,
} from '../utils.js';

function setRowHtml(set, { logMode, units, unit, showWeight }) {
  const weightCell = showWeight ? `
        <input type="number" inputmode="decimal" step="any" class="inndata" data-felt="weight"
          value="${set.weight != null ? fmtNum(toDisplayWeight(set.weight, units)).replace(',', '.') : ''}"
          aria-label="Vekt sett ${set.setNumber}" placeholder="0">` : '';

  if (logMode === 'duration') {
    return `
      <div class="sett-rad">
        <span class="sett-nr">${set.setNumber}</span>
        <input type="text" inputmode="numeric" class="inndata" data-felt="durationSec"
          value="${set.durationSec != null ? fmtClock(set.durationSec) : ''}"
          aria-label="Varighet sett ${set.setNumber}" placeholder="1:30">
        <input type="number" inputmode="numeric" class="inndata" data-felt="rir"
          value="${set.rir ?? ''}" aria-label="RIR sett ${set.setNumber}"
          placeholder="${store.getSetting('defaultRir')}">
        <button type="button" class="ikon-knapp" data-handling="kommentar" aria-label="Kommentar">💬</button>
        <button type="button" class="ikon-knapp" data-handling="slett" aria-label="Slett sett">✕</button>
      </div>`;
  }

  return `
      <div class="sett-rad">
        <span class="sett-nr">${set.setNumber}</span>
        ${weightCell}
        <input type="number" inputmode="numeric" class="inndata" data-felt="reps"
          value="${set.reps ?? ''}" aria-label="Repetisjoner sett ${set.setNumber}" placeholder="0">
        <input type="number" inputmode="numeric" class="inndata" data-felt="rir"
          value="${set.rir ?? ''}" aria-label="RIR sett ${set.setNumber}"
          placeholder="${store.getSetting('defaultRir')}">
        <button type="button" class="ikon-knapp" data-handling="kommentar" aria-label="Kommentar">💬</button>
        <button type="button" class="ikon-knapp" data-handling="slett" aria-label="Slett sett">✕</button>
      </div>`;
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

  const lastSession = await store.getLastSessionForExercise(exerciseId, today);

  const workouts = await store.getWorkouts();
  const todayWorkout = workouts.find((w) => w.date === today) || null;
  let persisted = [];
  if (todayWorkout) {
    persisted = (await store.getSetsForWorkout(todayWorkout.id)).filter((s) => s.exerciseId === exerciseId);
  }

  const goalText = store.goalTextFor(exercise);
  const description = getDescription(exercise);
  const restTimes = String(store.getSetting('restTimes')).split(',')
    .map((t) => parseInt(t.trim(), 10)).filter((t) => t > 0);

  const modeClass = logMode === 'bodyweight' ? 'bodyweight' : logMode === 'duration' ? 'duration' : 'weight';
  const headerCols = logMode === 'duration'
    ? '<span class="sett-nr-plass"></span><span>Varighet</span><span>RIR</span><span></span>'
    : logMode === 'bodyweight'
      ? '<span class="sett-nr-plass"></span><span>Reps</span><span>RIR</span><span></span>'
      : `<span class="sett-nr-plass"></span><span>${unit}</span><span>Reps</span><span>RIR</span><span></span>`;

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/okt" class="tilbake" aria-label="Tilbake til dagens økt">‹</a>
      <div>
        <h1>${esc(exercise.name)}</h1>
        <p class="dus">${category ? `${category.icon} ${esc(category.name)} · ` : ''}Mål: ${goalText}
          · <a href="#/ovelse/${exercise.id}">historikk</a></p>
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

    ${lastSession ? `
    <section class="kort forrige" aria-label="Forrige gang">
      <h2 class="kort-tittel">Forrige gang <span class="dus">${formatDateShort(lastSession.date)}</span></h2>
      ${lastSession.sets.map((s) => `
        <p class="forrige-sett">
          <span class="sett-nr">${s.setNumber}</span>
          <strong>${esc(summarizeSet(s, logMode, units))}</strong>
          ${s.rir != null ? `<span class="dus">RIR ${s.rir}</span>` : ''}
          ${s.comment ? `<span class="dus kommentar">«${esc(s.comment)}»</span>` : ''}
        </p>`).join('')}
    </section>` : '<section class="kort forrige"><p class="dus">Første gang du logger denne øvelsen.</p></section>'}

    <section class="logg-sett logg-sett--${modeClass}" aria-label="Dagens sett" data-mode="${modeClass}">
      ${logMode === 'bodyweight' ? `
      <label class="bryter-rad logg-tilleggsvekt">
        <input type="checkbox" id="tilleggsvekt">
        <span>Tilleggsvekt (veste, skive …)</span>
      </label>` : ''}
      <div class="rir-hurtigvalg" aria-label="RIR-hurtigvalg">
        <span class="dus liten">RIR:</span>
        <button type="button" class="knapp rir-chip" data-rir="2" title="Tung (ca. RIR 0–2)">Tung</button>
        <button type="button" class="knapp rir-chip" data-rir="4" title="Moderat (ca. RIR 3–4)">Mod</button>
        <button type="button" class="knapp rir-chip" data-rir="6" title="Lett (RIR 5+)">Lett</button>
        <button type="button" class="knapp rir-chip" data-rir="" title="Ikke relevant">–</button>
      </div>
      <div class="sett-hode sett-hode--${modeClass}">${headerCols}</div>
      <div id="sett-liste"></div>
      <button type="button" class="knapp sekundaer bred" id="nytt-sett">+ Legg til sett</button>
    </section>

    <section class="hvile-linje" aria-label="Hviletimer">
      <span class="dus">Hvile:</span>
      ${restTimes.map((t) => `<button type="button" class="knapp hvile" data-sek="${t}">${t} s</button>`).join('')}
    </section>
  `;

  const logSection = container.querySelector('.logg-sett');
  const list = container.querySelector('#sett-liste');
  const rows = [];
  let activeRirInput = null;
  let showWeight = logMode === 'weight';

  if (logMode === 'bodyweight') {
    const toggle = container.querySelector('#tilleggsvekt');
    toggle.addEventListener('change', () => {
      showWeight = toggle.checked;
      logSection.classList.toggle('med-vekt', showWeight);
      logSection.querySelector('.sett-hode').innerHTML = showWeight
        ? `<span class="sett-nr-plass"></span><span>${unit}</span><span>Reps</span><span>RIR</span><span></span>`
        : headerCols;
      rebuildRows();
    });
  }

  async function persistRow(row) {
    const hasContent = row.set.weight != null || row.set.reps != null
      || row.set.durationSec != null || row.set.rir != null || row.set.comment;
    if (!hasContent) return;
    const workout = await store.getOrCreateTodayWorkout();
    row.set.workoutId = workout.id;
    const saved = await store.saveSet(row.set);
    row.set.id = saved.id;
    await store.touchWorkoutDuration(workout.id);
  }

  function wireRow(el, row) {
    el.querySelectorAll('[data-felt]').forEach((input) => {
      if (input.dataset.felt === 'rir') {
        input.addEventListener('focus', () => { activeRirInput = input; });
      }
      input.addEventListener('input', () => {
        const field = input.dataset.felt;
        const value = input.value.trim();
        if (field === 'weight') {
          row.set.weight = value === '' ? null : fromInputWeight(parseFloat(value.replace(',', '.')), units);
        } else if (field === 'durationSec') {
          row.set.durationSec = parseDurationInput(value);
        } else if (field === 'comment') {
          row.set.comment = value;
        } else {
          row.set[field] = value === '' ? null : parseInt(value, 10);
        }
        row.save();
      });
    });
    el.querySelector('[data-handling="kommentar"]').addEventListener('click', () => {
      const c = el.querySelector('.sett-kommentar');
      c.classList.toggle('skjult');
      if (!c.classList.contains('skjult')) c.focus();
    });
    el.querySelector('[data-handling="slett"]').addEventListener('click', async () => {
      if (row.set.id) await store.deleteSet(row.set.id);
      const idx = rows.indexOf(row);
      if (idx >= 0) rows.splice(idx, 1);
      el.remove();
      renumber();
    });
  }

  function addRow(set, focus = false) {
    const row = { set: { ...set, exerciseId }, save: null };
    row.save = debounce(() => persistRow(row), 500);
    const el = document.createElement('div');
    el.className = 'sett-rad-gruppe';
    el.innerHTML = `
      ${setRowHtml(set, { logMode, units, unit, showWeight })}
      <input type="text" class="inndata sett-kommentar ${set.comment ? '' : 'skjult'}"
        data-felt="comment" value="${esc(set.comment || '')}"
        placeholder="Kommentar …" aria-label="Kommentar sett ${set.setNumber}">`;
    wireRow(el, row);
    rows.push(row);
    list.appendChild(el);
    if (focus) {
      const focusField = logMode === 'duration' ? 'durationSec' : 'reps';
      el.querySelector(`[data-felt="${focusField}"]`)?.focus();
    }
  }

  function renumber() {
    rows.forEach((row, i) => {
      const n = i + 1;
      if (row.set.setNumber !== n) {
        row.set.setNumber = n;
        if (row.set.id) persistRow(row);
      }
    });
    list.querySelectorAll('.sett-nr').forEach((el, i) => { el.textContent = i + 1; });
  }

  function rebuildRows() {
    const saved = rows.map((r) => ({ ...r.set }));
    list.innerHTML = '';
    rows.length = 0;
    saved.forEach((s) => addRow(s));
  }

  if (persisted.length) {
    persisted.forEach((s) => addRow(s));
    if (logMode === 'bodyweight' && persisted.some((s) => s.weight != null)) {
      container.querySelector('#tilleggsvekt').checked = true;
      container.querySelector('#tilleggsvekt').dispatchEvent(new Event('change'));
    }
  } else {
    const n = Number(exercise.goalSets) || 3;
    const prev = lastSession?.sets;
    for (let i = 1; i <= n; i++) {
      const prevSet = prev?.[i - 1] || prev?.[prev.length - 1];
      if (logMode === 'duration') {
        addRow({
          exerciseId, setNumber: i,
          weight: null, reps: null, durationSec: prevSet?.durationSec ?? null,
          rir: null, comment: '',
        });
      } else if (logMode === 'bodyweight') {
        addRow({
          exerciseId, setNumber: i,
          weight: prevSet?.weight ?? null, reps: null,
          durationSec: null, rir: null, comment: '',
        });
      } else {
        addRow({
          exerciseId, setNumber: i,
          weight: prevSet?.weight ?? null, reps: null,
          durationSec: null, rir: null, comment: '',
        });
      }
    }
  }

  container.querySelector('#nytt-sett').addEventListener('click', () => {
    const lastRow = rows[rows.length - 1];
    addRow({
      exerciseId,
      setNumber: rows.length + 1,
      weight: logMode === 'weight' || showWeight ? (lastRow?.set.weight ?? null) : null,
      reps: null,
      durationSec: logMode === 'duration' ? (lastRow?.set.durationSec ?? null) : null,
      rir: null,
      comment: '',
    }, true);
  });

  container.querySelectorAll('.rir-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = activeRirInput
        || list.querySelector('.sett-rad:last-child [data-felt="rir"]');
      if (!target) return;
      target.value = btn.dataset.rir;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.focus();
    });
  });

  container.querySelectorAll('.hvile').forEach((btn) => {
    btn.addEventListener('click', () => timer.start(parseInt(btn.dataset.sek, 10)));
  });
}
