/**
 * food-table-ui.js – søk i Matvaretabellen og porsjonsark på Inntak.
 */

import * as store from './store.js';
import {
  ensureMatvaretabellenLoaded,
  searchFoods,
  getFoodById,
  macrosForPortion,
  formatIntakeNote,
  portionHint,
} from './matvaretabellen.js';
import { esc, fmtMacroG, toast } from './utils.js';

const UNITS = [
  { id: 'g', label: 'g' },
  { id: 'dl', label: 'dl' },
  { id: 'glass', label: 'glass' },
];

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function renderMacroPreview(m) {
  const parts = [`${fmtMacroG(m.proteinG)} g P`, `${fmtMacroG(m.carbsG)} g K`];
  if (m.fatG) parts.push(`${fmtMacroG(m.fatG)} g F`);
  if (m.kcal) parts.push(`${m.kcal} kcal`);
  parts.push(`${Math.round(m.grams)} g totalt`);
  return parts.join(' · ');
}

function openPortionSheet(host, food, { date, onSaved }) {
  let amount = 1;
  let unit = 'glass';

  const syncPreview = () => {
    const m = macrosForPortion(food, amount, unit);
    const el = host.querySelector('#matvare-preview');
    if (el) el.textContent = renderMacroPreview(m);
    const hint = host.querySelector('#matvare-enhet-hint');
    if (hint) hint.textContent = portionHint(unit);
  };

  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark matvare-portion-ark" role="dialog" aria-labelledby="matvare-portion-tittel">
      <div class="ark-hode">
        <h2 id="matvare-portion-tittel">${esc(food.foodName)}</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <p class="dus liten">Verdier fra Matvaretabellen (Mattilsynet), per porsjon.</p>
      <p class="felt-navn">Mengde</p>
      <div class="kost-qty-rad">
        <input type="number" class="inndata kost-qty-input" id="matvare-mengde" value="1" min="0.25" step="0.25" inputmode="decimal">
      </div>
      <p class="felt-navn">Enhet</p>
      <div class="matvare-enhet-rad" role="group" aria-label="Enhet">
        ${UNITS.map((u) => `
          <button type="button" class="kost-qty-pill matvare-enhet-pill${u.id === unit ? ' aktiv' : ''}"
            data-unit="${u.id}">${esc(u.label)}</button>`).join('')}
      </div>
      <p class="dus liten" id="matvare-enhet-hint">${esc(portionHint(unit))}</p>
      <p class="matvare-preview" id="matvare-preview"></p>
      <button type="button" class="knapp primaer bred" id="matvare-legg-til">Legg til inntak</button>
    </div>`;

  const close = () => { host.innerHTML = ''; };
  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', close));

  const mengdeInput = host.querySelector('#matvare-mengde');
  mengdeInput.addEventListener('input', () => {
    amount = Number(mengdeInput.value) || 0;
    syncPreview();
  });

  host.querySelectorAll('.matvare-enhet-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      unit = btn.dataset.unit;
      host.querySelectorAll('.matvare-enhet-pill').forEach((b) => {
        b.classList.toggle('aktiv', b.dataset.unit === unit);
      });
      syncPreview();
    });
  });

  host.querySelector('#matvare-legg-til')?.addEventListener('click', async () => {
    amount = Number(mengdeInput.value) || 0;
    if (amount <= 0) {
      toast('Oppgi mengde', 'feil');
      return;
    }
    const m = macrosForPortion(food, amount, unit);
    if (!m.proteinG && !m.carbsG) {
      toast('Ingen makroverdier for denne matvaren', 'feil');
      return;
    }
    await store.saveFoodIntake({
      date,
      proteinG: m.proteinG,
      carbsG: m.carbsG,
      fatG: m.fatG != null && Number.isFinite(m.fatG) ? m.fatG : null,
      kcal: m.kcal != null && Number.isFinite(m.kcal) ? m.kcal : null,
      note: formatIntakeNote(food.foodName, amount, unit),
    });
    close();
    toast('Inntak lagret', 'suksess');
    onSaved?.();
  });

  syncPreview();
}

/**
 * @param {HTMLElement} container
 * @param {{ sheetHost: HTMLElement, getDate: () => string, onSaved: () => void }} opts
 */
export function bindMatvaretabellenSearch(container, opts) {
  const input = container.querySelector('#matvare-sok');
  const resultsHost = container.querySelector('#matvare-sok-treff');
  const statusEl = container.querySelector('#matvare-sok-status');
  if (!input || !resultsHost || !opts.sheetHost) return;

  let ready = false;

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
      resultsHost.innerHTML = `
        <p class="dus liten">Ingen treff i Matvaretabellen for «${esc(query)}».</p>
        <p class="dus liten">Mange tilskudd (f.eks. proteinpulver) finnes ikke her. Prøv «helmelk», «egg» eller manuell registrering under «Logg inntak».</p>`;
      return;
    }
    resultsHost.innerHTML = items.map((it) => `
      <button type="button" class="velger-rad matvare-treff-rad" data-food-id="${esc(it.id)}">
        <span class="velger-navn">${esc(it.name)}</span>
      </button>`).join('');
    resultsHost.querySelectorAll('[data-food-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const food = getFoodById(btn.dataset.foodId);
        if (!food) return;
        openPortionSheet(opts.sheetHost, food, {
          date: opts.getDate(),
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
      return;
    }
    renderResults(searchFoods(q), q);
  }, 180);

  input.addEventListener('input', onSearch);
}
