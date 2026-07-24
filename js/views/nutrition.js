/**
 * views/nutrition.js – logging av protein/karbo-inntak og favoritt-presets.
 */

import * as store from '../store.js';
import { renderNutritionSummaryHtml } from '../nutrition-ui.js';
import { bindMatvaretabellenSearch } from '../food-table-ui.js';
import { bindAssistertOppslag, bindApentSokMeal } from '../meal-ai-ui.js';
import { esc, fmtMacroG, fmtKcal, todayStr, toast } from '../utils.js';

function presetLabel(p) {
  const unit = p.unitLabel ? ` / ${p.unitLabel}` : '';
  const karbo = p.carbsG ? `, ${fmtMacroG(p.carbsG)} g K` : '';
  const extra = [
    p.fatG ? `${fmtMacroG(p.fatG)} g F` : '',
    p.kcal ? `${fmtKcal(p.kcal)} kcal` : '',
  ].filter(Boolean).join(', ');
  const tail = extra ? `, ${extra}` : '';
  return `${p.name} (${fmtMacroG(p.proteinG)} g P${karbo}${tail}${unit})`;
}

function presetListMacros(p) {
  let s = `${fmtMacroG(p.proteinG)} g P`;
  if (p.carbsG) s += `, ${fmtMacroG(p.carbsG)} g K`;
  if (p.fatG) s += `, ${fmtMacroG(p.fatG)} g F`;
  if (p.kcal) s += `, ${fmtKcal(p.kcal)} kcal`;
  return s;
}

function intakeMacroLine(i) {
  const parts = [`${fmtMacroG(i.proteinG)} g P`];
  if (i.carbsG) parts.push(`${fmtMacroG(i.carbsG)} g K`);
  if (i.fatG) parts.push(`${fmtMacroG(i.fatG)} g F`);
  if (i.kcal) parts.push(`${fmtKcal(i.kcal)} kcal`);
  return parts.join(' · ');
}

function optionalNumInput(id, container) {
  const raw = container.querySelector(id)?.value?.trim();
  if (raw === '' || raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Alle fire makrofelt må være utfylt (0 er tillatt). */
function readRequiredPresetMacros(container, prefix = 'preset') {
  const proteinG = optionalNumInput(`#${prefix}-protein`, container);
  const carbsG = optionalNumInput(`#${prefix}-karbo`, container);
  const fatG = optionalNumInput(`#${prefix}-fett`, container);
  const kcal = optionalNumInput(`#${prefix}-kcal`, container);
  if (proteinG == null || carbsG == null || fatG == null || kcal == null) {
    return null;
  }
  return { proteinG, carbsG, fatG, kcal };
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
      <h1>Ernæring</h1>
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

    <section class="kort inntak-metode" aria-label="Lagret favoritt">
      <h2 class="kort-tittel inntak-metode-tittel"><span class="inntak-metode-nr">1</span> Lagret favoritt</h2>
      <p class="dus liten">Velg favoritt. Trykk et tall for å legge til med en gang, eller skriv antall og trykk Legg til.</p>
      <label class="felt-navn" for="inntak-preset">Favoritt</label>
      <select class="inndata" id="inntak-preset">
        <option value="">Velg favoritt …</option>
        ${presets.map((p) => `<option value="${p.id}">${esc(presetLabel(p))}</option>`).join('')}
      </select>
      <p class="felt-navn">Antall</p>
      <div class="kost-qty-rad kost-qty-rad--favoritt">
        <div class="kost-qty-pills" role="group" aria-label="Hurtig legg til">
          ${[1, 2, 3, 4].map((n) => `<button type="button" class="kost-qty-pill" data-qty-hurtig="${n}">${n}</button>`).join('')}
        </div>
        <div class="kost-qty-manuell">
          <input type="number" class="inndata kost-qty-input" id="inntak-qty" placeholder="Antall" min="0.25" step="0.25" inputmode="decimal" aria-label="Antall">
          <button type="button" class="knapp primaer mini" id="inntak-legg-til" ${presets.length ? '' : 'disabled'}>Legg til</button>
        </div>
      </div>
      ${presets.length ? '' : '<p class="dus liten">Opprett favoritter nederst på siden, eller bruk manuell registrering.</p>'}
    </section>

    <section class="kort inntak-metode" aria-label="Oppslag">
      <h2 class="kort-tittel inntak-metode-tittel"><span class="inntak-metode-nr">2</span> Oppslag</h2>
      <p class="dus liten">Matvaretabellen — mest presist når varen finnes. Søk, velg matvare, mengde og enhet.</p>
      <label class="felt-navn" for="matvare-sok">Søk matvare</label>
      <input type="search" class="inndata" id="matvare-sok" placeholder="F.eks. melk, egg, havregryn" autocomplete="off">
      <p class="dus liten" id="matvare-sok-status"></p>
      <div id="matvare-sok-treff" class="matvare-sok-treff"></div>
    </section>

    <section class="kort inntak-metode" aria-label="Assistert oppslag">
      <h2 class="kort-tittel inntak-metode-tittel"><span class="inntak-metode-nr">3</span> Assistert oppslag</h2>
      <p class="dus liten">Beskriv det du spiste med enkeltdele — vi deler opp og slår opp i Matvaretabellen. Ved manglende treff: forslag til søk og enkle estimater.</p>
      <label class="felt-navn" for="assistert-oppslag-tekst">Beskrivelse</label>
      <textarea class="inndata meal-ai-tekst" id="assistert-oppslag-tekst" rows="3"
        placeholder="F.eks. 2 egg, brødskive med smør og 1 dl melk"></textarea>
      <button type="button" class="knapp sekundaer bred" id="assistert-oppslag-knapp">Slå opp</button>
    </section>

    <section class="kort inntak-metode" aria-label="Åpent søk">
      <h2 class="kort-tittel inntak-metode-tittel"><span class="inntak-metode-nr">4</span> Åpent søk <span class="inntak-metode-tag">upresist</span></h2>
      <p class="dus liten">Hele retter og porsjoner — ikke ingrediensliste. F.eks. tallerken lapskaus, lunsj på kafé, McKylling-meny. Automatisk estimat, ikke Matvaretabellen.</p>
      <label class="felt-navn" for="apent-sok-tekst">Rett eller måltid</label>
      <textarea class="inndata meal-ai-tekst" id="apent-sok-tekst" rows="2"
        placeholder="F.eks. en tallerken lapskaus"></textarea>
      <button type="button" class="knapp sekundaer bred" id="apent-sok-knapp">Få forslag</button>
    </section>

    <section class="kort inntak-metode" aria-label="Manuell registrering">
      <h2 class="kort-tittel inntak-metode-tittel"><span class="inntak-metode-nr">5</span> Manuell registrering</h2>
      <p class="dus liten">Skriv inn makroer direkte.</p>
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
        <div class="skjema-rad">
          <div class="felt">
            <label class="felt-navn" for="inntak-fett">Fett (g) <span class="dus">(valgfritt)</span></label>
            <input type="number" class="inndata" id="inntak-fett" min="0" step="0.1" inputmode="decimal">
          </div>
          <div class="felt">
            <label class="felt-navn" for="inntak-kcal">Kalorier (kcal) <span class="dus">(valgfritt)</span></label>
            <input type="number" class="inndata" id="inntak-kcal" min="0" step="1" inputmode="numeric">
          </div>
        </div>
        <label class="felt-navn" for="inntak-notat">Notat <span class="dus">(valgfritt)</span></label>
        <input type="text" class="inndata" id="inntak-notat" placeholder="F.eks. lunsj">
        <label class="kost-lagre-favoritt">
          <input type="checkbox" id="inntak-lagre-favoritt">
          Lagre som favoritt <span class="dus">(krever protein, karbo, fett og kalorier)</span>
        </label>
        <div id="inntak-favoritt-felt" hidden>
          <label class="felt-navn" for="inntak-favoritt-navn">Favorittnavn</label>
          <input type="text" class="inndata" id="inntak-favoritt-navn" placeholder="F.eks. Egg">
          <label class="felt-navn" for="inntak-favoritt-enhet">Enhet <span class="dus">(valgfritt)</span></label>
          <input type="text" class="inndata" id="inntak-favoritt-enhet" placeholder="stk">
        </div>
        <button type="button" class="knapp sekundaer bred" id="inntak-manuell-lagre">Lagre</button>
      </div>
    </section>

    <section class="kort" aria-label="Dagens inntak">
      <h2 class="kort-tittel">Registrert ${date === todayStr() ? 'i dag' : 'denne dagen'}</h2>
      <div id="inntak-liste">
        ${summary.intakes.map((i) => `
          <div class="kort inntak-rad" data-id="${i.id}">
            <div>
              <strong>${intakeMacroLine(i)}</strong>
              <span class="dus"> · ${esc(i.time || '–')}</span>
              ${i.note ? `<p class="dus liten">${esc(i.note)}</p>` : ''}
            </div>
            <button type="button" class="ikon-knapp" data-slett="${i.id}" aria-label="Slett inntak">✕</button>
          </div>`).join('') || '<p class="tomt">Ingen inntak registrert.</p>'}
      </div>
    </section>

    <div id="matvare-ark-vert"></div>

    <section class="kort" aria-label="Administrer favoritter" id="inntak-favoritter">
      <h2 class="kort-tittel">Administrer favoritter</h2>
      <p class="dus liten">Protein, karbo, fett og kalorier per enhet (alle påkrevd).</p>
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
            <input type="number" class="inndata" id="preset-karbo" min="0" step="0.1" required inputmode="decimal">
          </div>
          <div class="felt">
            <label class="felt-navn" for="preset-enhet">Enhet <span class="dus">(valgfritt)</span></label>
            <input type="text" class="inndata" id="preset-enhet" placeholder="stk">
          </div>
        </div>
        <div class="skjema-rad">
          <div class="felt">
            <label class="felt-navn" for="preset-fett">Fett (g)</label>
            <input type="number" class="inndata" id="preset-fett" min="0" step="0.1" required inputmode="decimal">
          </div>
          <div class="felt">
            <label class="felt-navn" for="preset-kcal">Kalorier (kcal)</label>
            <input type="number" class="inndata" id="preset-kcal" min="0" step="1" required inputmode="numeric">
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
              <span class="dus"> · ${esc(presetListMacros(p))}${p.unitLabel ? ` / ${esc(p.unitLabel)}` : ''}</span>
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

  bindAssistertOppslag(container, {
    sheetHost: container.querySelector('#matvare-ark-vert'),
    getDate: () => container.querySelector('#inntak-dato')?.value || date,
    onSaved: reload,
  });

  bindApentSokMeal(container, {
    sheetHost: container.querySelector('#matvare-ark-vert'),
    getDate: () => container.querySelector('#inntak-dato')?.value || date,
    onSaved: reload,
  });

  async function addPresetIntake(qty) {
    const presetId = container.querySelector('#inntak-preset').value;
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) {
      toast('Velg en favoritt først', 'feil');
      return;
    }
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) {
      toast('Oppgi et gyldig antall', 'feil');
      return;
    }
    const d = container.querySelector('#inntak-dato').value;
    await store.saveFoodIntake(store.intakeFromPreset(preset, q, { date: d }));
    toast('Inntak lagret', 'suksess');
    await reload();
  }

  container.querySelectorAll('[data-qty-hurtig]').forEach((btn) => {
    btn.addEventListener('click', () => {
      addPresetIntake(Number(btn.dataset.qtyHurtig));
    });
  });

  container.querySelector('#inntak-legg-til')?.addEventListener('click', async () => {
    const qty = optionalNumInput('#inntak-qty', container);
    if (qty == null) {
      toast('Skriv antall i feltet', 'feil');
      return;
    }
    await addPresetIntake(qty);
  });

  const favCheckbox = container.querySelector('#inntak-lagre-favoritt');
  const favFields = container.querySelector('#inntak-favoritt-felt');
  favCheckbox.addEventListener('change', () => { favFields.hidden = !favCheckbox.checked; });

  container.querySelector('#inntak-manuell-lagre').addEventListener('click', async () => {
    if (favCheckbox.checked) {
      const macros = readRequiredPresetMacros(container, 'inntak');
      if (!macros) {
        toast('Favoritt krever protein, karbo, fett og kalorier', 'feil');
        return;
      }
    }
    const proteinG = optionalNumInput('#inntak-protein', container);
    const carbsG = optionalNumInput('#inntak-karbo', container) ?? 0;
    const fatG = optionalNumInput('#inntak-fett', container);
    const kcal = optionalNumInput('#inntak-kcal', container);
    if (proteinG == null && !carbsG && fatG == null && kcal == null) {
      toast('Oppgi minst én næringsverdi', 'feil');
      return;
    }
    const d = container.querySelector('#inntak-dato').value;
    const note = container.querySelector('#inntak-notat').value.trim();
    await store.saveFoodIntake({
      date: d,
      proteinG: proteinG ?? 0,
      carbsG,
      fatG,
      kcal,
      note,
    });
    if (favCheckbox.checked) {
      const macros = readRequiredPresetMacros(container, 'inntak');
      const name = container.querySelector('#inntak-favoritt-navn').value.trim()
        || note.split('×')[0].trim()
        || 'Favoritt';
      await store.saveFoodPreset({
        name,
        proteinG: macros.proteinG,
        carbsG: macros.carbsG,
        fatG: macros.fatG,
        kcal: macros.kcal,
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
    presetCancel.hidden = true;
  };

  presetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const macros = readRequiredPresetMacros(container, 'preset');
    if (!macros) {
      toast('Fyll ut protein, karbo, fett og kalorier', 'feil');
      return;
    }
    await store.saveFoodPreset({
      id: container.querySelector('#preset-id').value || undefined,
      name: container.querySelector('#preset-navn').value,
      proteinG: macros.proteinG,
      carbsG: macros.carbsG,
      fatG: macros.fatG,
      kcal: macros.kcal,
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
      container.querySelector('#preset-fett').value = p.fatG ?? '';
      container.querySelector('#preset-kcal').value = p.kcal ?? '';
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
