/**
 * API.gs – HTTP-endepunktet for appen (deployes som Web App).
 *
 * Alle kall er POST med JSON-body: { key, action, payload }.
 * Svar: { ok: true, data } eller { ok: false, error }.
 */

/** Statusside for GET (åpnes i nettleser). */
function doGet() {
  return ContentService
    .createTextOutput('Treningsjournal-API kjører. Bruk appen for å koble til.')
    .setMimeType(ContentService.MimeType.TEXT);
}

/** Hovedinngangen for API-kall. */
function doPost(e) {
  var response;
  try {
    var request = JSON.parse(e.postData.contents);
    checkApiKey_(request.key);
    response = { ok: true, data: route_(request.action, request.payload || {}) };
  } catch (error) {
    response = { ok: false, error: String(error.message || error) };
  }
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Kaster feil hvis API-nøkkelen ikke stemmer. */
function checkApiKey_(key) {
  var expected = getSettingValue_('apiKey');
  if (!expected) throw new Error('Oppsett mangler: kjør kjorOppsett() først.');
  if (!key || key !== expected) throw new Error('Ugyldig API-nøkkel.');
}

/** Ruter forespørselen til riktig handling. */
function route_(action, payload) {
  switch (action) {
    case 'ping':
      return { pong: true, time: new Date().toISOString() };
    case 'pull':
      return pullAll_();
    case 'push':
      return pushOps_(payload.ops || []);
    default:
      throw new Error('Ukjent handling: ' + action);
  }
}

/** Returnerer hele datasettet. */
function pullAll_() {
  var settings = {};
  readAll_('Settings').forEach(function (row) {
    if (row.key !== 'apiKey') settings[row.key] = row.value;
  });
  return {
    exercises: readAll_('Exercises'),
    workouts: readAll_('Workouts'),
    sets: readAll_('Sets'),
    bodyweight: readAll_('Bodyweight'),
    categories: readAll_('Categories'),
    settings: settings,
  };
}

/**
 * Tar imot en liste operasjoner fra klientens synk-kø og
 * skriver dem til arkene. Kjøres med lås for å unngå kollisjoner.
 */
function pushOps_(ops) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var results = [];
    ops.forEach(function (op) {
      var sheetName = SHEETS[op.entity];
      if (!sheetName) throw new Error('Ukjent entitet: ' + op.entity);
      results.push(upsert_(sheetName, op.data));
    });
    updateStatistics_();
    return { applied: results.length, results: results };
  } finally {
    lock.releaseLock();
  }
}
