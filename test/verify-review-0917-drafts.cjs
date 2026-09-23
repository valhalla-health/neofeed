// verify-review-0917-drafts.cjs — the 2026-09-17 review's findings about work
// that is not saved yet: unsaved drafts on shared ward PCs (SEC-F3), the typed
// order after a save conflict (UP-C10), and a new order left open across
// midnight (UP-C11). The calculator/print findings are in
// verify-review-0917-calc.cjs.
//
//   §1 a draft records who typed it; only that user is offered it back
//   §2 drafts past 72 h and "previous submission" state past 7 days are
//      deleted on mount, for every patient; Center Point sweeps nothing
//   §3 save conflict → reload → the typed order comes back, marked older, and
//      saves as an ordinary edit of the newer row (no stale-stamp loop)
//   §4 midnight: the order keeps its date, DOL, typed zeros and draft key, and
//      is saved and printed as the day it was opened on
//
// Same jsdom harness as verify-review-0911.cjs. Fails against 42ce553.
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
window.print = () => {};
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
const inputFor = (label) => [...container.querySelectorAll('.field')]
  .find(d => d.querySelector('label')?.textContent.startsWith(label))?.querySelector('input') || null;
function setField(label, value) {
  const input = inputFor(label);
  if (!input) throw new Error('field not found: ' + label);
  act(() => { valueSetter.call(input, String(value)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
const click = (el) => act(() => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const clickAsync = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const buttonText = (text) => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === text);
const saveBtn = () => [...container.querySelectorAll('button')].find(b => ['Submit', 'บันทึก'].includes(b.textContent.trim()) || /กำลังบันทึก/.test(b.textContent));
const fillRequired = () => ['Target fluid', 'Other IV', 'Drug volume', 'Input', 'Urine output', 'Drain content']
  .forEach(l => setField(l, l === 'Target fluid' ? 150 : 0));
const draftBanner = () => /มีข้อมูลที่กรอกค้างไว้/.test(container.textContent);
const keys = (prefix) => Object.keys(window.localStorage).filter(k => k.startsWith(prefix)).sort();
const readJSON = (k) => { try { return JSON.parse(window.localStorage.getItem(k)); } catch { return null; } };
const printText = () => (container.querySelector('#print-form')?.textContent || '').replace(/\s+/g, ' ');

const A = 'Dr A (a.doctor@kcmh.test)', B = 'Dr B (b.nurse@kcmh.test)';
const BASE = { dol: 10, editEntry: null, baselineEntry: null, previousEntry: null, logDate: '2026-09-15', userLabel: A,
  onLog() { return Promise.resolve({ ok: true, entryId: 'e-new', lastModified: 'lm-new' }); },
  onUpdate() { return Promise.resolve({ ok: true, lastModified: 'lm-u' }); }, onSaved() {}, onWeightChange() {} };
function render(props) {
  act(() => { root.render(React.createElement(window.Calculator, { ...BASE, ...props })); });
}
function mount(props) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  render(props);
  act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
}
const pt = (sid) => ({ sessionId: sid, name: sid.slice(0, 2), bw: 1000, currentBed: 'NICU 6', diagnosis: '-',
  weights: [{ dol: 1, w: 1000 }], admissionDate: '2026-09-07' });
const HOUR = 3600e3;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

(async () => {
  await section('§1 SEC-F3 · a draft is offered back only to the user who typed it', async () => {
    window.localStorage.clear();
    const P = pt('DR-1'), key = 'neofeed_draft_DR-1_2026-09-15';
    mount({ patient: P });
    setField('Amino acid', 2.5);
    eq('the draft records its author (email from userLabel)', readJSON(key)?.by, 'a.doctor@kcmh.test');
    mount({ patient: P });
    ok('the same user is offered it', draftBanner());
    ok('…and the banner names the author', /โดย a\.doctor@kcmh\.test/.test(container.textContent));
    click(buttonText('กู้คืน'));
    eq('restoring puts the typed value back', inputFor('Amino acid').value, '2.5');

    mount({ patient: P, userLabel: B });
    ok('another user on the same PC is NOT offered it', !draftBanner());
    eq('…and the other user\'s draft is deleted unread', window.localStorage.getItem(key), null);
    ok('…nor does the form show its values', inputFor('Amino acid').value !== '2.5', inputFor('Amino acid').value);

    window.localStorage.setItem(key, JSON.stringify({ aaPerKg: 3.9, savedAt: ago(HOUR) }));
    mount({ patient: P });
    ok('a draft with no author (written before 2026-09-17) is not offered', !draftBanner());
    eq('…and is deleted', window.localStorage.getItem(key), null);

    mount({ patient: P, userEmail: 'c.pharm@kcmh.test' });
    setField('Amino acid', 2.7);
    eq('an explicit userEmail prop wins over userLabel', readJSON(key)?.by, 'c.pharm@kcmh.test');
  });

  await section('§2 SEC-F3 · browser storage expires, for every patient, on mount', async () => {
    window.localStorage.clear();
    const put = (k, v) => window.localStorage.setItem(k, JSON.stringify(v));
    put('neofeed_draft_OTHER-1_2026-09-15', { aaPerKg: 3, by: 'a.doctor@kcmh.test', savedAt: ago(71 * HOUR) });
    put('neofeed_draft_OTHER-2_2026-09-12', { aaPerKg: 3, by: 'a.doctor@kcmh.test', savedAt: ago(73 * HOUR) });
    put('neofeed_draft_OTHER-3_2026-09-15', { aaPerKg: 3, by: 'a.doctor@kcmh.test' });
    put('neofeed_calc_OTHER-4', { aaPerKg: 3, savedAt: ago(6 * 24 * HOUR) });
    put('neofeed_calc_OTHER-5', { aaPerKg: 3, savedAt: ago(8 * 24 * HOUR) });
    put('neofeed_calc_OTHER-6', { aaPerKg: 3 });
    put('neofeed_acked_OTHER-1', ['x']);
    const snapshot = Object.keys(window.localStorage).sort();

    const centerPoint = { save() { return Promise.resolve({}); }, review() {}, failed() {} };
    mount({ patient: pt('CP-1'), centerPoint });
    eq('the Center Point entry touches none of it', Object.keys(window.localStorage).sort(), snapshot);

    mount({ patient: pt('SW-1') });
    eq('drafts: 71 h kept · 73 h and unstamped deleted', keys('neofeed_draft_'), ['neofeed_draft_OTHER-1_2026-09-15']);
    eq('previous submissions: 6 d kept · 8 d and unstamped deleted', keys('neofeed_calc_'), ['neofeed_calc_OTHER-4']);
    eq('acknowledged-alert keys are not this sweep\'s business', keys('neofeed_acked_'), ['neofeed_acked_OTHER-1']);

    put('neofeed_calc_OLD-1', { curWtG: 1000, aaPerKg: 3.3, savedAt: ago(8 * 24 * HOUR) });
    act(() => { root.unmount(); }); root = ReactDOM.createRoot(container);
    render({ patient: pt('OLD-1'), logDate: null });
    ok('an expired previous submission is not used to prefill', inputFor('Amino acid').value !== '3.3', inputFor('Amino acid').value);
    window.localStorage.setItem('neofeed_calc_OLD-1', JSON.stringify({ curWtG: 1000, aaPerKg: 3.3, savedAt: ago(HOUR) }));
    mount({ patient: pt('OLD-1'), logDate: null });
    eq('…while a recent one still is', inputFor('Amino acid').value, '3.3');
  });

  await section('§3 UP-C10 · after a save conflict the typed order survives the reload', async () => {
    window.localStorage.clear();
    const P = pt('CF-1'), key = 'neofeed_draft_CF-1_2026-09-15';
    // The other device saved AFTER this user's last keystroke — the case where
    // only offering a draft newer than the row hid the typed order for good.
    const L1 = '2026-09-15T01:00:00.000Z', L2 = new Date(Date.now() + 60e3).toISOString();
    const row = (lm) => ({ entryId: 'e-cf', lastModified: lm, ts: '2026-09-15', dol: 10, weight: 1000,
      ioInput: 150, ioOutput: 80, drainContent: 0,
      calcInput: { curWtG: 1000, fluidTargetPerKg: 150, otherIV_mL: 0, drug_mL: 0, ioInput: 150, ioOutput: 80, drainContent: 0,
        totalTPN_mL: 110, dexPct: 12.5, aaPerKg: 3, lipidPerKg: 3 } });
    const stamps = [];
    let conflictNext = true;
    const onUpdate = (id, lm) => {
      stamps.push(lm);
      return Promise.resolve(conflictNext
        ? { ok: false, conflict: true, current: { lastModified: L2, lastModifiedBy: 'other@kcmh.test' } }
        : { ok: true, lastModified: '2026-09-15T10:00:00.000Z' });
    };
    window.prompt = () => 'synthetic reason';
    mount({ patient: P, editEntry: row(L1), logDate: null, onUpdate });
    setField('Amino acid', 3.5);
    await clickAsync(saveBtn());
    ok('the save conflicts', /ถูกแก้ไขจาก other@kcmh\.test/.test(container.textContent));
    eq('the typed order is on disk, based on the stamp that conflicted', [readJSON(key)?.aaPerKg, readJSON(key)?.baseLastModified], [3.5, L1]);
    click(buttonText('แก้ไขต่อ'));
    await clickAsync(saveBtn());
    ok('"แก้ไขต่อ" then Save still refuses to overwrite the other device', /ถูกแก้ไขจาก/.test(container.textContent) && stamps.join() === [L1, L1].join(), stamps);

    // "โหลดข้อมูลล่าสุด" reloads the page: the row now carries the other device's stamp.
    mount({ patient: P, editEntry: row(L2), logDate: null, onUpdate });
    ok('after the reload the draft is offered', draftBanner());
    ok('…labelled as older than the latest save', /ร่างนี้เก่ากว่าฉบับที่บันทึกล่าสุด/.test(container.textContent));
    eq('…while the form shows the newer row', inputFor('Amino acid').value, '3');
    click(buttonText('กู้คืน'));
    eq('restoring brings back the typed 3.5', inputFor('Amino acid').value, '3.5');
    eq('…and rebases the draft onto the newer row', readJSON(key)?.baseLastModified, L2);
    conflictNext = false;
    await clickAsync(saveBtn());
    eq('the next Save is an ordinary edit of the newer row', stamps[stamps.length - 1], L2);
    eq('…which succeeds and clears the draft', window.localStorage.getItem(key), null);

    // Same user, same version (e.g. the tab was closed before saving): not "older".
    mount({ patient: P, editEntry: row(L2), logDate: null, onUpdate });
    setField('Amino acid', 3.4);
    mount({ patient: P, editEntry: row(L2), logDate: null, onUpdate });
    ok('a draft typed on the version still open is offered', draftBanner());
    ok('…without the "older" label', !/ร่างนี้เก่ากว่าฉบับที่บันทึกล่าสุด/.test(container.textContent));
  });

  await section('§4 UP-C11 · a new order open across midnight keeps its date', async () => {
    window.localStorage.clear();
    const realToday = D.todayLocal;
    let today = '2026-09-17';
    D.todayLocal = () => today;
    try {
      const P = pt('MN-1');
      const logged = [];
      const onLog = (e) => { logged.push(e); return Promise.resolve({ ok: true, entryId: 'e-mn-' + logged.length, lastModified: 'lm' }); };
      // CalculatorView passes App's live DOL: 11 on 09-17 (admitted 09-07 at DOL 1).
      mount({ patient: P, dol: 11, logDate: null, onLog });
      setField('Current weight', 1000); fillRequired();
      setField('Volume(mL/day)', 110); setField('Dextrose final', 10); setField('Amino acid', 3); setField('SMOF Lipid', 3);
      eq('23:59 — Save is enabled', saveBtn()?.disabled, false);

      today = '2026-09-18';                       // useTodayLocal ticks; App re-renders with DOL 12
      render({ patient: P, dol: 12, logDate: null, onLog });
      eq('00:00 — the typed 0 in Other IV is still there', inputFor('Other IV')?.value, '0');
      eq('…Save is still enabled', saveBtn()?.disabled, false);
      ok('…and the form says whose day this order is', /คำสั่งนี้เป็นของวันที่[\s\S]*DOL 11/.test(container.textContent));
      setField('Amino acid', 3.2);
      eq('the draft stays under the order\'s own date', keys('neofeed_draft_MN-1'), ['neofeed_draft_MN-1_2026-09-17']);
      window.prompt = () => 'synthetic reason';
      await clickAsync(saveBtn());
      eq('saved as the 17th', logged[0] && logged[0].ts, '2026-09-17');
      eq('…with the DOL of the 17th', logged[0] && logged[0].dol, 11);
      const label = new Date('2026-09-17T12:00:00').toLocaleDateString('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit' });
      ok(`…and prints as the 17th (${label})`, printText().includes(`วันที่ให้ TPN: ${label}`), printText().match(/วันที่ให้ TPN: \S+/));

      // A patient switch is a new order: it is for today.
      render({ patient: pt('MN-2'), dol: 12, logDate: null, onLog });
      ok('switching patient after midnight starts a today order (no banner)', !/คำสั่งนี้เป็นของวันที่/.test(container.textContent));
      setField('Current weight', 1000); fillRequired();
      await clickAsync(saveBtn());
      eq('…saved as the 18th', logged[1] && logged[1].ts, '2026-09-18');
      eq('…with the live DOL', logged[1] && logged[1].dol, 12);
    } finally {
      D.todayLocal = realToday;
    }
  });

  act(() => { root.unmount(); });
  console.log(`\nREVIEW 2026-09-17 · DRAFTS + DATES: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
