// verify-tpn-sticker-1116.cjs — the TPN unit's answers of 2026-11-16 that move the bag's figures.
//
//   §1 data.js preparedVolFor: delivered + dead space, rounded up to the next 10 mL above the sum (the
//      ward's nurses: "ปัดขึ้นเป็นเลขกลมๆหรือเผื่อสายมากกว่า 30 mL"; Pp chose "next ten, always above").
//      No dead space is not rounded; no volume is no bag.
//   §2 the real <Calculator> in jsdom, on saved orders, read off its printed form: the prepared volume and
//      Factor follow §1; D50W, the amino acid and the WFI are whole mL (the unit's pharmacists: "Dextrose,
//      amino, SWI ขอไม่มีทศนิยม"); every other stock keeps one decimal; components + WFI is the bag to within
//      half a mL. D50W's two exceptions (Pp, after the cold reader): a bag with no dead space keeps one
//      decimal, and a peripheral bag never rounds up past 12.5 %.
//   §3 a bag over-full by less than half a mL keeps its exact negative WFI, so rounding never lets it print.
//   §4 data.js stickerFigures: the PN label's Dead space is Prepared − Delivered as printed, so the label's
//      three volumes add up.
//   §5 the TPN room ships the unit's three PN lines, so a sheet is no longer a trial.
//
// §1, §2, §4 and §5 were watched failing on the code before this change (origin/main fabe44a); §3 guards the
// new rounding. Synthetic infants only.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');
const { printFormTicked } = require('./print-acks-helper.cjs');

const DIR = path.join(__dirname, '..') + '/';
let pass = 0, fail = 0, n = 0;
function eq(name, got, want) {
  const yes = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${yes ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name}${yes ? '' : `  got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
  yes ? pass++ : fail++;
}
const ok = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name}${cond ? '' : '  ' + JSON.stringify(detail ?? '')}`);
  cond ? pass++ : fail++;
};
const section = (t) => console.log(`\n── ${t} ──`);

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
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
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
{ const w = console.error; console.error = (...a) => { if (!/act\(|not wrapped|Not implemented/.test(String(a[0]))) w(...a); }; }

vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
for (const f of ['icons.jsx', 'calculator.jsx']) {
  vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + f, 'utf8'), {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    filename: f, configFile: false, babelrc: false,
  }).code);
}
const D = window.NEOFEED_DATA;

// ── §1 ──
section('§1 preparedVolFor: up to the next 10 mL above delivered + dead space');
const P = D.preparedVolFor;
eq('48 + 30 = 78 → 80 (the photo\'s order)', P(48, 30), 80);
eq('110 + 30 = 140 is already round → 150, so the line keeps more than 30', P(110, 30), 150);
eq('47.5 + 30 = 77.5 → 80', P(47.5, 30), 80);
eq('a float sum just under 140 still reads 140 → 150 (0.1 + 0.2 style tail)', P(109.99999999999, 30), 150);
eq('139.9 + 0 dead space is not rounded', P(139.9, 0), 139.9);
eq('dead space 50 → 120 + 50 = 170 → 180', P(120, 50), 180);
eq('no volume, no bag', [P(0, 30), P(null, 30), P(undefined, 30)], [0, 0, 0]);
eq('a missing dead space is 0', P(60, null), 60);
ok('30 mL of dead space always leaves 31 to 40 mL over delivered, every whole mL from 1 to 1200',
  Array.from({ length: 1200 }, (_, i) => P(i + 1, 30) - (i + 1)).every((x) => x > 30 && x <= 40));
ok('…and the result is always a multiple of 10', Array.from({ length: 1200 }, (_, i) => P(i + 1, 30) % 10 === 0).every(Boolean));

// ── §2 the real calculator ──
const container = document.getElementById('root');
let root = null;
const NPE = 'NPE:AA critically off target';
function render(inp) {
  if (root) act(() => root.unmount());
  root = ReactDOM.createRoot(container);
  const patient = { sessionId: 'TS-1116', name: 'T', currentBed: 'NICU 3', diagnosis: '-', weights: [] };
  act(() => {
    root.render(React.createElement(window.Calculator, {
      patient, dol: 10,
      editEntry: { entryId: 'fixture-1116', lastModified: 'fixture-stamp', ts: '2026-11-16', dol: 10, weight: inp.wtKg * 1000,
        calcInput: { constantsVersion: D.CONSTANTS_VERSION, curWtG: inp.wtKg * 1000, totalTPN_mL: inp.delivered,
          deadVol_mL: inp.dead, dexPct: inp.dexPct, aaPerKg: inp.aaPerKg, naCl: inp.naCl || 0, naAcet: 0,
          glycophosP: inp.glyco || 0, kCl: inp.kCl || 0, k2hpo4: 0, mgPerKg: inp.mg || 0, caPerKg: inp.ca || 0,
          heparinUmL: inp.hep ?? 1, inclSoluvit: inp.vit ?? true, inclPeditrace: inp.vit ?? true, route: inp.route || 'central',
          critOverride: { reason: 'harness fixture', alerts: inp.alerts || [NPE], at: '2026-11-16T01:00:00.000Z' } } },
      baselineEntry: null, logDate: null,
      onLog() {}, onUpdate() {}, onSaved() {}, onWeightChange() {},
    }));
  });
  act(() => {
    container.querySelectorAll('.card-h.clickable').forEach((h) => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
  });
  const form = printFormTicked(container);
  return form ? form.textContent.replace(/\s+/g, ' ') : '';
}
const grab = (text, re) => { const m = text.match(re); return m ? Number(m[1]) : null; };

section('§2 a 1.1 kg infant, 48 mL delivered, 30 mL dead space (the photo\'s order)');
const A = { wtKg: 1.1, delivered: 48, dead: 30, dexPct: 12.5, aaPerKg: 1.8, naCl: 0, glyco: 1, kCl: 1, mg: 0.41, ca: 80 };
const a = render(A);
ok('the order form renders', a.length > 200, a.slice(0, 120));
eq('prepared is 80 mL, not 78', grab(a, /([\d.]+) mL \(Prepared Vol\.\)/), 80);
eq('delivered stays 48 mL', grab(a, /([\d.]+) mL \(Delivered Vol\.\)/), 48);
const factor = grab(a, /Factor:\s*([\d.]+)/);
ok(`the Factor is 1.1 × 80 / 48 = 1.833 (printed ${factor})`, factor !== null && Math.abs(factor - 1.1 * 80 / 48) < 0.0006, factor);
eq('D50W: 80 × 12.5 % = 10 g ÷ 0.5 = 20 mL', grab(a, /([\d.]+) mL \(D50W\)/), 20);
eq('the amino acid is whole mL: 1.8 × 1.833 = 3.3 g → 33 mL', grab(a, /g\/kg\/d = [\d.]+ g in bag = ([\d.]+) mL/), 33);
const comp = grab(a, /Components ([\d.]+) mL/), wfi = grab(a, /WFI (-?[\d.]+) mL/);
ok(`WFI is whole mL (exact 2.7, printed ${wfi})`, wfi === 3, wfi);
ok(`components ${comp} + WFI ${wfi} is the 80 mL bag to within half a mL`, comp !== null && wfi !== null && Math.abs(comp + wfi - 80) <= 0.5, [comp, wfi]);
ok('the form says WFI leads to the prepared volume, not that it equals it', /mL → 80 mL prepared/.test(a), a.match(/WFI[^.]{0,80}/)?.[0]);
ok('the D50W line says the mL follows from the grams ("→"), not that they are equal', /g\/kg\/d → 20 mL \(D50W\)/.test(a), a.match(/Final Conc[^(]{0,90}/)?.[0]);
ok('a stock outside the three keeps its decimal: Ca gluconate 80 × 1.833 ÷ 9.01755 = 16.3 mL', /\b16\.3 mL/.test(a), a.match(/Ca Gluconate[^)]{0,60}/i)?.[0]);
eq('the printed dextrose dose is the one ordered: 48 mL × 12.5 % = 6 g', grab(a, /Dextrose ([\d.]+) g/), 6);

section('§2a fractions: 0.73 kg, 58.4 + 30 mL, D11 %, amino acid 3.5 g/kg');
const f2 = render({ ...A, wtKg: 0.73, delivered: 58.4, dexPct: 11, aaPerKg: 3.5 });
eq('prepared 88.4 → 90', grab(f2, /([\d.]+) mL \(Prepared Vol\.\)/), 90);
eq('D50W 90 × 11 % ÷ 0.5 = 19.8 → 20 mL', grab(f2, /([\d.]+) mL \(D50W\)/), 20);
eq('amino acid 3.5 × 0.73 × 90 / 58.4 = 3.94 g = 39.4 → 39 mL', grab(f2, /g\/kg\/d = [\d.]+ g in bag = ([\d.]+) mL/), 39);

section('§2b dead space 0: no overfill, no rounding up, D50W keeps its decimal (Pp)');
const b = render({ ...A, delivered: 47.5, dead: 0 });
eq('prepared is the delivered 47.5 mL', grab(b, /([\d.]+) mL \(Prepared Vol\.\)/), 47.5);
eq('D50W 47.5 × 12.5 % ÷ 0.5 = 11.875 → 11.9 mL, one decimal', grab(b, /([\d.]+) mL \(D50W\)/), 11.9);
eq('the amino acid is still whole: 1.8 × 1.1 = 1.98 g = 19.8 → 20 mL', grab(b, /g\/kg\/d = [\d.]+ g in bag = ([\d.]+) mL/), 20);

section('§2c 120 mL delivered + 30 = 150, already round → 160');
const c = render({ ...A, wtKg: 2, delivered: 120, dexPct: 10, aaPerKg: 3 });
eq('prepared 160', grab(c, /([\d.]+) mL \(Prepared Vol\.\)/), 160);
eq('D50W 160 × 10 % ÷ 0.5 = 32 mL', grab(c, /([\d.]+) mL \(D50W\)/), 32);
eq('amino acid 3 × 2 × 160/120 = 8 g → 80 mL', grab(c, /g\/kg\/d = [\d.]+ g in bag = ([\d.]+) mL/), 80);

section('§2d a peripheral bag never rounds D50W up past 12.5 % (Pp)');
// 1 kg, 35 + 30 mL → 70 mL; D12.5 % is 8.75 g = 17.5 mL. 18 mL would be 12.9 %.
const P1 = { wtKg: 1, delivered: 35, dead: 30, dexPct: 12.5, aaPerKg: 0.5, naCl: 0, glyco: 0, kCl: 0, mg: 0, ca: 0 };
const cen = render({ ...P1, route: 'central' });
const per = render({ ...P1, route: 'peripheral' });
eq('central: 17.5 → 18 mL', grab(cen, /([\d.]+) mL \(D50W\)/), 18);
eq('peripheral: 17.5 → 17 mL, 12.1 % in the bag, not 12.9 %', grab(per, /([\d.]+) mL \(D50W\)/), 17);
const per10 = render({ ...P1, route: 'peripheral', dexPct: 10 });
eq('peripheral D10 %: 14 mL exactly, nothing to round', grab(per10, /([\d.]+) mL \(D50W\)/), 14);
const per12 = render({ ...P1, route: 'peripheral', dexPct: 12, delivered: 45 });
// 45 + 30 → 80 mL; 12 % is 9.6 g = 19.2 mL → 19 (11.9 %): rounding down is nearest anyway.
eq('peripheral D12 % in 80 mL: 19.2 → 19 mL, the nearest', grab(per12, /([\d.]+) mL \(D50W\)/), 19);
// An order already above 12.5 % is not rounded down: the rule keeps a bag at the limit from passing it,
// it does not cut a dose the doctor wrote above it (the Central-only chip says that). 13.5 % of 70 mL
// is 18.9 mL (second cold reader, 2026-11-16: no check failed with that half of the rule removed).
const per135 = render({ ...P1, route: 'peripheral', dexPct: 13.5 });
eq('peripheral D13.5 % in 70 mL: 18.9 → 19 mL, the nearest', grab(per135, /([\d.]+) mL \(D50W\)/), 19);

// ── §3 ──
section('§3 a bag over-full by less than half a mL is still refused');
// 1 kg, 20 + 30 → 60 mL, Factor 3: D50W 15 + amino acid 45 + heparin 0.3 = 60.3 mL, so WFI is −0.3.
// Rounded like a positive WFI it would read 0 and the order would print (cold reader, 2026-11-16).
const o = render({ wtKg: 1, delivered: 20, dead: 30, dexPct: 12.5, aaPerKg: 1.5, naCl: 0, glyco: 0, kCl: 0, mg: 0, ca: 0, hep: 0.5, vit: false });
const screen = container.textContent.replace(/\s+/g, ' ');
eq('the screen says the components exceed the bag by 0.3 mL', grab(screen, /Components exceed the bag by ([\d.]+) mL/), 0.3);
eq('…and the order form does not render', o, '');

// ── §4 ──
section('§4 stickerFigures: Dead space is Prepared − Delivered as printed');
const calc = {
  totalTPN_mL: 48, wtKg: 1.1, aaStockKey: 'aminoven10', factor: 1.833, deadVol_mL: 30, preparedVol: 80,
  d50wVol: 20, soluvitVol: 2, peditrace_vol: 2, wfiVol: 3, dexG: 6, osmIn: { aaPct: 4.13 }, aaG: 1.98,
  naKg: 2, kKg: 1, pTotal_mg: 34, znTotal_mg: 0.3, osm: 1100, dexKcal: 20.4, aaKcal: 7.9,
  solVol: { aa: 33, naCl: 0, glycophos: 2, k2hpo4: 0, naAcet: 0, kCl: 1, mg: 0.9, ca: 16.3, heparin: 0.8, znso4: 0 },
};
const base = { dol: 18, dexPct: 12.5, caPerKg: 80, mgPerKg: 0.41, naAcet: 0, naCl: 0, kCl: 1, heparinUmL: 1, inclAddamel: false, orderDate: '2026-11-16' };
const pj = D.stickerFigures({ ...base, calc });
eq('Delivered 48 + Dead space 32 = Prepared 80 on the label, not the 30 mL typed', [pj.deliveredMl, pj.deadMl, pj.preparedMl], ['48', '32', '80']);
const pj2 = D.stickerFigures({ ...base, calc: { ...calc, totalTPN_mL: 47.55 } });
eq('47.55 + 30: the label reads 47.6 + 32.4 = 80, the printed figures adding up', [pj2.deliveredMl, pj2.deadMl, pj2.preparedMl], ['47.6', '32.4', '80']);
eq('a bag with no dead space prints 0 dead space', (D.stickerFigures({ ...base, calc: { ...calc, preparedVol: 48 } }) || {}).deadMl, '0');

// ── §5 ──
section('§5 the TPN room ships the unit\'s three PN lines');
const Core = require(DIR + 'tpn-room-core.js');
eq('the heading, storage line and extension the unit gave', [Core.PN_FIXED.heading, Core.PN_FIXED.storage, Core.PN_FIXED.extension],
  ['Parenteral nutrition กลุ่มงานเภสัชกรรม โรงพยาบาลจุฬาลงกรณ์', 'วิธีเก็บ: เก็บในตู้เย็นได้ 7 วัน, ถ้าใส่วิตามินแล้วจะเก็บ 1 วัน', 'เบอร์ต่อหน่วย TPN: 73602']);
eq('so a sheet prints as a real label, with no trial note on the row', [Core.fixedLinesReady(), Core.trialNote()], [true, '']);
eq('…and blank lines would still print a trial', Core.fixedLinesReady(Core.PN_BLANK), false);
// 2026-11-16.1 with this harness's figures; 2026-11-18.1 since IV lipid counts 10 kcal/g (Pp, Q8).
ok('the constants version moved with the figures', D.CONSTANTS_VERSION === '2026-11-18.1', D.CONSTANTS_VERSION);

if (root) act(() => root.unmount());
console.log(`\nTPN STICKER 1116: ${fail ? 'FAILURES' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
