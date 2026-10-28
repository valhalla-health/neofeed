// verify-print-all-1028.cjs — Print ทั้งหมด on a ward's Print order list, and
// no Calculator button there (Pp, 2026-10-28).
//
// Pp, on a phone screenshot of "Print order · NICU":
//   "ให้หน้านี้ ทางขวาบนมีปุ่ม ปรินท์ทั้งหมด และไม่ต้องมีแคลคูเลเตอร์ด้านขวาล่าง"
//   — a Print all button at the top right, and no Calculator button at the
//   bottom right.
//
// Print ทั้งหมด opens the list's orders one at a time, in bed order, each
// exactly as a tap on its row does (verify-ward-print-1012.cjs #4–#6): the
// calculator's own Print gate, the edit lock, one print preview per order.
// The next order opens only on a tap, never on afterprint, because a browser
// need not wait for its print dialog before handing the page back.
//
//   #1 list     the button: top right of the head, counting the orders a tap
//               would print (no tmp_ row, no two-orders day); no Calculator
//               button on the list, still one on the ward gate and ward list
//   #2 run      each order prints once, on its own infant's sheet; afterprint
//               moves nothing; ถัดไป opens the next; the last leads back
//   #3 held     a colleague's lock holds that order's print, as a tap would;
//               ถัดไป still goes on to the next
//   #4 blocked  an order the Print gate holds back does not print, says why,
//               and ถัดไป still goes on
//   #5 leave    leaving the run ends it: a later tap on a row shows no bar
//   #6 none     nothing printable: the button is off; no orders: no button
//
// Drives the real <App/> through review-0917-boot (dev-only deps as in
// test/README.md).
const { boot, runScenarios, mkPatient, TODAY, addDays, DIR } = require('./review-0917-boot.cjs');

const CONSTANTS_VERSION = require('fs').readFileSync(DIR + 'data.js', 'utf8').match(/const CONSTANTS_VERSION = "([^"]+)"/)[1];
const CI = { curWtG: 900, fluidTargetPerKg: 150, otherIV_mL: 0, drug_mL: 0, ioInput: 130, ioOutput: 60, drainContent: 0,
  totalTPN_mL: 110, dexPct: 12.5, aaPerKg: 3, lipidPerKg: 3, naCl: 2, kCl: 1, caPerKg: 60, glycophosP: 1, constantsVersion: CONSTANTS_VERSION };
const order = (entryId, extra = {}, ci = {}) => ({ entryId, lastModified: TODAY + 'T02:00:00.000Z', ts: TODAY, dol: 5,
  weight: 900, ioInput: 130, ioOutput: 60, drainContent: 0, status: 'submitted', calcInput: { ...CI, ...ci }, ...extra });

const patients = [
  mkPatient({ sessionId: 'AA-1', name: 'AA', initials: 'AA', currentBed: 'NICU 1' }),   // submitted today
  mkPatient({ sessionId: 'BB-1', name: 'BB', initials: 'BB', currentBed: 'NICU 2' }),   // submitted today
  mkPatient({ sessionId: 'CC-1', name: 'CC', initials: 'CC', currentBed: 'NICU 3' }),   // draft today
  mkPatient({ sessionId: 'DD-1', name: 'DD', initials: 'DD', currentBed: 'NICU 4' }),   // submitted today
  mkPatient({ sessionId: 'EE-1', name: 'EE', initials: 'EE', currentBed: 'NICU 5' }),   // today, still tmp_
  mkPatient({ sessionId: 'FF-1', name: 'FF', initials: 'FF', currentBed: 'NICU 6' }),   // two orders today
  mkPatient({ sessionId: 'SS-1', name: 'SS', initials: 'SS', currentBed: 'SCN 1' }),    // K 6, no reason
  mkPatient({ sessionId: 'TT-1', name: 'TT', initials: 'TT', currentBed: 'SCN 2' }),    // submitted today
  mkPatient({ sessionId: 'XX-1', name: 'XX', initials: 'XX', currentBed: '' }),         // other: tmp_ only
  mkPatient({ sessionId: 'YY-1', name: 'YY', initials: 'YY', currentBed: '' }),         // other: two orders
];
const log = {
  'AA-1': [order('e-aa')],
  'BB-1': [order('e-bb')],
  'CC-1': [order('e-cc', { status: 'draft' })],
  'DD-1': [order('e-dd'), order('e-dd0', { ts: addDays(TODAY, -1) })],
  'EE-1': [order('tmp_1726540000000_abc')],
  'FF-1': [order('e-ff1'), order('e-ff2', { lastModified: TODAY + 'T03:00:00.000Z' })],
  'SS-1': [order('e-ss', {}, { kCl: 6 })],   // above the 5.0 IV K hard limit
  'TT-1': [order('e-tt')],
  'XX-1': [order('tmp_1726540000001_xyz')],
  'YY-1': [order('e-yy1'), order('e-yy2', { lastModified: TODAY + 'T03:00:00.000Z' })],
};

function setup() {
  const t = boot({ patients, log });
  t.quiet();
  t.printed = 0;
  t.window.print = () => { t.printed++; };
  return t;
}
const settle = async (t, n = 6) => { for (let i = 0; i < n; i++) await t.flush(); };
const printRows = () => [...document.querySelectorAll('.print-row')];
const printRow = (name) => printRows().find(r => r.querySelector('.pr-name')?.textContent === name);
const wardPrint = (ward) => [...document.querySelectorAll('.ward-gate .ward-print')].find(b => b.getAttribute('aria-label').startsWith('Print order ' + ward));
const printAll = () => document.querySelector('.page-head.print-head > .print-all');
const bar = () => document.querySelector('.print-all-bar');
const fab = () => document.querySelector('.quick-fab');
// The printed sheet's patient table: the form's first direct <table> child
// (REFERENCE.md § The printed order), which carries the NeoFeed ID.
const sheetPatient = () => document.querySelector('#print-form > table')?.textContent || '';
const sheetIs = (id) => new RegExp(`NeoFeed ID:\\s*${id}\\b`).test(sheetPatient());
const openedIs = (id) => /แก้ไขบันทึกโภชนาการ/.test(document.body.textContent) && sheetIs(id);

const scenarios = {
  async 'list'(A) {
    console.log('\n── #1 the button, and no Calculator button on the list ──');
    const t = setup();
    await t.start();
    A.ok('1.0 the ward gate still has the Calculator button', !!fab());
    await t.pickWard('NICU');
    A.ok('1.1 …and so does the ward list', !!fab() && document.querySelector('.app').classList.contains('has-quick-fab'));
    await t.click(t.btn(/เปลี่ยน ward/));
    await t.click(wardPrint('NICU'));
    A.ok('1.2 NICU\'s print list is open', /Print order · NICU/.test(t.text()));
    A.ok('1.3 no Calculator button on it', !fab() && !document.querySelector('.app').classList.contains('has-quick-fab'));
    const b = printAll();
    A.ok('1.4 a Print ทั้งหมด button in the head', !!b && /Print ทั้งหมด/.test(b.textContent));
    A.ok('1.5 …after the title block, so it sits at the top right',
      !!b && b.previousElementSibling?.querySelector('h1')?.textContent === 'Print order · NICU' && !b.nextElementSibling);
    A.ok('1.6 …and ← กลับ moved under the title, not beside it',
      !!b && /← กลับ/.test(b.previousElementSibling.textContent) && !/← กลับ/.test(b.textContent));
    A.eq('1.7 it counts what a tap would print: AA, BB, DD (not the tmp_ or two-orders row)',
      b && b.querySelector('.num').textContent, '(3)');
    A.ok('1.8 …enabled', b && !b.disabled);
    A.ok('1.9 …and nothing has printed yet', t.printed === 0 && !bar());
  },

  async 'run'(A) {
    console.log('\n── #2 one order after another ──');
    const t = setup();
    await t.start();
    // Another infant is active first: the run must open the list's own orders.
    await t.pickWard('NICU');
    await t.openPatientRow(/CC/);
    await t.rail(/Patients/);
    await t.click(t.btn(/เปลี่ยน ward/));
    await t.click(wardPrint('NICU'));
    await t.click(printAll());
    await settle(t);
    A.ok('2.0 the first order in bed order (AA) opens in the calculator', openedIs('AA-1'));
    A.eq('2.1 …and its print preview opens once', t.printed, 1);
    A.ok('2.2 the bar says which of the run it is', /Print ทั้งหมด · ใบที่ 1 จาก 3/.test(bar()?.textContent || ''));
    A.ok('2.3 …and names the next one', /ถัดไป: NICU 2 BB/.test(bar()?.textContent || ''));
    // The dialog closing hands nothing on: only a tap does.
    t.window.onafterprint?.();
    t.window.dispatchEvent(new t.window.Event('afterprint'));
    await settle(t);
    await t.flush(1700);
    await settle(t);
    A.ok('2.4 afterprint does not move on to the next order', openedIs('AA-1') && t.printed === 1);
    await t.tick();
    await settle(t);
    A.eq('2.5 a re-render or a sync prints nothing again', t.printed, 1);

    await t.click(t.btn(/ถัดไป: NICU 2 BB/));
    await settle(t);
    A.ok('2.6 ถัดไป opens BB\'s order', openedIs('BB-1') && !sheetIs('AA-1'));
    A.eq('2.7 …and prints it once', t.printed, 2);
    A.ok('2.8 the bar moved on', /ใบที่ 2 จาก 3/.test(bar()?.textContent || '') && /ถัดไป: NICU 4 DD/.test(bar().textContent));

    await t.click(t.btn(/ถัดไป: NICU 4 DD/));
    await settle(t);
    A.ok('2.9 DD\'s order for today, not yesterday\'s', openedIs('DD-1')
      && !/DOL \d+ · /.test(document.querySelector('.page-head h1')?.textContent || ''));
    A.eq('2.10 …printed once', t.printed, 3);
    const done = t.btn(/ครบ 3 ใบ · กลับไปรายการ/);
    A.ok('2.11 the last offers the way back, not a next', /ใบที่ 3 จาก 3/.test(bar()?.textContent || '') && !!done && !t.btn(/ถัดไป:/));
    await t.click(done);
    await settle(t);
    A.ok('2.12 …which is NICU\'s list again', /Print order · NICU/.test(t.text()) && printRows().length === 5);
    A.ok('2.13 with no bar left and nothing more printed', !bar() && t.printed === 3);

    await t.click(printAll());
    await settle(t);
    A.ok('2.14 Print ทั้งหมด again starts over from the first', openedIs('AA-1') && t.printed === 4
      && /ใบที่ 1 จาก 3/.test(bar()?.textContent || ''));
  },

  async 'held'(A) {
    console.log('\n── #3 a colleague has one of the orders open ──');
    const t = setup();
    t.server.hooks.acquireLogLock = (b) => (b.sessionId === 'AA-1'
      ? { reply: { ok: true, locked: true, holder: { name: 'Dr B' } } } : undefined);
    await t.start();
    await t.click(wardPrint('NICU'));
    await t.click(printAll());
    await settle(t);
    await t.flush(1700);
    await settle(t);
    A.eq('3.0 AA\'s preview is held, as a tap on its row would be', t.printed, 0);
    A.ok('3.1 …the page says who has it open', /Dr B กำลังเปิดบันทึกวันที่/.test(t.text())
      && t.toasts().some(m => /ไม่ได้เปิดหน้าพิมพ์อัตโนมัติ — Dr B/.test(m)));
    A.ok('3.2 the bar still offers the next order', /ใบที่ 1 จาก 3/.test(bar()?.textContent || '') && !!t.btn(/ถัดไป: NICU 2 BB/));
    await t.click(t.btn(/ถัดไป: NICU 2 BB/));
    await settle(t);
    A.ok('3.3 …which opens and prints BB\'s', openedIs('BB-1') && t.printed === 1);
  },

  async 'blocked'(A) {
    console.log('\n── #4 an order the Print gate holds back ──');
    const t = setup();
    await t.start();
    await t.click(wardPrint('SCN'));
    A.eq('4.0 SCN\'s list', printRows().map(r => r.querySelector('.pr-name').textContent), ['SS', 'TT']);
    await t.click(printAll());
    await settle(t);
    await t.flush(1700);
    await settle(t);
    A.eq('4.1 SS\'s critical value with no reason does not print', t.printed, 0);
    A.ok('4.2 …and says why, as Print order inside does',
      t.toasts().some(m => /มีค่าวิกฤตที่ยังไม่ได้ระบุเหตุผล — บันทึกพร้อมเหตุผลก่อนพิมพ์/.test(m)));
    A.ok('4.3 ถัดไป still goes on', !!t.btn(/ถัดไป: SCN 2 TT/));
    await t.click(t.btn(/ถัดไป: SCN 2 TT/));
    await settle(t);
    A.ok('4.4 …and TT\'s prints', openedIs('TT-1') && t.printed === 1);
  },

  async 'leave'(A) {
    console.log('\n── #5 leaving the run ends it ──');
    const t = setup();
    await t.start();
    await t.click(wardPrint('NICU'));
    await t.click(printAll());
    await settle(t);
    await t.click(t.btn(/กลับไปรายการ Print order/));
    await settle(t);
    A.ok('5.0 ← back on the page returns to the list', /Print order · NICU/.test(t.text()) && !bar());
    await t.click(printRow('BB'));
    await settle(t);
    A.ok('5.1 a tap on a row afterwards is a single order, with no bar', openedIs('BB-1') && !bar() && t.printed === 2);
    await t.click(t.btn(/กลับไปรายการ Print order/));
    await t.click(printAll());
    await settle(t);
    await t.rail(/Patients/);
    await settle(t);
    A.ok('5.2 the rail during a run goes to the ward gate', !!document.querySelector('.ward-gate') && !bar());
    await t.click(wardPrint('NICU'));
    await t.click(printRow('AA'));
    await settle(t);
    A.ok('5.3 …and the run is over there too', openedIs('AA-1') && !bar());
  },

  async 'none'(A) {
    console.log('\n── #6 nothing to print ──');
    const t = setup();
    await t.start();
    await t.click(wardPrint('อื่นๆ'));
    A.ok('6.0 อื่นๆ lists a saving row and a two-orders day', printRows().length === 2);
    A.ok('6.1 Print ทั้งหมด is there but off, counting none', !!printAll() && printAll().disabled
      && printAll().querySelector('.num').textContent === '(0)');
    await t.click(printAll());
    await settle(t);
    A.ok('6.2 …and a tap on it does nothing', /Print order · อื่นๆ/.test(t.text()) && t.printed === 0);
  },
};

// A ward with no order today shows no button at all: SCN once its two infants
// are discharged would be empty, so it is checked on a fixture of its own.
scenarios['empty'] = async (A) => {
  console.log('\n── #6b a ward with no submitted order ──');
  const t = boot({ patients: [mkPatient({ sessionId: 'QQ-1', name: 'QQ', initials: 'QQ', currentBed: 'NICU 1' })], log: {} });
  t.quiet();
  await t.start();
  await t.click(wardPrint('NICU'));
  A.ok('6.3 the list says there is nothing submitted', /ยังไม่มีใบสั่งที่ Submit วันนี้ใน NICU/.test(t.text()));
  A.ok('6.4 …with no Print ทั้งหมด and no Calculator button', !printAll() && !fab());
};

runScenarios(__filename, 'PRINT ALL + NO CALCULATOR ON THE PRINT LIST', scenarios);
