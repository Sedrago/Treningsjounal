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
import { renderPortionLogHtml, bindPortionLog } from './portion-log-ui.js';
import {
  getFoodById,
  searchFoods,
  formatIntakeNoteGrams,
  foodListLabel,
  macrosForPortion,
  macrosFromPer100g,
} from './matvaretabellen.js';
import { rowTotalGrams } from './nutrition-ai.js';
import { esc, fmtMacroG, fmtKcal, toast, withActionFeedback } from './utils.js';

function emptyCustomRow() {
  return {
    customFavorite: true,
    customName: '',
    customPer100: null,
    raw: 'Egen favoritt',
    query: '',
    originalQuery: '',
    amount: 1,
    unit: 'g',
    portionG: null,
    count: 1,
    foodId: null,
    candidates: [],
    missingFood: false,
    macrosFromAi: false,
    brandEstimate: false,
    macros: null,
    foodName: 'Egen favoritt',
  };
}

function recomputeMealRow(row) {
  if (!row.customFavorite) return recomputeRowMacros(row);
  const p = row.customPer100;
  if (!p) return { ...row, macros: null, foodName: row.customName || 'Egen favoritt' };
  const total = rowTotalGrams(row);
  if (total <= 0) return { ...row, macros: null, foodName: row.customName || 'Egen favoritt' };
  return {
    ...row,
    macros: macrosFromPer100g(p, total),
    foodName: row.customName || 'Egen favoritt',
    missingFood: false,
    macrosFromAi: false,
  };
}

function customRowHtml(row, i) {
  const p = row.customPer100 || {};
  return `
    <div class="meal-bekreft-rad meal-bekreft-rad--egen" data-idx="${i}">
      <div class="meal-bekreft-rad-hode meal-bekreft-rad-hode--med-fjern">
        <strong class="meal-egen-tittel">Egen favoritt</strong>
        <button type="button" class="ikon-knapp meal-fjern-rad" data-fjern="${i}" aria-label="Fjern linje">✕</button>
      </div>
      <label class="felt-navn" for="meal-egen-navn-${i}">Navn</label>
      <input type="text" class="inndata meal-egen-navn" id="meal-egen-navn-${i}" data-egen-navn="${i}"
        value="${esc(row.customName || '')}" placeholder="F.eks. Proteinshake">
      <p class="felt-navn">Per 100 g</p>
      <div class="skjema-rad">
        <div class="felt">
          <label class="felt-navn" for="meal-egen-p-${i}">Protein (g)</label>
          <input type="number" class="inndata meal-egen-makro" id="meal-egen-p-${i}" data-egen-protein="${i}"
            value="${p.proteinG != null ? p.proteinG : ''}" min="0" step="0.1" inputmode="decimal">
        </div>
        <div class="felt">
          <label class="felt-navn" for="meal-egen-k-${i}">Karbo (g)</label>
          <input type="number" class="inndata meal-egen-makro" id="meal-egen-k-${i}" data-egen-karbo="${i}"
            value="${p.carbsG != null ? p.carbsG : ''}" min="0" step="0.1" inputmode="decimal">
        </div>
      </div>
      <div class="skjema-rad">
        <div class="felt">
          <label class="felt-navn" for="meal-egen-f-${i}">Fett (g)</label>
          <input type="number" class="inndata meal-egen-makro" id="meal-egen-f-${i}" data-egen-fett="${i}"
            value="${p.fatG != null ? p.fatG : ''}" min="0" step="0.1" inputmode="decimal">
        </div>
        <div class="felt">
          <label class="felt-navn" for="meal-egen-kcal-${i}">Kalorier (kcal)</label>
          <input type="number" class="inndata meal-egen-makro" id="meal-egen-kcal-${i}" data-egen-kcal="${i}"
            value="${p.kcal != null ? p.kcal : ''}" min="0" step="1" inputmode="numeric">
        </div>
      </div>
      ${renderPortionLogHtml(`meal-${i}`, { showLeggTil: false })}
      <p class="dus liten meal-rad-makro">${renderMacroLine(row.macros)}</p>
      <p class="dus liten">Lagres som favoritt (per 100 g) når du trykker «Legg alle til i dag».</p>
    </div>`;
}

function readCustomPer100FromRow(rad, idx) {
  const read = (field) => {
    const el = rad.querySelector(`[data-egen-${field}="${idx}"]`);
    const raw = el?.value?.trim();
    if (raw === '' || raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const proteinG = read('protein');
  const carbsG = read('karbo');
  const fatG = read('fett');
  const kcal = read('kcal');
  if (proteinG == null || carbsG == null || fatG == null || kcal == null) return null;
  return { proteinG, carbsG, fatG, kcal };
}

function syncCustomRowFromDom(state, idx, rad) {
  const name = rad.querySelector(`[data-egen-navn="${idx}"]`)?.value?.trim() || '';
  return recomputeMealRow({
    ...state[idx],
    customName: name,
    customPer100: readCustomPer100FromRow(rad, idx),
  });
}

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
    return row.candidates.map((c) => {
      const label = foodListLabel(c.id, c.name);
      return `
      <option value="${esc(c.id)}"${c.id === row.foodId ? ' selected' : ''}>${esc(label)}</option>`;
    }).join('');
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

function foodRowHeadHtml(row, i, { showRemove = false } = {}) {
  if (row.brandEstimate) {
    return `<div class="meal-bekreft-rad-hode meal-bekreft-rad-hode--med-fjern">
      <p class="meal-brand-label"><strong>${esc(row.foodName)}</strong></p>
      ${showRemove ? `<button type="button" class="ikon-knapp meal-fjern-rad" data-fjern="${i}" aria-label="Fjern linje">✕</button>` : ''}
    </div>`;
  }
  return `
              <div class="meal-bekreft-rad-hode meal-bekreft-rad-hode--med-fjern">
                <select class="inndata meal-food-valg" data-idx="${i}" aria-label="Matvare">
                  ${foodSelectHtml(row)}
                </select>
                <button type="button" class="knapp sekundaer liten meal-endre-knapp" data-endre="${i}">Søk</button>
                ${showRemove ? `<button type="button" class="ikon-knapp meal-fjern-rad" data-fjern="${i}" aria-label="Fjern linje">✕</button>` : ''}
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
        <span class="velger-navn">${esc(foodListLabel(h.id, h.name))}</span>
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
  const hybrid = mode === 'hybrid';
  const intro = mode === 'brand'
    ? 'Upresist estimat (ikke Matvaretabellen). Antall = porsjoner. Sjekk antakelser og bekreft før lagring.'
    : 'Makro fra Matvaretabellen der det finnes treff. Fjern linjer du ikke spiste, eller legg til egen favoritt. Bekreft før lagring.';

  const render = () => {
    const prevScroll = host.querySelector('.meal-bekreft-liste')?.scrollTop ?? 0;
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
          ${state.length ? state.map((row, i) => {
            if (row.customFavorite) return customRowHtml(row, i);
            return `
            <div class="meal-bekreft-rad${row.missingFood && !row.macrosFromAi ? ' meal-bekreft-rad--mangler' : ''}${row.macrosFromAi ? ' meal-bekreft-rad--ai' : ''}" data-idx="${i}">
              ${foodRowHeadHtml(row, i, { showRemove: hybrid })}
              ${missingRowExtraHtml(row)}
              ${row.assumptionNote ? `<p class="dus liten">${esc(row.assumptionNote)}</p>` : ''}
              ${row.brandEstimate ? `
              <div class="skjema-rad meal-bekreft-mengde">
                <div class="felt">
                  <label class="felt-navn">Antall porsjoner</label>
                  <input type="number" class="inndata meal-mengde" data-idx="${i}" value="${row.amount}"
                    min="0.25" step="0.25" inputmode="decimal">
                </div>
              </div>` : renderPortionLogHtml(`meal-${i}`, { showLeggTil: false })}
              <p class="dus liten meal-rad-makro${row.macrosFromAi ? ' meal-rad-makro--ai' : ''}">${renderMacroLine(row.macros, { fromAi: row.macrosFromAi })}</p>
            </div>`;
          }).join('') : '<p class="dus liten">Ingen linjer — legg til egen favoritt eller lukk og prøv på nytt.</p>'}
        </div>
        ${hybrid ? '<button type="button" class="knapp sekundaer bred meal-legg-til-egen">Legg til egen favoritt</button>' : ''}
        <p class="meal-bekreft-sum"><strong>Sum:</strong> ${renderMacroLine({
          proteinG: sum.proteinG,
          carbsG: sum.carbsG,
          fatG: sum.fatG,
          kcal: sum.kcal,
        })}</p>
        <button type="button" class="knapp primaer bred" id="meal-legg-alle" ${state.length ? '' : 'disabled'}>Legg alle til i dag</button>
      </div>`;

    const listEl = host.querySelector('.meal-bekreft-liste');
    if (listEl) listEl.scrollTop = prevScroll;

    const close = () => { host.innerHTML = ''; };
    host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', close));

    const updateSumDisplay = () => {
      const s = sumResolvedMacros(state);
      const sumEl = host.querySelector('.meal-bekreft-sum');
      if (sumEl) {
        sumEl.innerHTML = `<strong>Sum:</strong> ${renderMacroLine({
          proteinG: s.proteinG,
          carbsG: s.carbsG,
          fatG: s.fatG,
          kcal: s.kcal,
        })}`;
      }
    };

    host.querySelectorAll('.meal-mengde').forEach((input) => {
      input.addEventListener('input', () => {
        const idx = Number(input.dataset.idx);
        state[idx].amount = Number(input.value) || 0;
        state[idx] = recomputeMealRow(state[idx]);
        render();
      });
    });

    host.querySelectorAll('[data-fjern]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const idx = Number(btn.dataset.fjern);
        state.splice(idx, 1);
        render();
      });
    });

    host.querySelector('.meal-legg-til-egen')?.addEventListener('click', (e) => {
      e.preventDefault();
      state.push(emptyCustomRow());
      render();
    });

    state.forEach((row, i) => {
      const rad = host.querySelector(`.meal-bekreft-rad[data-idx="${i}"]`);
      if (!rad) return;

      if (row.customFavorite) {
        const updateCustom = () => {
          state[i] = syncCustomRowFromDom(state, i, rad);
          const macroEl = rad.querySelector('.meal-rad-makro');
          if (macroEl) macroEl.textContent = renderMacroLine(state[i].macros);
          updateSumDisplay();
        };
        rad.querySelectorAll('.meal-egen-makro, .meal-egen-navn').forEach((el) => {
          el.addEventListener('input', updateCustom);
        });
        const prefix = `meal-${i}`;
        let rowApi;
        rowApi = bindPortionLog(rad, prefix, {
          getPer100g: () => state[i].customPer100,
          onChange: ({ portionG, count }) => {
            if (portionG != null) state[i].portionG = portionG;
            if (count != null) state[i].count = count;
            state[i] = recomputeMealRow(state[i]);
            const macroEl = rad.querySelector('.meal-rad-makro');
            if (macroEl) macroEl.textContent = renderMacroLine(state[i].macros);
            rowApi?.syncPreview();
            updateSumDisplay();
          },
          onQuickCount: (c) => {
            state[i].count = c;
            state[i] = recomputeMealRow(state[i]);
            const macroEl = rad.querySelector('.meal-rad-makro');
            if (macroEl) macroEl.textContent = renderMacroLine(state[i].macros);
            rowApi?.syncPreview();
            updateSumDisplay();
          },
        });
        if (row.count != null) rowApi?.setCount(row.count);
        return;
      }

      if (row.brandEstimate) return;
      const prefix = `meal-${i}`;
      let rowApi;
      rowApi = bindPortionLog(rad, prefix, {
        getPer100g: () => {
          const food = getFoodById(state[i].foodId);
          if (!food) return null;
          const m = macrosForPortion(food, 100, 'g');
          return { proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG, kcal: m.kcal };
        },
        onChange: ({ portionG, count }) => {
          if (portionG != null) state[i].portionG = portionG;
          if (count != null) state[i].count = count;
          state[i] = recomputeMealRow(state[i]);
          const macroEl = rad.querySelector('.meal-rad-makro');
          if (macroEl) macroEl.textContent = renderMacroLine(state[i].macros, { fromAi: state[i].macrosFromAi });
          rowApi?.syncPreview();
          updateSumDisplay();
        },
        onQuickCount: (c) => {
          state[i].count = c;
          state[i] = recomputeMealRow(state[i]);
          const macroEl = rad.querySelector('.meal-rad-makro');
          if (macroEl) macroEl.textContent = renderMacroLine(state[i].macros, { fromAi: state[i].macrosFromAi });
          rowApi?.syncPreview();
          updateSumDisplay();
        },
      });
      if (row.portionG != null) rowApi?.setPortionG(row.portionG);
      if (row.count != null) rowApi?.setCount(row.count);
      store.getLastPortionGramsForFood(row.foodId).then((g) => {
        if (g != null && (state[i].portionG == null || state[i].portionG === '')) {
          state[i].portionG = g;
          state[i] = recomputeMealRow(state[i]);
          rowApi?.setPortionG(g);
          const macroEl = rad.querySelector('.meal-rad-makro');
          if (macroEl) macroEl.textContent = renderMacroLine(state[i].macros, { fromAi: state[i].macrosFromAi });
        }
      });
    });

    host.querySelectorAll('.meal-food-valg').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const idx = Number(sel.dataset.idx);
        state[idx] = recomputeMealRow({ ...state[idx], foodId: sel.value, portionG: null });
        const last = await store.getLastPortionGramsForFood(sel.value);
        if (last != null) {
          state[idx] = recomputeMealRow({ ...state[idx], portionG: last });
        }
        render();
      });
    });

    host.querySelectorAll('[data-endre]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.endre);
        openChangeFoodSheet(state[idx], async (foodId) => {
          state[idx] = recomputeMealRow({ ...state[idx], foodId, portionG: null });
          const last = await store.getLastPortionGramsForFood(foodId);
          if (last != null) {
            state[idx] = recomputeMealRow({ ...state[idx], portionG: last });
          }
          render();
        });
      });
    });

    host.querySelector('#meal-legg-alle')?.addEventListener('click', async () => {
      const valid = state.filter((r) => {
        if (!r.macros) return false;
        if (r.customFavorite) {
          return r.customPer100 && Number(r.portionG) > 0 && Number(r.count) > 0
            && String(r.customName || '').trim();
        }
        if (r.macrosFromAi || r.brandEstimate) return true;
        return Boolean(r.foodId) && Number(r.portionG) > 0 && Number(r.count) > 0;
      });
      if (!valid.length) {
        toast('Ingen linjer klare til lagring — velg matvare eller godta estimat', 'feil');
        return;
      }
      for (const row of valid) {
        const m = row.macros;
        let note;
        if (row.customFavorite) {
          const name = row.customName.trim();
          note = formatIntakeNoteGrams(name, row.portionG, row.count);
          await store.saveFoodPreset({
            name,
            ...row.customPer100,
            defaultPortionG: row.portionG,
            lastPortionG: row.portionG,
          });
        } else if (row.macrosFromAi) {
          const label = row.originalQuery || row.query || row.raw || 'Matvare';
          const unitLbl = row.brandEstimate ? 'porsj' : row.unit;
          note = `${label} · ${row.amount} ${unitLbl} (estimat)`;
          if (row.assumed && row.assumptionNote) note += ` (${row.assumptionNote})`;
        } else {
          const food = getFoodById(row.foodId);
          note = formatIntakeNoteGrams(food?.foodName || row.foodName, row.portionG, row.count);
          if (row.foodId && row.portionG != null) {
            await store.setLastPortionGramsForFood(row.foodId, row.portionG);
          }
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
