/**
 * momentum-guide.js – forklaring av momentum-score (bunn-ark fra hjem).
 */

import { PILLAR_WEIGHTS } from './momentum.js';
function pctWeight(key) {
  return Math.round((PILLAR_WEIGHTS[key] ?? 0) * 100);
}

let guideOpen = false;

function momentumGuideHtml() {
  const wStrength = pctWeight('strength');
  const wProtein = pctWeight('protein');
  const wSleep = pctWeight('sleep');
  const wAerobic = pctWeight('aerobic');
  const wLactate = pctWeight('lactate');

  return `
    <div class="ark-bakgrunn" data-lukk tabindex="-1"></div>
    <div class="ark momentum-guide-ark" id="momentum-guide-ark" role="dialog" aria-labelledby="momentum-guide-tittel">
      <div class="ark-hode">
        <h2 id="momentum-guide-tittel">Slik fungerer momentum</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <div class="momentum-guide-innhold">
        <p class="momentum-guide-intro">
          Tallet er et glidende bilde av de siste <strong>21 dagene</strong>. Nyere dager teller mer.
          Kurven er litt utjevnet, så den hopper ikke for hver enkelt logging.
        </p>

        <h3 class="momentum-guide-del">Fem faktorer i dag</h3>
        <ul class="momentum-guide-liste momentum-guide-vekter">
          <li><strong>Styrketrening</strong> — ${wStrength} % av dagscore</li>
          <li><strong>Protein</strong> — ${wProtein} %</li>
          <li><strong>Søvn</strong> — ${wSleep} %</li>
          <li><strong>Aerob</strong> — ${wAerobic} %</li>
          <li><strong>Anaerob (laktat)</strong> — ${wLactate} %</li>
        </ul>

        <h3 class="momentum-guide-del">Maksimalt utbytte per faktor</h3>

        <section class="momentum-guide-seksjon">
          <h4>Styrketrening</h4>
          <p>
            Ser på siste 7 dager for hver av syv hovedkategorier (push/pull, knebøy, hoftehengsel, core).
            Valgfri tilleggsøvelse teller ikke. Per kategori beregnes to ting som ganges (0–100 % hver):
            hvor mange distinkte treningsdager i vinduet, og mellomrom mellom dem når det er mer enn én dag.
          </p>
          <ul class="momentum-guide-liste">
            <li><strong>Frekvens:</strong> 1 dag 75 %, 2 dager 92 %, 3+ dager 100 % (ingen ekstra over 3).</li>
            <li><strong>Mellomrom (samme kategori):</strong> dagen etter eller annenhver dag trekker ned.</li>
            <li><strong>Praksis:</strong> sikt mot 2–3 distinkte treningsdager per kategori i løpet av 7 dager.</li>
            <li>Styrke-faktoren er snitt over alle syv kategorier.</li>
          </ul>
        </section>

        <section class="momentum-guide-seksjon">
          <h4>Protein</h4>
          <p>Kun <strong>i dag</strong>. Opp til 100 % når du når daglig proteinmål (innstillinger). Over mål gir ikke ekstra.</p>
        </section>

        <section class="momentum-guide-seksjon">
          <h4>Søvn</h4>
          <p>Kun <strong>den dagen</strong> du logger. Timer delt på søvnmål, opp til 100 %. Ingen logging = 0 den dagen.</p>
        </section>

        <section class="momentum-guide-seksjon">
          <h4>Aerob</h4>
          <p>Beste økt i dag teller. Grunnnivå ved én logging; mer ved ca. 20+ og 40+ minutter og høyere intensitet.</p>
        </section>

        <section class="momentum-guide-seksjon">
          <h4>Anaerob</h4>
          <p>Ja/nei per dag når kroppen har produsert mer laktat (f.eks. intervall). Liten andel av total score.</p>
        </section>

        <h3 class="momentum-guide-del">Lavthengende frukt</h3>
        <ul class="momentum-guide-liste">
          <li>Logg <strong>protein mot mål</strong> og <strong>søvn</strong> — stor effekt hver dag.</li>
          <li>Én <strong>aerob</strong> økt gir merkbart selv om den er kort.</li>
          <li>Fyll hull: kategorier du sjelden trener trekker snittet ned.</li>
        </ul>

        <h3 class="momentum-guide-del">Mindre uttelling</h3>
        <ul class="momentum-guide-liste">
          <li>Anaerob alene (${wLactate} %), ekstra aerob-økter samme dag, valgfri styrke.</li>
          <li>Flere sett samme dag samme kategori — teller som én treningsdag; RIR/volum påvirker ikke momentum.</li>
          <li>«Hero-økt» i dag uten plan resten av uka — styrke bygges over 7 dager.</li>
        </ul>

        <p class="dus liten momentum-guide-fotnote">
          Hold jevn styrke-rytme og daglige vaner for høyest momentum over tid.
        </p>
      </div>
    </div>`;
}

/**
 * @param {HTMLElement} host Tom container (f.eks. #momentum-guide-host)
 * @param {{ onClose?: () => void }} [opts]
 */
export function openMomentumGuide(host, opts = {}) {
  if (!host) return;
  guideOpen = true;
  host.innerHTML = momentumGuideHtml();

  const close = () => {
    guideOpen = false;
    host.innerHTML = '';
    opts.onClose?.();
  };

  host.querySelectorAll('[data-lukk]').forEach((el) => {
    el.addEventListener('click', close);
  });

  host.querySelector('.momentum-guide-ark')?.focus?.();
}

/** @param {HTMLElement} host */
export function closeMomentumGuide(host) {
  guideOpen = false;
  if (host?.innerHTML) host.innerHTML = '';
}

/** Om momentum-forklaringen var åpen før bakgrunns-oppdatering av hjem. */
export function isMomentumGuideOpen() {
  return guideOpen;
}
