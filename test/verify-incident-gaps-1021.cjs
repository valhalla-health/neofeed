// verify-incident-gaps-1021.cjs — two gaps Pp found by checking the slips the
// TPN pharmacy phones doctors about on paper orders against NeoFeed (her
// counts stay in her private product notes). Pp, 2026-10-21: "warn เมื่อมีถุง
// TPN แต่ amino acid หรือ MgSO4 เป็น 0 และให้ใบแรกของเด็กต้องเลือก route เอง".
//
// On paper a blank box makes the pharmacist phone the doctor. In NeoFeed a box
// is never blank: 0 reads as "not ordered" and prints "—", and the route
// started as Central, so the same slip reached the bag with nobody asking.
//
//   §1  A bag with volume and amino acid 0 raises the caution "Amino acid not
//       ordered"; MgSO₄ 0 raises "MgSO₄ not ordered". Neither appears without a
//       bag, and neither stops Submit or asks for a reason (they are cautions).
//   §2  An infant's first order (no earlier order) starts with no route: neither
//       button is on, the Step 3 header and the save panel say so, and Submit
//       stays disabled until Peripheral or Central is pressed. The choice saves
//       and prints.
//   §3  A new order copies the route of the order before it, so only the first
//       order asks; an edit keeps its own route; a row saved before this change
//       with no route in calcInput still opens as Central.
//   §4  An order with no bag (NPO) needs no route: it submits with none, saves
//       route null, prints neither box ticked, copies "Route: —", and the next
//       order made from it asks for the route again.
//   §5  A draft may be kept without a route. It logs "TPN", reopens without a
//       route, and still cannot be submitted until one is chosen.
//   §6  The quick calc keeps Central: it saves nothing, so there is no first order.
//
// 45 checks; against d9c815c 23 fail. Those that pass there pin what already
// held: no caution without a bag, an old row opening as Central, the quick calc.
// Mounts the real <Calculator> in jsdom — the deps in test/README.md.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';
const R = (f) => fs.readFileSync(DIR + f, 'utf8');

let pass = 0, fail = 0, n = 0;
function eq(name, got, want) {
  const yes = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${yes ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(72)}${yes ? '' : ` got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
  yes ? pass++ : fail++;
}
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(72)}${cond ? '' : '  ' + JSON.stringify(detail ?? '')}`);
  cond ? pass++ : fail++;
}
async function section(title, fn) {
  console.log(`\n── ${title} ──`);
  try { await fn(); } catch (e) { ok(`(section ran to the end) ${e.message}`, false, e.stack.split('\n').slice(0, 3)); }
}

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
global.showToast = () => {};
window.print = () => {};
window.confirm = () => true;
let copied = null;
for (const nav of new Set([window.navigator, globalThis.navigator].filter(Boolean))) {
  Object.defineProperty(nav, 'clipboard', { configurable: true,
    value: { writeText: (t) => { copied = t; return Promise.resolve(); } } });
}
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
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
const fieldOf = (label) => [...container.querySelectorAll('.field')].find(d => d.querySelector('label')?.textContent.startsWith(label)) || null;
const saltRow = (label) => [...container.querySelectorAll('.salt-row-grid')]
  .find(d => d.firstElementChild?.firstElementChild?.textContent.startsWith(label)) || null;
function inputFor(label) {
  const field = fieldOf(label);
  if (field) return field.querySelector('input');
  const row = saltRow(label);
  return row ? row.querySelector('input') : null;
}
function setField(label, value) {
  const input = inputFor(label);
  if (!input) throw new Error('field not found: ' + label);
  act(() => { valueSetter.call(input, String(value)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
const click = (el) => act(() => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const clickAsync = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const button = (re) => [...container.querySelectorAll('button')].find(b => re.test(b.textContent.trim())) || null;
const submitBtn = () => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Submit') || null;
const draftBtn = () => container.querySelector('button.save-draft');
const fillRequired = (tf) => ['Target fluid', 'Other IV', 'Drug volume', 'Input', 'Urine output', 'Drain content']
  .forEach(l => setField(l, l === 'Target fluid' ? tf : 0));
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const printText = () => text(container.querySelector('#print-form'));
const alertRows = () => [...container.querySelectorAll('.calc-bottom .alert-row')].map(a => ({
  level: ['crit', 'warn', 'info'].find(c => a.classList.contains(c)),
  title: a.querySelector('.title')?.textContent || '' }));
const alertNamed = (title) => alertRows().find(a => a.title === title) || null;
const routeButtons = () => [...container.querySelectorAll('.step2-ctrl .seg button')];
const routeOn = () => routeButtons().filter(b => b.classList.contains('on')).map(b => b.textContent.trim());
const routeBtn = (name) => routeButtons().find(b => b.textContent.trim() === name);
const routeNotice = () => container.querySelector('.route-missing');
const routeSaveNote = () => container.querySelector('.route-missing-save');

const AA0 = 'Amino acid not ordered';
const MG0 = 'MgSO₄ not ordered';

const BASE = { dol: 5, editEntry: null, baselineEntry: null, previousEntry: null, logDate: '2026-10-21',
  userLabel: 'Dr Test (doc@kcmh.test)', onUpdate() { return Promise.resolve({ ok: true, lastModified: 'lm-u' }); },
  onSaved() {}, onWeightChange() {} };
function mount(props) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear();
  copied = null;
  act(() => { root.render(React.createElement(window.Calculator, { ...BASE, ...props })); });
  act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
}
function logger() {
  const box = { entry: null, calls: 0 };
  box.onLog = (e) => { box.entry = e; box.calls++; return Promise.resolve({ ok: true, entryId: 'e-' + box.calls, lastModified: 'lm-' + box.calls }); };
  return box;
}
// A caution never asks for a reason: any prompt here is a failure.
const noPrompt = () => { window.prompt = () => { throw new Error('a reason was asked for'); }; };
// Synthetic infants only (no real identifiers).
const pt = (sid, bw) => ({ sessionId: sid, name: sid.slice(0, 2), bw, currentBed: 'NICU 5', diagnosis: '-',
  weights: [{ dol: 1, w: bw }], admissionDate: '2026-10-16' });
// A 1.5 kg infant, TPN 150 mL/d delivered, amino acid and MgSO₄ both ordered.
function bagOrder() {
  setField('Current weight', 1500); fillRequired(150);
  setField('Volume(mL/day)', 150);
  setField('Dextrose final', 10); setField('Amino acid', 3); setField('MgSO₄', 0.3);
}
// Nothing in the bag and no volume: an NPO day.
function npoOrder() {
  setField('Current weight', 1500); fillRequired(150);
  setField('Volume(mL/day)', 0); setField('Dextrose final', 0); setField('Amino acid', 0); setField('MgSO₄', 0);
}
// A saved row as the backend would hand it back the next day.
const asSaved = (entry, extra) => ({ ...entry, entryId: 'e-1', lastModified: 'lm-1', ts: '2026-10-20', dol: 4, ...extra });

(async () => {
  // ═════════════════════ §1 amino acid or MgSO₄ at 0 with a bag ════════════
  await section('§1 a bag with amino acid or MgSO₄ at 0 raises a caution, never a stop', async () => {
    const box = logger();
    mount({ patient: pt('AA-1500', 1500), onLog: box.onLog });
    if (routeBtn('Central')) click(routeBtn('Central'));
    bagOrder();
    ok('amino acid 3 and MgSO₄ 0.3: neither caution', !alertNamed(AA0) && !alertNamed(MG0), alertRows());
    setField('Amino acid', 0);
    eq('amino acid 0 with a 150 mL bag → "Amino acid not ordered"', alertNamed(AA0)?.level, 'warn');
    setField('Amino acid', 3); setField('MgSO₄', 0);
    eq('MgSO₄ 0 with a 150 mL bag → "MgSO₄ not ordered"', alertNamed(MG0)?.level, 'warn');
    ok('…and the amino acid caution has gone', !alertNamed(AA0), alertRows());
    setField('Amino acid', 0);
    ok('both at 0 → both cautions', !!alertNamed(AA0) && !!alertNamed(MG0), alertRows());
    noPrompt();
    await clickAsync(submitBtn());
    eq('a caution does not stop Submit: the order is logged', box.calls, 1);
    ok('…and no critical-value reason was saved with it', !box.entry?.calcInput?.critOverride, box.entry?.calcInput?.critOverride);
    setField('Dextrose final', 0); setField('Volume(mL/day)', 0);
    ok('no bag (volume 0, nothing in it): neither caution', !alertNamed(AA0) && !alertNamed(MG0), alertRows());
  });

  // ═════════════════════ §2 the first order chooses its route ══════════════
  let peripheralEntry = null;
  await section('§2 an infant\'s first order starts with no route and cannot be submitted without one', async () => {
    const box = logger();
    mount({ patient: pt('RT-1500', 1500), onLog: box.onLog });
    eq('neither route button is on', routeOn(), []);
    ok('the Step 3 header says the route is not chosen', /route/i.test(text(routeNotice())), text(routeNotice()));
    bagOrder();
    eq('every required box filled, a bag ordered: Submit is still disabled', submitBtn()?.disabled, true);
    ok('…and the save panel says why', /route/i.test(text(routeSaveNote())), text(routeSaveNote()));
    noPrompt();
    await clickAsync(submitBtn());
    eq('a click on the disabled Submit logs nothing', box.calls, 0);
    click(routeBtn('Peripheral'));
    eq('Peripheral pressed: it is the one route on', routeOn(), ['Peripheral']);
    ok('the header notice has gone', !routeNotice(), text(routeNotice()));
    ok('…and so has the save-panel line', !routeSaveNote(), text(routeSaveNote()));
    eq('Submit is enabled', submitBtn()?.disabled, false);
    await clickAsync(submitBtn());
    eq('the order is logged', box.calls, 1);
    eq('Daily_Log route: "TPN peripheral"', box.entry?.route, 'TPN peripheral');
    eq('calcInput carries the choice', box.entry?.calcInput?.route, 'peripheral');
    ok('the printed order ticks Peripheral', /☑ Peripheral/.test(printText()) && /☐ Central/.test(printText()), printText().match(/Route of Delivery.{0,60}/));
    peripheralEntry = box.entry;
  });

  // ═════════════════════ §3 later orders, edits and old rows ═══════════════
  await section('§3 a new order copies the route before it; an edit keeps its own; an old row opens Central', async () => {
    if (!peripheralEntry) throw new Error('§2 saved no order to start from');
    const box = logger();
    const prev = asSaved(peripheralEntry);
    mount({ patient: pt('RT-1500', 1500), onLog: box.onLog, baselineEntry: prev, previousEntry: prev });
    eq('the next day\'s order starts on Peripheral', routeOn(), ['Peripheral']);
    ok('…with no route notice', !routeNotice(), text(routeNotice()));
    fillRequired(150);
    eq('…and Submit is enabled once the day\'s boxes are filled', submitBtn()?.disabled, false);

    mount({ patient: pt('RT-1500', 1500), onLog: box.onLog, editEntry: asSaved(peripheralEntry, { ts: '2026-10-21', dol: 5 }), previousEntry: null });
    eq('editing the saved order: Peripheral, as saved', routeOn(), ['Peripheral']);

    const legacyInput = { ...peripheralEntry.calcInput };
    delete legacyInput.route;
    mount({ patient: pt('RT-1500', 1500), onLog: box.onLog, editEntry: asSaved(peripheralEntry, { ts: '2026-10-21', dol: 5, calcInput: legacyInput }), previousEntry: null });
    eq('a row saved with no route in calcInput still opens as Central', routeOn(), ['Central']);
  });

  // ═════════════════════ §4 no bag, no route ═══════════════════════════════
  await section('§4 an order with no bag needs no route, and the next order asks again', async () => {
    const box = logger();
    mount({ patient: pt('NPO-1500', 1500), onLog: box.onLog });
    npoOrder();
    eq('NPO, no route chosen: Submit is enabled', submitBtn()?.disabled, false);
    ok('…and the save panel asks for nothing about the route', !routeSaveNote(), text(routeSaveNote()));
    noPrompt();
    await clickAsync(submitBtn());
    eq('the order is logged', box.calls, 1);
    eq('Daily_Log route: "NPO"', box.entry?.route, 'NPO');
    eq('calcInput route: null — none was chosen', box.entry?.calcInput?.route, null);
    ok('the printed order ticks neither route', /☐ Peripheral/.test(printText()) && /☐ Central/.test(printText()) && !/☑ (Peripheral|Central)/.test(printText()),
      printText().match(/Route of Delivery.{0,60}/));
    await clickAsync(button(/Copy Order to Clipboard/));
    ok('the copied order says "Route: —"', /Route: —/.test(copied || ''), (copied || '').match(/Route:.{0,30}/));
    const prev = asSaved(box.entry);
    mount({ patient: pt('NPO-1500', 1500), onLog: logger().onLog, baselineEntry: prev, previousEntry: prev });
    eq('the next order, made from the NPO day: no route on', routeOn(), []);
    ok('…and the header asks for one', !!routeNotice(), container.querySelector('.step2-ctrl')?.textContent);
    bagOrder();
    eq('…so a bag on it cannot be submitted until one is chosen', submitBtn()?.disabled, true);
    click(routeBtn('Central'));
    ok('the change list reads "Route —→central"', /Route —→central/.test(printText()) || /Route[^A-Za-z]{0,6}—[^A-Za-z]{0,6}central/.test(text(container)),
      text(container).match(/Route[^A-Za-z]{0,20}(central|peripheral)/));
  });

  // ═════════════════════ §5 drafts ═════════════════════════════════════════
  await section('§5 a draft may be kept without a route, and still asks for one at Submit', async () => {
    const box = logger();
    mount({ patient: pt('DR-1500', 1500), onLog: box.onLog });
    bagOrder();
    await clickAsync(draftBtn());
    eq('Save draft works with no route', box.calls, 1);
    eq('Daily_Log route of the draft: "TPN"', box.entry?.route, 'TPN');
    eq('calcInput route: null', box.entry?.calcInput?.route, null);
    mount({ patient: pt('DR-1500', 1500), onLog: box.onLog,
      editEntry: { ...box.entry, entryId: 'e-1', lastModified: 'lm-1', ts: '2026-10-21' }, previousEntry: null });
    eq('the reopened draft: no route on', routeOn(), []);
    fillRequired(150);
    eq('…and Submit stays disabled until one is chosen', submitBtn()?.disabled, true);
    click(routeBtn('Central'));
    eq('Central pressed: Submit enabled', submitBtn()?.disabled, false);
  });

  // ═════════════════════ §6 quick calc ═════════════════════════════════════
  await section('§6 the quick calc still starts on Central', async () => {
    mount({ patient: { sessionId: null, name: null, bw: 0, ga: 0, sex: '', currentBed: '', diagnosis: '', weights: [] },
      scratch: true, logDate: null, onLog: undefined });
    eq('Central is on', routeOn(), ['Central']);
    ok('no route notice', !routeNotice(), text(routeNotice()));
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
