/**
 * views/sleep.js – logging av søvn (timer og minutter, valgfri kvalitet).
 */

import * as store from '../store.js';
import { sleepSummarySince } from '../stats.js';
import { mountSleepDurationPicker, mountPillRow } from '../pickers.js';
import {
  esc, formatDateShort, todayStr, toast, windowStartStr,
  fmtSleepHours, sleepHoursFromParts,
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
      Snitt ${fmtSleepHours(summary.avgHours)}/natt siste 7 dager
      (${summary.nights} netter${summary.avgQuality != null ? ` · kvalitet ${summary.avgQuality}/5` : ''})
    </p>` : ''}

    <form class="kort" id="sovn-skjema" aria-label="Ny søvnregistrering">
      <p class="dus liten">Dato = morgenen du våknet.</p>
      <div class="felt">
        <label class="felt-navn" for="sl-dato">Dato</label>
        <input type="date" class="inndata inndata-dato" id="sl-dato" value="${todayStr()}" required>
      </div>
      <div id="sovn-varighet"></div>
      <div id="sovn-kvalitet" class="sovn-kvalitet-pills"></div>
      <label class="felt-navn" for="sl-kommentar">Kommentar <span class="dus">(valgfritt)</span></label>
      <input type="text" class="inndata" id="sl-kommentar" placeholder="F.eks. våknet én gang …">
      <button type="submit" class="knapp primaer bred">Lagre</button>
    </form>

    <div id="sovn-liste">
      ${rows.map((s) => `
        <div class="kort sovn-rad" data-id="${s.id}">
          <div>
            <strong>${fmtSleepHours(s.hours)}</strong>
            <span class="dus"> · ${formatDateShort(s.date)}</span>
            ${s.quality != null ? `<span class="dus"> · ${esc(store.sleepQualityLabel(s.quality))}</span>` : ''}
            ${s.comment ? `<p class="dus liten">«${esc(s.comment)}»</p>` : ''}
          </div>
          <button type="button" class="ikon-knapp" data-slett="${s.id}" aria-label="Slett registrering">✕</button>
        </div>`).join('') || '<p class="tomt">Ingen søvn logget ennå.</p>'}
    </div>
  `;

  const durationPicker = mountSleepDurationPicker(container.querySelector('#sovn-varighet'));

  let quality = null;
  mountPillRow(container.querySelector('#sovn-kvalitet'), {
    label: 'Kvalitet (valgfritt)',
    options: store.SLEEP_QUALITY.map((q) => ({ value: q.value, label: q.name })),
    value: null,
    onChange: (v) => { quality = v; },
  });

  const dateInput = container.querySelector('#sl-dato');
  dateInput.addEventListener('change', () => {
    requestAnimationFrame(() => dateInput.blur());
  });

  container.querySelector('#sovn-skjema').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { hours, minutes } = durationPicker.getValue();
    if (hours <= 0 && minutes <= 0) return;
    await store.saveSleepEntry({
      date: dateInput.value,
      hours: sleepHoursFromParts(hours, minutes),
      quality,
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
