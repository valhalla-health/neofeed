// verify-one-source-thresholds-1110.cjs — every limit the Calculator writes out
// comes from data.js (Pp, 2026-11-10: "ลองดูว่าใน calculator ยังมีกฎทางคลินิก
// ข้ออื่นที่ลอกซ้ำแบบนี้อีกไหม", then "เริ่มแก้เลย").
//
// GIR was graded from two copies of its limit until 2026-09-23 (data.js, above
// GIR_HARD_HI). The grading moved into data.js, but text beside it still typed
// the numbers: "target 8–10 · max 12" under the GIR meter, "<900 mOsm/L" on the
// printed form and the quick calc's Copy, the IV NPE:AA caution at 20 and the
// "Central only!" dextrose flag at 12.5 %. Change the constant and those stayed.
//
// This harness plants other values in window.NEOFEED_DATA before each mount, the
// way a future change to data.js would, and reads the screen, the printed form
// and the Copy text. A copy left in calculator.jsx keeps the old number and fails.
//
//   §1  GIR: the meter's optimal zone, the line under it and the dextrose-ceiling
//       alert's GIR figure follow TARGETS.girTarget and GIR_HARD_HI
//   §2  osmolarity: the printed form's route line and the quick calc's Copy
//       follow OSM_PERIPHERAL_MAX
//   §3  NPE:AA IV caution follows NPE_IV_WARN_LO (alert, its text, the zone)
//   §4  "Central only!" follows DEX_PERIPHERAL_MAX_PCT
//   §5  with the real constants nothing moved: the same words as before
//
// Fails against e555695, where every one of these is a literal. Mounts the real
// <Calculator> in jsdom (the dev-only deps every calculator harness uses — see
// test/README.md). Synthetic infants only.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';
const R = (f) => fs.readFileSync(DIR + f, 'utf8');

let pass = 0, fail = 0, n = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(72)}${cond ? '' : '  ' + JSON.stringify(detail ?? '')}`);
  cond ? pass++ : fail++;
}
async function section(title, fn) {
  console.log(`\n── ${title} ──`);
  try { await fn(); } catch (e) { ok(`(section ran to the end) ${e.message}`, false, e.stack.split('\n').slice(0, 3)); }
  finally { restore(); }
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
let copied = null;
const clipboardStub = { writeText: (t) => { copied = t; return Promise.resolve(); } };
try { Object.defineProperty(window.navigator, 'clipboard', { value: clipboardStub, configurable: true }); }
catch { try { window.navigator.clipboard.writeText = clipboardStub.writeText; } catch { /* the Copy check fails loudly */ } }
try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true }); } catch {}
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
{
  const w = console.error;
  console.error = (...a) => { if (!/act\(|not wrapped|Not implemented/.test(String(a[0]))) w(...a); };
}
vm.runInThisContext(R('data.js'));
const D = window.NEOFEED_DATA;
for (const f of ['icons.jsx', 'calculator.jsx']) {
  vm.runInThisContext(babel.transformSync(R(f), {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    filename: f, configFile: false, babelrc: false,
  }).code);
}

// ── planting values in data.js's exports ───────────────────────────────────
const REAL = { GIR_HARD_HI: D.GIR_HARD_HI, girTarget: D.TARGETS.girTarget, OSM_PERIPHERAL_MAX: D.OSM_PERIPHERAL_MAX,
  NPE_IV_WARN_LO: D.NPE_IV_WARN_LO, DEX_PERIPHERAL_MAX_PCT: D.DEX_PERIPHERAL_MAX_PCT };
function plant(vals) {
  for (const [k, v] of Object.entries(vals)) {
    if (k === 'girTarget') D.TARGETS.girTarget = () => v; else D[k] = v;
  }
}
function restore() {
  D.TARGETS.girTarget = REAL.girTarget;
  for (const k of ['GIR_HARD_HI', 'OSM_PERIPHERAL_MAX', 'NPE_IV_WARN_LO', 'DEX_PERIPHERAL_MAX_PCT']) D[k] = REAL[k];
}

// ── mounting and typing ────────────────────────────────────────────────────
const container = document.getElementById('root');
let root = ReactDOM.createRoot(container);
const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
const fieldOf = (label) => [...container.querySelectorAll('.field')].find(d => d.querySelector('label')?.textContent.startsWith(label)) || null;
function setField(label, value) {
  const input = fieldOf(label)?.querySelector('input');
  if (!input) throw new Error('field not found: ' + label);
  act(() => { valueSetter.call(input, String(value)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
const click = (el) => act(() => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const clickAsync = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const alertTexts = () => [...container.querySelectorAll('.calc-bottom .alert-row')].map(a => text(a));
function pickRoute(name) {
  const b = [...container.querySelectorAll('.step2-ctrl .seg button')].find(x => x.textContent.trim() === name);
  if (!b) throw new Error('route button not found: ' + name);
  click(b);
}
function openAll() {
  act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
}
const pt = (sid, bw) => ({ sessionId: sid, name: sid.slice(0, 2), bw, currentBed: 'NICU 5', diagnosis: '-',
  weights: [{ dol: 1, w: bw }], admissionDate: '2026-11-08' });
let saved = 0;
function mountPatient(route) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear();
  act(() => {
    root.render(React.createElement(window.Calculator, {
      patient: pt('OS-1000', 1000), dol: 3, editEntry: null, baselineEntry: null, previousEntry: null,
      logDate: '2026-11-10', userLabel: 'Dr Test (doc@kcmh.test)',
      onLog: () => { saved++; return Promise.resolve({ ok: true, entryId: 'e-' + saved, lastModified: 'lm-' + saved }); },
      onUpdate: () => Promise.resolve({ ok: true, lastModified: 'lm-u' }), onSaved() {}, onWeightChange() {},
    }));
  });
  openAll();
  pickRoute(route);
}
// 1 kg, 100 mL/kg/d with no dead space: the clinical-rules skill's CR-NPE-AA
// and CR-OSM-PERIPH orders.
function order({ dex, aa }) {
  setField('Current weight', 1000);
  ['Target fluid', 'Other IV', 'Drug volume'].forEach(l => setField(l, l === 'Target fluid' ? 100 : 0));
  // A patient's order needs I/O before Submit; the quick calc has none.
  ['Input', 'Urine output', 'Drain content'].forEach(l => { if (fieldOf(l)) setField(l, 0); });
  setField('ปริมาตรคาสาย', 0);
  setField('Dextrose final', dex); setField('Amino acid', aa);
  setField('Volume(mL/day)', 100);
}
const submitBtn = () => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Submit');
const printText = () => text(container.querySelector('#print-form'));

(async () => {
  await section('§1 GIR: the meter and its line follow TARGETS.girTarget and GIR_HARD_HI', async () => {
    plant({ girTarget: [7, 9], GIR_HARD_HI: 13 });
    mountPatient('Central');
    order({ dex: 10, aa: 2 });
    const zone = container.querySelector('.dex-gir-row .zone.z-best');
    ok('optimal zone title reads the planted 7–9', zone?.getAttribute('title') === 'Optimal: 7–9', zone?.getAttribute('title'));
    const row = text(container.querySelector('.dex-gir-row'));
    ok('line under the meter: "target 7–9 · max 13"', row.includes('target 7–9 · max 13'), row.slice(-80));
    // D18 at 100 mL/kg/d is 18 g/kg/d, over MAX_DEXTROSE_G_KG: the alert names the GIR limit (Vera).
    mountPatient('Central');
    order({ dex: 18, aa: 2 });
    const dexAlert = alertTexts().find(t => t.includes('Dextrose over KCMH max'));
    ok('dextrose-ceiling alert: "(glucose 13 mg/kg/min)"', !!dexAlert && dexAlert.includes('(glucose 13 mg/kg/min)'), dexAlert);
  });

  await section('§2 osmolarity: printed route line and quick calc Copy follow OSM_PERIPHERAL_MAX', async () => {
    plant({ OSM_PERIPHERAL_MAX: 870 });
    for (const route of ['Central', 'Peripheral']) {
      mountPatient(route);
      order({ dex: 10, aa: 2 });
      await clickAsync(submitBtn());
      const p = printText();
      ok(`${route}: the form prints`, p.length > 200, p.slice(0, 60));
      ok(`${route}: route line reads "Peripheral (<870 mOsm/L)"`, p.includes('(<870 mOsm/L)') && !p.includes('<900'), p.match(/Route of Delivery[^W]*/)?.[0]);
    }
    // The quick calc: the one text NeoFeed still copies.
    act(() => { root.unmount(); });
    root = ReactDOM.createRoot(container);
    act(() => {
      root.render(React.createElement(window.Calculator, {
        patient: { sessionId: null, name: null, initials: null, bw: 0, ga: 0, sex: '', currentBed: '', diagnosis: '',
          weights: [], lengths: [], hcs: [] },
        dol: 3, scratch: true, editEntry: null, baselineEntry: null, previousEntry: null, logDate: null, userLabel: '', userEmail: '',
      }));
    });
    openAll();
    pickRoute('Peripheral');
    order({ dex: 10, aa: 2 });
    copied = null;
    const btn = [...container.querySelectorAll('button')].find(b => /คัดลอกผลคำนวณ/.test(b.textContent));
    ok('quick calc offers คัดลอกผลคำนวณ', !!btn);
    if (btn) await clickAsync(btn);
    const line = typeof copied === 'string' ? copied.split('\n').find(l => l.startsWith('Route:')) : null;
    ok('Copy: "Route: Peripheral (<870 mOsm/L)"', line === 'Route: Peripheral (<870 mOsm/L)', line);
  });

  await section('§3 NPE:AA IV caution follows NPE_IV_WARN_LO', async () => {
    // IV NPE:AA 20 exactly (AA 1.7 g/kg in D10): no caution at 20, one at a planted 22.
    plant({ NPE_IV_WARN_LO: 22 });
    mountPatient('Central');
    order({ dex: 10, aa: 1.7 });
    const all = alertTexts().join(' | ');
    ok('IV 20 is below a planted 22: "kcal/g AA < 22"', all.includes('kcal/g AA < 22'), all);
    ok('…and no "< 20" is left in its text', !all.includes('kcal/g AA < 20'), all);
    // IV 22.7 (AA 1.5): above a planted 22, so no IV caution; the total figure
    // (no feed, the same 22.7) is under 24 and names its zone. Both alerts share
    // the title "NPE:AA off target", so the screen shows one at a time.
    mountPatient('Central');
    order({ dex: 10, aa: 1.5 });
    const zone = alertTexts().find(t => t.includes('soft-alert zone'));
    ok('IV 22.7, total under 24: the zone runs from the planted 22', !!zone && zone.includes('soft-alert zone 22–<24'), alertTexts());
  });

  await section('§4 "Central only!" follows DEX_PERIPHERAL_MAX_PCT', async () => {
    plant({ DEX_PERIPHERAL_MAX_PCT: 11 });
    mountPatient('Peripheral');
    order({ dex: 12, aa: 2 });
    ok('D12 on a peripheral line is above a planted 11: flagged', /Central only!/.test(text(container)), '');
    restore();
    mountPatient('Peripheral');
    order({ dex: 12, aa: 2 });
    ok('with the real 12.5, D12 is not flagged', !/Central only!/.test(text(container)), '');
  });

  await section('§5 the real constants: the same words as before', async () => {
    mountPatient('Peripheral');
    order({ dex: 10, aa: 2 });
    const row = text(container.querySelector('.dex-gir-row'));
    ok('"target 8–10 · max 12" under the meter', row.includes('target 8–10 · max 12'), row.slice(-80));
    ok('optimal zone 8–10', container.querySelector('.dex-gir-row .zone.z-best')?.getAttribute('title') === 'Optimal: 8–10');
    await clickAsync(submitBtn());
    ok('the form prints "(<900 mOsm/L)"', printText().includes('☑ Peripheral (<900 mOsm/L)'), printText().match(/Route of Delivery[^W]*/)?.[0]);
    mountPatient('Central');
    order({ dex: 10, aa: 1.71 });
    ok('IV 19.9 still reads "kcal/g AA < 20"', alertTexts().join(' | ').includes('NPE:AA IV 19.9 kcal/g AA < 20'), alertTexts());
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
