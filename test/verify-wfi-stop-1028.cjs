// verify-wfi-stop-1028.cjs — a bag whose stocks exceed its volume cannot be ordered (Pp, 2026-10-28).
//
// Pp, answering question Q2 of the neofeed-clinical-rules skill: "ถ้า WFI ติดลบ ให้ ไม่สามารถสั่งได้".
// Until then a negative WFI was a critical alert, so a typed reason sent pharmacy a form that asked
// for a negative volume of water. It is now a stop like the 1,250 mL bottle, on every path that
// reaches pharmacy:
//   §1  the Calculator: WFI 0 saves with no reason asked; WFI −0.1 is a red line, Submit is
//       disabled, the save panel says why, and a draft may still be kept. Each save sends
//       the stops that hold as calcInput.stops, which gas-backend.gs checks
//       (verify-backend-stops-1028.cjs)
//   §2  a row saved before the change, with a reason naming the alert, does not print (and, since
//       PR #180, a patient's order has no Copy Order button at all)
//   §3  Center Point's save refuses it too
//   §4  the Center Point packet module (center-point/tpn-document.mjs, which CP keeps an identical
//       copy of) names an over-full packet, tpnBagOverfull, and renderTpn says so on the sheet. CP
//       uses it to refuse to save, publish or print one, a revision confirmed before then included
//   §5  a submitted row with no route does not print either (Vera on PR #175): the backend reads
//       the app's stop list, so every print path must refuse each stop on its own, this one too
// The orders are verify-calc-sum.cjs's S8 (components fill the bag exactly, WFI 0), with its
// 1.3 mL of Ca gluconate swapped for 1.3 mL of Glycophos so no Ca-without-P alert asks for a
// reason, and the same order with KCl 1.1 instead of 1, which adds 0.1 mL of stock. Mounts the real <Calculator> in jsdom: the
// deps in test/README.md. Synthetic infants only.
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
global.showToast = (msg) => toasts.push(String(msg));
let printed = 0;
window.print = () => { printed++; };
window.confirm = () => true;
let asked = null;
window.prompt = (msg) => { asked = String(msg); return 'test reason'; };
try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true }); } catch {}
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
{ const w = console.error; console.error = (...a) => { if (!/act\(|not wrapped|Not implemented/.test(String(a[0]))) w(...a); }; }
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
function setField(label, value) {
  const input = fieldOf(label)?.querySelector('input') || saltRow(label)?.querySelector('input');
  if (!input) throw new Error('no field labelled ' + label);
  act(() => { valueSetter.call(input, String(value)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
const click = (el) => act(() => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const clickAsync = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const buttonNamed = (name) => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === name) || null;
const draftBtn = () => container.querySelector('button.save-draft');
const routeBtn = (name) => [...container.querySelectorAll('.step2-ctrl .seg button')].find(b => b.textContent.trim() === name);
const critTitles = () => [...container.querySelectorAll('.calc-bottom .alert-row.crit .title')].map(t => t.textContent);
const printForm = () => container.querySelector('#print-form');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function tryPrint() {
  printed = 0; const t0 = toasts.length;
  act(() => { document.dispatchEvent(new window.CustomEvent('__neofeed_print')); });
  await act(async () => { await sleep(10); });
  return { printed, toasts: toasts.slice(t0) };
}
const TITLE = 'Bag cannot be compounded';

// verify-calc-sum.cjs S8: 2,000 g, 130.45 mL with no dead space, components 130.5 = prepared 130.5.
const S8 = { 'Volume(mL/day)': 130.45, 'ปริมาตรคาสาย (dead space)': 0, 'Dextrose final': 20, 'Amino acid': 3.5,
  '20% NaCl': 2, 'KCl': 1, 'Glycophos': 1.3, 'Heparin': 0.6 };
const OVER = { ...S8, 'KCl': 1.1 };
const patient = { sessionId: 'WF-2000', name: 'WF', bw: 2000, currentBed: 'NICU 5', diagnosis: '-',
  weights: [{ dol: 1, w: 2000 }], admissionDate: '2026-10-18' };

function mountNew(extra = {}) {
  const box = { calls: 0, entry: null };
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear();
  act(() => { root.render(React.createElement(window.Calculator, {
    patient, dol: 10, editEntry: null, baselineEntry: null, previousEntry: null, logDate: '2026-10-28',
    userLabel: 'Dr Test (doc@kcmh.test)',
    onLog: (e) => { box.calls++; box.entry = e; return Promise.resolve({ ok: true, entryId: 'e-' + box.calls, lastModified: 'lm-' + box.calls }); },
    onUpdate: () => Promise.resolve({ ok: true, lastModified: 'lm-u' }), onSaved() {}, onWeightChange() {}, ...extra })); });
  act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
  return box;
}
function fill(order, { io = true } = {}) {
  click(routeBtn('Central'));
  setField('Current weight', 2000);
  for (const l of ['Target fluid', 'Other IV', 'Drug volume', ...(io ? ['Input', 'Urine output', 'Drain content'] : [])])
    setField(l, l === 'Target fluid' ? 120 : 0);
  for (const [l, v] of Object.entries(order)) setField(l, v);
}

(async () => {
  await section('§1 the Calculator: WFI 0 saves, WFI −0.1 cannot be ordered', async () => {
    let box = mountNew();
    fill(S8);
    ok('S8: components 130.5 + WFI 0 = 130.5 on screen', /Components130\.5 mL/.test(text(container)) && !critTitles().includes(TITLE), critTitles());
    asked = null;
    await clickAsync(buttonNamed('Submit'));
    eq('S8 is submitted', box.calls, 1);
    eq('…with no reason asked', asked, null);
    eq('…and an empty stop list for the backend', box.entry?.calcInput?.stops, []);

    box = mountNew();
    fill(OVER);
    ok(`KCl 1.1: "${TITLE}" is a red line`, critTitles().includes(TITLE), critTitles());
    eq('Submit is disabled', buttonNamed('Submit')?.disabled, true);
    const panel = text(container.querySelector('.bag-overfull'));
    ok('the save panel says why: 130.6 mL of stock in a 130.5 mL bag', /130\.6 mL/.test(panel) && /130\.5 mL/.test(panel) && /บันทึก\/พิมพ์ไม่ได้/.test(panel), panel);
    eq('a draft may still be kept', draftBtn()?.disabled, false);
    asked = null;
    await clickAsync(draftBtn());
    eq('…the draft is logged', box.calls, 1);
    eq('…as a draft', box.entry?.status, 'draft');
    eq('…and no reason was asked', asked, null);
    eq('…carrying the stop it holds, by its rule ID', box.entry?.calcInput?.stops, ['CR-BAG-OVERFULL']);
  });

  await section('§2 a row saved before the change, with a reason for the alert, is held', async () => {
    const ci = { curWtG: 2000, fluidTargetPerKg: 120, otherIV_mL: 0, drug_mL: 0, ioInput: 0, ioOutput: 0, drainContent: 0,
      route: 'central', totalTPN_mL: 130.45, deadVol_mL: 0, dexPct: 20, aaPerKg: 3.5, lipidPerKg: 0, naCl: 2, kCl: 1.1,
      glycophosP: 0.65, heparinUmL: 0.6, enType: 'BM_20', enVol: 0, enFreq: 0, constantsVersion: D.CONSTANTS_VERSION,
      critOverride: { reason: 'saved before 2026-10-28', alerts: [TITLE], at: '2026-10-27T10:00:00.000Z' } };
    const entry = { entryId: 'e-old', lastModified: 'lm-old', ts: '2026-10-27', dol: 10, weight: 2000, status: 'submitted',
      ioInput: 0, ioOutput: 0, drainContent: 0, enVolPerKg: 0, calcInput: ci };
    mountNew({ editEntry: entry });
    ok('the row reopens over-full', critTitles().includes(TITLE), critTitles());
    ok('no order form', !printForm());
    const p = await tryPrint();
    eq('Print order does not print', p.printed, 0);
    ok('…and says why', p.toasts.some(t => /130\.6 mL/.test(t) && /ก่อนพิมพ์/.test(t)), p.toasts);
    eq('no Copy Order either (a patient\'s order has none since PR #180)', buttonNamed('Copy Order to Clipboard'), null);
  });

  await section('§3 Center Point refuses it too', async () => {
    const saved = [];
    const centerPoint = { save(p) { saved.push(p); return Promise.resolve({ sourceRecordId: patient.sessionId, recordedAt: '2026-10-28T08:00:00.000Z' }); },
      review() {}, failed() {} };
    mountNew({ centerPoint, onLog: undefined, onUpdate: undefined });
    fill(OVER, { io: false });
    ok(`"${TITLE}" on the Center Point entry`, critTitles().includes(TITLE), critTitles());
    eq('its บันทึก button is disabled', buttonNamed('บันทึก')?.disabled, true);
    await clickAsync(buttonNamed('บันทึก'));
    eq('…and nothing reaches Center Point', saved.length, 0);
    setField('KCl', 1);
    eq('back to WFI 0: บันทึก is enabled', buttonNamed('บันทึก')?.disabled, false);
  });

  await section('§4 the Center Point packet names an over-full bag', async () => {
    const { TPN_FIELDS, validateTpn, renderTpn, tpnBagOverfull } =
      await import(require('url').pathToFileURL(DIR + 'center-point/tpn-document.mjs').href);
    const values = Object.fromEntries(TPN_FIELDS.map(f => [f[0], '1']));
    Object.assign(values, { components: '130.6', prepared: '130.5', wfi: '-0.1' });
    const over = { schema: 'neofeed-tpn-v2', templateVersion: 'cp-tpn-2', appVersion: '2026-test', constantsVersion: '2026-test',
      orderDate: '2026-10-28', effectiveFrom: '2026-10-28T01:00:00.000Z', effectiveTo: '2026-10-29T01:00:00.000Z',
      dosingWeightG: 2000, currentWeightG: 2000, usingBirthWeight: false, route: 'central', dol: 10, values,
      preparations: { ca: 'none', phosphate: 'none', iron: 'none', enteral: 'BM_20' }, criticalOverride: null };
    const withWfi = (wfi) => ({ ...over, values: { ...values, wfi } });
    eq('tpnBagOverfull is exported', typeof tpnBagOverfull, 'function');
    eq('WFI −0.1 → over-full', tpnBagOverfull(over), true);
    eq('WFI 0, −0, 2.1 and — → not over-full', ['0', '-0', '2.1', '—'].map(w => tpnBagOverfull(withWfi(w))), [false, false, false, false]);
    eq('the packet format still reads −0.1, so a revision saved before stays viewable', validateTpn(over).values.wfi, '-0.1');
    const sheet = document.createElement('div');
    renderTpn(sheet, over);
    const banner = text(sheet.querySelector('.tpn-overfull'));
    ok('renderTpn: a red line naming 130.6 mL in a 130.5 mL bag', /130\.6 mL/.test(banner) && /130\.5 mL/.test(banner) && /พิมพ์ไม่ได้/.test(banner), banner);
    renderTpn(sheet, withWfi('0'));
    ok('…and none at WFI 0', !sheet.querySelector('.tpn-overfull'));
  });

  await section('§5 a submitted row with no route is held like every other stop', async () => {
    // What a hand-made POST could store: a bag with route null and an empty stop list. D7.5
    // and amino acid 1.5, so no critical alert that asks a reason (a bag with no route is graded
    // as peripheral) holds it for another reason. Before Vera's finding it printed "Route: —".
    const ci = { curWtG: 2000, fluidTargetPerKg: 120, otherIV_mL: 0, drug_mL: 0, ioInput: 0, ioOutput: 0, drainContent: 0,
      route: null, totalTPN_mL: 130.45, deadVol_mL: 0, dexPct: 7.5, aaPerKg: 1.5, lipidPerKg: 0, naCl: 2, kCl: 1,
      glycophosP: 0.65, heparinUmL: 0.6, enType: 'BM_20', enVol: 0, enFreq: 0, constantsVersion: D.CONSTANTS_VERSION, stops: [] };
    const entry = { entryId: 'e-noroute', lastModified: 'lm-noroute', ts: '2026-10-28', dol: 10, weight: 2000, status: 'submitted',
      ioInput: 0, ioOutput: 0, drainContent: 0, enVolPerKg: 0, calcInput: ci };
    mountNew({ editEntry: entry });
    ok('the row reopens with no route', /ยังไม่ได้เลือก route ของ TPN/.test(text(container)), text(container.querySelector('.calc-bottom')).slice(0, 120));
    ok('no order form', !printForm());
    const p = await tryPrint();
    eq('Print order does not print', p.printed, 0);
    ok('…and says why', p.toasts.some(t => /route/.test(t) && /ก่อนพิมพ์/.test(t)), p.toasts);
    eq('no Copy Order either (since PR #180)', buttonNamed('Copy Order to Clipboard'), null);
  });

  act(() => { root.unmount(); });
  console.log(`\nWFI STOP 2026-10-28: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
