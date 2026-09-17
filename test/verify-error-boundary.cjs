// verify-error-boundary.cjs — a render error no longer blanks the whole app
// (BACKLOG "There is no error boundary"; 2026-09-17 review).
//
// Before: any exception thrown while rendering unmounted the entire tree and
// left a white page — reproduced in the review by one `weights:[null]` record
// (every ward device, on the next sync) and by an unknown sex on the Growth
// chart. After: a boundary around the workspace shows what happened, keeps the
// rail, topbar and sync usable, and clears itself when the user moves to
// another view; a second boundary wraps the whole app.
//
//   #1  a synced record with a null weights[] element renders (data.js helpers
//       are null-safe)
//   #2  a view that throws while rendering → Thai fallback, rail still there,
//       navigating to another view recovers
//   #3  the root boundary wraps <AppRoot/> (static)
//
// Dev-only deps as in test/README.md. Scenario isolation via review-0917-boot.
const fs = require('fs');
const path = require('path');
const { boot, runScenarios, mkPatient } = require('./review-0917-boot.cjs');

const scenarios = {
  async 'null-weight'(A) {
    console.log('\n── #1 a record with weights:[null] still renders ──');
    const t = boot({ patients: [
      mkPatient({ sessionId: 'NW-BW900', name: 'NW', initials: 'NW', currentBed: 'NICU 1', weights: [null, { dol: 1, w: 900 }, null] }),
    ] });
    t.quiet();
    await t.start();
    await t.pickWard('NICU');
    A.ok('1.1 the registry lists the patient', /NW/.test(t.text()));
    A.ok('1.2 no fallback is shown', !/แสดงผลไม่ได้/.test(t.text()));
    await t.openPatientRow(/NW/);
    A.ok('1.3 the patient opens (strip rendered)', !!document.querySelector('.patient-strip'));
    A.ok('1.4 no fallback after opening either', !/แสดงผลไม่ได้/.test(t.text()));
    A.eq('1.5 lastWeighed skips null elements', t.D().lastWeighed({ weights: [{ dol: 1, w: 900 }, null] }), { dol: 1, w: 900 });
    A.eq('1.6 weightAtOrBeforeDol skips null elements', t.D().weightAtOrBeforeDol({ weights: [{ dol: 1, w: 900 }, null] }, 5), 900);
  },

  async 'view-throws'(A) {
    console.log('\n── #2 a view that throws while rendering ──');
    const t = boot();
    t.quiet();
    await t.start();
    await t.pickWard('NICU');
    A.ok('2.0 the app is up', /NICU/.test(t.text()));
    // FormulasPanel reads EN_DB while rendering; make exactly that read throw.
    Object.defineProperty(t.D(), 'EN_DB', { get() { throw new Error('simulated render failure'); }, configurable: true });
    await t.rail(/Formulas/);
    A.ok('2.1 the fallback says the page could not render', /หน้านี้แสดงผลไม่ได้/.test(t.text()));
    A.ok('2.2 …and that saved data is unaffected', /ข้อมูลที่บันทึกแล้วไม่ได้รับผลกระทบ/.test(t.text()));
    A.ok('2.3 the rail is still on screen', document.querySelectorAll('.rail-item').length > 0);
    A.ok('2.4 the topbar is still on screen', !!document.querySelector('.topbar'));
    A.ok('2.5 the fallback is announced (role=alert)', !!document.querySelector('[role="alert"]'));
    A.ok('2.6 it offers a way back and a reload', !!t.btn(/กลับไปหน้ารายชื่อผู้ป่วย/) && !!t.btn(/^โหลดใหม่$/));
    await t.rail(/Patients/);
    A.ok('2.7 moving to another view clears the fallback', !/แสดงผลไม่ได้/.test(t.text()));
    A.ok('2.8 …and that view renders', /เปลี่ยน ward|NICU/.test(t.text()));
  },

  async 'root-static'(A) {
    console.log('\n── #3 root boundary ──');
    const src = fs.readFileSync(path.join(__dirname, '..', 'app.jsx'), 'utf8');
    A.ok('3.1 <AppRoot/> is mounted inside the root boundary',
      /\.render\(\s*<ViewErrorBoundary variant="root">\s*<AppRoot \/>\s*<\/ViewErrorBoundary>\s*\)/.test(src));
    A.ok('3.2 the workspace is wrapped by a view boundary keyed on view + patient',
      /<ViewErrorBoundary variant="view" resetKey=\{`\$\{view\}\|\$\{activeId \|\| ""\}`\}/.test(src));
  },
};

runScenarios(__filename, 'ERROR BOUNDARY', scenarios);
