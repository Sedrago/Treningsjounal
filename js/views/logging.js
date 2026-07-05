/**
 * views/logging.js – logging av sett for én øvelse.
 *
 * Alt lagres automatisk: en rad skrives til databasen så snart den har
 * innhold, og hver endring lagres fortløpende (debounced). Ingen lagre-knapp.
 */

import * as store from '../store.js';
import * as timer from '../timer.js';
import { initContent, getDescription } from '../content.js';
import { progressionSuggestion } from '../assistant.js';
import {
  esc, fmtNum, formatDateShort, todayStr, debounce,
  toDisplayWeight, fromInputWeight, weightUnit,
} from '../utils.js';

export async function render(container, params) {
  await initContent();
  const exerciseId = params[0];
  const exercise = await store.getExercise(exerciseId);
  if (!exercise) {
    container.innerHTML = '<p class="tomt">Fant ikke øvelsen.</p>';
    return;
  }
  const category = store.categoryById(exercise.category);
  const units = store.getSetting('units');
  const unit = weightUnit(units);
  const today = todayStr();

  const lastSession = await store.getLastSessionForExercise(exerciseId, today);
  const allExSets = (await store.getEnrichedSets()).filter((s) => s.exerciseId === exerciseId);
  const suggestion = progressionSuggestion(exercise, lastSession, allExSets);

  // Dagens allerede lagrede sett for øvelsen.
  const workouts = await store.getWorkouts();
  const todayWorkout = workouts.find((w) => w.date === today) || null;
  let persisted = [];
  if (todayWorkout) {
    persisted = (await store.getSetsForWorkout(todayWorkout.id)).filter((s) => s.exerciseId === exerciseId);
  }

  const goalText = `${exercise.goalSets} × ${exercise.goalRepsMin}–${exercise.goalRepsMax}`;
  const description = getDescription(exercise);
  const restTimes = String(store.getSetting('restTimes')).split(',')
    .map((t) => parseInt(t.trim(), 10)).filter((t) => t > 0);

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
          <strong>${s.weight != null ? `${fmtNum(toDisplayWeight(s.weight, units))} ${unit}` : '–'}</strong>
          × ${s.reps ?? '–'}
          ${s.rir != null ? `<span class="dus">RIR ${s.rir}</span>` : ''}
          ${s.comment ? `<span class="dus kommentar">«${esc(s.comment)}»</span>` : ''}
        </p>`).join('')}
    </section>` : '<section class="kort forrige"><p class="dus">Første gang du logger denne øvelsen.</p></section>'}

    ${suggestion ? `
    <section class="kort forslag ${suggestion.type}" aria-label="Forslag fra assistenten">
      <p><span aria-hidden="true">${suggestion.type === 'increase' ? '📈' : '💡'}</span> ${esc(suggestion.text)}</p>
    </section>` : ''}

    <section aria-label="Dagens sett">
      <div class="sett-hode">
        <span class="sett-nr-plass"></span><span>${unit}</span><span>Reps</span><span>RIR</span><span></span>
      </div>
      <div id="sett-liste"></div>
      <button type="button" class="knapp sekundaer bred" id="nytt-sett">+ Legg til sett</button>
    </section>

    <section class="hvile-linje" aria-label="Hviletimer">
      <span class="dus">Hvile:</span>
      ${restTimes.map((t) => `<button type="button" class="knapp hvile" data-sek="${t}">${t} s</button>`).join('')}
    </section>
  `;

  const list = container.querySelector('#sett-liste');
  const rows = [];

  /** Lagrer en rad hvis den har innhold. */
  async function persistRow(row) {
    const hasContent = row.set.weight != null || row.set.reps != null
      || row.set.rir != null || row.set.comment;
    if (!hasContent) return;
    const workout = await store.getOrCreateTodayWorkout();
    row.set.workoutId = workout.id;
    const saved = await store.saveSet(row.set);
    row.set.id = saved.id;
    await store.touchWorkoutDuration(workout.id);
  }

  function addRow(set, focus = false) {
    const row = { set: { ...set }, save: null };
    row.save = debounce(() => persistRow(row), 500);
    const el = document.createElement('div');
    el.className = 'sett-rad-gruppe';
    el.innerHTML = `
      <div class="sett-rad">
        <span class="sett-nr">${set.setNumber}</span>
        <input type="number" inputmode="decimal" step="any" class="inndata" data-felt="weight"
          value="${set.weight != null ? fmtNum(toDisplayWeight(set.weight, units)).replace(',', '.') : ''}"
          aria-label="Vekt sett ${set.setNumber}" placeholder="0">
        <input type="number" inputmode="numeric" class="inndata" data-felt="reps"
          value="${set.reps ?? ''}" aria-label="Repetisjoner sett ${set.setNumber}" placeholder="0">
        <input type="number" inputmode="numeric" class="inndata" data-felt="rir"
          value="${set.rir ?? ''}" aria-label="RIR sett ${set.setNumber}"
          placeholder="${store.getSetting('defaultRir')}">
        <button type="button" class="ikon-knapp" data-handling="kommentar" aria-label="Kommentar">💬</button>
        <button type="button" class="ikon-knapp" data-handling="slett" aria-label="Slett sett">✕</button>
      </div>
      <input type="text" class="inndata sett-kommentar ${set.comment ? '' : 'skjult'}"
        data-felt="comment" value="${esc(set.comment || '')}"
        placeholder="Kommentar …" aria-label="Kommentar sett ${set.setNumber}">
    `;

    el.querySelectorAll('[data-felt]').forEach((input) => {
      input.addEventListener('input', () => {
        const field = input.dataset.felt;
        const value = input.value.trim();
        if (field === 'weight') {
          row.set.weight = value === '' ? null : fromInputWeight(parseFloat(value.replace(',', '.')), units);
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

    rows.push(row);
    list.appendChild(el);
    if (focus) el.querySelector('[data-felt="reps"]').focus();
  }

  /** Renummererer settene etter sletting. */
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

  // Startrader: dagens lagrede sett, ellers mål-antall rader
  // forhåndsutfylt med vekt fra forrige økt (reps fylles inn av deg).
  if (persisted.length) {
    persisted.forEach((s) => addRow(s));
  } else {
    const n = Number(exercise.goalSets) || 3;
    for (let i = 1; i <= n; i++) {
      const prev = lastSession?.sets[i - 1] || lastSession?.sets[lastSession.sets.length - 1];
      const prefillWeight = suggestion?.type === 'increase' && i === 1
        ? suggestion.weight
        : prev?.weight ?? null;
      addRow({ exerciseId, setNumber: i, weight: prefillWeight, reps: null, rir: null, comment: '' });
    }
  }

  container.querySelector('#nytt-sett').addEventListener('click', () => {
    const lastRow = rows[rows.length - 1];
    addRow({
      exerciseId,
      setNumber: rows.length + 1,
      weight: lastRow?.set.weight ?? null,
      reps: null, rir: null, comment: '',
    }, true);
  });

  container.querySelectorAll('.hvile').forEach((btn) => {
    btn.addEventListener('click', () => timer.start(parseInt(btn.dataset.sek, 10)));
  });
}
