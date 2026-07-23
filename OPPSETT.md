# Oppsett av FlowBooster

Følg disse stegene én gang, så er alt klart. Regn med 10–15 minutter.

## Del 1: Google Sheets-databasen

1. Gå til [sheets.new](https://sheets.new) og opprett et nytt regneark.
   Gi det gjerne navnet **FlowBooster**.

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

   `kjorOppsett` oppretter ark, kategorier og API-nøkkel.
   Øvelser velges i appen under **Øvelser** (startpakke eller fra katalogen).

7. Et varsel viser **API-nøkkelen** din. Noter den (den ligger også i
   Settings-arket i regnearket).

### Test API-et i nettleseren

Grunn-URL uten parametere skal vise: *«FlowBooster-API kjører…»* (det er normalt).

For å teste ping, må spesialtegn **URL-enkodes**. `{}` blir `%7B%7D`:

```
https://script.google.com/macros/s/DIN-ID/exec?action=ping&key=DIN-API-NOKKEL&payload=%7B%7D
```

Du skal få JSON tilbake: `{"ok":true,"data":{"pong":true,…}}`

> Skriv **ikke** `payload={}` direkte i adressefeltet – `{` og `}` gir feil hos Google.

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

### Inviter ny bruker (personlig oppsetts-QR)

Hvis flere skal koble seg til **samme** regneark (bevisst delt journal):

1. Den som har satt opp ark og appen: **Innstillinger → Generer oppsetts-QR**.
2. Send **QR-bildet**, **oppsettslenken** eller **oppsettskoden** til den nye brukeren (e-post).
3. Mottaker skanner QR eller åpner lenken → bekrefter → appen er koblet til.

> Personlig oppsett — send ikke QR på offentlig plakat. Hver person med eget ark lager egen QR etter eget `kjorOppsett`.
> Relay-brukernavn synkroniseres via Settings-arket og følger med i oppsetts-QR når det er registrert.

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

- **«Ugyldig svar fra server (200)»** – serveren svarer, men uten JSON. Vanligst:
  1. **`Kode.gs` er ikke redeployet** etter oppdatering – gjør Distribuer → Ny versjon.
  2. URL-en peker på gammel versjon uten API-støtte.
  3. Test at nyeste `Kode.gs` (med `parseRequest_`) er limt inn og lagret.

- **«Load failed» / «Kunne ikke nå serveren»** – vanligste årsaker:
  1. URL-en slutter på **`/dev`** i stedet for **`/exec`** (må være `/exec`).
  2. Distribusjonen har tilgang **«Alle»** (Anyone), ikke «Kun meg».
  3. **`Kode.gs` er utdatert** – lim inn nyeste versjon fra repoet og velg
     Distribuer → Administrer distribusjoner → Rediger → Ny versjon → Distribuer.
  4. Test URL-en i nettleseren: den skal vise «FlowBooster-API kjører…».

- **«Ugyldig API-nøkkel»** – sjekk at nøkkelen i appen er identisk med verdien
  for `apiKey` i Settings-arket.
- **«Oppsett mangler»** – kjør `kjorOppsett` i Apps Script (del 1, steg 5).
- **«Du har ikke tillatelse til å kalle UrlFetchApp.fetch»** (Spør AI / OpenAI):
  1. Fyll inn `openAiApiKey` i Settings-arket.
  2. I Apps Script: velg **`testOpenAiTilkobling`** i nedtrekksmenyen og trykk **Kjør**.
  3. Godta tilgang til **eksterne tjenester** når Google spør (samme Google-konto som eier regnearket).
  4. Sjekk at Web App er **Utfør som: Meg** (del 2, steg 3).
  5. **Distribuer → Ny versjon** etter godkjenning.
- **Ingen øvelser i kategoriene** – gå til **Øvelser** og trykk
  **Legg til startpakke** (28 grunnleggende øvelser), eller velg enkeltvis fra katalogen.

## Øvelseskatalog (utvikling)

Katalogen (`data/ovelsesinnhold.json`) bygges fra `exercises.json` i rotmappen:

```bash
node scripts/build-catalog.mjs
```

Kjør dette etter endringer i `exercises.json`. Filen må være lagret på disk
(⌘S) før bygging. `app_category` mappes til appens åtte kategorier
(`accessory` → `valgfri`).
- **Test tilkobling feiler** – sjekk at URL-en slutter på `/exec` og at
  distribusjonen har tilgang «Alle».
- **Endringer synkroniseres ikke** – åpne Innstillinger og se synk-status.
  Endringer lagres alltid lokalt først og sendes automatisk når appen har nett.

## Del 3: Programdeling (relay, valgfritt)

For QR-import og publisering til grupper (f.eks. plakat på veggen). Personlig
treningslogg deles **ikke** via relay — kun programstruktur.

1. Opprett et **nytt** regneark (f.eks. «FlowBooster Relay») — ikke det
   personlige treningsarket.
2. Lim inn **`apps-script/Relay.gs`** i Apps Script (erstatt standardkoden).
3. Kjør **`kjorRelayOppsett`** én gang. Noter **publiseringsnøkkelen**.
4. Deploy som Web App: **Alle**, Kjør som **Meg**, URL slutter på **`/exec`**.
5. I appen under **Innstillinger → Programdeling**:
   - Lim inn **Relay Web App-URL** (alle som skal importere).
   - Lim inn **publiseringsnøkkel** (kun trenere som skal publisere).

**Importere:** Skann QR eller åpne `#/program?k=KODE` i appen.

**Publisere:** Styrke → Lagrede programmer → ↗ Eksporter → «Publiser og vis QR».

### Partner-deling

1. Begge registrerer **brukernavn** under Innstillinger → Programdeling.
2. Inviter partner med brukernavn — partneren **godtar** invitasjonen.
3. **Send program:** Styrke → Eksporter → «Send til partner».
4. **Motta:** Appen viser varsel ved nye programmer — åpne **#/innboks**.

Relay-brukernavn lagres i **Settings-arket** (`relayUsername`, `relayDeviceSecret`) og synkroniseres til andre enheter med samme regneark. Oppsetts-QR inkluderer brukernavnet når det finnes.

Etter oppdatering av `Relay.gs`: kjør `kjorRelayOppsett` på nytt (oppretter Users/Pairings/Inbox-ark) og redeploy Web App.
