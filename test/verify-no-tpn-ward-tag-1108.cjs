// verify-no-tpn-ward-tag-1108.cjs — the ward list shows who is off TPN.
//
// The nutrition team's meeting of 2026-10-28 asked for a TPN / no-TPN tag on the
// ward list. PR #206 tagged only the Print order list. Pp chose this on
// 2026-11-08. The infant's latest Submitted order decides, by date: rows arrive
// in the Sheet's insertion order, so the last row of the array can be an old day
// back-filled (verify-registry-logged-today.cjs, defect 2).
//
//   A   latest order No TPN                    tagged
//   B   latest order has a bag                 not tagged
//   C   No TPN yesterday, a bag today          not tagged, however the rows are ordered
//   D   a bag yesterday, No TPN today, back-filled rows last in the array: tagged
//   E   a bag submitted; today's No TPN is only a draft: not tagged
//   F   nothing logged                         not tagged
//   G   an order older than the tick, no bag   tagged (D.orderIsNoTpn)
//   H   discharged, last order No TPN          not tagged
//
// Mounts the real <PatientRegistry> in jsdom: the deps in test/README.md, read at
// the desktop table and the phone card, which both render here. Synthetic only.
const fs = require('fs');
const vm = require('vm');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = require('path').join(__dirname, '..') + '/';
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://localhost/', pretendToBeVisual: true });
const { window } = dom;
Object.assign(global, { window, document: window.document, self: window, HTMLElement: window.HTMLElement, Element: window.Element,
  Node: window.Node, getComputedStyle: window.getComputedStyle, requestAnimationFrame: (cb) => setTimeout(cb, 0),
  cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true });
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
const D = window.NEOFEED_DATA;
global.Icon = () => null; window.Icon = global.Icon;
vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + 'registry.jsx', 'utf8'), {
  presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
  filename: 'registry.jsx', configFile: false, babelrc: false,
}).code + '\n;window.__PatientRegistry = PatientRegistry;');
const PatientRegistry = window.__PatientRegistry;

let pass = 0, fail = 0, n = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name}${cond ? '' : '\n         ' + JSON.stringify(detail ?? '')}`);
  cond ? pass++ : fail++;
}

const today = D.todayLocal();
const yesterday = D.addDaysToDateStr(today, -1);
const pt = (id, bed, status, extra) => Object.assign({ sessionId: id, name: 'Name' + id, initials: id, bw: 1500, ga: 32, currentBed: bed, diagnosis: 'dx', status, admissionDate: yesterday, weights: [{ dol: 1, w: 1500 }] }, extra || {});
const noTpn = (ts, extra) => ({ ts, dol: 2, weight: 1500, calcInput: { noTpn: true, totalTPN_mL: 0 }, ...extra });
const bag = (ts, extra) => ({ ts, dol: 2, weight: 1500, calcInput: { noTpn: false, totalTPN_mL: 120, dexPct: 10 }, ...extra });
const patients = [
  pt('A', 'NICU 1', 'Active'), pt('B', 'NICU 2', 'Active'), pt('C', 'NICU 3', 'Active'), pt('D', 'NICU 4', 'Active'),
  pt('E', 'NICU 5', 'Active'), pt('F', 'NICU 6', 'Active'), pt('G', 'NICU 7', 'Active'),
  pt('H', 'NICU 8', 'Discharged', { statusDate: today }),
];
const log = {
  A: [noTpn(today)],
  B: [bag(today)],
  C: [bag(today), noTpn(yesterday)],
  D: [noTpn(today), bag(yesterday)],
  E: [bag(yesterday), noTpn(today, { status: 'Draft' })],
  F: [],
  G: [{ ts: today, dol: 2, weight: 1500, calcInput: { totalTPN_mL: 0, dexPct: 0, aaPerKg: 0 } }],
  H: [noTpn(today)],
};

console.log('\n── the rule ──');
ok('latest order No TPN', D.latestOrderIsNoTpn(log.A) === true);
ok('latest order has a bag', D.latestOrderIsNoTpn(log.B) === false);
ok('the date decides, not the array order (a bag today)', D.latestOrderIsNoTpn(log.C) === false);
ok('the date decides, not the array order (No TPN today)', D.latestOrderIsNoTpn(log.D) === true);
ok('a draft does not count', D.latestOrderIsNoTpn(log.E) === false);
ok('no order at all', D.latestOrderIsNoTpn(log.F) === false && D.latestOrderIsNoTpn(undefined) === false);
ok('an order older than the tick, with no bag', D.latestOrderIsNoTpn(log.G) === true);

console.log('\n── on the ward list ──');
const root = ReactDOM.createRoot(document.getElementById('root'));
act(() => { root.render(React.createElement(PatientRegistry, { patients, log, activeId: null, ward: 'NICU', onWardChange() {}, onSelect() {}, onAdd() {}, onEdit() {}, onDelete() {} })); });
const tagged = (sel) => [...document.querySelectorAll(sel)]
  .filter(el => el.querySelector('.log-badge.is-no-tpn')).map(el => (el.textContent.match(/Name([A-H])/) || [])[1]).sort().join('');
ok('phone cards tag A, D and G', tagged('.patient-mc') === 'ADG', tagged('.patient-mc'));
ok('desktop rows tag A, D and G', tagged('tbody tr') === 'ADG', tagged('tbody tr'));
const one = document.querySelector('.log-badge.is-no-tpn');
ok('it reads "No TPN"', one?.textContent === 'No TPN', one?.textContent);
ok('it says what it means on hover', /ใบสั่งล่าสุด/.test(one?.title || ''), one?.title);
ok('it sits beside the today badge, which stays', [...document.querySelectorAll('.patient-mc')].every(c => c.querySelector('.log-badge:not(.is-no-tpn)')));

console.log('\n── the two shells ──');
const css = fs.readFileSync(DIR + 'index.html', 'utf8');
ok('the tag has its own quiet style in index.html', /\.log-badge\.is-no-tpn\s*\{/.test(css));
ok('and the shells are still one file', css === fs.readFileSync(DIR + 'NeoFeed.html', 'utf8'));

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
