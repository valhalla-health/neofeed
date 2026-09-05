// Server-side plausibility validation must actually reject garbage — not
// just exist. doPost was reachable directly (curl, a stale bundle, DevTools),
// bypassing every <input min/max> in registry.jsx/calculator.jsx entirely,
// and nothing on the server checked BW/GA/fluid/etc. before they landed in
// Patient_Registry or Daily_Log. This pins the fix at its three write
// choke points — registerPatient, _buildLogRow (shared by
// logDailyNutrition/updateDailyNutrition), updateWeights — plus the
// _checkRange primitive they share.
//
// `gas-backend.gs` is Apps Script, not Node, but every top-level statement
// is a `var` constant or function declaration, so the whole file evaluates
// against stubbed SpreadsheetApp/Utilities globals (same technique as
// verify-gas-registry-upsert.cjs) and the real functions can be called
// directly. No dependencies; run with plain `node test/verify-input-validation.cjs`.
const fs = require('fs');
const vm = require('vm');

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = Object.is(got, want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(50)} got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
function ok(name, cond) { eq(name, !!cond, true); }
function throws(name, fn) {
  let threw = null;
  try { fn(); } catch (e) { threw = e.message; }
  ok(name, threw !== null);
  return threw;
}
function doesNotThrow(name, fn) {
  let threw = null;
  try { fn(); } catch (e) { threw = e.message; }
  eq(name, threw, null);
}

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
const EXISTING = ['FO-1','Fo','Fo',1200,28,'girls','2026-07-01','2026-08-01','',
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
  sessionId: 'FO-1', name: 'Fo', initials: 'Fo', bw: 1200, ga: 28, sex: 'girls',
  dob: '2026-07-01', admissionDate: '2026-08-01', twinSuffix: '', status: 'Active',
  currentBed: 'NICU 11', diagnosis: 'RDS', weights: [], lengths: [], hcs: [],
  bedHistory: [], statusDate: '', multiplesCount: 0,
};

// ── 1. _checkRange primitive ───────────────────────────────────────────────
console.log('\n── _checkRange ──');
doesNotThrow('in-range value passes',      () => sandbox._checkRange(50, 0, 100, 'x'));
doesNotThrow('boundary value passes',      () => sandbox._checkRange(100, 0, 100, 'x'));
doesNotThrow('empty string is skipped',    () => sandbox._checkRange('', 0, 100, 'x'));
doesNotThrow('null is skipped',            () => sandbox._checkRange(null, 0, 100, 'x'));
doesNotThrow('undefined is skipped',       () => sandbox._checkRange(undefined, 0, 100, 'x'));
throws('non-numeric garbage is rejected', () => sandbox._checkRange('=IMPORTXML(1)', 0, 100, 'x'));
const msg = throws('over-max value throws', () => sandbox._checkRange(400, 0, 100, 'BP (mmHg)'));
ok('error message names the field and value', /BP \(mmHg\).*400/.test(msg));
throws('under-min value throws', () => sandbox._checkRange(-5, 0, 100, 'x'));

// ── 2. registerPatient rejects implausible values ──────────────────────────
console.log('\n── registerPatient() plausibility guard ──');
sheet = makeSheet(PAT_HEADER, [EXISTING], 26);
throws('BW=50000 g rejected (the BP=400 mmHg case for NeoFeed)',
  () => sandbox.registerPatient({ ...patient, sessionId: 'X-1', bw: 50000 }));
eq('rejected BW never reached the sheet', sheet.appended.length, 0);

sheet = makeSheet(PAT_HEADER, [EXISTING], 26);
throws('GA=99 weeks rejected', () => sandbox.registerPatient({ ...patient, sessionId: 'X-2', ga: 99 }));
eq('rejected GA never reached the sheet', sheet.appended.length, 0);

sheet = makeSheet(PAT_HEADER, [EXISTING], 26);
doesNotThrow('a plausible extreme-preterm registration still saves',
  () => sandbox.registerPatient({ ...patient, sessionId: 'X-3', bw: 420, ga: 23 }));
eq('plausible registration reached the sheet', sheet.appended.length, 1);

sheet = makeSheet(PAT_HEADER, [EXISTING], 26);
throws('missing BW/GA cannot create a dose-bearing patient record',
  () => sandbox.registerPatient({ sessionId: 'X-4', name: 'N', initials: 'N' }));

sheet = makeSheet(PAT_HEADER, [EXISTING], 26);
throws('GA day digit above 6 is rejected',
  () => sandbox.registerPatient({ ...patient, sessionId: 'X-5', ga: 27.9 }));

sheet = makeSheet(PAT_HEADER, [EXISTING], 26);
throws('GA with more than one decimal place is rejected',
  () => sandbox.registerPatient({ ...patient, sessionId: 'X-6', ga: 27.25 }));

// ── 3. _buildLogRow (shared by create + update) rejects implausible entries ─
console.log('\n── _buildLogRow() plausibility guard ──');
throws('fluid=99999 mL/kg/d rejected',
  () => sandbox._buildLogRow('FO-1', { dol: 5, weight: 1300, fluid: 99999 }, 'nurse@x'));
throws('DOL=0 rejected (must be ≥1)',
  () => sandbox._buildLogRow('FO-1', { dol: 0, weight: 1300 }, 'nurse@x'));
throws('weight=50 g rejected (below any live infant)',
  () => sandbox._buildLogRow('FO-1', { dol: 5, weight: 50 }, 'nurse@x'));
throws('missing DOL is rejected',
  () => sandbox._buildLogRow('FO-1', { weight: 1300 }, 'nurse@x'));
throws('missing weight is rejected',
  () => sandbox._buildLogRow('FO-1', { dol: 5 }, 'nurse@x'));
throws('a non-numeric nutrition value is rejected, not silently changed to zero',
  () => sandbox._buildLogRow('FO-1', { dol: 5, weight: 1300, fluid: 'not-a-number' }, 'nurse@x'));
doesNotThrow('a plausible daily entry still builds',
  () => sandbox._buildLogRow('FO-1', { dol: 5, weight: 1300, fluid: 150, gir: 8, na: 3 }, 'nurse@x'));
doesNotThrow('optional supplement fields left empty do not block the entry',
  () => sandbox._buildLogRow('FO-1', { dol: 5, weight: 1300 }, 'nurse@x'));

// ── 4. logDailyNutrition end-to-end (the actual doPost call site) ──────────
console.log('\n── logDailyNutrition() end-to-end ──');
sheet = makeSheet(['ts','sessionId','dol','weight','fluid'], [], 31);
throws('implausible entry never reaches Daily_Log',
  () => sandbox.logDailyNutrition('FO-1', { dol: 5, weight: 1300, fluid: 99999 }, 'nurse@x'));
eq('nothing appended to Daily_Log', sheet.appended.length, 0);

sheet = makeSheet(['ts','sessionId','dol','weight','fluid'], [], 31);
doesNotThrow('plausible entry logs normally',
  () => sandbox.logDailyNutrition('FO-1', { dol: 5, weight: 1300, fluid: 150 }, 'nurse@x'));
eq('plausible entry appended once', sheet.appended.length, 1);

// ── 5. updateWeights rejects an implausible growth-chart point ─────────────
console.log('\n── updateWeights() plausibility guard ──');
sheet = makeSheet(PAT_HEADER, [EXISTING], 26);
throws('a 90000 g growth-chart point is rejected',
  () => sandbox.updateWeights('FO-1', [{ dol: 1, w: 1200 }, { dol: 10, w: 90000 }]));
eq('rejected weights array never written', sheet.writes.length, 0);

sheet = makeSheet(PAT_HEADER, [EXISTING], 26);
doesNotThrow('a plausible growth-chart update still saves',
  () => sandbox.updateWeights('FO-1', [{ dol: 1, w: 1200 }, { dol: 10, w: 1350 }]));
eq('plausible weights array written', sheet.writes.length, 1);

// updateWeights used to return undefined (a silent no-op) on an unknown
// sessionId, and no lock guarded the read-modify-write — see CODE_REVIEW_
// 2026-08-18.md B4 / BACKLOG.md. Fixed 2026-09-04: it now takes the same
// LockService lock every other Patient_Registry write in this file takes,
// and reports a miss instead of doing nothing silently.
sheet = makeSheet(PAT_HEADER, [EXISTING], 26);
const missResult = sandbox.updateWeights('DOES-NOT-EXIST', [{ dol: 1, w: 1200 }]);
ok('unknown sessionId returns an error, not a silent no-op', !!(missResult && missResult.error));
eq('nothing written for an unknown sessionId', sheet.writes.length, 0);

sheet = makeSheet(PAT_HEADER, [EXISTING], 26);
const okResult = sandbox.updateWeights('FO-1', [{ dol: 1, w: 1200 }, { dol: 10, w: 1350 }]);
ok('a real sessionId returns {ok:true}', !!(okResult && okResult.ok));

// ── 6. logDailyNutrition takes a lock like every sibling write ─────────────
// It was the one write path in gas-backend.gs with no LockService call at
// all — two devices submitting the same patient's first entry of a day had
// no mutual exclusion whatsoever. Fixed 2026-09-04; pin that the lock is
// actually taken, and released on both the happy path and a thrown
// validation error (a missing `finally` would hold the lock for its full
// timeout on every rejected save).
console.log('\n── logDailyNutrition() concurrency lock ──');
{
  const noopLock = sandbox.LockService;
  let waited = 0, released = 0;
  sandbox.LockService = { getScriptLock: () => ({ waitLock() { waited++; }, releaseLock() { released++; } }) };

  sheet = makeSheet(['ts','sessionId','dol','weight','fluid'], [], 31);
  sandbox.logDailyNutrition('FO-1', { dol: 5, weight: 1300, fluid: 150 }, 'nurse@x');
  eq('happy path takes the script lock once', waited, 1);
  eq('happy path releases the script lock', released, 1);

  waited = 0; released = 0;
  sheet = makeSheet(['ts','sessionId','dol','weight','fluid'], [], 31);
  throws('an implausible entry is still rejected under the lock',
    () => sandbox.logDailyNutrition('FO-1', { dol: 5, weight: 1300, fluid: 99999 }, 'nurse@x'));
  eq('lock still taken on the path that throws', waited, 1);
  eq('lock still released on the path that throws', released, 1);

  sandbox.LockService = noopLock;
}

// ── 7. _buildLogRow's entry.ts fallback is ward-local, not UTC ─────────────
// new Date().toISOString().slice(0,10) mis-dated any save landing 00:00-06:59
// ICT (the whole night shift) as the previous calendar day — 02:00 ICT is
// 19:00 UTC the day before. Fixed via _wardDateKey() (also used by
// logDailyNutrition's own-day duplicate-entry check, so both share one
// definition of "today").
console.log('\n── _buildLogRow() night-shift date fallback ──');
{
  const RealDate = Date;
  class FrozenDate extends RealDate {
    constructor(...a) { return a.length ? new RealDate(...a) : new RealDate('2026-08-08T19:00:00Z'); }
    static now() { return new RealDate('2026-08-08T19:00:00Z').getTime(); }
  }
  sandbox.Date = FrozenDate;
  // 2026-08-08T19:00:00Z = 2026-08-09 02:00 ICT.
  const row = sandbox._buildLogRow('FO-1', { dol: 5, weight: 1300 }, 'nurse@x');
  eq('02:00 ICT falls back to the ward-local day, not the UTC day', row[0], '2026-08-09');
  sandbox.Date = RealDate;
}

console.log(`\n${fail === 0 ? 'INPUT VALIDATION: ALL PASS' : `INPUT VALIDATION: ${fail} FAILED`} (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
