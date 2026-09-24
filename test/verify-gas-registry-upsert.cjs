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
// On a free bed: EXISTING is active in NICU 11 and the one-patient-per-bed
// guard (section 6) would otherwise refuse this registration.
sandbox.registerPatient({ ...patient, sessionId: 'NEW-1', currentBed: 'NICU 4' });
eq('appended rather than written in place', sheet.appended.length, 1);
eq('appended row is 18 wide',               sheet.appended[0]?.length, 18);
eq('no in-place write',                     sheet.writes.length, 0);

// ── 4. Formula-injection guard still applies on the widened path ──────────
console.log('\n── _sheetSafe still applied ──');
sheet = makeSheet(PAT_HEADER.slice(0, 17), [EXISTING.slice(0, 17)], 17);
// Same sessionId as EXISTING, so this is an edit of that row — its own bed is
// never a conflict with itself.
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
var rA = sandbox.registerPatient(patient, true);
threw = rA && rA.needsConfirm ? rA.error : null;   // now a needs-confirm warning, not a throw (2026-09-24)
ok('isNew onto an existing id returns needsConfirm',  threw !== null);
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
var rC = sandbox.registerPatient({ ...patient, dob: '2026-07-09' });
threw = rC && rC.needsConfirm ? rC.error : null;
ok('dob mismatch returns needsConfirm without isNew', threw !== null);
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
var rE = sandbox.registerPatient({ ...patient, dob: '2026-07-09' });
threw = rE && rE.needsConfirm ? rE.error : null;
ok('Date-valued stored dob still compares', threw !== null);

// (f) A genuinely new id is untouched by the guard. On a free bed — NICU 11
//     is EXISTING's, and section 6 below refuses a double-booking.
sheet = makeSheet(PAT_HEADER, [EXISTING], 26);
sandbox.registerPatient({ ...patient, sessionId: 'NEW-2', currentBed: 'SCN 30' }, true);
eq('a genuinely new id still appends', sheet.appended.length, 1);

// (h) The twin-specific case from the 2026-09-10 identification review: a
//     nurse picks the same Multiples letter for both twins (same initials,
//     same integer BW, same twinSuffix by mistake) — sessionId is identical
//     to an already-registered sibling's, so this is case (a) again under
//     the scenario that actually produces it on this ward, not a generic typo.
const EXISTING_TWIN = EXISTING.slice(); EXISTING_TWIN[8] = 'A'; // twinSuffix column
sheet = makeSheet(PAT_HEADER, [EXISTING_TWIN], 26);
var rH = sandbox.registerPatient({ ...patient, twinSuffix: 'A' }, true);
threw = rH && rH.needsConfirm ? rH.error : null;
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

// ══ 6. One infant per bed ════════════════════════════════════════════════
// The ward's rule since 2026-09-15: a bed holds one patient, and a second
// patient has to be moved onto a free bed rather than saved on top. Every
// client picker enforces it too, but only this check sees writes from other
// devices — two tablets can each believe the bed is free.
console.log('\n── one infant per bed ──');
const bedErr = (p, isNew) => {
  try { sandbox.registerPatient(p, isNew); return null; } catch (e) { return e.message; }
};

sheet = makeSheet(PAT_HEADER, [EXISTING], 26);
ok('registering onto an occupied bed is refused',
  /NICU 11/.test(bedErr({ ...patient, sessionId: 'OTHER-1' }, true) || ''));
eq('…and nothing reached the sheet', sheet.appended.length + sheet.writes.length, 0);

sheet = makeSheet(PAT_HEADER, [EXISTING], 26);
ok('the refusal names who is in the bed and what to do',
  /Fo/.test(bedErr({ ...patient, sessionId: 'OTHER-1' }, true) || '') &&
  /ย้าย/.test(bedErr({ ...patient, sessionId: 'OTHER-1' }, true) || ''));

sheet = makeSheet(PAT_HEADER, [EXISTING], 26);
eq('re-saving the SAME patient on their own bed is fine',
  bedErr({ ...patient, diagnosis: 'RDS · updated' }), null);

sheet = makeSheet(PAT_HEADER, [EXISTING], 26);
eq('moving onto a free bed is fine',
  bedErr({ ...patient, sessionId: 'OTHER-1', currentBed: 'SCN 7' }, true), null);

// A discharged patient keeps the bed label on their record, but the bed is
// free for the next admission — otherwise every bed on the unit silts up.
const DISCHARGED = EXISTING.slice(); DISCHARGED[9] = 'Discharged';
sheet = makeSheet(PAT_HEADER, [DISCHARGED], 26);
eq('a discharged patient does not hold their bed',
  bedErr({ ...patient, sessionId: 'OTHER-1' }, true), null);

// The other side of that: the discharged record still carries the old bed
// label, and the bed has since gone to someone else. Correcting that record
// (a name, a discharge date) must still save — it is not taking the bed from
// anyone. Only putting it back on the unit (status Active) claims the bed.
const ALUMNI = EXISTING.slice(); ALUMNI[0] = 'OLD-1'; ALUMNI[1] = 'Ol'; ALUMNI[9] = 'Discharged';
const alumni = { ...patient, sessionId: 'OLD-1', name: 'Ol', initials: 'Ol', status: 'Discharged' };
sheet = makeSheet(PAT_HEADER, [EXISTING, ALUMNI], 26);
eq('editing a discharged record whose bed was reused saves',
  bedErr({ ...alumni, diagnosis: 'RDS · corrected' }), null);
eq('…and the edit reached the sheet', sheet.writes.length > 0, true);
['Transferred', 'Expired'].forEach(status => {
  const row = ALUMNI.slice(); row[9] = status;
  sheet = makeSheet(PAT_HEADER, [EXISTING, row], 26);
  eq(`…same for a record marked ${status}`, bedErr({ ...alumni, status }), null);
});
sheet = makeSheet(PAT_HEADER, [EXISTING, ALUMNI], 26);
ok('putting that record back to Active on the taken bed is refused',
  /NICU 11/.test(bedErr({ ...alumni, status: 'Active' }) || ''));
sheet = makeSheet(PAT_HEADER, [EXISTING, ALUMNI], 26);
ok('…and so is a blank status, which means Active',
  /NICU 11/.test(bedErr({ ...alumni, status: '' }) || ''));

// Legacy spellings name the same physical bed and must collide with it.
const LEGACY = EXISTING.slice(); LEGACY[10] = 'NICU-11';
sheet = makeSheet(PAT_HEADER, [LEGACY], 26);
ok('a legacy bed spelling still counts as occupied',
  bedErr({ ...patient, sessionId: 'OTHER-1', currentBed: 'NICU 11' }, true) !== null);

// No bed recorded is not an occupancy — several unbedded patients are normal.
const NOBED = EXISTING.slice(); NOBED[10] = '';
sheet = makeSheet(PAT_HEADER, [NOBED], 26);
eq('two patients with no bed do not collide',
  bedErr({ ...patient, sessionId: 'OTHER-1', currentBed: '' }, true), null);

// The client and the backend must agree on the canonical spelling, or the
// backend refuses a bed the picker offered (or vice versa).
// data.js is browser code: it publishes onto `window`. This file has no DOM,
// so give it the bare global it needs rather than pulling in jsdom.
globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync(require('path').join(__dirname, '..', 'data.js'), 'utf8'));
const clientNorm = globalThis.window.NEOFEED_DATA.normalizeBed;
['NICU 1-1', 'NICU-3', 'scn  2', 'iso 3-2', '  nicu   4 ', '9B2', ''].forEach(b => {
  eq(`_normBed agrees with data.js for ${JSON.stringify(b)}`,
    sandbox._normBed(b), clientNorm(b));
});

console.log(`\n${fail === 0 ? 'GAS REGISTRY UPSERT: ALL PASS' : `GAS REGISTRY UPSERT: ${fail} FAILED`} (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
