/**
 * views/exercise-library.js – bla i katalog og legg til / fjern øvelser i appen.
 */

import * as store from '../store.js';
import { initContent, getCatalogByCategory, getCatalogEntry, isContentLoaded } from '../content.js';
import { esc, toast, categoryIconHtml } from '../utils.js';

/** Kort utdrag av beskrivelse til listevisning. */
export function excerpt(text, max = 140) {
  if (!text || text.length <= max) return { short: text, truncated: false };
  return { short: `${text.slice(0, max).trim()}…`, truncated: true };
}

/** Beskrivelse – klikk bytter mellom utdrag og full tekst. */
export function descriptionBlock(text, max = 140) {
  const { short, truncated } = excerpt(text, max);
  if (!text) return '';
  if (!truncated) return `<p class="bib-beskrivelse">${esc(text)}</p>`;
  return `<p class="bib-beskrivelse bib-beskrivelse--utvidbar" role="button" tabindex="0">${esc(short)}</p>`;
}

/** Klikk/Enter på utdrag viser hele beskrivelsen og tilbake igjen. */
export function bindDescriptionToggles(container, resolveDescription) {
  container.querySelectorAll('.bib-beskrivelse--utvidbar').forEach((el) => {
    const id = el.closest('[data-id]')?.dataset.id;
    const full = resolveDescription
      ? resolveDescription(id)
      : (id ? getCatalogEntry(id)?.description : '');
    if (!full) return;

    const { short } = excerpt(full);
    let expanded = false;

    const toggle = () => {
      expanded = !expanded;
      el.textContent = expanded ? full : short;
    };

    el.addEventListener('click', toggle);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });
}

/** Kategorivelger. */
async function renderCategories(container) {
  const activeIds = await store.getActiveCatalogIds();
  const cards = store.KATEGORIER.map((k) => {
    const count = getCatalogByCategory(k.id).length;
    const inApp = getCatalogByCategory(k.id).filter((c) => activeIds.includes(c.id)).length;
    return `
      <a href="#/bibliotek/${k.id}" class="kort kategori-kort bib-kategori">
        <span class="kategori-topp">
          ${categoryIconHtml(k)}
          <span class="kategori-navn">${esc(k.name)}</span>
        </span>
        <p class="dus liten">${inApp} av ${count} i appen</p>
      </a>`;
  }).join('');

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/ovelser" class="tilbake" aria-label="Tilbake til øvelser">‹</a>
      <h1>Bibliotek</h1>
    </header>
    <p class="dus bib-intro">Velg kategori for å se øvelser med navn og teknikk. Legg til det du vil bruke i øktene dine.</p>
    ${cards}
  `;
}

/** Øvelser i én kategori. */
async function renderCategory(container, categoryId) {
  const category = store.categoryById(categoryId);
  if (!category) {
    container.innerHTML = '<p class="tomt">Ukjent kategori.</p>';
    return;
  }

  const catalog = getCatalogByCategory(categoryId);
  const activeIds = new Set(await store.getActiveCatalogIds());

  const cards = catalog.map((item) => {
    const inApp = activeIds.has(item.id);
    return `
      <article class="kort bib-kort ${inApp ? 'bib-i-appen' : ''}" data-id="${esc(item.id)}">
        <h2 class="bib-navn">${esc(item.name)}</h2>
        ${descriptionBlock(item.description)}
        <button type="button" class="knapp ${inApp ? 'sekundaer' : 'primaer'} bib-handling" data-id="${esc(item.id)}">
          ${inApp ? '✓ I appen · Fjern' : '+ Legg til i appen'}
        </button>
      </article>`;
  }).join('');

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/bibliotek" class="tilbake" aria-label="Tilbake til kategorier">‹</a>
      <div>
        <h1 class="kategori-tittel">${categoryIconHtml(category)} ${esc(category.name)}</h1>
        <p class="dus">${catalog.length} øvelser i biblioteket</p>
      </div>
    </header>
    ${cards || '<p class="tomt">Ingen øvelser i denne kategorien ennå.</p>'}
  `;

  bindDescriptionToggles(container);

  container.querySelectorAll('.bib-handling').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const catalogId = btn.dataset.id;
      const entry = getCatalogEntry(catalogId);
      if (!entry) return;

      if (activeIds.has(catalogId)) {
        if (!confirm(`Fjerne «${entry.name}» fra appen? Loggede sett og historikk beholdes.`)) return;
        await store.removeExerciseFromCatalog(catalogId);
        toast('Fjernet fra appen');
      } else {
        await store.addExerciseFromCatalog(catalogId, entry);
        toast('Lagt til i appen', 'suksess');
      }
      renderCategory(container, categoryId);
    });
  });
}

export async function render(container, params) {
  const loaded = await initContent();
  if (!loaded || !isContentLoaded()) {
    container.innerHTML = `
      <header class="side-topp">
        <a href="#/ovelser" class="tilbake" aria-label="Tilbake til øvelser">‹</a>
        <h1>Bibliotek</h1>
      </header>
      <p class="tomt">Kunne ikke laste øvelsesbiblioteket. Prøv å laste siden på nytt.</p>
      <button type="button" class="knapp primaer bred" onclick="location.reload()">Last på nytt</button>`;
    return;
  }
  const categoryId = params[0];
  if (categoryId) {
    await renderCategory(container, categoryId);
  } else {
    await renderCategories(container);
  }
}
