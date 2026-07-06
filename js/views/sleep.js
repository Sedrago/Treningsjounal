/**
 * views/sleep.js – logging av søvn (timer og valgfri kvalitet).
 */

import * as store from '../store.js';
import { sleepSummarySince } from '../stats.js';
import {
  esc, fmtNum, formatDateShort, todayStr, toast, windowStartStr,
} from '../utils.js';

export async function render(container) {
  const rows = await store.getSleepEntries();
  const since = windowStartStr(7);
  const summary = sleepSummarySince(rows, since);

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/hjem" class="tilbake" aria-label="Tilbake til hjem">‹</a>
      <h1>Søvn</h1>
    </header>

    ${summary ? `
    <p class="dus sovn-oppsummert">
      Snitt ${fmtNum(summary.avgHours, 1)} t/natt siste 7 dager
      (${summary.nights} netter${summary.avgQuality != null ? ` · kvalitet ${fmtNum(summary.avgQuality, 1)}/5` : ''})
    </p>` : ''}

    <form class="kort" id="sovn-skjema" aria-label="Ny søvnregistrering">
      <p class="dus liten">Dato = morgenen du våknet.</p>
      <div class="skjema-rad">
        <div class="felt">
          <label class="felt-navn" for="sl-dato">Dato</label>
          <input type="date" class="inndata" id="sl-dato" value="${todayStr()}" required>
        </div>
        <div class="felt">
          <label class="felt-navn" for="sl-timer">Timer</label>
          <input type="number" inputmode="decimal" step="0.5" min="0" max="24"
            class="inndata" id="sl-timer" required placeholder="7.5">
        </div>
      </div>
      <label class="felt-navn" for="sl-kvalitet">Kvalitet <span class="dus">(valgfritt)</span></label>
      <select class="inndata" id="sl-kvalitet">
        <option value="">Ikke registrert</option>
        ${store.SLEEP_QUALITY.map((q) => `<option value="${q.value}">${q.name}</option>`).join('')}
      </select>
      <label class="felt-navn" for="sl-kommentar">Kommentar <span class="dus">(valgfritt)</span></label>
      <input type="text" class="inndata" id="sl-kommentar" placeholder="F.eks. våknet én gang …">
      <button type="submit" class="knapp primaer bred">Lagre</button>
    </form>

    <div id="sovn-liste">
      ${rows.map((s) => `
        <div class="kort sovn-rad" data-id="${s.id}">
          <div>
            <strong>${fmtNum(s.hours, 1)} t</strong>
            <span class="dus"> · ${formatDateShort(s.date)}</span>
            ${s.quality != null ? `<span class="dus"> · ${esc(store.sleepQualityLabel(s.quality))}</span>` : ''}
            ${s.comment ? `<p class="dus liten">«${esc(s.comment)}»</p>` : ''}
          </div>
          <button type="button" class="ikon-knapp" data-slett="${s.id}" aria-label="Slett registrering">✕</button>
        </div>`).join('') || '<p class="tomt">Ingen søvn logget ennå.</p>'}
    </div>
  `;

  container.querySelector('#sovn-skjema').addEventListener('submit', async (e) => {
    e.preventDefault();
    const hours = parseFloat(container.querySelector('#sl-timer').value.replace(',', '.'));
    if (Number.isNaN(hours) || hours <= 0) return;
    const qRaw = container.querySelector('#sl-kvalitet').value;
    await store.saveSleepEntry({
      date: container.querySelector('#sl-dato').value,
      hours,
      quality: qRaw === '' ? null : qRaw,
      comment: container.querySelector('#sl-kommentar').value.trim(),
    });
    toast('Søvn lagret', 'suksess');
    render(container);
  });

  container.querySelectorAll('[data-slett]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Slette denne registreringen?')) return;
      await store.deleteSleepEntry(btn.dataset.slett);
      render(container);
    });
  });
}
