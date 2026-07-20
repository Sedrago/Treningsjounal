/**
 * nutrition-ui.js – delt HTML og hendelser for kost-widget og oppsummering.
 */

import * as store from './store.js';
import { esc, fmtNum, todayStr } from './utils.js';

function progressBar(label, current, goal, { warnOver = false, unit = 'g' } = {}) {
  const pct = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;
  const over = warnOver && goal > 0 && current > goal;
  const remaining = goal > 0 ? Math.max(0, goal - current) : null;
  const status = over
    ? `${fmtNum(current, 0)} / ${fmtNum(goal, 0)} ${unit} (over)`
    : remaining != null
      ? `${fmtNum(current, 0)} / ${fmtNum(goal, 0)} ${unit} (${fmtNum(remaining, 0)} igjen)`
      : `${fmtNum(current, 0)} ${unit}`;
  return `
    <div class="kost-fremdrift${over ? ' kost-fremdrift--advarsel' : ''}">
      <div class="kost-fremdrift-hode">
        <span class="kost-fremdrift-etikett">${esc(label)}</span>
        <span class="kost-fremdrift-status">${status}</span>
      </div>
      <div class="kost-fremdrift-spor" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(label)}">
        <div class="kost-fremdrift-bar" style="width:${pct}%"></div>
      </div>
    </div>`;
}

export function renderNutritionSummaryHtml(summary) {
  const proteinGoal = store.nutritionGoalG('proteinDailyGoalG', 150);
  const carbMax = store.nutritionCarbMaxG();

  return `
    ${progressBar('Protein', summary.proteinG, proteinGoal)}
    ${carbMax != null ? progressBar('Karbo', summary.carbsG, carbMax, { warnOver: true }) : ''}`;
}

export function renderHomeNutritionHtml(summary) {
  return `
    <h2 class="kort-tittel">I dag</h2>
    ${renderNutritionSummaryHtml(summary)}
    <div class="knapp-rad kost-hjem-handlinger">
      <a href="#/inntak" class="knapp sekundaer">+ Logg inntak</a>
    </div>`;
}

export async function mountHomeNutrition(container) {
  const date = todayStr();
  const summary = await store.getDailyNutritionSummary(date);
  const host = container.querySelector('#kost-hjem-innhold');
  if (!host) return;
  host.innerHTML = renderHomeNutritionHtml(summary);
}
