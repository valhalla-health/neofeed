// Registry "Logged today / Needs entry" verification.
//
// Drives the REAL <PatientRegistry> in jsdom and reads the numbers off the
// rendered stats strip and the per-patient badges, because this is a UI-truth
// bug rather than an arithmetic one: the counts were computed correctly from
// the wrong values. Three defects are pinned here, all of which showed up on
// the ward as "0 logged today, everyone needs entry" while entries were in
// fact being saved:
//
//   1. Google Sheets parses the "YYYY-MM-DD" the backend appends to Daily_Log
//      into a real date VALUE, so `ts` could come back as a Date — and
//      `e.ts === todayLocal()` is false for a Date, always.
//   2. "Logged today?" read only the LAST entry in the array. Rows arrive in
//      the sheet's insertion order, so back-filling a missed day after logging
//      today put the older entry last and hid today's.
//   3. The Active tile counted `status === "Active"` while the list it sits
//      above also treats a blank status as active, so the tile could read
//      lower than the list, and Logged today was counted over ALL patients
//      (discharged included) while Needs entry was counted over active ones —
//      the three numbers could not be reconciled with each other.
//
// Needs the same dev-only npm deps as the KCMH harnesses (see test/README.md):
//   node test/verify-registry-logged-today.cjs
const fs = require('fs');
const vm = require('vm');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = require('path').join(__dirname, '..') + '/';

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
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = clearTimeout;
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;

vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
const D = window.NEOFEED_DATA;

// registry.jsx only reaches for <Icon> as decoration; stub it rather than
// pulling icons.jsx in, so a failure here can only be about the log state.
global.Icon = () => null; window.Icon = global.Icon;

vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + 'registry.jsx', 'utf8'), {
  presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
  filename: 'registry.jsx', configFile: false, babelrc: false,
}).code + '\n;window.__PatientRegistry = PatientRegistry;');
const PatientRegistry = window.__PatientRegistry;

const today     = D.todayLocal();
const yesterday = D.addDaysToDateStr(today, -1);

const pt = (sessionId, name, bw, ga, bed, status, extra) => Object.assign({
  sessionId, name, initials: name, bw, ga, currentBed: bed, diagnosis: 'dx',
  status, admissionDate: yesterday, weights: [{ dol: 1, w: bw }],
}, extra || {});

const patients = [
  pt('A', 'อช', 3100, 38.0, 'NICU 1-1', 'Active'),
  pt('B', 'In', 1710, 39.1, 'NICU 2',   'Active'),
  pt('C', 'Nb', 1200, 30.0, 'SCN 1',    ''),                          // blank status = still on the unit
  pt('D', 'Dc', 2500, 36.0, 'SCN 2',    'Discharged', { statusDate: today }),
];
const log = {
  // A — today's entry, but as a Sheets date VALUE rather than a string (#1)
  A: [{ ts: new Date(today + 'T00:00:00+07:00'), dol: 2, weight: 3100 }],
  // B — logged today, then a missed day back-filled afterwards, so the older
  //     entry is last in the array (#2)
  B: [{ ts: today, dol: 2, weight: 1710 }, { ts: yesterday, dol: 1, weight: 1700 }],
  // C — on the unit, nothing logged today
  C: [{ ts: yesterday, dol: 1, weight: 1200 }],
  // D — discharged and logged today: must not inflate any count (#3)
  D: [{ ts: today, dol: 2, weight: 2500 }],
};

const root = ReactDOM.createRoot(document.getElementById('root'));
// Since 2026-09-15 the registry opens on a ward gate (NICU / SCN) and every
// count below it is scoped to the chosen ward, so each ward is rendered and
// read separately. `ward: null` is the gate itself.
const render = (ward) => act(() => {
  root.render(React.createElement(PatientRegistry, {
    patients, log, activeId: 'A', ward, onWardChange() {},
    onSelect() {}, onAdd() {}, onEdit() {}, onDelete() {},
  }));
});
const readStats = () => [...document.querySelectorAll('.reg-stat')].map(
  el => el.querySelector('.reg-stat-lbl').textContent + '=' + el.querySelector('.reg-stat-val').textContent);
const readBadges = () => [...document.querySelectorAll('.log-badge')].map(el => el.textContent);

let fails = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
};

// ── the gate itself ───────────────────────────────────────────────────────
console.log('\n── ward gate (no ward chosen) ──');
render(null);
const gateText = document.getElementById('root').textContent;
eq('gate is what renders first', /เลือก ward/.test(gateText), true);
eq('…offering NICU', /NICU 1–12/.test(gateText), true);
eq('…and SCN 1–30', /SCN 1–30/.test(gateText), true);
eq('no patient list yet', document.querySelectorAll('.log-badge').length, 0);
// Every active patient must be reachable from some tile, or the gate has
// hidden someone: the two ward tiles plus the conditional "other" tile.
const reachable = patients.filter(p => !p.status || p.status === 'Active')
  .every(p => ['NICU', 'SCN', 'other'].includes(D.wardGroup(p.currentBed)));
eq('every active patient falls under a tile', reachable, true);

// ── NICU: A (legacy "NICU 1-1") + B, both logged today ────────────────────
console.log('\n── NICU stats strip ──');
render('NICU');
let stats = readStats();
let badges = readBadges();
console.log('  rendered:', stats.join('   '));
eq('Active counts only this ward',           stats[0], 'Active=2');
eq('Total sessions counts this ward',        stats[1], 'Total sessions=2');
eq('Logged today survives a Sheets Date + back-fill', stats[2], 'Logged today=2');
eq('Needs entry = active - logged',          stats[3], 'Needs entry=0');
eq('the three reconcile',
   Number(stats[2].split('=')[1]) + Number(stats[3].split('=')[1]),
   Number(stats[0].split('=')[1]));
eq('one badge per active patient, per layout', badges.length, 4);
eq('LOGGED badges',      badges.filter(b => b.includes('LOGGED')).length, 4);

// ── SCN: C (blank status, unlogged) + D (discharged, logged today) ────────
console.log('\n── SCN stats strip ──');
render('SCN');
stats = readStats();
badges = readBadges();
console.log('  rendered:', stats.join('   '));
eq('Active counts a blank status as active', stats[0], 'Active=1');
eq('Total sessions counts the discharged one too', stats[1], 'Total sessions=2');
eq('a discharged patient logged today does not inflate Logged', stats[2], 'Logged today=0');
eq('Needs entry = active - logged',          stats[3], 'Needs entry=1');
eq('the three reconcile',
   Number(stats[2].split('=')[1]) + Number(stats[3].split('=')[1]),
   Number(stats[0].split('=')[1]));
eq('NEEDS ENTRY badges', badges.filter(b => b === 'NEEDS ENTRY').length, 2);

// The raw comparison the app used to make, kept as the control: if this ever
// starts passing, Sheets stopped returning dates as values and the
// normalization above is merely belt-and-braces — it is not wrong to keep.
// ── search reaches across wards ───────────────────────────────────────────
// The ward gate shortens the daily list; it does not partition the census.
// Someone typing a name is looking for that infant, and "ไม่พบ" because they
// are one ward over — when the app can see them — is the app withholding what
// it knows (ward decision, 2026-09-15).
console.log('\n── search is unit-wide, browsing is ward-scoped ──');
const valueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype, 'value').set;
const search = (text) => act(() => {
  const input = document.querySelector('.reg-search input');
  valueSetter.call(input, text);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
});
const shownIds = () => [...document.querySelectorAll('.patient-table tbody tr')]
  .map(tr => tr.textContent);

render('NICU');
eq('browsing NICU shows only NICU', shownIds().length, 2);
// 'Nb' is in SCN 1 — a ward the open screen is not showing.
search('Nb');
eq('a search finds the patient in the other ward', shownIds().length, 1);
eq('…and it is the SCN one', /SCN 1/.test(shownIds()[0] || ''), true);
eq('…with a note saying the search crossed wards',
  /ค้นทั้ง unit — 1 ราย/.test(document.getElementById('root').textContent), true);

// A search that matches only patients in the open ward says nothing about
// other wards — the note must not fire on every search.
search('อช');
eq('an in-ward-only hit shows no cross-ward note',
  /ค้นทั้ง unit/.test(document.getElementById('root').textContent), false);

search('');
eq('clearing the box goes back to the ward list', shownIds().length, 2);

console.log('\n── control: the comparison that used to be made ──');
eq('raw `e.ts === today` misses a Sheets Date',
   log.A.some(e => e.ts === today), false);
eq('D.hasLogOnDate catches it', D.hasLogOnDate(log.A, today), true);

console.log(fails === 0 ? '\nREGISTRY LOGGED-TODAY: ALL PASS\n' : `\nREGISTRY LOGGED-TODAY: ${fails} FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
