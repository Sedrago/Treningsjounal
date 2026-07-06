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

/** Sekunder → 'M:SS'. */
export function fmtClock(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** HTML-escaping for trygg rendering av brukertekst. */
export function esc(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
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
