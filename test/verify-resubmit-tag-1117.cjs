// verify-resubmit-tag-1117.cjs — the ward says which orders need a new Submit
// before they print, and Active reads apart from ✓ LOGGED.
//
// Pp, 2026-11-17, from a render of the ward list and its Print order list: "ใช้
// แบบนี้"; and, the same evening: "ให้ปรับสีเขียวของ Active เป็นคนละเฉดสีกับ
// logged". After a release that moves a printed figure (CONSTANTS_VERSION), the
// Calculator's Print gate holds every order saved before it (calcMoved) until a
// doctor Submits it again. The ward list read ✓ LOGGED for those orders, and
// Print ทั้งหมด counted them, so the ward found the hold only when Print refused.
//
//   #1 rule    D.savedCalcVersionOf (moved from calculator.jsx), the hold, and
//              which order tags the infant: today's or tomorrow's Submitted order
//              that would print, on another version. Not an earlier day, a draft,
//              a No TPN order with nothing to print, or a current order.
//   #2 ward    the desktop table and the phone cards tag exactly those infants,
//              beside ✓ LOGGED, with a title that names the day and what to do
//   #3 print   the Print order list marks the held row, says why, opens the order
//              from it, and leaves it out of Print ทั้งหมด; a tap prints nothing
//              and the Calculator says why (its own calcMoved line)
//   #4 colour  Active's chip has its own green, apart from ✓ LOGGED's, in both
//              shells, on the ward list and the Dashboard
//
// Drives the real <App/> through review-0917-boot (dev-only deps as in
// test/README.md). Made-up infants only.
const fs = require('fs');
const { boot, runScenarios, mkPatient, TODAY, addDays, DIR } = require('./review-0917-boot.cjs');

const CONSTANTS_VERSION = fs.readFileSync(DIR + 'data.js', 'utf8').match(/const CONSTANTS_VERSION = "([^"]+)"/)[1];
const OLD = '2000-01-01.1';
const TOMORROW = addDays(TODAY, 1);
const YESTERDAY = addDays(TODAY, -1);
// A day's order with a bag, whose saved figures reproduce on reload.
const CI = { curWtG: 900, fluidTargetPerKg: 150, otherIV_mL: 0, drug_mL: 0, ioInput: 130, ioOutput: 60, drainContent: 0,
  totalTPN_mL: 110, dexPct: 12.5, aaPerKg: 3, lipidPerKg: 3, naCl: 2, kCl: 1, caPerKg: 60, glycophosP: 1, constantsVersion: CONSTANTS_VERSION };
const order = (entryId, extra = {}, ci = {}) => ({ entryId, lastModified: TODAY + 'T02:00:00.000Z', ts: TODAY, dol: 5,
  weight: 900, ioInput: 130, ioOutput: 60, drainContent: 0, status: 'submitted', calcInput: { ...CI, ...ci }, ...extra });
const unstamped = (ci) => { const c = { ...CI, ...ci }; delete c.constantsVersion; return c; };

const patients = [
  mkPatient({ sessionId: 'AA-1', name: 'AA', initials: 'AA', currentBed: 'NICU 1' }),  // today, current: prints
  mkPatient({ sessionId: 'CC-1', name: 'CC', initials: 'CC', currentBed: 'NICU 2' }),  // today, older: tagged
  mkPatient({ sessionId: 'DD-1', name: 'DD', initials: 'DD', currentBed: 'NICU 3' }),  // today current, tomorrow older: tagged
  mkPatient({ sessionId: 'EE-1', name: 'EE', initials: 'EE', currentBed: 'NICU 4' }),  // yesterday older only: not tagged
  mkPatient({ sessionId: 'FF-1', name: 'FF', initials: 'FF', currentBed: 'NICU 5' }),  // today, unstamped 2026-09-18.1: tagged
  mkPatient({ sessionId: 'GG-1', name: 'GG', initials: 'GG', currentBed: 'NICU 6' }),  // today, No TPN with nothing to print, older
  mkPatient({ sessionId: 'HH-1', name: 'HH', initials: 'HH', currentBed: 'NICU 7' }),  // today, a draft, older
  mkPatient({ sessionId: 'JJ-1', name: 'JJ', initials: 'JJ', currentBed: 'NICU 8', status: 'Discharged', statusDate: TODAY }),
  mkPatient({ sessionId: 'SS-1', name: 'SS', initials: 'SS', currentBed: 'SCN 1' }),   // SCN, today, older: tagged there
];
const log = {
  'AA-1': [order('e-aa')],
  'CC-1': [order('e-cc', {}, { constantsVersion: OLD })],
  'DD-1': [order('e-dd1'), order('e-dd2', { ts: TOMORROW }, { constantsVersion: OLD })],
  'EE-1': [order('e-ee', { ts: YESTERDAY }, { constantsVersion: OLD })],
  'FF-1': [{ ...order('e-ff'), calcInput: unstamped({ aaProduct: 'aminoven' }) }],
  'GG-1': [order('e-gg', {}, { noTpn: true, totalTPN_mL: 0, dexPct: 0, aaPerKg: 0, lipidPerKg: 0, naCl: 0, kCl: 0, caPerKg: 0, glycophosP: 0, constantsVersion: OLD })],
  'HH-1': [order('e-hh', { status: 'draft' }, { constantsVersion: OLD })],
  'JJ-1': [order('e-jj', {}, { constantsVersion: OLD })],
  'SS-1': [order('e-ss', {}, { constantsVersion: OLD })],
};

function setup() {
  const t = boot({ patients, log });
  t.quiet();
  t.printed = 0;
  t.window.print = () => { t.printed++; };
  return t;
}
const settle = async (t, n = 6) => { for (let i = 0; i < n; i++) await t.flush(); };
// The name cell: the card's .pmc-name, the table row's second cell.
const nameOf = (el) => (el.matches('tr') ? el.children[1]?.textContent : el.querySelector('.pmc-name')?.textContent || '')
  .replace(/Twin.*$/, '').trim();
const tagged = (sel) => [...document.querySelectorAll(sel)].filter(el => el.querySelector('.log-badge.is-resubmit')).map(nameOf).sort();
const printRows = () => [...document.querySelectorAll('.print-row')];
const printRow = (name) => printRows().find(r => r.querySelector('.pr-name')?.textContent.startsWith(name));
const printButtons = () => [...document.querySelectorAll('.ward-gate .ward-print')];

const scenarios = {
  async 'rule'(A) {
    console.log('\n── #1 the rule ──');
    const t = setup();
    await t.start();
    const D = t.D();
    A.eq('1.0 a stamped row reads its own version', D.savedCalcVersionOf(log['CC-1'][0]), OLD);
    A.eq('1.1 an unstamped row with aaProduct is 2026-09-18.1', D.savedCalcVersionOf(log['FF-1'][0]), '2026-09-18.1');
    A.eq('1.2 neither, or no calcInput, is null', [D.savedCalcVersionOf({ calcInput: { totalTPN_mL: 1 } }), D.savedCalcVersionOf({}), D.savedCalcVersionOf(null)], [null, null, null]);
    A.ok('1.3 the Calculator no longer keeps its own copy', !/function savedCalcVersionOf/.test(fs.readFileSync(DIR + 'calculator.jsx', 'utf8'))
      && /D\.savedCalcVersionOf\(editEntry\)/.test(fs.readFileSync(DIR + 'calculator.jsx', 'utf8')));
    A.eq('1.4 held: older and unstamped yes, current no, nothing no',
      [D.orderHeldForResubmit(log['CC-1'][0]), D.orderHeldForResubmit(log['FF-1'][0]), D.orderHeldForResubmit(log['AA-1'][0]), D.orderHeldForResubmit(null)],
      [true, true, false, false]);
    const due = (id) => D.resubmitDue(log[id], TODAY);
    A.eq('1.5 today\'s held order tags CC', [due('CC-1')?.entry.entryId, due('CC-1')?.tomorrow], ['e-cc', false]);
    A.eq('1.6 tomorrow\'s held order tags DD, though today\'s is current', [due('DD-1')?.entry.entryId, due('DD-1')?.tomorrow], ['e-dd2', true]);
    A.eq('1.7 the day after tomorrow is not asked yet', D.resubmitDue(log['DD-1'], YESTERDAY), null);
    A.eq('1.8 yesterday\'s held order does not (its bag has been given)', due('EE-1'), null);
    A.eq('1.9 an unstamped order of today does', due('FF-1')?.entry.entryId, 'e-ff');
    A.eq('1.10 a No TPN order with nothing to print does not', due('GG-1'), null);
    A.eq('1.11 a draft does not', due('HH-1'), null);
    A.eq('1.12 a current order does not', due('AA-1'), null);
    A.eq('1.13 no log, or a bad date, is null', [D.resubmitDue(undefined, TODAY), D.resubmitDue(log['CC-1'], 'not a date')], [null, null]);
    A.eq('1.14 no CONSTANTS_VERSION moved', D.CONSTANTS_VERSION, CONSTANTS_VERSION);
  },

  async 'ward'(A) {
    console.log('\n── #2 the ward list ──');
    const t = setup();
    await t.start();
    await t.pickWard('NICU');
    A.eq('2.0 the phone cards tag CC, DD and FF', tagged('.patient-card-list > .patient-mc'), ['CC', 'DD', 'FF']);
    A.eq('2.1 the desktop rows tag the same', tagged('.patient-table tbody tr'), ['CC', 'DD', 'FF']);
    const tag = (name) => [...document.querySelectorAll('.patient-table tbody tr')].find(r => nameOf(r) === name)?.querySelector('.log-badge.is-resubmit');
    A.eq('2.2 it reads ต้อง Submit ใหม่', tag('CC')?.textContent, 'ต้อง Submit ใหม่');
    A.ok('2.3 its title says today\'s order, why and what to do, with the phone call for a bag',
      /^order วันนี้บันทึกไว้ก่อน NeoFeed ปรับการคำนวณ ยังพิมพ์ไม่ได้/.test(tag('CC')?.title || '')
      && /กด Submit ใหม่ แล้วโทรบอกห้อง TPN$/.test(tag('CC')?.title || ''), tag('CC')?.title);
    A.ok('2.4 …and tomorrow\'s for DD', /^order พรุ่งนี้/.test(tag('DD')?.title || ''), tag('DD')?.title);
    A.ok('2.5 ✓ LOGGED stays beside it', [...document.querySelectorAll('.patient-table tbody tr')].filter(r => r.querySelector('.is-resubmit'))
      .every(r => /✓ LOGGED/.test(r.querySelector('.log-badge.is-logged')?.textContent || '')));
    A.ok('2.6 the discharged infant is not tagged', !tagged('.patient-table tbody tr, .patient-mc').includes('JJ'));
    await t.click(t.btn(/เปลี่ยน ward/));
    await t.pickWard('SCN');
    A.eq('2.7 SCN tags its own', tagged('.patient-table tbody tr'), ['SS']);
  },

  async 'print'(A) {
    console.log('\n── #3 the Print order list ──');
    const t = setup();
    await t.start();
    await t.click(printButtons()[0]);
    A.eq('3.0 today\'s Submitted orders are all listed', printRows().map(r => r.querySelector('.pr-name').textContent).sort(), ['AA', 'CC', 'DD', 'FF', 'GG']);
    const cc = printRow('CC');
    A.ok('3.1 the held row says ต้อง Submit ใหม่, not ✓ SUBMITTED', !!cc.querySelector('.log-badge.is-resubmit') && !cc.querySelector('.log-badge.is-logged'));
    A.ok('3.2 …says why and what to do', /NeoFeed ปรับการคำนวณหลังบันทึก order นี้ ยังพิมพ์ไม่ได้ · หมอเปิด order ดูตัวเลขที่เปลี่ยน กด Submit ใหม่ แล้วโทรบอกห้อง TPN/
      .test(cc.querySelector('.pr-resub-note')?.textContent || ''), cc.querySelector('.pr-resub-note')?.textContent);
    const ccBtn = cc.querySelector('button');
    A.ok('3.3 …and its button opens the order, not a print', /เปิด order เพื่อ Submit ใหม่/.test(ccBtn.textContent) && !ccBtn.classList.contains('primary') && !ccBtn.disabled);
    A.ok('3.4 the current row is unchanged', /✓ SUBMITTED/.test(printRow('AA').textContent) && printRow('AA').querySelector('button').classList.contains('primary')
      && !printRow('AA').querySelector('.pr-resub-note'));
    const all = t.btn(/Print ทั้งหมด/);
    A.ok('3.5 Print ทั้งหมด counts AA and DD only (CC and FF held, GG has nothing to print)', /\(2\)/.test(all?.textContent || ''), all?.textContent);
    const pick = (name) => printRow(name).parentElement.querySelector('.print-pick input');
    A.ok('3.6 the held rows have no tick; the printable ones do', !pick('CC') && !pick('FF') && !!pick('AA') && !!pick('DD'));

    await t.click(cc);
    await settle(t);
    await t.flush(1700);
    await settle(t);
    A.ok('3.7 a tap opens CC\'s saved order', /แก้ไขบันทึกโภชนาการ/.test(t.text()));
    A.eq('3.8 …prints nothing', t.printed, 0);
    A.ok('3.9 …and the Calculator says why, in its own words',
      t.toasts().some(m => /NeoFeed ปรับการคำนวณหลังคำสั่งนี้ถูกบันทึก — ตัวเลขบางรายการเปลี่ยน ตรวจสอบและบันทึกใหม่ก่อนพิมพ์/.test(m)), t.toasts());
  },

  async 'colour'(A) {
    console.log('\n── #4 Active has its own green ──');
    const css = fs.readFileSync(DIR + 'index.html', 'utf8');
    const token = (name) => (css.match(new RegExp(`--${name}:\\s*([^;]+);`)) || [])[1];
    A.ok('4.0 three --unit tokens, none equal to --ok\'s', ['unit-bg', 'unit-line', 'unit-ink'].every(n => token(n))
      && token('unit-ink') !== token('ok-ink') && token('unit-bg') !== token('ok-bg') && token('unit-line') !== token('ok-line'),
      ['unit-bg', 'unit-line', 'unit-ink', 'ok-ink'].map(token));
    A.ok('4.1 the status chip uses them', /\.chip\.chip-unit\.ok\s*\{[^}]*var\(--unit-ink\)[^}]*var\(--unit-line\)[^}]*var\(--unit-bg\)/.test(css));
    A.ok('4.2 ✓ LOGGED keeps --ok', /\.log-badge\.is-logged\s*\{[^}]*var\(--ok-ink\)/.test(css));
    A.ok('4.3 the red tag is styled', /\.log-badge\.is-resubmit\s*\{[^}]*var\(--crit-ink\)/.test(css));
    A.ok('4.4 the shells are still one file', css === fs.readFileSync(DIR + 'NeoFeed.html', 'utf8'));

    const t = setup();
    await t.start();
    await t.pickWard('NICU');
    // .chip.chip-tap: the status chip (the bed's button is .chip-tap-bed alone).
    const chips = [...document.querySelectorAll('.patient-table tbody tr .chip.chip-tap')];
    const active = chips.filter(c => /^Active/.test(c.textContent));
    A.ok('4.5 every status chip on the ward list carries chip-unit, and the seven Active ones are green',
      chips.every(c => c.classList.contains('chip-unit')) && active.length === 7 && active.every(c => c.classList.contains('ok')),
      [chips.length, active.length]);
    await t.openPatientRow(/AA/);
    await settle(t);
    const dash = [...document.querySelectorAll('.chip.chip-unit')].find(c => /Active/.test(c.textContent) && !c.classList.contains('chip-tap'));
    A.ok('4.6 …and so does the Dashboard\'s', !!dash && dash.classList.contains('ok'));
  },
};

runScenarios(__filename, 'RESUBMIT TAG + ACTIVE GREEN', scenarios);
