// verify-ward-requests-1001.cjs — Pp's requests of 2026-10-01, from three phone
// screenshots of the ward list and the Dashboard's All entries table.
//
//   1. "ช่องค้นหา ให้ขึ้นว่า เตียง / ชื่อ / นามสกุล" — both search boxes (the
//      ward list's and the topbar switcher's, one search behind them) read
//      "เตียง / ชื่อ / นามสกุล". The old "ค้นหา ชื่อ หรือ นามสกุล · เลขเตียง"
//      was cut off on a phone; "ค้นหา" now lives in the aria-label.
//   2. "ช่อง all entries ให้ปิด column day of admit ไม่ต้องโชว์แต่ให้คำนวณ
//      เหมือนเดิม" — no Day admit column; the row still carries the same
//      figure (entryDol − admissionDol) as data-admit-day.
//   3. "หน่วยให้เอาไปไว้ใต้เฮดเดอร์" — each unit once, under its column name,
//      from log.jsx's METRICS (the Trend's units), and no unit in the cells.
//   4. "ในแต่ละแถว ให้ตัวอักษรอยู่แถวเดียวกัน … na/k 6 / 4" — every cell on
//      one line (white-space: nowrap); the table scrolls in .tbl-scroll.
//
// Section 1 reads the two shells; sections 2-3 mount the real modules in jsdom
// (same dev-only deps as the other harnesses — see test/README.md).
//   node test/verify-ward-requests-1001.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';
const read = (f) => fs.readFileSync(DIR + f, 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + JSON.stringify(detail === undefined ? '' : detail).slice(0, 300)}`);
  cond ? pass++ : fail++;
}
const eq = (name, got, want) => ok(`${name}  (${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want), { got, want });

const PLACEHOLDER = 'เตียง / ชื่อ / นามสกุล';

// ══ 1 · the shells ══════════════════════════════════════════════════════════
console.log('\n── #1 the entries table: one line per cell, the unit under its name ──');
const cssOf = (shell) => read(shell).match(/<style>([\s\S]*?)<\/style>/)[1];
const rulesFor = (css, sel) => [...css.matchAll(new RegExp(`(^|[\\n}])\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g'))].map(m => m[2]);
for (const shell of ['NeoFeed.html', 'index.html']) {
  const css = cssOf(shell);
  ok(`${shell}: every header and cell of .tbl-entries stays on one line`,
    rulesFor(css, 'table.tbl-entries th, table.tbl-entries td').some(r => /white-space:\s*nowrap/.test(r)));
  ok(`${shell}: the column names line up along the top`,
    rulesFor(css, 'table.tbl-entries th').some(r => /vertical-align:\s*top/.test(r)));
  const unit = rulesFor(css, 'table.tbl th .th-unit');
  ok(`${shell}: the unit sits on its own line under the name`, unit.some(r => /display:\s*block/.test(r)), unit);
  ok(`${shell}: …and keeps its case (the header is uppercased; mL must not read ML)`,
    unit.some(r => /text-transform:\s*none/.test(r)), unit);
  ok(`${shell}: the table still scrolls inside its card, not the page`,
    rulesFor(css, '.patient-table, .tbl-scroll').some(r => /overflow-x:\s*auto/.test(r)));
}

// ══ jsdom + the modules ═════════════════════════════════════════════════════
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'https://localhost/', pretendToBeVisual: true });
const { window } = dom;
Object.assign(global, {
  window, document: window.document, self: window, HTMLElement: window.HTMLElement,
  Element: window.Element, Node: window.Node, getComputedStyle: window.getComputedStyle,
  localStorage: window.localStorage,
  requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: clearTimeout,
  IS_REACT_ACT_ENVIRONMENT: true,
});
global.showToast = () => {};
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
vm.runInThisContext(read('data.js'));
const D = window.NEOFEED_DATA;
for (const f of ['icons.jsx', 'registry.jsx', 'log.jsx']) {
  vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + f, 'utf8'), {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    filename: f, configFile: false, babelrc: false,
  }).code);
}
const host = document.getElementById('root');
let root = null;
const mount = (C, props) => {
  if (root) act(() => root.unmount());
  root = ReactDOM.createRoot(host);
  act(() => root.render(React.createElement(C, props)));
};

// ══ 2 · the two search boxes ════════════════════════════════════════════════
console.log('\n── #2 both search boxes read "เตียง / ชื่อ / นามสกุล" ──');
{
  const P = { sessionId: 'NF-100001', name: 'สม ใจ', bw: 1200, ga: 30, currentBed: 'NICU 2', status: 'Active', weights: [] };
  mount(window.PatientRegistry, { patients: [P], log: {}, activeId: null, ward: 'NICU', onWardChange() {},
    onSelect() {}, onAdd() {}, onEdit() {}, onDelete() {} });
  const box = host.querySelector('.reg-search input');
  eq('ward list: the placeholder', box?.placeholder, PLACEHOLDER);
  ok('ward list: the aria-label still says it is a search', /^ค้นหา/.test(box?.getAttribute('aria-label') || ''));

  mount(window.PatientPicker, { patients: [P], activeId: null, onSelect() {}, onClose() {} });
  const pick = host.querySelector('.picker-h input');
  eq('switcher: the same placeholder', pick?.placeholder, PLACEHOLDER);
  ok('switcher: an aria-label says it is a search', /^ค้นหา/.test(pick?.getAttribute('aria-label') || ''));
}
{
  const src = read('registry.jsx');
  eq('registry.jsx: the old wording is gone', (src.match(/ค้นหา ชื่อ หรือ นามสกุล · เลขเตียง/g) || []).length, 0);
  eq('registry.jsx: the new wording is in both boxes', (src.match(/placeholder="เตียง \/ ชื่อ \/ นามสกุล"/g) || []).length, 2);
}

// ══ 3 · All entries ═════════════════════════════════════════════════════════
console.log('\n── #3 All entries: no Day admit column, units in the header, none in the cells ──');
{
  // Born 1 Sep, admitted 6 Sep (DOL 6): an order on 15 Sep is DOL 15, admission day 9.
  const P = { sessionId: 'NF-200002', name: 'กข คง', bw: 1200, ga: 30, currentBed: 'NICU 2', status: 'Active',
    dob: '2026-09-01', admissionDate: '2026-09-06', weights: [{ dol: 6, w: 1200, l: null, hc: null }] };
  const rows = [
    { entryId: 'e-15', ts: '2026-09-15', dol: 15, weight: 1200, fluid: 112, gir: 5.6, pro: 3, kcal: 66.2,
      na: 6, k: 2, ca: 100, p: 62, route: 'TPN central', status: 'submitted' },
    { entryId: 'e-13', ts: '2026-09-13', dol: 1, weight: 1180, fluid: 89, gir: 4.9, pro: 2.5, kcal: 60.8,
      na: 6, k: 4, ca: 100, p: 62, route: 'TPN central', status: 'submitted' },   // a stale stored dol
  ];
  mount(window.DailyLog, { patient: P, log: { [P.sessionId]: rows }, dol: 15,
    onAddToday() {}, onEditEntry() {}, onDeleteEntry() {} });
  const table = host.querySelector('.tbl-scroll > table.tbl');
  ok('the table is .tbl-entries, inside .tbl-scroll', !!table && table.classList.contains('tbl-entries'));
  const ths = [...table.querySelectorAll('thead th')];
  const name = (th) => [...th.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
  const unit = (th) => th.querySelector('.th-unit')?.textContent ?? null;
  eq('the columns', ths.map(name),
    ['DOL', 'Date', 'Weight', 'Fluid', 'GIR', 'Protein', 'Energy', 'Na / K', 'Ca / P', 'Route', 'สถานะ', '']);
  ok('no Day admit column', !ths.some(th => /day\s*admit/i.test(th.textContent)));
  eq('each unit, under its name', ths.map(unit),
    [null, null, 'g', 'mL/kg/d', 'mg/kg/min', 'g/kg/d', 'kcal/kg/d', 'mEq/kg/d', 'mg/kg/d', null, null, null]);

  const trs = [...table.querySelectorAll('tbody tr')];
  const cells = (tr) => [...tr.cells].slice(0, 9).map(td => td.textContent.trim());
  eq('newest row: DOL · Date · Weight · Fluid · GIR · Protein · Energy · Na / K · Ca / P',
    cells(trs[0]).filter((_, i) => i !== 1), ['15', '1200', '112', '5.6', '3', '66', '6 / 2', '100 / 62']);
  eq('older row, its stale stored dol re-derived from the date', cells(trs[1])[0], '13');
  ok('no unit is repeated in any cell',
    trs.every(tr => [...tr.cells].every(td => !/(mL|g|kcal|mEq|mg)\/kg|\d\s*g$/.test(td.textContent.trim()))),
    trs.map(cells));

  // Hidden, but computed exactly as the column was: entryDol − admissionDol.
  eq('admissionDol for this infant', D.admissionDol(P), 6);
  eq('each row still carries its admission day', trs.map(tr => tr.dataset.admitDay), ['9', '7']);
  eq('…the same figure the column showed', trs.map(tr => Number(tr.dataset.admitDay)),
    rows.map(r => D.entryDol(P, r) - D.admissionDol(P)));
}
{
  const src = read('log.jsx');
  ok('log.jsx: the header units come from METRICS, the Trend\'s own list',
    /function EntryTh\(\{ label, metric \}\) \{\s*const unit = METRICS\.find\(m => m\.key === metric\)\.unit;/.test(src));
  eq('log.jsx: no Day admit header left', (src.match(/<th>Day admit<\/th>/g) || []).length, 0);
}

if (root) act(() => root.unmount());
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
