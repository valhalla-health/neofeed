// Quick calc — the floating-button entry added 2026-09-21 on a ward request:
// "เพิ่มปุ่มขวาล่าง ให้เป็นสำหรับแคลคูเลเตอร์ ใส่ข้อมูลแค่น้ำหนักและคำนวณตาม
// แคลคูเลเตอร์ได้เลย โดยข้อมูลในนี้จะไม่เซฟลงกูเกิลชีท."
//
// Two claims are being made, and both are the kind that rot silently:
//
//   1. It is THE SAME CALCULATOR. Not a slimmer second one — the same
//      <Calculator/>, the same `calc`, the same KCMH stock divisors. A
//      separate quick calculator would be a second implementation of the
//      dosing arithmetic in the one file that prints pharmacy orders, and the
//      two would drift the first time either moved. § 1 drives both entries
//      with identical inputs and fails on the first tile that disagrees.
//
//   2. It saves NOTHING. No Daily_Log row, no Google Sheet write, no
//      localStorage draft, no printed order form. § 2-§ 4 pin that, and § 2
//      proves the localStorage assertion is not vacuous by showing the
//      ordinary patient entry does write one under the same keystrokes.
//
// Same jsdom harness as verify-tpn-calc-weight.cjs: mounts the real
// <Calculator> and drives its actual inputs.
const fs = require('fs');
const vm = require('vm');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = require('path').join(__dirname, '..') + '/';

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name.padEnd(62)}${cond ? '' : '  ' + JSON.stringify(detail)}`);
  cond ? pass++ : fail++;
}
function eq(name, got, want) {
  const good = Object.is(got, want);
  console.log(`  ${good ? 'PASS' : 'FAIL'}  ${name.padEnd(62)}${good ? '' : `  got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
  good ? pass++ : fail++;
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
global.localStorage = window.localStorage;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;

// Copy Order writes to the clipboard; jsdom has no implementation, and the
// copied TEXT is exactly what § 4 inspects.
let copied = null;
window.confirm = () => true;
// Bare `navigator`, like the bare `localStorage` above, resolves against the
// global scope inside vm.runInThisContext — and Node 22 ships its own
// read-only globalThis.navigator, so it has to be redefined rather than
// assigned.
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { clipboard: { writeText: (t) => { copied = t; return Promise.resolve(); } } },
});

vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
for (const f of ['icons.jsx', 'calculator.jsx']) {
  vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + f, 'utf8'), {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    filename: f, configFile: false, babelrc: false,
  }).code);
}

const appSrc  = fs.readFileSync(DIR + 'app.jsx', 'utf8');
const calcSrc = fs.readFileSync(DIR + 'calculator.jsx', 'utf8');
const shell   = fs.readFileSync(DIR + 'NeoFeed.html', 'utf8');
const shellTwin = fs.readFileSync(DIR + 'index.html', 'utf8');

const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

function mount(el, props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  act(() => { root.render(React.createElement(el, props)); });
  // Every accordion step open, so the fields and tiles below Step 1 exist.
  act(() => {
    container.querySelectorAll('.card-h.clickable').forEach((h) =>
      h.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
  });
  return container;
}
// "Volume" is the label of both the enteral feed volume (mL/feed) and the TPN
// aqueous volume (mL/day), so the unit is part of the address.
function field(container, label, unit) {
  const want = unit ? `${label}(${unit})` : label;
  return [...container.querySelectorAll('.field')].find((d) => {
    const t = d.querySelector('label')?.textContent.replace(/\s+/g, '') || '';
    return t.startsWith(want.replace(/\s+/g, ''));
  });
}
function setField(container, label, unit, value) {
  const input = field(container, label, unit)?.querySelector('input');
  if (!input) throw new Error(`field not found: ${label} (${unit})`);
  act(() => {
    valueSetter.call(input, String(value));
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
// Every metric tile on the page as { label: rendered value } — the readings a
// prescriber actually acts on.
function tiles(container) {
  const out = {};
  container.querySelectorAll('.metric').forEach((m, i) => {
    const lbl = m.querySelector('.lbl')?.textContent.trim();
    const val = m.querySelector('.val')?.textContent.trim();
    if (lbl) out[`${i}·${lbl}`] = val;
  });
  return out;
}
// GIR is rendered as an inline readout rather than a <Tile>, so tiles() does
// not see it — and it is the one number that proves the compared order is a
// real one rather than a page of zeros.
function girValue(container) {
  const lbl = [...container.querySelectorAll('div')].find(d => d.textContent.trim() === 'GIR');
  const val = lbl?.parentElement?.querySelector('.num');
  return val ? parseFloat(val.textContent) : NaN;
}
// Every rendered figure inside the six wizard steps. Broader than tiles():
// it takes in the GIR readout, the mL of each KCMH stock solution, the bag
// make-up and the per-kg hints — i.e. everything a pharmacist compounds from.
function stepNumbers(container) {
  return [...container.querySelectorAll('.accordion-body .num')].map(n => n.textContent.trim());
}
function buttonMatching(container, re) {
  return [...container.querySelectorAll('button')].find((b) => re.test(b.textContent));
}

// The order under test, applied identically to both entries.
const ORDER = [
  ['Current weight',                 'g',       1240],
  ['Target fluid',                   'mL/kg/d',  150],
  ['Volume',                         'mL/day',   120],
  ['ปริมาตรคาสาย (dead space)',       'mL/day',    30],
  ['Dextrose final',                 '%',         12.5],
  ['SMOF Lipid 20%',                 'g/kg/d',     2],
];
function driveOrder(container) { ORDER.forEach(([l, u, v]) => setField(container, l, u, v)); }

// ── § 1 · the quick calc is the same calculator ────────────────────────────
console.log('\n── § 1 quick calc and the patient entry compute the same order ──');

try { window.localStorage.clear(); } catch {}

const scratchBox = mount(window.Calculator, {
  patient: { sessionId: null, name: null, initials: null, bw: 0, ga: 0,
             sex: '', currentBed: '', diagnosis: '', weights: [], lengths: [], hcs: [] },
  dol: 5, scratch: true,
  editEntry: null, baselineEntry: null, previousEntry: null, logDate: null,
  userLabel: '', userEmail: '',
});
driveOrder(scratchBox);
const scratchTiles = tiles(scratchBox);

// localStorage is read AFTER the quick calc has been fully typed into, and
// BEFORE the patient entry is mounted, so nothing else can have written.
const afterScratch = Object.keys(window.localStorage).slice().sort();

const patientBox = mount(window.Calculator, {
  // bw 0 so the birth-weight floor is out of the comparison: § 1 is about the
  // engine, and verify-tpn-calc-weight.cjs already pins the floor itself.
  patient: { sessionId: 'QC-1', name: 'QC', initials: 'QC', bw: 0, ga: 30,
             currentBed: 'NICU 1', diagnosis: '-', weights: [] },
  dol: 5,
  editEntry: null, baselineEntry: null, previousEntry: null, logDate: null,
  userLabel: 'T', userEmail: 't@example.com',
  onLog() {}, onUpdate() {}, onSaved() {}, onWeightChange() {},
});
driveOrder(patientBox);
const patientTiles = tiles(patientBox);

ok('the quick calc renders metric tiles at all', Object.keys(scratchTiles).length > 0,
  Object.keys(scratchTiles).length);
const mismatched = Object.keys(patientTiles).filter(k => scratchTiles[k] !== patientTiles[k]);
ok('every tile reads identically in both entries', mismatched.length === 0,
  mismatched.slice(0, 6).map(k => ({ tile: k, quick: scratchTiles[k], patient: patientTiles[k] })));
// Wider than the tiles: the stock volumes and the bag make-up too.
const scratchNums = stepNumbers(scratchBox), patientNums = stepNumbers(patientBox);
ok('every figure in the six steps reads identically',
  scratchNums.length > 0 && scratchNums.join('|') === patientNums.join('|'),
  { quick: scratchNums.slice(0, 12), patient: patientNums.slice(0, 12) });
// A page of zeros would make every comparison above pass vacuously.
ok('the compared order actually produces a GIR',
  girValue(patientBox) > 0 && girValue(scratchBox) === girValue(patientBox),
  { quick: girValue(scratchBox), patient: girValue(patientBox) });

// ── § 2 · it writes nothing to browser storage ─────────────────────────────
console.log('\n── § 2 nothing is persisted ──');
eq('quick calc leaves localStorage empty', afterScratch.length, 0);
// Non-vacuous: the ordinary entry, driven with the same keystrokes, does
// write its unsaved-order draft. If this ever stops being true the assertion
// above stops meaning anything.
const afterPatient = Object.keys(window.localStorage);
ok('the patient entry does write a draft under the same keystrokes',
  afterPatient.some(k => k.startsWith('neofeed_draft_')), afterPatient);

// ── § 3 · nothing it renders can reach the Sheet or the pharmacy ───────────
console.log('\n── § 3 no save, no submit, no printed order ──');
ok('no Save button', !buttonMatching(scratchBox, /^\s*บันทึก/),
  buttonMatching(scratchBox, /^\s*บันทึก/)?.textContent);
ok('the patient entry does have one', !!buttonMatching(patientBox, /บันทึก/));
ok('no delete-entry button', !buttonMatching(scratchBox, /ลบบันทึกนี้/));
ok('no printed pharmacy order form', !scratchBox.querySelector('#print-form'));
ok('no Intake / Output card', !field(scratchBox, 'Urine output', 'mL/d'));
ok('the patient entry does have one', !!field(patientBox, 'Urine output', 'mL/d'));
ok('no required-field gate is shown (there is nothing to save)',
  !/ยังกรอกไม่ครบ/.test(scratchBox.textContent));
ok('the page says it does not save', /ไม่บันทึก/.test(scratchBox.textContent));

// ── § 4 · what it copies does not read like an order ───────────────────────
console.log('\n── § 4 the copied text names itself as not an order ──');
const copyBtn = buttonMatching(scratchBox, /คัดลอกผลคำนวณ/);
ok('a Copy button is offered', !!copyBtn);
copied = null;
act(() => { copyBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
ok('clicking it copies something', typeof copied === 'string' && copied.length > 0);
ok('the text declares it is not a treatment order', /ไม่ใช่คำสั่งการรักษา/.test(copied || ''), copied);
ok('the text declares it was not saved', /ไม่ได้บันทึก/.test(copied || ''), copied);
ok('it carries no NeoFeed ID', !/NeoFeed ID/.test(copied || ''), copied);
ok('it carries no bed', !/^Bed:/m.test(copied || ''), copied);
ok('it still carries the arithmetic (GIR)', /GIR/.test(copied || ''), copied);

// ── § 5 · the wiring in app.jsx ────────────────────────────────────────────
console.log('\n── § 5 app wiring ──');
const scratchPatient = /const SCRATCH_PATIENT = Object\.freeze\(\{[\s\S]{0,600}?\}\);/.exec(appSrc)?.[0] || '';
ok('SCRATCH_PATIENT exists and is frozen', scratchPatient.length > 0);
ok('it carries no sessionId', /sessionId:\s*null/.test(scratchPatient), scratchPatient);
ok('it carries no name or initials',
  /name:\s*null/.test(scratchPatient) && /initials:\s*null/.test(scratchPatient), scratchPatient);
ok('its birth weight is 0, so no floor applies', /\bbw:\s*0\b/.test(scratchPatient), scratchPatient);

const quickView = /function QuickCalcView\([\s\S]*?\n}\n/.exec(appSrc)?.[0] || '';
ok('QuickCalcView exists', quickView.length > 0);
ok('it mounts the real Calculator with scratch',
  /<Calculator\s+patient=\{SCRATCH_PATIENT\}[\s\S]{0,120}\bscratch\b/.test(quickView), quickView.slice(0, 400));
for (const handler of ['onLog', 'onUpdate', 'onPublish', 'onDelete', 'onWeightChange']) {
  ok(`it passes no ${handler}`, !new RegExp(`${handler}=`).test(quickView));
}
ok('the quick calc view needs no patient (not in PATIENT_VIEWS)',
  /const PATIENT_VIEWS = \[[^\]]*\]/.test(appSrc) &&
  !/const PATIENT_VIEWS = \[[^\]]*quickcalc/.test(appSrc));
ok('the floating button is rendered by App',
  /<QuickCalcFab\s+onClick=/.test(appSrc));
ok('it is hidden on the calculator and on itself',
  /view !== "quickcalc" && view !== "calculator" &&\s*\n?\s*<QuickCalcFab/.test(appSrc),
  /.{0,140}<QuickCalcFab/.exec(appSrc)?.[0]);

// ── § 6 · calculator.jsx keeps every write behind the scratch flag ─────────
console.log('\n── § 6 the write paths are guarded in calculator.jsx ──');
ok('Calculator takes a scratch prop', /function Calculator\(\{[^}]*\bscratch\b/.test(calcSrc));
ok('handleSave returns before doing anything in scratch mode',
  /const handleSave = async \(\) => \{[\s\S]{0,400}?if \(scratch\) return;/.test(calcSrc));
ok('the unsaved-draft store is off', /const writeDraft = \(inputs\) => \{\s*\n?\s*if \(centerPoint \|\| scratch/.test(calcSrc));
ok('the previous-submission store is never read',
  /if \(scratch\) \{[\s\S]{0,400}?applyCalcInput\(\{ deadVol_mL/.test(calcSrc));
ok('the localStorage sweep is off', /if \(centerPoint \|\| scratch\) return;[\s\S]{0,120}localStorage\.length/.test(calcSrc));
ok('PrintOrderForm is blocked', /\{printable && !centerPoint && !scratch && <PrintOrderForm/.test(calcSrc));
ok('the DOL is not re-derived across midnight',
  /const orderDayRolledOver = !scratch &&/.test(calcSrc));

// ── § 7 · the button in both hand-synced shells ────────────────────────────
console.log('\n── § 7 shell CSS ──');
ok('.quick-fab is styled', /\.quick-fab\s*\{/.test(shell));
ok('it clears the bottom nav on a phone',
  /\.quick-fab \{[\s\S]{0,400}?bottom: calc\(58px \+ env\(safe-area-inset-bottom, 0px\) \+ \d+px\)/.test(shell));
ok('it never prints', /\.bottom-nav, \.quick-fab,[^\n]*display: none !important/.test(shell));
ok('both shells carry it', shell === shellTwin);

console.log(`\nQUICK CALC: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
