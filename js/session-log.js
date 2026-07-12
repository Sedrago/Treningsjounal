/**
 * session-log.js – logging av ett sett om gangen (økt-modus).
 */

import * as store from './store.js';
import * as timer from './timer.js';
import {
  mountWeightWheel, mountWeightStrip, mountPillRow, mountDurationWheel,
  mountRepStrip, effortPillOptions, rirToEffort,
} from './pickers.js';
import { toast, esc } from './utils.js';

export function isSetComplete(set, logMode, showWeight) {
  if (logMode === 'duration') return set.durationSec != null;
  if (logMode === 'bodyweight' && !showWeight) return set.reps != null;
  return set.weight != null && set.reps != null;
}

function defaultReps(exercise) {
  return store.repMidpoint(exercise) ?? 8;
}

function buildDraft(exercise, setNumber, persisted, template) {
  const draft = {
    exerciseId: exercise.id,
    setNumber,
    weight: null,
    reps: null,
    durationSec: null,
    rir: rirToEffort(Number(store.getSetting('defaultRir'))),
    comment: '',
    id: persisted?.id,
    workoutId: persisted?.workoutId,
  };
  const src = persisted || template;
  if (src) {
    draft.weight = src.weight ?? null;
    draft.reps = src.reps ?? null;
    draft.durationSec = src.durationSec ?? null;
    draft.rir = src.rir ?? draft.rir;
    draft.comment = src.comment || '';
  }
  if (draft.reps == null) draft.reps = defaultReps(exercise);
  draft.rir = rirToEffort(draft.rir);
  return draft;
}

function syncOverlayHeight(host) {
  const app = document.getElementById('app');
  if (!app || !host.closest('.oktt-overlay')) return;
  requestAnimationFrame(() => {
    app.style.setProperty('--oktt-overlay-h', `${host.offsetHeight}px`);
  });
}

/**
 * Monter logging for ett sett. Lagrer først ved «Lagre sett →».
 * @returns {{ destroy: () => void }}
 */
export async function mountSetLogger(host, {
  exercise,
  setNumber,
  goalSets,
  persistedSet,
  templateSet,
  onSaved,
  compact = false,
}) {
  host.innerHTML = '';
  const logMode = store.logModeOf(exercise);
  const units = store.getSetting('units');
  const defaultRir = rirToEffort(Number(store.getSetting('defaultRir')));
  const restTimes = String(store.getSetting('restTimes')).split(',')
    .map((t) => parseInt(t.trim(), 10)).filter((t) => t > 0);

  let showWeight = logMode === 'weight'
    || (logMode === 'bodyweight' && persistedSet?.weight != null);

  const draft = buildDraft(exercise, setNumber, persistedSet, templateSet);
  if (draft.rir == null) draft.rir = defaultRir;

  const wrap = document.createElement('div');
  wrap.className = compact ? 'oktt-panel oktt-panel--overlay' : 'kort oktt-panel';

  if (compact) {
    wrap.innerHTML = `
      <div class="oktt-overlay-hode">
        <div class="oktt-overlay-tittel">
          <strong>${esc(exercise.name)}</strong>
          <span class="dus">· sett ${setNumber}/${goalSets}</span>
        </div>
        ${restTimes.length ? `
        <div class="oktt-overlay-hvile">
          ${restTimes.slice(0, 3).map((t) => `<button type="button" class="knapp hvile mini" data-sek="${t}">${t}s</button>`).join('')}
        </div>` : ''}
      </div>
      <div class="oktt-velgere oktt-velgere-kompakt"></div>
      ${logMode === 'bodyweight' ? `
      <label class="bryter-rad logg-tilleggsvekt oktt-tilleggsvekt kompakt">
        <input type="checkbox" id="oktt-tilleggsvekt" ${showWeight ? 'checked' : ''}>
        <span>+Vekt</span>
      </label>` : ''}
      <button type="button" class="knapp primaer oktt-lagre" id="oktt-lagre-sett">Lagre sett →</button>`;
  } else {
    wrap.innerHTML = `
      <div class="oktt-panel-hode">
        <div>
          <h2 class="oktt-tittel">${esc(exercise.name)}</h2>
          <p class="dus liten oktt-sett-info">Sett ${setNumber} / ${goalSets}</p>
        </div>
      </div>
      <div class="oktt-velgere"></div>
      ${logMode === 'bodyweight' ? `
      <label class="bryter-rad logg-tilleggsvekt oktt-tilleggsvekt">
        <input type="checkbox" id="oktt-tilleggsvekt" ${showWeight ? 'checked' : ''}>
        <span>Tilleggsvekt</span>
      </label>` : ''}
      ${restTimes.length ? `
      <div class="oktt-hvile-rad" aria-label="Hviletimer">
        ${restTimes.map((t) => `<button type="button" class="knapp hvile oktt-hvile-knapp" data-sek="${t}">${t}s</button>`).join('')}
      </div>` : ''}
      <button type="button" class="knapp primaer stor oktt-lagre" id="oktt-lagre-sett">Lagre sett →</button>`;
  }

  host.appendChild(wrap);
  const pickerHost = wrap.querySelector('.oktt-velgere');
  const pickers = {};

  function remountPickers() {
    Object.values(pickers).forEach((p) => p?.destroy?.());
    for (const k of Object.keys(pickers)) delete pickers[k];
    pickerHost.innerHTML = '';

    if (logMode === 'duration') {
      pickers.duration = mountDurationWheel(pickerHost, {
        valueSec: draft.durationSec,
        onChange: (v) => { draft.durationSec = v; },
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
            onChange: (kg) => { draft.weight = kg; },
          });
        } else {
          pickers.weight = mountWeightWheel(wHost, {
            valueKg: draft.weight,
            units,
            onChange: (kg) => { draft.weight = kg; },
          });
        }
      }
      const repsHost = document.createElement('div');
      pickerHost.appendChild(repsHost);
      pickers.reps = mountRepStrip(repsHost, {
        value: draft.reps,
        centerHint: defaultReps(exercise),
        compact,
        onChange: (v) => { draft.reps = v; },
      });
    }

    const effortHost = document.createElement('div');
    pickerHost.appendChild(effortHost);
    pickers.effort = mountPillRow(effortHost, {
      label: compact ? '' : 'Innsats',
      options: effortPillOptions(),
      value: draft.rir ?? defaultRir,
      onChange: (v) => { draft.rir = v; },
    });
    if (compact) {
      effortHost.querySelector('.pill-rad')?.classList.add('oktt-innsats-rad');
    }
    syncOverlayHeight(host);
  }

  remountPickers();

  if (logMode === 'bodyweight') {
    wrap.querySelector('#oktt-tilleggsvekt').addEventListener('change', (e) => {
      showWeight = e.target.checked;
      if (!showWeight) draft.weight = null;
      remountPickers();
    });
  }

  wrap.querySelectorAll('[data-sek]').forEach((btn) => {
    btn.addEventListener('click', () => timer.start(parseInt(btn.dataset.sek, 10)));
  });

  wrap.querySelector('#oktt-lagre-sett').addEventListener('click', async () => {
    if (!isSetComplete(draft, logMode, showWeight)) {
      toast('Fyll inn vekt og reps før du lagrer', 'feil');
      return;
    }
    const workout = await store.getOrCreateTodayWorkout();
    draft.workoutId = workout.id;
    const saved = await store.saveSet({ ...draft });
    await store.touchWorkoutDuration(workout.id);
    onSaved(saved);
  });

  syncOverlayHeight(host);

  return {
    destroy() {
      Object.values(pickers).forEach((p) => p?.destroy?.());
      host.innerHTML = '';
      document.getElementById('app')?.style.removeProperty('--oktt-overlay-h');
    },
  };
}
