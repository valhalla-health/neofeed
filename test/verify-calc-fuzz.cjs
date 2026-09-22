// verify-calc-fuzz.cjs — the calculator against orders nobody thought to write.
//
// Fixed scenarios only ever cover the orders someone imagined. This one builds
// pseudo-random ones from a seed (so any failure is reproducible: the seed and
// the whole input object are printed with it), types each into the real
// <Calculator>, and checks the figures against a recomputation written
// separately from the one in verify-calc-oracle.cjs — a third opinion, not a
// copy of the second.
//
// Five invariants must hold for EVERY order, however odd:
//   I1  the Factor round-trip: what reaches the infant per kg is what was
//       ordered, to within the 0.05 mL a syringe can be drawn to
//   I2  dead space moves no delivered figure — not GIR, not osmolarity, not kcal/kg
//   I3  components + WFI q.s. = the prepared volume
//   I4  no NaN, Infinity, undefined, float tail or trailing zero in any text
//       node on screen (Praew's rule: "18.0" can be read as 180)
//   I5  a critical tile always comes with a critical alert (the F1 rule)
//
// Usage: node test/verify-calc-fuzz.cjs [count] [seed]  ·  FUZZ_N / FUZZ_SEED
// also work. CI runs the default; a deep local run is FUZZ_N=500.
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
const COUNT = Number(process.argv[2] || process.env.FUZZ_N || 80);
let seed = Number(process.argv[3] || process.env.FUZZ_SEED || 20260923);
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (lo, hi, step) => { const n = Math.round((lo + rnd() * (hi - lo)) / step) * step; return Number(n.toFixed(4)); };

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'https://localhost/', pretendToBeVisual: true });
const { window } = dom;
Object.assign(global, { window, document: window.document, self: window, HTMLElement: window.HTMLElement, Element: window.Element,
  Node: window.Node, getComputedStyle: window.getComputedStyle, localStorage: window.localStorage,
  requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true });
global.showToast = () => {};
window.print = () => {}; window.prompt = () => 'fuzz'; window.confirm = () => true;
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
{ const w = console.error; console.error = (...a) => { if (!/act\(|not wrapped|Not implemented/.test(String(a[0]))) w(...a); }; }
vm.runInThisContext(R('data.js'));
const D = window.NEOFEED_DATA;
for (const f of ['icons.jsx', 'calculator.jsx']) {
  vm.runInThisContext(babel.transformSync(R(f), { presets: [[require('@babel/preset-react'), { runtime: 'classic' }]], filename: f, configFile: false, babelrc: false }).code);
}

// ── second recomputation, written from the definitions (not from the app) ────
const FEED = { // per 100 mL: kcal, pro, fat, cho, Na mmol, K mmol, Ca mg, P mg
  BM_20: [67, 1.2, 3.4, 6.7, 0.9, 1.39, 26, 15], BM_HMF_24: [81, 2.6, 3.8, 8.2, 1.4, 1.89, 115, 59],
  BM_PF_20: [67, 1.5, 3.5, 7.4, 1, 1.7, 50, 28], FBM_PF_22: [74, 2.1, 4, 8.1, 1.87, 1.9, 102, 59],
  PRENAN_22: [74, 1.7, 4.3, 7.9, 1.3, 1.77, 74, 67], FBM_PF_24: [80, 2.1, 3.8, 10.9, 3, 2.56, 84, 55],
  FBM_INF_MIX: [90, 2.6, 4.75, 9.45, 1.55, 2.3, 100, 55], INFATRINI_30: [100, 2.6, 5.4, 10.3, 1.8, 2.75, 124, 69],
  LF_20: [67, 1.41, 3.75, 6.9, 1.17, 1.72, 57, 40], LF_24: [80, 1.68, 4.48, 8.24, 1.39, 2.05, 68, 47],
  LF_27: [90, 1.89, 5.04, 9.27, 1.57, 2.31, 77, 53] };
function recompute(s) {
  const kg = s.wG / 1000, Vd = s.tpn, Vp = Vd > 0 ? Vd + s.dead : 0, ov = Vd > 0 ? Vp / Vd : 1, F = kg * ov;
  const gly = s.glyNa / 2;                                   // mEq Na → mL (2 mEq Na per mL)
  const dexDel = Vd * s.dex / 100, dexBag = Vp * s.dex / 100;
  const aaDel = s.aa * kg, lipG = s.lip * kg;
  const vitalipid = s.lip > 0 ? Math.min(4 * kg, 10) : 0, lipBag = lipG / 0.2 + vitalipid;
  const f = FEED[s.feed], enTot = s.enVol * s.enFreq, enC = s.men ? 0 : enTot;
  const kcal = 3.4 * dexDel + 4 * aaDel + 9 * lipG + enC / 100 * f[0];
  const proG = aaDel + enC / 100 * f[1];
  const naKg = s.naCl + s.naAc + gly * 2, kKg = s.kCl + s.k2;
  const pMg = gly * kg * 31 + s.k2 * kg * 15.5;
  return {
    kg, Vp, F, ov,
    gir: dexDel * 1000 / 1440 / kg,
    kcalKg: kcal / kg,
    proKg: proG / kg,
    lipKg: (lipG + enC / 100 * f[2]) / kg,
    naTot: naKg + enC / 100 * f[4] / kg,
    kTot: kKg + enC / 100 * f[5] / kg,
    caKg: s.ca + enC / 100 * f[6] / kg,
    pKg: pMg / kg + enC / 100 * f[7] / kg,
    kPerL: Vp > 0 ? kKg * kg * ov / (Vp / 1000) : 0,
    enPerKg: enTot / kg,
    prescribed: Vd + lipBag + s.otherIV + s.drug + enC,
    d50: dexBag > 0 ? Math.round(dexBag / 0.5 * 10) / 10 : 0,
    aaMl: Math.round(s.aa * F / 0.1 * 10) / 10,
    smof: Math.round(lipG / 0.2 * 10) / 10,
    vitalipid,
    osm: Vd > 0 ? 50 * s.dex + 100 * (aaDel / Vd * 100) + 2 * (naKg * kg / (Vd / 1000)) + 2 * (kKg * kg / (Vd / 1000))
      + 1.4 * (s.ca * kg / (Vd / 1000) / 20) + (s.mg * kg / (Vd / 1000)) : 50 * s.dex,
    npe: proG > 0 ? (kcal - 4 * proG) / proG : 0,
  };
}

// ── drive the component ─────────────────────────────────────────────────────
const container = document.getElementById('root');
let root = ReactDOM.createRoot(container);
const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
const selSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
const inputFor = (label) => {
  const fi = [...container.querySelectorAll('.field')].find(d => d.querySelector('label')?.textContent.startsWith(label));
  if (fi) return fi.querySelector('input');
  const row = [...container.querySelectorAll('.salt-row-grid')].find(d => d.firstElementChild?.firstElementChild?.textContent.startsWith(label));
  return row ? row.querySelector('input') : null;
};
const setField = (label, v) => { const i = inputFor(label); if (!i) throw new Error('no field ' + label);
  act(() => { valueSetter.call(i, String(v)); i.dispatchEvent(new window.Event('input', { bubbles: true })); }); };
const click = (el) => act(() => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
const tileVal = (lbl) => { const t = [...container.querySelectorAll('.metric')].find(m => m.querySelector('.lbl')?.textContent === lbl);
  if (!t) return undefined; const s = t.querySelector('.val').firstChild?.textContent; return s === '!!' ? Infinity : (s === '—' ? null : parseFloat(s)); };
const tileStatus = (lbl) => { const t = [...container.querySelectorAll('.metric')].find(m => m.querySelector('.lbl')?.textContent === lbl); return t ? (t.className.match(/s-(\w+)/) || [])[1] : undefined; };
const text = () => container.textContent.replace(/\s+/g, ' ');
const grab = (re) => { const m = text().match(re); return m ? parseFloat(m[1]) : null; };

function mount(patient, dol) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container); window.localStorage.clear();
  act(() => { root.render(React.createElement(window.Calculator, { patient, dol, editEntry: null, baselineEntry: null, previousEntry: null,
    logDate: null, userLabel: 'Dr Fuzz (f@x.test)', userEmail: 'f@x.test', onLog: () => Promise.resolve({ ok: true, entryId: 'e', lastModified: 'l' }),
    onUpdate: () => Promise.resolve({ ok: true }), onSaved() {}, onWeightChange() {} })); });
  click([...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Open all'));
}

let checks = 0, bad = 0; const shown = [];
const fail = (s, what, got, want) => { if (bad < 25) shown.push(`#${s.i} ${what}: app ${JSON.stringify(got)} vs oracle ${JSON.stringify(want)} · ${JSON.stringify(s)}`); bad++; };
// A stock volume is printed with toFixed(1) (rounds the DECIMAL value) while
// this oracle rounds x*10 — and x*10 can snap an exact .x5 to the tie (12.95 →
// 129.5), so the two legitimately differ by one step on a tie. 0.1 mL tolerance
// for stock volumes only; everything else keeps the display's own precision.
const nearTol = (s, what, got, want, tol) => { checks++;
  const ok = got !== null && got !== undefined && isFinite(got) && Math.abs(got - want) <= tol;
  if (!ok) fail(s, what, got, want); };
const near = (s, what, got, want, d) => { checks++; const tol = 0.5 * Math.pow(10, -(d ?? 6)) + 1e-6;
  const ok = (want === Infinity && got === Infinity) || (got !== null && got !== undefined && isFinite(got) && isFinite(want) && Math.abs(got - want) <= tol);
  if (!ok) fail(s, what, got, want); };

for (let i = 0; i < COUNT; i++) {
  const bw = between(400, 4000, 10);
  const cur = pick([bw, between(400, 4500, 10), between(Math.max(400, bw - 300), bw + 600, 10)]);
  const s = {
    i, bw, cur, wG: 0, dol: pick([1, 2, 3, 5, 7, 8, 14, 30, 60]),
    route: pick(['central', 'peripheral']),
    fluid: between(40, 200, 5), otherIV: pick([0, 0, between(0, 20, 0.5)]), drug: pick([0, 0, between(0, 30, 0.5)]),
    tpn: pick([0, between(10, 400, 1), between(10, 400, 0.5)]), dead: pick([0, 10, 20, 30, between(0, 40, 1)]),
    dex: pick([0, between(2.5, 20, 0.5)]), aa: pick([0, between(0.5, 5, 0.1)]), lip: pick([0, between(0.5, 5, 0.1)]), lipH: pick([16, 20, 24]),
    naCl: pick([0, between(0, 6, 0.5)]), naAc: pick([0, between(0, 4, 0.5)]), glyNa: pick([0, between(0, 4, 0.5)]),
    kCl: pick([0, between(0, 5, 0.5)]), k2: pick([0, between(0, 3, 0.5)]), mg: pick([0, between(0, 1, 0.1)]), mgVial: pick(['10', '50']),
    ca: pick([0, between(0, 150, 5)]), soluvit: rnd() > 0.2, pedi: rnd() > 0.2, zn: pick([0, between(0, 2, 0.05)]), hep: pick([0, 0.5, 1]),
    feed: pick(Object.keys(FEED)), enVol: pick([0, between(0, 60, 0.5)]), enFreq: pick([0, 6, 8, 12]), men: rnd() > 0.7,
  };
  const auto = (bw > 0 && cur > 0 && cur < bw) ? bw : cur;
  s.wG = auto;
  if (s.tpn === 0) { s.dex = 0; s.aa = 0; s.naCl = 0; s.naAc = 0; s.glyNa = 0; s.kCl = 0; s.k2 = 0; s.mg = 0; s.ca = 0; s.zn = 0; }
  const e = recompute(s);

  mount({ sessionId: 'FZ' + i, name: 'F', bw, ga: 30, sex: 'boys', admissionDate: '2026-09-01', currentBed: 'NICU 1', diagnosis: '-', weights: [{ dol: 1, w: bw }], lengths: [], hcs: [] }, s.dol);
  setField('Current weight', s.cur);
  setField('Target fluid', s.fluid); setField('Other IV', s.otherIV); setField('Drug volume', s.drug);
  const sel = [...container.querySelectorAll('select')].find(x => [...x.options].some(o => o.value === 'BM_20'));
  act(() => { selSetter.call(sel, s.feed); sel.dispatchEvent(new window.Event('change', { bubbles: true })); });
  setField('Volume(mL/feed)', s.enVol); setField('Frequency', s.enFreq);
  const menBox = [...container.querySelectorAll('label.chk-label')].find(l => l.textContent.trim().startsWith('MEN')).querySelector('input');
  if (menBox.checked !== s.men) act(() => menBox.click());
  click([...container.querySelectorAll('.step2-ctrl .seg button')].find(b => b.textContent === (s.route === 'central' ? 'Central' : 'Peripheral')));
  setField('Volume(mL/day)', s.tpn); setField('ปริมาตรคาสาย', s.dead);
  setField('Dextrose final', s.dex); setField('Amino acid', s.aa); setField('SMOF Lipid 20%', s.lip);
  click([...container.querySelectorAll('button')].find(b => b.textContent === `${s.lipH}h`));
  setField('20% NaCl', s.naCl); setField('Na Acetate', s.naAc); setField('Glycophos', s.glyNa);
  setField('KCl', s.kCl); setField('K₂HPO₄', s.k2); setField('MgSO₄', s.mg);
  const vial = [...container.querySelectorAll('span')].find(x => x.textContent === 'Vial');
  click([...vial.parentElement.querySelectorAll('.seg button')].find(b => b.textContent === `${s.mgVial}%`));
  setField('10% Ca gluconate', s.ca);
  for (const [lbl, want] of [['Soluvit N', s.soluvit], ['Peditrace', s.pedi]]) {
    const box = [...container.querySelectorAll('label.chk-label')].find(l => l.textContent.trim().startsWith(lbl)).querySelector('input');
    if (box.checked !== want) act(() => box.click());
  }
  setField('ZnSO₄', s.zn); setField('Heparin(U/mL)', s.hep);

  // values
  near(s, 'GIR', grab(/GIR([\d.]+)mg\/kg\/min/), e.gir, 1);
  near(s, 'Energy kcal/kg', tileVal('Energy (total)'), e.kcalKg, 0);
  near(s, 'Protein g/kg', tileVal('Protein'), e.proKg, 1);
  near(s, 'Lipid g/kg', tileVal('Lipid (total)'), e.lipKg, 1);
  near(s, 'Na mEq/kg', tileVal('Sodium'), e.naTot, 1);
  near(s, 'K mEq/kg', tileVal('Potassium'), e.kTot, 1);
  near(s, 'K in bag mEq/L', tileVal('K⁺ in bag'), e.kPerL, 0);
  near(s, 'Ca mg/kg', tileVal('Calcium'), e.caKg, 0);
  near(s, 'P mg/kg', tileVal('Phosphorus'), e.pKg, 0);
  near(s, 'EN mL/kg/d', tileVal('EN volume'), e.enPerKg, 0);
  near(s, 'Osmolarity', tileVal('Osmolarity'), e.osm, 0);
  near(s, 'NPC:Protein', tileVal('NPC : Protein'), e.npe, 0);
  near(s, 'Prescribed fluid', grab(/· Prescribed ([\d.]+) mL\/d/), e.prescribed, 0);
  near(s, 'Prepared volume', grab(/Prepared \(เตรียมจริง\)([\d.]+) mL\/day/), e.Vp, 1);
  near(s, 'Factor', grab(/Factor([\d.]+)/), e.F, 3);
  // stock mL: 0.1 mL tolerance — an exactly-.x5 value is a float tie, and
  // toFixed and Math.round can land on either side of it (10.45 → 10.4 / 10.5)
  if (e.d50 > 0) nearTol(s, 'D50W mL', grab(/D50W: ([\d.]+) mL\/d/), e.d50, 0.1001);
  if (s.aa > 0) nearTol(s, 'AA mL', grab(/Volume([\d.]+) mL\/day/), e.aaMl, 0.1001);
  if (s.lip > 0) { nearTol(s, 'SMOF mL', grab(/SMOF volume([\d.]+) mL\/day/), e.smof, 0.1001);
    near(s, 'Vitalipid mL', grab(/\+ Vitalipid N([\d.]+) mL\/day/), e.vitalipid, 1); }

  // I3 · components + WFI = prepared
  if (s.tpn > 0) {
    const comp = grab(/Components([\d.]+) mL/), wfi = grab(/WFI q\.s\.(-?[\d.]+) mL/);
    checks++; if (comp === null || wfi === null || Math.abs(comp + wfi - e.Vp) > 0.051) fail(s, 'I3 components+WFI=prepared', [comp, wfi], e.Vp);
  }
  // I4 · nothing broken on screen. Per TEXT NODE, not the concatenated text:
  // adjacent chips ("0.2" "0.4" "0.6") join into "0.20.40.6" in textContent.
  const t = text();
  checks++; if (/NaN|Infinity|undefined|e\+\d|\d\.\d{6,}/.test(t)) fail(s, 'I4 broken number on screen', (t.match(/[^ ]*(NaN|Infinity|undefined|e\+\d|\d\.\d{6,})[^ ]*/) || [])[0], 'clean');
  checks++; {
    const walk = (el, out) => { for (const n of el.childNodes) {
      if (n.nodeType === 3) { const m = String(n.textContent).match(/\d+\.\d*0(?!\d)/g); if (m) out.push(n.textContent.trim().slice(0, 60)); }
      else if (n.nodeType === 1) walk(n, out); } return out; };
    const tz = walk(container, []);
    if (tz.length) fail(s, 'I4 trailing zero in a text node', tz.slice(0, 3), 'no trailing zeros');
  }
  // I5 · a critical tile has a critical alert
  const critTiles = [...container.querySelectorAll('.metric.s-crit')].map(m => m.querySelector('.lbl')?.textContent);
  const critAlerts = [...container.querySelectorAll('.calc-bottom .alert-row.crit')].length;
  checks++; if (critTiles.length > 0 && critAlerts === 0) fail(s, 'I5 critical tile without a critical alert', critTiles, '≥1 crit alert');

  // I1/I2 · the Factor round-trip and dead-space independence: same order, dead 0
  if (s.tpn > 0 && s.dead > 0) {
    const gir1 = grab(/GIR([\d.]+)mg\/kg\/min/), osm1 = tileVal('Osmolarity'), kcal1 = tileVal('Energy (total)');
    setField('ปริมาตรคาสาย', 0);
    checks++; if (Math.abs(grab(/GIR([\d.]+)mg\/kg\/min/) - gir1) > 0.051) fail(s, 'I2 dead space moved GIR', grab(/GIR([\d.]+)mg\/kg\/min/), gir1);
    checks++; if (Math.abs(tileVal('Osmolarity') - osm1) > 1) fail(s, 'I2 dead space moved osmolarity', tileVal('Osmolarity'), osm1);
    checks++; if (Math.abs(tileVal('Energy (total)') - kcal1) > 1) fail(s, 'I2 dead space moved kcal/kg', tileVal('Energy (total)'), kcal1);
    setField('ปริมาตรคาสาย', s.dead);
    // I1: mL of stock × (delivered/prepared) ÷ weight = the ordered per-kg dose
    if (s.naCl > 0) {
      const ml = grab(/เตรียม ([\d.]+) mL\/d/);
      const deliveredPerKg = ml * (s.tpn / e.Vp) * 3.42 / e.kg;
      // the recipe is drawn up to 0.1 mL, so the round-trip can only be as
      // exact as half that step — anything beyond it is a real error
      const step = 0.05 * (s.tpn / e.Vp) * 3.42 / e.kg + 1e-6;
      checks++; if (Math.abs(deliveredPerKg - s.naCl) > step) fail(s, 'I1 NaCl round-trip beyond 0.05 mL', deliveredPerKg, s.naCl);
    }
  }
}

shown.forEach(l => console.log('  MISMATCH ' + l));
console.log(bad === 0
  ? `\nCALC FUZZ: ALL PASS (${COUNT} random orders, seed ${process.argv[3] || process.env.FUZZ_SEED || 20260923}, ${checks} checks)`
  : `\nCALC FUZZ: ${bad} MISMATCH(ES) of ${checks} checks over ${COUNT} orders`);
process.exit(bad === 0 ? 0 : 1);
