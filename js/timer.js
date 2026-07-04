/**
 * timer.js – hviletimer med stor nedtelling som overlegg.
 * Vibrasjon (Android), lyd (WebAudio) og valgfri systemvarsling når ferdig.
 */

import { fmtClock } from './utils.js';

let interval = null;
let endTime = 0;
let totalSec = 0;

function overlay() {
  let el = document.getElementById('timer-overlay');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'timer-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Hviletimer');
  el.innerHTML = `
    <div class="timer-innhold">
      <svg class="timer-ring" viewBox="0 0 200 200" aria-hidden="true">
        <circle class="timer-spor" cx="100" cy="100" r="88"/>
        <circle class="timer-fyll" cx="100" cy="100" r="88"/>
      </svg>
      <div class="timer-tid" aria-live="off">0:00</div>
      <div class="timer-knapper">
        <button type="button" class="knapp sekundaer" data-action="add15">+15 s</button>
        <button type="button" class="knapp sekundaer" data-action="stopp">Avbryt</button>
      </div>
    </div>`;
  el.addEventListener('click', (e) => {
    const action = e.target.dataset?.action;
    if (action === 'add15') extend(15);
    if (action === 'stopp') stop();
  });
  document.body.appendChild(el);
  return el;
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    [0, 0.25, 0.5].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.35, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.2);
      osc.start(now + offset);
      osc.stop(now + offset + 0.22);
    });
  } catch { /* lyd er ikke kritisk */ }
}

function finish() {
  clearInterval(interval);
  interval = null;
  if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 500]);
  beep();
  if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
    new Notification('Hvilepause ferdig', { body: 'Klar for neste sett!', icon: 'icons/icon-192.png' });
  }
  const el = overlay();
  el.querySelector('.timer-tid').textContent = 'Ferdig!';
  el.classList.add('ferdig');
  setTimeout(() => stop(), 1800);
}

function tick() {
  const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
  const el = overlay();
  el.querySelector('.timer-tid').textContent = fmtClock(remaining);
  const circle = el.querySelector('.timer-fyll');
  const circumference = 2 * Math.PI * 88;
  const fraction = totalSec ? remaining / totalSec : 0;
  circle.style.strokeDasharray = String(circumference);
  circle.style.strokeDashoffset = String(circumference * (1 - fraction));
  if (remaining <= 0) finish();
}

/** Starter timeren med gitt antall sekunder. */
export function start(seconds) {
  stop();
  totalSec = seconds;
  endTime = Date.now() + seconds * 1000;
  const el = overlay();
  el.classList.remove('ferdig');
  el.classList.add('vis');
  // Be om varslingstillatelse første gang timeren brukes.
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  tick();
  interval = setInterval(tick, 250);
}

/** Forlenger nedtellingen. */
export function extend(seconds) {
  if (!interval) return;
  endTime += seconds * 1000;
  totalSec += seconds;
  tick();
}

/** Stopper og skjuler timeren. */
export function stop() {
  clearInterval(interval);
  interval = null;
  const el = document.getElementById('timer-overlay');
  if (el) el.classList.remove('vis', 'ferdig');
}
