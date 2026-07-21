# FlowBooster

Personlig, mobiltilpasset treningsapp (PWA) for å **bygge momentum** i treningsperioden —
styrke, kost, søvn, aerob og mer. Vanilla JavaScript uten rammeverk,
Google Sheets som database via Google Apps Script.

## Funksjoner

- **Dagens økt** – kort per bevegelseskategori (horisontal/vertikal push og pull,
  knebøydominant, hoftehengsel, core, valgfri), med forrige prestasjon.
- **Rask logging** – vekt, reps, RIR og kommentar per sett. Alt lagres automatisk.
- **Smart assistent** – varsler om forsømte kategorier, ubalanse mellom
  bevegelsesmønstre, volumtrend og progresjonsforslag («Forsøk 85 kg i dag»).
- **Historikk** – søk og tidsfilter, per økt og per øvelse.
- **Statistikk** – estimert 1RM, PR-er, volum, streak, heatmap og grafer.
- **Kroppsvekt** – logging med graf.
- **Hviletimer** – stor nedtelling med vibrasjon/lyd.
- **Offline-først** – alt lagres lokalt (IndexedDB) og synkroniseres automatisk
  til Google Sheets når det er nett.
- **Eksport/import** – JSON, CSV, Excel-vennlig CSV og PDF-rapport.

## Arkitektur

```
index.html            – app-skallet (én side)
css/style.css         – designsystem, mørkt/lyst tema
js/
  app.js              – oppstart, tema og ruter
  db.js               – IndexedDB-innpakning
  store.js            – datalaget (all CRUD + synk-kø)
  api.js              – klient mot Apps Script Web App
  sync.js             – lokal-først-synkronisering
  stats.js            – statistikkberegninger (rene funksjoner)
  assistant.js        – den smarte treningsassistenten
  charts.js           – SVG-grafer og heatmap
  timer.js            – hviletimer
  importexport.js     – eksport og import
  views/              – én modul per skjerm
sw.js                 – service worker (offline)
apps-script/Kode.gs   – backend-kode (lim inn i Google Apps Script)
```

**Dataflyt:** Alle skriv går umiddelbart til IndexedDB og legges i en synk-kø.
Køen sendes til Apps Script i bakgrunnen (batch). Ved oppstart hentes ferske
data fra Google Sheets, som er sannhetskilden. Uten nett fungerer alt som
normalt – synkroniseringen tar seg av resten når nettet er tilbake.

## Kom i gang

Se **[OPPSETT.md](OPPSETT.md)** for trinnvis oppsett av Google Sheets,
Apps Script og appen.

## Lokal utvikling

Appen er statiske filer og trenger bare en enkel webserver:

```bash
python3 -m http.server 8000
# åpne http://localhost:8000
```
