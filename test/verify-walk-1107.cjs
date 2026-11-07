// verify-walk-1107.cjs — the three fixes Pp picked from the 2026-11-07 stakeholder walk, before the
// 16 Nov ward start (CHANGELOG.md 2026-11-07).
//
//   §1 N1: on a doctor's order a nurse account saves Intake/Output only. A Submit that would change
//      anything else, or re-save an order the app holds (the calculation or the dosing weight moved,
//      a critical value unconfirmed), is refused with "ให้แพทย์ตรวจและกด Submit ใหม่", and a nurse
//      never answers the critical-value prompt. A doctor's Submit is unchanged.
//   §2 N1 end to end: the real calculator's saves, sent to the real gas-backend.gs. The backend
//      refuses the same nurse writes (a modified client cannot get past it), and the TPN room's
//      pharmacyOrders names the doctor who submitted, not the nurse who added I/O (P1).
//   §3 Top insight 3: an order held because the calculation or the dosing weight moved lists each
//      figure that changed, old against new, before it is saved again; Print ทั้งหมด's held list
//      carries the same changes.
//   §4 D13: the quick calc opens with no route, like the patient calculator.
//
// Mounts the real <Calculator> in jsdom; §2 also loads the real gas-backend.gs in gas-vm-sandbox.cjs.
// Synthetic infants only.
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');
const { boot, withNow, wardToday } = require('./gas-vm-sandbox.cjs');

const DIR = path.join(__dirname, '..') + '/';
const R = (f) => String(fs.readFileSync(DIR + f, 'utf8')).replace(/\r\n/g, '\n');

let pass = 0, fail = 0, n = 0;
function eq(name, got, want) {
  const yes = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${yes ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(78)}${yes ? '' : ` got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
  yes ? pass++ : fail++;
}
function section(title) { console.log(`\n── ${title} ──`); }

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
global.showToast = (msg) => { toasts.push(String(msg)); };
window.print = () => {};
let asked = 0, answer = null;
window.confirm = () => { asked++; return true; };
window.prompt = () => { asked++; return answer; };
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

// The ward's today, pinned: the calculator and the sandboxed backend read the same day, at noon ICT.
const TODAY = wardToday();
const NOON = Date.parse(TODAY + 'T05:00:00Z');
D.todayLocal = () => TODAY;

const NURSE_TEXT = 'ใบสั่งนี้ต้องให้แพทย์ตรวจและกด Submit ใหม่ พยาบาลบันทึกได้เฉพาะ I/O';
const OLD_VERSION = '2026-10-28.1';

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
const settle = async (el) => {
  await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await act(async () => { await new Promise(r => setTimeout(r, 20)); });
};
const submitBtn = () => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Submit') || null;
const draftBtn = () => container.querySelector('button.save-draft');
const routeBtns = () => [...container.querySelectorAll('.step2-ctrl .seg button')];
const routeBtn = (name) => routeBtns().find(b => b.textContent.trim() === name);
const nurseNote = () => container.querySelector('.nurse-doctor-submits')?.textContent || '';
const heldBox = () => container.querySelector('.held-changes');
const heldRows = () => [...container.querySelectorAll('.held-changes li')].map(li => li.textContent.replace(/\s+/g, ' ').trim());

const PT = { sessionId: 'NF-900311', name: 'WK', bw: 1600, currentBed: 'NICU 3', diagnosis: '-',
  weights: [{ dol: 1, w: 1600 }], admissionDate: '2026-11-01' };
const DOCTOR = { userLabel: 'Dr Test (doc@kcmh.test)', userEmail: 'doc@kcmh.test' };
const NURSE = { userLabel: 'Nurse Test (nurse@kcmh.test)', userEmail: 'nurse@kcmh.test', nurseAccount: true };
const BASE = { patient: PT, dol: 10, editEntry: null, baselineEntry: null, previousEntry: null, logDate: TODAY,
  onSaved() {}, onWeightChange() {} };
// Saves only: a Submit also locks what it saved (onPublish), which writes no order.
const rec = () => {
  const all = [];
  const calls = { get length() { return all.filter(c => c[0] !== 'publish').length; },
    get 0() { return all.filter(c => c[0] !== 'publish')[0]; } };
  const push = (c) => all.push(c);
  return { calls, all,
    onLog(e) { push(['log', e]); return Promise.resolve({ ok: true, entryId: 'e-new', lastModified: 'lm-new' }); },
    onUpdate(id, lm, e) { push(['update', id, lm, e]); return Promise.resolve({ ok: true, revised: true, entryId: 'e-rev', lastModified: 'lm-u', revisionNumber: 2 }); },
    onPublish(id, lm) { push(['publish', id, lm]); return Promise.resolve({ ok: true, publishedAt: TODAY + 'T03:00:00Z' }); } };
};
function mount(props) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear();
  toasts.length = 0;
  act(() => { root.render(React.createElement(window.Calculator, { ...BASE, ...props })); });
  act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
}
function fillBag() {
  click(routeBtn('Central'));
  setField('Current weight', 1600);
  ['Target fluid', 'Other IV', 'Drug volume', 'Input', 'Urine output', 'Drain content'].forEach(l => setField(l, l === 'Target fluid' ? 150 : 0));
  setField('Volume(mL/day)', 160); setField('ปริมาตรคาสาย (dead space)', 30);
  setField('Dextrose final', 10); setField('Amino acid', 2); setField('20% lipid', 2);
  setField('20% NaCl', 2); setField('KCl', 2.5); setField('MgSO₄', 4.861);
}
const row = (e, over) => ({ ...e, entryId: 'e1', lastModified: 'lm1', ts: TODAY, revisionNumber: 1, published: '', ...over });
const oldVersion = (e) => ({ ...e, constantsVersion: OLD_VERSION, calcInput: { ...e.calcInput, constantsVersion: OLD_VERSION } });

(async () => {
  // Real doctor saves, so every row reopened below is what the app really stores.
  const a = rec(); mount({ ...DOCTOR, ...a }); fillBag(); await settle(submitBtn());
  const bag = a.calls[0][1];
  answer = 'synthetic reason';
  const c = rec(); mount({ ...DOCTOR, ...c }); fillBag(); setField('KCl', 6); await settle(submitBtn());
  answer = null;
  const confirmed = c.calls[0][1];
  const { critOverride, ...unconfirmedCi } = confirmed.calcInput;
  const unconfirmed = { ...confirmed, calcInput: unconfirmedCi };

  section('§1 N1 · on a doctor\'s order a nurse saves I/O only; any other Submit goes back to a doctor');
  // The walk's case: the calculation moved since the doctor's Submit, the nurse typed nothing.
  let s = rec(); mount({ ...NURSE, editEntry: row(oldVersion(bag)), ...s });
  eq('a held order opened by a nurse says a doctor must check and Submit it', nurseNote().includes(NURSE_TEXT), true);
  await settle(submitBtn());
  eq('…the nurse\'s Submit saves nothing', s.calls.length, 0);
  eq('…and the toast gives the same words', toasts.includes(NURSE_TEXT), true);
  // Seen on dev local: the doctor's own lines ("กด Submit อีกครั้ง", "โทรแจ้งห้อง TPN") stacked under hers.
  eq('…with none of the doctor\'s Submit-again or phone-the-room lines under it',
    [!!container.querySelector('.revise-phone-note'), !!container.querySelector('.sticker-figures-missing')], [false, false]);
  s = rec(); mount({ ...DOCTOR, editEntry: row(oldVersion(bag)), ...s });
  eq('a doctor on the same order still has the phone-the-room line', !!container.querySelector('.revise-phone-note'), true);

  s = rec(); mount({ ...NURSE, editEntry: row(bag), ...s });
  eq('a settled order opened by a nurse: no refusal line', nurseNote(), '');
  setField('Input', 120); setField('Urine output', 40);
  eq('…Intake/Output typed: still no refusal line', nurseNote(), '');
  asked = 0;
  await settle(submitBtn());
  eq('…Submit saves the I/O as a revision of the submitted order', [s.calls.length, s.calls[0]?.[0], s.calls[0]?.[3].status], [1, 'update', 'submitted']);
  eq('…carrying the typed Intake/Output', [s.calls[0]?.[3].ioInput, s.calls[0]?.[3].ioOutput], [120, 40]);
  eq('…and every TPN figure as the doctor saved it', ['gir', 'pro', 'kcal', 'na', 'k'].map(k => s.calls[0]?.[3][k]), ['gir', 'pro', 'kcal', 'na', 'k'].map(k => bag[k]));

  s = rec(); mount({ ...NURSE, editEntry: row(bag), ...s });
  setField('Input', 120); setField('Amino acid', 2.5);
  eq('a nurse changing a TPN dose sees the refusal line', nurseNote().includes(NURSE_TEXT), true);
  await settle(submitBtn());
  eq('…and Submit saves nothing', s.calls.length, 0);

  s = rec(); mount({ ...NURSE, editEntry: row({ ...bag, calcInput: { ...bag.calcInput, tpnWtG: 1500 } }), ...s });
  await settle(submitBtn());
  eq('the dosing weight moved since the Submit: a nurse\'s Submit saves nothing', [s.calls.length, nurseNote().includes(NURSE_TEXT)], [0, true]);

  s = rec(); mount({ ...NURSE, editEntry: row(unconfirmed), ...s });
  asked = 0;
  await settle(submitBtn());
  eq('a critical value nobody confirmed: a nurse is never asked for the reason', asked, 0);
  eq('…and nothing is saved', s.calls.length, 0);

  s = rec(); mount({ ...NURSE, editEntry: row(confirmed), ...s });
  setField('Input', 90);
  asked = 0;
  await settle(submitBtn());
  eq('a critical value the doctor confirmed: the nurse\'s I/O saves without the prompt', [asked, s.calls.length], [0, 1]);
  eq('…and keeps the doctor\'s confirmation and reason', s.calls[0]?.[3].calcInput.critOverride, critOverride);

  s = rec(); mount({ ...NURSE, ...s }); fillBag();
  await settle(submitBtn());
  eq('a nurse\'s new order: Submit saves nothing', s.calls.length, 0);
  eq('…with the refusal line', nurseNote().includes(NURSE_TEXT), true);
  await settle(draftBtn());
  eq('…Save draft still keeps it, as a draft for a doctor to Submit', [s.calls.length, s.calls[0]?.[1].status], [1, 'draft']);

  s = rec(); mount({ ...NURSE, editEntry: row(oldVersion(bag), { status: 'draft' }), ...s });
  await settle(submitBtn());
  eq('a doctor\'s draft opened by a nurse: Submit saves nothing', s.calls.length, 0);

  s = rec(); mount({ ...DOCTOR, editEntry: row(oldVersion(bag)), ...s });
  eq('a doctor sees no refusal line', nurseNote(), '');
  await settle(submitBtn());
  eq('…and the doctor\'s Submit of the held order saves, as before', [s.calls.length, s.calls[0]?.[0]], [1, 'update']);

  eq('app.jsx hands the Calculator the nurse role', /nurseAccount=\{role === "nurse"\}/.test(R('app.jsx')), true);
  s = rec(); mount({ ...NURSE, ordersReadOnly: true, editEntry: row(bag), ...s });
  eq('the nursing switch on (read-only orders): no Submit and no refusal line', [!!submitBtn(), nurseNote()], [false, '']);

  section('§2 N1 end to end · the real saves against the real backend');
  const g = boot();
  g.addStaff('doc@kcmh.test', 'doctor', 'Doctor-Password-1', { name: 'Dr Test' });
  g.addStaff('nurse@kcmh.test', 'nurse', 'Nurse-Password-1', { name: 'Nurse Test' });
  g.addStaff('rx@kcmh.test', 'pharmacy', 'Pharmacy-Password-1', { name: 'Rx Test' });
  const dt = g.session('doc@kcmh.test', 'doctor'), nt = g.session('nurse@kcmh.test', 'nurse'), rt = g.session('rx@kcmh.test', 'pharmacy');
  const as = (tok, body) => withNow(NOON, () => g.post(Object.assign({ token: tok }, body)));
  as(dt, { action: 'registerPatient', isNew: true, patient: { ...PT, initials: 'WK', ga: 32.1, sex: 'boys', dob: '2026-11-01',
    twinSuffix: '', status: 'Active', lengths: [], hcs: [], bedHistory: [], statusDate: '', multiplesCount: 0 } });
  const first = as(dt, { action: 'logDailyNutrition', sessionId: PT.sessionId, entry: bag });
  eq('the doctor\'s real Submit lands', !!first.entryId, true);
  const L = () => g.sheet('Daily_Log').data;
  const saved = { ...bag, entryId: first.entryId, lastModified: first.lastModified };

  // The nurse's real I/O save, made on the row the backend now holds.
  s = rec(); mount({ ...NURSE, editEntry: row(saved, { entryId: first.entryId, lastModified: first.lastModified }), ...s });
  setField('Input', 120);
  await settle(submitBtn());
  const ioEntry = s.calls[0]?.[3];
  const io = as(nt, { action: 'updateDailyNutrition', sessionId: PT.sessionId, entryId: first.entryId,
    expectedLastModified: first.lastModified, entry: ioEntry });
  eq('the nurse\'s real I/O save lands as a revision', [io.ok, io.revised], [true, true]);
  eq('…its AC holds the nurse\'s Input', L()[L().length - 1][28], 120);

  const room = as(rt, { action: 'pharmacyOrders', date: TODAY });
  const ord = (room.orders || []).find(o => o.sessionId === PT.sessionId);
  eq('the TPN room names the doctor who submitted, not the nurse who added I/O (P1)', ord?.prescriber, 'Dr Test');

  // A modified client: the nurse's payload with a TPN dose changed, or as a held re-submit.
  const latestId = io.entryId, latestLm = io.lastModified;
  const dosed = { ...ioEntry, gir: 9, calcInput: { ...ioEntry.calcInput, aaPerKg: 3 } };
  const r1 = as(nt, { action: 'updateDailyNutrition', sessionId: PT.sessionId, entryId: latestId, expectedLastModified: latestLm, entry: dosed });
  eq('the backend refuses a nurse\'s Submit that changes a TPN dose, in the same words', r1.error, NURSE_TEXT);
  const moved = { ...ioEntry, constantsVersion: OLD_VERSION, calcInput: { ...ioEntry.calcInput, constantsVersion: OLD_VERSION } };
  const r2 = as(nt, { action: 'updateDailyNutrition', sessionId: PT.sessionId, entryId: latestId, expectedLastModified: latestLm, entry: moved });
  eq('…and one computed on other constants than the order it revises', r2.error, NURSE_TEXT);
  const asDraft = { ...ioEntry, status: 'draft' };
  const r3 = as(nt, { action: 'updateDailyNutrition', sessionId: PT.sessionId, entryId: latestId, expectedLastModified: latestLm, entry: asDraft });
  eq('…and a draft over the submitted order (it would leave the TPN room)', r3.error, NURSE_TEXT);
  as(dt, { action: 'registerPatient', isNew: true, confirmDuplicate: true, patient: { ...PT, sessionId: 'NF-900312', initials: 'WL', currentBed: 'NICU 4', ga: 32.1,
    sex: 'boys', dob: '2026-11-01', twinSuffix: '', status: 'Active', lengths: [], hcs: [], bedHistory: [], statusDate: '', multiplesCount: 0 } });
  const fresh = as(nt, { action: 'logDailyNutrition', sessionId: 'NF-900312', entry: bag });
  eq('…and a nurse\'s new order sent as submitted', fresh.error, NURSE_TEXT);
  eq('nothing the backend refused was written', L().length - 1, 2);
  const nDraft = as(nt, { action: 'logDailyNutrition', sessionId: 'NF-900312', entry: { ...bag, status: 'draft' } });
  eq('…while a nurse\'s new order saved as a draft lands', !!nDraft.entryId, true);
  const doc = as(dt, { action: 'updateDailyNutrition', sessionId: PT.sessionId, entryId: latestId, expectedLastModified: latestLm, entry: dosed });
  eq('the same change from the doctor\'s account lands', [doc.revised, doc.error], [true, undefined]);

  section('§3 Top insight 3 · a held order lists each changed figure, old against new');
  eq('the current CONSTANTS_VERSION has its line (a bump adds one)', D.CONSTANTS_CHANGES[0][0], D.CONSTANTS_VERSION);
  eq('a Submit saves the figures it printed (calcInput.printedFigures)',
    !!bag.calcInput.printedFigures && typeof bag.calcInput.printedFigures.d50wMl === 'string', true);
  // The backend refuses a calcInput over 10,000 characters (CALC_INPUT_MAX_CHARS): the figures must leave room for
  // the fullest confirmation, 15 critical titles and the 300 characters Submit allows a reason.
  const fullest = { ...confirmed.calcInput, critOverride: { reason: 'ร'.repeat(300),
    alerts: Array(15).fill('Lipid rate above the ceiling (synthetic long title)'), at: new Date().toISOString() } };
  const size = JSON.stringify(fullest).length;
  console.log(`  (calcInput at its fullest: ${size} characters, printedFigures ${JSON.stringify(bag.calcInput.printedFigures).length})`);
  eq('the fullest calcInput with its figures stays under half the backend\'s 10,000-character cap', size < 5000, true);
  const tampered = (e, figs) => ({ ...e, calcInput: { ...e.calcInput, printedFigures: { ...e.calcInput.printedFigures, ...figs } } });
  mount({ ...DOCTOR, editEntry: row(oldVersion(bag)), ...rec() });
  eq('held, every figure still the same: the box says nothing moved on this order',
    [!!heldBox(), heldRows().length, /ไม่เปลี่ยน/.test(heldBox()?.textContent || '')], [true, 0, true]);
  const liveD50 = bag.calcInput.printedFigures.d50wMl, liveRate = bag.calcInput.printedFigures.lipidRate;
  mount({ ...DOCTOR, editEntry: row(oldVersion(tampered(bag, { d50wMl: '1', lipidRate: '0.84' }))), ...rec() });
  eq('held, two figures differ: each is listed, and only those', heldRows().length, 2);
  eq('…D50W, old against new', heldRows().some(t => t.includes('D50W') && t.includes(`1 → ${liveD50}`)), true);
  eq('…the lipid pump rate, old against new', heldRows().some(t => t.includes('Lipid pump rate') && t.includes(`0.84 → ${liveRate}`)), true);
  eq('…with a line naming what this NeoFeed version changed', /2026-11-06\.1/.test(container.querySelector('.held-version-note')?.textContent || ''), true);

  const { printedFigures, ...legacyCi } = bag.calcInput;
  mount({ ...DOCTOR, editEntry: row(oldVersion({ ...bag, gir: 99, calcInput: legacyCi })), ...rec() });
  eq('an order saved before the figures were kept: the stored columns are compared',
    heldRows().length === 1 && heldRows()[0].includes('GIR') && heldRows()[0].includes('99 →'), true);
  eq('…and the box says only those were compared', /เทียบได้เฉพาะ/.test(heldBox()?.textContent || ''), true);

  mount({ ...DOCTOR, editEntry: row(tampered({ ...bag, calcInput: { ...bag.calcInput, tpnWtG: 1500 } }, { wtKg: '1.5' })), ...rec() });
  eq('held because the dosing weight moved: the weight is listed, old against new',
    heldRows().some(t => t.includes('Weight for calculation') && t.includes('1.5 → 1.6')), true);

  mount({ ...DOCTOR, editEntry: row(bag), ...rec() });
  eq('a settled order shows no box', !!heldBox(), false);

  let reason = null;
  await act(async () => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  await act(async () => {
    root.render(React.createElement(window.Calculator, { ...BASE, ...DOCTOR, ...rec(),
      editEntry: row(oldVersion(tampered(bag, { d50wMl: '1' }))), autoPrint: 'tok-1', requestPrint: (r) => { reason = r; } }));
  });
  await act(async () => { await new Promise(r => setTimeout(r, 1700)); });
  eq('Print ทั้งหมด\'s held reason carries the change too', typeof reason === 'string' && reason.includes(`D50W 1 → ${liveD50}`), true);

  section('§4 D13 · the quick calc opens with no route');
  const SCRATCH = { sessionId: null, name: null, initials: null, bw: 0, ga: 0, sex: '', currentBed: '', diagnosis: '',
    weights: [], lengths: [], hcs: [] };
  mount({ patient: SCRATCH, scratch: true, userLabel: '', userEmail: '' });
  eq('no route button is pressed', routeBtns().filter(b => b.classList.contains('on')).map(b => b.textContent.trim()), []);
  eq('…and Step 3 says none is chosen, as on a patient\'s first order', !!container.querySelector('.route-missing'), true);
  mount({ ...DOCTOR, ...rec() });
  eq('a patient\'s first order: no route either (unchanged)', routeBtns().filter(b => b.classList.contains('on')).length, 0);

  act(() => { root.unmount(); });
  console.log(`\nWALK 1107: ${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
