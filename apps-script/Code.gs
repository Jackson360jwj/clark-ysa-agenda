/**
 * Clark YSA Ward – Sacrament Meeting Conducting Sheet – Google Apps Script bridge
 *
 * This script lets the GitHub Pages form read the "Schedule" tab live and save
 * edits back to it, without making the spreadsheet public.
 *
 * ONE-TIME SETUP (about 3 minutes):
 *   1. Open the "Clark YSA Sacrament Agenda" Google Sheet.
 *   2. Extensions ▸ Apps Script. Delete any code in Code.gs and paste this file.
 *   3. Click Deploy ▸ New deployment ▸ gear icon ▸ Web app.
 *        Description: Conducting sheet bridge
 *        Execute as:  Me
 *        Who has access: Anyone      (the sheet itself stays private;
 *                                     only this script can read/write it)
 *   4. Click Deploy, authorize when asked, and copy the Web app URL
 *      (it ends in /exec).
 *   5. Open the conducting-sheet page, click ⚙ Settings, paste the URL, Save.
 *      (Or put it in config.js as appsScriptUrl and push to GitHub.)
 *
 * Any time you edit this script, use Deploy ▸ Manage deployments ▸ edit ▸
 * New version, so the same URL keeps working.
 */

var SHEET_NAME = 'Schedule';

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'list';
    if (action === 'ping') return json_({ ok: true, sheet: SHEET_NAME });
    return json_({ ok: true, rows: readRows_() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    if (body.action !== 'save') throw new Error('Unknown action');
    var result = saveRow_(body.date, body.fields || {});
    return json_({ ok: true, updated: result });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ------------------------------------------------------------------------ */

function sheet_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('No tab named ' + SHEET_NAME);
  return sh;
}

function readRows_() {
  var sh = sheet_();
  var values = sh.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (!row[0]) continue;
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      if (headers[c]) obj[headers[c]] = row[c] == null ? '' : String(row[c]);
    }
    obj.Date = isoDate_(sh.getRange(r + 1, 1).getValue(), row[0]);
    rows.push(obj);
  }
  return rows;
}

function saveRow_(date, fields) {
  if (!date) throw new Error('date is required');
  var sh = sheet_();
  var values = sh.getDataRange().getValues();
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var rowIndex = -1;
  for (var r = 1; r < values.length; r++) {
    if (isoDate_(values[r][0], String(values[r][0])) === date) { rowIndex = r; break; }
  }
  if (rowIndex === -1) {
    // New Sunday: append a row with the date in column A.
    rowIndex = values.length;
    sh.getRange(rowIndex + 1, 1).setValue(date);
  }
  var updated = 0;
  Object.keys(fields).forEach(function (header) {
    var c = headers.indexOf(header);
    if (c === -1) {
      // Unknown header: add it at the end so nothing typed in the form is lost.
      c = headers.length;
      headers.push(header);
      sh.getRange(1, c + 1).setValue(header);
    }
    sh.getRange(rowIndex + 1, c + 1).setValue(fields[header]);
    updated++;
  });
  return { row: rowIndex + 1, cells: updated };
}

function isoDate_(value, display) {
  if (value instanceof Date && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(display || value || '').trim();
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
  return s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
