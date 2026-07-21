/**
 * views/home.js – hjemskjermen med momentum, nøkkeltall og navigasjon.
 */

import * as store from '../store.js';
import { getMessages, balanceSince } from '../assistant.js';
import { computeMomentum } from '../momentum.js';
import { daysLast7Days, trainingStreak, aerobicMinutesSince, sleepSummarySince, moodSummarySince } from '../stats.js';
import { balanceBars, momentumChart } from '../charts.js';
import { esc, formatDateLong, relativeDays, todayStr, windowStartStr, fmtSleepHours, weekdayShort } from '../utils.js';
import { mountHomeNutrition } from '../nutrition-ui.js';

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

function renderMomentumTips(tips) {
  if (!tips.length) return '';
  return `
    <ul class="momentum-tips" aria-label="Forslag">
      ${tips.map((t) => `
        <li>
          <a href="${esc(t.href)}" class="momentum-tip">${esc(t.label)}</a>
        </li>`).join('')}
    </ul>`;
}

export async function render(container) {
  const [
    sets,
    aerobic,
    sleepRows,
    moodRows,
    foodIntakes,
    lactate,
  ] = await Promise.all([
    store.getEnrichedSets(),
    store.getAerobicSessions(),
    store.getSleepEntries(),
    store.getMoodEntries(),
    store.getAllFoodIntakes(),
    store.getLactateEntries(),
  ]);

  const dates = [...new Set(sets.map((s) => s.date))].sort();
  const lastDate = dates[dates.length - 1] || null;
  const streakMode = store.getSetting('streakMode');
  const streak = trainingStreak(sets, streakMode);
  const last7Days = daysLast7Days(sets);
  const since7 = windowStartStr(7);
  const messages = getMessages(sets);
  const balance = balanceSince(sets, since7);
  const aerobMin = aerobicMinutesSince(aerobic, since7);
  const sleepSum = sleepSummarySince(sleepRows, since7);
  const moodSum = moodSummarySince(moodRows, since7);

  const momentum = computeMomentum({
    sets,
    foodIntakes,
    sleep: sleepRows,
    aerobic,
    lactate,
  });

  const streakLabel = streakMode === 'calendar'
    ? (streak === 1 ? 'uke' : 'uker')
    : (streak === 1 ? 'periode' : 'perioder');

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
      ${renderMomentumTips(momentum.tips)}
    </section>

    <div class="nokkeltal nokkeltal--kompakt" role="list">
      <div class="nokkel" role="listitem">
        <span class="nokkel-verdi">${lastDate ? relativeDays(lastDate) : '–'}</span>
        <span class="nokkel-navn">Siste styrkeøkt</span>
      </div>
      <div class="nokkel" role="listitem">
        <span class="nokkel-verdi">${last7Days}</span>
        <span class="nokkel-navn">Dager siste 7 dager</span>
      </div>
      <div class="nokkel" role="listitem">
        <span class="nokkel-verdi">${streak} ${streakLabel}</span>
        <span class="nokkel-navn">Streak</span>
      </div>
    </div>

    <nav class="hjem-hovednav" aria-label="Hovednavigasjon">
      <a href="#/styrketrening" class="hjem-hovednav-kort">
        <span class="hjem-hovednav-ikon" aria-hidden="true">💪</span>
        <span class="hjem-hovednav-navn">Styrketrening</span>
      </a>
      <a href="#/logging" class="hjem-hovednav-kort">
        <span class="hjem-hovednav-ikon" aria-hidden="true">📝</span>
        <span class="hjem-hovednav-navn">Logging</span>
      </a>
      <a href="#/innsikt" class="hjem-hovednav-kort">
        <span class="hjem-hovednav-ikon" aria-hidden="true">📊</span>
        <span class="hjem-hovednav-navn">Innsikt</span>
      </a>
      <a href="#/innstillinger" class="hjem-hovednav-kort">
        <span class="hjem-hovednav-ikon" aria-hidden="true">⚙️</span>
        <span class="hjem-hovednav-navn">Innstillinger</span>
      </a>
    </nav>

    <section class="kort kost-hjem" id="kost-hjem" aria-label="Kost i dag">
      <div id="kost-hjem-innhold"><p class="dus liten">Laster …</p></div>
    </section>

    ${messages.length ? `
    <section class="kort assistent" aria-label="Treningsassistent">
      ${messages.map((m) => `<p class="assistent-melding"><span aria-hidden="true">${m.icon}</span> ${esc(m.text)}</p>`).join('')}
    </section>` : ''}

    <section class="kort" aria-label="Bevegelsesbalanse siste 7 dager">
      <h2 class="kort-tittel">Siste 7 dager</h2>
      ${balanceBars(store.KATEGORIER.map((k) => ({ category: k, name: k.name, count: balance.counts.get(k.id) || 0 })))}
      ${balance.missing.length && sets.length ? `<p class="dus liten">Mangler: ${balance.missing.map((k) => esc(k.name)).join(', ')}</p>` : ''}
      ${aerobMin > 0 ? `<p class="dus liten aerob-oppsummert"><img src="${store.AEROB_ICON}" class="knapp-ikon" alt="" aria-hidden="true"> ${aerobMin} min aerob</p>` : ''}
      ${sleepSum ? `<p class="dus liten sovn-oppsummert">😴 Snitt ${fmtSleepHours(sleepSum.avgHours)} søvn (${sleepSum.nights} netter)</p>` : ''}
      ${moodSum ? `<p class="dus liten mood-oppsummert">🙂 Snitt ${moodSum.avgValue}/100 dagsform (${moodSum.count} registrering${moodSum.count === 1 ? '' : 'er'})</p>` : ''}
    </section>
  `;

  const chartHost = container.querySelector('#momentum-graf');
  if (chartHost) {
    momentumChart(chartHost, momentumSeriesLabels(momentum.series));
  }

  await mountHomeNutrition(container);
}
