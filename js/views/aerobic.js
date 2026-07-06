/**
 * views/aerobic.js – logging av aerob trening (varighet i minutter).
 */

import * as store from '../store.js';
import { aerobicMinutesSince } from '../stats.js';
import {
  esc, formatDateShort, todayStr, toast, windowStartStr,
} from '../utils.js';

export async function render(container) {
  const rows = await store.getAerobicSessions();
  const since = windowStartStr(7);
  const minutes7 = aerobicMinutesSince(rows, since);

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/hjem" class="tilbake" aria-label="Tilbake til hjem">‹</a>
      <h1>Aerob trening</h1>
    </header>

    ${minutes7 > 0 ? `<p class="dus aerob-oppsummert">${minutes7} min siste 7 dager</p>` : ''}

    <form class="kort" id="aerob-skjema" aria-label="Ny aerob registrering">
      <div class="skjema-rad">
        <div class="felt">
          <label class="felt-navn" for="ae-dato">Dato</label>
          <input type="date" class="inndata" id="ae-dato" value="${todayStr()}" required>
        </div>
        <div class="felt">
          <label class="felt-navn" for="ae-min">Minutter</label>
          <input type="number" inputmode="numeric" class="inndata" id="ae-min" min="1" max="600" required placeholder="30">
        </div>
      </div>
      <label class="felt-navn" for="ae-type">Type</label>
      <select class="inndata" id="ae-type">
        ${store.AEROBIC_TYPES.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}
      </select>
      <label class="felt-navn" for="ae-kommentar">Kommentar <span class="dus">(valgfritt)</span></label>
      <input type="text" class="inndata" id="ae-kommentar" placeholder="F.eks. rolig joggetur …">
      <button type="submit" class="knapp primaer bred">Lagre</button>
    </form>

    <div id="aerob-liste">
      ${rows.map((a) => `
        <div class="kort aerob-rad" data-id="${a.id}">
          <div>
            <strong>${a.minutes} min</strong>
            <span class="dus"> · ${esc(store.aerobicTypeById(a.activity).name)} · ${formatDateShort(a.date)}</span>
            ${a.comment ? `<p class="dus liten">«${esc(a.comment)}»</p>` : ''}
          </div>
          <button type="button" class="ikon-knapp" data-slett="${a.id}" aria-label="Slett registrering">✕</button>
        </div>`).join('') || '<p class="tomt">Ingen aerob trening logget ennå.</p>'}
    </div>
  `;

  container.querySelector('#aerob-skjema').addEventListener('submit', async (e) => {
    e.preventDefault();
    const minutes = parseInt(container.querySelector('#ae-min').value, 10);
    if (!minutes || minutes < 1) return;
    await store.saveAerobicSession({
      date: container.querySelector('#ae-dato').value,
      minutes,
      activity: container.querySelector('#ae-type').value,
      comment: container.querySelector('#ae-kommentar').value.trim(),
    });
    toast('Aerob trening lagret', 'suksess');
    render(container);
  });

  container.querySelectorAll('[data-slett]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Slette denne registreringen?')) return;
      await store.deleteAerobicSession(btn.dataset.slett);
      render(container);
    });
  });
}
