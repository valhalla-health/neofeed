// verify-chula-google-signin.cjs — Chula Google Workspace accounts sign in with
// Google only, and every sign-in, by either path, still needs a Staff row.
//
// Praew, 2026-09-22: "ทุกอันที่เป็น chula domain ให้ผ่าน google ได้เลย ไม่ต้องมาสร้าง
// password ที่นี่ และให้เช็คด้วยว่า ทุก email จะต้องมีชื่อใน google sheet user
// เพื่อป้องกันไม่ให้ใครก็ได้เข้ามา"
//
// The five domains were checked on 2026-09-22: each one has a Google Workspace
// sign-in page (google.com/a/<domain>/ServiceLogin; chula.ac.th and
// student.chula.ac.th hand it on to Chula's Microsoft SSO), while
// redcross.or.th, a password domain here, has none.
//
// What this pins:
//  1. no NeoFeed password is ever provisioned for those domains — not by the
//     onEdit trigger, not by the one-time backfill;
//  2. a Google sign-in is never stopped by the temp-password gate, even on a
//     row that was given a temp password before its domain was listed;
//  3. the gate still holds for a PASSWORD session on that same row — listing a
//     domain must not turn an unchanged temp password into a permanent one;
//  4. every sign-in needs an active Staff row with a valid role, and deleting
//     the row ends a session already in use;
//  5. the prepared hd restriction and its telemetry cover every listed domain;
//  6. a session minted before this change keeps the rule it was minted under.
//
// No npm dependencies: node test/verify-chula-google-signin.cjs
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const { boot, recorder } = require('./gas-vm-sandbox.cjs');
const T = recorder('CHULA GOOGLE SIGN-IN');

const CHULA = ['chula.ac.th', 'student.chula.ac.th', 'md.chula.ac.th', 'docchula.com', 'chulahospital.org'];
const LOGIN_FAILED = 'email หรือรหัสผ่านไม่ถูกต้อง';
const NO_PASSWORD = ['', '', false, ''];   // Staff cols E–H of a row with no NeoFeed password
const TEMP = 'Tmp-Old-Pass';

const nowSec = Math.floor(Date.now() / 1000);
// What Google's tokeninfo endpoint answers for a signed-in account.
function tokeninfo(email, hd) {
  return { code: 200, body: JSON.stringify(Object.assign({
    aud: 'client-id.apps.googleusercontent.com', iss: 'https://accounts.google.com',
    exp: String(nowSec + 3600), email, email_verified: 'true' }, hd ? { hd } : {})) };
}
function googleLogin(g, email, hd) {
  g.env.urlFetch = tokeninfo(email, hd);
  return g.post({ action: 'login', googleToken: 'id-token-from-google' });
}
const staffRow = (g, email) => g.rows('Staff').find(r => r[0] === email);
// A row typed or pasted into the Staff tab by hand, as the onEdit trigger sees it.
function pasteStaffRow(g, email, role) {
  g.addStaff(email, role, '');
  const sheet = g.sheet('Staff');
  const row = sheet.data.length;
  g.sb.onEdit({ range: { getSheet: () => sheet, getRow: () => row, getNumRows: () => 1 } });
  return staffRow(g, email);
}
// What the old rule left behind: a temp password, flagged for change.
const withTempPassword = (g, email) => g.addStaff(email, 'doctor', TEMP, { mustChange: true, temp: TEMP });

T.section('1 · a Chula Google Workspace account never gets a NeoFeed password', () => {
  const g = boot();
  for (const d of CHULA) {
    T.ok(`${d} counts as a Google sign-in domain`, g.sb._usesGoogleSignIn('someone@' + d) === true);
    T.eq(`a row pasted for ${d} is left with no password`, pasteStaffRow(g, 'pasted@' + d, 'nurse').slice(4, 8), NO_PASSWORD);
  }
  T.ok('capitals in the address make no difference', g.sb._usesGoogleSignIn('Someone@DocChula.com') === true);
  // The control: this harness can see provisioning at all.
  const pw = pasteStaffRow(g, 'pasted@redcross.or.th', 'nurse');
  T.ok('a redcross.or.th row still gets a temp password', /^v2\$/.test(pw[4]) && pw[6] === true && String(pw[7]).length === 10, pw.slice(4, 8));
  for (const lookalike of ['notchula.ac.th', 'chula.ac.th.evil.example', 'docchula.com.evil.example', 'evildocchula.com']) {
    T.ok(`the look-alike ${lookalike} is a password domain`, g.sb._usesGoogleSignIn('x@' + lookalike) === false);
  }

  const b = boot();
  for (const d of CHULA) b.addStaff('old@' + d, 'doctor', '');
  b.addStaff('old@redcross.or.th', 'doctor', '');
  b.sb.backfillDefaultPasswords();
  T.eq('the one-time backfill skips every Chula row', CHULA.map(d => staffRow(b, 'old@' + d).slice(4, 8)), CHULA.map(() => NO_PASSWORD));
  T.ok('…and still provisions the redcross.or.th row', /^v2\$/.test(staffRow(b, 'old@redcross.or.th')[4]));
});

T.section('2 · a Chula Google sign-in is never stopped by the temp-password gate', () => {
  for (const d of CHULA) {
    const g = boot();
    withTempPassword(g, 'doc@' + d);
    const res = googleLogin(g, 'doc@' + d, d);
    T.eq(`${d}: Google sign-in succeeds without a password change`, [res.status, res.mustChangePassword], ['ok', false]);
    const sync = g.post({ action: 'getActivePatients', token: res.token });
    T.ok(`${d}: …and its requests are served`, Array.isArray(sync.patients), sync);
  }
});

T.section('3 · a temp password on the same row still buys only a password change', () => {
  for (const d of CHULA) {
    const g = boot();
    withTempPassword(g, 'doc@' + d);
    const res = g.post({ action: 'login', email: 'doc@' + d, password: TEMP });
    T.eq(`${d}: the password path reports the forced change`, [res.status, res.mustChangePassword], ['ok', true]);
    T.eq(`${d}: …and the server refuses everything but the change`, g.post({ action: 'getActivePatients', token: res.token }).error, 'PasswordChangeRequired');
  }
  const g = boot();
  withTempPassword(g, 'doc@docchula.com');
  const res = g.post({ action: 'login', email: 'doc@docchula.com', password: TEMP });
  const chg = g.post({ action: 'changePassword', token: res.token, oldPassword: TEMP, newPassword: 'A-Real-Password-9' });
  T.ok('the way out, changePassword, still works', chg.ok === true && chg.mustChangePassword === false, chg);
});

T.section('4 · every sign-in needs an active Staff row with a valid role', () => {
  const g = boot();
  g.addStaff('on@docchula.com', 'doctor', '');
  g.addStaff('off@docchula.com', 'doctor', '', { active: false });
  g.addStaff('norole@chulahospital.org', '', '');
  T.eq('a real Chula Google account with no Staff row is refused', googleLogin(g, 'stranger@chula.ac.th', 'chula.ac.th'),
    { status: 'unauthorized', error: 'ไม่พบบัญชีนี้ในระบบ' });
  T.eq('…so is a gmail.com account with no Staff row', googleLogin(g, 'someone@gmail.com', '').status, 'unauthorized');
  T.eq('a disabled row is refused', googleLogin(g, 'off@docchula.com', 'docchula.com'), { status: 'unauthorized', error: 'บัญชีนี้ถูกระงับ' });
  T.eq('a row without a valid role is refused', googleLogin(g, 'norole@chulahospital.org', 'chulahospital.org').status, 'unauthorized');
  T.eq('the password path refuses an address with no row', g.post({ action: 'login', email: 'stranger@redcross.or.th', password: 'Some-Password-1' }).error, LOGIN_FAILED);
  T.eq('no request is served without a session', g.post({ action: 'getActivePatients' }), { error: 'Unauthorized' });
  T.eq('…and GET serves no data at all', JSON.parse(g.sb.doGet({ parameter: { action: 'getActivePatients' } })._text), { error: 'Use POST for authenticated actions.' });

  const ok = googleLogin(g, 'on@docchula.com', 'docchula.com');
  T.ok('an active row signs in and is served', ok.status === 'ok' && Array.isArray(g.post({ action: 'getActivePatients', token: ok.token }).patients), ok);
  const staff = g.sheet('Staff').data;
  staff.splice(staff.findIndex(r => r[0] === 'on@docchula.com'), 1);
  g.expireStaffCache('on@docchula.com');   // the 60 s Staff re-check window elapsing
  T.eq('deleting the row ends the session already in use', g.post({ action: 'getActivePatients', token: ok.token }), { error: 'Unauthorized' });
});

T.section('5 · the prepared hd restriction and its telemetry cover every Chula domain', () => {
  const g = boot();
  for (const d of CHULA) { g.addStaff('staff@' + d, 'doctor', ''); googleLogin(g, 'staff@' + d, d); }
  T.eq('off: each domain records hd_seen_<domain> = yes', CHULA.map(d => g.props.get('hd_seen_' + d)), CHULA.map(() => 'yes'));
  g.sb.GOOGLE_HD_ENFORCE = true;
  for (const d of CHULA) {
    T.eq(`on: ${d} with its own hd is accepted, without hd refused`,
      [googleLogin(g, 'staff@' + d, d).status, googleLogin(g, 'staff@' + d, '').status], ['ok', 'unauthorized']);
  }
  T.eq('on: another Chula domain\'s hd does not count', googleLogin(g, 'staff@docchula.com', 'chula.ac.th').status, 'unauthorized');
});

T.section('6 · a session minted before this change keeps the rule it was minted under', () => {
  // Sessions live up to 12 h, so sessions minted by the old code (no auth
  // method recorded) are still in use for a while after the deploy.
  const g = boot();
  g.addStaff('w@docchula.com', 'doctor', '', { mustChange: true });
  g.addStaff('p@redcross.or.th', 'doctor', TEMP, { mustChange: true, temp: TEMP });
  T.ok('an old session on a Chula domain is not gated',
    Array.isArray(g.post({ action: 'getActivePatients', token: g.session('w@docchula.com', 'doctor') }).patients));
  T.eq('an old session on a password domain still is',
    g.post({ action: 'getActivePatients', token: g.session('p@redcross.or.th', 'doctor') }).error, 'PasswordChangeRequired');
});

T.done();
