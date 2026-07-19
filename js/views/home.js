/**
 * views/home.js – hjemskjermen med nøkkeltall, assistent og navigasjon.
 */

import * as store from '../store.js';
import { getMessages, nextRecommendedCategory, balanceSince } from '../assistant.js';
import { daysLast7Days, trainingStreak, aerobicMinutesSince, sleepSummarySince, moodSummarySince } from '../stats.js';
import { balanceBars } from '../charts.js';
import { homeStrengthLabel } from './strength.js';
import { esc, formatDateLong, relativeDays, todayStr, windowStartStr, categoryIconHtml, fmtSleepHours } from '../utils.js';

export async function render(container) {
  const sets = await store.getEnrichedSets();
  const aerobic = await store.getAerobicSessions();
  const sleepRows = await store.getSleepEntries();
  const moodRows = await store.getMoodEntries();
  const dates = [...new Set(sets.map((s) => s.date))].sort();
  const lastDate = dates[dates.length - 1] || null;
  const streakMode = store.getSetting('streakMode');
  const streak = trainingStreak(sets, streakMode);
  const last7Days = daysLast7Days(sets);
  const since7 = windowStartStr(7);
  const messages = getMessages(sets);
  const next = nextRecommendedCategory(sets);
  const balance = balanceSince(sets, since7);
  const aerobMin = aerobicMinutesSince(aerobic, since7);
  const sleepSum = sleepSummarySince(sleepRows, since7);
  const moodSum = moodSummarySince(moodRows, since7);
  const styrke = await homeStrengthLabel();

  const streakLabel = streakMode === 'calendar'
    ? (streak === 1 ? 'uke' : 'uker')
    : (streak === 1 ? 'periode' : 'perioder');

  container.innerHTML = `
    <header class="hjem-topp">
      <p class="dato">${formatDateLong(todayStr())}</p>
      <h1 class="app-tittel">Treningsjournal</h1>
      <div class="nokkeltal" role="list">
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
    </header>

    <a href="#/styrke" class="knapp primaer stor" id="start-styrke">${esc(styrke.title)}</a>
    <p class="dus liten hjem-styrke-sub">${esc(styrke.sub)}</p>
    <div class="knapp-rad hjem-ekstra">
      <a href="#/aerob" class="knapp sekundaer"><img src="${store.AEROB_ICON}" class="knapp-ikon" alt="" aria-hidden="true"> Aerob</a>
      <a href="#/sovn" class="knapp sekundaer">😴 Søvn</a>
      <a href="#/folelse" class="knapp sekundaer">🙂 Dagsform</a>
    </div>

    ${messages.length ? `
    <section class="kort assistent" aria-label="Treningsassistent">
      ${messages.map((m) => `<p class="assistent-melding"><span aria-hidden="true">${m.icon}</span> ${esc(m.text)}</p>`).join('')}
    </section>` : ''}

    ${next ? `
    <section class="kort" aria-label="Anbefaling">
      <h2 class="kort-tittel">Neste anbefalte kategori</h2>
      <p class="anbefaling">${categoryIconHtml(next.category, 'kategori-ikon liten')} ${esc(next.category.name)}
        ${next.days === null ? '<span class="dus">(aldri trent)</span>' : `<span class="dus">(${next.days} dager siden)</span>`}
      </p>
    </section>` : ''}

    <section class="kort" aria-label="Bevegelsesbalanse siste 7 dager">
      <h2 class="kort-tittel">Siste 7 dager</h2>
      ${balanceBars(store.KATEGORIER.map((k) => ({ category: k, name: k.name, count: balance.counts.get(k.id) || 0 })))}
      ${balance.missing.length && sets.length ? `<p class="dus liten">Mangler: ${balance.missing.map((k) => esc(k.name)).join(', ')}</p>` : ''}
      ${aerobMin > 0 ? `<p class="dus liten aerob-oppsummert"><img src="${store.AEROB_ICON}" class="knapp-ikon" alt="" aria-hidden="true"> ${aerobMin} min aerob</p>` : ''}
      ${sleepSum ? `<p class="dus liten sovn-oppsummert">😴 Snitt ${fmtSleepHours(sleepSum.avgHours)} søvn (${sleepSum.nights} netter)</p>` : ''}
      ${moodSum ? `<p class="dus liten mood-oppsummert">🙂 Snitt ${moodSum.avgValue}/100 dagsform (${moodSum.count} registrering${moodSum.count === 1 ? '' : 'er'})</p>` : ''}
    </section>

    <nav class="hjem-meny" aria-label="Hovedmeny">
      <a href="#/programmer" class="meny-knapp"><span aria-hidden="true">📋</span>Programmer</a>
      <a href="#/kalender" class="meny-knapp"><span aria-hidden="true">📅</span>Kalender</a>
      <a href="#/historikk" class="meny-knapp"><span aria-hidden="true">📖</span>Historikk</a>
      <a href="#/statistikk" class="meny-knapp"><span aria-hidden="true">📊</span>Statistikk</a>
      <a href="#/ovelser" class="meny-knapp"><span aria-hidden="true">🏷️</span>Øvelser</a>
      <a href="#/kroppsvekt" class="meny-knapp"><span aria-hidden="true">⚖️</span>Kroppsvekt</a>
      <a href="#/innstillinger" class="meny-knapp"><span aria-hidden="true">⚙️</span>Innstillinger</a>
    </nav>
  `;
}
