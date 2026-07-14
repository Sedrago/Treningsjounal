/**
 * views/exercise-library.js – delte hjelpefunksjoner + videresending til #/ovelser.
 */

import { getCatalogEntry } from '../content.js';
import { esc } from '../utils.js';

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
    const host = el.closest('[data-id], [data-catalog-id]');
    const id = host?.dataset.id || host?.dataset.catalogId;
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

/** @deprecated Bruk #/ovelser?kat=… */
export async function render(container, params) {
  const cat = params[0];
  location.replace(`#${cat ? `/ovelser?kat=${cat}` : '/ovelser'}`);
}
