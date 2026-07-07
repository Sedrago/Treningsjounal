/**
 * mood-prompt.js – «Hvordan føler du deg?» som klokkeskive (7→5, uten 6).
 * 0 = surt (kl. 7), 50 = nøytralt (kl. 12), 100 = glad (kl. 5). Lagres ved trykk.
 */

import * as db from './db.js';
import * as store from './store.js';
import { todayStr } from './utils.js';

const MIN_INTERVAL_MS = 4 * 60 * 60 * 1000;
let promptOpen = false;

/** Fjes på urskive (posisjon kl. 7→5, uten kl. 6). Viser 0–10, lagrer 0–100. */
export const MOOD_CLOCK_SLOTS = [
  { hour: 7, label: 0, value: 0, emoji: '😠' },
  { hour: 8, label: 1, value: 10, emoji: '☹️' },
  { hour: 9, label: 2, value: 20, emoji: '😞' },
  { hour: 10, label: 3, value: 30, emoji: '🙁' },
  { hour: 11, label: 4, value: 40, emoji: '😕' },
  { hour: 12, label: 5, value: 50, emoji: '😐' },
  { hour: 1, label: 6, value: 60, emoji: '😐' },
  { hour: 2, label: 7, value: 70, emoji: '🙂' },
  { hour: 3, label: 8, value: 80, emoji: '😊' },
  { hour: 4, label: 9, value: 90, emoji: '😁' },
  { hour: 5, label: 10, value: 100, emoji: '😄' },
];

/** Vinkel på urskive (0° = kl. 12 øverst, medurs). */
function clockAngle(hour) {
  return (hour % 12) * 30;
}

/** Emoji for lagret verdi (0–100), avrundet til nærmeste klokkeposisjon. */
export function moodEmojiForValue(value) {
  const v = Number(value);
  if (Number.isNaN(v)) return '😐';
  let best = MOOD_CLOCK_SLOTS[0];
  let diff = Math.abs(v - best.value);
  for (const slot of MOOD_CLOCK_SLOTS) {
    const d = Math.abs(v - slot.value);
    if (d < diff) {
      diff = d;
      best = slot;
    }
  }
  return best.emoji;
}

function moodAriaLabel(label) {
  if (label === 0) return '0, veldig dårlig';
  if (label === 5) return '5, nøytral';
  if (label === 10) return '10, veldig bra';
  return String(label);
}

function moodClockHtml() {
  const times = MOOD_CLOCK_SLOTS.map(({ hour, label, value, emoji }) => {
    const angle = clockAngle(hour);
    return `
      <button type="button" class="mood-klokke-time"
        style="--vinkel: ${angle}deg"
        data-value="${value}"
        aria-label="${moodAriaLabel(label)}">
        <span class="mood-klokke-fjes" aria-hidden="true">${emoji}</span>
        <span class="mood-klokke-time-tall" aria-hidden="true">${label}</span>
      </button>`;
  }).join('');

  return `
    <div class="mood-klokke" role="group" aria-labelledby="mood-tittel">
      ${times}
      <button type="button" class="mood-klokke-skip" data-hopp-over>Skip</button>
    </div>`;
}

function parseHashRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  return hash.split('/').filter(Boolean)[0] || 'hjem';
}

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

export function showMoodPrompt(opts = {}) {
  if (promptOpen) return Promise.resolve(null);
  promptOpen = true;

  const context = opts.context || 'app';
  const workoutId = opts.workoutId || null;

  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.id = 'mood-prompt-host';
    host.innerHTML = `
      <div class="ark-bakgrunn" data-lukk></div>
      <div class="ark mood-ark" role="dialog" aria-labelledby="mood-tittel">
        <h2 id="mood-tittel" class="mood-tittel">Hvordan føler du deg?</h2>
        ${moodClockHtml()}
      </div>`;

    document.body.appendChild(host);

    const close = (result) => {
      host.remove();
      promptOpen = false;
      resolve(result);
    };

    host.querySelectorAll('.mood-klokke-time').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const entry = await store.saveMoodEntry({
          value: Number(btn.dataset.value),
          context,
          workoutId,
          date: todayStr(),
        });
        close(entry);
      });
    });

    const dismiss = async () => {
      await db.setMeta('moodLastDismissedAt', String(Date.now()));
      close(null);
    };

    host.querySelector('[data-hopp-over]').addEventListener('click', dismiss);
    host.querySelector('[data-lukk]').addEventListener('click', dismiss);
  });
}

export function showMoodPromptManual() {
  return showMoodPrompt({ context: 'manual', workoutId: null });
}
