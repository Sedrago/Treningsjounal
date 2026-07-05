/**
 * Bygger data/ovelsesinnhold.json fra eksisterende norske poster + free-exercise-db.
 * Kjør: node scripts/build-catalog.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data/ovelsesinnhold.json');
const FED_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';

/** Behold kun def-* og lib-* fra fil (norske). */
const KEEP_PREFIX = /^(def-|lib-)/;

const EXCLUDE_CATEGORIES = new Set(['stretching', 'cardio']);

const EXCLUDE_NAME = [
  /behind the neck/i,
  /behind neck/i,
  /guillotine bench/i,
  /neck press/i,
  /stiff-leg deadlift on bench/i,
];

const EXCLUDE_IDS = new Set([
  'Barbell_Guillotine_Bench_Press',
]);

const EQUIP_RANK = ['barbell', 'dumbbell', 'kettlebell', 'cable', 'body', 'machine', 'smith', 'band', 'other'];

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function equipmentRank(ex) {
  const eq = (ex.equipment || 'other').toLowerCase();
  const i = EQUIP_RANK.findIndex((e) => eq.includes(e));
  return i >= 0 ? i : EQUIP_RANK.length;
}

function baseKey(name) {
  return norm(name)
    .replace(/\b(barbell|dumbbell|dumbbells|kettlebell|kettlebells|cable|machine|smith|bands?|resistance|weighted|assisted|one arm|single arm|alternate|alternating|incline|decline|flat|close grip|wide grip|medium grip|reverse grip|neutral grip|seated|standing|lying|kneeling|floor|upper|lower|front|rear|reverse)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function descriptionFrom(ex) {
  return (ex.instructions || []).join(' ').replace(/\s+/g, ' ').trim();
}

function mapCategory(ex) {
  const name = ex.name.toLowerCase();
  const m = new Set(ex.primaryMuscles || []);
  const force = ex.force;
  const type = ex.category;

  if (type === 'stretching' || type === 'cardio') return null;

  if (
    m.has('abdominals')
    && !/squat|deadlift|clean|snatch|swing|thrust|lunge|woodchop/i.test(name)
  ) return 'core';

  if (
    /bench press|push-up|push up|pushup|floor press| dip|dips|chest press| fly|crossover|pec deck/i.test(name)
    && !/row|pulldown|pull-up|chin-up|upright row/i.test(name)
  ) return 'horisontal-push';

  if (
    /overhead press|military press|shoulder press|push press|arnold press|landmine press|pike push|handstand push|log press/i.test(name)
    || (m.has('shoulders') && force === 'push' && !/lateral raise|front raise|rear delt|reverse fly|upright row|shrug/i.test(name))
  ) return 'vertikal-push';

  if (
    /pull-up|pull up|pullup|chin-up|chin up|chinup|lat pulldown|pulldown|straight-arm pulldown|scapular pull/i.test(name)
  ) return 'vertikal-pull';

  if (
    /row|rowing|face pull|reverse fly|bent over|inverted row|pullover/i.test(name)
    && !/upright row|pulldown|pull-up|deadlift/i.test(name)
  ) return 'horisontal-pull';

  if (
    /squat|lunge|leg press|leg extension|hack squat|split squat|step-up|step up|goblet squat|zercher|wall sit/i.test(name)
    || (m.has('quadriceps') && /squat|lunge|leg press|leg extension|step/i.test(name))
  ) return 'kneboy';

  if (
    /deadlift|rdl|romanian|stiff.?leg|hip thrust|good morning|glute bridge|hamstring curl|pull-through|pull through|kettlebell swing|hyperextension|back extension|reverse hyper|clean|snatch|sumo deadlift/i.test(name)
    || (m.has('hamstrings') && !/curl.*ball/i.test(name))
    || (m.has('glutes') && /thrust|bridge|kickback|pull-through|swing/i.test(name))
  ) return 'hoftehengsel';

  // Valgfri – kun tydelige tilleggsøvelser
  if (
    type === 'olympic weightlifting'
    || type === 'strongman'
    || /farmer|carry|suitcase walk|shrug|curl|extension|raise|wrist|forearm|calf|clean and jerk|snatch|jerk|box jump|burpee|battle rope|sled/i.test(name)
    || m.has('biceps') || m.has('triceps') || m.has('forearms') || m.has('calves')
    || /lateral raise|front raise|rear delt|upright row|tricep|bicep|preacher|concentration curl/i.test(name)
  ) return 'valgfri';

  if (m.has('chest') && force === 'push') return 'horisontal-push';
  if (m.has('shoulders') && force === 'push') return 'vertikal-push';
  if (m.has('middle back') && force === 'pull') return 'horisontal-pull';
  if (m.has('lats') && force === 'pull') return 'vertikal-pull';
  if (m.has('quadriceps')) return 'kneboy';
  if (m.has('glutes') || m.has('hamstrings')) return 'hoftehengsel';

  return null;
}

function addNameKey(set, name) {
  set.add(norm(name));
}

async function main() {
  const existing = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const entries = {};
  for (const [id, val] of Object.entries(existing.entries)) {
    if (KEEP_PREFIX.test(id)) entries[id] = val;
  }

  const existingNames = new Set();
  Object.values(entries).forEach((e) => addNameKey(existingNames, e.name));

  const res = await fetch(FED_URL);
  const fed = await res.json();

  /** baseKey+category -> best exercise candidate */
  const slots = new Map();

  for (const ex of fed) {
    if (EXCLUDE_CATEGORIES.has(ex.category)) continue;
    if (EXCLUDE_IDS.has(ex.id)) continue;
    if (EXCLUDE_NAME.some((re) => re.test(ex.name))) continue;

    const category = mapCategory(ex);
    if (!category) continue;

    const desc = descriptionFrom(ex);
    if (!desc || desc.length < 30) continue;
    if (isDuplicateName(ex.name, existingNames)) continue;

    const slot = `${category}::${baseKey(ex.name)}`;
    const prev = slots.get(slot);
    if (!prev || equipmentRank(ex) < equipmentRank(prev)) {
      slots.set(slot, ex);
    }
  }

  let added = 0;
  const perCat = {};

  for (const ex of slots.values()) {
    const category = mapCategory(ex);
    const id = `ext-${ex.id}`;
    entries[id] = {
      name: ex.name,
      category,
      description: descriptionFrom(ex),
      source: 'free-exercise-db',
    };
    addNameKey(existingNames, ex.name);
    perCat[category] = (perCat[category] || 0) + 1;
    added++;
  }

  const out = { version: 3, entries };
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);

  const allCats = {};
  Object.values(entries).forEach((e) => { allCats[e.category] = (allCats[e.category] || 0) + 1; });
  console.log(`Ferdig: ${added} importert + ${Object.keys(entries).length - added} norske = ${Object.keys(entries).length} totalt`);
  console.log('Per kategori:', allCats);
}

function isDuplicateName(name, existingNames) {
  const n = norm(name);
  if (existingNames.has(n)) return true;
  return false;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
