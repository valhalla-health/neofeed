// verify-no-tpn-1101.cjs — the "ไม่มี TPN" tick at the top right of Step 3
// (Pp, 2026-11-01: "มุมติ๊กขวาบน ช่อง tpn ว่า ไม่มี tpn เพื่อให้ข้ามช่องนี้ได้").
//
// What the clinical-rules skill's cases cannot reach, because they mount one
// fresh order each: the tick clears the bag and unticking it in the same visit
// puts the bag back; the order saves with calcInput.noTpn and reopens ticked;
// a new day copied from a ticked order starts ticked; the changes list names
// it; a row saved before the tick existed reopens unticked; Center Point offers
// no tick. What the feeds must reach is CR-NO-TPN-EN, and its cases run in
// test/verify-clinical-rules.cjs.
//
// Mounts the real <Calculator> in jsdom: the deps in test/README.md. Synthetic
// infants only. Fails on the source before this change (no tick to press).
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';
const R = (f) => String(fs.readFileSync(DIR + f, 'utf8')).replace(/\r\n/g, '\n');

let pass = 0, fail = 0, n = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(78)}${cond ? '' : '  ' + JSON.stringify(detail ?? '')}`);
  cond ? pass++ : fail++;
}
const section = (t) => console.log(`\n── ${t} ──`);

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>',
  { url: 'https://localhost/', pretendToBeVisual: true });
const { window } = dom;
Object.assign(global, {
  window, document: window.document, self: window, HTMLElement: window.HTMLElement,
  Element: window.Element, Node: window.Node, getComputedStyle: window.getComputedStyle,
  localStorage: window.localStorage,
  requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: clearTimeout,
  IS_REACT_ACT_ENVIRONMENT: true,
});
let toast = null;
global.showToast = (m) => { toast = String(m); };
window.print = () => {};
window.confirm = () => true;
window.prompt = () => null;
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
{ const w = console.error; console.error = (...a) => { if (!/act\(|not wrapped|Not implemented/.test(String(a[0]))) w(...a); }; }

vm.runInThisContext(R('data.js'));
for (const f of ['icons.jsx', 'calculator.jsx']) {
  vm.runInThisContext(babel.transformSync(R(f), {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    filename: f, configFile: false, babelrc: false,
  }).code);
}

const container = document.getElementById('root');
let root = ReactDOM.createRoot(container);
const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const fieldOf = (label) => [...container.querySelectorAll('.field')].find(d => d.querySelector('label')?.textContent.startsWith(label)) || null;
const saltRow = (label) => [...container.querySelectorAll('.salt-row-grid')]
  .find(d => d.firstElementChild?.firstElementChild?.textContent.startsWith(label)) || null;
const inputOf = (label) => fieldOf(label)?.querySelector('input') || saltRow(label)?.querySelector('input') || null;
function setField(label, value) {
  const input = inputOf(label);
  if (!input) throw new Error('no field labelled ' + JSON.stringify(label));
  act(() => { valueSetter.call(input, String(value)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
const click = (el) => act(() => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const clickAsync = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const button = (name) => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === name) || null;
const noTpnBox = () => container.querySelector('label.no-tpn-chk input[type=checkbox]');
const step3Head = () => container.querySelector('.step2-card-h');
const dotOf = (head) => head?.querySelector('.step-dot')?.className.replace('step-dot', '').trim();
const step4Head = () => [...container.querySelectorAll('.card-h.clickable')].find(h => h.textContent.includes('Step 4'));
function setNoTpn(want) {
  const box = noTpnBox();
  if (!box) throw new Error('no "ไม่มี TPN" tick');
  if (box.checked !== want) act(() => { box.click(); });
}

const patient = { sessionId: 'NT-1101', name: 'NT', bw: 1000, currentBed: 'NICU 5', diagnosis: '-',
  weights: [{ dol: 1, w: 1000 }], admissionDate: '2026-10-20' };
let logged = [], updated = [];
function mount(props = {}) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear();
  logged = []; updated = []; toast = null;
  act(() => { root.render(React.createElement(window.Calculator, {
    patient, dol: 10, editEntry: null, baselineEntry: null, previousEntry: null, logDate: '2026-11-01',
    userLabel: 'Dr NoTPN (notpn@kcmh.test)',
    onLog: (e) => { logged.push(e); return Promise.resolve({ ok: true, entryId: 'e-' + logged.length, lastModified: 'lm-' + logged.length }); },
    onUpdate: (id, lm, e) => { updated.push(e); return Promise.resolve({ ok: true, lastModified: 'lm-u' + updated.length }); },
    onSaved() {}, onWeightChange() {}, ...props })); });
  // Open every step, as a person filling the order would.
  act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
}
function fillRequired() {
  setField('Current weight', 1000);
  for (const l of ['Target fluid', 'Other IV', 'Drug volume', 'Input', 'Urine output', 'Drain content']) setField(l, l === 'Target fluid' ? 150 : 0);
}
function fillBag() {
  const central = [...container.querySelectorAll('.step2-ctrl .seg button')].find(b => b.textContent.trim() === 'Central');
  if (central) click(central);
  setField('Volume(mL/day)', 100);
  setField('Dextrose final', 10);
  setField('Amino acid', 3);
  setField('20% lipid', 2);
  setField('KCl', 2);
  setField('ZnSO₄', 0.5);
  setField('Volume(mL/feed)', 12);
  setField('Frequency', 8);
}
const savedRow = (calcInput) => ({ entryId: 'e-old', lastModified: 'lm-old', ts: '2026-10-31', dol: 9, weight: 1000,
  status: 'submitted', calcInput: { ...calcInput, constantsVersion: window.NEOFEED_DATA.CONSTANTS_VERSION } });

(async () => {
  section('1 · the tick sits in Step 3\'s header and skips the step');
  mount(); fillRequired(); fillBag();
  ok('Step 3 has a "ไม่มี TPN" tick, unticked', !!noTpnBox() && noTpnBox().checked === false);
  ok('…inside the header\'s right-hand group (top right)', !!step3Head()?.querySelector('.step3-right label.no-tpn-chk'));
  ok('the bag is on screen: TPN Aqueous Pump and the route', text(container).includes('TPN Aqueous Pump') && !!container.querySelector('.step2-ctrl'));
  setNoTpn(true);
  ok('ticked', noTpnBox().checked === true);
  ok('pressing it did not fold Step 3 (the click stays in the tick)', text(container).includes('ไม่มี TPN วันนี้'));
  ok('the two pumps are gone, the note stands in', !text(container).includes('TPN Aqueous Pump') && !text(container).includes('Lipid Pump'));
  ok('no route and no Osm chip in the header', !container.querySelector('.step2-ctrl'));
  ok('Step 3\'s dot reads done', dotOf(step3Head()) === 'done', dotOf(step3Head()));
  ok('Step 4\'s dot reads done (no bag to fill)', dotOf(step4Head()) === 'done', dotOf(step4Head()));
  ok('the toast names what it cleared', toast === 'ไม่มี TPN — ล้าง TPN volume, Dextrose, Amino acid, 20% lipid, KCl, ZnSO₄ แล้ว (เอาติ๊กออกเพื่อคืนค่า)', toast);
  ok('Step 4\'s KCl box is empty', ['', '0'].includes(inputOf('KCl')?.value), inputOf('KCl')?.value);
  ok('the bag left the fluid: Prescribed is the feed alone', text(container).includes('Plan 150 · Prescribed 96 mL/d'));
  ok('the feeds reach 80: the note says so', text(container).includes('นมที่นับได้ 96 mL/kg/d · ต้องได้อย่างน้อย 80 mL/kg/d (เกณฑ์ 80 mL/kg/d) — ถึงแล้ว'));

  section('2 · unticking it in the same visit puts the bag back');
  setNoTpn(false);
  ok('unticked; the pumps are back', noTpnBox().checked === false && text(container).includes('TPN Aqueous Pump'));
  ok('Volume 100, Dextrose 10, Amino acid 3, 20% lipid 2',
    ['Volume(mL/day)', 'Dextrose final', 'Amino acid', '20% lipid'].map(l => inputOf(l)?.value).join() === '100,10,3,2',
    ['Volume(mL/day)', 'Dextrose final', 'Amino acid', '20% lipid'].map(l => inputOf(l)?.value));
  ok('KCl 2 and ZnSO₄ 0.5', inputOf('KCl')?.value === '2' && inputOf('ZnSO₄')?.value === '0.5', [inputOf('KCl')?.value, inputOf('ZnSO₄')?.value]);
  ok('Prescribed counts the bag again', !text(container).includes('Prescribed 96 mL/d'));
  setNoTpn(true); setNoTpn(false); setNoTpn(true);
  ok('tick, untick, tick: the bag is cleared again', !text(container).includes('TPN Aqueous Pump') && ['', '0'].includes(inputOf('KCl')?.value));

  section('3 · the order saves with the tick');
  let submit = button('Submit');
  ok('Submit is enabled (no bag, so no route is needed)', !!submit && !submit.disabled);
  if (submit && !submit.disabled) await clickAsync(submit);
  const ci = logged[0]?.calcInput || {};
  ok('saved once', logged.length === 1, logged.length);
  ok('calcInput.noTpn is true', ci.noTpn === true, ci.noTpn);
  ok('…and every bag ingredient is 0', [ci.totalTPN_mL, ci.dexPct, ci.aaPerKg, ci.lipidPerKg, ci.kCl, ci.znPerKg].every(v => v === 0),
    [ci.totalTPN_mL, ci.dexPct, ci.aaPerKg, ci.lipidPerKg, ci.kCl, ci.znPerKg]);
  ok('…and no stop went with it', Array.isArray(ci.stops) && ci.stops.length === 0, ci.stops);

  section('4 · it reopens ticked, and a new day copied from it starts ticked');
  const ticked = savedRow({ ...ci });
  mount({ editEntry: ticked });
  ok('the saved order reopens ticked, with the note', noTpnBox()?.checked === true && text(container).includes('ไม่มี TPN วันนี้'));
  mount({ baselineEntry: ticked });
  ok('a new day copied from it starts ticked', noTpnBox()?.checked === true);
  mount({ editEntry: savedRow({ curWtG: 1000, fluidTargetPerKg: 150, otherIV_mL: 0, drug_mL: 0, totalTPN_mL: 0, enType: 'BM_20', enVol: 12, enFreq: 8 }) });
  ok('a feeds-only row saved before the tick existed reopens unticked', noTpnBox()?.checked === false);

  section('5 · the changes list names it');
  const before = savedRow({ curWtG: 1000, fluidTargetPerKg: 150, route: 'central', totalTPN_mL: 100, dexPct: 10, aaPerKg: 3, enType: 'BM_20', enVol: 12, enFreq: 8 });
  mount({ baselineEntry: before, previousEntry: before });
  setNoTpn(true);
  // Read as "name: old → new unit" lines, from the list or, once PR #205's
  // table is in, from its rows.
  const rows = [...container.querySelectorAll('.order-changes tbody tr')];
  const changes = rows.length ? rows.map(tr => {
    const [name, from, , to, unit] = [...tr.cells].map(td => text(td));
    return `${name}: ${from} → ${to}${unit ? ' ' + unit : ''}`;
  }).join(' · ') : text(container.querySelector('.order-changes'));
  ok('"No TPN: no → yes"', changes.includes('No TPN: no → yes'), changes);
  ok('…beside "TPN volume: 100 → 0"', changes.includes('TPN volume: 100 → 0 mL/d'), changes);

  section('6 · Center Point offers no tick');
  const centerPoint = { save: () => Promise.resolve({ sourceRecordId: 'x', recordedAt: '2026-11-01T08:00:00.000Z' }), review() {}, failed() {} };
  mount({ centerPoint, patient: { sessionId: '6f1c2f4e-2b7a-4c1e-9d55-0c8f0e6b1a11', bw: 1200, ga: 28, weights: [] } });
  ok('no "ไม่มี TPN" tick', !noTpnBox());
  ok('the pumps are on screen', text(container).includes('TPN Aqueous Pump'));
  mount({ centerPoint, editEntry: ticked });
  ok('a row carrying the tick is read there as unticked: the pumps stay', text(container).includes('TPN Aqueous Pump') && !text(container).includes('ไม่มี TPN วันนี้'));

  act(() => { root.unmount(); });
  console.log(`\nNO TPN TICK (2026-11-01): ${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed)`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
