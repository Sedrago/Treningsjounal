/**
 * views/home.js – hjem: momentum, faktorer, valgfri karbo-linje og innsikt/innstillinger.
 */

import * as store from '../store.js';
import * as api from '../api.js';
import * as sync from '../sync.js';
import { computeMomentum } from '../momentum.js';
import { buildHomeInfoRotation } from '../home-insight.js';
import { momentumChart } from '../charts.js';
import { renderHomeCarbsLineHtml } from '../nutrition-ui.js';
import {
  buildMomentumOverlays,
  hasUnreadPartnerSync,
  listPartnersForDisplay,
  loadPartnerMomentumState,
  loadPartnerUsernames,
  markPartnerSyncSeen,
  savePartnerMomentumState,
  syncPartnerMomentum,
} from '../partner-momentum.js';
import {
  esc, formatDateLong, todayStr, weekdayShort,
} from '../utils.js';

function momentumSeriesLabels(series) {
  return series.map((p, i, arr) => {
    if (i === arr.length - 1) return { ...p, label: 'i dag' };
    if (i === 0) return { ...p, label: weekdayShort(p.date) };
    if (i === arr.length - 8) return { ...p, label: '7d' };
    return { ...p, label: '' };
  });
}

function momentumChangeHtml(change) {
  if (change == null || change === 0) return '<p class="momentum-endring dus">Uendret siden i går</p>';
  const sign = change > 0 ? '+' : '';
  const cls = change > 0 ? 'momentum-endring--opp' : 'momentum-endring--ned';
  return `<p class="momentum-endring ${cls}">${sign}${change} siden i går</p>`;
}

function renderMomentumFactors(factors) {
  return `
    <ul class="momentum-faktorer" aria-label="Faktorer i dag">
      ${factors.map((f) => `
        <li>
          <a href="${esc(f.href)}" class="momentum-faktor">
            <span class="momentum-faktor-hode">
              <span class="momentum-faktor-navn">${esc(f.label)}</span>
              <span class="momentum-faktor-status dus">${esc(f.status)}</span>
            </span>
            <span class="momentum-faktor-spor" role="presentation">
              <span class="momentum-faktor-bar" style="width:${f.pct}%"></span>
            </span>
            <span class="momentum-faktor-pil" aria-hidden="true">›</span>
          </a>
        </li>`).join('')}
    </ul>`;
}

function insightSlideInnerHtml(slide) {
  const inner = esc(slide.text);
  if (slide.href) {
    return `<a href="${esc(slide.href)}" class="hjem-info-lenke">${inner}</a>`;
  }
  return inner;
}

function renderHomeInsightRotatorPlaceholder() {
  return `<p class="hjem-info hjem-info--rotator" id="hjem-info-rotator" aria-live="polite"></p>`;
}

function mountHomeInsightRotator(container, slides) {
  const host = container.querySelector('#hjem-info-rotator');
  if (!host || !slides.length) {
    if (host) host.remove();
    return;
  }

  let idx = 0;
  const show = () => {
    host.innerHTML = insightSlideInnerHtml(slides[idx % slides.length]);
    idx = (idx + 1) % slides.length;
  };

  show();
  if (slides.length <= 1) return;

  container._homeInfoTimer = setInterval(show, 10_000);
}

function clearHomeInsightRotator(container) {
  if (container._homeInfoTimer) {
    clearInterval(container._homeInfoTimer);
    container._homeInfoTimer = null;
  }
}

function renderPartnerVennerButton(show, unread) {
  if (!show) return '';
  const cls = unread ? ' momentum-venner-knapp--ny' : '';
  return `
    <button type="button" class="momentum-venner-knapp${cls}" id="momentum-venner"
      aria-label="Partnere på momentum-grafen" aria-expanded="false" aria-controls="momentum-venner-panel">
      <span class="momentum-venner-bokstav" aria-hidden="true">V</span>
    </button>`;
}

function renderPartnerPanel(partners, state) {
  if (!partners.length) return '';
  const open = state.panelOpen;
  return `
    <div id="momentum-venner-panel" class="momentum-venner-panel${open ? '' : ' skjult'}"
      ${open ? '' : 'hidden'} aria-label="Partnergrafer">
      <label class="momentum-venner-valg">
        <input type="checkbox" id="momentum-venner-default" ${state.showByDefault ? 'checked' : ''}>
        Vis valgte partnere på grafen som standard
      </label>
      <p class="dus liten momentum-venner-hint">Kun momentum-kurven deles — ikke detaljer i loggingen.</p>
      <ul class="momentum-venner-legend">
        ${partners.map((p) => `
          <li>
            <label class="momentum-venner-legend-rad">
              <input type="checkbox" class="momentum-venner-vis" data-partner="${esc(p.username)}"
                ${p.visible ? 'checked' : ''}>
              <span class="momentum-venner-prikk" style="--partner-farge: ${esc(p.color)}"></span>
              <span class="momentum-venner-navn">@${esc(p.label)}</span>
            </label>
          </li>`).join('')}
      </ul>
    </div>`;
}

function paintMomentumChart(container, labeledSeries, state, partners) {
  const chartHost = container.querySelector('#momentum-graf');
  if (!chartHost) return;
  const { points, overlays } = buildMomentumOverlays(labeledSeries, state, partners);
  momentumChart(chartHost, points, { overlays });
}

function mountPartnerMomentumUi(container, labeledSeries, initialState, partnerUsernames) {
  const partners = listPartnersForDisplay(initialState, partnerUsernames);
  let state = { ...initialState };

  const persist = () => savePartnerMomentumState(state);

  const refreshChart = () => {
    paintMomentumChart(container, labeledSeries, state, listPartnersForDisplay(state, partnerUsernames));
  };

  const vennerBtn = container.querySelector('#momentum-venner');
  const panel = container.querySelector('#momentum-venner-panel');

  const setPanelOpen = (open) => {
    state = { ...state, panelOpen: open };
    if (open) {
      state = markPartnerSyncSeen(state);
      vennerBtn?.classList.remove('momentum-venner-knapp--ny');
    }
    persist();
    if (panel) {
      panel.classList.toggle('skjult', !open);
      panel.hidden = !open;
    }
    vennerBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
    refreshChart();
  };

  vennerBtn?.addEventListener('click', () => {
    setPanelOpen(!state.panelOpen);
  });

  container.querySelector('#momentum-venner-default')?.addEventListener('change', (e) => {
    state = { ...state, showByDefault: e.target.checked };
    persist();
    refreshChart();
  });

  container.querySelectorAll('.momentum-venner-vis').forEach((input) => {
    input.addEventListener('change', () => {
      const u = input.dataset.partner;
      if (!u) return;
      state = {
        ...state,
        visible: { ...state.visible, [u]: input.checked },
      };
      persist();
      refreshChart();
    });
  });

  refreshChart();
}

export async function render(container) {
  clearHomeInsightRotator(container);

  const [
    sets,
    aerobic,
    sleepRows,
    foodIntakes,
    lactate,
    nutritionSummary,
  ] = await Promise.all([
    store.getEnrichedSets(),
    store.getAerobicSessions(),
    store.getSleepEntries(),
    store.getAllFoodIntakes(),
    store.getLactateEntries(),
    store.getDailyNutritionSummary(todayStr()),
  ]);

  const momentum = computeMomentum({
    sets,
    foodIntakes,
    sleep: sleepRows,
    aerobic,
    lactate,
  });

  const infoSlides = buildHomeInfoRotation({
    sets,
    pillars: momentum.pillarsToday,
    proteinG: momentum.proteinG,
    proteinGoal: momentum.proteinGoal,
    momentumToday: momentum.today,
    momentumChange: momentum.change,
    series: momentum.series,
    apiConfigured: api.isConfigured(),
    syncState: sync.state,
  });

  const labeledSeries = momentumSeriesLabels(momentum.series);

  let partnerState = loadPartnerMomentumState();
  let partnerUsernames = [];
  try {
    const synced = await syncPartnerMomentum(momentum.series);
    partnerState = synced.state;
    partnerUsernames = synced.partnerUsernames;
  } catch (err) {
    console.warn('[FlowBooster] Partner momentum:', err);
    partnerState = loadPartnerMomentumState();
    try {
      partnerUsernames = await loadPartnerUsernames();
    } catch {
      partnerUsernames = Object.keys(partnerState.cache || {});
    }
  }

  const partnersForUi = listPartnersForDisplay(partnerState, partnerUsernames);
  const showVennerBtn = partnerUsernames.length > 0;
  const vennerUnread = hasUnreadPartnerSync(partnerState);

  container.innerHTML = `
    <h1 class="sr-only">FlowBooster</h1>
    <header class="hjem-topp">
      <p class="dato">${formatDateLong(todayStr())}</p>
    </header>

    <section class="kort momentum-kort" aria-label="Momentum">
      <div class="momentum-hode">
        <div>
          <h2 class="momentum-tittel">Momentum</h2>
          ${momentumChangeHtml(momentum.change)}
        </div>
        <div class="momentum-hode-hoyre">
          ${renderPartnerVennerButton(showVennerBtn, vennerUnread)}
          <p class="momentum-verdi" aria-live="polite">${momentum.today}</p>
        </div>
      </div>
      <div id="momentum-graf" class="momentum-graf-wrap"></div>
      ${renderPartnerPanel(partnersForUi, partnerState)}
      ${renderMomentumFactors(momentum.factors)}
      ${renderHomeCarbsLineHtml(nutritionSummary)}
    </section>

    ${renderHomeInsightRotatorPlaceholder()}

    <nav class="hjem-hovednav hjem-hovednav--to" aria-label="Hovednavigasjon">
      <a href="#/innsikt" class="hjem-hovednav-kort">
        <span class="hjem-hovednav-ikon" aria-hidden="true">📊</span>
        <span class="hjem-hovednav-navn">Innsikt</span>
      </a>
      <a href="#/innstillinger" class="hjem-hovednav-kort">
        <span class="hjem-hovednav-ikon" aria-hidden="true">⚙️</span>
        <span class="hjem-hovednav-navn">Innstillinger</span>
      </a>
    </nav>
  `;

  mountPartnerMomentumUi(container, labeledSeries, partnerState, partnerUsernames);
  mountHomeInsightRotator(container, infoSlides);
}
