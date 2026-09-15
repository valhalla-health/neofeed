// Required-field gate on the daily log (ward request, 2026-09-15).
//
// "บังคับลง log ทุกช่อง ถึงจะ save ได้" — every field in Step 1 (the fluid plan
// and both weights) and in the Intake / Output card must be filled in before
// an order can be saved. Steps 2-6 are deliberately outside the gate: a day
// with no lipid, no supplement and no enteral feed is a normal day, and a
// gate demanding a typed 0 in each of those boxes gets cleared by rote.
//
// The subtlety this file exists for: a fresh form renders 0 as an EMPTY box
// with a "0" placeholder, so a field nobody has touched is indistinguishable
// on screen from one somebody deliberately zeroed. The gate therefore asks
// for a non-empty box, not a non-zero value — which means a typed "0" has to
// survive the value-sync effect that re-renders the field (it did not, at
// first: the keystroke set the value to 0 and the effect wiped the box back
// to empty, leaving a field that could not be satisfied at all).
//
// Same jsdom harness as verify-tpn-calc-weight.cjs: mounts the real
// <Calculator> and drives its actual inputs.
const fs = require('fs');
const vm = require('vm');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = require('path').join(__dirname, '..') + '/';

let pass = 0, fail = 0;
function eq(name, got, want) {
  const yes = Object.is(got, want);
  console.log(`  ${yes ? 'PASS' : 'FAIL'}  ${name.padEnd(56)} got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
  yes ? pass++ : fail++;
}
function ok_(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name.padEnd(56)}${cond ? '' : '  ' + JSON.stringify(detail)}`);
  cond ? pass++ : fail++;
}

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
for (const f of ['icons.jsx', 'calculator.jsx']) {
  vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + f, 'utf8'), {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    filename: f, configFile: false, babelrc: false,
  }).code);
}

const container = document.getElementById('root');
let root = ReactDOM.createRoot(container);
const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

function fieldByLabel(labelText) {
  return [...container.querySelectorAll('.field')]
    .find((d) => d.querySelector('label')?.textContent.startsWith(labelText));
}
function inputFor(labelText) {
  const input = fieldByLabel(labelText)?.querySelector('input');
  if (!input) throw new Error('field not found: ' + labelText);
  return input;
}
function setField(labelText, value) {
  const input = inputFor(labelText);
  act(() => {
    valueSetter.call(input, String(value));
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
function blurField(labelText) {
  const input = inputFor(labelText);
  act(() => {
    input.dispatchEvent(new window.FocusEvent('focus', { bubbles: true }));
    input.dispatchEvent(new window.FocusEvent('blur', { bubbles: true }));
  });
}
const saveButton = () => [...container.querySelectorAll('button')]
  .find(b => b.textContent.trim() === 'บันทึก' || /กำลังบันทึก/.test(b.textContent));
const missingText = () => [...container.querySelectorAll('div')]
  .map(d => d.textContent).filter(t => /^ยังกรอกไม่ครบ/.test(t)).pop() || '';

const patient = { sessionId: 'RQ-1', name: 'RQ', bw: 1200, currentBed: 'NICU 1', diagnosis: '-', weights: [] };
// Every field the gate covers. "Target fluid" gets a real number; the rest are
// the zeros a quiet day legitimately has, which is exactly the case the gate
// is about.
const REQUIRED = ['Target fluid', 'Other IV', 'Drug volume', 'Current weight', 'Input', 'Urine output', 'Drain content'];

function mount(props) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  act(() => {
    root.render(React.createElement(window.Calculator, {
      patient, dol: 3, editEntry: null, baselineEntry: null, logDate: '2026-09-15',
      onLog() { return Promise.resolve({ ok: true, entryId: 'e-1', lastModified: 'lm-1' }); },
      onUpdate() {}, onSaved() {}, onWeightChange() {}, ...props,
    }));
  });
  act(() => {
    container.querySelectorAll('.card-h.clickable').forEach((h) =>
      h.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
  });
}

// ── #1 a fresh form cannot be saved ───────────────────────────────────────
console.log('\n── #1 a brand-new form is blocked until every field is entered ──');
mount({});
ok_('Save is disabled on an untouched form', saveButton()?.disabled === true, { disabled: saveButton()?.disabled });
ok_('…and the form says which fields are missing', /Drug volume/.test(missingText()), missingText());
ok_('…naming the Intake/Output fields too', /Urine output/.test(missingText()), missingText());

// A field the form PREFILLS with a real number is already entered: the ward's
// rule is that nothing is left to a silent default, and a visible 130
// mL/kg/d is not silent. It is the zero-valued fields that trap, because a
// fresh 0 renders as an empty box — which is why exactly those are what the
// gate lists above.
ok_('a prefilled fluid plan counts as entered', !/Target fluid/.test(missingText()), missingText());
ok_('a prefilled weight counts as entered',     !/Current weight/.test(missingText()), missingText());

// Clearing a prefilled field puts it back in the list — prefill is a value,
// not a permanent exemption.
setField('Target fluid', '');
ok_('clearing the prefilled fluid plan re-blocks it', /Target fluid/.test(missingText()), missingText());
setField('Target fluid', 130);

// The weights: Current weight is typed, TPN calc. weight is derived from it,
// so entering the first satisfies both.
setField('Current weight', 1150);
ok_('entering Current weight also satisfies TPN calc. weight',
  !/TPN calc/.test(missingText()), missingText());
ok_('…but the form is still blocked by the I/O card', saveButton()?.disabled === true, missingText());

// ── #2 a typed 0 counts, and does not erase itself ────────────────────────
console.log('\n── #2 a deliberately-typed 0 satisfies the gate ──');
setField('Other IV', 0);
eq('the typed 0 stays in the box', inputFor('Other IV').value, '0');
blurField('Other IV');
eq('…and survives losing focus', inputFor('Other IV').value, '0');
ok_('…and no longer counts as missing', !/Other IV/.test(missingText()), missingText());

// Clearing it again puts the field back to blank — the gate must not be
// satisfiable by a value the user removed.
setField('Other IV', '');
eq('clearing the box empties it', inputFor('Other IV').value, '');
ok_('…and it counts as missing again', /Other IV/.test(missingText()), missingText());

// ── #3 filling everything releases the save ───────────────────────────────
console.log('\n── #3 Save unlocks once every field is entered ──');
REQUIRED.forEach(l => setField(l, l === 'Target fluid' ? 130 : l === 'Current weight' ? 1150 : 0));
eq('nothing left missing', missingText(), '');
ok_('Save is enabled', saveButton()?.disabled === false, { disabled: saveButton()?.disabled });

let logged = null;
mount({ onLog(e) { logged = e; return Promise.resolve({ ok: true, entryId: 'e-2', lastModified: 'lm-2' }); } });
REQUIRED.forEach(l => setField(l, l === 'Target fluid' ? 130 : l === 'Current weight' ? 1150 : 0));
act(() => { saveButton()?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
ok_('a fully-entered order saves', !!logged, logged);
eq('…carrying the entered zeros, not nulls', logged && logged.ioOutput, 0);

// ── #4 the gate does not reach into Steps 2-6 ─────────────────────────────
console.log('\n── #4 Steps 2-6 are outside the gate ──');
// Nothing above touched the enteral feed, the TPN bag, the electrolytes or a
// single supplement, and the order still saved — that is the assertion.
ok_('an order with no enteral feed and no TPN still saved', !!logged, logged);
eq('…and records the NPO day as such', logged && logged.route, 'NPO');

// ── #5 reopening a saved entry does not demand re-typing its zeros ────────
console.log('\n── #5 a saved entry reopens satisfied ──');
mount({
  editEntry: { entryId: 'e-2', lastModified: 'lm-2', ts: '2026-09-15', dol: 3, weight: 1150,
               calcInput: logged.calcInput },
  logDate: null,
});
eq('stored zeros render as typed zeros', inputFor('Drain content').value, '0');
eq('nothing reads as missing', missingText(), '');
ok_('…so a correction elsewhere can be saved straight away',
  saveButton()?.disabled === false, { disabled: saveButton()?.disabled });

// ── #6 a fresh form for another patient starts blocked again ──────────────
// The "this box was typed into" flag is per form, not per component instance:
// yesterday's answer must not arrive pre-satisfied on the next infant.
console.log('\n── #6 the gate resets for the next patient ──');
mount({ patient: { ...patient, sessionId: 'RQ-2', name: 'RQ2' } });
ok_('Save is disabled again', saveButton()?.disabled === true, { disabled: saveButton()?.disabled });
ok_('…with the same fields listed', /Drain content/.test(missingText()), missingText());

// ── #7 the Center Point entry is held to the same gate ────────────────────
// Center Point mounts this same <Calculator> with a `centerPoint` bridge that
// replaces onLog. The gate and the F1 critical-value stop both run before that
// branch (decision 2026-09-15), so neither can be skipped by saving through CP.
console.log('\n── #7 a Center Point save passes the same gate and F1 stop ──');
let cpSaved = null, cpLogged = null;
const centerPoint = {
  save(p) { cpSaved = p; return Promise.resolve({ sourceRecordId: 'cp-1', recordedAt: '2026-09-15T08:00:00Z' }); },
  review() {}, failed() {},
};
mount({ centerPoint, onLog(e) { cpLogged = e; return Promise.resolve({ ok: true, entryId: 'x', lastModified: 'x' }); } });
ok_('Save is disabled on an untouched CP form', saveButton()?.disabled === true, { disabled: saveButton()?.disabled });
act(() => { saveButton()?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
eq('…and nothing reaches Center Point', cpSaved, null);

REQUIRED.forEach(l => setField(l, l === 'Target fluid' ? 130 : l === 'Current weight' ? 1150 : 0));
setField('Volume(mL/day)', 300);
setField('Dextrose final', 25);
const critAlerts = [...container.querySelectorAll('.calc-bottom .alert-row')].map(a => a.textContent);
ok_('the order carries a critical alert (dextrose over KCMH max)',
  critAlerts.some(t => /Dextrose over KCMH max/.test(t)), critAlerts);
window.prompt = () => null;
act(() => { saveButton()?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
eq('a critical value with no reason does not reach CP', cpSaved, null);

window.prompt = () => 'attending aware';
act(() => { saveButton()?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
ok_('with a reason, the order saves through Center Point', !!cpSaved, cpSaved);
eq('…and never through the legacy onLog', cpLogged, null);

console.log(`\n${fail === 0 ? 'REQUIRED LOG FIELDS: ALL PASS' : `REQUIRED LOG FIELDS: ${fail} FAILED`} (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
