/**
 * charts.js – lettvekts SVG-grafer uten avhengigheter.
 * Linjediagram, stolpediagram og aktivitets-heatmap.
 */

import { esc, todayStr } from './utils.js';

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
 * Aktivitets-heatmap à la GitHub: siste ~26 uker, én kolonne per uke.
 * @param {HTMLElement} container
 * @param {Map<string, number>} data  'YYYY-MM-DD' → volum
 */
export function heatmap(container, data, weeks = 26) {
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
      title.textContent = `${key}: ${Math.round(vol)} kg volum`;
      rect.appendChild(title);
      svg.appendChild(rect);
      d.setDate(d.getDate() + 1);
    }
  }
  container.appendChild(svg);
}

/**
 * Mini-søylevisning for ukentlig kategoribalanse (ren HTML).
 * @param {Array<{icon:string, name:string, count:number}>} items
 */
export function balanceBars(items) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return items.map((i) => `
    <div class="balanse-rad">
      <span class="balanse-ikon" aria-hidden="true">${i.icon}</span>
      <span class="balanse-navn">${esc(i.name)}</span>
      <span class="balanse-spor"><span class="balanse-fyll ${i.count ? '' : 'tom'}" style="width:${(i.count / max) * 100}%"></span></span>
      <span class="balanse-tall">${i.count}</span>
    </div>`).join('');
}
