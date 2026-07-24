/**
 * portion-log-ui.js – felles mengde per enhet (g) + antall + forhåndsvisning.
 */

import { formatPortionPreview, macrosFromPer100g } from './matvaretabellen.js';

export function renderPortionLogHtml(prefix, { showLeggTil = true } = {}) {
  const p = prefix;
  return `
    <p class="felt-navn" for="${p}-portion-g">Mengde per enhet (g)</p>
    <input type="number" class="inndata kost-portion-g" id="${p}-portion-g" placeholder="Gram" min="0.25" step="0.25" inputmode="decimal" aria-label="Mengde per enhet i gram">
    <p class="felt-navn">Antall</p>
    <div class="kost-qty-rad kost-qty-rad--favoritt">
      <div class="kost-qty-pills" role="group" aria-label="Hurtig antall">
        ${[1, 2, 3, 4].map((n) => `<button type="button" class="kost-qty-pill" data-portion-qty="${n}">${n}</button>`).join('')}
      </div>
      <div class="kost-qty-manuell">
        <input type="number" class="inndata kost-qty-input" id="${p}-antall" placeholder="Antall" min="0.25" step="0.25" inputmode="decimal" aria-label="Antall">
        ${showLeggTil ? `<button type="button" class="knapp primaer mini" id="${p}-legg-til">Legg til</button>` : ''}
      </div>
    </div>
    <p class="matvare-preview kost-portion-preview" id="${p}-preview"></p>`;
}

function optionalNum(el) {
  const raw = el?.value?.trim();
  if (raw === '' || raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {HTMLElement} root
 * @param {string} prefix element-id prefix
 * @param {{
 *   getPer100g: () => ({ proteinG, carbsG, fatG, kcal } | null),
 *   onAdd: (payload: { portionG: number, count: number, totalGram: number, macros: object }) => void | Promise<void>,
 *   leggTilDisabled?: boolean,
 * }} opts
 */
export function bindPortionLog(root, prefix, opts) {
  const portionEl = root.querySelector(`#${prefix}-portion-g`);
  const antallEl = root.querySelector(`#${prefix}-antall`);
  const previewEl = root.querySelector(`#${prefix}-preview`);
  const leggTilBtn = root.querySelector(`#${prefix}-legg-til`);
  if (!portionEl || !antallEl) return;

  const pillsHost = root.querySelector('.kost-qty-pills');

  const syncPillHighlight = () => {
    if (!pillsHost) return;
    const count = optionalNum(antallEl);
    pillsHost.querySelectorAll('[data-portion-qty]').forEach((btn) => {
      const n = Number(btn.dataset.portionQty);
      const match = count != null && Math.abs(count - n) < 1e-9;
      btn.classList.toggle('aktiv', match);
      btn.setAttribute('aria-pressed', match ? 'true' : 'false');
    });
  };

  const syncPreview = () => {
    const per100 = opts.getPer100g?.();
    const portionG = optionalNum(portionEl);
    const countFromField = optionalNum(antallEl);
    const count = countFromField ?? 1;
    if (portionG == null || portionG <= 0 || !per100) {
      if (previewEl) previewEl.textContent = '';
    } else {
      const totalGram = portionG * count;
      if (previewEl) previewEl.textContent = formatPortionPreview(totalGram, per100);
    }
    syncPillHighlight();
  };

  const notifyChange = () => {
    opts.onChange?.({
      portionG: optionalNum(portionEl),
      count: optionalNum(antallEl),
    });
  };

  portionEl.addEventListener('input', () => {
    syncPreview();
    notifyChange();
  });
  antallEl.addEventListener('input', () => {
    syncPreview();
    notifyChange();
  });

  async function submit(count) {
    const c = Number(count);
    if (!Number.isFinite(c) || c <= 0) return { error: 'Oppgi et gyldig antall' };
    const portionG = optionalNum(portionEl);
    if (portionG == null || portionG <= 0) return { error: 'Fyll inn mengde per enhet (g)' };
    const per100 = opts.getPer100g?.();
    if (!per100) return { error: 'Mangler næringsdata per 100 g' };
    const totalGram = portionG * c;
    const macros = macrosFromPer100g(per100, totalGram);
    await opts.onAdd({ portionG, count: c, totalGram, macros });
    return { ok: true };
  }

  root.querySelectorAll('[data-portion-qty]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      antallEl.value = btn.dataset.portionQty;
      syncPreview();
      notifyChange();
      if (leggTilBtn && !leggTilBtn.disabled) {
        const res = await submit(Number(btn.dataset.portionQty));
        if (res?.error && opts.onError) opts.onError(res.error);
      } else {
        opts.onQuickCount?.(Number(btn.dataset.portionQty));
      }
    });
  });

  if (leggTilBtn) {
    if (opts.leggTilDisabled) leggTilBtn.disabled = true;
    leggTilBtn.addEventListener('click', async () => {
      const count = optionalNum(antallEl);
      if (count == null) {
        opts.onError?.('Skriv antall i feltet');
        return;
      }
      const res = await submit(count);
      if (res?.error) opts.onError?.(res.error);
    });
  }

  return {
    setPortionG: (g) => {
      if (g != null && g !== '' && Number.isFinite(Number(g))) portionEl.value = String(g);
      else portionEl.value = '';
      syncPreview();
    },
    setCount: (c) => {
      if (c != null && Number.isFinite(Number(c))) antallEl.value = String(c);
      syncPreview();
    },
    getPortionG: () => optionalNum(portionEl),
    getCount: () => optionalNum(antallEl),
    syncPreview,
    syncPillHighlight,
  };
}
