/**
 * views/setup-import.js – personlig oppsett via QR / deep link (#/oppsett?c=…).
 */

import * as setupShare from '../setup-share.js';
import * as sync from '../sync.js';
import { esc, toast } from '../utils.js';

function renderPasteForm(container) {
  container.innerHTML = `
    <header class="side-topp">
      <a href="#/innstillinger" class="tilbake" aria-label="Tilbake">‹</a>
      <h1>Koble til journal</h1>
    </header>
    <section class="kort">
      <p class="dus liten">Lim inn oppsettskode du fikk på e-post, eller skann personlig QR-kode.</p>
      <label class="felt-navn" for="setup-import-kode">Oppsettskode</label>
      <textarea class="inndata program-kode-felt" id="setup-import-kode" rows="4"
        placeholder="Lim inn kode her …"></textarea>
      <button type="button" class="knapp primaer bred" id="setup-import-parse">Fortsett</button>
      <a href="#/innstillinger" class="knapp sekundaer bred">Manuelt oppsett</a>
    </section>`;

  container.querySelector('#setup-import-parse').addEventListener('click', () => {
    const text = container.querySelector('#setup-import-kode').value.trim();
    if (!text) {
      toast('Lim inn oppsettskode først', 'feil');
      return;
    }
    try {
      const data = setupShare.parseSetupShareCode(text);
      renderConfirm(container, data);
    } catch (err) {
      toast(err.message || 'Ugyldig oppsettskode', 'feil');
    }
  });
}

function renderConfirm(container, data) {
  container.innerHTML = `
    <header class="side-topp">
      <a href="#/oppsett" class="tilbake" aria-label="Tilbake">‹</a>
      <h1>Bekreft oppsett</h1>
    </header>
    <section class="kort program-relay-import" aria-live="polite">
      <h2 class="kort-tittel">Koble til Google Sheets</h2>
      <p class="dus liten program-relay-meta">
        Dette gir appen tilgang til <strong>hele</strong> det tilknyttede regnearket (øvelser, logger osv.).
        Del aldri oppsettskoden offentlig.
      </p>
      <dl class="setup-preview-liste">
        <div><dt>Web App</dt><dd>${esc(setupShare.shortenUrl(data.apiUrl))}</dd></div>
        <div><dt>API-nøkkel</dt><dd>${esc(setupShare.maskApiKey(data.apiKey))}</dd></div>
        ${data.relayUrl ? `<div><dt>Relay</dt><dd>${esc(setupShare.shortenUrl(data.relayUrl))}</dd></div>` : ''}
        ${data.relayUsername ? `<div><dt>Relay-bruker</dt><dd>@${esc(data.relayUsername)}</dd></div>` : ''}
      </dl>
      <div class="knapp-rad program-relay-knapper">
        <button type="button" class="knapp primaer bred" id="setup-import-bekreft">Koble til og test</button>
        <a href="#/oppsett" class="knapp sekundaer bred">Avbryt</a>
      </div>
    </section>`;

  container.querySelector('#setup-import-bekreft').addEventListener('click', async () => {
    const btn = container.querySelector('#setup-import-bekreft');
    btn.disabled = true;
    try {
      await setupShare.applySetupPayload(data);
      setupShare.clearSetupCodeFromHash();
      toast('Tilkoblet! Synkroniserer …', 'suksess');
      await sync.fullSync();
      location.hash = '#/hjem';
    } catch (err) {
      toast(err.message || 'Kunne ikke koble til', 'feil');
      btn.disabled = false;
    }
  });
}

export async function render(container, _params, query) {
  const code = String(query.c || query.code || '').trim();

  if (!code) {
    renderPasteForm(container);
    return;
  }

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/innstillinger" class="tilbake" aria-label="Tilbake">‹</a>
      <h1>Koble til journal</h1>
    </header>
    <section class="kort"><p class="tomt">Leser oppsett …</p></section>`;

  try {
    const data = setupShare.parseSetupShareCode(code);
    renderConfirm(container, data);
  } catch (err) {
    container.innerHTML = `
      <header class="side-topp">
        <a href="#/innstillinger" class="tilbake" aria-label="Tilbake">‹</a>
        <h1>Koble til journal</h1>
      </header>
      <section class="kort">
        <p class="program-import-feil">${esc(err.message || 'Ugyldig oppsettskode')}</p>
        <a href="#/oppsett" class="knapp sekundaer bred">Lim inn kode manuelt</a>
      </section>`;
  }
}
