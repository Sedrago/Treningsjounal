/**
 * views/statistics.js – statistikkskjermen: nøkkeltall, heatmap og grafer.
 */

import * as store from '../store.js';
import * as stats from '../stats.js';
import { lineChart, barChart, heatmap } from '../charts.js';
import {
  esc, fmtNum, fmtVolume, fmtDuration, todayStr,
  toDisplayWeight, weightUnit, startOfWeek,
} from '../utils.js';

export async function render(container) {
  const enriched = await store.getEnrichedSets();
  const workouts = await store.getWorkouts();
  const bodyweights = await store.getBodyweights();
  const units = store.getSetting('units');
  const unit = weightUnit(units);

  const dates = stats.workoutDates(enriched);
  const totalVol = stats.totalVolume(enriched);
  const monday = todayStr(startOfWeek(new Date()));
  const weekVol = stats.totalVolume(enriched.filter((s) => s.date >= monday));
  const monthCutoff = new Date(); monthCutoff.setDate(monthCutoff.getDate() - 30);
  const monthVol = stats.totalVolume(enriched.filter((s) => s.date >= todayStr(monthCutoff)));
  const totalTime = workouts.reduce((sum, w) => sum + (w.duration || 0), 0);
  const rir = stats.avgRir(enriched);
  const streak = stats.weekStreak(enriched);
  const favorites = stats.favoriteExercises(enriched);
  const perCategory = stats.sessionsPerCategory(enriched);

  // Personlige rekorder per øvelse (topp 8 etter est. 1RM).
  const byExercise = stats.groupBy(enriched, (s) => s.exerciseId);
  const records = [...byExercise.entries()]
    .map(([id, exSets]) => ({
      id,
      name: exSets[0].exerciseName,
      pr: stats.personalRecord(exSets),
      oneRM: stats.best1RM(exSets),
    }))
    .filter((r) => r.pr)
    .sort((a, b) => b.oneRM - a.oneRM)
    .slice(0, 8);

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/hjem" class="tilbake" aria-label="Tilbake til hjem">‹</a>
      <h1>Statistikk</h1>
    </header>

    <div class="nokkeltal">
      <div class="nokkel"><span class="nokkel-verdi">${dates.length}</span><span class="nokkel-navn">Økter</span></div>
      <div class="nokkel"><span class="nokkel-verdi">${streak}</span><span class="nokkel-navn">Ukestreak</span></div>
      <div class="nokkel"><span class="nokkel-verdi">${fmtDuration(totalTime)}</span><span class="nokkel-navn">Tid totalt</span></div>
    </div>
    <div class="nokkeltal">
      <div class="nokkel"><span class="nokkel-verdi">${fmtVolume(weekVol)}</span><span class="nokkel-navn">Volum uke (kg)</span></div>
      <div class="nokkel"><span class="nokkel-verdi">${fmtVolume(monthVol)}</span><span class="nokkel-navn">Volum 30 d (kg)</span></div>
      <div class="nokkel"><span class="nokkel-verdi">${fmtVolume(totalVol)}</span><span class="nokkel-navn">Volum totalt (kg)</span></div>
    </div>
    ${rir !== null ? `<p class="dus sentrert">Gjennomsnittlig RIR: ${fmtNum(rir)}</p>` : ''}

    <section class="kort">
      <h2 class="kort-tittel">Aktivitet siste 6 måneder</h2>
      <div id="heatmap"></div>
    </section>

    <section class="kort">
      <h2 class="kort-tittel">Volum per uke (kg)</h2>
      <div id="volum-graf"></div>
    </section>

    <section class="kort">
      <h2 class="kort-tittel">Økter per uke</h2>
      <div id="frekvens-graf"></div>
    </section>

    ${bodyweights.length >= 2 ? `
    <section class="kort">
      <h2 class="kort-tittel">Kroppsvekt (${unit})</h2>
      <div id="vekt-graf"></div>
    </section>` : ''}

    ${records.length ? `
    <section class="kort">
      <h2 class="kort-tittel">Personlige rekorder</h2>
      ${records.map((r) => `
        <p class="pr-rad"><a href="#/ovelse/${r.id}">${esc(r.name)}</a>
          <span><strong>${fmtNum(toDisplayWeight(r.pr.weight, units))} ${unit}</strong> × ${r.pr.reps ?? '–'}
          <span class="dus">· 1RM ${fmtNum(toDisplayWeight(r.oneRM, units), 0)}</span></span></p>`).join('')}
    </section>` : ''}

    ${favorites.length ? `
    <section class="kort">
      <h2 class="kort-tittel">Favorittøvelser</h2>
      ${favorites.map((f) => `<p class="pr-rad"><a href="#/ovelse/${f.exerciseId}">${esc(f.name)}</a>
        <span class="dus">${f.sessions} økter</span></p>`).join('')}
    </section>` : ''}

    <section class="kort">
      <h2 class="kort-tittel">Økter per kategori</h2>
      ${store.KATEGORIER.map((k) => `
        <p class="pr-rad"><span>${k.icon} ${esc(k.name)}</span>
          <span class="dus">${perCategory.get(k.id) || 0}</span></p>`).join('')}
    </section>
  `;

  heatmap(container.querySelector('#heatmap'), stats.heatmapData(enriched));
  barChart(container.querySelector('#volum-graf'),
    stats.volumePerWeek(enriched).map((w) => ({ label: w.label, value: Math.round(w.volume) })));
  barChart(container.querySelector('#frekvens-graf'),
    stats.frequencyPerWeek(enriched).map((w) => ({ label: w.label, value: w.count })));

  if (bodyweights.length >= 2) {
    const points = [...bodyweights].reverse().slice(-30).map((b) => ({
      label: b.date.slice(5).replace('-', '.'),
      value: Math.round(toDisplayWeight(b.weight, units) * 10) / 10,
    }));
    lineChart(container.querySelector('#vekt-graf'), points);
  }
}
