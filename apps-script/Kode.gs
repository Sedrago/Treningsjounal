/**
 * Treningsjournal – komplett backend i én fil.
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
  category: 'Categories',
  setting: 'Settings',
};

var COLUMNS = {
  Exercises: ['id', 'name', 'category', 'notes', 'video', 'active',
    'goalSets', 'goalRepsMin', 'goalRepsMax', 'deleted', 'updatedAt', 'catalogId'],
  Workouts: ['id', 'date', 'startedAt', 'duration', 'bodyweight', 'notes', 'deleted', 'updatedAt'],
  Sets: ['id', 'workoutId', 'exerciseId', 'setNumber', 'weight', 'reps', 'rir',
    'rest', 'comment', 'deleted', 'updatedAt'],
  Bodyweight: ['id', 'date', 'weight', 'fatPct', 'comment', 'deleted', 'updatedAt'],
  Aerobic: ['id', 'date', 'minutes', 'activity', 'comment', 'deleted', 'updatedAt'],
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
  }
  return sheet;
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
  var values = sheet.getRange(2, 1, lastRow - 1, columns.length).getValues();
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
    var keys = sheet.getRange(2, keyIndex + 1, lastRow - 1, 1).getValues();
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
  sheet.getRange(rowNumber, 1, 1, columns.length).setValues([objectToRow_(sheetName, obj)]);
  return 'updated';
}

function getSettingValue_(key) {
  var rows = readAll_('Settings');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].key === key) return rows[i].value;
  }
  return null;
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
    .createTextOutput('Treningsjournal-API kjører. Bruk appen for å koble til.')
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
    default:
      throw new Error('Ukjent handling: ' + action);
  }
}

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
    aerobic: readAll_('Aerobic'),
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

  seedStandardOvelser_();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ['Sheet1', 'Ark1', 'Ark 1'].forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (sheet && sheet.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sheet);
    }
  });

  var message = 'Oppsett fullført!\n\nAPI-nøkkelen din (lim inn i appen):\n\n' + apiKey
    + '\n\nDu finner den også i Settings-arket.'
    + '\n\n27 standardøvelser er lagt inn hvis Exercises-arket var tomt.';
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (e) {
    Logger.log(message);
  }
}

/** Kjør manuelt hvis Exercises-arket er tomt etter oppsett (legger inn 27 standardøvelser). */
function kjorSeedOvelser() {
  var sheet = getSheet_('Exercises');
  var countBefore = Math.max(0, sheet.getLastRow() - 1);
  seedStandardOvelser_();
  var countAfter = Math.max(0, sheet.getLastRow() - 1);
  var added = countAfter - countBefore;
  var message = added > 0
    ? 'La til ' + added + ' standardøvelser i Exercises-arket.'
    : 'Ingen endring – Exercises-arket har allerede data.';
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

/** Legger inn standardøvelser i Exercises-arket hvis det er tomt. */
function seedStandardOvelser_() {
  var sheet = getSheet_('Exercises');
  if (sheet.getLastRow() >= 2) return;
  var ovelser = [
    ['def-hp-benk', 'Benkpress', 'horisontal-push'],
    ['def-hp-man', 'Manualpress', 'horisontal-push'],
    ['def-hp-skra', 'Skrå benk', 'horisontal-push'],
    ['def-hp-push', 'Push-ups', 'horisontal-push'],
    ['def-hp-dips', 'Dips', 'horisontal-push'],
    ['def-hpl-row', 'Stangroing', 'horisontal-pull'],
    ['def-hpl-1arm', 'En-arms row', 'horisontal-pull'],
    ['def-hpl-face', 'Face pulls', 'horisontal-pull'],
    ['def-hpl-kabel', 'Kabel roing', 'horisontal-pull'],
    ['def-vp-mil', 'Militærpress', 'vertikal-push'],
    ['def-vp-man', 'Manualpress skuldre', 'vertikal-push'],
    ['def-vp-arnold', 'Arnold press', 'vertikal-push'],
    ['def-vpl-pull', 'Pull-ups', 'vertikal-pull'],
    ['def-vpl-chin', 'Chin-ups', 'vertikal-pull'],
    ['def-vpl-lat', 'Lat pulldown', 'vertikal-pull'],
    ['def-kb-kne', 'Knebøy', 'kneboy'],
    ['def-kb-front', 'Front squats', 'kneboy'],
    ['def-kb-bulgar', 'Bulgarsk split squat', 'kneboy'],
    ['def-kb-bein', 'Beinpress', 'kneboy'],
    ['def-hh-mark', 'Markløft', 'hoftehengsel'],
    ['def-hh-rdl', 'Rumensk markløft', 'hoftehengsel'],
    ['def-hh-hip', 'Hip thrust', 'hoftehengsel'],
    ['def-hh-good', 'Good morning', 'hoftehengsel'],
    ['def-core-plank', 'Plank', 'core'],
    ['def-core-dead', 'Dead bug', 'core'],
    ['def-core-pallof', 'Pallof press', 'core'],
    ['def-core-crunch', 'Crunches', 'core'],
  ];
  var now = new Date().toISOString();
  ovelser.forEach(function (o) {
    upsert_('Exercises', {
      id: o[0], name: o[1], category: o[2],
      notes: '', video: '', active: true,
      goalSets: 3, goalRepsMin: 8, goalRepsMax: 10,
      deleted: false, updatedAt: now, catalogId: o[0],
    });
  });
}
