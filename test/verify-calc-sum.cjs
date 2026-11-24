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
//       a. Σ(printed stock mL) + printed WFI = printed prepared, within the
//          WFI's rounding (more than −0.5, at most +0.5 mL) and TOL
//       b. the printed WFI is whole mL, printed prepared − printed Components
//          rounded half up (2026-11-16: "SWI ขอไม่มีทศนิยม"; until then
//          Components + WFI = prepared exactly), so the line reads "→", and
//          Components + WFI is the prepared volume to within that rounding
//       c. Σ(printed stock mL) = printed Components and on-screen Components,
//          within TOL; on-screen Components and Bag total (prepared) equal the
//          printed ones
//       d. the table has one line per stock the order uses (a dropped line
//          would otherwise make the sum easier to pass, not harder)
//     When the WFI is negative the order cannot be submitted (Pp, 2026-10-28):
//     over-full is read off the screen (Components above Bag total, both as
//     shown), the stop is asserted there, and an over-full bag that prints fails.
//
// 1b · THE QUICK CALC'S COPY. The same order is typed into the quick calc, the
//     one place NeoFeed still copies from (Pp: "test quick calc copies text"),
//     and its Copy's BAG MAKE-UP line must carry the quick calc's own on-screen
//     Components and Bag total, carry the WFI the rule gives (whole mL from
//     prepared − components since 2026-11-16, the exact shortfall when below
//     0; it closed exactly before), and say COMPONENTS EXCEED BAG VOLUME
//     exactly when the screen says the bag cannot be compounded.
//
// THE TOLERANCE, from the app's rounding chain (calculator.jsx, solVol and the
// bag make-up block):
//   · each stock mL is rounded once, to one decimal, half up (roundMl, Pp
//     2026-10-27; K₂HPO₄, MgSO₄, ZnSO₄ and heparin had two). The print shows
//     it at that same precision, so the printed part p_i IS the value the app
//     summed. S = Σ p_i is exact to 0.01.
//   · componentVol C = toFixed(1)(S), so |S − C| ≤ 0.05.
//   · the print shows P = Vp at 1 decimal (D.displayNum), and since NF-17 the
//     app takes wfiVol W = P − C from that same printed figure, so C + W = P
//     exactly, for any Vp. (Before the fix W = toFixed(1)(Vp − C), which
//     broke the equation by 0.1 mL when Vp ended in a hundredths 5: order S7.)
//   ⇒ |S + W − P| = |S − C| ≤ 0.05 mL.
//   TOL = 0.05 mL (+1e-9 for float noise) when any printed part has a non-zero
//   hundredths digit; 0 (+1e-9) when every part is a whole tenth, since then
//   S = C. Check (b) is exact (1e-9). Nothing looser is justified.
//   Since 2026-11-16 (Pp, for the TPN unit): D50W on a bag with dead space,
//   the amino acid and the WFI are whole mL, half up; every other part keeps
//   one decimal. W = P − C rounded to the whole mL when P − C ≥ 0 (the exact
//   shortfall when below: refused), so C + W − P lies in (−0.5, +0.5]. Check (b)
//   is that rounding, exactly (wholeWfi, in tenths), and (a) is |S + W − P|
//   inside the same half mL, plus TOL. Still nothing looser.
//
// 2 · WIRED-IN CHECK. After the first save each order changes one input the
//     way a person does — a click on a dead-space preset chip, or a new TPN
//     volume typed a character at a time — and the harness asserts that the
//     on-screen Bag total (prepared) moves to the new delivered + dead volume,
//     rounded up to the next 10 mL above it when there is dead space (input
//     arithmetic from the 2026-11-16 rule, preparedOf, not the app's formula;
//     the chip picked is one that moves the bag), that Components moves when it
//     must (a dead-space change on a bag with dextrose), that the stale print
//     form is withdrawn while unsaved, and that after the second save the
//     reprinted form carries the new figures and its parts still add up.
//
// 3 · TWO FEEDS (Step 2's second feed, PR #182 and #185). Every fluid and
//     nutrient figure is the sum of the day's two feeds, so each two-feed
//     order runs four times on the same infant and bag: no feed, feed 1 alone,
//     feed 2 alone (in feed 1's place), and both. Asserted:
//       a. the saved Daily_Log row, at full precision: for fluid, kcal,
//          protein, Na, K, Ca, P and EN mL/kg/d, both − none =
//          (feed 1 − none) + (feed 2 − none), within 1e-9 relative
//       b. on screen, "Delivered per kg from EN": both = feed 1 + feed 2,
//          within one unit of the last digit shown (three roundings, each
//          ≤ half a unit, on one grid)
//       c. printed, energy from EN ("total incl. EN" − "Energy (TPN)" per kg):
//          both = feed 1 + feed 2 within 2 kcal/kg (four roundings to whole
//          kcal); protein from EN (summary Protein − amino acid per kg, which
//          prints as typed): within 0.01 g/kg (three roundings)
//       d. from the inputs alone: each feed's "= X mL/day · Y mL/kg/d", the EN
//          volume tile, the total line's feeds a day and interval, each feed's
//          share of it, and Prescribed rising by both feeds' mL/day
//     The feeds must move no printed bag line, TPN energy or amino acid, and the
//     two-feed print must add up as in 1. Then one feed input changes the way a
//     person changes it (feed 2's volume typed, its kcal/oz picked, or the
//     frequencies typed through a refused 7 a day), and the feed lines, the EN
//     tile, the delivered kcal, the withdrawn form and the reprint follow.
//     A feeds-only order without its feeds is an empty day, which cannot be
//     submitted; its row is then all zeros.
//
// 4 · ONE FIGURE, ONE NUMBER (BACKLOG: osmolarity, energy, Ca and P .5 ties;
//     2026-11-15). Four orders whose figure is a half on paper and a float
//     just under it in JS: osmolarity 899.5 on a peripheral line (computed
//     899.4999999999999), energy 43.5 kcal/kg/d, P 15.5 mg/kg/d and a bag's
//     Ca gluconate 76.5 mg. Each must read the same whole number, rounded half
//     up from the paper figure, everywhere it is shown: the tile, Step 3's
//     chip, the alert line, the energy card, the printed sheet (front and back),
//     the front's saved printedFigures and the TPN room's sticker figures. Two
//     more (Vera) put oral vitamin D (502.5 IU/day) and oral Ca (56.5 mg/day) on
//     a tie: Step 6, the front sheet and the saved suppVitD_IU / suppCa_mg.
//     toFixed(0) and Math.round read the float, so before this check the alert
//     said "899 mOsm/L" beside a red 900 tile. The wanted figures are the
//     paper arithmetic, written into each order, not the app's formula.
//
// Orders: the oracle's 12 scenarios (copied, not imported), eight written for
// this check — a 900 g infant on day 3 of TPN, a term infant, a bag a few mL
// short of its prepared volume, one that overflows it, K₂HPO₄ and MgSO₄ under
// 0.05 mL (0 mL, so not orderable since 2026-10-27), hundredths that carry across the sum, a prepared volume with a
// second decimal (130.45 mL with no dead space since 2026-11-16; it was
// 80.45 + 50), components that fill such a bag exactly (WFI 0, no over-full
// alert), and a bag 0.3 mL short whose whole-mL WFI is 0 (S10) — and SUM_N seeded random orders (default 40,
// seed SUM_SEED 20261011; the seed and the whole order print with a failure).
// Then 3's three two-feed orders: 6 + 2 beside a bag, 4 + 4 feeds only, and
// 5 + 3 on a peripheral line.
//
// NEGATIVE_CONTROL proves the harness bites. It patches calculator.jsx in
// memory before the transform and must then FAIL:
//   1  heparin dropped from componentVol (a stock printed but not counted)
//   2  WFI taken from the delivered volume instead of the prepared one
//   3  deadVol_mL dropped from the calculation's useMemo dependencies, so a
//      dead-space chip changes the input but not the figure on screen
//   4  feed 2 left out of the day's EN volume
//   5  both feeds costed as feed 1's milk
//   6  enVol2 dropped from the feeds' useMemo dependencies, so feed 2's
//      volume typed changes the input but not the figures on screen
//   7  the peripheral osmolarity alert back on toFixed(0) (899 beside a red 900)
//   8  the printed sheet's f0 back on Math.round (Ca gluconate 76 mg, not 77)
// The patched text is transformed under another file name, so the compiled
// loader cannot swap compiled/calculator.js in for it (and says nothing was
// swapped for calculator).
//
// Usage: node test/verify-calc-sum.cjs   ·   SUM_N=100 for a deeper local run,
// SUM_N=0 for the fixed orders only.
// Dev-only deps as in test/README.md (react@18 react-dom@18 @babel/core
// @babel/preset-react jsdom).
const fs = require('fs');
const { printFormTicked: __printFormTicked } = require('./print-acks-helper.cjs');
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
// The quick calc's Copy writes here (section 1b).
let copied = null;
const clipboardStub = { writeText: (t) => { copied = t; return Promise.resolve(); } };
try { Object.defineProperty(window.navigator, 'clipboard', { value: clipboardStub, configurable: true }); }
catch { try { window.navigator.clipboard.writeText = clipboardStub.writeText; } catch { /* left to fail loudly at the copy assertion */ } }
try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true }); } catch {}
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
{ const w = console.error; console.error = (...a) => { if (!/act\(|not wrapped|Not implemented/.test(String(a[0]))) w(...a); }; }
vm.runInThisContext(R('data.js'));
// FBM with HMF is hidden from Step 2 (Pp, 2026-11-11); saved orders still compute on
// BM_HMF_24, so this harness unhides it to reach that row.
for (const p of window.NEOFEED_DATA.EN_PRODUCTS || []) if (p.id === 'bmHmf') p.hidden = false;

// ── the negative controls: patch the source text, never the expectation ─────
const PATCHES = {
  1: ['soluvitVol + peditrace_vol + solVol.znso4 + solVol.heparin\n',
      'soluvitVol + peditrace_vol + solVol.znso4\n',
      'heparin dropped from componentVol'],
  2: ['const wfiExact = parseFloat((Number(D.displayNum(preparedVol, 1)) - componentVol).toFixed(1));',
      'const wfiExact = parseFloat((Number(D.displayNum(totalTPN_mL, 1)) - componentVol).toFixed(1));',
      'WFI from the delivered volume, not the prepared one'],
  3: ['totalTPN_mL, deadVol_mL, dexPct, aaPerKg, aaStockKey, lipidPerKg,',
      'totalTPN_mL, dexPct, aaPerKg, aaStockKey, lipidPerKg,',
      'deadVol_mL dropped from the useMemo dependencies'],
  4: ['const enVolTotal = enFeeds.reduce((s, f) => s + f.mlPerDay, 0);',
      'const enVolTotal = enFeeds[0].mlPerDay;',
      'feed 2 left out of the day\'s EN volume'],
  5: ['const en = D.enMixPer100mL(enFeeds) || EN_NO_FEED;',
      'const en = D.EN_DB[enFeeds[0].key] || EN_NO_FEED;',
      'both feeds costed as feed 1\'s milk'],
  6: ['], [enType, enVol, enFreq, enType2, enVol2, enFreq2, !centerPoint]);',
      '], [enType, enVol, enFreq, enType2, enFreq2, !centerPoint]);',
      'enVol2 dropped from the feeds\' useMemo dependencies'],
  7: ['body: `${fmt(calc.osm, 0)} mOsm/L — a peripheral',
      'body: `${calc.osm.toFixed(0)} mOsm/L — a peripheral',
      'the peripheral osmolarity alert reads the float with toFixed(0)'],
  8: ['const f0 = (n)      => f(n, 0);',
      'const f0 = (n)      => (isFinite(n) && n > 0) ? Math.round(n).toString() : "—";',
      'the printed sheet\'s whole numbers from Math.round'],
};
const transform = (code, filename) => babel.transformSync(code, {
  presets: [[require('@babel/preset-react'), { runtime: 'classic' }]], filename, configFile: false, babelrc: false }).code;
vm.runInThisContext(transform(R('icons.jsx'), 'icons.jsx'));
if (NEG) {
  const p = PATCHES[NEG];
  if (!p) { console.error(`NEGATIVE_CONTROL=${NEG}: use one of ${Object.keys(PATCHES).join(', ')}`); process.exit(2); }
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
  naCl: 0, naAc: 0, glyNa: 0, kCl: 0, k2: 0, mg: 0, ca: 0,
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
    naCl: 3, glyNa: 2, kCl: 2, mg: 0.5, ca: 80, zn: 0.3, hep: 1,
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
  // FBM_INF_MIX left Step 2 on 2026-11-06 (Pp: feed 1 + feed 2 give it).
  // NUTRAMIGEN_20, HIQPEPTI_GASTRO_27 and LF_40 joined on 2026-11-24 (Pp).
  ...['BM_PF_20', 'PRENAN_22', 'FBM_PF_24', 'LF_20', 'LF_27', 'NUTRAMIGEN_20', 'HIQPEPTI_GASTRO_27', 'LF_40'].map((k) => ({
    name: `G feed ${k} (feeds only)`, bw: 1200, cur: 1500, dol: 12, fluid: 160, ioOut: 70, tpn: 0,
    feed: k, enVol: 28, enFreq: 8, weights: [{ dol: 11, w: 1490 }] })),
];
const OWN = [
  { name: 'S1 900 g infant, day 3 of TPN', bw: 900, cur: 900, dol: 3, fluid: 120, ioOut: 35, tpn: 90, dead: 30,
    dex: 10, aa: 3, lip: 2, naCl: 1, glyNa: 1, kCl: 1, k2: 0.5, mg: 0.3, ca: 40, hep: 0.5, weights: [{ dol: 1, w: 900 }] },
  { name: 'S2 term infant 3.4 kg, central, every bag stock', bw: 3400, cur: 3350, dol: 5, fluid: 100, ioOut: 120,
    tpn: 300, dead: 50, dex: 12.5, aa: 3, lip: 3, naCl: 2, naAc: 1, glyNa: 2, kCl: 1.5, k2: 0.5, mg: 0.4, ca: 60, hep: 1,
    weights: [{ dol: 1, w: 3400 }] },
  // S3 leaves 0.6 mL, which prints as 1 mL of WFI since 2026-11-16 (49.4 + 1 → 50,
  // 0.4 mL over, inside the half mL the whole-mL WFI allows). S10 below leaves 0.3.
  { name: 'S3 near the bag volume limit (0.6 mL left, WFI 1 mL)', bw: 1000, cur: 1000, dol: 8, fluid: 150, ioOut: 50,
    tpn: 50, dead: 0, dex: 20, aa: 2.3, naCl: 3, kCl: 2, ca: 20, hep: 0.6, weights: [{ dol: 1, w: 1000 }],
    expectMake: { components: 49.4, wfi: 1, prepared: 50 } },
  { name: 'S4 over the bag volume limit (cannot be compounded)', bw: 1000, cur: 1000, dol: 8, fluid: 150, ioOut: 50,
    tpn: 50, dead: 0, dex: 20, aa: 2.6, naCl: 3, kCl: 2, ca: 20, hep: 0.6, weights: [{ dol: 1, w: 1000 }], overflow: true },
  // S5 printed K₂HPO₄ and MgSO₄ as 0.01 mL until 2026-10-27; at one decimal
  // they are 0 mL, which cannot be submitted (stocksAtZero).
  { name: 'S5 K2HPO4 and MgSO4 under 0.05 mL (0 mL, not orderable)', bw: 500, cur: 500, dol: 8, fluid: 140, ioOut: 20, tpn: 40, dead: 0,
    dex: 7.5, aa: 2, naCl: 1, k2: 0.02, mg: 0.02, hep: 0.5, weights: [{ dol: 1, w: 500 }], expectZero: ['k2', 'mg'] },
  { name: 'S6 hundredths carried across the sum', bw: 700, cur: 700, dol: 9, fluid: 150, ioOut: 30, tpn: 70, dead: 30,
    dex: 10, aa: 3, naCl: 2, k2: 0.07, mg: 0.05, ca: 30, hep: 0.7, weights: [{ dol: 1, w: 700 }] },
  // S7 is the regression case for the NF-17 WFI fix (Pp, 2026-10-11). Before it, 130.45 mL
  // prepared printed "87.5 + WFI 42.9 = 130.5": displayNum rounded the tie up and toFixed
  // rounded 42.94999… down. WFI now comes from the printed prepared volume (87.5 + 43 = 130.5).
  // CHANGELOG.md, 2026-10-11 (8). Do not loosen the tolerance to make it pass.
  // Until 2026-11-16 S7 was 80.45 + 50 mL. A bag with dead space is now prepared
  // at a multiple of 10 mL, so a second decimal comes only with no dead space:
  // 130.45 mL delivered is the bag. Ca 37 mg/kg makes the components 64.0 mL
  // (D50W 26.1, amino acid 30, NaCl 0.6, KCl 0.5, Ca 4.1, heparin 0.7, Soluvit
  // and Peditrace 1 each), so the printed 130.5 leaves 66.5 → 67 mL of whole-mL
  // WFI, where the unrounded 130.45 would leave 66.45 → 66.
  { name: 'S7 prepared volume with a second decimal (130.45 mL, no dead space)', bw: 1000, cur: 1000, dol: 10, fluid: 150, ioOut: 50,
    tpn: 130.45, dead: 0, dex: 10, aa: 3, naCl: 2, kCl: 1, ca: 37, hep: 0.5, weights: [{ dol: 1, w: 1000 }],
    expectMake: { components: 64, wfi: 67, prepared: 130.5 } },
  // S8: the over-full alert at the same tie (Vera, NF-17 review). 130.45 mL prepared prints 130.5;
  // the components (130.48 → 130.5) fill it exactly. WFI is 0 and no alert fires. Before the fix the
  // WFI was 130.45 − 130.5 → −0.1 and the bag was called over-full by 0.1 mL.
  { name: 'S8 components fill the printed bag exactly at the tie (WFI 0)', bw: 2000, cur: 2000, dol: 10, fluid: 120,
    ioOut: 80, tpn: 130.45, dead: 0, dex: 20, aa: 3.5, naCl: 2, kCl: 1, ca: 6, hep: 0.6, weights: [{ dol: 1, w: 2000 }],
    expectMake: { components: 130.5, wfi: 0, prepared: 130.5 } },
  // S8 still sits on its tie after 2026-11-16: a bag with no dead space keeps
  // D50W at one decimal (52.2), so the components are 130.5 and the WFI 0.
  // S10 (2026-11-16): S3 with Ca 22.5 mg/kg (2.5 mL) leaves 0.3 mL, which whole-
  // mL WFI prints as 0 (49.7 + 0 → 50). It is not over-full and must still order.
  { name: 'S10 0.3 mL left: whole-mL WFI 0, still orderable', bw: 1000, cur: 1000, dol: 8, fluid: 150, ioOut: 50,
    tpn: 50, dead: 0, dex: 20, aa: 2.3, naCl: 3, kCl: 2, ca: 22.5, hep: 0.6, weights: [{ dol: 1, w: 1000 }],
    expectMake: { components: 49.7, wfi: 0, prepared: 50 } },
  // S9: Glycophos typed by P (Pp, 2026-11-06). 20 mg P/kg is 20/31 mL/kg, a dose
  // with no end to its decimals: the printed bag must still add up. glyNa is the
  // same dose in mEq Na, for stocksAtZero and expectedLines.
  { name: 'S9 Glycophos typed as P 20 mg/kg (20/31 mL/kg)', bw: 1300, cur: 1300, dol: 9, fluid: 150, ioOut: 50,
    tpn: 150, dead: 30, dex: 10, aa: 3, lip: 2, naCl: 2, glyPmg: 20, glyNa: 40 / 31, kCl: 1.5, ca: 40, hep: 0.5,
    weights: [{ dol: 1, w: 1300 }] },
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
    kCl: pick([0, between(0, 2.5, 0.5)]), k2: pick([0, between(0, 1, 0.01)]), mg: pick([0, between(0, 0.8, 0.01)]), 
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
// `scope` narrows the search to one part of the Calculator: feed 2's box has
// the same field labels as feed 1's.
function inputFor(label, scope = container) {
  const field = [...scope.querySelectorAll('.field')].find(d => d.querySelector('label')?.textContent.startsWith(label));
  if (field) return field.querySelector('input');
  const row = [...scope.querySelectorAll('.salt-row-grid')]
    .find(d => d.firstElementChild?.firstElementChild?.textContent.startsWith(label));
  return row ? row.querySelector('input') : null;
}
function setField(label, value, scope) {
  const input = inputFor(label, scope);
  if (!input) throw new Error('field not found: ' + label);
  act(() => {
    input.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
    valueSetter.call(input, String(value)); input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  act(() => { input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })); });
}
// one character at a time, the way a keyboard does (verify-calc-clicks.cjs)
function typeChars(label, text, scope) {
  const input = inputFor(label, scope); if (!input) throw new Error('field not found: ' + label);
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
// Step 2 picks the milk, then its kcal/oz (Pp, 2026-10-28): set both selects
// of feed 1 (or 2) from one EN_DB key.
function selectFeed(key, feed = 1) {
  const at = window.NEOFEED_DATA.enProductOf(key);
  if (!at) throw new Error('Step 2 does not offer ' + key);
  for (const [cls, v] of [['en-product', at.product.id], ['en-strength', key]]) {
    const sel = container.querySelector(`.en-feed-${feed} .${cls}`);
    if (!sel) throw new Error(`no .${cls} on feed ${feed}`);
    act(() => { selSetter.call(sel, v); sel.dispatchEvent(new window.Event('change', { bubbles: true })); });
  }
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
  overGiven: grabT(/· 24 ชม\. ได้ ([\d.]+) mL เกิน/),
  pumpRate: (() => { const v = [...container.querySelectorAll('.field')].find(d => d.querySelector('label')?.textContent.startsWith('Rate'))?.querySelector('input')?.value; return v ? Number(v) : null; })(),
  cannotOnScreen: /cannot be compounded/.test(bodyText()),
  // The Osmolarity tile's value, as the doctor reads it (2026-11-15: the front sheet prints it too).
  osm: (() => { const m = [...container.querySelectorAll('.metric')].find(d => d.querySelector('.lbl')?.textContent.trim() === 'Osmolarity'); return m ? numOrDash(m.querySelector('.val')?.firstChild?.textContent) : null; })(),
  // The K⁺ in bag tile's value (2026-11-19: the front sheet prints it too, for the TPN unit).
  kBag: (() => { const m = [...container.querySelectorAll('.metric')].find(d => d.querySelector('.lbl')?.textContent.trim() === 'K⁺ in bag'); return m ? numOrDash(m.querySelector('.val')?.firstChild?.textContent) : null; })(),
});
// The front sheet's small "K⁺ in bag N mEq/L" beside the K⁺ group (null when it is not printed).
const printedKBag = () => { const t = __printFormTicked(container)?.querySelector('.print-kbag')?.textContent; const m = t && t.match(/K⁺ in bag (-?[\d.]+) mEq\/L/); return m ? Number(m[1]) : null; };
// The front sheet's small "Bag osm N mOsm/L" on the Total Volume line (null when it is not printed).
// The front sheet's heparin line: its mL (null when it prints "—" or is missing). Ward, 2026-11-16.
const printedFrontHeparinMl = () => { const t = __printFormTicked(container)?.querySelector('.print-heparin')?.textContent.replace(/\s+/g, ' '); const m = t && t.match(/unit\/mL ?(-?[\d.]+) mL/); return m ? Number(m[1]) : null; };
const printedOsm = () => { const t = __printFormTicked(container)?.querySelector('.print-osm')?.textContent; const m = t && t.match(/Bag osm (-?[\d.]+) mOsm\/L/); return m ? Number(m[1]) : null; };

// The pharmacy back page's "Aqueous bag — stock" table, line by line.
function readPrintBag() {
  const form = __printFormTicked(container);
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
      if (!strong) { notCounted.push(name); continue; }      // a line with no mL (none today; ZnSO₄ had none until 2026-10-27)
      parts.push({ name, ml: numOrDash(strong.textContent), text: strong.textContent.trim() });
    } else if (/^Water for injection q\.s\./.test(name || '')) {
      const t = tds[1].textContent.replace(/\s+/g, ' ');
      // "→", not "=", since 2026-11-16: with a whole-mL WFI the two sides are
      // equal only to within half a mL.
      const m = t.match(/Components (-?[\d.]+|—) mL \+ WFI (-?[\d.]+|—) mL → (-?[\d.]+|—) mL prepared/);
      make = m ? { components: numOrDash(m[1]), wfi: numOrDash(m[2]), prepared: numOrDash(m[3]), overflowNote: /เกินปริมาตรถุง/.test(t) } : { error: t };
    }
  }
  return { parts, notCounted, make };
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

// The additive stocks whose mL rounds to 0 at one decimal, half up (Pp,
// 2026-10-27): such an order cannot be submitted. Restated from the stock
// strengths, not read off the app. Dextrose, amino acid, Soluvit and
// Peditrace cannot get there at the doses these orders use.
const rMl = (x) => Math.round(+(x * 10).toPrecision(12)) / 10;
// The prepared volume, restated from the rule (Pp, 2026-11-16), not read off
// the app: with a dead space, delivered + dead rounded UP to the next 10 mL
// strictly above the sum (48 + 30 = 78 → 80, 110 + 30 = 140 → 150); with none,
// the delivered volume as it is; no volume, no bag.
function preparedOf(Vd, dead) {
  if (!(Vd > 0)) return 0;
  if (!(dead > 0)) return Vd;
  const sum = Math.round((Vd + dead) * 100) / 100;
  return (Math.floor(sum / 10) + 1) * 10;
}
// The WFI as printed since 2026-11-16: what the printed prepared volume P leaves
// after the printed Components C, in whole mL, half up, from a non-negative
// remainder (an over-full bag is not printed). Worked in tenths so 50 − 49.4
// is 6 tenths, not 0.6000000000000014.
function wholeWfi(P, C) {
  const tenths = Math.round(P * 10) - Math.round(C * 10);
  return tenths < 0 ? tenths / 10 : Math.floor((tenths + 5) / 10);
}
function stocksAtZero(sc, dosingG, Vd, dead) {
  if (!(Vd > 0)) return [];
  const S = window.NEOFEED_DATA.KCMH_STOCK, Vp = preparedOf(Vd, dead), F = dosingG / 1000 * Vp / Vd;
  return [['naCl', S.naCl.naMeqPerMl], ['naAc', S.naAcetate.naMeqPerMl], ['glyNa', S.glycophos.naMeqPerMl],
    ['kCl', S.kCl.kMeqPerMl], ['k2', S.k2hpo4.kMeqPerMl], ['mg', S.mgso4_10.mgMeqPerMl], ['ca', S.caGluconate.caMgPerMl],
    ['zn', S.znso4.znMgPerMl]].filter(([k, perMl]) => sc[k] > 0 && rMl(sc[k] * F / perMl) === 0).map(([k]) => k)
    .concat(sc.hep > 0 && rMl(sc.hep * Vp / S.heparin.unitsPerMl) === 0 ? ['hep'] : []);
}

// ── one order ───────────────────────────────────────────────────────────────
// `scratch`: the quick calc, which has no birth weight to floor at and no
// Intake / Output card, so it is typed the dosing weight and no I/O.
async function fill(sc, scratch = false) {
  const floored = sc.cur < sc.bw ? sc.bw : sc.cur;
  setField('Current weight', scratch && !sc.tpnWtOverride ? floored : sc.cur);
  if (sc.tpnWtOverride) setField('TPN calc. weight', sc.tpnWtOverride);
  setField('Target fluid', sc.fluid);
  setField('Other IV', sc.otherIV);
  setField('Drug volume', sc.drug);
  selectFeed(sc.feed);
  setField('Volume(mL/feed)', sc.enVol);
  setField('Frequency', sc.enFreq);
  if (sc.feed2) {
    click(container.querySelector('.en-feed-add'));
    selectFeed(sc.feed2, 2);
    const box2 = container.querySelector('.en-feed-2');
    setField('Volume(mL/feed)', sc.enVol2, box2);
    setField('Frequency', sc.enFreq2, box2);
  }
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
  if (sc.glyPmg) {   // typed by P (Pp, 2026-11-06): the P button, then mg P/kg/d
    click([...container.querySelectorAll('.glycophos-by button')].find(b => b.textContent === 'P'));
    setField('Glycophos', sc.glyPmg);
  } else setField('Glycophos', sc.glyNa);
  setField('KCl', sc.kCl);
  setField('K₂HPO₄', sc.k2);
  setField('MgSO₄', sc.mg * 12.1525);   // typed in mg since 2026-10-28; sc.mg stays mEq
  setField('10% Ca gluconate', sc.ca);
  setCheck('Soluvit N', sc.soluvit);
  setCheck('Peditrace', sc.pedi);
  setField('ZnSO₄', sc.zn);
  setField('Heparin(U/mL)', sc.hep);
  if (sc.vitD) setField('Vitamin D', sc.vitD);          // Step 6 (§ 4's tie orders only)
  if (sc.oralCa) setField('ปริมาณ elem Ca', sc.oralCa);
  // An order with no bag and no lipid is submitted with "No TPN" ticked
  // (CR-NO-TPN-TICK, Pp 2026-11-01). It holds nothing to clear here.
  if (!['tpn', 'useRate', 'dex', 'aa', 'lip', 'naCl', 'naAc', 'glyNa', 'kCl', 'k2', 'mg', 'ca', 'zn'].some(k => sc[k] > 0)) setCheck('No TPN', true);
  if (scratch) return;
  setField('Urine output', sc.ioOut);
  setField('Drain content', sc.drain);
}

// The stock lines the order must print: one per stock it uses.
function expectedLines(sc, Vd) {
  let n = 3;                                       // D50W, amino acid and heparin are always listed
  // ZnSO₄ is a stock line counted in the WFI since 2026-10-27 (1 mg Zn/mL).
  for (const k of ['naCl', 'naAc', 'glyNa', 'kCl', 'k2', 'mg', 'ca', 'zn']) if (sc[k] > 0) n++;
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
  const detail = { parts: parts.map(p => `${p.name.slice(0, 22)}=${p.text}`), sumParts: sr, printed: make, screen: scr, TOL };
  if (sc.expectMake && label === 'save 1') {
    ok(sc, `${label}: printed bag line is ${JSON.stringify(sc.expectMake)}`, ['components', 'wfi', 'prepared'].every(k => make[k] === sc.expectMake[k]), make);
    ok(sc, `${label}: no "Bag cannot be made (ใส่ถุงไม่ได้)" alert`,
      ![...container.querySelectorAll('.calc-bottom .alert-row .title')].some(t => t.textContent === 'Bag cannot be made (ใส่ถุงไม่ได้)'));
  }
  // Over-full cannot be submitted since 2026-10-28, so it never reaches a print form.
  if (make.wfi < 0) {
    ok(sc, `${label}: an over-full bag (WFI ${make.wfi} mL) must not print`, false, detail);
    return null;
  }
  ok(sc, `${label}: no "cannot be compounded" on a bag with WFI ≥ 0`, !scr.cannotOnScreen && !make.overflowNote, detail);
  // Since 2026-11-16 the WFI is whole mL, half up, so Components + WFI is the
  // prepared volume to within half a mL: P − C rounded to the whole mL moves it
  // by more than −0.5 and at most +0.5 (a remainder of x.5 goes up). Until then
  // both sums were exact (b) or within TOL (a).
  const offTenths = Math.round((make.components + make.wfi - make.prepared) * 10);
  ok(sc, `${label}: printed WFI is whole mL`, Number.isInteger(make.wfi), detail);
  ok(sc, `${label}: printed WFI = printed prepared − printed Components, to the whole mL, half up`,
    make.wfi === wholeWfi(make.prepared, make.components), { ...detail, wantWfi: wholeWfi(make.prepared, make.components) });
  ok(sc, `${label}: printed Components + WFI = prepared, within the WFI's rounding (−0.5, +0.5]`, offTenths > -5 && offTenths <= 5, detail);
  ok(sc, `${label}: Σ(printed stock mL) + printed WFI = printed prepared, within the WFI's rounding${TOL > EPS ? ' ±0.05' : ''}`,
    sr + make.wfi - make.prepared > -0.5 - TOL + EPS && sr + make.wfi - make.prepared <= 0.5 + TOL, detail);
  ok(sc, `${label}: Σ(printed stock mL) = printed Components (±${TOL > EPS ? '0.05' : '0'})`, Math.abs(sr - make.components) <= TOL, detail);
  if (Vd > 0) {
    ok(sc, `${label}: Σ(printed stock mL) = on-screen Components (±${TOL > EPS ? '0.05' : '0'})`, scr.components !== null && Math.abs(sr - scr.components) <= TOL, detail);
    ok(sc, `${label}: on-screen Components = printed Components`, scr.components === make.components, detail);
    ok(sc, `${label}: on-screen Bag total = printed prepared`, scr.bagTotal === make.prepared, detail);
    // A bag with no dextrose, amino acid or electrolyte estimates 0: the sheet prints no figure for it.
    ok(sc, `${label}: front sheet's Bag osm = on-screen Osmolarity tile (none when it reads 0)`,
      scr.osm !== null && (scr.osm === 0 ? printedOsm() === null : printedOsm() === scr.osm), { ...detail, printedOsm: printedOsm() });
    // K⁺ in bag on the front (TPN unit, 2026-11-19): the tile's figure at one decimal, 0 included.
    // The tile shows the same value as a whole number, so the two sit within half a unit (rounding twice
    // can move the tile's side by 0.05: 44.46 prints 44.5, the tile 44).
    const pk = printedKBag();
    ok(sc, `${label}: front sheet's K⁺ in bag, one decimal, agrees with the on-screen K⁺ in bag tile`,
      scr.kBag !== null && pk !== null && /^-?\d+(\.\d)?$/.test(String(pk)) && Math.abs(pk - scr.kBag) <= 0.55,
      { ...detail, tileKBag: scr.kBag, printedKBag: pk });
    // The heparin mL reached paper only on the back sheet, which does not print (ward, 2026-11-16):
    // the front's heparin line now prints it, and it must be the back's stock line, mL for mL.
    const backHep = parts.find(p => /^Heparin /.test(p.name));
    ok(sc, `${label}: front sheet's heparin mL = back sheet's heparin stock mL (none at 0 U/mL)`,
      !!backHep && (backHep.ml > 0 ? printedFrontHeparinMl() === backHep.ml : printedFrontHeparinMl() === null),
      { ...detail, backHep: backHep && backHep.ml, frontHep: printedFrontHeparinMl() });
    const given = scr.pumpRate === null ? null : Number((scr.pumpRate * 24).toFixed(1));
    const overPct = given === null ? 0 : Math.round(Number((given - Vd).toFixed(1)) / Vd * 100);
    ok(sc, `${label}: the over-delivery note is the Rate box × 24 h, from 5 % up`, overPct >= 5 ? scr.overGiven === given : scr.overGiven === null, { ...detail, given, overGiven: scr.overGiven });
  }
  return { make, S: sr, overflow: false };
}

// A fresh Calculator for one order, every step open. `calls.rows` keeps each
// Daily_Log row Submit hands over, at the precision the app saves it.
function mount(sc) {
  const calls = { onLog: 0, onUpdate: 0, rows: [] };
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear();
  const patient = { sessionId: 'SUM-' + sc.name.slice(0, 3).trim(), name: 'Sum', initials: 'SM', bw: sc.bw, ga: 30, sex: 'boys',
    admissionDate: '2026-09-01', currentBed: 'NICU 1', diagnosis: '-', weights: sc.weights, lengths: [], hcs: [] };
  act(() => {
    root.render(React.createElement(window.Calculator, {
      patient, dol: sc.dol, editEntry: null, baselineEntry: null, previousEntry: null, logDate: null,
      userLabel: 'Dr Sum (sum@kcmh.test)', userEmail: 'sum@kcmh.test',
      onLog: (entry) => { calls.onLog++; calls.rows.push(entry); return Promise.resolve({ ok: true, entryId: 'srv-sum', lastModified: '2026-10-11T01:00:00.000Z' }); },
      onUpdate: (id, lastModified, entry) => { calls.onUpdate++; calls.rows.push(entry); return Promise.resolve({ ok: true, lastModified: '2026-10-11T02:00:00.000Z' }); },
      onSaved() {}, onWeightChange() {},
    }));
  });
  click(btnExact('Open all'));
  return calls;
}

async function run(scIn, idx) {
  const sc = { ...BASE, ...scIn };
  const calls = mount(sc);
  await fill(sc);
  const Vd = sc.useRate ? Number((sc.useRate * 24).toFixed(2)) : sc.tpn;

  // ── save 1 ──
  const saveBtn = btnExact('Submit');
  const dosingG = sc.tpnWtOverride > 0 ? sc.tpnWtOverride : (sc.cur < sc.bw ? sc.bw : sc.cur);
  const inRange = dosingG >= 200 && dosingG <= 8000;
  const zeroed = inRange ? stocksAtZero(sc, dosingG, Vd, sc.dead || 0) : [];
  // Stocks over the bag, read off the screen: Components above Bag total as shown
  // is the app's own WFI below 0 (Pp, 2026-10-28: not orderable).
  const scr0 = screenFigures();
  const overfull = scr0.components !== null && scr0.bagTotal !== null && scr0.components > scr0.bagTotal + EPS;
  if (sc.overflow) ok(sc, 'S4 is over-full, as built', overfull, scr0);
  const orderable = inRange && zeroed.length === 0 && !overfull;
  if (sc.expectZero) ok(sc, `stocks at 0 mL are ${sc.expectZero}`, JSON.stringify(zeroed) === JSON.stringify(sc.expectZero), zeroed);
  ok(sc, 'Submit enabled exactly when the order can be saved', !!(saveBtn && !saveBtn.disabled) === orderable, { disabled: saveBtn?.disabled, dosingG, zeroed });
  if (zeroed.length) {
    ok(sc, 'a stock at 0 mL: the save panel says so', !!container.querySelector('.stock-at-zero-ml'), zeroed);
    ok(sc, 'a stock at 0 mL: no print form', !__printFormTicked(container));
    return `stock at 0 mL: ${zeroed.join(', ')}`;
  }
  if (overfull) {
    ok(sc, 'over-full bag: "Bag cannot be made (ใส่ถุงไม่ได้)" on screen',
      [...container.querySelectorAll('.calc-bottom .alert-row.crit .title')].some(t => t.textContent === 'Bag cannot be made (ใส่ถุงไม่ได้)'), scr0);
    ok(sc, 'over-full bag: the save panel says so', !!container.querySelector('.bag-cannot-be-made'));
    ok(sc, 'over-full bag: no print form', !__printFormTicked(container));
    return 'over-full: not orderable';
  }
  if (!orderable) {
    // No print: nothing to add up. The screen still shows the bag.
    ok(sc, 'not orderable → no print form', !__printFormTicked(container));
    return 'screen only (not orderable)';
  }
  await clickAsync(saveBtn);
  ok(sc, 'save 1 reached onLog', calls.onLog === 1, calls);
  // A No TPN order saves but is never printed (Pp, 2026-11-01): nothing to add
  // up on save 1. The change below gives it a bag, and that one prints.
  const noTpnOrder = !!container.querySelector('label.no-tpn-chk input')?.checked;
  let first = null;
  if (noTpnOrder) ok(sc, 'No TPN: saved, and no print form (it is never printed)', !__printFormTicked(container));
  else {
    first = sumCheck(sc, 'save 1', Vd);
    if (!first) return 'no print';
  }

  // ── wired-in: change one input the way a person does ──
  const before = screenFigures();
  // Alternate the two ways in: a chip on even orders, typing on odd ones.
  const useChip = Vd > 0 && idx % 2 === 0;
  let newVd = Vd, newDead = sc.dead, how;
  if (useChip) {
    // Since 2026-11-16 a dead-space change inside the same ten (37 → 30 mL on
    // 100 mL: 140 either way) leaves the bag as it is, so the chip picked is
    // one that moves the prepared volume: the check is that the screen follows
    // a change that must show.
    newDead = [30, 50, 100].find(v => v !== sc.dead && preparedOf(Vd, v) !== preparedOf(Vd, sc.dead));
    const chip = chipsAfter('ปริมาตรคาสาย').find(c => Number(c.textContent) === newDead);
    ok(sc, `dead-space chip ${newDead} exists`, !!chip);
    if (!chip) return 'no chip';
    click(chip);
    how = `dead-space chip ${sc.dead} → ${newDead} mL`;
  } else {
    newVd = Vd > 0 ? Vd + 12.5 : 60;
    // A day without a bag was ticked "No TPN"; a bag starts by taking it off.
    if (!(Vd > 0)) setCheck('No TPN', false);
    typeChars('Volume(mL/day)', String(newVd));
    how = `TPN volume typed ${Vd} → ${newVd} mL/day`;
  }
  const after = screenFigures();
  const wantPrepared = r1(preparedOf(newVd, newDead));
  ok(sc, `wired-in (${how}): on-screen Bag total moves to delivered + dead, up to the next 10 mL`,
    after.bagTotal !== null && Math.abs(after.bagTotal - wantPrepared) <= 0.05 + EPS, { before, after, wantPrepared });
  ok(sc, `wired-in (${how}): on-screen Bag total changed`, after.bagTotal !== before.bagTotal, { before, after });
  if (useChip && sc.dex > 0) ok(sc, `wired-in (${how}): on-screen Components changed (D50W follows the prepared volume)`,
    after.components !== before.components, { before, after });
  ok(sc, `wired-in (${how}): the stale print form is withdrawn until saved`, !__printFormTicked(container));

  // ── save 2: the reprint carries the new figures, and still adds up ──
  // A bigger volume lowers the overfill, so a small stock can reach 0 mL.
  const zeroed2 = stocksAtZero(sc, dosingG, newVd, newDead);
  if (zeroed2.length) {
    ok(sc, `wired-in (${how}): a stock now at 0 mL disables Submit`, btnExact('Submit')?.disabled === true, zeroed2);
    return `after the change, stock at 0 mL: ${zeroed2.join(', ')}`;
  }
  if (after.components !== null && after.bagTotal !== null && after.components > after.bagTotal + EPS) {
    ok(sc, `wired-in (${how}): now over-full, Submit is disabled`, btnExact('Submit')?.disabled === true, after);
    return 'after the change, over-full';
  }
  await clickAsync(btnExact('Submit'));
  ok(sc, 'save 2 updated the same row', calls.onLog === 1 && calls.onUpdate === 1, calls);
  const second = sumCheck(sc, `save 2 (${how})`, newVd);
  if (second) {
    ok(sc, `wired-in (${how}): reprinted prepared = the new on-screen Bag total`, second.make.prepared === after.bagTotal, { second: second.make, after });
    if (first) ok(sc, `wired-in (${how}): reprinted prepared differs from the first print`, second.make.prepared !== first.make.prepared, { first: first.make, second: second.make });
  }
  return null;
}

// ── 1b · the same order in the quick calc: its Copy's bag line ──────────────
async function quickCalcBag(scIn) {
  const sc = { ...BASE, ...scIn };
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear();
  act(() => {
    root.render(React.createElement(window.Calculator, {
      patient: { sessionId: null, name: null, initials: null, bw: 0, ga: 0, sex: '', currentBed: '', diagnosis: '',
        weights: [], lengths: [], hcs: [] },
      dol: sc.dol, scratch: true, editEntry: null, baselineEntry: null, previousEntry: null, logDate: null,
      userLabel: '', userEmail: '',
    }));
  });
  click(btnExact('Open all'));
  await fill(sc, true);
  const Vd = sc.useRate ? Number((sc.useRate * 24).toFixed(2)) : sc.tpn;
  copied = null;
  const btn = [...container.querySelectorAll('button')].find(b => /คัดลอกผลคำนวณ/.test(b.textContent));
  ok(sc, 'quick calc: คัดลอกผลคำนวณ is offered', !!btn);
  if (btn) await clickAsync(btn);
  // The line says "(whole mL) →" since 2026-11-16, for the WFI's rounding.
  const m = typeof copied === 'string'
    && copied.match(/BAG MAKE-UP: +components (-?[\d.]+) mL \+ WFI q\.s\. (-?[\d.]+) mL \(whole mL\) → (-?[\d.]+) mL prepared/);
  ok(sc, 'quick calc: the copy has a BAG MAKE-UP line', !!m, typeof copied === 'string' ? (copied.match(/BAG MAKE-UP[^\n]*/) || [copied.slice(0, 200)])[0] : copied);
  if (!m) return;
  const cp = { components: +m[1], wfi: +m[2], prepared: +m[3], cannot: /COMPONENTS EXCEED BAG VOLUME/.test(copied) };
  const scr = screenFigures();
  const detail = { copy: cp, screen: scr };
  // Until 2026-11-16, components + WFI = prepared exactly. Now the WFI is whole
  // mL from the remainder, and an over-full bag keeps its exact shortfall.
  ok(sc, 'quick calc copy: WFI = prepared − components, whole mL half up (exact when below 0)',
    cp.wfi === wholeWfi(cp.prepared, cp.components), { ...detail, wantWfi: wholeWfi(cp.prepared, cp.components) });
  if (Vd > 0) {
    ok(sc, 'quick calc copy: components = on-screen Components', scr.components !== null && cp.components === scr.components, detail);
    ok(sc, 'quick calc copy: prepared = on-screen Bag total', scr.bagTotal !== null && cp.prepared === scr.bagTotal, detail);
  }
  ok(sc, 'quick calc copy says COMPONENTS EXCEED exactly when WFI < 0', cp.cannot === (cp.wfi < 0), detail);
  ok(sc, 'quick calc copy and screen agree on "cannot be compounded"', cp.cannot === scr.cannotOnScreen, detail);
  if (sc.overflow) ok(sc, 'S4 in the quick calc: the copy says COMPONENTS EXCEED BAG VOLUME', cp.cannot, detail);
}

// ── 3 · two feeds ───────────────────────────────────────────────────────────
// Each runs four times on the same infant and bag: no feed, feed 1 alone,
// feed 2 alone (its milk, volume and feeds a day in feed 1's place), and both.
// `change` is the one feed input a person then changes on the two-feed order.
const TWO = [
  { name: 'T1 6 + 2 beside a bag: Pre Nan 22 + BM with HMF 24, feed 2 volume typed', bw: 1200, cur: 1200, dol: 12,
    fluid: 150, ioOut: 60, tpn: 60, dead: 30, dex: 10, aa: 1.5, lip: 1, naCl: 1, glyNa: 1, kCl: 1, ca: 30, hep: 0.5,
    feed: 'PRENAN_22', enVol: 15, enFreq: 6, feed2: 'BM_HMF_24', enVol2: 15, enFreq2: 2,
    change: { how: 'volume', to: 20 }, weights: [{ dol: 1, w: 1200 }] },
  // Feeds only until 2026-11-01; a No TPN order is never printed now (Pp), so
  // its two-feed print is checked beside a small bag.
  { name: 'T2 4 + 4 with a 40 mL bag: breast milk + Enfalac Premature 24, feed 2 kcal/oz changed', bw: 1000, cur: 1000, dol: 9,
    route: 'central', fluid: 150, ioOut: 40, tpn: 40, dead: 0, dex: 10, aa: 2,
    feed: 'BM_20', enVol: 12, enFreq: 4, feed2: 'ENFALAC_PREM_24', enVol2: 12, enFreq2: 4,
    change: { how: 'strength', to: 'FBM_PF_22' }, weights: [{ dol: 1, w: 1000 }] },
  { name: 'T3 5 + 3 peripheral: Hi-Q LBW 24 + Pre Nan 22, frequencies typed through 7 a day', bw: 1600, cur: 1650, dol: 15,
    route: 'peripheral', fluid: 160, ioOut: 80, tpn: 80, dead: 20, dex: 7.5, aa: 1.5, lip: 1.5, glyNa: 1, kCl: 1, ca: 20, hep: 0.5,
    feed: 'FBM_PF_24', enVol: 25, enFreq: 5, feed2: 'PRENAN_22', enVol2: 25, enFreq2: 3,
    change: { how: 'frequency', from: [5, 3], via: [5, 2], to: [6, 2] }, weights: [{ dol: 1, w: 1600 }] },
];
const D_ = () => window.NEOFEED_DATA;
const rd = (x, d) => Number(D_().displayNum(x, d));       // the CR-R-DISPLAY rounding, for input arithmetic
const ROW_KEYS = ['fluid', 'kcal', 'pro', 'na', 'k', 'ca', 'p', 'enVolPerKg'];
// "Delivered per kg from EN": the label and the decimals each figure is shown at.
const DELIVERED = [['kcal', 0], ['pro', 1], ['Na', 1], ['K', 1], ['Ca', 0], ['P', 0]];
function tileVal(label) {
  const m = [...container.querySelectorAll('.metric')].find(t => t.querySelector('.lbl')?.textContent.trim() === label);
  return m ? numOrDash(m.querySelector('.val')?.textContent) : null;
}
function feedDay(n) {
  const t = container.querySelector(`.en-feed-${n} .en-feed-day`)?.textContent.replace(/\s+/g, ' ') || '';
  const m = t.match(/= (-?[\d.,]+) mL\/day · (-?[\d.,]+|—) mL\/kg\/d/);
  return m ? { mlDay: numOrDash(m[1]), mlKg: numOrDash(m[2]) } : { error: t || 'no feed day line' };
}
function delivered() {
  const spans = [...container.querySelectorAll('.en-delivered > div:nth-child(2) > span')];
  const out = {};
  for (const s of spans) { const m = s.textContent.trim().match(/^(\S+) (.+)$/); if (m) out[m[1]] = numOrDash(m[2]); }
  return out;
}
const prescribedMlDay = () => grabT(/· Prescribed (-?[\d.,]+) mL\/d/);
function printedFigures() {
  const form = __printFormTicked(container);
  if (!form) return null;
  const t = form.textContent.replace(/\s+/g, ' ');
  const e = t.match(/Energy \(TPN\) (\S+) kcal = (\S+) kcal\/kg(?: · total incl\. EN (\S+) kcal\/kg)?/);
  const a = t.match(/Amino acid (\S+) g = (\S+) g\/kg/);
  const s = t.match(/Protein (\S+) g\/kg\/d · Energy (\S+) kcal\/kg\/d/);
  return {
    tpnKcalKg: e ? numOrDash(e[2]) : null, kcalKg: e ? (e[3] != null ? numOrDash(e[3]) : numOrDash(e[2])) : null,
    aaKg: a ? numOrDash(a[2]) : null, proKg: s ? numOrDash(s[1]) : null, summaryKcalKg: s ? numOrDash(s[2]) : null,
  };
}

// One run of a two-feed order: mount, fill, Submit, and read back what was
// saved, shown and printed. `feeds` is [] (none), [1], [2] or [1, 2].
async function twoFeedRun(sc, feeds) {
  const f1 = feeds.includes(1), f2 = feeds.includes(2);
  const order = { ...sc, feed2: null, enVol2: 0, enFreq2: 0 };
  if (feeds.length === 0) Object.assign(order, { feed: 'BM_20', enVol: 0, enFreq: 0 });
  else if (!f1) Object.assign(order, { feed: sc.feed2, enVol: sc.enVol2, enFreq: sc.enFreq2 });
  else if (f2) Object.assign(order, { feed2: sc.feed2, enVol2: sc.enVol2, enFreq2: sc.enFreq2 });
  const calls = mount(order);
  await fill(order);
  const out = { calls, prescribed: prescribedMlDay(), delivered: delivered(), enTile: tileVal('EN volume'),
    day1: feedDay(1), day2: feedDay(2), total: container.querySelector('.en-feeds-total')?.textContent.replace(/\s+/g, ' ') || '',
    hints: [1, 2].map(n => [...container.querySelectorAll(`.en-feed-${n} .field-hint`)].map(h => h.textContent).join(' | ')) };
  const btn = btnExact('Submit');
  out.submittable = !!btn && !btn.disabled;
  if (!out.submittable) return out;
  await clickAsync(btn);
  out.row = calls.rows[0];
  out.printed = printedFigures();
  out.bag = readPrintBag();
  return out;
}

async function runTwoFeeds(sc) {
  sc = { ...BASE, ...sc };
  const Vd = sc.tpn;
  const kg = (sc.cur < sc.bw ? sc.bw : sc.cur) / 1000;
  const ml1 = sc.enVol * sc.enFreq, ml2 = sc.enVol2 * sc.enFreq2, n = sc.enFreq + sc.enFreq2;
  const none = await twoFeedRun(sc, []);
  const one1 = await twoFeedRun(sc, [1]);
  const one2 = await twoFeedRun(sc, [2]);
  const both = await twoFeedRun(sc, [1, 2]);
  // A feeds-only order with its feeds taken away is an empty day, which
  // cannot be submitted: then nothing is given, and its row is all zeros.
  const emptyDay = !(sc.tpn > 0) && !(sc.otherIV > 0) && !(sc.drug > 0);
  if (emptyDay) {
    ok(sc, 'no feed and no bag: the empty day cannot be submitted', !none.submittable);
    none.row = Object.fromEntries([...ROW_KEYS, 'gir'].map(k => [k, 0]));
    none.printed = { tpnKcalKg: 0, kcalKg: 0, aaKg: 0, proKg: 0, summaryKcalKg: 0 };
  }
  for (const [label, r] of [['no feed', none], ['feed 1 alone', one1], ['feed 2 alone', one2], ['both feeds', both]]) {
    if (!(emptyDay && r === none)) ok(sc, `${label}: Submit enabled and the row saved`, r.submittable && !!r.row, { submittable: r.submittable });
  }
  if (![none, one1, one2, both].every(r => r.row)) return 'a run could not be saved';
  const printedRuns = emptyDay ? [one1, one2, both] : [none, one1, one2, both];

  // d · what the two-feed screen shows, from the inputs alone
  ok(sc, 'feed 1 shows its volume × feeds a day', both.day1.mlDay === rd(ml1, 1) && both.day1.mlKg === rd(ml1 / kg, 0), { day1: both.day1, ml1, kg });
  ok(sc, 'feed 2 shows its volume × feeds a day', both.day2.mlDay === rd(ml2, 1) && both.day2.mlKg === rd(ml2 / kg, 0), { day2: both.day2, ml2, kg });
  ok(sc, 'the EN volume tile is the two feeds summed, per kg', both.enTile === rd((ml1 + ml2) / kg, 0), { tile: both.enTile, ml1, ml2, kg });
  ok(sc, `the total line reads ${n} feeds/d · q${24 / n}h`, both.total.includes(`Feed 1 + 2 = ${n} feeds/d · q${24 / n}h`), both.total);
  ok(sc, 'each feed\'s hint is its share of the one schedule',
    both.hints[0].includes(`${sc.enFreq} of ${n} feeds · q${24 / n}h`) && both.hints[1].includes(`${sc.enFreq2} of ${n} feeds · q${24 / n}h`), both.hints);
  ok(sc, 'Prescribed (mL/d) rises by both feeds\' mL/day over no feed (±1)',
    both.prescribed !== null && none.prescribed !== null && Math.abs(both.prescribed - none.prescribed - (ml1 + ml2)) <= 1 + EPS,
    { both: both.prescribed, none: none.prescribed, ml1, ml2 });

  // a · the saved row: both − none = (feed 1 − none) + (feed 2 − none)
  for (const k of ROW_KEYS) {
    const z = none.row[k], got = both.row[k] - z, want = (one1.row[k] - z) + (one2.row[k] - z);
    ok(sc, `saved ${k}: both feeds = feed 1 + feed 2 (over no feed)`, Math.abs(got - want) <= 1e-9 * Math.max(1, Math.abs(both.row[k])),
      { none: z, one1: one1.row[k], one2: one2.row[k], both: both.row[k] });
  }
  ok(sc, 'saved EN mL/kg/d is the volumes × feeds a day, per kg', Math.abs(both.row.enVolPerKg - (ml1 + ml2) / kg) <= 1e-9, both.row.enVolPerKg);
  ok(sc, 'the feeds move no saved GIR', both.row.gir === none.row.gir, { both: both.row.gir, none: none.row.gir });

  // b · on screen, "Delivered per kg from EN": both = feed 1 + feed 2, within one unit shown
  for (const [lab, d] of DELIVERED) {
    const u = 10 ** -d, a = one1.delivered[lab], b = one2.delivered[lab], c = both.delivered[lab];
    ok(sc, `delivered per kg ${lab}: both feeds = feed 1 + feed 2 (±${u})`, [a, b, c].every(v => v != null) && Math.abs(c - a - b) <= u + EPS,
      { one1: a, one2: b, both: c });
  }

  // c · printed: the EN part of energy and protein adds up (the header gives the tolerances)
  const P = [none, one1, one2, both].map(r => r.printed);
  ok(sc, 'every run printed its energy and protein lines', P.every(p => p && [p.tpnKcalKg, p.kcalKg, p.aaKg, p.proKg].every(v => v != null)), P);
  if (P.every(p => p && [p.tpnKcalKg, p.kcalKg, p.aaKg, p.proKg].every(v => v != null))) {
    const [pz, p1, p2, pb] = P;
    ok(sc, 'the feeds move no printed TPN energy or amino acid', [p1, p2, pb].every(p => p.tpnKcalKg === pz.tpnKcalKg && p.aaKg === pz.aaKg), P);
    const en = (p) => p.kcalKg - p.tpnKcalKg, pro = (p) => p.proKg - p.aaKg;
    ok(sc, 'printed energy from EN: both feeds = feed 1 + feed 2 (±2 kcal/kg)', Math.abs(en(pb) - en(p1) - en(p2)) <= 2 + EPS, P);
    ok(sc, 'printed protein from EN: both feeds = feed 1 + feed 2 (±0.01 g/kg)', Math.abs(pro(pb) - pro(p1) - pro(p2)) <= 0.01 + EPS, P);
    ok(sc, 'printed summary energy = the energy line\'s total', pb.summaryKcalKg === pb.kcalKg, pb);
  }
  // …and the feeds leave the bag alone
  const bags = printedRuns.map(r => r.bag && r.bag.make);
  ok(sc, 'the printed bag line is the same with or without feeds', bags.every(m => m && JSON.stringify(m) === JSON.stringify(bags[0])), bags);
  ok(sc, 'the two-feed print adds up (section 1)', !!sumCheck(sc, 'two feeds, save 1', Vd));

  // wired-in: change one feed input the way a person does
  const box = (n) => container.querySelector(`.en-feed-${n}`);
  const before = { day1: feedDay(1), day2: feedDay(2), tile: tileVal('EN volume'), kcal: delivered().kcal, printed: printedFigures() };
  let v1 = sc.enVol, v2 = sc.enVol2, q1 = sc.enFreq, q2 = sc.enFreq2, how;
  const c = sc.change;
  if (c.how === 'volume') {
    typeChars('Volume(mL/feed)', String(c.to), box(2)); v2 = c.to;
    how = `feed 2 volume typed ${sc.enVol2} → ${c.to} mL`;
  } else if (c.how === 'strength') {
    const sel = box(2).querySelector('.en-strength');
    act(() => { selSetter.call(sel, c.to); sel.dispatchEvent(new window.Event('change', { bubbles: true })); });
    how = `feed 2 kcal/oz ${sc.feed2} → ${c.to}`;
  } else {
    typeChars('Frequency', String(c.via[1]), box(2)); q2 = c.via[1];
    const nv = c.via[0] + c.via[1];
    ok(sc, `wired-in: ${c.via.join(' + ')} = ${nv} a day is refused on screen`,
      (container.querySelector('.en-feeds-total')?.textContent || '').includes(`Feed 1 + 2 = ${nv} feeds/d`) && btnExact('Submit')?.disabled === true,
      container.querySelector('.en-feeds-total')?.textContent);
    ok(sc, `wired-in: at ${nv} a day the print form is withdrawn`, !__printFormTicked(container));
    typeChars('Frequency', String(c.to[0]), box(1)); q1 = c.to[0];
    how = `frequencies typed ${c.from.join(' + ')} → ${c.via.join(' + ')} → ${c.to.join(' + ')}`;
  }
  const m1 = v1 * q1, m2 = v2 * q2;
  const after = { day1: feedDay(1), day2: feedDay(2), tile: tileVal('EN volume'), kcal: delivered().kcal };
  ok(sc, `wired-in (${how}): each feed's mL/day follows`, after.day1.mlDay === rd(m1, 1) && after.day2.mlDay === rd(m2, 1), { before, after, m1, m2 });
  ok(sc, `wired-in (${how}): the EN volume tile follows`, after.tile === rd((m1 + m2) / kg, 0), { before: before.tile, after: after.tile });
  ok(sc, `wired-in (${how}): delivered kcal per kg moved`, after.kcal !== before.kcal, { before: before.kcal, after: after.kcal });
  ok(sc, `wired-in (${how}): the stale print form is withdrawn until saved`, !__printFormTicked(container));
  const btn = btnExact('Submit');
  ok(sc, `wired-in (${how}): Submit enabled`, !!btn && !btn.disabled);
  if (!btn || btn.disabled) return null;
  await clickAsync(btn);
  ok(sc, 'save 2 updated the same row', both.calls.onLog === 1 && both.calls.onUpdate === 1, both.calls);
  const row2 = both.calls.rows[1], p2 = printedFigures();
  ok(sc, `wired-in (${how}): saved EN mL/kg/d is the new volumes × feeds a day`, !!row2 && Math.abs(row2.enVolPerKg - (m1 + m2) / kg) <= 1e-9, row2 && row2.enVolPerKg);
  ok(sc, `wired-in (${how}): the reprint's energy from EN moved`, !!p2 && p2.kcalKg != null && p2.kcalKg !== before.printed.kcalKg, { first: before.printed, second: p2 });
  ok(sc, `wired-in (${how}): reprinted energy = the on-screen Energy (total) tile`, !!p2 && p2.summaryKcalKg === tileVal('Energy (total)'), { p2, tile: tileVal('Energy (total)') });
  const second = sumCheck(sc, `two feeds, save 2 (${how})`, Vd);
  const firstBag = bags[bags.length - 1];
  ok(sc, `wired-in (${how}): the reprinted bag is the first one`, !!second && JSON.stringify(second.make) === JSON.stringify(firstBag), { second: second && second.make, first: firstBag });
  return null;
}

// ── 4 · one figure, one number: the .5 ties ─────────────────────────────────
// `want` is the paper figure rounded half up, from the inputs alone.
const TIES = [
  { name: 'T1 1 kg, peripheral, 80 mL D9.04 AA 3.58: osm 452 + 447.5 = 899.5 → 900, red',
    route: 'peripheral', tpn: 80, dex: 9.04, aa: 3.58, want: { osm: 900 } },
  { name: 'T2 1 kg, 100 mL D10.5 AA 1.95: energy 35.7 + 7.8 = 43.5 → 44 kcal/kg/d',
    tpn: 100, dex: 10.5, aa: 1.95, want: { kcal: 44 } },
  { name: 'T3 760 g, Glycophos 1 mEq Na (0.5 mmol P): P 15.5 → 16 mg/kg/d',
    bw: 760, cur: 760, tpn: 100, dex: 10, aa: 3, glyNa: 1, want: { p: 16 } },
  // T4 was 150 + 30 mL = 180 until 2026-11-16; 150 + 30 = 180 now goes up to
  // 190 (Factor 1.9, 80.75 mg, no tie), so 20 mL of dead space keeps the bag at
  // 180 (170 → 180) and the Factor at 1.5 × 180/150 = 1.8, the float just under.
  { name: 'T4 1.5 kg, 150 + 20 → 180 mL, Ca 42.5 mg/kg: Ca gluconate 42.5 × 1.8 = 76.5 → 77 mg in the bag',
    bw: 1500, cur: 1500, tpn: 150, dead: 20, dex: 10, aa: 3, ca: 42.5, glyNa: 2, want: { caMg: 77 } },
  { name: 'T5 1,005 g, oral vitamin D 500 IU/kg: 502.5 → 503 IU/day, saved as 503 (Vera)',
    bw: 1005, cur: 1005, tpn: 100, dex: 10, aa: 3, vitD: 500, want: { vitD: 503 } },
  { name: 'T6 1,130 g, oral Ca 50 mg/kg: 56.5 → 57 mg/day, saved as 57 (Vera)',
    bw: 1130, cur: 1130, tpn: 100, dex: 10, aa: 3, glyNa: 2, oralCa: 50, want: { oralCa: 57 } },
  // IV lipid at 10 kcal/g (Pp, 2026-11-18, Q8; CR-U-ENERGY). At the 9 kcal/g it
  // counted until then this order is 34 + 8 + 1.35 = 43.35 and every figure reads 43.
  { name: 'T7 1 kg, 100 mL D10 AA 2 lipid 0.15: energy 34 + 8 + 1.5 (lipid at 10 kcal/g) = 43.5 → 44 kcal/kg/d',
  // The sticker is the aqueous bag's (dextrose + amino acid, data.js stickerFigures):
  // lipid is a separate syringe and never reaches it, so it reads 34 + 8 = 42.
    tpn: 100, dex: 10, aa: 2, lip: 0.15, want: { kcal: 44, stickerKcal: 42 } },
];
function alertBody(title) {
  const row = [...container.querySelectorAll('.alert-row')].find(r => r.querySelector('.title')?.textContent === title);
  return row ? row.querySelector('.body')?.textContent.replace(/\s+/g, ' ') : null;
}
const allNums = (text, re) => [...text.matchAll(re)].map(m => numOrDash(m[1]));
function findKey(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) { const r = findKey(v, key); if (r !== undefined) return r; }
  return undefined;
}
async function runTie(scIn) {
  const sc = { ...BASE, ...scIn };
  const calls = mount(sc);
  await fill(sc);
  const w = sc.want;
  const btn = btnExact('Submit');
  ok(sc, 'Submit enabled', !!btn && !btn.disabled);
  if (!btn || btn.disabled) return 'not orderable';
  await clickAsync(btn);
  const row = calls.rows[0];
  const form = __printFormTicked(container);
  ok(sc, 'saved, and the sheet renders', !!row && !!form);
  if (!row || !form) return 'no print';
  const screen = bodyText();
  const sheet = form.textContent.replace(/\s+/g, ' ');
  if (w.osm != null) {
    ok(sc, `Osmolarity tile reads ${w.osm}`, tileVal('Osmolarity') === w.osm, tileVal('Osmolarity'));
    const body = alertBody('Osmolarity > peripheral limit');
    ok(sc, `the red alert is raised, and its line reads ${w.osm} mOsm/L`, !!body && numOrDash(body.split(' mOsm/L')[0]) === w.osm, body);
    const shown = allNums(screen, /Osm (\d[\d.,]*) mOsm\/L/g);
    ok(sc, `every "Osm … mOsm/L" (Step 3's chip and the sheet) reads ${w.osm}`, shown.length >= 2 && shown.every(v => v === w.osm), shown);
    const printed = allNums(sheet, /Osmolarity (\d[\d.,]*) mOsm\/L/g);
    ok(sc, `the sheet's Osmolarity line reads ${w.osm}`, printed.length === 1 && printed[0] === w.osm, printed);
    const working = allNums(screen, /Osmolarity = (\d[\d.,]*) mOsm\/L/g);
    ok(sc, `Step 3's working reads ${w.osm}`, working.every(v => v === w.osm), working);
    ok(sc, `the sticker figure reads ${w.osm}`, findKey(row.printJson, 'osmolarity') === String(w.osm), findKey(row.printJson, 'osmolarity'));
  }
  if (w.kcal != null) {
    ok(sc, `Energy (total) tile reads ${w.kcal}`, tileVal('Energy (total)') === w.kcal, tileVal('Energy (total)'));
    const body = alertBody('Energy off target');
    ok(sc, `the Energy line reads ${w.kcal} kcal/kg/d`, !!body && numOrDash(body.split(' kcal/kg/d')[0]) === w.kcal, body);
    const card = screen.match(/Energy distribution ?(\d[\d.,]*) kcal\/kg\/d/);
    ok(sc, `the energy card reads ${w.kcal} kcal/kg/d`, !!card && numOrDash(card[1]) === w.kcal, card && card[0]);
    const tpn = screen.match(/TPN (\d[\d.,]*) ?EN (\d[\d.,]*)/);
    ok(sc, `the energy card's TPN kcal reads ${w.kcal} (1 kg)`, !!tpn && numOrDash(tpn[1]) === w.kcal, tpn && tpn[0]);
    const p = printedFigures();
    ok(sc, `the sheet's energy line and summary read ${w.kcal}`, !!p && p.tpnKcalKg === w.kcal && p.summaryKcalKg === w.kcal, p);
    const stickerKcal = w.stickerKcal != null ? w.stickerKcal : w.kcal;
    ok(sc, `the sticker's kcal reads ${stickerKcal} (1 kg)`, findKey(row.printJson, 'kcal') === String(stickerKcal), findKey(row.printJson, 'kcal'));
  }
  if (w.p != null) {
    ok(sc, `Phosphorus tile reads ${w.p}`, tileVal('Phosphorus') === w.p, tileVal('Phosphorus'));
    const body = alertBody('Phosphorus off target');
    ok(sc, `the Phosphorus line reads ${w.p} mg/kg/d`, !!body && numOrDash(body.split(' mg/kg/d')[0]) === w.p, body);
    const po4 = allNums(sheet, /PO₄ (\d[\d.,]*)/g);
    ok(sc, `the sheet's TPN and total PO₄ read ${w.p}`, po4.length >= 2 && po4[0] === w.p && po4[po4.length - 1] === w.p, po4);
  }
  if (w.caMg != null) {
    const front = sheet.match(/☑ Ca Gluconate ?(\d[\d.,]*) mg ?(\d[\d.,]*) mg = /);
    ok(sc, `the front prints Ca gluconate ${w.caMg} mg in the bag`, !!front && numOrDash(front[2]) === w.caMg, front && front[0]);
    const back = sheet.match(/10% Ca Gluconate ?(\d[\d.,]*) mg/);
    ok(sc, `the back sheet reads ${w.caMg} mg`, !!back && numOrDash(back[1]) === w.caMg, back && back[0]);
    ok(sc, `the saved printedFigures (the changes list) read ${w.caMg}`, row.calcInput?.printedFigures?.caMg === String(w.caMg), row.calcInput?.printedFigures?.caMg);
  }
  if (w.vitD != null) {
    const hint = screen.match(/= (\d[\d.,]*) IU\/day · ESPGHAN/);
    ok(sc, `Step 6's hint reads ${w.vitD} IU/day`, !!hint && numOrDash(hint[1]) === w.vitD, hint && hint[0]);
    const readout = screen.match(/Vitamin D ?(\d[\d.,]*) IU ?\/day/);
    ok(sc, `Step 6's readout reads ${w.vitD} IU`, !!readout && numOrDash(readout[1]) === w.vitD, readout && readout[0]);
    const front = sheet.match(/IU\/kg\/d = ?(\d[\d.,]*) ?IU\/day/);
    ok(sc, `the front prints ${w.vitD} IU/day`, !!front && numOrDash(front[1]) === w.vitD, front && front[0]);
    ok(sc, `the saved suppVitD_IU is ${w.vitD}`, row.suppVitD_IU === w.vitD, row.suppVitD_IU);
  }
  if (w.oralCa != null) {
    const hint = screen.match(/= (\d[\d.,]*) mg\/day · [\d.,]+ tab\/day/);
    ok(sc, `Step 6's Ca hint reads ${w.oralCa} mg/day`, !!hint && numOrDash(hint[1]) === w.oralCa, hint && hint[0]);
    const front = sheet.match(/Ca oral \([^)]*\) ?[\d.,]+ ?mg\/kg\/d = ?(\d[\d.,]*) ?mg/);
    ok(sc, `the front prints oral Ca ${w.oralCa} mg`, !!front && numOrDash(front[1]) === w.oralCa, front && front[0]);
    ok(sc, `the saved suppCa_mg is ${w.oralCa}`, row.suppCa_mg === w.oralCa, row.suppCa_mg);
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
    try { await quickCalcBag(sc); }
    catch (err) { failures.push({ sc: sc.name, what: 'quick calc threw', detail: String(err && err.stack || err).split('\n').slice(0, 3).join(' | ') }); }
    const bad = failures.length - f0;
    console.log(`  ${bad ? 'FAIL' : 'PASS'}  ${sc.name.slice(0, 64).padEnd(64)} ${String(checks - c0).padStart(3)} checks${note ? `  (${note})` : ''}${bad ? `  ${bad} failed` : ''}`);
  }
  console.log(`\n── ${TWO.length} two-feed orders: both feeds add up from each alone, saved, shown and printed, and follow a change ──`);
  for (const sc of TWO) {
    const f0 = failures.length, c0 = checks;
    let note = null;
    try { note = await runTwoFeeds(sc); }
    catch (err) { failures.push({ sc: sc.name, what: 'order threw', detail: String(err && err.stack || err).split('\n').slice(0, 3).join(' | ') }); }
    const bad = failures.length - f0;
    console.log(`  ${bad ? 'FAIL' : 'PASS'}  ${sc.name.slice(0, 80).padEnd(80)} ${String(checks - c0).padStart(3)} checks${note ? `  (${note})` : ''}${bad ? `  ${bad} failed` : ''}`);
  }
  console.log(`\n── ${TIES.length} orders on a .5 tie: one figure reads one number on screen, on the sheet and on the sticker ──`);
  for (const sc of TIES) {
    const f0 = failures.length, c0 = checks;
    let note = null;
    try { note = await runTie(sc); }
    catch (err) { failures.push({ sc: sc.name, what: 'order threw', detail: String(err && err.stack || err).split('\n').slice(0, 3).join(' | ') }); }
    const bad = failures.length - f0;
    console.log(`  ${bad ? 'FAIL' : 'PASS'}  ${sc.name.slice(0, 96).padEnd(96)} ${String(checks - c0).padStart(3)} checks${note ? `  (${note})` : ''}${bad ? `  ${bad} failed` : ''}`);
  }
  for (const f of failures.slice(0, 40)) {
    console.log(`  FAILED · ${f.sc} · ${f.what}\n         ${JSON.stringify(f.detail)}${f.order ? `\n         order ${JSON.stringify(f.order)}` : ''}`);
  }
  if (failures.length > 40) console.log(`  … and ${failures.length - 40} more`);
  console.log(failures.length === 0
    ? `\nCALC SUM: ALL PASS (${ORDERS.length} orders, ${TWO.length} two-feed orders and ${TIES.length} tie orders, ${checks} checks)`
    : `\nCALC SUM: ${failures.length} FAILED of ${checks} checks`);
  process.exit(failures.length === 0 ? 0 : 1);
})();
