// verify-staff-cache-password-writes.cjs — when the backend writes a Staff
// row's password columns, the very next request sees the write.
//
// THE BUG (found 2026-09-22, while working on PR #84): a forced password change
// was still refused for up to a minute after it succeeded. verifyToken reads
// the Staff row through a 60 s cache (_getStaffRowCached,
// STAFF_RECHECK_TTL_SECONDS), and that copy carries col G,
// must_change_password. The changePassword request itself went through
// verifyToken, so the cache held col G TRUE at the moment changePassword
// cleared it in the sheet. For the next minute every request on the rotated
// token answered PasswordChangeRequired, and app.jsx's
// flagPasswordChangeRequired put the forced ChangePasswordModal back up.
// Signing in again did not help: the copy is cached per user, not per token.
//
// The cache's comment said password changes were unaffected because they bump
// the user epoch. The epoch revokes the account's OTHER sessions; it never
// refreshed col G, which the backend writes itself.
//
// WHAT THIS PINS: every function in gas-backend.gs that writes a Staff row's
// cols E–H drops verifyToken's cached copy of that row:
//   § 1  changePassword off a temp password — the reported bug, end to end;
//   § 2  …and the cache still caches: one Staff-tab read after the change;
//   § 3  setInitialPassword, an admin reset from the editor, with the address
//        typed in another case and with spaces;
//   § 4  setInitialPassword re-adding a deleted row, cached as "not found";
//   § 5  clearStaffPassword;
//   § 6  onEdit and backfillDefaultPasswords provisioning a temp password. Here
//        the stale copy failed OPEN: it read col G blank, so a sign-in on the
//        brand-new temp password passed the server gate for up to a minute;
//   § 7  a cache failure while dropping the copy fails neither the change nor
//        the revocation of the account's other sessions;
//   § 8  source check: every E–H write sits in a function (or doPost action)
//        that drops the copy, so a new writer cannot forget to.
// Hand edits in the Sheets UI (role, active, col G typed by hand) are still
// picked up within the 60 s TTL, as before.
//
// Loads the real gas-backend.gs through gas-vm-sandbox.cjs (real hashing, real
// sheet writes, a cache that honours TTLs). No npm dependencies:
//   node test/verify-staff-cache-password-writes.cjs
// NEOFEED_GAS_SRC=<file> runs it against another revision: against f3e9e23
// (@55's source) 10 of its 33 assertions fail.
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const fs = require('fs');
const { boot, recorder, SRC_PATH } = require('./gas-vm-sandbox.cjs');
const T = recorder('STAFF CACHE · PASSWORD WRITES');

const sync = (g, token) => g.post({ action: 'getActivePatients', token });
const served = (res) => Array.isArray(res && res.patients);
const login = (g, email, password) => g.post({ action: 'login', email, password });
const staffRow = (g, email) => g.rows('Staff').find(r => String(r[0]).trim().toLowerCase() === email);
const tempAccount = (g, email) => g.addStaff(email, 'nurse', 'Tmp-Old-Pass', { mustChange: true, temp: 'Tmp-Old-Pass' });
const change = (g, token) => g.post({ action: 'changePassword', token, oldPassword: 'Tmp-Old-Pass', newPassword: 'A-Real-Password-9' });

T.section('§ 1 · after a forced change, the next request is served at once', () => {
  const g = boot();
  const email = 'n@redcross.or.th';
  tempAccount(g, email);
  const first = login(g, email, 'Tmp-Old-Pass');
  T.eq('the temp password signs in, flagged for the forced change', [first.status, first.mustChangePassword], ['ok', true]);
  T.eq('…and is served nothing else yet', sync(g, first.token).error, 'PasswordChangeRequired');

  const ch = change(g, first.token);
  T.eq('the change succeeds and rotates the token', [ch.ok, ch.mustChangePassword, typeof ch.token], [true, false, 'string']);
  T.eq('Staff cols G/H are cleared in the sheet', staffRow(g, email).slice(6), [false, '']);
  const next = sync(g, ch.token);
  T.ok('the rotated token is served at once, not PasswordChangeRequired', served(next), next);
  T.eq('the temp-password token is revoked', sync(g, first.token), { error: 'Unauthorized' });

  const again = login(g, email, 'A-Real-Password-9');
  T.eq('signing in again with the new password is not flagged', [again.status, again.mustChangePassword], ['ok', false]);
  const againRes = sync(g, again.token);
  T.ok('…and is served too', served(againRes), againRes);
});

T.section('§ 2 · the Staff row is still cached: one read after the change, not one per request', () => {
  const g = boot();
  const email = 'c@redcross.or.th';
  tempAccount(g, email);
  const ch = change(g, login(g, email, 'Tmp-Old-Pass').token);
  const staff = g.sheet('Staff');
  const readsBefore = staff.stats.rangeReads;
  const results = [1, 2, 3, 4, 5].map(() => sync(g, ch.token));
  T.ok('five requests after the change are all served', results.every(served), results.map(r => r.error));
  T.eq('…from a single Staff-tab read', staff.stats.rangeReads - readsBefore, 1);
});

T.section('§ 3 · an admin reset (setInitialPassword) is seen by the next sign-in at once', () => {
  const g = boot();
  const email = 'r@redcross.or.th';
  tempAccount(g, email);
  const held = login(g, email, 'Tmp-Old-Pass');
  T.eq('held at the forced change, which caches col G TRUE', sync(g, held.token).error, 'PasswordChangeRequired');
  // Typed in the Apps Script editor the way an admin might.
  g.sb.setInitialPassword(' R@RedCross.or.th ', 'Admin-Chosen-Pass-7');
  T.eq('the reset lands on the row and clears cols G/H', staffRow(g, email).slice(6), [false, '']);
  const fresh = login(g, email, 'Admin-Chosen-Pass-7');
  T.eq('the admin\'s password signs in, not flagged', [fresh.status, fresh.mustChangePassword], ['ok', false]);
  const res = sync(g, fresh.token);
  T.ok('its first request is served, not PasswordChangeRequired', served(res), res);
});

T.section('§ 4 · a row re-added by setInitialPassword is not refused as "not found"', () => {
  const g = boot();
  const email = 'back@redcross.or.th';
  g.addStaff(email, 'doctor', 'Old-Password-12');
  const tok = login(g, email, 'Old-Password-12').token;
  // The row is deleted by hand, and the next request after the 60 s window reads the deletion.
  g.sheet('Staff').data.splice(1, 1);
  g.expireStaffCache(email);
  T.eq('deleting the row ends the session, and "not found" is cached', sync(g, tok), { error: 'Unauthorized' });
  g.sb.setInitialPassword(email, 'Admin-Chosen-Pass-8');
  const back = login(g, email, 'Admin-Chosen-Pass-8');
  T.eq('the re-added account signs in', back.status, 'ok');
  const res = sync(g, back.token);
  T.ok('…and its first request is served, not Unauthorized', served(res), res);
});

T.section('§ 5 · clearStaffPassword is seen by the next session at once', () => {
  const g = boot();
  const email = 'g@redcross.or.th';
  tempAccount(g, email);
  // A session minted without authMethod, which is what a Google sign-in mints
  // on @55, so col G holds it.
  const before = g.session(email, 'nurse');
  T.eq('held by col G before the clear', sync(g, before).error, 'PasswordChangeRequired');
  g.sb.clearStaffPassword(email);
  T.eq('cols E–H are blank', staffRow(g, email).slice(4), ['', '', '', '']);
  const res = sync(g, g.session(email, 'nurse'));
  T.ok('the next session is served, not held by the cleared flag', served(res), res);
});

T.section('§ 6 · a temp password provisioned by onEdit or the backfill is held at the gate at once', () => {
  const provisioners = {
    onEdit: (g) => g.sb.onEdit({ range: { getSheet: () => g.sheet('Staff'), getRow: () => 2, getNumRows: () => 1 } }),
    backfillDefaultPasswords: (g) => g.sb.backfillDefaultPasswords(),
  };
  for (const [name, provision] of Object.entries(provisioners)) {
    const g = boot();
    const email = 'new@redcross.or.th';
    g.addStaff(email, 'nurse', '');   // active, no password yet
    // A session already on the row caches its copy, col G blank. A Google
    // sign-in on the address mints one while the hd restriction is off.
    T.ok(`${name}: the row's existing session is served`, served(sync(g, g.session(email, 'nurse'))));
    provision(g);
    const row = staffRow(g, email);
    T.eq(`${name}: gave the row a temp password and flagged col G`, [row[6], typeof row[7], row[7].length > 0], [true, 'string', true]);
    const first = login(g, email, row[7]);
    T.eq(`${name}: the temp password signs in, flagged`, [first.status, first.mustChangePassword], ['ok', true]);
    T.eq(`${name}: the server holds that session at the gate at once`, sync(g, first.token).error, 'PasswordChangeRequired');
  }
});

T.section('§ 7 · a cache failure while dropping the copy does not undo the change', () => {
  const g = boot();
  const email = 'f@redcross.or.th';
  tempAccount(g, email);
  const first = login(g, email, 'Tmp-Old-Pass');
  const other = login(g, email, 'Tmp-Old-Pass');   // a second device
  const cache = g.sb.CacheService.getScriptCache();
  const realRemove = cache.remove;
  cache.remove = (k) => {
    if (String(k).startsWith('staffrc_')) throw new Error('Service error: CacheService');
    return realRemove(k);
  };
  let ch;
  try { ch = change(g, first.token); } finally { cache.remove = realRemove; }
  T.eq('the change still succeeds with a rotated token', [ch.ok, typeof ch.token], [true, 'string']);
  T.eq('the other device is still signed out', sync(g, other.token), { error: 'Unauthorized' });
  g.expireStaffCache(email);   // worst case: the old 60 s bound
  T.ok('once the copy expires, the rotated token is served', served(sync(g, ch.token)));
});

T.section('§ 8 · every Staff E–H write drops the cached copy (source)', () => {
  const src = fs.readFileSync(SRC_PATH, 'utf8');
  // Top-level functions, with doPost cut into its action branches, so a write
  // is judged together with the code around it rather than all of doPost.
  const units = [];
  for (const chunk of src.split(/\n(?=function )/)) {
    const name = (chunk.match(/^function (\w+)/) || [])[1] || '(top)';
    if (name !== 'doPost') { units.push({ name, body: chunk }); continue; }
    for (const part of chunk.split(/\n(?=\s*if \(action === ")/)) {
      units.push({ name: 'doPost:' + ((part.match(/^\s*if \(action === "(\w+)"\)/) || [])[1] || '(head)'), body: part });
    }
  }
  const writers = units.filter(u => /\.getRange\([^()]*,\s*5,\s*1,\s*4\)\s*\.(setValues|clearContent)\(/.test(u.body));
  T.eq('the Staff E–H writers are the five driven above', writers.map(u => u.name).sort(),
    ['backfillDefaultPasswords', 'clearStaffPassword', 'doPost:changePassword', 'onEdit', 'setInitialPassword']);
  T.eq('each of them drops the cached copy', writers.filter(u => !/_forgetStaffRow\(/.test(u.body)).map(u => u.name), []);
});

T.done();
