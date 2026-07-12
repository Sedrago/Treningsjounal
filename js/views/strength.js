/**
 * views/strength.js – Styrketrening: én side for program, logging og maler.
 */

import * as store from '../store.js';
import { initContent, getCatalogByCategory, getCatalogEntry } from '../content.js';
import { openForm } from './exercises.js';
import { descriptionBlock, bindDescriptionToggles } from './exercise-library.js';
import { groupBy } from '../stats.js';
import {
  esc, formatDateShort, formatDateLong, relativeDays, todayStr,
  toast, windowStartStr, categoryIconHtml, debounce,
} from '../utils.js';

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

function sessionProgress(items, todaySets) {
  const setsByEx = groupBy(todaySets, (s) => s.exerciseId);
  let done = 0;
  for (const item of items) {
    const logged = new Set((setsByEx.get(item.exerciseId) || []).map((s) => s.setNumber)).size;
    if (logged >= item.goalSets) done += 1;
  }
  return { done, total: items.length };
}

function statusLine(plan, items, todaySets) {
  if (!items.length) return 'Bygg programmet – velg øvelser eller hent fra tidligere';
  const { done, total } = sessionProgress(items, todaySets);
  if (!todaySets.length) return `${total} øvelse${total === 1 ? '' : 'r'} klar`;
  if (done >= total) return `Fullført ${done}/${total} øvelser i dag`;
  return `Pågår – ${done}/${total} øvelser fullført`;
}

/** Eksportert for hjemskjermen. */
export async function homeStrengthLabel() {
  const enriched = await store.getEnrichedSets();
  const today = todayStr();
  const plan = await store.getActivePlan();
  const items = plan?.items || [];
  const todaySets = enriched.filter((s) => s.date === today);
  if (!items.length && !todaySets.length) {
    return { title: 'Styrketrening', sub: 'Bygg dagens program' };
  }
  const { done, total } = sessionProgress(items, todaySets);
  if (todaySets.length && done < total) {
    return { title: 'Fortsett styrketrening', sub: `${done}/${total || items.length} øvelser fullført` };
  }
  if (items.length && !todaySets.length) {
    return { title: 'Styrketrening', sub: `${items.length} øvelse${items.length === 1 ? '' : 'r'} klar` };
  }
  return { title: 'Styrketrening', sub: statusLine(plan, items, todaySets) };
}

export async function render(container) {
  await initContent();
  const enriched = await store.getEnrichedSets();
  const today = todayStr();
  const todaySets = enriched.filter((s) => s.date === today);
  const exercises = await store.getExercises({ includeInactive: true });
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const plan = await store.getActivePlan();
  const items = plan?.items || [];
  const stats = categoryStats(enriched);
  const workouts = await store.getWorkouts();
  const todayWorkout = workouts.find((w) => w.date === today) || null;
  const hasLogged = todaySets.length > 0;

  const setsByEx = groupBy(todaySets, (s) => s.exerciseId);
  let nextMarked = false;

  const rows = items.map((item, i) => {
    const ex = exMap.get(item.exerciseId);
    const name = ex ? ex.name : 'Ukjent øvelse';
    const cat = ex ? store.categoryById(ex.category) : null;
    const logged = new Set((setsByEx.get(item.exerciseId) || []).map((s) => s.setNumber)).size;
    const done = logged >= item.goalSets;
    const isNext = hasLogged && !done && !nextMarked;
    if (isNext) nextMarked = true;

    const mainCell = ex
      ? `<a href="#/logg/${ex.id}" class="plan-okt-lenke styrke-lenke">
          <span class="plan-rekkefolge">${done ? '✓' : i + 1}</span>
          <span class="plan-okt-info">
            <span class="plan-navn">${cat ? `${categoryIconHtml(cat, 'kategori-ikon liten')} ` : ''}${esc(name)}</span>
            ${hasLogged ? `<span class="dus liten">${logged}/${item.goalSets} sett${isNext ? ' · neste' : ''}</span>` : ''}
          </span>
        </a>`
      : `<div class="styrke-rad-ukjent"><span class="plan-rekkefolge">${i + 1}</span><span class="plan-navn">${esc(name)}</span></div>`;

    return `
      <div class="plan-rad styrke-rad ${done ? 'ferdig' : ''} ${isNext ? 'neste' : ''}" data-idx="${i}">
        ${mainCell}
        <span class="plan-sett-velger">
          <button type="button" class="plan-sett-knapp" data-handling="sett-minus" aria-label="Færre sett">−</button>
          <span class="plan-sett-antall">${item.goalSets} sett</span>
          <button type="button" class="plan-sett-knapp" data-handling="sett-pluss" aria-label="Flere sett">+</button>
        </span>
        <span class="plan-rad-handlinger">
          <button type="button" class="ikon-knapp" data-handling="opp" aria-label="Flytt opp" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="ikon-knapp" data-handling="ned" aria-label="Flytt ned" ${i === items.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="ikon-knapp" data-handling="fjern" aria-label="Fjern">✕</button>
        </span>
      </div>`;
  }).join('');

  const emptyHint = `
    <div class="styrke-tom" aria-label="Kom i gang">
      <p class="dus liten">Bygg dagens økt på en av disse måtene:</p>
      <div class="styrke-snarest">
        <button type="button" class="knapp sekundaer" data-handling="legg-til">+ Velg øvelser</button>
        <button type="button" class="knapp sekundaer" data-handling="historikk">Hent fra tidligere</button>
        <button type="button" class="knapp sekundaer" data-handling="mal">Lagrede programmer</button>
      </div>
    </div>`;

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/hjem" class="tilbake" aria-label="Tilbake til hjem">‹</a>
      <div>
        <h1>Styrketrening</h1>
        <p class="dus">${formatDateLong(today)} · ${esc(statusLine(plan, items, todaySets))}</p>
      </div>
    </header>

    <section class="kort styrke-program" aria-label="Dagens program">
      <h2 class="kort-tittel">Program${items.length ? ` (${items.length} øvelse${items.length === 1 ? '' : 'r'})` : ''}</h2>
      <div id="styrke-liste">${rows || emptyHint}</div>
    </section>

    <div class="styrke-handlinger">
      <button type="button" class="knapp sekundaer bred" data-handling="legg-til">+ Legg til øvelse</button>
      <button type="button" class="knapp sekundaer bred" data-handling="historikk">Hent fra tidligere økt</button>
      <button type="button" class="knapp sekundaer bred" data-handling="mal">Lagrede programmer</button>
      ${items.length ? '<button type="button" class="knapp sekundaer bred" data-handling="lagre-mal">Lagre som program</button>' : ''}
      ${items.length ? '<button type="button" class="knapp farlig bred" data-handling="tom">Tøm program</button>' : ''}
    </div>

    <section class="kort">
      <label class="felt-navn" for="okt-notat">Notat for økten</label>
      <textarea id="okt-notat" class="inndata" rows="2"
        placeholder="Dagsform, fokus …">${esc(todayWorkout?.notes || '')}</textarea>
    </section>
    ${hasLogged ? '<button type="button" class="knapp primaer stor" id="avslutt">Avslutt økt</button>' : ''}
    <div id="velger-vert"></div>
  `;

  const host = container.querySelector('#velger-vert');

  async function updateItems(newItems) {
    if (plan && !newItems.length) {
      await store.deletePlan(plan.id);
    } else if (plan) {
      await store.savePlan({ ...plan, items: newItems, date: today });
    } else if (newItems.length) {
      await store.savePlan({ items: newItems, status: 'aktiv', date: today });
    }
    render(container);
  }

  container.querySelector('#okt-notat')?.addEventListener('input', debounce(async (e) => {
    const w = await store.getOrCreateTodayWorkout();
    w.notes = e.target.value;
    await store.saveWorkout(w);
  }, 600));

  container.querySelector('#avslutt')?.addEventListener('click', async () => {
    const w = await store.getOrCreateTodayWorkout();
    await store.touchWorkoutDuration(w.id);
    const active = await store.getActivePlan();
    if (active) await store.completePlan(active.id);
    toast('Økt lagret. Godt jobbet!', 'suksess');
    location.hash = '#/hjem';
  });

  container.querySelectorAll('.styrke-rad').forEach((row) => {
    const idx = Number(row.dataset.idx);
    row.querySelectorAll('[data-handling]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = items.map((it) => ({ ...it }));
        const action = btn.dataset.handling;
        if (action === 'fjern') next.splice(idx, 1);
        else if (action === 'opp' && idx > 0) [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
        else if (action === 'ned' && idx < next.length - 1) [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
        else if (action === 'sett-minus') next[idx].goalSets = Math.max(1, next[idx].goalSets - 1);
        else if (action === 'sett-pluss') next[idx].goalSets = Math.min(10, next[idx].goalSets + 1);
        await updateItems(next);
      });
    });
  });

  function addExercise(exercise) {
    const next = [...items.map((it) => ({ ...it })), {
      exerciseId: exercise.id,
      goalSets: Number(exercise.goalSets) || Number(store.getSetting('defaultSets')) || 3,
    }];
    return updateItems(next);
  }

  container.querySelectorAll('[data-handling]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.handling;
      if (action === 'legg-til') {
        openCategoryPicker(host, stats, (catId) => {
          openExercisePicker(host, catId, items, (ex) => {
            host.innerHTML = '';
            addExercise(ex);
            toast(`«${ex.name}» lagt til`, 'suksess');
          }, () => render(container));
        });
      } else if (action === 'historikk') {
        openCopySheet(host, enriched, exMap, async (dayItems) => {
          const existing = new Set(items.map((it) => it.exerciseId));
          const merged = [...items.map((it) => ({ ...it }))];
          for (const it of dayItems) {
            if (!existing.has(it.exerciseId)) merged.push(it);
          }
          await updateItems(merged);
          toast('Øvelser hentet fra tidligere økt', 'suksess');
        });
      } else if (action === 'mal') {
        openTemplatesSheet(host, exMap, async (templateId, replace) => {
          const templates = await store.getSavedTemplates();
          const tpl = templates.find((t) => t.id === templateId);
          if (!tpl?.items?.length) return;
          if (replace && items.length && !confirm('Erstatt nåværende program med malen?')) return;
          if (replace) {
            await store.loadTemplateIntoActive(templateId);
          } else {
            const existing = new Set(items.map((it) => it.exerciseId));
            const merged = [...items.map((it) => ({ ...it }))];
            for (const it of tpl.items) {
              if (!existing.has(it.exerciseId)) merged.push({ ...it });
            }
            await updateItems(merged);
          }
          toast(`«${tpl.name || 'Program'}» lastet inn`, 'suksess');
        });
      } else if (action === 'lagre-mal') {
        openSaveTemplateSheet(host, items, async (name) => {
          await store.saveAsTemplate(name, items.map((it) => ({ ...it })));
          toast(`Programmet «${name}» er lagret`, 'suksess');
        });
      } else if (action === 'tom') {
        if (!confirm('Tømme hele programmet? Loggede sett i dag beholdes.')) return;
        if (plan) await store.deletePlan(plan.id);
        render(container);
      }
    });
  });
}

/** Bunn-ark: velg kategori (sortert etter lengst siden sist). */
function openCategoryPicker(host, stats, onCategory) {
  const sortedCats = [...store.KATEGORIER].sort((a, b) => {
    const da = daysSince(stats.get(a.id).lastDate);
    const db_ = daysSince(stats.get(b.id).lastDate);
    if (da == null && db_ == null) return a.priority - b.priority;
    if (da == null) return -1;
    if (db_ == null) return 1;
    return db_ - da;
  });

  const cards = sortedCats.map((k) => {
    const st = stats.get(k.id);
    const days = daysSince(st.lastDate);
    return `
      <button type="button" class="velger-rad styrke-kat-rad" data-kategori="${k.id}">
        <span class="velger-navn kategori-tittel">${categoryIconHtml(k, 'kategori-ikon liten')} ${esc(k.name)}</span>
        <span class="velger-info dus">${days == null ? 'Aldri' : days === 0 ? 'I dag' : `${days}d siden`}</span>
      </button>`;
  }).join('');

  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Velg kategori">
      <div class="ark-hode">
        <h2>Velg kategori</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      ${cards}
    </div>`;

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));
  host.querySelectorAll('.styrke-kat-rad').forEach((btn) => {
    btn.addEventListener('click', () => onCategory(btn.dataset.kategori));
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
        <span class="velger-navn">${esc(e.name)}${inPlan.has(e.id) ? ' <span class="dus">✓ i programmet</span>' : ''}</span>
        <span class="velger-info dus">${e.goalSets} × ${e.goalRepsMin}–${e.goalRepsMax}</span>
      </button>
      <button type="button" class="ikon-knapp plan-rediger" data-id="${e.id}" aria-label="Rediger øvelse">✎</button>
    </div>`).join('');

  const bibRows = catalogRest.map((c) => `
    <article class="plan-bib-rad" data-id="${esc(c.id)}">
      <div class="plan-bib-topp">
        <h3 class="plan-bib-navn">${esc(c.name)}</h3>
        <button type="button" class="plan-bib-bruk" data-id="${esc(c.id)}">Bruk denne →</button>
      </div>
      ${descriptionBlock(c.description, 120)}
    </article>`).join('');

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
  bindDescriptionToggles(host);

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

  host.querySelectorAll('.plan-bib-bruk').forEach((btn) => {
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
    <div class="ark" role="dialog" aria-label="Hent fra tidligere økt">
      <div class="ark-hode">
        <h2>Hent fra tidligere økt</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <p class="dus liten">Legger til øvelser som ikke allerede finnes i programmet.</p>
      ${rows || '<p class="tomt">Ingen tidligere økter ennå.</p>'}
    </div>`;

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));
  host.querySelectorAll('.plan-kopi-rad').forEach((btn) => {
    btn.addEventListener('click', () => {
      const date = btn.dataset.dato;
      const sets = enriched.filter((s) => s.date === date);
      const byEx = groupBy(sets, (s) => s.exerciseId);
      const dayItems = [...byEx.entries()].map(([exerciseId, exSets]) => ({
        exerciseId,
        goalSets: new Set(exSets.map((s) => s.setNumber)).size || exSets.length,
      })).filter((it) => exMap.has(it.exerciseId));
      host.innerHTML = '';
      onCopy(dayItems);
    });
  });
}

async function openTemplatesSheet(host, exMap, onSelect) {
  const templates = await store.getSavedTemplates();

  const rows = templates.map((t) => {
    const names = t.items
      .map((it) => exMap.get(it.exerciseId)?.name)
      .filter(Boolean)
      .slice(0, 4);
    const extra = t.items.length > 4 ? ` +${t.items.length - 4}` : '';
    return `
      <div class="velger-rad styrke-mal-rad" data-id="${t.id}">
        <div class="styrke-mal-info">
          <span class="velger-navn">${esc(t.name || 'Uten navn')}</span>
          <span class="velger-info dus">${t.items.length} øvelse${t.items.length === 1 ? '' : 'r'} · ${esc(names.join(', '))}${extra}</span>
        </div>
        <span class="styrke-mal-handlinger">
          <button type="button" class="plan-bib-bruk" data-id="${t.id}" data-modus="erstatt">Bruk →</button>
          <button type="button" class="plan-bib-bruk dus" data-id="${t.id}" data-modus="legg-til">+ Legg til</button>
        </span>
      </div>`;
  }).join('');

  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Lagrede programmer">
      <div class="ark-hode">
        <h2>Lagrede programmer</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      ${rows || '<p class="tomt">Ingen lagrede programmer ennå. Bygg et program og trykk «Lagre som program».</p>'}
    </div>`;

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));
  host.querySelectorAll('.plan-bib-bruk[data-modus]').forEach((btn) => {
    btn.addEventListener('click', () => {
      host.innerHTML = '';
      onSelect(btn.dataset.id, btn.dataset.modus === 'erstatt');
    });
  });
}

function openSaveTemplateSheet(host, items, onSave) {
  host.innerHTML = `
    <div class="ark-bakgrunn" data-lukk></div>
    <div class="ark" role="dialog" aria-label="Lagre program">
      <div class="ark-hode">
        <h2>Lagre som program</h2>
        <button type="button" class="lukk" data-lukk aria-label="Lukk">✕</button>
      </div>
      <p class="dus liten">${items.length} øvelse${items.length === 1 ? '' : 'r'} lagres som mal du kan gjenbruke senere.</p>
      <form id="lagre-mal-skjema">
        <label class="felt-navn" for="mal-navn">Navn</label>
        <input type="text" class="inndata" id="mal-navn" placeholder="F.eks. Uke A" required autofocus>
        <button type="submit" class="knapp primaer bred">Lagre program</button>
      </form>
    </div>`;

  host.querySelectorAll('[data-lukk]').forEach((el) => el.addEventListener('click', () => { host.innerHTML = ''; }));
  host.querySelector('#lagre-mal-skjema').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = host.querySelector('#mal-navn').value.trim();
    if (!name) return;
    host.innerHTML = '';
    onSave(name);
  });
}
