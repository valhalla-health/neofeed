// verify-bed-transfer-0927-sync.cjs — after a patient save, a device shows
// what the SERVER kept (the bed-transfer review, 2026-09-27).
//
// gas-backend.gs merges every patient save three ways: a field this save did
// not change keeps whatever is stored, so another device's bed move made while
// an Edit was open survives the save. The saving device, though, put its own
// record into state and into the merge base, and kept showing it until the
// next poll, up to SYNC_POLL_MS (4 min) later. In that window the ward list
// showed the old bed, and a ⇄ recorded that old bed as "Previous bed" and
// built occupancy on it. Pp: sync straight after a successful save.
//
// Drives the REAL <App/> in jsdom against review-0917-boot.cjs's stateful fake
// Apps Script, given the server's three-way merge for this one scenario.
//
//   #1  Edit opens on SCN 1; another device moves the infant to SCN 9; this
//       device saves a diagnosis. It syncs once, lists SCN 9, and a park from
//       it records SCN 9 as the bed left.
//
// FAILS against f675420 (release 10a4272): no sync follows a successful save.
const { boot, runScenarios, mkPatient, TODAY } = require('./review-0917-boot.cjs');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const scenarios = {
  async 'resync-after-save'(A) {
    console.log('\n── #1 after a successful save the device syncs, and shows the bed the server kept ──');
    const t = boot({ patients: [mkPatient({ currentBed: 'SCN 1' })] });
    t.quiet();
    // The server's merge (gas-backend.gs _mergePatient), reduced to what this
    // scenario needs: a field equal to base keeps the stored value, and
    // bedHistory entries new to this save are appended.
    t.server.hooks.registerPatient = (body, srv) => {
      if (!body.base) return undefined;
      const stored = srv.patients.find(p => p.sessionId === body.patient.sessionId);
      for (const k of Object.keys(body.patient)) {
        if (k !== 'bedHistory' && !same(body.patient[k], body.base[k])) stored[k] = JSON.parse(JSON.stringify(body.patient[k]));
      }
      for (const h of body.patient.bedHistory || []) {
        const known = (body.base.bedHistory || []).some(x => same(x, h)) || stored.bedHistory.some(x => same(x, h));
        if (!known) stored.bedHistory.push(h);
      }
      return { reply: { ok: true } };
    };
    await t.start();
    await t.pickWard('SCN');
    const tableBtn = (label) => [...document.querySelectorAll('.patient-table button')].find(b => b.textContent.trim() === label);
    const bedCell = () => [...document.querySelectorAll('.patient-table tbody tr')].find(r => /AA/.test(r.textContent))?.cells[0].textContent.trim();
    A.eq('1.1 the infant starts in SCN 1', bedCell(), 'SCN 1');

    await t.click(tableBtn('Edit'));
    // Another device moves the infant while this Edit is open.
    const s = t.server.patients[0];
    s.bedHistory = [...s.bedHistory, { bed: 'SCN 1', date: TODAY, at: '2026-09-27T01:00:00.000Z' }];
    s.currentBed = 'SCN 9';
    await t.typeInto(t.fieldInput('Diagnosis', document.querySelector('.picker')), 'RDS, PDA');
    const syncsBefore = t.syncCalls().length;
    await t.click(t.btn(/Save changes/));
    await t.flush(); await t.flush(); await t.flush();

    A.eq('1.2 the server kept the other device\'s bed', t.server.patients[0].currentBed, 'SCN 9');
    A.eq('1.3 …and this save\'s diagnosis', t.server.patients[0].diagnosis, 'RDS, PDA');
    A.eq('1.4 the device synced once after the save', t.syncCalls().length - syncsBefore, 1);
    A.eq('1.5 its list shows SCN 9, where the server has the infant', bedCell(), 'SCN 9');

    await t.click(tableBtn('⇄'));
    await t.click(t.btn(/^พักไว้ก่อน$/));
    const park = t.callsOf('registerPatient').pop();
    A.eq('1.6 a park right after records SCN 9 as the bed left', park && park.patient.bedHistory.at(-1).bed, 'SCN 9');
    A.eq('1.7 …on a base holding SCN 9', park && park.base && park.base.currentBed, 'SCN 9');
  },
};

runScenarios(__filename, 'BED TRANSFER 0927 · SYNC AFTER SAVE', scenarios);
