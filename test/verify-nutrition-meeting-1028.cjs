// verify-nutrition-meeting-1028.cjs — what the nutrition team's 2026-10-28
// meeting asked to have before NeoFeed's ward start on 16 Nov 2569:
//
//   §1 Submit locks the order: it is saved, then published, in one press
//   §2 Save draft locks nothing
//   §3 an edit of a locked order is a new revision, and that revision is locked
//   §4 an order submitted before the lock existed is locked before it is edited
//   §5 resubmitting an unchanged order writes no revision
//   §6 a revision prints "Revision" at the top right of the doctor's sheet
//   §7 the Dashboard marks a revision ฉบับแก้ไข
//   §8 only the doctor's sheet prints; the pharmacy sheet is kept for later
//   §9 Mg is typed in mg/kg/d, chips 2.5 / 5 / 7.5, printed in mg with mEq
//      beside it, Normal Requirement in mg/kg/day (ESPGHAN 2018's mg figures)
//   §10 the amino-acid line names PED AMINE beside 10% Aminoven infant
//
// Vitalipid rounded down to whole mL is in the clinical-rules skill
// (CR-VITALIPID-CAP), whose cases test/verify-clinical-rules.cjs runs.
//
// Same jsdom harness as verify-review-0917-drafts.cjs. Synthetic infants only.
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
window.prompt = () => 'harness reason';
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
{ const w = console.error; console.error = (...a) => { if (!/act\(|not wrapped|Not implemented/.test(String(a[0]))) w(...a); }; }
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
const squash = (s) => (s || '').replace(/\s+/g, ' ').trim();
const fieldOf = (label) => [...container.querySelectorAll('.field')].find(d => d.querySelector('label')?.textContent.startsWith(label)) || null;
const saltRow = (label) => [...container.querySelectorAll('.salt-row-grid')]
  .find(d => d.firstElementChild?.firstElementChild?.textContent.startsWith(label)) || null;
function setField(label, value) {
  const input = fieldOf(label)?.querySelector('input') || saltRow(label)?.querySelector('input');
  if (!input) throw new Error('no field labelled ' + JSON.stringify(label));
  act(() => { valueSetter.call(input, String(value)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
const click = (el) => act(() => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const clickAsync = async (el) => {
  await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await act(async () => { await new Promise(r => setTimeout(r, 20)); });
};
const button = (name) => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === name) || null;
const submitBtn = () => button('Submit');
const draftBtn = () => [...container.querySelectorAll('button')].find(b => /Save draft/.test(b.textContent)) || null;
const printForm = () => container.querySelector('#print-form');
const printText = () => squash(printForm()?.textContent);

const MG = D.MG_MG_PER_MEQ;
const pt = (over = {}) => ({ sessionId: 'NM-1', name: 'NM', bw: 1000, currentBed: 'NICU 4', diagnosis: '-',
  weights: [{ dol: 1, w: 1000 }], admissionDate: '2026-10-18', ...over });

// The calls the Calculator makes, in order, and what each fake reply says.
function recorder(over = {}) {
  const calls = [];
  return {
    calls,
    onLog(entry) { calls.push(['log', entry]); return Promise.resolve(over.log || { ok: true, entryId: 'e-new', lastModified: 'lm-new' }); },
    onUpdate(id, lm, entry) { calls.push(['update', id, lm, entry]); return Promise.resolve(over.update || { ok: true, lastModified: 'lm-u' }); },
    onPublish(id, lm) {
      calls.push(['publish', id, lm]);
      const r = typeof over.publish === 'function' ? over.publish(id) : over.publish;
      return Promise.resolve(r || { ok: true, publishedAt: '2026-10-28T03:00:00Z' });
    },
  };
}
const shape = (calls) => calls.map(c => c[0] === 'log' ? ['log'] : c[0] === 'update' ? ['update', c[1], c[2]] : ['publish', c[1], c[2]]);

function mount(props) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear();
  act(() => { root.render(React.createElement(window.Calculator, {
    patient: pt(), dol: 10, editEntry: null, baselineEntry: null, previousEntry: null, logDate: '2026-10-27',
    userLabel: 'Dr Meeting (meeting@kcmh.test)', onSaved() {}, onWeightChange() {}, ...props })); });
  act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
}
// A complete central-line order for a 1 kg infant on DOL 10.
function typeOrder(extra = {}) {
  const central = [...container.querySelectorAll('.step2-ctrl .seg button')].find(b => b.textContent.trim() === 'Central');
  if (central && !central.classList.contains('on')) click(central);
  setField('Current weight', 1000);
  for (const l of ['Target fluid', 'Other IV', 'Drug volume', 'Input', 'Urine output', 'Drain content']) setField(l, l === 'Target fluid' ? 150 : 0);
  const order = { 'Volume(mL/day)': 100, 'Dextrose final': 10, 'Amino acid': 3, '20% lipid': 2, ...extra };
  for (const [label, v] of Object.entries(order)) setField(label, v);
}

(async () => {
  // A saved order to reopen in §3–§6: the entry §1 sends, as the server keeps it.
  let saved = null;

  await section('§1 Submit saves the order, then locks it', async () => {
    const r = recorder();
    mount(r);
    typeOrder();
    await clickAsync(submitBtn());
    eq('Submit sends the save, then the lock of that row', shape(r.calls), [['log'], ['publish', 'e-new', 'lm-new']]);
    eq('…the saved row is a submitted order', r.calls[0]?.[1]?.status, 'submitted');
    saved = r.calls[0]?.[1];
  });

  await section('§2 Save draft locks nothing', async () => {
    const r = recorder();
    mount(r);
    typeOrder();
    await clickAsync(draftBtn());
    eq('a draft is saved and not locked', shape(r.calls), [['log']]);
    eq('…as a draft', r.calls[0]?.[1]?.status, 'draft');
  });

  const reopened = (over = {}) => ({ ...saved, entryId: 'e1', lastModified: 'lm1', ts: '2026-10-27',
    published: '2026-10-27T03:00:00Z', publishedBy: 'meeting@kcmh.test', revisionNumber: 1, ...over });

  await section('§3 an edit of a locked order is a new revision, and it is locked too', async () => {
    const r = recorder({ update: { ok: true, revised: true, entryId: 'e2', lastModified: 'lm2', revisionNumber: 2 } });
    mount({ ...r, editEntry: reopened() });
    setField('Amino acid', 3.5);
    await clickAsync(submitBtn());
    eq('the edit goes to the server, then the new revision is locked',
      shape(r.calls), [['update', 'e1', 'lm1'], ['publish', 'e2', 'lm2']]);
  });

  await section('§4 an order submitted before the lock is locked before it is edited', async () => {
    const r = recorder({ update: { ok: true, revised: true, entryId: 'e2', lastModified: 'lm2', revisionNumber: 2 } });
    mount({ ...r, editEntry: reopened({ published: '', publishedBy: '' }) });
    setField('Amino acid', 3.5);
    await clickAsync(submitBtn());
    eq('lock the old copy, save the edit as a revision, lock the revision',
      shape(r.calls), [['publish', 'e1', 'lm1'], ['update', 'e1', 'lm1'], ['publish', 'e2', 'lm2']]);

    const c = recorder({ publish: (id) => id === 'e1' ? { conflict: true, current: { lastModified: 'lm9', lastModifiedBy: 'other@kcmh.test' } } : null });
    mount({ ...c, editEntry: reopened({ published: '', publishedBy: '' }) });
    setField('Amino acid', 3.5);
    await clickAsync(submitBtn());
    eq('someone saved it meanwhile: the edit is not sent', shape(c.calls), [['publish', 'e1', 'lm1']]);

    const d = recorder();
    mount({ ...d, editEntry: reopened({ published: '', publishedBy: '', status: 'draft' }) });
    setField('Amino acid', 3.5);
    await clickAsync(submitBtn());
    eq('a draft is not locked first: it is saved in place, then locked',
      shape(d.calls), [['update', 'e1', 'lm1'], ['publish', 'e1', 'lm-u']]);
  });

  await section('§5 resubmitting an unchanged order writes no revision', async () => {
    const r = recorder();
    mount({ ...r, editEntry: reopened({ published: '', publishedBy: '' }) });
    await clickAsync(submitBtn());
    eq('an unlocked, unchanged order is only locked', shape(r.calls), [['publish', 'e1', 'lm1']]);

    const l = recorder();
    mount({ ...l, editEntry: reopened() });
    eq('a locked, unchanged order offers no Submit', submitBtn()?.disabled, true);
    eq('…and sends nothing', shape(l.calls), []);

    // Vera, 2026-10-28: an order Print is holding for a new save (here, saved
    // on an older calculation) must still be saved again, as a revision.
    const old = (over) => reopened({ calcInput: { ...saved.calcInput, constantsVersion: '2026-10-27.2' }, ...over });
    const o = recorder({ update: { ok: true, revised: true, entryId: 'e2', lastModified: 'lm2', revisionNumber: 2 } });
    mount({ ...o, editEntry: old({ published: '', publishedBy: '' }) });
    ok('an unlocked order on an older calculation is not printable as it stands', !printForm());
    await clickAsync(submitBtn());
    eq('…Submit locks it, saves a revision on today\'s numbers, and locks that',
      shape(o.calls), [['publish', 'e1', 'lm1'], ['update', 'e1', 'lm1'], ['publish', 'e2', 'lm2']]);
    ok('…which then prints', !!printForm());

    mount({ ...recorder(), editEntry: old() });
    eq('a locked order on an older calculation keeps its Submit', submitBtn()?.disabled, false);
  });

  await section('§6 a revision prints "Revision" at the top right of the doctor\'s sheet', async () => {
    mount({ ...recorder(), editEntry: reopened({ revisionNumber: 2, revisionOf: 'e1' }) });
    const tag = printForm()?.querySelector('.print-revision');
    ok('the order form is on the page', !!printForm());
    ok('it carries a revision mark', !!tag);
    eq('…reading Revision and its number', squash(tag?.textContent), 'Revision · ฉบับที่ 2');
    const firstTable = printForm()?.querySelector(':scope > table');
    ok('…on the front, above the patient table',
      !!tag && !!firstTable && !!(tag.compareDocumentPosition(firstTable) & window.Node.DOCUMENT_POSITION_FOLLOWING));
    ok('…not on the pharmacy sheet', !!tag && !tag.closest('.print-back'));
    eq('…placed at the top right', [tag?.style.position, tag?.style.top, tag?.style.right], ['absolute', '4mm', '6mm']);

    mount({ ...recorder(), editEntry: reopened() });
    ok('the first issue of an order carries no revision mark', !!printForm() && !printForm().querySelector('.print-revision'));
  });

  await section('§7 the Dashboard marks a revision ฉบับแก้ไข', async () => {
    act(() => { root.unmount(); });
    root = ReactDOM.createRoot(container);
    const P = pt();
    const row = (id, ts, over) => ({ entryId: id, ts, dol: 9, weight: 1000, fluid: 150, gir: 6, pro: 3, kcal: 80,
      na: 3, k: 2, ca: 60, p: 40, enVolPerKg: 0, route: 'TPN central', status: 'submitted', ...over });
    const rows = [row('e2', '2026-10-27', { revisionNumber: 2, revisionOf: 'e1' }), row('e3', '2026-10-26', { revisionNumber: 1 })];
    act(() => { root.render(React.createElement(window.DailyLog, { patient: P, log: { [P.sessionId]: rows }, dol: 10,
      onAddToday() {}, onEditEntry() {} })); });
    const chips = [...container.querySelectorAll('td .chip')].map(c => squash(c.textContent));
    eq('a revision reads Submitted · ฉบับแก้ไข, the first issue Submitted', chips, ['Submitted · ฉบับแก้ไข', 'Submitted']);
  });

  await section('§8 only the doctor\'s sheet prints', async () => {
    for (const shell of ['index.html', 'NeoFeed.html']) {
      const css = R(shell);
      const print = css.slice(css.indexOf('@media print'));
      ok(`${shell}: the pharmacy sheet is hidden in print`, /\.print-back\s*\{\s*display:\s*none\s*!important;\s*\}/.test(print.slice(0, print.indexOf('@page'))));
    }
    mount({ ...recorder(), editEntry: reopened() });
    const form = printForm();
    ok('the provenance footer stays outside the pharmacy sheet, so it still prints',
      !!form && !form.lastElementChild.closest('.print-back') && /NeoFeed · constants/.test(form.lastElementChild.textContent));

    // Pp, 2026-10-28, after Vera: what the ward and pharmacy still need from
    // the pharmacy sheet moves onto the doctor's sheet.
    const rate = printForm()?.querySelector('.print-lipid-rate');
    ok('the lipid pump rate is on the doctor\'s sheet', !!rate && !rate.closest('.print-back') && /Rate [\d.]+ mL\/hr/.test(squash(rate.textContent)), squash(rate?.textContent));
    mount({ ...recorder(), editEntry: reopened({ calcInput: { ...saved.calcInput,
      critOverride: { reason: 'harness reason', alerts: ['GIR critically high'], at: '2026-10-27T03:00:00Z' } } }) });
    const crit = printForm()?.querySelector('.crit-confirmed');
    ok('a confirmed critical value prints on the doctor\'s sheet, with its reason',
      !!crit && !crit.closest('.print-back') && /เหตุผล: harness reason/.test(crit.parentElement.textContent));
  });

  await section('§9 Mg is typed in mg/kg/d', async () => {
    const r = recorder();
    mount(r);
    typeOrder();
    const mgRow = saltRow('MgSO₄');
    const chips = [...(mgRow?.nextElementSibling?.querySelectorAll('.preset-chip') || [])].map(b => b.textContent.trim());
    eq('its chips are 2.5, 5 and 7.5', chips, ['2.5', '5', '7.5']);
    setField('MgSO₄', 5);
    eq('a 1 kg infant on 5 mg/kg/d reads = 5 mg/d', squash(saltRow('MgSO₄')?.lastElementChild?.textContent), '= 5 mg/d');
    await clickAsync(submitBtn());
    const mEq = r.calls[0]?.[1]?.calcInput?.mgPerKg;
    ok('5 mg/kg/d is stored as its mEq (5 ÷ 12.1525, to 10 decimals)', mEq === Number((5 / MG).toFixed(10)), mEq);
    const pr = printText();
    ok('the order prints 5 mg/kg with its mEq beside it', /3\. Mg⁺⁺ ☑ MgSO₄5 mg ?\(0\.41 mEq\)/.test(pr), pr.slice(pr.indexOf('3. Mg'), pr.indexOf('3. Mg') + 160));
    ok('…and the Normal Requirement in mg/kg/day', pr.includes('Mg 5–7.5 mg/kg/day'));

    const r2 = recorder();
    mount(r2);
    typeOrder({ 'MgSO₄': 0.4 * MG });
    await clickAsync(submitBtn());
    eq('0.4 mEq typed as mg (4.861…) is stored as exactly 0.4, no float tail', r2.calls[0]?.[1]?.calcInput?.mgPerKg, 0.4);

    mount({ ...recorder(), editEntry: reopened({ calcInput: { ...saved.calcInput, mgPerKg: 0.4 } }) });
    eq('an order saved as 0.4 mEq/kg/d reopens as 4.86 mg/kg/d', saltRow('MgSO₄')?.querySelector('input')?.value, '4.86');
    eq('DOL 1–7 reads 2.5–5, DOL 8 on 5–7.5 (mg/kg/d)', [D.TARGETS.mg(7), D.TARGETS.mg(8)], [[2.5, 5], [5, 7.5]]);
  });

  await section('§11 switching patient forgets the last order\'s lock (Vera)', async () => {
    const r = recorder();
    mount({ ...r, editEntry: reopened() });
    act(() => { root.render(React.createElement(window.Calculator, {
      patient: pt({ sessionId: 'NM-2', name: 'NB' }), dol: 10, editEntry: null, baselineEntry: null, previousEntry: null,
      logDate: '2026-10-27', userLabel: 'Dr Meeting (meeting@kcmh.test)', onSaved() {}, onWeightChange() {}, ...r })); });
    // Open only the steps the switch closed: a closed step renders no inputs.
    act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => { if (!h.parentElement.querySelector('input')) h.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); });
    typeOrder();
    await clickAsync(draftBtn());
    eq('the next infant\'s draft saves', shape(r.calls), [['log']]);
    eq('…and its Submit is offered', submitBtn()?.disabled, false);
  });

  await section('§10 the amino-acid line names PED AMINE', async () => {
    mount({ ...recorder(), editEntry: reopened() });
    const pr = printText();
    ok('the doctor\'s sheet offers 10% Aminoven infant / PED AMINE', pr.includes('10% Aminoven infant / PED AMINE'));
    const back = squash(printForm()?.querySelector('.print-back')?.textContent);
    ok('…and the pharmacy sheet names both', back.includes('10% Aminoven infant / PED AMINE'));
  });

  console.log(`\nNUTRITION MEETING 2026-10-28: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
})();
