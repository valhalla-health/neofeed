// verify-weight-chip-and-bw-velocity.cjs — Pp's two requests of 2026-09-24
// (CHANGELOG.md 2026-09-24 (10)):
//
//   §1  "ให้ weight มาอยู่ก่อนหน้า energy". The Dashboard trend graph's Weight
//       chip was the LAST of nine, so on a phone it was reached only by
//       scrolling the chip row to its far end. It now leads the row, and
//       Energy stays the metric the graph opens on.
//   §2  "ถ้าน้ำหนักยังไม่ gain BW ตรง growth velocity ให้ขึ้นว่า Weight below
//       birth weight แทน". The reported screen: two order weights of 1,200 g,
//       DOL 8 and DOL 10, on an infant born at 1,200 g, read "0 g/kg/d" in
//       critical red. The regain of birth weight was the first weight >= birth
//       weight, and grading started right there. Now velocity is graded only
//       once a weight rises ABOVE birth weight. It is still measured from the
//       regain, so a week flat at birth weight still counts against it. §2 is
//       data.js growthVelocity itself, §3 the Growth chart's readout and §4
//       the Alerts page, which reads the same function.
//
// ── NEGATIVE CONTROL ───────────────────────────────────────────────────────
// Run against the commit before the change; §1–§4 must each go red:
//   d=$(mktemp -d)
//   git -c core.autocrlf=false archive --format=tar 3bb6288 | tar -x -C "$d"
//   cp test/verify-weight-chip-and-bw-velocity.cjs "$d/test/"
//   cp -r node_modules "$d/node_modules"
//   ( cd "$d" && TZ=Asia/Bangkok node test/verify-weight-chip-and-bw-velocity.cjs )
// Expected there: 24 FAILED (13 passed). §1 finds Energy first and Weight
// last, §2 finds the reported shape graded "critical" at 0 g/kg/d, §3 finds
// the reported screen verbatim ("0g/kg/dTarget ≥ 15 g/kg/d · 2 วัน") where the
// words belong, and §4 finds a critical "Growth velocity critically low" alert.
// The controls (a real gain above birth weight, a drop after a real regain)
// pass on both.
//
// Same dev-only dependencies as the other jsdom harnesses (test/README.md).
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';

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
window.NEOFEED_GAS_URL = '';           // GAS off: no network from this harness

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
const probe = () => document.getElementById('probe');

// ── Fixtures: shapes only, no real infant ─────────────────────────────────
const TODAY = D.todayLocal();
const ago = (days) => D.addDaysToDateStr(TODAY, -days);
// An inborn infant on DOL `dol` today, with its birth measurement (the row
// NewPatientModal seeds from birth weight) plus the given measured weights.
const infant = (bw, dol, weights) => ({
  sessionId: `T-BW${bw}`, name: 'ทด', initials: 'ทด', bw, ga: 30.0, sex: 'boys',
  dob: ago(dol - 1), admissionDate: ago(dol - 1), status: 'Active', currentBed: 'NICU 3',
  weights: [{ dol: 1, w: bw }, ...weights], lengths: [], hcs: [],
});
// A submitted order on DOL `dol`, carrying only its weight.
const order = (p, dol, weight) => ({ ts: D.addDaysToDateStr(p.dob, dol - 1), dol, weight, status: 'submitted',
  entryId: `e${dol}`, enVolPerKg: 0 });

// The reported screen: DOL 10, born 1,200 g, order weights 1,200 g on DOL 8
// and DOL 10 (the growth chart's "Latest measurement … จากใบสั่ง").
const reported = infant(1200, 10, []);
const reportedLog = [order(reported, 8, 1200), order(reported, 10, 1200)];

// The Growth chart side panel's "Growth velocity" block, as text.
const velocityText = () => {
  const h = [...probe().querySelectorAll('.sub-h')].find(e => /growth velocity/i.test(e.textContent));
  return h ? h.parentElement.textContent.replace(/^growth velocity/i, '').trim() : null;
};

(async () => {

  // ══════════════════════════════════════════════════════════════════════
  await section('§1 Trend graph: the Weight chip comes before Energy', async () => {
    const p = infant(1000, 12, []);
    const log = [order(p, 10, 1000), order(p, 12, 1040)].map(e => ({ ...e, kcal: 90, pro: 3, gir: 8, fluid: 140 }));
    await render(React.createElement(window.TrendGraph, { entries: log, patient: p }));
    const chips = [...probe().querySelectorAll('.trend-chip')].map(b => b.textContent.trim());
    eq('there are still nine metric chips', chips.length, 9);
    eq('the first chip is Weight', chips[0], 'Weight');
    eq('…and Energy follows it', chips[1], 'Energy');
    eq('the rest keep their order', chips.slice(2),
       ['Protein', 'GIR', 'Fluid', 'Sodium', 'Potassium', 'Calcium', 'Phosphorus']);
    const latest = probe().querySelector('.trend-latest');
    ok('the graph still opens on Energy (kcal/kg/d), not on Weight',
       !!latest && /kcal\/kg\/d/.test(latest.textContent), latest && latest.textContent);
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§2 growthVelocity grades only once the weight is ABOVE birth weight', async () => {
    const gv = D.growthVelocity(reported, reportedLog);
    eq('the reported shape (1,200 g = birth weight, DOL 8 and 10) is not graded', gv.status, 'physiologicalLoss');
    eq('…no velocity figure', gv.vel, null);
    eq('…at birth weight, not below it', gv.atBirthWeight, true);
    eq('…and the birth weight rides along for the readout', gv.bw, 1200);
    ok('…with a reason that says it has not gone up', /เท่ากับน้ำหนักแรกเกิด/.test(gv.reason || ''), gv.reason);

    const below = infant(1300, 10, []);
    const gb = D.growthVelocity(below, [order(below, 8, 1200), order(below, 10, 1200)]);
    eq('below birth weight on DOL 10 is not graded', gb.status, 'physiologicalLoss');
    eq('…and is flagged below, not at', gb.atBirthWeight, false);

    const touched = infant(1000, 10, [{ dol: 5, w: 950 }, { dol: 8, w: 1000 }, { dol: 10, w: 990 }]);
    const gt = D.growthVelocity(touched);
    eq('touched birth weight on DOL 8, then 990 g: not graded (was critical)', gt.status, 'physiologicalLoss');
    eq('…below birth weight', gt.atBirthWeight, false);

    const flat = infant(1000, 20, [{ dol: 5, w: 900 }, { dol: 13, w: 1000 }, { dol: 20, w: 1000 }]);
    const gf = D.growthVelocity(flat);
    eq('still exactly at birth weight on DOL 20: past DOL 14 and not above it', gf.status, 'notRegained');
    eq('…at birth weight', gf.atBirthWeight, true);

    // Controls: nothing changes once a weight is really above birth weight.
    const crossed = infant(1000, 10, [{ dol: 8, w: 1000 }, { dol: 10, w: 1020 }]);
    const gc = D.growthVelocity(crossed);
    ok('the first weight above birth weight is graded', gc.vel != null && ['ok', 'low', 'critical'].includes(gc.status), gc);
    eq('…measured from the regain (DOL 8), not from the crossing', gc.from && gc.from.dol, 8);

    const above = infant(1150, 10, []);
    const ga = D.growthVelocity(above, [order(above, 8, 1200), order(above, 10, 1200)]);
    eq('above birth weight and flat for two days is still graded', ga.status, 'critical');
    eq('…at 0 g/kg/d', ga.vel, 0);

    const dropped = infant(1000, 20, [{ dol: 10, w: 1050 }, { dol: 15, w: 1100 }, { dol: 20, w: 990 }]);
    const gd = D.growthVelocity(dropped);
    ok('a fall below birth weight AFTER a real regain still grades (and alarms)',
       gd.status === 'critical' && gd.vel < 0, { status: gd.status, vel: gd.vel });

    const outborn = { ga: 29.0, bw: 1800, weights: [{ dol: 20, w: 2000 }, { dol: 27, w: 2200 }] };
    ok('a history that starts above birth weight is graded (F5 kept)', D.growthVelocity(outborn, null).vel != null);
    eq('the DOL-14 cut-off is exported for the readout', D.REGAIN_EXPECTED_BY_DOL, 14);
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§3 Growth chart: the readout says it in words, not as g/kg/d', async () => {
    await render(React.createElement(window.FentonChart, { patient: reported, entries: reportedLog, currentDol: 10 }));
    let t = velocityText();
    ok('the reported screen: "Weight at birth weight"', /Weight at birth weight/.test(t || ''), t);
    ok('…and no g/kg/d figure', !/g\/kg\/d/.test(t || ''), t);
    ok('…with the birth weight beside it', /BW\s*1,200\s*g/.test(t || ''), t);

    const below = infant(1300, 10, []);
    await render(React.createElement(window.FentonChart, { patient: below, entries: [order(below, 8, 1200), order(below, 10, 1200)], currentDol: 10 }));
    t = velocityText();
    ok('below birth weight: "Weight below birth weight"', /Weight below birth weight/.test(t || ''), t);
    ok('…the per-cent below birth weight (-7.7%)', /-7\.7%/.test(t || ''), t);
    ok('…no g/kg/d figure', !/g\/kg\/d/.test(t || ''), t);
    ok('…and no DOL-14 caution yet on DOL 10', !/by DOL 14/.test(t || ''), t);

    const late = infant(1000, 20, [{ dol: 5, w: 900 }, { dol: 20, w: 950 }]);
    await render(React.createElement(window.FentonChart, { patient: late, entries: [], currentDol: 20 }));
    t = velocityText();
    ok('past DOL 14 and still below: says it was not regained by DOL 14',
       /Weight below birth weight/.test(t || '') && /not regained by DOL 14/.test(t || ''), t);

    const growing = infant(1000, 21, [{ dol: 8, w: 1000 }, { dol: 14, w: 1120 }, { dol: 21, w: 1260 }]);
    await render(React.createElement(window.FentonChart, { patient: growing, entries: [], currentDol: 21 }));
    t = velocityText();
    ok('control: above birth weight the velocity figure is back', /g\/kg\/d/.test(t || '') && !/birth weight/.test(t || ''), t);
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§4 Alerts page reads the same rule', async () => {
    const alerts = global.computeAlerts(reported, reportedLog);
    ok('the reported shape raises no "Growth velocity critically low"',
       !alerts.find(a => a.id === 'growth-velocity'), alerts.map(a => a.title));
    eq('…an informational "not yet assessable" line instead',
       alerts.find(a => a.id === 'growth-physiologicalLoss')?.level, 'info');

    const flat = infant(1000, 20, [{ dol: 5, w: 900 }, { dol: 13, w: 1000 }, { dol: 20, w: 1000 }]);
    const af = global.computeAlerts(flat, []).find(a => a.id === 'growth-regain');
    eq('exactly at birth weight past DOL 14 is a caution', af && af.level, 'warn');
    eq('…titled for what it is', af && af.title, 'Weight not above birth weight');

    const late = infant(1000, 20, [{ dol: 5, w: 900 }, { dol: 20, w: 950 }]);
    const al = global.computeAlerts(late, []).find(a => a.id === 'growth-regain');
    eq('below birth weight past DOL 14 keeps its title', al && al.title, 'Birth weight not regained');
  });

  console.log(`\nWEIGHT CHIP + BW VELOCITY 2026-09-24: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})();
