// Shared jsdom boot for the 2026-09-17 shell-review harnesses
// (verify-review-0917-shell.cjs, -sync.cjs, -session.cjs). Not a harness
// itself — CI only runs test/verify-*.cjs.
//
// Two things every one of those harnesses needs and no single existing one
// provides together:
//   1. a STATEFUL fake Apps Script — it remembers what was written, so a test
//      can ask "did the row land?" rather than only "was a request sent?", and
//      a per-action hook can hold, fail, time out or refuse any one request;
//   2. scenario isolation. app.jsx and its modules declare top-level `const`s
//      and mount <AppRoot/> the moment they run, so they can be loaded once per
//      process. `runScenarios` re-runs the calling harness once per scenario in
//      a child process and adds up the results.
//
// Dev-only deps as in test/README.md (react@18 react-dom@18 @babel/core
// @babel/preset-react jsdom).
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { spawnSync } = require('child_process');

const DIR = path.join(__dirname, '..') + '/';
const GAS_URL = 'https://example.test/macros/s/AKfycTEST/exec';

// ── assertions ──────────────────────────────────────────────────────────────
function makeAsserts() {
  const r = { pass: 0, fail: 0 };
  r.eq = (name, got, want) => {
    const good = JSON.stringify(got) === JSON.stringify(want);
    console.log(`  ${good ? 'PASS' : 'FAIL'}  ${name.padEnd(64)} got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
    good ? r.pass++ : r.fail++;
  };
  r.ok = (name, cond) => r.eq(name, !!cond, true);
  return r;
}

// ── scenario runner ─────────────────────────────────────────────────────────
// `scenarios` is an ordered { name: async (asserts) => {} } map. With no
// argument the harness spawns itself once per scenario; with one, it runs just
// that scenario and prints a machine-readable tally as its last line.
function runScenarios(harnessFile, title, scenarios) {
  const which = process.argv[2];
  if (which) {
    const A = makeAsserts();
    const fn = scenarios[which];
    if (!fn) { console.error('unknown scenario ' + which); process.exit(2); }
    Promise.resolve()
      .then(() => fn(A))
      .catch((e) => { console.log('  FAIL  scenario threw: ' + ((e && e.stack) || e).toString().split('\n').slice(0, 4).join(' | ')); A.fail++; })
      .then(() => {
        console.log(`__TALLY__ ${JSON.stringify({ pass: A.pass, fail: A.fail })}`);
        process.exit(A.fail === 0 ? 0 : 1);
      });
    return;
  }
  let pass = 0, fail = 0;
  for (const name of Object.keys(scenarios)) {
    const res = spawnSync(process.execPath, [harnessFile, name], {
      encoding: 'utf8', env: process.env, timeout: 180000, maxBuffer: 16 * 1024 * 1024,
    });
    const out = (res.stdout || '');
    const lines = out.split('\n');
    const tallyLine = lines.find(l => l.startsWith('__TALLY__ '));
    lines.filter(l => !l.startsWith('__TALLY__ ')).forEach(l => { if (l.trim()) console.log(l); });
    if (tallyLine) {
      const t = JSON.parse(tallyLine.slice(10));
      pass += t.pass; fail += t.fail;
    } else {
      console.log(`  FAIL  scenario "${name}" did not finish (exit ${res.status}${res.signal ? ', ' + res.signal : ''})`);
      const err = (res.stderr || '').split('\n').filter(Boolean).slice(0, 6).join('\n        ');
      if (err) console.log('        ' + err);
      fail++;
    }
  }
  console.log(`\n${title}: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
}

// ── fixtures ────────────────────────────────────────────────────────────────
const TODAY = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mkPatient = (over = {}) => ({
  sessionId: 'AA-BW900', name: 'AA', initials: 'AA', bw: 900, ga: 27.2, sex: 'boys',
  dob: addDays(TODAY, -5), admissionDate: addDays(TODAY, -5), twinSuffix: '', status: 'Active',
  currentBed: 'NICU 1', diagnosis: 'RDS', weights: [{ dol: 1, w: 900, l: null, hc: null }],
  lengths: [], hcs: [], bedHistory: [], statusDate: '', multiplesCount: 0, ...over,
});
const DOCTOR = { name: 'Dr Test', role: 'doctor', email: 'dr@test.th', token: 'tok-doctor-123456', authMethod: 'password' };

// ── the app, booted ─────────────────────────────────────────────────────────
// options:
//   session        object stored as neofeed_session before mount (null = none)
//   patients, log  the fake server's initial sheet
//   storageBlocked every sessionStorage/localStorage access throws
//   extraHead      markup for <head> (e.g. the gsi/client script tag)
function boot(opts = {}) {
  const babel = require('@babel/core');
  const { JSDOM } = require('jsdom');
  const {
    session = DOCTOR, patients = [mkPatient()], log = {}, storageBlocked = false,
    extraHead = '',
  } = opts;

  const dom = new JSDOM(`<!doctype html><html><head>${extraHead}</head><body><div id="root"></div></body></html>`,
    { url: 'https://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  global.window = window; global.document = window.document; global.self = window;
  global.HTMLElement = window.HTMLElement; global.Element = window.Element; global.Node = window.Node;
  global.getComputedStyle = window.getComputedStyle;
  if (storageBlocked) {
    const thrower = { get() { throw new window.DOMException('The operation is insecure.', 'SecurityError'); }, configurable: true };
    Object.defineProperty(globalThis, 'sessionStorage', thrower);
    Object.defineProperty(globalThis, 'localStorage', thrower);
  } else {
    global.sessionStorage = window.sessionStorage; global.localStorage = window.localStorage;
  }
  global.Event = window.Event; global.CustomEvent = window.CustomEvent; global.MouseEvent = window.MouseEvent;
  global.KeyboardEvent = window.KeyboardEvent;
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.cancelAnimationFrame = clearTimeout;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  // A bare `navigator` must be the window's, or `navigator.onLine` reads
  // Node's (undefined) — see verify-sync-gate-and-poll.cjs.
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true });
  const React = require('react');
  const ReactDOM = require('react-dom/client');
  const { act } = React;
  global.React = React; window.React = React; global.ReactDOM = ReactDOM; window.ReactDOM = ReactDOM;
  window.NEOFEED_CLIENT_ID = 'test-client';
  window.NEOFEED_GAS_URL = GAS_URL;
  window.prompt = () => 'harness reason';
  window.confirm = () => true;
  window.alert = () => {};

  // Controllable clock. Both Date.now() (the idle clock, the poll gate, the
  // backoff) and a bare `new Date()` (lastSync) move together — the app
  // compares one against the other, so advancing only one of them would
  // invent ages nothing in a browser could produce.
  const RealDate = Date;
  const realNow = RealDate.now.bind(RealDate);
  let offset = 0;
  class ClockDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(realNow() + offset); else super(...args); }
    static now() { return realNow() + offset; }
  }
  global.Date = ClockDate;
  const clock = { advance: (ms) => { offset += ms; }, now: () => Date.now() };

  // Long intervals are captured so minutes of ward time can be fired at will.
  const intervals = [];
  const realSetInterval = global.setInterval, realClearInterval = global.clearInterval;
  window.setInterval = global.setInterval = (fn, ms, ...rest) => {
    if (ms >= 1000) { const h = { fn, ms, __captured: true, live: true }; intervals.push(h); return h; }
    return realSetInterval(fn, ms, ...rest);
  };
  window.clearInterval = global.clearInterval = (h) => {
    if (h && h.__captured) { h.live = false; return; }
    return realClearInterval(h);
  };
  const fireIntervals = (ms) => intervals.filter(i => i.live && (ms == null || i.ms === ms)).forEach(i => i.fn());
  // Request deadlines are 45 s. `timeouts.shrinkNext(n)` makes the next n
  // timers of ≥ 10 s fire after 30 ms — so ONE request can time out while
  // the sync it triggers keeps its real deadline.
  const timeouts = { shrink: 0, shrinkNext(n = 1) { this.shrink += n; } };
  {
    const realSetTimeout = global.setTimeout;
    global.setTimeout = window.setTimeout = (fn, ms, ...rest) => {
      if (ms >= 10000 && timeouts.shrink > 0) { timeouts.shrink--; return realSetTimeout(fn, 30, ...rest); }
      return realSetTimeout(fn, ms, ...rest);
    };
  }

  // ── stateful fake GAS ─────────────────────────────────────────
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const server = {
    patients: clone(patients), log: clone(log), calls: [], holds: [], holdSyncs: false,
    // server.hooks[action] = (body, server) => undefined (default handling)
    //   | { reply } | { html: true } | { network: true } | { hang: true }
    //   | { hold: Promise, respond?: () => reply } (after the hold: respond(), or default handling)
    //   | { after: fn } (default handling, then fn(reply))
    hooks: {},
    loginReply: null,
  };
  let seq = 0;
  const reply = (data) => ({ json: () => Promise.resolve(clone(data)) });
  const htmlReply = () => ({ json: () => Promise.reject(new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON")) });
  function defaultHandle(body) {
    const a = body.action;
    if (a === 'login') return server.loginReply || { status: 'ok', name: 'Nurse N', role: 'nurse', email: 'n@test.th', token: 'tok-nurse-abcdefg', authMethod: 'password' };
    if (a === 'logout') return { ok: true };
    if (a === 'getActivePatients') {
      const ps = server.patients.filter(p => body.includeArchived || !p.__archiveOnly);
      return { patients: ps.map(p => { const { __archiveOnly, ...rest } = p; return rest; }), log: server.log };
    }
    if (a === 'logDailyNutrition') {
      const rows = server.log[body.sessionId] || (server.log[body.sessionId] = []);
      const dup = rows.find(r => r.ts === body.entry.ts);
      if (dup) return { error: `มีบันทึกของผู้ป่วยรายนี้ในวันที่ ${body.entry.ts} แล้ว — กรุณาเปิดรายการเดิมเพื่อแก้ไข`, code: 'DuplicateDate', entryId: dup.entryId };
      const entryId = 'srv-e' + (++seq), lastModified = new Date(realNow()).toISOString();
      rows.push({ ...body.entry, entryId, lastModified });
      return { ok: true, entryId, lastModified };
    }
    if (a === 'updateDailyNutrition') {
      const rows = server.log[body.sessionId] || [];
      const r = rows.find(x => x.entryId === body.entryId);
      if (!r) return { error: 'not found' };
      const lastModified = new Date(realNow() + (++seq)).toISOString();
      Object.assign(r, body.entry, { lastModified });
      return { ok: true, lastModified };
    }
    if (a === 'registerPatient') {
      const i = server.patients.findIndex(p => p.sessionId === body.patient.sessionId);
      if (i >= 0 && body.isNew === true) return { error: `ID นี้ (${body.patient.sessionId}) ลงทะเบียนไว้แล้ว` };
      if (i >= 0) server.patients[i] = clone(body.patient); else server.patients.push(clone(body.patient));
      return { ok: true };
    }
    if (a === 'updateWeights') {
      const p = server.patients.find(x => x.sessionId === body.sessionId);
      if (!p) return { error: 'ไม่พบ session นี้ในระบบ — อาจถูกลบไปแล้ว' };
      p.weights = clone(body.weights);
      return { ok: true };
    }
    if (a === 'changePassword') return { ok: true, token: 'tok-rotated-000' };
    return { ok: true, locked: false };
  }
  window.fetch = global.fetch = (url, fetchOpts) => {
    const body = JSON.parse(fetchOpts.body);
    server.calls.push(body);
    const hook = server.hooks[body.action];
    const h = hook ? hook(body, server) : undefined;
    if (h && h.network) return Promise.reject(new TypeError('Failed to fetch'));
    if (h && h.hang) return new Promise(() => {});
    if (h && h.html) {
      if (h.land) defaultHandle(body);
      return Promise.resolve(htmlReply());
    }
    if (h && h.reply) return Promise.resolve(reply(h.reply));
    const run = () => {
      // Read-before-write: a sync snapshots the sheet when it ARRIVES.
      const data = defaultHandle(body);
      if (h && h.after) h.after(data);
      return reply(data);
    };
    if (body.action === 'getActivePatients' && server.holdSyncs) {
      const data = clone(defaultHandle(body));
      return new Promise(r => server.holds.push(() => r(reply(data))));
    }
    if (h && h.hold) return h.hold.then(() => (h.respond ? reply(h.respond()) : run()));
    return Promise.resolve(run());
  };
  if (session && !storageBlocked) window.sessionStorage.setItem('neofeed_session', JSON.stringify(session));

  const presets = [[require('@babel/preset-react'), { runtime: 'classic' }]];
  const load = (f) => vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + f, 'utf8'),
    { presets, filename: f, configFile: false, babelrc: false }).code);
  vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
  ['icons.jsx', 'calculator.jsx', 'fenton.jsx', 'registry.jsx', 'log.jsx'].forEach(load);
  const appSrc = babel.transformSync(fs.readFileSync(DIR + 'app.jsx', 'utf8'),
    { presets, filename: 'app.jsx', configFile: false, babelrc: false }).code;

  // ── driving helpers ───────────────────────────────────────────
  const flush = async (ms = 25) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
  const root = () => document.getElementById('root');
  const text = () => root().textContent;
  const bodyText = () => document.body.textContent;
  const click = async (el) => {
    if (!el) throw new Error('click target not found');
    await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    await flush();
  };
  const btn = (re, scope = document) => [...scope.querySelectorAll('button')]
    .find(b => re.test(b.textContent) || re.test(b.getAttribute('title') || ''));
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  const selSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  const typeInto = async (input, v) => {
    if (!input) throw new Error('input not found');
    await act(async () => { valueSetter.call(input, String(v)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
    await flush();
  };
  const selectVal = async (sel, v) => {
    if (!sel) throw new Error('select not found');
    await act(async () => { selSetter.call(sel, String(v)); sel.dispatchEvent(new window.Event('change', { bubbles: true })); });
    await flush();
  };
  const fieldInput = (label, scope = document) => {
    const f = [...scope.querySelectorAll('.field')].find(d => d.querySelector('label')?.textContent.trim().startsWith(label));
    return f ? f.querySelector('input,select') : null;
  };
  const start = async () => { await act(async () => { vm.runInThisContext(appSrc); }); await flush(); await flush(); };
  const releaseSyncs = async () => {
    const hs = server.holds.splice(0);
    await act(async () => { hs.forEach(r => r()); });
    await flush(); await flush();
  };
  const tick = async (ms) => { await act(async () => { fireIntervals(ms); }); await flush(); };
  const syncCalls = () => server.calls.filter(c => c.action === 'getActivePatients');
  const callsOf = (action) => server.calls.filter(c => c.action === action);
  const toasts = () => [...(document.getElementById('toast-host')?.children || [])].map(c => c.textContent);
  const syncButton = () => document.querySelector('.topbar .icon-btn[title="Sync now from GAS"]');
  const pickWard = async (name = 'NICU') => click([...document.querySelectorAll('.ward-tile')].find(b => b.textContent.startsWith(name)));
  const openPatientRow = async (re = /AA/) => click([...document.querySelectorAll('.patient-table tbody tr')].find(r => re.test(r.textContent)));
  const rail = async (re) => click([...document.querySelectorAll('.rail-item')].find(r => re.test(r.textContent)));
  const quiet = () => {
    const w = console.warn, e = console.error;
    console.warn = () => {};
    console.error = (...a) => { if (!/act\(|not wrapped|The above error|error boundary|Not implemented/.test(String(a[0]))) e(...a); };
    return () => { console.warn = w; console.error = e; };
  };

  return {
    window, React, ReactDOM, act, server, clock, timeouts, intervals, fireIntervals, flush, text, bodyText, click, btn,
    typeInto, selectVal, fieldInput, start, releaseSyncs, tick, syncCalls, callsOf, toasts, syncButton,
    pickWard, openPatientRow, rail, quiet, D: () => window.NEOFEED_DATA,
  };
}

module.exports = { boot, runScenarios, makeAsserts, mkPatient, addDays, TODAY, DOCTOR, GAS_URL, DIR };
