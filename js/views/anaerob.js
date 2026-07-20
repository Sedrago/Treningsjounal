/**
 * views/anaerob.js – anaerob aktivitet: melkesyre/laktat per dag.
 */

import * as store from '../store.js';
import { esc, formatDateShort, todayStr, toast } from '../utils.js';

function lactateToggleHtml(produced, { date, idPrefix = 'laktat' } = {}) {
  return `
    <div class="kost-laktat anaerob-laktat">
      <span class="kost-laktat-etikett">Produsert melkesyre</span>
      <div class="kost-laktat-valg" role="group" aria-label="Produsert melkesyre">
        <button type="button" class="kost-laktat-knapp${produced === true ? ' aktiv' : ''}"
          data-laktat="ja" data-dato="${esc(date)}">Ja</button>
        <button type="button" class="kost-laktat-knapp${produced === false ? ' aktiv' : ''}"
          data-laktat="nei" data-dato="${esc(date)}">Nei</button>
        ${produced != null ? '' : '<span class="dus liten kost-laktat-uav">Ikke registrert</span>'}
      </div>
    </div>`;
}

function bindLactateToggle(container, { onChange } = {}) {
  container.querySelectorAll('[data-laktat]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const date = btn.dataset.dato || todayStr();
      const produced = btn.dataset.laktat === 'ja';
      await store.saveLactateForDate(date, produced);
      toast('Lagret', 'suksess');
      onChange?.();
    });
  });
}

export async function render(container) {
  const date = todayStr();
  const rows = await store.getLactateEntries();
  const todayEntry = await store.getLactateForDate(date);
  const todayProduced = todayEntry ? todayEntry.produced : null;

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/logging" class="tilbake" aria-label="Tilbake til logging">‹</a>
      <h1>Anaerob</h1>
    </header>

    <p class="dus liten anaerob-intro">Melkesyre (laktat) produseres ved hard anaerob innsats — f.eks. intervaller eller tung styrke.</p>

    <section class="kort" aria-label="Registrer laktat">
      <h2 class="kort-tittel">I dag</h2>
      <div id="anaerob-i-dag">${lactateToggleHtml(todayProduced, { date })}</div>
    </section>

    <section class="kort" aria-label="Annen dato">
      <label class="felt-navn" for="anaerob-dato">Registrer for annen dato</label>
      <input type="date" class="inndata" id="anaerob-dato" value="${date}" max="${date}">
      <div id="anaerob-dato-laktat" class="anaerob-dato-laktat"></div>
    </section>

    <section class="kort" aria-label="Historikk">
      <h2 class="kort-tittel">Historikk</h2>
      <div id="anaerob-liste">
        ${rows.map((r) => `
          <div class="kort anaerob-rad" data-id="${r.id}">
            <div>
              <strong>${r.produced ? 'Ja' : 'Nei'}</strong>
              <span class="dus"> · ${formatDateShort(r.date)}</span>
            </div>
            <button type="button" class="ikon-knapp" data-slett="${r.id}" data-dato="${r.date}" aria-label="Slett registrering">✕</button>
          </div>`).join('') || '<p class="tomt">Ingen registreringer ennå.</p>'}
      </div>
    </section>
  `;

  const refreshDateSection = async () => {
    const d = container.querySelector('#anaerob-dato').value;
    const entry = await store.getLactateForDate(d);
    const host = container.querySelector('#anaerob-dato-laktat');
    host.innerHTML = lactateToggleHtml(entry ? entry.produced : null, { date: d });
    bindLactateToggle(host, { onChange: refreshDateSection });
  };

  bindLactateToggle(container.querySelector('#anaerob-i-dag'), {
    onChange: () => render(container),
  });

  container.querySelector('#anaerob-dato').addEventListener('change', refreshDateSection);
  await refreshDateSection();

  container.querySelectorAll('[data-slett]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await store.clearLactateForDate(btn.dataset.dato);
      render(container);
    });
  });
}
