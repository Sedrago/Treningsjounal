/**
 * FlowBooster Relay – programdeling (gruppe-QR / publisering).
 *
 * Eget Apps Script-prosjekt knyttet til et EGET regneark (ikke personlig treningsark).
 *
 * BRUK:
 *   1. Opprett nytt regneark (f.eks. «FlowBooster Relay»).
 *   2. Lim inn HELE denne filen i Kode.gs.
 *   3. Kjør kjorRelayOppsett én gang.
 *   4. Deploy som Web App (Alle, Kjør som: Meg).
 *   5. Lim Relay-URL og publiseringsnøkkel inn i appen under Innstillinger.
 */

var RELAY_SHEETS = {
  published: 'Published',
  users: 'Users',
  pairings: 'Pairings',
  inbox: 'Inbox',
  momentum: 'Momentum',
};

var RELAY_COLUMNS = {
  Published: ['code', 'title', 'programJson', 'publishedAt', 'expiresAt', 'pinHash', 'rev', 'active', 'fetchCount'],
  Users: ['username', 'secretHash', 'createdAt'],
  Pairings: ['id', 'userA', 'userB', 'status', 'invitedBy', 'createdAt', 'acceptedAt'],
  Inbox: ['id', 'fromUser', 'toUser', 'title', 'programJson', 'sentAt', 'readAt', 'expiresAt'],
  Momentum: ['username', 'seriesJson', 'updatedAt'],
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
    .createTextOutput('FlowBooster Relay kjører. Bruk appen for å hente eller publisere programmer.')
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
    case 'register':
      return registerUser_(payload.username);
    case 'invitePartner':
      verifyUserAuth_(payload);
      return invitePartner_(payload.username, payload.toUsername);
    case 'acceptPartner':
      verifyUserAuth_(payload);
      return acceptPartner_(payload.username, payload.fromUsername);
    case 'rejectPartner':
      verifyUserAuth_(payload);
      return rejectPartner_(payload.username, payload.fromUsername);
    case 'listPartners':
      verifyUserAuth_(payload);
      return listPartners_(payload.username);
    case 'listPendingInvites':
      verifyUserAuth_(payload);
      return listPendingInvites_(payload.username);
    case 'sendProgram':
      verifyUserAuth_(payload);
      return sendProgram_(payload);
    case 'listInbox':
      verifyUserAuth_(payload);
      return listInbox_(payload.username);
    case 'fetchInbox':
      verifyUserAuth_(payload);
      return fetchInboxItem_(payload.username, payload.id, payload.markRead !== false);
    case 'dismissInbox':
      verifyUserAuth_(payload);
      return dismissInboxItem_(payload.username, payload.id);
    case 'pushMomentum':
      verifyUserAuth_(payload);
      return pushMomentum_(payload.username, payload.series);
    case 'fetchPartnersMomentum':
      verifyUserAuth_(payload);
      return fetchPartnersMomentum_(payload.username);
    default:
      throw new Error('Ukjent handling: ' + action);
  }
}

// =============================================================================
// Database
// =============================================================================

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

/** A1-område – unngår at getRange(row,col,row,cols) tolkes som antall rader. */
function rangeA1_(startRow, startCol, endRow, endCol) {
  return colLetter_(startCol) + startRow + ':' + colLetter_(endCol) + endRow;
}

function getRelaySheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var headers = RELAY_COLUMNS[name];
  if (!headers) throw new Error('Ukjent relay-ark: ' + name);
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(rangeA1_(1, 1, 1, headers.length)).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  if (String(sheet.getRange(1, 1).getValue() || '') !== headers[0]) {
    sheet.getRange(rangeA1_(1, 1, 1, headers.length)).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readPublishedRows_() {
  var sheet = getRelaySheet_(RELAY_SHEETS.published);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var headers = RELAY_COLUMNS.Published;
  var values = sheet.getRange(rangeA1_(2, 1, lastRow, headers.length)).getValues();
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
    sheet.getRange(rangeA1_(found.rowIndex, 1, found.rowIndex, headers.length)).setValues([values]);
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
// Users, parring og innboks
// =============================================================================

function readSheetRows_(sheetKey, columnsKey) {
  var sheet = getRelaySheet_(RELAY_SHEETS[sheetKey]);
  var headers = RELAY_COLUMNS[columnsKey];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(rangeA1_(2, 1, lastRow, headers.length)).getValues();
  return values.map(function (row) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function appendSheetRow_(sheetKey, columnsKey, entry) {
  var sheet = getRelaySheet_(RELAY_SHEETS[sheetKey]);
  var headers = RELAY_COLUMNS[columnsKey];
  var values = headers.map(function (h) { return entry[h] != null ? entry[h] : ''; });
  sheet.appendRow(values);
  return sheet.getLastRow();
}

function updateSheetRow_(sheetKey, columnsKey, rowIndex, entry) {
  var sheet = getRelaySheet_(RELAY_SHEETS[sheetKey]);
  var headers = RELAY_COLUMNS[columnsKey];
  var values = headers.map(function (h) { return entry[h] != null ? entry[h] : ''; });
  sheet.getRange(rangeA1_(rowIndex, 1, rowIndex, headers.length)).setValues([values]);
}

function normalizeUsername_(username) {
  var u = String(username || '').trim().toLowerCase().replace(/^@/, '');
  u = u.replace(/[^a-z0-9_]/g, '');
  if (u.length < 3 || u.length > 20) throw new Error('Brukernavn må være 3–20 tegn (a-z, 0-9, _)');
  return u;
}

function findUserRow_(username) {
  var u = normalizeUsername_(username);
  var rows = readSheetRows_('users', 'Users');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].username) === u) {
      return { row: rows[i], rowIndex: i + 2 };
    }
  }
  return null;
}

function verifyUserAuth_(payload) {
  var username = normalizeUsername_(payload.username);
  var secret = String(payload.deviceSecret || '');
  if (!secret) throw new Error('Mangler enhetsnøkkel');
  var found = findUserRow_(username);
  if (!found) throw new Error('Ugyldig bruker');
  if (hashPin_(secret) !== String(found.row.secretHash)) {
    throw new Error('Ugyldig enhetsnøkkel');
  }
  payload.username = username;
}

function registerUser_(username) {
  var u = normalizeUsername_(username);
  if (findUserRow_(u)) throw new Error('Brukernavnet er opptatt');
  var deviceSecret = genererRelayNokkel_();
  appendSheetRow_('users', 'Users', {
    username: u,
    secretHash: hashPin_(deviceSecret),
    createdAt: new Date().toISOString(),
  });
  return { username: u, deviceSecret: deviceSecret };
}

function findPairingBetween_(userA, userB) {
  var a = normalizeUsername_(userA);
  var b = normalizeUsername_(userB);
  var rows = readSheetRows_('pairings', 'Pairings');
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var ra = String(row.userA);
    var rb = String(row.userB);
    if ((ra === a && rb === b) || (ra === b && rb === a)) {
      return { row: row, rowIndex: i + 2 };
    }
  }
  return null;
}

function invitePartner_(fromUser, toUsername) {
  var from = normalizeUsername_(fromUser);
  var to = normalizeUsername_(toUsername);
  if (from === to) throw new Error('Du kan ikke invitere deg selv');
  if (!findUserRow_(to)) throw new Error('Brukeren finnes ikke');
  var existing = findPairingBetween_(from, to);
  if (existing) {
    if (existing.row.status === 'accepted') throw new Error('Dere er allerede partnere');
    if (existing.row.status === 'pending') throw new Error('Invitasjon venter allerede');
  }
  appendSheetRow_('pairings', 'Pairings', {
    id: generateRelayId_(),
    userA: from,
    userB: to,
    status: 'pending',
    invitedBy: from,
    createdAt: new Date().toISOString(),
    acceptedAt: '',
  });
  return { from: from, to: to, status: 'pending' };
}

function acceptPartner_(user, fromUsername) {
  var u = normalizeUsername_(user);
  var from = normalizeUsername_(fromUsername);
  var found = findPairingBetween_(from, u);
  if (!found || found.row.status !== 'pending') throw new Error('Fant ingen ventende invitasjon');
  if (String(found.row.userB) !== u || String(found.row.invitedBy) !== from) {
    throw new Error('Fant ingen ventende invitasjon');
  }
  var updated = {};
  RELAY_COLUMNS.Pairings.forEach(function (h) { updated[h] = found.row[h]; });
  updated.status = 'accepted';
  updated.acceptedAt = new Date().toISOString();
  updateSheetRow_('pairings', 'Pairings', found.rowIndex, updated);
  return { partner: from, status: 'accepted' };
}

function rejectPartner_(user, fromUsername) {
  var u = normalizeUsername_(user);
  var from = normalizeUsername_(fromUsername);
  var found = findPairingBetween_(from, u);
  if (!found || found.row.status !== 'pending') throw new Error('Fant ingen ventende invitasjon');
  var updated = {};
  RELAY_COLUMNS.Pairings.forEach(function (h) { updated[h] = found.row[h]; });
  updated.status = 'rejected';
  updateSheetRow_('pairings', 'Pairings', found.rowIndex, updated);
  return { from: from, status: 'rejected' };
}

function listPartners_(username) {
  var u = normalizeUsername_(username);
  var rows = readSheetRows_('pairings', 'Pairings');
  var partners = [];
  rows.forEach(function (row) {
    if (row.status !== 'accepted') return;
    if (String(row.userA) === u) partners.push(String(row.userB));
    else if (String(row.userB) === u) partners.push(String(row.userA));
  });
  partners.sort();
  return { partners: partners };
}

function listPendingInvites_(username) {
  var u = normalizeUsername_(username);
  var rows = readSheetRows_('pairings', 'Pairings');
  var incoming = [];
  rows.forEach(function (row) {
    if (row.status !== 'pending') return;
    if (String(row.userB) === u) {
      incoming.push({
        from: String(row.userA),
        createdAt: isoOrNull_(row.createdAt),
      });
    }
  });
  return { incoming: incoming };
}

function assertPartners_(userA, userB) {
  var found = findPairingBetween_(userA, userB);
  if (!found || found.row.status !== 'accepted') {
    throw new Error('Dere er ikke godkjente partnere');
  }
}

function sanitizeMomentumSeries_(series) {
  if (!Array.isArray(series)) throw new Error('series må være en liste');
  var out = [];
  var list = series.length > 100 ? series.slice(series.length - 100) : series;
  list.forEach(function (p) {
    var d = String(p.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    var v = Number(p.value);
    if (!isFinite(v)) v = 0;
    v = Math.max(0, Math.min(100, Math.round(v)));
    out.push({ date: d, value: v });
  });
  if (!out.length) throw new Error('Momentum-serien er tom');
  return out;
}

function findMomentumRow_(username) {
  var u = normalizeUsername_(username);
  var rows = readSheetRows_('momentum', 'Momentum');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].username) === u) {
      return { row: rows[i], rowIndex: i + 2 };
    }
  }
  return null;
}

function pushMomentum_(username, series) {
  var u = normalizeUsername_(username);
  var clean = sanitizeMomentumSeries_(series);
  var now = new Date().toISOString();
  var json = JSON.stringify(clean);
  if (json.length > 50000) throw new Error('Momentum-serien er for stor');
  var entry = {
    username: u,
    seriesJson: json,
    updatedAt: now,
  };
  var found = findMomentumRow_(u);
  if (found) {
    updateSheetRow_('momentum', 'Momentum', found.rowIndex, entry);
  } else {
    appendSheetRow_('momentum', 'Momentum', entry);
  }
  return { updatedAt: now, points: clean.length };
}

function fetchPartnersMomentum_(username) {
  var u = normalizeUsername_(username);
  var partnerList = listPartners_(u).partners || [];
  var rows = readSheetRows_('momentum', 'Momentum');
  var byUser = {};
  rows.forEach(function (row) {
    byUser[String(row.username)] = row;
  });
  var partners = [];
  partnerList.forEach(function (p) {
    var row = byUser[p];
    if (!row || !row.seriesJson) return;
    var series;
    try {
      series = JSON.parse(String(row.seriesJson));
    } catch (e) {
      return;
    }
    if (!Array.isArray(series)) return;
    partners.push({
      username: p,
      updatedAt: isoOrNull_(row.updatedAt) || '',
      series: series,
    });
  });
  return { partners: partners };
}

function sendProgram_(payload) {
  var from = normalizeUsername_(payload.username);
  var to = normalizeUsername_(payload.toUsername);
  assertPartners_(from, to);
  var program = payload.program;
  validateProgram_(program);
  var programJson = JSON.stringify(program);
  if (programJson.length > MAX_PROGRAM_JSON) {
    throw new Error('Programmet er for stort');
  }
  var now = new Date();
  var expiresInDays = Number(payload.expiresInDays);
  if (!expiresInDays || expiresInDays < 1) expiresInDays = 30;
  if (expiresInDays > 90) expiresInDays = 90;
  var expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);
  var title = String(payload.title || program.name || 'Program').trim() || 'Program';
  var id = generateRelayId_();
  appendSheetRow_('inbox', 'Inbox', {
    id: id,
    fromUser: from,
    toUser: to,
    title: title,
    programJson: programJson,
    sentAt: now.toISOString(),
    readAt: '',
    expiresAt: expiresAt.toISOString(),
  });
  return { id: id, to: to, title: title, sentAt: now.toISOString() };
}

function listInbox_(username) {
  var u = normalizeUsername_(username);
  var rows = readSheetRows_('inbox', 'Inbox');
  var items = [];
  var now = Date.now();
  rows.forEach(function (row) {
    if (String(row.toUser) !== u) return;
    if (row.readAt) return;
    if (row.expiresAt) {
      var exp = new Date(row.expiresAt).getTime();
      if (!isNaN(exp) && exp < now) return;
    }
    var program;
    try {
      program = parseStoredProgram_(row.programJson);
    } catch (e) {
      return;
    }
    items.push({
      id: String(row.id),
      from: String(row.fromUser),
      title: String(row.title || program.name || 'Program'),
      exerciseCount: (program.exercises || []).length,
      sentAt: isoOrNull_(row.sentAt),
      expiresAt: isoOrNull_(row.expiresAt),
    });
  });
  items.sort(function (a, b) {
    return String(b.sentAt).localeCompare(String(a.sentAt));
  });
  return { items: items };
}

function findInboxRow_(username, id) {
  var u = normalizeUsername_(username);
  var rows = readSheetRows_('inbox', 'Inbox');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(id) && String(rows[i].toUser) === u) {
      return { row: rows[i], rowIndex: i + 2 };
    }
  }
  return null;
}

function fetchInboxItem_(username, id, markRead) {
  var found = findInboxRow_(username, id);
  if (!found) throw new Error('Fant ikke programmet i innboksen');
  var row = found.row;
  if (row.expiresAt) {
    var exp = new Date(row.expiresAt);
    if (!isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
      throw new Error('Programmet er utløpt');
    }
  }
  var program = parseStoredProgram_(row.programJson);
  if (markRead && !row.readAt) {
    var updated = {};
    RELAY_COLUMNS.Inbox.forEach(function (h) { updated[h] = row[h]; });
    updated.readAt = new Date().toISOString();
    updateSheetRow_('inbox', 'Inbox', found.rowIndex, updated);
  }
  return {
    id: String(row.id),
    from: String(row.fromUser),
    title: String(row.title || program.name || 'Program'),
    sentAt: isoOrNull_(row.sentAt),
    program: program,
  };
}

function dismissInboxItem_(username, id) {
  var found = findInboxRow_(username, id);
  if (!found) throw new Error('Fant ikke programmet i innboksen');
  if (!found.row.readAt) {
    var updated = {};
    RELAY_COLUMNS.Inbox.forEach(function (h) { updated[h] = found.row[h]; });
    updated.readAt = new Date().toISOString();
    updateSheetRow_('inbox', 'Inbox', found.rowIndex, updated);
  }
  return { id: String(id), dismissed: true };
}

function generateRelayId_() {
  var id = '';
  for (var i = 0; i < 8; i++) {
    id += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return id;
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
  getRelaySheet_(RELAY_SHEETS.users);
  getRelaySheet_(RELAY_SHEETS.pairings);
  getRelaySheet_(RELAY_SHEETS.inbox);
  getRelaySheet_(RELAY_SHEETS.momentum);

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
