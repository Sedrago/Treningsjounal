/**
 * views/exercises.js – øvelsesbiblioteket: opprette, redigere, slette
 * og flytte øvelser mellom kategorier.
 */

import * as store from '../store.js';
import { esc, toast } from '../utils.js';

export async function render(container) {
  const exercises = await store.getExercises({ includeInactive: true });

  const sections = store.KATEGORIER.map((k) => {
    const catExercises = exercises.filter((e) => e.category === k.id);
    return `
      <section class="kort" aria-label="${esc(k.name)}">
        <h2 class="kort-tittel">${k.icon} ${esc(k.name)}</h2>
        ${catExercises.map((e) => `
          <button type="button" class="ovelse-rad ${e.active === false ? 'inaktiv' : ''}" data-id="${e.id}">
            <span>${esc(e.name)}${e.active === false ? ' <span class="dus">(inaktiv)</span>' : ''}</span>
            <span class="dus">${e.goalSets} × ${e.goalRepsMin}–${e.goalRepsMax} ›</span>
          </button>`).join('') || '<p class="dus liten">Ingen øvelser.</p>'}
      </section>`;
  }).join('');

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/hjem" class="tilbake" aria-label="Tilbake til hjem">‹</a>
      <h1>Øvelser</h1>
    </header>
    <button type="button" class="knapp primaer bred" id="ny-ovelse">+ Ny øvelse</button>
    ${!exercises.length ? `
    <button type="button" class="knapp sekundaer bred" id="legg-til-standard">
      Legg til standardøvelser (27 stk)
    </button>` : ''}
    ${sections}
    <div id="skjema-vert"></div>
  `;

  container.querySelector('#ny-ovelse').addEventListener('click', () => {
    openForm(container.querySelector('#skjema-vert'), null, () => render(container));
  });
  container.querySelector('#legg-til-standard')?.addEventListener('click', async () => {
    const added = await store.ensureDefaultExercises();
    toast(added ? 'Standardøvelser lagt til' : 'Øvelser finnes allerede', added ? 'suksess' : 'info');
    render(container);
  });
  container.querySelectorAll('.ovelse-rad').forEach((row) => {
    row.addEventListener('click', async () => {
      const ex = await store.getExercise(row.dataset.id);
      openForm(container.querySelector('#skjema-vert'), ex, () => render(container));
    });
  });
}

/** Skjema for ny/eksisterende øvelse (bunn-ark). */
function openForm(host, exercise, onDone) {
  const isNew = !exercise;
  const e = exercise || {
    name: '', category: store.KATEGORIER[0].id, notes: '', video: '', active: true,
    goalSets: store.getSetting('defaultSets'),
    goalRepsMin: store.getSetting('defaultRepsMin'),
    goalRepsMax: store.getSetting('defaultRepsMax'),
  };

  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="${isNew ? 'Ny øvelse' : 'Rediger øvelse'}">
      <div class="ark-hode">
        <h2>${isNew ? 'Ny øvelse' : esc(e.name)}</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <form id="ovelse-skjema">
        <label class="felt-navn" for="f-navn">Navn</label>
        <input type="text" class="inndata" id="f-navn" value="${esc(e.name)}" required>

        <label class="felt-navn" for="f-kategori">Kategori</label>
        <select class="inndata" id="f-kategori">
          ${store.KATEGORIER.map((k) => `<option value="${k.id}" ${k.id === e.category ? 'selected' : ''}>${k.icon} ${esc(k.name)}</option>`).join('')}
        </select>

        <fieldset class="skjema-rad maal">
          <legend class="felt-navn">Mål (sett × reps)</legend>
          <input type="number" class="inndata" id="f-sett" value="${e.goalSets}" min="1" max="10" aria-label="Antall sett">
          <span aria-hidden="true">×</span>
          <input type="number" class="inndata" id="f-min" value="${e.goalRepsMin}" min="1" max="50" aria-label="Nedre repsgrense">
          <span aria-hidden="true">–</span>
          <input type="number" class="inndata" id="f-maks" value="${e.goalRepsMax}" min="1" max="50" aria-label="Øvre repsgrense">
        </fieldset>

        <label class="felt-navn" for="f-notater">Beskrivelse og teknikknotater</label>
        <textarea class="inndata" id="f-notater" rows="3">${esc(e.notes)}</textarea>

        <label class="felt-navn" for="f-video">Video-lenke</label>
        <input type="url" class="inndata" id="f-video" value="${esc(e.video)}" placeholder="https://…">

        <label class="bryter-rad">
          <input type="checkbox" id="f-aktiv" ${e.active !== false ? 'checked' : ''}>
          <span>Aktiv (vises i øvelsesvelgeren)</span>
        </label>

        <button type="submit" class="knapp primaer bred">${isNew ? 'Opprett' : 'Lagre'}</button>
        ${!isNew ? '<button type="button" class="knapp farlig bred" id="f-slett">Slett øvelse</button>' : ''}
      </form>
    </div>`;

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));

  host.querySelector('#ovelse-skjema').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    await store.saveExercise({
      ...e,
      name: host.querySelector('#f-navn').value,
      category: host.querySelector('#f-kategori').value,
      goalSets: host.querySelector('#f-sett').value,
      goalRepsMin: host.querySelector('#f-min').value,
      goalRepsMax: host.querySelector('#f-maks').value,
      notes: host.querySelector('#f-notater').value,
      video: host.querySelector('#f-video').value,
      active: host.querySelector('#f-aktiv').checked,
    });
    toast(isNew ? 'Øvelse opprettet' : 'Øvelse lagret', 'suksess');
    host.innerHTML = '';
    onDone();
  });

  host.querySelector('#f-slett')?.addEventListener('click', async () => {
    if (!confirm(`Slette «${e.name}»? Historikken beholdes, men øvelsen forsvinner fra listene.`)) return;
    await store.deleteExercise(e.id);
    toast('Øvelse slettet');
    host.innerHTML = '';
    onDone();
  });
}
