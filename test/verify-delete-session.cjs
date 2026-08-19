// Regression checks for "Delete session" — the admin-only, permanent removal
// of a Patient_Registry row and every Daily_Log row for its sessionId.
//
// Prompted by a ward question ("can a whole session be deleted?") answered by
// reading the code end to end; this harness pins what was verified by hand so
// it stays true: the button only exists for admins, a confirm() gates the
// actual call, the client optimistically removes then rolls back on ANY
// failure (server error, unauthorized, or a network exception — gasPost never
// throws past its own try/catch), and the server independently re-checks
// role === "admin" and cascades the delete to every matching Daily_Log row.
//
// Three parts, cheapest first:
//   A. deletePatient() in gas-backend.gs, called directly (same VM-sandbox
//      technique as verify-gas-registry-upsert.cjs) — no npm deps.
//   B. doPost's "deletePatient" branch — a structural check that the admin
//      gate and audit call are still there (same technique as the GA/BW
//      harness's test #6), since fully stubbing ContentService's chainable
//      output isn't something any harness here does yet.
//   C. EditPatientModal's Delete button + confirm gating, mounted for real in
//      jsdom (same technique as verify-patient-ga-bw-edit.cjs) — no npm deps
//      beyond what that harness already needs.
//
// Run: node test/verify-delete-session.cjs
// (Part C needs the same jsdom/react/babel deps as verify-patient-ga-bw-edit.cjs
// — see test/README.md.)
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(50)} got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
function ok(name, cond) { eq(name, !!cond, true); }

// ══════════════════════════════════════════════════════════════════════════
// Part A — deletePatient() against a stubbed Patient_Registry + Daily_Log
// ══════════════════════════════════════════════════════════════════════════
console.log('── Part A: deletePatient() cascades registry + log, in a VM sandbox ──');

function makeSheet(header, rows) {
  const data = [header, ...rows];
  return {
    deleted: [],
    getDataRange() { return { getValues: () => data.map(r => r.slice()) }; },
    deleteRow(row) { this.deleted.push(row); data.splice(row - 1, 1); },
    getLastRow() { return data.length; },
  };
}

const PAT_HEADER = ['sessionId','name','initials','bw','ga','sex','dob','admissionDate',
  'twinSuffix','status','currentBed','diagnosis','weights','lengths','hcs','bedHistory',
  'statusDate','multiplesCount'];
const LOG_HEADER = ['ts','sessionId','dol','weight'];

let patSheet, logSheet, lockCalls;
const gasSandbox = {
  SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => n === 'Patient_Registry' ? patSheet : logSheet, insertSheet: (n) => n === 'Patient_Registry' ? patSheet : logSheet }) },
  Utilities: { getUuid: () => 'uuid', computeHmacSha256Signature: () => [], base64Encode: () => '' },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'sheet-id', setProperty() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  LockService: { getScriptLock: () => ({ waitLock() { lockCalls.waited++; }, releaseLock() { lockCalls.released++; } }) },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) },
  ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
  Logger: { log() {} },
  console,
};
gasSandbox.globalThis = gasSandbox;
vm.createContext(gasSandbox);
vm.runInContext(fs.readFileSync(DIR + 'gas-backend.gs', 'utf8'), gasSandbox);

function reset() {
  patSheet = makeSheet(PAT_HEADER, [
    ['KH-BW1090','KH','KH',1090,29.2,'boys','2026-08-14','2026-08-14','','Active','NICU 7','VLBW','[]','[]','[]','[]','',0],
    ['FO-1','Fo','Fo',2025,33.1,'girls','2026-07-01','2026-08-01','','Active','NICU 11','RDS','[]','[]','[]','[]','',0],
  ]);
  logSheet = makeSheet(LOG_HEADER, [
    ['2026-08-14','KH-BW1090',1,1090],
    ['2026-08-15','KH-BW1090',2,1080],
    ['2026-08-01','FO-1',1,2025],
  ]);
  lockCalls = { waited: 0, released: 0 };
}

reset();
let result = gasSandbox.deletePatient('KH-BW1090');
ok('reports ok',                              result.ok);
eq('registry row removed',                    patSheet.getDataRange().getValues().length, 2); // header + FO-1
eq('the OTHER patient stays registered',       patSheet.getDataRange().getValues()[1][0], 'FO-1');
eq('both KH log rows removed',                 logSheet.getDataRange().getValues().length, 2); // header + FO-1's row
eq('the OTHER patient\'s log entry survives',  logSheet.getDataRange().getValues()[1][1], 'FO-1');
ok('took the script lock',                     lockCalls.waited === 1);
ok('released the script lock',                 lockCalls.released === 1);

reset();
result = gasSandbox.deletePatient('NO-SUCH-SESSION');
ok('unknown sessionId reports an error',       !!result.error);
eq('nothing removed from the registry',        patSheet.getDataRange().getValues().length, 3);
eq('nothing removed from the log',             logSheet.getDataRange().getValues().length, 4);

reset();
result = gasSandbox.deletePatient('');
ok('blank sessionId is rejected up front',     !!result.error);
eq('registry untouched',                       patSheet.deleted.length, 0);

reset();
result = gasSandbox.deletePatient(undefined);
ok('missing sessionId is rejected up front',   !!result.error);

// ══════════════════════════════════════════════════════════════════════════
// Part B — doPost's "deletePatient" branch: admin gate + audit call
// ══════════════════════════════════════════════════════════════════════════
// Not exercised end-to-end (no harness here stubs ContentService's chainable
// output), but the two things that matter for a destructive, admin-only
// action are pinned structurally: the branch checks role before calling
// deletePatient, and a successful call is audited.
console.log('\n── Part B: doPost gates deletePatient on role === "admin" and audits it ──');
const gasSrc = fs.readFileSync(DIR + 'gas-backend.gs', 'utf8');
const deleteBranch = gasSrc.slice(
  gasSrc.indexOf('if (action === "deletePatient")'),
  gasSrc.indexOf('if (action === "deleteDailyNutrition")')
);
ok('branch exists',                            deleteBranch.length > 0);
ok('checks role !== "admin" before deleting',  /user\.role\s*!==\s*"admin"/.test(deleteBranch));
ok('the admin check runs before deletePatient is called',
  deleteBranch.indexOf('user.role') < deleteBranch.indexOf('deletePatient('));
ok('audits on success',                        /logAudit\(\s*"deletePatient"/.test(deleteBranch));
ok('audit call is after the delete, not before',
  deleteBranch.indexOf('deletePatient(') < deleteBranch.indexOf('logAudit('));

// ══════════════════════════════════════════════════════════════════════════
// Part C — EditPatientModal: the button only exists for admins, and a
// confirm() decline must not call onDelete
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── Part C: EditPatientModal delete button + confirm gating ──');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'https://localhost/', pretendToBeVisual: true });
const { window } = dom;
global.window = window;
global.document = window.document;
global.self = window;
global.HTMLElement = window.HTMLElement;
global.Element = window.Element;
global.Node = window.Node;
global.getComputedStyle = window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = clearTimeout;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;

vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
for (const f of ['icons.jsx', 'registry.jsx']) {
  vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + f, 'utf8'), {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    filename: f, configFile: false, babelrc: false,
  }).code);
}

const PATIENT = {
  sessionId: 'KH-BW1090', name: 'KH', initials: 'KH', bw: 1090, ga: 29.2, sex: 'boys',
  dob: '2026-08-14', admissionDate: '2026-08-14', twinSuffix: '',
  status: 'Active', currentBed: 'NICU 7', diagnosis: 'VLBW',
  weights: [{ dol: 1, w: 1090 }], lengths: [], hcs: [], bedHistory: [],
};

const host = document.createElement('div');
document.body.appendChild(host);
const root = ReactDOM.createRoot(host);
let deleted = null, closed = false, mountSeq = 0;
function open({ onDelete } = {}) {
  deleted = null; closed = false;
  act(() => {
    root.render(React.createElement(globalThis.EditPatientModal, {
      key: 'open' + (++mountSeq),
      patient: PATIENT,
      onClose() { closed = true; },
      onSubmit() {},
      onDelete: onDelete ? ((p) => { deleted = p; }) : undefined,
    }));
  });
}
function deleteBtn() {
  return [...host.querySelectorAll('button')].find(b => b.textContent.includes('Delete session'));
}

// 1. Not passed at all (the shape a non-admin's app.jsx wiring produces:
//    onDelete={role === "admin" ? handleDeletePatient : undefined}) — the
//    button must not render, not just be present-but-disabled.
open({ onDelete: false });
eq('non-admin: no Delete button in the DOM', deleteBtn(), undefined);

// 2. Admin: the button exists.
open({ onDelete: true });
ok('admin: Delete button renders', !!deleteBtn());

// 3. Declining the confirm must not call onDelete or close the modal.
const realConfirm = window.confirm;
window.confirm = () => false;
act(() => { deleteBtn().dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
eq('declined confirm: onDelete not called', deleted, null);
eq('declined confirm: modal stays open',    closed, false);

// 4. Accepting the confirm calls onDelete with the patient and closes.
open({ onDelete: true });
window.confirm = () => true;
act(() => { deleteBtn().dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
ok('accepted confirm: onDelete called',        deleted);
eq('…with the patient being edited',           deleted?.sessionId, 'KH-BW1090');
eq('accepted confirm: modal closes',           closed, true);
window.confirm = realConfirm;

// 5. The confirm wording says who, and that it is permanent/irreversible —
//    a nurse reading a generic "are you sure?" is not the same safeguard.
let confirmText = '';
window.confirm = (msg) => { confirmText = msg; return false; };
open({ onDelete: true });
act(() => { deleteBtn().dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
ok('confirm names the patient',       confirmText.includes(PATIENT.name));
ok('confirm says it is permanent',    confirmText.includes('ถาวร'));
ok('confirm says it cannot be undone', confirmText.includes('ไม่สามารถย้อนกลับได้'));
window.confirm = realConfirm;

console.log(`\n${fail === 0 ? 'DELETE SESSION: ALL PASS' : `DELETE SESSION: ${fail} FAILED`} (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
