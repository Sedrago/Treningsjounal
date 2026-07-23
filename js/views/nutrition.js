/**
 * views/nutrition.js – logging av protein/karbo-inntak og favoritt-presets.
 */

import * as store from '../store.js';
import { renderNutritionSummaryHtml } from '../nutrition-ui.js';
import { bindMatvaretabellenSearch } from '../food-table-ui.js';
import { esc, fmtMacroG, todayStr, toast } from '../utils.js';

function presetLabel(p) {
  const unit = p.unitLabel ? ` / ${p.unitLabel}` : '';
  const karbo = p.carbsG ? `, ${fmtMacroG(p.carbsG)} g K` : '';
  return `${p.name} (${fmtMacroG(p.proteinG)} g P${karbo}${unit})`;
}

export async function render(container, params, query) {
  const showPresets = query.favoritter === '1' || params[0] === 'favoritter';
  const date = query.date || todayStr();
  const [summary, presets] = await Promise.all([
    store.getDailyNutritionSummary(date),
    store.getFoodPresets(),
  ]);

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/logging" class="tilbake" aria-label="Tilbake til logging">‹</a>
      <h1>Inntak</h1>
    </header>

    <section class="kort" aria-label="Dagsoversikt">
      <div class="skjema-rad">
        <div class="felt">
          <label class="felt-navn" for="inntak-dato">Dato</label>
          <input type="date" class="inndata" id="inntak-dato" value="${date}">
        </div>
      </div>
      <div id="inntak-oppsummering">${renderNutritionSummaryHtml(summary)}</div>
    </section>

    <section class="kort" aria-label="Matvaretabellen">
      <h2 class="kort-tittel">Matvaretabellen</h2>
      <p class="dus liten">Søk, velg matvare, mengde og enhet (g, dl eller glass).</p>
      <label class="felt-navn" for="matvare-sok">Søk matvare</label>
      <input type="search" class="inndata" id="matvare-sok" placeholder="F.eks. melk" autocomplete="off">
      <p class="dus liten" id="matvare-sok-status"></p>
      <div id="matvare-sok-treff" class="matvare-sok-treff"></div>
    </section>

    <section class="kort" aria-label="Logg inntak">
      <h2 class="kort-tittel">Logg inntak</h2>
      <label class="felt-navn" for="inntak-preset">Favoritt</label>
      <select class="inndata" id="inntak-preset">
        <option value="">Velg favoritt …</option>
        ${presets.map((p) => `<option value="${p.id}">${esc(presetLabel(p))}</option>`).join('')}
      </select>
      <p class="felt-navn">Antall</p>
      <div class="kost-qty-rad">
        <div class="kost-qty-pills" role="group" aria-label="Antall">
          ${[1, 2, 3, 4].map((n) => `<button type="button" class="kost-qty-pill${n === 1 ? ' aktiv' : ''}" data-qty="${n}">${n}</button>`).join('')}
        </div>
        <input type="number" class="inndata kost-qty-input" id="inntak-qty" value="1" min="0.25" step="0.25" inputmode="decimal">
      </div>
      <button type="button" class="knapp primaer bred" id="inntak-legg-til" ${presets.length ? '' : 'disabled'}>Legg til</button>
      ${presets.length ? '' : '<p class="dus liten">Lag en favoritt nedenfor, eller bruk manuell registrering.</p>'}

      <details class="kost-manuell" id="inntak-manuell">
        <summary>Manuell registrering</summary>
        <div class="kost-manuell-innhold">
          <div class="skjema-rad">
            <div class="felt">
              <label class="felt-navn" for="inntak-protein">Protein (g)</label>
              <input type="number" class="inndata" id="inntak-protein" min="0" step="0.1" inputmode="decimal">
            </div>
            <div class="felt">
              <label class="felt-navn" for="inntak-karbo">Karbo (g)</label>
              <input type="number" class="inndata" id="inntak-karbo" min="0" step="0.1" inputmode="decimal">
            </div>
          </div>
          <label class="felt-navn" for="inntak-notat">Notat <span class="dus">(valgfritt)</span></label>
          <input type="text" class="inndata" id="inntak-notat" placeholder="F.eks. lunsj">
          <label class="kost-lagre-favoritt">
            <input type="checkbox" id="inntak-lagre-favoritt">
            Lagre som favoritt
          </label>
          <div id="inntak-favoritt-felt" hidden>
            <label class="felt-navn" for="inntak-favoritt-navn">Favorittnavn</label>
            <input type="text" class="inndata" id="inntak-favoritt-navn" placeholder="F.eks. Egg">
            <label class="felt-navn" for="inntak-favoritt-enhet">Enhet <span class="dus">(valgfritt)</span></label>
            <input type="text" class="inndata" id="inntak-favoritt-enhet" placeholder="stk">
          </div>
          <button type="button" class="knapp sekundaer bred" id="inntak-manuell-lagre">Lagre manuelt</button>
        </div>
      </details>
    </section>

    <section class="kort" aria-label="Dagens inntak">
      <h2 class="kort-tittel">Registrert ${date === todayStr() ? 'i dag' : 'denne dagen'}</h2>
      <div id="inntak-liste">
        ${summary.intakes.map((i) => `
          <div class="kort inntak-rad" data-id="${i.id}">
            <div>
              <strong>${fmtMacroG(i.proteinG)} g P</strong>
              ${i.carbsG ? `<span class="dus"> · ${fmtMacroG(i.carbsG)} g K</span>` : ''}
              <span class="dus"> · ${esc(i.time || '–')}</span>
              ${i.note ? `<p class="dus liten">${esc(i.note)}</p>` : ''}
            </div>
            <button type="button" class="ikon-knapp" data-slett="${i.id}" aria-label="Slett inntak">✕</button>
          </div>`).join('') || '<p class="tomt">Ingen inntak registrert.</p>'}
      </div>
    </section>

    <div id="matvare-ark-vert"></div>

    <section class="kort" aria-label="Favoritter" id="inntak-favoritter">
      <h2 class="kort-tittel">Favoritter</h2>
      <p class="dus liten">Protein og karbo per enhet (f.eks. per egg eller per skive).</p>
      <form id="preset-skjema" class="kost-preset-skjema">
        <input type="hidden" id="preset-id">
        <label class="felt-navn" for="preset-navn">Navn</label>
        <input type="text" class="inndata" id="preset-navn" required placeholder="Egg">
        <div class="skjema-rad">
          <div class="felt">
            <label class="felt-navn" for="preset-protein">Protein (g)</label>
            <input type="number" class="inndata" id="preset-protein" min="0" step="0.1" required inputmode="decimal">
          </div>
          <div class="felt">
            <label class="felt-navn" for="preset-karbo">Karbo (g)</label>
            <input type="number" class="inndata" id="preset-karbo" min="0" step="0.1" value="0" inputmode="decimal">
          </div>
          <div class="felt">
            <label class="felt-navn" for="preset-enhet">Enhet</label>
            <input type="text" class="inndata" id="preset-enhet" placeholder="stk">
          </div>
        </div>
        <div class="knapp-rad">
          <button type="submit" class="knapp primaer" id="preset-lagre">Lagre favoritt</button>
          <button type="button" class="knapp sekundaer" id="preset-avbryt" hidden>Avbryt</button>
        </div>
      </form>
      <div id="preset-liste">
        ${presets.map((p) => `
          <div class="kort preset-rad" data-id="${p.id}">
            <div>
              <strong>${esc(p.name)}</strong>
              <span class="dus"> · ${fmtMacroG(p.proteinG)} g P${p.carbsG ? `, ${fmtMacroG(p.carbsG)} g K` : ''}${p.unitLabel ? ` / ${esc(p.unitLabel)}` : ''}</span>
            </div>
            <div class="preset-handlinger">
              <button type="button" class="ikon-knapp" data-rediger="${p.id}" aria-label="Rediger favoritt">✎</button>
              <button type="button" class="ikon-knapp" data-slett-preset="${p.id}" aria-label="Slett favoritt">✕</button>
            </div>
          </div>`).join('') || '<p class="tomt">Ingen favoritter ennå.</p>'}
      </div>
    </section>
  `;

  const reload = async () => {
    const d = container.querySelector('#inntak-dato')?.value || date;
    const nextQuery = {};
    if (d !== todayStr()) nextQuery.date = d;
    if (query.favoritter === '1') nextQuery.favoritter = '1';
    await render(container, params, nextQuery);
  };

  container.querySelector('#inntak-dato').addEventListener('change', () => {
    const d = container.querySelector('#inntak-dato').value;
    location.hash = d === todayStr() ? '#/inntak' : `#/inntak?date=${d}`;
  });

  bindMatvaretabellenSearch(container, {
    sheetHost: container.querySelector('#matvare-ark-vert'),
    getDate: () => container.querySelector('#inntak-dato')?.value || date,
    onSaved: reload,
  });

  let selectedQty = 1;
  container.querySelectorAll('.kost-qty-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedQty = Number(btn.dataset.qty);
      container.querySelector('#inntak-qty').value = String(selectedQty);
      container.querySelectorAll('.kost-qty-pill').forEach((b) => b.classList.toggle('aktiv', b === btn));
    });
  });
  container.querySelector('#inntak-qty').addEventListener('input', (e) => {
    selectedQty = Number(e.target.value) || 1;
    container.querySelectorAll('.kost-qty-pill').forEach((b) => {
      b.classList.toggle('aktiv', Number(b.dataset.qty) === selectedQty);
    });
  });

  container.querySelector('#inntak-legg-til')?.addEventListener('click', async () => {
    const presetId = container.querySelector('#inntak-preset').value;
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) {
      toast('Velg en favoritt', 'feil');
      return;
    }
    const qty = Number(container.querySelector('#inntak-qty').value) || selectedQty;
    const d = container.querySelector('#inntak-dato').value;
    await store.saveFoodIntake(store.intakeFromPreset(preset, qty, { date: d }));
    toast('Inntak lagret', 'suksess');
    await reload();
  });

  const favCheckbox = container.querySelector('#inntak-lagre-favoritt');
  const favFields = container.querySelector('#inntak-favoritt-felt');
  favCheckbox.addEventListener('change', () => { favFields.hidden = !favCheckbox.checked; });

  container.querySelector('#inntak-manuell-lagre').addEventListener('click', async () => {
    const proteinG = Number(container.querySelector('#inntak-protein').value);
    const carbsG = Number(container.querySelector('#inntak-karbo').value) || 0;
    if (!Number.isFinite(proteinG) && !carbsG) {
      toast('Oppgi protein eller karbo', 'feil');
      return;
    }
    const d = container.querySelector('#inntak-dato').value;
    const note = container.querySelector('#inntak-notat').value.trim();
    await store.saveFoodIntake({
      date: d,
      proteinG: proteinG || 0,
      carbsG,
      note,
    });
    if (favCheckbox.checked) {
      const name = container.querySelector('#inntak-favoritt-navn').value.trim()
        || note.split('×')[0].trim()
        || 'Favoritt';
      await store.saveFoodPreset({
        name,
        proteinG: proteinG || 0,
        carbsG,
        unitLabel: container.querySelector('#inntak-favoritt-enhet').value.trim(),
      });
      toast('Inntak og favoritt lagret', 'suksess');
    } else {
      toast('Inntak lagret', 'suksess');
    }
    await reload();
  });

  container.querySelectorAll('[data-slett]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await store.deleteFoodIntake(btn.dataset.slett);
      await reload();
    });
  });

  const presetForm = container.querySelector('#preset-skjema');
  const presetCancel = container.querySelector('#preset-avbryt');
  const resetPresetForm = () => {
    presetForm.reset();
    container.querySelector('#preset-id').value = '';
    container.querySelector('#preset-karbo').value = '0';
    presetCancel.hidden = true;
  };

  presetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await store.saveFoodPreset({
      id: container.querySelector('#preset-id').value || undefined,
      name: container.querySelector('#preset-navn').value,
      proteinG: container.querySelector('#preset-protein').value,
      carbsG: container.querySelector('#preset-karbo').value,
      unitLabel: container.querySelector('#preset-enhet').value,
    });
    toast('Favoritt lagret', 'suksess');
    await reload();
  });

  presetCancel.addEventListener('click', resetPresetForm);

  container.querySelectorAll('[data-rediger]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = presets.find((x) => x.id === btn.dataset.rediger);
      if (!p) return;
      container.querySelector('#preset-id').value = p.id;
      container.querySelector('#preset-navn').value = p.name;
      container.querySelector('#preset-protein').value = p.proteinG;
      container.querySelector('#preset-karbo').value = p.carbsG ?? 0;
      container.querySelector('#preset-enhet').value = p.unitLabel || '';
      presetCancel.hidden = false;
      container.querySelector('#inntak-favoritter').scrollIntoView({ behavior: 'smooth' });
    });
  });

  container.querySelectorAll('[data-slett-preset]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Slette denne favoritten?')) return;
      await store.deleteFoodPreset(btn.dataset.slettPreset);
      await reload();
    });
  });

  if (showPresets) {
    container.querySelector('#inntak-favoritter')?.scrollIntoView({ behavior: 'smooth' });
  }
}
