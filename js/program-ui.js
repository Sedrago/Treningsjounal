/**
 * program-ui.js – delte program-ark (kopi, eksport, import, lagring, kalender).
 */

import * as store from './store.js';
import * as programShare from './program-share.js';
import * as relay from './relay-api.js';
import { groupBy } from './stats.js';
import {
  esc, formatDateShort, relativeDays, todayStr, addDaysStr, toast,
  datesForWeek, weekdayShort,
} from './utils.js';

export function defaultProgramName(items, date) {
  const d = date ? formatDateShort(date) : formatDateShort(todayStr());
  const n = items?.length || 0;
  return `${d} · ${n} øvelse${n === 1 ? '' : 'r'}`;
}

function weekLabel(weekDates) {
  const a = formatDateShort(weekDates[0]);
  const b = formatDateShort(weekDates[6]);
  return a === b ? a : `${a} – ${b}`;
}

export function openCopySheet(host, enriched, exMap, onCopy) {
  const byDate = groupBy(enriched, (s) => s.date);
  const days = [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 30);

  const rows = days.map(([date, sets]) => {
    const byEx = groupBy(sets, (s) => s.exerciseId);
    const names = [...byEx.values()].map((exSets) => exSets[0].exerciseName);
    return `
      <button type="button" class="velger-rad plan-kopi-rad" data-dato="${date}">
        <span class="velger-navn">${formatDateShort(date)} <span class="dus">(${relativeDays(date)})</span></span>
        <span class="velger-info dus plan-kopi-ovelser">${esc(names.join(' · '))}</span>
      </button>`;
  }).join('');

  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Hent fra tidligere økt">
      <div class="ark-hode">
        <h2>Hent fra tidligere økt</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <p class="dus liten">Legger til øvelser som ikke allerede finnes i programmet.</p>
      ${rows || '<p class="tomt">Ingen tidligere økter ennå.</p>'}
    </div>`;

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));
  host.querySelectorAll('.plan-kopi-rad').forEach((btn) => {
    btn.addEventListener('click', () => {
      const date = btn.dataset.dato;
      const sets = enriched.filter((s) => s.date === date);
      const byEx = groupBy(sets, (s) => s.exerciseId);
      const dayItems = [...byEx.keys()]
        .filter((exerciseId) => exMap.has(exerciseId))
        .map((exerciseId) => ({ exerciseId }));
      host.innerHTML = '';
      onCopy(dayItems);
    });
  });
}

export async function openExportProgramSheet(host, template, exMap) {
  const payload = programShare.buildProgramPayload(template.name, template.items, exMap);
  const code = programShare.programShareCode(payload);
  const canPublish = relay.canPublishToRelay();

  let partners = [];
  if (relay.canUseRelayInbox()) {
    try {
      const data = await relay.relayListPartners();
      partners = data.partners || [];
    } catch { /* partner-liste valgfri */ }
  }

  const partnerOptions = partners.map((p) =>
    `<option value="${esc(p)}">@${esc(p)}</option>`).join('');

  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Eksporter program">
      <div class="ark-hode">
        <h2>Eksporter program</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <p class="dus liten">«${esc(template.name || 'Program')}» — kun øvelser og foreslåtte mål, ingen treningslogger.</p>
      <div class="program-del-knapper">
        <button type="button" class="knapp primaer bred" id="prog-last-ned">Last ned JSON-fil</button>
        <button type="button" class="knapp sekundaer bred" id="prog-kopier-kode">Kopier delingskode</button>
        ${typeof navigator.share === 'function' ? '<button type="button" class="knapp sekundaer bred" id="prog-del">Del …</button>' : ''}
      </div>
      <label class="felt-navn" for="prog-kode">Delingskode</label>
      <textarea class="inndata program-kode-felt" id="prog-kode" rows="4" readonly>${esc(code)}</textarea>
      <p class="dus liten">Partner kan lime koden inn under «Importer program», eller åpne JSON-filen.</p>

      ${partners.length ? `
      <hr class="program-del-skille">
      <h3 class="program-del-under-tittel">Send til partner</h3>
      <label class="felt-navn" for="prog-partner">Partner</label>
      <select class="inndata" id="prog-partner">${partnerOptions}</select>
      <button type="button" class="knapp primaer bred" id="prog-send-partner">Send program</button>
      ` : relay.hasRelayIdentity() ? `
      <p class="dus liten program-relay-hint">Inviter partnere under Innstillinger for å sende program direkte.</p>
      ` : relay.isRelayConfigured() ? `
      <p class="dus liten program-relay-hint">Registrer brukernavn under Innstillinger for partner-deling.</p>
      ` : ''}

      ${canPublish ? `
      <hr class="program-del-skille">
      <h3 class="program-del-under-tittel">Publiser til gruppe</h3>
      <p class="dus liten">Lag en QR-kode som flere kan skanne (f.eks. plakat på veggen).</p>
      <label class="felt-navn" for="prog-publiser-dager">Gyldig i (dager)</label>
      <input type="number" class="inndata" id="prog-publiser-dager" value="30" min="1" max="365" inputmode="numeric">
      <label class="felt-navn" for="prog-publiser-pin">PIN (valgfri)</label>
      <input type="text" class="inndata" id="prog-publiser-pin" inputmode="numeric" autocomplete="off" placeholder="F.eks. 4829">
      <label class="felt-navn" for="prog-publiser-kode">Egen kode (valgfri)</label>
      <input type="text" class="inndata" id="prog-publiser-kode" autocapitalize="characters" autocomplete="off" placeholder="Auto-genereres">
      <button type="button" class="knapp primaer bred" id="prog-publiser">Publiser og vis QR</button>
      ` : relay.isRelayConfigured() ? `
      <p class="dus liten program-relay-hint">Legg inn publiseringsnøkkel under Innstillinger for å publisere til gruppe.</p>
      ` : `
      <p class="dus liten program-relay-hint">Sett Relay-URL under Innstillinger for QR-import fra gruppe.</p>
      `}
    </div>`;

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));
  host.querySelector('#prog-last-ned').addEventListener('click', () => {
    programShare.exportProgramFile(payload);
    toast('Programfil lastet ned', 'suksess');
  });
  host.querySelector('#prog-kopier-kode').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast('Delingskode kopiert', 'suksess');
    } catch {
      host.querySelector('#prog-kode').select();
      toast('Kunne ikke kopiere — merk teksten manuelt', 'feil');
    }
  });
  host.querySelector('#prog-del')?.addEventListener('click', async () => {
    try {
      const file = new File([JSON.stringify(payload, null, 2)], programShare.defaultExportFilename(template.name), { type: 'application/json' });
      await navigator.share({
        title: template.name || 'Treningsprogram',
        text: `Treningsprogram: ${template.name || 'Program'}`,
        files: [file],
      });
    } catch {
      try {
        await navigator.share({
          title: template.name || 'Treningsprogram',
          text: code,
        });
      } catch {
        toast('Deling avbrutt', 'info');
      }
    }
  });
  host.querySelector('#prog-publiser')?.addEventListener('click', async () => {
    const btn = host.querySelector('#prog-publiser');
    btn.disabled = true;
    try {
      const result = await relay.relayPublish({
        program: payload,
        title: template.name,
        code: host.querySelector('#prog-publiser-kode')?.value,
        expiresInDays: Number(host.querySelector('#prog-publiser-dager')?.value) || 30,
        pin: host.querySelector('#prog-publiser-pin')?.value,
      });
      openPublishedProgramSheet(host, result, template.name);
    } catch (err) {
      toast(err.message || 'Publisering feilet', 'feil');
      btn.disabled = false;
    }
  });
  host.querySelector('#prog-send-partner')?.addEventListener('click', async () => {
    const btn = host.querySelector('#prog-send-partner');
    const toUsername = host.querySelector('#prog-partner')?.value;
    if (!toUsername) return;
    btn.disabled = true;
    try {
      await relay.relaySendProgram({
        toUsername,
        program: payload,
        title: template.name,
      });
      toast(`Program sendt til @${toUsername}`, 'suksess');
      host.innerHTML = '';
    } catch (err) {
      toast(err.message || 'Sending feilet', 'feil');
      btn.disabled = false;
    }
  });
}

export function openPublishedProgramSheet(host, result, fallbackTitle) {
  const importUrl = relay.programImportUrl(result.code);
  const qrUrl = relay.qrImageUrl(importUrl);
  const title = result.title || fallbackTitle || 'Program';

  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Publisert program">
      <div class="ark-hode">
        <h2>Publisert</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <p class="dus liten">«${esc(title)}» er tilgjengelig for import til ${formatDateShort(result.expiresAt?.slice(0, 10))}.</p>
      <div class="program-qr-wrap">
        <img class="program-qr-img" src="${esc(qrUrl)}" width="280" height="280" alt="QR-kode for programimport">
      </div>
      <p class="felt-navn liten program-relay-kode">Kode: <strong>${esc(result.code)}</strong></p>
      <label class="felt-navn" for="prog-import-lenke">Importlenke</label>
      <input type="text" class="inndata" id="prog-import-lenke" readonly value="${esc(importUrl)}">
      <div class="program-del-knapper">
        <button type="button" class="knapp sekundaer bred" id="prog-kopier-lenke">Kopier lenke</button>
        <button type="button" class="knapp sekundaer bred" id="prog-skriv-ut">Skriv ut plakat</button>
      </div>
    </div>`;

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));
  host.querySelector('#prog-kopier-lenke').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(importUrl);
      toast('Lenke kopiert', 'suksess');
    } catch {
      host.querySelector('#prog-import-lenke').select();
    }
  });
  host.querySelector('#prog-skriv-ut').addEventListener('click', () => {
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) {
      toast('Kunne ikke åpne utskrift — tillat popups', 'feil');
      return;
    }
    w.document.write(`<!DOCTYPE html><html lang="nb"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>
        body { font-family: system-ui, sans-serif; text-align: center; padding: 24px; }
        h1 { font-size: 1.5rem; margin-bottom: 8px; }
        p { color: #444; }
        img { margin: 16px auto; display: block; }
        .kode { font-size: 1.25rem; letter-spacing: 0.15em; margin-top: 12px; }
      </style></head><body>
      <h1>${esc(title)}</h1>
      <p>Skann for å importere programmet i Treningsjournal</p>
      <img src="${esc(qrUrl)}" width="320" height="320" alt="">
      <p class="kode">${esc(result.code)}</p>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  });
}

export function openImportProgramSheet(host, exMap, onDone) {
  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Importer program">
      <div class="ark-hode">
        <h2>Importer program</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <p class="dus liten">Lim inn delingskode, relay-kode (f.eks. K7M2XP), eller velg en JSON-fil. Kun programstruktur importeres — ikke logger.</p>
      <form id="prog-import-skjema">
        ${relay.isRelayConfigured() ? `
        <label class="felt-navn" for="prog-import-relay">Relay-kode</label>
        <div class="program-relay-rad">
          <input type="text" class="inndata" id="prog-import-relay" autocapitalize="characters" placeholder="F.eks. K7M2XP">
          <button type="button" class="knapp sekundaer" id="prog-import-relay-apne">Hent</button>
        </div>
        ` : ''}
        <label class="felt-navn" for="prog-import-tekst">Delingskode eller JSON</label>
        <textarea class="inndata" id="prog-import-tekst" rows="5" placeholder="Lim inn kode her …"></textarea>

        <label class="felt-navn" for="prog-import-fil">Eller velg fil</label>
        <input type="file" class="inndata" id="prog-import-fil" accept=".json,application/json">

        <div id="prog-import-nye"></div>

        <div id="prog-import-forhåndsvis" class="program-import-preview skjult"></div>

        <button type="submit" class="knapp primaer bred">Importer til lagrede programmer</button>
      </form>
    </div>`;

  const textEl = host.querySelector('#prog-import-tekst');
  const fileEl = host.querySelector('#prog-import-fil');
  const previewEl = host.querySelector('#prog-import-forhåndsvis');
  const missingEl = host.querySelector('#prog-import-nye');
  let pendingData = null;

  async function refreshPreview() {
    const fromFile = fileEl.files?.[0];
    let text = textEl.value.trim();
    if (fromFile) {
      text = await fromFile.text();
    }
    if (!text) {
      previewEl.classList.add('skjult');
      previewEl.innerHTML = '';
      missingEl.innerHTML = '';
      pendingData = null;
      return;
    }
    try {
      const data = programShare.parseProgramImport(text);
      pendingData = data;
      const { missing } = await programShare.analyzeImportProgram(data);
      missingEl.innerHTML = programShare.renderMissingExercisesPicker(missing, { inputName: 'prog-import-add' });
      const lines = (data.exercises || []).map((ref) => {
        const parts = [ref.name || ref.catalogId || 'Ukjent'];
        if (ref.suggestedSets && ref.suggestedReps) parts.push(`${ref.suggestedSets}×${ref.suggestedReps}`);
        else if (ref.suggestedSets) parts.push(`${ref.suggestedSets} sett`);
        if (ref.suggestedWeightKg) parts.push(`${ref.suggestedWeightKg} kg`);
        return `<li>${esc(parts.join(' · '))}</li>`;
      }).join('');
      previewEl.innerHTML = `
        <p class="felt-navn liten">${esc(data.name || 'Program')} · ${data.exercises?.length || 0} øvelse${data.exercises?.length === 1 ? '' : 'r'}</p>
        <ul class="program-import-liste">${lines}</ul>`;
      previewEl.classList.remove('skjult');
    } catch (err) {
      pendingData = null;
      missingEl.innerHTML = '';
      previewEl.innerHTML = `<p class="program-import-feil liten">${esc(err.message || 'Ugyldig program')}</p>`;
      previewEl.classList.remove('skjult');
    }
  }

  textEl.addEventListener('input', refreshPreview);
  fileEl.addEventListener('change', () => {
    if (fileEl.files?.[0]) textEl.value = '';
    refreshPreview();
  });

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));

  host.querySelector('#prog-import-relay-apne')?.addEventListener('click', () => {
    const k = host.querySelector('#prog-import-relay')?.value.trim();
    if (!k) {
      toast('Skriv inn relay-kode', 'feil');
      return;
    }
    location.hash = `#/program?k=${encodeURIComponent(k.toUpperCase())}`;
  });

  host.querySelector('#prog-import-skjema').addEventListener('submit', async (e) => {
    e.preventDefault();
    await refreshPreview();
    if (!pendingData) {
      toast('Lim inn gyldig programkode eller velg fil først', 'feil');
      return;
    }
    const addRefKeys = programShare.readAddRefKeysFromForm(host, 'prog-import-add');
    try {
      const { name, items, warnings } = await programShare.importProgramData(pendingData, { addRefKeys });
      await store.saveAsTemplate(name, items);
      host.innerHTML = '';
      const warn = warnings.length ? ` (${warnings.length} hoppet over)` : '';
      toast(`«${name}» importert${warn}`, warnings.length ? 'info' : 'suksess');
      onDone?.();
    } catch (err) {
      toast(err.message || 'Import feilet', 'feil');
    }
  });
}

export function openSaveTemplateSheet(host, items, exMap, setsByEx, defaultDate, onSave, opts = {}) {
  const {
    title = 'Lagre som program',
    intro = `${items.length} øvelse${items.length === 1 ? '' : 'r'} lagres i biblioteket ditt som gjenbrukbar mal.`,
    defaultName = '',
    goalsChecked = false,
  } = opts;
  const today = todayStr();
  const malRows = items.map((it) => {
    const ex = exMap.get(it.exerciseId);
    const name = ex?.name || 'Ukjent øvelse';
    const logMode = ex ? store.logModeOf(ex) : 'weight';
    const showWeight = logMode === 'weight';
    const val = (key) => it[key] ?? '';
    return `
      <div class="plan-mal-lagre-rad" data-mal-ex="${it.exerciseId}">
        <span class="plan-mal-lagre-navn">${esc(name)}</span>
        <div class="plan-mal-rad plan-mal-rad--kompakt">
          <label class="plan-mal-celle">
            <span class="dus">Sett</span>
            <input type="number" class="inndata mal-mal-inp" data-felt="suggestedSets"
              value="${val('suggestedSets')}" min="1" max="20" placeholder="–" inputmode="numeric">
          </label>
          <label class="plan-mal-celle">
            <span class="dus">Reps</span>
            <input type="number" class="inndata mal-mal-inp" data-felt="suggestedReps"
              value="${val('suggestedReps')}" min="1" max="99" placeholder="–" inputmode="numeric">
          </label>
          ${showWeight ? `
          <label class="plan-mal-celle">
            <span class="dus">kg</span>
            <input type="number" class="inndata mal-mal-inp" data-felt="suggestedWeightKg"
              value="${val('suggestedWeightKg')}" min="0" step="0.5" placeholder="–" inputmode="decimal">
          </label>` : ''}
        </div>
      </div>`;
  }).join('');

  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="${esc(title)}">
      <div class="ark-hode">
        <h2>${esc(title)}</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <p class="dus liten">${intro}</p>
      <form id="lagre-mal-skjema">
        <label class="felt-navn" for="mal-navn">Navn <span class="dus">(valgfritt)</span></label>
        <input type="text" class="inndata" id="mal-navn" placeholder="Auto-navn ved tomt felt" value="${esc(defaultName)}" autofocus>

        <label class="bryter-rad">
          <input type="checkbox" id="mal-med-mal" ${goalsChecked ? 'checked' : ''}>
          <span>Inkluder mål per øvelse</span>
        </label>

        <div id="mal-mal-wrap" class="${goalsChecked ? '' : 'skjult'}">
          <div class="plan-mal-liste">${malRows}</div>
          <button type="button" class="knapp sekundaer liten" id="mal-fra-logging">Fyll inn fra dagens logging</button>
        </div>

        <label class="bryter-rad">
          <input type="checkbox" id="mal-planlegg">
          <span>Legg også på kalender</span>
        </label>

        <div id="mal-dato-wrap" class="skjult">
          <label class="felt-navn" for="mal-dato">Dato</label>
          <input type="date" class="inndata" id="mal-dato" value="${defaultDate}" min="${today}">
        </div>

        <button type="submit" class="knapp primaer bred">Lagre program</button>
      </form>
    </div>`;

  const malCb = host.querySelector('#mal-med-mal');
  const malWrap = host.querySelector('#mal-mal-wrap');
  malCb.addEventListener('change', () => {
    malWrap.classList.toggle('skjult', !malCb.checked);
  });

  host.querySelector('#mal-fra-logging')?.addEventListener('click', () => {
    for (const it of items) {
      const row = host.querySelector(`[data-mal-ex="${it.exerciseId}"]`);
      if (!row) continue;
      const sug = store.suggestionsFromLoggedSets(setsByEx.get(it.exerciseId) || []);
      row.querySelectorAll('.mal-mal-inp').forEach((inp) => {
        const v = sug[inp.dataset.felt];
        inp.value = v != null ? v : '';
      });
    }
    toast('Mål hentet fra dagens logging', 'suksess');
  });

  const planleggCb = host.querySelector('#mal-planlegg');
  const datoWrap = host.querySelector('#mal-dato-wrap');
  planleggCb.addEventListener('change', () => {
    datoWrap.classList.toggle('skjult', !planleggCb.checked);
  });

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));
  host.querySelector('#lagre-mal-skjema').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = host.querySelector('#mal-navn').value.trim();
    const scheduleDate = planleggCb.checked ? host.querySelector('#mal-dato').value : null;
    let saveItems;
    if (malCb.checked) {
      saveItems = items.map((it) => {
        const row = host.querySelector(`[data-mal-ex="${it.exerciseId}"]`);
        const raw = { exerciseId: it.exerciseId };
        row?.querySelectorAll('.mal-mal-inp').forEach((inp) => {
          const v = inp.value.trim();
          if (v) raw[inp.dataset.felt] = v;
        });
        return store.sanitizePlanItem(raw);
      });
    } else {
      saveItems = items.map((it) => store.sanitizePlanItem({ exerciseId: it.exerciseId }));
    }
    host.innerHTML = '';
    onSave({ name, scheduleDate, saveItems });
  });
}

export function openScheduleCalendarSheet(host, items, defaultDate, onSchedule) {
  const today = todayStr();
  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Legg på kalender">
      <div class="ark-hode">
        <h2>Legg på kalender</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <p class="dus liten">${items.length} øvelse${items.length === 1 ? '' : 'r'} planlegges på valgt dag. Navn settes automatisk.</p>
      <form id="legg-kalender-skjema">
        <label class="felt-navn" for="legg-kalender-dato">Dato</label>
        <input type="date" class="inndata" id="legg-kalender-dato" value="${defaultDate}" min="${today}" required>
        <button type="submit" class="knapp primaer bred">Legg på kalender</button>
        <a href="#/kalender" class="knapp sekundaer bred">Åpne ukekalender</a>
      </form>
    </div>`;

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));
  host.querySelector('#legg-kalender-skjema').addEventListener('submit', (e) => {
    e.preventDefault();
    const date = host.querySelector('#legg-kalender-dato').value;
    if (!date) return;
    host.innerHTML = '';
    onSchedule(date);
  });
}

export async function openPickCalendarPlanSheet(host, exMap, viewDate, onPick) {
  const from = addDaysStr(viewDate, -90);
  const to = addDaysStr(viewDate, 90);
  const plans = await store.getScheduledPlans({ from, to });

  const rows = plans.map((p) => {
    const names = p.items
      .map((it) => exMap.get(it.exerciseId)?.name)
      .filter(Boolean)
      .slice(0, 3);
    const extra = p.items.length > 3 ? ` +${p.items.length - 3}` : '';
    const label = p.name || defaultProgramName(p.items, p.date);
    return `
      <button type="button" class="velger-rad plan-kopi-rad" data-plan-id="${p.id}">
        <span class="velger-navn">${formatDateShort(p.date)} <span class="dus">(${relativeDays(p.date)})</span></span>
        <span class="velger-info dus">${esc(label)} · ${esc(names.join(', '))}${extra}</span>
      </button>`;
  }).join('');

  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Hent fra kalender">
      <div class="ark-hode">
        <h2>Hent fra kalender</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <p class="dus liten">Velg en planlagt dag. Programmet lastes inn på ${formatDateShort(viewDate)}.</p>
      ${rows || '<p class="tomt">Ingen planlagte programmer i perioden. Planlegg under «Legg på kalender» eller i ukekalenderen.</p>'}
      <a href="#/kalender" class="knapp sekundaer bred">Åpne ukekalender</a>
    </div>`;

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));
  host.querySelectorAll('[data-plan-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const plan = plans.find((p) => p.id === btn.dataset.planId);
      if (!plan) return;
      host.innerHTML = '';
      onPick(plan);
    });
  });
}

export function openCalendarWeekPicker(host, { templateId, templateName, anchorDate, onScheduled }) {
  let anchor = anchorDate || todayStr();

  function renderWeek() {
    const weekDates = datesForWeek(anchor);
    const weekStart = weekDates[0];
    const today = todayStr();
    const title = templateName || 'Program';

    const dayButtons = weekDates.map((date) => {
      const shortDate = formatDateShort(date).replace(/ \d{4}$/, '');
      const todayMark = date === today ? ' <span class="dus">(i dag)</span>' : '';
      return `
        <button type="button" class="velger-rad program-uke-dag" data-dato="${date}">
          <span class="velger-navn">${weekdayShort(date)} · ${shortDate}${todayMark}</span>
          <span class="velger-info dus">${relativeDays(date)}</span>
        </button>`;
    }).join('');

    host.innerHTML = `
      <div class="ark-bakgrunn" data-lukk></div>
      <div class="ark" role="dialog" aria-label="Velg dag">
        <div class="ark-hode">
          <h2>Legg på kalender</h2>
          <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
        </div>
        <p class="dus liten">«${esc(title)}» — velg dag i uken.</p>
        <div class="kalender-uke-nav">
          <button type="button" class="ikon-knapp kalender-pil" data-uke="-7" aria-label="Forrige uke">‹</button>
          <span class="kalender-uke-label">${weekLabel(weekDates)}</span>
          <button type="button" class="ikon-knapp kalender-pil" data-uke="7" aria-label="Neste uke">›</button>
        </div>
        ${dayButtons}
        <button type="button" class="knapp sekundaer bred kalender-i-dag-knapp" data-goto-today>Gå til denne uken</button>
      </div>`;

    host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));

    host.querySelectorAll('[data-uke]').forEach((btn) => {
      btn.addEventListener('click', () => {
        anchor = addDaysStr(weekStart, Number(btn.dataset.uke));
        renderWeek();
      });
    });

    host.querySelector('[data-goto-today]')?.addEventListener('click', () => {
      anchor = todayStr();
      renderWeek();
    });

    host.querySelectorAll('.program-uke-dag').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const date = btn.dataset.dato;
        try {
          await store.scheduleTemplate(templateId, date);
          toast('Program lagt på kalenderen', 'suksess');
          host.innerHTML = '';
          onScheduled?.(date);
        } catch (err) {
          toast(err.message || 'Kunne ikke legge på kalender', 'feil');
        }
      });
    });
  }

  renderWeek();
}
