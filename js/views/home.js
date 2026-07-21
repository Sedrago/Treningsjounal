/**
 * views/home.js – hjem: momentum, faktorer, makro-barer og innsikt/innstillinger.
 */

import * as store from '../store.js';
import * as api from '../api.js';
import * as sync from '../sync.js';
import { computeMomentum } from '../momentum.js';
import { pickHomeInsight } from '../home-insight.js';
import { momentumChart } from '../charts.js';
import { renderHomeMacroBarsHtml } from '../nutrition-ui.js';
import {
  esc, formatDateLong, todayStr, weekdayShort,
} from '../utils.js';

function momentumSeriesLabels(series) {
  return series.map((p, i, arr) => {
    if (i === arr.length - 1) return { ...p, label: 'i dag' };
    if (i === 0) return { ...p, label: weekdayShort(p.date) };
    if (i === arr.length - 8) return { ...p, label: '7d' };
    return { ...p, label: '' };
  });
}

function momentumChangeHtml(change) {
  if (change == null || change === 0) return '<p class="momentum-endring dus">Uendret siden i går</p>';
  const sign = change > 0 ? '+' : '';
  const cls = change > 0 ? 'momentum-endring--opp' : 'momentum-endring--ned';
  return `<p class="momentum-endring ${cls}">${sign}${change} siden i går</p>`;
}

function renderMomentumFactors(factors) {
  return `
    <ul class="momentum-faktorer" aria-label="Faktorer i dag">
      ${factors.map((f) => `
        <li>
          <a href="${esc(f.href)}" class="momentum-faktor">
            <span class="momentum-faktor-hode">
              <span class="momentum-faktor-navn">${esc(f.label)}</span>
              <span class="momentum-faktor-status dus">${esc(f.status)}</span>
            </span>
            <span class="momentum-faktor-spor" role="presentation">
              <span class="momentum-faktor-bar" style="width:${f.pct}%"></span>
            </span>
            <span class="momentum-faktor-pil" aria-hidden="true">›</span>
          </a>
        </li>`).join('')}
    </ul>`;
}

function renderHomeInsight(insight) {
  if (!insight?.text) return '';
  const inner = esc(insight.text);
  if (insight.href) {
    return `<p class="hjem-info"><a href="${esc(insight.href)}" class="hjem-info-lenke">${inner}</a></p>`;
  }
  return `<p class="hjem-info">${inner}</p>`;
}

export async function render(container) {
  const [
    sets,
    aerobic,
    sleepRows,
    foodIntakes,
    lactate,
    nutritionSummary,
  ] = await Promise.all([
    store.getEnrichedSets(),
    store.getAerobicSessions(),
    store.getSleepEntries(),
    store.getAllFoodIntakes(),
    store.getLactateEntries(),
    store.getDailyNutritionSummary(todayStr()),
  ]);

  const momentum = computeMomentum({
    sets,
    foodIntakes,
    sleep: sleepRows,
    aerobic,
    lactate,
  });

  const insight = pickHomeInsight({
    sets,
    pillars: momentum.pillarsToday,
    proteinG: momentum.proteinG,
    proteinGoal: momentum.proteinGoal,
    momentumToday: momentum.today,
    momentumChange: momentum.change,
    series: momentum.series,
    apiConfigured: api.isConfigured(),
    syncState: sync.state,
  });

  container.innerHTML = `
    <h1 class="sr-only">FlowBooster</h1>
    <header class="hjem-topp">
      <p class="dato">${formatDateLong(todayStr())}</p>
    </header>

    <section class="kort momentum-kort" aria-label="Momentum">
      <div class="momentum-hode">
        <div>
          <h2 class="momentum-tittel">Momentum</h2>
          ${momentumChangeHtml(momentum.change)}
        </div>
        <p class="momentum-verdi" aria-live="polite">${momentum.today}</p>
      </div>
      <div id="momentum-graf" class="momentum-graf-wrap"></div>
      ${renderMomentumFactors(momentum.factors)}
    </section>

    <div class="hjem-makro" aria-label="Kost i dag">
      ${renderHomeMacroBarsHtml(nutritionSummary)}
    </div>

    ${renderHomeInsight(insight)}

    <nav class="hjem-hovednav hjem-hovednav--to" aria-label="Hovednavigasjon">
      <a href="#/innsikt" class="hjem-hovednav-kort">
        <span class="hjem-hovednav-ikon" aria-hidden="true">📊</span>
        <span class="hjem-hovednav-navn">Innsikt</span>
      </a>
      <a href="#/innstillinger" class="hjem-hovednav-kort">
        <span class="hjem-hovednav-ikon" aria-hidden="true">⚙️</span>
        <span class="hjem-hovednav-navn">Innstillinger</span>
      </a>
    </nav>
  `;

  const chartHost = container.querySelector('#momentum-graf');
  if (chartHost) {
    momentumChart(chartHost, momentumSeriesLabels(momentum.series));
  }
}
