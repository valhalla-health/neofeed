// verify-tpn-answers-1027.cjs — the nutrition unit's and TPN team's answers of
// 2026-10-25 to Pp's 2026-10-19 question sheet, with Pp's readings of
// 2026-10-27 where an answer could go two ways (CHANGELOG 2026-10-27).
//
// What the other harnesses do not already pin:
//   §1  the numbers themselves: the named hard limits, the bottle, vitamin D,
//       heparin, the ZnSO₄ stock and CONSTANTS_VERSION;
//   §2  fluid from DOL 6 is 140–160 on every preterm tier, VLBW DOL 5 160–180
//       (Jochum Tables 1–3); Ca, P and Mg keep the first-days ranges to DOL 7;
//   §3  the NPC : Protein tile has no upper end and reads "≥ 24";
//   §4  a bag above the 1,250 mL bottle cannot be submitted, says why, and may
//       still be kept as a draft; 1,250 itself is allowed;
//   §5  heparin above 1 U/mL is a caution, 1 is not, and no bag means none;
//   §6  oral vitamin D above 1,000 IU/day is a caution, Munti-vim included,
//       and 1,000 itself is not;
//   §7  the Reference page and the trend bands read the new rows.
//
// Every section fails on 2cf4277 (main before this change). Mounts the real
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
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
vm.runInThisContext(R('data.js'));
const D = window.NEOFEED_DATA;
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
const tileEl = (label) => [...container.querySelectorAll('.metric')].find(m => m.querySelector('.lbl')?.textContent === label) || null;
function tick(labelText, want) {
  const lab = [...container.querySelectorAll('label.chk-label')].find(l => l.textContent.includes(labelText));
  if (!lab) throw new Error('checkbox not found: ' + labelText);
  const box = lab.querySelector('input[type=checkbox]');
  if (box.checked !== want) act(() => { box.click(); });
}

const BASE = { dol: 10, editEntry: null, baselineEntry: null, previousEntry: null, logDate: '2026-10-27',
  userLabel: 'Dr Test (doc@kcmh.test)', onUpdate() { return Promise.resolve({ ok: true, lastModified: 'lm-u' }); },
  onSaved() {}, onWeightChange() {} };
function mount(props) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear();
  act(() => { root.render(React.createElement(window.Calculator, { ...BASE, ...props })); });
  act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
}
function logger() {
  const box = { entry: null, calls: 0 };
  box.onLog = (e) => { box.entry = e; box.calls++; return Promise.resolve({ ok: true, entryId: 'e-' + box.calls, lastModified: 'lm-' + box.calls }); };
  return box;
}
const pt = (sid, bw) => ({ sessionId: sid, name: sid.slice(0, 2), bw, currentBed: 'NICU 5', diagnosis: '-',
  weights: [{ dol: 1, w: bw }], admissionDate: '2026-10-18' });

(async () => {
  await section('§1 the numbers from the answers of 2026-10-25', async () => {
    eq('CONSTANTS_VERSION', D.CONSTANTS_VERSION, '2026-10-27.1');
    eq('protein (TPN + EN) critical above 4.5', D.PROTEIN_HARD_HI, 4.5);
    eq('IV lipid critical above 4.0', D.LIPID_IV_HARD_HI, 4);
    eq('IV K critical above 5.0, every weight', D.K_IV_HARD_HI, 5);
    eq('IV NPE:AA critical below 12', D.NPE_IV_CRIT_LO, 12);
    eq('NPE:AA has no upper end', Number.isFinite(D.TARGETS.npePerGAA()[1]), false);
    eq('peripheral osmolarity critical above 900', D.OSM_PERIPHERAL_MAX, 900);
    eq('GIR critical above 12', D.GIR_HARD_HI, 12);
    eq('dextrose ceiling 17.3 g/kg/d', D.MAX_DEXTROSE_G_KG, 17.3);
    eq('largest bottle 1,250 mL', D.TPN_BOTTLE_MAX_ML, 1250);
    eq('vitamin D border 1,000 IU/day', D.VIT_D_MAX_IU_DAY, 1000);
    eq('heparin usual maximum 1 U/mL', D.HEPARIN_USUAL_MAX_U_ML, 1);
    eq('ZnSO₄ stock: 1 mg elemental Zn/mL', D.KCMH_STOCK.znso4?.znMgPerMl, 1);
    eq('Peditrace stock: Zn 250 µg/mL (pharmacy)', D.KCMH_STOCK.peditrace.znMgPerMl, 0.25);
  });

  await section('§2 fluid by Jochum Tables 1–3; Ca, P and Mg first days to DOL 7', async () => {
    eq('ELBW 900 g, DOL 5: 160–180 (Table 1)', D.TARGETS.fluid(5, 900), [160, 180]);
    eq('ELBW 900 g, DOL 6: 140–160 (Tables 2–3)', D.TARGETS.fluid(6, 900), [140, 160]);
    eq('ELBW 900 g, DOL 20: 140–160', D.TARGETS.fluid(20, 900), [140, 160]);
    eq('VLBW 1200 g, DOL 5: 160–180 (Table 1)', D.TARGETS.fluid(5, 1200), [160, 180]);
    eq('VLBW 1200 g, DOL 6: 140–160', D.TARGETS.fluid(6, 1200), [140, 160]);
    eq('below birth weight the tier holds at birth weight: 1100 g now, born 1600 g, DOL 5',
      D.TARGETS.fluid(5, 1100, 1600), [140, 160]);
    for (const [dol, ca, p, mg] of [[7, [32, 80], [31, 62], [0.2, 0.4]], [8, [64, 140], [50, 108], [0.4, 0.6]]]) {
      eq(`DOL ${dol}: Ca, P, Mg`, [D.TPN_TARGETS.ca(dol), D.TPN_TARGETS.p(dol), D.TPN_TARGETS.mg(dol)], [ca, p, mg]);
    }
  });

  await section('§3 the NPC : Protein tile has no upper end', async () => {
    mount({ patient: pt('NP-1000', 1000), onLog: logger().onLog });
    click(routeBtn('Central'));
    setField('Current weight', 1000); fillRequired(150);
    setField('Volume(mL/day)', 150); setField('Dextrose final', 25); setField('Amino acid', 1); setField('20% lipid', 3);
    const tile = tileEl('NPC : Protein');
    ok('the tile reads "Range ≥ 24"', /Range\s*≥ 24/.test(text(tile)), text(tile));
    ok('…never "Infinity" or "24–32"', !/Infinity|24–32/.test(text(tile)), text(tile));
    ok('a ratio far above 32 is not off target', !tile.classList.contains('s-warn') && !tile.classList.contains('s-crit'), tile.className);
  });

  await section('§4 a bag above the 1,250 mL bottle cannot be ordered', async () => {
    const box = logger();
    mount({ patient: pt('BT-7000', 7000), dol: 60, onLog: box.onLog });
    click(routeBtn('Central'));
    setField('Current weight', 7500); fillRequired(160);
    setField('Volume(mL/day)', 1240); setField('ปริมาตรคาสาย (dead space)', 30);
    setField('Dextrose final', 10); setField('Amino acid', 2.5); setField('20% NaCl', 3); setField('KCl', 2);
    setField('MgSO₄', 0.4); setField('10% Ca gluconate', 60); setField('Glycophos', 2);
    const a = alertNamed('Bag larger than the largest bottle');
    eq('1,270 mL to prepare: a critical alert', a && a.level, 'crit');
    ok('…naming the 1,250 mL bottle', !!a && /1250 mL/.test(a.text), a && a.text);
    eq('Submit is disabled', submitBtn()?.disabled, true);
    ok('the save panel says why', /เกินขวดใหญ่สุด 1250 mL/.test(text(container.querySelector('.bag-over-bottle'))), text(container.querySelector('.bag-over-bottle')));
    eq('a draft may still be kept', draftBtn()?.disabled, false);
    await clickAsync(draftBtn());
    eq('…and the draft is logged', box.calls, 1);
    eq('…as a draft', box.entry?.status, 'draft');
    setField('Volume(mL/day)', 1220);
    eq('1,220 + 30 = 1,250 mL is not above the bottle: no alert', alertNamed('Bag larger than the largest bottle'), null);
    ok('…and nothing in the save panel', !container.querySelector('.bag-over-bottle'));
  });

  await section('§5 heparin above the usual 1 U/mL is a caution', async () => {
    mount({ patient: pt('HP-1500', 1500), onLog: logger().onLog });
    click(routeBtn('Central'));
    setField('Current weight', 1500); fillRequired(150);
    setField('Volume(mL/day)', 150); setField('Dextrose final', 10); setField('Amino acid', 3); setField('20% lipid', 1);
    setField('Heparin', 1);
    eq('1 U/mL: no caution', alertNamed('Heparin above the usual dose'), null);
    setField('Heparin', 10);
    eq('10 U/mL (tenfold): a caution', alertNamed('Heparin above the usual dose')?.level, 'warn');
    setField('Heparin', 1.5);
    eq('1.5 U/mL: a caution', alertNamed('Heparin above the usual dose')?.level, 'warn');
    setField('Volume(mL/day)', 0); setField('Dextrose final', 0); setField('Amino acid', 0);
    eq('no bag: no heparin caution', alertNamed('Heparin above the usual dose'), null);
  });

  await section('§6 oral vitamin D above 1,000 IU/day is a caution', async () => {
    mount({ patient: pt('VD-1500', 1500), onLog: logger().onLog });
    setField('Current weight', 1500); fillRequired(150);
    setField('Vitamin D', 400);
    eq('400 IU/kg × 1.5 kg = 600 IU/day: no caution', alertNamed('Vitamin D above 1,000 IU/day'), null);
    tick('Munti-vim', true);
    eq('+ Munti-vim 400 = 1,000 IU/day: not above, no caution', alertNamed('Vitamin D above 1,000 IU/day'), null);
    setField('Vitamin D', 450);
    const a = alertNamed('Vitamin D above 1,000 IU/day');
    eq('675 + 400 = 1,075 IU/day: a caution', a && a.level, 'warn');
    ok('…counting Munti-vim', !!a && /1075 IU\/day \(รวม Munti-vim 400 IU\)/.test(a.text), a && a.text);
  });

  await section('§7 the Reference page and the trend bands read the new rows', async () => {
    const app = R('app.jsx'), log = R('log.jsx');
    ok('fluid table: a DOL 6+ column, ELBW 140–160 there',
      /cols=\{\["BW category", "DOL 1", "DOL 2", "DOL 3", "DOL 4", "DOL 5", "DOL 6\+"\]\}/.test(app)
      && /\["ELBW <1000g",\s*"80–100","100–120","120–140","140–160","160–180","140–160"\]/.test(app));
    ok('Cu: preterm and term from ESPGHAN_TARGETS', /micronutrients\.cu\.term/.test(app)
      && D.ESPGHAN_TARGETS.pn.micronutrients.cu.preterm === 40 && D.ESPGHAN_TARGETS.pn.micronutrients.cu.term === 20);
    ok('Ca/P/Mg heads read FIRST_DAYS_LAST_DOL', /First days \(DOL 1–\{D_A\.FIRST_DAYS_LAST_DOL\}\)/.test(app));
    ok('the electrolyte table has the day columns the tiles use', /\["Electrolyte","D1–2","D3","D4–5","D6–7","D8\+","Notes"\]/.test(app));
    ok('vitamin D row says at most 1,000 IU/day', /at most \$\{D_A\.displayNum\(D_A\.VIT_D_MAX_IU_DAY, 0\)\} IU\/day/.test(app));
    ok('trend bands: Na and K take the weight group',
      /TPN_TARGETS\.na\(dol, wt, patient\?\.bw\)/.test(log) && /TPN_TARGETS\.k\(dol, wt, patient\?\.bw\)/.test(log));
  });

  act(() => { root.unmount(); });
  console.log(`\nTPN ANSWERS 2026-10-27: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
