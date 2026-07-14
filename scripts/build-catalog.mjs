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

/** Grunnleggende øvelser per kategori (3–4 stk) – engelske navn fra exercises.json. */
const STARTER_PACK_IDS = [
  // Horisontal push
  'Barbell_Bench_Press_-_Medium_Grip',
  'Pushups',
  'Dips_-_Chest_Version',
  'Dumbbell_Bench_Press',
  // Horisontal pull
  'Bent_Over_Barbell_Row',
  'Seated_Cable_Rows',
  'Face_Pull',
  // Vertikal push
  'Barbell_Shoulder_Press',
  'Standing_Military_Press',
  'Arnold_Dumbbell_Press',
  // Vertikal pull
  'Pullups',
  'Chin-Up',
  'Close-Grip_Front_Lat_Pulldown',
  // Knebøydominant
  'Barbell_Squat',
  'Front_Barbell_Squat',
  'Leg_Press',
  'Split_Squats',
  // Hoftehengsel
  'Barbell_Deadlift',
  'Romanian_Deadlift',
  'Barbell_Hip_Thrust',
  'Good_Morning',
  // Core
  'Plank',
  'Dead_Bug',
  'Cable_Crunch',
  // Valgfri
  'Barbell_Curl',
  'Triceps_Pushdown',
  'Side_Lateral_Raise',
  'Standing_Calf_Raises',
];

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
  const starterSet = new Set(STARTER_PACK_IDS);
  let skipped = 0;
  const missingStarter = [];

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
      primaryMuscles: Array.isArray(ex.primaryMuscles) ? ex.primaryMuscles : [],
      level: ex.level || '',
      ...(starterSet.has(id) ? { starter: true } : {}),
    };
    perCat[category] = (perCat[category] || 0) + 1;
  }

  for (const id of STARTER_PACK_IDS) {
    if (!entries[id]) missingStarter.push(id);
  }
  if (missingStarter.length) {
    console.error('Startpakke-id finnes ikke i katalogen:', missingStarter.join(', '));
    process.exit(1);
  }

  const starterPack = STARTER_PACK_IDS.filter((id) => entries[id]);

  const out = { version: 7, starterPack, entries };
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);

  console.log(`Ferdig: ${Object.keys(entries).length} øvelser (${skipped} hoppet over), startpakke: ${starterPack.length}`);
  console.log('Per kategori:', perCat);
}

main();
