/**
 * nutrition-ui.js – delt HTML og hendelser for kost-widget og oppsummering.
 */

import * as store from './store.js';
import { esc, fmtMacroG, todayStr } from './utils.js';

function progressBar(label, current, goal, { warnOver = false, unit = 'g' } = {}) {
  const pct = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;
  const over = warnOver && goal > 0 && current > goal;
  const remaining = goal > 0 ? Math.max(0, goal - current) : null;
  const status = over
    ? `${fmtMacroG(current)} / ${fmtMacroG(goal)} ${unit} (over)`
    : remaining != null
      ? `${fmtMacroG(current)} / ${fmtMacroG(goal)} ${unit} (${fmtMacroG(remaining)} igjen)`
      : `${fmtMacroG(current)} ${unit}`;
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

/** Karbo-linje under momentum-faktorer; tom når ingenting er logget i dag. */
export function renderHomeCarbsLineHtml(summary) {
  const carbsG = summary?.carbsG ?? 0;
  if (carbsG <= 0) return '';

  const carbMax = store.nutritionCarbMaxG();
  const pct = carbMax != null && carbMax > 0
    ? Math.min(100, Math.round((carbsG / carbMax) * 100))
    : 100;
  const over = carbMax != null && carbMax > 0 && carbsG > carbMax;
  const status = carbMax != null
    ? `${fmtMacroG(carbsG)} / ${fmtMacroG(carbMax)} g${over ? ' (over)' : ''}`
    : `${fmtMacroG(carbsG)} g`;

  return `
    <div class="momentum-karbo${over ? ' momentum-karbo--advarsel' : ''}" aria-label="Karbohydrater i dag">
      <div class="momentum-karbo-hode">
        <span class="momentum-karbo-etikett">Karbo</span>
        <span class="momentum-karbo-status dus">${status}</span>
      </div>
      <div class="momentum-karbo-spor" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Karbo">
        <div class="momentum-karbo-bar" style="width:${pct}%"></div>
      </div>
    </div>`;
}

/** @deprecated – bruk renderHomeCarbsLineHtml på hjem */
export function renderHomeMacroBarsHtml(summary) {
  return renderHomeCarbsLineHtml(summary);
}

/** @deprecated – bruk renderHomeCarbsLineHtml på hjem */
export function renderHomeNutritionHtml(summary) {
  return `
    <h2 class="kort-tittel">I dag</h2>
    ${renderNutritionSummaryHtml(summary)}
    <div class="knapp-rad kost-hjem-handlinger">
      <a href="#/inntak" class="knapp sekundaer">+ Logg inntak</a>
    </div>`;
}

/** @deprecated – kost-widget på hjem erstattet av makro-barer */
export async function mountHomeNutrition(container) {
  const date = todayStr();
  const summary = await store.getDailyNutritionSummary(date);
  const host = container.querySelector('#kost-hjem-innhold');
  if (!host) return;
  host.innerHTML = renderHomeCarbsLineHtml(summary);
}
