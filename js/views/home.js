/**
 * views/home.js – hjemskjermen med nøkkeltall, assistent og navigasjon.
 */

import * as store from '../store.js';
import { getMessages, nextRecommendedCategory, weeklyBalance } from '../assistant.js';
import { daysThisWeek, weekStreak, workoutDates } from '../stats.js';
import { balanceBars } from '../charts.js';
import { esc, formatDateLong, relativeDays, startOfWeek, todayStr } from '../utils.js';

export async function render(container) {
  const sets = await store.getEnrichedSets();
  const dates = workoutDates(sets);
  const lastDate = dates[dates.length - 1] || null;
  const streak = weekStreak(sets);
  const thisWeek = daysThisWeek(sets);
  const messages = getMessages(sets);
  const next = nextRecommendedCategory(sets);
  const balance = weeklyBalance(sets, todayStr(startOfWeek(new Date())));

  container.innerHTML = `
    <header class="hjem-topp">
      <p class="dato">${formatDateLong(todayStr())}</p>
      <h1 class="app-tittel">Treningsjournal</h1>
      <div class="nokkeltal" role="list">
        <div class="nokkel" role="listitem">
          <span class="nokkel-verdi">${lastDate ? relativeDays(lastDate) : '–'}</span>
          <span class="nokkel-navn">Siste økt</span>
        </div>
        <div class="nokkel" role="listitem">
          <span class="nokkel-verdi">${thisWeek}</span>
          <span class="nokkel-navn">Dager denne uken</span>
        </div>
        <div class="nokkel" role="listitem">
          <span class="nokkel-verdi">${streak} ${streak === 1 ? 'uke' : 'uker'}</span>
          <span class="nokkel-navn">Streak</span>
        </div>
      </div>
    </header>

    <a href="#/okt" class="knapp primaer stor" id="start-okt">Start dagens økt</a>

    ${messages.length ? `
    <section class="kort assistent" aria-label="Treningsassistent">
      ${messages.map((m) => `<p class="assistent-melding"><span aria-hidden="true">${m.icon}</span> ${esc(m.text)}</p>`).join('')}
    </section>` : ''}

    ${next ? `
    <section class="kort" aria-label="Anbefaling">
      <h2 class="kort-tittel">Neste anbefalte kategori</h2>
      <p class="anbefaling"><span aria-hidden="true">${next.category.icon}</span> ${esc(next.category.name)}
        ${next.days === null ? '<span class="dus">(aldri trent)</span>' : `<span class="dus">(${next.days} dager siden)</span>`}
      </p>
    </section>` : ''}

    <section class="kort" aria-label="Ukentlig bevegelsesbalanse">
      <h2 class="kort-tittel">Denne uken</h2>
      ${balanceBars(store.KATEGORIER.map((k) => ({ icon: k.icon, name: k.name, count: balance.counts.get(k.id) || 0 })))}
      ${balance.missing.length && sets.length ? `<p class="dus liten">Mangler: ${balance.missing.map((k) => esc(k.name)).join(', ')}</p>` : ''}
    </section>

    <nav class="hjem-meny" aria-label="Hovedmeny">
      <a href="#/historikk" class="meny-knapp"><span aria-hidden="true">📖</span>Historikk</a>
      <a href="#/statistikk" class="meny-knapp"><span aria-hidden="true">📊</span>Statistikk</a>
      <a href="#/ovelser" class="meny-knapp"><span aria-hidden="true">🏷️</span>Øvelser</a>
      <a href="#/kroppsvekt" class="meny-knapp"><span aria-hidden="true">⚖️</span>Kroppsvekt</a>
      <a href="#/innstillinger" class="meny-knapp"><span aria-hidden="true">⚙️</span>Innstillinger</a>
    </nav>
  `;
}
