/**
 * meal-ai-ui.js – Spør AI + bekreft liste før lagring.
 */

import * as store from './store.js';
import {
  resolveMealFromText,
  resolveBrandMealFromText,
  sumResolvedMacros,
  recomputeRowMacros,
} from './nutrition-ai.js';
import {
  getFoodById,
  searchFoods,
  formatIntakeNote,
  MATVARE_UNITS,
} from './matvaretabellen.js';
import { esc, fmtMacroG, fmtKcal, toast, withActionFeedback } from './utils.js';

function formatRowLabel(row) {
  const amt = row.amount;
  const u = row.unit === 'stk' ? 'stk' : row.unit;
  let s = `${row.foodName} · ${amt} ${u}`;
  if (row.assumed) s += ' (antatt)';
  return s;
}

function renderMacroLine(m, { fromAi = false } = {}) {
  if (!m) return '–';
  const parts = [`${fmtMacroG(m.proteinG)} g P`, `${fmtMacroG(m.carbsG)} g K`];
  if (m.fatG) parts.push(`${fmtMacroG(m.fatG)} g F`);
  if (m.kcal != null && Number.isFinite(m.kcal)) parts.push(`${fmtKcal(m.kcal)} kcal`);
  if (fromAi) parts.push('estimat');
  return parts.join(' · ');
}

function foodSelectHtml(row) {
  if (row.candidates?.length) {
    return row.candidates.map((c) => `
      <option value="${esc(c.id)}"${c.id === row.foodId ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
  }
  const label = row.foodName || 'Ingen treff';
  return `<option value="" selected>${esc(label)}</option>`;
}

function missingRowExtraHtml(row) {
  const bits = [];
  if (!row.brandEstimate && row.originalQuery && row.query
    && row.originalQuery.toLowerCase() !== row.query.toLowerCase()) {
    bits.push(`<p class="dus liten">Foreslått søk: «${esc(row.query)}»</p>`);
  }
  if (row.missingHint) {
    bits.push(`<p class="dus liten meal-missing-hint">${esc(row.missingHint)}</p>`);
  } else if (row.missingFood && !row.macrosFromAi) {
    bits.push('<p class="dus liten">Velg matvare med Søk.</p>');
  }
  return bits.join('');
}

function foodRowHeadHtml(row, i) {
  if (row.brandEstimate) {
    return `<p class="meal-brand-label"><strong>${esc(row.foodName)}</strong></p>`;
  }
  return `
              <div class="meal-bekreft-rad-hode">
                <select class="inndata meal-food-valg" data-idx="${i}" aria-label="Matvare">
                  ${foodSelectHtml(row)}
                </select>
                <button type="button" class="knapp sekundaer liten meal-endre-knapp" data-endre="${i}">Søk</button>
              </div>`;
}

function openChangeFoodSheet(row, onPick) {
  const overlay = document.createElement('div');
  overlay.id = 'meal-edit-overlay';
  overlay.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark matvare-portion-ark" role="dialog">
      <div class="ark-hode">
        <h2>Endre matvare</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <p class="dus liten">${esc(row.raw)}</p>
      <label class="felt-navn" for="meal-endre-sok">Søk</label>
      <input type="search" class="inndata" id="meal-endre-sok" value="${esc(row.query)}" autocomplete="off">
      <div id="meal-endre-treff" class="matvare-sok-treff"></div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', close));

  const renderHits = (q) => {
    const hits = searchFoods(q, 15);
    const treff = overlay.querySelector('#meal-endre-treff');
    if (!hits.length) {
      treff.innerHTML = '<p class="dus liten">Ingen treff.</p>';
      return;
    }
    treff.innerHTML = hits.map((h) => `
      <button type="button" class="velger-rad" data-id="${esc(h.id)}">
        <span class="velger-navn">${esc(h.name)}</span>
      </button>`).join('');
    treff.querySelectorAll('[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        onPick(btn.dataset.id);
        close();
      });
    });
  };

  renderHits(row.query);
  overlay.querySelector('#meal-endre-sok').addEventListener('input', (e) => {
    renderHits(e.target.value.trim());
  });
}

function openConfirmSheet(host, rows, { date, onSaved, mode = 'hybrid' }) {
  let state = rows.map((r) => ({ ...r }));
  const intro = mode === 'brand'
    ? 'Upresist estimat (ikke Matvaretabellen). Antall = porsjoner. Sjekk antakelser og bekreft før lagring.'
    : 'Makro fra Matvaretabellen der det finnes treff. Uten treff kan appen foreslå søk og estimat — bekreft før lagring.';

  const render = () => {
    const sum = sumResolvedMacros(state);
    host.innerHTML = `
      <div class="ark-bakgrunn" data-lukk></div>
      <div class="ark matvare-meal-ark" role="dialog" aria-labelledby="meal-bekreft-tittel">
        <div class="ark-hode">
          <h2 id="meal-bekreft-tittel">Bekreft før lagring</h2>
          <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
        </div>
        <p class="dus liten">${intro}</p>
        <div class="meal-bekreft-liste">
          ${state.map((row, i) => `
            <div class="meal-bekreft-rad${row.missingFood && !row.macrosFromAi ? ' meal-bekreft-rad--mangler' : ''}${row.macrosFromAi ? ' meal-bekreft-rad--ai' : ''}" data-idx="${i}">
              ${foodRowHeadHtml(row, i)}
              ${missingRowExtraHtml(row)}
              ${row.assumptionNote ? `<p class="dus liten">${esc(row.assumptionNote)}</p>` : ''}
              <div class="skjema-rad meal-bekreft-mengde">
                <div class="felt">
                  <label class="felt-navn">${row.brandEstimate ? 'Antall porsjoner' : 'Mengde'}</label>
                  <input type="number" class="inndata meal-mengde" data-idx="${i}" value="${row.amount}"
                    min="0.25" step="0.25" inputmode="decimal">
                </div>
                ${row.brandEstimate ? '' : `
                <div class="felt">
                  <label class="felt-navn">Enhet</label>
                  <select class="inndata meal-enhet" data-idx="${i}">
                    ${MATVARE_UNITS.map((u) => `
                      <option value="${u.id}"${u.id === row.unit ? ' selected' : ''}>${u.label}</option>`).join('')}
                  </select>
                </div>`}
              </div>
              <p class="dus liten meal-rad-makro${row.macrosFromAi ? ' meal-rad-makro--ai' : ''}">${renderMacroLine(row.macros, { fromAi: row.macrosFromAi })}</p>
            </div>`).join('')}
        </div>
        <p class="meal-bekreft-sum"><strong>Sum:</strong> ${renderMacroLine({
          proteinG: sum.proteinG,
          carbsG: sum.carbsG,
          fatG: sum.fatG,
          kcal: sum.kcal,
        })}</p>
        <button type="button" class="knapp primaer bred" id="meal-legg-alle">Legg alle til i dag</button>
      </div>`;

    const close = () => { host.innerHTML = ''; };
    host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', close));

    host.querySelectorAll('.meal-mengde').forEach((input) => {
      input.addEventListener('input', () => {
        const idx = Number(input.dataset.idx);
        state[idx].amount = Number(input.value) || 0;
        state[idx] = recomputeRowMacros(state[idx]);
        render();
      });
    });

    host.querySelectorAll('.meal-enhet').forEach((sel) => {
      sel.addEventListener('change', () => {
        const idx = Number(sel.dataset.idx);
        state[idx].unit = sel.value;
        state[idx] = recomputeRowMacros(state[idx]);
        render();
      });
    });

    host.querySelectorAll('.meal-food-valg').forEach((sel) => {
      sel.addEventListener('change', () => {
        const idx = Number(sel.dataset.idx);
        state[idx] = recomputeRowMacros({ ...state[idx], foodId: sel.value });
        render();
      });
    });

    host.querySelectorAll('[data-endre]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.endre);
        openChangeFoodSheet(state[idx], (foodId) => {
          state[idx] = recomputeRowMacros({ ...state[idx], foodId });
          render();
        });
      });
    });

    host.querySelector('#meal-legg-alle')?.addEventListener('click', async () => {
      const valid = state.filter((r) => r.macros && (!r.missingFood || r.macrosFromAi));
      if (!valid.length) {
        toast('Ingen linjer klare til lagring — velg matvare eller godta estimat', 'feil');
        return;
      }
      for (const row of valid) {
        const m = row.macros;
        let note;
        if (row.macrosFromAi) {
          const label = row.originalQuery || row.query || row.raw || 'Matvare';
          const unitLbl = row.brandEstimate ? 'porsj' : row.unit;
          note = `${label} · ${row.amount} ${unitLbl} (estimat)`;
          if (row.assumed && row.assumptionNote) note += ` (${row.assumptionNote})`;
        } else {
          const food = getFoodById(row.foodId);
          note = formatIntakeNote(food.foodName, row.amount, row.unit);
          if (row.assumed && row.assumptionNote) note += ` (${row.assumptionNote})`;
        }
        await store.saveFoodIntake({
          date,
          proteinG: m.proteinG,
          carbsG: m.carbsG,
          fatG: m.fatG ?? null,
          kcal: m.kcal ?? null,
          note,
        });
      }
      close();
      toast(`${valid.length} inntak lagret`, 'suksess');
      onSaved?.();
    });
  };

  render();
}

/**
 * @param {HTMLElement} container
 * @param {{ sheetHost: HTMLElement, getDate: () => string, onSaved: () => void }} opts
 */
export function bindAssistertOppslag(container, opts) {
  const input = container.querySelector('#assistert-oppslag-tekst');
  const btn = container.querySelector('#assistert-oppslag-knapp');
  if (!input || !btn || !opts.sheetHost) return;

  btn.addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text) {
      toast('Beskriv hva du spiste', 'feil');
      return;
    }
    await withActionFeedback(btn, {
      busyLabel: 'Slår opp…',
      pendingToast: 'Assistert oppslag…',
      work: async () => {
        const rows = await resolveMealFromText(text);
        openConfirmSheet(opts.sheetHost, rows, {
          date: opts.getDate(),
          onSaved: opts.onSaved,
          mode: 'hybrid',
        });
      },
    }).catch((err) => {
      toast(err.message || 'Kunne ikke slå opp', 'feil');
    });
  });
}

/** @deprecated bruk bindAssistertOppslag */
export const bindSpørAiMeal = bindAssistertOppslag;

/** Åpent søk — rett/porsjon/restaurant, kun AI-estimat. */
export function bindApentSokMeal(container, opts) {
  const input = container.querySelector('#apent-sok-tekst');
  const btn = container.querySelector('#apent-sok-knapp');
  if (!input || !btn || !opts.sheetHost) return;

  btn.addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text) {
      toast('Beskriv retten eller måltidet', 'feil');
      return;
    }
    await withActionFeedback(btn, {
      busyLabel: 'Estimerer…',
      pendingToast: 'Åpent søk…',
      work: async () => {
        const rows = await resolveBrandMealFromText(text);
        openConfirmSheet(opts.sheetHost, rows, {
          date: opts.getDate(),
          onSaved: opts.onSaved,
          mode: 'brand',
        });
      },
    }).catch((err) => {
      toast(err.message || 'Kunne ikke estimere', 'feil');
    });
  });
}

/** @deprecated bruk bindApentSokMeal */
export const bindMerkevareEstimat = bindApentSokMeal;
