/**
 * views/plan.js – planlegg neste økt: velg øvelser per kategori,
 * juster settmål og rekkefølge, kopier fra tidligere økter.
 */

import * as store from '../store.js';
import { initContent, getCatalogByCategory, getCatalogEntry } from '../content.js';
import { openForm } from './exercises.js';
import { groupBy } from '../stats.js';
import { esc, formatDateShort, relativeDays, todayStr, toast, windowStartStr, categoryIconHtml } from '../utils.js';

/** Statistikk per kategori: dager siden sist + økter siste 14 dager. */
function categoryStats(enriched) {
  const since14 = windowStartStr(14);
  const today = todayStr();
  const stats = new Map();
  for (const k of store.KATEGORIER) {
    stats.set(k.id, { lastDate: null, recent: 0 });
  }
  const byCat = groupBy(enriched, (s) => s.category);
  for (const [cat, sets] of byCat) {
    const st = stats.get(cat);
    if (!st) continue;
    st.lastDate = sets.reduce((max, s) => (s.date > max ? s.date : max), '0000');
    if (st.lastDate === '0000') st.lastDate = null;
    st.recent = new Set(sets.filter((s) => s.date >= since14 && s.date <= today).map((s) => s.date)).size;
  }
  return stats;
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.round((new Date().setHours(0, 0, 0, 0) - new Date(y, m - 1, d).getTime()) / 86400000);
}

export async function render(container) {
  await initContent();
  const enriched = await store.getEnrichedSets();
  const exercises = await store.getExercises({ includeInactive: true });
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const plan = await store.getActivePlan();
  const items = plan?.items || [];
  const stats = categoryStats(enriched);

  // Kategorier sortert etter lengst siden sist (aldri trent øverst).
  const sortedCats = [...store.KATEGORIER].sort((a, b) => {
    const da = daysSince(stats.get(a.id).lastDate);
    const db_ = daysSince(stats.get(b.id).lastDate);
    if (da == null && db_ == null) return a.priority - b.priority;
    if (da == null) return -1;
    if (db_ == null) return 1;
    return db_ - da;
  });

  const planRows = items.map((item, i) => {
    const ex = exMap.get(item.exerciseId);
    const name = ex ? ex.name : 'Ukjent øvelse';
    const cat = ex ? store.categoryById(ex.category) : null;
    return `
      <div class="plan-rad" data-idx="${i}">
        <span class="plan-rekkefolge">${i + 1}</span>
        <div class="plan-rad-info">
          <span class="plan-navn">${cat ? `${categoryIconHtml(cat, 'kategori-ikon liten')} ` : ''}${esc(name)}</span>
          <span class="plan-sett-velger">
            <button type="button" class="plan-sett-knapp" data-handling="sett-minus" aria-label="Færre sett">−</button>
            <span class="plan-sett-antall">${item.goalSets} sett</span>
            <button type="button" class="plan-sett-knapp" data-handling="sett-pluss" aria-label="Flere sett">+</button>
          </span>
        </div>
        <span class="plan-rad-handlinger">
          <button type="button" class="ikon-knapp" data-handling="opp" aria-label="Flytt opp" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="ikon-knapp" data-handling="ned" aria-label="Flytt ned" ${i === items.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="ikon-knapp" data-handling="fjern" aria-label="Fjern fra plan">✕</button>
        </span>
      </div>`;
  }).join('');

  const catCards = sortedCats.map((k) => {
    const st = stats.get(k.id);
    const days = daysSince(st.lastDate);
    const inPlan = items.filter((it) => exMap.get(it.exerciseId)?.category === k.id).length;
    return `
      <button type="button" class="kort kategori-kort plan-kategori" data-kategori="${k.id}">
        <span class="kategori-topp">
          ${categoryIconHtml(k)}
          <span class="kategori-navn">${esc(k.name)}</span>
          ${inPlan ? `<span class="plan-kategori-badge">${inPlan} i planen</span>` : ''}
        </span>
        <p class="okt-status dus">
          ${days == null ? 'Aldri trent' : days === 0 ? 'Trent i dag' : `${days} dag${days === 1 ? '' : 'er'} siden sist`}
          · ${st.recent} økt${st.recent === 1 ? '' : 'er'} siste 14 dager
        </p>
      </button>`;
  }).join('');

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/hjem" class="tilbake" aria-label="Tilbake til hjem">‹</a>
      <div>
        <h1>Planlegg økt</h1>
        <p class="dus">Velg øvelser – start når du er klar</p>
      </div>
    </header>

    <section class="kort" aria-label="Planlagte øvelser">
      <h2 class="kort-tittel">Planen${items.length ? ` (${items.length} øvelse${items.length === 1 ? '' : 'r'})` : ''}</h2>
      <div id="plan-liste">${planRows || '<p class="dus liten">Ingen øvelser valgt ennå. Trykk på en kategori under.</p>'}</div>
      ${items.length ? `
      <a href="#/okt" class="knapp primaer stor" id="start-plan">Start økten</a>
      <button type="button" class="knapp sekundaer bred" id="tom-plan">Forkast planen</button>` : ''}
    </section>

    <button type="button" class="knapp sekundaer bred" id="kopier-okt">📋 Kopier fra tidligere økt</button>

    <div class="kategori-liste">${catCards}</div>
    <div id="velger-vert"></div>
  `;

  const host = container.querySelector('#velger-vert');

  async function updatePlan(newItems) {
    if (plan && !newItems.length) {
      await store.deletePlan(plan.id);
    } else if (plan) {
      await store.savePlan({ ...plan, items: newItems });
    } else if (newItems.length) {
      await store.savePlan({ items: newItems });
    }
    render(container);
  }

  container.querySelectorAll('.plan-rad').forEach((row) => {
    const idx = Number(row.dataset.idx);
    row.querySelectorAll('[data-handling]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const next = items.map((it) => ({ ...it }));
        const action = btn.dataset.handling;
        if (action === 'fjern') {
          next.splice(idx, 1);
        } else if (action === 'opp' && idx > 0) {
          [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
        } else if (action === 'ned' && idx < next.length - 1) {
          [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
        } else if (action === 'sett-minus') {
          next[idx].goalSets = Math.max(1, next[idx].goalSets - 1);
        } else if (action === 'sett-pluss') {
          next[idx].goalSets = Math.min(10, next[idx].goalSets + 1);
        }
        await updatePlan(next);
      });
    });
  });

  container.querySelector('#tom-plan')?.addEventListener('click', async () => {
    if (!confirm('Forkaste hele planen?')) return;
    await store.deletePlan(plan.id);
    render(container);
  });

  container.querySelector('#kopier-okt').addEventListener('click', () => {
    openCopySheet(host, enriched, exMap, async (dayItems) => {
      const existing = new Set(items.map((it) => it.exerciseId));
      const merged = [...items.map((it) => ({ ...it }))];
      for (const it of dayItems) {
        if (!existing.has(it.exerciseId)) merged.push(it);
      }
      await updatePlan(merged);
      toast('Øvelser kopiert til planen', 'suksess');
    });
  });

  container.querySelectorAll('.plan-kategori').forEach((card) => {
    card.addEventListener('click', () => {
      openExercisePicker(host, card.dataset.kategori, items, async (exercise) => {
        const next = [...items.map((it) => ({ ...it })), {
          exerciseId: exercise.id,
          goalSets: Number(exercise.goalSets) || Number(store.getSetting('defaultSets')) || 3,
        }];
        await updatePlan(next);
        toast(`«${exercise.name}» lagt til i planen`, 'suksess');
      }, () => render(container));
    });
  });
}

/** Bunn-ark: velg blant mine øvelser + biblioteket for en kategori. */
async function openExercisePicker(host, categoryId, planItems, onPick, onEdited) {
  const category = store.categoryById(categoryId);
  const mine = await store.getExercisesByCategory(categoryId);
  const activeCatalogIds = new Set(await store.getActiveCatalogIds());
  const catalogRest = getCatalogByCategory(categoryId)
    .filter((c) => !activeCatalogIds.has(c.id));
  const inPlan = new Set(planItems.map((it) => it.exerciseId));

  const mineRows = mine.map((e) => `
    <div class="velger-rad plan-velger-rad" data-id="${e.id}">
      <button type="button" class="plan-velg" data-id="${e.id}" ${inPlan.has(e.id) ? 'disabled' : ''}>
        <span class="velger-navn">${esc(e.name)}${inPlan.has(e.id) ? ' <span class="dus">✓ i planen</span>' : ''}</span>
        <span class="velger-info dus">${e.goalSets} × ${e.goalRepsMin}–${e.goalRepsMax}</span>
      </button>
      <button type="button" class="ikon-knapp plan-rediger" data-id="${e.id}" aria-label="Rediger øvelse">✎</button>
    </div>`).join('');

  const bibRows = catalogRest.map((c) => `
    <button type="button" class="velger-rad plan-bib-rad" data-id="${esc(c.id)}">
      <span class="velger-navn">${esc(c.name)}</span>
      <span class="velger-info dus">+ fra bibliotek</span>
    </button>`).join('');

  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Velg øvelse for ${esc(category.name)}">
      <div class="ark-hode">
        <h2 class="kategori-tittel">${categoryIconHtml(category)} ${esc(category.name)}</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      ${mineRows || '<p class="dus liten">Ingen egne øvelser i kategorien ennå.</p>'}
      ${bibRows ? `<p class="felt-navn plan-bib-tittel">Fra biblioteket</p>${bibRows}` : ''}
      <form class="ny-ovelse-skjema">
        <input type="text" class="inndata" name="navn" placeholder="Ny øvelse …" aria-label="Navn på ny øvelse">
        <button type="submit" class="knapp sekundaer">Legg til</button>
      </form>
    </div>`;

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));

  host.querySelectorAll('.plan-velg').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ex = await store.getExercise(btn.dataset.id);
      if (!ex) return;
      host.innerHTML = '';
      onPick(ex);
    });
  });

  host.querySelectorAll('.plan-rediger').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ex = await store.getExercise(btn.dataset.id);
      if (!ex) return;
      openForm(host, ex, () => onEdited());
    });
  });

  host.querySelectorAll('.plan-bib-rad').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const entry = getCatalogEntry(btn.dataset.id);
      if (!entry) return;
      const ex = await store.addExerciseFromCatalog(entry.id, entry);
      host.innerHTML = '';
      onPick(ex);
    });
  });

  host.querySelector('.ny-ovelse-skjema').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = e.target.navn.value.trim();
    if (!name) return;
    const ex = await store.saveExercise({ name, category: categoryId });
    host.innerHTML = '';
    onPick(ex);
  });
}

/** Bunn-ark: tidligere økter (dato + øvelser), trykk for å kopiere til planen. */
function openCopySheet(host, enriched, exMap, onCopy) {
  const byDate = groupBy(enriched, (s) => s.date);
  const days = [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 30);

  const rows = days.map(([date, sets]) => {
    const byEx = groupBy(sets, (s) => s.exerciseId);
    const names = [...byEx.values()].map((exSets) => exSets[0].exerciseName);
    return `
      <button type="button" class="velger-rad plan-kopi-rad" data-dato="${date}">
        <span class="velger-navn">${formatDateShort(date)} <span class="dus">(${relativeDays(date)})</span></span>
        <span class="velger-info dus plan-kopi-ovelser">${esc(names.join(' · '))}</span>
      </button>`;
  }).join('');

  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Kopier fra tidligere økt">
      <div class="ark-hode">
        <h2>📋 Kopier fra økt</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      ${rows || '<p class="tomt">Ingen tidligere økter ennå.</p>'}
    </div>`;

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));

  host.querySelectorAll('.plan-kopi-rad').forEach((btn) => {
    btn.addEventListener('click', () => {
      const date = btn.dataset.dato;
      const sets = enriched.filter((s) => s.date === date);
      const byEx = groupBy(sets, (s) => s.exerciseId);
      const items = [...byEx.entries()].map(([exerciseId, exSets]) => ({
        exerciseId,
        goalSets: new Set(exSets.map((s) => s.setNumber)).size || exSets.length,
      })).filter((it) => exMap.has(it.exerciseId));
      host.innerHTML = '';
      onCopy(items);
    });
  });
}
