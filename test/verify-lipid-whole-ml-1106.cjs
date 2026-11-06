// verify-lipid-whole-ml-1106.cjs — Step 3's Lipid volume, tapped (CR-R-LIPID-WHOLE-ML).
//
// Pp, 2026-11-06: "ถ้ากดที่ลิพิตโวลุ่มจะ rounding ให้ หน่วยเป็น ml/day และย้อนกลับไปคำนวณ".
// Asked, she chose the nearest whole mL, and the whole mL below where rounding
// would take a dose across 4.0 g/kg/d. The pure rule is pinned by the clinical-rules
// cases; this harness taps the real box in the real Calculator:
//
//   §1  1,680 g on 2 g/kg/d (16.8 mL): a tap gives 17 mL, the 20% lipid box reads
//       2.02, and the pump rate (17 + Vitalipid 6 = 23 mL: 1 mL/hr, infusion 23 h)
//       and g/kg/h (2.02 ÷ 23 h = 0.09) are worked out again from the new dose; a
//       toast names both mL and both doses; a second tap changes nothing;
//   §2  1,680 g on 4 g/kg/d (33.6 mL): 34 mL would be 4.05 g/kg/d, so the tap
//       gives 33 mL and 3.93, and raises no "Lipid critically out of range";
//       400 g on 3.4 g/kg/d over 20 h (0.17 g/kg/h): 7 mL would be 0.18, so 6 mL
//       and 3 g/kg/d, and no "Lipid rate above the ceiling" (Vera on this PR);
//   §3  nothing rounds until the tap: typing 2 leaves 16.8 mL on screen; with no
//       lipid the box cannot be pressed; under 0.5 mL a tap leaves the dose;
//   §4  both pumps at 0.1 mL/hr with the hours they run (CR-R-PUMP-RATE): TPN
//       200 mL is 8.4 mL/hr for 23.8 h (the printed lipid line: CR-R-PUMP-RATE's
//       cases).
//
// Fails on ce06e16 (main before this change): there is no .lipid-vol-round to tap,
// and the pumps show 2 decimals over the hours typed.
// Mounts the real <Calculator> in jsdom: the deps in test/README.md.
// Synthetic infants only.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';
const R = (f) => fs.readFileSync(DIR + f, 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0, n = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(76)}${cond ? '' : '  ' + JSON.stringify(detail ?? '')}`);
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
let toasts = [];
global.showToast = (msg) => { toasts.push(String(msg)); };
window.print = () => {};
window.confirm = () => true;
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

const container = document.getElementById('root');
let root = ReactDOM.createRoot(container);
const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const fieldOf = (label) => [...container.querySelectorAll('.field')].find(d => d.querySelector('label')?.textContent.startsWith(label)) || null;
function setField(label, value) {
  const input = fieldOf(label)?.querySelector('input');
  if (!input) throw new Error('no field labelled ' + JSON.stringify(label));
  act(() => { valueSetter.call(input, String(value)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
const click = (el) => act(() => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const buttonNamed = (sel, name) => [...container.querySelectorAll(sel)].find(b => b.textContent.trim() === name) || null;

// A 1,680 g infant on a central bag with lipid, typed into the real Calculator.
function mount(lipid, { g = 1680, hours = 24, tpn = 200 } = {}) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear();
  toasts = [];
  const patient = { sessionId: 'LIP-1106', name: 'LIP', bw: g, currentBed: 'NICU 5', diagnosis: '-',
    weights: [{ dol: 1, w: g }], admissionDate: '2026-10-28' };
  act(() => { root.render(React.createElement(window.Calculator, {
    patient, dol: 10, editEntry: null, baselineEntry: null, previousEntry: null, logDate: '2026-11-06',
    userLabel: 'Dr Lipid (lipid@kcmh.test)', userEmail: 'lipid@kcmh.test',
    onLog: () => Promise.resolve({ ok: true, entryId: 'e-lip', lastModified: 'lm-1' }),
    onUpdate: () => Promise.resolve({ ok: true, lastModified: 'lm-u' }),
    onSaved() {}, onWeightChange() {} })); });
  act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
  click(buttonNamed('.step2-ctrl .seg button', 'Central'));
  setField('Current weight', g);
  setField('Target fluid', 150);
  for (const [label, v] of Object.entries({ 'Volume(mL/day)': tpn, 'Dextrose final': 10, 'Amino acid': 3, '20% lipid': lipid })) setField(label, v);
  if (hours !== 24) setField('Infuse over', hours);
}
const box = () => container.querySelector('button.lipid-vol-round');
const volText = () => text(box()?.querySelector('.num'));
const lipidBox = () => fieldOf('20% lipid')?.querySelector('input')?.value;
const pumpRate = () => {
  const pump = [...container.querySelectorAll('div')].find(d => d.firstElementChild?.textContent === 'PUMP RATE');
  return Number(pump?.querySelector('.num')?.firstChild?.textContent);
};
const gkgh = () => text(container.querySelector('.lipid-gkgh .num'));
const critTitles = () => [...container.querySelectorAll('.calc-bottom .alert-row.crit .title')].map(t => t.textContent);

(async () => {
  await section('§1 2 g/kg/d at 1,680 g: 16.8 mL becomes 17 mL, the dose and the pump follow', async () => {
    mount(2);
    ok('before the tap: 16.8 mL/day, 20% lipid 2', volText() === '16.8 mL/day' && lipidBox() === '2', [volText(), lipidBox()]);
    ok('the Lipid volume box is a button that can be pressed', !!box() && !box().disabled);
    ok('…and says it can be tapped while the volume is not whole', text(container.querySelector('.lipid-vol-round-hint')) === 'แตะเพื่อปัดเป็น mL เต็ม');
    click(box());
    ok('after the tap: 17 mL/day', volText() === '17 mL/day', volText());
    ok('…and 20% lipid reads 2.02 (17 × 0.2 ÷ 1.68, two decimals)', lipidBox() === '2.02', lipidBox());
    ok('…the pump rate is (17 + Vitalipid 6) ÷ 24 = 0.96, set at 1 mL/hr', pumpRate() === 1, pumpRate());
    ok('…which runs 23 h', text(container.querySelector('.lipid-pump-hours')) === 'infusion 23 h', text(container.querySelector('.lipid-pump-hours')));
    ok('…and g/kg/h is 2.02 ÷ 23 h = 0.09', gkgh() === '0.09', gkgh());
    ok('a toast names both mL and both doses', toasts.at(-1) === 'Lipid 16.8 → 17 mL/day · 20% lipid 2 → 2.02 g/kg/d', toasts);
    ok('the hint is gone once the volume is whole', !container.querySelector('.lipid-vol-round-hint'));
    click(box());
    ok('a second tap changes nothing', volText() === '17 mL/day' && lipidBox() === '2.02', [volText(), lipidBox()]);
    ok('…and says it is whole already', toasts.at(-1) === 'Lipid 17 mL/day เป็น mL เต็มแล้ว', toasts.at(-1));
  });

  await section('§2 4 g/kg/d at 1,680 g: never across 4.0', async () => {
    mount(4);
    ok('before the tap: 33.6 mL/day', volText() === '33.6 mL/day', volText());
    click(box());
    ok('34 mL would be 4.05 g/kg/d: the tap gives 33 mL', volText() === '33 mL/day', volText());
    ok('…and 20% lipid 3.93', lipidBox() === '3.93', lipidBox());
    ok('…with no "Lipid critically out of range"', !critTitles().includes('Lipid critically out of range'), critTitles());
    mount(3.4, { g: 400, hours: 20, tpn: 60 });
    ok('400 g, 3.4 g/kg/d over 20 h: 6.8 mL, 0.17 g/kg/h, not critical', volText() === '6.8 mL/day' && gkgh() === '0.17'
      && !critTitles().includes('Lipid rate above the ceiling'), [volText(), gkgh(), critTitles()]);
    click(box());
    ok('7 mL would be 0.18 g/kg/h: the tap gives 6 mL and 3 g/kg/d', volText() === '6 mL/day' && lipidBox() === '3', [volText(), lipidBox()]);
    ok('…with no "Lipid rate above the ceiling"', !critTitles().includes('Lipid rate above the ceiling'), [gkgh(), critTitles()]);
  });

  await section('§3 nothing rounds until the tap', async () => {
    mount(2);
    ok('typing 2 leaves 16.8 mL/day on screen', volText() === '16.8 mL/day', volText());
    mount(0);
    ok('no lipid: the box cannot be pressed', !!box() && box().disabled);
    mount(0.2, { g: 400, tpn: 60 });
    click(box());
    ok('400 g on 0.2 g/kg/d (0.4 mL): a tap leaves the dose', lipidBox() === '0.2' && volText() === '0.4 mL/day', [lipidBox(), volText()]);
    ok('…and says why', toasts.at(-1) === 'Lipid 0.4 mL/day ต่ำกว่า 0.5 mL — ไม่ปัด', toasts.at(-1));
  });

  await section('§4 both pumps at 0.1 mL/hr, and how long they run', async () => {
    mount(2);
    const rate = fieldOf('Rate')?.querySelector('input')?.value;
    const hint = text(fieldOf('Rate')?.querySelector('.field-hint') || fieldOf('Rate')?.lastElementChild);
    ok('TPN 200 mL/day: the Rate box reads 8.4 (200 ÷ 24 = 8.33, half up)', rate === '8.4', rate);
    ok('…and says it runs 23.8 h', hint.includes('= 200 mL/day · infusion 23.8 h'), hint);
  });

  act(() => { root.unmount(); });
  console.log(`\nLIPID WHOLE mL (CR-R-LIPID-WHOLE-ML): ${fail ? `${fail} FAILED of ${pass + fail}` : `ALL PASS (${pass} passed)`}`);
  process.exit(fail ? 1 : 0);
})();
