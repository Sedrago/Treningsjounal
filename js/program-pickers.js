/**
 * program-pickers.js – kategori- og øvelsesvelger for programbygging.
 */

import * as store from './store.js';
import { getCatalogByCategory, getCatalogEntry, getDescription, filterCatalog, getCatalogFilterOptions } from './content.js';
import {
  renderExerciseFilterSelects, bindExerciseFilterSelects, matchesUserExerciseFilter,
} from './exercise-filters.js';
import { openForm } from './views/exercises.js';
import { descriptionBlock, bindDescriptionToggles } from './views/exercise-library.js';
import { groupBy } from './stats.js';
import { esc, todayStr, windowStartStr, categoryIconHtml } from './utils.js';

export function categoryStats(enriched) {
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

export function daysSince(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.round((new Date().setHours(0, 0, 0, 0) - new Date(y, m - 1, d).getTime()) / 86400000);
}

function exercisePickerDescription(exercise) {
  const description = getDescription(exercise);
  const notes = exercise.notes?.trim();
  if (description && notes) return `${description}\n\nMine notater: ${notes}`;
  return description || notes || '';
}

/** Bunn-ark: velg kategori (sortert etter lengst siden sist). */
export function openCategoryPicker(host, stats, onCategory) {
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
export async function openExercisePicker(host, categoryId, planItems, onPick, onEdited) {
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
