// Backend safety checks for creating Daily_Log rows. The UI already routes an
// existing patient+date into edit mode, but the backend must enforce the same
// invariant because two devices, a cached client, or a direct request can
// bypass that UI decision.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function eq(name, got, want) {
  const yes = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${yes ? 'PASS' : 'FAIL'}  ${name}`);
  if (!yes) console.log(`        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
  yes ? pass++ : fail++;
}
function ok(name, value) { eq(name, !!value, true); }

function makeSheet(rows = [], maxColumns = 33) {
  const data = rows.map(row => row.slice());
  return {
    data, maxColumns, appended: [], inserted: [],
    getMaxColumns() { return this.maxColumns; },
    insertColumnsAfter(after, count) { this.inserted.push([after, count]); this.maxColumns += count; },
    getLastColumn() { return Math.max(1, ...data.map(row => row.length)); },
    getLastRow() { return data.length; },
    getDataRange() { return { getValues: () => data.map(row => row.slice()) }; },
    getRange(row, col, numRows = 1, numCols = 1) {
      return {
        getValue: () => (data[row - 1] || [])[col - 1] ?? '',
        getValues: () => [(data[row - 1] || []).slice(col - 1, col - 1 + numCols)],
        setValue: value => { if (!data[row - 1]) data[row - 1] = []; data[row - 1][col - 1] = value; },
        setValues: values => { data[row - 1] = values[0].slice(); },
      };
    },
    appendRow(row) { this.appended.push(row.slice()); data.push(row.slice()); },
  };
}

let dailySheet = null;
let lockTaken = 0, lockReleased = 0;
const sandbox = {
  SpreadsheetApp: { openById: () => ({
    getSheetByName: name => name === 'Daily_Log' ? dailySheet : makeSheet(),
    insertSheet: () => (dailySheet = makeSheet([], 26)),
  }) },
  Utilities: { getUuid: () => 'uuid-new', computeHmacSha256Signature: () => [], base64Encode: () => '' },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'configured', setProperty() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  LockService: { getScriptLock: () => ({ waitLock() { lockTaken++; }, releaseLock() { lockReleased++; } }) },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) },
  ContentService: { createTextOutput: text => ({ setMimeType: () => text }), MimeType: { JSON: 'json' } },
  Logger: { log() {} },
  console,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'gas-backend.gs'), 'utf8'), sandbox);

// logDailyNutrition refuses a sessionId that is not in Patient_Registry since
// the 2026-09-11 review (B5). This harness's single-sheet stub has no registry
// tab, so treat every id as registered here; verify-review-0911.cjs exercises
// the real _patientExists against a real registry stub.
sandbox._patientExists = () => true;

console.log('\n── ward-local date fallback ──');
eq('00:30 ICT belongs to the new ward date', sandbox._wardDateKey(new Date('2026-08-26T17:30:00Z')), '2026-08-27');
eq('23:59 ICT remains on the prior ward date', sandbox._wardDateKey(new Date('2026-08-26T16:59:00Z')), '2026-08-26');

console.log('\n── a new Daily_Log sheet has the full schema ──');
dailySheet = null;
const created = sandbox.getSheetLog();
eq('header is A–AL (38 columns)', created.appended[0].length, 38);
eq('AF is constantsVersion', created.appended[0][31], 'constantsVersion');
eq('AG is appVersion', created.appended[0][32], 'appVersion');

const header = created.appended[0];
const entry = {
  ts: '2026-08-27', dol: 5, weight: 1200, fluid: 150, gir: 7, pro: 3,
  kcal: 90, na: 3, k: 2, ca: 60, p: 40, route: 'TPN central', status: 'submitted',
};

console.log('\n── one entry per patient per ward date ──');
const existing = new Array(33).fill('');
existing[0] = '2026-08-27'; existing[1] = 'AB-1200'; existing[25] = 'uuid-old';
dailySheet = makeSheet([header, existing]);
let result = sandbox.logDailyNutrition('AB-1200', entry, 'nurse@hospital.th');
ok('same patient + same date is refused', result.error);
eq('duplicate row was not appended', dailySheet.appended.length, 0);
eq('duplicate check used a lock', lockTaken, 1);
eq('lock released after refusal', lockReleased, 1);

dailySheet = makeSheet([header, existing]);
result = sandbox.logDailyNutrition('AB-1200', { ...entry, ts: '2026-08-28' }, 'nurse@hospital.th');
eq('different date is accepted', result.entryId, 'uuid-new');
eq('new row appended exactly once', dailySheet.appended.length, 1);
eq('lock released after success', lockReleased, 2);

const sheetsDate = new Array(33).fill('');
sheetsDate[0] = new Date('2026-08-26T17:30:00Z'); sheetsDate[1] = 'AB-1200';
dailySheet = makeSheet([header, sheetsDate]);
result = sandbox.logDailyNutrition('AB-1200', entry, 'nurse@hospital.th');
ok('a Sheets Date object is compared in ward time', result.error);
eq('Date-valued duplicate was not appended', dailySheet.appended.length, 0);

console.log(`\nLOG CREATE GUARD: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
