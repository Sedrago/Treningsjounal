/**
 * views/exercise-library.js – bla i katalog og legg til / fjern øvelser i appen.
 */

import * as store from '../store.js';
import { getCatalogByCategory, getCatalogEntry } from '../content.js';
import { esc, toast } from '../utils.js';

/** Kort utdrag av beskrivelse til listevisning. */
function excerpt(text, max = 140) {
  if (!text || text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
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
          <span class="kategori-ikon" aria-hidden="true">${k.icon}</span>
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
        <p class="bib-beskrivelse">${esc(excerpt(item.description))}</p>
        <button type="button" class="knapp ${inApp ? 'sekundaer' : 'primaer'} bib-handling" data-id="${esc(item.id)}">
          ${inApp ? '✓ I appen · Fjern' : '+ Legg til i appen'}
        </button>
      </article>`;
  }).join('');

  container.innerHTML = `
    <header class="side-topp">
      <a href="#/bibliotek" class="tilbake" aria-label="Tilbake til kategorier">‹</a>
      <div>
        <h1>${category.icon} ${esc(category.name)}</h1>
        <p class="dus">${catalog.length} øvelser i biblioteket</p>
      </div>
    </header>
    ${cards || '<p class="tomt">Ingen øvelser i denne kategorien ennå.</p>'}
  `;

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
  const categoryId = params[0];
  if (categoryId) {
    await renderCategory(container, categoryId);
  } else {
    await renderCategories(container);
  }
}
