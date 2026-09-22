// verify-tpn-team-0922.cjs — the KCMH TPN team's feedback on the live
// calculator, forwarded by Praew on 2026-09-22 as screenshots, and her rule for
// every number on screen that came in the same session.
//
//   §1   Zinc. "ขอให้เพิ่มช่อง ใส่ Zinc … ให้โปรแกรมคำนวณและแสดง Total Zinc intake
//        (รวมจาก Zinc ใน Peditrace + Additional Zinc) … กำหนด Maximum Zinc 5 mg/day
//        … ถ้าเกิน 5 mg/day ให้ขึ้นเตือน และถามว่า ยืนยันการสั่งหรือไม่?" Praew: entered
//        in mg/kg/day, as the KCMH paper form's "ZnSO₄ (Additional to the above)"
//        line has a per-kg and a total-per-day column. The total is elemental zinc
//        reaching the infant: Peditrace 0.25 mg/mL × the mL delivered, plus ZnSO₄.
//        Above 5 mg/day it is a critical alert — confirm + reason on Save.
//   §2   "ตรงหมวด Lipid ยังไม่แสดง rate drip ในหน่วย g/kg/hr" — g/kg/d ÷ hours.
//   §3   "Trophic feed … ขึ้นข้อความว่าไม่นำไปคิด nutrient intakes แต่ … โปรแกรมยังเอาไป
//        คิดอยู่" — not reproduced: since 2026-09-18 a MEN feed is in no total
//        (verify-ward-requests-0918 §1). What was missing is a word beside the
//        totals themselves, so Step 3 now says it there.
//   §4   "ช่อง Glycophos ขอให้เพิ่มช่องแสดง mL ของ Glycophos คู่ไปด้วย" — the mL/day
//        sits beside the mEq Na/day, at the same size.
//   §5   Osmolarity over the peripheral limit was already a critical alert; the
//        Save stop now asks "ยืนยันการสั่งหรือไม่?" and the form says
//        "แพทย์ยืนยันคำสั่ง" above the (unchanged) critical-value heading.
//   §6   "อยากให้มีชื่อหมอที่ key จะได้ติดต่อเวลามีปัญหา" — the saver's name is saved
//        with the order and printed at the top of the form. A reprint showed only
//        the email. A name is shown only while it belongs to the email the server
//        stamped on the row.
//   §7   "ให้แสดงค่าความเข้มข้นของ K ในสารละลายสุดท้ายด้วย" — its own tile. Praew: the
//        stop stays at 40 mEq/L (KCMH worksheet G25) on both routes; the alert shows
//        peripheral 60 / central 200 for reference.
//   §8   Praew: "ถ้ามีเลขใดๆ ที่เป็น user interface ห้ามมี .0 เช่น 18.0 คือ 18" — no
//        trailing zero and no float noise anywhere a person reads a number: the
//        calculator, the pharmacy form, the copied order, the daily log.
//
// Mounts the real <Calculator> and <DailyLog> in jsdom (same dev-only deps as
// the other calculator harnesses — see test/README.md). Fails against 6ee2762.
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
const toasts = [];
global.showToast = (msg, type) => toasts.push({ msg, type });
window.print = () => {};
window.confirm = () => true;
let copied = null;
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
  const row = saltRow(label);
  return row ? row.querySelector('input') : null;
}
const saltRow = (label) => [...container.querySelectorAll('.salt-row-grid')]
  .find(d => d.firstElementChild?.firstElementChild?.textContent.startsWith(label)) || null;
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
const button = (re) => [...container.querySelectorAll('button')].find(b => re.test(b.textContent.trim())) || null;
const saveBtn = () => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'บันทึก' || /กำลังบันทึก/.test(b.textContent));
const fillRequired = (tf) => ['Target fluid', 'Other IV', 'Drug volume', 'Input', 'Urine output', 'Drain content']
  .forEach(l => setField(l, l === 'Target fluid' ? tf : 0));
const alertRows = () => [...container.querySelectorAll('.calc-bottom .alert-row')].map(a => ({
  level: ['crit', 'warn', 'info'].find(c => a.classList.contains(c)),
  title: a.querySelector('.title')?.textContent || '', text: a.textContent.replace(/\s+/g, ' ') }));
const alertTitles = () => alertRows().map(a => a.title);
const alertOf = (title) => alertRows().find(a => a.title === title) || null;
const tileEl = (label) => [...container.querySelectorAll('.metric')].find(x => x.querySelector('.lbl')?.textContent === label) || null;
const tileVal = (label) => { const t = tileEl(label); return t ? t.querySelector('.val').textContent : null; };
const tileStatus = (label) => { const t = tileEl(label); return t ? (t.className.match(/s-(\w+)/) || [])[1] : null; };
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const printForm = () => container.querySelector('#print-form');
const printText = () => text(printForm());
const lipidHours = (h) => click([...container.querySelectorAll('.seg button')].find(b => b.textContent.trim() === `${h}h`));

const BASE = { dol: 1, editEntry: null, baselineEntry: null, previousEntry: null, logDate: '2026-09-22',
  userLabel: 'Dr Test (doc@kcmh.test)', onUpdate() { return Promise.resolve({ ok: true, lastModified: 'lm-u' }); },
  onSaved() {}, onWeightChange() {} };
function mount(props) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear();
  copied = null;
  act(() => { root.render(React.createElement(window.Calculator, { ...BASE, ...props })); });
  act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
}
function logger() {
  const box = { entry: null, calls: 0 };
  box.onLog = (e) => { box.entry = e; box.calls++; return Promise.resolve({ ok: true, entryId: 'e-' + box.calls, lastModified: 'lm-' + box.calls }); };
  return box;
}
// Save through the critical-value stop; returns the text the stop showed.
async function save(reason = 'fixture — attending aware') {
  let shown = null;
  window.prompt = (msg) => { shown = msg; return reason; };
  await clickAsync(saveBtn());
  return shown;
}
async function copyOrder() {
  copied = null;
  await clickAsync(button(/Copy Order to Clipboard/));
  return copied || '';
}
// Synthetic infants only (no real identifiers); NICU bed → a new order starts at 30 mL dead space.
const pt = (sid, bw, extra) => ({ sessionId: sid, name: sid.slice(0, 2), bw, currentBed: 'NICU 5', diagnosis: '-',
  weights: [{ dol: 1, w: bw }], admissionDate: '2026-09-22', ...extra });

// A 2 kg infant, TPN 180 mL/d delivered, Peditrace at its default 1 mL/kg/d.
function baseOrder({ dead = 0, tpnMl = 180 } = {}) {
  setField('Current weight', 2000); fillRequired(120);
  setField('Volume(mL/day)', tpnMl); setField('ปริมาตรคาสาย', dead);
  setField('Dextrose final', 10); setField('Amino acid', 2); setField('SMOF Lipid', 2);
}

(async () => {
  // ═══════════════════════════════ §1 Zinc ═════════════════════════════════
  await section('§1 ZnSO₄ mg Zn/kg/d: a total with Peditrace, a 5 mg/day stop, saved and printed', async () => {
    const log = logger();
    mount({ patient: pt('ZN-2000', 2000), onLog: log.onLog });
    baseOrder();
    ok('Step 5 has a ZnSO₄ field', !!inputFor('ZnSO₄'));
    const field = [...container.querySelectorAll('.field')].find(d => d.querySelector('label')?.textContent.startsWith('ZnSO₄'));
    ok('…in mg of elemental Zn per kg per day', /mg Zn\/kg\/d/.test(text(field?.querySelector('label'))), text(field?.querySelector('label')));
    const total = () => text(container.querySelector('.zn-total'));
    // Peditrace alone: 1 mL/kg × 2 kg = 2 mL delivered × 0.25 mg/mL = 0.5 mg/day.
    ok('with no ZnSO₄ the total is Peditrace\'s 0.5 mg/day', /0\.5 mg\/day/.test(total()), total());
    setField('ZnSO₄', 0.15);
    // + 0.15 mg/kg/d × 2 kg = 0.3 mg/day → 0.8 mg/day = 0.4 mg/kg/d.
    ok('ZnSO₄ 0.15 mg/kg/d: total 0.8 mg/day', /0\.8 mg\/day/.test(total()), total());
    ok('…= 0.4 mg/kg/d', /0\.4 mg\/kg\/d/.test(total()), total());
    ok('…itemised: Peditrace 0.5 + ZnSO₄ 0.3', /Peditrace 0\.5/.test(total()) && /ZnSO₄ 0\.3/.test(total()), total());
    ok('…against the 5 mg/day maximum', /max 5 mg\/day/.test(total()), total());
    setChk('Peditrace', false);
    ok('Peditrace unticked: the total is the ZnSO₄ alone, 0.3 mg/day', /0\.3 mg\/day/.test(total()), total());
    setChk('Peditrace', true);

    const TITLE = 'Zinc total above 5 mg/day';
    setField('ZnSO₄', 2.25);   // 4.5 + 0.5 = exactly 5
    ok('exactly 5 mg/day: no zinc alert', !alertOf(TITLE), alertTitles());
    setField('ZnSO₄', 2.3);    // 4.6 + 0.5 = 5.1
    const a = alertOf(TITLE);
    ok('5.1 mg/day: a critical alert', !!a && a.level === 'crit', alertRows());
    ok('…naming the total and the maximum', !!a && /5\.1 mg\/day/.test(a.text) && /5 mg\/day/.test(a.text), a && a.text);
    let shown = null;
    window.prompt = (msg) => { shown = msg; return null; };
    await clickAsync(saveBtn());
    eq('Save asks first — cancelled, nothing saved', log.calls, 0);
    ok('…the stop lists the zinc alert', (shown || '').includes(TITLE), shown);
    ok('…and asks "ยืนยันการสั่งหรือไม่?"', /ยืนยันการสั่งหรือไม่\?/.test(shown || ''), shown);
    shown = await save('fixture — zinc loss from a stoma');
    eq('with a reason it saves', log.calls, 1);
    ok('…and the form prints the override', /Zinc total above 5 mg\/day/.test(printText()) && /แพทย์ยืนยันคำสั่ง/.test(printText()), printText().slice(0, 400));
  });

  await section('§1b ZnSO₄ is saved, diffed, compounded × Factor, printed and copied', async () => {
    const log = logger();
    const previousEntry = { entryId: 'e-prev', ts: '2026-09-21', dol: 1, weight: 2000,
      calcInput: { curWtG: 2000, totalTPN_mL: 180, deadVol_mL: 30, dexPct: 10, aaPerKg: 2, lipidPerKg: 2 } };
    mount({ patient: pt('ZB-2000', 2000), onLog: log.onLog, previousEntry });
    baseOrder({ dead: 30 });
    setField('ZnSO₄', 0.15);
    await save();
    eq('calcInput.znPerKg is the dose as ordered', log.entry && log.entry.calcInput.znPerKg, 0.15);
    const changes = text(container.querySelector('.order-changes'));
    ok('"changes vs previous order" lists ZnSO₄ 0 → 0.15', /ZnSO₄: 0 → 0\.15 mg Zn\/kg\/d/.test(changes), changes);
    const form = printText();
    // Factor = 2 kg × (180 + 30) / 180; in the bag 0.15 × 2 × 7/6 = 0.35 mg.
    ok('the form has the paper form\'s ZnSO₄ (additional) line', /ZnSO₄ \(Additional to the above\)/.test(form), form.match(/6\. Trace Element.{0,300}/));
    ok('…per kg 0.15 mg Zn', /0\.15 mg Zn\/kg/.test(form), form.match(/ZnSO₄.{0,160}/));
    ok('…in the bag 0.35 mg Zn (× Factor)', /0\.35 mg Zn/.test(form), form.match(/ZnSO₄.{0,160}/));
    ok('…and the delivered total, 0.8 mg/day', /Zn รวม 0\.8 mg\/day/.test(form), form.match(/Zn รวม.{0,60}/));
    const copy = await copyOrder();
    ok('the copied order has the ZnSO₄ line', /ZnSO₄:\s+0\.15 mg Zn\/kg → 0\.35 mg Zn in bag/.test(copy), copy.match(/ZnSO₄[^\n]*/));
    ok('…and the zinc total', /Zn total 0\.8 mg\/day/.test(copy), copy.match(/Zn total[^\n]*/));

    mount({ patient: pt('ZV-2000', 2000), onLog: logger().onLog });
    setField('Current weight', 2000); fillRequired(120);
    setField('Volume(mL/day)', 0); setField('ZnSO₄', 0.15);
    ok('ZnSO₄ with no TPN volume is a bag with no volume', /ZnSO₄/.test(text(container.querySelector('.zero-volume-bag'))),
      text(container.querySelector('.zero-volume-bag')));

    mount({ patient: pt('ZC-2000', 2000), centerPoint: { save() { return Promise.resolve({}); }, review() {}, failed() {} } });
    ok('Center Point has no ZnSO₄ field (its packet has no slot)', !inputFor('ZnSO₄'));
  });

  // ═══════════════════════════ §2 Lipid g/kg/h ═════════════════════════════
  await section('§2 the lipid pump shows its rate in g/kg/h', async () => {
    mount({ patient: pt('LP-2000', 2000), onLog: logger().onLog });
    baseOrder();
    const rate = () => text(container.querySelector('.lipid-gkgh'));
    ok('2 g/kg/d over 24 h = 0.083 g/kg/h', /0\.083 g\/kg\/h/.test(rate()), rate());
    lipidHours(20);
    ok('…over 20 h = 0.1 g/kg/h', /(^|[^\d.])0\.1 g\/kg\/h/.test(rate()), rate());
    lipidHours(16);
    ok('…over 16 h = 0.125 g/kg/h', /0\.125 g\/kg\/h/.test(rate()), rate());
    lipidHours(20);
    await save();
    ok('the form\'s lipid pump line has it', /Lipid pump rate.{0,120}0\.1 g\/kg\/h/.test(printText()), printText().match(/Lipid pump rate.{0,140}/));
    const copy = await copyOrder();
    ok('…and so does the copied order', /Lipid bag:[^\n]*0\.1 g\/kg\/h/.test(copy), copy.match(/Lipid bag:[^\n]*/));
    setField('SMOF Lipid', 0);
    ok('no lipid: no rate', !container.querySelector('.lipid-gkgh'));
  });

  // ═══════════════════════════ §3 MEN, said where the totals are ═══════════
  await section('§3 a MEN feed is named beside the Step 3 totals it is left out of', async () => {
    mount({ patient: pt('MN-2000', 2000), onLog: logger().onLog });
    baseOrder();
    selectFeed('BM_20'); setField('Volume(mL/feed)', 5); setField('Frequency', 8);
    setChk('MEN', true);
    const note = () => container.querySelector('.men-note');
    ok('MEN ticked with a feed: a note under the tiles', !!note());
    ok('…saying the MEN feed is not counted', /MEN/.test(text(note())) && /ไม่นับ/.test(text(note())), text(note()));
    const tiles = container.querySelector('.metric-tiles-4');
    ok('…right after the Step 3 tiles', !!tiles && !!note() && tiles.nextElementSibling === note(), text(tiles?.nextElementSibling));
    setChk('MEN', false);
    ok('MEN unticked: no note', !note());
    setChk('MEN', true); setField('Volume(mL/feed)', 0);
    ok('MEN ticked with no feed volume: no note', !note());
  });

  // ═══════════════════════════ §4 Glycophos mL ═════════════════════════════
  await section('§4 Glycophos shows its mL/day beside its mEq Na/day', async () => {
    mount({ patient: pt('GP-2000', 2000), onLog: logger().onLog });
    baseOrder();
    const right = () => text(saltRow('Glycophos')?.lastElementChild);
    setField('Glycophos', 3);   // 3 mEq Na/kg = 1.5 mL/kg; × 2 kg
    ok('3 mEq Na/kg/d on 2 kg: = 6 mEq Na', /= 6 mEq Na/.test(right()), right());
    ok('…and = 3 mL/d beside it', /= 3 mL\/d/.test(right()), right());
    setField('Glycophos', 1);
    ok('1 mEq Na/kg/d: = 2 mEq Na and = 1 mL/d', /= 2 mEq Na/.test(right()) && /= 1 mL\/d/.test(right()), right());
    setField('20% NaCl', 2);
    const naCl = text(saltRow('20% NaCl')?.lastElementChild);
    ok('NaCl\'s row keeps its one line (= 4 mEq, no mL)', /= 4 mEq/.test(naCl) && !/mL/.test(naCl), naCl);
  });

  // ═══════════════════════════ §5 Confirm wording ══════════════════════════
  await section('§5 osmolarity over the peripheral limit: "ยืนยันการสั่งหรือไม่?" and "แพทย์ยืนยันคำสั่ง"', async () => {
    const log = logger();
    mount({ patient: pt('OP-2000', 2000), onLog: log.onLog });
    baseOrder();
    // D12.5 + AA 3 g/kg in 180 mL: 625 + 333 = 958 mOsm/L. SMOF 3 keeps IV NPE:AA ≥ 20.
    setField('Dextrose final', 12.5); setField('Amino acid', 3); setField('SMOF Lipid', 3);
    click(button(/^Peripheral$/));
    eq('the only critical alert is osmolarity', alertRows().filter(a => a.level === 'crit').map(a => a.title), ['Osmolarity > peripheral limit']);
    const shown = await save('fixture — central line tomorrow');
    ok('the Save stop asks "ยืนยันการสั่งหรือไม่?"', /ยืนยันการสั่งหรือไม่\?/.test(shown || ''), shown);
    ok('…still says the reason prints on the TPN form, with no name or HN', /พิมพ์ลงใบสั่ง TPN/.test(shown || '') && /ห้ามใส่ชื่อหรือ HN/.test(shown || ''), shown);
    eq('saved', log.calls, 1);
    // Settled in the app, recorded for pharmacy on the back (Praew: "อะไรจะ
    // alert ให้คุยให้เสร็จใน app"); the doctor's page carries no alert text.
    const form = text(printForm()?.querySelector('.print-back'));
    ok('the back page says "แพทย์ยืนยันคำสั่ง"', /แพทย์ยืนยันคำสั่ง/.test(form), form.slice(0, 500));
    ok('…above the critical-value heading, which is unchanged', form.indexOf('แพทย์ยืนยันคำสั่ง') >= 0 && form.indexOf('แพทย์ยืนยันคำสั่ง') < form.indexOf('สั่งทั้งที่มีค่าวิกฤต: Osmolarity > peripheral limit'), form.slice(0, 500));
    ok('…with the reason', form.includes('เหตุผล: fixture — central line tomorrow'), form.slice(0, 500));
    const frontEl = printForm()?.cloneNode(true);
    frontEl?.querySelector('.print-back')?.remove();
    ok('the front page does not repeat it', !!frontEl && !/สั่งทั้งที่มีค่าวิกฤต|แพทย์ยืนยันคำสั่ง/.test(text(frontEl)), text(frontEl).slice(0, 300));
  });

  // ═══════════════════════════ §6 Who saved it ═════════════════════════════
  await section('§6 the saver\'s name is saved with the order and printed at the top', async () => {
    const log = logger();
    mount({ patient: pt('SB-2000', 2000), onLog: log.onLog });
    baseOrder();
    await save();
    eq('calcInput.savedByLabel is the saver\'s "Name (email)"', log.entry && log.entry.calcInput.savedByLabel, 'Dr Test (doc@kcmh.test)');
    const top = text(container.querySelector('#print-form .print-saved-by'));
    ok('the back page names the saver, with time and revision', /Dr Test \(doc@kcmh\.test\)/.test(top) && /ฉบับที่/.test(top), top);
    ok('the front names the doctor at "แพทย์", where the paper form asks',
      /Dr Test \(doc@kcmh\.test\)/.test(text(container.querySelector('#print-form .print-doctor'))), text(container.querySelector('#print-form .print-doctor')));
    ok('the Save card names the saver too', /Dr Test \(doc@kcmh\.test\)/.test(text(container.querySelector('.saved-by'))), text(container.querySelector('.saved-by')));

    const row = (id, extra, ci) => ({ entryId: id, lastModified: '2026-09-22T03:00:00.000Z', ts: '2026-09-22', dol: 1, weight: 2000,
      ioInput: 150, ioOutput: 60, drainContent: 0, submittedBy: 'first@kcmh.test', ...extra,
      calcInput: { curWtG: 2000, fluidTargetPerKg: 120, otherIV_mL: 0, drug_mL: 0, ioInput: 150, ioOutput: 60, drainContent: 0,
        totalTPN_mL: 180, deadVol_mL: 0, dexPct: 10, aaPerKg: 2, lipidPerKg: 2, aaProduct: 'aminoven10',
        constantsVersion: D.CONSTANTS_VERSION, tpnWtG: 2000, ...ci } });
    const shownBy = () => text(container.querySelector('#print-form .print-saved-by'));
    mount({ patient: pt('SR-2000', 2000), onLog: logger().onLog,
      editEntry: row('e-a', { lastModifiedBy: 'a@kcmh.test' }, { savedByLabel: 'Dr A (a@kcmh.test)' }) });
    ok('reopened: prints the saved name', /Dr A \(a@kcmh\.test\)/.test(shownBy()), shownBy());
    mount({ patient: pt('SR-2000', 2000), onLog: logger().onLog,
      editEntry: row('e-b', { lastModifiedBy: 'b@kcmh.test' }, { savedByLabel: 'Dr A (a@kcmh.test)' }) });
    ok('a name for another email than the row\'s: the email only', /b@kcmh\.test/.test(shownBy()) && !/Dr A/.test(shownBy()), shownBy());
    mount({ patient: pt('SR-2000', 2000), onLog: logger().onLog,
      editEntry: row('e-c', { lastModifiedBy: 'c@kcmh.test' }, {}) });
    ok('a row saved before names were: the email, as before', /c@kcmh\.test/.test(shownBy()), shownBy());
    mount({ patient: pt('SR-2000', 2000), onLog: logger().onLog,
      editEntry: row('e-d', {}, { savedByLabel: 'Dr First (FIRST@kcmh.test)' }) });
    ok('no lastModifiedBy: checked against submittedBy, case-insensitively', /Dr First/.test(shownBy()), shownBy());
  });

  // ═══════════════════════════ §7 K⁺ in the bag ════════════════════════════
  await section('§7 K⁺ concentration of the bag has its own tile; the stop stays at 40 mEq/L', async () => {
    const log = logger();
    mount({ patient: pt('KC-2000', 2000), onLog: log.onLog });
    baseOrder();
    setField('KCl', 2);   // 4 mEq in 180 mL = 22 mEq/L
    eq('KCl 2 mEq/kg in 180 mL: the tile reads 22', tileVal('K⁺ in bag'), '22 mEq/L');
    eq('…within range', tileStatus('K⁺ in bag'), 'ok');
    ok('…no concentration alert', !alertOf('K⁺ concentration too high'), alertTitles());
    setField('Volume(mL/day)', 100); setField('KCl', 2.75);   // 5.5 mEq in 100 mL = 55 mEq/L
    eq('KCl 2.75 in 100 mL: 55 mEq/L', tileVal('K⁺ in bag'), '55 mEq/L');
    eq('…critical', tileStatus('K⁺ in bag'), 'crit');
    const a = alertOf('K⁺ concentration too high');
    ok('…the alert is critical and keeps its title', !!a && a.level === 'crit', alertRows());
    ok('…it says 55 against the 40 mEq/L limit', !!a && /55 mEq\/L/.test(a.text) && /40 mEq\/L/.test(a.text), a && a.text);
    ok('…with peripheral 60 / central 200 for reference', !!a && /peripheral 60/.test(a.text) && /central 200/.test(a.text), a && a.text);
    ok('under the tile: the limit and the references', /40/.test(text(container.querySelector('.k-conc-ref'))) && /60/.test(text(container.querySelector('.k-conc-ref'))) && /200/.test(text(container.querySelector('.k-conc-ref'))), text(container.querySelector('.k-conc-ref')));
    const shown = await save('fixture — hypokalaemia, fluid restricted');
    ok('Save stops on it', (shown || '').includes('K⁺ concentration too high'), shown);
    eq('…and saves with a reason', log.calls, 1);
  });

  // ═══════════════════ §8 no trailing zero, no float noise ═════════════════
  // A decimal ending in 0 ("18.0", "1.40", "2.000") or a float tail ("3.0000000000000004").
  const TRAILING_ZERO = /(?<![\d.])\d+\.\d*0(?!\d)/g;
  const FLOAT_NOISE = /\d\.\d{5,}/g;
  const badNumbers = (s) => [...(s.match(TRAILING_ZERO) || []), ...(s.match(FLOAT_NOISE) || [])];
  // Text node by text node: adjacent elements' textContent runs together
  // ("6.2" + "0 mL" reads "6.20"), which would invent failures.
  const badNumbersIn = (el) => {
    const out = [], walker = document.createTreeWalker(el, window.NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const bad of badNumbers(node.nodeValue)) out.push(`${bad} in "${node.nodeValue.trim().slice(0, 60)}"`);
    }
    return out;
  };
  await section('§8 no number a person reads ends in .0 (Praew, 2026-09-22)', async () => {
    const log = logger();
    mount({ patient: pt('TZ-2000', 2000), onLog: log.onLog });
    // Chosen to produce round figures: 2 kg (2.000), TPN 180 (180.0), a 28 mL
    // lipid bag over 20 h (1.40 mL/hr), Ca gluconate 9.0 mg/mL on the form.
    baseOrder({ dead: 30 });
    lipidHours(20);
    setField('20% NaCl', 2); setField('Glycophos', 2); setField('KCl', 2); setField('MgSO₄', 0.4);
    setField('10% Ca gluconate', 60); setField('ZnSO₄', 0.2);
    selectFeed('BM_20'); setField('Volume(mL/feed)', 5); setField('Frequency', 8);
    await save();
    ok('fixture: the order printed', !!printForm());
    const screen = container.cloneNode(true);
    screen.querySelector('#print-form')?.remove();
    eq('calculator screen', badNumbersIn(screen), []);
    const form = printForm().cloneNode(true);
    form.lastElementChild?.remove();   // the provenance footer: version strings, not quantities
    eq('pharmacy order form', badNumbersIn(form), []);
    const copy = await copyOrder();
    ok('fixture: the order copied', copy.length > 200, copy.length);
    eq('copied order', copy.split('\n').flatMap(l => badNumbers(l).map(b => `${b} in "${l.trim().slice(0, 60)}"`)), []);
    ok('the form prints the weight as 2, not 2.000', /Weight for calculation: 2 Kg/.test(printText()), printText().match(/Weight for calculation: \S+ Kg/));

    // The daily log, fed the float noise the live Sheet holds.
    act(() => { root.unmount(); }); root = ReactDOM.createRoot(container);
    const P = pt('DL-1200', 1200);
    const rows = [{ entryId: 'e-real', ts: '2026-09-21', dol: 8, weight: 1200, route: 'TPN central', status: 'submitted',
      fluid: 120.00000000000001, gir: 6.199999999999999, pro: 2.9999999999999996, kcal: 60.80000000000001,
      na: 3.0000000000000004, k: 2, ca: 59.99999999999999, p: 40 }];
    act(() => { root.render(React.createElement(window.DailyLog, { patient: P, log: { [P.sessionId]: rows }, dol: 8,
      onAddToday() {}, onEditEntry() {}, onDeleteEntry() {} })); });
    const tr = container.querySelector('table.tbl tbody tr');
    ok('fixture: the daily log rendered the row', !!tr);
    eq('daily log row', badNumbersIn(tr), []);
    // DOL · Day admit · Date · Weight · Fluid · GIR · Protein · Energy · Na / K · Ca / P
    const cell = (i) => text(tr?.querySelectorAll('td')[i]);
    eq('…protein 2.9999999999999996 reads 3 g/kg', cell(6), '3 g/kg');
    eq('…Na / K reads 3 / 2', cell(8), '3 / 2');
  });

  // ═══════════════════ §10 the printed order: two pages ════════════════════
  // Praew, 2026-09-22, looking at the printed form: "ช่องที่ถูกเลือกให้เป็นตัวหนา"
  // and "ค่าที่ขึ้น per kg มันไม่ตรงกับ Na เดี๋ยวจะสั่งผิด" — the per-kg and in-bag
  // cells stacked only the products ordered, so with no Na acetate Glycophos's
  // 1.5 mL sat on the Na acetate line and KCl's 2 mEq on K₂HPO₄'s. Then: "เอา
  // หน้าตาที่หมอสั่ง confirm เห็นเท่าเดิม · อะไรจะ alert ให้คุยให้เสร็จใน app ·
  // ส่วนของเภสัช … ปริ้นท์อีกหน้าด้านหลัง". So the front is the KCMH paper form,
  // one line per product, the ordered ones bold; the back is pharmacy's.
  await section('§10 front = the paper form, one line per product; back = pharmacy', async () => {
    const log = logger();
    mount({ patient: pt('PF-2000', 2000), onLog: log.onLog });
    baseOrder({ dead: 30 });
    lipidHours(20);
    setField('20% NaCl', 2); setField('Glycophos', 3); setField('KCl', 2); setField('MgSO₄', 0.4);
    setField('10% Ca gluconate', 60); setField('ZnSO₄', 0.15); setField('Vitamin D', 400);
    await save();
    const form = printForm();
    ok('fixture: the order printed', !!form);
    const back = form.querySelector('.print-back');
    ok('the form has a back page', !!back);
    eq('…which starts on a new sheet', back && back.style.pageBreakBefore, 'always');
    const frontEl = form.cloneNode(true);
    frontEl.querySelector('.print-back')?.remove();
    frontEl.lastElementChild?.remove();   // the provenance footer, which prints after the back
    const front = text(frontEl), backText = text(back);
    const rowOf = (root, label) => [...root.querySelectorAll('tr')].find(tr => text(tr.firstElementChild).includes(label)) || null;
    const cells = (root, label) => { const tr = rowOf(root, label); return tr ? [...tr.children].map(td => text(td)) : null; };
    const bold = (root, label) => { const td = rowOf(root, label)?.firstElementChild; return !!td && /^(700|bold)$/.test(window.getComputedStyle(td).fontWeight); };

    // The labels as Praew laid them out (2026-09-22): "NaCl, Na acetate โชว์แค่นี้
    // · Disodium … (Na = 2 mEq/mL, P = 31 mg/mL) เคาะลงมาบรรทัดล่าง · K₂HPO₄ …
    // เคาะลงมาบรรทัดล่าง · 3. MgSO₄ โชว์แค่นี้ · 4. Ca Gluconate โชว์แค่นี้".
    eq('NaCl: the name only', cells(frontEl, 'NaCl')?.[0], '☑ NaCl');
    eq('Na Acetate: the name only', cells(frontEl, 'Na Acetate')?.[0], '☐ Na Acetate');
    const secondLine = (label, rest) => {
      const td = rowOf(frontEl, label)?.firstElementChild;
      return !!td && new RegExp(`${label}\\s*<br[^>]*>\\s*(<[^>]+>)?\\s*${rest.replace(/[()]/g, '\\$&')}`).test(td.innerHTML);
    };
    ok('Disodium glycerophosphate: (Na = 2 mEq/mL, P = 31 mg/mL) on the next line', secondLine('Disodium glycerophosphate', '(Na = 2 mEq/mL, P = 31 mg/mL)'),
      rowOf(frontEl, 'Disodium glycerophosphate')?.firstElementChild?.innerHTML);
    ok('K₂HPO₄: (K 1 mEq/mL, P 15.5 mg/mL) on the next line', secondLine('K₂HPO₄', '(K 1 mEq/mL, P 15.5 mg/mL)'),
      rowOf(frontEl, 'K₂HPO₄')?.firstElementChild?.innerHTML);
    eq('3. MgSO₄: the name only', cells(frontEl, 'MgSO₄')?.[0], '3. Mg⁺⁺ ☑ MgSO₄');
    eq('4. Ca Gluconate: the name only', cells(frontEl, 'Ca Gluconate')?.[0], '4. Ca⁺⁺ ☑ Ca Gluconate');
    // MgSO₄ comes as 10% and 50%, and the mL is the chosen vial's: with the
    // strength off the label it goes beside the mL instead.
    ok('…MgSO₄\'s in-bag mL names the vial it is for', /= 1\.15 mL \(10%\)/.test(cells(frontEl, 'MgSO₄')?.[2] || ''), cells(frontEl, 'MgSO₄'));

    // Every figure on its product's own line. Factor = 2 × 210/180.
    eq('NaCl: 2 mEq per kg · 4.7 mEq = 1.4 mL in the bag', cells(frontEl, 'NaCl')?.slice(1, 3), ['2 mEq', '4.7 mEq = 1.4 mL']);
    eq('Na Acetate, not ordered: its own line, blank', cells(frontEl, 'Na Acetate')?.slice(1, 3), ['—', '—']);
    const gly = cells(frontEl, 'Disodium glycerophosphate');
    ok('Glycophos: 1.5 mL per kg on its own line, with Na 3 mEq and P 46.5 mg', !!gly && /^1\.5 mL/.test(gly[1]) && /Na 3 mEq/.test(gly[1]) && /P 46\.5 mg/.test(gly[1]), gly);
    eq('…3.5 mL in the bag', gly && gly[2], '3.5 mL');
    eq('Total Na: 5 mEq per kg', cells(frontEl, 'Total Na')?.[1], '5 mEq');
    eq('K₂HPO₄, not ordered: its own line, blank', cells(frontEl, 'K₂HPO₄')?.slice(1, 3), ['—', '—']);
    eq('KCl: 2 mEq per kg · 4.7 mEq = 2.3 mL in the bag', cells(frontEl, 'KCl')?.slice(1, 3), ['2 mEq', '4.7 mEq = 2.3 mL']);
    ok('ordered products are bold: NaCl, Glycophos, KCl, MgSO₄, Ca gluconate, Peditrace, ZnSO₄',
      ['NaCl', 'Disodium glycerophosphate', 'KCl', 'MgSO₄', 'Ca Gluconate', 'Peditrace', 'ZnSO₄'].every(l => bold(frontEl, l)),
      ['NaCl', 'Disodium glycerophosphate', 'KCl', 'MgSO₄', 'Ca Gluconate', 'Peditrace', 'ZnSO₄'].filter(l => !bold(frontEl, l)));
    ok('…and the ones not ordered are not: Na Acetate, K₂HPO₄, Addamel N', ['Na Acetate', 'K₂HPO₄', 'Addamel N'].every(l => rowOf(frontEl, l) && !bold(frontEl, l)));
    ok('the paper form\'s other choices are there, unticked', ['☐ 10% Amiparen', '☐ 8% Aminoleban', '☐ 7% Nephrosteril', '☐ 20% Intralipid', '☐ 20% Clinoleic', '☐ Addamel N', '8. Other'].every(s => front.includes(s)),
      ['☐ 10% Amiparen', '☐ 8% Aminoleban', '☐ 7% Nephrosteril', '☐ 20% Intralipid', '☐ 20% Clinoleic', '☐ Addamel N', '8. Other'].filter(s => !front.includes(s)));
    ok('the oral orders are under 8. Other', /8\. Other.*Vitamin D/.test(front), front.match(/8\. Other.{0,120}/));
    ok('the doctor\'s name is at "แพทย์", as on the paper form', /Dr Test \(doc@kcmh\.test\)/.test(text(frontEl.querySelector('.print-doctor'))), text(frontEl.querySelector('.print-doctor')));
    ok('the front carries no pharmacy working and no alert text',
      !/Factor:|WFI|Components|Lipid pump rate|สั่งทั้งที่มีค่าวิกฤต|เปลี่ยนแปลงจากคำสั่ง|DELIVERED/.test(front), front.match(/Factor:|WFI|Components|Lipid pump rate|สั่งทั้งที่มีค่าวิกฤต|เปลี่ยนแปลงจากคำสั่ง|DELIVERED/g));

    ok('the back has the Factor and the bag make-up', /Factor:/.test(backText) && /Components [\d.]+ mL \+ WFI [\d.]+ mL = 210 mL prepared/.test(backText), backText.slice(0, 300));
    ok('…the lipid pump rate', /Lipid pump rate/.test(backText));
    ok('…the K⁺ concentration of the bag', /K⁺ in bag 22 mEq\/L/.test(backText), backText.match(/K⁺ in bag.{0,30}/));
    ok('…who saved it, when, and the revision', /บันทึกโดย Dr Test \(doc@kcmh\.test\)/.test(text(back.querySelector('.print-saved-by'))), text(back.querySelector('.print-saved-by')));
    ok('…and names the infant, in case the sheets part', backText.includes('PF-2000'), backText.slice(0, 200));
  });

  // ═══════════════════ §11 the weight: grams in, 2 decimals out ═══════════
  // Praew, 2026-09-22: "น้ำหนักที่เอามาคิดใช้ น้ำหนักกรัมที่ได้ แต่คิดออกมาแล้วให้ทำเป็น
  // ทศนิยม 2 ตำแหน่ง" — every dose is computed from the exact grams; the kg
  // weight is shown to 2 decimals. A typed dose prints exactly as typed.
  await section('§11 1234 g: computed as 1.234 kg, shown as 1.23 kg', async () => {
    mount({ patient: pt('WT-1234', 1234), onLog: logger().onLog });
    setField('Current weight', 1234); fillRequired(120);
    setField('Volume(mL/day)', 150); setField('ปริมาตรคาสาย', 0);
    setField('Dextrose final', 10); setField('Amino acid', 2); setField('SMOF Lipid', 2);
    setField('ZnSO₄', 0.125);
    await save();
    const t = printText();
    ok('the form shows the weight as 1.23 Kg', /Weight for calculation: 1\.23 Kg/.test(t), t.match(/Weight for calculation: \S+ Kg/));
    // No dead space, so the Factor is the weight itself: 1.234 proves the grams.
    ok('…while the Factor is computed from 1234 g: 1.234', /Factor:1\.234 = weight/.test(t), t.match(/Factor:[^(]{0,40}/));
    ok('…and says the weight to 2 decimals where it names it', !/1\.234 kg/.test(t), t.match(/[\d.]+ kg ×/g));
    ok('a typed ZnSO₄ 0.125 prints as typed, unrounded', /0\.125 mg Zn\/kg/.test(t), t.match(/[\d.—]+ mg Zn\/kg/));
    ok('…and the Factor box on screen names 1.23 kg', /= 1\.23 kg/.test(text(container)) || !/1\.234 kg/.test(text(container)), text(container).match(/= [\d.]+ kg/g));
  });

  // ═══════════════════ the shared display helper ═══════════════════════════
  await section('§9 D.displayNum — the one rounding every display goes through', async () => {
    const cases = [
      [18, 1, '18'], [18.04, 1, '18'], [1.4, 2, '1.4'], [2, 3, '2'], [0.125, 3, '0.125'],
      [60.80000000000001, 2, '60.8'], [78.48387096774194, 2, '78.48'], [2.8581644815256255, 2, '2.86'],
      [2.9999999999999996, 2, '3'], [0.05, 1, '0.1'], [-0.04, 1, '0'], [-2.25, 1, '-2.3'], [2.25, 1, '2.3'],
      ['3.50', 1, '3.5'], [null, 1, '—'], [undefined, 1, '—'], ['', 1, '—'], [NaN, 1, '—'], [Infinity, 1, '—'],
    ];
    for (const [v, d, want] of cases) eq(`displayNum(${JSON.stringify(v)}, ${d})`, D.displayNum(v, d), want);
  });

  act(() => { root.unmount(); });
  console.log(`\nTPN TEAM 2026-09-22: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})();
