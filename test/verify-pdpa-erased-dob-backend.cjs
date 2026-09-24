// verify-pdpa-erased-dob-backend.cjs — a weight save cannot write a date of
// birth back into a PDPA-erased record.
//
// pseudonymizePatient (PDPA s.33) blanks name, initials and dob (B, C, G), and
// _mergePatient keeps them blank on every registry write (SEC-B6, 2026-09-17).
// F2 (PR #108, 2026-09-24) then taught updateWeights to write a client's dob into
// an EMPTY dob cell, to settle legacy records that never had one — and an erased
// record's dob cell is empty too. The frontend derives a dob for every record
// without one and sends it with each growth-chart and nurse-form weight save, so
// from @57 a weight save on an erased record wrote the birth date back into it.
//
//   § 1 a device that synced after the erasure: the dob it derives from the
//       retained admission date is the erased date of birth — doctor and nurse
//   § 2 a device that synced before the erasure: its copy holds the real dob
//   § 3 control: the same record, never erased, still gets its dob (F2 intact)
//
// Uses the shared Sheets double (gas-vm-sandbox.cjs); no npm dependencies.
// Negative control — § 1 and § 2 fail against @58's source (2731387):
//   NEOFEED_GAS_SRC=<2731387's gas-backend.gs> node test/verify-pdpa-erased-dob-backend.cjs
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const { boot, recorder, wardToday, addDays } = require('./gas-vm-sandbox.cjs');
const T = recorder('PDPA · AN ERASED DOB STAYS ERASED');

const TODAY = wardToday();
const ADMIT = addDays(TODAY, -10);   // admitted ten days ago…
const DOB = addDays(TODAY, -14);     // …on day of life 5

function ward() {
  const g = boot();
  g.addStaff('doc@kcmh.test', 'doctor', 'Doctor-Password-1');
  g.addStaff('nurse@kcmh.test', 'nurse', 'Nurse-Password-1');
  g.addStaff('admin@kcmh.test', 'admin', 'Admin-Password-1');
  g.dt = g.session('doc@kcmh.test', 'doctor');
  g.nt = g.session('nurse@kcmh.test', 'nurse');
  g.at = g.session('admin@kcmh.test', 'admin');
  g.as = (tok, body) => g.post(Object.assign({ token: tok }, body));
  g.synced = (sid) => g.post({ action: 'getActivePatients', token: g.dt }).patients.find(p => p.sessionId === sid);
  g.row = (sid) => g.rows('Patient_Registry').find(r => String(r[0]) === sid) || [];
  return g;
}

function register(g, sid) {
  const r = g.as(g.dt, { action: 'registerPatient', isNew: true, patient: {
    sessionId: sid, name: 'ทารก ' + sid, initials: sid.slice(0, 2), bw: 900, ga: 28.1, sex: 'boys',
    dob: DOB, admissionDate: ADMIT, twinSuffix: '', status: 'Active', currentBed: '', diagnosis: 'RDS',
    weights: [{ dol: 5, w: 900 }], lengths: [], hcs: [], bedHistory: [], statusDate: '', multiplesCount: 0,
  } });
  if (r.ok !== true) throw new Error('fixture registration refused: ' + JSON.stringify(r));
}
// What app.jsx's sync gives a record with no dob: admissionDate − (weights[0].dol − 1).
const derivedDob = (p) => addDays(p.admissionDate, -((Number(p.weights[0].dol) || 1) - 1));
// The weight save exactly as handleWeightUpdate sends it.
const weightSave = (g, tok, p, dol, w, dob) => g.as(tok, { action: 'updateWeights', sessionId: p.sessionId,
  baseWeights: p.weights, weights: p.weights.concat([{ dol, w }]), dob });
const identity = (row) => [row[1], row[2], row[6]];
const stillErased = (row) => /^\[PDPA-erased /.test(String(row[1])) && row[2] === '' && row[6] === '';
const storedWeight = (g, sid, dol) => JSON.parse(g.row(sid)[12] || '[]').find(x => x.dol === dol);

T.section('§ 1 · synced after the erasure: the derived dob is not written', () => {
  const g = ward();
  register(g, 'AB-900');
  T.ok('erasure ok', g.as(g.at, { action: 'pseudonymizePatient', sessionId: 'AB-900' }).ok === true);
  const p = g.synced('AB-900');
  T.eq('the sync hands out the erased record with no dob', p.dob, '');
  T.eq('…and what a device derives from what is left IS the erased date of birth', derivedDob(p), DOB);

  const r = weightSave(g, g.dt, p, 9, 950, derivedDob(p));
  T.ok('a doctor\'s weight save succeeds', r.ok === true, r);
  T.ok('…and stores the weight (clinical data outlives the erasure)', !!storedWeight(g, 'AB-900', 9), g.row('AB-900')[12]);
  T.eq('…but the dob cell stays empty', g.row('AB-900')[6], '');
  T.ok('name, initials and dob all stay erased', stillErased(g.row('AB-900')), identity(g.row('AB-900')));
  T.eq('the next sync still has no dob', g.synced('AB-900').dob, '');

  // The nurse form saves its weight through the same action (D5 leaves it open).
  const q = g.synced('AB-900');
  const n = weightSave(g, g.nt, q, 10, 960, derivedDob(q));
  T.ok('a nurse\'s weight save succeeds', n.ok === true, n);
  T.ok('…and stores the weight', !!storedWeight(g, 'AB-900', 10), g.row('AB-900')[12]);
  T.eq('…and writes no dob either', g.row('AB-900')[6], '');
});

T.section('§ 2 · synced before the erasure: the real dob is not written back', () => {
  const g = ward();
  register(g, 'CD-900');
  const stale = g.synced('CD-900');   // this device's copy, taken before the erasure
  T.eq('the stale copy holds the real dob', stale.dob, DOB);
  T.ok('erasure ok', g.as(g.at, { action: 'pseudonymizePatient', sessionId: 'CD-900' }).ok === true);
  const r = weightSave(g, g.dt, stale, 9, 950, stale.dob);
  T.ok('the stale device\'s weight save succeeds', r.ok === true, r);
  T.ok('…and stores the weight', !!storedWeight(g, 'CD-900', 9), g.row('CD-900')[12]);
  T.eq('…but the real dob is not written back', g.row('CD-900')[6], '');
  T.ok('name, initials and dob all stay erased', stillErased(g.row('CD-900')), identity(g.row('CD-900')));
});

T.section('§ 3 · control: the same record, never erased, still gets its dob (F2)', () => {
  const g = ward();
  register(g, 'EF-900');
  g.row('EF-900')[6] = '';            // a legacy row: no dob stored, nothing erased
  const p = g.synced('EF-900');
  T.eq('the sync hands out the legacy record with no dob', p.dob, '');
  const r = weightSave(g, g.dt, p, 9, 950, derivedDob(p));
  T.ok('the weight save succeeds', r.ok === true, r);
  T.eq('…and fills the empty dob cell', g.sb._fmtDate(g.row('EF-900')[6]), DOB);
  T.eq('…and the name is untouched', g.row('EF-900')[1], 'ทารก EF-900');
});

T.done();
