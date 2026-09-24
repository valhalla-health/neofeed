// verify-clinical-0924.cjs — Pp's 2026-09-24 clinical decisions.
// Fails against 6d24e29 (the backend batch, before these); passes after.
//
//   TARGETS.fluid  uses current weight but is FLOORED at birth weight until the
//                  infant regains it, so a postnatal-loss nadir cannot drop the
//                  tier into a lighter, higher-fluid band. (NPE:AA < 20 is
//                  already a warning, not a stop — PR #96 — so nothing to change
//                  there; asserted below as a guard.)
//   registerPatient  a colliding id (initials + BW) returns a needs-confirm
//                    warning instead of a silent write; confirmOverwrite writes.
//
// Negative control (backend section): NEOFEED_GAS_SRC=<6d24e29's gas-backend.gs>.
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { boot, recorder } = require('./gas-vm-sandbox.cjs');
const T = recorder('CLINICAL DECISIONS 2026-09-24');
const DIR = path.join(__dirname, '..') + '/';

// ── data.js in an isolated context, for the pure TARGETS/target functions ──
global.window = global.window || {};
vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
const D = global.window.NEOFEED_DATA;

T.section('TARGETS.fluid — birth-weight floor (Pp, 2026-09-24)', () => {
  // A VLBW infant: birth 1050 g, nadir 980 g (below birth) on DOL 3.
  T.eq('un-floored, the 980 g nadir falls into the ELBW tier', D.TARGETS.fluid(3, 980), [120, 140]);
  T.eq('floored at birth, it stays in the VLBW tier', D.TARGETS.fluid(3, 980, 1050), [110, 130]);
  T.eq('…which equals the birth-weight tier', D.TARGETS.fluid(3, 980, 1050), D.TARGETS.fluid(3, 1050));
  // Once regained / grown, it tracks current weight again.
  T.eq('after regain it tracks current weight', D.TARGETS.fluid(3, 1600, 1050), D.TARGETS.fluid(3, 1600));
  // Backward-compatible when no birth weight is given.
  T.eq('no bwG → legacy behaviour (no floor)', D.TARGETS.fluid(3, 980), D.TARGETS.fluid(3, 980, 0));
});

T.section('NPE:AA < 20 is a warning, not a save-blocking stop (already true; guard)', () => {
  // rangeStatus with the hard-high 32 only: below 20 is not "crit".
  T.ok('a low NPE:AA (18) is not crit', D.rangeStatus(18, [24, 32], { hardHi: 32 }) !== 'crit',
    D.rangeStatus(18, [24, 32], { hardHi: 32 }));
  T.ok('a high NPE:AA (34) is crit', D.rangeStatus(34, [24, 32], { hardHi: 32 }) === 'crit',
    D.rangeStatus(34, [24, 32], { hardHi: 32 }));
});

// ── registerPatient collision, via the backend sandbox ──
const P = (sid, extra) => Object.assign({
  sessionId: sid, name: 'ทารก ' + sid, initials: sid.slice(0, 2), bw: 980, ga: 28.1, sex: 'boys',
  dob: '2026-09-01', admissionDate: '2026-09-01', twinSuffix: '', status: 'Active',
  currentBed: '', diagnosis: 'RDS', weights: [{ dol: 1, w: 980 }], lengths: [], hcs: [], bedHistory: [],
  statusDate: '', multiplesCount: 0,
}, extra || {});
function ward() {
  const g = boot();
  g.addStaff('doc@kcmh.test', 'doctor', 'Doctor-Password-1');
  g.dt = g.session('doc@kcmh.test', 'doctor');
  g.as = (body) => g.post(Object.assign({ token: g.dt }, body));
  return g;
}
const nameOf = (g, sid) => (g.rows('Patient_Registry').find(r => String(r[0]) === sid) || [])[1];

T.section('registerPatient collision — warn, then confirm-overwrite', () => {
  const g = ward();
  const r1 = g.as({ action: 'registerPatient', isNew: true, patient: P('KL-BW980', { dob: '2026-09-01', name: 'ล1' }) });
  T.ok('first registration ok', r1.ok === true, r1);
  const r2 = g.as({ action: 'registerPatient', isNew: true, patient: P('KL-BW980', { dob: '2026-09-05', name: 'ล2' }) });
  T.ok('a colliding id returns needsConfirm (not a silent overwrite)', r2.needsConfirm === true, r2);
  T.eq('…and the existing record is untouched', nameOf(g, 'KL-BW980'), 'ล1');
  const r3 = g.as({ action: 'registerPatient', isNew: true, confirmOverwrite: true, patient: P('KL-BW980', { dob: '2026-09-05', name: 'ล2' }) });
  T.ok('confirmOverwrite writes it', r3.ok === true, r3);
  T.eq('…and the record is now the second infant', nameOf(g, 'KL-BW980'), 'ล2');
});

T.done();
