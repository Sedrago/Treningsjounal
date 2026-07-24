/**
 * nutrition-search-ui.js – felles søk i favoritter og Matvaretabellen.
 */

import * as store from './store.js';
import {
  ensureMatvaretabellenLoaded,
  searchFoods,
  getFoodById,
  macrosForPortion,
  formatIntakeNoteGrams,
  formatMacrosCompact,
} from './matvaretabellen.js';
import { renderPortionLogHtml, bindPortionLog } from './portion-log-ui.js';
import { esc, toast } from './utils.js';

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function normalizeSearch(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

function presetSearchTitle(p) {
  const tag = store.isFoodPresetReady(p) ? '' : ' — må oppdateres';
  return `${p.name}${tag}`;
}

function presetSearchMacrosLine(p) {
  return `${formatMacrosCompact(p)} / 100 g`;
}

function foodSearchTitle(id, name) {
  const food = getFoodById(id);
  return name || food?.foodName || '';
}

function foodSearchMacrosLine(id) {
  const food = getFoodById(id);
  if (!food) return '';
  const m = macrosForPortion(food, 100, 'g');
  return `${formatMacrosCompact(m)} / 100 g`;
}

function searchResultRowHtml({ favoritt = false, presetId = '', foodId = '', title, macros }) {
  const dataAttr = presetId
    ? `data-preset-id="${esc(presetId)}"`
    : `data-food-id="${esc(foodId)}"`;
  const favClass = favoritt ? ' ernaring-sok-rad--favoritt' : '';
  const star = favoritt
    ? '<span class="ernaring-favoritt-stjerne" aria-hidden="true">★</span>'
    : '';
  const makro = macros
    ? `<span class="ernaring-sok-makro dus liten">${esc(macros)}</span>`
    : '';
  return `
      <button type="button" class="velger-rad ernaring-sok-rad${favClass}" ${dataAttr}>
        ${star}
        <span class="ernaring-sok-rad-innhold">
          <span class="ernaring-sok-navn">${esc(title)}</span>
          ${makro}
        </span>
      </button>`;
}

function filterPresets(presets, query) {
  const q = normalizeSearch(query);
  if (!q) return presets;
  return presets.filter((p) => normalizeSearch(p.name).includes(q));
}

function foodPer100gFromTable(food) {
  const m = macrosForPortion(food, 100, 'g');
  return {
    proteinG: m.proteinG,
    carbsG: m.carbsG,
    fatG: m.fatG,
    kcal: m.kcal,
  };
}

function updateHint(hintEl, q, matvareReady) {
  if (!hintEl) return;
  if (!matvareReady) {
    hintEl.textContent = 'Laster Matvaretabellen …';
    return;
  }
  if (!q) {
    hintEl.textContent = 'Viser favoritter. Skriv minst 2 tegn for å søke i Matvaretabellen.';
    return;
  }
  if (q.length < 2) {
    hintEl.textContent = 'Skriv minst 2 tegn for å søke i Matvaretabellen.';
    return;
  }
  hintEl.textContent = 'Søker i favoritter og Matvaretabellen.';
}

async function renderFoodPanel(panelEl, food, { getDate, onSaved }) {
  panelEl.hidden = false;
  const prefix = 'ernaring-mat';
  const lastG = await store.getLastPortionGramsForFood(food.foodId);

  panelEl.innerHTML = `
    <div class="matvare-oppslag-valgt">
      <p class="matvare-oppslag-navn"><strong>${esc(food.foodName)}</strong></p>
      <p class="dus liten">Matvaretabellen · per 100 g</p>
      ${renderPortionLogHtml(prefix)}
    </div>`;

  const api = bindPortionLog(panelEl, prefix, {
    getPer100g: () => foodPer100gFromTable(food),
    onError: (msg) => toast(msg, 'feil'),
    onAdd: async ({ portionG, count, macros }) => {
      if (!macros.proteinG && !macros.carbsG) {
        toast('Ingen makroverdier for denne matvaren', 'feil');
        return;
      }
      await store.saveFoodIntake({
        date: getDate(),
        proteinG: macros.proteinG,
        carbsG: macros.carbsG,
        fatG: macros.fatG,
        kcal: macros.kcal,
        note: formatIntakeNoteGrams(food.foodName, portionG, count),
      });
      await store.setLastPortionGramsForFood(food.foodId, portionG);
      toast('Inntak lagret', 'suksess');
      onSaved?.();
    },
  });
  if (lastG != null) api?.setPortionG(lastG);
}

function renderPresetPanel(panelEl, preset, { getDate, onSaved, onRepairPreset }) {
  panelEl.hidden = false;
  const prefix = 'ernaring-preset';
  const lastG = preset.lastPortionG ?? preset.defaultPortionG;

  panelEl.innerHTML = `
    <div class="matvare-oppslag-valgt">
      <p class="matvare-oppslag-navn"><span class="ernaring-favoritt-stjerne" aria-hidden="true">★</span> <strong>${esc(preset.name)}</strong></p>
      <p class="dus liten">Favoritt · per 100 g</p>
      ${renderPortionLogHtml(prefix)}
    </div>`;

  bindPortionLog(panelEl, prefix, {
    getPer100g: () => store.presetPer100gMacros(preset),
    onError: (msg) => toast(msg, 'feil'),
    onAdd: async ({ portionG, count }) => {
      if (!store.isFoodPresetReady(preset)) {
        onRepairPreset?.(preset);
        return;
      }
      await store.saveFoodIntake(store.intakeFromPreset(preset, count, { date: getDate(), portionG }));
      await store.touchFoodPresetLastPortion(preset.id, portionG);
      toast('Inntak lagret', 'suksess');
      onSaved?.();
    },
  })?.setPortionG(lastG ?? '');
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   presets: object[],
 *   getDate: () => string,
 *   onSaved: () => void,
 *   onRepairPreset: (p: object) => void,
 * }} opts
 */
export function bindUnifiedNutritionSearch(container, opts) {
  const input = container.querySelector('#ernaring-sok');
  const resultsHost = container.querySelector('#ernaring-sok-treff');
  const hintEl = container.querySelector('#ernaring-sok-hint');
  const panelEl = container.querySelector('#ernaring-valgt-panel');
  if (!input || !resultsHost || !panelEl) return null;

  let matvareReady = false;
  let presets = opts.presets || [];
  let searchFocused = false;
  /** Etter valg fra listen — ikke vis dropdown igjen før bruker fokuserer/skriver på nytt. */
  let treffLukketEtterValg = false;

  const hidePanel = () => {
    panelEl.hidden = true;
    panelEl.innerHTML = '';
  };

  const lukkTreffliste = () => {
    resultsHost.hidden = true;
    resultsHost.innerHTML = '';
  };

  const refresh = () => {
    const q = input.value.trim();
    updateHint(hintEl, q, matvareReady);

    if (treffLukketEtterValg) {
      return;
    }

    if (!q && !searchFocused) {
      lukkTreffliste();
      hidePanel();
      return;
    }

    const presetHits = filterPresets(presets, q);
    const foodHits = matvareReady && q.length >= 2 ? searchFoods(q) : [];

    if (!q && !presetHits.length) {
      resultsHost.hidden = false;
      resultsHost.innerHTML = '<p class="dus liten">Ingen favoritter ennå. Opprett under «Administrer favoritter».</p>';
      hidePanel();
      return;
    }

    if (!presetHits.length && !foodHits.length) {
      resultsHost.hidden = false;
      resultsHost.innerHTML = `<p class="dus liten">Ingen treff for «${esc(q)}».</p>`;
      hidePanel();
      return;
    }

    resultsHost.hidden = false;
    const presetRows = presetHits.map((p) => searchResultRowHtml({
      favoritt: true,
      presetId: p.id,
      title: presetSearchTitle(p),
      macros: presetSearchMacrosLine(p),
    })).join('');
    const foodRows = foodHits.map((it) => searchResultRowHtml({
      foodId: it.id,
      title: foodSearchTitle(it.id, it.name),
      macros: foodSearchMacrosLine(it.id),
    })).join('');

    resultsHost.innerHTML = presetRows + foodRows;

    const velgTreff = (fn) => (e) => {
      e.preventDefault();
      treffLukketEtterValg = true;
      searchFocused = false;
      lukkTreffliste();
      input.blur();
      fn();
    };

    resultsHost.querySelectorAll('[data-preset-id]').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', velgTreff(() => {
        const p = presets.find((x) => x.id === btn.dataset.presetId);
        if (!p) return;
        if (!store.isFoodPresetReady(p)) {
          treffLukketEtterValg = false;
          opts.onRepairPreset?.(p);
          return;
        }
        renderPresetPanel(panelEl, p, {
          getDate: opts.getDate,
          onSaved: opts.onSaved,
          onRepairPreset: opts.onRepairPreset,
        });
      }));
    });

    resultsHost.querySelectorAll('[data-food-id]').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', velgTreff(async () => {
        const food = getFoodById(btn.dataset.foodId);
        if (!food) return;
        await renderFoodPanel(panelEl, food, {
          getDate: opts.getDate,
          onSaved: opts.onSaved,
        });
      }));
    });
  };

  ensureMatvaretabellenLoaded()
    .then(() => {
      matvareReady = true;
      refresh();
    })
    .catch(() => {
      if (hintEl) hintEl.textContent = 'Kunne ikke laste Matvaretabellen. Favoritter fungerer fortsatt.';
      refresh();
    });

  const onInput = debounce(refresh, 180);
  input.addEventListener('input', () => {
    treffLukketEtterValg = false;
    onInput();
  });
  input.addEventListener('focus', () => {
    searchFocused = true;
    treffLukketEtterValg = false;
    refresh();
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      searchFocused = document.activeElement === input;
      if (!searchFocused && !input.value.trim()) {
        lukkTreffliste();
        hidePanel();
      }
    }, 180);
  });

  updateHint(hintEl, '', matvareReady);

  return {
    setPresets(next) {
      presets = next || [];
    },
    refresh,
  };
}
