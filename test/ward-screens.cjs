// ward-screens.cjs — every screen and backend answer that names a ward or a bed, reduced to
// what a person reads, for verify-ward-table.cjs and verify-newborn-unmoved-wards.cjs.
// Not a harness itself: CI runs test/verify-*.cjs only.
//
// The ward page (the gate and each ward's list, with its "found in another ward" button), the
// bed picker, New session's default bed, the transfer dialog, "TPN ทั้งหอ", the admin census and
// usage chart (app.jsx), the TPN room's ward groups and sticker labels (tpn-room-core.js), and
// the backend's bed, usage and QI wards (gas-backend.gs). Each is read from the files in `root`,
// so the same reduction can be taken from another tree (`git archive` of main) and compared.
//
// The clock is fixed, so a reading taken one day equals one taken on another. Made-up infants
// only. Dev-only deps as in test/README.md (react@18 react-dom@18 @babel/core
// @babel/preset-react jsdom); backendView and roomView need none.
'use strict';
const fs = require('fs');
const os = require('os');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// 10:00 in Bangkok on 2026-11-22: any fixed instant would do.
const FIXED_NOW = Date.UTC(2026, 10, 22, 3, 0, 0);

// Every spelling a bed label arrives in: the picker's, the old defaults, the sheet's free text.
const BED_VARIANTS = ['NICU 1-1', 'NICU-3', 'nicu 4', ' SCN  2 ', 'SCN-2', 'scn 30', 'SCN 31', 'NICU 13', 'NICU 0',
  'iso 3', 'ISO 2-2', 'iso-1-2', 'iso 1 - 2', 'iso 9-9', 'NICU overflow', 'SCN', 'nicu1', 'NICU 1-2-3',
  'OR 1', 'Ward 9B', 'PICU 1', '', '  ', null, undefined];

const addDays = (key, n) => new Date(Date.parse(key + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const norm = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null);

// ── the made-up ward ───────────────────────────────────────────────────────
// One infant per way a ward files a patient. `extraBeds` adds one infant on each bed named.
function patients(today, extraBeds = []) {
  const ago = (n) => addDays(today, -n);
  const rec = (n, bed, over) => ({
    sessionId: `NF-9000${String(n).padStart(2, '0')}`, name: `ทด ส${n}`, initials: 'ทส', bw: 1100, ga: 29.0, sex: 'girls',
    dob: ago(12), admissionDate: ago(12), twinSuffix: '', status: 'Active', diagnosis: 'VLBW', currentBed: bed,
    bedHistory: [], weights: [{ dol: 1, w: 1100 }], lengths: [], hcs: [], statusDate: '', multiplesCount: 0, ...over,
  });
  return [
    rec(1, 'NICU 1'), rec(2, 'NICU 3'), rec(3, 'iso 2-1'), rec(4, 'NICU 10'), rec(5, 'NICU-5'),
    rec(6, 'SCN 1'), rec(7, 'SCN 12'),
    rec(8, '', { bedHistory: [{ bed: 'SCN 4', date: ago(1), at: new Date(Date.parse(ago(1) + 'T02:00:00Z')).toISOString() }] }),
    rec(9, ''), rec(10, 'OR 1'),
    rec(11, 'NICU 6', { status: 'Discharged', statusDate: ago(2) }),
    { ...rec(12, ''), sessionId: 'TEST-NF-900012' },
    ...extraBeds.map((b, i) => rec(20 + i, b)),
  ];
}
function wardLog(today, P) {
  const order = (n, over) => ({
    ts: today, dol: 12, weight: 1100, fluid: 150, gir: 6, pro: 3, kcal: 90, enVolPerKg: 20, route: 'TPN central',
    status: 'submitted', entryId: `e-${n}`, calcInput: { noTpn: false, totalTPN_mL: 100, dexPct: 10, aaPerKg: 3, lipidPerKg: 2 },
    ...over,
  });
  const log = {};
  P.forEach((p, i) => {
    const n = i + 1;
    if (p.currentBed === 'NICU 3') log[p.sessionId] = [order(n, { status: 'draft' })];
    else if (p.currentBed === 'SCN 1') log[p.sessionId] = [order(n, { gir: 13.5 })];
    else if (p.currentBed === 'SCN 12' || p.currentBed === 'iso 2-1') return;
    else log[p.sessionId] = [order(n)];
  });
  return log;
}
// A small number from a string, so a ward's or a bed's made-up figures do not move when
// another ward joins the table.
const seedOf = (s) => [...String(s)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 997, 7);
// The admin usage chart's reply: two weeks, every ward on the list given.
function usageReply(wards) {
  const cell = (n) => ({ total: n, TPN: n, EN: 0, NPO: 0, other: 0 });
  return ['2026-11-09', '2026-11-16'].map((weekStart, i) => ({
    week: '2026-W' + (46 + i), weekStart, total: 0,
    byWard: Object.fromEntries(wards.map(w => [w, cell(w === 'other' ? 0 : 2 + i + seedOf(w) % 5)])),
  }));
}

// ── jsdom, the real modules ────────────────────────────────────────────────
// One mount per process: the modules declare top-level consts. `patchData` rewrites data.js
// before it runs (a planted ward); the .jsx files are read as they are, so the compiled pass
// (test/compiled-loader.cjs) can swap compiled/ in for them.
function mount({ root = ROOT, patchData } = {}) {
  const babel = require('@babel/core');
  const { JSDOM } = require('jsdom');
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(FIXED_NOW); }
    static now() { return FIXED_NOW; }
  }
  global.Date = FixedDate;
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><div id="probe"></div></body></html>',
    { url: 'https://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  Object.assign(global, {
    window, document: window.document, self: window,
    HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
    getComputedStyle: window.getComputedStyle,
    sessionStorage: window.sessionStorage, localStorage: window.localStorage,
    Event: window.Event, CustomEvent: window.CustomEvent, MouseEvent: window.MouseEvent, KeyboardEvent: window.KeyboardEvent,
    requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: clearTimeout,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true });
  global.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  global.showToast = () => {};
  window.print = () => {};
  window.confirm = () => true;
  window.alert = () => {};
  const React = require('react');
  const ReactDOM = require('react-dom/client');
  const { act } = React;
  global.React = React; window.React = React;
  global.ReactDOM = ReactDOM; window.ReactDOM = ReactDOM;
  window.NEOFEED_CLIENT_ID = 'test-client';
  window.NEOFEED_GAS_URL = '';   // local mode: nothing is sent anywhere
  window.sessionStorage.setItem('neofeed_session',
    JSON.stringify({ name: 'Ward Table', role: 'admin', email: 'admin@example.test', token: '' }));

  const dir = path.resolve(root) + path.sep;
  let data = fs.readFileSync(dir + 'data.js', 'utf8');
  if (patchData) data = patchData(data);
  vm.runInThisContext(data, { filename: 'data.js' });
  const presets = [[require('@babel/preset-react'), { runtime: 'classic' }]];
  const load = (f) => vm.runInThisContext(babel.transformSync(fs.readFileSync(dir + f, 'utf8'),
    { presets, filename: f, configFile: false, babelrc: false }).code, { filename: f });
  const quiet = console.error;
  console.error = (...a) => { if (!/act\(|not wrapped|Not implemented/.test(String(a[0]))) quiet(...a); };
  ['icons.jsx', 'calculator.jsx', 'fenton.jsx', 'registry.jsx', 'log.jsx', 'app.jsx'].forEach(load);

  const probeRoot = ReactDOM.createRoot(document.getElementById('probe'));
  const flush = async (ms = 20) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
  // Unmounted first, so a component that keeps the ward it opened on (WardTpnPage) starts again.
  const render = async (el) => {
    await act(async () => { probeRoot.render(null); });
    await act(async () => { probeRoot.render(el); });
    await flush();
  };
  const probe = () => document.getElementById('probe');
  const inputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  const typeInto = async (input, v) => {
    await act(async () => { inputSetter.call(input, String(v)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
    await flush();
  };
  return { D: window.NEOFEED_DATA, G: global, h: React.createElement, render, flush, probe, typeInto, window };
}

const wardKeys = (D) => (D.WARDS ? D.WARDS.map(w => w.key) : ['NICU', 'SCN']);

// Every screen above, as text. `extraBeds` places one more infant on each bed named.
async function screenViews(m, { extraBeds = [] } = {}) {
  const { D, G, h, render, probe, typeInto } = m;
  const today = D.todayLocal();
  const P = patients(today, extraBeds), LOG = wardLog(today, P);
  const keys = [...wardKeys(D), 'other'];
  const noop = () => {};
  const v = { today };

  await render(h(G.WardGate, { patients: P, log: LOG, today, onPick: noop, onPrintList: noop }));
  v.gate = [...probe().querySelectorAll('.ward-gate > div')].map(d => ({
    tile: norm(d.querySelector('.ward-tile')),
    print: d.querySelector('.ward-print') ? d.querySelector('.ward-print').getAttribute('aria-label') : null,
  }));

  v.wardList = {};
  for (const k of keys) {
    await render(h(G.PatientRegistry, { patients: P, log: LOG, ward: k, role: 'doctor', onWardChange: noop, onSelect: noop,
      onAdd: noop, onEdit: noop, onDelete: noop, mergeBaseFor: () => null, onPrintWard: noop, onPrintOrder: noop,
      onPrintAll: noop, onOpenWardTpn: noop }));
    const head = norm(probe().querySelector('.page-head h1'));
    const beds = [...probe().querySelectorAll('.bed-chip')].map(norm);
    // The search that misses here and offers the ward the infant is in.
    const box = probe().querySelector('input[inputmode="search"]');
    let miss = null;
    if (box) {
      const away = P.find(p => D.patientWard(p) !== k && D.isOnUnit(p) && !D.isTestSession(p.sessionId));
      await typeInto(box, away.name);
      miss = norm(probe().querySelector('.search-miss'));
    }
    v.wardList[k] = { head, beds, miss };
  }

  await render(h(G.BedSelect, { value: '', onChange: noop, allowUnassigned: true, occupancy: D.bedOccupancy(P) }));
  v.picker = [...probe().querySelectorAll('select option')].map(o => [o.value, o.textContent, o.disabled]);

  v.newSessionBed = {};
  for (const k of keys) {
    await render(h(G.NewPatientModal, { patients: P, ward: k, onClose: noop, onSubmit: noop }));
    const f = [...probe().querySelectorAll('.field')].find(d => (d.querySelector('label')?.textContent || '').trim().startsWith('Bed'));
    v.newSessionBed[k] = f ? f.querySelector('select').value : null;
  }

  v.transfer = {};
  for (const bed of ['NICU 1', 'SCN 1', '']) {
    const patient = bed ? P.find(p => p.currentBed === bed) : P.find(p => D.isParked(p));
    await render(h(G.TransferBedModal, { patient, patients: P, onClose: noop, onSubmit: noop, mergeBaseFor: () => null }));
    v.transfer[bed || 'parked'] = [...probe().querySelectorAll('.picker button')].map(b => `${norm(b)}${b.disabled ? ' [disabled]' : ''}`);
  }

  v.wardTpn = {};
  for (const k of keys) {
    await render(h(G.WardTpnPage, { patients: P, log: LOG, ward: k, onSelect: noop }));
    // The tabs apart from the page, so a reading can leave one ward's tab out.
    const page = probe().querySelector('.wtpn').cloneNode(true);
    const seg = page.querySelector('.seg');
    const tabs = seg ? [...seg.querySelectorAll('button')].map(norm) : [];
    if (seg) seg.remove();
    v.wardTpn[k] = { tabs, page: norm(page) };
  }

  const c = G.buildCensus(P, LOG, today);
  v.census = { wards: c.wards, total: c.total, doubleBooked: c.doubleBooked, unbedded: c.unbedded, offList: c.offList };
  v.censusCards = [];
  for (const w of c.wards) {
    await render(h(G.CensusWard, { w }));
    v.censusCards.push(norm(probe()));
  }

  await render(h(G.UsageChart, { weeks: usageReply(keys) }));
  v.usage = [...probe().querySelectorAll('.usage-ward')].map(d => ({
    ward: d.getAttribute('data-ward'), head: norm(d.querySelector('.census-ward-h')),
    bars: d.querySelector('.usage-bars').getAttribute('aria-label'),
  }));
  await render(null);
  return v;
}

// ── tpn-room-core.js: the room's ward groups and the sticker's ward ───────
function loadCore(src) {
  const box = { module: { exports: {} } };
  box.globalThis = box;
  vm.createContext(box);
  vm.runInContext(src, box, { filename: 'tpn-room-core.js' });
  return box.module.exports;
}
function roomView(coreSrc, beds) {
  const Core = loadCore(coreSrc);
  const orders = beds.map((bed, i) => ({ sessionId: `NF-91${String(i).padStart(4, '0')}`, revision: 1, bed,
    status: seedOf(bed) % 3 === 2 ? 'draft' : 'submitted' }));
  const groups = Core.ordersByWard(Core.currentOrders(orders)).map(g => ({
    key: g.key, label: g.label, submitted: g.submitted.map(o => o.bed), drafts: g.drafts.map(o => o.bed),
  }));
  return {
    groups,
    order: Core.currentOrders(orders).map(o => o.bed),
    sticker: beds.map(b => [b, Core.wardLabel(b)]),
    group: beds.map(b => [b, Core.wardGroup(b)]),
  };
}

// ── gas-backend.gs: the bed it keeps, the usage and QI wards ──────────────
function backendView(gasSrc, beds) {
  const { boot } = require('./gas-vm-sandbox.cjs');
  const tmp = path.join(os.tmpdir(), `ward-screens-${process.pid}-${Math.random().toString(36).slice(2)}.gs`);
  fs.writeFileSync(tmp, gasSrc);
  let g;
  try { g = boot({ src: tmp }); } finally { fs.unlinkSync(tmp); }
  const S = g.sb;
  const now = new Date(FIXED_NOW);
  const rows = [['ts', 'week', 'ward', 'type']];
  S.USAGE_WARDS.forEach((w, i) => { for (let k = 0; k <= i; k++) rows.push(['2026-11-17T02:00:00.000Z', '2026-W47', w, 'TPN']); });
  const qi = S.qiSubmitDays([['ts']], [['sessionId']], { from: '2026-11-20', to: '2026-11-20', now });
  return {
    beds: beds.map(b => [b, S._normBed(b), S._usageWardOf(b, []), S.PHARMACY_WARD_BED.test(S._normBed(b))]),
    parked: beds.filter(Boolean).map(b => [b, S._usageWardOf('', [{ bed: b, date: '2026-11-20' }])]),
    usageWards: S.USAGE_WARDS.slice(),
    usageTable: S._usageWeeklyTable(S.usageWeekly(rows, now, 0)),
    qiWards: S.QI_SUBMIT_WARDS.slice(),
    qiRows: qi.rows.map(r => (Array.isArray(r) ? r[2] : r.ward)),
  };
}

module.exports = { ROOT, FIXED_NOW, BED_VARIANTS, addDays, norm, seedOf, patients, wardLog, usageReply, mount, screenViews,
  loadCore, roomView, backendView, wardKeys };
