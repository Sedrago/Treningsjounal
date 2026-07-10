/**
 * views/workout.js – «Dagens økt»: kort per bevegelseskategori,
 * øvelsesvelger og avslutning av økt.
 */

import * as store from '../store.js';
import { esc, formatDateLong, relativeDays, todayStr, debounce, toast, summarizeSet, categoryIconHtml } from '../utils.js';
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

/** Plan-seksjonen: nummerert liste med status og neste-markering. */
function planSectionHtml(plan, exMap, todaySets) {
  const setsByEx = groupBy(todaySets, (s) => s.exerciseId);
  let nextMarked = false;
  const rows = plan.items.map((item, i) => {
    const ex = exMap.get(item.exerciseId);
    if (!ex) return '';
    const logged = new Set((setsByEx.get(item.exerciseId) || []).map((s) => s.setNumber)).size;
    const done = logged >= item.goalSets;
    const isNext = !done && !nextMarked;
    if (isNext) nextMarked = true;
    return `
      <div class="plan-okt-rad ${done ? 'ferdig' : ''} ${isNext ? 'neste' : ''}" data-idx="${i}">
        <a href="#/logg/${ex.id}" class="plan-okt-lenke">
          <span class="plan-rekkefolge">${done ? '✓' : i + 1}</span>
          <span class="plan-okt-info">
            <span class="plan-navn">${esc(ex.name)}</span>
            <span class="dus liten">${logged}/${item.goalSets} sett${isNext ? ' · neste' : ''}</span>
          </span>
        </a>
        <span class="plan-rad-handlinger">
          <button type="button" class="ikon-knapp" data-handling="opp" aria-label="Flytt opp" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="ikon-knapp" data-handling="ned" aria-label="Flytt ned" ${i === plan.items.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="ikon-knapp" data-handling="fjern" aria-label="Fjern fra plan">✕</button>
        </span>
      </div>`;
  }).join('');

  return `
    <section class="kort plan-okt" aria-label="Planlagt økt">
      <div class="plan-okt-hode">
        <h2 class="kort-tittel">Planlagt økt</h2>
        <a href="#/planlegg" class="dus liten">Rediger plan</a>
      </div>
      ${rows}
    </section>`;
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
  const plan = await store.getActivePlan();
  const exercises = await store.getExercises({ includeInactive: true });
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const hasPlan = Boolean(plan?.items?.length);

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
        <span class="kategori-topp">${categoryIconHtml(k)}
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
    ${hasPlan ? planSectionHtml(plan, exMap, todaySets) : `
    <a href="#/planlegg" class="knapp sekundaer bred">📋 Planlegg økten først</a>`}
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
    if (plan) await store.completePlan(plan.id);
    toast('Økt lagret. Godt jobbet!', 'suksess');
    location.hash = '#/hjem';
  });

  // Plan-handlinger: flytt / fjern.
  container.querySelectorAll('.plan-okt-rad [data-handling]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const idx = Number(btn.closest('.plan-okt-rad').dataset.idx);
      const next = plan.items.map((it) => ({ ...it }));
      const action = btn.dataset.handling;
      if (action === 'fjern') {
        next.splice(idx, 1);
      } else if (action === 'opp' && idx > 0) {
        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      } else if (action === 'ned' && idx < next.length - 1) {
        [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
      }
      if (next.length) {
        await store.savePlan({ ...plan, items: next });
      } else {
        await store.deletePlan(plan.id);
      }
      render(container);
    });
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
      const mode = e.logMode || daySets[0].logMode || 'weight';
      const summary = daySets.sort((a, b) => a.setNumber - b.setNumber)
        .map((s) => summarizeSet(s, mode, units)).join(' · ');
      info = `${relativeDays(lastDate)} · ${summary}`;
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
        <h2 class="kategori-tittel">${categoryIconHtml(category)} ${esc(category.name)}</h2>
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
