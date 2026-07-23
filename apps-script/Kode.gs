/**
 * FlowBooster – komplett backend i én fil.
 *
 * BRUK:
 *   1. Lim inn HELE denne filen i Kode.gs i Apps Script (erstatt alt som står der).
 *   2. Lagre (⌘S / Ctrl+S).
 *   3. Velg kjorOppsett i nedtrekksmenyen øverst og trykk Kjør.
 */

// =============================================================================
// Database
// =============================================================================

var SHEETS = {
  exercise: 'Exercises',
  workout: 'Workouts',
  set: 'Sets',
  bodyweight: 'Bodyweight',
  aerobic: 'Aerobic',
  sleep: 'Sleep',
  mood: 'Mood',
  plan: 'Plans',
  foodPreset: 'FoodPresets',
  foodIntake: 'FoodIntakes',
  lactate: 'Lactate',
  category: 'Categories',
  setting: 'Settings',
};

var COLUMNS = {
  Exercises: ['id', 'name', 'category', 'notes', 'video', 'active',
    'goalSets', 'goalRepsMin', 'goalRepsMax', 'logMode', 'deleted', 'updatedAt', 'catalogId'],
  Workouts: ['id', 'date', 'startedAt', 'duration', 'bodyweight', 'notes', 'deleted', 'updatedAt'],
  Sets: ['id', 'workoutId', 'exerciseId', 'setNumber', 'weight', 'reps', 'rir', 'durationSec',
    'rest', 'comment', 'deleted', 'updatedAt'],
  Bodyweight: ['id', 'date', 'weight', 'fatPct', 'comment', 'deleted', 'updatedAt'],
  Aerobic: ['id', 'date', 'minutes', 'activity', 'comment', 'deleted', 'updatedAt', 'intensity'],
  Sleep: ['id', 'date', 'hours', 'quality', 'comment', 'deleted', 'updatedAt'],
  Mood: ['id', 'date', 'value', 'context', 'workoutId', 'deleted', 'updatedAt'],
  FoodPresets: ['id', 'name', 'proteinG', 'carbsG', 'fatG', 'kcal', 'unitLabel', 'sortOrder', 'deleted', 'updatedAt'],
  FoodIntakes: ['id', 'date', 'time', 'proteinG', 'carbsG', 'fatG', 'kcal', 'qty', 'presetId', 'note', 'deleted', 'updatedAt'],
  Lactate: ['id', 'date', 'produced', 'deleted', 'updatedAt'],
  Plans: ['id', 'date', 'name', 'items', 'status', 'sourceTemplateId', 'deleted', 'updatedAt'],
  Categories: ['id', 'name', 'icon', 'priority'],
  Settings: ['key', 'value'],
  Statistics: ['key', 'value'],
};

function getSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, COLUMNS[name].length).setValues([COLUMNS[name]]);
    sheet.setFrozenRows(1);
  } else {
    ensureSheetSchema_(sheet, name);
  }
  return sheet;
}

/** Kolonnenummer (1-basert) → bokstav (A, B, …). */
function colLetter_(column) {
  var n = column;
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** A1-område – unngår forvirring om getRange sitt tredje argument. */
function rangeA1_(startRow, startCol, endRow, endCol) {
  return colLetter_(startCol) + startRow + ':' + colLetter_(endCol) + endRow;
}

function headerCell_(value) {
  return String(value || '').trim().toLowerCase();
}

/** Versjon etter kolonnemigrering – hopp over reparasjon når denne er satt. */
var SCHEMA_MIGRATION_VERSION = 'v1';

function schemaFlagKey_(sheetName) {
  return 'schema_' + sheetName;
}

function isSchemaCurrent_(sheetName) {
  return PropertiesService.getScriptProperties().getProperty(schemaFlagKey_(sheetName)) === SCHEMA_MIGRATION_VERSION;
}

function markSchemaCurrent_(sheetName) {
  PropertiesService.getScriptProperties().setProperty(schemaFlagKey_(sheetName), SCHEMA_MIGRATION_VERSION);
}

function clearSchemaFlags_() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(schemaFlagKey_('Sets'));
  props.deleteProperty(schemaFlagKey_('Exercises'));
}

/**
 * Oppdaterer ark når schema endres (f.eks. durationSec i Sets, logMode i Exercises).
 * Reparasjon kjøres maks én gang per ark (lagres i Script Properties).
 */
function ensureSheetSchema_(sheet, sheetName) {
  var expected = COLUMNS[sheetName];
  if (!expected) return;

  var have = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, have).getValues()[0];

  if (sheetName === 'Sets') {
    migrateSetsSheet_(sheet, headers);
    return;
  }
  if (sheetName === 'Exercises') {
    migrateExercisesSheet_(sheet, headers);
    return;
  }

  // Generisk: legg til manglende kolonner på slutten (kun enkle utvidelser).
  if (have >= expected.length) return;
  for (var c = have + 1; c <= expected.length; c++) {
    sheet.getRange(1, c).setValue(expected[c - 1]);
  }
}

/** Sets: sett inn durationSec mellom rir og rest; rett feilplasserte nye rader. */
function migrateSetsSheet_(sheet, headers) {
  var expected = COLUMNS.Sets;
  var normalized = headers.map(headerCell_);

  if (normalized.indexOf('durationsec') !== -1) {
    if (isSchemaCurrent_('Sets')) return;
    sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
    if (setsNeedRepair_(sheet)) repairSetsRowsAfterDurationSec_(sheet);
    trimExtraColumns_(sheet, expected.length);
    markSchemaCurrent_('Sets');
    return;
  }

  // Gammelt schema: … rir, rest, comment, deleted, updatedAt
  var restAt = normalized.indexOf('rest');
  if (restAt === 7) {
    sheet.insertColumnBefore(8);
    sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
    repairSetsRowsAfterDurationSec_(sheet);
    trimExtraColumns_(sheet, expected.length);
    markSchemaCurrent_('Sets');
  }
}

/** True hvis noen rader har deleted/updatedAt ett hakk for langt til høyre. */
function setsNeedRepair_(sheet) {
  var lastRow = sheet.getLastRow();
  for (var r = 2; r <= lastRow; r++) {
    var deletedVal = sheet.getRange(r, 12).getValue();
    if (deletedVal !== true && deletedVal !== false) continue;
    if (isTimestampLike_(sheet.getRange(r, 13).getValue())) return true;
  }
  return false;
}

function trimExtraColumns_(sheet, expectedLen) {
  var extra = sheet.getLastColumn() - expectedLen;
  if (extra > 0) {
    sheet.deleteColumns(expectedLen + 1, extra);
  }
}

/**
 * Rader skrevet med nytt schema før kolonnen ble satt inn ender med
 * deleted i kol 12 og updatedAt i kol 13 – flytt ett hakk venstre.
 */
function repairSetsRowsAfterDurationSec_(sheet) {
  var lastRow = sheet.getLastRow();
  for (var r = 2; r <= lastRow; r++) {
    var deletedVal = sheet.getRange(r, 12).getValue();
    var updatedVal = sheet.getRange(r, 13).getValue();
    if (deletedVal !== true && deletedVal !== false) continue;
    if (!isTimestampLike_(updatedVal)) continue;
    sheet.getRange(r, 11).setValue(deletedVal);
    sheet.getRange(r, 12).setValue(updatedVal);
    sheet.getRange(r, 13).clearContent();
  }
}

function isTimestampLike_(value) {
  if (value instanceof Date) return true;
  return /^\d{4}-\d{2}-\d{2}T/.test(String(value || ''));
}

/** Exercises: logMode-kolonne + rett rader skrevet ett hakk feil. */
function migrateExercisesSheet_(sheet, headers) {
  var expected = COLUMNS.Exercises;
  var normalized = headers.map(headerCell_);

  if (isSchemaCurrent_('Exercises') && normalized.indexOf('logmode') !== -1) return;

  if (normalized.indexOf('logmode') === -1) {
    var deletedIdx = normalized.indexOf('deleted');
    if (deletedIdx !== -1) {
      sheet.insertColumnBefore(deletedIdx + 1);
    }
  }

  if (normalized.indexOf('catalogid') === -1) {
    sheet.getRange(1, sheet.getLastColumn() + 1).setValue('catalogId');
  }

  sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
  if (exercisesNeedRepair_(sheet)) repairExercisesRowsAfterLogMode_(sheet);
  trimExtraColumns_(sheet, expected.length);
  markSchemaCurrent_('Exercises');
}

function exercisesNeedRepair_(sheet) {
  var lastRow = sheet.getLastRow();
  for (var r = 2; r <= lastRow; r++) {
    var col11 = sheet.getRange(r, 11).getValue();
    if (col11 === 'weight' || col11 === 'bodyweight' || col11 === 'duration') return true;
  }
  return false;
}

/**
 * Standardøvelser skrevet før logMode-kolonnen finnes ender slik:
 * kol 11 = 'weight', kol 12 = deleted, kol 13 = updatedAt, kol 14 = catalogId.
 */
function repairExercisesRowsAfterLogMode_(sheet) {
  var lastRow = sheet.getLastRow();
  for (var r = 2; r <= lastRow; r++) {
    var col11 = sheet.getRange(r, 11).getValue();
    if (col11 !== 'weight' && col11 !== 'bodyweight' && col11 !== 'duration') continue;
    var deletedVal = sheet.getRange(r, 12).getValue();
    var updatedVal = sheet.getRange(r, 13).getValue();
    var catalogVal = sheet.getRange(r, 14).getValue();
    var idVal = sheet.getRange(r, 1).getValue();
    sheet.getRange(r, 10).setValue(col11);
    sheet.getRange(r, 11).setValue(deletedVal);
    sheet.getRange(r, 12).setValue(updatedVal);
    sheet.getRange(r, 13).setValue(catalogVal || idVal);
    if (sheet.getLastColumn() > 13) {
      sheet.getRange(r, 14).clearContent();
    }
  }
}

function cellToValue_(value, column) {
  if (value === '' || value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (column === 'date') {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    return value.toISOString();
  }
  return value;
}

function readAll_(sheetName) {
  var sheet = getSheet_(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var columns = COLUMNS[sheetName];
  var values = sheet.getRange(rangeA1_(2, 1, lastRow, columns.length)).getValues();
  return values
    .filter(function (row) { return row[0] !== ''; })
    .map(function (row) {
      var obj = {};
      columns.forEach(function (col, i) { obj[col] = cellToValue_(row[i], col); });
      return obj;
    });
}

function objectToRow_(sheetName, obj) {
  return COLUMNS[sheetName].map(function (col) {
    var value = obj[col];
    if (value === null || value === undefined) return '';
    return value;
  });
}

function upsert_(sheetName, obj) {
  var sheet = getSheet_(sheetName);
  var columns = COLUMNS[sheetName];
  var keyColumn = sheetName === 'Settings' || sheetName === 'Statistics' ? 'key' : 'id';
  var keyIndex = columns.indexOf(keyColumn);
  var updatedIndex = columns.indexOf('updatedAt');

  var lastRow = sheet.getLastRow();
  var rowNumber = -1;
  if (lastRow >= 2) {
    var keyCol = keyIndex + 1;
    var keys = sheet.getRange(rangeA1_(2, keyCol, lastRow, keyCol)).getValues();
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i][0]) === String(obj[keyColumn])) {
        rowNumber = i + 2;
        break;
      }
    }
  }

  if (rowNumber === -1) {
    sheet.appendRow(objectToRow_(sheetName, obj));
    return 'inserted';
  }

  if (updatedIndex !== -1 && obj.updatedAt) {
    var existing = sheet.getRange(rowNumber, updatedIndex + 1).getValue();
    if (existing instanceof Date && existing.toISOString() > obj.updatedAt) {
      return 'skipped';
    }
  }
  sheet.getRange(rangeA1_(rowNumber, 1, rowNumber, columns.length)).setValues([objectToRow_(sheetName, obj)]);
  return 'updated';
}

function getSettingValue_(key) {
  var rows = readAll_('Settings');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].key === key) return rows[i].value;
  }
  return null;
}

function hasSettingKey_(key) {
  var rows = readAll_('Settings');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].key === key) return true;
  }
  return false;
}

// =============================================================================
// API
// =============================================================================

function doGet(e) {
  if (!e || !e.parameter) {
    return statusPage_();
  }
  // Appen sender alt som GET ?data={"key":"…","action":"…","payload":{…}}
  if (e.parameter.data) {
    var request = JSON.parse(e.parameter.data);
    return handleApiRequest_(request.action, request.key, JSON.stringify(request.payload || {}));
  }
  // Enkel test i nettleser: ?action=ping&key=…&payload=%7B%7D
  if (e.parameter.action) {
    return handleApiRequest_(e.parameter.action, e.parameter.key, e.parameter.payload || '{}');
  }
  return statusPage_();
}

function statusPage_() {
  return ContentService
    .createTextOutput('FlowBooster-API kjører. Bruk appen for å koble til.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  var request = parseRequest_(e);
  return handleApiRequest_(request.action, request.key, JSON.stringify(request.payload || {}));
}

/** Parser innkommende POST (JSON-body eller urlencoded data=…). */
function parseRequest_(e) {
  // urlencoded: data={"key":"…","action":"ping","payload":{}}
  if (e.parameter && e.parameter.data) {
    return JSON.parse(e.parameter.data);
  }
  if (!e.postData || !e.postData.contents) {
    throw new Error('Tom forespørsel');
  }
  var contents = e.postData.contents;
  // Rå JSON-body.
  if (contents.charAt(0) === '{') {
    return JSON.parse(contents);
  }
  // urlencoded uten at GAS fylte e.parameter (f.eks. text/plain body).
  if (contents.indexOf('data=') === 0) {
    return JSON.parse(decodeURIComponent(contents.substring(5)));
  }
  throw new Error('Ukjent request-format');
}

/** Felles håndtering for GET og POST. */
function handleApiRequest_(action, key, payloadStr) {
  var response;
  try {
    checkApiKey_(key);
    var payload = payloadStr ? JSON.parse(payloadStr) : {};
    response = { ok: true, data: route_(action, payload) };
  } catch (error) {
    response = { ok: false, error: String(error.message || error) };
  }
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkApiKey_(key) {
  var expected = getSettingValue_('apiKey');
  if (!expected) throw new Error('Oppsett mangler: kjør kjorOppsett() først.');
  if (!key || key !== expected) throw new Error('Ugyldig API-nøkkel.');
}

function route_(action, payload) {
  switch (action) {
    case 'ping':
      return { pong: true, time: new Date().toISOString() };
    case 'pull':
      return pullAll_();
    case 'push':
      return pushOps_(payload.ops || []);
    case 'nutritionStructure':
      return nutritionStructure_(payload.text);
    case 'nutritionPickFood':
      return nutritionPickFood_(payload);
    case 'nutritionSuggestSearch':
      return nutritionSuggestSearch_(payload);
    case 'nutritionBrandEstimate':
      return nutritionBrandEstimate_(payload.text);
    default:
      throw new Error('Ukjent handling: ' + action);
  }
}

function pullAll_() {
  var settings = {};
  readAll_('Settings').forEach(function (row) {
    if (row.key !== 'apiKey' && row.key !== 'openAiApiKey') settings[row.key] = row.value;
  });
  return {
    exercises: readAll_('Exercises'),
    workouts: readAll_('Workouts'),
    sets: readAll_('Sets'),
    bodyweight: readAll_('Bodyweight'),
    aerobic: readAll_('Aerobic'),
    sleep: readAll_('Sleep'),
    mood: readAll_('Mood'),
    foodPresets: readAll_('FoodPresets'),
    foodIntakes: readAll_('FoodIntakes'),
    lactate: readAll_('Lactate'),
    plans: readAll_('Plans'),
    categories: readAll_('Categories'),
    settings: settings,
  };
}

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

// =============================================================================
// OpenAI – næring (nøkkel kun i Settings: openAiApiKey)
// =============================================================================

function getOpenAiApiKey_() {
  var key = getSettingValue_('openAiApiKey');
  if (!key || !String(key).trim()) {
    throw new Error('Smart oppslag i Inntak er ikke satt opp i regnearket.');
  }
  return String(key).trim();
}

function callOpenAiJson_(systemPrompt, userPrompt, options) {
  options = options || {};
  var apiKey = getOpenAiApiKey_();
  var body = {
    model: options.model || 'gpt-4o-mini',
    temperature: options.temperature != null ? options.temperature : 0.2,
    max_tokens: options.maxTokens != null ? options.maxTokens : 1200,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  };
  var res = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Smart oppslag feilet (' + code + ').');
  }
  var parsed = JSON.parse(text);
  var content = parsed.choices && parsed.choices[0] && parsed.choices[0].message
    ? parsed.choices[0].message.content
    : '';
  if (!content) throw new Error('Tomt svar fra smart oppslag.');
  return JSON.parse(content);
}

var NUTRITION_STRUCTURE_SYSTEM_ = ''
  + 'Du strukturerer norske måltidsbeskrivelser til oppslag i Matvaretabellen. '
  + 'Svar KUN med JSON. Ikke oppgi protein, karbohydrater, fett eller kcal. '
  + 'Enheter: glass, dl, g, stk. '
  + 'Format: {"lines":[{"raw":"…","query":"søkeord","amount":2,"unit":"glass"} '
  + 'eller {"raw":"…","parts":[{"query":"…","amount":3,"unit":"stk"},…]}]}. '
  + 'query = kort norsk matvarenavn for søk i Matvaretabellen — bruk korrekt bokmåls stavemåte '
  + '(f.eks. peanuttsmør, ikke peanutsmør; yoghurt, ikke joghurt). '
  + 'Ved pålegg uten mengde: amount i gram, "assumed":true, "assumptionNote":"…". '
  + 'Del sammensatte måltider i parts (brød + pålegg).';

function nutritionStructure_(text) {
  if (!text || !String(text).trim()) throw new Error('Tom måltidstekst');
  var user = String(text).trim();
  if (user.length > 2000) throw new Error('Teksten er for lang (maks 2000 tegn)');
  var json = callOpenAiJson_(NUTRITION_STRUCTURE_SYSTEM_, user);
  if (!json.lines || !json.lines.length) throw new Error('Kunne ikke dele opp beskrivelsen.');
  return { lines: json.lines };
}

var NUTRITION_PICK_SYSTEM_ = ''
  + 'Velg best foodId fra kandidatliste for Matvaretabellen (Norge). '
  + 'Svar JSON: {"foodId":"…","reason":"kort"} eller {"foodId":null,"reason":"…"} '
  + 'hvis ingen passer.';

function nutritionPickFood_(payload) {
  var raw = payload.raw || '';
  var query = payload.query || '';
  var candidates = payload.candidates || [];
  if (!candidates.length) return { foodId: null, reason: 'Ingen kandidater' };
  if (candidates.length === 1) {
    return { foodId: String(candidates[0].id), reason: 'Eneste treff' };
  }
  var list = candidates.slice(0, 8).map(function (c, i) {
    return (i + 1) + '. id=' + c.id + ' — ' + c.name;
  }).join('\n');
  var user = 'Måltidslinje: ' + raw + '\nSøk: ' + query + '\n\nKandidater:\n' + list;
  var json = callOpenAiJson_(NUTRITION_PICK_SYSTEM_, user);
  return {
    foodId: json.foodId != null ? String(json.foodId) : null,
    reason: json.reason || '',
  };
}

var NUTRITION_SUGGEST_SYSTEM_ = ''
  + 'Linjer uten treff i Matvaretabellen (Norge). For hver linje: '
  + 'searchQuery = kort søkeord med korrekt norsk stavemåte (rett skrivefeil i query). '
  + 'hint = én kort setning til brukeren. '
  + 'estimate = null hvis varen sannsynligvis finnes i Matvaretabellen etter searchQuery. '
  + 'Ellers estimate = { proteinG, carbsG, fatG, kcal } for oppgitt amount og unit '
  + '(typisk produkt/merke når nevnt; ellers et rimelig generisk norske marked-estimat). '
  + 'Bruk estimate for proteinpulver, kosttilskudd og spesifikke merkevarer som ikke er i tabellen. '
  + 'Svar JSON: {"items":[{"id":"…","searchQuery":"…","hint":"…","estimate":null eller {...}}]}. '
  + 'Behold id fra input uendret.';

function parseMacroEstimate_(est) {
  if (!est || typeof est !== 'object') return null;
  var proteinG = Number(est.proteinG);
  var carbsG = Number(est.carbsG);
  var fatG = est.fatG != null && est.fatG !== '' ? Number(est.fatG) : null;
  var kcal = est.kcal != null && est.kcal !== '' ? Number(est.kcal) : null;
  var has = (Number.isFinite(proteinG) && proteinG > 0)
    || (Number.isFinite(carbsG) && carbsG > 0)
    || (fatG != null && Number.isFinite(fatG) && fatG > 0)
    || (kcal != null && Number.isFinite(kcal) && kcal > 0);
  if (!has) return null;
  return {
    proteinG: Number.isFinite(proteinG) ? proteinG : 0,
    carbsG: Number.isFinite(carbsG) ? carbsG : 0,
    fatG: fatG != null && Number.isFinite(fatG) ? fatG : null,
    kcal: kcal != null && Number.isFinite(kcal) ? kcal : null,
  };
}

function nutritionSuggestSearch_(payload) {
  var lines = payload.lines || [];
  if (!lines.length) return { items: [] };
  var user = lines.map(function (l) {
    return 'id=' + l.id + ' | raw: ' + (l.raw || '') + ' | query: ' + (l.query || '')
      + ' | amount: ' + (l.amount != null ? l.amount : '')
      + ' | unit: ' + (l.unit || '');
  }).join('\n');
  var json = callOpenAiJson_(NUTRITION_SUGGEST_SYSTEM_, user);
  var items = json.items || [];
  return {
    items: items.map(function (it) {
      return {
        id: String(it.id != null ? it.id : ''),
        searchQuery: it.searchQuery != null ? String(it.searchQuery).trim() : '',
        hint: it.hint != null ? String(it.hint).trim() : '',
        estimate: parseMacroEstimate_(it.estimate),
      };
    }),
  };
}

var NUTRITION_BRAND_SYSTEM_ = ''
  + 'Åpent søk: estimer næring for hele retter/porsjoner uten Matvaretabellen-oppslag. '
  + 'Typisk: «en tallerken lapskaus», «fårikål middag», fastfood-meny, kaférett. '
  + 'Ikke ingrediensliste — anta normal porsjon (tallerken/skål) og nevn antakelse i hint. '
  + 'Bruk realistiske tall (menyer Norge der relevant). Svar KUN JSON. '
  + 'Format: {"items":[{"label":"kort navn","proteinG":0,"carbsG":0,"fatG":0,"kcal":0,'
  + '"hint":"porsjon/antakelse/kilde"}]}. '
  + 'Én rett kan være én item; fastfood-combo deles i burger + pommes + drikk (riktig størrelse). '
  + 'Alle items må ha kcal.';

function nutritionBrandEstimate_(text) {
  if (!text || !String(text).trim()) throw new Error('Tom beskrivelse');
  var user = String(text).trim();
  if (user.length > 500) throw new Error('Teksten er for lang (maks 500 tegn)');
  var json = callOpenAiJson_(NUTRITION_BRAND_SYSTEM_, user, { maxTokens: 1800, temperature: 0.25 });
  var items = json.items || [];
  if (!items.length) throw new Error('Kunne ikke estimere næring.');
  var mapped = items.map(function (it) {
    var est = parseMacroEstimate_(it.estimate || it);
    return {
      label: it.label != null ? String(it.label).trim() : '',
      hint: it.hint != null ? String(it.hint).trim() : '',
      estimate: est,
    };
  }).filter(function (it) { return it.label && it.estimate; });
  if (!mapped.length) throw new Error('Kunne ikke estimere næring.');
  return { items: mapped };
}

// =============================================================================
// Statistics
// =============================================================================

function updateStatistics_() {
  var sets = readAll_('Sets').filter(function (s) { return s.deleted !== true; });
  var workouts = readAll_('Workouts').filter(function (w) { return w.deleted !== true; });

  var totalVolume = 0;
  sets.forEach(function (s) {
    totalVolume += (Number(s.weight) || 0) * (Number(s.reps) || 0);
  });

  var lastDate = '';
  workouts.forEach(function (w) {
    if (w.date && w.date > lastDate) lastDate = w.date;
  });

  var totalMinutes = 0;
  workouts.forEach(function (w) { totalMinutes += Number(w.duration) || 0; });

  var rows = [
    ['Antall økter', workouts.length],
    ['Antall sett', sets.length],
    ['Totalt volum (kg)', Math.round(totalVolume)],
    ['Total tid (min)', totalMinutes],
    ['Siste økt', lastDate],
    ['Sist oppdatert', new Date().toISOString()],
  ];

  var sheet = getSheet_('Statistics');
  sheet.getRange(2, 1, Math.max(sheet.getLastRow(), rows.length + 1), 2).clearContent();
  sheet.getRange(2, 1, rows.length, 2).setValues(rows);
}

// =============================================================================
// Setup – kjør denne én gang
// =============================================================================

function kjorOppsett() {
  Object.keys(COLUMNS).forEach(function (name) { getSheet_(name); });

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

  var apiKey = getSettingValue_('apiKey');
  if (!apiKey) {
    apiKey = genererNokkel_();
    upsert_('Settings', { key: 'apiKey', value: apiKey });
  }

  if (!hasSettingKey_('openAiApiKey')) {
    upsert_('Settings', { key: 'openAiApiKey', value: '' });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ['Sheet1', 'Ark1', 'Ark 1'].forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (sheet && sheet.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sheet);
    }
  });

  var message = 'Oppsett fullført!\n\nAPI-nøkkelen din (lim inn i appen):\n\n' + apiKey
    + '\n\nDu finner den også i Settings-arket.'
    + '\n\nFor assistert oppslag og åpent søk i Inntak: fyll inn nøkkel i value på raden for smart oppslag (Settings-arket).'
    + '\n\nØvelser velges i appen under Øvelser (startpakke eller fra katalogen).';
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (e) {
    Logger.log(message);
  }
}

/**
 * Kjør én gang fra Apps Script-editoren (Kjør-knappen) etter at openAiApiKey er satt.
 * Utløser Google-dialog for «Koble til ekstern tjeneste» (UrlFetchApp / OpenAI).
 * Webapp må kjøre som «Meg» – da gjelder samme godkjenning når appen kaller Spør AI.
 */
function testOpenAiTilkobling() {
  var result = nutritionStructure_('1 glass vann');
  var n = result.lines ? result.lines.length : 0;
  var message = 'Smart oppslag OK.\n\nTest returnerte ' + n + ' matvarelinje(r).';
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (e) {
    Logger.log(message);
  }
}

function genererNokkel_() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  var key = '';
  for (var i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}
