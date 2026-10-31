// verify-sticker-figures-1030.cjs — the TPN room's sticker figures
// (openspec/changes/tpn-room-stickers; Pp, 2026-10-30).
//
//   §1  stickerFigures(): the sample's rows and units, at most the sample's
//       decimals, no trailing zero; null rules; the critical copy;
//   §2  the real <Calculator> sends them as entry.printJson on Submit and on
//       Save draft, from the same calc the doctor saved, and marks the order
//       (calcInput.printJsonV) so the ward sync can tell it has figures;
//   §2c an order saved before this release, without figures, can be saved
//       again: a notice, Submit enabled, a full save instead of only a lock.
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
  znTotal_mg: 0.45, osm: 1012.6, dexKcal: 85, aaKcal: 21.6,
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
    eq('no figure is a dash', strings(f).filter(s => s === '—'), []);
    ok('fits a Sheets cell with room to spare (< 8,000 characters)', JSON.stringify(f).length < 8000, JSON.stringify(f).length);
  });

  await section('§1b the rules around it', async () => {
    eq('no TPN volume → null', D.stickerFigures(O({ calc: C({ totalTPN_mL: 0 }) })), null);
    eq('no weight in the calc → null', D.stickerFigures(O({ calc: C({ wtKg: 0 }) })), null);
    const ap = D.stickerFigures(O({ calc: C({ aaStockKey: 'aminoplasmal15' }) }));
    eq('Aminoplasmal: its rows, not Aminoven', [ap.stockMl.aminoven10, ap.stockMl.aminoplasmal15, ap.delivered.aminoAcidG.aminoplasmal15], ['0', '62.1', '5.4']);
    eq('Na acetate 1 mEq/kg → acetate 1.8 mEq, 1 : 1', D.stickerFigures(O({ naAcet: 1 })).delivered.acetateMeq, '1.8');
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
  const WANT_STOCK = { d50w: '38', aminoven10: '38', amiparen10: '0', aminoplasmal15: '0', nacl20: '1.1', glycophos: '0',
    k2hpo4: '0', naAcetate: '0', kcl: '2.4', mgso4_10: '0.9', caGluconate: '0', soluvit: '1.9', peditrace: '1.9',
    heparin: '1.9', wfi: '103.9', aminoleban8: '0', nephrosteril7: '0', znso4: '0', mgso4_50: '0', addamel: '0' };
  let SAVED = null;   // the entry §2 sends, reopened in §2a and §2c
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
  });

  await section('§2b2 an order with no bag saves printJson null and no marker', async () => {
    const box = logger();
    order1600(box);
    BAG_FIELDS.forEach(l => setField(l, 0));
    await clickAsync(submitBtn());
    eq('the order is logged', box.calls, 1);
    eq('printJson is there as a key, and null', box.entry && [('printJson' in box.entry), box.entry.printJson], [true, null]);
    eq('…and calcInput carries no marker', box.entry && 'printJsonV' in box.entry.calcInput, false);
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
  const printForm = () => container.querySelector('#print-form');
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

  await section('§2c5 an order with no TPN bag has no figures to miss', async () => {
    const box = logger();
    order1600(box);
    BAG_FIELDS.forEach(l => setField(l, 0));
    await clickAsync(submitBtn());
    const noBag = box.entry;
    ok('a bag-less order was saved', !!noBag && noBag.printJson === null, noBag && noBag.printJson);
    if (!noBag) return;
    const asSaved = (over) => ({ ...noBag, entryId: 'e1', lastModified: 'lm1', ts: '2026-11-16', revisionNumber: 1, ...over });
    const locked = rec();
    mount({ patient: PT1600, editEntry: asSaved({ published: '2026-11-16T03:00:00Z' }), ...locked });
    ok('a locked order with no bag: no notice', !noticeShown());
    eq('…Submit stays disabled, as before', submitBtn() && submitBtn().disabled, true);
    const unlocked = rec();
    mount({ patient: PT1600, editEntry: asSaved({ published: '' }), ...unlocked });
    ok('an unlocked order with no bag: no notice', !noticeShown());
    await settle(submitBtn());
    eq('…Submit only locks it, as before', shape(unlocked.calls), [['publish', 'e1', 'lm1']]);
  });

  console.log(`\n${fail === 0 ? 'STICKER FIGURES 1030: ALL PASS' : `STICKER FIGURES 1030: ${fail} FAILED`} (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
})();
