/**
 * views/home.js – hjem: momentum, faktorer, valgfri karbo-linje og innsikt/innstillinger.
 */

import * as store from '../store.js';
import * as api from '../api.js';
import * as sync from '../sync.js';
import { computeMomentum } from '../momentum.js';
import { buildHomeInfoRotation } from '../home-insight.js';
import { openMomentumGuide, closeMomentumGuide, isMomentumGuideOpen } from '../momentum-guide.js';
import { momentumChart } from '../charts.js';
import { renderHomeCarbsLineHtml, renderHomeCaloriesLineHtml } from '../nutrition-ui.js';
import {
  buildMomentumOverlays,
  hasUnreadPartnerSync,
  listPartnersForDisplay,
  loadPartnerMomentumState,
  markPartnerSyncSeen,
  runPartnerMomentumSyncInBackground,
  savePartnerMomentumState,
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
  const cls = unread ? ' momentum-hode-knapp--venner--ny' : '';
  return `
    <button type="button" class="momentum-hode-knapp momentum-hode-knapp--venner${cls}" id="momentum-venner"
      aria-label="Partnere på momentum-grafen" aria-expanded="false" aria-controls="momentum-venner-panel">
      <span class="momentum-hode-knapp-bokstav" aria-hidden="true">V</span>
    </button>`;
}

function renderMomentumHeadButtons(showVenner, vennerUnread) {
  return `
    <div class="momentum-hode-knapper">
      <button type="button" class="momentum-hode-knapp momentum-hode-knapp--info" id="momentum-info"
        aria-label="Slik fungerer momentum" aria-expanded="false">
        <span class="momentum-hode-knapp-bokstav" aria-hidden="true">I</span>
      </button>
      ${renderPartnerVennerButton(showVenner, vennerUnread)}
    </div>`;
}

function mountMomentumGuideUi(container) {
  const infoBtn = container.querySelector('#momentum-info');
  const host = container.querySelector('#momentum-guide-host');
  if (!infoBtn || !host || infoBtn.dataset.bound) return;
  infoBtn.dataset.bound = '1';

  const setExpanded = (open) => {
    infoBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  infoBtn.addEventListener('click', () => {
    if (host.innerHTML) {
      closeMomentumGuide(host);
      setExpanded(false);
      return;
    }
    openMomentumGuide(host, {
      onClose: () => setExpanded(false),
    });
    setExpanded(true);
  });
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
              <span class="momentum-venner-poeng" aria-label="Momentum">${p.latestScore != null ? p.latestScore : '—'}</span>
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
  const ctx = {
    state: { ...initialState },
    partnerUsernames: [...partnerUsernames],
    labeledSeries,
  };

  const getPartners = () => listPartnersForDisplay(ctx.state, ctx.partnerUsernames);

  const persist = () => savePartnerMomentumState(ctx.state);

  const refreshChart = () => {
    paintMomentumChart(container, ctx.labeledSeries, ctx.state, getPartners());
  };

  const setPanelOpen = (open) => {
    ctx.state = { ...ctx.state, panelOpen: open };
    if (open) {
      ctx.state = markPartnerSyncSeen(ctx.state);
      container.querySelector('#momentum-venner')?.classList.remove('momentum-hode-knapp--venner--ny');
    }
    persist();
    const panel = container.querySelector('#momentum-venner-panel');
    if (panel) {
      panel.classList.toggle('skjult', !open);
      panel.hidden = !open;
    }
    container.querySelector('#momentum-venner')?.setAttribute('aria-expanded', open ? 'true' : 'false');
    refreshChart();
  };

  const bindVennerClick = () => {
    const vennerBtn = container.querySelector('#momentum-venner');
    if (!vennerBtn || vennerBtn.dataset.bound) return;
    vennerBtn.dataset.bound = '1';
    vennerBtn.addEventListener('click', () => setPanelOpen(!ctx.state.panelOpen));
  };

  const wirePanelInputs = () => {
    container.querySelector('#momentum-venner-default')?.addEventListener('change', (e) => {
      ctx.state = { ...ctx.state, showByDefault: e.target.checked };
      persist();
      refreshChart();
    });

    container.querySelectorAll('.momentum-venner-vis').forEach((input) => {
      input.addEventListener('change', () => {
        const u = input.dataset.partner;
        if (!u) return;
        ctx.state = {
          ...ctx.state,
          visible: { ...ctx.state.visible, [u]: input.checked },
        };
        persist();
        refreshChart();
      });
    });
  };

  function setPartnerData(state, usernames) {
    ctx.state = state;
    ctx.partnerUsernames = usernames;
    const partners = getPartners();
    const show = usernames.length > 0;
    const unread = hasUnreadPartnerSync(ctx.state);
    const knapper = container.querySelector('.momentum-hode-knapper');
    let btn = container.querySelector('#momentum-venner');

    if (!show) {
      btn?.remove();
      container.querySelector('#momentum-venner-panel')?.remove();
      refreshChart();
      return;
    }

    if (!btn && knapper) {
      knapper.insertAdjacentHTML('beforeend', renderPartnerVennerButton(true, unread));
      bindVennerClick();
      btn = container.querySelector('#momentum-venner');
    } else if (btn) {
      btn.classList.toggle('momentum-hode-knapp--venner--ny', unread);
    }

    container.querySelector('#momentum-venner-panel')?.remove();
    const panelHtml = renderPartnerPanel(partners, ctx.state);
    if (panelHtml) {
      container.querySelector('#momentum-graf')?.insertAdjacentHTML('afterend', panelHtml);
      wirePanelInputs();
    }
    btn?.setAttribute('aria-expanded', ctx.state.panelOpen ? 'true' : 'false');
    refreshChart();
  }

  bindVennerClick();
  wirePanelInputs();
  refreshChart();

  return { setPartnerData };
}

export async function render(container, params, query, options = {}) {
  clearHomeInsightRotator(container);
  const reopenGuide = Boolean(options.preserveMomentumGuide && isMomentumGuideOpen());
  if (!reopenGuide) {
    closeMomentumGuide(container.querySelector('#momentum-guide-host'));
  }

  const [
    sets,
    aerobic,
    sleepRows,
    foodIntakes,
    lactate,
    nutritionSummary,
    todayWorkout,
  ] = await Promise.all([
    store.getEnrichedSets(),
    store.getAerobicSessions(),
    store.getSleepEntries(),
    store.getAllFoodIntakes(),
    store.getLactateEntries(),
    store.getDailyNutritionSummary(todayStr()),
    store.getWorkoutByDate(todayStr()),
  ]);

  const momentum = computeMomentum({
    sets,
    foodIntakes,
    sleep: sleepRows,
    aerobic,
    lactate,
    strengthSessionCompletedToday: Boolean(todayWorkout?.sessionCompletedAt),
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

  const partnerState = loadPartnerMomentumState();
  const partnerUsernames = Object.keys(partnerState.cache || {});
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
        <div class="momentum-hode-venstre">
          <h2 class="momentum-tittel">Momentum</h2>
          ${momentumChangeHtml(momentum.change)}
        </div>
        ${renderMomentumHeadButtons(showVennerBtn, vennerUnread)}
        <p class="momentum-verdi" aria-live="polite">${momentum.today}</p>
      </div>
      <div id="momentum-graf" class="momentum-graf-wrap"></div>
      ${renderPartnerPanel(partnersForUi, partnerState)}
      ${renderMomentumFactors(momentum.factors)}
      ${renderHomeCarbsLineHtml(nutritionSummary)}
      ${renderHomeCaloriesLineHtml(nutritionSummary)}
    </section>

    <div id="momentum-guide-host"></div>

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

  const partnerUi = mountPartnerMomentumUi(container, labeledSeries, partnerState, partnerUsernames);
  mountMomentumGuideUi(container);
  if (reopenGuide) {
    const host = container.querySelector('#momentum-guide-host');
    const infoBtn = container.querySelector('#momentum-info');
    openMomentumGuide(host, {
      onClose: () => infoBtn?.setAttribute('aria-expanded', 'false'),
    });
    infoBtn?.setAttribute('aria-expanded', 'true');
  }
  mountHomeInsightRotator(container, infoSlides);

  runPartnerMomentumSyncInBackground(momentum.series, ({ state, partnerUsernames: names }) => {
    if (!container.isConnected) return;
    partnerUi.setPartnerData(state, names);
  });
}
