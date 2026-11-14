// verify-test-ward-1114.cjs — the "อื่นๆ" group becomes the test area.
//
// Pp, 2026-11-14: "อันที่เป็นอื่นๆ ให้ขึ้นเป็น test ระบบ ไม่ให้มี save เข้า
// backend เลย เพราะไม่อยากตามแก้". Her three choices the same day:
//   • a patient registered with no bed is a TEST patient: TEST- id, kept in
//     this browser's localStorage, never sent to the backend;
//   • a record the server already holds with no bed is read-only until it is
//     given a real bed;
//   • a test patient cannot move to a real bed.
//
//   § 1 data.js   isTestSession / testSessionId / isReadOnlyOther
//   § 2 register  the real <App/>: the gate's test tile (no Print order), a
//                 no-bed registration that sends nothing, the TEST tag, the
//                 localStorage copy, and a sync that keeps it
//   § 3 reload    a test patient in localStorage is back after a reload
//   § 4 move      a test patient's move to a real bed is refused, nothing sent
//   § 3b/3c logout  a chosen and an idle logout clear the test store (Vera)
//   § 6 no print  a test order renders no sheet and Print order prints nothing
//   § 7 reopen    an order saved locally gets an id the log can open
//   § 5 read-only a server record with no bed: its move
//                 to a real bed goes through; § 5b: an edit that keeps no bed
//                 and a growth-chart weight are refused, nothing sent
//
// Dev-only deps as in test/README.md. One scenario per process (runScenarios).
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const RB = require('./review-0917-boot.cjs');
const { printFormTicked } = require('./print-acks-helper.cjs');

const REAL = RB.mkPatient({ sessionId: 'NF-000001', name: 'สม จด', currentBed: 'NICU 1' });
const NOBED = RB.mkPatient({ sessionId: 'NF-000777', name: 'บุญ มา', currentBed: '', bedHistory: [] });
const STORE = 'neofeed_test_ward_v1';
const leaked = (t) => t.server.calls.filter(c => JSON.stringify(c).includes('TEST-'));
const writes = (t) => t.server.calls.filter(c => !['getActivePatients', 'login', 'logout', 'getUsageWeekly'].includes(c.action)
  && !/Lock/i.test(c.action || ''));

function boot(extraPatients = []) {
  const t = RB.boot({ patients: [REAL, NOBED, ...extraPatients] });
  t.store = () => { try { return JSON.parse(t.window.localStorage.getItem(STORE) || 'null'); } catch { return null; } };
  t.modal = () => t.window.document.querySelector('.picker');
  t.settle = async () => { for (let i = 0; i < 8; i++) await t.flush(20); };
  t.gateCell = (re) => [...t.window.document.querySelectorAll('.ward-gate > div')]
    .find(d => re.test(d.querySelector('.ward-tile')?.textContent || ''));
  t.register = async ({ first, last, bw, gaW, gaD, sex, bed }) => {
    await t.click(t.btn(/New session/));
    const m = t.modal();
    t.bedOnOpen = t.fieldInput('Bed', m).value;
    t.noteOnOpen = !!m.querySelector('.test-bed-note');
    const names = m.querySelectorAll('.name-fields input.inp');
    await t.typeInto(names[0], first);
    await t.typeInto(names[1], last);
    await t.typeInto(t.fieldInput('Birth weight', m), bw);
    const ga = [...m.querySelectorAll('.field')].find(f => /^GA/.test(f.querySelector('label').textContent.trim())).querySelectorAll('select');
    await t.selectVal(ga[0], gaW); await t.selectVal(ga[1], gaD);
    await t.selectVal(t.fieldInput('Sex', m), sex);
    await t.selectVal(t.fieldInput('Bed', m), bed);
    await t.click(t.btn(/Register/, m));
    await t.settle();
  };
  t.moveBtn = (re) => [...t.window.document.querySelectorAll('button')]
    .find(b => /^(ย้ายเตียง|เลือกเตียง) /.test(b.getAttribute('aria-label') || '') && re.test(b.getAttribute('aria-label')));
  return t;
}

const scenarios = {
  async 'data'(A) {
    console.log('\n── § 1 data.js ──');
    const t = RB.boot({ patients: [] });
    const D = t.D();
    A.ok('1.1 TEST- ids are test sessions', D.isTestSession('TEST-NF-123456'));
    A.ok('1.2 NF- ids are not', !D.isTestSession('NF-123456') && !D.isTestSession('') && !D.isTestSession(null));
    A.ok('1.3 testSessionId draws TEST-NF-######', /^TEST-NF-\d{6}$/.test(D.testSessionId()));
    A.ok('1.4 a server record with no bed is read-only', D.isReadOnlyOther(NOBED));
    A.ok('1.5 …and one with a real bed is not', !D.isReadOnlyOther(REAL));
    A.ok('1.6 a parked patient (bed in history) is not read-only',
      !D.isReadOnlyOther({ ...REAL, currentBed: '', bedHistory: [{ bed: 'NICU 1', date: RB.TODAY }] }));
    A.ok('1.7 a test patient is not "read-only", it saves locally',
      !D.isReadOnlyOther({ ...NOBED, sessionId: 'TEST-NF-000001' }));
  },

  async 'register'(A) {
    console.log('\n── § 2 register a test patient ──');
    const t = boot();
    const restore = t.quiet();
    await t.start(); await t.settle();
    const cell = t.gateCell(/ทดสอบระบบ/);
    A.ok('2.1 the gate shows the test tile', !!cell);
    A.ok('2.2 the test tile has no Print order button', cell && !cell.querySelector('.ward-print'));
    A.ok('2.3 NICU keeps its Print order button', !!t.gateCell(/^NICU/)?.querySelector('.ward-print'));
    await t.pickWard('ทดสอบระบบ');
    t.server.calls.length = 0;
    await t.register({ first: 'ทด', last: 'ลอง', bw: 1200, gaW: 30, gaD: 0, sex: 'boys', bed: '' });
    A.eq('2.3a New session from the test tile starts with no bed', t.bedOnOpen, '');
    A.ok('2.3b …and the form says no bed means a test patient', t.noteOnOpen);
    A.eq('2.4 nothing with TEST- reached the backend', leaked(t).length, 0);
    A.eq('2.5 no registerPatient was sent at all', t.callsOf('registerPatient').length, 0);
    const st = t.store();
    A.eq('2.6 localStorage holds one test patient', st && st.patients.length, 1);
    A.ok('2.7 its id is TEST-NF-######', st && /^TEST-NF-\d{6}$/.test(st.patients[0].sessionId));
    A.ok('2.8 the screen tags it TEST', /TEST/.test(t.text()));
    A.ok('2.9 the toast says it is not saved to the system', t.toasts().some(x => /ไม่บันทึกเข้าระบบ/.test(x)));
    await t.click(t.syncButton()); await t.settle();
    A.ok('2.10 a sync ran', t.syncCalls().length > 0);
    const D = t.D();
    const name = st && st.patients[0].name;   // namePart keeps two letters: "ทด ลอ"
    A.ok('2.11 the test patient is still on screen after the sync', !!name && t.text().includes(name));
    A.eq('2.12 …and still in localStorage', (t.store()?.patients || []).filter(p => D.isTestSession(p.sessionId)).length, 1);
    A.eq('2.13 still nothing with TEST- sent', leaked(t).length, 0);
    restore();
  },

  async 'nicu-default'(A) {
    console.log('\n── § 2b New session from NICU still pre-picks a free bed ──');
    const t = boot();
    const restore = t.quiet();
    await t.start(); await t.settle();
    await t.pickWard('NICU');
    await t.click(t.btn(/New session/));
    const m = t.modal();
    A.eq('2b.1 NICU opens on the next free NICU bed', t.fieldInput('Bed', m).value, 'NICU 2');
    A.ok('2b.2 no test-patient note under a real bed', !m.querySelector('.test-bed-note'));
    restore();
  },

  async 'reload'(A) {
    console.log('\n── § 3 reload ──');
    const t = boot();
    const restore = t.quiet();
    const tp = RB.mkPatient({ sessionId: 'TEST-NF-424242', name: 'ทด กลับ', currentBed: '' });
    t.window.localStorage.setItem(STORE, JSON.stringify({ owner: RB.DOCTOR.email, patients: [tp, { sessionId: 'NF-000999', name: 'แอบ ใส่' }], log: {}, nursing: {} }));
    await t.start(); await t.settle();
    await t.pickWard('ทดสอบระบบ');
    A.ok('3.1 the stored test patient is back', /ทด กลับ/.test(t.text()));
    A.ok('3.2 a non-TEST record in the store is ignored', !/แอบ ใส่/.test(t.text()));
    A.ok('3.3 the server record with no bed lists here too', /บุญ มา/.test(t.text()));
    A.eq('3.4 nothing with TEST- sent', leaked(t).length, 0);
    restore();
  },

  async 'logout'(A) {
    console.log('\n── § 3b logout clears the test store (Vera, 2026-11-14) ──');
    const t = boot();
    const restore = t.quiet();
    const tp = RB.mkPatient({ sessionId: 'TEST-NF-616161', name: 'ทด ออก', currentBed: '' });
    t.window.localStorage.setItem(STORE, JSON.stringify({ owner: RB.DOCTOR.email, patients: [tp], log: {}, nursing: {} }));
    await t.start(); await t.settle();
    await t.pickWard('ทดสอบระบบ');
    A.ok('3b.1 the test patient is on screen', /ทด ออก/.test(t.text()));
    await t.click(t.window.document.querySelector('.topbar .user'));
    await t.click(t.btn(/ออกจากระบบ/));
    await t.settle();
    A.eq('3b.2 a chosen logout removes the test store', t.window.localStorage.getItem(STORE), null);
    restore();
  },

  async 'idle-logout'(A) {
    console.log('\n── § 3c an idle logout clears it too ──');
    const t = boot();
    const restore = t.quiet();
    const tp = RB.mkPatient({ sessionId: 'TEST-NF-626262', name: 'ทด หลับ', currentBed: '' });
    t.window.localStorage.setItem(STORE, JSON.stringify({ owner: RB.DOCTOR.email, patients: [tp], log: {}, nursing: {} }));
    await t.start(); await t.settle();
    t.clock.advance(31 * 60 * 1000);
    await t.tick(30000); await t.settle();
    A.ok('3c.1 the idle logout happened', !t.window.document.querySelector('.ward-gate'));
    A.eq('3c.2 the test store is gone', t.window.localStorage.getItem(STORE), null);
    restore();
  },

  async 'other-account'(A) {
    console.log('\n── § 3d another account\'s store is deleted, never read ──');
    const t = boot();
    const restore = t.quiet();
    const tp = RB.mkPatient({ sessionId: 'TEST-NF-636363', name: 'ทด คนอื่น', currentBed: '' });
    t.window.localStorage.setItem(STORE, JSON.stringify({ owner: 'someone@else.th', patients: [tp], log: {}, nursing: {} }));
    await t.start(); await t.settle();
    await t.pickWard('ทดสอบระบบ');
    A.ok('3d.1 the other account\'s test patient is not shown', !/ทด คนอื่น/.test(t.text()));
    A.eq('3d.2 …and its store is gone', t.window.localStorage.getItem(STORE), null);
    restore();
  },

  async 'expired-then-other'(A) {
    console.log('\n── § 3e a session that expires, then another account signs in ──');
    const t = boot();
    const restore = t.quiet();
    const tp = RB.mkPatient({ sessionId: 'TEST-NF-646464', name: 'ทด หมดเวลา', currentBed: '' });
    t.window.localStorage.setItem(STORE, JSON.stringify({ owner: RB.DOCTOR.email, patients: [tp], log: {}, nursing: {} }));
    await t.start(); await t.settle();
    await t.pickWard('ทดสอบระบบ');
    A.ok('3e.1 the owner sees the test patient', /ทด หมดเวลา/.test(t.text()));
    t.server.hooks.getActivePatients = () => ({ reply: { error: 'Unauthorized' } });
    await t.click(t.syncButton()); await t.settle();
    A.ok('3e.2 the session expired to the login screen', !!t.btn(/เข้าด้วย email อื่น/));
    delete t.server.hooks.getActivePatients;
    await t.click(t.btn(/เข้าด้วย email อื่น/));
    const [em, pw] = t.window.document.querySelectorAll('.login-form-wrap input');
    await t.typeInto(em, 'n@test.th');
    await t.typeInto(pw, 'correct-horse-battery');
    await t.act(async () => {
      t.window.document.querySelector('.login-form-wrap form').dispatchEvent(new t.window.Event('submit', { bubbles: true, cancelable: true }));
    });
    await t.settle();
    A.eq('3e.3 the nurse\'s sign-in deletes the doctor\'s store', t.window.localStorage.getItem(STORE), null);
    A.ok('3e.4 …and the nurse never sees the test patient', !/ทด หมดเวลา/.test(t.text()));
    restore();
  },

  async 'readonly-saves'(A) {
    console.log('\n── § 5b a server record with no bed takes no other save ──');
    const t = boot();
    const restore = t.quiet();
    await t.start(); await t.settle();
    await t.pickWard('ทดสอบระบบ');
    // Edit session that keeps no bed: refused in the modal, nothing sent.
    const row = [...t.window.document.querySelectorAll('.patient-table tbody tr')].find(r => /บุญ มา/.test(r.textContent));
    await t.click([...row.querySelectorAll('button')].find(b => b.textContent.trim() === 'Edit'));
    const m = t.modal();
    await t.typeInto(t.fieldInput('Diagnosis', m), 'RDS แก้');
    t.server.calls.length = 0;
    await t.click(t.btn(/Save changes/, m));
    await t.settle();
    A.ok('5b.1 the edit is refused in words', /บันทึกไม่ได้ ย้ายเข้าเตียงจริงก่อน/.test(t.modal()?.textContent || ''));
    A.eq('5b.2 no registerPatient was sent', t.callsOf('registerPatient').length, 0);
    await t.click(t.btn(/Cancel/, t.modal()));
    // A weight from the growth chart: refused, nothing sent.
    await t.openPatientRow(/บุญ มา/);
    await t.rail(/Growth chart/);
    await t.typeInto(t.fieldInput('Wt'), 950);
    t.server.calls.length = 0;
    await t.click(t.btn(/Save measurement/));
    await t.settle();
    A.eq('5b.3 no updateWeights was sent', t.callsOf('updateWeights').length, 0);
    A.ok('5b.4 the toast says why', t.toasts().some(x => /บันทึกไม่ได้ ย้ายเข้าเตียงจริงก่อน/.test(x)));
    restore();
  },

  async 'no-print'(A) {
    console.log('\n── § 6 a test patient\'s order never prints (Pp, 2026-11-14: "ห้าม Print") ──');
    const t = boot();
    const restore = t.quiet();
    let printed = 0;
    t.window.print = () => { printed++; };
    const tp = RB.mkPatient({ sessionId: 'TEST-NF-717171', name: 'ทด พิมพ์', currentBed: '' });
    const CI = { curWtG: 900, fluidTargetPerKg: 150, otherIV_mL: 0, drug_mL: 0, ioInput: 130, ioOutput: 60, drainContent: 0,
      totalTPN_mL: 110, dexPct: 12.5, aaPerKg: 3, lipidPerKg: 3, naCl: 2, kCl: 1, caPerKg: 60, glycophosP: 1,
      constantsVersion: require('fs').readFileSync(RB.DIR + 'data.js', 'utf8').match(/const CONSTANTS_VERSION = "([^"]+)"/)[1] };  // verify-print-all-1028's printable order
    const entry = { entryId: 'local_1731550000000_abc', lastModified: RB.TODAY + 'T02:00:00.000Z', ts: RB.TODAY, dol: 5,
      weight: 900, ioInput: 130, ioOutput: 60, drainContent: 0, status: 'submitted', calcInput: CI };
    t.window.localStorage.setItem(STORE, JSON.stringify({ owner: RB.DOCTOR.email, patients: [tp],
      log: { 'TEST-NF-717171': [entry] }, nursing: {} }));
    await t.start(); await t.settle();
    await t.pickWard('ทดสอบระบบ');
    await t.openPatientRow(/ทด พิมพ์/);
    const row = t.window.document.querySelector('tr[data-admit-day]');
    A.ok('6.1 the saved test order is in the log and opens', !!row && row.style.cursor === 'pointer');
    await t.click(row); await t.settle();
    A.ok('6.2 the Calculator says a test patient cannot print', !!t.window.document.querySelector('.test-no-print'));
    A.ok('6.3 no printed sheet is rendered, even with every red alert ticked', !printFormTicked(t.window.document));
    await t.click(t.btn(/^\s*Print order\s*$/)); await t.settle();
    A.eq('6.4 Print order does not print', printed, 0);
    A.ok('6.5 …and the toast says why', t.toasts().some(x => /คนไข้ทดสอบพิมพ์ใบสั่งไม่ได้/.test(x)));
    A.eq('6.6 nothing with TEST- sent', leaked(t).length, 0);
    restore();
  },

  async 'local-order-reopens'(A) {
    console.log('\n── § 7 an order saved for a test patient can be opened again ──');
    const t = boot();
    const restore = t.quiet();
    const tp = RB.mkPatient({ sessionId: 'TEST-NF-727272', name: 'ทด เปิด', currentBed: '' });
    t.window.localStorage.setItem(STORE, JSON.stringify({ owner: RB.DOCTOR.email, patients: [tp], log: {}, nursing: {} }));
    await t.start(); await t.settle();
    await t.pickWard('ทดสอบระบบ');
    await t.openPatientRow(/ทด เปิด/);
    await t.click(t.btn(/New log/)); await t.settle();
    await t.click(t.btn(/ดำเนินการต่อ/)); await t.settle();
    await t.click(t.btn(/^\s*Peripheral\s*$/)); await t.settle();
    await t.click(t.btn(/Save draft/)); await t.settle();
    const ids = (t.store()?.log['TEST-NF-727272'] || []).map(e => e.entryId);
    A.eq('7.1 one order saved locally', ids.length, 1);
    A.ok('7.2 its id does not read as "still saving"', ids.length === 1 && /^local_/.test(ids[0]) && !/^(local_)?tmp_/.test(ids[0]));
    A.eq('7.3 nothing with TEST- sent', leaked(t).length, 0);
    restore();
  },

  async 'move'(A) {
    console.log('\n── § 4 a test patient cannot move to a real bed ──');
    const t = boot();
    const restore = t.quiet();
    const tp = RB.mkPatient({ sessionId: 'TEST-NF-515151', name: 'ทด ย้าย', currentBed: '' });
    t.window.localStorage.setItem(STORE, JSON.stringify({ owner: RB.DOCTOR.email, patients: [tp], log: {}, nursing: {} }));
    await t.start(); await t.settle();
    await t.pickWard('ทดสอบระบบ');
    const b = t.moveBtn(/ทด ย้าย/);
    A.ok('4.1 the bed button is there', !!b);
    await t.click(b);
    const m = t.modal();
    await t.selectVal(m.querySelector('select'), 'NICU 3');
    t.server.calls.length = 0;
    await t.click(m.querySelector('button.btn.primary'));
    await t.settle();
    const err = (t.modal()?.textContent || '');
    A.ok('4.2 the modal says a test patient cannot move', /คนไข้ทดสอบย้ายเข้าเตียงจริงไม่ได้/.test(err));
    A.eq('4.3 nothing was sent', writes(t).length, 0);
    A.eq('4.4 the stored record still has no bed', t.store().patients[0].currentBed, '');
    restore();
  },

  async 'readonly'(A) {
    console.log('\n── § 5 a server record with no bed ──');
    const t = boot();
    const restore = t.quiet();
    await t.start(); await t.settle();
    await t.pickWard('ทดสอบระบบ');
    A.ok('5.1 it lists under the test tile', /บุญ มา/.test(t.text()));
    A.ok('5.2 it carries no TEST tag', ![...t.window.document.querySelectorAll('.chip.warn')].some(c => c.textContent === 'TEST'));
    // Its move to a real bed is the one save it takes.
    const b = t.moveBtn(/บุญ มา/);
    A.ok('5.3 the bed button is there', !!b);
    await t.click(b);
    const m = t.modal();
    await t.selectVal(m.querySelector('select'), 'NICU 3');
    t.server.calls.length = 0;
    await t.click(m.querySelector('button.btn.primary'));
    await t.settle();
    const reg = t.callsOf('registerPatient');
    A.eq('5.4 the move to NICU 3 was sent', reg.length, 1);
    A.eq('5.5 …with the new bed', reg[0] && reg[0].patient.currentBed, 'NICU 3');
    A.eq('5.6 the server now holds it in NICU 3', t.server.patients.find(p => p.sessionId === 'NF-000777').currentBed, 'NICU 3');
    restore();
  },
};

RB.runScenarios(__filename, 'verify-test-ward-1114', scenarios);
