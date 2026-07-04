/**
 * Setup.gs – engangsoppsett av regnearket.
 *
 * BRUK: Velg funksjonen kjorOppsett i verktøylinjen over og trykk «Kjør».
 * Funksjonen oppretter alle arkene, fyller inn kategoriene og genererer
 * API-nøkkelen du skal lime inn i appen.
 */

/** Kjør denne én gang for å sette opp databasen. */
function kjorOppsett() {
  // Opprett alle arkene med riktige kolonner.
  Object.keys(COLUMNS).forEach(function (name) { getSheet_(name); });

  // Fyll inn de faste bevegelseskategoriene.
  var categories = [
    ['horisontal-push', 'Horisontal push', '💪', 1],
    ['horisontal-pull', 'Horisontal pull', '🚣', 2],
    ['vertikal-push', 'Vertikal push', '🙌', 3],
    ['vertikal-pull', 'Vertikal pull', '🧗', 4],
    ['kneboy', 'Knebøydominant', '🦵', 5],
    ['hoftehengsel', 'Hoftehengsel', '🏋️', 6],
    ['core', 'Core', '🧘', 7],
    ['valgfri', 'Valgfri tilleggsøvelse', '⭐', 8],
  ];
  var categorySheet = getSheet_('Categories');
  if (categorySheet.getLastRow() < 2) {
    categorySheet.getRange(2, 1, categories.length, 4).setValues(categories);
  }

  // Generer API-nøkkel hvis den ikke finnes fra før.
  var apiKey = getSettingValue_('apiKey');
  if (!apiKey) {
    apiKey = genererNokkel_();
    upsert_('Settings', { key: 'apiKey', value: apiKey });
  }

  // Slett standardarket «Sheet1»/«Ark1» hvis det er tomt.
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ['Sheet1', 'Ark1', 'Ark 1'].forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (sheet && sheet.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sheet);
    }
  });

  // Vis nøkkelen til brukeren.
  var message = 'Oppsett fullført!\n\nAPI-nøkkelen din (lim inn i appen):\n\n' + apiKey
    + '\n\nDu finner den også i Settings-arket.';
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (e) {
    Logger.log(message);
  }
}

/** Genererer en tilfeldig nøkkel på 32 tegn. */
function genererNokkel_() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  var key = '';
  for (var i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}
