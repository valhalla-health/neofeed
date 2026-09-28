// verify-tpn-meeting-0928.cjs — group A of the TPN team's meeting on
// 2026-09-28 (BACKLOG.md § Now): the requests that change what the screen and
// the form show, and need no new number from the team. The item numbers are
// those of Praew's meeting notes.
//
//   §1   10  "เลี้ยงสาย เปลี่ยนเป็น 30/50/100" — the dead-space chips.
//   §2   11  "ส่วน Dextrose ตัด deliver, g in bag ออก" — the dextrose hint.
//   §3   14  "ตัด deliver, g in bag ออก (ห้อง TPN ใช้ vol ml เป็นหลัก)" — the AA row.
//   §4   15  "ตัด WFI จากหน้า interface แต่ยังอยู่ในใบปริ้น".
//   §5   16  "g/kg/hr เอาทศนิยมสองตำแหน่ง", "free text จำนวนชั่วโมงได้"; 18 "แก้เป็น
//            20% lipid". Praew's answers the same day: the pump rate stays at 2
//            decimals; hours 1–24 (kept to one decimal, as Center Point prints).
//   §6   19  "เปลี่ยนหน่วยให้เหมือนกัน เช่น P 15.5 mg/ml" — phosphate per mL; and
//            Praew: "ถึงผู้ป่วย + คาสาย ลบออกได้ เก็บเป็นเลขคำนวณไว้หลังบ้าน".
//   §7   25  "เปลี่ยนคำ over target ให้เข้าใจง่ายกว่านี้ ไม่สับสนกับเกินขวด".
//   §8    4  "ตัด nutrition status ออก"; 28 "เซ็นชื่อ (เอาเมลออก)" — the form.
//   §9    6  "แก้ HiQ LBW เป็น preterm formula, แก้ Pre Nan เป็น post discharge".
//
// Praew's answers to the team questions, 2026-09-28 (BACKLOG B · 16, 23 · 26):
//   §10  K⁺ in the bag by route: peripheral amber > 40, red > 60; central amber
//        > 60, red > 120, and above 200 not orderable ("K ทาง central ลดเป็น 120
//        ให้ขึ้นแดง แต่ max ที่ 200"); the KCMH 40 mEq/L stop is gone. Reviewing
//        this PR, Praew: "max 200 ทั้งสองสาย" — peripheral too (§10, §10b).
//   §11  "osmolarity ทาง central ไม่มี upper limit".
//   §12  "lipid เพดาน 0.13-0.17 g/kg/h": amber above 0.13, red above 0.17.
//   §13  "แสดง acetate ด้วย" — built, and hidden until the vial label gives acetate per mL.
//
// Mounts the real <Calculator> in jsdom (same dev-only deps as the other
// calculator harnesses — see test/README.md). Fails against 6269b88.
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
for (const f of ['icons.jsx', 'calculator.jsx']) {
  vm.runInThisContext(babel.transformSync(R(f), {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    filename: f, configFile: false, babelrc: false,
  }).code);
}

const container = document.getElementById('root');
let root = ReactDOM.createRoot(container);
const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
const fieldOf = (label) => [...container.querySelectorAll('.field')].find(d => d.querySelector('label')?.textContent.startsWith(label)) || null;
const saltRow = (label) => [...container.querySelectorAll('.salt-row-grid')]
  .find(d => d.firstElementChild?.firstElementChild?.textContent.startsWith(label)) || null;
function inputFor(label) {
  const field = fieldOf(label);
  if (field) return field.querySelector('input');
  const row = saltRow(label);
  return row ? row.querySelector('input') : null;
}
function setField(label, value) {
  const input = inputFor(label);
  if (!input) throw new Error('field not found: ' + label);
  act(() => { valueSetter.call(input, String(value)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
const blur = (input) => act(() => { input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })); });
const click = (el) => act(() => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const clickAsync = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const button = (re) => [...container.querySelectorAll('button')].find(b => re.test(b.textContent.trim())) || null;
const saveBtn = () => [...container.querySelectorAll('button')].find(b => ['Submit', 'บันทึก'].includes(b.textContent.trim()) || /กำลังบันทึก/.test(b.textContent));
const fillRequired = (tf) => ['Target fluid', 'Other IV', 'Drug volume', 'Input', 'Urine output', 'Drain content']
  .forEach(l => setField(l, l === 'Target fluid' ? tf : 0));
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const printForm = () => container.querySelector('#print-form');
const printText = () => text(printForm());
// What a person sees on screen: everything but the (print-only) order form.
function screenText() {
  const c = container.cloneNode(true);
  c.querySelector('#print-form')?.remove();
  return text(c);
}
const alertRows = () => [...container.querySelectorAll('.calc-bottom .alert-row')].map(a => ({
  level: ['crit', 'warn', 'info'].find(c => a.classList.contains(c)),
  title: a.querySelector('.title')?.textContent || '', text: a.textContent.replace(/\s+/g, ' ') }));
const tileEl = (label) => [...container.querySelectorAll('.metric')].find(x => x.querySelector('.lbl')?.textContent === label) || null;
const tileVal = (label) => { const t = tileEl(label); return t ? t.querySelector('.val').textContent : null; };
const statusOf = (el) => (el?.className.match(/\bs-(\w+)/) || [])[1] || null;
const tileStatus = (label) => statusOf(tileEl(label));
const frontSheet = () => { const f = printForm()?.cloneNode(true); f?.querySelector('.print-back')?.remove(); return f || null; };
const lipidHours = (h) => click([...container.querySelectorAll('.seg button')].find(b => b.textContent.trim() === `${h}h`));
const lipidCard = () => [...container.querySelectorAll('div')].find(d => /^🫙 Lipid Pump/.test(text(d)) && d.children.length === 0)?.parentElement || null;

const BASE = { dol: 1, editEntry: null, baselineEntry: null, previousEntry: null, logDate: '2026-09-28',
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
async function save(reason = 'fixture — attending aware') {
  window.prompt = () => reason;
  await clickAsync(saveBtn());
}
async function copyOrder() {
  copied = null;
  await clickAsync(button(/Copy Order to Clipboard/));
  return copied || '';
}
// The dose field is found by its unit, not its name, so this helper works on
// the tree before §5 renamed it ("SMOF Lipid 20%") as well as after ("20% lipid").
function setLipid(v) {
  const field = [...container.querySelectorAll('.s2-lip-row .field')].find(d => /g\/kg\/d/.test(d.querySelector('label')?.textContent || ''));
  if (!field) throw new Error('lipid dose field not found');
  const input = field.querySelector('input');
  act(() => { valueSetter.call(input, String(v)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
// Synthetic infants only (no real identifiers); NICU bed → a new order starts at 30 mL dead space.
const pt = (sid, bw, extra) => ({ sessionId: sid, name: sid.slice(0, 2), bw, currentBed: 'NICU 5', diagnosis: '-',
  weights: [{ dol: 1, w: bw }], admissionDate: '2026-09-28', ...extra });
// A 2 kg infant, TPN 180 mL/d delivered, the NICU's own dead space (30 mL).
function baseOrder({ tf = 120 } = {}) {
  setField('Current weight', 2000); fillRequired(tf);
  setField('Volume(mL/day)', 180);
  setField('Dextrose final', 10); setField('Amino acid', 2); setLipid(2);
}

(async () => {
  // ═══════════════════════════ §1 dead-space chips ═════════════════════════
  await section('§1 item 10: the dead-space chips are 30 / 50 / 100, and any value can still be typed', async () => {
    mount({ patient: pt('DS-2000', 2000), onLog: logger().onLog });
    baseOrder();
    const dead = fieldOf('ปริมาตรคาสาย');
    const chips = () => [...(dead?.parentElement.querySelectorAll('.preset-chips button') || [])].map(b => text(b));
    eq('the chips under ปริมาตรคาสาย', chips(), ['30', '50', '100']);
    eq('a new NICU order still starts at 30 mL', inputFor('ปริมาตรคาสาย')?.value, '30');
    click([...dead.parentElement.querySelectorAll('.preset-chips button')].find(b => text(b) === '100'));
    eq('the 100 chip sets 100 mL', inputFor('ปริมาตรคาสาย')?.value, '100');
    ok('…and the bag is prepared at 180 + 100 = 280 mL', /Prepared \(เตรียมจริง\)\s*280 mL\/day/.test(screenText()), screenText().match(/Prepared \(เตรียมจริง\)[^A-Za-z]{0,30}/));
    setField('ปริมาตรคาสาย', 0);
    ok('0 is still typed by hand: no overfill', /no overfill — doses use actual weight/.test(screenText()), screenText().match(/Factor.{0,60}/));
    setField('ปริมาตรคาสาย', 45);
    ok('…and so is any other value (45 mL → 225 mL prepared)', /Prepared \(เตรียมจริง\)\s*225 mL\/day/.test(screenText()), screenText().match(/Prepared \(เตรียมจริง\)[^A-Za-z]{0,30}/));
  });

  // ═══════════════════════════ §2 dextrose hint ════════════════════════════
  await section('§2 item 11: the dextrose hint keeps g/kg/d only', async () => {
    mount({ patient: pt('DX-2000', 2000), onLog: logger().onLog });
    baseOrder();   // 30 mL dead space: the bag is overfilled, so "g in bag" used to show
    const hint = text(fieldOf('Dextrose final')?.querySelector('.field-hint'));
    ok('it gives g/kg/d with its ceiling', /^9 g\/kg\/d \(max 18\)$/.test(hint), hint);
    ok('…and no "delivered"', !/delivered/.test(hint), hint);
    ok('…and no "g in bag"', !/in bag/.test(hint), hint);
  });

  // ═══════════════════════════ §3 amino acid row ═══════════════════════════
  await section('§3 item 14: the amino-acid row shows volume, not grams', async () => {
    mount({ patient: pt('AA-2000', 2000), onLog: logger().onLog });
    baseOrder();
    const row = text(container.querySelector('.s2-aa-row'));
    ok('no "In bag / delivered" column', !/In bag|delivered/.test(row), row);
    ok('…and no g/day figure', !/g\/day/.test(row), row);
    ok('the volume stays: 4 g × 1.167 overfill = 46.7 mL/day', /Volume\s*46\.7 mL\/day/.test(row), row);
    setField('ปริมาตรคาสาย', 0);
    const flat = text(container.querySelector('.s2-aa-row'));
    ok('with no overfill, no "Total … g/day" either', !/Total|g\/day/.test(flat), flat);
  });

  // ═══════════════════════════ §4 WFI ══════════════════════════════════════
  await section('§4 item 15: Step 2 shows no WFI; the form still does', async () => {
    const log = logger();
    mount({ patient: pt('WF-2000', 2000), onLog: log.onLog });
    baseOrder();
    ok('no "WFI q.s." on screen', !/WFI q\.s\./.test(screenText()), screenText().match(/.{0,40}WFI.{0,40}/));
    ok('the bag make-up still gives the components and the bag total',
      /Components\s*[\d.]+ mL/.test(screenText()) && /Bag total \(prepared\)\s*210 mL/.test(screenText()), screenText().match(/Components.{0,80}/));
    await save();
    eq('saved', log.calls, 1);
    ok('the form\'s back sheet still gives WFI', /\+ WFI -?[\d.]+ mL/.test(text(printForm()?.querySelector('.print-back'))),
      text(printForm()?.querySelector('.print-back')).match(/Components.{0,60}/));
    // A bag that cannot hold its components: the red line stays in Step 2.
    mount({ patient: pt('WX-2000', 2000), onLog: logger().onLog });
    baseOrder();
    setField('ปริมาตรคาสาย', 0); setField('Volume(mL/day)', 30); setField('Amino acid', 3);
    const box = [...container.querySelectorAll('div')].filter(d => /^Components/.test(text(d.firstElementChild)) && /Bag total/.test(text(d))).pop();
    ok('components over the bag: Step 2 still says it cannot be compounded', /cannot be compounded/.test(text(box)), text(box));
    ok('…without a WFI column', !/WFI/.test(text(box)), text(box));
  });

  // ═══════════════════════════ §5 lipid ════════════════════════════════════
  await section('§5 items 16 and 18: 20% lipid, g/kg/h to 2 decimals, hours typed', async () => {
    const log = logger();
    mount({ patient: pt('LP-2000', 2000), onLog: log.onLog });
    baseOrder();
    ok('the dose field is "20% lipid"', !!fieldOf('20% lipid') && /^20% lipid/.test(text(fieldOf('20% lipid')?.querySelector('label'))),
      [...container.querySelectorAll('.s2-lip-row .field label')].map(text));
    ok('the lipid card names no product', !/SMOF/.test(text(lipidCard())), text(lipidCard()).match(/.{0,30}SMOF.{0,30}/));
    const gkgh = () => text(container.querySelector('.lipid-gkgh'));
    ok('2 g/kg/d over 24 h = 0.08 g/kg/h', /= 0\.08 g\/kg\/h/.test(gkgh()), gkgh());
    lipidHours(16);
    ok('…over 16 h = 0.13 g/kg/h (0.125, 2 decimals)', /= 0\.13 g\/kg\/h/.test(gkgh()), gkgh());
    // 20 mL lipid + 8 mL Vitalipid = 28 mL
    ok('the pump rate keeps its 2 decimals (Praew, 2026-09-28)', /PUMP RATE\s*1\.75\s*mL\/hr/.test(text(lipidCard())), text(lipidCard()).slice(0, 80));
    const hrs = inputFor('Infuse over');
    ok('the hours can be typed', !!hrs);
    setField('Infuse over', 18);
    ok('18 h: 28 mL over 18 h = 1.56 mL/hr', /PUMP RATE\s*1\.56\s*mL\/hr/.test(text(lipidCard())), text(lipidCard()).slice(0, 80));
    ok('…"over 18 h"', /28 mL\/day over 18 h/.test(text(lipidCard())), text(lipidCard()).slice(0, 120));
    ok('…and 0.11 g/kg/h', /= 0\.11 g\/kg\/h/.test(gkgh()), gkgh());
    setField('Infuse over', '');
    blur(inputFor('Infuse over'));
    eq('an emptied box goes back to 18, not 0 or 1', inputFor('Infuse over')?.value, '18');
    ok('…and the rate is still 18 h\'s', /PUMP RATE\s*1\.56\s*mL\/hr/.test(text(lipidCard())), text(lipidCard()).slice(0, 80));
    setField('Infuse over', 30);
    blur(inputFor('Infuse over'));
    eq('30 h is held at 24 (lipid hangs 24 h at most)', inputFor('Infuse over')?.value, '24');
    ok('…rate 28 ÷ 24 = 1.17 mL/hr', /PUMP RATE\s*1\.17\s*mL\/hr/.test(text(lipidCard())), text(lipidCard()).slice(0, 80));
    setField('Infuse over', 0.5);
    blur(inputFor('Infuse over'));
    eq('under 1 h is not taken: it stays at 24', inputFor('Infuse over')?.value, '24');
    setField('Infuse over', 16.25);
    blur(inputFor('Infuse over'));
    eq('16.25 h is kept as 16.3 (one decimal, as Center Point prints)', inputFor('Infuse over')?.value, '16.3');
    lipidHours(20);
    eq('a chip still sets the hours, and the box follows', inputFor('Infuse over')?.value, '20');
    setField('Infuse over', 18);
    await save();
    eq('saved', log.calls, 1);
    eq('calcInput.lipidDripHours is the typed 18', log.entry && log.entry.calcInput.lipidDripHours, 18);
    ok('the form: 18 h, 1.56 mL/hr and 0.11 g/kg/h', /Lipid pump rate.{0,40}over 18 h.{0,20}Rate 1\.56 mL\/hr.{0,10}\(= 0\.11 g\/kg\/h\)/.test(printText()),
      printText().match(/Lipid pump rate.{0,140}/));
    ok('the form\'s front still ticks the paper form\'s own lipid list (scope: screen only)',
      /☑ 20% SMOF/.test(text(frontSheet())), text(frontSheet()).match(/Lipid.{0,80}/));
    const copy = await copyOrder();
    ok('the copied order: over 18h, 0.11 g/kg/h', /Lipid bag:[^\n]*over 18h[^\n]*\(0\.11 g\/kg\/h\)/.test(copy), copy.match(/Lipid bag:[^\n]*/));
  });

  // ═══════════════════════════ §6 phosphate per mL ═════════════════════════
  await section('§6 item 19: both phosphate stocks give P per mL', async () => {
    mount({ patient: pt('PH-2000', 2000), onLog: logger().onLog });
    baseOrder();
    const note = (label) => text(saltRow(label)?.querySelector('.salt-note'));
    ok('K₂HPO₄: "1 mEq K/mL · P 15.5 mg/mL"', /1 mEq K\/mL · P 15\.5 mg\/mL/.test(note('K₂HPO₄')), note('K₂HPO₄'));
    ok('…no longer per mEq K', !/mEq K$|mg\/mEq/.test(note('K₂HPO₄')), note('K₂HPO₄'));
    ok('Glycophos: "2 mEq Na/mL · P 31 mg/mL"', /2 mEq Na\/mL · P 31 mg\/mL/.test(note('Glycophos')), note('Glycophos'));
    ok('…still says it is entered as sodium', /ใส่ mEq Na\/kg/.test(note('Glycophos')), note('Glycophos'));
    // Praew: the to-patient / in-line split is calculated, not shown. The 30 mL
    // dead space of a new NICU order overfills the bag, which is when it showed.
    setField('20% NaCl', 2); setField('KCl', 1); setField('Glycophos', 2);
    const step4 = text([...container.querySelectorAll('.salt-row-grid')][0]?.closest('.card-b'));
    ok('Step 4 still gives the prepared mL of each salt (เตรียม … mL/d)', /เตรียม [\d.]+ mL\/d/.test(step4), step4.slice(0, 200));
    ok('…with no "= ถึงผู้ป่วย … + คาสาย …" split', !/ถึงผู้ป่วย [\d.]+ \+ คาสาย/.test(step4), step4.match(/.{20}ถึงผู้ป่วย.{30}/));
  });

  // ═══════════════════════════ §7 over the fluid plan ══════════════════════
  await section('§7 item 25: over the fluid plan is said as such, never "Over target"', async () => {
    mount({ patient: pt('OT-2000', 2000), onLog: logger().onLog });
    baseOrder({ tf: 120 });   // plan 240 mL; 180 + 28 prescribed
    ok('within the plan: "Remaining"', /Remaining\s*32\s*mL\/d left/.test(screenText()), screenText().match(/(Remaining|สารน้ำเกินแผน).{0,30}/));
    setField('Target fluid', 60);   // plan 120 mL, prescribed 208
    ok('over it: "สารน้ำเกินแผน"', /สารน้ำเกินแผน\s*\+88\s*mL\/d over/.test(screenText()), screenText().match(/(Remaining|สารน้ำเกินแผน|Over target).{0,30}/));
    ok('"Over target" is gone', !/over target/i.test(screenText()), screenText().match(/.{0,30}over target.{0,30}/i));
    ok('Step 5 says the IV is over the fluid plan', /IV เกินแผนสารน้ำ 88 mL/.test(screenText()), screenText().match(/IV เกิน.{0,30}/));
  });

  // ═══════════════════════════ §8 the form ═════════════════════════════════
  await section('§8 items 4 and 28: no Nutritional Status; the doctor\'s name without an email', async () => {
    const log = logger();
    mount({ patient: pt('PF-2000', 2000), onLog: log.onLog });
    baseOrder();
    await save();
    eq('saved', log.calls, 1);
    const front = text(frontSheet());
    ok('the front has no Nutritional Status row', !/Nutritional Status|malnutrition/.test(front), front.match(/.{0,40}Nutritional.{0,60}/));
    ok('…and keeps the rest of the paper form\'s header (liver / renal still ticked by hand)', /☐ Liver Dysfunction/.test(front) && /Route of Delivery/.test(front), front.slice(0, 300));
    eq('"แพทย์" carries the name only', text(printForm()?.querySelector('.print-doctor')), 'Dr Test');
    ok('…no email anywhere on the front', !/@/.test(front), front.match(/[^\s]+@[^\s]+/));
    ok('the back still says who to call, with the email', /บันทึกโดย Dr Test \(doc@kcmh\.test\)/.test(text(printForm()?.querySelector('.print-saved-by'))),
      text(printForm()?.querySelector('.print-saved-by')));
    // A row saved before names were kept: the back has only its email, so the front has none.
    const row = { entryId: 'e-old', lastModified: '2026-09-22T03:00:00.000Z', ts: '2026-09-28', dol: 1, weight: 2000,
      ioInput: 150, ioOutput: 60, drainContent: 0, lastModifiedBy: 'old@kcmh.test',
      calcInput: { curWtG: 2000, fluidTargetPerKg: 120, otherIV_mL: 0, drug_mL: 0, ioInput: 150, ioOutput: 60, drainContent: 0,
        totalTPN_mL: 180, deadVol_mL: 0, dexPct: 10, aaPerKg: 2, lipidPerKg: 2, aaProduct: 'aminoven10',
        constantsVersion: D.CONSTANTS_VERSION, tpnWtG: 2000 } };
    mount({ patient: pt('PO-2000', 2000), onLog: logger().onLog, editEntry: row });
    ok('reopened old row: it prints', !!printForm());
    eq('…"แพทย์" is left blank to sign', text(printForm()?.querySelector('.print-doctor')), '');
    ok('…and the back gives the email', /old@kcmh\.test/.test(text(printForm()?.querySelector('.print-saved-by'))), text(printForm()?.querySelector('.print-saved-by')));
  });

  // ═══════════════════════════ §9 feed groups ══════════════════════════════
  await section('§9 item 6: preterm and post-discharge formulas are grouped apart', async () => {
    mount({ patient: pt('FG-2000', 2000), onLog: logger().onLog });
    const sel = [...container.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'BM_20'));
    const groups = [...sel.querySelectorAll('optgroup')].map(g => ({ label: g.label, keys: [...g.querySelectorAll('option')].map(o => o.value) }));
    const keysOf = (re) => (groups.find(g => re.test(g.label)) || {}).keys;
    eq('preterm formula: PF 20, Enfalac Premature 22, Hi-Q LBW 24', keysOf(/Preterm formula$/), ['BM_PF_20', 'FBM_PF_22', 'FBM_PF_24']);
    eq('post-discharge formula: Pre Nan 22', keysOf(/Post-discharge formula$/), ['PRENAN_22']);
    eq('high-energy: FBM ↔ Infatrini, Infatrini 30', keysOf(/High-energy formula$/), ['FBM_INF_MIX', 'INFATRINI_30']);
    ok('no group lumps preterm with high-energy', !groups.some(g => /Preterm \/ High-energy/.test(g.label)), groups.map(g => g.label));
    const offered = groups.flatMap(g => g.keys).sort();
    eq('every feed offered before is still offered, once',
      offered, ['BM_20', 'BM_HMF_24', 'BM_PF_20', 'FBM_INF_MIX', 'FBM_PF_22', 'FBM_PF_24', 'INFATRINI_30', 'LF_20', 'LF_24', 'LF_27', 'PRENAN_22']);
    // The Formula reference page (app.jsx, not mounted here): the same split, and Pre Nan at last.
    const src = R('app.jsx');
    const block = /function FormulasPanel\(\)[\s\S]*?const groups = \[([\s\S]*?)\];/.exec(src)?.[1] || '';
    const groupLines = block.split(/\r?\n/).filter(l => /label:/.test(l));
    const pageKeys = (re) => { const l = groupLines.find(x => re.test(x)) || ''; return [...l.matchAll(/"([A-Z0-9_]+)"/g)].map(m => m[1]); };
    eq('Formula page · preterm formula', pageKeys(/Preterm formula/), ['BM_PF_20', 'FBM_PF_22', 'FBM_PF_24']);
    eq('Formula page · post-discharge formula', pageKeys(/Post-discharge formula/), ['PRENAN_22']);
    eq('Formula page · high-energy', pageKeys(/High-energy/), ['FBM_INF_MIX', 'INFATRINI_30']);
    const all = [...block.matchAll(/"([A-Z0-9_]+)"/g)].map(m => m[1]);
    eq('Formula page · no key twice', all.length, new Set(all).size);
  });

  // ═══════════════════════════ §10 K⁺ by route ═════════════════════════════
  // Review of PR #129, Praew: "max 200 ทั้งสองสาย". Until then only central had
  // a maximum, so switching a 213 mEq/L bag to Peripheral turned the stop into
  // a critical alert that one typed reason cleared.
  await section('§10 K⁺ in the bag by route: peripheral amber > 40, red > 60; central amber > 60, red > 120; max 200 on both', async () => {
    const log = logger();
    mount({ patient: pt('KR-2000', 2000), onLog: log.onLog });
    setField('Current weight', 2000); fillRequired(120);
    setField('ปริมาตรคาสาย', 0);
    // KCl alone in the bag: K⁺ mEq/L = KCl mEq/kg × 2 kg ÷ volume.
    const kAt = (ml, perKg) => { setField('Volume(mL/day)', ml); setField('KCl', perKg); };
    const kAlerts = () => alertRows().filter(a => /^K⁺ (concentration|above)/.test(a.title)).map(a => `${a.level}:${a.title}`);
    click(button(/^Peripheral$/));
    kAt(100, 1.75);   // 35
    eq('peripheral 35 mEq/L: green, no K⁺ alert', [tileVal('K⁺ in bag'), tileStatus('K⁺ in bag'), kAlerts()], ['35 mEq/L', 'ok', []]);
    kAt(100, 2.5);    // 50
    eq('peripheral 50: amber, a caution', [tileStatus('K⁺ in bag'), kAlerts()], ['warn', ['warn:K⁺ concentration high']]);
    kAt(100, 3.25);   // 65
    eq('peripheral 65: red, a critical alert', [tileStatus('K⁺ in bag'), kAlerts()], ['crit', ['crit:K⁺ concentration too high']]);
    ok('the line under the tile gives the peripheral thresholds', /peripheral: amber > 40 · red > 60 · max 200 mEq\/L/.test(text(container.querySelector('.k-conc-ref'))), text(container.querySelector('.k-conc-ref')));
    kAt(30, 2.98);    // 199
    eq('peripheral 199: red, not yet the maximum; Submit works with a reason', [tileVal('K⁺ in bag'), kAlerts(), !!saveBtn() && !saveBtn().disabled], ['199 mEq/L', ['crit:K⁺ concentration too high'], true]);
    kAt(100, 3.25);   // back to 65
    click(button(/^Central$/));
    eq('the same 65 on a central line: amber', [tileStatus('K⁺ in bag'), kAlerts()], ['warn', ['warn:K⁺ concentration high']]);
    ok('…and the line under the tile gives the central ones', /central: amber > 60 · red > 120 · max 200 mEq\/L/.test(text(container.querySelector('.k-conc-ref'))), text(container.querySelector('.k-conc-ref')));
    kAt(100, 2.5);    // 50
    eq('central 50: green', [tileStatus('K⁺ in bag'), kAlerts()], ['ok', []]);
    kAt(30, 1.75);    // 117
    eq('central 117: amber', [tileVal('K⁺ in bag'), tileStatus('K⁺ in bag'), kAlerts()], ['117 mEq/L', 'warn', ['warn:K⁺ concentration high']]);
    kAt(30, 1.95);    // 130
    eq('central 130: red, a critical alert', [tileVal('K⁺ in bag'), tileStatus('K⁺ in bag'), kAlerts()], ['130 mEq/L', 'crit', ['crit:K⁺ concentration too high']]);
    ok('…and Submit still works (with a reason)', !!saveBtn() && !saveBtn().disabled);
    kAt(30, 3.2);     // 213
    eq('central 213: above the 200 maximum', [tileStatus('K⁺ in bag'), kAlerts()], ['crit', ['crit:K⁺ above the maximum']]);
    ok('…Submit is disabled, and the line by it says why', !!saveBtn() && saveBtn().disabled && /เกินค่าสูงสุด 200 mEq\/L/.test(text(container.querySelector('.k-over-max'))), text(container.querySelector('.k-over-max')));
    click(button(/^Peripheral$/));
    eq('the same 213 switched to Peripheral: still above the maximum', [tileStatus('K⁺ in bag'), kAlerts()], ['crit', ['crit:K⁺ above the maximum']]);
    ok('…Submit stays disabled, and the line names the peripheral line', !!saveBtn() && saveBtn().disabled && /เกินค่าสูงสุด 200 mEq\/L ของสาย peripheral/.test(text(container.querySelector('.k-over-max'))), text(container.querySelector('.k-over-max')));
    click(button(/^Central$/));
    const draft = [...container.querySelectorAll('button.save-draft')][0];
    await clickAsync(draft);
    eq('…but it can still be kept as a draft', log.calls, 1);
    click(button(/^Peripheral$/));
    kAt(100, 2.5);    // 50, amber: saves with no reason
    await save();
    ok('submitted (an update of the draft): the form prints', !!printForm());
    ok('the form gives the route’s limit', /K⁺ in bag: confirm > 60 · max 200 mEq\/L \(peripheral\)/.test(printText()), printText().match(/K⁺ in bag: .{0,40}/));
    ok('…and so does its back sheet', /K⁺ in bag 50 mEq\/L \(confirm > 60, max 200, peripheral\)/.test(printText()), printText().match(/K⁺ in bag \d[^·]*/));
    const copy = await copyOrder();
    ok('…and the copied order', /\(50 mEq\/L; confirm above 60, max 200 on a peripheral line\)/.test(copy), copy.match(/Total K:[^\n]*/));
    click(button(/^Central$/));
    await save();
    ok('on a central line the form gives both numbers', /K⁺ in bag: confirm > 120 · max 200 mEq\/L \(central\)/.test(printText()), printText().match(/K⁺ in bag: .{0,40}/));
    ok('…and so does the copied order', /\(50 mEq\/L; confirm above 120, max 200 on a central line\)/.test(await copyOrder()));

    // A saved row above the maximum reopens without Print. No save can make
    // one now, but a row saved before the maximum, or edited in the Sheet, can.
    // Every critical alert is covered by a reason, so only the maximum holds it.
    // The draft kept above (onLog; the later saves were updates) is the row's
    // shape: re-dated as submitted, 100 mL, on a peripheral line.
    const saved = log.entry;
    eq('the saved row records its route', saved?.calcInput?.route, 'central');
    const reopen = (kCl, alerts) => mount({ patient: pt('KR-2000', 2000), onLog: logger().onLog,
      editEntry: { ...saved, status: 'submitted', entryId: 'e-kmax', lastModified: 'lm-kmax',
        calcInput: { ...saved.calcInput, route: 'peripheral', totalTPN_mL: 100, kCl,
          ...(alerts ? { critOverride: { alerts, reason: 'fixture — attending aware' } } : {}) } } });
    reopen(12.5);     // 250 mEq/L on a peripheral line
    const critTitles = alertRows().filter(a => a.level === 'crit').map(a => a.title);
    ok('reopened at 250 mEq/L, peripheral: "K⁺ above the maximum"', critTitles.includes('K⁺ above the maximum'), critTitles);
    reopen(12.5, critTitles);
    ok('…with every critical alert given a reason, it still does not print', !printForm() && /เกินค่าสูงสุด 200/.test(text(container.querySelector('.k-over-max'))), text(container.querySelector('.k-over-max')));
    reopen(2.5, critTitles);   // 50 mEq/L: the control
    ok('…while the same row at 50 mEq/L prints', !!printForm());
  });

  // ═══════════════════════════ §10b quick calc copy ════════════════════════
  // The quick calc copies without a save (it has no patient to misattribute),
  // so an over-maximum bag is flagged in the text, as an over-full bag is.
  await section('§10b the quick calc\'s copy flags a bag above the K⁺ maximum', async () => {
    mount({ patient: { sessionId: null, name: null, initials: null, bw: 0, ga: 0, sex: '', currentBed: '',
      diagnosis: '', weights: [], lengths: [], hcs: [] }, scratch: true, logDate: null, userLabel: '' });
    setField('Current weight', 2000);
    setField('ปริมาตรคาสาย', 0);
    click(button(/^Central$/));
    setField('Volume(mL/day)', 30); setField('KCl', 3.2);   // 213 mEq/L
    const copyScratch = async () => { copied = null; await clickAsync(button(/คัดลอกผลคำนวณ/)); return copied || ''; };
    const copy = await copyScratch();
    ok('"!! K⁺ … ABOVE THE 200 mEq/L MAXIMUM — cannot be ordered"', /!! K⁺ 213 mEq\/L IS ABOVE THE 200 mEq\/L MAXIMUM — cannot be ordered/.test(copy), copy.match(/Total K:[^\n]*\n[^\n]*/));
    setField('KCl', 1.5);   // 100 mEq/L
    const below = await copyScratch();
    ok('…and no such line below it', /Total K:/.test(below) && !/ABOVE THE 200/.test(below), below.match(/Total K:[^\n]*\n[^\n]*/));
  });

  // ═══════════════════════════ §11 osmolarity, central ═════════════════════
  await section('§11 a central line has no upper osmolarity limit', async () => {
    mount({ patient: pt('OC-1000', 1000), onLog: logger().onLog });
    setField('Current weight', 1000); fillRequired(150);
    setField('Volume(mL/day)', 100); setField('Dextrose final', 25); setField('Amino acid', 6);
    click(button(/^Central$/));
    const osm = Number((tileVal('Osmolarity') || '').replace(/[^\d.]/g, ''));
    ok('the bag is above the old 1800 mOsm/L warning', osm > 1800, osm);
    const osmAlerts = () => alertRows().filter(a => /smolar/.test(a.title)).map(a => a.title);
    eq('central: green, no osmolarity alert, no range on the tile', [tileStatus('Osmolarity'), osmAlerts(), !!tileEl('Osmolarity')?.querySelector('.range')], ['ok', [], false]);
    click(button(/^Peripheral$/));
    eq('the same bag on a peripheral line: red, with its critical alert', [tileStatus('Osmolarity'), osmAlerts()], ['crit', ['Osmolarity > peripheral limit']]);
  });

  // ═══════════════════════════ §12 lipid rate ceiling ══════════════════════
  await section('§12 lipid rate ceiling 0.13–0.17 g/kg/h: amber above 0.13, red above 0.17', async () => {
    const log = logger();
    mount({ patient: pt('LC-2000', 2000), onLog: log.onLog });
    baseOrder();   // 2 g/kg/d over 24 h
    const gk = () => container.querySelector('.lipid-gkgh');
    const lipAlerts = () => alertRows().filter(a => /^Lipid rate/.test(a.title)).map(a => `${a.level}:${a.title}`);
    ok('the pump card names the ceiling', /เพดาน 0\.13–0\.17/.test(text(gk())), text(gk()));
    eq('2 over 24 h = 0.08: green, no alert', [statusOf(gk()), lipAlerts()], ['ok', []]);
    lipidHours(16);   // 0.125, shown 0.13
    eq('2 over 16 h = 0.125, shown 0.13: green (graded on the figure shown)', [(text(gk()).match(/[\d.]+ g\/kg\/h/) || [])[0], statusOf(gk()), lipAlerts()], ['0.13 g/kg/h', 'ok', []]);
    setLipid(3); lipidHours(20);   // 0.15
    eq('3 over 20 h = 0.15: amber, a caution', [statusOf(gk()), lipAlerts()], ['warn', ['warn:Lipid rate near the ceiling']]);
    lipidHours(24); setLipid(4);   // 0.1667, shown 0.17
    eq('4 over 24 h = 0.17: amber, not red', [statusOf(gk()), lipAlerts()], ['warn', ['warn:Lipid rate near the ceiling']]);
    setLipid(3); lipidHours(16);   // 0.1875, shown 0.19
    eq('3 over 16 h = 0.19: red, a critical alert', [statusOf(gk()), lipAlerts()], ['crit', ['crit:Lipid rate above the ceiling']]);
    let shown = null;
    window.prompt = (m) => { shown = m; return 'fixture — short infusion'; };
    await clickAsync(saveBtn());
    ok('Save asks for a reason for it', /Lipid rate above the ceiling/.test(shown || ''), shown);
    eq('…and saves with one', log.calls, 1);
  });

  // ═══════════════════════════ §13 acetate, prepared ═══════════════════════
  // Praew: "แสดง acetate ด้วย", then "รอดูฉลากก่อน" — the display is built but
  // waits for S.naAcetate.acetateMeqPerMl, which stays null until the vial
  // label is read. Checked both ways: as shipped (null), and with a value.
  await section('§13 acetate from Na acetate: hidden while the label is unread, shown once a value is set', async () => {
    const naAcRow = () => saltRow('Na Acetate');
    const caption = () => text(naAcRow()?.nextElementSibling?.nextElementSibling);
    eq('as shipped, acetate per mL is not set', D.KCMH_STOCK.naAcetate.acetateMeqPerMl, null);
    mount({ patient: pt('AC-2000', 2000), onLog: logger().onLog });
    baseOrder();
    setField('Na Acetate', 3);   // 1 mL/kg
    ok('the caption gives Na and mL only', /3 mEq Na\/kg\/d = 1 mL\/kg\/d/.test(caption()) && !/acetate/.test(caption()), caption());
    ok('…and the note names no acetate', !/acetate/.test(text(naAcRow()?.querySelector('.salt-note'))), text(naAcRow()?.querySelector('.salt-note')));
    const was = D.KCMH_STOCK.naAcetate.acetateMeqPerMl;
    D.KCMH_STOCK.naAcetate.acetateMeqPerMl = 3;   // a label value, for this check only
    try {
      mount({ patient: pt('AD-2000', 2000), onLog: logger().onLog });
      baseOrder();
      setField('Na Acetate', 3);
      ok('with 3 mEq/mL set: "· acetate 3 mEq/kg/d" in the caption', /1 mL\/kg\/d · acetate 3 mEq\/kg\/d/.test(caption()), caption());
      ok('…"acetate 3 mEq/mL" in the note', /acetate 3 mEq\/mL/.test(text(naAcRow()?.querySelector('.salt-note'))), text(naAcRow()?.querySelector('.salt-note')));
      await save();   // the copy button works on a saved order
      const copy = await copyOrder();
      // 3 mEq/kg × 2 kg × 210/180 overfill = 7 mEq Na in the bag → 7 mEq acetate
      ok('…and the copied order gives the bag\'s acetate', /Na Acetate:[^\n]*\(acetate 7 mEq\)/.test(copy), copy.match(/Na Acetate:[^\n]*/));
    } finally { D.KCMH_STOCK.naAcetate.acetateMeqPerMl = was; }
  });

  console.log(`\nTPN MEETING 2026-09-28: ${fail ? fail + ' FAILED' : 'ALL PASSED'} (${pass} passed)`);
  act(() => { root.unmount(); });
  process.exit(fail ? 1 : 0);
})();
