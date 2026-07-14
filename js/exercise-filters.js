/**
 * exercise-filters.js – delte dropdown-filtre for øvelseskatalog og velgere.
 */

import {
  getCatalogEntry, getCatalogFilterOptions, equipmentLabel, muscleLabel,
} from './content.js';
import { esc } from './utils.js';

/** @typedef {{ kat?: string, utstyr?: string, muskel?: string, q?: string }} ExerciseFilters */

export function matchesUserExerciseFilter(exercise, filters) {
  const q = (filters.q || '').trim().toLowerCase();
  if (q && !exercise.name.toLowerCase().includes(q)) return false;

  const equipment = filters.utstyr || '';
  const muscle = filters.muskel || '';
  if (!equipment && !muscle) return true;

  const entry = exercise.catalogId ? getCatalogEntry(exercise.catalogId) : null;
  if (!entry) return !equipment && !muscle;

  if (equipment && (entry.equipment || '') !== equipment) return false;
  if (muscle && !(entry.primaryMuscles || []).includes(muscle)) return false;
  return true;
}

export function readExerciseFilters(root) {
  /** @type {ExerciseFilters} */
  const filters = { kat: '', utstyr: '', muskel: '' };
  root.querySelectorAll('[data-filter]').forEach((sel) => {
    filters[sel.dataset.filter] = sel.value;
  });
  return filters;
}

export function renderExerciseFilterSelects({
  filters = {},
  filterOptions = getCatalogFilterOptions(),
  showCategory = true,
  categories = [],
}) {
  const { kat = '', utstyr = '', muskel = '' } = filters;

  const categorySelect = showCategory ? `
    <label class="filter-felt">
      <span class="filter-felt-label">Kategori</span>
      <select class="inndata filter-select" data-filter="kat" aria-label="Kategori">
        <option value="">Alle</option>
        ${categories.map((k) => `
          <option value="${esc(k.id)}" ${k.id === kat ? 'selected' : ''}>${esc(k.name)}</option>`).join('')}
      </select>
    </label>` : '';

  return `
    <div class="ovelse-filtre ovelse-filtre--rad">
      ${categorySelect}
      <label class="filter-felt">
        <span class="filter-felt-label">Utstyr</span>
        <select class="inndata filter-select" data-filter="utstyr" aria-label="Utstyr">
          <option value="">Alle</option>
          ${filterOptions.equipment.map((id) => `
            <option value="${esc(id)}" ${id === utstyr ? 'selected' : ''}>${esc(equipmentLabel(id))}</option>`).join('')}
        </select>
      </label>
      <label class="filter-felt">
        <span class="filter-felt-label">Primær muskel</span>
        <select class="inndata filter-select" data-filter="muskel" aria-label="Primær muskelgruppe">
          <option value="">Alle</option>
          ${filterOptions.muscles.map((id) => `
            <option value="${esc(id)}" ${id === muskel ? 'selected' : ''}>${esc(muscleLabel(id))}</option>`).join('')}
        </select>
      </label>
    </div>`;
}

export function bindExerciseFilterSelects(root, onChange) {
  root.querySelectorAll('[data-filter]').forEach((sel) => {
    sel.addEventListener('change', () => onChange(readExerciseFilters(root)));
  });
}
