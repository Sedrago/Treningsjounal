/**
 * views/statistics.js – statistikkskjermen: saldo, heatmap og detaljer.
 */

import * as store from '../store.js';
import * as stats from '../stats.js';
import { saldoChart, heatmap, lineChart } from '../charts.js';
import {
  esc, fmtNum, fmtDuration, todayStr,
  toDisplayWeight, weightUnit,
} from '../utils.js';

function saldoVerdi(v) {
  if (v == null) return '–';
  const diff = v - 100;
  const sign = diff > 0 ? '+' : '';
  return `${fmtNum(v, 0)} (${sign}${fmtNum(diff, 0)})`;
}

export async function render(container) {
  const enriched = await store.getEnrichedSets();
  const workouts = await store.getWorkouts();
  const aerobic = await store.getAerobicSessions();
  const bodyweights = await store.getBodyweights();
  const units = store.getSetting('units');
  const unit = weightUnit(units);
  const maxRir = Number(store.getSetting('workingSetRirMax')) || 4;
  const streakMode = store.getSetting('streakMode');
  const streak = stats.trainingStreak(enriched, streakMode);

  const dates = stats.workoutDates(enriched);
  const totalTime = workouts.reduce((sum, w) => sum + (w.duration || 0), 0);
  const saldo = stats.saldoHistory(enriched, aerobic, { maxRir, numWeeks: 12 });
  const favorites = stats.favoriteExercises(enriched);
  const perCategory = stats.sessionsPerCategory(enriched);

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

  const latest = saldo.latest;

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/hjem" class="tilbake" aria-label="Tilbake til hjem">‹</a>
      <h1>Statistikk</h1>
    </header>

    <div class="nokkeltal">
      <div class="nokkel"><span class="nokkel-verdi">${dates.length}</span><span class="nokkel-navn">Styrkeøkter</span></div>
      <div class="nokkel"><span class="nokkel-verdi">${streak}</span><span class="nokkel-navn">Streak</span></div>
      <div class="nokkel"><span class="nokkel-verdi">${fmtDuration(totalTime)}</span><span class="nokkel-navn">Tid totalt</span></div>
    </div>

    <section class="kort" aria-label="Treningsutvikling">
      <h2 class="kort-tittel">Treningsutvikling</h2>
      <p class="dus liten saldo-intro">100 = ditt vanlige nivå. Styrke bygges fra e1RM per øvelse mot egen historikk.</p>
      ${latest ? `
      <div class="nokkeltal saldo-nokkeltal">
        <div class="nokkel"><span class="nokkel-verdi">${saldoVerdi(latest.volume)}</span><span class="nokkel-navn">Mengde</span></div>
        <div class="nokkel"><span class="nokkel-verdi">${saldoVerdi(latest.intensity)}</span><span class="nokkel-navn">Intensitet</span></div>
        <div class="nokkel"><span class="nokkel-verdi">${saldoVerdi(latest.strength)}</span><span class="nokkel-navn">Styrke</span></div>
      </div>
      ${latest.strengthExercises ? `<p class="dus liten">Styrke basert på ${latest.strengthExercises} øvelse${latest.strengthExercises === 1 ? '' : 'r'} denne uken.</p>` : ''}` : ''}
      <div id="saldo-graf"></div>
    </section>

    <section class="kort">
      <h2 class="kort-tittel">Aktivitet siste 6 måneder</h2>
      <p class="dus liten">Farge = arbeidssett den dagen.</p>
      <div id="heatmap"></div>
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

  saldoChart(container.querySelector('#saldo-graf'), saldo.weeks);
  heatmap(
    container.querySelector('#heatmap'),
    stats.heatmapActivityData(enriched, maxRir),
    26,
    {
      valueLabel: (n, key) => (n > 0
        ? `${key}: ${Math.round(n)} arbeidssett`
        : `${key}: ingen styrke`),
    },
  );

  if (bodyweights.length >= 2) {
    const points = [...bodyweights].reverse().slice(-30).map((b) => ({
      label: b.date.slice(5).replace('-', '.'),
      value: Math.round(toDisplayWeight(b.weight, units) * 10) / 10,
    }));
    lineChart(container.querySelector('#vekt-graf'), points);
  }
}
