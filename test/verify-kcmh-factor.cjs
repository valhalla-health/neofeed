// End-to-end Factor verification.
//
// Drives the REAL <Calculator> in jsdom, then checks its rendered order form
// against an INDEPENDENT re-implementation of the KCMH worksheet's own formula
// chain (recorded from the workbook earlier this session). Two implementations
// of the same documented formulas must agree — with one named exception since
// 2026-09-18: NeoFeed scales Soluvit/Peditrace by the overfill, where the
// sheet's G43/G45 use actual weight (see vitExtra below).
// Since 2026-11-16 the prepared volume G7 is rounded up to the next 10 mL
// (preparedKcmh) and the amino acid, the WFI and (with dead space) D50W are
// drawn up in whole mL (drawn, below); both are modelled here from the rule,
// not taken from the app.
const fs = require('fs');
const { printFormTicked: __printFormTicked } = require('./print-acks-helper.cjs');
const vm = require('vm');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = require('path').join(__dirname, '..') + '/';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'https://localhost/', pretendToBeVisual: true });
const { window } = dom;
global.window = window;
global.document = window.document;
global.self = window;
global.HTMLElement = window.HTMLElement;
global.Element = window.Element;
global.Node = window.Node;
global.getComputedStyle = window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = clearTimeout;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;

vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
for (const f of ['icons.jsx', 'calculator.jsx']) {
  vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + f, 'utf8'), {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    filename: f, configFile: false, babelrc: false,
  }).code);
}

// ── The prepared volume, 2026-11-16 ─────────────────────────────────────────
// Pp, for the TPN unit and the ward: with a dead space, delivered + dead is
// rounded UP to the next 10 mL strictly above the sum (100 + 20 = 120 → 130),
// so the line keeps more than the dead space typed. What reaches the sheet's G8
// is then prepared − delivered, and G7 = C7 + G8 as the workbook has it. No dead
// space is no overfill and no rounding. Written here, not read from data.js.
function preparedKcmh(delivered, dead) {
  if (!(delivered > 0)) return 0;
  if (!(dead > 0)) return delivered;
  const sum = Number((delivered + dead).toFixed(2));   // 1220.04 + 30, not 1250.0399…
  return (Math.floor(sum / 10) + 1) * 10;
}

// ── The KCMH worksheet's formula chain, transcribed independently ──────────
function sheet(i) {
  const C6 = i.wtKg, C7 = i.delivered, G8 = preparedKcmh(i.delivered, i.dead) - i.delivered, G7 = C7 + G8;
  const H9 = (G7 / C7) * C6;                       // Factor
  const F10 = (i.dexPct / 100) * G7,  H10 = F10 * 2;          // dextrose g, D50W mL
  const F11 = i.aaPerKg * H9,        H12 = (F11 / 10) * 100;  // AA g, Aminoven mL
  const H11 = (F11 / G7) * 100;                    // AA %
  const G20 = i.naCl * H9,   H20 = G20 / 3.42;
  const G21 = i.naAcet * H9, H21 = G21 / 3;
  const G23 = i.glyco * 2 * H9, H23 = i.glyco * H9, G24 = i.glyco * 31 * H9;
  const G27 = i.k2hpo4 * H9, H27 = G27 * 1, G28 = G27 * 15.5;
  const G29 = i.kCl * H9,    I29 = G29 / 2;
  const G32 = i.mg * H9,     I32 = G32 * 2 / 8.12 * 5;        // 10% MgSO4
  const G36 = i.ca * H9,     H36 = G36 / 9.01755, G38 = H36 * 0.45;
  const G43 = i.soluvitMlKg * C6;                  // NB: C6, not H9
  const G45 = i.peditraceMlKg * C6;                // NB: C6, not H9
  const G51 = i.hepUmL * G7, H51 = G51 / 100;
  const E52 = 50 * i.dexPct + 100 * H11
            + 2 * (G20 + G21 + G23) * 1000 / G7
            + 2 * (G27 + G29) * 1000 / G7
            + 1.4 * (G38 * 1000 / G7)
            + 1 * (G32 * 1000 / G7);
  const E53 = 3.4 * F10 + 4 * F11 + 9 * 0;
  const J52 = H10 + H12 + H20 + H21 + H23 + H27 + I29 + I32 + H36 + G43 + G45 + H51;
  const I53 = G7 - J52;
  const B14 = C7 / 24, B15 = (B14 * i.dexPct) / (6 * C6);      // GIR
  const dlv = C7 / G7;
  return {
    factor: H9, prepared: G7, d50w: H10, aaBag: F11, aaMl: H12,
    naClMl: H20, naAcetMl: H21, glycoMl: H23, k2hpo4Ml: H27, kClMl: I29,
    mgMl: I32, caMl: H36, hepMl: H51, soluvitMl: G43, peditraceMl: G45,
    osm: E52, kcalBag: E53, componentVol: J52, wfi: I53, gir: B15,
    // delivered doses (sheet rows 85-98)
    dexDeliveredG: F10 * dlv, aaDeliveredG: F11 * dlv,
    naDelivered: (G20 + G21 + G23) * dlv, kDelivered: (G27 + G29) * dlv,
    caDelivered: G36 * dlv, kcalDelivered: E53 * dlv,
  };
}

// ── Drive the real component ───────────────────────────────────────────────
const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
const patient = { sessionId: 'F-1', name: 'T', currentBed: '9B2', diagnosis: '-', weights: [] };

const IN = {
  wtKg: 1.2, delivered: 100, dead: Number(process.env.DEAD ?? 20),
  dexPct: 10, aaPerKg: 3, naCl: 3, naAcet: 1, glyco: 0.5,
  kCl: 2, k2hpo4: 1, mg: 0.4, ca: 80, hepUmL: 1,
  soluvitMlKg: 1, peditraceMlKg: 1,
};

act(() => {
  root.render(React.createElement(window.Calculator, {
    patient, dol: 5,
    // The production UI deliberately withholds actionable print output until
    // a save has returned a stable entryId. This arithmetic harness supplies
    // a saved shell row so it can continue reading the real print form.
    // Since 2026-09-11 the print form renders only while the form matches the
    // saved row (review F2) — so the shell row carries the same inputs this
    // harness then types through the real fields. Typing them back leaves the
    // form un-dirty, and the form below is the one pharmacy would print.
    // The worksheet recipe has no lipid, so its NPE:AA (≈ 9 kcal/g) is a
    // critical value; since 2026-09-17 (UP-C6) a saved row prints only when its
    // override names every critical alert, so the shell row carries one.
    // Since 2026-09-18 a saved row also carries the calculation version it was
    // computed with; an unstamped overfilled row with vitamins is held from
    // printing until it is saved again. This shell row stands for one saved
    // with the current calculation, so it carries the current stamp.
    editEntry: { entryId: 'fixture-entry', lastModified: 'fixture-stamp', ts: '2026-08-06', dol: 5, weight: IN.wtKg * 1000,
      calcInput: { constantsVersion: window.NEOFEED_DATA.CONSTANTS_VERSION,
        curWtG: IN.wtKg * 1000, totalTPN_mL: IN.delivered, deadVol_mL: IN.dead, dexPct: IN.dexPct,
        aaPerKg: IN.aaPerKg, naCl: IN.naCl, naAcet: IN.naAcet, glycophosP: IN.glyco, kCl: IN.kCl,
        k2hpo4: IN.k2hpo4, mgPerKg: IN.mg, caPerKg: IN.ca, heparinUmL: IN.hepUmL,
        critOverride: { reason: 'worksheet fixture', alerts: ['NPE:AA critically off target'], at: '2026-08-06T01:00:00.000Z' } } },
    baselineEntry: null, logDate: null,
    onLog(){}, onUpdate(){}, onSaved(){}, onWeightChange(){},
  }));
});
act(() => {
  container.querySelectorAll('.card-h.clickable').forEach((h) =>
    h.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
});

const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
function setField(labelText, value) {
  // NumField renders .field > label; SaltRow renders .salt-row-grid > div > div
  let input = null;
  const field = [...container.querySelectorAll('.field')]
    .find((d) => d.querySelector('label')?.textContent.startsWith(labelText));
  if (field) input = field.querySelector('input');
  if (!input) {
    const row = [...container.querySelectorAll('.salt-row-grid')]
      .find((d) => d.firstElementChild?.firstElementChild?.textContent.startsWith(labelText));
    if (row) input = row.querySelector('input');
  }
  if (!input) throw new Error('field not found: ' + labelText);
  act(() => {
    valueSetter.call(input, String(value));
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}



// NB: labels must include the unit — a bare 'Volume' also matches the ENTERAL
// feed-volume field, which silently sends the input to the wrong place.
setField('Current weight(g)', IN.wtKg * 1000);
setField('Volume(mL/day)', IN.delivered);
setField('ปริมาตรคาสาย (dead space)(mL/day)', IN.dead);
setField('Dextrose final(%)', IN.dexPct);
setField('Amino acid (Aminoven 10%)(g/kg/d)', IN.aaPerKg);
setField('20% NaCl', IN.naCl);
setField('Na Acetate', IN.naAcet);
setField('Glycophos', IN.glyco * 2);          // UI takes mEq Na/kg = mL/kg x 2
setField('KCl', IN.kCl);
setField('K₂HPO₄', IN.k2hpo4);
setField('MgSO₄', IN.mg * 12.1525);   // typed in mg since 2026-10-28; IN.mg stays mEq
setField('10% Ca gluconate', IN.ca);
setField('Heparin(U/mL)', IN.hepUmL);

const want = sheet(IN);
// NeoFeed's one deliberate departure from this sheet (Praew, 2026-09-18):
// Soluvit and Peditrace are scaled by the overfill like every other additive,
// so the infant receives the full 1 mL/kg; the sheet's G43/G45 stay on actual
// weight (C6). sheet() above is left exactly as the workbook computes; on an
// overfilled bag the app's vitamin mL, components and WFI differ from it by
// precisely vitExtra.
const overfill = want.prepared / IN.delivered;
const vitExtra = (want.soluvitMl + want.peditraceMl) * (overfill - 1);

// ── What pharmacy draws up from the sheet, 2026-11-16 ──────────────────────
// The sheet's mL are exact; the bag is drawn up rounded. The amino acid and
// the WFI are whole mL (TPN unit: big syringes, no decimals), half up, and D50W
// too as drawnD50w says; every other stock keeps one decimal, half up, as
// before. The WFI is what the
// printed prepared volume leaves after the printed components, then whole mL,
// unless it is below 0 (an over-full bag keeps its exact shortfall). Modelled
// here so the components and WFI are checked against the rule, not against the
// app's own sum. Until 2026-11-16 this harness held the app's components and
// WFI to the sheet's exact J52/I53 within 0.15 mL; a whole-mL amino acid alone
// moves 0.2 mL here, so they are held to the drawn-up bag within 0.05 instead.
const halfUp = (x, d) => { const p = 10 ** d; return Math.round(Number((x * p).toFixed(6))) / p; };
// D50W, as amended the same day (Pp): one decimal on a bag with no dead space;
// whole mL with one, except that a non-central bag ordered at or under 12.5 %
// rounds down rather than past 12.5 % in the bag. This order is central.
const ROUTE = 'central';
function drawnD50w(exactMl) {
  if (!(IN.dead > 0)) return halfUp(exactMl, 1);
  const whole = halfUp(exactMl, 0);
  if (ROUTE !== 'central' && IN.dexPct <= 12.5 && whole * 0.5 / want.prepared * 100 > 12.5 + 1e-9) return Math.floor(exactMl + 1e-9);
  return whole;
}
const drawn = [
  drawnD50w(want.d50w), halfUp(want.aaMl, 0),
  halfUp(want.naClMl, 1), halfUp(want.naAcetMl, 1), halfUp(want.glycoMl, 1),
  halfUp(want.k2hpo4Ml, 1), halfUp(want.kClMl, 1), halfUp(want.mgMl, 1), halfUp(want.caMl, 1),
  halfUp(want.soluvitMl * overfill, 1), halfUp(want.peditraceMl * overfill, 1), halfUp(want.hepMl, 1),
];
const printedComponents = halfUp(drawn.reduce((s, v) => s + v, 0), 1);
const wfiLeft = halfUp(halfUp(want.prepared, 1) - printedComponents, 1);
const printedWfi = wfiLeft < 0 ? wfiLeft : halfUp(wfiLeft, 0);
const form = __printFormTicked(container);
const formText = form.textContent.replace(/\s+/g, ' ');
const bodyText = container.textContent.replace(/\s+/g, ' ');

let fails = 0;
const near = (label, got, exp, tol) => {
  const ok = got !== null && Math.abs(got - exp) <= tol;
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(34)} app ${got === null ? '(not found)' : Number(got.toFixed(4))}  sheet ${Number(exp.toFixed(4))}`);
};
// pull "<caption> ... <number> <unit>" out of the rendered form
const grab = (re) => { const m = formText.match(re); return m ? parseFloat(m[1]) : null; };

console.log(`\n── ${IN.wtKg} kg · deliver ${IN.delivered} mL · dead ${IN.dead} mL → prepare ${want.prepared} mL${IN.dead > 0 ? ` (next 10 above ${IN.delivered + IN.dead})` : ''} ──`);
console.log(`   sheet Factor H9 = (${want.prepared}/${IN.delivered}) x ${IN.wtKg} = ${want.factor.toFixed(3)}\n`);

near('Factor',                 grab(/Factor:([\d.]+)/),                      want.factor,       0.001);
near('Prepared volume mL',     grab(/([\d.]+) mL \(Prepared Vol\.\)/),        want.prepared,     0.05);
// The amino acid is whole mL since 2026-11-16, and so is D50W on a bag with
// dead space (drawnD50w): the sheet's exact mL, half up. Within 0.05 of that,
// so within 0.5 of the sheet and no further; with no dead space D50W keeps one
// decimal, within 0.05 of the sheet as before.
near(`D50W mL (sheet, ${IN.dead > 0 ? 'whole mL' : 'one decimal'})`, grab(/([\d.]+) mL \(D50W\)/), drawnD50w(want.d50w), 0.05);
// anchor to the Aminoven row: the dextrose row read "g in bag = ... mL" too (since 2026-11-16 "→")
near('AA g in bag',            grab(/Aminoven infant \/ PED AMINE = [\d.]+ g\/kg\/d = ([\d.]+) g in bag/), want.aaBag, 0.05);   // PED AMINE named since 2026-10-28
near('Aminoven mL (sheet, whole mL)', grab(/g\/kg\/d = [\d.]+ g in bag = ([\d.]+) mL/), halfUp(want.aaMl, 0), 0.05);
near('20% NaCl mL',            grab(/mEq = ([\d.]+) mL/),                     want.naClMl,       0.05);
near('Components mL (drawn up)', grab(/Components ([\d.]+) mL/),              printedComponents, 0.05);
near('WFI q.s. mL (whole mL)',   grab(/WFI (-?[\d.]+) mL/),                    printedWfi,        0.05);
// What whole-mL WFI allows: the printed components + WFI is the prepared
// volume to within half a mL (2026-11-16), never further.
{
  const c = grab(/Components ([\d.]+) mL/), w = grab(/WFI (-?[\d.]+) mL/);
  near('components + WFI ≈ prepared (±0.5)', c === null || w === null ? null : c + w, want.prepared, 0.5);
}
near('Dextrose delivered g',   grab(/Dextrose ([\d.]+) g/),                   want.dexDeliveredG, 0.05);
near('AA delivered g',         grab(/Amino acid ([\d.]+) g =/),               want.aaDeliveredG, 0.05);
near('Na delivered mEq',       grab(/Na⁺ ([\d.]+) mEq/),                      want.naDelivered,  0.02);
near('K delivered mEq',        grab(/K⁺ ([\d.]+) mEq/),                       want.kDelivered,   0.02);
near('Ca delivered mg',        grab(/Ca²⁺ ([\d.]+) mg/),                      want.caDelivered,  0.6);
near('Osmolarity mOsm/L',      grab(/Osmolarity ([\d.]+) mOsm\/L/),           want.osm,          1.0);
near('GIR mg/kg/min',          grab(/GIR ([\d.]+) mg\/kg\/min/),              want.gir,          0.05);

// ── The identities the Factor exists to guarantee ────────────────────────
console.log('\n── round-trip identities ──');
near('delivered AA = ordered g/kg', want.aaDeliveredG / IN.wtKg,  IN.aaPerKg, 1e-9);
near('delivered Na = ordered mEq/kg', want.naDelivered / IN.wtKg,
     IN.naCl + IN.naAcet + IN.glyco * 2, 1e-9);
near('delivered Ca = ordered mg/kg', want.caDelivered / IN.wtKg,  IN.ca,      1e-9);
// osmolarity must NOT change with overfill (amount and volume scale together)
const noOverfill = sheet({ ...IN, dead: 0 });
near('osmolarity unchanged by overfill', want.osm, noOverfill.osm, 0.001);
near('GIR unchanged by overfill',        want.gir, noOverfill.gir, 1e-9);
// vitamins: the SHEET doses them on actual weight (G43/G45 × C6)…
near('sheet: Soluvit mL on actual weight',   want.soluvitMl,   IN.soluvitMlKg * IN.wtKg,   1e-9);
near('sheet: Peditrace mL on actual weight', want.peditraceMl, IN.peditraceMlKg * IN.wtKg, 1e-9);
// …NeoFeed puts overfill × that in the bag (rounded to 0.1 mL), so what
// reaches the infant comes back to the ordered 1 mL/kg, like AA, Na and Ca.
near('app: Soluvit mL = sheet × overfill',   grab(/Soluvit N([\d.]+) mL\/day/),  want.soluvitMl * overfill,   0.05);
near('app: Peditrace mL = sheet × overfill', grab(/µg\/mL\)([\d.]+) mL\/day/),   want.peditraceMl * overfill, 0.05);
if (overfill > 1.001) {
  near('delivered Soluvit = ordered mL/kg',   grab(/× Factor → delivers ([\d.]+) mL \(KCMH sheet G43/), IN.soluvitMlKg * IN.wtKg,   0.05);
  near('delivered Peditrace = ordered mL/kg', grab(/× Factor → delivers ([\d.]+) mL \(KCMH sheet G45/), IN.peditraceMlKg * IN.wtKg, 0.05);
}

console.log('\n── UI surfaces the overfill ──');
const overfilled = IN.dead > 0;
for (const [label, re, expect] of [
  // the vitamins' "× Factor → delivers" note appears ONLY on an overfilled bag
  ['vitamin "× Factor" note on the form', /× Factor → delivers/, overfilled],
  // and the old "not overfill-scaled" caveat is gone for good (2026-09-18)
  ['no "not overfill-scaled" caveat', /not overfill-scaled/, false],
  ['prepared volume shown in app', /Prepared \(เตรียมจริง\)/, true],
  ['delivered section on form',    /DELIVERED IN/, true],
]) {
  const ok = re.test(bodyText) === expect; if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${expect ? '' : ' (absent, as expected)'}`);
}

console.log(fails === 0 ? '\nFACTOR: ALL PASS' : `\nFACTOR: ${fails} FAILURE(S)`);
process.exit(fails ? 1 : 0);
