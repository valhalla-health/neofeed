// verify-back-button-1012.cjs — the phone's Back button moves back inside the
// app (Pp, 2026-10-12: "ให้ปุ่ม back ย้อนกลับในแอป").
//
// NeoFeed is one page, so on Android the first Back left the app, and the
// sign-in with it (sessionStorage). app.jsx now keeps one history entry on top
// of the page while there is somewhere to go back to, and Back takes one step:
//
//   #1 ward     ward list → gate; on the gate, nothing of ours is left on the
//               history, so the next Back leaves the app as before
//   #2 patient  Growth → Dashboard → ward list (the ward kept) → gate
//   #3 calc     a new order → its Dashboard; Reference values → back where it was
//   #4 print    an order opened from the print list → the list → gate
//   #5 dialog   Back closes an open dialog and nothing else
//   #6 tap      reaching the gate by a tap drops our entry too; a search typed
//               in a ward is gone after Back to the gate
//
// jsdom implements history.pushState / back() and fires popstate, which is all
// the code uses. Drives the real <App/> through review-0917-boot.
const { boot, runScenarios, mkPatient, TODAY } = require('./review-0917-boot.cjs');

const CI = { curWtG: 900, fluidTargetPerKg: 150, otherIV_mL: 0, drug_mL: 0, ioInput: 130, ioOutput: 60, drainContent: 0,
  totalTPN_mL: 110, dexPct: 12.5, aaPerKg: 3, lipidPerKg: 3, naCl: 2, kCl: 1, caPerKg: 60, glycophosP: 1 };
const patients = [
  mkPatient({ sessionId: 'AA-1', name: 'AA', initials: 'AA', currentBed: 'NICU 1' }),
  mkPatient({ sessionId: 'BB-1', name: 'BB', initials: 'BB', currentBed: 'NICU 2' }),
];
const log = { 'AA-1': [{ entryId: 'e-aa', lastModified: TODAY + 'T02:00:00.000Z', ts: TODAY, dol: 5, weight: 900,
  ioInput: 130, ioOutput: 60, drainContent: 0, status: 'submitted', calcInput: CI }] };

async function setup() {
  const t = boot({ patients, log });
  t.quiet();
  t.window.print = () => {};
  await t.start();
  t.back = async () => {
    await t.act(async () => { t.window.history.back(); });
    for (let i = 0; i < 4; i++) await t.flush();
  };
  return t;
}
const atGate = () => !!document.querySelector('.ward-gate');
const ourEntryOnTop = (t) => !!(t.window.history.state && t.window.history.state.neofeedBack);
const heading = () => document.querySelector('.page-head h1')?.textContent || '';
const railActive = () => document.querySelector('.rail-item.active')?.textContent || '';

const scenarios = {
  async 'ward'(A) {
    console.log('\n── #1 ward list → gate, then Back leaves ──');
    const t = await setup();
    A.ok('1.0 the gate keeps nothing on the history', atGate() && !ourEntryOnTop(t));
    await t.pickWard('NICU');
    A.ok('1.1 a ward puts one entry on the history', ourEntryOnTop(t));
    await t.back();
    A.ok('1.2 Back returns to the gate', atGate());
    A.ok('1.3 …and leaves nothing of ours on top, so the next Back leaves the app', !ourEntryOnTop(t));
  },

  async 'patient'(A) {
    console.log('\n── #2 patient screens step back to the Dashboard, then the ward ──');
    const t = await setup();
    await t.pickWard('NICU');
    await t.openPatientRow(/AA/);
    await t.rail(/Growth/);
    A.ok('2.0 on the Growth chart', /Fenton 2025 growth chart/.test(heading()));
    await t.back();
    A.ok('2.1 Back: the Dashboard', /Dashboard/.test(railActive()) && !atGate());
    await t.back();
    A.ok('2.2 Back: NICU\'s list, ward kept', /NICU/.test(heading()) && !!document.querySelector('.reg-stats'));
    await t.back();
    A.ok('2.3 Back: the gate', atGate() && !ourEntryOnTop(t));
  },

  async 'calc'(A) {
    console.log('\n── #3 the calculator and the reference screens ──');
    const t = await setup();
    await t.pickWard('NICU');
    await t.openPatientRow(/BB/);
    await t.click(t.btn(/New log/));
    if (t.btn(/ดำเนินการต่อ/)) await t.click(t.btn(/ดำเนินการต่อ/));
    A.ok('3.0 a new order is open', /TPN \+ Enteral nutrition order/.test(heading()));
    await t.click(t.btn(/Reference values/));
    A.ok('3.1 Reference values open', !/TPN \+ Enteral/.test(heading()));
    await t.back();
    A.ok('3.2 Back: the calculator it was opened from', /TPN \+ Enteral nutrition order/.test(heading()));
    await t.back();
    A.ok('3.3 Back: the infant\'s Dashboard', /Dashboard/.test(railActive()));
  },

  async 'print'(A) {
    console.log('\n── #4 an order opened from the print list ──');
    const t = await setup();
    await t.click(document.querySelector('.ward-print'));
    await t.click([...document.querySelectorAll('.print-row')].find(r => /AA/.test(r.textContent)));
    for (let i = 0; i < 4; i++) await t.flush();
    A.ok('4.0 the order is open in the calculator', /แก้ไขบันทึกโภชนาการ/.test(heading()));
    await t.back();
    A.ok('4.1 Back: the print list', /Print order · NICU/.test(heading()));
    await t.back();
    A.ok('4.2 Back: the gate', atGate() && !ourEntryOnTop(t));
  },

  async 'dialog'(A) {
    console.log('\n── #5 Back closes a dialog, and only the dialog ──');
    const t = await setup();
    await t.pickWard('NICU');
    await t.click(t.btn(/New session/));
    A.ok('5.0 the register dialog is open', !!document.querySelector('.picker-backdrop'));
    await t.back();
    A.ok('5.1 Back closes it', !document.querySelector('.picker-backdrop'));
    A.ok('5.2 …and stays on NICU\'s list', /NICU/.test(heading()) && !atGate());
    A.ok('5.3 …with the entry back on top for the next Back', ourEntryOnTop(t));
  },

  async 'tap'(A) {
    console.log('\n── #6 the gate by a tap; the search does not follow ──');
    const t = await setup();
    await t.pickWard('NICU');
    await t.typeInto(document.querySelector('.reg-search input'), 'BB');
    await t.click(t.btn(/เปลี่ยน ward/));
    for (let i = 0; i < 3; i++) await t.flush();
    A.ok('6.0 the gate by a tap drops our entry, so Back leaves the app', atGate() && !ourEntryOnTop(t));
    await t.pickWard('NICU');
    await t.typeInto(document.querySelector('.reg-search input'), 'BB');
    await t.back();
    await t.pickWard('NICU');
    A.eq('6.1 a search typed in the ward is gone after Back', document.querySelector('.reg-search input').value, '');
  },
};

runScenarios(__filename, 'BACK BUTTON INSIDE THE APP', scenarios);
