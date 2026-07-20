/**
 * views/log-hub.js – oversikt over daglig logging (ikke styrkesett).
 */

import * as store from '../store.js';

export async function render(container) {
  container.innerHTML = `
    <header class="side-topp">
      <a href="#/hjem" class="tilbake" aria-label="Tilbake til hjem">‹</a>
      <div>
        <h1>Logging</h1>
        <p class="dus">Daglige registreringer</p>
      </div>
    </header>

    <nav class="hub-meny" aria-label="Logging">
      <a href="#/inntak" class="hub-lenke">
        <span class="hub-lenke-ikon" aria-hidden="true">🍳</span>
        <span class="hub-lenke-tekst">
          <strong>Inntak</strong>
          <span class="dus liten">Protein og karbohydrater</span>
        </span>
        <span class="hub-lenke-pil" aria-hidden="true">›</span>
      </a>
      <a href="#/kroppsvekt" class="hub-lenke">
        <span class="hub-lenke-ikon" aria-hidden="true">⚖️</span>
        <span class="hub-lenke-tekst">
          <strong>Kroppsvekt</strong>
          <span class="dus liten">Vekt og fettprosent</span>
        </span>
        <span class="hub-lenke-pil" aria-hidden="true">›</span>
      </a>
      <a href="#/aerob" class="hub-lenke">
        <span class="hub-lenke-ikon hub-lenke-ikon--bilde" aria-hidden="true">
          <img src="${store.AEROB_ICON}" class="knapp-ikon" alt="">
        </span>
        <span class="hub-lenke-tekst">
          <strong>Aerob</strong>
          <span class="dus liten">Varighet og intensitet</span>
        </span>
        <span class="hub-lenke-pil" aria-hidden="true">›</span>
      </a>
      <a href="#/anaerob" class="hub-lenke">
        <span class="hub-lenke-ikon" aria-hidden="true">⚡</span>
        <span class="hub-lenke-tekst">
          <strong>Anaerob</strong>
          <span class="dus liten">Melkesyre / laktat</span>
        </span>
        <span class="hub-lenke-pil" aria-hidden="true">›</span>
      </a>
      <a href="#/sovn" class="hub-lenke">
        <span class="hub-lenke-ikon" aria-hidden="true">😴</span>
        <span class="hub-lenke-tekst">
          <strong>Søvn</strong>
          <span class="dus liten">Timer og kvalitet</span>
        </span>
        <span class="hub-lenke-pil" aria-hidden="true">›</span>
      </a>
      <a href="#/folelse" class="hub-lenke">
        <span class="hub-lenke-ikon" aria-hidden="true">🙂</span>
        <span class="hub-lenke-tekst">
          <strong>Dagsform</strong>
          <span class="dus liten">Hvordan du føler deg</span>
        </span>
        <span class="hub-lenke-pil" aria-hidden="true">›</span>
      </a>
    </nav>
  `;
}
