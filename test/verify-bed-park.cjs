// Park a patient mid-move (Praew, 2026-09-23: "ปัญหาช่วงย้ายเตียงแล้วเซฟข้อมูล
// ไม่ได้ ให้สามารถย้ายเตียงแปะไว้ก่อนได้").
//
// One infant per bed is enforced on the client and again in gas-backend.gs,
// so swapping two occupied beds could not be saved at all: each move landed on
// a bed the other baby still held. The transfer dialog now has "พักไว้ก่อน":
// the patient leaves their bed (currentBed "", the old bed appended to
// bedHistory), stays on the same ward list as "รอเตียง · จาก <bed>", and the
// freed bed can take the other baby. The rule itself never bends.
//
//   § 1 data.js helpers — lastBed / isParked / patientWard
//   § 2 the real PatientRegistry: park A, then the full A ↔ B swap
//   § 3 the backend's _bedConflict accepts a parked record and still refuses
//       a double-book
const fs = require('fs');
const vm = require('vm');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');
const DIR = require('path').join(__dirname, '..') + '/';

let pass = 0, fail = 0;
function ok(name, cond, got) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name.padEnd(64)}${cond ? '' : ' ' + JSON.stringify(got)}`);
  cond ? pass++ : fail++;
}

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'https://localhost/', pretendToBeVisual: true });
const { window } = dom;
Object.assign(global, { window, document: window.document, self: window, HTMLElement: window.HTMLElement,
  Element: window.Element, Node: window.Node, getComputedStyle: window.getComputedStyle });
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = clearTimeout;
global.IS_REACT_ACT_ENVIRONMENT = true;
window.alert = (m) => { throw new Error('unexpected alert: ' + m); };
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

// ── § 1 ──
console.log('\n── § 1 data.js helpers ──');
const A = { sessionId: 'A', name: 'Baby A', bw: 900, ga: 27, sex: 'boys', status: 'Active', admissionDate: '2026-09-10',
  currentBed: 'NICU 1', bedHistory: [], weights: [{ dol: 1, w: 900 }] };
const B = { sessionId: 'B', name: 'Baby B', bw: 1500, ga: 32, sex: 'girls', status: 'Active', admissionDate: '2026-09-12',
  currentBed: 'NICU 2', bedHistory: [], weights: [{ dol: 1, w: 1500 }] };
ok('a bedded patient is not parked', !D.isParked(A));
ok('a never-bedded patient is not parked (no bed left)', !D.isParked({ currentBed: '', bedHistory: [] }));
const parkedA = { ...A, currentBed: '', bedHistory: [{ bed: 'NICU 1', date: '2026-09-23' }] };
ok('blank bed + a bed in history = parked', D.isParked(parkedA));
ok('lastBed names the bed left', D.lastBed(parkedA) === 'NICU 1', D.lastBed(parkedA));
ok('a parked NICU patient stays on the NICU list', D.patientWard(parkedA) === 'NICU', D.patientWard(parkedA));
ok('a parked SCN patient stays on the SCN list',
  D.patientWard({ currentBed: '', bedHistory: [{ bed: 'SCN 4', date: 'x' }] }) === 'SCN');
ok('never bedded → "other", as before', D.patientWard({ currentBed: '' }) === 'other');
ok('a parked patient holds no bed', !D.bedOccupancy([parkedA, B]).has('NICU 1'));

// ── § 2 ──
console.log('\n── § 2 the real PatientRegistry: park, then swap ──');
let patients = [A, B];
const writes = [];
const root = ReactDOM.createRoot(document.getElementById('root'));
const onEdit = (p) => {
  writes.push(p);
  // What the backend would refuse (mirrors _bedConflict via D.bedBlocker).
  const others = patients.filter(x => x.sessionId !== p.sessionId);
  if (D.bedBlocker([...others, p], p)) return { ok: false, error: 'double-book' };
  patients = patients.map(x => x.sessionId === p.sessionId ? p : x);
  render();
  return { ok: true };
};
function render() {
  act(() => root.render(React.createElement(window.PatientRegistry, {
    patients, log: {}, ward: 'NICU', onWardChange() {}, onSelect() {}, onAdd() {}, onEdit, onDelete() {},
    mergeBaseFor: () => null,
  })));
}
const click = (el) => act(() => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const text = () => document.body.textContent;
const byText = (t) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === t);
// The ⇄ button on the row whose text contains `name` (table rows or cards).
const transferFor = (name) => {
  const btns = [...document.querySelectorAll('button[title="ย้ายเตียง"]')];
  return btns.find(b => (b.closest('tr, .pmc, [class*="card"]') || b.parentElement.parentElement).textContent.includes(name));
};
const pickBed = (bed) => {
  const sel = document.querySelector('.picker select');
  act(() => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    set.call(sel, bed);
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
};
render();

const tA = transferFor('Baby A');
ok('Baby A has a transfer button', !!tA);
click(tA);
pickBed('NICU 2');
ok('moving A onto B\'s bed is refused (one infant per bed)', /NICU 2 มี Baby B/.test(text()));
ok('…and the refusal tells how to swap', /พักไว้ก่อน/.test(text()));
const confirm = byText('Confirm transfer') || [...document.querySelectorAll('.picker button.primary')][0];
ok('Confirm transfer is disabled onto an occupied bed', confirm && confirm.disabled);
click(byText('Cancel'));

// Park B, move A into NICU 2, then B into NICU 1.
click(transferFor('Baby B'));
const parkBtn = byText('พักไว้ก่อน');
ok('the transfer dialog offers พักไว้ก่อน', !!parkBtn);
click(parkBtn);
const w1 = writes.at(-1);
ok('park writes B with no bed', w1 && w1.sessionId === 'B' && w1.currentBed === '', w1);
ok('…records NICU 2 in bedHistory', w1 && w1.bedHistory.at(-1).bed === 'NICU 2', w1 && w1.bedHistory);
ok('…and keeps B\'s weights', w1 && w1.weights.length === 1 && w1.weights[0].w === 1500);
ok('the dialog closed', !document.querySelector('.picker'));
ok('B is still on the NICU list, as รอเตียง · จาก NICU 2', /Baby B/.test(text()) && /รอเตียง · จาก NICU 2/.test(text()));

click(transferFor('Baby A'));
pickBed('NICU 2');
ok('NICU 2 is free now', !/NICU 2 มี/.test(text()));
click(byText('Confirm transfer') || [...document.querySelectorAll('.picker button.primary')][0]);
const w2 = writes.at(-1);
ok('A moved into NICU 2', w2.sessionId === 'A' && w2.currentBed === 'NICU 2', w2);
ok('A\'s history records NICU 1', w2.bedHistory.at(-1).bed === 'NICU 1');

click(transferFor('Baby B'));
ok('a parked patient\'s dialog says รอเตียง', /รอเตียง — ย้ายออกจาก NICU 2/.test(text()));
ok('…and offers no second park', !byText('พักไว้ก่อน'));
pickBed('NICU 1');
click(byText('Confirm transfer') || [...document.querySelectorAll('.picker button.primary')][0]);
const w3 = writes.at(-1);
ok('B moved into NICU 1', w3.sessionId === 'B' && w3.currentBed === 'NICU 1', w3);
ok('no blank hop added to B\'s history', w3.bedHistory.length === 1 && w3.bedHistory[0].bed === 'NICU 2', w3.bedHistory);
ok('every write was accepted', writes.length === 3);
ok('swap done: A in NICU 2, B in NICU 1',
  patients.find(p => p.sessionId === 'A').currentBed === 'NICU 2' && patients.find(p => p.sessionId === 'B').currentBed === 'NICU 1');
act(() => root.unmount());

// ── § 3 ──
console.log('\n── § 3 backend _bedConflict (unchanged) ──');
const gs = fs.readFileSync(DIR + 'gas-backend.gs', 'utf8');
// The function's source up to its closing brace at column 0 (CRLF-safe).
const grab = (name) => {
  const at = gs.indexOf('function ' + name + '(');
  const end = /\r?\n\}\r?\n/.exec(gs.slice(at));
  return gs.slice(at, at + end.index + end[0].length) + '\n';
};
const ctx = {};
vm.runInNewContext(grab('_normBed') + grab('_bedConflict') + ';this._bedConflict=_bedConflict;', ctx);
// Sheet rows: [sessionId, name, …, status (9), currentBed (10)]
const row = (id, name, bed) => { const r = new Array(18).fill(''); r[0] = id; r[1] = name; r[9] = 'Active'; r[10] = bed; return r; };
const sheet = [['header'], row('A', 'Baby A', 'NICU 1'), row('B', 'Baby B', 'NICU 2')];
ok('backend accepts parking B (blank bed)', ctx._bedConflict(sheet, { sessionId: 'B', status: 'Active', currentBed: '' }) === null);
const sheet2 = [['header'], row('A', 'Baby A', 'NICU 1'), row('B', 'Baby B', '')];
ok('backend accepts A into the bed B left', ctx._bedConflict(sheet2, { sessionId: 'A', status: 'Active', currentBed: 'NICU 2' }) === null);
ok('backend still refuses a double-book', !!ctx._bedConflict(sheet, { sessionId: 'A', status: 'Active', currentBed: 'NICU 2' }));

console.log(`\nBED PARK: ${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
