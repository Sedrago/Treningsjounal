/**
 * importexport.js – eksport (JSON, CSV, Excel-CSV, PDF-rapport)
 * og import (JSON, CSV) av treningsdata. Alt skjer lokalt i nettleseren.
 */

import * as store from './store.js';
import * as stats from './stats.js';
import { esc, fmtNum, fmtVolume, todayStr, uuid, fmtClock, parseDurationInput } from './utils.js';

/* ---------- Hjelpere ---------- */

function download(filename, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[";\n,]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

/* ---------- Eksport ---------- */

/** Full JSON-eksport (kan importeres igjen som backup). */
export async function exportJson() {
  const data = {
    format: 'treningsjournal-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    exercises: await store.getExercises({ includeInactive: true }),
    workouts: await store.getWorkouts(),
    sets: await store.getAllSets(),
    bodyweight: await store.getBodyweights(),
    aerobic: await store.getAerobicSessions(),
    sleep: await store.getSleepEntries(),
    mood: await store.getMoodEntries(),
    foodPresets: await store.getFoodPresets(),
    foodIntakes: await store.getAllFoodIntakes(),
    lactate: await store.getLactateEntries(),
  };
  download(`treningsjournal-${todayStr()}.json`, JSON.stringify(data, null, 2), 'application/json');
}

/** CSV med alle sett (beriket med dato/øvelse/kategori). */
async function buildSetsCsv(separator) {
  const enriched = await store.getEnrichedSets();
  const header = ['dato', 'kategori', 'ovelse', 'sett', 'kg', 'reps', 'rir', 'varighet', 'kommentar'];
  const lines = [header.join(separator)];
  for (const s of enriched) {
    lines.push([
      s.date, s.category, csvEscape(s.exerciseName), s.setNumber,
      s.weight ?? '', s.reps ?? '', s.rir ?? '',
      s.durationSec != null ? fmtClock(s.durationSec) : '', csvEscape(s.comment),
    ].join(separator));
  }
  return lines.join('\r\n');
}

export async function exportCsv() {
  const csv = await buildSetsCsv(',');
  download(`treningsjournal-${todayStr()}.csv`, csv, 'text/csv;charset=utf-8');
}

/** Excel-vennlig CSV: BOM + semikolon (norsk locale). */
export async function exportExcel() {
  const csv = await buildSetsCsv(';');
  download(`treningsjournal-${todayStr()}-excel.csv`, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
}

/** PDF-rapport via nettleserens utskriftsdialog. */
export async function exportPdf() {
  const enriched = await store.getEnrichedSets();
  const dates = stats.workoutDates(enriched);
  const byExercise = stats.groupBy(enriched, (s) => s.exerciseId);
  const records = [...byExercise.entries()]
    .map(([, exSets]) => ({
      name: exSets[0].exerciseName,
      pr: stats.personalRecord(exSets),
      oneRM: stats.best1RM(exSets),
      sessions: new Set(exSets.map((s) => s.date)).size,
    }))
    .filter((r) => r.pr)
    .sort((a, b) => b.oneRM - a.oneRM);

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
    <html lang="nb"><head><meta charset="utf-8"><title>Treningsjournal – rapport</title>
    <style>
      body { font-family: -apple-system, sans-serif; margin: 2rem; color: #111; }
      h1 { font-size: 1.6rem; } h2 { font-size: 1.15rem; margin-top: 1.6rem; }
      table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
      th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; }
      th { background: #f0f0f0; }
    </style></head><body>
    <h1>Treningsjournal – rapport</h1>
    <p>Generert ${todayStr()} · ${dates.length} økter · ${fmtVolume(stats.totalVolume(enriched))} kg totalt volum</p>
    <h2>Personlige rekorder</h2>
    <table><tr><th>Øvelse</th><th>PR</th><th>Est. 1RM</th><th>Økter</th></tr>
    ${records.map((r) => `<tr><td>${esc(r.name)}</td><td>${fmtNum(r.pr.weight)} kg × ${r.pr.reps ?? '–'}</td>
      <td>${fmtNum(r.oneRM, 0)} kg</td><td>${r.sessions}</td></tr>`).join('')}
    </table>
    <h2>Alle sett</h2>
    <table><tr><th>Dato</th><th>Øvelse</th><th>Sett</th><th>Kg</th><th>Reps</th><th>RIR</th><th>Kommentar</th></tr>
    ${enriched.slice().reverse().map((s) => `<tr><td>${s.date}</td><td>${esc(s.exerciseName)}</td>
      <td>${s.setNumber}</td><td>${s.weight ?? ''}</td><td>${s.reps ?? ''}</td><td>${s.rir ?? ''}</td>
      <td>${esc(s.comment)}</td></tr>`).join('')}
    </table>
    <script>window.onload = () => window.print();</` + `script>
    </body></html>`);
  win.document.close();
}

/* ---------- Import ---------- */

/** Importerer en JSON-backup (samme format som exportJson). */
export async function importJson(text) {
  const data = JSON.parse(text);
  if (data.format !== 'treningsjournal-backup') throw new Error('Ukjent JSON-format');
  let count = 0;
  for (const e of data.exercises || []) { await store.saveExercise(e); count++; }
  for (const w of data.workouts || []) { await store.saveWorkout(w); count++; }
  for (const s of data.sets || []) { await store.saveSet(s); count++; }
  for (const b of data.bodyweight || []) { await store.saveBodyweight(b); count++; }
  for (const a of data.aerobic || []) { await store.saveAerobicSession(a); count++; }
  for (const s of data.sleep || []) { await store.saveSleepEntry(s); count++; }
  for (const m of data.mood || []) { await store.saveMoodEntry(m); count++; }
  for (const p of data.foodPresets || []) { await store.saveFoodPreset(p); count++; }
  for (const i of data.foodIntakes || []) { await store.saveFoodIntake(i); count++; }
  for (const l of data.lactate || []) { await store.saveLactateEntry(l); count++; }
  return count;
}

/**
 * Importerer CSV med kolonnene dato,kategori,ovelse,sett,kg,reps,rir,kommentar
 * (samme format som eksporten, komma eller semikolon).
 * Øvelser opprettes automatisk hvis de ikke finnes.
 */
export async function importCsv(text) {
  const sep = text.split('\n')[0].includes(';') ? ';' : ',';
  const rows = parseCsv(text, sep);
  if (!rows.length) throw new Error('Tom CSV-fil');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  if (col('dato') === -1 || col('ovelse') === -1) throw new Error('CSV mangler kolonnene «dato»/«ovelse»');

  const exercises = await store.getExercises({ includeInactive: true });
  const exByName = new Map(exercises.map((e) => [e.name.toLowerCase(), e]));
  const workoutByDate = new Map((await store.getWorkouts()).map((w) => [w.date, w]));
  let count = 0;

  for (const row of rows.slice(1)) {
    if (!row.length || !row[col('dato')]) continue;
    const date = row[col('dato')].trim();
    const name = row[col('ovelse')].trim();
    if (!date || !name) continue;

    let exercise = exByName.get(name.toLowerCase());
    if (!exercise) {
      const category = row[col('kategori')]?.trim() || 'valgfri';
      exercise = await store.saveExercise({
        name,
        category: store.categoryById(category) ? category : 'valgfri',
      });
      exByName.set(name.toLowerCase(), exercise);
    }

    let workout = workoutByDate.get(date);
    if (!workout) {
      workout = await store.saveWorkout({
        id: uuid(), date, startedAt: null, duration: 0, bodyweight: null, notes: '', deleted: false,
      });
      workoutByDate.set(date, workout);
    }

    const num = (i) => {
      const v = i === -1 ? '' : String(row[i] ?? '').trim().replace(',', '.');
      return v === '' ? null : Number(v);
    };
    const durCol = col('varighet');
    const durRaw = durCol === -1 ? '' : String(row[durCol] ?? '').trim();
    await store.saveSet({
      workoutId: workout.id,
      exerciseId: exercise.id,
      setNumber: num(col('sett')) || 1,
      weight: num(col('kg')),
      reps: num(col('reps')),
      rir: num(col('rir')),
      durationSec: durRaw ? parseDurationInput(durRaw) : null,
      comment: col('kommentar') === -1 ? '' : (row[col('kommentar')] || '').trim(),
    });
    count++;
  }
  return count;
}

/** Minimal CSV-parser med støtte for anførselstegn. */
function parseCsv(text, sep) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === sep) {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}
