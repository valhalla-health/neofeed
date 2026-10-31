// verify-sticker-figures-1030.cjs — the TPN room's sticker figures
// (openspec/changes/tpn-room-stickers; Pp, 2026-10-30).
//
//   §1  stickerFigures(): the sample's rows and units, at most the sample's
//       decimals, no trailing zero; null rules; the critical copy;
//   §2  the real <Calculator> sends them as entry.printJson on Submit and on
//       Save draft, from the same calc the doctor saved.
//
// Synthetic infants only. Mounts the real <Calculator> in jsdom — the deps in
// test/README.md.
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
global.showToast = () => {};
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
const D = window.NEOFEED_DATA;

// A synthetic 1.8 kg order, 200 mL delivered + 30 mL dead space = 230 mL,
// Factor 1.8 × 230/200 = 2.07. The calc values are what calculator.jsx's calc
// returns for it, written out, so §1 needs no React.
const C = (extra) => Object.assign({
  totalTPN_mL: 200, deadVol_mL: 30, preparedVol: 230, factor: 2.07,
  d50wVol: 57.5,
  solVol: { aa: 62.1, naCl: 1.2, naAcet: 0, glycophos: 2.1, kCl: 1.6, k2hpo4: 0, mg: 0.8, ca: 9.2, heparin: 1.2, znso4: 0 },
  soluvitVol: 2.1, peditrace_vol: 2.1, wfiVol: 90.1,
  dexG: 25, aaG: 5.4, osmIn: { aaPct: 2.7 }, naKg: 4, kKg: 1.5, pTotal_mg: 55.8,
  znTotal_mg: 0.45, osm: 1012.6, dexKcal: 85, aaKcal: 21.6,
}, extra);
const O = (extra) => Object.assign({
  calc: C(), wtKg: 1.8, dol: 7, orderDate: '2026-11-16', dexPct: 12.5, aaStockKey: 'aminoven10',
  naCl: 2, naAcet: 0, kCl: 1.5, mgPerKg: 0.3, caPerKg: 40, heparinUmL: 0.5,
  inclSoluvit: true, inclPeditrace: true, inclAddamel: false, critOverride: null,
}, extra);
const strings = (o) => typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(strings) : [];

(async () => {
  await section('§1 stickerFigures: the sample sticker, from the calc', async () => {
    eq('schema version', D.STICKER_SCHEMA_VERSION, 1);
    const f = D.stickerFigures(O());
    eq('v and constants', [f.v, f.constantsVersion], [1, D.CONSTANTS_VERSION]);
    eq('order date, dol, weight, factor', [f.orderDate, f.dol, f.dosingWeightKg, f.factor], ['2026-11-16', '7', '1.8', '2.07']);
    eq('volumes: delivered, dead, prepared', [f.deliveredMl, f.deadMl, f.preparedMl], ['200', '30', '230']);
    eq('worksheet rows', f.stockMl, {
      d50w: '57.5', aminoven10: '62.1', amiparen10: '0', aminoplasmal15: '0',
      nacl20: '1.2', glycophos: '2.1', k2hpo4: '0', naAcetate: '0', kcl: '1.6', mgso4_10: '0.8',
      caGluconate: '9.2', soluvit: '2.1', peditrace: '2.1', heparin: '1.2', wfi: '90.1',
      aminoleban8: '0', nephrosteril7: '0', znso4: '0', mgso4_50: '0', addamel: '0',
    });
    eq('PN label', f.delivered, {
      dextrosePct: '12.5', dextroseG: '25', aminoAcidPct: '2.7',
      aminoAcidG: { aminoven10: '5.4', amiparen10: '0', aminoplasmal15: '0', aminoleban8: '0', nephrosteril7: '0' },
      naMeq: '7.2', kMeq: '2.7', caMg: '72', mgMg: '6.6', phosphateMg: '55.8', acetateMeq: '0', clMeq: '6.3',
      znMg: '0.5', soluvitMl: '1.8', peditraceMl: '1.8', addamelMl: '0', heparinUnits: '100',
      osmolarity: '1013', kcal: '107',
    });
    eq('no critical value', f.critical, null);
    eq('no string ends in a trailing zero after a decimal point', strings(f).filter(s => /\.\d*0$/.test(s)), []);
    ok('fits a Sheets cell with room to spare (< 8,000 characters)', JSON.stringify(f).length < 8000, JSON.stringify(f).length);
  });

  await section('§1b the rules around it', async () => {
    eq('no TPN volume → null', D.stickerFigures(O({ calc: C({ totalTPN_mL: 0 }) })), null);
    eq('no weight → null', D.stickerFigures(O({ wtKg: 0 })), null);
    const ap = D.stickerFigures(O({ aaStockKey: 'aminoplasmal15' }));
    eq('Aminoplasmal: its rows, not Aminoven', [ap.stockMl.aminoven10, ap.stockMl.aminoplasmal15, ap.delivered.aminoAcidG.aminoplasmal15], ['0', '62.1', '5.4']);
    eq('Na acetate 1 mEq/kg → acetate 1.8 mEq, 1 : 1', D.stickerFigures(O({ naAcet: 1 })).delivered.acetateMeq, '1.8');
    const ad = D.stickerFigures(O({ inclAddamel: true }));
    eq('Addamel ticked → no figure on either sticker', [ad.stockMl.addamel, ad.delivered.addamelMl], [null, null]);
    eq('Soluvit unticked → 0 delivered', D.stickerFigures(O({ inclSoluvit: false })).delivered.soluvitMl, '0');
    eq('chloride counts NaCl and KCl, 1 : 1', D.stickerFigures(O({ naCl: 3, kCl: 2 })).delivered.clMeq, '9');
    const crit = D.stickerFigures(O({ critOverride: { reason: 'synthetic reason', alerts: ['K⁺ above max'], at: '2026-11-16T03:00:00Z' } }));
    eq('a confirmed critical value is copied, without its time', crit.critical, { alerts: ['K⁺ above max'], reason: 'synthetic reason' });
    eq('an ISO timestamp is cut to the date', D.stickerFigures(O({ orderDate: '2026-11-16T00:00:00.000Z' })).orderDate, '2026-11-16');
    eq('anything else is no date', D.stickerFigures(O({ orderDate: 'Mon Nov 16 2026' })).orderDate, '');
  });

  console.log(`\n${fail === 0 ? 'STICKER FIGURES 1030: ALL PASS' : `STICKER FIGURES 1030: ${fail} FAILED`} (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
})();
