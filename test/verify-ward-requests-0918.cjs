// verify-ward-requests-0918.cjs — three requests from the NICU team, forwarded
// by Praew on 2026-09-18 as screenshots of the live calculator.
//
//   §1-§3  "ติ๊ก MEN แล้ว ไม่ต้องเอาไปคิดสารอาหารได้ไหม" — a MEN (trophic) feed
//          was already left out of the fluid total, but it still counted toward
//          energy, protein, lipid, Na, K, Ca, P and Ca:P. Now it counts toward
//          no total at all: not the Step 3/4 tiles, the Step 6 EN row, the
//          alerts, the saved Daily_Log figures, the printed totals or the copied
//          order. Step 2 still shows what the feed itself provides, marked as
//          not counted. The screenshot's own order is the fixture: its tiles read
//          Na 4.2 · K 3.3 · Ca 5 · P 50 · Ca:P 0.11 with MEN ticked.
//   §4     Praew's guard for that change: orders prefill from yesterday, so a
//          MEN tick left on after feeds are advanced would hide real feeds from
//          both totals. MEN above the app's own trophic range (Feeding
//          Advancement: MEF 12–24 mL/kg/d) is a warning — never a stop. MEN also
//          no longer switches on the enteral targets.
//   §5-§6  "ด้านข้าง ยังไม่มีแถบของ Mg เทียบกับค่าอ้างอิงแบบ Na K Ca P" — a
//          Magnesium tile in Step 4 against ESPGHAN/ESPEN/ESPR/CSPEN 2018
//          (Mihatsch), compared in mEq/kg/d, the unit Mg is dosed in. The
//          guideline's mg figures are rounded (0.1 mmol = 2.43 mg, printed 2.5),
//          so comparing in mg would flag the 0.2 and 0.4 presets — the exact
//          ESPGHAN bounds — as off target. Its alert line follows the F1 rule.
//   §7-§9  "ขอเพิ่มเผื่อกรณี ใช้ 15% Aminoplasmal" — the Aminoplasmal 15% label
//          (UK SmPC; Singapore HSA) says it must not be given to newborn infants,
//          infants or toddlers under 2 years. Praew (2026-09-18): "plan ไว้สำหรับ
//          เด็กโตในอนาคต ปิดช่องนี้ไม่โชว์ใน newborn (NICU+SCN)". So no ward
//          NeoFeed has today offers it; a future older-children ward gets it
//          from one list in data.js, and its arithmetic, print and saved order
//          are pinned here through a stubbed gate. Center Point never offers it:
//          CP's packet has one amino-acid slot, labelled "10% Aminoven infant".
//   §10    "ใน SCN+NICU แก้เป็น +30 ml อัตโนมัติไปเลย" — a new order on the newborn
//          wards starts with 30 mL dead space (ปริมาตรคาสาย), so pharmacy
//          prepares delivered + 30 and the Factor scales every additive. A new
//          day keeps a dead space somebody set and turns yesterday's 0 (the old
//          default) into 30; a saved order is the record and reopens unchanged;
//          the chips still override. No TPN, no bag: a feeds-only day prepares
//          nothing, so the default cannot put a 30 mL bag on the pharmacy form.
//   §11    Praew, "1. yes": Soluvit and Peditrace scale with the overfill like
//          every other additive, so the infant receives the full 1 mL/kg (the
//          KCMH sheet's G43/G45 use actual weight). The caps stay on what the
//          infant receives.
//
// Mounts the real <Calculator> in jsdom (same dev-only deps as the other
// calculator harnesses — see test/README.md). Fails against f0c172c.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { pathToFileURL } = require('url');
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
// Within half a unit of the last decimal the screen prints.
function near(name, got, want, decimals) {
  const tol = 0.5 * Math.pow(10, -decimals) + 1e-9;
  ok(`${name} = ${Number(want.toFixed(decimals + 1))}`, typeof got === 'number' && isFinite(got) && Math.abs(got - want) <= tol, got);
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
window.print = () => {};
window.confirm = () => true;
let copied = null;
// The calculator runs in Node's own global scope (vm.runInThisContext), and
// Node ≥ 21 has a global `navigator` of its own — so jsdom's is not the one
// Copy Order reaches. Stub both.
for (const nav of new Set([window.navigator, globalThis.navigator].filter(Boolean))) {
  Object.defineProperty(nav, 'clipboard', { configurable: true,
    value: { writeText: (t) => { copied = t; return Promise.resolve(); } } });
}
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
vm.runInThisContext(R('data.js'));
const D = window.NEOFEED_DATA;
for (const f of ['icons.jsx', 'calculator.jsx']) {
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
function setChk(labelStart, want) {
  const box = [...container.querySelectorAll('input[type=checkbox]')]
    .find(i => (i.closest('label')?.textContent || '').startsWith(labelStart));
  if (!box) throw new Error('checkbox not found: ' + labelStart);
  if (box.checked !== want) act(() => { box.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
}
const click = (el) => act(() => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const clickAsync = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const saveBtn = () => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'บันทึก' || /กำลังบันทึก/.test(b.textContent));
const fillRequired = (tf) => ['Target fluid', 'Other IV', 'Drug volume', 'Input', 'Urine output', 'Drain content']
  .forEach(l => setField(l, l === 'Target fluid' ? tf : 0));
const alertRows = () => [...container.querySelectorAll('.calc-bottom .alert-row')].map(a => ({
  level: ['crit', 'warn', 'info'].find(c => a.classList.contains(c)),
  title: a.querySelector('.title')?.textContent || '', text: a.textContent.replace(/\s+/g, ' ') }));
const alertTitles = () => alertRows().map(a => a.title);
const alertOf = (title) => alertRows().find(a => a.title === title) || null;
const tileEl = (label) => [...container.querySelectorAll('.metric')].find(x => x.querySelector('.lbl')?.textContent === label) || null;
const tileVal = (label) => { const t = tileEl(label); return t ? parseFloat(t.querySelector('.val').textContent) : null; };
const tileStatus = (label) => { const t = tileEl(label); return t ? (t.className.match(/s-(\w+)/) || [])[1] : null; };
const tileRange = (label) => tileEl(label)?.querySelector('.range')?.textContent || null;
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ');
const printForm = () => container.querySelector('#print-form');
const printText = () => text(printForm());
const enBox = () => container.querySelector('.en-delivered');
const aaButtons = () => [...container.querySelectorAll('.s2-aa-row .aa-product button')];
const aaVolume = () => { const m = text(container.querySelector('.s2-aa-row')).match(/Volume\s*([\d.]+) mL\/day/); return m ? parseFloat(m[1]) : null; };
const aaLabel = () => container.querySelector('.s2-aa-row .field label')?.textContent || '';
const componentsMl = () => { const m = text(container).match(/Components\s*([\d.]+) mL/); return m ? parseFloat(m[1]) : null; };

const BASE = { dol: 1, editEntry: null, baselineEntry: null, previousEntry: null, logDate: '2026-09-18',
  userLabel: 'Dr Test (doc@kcmh.test)', onUpdate() { return Promise.resolve({ ok: true, lastModified: 'lm-u' }); },
  onSaved() {}, onWeightChange() {} };
function mount(props) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear();
  act(() => { root.render(React.createElement(window.Calculator, { ...BASE, ...props })); });
  act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
}
function logger() {
  const box = { entry: null, calls: 0 };
  box.onLog = (e) => { box.entry = e; box.calls++; return Promise.resolve({ ok: true, entryId: 'e-' + box.calls, lastModified: 'lm-' + box.calls }); };
  return box;
}
async function save(reason = 'fixture — attending aware') {
  window.prompt = () => reason;
  await clickAsync(saveBtn());
}
const pt = (sid, bw, extra) => ({ sessionId: sid, name: sid.slice(0, 2), bw, currentBed: 'NICU 5', diagnosis: '-',
  weights: [{ dol: 1, w: bw }], admissionDate: '2026-09-18', ...extra });

// ── The screenshot's order, DOL 1, dosing weight 2 kg ──────────────────────
// Feed: breast milk 20 kcal/oz, 5 mL × 8 = 40 mL/d = 20 mL/kg/d (the screen's
// "kcal 13 · pro 0.2 · Na 0.2 · K 0.3 · Ca 5 · P 3" per kg). TPN 180 mL D10, AA
// 2, SMOF 2, NaCl 1 + Glycophos 3 mEq Na (1.5 mmol P), KCl 3, MgSO₄ 0.6.
const W = 2, EN_ML = 40, BM = D.EN_DB.BM_20;
const FEED = {};   // what the feed provides per kg/d — an independent transcription
for (const k of ['kcal', 'pro', 'fat', 'na', 'k', 'ca', 'p']) FEED[k] = EN_ML / 100 * BM[k] / W;
const TPN = {
  kcal: (180 * 0.10 * 3.4 + 2 * W * 4 + 2 * W * 9) / W,   // 3.4 kcal/g dextrose, 4 AA, 9 fat — the KCMH sheet's E53
  pro: 2, lipid: 2, na: 1 + 3, k: 3, ca: 0, p: 1.5 * 31,
};
function screenshotOrder({ men = true, vol = 5, freq = 8, tpnMl = 180 } = {}) {
  setField('Current weight', 2000); fillRequired(120);
  selectFeed('BM_20'); setField('Volume(mL/feed)', vol); setField('Frequency', freq);
  setChk('MEN', men);
  // Dead space 0: §1-§9's arithmetic is for a bag with no overfill. A new
  // order starts at 30 mL on the newborn wards since §10's change.
  setField('Volume(mL/day)', tpnMl); setField('ปริมาตรคาสาย', 0); setField('Dextrose final', 10);
  setField('Amino acid', 2); setField('SMOF Lipid', 2);
  setField('20% NaCl', 1); setField('Glycophos', 3); setField('KCl', 3); setField('MgSO₄', 0.6);
}

(async () => {
  // ═══════════════════════ MEN counts toward no nutrient ════════════════════
  await section('§1 MEN ticked: every Step 3/4 total is the TPN alone (the screenshot)', async () => {
    mount({ patient: pt('MN-2000', 2000), onLog: logger().onLog });
    screenshotOrder({ men: true });
    near('Energy (total) kcal/kg/d = TPN only', tileVal('Energy (total)'), TPN.kcal, 0);
    near('Protein g/kg/d = the amino acid ordered', tileVal('Protein'), TPN.pro, 1);
    near('Lipid (total) g/kg/d = SMOF only', tileVal('Lipid (total)'), TPN.lipid, 1);
    near('Sodium mEq/kg/d = NaCl + Glycophos (was 4.2)', tileVal('Sodium'), TPN.na, 1);
    near('Potassium mEq/kg/d = KCl (was 3.3)', tileVal('Potassium'), TPN.k, 1);
    near('Calcium mg/kg/d = none ordered (was 5)', tileVal('Calcium'), TPN.ca, 0);
    near('Phosphorus mg/kg/d = Glycophos 1.5 mmol × 31 (was 50)', tileVal('Phosphorus'), TPN.p, 0);
    eq('Ca:P tile has no Ca and reads empty (was 0.11 "off target")', tileStatus('Ca:P ratio'), 'empty');
    ok('no Ca:P alert line', !alertTitles().some(t => /^Ca:P/.test(t)), alertTitles());
    const energyCard = [...container.querySelectorAll('.calc-bottom .card')].find(c => /Energy distribution/.test(c.textContent));
    ok('Energy distribution: EN 0 kcal, marked MEN', /EN\s*0\b/.test(text(energyCard)) && /MEN/.test(text(energyCard)), text(energyCard));
    ok('Step 6 has no "EN (นม)" Ca/PO₄ row', ![...container.querySelectorAll('span')].some(s => s.textContent === 'EN (นม)'));
  });

  await section('§1b …while Step 2 still shows what the feed provides, marked not counted', async () => {
    const box = enBox();
    ok('Step 2 "Delivered per kg from EN" box is there', !!box);
    ok('…says MEN is not counted', /MEN/.test(text(box)) && /not counted/i.test(text(box)), text(box));
    const nums = Object.fromEntries([...text(box).matchAll(/(kcal|pro|Na|K|Ca|P) ([\d.]+)/g)].map(m => [m[1], parseFloat(m[2])]));
    near('…kcal is the feed\'s own (not 0)', nums.kcal, FEED.kcal, 0);
    near('…pro', nums.pro, FEED.pro, 1);
    near('…Na', nums.Na, FEED.na, 1);
    near('…K', nums.K, FEED.k, 1);
    near('…Ca', nums.Ca, FEED.ca, 0);
    near('…P', nums.P, FEED.p, 0);
    const hint = [...container.querySelectorAll('.chk-label')].find(l => /^MEN/.test(l.textContent));
    ok('the MEN checkbox says fluid AND nutrient totals', /fluid/i.test(text(hint)) && /nutri/i.test(text(hint)), text(hint));
    near('EN volume tile still reads the feed given, 20 mL/kg/d', tileVal('EN volume'), 20, 0);
  });

  await section('§2 control — MEN unticked: the same order counts the feed (the harness can see EN)', async () => {
    setChk('MEN', false);
    near('Energy (total) = TPN + feed', tileVal('Energy (total)'), TPN.kcal + FEED.kcal, 0);
    near('Protein = TPN + feed', tileVal('Protein'), TPN.pro + FEED.pro, 1);
    near('Lipid (total) = TPN + feed', tileVal('Lipid (total)'), TPN.lipid + FEED.fat, 1);
    near('Sodium = 4.2, as on the screenshot', tileVal('Sodium'), TPN.na + FEED.na, 1);
    near('Potassium = 3.3, as on the screenshot', tileVal('Potassium'), TPN.k + FEED.k, 1);
    near('Calcium = 5, as on the screenshot', tileVal('Calcium'), FEED.ca, 0);
    near('Phosphorus = 50, as on the screenshot', tileVal('Phosphorus'), TPN.p + FEED.p, 0);
    near('Ca:P = 0.11, as on the screenshot', tileVal('Ca:P ratio'), FEED.ca / (TPN.p + FEED.p), 2);
    ok('Step 6 shows the "EN (นม)" row', [...container.querySelectorAll('span')].some(s => s.textContent === 'EN (นม)'));
    ok('Step 2 box no longer says "not counted"', !/not counted/i.test(text(enBox())), text(enBox()));
  });

  await section('§3 MEN: what is saved, printed and copied', async () => {
    const log = logger();
    mount({ patient: pt('MS-2000', 2000), onLog: log.onLog });
    screenshotOrder({ men: true });
    await save();
    const e = log.entry || {};
    ok('the order saved', log.calls === 1, toasts.slice(-2));
    near('Daily_Log kcal = TPN only', e.kcal, TPN.kcal, 2);
    near('Daily_Log pro = TPN only', e.pro, TPN.pro, 2);
    near('Daily_Log na = TPN only', e.na, TPN.na, 2);
    near('Daily_Log k = TPN only', e.k, TPN.k, 2);
    near('Daily_Log ca = TPN only', e.ca, TPN.ca, 2);
    near('Daily_Log p = TPN only', e.p, TPN.p, 2);
    near('Daily_Log enVolPerKg is still the feed given', e.enVolPerKg, 20, 2);
    eq('calcInput carries isMEN', e.calcInput && e.calcInput.isMEN, true);
    const t = printText();
    ok('the print form is rendered', !!printForm());
    ok('printed energy has no "total incl. EN"', !/total incl\. EN/.test(t), t.match(/Energy \(TPN\)[^·]*·?[^·]*/));
    ok('printed summary: Energy is the TPN figure', t.includes(`Energy ${Math.round(TPN.kcal)} kcal/kg/d`), t.match(/Energy \d+ kcal\/kg\/d/));
    ok('printed Ca·PO₄ block has no EN (นม) row', !/EN \(นม\)/.test(t));
    copied = null;
    const copyBtn = [...container.querySelectorAll('button')].find(b => /Copy Order/.test(b.textContent));
    await clickAsync(copyBtn);
    ok('copied order says MEN is not counted in fluid or nutrition', /\[MEN — not counted in fluid or nutrition\]/.test(copied || ''), (copied || '').match(/EN: [^\n]*/));
  });

  await section('§3b a MEN order whose only phosphate was the feed now raises the no-P stop', async () => {
    // Saved before this change: TPN Ca 60 mg/kg with no IV phosphate, P coming
    // only from the MEN feed. Ca:P was "off target"; without the feed there is
    // no P at all — the critical alert the saved order never named, so Print
    // waits for a save with a reason (UP-C6).
    const saved = { entryId: 'e-old', lastModified: 'lm-old', ts: '2026-09-18', dol: 1, weight: 2000,
      ioInput: 200, ioOutput: 80, drainContent: 0,
      calcInput: { curWtG: 2000, fluidTargetPerKg: 120, otherIV_mL: 0, drug_mL: 0, totalTPN_mL: 180, dexPct: 10, aaPerKg: 2,
        lipidPerKg: 2, naCl: 1, kCl: 1, caPerKg: 60, enType: 'BM_20', enVol: 5, enFreq: 8, isMEN: true } };
    mount({ patient: pt('MP-2000', 2000), editEntry: saved, onLog: logger().onLog });
    ok('"Ca:P ratio — ไม่มี P" is a critical alert', alertRows().some(a => a.level === 'crit' && /^Ca:P ratio — ไม่มี P/.test(a.title)), alertRows());
    ok('…so the reopened order does not print until saved with a reason', !printForm());
  });

  // ═══════════════════════ Praew's guard: MEN above trophic volume ═════════
  await section('§4 MEN ticked above 24 mL/kg/d warns; it never stops the order', async () => {
    const TITLE = 'MEN ticked above trophic volume';
    eq('D.MEN_MAX_ML_KG is the Feeding Advancement card\'s MEF ceiling', D.MEN_MAX_ML_KG, 24);
    const log = logger();
    mount({ patient: pt('MG-2000', 2000), onLog: log.onLog });
    screenshotOrder({ men: true, vol: 5, freq: 8 });                     // 20 mL/kg/d
    ok('20 mL/kg/d: no warning', !alertOf(TITLE), alertTitles());
    setField('Volume(mL/feed)', 6);                                        // 48 mL = 24 mL/kg/d
    ok('24 mL/kg/d (the ceiling itself): no warning', !alertOf(TITLE), alertTitles());
    setField('Volume(mL/feed)', 7);                                        // 56 mL = 28 mL/kg/d
    const a = alertOf(TITLE);
    ok('28 mL/kg/d: a warning', !!a && a.level === 'warn', alertRows().filter(r => /MEN/.test(r.title)));
    ok('…naming the volume and what MEN hides', !!a && /28 mL\/kg\/d/.test(a.text) && /fluid/.test(a.text) && /nutrition/.test(a.text), a && a.text);
    setChk('MEN', false);
    ok('unticked at 28 mL/kg/d: no warning', !alertOf(TITLE), alertTitles());
    setChk('MEN', true);
    await save(null);                                                      // no reason given: must still save
    ok('the warning does not stop Save (no reason asked)', log.calls === 1, toasts.slice(-2));

    // MEN at full-feed volume is a contradiction: it no longer switches the
    // tiles to the ESPGHAN 2022 enteral targets, and the guard says why.
    mount({ patient: pt('MF-2000', 2000), onLog: logger().onLog });
    screenshotOrder({ men: true, vol: 30, freq: 8 });                    // 120 mL/kg/d
    eq('MEN at 120 mL/kg/d: Calcium keeps the parenteral DOL-1 range', tileRange('Calcium'), '32–80');
    ok('…no "EN targets active" banner', !/EN targets active/.test(text(container)));
    ok('…and the MEN warning is up', !!alertOf(TITLE), alertTitles());
    setChk('MEN', false);
    eq('unticked: Calcium switches to the enteral range', tileRange('Calcium'), '120–200');
    ok('…with the banner', /EN targets active/.test(text(container)));
  });

  // ═══════════════════════ Magnesium tile ═══════════════════════════════════
  await section('§5 Step 4 has a Magnesium tile against ESPGHAN 2018, in mEq/kg/d', async () => {
    mount({ patient: pt('MA-2000', 2000), onLog: logger().onLog });
    screenshotOrder({ men: true });                                        // MgSO₄ 0.6 at DOL 1
    ok('a Magnesium tile exists', !!tileEl('Magnesium'));
    ok('…in the Step 4 tile column, beside Sodium', !!tileEl('Magnesium') && tileEl('Magnesium').parentElement === tileEl('Sodium').parentElement);
    ok('…in mEq/kg/d', /mEq\/kg\/d/.test(text(tileEl('Magnesium')?.querySelector('.val'))), text(tileEl('Magnesium')));
    near('…reading the MgSO₄ ordered', tileVal('Magnesium'), 0.6, 2);
    eq('DOL 1 range = TARGETS.mg(1) = 0.2–0.4', tileRange('Magnesium'), `${D.TARGETS.mg(1)[0]}–${D.TARGETS.mg(1)[1]}`);
    eq('0.6 at DOL 1 is off target', tileStatus('Magnesium'), 'warn');
    const mgNote = container.querySelector('.mg-mgkg');
    ok('the tile carries mg/kg/d for the mg-based table: 0.6 mEq = 7.3 mg', /= 7\.3 mg\/kg\/d/.test(text(mgNote)), text(mgNote));
    ok('…and says it is TPN only (no Mg data for feeds)', /TPN only/.test(text(mgNote)), text(mgNote));
    for (const [v, want] of [[0.2, 'ok'], [0.3, 'ok'], [0.4, 'ok'], [0.1, 'warn'], [0.5, 'warn']]) {
      setField('MgSO₄', v);
      eq(`DOL 1 · ${v} mEq/kg/d reads ${want}${v === 0.2 || v === 0.4 ? ' (an ESPGHAN bound — 2.43 / 4.86 mg)' : ''}`, tileStatus('Magnesium'), want);
    }
    setField('MgSO₄', 0);
    eq('none ordered reads empty', tileStatus('Magnesium'), 'empty');
    ok('…and raises no Magnesium alert', !alertTitles().some(t => /^Magnesium/.test(t)), alertTitles());

    mount({ patient: pt('MB-2000', 2000), dol: 5, onLog: logger().onLog });
    screenshotOrder({ men: true });
    eq('DOL 5 range = TARGETS.mg(5) = 0.4–0.6', tileRange('Magnesium'), `${D.TARGETS.mg(5)[0]}–${D.TARGETS.mg(5)[1]}`);
    for (const [v, want] of [[0.4, 'ok'], [0.6, 'ok'], [0.3, 'warn'], [0.8, 'warn']]) {
      setField('MgSO₄', v);
      eq(`DOL 5 · ${v} mEq/kg/d reads ${want}`, tileStatus('Magnesium'), want);
    }
  });

  await section('§6 an off-target Magnesium tile is an alert line (F1), sourced to ESPGHAN 2018', async () => {
    mount({ patient: pt('MC-2000', 2000), onLog: logger().onLog });
    screenshotOrder({ men: true });
    const a = alertOf('Magnesium off target');
    ok('0.6 at DOL 1: "Magnesium off target" warning', !!a && a.level === 'warn', alertRows());
    ok('…with value and range in mEq/kg/d', !!a && /0\.6 mEq\/kg\/d — target 0\.2–0\.4 mEq\/kg\/d/.test(a.text), a && a.text);
    ok('…citing ESPGHAN 2018 parenteral', !!a && /ESPGHAN 2018/.test(a.text), a && a.text);
    const offTiles = [...container.querySelectorAll('.metric.s-warn, .metric.s-crit')].map(m => m.querySelector('.lbl')?.textContent);
    ok('every off-target tile has its alert line (Magnesium included)', offTiles.includes('Magnesium') && !alertTitles().includes('No safety flags'), { offTiles });
    setField('MgSO₄', 0.3);
    ok('0.3 at DOL 1: no Magnesium alert', !alertTitles().some(t => /^Magnesium/.test(t)), alertTitles());

    // Full feeds switch Na/K/Ca/P to the enteral table; Mg has only a
    // parenteral reference, and its line must still say so.
    mount({ patient: pt('MD-2000', 2000), dol: 10, onLog: logger().onLog });
    screenshotOrder({ men: false, vol: 30, freq: 8 });                   // 120 mL/kg/d, MgSO₄ 0.6
    setField('MgSO₄', 0.3);                                               // DOL 10 range 0.4–0.6
    const b = alertOf('Magnesium off target');
    ok('on full feeds the Magnesium line still cites ESPGHAN 2018, not 2022 enteral', !!b && /ESPGHAN 2018/.test(b.text) && !/2022/.test(b.text), b && b.text);
  });

  // ═══════════════════════ Aminoplasmal 15% — hidden on newborn wards ══════
  await section('§7 data: Aminoplasmal 15% is stock NeoFeed knows, but no newborn ward is offered it', async () => {
    const S = D.KCMH_STOCK;
    eq('KCMH_STOCK.aminoplasmal15 is 0.15 g/mL (150 g/L)', S.aminoplasmal15 && S.aminoplasmal15.gPerMl, 0.15);
    eq('KCMH_STOCK.aminoven10 is unchanged, 0.10 g/mL', S.aminoven10.gPerMl, 0.10);
    eq('its printed label stays "10% Aminoven infant"', S.aminoven10.label, '10% Aminoven infant');
    ok('Aminoplasmal carries its label caution (< 2 years)', /2 ปี|2 years/.test(S.aminoplasmal15 && S.aminoplasmal15.caution || ''), S.aminoplasmal15);
    ok('D.aaProductsFor exists', typeof D.aaProductsFor === 'function');
    for (const bed of ['NICU 5', 'NICU-3', 'iso 3-2', 'SCN 12', 'SCN 30', '', 'Ward X (free text)']) {
      eq(`bed "${bed}" → Aminoven only`, D.aaProductsFor({ currentBed: bed }), ['aminoven10']);
    }
    eq('no patient → Aminoven only', D.aaProductsFor(null), ['aminoven10']);
    eq('no ward is an older-children ward yet', D.OLDER_CHILD_WARDS, []);
  });

  await section('§8 NICU: no product choice, Aminoven arithmetic, print and saved order unchanged', async () => {
    const log = logger();
    mount({ patient: pt('AN-2000', 2000), onLog: log.onLog });
    screenshotOrder({ men: true });
    eq('no amino-acid product buttons', aaButtons().length, 0);
    ok('field reads "Amino acid (Aminoven 10%)"', aaLabel().startsWith('Amino acid (Aminoven 10%)'), aaLabel());
    near('volume = 4 g ÷ 0.10 = 40 mL/day', aaVolume(), 40, 1);
    await save();
    eq('calcInput.aaProduct = aminoven10', log.entry && log.entry.calcInput.aaProduct, 'aminoven10');
    ok('print: "☑ 10% Aminoven infant = 2 g/kg/d = 4 g in bag = 40 mL"', /☑ 10% Aminoven infant = 2 g\/kg\/d = 4 g in bag = 40 mL/.test(printText()), printText().match(/☑ [^=]+=[^=]+=[^=]+= [\d.]+ mL/));

    // A row saved before this change has no aaProduct: it reopens as Aminoven,
    // unchanged — still printable without a re-save. (D15 keeps its IV NPE:AA
    // at 21 kcal/g: below 20 would be a critical stop of its own and hide
    // what this checks.)
    const legacy = { entryId: 'e-leg', lastModified: 'lm-leg', ts: '2026-09-18', dol: 1, weight: 2000, ioInput: 200, ioOutput: 80, drainContent: 0,
      calcInput: { curWtG: 2000, fluidTargetPerKg: 120, otherIV_mL: 0, drug_mL: 0, ioInput: 200, ioOutput: 80, drainContent: 0,
        totalTPN_mL: 180, dexPct: 15, aaPerKg: 3, lipidPerKg: 2, naCl: 1, kCl: 1, enType: 'BM_20', enVol: 0, enFreq: 0 } };
    mount({ patient: pt('AL-2000', 2000), editEntry: legacy, onLog: logger().onLog });
    eq('fixture: the legacy order raises no critical alert', alertRows().filter(a => a.level === 'crit').map(a => a.title), []);
    ok('a legacy row (no aaProduct) reopens printable', !!printForm());
    ok('…as 10% Aminoven infant, 60 mL', /☑ 10% Aminoven infant = 3 g\/kg\/d = 6 g in bag = 60 mL/.test(printText()), printText().match(/☑ [^=]+=[^=]+=[^=]+= [\d.]+ mL/));

    // A row carrying Aminoplasmal (from a future ward) reopened on NICU cannot
    // be offered it: the order is recomputed as Aminoven, so it reads as edited
    // and Print waits for a save — never the old id over new mL (UP-C2).
    const aplas = { ...legacy, entryId: 'e-apl', lastModified: 'lm-apl', calcInput: { ...legacy.calcInput, aaProduct: 'aminoplasmal15' } };
    let updated = null;   // an opened entry saves through onUpdate, not onLog
    mount({ patient: pt('AP-2000', 2000), editEntry: aplas, onLog: logger().onLog,
      onUpdate: (id, lm, e) => { updated = e; return Promise.resolve({ ok: true, lastModified: 'lm-apl-2' }); } });
    eq('no product buttons on NICU', aaButtons().length, 0);
    near('the amino acid is Aminoven: 6 g ÷ 0.10 = 60 mL', aaVolume(), 60, 1);
    ok('…so the order reads as changed and does not print', !printForm());
    await save();
    eq('saving it records aminoven10', updated && updated.calcInput.aaProduct, 'aminoven10');
    ok('…after which it prints, as 10% Aminoven infant', !!printForm() && /☑ 10% Aminoven infant = 3 g\/kg\/d = 6 g in bag = 60 mL/.test(printText()));
  });

  await section('§9 a future older-children ward (gate stubbed): the choice works end to end; CP never offers it', async () => {
    const realGate = D.aaProductsFor;
    D.aaProductsFor = () => ['aminoven10', 'aminoplasmal15'];
    try {
      const log = logger();
      const previous = { entryId: 'e-prev', ts: '2026-09-17', dol: 1, weight: 2000,
        calcInput: { curWtG: 2000, totalTPN_mL: 180, dexPct: 10, aaPerKg: 2, lipidPerKg: 2, naCl: 1, glycophosP: 1.5, kCl: 3, mgPerKg: 0.6, enType: 'BM_20', enVol: 5, enFreq: 8, isMEN: true } };
      mount({ patient: pt('FW-2000', 2000, { currentBed: 'future ward' }), previousEntry: previous, onLog: log.onLog });
      screenshotOrder({ men: true });
      eq('two product buttons: Aminoven 10% | Aminoplasmal 15%', aaButtons().map(b => b.textContent), ['Aminoven 10%', 'Aminoplasmal 15%']);
      ok('Aminoven is selected by default', aaButtons()[0].className.includes('on'));
      const compAminoven = componentsMl();
      click(aaButtons()[1]);
      ok('field reads "Amino acid (Aminoplasmal 15%)"', aaLabel().startsWith('Amino acid (Aminoplasmal 15%)'), aaLabel());
      near('volume = 4 g ÷ 0.15 = 26.7 mL/day', aaVolume(), 26.7, 1);
      near('components fall by the 13.3 mL saved', compAminoven - componentsMl(), 13.3, 1);
      ok('the label caution shows under the choice', /2 ปี|2 years/.test(text(container.querySelector('.s2-aa-row'))), text(container.querySelector('.s2-aa-row')));
      await save();
      eq('calcInput.aaProduct = aminoplasmal15', log.entry && log.entry.calcInput.aaProduct, 'aminoplasmal15');
      const t = printText();
      ok('print: "☑ 15% Aminoplasmal = 2 g/kg/d = 4 g in bag = 26.7 mL"', /☑ 15% Aminoplasmal = 2 g\/kg\/d = 4 g in bag = 26\.7 mL/.test(t), t.match(/☑ [^=]+=[^=]+=[^=]+= [\d.]+ mL/));
      ok('…and the prescription line is not Aminoven', !/☑ 10% Aminoven/.test(t), t.match(/☑ [^=]+=/g));
      ok('print lists the product change vs the previous order', /Amino acid product Aminoven 10%→Aminoplasmal 15%/.test(t), t.match(/เปลี่ยนแปลงจากคำสั่ง[^บ]*/));
      copied = null;
      await clickAsync([...container.querySelectorAll('button')].find(b => /Copy Order/.test(b.textContent)));
      ok('copied order: "AA (Aminoplasmal 15%): … = 26.7 mL/day"', /AA \(Aminoplasmal 15%\): 2 g\/kg\/d → 4\.0 g in bag = 26\.7 mL\/day/.test(copied || ''), (copied || '').match(/AA [^\n]*/));

      // Reopening the saved row restores the product and prints as saved.
      mount({ patient: pt('FW-2000', 2000, { currentBed: 'future ward' }), editEntry: { entryId: 'e-1', lastModified: 'lm-1', ts: '2026-09-18', dol: 1, weight: 2000,
        ioInput: 0, ioOutput: 0, drainContent: 0, calcInput: log.entry.calcInput }, onLog: logger().onLog });
      ok('reopened: Aminoplasmal 15% is the selected product', aaButtons()[1] && aaButtons()[1].className.includes('on'));
      ok('…printable as saved, 26.7 mL', !!printForm() && /15% Aminoplasmal = 2 g\/kg\/d = 4 g in bag = 26\.7 mL/.test(printText()));

      // Center Point: its packet (neofeed-tpn-v2) has one amino-acid slot,
      // "10% Aminoven infant" — so its entry never offers another product.
      let payload = null;
      mount({ patient: pt('CP-2000', 2000, { currentBed: 'future ward' }),
        centerPoint: { save(p) { payload = p; return Promise.resolve({ sourceRecordId: 'CP-2000', recordedAt: '2026-09-18T01:00:00.000Z' }); }, review() {}, failed() {} } });
      // CP has no Intake / Output card: Step 1 is its whole required set.
      setField('Current weight', 2000);
      ['Target fluid', 'Other IV', 'Drug volume'].forEach(l => setField(l, l === 'Target fluid' ? 120 : 0));
      setField('Volume(mL/day)', 180); setField('ปริมาตรคาสาย', 0); setField('Dextrose final', 10); setField('Amino acid', 2); setField('SMOF Lipid', 2);
      eq('CP entry: no product buttons even where the ward allows them', aaButtons().length, 0);
      near('CP entry: Aminoven arithmetic, 40 mL', aaVolume(), 40, 1);
      await save();
      ok('the CP save reached the bridge', !!payload);
      const { buildTpn } = await import(pathToFileURL(DIR + 'center-point/tpn-snapshot.mjs').href);
      const tpn = payload && buildTpn(payload, D, '2026-09-18T01:00:00.000Z', '2026-09-19T01:00:00.000Z');
      eq('CP packet: the "10% Aminoven infant" slot holds 40 mL', tpn && tpn.values.aaMl, '40');
    } finally {
      D.aaProductsFor = realGate;
    }
  });

  // ═══════════════════════ Dead space: +30 mL on the newborn wards ══════════
  await section('§10 a new order starts with 30 mL dead space on NICU and SCN (Praew: "ใน SCN+NICU แก้เป็น +30 ml อัตโนมัติไปเลย")', async () => {
    const deadInput = () => inputFor('ปริมาตรคาสาย');
    const deadVal = () => { const v = deadInput()?.value; return v === '' ? 0 : Number(v); };   // NumField shows 0 as an empty box
    const deadChip = (label) => [...deadInput().closest('.field').parentElement.querySelectorAll('.preset-chip')].find(b => b.textContent.trim() === label);
    const prepared = () => { const m = text(container).match(/Prepared \(เตรียมจริง\)\s*([\d.]+) mL\/day/); return m ? parseFloat(m[1]) : null; };
    const tpnOrder = () => { setField('Current weight', 2000); fillRequired(120);
      setField('Volume(mL/day)', 120); setField('Dextrose final', 10); setField('Amino acid', 2); };

    eq('D.NEWBORN_DEAD_VOL_ML = 30', D.NEWBORN_DEAD_VOL_ML, 30);
    const def = (p) => (typeof D.defaultDeadVolFor === 'function' ? D.defaultDeadVolFor(p) : undefined);
    for (const bed of ['NICU 5', 'iso 3-2', 'SCN 12', '', 'Ward X (free text)']) {
      eq(`bed "${bed}" → 30 mL`, def({ currentBed: bed }), 30);
    }
    eq('no patient → 30 mL', def(null), 30);

    const log = logger();
    mount({ patient: pt('DV-2000', 2000), onLog: log.onLog });
    eq('a new NICU order starts at 30 mL', deadVal(), 30);
    tpnOrder();
    near('prepared = delivered 120 + 30 = 150 mL/day', prepared(), 150, 1);
    ok('Factor = 2 kg × 1.25 overfill = 2.5', /Factor\s*2\.5\s*= 2 kg × 1\.25 overfill/.test(text(container)), text(container).match(/Factor[^o]*overfill/));
    near('amino acid in the bag scales with it: 2 g/kg × 2.5 = 5 g → 50 mL', aaVolume(), 50, 1);
    await save();
    eq('saved calcInput.deadVol_mL = 30', log.entry && log.entry.calcInput.deadVol_mL, 30);
    ok('print: 150 mL prepared · ปริมาตรคาสาย 30 mL', /150 mL \(Prepared Vol\.\)/.test(printText()) && /ปริมาตรคาสาย 30 mL/.test(printText()),
      printText().match(/Total Volume:[^F]*/));

    mount({ patient: pt('DS-2000', 2000, { currentBed: 'SCN 12' }), onLog: logger().onLog });
    eq('a new SCN order starts at 30 mL', deadVal(), 30);
    tpnOrder();
    click(deadChip('0'));
    eq('the 0 chip still overrides it', deadVal(), 0);
    near('…prepared = delivered, 120 mL/day', prepared(), 120, 1);

    // A new day borrows yesterday's order. Yesterday's 0 was the old default,
    // so it becomes 30; a dead space somebody set is carried.
    for (const [yd, want] of [[0, 30], [undefined, 30], [20, 20], [30, 30]]) {
      const y = { entryId: 'e-y', ts: '2026-09-17', dol: 1, weight: 2000,
        calcInput: { curWtG: 2000, totalTPN_mL: 120, dexPct: 10, aaPerKg: 2, ...(yd === undefined ? {} : { deadVol_mL: yd }) } };
      mount({ patient: pt('DY-2000', 2000), dol: 2, baselineEntry: y, previousEntry: y, onLog: logger().onLog });
      eq(`new day after ${yd === undefined ? 'a legacy order (no dead space)' : `a ${yd} mL order`} → ${want} mL`, deadVal(), want);
    }

    // A saved order is the record: it reopens with its own dead space and prints unchanged.
    const saved0 = { entryId: 'e-s0', lastModified: 'lm-s0', ts: '2026-09-18', dol: 1, weight: 2000, ioInput: 150, ioOutput: 60, drainContent: 0,
      calcInput: { curWtG: 2000, fluidTargetPerKg: 120, otherIV_mL: 0, drug_mL: 0, ioInput: 150, ioOutput: 60, drainContent: 0,
        totalTPN_mL: 120, deadVol_mL: 0, dexPct: 15, aaPerKg: 2, lipidPerKg: 2 } };   // IV NPE:AA 24 — no critical stop
    mount({ patient: pt('DR-2000', 2000), editEntry: saved0, onLog: logger().onLog });
    eq('fixture: no critical alert', alertRows().filter(a => a.level === 'crit').map(a => a.title), []);
    eq('a saved 0 mL order reopens at 0', deadVal(), 0);
    ok('…printable as saved: 120 mL prepared', !!printForm() && /120\.0 mL \(Delivered Vol\.\) \/ 120 mL \(Prepared Vol\.\)/.test(printText()),
      printText().match(/Total Volume:[^F]*/));

    // No TPN, no bag: the default must not turn a feeds-only day into a 30 mL
    // bag of water, vitamins and heparin on the pharmacy form.
    const logF = logger();
    mount({ patient: pt('DF-2000', 2000), dol: 10, onLog: logF.onLog });
    setField('Current weight', 2000); fillRequired(150);
    selectFeed('BM_20'); setField('Volume(mL/feed)', 30); setField('Frequency', 8);
    eq('feeds only: the field still shows the ward default', deadVal(), 30);
    near('…but nothing is prepared: 0 mL/day', prepared(), 0, 1);
    await save();
    ok('…and the printed form asks for no bag', !!printForm() && /— mL \(Prepared Vol\.\)/.test(printText()) && !/ปริมาตรคาสาย 30/.test(printText()),
      printText().match(/Total Volume:[^F]*/));
    ok('…no heparin volume either', /7\. Heparin \(100 unit\/mL\)1 unit\/mL = — mL\/day/.test(printText()), printText().match(/7\. Heparin[^0-9]*[\d.]+ unit\/mL = [^ ]+ mL\/day/));

    // Center Point's entry is a newborn-ward order too.
    mount({ patient: pt('DC-2000', 2000, { currentBed: '' }),
      centerPoint: { save() { return Promise.resolve({ sourceRecordId: 'DC-2000', recordedAt: '2026-09-18T01:00:00.000Z' }); }, review() {}, failed() {} } });
    eq('Center Point entry starts at 30 mL', deadVal(), 30);

    // A future older-children ward decides its own default (gate stubbed).
    const realDefault = D.defaultDeadVolFor;
    D.defaultDeadVolFor = () => 0;
    try {
      mount({ patient: pt('DO-2000', 2000, { currentBed: 'future ward' }), onLog: logger().onLog });
      eq('a ward whose default is 0 starts at 0', deadVal(), 0);
    } finally { D.defaultDeadVolFor = realDefault; }
  });

  // ═══════════════════════ Soluvit / Peditrace × Factor ═════════════════════
  await section('§11 Soluvit and Peditrace scale with the overfill, so the infant gets the full 1 mL/kg (Praew: "1. yes")', async () => {
    // The KCMH sheet doses them on actual weight (G43/G45 × C6), so an
    // overfilled bag delivered only delivered ÷ prepared of them — 80 % on a
    // 120 mL day once every NICU/SCN order started with 30 mL dead space.
    const readout = (label) => {
      const row = [...container.querySelectorAll('div')].find(d => d.firstElementChild?.tagName === 'SPAN' && d.firstElementChild.textContent === label);
      return row ? parseFloat(row.children[1]?.textContent) : null;
    };
    const tpn = (wtG, ml) => { setField('Current weight', wtG); fillRequired(120);
      setField('Volume(mL/day)', ml); setField('Dextrose final', 10); setField('Amino acid', 2); setField('SMOF Lipid', 2); };

    const log = logger();
    mount({ patient: pt('VT-2000', 2000), onLog: log.onLog });
    tpn(2000, 120);                                  // + 30 mL dead space → prepared 150, overfill 1.25
    near('Soluvit in the bag = 1 mL/kg × 2 kg × 1.25 = 2.5 mL', readout('Soluvit N (water-sol.)'), 2.5, 1);
    near('Peditrace in the bag = 2.5 mL', readout('Peditrace'), 2.5, 1);
    ok('the "not overfill-scaled" info line is gone', !alertTitles().some(t => /overfill-scaled/i.test(t)), alertTitles());
    await save();
    const t = printText();
    ok('print: Soluvit N 2.5 mL/day, × Factor → delivers 2 mL', /Soluvit N2\.5 mL\/day/.test(t) && /Soluvit N 1 mL\/kg\/day[^×]*× Factor → delivers 2 mL/.test(t),
      t.match(/5\. Multivitamin.{0,160}/));
    ok('print: Peditrace 2.5 mL/day, × Factor → delivers 2 mL', /\(Zn 250 µg\/mL\)2\.5 mL\/day/.test(t) && /Peditrace 1 mL\/kg\/day[^×]*× Factor → delivers 2 mL/.test(t),
      t.match(/6\. Trace Element.{0,160}/));
    // D50W 30 + AA 50 + heparin 1.5 + Soluvit 2.5 + Peditrace 2.5 = 86.5 mL; WFI 150 − 86.5 = 63.5
    ok('the bag make-up counts the scaled amounts: components 86.5 + WFI 63.5 = 150 mL',
      /Components 86\.5 mL \+ WFI 63\.5 mL = 150 mL prepared/.test(t), t.match(/Components [^=]*= [\d.]+ mL prepared/));
    copied = null;
    await clickAsync([...container.querySelectorAll('button')].find(b => /Copy Order/.test(b.textContent)));
    ok('copied order: "Soluvit N: 2.5 mL/day → aqueous bag (× Factor — delivers 2.00 mL)"',
      /Soluvit N:\s+2\.5 mL\/day → aqueous bag \(× Factor — delivers 2\.00 mL\)/.test(copied || ''), (copied || '').match(/Soluvit N:[^\n]*/));

    // No overfill, nothing to scale: 1 mL/kg as before.
    mount({ patient: pt('VN-2000', 2000), onLog: logger().onLog });
    tpn(2000, 120); setField('ปริมาตรคาสาย', 0);
    near('dead space 0: Soluvit 2 mL', readout('Soluvit N (water-sol.)'), 2, 1);
    near('dead space 0: Peditrace 2 mL', readout('Peditrace'), 2, 1);

    // The caps are on what the infant receives (10 / 15 mL a day), then scaled.
    mount({ patient: pt('VC-12000', 12000, { weights: [{ dol: 1, w: 12000 }] }), onLog: logger().onLog });
    tpn(12000, 600);                                 // prepared 630, overfill 1.05
    near('Soluvit capped at 10 mL delivered → 10.5 mL in the bag', readout('Soluvit N (water-sol.)'), 10.5, 1);
    near('Peditrace 12 mL delivered (under its 15 cap) → 12.6 mL in the bag', readout('Peditrace'), 12.6, 1);
  });

  act(() => { root.unmount(); });
  console.log(`\nWARD REQUESTS 2026-09-18: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
