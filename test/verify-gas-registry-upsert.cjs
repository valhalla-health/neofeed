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
  // formatDate/Session are what _fmtDate reaches for when a dob cell comes back
  // as a Date object, which is what real getValues() returns for a date-formatted
  // column — the collision guard compares dob, so that path has to be exercised.
  Utilities: {
    getUuid: () => 'uuid', computeHmacSha256Signature: () => [], base64Encode: () => '',
    formatDate: (d) => new Date(d).toISOString().slice(0, 10),
  },
  Session: { getScriptTimeZone: () => 'Asia/Bangkok' },
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

// ── 5. sessionId collision guard ──────────────────────────────────────────
// sessionId is initials+BW+twinSuffix, so two unrelated infants sharing both
// generate the same id and the upsert above would overwrite the first one and
// merge two Daily_Log histories. These pin that the guard refuses that write
// WITHOUT breaking the ordinary edit path, which runs through the same call.
console.log('\n── sessionId collision guard ──');

// (a) A fresh registration landing on an existing id IS the collision.
sheet = makeSheet(PAT_HEADER, [EXISTING], 26);
threw = null;
try { sandbox.registerPatient(patient, true); } catch (e) { threw = e.message; }
ok('isNew onto an existing id throws',  threw !== null);
ok('message names the duplicate id',    String(threw).indexOf('FO-1') >= 0);
eq('nothing written on refusal',        sheet.writes.length, 0);
eq('nothing appended on refusal',       sheet.appended.length, 0);

// (b) Editing the same infant must still write in place — bed/dx/status
//     updates go through this exact call and must not be caught by the guard.
sheet = makeSheet(PAT_HEADER, [EXISTING], 26);
threw = null;
try { sandbox.registerPatient({ ...patient, currentBed: 'NICU 3' }); } catch (e) { threw = e.message; }
eq('editing the same infant does not throw', threw, null);
eq('edit still writes in place',             sheet.writes.length, 1);

// (c) A different dob means a different infant, caught even with no isNew —
//     an older frontend that predates the flag still gets the protection.
sheet = makeSheet(PAT_HEADER, [EXISTING], 26);
threw = null;
try { sandbox.registerPatient({ ...patient, dob: '2026-07-09' }); } catch (e) { threw = e.message; }
ok('dob mismatch throws without isNew', threw !== null);
eq('no write on dob mismatch',          sheet.writes.length, 0);

// (d) A PDPA-erased row has a blank dob (pseudonymizePatient clears it), so
//     there is nothing left to compare — the upsert proceeds rather than
//     locking the row out of all future edits.
const ERASED = EXISTING.slice(); ERASED[6] = '';
sheet = makeSheet(PAT_HEADER, [ERASED], 26);
threw = null;
try { sandbox.registerPatient(patient); } catch (e) { threw = e.message; }
eq('blank stored dob still upserts', threw, null);
eq('erased row written in place',    sheet.writes.length, 1);

// (e) A Date-valued dob cell compares correctly, not by object identity.
const DATEROW = EXISTING.slice(); DATEROW[6] = new Date(Date.UTC(2026, 6, 1));
sheet = makeSheet(PAT_HEADER, [DATEROW], 26);
threw = null;
try { sandbox.registerPatient({ ...patient, dob: '2026-07-09' }); } catch (e) { threw = e.message; }
ok('Date-valued stored dob still compares', threw !== null);

// (f) A genuinely new id is untouched by the guard.
sheet = makeSheet(PAT_HEADER, [EXISTING], 26);
sandbox.registerPatient({ ...patient, sessionId: 'NEW-2' }, true);
eq('a genuinely new id still appends', sheet.appended.length, 1);

// (h) The twin-specific case from the 2026-09-10 identification review: a
//     nurse picks the same Multiples letter for both twins (same initials,
//     same integer BW, same twinSuffix by mistake) — sessionId is identical
//     to an already-registered sibling's, so this is case (a) again under
//     the scenario that actually produces it on this ward, not a generic typo.
const EXISTING_TWIN = EXISTING.slice(); EXISTING_TWIN[8] = 'A'; // twinSuffix column
sheet = makeSheet(PAT_HEADER, [EXISTING_TWIN], 26);
threw = null;
try { sandbox.registerPatient({ ...patient, twinSuffix: 'A' }, true); } catch (e) { threw = e.message; }
ok('registering twin B as twin A (same letter picked twice) is refused', threw !== null);

// (g) The helper itself.
eq('same dob + edit → no conflict',
   sandbox._sessionIdConflict(EXISTING, patient, false), null);
ok('same dob + isNew → conflict',
   !!sandbox._sessionIdConflict(EXISTING, patient, true));
ok('dob mismatch → conflict',
   !!sandbox._sessionIdConflict(EXISTING, { ...patient, dob: '2026-01-01' }, false));
eq('blank incoming dob → no conflict',
   sandbox._sessionIdConflict(EXISTING, { ...patient, dob: '' }, false), null);

console.log(`\n${fail === 0 ? 'GAS REGISTRY UPSERT: ALL PASS' : `GAS REGISTRY UPSERT: ${fail} FAILED`} (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
