// verify-pdpa-erased-dob-frontend.cjs — the client half of
// verify-pdpa-erased-dob-backend.cjs: a weight save sends no date of birth for
// a record this device knows was erased.
//
// app.jsx gives every synced record without a dob one derived from its
// admission date, and handleWeightUpdate sends it with each growth-chart and
// nurse-form weight save (F2, PR #108) so the server can settle a legacy record.
// An erased record has no dob because the erasure emptied it, and the derived
// one IS its erased date of birth. The server now refuses to store it; the
// client should not send it either.
//
// What the client cannot see: a device that synced BEFORE the erasure still
// holds the real name and dob, so nothing on it says "erased". Only the server
// can refuse that write — § 2 of the backend harness.
//
// Drives the real <App/> in jsdom against the fake Apps Script in
// review-0917-boot.cjs, one scenario per process. Dev-only deps as in
// test/README.md. Scenario 1 fails on 4434a77 and on 2731387, from the sources
// and from compiled/.
const { boot, runScenarios, mkPatient, addDays, TODAY } = require('./review-0917-boot.cjs');

const ADMIT = addDays(TODAY, -10);   // admitted ten days ago…
const DOB = addDays(TODAY, -14);     // …on day of life 5
const onFile = { dob: '', admissionDate: ADMIT, currentBed: 'NICU 1', weights: [{ dol: 5, w: 900, l: null, hc: null }] };

async function saveWeightFromGrowthChart(t, row, grams) {
  await t.start();
  await t.pickWard('NICU'); await t.openPatientRow(row); await t.rail(/Growth chart/);
  await t.typeInto(t.fieldInput('Wt'), grams);
  await t.click(t.btn(/Save measurement/));
  return t.callsOf('updateWeights').pop();
}

const scenarios = {
  async 'erased'(A) {
    console.log('\n── 1 · an erased record: the weight is sent, the derived dob is not ──');
    const t = boot({ patients: [mkPatient({ ...onFile, sessionId: 'AB-BW900', name: '[PDPA-erased 2026-09-24]', initials: '' })] });
    t.quiet();
    const sent = await saveWeightFromGrowthChart(t, /PDPA-erased/, 955);
    A.ok('1.1 the growth chart sent the weight save', !!sent);
    A.ok('1.2 …with today\'s weight in it', !!sent && sent.weights.some(w => w.w === 955));
    A.ok('1.3 …and no dob key at all', !!sent && !Object.prototype.hasOwnProperty.call(sent, 'dob'));
    A.eq('1.4 the server was sent no birth date for this record', sent && sent.dob, undefined);
  },

  async 'legacy-control'(A) {
    console.log('\n── 2 · control: the same record, never erased, still sends its derived dob (F2) ──');
    const t = boot({ patients: [mkPatient({ ...onFile, sessionId: 'AB-BW900', name: 'AB', initials: 'AB' })] });
    t.quiet();
    const sent = await saveWeightFromGrowthChart(t, /AB/, 955);
    A.ok('2.1 the growth chart sent the weight save', !!sent);
    A.ok('2.2 …with today\'s weight in it', !!sent && sent.weights.some(w => w.w === 955));
    A.eq('2.3 …and the dob derived from the admission date', sent && sent.dob, DOB);
  },
};

runScenarios(__filename, 'PDPA · NO DOB SENT FOR AN ERASED RECORD', scenarios);
