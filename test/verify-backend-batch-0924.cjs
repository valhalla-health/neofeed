// verify-backend-batch-0924.cjs — the 2026-09-24 backend batch (F2 + BE-1..4).
// Fails against 1ff0089 (the state before this batch); passes after. Uses the
// shared Sheets double — see gas-vm-sandbox.cjs. No npm dependencies.
//
//   F2   updateWeights persists a client-derived dob into an EMPTY dob cell
//        (never over a real one) so a dob-less legacy record stops re-dating.
//   BE-1 a Daily_Log draft is stored as "draft" (anything else → "submitted"),
//        and sheetHealthReport reports draftRows.
//   BE-3 validation refusals reach the bedside in Thai, not raw English.
//   BE-4 patient status is canonicalised on write, so a stray-space " Active"
//        can no longer skip the one-infant-per-bed check or become a ghost.
//   (BE-2, the two Staff-sheet row-move guards, is an additive assert matching
//   the proven registerPatient pattern; it needs a mid-call row shift to
//   exercise and is verified by inspection, not here.)
//
// Negative control — every section goes red against the pre-batch source:
//   NEOFEED_GAS_SRC=<1ff0089's gas-backend.gs> node test/verify-backend-batch-0924.cjs
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const { boot, recorder } = require('./gas-vm-sandbox.cjs');
const T = recorder('BACKEND BATCH 2026-09-24');

const P = (sid, extra) => Object.assign({
  sessionId: sid, name: 'ทารก ' + sid, initials: sid.slice(0, 2), bw: 900, ga: 28.1, sex: 'boys',
  dob: '2026-09-01', admissionDate: '2026-09-01', twinSuffix: '', status: 'Active',
  currentBed: '', diagnosis: 'RDS', weights: [{ dol: 1, w: 900 }], lengths: [], hcs: [], bedHistory: [],
  statusDate: '', multiplesCount: 0,
}, extra || {});
const E = (extra) => Object.assign({ dol: 5, weight: 1250, fluid: 150, gir: 6, pro: 3, kcal: 90,
  na: 3, k: 2, ca: 60, p: 40, enVolPerKg: 20, route: 'TPN central', status: 'submitted',
  calcInput: { wtG: 1250 } }, extra || {});

function ward(opts) {
  const g = boot(opts);
  g.addStaff('doc@kcmh.test', 'doctor', 'Doctor-Password-1');
  g.dt = g.session('doc@kcmh.test', 'doctor');
  g.as = (body) => g.post(Object.assign({ token: g.dt }, body));
  return g;
}
const isThai = (s) => /[฀-๿]/.test(String(s || ''));
const patRowOf = (g, sid) => g.rows('Patient_Registry').find(r => String(r[0]) === sid) || [];

// ── BE-3 ────────────────────────────────────────────────────────────────
T.section('BE-3 · validation refusals are Thai, not raw English', () => {
  const g = ward();
  const bw = g.as({ action: 'registerPatient', isNew: true, patient: P('CC-900', { bw: '' }) });
  T.ok('missing BW → Thai error', isThai(bw.error), bw.error);
  const sex = g.as({ action: 'registerPatient', isNew: true, patient: P('CD-900', { sex: 'x' }) });
  T.ok('bad sex → Thai error', isThai(sex.error), sex.error);
  g.as({ action: 'registerPatient', isNew: true, patient: P('CE-900') });
  const wt = g.as({ action: 'logDailyNutrition', sessionId: 'CE-900', entry: E({ weight: '' }) });
  T.ok('missing weight → Thai error', isThai(wt.error), wt.error);
});

// ── BE-4 ────────────────────────────────────────────────────────────────
T.section('BE-4 · status is canonicalised — no bed-skip, no ghost record', () => {
  const g = ward();
  const a = g.as({ action: 'registerPatient', isNew: true, patient: P('AA-900', { status: ' Active', currentBed: 'NICU 1' }) });
  T.ok('register with a stray-space " Active" is accepted', a.ok === true, a);
  T.eq('…and stored status is canonical "Active"', patRowOf(g, 'AA-900')[9], 'Active');
  const dup = g.as({ action: 'registerPatient', isNew: true, patient: P('AB-900', { status: ' Active', currentBed: 'NICU 1' }) });
  T.ok('a second " Active" infant on the same bed is REFUSED (bed check ran)', !!dup.error, dup);
  const weird = g.as({ action: 'registerPatient', isNew: true, patient: P('AC-900', { status: 'ZZZ', currentBed: 'NICU 2' }) });
  T.ok('an unrecognised status is accepted', weird.ok === true, weird);
  T.eq('…and stored as Active, never a ghost', patRowOf(g, 'AC-900')[9], 'Active');
});

// ── F2 ──────────────────────────────────────────────────────────────────
T.section('F2 · updateWeights fills an empty dob, never overwrites a real one', () => {
  const g = ward();
  // A legacy row: admission date present (patRow default), dob EMPTY.
  g.sheet('Patient_Registry').data.push(g.patRow('BB-900', { 6: '', 12: JSON.stringify([{ dol: 5, w: 1000 }]) }));
  const r1 = g.as({ action: 'updateWeights', sessionId: 'BB-900',
    weights: [{ dol: 1, w: 1050 }, { dol: 5, w: 1000 }], dob: '2026-09-15' });
  T.ok('updateWeights ok', r1.ok === true, r1);
  // Read the stored value the way the backend does — Sheets stores a date string
  // as a Date value, so normalise through _fmtDate rather than String().slice.
  T.eq('…the empty dob cell is filled', g.sb._fmtDate(patRowOf(g, 'BB-900')[6]), '2026-09-15');
  const r2 = g.as({ action: 'updateWeights', sessionId: 'BB-900',
    weights: [{ dol: 1, w: 1050 }, { dol: 5, w: 1000 }, { dol: 6, w: 1010 }], dob: '2026-01-01' });
  T.ok('a second updateWeights ok', r2.ok === true, r2);
  T.eq('…does NOT overwrite the dob already stored', g.sb._fmtDate(patRowOf(g, 'BB-900')[6]), '2026-09-15');
});

// ── BE-1 ────────────────────────────────────────────────────────────────
T.section('BE-1 · draft is coerced and reported; only "draft" survives as draft', () => {
  const g = ward();
  g.as({ action: 'registerPatient', isNew: true, patient: P('DD-900') });
  g.as({ action: 'logDailyNutrition', sessionId: 'DD-900', entry: E({ ts: '2026-09-10', status: 'draft' }) });
  g.as({ action: 'logDailyNutrition', sessionId: 'DD-900', entry: E({ ts: '2026-09-11', status: 'weird' }) });
  // Two rows: one logged "draft", one logged "weird". Compare the status set so
  // the assertion doesn't depend on how Sheets stores the ts date.
  const statuses = g.rows('Daily_Log').filter(r => String(r[1]) === 'DD-900').map(r => r[14]).sort();
  T.eq('one row survives as "draft", the unknown one is coerced to "submitted"', statuses, ['draft', 'submitted']);
  const rep = g.sb.sheetHealthReport();
  T.eq('sheetHealthReport counts the draft', rep.dailyLog.draftRows, 1);
});

T.done();
