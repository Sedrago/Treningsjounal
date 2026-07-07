/**
 * mood-prompt.js – «Hvordan føler du deg?»-modal med slider (0 = dårlig, 100 = bra).
 * Vises ved app-start og ved dagens økt, men aldri under sett-logging.
 */

import * as db from './db.js';
import * as store from './store.js';
import { todayStr } from './utils.js';

const MIN_INTERVAL_MS = 4 * 60 * 60 * 1000;
let promptOpen = false;

function parseHashRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  return hash.split('/').filter(Boolean)[0] || 'hjem';
}

/** Siste tidspunkt brukeren logget eller hoppet over. */
async function lastMoodInteractionAt(entries) {
  const latest = entries[0];
  const dismissed = await db.getMeta('moodLastDismissedAt');
  const fromEntry = latest?.updatedAt ? new Date(latest.updatedAt).getTime() : 0;
  const fromDismiss = dismissed ? Number(dismissed) : 0;
  return Math.max(fromEntry, fromDismiss);
}

function hasMoodForWorkout(entries, workoutId) {
  return entries.some((m) => m.workoutId === workoutId);
}

function hasWorkoutStartToday(entries, today) {
  return entries.some((m) => m.date === today && m.context === 'workout-start');
}

/**
 * Vurderer om mood-prompt skal vises etter rutebytte.
 * @param {string} [route] – aktiv rute (default: fra hash)
 */
export async function maybeShowMoodPrompt(route = parseHashRoute()) {
  if (promptOpen) return;
  if (route === 'logg') return;

  const entries = await store.getMoodEntries();
  const today = todayStr();
  const now = Date.now();

  if (route === 'okt') {
    const workout = await store.getOrCreateTodayWorkout();
    if (hasMoodForWorkout(entries, workout.id)) return;
    await showMoodPrompt({ context: 'workout-start', workoutId: workout.id });
    return;
  }

  if (route !== 'hjem') return;

  if (hasWorkoutStartToday(entries, today)) return;

  const lastAt = await lastMoodInteractionAt(entries);
  if (lastAt && now - lastAt < MIN_INTERVAL_MS) return;

  await showMoodPrompt({ context: 'app', workoutId: null });
}

/**
 * Viser mood-modal. Returnerer når den lukkes.
 * @param {{ context: string, workoutId?: string|null, defaultValue?: number }} opts
 */
export function showMoodPrompt(opts = {}) {
  if (promptOpen) return Promise.resolve(null);
  promptOpen = true;

  const context = opts.context || 'app';
  const workoutId = opts.workoutId || null;
  const defaultValue = opts.defaultValue ?? 50;

  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.id = 'mood-prompt-host';
    host.innerHTML = `
      <div class="ark-bakgrunn" data-lukk></div>
      <div class="ark mood-ark" role="dialog" aria-labelledby="mood-tittel">
        <h2 id="mood-tittel" class="mood-tittel">Hvordan føler du deg?</h2>
        <div class="mood-slider-wrap">
          <div class="mood-emoji-rad" aria-hidden="true">
            <span class="mood-emoji">☹️</span>
            <span class="mood-emoji">😊</span>
          </div>
          <input type="range" class="mood-slider" id="mood-range"
            min="0" max="100" step="1" value="${defaultValue}"
            aria-label="Hvordan føler du deg? Dårlig til venstre, bra til høyre">
        </div>
        <div class="mood-knapper">
          <button type="button" class="knapp sekundaer" data-hopp-over>Hopp over</button>
          <button type="button" class="knapp primaer" data-lagre>Lagre</button>
        </div>
      </div>`;

    document.body.appendChild(host);

    const close = (result) => {
      host.remove();
      promptOpen = false;
      resolve(result);
    };

    const slider = host.querySelector('#mood-range');

    host.querySelector('[data-lagre]').addEventListener('click', async () => {
      const value = Number(slider.value);
      const entry = await store.saveMoodEntry({
        value,
        context,
        workoutId,
        date: todayStr(),
      });
      close(entry);
    });

    const dismiss = async () => {
      await db.setMeta('moodLastDismissedAt', String(Date.now()));
      close(null);
    };

    host.querySelector('[data-hopp-over]').addEventListener('click', dismiss);
    host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', dismiss));
  });
}

/** For manuell visning fra humør-siden (samme slider, uten throttling). */
export function showMoodPromptManual() {
  return showMoodPrompt({ context: 'manual', workoutId: null });
}
