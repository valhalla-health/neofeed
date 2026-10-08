// verify-dosing-weight-1008.cjs — the TPN calc. weight (the dosing weight),
// Pp, 2026-10-08, after an outside review of release 62b6dec saved a 900 g
// infant's order dosed at 8,500 g: the field could be typed over with any
// number, and every dose and mL followed it.
//
//   §1  a typed weight within 20 % of the automatic one: no alert, no reason
//   §2  more than 20 % away: critical, ordered only with a typed reason, which prints
//   §3  the review's case, 8,500 g over 900 g measured: out of range, no order, no draft
//   §4  a tenfold typo inside the range (7,000 over 700): critical
//   §5  the range edges: 200 and 8,000 save, 199 and 8,001 do not
//   §6  the automatic weight is never judged against itself, and
//       "ใช้ค่าอัตโนมัติ" clears the alert
//   §7  a measured weight out of range (9,000 g, no override) stops the same way
//
// gas-backend.gs refuses an out-of-range calcInput.tpnWtG as well:
// verify-input-validation.cjs § 3b. Mounts the real <Calculator> in jsdom (the
// dev-only deps every calculator harness uses — see test/README.md). Fails
// against 453108a, where none of this exists.
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
global.showToast = (msg) => { toasts.push(String(msg)); };
window.print = () => {};
window.confirm = () => true;
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
const fieldOf = (label) => [...container.querySelectorAll('.field')].find(d => d.querySelector('label')?.textContent.startsWith(label)) || null;
const inputFor = (label) => fieldOf(label)?.querySelector('input') || null;
function setField(label, value) {
  const input = inputFor(label);
  if (!input) throw new Error('field not found: ' + label);
  act(() => { valueSetter.call(input, String(value)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
const clickAsync = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const button = (re) => [...container.querySelectorAll('button')].find(b => re.test(b.textContent.trim())) || null;
const submitBtn = () => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Submit');
const draftBtn = () => container.querySelector('button.save-draft');
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const printText = () => text(container.querySelector('#print-form'));
const alertRows = () => [...container.querySelectorAll('.calc-bottom .alert-row')].map(a => ({
  level: ['crit', 'warn', 'info'].find(c => a.classList.contains(c)),
  title: a.querySelector('.title')?.textContent || '', text: a.textContent.replace(/\s+/g, ' ') }));
const FAR = 'TPN calc. weight far from automatic';
const OUT = 'TPN calc. weight out of range';
const alertNamed = (title) => alertRows().find(a => a.title === title) || null;
const critTitles = () => alertRows().filter(a => a.level === 'crit').map(a => a.title);

const BASE = { dol: 3, editEntry: null, baselineEntry: null, previousEntry: null, logDate: '2026-10-08',
  userLabel: 'Dr Test (doc@kcmh.test)', onUpdate() { return Promise.resolve({ ok: true, lastModified: 'lm-u' }); },
  onSaved() {}, onWeightChange() {} };
function mount(props) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear();
  toasts.length = 0;
  act(() => { root.render(React.createElement(window.Calculator, { ...BASE, ...props })); });
  act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
}
function logger() {
  const box = { entry: null, calls: 0 };
  box.onLog = (e) => { box.entry = e; box.calls++; return Promise.resolve({ ok: true, entryId: 'e-' + box.calls, lastModified: 'lm-' + box.calls }); };
  return box;
}
let prompts = 0;
async function submit(reason = 'dry weight agreed on rounds') {
  prompts = 0;
  window.prompt = () => { prompts++; return reason; };
  await clickAsync(submitBtn());
}
async function saveDraft() {
  window.prompt = () => { prompts++; return 'x'; };
  await clickAsync(draftBtn());
}
// Synthetic infants only (no real identifiers).
const pt = (sid, bw) => ({ sessionId: sid, name: sid.slice(0, 2), bw, currentBed: 'NICU 5', diagnosis: '-',
  weights: [{ dol: 1, w: bw }], admissionDate: '2026-10-06' });
// A plain order that raises no critical alert of its own at any weight here:
// 100 mL/kg/d of 10 % dextrose with AA 2 and lipid 2 g/kg/d, no dead space.
function order(curG, tpnG) {
  setField('Current weight', curG);
  ['Target fluid', 'Other IV', 'Drug volume', 'Input', 'Urine output', 'Drain content']
    .forEach(l => setField(l, l === 'Target fluid' ? 120 : 0));
  setField('ปริมาตรคาสาย', 0);
  setField('Dextrose final', 10); setField('Amino acid', 2);
  if (tpnG != null) setField('TPN calc. weight', tpnG);
  setField('Volume(mL/day)', Math.round((tpnG || curG) / 10));
}

(async () => {
  // ═══════════════════════════ §1 within 20 % ══════════════════════════════
  await section('§1 a typed weight within 20 % of the automatic one is not judged', async () => {
    for (const typed of [1080, 720]) {
      const log = logger();
      mount({ patient: pt('DW-0900', 900), onLog: log.onLog });
      order(900, typed);
      eq(`${typed} g over 900 g: the field holds it`, inputFor('TPN calc. weight')?.value, String(typed));
      eq(`${typed} g: no critical alert at all (exactly 20 % is not above it)`, critTitles(), []);
      await submit();
      eq(`${typed} g: Submit asked no reason`, prompts, 0);
      eq(`${typed} g: saved once, dosed at ${typed} g`, [log.calls, log.entry?.calcInput?.tpnWtG], [1, typed]);
      ok(`${typed} g: no override on the row`, !log.entry?.calcInput?.critOverride, log.entry?.calcInput?.critOverride);
    }
  });

  // ═══════════════════════════ §2 more than 20 % ═══════════════════════════
  await section('§2 more than 20 % away is critical: a reason orders it, and it prints', async () => {
    const log = logger();
    mount({ patient: pt('DW-0900', 900), onLog: log.onLog });
    order(900, 1090);
    const far = alertNamed(FAR);
    eq('1090 over 900 g raises the critical alert', far?.level, 'crit');
    ok('…naming both weights and the difference', /1090 g typed, automatic 900 g \(\+21 %/.test(far?.text || ''), far?.text);
    ok('the manual-weight line under Step 1 turns red', /var\(--crit\)/.test(container.querySelector('.tpn-wt-manual')?.getAttribute('style') || ''),
      container.querySelector('.tpn-wt-manual')?.getAttribute('style'));
    await submit(null);
    eq('cancelling the reason saves nothing', log.calls, 0);
    await submit('oedema — dosing at the pre-oedema weight');
    eq('with a reason it saves', log.calls, 1);
    ok('…and the override names this alert', (log.entry?.calcInput?.critOverride?.alerts || []).includes(FAR), log.entry?.calcInput?.critOverride);
    ok('the form prints the alert and the reason', printText().includes(FAR) && printText().includes('oedema — dosing at the pre-oedema weight'),
      printText().match(/CRITICAL.{0,200}|เหตุผล.{0,80}/));
    eq('nothing holds Print back (the reason covers the alert)', text(container.querySelector('.print-blocked')), '');

    mount({ patient: pt('DW-0900', 900), onLog: logger().onLog });
    order(900, 710);
    ok('710 under 900 g (−21 %) is critical too', /710 g typed, automatic 900 g \(−21 %/.test(alertNamed(FAR)?.text || ''), alertNamed(FAR)?.text);
  });

  // ═══════════════════════════ §3 the review's case ════════════════════════
  await section('§3 8,500 g over 900 g measured: out of range, no order and no draft', async () => {
    const log = logger();
    mount({ patient: pt('DW-0900', 900), onLog: log.onLog });
    order(900, 8500);
    eq('the out-of-range alert is critical', alertNamed(OUT)?.level, 'crit');
    eq('…and stands alone (no "far from automatic" beside it)', alertNamed(FAR), null);
    ok('a banner says it cannot be saved, draft included',
      /TPN calc\. weight 8500 g อยู่นอกช่วง 200–8000 g — ตรวจว่าพิมพ์ถูกหลัก — บันทึก\/พิมพ์ไม่ได้ \(รวมแบบร่าง\)/.test(text(container.querySelector('.tpn-wt-out-of-range'))),
      text(container.querySelector('.tpn-wt-out-of-range')));
    eq('Submit is disabled', submitBtn()?.disabled, true);
    eq('Save draft is disabled', draftBtn()?.disabled, true);
    await submit(); await saveDraft();
    eq('nothing reached the backend', log.calls, 0);
  });

  // ═══════════════════════════ §4 tenfold typo in range ════════════════════
  await section('§4 a tenfold typo inside the range (7,000 over 700 g) is critical', async () => {
    const log = logger();
    mount({ patient: pt('DW-0700', 700), onLog: log.onLog });
    order(700, 7000);
    eq('no out-of-range alert: 7,000 g is a weight', alertNamed(OUT), null);
    ok('"far from automatic", +900 %', /7000 g typed, automatic 700 g \(\+900 %/.test(alertNamed(FAR)?.text || ''), alertNamed(FAR)?.text);
    await submit(null);
    eq('not saved without a reason', log.calls, 0);
  });

  // ═══════════════════════════ §5 range edges ══════════════════════════════
  await section('§5 the edges: 8,000 and 200 save; 8,001 and 199 do not', async () => {
    for (const [cur, typed, saves] of [[7000, 8000, true], [7000, 8001, false], [210, 200, true], [210, 199, false]]) {
      const log = logger();
      mount({ patient: pt('DW-EDGE', cur), onLog: log.onLog });
      order(cur, typed);
      eq(`${typed} g over ${cur} g: out of range?`, !!alertNamed(OUT), !saves);
      await submit();
      eq(`${typed} g: saved?`, log.calls, saves ? 1 : 0);
      if (saves) eq(`${typed} g: no reason was needed`, prompts, 0);
    }
  });

  // ═══════════════════════════ §6 automatic weight ═════════════════════════
  await section('§6 the automatic weight is never judged; "ใช้ค่าอัตโนมัติ" clears the alert', async () => {
    const log = logger();
    mount({ patient: pt('DW-1000', 1000), onLog: log.onLog });
    order(750);   // below birth weight: the floor doses at 1,000 g, 33 % above today's weight
    eq('dosed at the birth weight', inputFor('TPN calc. weight')?.value, '1000');
    eq('no alert for the floor rule', [alertNamed(FAR), alertNamed(OUT)], [null, null]);
    setField('TPN calc. weight', 1300);
    ok('1,300 typed over the 1,000 g floor (+30 %) is judged against the floor', /1300 g typed, automatic 1000 g \(\+30 %/.test(alertNamed(FAR)?.text || ''), alertNamed(FAR)?.text);
    await clickAsync(button(/ใช้ค่าอัตโนมัติ/));
    eq('back on the automatic weight', inputFor('TPN calc. weight')?.value, '1000');
    eq('…and the alert is gone', alertNamed(FAR), null);
  });

  // ═══════════════════════════ §7 measured weight out of range ═════════════
  await section('§7 a measured 9,000 g with no override stops the same way', async () => {
    const log = logger();
    mount({ patient: pt('DW-3000', 3000), onLog: log.onLog });
    order(9000);
    eq('dosed at the measured weight', inputFor('TPN calc. weight')?.value, '9000');
    eq('out of range', alertNamed(OUT)?.level, 'crit');
    ok('the banner names the weight', /TPN calc\. weight 9000 g อยู่นอกช่วง/.test(text(container.querySelector('.tpn-wt-out-of-range'))),
      text(container.querySelector('.tpn-wt-out-of-range')));
    eq('both save buttons are disabled', [submitBtn()?.disabled, draftBtn()?.disabled], [true, true]);
    await saveDraft();
    eq('not even a draft is saved', log.calls, 0);
  });

  console.log(`\n${fail === 0 ? 'DOSING WEIGHT 2026-10-08: ALL PASS' : `DOSING WEIGHT 2026-10-08: ${fail} FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})();
