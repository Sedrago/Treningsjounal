/**
 * utils.js – små hjelpefunksjoner uten avhengigheter.
 */

/** Genererer en unik id (uuid v4). */
export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Nå som ISO-streng. */
export function nowIso() {
  return new Date().toISOString();
}

/** Dagens dato som 'YYYY-MM-DD' (lokal tid). */
export function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parser 'YYYY-MM-DD' til Date (lokal midnatt). */
export function parseDate(str) {
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(y, m - 1, d);
}

const MND = ['januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const DAGER = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];

/** '2026-07-04' → 'lørdag 4. juli'. */
export function formatDateLong(str) {
  const d = parseDate(str);
  return `${DAGER[d.getDay()]} ${d.getDate()}. ${MND[d.getMonth()]}`;
}

/** '2026-07-04' → '4. jul 2026'. */
export function formatDateShort(str) {
  const d = parseDate(str);
  return `${d.getDate()}. ${MND[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

/** Antall hele dager mellom to datostrenger (b - a). */
export function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

/** 'i dag', 'i går', 'for 3 dager siden'. */
export function relativeDays(dateStr) {
  const n = daysBetween(dateStr, todayStr());
  if (n <= 0) return 'i dag';
  if (n === 1) return 'i går';
  return `for ${n} dager siden`;
}

/** ISO-ukenøkkel, f.eks. '2026-W27'. */
export function isoWeekKey(d) {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  // Torsdag i samme uke avgjør året.
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  const week = 1 + Math.round(((date - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${date.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Dato-streng for N dager siden (0 = i dag). */
export function daysAgoStr(n, from = new Date()) {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() - n);
  return todayStr(d);
}

/** Første dato (inkl.) i et vindu på `days` dager som slutter i dag. */
export function windowStartStr(days) {
  return daysAgoStr(Math.max(0, days - 1));
}

/** Mandag i uken til gitt dato. */
export function startOfWeek(d) {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}

/** Syv datoer (man–søn) for uken som inneholder `dateStr`. */
export function datesForWeek(dateStr) {
  const start = startOfWeek(parseDate(dateStr));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return todayStr(d);
  });
}

/** Datoer fra `daysBack` dager før til `daysForward` dager etter `dateStr` (inklusive). */
export function datesAround(dateStr, daysBack = 7, daysForward = 7) {
  return Array.from({ length: daysBack + daysForward + 1 }, (_, i) => addDaysStr(dateStr, i - daysBack));
}

/** Legg til / trekk fra dager på en datostreng. */
export function addDaysStr(dateStr, days) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return todayStr(d);
}

const UKEDAG_KORT = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];

/** Kort ukedag for datostreng ('man', 'tir', …). */
export function weekdayShort(dateStr) {
  return UKEDAG_KORT[parseDate(dateStr).getDay()];
}

/** Estimert 1RM (Epley). Reps=1 gir vekten selv. */
export function epley1RM(weight, reps) {
  if (!weight || !reps) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

const KG_PER_LB = 0.45359237;

/** Konverterer kg til visningsenhet. */
export function toDisplayWeight(kg, units) {
  if (units === 'imperial') return kg / KG_PER_LB;
  return kg;
}

/** Konverterer inputverdi (i visningsenhet) til kg. */
export function fromInputWeight(value, units) {
  if (units === 'imperial') return value * KG_PER_LB;
  return value;
}

/** Enhetsetikett. */
export function weightUnit(units) {
  return units === 'imperial' ? 'lb' : 'kg';
}

/** Pent tall: 82.5 → '82,5', 80 → '80'. */
export function fmtNum(n, decimals = 1) {
  if (n == null || isNaN(n)) return '–';
  const rounded = Math.round(n * 10 ** decimals) / 10 ** decimals;
  return String(rounded).replace('.', ',');
}

/** Protein/karbo i gram: desimal kun når nødvendig (1,3 / 12). */
export function fmtMacroG(n) {
  if (n == null || Number.isNaN(Number(n))) return '–';
  const x = Number(n);
  if (Math.abs(x - Math.round(x)) < 1e-9) return fmtNum(x, 0);
  return fmtNum(x, 1);
}

/** Volum-tall med tusenskille: 12345 → '12 345'. */
export function fmtVolume(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
}

/** Minutter → '1 t 25 min' / '45 min'. */
export function fmtDuration(minutes) {
  if (!minutes) return '–';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h} t ${m} min` : `${m} min`;
}

/** Desimal timer → '7 t 30 min' / '8 t'. */
export function fmtSleepHours(hours) {
  if (hours == null || Number.isNaN(hours)) return '–';
  const totalMin = Math.round(Number(hours) * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (m === 0) return `${h} t`;
  return `${h} t ${m} min`;
}

/** Desimal timer → heltall timer og minutter. */
export function splitSleepHours(hours) {
  const totalMin = Math.round(Number(hours) * 60);
  return { hours: Math.floor(totalMin / 60), minutes: totalMin % 60 };
}

/** Timer og minutter → desimal timer (lagring). */
export function sleepHoursFromParts(hours, minutes) {
  return Math.round((Number(hours) + Number(minutes) / 60) * 1000) / 1000;
}

/** Sekunder → 'M:SS'. */
export function fmtClock(totalSec) {
  if (totalSec == null || Number.isNaN(totalSec)) return '–';
  const sec = Math.max(0, Math.round(Number(totalSec)));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Parser varighet fra '90', '1:30' osv. → sekunder. */
export function parseDurationInput(value) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  if (v.includes(':')) {
    const [minPart, secPart] = v.split(':');
    const m = parseInt(minPart, 10) || 0;
    const s = parseInt(secPart, 10) || 0;
    return m * 60 + s;
  }
  const n = parseInt(v.replace(',', '.'), 10);
  return Number.isNaN(n) ? null : Math.max(0, n);
}

/** Viser ett sett kompakt (historikk, dagens økt). */
export function summarizeSet(set, logMode, units = 'metric') {
  const mode = logMode || 'weight';
  if (mode === 'duration' || set.durationSec != null) {
    return fmtClock(set.durationSec);
  }
  const reps = set.reps ?? '–';
  if (mode === 'bodyweight') {
    if (set.weight != null) {
      return `${fmtNum(toDisplayWeight(set.weight, units))} ${weightUnit(units)} · ${reps}`;
    }
    return `${reps} reps`;
  }
  const w = set.weight != null ? `${fmtNum(toDisplayWeight(set.weight, units))} ${weightUnit(units)}` : '–';
  return `${w} × ${reps}`;
}

/** HTML-escaping for trygg rendering av brukertekst. */
export function esc(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** CSS-selektor for plan-mal-felt knyttet til en øvelse. */
export function planMalSelector(exerciseId) {
  const id = String(exerciseId ?? '');
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return `[data-plan-mal="${CSS.escape(id)}"]`;
  }
  return `[data-plan-mal="${id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
}

/** Rendrer kategori-ikon som bilde eller emoji (fallback). */
export function categoryIconHtml(category, className = 'kategori-ikon') {
  const icon = category?.icon;
  if (!icon) return '';
  if (/\.(jpg|jpeg|png|webp|svg)$/i.test(icon) || icon.includes('/')) {
    return `<img class="${esc(className)}" src="${esc(icon)}" alt="" aria-hidden="true" loading="lazy">`;
  }
  return `<span class="${esc(className)}" aria-hidden="true">${icon}</span>`;
}

/** Debounce. */
export function debounce(fn, ms = 400) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Enkel toast-melding nederst på skjermen. */
export function toast(message, type = 'info') {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', 'status');
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('vis'));
  setTimeout(() => {
    el.classList.remove('vis');
    setTimeout(() => el.remove(), 300);
  }, 2600);
}
