/**
 * session-log.js – logging av ett sett om gangen (økt-modus).
 */

import * as store from '../store.js';
import * as timer from '../timer.js';
import {
  mountWeightWheel, mountPillRow, mountDurationWheel,
  mountRepStrip, effortPillOptions, rirToEffort,
} from './pickers.js';
import { weightUnit, toast, esc } from './utils.js';

export function isSetComplete(set, logMode, showWeight) {
  if (logMode === 'duration') return set.durationSec != null;
  if (logMode === 'bodyweight' && !showWeight) return set.reps != null;
  return set.weight != null && set.reps != null;
}

function defaultReps(exercise) {
  const min = Number(exercise.goalRepsMin) || 8;
  const max = Number(exercise.goalRepsMax) || 10;
  return Math.round((min + max) / 2);
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

  const wrap = document.createElement('section');
  wrap.className = 'kort oktt-panel';
  wrap.innerHTML = `
    <div class="oktt-panel-hode">
      <div>
        <h2 class="oktt-tittel">${esc(exercise.name)}</h2>
        <p class="dus liten oktt-sett-info">Sett ${setNumber} av ${goalSets}</p>
      </div>
    </div>
    <div class="oktt-velgere"></div>
    ${logMode === 'bodyweight' ? `
    <label class="bryter-rad logg-tilleggsvekt oktt-tilleggsvekt">
      <input type="checkbox" id="oktt-tilleggsvekt" ${showWeight ? 'checked' : ''}>
      <span>Tilleggsvekt</span>
    </label>` : ''}
    <section class="hvile-linje oktt-hvile" aria-label="Hviletimer">
      <span class="dus">Hvile:</span>
      ${restTimes.map((t) => `<button type="button" class="knapp hvile" data-sek="${t}">${t} s</button>`).join('')}
    </section>
    <button type="button" class="knapp primaer stor oktt-lagre" id="oktt-lagre-sett">Lagre sett →</button>`;

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
        pickers.weight = mountWeightWheel(wHost, {
          valueKg: draft.weight,
          units,
          onChange: (kg) => { draft.weight = kg; },
        });
      }
      const repsHost = document.createElement('div');
      pickerHost.appendChild(repsHost);
      pickers.reps = mountRepStrip(repsHost, {
        value: draft.reps,
        centerHint: defaultReps(exercise),
        onChange: (v) => { draft.reps = v; },
      });
    }

    const effortHost = document.createElement('div');
    pickerHost.appendChild(effortHost);
    pickers.effort = mountPillRow(effortHost, {
      label: 'Innsats',
      options: effortPillOptions(),
      value: draft.rir ?? defaultRir,
      onChange: (v) => { draft.rir = v; },
    });
  }

  remountPickers();

  if (logMode === 'bodyweight') {
    wrap.querySelector('#oktt-tilleggsvekt').addEventListener('change', (e) => {
      showWeight = e.target.checked;
      if (!showWeight) draft.weight = null;
      remountPickers();
    });
  }

  wrap.querySelectorAll('.hvile').forEach((btn) => {
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

  return {
    destroy() {
      Object.values(pickers).forEach((p) => p?.destroy?.());
      host.innerHTML = '';
    },
  };
}
