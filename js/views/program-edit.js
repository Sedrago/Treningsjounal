/**
 * views/program-edit.js – rediger lagret programmal (#/programmer/rediger/:id).
 */

import * as store from '../store.js';
import { initContent, getDescription } from '../content.js';
import {
  defaultProgramName,
  openExportProgramSheet,
  openCalendarWeekPicker,
} from '../program-ui.js';
import { categoryStats, openCategoryPicker, openExercisePicker } from '../program-pickers.js';
import {
  esc, formatDateShort, todayStr, toast, categoryIconHtml,
} from '../utils.js';

function planMalFieldsHtml(item, ex) {
  if (!ex) return '';
  const logMode = store.logModeOf(ex);
  const showWeight = logMode === 'weight';
  const hint = store.planItemSuggestionText(item, ex);
  const val = (key) => item[key] ?? '';
  return `
    <div class="plan-mal-felt" data-plan-mal="${item.exerciseId}">
      ${hint ? `<p class="plan-mal-hint dus liten">${esc(hint)}</p>` : ''}
      <p class="felt-navn liten">Foreslått (valgfritt)</p>
      <div class="plan-mal-rad">
        <label class="plan-mal-celle">
          <span class="dus">Sett</span>
          <input type="number" class="inndata plan-mal-inp" data-felt="suggestedSets"
            value="${val('suggestedSets')}" min="1" max="20" placeholder="–" inputmode="numeric" aria-label="Foreslåtte sett">
        </label>
        <label class="plan-mal-celle">
          <span class="dus">Reps</span>
          <input type="number" class="inndata plan-mal-inp" data-felt="suggestedReps"
            value="${val('suggestedReps')}" min="1" max="99" placeholder="–" inputmode="numeric" aria-label="Foreslåtte reps">
        </label>
        ${showWeight ? `
        <label class="plan-mal-celle">
          <span class="dus">Vekt (kg)</span>
          <input type="number" class="inndata plan-mal-inp" data-felt="suggestedWeightKg"
            value="${val('suggestedWeightKg')}" min="0" step="0.5" placeholder="–" inputmode="decimal" aria-label="Foreslått vekt i kg">
        </label>` : ''}
      </div>
    </div>`;
}

function planItemFromMalFields(item, host) {
  const block = host.querySelector(`[data-plan-mal="${item.exerciseId}"]`);
  if (!block) return store.sanitizePlanItem({ exerciseId: item.exerciseId });
  const raw = { exerciseId: item.exerciseId };
  block.querySelectorAll('.plan-mal-inp').forEach((inp) => {
    const v = inp.value.trim();
    if (v) raw[inp.dataset.felt] = v;
  });
  return store.sanitizePlanItem(raw);
}

export async function render(container, params) {
  await initContent();
  const templateId = params[0];
  const raw = templateId ? await store.getSavedTemplates().then((all) => all.find((t) => t.id === templateId)) : null;

  if (!raw) {
    container.innerHTML = `
      <header class="side-topp">
        <a href="#/programmer" class="tilbake" aria-label="Tilbake">‹</a>
        <h1>Program</h1>
      </header>
      <p class="tomt">Programmet finnes ikke.</p>
      <a href="#/programmer" class="knapp sekundaer bred">Tilbake til programmer</a>`;
    return;
  }

  let template = raw;
  const [exercises, enriched] = await Promise.all([
    store.getExercises({ includeInactive: true }),
    store.getEnrichedSets(),
  ]);
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const stats = categoryStats(enriched);
  const items = template.items.map((it) => ({ ...it }));

  function renderPage() {
    const rows = items.map((item, i) => {
      const ex = exMap.get(item.exerciseId);
      const name = ex ? ex.name : 'Ukjent øvelse';
      const cat = ex ? store.categoryById(ex.category) : null;
      const hasTeknikk = ex && (getDescription(ex) || ex.notes?.trim() || ex.video?.trim());

      return `
        <div class="plan-rad styrke-rad styrke-rad--liste styrke-rad--utvidet" data-idx="${i}" data-ex-id="${item.exerciseId}">
          <div class="styrke-lenke">
            <span class="plan-rekkefolge">${i + 1}</span>
            ${cat ? `<span class="styrke-rad-kat">${categoryIconHtml(cat, 'kategori-ikon styrke-kat-ikon')}</span>` : ''}
            <span class="plan-okt-info"><span class="plan-navn">${esc(name)}</span></span>
          </div>
          <span class="plan-rad-handlinger">
            <button type="button" class="ikon-knapp" data-handling="opp" aria-label="Flytt opp" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="ikon-knapp" data-handling="ned" aria-label="Flytt ned" ${i === items.length - 1 ? 'disabled' : ''}>↓</button>
            ${hasTeknikk ? '<button type="button" class="ikon-knapp" data-handling="teknikk" aria-label="Vis teknikk">i</button>' : ''}
            <button type="button" class="ikon-knapp" data-handling="fjern" aria-label="Fjern">✕</button>
          </span>
          ${planMalFieldsHtml(item, ex)}
        </div>`;
    }).join('');

    container.innerHTML = `
      <header class="side-topp">
        <a href="#/programmer" class="tilbake" aria-label="Tilbake">‹</a>
        <div>
          <h1>Rediger program</h1>
          <p class="dus">${items.length} øvelse${items.length === 1 ? '' : 'r'}</p>
        </div>
      </header>

      <section class="kort">
        <label class="felt-navn" for="program-navn">Navn</label>
        <input type="text" class="inndata" id="program-navn" value="${esc(template.name || '')}"
          placeholder="${esc(defaultProgramName(items, todayStr()))}">
      </section>

      <section class="kort styrke-program" aria-label="Øvelser">
        <h2 class="kort-tittel">Øvelser</h2>
        <div id="program-edit-liste">${rows || '<p class="dus liten">Ingen øvelser ennå.</p>'}</div>
        <button type="button" class="knapp sekundaer bred" id="legg-til-ovelse">+ Legg til øvelse</button>
      </section>

      <div class="knapp-rad program-edit-handlinger">
        <button type="button" class="knapp primaer" id="lagre-program">Lagre</button>
        <button type="button" class="knapp sekundaer" id="legg-kalender">Legg på kalender</button>
        <button type="button" class="knapp sekundaer" id="start-i-dag">Start i dag</button>
        <button type="button" class="knapp sekundaer" id="eksporter-program">Eksporter</button>
        <button type="button" class="knapp sekundaer farlig" id="slett-program">Slett</button>
      </div>
      <div id="program-edit-vert"></div>
    `;

    bindEvents();
  }

  async function persistItems(newItems) {
    items.length = 0;
    items.push(...newItems);
    template = await store.savePlan({
      id: template.id,
      name: container.querySelector('#program-navn')?.value.trim() || template.name,
      items: items.map((it) => ({ ...it })),
      status: 'mal',
      date: template.date || todayStr(),
      sourceTemplateId: '',
    });
  }

  function bindEvents() {
    const host = container.querySelector('#program-edit-vert');

    container.querySelector('#legg-til-ovelse')?.addEventListener('click', () => {
      openCategoryPicker(host, stats, (catId) => {
        openExercisePicker(host, catId, items, async (ex) => {
          host.innerHTML = '';
          await persistItems([...items, { exerciseId: ex.id }]);
          toast(`«${ex.name}» lagt til`, 'suksess');
          renderPage();
        }, () => render(container, params));
      });
    });

    container.querySelector('#lagre-program')?.addEventListener('click', async () => {
      const name = container.querySelector('#program-navn')?.value.trim()
        || defaultProgramName(items, todayStr());
      template = await store.savePlan({
        id: template.id,
        name,
        items: items.map((it, i) => planItemFromMalFields(items[i], container)),
        status: 'mal',
        date: template.date || todayStr(),
        sourceTemplateId: '',
      });
      toast('Program lagret', 'suksess');
    });

    container.querySelector('#legg-kalender')?.addEventListener('click', async () => {
      const name = container.querySelector('#program-navn')?.value.trim()
        || defaultProgramName(items, todayStr());
      template = await store.savePlan({
        id: template.id,
        name,
        items: items.map((it, i) => planItemFromMalFields(items[i], container)),
        status: 'mal',
        date: template.date || todayStr(),
        sourceTemplateId: '',
      });
      openCalendarWeekPicker(host, {
        templateId: template.id,
        templateName: template.name,
        anchorDate: todayStr(),
        onScheduled: (date) => {
          toast(`Lagt på ${formatDateShort(date)}`, 'suksess');
        },
      });
    });

    container.querySelector('#start-i-dag')?.addEventListener('click', async () => {
      const name = container.querySelector('#program-navn')?.value.trim()
        || defaultProgramName(items, todayStr());
      template = await store.savePlan({
        id: template.id,
        name,
        items: items.map((it, i) => planItemFromMalFields(items[i], container)),
        status: 'mal',
        date: template.date || todayStr(),
        sourceTemplateId: '',
      });
      await store.loadTemplateIntoDate(template.id, todayStr());
      toast('Program lagt på dagens økt', 'suksess');
      location.hash = '#/styrke';
    });

    container.querySelector('#eksporter-program')?.addEventListener('click', async () => {
      const name = container.querySelector('#program-navn')?.value.trim() || template.name;
      const current = { ...template, name, items: items.map((it, i) => planItemFromMalFields(items[i], container)) };
      openExportProgramSheet(host, current, exMap);
    });

    container.querySelector('#slett-program')?.addEventListener('click', async () => {
      if (!confirm(`Slette «${template.name || 'programmet'}»?`)) return;
      await store.deletePlan(template.id);
      toast('Program slettet', 'suksess');
      location.hash = '#/programmer';
    });

    container.querySelectorAll('.plan-rad').forEach((row) => {
      const idx = Number(row.dataset.idx);
      row.querySelectorAll('[data-handling]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const action = btn.dataset.handling;
          const next = items.map((it) => ({ ...it }));
          if (action === 'fjern') next.splice(idx, 1);
          else if (action === 'opp' && idx > 0) [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
          else if (action === 'ned' && idx < next.length - 1) [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
          else if (action === 'teknikk') {
            toast('Se øvelsesbiblioteket for full teknikk', 'info');
            return;
          }
          await persistItems(next);
          renderPage();
        });
      });

      row.querySelectorAll('.plan-mal-inp').forEach((inp) => {
        inp.addEventListener('blur', async () => {
          const exId = row.dataset.exId;
          const i = items.findIndex((it) => it.exerciseId === exId);
          if (i < 0) return;
          const next = items.map((it) => ({ ...it }));
          next[i] = planItemFromMalFields(items[i], container);
          await persistItems(next);
        });
      });
    });
  }

  renderPage();
}
