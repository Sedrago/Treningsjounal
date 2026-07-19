/**
 * views/program-import.js – deep link import (#/program?k=KODE).
 */

import * as relay from '../relay-api.js';
import * as programShare from '../program-share.js';
import * as store from '../store.js';
import { esc, toast } from '../utils.js';

function formatDate(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function exercisePreviewLines(exercises) {
  return (exercises || []).map((ref) => {
    const parts = [ref.name || ref.catalogId || 'Ukjent'];
    if (ref.suggestedSets && ref.suggestedReps) parts.push(`${ref.suggestedSets}×${ref.suggestedReps}`);
    else if (ref.suggestedSets) parts.push(`${ref.suggestedSets} sett`);
    if (ref.suggestedWeightKg) parts.push(`${ref.suggestedWeightKg} kg`);
    return `<li>${esc(parts.join(' · '))}</li>`;
  }).join('');
}

export async function render(container, _params, query) {
  const code = String(query.k || query.code || '').trim().toUpperCase();

  if (!code) {
    container.innerHTML = `
      <header class="side-topp">
        <a href="#/programmer" class="tilbake" aria-label="Tilbake">‹</a>
        <h1>Importer program</h1>
      </header>
      <section class="kort">
        <p class="tomt">Mangler programkode. Skann QR-koden eller åpne lenken du fikk.</p>
        <a href="#/programmer" class="knapp sekundaer bred">Gå til programmer</a>
      </section>`;
    return;
  }

  if (!relay.isRelayConfigured()) {
    container.innerHTML = `
      <header class="side-topp">
        <a href="#/hjem" class="tilbake" aria-label="Tilbake">‹</a>
        <h1>Importer program</h1>
      </header>
      <section class="kort">
        <p class="tomt">Relay er ikke konfigurert. Sett Relay-URL under Innstillinger, eller lim inn delingskode under Programmer → Importer.</p>
        <a href="#/innstillinger" class="knapp sekundaer bred">Innstillinger</a>
      </section>`;
    return;
  }

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/programmer" class="tilbake" aria-label="Tilbake">‹</a>
      <h1>Importer program</h1>
    </header>
    <section class="kort program-relay-import" aria-live="polite">
      <p class="tomt">Henter program …</p>
    </section>`;

  const card = container.querySelector('.program-relay-import');
  let meta;
  try {
    meta = await relay.relayMeta(code);
  } catch (err) {
    card.innerHTML = `
      <h2 class="kort-tittel">Kunne ikke hente program</h2>
      <p class="program-import-feil">${esc(err.message || 'Ukjent feil')}</p>
      <p class="dus liten">Kode: ${esc(code)}</p>
      <a href="#/programmer" class="knapp sekundaer bred">Tilbake</a>`;
    return;
  }

  let fetched = null;
  let pinRequired = meta.requiresPin;

  function renderForm() {
    card.innerHTML = `
      <h2 class="kort-tittel">${esc(meta.title)}</h2>
      <p class="dus liten program-relay-meta">
        ${meta.exerciseCount} øvelse${meta.exerciseCount === 1 ? '' : 'r'}
        · publisert ${formatDate(meta.publishedAt)}
        · gyldig til ${formatDate(meta.expiresAt)}
        · kode ${esc(meta.code)}
      </p>

      ${pinRequired && !fetched ? `
        <label class="felt-navn" for="relay-pin">PIN</label>
        <input type="text" class="inndata" id="relay-pin" inputmode="numeric" autocomplete="one-time-code" placeholder="PIN fra trener">
      ` : ''}

      <label class="bryter-rad">
        <input type="checkbox" id="relay-import-auto" checked>
        <span>Legg til manglende øvelser automatisk</span>
      </label>

      <div id="relay-import-preview" class="program-import-preview ${fetched ? '' : 'skjult'}">
        ${fetched ? `
          <p class="felt-navn liten">${esc(fetched.program.name || meta.title)} · ${fetched.program.exercises?.length || 0} øvelser</p>
          <ul class="program-import-liste">${exercisePreviewLines(fetched.program.exercises)}</ul>
        ` : ''}
      </div>

      <div class="knapp-rad program-relay-knapper">
        ${pinRequired && !fetched
    ? '<button type="button" class="knapp primaer bred" id="relay-vis-program">Vis program</button>'
    : '<button type="button" class="knapp primaer bred" id="relay-importer">Importer til lagrede programmer</button>'}
        <a href="#/programmer" class="knapp sekundaer bred">Avbryt</a>
      </div>`;

    card.querySelector('#relay-vis-program')?.addEventListener('click', async () => {
      const pin = card.querySelector('#relay-pin')?.value;
      try {
        fetched = await relay.relayFetch(code, pin);
        pinRequired = false;
        renderForm();
      } catch (err) {
        toast(err.message || 'Kunne ikke hente program', 'feil');
      }
    });

    card.querySelector('#relay-importer')?.addEventListener('click', async () => {
      if (!fetched) {
        try {
          const pin = card.querySelector('#relay-pin')?.value;
          fetched = await relay.relayFetch(code, pin);
        } catch (err) {
          toast(err.message || 'Kunne ikke hente program', 'feil');
          return;
        }
      }
      const autoAdd = card.querySelector('#relay-import-auto').checked;
      try {
        const { name, items, warnings } = await programShare.importProgramData(fetched.program, {
          autoAddMissing: autoAdd,
        });
        await store.saveAsTemplate(name, items);
        const warn = warnings.length ? ` (${warnings.length} hoppet over)` : '';
        toast(`«${name}» importert${warn}`, warnings.length ? 'info' : 'suksess');
        location.hash = '#/programmer';
      } catch (err) {
        toast(err.message || 'Import feilet', 'feil');
      }
    });
  }

  if (!pinRequired) {
    try {
      fetched = await relay.relayFetch(code);
    } catch (err) {
      card.innerHTML = `
        <h2 class="kort-tittel">${esc(meta.title)}</h2>
        <p class="program-import-feil">${esc(err.message || 'Kunne ikke hente program')}</p>
        <a href="#/programmer" class="knapp sekundaer bred">Tilbake</a>`;
      return;
    }
  }

  renderForm();
}
