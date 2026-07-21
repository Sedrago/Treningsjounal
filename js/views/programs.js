/**
 * views/programs.js – bibliotek for lagrede programmaler (#/programmer).
 */

import * as store from '../store.js';
import { initContent } from '../content.js';
import {
  defaultProgramName,
  openImportProgramSheet,
  openExportProgramSheet,
  openCalendarWeekPicker,
} from '../program-ui.js';
import { esc, formatDateShort, todayStr, toast } from '../utils.js';

function templatePreview(items, exMap) {
  const names = items
    .map((it) => store.getExerciseFromMap(exMap, it.exerciseId)?.name)
    .filter(Boolean)
    .slice(0, 4);
  const extra = items.length > 4 ? ` +${items.length - 4}` : '';
  return names.length ? `${names.join(' · ')}${extra}` : 'Ingen øvelser';
}

export async function render(container, params, query = {}) {
  await initContent();
  const [templates, exercises] = await Promise.all([
    store.getSavedTemplates(),
    store.getExercises({ includeInactive: true }),
  ]);
  const exMap = store.buildExerciseMap(exercises);

  function rerender() {
    return render(container, params, query);
  }

  const cards = templates.map((t) => `
    <article class="kort program-kort" data-id="${t.id}">
      <div class="program-kort-hode">
        <h2 class="program-kort-navn">${esc(t.name || 'Uten navn')}</h2>
        <p class="dus liten">${t.items.length} øvelse${t.items.length === 1 ? '' : 'r'}</p>
      </div>
      <p class="dus liten program-kort-preview">${esc(templatePreview(t.items, exMap))}</p>
      <div class="program-kort-handlinger">
        <a href="#/programmer/rediger/${t.id}" class="knapp sekundaer liten">Rediger</a>
        <button type="button" class="knapp sekundaer liten" data-handling="kalender">Kalender</button>
        <button type="button" class="knapp sekundaer liten" data-handling="start">Start i dag</button>
        <button type="button" class="ikon-knapp" data-handling="eksporter" aria-label="Eksporter">↗</button>
        <button type="button" class="ikon-knapp" data-handling="slett" aria-label="Slett">✕</button>
      </div>
    </article>`).join('');

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/styrketrening" class="tilbake" aria-label="Tilbake til styrketrening">‹</a>
      <h1>Programmer</h1>
    </header>

    <div class="knapp-rad program-topp-handlinger">
      <button type="button" class="knapp primaer" id="nytt-program">+ Nytt program</button>
      <button type="button" class="knapp sekundaer" id="importer-program">Importer</button>
    </div>

    <section class="program-liste" aria-label="Lagrede programmer">
      ${cards || '<p class="tomt">Ingen lagrede programmer ennå. Opprett et nytt program eller importer fra fil/kode.</p>'}
    </section>
    <div id="programmer-skjema-vert"></div>
  `;

  const sheetHost = container.querySelector('#programmer-skjema-vert');

  container.querySelector('#nytt-program')?.addEventListener('click', async () => {
    const today = todayStr();
    const tpl = await store.savePlan({
      name: defaultProgramName([], today),
      items: [],
      status: 'mal',
      date: today,
      sourceTemplateId: '',
    });
    location.hash = `#/programmer/rediger/${tpl.id}`;
  });

  container.querySelector('#importer-program')?.addEventListener('click', () => {
    openImportProgramSheet(sheetHost, exMap, () => rerender());
  });

  container.querySelectorAll('.program-kort').forEach((card) => {
    const id = card.dataset.id;
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;

    card.querySelector('[data-handling="kalender"]')?.addEventListener('click', () => {
      openCalendarWeekPicker(sheetHost, {
        templateId: tpl.id,
        templateName: tpl.name || 'Program',
        anchorDate: todayStr(),
        onScheduled: () => {
          toast(`«${tpl.name || 'Program'}» lagt på kalenderen`, 'suksess');
        },
      });
    });

    card.querySelector('[data-handling="start"]')?.addEventListener('click', async () => {
      await store.loadTemplateIntoDate(tpl.id, todayStr());
      toast(`«${tpl.name || 'Program'}» lagt på dagens økt`, 'suksess');
      location.hash = '#/styrke';
    });

    card.querySelector('[data-handling="eksporter"]')?.addEventListener('click', () => {
      openExportProgramSheet(sheetHost, tpl, exMap);
    });

    card.querySelector('[data-handling="slett"]')?.addEventListener('click', async () => {
      if (!confirm(`Slette «${tpl.name || 'programmet'}» fra biblioteket?`)) return;
      await store.deletePlan(tpl.id);
      toast('Program slettet', 'suksess');
      rerender();
    });
  });
}
