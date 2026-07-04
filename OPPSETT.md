# Oppsett av Treningsjournal

Følg disse stegene én gang, så er alt klart. Regn med 10–15 minutter.

## Del 1: Google Sheets-databasen

1. Gå til [sheets.new](https://sheets.new) og opprett et nytt regneark.
   Gi det gjerne navnet **Treningsjournal**.

2. Velg **Utvidelser → Apps Script** i menyen. Et nytt skriptprosjekt åpnes.

3. Slett innholdet i filen `Kode.gs` som ligger der fra før.

4. Opprett disse fire filene i skriptprosjektet (klikk **+** ved «Filer» → «Skript»),
   og lim inn innholdet fra mappen `apps-script/` i dette repoet:

   | Fil i Apps Script | Kopier innholdet fra |
   |---|---|
   | `Database` | `apps-script/Database.gs` |
   | `API` | `apps-script/API.gs` |
   | `Statistics` | `apps-script/Statistics.gs` |
   | `Setup` | `apps-script/Setup.gs` |

   (Den tomme `Kode.gs` kan du la stå eller slette.)

5. Lagre (⌘S), velg funksjonen **kjorOppsett** i nedtrekksmenyen i verktøylinjen,
   og trykk **Kjør**. Første gang må du godkjenne tilgang:
   velg kontoen din → «Avansert» → «Gå til … (usikker)» → «Tillat».
   Dette er normalt for egne skript – det er din egen kode som får
   tilgang til ditt eget regneark.

6. Et varsel viser **API-nøkkelen** din. Noter den (den ligger også i
   Settings-arket i regnearket).

## Del 2: Publiser API-et

1. I Apps Script: trykk **Distribuer → Ny distribusjon** (Deploy → New deployment).
2. Trykk tannhjulet ved «Velg type» og velg **Nettapp** (Web app).
3. Sett:
   - **Utfør som:** Meg
   - **Hvem har tilgang:** Alle (Anyone)
4. Trykk **Distribuer** og kopier **Nettapp-URL-en**
   (slutter på `/exec`).

> Tilgangen «Alle» betyr bare at URL-en kan nås uten Google-innlogging.
> API-nøkkelen fra del 1 kreves for alle kall, så dataene dine er beskyttet.

## Del 3: Koble til appen

1. Åpne appen: `https://<brukernavn>.github.io/treningsjournal/`
2. Gå til **Innstillinger**.
3. Lim inn **Web App-URL** og **API-nøkkel**.
4. Trykk **Test tilkobling** – du skal få «Tilkoblingen fungerer!».
5. Trykk **Synkroniser nå**.

## Del 4: Legg appen på Hjem-skjermen (iPhone)

1. Åpne appen i **Safari**.
2. Trykk **Del-knappen** (firkanten med pil opp).
3. Velg **Legg til på Hjem-skjerm**.
4. Appen får eget ikon og åpnes i fullskjerm som en vanlig app.

## Senere endringer i backend-koden

Hvis backend-filene i `apps-script/` oppdateres, limer du inn den nye koden i
Apps Script og velger **Distribuer → Administrer distribusjoner → ✏️ Rediger →
Versjon: Ny versjon → Distribuer**. URL-en forblir den samme.

## Feilsøking

- **«Ugyldig API-nøkkel»** – sjekk at nøkkelen i appen er identisk med verdien
  for `apiKey` i Settings-arket.
- **«Oppsett mangler»** – kjør `kjorOppsett` i Apps Script (del 1, steg 5).
- **Test tilkobling feiler** – sjekk at URL-en slutter på `/exec` og at
  distribusjonen har tilgang «Alle».
- **Endringer synkroniseres ikke** – åpne Innstillinger og se synk-status.
  Endringer lagres alltid lokalt først og sendes automatisk når appen har nett.
