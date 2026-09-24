// verify-login-speed-0924.cjs — Pp's "login is slow" fixes 1–4
// (CHANGELOG.md 2026-09-24 (11); Pp: "ทำ login fix 1-4 เลย").
//
//   server  gas-backend.gs in the vm sandbox (gas-vm-sandbox.cjs):
//     Fix 2  a login that sends `wantSync` gets the first sync in its reply:
//            the same ward payload getActivePatients returns, audited as
//            readRegistry after `login`. Never on a pending temp password, a
//            wrong password or a disabled account. A sync that throws is left
//            out, not a failed sign-in. An old client (no wantSync) gets
//            exactly the reply it always did.
//     Fix 3  one openById per request; the login fills the staff-row cache,
//            so the first token check reads no Staff cell; the ward sync
//            leaves out superseded rows (the admin archive keeps them); the
//            shared handle never outlives its request.
//     Fix 1  one timing line per sign-in and per sync in the execution log,
//            holding no email and no sessionId.
//   client  the real <App/> in jsdom (review-0917-boot.cjs):
//     Fix 2  a carried snapshot is applied, with no second request, and never
//            written to sessionStorage; an old backend's reply falls back to
//            one ordinary sync.
//     Fix 4  a temp-password sign-in sends no sync while the password is
//            pending, and syncs the moment it is changed.
//     Fix 1  the admin dashboard shows how long this device's sign-in took.
//
// ── NEGATIVE CONTROL ───────────────────────────────────────────────────────
// Run against the commit before the fixes; every scenario must go red:
//   d=$(mktemp -d)
//   git -c core.autocrlf=false archive --format=tar 3bb6288 | tar -x -C "$d"
//   cp test/verify-login-speed-0924.cjs "$d/test/"
//   cp -r node_modules "$d/node_modules"
//   ( cd "$d" && TZ=Asia/Bangkok node test/verify-login-speed-0924.cjs )
// Expected there: 28 FAILED (15 passed), in every scenario. The 15 are the
// controls, which pass on both: the old-client reply, the refusals, the admin
// archive, the embedded-sync failure path, and the ordinary-sync fallback.
// S10 starts from a cold staff-row cache; there the token check after login
// re-reads 48 Staff cells.
//
// Same dev-only dependencies as the other jsdom harnesses (test/README.md);
// the server scenario needs none.
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const { boot: bootApp, runScenarios, mkPatient } = require('./review-0917-boot.cjs');

const stripTs = (s) => String(s).replace(/,"ts":"[^"]*"}$/, ',"ts":"X"}');

// ── the client's email login, as verify-review-0917-session.cjs drives it ──
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
const PATIENT = mkPatient();                       // AA-BW900, NICU 1
const snapshot = { patients: [PATIENT], log: {} };
const reply = (over) => Object.assign({ status: 'ok', name: 'Admin A', role: 'admin', email: 'a@test.th',
  token: 'tok-admin-abcdefg', authMethod: 'password' }, over);
const storedSession = (t) => t.window.sessionStorage.getItem('neofeed_session') || '';
const onWorkspace = () => !!document.querySelector('.ward-gate');

runScenarios(__filename, 'LOGIN SPEED 2026-09-24', {

  // ════════════════════════════════════════════════════════════════════════
  async server(A) {
    const { boot, wardToday, addDays } = require('./gas-vm-sandbox.cjs');
    const g = boot();
    let opens = 0;
    const realOpen = g.sb.SpreadsheetApp.openById;
    g.sb.SpreadsheetApp.openById = (...a) => { opens++; return realOpen(...a); };
    g.addStaff('doc@kcmh.test', 'doctor', 'Doctor-Password-1');
    g.addStaff('adm@kcmh.test', 'admin', 'Admin-Password-1');
    g.addStaff('tmp@kcmh.test', 'nurse', 'Temp-Password-1', { mustChange: true, temp: 'Temp-Password-1' });
    g.addStaff('off@kcmh.test', 'doctor', 'Off-Password-1', { active: false });
    g.addStaff('ggl@chula.ac.th', 'doctor', '');
    const T = wardToday();
    g.sheet('Patient_Registry').data.push(g.patRow('AA-1'));
    const old = g.logRow('AA-1', addDays(T, -1), { 37: '2026-09-11T01:00:00Z' });        // superseded
    const rev = g.logRow('AA-1', addDays(T, -1), { 35: 2, 36: old[25] });                 // its revision
    g.sheet('Daily_Log').data.push(old, rev);
    const login = (email, password, extra) => g.post(Object.assign({ action: 'login', email, password }, extra || {}));
    const auditCount = (action) => g.audit().filter(a => a.action === action).length;

    console.log('\n── server · fix 2: the first sync rides in the login reply ──');
    const plain = login('doc@kcmh.test', 'Doctor-Password-1');
    A.eq('S1 an old client (no wantSync) gets exactly the reply it always did', Object.keys(plain),
      ['status', 'name', 'role', 'email', 'token', 'authMethod', 'mustChangePassword']);

    const reads0 = auditCount('readRegistry');
    const text = g.postText({ action: 'login', email: 'doc@kcmh.test', password: 'Doctor-Password-1', wantSync: true });
    const withSync = JSON.parse(text);
    A.ok('S2 wantSync: the reply carries the sync', !!withSync.sync && Array.isArray(withSync.sync.patients));
    A.eq('S2 …the registry snapshot', withSync.sync && withSync.sync.patients.map(p => p.sessionId), ['AA-1']);
    const carried = (text.match(/,"sync":(.*)}$/) || [])[1] || '';
    const direct = g.postText({ action: 'getActivePatients', token: withSync.token });
    A.ok('S2 …byte-identical to getActivePatients (except ts)', stripTs(carried) === stripTs(direct));
    A.eq('S2 …syncChars is its length', withSync.syncChars, carried.length);
    A.ok('S2 …with the server time it took', typeof withSync.serverMs === 'number' && withSync.serverMs >= 0);
    const last2 = g.audit().slice(-3, -1);   // the sync above added one more row
    A.eq('S3 audited as login, then readRegistry, by that user', last2.map(a => [a.action, a.actor]),
      [['login', 'doc@kcmh.test'], ['readRegistry', 'doc@kcmh.test']]);
    A.eq('S3 …one readRegistry for the carried sync, one for the direct one', auditCount('readRegistry') - reads0, 2);

    const readsBefore = auditCount('readRegistry');
    const tmp = login('tmp@kcmh.test', 'Temp-Password-1', { wantSync: true });
    A.ok('S4 a pending temp password gets no data', tmp.status === 'ok' && tmp.mustChangePassword === true && !('sync' in tmp));
    const wrong = login('doc@kcmh.test', 'Wrong-Password-9', { wantSync: true });
    A.ok('S5 a wrong password gets no data', wrong.status === 'unauthorized' && !('sync' in wrong));
    const off = login('off@kcmh.test', 'Off-Password-1', { wantSync: true });
    A.ok('S6 a disabled account gets no data', off.status === 'unauthorized' && !('sync' in off));
    A.eq('S4–S6 …and none of them was audited as a registry read', auditCount('readRegistry'), readsBefore);

    g.env.urlFetch = { code: 200, body: JSON.stringify({ aud: 'client-id.apps.googleusercontent.com', iss: 'https://accounts.google.com',
      exp: String(Math.floor(Date.now() / 1000) + 3600), email: 'ggl@chula.ac.th', email_verified: 'true', hd: 'chula.ac.th' }) };
    const google = g.post({ action: 'login', googleToken: 'id-token-from-google', wantSync: true });
    A.ok('S7 the Google path carries it too', google.status === 'ok' && !!google.sync && google.sync.patients.length === 1);

    const realJson = g.sb.getActivePatientsJson;
    g.sb.getActivePatientsJson = () => { throw new Error('Service Spreadsheets timed out'); };
    const hiccup = login('doc@kcmh.test', 'Doctor-Password-1', { wantSync: true });
    g.sb.getActivePatientsJson = realJson;
    A.ok('S8 a sync that throws is left out; the sign-in still works', hiccup.status === 'ok' && !!hiccup.token && !('sync' in hiccup));

    console.log('\n── server · fix 3: less work per sign-in ──');
    // Earlier requests above warmed this user's staff-row cache; start cold, as
    // a sign-in after more than a minute does.
    g.expireStaffCache('doc@kcmh.test');
    opens = 0;
    const once = login('doc@kcmh.test', 'Doctor-Password-1', { wantSync: true });
    A.eq('S9 one spreadsheet open for a whole password sign-in with its sync', opens, 1);
    opens = 0;
    g.post({ action: 'login', googleToken: 'id-token-from-google', wantSync: true });
    A.eq('S9 …and for a Google one', opens, 1);
    const staff = g.sheet('Staff').stats;
    const staffCells = staff.cellsRead;
    opens = 0;
    const next = g.post({ action: 'getActivePatients', token: once.token });
    A.eq('S10 the first token check after login reads no Staff cell', staff.cellsRead - staffCells, 0);
    A.eq('S9 …and the sync opens the file once', opens, 1);
    const ward = next.log['AA-1'] || [];
    A.eq('S11 the ward sync leaves the superseded row out', ward.some(e => e.supersededAt), false);
    A.eq('S11 …and keeps the revision that replaced it', ward.map(e => e.entryId), [rev[25]]);
    A.eq('S11 …in the carried snapshot too', (((withSync.sync || {}).log || {})['AA-1'] || []).map(e => e.entryId), [rev[25]]);
    const adm = login('adm@kcmh.test', 'Admin-Password-1');
    const archive = g.post({ action: 'getActivePatients', token: adm.token, includeArchived: true });
    A.eq('S11 the admin archive still sends both, as before', (archive.log['AA-1'] || []).map(e => e.entryId), [old[25], rev[25]]);
    A.eq('S12 the shared handle is released when a request ends', g.sb._inRequest, false);
    g.postText('not json');
    A.eq('S12 …even when the request fails', g.sb._inRequest, false);

    console.log('\n── server · fix 1: timing lines ──');
    const lines = g.env.logs.filter(l => l.startsWith('{"timing"')).map(l => JSON.parse(l));
    A.ok('S13 a timing line per sign-in', lines.some(l => l.timing === 'login' && l.ms && typeof l.ms.hash === 'number'));
    A.ok('S13 …and per sync, with cache hit/miss and size', lines.some(l => l.timing === 'getActivePatients' && /^(hit|miss|off)$/.test(l.cache) && l.chars > 0));
    const all = g.env.logs.filter(l => l.startsWith('{"timing"')).join('\n');
    A.ok('S13 …holding no email and no sessionId', all.length > 0 && !/@/.test(all) && !/AA-1/.test(all));
  },

  // ════════════════════════════════════════════════════════════════════════
  async 'client · carried snapshot'(A) {
    const t = bootApp({ session: null, patients: [] });
    t.server.loginReply = reply({ sync: snapshot, serverMs: 850, syncChars: 1234567 });
    await t.start();
    await emailLogin(t, 'a@test.th');
    A.eq('C1 the login asks for the sync', t.callsOf('login').map(c => c.wantSync), [true]);
    A.eq('C1 …and no second request follows', t.syncCalls().length, 0);
    A.ok('C1 …the workspace is up on the carried data', onWorkspace());
    await t.pickWard('NICU');
    A.ok('C1 …the infant is on the ward list', /AA/.test(t.text()));
    A.ok('C2 sessionStorage holds the session, never the data', storedSession(t).includes('tok-admin') && !storedSession(t).includes('AA-BW900'));
    await t.rail(/Admin/);
    const line = (document.querySelector('.signin-timing') || {}).textContent || '';
    A.ok('C5 the admin dashboard says how long this sign-in took', /Sign-in on this device: [\d.]+ s/.test(line));
    A.ok('C5 …that the data came with the login reply, and its size', /came with the login reply/.test(line) && /server 0\.9 s/.test(line) && /1\.2 MB/.test(line));
    A.ok('C5 …and names nobody', !/@/.test(line) && !/AA/.test(line));
  },

  // ════════════════════════════════════════════════════════════════════════
  async 'client · old backend'(A) {
    const t = bootApp({ session: null, patients: [PATIENT] });
    t.server.loginReply = reply();                     // no `sync`: a backend before this change
    await t.start();
    await emailLogin(t, 'a@test.th');
    A.eq('C3 a reply without data falls back to one ordinary sync', t.syncCalls().length, 1);
    A.ok('C3 …and the workspace comes up on it', onWorkspace());
    await t.rail(/Admin/);
    const line = (document.querySelector('.signin-timing') || {}).textContent || '';
    A.ok('C5 the timing says the data was a separate request', /Sign-in on this device/.test(line) && /separate request/.test(line));
  },

  // ════════════════════════════════════════════════════════════════════════
  async 'client · temp password'(A) {
    const t = bootApp({ session: null, patients: [PATIENT] });
    // The server refuses everything but changePassword while the temp password
    // is pending, as gas-backend.gs's gate does.
    let pending = true;
    // An admin, so the dashboard's timing line can be checked afterwards.
    t.server.loginReply = reply({ mustChangePassword: true });
    t.server.hooks.getActivePatients = () => pending ? { reply: { error: 'PasswordChangeRequired', mustChangePassword: true } } : undefined;
    t.server.hooks.changePassword = () => { pending = false; return undefined; };
    await t.start();
    await emailLogin(t, 'a@test.th');
    A.ok('C4 the forced change-password screen is up', /รหัสผ่านชั่วคราว/.test(t.text()));
    A.eq('C4 …and no sync was sent while the password is pending', t.syncCalls().length, 0);
    const pw = document.querySelectorAll('.modal-box input[type="password"]');
    await t.typeInto(pw[0], 'Temp-Password-1');
    await t.typeInto(pw[1], 'A-new-long-password-2026');
    await t.typeInto(pw[2], 'A-new-long-password-2026');
    await t.click(t.btn(/^บันทึก$/));
    await t.flush(); await t.flush();
    A.eq('C4 changing it syncs at once', t.syncCalls().length, 1);
    A.ok('C4 …and lands on the workspace, not an error', onWorkspace());
    await t.rail(/Admin/);
    A.ok('C4 …with no timing for a sign-in that waited on a person', !!document.querySelector('.admin-stat-tiles') && !document.querySelector('.signin-timing'));
  },
});
