// verify-stock-ml-1027.cjs — every stock mL to one decimal, half up, and an
// ordered stock that rounds to 0 mL cannot be submitted (Pp, 2026-10-27:
// "ของจริง นับทศนิยม 1 ตำแหน่ง เช่น 1.25 > 1.3 ml"). CHANGELOG 2026-10-27.
//
//   §1  roundMl: 1.25 → 1.3, and the x.x5 values toFixed(1) rounded down
//       (0.35 is stored as 0.34999…, so toFixed read it as 0.3); displayNum
//       rounds a float-noise tie up too (1.5 × 0.7 = 1.0499999999999998);
//   §2  a 700 g order with no dead space (Factor 0.7) prints KCl 0.35 as 0.4,
//       and K₂HPO₄, MgSO₄, ZnSO₄ and heparin at one decimal on the back sheet
//       (they had two), K₂HPO₄ and MgSO₄ on the front sheet too;
//   §2b K₂HPO₄ 1.5 mEq/kg at Factor 0.7: a 1 mEq/mL stock shows one number
//       twice, "1.1 mEq = 1.1 mL" (it read "1 mEq = 1.1 mL"; Vera);
//   §3  ZnSO₄ 0.05 mg/kg at Factor 0.7 is 0.035 mL, which prints as 0: a red
//       line, Submit disabled, the save panel says why, a draft may be kept;
//       0.1 mg/kg (0.07 → 0.1 mL) is orderable;
//   §4  no stock mL in calculator.jsx is rounded by toFixed any more;
//   §5  a row saved with mgStrength "50" carries over as 10%: no 50% on the
//       card, Submit enabled, MgSO₄ 10% printed (Pp: every order was 10%,
//       and the 50% path is gone);
//   §5b a submitted row that says 50%, reopened, prints MgSO₄ 10% too;
//   §5c the same row stamped 2026-10-27.1, as a production row is, is held
//       from Print until saved again, then prints MgSO₄ 10% (Vera).
//
// Every section fails on 83aefe4 (main with PR #170). Mounts the real
// <Calculator> in jsdom — the deps in test/README.md. Synthetic infants only.
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
const toasts = [];
global.showToast = (msg) => toasts.push(String(msg));
window.print = () => {};
window.confirm = () => true;
window.prompt = () => null;
{ const w = console.error; console.error = (...a) => { if (!/act\(|not wrapped|Not implemented/.test(String(a[0]))) w(...a); }; }
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
const submitBtn = () => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Submit') || null;
const draftBtn = () => container.querySelector('button.save-draft');
const fillRequired = (tf) => ['Target fluid', 'Other IV', 'Drug volume', 'Input', 'Urine output', 'Drain content']
  .forEach(l => setField(l, l === 'Target fluid' ? tf : 0));
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const alertRows = () => [...container.querySelectorAll('.calc-bottom .alert-row')].map(a => ({
  level: ['crit', 'warn', 'info'].find(c => a.classList.contains(c)),
  title: a.querySelector('.title')?.textContent || '', text: text(a) }));
const alertNamed = (title) => alertRows().find(a => a.title === title) || null;
const routeBtn = (name) => [...container.querySelectorAll('.step2-ctrl .seg button')].find(b => b.textContent.trim() === name);

// The back sheet's "Aqueous bag — stock" table: { stock name: printed mL text }.
function backSheetMl() {
  const form = container.querySelector('#print-form');
  if (!form) return null;
  const table = [...form.querySelectorAll('table')].find(t => /Aqueous bag — stock/.test(t.querySelector('thead')?.textContent || ''));
  if (!table) return null;
  const out = {};
  for (const tr of table.querySelectorAll('tbody tr')) {
    const tds = [...tr.querySelectorAll('td')];
    if (tds.length === 3 && tds[2].querySelector('strong')) out[tds[0].textContent.trim()] = tds[2].querySelector('strong').textContent.trim();
  }
  return out;
}

const BASE = { dol: 10, editEntry: null, baselineEntry: null, previousEntry: null, logDate: '2026-10-27',
  userLabel: 'Dr Test (doc@kcmh.test)', onUpdate() { return Promise.resolve({ ok: true, lastModified: 'lm-u' }); },
  onSaved() {}, onWeightChange() {} };
function logger() {
  const box = { entry: null, calls: 0 };
  box.onLog = (e) => { box.entry = e; box.calls++; return Promise.resolve({ ok: true, entryId: 'e-' + box.calls, lastModified: 'lm-' + box.calls }); };
  return box;
}
function mount(props) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear();
  act(() => { root.render(React.createElement(window.Calculator, { ...BASE, ...props })); });
  act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
}
const pt = (sid, bw) => ({ sessionId: sid, name: sid.slice(0, 2), bw, currentBed: 'NICU 5', diagnosis: '-',
  weights: [{ dol: 1, w: bw }], admissionDate: '2026-10-18' });

// 700 g, no dead space: Factor 0.7, so 1 mEq/kg of KCl is 0.7 mEq = 0.35 mL.
function order700(box, zn, k2 = 0.5) {
  mount({ patient: pt('SM-0700', 700), onLog: box.onLog });
  click(routeBtn('Central'));
  setField('Current weight', 700); fillRequired(150);
  setField('Volume(mL/day)', 70); setField('ปริมาตรคาสาย (dead space)', 0);
  setField('Dextrose final', 10); setField('Amino acid', 2.5);
  setField('KCl', 1); setField('K₂HPO₄', k2); setField('MgSO₄', 4.861);   // 0.4 mEq, typed in mg since 2026-10-28
  setField('10% Ca gluconate', 40); setField('Glycophos', 1);
  setField('ZnSO₄', zn); setField('Heparin', 0.5);
}

(async () => {
  await section('§1 roundMl: one decimal, half up', async () => {
    const roundMl = vm.runInThisContext('roundMl');
    for (const [v, want] of [[1.25, 1.3], [0.35, 0.4], [1.45, 1.5], [0.15, 0.2], [2.55, 2.6],
      [0.3499999999999999, 0.4], [1.3, 1.3], [0.05, 0.1], [0.04, 0], [0, 0], [87.25, 87.3]]) {
      eq(`roundMl(${v})`, roundMl(v), want);
    }
    ok('…where toFixed(1) read 0.35 as 0.3', (0.35).toFixed(1) === '0.3');
    eq('CONSTANTS_VERSION (2026-10-27.2 here; moved on by the 2026-10-28 meeting change)', window.NEOFEED_DATA.CONSTANTS_VERSION, '2026-10-28.1');
    const D = window.NEOFEED_DATA;
    eq('displayNum(1.5 × 0.7, 1): the float tie 1.0499999999999998 is 1.1', D.displayNum(1.5 * 0.7, 1), '1.1');
    eq('displayNum(1.005, 2)', D.displayNum(1.005, 2), '1.01');
    eq('displayNum(-1.25, 1): half away from zero', D.displayNum(-1.25, 1), '-1.3');
    eq('displayNum(18.0, 1): no trailing zero', D.displayNum(18.0, 1), '18');
  });

  await section('§2 a 700 g order prints every stock at one decimal', async () => {
    const box = logger();
    order700(box, 0.4);
    eq('no stock at 0 mL', container.querySelector('.stock-at-zero-ml'), null);
    eq('Submit is enabled', submitBtn()?.disabled, false);
    await clickAsync(submitBtn());
    eq('the order is logged', box.calls, 1);
    const ml = backSheetMl();
    ok('the back sheet is printable', !!ml, alertRows().filter(a => a.level === 'crit'));
    if (!ml) return;
    eq('KCl 0.7 mEq ÷ 2 = 0.35 mL prints 0.4 (was 0.3)', ml['KCl'], '0.4');
    eq('K₂HPO₄ 0.35 mL prints 0.4 (was 0.35)', ml['K₂HPO₄'], '0.4');
    eq('MgSO₄ 10% 0.28 ÷ 0.812 = 0.345 mL prints 0.3 (was 0.34)', ml['MgSO₄ 10%'], '0.3');
    eq('ZnSO₄ 0.28 mL prints 0.3 (was 0.28)', ml[Object.keys(ml).find(k => k.startsWith('ZnSO₄'))], '0.3');
    eq('heparin 35 U ÷ 100 = 0.35 mL prints 0.4 (was 0.35)', ml[Object.keys(ml).find(k => k.startsWith('Heparin'))], '0.4');
    const twoDecimals = Object.entries(ml).filter(([, t]) => /\.\d\d/.test(t));
    eq('no stock line has two decimals', twoDecimals, []);
    const front = text(container.querySelector('#print-form'));
    ok('front sheet: K₂HPO₄ 0.4 mL', /0\.4 mL/.test(front) && !/= 0\.35 mL/.test(front), front.slice(0, 200));
    ok('front sheet: MgSO₄ 0.3 mL (10%)', /= 0\.3 mL \(10%\)/.test(front));
  });

  await section('§2b a 1 mEq/mL stock shows one number twice', async () => {
    const box = logger();
    order700(box, 0.4, 1.5);
    await clickAsync(submitBtn());
    const t = text(container.querySelector('#print-form'));
    ok('the order prints', !!t, alertRows().filter(a => a.level === 'crit'));
    ok('front sheet: K₂HPO₄ "1.1 mEq = 1.1 mL" (1.5 × 0.7 = 1.05 mEq)', /1\.1 mEq = 1\.1 mL/.test(t), t.match(/[\d.]+ mEq = [\d.]+ mL/g));
    ok('…never "1 mEq = 1.1 mL"', !/(^|[^\d.])1 mEq = 1\.1 mL/.test(t), t.match(/[\d.]+ mEq = [\d.]+ mL/g));
  });

  await section('§3 an ordered stock that rounds to 0 mL cannot be submitted', async () => {
    const box = logger();
    order700(box, 0.05);
    const a = alertNamed('Stock rounds to 0 mL');
    eq('ZnSO₄ 0.05 mg/kg × 0.7 = 0.035 mL: a red line', a && a.level, 'crit');
    ok('…naming ZnSO₄', !!a && /ZnSO₄/.test(a.text), a && a.text);
    eq('Submit is disabled', submitBtn()?.disabled, true);
    ok('the save panel says why', /ZnSO₄ ปัดแล้วเหลือ 0 mL/.test(text(container.querySelector('.stock-at-zero-ml'))),
      text(container.querySelector('.stock-at-zero-ml')));
    eq('a draft may still be kept', draftBtn()?.disabled, false);
    await clickAsync(draftBtn());
    eq('…and the draft is logged', box.entry?.status, 'draft');
    setField('ZnSO₄', 0.1);
    eq('0.1 mg/kg → 0.07 mL prints 0.1: no red line', alertNamed('Stock rounds to 0 mL'), null);
    ok('…and nothing in the save panel', !container.querySelector('.stock-at-zero-ml'));
  });

  await section('§4 no stock mL is rounded by toFixed', async () => {
    const src = R('calculator.jsx');
    const block = src.slice(src.indexOf('const solVol = {'), src.indexOf('};', src.indexOf('const solVol = {')));
    ok('the solVol block rounds through roundMl only', /roundMl\(/.test(block) && !/toFixed/.test(block));
    ok('D50W, Soluvit and Peditrace go through roundMl', /const d50wVol = .*roundMl\(/.test(src)
      && /const soluvitVol .*roundMl\(/.test(src) && /const peditrace_vol .*roundMl\(/.test(src));
    ok('compiled/calculator.js carries roundMl', /roundMl/.test(R('compiled/calculator.js')));
  });

  await section('§5 a row saved as 50% MgSO₄ computes and prints 10%', async () => {
    const box = logger();
    // Yesterday's row still says 50% (saved before 2026-09-23). Pp, 2026-10-27:
    // every order was worked out on 10%, so the 50% path is gone and the row reads
    // as 10%: 600 g, 60 mL, Mg 0.4 → 0.24 mEq ÷ 0.812 = 0.296 → 0.3 mL.
    const base = { entryId: 'e-mg50', lastModified: 'lm-mg50', ts: '2026-10-26', dol: 9, weight: 600,
      calcInput: { curWtG: 600, fluidTargetPerKg: 150, totalTPN_mL: 60, deadVol_mL: 0, route: 'central',
        dexPct: 10, aaPerKg: 2.5, mgPerKg: 0.4, mgStrength: '50' } };
    mount({ patient: pt('MG-0600', 600), baselineEntry: base, onLog: box.onLog });
    if (!routeBtn('Central')?.classList.contains('on')) click(routeBtn('Central'));
    setField('Current weight', 600); fillRequired(150); setField('ปริมาตรคาสาย (dead space)', 0);
    ok('the vial reads 10%', /Vial 10%/.test(text(container)) && !/Vial 50%/.test(text(container)), text(container).match(/Vial \d+%/));
    ok('no "Use 10%" button and no 50% MgSO₄ on the card',
      ![...container.querySelectorAll('button')].some(b => b.textContent.trim() === 'Use 10%') && !/MgSO₄ 50%|Saved as 50%/.test(text(container)));
    eq('Submit is enabled', submitBtn()?.disabled, false);
    await clickAsync(submitBtn());
    const ml = backSheetMl();
    ok('the order prints', !!ml, alertRows().filter(r => r.level === 'crit'));
    eq('MgSO₄ 10%: 0.24 mEq ÷ 0.812 = 0.296 mL prints 0.3 (at 50% it was 0.06)', ml && ml['MgSO₄ 10%'], '0.3');
    eq('the saved row carries no mgStrength', box.entry?.calcInput?.mgStrength, undefined);
    // §5b: the same order as saved, with mgStrength put back to "50", reopened.
    const saved = { entryId: 'e-mg50s', lastModified: 'lm-mg50s', ts: '2026-10-27', dol: 10, weight: 600,
      ioInput: box.entry?.ioInput, ioOutput: box.entry?.ioOutput, drainContent: box.entry?.drainContent,
      status: 'submitted', calcInput: { ...(box.entry?.calcInput || {}), mgStrength: '50' } };
    mount({ patient: pt('MG-0600', 600), editEntry: saved, logDate: null, onLog: logger().onLog });
    ok('§5b reopened: the vial reads 10%', /Vial 10%/.test(text(container)), text(container).match(/Vial \d+%/));
    const ml2 = backSheetMl();
    eq('…it prints MgSO₄ 10% 0.3 mL', ml2 && ml2['MgSO₄ 10%'], '0.3');
    ok('…and no MgSO₄ at 50% on the form', !/MgSO₄ 50%|mL \(50%\)/.test(text(container.querySelector('#print-form'))));
    // §5c: a production row carries an older stamp, so calcMoved holds it.
    const prod = { ...saved, entryId: 'e-mg50p', calcInput: { ...saved.calcInput, constantsVersion: '2026-10-27.1' } };
    mount({ patient: pt('MG-0600', 600), editEntry: prod, logDate: null,
      onUpdate() { return Promise.resolve({ ok: true, lastModified: 'lm-mg50p2' }); } });
    ok('§5c a row stamped 2026-10-27.1 that says 50%: no print form until saved again', !container.querySelector('#print-form'));
    await clickAsync(submitBtn());
    const ml3 = backSheetMl();
    eq('…saved again, it prints MgSO₄ 10% 0.3 mL', ml3 && ml3['MgSO₄ 10%'], '0.3');
  });

  act(() => { root.unmount(); });
  console.log(`\nSTOCK mL 2026-10-27: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
