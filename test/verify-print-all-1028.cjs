// verify-print-all-1028.cjs — Print ทั้งหมด on a ward's Print order list, and
// no Calculator button there (Pp, 2026-10-28).
//
// Pp, on a phone screenshot of "Print order · NICU":
//   "ให้หน้านี้ ทางขวาบนมีปุ่ม ปรินท์ทั้งหมด และไม่ต้องมีแคลคูเลเตอร์ด้านขวาล่าง"
//   — a Print all button at the top right, and no Calculator button at the
//   bottom right.
//
// Print ทั้งหมด is one print job (Pp, 2026-11-06: "ถ้ากดปริ้นท์ทั้งหมดแล้วไม่ต้อง
// เข้ามากดทีละคนอีกได้ไหม ให้ปริ้นออกมาเลย"). The run still opens the list's
// orders one at a time, in bed order, each exactly as a tap on its row does
// (verify-ward-print-1012.cjs #4–#6): the calculator's own Print gate and the
// edit lock. But it takes a copy of each sheet instead of printing it, goes on
// by itself, and opens one print dialog at the end. No dialog opens while an
// order is open, so the page never moves on under one.
//
//   #1 list     the button: top right of the head, counting the orders a tap
//               would print (no tmp_ row, no two-orders day); no Calculator
//               button on the list, still one on the ward gate and ward list
//   #2 run      one tap: each order collected in bed order, the bar saying
//               which; one dialog, by itself, with every sheet in bed order,
//               each its own infant's and entry's; afterprint and a sync print
//               nothing more; พิมพ์ N ใบ prints again; ← กลับไปรายการ
//   #3 held     a colleague's lock keeps that order out, named with who; any
//               order held back means the dialog waits for a tap
//   #4 blocked  an order the Print gate holds back is left out, with why
//   #5 leave    ยกเลิก, or leaving by the rail, ends the run with no job
//   #6 none     nothing printable: the button is off; no orders: no button
//   #7 pick     Pp's second ask, "ให้สามารถมีปุ่มซีเล็กเป็น คน ๆ ไปได้หรือ
//               ซีเล็กออลก็ได้": a tick per printable row, เลือกทั้งหมด, and
//               the job is the ticked orders only
//   #9 no TPN   Pp, 2026-11-01: "ถ้า ไม่มี tpn เราก็จะไม่ปริ้นท order". An order
//               ticked "No TPN", or a submitted one from before the tick with
//               no TPN, is marked "No TPN — ไม่ต้องพิมพ์" with no Print button,
//               a tap does nothing, and Print ทั้งหมด leaves it out. One with
//               oral orders, on the day TPN stopped, or cancelling a TPN order
//               of the same day (a No TPN revision, calcInput.replacesTpn)
//               prints its short sheet
//   #8 resync   Vera, 2026-10-28: each queued order is asked the list's rule
//               again before it opens; one a sync took off the list (a second
//               order that day, discharged, deleted, moved ward, the day
//               rolled over) is skipped by name. #8e: an order that never
//               answers is skipped by name. #8f: a sheet that does not name the
//               order opened is never taken
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
  t.printedSheets = [];
  t.window.print = () => { t.printed++; t.printedSheets = batchSheets().map(s => s.getAttribute('data-session-id')); };
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
const pick = (name) => printRow(name)?.parentElement.querySelector('.print-pick input') || null;
const pickAll = () => document.querySelector('.print-pick-all input');
// Print ทั้งหมด's one job (registry.jsx WardPrintBatch).
const batch = () => document.querySelector('.print-batch');
const batchSheets = () => [...document.querySelectorAll('.print-batch > .print-batch-sheet')];
const skipped = () => document.querySelector('.print-batch-skipped')?.textContent || '';
const listed = () => [...document.querySelectorAll('.print-batch-list li')].map(li => li.textContent);
// The job holds exactly these [sessionId, entryId] sheets, in this order, and
// each one's own patient table names that infant.
const sheetsMatch = (...want) => {
  const got = batchSheets();
  return got.length === want.length && got.every((s, i) => s.getAttribute('data-session-id') === want[i][0]
    && s.getAttribute('data-entry-id') === want[i][1]
    && new RegExp(`NeoFeed ID:\\s*${want[i][0]}\\b`).test(s.querySelector(':scope > table')?.textContent || ''));
};
// The run goes on by itself: wait for its job to show (a held order takes the
// calculator's 1.5 s wait).
const runDone = async (t, max = 120) => { for (let i = 0; i < max && !batch(); i++) await t.flush(30); await settle(t); };
// Hold one infant's edit-lock reply until released, so the run waits on it.
const holdLock = (t, sid) => {
  let release, used = false;
  const p = new Promise(r => { release = r; });
  t.server.hooks.acquireLogLock = (b) => (b.sessionId === sid && !used ? (used = true, { hold: p }) : undefined);
  return () => release();
};
// What the bar said during a run, and any print dialog opened while an order was open.
const watchBar = (t) => {
  const seen = { texts: [], printsWhileOpen: 0 };
  const mo = new t.window.MutationObserver(() => { const b = bar(); if (b && seen.texts[seen.texts.length - 1] !== b.textContent) seen.texts.push(b.textContent); });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  const print = t.window.print;
  t.window.print = () => { if (document.getElementById('print-form')) seen.printsWhileOpen++; print(); };
  seen.stop = () => { mo.disconnect(); t.window.print = print; };
  return seen;
};

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
    console.log('\n── #2 one tap, one print job ──');
    const t = setup();
    await t.start();
    // Another infant is active first: the run must open the list's own orders.
    await t.pickWard('NICU');
    await t.openPatientRow(/CC/);
    await t.rail(/Patients/);
    await t.click(t.btn(/เปลี่ยน ward/));
    await t.click(wardPrint('NICU'));
    const seen = watchBar(t);
    await t.click(printAll());
    await runDone(t);
    seen.stop();
    A.ok('2.0 the run collected each order in bed order, saying which, with nothing to tap',
      seen.texts.some(x => /กำลังเตรียม Print ทั้งหมด · ใบที่ 1 จาก 3 · NICU 1 AA/.test(x))
      && seen.texts.some(x => /ใบที่ 2 จาก 3 · NICU 2 BB/.test(x)) && seen.texts.some(x => /ใบที่ 3 จาก 3 · NICU 4 DD/.test(x))
      && !seen.texts.some(x => /ถัดไป/.test(x)), seen.texts);
    A.eq('2.1 no print dialog opened while an order was open', seen.printsWhileOpen, 0);
    A.ok('2.2 the run ends on NICU\'s one print job', /Print ทั้งหมด · NICU/.test(t.text()) && !!batch() && !bar());
    A.eq('2.3 its print dialog opened once, by itself', t.printed, 1);
    A.eq('2.4 …holding the three sheets, in bed order', t.printedSheets, ['AA-1', 'BB-1', 'DD-1']);
    A.ok('2.5 each sheet names its own infant and today\'s entry (DD\'s, not yesterday\'s)', sheetsMatch(['AA-1', 'e-aa'], ['BB-1', 'e-bb'], ['DD-1', 'e-dd']));
    A.ok('2.6 each is the doctor\'s sheet as the calculator renders it', batchSheets().every(s => s.querySelector('.print-sign') && /PEDIATRIC PARENTERAL NUTRITION ORDER FORM|NeoFeed ID/.test(s.textContent)));
    A.ok('2.7 no #print-form, and no calculator, is left behind', !document.getElementById('print-form') && !/แก้ไขบันทึกโภชนาการ/.test(t.text()));
    A.ok('2.8 the page lists the three and holds nothing back',
      listed().join('|') === '✓ NICU 1 AA|✓ NICU 2 BB|✓ NICU 4 DD' && !skipped() && /พร้อมพิมพ์ 3 จาก 3 ใบ/.test(t.text()), listed());
    t.window.onafterprint?.();
    t.window.dispatchEvent(new t.window.Event('afterprint'));
    await t.tick();
    await settle(t);
    A.ok('2.9 afterprint, a re-render or a sync prints nothing again', t.printed === 1 && !!batch());
    await t.click(t.btn(/พิมพ์ 3 ใบ/));
    await settle(t);
    A.ok('2.10 พิมพ์ 3 ใบ prints the same job again, on a tap', t.printed === 2 && t.printedSheets.join() === 'AA-1,BB-1,DD-1');
    await t.click(t.btn(/← กลับไปรายการ/));
    await settle(t);
    A.ok('2.11 ← กลับไปรายการ is NICU\'s list again, with nothing more printed',
      /Print order · NICU/.test(t.text()) && printRows().length === 5 && !batch() && t.printed === 2);
    await t.click(printAll());
    await runDone(t);
    A.ok('2.12 Print ทั้งหมด again starts over, and prints once more', t.printed === 3 && t.printedSheets.join() === 'AA-1,BB-1,DD-1');
  },

  async 'held'(A) {
    console.log('\n── #3 a colleague has one of the orders open ──');
    const t = setup();
    t.server.hooks.acquireLogLock = (b) => (b.sessionId === 'AA-1' || b.sessionId === 'DD-1'
      ? { reply: { ok: true, locked: true, holder: { name: 'Dr B' } } } : undefined);
    await t.start();
    await t.click(wardPrint('NICU'));
    await t.click(printAll());
    await runDone(t);
    A.ok('3.0 AA and DD are not in the job, as a tap on their rows would not print them',
      sheetsMatch(['BB-1', 'e-bb']), batchSheets().map(s => s.getAttribute('data-session-id')));
    A.ok('3.1 the page names each, and who has it open',
      /NICU 1 AA — Dr B กำลังเปิดบันทึกนี้อยู่/.test(skipped()) && /NICU 4 DD — Dr B กำลังเปิดบันทึกนี้อยู่/.test(skipped()), skipped());
    A.eq('3.2 with one held back, the dialog waits for a tap: the nurse sees the list first', t.printed, 0);
    A.ok('3.3 …and the count says 1 of 3', /พร้อมพิมพ์ 1 จาก 3 ใบ · ข้าม 2 ใบ/.test(t.text()));
    await t.click(t.btn(/พิมพ์ 1 ใบ/));
    await settle(t);
    A.ok('3.4 พิมพ์ 1 ใบ prints BB\'s alone', t.printed === 1 && t.printedSheets.join() === 'BB-1');
  },

  async 'blocked'(A) {
    console.log('\n── #4 an order the Print gate holds back ──');
    const t = setup();
    await t.start();
    await t.click(wardPrint('SCN'));
    A.eq('4.0 SCN\'s list', printRows().map(r => r.querySelector('.pr-name').textContent), ['SS', 'TT']);
    await t.click(printAll());
    await runDone(t);
    A.ok('4.1 SS\'s critical value with no reason is not in the job', sheetsMatch(['TT-1', 'e-tt']));
    A.ok('4.2 …and the page says why, as Print order inside does',
      /SCN 1 SS — มีค่าวิกฤตที่ยังไม่ได้ระบุเหตุผล — บันทึกพร้อมเหตุผลก่อนพิมพ์/.test(skipped()), skipped());
    A.eq('4.3 nothing printed before the nurse has seen it', t.printed, 0);
    await t.click(t.btn(/พิมพ์ 1 ใบ/));
    await settle(t);
    A.ok('4.4 …then TT\'s prints', t.printed === 1 && t.printedSheets.join() === 'TT-1');
  },

  async 'leave'(A) {
    console.log('\n── #5 leaving the run ends it ──');
    const t = setup();
    const release = holdLock(t, 'BB-1');
    await t.start();
    await t.click(wardPrint('NICU'));
    await t.click(printAll());
    await settle(t);
    A.ok('5.0 mid-run, BB is open with the bar, and ยกเลิก on it', openedIs('BB-1') && /ใบที่ 2 จาก 3/.test(bar()?.textContent || '') && !!t.btn(/^ยกเลิก$/));
    await t.click(t.btn(/^ยกเลิก$/));
    release();
    await settle(t);
    await t.flush(200);
    A.ok('5.1 ยกเลิก returns to the list, prints nothing and leaves no job', /Print order · NICU/.test(t.text()) && !bar() && !batch() && t.printed === 0);
    await t.click(printRow('BB'));
    await settle(t);
    A.ok('5.2 a tap on a row afterwards is a single order, with no bar, printed at once', openedIs('BB-1') && !bar() && t.printed === 1);
    await t.click(t.btn(/กลับไปรายการ Print order/));
    const release2 = holdLock(t, 'BB-1');
    await t.click(printAll());
    await settle(t);
    await t.rail(/Patients/);
    release2();
    await settle(t);
    await t.flush(200);
    A.ok('5.3 the rail during a run goes to the ward gate, and the run never comes back', !!document.querySelector('.ward-gate') && !bar() && !batch() && t.printed === 1);
    await t.click(wardPrint('NICU'));
    await t.click(printRow('AA'));
    await settle(t);
    A.ok('5.4 …and the run is over there too', openedIs('AA-1') && !bar() && t.printed === 2);
    await t.click(t.btn(/กลับไปรายการ Print order/));
    await t.click(printAll());
    await runDone(t);
    await t.click(t.btn(/← กลับไปรายการ/));
    await t.click(t.btn(/← กลับ$/));
    await settle(t);
    await t.click(wardPrint('NICU'));
    A.ok('5.5 a finished job is gone once the list is left', /Print order · NICU/.test(t.text()) && !batch());
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

scenarios['pick'] = async (A) => {
  console.log('\n── #7 tick one by one, or เลือกทั้งหมด ──');
  const t = setup();
  await t.start();
  await t.click(wardPrint('NICU'));
  A.ok('7.0 each printable row has a tick, ticked; the saving and two-orders rows have none',
    ['AA', 'BB', 'DD'].every(n => pick(n)?.checked) && !pick('EE') && !pick('FF'));
  A.ok('7.1 …each named for its infant', pick('BB').getAttribute('aria-label') === 'เลือก NICU 2 BB');
  A.ok('7.2 เลือกทั้งหมด is ticked, and the button reads Print ทั้งหมด (3)',
    pickAll()?.checked && /Print ทั้งหมด \(3\)/.test(printAll().textContent));
  A.ok('7.3 the tick is beside the card, not inside the card\'s button', !printRow('BB').querySelector('input'));
  await t.click(pick('BB'));
  A.ok('7.4 unticking BB opens and prints nothing', t.printed === 0 && /Print order · NICU/.test(t.text()) && !pick('BB').checked);
  A.ok('7.5 …the button reads Print ที่เลือก (2)', /Print ที่เลือก \(2\)/.test(printAll().textContent) && !printAll().disabled);
  A.ok('7.6 …and เลือกทั้งหมด is part-ticked, counting 2 of 3',
    !pickAll().checked && pickAll().indeterminate
    && /เลือกแล้ว 2 จาก 3 ใบ/.test(document.querySelector('.print-pick-all').textContent));
  await t.click(pickAll());
  A.ok('7.7 เลือกทั้งหมด ticks every one again', ['AA', 'BB', 'DD'].every(n => pick(n).checked)
    && pickAll().checked && !pickAll().indeterminate && /Print ทั้งหมด \(3\)/.test(printAll().textContent));
  await t.click(pickAll());
  A.ok('7.8 …a second tap clears them all, and Print is off', ['AA', 'BB', 'DD'].every(n => !pick(n).checked)
    && printAll().disabled && /\(0\)/.test(printAll().textContent));
  await t.click(pick('DD'));
  await t.click(pick('AA'));
  A.ok('7.9 ticked one by one: Print ที่เลือก (2)', /Print ที่เลือก \(2\)/.test(printAll().textContent) && !pick('BB').checked);
  await t.click(printAll());
  await runDone(t);
  A.ok('7.10 the job is the ticked ones, in bed order: AA then DD, never the unticked BB',
    sheetsMatch(['AA-1', 'e-aa'], ['DD-1', 'e-dd']) && t.printed === 1 && t.printedSheets.join() === 'AA-1,DD-1');
  await t.click(t.btn(/← กลับไปรายการ/));
  await settle(t);
  A.ok('7.11 back on the list, every order is ticked again', ['AA', 'BB', 'DD'].every(n => pick(n)?.checked)
    && /Print ทั้งหมด \(3\)/.test(printAll().textContent));
  await t.click(printRow('BB'));
  await settle(t);
  A.ok('7.12 a tap on a row still prints that one order', openedIs('BB-1') && t.printed === 2 && !bar());
};

scenarios['resync'] = async (A) => {
  console.log('\n── #8 a sync during the run takes an order off the list ──');
  const t = setup();
  const release = holdLock(t, 'AA-1');
  await t.start();
  await t.click(wardPrint('NICU'));
  await t.click(printAll());
  await settle(t);
  A.ok('8.0 AA is open, its lock reply not back yet', openedIs('AA-1') && /ใบที่ 1 จาก 3/.test(bar()?.textContent || ''));
  // BB gains a second Submitted order today: the list leaves that day for a
  // person to choose, so the run must not print e-bb on its own.
  t.server.log['BB-1'].push(order('e-bb2', { lastModified: TODAY + 'T04:00:00.000Z' }));
  const before = t.syncCalls().length;
  await t.click(t.syncButton());
  await settle(t);
  A.ok('8.1 (a sync brought it in)', t.syncCalls().length > before);
  release();
  await runDone(t);
  A.ok('8.2 BB is not in the job; AA and DD are', sheetsMatch(['AA-1', 'e-aa'], ['DD-1', 'e-dd']));
  A.ok('8.3 …and the page names BB as skipped', /NICU 2 BB — ไม่อยู่ในรายการ Print order แล้ว/.test(skipped()), skipped());
  A.eq('8.4 …so the dialog waits for a tap', t.printed, 0);
};

scenarios['gone'] = async (A) => {
  console.log('\n── #8b the rest of the run is gone by the time it is reached ──');
  const t = setup();
  const release = holdLock(t, 'AA-1');
  await t.start();
  await t.click(wardPrint('NICU'));
  await t.click(printAll());
  await settle(t);
  // BB's order deleted, DD discharged.
  t.server.log['BB-1'] = [];
  t.server.patients.find(p => p.sessionId === 'DD-1').status = 'Discharged';
  t.server.patients.find(p => p.sessionId === 'DD-1').statusDate = TODAY;
  await t.click(t.syncButton());
  await settle(t);
  release();
  await runDone(t);
  A.ok('8.5 only AA is in the job', sheetsMatch(['AA-1', 'e-aa']));
  A.ok('8.6 BB and DD are each named as skipped', /NICU 2 BB — ไม่อยู่ในรายการ/.test(skipped()) && /NICU 4 DD — ไม่อยู่ในรายการ/.test(skipped()), skipped());
  await t.click(t.btn(/← กลับไปรายการ/));
  await t.click(printRow('AA'));
  await settle(t);
  A.ok('8.7 …and the run is over: a tap on AA is a single order', openedIs('AA-1') && !bar() && t.printed === 1);
};

// Vera's second review (2026-10-28): the two remaining claims of the re-check,
// a move to another ward and the day rolling over.
scenarios['moved'] = async (A) => {
  console.log('\n── #8c an infant moved to another ward during the run ──');
  const t = setup();
  const release = holdLock(t, 'AA-1');
  await t.start();
  await t.click(wardPrint('NICU'));
  await t.click(printAll());
  await settle(t);
  t.server.patients.find(p => p.sessionId === 'BB-1').currentBed = 'SCN 3';
  await t.click(t.syncButton());
  await settle(t);
  release();
  await runDone(t);
  A.ok('8.8 BB, now in SCN, is skipped by name and not in the job',
    sheetsMatch(['AA-1', 'e-aa'], ['DD-1', 'e-dd']) && /NICU 2 BB — ไม่อยู่ในรายการ Print order แล้ว/.test(skipped()), skipped());
};

scenarios['midnight'] = async (A) => {
  console.log('\n── #8d the day rolls over during the run ──');
  const t = setup();
  const release = holdLock(t, 'AA-1');
  await t.start();
  await t.click(wardPrint('NICU'));
  await t.click(printAll());
  await settle(t);
  t.clock.advance(24 * 3600e3);
  release();
  await runDone(t);
  A.ok('8.9 yesterday\'s BB and DD are each skipped by name',
    /NICU 2 BB/.test(skipped()) && /NICU 4 DD/.test(skipped()) && !batchSheets().some(s => /BB-1|DD-1/.test(s.getAttribute('data-session-id'))), skipped());
};

// An order whose lock reply never comes is skipped after a while, by name, and
// the run still finishes (app.jsx PRINT_ALL_STEP_MS, shrunk here).
scenarios['stuck'] = async (A) => {
  console.log('\n── #8e an order that never answers ──');
  const t = setup();
  // AA's lock request is under way when its reply is asked for, so the next
  // two long timers set are AA's lock release, as its calculator closes, and
  // the run's wait on BB, the order after it.
  t.server.hooks.acquireLogLock = (b) => {
    if (b.sessionId === 'AA-1') { t.timeouts.shrinkNext(2); return undefined; }
    return b.sessionId === 'BB-1' ? { hang: true } : undefined;
  };
  await t.start();
  await t.click(wardPrint('NICU'));
  await t.click(printAll());
  await runDone(t);
  A.ok('8.10 BB is skipped by name; AA and DD are in the job',
    sheetsMatch(['AA-1', 'e-aa'], ['DD-1', 'e-dd']) && /NICU 2 BB — เปิดใบสั่งไม่สำเร็จภายในเวลา/.test(skipped()), skipped());
};

// The run takes a sheet only if it names the order it opened. A sheet for any
// other infant or entry is that order skipped, never printed under its name.
scenarios['mismatch'] = async (A) => {
  console.log('\n── #8f a sheet that is not the order opened ──');
  const t = setup();
  await t.start();
  await t.click(wardPrint('NICU'));
  // Every #print-form BB's calculator renders claims another entry.
  const realGet = t.window.document.getElementById.bind(t.window.document);
  t.window.document.getElementById = (id) => {
    const el = realGet(id);
    if (id === 'print-form' && el && el.getAttribute('data-session-id') === 'BB-1') el.setAttribute('data-entry-id', 'e-other');
    return el;
  };
  await t.click(printAll());
  await runDone(t);
  t.window.document.getElementById = realGet;
  A.ok('8.11 BB\'s sheet is not in the job, and BB is named as skipped',
    sheetsMatch(['AA-1', 'e-aa'], ['DD-1', 'e-dd']) && /NICU 2 BB — ยังพิมพ์ไม่ได้/.test(skipped()), skipped());
};

// Vera, 2026-11-06 (BLOCK): a job waiting for its tap prints only sheets that
// are still the infant's order now. A sheet revised since it was copied, or a
// job left on screen past midnight, must not reach pharmacy.
scenarios['revised'] = async (A) => {
  console.log('\n── #8g an order revised after its sheet was copied ──');
  const t = setup();
  t.server.hooks.acquireLogLock = (b) => (b.sessionId === 'AA-1' ? { reply: { ok: true, locked: true, holder: { name: 'Dr B' } } } : undefined);
  await t.start();
  await t.click(wardPrint('NICU'));
  await t.click(printAll());
  await runDone(t);
  A.ok('8.12 the job waits for its tap, with BB and DD in it', t.printed === 0 && sheetsMatch(['BB-1', 'e-bb'], ['DD-1', 'e-dd']));
  // Dr C saves over BB's order: a revision replaces e-bb.
  t.server.log['BB-1'] = [order('e-bb-r2', { revisionNumber: 2, revisionOf: 'e-bb', lastModified: TODAY + 'T05:00:00.000Z' })];
  await t.click(t.syncButton());
  await settle(t);
  const go = t.btn(/พิมพ์ \d+ ใบ/);
  if (go) await t.click(go);
  await settle(t);
  A.ok('8.13 the tap does not print BB\'s superseded sheet', !t.printedSheets.includes('BB-1') && !batchSheets().some(s => s.getAttribute('data-entry-id') === 'e-bb'), t.printedSheets);
  A.ok('8.14 …it prints DD\'s alone', t.printed === 1 && t.printedSheets.join() === 'DD-1', [t.printed, t.printedSheets]);
  A.ok('8.15 …and names BB as changed since it was collected', /NICU 2 BB — เปลี่ยนไปหลังเตรียมชุดพิมพ์/.test(skipped()), skipped());
};

// Vera's third review (2026-11-06, BLOCK): a correction to the infant's own
// record keeps the entry id, yet the calculator would now hold the order (a
// birth weight above the current weight moves the dosing weight, UP-C2). A
// waiting job drops the sheet as it would a revision.
scenarios['bwfix'] = async (A) => {
  console.log('\n── #8i a birth-weight correction after the sheet was copied ──');
  const t = setup();
  t.server.hooks.acquireLogLock = (b) => (b.sessionId === 'AA-1' ? { reply: { ok: true, locked: true, holder: { name: 'Dr B' } } } : undefined);
  await t.start();
  await t.click(wardPrint('NICU'));
  await t.click(printAll());
  await runDone(t);
  A.ok('8.18 the job waits for its tap, with BB and DD in it', t.printed === 0 && sheetsMatch(['BB-1', 'e-bb'], ['DD-1', 'e-dd']));
  t.server.patients.find(p => p.sessionId === 'BB-1').bw = 1200;
  await t.click(t.syncButton());
  await settle(t);
  const go = t.btn(/พิมพ์ \d+ ใบ/);
  if (go) await t.click(go);
  await settle(t);
  A.ok('8.19 the tap prints DD\'s alone, not BB\'s sheet dosed on the old weight', t.printed === 1 && t.printedSheets.join() === 'DD-1', [t.printed, t.printedSheets]);
  A.ok('8.20 …and names BB as changed since it was collected', /NICU 2 BB — เปลี่ยนไปหลังเตรียมชุดพิมพ์/.test(skipped()), skipped());
};

scenarios['nextday'] = async (A) => {
  console.log('\n── #8h a job left on screen past midnight ──');
  const t = setup();
  t.server.hooks.acquireLogLock = (b) => (b.sessionId === 'AA-1' ? { reply: { ok: true, locked: true, holder: { name: 'Dr B' } } } : undefined);
  await t.start();
  await t.click(wardPrint('NICU'));
  await t.click(printAll());
  await runDone(t);
  t.clock.advance(24 * 3600e3);
  const go = t.btn(/พิมพ์ \d+ ใบ/);
  if (go) await t.click(go);
  await settle(t);
  A.eq('8.16 yesterday\'s job does not print', t.printed, 0);
  A.ok('8.17 …and the page says to go back to the list', /วันเปลี่ยนแล้ว/.test(t.text()) && !!t.btn(/← กลับไปรายการ/));
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

// #9 on a ward of its own, so the counts above stay as they are.
scenarios['notpn'] = async (A) => {
  console.log('\n── #9 a No TPN order is not printed ──');
  const feeds = { totalTPN_mL: 0, dexPct: 0, aaPerKg: 0, lipidPerKg: 0, naCl: 0, kCl: 0, caPerKg: 0, glycophosP: 0,
    enType: 'BM_20', enVol: 12, enFreq: 8 };
  const t = boot({
    patients: [
      mkPatient({ sessionId: 'NA-1', name: 'NA', initials: 'NA', currentBed: 'NICU 1' }),   // TPN
      mkPatient({ sessionId: 'NB-1', name: 'NB', initials: 'NB', currentBed: 'NICU 2' }),   // ticked No TPN
      mkPatient({ sessionId: 'NC-1', name: 'NC', initials: 'NC', currentBed: 'NICU 3' }),   // feeds only, before the tick
      mkPatient({ sessionId: 'ND-1', name: 'ND', initials: 'ND', currentBed: 'NICU 4' }),   // No TPN, with vitamin D
      mkPatient({ sessionId: 'NE-1', name: 'NE', initials: 'NE', currentBed: 'NICU 5' }),   // No TPN, TPN yesterday
      mkPatient({ sessionId: 'NF-1', name: 'NF', initials: 'NF', currentBed: 'NICU 6' }),   // No TPN revision of today's TPN order
    ],
    log: { 'NA-1': [order('e-na')], 'NB-1': [order('e-nb', {}, { ...feeds, noTpn: true })], 'NC-1': [order('e-nc', {}, feeds)],
      'ND-1': [order('e-nd', {}, { ...feeds, noTpn: true, suppVitD: 400 })],
      'NE-1': [order('e-ne0', { ts: addDays(TODAY, -1) }), order('e-ne', {}, { ...feeds, noTpn: true })],
      // Vera, fifth review: no order before today, and today's TPN order revised
      // to No TPN with no oral orders. Pp: "Yes, print it".
      'NF-1': [order('e-nf2', { revisionNumber: 2, revisionOf: 'e-nf1' }, { ...feeds, noTpn: true, replacesTpn: true })] },
  });
  t.quiet();
  t.printed = 0;
  t.window.print = () => { t.printed++; };
  await t.start();
  await t.click(wardPrint('NICU'));
  A.eq('9.0 all six are listed as submitted', printRows().length, 6);
  // Pp, 2026-11-01: a No TPN order prints a short sheet for its oral orders, on
  // the day its TPN stopped, or when it cancels a TPN order of the same day;
  // otherwise it is not printed.
  A.eq('9.1 Print ทั้งหมด counts the TPN order, the oral orders, the day TPN stopped and the cancelled TPN', printAll() && printAll().querySelector('.num').textContent, '(4)');
  for (const name of ['ND', 'NE', 'NF']) {
    const b = printRow(name)?.querySelector('button');
    A.ok(`9.1 ${name}: a Print order button`, !!b && /Print order/.test(b.textContent) && !b.disabled, b && b.textContent);
  }
  for (const name of ['NB', 'NC']) {
    const row = printRow(name);
    const b = row && row.querySelector('button');
    A.ok(`9.2 ${name}: "No TPN — ไม่ต้องพิมพ์", its button off`, !!b && /No TPN — ไม่ต้องพิมพ์/.test(b.textContent) && b.disabled, b && b.textContent);
    A.ok(`9.3 ${name}: …and no tick to pick it`, !pick(name));
    await t.click(row);
    await settle(t);
    A.ok(`9.4 ${name}: a tap on the row opens nothing and prints nothing`, /Print order · NICU/.test(t.text()) && t.printed === 0);
  }
  await t.click(printAll());
  await runDone(t);
  A.ok('9.5 Print ทั้งหมด prints the TPN order and the three short sheets, never NB or NC',
    sheetsMatch(['NA-1', 'e-na'], ['ND-1', 'e-nd'], ['NE-1', 'e-ne'], ['NF-1', 'e-nf2']) && t.printed === 1,
    batchSheets().map(s => s.getAttribute('data-session-id')));
};

runScenarios(__filename, 'PRINT ALL + NO CALCULATOR ON THE PRINT LIST', scenarios);
