/**
 * views/inbox.js – programinnboks fra treningspartnere (#/innboks).
 */

import * as relay from '../relay-api.js';
import * as programShare from '../program-share.js';
import * as store from '../store.js';
import { esc, toast } from '../utils.js';

function formatDate(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
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

async function renderDetail(container, id) {
  container.innerHTML = `
    <header class="side-topp">
      <a href="#/innboks" class="tilbake" aria-label="Tilbake">‹</a>
      <h1>Program fra partner</h1>
    </header>
    <section class="kort program-relay-import" aria-live="polite">
      <p class="tomt">Henter program …</p>
    </section>`;

  const card = container.querySelector('.program-relay-import');
  let fetched;
  try {
    fetched = await relay.relayFetchInbox(id, { markRead: false });
  } catch (err) {
    card.innerHTML = `
      <p class="program-import-feil">${esc(err.message || 'Kunne ikke hente program')}</p>
      <a href="#/innboks" class="knapp sekundaer bred">Tilbake</a>`;
    return;
  }

  card.innerHTML = `
    <h2 class="kort-tittel">${esc(fetched.title)}</h2>
    <p class="dus liten program-relay-meta">
      Fra @${esc(fetched.from)} · ${fetched.program.exercises?.length || 0} øvelser
      · mottatt ${formatDate(fetched.sentAt)}
    </p>

    <label class="bryter-rad">
      <input type="checkbox" id="innboks-import-auto" checked>
      <span>Legg til manglende øvelser automatisk</span>
    </label>

    <div class="program-import-preview">
      <ul class="program-import-liste">${exercisePreviewLines(fetched.program.exercises)}</ul>
    </div>

    <div class="knapp-rad program-relay-knapper">
      <button type="button" class="knapp primaer bred" id="innboks-importer">Importer til lagrede programmer</button>
      <button type="button" class="knapp sekundaer bred" id="innboks-avvis">Avvis</button>
    </div>`;

  card.querySelector('#innboks-importer').addEventListener('click', async () => {
    const autoAdd = card.querySelector('#innboks-import-auto').checked;
    try {
      const { name, items, warnings } = await programShare.importProgramData(fetched.program, {
        autoAddMissing: autoAdd,
      });
      await store.saveAsTemplate(name, items);
      await relay.relayFetchInbox(id, { markRead: true });
      const warn = warnings.length ? ` (${warnings.length} hoppet over)` : '';
      toast(`«${name}» importert${warn}`, warnings.length ? 'info' : 'suksess');
      location.hash = '#/styrke';
    } catch (err) {
      toast(err.message || 'Import feilet', 'feil');
    }
  });

  card.querySelector('#innboks-avvis').addEventListener('click', async () => {
    try {
      await relay.relayDismissInbox(id);
      toast('Program avvist', 'info');
      location.hash = '#/innboks';
    } catch (err) {
      toast(err.message || 'Kunne ikke avvise', 'feil');
    }
  });
}

async function renderList(container) {
  if (!relay.isRelayConfigured()) {
    container.innerHTML = `
      <header class="side-topp">
        <a href="#/hjem" class="tilbake" aria-label="Tilbake">‹</a>
        <h1>Programinnboks</h1>
      </header>
      <section class="kort">
        <p class="tomt">Sett Relay-URL under Innstillinger.</p>
        <a href="#/innstillinger" class="knapp sekundaer bred">Innstillinger</a>
      </section>`;
    return;
  }

  if (!relay.hasRelayIdentity()) {
    container.innerHTML = `
      <header class="side-topp">
        <a href="#/hjem" class="tilbake" aria-label="Tilbake">‹</a>
        <h1>Programinnboks</h1>
      </header>
      <section class="kort">
        <p class="tomt">Registrer brukernavn under Innstillinger for å motta programmer fra partnere.</p>
        <a href="#/innstillinger" class="knapp sekundaer bred">Registrer brukernavn</a>
      </section>`;
    return;
  }

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/hjem" class="tilbake" aria-label="Tilbake">‹</a>
      <h1>Programinnboks</h1>
    </header>
    <section class="kort" aria-live="polite">
      <p class="tomt">Henter innboks …</p>
    </section>`;

  const card = container.querySelector('.kort');
  let items = [];
  try {
    const data = await relay.relayListInbox();
    items = data.items || [];
  } catch (err) {
    card.innerHTML = `<p class="program-import-feil">${esc(err.message || 'Kunne ikke hente innboks')}</p>`;
    return;
  }

  if (!items.length) {
    card.innerHTML = `
      <p class="tomt">Ingen nye programmer. Partnere kan sende deg maler under Styrke → Eksporter.</p>
      <a href="#/innstillinger" class="knapp sekundaer">Administrer partnere</a>`;
    return;
  }

  const rows = items.map((item) => `
    <a href="#/innboks/${esc(item.id)}" class="innboks-rad">
      <span class="innboks-rad-tittel">${esc(item.title)}</span>
      <span class="innboks-rad-meta dus liten">@${esc(item.from)} · ${item.exerciseCount} øvelser · ${formatDate(item.sentAt)}</span>
    </a>`).join('');

  card.innerHTML = `
    <p class="dus liten">${items.length} ny${items.length === 1 ? '' : 'e'} program${items.length === 1 ? '' : 'mer'}</p>
    <div class="innboks-liste">${rows}</div>`;
}

export async function render(container, params) {
  const id = params?.[0];
  if (id) {
    await renderDetail(container, id);
  } else {
    await renderList(container);
  }
}
