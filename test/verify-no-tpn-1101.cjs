// verify-no-tpn-1101.cjs — the "No TPN" tick at the top right of Step 3
// (Pp, 2026-11-01: "มุมติ๊กขวาบน ช่อง tpn ว่า ไม่มี tpn เพื่อให้ข้ามช่องนี้ได้",
// then "ขอเป็นภาษาอังกฤษ no TPN", "คำอธิบาย ไม่ต้องใส่").
//
// What the clinical-rules skill's cases cannot reach, because they mount one
// fresh order each: the tick clears the bag, and unticking it in the same visit
// puts back what is still empty (a dose typed since is kept, Vera 2026-11-01);
// an order with no TPN cannot be submitted until it is ticked
// (CR-NO-TPN-TICK); the order saves with calcInput.noTpn and reopens ticked; a
// new day copied from a ticked order starts ticked; the changes list names it;
// a submitted row saved before the tick existed with no TPN reopens ticked, a
// draft unticked; Center Point offers no tick. What the feeds must reach is CR-NO-TPN-EN, and its cases run in
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
  ok('Step 3 has a tick labelled "No TPN", unticked', !!noTpnBox() && noTpnBox().checked === false
    && noTpnBox().closest('label').textContent.trim() === 'No TPN');
  ok('…inside the header\'s right-hand group (top right)', !!step3Head()?.querySelector('.step3-right label.no-tpn-chk'));
  ok('the bag is on screen: TPN Aqueous Pump and the route', text(container).includes('TPN Aqueous Pump') && !!container.querySelector('.step2-ctrl'));
  setNoTpn(true);
  ok('ticked', noTpnBox().checked === true);
  ok('pressing it did not fold Step 3 (the click stays in the tick)', !!container.querySelector('.accordion-body.open .metric-tiles-4'));
  ok('the two pumps are gone, and no note stands in', !text(container).includes('TPN Aqueous Pump') && !text(container).includes('Lipid Pump')
    && !container.querySelector('.no-tpn-note'));
  ok('no route and no Osm chip in the header', !container.querySelector('.step2-ctrl'));
  ok('Step 3\'s dot reads done', dotOf(step3Head()) === 'done', dotOf(step3Head()));
  ok('Step 4\'s dot reads done (no bag to fill)', dotOf(step4Head()) === 'done', dotOf(step4Head()));
  ok('the toast names what it cleared', toast === 'No TPN: ล้าง TPN volume, Dextrose, Amino acid, 20% lipid, KCl, ZnSO₄', toast);
  ok('Step 4\'s KCl box is empty', ['', '0'].includes(inputOf('KCl')?.value), inputOf('KCl')?.value);
  ok('the bag left the fluid: Prescribed is the feed alone', text(container).includes('Plan 150 · Prescribed 96 mL/d'));
  ok('the feeds (96 mL/kg/d) reach 80: no critical line', !text(container).includes("No TPN: feeds below 80 mL/kg/d or the day's minimum"));

  section('2 · unticking it in the same visit puts the bag back');
  toast = null;
  setNoTpn(false);
  ok('the toast names what it put back', toast === 'คืนค่า TPN volume, Dextrose, Amino acid, 20% lipid, KCl, ZnSO₄', toast);
  ok('unticked; the pumps are back', noTpnBox().checked === false && text(container).includes('TPN Aqueous Pump'));
  ok('Volume 100, Dextrose 10, Amino acid 3, 20% lipid 2',
    ['Volume(mL/day)', 'Dextrose final', 'Amino acid', '20% lipid'].map(l => inputOf(l)?.value).join() === '100,10,3,2',
    ['Volume(mL/day)', 'Dextrose final', 'Amino acid', '20% lipid'].map(l => inputOf(l)?.value));
  ok('KCl 2 and ZnSO₄ 0.5', inputOf('KCl')?.value === '2' && inputOf('ZnSO₄')?.value === '0.5', [inputOf('KCl')?.value, inputOf('ZnSO₄')?.value]);
  ok('Prescribed counts the bag again', !text(container).includes('Prescribed 96 mL/d'));
  setNoTpn(true); setNoTpn(false); setNoTpn(true);
  ok('tick, untick, tick: the bag is cleared again', !text(container).includes('TPN Aqueous Pump') && ['', '0'].includes(inputOf('KCl')?.value));
  // Vera, 2026-11-01: a dose typed after the tick is the prescriber's, and
  // unticking must not put yesterday's back over it.
  setField('KCl', 3);
  toast = null;
  setNoTpn(false);
  ok('KCl typed as 3 after the tick stays 3 when the tick comes off', inputOf('KCl')?.value === '3', inputOf('KCl')?.value);
  ok('…the rest comes back, and the toast leaves KCl out', inputOf('Volume(mL/day)')?.value === '100'
    && toast === 'คืนค่า TPN volume, Dextrose, Amino acid, 20% lipid, ZnSO₄', toast);
  setField('KCl', 2);
  setNoTpn(true);

  section('3 · an order with no TPN needs the tick (CR-NO-TPN-TICK)');
  setNoTpn(false);
  for (const l of ['Volume(mL/day)', 'Dextrose final', 'Amino acid', '20% lipid', 'KCl', 'ZnSO₄']) setField(l, 0);
  let submit = button('Submit');
  ok('feeds only, the tick off: Submit is disabled', !!submit && submit.disabled);
  ok('…and the save panel says why', text(container.querySelector('.no-tpn-unticked')) === 'คำสั่งนี้ไม่มี TPN — ติ๊ก "No TPN" ที่ Step 3 ก่อน Submit',
    text(container.querySelector('.no-tpn-unticked')));
  const draft = container.querySelector('button.save-draft');
  ok('a draft can still be kept', !!draft && !draft.disabled);
  if (draft && !draft.disabled) await clickAsync(draft);
  ok('…and it names CR-NO-TPN-TICK for the backend', (logged[0]?.calcInput?.stops || []).includes('CR-NO-TPN-TICK'), logged[0]?.calcInput?.stops);
  setNoTpn(true);
  ok('ticked: the line is gone', !container.querySelector('.no-tpn-unticked'));

  section('4 · the order saves with the tick');
  submit = button('Submit');
  ok('Submit is enabled (no bag, so no route is needed)', !!submit && !submit.disabled);
  if (submit && !submit.disabled) await clickAsync(submit);
  const ci = (updated[0] || logged[1])?.calcInput || {};
  ok('saved: the draft, then the order', logged.length + updated.length === 2, [logged.length, updated.length]);
  ok('calcInput.noTpn is true', ci.noTpn === true, ci.noTpn);
  ok('…and every bag ingredient is 0', [ci.totalTPN_mL, ci.dexPct, ci.aaPerKg, ci.lipidPerKg, ci.kCl, ci.znPerKg].every(v => v === 0),
    [ci.totalTPN_mL, ci.dexPct, ci.aaPerKg, ci.lipidPerKg, ci.kCl, ci.znPerKg]);
  ok('…and no stop went with it', Array.isArray(ci.stops) && ci.stops.length === 0, ci.stops);
  // Pp, 2026-11-01: "ถ้า ไม่มี tpn เราก็จะไม่ปริ้นท order" — and the app never prints one.
  ok('the saved No TPN order has no print form', !container.querySelector('#print-form'));
  ok('…and no red "held from Print" line', !container.querySelector('.print-blocked'));
  toast = null;
  let printed = 0; window.print = () => { printed++; };
  act(() => { document.dispatchEvent(new window.Event('__neofeed_print')); });
  ok('Print says there is no TPN order to print, and prints nothing', toast === 'No TPN — ไม่มีใบสั่ง TPN ให้พิมพ์' && printed === 0, { toast, printed });
  window.print = () => {};

  section('5 · it reopens ticked, and a new day copied from it starts ticked');
  const ticked = savedRow({ ...ci });
  mount({ editEntry: ticked });
  ok('the saved order reopens ticked, with no pumps', noTpnBox()?.checked === true && !text(container).includes('TPN Aqueous Pump'));
  mount({ baselineEntry: ticked });
  ok('a new day copied from it starts ticked', noTpnBox()?.checked === true);
  // A row saved before the tick existed has no noTpn key (withLegacyNoTpn).
  const legacyFeeds = { curWtG: 1000, fluidTargetPerKg: 150, otherIV_mL: 0, drug_mL: 0, totalTPN_mL: 0, enType: 'BM_20', enVol: 12, enFreq: 8 };
  mount({ editEntry: savedRow(legacyFeeds) });
  ok('a submitted feeds-only row saved before the tick existed reopens ticked', noTpnBox()?.checked === true);
  ok('…so no stop holds it, and as a No TPN order it is not printed', !container.querySelector('.no-tpn-unticked') && !container.querySelector('#print-form'));
  mount({ editEntry: { ...savedRow(legacyFeeds), status: 'draft' } });
  ok('the same row as a draft reopens unticked (its TPN may not be filled in yet)', noTpnBox()?.checked === false);
  mount({ editEntry: savedRow({ ...legacyFeeds, totalTPN_mL: 100, dexPct: 10, aaPerKg: 3, route: 'central' }) });
  ok('a submitted row with a bag reopens unticked', noTpnBox()?.checked === false);
  mount({ editEntry: { ...savedRow({}), calcInput: {} } });
  ok('a row whose calcInput is empty (missing data, not a day without TPN) reopens unticked', noTpnBox()?.checked === false);

  section('6 · the changes list names it');
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

  section('7 · a salt typed with the tick on, on a first order with no route');
  // Review of 2026-11-01: the route stop pointed at buttons the tick hides.
  mount(); fillRequired();
  setField('Volume(mL/feed)', 12); setField('Frequency', 8);
  setNoTpn(true);
  setField('KCl', 2);
  ok('no route stop: the tick hides the route buttons', !container.querySelector('.route-missing-save'), text(container.querySelector('.route-missing-save')));
  ok('…the no-volume stop holds, and points at the tick', /เอาติ๊ก "No TPN" ออกแล้วใส่ปริมาตร/.test(text(container.querySelector('.zero-volume-bag'))),
    text(container.querySelector('.zero-volume-bag')));
  ok('…and Submit is disabled', button('Submit')?.disabled === true);

  section('8 · the short sheet: oral orders, and the day TPN stopped');
  // Pp, 2026-11-01: a No TPN order prints a short sheet for its oral orders, and
  // on the first No TPN day after a day with TPN; otherwise nothing prints.
  const sheet = () => container.querySelector('#print-form');
  // Print waits two animation frames before window.print (calculator.jsx).
  const printNow = async () => { let n = 0; window.print = () => { n++; }; toast = null;
    await act(async () => { document.dispatchEvent(new window.Event('__neofeed_print')); await new Promise(r => setTimeout(r, 30)); });
    window.print = () => {}; return n; };
  const feedsTicked = () => { fillRequired(); setField('Volume(mL/feed)', 12); setField('Frequency', 8); setNoTpn(true); };
  mount(); feedsTicked(); setField('Vitamin D', 400);
  await clickAsync(button('Submit'));
  let f = text(sheet());
  ok('No TPN with vitamin D: a short sheet prints', !!sheet() && /No TPN — ไม่มี TPN วันนี้/.test(f), f.slice(0, 120));
  ok('…with the oral order under "8. Other"', /8\. Other.*Vitamin D drops 400 IU\/kg\/d = 400 IU\/day/.test(f), f.match(/8\. Other.{0,80}/));
  ok('…the patient first (its first table names the NeoFeed ID)', /NeoFeed ID:\s*NT-1101/.test(text(sheet().querySelector(':scope > table'))));
  ok('…and no TPN lines, vitamins, heparin or pharmacy back; the route reads "— (No TPN)"',
    !/PARENTERAL NUTRITION FLUID|Soluvit|Heparin|☑ (Central|Peripheral)/.test(f) && /Route of Delivery: — \(No TPN\)/.test(f) && !sheet().querySelector('.print-back'), f.slice(0, 260));
  ok('…no "TPN stopped" (no TPN day before it)', !/TPN stopped/.test(f));
  ok('…and Print prints it', (await printNow()) === 1);
  const tpnDay = savedRow({ curWtG: 1000, fluidTargetPerKg: 150, otherIV_mL: 0, drug_mL: 0, route: 'central', totalTPN_mL: 100, dexPct: 10, aaPerKg: 3 });
  mount({ previousEntry: tpnDay }); feedsTicked();
  await clickAsync(button('Submit'));
  f = text(sheet());
  ok('the first No TPN day after a TPN day, no orals: the short sheet says TPN stopped', !!sheet() && /หยุด TPN ตั้งแต่วันนี้ \(TPN stopped\)/.test(f), f.slice(0, 160));
  ok('…and Print prints it', (await printNow()) === 1);
  const noTpnDay = savedRow({ curWtG: 1000, fluidTargetPerKg: 150, otherIV_mL: 0, drug_mL: 0, totalTPN_mL: 0, noTpn: true, enVol: 12, enFreq: 8 });
  mount({ previousEntry: noTpnDay }); feedsTicked();
  await clickAsync(button('Submit'));
  ok('a No TPN day after a No TPN day, no orals: nothing prints', !sheet() && (await printNow()) === 0 && toast === 'No TPN — ไม่มีใบสั่ง TPN ให้พิมพ์', { sheet: !!sheet(), toast });

  section('9 · Center Point offers no tick');
  const centerPoint = { save: () => Promise.resolve({ sourceRecordId: 'x', recordedAt: '2026-11-01T08:00:00.000Z' }), review() {}, failed() {} };
  mount({ centerPoint, patient: { sessionId: '6f1c2f4e-2b7a-4c1e-9d55-0c8f0e6b1a11', bw: 1200, ga: 28, weights: [] } });
  ok('no "ไม่มี TPN" tick', !noTpnBox());
  ok('the pumps are on screen', text(container).includes('TPN Aqueous Pump'));
  mount({ centerPoint, editEntry: ticked });
  ok('a row carrying the tick is read there as unticked: the pumps stay', text(container).includes('TPN Aqueous Pump'));
  ok('…and no No-TPN stop holds there', !container.querySelector('.no-tpn-unticked'));
  // Vera, third review: the no-volume line must not offer a tick Center Point has not got.
  mount({ centerPoint, patient: { sessionId: '6f1c2f4e-2b7a-4c1e-9d55-0c8f0e6b1a11', bw: 1200, ga: 28, weights: [] } });
  setField('Current weight', 1200); setField('KCl', 2);
  const cpZero = text(container.querySelector('.zero-volume-bag'));
  ok('no TPN volume with KCl: the no-volume line, with no tick to offer', cpZero.includes('ปริมาตร TPN = 0') && !cpZero.includes('ติ๊ก "No TPN"'), cpZero);

  act(() => { root.unmount(); });
  console.log(`\nNO TPN TICK (2026-11-01): ${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed)`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
