// verify-back-button-1012.cjs — the phone's Back button moves back inside the
// app (Pp, 2026-10-12: "ให้ปุ่ม back ย้อนกลับในแอป").
//
// NeoFeed is one page, so on Android the first Back left the app, and the
// sign-in with it (sessionStorage). app.jsx now keeps one history entry on top
// of the page while there is somewhere to go back to, and Back takes one step:
//
//   #1 ward     ward list → gate
//   #2 patient  Growth → Dashboard → ward list (the ward kept) → gate
//   #3 calc     a new order → its Dashboard; Reference values → back where it was
//   #4 print    an order opened from the print list → the list → gate
//   #5 dialog   Back closes an open dialog and nothing else
//   #6 tap      a search typed in a ward is gone after Back to the gate
//   #7 exit     on the gate, Back asks for a second Back within 2 s (Pp,
//               2026-10-12: "ออกจากแอป?"): a toast, no entry of ours for
//               those 2 s so the next Back leaves, then the entry is back
//   #8 held     Reference values opened from an edit or a back-fill: Back
//               goes to the Dashboard, never a new order for today (Vera)
//   #9 confirm  Back on Register new session, Edit session or Transfer bed
//               asks before closing it (Pp, 2026-10-12: "ให้ alert ขึ้นมาว่า
//               ต้องการออกจากหน้า ... ? ข้อมูลที่พิมพ์ไว้จะหายไป")
//   #10 rearm   Back after Back with no tap between: the entry comes back by
//               moving forward onto it, never by a new pushState
//
// jsdom implements history.pushState / back() / forward() and fires popstate,
// which is all the code uses. Drives the real <App/> through review-0917-boot.
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
const dialogTitle = () => document.querySelector('.picker-h > div')?.textContent || '';
// window.confirm that records each question and answers `answer.ok`.
const spyConfirm = (t, answer) => {
  const asked = [];
  t.window.confirm = (m) => { asked.push(m); return answer.ok; };
  return asked;
};

const scenarios = {
  async 'ward'(A) {
    console.log('\n── #1 ward list → gate, then Back leaves ──');
    const t = await setup();
    A.ok('1.0 signed in, our entry is on the history', atGate() && ourEntryOnTop(t));
    const len = t.window.history.length;
    await t.pickWard('NICU');
    A.ok('1.1 picking a ward adds no second entry', ourEntryOnTop(t) && t.window.history.length === len);
    await t.back();
    A.ok('1.2 Back returns to the gate', atGate());
    A.ok('1.3 …with the entry back on top', ourEntryOnTop(t));
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
    A.ok('2.3 Back: the gate', atGate());
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
    A.ok('4.2 Back: the gate', atGate());
  },

  async 'dialog'(A) {
    console.log('\n── #5 Back closes a dialog, and only the dialog ──');
    const t = await setup();
    await t.pickWard('NICU');
    await t.openPatientRow(/BB/);
    await t.click(t.btn(/New log/));
    A.ok('5.0 the new-order date dialog is open', /บันทึกข้อมูลโภชนาการ/.test(dialogTitle()));
    const asked = spyConfirm(t, { ok: false });
    await t.back();
    A.ok('5.1 Back closes it, without asking', !document.querySelector('.picker-backdrop') && asked.length === 0);
    A.ok('5.2 …and stays on BB\'s Dashboard', /Dashboard/.test(railActive()) && !atGate());
    A.ok('5.3 …with the entry back on top for the next Back', ourEntryOnTop(t));
  },

  async 'tap'(A) {
    console.log('\n── #6 the gate by a tap; the search does not follow ──');
    const t = await setup();
    await t.pickWard('NICU');
    await t.typeInto(document.querySelector('.reg-search input'), 'BB');
    await t.click(t.btn(/เปลี่ยน ward/));
    A.ok('6.0 the gate by a tap keeps the entry for Back', atGate() && ourEntryOnTop(t));
    await t.pickWard('NICU');
    await t.typeInto(document.querySelector('.reg-search input'), 'BB');
    await t.back();
    await t.pickWard('NICU');
    A.eq('6.1 a search typed in the ward is gone after Back', document.querySelector('.reg-search input').value, '');
  },
};

scenarios['exit'] = async (A) => {
  console.log('\n── #7 on the gate, Back asks for a second Back ──');
  const t = await setup();
  await t.back();
  A.ok('7.0 the first Back on the gate stays in the app', atGate());
  A.ok('7.1 …and says a second Back leaves, and costs a login',
    t.toasts().some(m => /กด Back อีกครั้งเพื่อออกจาก NeoFeed — ออกแล้วต้อง login ใหม่/.test(m)));
  A.ok('7.2 …with no entry of ours on top, so the second Back leaves the app', !ourEntryOnTop(t));
  await t.flush(2200);
  await t.flush();   // the entry returns by history.forward(), which lands a task later
  A.ok('7.3 after 2 s the entry is back: a later Back asks again', ourEntryOnTop(t));
  await t.back();
  await t.pickWard('NICU');
  A.ok('7.4 moving off the gate inside the 2 s puts the entry back at once', ourEntryOnTop(t));
  await t.back();
  A.ok('7.5 …so Back from the ward is a step, not an exit', atGate());
  A.ok('7.6 …and back on the gate the entry is there again: the next Back asks, not leaves', ourEntryOnTop(t));
};

scenarios['held'] = async (A) => {
  console.log('\n── #8 Reference values from an edit or a back-fill ──');
  const t = await setup();
  await t.pickWard('NICU');
  await t.openPatientRow(/AA/);
  await t.click([...document.querySelectorAll('tr')].find(r => /Submitted/.test(r.textContent)));
  A.ok('8.0 editing AA\'s saved order', /แก้ไขบันทึกโภชนาการ/.test(heading()));
  await t.click(t.btn(/Reference values/));
  await t.back();
  A.ok('8.1 Back goes to the Dashboard, not a new order for today',
    /Dashboard/.test(railActive()) && !/TPN \+ Enteral nutrition order/.test(heading()));

  await t.click(t.btn(/New log/));
  const modes = [...document.querySelectorAll('input[name="logdate-mode"]')];
  await t.click(modes[modes.length - 1]);
  const past = new Date(Date.parse(TODAY + 'T00:00:00Z') - 2 * 864e5).toISOString().slice(0, 10);
  await t.typeInto([...document.querySelectorAll('input[type="date"]')].pop(), past);
  await t.click(t.btn(/ดำเนินการต่อ/));
  A.ok('8.2 a back-filled order is open', /กำลังบันทึกย้อนหลัง/.test(t.text()));
  await t.click(t.btn(/Reference values/));
  await t.back();
  A.ok('8.3 Back goes to the Dashboard, not today\'s order', /Dashboard/.test(railActive()) && !/TPN \+ Enteral/.test(heading()));

  // The third way an edit reaches the calculator: the ward's print list.
  await t.rail(/Patients/);
  await t.click(t.btn(/เปลี่ยน ward/));
  await t.click(document.querySelector('.ward-print'));
  await t.click([...document.querySelectorAll('.print-row')].find(r => /AA/.test(r.textContent)));
  for (let i = 0; i < 4; i++) await t.flush();
  A.ok('8.4 an order opened from the print list', /แก้ไขบันทึกโภชนาการ/.test(heading()));
  await t.click(t.btn(/Reference values/));
  await t.back();
  A.ok('8.5 Back from Reference values: the Dashboard, not a new order', /Dashboard/.test(railActive()) && !/TPN \+ Enteral/.test(heading()));
};

scenarios['confirm'] = async (A) => {
  console.log('\n── #9 Back on Register new session, Edit session or Transfer bed asks first ──');
  const t = await setup();
  const answer = { ok: false };
  const asked = spyConfirm(t, answer);
  await t.pickWard('NICU');

  await t.click(t.btn(/New session/));
  const initials = [...document.querySelectorAll('.picker input')].find(i => i.type === 'text');   // Thai initials only
  await t.typeInto(initials, 'รย');
  await t.back();
  A.eq('9.0 Back on Register new session asks, in Pp\'s words',
    asked[0], 'ต้องการออกจากหน้า Register new session ?\nข้อมูลที่พิมพ์ไว้จะหายไป');
  A.ok('9.1 …Cancel keeps it open, with what was typed', dialogTitle() === 'Register new session' && initials.value === 'รย');
  A.ok('9.2 …and the entry is back on top, so the next Back asks again', ourEntryOnTop(t));
  answer.ok = true;
  await t.back();
  A.ok('9.3 OK closes it', !document.querySelector('.picker-backdrop') && asked.length === 2);
  A.ok('9.4 …and stays on NICU\'s list', /NICU/.test(heading()) && !atGate());

  await t.click(document.querySelector('.pmc-bed'));
  answer.ok = false;
  await t.back();
  A.ok('9.5 Back on Transfer bed asks', /^ต้องการออกจากหน้า Transfer bed \?\nข้อมูลที่พิมพ์ไว้จะหายไป$/.test(asked[2] || '')
    && /^Transfer bed/.test(dialogTitle()));
  answer.ok = true;
  await t.back();
  A.ok('9.6 …OK closes it', !document.querySelector('.picker-backdrop'));

  await t.openPatientRow(/AA/);
  await t.click(t.btn(/Edit session/));
  answer.ok = false;
  await t.back();
  A.ok('9.7 Back on Edit session asks', /^ต้องการออกจากหน้า Edit session \?\nข้อมูลที่พิมพ์ไว้จะหายไป$/.test(asked[4] || '')
    && /^Edit session/.test(dialogTitle()));
  answer.ok = true;
  await t.back();
  A.ok('9.8 …OK closes it and leaves AA\'s Dashboard where it was',
    !document.querySelector('.picker-backdrop') && /Dashboard/.test(railActive()));

  // Pp asked about Back. A tap outside still closes the dialog as before.
  const n = asked.length;
  await t.click(t.btn(/Edit session/));
  await t.click(document.querySelector('.picker-backdrop'));
  A.ok('9.9 a tap outside still closes Edit session without asking', !document.querySelector('.picker-backdrop') && asked.length === n);
};

scenarios['rearm'] = async (A) => {
  console.log('\n── #10 Back after Back, with no tap between ──');
  // Chrome's history-manipulation intervention: when a page pushes an entry
  // without a user activation, Back later skips the entry it was pushed from.
  // popstate is not an activation, so re-pushing the guard after each Back made
  // the second Back in a row leave NeoFeed (Chromium, dev-local run of #155).
  // jsdom has no intervention, so this checks the cause: no push after a Back.
  const t = await setup();
  await t.pickWard('NICU');
  await t.openPatientRow(/AA/);
  await t.rail(/Growth/);
  const pushes = [];
  const realPush = t.window.history.pushState.bind(t.window.history);
  t.window.history.pushState = (...args) => { pushes.push(args[0]); return realPush(...args); };
  const len = t.window.history.length;
  await t.back();
  await t.back();
  await t.back();
  A.ok('10.0 three Backs in a row: Growth → Dashboard → ward list → gate', atGate());
  A.eq('10.1 …with no entry pushed on the way', pushes.length, 0);
  A.ok('10.2 …and the entry on top again each time, the history no longer', ourEntryOnTop(t) && t.window.history.length === len);
  await t.back();
  A.ok('10.3 a fourth Back, on the gate, asks for a second', !ourEntryOnTop(t)
    && t.toasts().some(m => /กด Back อีกครั้งเพื่อออกจาก NeoFeed/.test(m)));
  await t.flush(2200);
  await t.flush();
  A.ok('10.4 after 2 s the entry is back, still with no push', ourEntryOnTop(t) && pushes.length === 0);
};

runScenarios(__filename, 'BACK BUTTON INSIDE THE APP', scenarios);
