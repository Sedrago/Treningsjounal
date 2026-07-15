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
  const min = Number(exercise?.goalRepsMin) || 8;
  const max = Number(exercise?.goalRepsMax) || 10;
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
 * Horisontal verdi-linje (reps, kg …). Senter = valgt verdi.
 * @returns {{ setValue: (v: number|null) => void, destroy: () => void }}
 */
export function mountValueStrip(host, {
  label,
  value,
  centerHint = 8,
  step = 1,
  min = 0,
  max = 100,
  range = 50,
  format = (v) => String(v),
  parse = (s) => parseFloat(s),
  onChange,
  compact = false,
}) {
  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = `verdi-stripe ${compact ? 'verdi-stripe-kompakt' : ''}`;
  wrap.innerHTML = `
    ${label ? `<p class="pill-etikett verdi-stripe-etikett">${label}</p>` : ''}
    <div class="verdi-stripe-rad">
      <div class="verdi-stripe-trommel" aria-label="${label || 'Velg verdi'}">
        <ul class="verdi-stripe-liste"></ul>
      </div>
    </div>`;

  const drum = wrap.querySelector('.verdi-stripe-trommel');
  const list = wrap.querySelector('.verdi-stripe-liste');
  const ITEM = compact ? 40 : 44;
  const PAD = ITEM * 3;
  let current = value ?? centerHint ?? min;

  function snap(val) {
    if (step === 1) return Math.max(min, Math.min(max, Math.round(val)));
    return Math.max(min, Math.min(max, Math.round(val / step) * step));
  }

  function buildItems(center) {
    const c = snap(center);
    const span = step > 1 ? range * step : range;
    const lo = Math.max(min, c - span);
    const hi = Math.min(max, c + span);
    list.innerHTML = '';
    list.style.paddingLeft = `${PAD}px`;
    list.style.paddingRight = `${PAD}px`;
    for (let v = lo; v <= hi + step * 0.001; v += step) {
      const val = Math.round(v * 100) / 100;
      const li = document.createElement('li');
      li.className = 'verdi-stripe-item';
      li.dataset.value = String(val);
      li.textContent = format(val);
      list.appendChild(li);
    }
    updateHighlight(current);
  }

  function updateHighlight(val) {
    list.querySelectorAll('.verdi-stripe-item').forEach((el) => {
      const v = parse(el.dataset.value);
      el.classList.toggle('sentrert', Math.abs(v - val) < step * 0.01);
    });
  }

  let scrollTimer = null;
  let rafId = null;

  function emit(val) {
    const next = snap(val);
    if (Math.abs(next - current) < step * 0.01) {
      updateHighlight(current);
      return;
    }
    current = next;
    updateHighlight(current);
    onChange(current);
  }

  function scrollToValue(val, smooth = false) {
    val = snap(val);
    let item = [...list.querySelectorAll('.verdi-stripe-item')]
      .find((el) => Math.abs(parse(el.dataset.value) - val) < step * 0.01);
    if (!item) {
      buildItems(val);
      item = [...list.querySelectorAll('.verdi-stripe-item')]
        .find((el) => Math.abs(parse(el.dataset.value) - val) < step * 0.01);
    }
    if (!item) return;
    const left = item.offsetLeft - drum.clientWidth / 2 + ITEM / 2;
    drum.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
    updateHighlight(val);
  }

  function nearestFromScroll() {
    const drumRect = drum.getBoundingClientRect();
    const centerX = drumRect.left + drum.clientWidth / 2;
    let best = null;
    let bestDist = Infinity;
    list.querySelectorAll('.verdi-stripe-item').forEach((el) => {
      const r = el.getBoundingClientRect();
      const mid = r.left + r.width / 2;
      const d = Math.abs(mid - centerX);
      if (d < bestDist) {
        bestDist = d;
        best = el;
      }
    });
    return best ? parse(best.dataset.value) : current;
  }

  function onScroll() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const val = nearestFromScroll();
      updateHighlight(val);
    });
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const val = nearestFromScroll();
      if (Math.abs(val - current) >= step * 0.01) emit(val);
    }, 35);
  }

  drum.addEventListener('scroll', onScroll, { passive: true });

  host.appendChild(wrap);
  current = snap(current);
  buildItems(current);
  requestAnimationFrame(() => {
    scrollToValue(current, false);
    onChange(current);
  });

  return {
    getValue: () => current,
    setValue(v) {
      const n = v != null ? snap(v) : current;
      current = n;
      scrollToValue(n, false);
      updateHighlight(n);
      onChange(n);
    },
    destroy() {
      clearTimeout(scrollTimer);
      if (rafId) cancelAnimationFrame(rafId);
      host.innerHTML = '';
    },
  };
}

/** Horisontal kg-linje (0,5 kg / 1 lb intervaller). */
export function mountWeightStrip(host, { valueKg, units, onChange, compact = false }) {
  const step = weightStep(units);
  const unit = weightUnit(units);
  const hop = 10;
  const display = valueKg != null ? snapDisplay(toDisplayWeight(valueKg, units), units) : 40;

  host.innerHTML = '';
  const shell = document.createElement('div');
  shell.className = `verdi-stripe ${compact ? 'verdi-stripe-kompakt' : ''} verdi-stripe-shell`;
  shell.innerHTML = `
    <p class="pill-etikett verdi-stripe-etikett">${unit}</p>
    <div class="verdi-stripe-rad verdi-stripe-rad--hopp">
      <button type="button" class="verdi-stripe-hopp" data-hop="${-hop}" aria-label="10 ${unit} mindre">−10</button>
      <div class="verdi-stripe-hopp-mid"></div>
      <button type="button" class="verdi-stripe-hopp" data-hop="${hop}" aria-label="10 ${unit} mer">+10</button>
    </div>`;
  host.appendChild(shell);

  const strip = mountValueStrip(shell.querySelector('.verdi-stripe-hopp-mid'), {
    label: '',
    value: display,
    centerHint: display,
    step,
    min: 0,
    max: 300,
    range: compact ? 100 : 60,
    format: (v) => fmtNum(v, v % 1 === 0 ? 0 : 1),
    onChange: (d) => onChange(fromInputWeight(d, units)),
    compact,
  });

  shell.querySelectorAll('.verdi-stripe-hopp').forEach((btn) => {
    btn.addEventListener('click', () => {
      const delta = Number(btn.dataset.hop);
      const next = Math.max(0, snapDisplay(strip.getValue() + delta, units));
      strip.setValue(next);
    });
  });

  return {
    getValue: () => strip.getValue(),
    getValueKg: () => fromInputWeight(strip.getValue(), units),
    setValue(v) {
      if (v == null) return;
      strip.setValue(snapDisplay(toDisplayWeight(v, units), units));
    },
    destroy() {
      strip.destroy();
      host.innerHTML = '';
    },
  };
}

/**
 * Horisontal reps-linje: senterverdi med naboer, kan dras sideveis (1–100+).
 * @returns {{ setValue: (v: number|null) => void, destroy: () => void }}
 */
export function mountRepStrip(host, { value, centerHint = 8, max = 100, onChange, compact = false }) {
  return mountValueStrip(host, {
    label: 'Reps',
    value,
    centerHint,
    step: 1,
    min: 1,
    max,
    range: compact ? 30 : 20,
    format: (v) => String(Math.round(v)),
    onChange,
    compact,
  });
}

/**
 * Timer og minutter for søvnlogging (+/− steppere).
 * @returns {{ getValue: () => {hours:number, minutes:number}, destroy: () => void }}
 */
export function mountSleepDurationPicker(host, { hours = 7, minutes = 30, onChange } = {}) {
  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'sovn-varighet-rad';

  let h = Math.max(0, Math.min(14, Math.round(Number(hours) || 0)));
  let m = Math.max(0, Math.min(59, Math.round(Number(minutes) || 0)));
  const emit = () => onChange?.({ hours: h, minutes: m });

  function mountStepper(parent, label, { get, set, min, max, step = 1 }) {
    const field = document.createElement('div');
    field.className = 'sovn-varighet-felt';
    field.innerHTML = `
      <p class="pill-etikett verdi-stripe-etikett">${label}</p>
      <div class="sovn-teller">
        <button type="button" class="sovn-teller-knapp" data-delta="${-step}" aria-label="${label} mindre">−</button>
        <span class="sovn-teller-verdi" aria-live="polite"></span>
        <button type="button" class="sovn-teller-knapp" data-delta="${step}" aria-label="${label} mer">+</button>
      </div>`;

    const valEl = field.querySelector('.sovn-teller-verdi');
    const buttons = [...field.querySelectorAll('.sovn-teller-knapp')];
    const decBtn = buttons.find((b) => Number(b.dataset.delta) < 0);
    const incBtn = buttons.find((b) => Number(b.dataset.delta) > 0);

    const sync = () => {
      valEl.textContent = String(get());
      decBtn.disabled = get() <= min;
      incBtn.disabled = get() >= max;
    };

    field.querySelectorAll('.sovn-teller-knapp').forEach((btn) => {
      btn.addEventListener('click', () => {
        const delta = Number(btn.dataset.delta);
        const next = Math.max(min, Math.min(max, get() + delta));
        if (next === get()) return;
        set(next);
        sync();
        emit();
      });
    });

    sync();
    parent.appendChild(field);
  }

  mountStepper(wrap, 'Timer', {
    get: () => h,
    set: (v) => { h = v; },
    min: 0,
    max: 14,
    step: 1,
  });

  mountStepper(wrap, 'Minutter', {
    get: () => m,
    set: (v) => { m = v; },
    min: 0,
    max: 59,
    step: 1,
  });

  host.appendChild(wrap);

  return {
    getValue: () => ({ hours: h, minutes: m }),
    destroy: () => { host.innerHTML = ''; },
  };
}
