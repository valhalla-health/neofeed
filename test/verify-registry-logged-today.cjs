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
// Its heading became "Ward" on 2026-09-22; matched on the .ward-gate element
// instead, which is what the gate IS rather than what it happens to say.
eq('gate is what renders first', !!document.querySelector('.ward-gate'), true);
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
// ── search stays in the open ward ─────────────────────────────────────────
// Pp, 2026-09-25: "ช่องค้นหา เอาวอร์ดออก เพราะแยกตั้งแต่ต้นแล้ว". The ward is
// chosen at the gate and the search answers for that ward. From 2026-09-15
// until then a search reached across the unit and mixed the other ward's
// infants into this ward's list. What survives of that is the one case it was
// for: a search that finds nobody here names the ward that has a match, one
// tap away, rather than a bare "ไม่พบ" for an infant the app can see.
console.log('\n── search stays in the open ward; a miss names the other ward ──');
const valueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype, 'value').set;
const search = (text) => act(() => {
  const input = document.querySelector('.reg-search input');
  valueSetter.call(input, text);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
});
const shownIds = () => [...document.querySelectorAll('.patient-table tbody tr')]
  .map(tr => tr.textContent);
const cards = () => [...document.querySelectorAll('.patient-card-list > .patient-mc')]
  .map(el => el.textContent);
const rootText = () => document.getElementById('root').textContent;
const wardChanges = [];
const renderTracked = (ward) => act(() => {
  root.render(React.createElement(PatientRegistry, {
    patients, log, activeId: 'A', ward,
    onWardChange(w) { wardChanges.push(w); },
    onSelect() {}, onAdd() {}, onEdit() {}, onDelete() {},
  }));
});
const click = (el) => act(() => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });

renderTracked('NICU');
eq('browsing NICU shows only NICU', shownIds().length, 2);
// 'Nb' is in SCN 1, a ward the open screen is not showing.
search('Nb');
eq('a search does not pull in the other ward', [shownIds().length, cards().length], [0, 0]);
eq('…it says it found nobody here',        /ไม่พบ “Nb” ใน NICU/.test(rootText()), true);
eq('…and nothing reads as a unit-wide search', /ค้นทั้ง unit/.test(rootText()), false);
const goSCN = [...document.querySelectorAll('.patient-card-list .search-miss button')];
eq('…offering the ward that has a match', goSCN.map(b => b.textContent), ['พบใน SCN 1 ราย · ไปดู →']);
click(goSCN[0]);
eq('…which switches to that ward',          wardChanges, ['SCN']);
renderTracked('SCN');
eq('…where the same search shows the infant', cards().length === 1 && /SCN 1/.test(cards()[0]), true);
eq('…and says what it found',              /พบ 1 รายใน SCN/.test(rootText()), true);

// A search that matches in the open ward says nothing about other wards.
renderTracked('NICU');
search('อช');
eq('an in-ward hit lists only it',          shownIds().length, 1);
eq('…with the count, and no other-ward offer',
  [/พบ 1 รายใน NICU/.test(rootText()), !!document.querySelector('.search-miss')], [true, false]);

// Nobody anywhere: a plain miss, nothing offered.
search('ซซซ');
eq('a miss everywhere offers no ward',      document.querySelectorAll('.search-miss button').length, 0);

search('');
eq('clearing the box goes back to the ward list', shownIds().length, 2);

// The search belongs to the ward it was typed in: going back to the gate
// clears it, so the next ward does not open filtered by a query nobody sees.
search('อช');
const back = [...document.querySelectorAll('button')].find(b => /เปลี่ยน ward/.test(b.textContent));
click(back);
eq('← เปลี่ยน ward asks for the gate',     wardChanges[wardChanges.length - 1], null);
renderTracked('NICU');
eq('…and the box is empty on the way back', [document.querySelector('.reg-search input').value, shownIds().length], ['', 2]);

console.log('\n── control: the comparison that used to be made ──');
eq('raw `e.ts === today` misses a Sheets Date',
   log.A.some(e => e.ts === today), false);
eq('D.hasLogOnDate catches it', D.hasLogOnDate(log.A, today), true);

console.log(fails === 0 ? '\nREGISTRY LOGGED-TODAY: ALL PASS\n' : `\nREGISTRY LOGGED-TODAY: ${fails} FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
