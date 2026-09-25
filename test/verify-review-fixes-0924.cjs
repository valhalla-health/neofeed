// verify-review-fixes-0924.cjs — the 2026-09-24 pre-meeting review's bug fixes.
// Every section below FAILS against 24460a5 (the state before these fixes) and
// passes after them.
//
//   §1  F1 (BLOCKER) — EditPatientModal re-derived the date of birth from
//       weights[0].dol and persisted it. After a ward records an outborn
//       infant's birth measurement (which sorts to weights[0], DOL 1), any
//       later edit — even a diagnosis fix or the discharge — stamped a wrong
//       dob onto the record, shifting DOL/PMA and every DOL-indexed target.
//       The field now seeds from the stored anchor (dob + admissionDate) and
//       weights[0].dol is written only when the field was actually changed.
//   §2  Sex silently defaulted to Male at registration (NewPatientModal seeded
//       "boys" and did not require it), filing a quickly-registered girl under
//       the boys' Fenton curves. It is now blank and required, like edit.
//   §3  F5 — growthVelocity could never treat the first series point as the
//       regain of birth weight, so a history that begins already at/above
//       birth weight (outborn admitted late; order-only history) yielded no
//       velocity at all. It now measures from the start when the series never
//       dipped below birth weight.
//   §4  F3 — the growth-chart velocity read-out graded ≥15/≥10 itself and,
//       fed unclamped points, showed a red "critically low" past 42 wk PMA
//       where the Alerts page (data.js growthVelocity) declines to judge. It
//       now defers to that one source.
//
// ── NEGATIVE CONTROL ───────────────────────────────────────────────────────
// Run against the commit before the fixes; every section must go red:
//   d=$(mktemp -d)
//   git -c core.autocrlf=false archive --format=tar 24460a5 | tar -x -C "$d"
//   cp test/verify-review-fixes-0924.cjs "$d/test/"
//   cp -r node_modules "$d/node_modules"
//   ( cd "$d" && TZ=Asia/Bangkok node test/verify-review-fixes-0924.cjs )
// There §1 finds the DOL field seeded to 1 and the saved dob = admit date, §2
// finds the sex select opening on "boys" with Register enabled, §3 finds
// insufficientData, §4 finds a "g/kg/d" number where the reason text belongs.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';

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
  try { await fn(); } catch (e) { ok(`(section ran to the end) ${e.message}`, false, e.stack.split('\n').slice(0, 4)); }
}

// ── jsdom + the real modules ──────────────────────────────────────────────
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><div id="probe"></div></body></html>',
  { url: 'https://localhost/', pretendToBeVisual: true });
const { window } = dom;
Object.assign(global, {
  window, document: window.document, self: window,
  HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
  getComputedStyle: window.getComputedStyle,
  sessionStorage: window.sessionStorage, localStorage: window.localStorage,
  Event: window.Event, CustomEvent: window.CustomEvent, MouseEvent: window.MouseEvent,
  requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: clearTimeout,
  IS_REACT_ACT_ENVIRONMENT: true,
});
// FentonChart observes its container; jsdom has no ResizeObserver.
global.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
global.showToast = () => {};
window.print = () => {};
window.confirm = () => true;
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
global.ReactDOM = ReactDOM; window.ReactDOM = ReactDOM;
window.NEOFEED_CLIENT_ID = 'test-client';
window.NEOFEED_GAS_URL = '';

const load = (f) => vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + f, 'utf8'), {
  presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
  filename: f, configFile: false, babelrc: false,
}).code);
vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
['icons.jsx', 'calculator.jsx', 'fenton.jsx', 'registry.jsx', 'log.jsx'].forEach(load);
load('app.jsx');
const D = window.NEOFEED_DATA;

const root = ReactDOM.createRoot(document.getElementById('probe'));
const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 20)); }); };
const render = async (el) => { await act(async () => { root.render(el); }); await flush(); };
const click = async (el) => {
  await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await flush();
};
const fieldInput = (label, scope) => [...(scope || document.getElementById('probe')).querySelectorAll('.field')]
  .find(f => f.querySelector('label') && f.querySelector('label').textContent.includes(label))
  ?.querySelector('input, select');
const btn = (re) => [...document.getElementById('probe').querySelectorAll('button')].find(b => re.test(b.textContent));

(async () => {

  // ══════════════════════════════════════════════════════════════════════
  await section('§1 F1 — editing an outborn record preserves its date of birth', async () => {
    // Outborn: born 2026-09-15, admitted 2026-09-19 at DOL 5. The ward has
    // recorded the referring hospital's birth weight, so the DOL-1 row is now
    // weights[0].
    const patient = {
      sessionId: 'OB-BW1000', name: 'อบ', initials: 'อบ', bw: 1000, ga: 29.0, sex: 'boys',
      dob: '2026-09-15', admissionDate: '2026-09-19', twinSuffix: '', status: 'Active',
      currentBed: 'NICU 4', diagnosis: 'RDS',
      weights: [{ dol: 1, w: 1050 }, { dol: 5, w: 1000 }], lengths: [], hcs: [], bedHistory: [],
      statusDate: '', multiplesCount: 0,
    };
    let submitted = null;
    await render(React.createElement(window.EditPatientModal, {
      patient, patients: [patient], onClose: () => {}, onSubmit: (p) => { submitted = p; return { ok: true }; },
    }));
    const dolField = fieldInput('DOL แรกรับ');
    eq('the DOL-แรกรับ field seeds from the anchor (admission DOL 5), not weights[0].dol (1)',
       dolField && dolField.value, '5');

    const save = btn(/Save changes|บันทึก/);
    ok('Save is enabled (record is valid)', save && !save.disabled, save && save.textContent);
    await click(save);
    ok('an incidental edit submitted', !!submitted);
    eq('…and the saved dob is unchanged (not re-derived to the admit date)',
       submitted && submitted.dob, '2026-09-15');
    eq('…and the birth measurement keeps its DOL 1', submitted && submitted.weights[0].dol, 1);
    eq('…so DOL on 2026-09-23 is still 9, not 5',
       submitted && D.dolAtDate(submitted, '2026-09-23'), 9);
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§2 Sex must be chosen at registration (no Male default)', async () => {
    const NewPatientModal = global.NewPatientModal || window.NewPatientModal;
    ok('NewPatientModal is loaded', typeof NewPatientModal === 'function');
    await render(React.createElement(NewPatientModal, {
      patients: [], onClose: () => {}, onSubmit: () => ({ ok: true }),
    }));
    const set = async (el, v) => { if (!el) return;
      const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
      await act(async () => {
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(v));
        el.dispatchEvent(new window.Event('input', { bubbles: true }));
        el.dispatchEvent(new window.Event('change', { bubbles: true }));
      }); await flush();
    };
    const sexSel = fieldInput('Sex');
    eq('the sex select opens with no default (blank), not "boys"', sexSel && sexSel.value, '');

    // Fill everything EXCEPT sex, then check Register is still blocked.
    await set(fieldInput('ชื่อ'), 'อบ');
    await set(fieldInput('นามสกุล'), 'ใจ');
    await set(fieldInput('Birth weight'), 1000);
    await set(fieldInput('GA'), '29');
    const reg = btn(/Register|ลงทะเบียน/);
    ok('Register stays disabled while sex is unchosen', reg && reg.disabled, reg && reg.textContent);
    await set(sexSel, 'girls');
    ok('…and becomes enabled once sex is chosen', reg && !reg.disabled, reg && reg.textContent);
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§3 F5 — velocity is graded for a history that never dipped below birth weight', async () => {
    // Outborn admitted already above birth weight; two points, both ≥ bw.
    const p = { ga: 29.0, bw: 1800, weights: [{ dol: 20, w: 2000 }, { dol: 27, w: 2200 }] };
    const gv = D.growthVelocity(p, null);
    ok('a graded velocity is returned, not insufficientData', gv.vel != null,
       JSON.stringify({ status: gv.status, vel: gv.vel }));
    ok('…and the status is a real grade', ['ok', 'low', 'critical'].includes(gv.status), gv.status);
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§4 F3 — the growth-chart velocity read-out defers to the one grader past term', async () => {
    // Term-plus infant: ga 40, a measurement well past 42 wk PMA.
    const patient = { sessionId: 'TT-BW3000', name: 'ทท', bw: 3000, ga: 40.0, sex: 'boys',
      dob: '2026-08-01', admissionDate: '2026-08-01',
      weights: [{ dol: 1, w: 3000 }, { dol: 40, w: 3600 }], lengths: [], hcs: [] };
    // sanity: data.js declines to grade past the reference
    eq('data.js growthVelocity is "beyondReference" past 42 wk', D.growthVelocity(patient, []).status, 'beyondReference');
    await render(React.createElement(window.FentonChart, { patient, entries: [], currentDol: 40 }));
    const t = document.getElementById('probe').textContent;
    ok('the velocity block shows the "beyond reference" reason, not a graded number',
       /เกินช่วงอ้างอิง|ไม่ตัดสิน/.test(t), t.slice(0, 120));
  });

  console.log(`\nREVIEW FIXES 2026-09-24: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})();
