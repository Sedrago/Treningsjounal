/**
 * views/bodyweight.js – logging og graf for kroppsvekt.
 */

import * as store from '../store.js';
import { lineChart } from '../charts.js';
import {
  esc, fmtNum, formatDateShort, todayStr, toast,
  toDisplayWeight, fromInputWeight, weightUnit,
} from '../utils.js';

export async function render(container) {
  const units = store.getSetting('units');
  const unit = weightUnit(units);
  const rows = await store.getBodyweights();

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/hjem" class="tilbake" aria-label="Tilbake til hjem">‹</a>
      <h1>Kroppsvekt</h1>
    </header>

    <form class="kort" id="vekt-skjema" aria-label="Ny vektregistrering">
      <div class="skjema-rad">
        <div class="felt">
          <label class="felt-navn" for="bw-dato">Dato</label>
          <input type="date" class="inndata" id="bw-dato" value="${todayStr()}" required>
        </div>
        <div class="felt">
          <label class="felt-navn" for="bw-vekt">Vekt (${unit})</label>
          <input type="number" inputmode="decimal" step="any" class="inndata" id="bw-vekt" required placeholder="0">
        </div>
        <div class="felt">
          <label class="felt-navn" for="bw-fett">Fett % <span class="dus">(valgfritt)</span></label>
          <input type="number" inputmode="decimal" step="any" class="inndata" id="bw-fett" placeholder="–">
        </div>
      </div>
      <label class="felt-navn" for="bw-kommentar">Kommentar</label>
      <input type="text" class="inndata" id="bw-kommentar" placeholder="Valgfritt …">
      <button type="submit" class="knapp primaer bred">Lagre</button>
    </form>

    ${rows.length >= 2 ? `
    <section class="kort">
      <h2 class="kort-tittel">Utvikling (${unit})</h2>
      <div id="vekt-graf"></div>
    </section>` : ''}

    <div id="vekt-liste">
      ${rows.map((b) => `
        <div class="kort vekt-rad" data-id="${b.id}">
          <div>
            <strong>${fmtNum(toDisplayWeight(b.weight, units))} ${unit}</strong>
            ${b.fatPct != null ? `<span class="dus"> · ${fmtNum(b.fatPct)} % fett</span>` : ''}
            <span class="dus"> · ${formatDateShort(b.date)}</span>
            ${b.comment ? `<p class="dus liten">«${esc(b.comment)}»</p>` : ''}
          </div>
          <button type="button" class="ikon-knapp" data-slett="${b.id}" aria-label="Slett registrering">✕</button>
        </div>`).join('') || '<p class="tomt">Ingen registreringer ennå.</p>'}
    </div>
  `;

  container.querySelector('#vekt-skjema').addEventListener('submit', async (e) => {
    e.preventDefault();
    const weight = parseFloat(container.querySelector('#bw-vekt').value.replace(',', '.'));
    if (!weight) return;
    const fatRaw = container.querySelector('#bw-fett').value.replace(',', '.');
    await store.saveBodyweight({
      date: container.querySelector('#bw-dato').value,
      weight: fromInputWeight(weight, units),
      fatPct: fatRaw === '' ? null : parseFloat(fatRaw),
      comment: container.querySelector('#bw-kommentar').value.trim(),
    });
    toast('Vekt lagret', 'suksess');
    render(container);
  });

  container.querySelectorAll('[data-slett]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await store.deleteBodyweight(btn.dataset.slett);
      render(container);
    });
  });

  if (rows.length >= 2) {
    const points = [...rows].reverse().slice(-60).map((b) => ({
      label: b.date.slice(5).replace('-', '.'),
      value: Math.round(toDisplayWeight(b.weight, units) * 10) / 10,
    }));
    lineChart(container.querySelector('#vekt-graf'), points);
  }
}
