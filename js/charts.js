/**
 * charts.js – lettvekts SVG-grafer uten avhengigheter.
 * Linjediagram, stolpediagram og aktivitets-heatmap.
 */

import { esc, todayStr, categoryIconHtml } from './utils.js';

const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/**
 * Linjediagram.
 * @param {HTMLElement} container
 * @param {Array<{label:string, value:number}>} points
 * @param {{unit?:string, height?:number}} opts
 */
export function lineChart(container, points, opts = {}) {
  container.innerHTML = '';
  if (points.length < 2) {
    container.innerHTML = '<p class="tomt">Trenger minst to datapunkter.</p>';
    return;
  }
  const W = 600; const H = opts.height || 220;
  const pad = { t: 14, r: 14, b: 28, l: 44 };
  const values = points.map((p) => p.value);
  let min = Math.min(...values); let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  min -= span * 0.08; max += span * 0.08;

  const x = (i) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'graf', role: 'img' });

  // Horisontale hjelpelinjer + akseetiketter (desimal ved små spenn).
  const decimals = max - min < 5 ? 1 : 0;
  for (let i = 0; i <= 3; i++) {
    const v = min + ((max - min) * i) / 3;
    const yy = y(v);
    svg.appendChild(svgEl('line', { x1: pad.l, y1: yy, x2: W - pad.r, y2: yy, class: 'graf-grid' }));
    const label = svgEl('text', { x: pad.l - 6, y: yy + 4, class: 'graf-akse', 'text-anchor': 'end' });
    label.textContent = v.toFixed(decimals).replace('.', ',');
    svg.appendChild(label);
  }

  // Areal under linjen.
  const linePts = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const area = svgEl('polygon', {
    points: `${pad.l},${H - pad.b} ${linePts} ${W - pad.r},${H - pad.b}`,
    class: 'graf-areal',
  });
  svg.appendChild(area);
  svg.appendChild(svgEl('polyline', { points: linePts, class: 'graf-linje', fill: 'none' }));

  // Punkter.
  points.forEach((p, i) => {
    svg.appendChild(svgEl('circle', { cx: x(i), cy: y(p.value), r: 3.5, class: 'graf-punkt' }));
  });

  // X-etiketter (maks ~6).
  const step = Math.max(1, Math.ceil(points.length / 6));
  points.forEach((p, i) => {
    if (i % step !== 0 && i !== points.length - 1) return;
    const label = svgEl('text', { x: x(i), y: H - 8, class: 'graf-akse', 'text-anchor': 'middle' });
    label.textContent = p.label;
    svg.appendChild(label);
  });

  container.appendChild(svg);
}

/**
 * Stolpediagram.
 * @param {HTMLElement} container
 * @param {Array<{label:string, value:number}>} bars
 */
export function barChart(container, bars, opts = {}) {
  container.innerHTML = '';
  if (!bars.length || bars.every((b) => b.value === 0)) {
    container.innerHTML = '<p class="tomt">Ingen data ennå.</p>';
    return;
  }
  const W = 600; const H = opts.height || 200;
  const pad = { t: 14, r: 8, b: 26, l: 8 };
  const max = Math.max(...bars.map((b) => b.value)) || 1;
  const innerW = W - pad.l - pad.r;
  const gap = 6;
  const barW = innerW / bars.length - gap;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'graf', role: 'img' });
  bars.forEach((b, i) => {
    const h = Math.max(2, (b.value / max) * (H - pad.t - pad.b));
    const bx = pad.l + i * (barW + gap) + gap / 2;
    const by = H - pad.b - h;
    svg.appendChild(svgEl('rect', {
      x: bx, y: by, width: barW, height: h, rx: 4,
      class: b.value ? 'graf-stolpe' : 'graf-stolpe tom',
    }));
    const label = svgEl('text', { x: bx + barW / 2, y: H - 8, class: 'graf-akse', 'text-anchor': 'middle' });
    label.textContent = b.label;
    svg.appendChild(label);
  });
  container.appendChild(svg);
}

/**
 * Saldo-graf: mengde, intensitet og styrke (100 = vanlig nivå).
 * @param {HTMLElement} container
 * @param {Array<{label:string, volume:number|null, intensity:number|null, strength:number|null}>} weeks
 */
export function saldoChart(container, weeks) {
  container.innerHTML = '';
  const series = [
    { key: 'volume', name: 'Mengde', class: 'graf-linje-mengde' },
    { key: 'intensity', name: 'Intensitet', class: 'graf-linje-intensitet' },
    { key: 'strength', name: 'Styrke', class: 'graf-linje-styrke' },
  ];

  const hasData = weeks.some((w) => w.volume != null || w.intensity != null || w.strength != null);
  if (!hasData) {
    container.innerHTML = '<p class="tomt">Logg noen økter for å se utvikling.</p>';
    return;
  }

  const W = 600; const H = 240;
  const pad = { t: 20, r: 14, b: 28, l: 44 };
  const labels = weeks.map((w) => w.label);

  const allValues = [100];
  weeks.forEach((w) => {
    for (const s of series) {
      if (w[s.key] != null) allValues.push(w[s.key]);
    }
  });
  let min = Math.min(...allValues);
  let max = Math.max(...allValues);
  if (min === max) { min -= 5; max += 5; }
  const span = max - min;
  min = Math.min(min, 95);
  max = Math.max(max, 105);
  min -= span * 0.05;
  max += span * 0.05;

  const x = (i) => pad.l + (i / Math.max(1, weeks.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'graf saldo-graf', role: 'img' });
  svg.setAttribute('aria-label', 'Saldo for mengde, intensitet og styrke');

  // Referanselinje 100.
  const y100 = y(100);
  svg.appendChild(svgEl('line', {
    x1: pad.l, y1: y100, x2: W - pad.r, y2: y100,
    class: 'graf-baseline',
  }));
  const baseLabel = svgEl('text', { x: W - pad.r, y: y100 - 4, class: 'graf-akse', 'text-anchor': 'end' });
  baseLabel.textContent = '100';
  svg.appendChild(baseLabel);

  for (let i = 0; i <= 3; i++) {
    const v = min + ((max - min) * i) / 3;
    const yy = y(v);
    svg.appendChild(svgEl('line', { x1: pad.l, y1: yy, x2: W - pad.r, y2: yy, class: 'graf-grid' }));
    const label = svgEl('text', { x: pad.l - 6, y: yy + 4, class: 'graf-akse', 'text-anchor': 'end' });
    label.textContent = Math.round(v);
    svg.appendChild(label);
  }

  for (const s of series) {
    const pts = [];
    weeks.forEach((w, i) => {
      if (w[s.key] != null) pts.push({ i, v: w[s.key] });
    });
    if (pts.length < 2) continue;
    const linePts = pts.map((p) => `${x(p.i)},${y(p.v)}`).join(' ');
    svg.appendChild(svgEl('polyline', { points: linePts, class: s.class, fill: 'none' }));
    pts.forEach((p) => {
      svg.appendChild(svgEl('circle', { cx: x(p.i), cy: y(p.v), r: 3, class: s.class.replace('linje', 'punkt') }));
    });
  }

  const step = Math.max(1, Math.ceil(weeks.length / 6));
  weeks.forEach((w, i) => {
    if (i % step !== 0 && i !== weeks.length - 1) return;
    const label = svgEl('text', { x: x(i), y: H - 8, class: 'graf-akse', 'text-anchor': 'middle' });
    label.textContent = w.label;
    svg.appendChild(label);
  });

  container.appendChild(svg);

  const legend = document.createElement('div');
  legend.className = 'saldo-forklaring';
  legend.innerHTML = series.map((s) =>
    `<span class="saldo-forklaring-rad"><span class="saldo-farge ${s.class.replace('graf-linje-', '')}" aria-hidden="true"></span>${s.name}</span>`,
  ).join('');
  container.appendChild(legend);
}

/**
 * Glatt kurve gjennom datapunkter (Catmull-Rom → cubic bezier).
 */
function smoothPath(pts, xFn, yFn) {
  if (pts.length < 2) return '';
  if (pts.length === 2) {
    return `M ${xFn(pts[0].i)},${yFn(pts[0].v)} L ${xFn(pts[1].i)},${yFn(pts[1].v)}`;
  }
  let d = `M ${xFn(pts[0].i)},${yFn(pts[0].v)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = xFn(p1.i) + (xFn(p2.i) - xFn(p0.i)) / 6;
    const cp1y = yFn(p1.v) + (yFn(p2.v) - yFn(p0.v)) / 6;
    const cp2x = xFn(p2.i) - (xFn(p3.i) - xFn(p1.i)) / 6;
    const cp2y = yFn(p2.v) - (yFn(p3.v) - yFn(p1.v)) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${xFn(p2.i)},${yFn(p2.v)}`;
  }
  return d;
}

/** Farge for aktivitets-celle: mengde → metning, intensitet → grønt mot rødt. */
function activityCellFill(volume, intensity) {
  if (volume <= 0) return 'var(--hm-tom)';
  const hue = 132 - intensity * 128;
  const volSat = 38 + volume * 52;
  const volLight = 20 + volume * 28;
  const sat = Math.min(100, volSat + intensity * 32);
  const light = Math.max(14, volLight - intensity * 14);
  return `hsl(${Math.round(hue)} ${Math.round(sat)}% ${Math.round(light)}%)`;
}

/** Blå fyll for aerob-celle (normalisert 0–1). */
function activityAerobFill(aerobic) {
  const sat = 65 + aerobic * 15;
  const light = 40 + aerobic * 22;
  return `hsl(210 ${sat}% ${light}%)`;
}

/**
 * Progresjonsgraf med glatt kurve. Y-akse kan skjules (kun utvikling, ikke tall).
 * @param {HTMLElement} container
 * @param {Array<{label:string, value:number|null, baseline?:number|null}>} points
 * @param {{ hideYAxis?: boolean, referenceLine?: number, lineClass?: string, showBaseline?: boolean }} opts
 */
export function progressionChart(container, points, opts = {}) {
  container.innerHTML = '';
  const valid = points.filter((p) => p.value != null);
  if (valid.length < 2) {
    container.innerHTML = '<p class="tomt">Trenger minst to uker med data.</p>';
    return;
  }

  const W = 600; const H = opts.height || 200;
  const pad = { t: 16, r: 14, b: 28, l: opts.hideYAxis ? 14 : 44 };

  const values = valid.map((p) => p.value);
  const baselineVals = opts.showBaseline
    ? points.filter((p) => p.baseline != null).map((p) => p.baseline)
    : [];
  let min = Math.min(...values, ...(baselineVals.length ? baselineVals : values));
  let max = Math.max(...values, ...(baselineVals.length ? baselineVals : values));
  if (opts.referenceLine != null) {
    min = Math.min(min, opts.referenceLine);
    max = Math.max(max, opts.referenceLine);
  }
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  min -= span * 0.12;
  max += span * 0.12;

  const indices = points.map((_, i) => i);
  const x = (i) => pad.l + (i / Math.max(1, points.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'graf progresjon-graf', role: 'img' });
  const lineClass = opts.lineClass || 'graf-linje-progresjon';

  if (!opts.hideYAxis) {
    for (let i = 0; i <= 3; i++) {
      const v = min + ((max - min) * i) / 3;
      const yy = y(v);
      svg.appendChild(svgEl('line', { x1: pad.l, y1: yy, x2: W - pad.r, y2: yy, class: 'graf-grid' }));
      const label = svgEl('text', { x: pad.l - 6, y: yy + 4, class: 'graf-akse', 'text-anchor': 'end' });
      label.textContent = v.toFixed(1).replace('.', ',');
      svg.appendChild(label);
    }
  } else {
    svg.appendChild(svgEl('line', { x1: pad.l, y1: y(min + (max - min) * 0.5), x2: W - pad.r, y2: y(min + (max - min) * 0.5), class: 'graf-grid' }));
  }

  if (opts.referenceLine != null) {
    const yy = y(opts.referenceLine);
    svg.appendChild(svgEl('line', {
      x1: pad.l, y1: yy, x2: W - pad.r, y2: yy,
      class: 'graf-baseline',
    }));
  }

  if (opts.showBaseline) {
    const basePts = points
      .map((p, i) => (p.baseline != null ? { i, v: p.baseline } : null))
      .filter(Boolean);
    if (basePts.length >= 2) {
      const basePath = smoothPath(basePts, x, y);
      svg.appendChild(svgEl('path', { d: basePath, class: 'graf-linje-baseline', fill: 'none' }));
    }
  }

  const pts = points.map((p, i) => (p.value != null ? { i, v: p.value } : null)).filter(Boolean);
  const pathD = smoothPath(pts, x, y);
  svg.appendChild(svgEl('path', { d: pathD, class: lineClass, fill: 'none' }));

  pts.forEach((p) => {
    svg.appendChild(svgEl('circle', {
      cx: x(p.i), cy: y(p.v), r: 3.5,
      class: opts.pointClass || 'graf-punkt-progresjon',
    }));
  });

  const step = Math.max(1, Math.ceil(points.length / 6));
  points.forEach((p, i) => {
    if (i % step !== 0 && i !== points.length - 1) return;
    const label = svgEl('text', { x: x(i), y: H - 8, class: 'graf-akse', 'text-anchor': 'middle' });
    label.textContent = p.label;
    svg.appendChild(label);
  });

  container.appendChild(svg);
}

/**
 * Momentum-kurve: glatt rosa linje, 0–100, uten synlige punkter.
 * @param {HTMLElement} container
 * @param {Array<{label:string, value:number}>} points
 */
export function momentumChart(container, points) {
  container.innerHTML = '';
  if (points.length < 2) {
    container.innerHTML = '<p class="tomt dus">Logg trening noen dager for å se momentum.</p>';
    return;
  }

  const W = 600;
  const H = 160;
  const pad = { t: 12, r: 8, b: 22, l: 8 };
  const min = 0;
  const max = 100;

  const x = (i) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'graf momentum-graf', role: 'img' });
  svg.setAttribute('aria-label', `Momentum de siste ${points.length} dagene`);

  const defs = svgEl('defs');
  const grad = svgEl('linearGradient', { id: 'momentumFill', x1: '0', y1: '0', x2: '0', y2: '1' });
  grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': 'var(--momentum-fill-top)' }));
  grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': 'var(--momentum-fill-bottom)' }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  svg.appendChild(svgEl('line', {
    x1: pad.l, y1: y(50), x2: W - pad.r, y2: y(50), class: 'graf-grid momentum-grid',
  }));

  const pts = points.map((p, i) => ({ i, v: p.value }));
  const pathD = smoothPath(pts, x, y);
  const areaD = `${pathD} L ${x(pts[pts.length - 1].i)},${H - pad.b} L ${x(pts[0].i)},${H - pad.b} Z`;

  svg.appendChild(svgEl('path', { d: areaD, class: 'graf-areal-momentum' }));
  svg.appendChild(svgEl('path', { d: pathD, class: 'graf-linje-momentum', fill: 'none' }));

  const labelIdx = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);
  points.forEach((p, i) => {
    if (!labelIdx.has(i) || !p.label) return;
    const label = svgEl('text', {
      x: x(i), y: H - 6, class: 'graf-akse momentum-akse', 'text-anchor': i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle',
    });
    label.textContent = p.label;
    svg.appendChild(label);
  });

  container.appendChild(svg);
}

/**
 * Aktivitets-heatmap à la GitHub: mengde (grønt) + intensitet (rødt) + aerob-glød (blått).
 * @param {HTMLElement} container
 * @param {Map<string, {volume:number, intensity:number, aerobic:number}>} data
 * @param {number} weeks
 */
export function activityHeatmap(container, data, weeks = 52) {
  container.innerHTML = '';
  const cell = 11; const gap = 3; const padTop = 18;
  const W = weeks * (cell + gap);
  const H = padTop + 7 * (cell + gap);

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (weeks - 1) * 7);

  const wrap = document.createElement('div');
  wrap.className = 'heatmap-wrap';

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'heatmap', role: 'img' });
  svg.setAttribute('aria-label', 'Aktivitet siste året');

  const defs = svgEl('defs');
  const filter = svgEl('filter', { id: 'hm-aerob-glow', x: '-50%', y: '-50%', width: '200%', height: '200%' });
  filter.appendChild(svgEl('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '1.6' }));
  defs.appendChild(filter);
  svg.appendChild(defs);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'];
  let lastMonth = -1;
  const today = todayStr();
  const d = new Date(start.getTime());

  for (let w = 0; w < weeks; w++) {
    const weekStart = new Date(d.getTime());
    if (weekStart.getMonth() !== lastMonth) {
      lastMonth = weekStart.getMonth();
      const label = svgEl('text', {
        x: w * (cell + gap), y: 12,
        class: 'heatmap-maned',
      });
      label.textContent = monthNames[lastMonth];
      svg.appendChild(label);
    }

    for (let day = 0; day < 7; day++) {
      const key = todayStr(d);
      if (key > today) break;
      const cx = w * (cell + gap);
      const cy = padTop + day * (cell + gap);
      const dayData = data.get(key) || { volume: 0, intensity: 0, aerobic: 0 };

      if (dayData.aerobic > 0) {
        const glowPad = 2 + dayData.aerobic * 3;
        svg.appendChild(svgEl('rect', {
          x: cx - glowPad, y: cy - glowPad,
          width: cell + glowPad * 2, height: cell + glowPad * 2,
          rx: 4,
          fill: `hsla(210, 75%, 52%, ${0.2 + dayData.aerobic * 0.45})`,
          filter: 'url(#hm-aerob-glow)',
          class: 'hm-aerob-glow',
        }));
        svg.appendChild(svgEl('rect', {
          x: cx, y: cy,
          width: cell, height: cell, rx: 3,
          fill: activityAerobFill(dayData.aerobic),
          class: 'hm-celle aerob',
        }));
      } else if (dayData.volume <= 0) {
        svg.appendChild(svgEl('rect', {
          x: cx, y: cy,
          width: cell, height: cell, rx: 3,
          fill: 'var(--hm-tom)',
          class: 'hm-celle tom',
        }));
      }

      if (dayData.volume > 0) {
        svg.appendChild(svgEl('rect', {
          x: cx, y: cy,
          width: cell, height: cell, rx: 3,
          fill: activityCellFill(dayData.volume, dayData.intensity),
          class: 'hm-celle aktiv',
        }));
      }

      d.setDate(d.getDate() + 1);
    }
  }

  wrap.appendChild(svg);

  const legend = document.createElement('div');
  legend.className = 'heatmap-forklaring';
  legend.innerHTML = `
    <span class="heatmap-forklaring-rad">
      <span class="heatmap-legend-label">Mindre</span>
      ${[0.2, 0.45, 0.7, 1].map((v) =>
        `<span class="heatmap-legend-brikke" style="background:${activityCellFill(v, 0)}"></span>`,
      ).join('')}
      <span class="heatmap-legend-label">Mer</span>
    </span>
    <span class="heatmap-forklaring-rad">
      <span class="heatmap-legend-brikke intens" style="background:${activityCellFill(0.75, 1)}"></span>
      <span class="heatmap-legend-label">Hardere</span>
      <span class="heatmap-legend-brikke aerob" style="background:${activityAerobFill(0.75)}" aria-hidden="true"></span>
      <span class="heatmap-legend-label">Aerob</span>
    </span>`;

  const outer = document.createElement('div');
  outer.className = 'heatmap-outer';
  outer.appendChild(wrap);
  outer.appendChild(legend);
  container.appendChild(outer);

  // Vis nyeste uker først (siste kolonner til høyre).
  const scrollToEnd = () => { wrap.scrollLeft = wrap.scrollWidth - wrap.clientWidth; };
  scrollToEnd();
  requestAnimationFrame(() => {
    scrollToEnd();
    requestAnimationFrame(scrollToEnd);
  });
}

/**
 * Aktivitets-heatmap à la GitHub: siste ~26 uker, én kolonne per uke.
 * @deprecated Bruk activityHeatmap.
 */
export function heatmap(container, data, weeks = 26, opts = {}) {
  container.innerHTML = '';
  const cell = 12; const gap = 3;
  const W = weeks * (cell + gap);
  const H = 7 * (cell + gap);
  const max = Math.max(1, ...data.values());

  // Start på mandagen `weeks - 1` uker tilbake.
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (weeks - 1) * 7);

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'heatmap', role: 'img' });
  svg.setAttribute('aria-label', 'Treningsaktivitet siste seks måneder');
  const today = todayStr();
  const d = new Date(start.getTime());
  for (let w = 0; w < weeks; w++) {
    for (let day = 0; day < 7; day++) {
      const key = todayStr(d);
      if (key > today) break;
      const vol = data.get(key) || 0;
      let level = 0;
      if (vol > 0) level = 1 + Math.min(3, Math.floor((vol / max) * 3.99));
      const rect = svgEl('rect', {
        x: w * (cell + gap), y: day * (cell + gap),
        width: cell, height: cell, rx: 3,
        class: `hm-celle hm-${level}`,
      });
      const title = svgEl('title');
      title.textContent = opts.valueLabel
        ? opts.valueLabel(vol, key)
        : `${key}: ${Math.round(vol)} kg volum`;
      rect.appendChild(title);
      svg.appendChild(rect);
      d.setDate(d.getDate() + 1);
    }
  }
  container.appendChild(svg);
}

/**
 * Mini-søylevisning for ukentlig kategoribalanse (ren HTML).
 * @param {Array<{category:object, name:string, count:number}>} items
 */
export function balanceBars(items) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return items.map((i) => `
    <div class="balanse-rad">
      ${categoryIconHtml(i.category, 'balanse-ikon')}
      <span class="balanse-navn">${esc(i.name)}</span>
      <span class="balanse-spor"><span class="balanse-fyll ${i.count ? '' : 'tom'}" style="width:${(i.count / max) * 100}%"></span></span>
      <span class="balanse-tall">${i.count}</span>
    </div>`).join('');
}
