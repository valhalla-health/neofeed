// verify-calc-oracle.cjs — an INDEPENDENT oracle for the TPN + EN calculator.
//
// The other calculator harnesses pin what the app did the day they were
// written. This one asks a different question: is the arithmetic right at all?
// It drives the real <Calculator> in jsdom through its own input fields, saves
// each order through the real Save button, and then reads every figure the app
// shows or stores —
//   · the Daily_Log entry handed to onLog (what reaches the Google Sheet)
//   · every tile and bedside readout on screen
//   · the printed pharmacy form, front and back
//   · the copied order text
//   · the Active-alerts panel, by level and title
// — and compares each against a recomputation written here from the clinical
// definitions and the KCMH worksheet.
//
// The one rule that makes it worth running: **this file must never import the
// app's own formulas.** Stock strengths, feed compositions, energy densities
// and the ESPGHAN bands below are transcribed independently, so a changed
// constant in data.js shows up here as a disagreement rather than being
// silently copied into the expectation. If you update data.js, update STOCK /
// FEED / expectedAlerts here by hand, from the source, or the harness stops
// being a second opinion.
//
// 12 scenarios cover: a below-birth-weight ELBW day 3, a growing preterm on
// peripheral PN entered by pump rate with the 50% Mg vial and every oral
// supplement, a feeds-only day with no bag, a term infant on a manual dosing
// weight with a MEN feed and the Vitalipid cap, an alert-stress order, the
// 16 kg Soluvit/Peditrace ceilings, and every remaining feed in EN_DB.
//
// NEGATIVE_CONTROL=1 perturbs one expected GIR by 0.4 mg/kg/min: the run must
// then fail on all four surfaces GIR appears on. Trust a pass only after
// seeing that fail.
//
// Dev-only deps as in test/README.md (react@18 react-dom@18 @babel/core
// @babel/preset-react jsdom).
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + path.sep;
const R = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

// ── jsdom + React ───────────────────────────────────────────────────────────
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
global.showToast = (msg, type) => toasts.push({ msg, type });
window.print = () => {};
window.prompt = () => 'oracle reason';
window.confirm = () => true;
// Copy Order goes through navigator.clipboard. jsdom may or may not define it,
// and Node ≥21 has a global `navigator` of its own — install the stub either
// way rather than assuming one shape of either.
let copied = null;
const clipboardStub = { writeText: (t) => { copied = t; return Promise.resolve(); } };
try { Object.defineProperty(window.navigator, 'clipboard', { value: clipboardStub, configurable: true }); }
catch { try { window.navigator.clipboard.writeText = clipboardStub.writeText; } catch { /* left to fail loudly at the Copy assertion */ } }
try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true }); } catch {}
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
{
  const w = console.error;
  console.error = (...a) => { if (!/act\(|not wrapped|Not implemented/.test(String(a[0]))) w(...a); };
}
vm.runInThisContext(R('data.js'));
const D = window.NEOFEED_DATA;
for (const f of ['icons.jsx', 'calculator.jsx']) {
  vm.runInThisContext(babel.transformSync(R(f), {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    filename: f, configFile: false, babelrc: false,
  }).code);
}

// ── Independent reference data (transcribed, not read from data.js) ─────────
const STOCK = {
  d50: 0.5, aa: 0.10, smof: 0.20, naCl: 3.42, naAc: 3.0, glyNa: 2, glyP: 31,
  k2K: 1, k2PperK: 15.5, kCl: 2.0, mg10: 0.812, mg50: 4.06, caMg: 9.01755,
  soluvitPerKg: 1, soluvitMax: 10, pediPerKg: 1, pediMax: 15, pediZn: 0.25, hep: 100,
};
const KCAL = { dex: 3.4, aa: 4, fat: 9 };
// per 100 mL: kcal, pro g, fat g, cho g, Na mmol, K mmol, Ca mg, P mg
const FEED = {
  BM_20:        [67, 1.2, 3.4, 6.7, 0.90, 1.39, 26, 15],
  BM_HMF_24:    [81, 2.6, 3.8, 8.2, 1.40, 1.89, 115, 59],
  BM_PF_20:     [67, 1.5, 3.5, 7.4, 1.0, 1.7, 50, 28],
  FBM_PF_22:    [74, 2.1, 4.0, 8.1, 1.87, 1.90, 102, 59],
  PRENAN_22:    [74, 1.7, 4.3, 7.9, 1.30, 1.77, 74, 67],
  FBM_PF_24:    [80, 2.1, 3.8, 10.9, 3.00, 2.56, 84, 55],
  FBM_INF_MIX:  [90, 2.6, 4.75, 9.45, 1.55, 2.3, 100, 55],
  INFATRINI_30: [100, 2.6, 5.4, 10.3, 1.80, 2.75, 124, 69],
  LF_20:        [67, 1.41, 3.75, 6.90, 1.17, 1.72, 57, 40],
  LF_24:        [80, 1.68, 4.48, 8.24, 1.39, 2.05, 68, 47],
  LF_27:        [90, 1.89, 5.04, 9.27, 1.57, 2.31, 77, 53],
};
const SUPP = { FE_FERDEK: 25, FE_FERROKID: 5, CA_CACO3_350: 140, CA_CACO3_1000: 400, CA_CALCETATE: 253,
  PO4_PHOSPHATE: 53, PO4_NEUTRAL: 14.4 };
const MUNTIVIM_D_IU_PER_DAY = 400;   // 1 mL/day, 400 IU per mL

const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

// ── The expected figures, from first principles ────────────────────────────
function expected(sc) {
  const auto = (sc.bw > 0 && sc.cur > 0 && sc.cur < sc.bw) ? sc.bw : sc.cur;
  const wG = sc.tpnWtOverride > 0 ? sc.tpnWtOverride : auto;
  const W = wG / 1000;
  const Vd = sc.tpn || 0, dead = sc.dead || 0;
  const Vp = Vd > 0 ? Vd + dead : 0;
  const of = Vd > 0 ? Vp / Vd : 1;
  const F = W * of;
  const glyMl = (sc.glyNa || 0) / 2;               // typed as mEq Na/kg → mL/kg
  const e = { wG, W, Vd, Vp, of, F };

  // dextrose
  e.dexDel = Vd * sc.dex / 100; e.dexBag = Vp * sc.dex / 100;
  e.d50 = e.dexBag > 0 ? r1(e.dexBag / STOCK.d50) : 0;
  e.gir = W > 0 ? e.dexDel * 1000 / 1440 / W : 0;
  e.dexGkg = W > 0 ? e.dexDel / W : 0;
  // amino acid
  e.aaDel = sc.aa * W; e.aaBag = sc.aa * F; e.aaMl = r1(e.aaBag / STOCK.aa);
  // lipid
  e.lipG = sc.lip * W; e.smof = r1(e.lipG / STOCK.smof);
  e.vitalipid = sc.lip > 0 ? Math.min(4 * W, 10) : 0;
  e.lipBag = e.lipG / STOCK.smof + e.vitalipid;
  e.lipRate = e.lipBag / sc.lipH;
  e.lipGkgh = sc.lip / sc.lipH;
  // electrolytes (per kg delivered = as ordered)
  e.naKg = sc.naCl + sc.naAc + glyMl * STOCK.glyNa;
  e.kKg = sc.kCl + sc.k2;
  e.naClMl = sc.naCl > 0 ? r1(sc.naCl * F / STOCK.naCl) : 0;
  e.naAcMl = sc.naAc > 0 ? r1(sc.naAc * F / STOCK.naAc) : 0;
  e.glyMl = r1(glyMl * F);
  e.kClMl = sc.kCl > 0 ? r1(sc.kCl * F / STOCK.kCl) : 0;
  e.k2Ml = sc.k2 > 0 ? r2(sc.k2 * F / STOCK.k2K) : 0;
  const mgStock = sc.mgVial === '50' ? STOCK.mg50 : STOCK.mg10;
  e.mgMl = sc.mg > 0 ? r2(sc.mg * F / mgStock) : 0;
  e.caMl = sc.ca > 0 ? r1(sc.ca * F / STOCK.caMg) : 0;
  e.soluvit = sc.soluvit && Vd > 0 ? r1(Math.min(STOCK.soluvitPerKg * W, STOCK.soluvitMax) * of) : 0;
  e.pedi = sc.pedi && Vd > 0 ? r1(Math.min(STOCK.pediPerKg * W, STOCK.pediMax) * of) : 0;
  e.hepMl = sc.hep > 0 ? r2(sc.hep * Vp / STOCK.hep) : 0;
  e.hepU = sc.hep * Vp;
  e.components = r1(e.d50 + e.aaMl + e.naClMl + e.naAcMl + e.glyMl + e.k2Ml + e.kClMl + e.mgMl + e.caMl + e.soluvit + e.pedi + e.hepMl);
  e.wfi = r1(Vp - e.components);
  e.bagNa = e.naKg * F; e.bagK = e.kKg * F;
  e.kPerL = Vp > 0 ? e.bagK / (Vp / 1000) : 0;
  // phosphorus from the bag, mg/day delivered
  e.pTpnMg = glyMl * W * STOCK.glyP + sc.k2 * W * STOCK.k2PperK;
  // zinc
  e.znPedi = sc.pedi && Vd > 0 ? Math.min(STOCK.pediPerKg * W, STOCK.pediMax) * STOCK.pediZn : 0;
  e.znSO4 = (sc.zn || 0) * W; e.znBag = (sc.zn || 0) * F; e.znTot = e.znPedi + e.znSO4;
  // enteral
  const f = FEED[sc.feed];
  e.enVol = sc.enVol * sc.enFreq; e.enPerKg = W > 0 ? e.enVol / W : 0;
  const cnt = sc.men ? 0 : e.enVol;
  e.enCounted = cnt;
  e.enKcal = cnt / 100 * f[0]; e.enPro = cnt / 100 * f[1]; e.enFat = cnt / 100 * f[2]; e.enCho = cnt / 100 * f[3];
  e.enNaKg = cnt / 100 * f[4] / W; e.enKKg = cnt / 100 * f[5] / W; e.enCaKg = cnt / 100 * f[6] / W; e.enPKg = cnt / 100 * f[7] / W;
  e.enFeed = { kcal: e.enVol / 100 * f[0] / W, pro: e.enVol / 100 * f[1] / W, na: e.enVol / 100 * f[4] / W,
    k: e.enVol / 100 * f[5] / W, ca: e.enVol / 100 * f[6] / W, p: e.enVol / 100 * f[7] / W };
  e.useEN = W > 0 && cnt / W >= 100;
  // fluid
  e.prescribed = Vd + e.lipBag + sc.otherIV + sc.drug + cnt;
  e.fluidKg = e.prescribed / W;
  e.planMl = sc.fluid * W;
  e.remaining = e.planMl - e.prescribed;
  e.availEN = sc.fluid * W - Vd - e.lipBag - sc.otherIV - sc.drug;
  // energy / macronutrients
  e.tpnKcal = KCAL.dex * e.dexDel + KCAL.aa * e.aaDel + KCAL.fat * e.lipG;
  e.totKcal = e.tpnKcal + e.enKcal;
  e.kcalKg = e.totKcal / W;
  e.proKg = (e.aaDel + e.enPro) / W;
  e.lipKg = (e.lipG + e.enFat) / W;
  const proG = e.aaDel + e.enPro;
  e.npe = proG > 0 ? (e.totKcal - 4 * proG) / proG : 0;
  e.pe = e.totKcal > 0 ? proG / e.totKcal * 100 : 0;
  e.choPct = e.kcalKg > 0 ? ((KCAL.dex * e.dexDel + e.enCho * 4) / W) / e.kcalKg * 100 : 0;
  e.proPct = e.kcalKg > 0 ? ((KCAL.aa * e.aaDel + e.enPro * 4) / W) / e.kcalKg * 100 : 0;
  e.fatPct = e.kcalKg > 0 ? ((KCAL.fat * e.lipG + e.enFat * 9) / W) / e.kcalKg * 100 : 0;
  // minerals (TPN + counted EN)
  e.naTot = e.naKg + e.enNaKg; e.kTot = e.kKg + e.enKKg;
  e.caKg = sc.ca + e.enCaKg; e.pKg = e.pTpnMg / W + e.enPKg;
  const caMgTot = e.caKg * W, pMgTot = e.pTpnMg + e.enPKg * W;
  e.caP = pMgTot > 0 ? caMgTot / pMgTot : (caMgTot > 0 ? Infinity : 0);
  // oral supplements, per kg/day elemental
  e.totCa = e.caKg + sc.oCa; e.totP = e.pKg + sc.oP;
  e.totCaP = e.totP > 0 ? e.totCa / e.totP : (e.totCa > 0 ? Infinity : 0);
  // osmolarity (per delivered litre)
  const L = Vd / 1000;
  e.osm = Vd > 0
    ? 50 * sc.dex + 100 * (e.aaDel / Vd * 100) + 2 * (e.naKg * W / L) + 2 * e.kPerL + 1.4 * (sc.ca * W / L / 20) + (sc.mg * W / L)
    : 50 * sc.dex;
  // supplements, per day
  e.vitD_day = Math.round(sc.vitD * W);
  e.vitD_total_with_mtv = Math.round(sc.vitD * W + (sc.mtv ? MUNTIVIM_D_IU_PER_DAY : 0));
  e.oCa_day = sc.oCa * W; e.oCa_tabs = sc.oCa > 0 ? sc.oCa * W / SUPP[sc.caType] : 0;
  e.oP_day = sc.oP * W; e.oP_ml = sc.oP > 0 ? sc.oP * W / SUPP[sc.po4Type] : 0; e.oP_mmol = sc.oP * W / 31;
  e.fe_day = sc.fe * W; e.fe_ml = sc.fe > 0 ? sc.fe * W / SUPP[sc.feType] : 0;
  // intake / output (divisor per the ward rule: previous day's weight, BW floor, today's if above BW)
  const prev = (sc.weights || []).filter(x => x.w != null && x.dol <= sc.dol - 1).pop();
  let div = prev ? (prev.w < sc.bw ? sc.bw : prev.w) : sc.bw;
  if (div === sc.bw && sc.cur > sc.bw) div = sc.cur;
  e.ioDivG = div;
  e.ioInput = sc.ioInput != null ? sc.ioInput : Math.round(e.prescribed);
  e.balance = e.ioInput - sc.ioOut - sc.drain;
  e.uoKgH = sc.ioOut / (div / 1000) / 24;
  e.route = Vd > 0 ? (sc.route === 'central' ? 'TPN central' : 'TPN peripheral') : (e.enPerKg > 0 ? 'Enteral only' : 'NPO');
  return e;
}

// ── The alerts an order should raise, from the ward's stated thresholds ─────
// PN bands ESPGHAN 2018 by DOL, EN bands ESPGHAN 2022 once counted feeds reach
// 100 mL/kg/d; hard stops GIR 13, protein 4.8 (total), lipid 4.5 and K 3.5 and
// NPE:AA 20–32 on the IV portion, dextrose 18 g/kg/d, K 40 mEq/L, Zn 5 mg/day.
function expectedAlerts(sc, e) {
  const d = sc.dol, en = e.useEN;
  const T = {
    pro: en ? [3.5, 4.0] : (d <= 1 ? [1.5, 2.5] : [2.5, 3.5]),
    kcal: en ? [115, 140] : (d <= 2 ? [45, 55] : d <= 7 ? [70, 100] : [90, 120]),
    lip: en ? [4.8, 8.1] : (d <= 1 ? [0.5, 1.0] : [1.0, 4.0]),
    na: en ? [3, 5] : (d <= 2 ? [0, 2] : d <= 7 ? [0, 3] : [2, 5]),
    k: en ? [2.3, 4.6] : (d <= 7 ? [0, 3] : [2, 3]),
    ca: en ? [120, 200] : (d <= 1 ? [32, 80] : [64, 140]),
    p: en ? [70, 115] : (d <= 1 ? [31, 62] : [50, 108]),
    mg: d <= 2 ? [0.2, 0.4] : [0.4, 0.6],
  };
  const st = (v, [lo, hi], hard = {}) => v === 0 ? 'empty' : !isFinite(v) ? (v > 0 ? 'crit' : 'empty')
    : ((hard.hi != null && v > hard.hi) || (hard.lo != null && v < hard.lo)) ? 'crit' : (v < lo || v > hi) ? 'warn' : 'ok';
  const out = [];
  const add = (level, title) => out.push(`${level}:${title}`);
  const tile = (s, name) => { if (s === 'crit') add('crit', `${name} critically out of range`); else if (s === 'warn') add('warn', `${name} off target`); };
  const bagIngr = [sc.aa, sc.dex, sc.naCl, sc.naAc, sc.glyNa, sc.kCl, sc.k2, sc.mg, sc.ca, sc.zn].some(v => v > 0);
  const zeroVolBag = e.Vd === 0 && bagIngr;
  const bagOrdered = e.Vd > 0 || zeroVolBag;
  if (e.Vd > 0) { const s = st(e.gir, [4, 12], { hi: 13 }); if (s === 'crit') add('crit', 'GIR critically high'); else if (s === 'warn') add('warn', 'GIR off target'); }
  const ivNpe = e.aaDel > 0 ? (e.tpnKcal - 4 * e.aaDel) / e.aaDel : null;
  if (ivNpe !== null && st(ivNpe, [24, 32], { lo: 20, hi: 32 }) === 'crit') add('crit', 'NPE:AA critically off target');
  else if (e.totKcal > 0 && st(e.npe, [24, 32]) === 'warn') add('warn', 'NPE:AA off target');
  tile(st(e.proKg, T.pro, { hi: 4.8 }), 'Protein');
  tile(st(e.kcalKg, T.kcal), 'Energy');
  if (st(e.lipG / e.W, T.lip, { hi: 4.5 }) === 'crit') add('crit', 'Lipid critically out of range'); else tile(st(e.lipKg, T.lip), 'Lipid');
  tile(st(e.naTot, T.na), 'Sodium');
  if (st(e.kKg, T.k, { hi: 3.5 }) === 'crit') add('crit', 'Potassium critically out of range'); else tile(st(e.kTot, T.k), 'Potassium');
  tile(st(sc.mg, T.mg), 'Magnesium');
  const oral = sc.oCa > 0 || sc.oP > 0;
  if (oral) { tile(st(e.totCa, T.ca), 'Calcium (total incl. oral)'); tile(st(e.totP, T.p), 'Phosphate (total incl. oral)'); }
  else { tile(st(e.caKg, T.ca), 'Calcium'); tile(st(e.pKg, T.p), 'Phosphorus'); }
  { const s = st(oral ? e.totCaP : e.caP, [1.0, 1.7]); const scope = oral ? ' (รวม oral supp)' : '';
    if (s === 'crit') add('crit', `Ca:P ratio${scope} — ไม่มี P`); else if (s === 'warn') add('warn', `Ca:P ratio${scope} off target`); }
  if (!sc.men && e.enPerKg > 100 && st(e.pe, [2.8, 3.6]) === 'warn') add('warn', 'Protein : Energy off target');
  if (sc.men && e.enPerKg > 24) add('warn', 'MEN ticked above trophic volume');
  if (bagOrdered) {
    if (sc.route === 'peripheral') { if (e.osm > 900) add('crit', 'Osmolarity > peripheral limit'); else if (e.osm > 850) add('warn', 'Osmolarity near peripheral limit'); }
    else if (e.osm > 1800) add('warn', 'Osmolarity high for central line');
  }
  if (e.Vd > 0 && Math.abs(e.fluidKg - sc.fluid) > 20) add('info', 'Fluid: prescribed ≠ target');
  if (e.dexGkg > 18) add('crit', 'Dextrose over KCMH max');
  if (e.kPerL > 40) add('crit', 'K⁺ concentration too high');
  if (e.znTot > 5) add('crit', 'Zinc total above 5 mg/day');
  if (bagOrdered && e.wfi < 0) add('crit', 'Bag cannot be compounded');
  if (e.Vd > 0 && sc.ca > 0 && sc.k2 > 0) add('warn', 'Calcium–phosphate compatibility not calculated');
  return out.sort();
}

// ── Scenarios: every input, every select option, both routes, the caps ──────
const BASE = {
  bw: 1000, cur: 1000, tpnWtOverride: 0, dol: 10, route: 'central', fluid: 150, otherIV: 0, drug: 0,
  ioInput: null, ioOut: 0, drain: 0,
  tpn: 0, useRate: false, dead: 30, dex: 0, aa: 0, lip: 0, lipH: 24,
  naCl: 0, naAc: 0, glyNa: 0, kCl: 0, k2: 0, mg: 0, mgVial: '10', ca: 0,
  soluvit: true, pedi: true, zn: 0, hep: 1,
  feed: 'BM_20', enVol: 0, enFreq: 0, men: false,
  mtv: false, vitD: 0, fe: 0, feType: 'FE_FERDEK', oCa: 0, caType: 'CA_CACO3_350', oP: 0, po4Type: 'PO4_PHOSPHATE',
  weights: [],
};
const SCEN = [
  { name: 'A ELBW DOL3 below BW, full TPN, trophic BM not MEN', bw: 900, cur: 850, dol: 3, fluid: 140, otherIV: 1.5, drug: 2.3,
    ioOut: 40, drain: 5, tpn: 100, dead: 30, dex: 10, aa: 3, lip: 2, lipH: 24,
    naCl: 2, naAc: 1, glyNa: 1, kCl: 1, k2: 0.5, mg: 0.3, ca: 50, hep: 0.5,
    feed: 'BM_20', enVol: 1, enFreq: 8, weights: [{ dol: 1, w: 900 }, { dol: 2, w: 870 }] },
  { name: 'B growing preterm peripheral, rate entry, 50% Mg, Zn, all oral supplements', bw: 1100, cur: 1450, dol: 16,
    route: 'peripheral', fluid: 160, otherIV: 0, drug: 1.2, ioOut: 90, drain: 0, ioInput: 230,
    tpn: 80.4, useRate: 3.35, dead: 20, dex: 12.5, aa: 3.5, lip: 3, lipH: 20,
    naCl: 3, glyNa: 2, kCl: 2, mg: 0.5, mgVial: '50', ca: 80, zn: 0.3, hep: 1,
    feed: 'FBM_PF_22', enVol: 8, enFreq: 8,
    mtv: true, vitD: 400, fe: 2, feType: 'FE_FERROKID', oCa: 50, caType: 'CA_CACO3_1000', oP: 30, po4Type: 'PO4_NEUTRAL',
    weights: [{ dol: 1, w: 1100 }, { dol: 14, w: 1400 }, { dol: 15, w: 1430 }] },
  { name: 'C full enteral HMF, no TPN (feeds-only day), MTV + vit D', bw: 1300, cur: 1600, dol: 25, fluid: 150,
    ioOut: 110, drain: 0, tpn: 0, dead: 30, soluvit: true, pedi: true, hep: 1,
    feed: 'BM_HMF_24', enVol: 30, enFreq: 8,
    mtv: true, vitD: 400, fe: 3, feType: 'FE_FERDEK', oCa: 100, caType: 'CA_CALCETATE', oP: 60, po4Type: 'PO4_PHOSPHATE',
    weights: [{ dol: 1, w: 1300 }, { dol: 24, w: 1580 }] },
  { name: 'D term, manual dosing weight, no dead space, MEN LF, Vitalipid cap', bw: 3200, cur: 3000, tpnWtOverride: 3100, dol: 2,
    fluid: 70, ioOut: 60, tpn: 180, dead: 0, dex: 10, aa: 2, lip: 1, lipH: 16, ca: 40, mg: 0.2, soluvit: true, pedi: false, hep: 1,
    feed: 'LF_24', enVol: 5, enFreq: 8, men: true },
  { name: 'E alert stress: peripheral D15, lipid 4.6, K high, Ca no P, Zn high, MEN above trophic', bw: 800, cur: 800, dol: 10,
    route: 'peripheral', fluid: 150, ioOut: 30, tpn: 60, dead: 30, dex: 15, aa: 4, lip: 4.6, lipH: 24,
    naCl: 5, kCl: 4, ca: 100, zn: 6.5, hep: 1, feed: 'INFATRINI_30', enVol: 3, enFreq: 8, men: true },
  { name: 'F caps: 16 kg, Soluvit/Peditrace/Vitalipid ceilings', bw: 3000, cur: 16000, dol: 40, fluid: 100, tpn: 1000, dead: 30,
    dex: 10, aa: 2, lip: 2, naCl: 2, kCl: 1, soluvit: true, pedi: true, hep: 0.5, feed: 'BM_20', enVol: 0, enFreq: 0 },
  // every remaining feed type, no TPN, full-ish feeds on 1.5 kg
  ...['BM_PF_20', 'PRENAN_22', 'FBM_PF_24', 'FBM_INF_MIX', 'LF_20', 'LF_27'].map((k) => ({
    name: `G feed ${k} (feeds only)`, bw: 1200, cur: 1500, dol: 12, fluid: 160, ioOut: 70, tpn: 0,
    feed: k, enVol: 28, enFreq: 8, weights: [{ dol: 11, w: 1490 }] })),
];

// ── DOM helpers ─────────────────────────────────────────────────────────────
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
  // React 18's onFocus/onBlur listen to the bubbling focusin/focusout.
  act(() => {
    input.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
    valueSetter.call(input, String(value)); input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  act(() => { input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })); });
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
const btnExact = (txt, scope = container) => [...scope.querySelectorAll('button')].find(b => b.textContent.trim() === txt);
const tiles = () => Object.fromEntries([...container.querySelectorAll('.metric')].map(m => [m.querySelector('.lbl')?.textContent, m]));
const num = (s) => { const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : null; };
const tileVal = (label) => { const t = tiles()[label]; if (!t) return undefined; const v = t.querySelector('.val').firstChild?.textContent; return v === '!!' ? Infinity : num(v); };
const tileStatus = (label) => { const t = tiles()[label]; return t ? (t.className.match(/s-(\w+)/) || [])[1] : undefined; };
const bodyText = () => container.textContent.replace(/\s+/g, ' ');

// ── comparison bookkeeping ──────────────────────────────────────────────────
let checks = 0; const mismatches = [];
const NEG = process.env.NEGATIVE_CONTROL === '1';
function near(sc, what, got, want, d) {
  checks++;
  const tol = d == null ? 1e-6 : 0.5 * Math.pow(10, -d) + 1e-6;
  const ok = got !== null && got !== undefined && (
    (want === Infinity && got === Infinity) || (isFinite(got) && isFinite(want) && Math.abs(got - want) <= tol));
  if (!ok) mismatches.push({ sc: sc.name, what, got, want });
}
function same(sc, what, got, want) {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) mismatches.push({ sc: sc.name, what, got, want });
}
function has(sc, what, cond) { checks++; if (!cond) mismatches.push({ sc: sc.name, what, got: false, want: true }); }

// ── run one scenario ────────────────────────────────────────────────────────
async function run(scIn) {
  const sc = { ...BASE, ...scIn };
  const e = expected(sc);
  if (NEG && sc.name.startsWith('A')) e.gir += 0.4;      // negative control: must be caught
  const patient = { sessionId: 'OR-' + sc.name.slice(0, 1), name: 'Oracle', initials: 'OR', bw: sc.bw, ga: 30, sex: 'boys',
    admissionDate: '2026-09-01', currentBed: 'NICU 1', diagnosis: '-', weights: sc.weights, lengths: [], hcs: [] };
  let saved = null;
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear(); copied = null;
  act(() => {
    root.render(React.createElement(window.Calculator, {
      patient, dol: sc.dol, editEntry: null, baselineEntry: null, previousEntry: null, logDate: null,
      userLabel: 'Dr Oracle (oracle@kcmh.test)', userEmail: 'oracle@kcmh.test',
      onLog: (entry) => { saved = entry; return Promise.resolve({ ok: true, entryId: 'srv-1', lastModified: '2026-09-23T01:00:00.000Z' }); },
      onUpdate: () => Promise.resolve({ ok: true, lastModified: 'x' }), onSaved() {}, onWeightChange() {},
    }));
  });
  click(btnExact('Open all'));

  // Step 1 + I/O
  setField('Current weight', sc.cur);
  if (sc.tpnWtOverride) setField('TPN calc. weight', sc.tpnWtOverride);
  setField('Target fluid', sc.fluid);
  setField('Other IV', sc.otherIV);
  setField('Drug volume', sc.drug);
  // Step 2
  selectWith('BM_20', sc.feed);
  setField('Volume(mL/feed)', sc.enVol);
  setField('Frequency', sc.enFreq);
  setCheck('MEN (trophic)', sc.men);
  // Step 3
  click([...container.querySelectorAll('.step2-ctrl .seg button')].find(b => b.textContent === (sc.route === 'central' ? 'Central' : 'Peripheral')));
  if (sc.useRate) setField('Rate', sc.useRate); else setField('Volume(mL/day)', sc.tpn);
  setField('ปริมาตรคาสาย', sc.dead);
  setField('Dextrose final', sc.dex);
  setField('Amino acid', sc.aa);
  setField('SMOF Lipid 20%', sc.lip);
  click([...container.querySelectorAll('button')].find(b => b.textContent === `${sc.lipH}h`));
  // Step 4
  setField('20% NaCl', sc.naCl);
  setField('Na Acetate', sc.naAc);
  setField('Glycophos', sc.glyNa);
  setField('KCl', sc.kCl);
  setField('K₂HPO₄', sc.k2);
  setField('MgSO₄', sc.mg);
  {
    const vial = [...container.querySelectorAll('span')].find(s => s.textContent === 'Vial');
    click([...vial.parentElement.querySelectorAll('.seg button')].find(b => b.textContent === `${sc.mgVial}%`));
  }
  setField('10% Ca gluconate', sc.ca);
  // Step 5
  setCheck('Soluvit N', sc.soluvit);
  setCheck('Peditrace', sc.pedi);
  setField('ZnSO₄', sc.zn);
  setField('Heparin(U/mL)', sc.hep);
  // Step 6
  setCheck('Munti-vim Drop', sc.mtv);
  selectWith('FE_FERDEK', sc.feType);
  setField('Iron', sc.fe);
  selectWith('CA_CACO3_350', sc.caType);
  setField('ปริมาณ elem Ca', sc.oCa);
  selectWith('PO4_PHOSPHATE', sc.po4Type);
  setField('ปริมาณ elem P', sc.oP);
  setField('Vitamin D', sc.vitD);
  // I/O last: Input tracks the prescribed total until typed (left untyped
  // unless the scenario gives one — the auto figure is part of what is checked)
  if (sc.ioInput != null) setField('Input', sc.ioInput);
  setField('Urine output', sc.ioOut);
  setField('Drain content', sc.drain);

  // ─ on-screen figures, before saving ─
  const t = bodyText();
  const grabT = (re) => { const m = t.match(re); return m ? parseFloat(m[1]) : null; };
  near(sc, 'Step1 Plan mL/d', grabT(/Plan ([\d.]+) · Prescribed/), e.planMl, 0);
  near(sc, 'Step1 Prescribed mL/d', grabT(/· Prescribed ([\d.]+) mL\/d/), e.prescribed, 0);
  near(sc, 'Step1 Remaining |mL|', grabT(/(?:Remaining|Over target)\+?([\d.]+)mL\/d (?:left|over)/), Math.abs(e.remaining), 1);
  near(sc, 'TPN calc weight shown (g)', num(inputFor('TPN calc. weight').value), e.wG, 0);
  near(sc, 'EN volume tile mL/kg/d', tileVal('EN volume'), e.enPerKg, 0);
  if (e.availEN >= 0) near(sc, 'Remaining fluid for EN mL/d', grabT(/Remaining fluid for EN([\d.]+)mL\/day/), e.availEN, 0);
  if (sc.enVol * sc.enFreq > 0) {
    const row = [...container.querySelectorAll('.en-delivered span')].map(s => s.textContent);
    const g = (lab) => num((row.find(x => x.startsWith(lab + ' ')) || '').slice(lab.length));
    near(sc, 'EN per kg kcal', g('kcal'), e.enFeed.kcal, 0);
    near(sc, 'EN per kg pro', g('pro'), e.enFeed.pro, 1);
    near(sc, 'EN per kg Na', g('Na'), e.enFeed.na, 1);
    near(sc, 'EN per kg K', g('K'), e.enFeed.k, 1);
    near(sc, 'EN per kg Ca', g('Ca'), e.enFeed.ca, 0);
    near(sc, 'EN per kg P', g('P'), e.enFeed.p, 0);
  }
  near(sc, 'Prepared mL/day', grabT(/Prepared \(เตรียมจริง\)([\d.]+) mL\/day/), e.Vp, 1);
  near(sc, 'Factor', grabT(/Factor([\d.]+)/), e.F, 3);
  if (e.d50 > 0) near(sc, 'D50W mL/d', grabT(/D50W: ([\d.]+) mL\/d/), e.d50, 1);
  near(sc, 'GIR readout', num(container.querySelector('.gir-readout .num')?.firstChild?.textContent), e.gir, 1);
  near(sc, 'AA stock mL/day', grabT(/Volume([\d.]+) mL\/day/), e.aaMl, 1);
  if (e.Vd > 0) {
    near(sc, 'Components mL', grabT(/Components([\d.]+) mL/), e.components, 1);
    near(sc, 'WFI q.s. mL', grabT(/WFI q\.s\.(-?[\d.]+) mL/), e.wfi, 1);
  }
  if (sc.lip > 0) {
    near(sc, 'Lipid pump rate mL/hr', grabT(/PUMP RATE([\d.]+)mL\/hr/), e.lipRate, 2);
    near(sc, 'Lipid g/kg/h', num(container.querySelector('.lipid-gkgh')?.textContent), e.lipGkgh, 3);
    near(sc, 'SMOF mL/day', grabT(/SMOF volume([\d.]+) mL\/day/), e.smof, 1);
    near(sc, 'Vitalipid mL/day', grabT(/\+ Vitalipid N([\d.]+) mL\/day/), e.vitalipid, 1);
  }
  near(sc, 'tile Energy kcal/kg/d', tileVal('Energy (total)'), e.kcalKg, 0);
  near(sc, 'tile Protein g/kg/d', tileVal('Protein'), e.proKg, 1);
  near(sc, 'tile Lipid g/kg/d', tileVal('Lipid (total)'), e.lipKg, 1);
  near(sc, 'tile NPC:Protein', tileVal('NPC : Protein'), e.npe, 0);
  near(sc, 'tile Osmolarity', tileVal('Osmolarity'), e.osm, 0);
  near(sc, 'tile Sodium', tileVal('Sodium'), e.naTot, 1);
  near(sc, 'tile Potassium', tileVal('Potassium'), e.kTot, 1);
  near(sc, 'tile K+ in bag mEq/L', tileVal('K⁺ in bag'), e.kPerL, 0);
  near(sc, 'tile Magnesium', tileVal('Magnesium'), sc.mg, 2);
  near(sc, 'tile Calcium', tileVal('Calcium'), e.caKg, 0);
  near(sc, 'tile Phosphorus', tileVal('Phosphorus'), e.pKg, 0);
  near(sc, 'tile Ca:P', tileVal('Ca:P ratio'), e.caP, 2);
  if (!sc.men && e.enPerKg > 100) near(sc, 'tile Protein:Energy', tileVal('Protein : Energy'), e.pe, 1);
  if (tiles()['Calcium (total)']) {
    near(sc, 'tile Calcium (total)', tileVal('Calcium (total)'), e.totCa, 0);
    near(sc, 'tile Phosphate (total)', tileVal('Phosphate (total)'), e.totP, 0);
    near(sc, 'tile Ca:P (total)', tileVal('Ca:P ratio (total)'), e.totCaP, 2);
  }
  // energy distribution legend
  const legend = [...container.querySelectorAll('.kcal-legend > div')].map(d => num(d.children[1]?.textContent));
  if (e.kcalKg > 0) { near(sc, 'CHO %', legend[0], e.choPct, 0); near(sc, 'Protein %', legend[1], e.proPct, 0); near(sc, 'Fat %', legend[2], e.fatPct, 0); }
  // Glycophos phosphate line
  near(sc, 'Glycophos P mmol/kg/d', num((container.querySelector('.glycophos-p')?.textContent || '').split('P ')[1]), (sc.glyNa || 0) / 2, 2);
  // zinc
  if (e.znTot > 0) near(sc, 'Zinc total mg/day', num(container.querySelector('.zn-total strong')?.textContent), e.znTot, 2);
  // heparin hint
  near(sc, 'Heparin U/day (hint)', grabT(/total ([\d.]+) U\/day/), e.hepU, 0);
  // intake/output
  near(sc, 'I/O balance mL/d', grabT(/Balance ([+-]?[\d.]+) mL\/d/), e.balance, 0);
  near(sc, 'I/O divisor g', grabT(/divisor ([\d.]+) g/), e.ioDivG, 0);
  near(sc, 'Urine mL/kg/h (hint)', num((inputFor('Urine output').closest('.field').querySelector('.field-hint')?.textContent || '')), e.uoKgH, 2);
  // Step 6 supplement readouts
  if (sc.vitD > 0) near(sc, 'Vit D IU/day (hint)', grabT(/= (\d+) IU\/day · ESPGHAN/), e.vitD_day, 0);
  if (sc.vitD > 0 && sc.mtv) near(sc, 'Vit D total with Munti-vim IU/day', grabT(/รวมเป็น (\d+) IU\/day/), e.vitD_total_with_mtv, 0);
  if (sc.oCa > 0) near(sc, 'Oral Ca tabs/day', grabT(/→ ([\d.]+) tab\/day/), e.oCa_tabs, 2);
  if (sc.fe > 0) near(sc, 'Iron mL/day (hint)', grabT(/mg elem Fe\/day · ([\d.]+) mL\/day/), e.fe_ml, 2);
  if (sc.oP > 0) near(sc, 'Oral P mL/day (hint)', grabT(/mmol\) · ([\d.]+) mL\/day/), e.oP_ml, 1);

  // alerts panel: exactly the expected set, by level and title
  const shownAlerts = [...container.querySelectorAll('.calc-bottom .alert-row')]
    .map(a => `${['crit', 'warn', 'info'].find(c => a.classList.contains(c))}:${a.querySelector('.title')?.textContent || ''}`)
    .filter(x => x !== 'info:No safety flags').sort();
  same(sc, 'alerts (level:title)', shownAlerts, expectedAlerts(sc, e));

  // ─ Save ─
  const saveBtn = btnExact('บันทึก');
  has(sc, 'Save button enabled', saveBtn && !saveBtn.disabled);
  if (saveBtn && !saveBtn.disabled) await clickAsync(saveBtn);
  has(sc, 'onLog received an entry', !!saved);
  if (saved) {
    near(sc, 'saved weight', saved.weight, sc.cur);
    near(sc, 'saved fluid mL/kg/d', saved.fluid, e.fluidKg, 6);
    near(sc, 'saved gir', saved.gir, e.gir, 6);
    near(sc, 'saved pro', saved.pro, e.proKg, 6);
    near(sc, 'saved kcal', saved.kcal, e.kcalKg, 6);
    near(sc, 'saved na', saved.na, e.naTot, 6);
    near(sc, 'saved k', saved.k, e.kTot, 6);
    near(sc, 'saved ca', saved.ca, e.caKg, 6);
    near(sc, 'saved p', saved.p, e.pKg, 6);
    near(sc, 'saved enVolPerKg', saved.enVolPerKg, e.enPerKg, 6);
    near(sc, 'saved ioInput', saved.ioInput, e.ioInput);
    near(sc, 'saved ioOutput', saved.ioOutput, sc.ioOut);
    near(sc, 'saved drain', saved.drainContent, sc.drain);
    same(sc, 'saved route', saved.route, e.route);
    near(sc, 'saved tpnWtG', saved.calcInput?.tpnWtG, e.wG);
    near(sc, 'saved suppVitD_IU', saved.suppVitD_IU, e.vitD_day);
    near(sc, 'saved suppCa_mg', saved.suppCa_mg, Math.round(e.oCa_day));
    near(sc, 'saved suppPO4_mmol', saved.suppPO4_mmol, Number(e.oP_mmol.toFixed(2)));
    near(sc, 'saved suppFe_mg', saved.suppFe_mg, Number(e.fe_day.toFixed(1)));
    same(sc, 'saved constantsVersion', saved.constantsVersion, D.CONSTANTS_VERSION);
  }

  // ─ printed pharmacy form ─
  const form = container.querySelector('#print-form');
  has(sc, 'print form rendered after save', !!form);
  if (form) {
    const p = form.textContent.replace(/\s+/g, ' ');
    // the form prints "—" for a zero figure (f/f0), so "—" reads as 0 here
    const g = (re) => { const m = p.match(re); return m ? (m[1] === '—' ? 0 : parseFloat(m[1])) : null; };
    const N = '([\\d.]+|—)';
    const rx = (s) => new RegExp(s.replace(/#/g, N));
    near(sc, 'print Weight for calculation kg', g(rx('Weight for calculation: # Kg')), e.W, 2);
    if (e.Vd > 0) {
      near(sc, 'print Delivered mL', g(rx('# mL \\(Delivered Vol\\.\\)')), e.Vd, 1);
      near(sc, 'print Prepared mL', g(rx('# mL \\(Prepared Vol\\.\\)')), e.Vp, 1);
      near(sc, 'print Factor', g(rx('Factor: ?#')), e.F, 3);
      near(sc, 'print D50W mL', g(rx('# mL \\(D50W\\)')), e.d50, 1);
      near(sc, 'print dextrose g/kg/d', g(rx('g\\. \\(ในถุง\\) = # g/kg/d')), e.dexGkg, 2);
      near(sc, 'print AA mL', g(rx('infant \\(0-1 yr\\.\\).*?= [\\d.—]+ g/kg/d = # mL')), e.aaMl, 1);
      near(sc, 'print WFI mL', g(/WFI (-?[\d.]+) mL/), e.wfi, 1);
      near(sc, 'print Components mL', g(rx('Components # mL')), e.components, 1);
      near(sc, 'print K+ in bag mEq/L', g(rx('K⁺ in bag # mEq/L')), e.kPerL, 0);
      near(sc, 'print Osmolarity (delivered block)', g(rx('Osmolarity # mOsm/L')), e.osm, 0);
      near(sc, 'print GIR', g(rx('GIR # mg/kg/min')), e.gir, 1);
      near(sc, 'print delivered Na mEq', g(rx('Na⁺ # mEq =')), e.naKg * e.W, 2);
      near(sc, 'print delivered K mEq', g(rx('K⁺ # mEq =')), e.kKg * e.W, 2);
      near(sc, 'print phosphate mg', g(rx('Phosphate # mg')), e.pTpnMg, 0);
      near(sc, 'print Energy (TPN) kcal', g(rx('Energy \\(TPN\\) # kcal')), e.tpnKcal, 0);
      near(sc, 'print heparin mL', g(rx('Heparin 100 unit/mL(?:[\\d.]+ unit|—)#')), e.hepMl, 2);
      if (sc.soluvit) near(sc, 'print Soluvit mL', g(rx('Soluvit N# mL/day')), e.soluvit, 1);
      if (sc.pedi) near(sc, 'print Peditrace mL', g(rx('µg/mL\\)# mL/day')), e.pedi, 1);
      if (sc.naCl > 0) near(sc, 'print NaCl mL', g(rx('☑ NaCl[\\d.]+ mEq[\\d.—]+ mEq = # mL')), e.naClMl, 1);
      if (sc.naAc > 0) near(sc, 'print Na acetate mL', g(rx('☑ Na Acetate[\\d.]+ mEq[\\d.—]+ mEq = # mL')), e.naAcMl, 1);
      if (sc.glyNa > 0) near(sc, 'print Glycophos mL (bag)', g(rx('P = 31 mg/mL\\)[\\d.]+ mLNa [\\d.—]+ mEq · P [\\d.—]+ mg# mL')), e.glyMl, 1);
      if (sc.kCl > 0) near(sc, 'print KCl mL', g(rx('KCl \\(2 mEq/mL\\)[\\d.]+ mEq[\\d.—]+ mEq = # mL')), e.kClMl, 1);
      if (sc.k2 > 0) near(sc, 'print K2HPO4 mL', g(rx('P 15\\.5 mg/mL\\)K [\\d.]+ mEqP [\\d.—]+ mg[\\d.—]+ mEq = # mL')), e.k2Ml, 2);
      if (sc.mg > 0) near(sc, 'print MgSO4 mL', g(rx('mEq = # mL \\((?:10|50)%\\)')), e.mgMl, 2);
      if (sc.ca > 0) near(sc, 'print Ca gluconate mL', g(rx('Ca Gluconate[\\d.]+ mg[\\d.—]+ mg = # mL')), e.caMl, 1);
      if (sc.lip > 0) {
        near(sc, 'print SMOF mL', g(rx('20% SMOF = [\\d.]+ g/kg/d = # mL')), e.smof, 1);
        near(sc, 'print Vitalipid mL', g(rx('Vitalipid N infant = # mL')), e.vitalipid, 1);
        near(sc, 'print lipid rate mL/hr', g(rx('= Rate # mL/hr')), e.lipRate, 2);
      }
      if (e.znTot > 0) near(sc, 'print Zn total mg/day', g(rx('Zn รวม # mg/day')), e.znTot, 2);
    }
    if (sc.vitD > 0) near(sc, 'print Vit D IU/day', g(/IU\/kg\/d = (\d+) IU\/day/), e.vitD_day, 0);
    if (sc.fe > 0) near(sc, 'print Fe mL/day', g(/Fe oral \([^)]*\) [\d.]+ mg\/kg\/d = [\d.]+ mg → ([\d.]+) mL\/day/), e.fe_ml, 2);
  }

  // ─ copied order text ─
  const copyBtn = [...container.querySelectorAll('button')].find(b => /Copy Order to Clipboard/.test(b.textContent));
  if (copyBtn) await clickAsync(copyBtn);
  has(sc, 'copy produced text', typeof copied === 'string' && copied.length > 100);
  if (copied) {
    const c = copied;
    const g = (re) => { const m = c.match(re); return m ? parseFloat(m[1]) : null; };
    near(sc, 'copy GIR', g(/GIR: ([\d.]+) mg\/kg\/min/), e.gir, 1);
    near(sc, 'copy Prescribed mL/day', g(/Prescribed: +([\d.]+) mL\/day/), e.prescribed, 0);
    near(sc, 'copy Remaining mL', g(/Remaining: (-?[\d.]+) mL/), e.remaining, 1);
    near(sc, 'copy summary protein', g(/SUMMARY: Protein ([\d.]+) g\/kg/), e.proKg, 1);
    near(sc, 'copy summary energy', g(/Energy ([\d.]+) kcal\/kg \|/), e.kcalKg, 0);
    near(sc, 'copy total Na delivered', g(/Total Na: +[\d.]+ mEq in bag = ([\d.]+) mEq\/kg\/d/), e.naKg, 1);
    near(sc, 'copy total K mEq/L', g(/delivered \(([\d.]+) mEq\/L, max 40\)/), e.kPerL, 0);
    near(sc, 'copy BAG WFI', g(/WFI q\.s\. (-?[\d.]+) mL/), e.wfi, 1);
    if (sc.vitD > 0) near(sc, 'copy Vit D IU/day', g(/Vit D: [\d.]+ IU\/kg\/d = (\d+) IU\/day/), e.vitD_day, 0);
    if (sc.oCa > 0) near(sc, 'copy oral Ca tabs/day', g(/mg\/day → ([\d.]+) tab\/day/), e.oCa_tabs, 2);
  }
}

(async () => {
  console.log(`\n── ${SCEN.length} orders, every figure against an independent recomputation ──`);
  for (const sc of SCEN) {
    const m0 = mismatches.length, c0 = checks;
    try { await run(sc); }
    catch (err) { mismatches.push({ sc: sc.name, what: 'scenario threw', got: String(err && err.stack || err).split('\n').slice(0, 3).join(' | '), want: 'no throw' }); }
    const bad = mismatches.length - m0;
    console.log(`  ${bad ? 'FAIL' : 'PASS'}  ${sc.name.slice(0, 68).padEnd(68)} ${String(checks - c0).padStart(3)} checks${bad ? `  ${bad} mismatch(es)` : ''}`);
  }
  for (const m of mismatches) {
    console.log(`  MISMATCH · ${m.sc} · ${m.what}: app ${JSON.stringify(m.got)} vs oracle ${JSON.stringify(typeof m.want === 'number' ? Number(m.want.toFixed(4)) : m.want)}`);
  }
  console.log(mismatches.length === 0
    ? `\nCALC ORACLE: ALL PASS (${checks} checks)`
    : `\nCALC ORACLE: ${mismatches.length} MISMATCH(ES) of ${checks} checks`);
  process.exit(mismatches.length === 0 ? 0 : 1);
})();
