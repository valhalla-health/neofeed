// 2026-09-17 shell review — sessions, login and the patient views. Drives the
// REAL <App/> in jsdom against the fake Apps Script in review-0917-boot.cjs,
// one scenario per process.
//
//   #1  UP-S13/SEC-F1  30 minutes without input logs out — background syncs do
//                      not count as activity; the draft survives, the notice
//                      says why
//   #2  SEC-F2         logout leaves nothing of the previous user on screen: the
//                      next user gets the first-load gate, not the admin view
//   #3  UP-S7          an expired session says so on the login screen, and its
//                      toast is not thrown away with the workspace
//   #4  maxAge         the 12-hour cap has its own notice
//   #5  UP-S12         login works when the browser blocks storage
//   #6  UP-S11/UP-S8   Google Sign-In failing to load is said out loud; an HTML
//                      login reply is a Thai sentence, not "Unexpected token"
//   #7  UP-S5          a double Enter on the forced password change sends one
//                      request and does not log out; a refusal shows in place
//   #8  UP-S10/UP-S17  a patient view with no patient offers the picker; Ctrl+K
//                      opens it (and not over the login screen)
//   #9  UP-S4          a sex the Fenton tables do not know: normalised where it
//                      can be, a message (not a white screen) where it cannot
//   #10 UP-S2          the growth-chart logger follows the patient it belongs to
const {
  boot, runScenarios, mkPatient, TODAY, DOCTOR, addDays,
} = require('./review-0917-boot.cjs');

const MIN = 60000;
const hasLoginScreen = () => !!document.querySelector('.login-wrap');
const noticeText = () => (document.querySelector('.login-notice') || {}).textContent || '';
const draftKey = `neofeed_draft_AA-BW900_${TODAY}`;
const seedStorage = (w) => {
  w.localStorage.setItem(draftKey, JSON.stringify({ curWtG: 950, savedAt: new Date().toISOString() }));
  w.localStorage.setItem('neofeed_calc_AA-BW900', JSON.stringify({ curWtG: 940, savedAt: new Date().toISOString() }));
  w.localStorage.setItem('neofeed_acked_AA-BW900', JSON.stringify({ 'weight-stale:6': 'x' }));
};
async function emailLogin(t, email = 'n@test.th') {
  await t.click(t.btn(/เข้าด้วย email อื่น/));
  const [em, pw] = document.querySelectorAll('.login-form-wrap input');
  await t.typeInto(em, email);
  await t.typeInto(pw, 'correct-horse-battery');
  await t.act(async () => {
    document.querySelector('.login-form-wrap form').dispatchEvent(new t.window.Event('submit', { bubbles: true, cancelable: true }));
  });
  await t.flush(); await t.flush();
}
const pickerOpen = () => !!document.querySelector('.picker input[placeholder^="ค้นหา"]');
const ctrlK = (t) => t.act(async () => {
  document.dispatchEvent(new t.window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
});

const scenarios = {
  async 'idle-logout'(A) {
    console.log('\n── #1 UP-S13 / SEC-F1: 30 minutes without input ends the session ──');
    const t = boot();
    t.quiet();
    seedStorage(t.window);
    await t.start();
    await t.pickWard('NICU');
    A.ok('1.0 signed in, on the ward list', /Total sessions/.test(t.text()));

    t.clock.advance(20 * MIN);
    await t.tick(30000);                       // the 4-min poll is due: a background sync goes out
    const syncsAt20 = t.syncCalls().length;
    A.ok('1.1 20 idle minutes: still signed in (and the poll ran)', !hasLoginScreen() && syncsAt20 >= 2);

    // Real input at minute 20 restarts the clock.
    await t.act(async () => { document.body.dispatchEvent(new t.window.KeyboardEvent('keydown', { key: 'a', bubbles: true })); });
    t.clock.advance(25 * MIN);
    await t.tick(30000);                       // polls again — must NOT count as activity
    A.ok('1.2 25 minutes after the last keypress: still signed in', !hasLoginScreen());
    A.ok('1.3 …a background sync ran in that time', t.syncCalls().length > syncsAt20);

    t.clock.advance(6 * MIN);                  // 31 minutes since the keypress
    await t.tick(30000);
    A.ok('1.4 31 minutes after the last input: back at the login screen', hasLoginScreen());
    A.ok('1.5 the notice says why', noticeText().includes('ออกจากระบบอัตโนมัติ — ไม่มีการใช้งาน 30 นาที'));
    const logout = t.callsOf('logout').pop();
    A.eq('1.6 the token was revoked server-side', logout && logout.token, DOCTOR.token);
    A.eq('1.7 the stored session is gone', t.window.sessionStorage.getItem('neofeed_session'), null);
    A.ok('1.8 the unsaved calculator draft is kept', !!t.window.localStorage.getItem(draftKey));
    A.eq('1.9 the prefill and alert acks are cleared (as on logout)',
      [t.window.localStorage.getItem('neofeed_calc_AA-BW900'), t.window.localStorage.getItem('neofeed_acked_AA-BW900')], [null, null]);
    A.ok('1.10 no patient data left on screen', !/AA|Total sessions/.test(t.text()));
    // A pointer tap counts as input too.
    await emailLogin(t);
    A.ok('1.11 the notice goes once someone signs in', !document.querySelector('.login-notice'));
    await t.pickWard('NICU');
    t.clock.advance(29 * MIN);
    await t.act(async () => { document.body.dispatchEvent(new t.window.Event('pointerdown', { bubbles: true })); });
    t.clock.advance(29 * MIN);
    await t.tick(30000);
    A.ok('1.12 a pointerdown also restarts the clock', !hasLoginScreen());
  },

  async 'logout-resets-state'(A) {
    console.log('\n── #2 SEC-F2: the next user starts from nothing ──');
    const t = boot({ session: { ...DOCTOR, role: 'admin', email: 'admin@test.th', name: 'Admin' } });
    t.quiet();
    seedStorage(t.window);
    await t.start();
    await t.pickWard('NICU');
    await t.rail(/Admin dashboard/);
    A.ok('2.0 the admin is on the admin dashboard', /Admin dashboard/.test(t.text()));
    await t.click(document.querySelector('.topbar .user'));
    await t.click(t.btn(/ออกจากระบบ/));
    A.ok('2.1 logout → login screen', hasLoginScreen());
    A.ok('2.2 a chosen logout shows no "why" notice', !document.querySelector('.login-notice'));
    A.eq('2.3 a chosen logout clears the drafts too (unchanged)', t.window.localStorage.getItem(draftKey), null);

    t.server.holdSyncs = true;
    await emailLogin(t);
    A.ok('2.4 the nurse gets the first-load gate', /กำลังโหลดข้อมูลผู้ป่วย|กำลังเชื่อมต่อ/.test(t.text()));
    A.ok('2.5 …not the admin dashboard', !/Admin dashboard/.test(t.text()));
    A.ok('2.6 …and no rail, no registry, nothing of the previous session', !document.querySelector('.rail') && !/Total sessions/.test(t.text()));
    A.eq('2.7 the nurse\'s sync carries the nurse\'s token', t.syncCalls().pop().token, 'tok-nurse-abcdefg');
    t.server.holdSyncs = false;
    await t.releaseSyncs();
    A.ok('2.8 once synced, the nurse starts at the ward gate', !!document.querySelector('.ward-gate'));
  },

  async 'late-answer-after-logout'(A) {
    console.log('\n── #2b SEC-F2: a late answer to the previous session cannot end the next one ──');
    const ADMIN = { ...DOCTOR, role: 'admin', email: 'admin@test.th', name: 'Admin', token: 'tok-admin-111' };
    const t = boot({ session: ADMIN });
    t.quiet();
    await t.start();
    await t.pickWard('NICU'); await t.openPatientRow(/AA/); await t.rail(/Growth chart/);
    // The admin's save is slow; by the time it answers, the logout has revoked
    // its token, so the answer is Unauthorized.
    let release;
    const gate = new Promise(r => { release = r; });
    t.server.hooks.updateWeights = (b) => (b.token === ADMIN.token ? { hold: gate, respond: () => ({ error: 'Unauthorized' }) } : undefined);
    await t.typeInto(t.fieldInput('Wt'), 950);
    await t.click(t.btn(/Save measurement/));
    await t.click(document.querySelector('.topbar .user'));
    await t.click(t.btn(/ออกจากระบบ/));
    await emailLogin(t);
    A.ok('2b.0 the nurse is signed in', !!document.querySelector('.ward-gate'));
    await t.act(async () => { release(); });
    await t.flush(); await t.flush();
    A.ok('2b.1 the admin\'s late Unauthorized does not log the nurse out', !hasLoginScreen() && !!document.querySelector('.ward-gate'));
    A.ok('2b.2 …nor toasts "session expired" at the nurse', !t.toasts().some(x => /เซสชัน/.test(x)));
    A.ok('2b.3 …and the nurse\'s session is still stored', /tok-nurse/.test(t.window.sessionStorage.getItem('neofeed_session') || ''));
  },

  async 'expiry-notice'(A) {
    console.log('\n── #3 UP-S7: an expired session explains itself ──');
    const t = boot();
    t.quiet();
    seedStorage(t.window);
    await t.start();
    await t.pickWard('NICU');
    t.server.hooks.getActivePatients = () => ({ reply: { error: 'Unauthorized' } });
    await t.click(t.syncButton());
    A.ok('3.1 expiry → login screen', hasLoginScreen());
    A.ok('3.2 with the expiry notice', noticeText().includes('เซสชันหมดอายุ — งานที่ยังไม่บันทึกถูกเก็บเป็นร่าง'));
    A.ok('3.3 the draft is kept', !!t.window.localStorage.getItem(draftKey));
    A.ok('3.4 nothing of the ward list remains', !/Total sessions/.test(t.text()));
    t.server.hooks = {};
    // Expiry through a WRITE: its toast must survive the workspace unmounting.
    await emailLogin(t);
    await t.pickWard('NICU'); await t.openPatientRow(/AA/); await t.rail(/Growth chart/);
    t.server.hooks.updateWeights = () => ({ reply: { error: 'Unauthorized' } });
    await t.typeInto(t.fieldInput('Wt'), 950);
    await t.click(t.btn(/Save measurement/));
    A.ok('3.5 a write refused as Unauthorized → login screen', hasLoginScreen());
    const host = document.getElementById('toast-host');
    A.ok('3.6 its toast is on screen', t.toasts().some(x => /เซสชันหมดอายุ/.test(x)));
    A.ok('3.7 …from a host outside the app tree', host && !document.getElementById('root').contains(host));
  },

  async 'max-age-notice'(A) {
    console.log('\n── #4 the 12-hour cap has its own notice ──');
    const t = boot();
    t.quiet();
    await t.start();
    t.server.hooks.getActivePatients = () => ({ reply: { error: 'Unauthorized', reason: 'SessionMaxAge' } });
    await t.click(t.syncButton());
    A.ok('4.1 SessionMaxAge → login screen', hasLoginScreen());
    A.ok('4.2 "เซสชันครบ 12 ชั่วโมง — กรุณาเข้าสู่ระบบใหม่"', noticeText().includes('เซสชันครบ 12 ชั่วโมง — กรุณาเข้าสู่ระบบใหม่'));
    A.ok('4.3 not the generic expiry text', !noticeText().includes('เซสชันหมดอายุ'));
  },

  async 'storage-blocked'(A) {
    console.log('\n── #5 UP-S12: login with site storage blocked ──');
    const t = boot({ session: null, storageBlocked: true });
    t.quiet();
    await t.start();
    A.ok('5.0 the login screen renders', hasLoginScreen());
    await emailLogin(t);
    A.ok('5.1 no "The operation is insecure." error', !/insecure/i.test(t.text()));
    A.ok('5.2 past the login screen', !hasLoginScreen());
    const sync = t.syncCalls()[0];
    A.eq('5.3 the sync carries the token from memory', sync && sync.token, 'tok-nurse-abcdefg');
    A.ok('5.4 the ward gate is reached', !!document.querySelector('.ward-gate'));
  },

  async 'login-failures'(A) {
    console.log('\n── #6 UP-S11 / UP-S8: the login screen explains failures ──');
    const t = boot({ session: null, extraHead: '<script src="https://accounts.google.com/gsi/client" async defer></script>' });
    t.quiet();
    await t.start();
    await ctrlK(t); await t.flush();
    await t.act(async () => { document.querySelector('script[src*="gsi/client"]').dispatchEvent(new t.window.Event('error')); });
    await t.flush();
    A.ok('6.1 Sign-In script error → "โหลด Google Sign-In ไม่สำเร็จ — ตรวจสอบเครือข่าย"',
      /โหลด Google Sign-In ไม่สำเร็จ — ตรวจสอบเครือข่าย/.test(t.text()));
    t.server.hooks.login = () => ({ html: true });
    await emailLogin(t);
    const err = (document.querySelector('.login-error') || {}).textContent || '';
    A.ok('6.2 an HTML reply reads as a Thai sentence', /เซิร์ฟเวอร์ตอบกลับผิดรูปแบบ/.test(err));
    A.ok('6.3 …not a JSON parser error', !/Unexpected token/.test(err));
    t.server.hooks = {};
    await t.act(async () => { document.querySelector('.login-form-wrap form').dispatchEvent(new t.window.Event('submit', { bubbles: true, cancelable: true })); });
    await t.flush(); await t.flush();
    A.ok('6.4 Ctrl+K pressed on the login screen did not open a picker later', !pickerOpen() && !!document.querySelector('.ward-gate'));
  },

  async 'password-double-enter'(A) {
    console.log('\n── #7 UP-S5: a double Enter on the password change ──');
    const t = boot({ session: { ...DOCTOR, mustChangePassword: true } });
    t.quiet();
    // Server model: epoch-bound tokens, changePassword rotates, and it is slow.
    let valid = new Set([DOCTOR.token]);
    t.server.hooks.changePassword = (b) => ({
      hold: new Promise(r => setTimeout(r, 150)),
      respond: () => {
        if (!valid.has(b.token)) return { error: 'Unauthorized' };
        valid = new Set(['tok-rotated-000']);
        return { ok: true, token: 'tok-rotated-000', mustChangePassword: false };
      },
    });
    await t.start();
    const inputs = [...document.querySelectorAll('.modal-box input')];
    await t.typeInto(inputs[0], 'TempPass123'); await t.typeInto(inputs[1], 'NewPassword-2026'); await t.typeInto(inputs[2], 'NewPassword-2026');
    const enter = () => t.act(async () => { inputs[2].dispatchEvent(new t.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    await enter();
    await enter();                              // impatient, while "กำลังบันทึก…"
    await t.flush(400); await t.flush();
    A.eq('7.1 one changePassword request, not two', t.callsOf('changePassword').length, 1);
    A.ok('7.2 still signed in after the successful change', !hasLoginScreen());
    A.eq('7.3 the rotated token is kept', JSON.parse(t.window.sessionStorage.getItem('neofeed_session')).token, 'tok-rotated-000');
    // The non-forced dialog shows a refusal inside itself.
    t.server.hooks.changePassword = () => ({ reply: { error: 'รหัสผ่านเดิมไม่ถูกต้อง' } });
    await t.click(document.querySelector('.topbar .user'));
    await t.click(t.btn(/เปลี่ยนรหัสผ่าน/));
    const ins = [...document.querySelectorAll('.modal-box input')];
    await t.typeInto(ins[0], 'wrong-old-pass'); await t.typeInto(ins[1], 'NewPassword-2027'); await t.typeInto(ins[2], 'NewPassword-2027');
    await t.click(t.btn(/^บันทึก$/, document.querySelector('.modal-box')));
    await t.flush();
    const box = document.querySelector('.modal-box');
    A.ok('7.4 the refusal is shown inside the dialog', box && box.textContent.includes('รหัสผ่านเดิมไม่ถูกต้อง'));
  },

  async 'empty-state-and-picker'(A) {
    console.log('\n── #8 UP-S10 / UP-S17: no patient selected; Ctrl+K ──');
    const t = boot();
    t.quiet();
    await t.start();
    for (const label of ['Dashboard', 'Growth', 'Alerts', 'Calc']) {
      await t.click([...document.querySelectorAll('.bnav-item')].find(b => b.getAttribute('aria-label') === label));
      A.ok(`8.${['Dashboard', 'Growth', 'Alerts', 'Calc'].indexOf(label) + 1} ${label} with no patient → "ยังไม่ได้เลือกผู้ป่วย"`,
        /ยังไม่ได้เลือกผู้ป่วย/.test(document.querySelector('.work-inner').textContent));
    }
    await t.click(t.btn(/^\s*เลือกผู้ป่วย\s*$/));
    A.ok('8.5 its button opens the patient picker', pickerOpen());
    await t.click(t.btn(/^Close$/));
    A.ok('8.6 (closed again)', !pickerOpen());
    await ctrlK(t); await t.flush();
    A.ok('8.7 Ctrl+K opens the picker', pickerOpen());
    await t.click([...document.querySelectorAll('.picker-row')].find(r => /AA/.test(r.textContent)));
    A.ok('8.8 picking a patient fills the view', !/ยังไม่ได้เลือกผู้ป่วย/.test(t.text()));
  },

  async 'sex-unknown'(A) {
    console.log('\n── #9 UP-S4: sex values the Fenton tables do not know ──');
    const t = boot({ patients: [
      mkPatient({ sessionId: 'MM-BW900', name: 'MM', initials: 'MM', sex: 'M', currentBed: 'NICU 1' }),
      mkPatient({ sessionId: 'XX-BW800', name: 'XX', initials: 'XX', bw: 800, sex: 'X', currentBed: 'NICU 2' }),
    ] });
    t.quiet();
    await t.start();
    await t.pickWard('NICU');
    await t.openPatientRow(/MM/);
    const stripSex = () => (document.querySelector('.patient-strip') || {}).textContent || '';
    A.ok('9.1 "M" is normalised at sync: the strip says Male', /Male/.test(stripSex()) && !/Female/.test(stripSex()));
    await t.rail(/Growth chart/);
    A.ok('9.2 …and its growth chart draws', /Fenton 2025 growth chart · Male/.test(t.text()));
    await t.click(document.querySelector('.switch-patient'));
    await t.click([...document.querySelectorAll('.picker-row')].find(r => /XX/.test(r.textContent)));
    // "the shell is still rendered" was read off the literal string "NeoFeed"
    // in the topbar. As of 2026-09-22 the corner is <NeoFeedWordmark/>: the N
    // is an SVG glyph, so the DOM text is "eoFeed" and the product name lives
    // in the accessible name instead. Assert on that — it is the same claim,
    // and it now also holds that the name is announced.
    A.ok('9.3 an unknown sex: the app is still on screen',
      document.getElementById('root').children.length > 0
      && !!document.querySelector('.nf-wordmark[aria-label="NeoFeed"]'));
    A.ok('9.4 …the chart says what is wrong', /เพศในทะเบียนไม่ถูกต้อง — แก้ที่ Edit session/.test(t.text()));
    A.ok('9.5 …the strip does not claim Female', !/Female/.test(stripSex()));
    await t.click(t.btn(/Edit session/));
    const modal = document.querySelector('.picker');
    const sexSel = t.fieldInput('Sex', modal);
    A.eq('9.6 the edit form starts with no sex chosen', sexSel.value, '');
    A.ok('9.7 …and cannot be saved like that', t.btn(/Save changes/, modal).disabled);
    await t.selectVal(sexSel, 'girls');
    A.ok('9.8 choosing one enables Save', !t.btn(/Save changes/, modal).disabled);
  },

  async 'growth-logger-switch'(A) {
    console.log('\n── #10 UP-S2: the measurement logger belongs to its patient ──');
    const mk = (id, bed, daysAgo, weights) => mkPatient({ sessionId: id, name: id.slice(0, 2), initials: id.slice(0, 2),
      bw: weights[0].w, ga: 28.0, dob: addDays(TODAY, -daysAgo), admissionDate: addDays(TODAY, -daysAgo), currentBed: bed, weights });
    const P1 = mk('AA-BW1000', 'NICU 1', 2, [{ dol: 1, w: 1000 }]);                                     // DOL 3
    const P2 = mk('BB-BW800', 'NICU 2', 20, [{ dol: 1, w: 800 }, { dol: 3, w: 760 }, { dol: 20, w: 1020 }]); // DOL 21
    const t = boot({ patients: [P1, P2] });
    t.quiet();
    await t.start();
    await t.pickWard('NICU'); await t.openPatientRow(/AA/); await t.rail(/Growth chart/);
    A.eq('10.1 patient A: the logger is on A\'s DOL', t.fieldInput('DOL').value, '3');
    await t.click(document.querySelector('.switch-patient'));
    await t.click([...document.querySelectorAll('.picker-row')].find(r => /BB/.test(r.textContent)));
    A.eq('10.2 switched to B from the picker: the logger follows to B\'s DOL', t.fieldInput('DOL').value, '21');
    await t.typeInto(t.fieldInput('Wt'), 1045);
    await t.click(t.btn(/Save measurement/));
    const sent = t.callsOf('updateWeights').pop();
    A.ok('10.3 B\'s DOL-3 weight is untouched', sent && sent.weights.find(w => w.dol === 3).w === 760);
    A.ok('10.4 today\'s weight is added at DOL 21', sent && sent.weights.some(w => w.dol === 21 && w.w === 1045));
  },
};

runScenarios(__filename, 'REVIEW 0917 · SESSIONS + VIEWS', scenarios);
