// 2026-09-17 shell review — sync and writes. Drives the REAL <App/> in jsdom
// against the stateful fake Apps Script in review-0917-boot.cjs, one scenario
// per process.
//
//   #1  UP-S3   a sync already in flight when Save is pressed must not wipe the
//               saved Daily_Log entry (it did: "No log entries yet", NEEDS
//               ENTRY, and the retry refused by the one-entry-per-date guard)
//   #2  UP-S3   …nor a measurement saved from the growth chart
//   #3  UP-S1   edits, transfers and weight saves send the `base` the server
//               merges against; a new registration sends none (UP-S9: the
//               modal closes only once the save succeeded)
//   #4  UP-S6   a failing backend is polled with backoff, not every 30 s;
//               a manual Sync still goes straight through
//   #5  UP-S8   a write with no answer times out, stays on screen as unknown
//       UP-B10  until a verification sync shows it did not land, and no second
//               write is sent while its result is unknown
//   #6  UP-B10  an HTML error page on a registration that DID land: the patient
//               is not rolled back, the modal keeps what was typed
//   #7  codes   ServiceUnavailable (no logout), Busy (retryable, form kept),
//               SchemaMismatch (verbatim, no logout)
//   #8  code    DuplicateDate: re-sync, then open the existing entry
//   #9  legacy  the same, from a server that sends only the old message
//   #10 UP-S14  the admin archive is fetched only while switched on
const {
  boot, runScenarios, mkPatient, TODAY, DOCTOR,
} = require('./review-0917-boot.cjs');

// The seven boxes the Calculator requires before Save (verify-required-log-fields.cjs).
const REQUIRED = [['Current weight', 950], ['Target fluid', 120], ['Other IV', 0], ['Drug volume', 0],
  ['Input', 110], ['Urine output', 30], ['Drain content', 0]];
const fillRequired = async (t) => { for (const [l, v] of REQUIRED) await t.typeInto(t.fieldInput(l), v); };
const saveButton = () => [...document.querySelectorAll('button')].find(b => ['Submit', 'บันทึก'].includes(b.textContent.trim()));
const hasLoginScreen = () => !!document.querySelector('.login-wrap');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const scenarios = {
  async 'save-race'(A) {
    console.log('\n── #1 UP-S3: a sync in flight when Save is pressed keeps the saved entry ──');
    const t = boot();
    t.quiet();
    await t.start();
    await t.pickWard('NICU'); await t.openPatientRow(/AA/); await t.rail(/Calculator/);
    await fillRequired(t);
    // A sync goes out (focus refresh / poll / the Sync button) and is slow.
    t.server.holdSyncs = true;
    await t.click(t.syncButton());
    t.server.holdSyncs = false;
    const syncsBeforeSave = t.syncCalls().length;
    const save = saveButton();
    A.ok('1.1 Save is reachable with every required field typed', save && !save.disabled);
    await t.click(save); await t.flush();
    A.eq('1.2 the server holds the one row', (t.server.log['AA-BW900'] || []).length, 1);
    // The snapshot taken BEFORE the write now lands.
    await t.releaseSyncs(); await t.flush(); await t.flush();
    A.ok('1.3 the Dashboard still lists the saved entry', !/No log entries yet/.test(t.text()));
    A.eq('1.4 the stale snapshot was dropped and a fresh sync issued', t.syncCalls().length, syncsBeforeSave + 1);
    await t.rail(/Patients/);
    A.ok('1.5 the registry badge reads LOGGED, not NEEDS ENTRY', /LOGGED/.test(t.text()) && !/NEEDS ENTRY/.test(t.text()));
    // The duplicate-date guard can see the entry, so a second order that day
    // opens the existing one instead of a blank form the server would refuse.
    await t.openPatientRow(/AA/);
    await t.click(t.btn(/New log/));
    const go = t.btn(/ดำเนินการต่อ/);
    if (go) await t.click(go);
    A.ok('1.6 "New log" for today opens the existing entry for editing', /แก้ไขบันทึกโภชนาการ/.test(t.text()));
  },

  async 'weights-race'(A) {
    console.log('\n── #2 UP-S3: a sync in flight when a measurement is saved keeps it ──');
    const t = boot();
    t.quiet();
    await t.start();
    await t.pickWard('NICU'); await t.openPatientRow(/AA/); await t.rail(/Growth chart/);
    t.server.holdSyncs = true;
    await t.click(t.syncButton());
    t.server.holdSyncs = false;
    await t.typeInto(t.fieldInput('Wt'), 955);
    await t.click(t.btn(/Save measurement/));
    A.ok('2.1 the server has the measurement', (t.server.patients[0].weights || []).some(w => w.w === 955));
    await t.releaseSyncs(); await t.flush();
    A.ok('2.2 the stale snapshot did not erase it from the chart', /955g/.test(t.text()));
  },

  async 'merge-base'(A) {
    console.log('\n── #3 UP-S1: existing-patient saves carry `base`; registration does not ──');
    const fixture = mkPatient({ weights: [{ dol: 1, w: 900, l: null, hc: null }, { dol: 3, w: 880, l: null, hc: null }] });
    const t = boot({ patients: [fixture] });
    t.quiet();
    await t.start();
    await t.pickWard('NICU');
    const tableBtn = (label) => [...document.querySelectorAll('.patient-table button')].find(b => b.textContent.trim() === label);

    // Edit session → diagnosis.
    await t.click(tableBtn('Edit'));
    await t.typeInto(t.fieldInput('Diagnosis', document.querySelector('.picker')), 'RDS, PDA');
    await t.click(t.btn(/Save changes/));
    const edit = t.callsOf('registerPatient').pop();
    A.ok('3.1 an edit sends base', edit && edit.base);
    A.ok('3.2 base is the record exactly as last synced', edit && same(edit.base, fixture));
    A.eq('3.3 patient carries the edit', edit && edit.patient.diagnosis, 'RDS, PDA');
    A.ok('3.4 an edit is not a registration (no isNew)', edit && edit.isNew !== true);
    A.ok('3.5 the modal closed once the save succeeded', !document.querySelector('.picker-backdrop'));

    // Transfer → base is now what THIS device last saved.
    await t.click(tableBtn('⇄'));
    const toScn = [...document.querySelectorAll('.picker button')].find(b => /^SCN · SCN/.test(b.textContent.trim()));
    await t.click(toScn);
    await t.click(t.btn(/Confirm transfer/));
    const move = t.callsOf('registerPatient').pop();
    A.ok('3.6 a transfer sends base', move && move.base && move !== edit);
    A.eq('3.7 …holding the bed it moved from', move && move.base.currentBed, 'NICU 1');
    A.eq('3.8 …and this device\'s own successful edit', move && move.base.diagnosis, 'RDS, PDA');

    // Growth chart → updateWeights carries baseWeights.
    await t.pickWard('SCN').catch(() => {});
    await t.click(document.querySelector('.switch-patient'));
    await t.click([...document.querySelectorAll('.picker-row')].find(r => /AA/.test(r.textContent)));
    await t.rail(/Growth chart/);
    await t.typeInto(t.fieldInput('Wt'), 950);
    await t.click(t.btn(/Save measurement/));
    const w1 = t.callsOf('updateWeights').pop();
    A.ok('3.9 updateWeights sends baseWeights = the weights last received', w1 && same(w1.baseWeights, fixture.weights));
    await t.typeInto(t.fieldInput('Wt'), 960);
    await t.click(t.btn(/Save measurement/));
    const w2 = t.callsOf('updateWeights').pop();
    A.ok('3.10 the next save\'s baseWeights = what the last save sent', w2 && w1 && same(w2.baseWeights, w1.weights));

    // New registration → no base.
    await t.rail(/Patients/);
    await t.click(t.btn(/← เปลี่ยน ward/)).catch(() => {});
    await t.pickWard('NICU');
    await t.click(t.btn(/New session/));
    const modal = document.querySelector('.picker');
    await t.typeInto(t.fieldInput('ชื่อย่อ', modal), 'BB');
    await t.typeInto(t.fieldInput('Birth weight', modal), 1000);
    await t.selectVal(t.fieldInput('GA', modal), 30);
    await t.selectVal(t.fieldInput('Sex', modal), 'boys');
    await t.click(t.btn(/Register/, modal));
    const reg = t.callsOf('registerPatient').pop();
    A.ok('3.11 a registration is sent with isNew', reg && reg.isNew === true);
    A.ok('3.12 …and without base', reg && !('base' in reg));
  },

  async 'poll-backoff'(A) {
    console.log('\n── #4 UP-S6: an outage is polled with backoff; manual Sync is never held ──');
    const t = boot();
    t.quiet();
    await t.start();
    // Heading became "Ward" on 2026-09-22 — match the element, not the label.
    A.ok('4.0 the first sync succeeded', !!document.querySelector('.ward-gate'));
    t.server.hooks.getActivePatients = () => ({ html: true });
    t.clock.advance(5 * 60000);                  // the poll is due
    const n0 = t.syncCalls().length;
    for (let i = 0; i < 20; i++) { await t.tick(30000); t.clock.advance(30000); }   // ten minutes of 30 s ticks
    const n = t.syncCalls().length - n0;
    A.ok(`4.1 ten failing minutes cost 3–5 requests, not ~20 (sent ${n})`, n >= 3 && n <= 5);
    const pill = document.querySelector('.topbar .pill');
    A.ok('4.2 the pill says Sync error', /Sync error/.test(pill.textContent));
    A.ok('4.3 its tooltip carries the reason, in Thai', /ตอบกลับผิดรูปแบบ/.test(pill.getAttribute('title') || ''));
    const before = t.syncCalls().length;
    await t.click(t.syncButton());
    A.eq('4.4 a manual Sync goes out immediately, backoff or not', t.syncCalls().length, before + 1);
    t.server.hooks = {};
    await t.click(t.syncButton());
    A.ok('4.5 recovery: a good sync clears the error', /GAS ·/.test(document.querySelector('.topbar .pill').textContent));
    const after = t.syncCalls().length;
    await t.tick(30000);
    A.eq('4.6 …and the poll is back to its normal gate (nothing 30 s later)', t.syncCalls().length, after);
  },

  async 'timeout-unknown'(A) {
    console.log('\n── #5 UP-S8 / UP-B10: a timed-out write is unknown until a sync settles it ──');
    const t = boot();
    t.quiet();
    await t.start();
    await t.pickWard('NICU'); await t.openPatientRow(/AA/); await t.rail(/Growth chart/);
    t.server.hooks.updateWeights = () => ({ hang: true });
    t.server.holdSyncs = true;                    // hold the verification sync to look at the in-between state
    const syncs0 = t.syncCalls().length;
    await t.typeInto(t.fieldInput('Wt'), 950);
    t.timeouts.shrinkNext(1);                     // only this request's 45 s deadline
    await t.click(t.btn(/Save measurement/));
    await t.flush(120);
    A.ok('5.1 no answer ends in a timeout, not a spinner forever', t.toasts().some(x => /ไม่ทราบผลการบันทึก/.test(x)));
    A.ok('5.2 the unconfirmed measurement is not rolled back blindly', /950g/.test(t.text()));
    A.eq('5.3 a verification sync went out by itself', t.syncCalls().length, syncs0 + 1);
    const posts = t.callsOf('updateWeights').length;
    await t.typeInto(t.fieldInput('Wt'), 960);
    await t.click(t.btn(/Save measurement/));
    A.eq('5.4 while unknown, a second save sends nothing', t.callsOf('updateWeights').length, posts);
    A.ok('5.5 …and says why', t.toasts().some(x => /ยังไม่ทราบผลการบันทึกครั้งก่อน/.test(x)));
    A.eq('5.6 …keeping what was typed', t.fieldInput('Wt').value, '960');
    t.server.holdSyncs = false;
    await t.releaseSyncs();
    A.ok('5.7 the sync shows it never landed → removed from the chart', !/950g/.test(t.text()));
    t.server.hooks = {};
    await t.click(t.btn(/Save measurement/));
    A.eq('5.8 once settled, the retry goes through', t.callsOf('updateWeights').length, posts + 1);
    A.ok('5.9 …and lands', t.server.patients[0].weights.some(w => w.w === 960));
  },

  async 'unknown-register-landed'(A) {
    console.log('\n── #6 UP-B10 / UP-S9: an HTML reply on a registration that DID land ──');
    const t = boot();
    t.quiet();
    await t.start();
    await t.pickWard('NICU');
    await t.click(t.btn(/New session/));
    const modal = () => document.querySelector('.picker');
    await t.typeInto(t.fieldInput('ชื่อย่อ', modal()), 'BB');
    await t.typeInto(t.fieldInput('Birth weight', modal()), 1000);
    await t.selectVal(t.fieldInput('GA', modal()), 30);
    await t.selectVal(t.fieldInput('Sex', modal()), 'boys');
    t.server.hooks.registerPatient = (b) => (b.isNew ? { html: true, land: true } : undefined);
    t.server.holdSyncs = true;
    await t.click(t.btn(/Register/, modal()));
    await t.flush();
    A.ok('6.1 the modal stays open', !!modal());
    A.ok('6.2 …saying the result is unknown', modal() && /ไม่ทราบผลการบันทึก/.test(modal().textContent));
    A.eq('6.3 …with the typed initials still there', modal() && t.fieldInput('ชื่อย่อ', modal()).value, 'BB');
    A.ok('6.4 the patient is not rolled back off the registry', [...document.querySelectorAll('.patient-table tbody tr')].some(r => /BB/.test(r.textContent)));
    const regs = t.callsOf('registerPatient').length;
    await t.click(t.btn(/Register/, modal()));
    A.eq('6.5 pressing Register again sends nothing while unknown', t.callsOf('registerPatient').length, regs);
    t.server.holdSyncs = false;
    await t.releaseSyncs();
    A.ok('6.6 the verification sync confirms it: still registered', [...document.querySelectorAll('.patient-table tbody tr')].some(r => /BB/.test(r.textContent)));
    A.eq('6.7 exactly one registration on the server', t.server.patients.filter(p => p.name === 'BB').length, 1);
  },

  async 'error-codes'(A) {
    console.log('\n── #7 ServiceUnavailable · Busy · SchemaMismatch ──');
    const t = boot();
    t.quiet();
    await t.start();
    await t.pickWard('NICU');
    const svc = 'บริการยืนยันตัวตนของ Google ขัดข้องชั่วคราว — ลองใหม่อีกครั้ง';
    t.server.hooks.getActivePatients = () => ({ reply: { error: svc, code: 'ServiceUnavailable', retryable: true } });
    await t.click(t.syncButton());
    A.ok('7.1 ServiceUnavailable on a sync is not a logout', !hasLoginScreen() && /NICU/.test(t.text()));
    A.ok('7.2 …the session is kept', !!window.sessionStorage.getItem('neofeed_session'));
    A.ok('7.3 …the pill tooltip carries the server message', (document.querySelector('.topbar .pill').getAttribute('title') || '').includes(svc));
    A.ok('7.4 …and it is shown once as a toast', t.toasts().some(x => x.includes(svc)));
    t.server.hooks = {};
    await t.click(t.syncButton());

    // Busy on an edit: form kept, message in place, retry allowed.
    const busy = 'ระบบกำลังบันทึกรายการอื่นอยู่ — กรุณาลองใหม่';
    let busyOnce = true;
    t.server.hooks.registerPatient = () => (busyOnce ? (busyOnce = false, { reply: { error: busy, code: 'Busy', retryable: true } }) : undefined);
    await t.click([...document.querySelectorAll('.patient-table button')].find(b => b.textContent.trim() === 'Edit'));
    const modal = () => document.querySelector('.picker');
    await t.typeInto(t.fieldInput('Diagnosis', modal()), 'RDS, sepsis');
    await t.click(t.btn(/Save changes/, modal()));
    A.ok('7.5 Busy: the modal stays open with the message', modal() && modal().textContent.includes(busy));
    A.eq('7.6 Busy: the edit is still in the form', modal() && t.fieldInput('Diagnosis', modal()).value, 'RDS, sepsis');
    const n = t.callsOf('registerPatient').length;
    await t.click(t.btn(/Save changes/, modal()));
    A.eq('7.7 Busy is retryable: the second press sends', t.callsOf('registerPatient').length, n + 1);
    A.ok('7.8 …and on success the modal closes', !modal());
    A.eq('7.9 …with the edit on the server', t.server.patients[0].diagnosis, 'RDS, sepsis');

    // SchemaMismatch: verbatim, no logout.
    const schema = 'คอลัมน์ในชีต Patient_Registry ไม่ตรงกับที่ระบบคาด — แจ้ง admin';
    t.server.hooks.updateWeights = () => ({ reply: { error: schema, code: 'SchemaMismatch' } });
    await t.openPatientRow(/AA/); await t.rail(/Growth chart/);
    await t.typeInto(t.fieldInput('Wt'), 951);
    await t.click(t.btn(/Save measurement/));
    A.ok('7.10 SchemaMismatch is shown verbatim', t.toasts().some(x => x === '⚠ ' + schema));
    A.ok('7.11 …no logout', !hasLoginScreen());
    A.ok('7.12 …and the refused measurement is rolled back', !/951g/.test(t.text()));
    // ServiceUnavailable on a write: refused, not unknown — so not blocked.
    t.server.hooks.updateWeights = () => ({ reply: { error: svc, code: 'ServiceUnavailable', retryable: true } });
    await t.typeInto(t.fieldInput('Wt'), 952);
    await t.click(t.btn(/Save measurement/));
    const m = t.callsOf('updateWeights').length;
    t.server.hooks = {};
    await t.typeInto(t.fieldInput('Wt'), 952);
    await t.click(t.btn(/Save measurement/));
    A.eq('7.13 after ServiceUnavailable a retry is sent (the write did not happen)', t.callsOf('updateWeights').length, m + 1);
    A.ok('7.14 …and no logout at any point', !hasLoginScreen());
  },

  async 'duplicate-date'(A) {
    console.log('\n── #8 DuplicateDate: re-sync, then open the existing entry ──');
    const t = boot();
    t.quiet();
    await t.start();
    await t.pickWard('NICU'); await t.openPatientRow(/AA/);
    // Another device logged today's entry after this one synced.
    t.server.log['AA-BW900'] = [{ ts: TODAY, entryId: 'srv-existing', dol: 6, weight: 940, fluid: 120, gir: 6,
      pro: 3, kcal: 90, na: 2, k: 2, ca: 60, p: 40, enVolPerKg: 0, route: 'TPN central', status: 'draft',
      submittedBy: 'other@test.th', lastModified: '2026-09-17T01:00:00.000Z', lastModifiedBy: 'other@test.th' }];
    await t.rail(/Calculator/);
    A.ok('8.0 a NEW order form is open (this device never saw that entry)', /TPN \+ Enteral nutrition order/.test(t.text()));
    await fillRequired(t);
    const syncs = t.syncCalls().length;
    await t.click(saveButton()); await t.flush(); await t.flush();
    A.ok('8.1 the refusal triggers a re-sync', t.syncCalls().length > syncs);
    A.ok('8.2 the existing entry is opened for editing', /แก้ไขบันทึกโภชนาการ/.test(t.text()));
    A.ok('8.3 a toast says so', t.toasts().some(x => /เปิดรายการเดิม/.test(x)));
    A.eq('8.4 no second row was created', t.server.log['AA-BW900'].length, 1);
  },

  async 'duplicate-date-legacy'(A) {
    console.log('\n── #9 the same refusal from a server that sends no code ──');
    const t = boot();
    t.quiet();
    await t.start();
    await t.pickWard('NICU'); await t.openPatientRow(/AA/);
    t.server.log['AA-BW900'] = [{ ts: TODAY, entryId: 'srv-legacy', dol: 6, weight: 940, fluid: 120, status: 'draft',
      lastModified: '2026-09-17T01:00:00.000Z' }];
    t.server.hooks.logDailyNutrition = (b) => ({ reply: { error: `มีบันทึกของผู้ป่วยรายนี้ในวันที่ ${b.entry.ts} แล้ว — กรุณาเปิดรายการเดิมเพื่อแก้ไข` } });
    await t.rail(/Calculator/);
    await fillRequired(t);
    const syncs = t.syncCalls().length;
    await t.click(saveButton()); await t.flush(); await t.flush();
    A.ok('9.1 the old message alone still triggers a re-sync', t.syncCalls().length > syncs);
    A.ok('9.2 …and opens that date\'s entry', /แก้ไขบันทึกโภชนาการ/.test(t.text()));
  },

  async 'archive-toggle'(A) {
    console.log('\n── #10 UP-S14: the admin archive only while switched on ──');
    const archived = mkPatient({ sessionId: 'ZZ-BW700', name: 'ZZ', initials: 'ZZ', bw: 700, currentBed: '',
      status: 'Discharged', statusDate: '2026-05-01', __archiveOnly: true });
    const t = boot({ session: { ...DOCTOR, role: 'admin', email: 'admin@test.th' }, patients: [mkPatient(), archived] });
    t.quiet();
    await t.start();
    A.eq('10.1 an admin\'s first sync does not ask for the archive', t.syncCalls()[0].includeArchived, false);
    await t.pickWard('NICU');
    await t.rail(/Admin dashboard/);
    const toggle = () => document.querySelector('.archive-toggle');
    A.ok('10.2 the admin dashboard offers the switch', toggle() && /แสดงผู้ป่วยที่จำหน่ายเกิน 30 วัน/.test(t.text()));
    const tile = () => [...document.querySelectorAll('.admin-stat-tiles .card')].find(c => /Total patients/.test(c.textContent)).textContent;
    A.ok('10.3 off: the archived patient is not on this device', /Total patients1$/.test(tile()));
    await t.click(toggle());
    A.eq('10.4 on: a sync asks for the archive', t.syncCalls().pop().includeArchived, true);
    A.ok('10.5 …and brings it down', /Total patients2$/.test(tile()));
    A.eq('10.6 the switch reports its state', toggle().getAttribute('aria-pressed'), 'true');
    t.clock.advance(5 * 60000);
    await t.tick(30000);
    A.eq('10.7 the poll keeps asking while it is on', t.syncCalls().pop().includeArchived, true);
    await t.click(toggle());
    A.eq('10.8 off again: the next sync stops asking', t.syncCalls().pop().includeArchived, false);
    A.ok('10.9 …and the archive leaves this device', /Total patients1$/.test(tile()));
  },
};

runScenarios(__filename, 'REVIEW 0917 · SYNC + WRITES', scenarios);
