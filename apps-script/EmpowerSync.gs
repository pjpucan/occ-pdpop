/**
 * PDP -> Google Sheets: Empower Statistical Report sync.
 *
 * Paste this into the Google Sheet's Apps Script editor (Extensions > Apps
 * Script). It pulls the Empower report from the PDP app and writes it to a
 * tab named after the month (e.g. "Oct 2026"), laid out like the Excel export.
 * Re-running for the same month replaces that tab's contents.
 *
 * One-time setup (from the "PDP" menu in the sheet):
 *   1. PDP > Settings…              app URL, feed token, pastor name
 *   2. PDP > Turn on monthly auto-pull   runs on the 3rd of every month
 */

var PROPS = PropertiesService.getScriptProperties();
var NAVY = '#1E293B';
var CATEGORY_COLUMNS = ['KIDS', 'TWEENS', 'YTH', 'NXT', 'SOLO', 'SENIOR_ADULT', 'COUPLES', 'LEGACY'];
var SUB_HEADERS = ['First Timer', 'Running Total', 'Actual BS Conducted', 'First Timer', 'Attendees',
  'Kids (0-8)', 'Tweens (9-12)', 'YTH (13-22)', 'NXT (23-39)', 'Solo Parent',
  'Senior Adult (40-59)', 'Couples', 'Legacy (60+)'];
var TRIGGER_HANDLER = 'pullPreviousMonth';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('PDP')
    .addItem('Pull last month\'s Empower report', 'pullPreviousMonth')
    .addItem('Pull a specific month…', 'pullMonthPrompt')
    .addSeparator()
    .addItem('Turn on monthly auto-pull (3rd of the month)', 'installMonthlyTrigger')
    .addItem('Turn off monthly auto-pull', 'removeMonthlyTrigger')
    .addItem('Settings…', 'showSettings')
    .addToUi();
}

// --- entry points ----------------------------------------------------------

// Runs from the monthly trigger: on the 3rd, "last month" is the month that
// just closed.
function pullPreviousMonth() {
  var tz = Session.getScriptTimeZone();
  var now = new Date();
  var prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  pullMonth(Utilities.formatDate(prev, tz, 'yyyy-MM'));
}

function pullMonthPrompt() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('Pull Empower report', 'Month to pull (YYYY-MM), e.g. 2026-10:', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var month = res.getResponseText().trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    ui.alert('Please enter the month as YYYY-MM, e.g. 2026-10.');
    return;
  }
  pullMonth(month);
}

function pullMonth(month) {
  var report = fetchReport(month);
  var sheet = writeReport(report);
  SpreadsheetApp.getActive().toast('Filled "' + sheet.getName() + '" from PDP.', 'PDP', 5);
}

// --- fetching --------------------------------------------------------------

function fetchReport(month) {
  var baseUrl = (PROPS.getProperty('APP_URL') || '').replace(/\/+$/, '');
  var token = PROPS.getProperty('FEED_TOKEN') || '';
  if (!baseUrl || !token) {
    throw new Error('PDP isn\'t set up yet. Use PDP > Settings… to enter the app URL and feed token.');
  }
  var url = baseUrl + '/api/feed/empower?month=' + encodeURIComponent(month) +
    '&pastorName=' + encodeURIComponent(PROPS.getProperty('PASTOR_NAME') || '');
  var res = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code !== 200) {
    throw new Error('PDP returned ' + code + ': ' + res.getContentText().slice(0, 300));
  }
  return JSON.parse(res.getContentText());
}

// --- writing ---------------------------------------------------------------

function writeReport(report) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(report.monthLabel);
  if (sheet) {
    sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();
    sheet.clear();
  } else {
    sheet = ss.insertSheet(report.monthLabel);
  }

  // Title block
  sheet.getRange('A1:C2').merge().setValue('EMPOWER GLOBAL').setFontWeight('bold').setFontSize(16);
  sheet.getRange('D1:N1').merge().setValue('STATISTICAL REPORT').setFontWeight('bold').setFontSize(18);
  sheet.getRange('D3:F5').setValues([
    ['For The Month Of:', '', report.monthLabel],
    ['Name of Local Church:', '', report.churchName],
    ['Name of Pastor:', '', report.pastorName || ''],
  ]);

  // Two header rows (7-8)
  sheet.getRange('A7:A8').merge().setValue('CUT-OFF PERIOD');
  sheet.getRange('B7:C7').merge().setValue('All Official Activities Except Bible Study');
  sheet.getRange('D7:F7').merge().setValue('BIBLE STUDY');
  sheet.getRange('G7:N7').merge().setValue('EMPOWER POPULATION');
  sheet.getRange('O7:O8').merge().setValue('TOTAL EPOP');
  sheet.getRange(8, 2, 1, SUB_HEADERS.length).setValues([SUB_HEADERS]);
  styleBand(sheet.getRange('A7:O8')).setHorizontalAlignment('center').setWrap(true);

  // Data rows: BASE, each cut-off period, then TOTAL
  var rows = [toRow(report.base)];
  report.periods.forEach(function (p) { rows.push(toRow(p)); });
  rows.push(toRow(report.totals));
  var first = 9;
  var data = sheet.getRange(first, 1, rows.length, 15).setValues(rows);
  data.setBorder(true, true, true, true, true, true).setVerticalAlignment('middle');
  sheet.getRange(first, 2, rows.length, 14).setHorizontalAlignment('center');
  sheet.getRange(first, 15, rows.length, 1).setFontWeight('bold').setFontStyle('italic');
  styleBand(sheet.getRange(first + rows.length - 1, 1, 1, 15));

  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidths(2, 14, 100);
  return sheet;
}

function toRow(r) {
  var row = [r.label, r.firstTimerAllOfficial, r.runningTotal, r.actualBSConducted, r.firstTimerBS, r.attendees];
  CATEGORY_COLUMNS.forEach(function (c) { row.push(r.categories ? r.categories[c] : null); });
  row.push(r.totalEpop);
  return row.map(function (v) { return v === null || v === undefined ? '' : v; });
}

function styleBand(range) {
  return range.setBackground(NAVY).setFontColor('#FFFFFF').setFontWeight('bold')
    .setBorder(true, true, true, true, true, true);
}

// --- settings & trigger ----------------------------------------------------

function showSettings() {
  var ui = SpreadsheetApp.getUi();
  var fields = [
    ['APP_URL', 'PDP app URL (e.g. https://your-app.vercel.app):'],
    ['FEED_TOKEN', 'Report feed token (REPORT_FEED_TOKEN from the app\'s settings):'],
    ['PASTOR_NAME', 'Name of Pastor (optional):'],
  ];
  for (var i = 0; i < fields.length; i++) {
    var key = fields[i][0];
    var current = PROPS.getProperty(key) || '';
    var shown = key === 'FEED_TOKEN' && current ? '(saved, leave blank to keep)' : (current || '(not set)');
    var res = ui.prompt('PDP settings', fields[i][1] + '\nCurrent: ' + shown, ui.ButtonSet.OK_CANCEL);
    if (res.getSelectedButton() !== ui.Button.OK) return;
    var value = res.getResponseText().trim();
    if (value) PROPS.setProperty(key, value);
  }
  ui.alert('Saved. Try PDP > Pull last month\'s Empower report to test it.');
}

function installMonthlyTrigger() {
  removeMonthlyTrigger(true);
  ScriptApp.newTrigger(TRIGGER_HANDLER).timeBased().onMonthDay(3).atHour(6).create();
  SpreadsheetApp.getUi().alert('Auto-pull is on: last month\'s Empower report will be filled on the 3rd of every month, around 6–7 AM (' +
    Session.getScriptTimeZone() + ').');
}

function removeMonthlyTrigger(silent) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === TRIGGER_HANDLER) ScriptApp.deleteTrigger(t);
  });
  if (silent !== true) SpreadsheetApp.getUi().alert('Auto-pull is off.');
}
