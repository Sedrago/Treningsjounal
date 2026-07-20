/**
 * views/insight-hub.js – innsikt og statistikk.
 * Foreløpig én hovedside; utvides senere.
 */

export async function render(container) {
  container.innerHTML = `
    <header class="side-topp">
      <a href="#/hjem" class="tilbake" aria-label="Tilbake til hjem">‹</a>
      <div>
        <h1>Innsikt</h1>
        <p class="dus">Trender og oversikt</p>
      </div>
    </header>

    <nav class="hub-meny" aria-label="Innsikt">
      <a href="#/statistikk" class="hub-lenke">
        <span class="hub-lenke-ikon" aria-hidden="true">📊</span>
        <span class="hub-lenke-tekst">
          <strong>Statistikk</strong>
          <span class="dus liten">Aktivitet, progresjon og rekorder</span>
        </span>
        <span class="hub-lenke-pil" aria-hidden="true">›</span>
      </a>
    </nav>
  `;
}
