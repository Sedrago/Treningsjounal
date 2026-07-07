/**
 * views/workout.js – «Dagens økt»: kort per bevegelseskategori,
 * øvelsesvelger og avslutning av økt.
 */

import * as store from '../store.js';
import { esc, fmtNum, formatDateLong, relativeDays, todayStr, debounce, toast, summarizeSet } from '../utils.js';
import { groupBy } from '../stats.js';

/** Finner forrige økt-informasjon per kategori (før i dag). */
function lastPerCategory(enriched) {
  const today = todayStr();
  const result = new Map();
  const byCat = groupBy(enriched.filter((s) => s.date < today), (s) => s.category);
  for (const [cat, sets] of byCat) {
    const lastDate = sets.reduce((max, s) => (s.date > max ? s.date : max), '0000');
    const daySets = sets.filter((s) => s.date === lastDate);
    // Den mest brukte øvelsen den dagen innen kategorien.
    const byEx = groupBy(daySets, (s) => s.exerciseId);
    const [exId, exSets] = [...byEx.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    const topWeight = Math.max(...exSets.map((s) => s.weight || 0));
    const mode = exSets[0].logMode || 'weight';
    const summary = exSets.sort((a, b) => a.setNumber - b.setNumber)
      .map((s) => summarizeSet(s, mode, 'metric')).join(' / ');
    result.set(cat, {
      date: lastDate,
      exerciseId: exId,
      exerciseName: exSets[0].exerciseName,
      logMode: mode,
      weight: topWeight || null,
      summary,
    });
  }
  return result;
}

export async function render(container) {
  const enriched = await store.getEnrichedSets();
  const today = todayStr();
  const units = store.getSetting('units');
  const todaySets = enriched.filter((s) => s.date === today);
  const todayByCat = groupBy(todaySets, (s) => s.category);
  const last = lastPerCategory(enriched);
  const workouts = await store.getWorkouts();
  const todayWorkout = workouts.find((w) => w.date === today) || null;

  const cards = store.KATEGORIER.map((k) => {
    const done = todayByCat.get(k.id);
    const prev = last.get(k.id);
    let body;
    if (done) {
      const byEx = groupBy(done, (s) => s.exerciseId);
      body = [...byEx.values()].map((exSets) => {
        const name = exSets[0].exerciseName;
        const mode = exSets[0].logMode || 'weight';
        const summary = exSets.sort((a, b) => a.setNumber - b.setNumber)
          .map((s) => summarizeSet(s, mode, units)).join(' · ');
        return `<p class="okt-status ferdig">✓ ${esc(name)} · ${esc(summary)}</p>`;
      }).join('');
    } else if (prev) {
      body = `
        <p class="okt-status dus">Forrige (${relativeDays(prev.date)}):</p>
        <p class="okt-forrige">${esc(prev.exerciseName)} · ${esc(prev.summary)}</p>`;
    } else {
      body = '<p class="okt-status dus">Ikke trent ennå</p>';
    }
    return `
      <button type="button" class="kort kategori-kort ${done ? 'utfort' : ''}" data-kategori="${k.id}">
        <span class="kategori-topp"><span class="kategori-ikon" aria-hidden="true">${k.icon}</span>
        <span class="kategori-navn">${esc(k.name)}</span></span>
        ${body}
      </button>`;
  }).join('');

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/hjem" class="tilbake" aria-label="Tilbake til hjem">‹</a>
      <div>
        <h1>Dagens økt</h1>
        <p class="dus">${formatDateLong(today)}</p>
      </div>
    </header>
    <div class="kategori-liste">${cards}</div>
    <section class="kort">
      <label class="felt-navn" for="okt-notat">Notat for økten</label>
      <textarea id="okt-notat" class="inndata" rows="2"
        placeholder="Dagsform, fokus …">${esc(todayWorkout?.notes || '')}</textarea>
    </section>
    ${todaySets.length ? '<button type="button" class="knapp primaer stor" id="avslutt">Avslutt økt</button>' : ''}
    <div id="velger-vert"></div>
  `;

  // Øktnotat med autolagring.
  const noteField = container.querySelector('#okt-notat');
  noteField.addEventListener('input', debounce(async () => {
    const w = await store.getOrCreateTodayWorkout();
    w.notes = noteField.value;
    await store.saveWorkout(w);
  }, 600));

  container.querySelector('#avslutt')?.addEventListener('click', async () => {
    const w = await store.getOrCreateTodayWorkout();
    await store.touchWorkoutDuration(w.id);
    toast('Økt lagret. Godt jobbet!', 'suksess');
    location.hash = '#/hjem';
  });

  container.querySelectorAll('.kategori-kort').forEach((card) => {
    card.addEventListener('click', () => openPicker(container.querySelector('#velger-vert'), card.dataset.kategori));
  });
}

/** Øvelsesvelger for en kategori (bunn-ark). */
async function openPicker(host, categoryId) {
  const category = store.categoryById(categoryId);
  const exercises = await store.getExercisesByCategory(categoryId);
  const enriched = await store.getEnrichedSets();
  const units = store.getSetting('units');

  const items = exercises.map((e) => {
    const exSets = enriched.filter((s) => s.exerciseId === e.id);
    let info = 'Aldri logget';
    if (exSets.length) {
      const lastDate = exSets[exSets.length - 1].date;
      const daySets = exSets.filter((s) => s.date === lastDate);
      const top = Math.max(...daySets.map((s) => s.weight || 0));
      info = `${relativeDays(lastDate)}${top ? ` · ${fmtNum(toDisplayWeight(top, units))} ${weightUnit(units)}` : ''}`;
    }
    return `
      <button type="button" class="velger-rad" data-id="${e.id}">
        <span class="velger-navn">${esc(e.name)}</span>
        <span class="velger-info dus">${esc(info)}</span>
      </button>`;
  }).join('');

  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Velg øvelse for ${esc(category.name)}">
      <div class="ark-hode">
        <h2>${category.icon} ${esc(category.name)}</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      ${items || '<p class="tomt">Ingen øvelser i denne kategorien ennå.</p>'}
      <form class="ny-ovelse-skjema">
        <input type="text" class="inndata" name="navn" placeholder="Ny øvelse …" aria-label="Navn på ny øvelse">
        <button type="submit" class="knapp sekundaer">Legg til</button>
      </form>
    </div>`;

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));
  host.querySelectorAll('.velger-rad').forEach((row) => {
    row.addEventListener('click', () => { location.hash = `#/logg/${row.dataset.id}`; });
  });
  host.querySelector('.ny-ovelse-skjema').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = e.target.navn.value.trim();
    if (!name) return;
    const ex = await store.saveExercise({ name, category: categoryId });
    location.hash = `#/logg/${ex.id}`;
  });
}
