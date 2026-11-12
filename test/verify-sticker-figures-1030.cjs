// verify-sticker-figures-1030.cjs — the TPN room's sticker figures
// (openspec/changes/tpn-room-stickers; Pp, 2026-10-30).
//
//   §1  stickerFigures(): the sample's rows and units, at most the sample's
//       decimals, no trailing zero; null rules; the critical copy;
//   §2  the real <Calculator> sends them as entry.printJson on Submit and on
//       Save draft, from the same calc the doctor saved, and marks the order
//       (calcInput.printJsonV) so the ward sync can tell it has figures;
//   §2c an order saved before this release, without figures, can be saved
//       again: a notice, Submit enabled, a full save instead of only a lock;
//   §2d what the real <Calculator> sends passes the real gas-backend.gs, which
//       holds printJson to this schema and refuses the doctor's save otherwise.
//
// Synthetic infants only. Mounts the real <Calculator> in jsdom — the deps in
// test/README.md.
const fs = require('fs');
const { printFormTicked: __printFormTicked } = require('./print-acks-helper.cjs');
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
// returns for it, written out, so §1 needs no React. The calc carries the
// weight and the amino-acid product its rows were built on; stickerFigures
// reads both from it, so they cannot disagree with the rows.
const C = (extra) => Object.assign({
  wtKg: 1.8, aaStockKey: 'aminoven10',
  totalTPN_mL: 200, deadVol_mL: 30, preparedVol: 230, factor: 2.07,
  d50wVol: 57.5,
  solVol: { aa: 62.1, naCl: 1.2, naAcet: 0, glycophos: 2.1, kCl: 1.6, k2hpo4: 0, mg: 0.8, ca: 9.2, heparin: 1.2, znso4: 0 },
  soluvitVol: 2.1, peditrace_vol: 2.1, wfiVol: 90.1,
  dexG: 25, aaG: 5.4, osmIn: { aaPct: 2.7 }, naKg: 4, kKg: 1.5, pTotal_mg: 55.8,
  znTotal_mg: 0.45, osm: 1021.9, dexKcal: 85, aaKcal: 21.6,
}, extra);
const O = (extra) => Object.assign({
  calc: C(), dol: 7, orderDate: '2026-11-16', dexPct: 12.5,
  naCl: 2, naAcet: 0, kCl: 1.5, mgPerKg: 0.3, caPerKg: 40, heparinUmL: 0.5,
  inclAddamel: false, critOverride: null,
}, extra);
const strings = (o) => typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(strings) : [];
const tryFig = (o) => { try { return D.stickerFigures(o); } catch (e) { return 'threw: ' + e.message; } };

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
      znso4: '0', addamel: '0',
    });
    eq('PN label', f.delivered, {
      dextrosePct: '12.5', dextroseG: '25', aminoAcidPct: '2.7',
      aminoAcidG: { aminoven10: '5.4', amiparen10: '0', aminoplasmal15: '0' },
      naMeq: '7.2', kMeq: '2.7', caMg: '72', mgMg: '6.6', phosphateMg: '55.8', acetateMeq: '0', clMeq: '6.3',
      znMg: '0.5', soluvitMl: '1.8', peditraceMl: '1.8', addamelMl: '0', heparinUnits: '100',
      osmolarity: '1022', kcal: '107',
    });
    // The TPN unit, 2026-11-03 (tasks.md 0.3 g): Amiparen and Addamel N are still ordered elsewhere, so their
    // rows stay at 0. Nobody orders Aminoleban or Nephrosteril for a child, and MgSO₄ 50 % can go.
    eq('rows the unit dropped are gone', ['aminoleban8', 'nephrosteril7', 'mgso4_50'].filter(k => k in f.stockMl || k in f.delivered.aminoAcidG), []);
    eq('rows the unit kept stay at 0', [f.stockMl.amiparen10, f.delivered.aminoAcidG.amiparen10, f.stockMl.addamel, f.delivered.addamelMl], ['0', '0', '0', '0']);
    eq('no critical value', f.critical, null);
    eq('no string ends in a trailing zero after a decimal point', strings(f).filter(s => /\.\d*0$/.test(s)), []);
    eq('no figure is a dash', strings(f).filter(s => s === '—'), []);
    ok('fits a Sheets cell with room to spare (< 8,000 characters)', JSON.stringify(f).length < 8000, JSON.stringify(f).length);
  });

  await section('§1b the rules around it', async () => {
    eq('no TPN volume → null', D.stickerFigures(O({ calc: C({ totalTPN_mL: 0 }) })), null);
    eq('no weight in the calc → null', D.stickerFigures(O({ calc: C({ wtKg: 0 }) })), null);
    const ap = D.stickerFigures(O({ calc: C({ aaStockKey: 'aminoplasmal15' }) }));
    eq('Aminoplasmal: its rows, not Aminoven', [ap.stockMl.aminoven10, ap.stockMl.aminoplasmal15, ap.delivered.aminoAcidG.aminoplasmal15], ['0', '62.1', '5.4']);
    eq('Na acetate 1 mEq/kg → acetate 1.8 mEq, 1 : 1', D.stickerFigures(O({ naAcet: 1 })).delivered.acetateMeq, '1.8');
    // The input boxes cannot type a minus sign, so only a damaged saved row can bring one here. The server
    // refuses a negative figure, and that would stop the doctor's save, so the order has no figures instead.
    eq('a negative dose → null', D.stickerFigures(O({ naCl: -2 })), null);
    eq('a negative stock row → null', D.stickerFigures(O({ calc: C({ d50wVol: -1 }) })), null);
    // Every stock row a different value, so a figure on the wrong row cannot pass. The worksheet is what the
    // compounder draws up, and the sample order has zeros on Na acetate, K₂HPO₄ and ZnSO₄.
    eq('every stock row holds its own figure', D.stickerFigures(O({ calc: C({ d50wVol: 31.1, soluvitVol: 2.2, peditrace_vol: 2.3, wfiVol: 90.2,
      solVol: { aa: 11.1, naCl: 1.2, naAcet: 1.3, glycophos: 1.4, kCl: 1.5, k2hpo4: 1.6, mg: 1.7, ca: 1.8, heparin: 1.9, znso4: 2.1 } }) })).stockMl,
      { d50w: '31.1', aminoven10: '11.1', amiparen10: '0', aminoplasmal15: '0', nacl20: '1.2', glycophos: '1.4', k2hpo4: '1.6', naAcetate: '1.3',
        kcl: '1.5', mgso4_10: '1.7', caGluconate: '1.8', soluvit: '2.2', peditrace: '2.3', heparin: '1.9', wfi: '90.2',
        znso4: '2.1', addamel: '0' });
    // The server refuses a figure longer than 12 characters, and a refusal stops the doctor's save.
    eq('a figure too long for the server → null', D.stickerFigures(O({ heparinUmL: 1e11 })), null);
    // A typed dose prints as typed (REFERENCE.md § The printed order), and the doctor's sheet shows 12.25%.
    eq('a typed dextrose % prints as typed', D.stickerFigures(O({ dexPct: 12.25 })).delivered.dextrosePct, '12.25');
    eq('…with no trailing zero', D.stickerFigures(O({ dexPct: 12.5 })).delivered.dextrosePct, '12.5');
    // The length and minus-sign checks are for figures. A tenth version in a day is 13 characters, and it must
    // not silently take the figures off every order.
    const later = { window: {}, console };
    vm.createContext(later);
    vm.runInContext(R('data.js').replace(/const CONSTANTS_VERSION = "[^"]+"/, 'const CONSTANTS_VERSION = "2026-11-02.10"'), later);
    const tenth = later.window.NEOFEED_DATA.stickerFigures(O());
    eq('a 13-character constants version still makes figures', tenth && tenth.constantsVersion, '2026-11-02.10');
    const ad = D.stickerFigures(O({ inclAddamel: true }));
    eq('Addamel ticked → no figure on either sticker', [ad.stockMl.addamel, ad.delivered.addamelMl], [null, null]);
    const nsv = D.stickerFigures(O({ calc: C({ soluvitVol: 0 }) }));
    eq('no Soluvit in the bag → 0 on both stickers', [nsv.stockMl.soluvit, nsv.delivered.soluvitMl], ['0', '0']);
    const npd = D.stickerFigures(O({ calc: C({ peditrace_vol: 0 }) }));
    eq('no Peditrace in the bag → 0 on both stickers', [npd.stockMl.peditrace, npd.delivered.peditraceMl], ['0', '0']);
    const w1625 = D.stickerFigures(O({ calc: C({ wtKg: 1.625 }) }));
    eq('1.625 kg: weight 1.63, vitamins from the raw weight, 1.6', [w1625.dosingWeightKg, w1625.delivered.soluvitMl, w1625.delivered.peditraceMl], ['1.63', '1.6', '1.6']);
    eq('an amino-acid volume of an unknown product → null', D.stickerFigures(O({ calc: C({ aaStockKey: 'smof20' }) })), null);
    eq('...but no amino-acid volume, no product to check', D.stickerFigures(O({ calc: C({ aaStockKey: 'smof20', solVol: Object.assign({}, C().solVol, { aa: 0 }) }) })) !== null, true);
    eq('a negative WFI → null', D.stickerFigures(O({ calc: C({ wfiVol: -3 }) })), null);
    eq('an undefined Ca dose would print a dash → null', D.stickerFigures(O({ caPerKg: undefined })), null);
    eq('an undefined DOL would print a dash → null', D.stickerFigures(O({ dol: undefined })), null);
    eq('a calc without solVol → null, no throw', tryFig(O({ calc: C({ solVol: undefined }) })), null);
    eq('chloride counts NaCl and KCl, 1 : 1', D.stickerFigures(O({ naCl: 3, kCl: 2 })).delivered.clMeq, '9');
    const crit = D.stickerFigures(O({ critOverride: { reason: 'synthetic reason', alerts: ['K⁺ above max'], at: '2026-11-16T03:00:00Z' } }));
    eq('a confirmed critical value is copied, without its time', crit.critical, { alerts: ['K⁺ above max'], reason: 'synthetic reason' });
    eq('an ISO timestamp is cut to the date', D.stickerFigures(O({ orderDate: '2026-11-16T00:00:00.000Z' })).orderDate, '2026-11-16');
    eq('not a date → no date', D.stickerFigures(O({ orderDate: 'not a date' })).orderDate, '');
    eq('a Date is read as the app reads it: the Bangkok day', D.stickerFigures(O({ orderDate: new Date('2026-11-16T18:00:00Z') })).orderDate, '2026-11-17');
  });

  // ── §2 helpers: the real <Calculator>, as verify-stock-ml-1027.cjs mounts it ──
  const container = document.getElementById('root');
  let root = ReactDOM.createRoot(container);
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  const fieldOf = (label) => [...container.querySelectorAll('.field')].find(d => d.querySelector('label')?.textContent.startsWith(label)) || null;
  const saltRow = (label) => [...container.querySelectorAll('.salt-row-grid')]
    .find(d => d.firstElementChild?.firstElementChild?.textContent.startsWith(label)) || null;
  const inputFor = (label) => fieldOf(label)?.querySelector('input') || saltRow(label)?.querySelector('input') || null;
  function setField(label, value) {
    const input = inputFor(label);
    if (!input) throw new Error('field not found: ' + label);
    act(() => { valueSetter.call(input, String(value)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
  }
  const click = (el) => act(() => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  const clickAsync = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  // A save, and the lock that follows it, are a chain of promises: give it a beat.
  const settle = async (el) => {
    await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
  };
  const submitBtn = () => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Submit') || null;
  const draftBtn = () => container.querySelector('button.save-draft');
  const routeBtn = (name) => [...container.querySelectorAll('.step2-ctrl .seg button')].find(b => b.textContent.trim() === name);
  const BASE = { dol: 10, editEntry: null, baselineEntry: null, previousEntry: null, logDate: '2026-11-16',
    userLabel: 'Dr Test (doc@kcmh.test)', onUpdate() { return Promise.resolve({ ok: true, lastModified: 'lm-u' }); },
    onSaved() {}, onWeightChange() {} };
  const logger = () => { const box = { entry: null, calls: 0 };
    box.onLog = (e) => { box.entry = e; box.calls++; return Promise.resolve({ ok: true, entryId: 'e-' + box.calls, lastModified: 'lm-' + box.calls }); };
    return box; };
  function mount(props) {
    act(() => { root.unmount(); });
    root = ReactDOM.createRoot(container);
    window.localStorage.clear();
    act(() => { root.render(React.createElement(window.Calculator, { ...BASE, ...props })); });
    act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
  }
  const PT1600 = { sessionId: 'NF-900016', name: 'SY', bw: 1600, currentBed: 'NICU 3', diagnosis: '-',
    weights: [{ dol: 1, w: 1600 }], admissionDate: '2026-11-07' };
  // 1.6 kg, 160 mL + 30 mL dead space = 190 mL, Factor 1.9. 20% NaCl 2 and
  // KCl 2.5 mEq/kg, MgSO₄ 4.861 mg/kg (0.4 mEq), heparin 1 U/mL (the default),
  // Soluvit and Peditrace ticked (the default). No Ca or P, so no Ca:P alert.
  function order1600(box) {
    mount({ patient: PT1600, onLog: box.onLog });
    click(routeBtn('Central'));
    setField('Current weight', 1600);
    ['Target fluid', 'Other IV', 'Drug volume', 'Input', 'Urine output', 'Drain content'].forEach(l => setField(l, l === 'Target fluid' ? 150 : 0));
    setField('Volume(mL/day)', 160); setField('ปริมาตรคาสาย (dead space)', 30);
    setField('Dextrose final', 10); setField('Amino acid', 2);
    setField('20% NaCl', 2); setField('KCl', 2.5); setField('MgSO₄', 4.861);
  }
  const BAG_FIELDS = ['Volume(mL/day)', 'Dextrose final', 'Amino acid', '20% NaCl', 'KCl', 'MgSO₄'];
  // The orders here are dated 2026-11-16, and the re-save notice shows only near the ward's today.
  D.todayLocal = () => '2026-11-16';
  // The "No TPN" tick (PR #206) clears the bag, and an order with no bag cannot be submitted until it is
  // ticked (CR-NO-TPN-TICK). 160 mL of feeds is 100 mL/kg/d, past the 80 the tick asks for, so no reason is asked.
  const tickNoTpn = () => {
    setField('Volume(mL/feed)', 20); setField('Frequency', 8);
    const tick = container.querySelector('label.no-tpn-chk input[type=checkbox]');
    if (!tick) throw new Error('no "No TPN" tick');
    act(() => { tick.click(); });
  };
  const WANT_STOCK = { d50w: '38', aminoven10: '38', amiparen10: '0', aminoplasmal15: '0', nacl20: '1.1', glycophos: '0',
    k2hpo4: '0', naAcetate: '0', kcl: '2.4', mgso4_10: '0.9', caGluconate: '0', soluvit: '1.9', peditrace: '1.9',
    heparin: '1.9', wfi: '103.9', znso4: '0', addamel: '0' };
  let SAVED = null;   // the entry §2 sends, reopened in §2a and §2c
  const SENT = {};    // what §2b, §2b2 and §2a send, for the real server in §2d
  const haveSaved = () => { ok('§2 saved an order to reopen', !!SAVED); return !!SAVED; };

  await section('§2 Submit saves printJson from the calc it saved', async () => {
    const box = logger();
    order1600(box);
    await clickAsync(submitBtn());
    eq('the order is logged once', box.calls, 1);
    SAVED = box.entry;
    const pj = box.entry && box.entry.printJson;
    ok('entry.printJson is there', !!pj, box.entry && Object.keys(box.entry));
    if (!pj) return;
    eq('date, dol, weight, factor, volumes', [pj.orderDate, pj.dol, pj.dosingWeightKg, pj.factor, pj.deliveredMl, pj.deadMl, pj.preparedMl],
      ['2026-11-16', '10', '1.6', '1.9', '160', '30', '190']);
    eq('worksheet rows', pj.stockMl, WANT_STOCK);
    eq('PN label: Na K Mg Cl', [pj.delivered.naMeq, pj.delivered.kMeq, pj.delivered.mgMg, pj.delivered.clMeq], ['3.2', '4', '7.8', '7.2']);
    eq('PN label: dextrose, AA, vitamins, heparin, kcal',
      [pj.delivered.dextroseG, pj.delivered.aminoAcidPct, pj.delivered.aminoAcidG.aminoven10, pj.delivered.soluvitMl, pj.delivered.heparinUnits, pj.delivered.kcal],
      ['16', '2', '3.2', '1.6', '160', '67']);
    const osmOnScreen = (container.textContent.match(/Osm (\d+) mOsm\/L/) || [])[1];
    eq('osmolarity is the figure the doctor saw', pj.delivered.osmolarity, osmOnScreen);
    eq('no critical value', pj.critical, null);
    eq('the doctor’s order (calcInput) carries no copy of it', 'printJson' in box.entry.calcInput, false);
    // Addendum D: what the backend will check. The figures agree with the
    // request they came in with; a failure here means the calculator passed
    // stickerFigures the wrong weight or date.
    eq('printJson.constantsVersion is the entry’s', pj.constantsVersion, box.entry.constantsVersion);
    eq('printJson.dol is the entry’s dol', pj.dol, String(box.entry.dol));
    eq('printJson.dosingWeightKg is calcInput.tpnWtG in kg', pj.dosingWeightKg, D.displayNum(box.entry.calcInput.tpnWtG / 1000, 2));
    eq('printJson.orderDate is the ward date of entry.ts', pj.orderDate, D.normalizeDateStr(box.entry.ts));
    // Addendum B: the marker the ward sync can see (it does not read Daily_Log AM).
    eq('calcInput.printJsonV is the figures’ version', box.entry.calcInput.printJsonV, pj.v);
  });

  await section('§2b Save draft saves printJson too', async () => {
    const box = logger();
    order1600(box);
    await clickAsync(draftBtn());
    eq('the draft is logged', box.calls, 1);
    eq('…with the same worksheet rows', box.entry && box.entry.printJson && box.entry.printJson.stockMl, WANT_STOCK);
    eq('…and the marker', box.entry && box.entry.calcInput.printJsonV, 1);
    SENT.draft = box.entry;
  });

  await section('§2b2 a No TPN order saves printJson null and no marker', async () => {
    const box = logger();
    order1600(box);
    tickNoTpn();
    await clickAsync(submitBtn());
    eq('the order is logged', box.calls, 1);
    eq('printJson is there as a key, and null', box.entry && [('printJson' in box.entry), box.entry.printJson], [true, null]);
    eq('…and calcInput carries no marker', box.entry && 'printJsonV' in box.entry.calcInput, false);
    eq('…and says No TPN, with no volume', box.entry && [box.entry.calcInput.noTpn, box.entry.calcInput.totalTPN_mL], [true, 0]);
    SENT.noBag = box.entry;
  });

  const rec = (over = {}) => {
    const calls = [];
    return { calls,
      onLog(e) { calls.push(['log', e]); return Promise.resolve({ ok: true, entryId: 'e-new', lastModified: 'lm-new' }); },
      onUpdate(id, lm, e) { calls.push(['update', id, lm, e]); return Promise.resolve(over.update || { ok: true, lastModified: 'lm-u' }); },
      onPublish(id, lm) { calls.push(['publish', id, lm]); return Promise.resolve({ ok: true, publishedAt: '2026-11-16T03:00:00Z' }); } };
  };
  const shape = (calls) => calls.map(c => c[0] === 'log' ? ['log'] : c[0] === 'update' ? ['update', c[1], c[2]] : ['publish', c[1], c[2]]);
  // The order §2 saved, as the server hands it back: locked unless `published` says not.
  const reopen = (over = {}) => ({ ...SAVED, entryId: 'e1', lastModified: 'lm1', ts: '2026-11-16',
    published: '2026-11-16T03:00:00Z', publishedBy: 'doc@kcmh.test', revisionNumber: 1, ...over });
  // The same order as saved before this release: no figures, no marker.
  const unfigured = (over = {}) => {
    const ci = { ...SAVED.calcInput }; delete ci.printJsonV;
    const e = reopen({ calcInput: ci, ...over }); delete e.printJson;
    return e;
  };
  const NOTICE = 'ยังไม่มีตัวเลขสติกเกอร์ — กด Submit อีกครั้ง';
  const noticeShown = () => container.textContent.includes(NOTICE);
  const printForm = () => __printFormTicked(container);
  const UNSAVED = 'มีการแก้ไขที่ยังไม่ได้บันทึก';
  const upd = (r) => (r.calls.find(c => c[0] === 'update') || [])[3];

  // ── §2a an edited order is dated by the date the sheet prints (addendum A) ──
  // PrintOrderForm prints วันที่ให้ TPN from D.normalizeDateStr(ts), and the
  // Calculator keys the order on the same (orderDateKey). The sticker carries
  // that date. D.normalizeDateStr keeps the first ten characters of a string,
  // as the backend's _fmtDate does, so a UTC-midnight ISO string reads as the
  // 15th everywhere. The app never hands the Calculator a Date (it throws).
  await section('§2a an edited order is dated by the date the sheet prints', async () => {
    if (!haveSaved()) return;
    const asString = rec();
    mount({ patient: PT1600, editEntry: reopen({ ts: '2026-11-15T17:00:00.000Z', published: '' }), ...asString });
    setField('Amino acid', 2.1);
    await settle(submitBtn());
    eq('an ISO string ts is dated as the sheet dates it',
      upd(asString) && upd(asString).printJson && upd(asString).printJson.orderDate, D.normalizeDateStr('2026-11-15T17:00:00.000Z'));
    const plain = rec();
    mount({ patient: PT1600, editEntry: reopen({ published: '' }), ...plain });
    setField('Amino acid', 2.1);
    await settle(submitBtn());
    eq('an edit of a 16 Nov order saves figures dated 16 Nov', upd(plain) && upd(plain).printJson && upd(plain).printJson.orderDate, '2026-11-16');
    SENT.edited = upd(plain);
    eq('…and the figures of the edited calc: amino acid 2.1 %',
      upd(plain) && upd(plain).printJson && upd(plain).printJson.delivered.aminoAcidPct, '2.1');
    eq('…which agree with the entry’s own ts',
      upd(plain) && upd(plain).printJson && upd(plain).printJson.orderDate, D.normalizeDateStr(upd(plain).ts));
  });

  // ── §2c an order saved without figures can be saved again (addendum C) ──
  await section('§2c1 an order with the marker is not edited by it, and is offered no new save', async () => {
    if (!haveSaved()) return;
    const locked = rec();
    mount({ patient: PT1600, editEntry: reopen(), ...locked });
    ok('a locked order with the marker prints: the form is saved and unchanged', !!printForm());
    ok('…and nothing reads as unsaved', !container.textContent.includes(UNSAVED));
    eq('…Submit stays disabled, as before', submitBtn() && submitBtn().disabled, true);
    ok('…no notice', !noticeShown());
    const unlocked = rec();
    mount({ patient: PT1600, editEntry: reopen({ published: '' }), ...unlocked });
    ok('an unlocked order with the marker prints too', !!printForm());
    eq('…Submit is enabled', submitBtn() && submitBtn().disabled, false);
    await settle(submitBtn());
    eq('…and only locks it: no revision of identical numbers', shape(unlocked.calls), [['publish', 'e1', 'lm1']]);
  });

  await section('§2c2 a locked order saved without figures: the notice, and Submit saves it again', async () => {
    if (!haveSaved()) return;
    const r = rec({ update: { ok: true, revised: true, entryId: 'e2', lastModified: 'lm2', revisionNumber: 2 } });
    mount({ patient: PT1600, editEntry: unfigured(), ...r });
    ok('the form is saved and unchanged', !!printForm() && !container.textContent.includes(UNSAVED));
    ok('the notice is shown', noticeShown());
    eq('…once', container.textContent.split(NOTICE).length - 1, 1);
    eq('Submit is enabled', submitBtn() && submitBtn().disabled, false);
    await settle(submitBtn());
    eq('Submit saves in full: the update goes to the server, then the new revision is locked',
      shape(r.calls), [['update', 'e1', 'lm1'], ['publish', 'e2', 'lm2']]);
    const sent = upd(r);
    ok('…carrying printJson', !!(sent && sent.printJson && sent.printJson.v === 1), sent && Object.keys(sent));
    eq('…and the marker in calcInput', sent && sent.calcInput.printJsonV, 1);
    eq('…with the rows of the order', sent && sent.printJson && sent.printJson.stockMl, WANT_STOCK);
    ok('after the save the notice is gone', !noticeShown());
    eq('…and, locked and unchanged again, Submit is disabled', submitBtn() && submitBtn().disabled, true);
  });

  await section('§2c2b Print is not held for missing figures', async () => {
    if (!haveSaved()) return;
    mount({ patient: PT1600, editEntry: unfigured(), ...rec() });
    ok('the order form is on the page: the doctor’s sheet uses no sticker figure', !!printForm());
  });

  await section('§2c3 an unlocked submitted order saved without figures: Submit saves, it does not only lock', async () => {
    if (!haveSaved()) return;
    const r = rec({ update: { ok: true, revised: true, entryId: 'e2', lastModified: 'lm2', revisionNumber: 2 } });
    mount({ patient: PT1600, editEntry: unfigured({ published: '' }), ...r });
    ok('the notice is shown', noticeShown());
    await settle(submitBtn());
    eq('a full save, then the lock of what it saved', shape(r.calls), [['update', 'e1', 'lm1'], ['publish', 'e2', 'lm2']]);
    ok('…which carries the figures', !!(upd(r) && upd(r).printJson), upd(r) && Object.keys(upd(r)));
    ok('…and the notice is gone', !noticeShown());
  });

  await section('§2c4 a draft is not offered a new save for missing figures', async () => {
    if (!haveSaved()) return;
    mount({ patient: PT1600, editEntry: unfigured({ status: 'draft', published: '' }), ...rec() });
    ok('a saved draft without the marker: no notice', !noticeShown());
    // …and one just saved from this form carries its marker, so it needs none.
    const box = logger();
    order1600(box);
    await settle(draftBtn());
    ok('a draft saved just now: no notice either', !noticeShown());
  });

  await section('§2c5 a No TPN order has no figures to miss', async () => {
    const box = logger();
    order1600(box);
    tickNoTpn();
    await clickAsync(submitBtn());
    const noBag = box.entry;
    ok('a bag-less order was saved', !!noBag && noBag.printJson === null, noBag && noBag.printJson);
    if (!noBag) return;
    const asSaved = (over) => ({ ...noBag, entryId: 'e1', lastModified: 'lm1', ts: '2026-11-16', revisionNumber: 1, ...over });
    const locked = rec();
    mount({ patient: PT1600, editEntry: asSaved({ published: '2026-11-16T03:00:00Z' }), ...locked });
    ok('a locked No TPN order: no notice', !noticeShown());
    const unlocked = rec();
    mount({ patient: PT1600, editEntry: asSaved({ published: '' }), ...unlocked });
    ok('an unlocked No TPN order: no notice', !noticeShown());
    await settle(submitBtn());
    // Since #210 nothing is left to submit on it, so a press only locks and writes no figures and no marker.
    eq('…and pressing Submit only locks it', shape(unlocked.calls), [['publish', 'e1', 'lm1']]);
  });

  // Only an order saved before the release can lack figures, and a bag from an earlier day has already been given.
  // A press there would only supersede the signed row, so the order behaves as it did before this.
  await section('§2c8 the notice shows only for today\'s and tomorrow\'s order', async () => {
    if (!haveSaved()) return;
    const dated = (days) => D.addDaysToDateStr('2026-11-16', days);
    for (const [label, days, shows] of [['yesterday', -1, false], ['7 days back', -7, false], ['tomorrow', 1, true], ['2 days ahead', 2, false], ['today', 0, true]]) {
      const r = rec();
      mount({ patient: PT1600, editEntry: unfigured({ ts: dated(days) }), ...r });
      eq(`${label}: the notice ${shows ? 'shows' : 'does not show'}`, noticeShown(), shows);
      eq(`…and Submit is ${shows ? 'open' : 'disabled, as for any locked order'}`, submitBtn() && submitBtn().disabled, !shows);
    }
    const old = rec();
    mount({ patient: PT1600, editEntry: unfigured({ ts: dated(-30), published: '' }), ...old });
    await settle(submitBtn());
    eq('an unlocked order a month old: Submit only locks it', shape(old.calls), [['publish', 'e1', 'lm1']]);
  });

  // A No TPN order that prints a short sheet for an oral order is a saved order with nothing to re-save.
  await section('§2c6 a No TPN order with an oral order: no notice, and Submit as for any saved order', async () => {
    const box = logger();
    order1600(box);
    tickNoTpn();
    setField('Vitamin D', 400);
    await clickAsync(submitBtn());
    const saved = box.entry;
    ok('it was saved, with no figures', !!saved && saved.printJson === null, saved && saved.printJson);
    if (!saved) return;
    const asSaved = (over) => ({ ...saved, entryId: 'e1', lastModified: 'lm1', ts: '2026-11-16', revisionNumber: 1, ...over });
    const locked = rec();
    mount({ patient: PT1600, editEntry: asSaved({ published: '2026-11-16T03:00:00Z' }), ...locked });
    ok('locked: no notice', !noticeShown());
    eq('…Submit is disabled', submitBtn() && submitBtn().disabled, true);
    const unlocked = rec();
    mount({ patient: PT1600, editEntry: asSaved({ published: '' }), ...unlocked });
    ok('unlocked: no notice', !noticeShown());
    await settle(submitBtn());
    eq('…Submit only locks it', shape(unlocked.calls), [['publish', 'e1', 'lm1']]);
  });

  // Lipid with no aqueous bag: the one order with no bag that needs no tick, since it is not No TPN. It has no
  // figures, because the unit does not compound lipid.
  await section('§2c7 a lipid-only order has no figures and no notice', async () => {
    const box = logger();
    order1600(box);
    BAG_FIELDS.forEach(l => setField(l, 0));
    setField('20% lipid', 2);
    await clickAsync(submitBtn());
    const saved = box.entry;
    eq('it is saved with no figures and no marker', saved && [saved.printJson, 'printJsonV' in saved.calcInput], [null, false]);
    if (!saved) return;
    mount({ patient: PT1600, editEntry: { ...saved, entryId: 'e1', lastModified: 'lm1', ts: '2026-11-16', revisionNumber: 1, published: '2026-11-16T03:00:00Z' }, ...rec() });
    ok('reopened: no notice', !noticeShown());
  });

  // ── §2d the real server takes what the real Calculator sends ──
  // gas-backend.gs refuses a printJson off the schema, or off the request it
  // came with, and that refusal stops the doctor's save. So the entries above go
  // through it as the app sends them, on a clock set to the orders' day.
  await section('§2d what the real Calculator sends passes the real server', async () => {
    if (!haveSaved()) return;
    // A confirmed critical value, with a reason longer than the form keeps.
    const critBox = logger();
    order1600(critBox);
    setField('KCl', 6);
    window.prompt = () => 'เหตุผลทดสอบ '.repeat(40);
    await clickAsync(submitBtn());
    window.prompt = () => null;
    const crit = critBox.entry;
    ok('a confirmed critical order was saved, carrying its alert and reason',
      !!(crit && crit.printJson && crit.printJson.critical && crit.printJson.critical.alerts.length && crit.printJson.critical.reason),
      crit && crit.printJson && crit.printJson.critical);
    // 1625 g: the sticker prints 1.63, which is 0.005 off the weight the row carries.
    const wtBox = logger();
    order1600(wtBox);
    setField('Current weight', 1625);
    await clickAsync(submitBtn());
    const w1625 = wtBox.entry;
    eq('a 1625 g order: 1625 g on the row, 1.63 on the sticker',
      w1625 && [w1625.calcInput.tpnWtG, w1625.printJson && w1625.printJson.dosingWeightKg], [1625, '1.63']);

    // A submitted order with a bag, reopened and ticked No TPN the same day: a revision that cancels the bag.
    const cancelBox = rec();
    mount({ patient: PT1600, editEntry: reopen({ published: '' }), ...cancelBox });
    tickNoTpn();
    await settle(submitBtn());
    const cancel = upd(cancelBox);
    eq('a same-day No TPN revision has no figures, and says what it replaced',
      cancel && [cancel.printJson, cancel.calcInput.noTpn, cancel.calcInput.replacesTpn], [null, true, true]);

    const { boot, withNow } = require('./gas-vm-sandbox.cjs');
    withNow(Date.parse('2026-11-16T05:00:00Z'), () => {
      const g = boot();
      g.addStaff('doc@kcmh.test', 'doctor', 'Doctor-Password-1', { name: 'Dr Test' });
      const token = g.session('doc@kcmh.test', 'doctor');
      const as = (body) => g.post(Object.assign({ token }, body));
      const register = (sessionId, i) => as({ action: 'registerPatient', isNew: true, confirmDuplicate: true, patient: { sessionId,
        name: 'ทารกทดสอบ ' + i, initials: 'ทท', bw: 1600 + i, ga: 32.1, sex: 'boys', dob: '2026-11-07', admissionDate: '2026-11-07', twinSuffix: '',
        status: 'Active', currentBed: 'NICU ' + i, diagnosis: 'RDS', weights: [{ dol: 1, w: 1600 }], lengths: [], hcs: [], bedHistory: [],
        statusDate: '', multiplesCount: 0 } });
      const wire = (e) => JSON.parse(JSON.stringify(e));   // what the POST carries
      const log = g.sheet('Daily_Log').data;
      const am = (row) => log[row][38];
      const create = (label, sid, i, entry) => {
        register(sid, i);
        const r = entry ? as({ action: 'logDailyNutrition', sessionId: sid, entry: wire(entry) }) : {};
        ok(`${label} → saved`, !!r.entryId, r);
        return { row: log.length - 1, sid };
      };
      const edit = (at, entry) => as({ action: 'updateDailyNutrition', sessionId: at.sid, entryId: log[at.row][25],
        expectedLastModified: log[at.row][26], entry: wire(entry) });

      const sub = create('a submitted order', 'NF-900101', 1, SAVED);
      eq('…with AM the figures as the Calculator made them', JSON.parse(am(sub.row)), wire(SAVED.printJson));
      const rev = edit(sub, SENT.edited);
      ok('its edit, dated by the row → saved as a revision', rev.revised === true, rev);
      eq('…with AM the edited figures', JSON.parse(am(log.length - 1)), wire(SENT.edited.printJson));
      const draft = create('a draft', 'NF-900102', 2, SENT.draft);
      const inPlace = edit(draft, SENT.edited);
      ok('its edit → saved in place', inPlace.ok === true && !inPlace.revised, inPlace);
      eq('…with AM the edited figures', JSON.parse(am(draft.row)), wire(SENT.edited.printJson));
      const none = create('a No TPN order (printJson null)', 'NF-900103', 3, SENT.noBag);
      eq('…with AM blank', am(none.row), '');
      const noneRev = edit(none, SENT.noBag);
      ok('its edit → saved as a revision', noneRev.revised === true, noneRev);
      eq('…with AM blank', am(log.length - 1), '');
      const cancelled = create('a submitted order with a bag', 'NF-900106', 6, SAVED);
      const cancelRev = edit(cancelled, cancel);
      ok('its same-day No TPN revision → saved', cancelRev.revised === true, cancelRev);
      eq('…the old row keeps its sticker, the revision has none', [JSON.parse(am(cancelled.row)).v, am(log.length - 1)], [1, '']);
      const c = create('a confirmed critical order', 'NF-900104', 4, crit);
      eq('…with AM carrying the alert and the reason as the form kept it', JSON.parse(am(c.row)).critical, wire(crit.printJson.critical));
      const w = create('a 1625 g order', 'NF-900105', 5, w1625);
      eq('…with AM the 1.63 the sticker prints', JSON.parse(am(w.row)).dosingWeightKg, '1.63');
    });
  });

  console.log(`\n${fail === 0 ? 'STICKER FIGURES 1030: ALL PASS' : `STICKER FIGURES 1030: ${fail} FAILED`} (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
})();
