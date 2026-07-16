/**
 * views/settings.js – innstillinger, tilkobling/synk, eksport og import.
 */

import * as store from '../store.js';
import * as api from '../api.js';
import * as relay from '../relay-api.js';
import * as sync from '../sync.js';
import * as ie from '../importexport.js';
import { effortPillOptions } from '../pickers.js';
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

    <section class="kort" aria-label="Programdeling">
      <h2 class="kort-tittel">Programdeling (relay)</h2>
      <p class="dus liten">For QR-import og publisering til grupper. Personlig treningslogg deles aldri via relay.</p>
      <label class="felt-navn" for="relay-url">Relay Web App-URL</label>
      <input type="url" class="inndata" id="relay-url" value="${esc(relay.getRelayUrl())}"
        placeholder="https://script.google.com/macros/s/…/exec">
      <label class="felt-navn" for="relay-key">Publiseringsnøkkel (valgfri – kun for trenere)</label>
      <input type="text" class="inndata" id="relay-key" value="${esc(relay.getRelayPublishKey())}"
        placeholder="Fra kjorRelayOppsett()" autocomplete="off">
      <button type="button" class="knapp sekundaer" id="test-relay">Test relay</button>
      <div id="relay-partner-wrap" class="relay-partner-wrap"></div>
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
          <label class="felt-navn" for="s-vekt">Utgangspunkt vekt (kg)</label>
          <input type="number" class="inndata" id="s-vekt" value="${s('defaultWeightKg')}" min="0" max="500" step="0.5">
        </div>
        <div class="felt">
          <label class="felt-navn" for="s-reps">Utgangspunkt reps</label>
          <input type="number" class="inndata" id="s-reps" value="${s('defaultReps')}" min="1" max="100">
        </div>
      </div>

      <label class="felt-navn" for="s-innsats">Utgangspunkt innsats</label>
      <select class="inndata" id="s-innsats">
        ${effortPillOptions().map((o) => {
          const labels = { 0: 'Fail', 1: '1–2', 3: 'Moderat', 5: 'Lett' };
          const label = labels[o.value] ?? o.label;
          return `<option value="${o.value}" ${Number(s('defaultEffort')) === o.value ? 'selected' : ''}>${label}</option>`;
        }).join('')}
      </select>

      <label class="felt-navn" for="s-start">Startside</label>
      <select class="inndata" id="s-start">
        <option value="hjem" ${s('startPage') === 'hjem' ? 'selected' : ''}>Hjem</option>
        <option value="styrke" ${s('startPage') === 'styrke' || s('startPage') === 'okt' ? 'selected' : ''}>Styrketrening</option>
      </select>

      <label class="felt-navn" for="s-streak">Streak-modus</label>
      <select class="inndata" id="s-streak">
        <option value="rolling7" ${s('streakMode') === 'rolling7' ? 'selected' : ''}>Rullerende 7 dager (minst 1 dag per periode)</option>
        <option value="calendar" ${s('streakMode') === 'calendar' ? 'selected' : ''}>Kalenderuke (mandag–søndag)</option>
      </select>
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
  container.querySelector('#relay-url').addEventListener('change', (e) => relay.setRelayUrl(e.target.value));
  container.querySelector('#relay-key').addEventListener('change', (e) => relay.setRelayPublishKey(e.target.value));
  container.querySelector('#test-relay').addEventListener('click', async (e) => {
    relay.setRelayUrl(container.querySelector('#relay-url').value);
    relay.setRelayPublishKey(container.querySelector('#relay-key').value);
    e.target.disabled = true;
    try {
      await relay.relayPing();
      toast('Relay fungerer!', 'suksess');
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
  bind('#s-vekt', 'defaultWeightKg');
  bind('#s-reps', 'defaultReps');
  bind('#s-innsats', 'defaultEffort');
  bind('#s-start', 'startPage');
  bind('#s-streak', 'streakMode');

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

  await renderRelayPartnerSection(container.querySelector('#relay-partner-wrap'));
}

async function renderRelayPartnerSection(wrap) {
  if (!wrap) return;
  if (!relay.isRelayConfigured()) {
    wrap.innerHTML = '';
    return;
  }

  const identity = relay.getRelayIdentity();
  if (!identity.username) {
    wrap.innerHTML = `
      <hr class="program-del-skille">
      <h3 class="program-del-under-tittel">Partner-deling</h3>
      <p class="dus liten">Registrer et brukernavn for å sende og motta programmer med partnere.</p>
      <label class="felt-navn" for="relay-reg-user">Brukernavn</label>
      <input type="text" class="inndata" id="relay-reg-user" autocapitalize="none" autocomplete="username"
        placeholder="f.eks. ola" pattern="[a-z0-9_]{3,20}">
      <button type="button" class="knapp sekundaer" id="relay-registrer">Registrer brukernavn</button>`;
    wrap.querySelector('#relay-registrer').addEventListener('click', async () => {
      const username = wrap.querySelector('#relay-reg-user').value.trim();
      if (!username) {
        toast('Skriv inn brukernavn', 'feil');
        return;
      }
      try {
        const data = await relay.relayRegister(username);
        relay.setRelayIdentity(data);
        toast(`Registrert som @${data.username}`, 'suksess');
        await renderRelayPartnerSection(wrap);
      } catch (err) {
        toast(err.message || 'Registrering feilet', 'feil');
      }
    });
    return;
  }

  let partners = [];
  let incoming = [];
  try {
    const [partnerData, inviteData] = await Promise.all([
      relay.relayListPartners(),
      relay.relayListPendingInvites(),
    ]);
    partners = partnerData.partners || [];
    incoming = inviteData.incoming || [];
  } catch (err) {
    wrap.innerHTML = `
      <hr class="program-del-skille">
      <p class="program-import-feil liten">@${esc(identity.username)} — ${esc(err.message)}</p>
      <button type="button" class="knapp sekundaer liten" id="relay-logg-ut">Logg ut brukernavn</button>`;
    wrap.querySelector('#relay-logg-ut').addEventListener('click', () => {
      relay.clearRelayIdentity();
      renderRelayPartnerSection(wrap);
    });
    return;
  }

  const partnerRows = (partners || []).map((p) => `<li>@${esc(p)}</li>`).join('')
    || '<li class="dus">Ingen partnere ennå</li>';
  const inviteRows = (incoming || []).map((inv) => `
    <div class="relay-invite-rad">
      <span>@${esc(inv.from)}</span>
      <div class="knapp-rad">
        <button type="button" class="knapp sekundaer liten" data-godta="${esc(inv.from)}">Godta</button>
        <button type="button" class="knapp sekundaer liten" data-avvis="${esc(inv.from)}">Avvis</button>
      </div>
    </div>`).join('');

  wrap.innerHTML = `
    <hr class="program-del-skille">
    <h3 class="program-del-under-tittel">Partner-deling</h3>
    <p class="dus liten">Innlogget som <strong>@${esc(identity.username)}</strong>
      · <a href="#/innboks">Programinnboks</a></p>
    <button type="button" class="knapp sekundaer liten" id="relay-logg-ut">Logg ut brukernavn</button>

    ${inviteRows ? `
    <p class="felt-navn liten">Ventende invitasjoner</p>
    <div class="relay-invite-liste">${inviteRows}</div>` : ''}

    <p class="felt-navn liten">Partnere</p>
    <ul class="relay-partner-liste">${partnerRows}</ul>

    <label class="felt-navn" for="relay-invite-user">Inviter partner</label>
    <div class="program-relay-rad">
      <input type="text" class="inndata" id="relay-invite-user" autocapitalize="none" placeholder="@kari">
      <button type="button" class="knapp sekundaer" id="relay-invite">Inviter</button>
    </div>
    <p class="dus liten">Partneren må også ha registrert brukernavn på samme relay.</p>`;

  wrap.querySelector('#relay-logg-ut').addEventListener('click', () => {
    if (!confirm('Logge ut relay-brukernavn på denne enheten?')) return;
    relay.clearRelayIdentity();
    renderRelayPartnerSection(wrap);
  });

  wrap.querySelector('#relay-invite').addEventListener('click', async () => {
    const to = wrap.querySelector('#relay-invite-user').value.trim();
    if (!to) {
      toast('Skriv inn brukernavn', 'feil');
      return;
    }
    try {
      await relay.relayInvitePartner(to);
      toast(`Invitasjon sendt til @${to.replace(/^@/, '')}`, 'suksess');
      wrap.querySelector('#relay-invite-user').value = '';
    } catch (err) {
      toast(err.message || 'Invitasjon feilet', 'feil');
    }
  });

  wrap.querySelectorAll('[data-godta]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await relay.relayAcceptPartner(btn.dataset.godta);
        toast(`@${btn.dataset.godta} er nå partner`, 'suksess');
        await renderRelayPartnerSection(wrap);
      } catch (err) {
        toast(err.message || 'Kunne ikke godta', 'feil');
      }
    });
  });

  wrap.querySelectorAll('[data-avvis]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await relay.relayRejectPartner(btn.dataset.avvis);
        toast('Invitasjon avvist', 'info');
        await renderRelayPartnerSection(wrap);
      } catch (err) {
        toast(err.message || 'Kunne ikke avvise', 'feil');
      }
    });
  });
}
