/**
 * Retranslater beskrivelser for poster som feilet (navn beholdes på engelsk).
 * Kjør: node scripts/retry-translate.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'data/ovelsesinnhold.json');
const FED_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';

const RETRY_IDS = [
  'ext-Barbell_Shoulder_Press',
  'ext-Around_The_Worlds',
  'ext-Barbell_Deadlift',
  'ext-Bent_Press',
  'ext-Bodyweight_Flyes',
  'ext-Dumbbell_Seated_Box_Jump',
  'ext-Hanging_Pike',
  'ext-Incline_Dumbbell_Flyes_-_With_A_Twist',
  'ext-Kettlebell_Pass_Between_The_Legs',
  'ext-Oblique_Crunches_-_On_The_Floor',
  'ext-One-Arm_Side_Deadlift',
  'ext-One_Arm_Supinated_Dumbbell_Triceps_Extension',
  'ext-Reverse_Triceps_Bench_Press',
  'ext-Seated_Cable_Rows',
  'ext-Standing_Long_Jump',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function translateText(text, attempt = 1) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'en');
  url.searchParams.set('tl', 'no');
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);

  const res = await fetch(url.href);
  if (!res.ok) {
    if (attempt < 5) {
      await sleep(2000 * attempt);
      return translateText(text, attempt + 1);
    }
    throw new Error(`HTTP ${res.status}`);
  }
  const data = await res.json();
  return data[0].map((seg) => seg[0]).join('').replace(/\s+/g, ' ').trim();
}

async function main() {
  const data = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const res = await fetch(FED_URL);
  const fed = await res.json();
  const fedById = new Map(fed.map((ex) => [ex.id, ex]));

  for (const id of RETRY_IDS) {
    const fedId = id.replace(/^ext-/, '');
    const ex = fedById.get(fedId);
    const entry = data.entries[id];
    if (!entry || !ex) {
      console.warn('Mangler:', id);
      continue;
    }

    const origName = ex.name;
    const origDesc = (ex.instructions || []).join(' ').replace(/\s+/g, ' ').trim();

    console.log('Oversetter', id);
    const description = await translateText(origDesc);
    await sleep(300);

    data.entries[id] = { ...entry, name: origName, description };
    console.log('  ->', origName);
  }

  fs.writeFileSync(OUT, `${JSON.stringify(data, null, 2)}\n`);
  console.log('Ferdig.');
}

main().catch(console.error);
