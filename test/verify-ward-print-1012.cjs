// verify-ward-print-1012.cjs — the stats tiles narrow the ward list, and each
// ward has a Print order list on the first page (Pp, 2026-10-12).
//
// Pp asked for two things:
//   "ให้ปุ่ม active, logged, needs entry กดแล้ว เลือกผู้ป่วยที่เข้ากับกลุ่มนั้นขึ้นมา"
//   — tap a stats tile, see only that tile's infants;
//   "หน้าแรกสุด ของแต่ละวอร์ด อยากให้มีปุ่ม พิมพ์ใบสั่ง ให้เป็นคำเดียวกับที่อยู่ด้านใน …
//    เมื่อกดจะลิงก์เข้าไปที่หน้าโชว์พีดีเอฟก่อนกดปริ้นท์ รีวิวเหมือนทางด้านใน"
//   — a Print order button per ward on the gate, a list of that day's submitted
//   orders, and a tap that opens the print preview the way Print order inside does.
//
//   #1 tiles   Needs entry / Logged today / Active narrow the list and say so
//   #2 gate    one Print order button per ward, beside (not inside) its tile
//   #3 list    only today's Submitted orders of that ward; draft, tmp_ and
//              two-orders rows handled; the rest counted, one tap from Needs entry
//   #4 print   a tap opens the order and prints it once, through the
//              calculator's own Print gate; the page leads back to the list
//   #5 blocked an order the gate holds back does not print, and says why
//   #6 locked  a colleague holding today's order stops the automatic print,
//              even after the lock clears (Vera, 2026-10-12)
//
// Drives the real <App/> through review-0917-boot (dev-only deps as in
// test/README.md).
const { boot, runScenarios, mkPatient, TODAY, addDays } = require('./review-0917-boot.cjs');

// A submitted order whose saved figures reproduce on reload — printable.
const CI = { curWtG: 900, fluidTargetPerKg: 150, otherIV_mL: 0, drug_mL: 0, ioInput: 130, ioOutput: 60, drainContent: 0,
  totalTPN_mL: 110, dexPct: 12.5, aaPerKg: 3, lipidPerKg: 3, naCl: 2, kCl: 1, caPerKg: 60, glycophosP: 1 };
const order = (entryId, extra = {}, ci = {}) => ({ entryId, lastModified: TODAY + 'T02:00:00.000Z', ts: TODAY, dol: 5,
  weight: 900, ioInput: 130, ioOutput: 60, drainContent: 0, status: 'submitted', calcInput: { ...CI, ...ci }, ...extra });

const patients = [
  mkPatient({ sessionId: 'AA-1', name: 'AA', initials: 'AA', currentBed: 'NICU 1' }),   // submitted today
  mkPatient({ sessionId: 'BB-1', name: 'BB', initials: 'BB', currentBed: 'NICU 2' }),   // draft today
  mkPatient({ sessionId: 'CC-1', name: 'CC', initials: 'CC', currentBed: 'NICU 3' }),   // yesterday only
  mkPatient({ sessionId: 'EE-1', name: 'EE', initials: 'EE', currentBed: 'NICU 4' }),   // today, still tmp_
  mkPatient({ sessionId: 'FF-1', name: 'FF', initials: 'FF', currentBed: 'NICU 5' }),   // two orders today
  mkPatient({ sessionId: 'GG-1', name: 'GG', initials: 'GG', currentBed: 'NICU 6', status: 'Discharged', statusDate: TODAY }),
  mkPatient({ sessionId: 'SS-1', name: 'SS', initials: 'SS', currentBed: 'SCN 1' }),    // SCN, K 5 with no reason
];
const log = {
  'AA-1': [order('e-aa')],
  'BB-1': [order('e-bb', { status: 'draft' })],
  'CC-1': [order('e-cc', { ts: addDays(TODAY, -1) })],
  'EE-1': [order('tmp_1726540000000_abc')],
  'FF-1': [order('e-ff1'), order('e-ff2', { lastModified: TODAY + 'T03:00:00.000Z' })],
  'GG-1': [order('e-gg')],
  'SS-1': [order('e-ss', {}, { kCl: 5 })],
};

function setup() {
  const t = boot({ patients, log });
  t.quiet();
  t.printed = 0;
  t.window.print = () => { t.printed++; };
  return t;
}
const settle = async (t, n = 6) => { for (let i = 0; i < n; i++) await t.flush(); };
const statTile = (label) => [...document.querySelectorAll('.reg-stat')].find(el => el.querySelector('.reg-stat-lbl').textContent === label);
const cardNames = () => [...document.querySelectorAll('.patient-card-list > .patient-mc .pmc-name')].map(e => e.textContent);
const rowNames = () => [...document.querySelectorAll('.patient-table tbody tr')].map(tr => tr.children[1]?.textContent || '')
  .filter(Boolean).map(s => s.replace(/Twin.*$/, ''));
const printRows = () => [...document.querySelectorAll('.print-row')];
const printRow = (name) => printRows().find(r => r.querySelector('.pr-name')?.textContent === name);
const printButtons = () => [...document.querySelectorAll('.ward-gate .ward-print')];
// The printed sheet's patient table: the form's first direct <table> child
// (REFERENCE.md § The printed order), which carries the NeoFeed ID.
const sheetPatient = () => document.querySelector('#print-form > table')?.textContent || '';

const scenarios = {
  async 'tiles'(A) {
    console.log('\n── #1 the stats tiles narrow the ward list ──');
    const t = setup();
    await t.start();
    await t.pickWard('NICU');
    A.eq('1.0 NICU lists its five active infants', cardNames().sort(), ['AA', 'BB', 'CC', 'EE', 'FF']);
    A.ok('1.1 Active, Logged today and Needs entry are buttons',
      ['Active', 'Logged today', 'Needs entry'].every(l => statTile(l)?.tagName === 'BUTTON'));
    A.ok('1.2 …Total sessions stays a plain figure', statTile('Total sessions')?.tagName === 'DIV');

    await t.click(statTile('Needs entry'));
    A.eq('1.3 Needs entry: the draft and the un-logged only', cardNames(), ['BB', 'CC']);
    A.eq('1.4 …the desktop table agrees', rowNames(), ['BB', 'CC']);
    A.ok('1.5 …the tile is lit and pressed', statTile('Needs entry').classList.contains('is-on') && statTile('Needs entry').getAttribute('aria-pressed') === 'true');
    A.ok('1.6 …and the list says it is narrowed', /แสดงเฉพาะ Needs entry · 2 จาก 5 ราย/.test(document.querySelector('.reg-filter-note')?.textContent || ''));
    A.ok('1.7 …with no discharged section under it', !/Discharged \/ Transferred \/ Expired/.test(t.text()));

    await t.click(statTile('Logged today'));
    A.eq('1.8 Logged today: today\'s submitted orders', cardNames(), ['AA', 'EE', 'FF']);
    A.eq('1.9 …and the two counts add up to Active', statTile('Logged today').querySelector('.reg-stat-val').textContent
      + '+' + statTile('Needs entry').querySelector('.reg-stat-val').textContent, '3+2');

    await t.click(statTile('Logged today'));
    A.eq('1.10 a second tap on the lit tile shows everyone', cardNames().length, 5);
    await t.click(statTile('Needs entry'));
    await t.click(statTile('Active'));
    A.eq('1.11 Active shows everyone', [cardNames().length, !!document.querySelector('.reg-filter-note')], [5, false]);
    A.ok('1.12 Active is never the lit tile', !statTile('Active').classList.contains('is-on'));

    await t.click(statTile('Needs entry'));
    await t.click(t.btn(/แสดงทั้งหมด/));
    A.eq('1.13 แสดงทั้งหมด clears it', cardNames().length, 5);

    await t.click(statTile('Needs entry'));
    await t.click(t.btn(/เปลี่ยน ward/));
    await t.pickWard('NICU');
    A.eq('1.14 changing ward drops the narrowing', cardNames().length, 5);
  },

  async 'gate'(A) {
    console.log('\n── #2 a Print order button per ward on the gate ──');
    const t = setup();
    await t.start();
    const tiles = [...document.querySelectorAll('.ward-tile')];
    A.eq('2.0 the ward tiles are unchanged', tiles.map(b => b.textContent.match(/^(NICU|SCN)/)?.[1]), ['NICU', 'SCN']);
    A.eq('2.1 one Print order button per ward', printButtons().length, 2);
    A.ok('2.2 …in the calculator\'s own words', printButtons().every(b => /^\s*Print order/.test(b.textContent)));
    A.ok('2.3 …never inside the tile (a button in a button)', !document.querySelector('.ward-tile button, .ward-tile .ward-print'));
    A.eq('2.4 …each counting its ward\'s submitted orders', printButtons().map(b => b.querySelector('.ward-print-n').textContent), ['3 ราย', '1 ราย']);
  },

  async 'list'(A) {
    console.log('\n── #3 the ward print list ──');
    const t = setup();
    await t.start();
    await t.click(printButtons()[0]);
    A.ok('3.0 it opens NICU\'s list', /Print order · NICU/.test(t.text()));
    A.eq('3.1 today\'s submitted orders only, in bed order', printRows().map(r => r.querySelector('.pr-name').textContent), ['AA', 'EE', 'FF']);
    A.ok('3.2 no draft, no yesterday, no discharged, no SCN', !['BB', 'CC', 'GG', 'SS'].some(n => printRow(n)));
    A.ok('3.3 the header counts it against the ward', /Submit แล้ว 3 จาก 5 ราย/.test(t.text()));
    const ee = printRow('EE');
    A.ok('3.4 a tmp_ row is shown as saving and cannot be opened', /กำลังบันทึก/.test(ee.textContent) && ee.querySelector('button').disabled && !ee.getAttribute('role'));
    await t.click(ee);
    A.ok('3.5 …a tap on it does nothing', /Print order · NICU/.test(t.text()) && t.printed === 0);
    A.ok('3.6 two orders on one day send the user to choose', /2 ใบสั่งวันนี้ — เลือกใน Dashboard/.test(printRow('FF').textContent));
    A.ok('3.7 the rest are counted, not hidden', /ยังไม่ Submit 2 ราย/.test(document.querySelector('.print-waiting')?.textContent || ''));

    await t.click(t.btn(/ดูรายชื่อ Needs entry/));
    A.eq('3.8 …one tap opens the ward\'s Needs entry list', [cardNames(), /แสดงเฉพาะ Needs entry/.test(t.text())], [['BB', 'CC'], true]);

    await t.click(t.btn(/เปลี่ยน ward/));
    await t.click(printButtons()[0]);
    await t.click(printRow('FF'));
    A.ok('3.9 the two-orders row opens that infant\'s Dashboard, printing nothing',
      /Dashboard/.test(document.querySelector('.rail-item.active')?.textContent || '')
      && !document.querySelector('.print-list') && !!t.btn(/New log/) && t.printed === 0);

    await t.rail(/Patients/);
    A.ok('3.10 Patients from the rail is the gate again, not the print list', !!document.querySelector('.ward-gate'));
    await t.click(printButtons()[0]);
    await t.click(t.btn(/← กลับ$/));
    A.ok('3.11 ← กลับ returns to the gate', !!document.querySelector('.ward-gate'));
  },

  async 'print'(A) {
    console.log('\n── #4 a tap opens the order and its print preview ──');
    const t = setup();
    await t.start();
    // Another infant is the active one before the tap: the order opened must
    // be the tapped infant's, not whoever was open.
    await t.pickWard('NICU');
    await t.openPatientRow(/BB/);
    await t.rail(/Patients/);
    await t.click(t.btn(/เปลี่ยน ward/));
    await t.click(printButtons()[0]);
    await t.click(printRow('AA'));
    await settle(t);
    A.ok('4.0 the saved order is open in the calculator', /แก้ไขบันทึกโภชนาการ/.test(t.text()));
    A.eq('4.1 …and the print preview opened once', t.printed, 1);
    A.ok('4.2 …and the printed sheet is the tapped infant\'s (AA-1, not BB-1)',
      /NeoFeed ID:\s*AA-1/.test(sheetPatient()) && !/BB-1/.test(sheetPatient()));
    await settle(t);
    await t.tick();
    await settle(t);
    A.eq('4.3 a re-render or a sync does not print it again', t.printed, 1);
    const back = t.btn(/กลับไปรายการ Print order/);
    A.ok('4.4 the page leads back to the print list', !!back && !t.btn(/กลับไป Dashboard/));
    await t.click(back);
    A.ok('4.5 …which is still NICU\'s list', /Print order · NICU/.test(t.text()) && printRows().length === 3);
    await t.rail(/Calculator/);
    await settle(t);
    A.eq('4.6 coming back to the calculator later prints nothing on its own', t.printed, 1);

    // Picking the same infant again from the list prints again — a new request.
    await t.rail(/Patients/);
    await t.click(printButtons()[0]);
    await t.click(printRow('AA'));
    await settle(t);
    A.eq('4.7 the same order picked again prints again', t.printed, 2);
  },

  async 'blocked'(A) {
    console.log('\n── #5 an order the Print gate holds back ──');
    const t = setup();
    await t.start();
    await t.click(printButtons()[1]);
    A.eq('5.0 SCN\'s list', printRows().map(r => r.querySelector('.pr-name').textContent), ['SS']);
    await t.click(printRow('SS'));
    await settle(t);
    await t.flush(1700);
    await settle(t);
    A.eq('5.1 a critical value with no reason does not print', t.printed, 0);
    A.ok('5.2 …and says why, as Print order inside does',
      t.toasts().some(m => /มีค่าวิกฤตที่ยังไม่ได้ระบุเหตุผล — บันทึกพร้อมเหตุผลก่อนพิมพ์/.test(m)));
  },
};

// ── #6 ──
scenarios['locked'] = async (A) => {
  console.log('\n── #6 a colleague has today\'s order open ──');
  const t = setup();
  let locked = true;
  t.server.hooks.acquireLogLock = (b) => (locked && b.sessionId === 'AA-1'
    ? { reply: { ok: true, locked: true, holder: { name: 'Dr B' } } } : undefined);
  await t.start();
  await t.click(printButtons()[0]);
  await t.click(printRow('AA'));
  await settle(t);
  await t.flush(1700);
  await settle(t);
  A.eq('6.0 the automatic print does not go', t.printed, 0);
  A.ok('6.1 …the page shows who has it open', /Dr B กำลังเปิดบันทึกวันที่/.test(t.text()));
  A.ok('6.2 …and a toast says the preview was held', t.toasts().some(m => /ไม่ได้เปิดหน้าพิมพ์อัตโนมัติ — Dr B/.test(m)));
  locked = false;
  await t.tick();
  await settle(t);
  await t.flush(1700);
  A.ok('6.3 the lock clearing later does not print out of nowhere', t.printed === 0 && !/Dr B กำลังเปิดบันทึก/.test(t.text()));
  await t.click(t.btn(/^\s*Print order\s*$/));
  await settle(t);
  A.eq('6.4 Print order on the page still prints', t.printed, 1);
};

runScenarios(__filename, 'WARD PRINT ORDER + STATS FILTER', scenarios);
