/**
 * views/settings.js – innstillinger, tilkobling/synk, eksport og import.
 */

import * as store from '../store.js';
import * as api from '../api.js';
import * as sync from '../sync.js';
import * as ie from '../importexport.js';
import { esc, toast } from '../utils.js';
import { applyTheme } from '../app.js';

export async function render(container) {
  const s = (key) => store.getSetting(key);

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/hjem" class="tilbake" aria-label="Tilbake til hjem">‹</a>
      <h1>Innstillinger</h1>
    </header>

    <section class="kort" aria-label="Tilkobling">
      <h2 class="kort-tittel">Google Sheets-tilkobling</h2>
      <label class="felt-navn" for="api-url">Web App-URL (fra Apps Script)</label>
      <input type="url" class="inndata" id="api-url" value="${esc(api.getApiUrl())}"
        placeholder="https://script.google.com/macros/s/…/exec">
      <label class="felt-navn" for="api-key">API-nøkkel</label>
      <input type="text" class="inndata" id="api-key" value="${esc(api.getApiKey())}"
        placeholder="Fra Settings-arket i regnearket" autocomplete="off">
      <div class="knapp-rad">
        <button type="button" class="knapp sekundaer" id="test-api">Test tilkobling</button>
        <button type="button" class="knapp sekundaer" id="synk-naa">Synkroniser nå</button>
      </div>
      <p class="dus liten" id="synk-status"></p>
    </section>

    <section class="kort" aria-label="Preferanser">
      <h2 class="kort-tittel">Preferanser</h2>

      <label class="felt-navn" for="s-tema">Tema</label>
      <select class="inndata" id="s-tema">
        <option value="dark" ${s('theme') === 'dark' ? 'selected' : ''}>Mørkt</option>
        <option value="light" ${s('theme') === 'light' ? 'selected' : ''}>Lyst</option>
        <option value="auto" ${s('theme') === 'auto' ? 'selected' : ''}>Følg systemet</option>
      </select>

      <label class="felt-navn" for="s-enheter">Enheter</label>
      <select class="inndata" id="s-enheter">
        <option value="metric" ${s('units') === 'metric' ? 'selected' : ''}>Metrisk (kg)</option>
        <option value="imperial" ${s('units') === 'imperial' ? 'selected' : ''}>Imperial (lb)</option>
      </select>

      <label class="felt-navn" for="s-hvile">Hviletider (sekunder, kommaseparert)</label>
      <input type="text" class="inndata" id="s-hvile" value="${esc(s('restTimes'))}" inputmode="numeric">

      <div class="skjema-rad">
        <div class="felt">
          <label class="felt-navn" for="s-rir">Standard RIR</label>
          <input type="number" class="inndata" id="s-rir" value="${s('defaultRir')}" min="0" max="10">
        </div>
        <div class="felt">
          <label class="felt-navn" for="s-sett">Standard sett</label>
          <input type="number" class="inndata" id="s-sett" value="${s('defaultSets')}" min="1" max="10">
        </div>
      </div>
      <div class="skjema-rad">
        <div class="felt">
          <label class="felt-navn" for="s-repsmin">Reps nedre</label>
          <input type="number" class="inndata" id="s-repsmin" value="${s('defaultRepsMin')}" min="1" max="50">
        </div>
        <div class="felt">
          <label class="felt-navn" for="s-repsmaks">Reps øvre</label>
          <input type="number" class="inndata" id="s-repsmaks" value="${s('defaultRepsMax')}" min="1" max="50">
        </div>
      </div>

      <label class="felt-navn" for="s-start">Startside</label>
      <select class="inndata" id="s-start">
        <option value="hjem" ${s('startPage') === 'hjem' ? 'selected' : ''}>Hjem</option>
        <option value="okt" ${s('startPage') === 'okt' ? 'selected' : ''}>Dagens økt</option>
      </select>

      <label class="felt-navn" for="s-streak">Streak-modus</label>
      <select class="inndata" id="s-streak">
        <option value="rolling7" ${s('streakMode') === 'rolling7' ? 'selected' : ''}>Rullerende 7 dager (minst 1 dag per periode)</option>
        <option value="calendar" ${s('streakMode') === 'calendar' ? 'selected' : ''}>Kalenderuke (mandag–søndag)</option>
      </select>

      <label class="felt-navn" for="s-arbeidssett">Arbeidssett-grense (RIR ≤)</label>
      <p class="dus liten">Sett med høyere RIR eller uten RIR telles som lette/oppvarming og brukes ikke i intensitetsstatistikk.</p>
      <input type="number" class="inndata" id="s-arbeidssett" value="${s('workingSetRirMax')}" min="0" max="10">
    </section>

    <section class="kort" aria-label="Eksport og import">
      <h2 class="kort-tittel">Eksport</h2>
      <div class="knapp-rad">
        <button type="button" class="knapp sekundaer" id="eksport-json">JSON</button>
        <button type="button" class="knapp sekundaer" id="eksport-csv">CSV</button>
        <button type="button" class="knapp sekundaer" id="eksport-excel">Excel</button>
        <button type="button" class="knapp sekundaer" id="eksport-pdf">PDF-rapport</button>
      </div>
      <h2 class="kort-tittel">Import (JSON eller CSV)</h2>
      <input type="file" id="import-fil" accept=".json,.csv" class="inndata">
    </section>

    <section class="kort" aria-label="Farlig sone">
      <h2 class="kort-tittel">Lokale data</h2>
      <button type="button" class="knapp farlig bred" id="slett-lokalt">Slett alle lokale data</button>
      <p class="dus liten">Sletter kun data på denne enheten. Google Sheets påvirkes ikke,
        og dataene hentes tilbake ved neste synkronisering.</p>
    </section>
  `;

  const statusEl = container.querySelector('#synk-status');
  const unsubscribe = sync.onChange(updateStatus);
  function updateStatus() {
    if (!statusEl.isConnected) { unsubscribe(); return; }
    const st = sync.state;
    const parts = [];
    parts.push(st.online ? 'Tilkoblet' : 'Frakoblet');
    if (st.pending) parts.push(`${st.pending} endringer venter`);
    if (st.lastSync) parts.push(`Sist synkronisert: ${new Date(st.lastSync).toLocaleString('nb-NO')}`);
    if (st.lastError) parts.push(`Feil: ${st.lastError}`);
    statusEl.textContent = parts.join(' · ');
  }
  updateStatus();

  // Tilkobling.
  container.querySelector('#api-url').addEventListener('change', (e) => api.setApiUrl(e.target.value));
  container.querySelector('#api-key').addEventListener('change', (e) => api.setApiKey(e.target.value));
  container.querySelector('#test-api').addEventListener('click', async (e) => {
    api.setApiUrl(container.querySelector('#api-url').value);
    api.setApiKey(container.querySelector('#api-key').value);
    e.target.disabled = true;
    try {
      await api.ping();
      toast('Tilkoblingen fungerer!', 'suksess');
    } catch (err) {
      toast(`Feil: ${err.message}`, 'feil');
    } finally {
      e.target.disabled = false;
    }
  });
  container.querySelector('#synk-naa').addEventListener('click', async (e) => {
    e.target.disabled = true;
    const ok = await sync.fullSync();
    toast(ok ? 'Synkronisert' : `Synkronisering feilet: ${sync.state.lastError}`, ok ? 'suksess' : 'feil');
    e.target.disabled = false;
    updateStatus();
  });

  // Preferanser – lagres umiddelbart.
  const bind = (id, key, after) => {
    container.querySelector(id).addEventListener('change', async (e) => {
      await store.setSetting(key, e.target.value);
      if (after) after(e.target.value);
    });
  };
  bind('#s-tema', 'theme', applyTheme);
  bind('#s-enheter', 'units');
  bind('#s-hvile', 'restTimes');
  bind('#s-rir', 'defaultRir');
  bind('#s-sett', 'defaultSets');
  bind('#s-repsmin', 'defaultRepsMin');
  bind('#s-repsmaks', 'defaultRepsMax');
  bind('#s-start', 'startPage');
  bind('#s-streak', 'streakMode');
  bind('#s-arbeidssett', 'workingSetRirMax');

  // Eksport.
  container.querySelector('#eksport-json').addEventListener('click', () => ie.exportJson());
  container.querySelector('#eksport-csv').addEventListener('click', () => ie.exportCsv());
  container.querySelector('#eksport-excel').addEventListener('click', () => ie.exportExcel());
  container.querySelector('#eksport-pdf').addEventListener('click', () => ie.exportPdf());

  // Import.
  container.querySelector('#import-fil').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const count = file.name.endsWith('.json')
        ? await ie.importJson(text)
        : await ie.importCsv(text);
      toast(`Importerte ${count} rader`, 'suksess');
    } catch (err) {
      toast(`Import feilet: ${err.message}`, 'feil');
    }
    e.target.value = '';
  });

  // Slett lokale data.
  container.querySelector('#slett-lokalt').addEventListener('click', async () => {
    if (!confirm('Slette alle lokale data på denne enheten?')) return;
    await store.wipeLocalData();
    toast('Lokale data slettet');
    location.hash = '#/hjem';
    location.reload();
  });
}
