/**
 * views/strength-hub.js – oversikt over styrketrening (plan, historikk, øvelser).
 */

import { homeStrengthLabel } from './strength.js';
import { esc, formatDateLong, todayStr } from '../utils.js';

export async function render(container) {
  const styrke = await homeStrengthLabel();

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/hjem" class="tilbake" aria-label="Tilbake til hjem">‹</a>
      <div>
        <h1>Styrketrening</h1>
        <p class="dus">${formatDateLong(todayStr())}</p>
      </div>
    </header>

    <a href="#/styrke" class="knapp primaer stor hub-primaer">${esc(styrke.title)}</a>
    <p class="dus liten hub-primaer-sub">${esc(styrke.sub)}</p>

    <nav class="hub-meny" aria-label="Styrketrening">
      <a href="#/programmer" class="hub-lenke">
        <span class="hub-lenke-ikon" aria-hidden="true">📋</span>
        <span class="hub-lenke-tekst">
          <strong>Programmer</strong>
          <span class="dus liten">Maler og planer</span>
        </span>
        <span class="hub-lenke-pil" aria-hidden="true">›</span>
      </a>
      <a href="#/kalender" class="hub-lenke">
        <span class="hub-lenke-ikon" aria-hidden="true">📅</span>
        <span class="hub-lenke-tekst">
          <strong>Kalender</strong>
          <span class="dus liten">Planlegg periode</span>
        </span>
        <span class="hub-lenke-pil" aria-hidden="true">›</span>
      </a>
      <a href="#/historikk" class="hub-lenke">
        <span class="hub-lenke-ikon" aria-hidden="true">📖</span>
        <span class="hub-lenke-tekst">
          <strong>Historikk</strong>
          <span class="dus liten">Tidligere økter</span>
        </span>
        <span class="hub-lenke-pil" aria-hidden="true">›</span>
      </a>
      <a href="#/ovelser" class="hub-lenke">
        <span class="hub-lenke-ikon" aria-hidden="true">🏷️</span>
        <span class="hub-lenke-tekst">
          <strong>Øvelser</strong>
          <span class="dus liten">Bibliotek og egne øvelser</span>
        </span>
        <span class="hub-lenke-pil" aria-hidden="true">›</span>
      </a>
    </nav>
  `;
}
