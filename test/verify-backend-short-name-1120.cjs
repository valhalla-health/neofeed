// The backend stores a patient's name as two letters of each part, "สม จด",
// whatever a caller sends (Pp, 2026-11-20: "ทำเลย", asked whether the backend
// should cut names to 2+2 letters). registry.jsx has cut typed names since
// 2026-09-25 (data.js namePart); until this change gas-backend.gs accepted up
// to 200 characters, so a hand-made POST or an older client could store a full
// name in Patient_Registry. Same sandbox as verify-input-validation.cjs.
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
// Refused, and by this guard: a new row with another shape of id is refused anyway since 2026-11-02 (R2, last of
// all), so the guard's own words are what prove it ran (Vera on 8a77e3a).
function refusedWith(name, words, fn) {
  const msg = throws(name, fn);
  ok('…in its own words: ' + words, words.test(String(msg)));
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
  // formatDate + Session: _fmtDate needs both, and since 2026-09-23
  // registerPatient runs the admission/birth dates through it
  // (_checkAdmissionDate). Without them every registration threw
  // "Session is not defined" — which made the "still saves" cases fail and,
  // worse, made every "must reject" case pass for the wrong reason.
  Utilities: {
    getUuid: () => 'uuid', computeHmacSha256Signature: () => [], base64Encode: () => '',
    formatDate: (d) => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10),
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

// logDailyNutrition refuses a sessionId that is not in Patient_Registry since
// the 2026-09-11 review (B5). This harness's single-sheet stub has no registry
// tab, so treat every id as registered here; verify-review-0911.cjs exercises
// the real _patientExists against a real registry stub.
sandbox._patientExists = () => true;

const patient = {
  sessionId: 'FO-1', name: 'Fo', initials: 'Fo', bw: 1200, ga: 28, sex: 'girls',
  dob: '2026-07-01', admissionDate: '2026-08-01', twinSuffix: '', status: 'Active',
  currentBed: 'NICU 11', diagnosis: 'RDS', weights: [], lengths: [], hcs: [],
  bedHistory: [], statusDate: '', multiplesCount: 0,
};


// The name a call stored: appended for a new row, written in place for an edit.
const storedName = () => sheet.appended.length ? sheet.appended[0][1]
  : (sheet.writes.find(w => w.col === 1 && w.values && w.values[0]) || { values: [[null, null]] }).values[0][1];

console.log('\n── _shortPatientName ──');
eq('Thai full name → two letters each', sandbox._shortPatientName('สมชาย ใจดี', null), 'สม จด');
eq('already short: unchanged', sandbox._shortPatientName('สม จด', null), 'สม จด');
eq('vowels and marks are not letters: เพ็ญศรี แก้วมณี → พญ กว', sandbox._shortPatientName('เพ็ญศรี แก้วมณี', null), 'พญ กว');
eq('foreign name: José Smith → Jo Sm', sandbox._shortPatientName('José Smith', null), 'Jo Sm');
eq('a full name with no space → its first two letters', sandbox._shortPatientName('สมชายใจดี', null), 'สม');
eq('three words → the first two parts', sandbox._shortPatientName('สมชาย กลาง ใจดี', null), 'สม กล');
eq('blank stays blank', sandbox._shortPatientName('  ', null), '');
eq('an edit that leaves a legacy name as stored keeps it', sandbox._shortPatientName('ปพ', 'ปพ'), 'ปพ');
eq('…a changed name on an edit is cut', sandbox._shortPatientName('สมชาย ใจดี', 'ปพ'), 'สม จด');
// The same cut as the client's (data.js namePart): one rule in two places.
{
  const D = (() => { const w = {}; const ctx = { window: w, console }; vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'data.js'), 'utf8'), ctx); return w.NEOFEED_DATA; })();
  for (const [first, last, foreign] of [['สมชาย', 'ใจดี', false], ['เพ็ญศรี', 'แก้วมณี', false], ['ฤดี', 'ใจ', false], ['José', 'Smith', true], ['Ann', 'Lee', true]]) {
    eq(`matches the client for ${first} ${last}`, sandbox._shortPatientName(`${first} ${last}`, null), D.composePatientName(first, last, foreign));
  }
}

console.log('\n── registerPatient stores the short form ──');
sheet = makeSheet(PAT_HEADER, [EXISTING], 26);
let reg = null;
// confirmDuplicate: the look-alike question (same BW, GA and dates as EXISTING) is answered.
doesNotThrow('a new registration with a full name saves',
  () => { reg = sandbox.registerPatient({ ...patient, sessionId: 'NF-120001', name: 'สมชาย ใจดี', initials: 'สจ', currentBed: 'NICU 4' }, true, null, false, true); });
eq('…with no question left to answer', reg && reg.needsConfirm, undefined);
eq('…as สม จด, not the full name', storedName(), 'สม จด');

sheet = makeSheet(PAT_HEADER, [EXISTING], 26);
doesNotThrow('an edit of the legacy record that keeps its name saves',
  () => sandbox.registerPatient({ ...patient, diagnosis: 'RDS, PDA' }, false));
eq('…and keeps the stored name', storedName(), 'Fo');

sheet = makeSheet(PAT_HEADER, [EXISTING], 26);
doesNotThrow('an edit that types a full name saves',
  () => sandbox.registerPatient({ ...patient, name: 'Fiona Oak' }, false));
eq('…cut to Fi Oa', storedName(), 'Fi Oa');

console.log(`\n${fail === 0 ? 'BACKEND SHORT NAME 1120: ALL PASS' : `BACKEND SHORT NAME 1120: ${fail} FAILED`} (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
