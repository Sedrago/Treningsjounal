/**
 * food-table-ui.js – søk i Matvaretabellen og porsjonsvalg på Inntak.
 */

import * as store from './store.js';
import {
  ensureMatvaretabellenLoaded,
  searchFoods,
  getFoodById,
  macrosForPortion,
  formatIntakeNoteGrams,
  foodListLabel,
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

function foodPer100gFromTable(food) {
  const m = macrosForPortion(food, 100, 'g');
  return {
    proteinG: m.proteinG,
    carbsG: m.carbsG,
    fatG: m.fatG,
    kcal: m.kcal,
  };
}

async function renderOppslagPanel(panelEl, food, { getDate, onSaved }) {
  panelEl.hidden = false;
  const prefix = 'matvare-oppslag';
  const lastG = await store.getLastPortionGramsForFood(food.foodId);

  panelEl.innerHTML = `
    <div class="matvare-oppslag-valgt">
      <p class="matvare-oppslag-navn"><strong>${esc(food.foodName)}</strong></p>
      <p class="dus liten">Verdier fra Matvaretabellen per 100 g.</p>
      ${renderPortionLogHtml(prefix)}
    </div>`;

  const api = bindPortionLog(panelEl, prefix, {
    getPer100g: () => foodPer100gFromTable(food),
    onError: (msg) => toast(msg, 'feil'),
    onAdd: async ({ portionG, count, totalGram, macros }) => {
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

/**
 * @param {HTMLElement} container
 * @param {{ oppslagPanel: HTMLElement, getDate: () => string, onSaved: () => void }} opts
 */
export function bindMatvaretabellenSearch(container, opts) {
  const input = container.querySelector('#matvare-sok');
  const resultsHost = container.querySelector('#matvare-sok-treff');
  const statusEl = container.querySelector('#matvare-sok-status');
  const panelEl = opts.oppslagPanel;
  if (!input || !resultsHost || !panelEl) return;

  let ready = false;

  const hidePanel = () => {
    panelEl.hidden = true;
    panelEl.innerHTML = '';
  };

  const setStatus = (text) => {
    if (statusEl) statusEl.textContent = text || '';
  };

  ensureMatvaretabellenLoaded()
    .then(() => {
      ready = true;
      setStatus('');
    })
    .catch(() => {
      setStatus('Kunne ikke laste Matvaretabellen. Sjekk nett.');
    });

  const renderResults = (items, query) => {
    if (!items.length) {
      hidePanel();
      resultsHost.innerHTML = `
        <p class="dus liten">Ingen treff i Matvaretabellen for «${esc(query)}».</p>
        <p class="dus liten">Mange tilskudd (f.eks. proteinpulver) finnes ikke her. Prøv «helmelk», «egg» eller manuell registrering.</p>`;
      return;
    }
    resultsHost.innerHTML = items.map((it) => `
      <button type="button" class="velger-rad matvare-treff-rad" data-food-id="${esc(it.id)}">
        <span class="velger-navn">${esc(foodListLabel(it.id, it.name))}</span>
      </button>`).join('');
    resultsHost.querySelectorAll('[data-food-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const food = getFoodById(btn.dataset.foodId);
        if (!food) return;
        resultsHost.innerHTML = '';
        resultsHost.hidden = true;
        await renderOppslagPanel(panelEl, food, {
          getDate: opts.getDate,
          onSaved: opts.onSaved,
        });
      });
    });
  };

  const onSearch = debounce(() => {
    if (!ready) {
      setStatus('Laster matvarer …');
      return;
    }
    const q = input.value.trim();
    if (q.length < 2) {
      resultsHost.innerHTML = '';
      resultsHost.hidden = true;
      hidePanel();
      return;
    }
    resultsHost.hidden = false;
    renderResults(searchFoods(q), q);
  }, 180);

  input.addEventListener('input', onSearch);
}
