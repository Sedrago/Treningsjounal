/**
 * Bygger data/ovelsesinnhold.json fra exercises.json (master-kilde).
 * Kjør: node scripts/build-catalog.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'exercises.json');
const OUT = path.join(ROOT, 'data/ovelsesinnhold.json');

const VALID_APP_CATEGORIES = new Set([
  'horisontal-push',
  'horisontal-pull',
  'vertikal-push',
  'vertikal-pull',
  'kneboy',
  'hoftehengsel',
  'core',
  'accessory',
  'horizontal_push',
  'horizontal_pull',
  'vertical_push',
  'vertical_pull',
  'squat_dominant',
  'hip_hinge',
]);

/** app_category → kategori-id i appen. */
function mapCategory(appCategory) {
  if (!appCategory || !VALID_APP_CATEGORIES.has(appCategory)) return null;
  const MAP = {
    accessory: 'valgfri',
    horizontal_push: 'horisontal-push',
    horizontal_pull: 'horisontal-pull',
    vertical_push: 'vertikal-push',
    vertical_pull: 'vertikal-pull',
    squat_dominant: 'kneboy',
    hip_hinge: 'hoftehengsel',
    core: 'core',
    // Direkte app-id-er (fallback)
    valgfri: 'valgfri',
    'horisontal-push': 'horisontal-push',
    'horisontal-pull': 'horisontal-pull',
    'vertikal-push': 'vertikal-push',
    'vertikal-pull': 'vertikal-pull',
    kneboy: 'kneboy',
    hoftehengsel: 'hoftehengsel',
  };
  return MAP[appCategory] || null;
}

function descriptionFrom(ex) {
  if (ex.norwegian_instructions?.trim()) return ex.norwegian_instructions.trim();
  if (Array.isArray(ex.instructions) && ex.instructions.length) {
    return ex.instructions.join(' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}

function main() {
  if (!fs.existsSync(SRC) || fs.statSync(SRC).size === 0) {
    console.error('exercises.json mangler eller er tom. Lagre filen og kjør på nytt.');
    process.exit(1);
  }

  const source = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  if (!Array.isArray(source)) {
    console.error('exercises.json må være en JSON-array.');
    process.exit(1);
  }

  const entries = {};
  const perCat = {};
  let skipped = 0;

  for (const ex of source) {
    const category = mapCategory(ex.app_category);
    if (!category) {
      skipped++;
      continue;
    }

    const description = descriptionFrom(ex);
    if (!description || description.length < 20) {
      skipped++;
      continue;
    }

    const id = ex.id;
    if (!id) {
      skipped++;
      continue;
    }

    entries[id] = {
      name: ex.name,
      category,
      description,
      equipment: ex.equipment || '',
      level: ex.level || '',
    };
    perCat[category] = (perCat[category] || 0) + 1;
  }

  const out = { version: 6, entries };
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);

  console.log(`Ferdig: ${Object.keys(entries).length} øvelser (${skipped} hoppet over)`);
  console.log('Per kategori:', perCat);
}

main();
