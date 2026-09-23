// Save draft (Praew, 2026-09-23): "ให้เพิ่มปุ่ม save draft เพื่อเวลายังได้ข้อมูล
// มากรอกไม่ครบทุกช่องให้ save ไว้ก่อนได้ แต่ถ้าจะ print ได้ จะต้องกรอกให้ครบทุกช่อง
// และ submit ก่อน".
//
// Drafts are shared (server Daily_Log row, status "draft" in column O); every
// row saved before drafts existed is "submitted" and so counts as submitted.
//
//   § 1 data.js — a draft is out of "logged today", weight series and the
//       final-entry list, and flagged by hasDraftOnDate
//   § 2 the real <Calculator>: Save draft works on an incomplete form, needs
//       only the current weight, and the draft can neither print nor copy
//   § 3 a reopened draft asks again for the boxes that were blank
//   § 4 completing it and pressing Submit writes "submitted" and unlocks print
const fs = require('fs');
const vm = require('vm');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');
const DIR = require('path').join(__dirname, '..') + '/';

let pass = 0, fail = 0;
function ok(name, cond, got) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name.padEnd(66)}${cond ? '' : ' ' + JSON.stringify(got)}`);
  cond ? pass++ : fail++;
}

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'https://localhost/', pretendToBeVisual: true });
const { window } = dom;
Object.assign(global, { window, document: window.document, self: window, HTMLElement: window.HTMLElement,
  Element: window.Element, Node: window.Node, getComputedStyle: window.getComputedStyle });
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = clearTimeout;
global.IS_REACT_ACT_ENVIRONMENT = true;
const toasts = [];
global.showToast = (msg, type) => toasts.push({ msg, type });
window.print = () => { throw new Error('window.print reached for a draft'); };
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;

vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
for (const f of ['icons.jsx', 'calculator.jsx']) {
  vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + f, 'utf8'), {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    filename: f, configFile: false, babelrc: false,
  }).code);
}
const D = window.NEOFEED_DATA;

// ── § 1 ──
console.log('\n── § 1 data.js: a draft is not a logged order ──');
const draftRow = { ts: '2026-09-23', dol: 5, weight: 1200, status: 'draft', entryId: 'd1' };
const oldRow   = { ts: '2026-09-22', dol: 4, weight: 1180, status: 'submitted', entryId: 's1' };
ok('isDraftEntry(draft)', D.isDraftEntry(draftRow));
ok('a legacy "submitted" row is not a draft', !D.isDraftEntry(oldRow));
ok('a row with no status is not a draft', !D.isDraftEntry({ ts: '2026-09-22' }));
ok('a draft today is not "logged today"', !D.hasLogOnDate([oldRow, draftRow], '2026-09-23'));
ok('…but hasDraftOnDate sees it', D.hasDraftOnDate([oldRow, draftRow], '2026-09-23'));
ok('finalEntries drops the draft', D.finalEntries([oldRow, draftRow]).length === 1);
const series = D.weightSeries({ admissionDate: '2026-09-19', bw: 1100, weights: [] }, [oldRow, draftRow]);
ok('weightSeries ignores the draft\'s weight', series.every(p => p.w !== 1200), series);

// ── § 2 ──
console.log('\n── § 2 Save draft on an incomplete form ──');
const container = document.getElementById('root');
let root = ReactDOM.createRoot(container);
const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
const inputFor = (label) => {
  const d = [...container.querySelectorAll('.field')].find(x => x.querySelector('label')?.textContent.startsWith(label));
  const i = d?.querySelector('input'); if (!i) throw new Error('field not found: ' + label); return i;
};
const setField = (label, v) => act(() => {
  const i = inputFor(label); valueSetter.call(i, String(v)); i.dispatchEvent(new window.Event('input', { bubbles: true }));
});
const btn = (t) => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === t);
const draftBtn = () => [...container.querySelectorAll('button.save-draft')][0];
const text = () => container.textContent;
const clickAsync = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); };
const missingText = () => [...container.querySelectorAll('div')].map(d => d.textContent).filter(t => /^ยังกรอกไม่ครบ/.test(t)).pop() || '';

const patient = { sessionId: 'SD-1', name: 'SD', bw: 1200, currentBed: 'NICU 1', diagnosis: '-', weights: [], admissionDate: '2026-09-19' };
const logged = [], updated = [];
function mount(props) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  act(() => {
    root.render(React.createElement(window.Calculator, {
      patient, dol: 5, editEntry: null, baselineEntry: null, logDate: '2026-09-23',
      onLog(e) { logged.push(e); return Promise.resolve({ ok: true, entryId: 'e-1', lastModified: 'lm-1' }); },
      onUpdate(id, lm, e) { updated.push({ id, lm, e }); return Promise.resolve({ ok: true, lastModified: 'lm-' + (updated.length + 1) }); },
      onSaved() {}, onWeightChange() {}, ...props,
    }));
  });
  act(() => {
    container.querySelectorAll('.card-h.clickable').forEach((h) =>
      h.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
  });
}

(async () => {
  mount({});
  ok('the form offers Save draft', !!draftBtn());
  ok('Submit is disabled while boxes are blank', btn('Submit')?.disabled === true);
  ok('the missing-fields line says a draft is possible', /บันทึกร่างไว้ก่อนได้/.test(missingText()), missingText());
  ok('Save draft is enabled on the incomplete form', draftBtn()?.disabled === false);

  setField('Current weight', '');
  await clickAsync(draftBtn());
  ok('Save draft with no current weight is refused', logged.length === 0);
  ok('…with a toast naming the weight', toasts.some(t => /Current weight/.test(t.msg)), toasts);

  setField('Current weight', 1250);
  setField('Volume(mL/day)', 100); setField('Dextrose final', 10); setField('Amino acid', 3);
  await clickAsync(draftBtn());
  const d = logged.at(-1);
  ok('the draft reaches onLog', !!d);
  ok('…with status "draft"', d && d.status === 'draft', d && d.status);
  ok('…naming its blank required boxes', d && ['ioOutput', 'drainContent', 'drug_mL'].every(k => d.calcInput.blankFields.includes(k)), d && d.calcInput.blankFields);
  ok('…and the weight typed', d && d.weight === 1250, d && d.weight);
  ok('the form says it is a draft and cannot print', /บันทึกเป็นแบบร่าง/.test(text()));
  ok('the pharmacy form is not rendered', !container.querySelector('.print-back'));
  const before = toasts.length;
  act(() => { document.dispatchEvent(new window.CustomEvent('__neofeed_print')); });
  ok('Print is refused with the draft reason', toasts.slice(before).some(t => /แบบร่าง/.test(t.msg) && /Submit/.test(t.msg)), toasts.slice(before));

  // ── § 3 ──
  console.log('\n── § 3 a reopened draft asks again for the blank boxes ──');
  mount({ editEntry: { ...d, entryId: 'e-1', lastModified: 'lm-1', ts: '2026-09-23' }, logDate: null });
  ok('reopened draft still lists Urine output as missing', /Urine output/.test(missingText()), missingText());
  ok('…and Drug volume', /Drug volume/.test(missingText()), missingText());
  ok('Submit stays disabled', btn('Submit')?.disabled === true);
  ok('it still cannot print', !container.querySelector('.print-back'));

  // ── § 4 ──
  console.log('\n── § 4 complete it and Submit → printable ──');
  for (const [l, v] of [['Target fluid', 150], ['Other IV', 0], ['Drug volume', 2], ['Input', 180], ['Urine output', 90], ['Drain content', 0]]) setField(l, v);
  ok('nothing missing now', missingText() === '', missingText());
  ok('Submit is enabled', btn('Submit')?.disabled === false);
  window.prompt = () => 'harness: acknowledged';
  await clickAsync(btn('Submit'));
  const s = updated.at(-1);
  ok('Submit updates the same row', s && s.id === 'e-1', s && s.id);
  ok('…with status "submitted"', s && s.e.status === 'submitted', s && s.e.status);
  ok('…and no blankFields', s && !('blankFields' in s.e.calcInput), s && s.e.calcInput.blankFields);
  ok('the draft note is gone', !/บันทึกเป็นแบบร่าง/.test(text()));
  ok('the pharmacy form renders — printable', !!container.querySelector('.print-back'));
  ok('Save draft is disabled once submitted', draftBtn()?.disabled === true);

  // A legacy (pre-draft) row reopens printable.
  mount({ editEntry: { ...s.e, entryId: 'old', lastModified: 'lm-old', ts: '2026-09-22', status: 'submitted' }, logDate: null });
  ok('an old "submitted" row reopens printable', !!container.querySelector('.print-back'));

  act(() => root.unmount());
  console.log(`\nSAVE DRAFT: ${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
