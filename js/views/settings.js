/**
 * views/settings.js – innstillinger, tilkobling/synk, eksport og import.
 */

import * as store from '../store.js';
import * as api from '../api.js';
import * as relay from '../relay-api.js';
import * as setupShare from '../setup-share.js';
import * as sync from '../sync.js';
import * as ie from '../importexport.js';
import { effortPillOptions } from '../pickers.js';
import { esc, toast, withActionFeedback, toastPending } from '../utils.js';
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

      <hr class="program-del-skille">
      <h3 class="program-del-under-tittel">Del oppsett med ny bruker</h3>
      <p class="dus liten">Personlig QR eller oppsettskode gir tilgang til <strong>dette</strong> regnearket. Send kun til den det gjelder — ikke på offentlig plakat.</p>
      <button type="button" class="knapp sekundaer bred" id="setup-generer-qr">Generer oppsetts-QR</button>

      <h3 class="program-del-under-tittel">Mottatt oppsett</h3>
      <p class="dus liten">Lim inn kode fra e-post, eller <a href="#/oppsett">åpne oppsettsiden</a>.</p>
      <label class="felt-navn" for="setup-import-kode">Oppsettskode</label>
      <textarea class="inndata program-kode-felt" id="setup-import-kode" rows="3" placeholder="Lim inn mottatt kode …"></textarea>
      <button type="button" class="knapp sekundaer bred" id="setup-import-btn">Importer oppsett</button>
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

      <hr class="program-del-skille">
      <h3 class="program-del-under-tittel">Kost og restitusjon</h3>
      <div class="skjema-rad">
        <div class="felt">
          <label class="felt-navn" for="s-protein-mal">Daglig proteinmål (g)</label>
          <input type="number" class="inndata" id="s-protein-mal" value="${esc(s('proteinDailyGoalG'))}" min="1" max="1000" step="1" inputmode="numeric">
        </div>
        <div class="felt">
          <label class="felt-navn" for="s-karbo-tak">Karbo-tak (g) <span class="dus">(tom = skjult)</span></label>
          <input type="text" class="inndata" id="s-karbo-tak" value="${esc(s('carbsDailyMaxG'))}" inputmode="numeric" autocomplete="off" placeholder="–">
        </div>
        <div class="felt">
          <label class="felt-navn" for="s-kalori-tak">Kaloritak (kcal) <span class="dus">(tom = skjult)</span></label>
          <input type="text" class="inndata" id="s-kalori-tak" value="${esc(s('caloriesDailyMaxKcal'))}" inputmode="numeric" autocomplete="off" placeholder="–">
        </div>
      </div>
      <label class="felt-navn" for="s-sovn-mal">Optimalt søvnmål (timer)</label>
      <input type="number" class="inndata" id="s-sovn-mal" value="${esc(s('sleepDailyGoalHours'))}" min="1" max="14" step="0.5" inputmode="decimal">
      <p class="dus liten">Momentum bruker målet som optimum — mer søvn gir ikke ekstra poeng.</p>
      <p class="dus liten"><a href="#/inntak?favoritter=1">Administrer inntaksfavoritter</a></p>
    </section>

    <section class="kort" aria-label="Kropp">
      <h2 class="kort-tittel">Kropp</h2>
      <nav class="hub-meny hub-meny--kompakt" aria-label="Kropp">
        <a href="#/kroppsvekt" class="hub-lenke">
          <span class="hub-lenke-ikon" aria-hidden="true">⚖️</span>
          <span class="hub-lenke-tekst">
            <strong>Kroppsvekt</strong>
            <span class="dus liten">Vekt og fettprosent</span>
          </span>
          <span class="hub-lenke-pil" aria-hidden="true">›</span>
        </a>
      </nav>
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
    <div id="innstillinger-ark-vert"></div>
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
  container.querySelector('#api-url').addEventListener('input', (e) => api.setApiUrl(e.target.value));
  container.querySelector('#api-key').addEventListener('input', (e) => api.setApiKey(e.target.value));

  const persistApiCredentials = () => {
    api.setApiUrl(container.querySelector('#api-url').value);
    api.setApiKey(container.querySelector('#api-key').value);
  };

  container.querySelector('#test-api').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    await withActionFeedback(btn, {
      busyLabel: 'Tester…',
      pendingToast: 'Tester tilkobling…',
      statusEl,
      statusBusy: 'Tester tilkobling til Google Sheets…',
      work: async () => {
        persistApiCredentials();
        await api.ping();
        toast('Tilkoblingen fungerer!', 'suksess');
        updateStatus();
      },
    }).catch((err) => {
      toast(`Feil: ${err.message}`, 'feil');
      updateStatus();
    });
  });
  container.querySelector('#relay-url').addEventListener('change', (e) => relay.setRelayUrl(e.target.value));
  container.querySelector('#relay-key').addEventListener('change', (e) => relay.setRelayPublishKey(e.target.value));
  container.querySelector('#test-relay').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    await withActionFeedback(btn, {
      busyLabel: 'Tester…',
      pendingToast: 'Tester relay…',
      work: async () => {
        relay.setRelayUrl(container.querySelector('#relay-url').value);
        relay.setRelayPublishKey(container.querySelector('#relay-key').value);
        await relay.relayPing();
        toast('Relay fungerer!', 'suksess');
      },
    }).catch((err) => {
      toast(`Feil: ${err.message}`, 'feil');
    });
  });

  container.querySelector('#synk-naa').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    await withActionFeedback(btn, {
      busyLabel: 'Synkroniserer…',
      pendingToast: 'Synkroniserer…',
      statusEl,
      statusBusy: 'Synkroniserer med Google Sheets…',
      work: async () => {
        persistApiCredentials();
        const ok = await sync.fullSync();
        toast(
          ok ? 'Synkronisert' : `Synkronisering feilet: ${sync.state.lastError}`,
          ok ? 'suksess' : 'feil',
        );
        updateStatus();
      },
    });
  });

  const arkHost = container.querySelector('#innstillinger-ark-vert');

  container.querySelector('#setup-generer-qr')?.addEventListener('click', () => {
    api.setApiUrl(container.querySelector('#api-url').value);
    api.setApiKey(container.querySelector('#api-key').value);
    relay.setRelayUrl(container.querySelector('#relay-url').value);
    try {
      openSetupShareSheet(arkHost, { includeRelay: relay.isRelayConfigured() });
    } catch (err) {
      toast(err.message || 'Kunne ikke lage oppsett', 'feil');
    }
  });

  container.querySelector('#setup-import-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const text = container.querySelector('#setup-import-kode').value.trim();
    if (!text) {
      toast('Lim inn oppsettskode først', 'feil');
      return;
    }
    await withActionFeedback(btn, {
      busyLabel: 'Importerer…',
      pendingToast: 'Importerer oppsett…',
      statusEl,
      statusBusy: 'Importerer oppsett og synkroniserer…',
      work: async () => {
        const data = setupShare.parseSetupShareCode(text);
        if (!confirm('Koble appen til det mottatte regnearket? Eksisterende tilkobling erstattes.')) {
          return;
        }
        await setupShare.applySetupPayload(data);
        container.querySelector('#api-url').value = api.getApiUrl();
        container.querySelector('#api-key').value = api.getApiKey();
        if (data.relayUrl) container.querySelector('#relay-url').value = relay.getRelayUrl();
        toast('Oppsett importert — synkroniserer…', 'info');
        const ok = await sync.fullSync();
        toast(ok ? 'Oppsett klart og synkronisert' : `Synk feilet: ${sync.state.lastError}`, ok ? 'suksess' : 'feil');
        updateStatus();
      },
    }).catch((err) => {
      toast(err.message || 'Import feilet', 'feil');
      updateStatus();
    });
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
  bind('#s-protein-mal', 'proteinDailyGoalG');
  bind('#s-sovn-mal', 'sleepDailyGoalHours');
  const saveCapSetting = async (key, el) => {
    const v = el.value.trim();
    await store.setSetting(key, v === '' ? '' : v);
  };
  const karboEl = container.querySelector('#s-karbo-tak');
  const kaloriEl = container.querySelector('#s-kalori-tak');
  for (const [el, key] of [[karboEl, 'carbsDailyMaxG'], [kaloriEl, 'caloriesDailyMaxKcal']]) {
    if (!el) continue;
    const save = () => saveCapSetting(key, el);
    el.addEventListener('change', save);
    el.addEventListener('input', save);
  }

  // Eksport.
  container.querySelector('#eksport-json').addEventListener('click', () => ie.exportJson());
  container.querySelector('#eksport-csv').addEventListener('click', () => ie.exportCsv());
  container.querySelector('#eksport-excel').addEventListener('click', () => ie.exportExcel());
  container.querySelector('#eksport-pdf').addEventListener('click', () => ie.exportPdf());

  // Import.
  container.querySelector('#import-fil').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const input = e.target;
    input.disabled = true;
    const dismiss = toastPending(`Importerer ${file.name}…`);
    try {
      const text = await file.text();
      const count = file.name.endsWith('.json')
        ? await ie.importJson(text)
        : await ie.importCsv(text);
      toast(`Importerte ${count} rader`, 'suksess');
    } catch (err) {
      toast(`Import feilet: ${err.message}`, 'feil');
    } finally {
      dismiss();
      input.disabled = false;
      input.value = '';
    }
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
    const regUserInput = wrap.querySelector('#relay-reg-user');
    const regBtn = wrap.querySelector('#relay-registrer');
    let registering = false;

    const doRegister = async () => {
      if (registering) return;
      const username = regUserInput.value.trim();
      if (!username) {
        toast('Skriv inn brukernavn', 'feil');
        return;
      }
      registering = true;
      regBtn.disabled = true;
      try {
        const data = await relay.relayRegister(username);
        await relay.setRelayIdentity(data);
        toast(`Registrert som @${data.username}`, 'suksess');
        await renderRelayPartnerSection(wrap);
      } catch (err) {
        toast(err.message || 'Registrering feilet', 'feil');
        registering = false;
        regBtn.disabled = false;
      }
    };

    regBtn.addEventListener('click', doRegister);
    regUserInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doRegister();
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
    wrap.querySelector('#relay-logg-ut').addEventListener('click', async () => {
      if (!confirm('Logge ut relay-brukernavn på denne enheten?')) return;
      await relay.clearRelayIdentity();
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
    <p class="dus liten">Brukernavnet synkroniseres via Settings-arket til andre enheter med samme regneark.</p>
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
    <p class="dus liten">Partneren må også ha registrert brukernavn på samme relay. Godkjente partnere kan sammenligne momentum på hjem (V-knappen) — kun kurven, ikke loggdetaljer.</p>`;

  wrap.querySelector('#relay-logg-ut').addEventListener('click', async () => {
    if (!confirm('Logge ut relay-brukernavn på denne enheten?')) return;
    await relay.clearRelayIdentity();
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

function openSetupShareSheet(host, opts = {}) {
  const payload = setupShare.buildSetupPayload(opts);
  const code = setupShare.setupShareCode(payload);
  const importUrl = setupShare.setupImportUrl(code);
  const qrUrl = setupShare.qrImageUrl(importUrl);
  const hasRelayUser = Boolean(payload.relayUsername);

  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Personlig oppsetts-QR">
      <div class="ark-hode">
        <h2>Personlig oppsetts-QR</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <p class="dus liten">Send QR, lenke eller kode til <strong>én</strong> ny bruker (e-post).
        ${hasRelayUser ? `Inkluderer relay-brukernavn <strong>@${esc(payload.relayUsername)}</strong>.` : 'Relay-brukernavn følger med hvis du er registrert under Partner-deling.'}</p>
      <div class="program-qr-wrap">
        <img class="program-qr-img" src="${esc(qrUrl)}" width="280" height="280" alt="QR-kode for oppsett">
      </div>
      <label class="felt-navn" for="setup-del-lenke">Oppsettslenke</label>
      <input type="text" class="inndata" id="setup-del-lenke" readonly value="${esc(importUrl)}">
      <label class="felt-navn" for="setup-del-kode">Oppsettskode (alternativ til QR)</label>
      <textarea class="inndata program-kode-felt" id="setup-del-kode" rows="3" readonly>${esc(code)}</textarea>
      <div class="program-del-knapper">
        <button type="button" class="knapp sekundaer bred" id="setup-kopier-lenke">Kopier lenke</button>
        <button type="button" class="knapp sekundaer bred" id="setup-kopier-kode">Kopier oppsettskode</button>
        <button type="button" class="knapp sekundaer bred" id="setup-skriv-ut">Skriv ut QR</button>
      </div>
    </div>`;

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));
  host.querySelector('#setup-kopier-lenke').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(importUrl);
      toast('Lenke kopiert', 'suksess');
    } catch {
      host.querySelector('#setup-del-lenke').select();
    }
  });
  host.querySelector('#setup-kopier-kode').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast('Oppsettskode kopiert', 'suksess');
    } catch {
      host.querySelector('#setup-del-kode').select();
    }
  });
  host.querySelector('#setup-skriv-ut').addEventListener('click', () => {
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) {
      toast('Kunne ikke åpne utskrift — tillat popups', 'feil');
      return;
    }
    w.document.write(`<!DOCTYPE html><html lang="nb"><head><meta charset="utf-8"><title>FlowBooster – oppsett</title>
      <style>
        body { font-family: system-ui, sans-serif; text-align: center; padding: 24px; }
        h1 { font-size: 1.35rem; margin-bottom: 8px; }
        p { color: #444; max-width: 360px; margin: 0 auto 16px; }
        img { margin: 0 auto 16px; display: block; }
      </style></head><body>
      <h1>Koble til FlowBooster</h1>
      <p>Skann QR-koden med mobilen for å koble appen til Google Sheets.</p>
      <img src="${esc(qrUrl)}" width="320" height="320" alt="">
      <p class="dus">Personlig invitasjon — ikke heng opp offentlig.</p>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  });
}
