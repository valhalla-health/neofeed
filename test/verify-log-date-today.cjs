// verify-log-date-today.cjs — "New log → วันนี้" opens an ordinary order, not a back-fill
// (found 2026-09-17 while capturing the Thai user guide).
//
// LogDateModal returns today's date string for "วันนี้", and startAddToday
// stored any non-null date as logDate — which is exactly what makes the
// Calculator show "กำลังบันทึกย้อนหลังสำหรับวันที่ …". Today's order therefore
// opened announcing a back-fill. A real past date must still announce one.
//
//   #1  วันนี้ → no back-fill banner
//   #2  a past date → the back-fill banner names that date
//
// Dev-only deps as in test/README.md. Scenario isolation via review-0917-boot.
const { boot, runScenarios, mkPatient, TODAY, addDays } = require('./review-0917-boot.cjs');

async function openNewLog(t) {
  await t.start();
  await t.pickWard('NICU');
  await t.openPatientRow(/AA/);
  await t.rail(/Dashboard/);
  await t.click(t.btn(/New log/));
}

const scenarios = {
  async 'today'(A) {
    console.log('\n── #1 New log → วันนี้ ──');
    const t = boot({ patients: [mkPatient()] });
    t.quiet();
    await openNewLog(t);
    A.ok('1.0 the date dialog opened', /บันทึกข้อมูลโภชนาการ/.test(t.bodyText()));
    await t.click(t.btn(/ดำเนินการต่อ/));
    A.ok('1.1 the calculator is open', /TPN \+ Enteral nutrition order/.test(t.text()));
    A.ok('1.2 …without a back-fill banner', !/กำลังบันทึกย้อนหลัง/.test(t.text()));
  },

  async 'past-date'(A) {
    console.log('\n── #2 New log → a past date ──');
    const t = boot({ patients: [mkPatient()] });
    t.quiet();
    await openNewLog(t);
    await t.click([...document.querySelectorAll('input[name="logdate-mode"]')].pop());
    const past = addDays(TODAY, -1);
    const dateInput = [...document.querySelectorAll('input[type="date"]')].pop();
    await t.typeInto(dateInput, past);
    await t.click(t.btn(/ดำเนินการต่อ/));
    A.ok('2.1 the back-fill banner is shown', /กำลังบันทึกย้อนหลัง/.test(t.text()));
    const [y, m, d] = past.split('-').map(Number);
    A.ok('2.2 …naming that date (day of month)', new RegExp(`กำลังบันทึกย้อนหลังสำหรับวันที่ ${d} `).test(t.text()));
  },
};

runScenarios(__filename, 'LOG DATE: TODAY VS BACK-FILL', scenarios);
