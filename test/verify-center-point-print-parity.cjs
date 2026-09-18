// Center Point's TPN sheet vs NeoFeed's pharmacy order form (PR #57 review,
// finding 7, 2026-09-15).
//
// CP prints from a fixed list of slots (center-point/tpn-document.mjs
// TPN_FIELDS) that is maintained by hand. NeoFeed's <PrintOrderForm> is the
// reference: when a dose line is added there, CP's sheet silently lacks it.
// That is how CP came to print no Mg in mg/kg.
//
// The check: a fully populated order (TPN, lipid, every electrolyte, Mg, Ca,
// vitamins, trace, heparin, EN, every oral supplement, a critical override) is
// saved once through the legacy screen and once through the CP entry — first
// with no dead space, then with 6.3 mL, because an overfilled bag prints lines
// the plain one does not. Every dose figure NeoFeed's form prints — each is its
// own <strong> — must appear in a CP value slot, allowing for CP printing more
// decimals. A new figure on NeoFeed's form fails this test until CP gets a slot
// for it, or the figure is added to NOT_ON_CP below with the reason.
//
// Limit: a figure is matched by value, so another slot holding the same number
// can hide a missing one. The order uses un-round values to make that unlikely;
// keep new fixture values distinct (a 7 mL dead space once hid behind the
// 7 mL/feed enteral volume).
//
// Out of scope, deliberately:
//   - the patient table (name, NeoFeed ID, dates, DOL, weight in kg): CP has
//     its own identity join at the desktop and prints the weights in grams;
//   - the "saved by / revision" line: CP prints its own revision metadata;
//   - "changes since the previous order": NeoFeed compares with the previous
//     day's entry, CP with the previous confirmed version of the same record
//     (verify-center-point-order-changes.cjs). Different baselines, so not
//     compared here; no previousEntry is passed, so NeoFeed's form omits it.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { pathToFileURL } = require('url');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name.padEnd(66)}${cond ? '' : '  ' + JSON.stringify(detail)}`);
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
global.localStorage = window.localStorage;
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
window.showToast = () => {};

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
function inputFor(label) {
  const field = [...container.querySelectorAll('.field')].find(d => d.querySelector('label')?.textContent.startsWith(label));
  if (field) return field.querySelector('input');
  const row = [...container.querySelectorAll('.salt-row-grid')]
    .find(d => d.firstElementChild?.firstElementChild?.textContent.startsWith(label));
  return row ? row.querySelector('input') : null;
}
function setField(label, value) {
  const input = inputFor(label);
  if (!input) throw new Error('field not found: ' + label);
  act(() => { valueSetter.call(input, String(value)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
function check(labelStart) {
  const box = [...container.querySelectorAll('input[type=checkbox]')]
    .find(i => (i.closest('label')?.textContent || i.parentElement?.textContent || '').startsWith(labelStart));
  if (!box) throw new Error('checkbox not found: ' + labelStart);
  if (!box.checked) act(() => { box.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
}
const saveButton = () => [...container.querySelectorAll('button')]
  .find(b => b.textContent.trim() === 'บันทึก' || /กำลังบันทึก/.test(b.textContent));

const patient = { sessionId: '2d0b8f3a-7c1e-4b5a-9f66-1a2b3c4d5e6f', name: 'PARITY', bw: 1200, ga: 29, currentBed: 'NICU 3', diagnosis: '-', weights: [] };
// Deliberately un-round figures, so one dose is unlikely to match another by accident.
// K 3.1 + 1.3 mEq/kg/d is over the 3.5 hard limit: the order carries a critical override.
const ORDER = [
  ['Current weight', 1234], ['Target fluid', 150], ['Other IV', 3], ['Drug volume', 2],
  ['Volume(mL/feed)', 7], ['Frequency', 8],
  ['Volume(mL/day)', 137], ['Dextrose final', 12.5],
  ['Amino acid', 3.2], ['SMOF Lipid', 2.6], ['Heparin', 0.5],
  ['20% NaCl', 2.3], ['Na Acetate', 1.1], ['Glycophos', 0.7], ['KCl', 3.1], ['K₂HPO₄', 1.3],
  ['MgSO₄', 0.35], ['10% Ca gluconate', 47],
  ['Iron', 2.5], ['ปริมาณ elem Ca', 60], ['ปริมาณ elem P', 35], ['Vitamin D', 450],
];
const REASON = 'synthetic parity — attending aware';

// A figure NeoFeed prints that CP deliberately does not. Keep each with its reason.
const NOT_ON_CP = [];

async function saveOrder(props, extra) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  act(() => { root.render(React.createElement(window.Calculator, { patient, dol: 10, logDate: '2026-09-15', ...props })); });
  act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
  ORDER.forEach(([l, v]) => setField(l, v));
  (extra || []).forEach(([l, v]) => setField(l, v));
  check('Munti-vim');
  window.prompt = () => REASON;
  await act(async () => { saveButton().dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
}

const decimals = (s) => (s.split('.')[1] || '').length;

// One order through both screens, then the figure sweep. `extra` is added to
// ORDER on both screens.
async function compareOrder(label, extra) {
  console.log('');
  console.log('══ ' + label + ' ══');
  console.log('\n── NeoFeed\'s pharmacy form (legacy save) ──');
  await saveOrder({ onLog() { return Promise.resolve({ ok: true, entryId: 'e-parity', lastModified: 'lm-parity' }); }, onUpdate() {}, onSaved() {} },
    [...extra, ['Input', 180], ['Urine output', 90], ['Drain content', 0]]);
  const form = container.querySelector('#print-form');
  ok('the legacy save rendered the print form', !!form);
  if (!form) { console.log('\nPRINT PARITY: cannot run'); process.exit(1); }
  const patientTable = form.querySelector(':scope > table');
  const figures = [...form.querySelectorAll('strong')]
    .filter(s => !patientTable.contains(s) && !/บันทึกโดย/.test(s.parentElement.textContent))
    .map(s => ({ fig: s.textContent.trim().replace(/%$/, ''), where: s.parentElement.textContent.replace(/\s+/g, ' ').trim().slice(0, 90) }))
    .filter(x => /^-?\d+(\.\d+)?$/.test(x.fig));
  ok('NeoFeed\'s form printed dose figures to compare', figures.length > 40, figures.length);
  const neoText = form.textContent;
  ok('…with the critical-value reason', neoText.includes(REASON));

  console.log('\n── Center Point\'s sheet (CP save → snapshot → renderTpn) ──');
  let payload = null;
  await saveOrder({ centerPoint: { save(p) { payload = p; return Promise.resolve({ sourceRecordId: patient.sessionId, recordedAt: '2026-09-15T08:00:00.000Z' }); }, review() {}, failed() {} } }, extra);
  ok('the CP save reached the bridge', !!payload);
  if (!payload) { console.log('\nPRINT PARITY: cannot run'); process.exit(1); }
  const { buildTpn } = await import(pathToFileURL(DIR + 'center-point/tpn-snapshot.mjs').href);
  const { renderTpn } = await import(pathToFileURL(DIR + 'center-point/tpn-document.mjs').href);
  const sheet = document.createElement('div');
  renderTpn(sheet, buildTpn(payload, window.NEOFEED_DATA, '2026-09-15T01:00:00.000Z', '2026-09-16T01:00:00.000Z'));
  const cpValues = [...sheet.querySelectorAll('tr[data-field] td:nth-child(2)')]
    .map(td => td.textContent).filter(t => /^-?\d+(\.\d+)?$/.test(t)).map(Number);
  ok('CP\'s sheet printed values', cpValues.length > 40, cpValues.length);
  ok('CP\'s sheet carries the critical-value reason', sheet.textContent.includes(REASON));
  const neoAlerts = (neoText.match(/สั่งทั้งที่มีค่าวิกฤต: ([^\n]*?)เหตุผล/) || [])[1];
  ok('…and the same overridden alerts', !!neoAlerts && sheet.textContent.includes(neoAlerts.trim()), neoAlerts);

  console.log('\n── every dose figure on NeoFeed\'s form is on CP\'s sheet ──');
  const missing = [];
  for (const { fig, where } of figures) {
    const n = Number(fig), tol = 0.5 * 10 ** -decimals(fig) + 1e-9;
    if (NOT_ON_CP.some(x => x.figure === fig && where.includes(x.where))) continue;
    if (!cpValues.some(c => Math.abs(c - n) <= tol)) missing.push(`${fig} in "${where}"`);
  }
  ok(`all ${figures.length} figures found on CP's sheet`, missing.length === 0,
    { missing, hint: 'add a TPN_FIELDS slot (NeoFeed center-point/ and CP web/tpn-document.mjs) or list it in NOT_ON_CP with a reason' });
  return { payload, figures };
}

(async () => {
  // Without dead space the bag is not overfilled: Factor equals the weight
  // and NeoFeed's overfill-only lines (dead space, "bag ×") are not printed.
  // Typed as 0: since 2026-09-18 a new order on NICU/SCN starts at 30 mL.
  const plain = await compareOrder('an order with no dead space', [['ปริมาตรคาสาย', 0]]);
  ok('…that order really has no overfill', plain.payload.calc.overfill <= 1.001, plain.payload.calc.overfill);
  // With dead space they are, so the sweep covers them (re-review finding 4).
  const overfilled = await compareOrder('the same order with 6.3 mL dead space (overfilled bag)', [['ปริมาตรคาสาย', 6.3]]);
  ok('…that order is overfilled', overfilled.payload.calc.overfill > 1.001, overfilled.payload.calc.overfill);
  ok('…so NeoFeed\'s form printed the dead-space figure', overfilled.figures.some(f => f.fig === '6.3' && /ปริมาตรคาสาย/.test(f.where)),
    overfilled.figures.filter(f => /ปริมาตรคาสาย/.test(f.where)));
  ok('…and a Factor that differs from the weight', Math.abs(overfilled.payload.calc.factor - overfilled.payload.wtKg) > 0.001,
    { factor: overfilled.payload.calc.factor, wtKg: overfilled.payload.wtKg });

  act(() => { root.unmount(); });
  console.log(`\n${fail === 0 ? 'PRINT PARITY: ALL PASS' : `PRINT PARITY: ${fail} FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
