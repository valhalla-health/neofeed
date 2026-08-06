// End-to-end Factor verification.
//
// Drives the REAL <Calculator> in jsdom, then checks its rendered order form
// against an INDEPENDENT re-implementation of the KCMH worksheet's own formula
// chain (recorded from the workbook earlier this session). Two implementations
// of the same documented formulas must agree.
const fs = require('fs');
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

// ── The KCMH worksheet's formula chain, transcribed independently ──────────
function sheet(i) {
  const C6 = i.wtKg, C7 = i.delivered, G7 = i.delivered + i.dead;
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

act(() => {
  root.render(React.createElement(window.Calculator, {
    patient, dol: 5, editEntry: null, baselineEntry: null,
    logDate: '2026-08-06', onLog(){}, onUpdate(){}, onSaved(){}, onWeightChange(){},
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

const IN = {
  wtKg: 1.2, delivered: 100, dead: Number(process.env.DEAD ?? 20),
  dexPct: 10, aaPerKg: 3, naCl: 3, naAcet: 1, glyco: 0.5,
  kCl: 2, k2hpo4: 1, mg: 0.4, ca: 80, hepUmL: 1,
  soluvitMlKg: 1, peditraceMlKg: 1,
};

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
setField('MgSO₄', IN.mg);
setField('10% Ca gluconate', IN.ca);
setField('Heparin(U/mL)', IN.hepUmL);

const want = sheet(IN);
const form = container.querySelector('#print-form');
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

console.log(`\n── ${IN.wtKg} kg · deliver ${IN.delivered} mL · dead ${IN.dead} mL → prepare ${want.prepared} mL ──`);
console.log(`   sheet Factor H9 = (${want.prepared}/${IN.delivered}) x ${IN.wtKg} = ${want.factor.toFixed(3)}\n`);

near('Factor',                 grab(/Factor:([\d.]+)/),                      want.factor,       0.001);
near('Prepared volume mL',     grab(/([\d.]+) mL \(Prepared Vol\.\)/),        want.prepared,     0.05);
near('D50W mL',                grab(/([\d.]+) mL \(D50W\)/),                  want.d50w,         0.05);
// anchor to the Aminoven row: the dextrose row also reads "g in bag = ... mL"
near('AA g in bag',            grab(/Aminoven infant = [\d.]+ g\/kg\/d = ([\d.]+) g in bag/), want.aaBag, 0.05);
near('Aminoven mL',            grab(/g\/kg\/d = [\d.]+ g in bag = ([\d.]+) mL/),  want.aaMl,   0.05);
near('20% NaCl mL',            grab(/mEq = ([\d.]+) mL/),                     want.naClMl,       0.05);
near('Components total mL',    grab(/Components ([\d.]+) mL/),                want.componentVol, 0.15);
near('WFI q.s. mL',            grab(/WFI (-?[\d.]+) mL/),                     want.wfi,          0.15);
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
// vitamins deliberately NOT scaled (sheet G43/G45 use C6)
near('Soluvit mL (not scaled)',    want.soluvitMl,   IN.soluvitMlKg * IN.wtKg,   1e-9);
near('Peditrace mL (not scaled)',  want.peditraceMl, IN.peditraceMlKg * IN.wtKg, 1e-9);

console.log('\n── UI surfaces the overfill ──');
const overfilled = IN.dead > 0;
for (const [label, re, expect] of [
  // the vitamin caveat must appear ONLY when the bag is actually overfilled
  ['vitamin overfill caveat', /not overfill-scaled|Vitamins \/ trace/, overfilled],
  ['prepared volume shown in app', /Prepared \(เตรียมจริง\)/, true],
  ['delivered section on form',    /DELIVERED IN/, true],
]) {
  const ok = re.test(bodyText) === expect; if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${expect ? '' : ' (absent, as expected)'}`);
}

console.log(fails === 0 ? '\nFACTOR: ALL PASS' : `\nFACTOR: ${fails} FAILURE(S)`);
process.exit(fails ? 1 : 0);
