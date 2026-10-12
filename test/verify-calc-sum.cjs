// verify-calc-sum.cjs — the printed bag adds up, and the screen shows the new value (NF-17).
//
// NF-17 asks two things of every calculation change: a sum check on synthetic
// orders, and a wired-in check that a click-through shows the new value on
// screen, not only in the function. The oracle (verify-calc-oracle.cjs) checks
// each figure against an independent recomputation, and the fuzz's I3 checks
// that the bag total equals the prepared volume. Neither adds up the parts the
// pharmacist actually reads. This harness does, from the mounted component only:
// nothing here recomputes the app's formulas.
//
// 1 · SUM CHECK. Each order is typed into the real <Calculator>, saved through
//     the real Submit button, and read back from the pharmacy back page of
//     #print-form, the "Aqueous bag — stock" table: every stock line's mL
//     (D50W, amino acid, NaCl, Na acetate, Glycophos, KCl, K₂HPO₄, MgSO₄,
//     Ca gluconate, Soluvit N, Peditrace, heparin; lipid and Vitalipid are a
//     separate syringe and are not in this table) plus the printed WFI q.s. and
//     the printed prepared volume. Asserted:
//       a. Σ(printed stock mL) + printed WFI = printed prepared, within TOL
//       b. printed Components + printed WFI = printed prepared, exactly
//       c. Σ(printed stock mL) = printed Components and on-screen Components,
//          within TOL; on-screen Components and Bag total (prepared) equal the
//          printed ones
//       d. the copied order's BAG MAKE-UP line carries the same components,
//          WFI and prepared figures as the print form
//       e. the table has one line per stock the order uses (a dropped line
//          would otherwise make the sum easier to pass, not harder)
//     When the WFI is negative the bag cannot be compounded: the sum is skipped
//     and the alert is asserted on screen, on the print form and in the copy.
//
// THE TOLERANCE, from the app's rounding chain (calculator.jsx, solVol and the
// bag make-up block):
//   · each stock mL is rounded once: toFixed(1), or toFixed(2) for K₂HPO₄,
//     MgSO₄ and heparin. The print shows it at that same precision, so the
//     printed part p_i IS the value the app summed. S = Σ p_i is exact to 0.01.
//   · componentVol C = toFixed(1)(S), so |S − C| ≤ 0.05.
//   · the print shows P = Vp at 1 decimal (D.displayNum), and since NF-17 the
//     app takes wfiVol W = P − C from that same printed figure, so C + W = P
//     exactly, for any Vp. (Before the fix W = toFixed(1)(Vp − C), which
//     broke the equation by 0.1 mL when Vp ended in a hundredths 5: order S7.)
//   ⇒ |S + W − P| = |S − C| ≤ 0.05 mL.
//   TOL = 0.05 mL (+1e-9 for float noise) when any printed part has a non-zero
//   hundredths digit; 0 (+1e-9) when every part is a whole tenth, since then
//   S = C. Check (b) is exact (1e-9). Nothing looser is justified.
//
// 2 · WIRED-IN CHECK. After the first save each order changes one input the
//     way a person does — a click on a dead-space preset chip, or a new TPN
//     volume typed a character at a time — and the harness asserts that the
//     on-screen Bag total (prepared) moves to the new delivered + dead volume
//     (input arithmetic, not the app's formula), that Components moves when it
//     must (a dead-space change on a bag with dextrose), that the stale print
//     form is withdrawn while unsaved, and that after the second save the
//     reprinted form carries the new figures and its parts still add up.
//
// Orders: the oracle's 12 scenarios (copied, not imported), eight written for
// this check — a 900 g infant on day 3 of TPN, a term infant, a bag a few mL
// short of its prepared volume, one that overflows it, K₂HPO₄ and MgSO₄ at
// 0.01 mL, hundredths that carry across the sum, a prepared volume with a
// second decimal (typed 80.45 mL), and components that fill such a bag
// exactly (WFI 0, no over-full alert) — and SUM_N seeded random orders (default 40,
// seed SUM_SEED 20261011; the seed and the whole order print with a failure).
//
// NEGATIVE_CONTROL proves the harness bites. It patches calculator.jsx in
// memory before the transform and must then FAIL:
//   1  heparin dropped from componentVol (a stock printed but not counted)
//   2  WFI taken from the delivered volume instead of the prepared one
//   3  deadVol_mL dropped from the calculation's useMemo dependencies, so a
//      dead-space chip changes the input but not the figure on screen
// The patched text is transformed under another file name, so the compiled
// loader cannot swap compiled/calculator.js in for it (and says nothing was
// swapped for calculator).
//
// Usage: node test/verify-calc-sum.cjs   ·   SUM_N=100 for a deeper local run.
// Dev-only deps as in test/README.md (react@18 react-dom@18 @babel/core
// @babel/preset-react jsdom).
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + path.sep;
const R = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const NEG = process.env.NEGATIVE_CONTROL || '';
const COUNT = Number(process.env.SUM_N || 40);
const SEED0 = Number(process.env.SUM_SEED || 20261011);
let seed = SEED0;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (lo, hi, step) => { const n = Math.round((lo + rnd() * (hi - lo)) / step) * step; return Number(n.toFixed(4)); };

// ── jsdom + React (the oracle's setup) ──────────────────────────────────────
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
window.prompt = () => 'sum-check reason';
window.confirm = () => true;
let copied = null;
const clipboardStub = { writeText: (t) => { copied = t; return Promise.resolve(); } };
try { Object.defineProperty(window.navigator, 'clipboard', { value: clipboardStub, configurable: true }); }
catch { try { window.navigator.clipboard.writeText = clipboardStub.writeText; } catch { /* left to fail loudly at the Copy assertion */ } }
try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true }); } catch {}
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
{ const w = console.error; console.error = (...a) => { if (!/act\(|not wrapped|Not implemented/.test(String(a[0]))) w(...a); }; }
vm.runInThisContext(R('data.js'));

// ── the negative controls: patch the source text, never the expectation ─────
const PATCHES = {
  1: ['solVol.k2hpo4 + solVol.kCl + solVol.mg + solVol.ca +\n      soluvitVol + peditrace_vol + solVol.heparin\n',
      'solVol.k2hpo4 + solVol.kCl + solVol.mg + solVol.ca +\n      soluvitVol + peditrace_vol\n',
      'heparin dropped from componentVol'],
  2: ['const wfiVol = parseFloat((Number(D.displayNum(preparedVol, 1)) - componentVol).toFixed(1));',
      'const wfiVol = parseFloat((Number(D.displayNum(totalTPN_mL, 1)) - componentVol).toFixed(1));',
      'WFI from the delivered volume, not the prepared one'],
  3: ['totalTPN_mL, deadVol_mL, dexPct, aaPerKg, aaStockKey, lipidPerKg,',
      'totalTPN_mL, dexPct, aaPerKg, aaStockKey, lipidPerKg,',
      'deadVol_mL dropped from the useMemo dependencies'],
};
const transform = (code, filename) => babel.transformSync(code, {
  presets: [[require('@babel/preset-react'), { runtime: 'classic' }]], filename, configFile: false, babelrc: false }).code;
vm.runInThisContext(transform(R('icons.jsx'), 'icons.jsx'));
if (NEG) {
  const p = PATCHES[NEG];
  if (!p) { console.error(`NEGATIVE_CONTROL=${NEG}: use 1, 2 or 3`); process.exit(2); }
  const src = R('calculator.jsx').replace(/\r\n/g, '\n');
  if (!src.includes(p[0])) { console.error(`NEGATIVE_CONTROL=${NEG}: the text to patch is no longer in calculator.jsx — update PATCHES[${NEG}]`); process.exit(2); }
  console.log(`NEGATIVE_CONTROL=${NEG}: ${p[2]} — this run must FAIL`);
  // Not "calculator.jsx": the compiled loader only stands in for the file on disk.
  vm.runInThisContext(transform(src.replace(p[0], p[1]), 'calculator-negative-control.jsx'));
} else {
  vm.runInThisContext(transform(R('calculator.jsx'), 'calculator.jsx'));
}

// ── orders: the oracle's 12 (copied), then this check's own ─────────────────
const BASE = {
  bw: 1000, cur: 1000, tpnWtOverride: 0, dol: 10, route: 'central', fluid: 150, otherIV: 0, drug: 0,
  ioOut: 0, drain: 0,
  tpn: 0, useRate: false, dead: 30, dex: 0, aa: 0, lip: 0, lipH: 24,
  naCl: 0, naAc: 0, glyNa: 0, kCl: 0, k2: 0, mg: 0, mgVial: '10', ca: 0,
  soluvit: true, pedi: true, zn: 0, hep: 1,
  feed: 'BM_20', enVol: 0, enFreq: 0, men: false,
  weights: [],
};
const ORACLE = [
  { name: 'A ELBW DOL3 below BW, full TPN, trophic BM not MEN', bw: 900, cur: 850, dol: 3, fluid: 140, otherIV: 1.5, drug: 2.3,
    ioOut: 40, drain: 5, tpn: 100, dead: 30, dex: 10, aa: 3, lip: 2, lipH: 24,
    naCl: 2, naAc: 1, glyNa: 1, kCl: 1, k2: 0.5, mg: 0.3, ca: 50, hep: 0.5,
    feed: 'BM_20', enVol: 1, enFreq: 8, weights: [{ dol: 1, w: 900 }, { dol: 2, w: 870 }] },
  { name: 'B growing preterm peripheral, rate entry, Zn', bw: 1100, cur: 1450, dol: 16,
    route: 'peripheral', fluid: 160, otherIV: 0, drug: 1.2, ioOut: 90, drain: 0,
    tpn: 80.4, useRate: 3.35, dead: 20, dex: 12.5, aa: 3.5, lip: 3, lipH: 20,
    naCl: 3, glyNa: 2, kCl: 2, mg: 0.5, mgVial: '10', ca: 80, zn: 0.3, hep: 1,
    feed: 'FBM_PF_22', enVol: 8, enFreq: 8,
    weights: [{ dol: 1, w: 1100 }, { dol: 14, w: 1400 }, { dol: 15, w: 1430 }] },
  { name: 'C full enteral HMF, no TPN (feeds-only day)', bw: 1300, cur: 1600, dol: 25, fluid: 150,
    ioOut: 110, drain: 0, tpn: 0, dead: 30, soluvit: true, pedi: true, hep: 1,
    feed: 'BM_HMF_24', enVol: 30, enFreq: 8, weights: [{ dol: 1, w: 1300 }, { dol: 24, w: 1580 }] },
  { name: 'D term, manual dosing weight, no dead space, MEN LF', bw: 3200, cur: 3000, tpnWtOverride: 3100, dol: 2,
    fluid: 70, ioOut: 60, tpn: 180, dead: 0, dex: 10, aa: 2, lip: 1, lipH: 16, ca: 40, mg: 0.2, soluvit: true, pedi: false, hep: 1,
    feed: 'LF_24', enVol: 5, enFreq: 8, men: true },
  { name: 'E alert stress: peripheral D15, lipid 4.6, K high, Ca no P, Zn high', bw: 800, cur: 800, dol: 10,
    route: 'peripheral', fluid: 150, ioOut: 30, tpn: 60, dead: 30, dex: 15, aa: 4, lip: 4.6, lipH: 24,
    naCl: 5, kCl: 4, ca: 100, zn: 6.5, hep: 1, feed: 'INFATRINI_30', enVol: 3, enFreq: 8, men: true },
  { name: 'F caps: 16 kg (not orderable since 2026-10-08)', bw: 3000, cur: 16000, dol: 40, fluid: 100, tpn: 1000, dead: 30,
    dex: 10, aa: 2, lip: 2, naCl: 2, kCl: 1, soluvit: true, pedi: true, hep: 0.5, feed: 'BM_20', enVol: 0, enFreq: 0 },
  ...['BM_PF_20', 'PRENAN_22', 'FBM_PF_24', 'FBM_INF_MIX', 'LF_20', 'LF_27'].map((k) => ({
    name: `G feed ${k} (feeds only)`, bw: 1200, cur: 1500, dol: 12, fluid: 160, ioOut: 70, tpn: 0,
    feed: k, enVol: 28, enFreq: 8, weights: [{ dol: 11, w: 1490 }] })),
];
const OWN = [
  { name: 'S1 900 g infant, day 3 of TPN', bw: 900, cur: 900, dol: 3, fluid: 120, ioOut: 35, tpn: 90, dead: 30,
    dex: 10, aa: 3, lip: 2, naCl: 1, glyNa: 1, kCl: 1, k2: 0.5, mg: 0.3, ca: 40, hep: 0.5, weights: [{ dol: 1, w: 900 }] },
  { name: 'S2 term infant 3.4 kg, central, every bag stock', bw: 3400, cur: 3350, dol: 5, fluid: 100, ioOut: 120,
    tpn: 300, dead: 50, dex: 12.5, aa: 3, lip: 3, naCl: 2, naAc: 1, glyNa: 2, kCl: 1.5, k2: 0.5, mg: 0.4, ca: 60, hep: 1,
    weights: [{ dol: 1, w: 3400 }] },
  { name: 'S3 near the bag volume limit (WFI under 1 mL)', bw: 1000, cur: 1000, dol: 8, fluid: 150, ioOut: 50,
    tpn: 50, dead: 0, dex: 20, aa: 2.3, naCl: 3, kCl: 2, ca: 20, hep: 0.6, weights: [{ dol: 1, w: 1000 }] },
  { name: 'S4 over the bag volume limit (cannot be compounded)', bw: 1000, cur: 1000, dol: 8, fluid: 150, ioOut: 50,
    tpn: 50, dead: 0, dex: 20, aa: 2.6, naCl: 3, kCl: 2, ca: 20, hep: 0.6, weights: [{ dol: 1, w: 1000 }], overflow: true },
  { name: 'S5 K2HPO4 and MgSO4 at 0.01 mL', bw: 500, cur: 500, dol: 8, fluid: 140, ioOut: 20, tpn: 40, dead: 0,
    dex: 7.5, aa: 2, naCl: 1, k2: 0.02, mg: 0.02, hep: 0.5, weights: [{ dol: 1, w: 500 }],
    expectRow: { 'K₂HPO₄': 0.01, 'MgSO₄ 10%': 0.01 } },
  { name: 'S6 hundredths carried across the sum', bw: 700, cur: 700, dol: 9, fluid: 150, ioOut: 30, tpn: 70, dead: 30,
    dex: 10, aa: 3, naCl: 2, k2: 0.07, mg: 0.05, ca: 30, hep: 0.7, weights: [{ dol: 1, w: 700 }] },
  // S7 is the regression case for the NF-17 WFI fix (Pp, 2026-10-11). Before it, 130.45 mL
  // prepared printed "87.5 + WFI 42.9 = 130.5": displayNum rounded the tie up and toFixed
  // rounded 42.94999… down. WFI now comes from the printed prepared volume (87.5 + 43 = 130.5).
  // CHANGELOG.md, 2026-10-11 (8). Do not loosen the tolerance to make it pass.
  { name: 'S7 prepared volume with a second decimal (80.45 + 50 mL)', bw: 1000, cur: 1000, dol: 10, fluid: 150, ioOut: 50,
    tpn: 80.45, dead: 50, dex: 10, aa: 3, naCl: 2, kCl: 1, ca: 40, hep: 0.5, weights: [{ dol: 1, w: 1000 }] },
  // S8: the over-full alert at the same tie (Vera, NF-17 review). 130.45 mL prepared prints 130.5;
  // the components (130.48 → 130.5) fill it exactly. WFI is 0 and no alert fires. Before the fix the
  // WFI was 130.45 − 130.5 → −0.1 and the bag was called over-full by 0.1 mL.
  { name: 'S8 components fill the printed bag exactly at the tie (WFI 0)', bw: 2000, cur: 2000, dol: 10, fluid: 120,
    ioOut: 80, tpn: 130.45, dead: 0, dex: 20, aa: 3.5, naCl: 2, kCl: 1, ca: 6, hep: 0.6, weights: [{ dol: 1, w: 2000 }],
    expectMake: { components: 130.5, wfi: 0, prepared: 130.5 } },
];
function randomOrder(i) {
  const bw = between(400, 4000, 10);
  const cur = pick([bw, between(400, 4500, 10), between(Math.max(400, bw - 300), bw + 600, 10)]);
  const wG = (cur < bw) ? bw : cur;
  const route = pick(['central', 'central', 'peripheral']);
  // Delivered volume per kg from 40 (50 on a peripheral line) to 160, so the
  // K⁺ in the bag stays under the route's maximum and the order can print.
  const perKg = route === 'peripheral' ? between(50, 160, 1) : between(40, 160, 1);
  const s = {
    name: `R${String(i).padStart(2, '0')} seed ${SEED0} random order`, i, bw, cur, dol: pick([1, 2, 3, 5, 7, 8, 14, 30, 60]), route,
    fluid: between(60, 180, 5), otherIV: pick([0, 0, between(0, 10, 0.5)]), drug: pick([0, 0, between(0, 10, 0.5)]), ioOut: between(5, 200, 1),
    tpn: rnd() < 0.12 ? 0 : Math.round(perKg * wG / 1000 * 2) / 2,
    dead: pick([0, 10, 20, 30, 50, between(0, 40, 1)]),
    dex: pick([0, between(2.5, 15, 0.5)]), aa: pick([0, between(0.5, 4, 0.1)]), lip: pick([0, between(0.5, 4, 0.1)]), lipH: pick([16, 20, 24]),
    naCl: pick([0, between(0, 5, 0.5)]), naAc: pick([0, between(0, 3, 0.5)]), glyNa: pick([0, between(0, 4, 0.5)]),
    kCl: pick([0, between(0, 2.5, 0.5)]), k2: pick([0, between(0, 1, 0.01)]), mg: pick([0, between(0, 0.8, 0.01)]), mgVial: '10',
    ca: pick([0, between(0, 120, 5)]), soluvit: rnd() > 0.2, pedi: rnd() > 0.2, zn: pick([0, between(0, 1, 0.05)]),
    hep: pick([0, 0.5, 1]), feed: 'BM_20', enVol: pick([0, between(0, 20, 0.5)]), enFreq: 8,
    weights: [{ dol: 1, w: bw }],
  };
  if (route === 'peripheral' && s.kCl + s.k2 > 2) { s.kCl = Math.min(s.kCl, 1.5); s.k2 = Math.min(s.k2, 0.5); }
  if (s.tpn === 0) { s.dex = 0; s.aa = 0; s.naCl = 0; s.naAc = 0; s.glyNa = 0; s.kCl = 0; s.k2 = 0; s.mg = 0; s.ca = 0; s.zn = 0; }
  return s;
}

// ── DOM helpers (the oracle's and clicks' patterns) ─────────────────────────
const container = document.getElementById('root');
let root = ReactDOM.createRoot(container);
const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
const selSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
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
  act(() => {
    input.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
    valueSetter.call(input, String(value)); input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  act(() => { input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })); });
}
// one character at a time, the way a keyboard does (verify-calc-clicks.cjs)
function typeChars(label, text) {
  const input = inputFor(label); if (!input) throw new Error('field not found: ' + label);
  act(() => { input.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true })); });
  act(() => { valueSetter.call(input, ''); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
  let cur = '';
  for (const ch of text) {
    cur += ch;
    act(() => { valueSetter.call(input, cur); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
    cur = input.value;
  }
  act(() => { input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })); });
}
function chipsAfter(label) {
  const input = inputFor(label);
  const host = input.closest('.field') || input.closest('.salt-row-grid');
  let sib = host.nextElementSibling;
  while (sib && !sib.classList.contains('preset-chips')) sib = sib.nextElementSibling;
  return sib ? [...sib.querySelectorAll('button')] : [];
}
function selectWith(optValue, value) {
  const sel = [...container.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === optValue));
  if (!sel) throw new Error('select not found for ' + optValue);
  act(() => { selSetter.call(sel, value); sel.dispatchEvent(new window.Event('change', { bubbles: true })); });
}
const click = (el) => { if (!el) throw new Error('click target missing'); act(() => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); };
const clickAsync = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await new Promise(r => setTimeout(r, 5)); }); };
function setCheck(labelStart, want) {
  const lab = [...container.querySelectorAll('label.chk-label')].find(l => l.textContent.trim().startsWith(labelStart));
  if (!lab) throw new Error('checkbox not found: ' + labelStart);
  const box = lab.querySelector('input[type=checkbox]');
  if (box.checked !== want) act(() => { box.click(); });
}
const btnExact = (txt) => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === txt);
const bodyText = () => container.textContent.replace(/\s+/g, ' ');
// "—" is how the form prints a zero figure
const numOrDash = (s) => { const t = String(s ?? '').trim(); if (t === '—') return 0; const m = t.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : null; };
const grabT = (re) => { const m = bodyText().match(re); return m ? numOrDash(m[1]) : null; };
const screenFigures = () => ({
  components: grabT(/Components(-?[\d.]+|—) mL/),
  bagTotal: grabT(/Bag total \(prepared\)(-?[\d.]+|—) mL/),
  cannotOnScreen: /cannot be compounded/.test(bodyText()),
});

// The pharmacy back page's "Aqueous bag — stock" table, line by line.
function readPrintBag() {
  const form = container.querySelector('#print-form');
  if (!form) return null;
  const table = [...form.querySelectorAll('table')].find(t => /Aqueous bag — stock/.test(t.querySelector('thead')?.textContent || ''));
  if (!table) return { error: 'no "Aqueous bag — stock" table on the print form' };
  const parts = [], notCounted = [];
  let make = null;
  for (const tr of table.querySelectorAll('tbody tr')) {
    const tds = [...tr.querySelectorAll('td')];
    const name = tds[0]?.textContent.trim();
    if (tds.length === 3) {
      const strong = tds[2].querySelector('strong');
      if (!strong) { notCounted.push(name); continue; }      // ZnSO₄: its mL is not in the WFI, by design
      parts.push({ name, ml: numOrDash(strong.textContent), text: strong.textContent.trim() });
    } else if (/^Water for injection q\.s\./.test(name || '')) {
      const t = tds[1].textContent.replace(/\s+/g, ' ');
      const m = t.match(/Components (-?[\d.]+|—) mL \+ WFI (-?[\d.]+|—) mL = (-?[\d.]+|—) mL prepared/);
      make = m ? { components: numOrDash(m[1]), wfi: numOrDash(m[2]), prepared: numOrDash(m[3]), overflowNote: /เกินปริมาตรถุง/.test(t) } : { error: t };
    }
  }
  return { parts, notCounted, make };
}
function readCopyBag() {
  if (typeof copied !== 'string') return null;
  const m = copied.match(/BAG MAKE-UP: +components (-?[\d.]+) mL \+ WFI q\.s\. (-?[\d.]+) mL = (-?[\d.]+) mL prepared/);
  return m ? { components: +m[1], wfi: +m[2], prepared: +m[3], cannot: /COMPONENTS EXCEED BAG VOLUME/.test(copied) } : { error: 'no BAG MAKE-UP line' };
}
const decimalsOf = (t) => { const m = String(t).match(/\.(\d+)/); return m ? m[1].length : 0; };

// ── bookkeeping ─────────────────────────────────────────────────────────────
let checks = 0; const failures = [];
const EPS = 1e-9;
function ok(sc, what, cond, detail) {
  checks++;
  if (!cond) failures.push({ sc: sc.name, what, detail, order: sc.i != null ? sc : undefined });
}
const r1 = (x) => Math.round(x * 10) / 10;

// ── one order ───────────────────────────────────────────────────────────────
async function fill(sc) {
  setField('Current weight', sc.cur);
  if (sc.tpnWtOverride) setField('TPN calc. weight', sc.tpnWtOverride);
  setField('Target fluid', sc.fluid);
  setField('Other IV', sc.otherIV);
  setField('Drug volume', sc.drug);
  selectWith('BM_20', sc.feed);
  setField('Volume(mL/feed)', sc.enVol);
  setField('Frequency', sc.enFreq);
  setCheck('MEN (trophic)', sc.men);
  click([...container.querySelectorAll('.step2-ctrl .seg button')].find(b => b.textContent === (sc.route === 'central' ? 'Central' : 'Peripheral')));
  if (sc.useRate) setField('Rate', sc.useRate); else setField('Volume(mL/day)', sc.tpn);
  setField('ปริมาตรคาสาย', sc.dead);
  setField('Dextrose final', sc.dex);
  setField('Amino acid', sc.aa);
  setField('20% lipid', sc.lip);
  click([...container.querySelectorAll('button')].find(b => b.textContent === `${sc.lipH}h`));
  setField('20% NaCl', sc.naCl);
  setField('Na Acetate', sc.naAc);
  setField('Glycophos', sc.glyNa);
  setField('KCl', sc.kCl);
  setField('K₂HPO₄', sc.k2);
  setField('MgSO₄', sc.mg);
  setField('10% Ca gluconate', sc.ca);
  setCheck('Soluvit N', sc.soluvit);
  setCheck('Peditrace', sc.pedi);
  setField('ZnSO₄', sc.zn);
  setField('Heparin(U/mL)', sc.hep);
  setField('Urine output', sc.ioOut);
  setField('Drain content', sc.drain);
}

// The stock lines the order must print: one per stock it uses.
function expectedLines(sc, Vd) {
  let n = 3;                                       // D50W, amino acid and heparin are always listed
  for (const k of ['naCl', 'naAc', 'glyNa', 'kCl', 'k2', 'mg', 'ca']) if (sc[k] > 0) n++;
  if (sc.soluvit && Vd > 0) n++;
  if (sc.pedi && Vd > 0) n++;
  return n;
}

// The sum check proper, on what is printed now. `label` says which save.
function sumCheck(sc, label, Vd) {
  const pb = readPrintBag();
  ok(sc, `${label}: print form rendered`, !!pb && !pb.error, pb && pb.error);
  if (!pb || pb.error) return null;
  const { parts, make } = pb;
  ok(sc, `${label}: BAG make-up line parsed`, !!make && !make.error, make && make.error);
  if (!make || make.error) return null;
  ok(sc, `${label}: one stock line per stock used`, parts.length === expectedLines(sc, Vd), parts.map(p => `${p.name} ${p.text}`));
  ok(sc, `${label}: every stock mL parsed`, parts.every(p => p.ml !== null && isFinite(p.ml)), parts);
  const S = parts.reduce((a, p) => a + p.ml, 0);
  const hundredths = parts.some(p => decimalsOf(p.text) >= 2 && !/0$/.test(p.text));
  const TOL = (hundredths ? 0.05 : 0) + EPS;
  const sr = Math.round(S * 100) / 100;           // S is exact to 0.01; drop the float tail before comparing
  const scr = screenFigures();
  const cp = readCopyBag();
  const detail = { parts: parts.map(p => `${p.name.slice(0, 22)}=${p.text}`), sumParts: sr, printed: make, screen: scr, copy: cp, TOL };
  if (sc.expectMake && label === 'save 1') {
    ok(sc, `${label}: printed bag line is ${JSON.stringify(sc.expectMake)}`, ['components', 'wfi', 'prepared'].every(k => make[k] === sc.expectMake[k]), make);
    ok(sc, `${label}: no "Bag cannot be compounded" alert`,
      ![...container.querySelectorAll('.calc-bottom .alert-row .title')].some(t => t.textContent === 'Bag cannot be compounded'));
    ok(sc, `${label}: copy does not say cannot compound`, !!cp && !cp.cannot, cp);
  }
  if (make.wfi < 0) {
    // Over-full bag: no sum to close; the three surfaces must each say so.
    ok(sc, `${label}: over-full bag → "Bag cannot be compounded" alert on screen`,
      [...container.querySelectorAll('.calc-bottom .alert-row.crit .title')].some(t => t.textContent === 'Bag cannot be compounded'), detail);
    ok(sc, `${label}: over-full bag → screen says cannot be compounded`, scr.cannotOnScreen, detail);
    ok(sc, `${label}: over-full bag → print form says เกินปริมาตรถุง`, make.overflowNote, detail);
    ok(sc, `${label}: over-full bag → copy says cannot compound`, !!cp && cp.cannot, detail);
    ok(sc, `${label}: copy WFI = print WFI`, !!cp && Math.abs(cp.wfi - make.wfi) <= EPS, detail);
    return { make, S: sr, overflow: true };
  }
  ok(sc, `${label}: no "cannot be compounded" on a bag with WFI ≥ 0`, !scr.cannotOnScreen && !make.overflowNote, detail);
  ok(sc, `${label}: Σ(printed stock mL) + printed WFI = printed prepared (±${TOL > EPS ? '0.05' : '0'})`,
    Math.abs(sr + make.wfi - make.prepared) <= TOL, detail);
  ok(sc, `${label}: printed Components + WFI = prepared, exactly`, Math.abs(make.components + make.wfi - make.prepared) <= EPS, detail);
  ok(sc, `${label}: Σ(printed stock mL) = printed Components (±${TOL > EPS ? '0.05' : '0'})`, Math.abs(sr - make.components) <= TOL, detail);
  if (Vd > 0) {
    ok(sc, `${label}: Σ(printed stock mL) = on-screen Components (±${TOL > EPS ? '0.05' : '0'})`, scr.components !== null && Math.abs(sr - scr.components) <= TOL, detail);
    ok(sc, `${label}: on-screen Components = printed Components`, scr.components === make.components, detail);
    ok(sc, `${label}: on-screen Bag total = printed prepared`, scr.bagTotal === make.prepared, detail);
  }
  ok(sc, `${label}: copy BAG MAKE-UP present`, !!cp && !cp.error, cp);
  if (cp && !cp.error) {
    ok(sc, `${label}: copy WFI = print WFI`, Math.abs(cp.wfi - make.wfi) <= EPS, detail);
    ok(sc, `${label}: copy components = print Components`, Math.abs(cp.components - make.components) <= EPS, detail);
    ok(sc, `${label}: copy prepared = print prepared`, Math.abs(cp.prepared - make.prepared) <= EPS, detail);
  }
  if (sc.expectRow && label === 'save 1') for (const [name, ml] of Object.entries(sc.expectRow)) {
    const row = parts.find(p => p.name === name);
    ok(sc, `${label}: ${name} prints ${ml} mL`, !!row && row.ml === ml, row);
  }
  return { make, S: sr, overflow: false };
}

async function copyNow() {
  copied = null;
  const btn = [...container.querySelectorAll('button')].find(b => /Copy Order to Clipboard/.test(b.textContent));
  if (btn) await clickAsync(btn);
}

async function run(scIn, idx) {
  const sc = { ...BASE, ...scIn };
  const calls = { onLog: 0, onUpdate: 0 };
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear(); copied = null;
  const patient = { sessionId: 'SUM-' + sc.name.slice(0, 3).trim(), name: 'Sum', initials: 'SM', bw: sc.bw, ga: 30, sex: 'boys',
    admissionDate: '2026-09-01', currentBed: 'NICU 1', diagnosis: '-', weights: sc.weights, lengths: [], hcs: [] };
  act(() => {
    root.render(React.createElement(window.Calculator, {
      patient, dol: sc.dol, editEntry: null, baselineEntry: null, previousEntry: null, logDate: null,
      userLabel: 'Dr Sum (sum@kcmh.test)', userEmail: 'sum@kcmh.test',
      onLog: () => { calls.onLog++; return Promise.resolve({ ok: true, entryId: 'srv-sum', lastModified: '2026-10-11T01:00:00.000Z' }); },
      onUpdate: () => { calls.onUpdate++; return Promise.resolve({ ok: true, lastModified: '2026-10-11T02:00:00.000Z' }); },
      onSaved() {}, onWeightChange() {},
    }));
  });
  click(btnExact('Open all'));
  await fill(sc);
  const Vd = sc.useRate ? Number((sc.useRate * 24).toFixed(2)) : sc.tpn;

  // ── save 1 ──
  const saveBtn = btnExact('Submit');
  const dosingG = sc.tpnWtOverride > 0 ? sc.tpnWtOverride : (sc.cur < sc.bw ? sc.bw : sc.cur);
  const orderable = dosingG >= 200 && dosingG <= 8000;
  ok(sc, 'Submit enabled exactly when the order can be saved', !!(saveBtn && !saveBtn.disabled) === orderable, { disabled: saveBtn?.disabled, dosingG });
  if (!orderable) {
    // No print, no copy: nothing to add up. The screen still shows the bag.
    ok(sc, 'not orderable → no print form', !container.querySelector('#print-form'));
    return 'screen only (not orderable)';
  }
  await clickAsync(saveBtn);
  ok(sc, 'save 1 reached onLog', calls.onLog === 1, calls);
  await copyNow();
  const first = sumCheck(sc, 'save 1', Vd);
  if (sc.overflow) ok(sc, 'S4 is over-full, as built', !!first && first.overflow, first);
  if (!first) return 'no print';

  // ── wired-in: change one input the way a person does ──
  const before = screenFigures();
  // Alternate the two ways in: a chip on even orders, typing on odd ones.
  const useChip = Vd > 0 && idx % 2 === 0;
  let newVd = Vd, newDead = sc.dead, how;
  if (useChip) {
    newDead = [30, 50, 100].find(v => v !== sc.dead);
    const chip = chipsAfter('ปริมาตรคาสาย').find(c => Number(c.textContent) === newDead);
    ok(sc, `dead-space chip ${newDead} exists`, !!chip);
    if (!chip) return 'no chip';
    click(chip);
    how = `dead-space chip ${sc.dead} → ${newDead} mL`;
  } else {
    newVd = Vd > 0 ? Vd + 12.5 : 60;
    typeChars('Volume(mL/day)', String(newVd));
    how = `TPN volume typed ${Vd} → ${newVd} mL/day`;
  }
  const after = screenFigures();
  const wantPrepared = r1(newVd + newDead);
  ok(sc, `wired-in (${how}): on-screen Bag total moves to delivered + dead`,
    after.bagTotal !== null && Math.abs(after.bagTotal - wantPrepared) <= 0.05 + EPS, { before, after, wantPrepared });
  ok(sc, `wired-in (${how}): on-screen Bag total changed`, after.bagTotal !== before.bagTotal, { before, after });
  if (useChip && sc.dex > 0) ok(sc, `wired-in (${how}): on-screen Components changed (D50W follows the prepared volume)`,
    after.components !== before.components, { before, after });
  ok(sc, `wired-in (${how}): the stale print form is withdrawn until saved`, !container.querySelector('#print-form'));

  // ── save 2: the reprint carries the new figures, and still adds up ──
  await clickAsync(btnExact('Submit'));
  ok(sc, 'save 2 updated the same row', calls.onLog === 1 && calls.onUpdate === 1, calls);
  await copyNow();
  const second = sumCheck(sc, `save 2 (${how})`, newVd);
  if (second) {
    ok(sc, `wired-in (${how}): reprinted prepared = the new on-screen Bag total`, second.make.prepared === after.bagTotal, { second: second.make, after });
    ok(sc, `wired-in (${how}): reprinted prepared differs from the first print`, second.make.prepared !== first.make.prepared, { first: first.make, second: second.make });
  }
  return null;
}

(async () => {
  const ORDERS = [...ORACLE, ...OWN];
  for (let i = 0; i < COUNT; i++) ORDERS.push(randomOrder(i));
  console.log(`\n── ${ORDERS.length} orders (12 oracle, ${OWN.length} own, ${COUNT} random from seed ${SEED0}): the printed bag adds up, and the screen moves with a click ──`);
  for (const [idx, sc] of ORDERS.entries()) {
    const f0 = failures.length, c0 = checks;
    let note = null;
    try { note = await run(sc, idx); }
    catch (err) { failures.push({ sc: sc.name, what: 'order threw', detail: String(err && err.stack || err).split('\n').slice(0, 3).join(' | ') }); }
    const bad = failures.length - f0;
    console.log(`  ${bad ? 'FAIL' : 'PASS'}  ${sc.name.slice(0, 64).padEnd(64)} ${String(checks - c0).padStart(3)} checks${note ? `  (${note})` : ''}${bad ? `  ${bad} failed` : ''}`);
  }
  for (const f of failures.slice(0, 40)) {
    console.log(`  FAILED · ${f.sc} · ${f.what}\n         ${JSON.stringify(f.detail)}${f.order ? `\n         order ${JSON.stringify(f.order)}` : ''}`);
  }
  if (failures.length > 40) console.log(`  … and ${failures.length - 40} more`);
  console.log(failures.length === 0
    ? `\nCALC SUM: ALL PASS (${ORDERS.length} orders, ${checks} checks)`
    : `\nCALC SUM: ${failures.length} FAILED of ${checks} checks`);
  process.exit(failures.length === 0 ? 0 : 1);
})();
