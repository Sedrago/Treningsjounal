/**
 * views/sleep.js – logging av søvn (timer og minutter, valgfri kvalitet).
 */

import * as store from '../store.js';
import { sleepSummarySince } from '../stats.js';
import {
  esc, formatDateShort, todayStr, toast, windowStartStr,
  fmtSleepHours, sleepHoursFromParts,
} from '../utils.js';

function bindStepper(root, { get, set, min, max, step = 1 }) {
  const valEl = root.querySelector('.sovn-teller-verdi');
  const decBtn = root.querySelector('[data-delta="-1"]');
  const incBtn = root.querySelector('[data-delta="1"]');

  const sync = () => {
    valEl.textContent = String(get());
    decBtn.disabled = get() <= min;
    incBtn.disabled = get() >= max;
  };

  root.querySelectorAll('.sovn-teller-knapp').forEach((btn) => {
    btn.addEventListener('click', () => {
      const delta = Number(btn.dataset.delta) * step;
      const next = Math.max(min, Math.min(max, get() + delta));
      if (next === get()) return;
      set(next);
      sync();
    });
  });

  sync();
}

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
      <div class="sovn-varighet-rad">
        <div class="sovn-varighet-felt">
          <p class="pill-etikett verdi-stripe-etikett">Timer</p>
          <div class="sovn-teller" id="sovn-timer">
            <button type="button" class="sovn-teller-knapp" data-delta="-1" aria-label="Timer mindre">−</button>
            <span class="sovn-teller-verdi" aria-live="polite">7</span>
            <button type="button" class="sovn-teller-knapp" data-delta="1" aria-label="Timer mer">+</button>
          </div>
        </div>
        <div class="sovn-varighet-felt">
          <p class="pill-etikett verdi-stripe-etikett">Minutter</p>
          <div class="sovn-teller" id="sovn-minutter">
            <button type="button" class="sovn-teller-knapp" data-delta="-1" aria-label="Minutter mindre">−</button>
            <span class="sovn-teller-verdi" aria-live="polite">30</span>
            <button type="button" class="sovn-teller-knapp" data-delta="1" aria-label="Minutter mer">+</button>
          </div>
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
            <strong>${fmtSleepHours(s.hours)}</strong>
            <span class="dus"> · ${formatDateShort(s.date)}</span>
            ${s.quality != null ? `<span class="dus"> · ${esc(store.sleepQualityLabel(s.quality))}</span>` : ''}
            ${s.comment ? `<p class="dus liten">«${esc(s.comment)}»</p>` : ''}
          </div>
          <button type="button" class="ikon-knapp" data-slett="${s.id}" aria-label="Slett registrering">✕</button>
        </div>`).join('') || '<p class="tomt">Ingen søvn logget ennå.</p>'}
    </div>
  `;

  let hours = 7;
  let minutes = 30;

  bindStepper(container.querySelector('#sovn-timer'), {
    get: () => hours,
    set: (v) => { hours = v; },
    min: 0,
    max: 14,
  });

  bindStepper(container.querySelector('#sovn-minutter'), {
    get: () => minutes,
    set: (v) => { minutes = v; },
    min: 0,
    max: 59,
  });

  container.querySelector('#sovn-skjema').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (hours <= 0 && minutes <= 0) return;
    const qRaw = container.querySelector('#sl-kvalitet').value;
    await store.saveSleepEntry({
      date: container.querySelector('#sl-dato').value,
      hours: sleepHoursFromParts(hours, minutes),
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
