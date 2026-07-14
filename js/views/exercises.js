/**
 * views/exercises.js – øvelseskatalog og brukerens aktive øvelser i én visning.
 */

import * as store from '../store.js';
import {
  initContent, getCatalogEntry, filterCatalog, isContentLoaded,
  getStarterPackEntries, getCatalogFilterOptions, equipmentLabel, muscleLabel,
} from '../content.js';
import { descriptionBlock, bindDescriptionToggles } from './exercise-library.js';
import { esc, toast, categoryIconHtml } from '../utils.js';

function goalSummary(ex) {
  const text = store.goalTextFor(ex);
  if (!text) return 'Ingen mål';
  const mode = store.logModeOf(ex);
  return mode === 'duration' ? text : `${text} reps`;
}

function logModeLabel(id) {
  return store.LOG_MODES.find((m) => m.id === id)?.name || id;
}

function buildOvelserHash(query) {
  const params = new URLSearchParams();
  if (query.kat) params.set('kat', query.kat);
  if (query.utstyr) params.set('utstyr', query.utstyr);
  if (query.muskel) params.set('muskel', query.muskel);
  if (query.q) params.set('q', query.q);
  const qs = params.toString();
  return `#/ovelser${qs ? `?${qs}` : ''}`;
}

function renderFilterChips({ label, ariaLabel, param, active, options, allLabel = 'Alle' }) {
  const chips = [
    `<button type="button" class="filter-chip ${!active ? 'aktiv' : ''}" data-filter-param="${param}" data-filter-value="">${allLabel}</button>`,
    ...options.map((opt) => {
      const value = typeof opt === 'string' ? opt : opt.value;
      const text = typeof opt === 'string' ? opt : opt.label;
      return `<button type="button" class="filter-chip ${active === value ? 'aktiv' : ''}" data-filter-param="${param}" data-filter-value="${esc(value)}">${esc(text)}</button>`;
    }),
  ].join('');
  return `
    <div class="filter-gruppe">
      <p class="filter-gruppe-label">${esc(label)}</p>
      <div class="filter-chips" role="group" aria-label="${esc(ariaLabel)}">${chips}</div>
    </div>`;
}

function renderCatalogRow(item, userEx) {
  const active = userEx && userEx.active !== false;
  const inApp = Boolean(userEx && !userEx.deleted);
  return `
    <article class="kort bib-kort ${inApp && active ? 'bib-i-appen' : ''}" data-id="${esc(item.id)}" data-catalog-id="${esc(item.id)}">
      <div class="bib-rad-topp">
        <h2 class="bib-navn">${esc(item.name)}</h2>
        ${inApp && active ? '<span class="bib-status dus">Aktiv</span>' : ''}
        ${inApp && !active ? '<span class="bib-status dus">Inaktiv</span>' : ''}
        ${!inApp ? `<button type="button" class="plan-bib-bruk" data-handling="legg-til" data-catalog-id="${esc(item.id)}">Legg til og bruk →</button>` : ''}
      </div>
      ${descriptionBlock(item.description)}
      ${inApp ? `
      <div class="bib-handlinger">
        <button type="button" class="knapp sekundaer liten" data-handling="rediger" data-id="${esc(userEx.id)}">Rediger</button>
        <button type="button" class="knapp sekundaer liten" data-handling="toggle" data-catalog-id="${esc(item.id)}">
          ${active ? 'Deaktiver' : 'Aktiver'}
        </button>
      </div>` : ''}
    </article>`;
}

export async function render(container, params, query = {}) {
  await initContent();
  if (!isContentLoaded()) {
    container.innerHTML = '<p class="tomt">Kunne ikke laste øvelseskatalogen. Prøv å laste siden på nytt.</p>';
    return;
  }

  const filterCat = query.kat || params[0] || '';
  const filterUtstyr = query.utstyr || '';
  const filterMuskel = query.muskel || '';
  const search = query.q || '';
  const filterOptions = getCatalogFilterOptions();
  const userByCatalog = await store.getUserExercisesByCatalogId();
  const allUser = await store.getExercises({ includeInactive: true });
  const catalogIds = new Set(
    store.KATEGORIER.flatMap((k) => filterCatalog({ categoryId: k.id }).map((c) => c.id)),
  );
  const customExercises = allUser.filter((e) => !e.catalogId || !catalogIds.has(e.catalogId));
  const starterEntries = getStarterPackEntries();
  const missingStarter = starterEntries.filter((e) => !userByCatalog.has(e.id)).length;

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/hjem" class="tilbake" aria-label="Tilbake til hjem">‹</a>
      <h1>Øvelser</h1>
    </header>
    <input type="search" class="inndata sok" id="ovelse-sok" placeholder="Søk i øvelseskatalogen …"
      value="${esc(search)}" aria-label="Søk øvelser">
    <div class="ovelse-filtre">
      ${renderFilterChips({
    label: 'Kategori',
    ariaLabel: 'Kategori',
    param: 'kat',
    active: filterCat,
    options: store.KATEGORIER.map((k) => ({ value: k.id, label: k.name })),
  })}
      <details class="ovelse-filter-mer"${filterUtstyr || filterMuskel ? ' open' : ''}>
        <summary>Utstyr og muskelgrupper</summary>
        <div class="ovelse-filter-mer-innhold">
          ${renderFilterChips({
    label: 'Utstyr',
    ariaLabel: 'Utstyr',
    param: 'utstyr',
    active: filterUtstyr,
    options: filterOptions.equipment.map((id) => ({ value: id, label: equipmentLabel(id) })),
  })}
          ${renderFilterChips({
    label: 'Primær muskel',
    ariaLabel: 'Primær muskelgruppe',
    param: 'muskel',
    active: filterMuskel,
    options: filterOptions.muscles.map((id) => ({ value: id, label: muscleLabel(id) })),
  })}
        </div>
      </details>
    </div>
    <p class="dus bib-intro">Velg øvelser du vil bruke i programmet. Teknikk er på norsk; navn er på engelsk.</p>
    ${missingStarter > 0 ? `
    <button type="button" class="knapp ${missingStarter === starterEntries.length ? 'primaer' : 'sekundaer'} bred" id="legg-til-startpakke">
      ${missingStarter === starterEntries.length
    ? `Legg til startpakke (${starterEntries.length} grunnleggende øvelser)`
    : `Legg til manglende fra startpakke (${missingStarter})`}
    </button>
    ${missingStarter === starterEntries.length ? `
    <p class="dus liten startpakke-hint">Benkpress, knebøy, markløft osv. – én knapp for å komme i gang.</p>` : ''}` : ''}
    <button type="button" class="knapp sekundaer bred" id="ny-ovelse">+ Ny egen øvelse</button>
    <div id="ovelse-liste"></div>
    <div id="skjema-vert"></div>
  `;

  const listEl = container.querySelector('#ovelse-liste');
  const host = container.querySelector('#skjema-vert');

  function currentQuery() {
    return {
      kat: filterCat,
      utstyr: filterUtstyr,
      muskel: filterMuskel,
      q: container.querySelector('#ovelse-sok').value.trim(),
    };
  }

  function navigateFilters(patch) {
    location.hash = buildOvelserHash({ ...currentQuery(), ...patch });
  }

  function draw() {
    const q = container.querySelector('#ovelse-sok').value.trim();
    const baseFilter = {
      equipment: filterUtstyr || null,
      muscle: filterMuskel || null,
      query: q,
    };
    let html = '';

    const categories = filterCat
      ? store.KATEGORIER.filter((k) => k.id === filterCat)
      : store.KATEGORIER;

    for (const k of categories) {
      const catItems = filterCatalog({ ...baseFilter, categoryId: k.id });
      if (!catItems.length) continue;
      html += `
        <section class="ovelse-kategori-seksjon">
          <h2 class="kort-tittel kategori-tittel">${categoryIconHtml(k)} ${esc(k.name)}
            <span class="dus liten">${catItems.length} øvelser</span></h2>
          ${catItems.map((item) => renderCatalogRow(item, userByCatalog.get(item.id))).join('')}
        </section>`;
    }

    if (customExercises.length) {
      html += `
        <section class="ovelse-kategori-seksjon">
          <h2 class="kort-tittel">Egne øvelser</h2>
          ${customExercises.map((e) => `
            <button type="button" class="ovelse-rad ${e.active === false ? 'inaktiv' : ''}" data-id="${e.id}">
              <span>${esc(e.name)}${e.active === false ? ' <span class="dus">(inaktiv)</span>' : ''}</span>
              <span class="dus">${logModeLabel(store.logModeOf(e))} · ${goalSummary(e)} ›</span>
            </button>`).join('')}
        </section>`;
    }

    listEl.innerHTML = html || '<p class="tomt">Ingen øvelser funnet.</p>';
    bindDescriptionToggles(listEl, (id) => getCatalogEntry(id)?.description || '');
    bindListEvents();
  }

  function bindListEvents() {
    listEl.querySelectorAll('[data-handling="legg-til"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const entry = getCatalogEntry(btn.dataset.catalogId);
        if (!entry) return;
        await store.addExerciseFromCatalog(entry.id, entry);
        toast(`${entry.name} lagt til`, 'suksess');
        render(container, params, currentQuery());
      });
    });

    listEl.querySelectorAll('[data-handling="toggle"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ex = await store.findExerciseByCatalogId(btn.dataset.catalogId);
        if (!ex) return;
        const nextActive = ex.active === false;
        await store.saveExercise({ ...ex, active: nextActive });
        toast(nextActive ? 'Øvelse aktivert' : 'Øvelse deaktivert', 'suksess');
        render(container, params, currentQuery());
      });
    });

    listEl.querySelectorAll('[data-handling="rediger"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ex = await store.getExercise(btn.dataset.id);
        openForm(host, ex, () => render(container, params, query));
      });
    });

    listEl.querySelectorAll('.ovelse-rad').forEach((row) => {
      row.addEventListener('click', async () => {
        const ex = await store.getExercise(row.dataset.id);
        openForm(host, ex, () => render(container, params, query));
      });
    });
  }

  draw();

  container.querySelectorAll('[data-filter-param]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const param = btn.dataset.filterParam;
      const value = btn.dataset.filterValue;
      navigateFilters({ [param]: value, q: container.querySelector('#ovelse-sok').value.trim() });
    });
  });

  let searchTimer;
  container.querySelector('#ovelse-sok').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(draw, 300);
  });

  container.querySelector('#ny-ovelse').addEventListener('click', () => {
    openForm(host, null, () => render(container, params, query));
  });

  container.querySelector('#legg-til-startpakke')?.addEventListener('click', async () => {
    const n = await store.addStarterPack(starterEntries);
    toast(n ? `${n} øvelser lagt til` : 'Startpakken finnes allerede', n ? 'suksess' : 'info');
    render(container, params, query);
  });
}

/** Redigeringsskjema for øvelse (gjenbrukes fra planleggeren). */
export function openForm(host, exercise, onDone) {
  const isNew = !exercise;
  const e = exercise || {
    name: '', category: store.KATEGORIER[0].id, notes: '', video: '', active: true,
    logMode: 'weight',
    goalSets: store.defaultGoals().goalSets,
    goalRepsMin: store.defaultGoals().goalRepsMin,
    goalRepsMax: store.defaultGoals().goalRepsMax,
  };
  const description = getCatalogEntry(e.catalogId)?.description || '';
  const mode = store.logModeOf(e);
  const isCatalog = Boolean(e.catalogId && getCatalogEntry(e.catalogId));

  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="${isNew ? 'Ny øvelse' : 'Rediger øvelse'}">
      <div class="ark-hode">
        <h2>${isNew ? 'Ny øvelse' : esc(e.name)}</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <form id="ovelse-skjema">
        <label class="felt-navn" for="f-navn">Navn</label>
        <input type="text" class="inndata" id="f-navn" value="${esc(e.name)}" required ${isCatalog ? 'readonly' : ''}>

        <label class="felt-navn" for="f-kategori">Kategori</label>
        <select class="inndata" id="f-kategori" ${isCatalog ? 'disabled' : ''}>
          ${store.KATEGORIER.map((k) => `<option value="${k.id}" ${k.id === e.category ? 'selected' : ''}>${esc(k.name)}</option>`).join('')}
        </select>

        <label class="felt-navn" for="f-logmode">Loggingstype</label>
        <select class="inndata" id="f-logmode">
          ${store.LOG_MODES.map((m) => `<option value="${m.id}" ${m.id === mode ? 'selected' : ''}>${m.name}</option>`).join('')}
        </select>

        <fieldset class="skjema-rad maal">
          <legend class="felt-navn" id="f-maal-legend">Mål (sett × reps)</legend>
          <input type="number" class="inndata" id="f-sett" value="${e.goalSets}" min="1" max="10" aria-label="Antall sett">
          <span aria-hidden="true">×</span>
          <input type="number" class="inndata" id="f-min" value="${e.goalRepsMin}" min="1" max="600" aria-label="Nedre målgrense">
          <span aria-hidden="true">–</span>
          <input type="number" class="inndata" id="f-maks" value="${e.goalRepsMax}" min="1" max="600" aria-label="Øvre målgrense">
        </fieldset>

        ${description ? `
        <p class="felt-navn">Teknikk</p>
        <p class="teknikk-tekst">${esc(description)}</p>` : ''}

        <label class="felt-navn" for="f-notater">Mine notater</label>
        <textarea class="inndata" id="f-notater" rows="3" placeholder="Egne tips og tilpasninger …">${esc(e.notes)}</textarea>

        <label class="felt-navn" for="f-video">Video-lenke <span class="dus">(valgfritt)</span></label>
        <input type="url" class="inndata" id="f-video" value="${esc(e.video)}" placeholder="https://…">

        <label class="bryter-rad">
          <input type="checkbox" id="f-aktiv" ${e.active !== false ? 'checked' : ''}>
          <span>Aktiv (vises i øvelsesvelgeren)</span>
        </label>

        <button type="submit" class="knapp primaer bred">${isNew ? 'Opprett' : 'Lagre'}</button>
        ${!isNew && !isCatalog ? '<button type="button" class="knapp farlig bred" id="f-slett">Slett øvelse</button>' : ''}
      </form>
    </div>`;

  const modeSelect = host.querySelector('#f-logmode');
  const legend = host.querySelector('#f-maal-legend');

  function updateGoalLegend() {
    const m = modeSelect.value;
    legend.textContent = m === 'duration' ? 'Mål (sett × sekunder)' : 'Mål (sett × reps)';
  }
  modeSelect.addEventListener('change', updateGoalLegend);
  updateGoalLegend();

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));

  host.querySelector('#ovelse-skjema').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    await store.saveExercise({
      ...e,
      name: host.querySelector('#f-navn').value,
      category: host.querySelector('#f-kategori').value,
      logMode: host.querySelector('#f-logmode').value,
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
