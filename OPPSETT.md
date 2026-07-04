# Oppsett av Treningsjournal

Følg disse stegene én gang, så er alt klart. Regn med 10–15 minutter.

## Del 1: Google Sheets-databasen

1. Gå til [sheets.new](https://sheets.new) og opprett et nytt regneark.
   Gi det gjerne navnet **Treningsjournal**.

2. Velg **Utvidelser → Apps Script** i menyen. Et nytt skriptprosjekt åpnes.

3. Åpne filen **`Kode.gs`** i venstre panel (den ligger der fra før).

4. **Slett standardkoden** som ligger i `Kode.gs` fra før, og lim inn **hele
   innholdet** fra filen `apps-script/Kode.gs` i dette repoet.

   > **Viktig:** `Kode.gs` skal **ikke** stå tom. All backend-kode ligger i
   > denne éne filen. Hvis filen er tom, vises «Ingen funksjoner» og Kjør er
   > grå.

5. **Lagre** prosjektet (⌘S på Mac / Ctrl+S på Windows). Dette er viktig –
   uten lagring vises «Ingen funksjoner» og Kjør-knappen er grå.

6. Øverst i editoren: klikk nedtrekksmenyen ved siden av ▶ **Kjør**
   (den står kanskje «Ingen funksjoner» eller «Velg funksjon»).
   Velg **`kjorOppsett`**, og trykk **Kjør**. Første gang må du godkjenne tilgang:
   velg kontoen din → «Avansert» → «Gå til … (usikker)» → «Tillat».
   Dette er normalt for egne skript – det er din egen kode som får
   tilgang til ditt eget regneark.

7. Et varsel viser **API-nøkkelen** din. Noter den (den ligger også i
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

Hvis `apps-script/Kode.gs` oppdateres, limer du inn den nye koden i Apps Script og velger **Distribuer → Administrer distribusjoner → ✏️ Rediger →
Versjon: Ny versjon → Distribuer**. URL-en forblir den samme.

## Feilsøking

- **«Ingen funksjoner» / grå Kjør-knapp** – du har enten ikke limt inn koden,
  ikke lagret (⌘S), eller står i feil panel. Sjekk dette:
  1. Klikk på **`Kode.gs`** i fil-listen til venstre (ikke «Kjørelogg»).
  2. Filen skal inneholde mange linjer kode, og `function kjorOppsett()` skal
     finnes et sted i filen.
  3. Trykk **⌘S** (Mac) eller **Ctrl+S** (Windows) for å lagre.
  4. Vent et par sekunder – nedtrekksmenyen skal nå vise `kjorOppsett`, `doGet`
     og `doPost`.
  5. Velg **`kjorOppsett`** og trykk **Kjør**.

- **«Load failed» / «Kunne ikke nå serveren»** – vanligste årsaker:
  1. URL-en slutter på **`/dev`** i stedet for **`/exec`** (må være `/exec`).
  2. Distribusjonen har tilgang **«Alle»** (Anyone), ikke «Kun meg».
  3. **`Kode.gs` er utdatert** – lim inn nyeste versjon fra repoet og velg
     Distribuer → Administrer distribusjoner → Rediger → Ny versjon → Distribuer.
  4. Test URL-en i nettleseren: den skal vise «Treningsjournal-API kjører…».

- **«Ugyldig API-nøkkel»** – sjekk at nøkkelen i appen er identisk med verdien
  for `apiKey` i Settings-arket.
- **«Oppsett mangler»** – kjør `kjorOppsett` i Apps Script (del 1, steg 5).
- **Test tilkobling feiler** – sjekk at URL-en slutter på `/exec` og at
  distribusjonen har tilgang «Alle».
- **Endringer synkroniseres ikke** – åpne Innstillinger og se synk-status.
  Endringer lagres alltid lokalt først og sendes automatisk når appen har nett.
