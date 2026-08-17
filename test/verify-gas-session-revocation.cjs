// verifyToken() must not let a revoked account keep its access, and must not
// pay a Staff-sheet read on every request to achieve that.
//
// Sessions live in CacheService for SESSION_TTL_SECONDS (21600 — 6h, Apps
// Script's cap) and used to be trusted wholesale for that entire window. Only
// the user *epoch* was re-checked, which a password change bumps. Nothing
// re-read `role` or `active`, so disabling or demoting someone in the Staff
// tab left their existing session working — with its old role — for up to six
// hours. On an app holding NICU patient data that is the gap that matters.
//
// The fix re-reads the Staff row inside verifyToken, behind a 60s cache
// (_getStaffRowCached) so it costs one read per user per minute rather than
// one per authenticated request. This pins both halves: that revocation
// actually happens, and that the caching actually caches.
//
// These changes were recovered from an uncommitted working copy with no known
// author and no test coverage (see the commit message on this branch), so this
// harness is written against the *intended* behaviour, not to ratify whatever
// the code happens to do.
//
// Same technique as verify-gas-registry-upsert.cjs: every top-level statement
// in gas-backend.gs is a `var` or a function declaration, so the file
// evaluates against stubbed Apps Script globals and the real functions can be
// called directly. No dependencies; run with plain
// `node test/verify-gas-session-revocation.cjs`.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = Object.is(got, want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(52)} got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
function ok(name, cond) { eq(name, !!cond, true); }

// ── Staff sheet double ────────────────────────────────────────────────────
// Counts getDataRange() calls, which is how we prove the cache is working:
// getStaffRow reads the whole tab through it, so one read == one sheet hit.
const STAFF_HEADER = ['email','role','name','active','password_hash','salt','must_change_password','temp_password'];
let staffRows = [];
let sheetReads = 0;
const staffSheet = {
  getDataRange() {
    sheetReads++;
    return { getValues: () => [STAFF_HEADER, ...staffRows].map(r => r.slice()) };
  },
  getRange() { return { setValue() {}, setValues() {}, clearContent() {}, getValue: () => '', getValues: () => [[]] }; },
  appendRow() {},
  getMaxColumns: () => 8,
  getLastRow: () => staffRows.length + 1,
};

// ── CacheService double ───────────────────────────────────────────────────
// A real store, unlike the no-op stub in verify-gas-registry-upsert.cjs —
// caching behaviour is the thing under test here. Records the TTL each key was
// written with so the 60s bound can be asserted rather than assumed.
let cacheStore = new Map();
let cacheTtls  = new Map();
const cacheDouble = {
  get(k) { return cacheStore.has(k) ? cacheStore.get(k) : null; },
  put(k, v, ttl) { cacheStore.set(k, v); cacheTtls.set(k, ttl); },
  remove(k) { cacheStore.delete(k); },
};

// ── PropertiesService double ──────────────────────────────────────────────
// A real map, so getUserEpoch/bumpUserEpoch behave properly. Config keys
// (SPREADSHEET_ID, CLIENT_ID) are seeded; epoch keys start absent, which
// getUserEpoch reads as "0".
let props = new Map([['SPREADSHEET_ID', 'sheet-id'], ['CLIENT_ID', 'client-id.apps.googleusercontent.com']]);

// ── UrlFetchApp double — swappable per-test for the tokeninfo path ────────
let tokenInfoResponse = { code: 200, body: '{}' };

const sandbox = {
  SpreadsheetApp: { openById: () => ({ getSheetByName: () => staffSheet, insertSheet: () => staffSheet }) },
  Utilities: {
    getUuid: () => 'tok-' + Math.random().toString(36).slice(2, 10) + '-padding',
    computeHmacSha256Signature: () => [], base64Encode: () => '',
    computeDigest: () => [], DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (props.has(k) ? props.get(k) : null),
      setProperty: (k, v) => { props.set(k, v); },
      deleteProperty: (k) => { props.delete(k); },
    }),
  },
  CacheService: { getScriptCache: () => cacheDouble },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  UrlFetchApp: {
    fetch: () => ({
      getResponseCode: () => tokenInfoResponse.code,
      getContentText: () => tokenInfoResponse.body,
    }),
  },
  ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
  Logger: { log() {} },
  console,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'gas-backend.gs'), 'utf8'), sandbox);

function reset(rows) {
  staffRows  = rows;
  sheetReads = 0;
  cacheStore = new Map();
  cacheTtls  = new Map();
  props = new Map([['SPREADSHEET_ID', 'sheet-id'], ['CLIENT_ID', 'client-id.apps.googleusercontent.com']]);
}

// email | role | name | active | hash | salt | must_change | temp
const ADMIN  = ['boss@hospital.th',  'admin',  'Boss',  true,  'h', 's', false, ''];
const DOCTOR = ['doc@hospital.th',   'doctor', 'Doc',   true,  'h', 's', false, ''];

// ── 1. A live account still works ─────────────────────────────────────────
console.log('\n── an active account verifies normally ──');
reset([ADMIN]);
let token = sandbox.createSession('boss@hospital.th', 'admin', 'Boss', false);
let user  = sandbox.verifyToken(token);
ok('returns a session',              user !== null);
eq('role preserved',                 user?.role, 'admin');
eq('name preserved',                 user?.name, 'Boss');
eq('email preserved',                user?.email, 'boss@hospital.th');

// ── 2. Disabling the account revokes the EXISTING session ─────────────────
// The whole point: no re-login, no epoch bump, just active → FALSE in the tab.
console.log('\n── disabling an account kills its live session ──');
reset([ADMIN]);
token = sandbox.createSession('boss@hospital.th', 'admin', 'Boss', false);
ok('session valid before',           sandbox.verifyToken(token) !== null);
staffRows = [['boss@hospital.th', 'admin', 'Boss', false, 'h', 's', false, '']];
cacheStore.delete('staffrc_boss@hospital.th'); // simulate the 60s TTL lapsing
eq('session refused after disable',  sandbox.verifyToken(token), null);
ok('session evicted from cache',     !cacheStore.has('sess_' + token));

// active as the string "FALSE" (what a hand-typed cell gives) must revoke too
reset([ADMIN]);
token = sandbox.createSession('boss@hospital.th', 'admin', 'Boss', false);
sandbox.verifyToken(token);
staffRows = [['boss@hospital.th', 'admin', 'Boss', 'FALSE', 'h', 's', false, '']];
cacheStore.delete('staffrc_boss@hospital.th');
eq('string "FALSE" also revokes',    sandbox.verifyToken(token), null);

// ── 3. Demotion takes effect without re-login ─────────────────────────────
// The token was minted as admin. The sheet now says doctor. Every admin-gated
// action in doPost branches on user.role, so this is the assertion that stops
// a demoted account from still deleting patients.
console.log('\n── demoting an admin downgrades the live session ──');
reset([ADMIN]);
token = sandbox.createSession('boss@hospital.th', 'admin', 'Boss', false);
eq('starts as admin',                sandbox.verifyToken(token)?.role, 'admin');
staffRows = [['boss@hospital.th', 'doctor', 'Boss', true, 'h', 's', false, '']];
cacheStore.delete('staffrc_boss@hospital.th');
eq('now reports doctor',             sandbox.verifyToken(token)?.role, 'doctor');
ok('and is no longer admin',         sandbox.verifyToken(token)?.role !== 'admin');

// a renamed user picks the new name up the same way
reset([DOCTOR]);
token = sandbox.createSession('doc@hospital.th', 'doctor', 'Doc', false);
sandbox.verifyToken(token);
staffRows = [['doc@hospital.th', 'doctor', 'Doctor Renamed', true, 'h', 's', false, '']];
cacheStore.delete('staffrc_doc@hospital.th');
eq('rename reaches the session',     sandbox.verifyToken(token)?.name, 'Doctor Renamed');

// ── 4. A deleted staff row revokes ────────────────────────────────────────
console.log('\n── a removed staff row revokes ──');
reset([ADMIN]);
token = sandbox.createSession('boss@hospital.th', 'admin', 'Boss', false);
sandbox.verifyToken(token);
staffRows = [];
cacheStore.delete('staffrc_boss@hospital.th');
eq('deleted staff refused',          sandbox.verifyToken(token), null);

// ── 5. Password change still revokes instantly (epoch, never cached) ──────
// This must NOT be softened by the staff cache — it is the one revocation
// path that was already instant and has to stay that way.
console.log('\n── a password change still revokes instantly ──');
reset([ADMIN]);
token = sandbox.createSession('boss@hospital.th', 'admin', 'Boss', false);
ok('valid before',                   sandbox.verifyToken(token) !== null);
sandbox.bumpUserEpoch('boss@hospital.th');
eq('refused immediately after bump', sandbox.verifyToken(token), null);
ok('no TTL wait needed',             true);

// ── 6. The cache actually caches ──────────────────────────────────────────
// Without this the fix costs a full Staff-tab read on every authenticated
// request — a spreadsheet round-trip in front of every save, sync and log.
console.log('\n── repeated calls hit the cache, not the sheet ──');
reset([ADMIN]);
token = sandbox.createSession('boss@hospital.th', 'admin', 'Boss', false);
sheetReads = 0;
sandbox.verifyToken(token);
const afterFirst = sheetReads;
sandbox.verifyToken(token);
sandbox.verifyToken(token);
sandbox.verifyToken(token);
eq('first call reads the sheet once', afterFirst, 1);
eq('three more calls read 0 more',    sheetReads - afterFirst, 0);
eq('cached under the 60s TTL',        cacheTtls.get('staffrc_boss@hospital.th'), 60);
eq('TTL constant is 60',              sandbox.STAFF_RECHECK_TTL_SECONDS, 60);

// ── 7. "Not found" is cached too ──────────────────────────────────────────
// JSON round-trips null as the string "null"; if that were mistaken for a
// cache miss, an unknown email would re-read the sheet on every request —
// exactly the hot path an unauthenticated flood would hit.
console.log('\n── a missing staff row is negatively cached ──');
reset([ADMIN]);
token = sandbox.createSession('ghost@hospital.th', 'doctor', 'Ghost', false);
sheetReads = 0;
eq('unknown user refused',            sandbox.verifyToken(token), null);
const ghostReads = sheetReads;
sandbox.verifyToken(token);
eq('first miss reads the sheet once', ghostReads, 1);
eq('second miss reads 0 more',        sheetReads - ghostReads, 0);

// ── 8. createSession records mustChangePassword ───────────────────────────
console.log('\n── createSession stores the mustChangePassword flag ──');
reset([DOCTOR]);
const t1 = sandbox.createSession('doc@hospital.th', 'doctor', 'Doc', true);
eq('stored true',  JSON.parse(cacheStore.get('sess_' + t1)).mustChangePassword, true);
const t2 = sandbox.createSession('doc@hospital.th', 'doctor', 'Doc', false);
eq('stored false', JSON.parse(cacheStore.get('sess_' + t2)).mustChangePassword, false);
const t3 = sandbox.createSession('doc@hospital.th', 'doctor', 'Doc');
eq('undefined coerces to false', JSON.parse(cacheStore.get('sess_' + t3)).mustChangePassword, false);

// ── 9. Google ID token expiry ─────────────────────────────────────────────
// Belt-and-braces over tokeninfo's own expiry check, so it is asserted at the
// boundary rather than trusted.
console.log('\n── verifyGoogleIdToken checks exp ──');
reset([ADMIN]);
const now = Math.floor(Date.now() / 1000);
const goodPayload = (extra) => JSON.stringify(Object.assign({
  aud: 'client-id.apps.googleusercontent.com',
  iss: 'https://accounts.google.com',
  email: 'boss@hospital.th',
  email_verified: 'true',
}, extra));

tokenInfoResponse = { code: 200, body: goodPayload({ exp: String(now + 3600) }) };
eq('unexpired token accepted', sandbox.verifyGoogleIdToken('x')?.email, 'boss@hospital.th');

tokenInfoResponse = { code: 200, body: goodPayload({ exp: String(now - 60) }) };
let r = sandbox.verifyGoogleIdToken('x');
eq('expired token rejected',   r?.email, null);
eq('and says why',             r?.reason, 'token expired');

tokenInfoResponse = { code: 200, body: goodPayload({}) };
eq('missing exp rejected',     sandbox.verifyGoogleIdToken('x')?.email, null);

tokenInfoResponse = { code: 200, body: goodPayload({ exp: String(now + 3600), aud: 'someone-else' }) };
eq('aud check still applies',  sandbox.verifyGoogleIdToken('x')?.email, null);

console.log(`\n${fail === 0 ? 'GAS SESSION REVOCATION: ALL PASS' : `GAS SESSION REVOCATION: ${fail} FAILED`} (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
