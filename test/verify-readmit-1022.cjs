// verify-readmit-1022.cjs — bringing a discharged infant back (Pp, 2026-10-22).
//
// Pp found a discharged infant in Switch patient on her phone while the infant
// was back on the unit, and could not find a way to bring them back: "ดึงคนนี้
// กลับขึ้นมาใหม่ได้มั้ยคะ … หาที่กดกลับมาไม่มี". The way back is Edit session
// (Status → Active, a bed), and both doors to it were shut on a phone:
//   • a pick in Switch patient only set the active patient. On the ward list,
//     where she was, nothing on screen changed, so the strip that carries
//     Edit session never appeared;
//   • the phone's archive card had no Edit, which the desktop archive row has.
//
// Drives the REAL <App/> in jsdom against the fake Apps Script in
// review-0917-boot.cjs, one scenario per process.
//
//   #1  ward list → Switch patient → the discharged infant: their Dashboard
//       opens, and Edit session brings them back to NICU 9 under the same
//       sessionId (an edit, not a new registration)
//   #2  on a patient screen a pick stays on that screen (Growth chart)
//   #3  Admin → Switch patient opens the Dashboard too
//   #4  the phone's archive card has Edit (no ⇄); it opens Edit session for
//       that infant, not their Dashboard, and saves them back to NICU 9
//
// ── NEGATIVE CONTROL ───────────────────────────────────────────────────────
//   d=$(mktemp -d)
//   git -c core.autocrlf=false archive --format=tar 3172337 | tar -x -C "$d"
//   cp test/verify-readmit-1022.cjs "$d/test/"
//   cp -r node_modules "$d/node_modules"
//   ( cd "$d" && TZ=Asia/Bangkok node test/verify-readmit-1022.cjs )
// #1, #3 and #4 fail there; #2 passes on both, as it should.
const {
  boot, runScenarios, mkPatient, TODAY, DOCTOR, addDays,
} = require('./review-0917-boot.cjs');

const ACTIVE = mkPatient({ sessionId: 'AA-BW900', name: 'AA', initials: 'AA', currentBed: 'NICU 1' });
// Discharged three days ago from an iso room: the bed was cleared on the way
// out and is remembered in bedHistory. Made-up values, none from the ward.
const LEFT = mkPatient({
  sessionId: 'ZQ-BW800', name: 'ZQ', initials: 'ZQ', bw: 800, ga: 25.3,
  dob: addDays(TODAY, -40), admissionDate: addDays(TODAY, -40),
  weights: [{ dol: 1, w: 800, l: null, hc: null }],
  status: 'Discharged', statusDate: addDays(TODAY, -3), currentBed: '',
  bedHistory: [{ bed: 'iso 2-1', date: addDays(TODAY, -3), at: addDays(TODAY, -3) + 'T02:00:00.000Z' }],
});
const OTHER = mkPatient({ sessionId: 'CC-BW1200', name: 'CC', initials: 'CC', bw: 1200, currentBed: 'NICU 2',
  weights: [{ dol: 1, w: 1200, l: null, hc: null }] });

const strip = () => document.querySelector('.patient-strip');
const stripText = () => (strip() || {}).textContent || '';
const railActive = () => (document.querySelector('.rail-item.active') || {}).textContent || '';
const pickerRow = (re) => [...document.querySelectorAll('.picker-row')].find(r => re.test(r.textContent));
const editModal = () => [...document.querySelectorAll('.picker')].find(m => /Edit session ·/.test(m.textContent));

// Status → Active, Bed → NICU 9, Save. Returns the registerPatient request.
async function bringBack(t, A, n) {
  const modal = editModal();
  A.ok(`${n}.a Edit session is open for ZQ`, modal && /Edit session · ZQ-BW800/.test(modal.textContent));
  await t.selectVal(t.fieldInput('Status', modal), 'Active');
  await t.selectVal(t.fieldInput('Bed', modal), 'NICU 9');
  const save = t.btn(/Save changes/, modal);
  A.ok(`${n}.b Save is enabled`, save && !save.disabled);
  await t.click(save);
  await t.flush(); await t.flush();
  return t.callsOf('registerPatient').pop();
}

function checkSaved(A, n, sent) {
  A.eq(`${n}.c the same session is saved`, sent && sent.patient.sessionId, 'ZQ-BW800');
  A.ok(`${n}.d …as an edit, not a new registration`, sent && sent.isNew !== true);
  A.eq(`${n}.e status Active`, sent && sent.patient.status, 'Active');
  A.eq(`${n}.f in NICU 9`, sent && sent.patient.currentBed, 'NICU 9');
  A.ok(`${n}.g the discharge date is cleared`, sent && !sent.patient.statusDate);
  A.eq(`${n}.h the bed left is still in Previous beds`, sent && sent.patient.bedHistory.map(h => h.bed), ['iso 2-1']);
}

const scenarios = {
  async 'picker-from-ward-list'(A) {
    console.log('\n── #1 Ward list → Switch patient → a discharged infant ──');
    const t = boot({ patients: [ACTIVE, LEFT] });
    t.quiet();
    await t.start();
    await t.pickWard('NICU');
    A.ok('1.1 on the ward list, no patient strip', /Total sessions/.test(t.text()) && !strip());
    await t.click(document.querySelector('.switch-patient'));
    const row = pickerRow(/ZQ/);
    A.ok('1.2 Switch patient lists ZQ as discharged from iso 2-1', row && /Discharged/.test(row.textContent) && /iso 2-1/.test(row.textContent));
    await t.click(row);
    A.ok('1.3 the pick opens ZQ\'s Dashboard', /Dashboard/.test(railActive()) && /ZQ/.test(stripText()));
    A.ok('1.4 …whose strip has Edit session', !!t.btn(/Edit session/, strip()));
    await t.click(t.btn(/Edit session/, strip()));
    checkSaved(A, '1', await bringBack(t, A, '1'));
    A.eq('1.i the server now holds ZQ as Active in NICU 9',
      (({ status, currentBed }) => ({ status, currentBed }))(t.server.patients.find(p => p.sessionId === 'ZQ-BW800')),
      { status: 'Active', currentBed: 'NICU 9' });
  },

  async 'picker-on-patient-screen'(A) {
    console.log('\n── #2 A pick on a patient screen stays on that screen ──');
    const t = boot({ patients: [ACTIVE, OTHER] });
    t.quiet();
    await t.start();
    await t.pickWard('NICU');
    await t.openPatientRow(/AA/);
    await t.rail(/Growth chart/);
    A.ok('2.1 on AA\'s growth chart', /Growth chart/.test(railActive()) && /AA/.test(stripText()));
    await t.click(document.querySelector('.switch-patient'));
    await t.click(pickerRow(/CC/));
    A.ok('2.2 still the growth chart, now CC\'s', /Growth chart/.test(railActive()) && /CC/.test(stripText()));
  },

  async 'picker-from-admin'(A) {
    console.log('\n── #3 Admin → Switch patient ──');
    const t = boot({ session: { ...DOCTOR, role: 'admin', email: 'admin@test.th' }, patients: [ACTIVE, LEFT] });
    t.quiet();
    await t.start();
    await t.rail(/Admin dashboard/);
    A.ok('3.1 on the Admin dashboard', /Admin dashboard/.test(railActive()) && !strip());
    await t.click(document.querySelector('.switch-patient'));
    await t.click(pickerRow(/ZQ/));
    A.ok('3.2 the pick opens ZQ\'s Dashboard', /Dashboard/.test(railActive()) && /ZQ/.test(stripText()));
  },

  async 'phone-archive-card'(A) {
    console.log('\n── #4 The phone\'s archive card has Edit ──');
    const t = boot({ patients: [ACTIVE, LEFT] });
    t.quiet();
    await t.start();
    await t.pickWard('NICU');
    const list = document.querySelector('.patient-card-list');
    await t.click(t.btn(/Discharged \/ Transferred \/ Expired/, list));
    const card = [...list.querySelectorAll('.patient-mc')].find(c => /ZQ/.test(c.textContent) && /Discharged/.test(c.textContent));
    A.ok('4.1 the discharged card is listed', !!card);
    const buttons = card ? [...card.querySelectorAll('.pmc-actions button')].map(b => b.textContent.trim()) : [];
    A.eq('4.2 …with Edit, and no ⇄', buttons, ['Edit']);
    await t.click(t.btn(/^\s*Edit\s*$/, card));
    A.ok('4.3 Edit opens Edit session, and not ZQ\'s Dashboard', !!editModal() && !strip());
    checkSaved(A, '4', await bringBack(t, A, '4'));
  },
};

runScenarios(__filename, 'READMIT 1022 · SWITCH PATIENT + PHONE ARCHIVE EDIT', scenarios);
