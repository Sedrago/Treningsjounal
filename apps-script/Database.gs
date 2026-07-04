/**
 * Database.gs – generisk lesing/skriving mot arkene i regnearket.
 * Første rad i hvert ark er kolonneoverskrifter som tilsvarer feltnavnene.
 */

/** Arknavn per entitet (som brukt i API-et). */
var SHEETS = {
  exercise: 'Exercises',
  workout: 'Workouts',
  set: 'Sets',
  bodyweight: 'Bodyweight',
  category: 'Categories',
  setting: 'Settings',
};

/** Kolonner per ark. Rekkefølgen bestemmer arkets oppsett. */
var COLUMNS = {
  Exercises: ['id', 'name', 'category', 'notes', 'video', 'active',
    'goalSets', 'goalRepsMin', 'goalRepsMax', 'deleted', 'updatedAt'],
  Workouts: ['id', 'date', 'startedAt', 'duration', 'bodyweight', 'notes', 'deleted', 'updatedAt'],
  Sets: ['id', 'workoutId', 'exerciseId', 'setNumber', 'weight', 'reps', 'rir',
    'rest', 'comment', 'deleted', 'updatedAt'],
  Bodyweight: ['id', 'date', 'weight', 'fatPct', 'comment', 'deleted', 'updatedAt'],
  Categories: ['id', 'name', 'icon', 'priority'],
  Settings: ['key', 'value'],
  Statistics: ['key', 'value'],
};

/** Henter (eller oppretter) et ark med riktige overskrifter. */
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

/** Konverterer en celleverdi til API-vennlig format. */
function cellToValue_(value, column) {
  if (value === '' || value === null || value === undefined) return null;
  if (value instanceof Date) {
    // 'date'-kolonner er rene datoer; alt annet er tidsstempler.
    if (column === 'date') {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    return value.toISOString();
  }
  return value;
}

/** Leser alle rader i et ark som objekter. */
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

/** Konverterer et objekt til en radarray etter arkets kolonner. */
function objectToRow_(sheetName, obj) {
  return COLUMNS[sheetName].map(function (col) {
    var value = obj[col];
    if (value === null || value === undefined) return '';
    return value;
  });
}

/**
 * Upsert på id (eller 'key' for Settings). Last-write-wins:
 * en rad overskrives bare hvis innkommende updatedAt er nyere.
 */
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

  // Konfliktsjekk: behold raden hvis den er nyere enn innkommende.
  if (updatedIndex !== -1 && obj.updatedAt) {
    var existing = sheet.getRange(rowNumber, updatedIndex + 1).getValue();
    if (existing instanceof Date && existing.toISOString() > obj.updatedAt) {
      return 'skipped';
    }
  }
  sheet.getRange(rowNumber, 1, 1, columns.length).setValues([objectToRow_(sheetName, obj)]);
  return 'updated';
}

/** Leser en innstilling fra Settings-arket. */
function getSettingValue_(key) {
  var rows = readAll_('Settings');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].key === key) return rows[i].value;
  }
  return null;
}
