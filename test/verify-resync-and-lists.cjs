// Regression checks for the 2026-08-18 code review.
//
//   1. A background re-sync (tab focus / day rollover) must NOT tear the app
//      down to the first-load spinner. It did — App gated its whole tree on
//      `syncState === "loading"`, which every refresh sets — so returning to
//      the tab after a minute unmounted a half-finished Calculator and threw
//      away every typed field.
//   2. The registry's desktop table must read "current weight" through
//      D.lastWeighed like the mobile card does. Taking `weights[last]` blind
//      picks up a length/HC-only row (`w: null`) and reports −100% of birth
//      weight, in critical red, for a patient who is in fact growing.
//   3. The archived registry row must span exactly as many columns as <thead>.
//   4. AdminDashboard's "Active sessions" tile must use the registry's own
//      definition of active (blank status counts), and "Recent log entries"
//      must actually be the most recent by date rather than by whichever
//      patient sorts last.
//   5. computeAlerts must derive an entry's DOL from its date (D.entryDol),
//      not from the stored `dol` snapshot, before indexing a DOL-keyed target.
//
// Section 1 drives the REAL <App/> in jsdom against a stubbed GAS endpoint;
// the rest mount the real registry/admin components or call the real
// computeAlerts.
const fs = require('fs');
const vm = require('vm');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = require('path').join(__dirname, '..') + '/';

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(48)} got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
function ok(name, cond) { eq(name, !!cond, true); }

// ── boot the app modules in a jsdom window ────────────────────────────────
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'https://localhost/', pretendToBeVisual: true });
const { window } = dom;
global.window = window;
global.document = window.document;
global.self = window;
global.HTMLElement = window.HTMLElement;
global.Element = window.Element;
global.Node = window.Node;
global.getComputedStyle = window.getComputedStyle;
global.sessionStorage = window.sessionStorage;
global.localStorage = window.localStorage;
global.Event = window.Event;
global.CustomEvent = window.CustomEvent;
global.MouseEvent = window.MouseEvent;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = clearTimeout;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
global.ReactDOM = ReactDOM; window.ReactDOM = ReactDOM;

// app.jsx reads both of these at module scope, so they must exist before it runs.
window.NEOFEED_CLIENT_ID = 'test-client';
window.NEOFEED_GAS_URL = 'https://example.test/macros/s/AKfycTEST/exec';

const TODAY = (() => {
  // data.js isn't loaded yet; mirror its Bangkok-local date the same way.
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date());
})();

const PATIENT = {
  sessionId: 'AA-BW900', name: 'AA', initials: 'AA', bw: 900, ga: 27.2, sex: 'boys',
  dob: TODAY, admissionDate: TODAY, twinSuffix: '', status: 'Active',
  currentBed: 'NICU 1', diagnosis: 'RDS', weights: [{ dol: 1, w: 900, l: null, hc: null }],
  lengths: [], hcs: [], bedHistory: [], statusDate: '', multiplesCount: 0,
};

// Stubbed GAS: getActivePatients can be made to hang, so the app can be
// observed mid-refresh (which is exactly the window the bug lived in).
let hold = null;
window.fetch = global.fetch = (url, opts) => {
  const body = JSON.parse(opts.body);
  const reply = (data) => ({ json: () => Promise.resolve(data) });
  if (body.action === 'getActivePatients') {
    const data = { patients: [PATIENT], log: {} };
    return hold ? hold.then(() => reply(data)) : Promise.resolve(reply(data));
  }
  return Promise.resolve(reply({ ok: true }));
};
// Skip the login screen — a real session is what the sync path assumes.
window.sessionStorage.setItem('neofeed_session', JSON.stringify(
  { name: 'Dr Test', role: 'doctor', email: 'dr@test.th', token: 'tok-123456789' }));

const load = (f) => vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + f, 'utf8'), {
  presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
  filename: f, configFile: false, babelrc: false,
}).code);

vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
['tweaks-panel.jsx', 'icons.jsx', 'calculator.jsx', 'fenton.jsx', 'registry.jsx', 'log.jsx'].forEach(load);
const appSrc = babel.transformSync(fs.readFileSync(DIR + 'app.jsx', 'utf8'), {
  presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
  filename: 'app.jsx', configFile: false, babelrc: false,
}).code;
const D = window.NEOFEED_DATA;

const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 20)); }); };
const text = () => document.getElementById('root').textContent;
const click = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); await flush(); };

(async () => {
  // ══ 1. A background re-sync must not unmount the app ═════════════════════
  console.log('\n── #1 background re-sync keeps the workspace mounted ──');
  // app.jsx mounts <App/> itself on load (its last line).
  await act(async () => { vm.runInThisContext(appSrc); });
  await flush();
  ok('first load shows the registry', /Patient registry/.test(text()));

  // Open a patient, then the Calculator, and type a weight into it.
  await click(document.querySelector('.patient-mc'));
  await click([...document.querySelectorAll('.rail-item')].find(e => /Calculator/.test(e.textContent)));
  ok('Calculator is open', /TPN \+ Enteral nutrition order/.test(text()));

  const weightInput = () => [...document.querySelectorAll('.field')]
    .find(f => /Current weight/.test(f.textContent))?.querySelector('input');
  const wt = weightInput();
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(wt, '1234');
    wt.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await flush();
  eq('weight typed into the open form', wt.value, '1234');

  // Tab away and back more than a minute later, with the refetch in flight.
  let release; hold = new Promise(r => { release = r; });
  const realNow = Date.now;
  Date.now = () => realNow() + 120000;   // past the 60s resync throttle
  await act(async () => { window.dispatchEvent(new window.Event('focus')); });
  await flush();

  ok('no full-screen "Loading patient data" takeover', !/Loading patient data/.test(text()));
  ok('Calculator still mounted mid-refresh', /TPN \+ Enteral nutrition order/.test(text()));
  eq('typed weight survives the refresh', weightInput()?.value, '1234');

  release(); hold = null;
  await flush(); await flush();
  eq('…and still survives once it lands', weightInput()?.value, '1234');
  Date.now = realNow;

  // ══ 2-3. Registry list ═══════════════════════════════════════════════════
  console.log('\n── #2 current weight skips length/HC-only rows ──');
  // Newest measurement is length-only (w: null) — MeasurementLogger writes
  // exactly this shape so it doesn't fabricate a weight for that day.
  const GROWING = {
    ...PATIENT, sessionId: 'BB-BW900',
    weights: [{ dol: 1, w: 900, l: null, hc: null },
              { dol: 2, w: 1100, l: null, hc: null },
              { dol: 3, w: null, l: 35.5, hc: null }],
  };
  const ARCHIVED = { ...GROWING, sessionId: 'CC-BW900', status: 'Discharged', statusDate: D.todayLocal() };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root2 = ReactDOM.createRoot(host);
  await act(async () => {
    root2.render(React.createElement(window.PatientRegistry, {
      patients: [GROWING, ARCHIVED], activeId: null, log: {},
      onSelect: () => {}, onAdd: () => {}, onEdit: () => {},
    }));
  });
  const row = host.querySelector('.patient-table tbody tr');
  const cells = row.querySelectorAll('td');
  eq('desktop table: Wt now = last WEIGHED value', cells[7].textContent, '1,100 g');
  eq('desktop table: Δ birth is the real gain',    cells[8].textContent, '+200 g(22.2%)');
  const mobile = host.querySelector('.patient-mc .pmc-stats').textContent;
  ok('mobile card agrees with the table', /1,100 g/.test(mobile) && /\+200/.test(mobile));

  console.log('\n── #3 archived row spans the header exactly ──');
  await click([...host.querySelectorAll('.patient-table button')].find(b => /Discharged/.test(b.textContent)));
  const headCols = host.querySelectorAll('.patient-table thead th').length;
  const rows = [...host.querySelectorAll('.patient-table tbody tr')];
  const archSpan = [...rows[rows.length - 1].querySelectorAll('td')]
    .reduce((a, td) => a + (parseInt(td.getAttribute('colspan'), 10) || 1), 0);
  eq('archived row column count === header count', archSpan, headCols);

  // ══ 4. Admin dashboard ═══════════════════════════════════════════════════
  console.log('\n── #4 admin tiles + recent entries ──');
  const BLANK_STATUS = { ...PATIENT, sessionId: 'DD-BW900', status: '' };
  const adminLog = {
    // Two patients; the OLDER entries belong to the patient that sorts last,
    // which is what made a registry-order slice show stale rows as "recent".
    'AA-BW900': [{ ts: '2026-08-17', dol: 1, kcal: 100, pro: 3, weight: 950, route: 'TPN central', entryId: 'e-new' }],
    'DD-BW900': [{ ts: '2026-01-02', dol: 1, kcal: 50, pro: 1, weight: 900, route: 'TPN central', entryId: 'e-old' }],
  };
  await act(async () => {
    root2.render(React.createElement(global.AdminDashboard, {
      patients: [PATIENT, BLANK_STATUS], log: adminLog,
    }));
  });
  const tiles = [...host.querySelectorAll('.admin-stat-tiles .card')].map(c => c.textContent);
  ok('blank status counts as Active (registry parity)', /Active sessions2/.test(tiles[0]));
  const firstLogRow = host.querySelector('tbody tr').textContent;
  ok('Recent log entries leads with the newest date', /AA-BW900/.test(firstLogRow));

  // ══ 5. computeAlerts uses the row's date, not the stored dol ═════════════
  console.log('\n── #5 alert targets keyed on the re-derived DOL ──');
  // Admitted 10 days ago; the row is stamped today but carries the stale
  // `dol: 1` a pre-admission-date save froze into it. On DOL 1 the parenteral
  // protein floor is 1.5 g/kg/d (2.1 passes); on DOL 11 it is 2.5 (2.1 fails).
  const admit = D.addDaysToDateStr(D.todayLocal(), -10);
  const staleDolPatient = { ...PATIENT, sessionId: 'EE-BW900', admissionDate: admit,
    weights: [{ dol: 1, w: 900, l: null, hc: null }] };
  const staleEntry = { ts: D.todayLocal(), dol: 1, pro: 2.1, kcal: 130, gir: 6, enVolPerKg: 0 };
  const alerts = global.computeAlerts(staleDolPatient, [staleEntry]);
  const proteinAlert = alerts.find(a => a.id === 'protein-low');
  ok('protein-low fires against the true DOL', !!proteinAlert);
  eq('and is filed under the re-derived DOL', proteinAlert && proteinAlert.dol, 11);

  console.log(`\nRESYNC + LISTS: ${fail === 0 ? 'ALL PASS' : fail + ' FAILED'} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
