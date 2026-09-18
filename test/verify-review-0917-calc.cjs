// verify-review-0917-calc.cjs — the 2026-09-17 review of the TPN calculator and
// the printed pharmacy order (findings UP-C1…C13, SEC-F7). Drafts, save
// conflicts and the midnight rollover are in verify-review-0917-drafts.cjs.
//
// A wrong printed dose is the one failure this product cannot take back, so
// most of what is pinned here is WHEN the order may reach the form:
//   §1-§5  UP-C4  hard limits (lipid 4.5, K 3.5, NPE:AA 20–32) on the IV portion
//                 only (Praew, 2026-09-17) — full feeds no longer raise them —
//                 and the F1 invariant: no critical tile without a critical alert
//   §6     UP-C1  every printed figure is unchanged (Praew: no change to r1 yet)
//   §7     UP-C3  ingredients with TPN volume 0 block Save and Print
//   §8     UP-C5  yesterday's Intake / Output never counts as today's
//   §9     UP-C2  a birth-weight edit that re-doses a saved order blocks Print
//   §10    UP-C6  a critical alert the saved reason doesn't name blocks Print
//   §11    UP-C9  a tmp_ (not yet confirmed) row cannot be opened or printed
//   §12    UP-C12 central osmolarity tile range = the 1800 threshold
//   §13    UP-C13 no float noise in Volume / changes list; heparin hint units
//   §14    SEC-F7 the NeoFeed reason prompt warns against names and HNs
//
// Mounts the real <Calculator> and <DailyLog> in jsdom (same dev-only deps as
// verify-review-0911.cjs — see test/README.md). Fails against 42ce553.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const crypto = require('crypto');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';
const R = (f) => fs.readFileSync(DIR + f, 'utf8');

let pass = 0, fail = 0, n = 0;
function eq(name, got, want) {
  const yes = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${yes ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(70)}${yes ? '' : ` got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
  yes ? pass++ : fail++;
}
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(70)}${cond ? '' : '  ' + JSON.stringify(detail ?? '')}`);
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
const toasts = [];
global.showToast = (msg, type) => toasts.push({ msg, type });
let printed = 0;
window.print = () => { printed++; };
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
vm.runInThisContext(R('data.js'));
const D = window.NEOFEED_DATA;
for (const f of ['icons.jsx', 'calculator.jsx', 'log.jsx']) {
  vm.runInThisContext(babel.transformSync(R(f), {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    filename: f, configFile: false, babelrc: false,
  }).code);
}

const container = document.getElementById('root');
let root = ReactDOM.createRoot(container);
const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
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
  act(() => { valueSetter.call(input, String(value)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
function selectFeed(key) {
  const sel = [...container.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'BM_20'));
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  act(() => { setter.call(sel, key); sel.dispatchEvent(new window.Event('change', { bubbles: true })); });
}
const click = (el) => act(() => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const clickAsync = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const buttonText = (re) => [...container.querySelectorAll('button')].find(b => re.test(b.textContent));
const saveBtn = () => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'บันทึก' || /กำลังบันทึก/.test(b.textContent));
const fillRequired = (tf) => ['Target fluid', 'Other IV', 'Drug volume', 'Input', 'Urine output', 'Drain content']
  .forEach(l => setField(l, l === 'Target fluid' ? tf : 0));
const alertRows = () => [...container.querySelectorAll('.calc-bottom .alert-row')].map(a => ({
  level: ['crit', 'warn', 'info'].find(c => a.classList.contains(c)),
  title: a.querySelector('.title')?.textContent || '', text: a.textContent.replace(/\s+/g, ' ') }));
const critAlerts = () => alertRows().filter(a => a.level === 'crit');
const critTitles = () => critAlerts().map(a => a.title);
const alertText = (title) => (alertRows().find(a => a.title === title) || {}).text || '';
const tileStatus = (label) => {
  const m = [...container.querySelectorAll('.metric')].find(x => x.querySelector('.lbl')?.textContent === label);
  return m ? (m.className.match(/s-(\w+)/) || [])[1] : null;
};
const tileRange = (label) => [...container.querySelectorAll('.metric')]
  .find(x => x.querySelector('.lbl')?.textContent === label)?.querySelector('.range')?.textContent;
const printForm = () => container.querySelector('#print-form');
const printText = () => (printForm()?.textContent || '').replace(/\s+/g, ' ');
const missingText = () => [...container.querySelectorAll('div')].map(d => d.textContent).filter(t => /^ยังกรอกไม่ครบ/.test(t)).pop() || '';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function tryPrint() {
  printed = 0; const t0 = toasts.length;
  act(() => { document.dispatchEvent(new window.CustomEvent('__neofeed_print')); });
  await act(async () => { await sleep(10); });
  return { printed, toasts: toasts.slice(t0).map(t => t.msg) };
}
// F1 (2026-09-11): a tile shown critical must be a critical line in the panel.
function f1(name) {
  const tiles = [...container.querySelectorAll('.metric.s-crit')].map(m => m.querySelector('.lbl')?.textContent);
  ok(`F1 · ${name}: no critical tile without a critical alert`, tiles.length === 0 || critAlerts().length > 0,
    { critTiles: tiles, critAlerts: critTitles() });
}

const BASE = { dol: 10, editEntry: null, baselineEntry: null, previousEntry: null, logDate: '2026-09-15',
  userLabel: 'Dr Test (doc@kcmh.test)', onUpdate() { return Promise.resolve({ ok: true, lastModified: 'lm-u' }); },
  onSaved() {}, onWeightChange() {} };
function render(props) {
  act(() => { root.render(React.createElement(window.Calculator, { ...BASE, ...props })); });
}
function mount(props) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear();
  render(props);
  act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
}
function logger() {
  const box = { entry: null, calls: 0 };
  box.onLog = (e) => { box.entry = e; box.calls++; return Promise.resolve({ ok: true, entryId: 'e-' + box.calls, lastModified: 'lm-' + box.calls }); };
  return box;
}
async function save(reason) {
  window.prompt = () => reason;
  await clickAsync(saveBtn());
}
const pt = (sid, bw, extra) => ({ sessionId: sid, name: sid.slice(0, 2), bw, currentBed: 'NICU 5', diagnosis: '-',
  weights: [{ dol: 1, w: bw }], admissionDate: '2026-09-05', ...extra });

(async () => {
  // ═══════════════════════ UP-C4 · hard limits on the IV portion ════════════
  await section('§1 UP-C4 · full enteral feeds raise no hard-limit alert (reviewer S2)', async () => {
    for (const [feed, vol, freq] of [['BM_HMF_24', 25, 8], ['FBM_PF_24', 30, 8], ['BM_20', 30, 8]]) {
      const log = logger();
      mount({ patient: pt('EN-1300', 1300), dol: 28, onLog: log.onLog });
      setField('Current weight', 1500); fillRequired(160);
      selectFeed(feed); setField('Volume(mL/feed)', vol); setField('Frequency', freq);
      eq(`${feed} ${vol}×${freq}: no critical alert`, critTitles(), []);
      ok(`${feed}: Lipid (total) tile is not critical`, !['crit', null].includes(tileStatus('Lipid (total)')), tileStatus('Lipid (total)'));
      ok(`${feed}: Potassium tile is not critical`, !['crit', null].includes(tileStatus('Potassium')), tileStatus('Potassium'));
      ok(`${feed}: NPC : Protein tile is not critical`, !['crit', null].includes(tileStatus('NPC : Protein')), tileStatus('NPC : Protein'));
      f1(feed);
      await save(null);
      ok(`${feed}: saves with no reason prompt`, log.calls === 1, toasts.slice(-1));
    }
  });

  await section('§2 UP-C4 · an IV breach is still a critical stop (lipid 4.8, K 4, pure PN)', async () => {
    const log = logger();
    mount({ patient: pt('IV-1000', 1000), onLog: log.onLog });
    setField('Current weight', 1000); fillRequired(160);
    setField('Volume(mL/day)', 110); setField('Dextrose final', 12.5); setField('Amino acid', 3.5); setField('SMOF Lipid', 4.8);
    setField('KCl', 4); setField('10% Ca gluconate', 80); setField('Glycophos', 3);
    ok('lipid 4.8 raises "Lipid critically out of range"', critTitles().includes('Lipid critically out of range'), critTitles());
    ok('…showing the IV value against the limit', /Lipid IV 4\.8 g\/kg\/d > 4\.5 g\/kg\/d hard limit/.test(alertText('Lipid critically out of range')), alertText('Lipid critically out of range'));
    ok('K 4 raises "Potassium critically out of range"', critTitles().includes('Potassium critically out of range'), critTitles());
    ok('…showing the IV value against the limit', /K IV 4 mEq\/kg\/d > 3\.5 mEq\/kg\/d hard limit/.test(alertText('Potassium critically out of range')), alertText('Potassium critically out of range'));
    ok('pure PN: no "total incl. EN" (IV and total are the same)', !/total incl\. EN/.test(alertText('Lipid critically out of range') + alertText('Potassium critically out of range')));
    eq('one line per nutrient (no extra Lipid/Potassium "off target")', alertRows().filter(a => /^(Lipid|Potassium)/.test(a.title)).length, 2);
    ok('the TOTAL tiles are not critical', ['ok', 'warn'].includes(tileStatus('Lipid (total)')) && ['ok', 'warn'].includes(tileStatus('Potassium')),
      [tileStatus('Lipid (total)'), tileStatus('Potassium')]);
    f1('IV lipid 4.8 / K 4');
    await save(null);
    eq('Save without a reason is refused', log.calls, 0);
    await save('attending aware — synthetic');
    eq('with a reason it saves', log.calls, 1);
    ok('the override names both IV alerts', !!log.entry && ['Lipid critically out of range', 'Potassium critically out of range']
      .every(t => log.entry.calcInput.critOverride.alerts.includes(t)), log.entry && log.entry.calcInput.critOverride);
    ok('…and the saved order prints with it', /สั่งทั้งที่มีค่าวิกฤต/.test(printText()));
  });

  await section('§3 UP-C4 · IV lipid 4.8 with feeds on top: the alert shows both figures', async () => {
    mount({ patient: pt('IV-1000', 1000), onLog: logger().onLog });
    setField('Current weight', 1000); fillRequired(160);
    setField('Volume(mL/day)', 110); setField('Dextrose final', 12.5); setField('Amino acid', 3.5); setField('SMOF Lipid', 4.8);
    selectFeed('BM_20'); setField('Volume(mL/feed)', 10); setField('Frequency', 8);
    ok('still critical on the IV 4.8', /Lipid IV 4\.8 g\/kg\/d > 4\.5/.test(alertText('Lipid critically out of range')), alertText('Lipid critically out of range'));
    ok('…with the TPN + EN total alongside', /total incl\. EN \d+(\.\d)? g\/kg\/d/.test(alertText('Lipid critically out of range')), alertText('Lipid critically out of range'));
    f1('IV lipid 4.8 + EN');
  });

  await section('§4 UP-C4 · NPE:AA is judged on the bag (decision, not the total)', async () => {
    // Total NPE:AA 24 (in range) but the bag alone is 17 kcal/g AA.
    mount({ patient: pt('NP-1000', 1000), onLog: logger().onLog });
    setField('Current weight', 1000); fillRequired(150);
    selectFeed('BM_20'); setField('Volume(mL/feed)', 8); setField('Frequency', 8);
    setField('Volume(mL/day)', 80); setField('Dextrose final', 12.5); setField('Amino acid', 3); setField('SMOF Lipid', 2);
    eq('the NPC : Protein TOTAL tile is in range', tileStatus('NPC : Protein'), 'ok');
    ok('the bag\'s NPE:AA < 20 is a critical alert', /NPE:AA IV 17 kcal\/g AA < 20 hard limit/.test(alertText('NPE:AA critically off target')), alertRows());
    ok('…naming the total too', /total incl\. EN 24 kcal\/g/.test(alertText('NPE:AA critically off target')), alertText('NPE:AA critically off target'));
    f1('mixed PN + EN, IV NPE:AA 17');
    // Pure PN, 19.97 kcal/g: never printed as "20 < 20".
    mount({ patient: pt('NP-850', 900), onLog: logger().onLog });
    setField('Current weight', 850); fillRequired(150);
    setField('Volume(mL/day)', 110); setField('Dextrose final', 10); setField('Amino acid', 3); setField('SMOF Lipid', 2);
    eq('pure PN: exactly one NPE:AA line', alertRows().filter(a => /^NPE:AA/.test(a.title)).map(a => a.level), ['crit']);
    ok('a value just under 20 is not shown as "20"', /NPE:AA IV 19\.\d+ kcal\/g AA < 20/.test(alertText('NPE:AA critically off target')), alertText('NPE:AA critically off target'));
  });

  await section('§5 F1 · a critical tile is always a critical alert (more shapes)', async () => {
    mount({ patient: pt('OS-1000', 1000), onLog: logger().onLog });
    setField('Current weight', 1000); fillRequired(150);
    click(buttonText(/^Peripheral$/));
    setField('Dextrose final', 25);           // ingredient, no volume → peripheral osmolarity > 900
    eq('the Osmolarity tile is critical', tileStatus('Osmolarity'), 'crit');
    ok('…and so is an alert (it needed volume > 0)', critTitles().includes('Osmolarity > peripheral limit'), critTitles());
    f1('peripheral, dextrose with no volume');
    mount({ patient: pt('PR-1000', 1000), onLog: logger().onLog });
    setField('Current weight', 1100); fillRequired(150);
    selectFeed('BM_HMF_24'); setField('Volume(mL/feed)', 8); setField('Frequency', 8);
    setField('Volume(mL/day)', 90); setField('Dextrose final', 10); setField('Amino acid', 3.5); setField('SMOF Lipid', 3);
    ok('protein 4.8 hard limit still on the TOTAL (unchanged, open question)', critTitles().includes('Protein critically out of range'), critTitles());
    f1('protein over 4.8 on PN + EN');
  });

  // ═══════════════════════ UP-C1 · nothing printed moved ════════════════════
  await section('§6 UP-C1 · every printed figure is what 42ce553 printed', async () => {
    // Figures = every numeric <strong> on #print-form outside the patient table
    // and the saved-by line, captured from 42ce553 for these orders. r1/r2 stay
    // untouched until pharmacy confirms the Na dose (Praew, 2026-09-17).
    const figures = () => {
      const form = printForm(); if (!form) return null;
      const table = form.querySelector(':scope > table');
      return [...form.querySelectorAll('strong')].filter(s => !table.contains(s) && !/บันทึกโดย/.test(s.parentElement.textContent)).map(s => s.textContent.trim());
    };
    const P = pt('CAP-1', 1000, { admissionDate: '2026-09-07' });
    // Dead space is typed as 0 where an order sets none: at 42ce553 every new
    // order started at 0. Since 2026-09-18 one on NICU/SCN starts at 30
    // (verify-ward-requests-0918.cjs §10), which is a different order. full_en
    // has no TPN, so no bag and no dead space either way.
    const ORDERS = {
      S5_elbw: ['e7466628370cc834', { ...P, bw: 500, weights: [{ dol: 1, w: 500 }] }, () => {
        setField('Current weight', 500); fillRequired(150);
        setField('Volume(mL/day)', 60); setField('ปริมาตรคาสาย', 0); setField('Dextrose final', 10); setField('Amino acid', 3); setField('SMOF Lipid', 2);
        setField('20% NaCl', 1); setField('Na Acetate', 1); setField('KCl', 1); setField('Glycophos', 1); }],
      parity_plain: ['f8a53682fe1effb3', P, () => PARITY.forEach(([l, v]) => setField(l, v))],
      parity_dead: ['aa0510d437c34170', P, () => { PARITY.forEach(([l, v]) => setField(l, v)); setField('ปริมาตรคาสาย', 6.3); }],
      mixed_pn_en: ['5baf4705b9b7adbd', P, () => {
        setField('Current weight', 1100); fillRequired(150); selectFeed('BM_HMF_24'); setField('Volume(mL/feed)', 8); setField('Frequency', 8);
        setField('Volume(mL/day)', 90); setField('ปริมาตรคาสาย', 0); setField('Dextrose final', 10); setField('Amino acid', 3.5); setField('SMOF Lipid', 3);
        setField('20% NaCl', 2); setField('KCl', 2); setField('10% Ca gluconate', 60); setField('Glycophos', 2); setField('MgSO₄', 0.3); }],
      lipid48_k4: ['a53c3c41e71fcc2d', P, () => {
        setField('Current weight', 1000); fillRequired(160);
        setField('Volume(mL/day)', 110); setField('ปริมาตรคาสาย', 0); setField('Dextrose final', 12.5); setField('Amino acid', 3.5); setField('SMOF Lipid', 4.8);
        setField('KCl', 4); setField('10% Ca gluconate', 80); setField('Glycophos', 3); }],
      full_en: ['c9690daa62ccf31f', P, () => {
        setField('Current weight', 1500); fillRequired(160); selectFeed('FBM_PF_24'); setField('Volume(mL/feed)', 30); setField('Frequency', 8); }],
    };
    const PARITY = [['Current weight', 1234], ['Target fluid', 150], ['Other IV', 3], ['Drug volume', 2],
      ['Volume(mL/feed)', 7], ['Frequency', 8], ['Volume(mL/day)', 137], ['ปริมาตรคาสาย', 0], ['Dextrose final', 12.5],
      ['Amino acid', 3.2], ['SMOF Lipid', 2.6], ['Heparin', 0.5],
      ['20% NaCl', 2.3], ['Na Acetate', 1.1], ['Glycophos', 0.7], ['KCl', 3.1], ['K₂HPO₄', 1.3],
      ['MgSO₄', 0.35], ['10% Ca gluconate', 47], ['Iron', 2.5], ['ปริมาณ elem Ca', 60], ['ปริมาณ elem P', 35], ['Vitamin D', 450],
      ['Input', 180], ['Urine output', 90], ['Drain content', 0]];
    for (const [name, [digest, patient, fill]] of Object.entries(ORDERS)) {
      mount({ patient, onLog: logger().onLog, userLabel: 'Dr Test' });
      fill();
      await save('capture reason');
      const figs = figures();
      const got = figs && crypto.createHash('sha256').update(JSON.stringify(figs)).digest('hex').slice(0, 16);
      eq(`${name}: the ${figs ? figs.length : 0} printed figures are unchanged`, got, digest);
      if (name === 'S5_elbw') {
        const t = printText();
        ok('S5: 20% NaCl 0.5 mEq = 0.1 mL · Na acetate 0.2 mL · KCl 0.3 mL (r1, as before)',
          ['0.5 mEq = 0.1 mL', '0.5 mEq = 0.2 mL', '0.5 mEq = 0.3 mL'].every(s => t.includes(s)), t.match(/[\d.]+ mEq = [\d.]+ mL/g));
        ok('S5: delivered Na⁺ 1.5 mEq = 3 mEq/kg · K⁺ 0.5 mEq = 1 mEq/kg', /Na⁺ 1\.5 mEq = 3 mEq\/kg/.test(t) && /K⁺ 0\.5 mEq = 1 mEq\/kg/.test(t));
      }
    }
  });

  // ═══════════════════════ UP-C3 · ingredients with no volume ═══════════════
  await section('§7 UP-C3 · TPN volume 0 with bag ingredients blocks Save and Print', async () => {
    const yesterday = { entryId: 'e-y', lastModified: 'lm-y', ts: '2026-09-14', dol: 16, weight: 1250,
      ioInput: 180, ioOutput: 90, drainContent: 0,
      calcInput: { curWtG: 1250, fluidTargetPerKg: 150, otherIV_mL: 0, drug_mL: 0, totalTPN_mL: 60, dexPct: 10, aaPerKg: 2,
        lipidPerKg: 1, naCl: 2, kCl: 1, caPerKg: 60, glycophosP: 1, enType: 'BM_20', enVol: 15, enFreq: 8 } };
    const log = logger();
    mount({ patient: pt('ZV-1200', 1200), dol: 17, baselineEntry: yesterday, previousEntry: yesterday, onLog: log.onLog });
    fillRequired(150);
    setField('Volume(mL/day)', 0); setField('SMOF Lipid', 0);          // TPN stopped, ingredients left in
    const msg = container.querySelector('.zero-volume-bag')?.textContent || '';
    ok('the form says volume 0 with ingredients, and names them',
      /ปริมาตร TPN = 0 แต่ยังมีส่วนประกอบในถุง: Amino acid, Dextrose, 20% NaCl, Glycophos, KCl, Ca gluconate/.test(msg), msg);
    eq('Save is disabled', saveBtn()?.disabled, true);
    await save('x');
    eq('…and nothing is saved', log.calls, 0);
    ok('the over-full bag is a critical alert on screen (it needed volume > 0)', critTitles().includes('Bag cannot be compounded'), critTitles());
    ok('…and the bag make-up panel is shown', /WFI q\.s\./.test(container.textContent));
    for (const l of ['Amino acid', 'Dextrose final', '20% NaCl', 'KCl', 'Glycophos', '10% Ca gluconate']) setField(l, 0);
    ok('removing the ingredients lifts the block', !container.querySelector('.zero-volume-bag') && saveBtn()?.disabled === false);
    // Every fresh form ticks Soluvit/Peditrace and sets heparin 1 U/mL; counting
    // those would block every feeds-only and NPO day.
    const soluvit = [...container.querySelectorAll('input[type=checkbox]')].find(i => /Soluvit/.test(i.closest('label')?.textContent || ''));
    ok('…with Soluvit still ticked and heparin still 1 U/mL', !!soluvit?.checked && inputFor('Heparin').value === '1',
      { soluvit: soluvit?.checked, heparin: inputFor('Heparin').value });
    await save(null);
    eq('the feeds-only day saves', log.entry && log.entry.route, 'Enteral only');

    const legacy = { entryId: 'e-zv', lastModified: 'lm-zv', ts: '2026-09-15', dol: 18, weight: 1250,
      ioInput: 120, ioOutput: 60, drainContent: 0,
      calcInput: { curWtG: 1250, fluidTargetPerKg: 150, otherIV_mL: 0, drug_mL: 0, ioInput: 120, ioOutput: 60, drainContent: 0,
        totalTPN_mL: 0, aaPerKg: 3, enType: 'BM_20', enVol: 20, enFreq: 8 } };
    mount({ patient: pt('ZV-1200', 1200), dol: 18, editEntry: legacy, logDate: null, onLog: log.onLog });
    ok('a saved row with AA and no volume has no print form', !printForm());
    const p = await tryPrint();
    eq('Print order does not print it', p.printed, 0);
    ok('…and says why', p.toasts.some(t => /ปริมาตร TPN = 0/.test(t)), p.toasts);
  });

  // ═══════════════════════ UP-C5 · Intake / Output is per day ═══════════════
  await section('§8 UP-C5 · yesterday\'s Intake / Output never satisfies today\'s gate', async () => {
    const P = pt('IO-1200', 1200, { weights: [{ dol: 1, w: 1200 }, { dol: 9, w: 1180 }] });
    const yesterday = { entryId: 'e-y', lastModified: '2026-09-14T03:00:00.000Z', ts: '2026-09-14', dol: 10, weight: 1180,
      ioInput: 170, ioOutput: 95, drainContent: 12,
      calcInput: { curWtG: 1180, fluidTargetPerKg: 150, otherIV_mL: 3, drug_mL: 2, ioInput: 170, ioOutput: 95, drainContent: 12,
        totalTPN_mL: 120, dexPct: 10, aaPerKg: 3, lipidPerKg: 3 } };
    const log = logger();
    mount({ patient: P, dol: 11, baselineEntry: yesterday, previousEntry: yesterday, onLog: log.onLog });
    eq('Urine output starts blank', inputFor('Urine output').value, '');
    eq('Drain content starts blank', inputFor('Drain content').value, '');
    ok('…both are listed as missing', /Urine output/.test(missingText()) && /Drain content/.test(missingText()), missingText());
    eq('Save is disabled', saveBtn()?.disabled, true);
    ok('yesterday\'s plan is still the starting point (AA 3)', inputFor('Amino acid').value === '3', inputFor('Amino acid').value);
    setField('Urine output', 70); setField('Drain content', 5);
    await save('x');
    eq('today\'s typed figures are what is saved', log.entry && [log.entry.ioOutput, log.entry.drainContent], [70, 5]);

    window.localStorage.clear();
    act(() => { root.unmount(); }); root = ReactDOM.createRoot(container);
    window.localStorage.setItem('neofeed_calc_IO-1200', JSON.stringify({ curWtG: 1190, ioInput: 160, ioOutput: 88, drainContent: 9, aaPerKg: 2.5, savedAt: new Date().toISOString() }));
    render({ patient: P, dol: 11, logDate: null, onLog: log.onLog });
    eq('the "previous submission" prefill blanks Urine output too', inputFor('Urine output').value, '');
    eq('…and Drain content', inputFor('Drain content').value, '');

    const legacy = { entryId: 'e-old', lastModified: '2026-08-01T03:00:00.000Z', ts: '2026-08-01', dol: 5, weight: 1100,
      ioInput: 0, ioOutput: 0, drainContent: 0,          // Number('' || 0) from the backend
      calcInput: { curWtG: 1100, fluidTargetPerKg: 120, otherIV_mL: 0, drug_mL: 0, totalTPN_mL: 100, dexPct: 10, aaPerKg: 3 } };
    mount({ patient: P, dol: 5, editEntry: legacy, logDate: null, onLog: log.onLog });
    eq('a legacy row\'s never-recorded Urine output comes back blank', inputFor('Urine output').value, '');
    ok('…and is missing, not "entered"', /Urine output/.test(missingText()) && /Input/.test(missingText()), missingText());
    mount({ patient: P, dol: 5, editEntry: { ...legacy, calcInput: { ...legacy.calcInput, ioInput: 0, ioOutput: 0, drainContent: 0 } }, logDate: null, onLog: log.onLog });
    eq('a row that recorded zeros still reopens with "0"', inputFor('Urine output').value, '0');
  });

  // ═══════════════════════ UP-C2 · the dosing weight moved ══════════════════
  await section('§9 UP-C2 · a birth-weight edit that re-doses a saved order blocks Print', async () => {
    const P900 = pt('BW-900', 900, { admissionDate: '2026-09-08' });
    // Dextrose 12.5 % + lipid 3: no critical value, so only the weight is under test.
    const inputs = { curWtG: 850, fluidTargetPerKg: 150, otherIV_mL: 0, drug_mL: 0, ioInput: 130, ioOutput: 60, drainContent: 0,
      totalTPN_mL: 110, dexPct: 12.5, aaPerKg: 3, lipidPerKg: 3, naCl: 2, kCl: 1, caPerKg: 60, glycophosP: 1 };
    const row = (ci, extra) => ({ entryId: 'e-bw', lastModified: '2026-09-15T02:00:00.000Z', ts: '2026-09-15', dol: 10, weight: 850,
      ioInput: 130, ioOutput: 60, drainContent: 0, calcInput: ci, ...extra });

    // A row saved by this build carries calcInput.tpnWtG.
    const log = logger();
    mount({ patient: P900, onLog: log.onLog });
    Object.entries({ 'Current weight': 850, 'Target fluid': 150, 'Other IV': 0, 'Drug volume': 0, 'Input': 130, 'Urine output': 60, 'Drain content': 0,
      'Volume(mL/day)': 110, 'Dextrose final': 12.5, 'Amino acid': 3, 'SMOF Lipid': 3, '20% NaCl': 2, 'KCl': 1, '10% Ca gluconate': 60, 'Glycophos': 2 })
      .forEach(([l, v]) => setField(l, v));
    await save('x');
    eq('a save records the resolved dosing weight (floored at BW 900)', log.entry && log.entry.calcInput.tpnWtG, 900);
    const saved = row(log.entry.calcInput, { gir: log.entry.gir, enVolPerKg: log.entry.enVolPerKg });

    mount({ patient: P900, editEntry: saved, logDate: null });
    ok('reopened at BW 900 it is printable', !!printForm());
    const upd = [];
    render({ patient: { ...P900, bw: 1000 }, editEntry: saved, logDate: null, onUpdate: (id, lm, e) => { upd.push(e); return Promise.resolve({ ok: true, lastModified: 'lm-2' }); } });
    ok('BW corrected to 1000: the print form is withheld', !printForm());
    const banner = container.querySelector('.print-blocked')?.textContent || '';
    ok('…with a banner saying the dosing weight changed', /น้ำหนักที่ใช้คำนวณเปลี่ยนไปหลังบันทึก \(birth weight แก้ไข\)/.test(banner), banner);
    ok('…from 900 g to 1000 g', /900 g · ตอนนี้ 1000 g/.test(banner.replace(/\s+/g, ' ')), banner);
    const p = await tryPrint();
    eq('Print order does not print', p.printed, 0);
    ok('…toast: check and save again before printing', p.toasts.some(t => /ตรวจสอบและบันทึกใหม่ก่อนพิมพ์/.test(t)), p.toasts);
    await save('x');
    eq('saving again records the new dosing weight', upd[0] && upd[0].calcInput.tpnWtG, 1000);
    ok('…and the order is printable again', !!printForm());

    // A row saved before tpnWtG existed: its own GIR column is the evidence.
    const { tpnWtG, ...legacyCI } = log.entry.calcInput;
    const legacy = row(legacyCI, { gir: log.entry.gir });
    mount({ patient: P900, editEntry: legacy, logDate: null });
    ok('legacy row with a GIR, BW unchanged: printable', !!printForm());
    render({ patient: { ...P900, bw: 1000 }, editEntry: legacy, logDate: null });
    ok('legacy row, BW corrected: the GIR shows the weight moved → withheld', !printForm());
    mount({ patient: P900, editEntry: row(inputs), logDate: null });
    render({ patient: { ...P900, bw: 1000 }, editEntry: row(inputs), logDate: null });
    ok('legacy row with no recoverable evidence is not held back', !!printForm());
    const overridden = row({ ...inputs, tpnWtOverrideG: 950, tpnWtG: 950 });
    mount({ patient: P900, editEntry: overridden, logDate: null });
    render({ patient: { ...P900, bw: 1000 }, editEntry: overridden, logDate: null });
    ok('a manual dosing weight is not moved by a BW edit → still printable', !!printForm());
  });

  // ═══════════════════════ UP-C6 · unacknowledged critical values ═══════════
  await section('§10 UP-C6 · Print/Copy need every critical alert named in the saved reason', async () => {
    const P = pt('K5-900', 900, { admissionDate: '2026-09-08' });
    const ci = { curWtG: 850, fluidTargetPerKg: 150, otherIV_mL: 0, drug_mL: 0, ioInput: 130, ioOutput: 60, drainContent: 0,
      totalTPN_mL: 110, dexPct: 12.5, aaPerKg: 3, lipidPerKg: 3, naCl: 2, kCl: 5, caPerKg: 60, glycophosP: 1 };
    const row = (extra) => ({ entryId: 'e-k5', lastModified: 'lm-k5', ts: '2026-09-15', dol: 10, weight: 850,
      ioInput: 130, ioOutput: 60, drainContent: 0, calcInput: { ...ci, ...extra } });
    mount({ patient: P, editEntry: row({}), logDate: null });
    const titles = critTitles();
    ok('the legacy K 5 row shows critical alerts', titles.includes('Potassium critically out of range'), titles);
    ok('…saved with no reason: no print form', !printForm());
    const p = await tryPrint();
    eq('Print order does not print', p.printed, 0);
    ok('…toast: critical value without a reason', p.toasts.some(t => /มีค่าวิกฤตที่ยังไม่ได้ระบุเหตุผล — บันทึกพร้อมเหตุผลก่อนพิมพ์/.test(t)), p.toasts);
    ok('…and the banner names the alerts', /Potassium critically out of range/.test(container.querySelector('.print-blocked')?.textContent || ''));
    const t0 = toasts.length;
    click(buttonText(/Copy Order/));
    ok('Copy is refused the same way', toasts.slice(t0).some(t => /มีค่าวิกฤตที่ยังไม่ได้ระบุเหตุผล — บันทึกพร้อมเหตุผลก่อนคัดลอก/.test(t.msg)), toasts.slice(t0));
    mount({ patient: P, editEntry: row({ critOverride: { reason: 'r', alerts: [titles[0]], at: 'x' } }), logDate: null });
    ok(`a reason naming only "${titles[0]}" of ${titles.length}: still withheld`, titles.length < 2 || !printForm(), titles);
    mount({ patient: P, editEntry: row({ critOverride: { reason: 'hyperkalaemia treated', alerts: titles, at: 'x' } }), logDate: null });
    ok('a reason naming every critical alert: printable', !!printForm());
    const p2 = await tryPrint();
    eq('…and Print order prints', p2.printed, 1);
  });

  // ═══════════════════════ UP-C9 · optimistic tmp_ rows ═════════════════════
  await section('§11 UP-C9 · a tmp_ row cannot be opened, saved or printed', async () => {
    const P = pt('TM-1000', 1000);
    const ci = { curWtG: 1000, fluidTargetPerKg: 150, otherIV_mL: 0, drug_mL: 0, ioInput: 150, ioOutput: 80, drainContent: 0,
      totalTPN_mL: 110, dexPct: 12.5, aaPerKg: 3, lipidPerKg: 3 };
    for (const id of ['tmp_1726540000000_abc', 'local_tmp_1726540000000_abc']) {
      const upd = [];
      mount({ patient: P, editEntry: { entryId: id, lastModified: '2026-09-15', ts: '2026-09-15', dol: 10, weight: 1000, calcInput: ci },
        logDate: null, onDelete() {}, onUpdate: (i) => { upd.push(i); return Promise.resolve({ ok: true }); } });
      ok(`${id.split('_1')[0]}: no print form`, !printForm());
      const p = await tryPrint();
      ok('…Print order refuses, saying it is still saving', p.printed === 0 && p.toasts.some(t => /กำลังบันทึก/.test(t)), p);
      eq('…Save is disabled', saveBtn()?.disabled, true);
      ok('…no delete button', !buttonText(/ลบบันทึกนี้/));
    }
    act(() => { root.unmount(); }); root = ReactDOM.createRoot(container);
    const edited = [], deleted = [];
    const rows = [
      { entryId: 'tmp_1726540000000_abc', ts: '2026-09-15', dol: 10, weight: 1000, route: 'TPN central', status: 'submitted' },
      { entryId: 'e-real', ts: '2026-09-14', dol: 9, weight: 990, route: 'TPN central', status: 'submitted' },
    ];
    window.confirm = () => false;
    act(() => { root.render(React.createElement(window.DailyLog, { patient: P, log: { [P.sessionId]: rows }, dol: 10,
      onAddToday() {}, onEditEntry: (e) => edited.push(e.entryId), onDeleteEntry: (e) => deleted.push(e.entryId) })); });
    const trs = [...container.querySelectorAll('table.tbl tbody tr')];
    const tmpRow = trs.find(tr => /1000 g/.test(tr.textContent)), realRow = trs.find(tr => /990 g/.test(tr.textContent));
    ok('the log shows the tmp_ row as "กำลังบันทึก…"', /กำลังบันทึก…/.test(tmpRow?.textContent || ''), tmpRow?.textContent);
    click(tmpRow);
    eq('clicking it opens nothing', edited, []);
    ok('…and it has no delete button', !tmpRow.querySelector('.icon-btn'));
    click(realRow);
    eq('a confirmed row still opens', edited, ['e-real']);
    ok('…and keeps its delete button', !!realRow.querySelector('.icon-btn'));
  });

  // ═══════════════════════ UP-C12 · central osmolarity range ════════════════
  await section('§12 UP-C12 · central osmolarity tile range is 0–1800, the warn threshold', async () => {
    mount({ patient: pt('OS-1000', 1000), onLog: logger().onLog });
    setField('Current weight', 1000); fillRequired(150);
    setField('Volume(mL/day)', 100); setField('Dextrose final', 25); setField('Amino acid', 4.5);
    eq('central tile range', tileRange('Osmolarity'), '0–1800');
    eq('~1700 mOsm/L is inside it (ok, no alert)', [tileStatus('Osmolarity'), alertRows().filter(a => /smolar/.test(a.title)).length], ['ok', 0]);
    click(buttonText(/^Peripheral$/));
    eq('peripheral tile range unchanged', tileRange('Osmolarity'), '0–900');
  });

  // ═══════════════════════ UP-C13 · display artefacts ═══════════════════════
  await section('§13 UP-C13 · Rate × 24 float noise and the heparin hint', async () => {
    const prev = { entryId: 'e-p', lastModified: 'lm-p', ts: '2026-09-14', dol: 9, weight: 1000,
      calcInput: { curWtG: 1000, fluidTargetPerKg: 150, totalTPN_mL: 100, dexPct: 10, aaPerKg: 3, lipidPerKg: 3 } };
    mount({ patient: pt('RT-1000', 1000), previousEntry: prev, onLog: logger().onLog });
    setField('Current weight', 1000); fillRequired(150);
    setField('Rate', 4.1);
    eq('Rate 4.1 mL/hr → Volume box "98.4"', inputFor('Volume(mL/day)').value, '98.4');
    ok('changes list reads 100 → 98.4', /TPN volume: 100 → 98\.4 mL\/d/.test(container.querySelector('.order-changes')?.textContent.replace(/\s+/g, ' ') || ''),
      container.querySelector('.order-changes')?.textContent);
    mount({ patient: pt('RT-1000', 1000), previousEntry: { ...prev, calcInput: { ...prev.calcInput, totalTPN_mL: 98.39999999999999 } }, onLog: logger().onLog });
    setField('Current weight', 1000); setField('Volume(mL/day)', 100);
    ok('a stored 98.39999999999999 is described as 98.4', /TPN volume: 98\.4 → 100 mL\/d/.test(container.querySelector('.order-changes')?.textContent.replace(/\s+/g, ' ') || ''),
      container.querySelector('.order-changes')?.textContent);
    setField('ปริมาตรคาสาย', 20); setField('Heparin', 1);
    const hint = inputFor('Heparin').closest('.field').querySelector('.field-hint')?.textContent || '';
    ok('heparin hint: units from the prepared 120 mL, matching its mL', /total 120 U\/day → 1\.2 mL of 100 U\/mL/.test(hint), hint);
  });

  await section('§14 SEC-F7 · the NeoFeed reason prompt keeps names and HNs out', async () => {
    mount({ patient: pt('F7-1000', 1000), onLog: logger().onLog });
    setField('Current weight', 1000); fillRequired(150);
    setField('Volume(mL/day)', 110); setField('Dextrose final', 10); setField('Amino acid', 3); setField('KCl', 5);
    let promptText = '';
    window.prompt = (t) => { promptText = t; return null; };
    await clickAsync(saveBtn());
    ok('prompt says ห้ามใส่ชื่อหรือ HN', /ห้ามใส่ชื่อหรือ HN/.test(promptText), promptText);
  });

  act(() => { root.unmount(); });
  console.log(`\nREVIEW 2026-09-17 · CALCULATOR: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
