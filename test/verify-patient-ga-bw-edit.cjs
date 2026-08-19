// Regression checks for the 2026-08-19 change: GA, birth weight and sex are
// editable in EditPatientModal.
//
// They used to be a read-only chip strip, so a registration typo — the
// reported case was a BW keyed as 1090 — could only be corrected by deleting
// the session and re-registering it, which takes the patient's entire
// Daily_Log with it (deletePatient drops every row for the sessionId).
//
// The two things that must hold while they are editable:
//   1. sessionId is NOT re-derived from the corrected BW. It is the key
//      Patient_Registry and Daily_Log are matched on; regenerating it would
//      strand the whole log under an id nothing points at.
//   2. GA stays WW.D shorthand (28+4 → 28.4), never decimal weeks — the
//      encoding every downstream reader and the `ga < 32` HMF threshold rely
//      on.
//
// Mounts the REAL <EditPatientModal> in jsdom (same harness shape as
// verify-bed-dol-io.cjs) because what is asserted is the payload the modal
// actually submits, not a pure function.
const fs = require('fs');
const vm = require('vm');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = require('path').join(__dirname, '..') + '/';

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = Object.is(got, want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(46)} got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
function ok(name, cond) { eq(name, !!cond, true); }

// ── boot the app modules in a jsdom window ────────────────────────────────
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
const D = window.NEOFEED_DATA;

// The reported patient: KH, BW keyed as 1090, GA 29+2.
const PATIENT = {
  sessionId: 'KH-BW1090', name: 'KH', initials: 'KH', bw: 1090, ga: 29.2, sex: 'boys',
  dob: '2026-08-14', admissionDate: '2026-08-14', twinSuffix: '',
  status: 'Active', currentBed: 'NICU 7', diagnosis: 'VLBW',
  weights: [{ dol: 1, w: 1090 }, { dol: 4, w: 1020 }],
  lengths: [], hcs: [], bedHistory: [],
};

const host = document.createElement('div');
document.body.appendChild(host);
const root = ReactDOM.createRoot(host);
let submitted = null;
// Distinct key per open() so React remounts rather than reusing the instance
// — the modal seeds its fields in useState initializers, exactly as the app
// mounts it (both call sites render it only while a patient is selected and
// unmount it on close), so a reused instance would carry the previous
// patient's edits into the next assertion.
let mountSeq = 0;
function open(patient = PATIENT) {
  submitted = null;
  act(() => {
    root.render(React.createElement(globalThis.EditPatientModal, {
      key: 'open' + (++mountSeq),
      patient,
      onClose() {},
      onSubmit(p) { submitted = p; },
    }));
  });
}
// Fields are addressed by their <label>, the way a nurse addresses them.
function field(labelText) {
  const f = [...host.querySelectorAll('.field')]
    .find(d => d.querySelector('label')?.textContent.startsWith(labelText));
  if (!f) throw new Error('field not found: ' + labelText);
  return f;
}
const inputSetter  = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
const selectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
function setInput(labelText, value) {
  const el = field(labelText).querySelector('input');
  act(() => {
    inputSetter.call(el, String(value));
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
function setSelect(labelText, value, idx = 0) {
  const el = field(labelText).querySelectorAll('select')[idx];
  act(() => {
    selectSetter.call(el, String(value));
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}
function saveBtn() {
  return [...host.querySelectorAll('button')].find(b => b.textContent.includes('Save changes'));
}
function save() {
  act(() => { saveBtn().dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
}

// ══ 1. The fields exist, and seed from the record ════════════════════════
console.log('\n── #1 GA / BW / sex are editable and seeded ──');
open();
eq('BW input seeded from patient.bw',
  field('Birth weight').querySelector('input').value, '1090');
eq('GA weeks select seeded',
  field('GA').querySelectorAll('select')[0].value, '29');
eq('GA days select seeded',
  field('GA').querySelectorAll('select')[1].value, '2');
eq('sex select seeded',
  field('Sex').querySelector('select').value, 'boys');
// 22-43 wk is the offered range, same as registration.
eq('GA weeks offers 22-43 + the blank',
  field('GA').querySelectorAll('select')[0].options.length, 23);

// ══ 2. A corrected BW/GA is what gets submitted ══════════════════════════
console.log('\n── #2 corrections reach the payload ──');
setInput('Birth weight', 1900);
setSelect('GA', 30);          // weeks
setSelect('GA', 5, 1);        // days
setSelect('Sex', 'girls');
save();
ok('save fired',                              submitted);
eq('corrected BW submitted',                  submitted.bw, 1900);
eq('GA stays WW.D shorthand, not decimal wk', submitted.ga, 30.5);
eq('…and decodes as 30+5',                    D.fmtGA(submitted.ga), '30+5');
eq('corrected sex submitted',                 submitted.sex, 'girls');
// The whole point: the log stays attached to this patient.
eq('sessionId is NOT re-derived from the BW', submitted.sessionId, 'KH-BW1090');
eq('untouched fields ride along',             submitted.currentBed, 'NICU 7');

// ══ 3. weights[0] follows a corrected birth weight ══════════════════════
// It is the row NewPatientModal seeds from BW, so leaving it behind would
// keep the Fenton chart and the registry's Δ-birth plotting the typo.
console.log('\n── #3 the birth measurement follows ──');
eq('weights[0] corrected with the BW',        submitted.weights[0].w, 1900);
eq('…keeping its DOL',                        submitted.weights[0].dol, 1);
eq('later measurements untouched',            submitted.weights[1].w, 1020);
// But only when it still matched the old BW. Once it has been edited on its
// own (or the patient was admitted past DOL 1), it is a real measurement.
open({ ...PATIENT, weights: [{ dol: 3, w: 1005 }, { dol: 5, w: 1030 }] });
setInput('Birth weight', 1900);
save();
eq('an independent first measurement is kept', submitted.weights[0].w, 1005);
// And an unchanged BW must not rewrite anything either.
open();
setSelect('GA', 31);
save();
eq('unchanged BW leaves weights[0] alone',    submitted.weights[0].w, 1090);
eq('unchanged BW submitted as-is',            submitted.bw, 1090);

// ══ 4. They can be corrected but not cleared ════════════════════════════
// A 0/blank BW or GA silently corrupts every subsequent dose for this
// patient — the same gate registration applies.
console.log('\n── #4 neither can be cleared ──');
open();
setInput('Birth weight', 0);
eq('save blocked on a cleared BW',            saveBtn().disabled, true);
setInput('Birth weight', 1090);
eq('…re-enabled once BW is back',             saveBtn().disabled, false);
setSelect('GA', '');
eq('save blocked on a cleared GA',            saveBtn().disabled, true);

// ══ 5. An off-list GA still preselects ══════════════════════════════════
// Same rule BedSelect follows for an unknown bed: carry it as an extra
// option rather than rendering blank and re-saving it as 0.
console.log('\n── #5 an out-of-range GA is carried ──');
open({ ...PATIENT, ga: 20.3 });
eq('off-list week preselects',                field('GA').querySelectorAll('select')[0].value, '20');
eq('…carried as one extra option',            field('GA').querySelectorAll('select')[0].options.length, 24);
// A hand-edited sheet value decodes the way gaTotalDays decodes it (27.9 →
// 27+6), not by a hand-rolled ×10 that would seed a day of 9.
open({ ...PATIENT, ga: 27.9 });
eq('27.9 seeds as 27+6',
  field('GA').querySelectorAll('select')[0].value + '+' + field('GA').querySelectorAll('select')[1].value,
  '27+6');

console.log(`\n${fail === 0 ? 'GA + BW EDIT: ALL PASS' : `GA + BW EDIT: ${fail} FAILED`} (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
