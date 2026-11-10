// verify-one-source-reference-1110.cjs — the Reference page (Clinical
// Guidelines, app.jsx GuidelinesPanel) reads its figures from data.js.
//
// PR #240 moved the Calculator's copied limits onto their data.js constants and
// left this page: apart from its GIR card it typed every figure that
// ESPGHAN_TARGETS already held (Pp, 2026-11-10). Change the object, and the page
// kept the old numbers. Now each figure data.js holds is read from it, through
// displayNum (no trailing zero: Pp, 2026-11-10, "ตัดศูนย์ท้าย").
//
// This harness plants other values in window.NEOFEED_DATA, renders the real
// <GuidelinesPanel> in jsdom, and reads all three tabs. A figure still typed in
// app.jsx keeps the old number and fails.
//
//   §1  PN tab: amino acid, lipid, Ca · P · Mg (mmol and the tiles' mg), Ca:P,
//       Glycophos, the fluid and electrolyte tables, Zn and Fe, Peditrace, Soluvit
//   §2  EN tab: macronutrients, minerals and vitamins, the feeding steps
//       (MEF, step, HMF, Full EN) and the growth targets
//   §3  WHO 2023 tab: the 2022 column of "ESPGHAN 2022 vs 2010"
//   §4  the real constants: today's words, and no figure ends in ".0"
//
// Fails against a360580 (PR #240's head), where all of these were literals.
// Mounts app.jsx in jsdom with the dev-only deps every app harness uses (see
// test/README.md). No patient, real or made up.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';
const R = (f) => fs.readFileSync(DIR + f, 'utf8');

let pass = 0, fail = 0, n = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(72)}${cond ? '' : '  ' + JSON.stringify(detail ?? '')}`);
  cond ? pass++ : fail++;
}

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><div id="probe"></div></body></html>',
  { url: 'https://localhost/', pretendToBeVisual: true });
const { window } = dom;
Object.assign(global, {
  window, document: window.document, self: window,
  HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
  getComputedStyle: window.getComputedStyle,
  sessionStorage: window.sessionStorage, localStorage: window.localStorage,
  Event: window.Event, CustomEvent: window.CustomEvent, MouseEvent: window.MouseEvent,
  requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: clearTimeout,
  IS_REACT_ACT_ENVIRONMENT: true,
});
global.showToast = () => {};
window.print = () => {};
window.confirm = () => true;
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
global.ReactDOM = ReactDOM; window.ReactDOM = ReactDOM;
window.NEOFEED_CLIENT_ID = 'test-client';
window.NEOFEED_GAS_URL = '';           // GAS off: no network from this harness
{
  const w = console.error;
  console.error = (...a) => { if (!/act\(|not wrapped|Not implemented/.test(String(a[0]))) w(...a); };
}
const load = (f) => vm.runInThisContext(babel.transformSync(R(f), {
  presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
  filename: f, configFile: false, babelrc: false,
}).code);
vm.runInThisContext(R('data.js'));
const D = window.NEOFEED_DATA;
['icons.jsx', 'calculator.jsx', 'fenton.jsx', 'registry.jsx', 'log.jsx'].forEach(load);
act(() => { load('app.jsx'); });   // its last line mounts <App/> into #root; the page goes in #probe

// ── planting: a deep copy of the real values, put back after each section ──
const KEYS = ['ESPGHAN_TARGETS', 'TPN_TARGETS', 'KCMH_STOCK', 'VIT_D_MAX_IU_DAY'];
const REAL = {};
for (const k of KEYS) REAL[k] = D[k];
function planted(edit) {
  // Copies keep the real objects untouched; TPN_TARGETS holds functions, so it is spread.
  D.ESPGHAN_TARGETS = JSON.parse(JSON.stringify(REAL.ESPGHAN_TARGETS));
  D.TPN_TARGETS = { ...REAL.TPN_TARGETS };
  D.KCMH_STOCK = JSON.parse(JSON.stringify(REAL.KCMH_STOCK));
  edit(D.ESPGHAN_TARGETS, D);
}
function restore() { for (const k of KEYS) D[k] = REAL[k]; }

// ── rendering the page, one tab at a time ──────────────────────────────────
const probe = document.getElementById('probe');
let root = null;
// Text node by text node, spaced, so "Day 1 (preterm)" and its "1.5–2.5" cannot
// run together, and whitespace is one space.
function words(el) {
  const out = [], walk = document.createTreeWalker(el, window.NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) out.push(walk.currentNode.nodeValue);
  return out.join(' ').replace(/\s+/g, ' ').trim();
}
// A RangeRow is three cells: its label (a span, with any note under it), the
// figures ("min–max", in a .num cell) and the unit. Read as such, so a row is
// matched by its own label and never by a note or a neighbour.
function rangeRows() {
  return [...probe.querySelectorAll('.card-b .num')]
    .filter(c => c.parentElement.children.length === 3 && c.parentElement.children[1] === c)
    .map(c => ({ label: words(c.parentElement.children[0].querySelector('span')), num: words(c),
      unit: words(c.parentElement.children[2]) }));
}
function page() {
  if (root) act(() => { root.unmount(); });
  root = ReactDOM.createRoot(probe);
  act(() => { root.render(React.createElement(globalThis.GuidelinesPanel)); });
  const tab = (label) => {
    const b = [...probe.querySelectorAll('.seg button')].find(x => x.textContent.trim() === label);
    if (!b) throw new Error('tab not found: ' + label);
    act(() => { b.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    return { txt: words(probe), rows: rangeRows() };
  };
  return { pn: tab('PN (ESPGHAN 2018)'), en: tab('EN (ESPGHAN 2022)'), who: tab('WHO 2023') };
}
// row(label, min, max, unit): a RangeRow with that label whose figures read
// "min – max" and whose unit cell contains `unit`. A string: text on the tab.
const row = (label, min, max, unit = '') => ({ label, num: `${min} – ${max}`, unit });
function check(where, tab, want) {
  for (const [name, w] of want) {
    if (typeof w === 'string') {
      ok(`${where}: ${name}`, tab.txt.includes(w), { want: w });
    } else {
      const same = tab.rows.filter(r => r.label === w.label);
      const hit = same.some(r => r.num === w.num && r.unit.includes(w.unit));
      ok(`${where}: ${name}`, hit, { want: w, got: same });
    }
  }
}
const REAL_FD = D.FIRST_DAYS_LAST_DOL;

// ── §1 PN tab ──────────────────────────────────────────────────────────────
console.log('\n── §1 PN tab reads ESPGHAN_TARGETS.pn, TPN_TARGETS and KCMH_STOCK ──');
try {
  planted((G, d) => {
    G.pn.aa.preterm.day1.range = [1.11, 2.22];
    G.pn.aa.preterm.day2plus.range = [2.33, 3.44];
    G.pn.aa.preterm.above35 = 'planted research note';
    G.pn.aa.term.range = [1.22, 2.88];
    Object.assign(G.pn.lipid, { start: 0.44, step: 0.99, max: 3.77, tgCutoff: 222, kcalPerMl_20pct: 1.9 });
    Object.assign(G.pn.electrolytes, {
      ca: { dol1: [0.71, 1.91], growing: [1.51, 3.31] }, p: { dol1: [0.91, 1.81], growing: [1.41, 3.21] },
      mg: { dol1: [0.11, 0.21], growing: [0.21, 0.31] }, caP_molar: [0.71, 1.21], caP_mass: [0.91, 1.61],
    });
    d.TPN_TARGETS.ca = (dol) => dol <= REAL_FD ? [33, 81] : [65, 141];
    d.TPN_TARGETS.p = (dol) => dol <= REAL_FD ? [32, 63] : [51, 109];
    d.TPN_TARGETS.mg = (dol) => dol <= REAL_FD ? [2.6, 5.1] : [5.2, 7.6];
    G.pn.fluid.elbw = { d1: [81, 101], d2: [102, 122], d3: [123, 143], d4: [144, 164], d5: [165, 185], d6plus: [146, 166] };
    G.pn.fluid.term.d6plus = [147, 167];
    G.pn.fluid.vlbw = { d1: [71, 91], d2: [92, 112], d3: [113, 133], d4: [134, 154], d5: [161, 181], d6plus: [142, 162] };
    G.pn.fluid.preterm = { d1: [61, 81], d2: [82, 102], d3: [103, 123], d4: [124, 144], d5: [145, 165], d6plus: [143, 163] };
    G.pn.electrolytes.na.over1500 = { d1to2: [0.3, 2.3], d3: [0.4, 3.4], d4to7: [2.5, 5.5], stable: [2.6, 5.6] };
    G.pn.electrolytes.k.under1500 = { d1to3: [0.6, 3.6], d4to5: [2.7, 3.7], d6to7: [1.8, 3.8], stable: [2.9, 5.9] };
    G.pn.micronutrients.cu = { ...G.pn.micronutrients.cu, preterm: 41, term: 21 };
    d.KCMH_STOCK.smof20 = { ...d.KCMH_STOCK.smof20, gPerMl: 0.25 };
    d.TPN_TARGETS.lipid = (dol) => dol <= 1 ? [0.5, 1.1] : [1, 4];
    G.pn.electrolytes.na.under1500 = { d1to2: [0.1, 2.1], d3: [0.2, 5.2], d4to7: [2.3, 5.3], stable: [2.4, 5.4] };
    G.pn.electrolytes.k.over1500 = { d1to3: [0.5, 3.5], d4to5: [2.6, 3.6], d6to7: [1.7, 3.7], stable: [2.8, 3.8] };
    G.pn.micronutrients.zn.preterm = [401, 501];
    G.pn.micronutrients.fe.preterm = [201, 251];
    d.KCMH_STOCK.glycophos = { ...d.KCMH_STOCK.glycophos, pMgPerMl: 61.94, naMeqPerMl: 3 };
    d.KCMH_STOCK.peditrace = { ...d.KCMH_STOCK.peditrace, mlPerKg: 1.5, maxMl: 14 };
    d.KCMH_STOCK.soluvit = { ...d.KCMH_STOCK.soluvit, mlPerKg: 1.25 };
  });
  const { pn } = page();
  check('AA', pn, [
    ['Day 1 (preterm) 1.11–2.22', row('Day 1 (preterm)', '1.11', '2.22')],
    ['Day 2+ (preterm) 2.33–3.44', row('Day 2+ (preterm)', '2.33', '3.44')],
    ['Above 3.44 g/kg', 'Above 3.44 g/kg'],
    ['above35 note', 'planted research note'],
    ['Term stable 1.22–2.88', row('Term stable', '1.22', '2.88')],
  ]);
  check('Lipid', pn, [
    ['Start 0.44–1.1 (TPN_TARGETS.lipid DOL 1)', row('Start (Day 1–2)', '0.44', '1.1')],
    ['Advance +0.99', row('Advance', '+0.5', '+0.99')],
    ['Max 3.77', row('Max', '—', '3.77')],
    ['TG 222', row('TG threshold', '—', '222')],
    ['20% ILE 1.9 kcal/mL', '20% ILE = 1.9 kcal/mL'],
    ['1 g fat = 4 mL at 0.25 g/mL', '1 g fat = 4 mL SMOF 20%'],
  ]);
  check('Ca P Mg', pn, [
    ['Ca first days 0.71–1.91 = 33–81 mg', row('Ca', '0.71', '1.91', 'mmol/kg/day = 33–81 mg/kg')],
    ['P first days 0.91–1.81 = 32–63 mg', row('P', '0.91', '1.81', 'mmol/kg/day = 32–63 mg/kg')],
    ['Mg first days 0.11–0.21 = 2.6–5.1 mg', row('Mg', '0.11', '0.21', 'mmol/kg/day = 2.6–5.1 mg elemental')],
    ['Ca growing 1.51–3.31 = 65–141 mg', row('Ca', '1.51', '3.31', 'mmol/kg/day = 65–141 mg/kg')],
    ['P growing 1.41–3.21 = 51–109 mg', row('P', '1.41', '3.21', 'mmol/kg/day = 51–109 mg/kg')],
    ['Mg growing 0.21–0.31 = 5.2–7.6 mg', row('Mg', '0.21', '0.31', 'mmol/kg/day = 5.2–7.6 mg elemental')],
    ['Molar 0.71–1.21, target 1.21:1', row('Molar (PN)', '0.71', '1.21', ':1 — target 1.21:1')],
    ['Mass 0.91–1.61', row('Mass ratio', '0.91', '1.61')],
    ['Glycophos 2 mmol P + 3 mmol Na', '1 mL = 2 mmol P + 3 mmol Na'],
  ]);
  check('Fluid table', pn, [
    ['ELBW row', 'ELBW <1000g 81–101 102–122 123–143 144–164 165–185 146–166'],
    ['Term DOL 6+', '60–100 100–140 147–167'],
    ['VLBW row', 'VLBW 1000–1500g 71–91 92–112 113–133 134–154 161–181 142–162'],
    ['Preterm row', 'Preterm >1500g 61–81 82–102 103–123 124–144 145–165 143–163'],
  ]);
  check('Electrolytes', pn, [
    ['Na <1500 g row', 'Na — preterm <1500g 0.1–2.1 0.2–5.2 2.3–5.3 2.3–5.3 2.4–5.4'],
    ['K ≥1500 g row', 'K — ≥1500g 0.5–3.5 0.5–3.5 2.6–3.6 1.7–3.7 2.8–3.8'],
    ['Na ≥1500 g row', 'Na — ≥1500g 0.3–2.3 0.4–3.4 2.5–5.5 2.5–5.5 2.6–5.6'],
    ['K <1500 g row', 'K — preterm <1500g 0.6–3.6 0.6–3.6 2.7–3.7 1.8–3.8 2.9–5.9'],
    ['Cu 41 preterm, 21 term', '41 preterm · 21 term µg/kg/day'],
    ['Zn 401–501', '401–501 µg/kg/day'],
    ['Fe 201–251', '201–251 µg/kg/day'],
    ['Peditrace 1.5 mL/kg (max 14)', 'Peditrace® 1.5 mL/kg/day (maximum 14 mL/day)'],
    ['Soluvit 1.25 mL/kg', 'Soluvit N: 1.25 mL/kg/day'],
  ]);
} catch (e) { ok(`(§1 ran to the end) ${e.message}`, false, e.stack.split('\n').slice(0, 3)); }
finally { restore(); }

// ── §2 EN tab ──────────────────────────────────────────────────────────────
console.log('\n── §2 EN tab reads ESPGHAN_TARGETS.en ──');
try {
  planted((G, d) => {
    Object.assign(G.en.energy, { range: [111, 141], max: 151 });
    Object.assign(G.en.protein, { range: [3.4, 3.9], max: 4.4 });
    G.en.peRatio.range = [2.7, 3.5];
    G.en.fat.range = [4.7, 8.2];
    G.en.cho.range = [12, 18];
    Object.assign(G.en.fluid, { range: [149, 199], target: 166 });
    Object.assign(G.en.na, { range: [3.1, 5.1], high: 7.9 });
    G.en.k.range = [2.4, 4.7];
    Object.assign(G.en.ca, { range: [3.1, 5.1], mgPerKg: [121, 201] });
    Object.assign(G.en.p, { range: [2.3, 3.8], mgPerKg: [71, 116] });
    G.en.vitD.range = [401, 701];
    d.VIT_D_MAX_IU_DAY = 990;
    Object.assign(G.en.fe, { range: [2.1, 3.1], max: 5.9 });
    G.en.zn.range = [2.1, 3.1];
    Object.assign(G.en.advancement, { mef: [11, 23], step: [17, 29], hmfStart: 41, fullFeeds: 99 });
    Object.assign(G.en.growth, { weight: [16, 21], length: 0.9, hc: 0.6 });
  });
  const { en } = page();
  check('Macronutrients', en, [
    ['Energy 111–141 (max 151)', row('Energy', '111', '141', 'kcal/kg/day (max 151 for catch-up)')],
    ['Protein 3.4–3.9 (max 4.4)', row('Protein', '3.4', '3.9', 'g/kg/day (max 4.4)')],
    ['P:E 2.7–3.5', row('P:E ratio', '2.7', '3.5')],
    ['Fat 4.7–8.2', row('Fat', '4.7', '8.2')],
    ['CHO 12–18', row('CHO', '12', '18')],
    ['Fluid from 149, target 166', row('Fluid', '149', '180', 'mL/kg/day (target 166)')],
  ]);
  check('Minerals', en, [
    ['Na 3.1–5.1 (up to 7.9)', row('Na', '3.1', '5.1', 'mmol/kg/day (up to 7.9 ELBW)')],
    ['K 2.4–4.7', row('K', '2.4', '4.7')],
    ['Ca 121–201 mg = 3.1–5.1 mmol', row('Ca', '121', '201', 'mg/kg/day = 3.1–5.1 mmol/kg')],
    ['P 71–116 mg = 2.3–3.8 mmol', row('P', '71', '116', 'mg/kg/day = 2.3–3.8 mmol/kg')],
    ['Vitamin D 401–701, at most 990 IU/day', row('Vitamin D', '401', '701', 'IU/kg/day (per kg, not per day!) · at most 990 IU/day')],
    ['Iron 2.1–3.1 (up to 5.9)', row('Iron', '2.1', '3.1', 'mg/kg/day, start at 2 wks (up to 5.9)')],
    ['Zinc 2.1–3.1', row('Zinc', '2.1', '3.1')],
  ]);
  check('Feeding steps', en, [
    ['MEF 11–23', '1. Start ASAP 11–23 mL/kg/day'],
    ['Advance +17–29', '2. Advance +17–29 mL/kg/day'],
    ['HMF ≥41', '3. Fortify ≥41 mL/kg/day'],
    ['Full EN ≥99', '4. Full EN ≥99 mL/kg/day'],
    ['Growth 16–21, 0.9, 0.6', 'Weight ≥ 16–21 g/kg/day · Length ≥ 0.9 cm/wk · HC ≥ 0.6 cm/wk'],
  ]);
} catch (e) { ok(`(§2 ran to the end) ${e.message}`, false, e.stack.split('\n').slice(0, 3)); }
finally { restore(); }

// ── §3 WHO 2023 tab ────────────────────────────────────────────────────────
console.log('\n── §3 WHO tab: the 2022 column reads ESPGHAN_TARGETS.en ──');
try {
  planted((G) => {
    Object.assign(G.en.energy, { range: [111, 141], max: 151 });
    Object.assign(G.en.protein, { range: [3.4, 3.9], max: 4.4 });
    G.en.fat.range = [4.7, 8.2];
    G.en.k.range = [2.4, 4.7];
    G.en.ca.range = [3.1, 5.1];
    G.en.p.range = [2.3, 3.8];
    Object.assign(G.en.na, { range: [3.1, 5.1], high: 7.9 });
    G.en.vitD.range = [401, 701];
    Object.assign(G.en.fe, { range: [2.1, 3.1], max: 5.9 });
    G.en.zn.range = [2.1, 3.1];
  });
  const { who } = page();
  check('2022 column', who, [
    ['Energy', 'Energy 110–135 111–141 (max 151)'],
    ['Protein', 'Protein 3.5–4.5 3.4–3.9 (max 4.4)'],
    ['Fat', 'Fat 4.8–6.6 4.7–8.2'],
    ['K', 'K 1.7–3.4 2.4–4.7'],
    ['Ca', 'Ca 3–3.5 mmol 3.1–5.1 mmol'],
    ['P', 'P 1.9–2.9 mmol 2.3–3.8 mmol'],
    ['Na', 'Na 3–5 3.1–5.1 (–7.9)'],
    ['Vitamin D', 'Vitamin D 800–1000 IU/day 401–701 IU/kg/day'],
    ['Iron', 'Iron 2–3 mg/kg 2.1–3.1 (up to 5.9)'],
    ['Zinc', 'Zinc 1.1–2 2.1–3.1'],
  ]);
} catch (e) { ok(`(§3 ran to the end) ${e.message}`, false, e.stack.split('\n').slice(0, 3)); }
finally { restore(); }

// ── §4 the real constants ──────────────────────────────────────────────────
console.log('\n── §4 the real constants: today\'s words, no trailing zero ──');
try {
  const { pn, en, who } = page();
  check('PN', pn, [
    ['Day 1 1.5–2.5', row('Day 1 (preterm)', '1.5', '2.5')],
    ['Term 1.5–3', row('Term stable', '1.5', '3')],
    ['Lipid start 0.5–1', row('Start (Day 1–2)', '0.5', '1')],
    ['Lipid max 4', row('Max', '—', '4')],
    ['1 g fat = 5 mL', '1 g fat = 5 mL SMOF 20%'],
    ['TG 265', row('TG threshold', '—', '265')],
    ['P growing 1.6–3.5 = 50–108 mg', row('P', '1.6', '3.5', 'mmol/kg/day = 50–108 mg/kg')],
    ['Mg first days = 2.5–5 mg', row('Mg', '0.1', '0.2', 'mmol/kg/day = 2.5–5 mg elemental')],
    ['Mass 1–1.7', row('Mass ratio', '1', '1.7')],
    ['Glycophos 1 mmol P + 2 mmol Na', '1 mL = 1 mmol P + 2 mmol Na'],
    ['ELBW fluid row', 'ELBW <1000g 80–100 100–120 120–140 140–160 160–180 140–160'],
    ['Na <1500 g row', 'Na — preterm <1500g 0–2 0–5 2–5 2–5 2–5'],
    ['Peditrace 1 (max 15)', 'Peditrace® 1 mL/kg/day (maximum 15 mL/day)'],
  ]);
  check('EN', en, [
    ['Energy 115–140 (max 160)', row('Energy', '115', '140', 'kcal/kg/day (max 160 for catch-up)')],
    ['Protein 3.5–4', row('Protein', '3.5', '4')],
    ['Fluid 150–180 (target 165)', row('Fluid', '150', '180', 'mL/kg/day (target 165)')],
    ['Vitamin D at most 1000', 'at most 1000 IU/day'],
    ['MEF 12–24', '1. Start ASAP 12–24 mL/kg/day'],
    ['Full EN ≥100', '4. Full EN ≥100 mL/kg/day'],
    ['Growth 17–20, 0.8, 0.5', 'Weight ≥ 17–20 g/kg/day · Length ≥ 0.8 cm/wk · HC ≥ 0.5 cm/wk'],
  ]);
  check('WHO', who, [['Protein 2022', 'Protein 3.5–4.5 3.5–4 (max 4.5)']]);
  for (const [tab, t] of [['PN', pn], ['EN', en], ['WHO', who]]) {
    const zeros = t.txt.match(/\b\d+\.0\b(?!\d)/g);
    ok(`${tab}: no figure ends in ".0"`, !zeros, zeros);
  }
} catch (e) { ok(`(§4 ran to the end) ${e.message}`, false, e.stack.split('\n').slice(0, 3)); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
