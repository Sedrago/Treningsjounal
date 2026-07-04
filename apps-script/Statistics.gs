/**
 * Statistics.gs – server-side sammendrag som skrives til Statistics-arket.
 * Gir en rask oversikt direkte i regnearket. All detaljert statistikk
 * beregnes i appen.
 */

/** Oppdaterer Statistics-arket. Kalles etter hver push. */
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
