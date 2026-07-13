/**
 * views/session-edit.js – rediger eller legg til styrkeøkt for en valgt dato.
 */

import * as store from '../store.js';
import { groupBy, totalVolume } from '../stats.js';
import {
  esc, fmtVolume, formatDateLong, todayStr, toast, debounce,
  summarizeSet, categoryIconHtml,
} from '../utils.js';

function openAddSessionSheet(host, onPick) {
  const today = todayStr();
  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Velg dato for økt">
      <div class="ark-hode">
        <h2>Legg til tidligere økt</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <form id="ny-okt-skjema">
        <label class="felt-navn" for="okt-dato">Dato</label>
        <input type="date" class="inndata" id="okt-dato" max="${today}" value="${today}" required>
        <button type="submit" class="knapp primaer bred">Fortsett</button>
      </form>
    </div>`;

  const close = () => { host.innerHTML = ''; };
  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', close));
  host.querySelector('#ny-okt-skjema').addEventListener('submit', (e) => {
    e.preventDefault();
    const date = host.querySelector('#okt-dato').value;
    if (!date || date > today) return;
    close();
    onPick(date);
  });
}

function openExercisePicker(host, onPick) {
  store.getExercises().then((exercises) => {
    const active = exercises.filter((e) => e.active !== false);
    const sections = store.KATEGORIER.map((cat) => {
      const catExercises = active.filter((e) => e.category === cat.id);
      if (!catExercises.length) return '';
      return `
        <p class="felt-navn plan-bib-tittel">${categoryIconHtml(cat)} ${esc(cat.name)}</p>
        ${catExercises.map((e) => `
          <button type="button" class="ovelse-rad" data-id="${e.id}">
            <span>${esc(e.name)}</span>
            <span class="dus">›</span>
          </button>`).join('')}`;
    }).join('');

    host.innerHTML = `
      <div class="ark-bakgrunn" data-lukk></div>
      <div class="ark" role="dialog" aria-label="Velg øvelse">
        <div class="ark-hode">
          <h2>Legg til øvelse</h2>
          <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
        </div>
        ${sections || '<p class="dus liten">Ingen aktive øvelser. Legg til under Øvelser først.</p>'}
      </div>`;

    const close = () => { host.innerHTML = ''; };
    host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', close));
    host.querySelectorAll('.ovelse-rad').forEach((btn) => {
      btn.addEventListener('click', () => {
        close();
        onPick(btn.dataset.id);
      });
    });
  });
}

/** Bunnark for å velge dato når man legger til tidligere økt fra historikk. */
export function openAddSessionSheetIn(host) {
  openAddSessionSheet(host, (date) => {
    location.hash = `#/rediger-okt/${date}`;
  });
}

/** Rediger eller opprett økt for #/rediger-okt/:date. */
export async function render(container, params) {
  const date = params[0];
  const today = todayStr();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    container.innerHTML = '<p class="tomt">Ugyldig dato.</p>';
    return;
  }
  if (date > today) {
    container.innerHTML = '<p class="tomt">Kan ikke logge frem i tid.</p>';
    return;
  }

  const units = store.getSetting('units');
  const isRetroactive = date < today;
  const workout = await store.getOrCreateWorkoutForDate(date, { retroactive: isRetroactive });
  const sets = await store.getSetsForWorkout(workout.id);
  const exercises = await store.getExercises();
  const exById = new Map(exercises.map((e) => [e.id, e]));
  const byEx = groupBy(sets, (s) => s.exerciseId);

  const exerciseRows = [...byEx.entries()].map(([exId, exSets]) => {
    const exercise = exById.get(exId);
    const name = exercise?.name || 'Ukjent øvelse';
    const mode = exercise ? store.logModeOf(exercise) : 'weight';
    const sorted = exSets.sort((a, b) => a.setNumber - b.setNumber);
    const summary = sorted.map((s) => summarizeSet(s, mode, units)).join(' · ');
    return `
      <article class="kort okt-rediger-rad">
        <div class="okt-rediger-innhold">
          <h2 class="kort-tittel">${esc(name)}</h2>
          <p class="dus">${esc(summary)}</p>
        </div>
        <a href="#/logg/${exId}?date=${date}" class="knapp sekundaer liten">Rediger sett</a>
      </article>`;
  }).join('');

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/historikk" class="tilbake" aria-label="Tilbake til historikk">‹</a>
      <div>
        <h1>${formatDateLong(date)}</h1>
        <p class="dus">${isRetroactive ? 'Tidligere økt' : 'Dagens økt'} · ${fmtVolume(totalVolume(sets))} kg volum</p>
      </div>
    </header>

    <section class="kort">
      <label class="felt-navn" for="okt-notat">Notat</label>
      <textarea class="inndata" id="okt-notat" rows="2" placeholder="Valgfritt …">${esc(workout.notes || '')}</textarea>
    </section>

    <div id="okt-ovelser">
      ${exerciseRows || '<p class="tomt">Ingen øvelser logget ennå.</p>'}
    </div>

    <button type="button" class="knapp primaer bred" id="legg-til-ovelse">+ Legg til øvelse</button>
    ${sets.length || workout.notes ? `
    <button type="button" class="knapp sekundaer bred fare" id="slett-okt">Slett hele økten</button>` : ''}
    <div id="skjema-vert"></div>
  `;

  const saveNotes = debounce(async () => {
    workout.notes = container.querySelector('#okt-notat').value.trim();
    await store.saveWorkout(workout);
  }, 400);
  container.querySelector('#okt-notat').addEventListener('input', saveNotes);

  container.querySelector('#legg-til-ovelse').addEventListener('click', () => {
    openExercisePicker(container.querySelector('#skjema-vert'), (exerciseId) => {
      location.hash = `#/logg/${exerciseId}?date=${date}`;
    });
  });

  const deleteBtn = container.querySelector('#slett-okt');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Slette hele økten ${formatDateLong(date)}? Dette kan ikke angres.`)) return;
      await store.deleteWorkout(workout.id);
      toast('Økt slettet', 'suksess');
      location.hash = '#/historikk';
    });
  }
}
