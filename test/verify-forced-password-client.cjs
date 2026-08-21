// The client half of the 2026-08-21 mustChangePassword fix.
//
// `test/verify-must-change-password.cjs` pins the server gate: while Staff
// col G is set, doPost refuses everything except `changePassword`. This pins
// what the CLIENT does when it meets that refusal.
//
// In the normal flow it never does — `App` returns <ChangePasswordModal forced>
// before a single request goes out. The case that matters is col G being
// flagged **mid-session**: this browser is already logged in and still holds
// `mustChangePassword: false` from its login response. Without a branch for it,
// `gasPost` falls through to the generic error handler and toasts
// "บันทึกไม่สำเร็จ: PasswordChangeRequired" — an untranslated error code, on a
// loop, at a user with no route to the change-password screen. The server would
// be secure and the app would look broken.
//
// Section 1 drives the REAL <App/> in jsdom against a stubbed GAS endpoint, the
// same technique as verify-resync-and-lists.cjs.
//
// Needs the dev-only deps (see test/README.md):
//   npm install --no-save react@18 react-dom@18 @babel/core@7 @babel/preset-react@7 jsdom
const fs = require('fs');
const vm = require('vm');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = require('path').join(__dirname, '..') + '/';

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(50)} got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
function ok(name, cond) { eq(name, !!cond, true); }

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

window.NEOFEED_CLIENT_ID = 'test-client';
window.NEOFEED_GAS_URL = 'https://example.test/macros/s/AKfycTEST/exec';

const TODAY = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date());
const PATIENT = {
  sessionId: 'AA-BW900', name: 'AA', initials: 'AA', bw: 900, ga: 27.2, sex: 'boys',
  dob: TODAY, admissionDate: TODAY, twinSuffix: '', status: 'Active',
  currentBed: 'NICU 1', diagnosis: 'RDS', weights: [{ dol: 1, w: 900, l: null, hc: null }],
  lengths: [], hcs: [], bedHistory: [], statusDate: '', multiplesCount: 0,
};

// The server flips to refusing once `flagged` goes true — exactly what an
// admin setting Staff col G looks like to an already-open browser.
let flagged = false;
const seen = [];
window.fetch = global.fetch = (url, opts) => {
  const body = JSON.parse(opts.body);
  seen.push(body.action);
  const reply = (data) => ({ json: () => Promise.resolve(data) });
  if (flagged && body.action !== 'changePassword') {
    return Promise.resolve(reply({ error: 'PasswordChangeRequired', mustChangePassword: true }));
  }
  if (body.action === 'getActivePatients') return Promise.resolve(reply({ patients: [PATIENT], log: {} }));
  if (body.action === 'changePassword') return Promise.resolve(reply({ ok: true, token: 'tok-rotated-99999' }));
  return Promise.resolve(reply({ ok: true }));
};

// A live session that believes it does NOT need to change its password —
// which is the whole point: the client's copy of the flag is stale.
window.sessionStorage.setItem('neofeed_session', JSON.stringify(
  { name: 'Dr Test', role: 'doctor', email: 'dr@test.th', token: 'tok-123456789', mustChangePassword: false }));

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

const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 30)); }); };
const text = () => document.getElementById('root').textContent;

(async () => {
  console.log('\n1 · A normal session is unaffected while col G is clear');
  await act(async () => { vm.runInThisContext(appSrc); });
  await flush();
  ok('the app loads to the registry', /Patient registry/.test(text()));
  ok('no forced password screen', !/ตั้งรหัสผ่านใหม่|เปลี่ยนรหัสผ่าน/.test(text()));

  console.log('\n2 · 🔴 col G flagged MID-SESSION → the forced modal, not an error toast');
  flagged = true;
  seen.length = 0;
  // Drive the header's "Sync now from GAS" button rather than a focus event:
  // the focus listener is throttled to one call a minute (RESYNC_AFTER_MS in
  // app.jsx) and the app has only just loaded, so a synthetic focus is
  // swallowed and nothing would be sent. The button calls syncFromGAS directly.
  const syncBtn = [...document.querySelectorAll('.icon-btn')]
    .find(b => b.getAttribute('title') === 'Sync now from GAS');
  ok('the manual sync control exists', !!syncBtn);
  await act(async () => { syncBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await flush();
  await flush();

  ok('the server was actually called', seen.length > 0);
  ok('the change-password screen is showing',
     /ตั้งรหัสผ่านใหม่|เปลี่ยนรหัสผ่าน|รหัสผ่านใหม่/.test(text()));
  ok('the raw error code is NOT shown to the user',
     text().indexOf('PasswordChangeRequired') === -1);
  ok('the registry is no longer rendered', !/Patient registry/.test(text()));

  console.log('\n3 · The flag is persisted, so a reload does not bounce back');
  const stored = JSON.parse(window.sessionStorage.getItem('neofeed_session') || '{}');
  eq('sessionStorage carries mustChangePassword', stored.mustChangePassword, true);
  eq('the session itself is kept — this is not a logout', stored.token, 'tok-123456789');

  console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
