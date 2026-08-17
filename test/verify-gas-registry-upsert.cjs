// registerPatient() must not depend on a manual sheet migration.
//
// `registerPatient` upserts: it appends a new patient (appendRow widens the
// sheet itself) but writes an existing one with getRange(row, 1, 1, 18).
// On a Patient_Registry tab narrower than 18 columns that range is out of
// bounds and throws — which reaches the bedside as a failed save when
// EDITING a patient, while registering a new one keeps working. That is the
// same trap `updateDailyNutrition` was given an on-demand grid widen for in
// 2b7d2a4 (Daily_Log AC–AE); this pins the matching fix one tab over.
//
// `gas-backend.gs` is Apps Script, not Node — every top-level statement in it
// is a `var` constant or a function declaration, so the whole file evaluates
// against stubbed SpreadsheetApp/Utilities globals and the real
// registerPatient can be called directly. No dependencies; run it with plain
// `node test/verify-gas-registry-upsert.cjs`.
const fs = require('fs');
const vm = require('vm');

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = Object.is(got, want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(46)} got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
function ok(name, cond) { eq(name, !!cond, true); }

// ── Minimal Sheet double ──────────────────────────────────────────────────
// Tracks the grid width, records writes, and throws on an out-of-bounds
// getRange the way the real SpreadsheetApp does — that throw is the defect.
function makeSheet(header, rows, maxColumns) {
  const data = [header, ...rows];
  return {
    maxColumns,
    writes: [],
    appended: [],
    insertedColumns: [],
    getMaxColumns() { return this.maxColumns; },
    insertColumnsAfter(after, howMany) {
      this.insertedColumns.push([after, howMany]);
      this.maxColumns += howMany;
    },
    getLastRow() { return data.length; },
    getDataRange() { return { getValues: () => data.map(r => r.slice()) }; },
    getRange(row, col, numRows, numCols) {
      if (col + numCols - 1 > this.maxColumns) {
        throw new Error('The coordinates or dimensions of the range are invalid.');
      }
      const sheet = this;
      return {
        setValues(values) { sheet.writes.push({ row, col, numCols, values }); },
        setValue(v) { sheet.writes.push({ row, col, numCols: 1, values: [[v]] }); },
        getValue() { return (data[row - 1] || [])[col - 1] ?? ''; },
        getValues() { return [(data[row - 1] || []).slice(col - 1, col - 1 + numCols)]; },
      };
    },
    appendRow(r) { this.appended.push(r); data.push(r.slice()); },
  };
}

const PAT_HEADER = [
  'sessionId','name','initials','bw','ga','sex','dob','admissionDate','twinSuffix',
  'status','currentBed','diagnosis','weights','lengths','hcs','bedHistory',
  'statusDate','multiplesCount',
];
const EXISTING = ['FO-1','Fo','Fo',2025,33.1,'girls','2026-07-01','2026-08-01','',
  'Active','NICU 11','RDS','[]','[]','[]','[]','',0];

let sheet = null;
const sandbox = {
  SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }) },
  Utilities: { getUuid: () => 'uuid', computeHmacSha256Signature: () => [], base64Encode: () => '' },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'sheet-id', setProperty() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) },
  ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
  Logger: { log() {} },
  console,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'gas-backend.gs'), 'utf8'), sandbox);

const patient = {
  sessionId: 'FO-1', name: 'Fo', initials: 'Fo', bw: 2025, ga: 33.1, sex: 'girls',
  dob: '2026-07-01', admissionDate: '2026-08-01', twinSuffix: '', status: 'Active',
  currentBed: 'NICU 11', diagnosis: 'RDS', weights: [], lengths: [], hcs: [],
  bedHistory: [], statusDate: '', multiplesCount: 0,
};

// ── 1. Narrow grid (pre-multiplesCount tab, never migrated) ───────────────
console.log('\n── upsert onto a 17-column Patient_Registry ──');
sheet = makeSheet(PAT_HEADER.slice(0, 17), [EXISTING.slice(0, 17)], 17);
let threw = null;
try { sandbox.registerPatient(patient); } catch (e) { threw = e.message; }
eq('editing an existing patient does not throw', threw, null);
eq('grid widened 17 → 18',                       sheet.maxColumns, 18);
eq('widened by inserting once',                  sheet.insertedColumns.length, 1);
eq('wrote the row in place, not appended',       sheet.appended.length, 0);
eq('wrote all 18 columns',                       sheet.writes[0]?.numCols, 18);
eq('wrote to the matching row',                  sheet.writes[0]?.row, 2);
eq('multiplesCount lands in column R',           sheet.writes[0]?.values[0][17], 0);
eq('currentBed lands in column K',               sheet.writes[0]?.values[0][10], 'NICU 11');

// ── 2. Wide-enough grid — the widen must be a no-op ───────────────────────
console.log('\n── upsert onto an already-wide (26-column) tab ──');
sheet = makeSheet(PAT_HEADER, [EXISTING], 26);
sandbox.registerPatient({ ...patient, currentBed: 'NICU 1', multiplesCount: 2 });
eq('no columns inserted',                sheet.insertedColumns.length, 0);
eq('grid untouched',                     sheet.maxColumns, 26);
eq('still writes exactly 18 columns',    sheet.writes[0]?.numCols, 18);
eq('normalized bed reaches the sheet',   sheet.writes[0]?.values[0][10], 'NICU 1');
eq('multiplesCount reaches the sheet',   sheet.writes[0]?.values[0][17], 2);

// ── 3. A brand-new patient still appends (appendRow self-widens) ──────────
console.log('\n── registering a patient not already on the sheet ──');
sheet = makeSheet(PAT_HEADER.slice(0, 17), [EXISTING.slice(0, 17)], 17);
sandbox.registerPatient({ ...patient, sessionId: 'NEW-1' });
eq('appended rather than written in place', sheet.appended.length, 1);
eq('appended row is 18 wide',               sheet.appended[0]?.length, 18);
eq('no in-place write',                     sheet.writes.length, 0);

// ── 4. Formula-injection guard still applies on the widened path ──────────
console.log('\n── _sheetSafe still applied ──');
sheet = makeSheet(PAT_HEADER.slice(0, 17), [EXISTING.slice(0, 17)], 17);
sandbox.registerPatient({ ...patient, diagnosis: '=IMPORTXML("evil","//a")' });
ok('leading = is escaped', String(sheet.writes[0]?.values[0][11]).startsWith("'="));

console.log(`\n${fail === 0 ? 'GAS REGISTRY UPSERT: ALL PASS' : `GAS REGISTRY UPSERT: ${fail} FAILED`} (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
