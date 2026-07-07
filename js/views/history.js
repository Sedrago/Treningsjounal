/**
 * views/history.js – historikk med søk og tidsfilter, per økt og per øvelse.
 */

import * as store from '../store.js';
import { groupBy, totalVolume, oneRMHistory, best1RM, personalRecord, personalRecordReps, personalRecordDuration, bestSessionVolume } from '../stats.js';
import { lineChart } from '../charts.js';
import {
  esc, fmtNum, fmtVolume, fmtDuration, formatDateShort, formatDateLong,
  todayStr, toDisplayWeight, weightUnit, summarizeSet, fmtClock,
} from '../utils.js';

const FILTERS = [
  { id: 'uke', label: 'Uke', days: 7 },
  { id: 'maned', label: 'Måned', days: 31 },
  { id: 'ar', label: 'År', days: 366 },
  { id: 'alle', label: 'Alle', days: null },
];

/** Historikkliste over alle økter. */
export async function render(container, params, query = {}) {
  const enriched = await store.getEnrichedSets();
  const workouts = await store.getWorkouts();
  const units = store.getSetting('units');
  const filter = query.filter || 'maned';
  const search = query.q || '';

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/hjem" class="tilbake" aria-label="Tilbake til hjem">‹</a>
      <h1>Historikk</h1>
    </header>
    <input type="search" class="inndata sok" id="sok" placeholder="Søk i øvelser og kommentarer …"
      value="${esc(search)}" aria-label="Søk i historikk">
    <div class="filter-linje" role="tablist" aria-label="Tidsfilter">
      ${FILTERS.map((f) => `<button type="button" role="tab" aria-selected="${f.id === filter}"
        class="filter-knapp ${f.id === filter ? 'aktiv' : ''}" data-filter="${f.id}">${f.label}</button>`).join('')}
    </div>
    <div id="historikk-liste"></div>
  `;

  const listEl = container.querySelector('#historikk-liste');

  function draw() {
    const f = FILTERS.find((x) => x.id === filter);
    let sets = enriched;
    if (f.days) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - f.days);
      const cutoffStr = todayStr(cutoff);
      sets = sets.filter((s) => s.date >= cutoffStr);
    }
    if (search) {
      const q = search.toLowerCase();
      sets = sets.filter((s) => s.exerciseName.toLowerCase().includes(q)
        || (s.comment || '').toLowerCase().includes(q));
    }
    const byDate = groupBy(sets, (s) => s.date);
    const dates = [...byDate.keys()].sort().reverse();
    if (!dates.length) {
      listEl.innerHTML = '<p class="tomt">Ingen økter funnet.</p>';
      return;
    }
    const woByDate = new Map(workouts.map((w) => [w.date, w]));
    listEl.innerHTML = dates.map((date) => {
      const daySets = byDate.get(date);
      const workout = woByDate.get(date);
      const byEx = groupBy(daySets, (s) => s.exerciseId);
      const lines = [...byEx.entries()].map(([exId, exSets]) => {
        const mode = exSets[0].logMode || 'weight';
        const summary = exSets.sort((a, b) => a.setNumber - b.setNumber)
          .map((s) => summarizeSet(s, mode, units)).join(' · ');
        return `<p class="hist-linje"><a href="#/ovelse/${exId}">${esc(exSets[0].exerciseName)}</a>
          <span class="dus">${esc(summary)}</span></p>`;
      }).join('');
      const comments = daySets.filter((s) => s.comment).map((s) => `<p class="dus liten">«${esc(s.comment)}»</p>`).join('');
      return `
        <section class="kort hist-kort">
          <h2 class="kort-tittel">${formatDateLong(date)}
            <span class="dus liten">${fmtVolume(totalVolume(daySets))} kg volum${workout?.duration ? ` · ${fmtDuration(workout.duration)}` : ''}</span>
          </h2>
          ${lines}
          ${comments}
          ${workout?.notes ? `<p class="dus liten">Notat: ${esc(workout.notes)}</p>` : ''}
        </section>`;
    }).join('');
  }

  draw();

  container.querySelectorAll('.filter-knapp').forEach((btn) => {
    btn.addEventListener('click', () => {
      location.hash = `#/historikk?filter=${btn.dataset.filter}${search ? `&q=${encodeURIComponent(search)}` : ''}`;
    });
  });
  let searchTimer;
  container.querySelector('#sok').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      location.hash = `#/historikk?filter=${filter}&q=${encodeURIComponent(e.target.value)}`;
    }, 350);
  });
}

/** Historikk for én øvelse (#/ovelse/:id). */
export async function renderExercise(container, params) {
  const exerciseId = params[0];
  const exercise = await store.getExercise(exerciseId);
  if (!exercise) {
    container.innerHTML = '<p class="tomt">Fant ikke øvelsen.</p>';
    return;
  }
  const units = store.getSetting('units');
  const unit = weightUnit(units);
  const logMode = store.logModeOf(exercise);
  const sets = (await store.getEnrichedSets()).filter((s) => s.exerciseId === exerciseId);
  const byDate = groupBy(sets, (s) => s.date);
  const dates = [...byDate.keys()].sort().reverse();
  const pr = personalRecord(sets);
  const prReps = personalRecordReps(sets);
  const prDur = personalRecordDuration(sets);
  const rm = best1RM(sets);
  const bestVol = bestSessionVolume(sets);

  let statsHtml = '';
  if (sets.length) {
    if (logMode === 'duration') {
      statsHtml = `
    <div class="nokkeltal">
      <div class="nokkel"><span class="nokkel-verdi">${prDur ? fmtClock(prDur.durationSec) : '–'}</span>
        <span class="nokkel-navn">Lengste hold</span></div>
      <div class="nokkel"><span class="nokkel-verdi">${dates.length}</span>
        <span class="nokkel-navn">Økter</span></div>
    </div>`;
    } else if (logMode === 'bodyweight') {
      statsHtml = `
    <div class="nokkeltal">
      <div class="nokkel"><span class="nokkel-verdi">${prReps ? prReps.reps : '–'}</span>
        <span class="nokkel-navn">Beste reps</span></div>
      <div class="nokkel"><span class="nokkel-verdi">${dates.length}</span>
        <span class="nokkel-navn">Økter</span></div>
    </div>`;
    } else {
      statsHtml = `
    <div class="nokkeltal">
      <div class="nokkel"><span class="nokkel-verdi">${pr ? `${fmtNum(toDisplayWeight(pr.weight, units))}` : '–'}</span>
        <span class="nokkel-navn">PR (${unit})</span></div>
      <div class="nokkel"><span class="nokkel-verdi">${fmtNum(toDisplayWeight(rm, units), 0)}</span>
        <span class="nokkel-navn">Est. 1RM</span></div>
      <div class="nokkel"><span class="nokkel-verdi">${fmtVolume(bestVol.volume)}</span>
        <span class="nokkel-navn">Beste volum</span></div>
    </div>
    <section class="kort">
      <h2 class="kort-tittel">Estimert 1RM over tid</h2>
      <div id="rm-graf"></div>
    </section>`;
    }
  }

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/historikk" class="tilbake" aria-label="Tilbake til historikk">‹</a>
      <div>
        <h1>${esc(exercise.name)}</h1>
        <p class="dus">${dates.length} økter · <a href="#/logg/${exercise.id}">logg i dag</a></p>
      </div>
    </header>
    ${statsHtml}
    <div id="okt-liste">
      ${dates.map((date) => {
        const daySets = byDate.get(date).sort((a, b) => a.setNumber - b.setNumber);
        return `
          <section class="kort">
            <h2 class="kort-tittel">${formatDateShort(date)}
              <span class="dus liten">${logMode === 'weight' ? `${fmtVolume(totalVolume(daySets))} kg` : ''}</span></h2>
            ${daySets.map((s) => `
              <p class="forrige-sett">
                <span class="sett-nr">${s.setNumber}</span>
                <strong>${esc(summarizeSet(s, logMode, units))}</strong>
                ${s.rir != null ? `<span class="dus">RIR ${s.rir}</span>` : ''}
                ${s.comment ? `<span class="dus kommentar">«${esc(s.comment)}»</span>` : ''}
              </p>`).join('')}
          </section>`;
      }).join('') || '<p class="tomt">Ingen økter logget ennå.</p>'}
    </div>
  `;

  if (logMode === 'weight' && sets.length) {
    const history = oneRMHistory(sets).map((p) => ({
      label: p.date.slice(5).replace('-', '.'),
      value: Math.round(toDisplayWeight(p.oneRM, units)),
    }));
    lineChart(container.querySelector('#rm-graf'), history);
  }
}
