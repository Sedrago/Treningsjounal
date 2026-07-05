/**
 * Oversetter beskrivelser for ext-* poster i ovelsesinnhold.json (engelsk → norsk).
 * Navn beholdes på engelsk. Kjør: node scripts/translate-catalog-no.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'data/ovelsesinnhold.json');
const CACHE = path.join(__dirname, '..', 'data/.translate-cache.json');

const DELAY_MS = 120;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function translateText(text, { sl = 'en', tl = 'no' } = {}) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', sl);
  url.searchParams.set('tl', tl);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);

  const res = await fetch(url.href);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data[0].map((seg) => seg[0]).join('');
}

function polishNorwegian(text) {
  return text
    .replace(/\bTips?:\s*/gi, 'Tips: ')
    .replace(/\bReps?\b/gi, 'reps')
    .replace(/\brepetisjoner\b/gi, 'repetisjoner')
    .replace(/\s+/g, ' ')
    .trim();
}

function needsTranslation(entry, id) {
  if (id.startsWith('ext-')) return true;
  if (entry.source === 'free-exercise-db') return true;
  return false;
}

async function main() {
  const data = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const cache = fs.existsSync(CACHE)
    ? JSON.parse(fs.readFileSync(CACHE, 'utf8'))
    : {};

  const ids = Object.keys(data.entries).filter((id) => needsTranslation(data.entries[id], id));
  let done = 0;

  for (const id of ids) {
    if (cache[id]?.description) {
      data.entries[id] = { ...data.entries[id], description: cache[id].description };
      done++;
      continue;
    }

    const entry = data.entries[id];
    process.stdout.write(`\rOversetter ${done + 1}/${ids.length}: ${id.slice(0, 40).padEnd(40)}`);

    try {
      const description = polishNorwegian(await translateText(entry.description));
      await sleep(DELAY_MS);

      const translated = { description };
      cache[id] = translated;
      data.entries[id] = { ...entry, description };
      fs.writeFileSync(CACHE, `${JSON.stringify(cache, null, 2)}\n`);

      done++;
    } catch (err) {
      console.error(`\nFeil ved ${id}:`, err.message);
      await sleep(2000);
    }
  }

  data.version = 4;
  fs.writeFileSync(OUT, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`\nFerdig: ${done} øvelser oversatt. Versjon satt til ${data.version}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
