/**
 * session-log.js – logging av ett sett om gangen (økt-modus).
 */

import * as store from './store.js';
import * as timer from './timer.js';
import {
  mountWeightWheel, mountWeightStrip, mountPillRow, mountDurationWheel,
  mountRepStrip, effortPillOptions, rirToEffort,
} from './pickers.js';
import { toast, esc, summarizeSet, formatDateShort, relativeDays, todayStr, toDisplayWeight } from './utils.js';

export const PANEL_EXPANDED_KEY = 'okttPanelExpanded';

export function isSetComplete(set, logMode, showWeight) {
  if (logMode === 'duration') return set.durationSec != null;
  if (logMode === 'bodyweight' && !showWeight) return set.reps != null;
  return set.weight != null && set.reps != null;
}

function setSummaryText(set, exercise, units) {
  const logMode = store.logModeOf(exercise);
  const showWeight = logMode === 'weight' || (logMode === 'bodyweight' && set.weight != null);
  if (!isSetComplete(set, logMode, showWeight)) return null;
  const parts = [summarizeSet(set, logMode, units)];
  if (set.rir != null) {
    const effort = effortPillOptions().find((o) => o.value === rirToEffort(set.rir));
    if (effort) parts.push(effort.label);
  }
  return parts.join(' · ');
}

function draftPreviewText(draft, exercise, logMode, showWeight, units) {
  const text = setSummaryText(draft, exercise, units);
  if (text) return text;
  const bits = [];
  if (logMode === 'duration') {
    if (draft.durationSec != null) bits.push(`${draft.durationSec}s`);
  } else {
    if ((logMode === 'weight' || showWeight) && draft.weight != null) {
      bits.push(toDisplayWeight(draft.weight, units));
    }
    if (draft.reps != null) bits.push(`× ${draft.reps}`);
  }
  return bits.join(' ') || '…';
}

/** HTML for fullførte sett (sortert, med sletteknapp). */
export function completedSetsHtml(exercise, sets, units) {
  const completed = sets
    .slice()
    .sort((a, b) => a.setNumber - b.setNumber)
    .filter((s) => setSummaryText(s, exercise, units));
  if (!completed.length) return '';
  return `
    <div class="oktt-fullforte" aria-label="Fullførte sett i dag">
      ${completed.map((s) => {
    const text = setSummaryText(s, exercise, units);
    return `
        <div class="oktt-fullfort-rad">
          <span class="oktt-fullfort-nr">${s.setNumber}</span>
          <div class="oktt-fullfort-innhold">
            <span class="oktt-fullfort-info">${esc(text)}</span>
            ${s.comment ? `<span class="oktt-fullfort-kommentar dus liten">«${esc(s.comment)}»</span>` : ''}
          </div>
          <button type="button" class="ikon-knapp oktt-fullfort-slett" data-set-delete="${s.id}" aria-label="Slett sett ${s.setNumber}">✕</button>
        </div>`;
  }).join('')}
    </div>`;
}

export function bindCompletedSetsList(container, { onDelete }) {
  container.querySelectorAll('[data-set-delete]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const label = btn.getAttribute('aria-label') || 'settet';
      if (!confirm(`Slette ${label.toLowerCase()}?`)) return;
      await store.deleteSet(btn.dataset.setDelete);
      onDelete?.();
    });
  });
}

function applySetFields(draft, src, { includeComment = false } = {}) {
  if (!src) return;
  if (src.weight != null) draft.weight = src.weight;
  if (src.reps != null) draft.reps = src.reps;
  if (src.durationSec != null) draft.durationSec = src.durationSec;
  if (src.rir != null) draft.rir = src.rir;
  if (includeComment && src.comment) draft.comment = src.comment;
}

function buildDraft(exercise, setNumber, persisted, template) {
  const defs = store.logDefaults();
  const logMode = store.logModeOf(exercise);
  const draft = {
    exerciseId: exercise.id,
    setNumber,
    weight: null,
    reps: null,
    durationSec: null,
    rir: rirToEffort(defs.effort),
    comment: '',
    id: persisted?.id,
    workoutId: persisted?.workoutId,
  };

  // 1) Utgangspunkt fra innstillinger
  draft.reps = defs.reps;
  if (logMode === 'weight') draft.weight = defs.weightKg;

  // 2) Kopier fra forrige lagrede sett (samme øvelse i dagens økt)
  applySetFields(draft, template);

  // 3) Eksisterende data for dette settnummeret vinner
  applySetFields(draft, persisted, { includeComment: true });
  if (persisted?.comment != null) draft.comment = persisted.comment;

  draft.rir = rirToEffort(draft.rir);
  return draft;
}

function syncOverlayHeight(host) {
  const app = document.getElementById('app');
  if (!app) return;
  requestAnimationFrame(() => {
    const bunn = host.closest('#oktt-bunn');
    const h = bunn ? bunn.offsetHeight : host.offsetHeight;
    app.style.setProperty('--oktt-overlay-h', `${h + 12}px`);
  });
}

function closeSheet() {
  document.getElementById('oktt-sheet-vert')?.remove();
}

function openPreviousSessionSheet(exercise, beforeDate) {
  closeSheet();
  const vert = document.createElement('div');
  vert.id = 'oktt-sheet-vert';
  vert.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Forrige økt">
      <div class="ark-hode">
        <h2>Forrige økt</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <p class="tomt">Henter …</p>
    </div>`;
  document.body.appendChild(vert);

  vert.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', closeSheet));

  store.getLastSessionForExercise(exercise.id, beforeDate).then((session) => {
    const ark = vert.querySelector('.ark');
    if (!session?.sets?.length) {
      ark.innerHTML = `
        <div class="ark-hode">
          <h2>Forrige økt</h2>
          <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
        </div>
        <p class="tomt">Ingen tidligere økt registrert for ${esc(exercise.name)}.</p>`;
      ark.querySelector('[data-lukk]')?.addEventListener('click', closeSheet);
      return;
    }

    const units = store.getSetting('units');
    const logMode = store.logModeOf(exercise);
    const rows = session.sets.map((s) => {
      const showWeight = logMode === 'weight' || (logMode === 'bodyweight' && s.weight != null);
      const summary = isSetComplete(s, logMode, showWeight)
        ? setSummaryText(s, exercise, units)
        : 'Ufullstendig sett';
      return `
        <div class="oktt-forrige-rad">
          <span class="oktt-fullfort-nr">${s.setNumber}</span>
          <div class="oktt-fullfort-innhold">
            <span class="oktt-fullfort-info">${esc(summary || '–')}</span>
            ${s.comment ? `<span class="oktt-fullfort-kommentar dus liten">«${esc(s.comment)}»</span>` : ''}
          </div>
        </div>`;
    }).join('');

    ark.innerHTML = `
      <div class="ark-hode">
        <h2>Forrige økt</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <p class="dus liten oktt-forrige-meta">${formatDateShort(session.date)} · ${relativeDays(session.date)}</p>
      <div class="oktt-forrige-liste">${rows}</div>`;
    ark.querySelector('[data-lukk]')?.addEventListener('click', closeSheet);
  });
}

/**
 * Monter logging for ett sett. Lagrer først ved «Lagre sett →».
 * @returns {{ destroy: () => void }}
 */
export async function mountSetLogger(host, {
  exercise,
  setNumber,
  persistedSet,
  templateSet,
  planItem = null,
  completedSets = [],
  onSaved,
  onDeleted,
  compact = false,
  beforeDate = null,
}) {
  host.innerHTML = '';
  closeSheet();
  const logMode = store.logModeOf(exercise);
  const units = store.getSetting('units');
  const defs = store.logDefaults();
  const defaultEffort = rirToEffort(defs.effort);
  const suggestionText = planItem ? store.planItemSuggestionText(planItem, exercise, units) : '';
  const restTimes = String(store.getSetting('restTimes')).split(',')
    .map((t) => parseInt(t.trim(), 10)).filter((t) => t > 0);
  const cutoff = beforeDate || todayStr();
  const lastSession = compact ? await store.getLastSessionForExercise(exercise.id, cutoff) : null;
  const hasPrevious = Boolean(lastSession?.sets?.length);

  let showWeight = logMode === 'weight'
    || (logMode === 'bodyweight' && persistedSet?.weight != null);

  const draft = buildDraft(exercise, setNumber, persistedSet, templateSet);
  if (draft.rir == null) draft.rir = defaultEffort;

  let expanded = sessionStorage.getItem(PANEL_EXPANDED_KEY) !== '0';

  const wrap = document.createElement('div');
  wrap.className = compact ? 'oktt-panel oktt-panel--overlay' : 'kort oktt-panel';
  if (compact && !expanded) wrap.classList.add('oktt-panel--minimert');

  if (compact) {
    wrap.innerHTML = `
      <div class="oktt-panel-bar">
        <button type="button" class="oktt-panel-bar-main" id="oktt-bar-expand" aria-expanded="${expanded ? 'true' : 'false'}">
          <span class="oktt-bar-tittel">${esc(exercise.name)} · sett ${setNumber}</span>
          <span class="oktt-bar-preview dus" id="oktt-bar-preview"></span>
        </button>
        <div class="oktt-panel-bar-handlinger">
          ${hasPrevious ? '<button type="button" class="knapp sekundaer mini" id="oktt-forrige">Forrige</button>' : ''}
          <button type="button" class="ikon-knapp oktt-panel-toggle" id="oktt-toggle"
            aria-label="${expanded ? 'Minimer panel' : 'Utvid panel'}" aria-expanded="${expanded ? 'true' : 'false'}">${expanded ? '▼' : '▲'}</button>
        </div>
      </div>
      <div class="oktt-panel-body ${expanded ? '' : 'skjult'}">
        ${suggestionText ? `<p class="plan-mal-hint dus liten oktt-plan-hint">${esc(suggestionText)}</p>` : ''}
        ${restTimes.length ? `
        <div class="oktt-overlay-hvile oktt-overlay-hvile--body">
          ${restTimes.slice(0, 3).map((t) => `<button type="button" class="knapp hvile mini" data-sek="${t}">${t}s</button>`).join('')}
        </div>` : ''}
        <div class="oktt-fullforte-wrap-host"></div>
        <div class="oktt-velgere oktt-velgere-kompakt"></div>
        ${logMode === 'bodyweight' ? `
        <label class="bryter-rad logg-tilleggsvekt oktt-tilleggsvekt kompakt">
          <input type="checkbox" id="oktt-tilleggsvekt" ${showWeight ? 'checked' : ''}>
          <span>+Vekt</span>
        </label>` : ''}
        <div class="oktt-kommentar-wrap">
          <button type="button" class="knapp sekundaer liten" id="oktt-kommentar-toggle">${draft.comment ? 'Notat' : '+ Notat'}</button>
          <input type="text" class="inndata oktt-kommentar ${draft.comment ? '' : 'skjult'}" id="oktt-kommentar"
            placeholder="Notat til settet …" value="${esc(draft.comment || '')}" autocomplete="off">
        </div>
        <button type="button" class="knapp primaer oktt-lagre" id="oktt-lagre-sett">Lagre sett →</button>
      </div>
      <div class="oktt-panel-min-bar ${expanded ? 'skjult' : ''}">
        <button type="button" class="knapp primaer oktt-lagre oktt-lagre-mini" id="oktt-lagre-mini">Lagre sett →</button>
      </div>`;
  } else {
    wrap.innerHTML = `
      <div class="oktt-panel-hode">
        <div>
          <h2 class="oktt-tittel">${esc(exercise.name)}</h2>
          <p class="dus liten oktt-sett-info">Sett ${setNumber}${suggestionText ? ` · ${esc(suggestionText)}` : ''}</p>
        </div>
      </div>
      <div class="oktt-fullforte-wrap-host"></div>
      <div class="oktt-velgere"></div>
      ${logMode === 'bodyweight' ? `
      <label class="bryter-rad logg-tilleggsvekt oktt-tilleggsvekt">
        <input type="checkbox" id="oktt-tilleggsvekt" ${showWeight ? 'checked' : ''}>
        <span>Tilleggsvekt</span>
      </label>` : ''}
      <div class="oktt-kommentar-wrap">
        <button type="button" class="knapp sekundaer liten" id="oktt-kommentar-toggle">${draft.comment ? 'Notat' : '+ Notat'}</button>
        <input type="text" class="inndata oktt-kommentar ${draft.comment ? '' : 'skjult'}" id="oktt-kommentar"
          placeholder="Notat til settet …" value="${esc(draft.comment || '')}" autocomplete="off">
      </div>
      ${restTimes.length ? `
      <div class="oktt-hvile-rad" aria-label="Hviletimer">
        ${restTimes.map((t) => `<button type="button" class="knapp hvile oktt-hvile-knapp" data-sek="${t}">${t}s</button>`).join('')}
      </div>` : ''}
      <button type="button" class="knapp primaer stor oktt-lagre" id="oktt-lagre-sett">Lagre sett →</button>`;
  }

  host.appendChild(wrap);
  const pickerHost = wrap.querySelector('.oktt-velgere');
  const completedHost = wrap.querySelector('.oktt-fullforte-wrap-host');
  const pickers = {};
  let pickersMounted = false;

  function destroyPickers() {
    Object.values(pickers).forEach((p) => p?.destroy?.());
    for (const k of Object.keys(pickers)) delete pickers[k];
    pickersMounted = false;
    if (pickerHost) pickerHost.innerHTML = '';
  }

  function mountCompletedSets() {
    if (!completedHost) return;
    const completedHtml = completedSetsHtml(exercise, completedSets, units);
    completedHost.innerHTML = completedHtml;
    if (completedHtml) {
      bindCompletedSetsList(completedHost, {
        onDelete: () => {
          onDeleted?.();
          syncOverlayHeight(host);
        },
      });
    }
  }

  mountCompletedSets();

  function updateBarPreview() {
    const el = wrap.querySelector('#oktt-bar-preview');
    if (!el) return;
    el.textContent = draftPreviewText(draft, exercise, logMode, showWeight, units);
  }

  function setPanelExpanded(nextExpanded) {
    expanded = nextExpanded;
    sessionStorage.setItem(PANEL_EXPANDED_KEY, expanded ? '1' : '0');
    wrap.classList.toggle('oktt-panel--minimert', !expanded);
    wrap.querySelector('.oktt-panel-body')?.classList.toggle('skjult', !expanded);
    wrap.querySelector('.oktt-panel-min-bar')?.classList.toggle('skjult', expanded);
    const toggle = wrap.querySelector('#oktt-toggle');
    if (toggle) {
      toggle.textContent = expanded ? '▼' : '▲';
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      toggle.setAttribute('aria-label', expanded ? 'Minimer panel' : 'Utvid panel');
    }
    wrap.querySelector('#oktt-bar-expand')?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    if (expanded) {
      ensurePickersMounted();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          pickers.weight?.relayout?.();
          pickers.reps?.relayout?.();
        });
      });
    } else if (compact) {
      destroyPickers();
    }
    syncOverlayHeight(host);
  }

  function remountPickers() {
    destroyPickers();
    if (!pickerHost) return;

    if (logMode === 'duration') {
      pickers.duration = mountDurationWheel(pickerHost, {
        valueSec: draft.durationSec,
        onChange: (v) => { draft.durationSec = v; updateBarPreview(); },
      });
    } else {
      if (logMode === 'weight' || showWeight) {
        const wHost = document.createElement('div');
        pickerHost.appendChild(wHost);
        if (compact) {
          pickers.weight = mountWeightStrip(wHost, {
            valueKg: draft.weight,
            units,
            compact: true,
            onChange: (kg) => { draft.weight = kg; updateBarPreview(); },
          });
        } else {
          pickers.weight = mountWeightWheel(wHost, {
            valueKg: draft.weight,
            units,
            onChange: (kg) => { draft.weight = kg; updateBarPreview(); },
          });
        }
      }
      const repsHost = document.createElement('div');
      pickerHost.appendChild(repsHost);
      pickers.reps = mountRepStrip(repsHost, {
        value: draft.reps,
        centerHint: defs.reps,
        compact,
        onChange: (v) => { draft.reps = v; updateBarPreview(); },
      });
    }

    const effortHost = document.createElement('div');
    pickerHost.appendChild(effortHost);
    pickers.effort = mountPillRow(effortHost, {
      label: compact ? '' : 'Innsats',
      options: effortPillOptions(),
      value: draft.rir ?? defaultEffort,
      onChange: (v) => { draft.rir = v; updateBarPreview(); },
    });
    if (compact) {
      effortHost.querySelector('.pill-rad')?.classList.add('oktt-innsats-rad');
    }
    pickersMounted = true;
    updateBarPreview();
    syncOverlayHeight(host);
  }

  function ensurePickersMounted() {
    if (pickersMounted) return;
    remountPickers();
  }

  if (!compact || expanded) {
    remountPickers();
  } else {
    updateBarPreview();
  }

  wrap.querySelector('#oktt-toggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    setPanelExpanded(!expanded);
  });

  wrap.querySelector('#oktt-bar-expand')?.addEventListener('click', () => {
    if (!expanded) setPanelExpanded(true);
  });

  wrap.querySelector('#oktt-forrige')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openPreviousSessionSheet(exercise, cutoff);
  });

  const commentInput = wrap.querySelector('#oktt-kommentar');
  wrap.querySelector('#oktt-kommentar-toggle')?.addEventListener('click', () => {
    if (!commentInput) return;
    commentInput.classList.toggle('skjult');
    if (!commentInput.classList.contains('skjult')) commentInput.focus();
  });
  commentInput?.addEventListener('input', () => {
    draft.comment = commentInput.value;
  });

  if (logMode === 'bodyweight') {
    wrap.querySelector('#oktt-tilleggsvekt')?.addEventListener('change', (e) => {
      showWeight = e.target.checked;
      if (!showWeight) draft.weight = null;
      remountPickers();
    });
  }

  wrap.querySelectorAll('[data-sek]').forEach((btn) => {
    btn.addEventListener('click', () => timer.start(parseInt(btn.dataset.sek, 10)));
  });

  function syncDraftFromPickers() {
    if (!pickersMounted) return;
    if (pickers.reps?.getValue) draft.reps = pickers.reps.getValue();
    if (pickers.weight?.getValueKg) draft.weight = pickers.weight.getValueKg();
    if (commentInput) draft.comment = commentInput.value.trim();
  }

  async function saveSet() {
    syncDraftFromPickers();
    if (!isSetComplete(draft, logMode, showWeight)) {
      toast('Fyll inn vekt og reps før du lagrer', 'feil');
      if (compact && !expanded) setPanelExpanded(true);
      return;
    }
    const workout = await store.getOrCreateTodayWorkout();
    draft.workoutId = workout.id;
    const saved = await store.saveSet({ ...draft, comment: draft.comment.trim() });
    await store.touchWorkoutDuration(workout.id);
    if (compact && expanded) sessionStorage.setItem(PANEL_EXPANDED_KEY, '1');
    onSaved(saved);
  }

  wrap.querySelector('#oktt-lagre-sett')?.addEventListener('click', saveSet);
  wrap.querySelector('#oktt-lagre-mini')?.addEventListener('click', saveSet);

  syncOverlayHeight(host);

  return {
    destroy() {
      destroyPickers();
      host.innerHTML = '';
      closeSheet();
      document.getElementById('app')?.style.removeProperty('--oktt-overlay-h');
    },
  };
}
