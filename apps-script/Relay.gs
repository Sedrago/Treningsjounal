/**
 * Treningsjournal Relay – programdeling (gruppe-QR / publisering).
 *
 * Eget Apps Script-prosjekt knyttet til et EGET regneark (ikke personlig treningsark).
 *
 * BRUK:
 *   1. Opprett nytt regneark (f.eks. «Treningsjournal Relay»).
 *   2. Lim inn HELE denne filen i Kode.gs.
 *   3. Kjør kjorRelayOppsett én gang.
 *   4. Deploy som Web App (Alle, Kjør som: Meg).
 *   5. Lim Relay-URL og publiseringsnøkkel inn i appen under Innstillinger.
 */

var RELAY_SHEETS = {
  published: 'Published',
};

var RELAY_COLUMNS = {
  Published: ['code', 'title', 'programJson', 'publishedAt', 'expiresAt', 'pinHash', 'rev', 'active', 'fetchCount'],
};

var PROGRAM_FORMAT = 'treningsjournal-program';
var MAX_PROGRAM_JSON = 120000;
var CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

// =============================================================================
// HTTP
// =============================================================================

function doGet(e) {
  if (!e || !e.parameter) {
    return relayStatusPage_();
  }
  if (e.parameter.data) {
    var request = JSON.parse(e.parameter.data);
    return handleRelayRequest_(request.action, request.key || '', JSON.stringify(request.payload || {}));
  }
  if (e.parameter.action) {
    return handleRelayRequest_(e.parameter.action, e.parameter.key || '', e.parameter.payload || '{}');
  }
  return relayStatusPage_();
}

function doPost(e) {
  var request = parseRelayRequest_(e);
  return handleRelayRequest_(request.action, request.key || '', JSON.stringify(request.payload || {}));
}

function relayStatusPage_() {
  return ContentService
    .createTextOutput('Treningsjournal Relay kjører. Bruk appen for å hente eller publisere programmer.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function parseRelayRequest_(e) {
  if (e.parameter && e.parameter.data) {
    return JSON.parse(e.parameter.data);
  }
  if (!e.postData || !e.postData.contents) {
    throw new Error('Tom forespørsel');
  }
  var contents = e.postData.contents;
  if (contents.charAt(0) === '{') {
    return JSON.parse(contents);
  }
  if (contents.indexOf('data=') === 0) {
    return JSON.parse(decodeURIComponent(contents.substring(5)));
  }
  throw new Error('Ukjent request-format');
}

function handleRelayRequest_(action, key, payloadStr) {
  var response;
  try {
    var payload = payloadStr ? JSON.parse(payloadStr) : {};
    var data = routeRelay_(action, key, payload);
    response = { ok: true, data: data };
  } catch (error) {
    response = { ok: false, error: String(error.message || error) };
  }
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function routeRelay_(action, key, payload) {
  switch (action) {
    case 'ping':
      return { pong: true, time: new Date().toISOString() };
    case 'meta':
      return metaPublished_(payload.code);
    case 'fetch':
      return fetchPublished_(payload.code, payload.pin);
    case 'publish':
      checkRelayPublishKey_(key);
      return publishProgram_(payload, false);
    case 'update':
      checkRelayPublishKey_(key);
      return publishProgram_(payload, true);
    case 'unpublish':
      checkRelayPublishKey_(key);
      return unpublishProgram_(payload.code);
    default:
      throw new Error('Ukjent handling: ' + action);
  }
}

// =============================================================================
// Database
// =============================================================================

function getRelaySheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, RELAY_COLUMNS[name].length).setValues([RELAY_COLUMNS[name]]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readPublishedRows_() {
  var sheet = getRelaySheet_(RELAY_SHEETS.published);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var headers = RELAY_COLUMNS.Published;
  var values = sheet.getRange(2, 1, lastRow, headers.length).getValues();
  return values.map(function (row) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function findPublishedByCode_(code) {
  var normalized = normalizeCode_(code);
  if (!normalized) return null;
  var rows = readPublishedRows_();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].code || '').toUpperCase() === normalized) {
      return { row: rows[i], rowIndex: i + 2 };
    }
  }
  return null;
}

function upsertPublished_(entry) {
  var sheet = getRelaySheet_(RELAY_SHEETS.published);
  var headers = RELAY_COLUMNS.Published;
  var found = findPublishedByCode_(entry.code);
  var values = headers.map(function (h) { return entry[h] != null ? entry[h] : ''; });
  if (found) {
    sheet.getRange(found.rowIndex, 1, found.rowIndex, headers.length).setValues([values]);
    return found.rowIndex;
  }
  sheet.appendRow(values);
  return sheet.getLastRow();
}

// =============================================================================
// Published programs
// =============================================================================

function metaPublished_(code) {
  var found = findPublishedByCode_(code);
  if (!found) throw new Error('Fant ikke programmet');
  var row = found.row;
  assertPublishedActive_(row);
  var program = parseStoredProgram_(row.programJson);
  return {
    code: normalizeCode_(row.code),
    title: String(row.title || program.name || 'Program'),
    exerciseCount: (program.exercises || []).length,
    publishedAt: isoOrNull_(row.publishedAt),
    expiresAt: isoOrNull_(row.expiresAt),
    rev: Number(row.rev) || 1,
    requiresPin: Boolean(row.pinHash),
  };
}

function fetchPublished_(code, pin) {
  var found = findPublishedByCode_(code);
  if (!found) throw new Error('Fant ikke programmet');
  var row = found.row;
  assertPublishedActive_(row);
  verifyPin_(row.pinHash, pin);
  var program = parseStoredProgram_(row.programJson);
  incrementFetchCount_(found.rowIndex, row.fetchCount);
  return {
    code: normalizeCode_(row.code),
    title: String(row.title || program.name || 'Program'),
    rev: Number(row.rev) || 1,
    program: program,
  };
}

function publishProgram_(payload, allowReplace) {
  var program = payload.program;
  validateProgram_(program);

  var code = payload.code ? normalizeCode_(payload.code) : generateCode_();
  if (!code) throw new Error('Ugyldig kode');
  if (code.length < 4 || code.length > 12) throw new Error('Koden må være 4–12 tegn');

  var existing = findPublishedByCode_(code);
  if (existing && !allowReplace && !payload.replaceIfExists) {
    throw new Error('Koden er allerede i bruk');
  }

  var programJson = JSON.stringify(program);
  if (programJson.length > MAX_PROGRAM_JSON) {
    throw new Error('Programmet er for stort til å publiseres');
  }

  var now = new Date();
  var expiresInDays = Number(payload.expiresInDays);
  if (!expiresInDays || expiresInDays < 1) expiresInDays = 30;
  if (expiresInDays > 365) expiresInDays = 365;
  var expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);

  var rev = 1;
  if (existing) {
    rev = (Number(existing.row.rev) || 0) + 1;
  }

  var title = String(payload.title || program.name || 'Program').trim() || 'Program';
  var pinHash = payload.pin ? hashPin_(String(payload.pin)) : '';

  upsertPublished_({
    code: code,
    title: title,
    programJson: programJson,
    publishedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    pinHash: pinHash,
    rev: rev,
    active: true,
    fetchCount: existing ? (Number(existing.row.fetchCount) || 0) : 0,
  });

  return {
    code: code,
    title: title,
    publishedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    rev: rev,
  };
}

function unpublishProgram_(code) {
  var found = findPublishedByCode_(code);
  if (!found) throw new Error('Fant ikke programmet');
  var sheet = getRelaySheet_(RELAY_SHEETS.published);
  sheet.getRange(found.rowIndex, 8).setValue(false);
  return { code: normalizeCode_(found.row.code), active: false };
}

// =============================================================================
// Helpers
// =============================================================================

function validateProgram_(program) {
  if (!program || typeof program !== 'object') throw new Error('Mangler program');
  if (program.format !== PROGRAM_FORMAT) throw new Error('Ugyldig programformat');
  if (!Array.isArray(program.exercises)) throw new Error('Mangler øvelsesliste');
  if (!program.exercises.length) throw new Error('Programmet har ingen øvelser');
  if (program.exercises.length > 100) throw new Error('Programmet har for mange øvelser');
}

function parseStoredProgram_(programJson) {
  try {
    return JSON.parse(String(programJson || '{}'));
  } catch (e) {
    throw new Error('Lagret program er ødelagt');
  }
}

function assertPublishedActive_(row) {
  if (row.active === false || row.active === 'FALSE' || row.active === 'false') {
    throw new Error('Programmet er avpublisert');
  }
  if (row.expiresAt) {
    var exp = new Date(row.expiresAt);
    if (!isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
      throw new Error('Programmet er utløpt');
    }
  }
}

function verifyPin_(pinHash, pin) {
  if (!pinHash) return;
  if (!pin) throw new Error('PIN kreves');
  if (hashPin_(String(pin)) !== String(pinHash)) throw new Error('Feil PIN');
}

function hashPin_(pin) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pin);
  return digest.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function normalizeCode_(code) {
  return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function generateCode_() {
  var code = '';
  for (var i = 0; i < 6; i++) {
    code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  if (findPublishedByCode_(code)) return generateCode_();
  return code;
}

function incrementFetchCount_(rowIndex, current) {
  var sheet = getRelaySheet_(RELAY_SHEETS.published);
  sheet.getRange(rowIndex, 9).setValue((Number(current) || 0) + 1);
}

function isoOrNull_(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function checkRelayPublishKey_(key) {
  var expected = PropertiesService.getScriptProperties().getProperty('relayPublishKey');
  if (!expected) throw new Error('Relay er ikke satt opp: kjør kjorRelayOppsett()');
  if (!key || key !== expected) throw new Error('Ugyldig publiseringsnøkkel');
}

function genererRelayNokkel_() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  var key = '';
  for (var i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

// =============================================================================
// Setup
// =============================================================================

function kjorRelayOppsett() {
  getRelaySheet_(RELAY_SHEETS.published);

  var props = PropertiesService.getScriptProperties();
  var publishKey = props.getProperty('relayPublishKey');
  if (!publishKey) {
    publishKey = genererRelayNokkel_();
    props.setProperty('relayPublishKey', publishKey);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ['Sheet1', 'Ark1', 'Ark 1'].forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (sheet && sheet.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sheet);
    }
  });

  var message = 'Relay-oppsett fullført!\n\nPubliseringsnøkkel (kun for trenere):\n\n' + publishKey
    + '\n\nDeploy Web App som «Alle» og lim URL + nøkkel inn i appen.';
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (e) {
    Logger.log(message);
  }
}
