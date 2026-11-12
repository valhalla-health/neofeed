// verify-revise-phone-1103.cjs — a doctor changing a submitted TPN order is told to phone the TPN room
// (Pp, 2026-11-03: a revised or cancelled order is confirmed by phone, "โทรด้วย"; CHANGELOG.md 2026-11-03).
//
//   §1 the line shows while a save would write a revision of a submitted order with TPN, for today or tomorrow;
//   §2 it holds nothing back: Submit stays open and saves as before, and it is not on the printed sheet;
//   §3 the screens that do not send anything to the room do not show it.
//
// Mounts the real <Calculator> in jsdom. Synthetic infants only.
const fs = require('fs');
const { printFormTicked: __printFormTicked } = require('./print-acks-helper.cjs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';
const R = (f) => String(fs.readFileSync(DIR + f, 'utf8')).replace(/\r\n/g, '\n');

let pass = 0, fail = 0, n = 0;
function eq(name, got, want) {
  const yes = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${yes ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(72)}${yes ? '' : ` got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
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
global.showToast = () => {};
window.print = () => {};
// Counted, so §2 can say the line asks nothing of the doctor.
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

// One fixed "today", so a run that crosses midnight cannot move an order out of the line's two days.
const TODAY = '2026-11-16';
D.todayLocal = () => TODAY;
const day = (delta) => D.addDaysToDateStr(TODAY, delta);

const LINE = 'โทรแจ้งห้อง TPN';
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
const routeBtn = (name) => [...container.querySelectorAll('.step2-ctrl .seg button')].find(b => b.textContent.trim() === name);
const noteShown = () => !!container.querySelector('.revise-phone-note') && container.querySelector('.revise-phone-note').textContent.includes(LINE);

const PT = { sessionId: 'NF-900210', name: 'SY', bw: 1600, currentBed: 'NICU 3', diagnosis: '-',
  weights: [{ dol: 1, w: 1600 }], admissionDate: '2026-11-07' };
const BASE = { patient: PT, dol: 10, editEntry: null, baselineEntry: null, previousEntry: null, logDate: TODAY,
  userLabel: 'Dr Test (doc@kcmh.test)', onSaved() {}, onWeightChange() {} };
const rec = () => {
  const calls = [];
  return { calls,
    onLog(e) { calls.push(['log', e]); return Promise.resolve({ ok: true, entryId: 'e-new', lastModified: 'lm-new' }); },
    onUpdate(id, lm, e) { calls.push(['update', id, lm, e]); return Promise.resolve({ ok: true, revised: true, entryId: 'e-rev', lastModified: 'lm-u', revisionNumber: 2 }); },
    onPublish(id, lm) { calls.push(['publish', id, lm]); return Promise.resolve({ ok: true, publishedAt: '2026-11-16T03:00:00Z' }); } };
};
function mount(props) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear();
  act(() => { root.render(React.createElement(window.Calculator, { ...BASE, ...props })); });
  act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
}
function fillBag() {
  click(routeBtn('Central'));
  setField('Current weight', 1600);
  ['Target fluid', 'Other IV', 'Drug volume', 'Input', 'Urine output', 'Drain content'].forEach(l => setField(l, l === 'Target fluid' ? 150 : 0));
  setField('Volume(mL/day)', 160); setField('ปริมาตรคาสาย (dead space)', 30);
  setField('Dextrose final', 10); setField('Amino acid', 2);
  setField('20% NaCl', 2); setField('KCl', 2.5); setField('MgSO₄', 4.861);
}
const feeds = () => { setField('Volume(mL/feed)', 20); setField('Frequency', 8); };
const tickNoTpn = () => {
  feeds();
  const tick = container.querySelector('label.no-tpn-chk input[type=checkbox]');
  if (!tick) throw new Error('no "No TPN" tick');
  act(() => { tick.click(); });
};

(async () => {
  // Real saves, so the rows reopened below are what the app really stores.
  const a = rec(); mount({ ...a }); fillBag(); await settle(submitBtn());
  const bag = a.calls[0][1];
  const b = rec(); mount({ ...b }); fillBag(); await settle(draftBtn());
  const draft = b.calls[0][1];
  const c = rec(); mount({ ...c }); fillBag(); tickNoTpn(); await settle(submitBtn());
  const noTpn = c.calls[0][1];
  answer = 'synthetic reason';
  const d = rec(); mount({ ...d }); fillBag(); setField('KCl', 6); await settle(submitBtn());
  answer = null;
  const { critOverride, ...noOverride } = d.calls[0][1].calcInput;   // a saved order whose critical value nobody confirmed
  const critical = { ...d.calls[0][1], calcInput: noOverride };
  const row = (e, over) => ({ ...e, entryId: 'e1', lastModified: 'lm1', ts: TODAY, revisionNumber: 1, ...over });

  section('§1 the line shows while a submitted TPN order for today or tomorrow is being changed');
  const empty = rec(); mount({ ...empty }); fillBag();
  eq('a new order, not saved yet: no line', noteShown(), false);
  await settle(submitBtn());
  eq('…submitted in this visit, nothing changed since: no line', noteShown(), false);
  setField('Amino acid', 2.1);
  eq('…then changed without reopening: the line shows', noteShown(), true);
  for (const [label, published] of [['locked', '2026-11-16T03:00:00Z'], ['unlocked', '']]) {
    mount({ editEntry: row(bag, { published }), ...rec() });
    eq(`a ${label} submitted order, nothing changed: no line`, noteShown(), false);
    setField('Amino acid', 2.1);
    eq(`…changed: the line shows`, noteShown(), true);
    setField('Amino acid', 2);
    eq(`…changed back: the line goes`, noteShown(), false);
  }
  const tomorrow = rec();
  mount({ editEntry: row(bag, { ts: day(1), published: '' }), logDate: day(1), ...tomorrow });
  setField('Amino acid', 2.1);
  eq("tomorrow's order, changed: the line shows", noteShown(), true);
  for (const [label, delta] of [["yesterday's", -1], ['last week\'s', -7]]) {
    mount({ editEntry: row(bag, { ts: day(delta), published: '' }), logDate: day(delta), ...rec() });
    setField('Amino acid', 2.1);
    eq(`${label} order, changed: its bag is gone, so no line`, noteShown(), false);
  }
  // Submit stays open on these with nothing typed, and the save is a revision on today's numbers.
  const oldVersion = (e) => ({ ...e, constantsVersion: '2026-09-18.1', calcInput: { ...e.calcInput, constantsVersion: '2026-09-18.1' } });
  mount({ editEntry: row(oldVersion(bag), { published: '' }), ...rec() });
  eq('nothing typed, but the calculation moved since the save: the line shows', [noteShown(), submitBtn().disabled], [true, false]);
  mount({ editEntry: row({ ...bag, calcInput: { ...bag.calcInput, tpnWtG: 1500 } }, { published: '' }), ...rec() });
  eq('nothing typed, but the dosing weight changed: the line shows', [noteShown(), submitBtn().disabled], [true, false]);
  mount({ editEntry: row(critical, { published: '' }), ...rec() });
  eq('nothing typed, but a critical value is unconfirmed: the line shows', [noteShown(), submitBtn().disabled], [true, false]);
  mount({ editEntry: row(bag, { published: '' }), ...rec() });
  tickNoTpn();
  eq('ticking No TPN over a submitted order with a bag: the line shows', noteShown(), true);
  mount({ editEntry: row(draft), ...rec() });
  setField('Amino acid', 2.1);
  eq('a draft, changed: the room has nothing yet, so no line', noteShown(), false);
  mount({ editEntry: row(noTpn, { published: '' }), ...rec() });
  feeds(); setField('Volume(mL/feed)', 25);
  eq('a No TPN order, its feeds changed: no bag, so no line', noteShown(), false);
  mount({ editEntry: row(noTpn, { published: '' }), ...rec() });
  act(() => { container.querySelector('label.no-tpn-chk input[type=checkbox]').click(); });
  fillBag();
  eq('a bag put back over a submitted No TPN order: the room has been told it stopped, so the line shows', noteShown(), true);

  section('§2 it holds nothing back, and it does not print');
  const save = rec();
  mount({ editEntry: row(bag, { published: '' }), ...save });
  setField('Amino acid', 2.1);
  eq('Submit stays open with the line showing', [noteShown(), submitBtn().disabled], [true, false]);
  asked = 0;
  await settle(submitBtn());
  eq('…and pressing it saves the revision', save.calls[0][0], 'update');
  eq('…asking the doctor nothing', asked, 0);
  mount({ editEntry: row(bag, { published: '' }), ...rec() });
  setField('Amino acid', 2.1);
  const form = __printFormTicked(container);
  eq('the printed sheet does not carry the line', !!form && form.textContent.includes(LINE), false);

  section('§3 the screens that send nothing to the room do not show it');
  mount({ editEntry: row(bag, { published: '' }), scratch: true, ...rec() });
  setField('Amino acid', 2.1);
  eq('the quick calculator: no line', noteShown(), false);
  mount({ editEntry: row(bag, { published: '' }), ordersReadOnly: true, ...rec() });
  setField('Amino acid', 2.1);
  eq('a read-only account: no line', noteShown(), false);
  mount({ editEntry: row(bag, { published: '' }), centerPoint: { save: async () => ({ sourceRecordId: 'c1', recordedAt: 'r1' }) }, ...rec() });
  setField('Amino acid', 2.1);
  eq('Center Point, its own flow: no line', noteShown(), false);

  act(() => { root.unmount(); });
  console.log(`\nREVISE PHONE LINE 1103: ${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
