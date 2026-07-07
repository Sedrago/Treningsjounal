/**
 * views/mood.js – logging og historikk for «Hvordan føler du deg?»
 */

import * as store from '../store.js';
import { moodSummarySince } from '../stats.js';
import { showMoodPromptManual } from '../mood-prompt.js';
import {
  esc, fmtNum, formatDateShort, todayStr, toast, windowStartStr,
} from '../utils.js';

function moodEmoji(value) {
  if (value >= 75) return '😊';
  if (value >= 50) return '🙂';
  if (value >= 25) return '😐';
  return '☹️';
}

function contextLabel(context) {
  switch (context) {
    case 'workout-start': return 'Før økt';
    case 'workout-end': return 'Etter økt';
    case 'manual': return 'Manuell';
    default: return '';
  }
}

export async function render(container) {
  const rows = await store.getMoodEntries();
  const since = windowStartStr(7);
  const summary = moodSummarySince(rows, since);

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/hjem" class="tilbake" aria-label="Tilbake til hjem">‹</a>
      <h1>Dagsform</h1>
    </header>

    ${summary ? `
    <p class="dus mood-oppsummert">
      Snitt ${fmtNum(summary.avgValue, 0)}/100 siste 7 dager
      (${summary.count} registrering${summary.count === 1 ? '' : 'er'})
    </p>` : ''}

    <button type="button" class="knapp primaer bred" id="mood-ny">Registrer nå</button>

    <div id="mood-liste">
      ${rows.map((m) => `
        <div class="kort mood-rad" data-id="${m.id}">
          <div>
            <strong aria-hidden="true">${moodEmoji(m.value)}</strong>
            <span class="dus"> · ${formatDateShort(m.date)}</span>
            ${m.context && m.context !== 'app' ? `<span class="dus"> · ${esc(contextLabel(m.context))}</span>` : ''}
          </div>
          <button type="button" class="ikon-knapp" data-slett="${m.id}" aria-label="Slett registrering">✕</button>
        </div>`).join('') || '<p class="tomt">Ingen registreringer ennå.</p>'}
    </div>
  `;

  container.querySelector('#mood-ny').addEventListener('click', async () => {
    const entry = await showMoodPromptManual();
    if (entry) {
      toast('Lagret', 'suksess');
      render(container);
    }
  });

  container.querySelectorAll('[data-slett]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Slette denne registreringen?')) return;
      await store.deleteMoodEntry(btn.dataset.slett);
      render(container);
    });
  });
}
