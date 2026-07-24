/**
 * nutrition-ui.js – delt HTML og hendelser for kost-widget og oppsummering.
 */

import * as store from './store.js';
import { esc, fmtMacroG, fmtKcal, todayStr } from './utils.js';

function formatProgressStatus(current, target, { unit = 'g', fmt = fmtMacroG, isMax = false } = {}) {
  if (!target || target <= 0) return `${fmt(current)} ${unit}`;
  const cur = Number(current) || 0;
  const diff = cur - target;
  if (diff > 0) {
    const overLabel = isMax ? 'over' : 'over mål';
    return `${fmt(cur)} / ${fmt(target)} ${unit} (+${fmt(diff)} ${overLabel})`;
  }
  const left = target - cur;
  return `${fmt(cur)} / ${fmt(target)} ${unit} (${fmt(left)} igjen)`;
}

function progressBar(label, current, goal, { isMax = false, unit = 'g', fmt = fmtMacroG } = {}) {
  const pct = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;
  const over = goal > 0 && current > goal;
  const status = formatProgressStatus(current, goal, { unit, fmt, isMax });
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

function homeCapLineHtml({ label, current, cap, classBase, ariaLabel }) {
  if (cap == null || cap <= 0) return '';
  const cur = Number(current) || 0;
  if (cur <= 0) return '';

  const pct = Math.min(100, Math.round((cur / cap) * 100));
  const over = cur > cap;
  const unit = label === 'Kalorier' ? 'kcal' : 'g';
  const fmt = label === 'Kalorier' ? fmtKcal : fmtMacroG;
  const status = formatProgressStatus(cur, cap, { unit, fmt, isMax: true });

  return `
    <div class="${classBase}${over ? ` ${classBase}--advarsel` : ''}" aria-label="${esc(ariaLabel)}">
      <div class="${classBase}-hode">
        <span class="${classBase}-etikett">${esc(label)}</span>
        <span class="${classBase}-status dus">${status}</span>
      </div>
      <div class="${classBase}-spor" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(label)}">
        <div class="${classBase}-bar" style="width:${pct}%"></div>
      </div>
    </div>`;
}

export function renderNutritionProgressBarsHtml(summary) {
  const s = summary ?? { proteinG: 0, carbsG: 0, kcal: null };
  const proteinGoal = store.nutritionGoalG('proteinDailyGoalG', 150);
  const carbMax = store.nutritionCarbMaxG();
  const kcalMax = store.nutritionCaloriesMaxKcal();

  return `
    ${progressBar('Protein', s.proteinG ?? 0, proteinGoal, { isMax: false })}
    ${carbMax != null ? progressBar('Karbo', s.carbsG ?? 0, carbMax, { isMax: true }) : ''}
    ${kcalMax != null ? progressBar('Kalorier', s.kcal ?? 0, kcalMax, { isMax: true, unit: 'kcal', fmt: fmtKcal }) : ''}`;
}

export function renderNutritionSummaryHtml(summary) {
  return `
    ${renderNutritionProgressBarsHtml(summary)}
    ${renderDailyNutritionTableHtml(summary)}`;
}

export function renderDailyNutritionTableHtml(summary) {
  const s = summary ?? { proteinG: 0, carbsG: 0, fatG: null, kcal: null, fatPartial: false, kcalPartial: false };
  const proteinGoal = store.nutritionGoalG('proteinDailyGoalG', 150);
  const carbMax = store.nutritionCarbMaxG();
  const kcalMax = store.nutritionCaloriesMaxKcal();

  const goalProtein = `${fmtMacroG(proteinGoal)} g mål`;
  const goalCarbs = carbMax != null ? `${fmtMacroG(carbMax)} g max` : '–';
  const goalFat = '–';
  const goalKcal = kcalMax != null ? `${fmtKcal(kcalMax)} max` : '–';

  const fatVal = s.fatG != null ? `${fmtMacroG(s.fatG)} g` : '–';
  const kcalVal = s.kcal != null ? `${fmtKcal(s.kcal)} kcal` : '–';
  const fatCell = s.fatG != null && s.fatPartial
    ? `${fmtMacroG(s.fatG)} g*`
    : fatVal;
  const kcalCell = s.kcal != null && s.kcalPartial
    ? `${fmtKcal(s.kcal)} kcal*`
    : kcalVal;

  const footnote = (s.fatPartial || s.kcalPartial)
    ? '<p class="dus liten kost-tabell-fotnote">* Delvis — fett/energi telles bare for inntak der det er registrert.</p>'
    : '';

  return `
    <div class="kost-tabell-wrap" aria-label="Næringstabell for dagen">
      <h3 class="kost-tabell-tittel">Næringstabell</h3>
      <table class="kost-tabell">
        <thead>
          <tr>
            <th scope="col"></th>
            <th scope="col">Sum</th>
            <th scope="col">Mål / tak</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Protein</th>
            <td>${fmtMacroG(s.proteinG)} g</td>
            <td class="dus">${goalProtein}</td>
          </tr>
          <tr>
            <th scope="row">Karbo</th>
            <td>${fmtMacroG(s.carbsG)} g</td>
            <td class="dus">${goalCarbs}</td>
          </tr>
          <tr>
            <th scope="row">Fett</th>
            <td>${fatCell}</td>
            <td class="dus">${goalFat}</td>
          </tr>
          <tr>
            <th scope="row">Energi</th>
            <td>${kcalCell}</td>
            <td class="dus">${goalKcal}</td>
          </tr>
        </tbody>
      </table>
      ${footnote}
    </div>`;
}

/** Karbo-linje under momentum-faktorer; tom når ingenting er logget i dag. */
export function renderHomeCarbsLineHtml(summary) {
  return homeCapLineHtml({
    label: 'Karbo',
    current: summary?.carbsG ?? 0,
    cap: store.nutritionCarbMaxG(),
    classBase: 'momentum-karbo',
    ariaLabel: 'Karbohydrater i dag',
  });
}

/** Kalori-linje på hjem når kaloritak er satt og noe er logget. */
export function renderHomeCaloriesLineHtml(summary) {
  const cap = store.nutritionCaloriesMaxKcal();
  if (cap == null) return '';
  return homeCapLineHtml({
    label: 'Kalorier',
    current: summary?.kcal ?? 0,
    cap,
    classBase: 'momentum-kcal',
    ariaLabel: 'Kalorier i dag',
  });
}

/** @deprecated – bruk renderHomeCarbsLineHtml på hjem */
export function renderHomeMacroBarsHtml(summary) {
  return renderHomeCarbsLineHtml(summary) + renderHomeCaloriesLineHtml(summary);
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
  host.innerHTML = renderHomeCarbsLineHtml(summary) + renderHomeCaloriesLineHtml(summary);
}
