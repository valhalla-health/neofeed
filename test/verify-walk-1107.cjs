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
  const byDoc = (e, over) => row(e, { lastModifiedBy: 'doc@kcmh.test', submittedBy: 'doc@kcmh.test', ...over });
  let s = rec(); mount({ ...NURSE, editEntry: byDoc(oldVersion(bag)), ...s });
  eq('a held order opened by a nurse says a doctor must check and Submit it', nurseNote().includes(NURSE_TEXT), true);
  eq('…and with nothing typed her Submit is off', submitBtn()?.disabled, true);
  // Pp, 2026-11-07: "IO ... ไม่เกี่ยวกับใบสั่ง TPN" — the workflow check found a held order took no I/O at all.
  setField('Urine output', 22);
  await settle(submitBtn());
  eq('…her I/O on it saves', [s.calls.length, s.calls[0]?.[3].ioOutput], [1, 22]);
  eq('…sending the order as stored, on its own constants (the server writes the stored row)',
    [s.calls[0]?.[3].constantsVersion, s.calls[0]?.[3].calcInput.constantsVersion, s.calls[0]?.[3].gir], [OLD_VERSION, OLD_VERSION, bag.gir]);
  eq('…and the order is still held for a doctor after it', /ปรับการคำนวณ/.test(container.querySelector('.print-blocked')?.textContent || ''), true);
  // Seen on dev local: the doctor's own lines ("กด Submit อีกครั้ง", "โทรแจ้งห้อง TPN") stacked under hers.
  eq('…with none of the doctor\'s Submit-again or phone-the-room lines under it',
    [!!container.querySelector('.revise-phone-note'), !!container.querySelector('.sticker-figures-missing')], [false, false]);
  s = rec(); mount({ ...DOCTOR, editEntry: row(oldVersion(bag)), ...s });
  eq('a doctor on the same order still has the phone-the-room line', !!container.querySelector('.revise-phone-note'), true);

  s = rec(); mount({ ...NURSE, editEntry: row(bag), ...s });
  eq('a settled order opened by a nurse: no refusal line', nurseNote(), '');
  eq('…and nothing typed: Submit is off (nothing to save, nothing for her to lock)', submitBtn()?.disabled, true);
  setField('Input', 120); setField('Urine output', 40);
  eq('…Intake/Output typed: still no refusal line', nurseNote(), '');
  asked = 0;
  await settle(submitBtn());
  eq('…Submit saves the I/O as a revision of the submitted order', [s.calls.length, s.calls[0]?.[0], s.calls[0]?.[3].status], [1, 'update', 'submitted']);
  // Pen test, 2026-11-07: a nurse's lock on a submitted order set the room's Submit time to hers. She locks nothing.
  eq('…and sends no lock after it', s.all.filter(c => c[0] === 'publish').length, 0);
  eq('…carrying the typed Intake/Output', [s.calls[0]?.[3].ioInput, s.calls[0]?.[3].ioOutput], [120, 40]);
  eq('…and every TPN figure as the doctor saved it', ['gir', 'pro', 'kcal', 'na', 'k'].map(k => s.calls[0]?.[3][k]), ['gir', 'pro', 'kcal', 'na', 'k'].map(k => bag[k]));

  s = rec(); mount({ ...NURSE, editEntry: row(bag), ...s });
  setField('Input', 120); setField('Amino acid', 2.5);
  eq('a nurse changing a TPN dose sees the refusal line', nurseNote().includes(NURSE_TEXT), true);
  await settle(submitBtn());
  eq('…and Submit saves nothing', s.calls.length, 0);

  s = rec(); mount({ ...NURSE, editEntry: byDoc({ ...bag, calcInput: { ...bag.calcInput, tpnWtG: 1500 } }), ...s });
  eq('the dosing weight moved since the Submit: the line says a doctor must Submit', nurseNote().includes(NURSE_TEXT), true);
  setField('Input', 70);
  await settle(submitBtn());
  eq('…her I/O saves, with the dosing weight as stored', [s.calls.length, s.calls[0]?.[3].calcInput.tpnWtG], [1, 1500]);

  s = rec(); mount({ ...NURSE, editEntry: byDoc(unconfirmed), ...s });
  setField('Input', 70);
  asked = 0;
  await settle(submitBtn());
  eq('a critical value nobody confirmed: a nurse is never asked for the reason', asked, 0);
  eq('…her I/O saves, and no confirmation is added', [s.calls.length, s.calls[0]?.[3].calcInput.critOverride], [1, undefined]);

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

  // Pp, 2026-11-07 ("ได้แค่ I/O เหมือนกัน"): on a doctor's draft a nurse's Save draft is I/O only too.
  const docDraft = row({ ...bag, status: 'draft' }, { status: 'draft', lastModifiedBy: 'doc@kcmh.test', submittedBy: 'doc@kcmh.test' });
  s = rec(); mount({ ...NURSE, editEntry: docDraft, ...s });
  setField('Amino acid', 2.5);
  await settle(draftBtn());
  eq('a doctor\'s draft: a nurse\'s Save draft that changes a dose saves nothing', [s.calls.length, toasts.includes(NURSE_TEXT)], [0, true]);
  s = rec(); mount({ ...NURSE, editEntry: docDraft, ...s });
  setField('Input', 110);
  await settle(draftBtn());
  eq('…one that changes only I/O saves, as a draft', [s.calls.length, s.calls[0]?.[3].status, s.calls[0]?.[3].ioInput], [1, 'draft', 110]);
  toasts.length = 0;
  setField('Amino acid', 2.5);
  await settle(draftBtn());
  eq('…and after it, in the same visit, a dose change is still refused (Vera\'s third review)', [s.calls.length, toasts.includes(NURSE_TEXT)], [1, true]);
  s = rec(); mount({ ...NURSE, editEntry: { ...docDraft, lastModifiedBy: 'nurse@kcmh.test', calcInput: { ...docDraft.calcInput, orderBy: 'doc@kcmh.test' } }, ...s });
  setField('Amino acid', 2.5);
  await settle(draftBtn());
  eq('…a draft a nurse last saved but a doctor ordered (orderBy) stays the doctor\'s', s.calls.length, 0);
  s = rec(); mount({ ...NURSE, editEntry: { ...docDraft, lastModifiedBy: 'nurse@kcmh.test', submittedBy: 'nurse@kcmh.test' }, ...s });
  setField('Amino acid', 2.5);
  await settle(draftBtn());
  eq('…her own draft she may change freely', [s.calls.length, s.calls[0]?.[3].status], [1, 'draft']);

  s = rec(); mount({ ...DOCTOR, editEntry: row(oldVersion(bag)), ...s });
  eq('a doctor sees no refusal line', nurseNote(), '');
  await settle(submitBtn());
  eq('…and the doctor\'s Submit of the held order saves, as before', [s.calls.length, s.calls[0]?.[0]], [1, 'update']);

  // Workflow check, 2026-11-07: after a nurse's I/O revisions the sheet read "Revision · ฉบับที่ 3" and the Save card
  // named the nurse. The order's own save (calcInput.orderBy, orderRev, orderAt) is what they show.
  const ioRev = row({ ...bag, calcInput: { ...bag.calcInput, orderBy: 'doc@kcmh.test', orderRev: 1, orderAt: TODAY + 'T02:00:00.000Z' } },
    { revisionNumber: 3, lastModifiedBy: 'nurse@kcmh.test', submittedBy: 'doc@kcmh.test' });
  mount({ ...DOCTOR, editEntry: ioRev, ...rec() });
  eq('the sheet of an order a nurse added I/O to twice: no "Revision" box', [!!container.querySelector('#print-form'), !!container.querySelector('.print-revision')], [true, false]);
  eq('…and the order names the doctor, not the nurse', /doc@kcmh\.test|Dr Test/.test(container.querySelector('.print-saved-by')?.textContent || '')
    && !/nurse@/.test(container.querySelector('.print-saved-by')?.textContent || ''), true);
  mount({ ...DOCTOR, editEntry: row({ ...bag, calcInput: { ...bag.calcInput, orderRev: 3 } }, { revisionNumber: 3 }), ...rec() });
  eq('a doctor\'s third revision still prints its box', container.querySelector('.print-revision')?.textContent.includes('3'), true);
  s = rec(); mount({ ...NURSE, editEntry: ioRev, ...s });
  setField('Input', 95);
  await settle(submitBtn());
  eq('a nurse\'s I/O save sends whose order it stays, for the ward\'s copy', [s.calls[0]?.[3].calcInput.orderBy, s.calls[0]?.[3].calcInput.orderRev], ['doc@kcmh.test', 1]);
  s = rec(); mount({ ...DOCTOR, editEntry: ioRev, ...s });
  setField('Amino acid', 2.5);
  await settle(submitBtn());
  eq('a doctor\'s change after it counts the order\'s revisions (2), not the rows (4)', s.calls[0]?.[3].calcInput.orderRev, 2);
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
  // Workflow check, 2026-11-07: a nurse's I/O revision printed "Revision · ฉบับที่ 2" and the room read "ฉบับ 2".
  eq('…and keeps the revision pharmacy has (ฉบับ 1), not the nurse\'s I/O row\'s', ord?.revision, 1);
  eq('…the stored row keeps whose order it is, and its revision', (() => { const ci = JSON.parse(L()[L().length - 1][24]); return [ci.orderBy, ci.orderRev]; })(), ['doc@kcmh.test', 1]);
  const nLock = as(nt, { action: 'publishLog', sessionId: PT.sessionId, entryId: io.entryId, expectedLastModified: io.lastModified });
  eq('a nurse cannot lock a submitted order either (pen test)', [nLock.error, L()[L().length - 1][33]], [NURSE_TEXT, '']);

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
  // Vera's second review: a nurse locked a doctor's draft (publishLog), and her next save read it as submitted.
  const dDraft = as(dt, { action: 'updateDailyNutrition', sessionId: 'NF-900312', entryId: nDraft.entryId,
    expectedLastModified: nDraft.lastModified, entry: { ...bag, status: 'draft' } });
  const lock = as(nt, { action: 'publishLog', sessionId: 'NF-900312', entryId: nDraft.entryId, expectedLastModified: dDraft.lastModified });
  const draftRow = () => L().find(r => r[25] === nDraft.entryId);
  eq('a nurse cannot lock a doctor\'s draft', [lock.error, draftRow()[33]], [NURSE_TEXT, '']);
  draftRow()[33] = TODAY + 'T02:00:00.000Z';   // a draft locked anyway (an older backend, a hand edit)
  const overLocked = as(nt, { action: 'updateDailyNutrition', sessionId: 'NF-900312', entryId: nDraft.entryId,
    expectedLastModified: dDraft.lastModified, entry: { ...bag } });
  eq('…and a locked draft is still a draft: her Submit on it is refused', overLocked.error, NURSE_TEXT);
  const roomD = as(rt, { action: 'pharmacyOrders', date: TODAY });
  eq('…so the room has no submitted order for that infant', (roomD.orders || []).filter(o => o.sessionId === 'NF-900312').map(o => o.status), ['draft']);
  // Pp, 2026-11-07: a doctor's draft takes I/O only from a nurse, written from the stored row.
  const curDraft = draftRow();
  const dDose = as(nt, { action: 'updateDailyNutrition', sessionId: 'NF-900312', entryId: nDraft.entryId, expectedLastModified: dDraft.lastModified,
    entry: { ...bag, status: 'draft', gir: 9.5, calcInput: { ...bag.calcInput, aaPerKg: 3 } } });
  eq('a doctor\'s draft: the backend refuses a nurse\'s dose change', dDose.error, NURSE_TEXT);
  const dIo = as(nt, { action: 'updateDailyNutrition', sessionId: 'NF-900312', entryId: nDraft.entryId, expectedLastModified: dDraft.lastModified,
    entry: { ...bag, status: 'draft', gir: 9.5, calcInput: { ...bag.calcInput, ioInput: 66 } } });
  const ioDraftRow = L()[L().length - 1];
  eq('…takes her I/O as a draft, with the doctor\'s figures', [!!(dIo.ok || dIo.entryId), ioDraftRow[14], ioDraftRow[28], ioDraftRow[5]], [true, 'draft', 66, curDraft[5]]);
  // Vera's third review: her I/O save made her the row's last saver, and her next save could change any dose.
  const dDose2 = as(nt, { action: 'updateDailyNutrition', sessionId: 'NF-900312', entryId: dIo.entryId || nDraft.entryId,
    expectedLastModified: dIo.lastModified, entry: { ...bag, status: 'draft', calcInput: { ...bag.calcInput, aaPerKg: 3 } } });
  eq('…and after her I/O save it is still the doctor\'s: a dose change is refused', dDose2.error, NURSE_TEXT);
  eq('…the row still names the doctor as whose order it is', JSON.parse(L()[L().length - 1][24]).orderBy, 'doc@kcmh.test');
  const roomD2 = as(rt, { action: 'pharmacyOrders', date: TODAY });
  eq('…and the room names the doctor on that draft, not the nurse who added I/O', (roomD2.orders || []).find(o => o.sessionId === 'NF-900312')?.prescriber, 'Dr Test');
  as(dt, { action: 'registerPatient', isNew: true, confirmDuplicate: true, patient: { ...PT, sessionId: 'NF-900313', initials: 'WM', currentBed: 'NICU 5', ga: 32.1,
    sex: 'boys', dob: '2026-11-01', twinSuffix: '', status: 'Active', lengths: [], hcs: [], bedHistory: [], statusDate: '', multiplesCount: 0 } });
  const own = as(nt, { action: 'logDailyNutrition', sessionId: 'NF-900313', entry: { ...bag, status: 'draft' } });
  const ownEdit = as(nt, { action: 'updateDailyNutrition', sessionId: 'NF-900313', entryId: own.entryId, expectedLastModified: own.lastModified,
    entry: { ...bag, status: 'draft', calcInput: { ...bag.calcInput, aaPerKg: 3 } } });
  eq('…while her own draft she may change freely', [ownEdit.error, ownEdit.ok], [undefined, true]);
  // Vera's fourth review: a draft from before orderBy that a doctor created and a nurse last saved was read as hers.
  const ownRow = L().find(r => r[25] === own.entryId);
  const { orderBy: _ob, ...noOrderBy } = JSON.parse(ownRow[24]);
  ownRow[24] = JSON.stringify(noOrderBy); ownRow[15] = 'doc@kcmh.test'; ownRow[27] = 'nurse@kcmh.test';
  const legacy = as(nt, { action: 'updateDailyNutrition', sessionId: 'NF-900313', entryId: own.entryId, expectedLastModified: ownEdit.lastModified,
    entry: { ...bag, status: 'draft', calcInput: { ...bag.calcInput, aaPerKg: 3.5 } } });
  eq('a draft from before orderBy, created by a doctor and last saved by a nurse: her dose change is refused', legacy.error, NURSE_TEXT);
  const doc = as(dt, { action: 'updateDailyNutrition', sessionId: PT.sessionId, entryId: latestId, expectedLastModified: latestLm, entry: dosed });
  eq('the same change from the doctor\'s account lands', [doc.revised, doc.error], [true, undefined]);

  // Vera on this change: a modified client keeps calcInput the order's and changes what sits beside it,
  // the figure columns and the sticker figures. The revision is written from the stored row instead.
  const docRow = L()[L().length - 1];
  const forged = { ...ioEntry, gir: 9.5, weight: 2500, route: 'TPN peripheral', calcInput: { ...dosed.calcInput, ioInput: 77 },
    printJson: { ...ioEntry.printJson, stockMl: { ...ioEntry.printJson.stockMl, kcl: '9.9' } } };
  const fg = as(nt, { action: 'updateDailyNutrition', sessionId: PT.sessionId, entryId: doc.entryId, expectedLastModified: doc.lastModified, entry: forged });
  const fgRow = L()[L().length - 1];
  eq('a nurse\'s I/O save with forged figures beside an unchanged order lands…', [fg.revised, fgRow[28]], [true, 77]);
  eq('…with the figure columns as the doctor stored them', [5, 3, 13].map(c => fgRow[c]), [5, 3, 13].map(c => docRow[c]));
  eq('…and the sticker figures as the doctor stored them', fgRow[38], docRow[38]);
  eq('…and the doctor\'s order in calcInput, with her Input', (() => { const ci = JSON.parse(fgRow[24]), was = JSON.parse(docRow[24]);
    return [ci.aaPerKg, ci.ioInput, ci.critOverride === undefined] ; })(), [JSON.parse(docRow[24]).aaPerKg, 77, JSON.parse(docRow[24]).critOverride === undefined]);

  // Vera on this change: every nurse I/O save is a revision, so a room that printed the doctor's row read
  // "หมอแก้ order หลังพิมพ์" though no figure moved. The server says which rows carry the same bag.
  const Core = require('../tpn-room-core.js');
  const room2 = as(rt, { action: 'pharmacyOrders', date: TODAY });
  const ord2 = (room2.orders || []).find(o => o.sessionId === PT.sessionId);
  eq('the room names the doctor after the forged save too', ord2?.prescriber, 'Dr Test');
  // Vera's fourth review: the doctor's change after a nurse's I/O save is ฉบับ 2, not the row number 3.
  eq('the doctor\'s change after a nurse\'s I/O save is the order\'s ฉบับ 2, in the row and in the room',
    [JSON.parse(docRow[24]).orderRev, ord2?.revision], [2, 2]);
  eq('the room lists the doctor\'s row as the same bag', (ord2?.sameBagEntryIds || []).includes(doc.entryId), true);
  const printed = (id) => [{ sessionId: PT.sessionId, date: TODAY, entryId: id }];
  eq('a print of the doctor\'s row is not "changed after print"', Core.changedAfterPrint(ord2, printed(doc.entryId), TODAY), false);
  eq('a print of the row before the doctor\'s change still is', Core.changedAfterPrint(ord2, printed(latestId), TODAY), true);
  eq('the print-time recheck lets the I/O revision through', !!Core.recheck({ sessionId: PT.sessionId, entryId: doc.entryId }, room2.orders).order, true);

  section('§3 Top insight 3 · a held order lists each changed figure, old against new');
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
  // Pp, 2026-11-07: "พวกคำบรรยายพวกนี้ไม่ต้องโชว์ได้ไหม" — no version lines, no note about what was compared.
  eq('…and no description under the list', [!!container.querySelector('.held-version-note'), /NeoFeed 20|เทียบได้เฉพาะ/.test(heldBox()?.textContent || '')], [false, false]);

  const { printedFigures, ...legacyCi } = bag.calcInput;
  mount({ ...DOCTOR, editEntry: row(oldVersion({ ...bag, gir: 99, calcInput: legacyCi })), ...rec() });
  eq('an order saved before the figures were kept: the stored columns are compared',
    heldRows().length === 1 && heldRows()[0].includes('GIR') && heldRows()[0].includes('99 →'), true);

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
