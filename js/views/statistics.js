/**
 * views/statistics.js – statistikkskjermen: aktivitet, progresjon og detaljer.
 */

import * as store from '../store.js';
import * as stats from '../stats.js';
import { activityHeatmap, progressionChart, lineChart } from '../charts.js';
import {
  esc, fmtNum, fmtDuration,
  toDisplayWeight, weightUnit, categoryIconHtml,
} from '../utils.js';

export async function render(container) {
  const enriched = await store.getEnrichedSets();
  const workouts = await store.getWorkouts();
  const aerobic = await store.getAerobicSessions();
  const sleepRows = await store.getSleepEntries();
  const moodRows = await store.getMoodEntries();
  const bodyweights = await store.getBodyweights();
  const units = store.getSetting('units');
  const unit = weightUnit(units);
  const streakMode = store.getSetting('streakMode');
  const streak = stats.trainingStreak(enriched, streakMode);

  const dates = stats.workoutDates(enriched);
  const totalTime = workouts.reduce((sum, w) => sum + (w.duration || 0), 0);
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

  const heatmapData = stats.activityHeatmapData(enriched, aerobic, { days: 364 });
  const strengthPts = stats.strengthProgression(enriched);
  const sleepPts = stats.sleepProgression(sleepRows);
  const moodPts = stats.moodProgression(moodRows);

  const hasStrength = strengthPts.filter((p) => p.value != null).length >= 2;
  const hasSleep = sleepPts.filter((p) => p.value != null).length >= 2;
  const hasMood = moodPts.filter((p) => p.value != null).length >= 2;

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

    <section class="kort" aria-label="Aktivitet">
      <h2 class="kort-tittel">Aktivitet</h2>
      <p class="dus liten">Grønt = mengde · Rødt = hardere · Blå glød = aerob samme dag.</p>
      <div id="heatmap"></div>
    </section>

    <section class="kort" aria-label="Progresjon">
      <h2 class="kort-tittel">Progresjon</h2>
      <div class="progresjon-faner" role="tablist">
        <button type="button" class="progresjon-fane aktiv" data-fane="styrke" role="tab" aria-selected="true">Styrke</button>
        <button type="button" class="progresjon-fane" data-fane="sovn" role="tab" aria-selected="false">Søvn</button>
        <button type="button" class="progresjon-fane" data-fane="dagsform" role="tab" aria-selected="false">Dagsform</button>
      </div>
      <p class="dus liten progresjon-intro" data-intro="styrke">Utvikling mot egen historikk — uten konkrete tall.</p>
      <p class="dus liten progresjon-intro skjult" data-intro="sovn">Timer per natt. Kvalitet forsterker utslaget. Stiplet linje = ditt snitt.</p>
      <p class="dus liten progresjon-intro skjult" data-intro="dagsform">100 = ditt vanlige nivå.</p>
      <div id="progresjon-graf"></div>
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
        <p class="pr-rad"><span class="kategori-tittel">${categoryIconHtml(k, 'kategori-ikon liten')} ${esc(k.name)}</span>
          <span class="dus">${perCategory.get(k.id) || 0}</span></p>`).join('')}
    </section>
  `;

  activityHeatmap(container.querySelector('#heatmap'), heatmapData, 52);

  const progHost = container.querySelector('#progresjon-graf');
  const intros = container.querySelectorAll('[data-intro]');
  const tabs = container.querySelectorAll('.progresjon-fane');

  function renderProgression(mode) {
    tabs.forEach((t) => {
      const on = t.dataset.fane === mode;
      t.classList.toggle('aktiv', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    intros.forEach((p) => {
      p.classList.toggle('skjult', p.dataset.intro !== mode);
    });

    if (mode === 'styrke') {
      if (!hasStrength) {
        progHost.innerHTML = '<p class="tomt">Logg styrkeøvelser over flere uker for å se utvikling.</p>';
        return;
      }
      progressionChart(progHost, strengthPts, {
        hideYAxis: true,
        referenceLine: 100,
        lineClass: 'graf-linje-styrke',
        pointClass: 'graf-punkt-styrke',
      });
    } else if (mode === 'sovn') {
      if (!hasSleep) {
        progHost.innerHTML = '<p class="tomt">Logg søvn over flere uker for å se utvikling.</p>';
        return;
      }
      progressionChart(progHost, sleepPts, {
        hideYAxis: false,
        showBaseline: true,
        lineClass: 'graf-linje-sovn',
        pointClass: 'graf-punkt-sovn',
      });
    } else {
      if (!hasMood) {
        progHost.innerHTML = '<p class="tomt">Logg dagsform over flere uker for å se utvikling.</p>';
        return;
      }
      progressionChart(progHost, moodPts, {
        hideYAxis: true,
        referenceLine: 100,
        lineClass: 'graf-linje-dagsform',
        pointClass: 'graf-punkt-dagsform',
      });
    }
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => renderProgression(tab.dataset.fane));
  });
  renderProgression('styrke');

  if (bodyweights.length >= 2) {
    const points = [...bodyweights].reverse().slice(-30).map((b) => ({
      label: b.date.slice(5).replace('-', '.'),
      value: Math.round(toDisplayWeight(b.weight, units) * 10) / 10,
    }));
    lineChart(container.querySelector('#vekt-graf'), points);
  }
}
