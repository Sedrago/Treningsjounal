/**
 * pickers.js – vekthjul og pill-rader uten tastatur.
 */

import { fmtNum, toDisplayWeight, fromInputWeight, weightUnit, fmtClock } from './utils.js';

export function weightStep(units) {
  return units === 'imperial' ? 1 : 0.5;
}

function snapDisplay(v, units) {
  const step = weightStep(units);
  return Math.round(v / step) * step;
}

/**
 * Vertikalt vekthjul med 0,5 kg (eller 1 lb) intervaller.
 * @returns {{ setKg: (kg: number|null) => void, destroy: () => void }}
 */
export function mountWeightWheel(host, { valueKg, units, onChange }) {
  host.innerHTML = '';
  const step = weightStep(units);
  const unit = weightUnit(units);
  const hopSmall = units === 'imperial' ? 2 : 2.5;
  const hopLarge = units === 'imperial' ? 10 : 5;

  let display = valueKg != null ? snapDisplay(toDisplayWeight(valueKg, units), units) : 40;

  const wrap = document.createElement('div');
  wrap.className = 'vekt-hjul';
  wrap.innerHTML = `
    <div class="vekt-hjul-rad">
      <button type="button" class="vekt-hop" data-hop="${-hopLarge}">−${fmtNum(hopLarge, units === 'imperial' ? 0 : 1)}</button>
      <button type="button" class="vekt-hop liten" data-hop="${-hopSmall}">−${fmtNum(hopSmall, units === 'imperial' ? 0 : 1)}</button>
      <div class="vekt-trommel" aria-label="Velg vekt">
        <div class="vekt-trommel-markør" aria-hidden="true"></div>
        <ul class="vekt-trommel-liste"></ul>
      </div>
      <button type="button" class="vekt-hop liten" data-hop="${hopSmall}">+${fmtNum(hopSmall, units === 'imperial' ? 0 : 1)}</button>
      <button type="button" class="vekt-hop" data-hop="${hopLarge}">+${fmtNum(hopLarge, units === 'imperial' ? 0 : 1)}</button>
    </div>
    <p class="vekt-trommel-enhet">${unit}</p>`;

  const list = wrap.querySelector('.vekt-trommel-liste');
  const drum = wrap.querySelector('.vekt-trommel');
  const ITEM = 48;
  const PAD = ITEM * 2;
  const RANGE = 120;

  function buildItems(center) {
    const min = Math.max(0, center - RANGE);
    const max = center + RANGE;
    list.innerHTML = '';
    list.style.paddingTop = `${PAD}px`;
    list.style.paddingBottom = `${PAD}px`;
    const items = [];
    for (let v = min; v <= max + 0.001; v += step) {
      const val = Math.round(v * 100) / 100;
      const li = document.createElement('li');
      li.className = 'vekt-trommel-item';
      li.dataset.value = String(val);
      li.textContent = fmtNum(val, val % 1 === 0 ? 0 : 1);
      list.appendChild(li);
      items.push({ val, li });
    }
    return items;
  }

  let items = buildItems(display);
  let scrollTimer = null;

  function emit(val) {
    display = snapDisplay(val, units);
    onChange(fromInputWeight(display, units));
  }

  function scrollToValue(val, smooth = false) {
    val = snapDisplay(val, units);
    let item = [...list.querySelectorAll('.vekt-trommel-item')]
      .find((el) => parseFloat(el.dataset.value) === val);
    if (!item) {
      buildItems(val);
      item = [...list.querySelectorAll('.vekt-trommel-item')]
        .find((el) => parseFloat(el.dataset.value) === val);
    }
    if (!item) return;
    const top = item.offsetTop - drum.clientHeight / 2 + ITEM / 2;
    drum.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  }

  function nearestFromScroll() {
    const drumRect = drum.getBoundingClientRect();
    const centerY = drumRect.top + drum.clientHeight / 2;
    let best = null;
    let bestDist = Infinity;
    list.querySelectorAll('.vekt-trommel-item').forEach((el) => {
      const r = el.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      const d = Math.abs(mid - centerY);
      if (d < bestDist) {
        bestDist = d;
        best = el;
      }
    });
    return best ? parseFloat(best.dataset.value) : display;
  }

  drum.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const val = nearestFromScroll();
      if (val !== display) emit(val);
    }, 80);
  }, { passive: true });

  wrap.querySelectorAll('.vekt-hop').forEach((btn) => {
    btn.addEventListener('click', () => {
      const hop = parseFloat(btn.dataset.hop);
      const next = Math.max(0, snapDisplay(display + hop, units));
      emit(next);
      scrollToValue(next, true);
    });
  });

  host.appendChild(wrap);
  requestAnimationFrame(() => scrollToValue(display, false));

  return {
    setKg(kg) {
      const d = kg != null ? snapDisplay(toDisplayWeight(kg, units), units) : display;
      if (Math.abs(d - display) < 0.001) return;
      display = d;
      if (!list.querySelector(`[data-value="${d}"]`)) {
        items = buildItems(d);
      }
      scrollToValue(d, false);
    },
    destroy() {
      clearTimeout(scrollTimer);
      host.innerHTML = '';
    },
  };
}

/**
 * Rad med store valg-knapper (pills).
 * @returns {{ setValue: (v: unknown) => void, destroy: () => void }}
 */
export function mountPillRow(host, { label, options, value, onChange }) {
  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'pill-gruppe';
  if (label) {
    const lbl = document.createElement('p');
    lbl.className = 'pill-etikett';
    lbl.textContent = label;
    wrap.appendChild(lbl);
  }
  const row = document.createElement('div');
  row.className = 'pill-rad';
  row.setAttribute('role', 'group');
  if (label) row.setAttribute('aria-label', label);

  function render(val) {
    row.querySelectorAll('.pill').forEach((btn) => {
      const match = btn.dataset.value === String(val)
        || (val == null && btn.dataset.value === '');
      btn.classList.toggle('valgt', match);
      btn.setAttribute('aria-pressed', match ? 'true' : 'false');
    });
  }

  for (const opt of options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pill';
    btn.dataset.value = opt.value == null ? '' : String(opt.value);
    btn.textContent = opt.label;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      const v = opt.value;
      render(v);
      onChange(v);
    });
    row.appendChild(btn);
  }

  wrap.appendChild(row);
  host.appendChild(wrap);
  render(value);

  return {
    setValue(v) { render(v); },
    destroy() { host.innerHTML = ''; },
  };
}

/** Vanlige varigheter som pills. */
export function mountDurationWheel(host, { valueSec, onChange }) {
  const options = [20, 30, 45, 60, 75, 90, 105, 120, 150, 180, 240, 300].map((s) => ({
    value: s,
    label: fmtClock(s),
  }));
  const val = valueSec ?? 45;
  return mountPillRow(host, {
    label: 'Varighet',
    options,
    value: options.some((o) => o.value === val) ? val : 60,
    onChange: (v) => onChange(v),
  });
}

export function effortPillOptions() {
  return [
    { value: 0, label: 'Fail' },
    { value: 1, label: '1–2' },
    { value: 3, label: 'Mod' },
    { value: 5, label: 'Lett' },
  ];
}

/** Map lagret RIR til nærmeste innsats-nivå. */
export function rirToEffort(rir) {
  if (rir == null) return 3;
  if (rir <= 0) return 0;
  if (rir <= 2) return 1;
  if (rir <= 4) return 3;
  return 5;
}

export function repPillOptions(exercise) {
  const min = Number(exercise.goalRepsMin) || 8;
  const max = Number(exercise.goalRepsMax) || 10;
  const lo = Math.max(1, min - 2);
  const hi = max + 4;
  const opts = [];
  for (let r = lo; r <= hi; r++) opts.push({ value: r, label: String(r) });
  return opts;
}

export function rirPillOptions() {
  return effortPillOptions();
}

/**
 * Horisontal reps-linje: senterverdi med naboer, kan dras sideveis (1–100+).
 * @returns {{ setValue: (v: number|null) => void, destroy: () => void }}
 */
export function mountRepStrip(host, { value, centerHint = 8, max = 100, onChange }) {
  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'reps-stripe';
  wrap.innerHTML = `
    <p class="pill-etikett">Reps</p>
    <div class="reps-stripe-rad">
      <div class="reps-stripe-trommel" aria-label="Velg repetisjoner">
        <div class="reps-stripe-markor" aria-hidden="true"></div>
        <ul class="reps-stripe-liste"></ul>
      </div>
    </div>`;

  const drum = wrap.querySelector('.reps-stripe-trommel');
  const list = wrap.querySelector('.reps-stripe-liste');
  const ITEM = 52;
  const PAD = ITEM * 3;
  let current = value ?? centerHint ?? 8;

  function buildItems(center) {
    const maxVal = Math.max(max, center + 15);
    list.innerHTML = '';
    list.style.paddingLeft = `${PAD}px`;
    list.style.paddingRight = `${PAD}px`;
    for (let v = 1; v <= maxVal; v++) {
      const li = document.createElement('li');
      li.className = 'reps-stripe-item';
      li.dataset.value = String(v);
      li.textContent = String(v);
      list.appendChild(li);
    }
  }

  let scrollTimer = null;

  function emit(val) {
    current = Math.max(1, Math.min(max, Math.round(val)));
    onChange(current);
  }

  function scrollToValue(val, smooth = false) {
    val = Math.max(1, Math.min(max, Math.round(val)));
    let item = list.querySelector(`[data-value="${val}"]`);
    if (!item) {
      buildItems(val);
      item = list.querySelector(`[data-value="${val}"]`);
    }
    if (!item) return;
    const left = item.offsetLeft - drum.clientWidth / 2 + ITEM / 2;
    drum.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
  }

  function nearestFromScroll() {
    const drumRect = drum.getBoundingClientRect();
    const centerX = drumRect.left + drum.clientWidth / 2;
    let best = null;
    let bestDist = Infinity;
    list.querySelectorAll('.reps-stripe-item').forEach((el) => {
      const r = el.getBoundingClientRect();
      const mid = r.left + r.width / 2;
      const d = Math.abs(mid - centerX);
      if (d < bestDist) {
        bestDist = d;
        best = el;
      }
    });
    return best ? parseInt(best.dataset.value, 10) : current;
  }

  drum.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const val = nearestFromScroll();
      if (val !== current) emit(val);
    }, 80);
  }, { passive: true });

  host.appendChild(wrap);
  buildItems(current);
  requestAnimationFrame(() => scrollToValue(current, false));

  return {
    setValue(v) {
      const n = v != null ? Math.round(v) : current;
      if (n === current) return;
      current = n;
      if (!list.querySelector(`[data-value="${n}"]`)) buildItems(n);
      scrollToValue(n, false);
    },
    destroy() {
      clearTimeout(scrollTimer);
      host.innerHTML = '';
    },
  };
}
