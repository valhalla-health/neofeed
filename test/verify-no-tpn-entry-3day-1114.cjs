// verify-no-tpn-entry-3day-1114.cjs — a No TPN infant is asked for an entry
// every 3 days, and the ward's stats strip reads Active, Needs entry, Draft,
// Logged today.
//
// Pp, 2026-11-14, four asks in one session:
//   1. "ถ้า no TPN ไม่ต้อง needs entry"
//   2. "ทุกๆ 3 วัน ให้ขึ้นมาลง นมใหม่เผื่อมีการเปลี่ยนแปลง"
//   3. "เอา active กับ needs entry อยู่ติดกัน ทั้งใน desktop and mobile"
//   4. "total session คิดว่าไม่จำเป็น ให้เปลี่ยนเป็น show draft แทน"
//
// The rule is D.needsEntryOn: nothing Submitted today, and not an infant whose
// latest Submitted order is No TPN dated within the last 2 days. Dated D, the
// list asks again on D+3.
//
//   A   No TPN submitted today                     LOGGED
//   B   No TPN submitted yesterday                 no today badge (D+1)
//   C   No TPN submitted 2 days ago                no today badge (D+2)
//   D   No TPN submitted 3 days ago                NEEDS ENTRY (D+3)
//   E   No TPN submitted 5 days ago                NEEDS ENTRY
//   F   a bag submitted yesterday                  NEEDS ENTRY (TPN is daily)
//   G   No TPN yesterday, a draft today            DRAFT; not in Needs entry
//   H   a bag yesterday, a draft today             DRAFT; in Needs entry
//   I   nothing logged                             NEEDS ENTRY
//   J   a bag 3 days ago, No TPN yesterday, rows in the other order: no badge
//   K   discharged, No TPN yesterday               not on the active list
//
// Mounts the real <PatientRegistry> in jsdom (deps in test/README.md); the
// desktop table and the phone card both render here. Synthetic only.
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
// RegStatMark draws a shape only when STATUS_ICON names one (icons.jsx).
window.STATUS_ICON = { warn: 'warn', crit: 'crit' };
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
const ago = (d) => D.addDaysToDateStr(today, -d);
const pt = (id, bed, status, extra) => Object.assign({ sessionId: id, name: 'Name' + id, initials: id, bw: 1500, ga: 32,
  currentBed: bed, diagnosis: 'dx', status, admissionDate: ago(10), weights: [{ dol: 1, w: 1500 }] }, extra || {});
const noTpn = (ts, extra) => ({ ts, dol: 2, weight: 1500, calcInput: { noTpn: true, totalTPN_mL: 0 }, ...extra });
const bag = (ts, extra) => ({ ts, dol: 2, weight: 1500, calcInput: { noTpn: false, totalTPN_mL: 120, dexPct: 10 }, ...extra });
const draft = { status: 'Draft' };
const patients = [
  pt('A', 'NICU 1', 'Active'), pt('B', 'NICU 2', 'Active'), pt('C', 'NICU 3', 'Active'), pt('D', 'NICU 4', 'Active'),
  pt('E', 'NICU 5', 'Active'), pt('F', 'NICU 6', 'Active'), pt('G', 'NICU 7', 'Active'), pt('H', 'NICU 8', 'Active'),
  pt('I', 'NICU 9', 'Active'), pt('J', 'NICU 10', 'Active'),
  pt('K', 'NICU 11', 'Discharged', { statusDate: today }),
];
const log = {
  A: [noTpn(today)],
  B: [noTpn(ago(1))],
  C: [noTpn(ago(2))],
  D: [noTpn(ago(3))],
  E: [noTpn(ago(5))],
  F: [bag(ago(1))],
  G: [noTpn(ago(1)), bag(today, draft)],
  H: [bag(ago(1)), bag(today, draft)],
  I: [],
  J: [noTpn(ago(1)), bag(ago(3))],
  K: [noTpn(ago(1))],
};

console.log('\n── the rule (D.needsEntryOn) ──');
ok('every 3 days', D.NO_TPN_ENTRY_EVERY_DAYS === 3, D.NO_TPN_ENTRY_EVERY_DAYS);
ok('No TPN today: logged, not asked', D.needsEntryOn(log.A, today) === false);
ok('No TPN yesterday (D+1): not asked', D.needsEntryOn(log.B, today) === false);
ok('No TPN 2 days ago (D+2): not asked', D.needsEntryOn(log.C, today) === false);
ok('No TPN 3 days ago (D+3): asked again', D.needsEntryOn(log.D, today) === true);
ok('No TPN 5 days ago: asked', D.needsEntryOn(log.E, today) === true);
ok('a bag yesterday: asked every day', D.needsEntryOn(log.F, today) === true);
ok('a draft today does not answer it, with a bag yesterday', D.needsEntryOn(log.H, today) === true);
ok('a draft today, No TPN yesterday: not asked', D.needsEntryOn(log.G, today) === false);
ok('nothing logged, or no log: asked', D.needsEntryOn(log.I, today) === true && D.needsEntryOn(undefined, today) === true);
ok('the date decides, not the array order', D.needsEntryOn(log.J, today) === false);
ok('a No TPN draft is not an order: a bag 3 days ago still asks',
  D.needsEntryOn([bag(ago(3)), noTpn(ago(1), draft)], today) === true);
ok('an unreadable date is not a No TPN day', D.needsEntryOn([noTpn('not a date')], today) === true);
ok('due date: yesterday + 3', D.noTpnEntryDueOn(log.B) === D.addDaysToDateStr(ago(1), 3), D.noTpnEntryDueOn(log.B));
ok('no due date when the latest order has a bag, or there is none',
  D.noTpnEntryDueOn(log.F) === null && D.noTpnEntryDueOn(log.I) === null);
ok('B is asked on its due day, not the day before',
  D.needsEntryOn(log.B, D.addDaysToDateStr(today, 2)) === true && D.needsEntryOn(log.B, D.addDaysToDateStr(today, 1)) === false);
ok('the date argument defaults to today', D.needsEntryOn(log.C) === false && D.needsEntryOn(log.D) === true);

const root = ReactDOM.createRoot(document.getElementById('root'));
const render = (props) => act(() => { root.render(React.createElement(PatientRegistry, {
  patients, log, activeId: null, ward: 'NICU', onWardChange() {}, onSelect() {}, onAdd() {}, onEdit() {}, onDelete() {}, ...props })); });
const click = (el) => act(() => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const tiles = () => [...document.querySelectorAll('.reg-stat')];
const tile = (label) => tiles().find(el => el.querySelector('.reg-stat-lbl').textContent === label);
const val = (label) => tile(label)?.querySelector('.reg-stat-val').textContent;
const who = (el) => (el.textContent.match(/Name([A-K])/) || [])[1];
const todayBadge = (el) => el.querySelector('.log-badge:not(.is-no-tpn)')?.textContent || '';
const byName = (sel) => Object.fromEntries([...document.querySelectorAll(sel)].map(el => [who(el), el]));
const shown = (sel) => [...document.querySelectorAll(sel)].map(who).filter(Boolean).sort().join('');

console.log('\n── the stats strip ──');
render();
ok('four tiles: Active, Needs entry, Draft, Logged today, in that order',
  JSON.stringify(tiles().map(el => el.querySelector('.reg-stat-lbl').textContent)) === JSON.stringify(['Active', 'Needs entry', 'Draft', 'Logged today']),
  tiles().map(el => el.querySelector('.reg-stat-lbl').textContent));
ok('Active sits right next to Needs entry (the first two, a row of their own on a phone)',
  tiles().indexOf(tile('Needs entry')) === tiles().indexOf(tile('Active')) + 1);
ok('all four are buttons', tiles().every(el => el.tagName === 'BUTTON'));
ok('no Total sessions tile', !tile('Total sessions'));
ok('the line under the ward name still counts the sessions', /11 sessions · 10 active/.test(document.querySelector('.page-head .sub')?.textContent || ''),
  document.querySelector('.page-head .sub')?.textContent);
ok('Active 10', val('Active') === '10', val('Active'));
ok('Needs entry 5: D, E, F, H, I', val('Needs entry') === '5', val('Needs entry'));
ok('Draft 2: G, H', val('Draft') === '2', val('Draft'));
ok('Logged today 1: A', val('Logged today') === '1', val('Logged today'));
ok('Draft is amber with a shape when there is one', tile('Draft').classList.contains('s-warn') && !!tile('Draft').querySelector('.reg-stat-mark'));

console.log('\n── the badges, phone card and desktop row ──');
for (const [layout, sel] of [['phone', '.patient-mc'], ['desktop', 'tbody tr']]) {
  const row = byName(sel);
  ok(`${layout}: A LOGGED`, todayBadge(row.A) === '✓ LOGGED', todayBadge(row.A));
  ok(`${layout}: B, C and J have no today badge, and keep No TPN`,
    ['B', 'C', 'J'].every(k => todayBadge(row[k]) === '' && !!row[k].querySelector('.log-badge.is-no-tpn')),
    ['B', 'C', 'J'].map(k => todayBadge(row[k])));
  ok(`${layout}: D and E NEEDS ENTRY beside No TPN`,
    ['D', 'E'].every(k => todayBadge(row[k]) === 'NEEDS ENTRY' && !!row[k].querySelector('.log-badge.is-no-tpn')));
  ok(`${layout}: F and I NEEDS ENTRY`, ['F', 'I'].every(k => todayBadge(row[k]) === 'NEEDS ENTRY'));
  ok(`${layout}: G and H DRAFT`, ['G', 'H'].every(k => todayBadge(row[k]) === 'DRAFT'));
  ok(`${layout}: K, discharged, is not on the list (the archive is closed)`, !row.K);
}
const due = D.addDaysToDateStr(ago(1), 3);
const bTag = byName('.patient-mc').B.querySelector('.log-badge.is-no-tpn');
ok('B\'s No TPN tag names the day its feeds are due', bTag.title.includes(`ลงนมใหม่ ${due.slice(8, 10)}/${due.slice(5, 7)}`), bTag.title);

console.log('\n── each tile narrows the list ──');
click(tile('Needs entry'));
ok('Needs entry lists D, E, F, H, I', shown('.patient-mc') === 'DEFHI' && shown('tbody tr') === 'DEFHI', shown('.patient-mc'));
click(tile('Draft'));
ok('Draft lists G and H', shown('.patient-mc') === 'GH' && shown('tbody tr') === 'GH', shown('.patient-mc'));
ok('…and says so above the list', /แสดงเฉพาะ\s*Draft/.test(document.getElementById('root').textContent));
click(tile('Logged today'));
ok('Logged today lists A', shown('.patient-mc') === 'A', shown('.patient-mc'));
click(tile('Active'));
ok('Active lists everyone on the unit again', shown('.patient-mc') === 'ABCDEFGHIJ', shown('.patient-mc'));

console.log('\n── nothing due: the strip reads done ──');
const quiet = { A: log.A, B: log.B, C: log.C };
render({ patients: patients.slice(0, 3), log: quiet });
ok('A logged, B and C inside their 3 days: Needs entry 0, Logged today 1', val('Needs entry') === '0' && val('Logged today') === '1');
ok('Logged today reads done (green), Needs entry has no shape',
  tile('Logged today').classList.contains('s-ok') && !tile('Needs entry').querySelector('.reg-stat-mark'));

console.log('\n── the ward gate and the Print order list ──');
render({ ward: null });
const nicuTile = [...document.querySelectorAll('.ward-tile')].find(el => /NICU 1–12/.test(el.textContent));
ok('the NICU tile counts 5 needing entry', /10\s*active\s*5\s*needs entry/.test(nicuTile?.textContent.replace(/\s+/g, ' ') || ''), nicuTile?.textContent);
render({ ward: null, printWard: 'NICU', onPrintOrder() {}, onPrintWard() {} });
const waiting = document.querySelector('.print-waiting');
ok('the print list counts 5 not yet submitted, the Needs entry list', /ยังไม่ Submit\s*5\s*ราย/.test(waiting?.textContent || ''), waiting?.textContent);

console.log('\n── the two shells ──');
const shell = fs.readFileSync(DIR + 'index.html', 'utf8');
ok('on a phone the strip wraps two by two', /\.reg-stat\s*\{\s*flex:\s*0 0 calc\(50% - 5px\);?\s*\}/.test(shell));
ok('the shells are still one file', shell === fs.readFileSync(DIR + 'NeoFeed.html', 'utf8'));

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
