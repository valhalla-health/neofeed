// verify-calc-clicks.cjs — every control in the calculator, clicked.
//
// The arithmetic harnesses type into fields; this one presses things. For each
// control it asserts three separate facts: the value it sets reaches the field
// it names, the control shows itself as chosen (an active chip, an `on`
// segment, a ticked box), and the figure that depends on it moves the way the
// label promises — a Mg vial switch has to change the mL, not just the button.
//
// Also the gates around a printed order, because they are clicks too: Print
// and Copy refused before a save, Save disabled until Step 1 and Intake /
// Output are filled, a zero-volume bag refused, a critical value demanding a
// typed reason (cancelled, blank, then given), the second save updating the
// same row rather than appending, Delete behind its confirm, the prefill and
// draft banners, and the quick calc's narrower set.
//
// Dev-only deps as in test/README.md (react@18 react-dom@18 @babel/core
// @babel/preset-react jsdom).
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + path.sep;
const R = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
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
let printed = 0; window.print = () => { printed++; };
let promptAnswer = 'sweep reason'; window.prompt = () => promptAnswer;
let confirmAnswer = true; window.confirm = () => confirmAnswer;
// See verify-calc-oracle.cjs: install the clipboard stub whichever shape
// jsdom and Node give us.
let copied = null;
const clipboardStub = { writeText: (t) => { copied = t; return Promise.resolve(); } };
try { Object.defineProperty(window.navigator, 'clipboard', { value: clipboardStub, configurable: true }); }
catch { try { window.navigator.clipboard.writeText = clipboardStub.writeText; } catch { /* left to fail loudly at the Copy assertion */ } }
try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true }); } catch {}
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
{ const w = console.error; console.error = (...a) => { if (!/act\(|not wrapped|Not implemented/.test(String(a[0]))) w(...a); }; }
vm.runInThisContext(R('data.js'));
const D = window.NEOFEED_DATA;
for (const f of ['icons.jsx', 'calculator.jsx']) {
  vm.runInThisContext(babel.transformSync(R(f), { presets: [[require('@babel/preset-react'), { runtime: 'classic' }]], filename: f, configFile: false, babelrc: false }).code);
}

const container = document.getElementById('root');
let root = ReactDOM.createRoot(container);
const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
const selSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) { if (cond) pass++; else { fail++; failures.push(`${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`); } }
function inputFor(label) {
  const field = [...container.querySelectorAll('.field')].find(d => d.querySelector('label')?.textContent.startsWith(label));
  if (field) return field.querySelector('input');
  const row = [...container.querySelectorAll('.salt-row-grid')].find(d => d.firstElementChild?.firstElementChild?.textContent.startsWith(label));
  return row ? row.querySelector('input') : null;
}
function setField(label, value) {
  const input = inputFor(label); if (!input) throw new Error('field not found: ' + label);
  act(() => { input.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true })); valueSetter.call(input, String(value)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
  act(() => { input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })); });
}
// type one character at a time, the way a keyboard does
function typeChars(label, text) {
  const input = inputFor(label); if (!input) throw new Error('field not found: ' + label);
  act(() => { input.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true })); });
  let cur = '';
  for (const ch of text) {
    cur += ch;
    act(() => { valueSetter.call(input, cur); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
    cur = input.value;
  }
  act(() => { input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })); });
}
const click = (el) => { if (!el) throw new Error('click target missing'); act(() => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); };
const clickAsync = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await new Promise(r => setTimeout(r, 5)); }); };
const btnExact = (txt) => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === txt);
const text = () => container.textContent.replace(/\s+/g, ' ');
const num = (s) => { const m = String(s ?? '').match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : null; };
// the preset-chips row that directly follows a field's wrapper
function chipsAfter(label) {
  const input = inputFor(label);
  let host = input.closest('.field') || input.closest('.salt-row-grid');
  let sib = host.nextElementSibling;
  while (sib && !sib.classList.contains('preset-chips')) sib = sib.nextElementSibling;
  return sib ? [...sib.querySelectorAll('button')] : [];
}

function mount(props = {}) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear(); toasts.length = 0; copied = null; printed = 0;
  const patient = { sessionId: 'CS-1', name: 'Sweep', initials: 'SW', bw: 1000, ga: 30, sex: 'girls',
    admissionDate: '2026-09-01', currentBed: 'SCN 3', diagnosis: '-', weights: [{ dol: 1, w: 1000 }], lengths: [], hcs: [] };
  const calls = { onLog: [], onUpdate: [], onDelete: [], onSaved: 0, weights: [] };
  act(() => {
    root.render(React.createElement(window.Calculator, {
      patient, dol: 10, editEntry: null, baselineEntry: null, previousEntry: null, logDate: null,
      userLabel: 'Dr Sweep (sweep@kcmh.test)', userEmail: 'sweep@kcmh.test',
      onLog: (e) => { calls.onLog.push(e); return Promise.resolve({ ok: true, entryId: 'srv-9', lastModified: '2026-09-23T02:00:00.000Z' }); },
      onUpdate: (id, lm, e) => { calls.onUpdate.push({ id, lm, e }); return Promise.resolve({ ok: true, lastModified: '2026-09-23T03:00:00.000Z' }); },
      onDelete: (x) => { calls.onDelete.push(x); return Promise.resolve({ ok: true }); },
      onSaved: () => { calls.onSaved++; }, onWeightChange: (w) => calls.weights.push(w),
      ...props,
    }));
  });
  return calls;
}
const openAll = () => click(btnExact('Open all'));

(async () => {
  // ── 1 · accordion ─────────────────────────────────────────────
  mount();
  const bodies = () => [...container.querySelectorAll('.accordion-body')];
  ok('6 step cards', bodies().length === 6, bodies().length);
  ok('only Step 1 open on arrival', bodies().filter(b => b.classList.contains('open')).length === 1);
  openAll();
  ok('Open all opens 6', bodies().filter(b => b.classList.contains('open')).length === 6);
  click(btnExact('Close all'));
  ok('Close all closes every step', bodies().filter(b => b.classList.contains('open')).length === 0);
  const heads = [...container.querySelectorAll('.card-h.clickable')];
  heads.forEach((h, i) => { click(h); ok(`header ${i + 1} opens its own card`, bodies()[i].classList.contains('open')); click(h); ok(`header ${i + 1} closes its own card`, !bodies()[i].classList.contains('open')); });
  openAll();
  // route toggle must not collapse Step 3
  click([...container.querySelectorAll('.step2-ctrl .seg button')].find(b => b.textContent === 'Peripheral'));
  ok('route toggle leaves Step 3 open', bodies()[2].classList.contains('open'));
  ok('Peripheral is on', [...container.querySelectorAll('.step2-ctrl .seg button')].find(b => b.textContent === 'Peripheral').classList.contains('on'));
  click([...container.querySelectorAll('.step2-ctrl .seg button')].find(b => b.textContent === 'Central'));
  ok('Central is on', [...container.querySelectorAll('.step2-ctrl .seg button')].find(b => b.textContent === 'Central').classList.contains('on'));

  // ── 2 · every preset chip sets its field and lights up ────────
  setField('Current weight', 1200);
  setField('Volume(mL/day)', 100);
  const chipGroups = [
    ['Target fluid', [60, 80, 100, 120, 150]],
    ['ปริมาตรคาสาย', [0, 10, 20, 30]],
    ['Dextrose final', [5, 7.5, 10, 12.5, 15]],
    ['Amino acid', [1.5, 2, 2.5, 3, 3.5]],
    ['SMOF Lipid 20%', [0.5, 1, 2, 3, 4]],
    ['20% NaCl', [1, 2, 3, 4]],
    ['Na Acetate', [1, 2, 3, 4]],
    ['Glycophos', [1, 2, 3, 4]],
    ['KCl', [1, 2, 3, 4]],
    ['K₂HPO₄', [1, 2, 3, 4]],
    ['MgSO₄', [0.2, 0.4, 0.6]],
    ['10% Ca gluconate', [32, 60, 80, 100]],
    ['Iron', [2, 3, 4]],
    ['ปริมาณ elem Ca', [50, 80, 100, 120]],
    ['ปริมาณ elem P', [30, 40, 60]],
    ['Vitamin D', [400, 500, 600, 700]],
  ];
  for (const [label, values] of chipGroups) {
    const chips = chipsAfter(label);
    ok(`${label}: ${values.length} chips`, chips.length === values.length, chips.map(c => c.textContent));
    for (const v of values) {
      const chip = chipsAfter(label).find(c => num(c.textContent) === v);
      if (!chip) { ok(`${label} chip ${v} exists`, false); continue; }
      click(chip);
      const shown = inputFor(label).value;
      ok(`${label} chip ${v} → field shows ${v}`, shown === '' ? v === 0 : num(shown) === v, shown);
      ok(`${label} chip ${v} is the active chip`, chipsAfter(label).filter(c => c.classList.contains('active')).map(c => num(c.textContent)).join() === String(v));
    }
  }
  // the dependents of a few chips, as numbers
  click(chipsAfter('Glycophos').find(c => num(c.textContent) === 2));
  ok('Glycophos chip 2 (mEq Na) = 1 mmol P/kg', /→ P 1 mmol\/kg\/d = 31 mg\/kg\/d/.test(text()));
  click(chipsAfter('Dextrose final').find(c => num(c.textContent) === 10));
  // 100 mL delivered, dead 30 (last chip set above was 30), D10 → 13 g in the bag → 26 mL D50W
  ok('D10 chip → D50W 26 mL/d on a 130 mL bag', /D50W: 26 mL\/d/.test(text()), text().match(/D50W: [\d.]+ mL\/d/)?.[0]);

  // ── 3 · segmented toggles ─────────────────────────────────────
  setField('SMOF Lipid 20%', 2);
  for (const h of [16, 20, 24]) {
    click([...container.querySelectorAll('button')].find(b => b.textContent === `${h}h`));
    // 2 g/kg × 1.2 kg = 2.4 g = 12 mL SMOF + Vitalipid 4.8 mL = 16.8 mL
    const rate = num(text().match(/PUMP RATE([\d.]+)mL\/hr/)?.[1]);
    ok(`lipid over ${h}h → rate ${(16.8 / h).toFixed(2)}`, Math.abs(rate - 16.8 / h) <= 0.005, rate);
    ok(`lipid over ${h}h → g/kg/h`, Math.abs(num(container.querySelector('.lipid-gkgh').textContent) - 2 / h) <= 0.0005);
  }
  setField('MgSO₄', 0.4);
  const vialBtn = (v) => { const vial = [...container.querySelectorAll('span')].find(s => s.textContent === 'Vial'); return [...vial.parentElement.querySelectorAll('.seg button')].find(b => b.textContent === `${v}%`); };
  click(vialBtn('50'));
  // 0.4 × factor(1.2 × 130/100 = 1.56) = 0.624 mEq ÷ 4.06 = 0.154 → 0.15 mL
  ok('Mg 50% vial → 0.15 mL', /→ 0\.15 mL\/d/.test(text()), text().match(/→ [\d.]+ mL\/d \(10%/)?.[0]);
  click(vialBtn('10'));
  // 0.624 ÷ 0.812 = 0.768 → 0.77 mL
  ok('Mg 10% vial → 0.77 mL', /→ 0\.77 mL\/d/.test(text()));

  // ── 4 · checkboxes ────────────────────────────────────────────
  const chk = (start) => [...container.querySelectorAll('label.chk-label')].find(l => l.textContent.trim().startsWith(start)).querySelector('input');
  ok('Soluvit on by default', chk('Soluvit N').checked);
  ok('Peditrace on by default', chk('Peditrace').checked);
  act(() => { chk('Soluvit N').click(); });
  ok('Soluvit unticks → Additives shows —', /Soluvit N \(water-sol\.\)—/.test(text()));
  act(() => { chk('Soluvit N').click(); });
  act(() => { chk('Peditrace').click(); });
  ok('Peditrace unticks → Additives shows —', /Peditrace—/.test(text()));
  act(() => { chk('Peditrace').click(); });
  // MEN: 5 mL × 8 on 1.2 kg = 33 mL/kg/d — above 24 → warning, and fluid excludes it
  setField('Volume(mL/feed)', 5); setField('Frequency', 8);
  const prescribedBefore = num(text().match(/· Prescribed ([\d.]+) mL\/d/)?.[1]);
  act(() => { chk('MEN (trophic)').click(); });
  const prescribedAfter = num(text().match(/· Prescribed ([\d.]+) mL\/d/)?.[1]);
  ok('MEN tick removes the 40 mL feed from Prescribed', prescribedBefore - prescribedAfter === 40, [prescribedBefore, prescribedAfter]);
  ok('MEN above 24 mL/kg/d raises its warning', /MEN ticked above trophic volume/.test(text()));
  act(() => { chk('MEN (trophic)').click(); });
  ok('MEN untick restores Prescribed', num(text().match(/· Prescribed ([\d.]+) mL\/d/)?.[1]) === prescribedBefore);
  act(() => { chk('Munti-vim Drop').click(); });
  ok('Munti-vim tick shows in the supplement summary', /Munti-vim Drop1mL\/day/.test(text()));

  // ── 5 · selects: every option selectable and reflected ─────────
  const selWith = (v) => [...container.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === v));
  for (const [probe, label] of [['BM_20', 'feed'], ['FE_FERDEK', 'iron'], ['CA_CACO3_350', 'oral Ca'], ['PO4_PHOSPHATE', 'oral PO4']]) {
    const sel = selWith(probe);
    for (const o of [...sel.options]) {
      act(() => { selSetter.call(sel, o.value); sel.dispatchEvent(new window.Event('change', { bubbles: true })); });
      ok(`${label} select → ${o.value}`, selWith(probe).value === o.value);
    }
  }
  // every feed in the select has a composition behind it
  const feedKeys = [...selWith('BM_20').options].map(o => o.value);
  ok('every feed option has an EN_DB entry', feedKeys.every(k => D.EN_DB[k] && D.EN_DB[k].kcal > 0), feedKeys);

  // ── 6 · Volume ↔ Rate, typed a key at a time ──────────────────
  typeChars('Rate', '4.1');
  ok('Rate 4.1 → Volume 98.4 (no float tail)', inputFor('Volume(mL/day)').value === '98.4', inputFor('Volume(mL/day)').value);
  typeChars('Volume(mL/day)', '120');
  ok('Volume 120 → Rate 5', inputFor('Rate').value === '5', inputFor('Rate').value);
  typeChars('Volume(mL/day)', '100');
  ok('Volume 100 → Rate 4.17', inputFor('Rate').value === '4.17', inputFor('Rate').value);
  typeChars('Dextrose final', '12.5');
  ok('typed 12.5 stays 12.5', inputFor('Dextrose final').value === '12.5');
  typeChars('Amino acid', '0.05');
  ok('typed 0.05 keeps its leading zero', inputFor('Amino acid').value === '0.05');
  typeChars('Amino acid', '-3');
  ok('a minus sign is refused', inputFor('Amino acid').value === '3');
  typeChars('Amino acid', '3..5');
  ok('a second decimal point is dropped', inputFor('Amino acid').value === '3.5');
  typeChars('Amino acid', '3');

  // ── 7 · TPN calc. weight override and "ใช้ค่าอัตโนมัติ" ─────────
  setField('Current weight', 900);   // below BW 1000 → auto 1000
  ok('auto dosing weight floors at BW', inputFor('TPN calc. weight').value === '1000');
  setField('TPN calc. weight', 950);
  ok('override shows ⚠ แก้เอง', /⚠ แก้เอง · อัตโนมัติ = 1000 g/.test(text()));
  click(btnExact('ใช้ค่าอัตโนมัติ'));
  ok('ใช้ค่าอัตโนมัติ returns to 1000', inputFor('TPN calc. weight').value === '1000' && !/⚠ แก้เอง/.test(text()));
  setField('TPN calc. weight', 1000);
  ok('typing the automatic figure is not an override', !/⚠ แก้เอง/.test(text()));
  setField('Current weight', 1200);
  ok('above BW, dosing weight follows current weight', inputFor('TPN calc. weight').value === '1200');

  // ── 8 · Save / Print / Copy / Delete gates ────────────────────
  const calls = mount();
  openAll();
  printed = 0; toasts.length = 0;
  act(() => { document.dispatchEvent(new window.CustomEvent('__neofeed_print')); });
  await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  ok('Print before saving is refused with a toast', printed === 0 && toasts.some(t => /บันทึกคำสั่งให้สำเร็จก่อนพิมพ์/.test(t.msg)), toasts);
  click([...container.querySelectorAll('button')].find(b => /Copy Order to Clipboard/.test(b.textContent)));
  ok('Copy before saving is refused', copied === null && toasts.some(t => /ก่อนคัดลอก/.test(t.msg)));
  ok('Save disabled while Step 1 / I/O are blank', btnExact('Submit').disabled === true);
  for (const [l, v] of [['Current weight', 1200], ['Target fluid', 150], ['Other IV', 0], ['Drug volume', 0], ['Urine output', 60], ['Drain content', 0]]) setField(l, v);
  setField('Volume(mL/day)', 150); setField('Dextrose final', 10); setField('Amino acid', 3);
  ok('Save enabled once every required box is filled', btnExact('Submit').disabled === false, [...container.querySelectorAll('div')].map(d => d.textContent).filter(t => /^ยังกรอกไม่ครบ/.test(t)).pop());
  // zero-volume bag blocks Save
  setField('Volume(mL/day)', 0);
  ok('ingredients with TPN volume 0 disable Save', btnExact('Submit').disabled === true && /ปริมาตร TPN = 0 แต่ยังมีส่วนประกอบในถุง/.test(text()));
  setField('Volume(mL/day)', 150);
  // a critical alert: Save asks for a reason; cancelling does not save
  setField('KCl', 5);   // IV K 5 mEq/kg/d > 3.5 hard limit
  promptAnswer = null;
  await clickAsync(btnExact('Submit'));
  ok('cancelled critical reason → nothing saved', calls.onLog.length === 0 && toasts.some(t => /ต้องระบุเหตุผลก่อน/.test(t.msg)));
  promptAnswer = '   ';
  await clickAsync(btnExact('Submit'));
  ok('blank critical reason → nothing saved', calls.onLog.length === 0);
  promptAnswer = 'renal loss, K 2.9';
  await clickAsync(btnExact('Submit'));
  ok('reason given → saved once', calls.onLog.length === 1);
  ok('the override travels with the order', calls.onLog[0]?.calcInput?.critOverride?.reason === 'renal loss, K 2.9'
    && calls.onLog[0].calcInput.critOverride.alerts.includes('Potassium critically out of range'), calls.onLog[0]?.calcInput?.critOverride);
  printed = 0;
  act(() => { document.dispatchEvent(new window.CustomEvent('__neofeed_print')); });
  await act(async () => { await new Promise(r => setTimeout(r, 30)); });
  ok('Print after saving prints', printed === 1);
  ok('print form carries the override', /สั่งทั้งที่มีค่าวิกฤต: .*Potassium critically out of range/.test(container.querySelector('#print-form')?.textContent || ''));
  copied = null;
  await clickAsync([...container.querySelectorAll('button')].find(b => /Copy Order to Clipboard/.test(b.textContent)));
  ok('Copy after saving copies the order', typeof copied === 'string' && /TPN Order/.test(copied) && /CRITICAL OVERRIDE/.test(copied));
  // edit after save → dirty → print/copy refused, second save updates the same row
  setField('KCl', 4);
  ok('an edit after saving marks the form unsaved', /มีการแก้ไขที่ยังไม่ได้บันทึก/.test(text()));
  ok('the print form is withdrawn while unsaved', !container.querySelector('#print-form'));
  printed = 0; toasts.length = 0;
  act(() => { document.dispatchEvent(new window.CustomEvent('__neofeed_print')); });
  await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  ok('Print while unsaved is refused', printed === 0 && toasts.length > 0);
  promptAnswer = 'renal loss, K 2.9';
  await clickAsync(btnExact('Submit'));
  ok('second Save updates the same row (no duplicate)', calls.onLog.length === 1 && calls.onUpdate.length === 1 && calls.onUpdate[0].id === 'srv-9');
  // Delete: only when onDelete was given and the row exists
  confirmAnswer = false;
  click(btnExact('ลบบันทึกนี้'));
  ok('Delete cancelled at confirm → nothing deleted', calls.onDelete.length === 0);
  confirmAnswer = true;
  click(btnExact('ลบบันทึกนี้'));
  ok('Delete confirmed → onDelete with this entry', calls.onDelete.length === 1 && calls.onDelete[0].entryId === 'srv-9');
  // no onDelete prop → no delete button
  mount({ onDelete: undefined });
  ok('no delete button without admin permission', !btnExact('ลบบันทึกนี้'));

  // ── 9 · Dismiss on the prefill banner, draft restore / discard ─
  window.localStorage.setItem('neofeed_calc_CS-1', JSON.stringify({ curWtG: 1111, fluidTargetPerKg: 140, totalTPN_mL: 90, dexPct: 10, dol: 9, savedAt: new Date().toISOString() }));
  act(() => { root.unmount(); }); root = ReactDOM.createRoot(container);
  act(() => { root.render(React.createElement(window.Calculator, { patient: { sessionId: 'CS-1', name: 'Sweep', bw: 1000, admissionDate: '2026-09-01', currentBed: 'SCN 3', weights: [{ dol: 1, w: 1000 }] }, dol: 10, editEntry: null, baselineEntry: null, previousEntry: null, logDate: null, userLabel: 'Dr Sweep (sweep@kcmh.test)', userEmail: 'sweep@kcmh.test', onLog() {}, onUpdate() {}, onSaved() {}, onWeightChange() {} })); });
  ok('previous submission prefills the form', inputFor('Current weight').value === '1111' && /Prefilled from previous submission/.test(text()));
  click([...container.querySelectorAll('button')].find(b => b.textContent === 'Dismiss'));
  ok('Dismiss hides the prefill banner', !/Prefilled from previous submission/.test(text()));
  // a draft typed by this user is offered back; restore brings its values
  const today = D.todayLocal();
  window.localStorage.setItem(`neofeed_draft_CS-1_${today}`, JSON.stringify({ curWtG: 1234, fluidTargetPerKg: 155, totalTPN_mL: 88, savedAt: new Date().toISOString(), by: 'sweep@kcmh.test', baseLastModified: null }));
  act(() => { root.unmount(); }); root = ReactDOM.createRoot(container);
  act(() => { root.render(React.createElement(window.Calculator, { patient: { sessionId: 'CS-1', name: 'Sweep', bw: 1000, admissionDate: '2026-09-01', currentBed: 'SCN 3', weights: [{ dol: 1, w: 1000 }] }, dol: 10, editEntry: null, baselineEntry: null, previousEntry: null, logDate: null, userLabel: 'Dr Sweep (sweep@kcmh.test)', userEmail: 'sweep@kcmh.test', onLog() {}, onUpdate() {}, onSaved() {}, onWeightChange() {} })); });
  ok('own draft is offered', /มีข้อมูลที่กรอกค้างไว้แต่ยังไม่ได้บันทึก/.test(text()));
  click(btnExact('กู้คืน'));
  ok('กู้คืน restores the draft', inputFor('Current weight').value === '1234' && inputFor('Target fluid').value === '155');
  window.localStorage.setItem(`neofeed_draft_CS-1_${today}`, JSON.stringify({ curWtG: 1234, savedAt: new Date().toISOString(), by: 'sweep@kcmh.test' }));
  act(() => { root.unmount(); }); root = ReactDOM.createRoot(container);
  act(() => { root.render(React.createElement(window.Calculator, { patient: { sessionId: 'CS-1', name: 'Sweep', bw: 1000, admissionDate: '2026-09-01', currentBed: 'SCN 3', weights: [{ dol: 1, w: 1000 }] }, dol: 10, editEntry: null, baselineEntry: null, previousEntry: null, logDate: null, userLabel: 'Dr Sweep (sweep@kcmh.test)', userEmail: 'sweep@kcmh.test', onLog() {}, onUpdate() {}, onSaved() {}, onWeightChange() {} })); });
  click(btnExact('ทิ้ง'));
  ok('ทิ้ง discards the draft', !/มีข้อมูลที่กรอกค้างไว้/.test(text()) && window.localStorage.getItem(`neofeed_draft_CS-1_${today}`) === null);

  // ── 10 · Quick calc (scratch): no save, copy works, print refused ─
  act(() => { root.unmount(); }); root = ReactDOM.createRoot(container);
  act(() => { root.render(React.createElement(window.Calculator, { patient: { sessionId: null, bw: 0, weights: [] }, dol: 5, scratch: true, editEntry: null, baselineEntry: null, previousEntry: null, logDate: null, userLabel: '', userEmail: '' })); });
  ok('quick calc has no Save button', !btnExact('Submit'));
  ok('quick calc has no Intake/Output card', !inputFor('Urine output'));
  click(btnExact('Open all'));
  setField('Current weight', 2000); setField('Volume(mL/day)', 200); setField('Dextrose final', 10);
  copied = null;
  await clickAsync([...container.querySelectorAll('button')].find(b => /คัดลอกผลคำนวณ/.test(b.textContent)));
  ok('quick calc copies a non-order text', typeof copied === 'string' && /ไม่ใช่คำสั่งการรักษา/.test(copied) && !/NeoFeed ID/.test(copied));
  printed = 0; toasts.length = 0;
  act(() => { document.dispatchEvent(new window.CustomEvent('__neofeed_print')); });
  await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  ok('quick calc refuses to print', printed === 0 && toasts.some(t => /พิมพ์ใบสั่ง TPN ไม่ได้/.test(t.msg)));

  failures.forEach(f => console.log('  FAIL  ' + f));
  console.log(fail === 0
    ? `\nCALC CLICKS: ALL PASS (${pass} assertions)`
    : `\nCALC CLICKS: ${fail} FAILED of ${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.log('\nCALC CLICKS: threw — ' + (e && e.stack || e)); process.exit(1); });
