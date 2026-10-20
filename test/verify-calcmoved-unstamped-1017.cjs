// verify-calcmoved-unstamped-1017.cjs — a saved order with no CONSTANTS_VERSION
// stamp prints only after it is saved again (Vera, PR #159 finding 4).
//
// A saved order prints what the calculator computes NOW from its inputs, so
// calcMoved holds Print once CONSTANTS_VERSION has moved past the version the
// row was computed with. A row saved before 2026-09-18 carries neither
// calcInput.constantsVersion nor calcInput.aaProduct. Until this fix calcMoved
// checked such a row only against the 2026-09-18.1 release's own changes
// (overfilled vitamins, a MEN feed), so after any later bump (2026-09-28.1,
// 2026-10-08.1, 2026-10-11.1, the EN_DB rebuild in #159) it reprinted under its
// old entry id with figures computed from today's constants.
//
//   §1  fixture: the same feeds-only order carrying the current stamp prints
//   §2  unstamped, no aaProduct, feeds only, no TPN: Print and Copy refused with
//       the calcMoved reason; saving it again restamps it and it prints
//   §3  an unstamped order with TPN and no dead space is held the same way
//   §4  a row dated by aaProduct (2026-09-18.1) is still held, as before
//
// Mounts the real <Calculator> in jsdom (dev-only deps, see test/README.md).
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
let printed = 0;
window.print = () => { printed++; };
window.confirm = () => false;
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
const clickAsync = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const buttonText = (re) => [...container.querySelectorAll('button')].find(b => re.test(b.textContent));
const saveBtn = () => [...container.querySelectorAll('button')].find(b => ['Submit', 'บันทึก'].includes(b.textContent.trim()));
const printForm = () => container.querySelector('#print-form');
const banner = () => (container.querySelector('.print-blocked')?.textContent || '').replace(/\s+/g, ' ');
const critTitles = () => [...container.querySelectorAll('.calc-bottom .alert-row.crit .title')].map(t => t.textContent);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function tryPrint() {
  printed = 0; const t0 = toasts.length;
  act(() => { document.dispatchEvent(new window.CustomEvent('__neofeed_print')); });
  await act(async () => { await sleep(10); });
  return { printed, toasts: toasts.slice(t0).map(t => t.msg) };
}
async function tryCopy() {
  const t0 = toasts.length;
  await clickAsync(buttonText(/Copy Order/));
  return toasts.slice(t0).map(t => t.msg);
}

const MOVED_PRINT = 'NeoFeed ปรับการคำนวณหลังคำสั่งนี้ถูกบันทึก — ตัวเลขบางรายการเปลี่ยน ตรวจสอบและบันทึกใหม่ก่อนพิมพ์';
const MOVED_COPY = 'NeoFeed ปรับการคำนวณหลังคำสั่งนี้ถูกบันทึก — ตัวเลขบางรายการเปลี่ยน ตรวจสอบและบันทึกใหม่ก่อนคัดลอก';

const patient = { sessionId: 'UN-1500', name: 'UN', bw: 1500, currentBed: 'NICU 5', diagnosis: '-',
  weights: [{ dol: 1, w: 1500 }], admissionDate: '2026-09-05' };
// Feeds only: FBM_PF_24 30 mL × 8 at 1500 g = 160 mL/kg/d, no TPN.
const feedsOnly = { curWtG: 1500, fluidTargetPerKg: 160, otherIV_mL: 0, drug_mL: 0, ioInput: 240, ioOutput: 90, drainContent: 0,
  totalTPN_mL: 0, deadVol_mL: 0, dexPct: 0, aaPerKg: 0, lipidPerKg: 0, enType: 'FBM_PF_24', enVol: 30, enFreq: 8 };
// enVolPerKg is the row's own evidence of its dosing weight (savedDosingWeightOf),
// so it must agree with 1500 g or the dosing-weight rule holds the row instead.
const row = (id, ci) => ({ entryId: id, lastModified: 'lm-' + id, ts: '2026-09-10', dol: 6, weight: 1500, status: 'submitted',
  ioInput: ci.ioInput, ioOutput: ci.ioOutput, drainContent: ci.drainContent, enVolPerKg: ci.enVol * ci.enFreq / 1.5, calcInput: ci });
function open(entry) {
  const box = { updated: null };
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear();
  act(() => { root.render(React.createElement(window.Calculator, {
    patient, dol: 6, editEntry: entry, baselineEntry: null, previousEntry: null, logDate: null,
    userLabel: 'Dr Test (doc@kcmh.test)', onLog() { return Promise.resolve({ ok: false }); },
    onUpdate: (id, lm, e) => { box.updated = e; return Promise.resolve({ ok: true, lastModified: 'lm-2' }); },
    onSaved() {}, onWeightChange() {} })); });
  return box;
}

(async () => {
  await section('§1 fixture: the feeds-only order with the current stamp prints', async () => {
    open(row('e-now', { ...feedsOnly, constantsVersion: D.CONSTANTS_VERSION }));
    eq('no critical alert on the fixture', critTitles(), []);
    ok('the print form renders', !!printForm(), banner());
    const p = await tryPrint();
    eq('Print order prints', p.printed, 1);
  });

  await section('§2 unstamped (no constantsVersion, no aaProduct), feeds only, no TPN: held', async () => {
    ok(`CONSTANTS_VERSION ${D.CONSTANTS_VERSION} is newer than 2026-09-18.1`, D.CONSTANTS_VERSION > '2026-09-18.1', D.CONSTANTS_VERSION);
    const box = open(row('e-old', { ...feedsOnly }));
    eq('no critical alert, so only the stamp is under test', critTitles(), []);
    ok('no print form', !printForm());
    ok('…the banner says the calculation changed', /NeoFeed ปรับการคำนวณหลังคำสั่งนี้ถูกบันทึก/.test(banner()), banner());
    const p = await tryPrint();
    eq('Print order does not print', p.printed, 0);
    ok('…the toast is the calcMoved message', p.toasts.includes(MOVED_PRINT), p.toasts);
    const c = await tryCopy();
    ok('Copy is refused with the same reason', c.includes(MOVED_COPY), c);
    await clickAsync(saveBtn());
    eq('saving it again restamps the row', box.updated && box.updated.calcInput.constantsVersion, D.CONSTANTS_VERSION);
    ok('…after which it prints', !!printForm(), banner());
  });

  await section('§3 unstamped with TPN and no dead space: held', async () => {
    open(row('e-old-tpn', { ...feedsOnly, enVol: 10, totalTPN_mL: 100, dexPct: 10, aaPerKg: 2, lipidPerKg: 1 }));
    eq('no critical alert', critTitles(), []);
    ok('no print form, with the calcMoved reason', !printForm() && /NeoFeed ปรับการคำนวณ/.test(banner()), banner());
  });

  await section('§4 a row dated by aaProduct (2026-09-18.1) is held as before', async () => {
    open(row('e-win', { ...feedsOnly, aaProduct: 'aminoven10' }));
    ok('no print form, with the calcMoved reason', !printForm() && /NeoFeed ปรับการคำนวณ/.test(banner()), banner());
  });

  act(() => { root.unmount(); });
  console.log(`\nCALCMOVED UNSTAMPED 2026-10-17: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
