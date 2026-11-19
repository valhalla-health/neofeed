// verify-print-holds-1119.cjs — two Print holds from the code review of 2026-11-19.
//
//   §1 (H2) a tab behind the served release prints nothing: the order that tab saved, or
//           opened, may be one the release holds for a re-Submit, and the tab compares with its
//           own old CONSTANTS_VERSION. A read that could not be made does not hold Print, as it
//           does not hold Submit.
//   §2 (H3) the order on screen was revised or deleted on another device: the synced log no
//           longer holds its row, and Print is held instead of printing the old figures.
//
// Mounts the real <Calculator> in jsdom (the dev-only deps every calculator harness uses: see
// test/README.md). Both sections fail on 0bbeeed, where printReady reads neither.
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
async function section(title, fn) {
  console.log(`\n── ${title} ──`);
  try { await fn(); } catch (e) { eq(`(section ran to the end) ${e.message}`, false, true); }
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
global.showToast = (msg) => { toasts.push(String(msg)); };
let printed = 0;
window.print = () => { printed++; };
window.confirm = () => true;
window.prompt = () => 'reason';
// The served release, as compiled/tpn-room-version.js reads. `served` is what the host
// answers: "same", "newer", or "down" (the read fails).
let served = 'same';
let fetchDelayMs = 0;
global.fetch = async () => {
  if (fetchDelayMs) await new Promise((r) => setTimeout(r, fetchDelayMs));
  if (served === 'down') throw new Error('offline');
  const v = served === 'same' ? global.window.NeoFeedData_CONSTANTS : '2099-01-01.1';
  return { ok: true, text: async () => `window.TPN_ROOM_VERSIONS = { constantsVersion: ${JSON.stringify(v)}, stickerSchema: 1 };\n` };
};
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
vm.runInThisContext(R('data.js'));
window.NeoFeedData_CONSTANTS = window.NEOFEED_DATA.CONSTANTS_VERSION;
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
const inputFor = (label) => fieldOf(label)?.querySelector('input') || null;
function setField(label, value) {
  const input = inputFor(label);
  if (!input) throw new Error('field not found: ' + label);
  act(() => { valueSetter.call(input, String(value)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
const clickAsync = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const submitBtn = () => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Submit');
const sheet = () => container.querySelector('#print-form');
const heldLine = () => (container.querySelector('.print-held-elsewhere')?.textContent || '').replace(/\s+/g, ' ').trim();
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 20)); });

// Synthetic infant only.
const patient = { sessionId: 'PH-1000', name: 'PH', bw: 1000, currentBed: 'NICU 5', diagnosis: '-',
  weights: [{ dol: 1, w: 1000 }], admissionDate: '2026-11-10' };
let props;
function render(extra) {
  props = { ...props, ...extra };
  act(() => { root.render(React.createElement(window.Calculator, props)); });
}
let lastEntry = null;
async function mountAndSubmit() {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear();
  let saved = 0;
  props = { patient, entries: [], dol: 10, editEntry: null, baselineEntry: null, previousEntry: null, logDate: '2026-11-19',
    userLabel: 'Dr Test (doc@kcmh.test)', userEmail: 'doc@kcmh.test',
    onLog: (e) => { saved++; lastEntry = e; return Promise.resolve({ ok: true, entryId: 'e-' + saved, lastModified: 'lm-' + saved }); },
    onUpdate: () => Promise.resolve({ ok: true, lastModified: 'lm-u' }), onSaved() {}, onWeightChange() {} };
  render({});
  await settle();   // the release read when the form opens
  act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
  const central = [...container.querySelectorAll('.step2-ctrl .seg button')].find(b => b.textContent.trim() === 'Central');
  if (central && !central.classList.contains('on')) act(() => { central.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  setField('Current weight', 1000);
  ['Target fluid', 'Other IV', 'Drug volume', 'Input', 'Urine output', 'Drain content'].forEach(l => setField(l, l === 'Target fluid' ? 120 : 0));
  setField('ปริมาตรคาสาย', 0);
  setField('Dextrose final', 10); setField('Amino acid', 2); setField('Volume(mL/day)', 100);
  await clickAsync(submitBtn());
  await settle();
  // The app's log holds the saved row, as handleLogToGAS puts it there with the real entryId.
  render({ entries: [{ entryId: 'e-1', ts: '2026-11-19', status: 'submitted', lastModified: 'lm-1' }] });
  return saved;
}
// The same saved order opened again from the list (editEntry), as a ward tab does.
async function openSaved(row) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear();
  props = { ...props, editEntry: row, entries: [row] };
  render({});
  await settle();   // the release read when the form opens
}

(async () => {
  await section('§1 (H2) a tab behind the served release holds Print', async () => {
    served = 'same';
    eq('the order saves once', await mountAndSubmit(), 1);
    eq('same release: the sheet renders', !!sheet(), true);
    eq('…and no hold line', heldLine(), '');

    const row = { ...lastEntry, entryId: 'e-1', lastModified: 'lm-1', status: 'submitted' };
    await openSaved(row);
    eq('opened again from the list, same release: the sheet renders', !!sheet(), true);

    // A release went out after this tab loaded: the host now serves another version.
    served = 'newer';
    await openSaved(row);
    eq('a newer release served: the order opens, but the sheet does not render', !!sheet(), false);
    eq('…and the hold line says why', /ออกรุ่นใหม่แล้ว.*พิมพ์ใบสั่งไม่ได้/.test(heldLine()), true);

    served = 'down';
    await openSaved(row);
    eq('a release read that fails holds nothing (fails open, as Submit does)', !!sheet(), true);
    served = 'same';
  });

  await section('§2 (H3) the order on screen was revised or deleted on another device', async () => {
    served = 'same';
    await mountAndSubmit();
    eq('the saved row is in the log: the sheet renders', !!sheet(), true);
    render({ entries: [{ entryId: 'e-9', ts: '2026-11-19', status: 'submitted', lastModified: 'lm-9', revisionOf: 'e-1' }] });
    eq('another device revised it (the log holds e-9, not e-1): no sheet', !!sheet(), false);
    eq('…and the hold line says so', /ถูกแก้หรือลบจากเครื่องอื่น/.test(heldLine()), true);
    render({ entries: [] });
    eq('deleted (the log holds no row for it): no sheet', !!sheet(), false);
    render({ entries: [{ entryId: 'e-1', ts: '2026-11-19', status: 'submitted', lastModified: 'lm-1' }] });
    eq('the row back in the log: the sheet renders again', !!sheet(), true);
  });

  // Vera on the fix (2026-11-19): Print must read the release with Submit's timing, waiting for a
  // read in flight and reading again when the last one is over a minute old.
  await section('§3 (H2) Print waits for the release read, and reads again when it is stale', async () => {
    served = 'same';
    await mountAndSubmit();
    const row = { ...lastEntry, entryId: 'e-1', lastModified: 'lm-1', status: 'submitted' };

    // (a) Opened from the print list while the first read is still in flight, and it finds a newer release.
    served = 'newer'; fetchDelayMs = 300;
    const asked = [];
    act(() => { root.unmount(); });
    root = ReactDOM.createRoot(container);
    props = { ...props, editEntry: row, entries: [row], autoPrint: 'tok-1', requestPrint: (why) => asked.push(why) };
    render({});
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    eq('the read is still in flight: nothing asked to print yet', asked.length, 0);
    // act holds the read's state update until its callback ends, so the read lands in one act and
    // the held order's short wait (1.5 s) runs in the next.
    await act(async () => { await new Promise(r => setTimeout(r, 600)); });
    await act(async () => { await new Promise(r => setTimeout(r, 1800)); });
    eq('after the read: one print request, carrying the hold reason', asked.map(a => /ออกรุ่นใหม่แล้ว/.test(a || '') ? 'held' : String(a)), ['held']);
    eq('…and no sheet', !!sheet(), false);
    fetchDelayMs = 0;

    // (b) A Calculator left open across a release: the read made on opening is over a minute old.
    served = 'same';
    act(() => { root.unmount(); });
    root = ReactDOM.createRoot(container);
    props = { ...props, editEntry: row, entries: [row], autoPrint: null, requestPrint: null };
    render({});
    await settle();
    eq('opened on the same release: the sheet renders', !!sheet(), true);
    const realNow = Date.now;
    Date.now = () => realNow() + 61000;
    served = 'newer';
    printed = 0; toasts.length = 0;
    await act(async () => { document.dispatchEvent(new window.CustomEvent('__neofeed_print')); await new Promise(r => setTimeout(r, 50)); });
    Date.now = realNow;
    eq('a minute later, after a release: Print reads again and prints nothing', printed, 0);
    eq('…and the toast says why', toasts.some(t => /ออกรุ่นใหม่แล้ว.*พิมพ์ใบสั่งไม่ได้/.test(t)), true);
    served = 'same';
  });

  console.log(`\n${fail === 0 ? 'PRINT HOLDS 2026-11-19: ALL PASS' : `PRINT HOLDS 2026-11-19: ${fail} FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})();
