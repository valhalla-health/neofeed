// ============================================================
// NeoFeed V2 — Google Apps Script backend
// Hybrid auth:
//   • Gmail / Google Workspace → Google Sign-In JWT (no password)
//   • Any other email           → SHA-256 password + session token
// Both paths issue a CacheService session token (6 h sliding TTL — the max
// CacheService.put() allows; see SESSION_TTL_SECONDS below — and, since
// 2026-09-17, an absolute 12 h cap from issue: SESSION_MAX_AGE_MS).
// ============================================================
// Setup:
//   1. Create a Google Sheet, create/find the OAuth Client ID for Google
//      Sign-In, then run setConfig("<spreadsheetId>", "<clientId>") once
//      from the Apps Script editor — this writes both into Script
//      Properties instead of hardcoding them in source (see "Config" below).
//   2. Tabs auto-created: Patient_Registry, Daily_Log, Staff
//   3. Staff tab (A–H): email | role | name | active | password_hash | salt |
//      must_change_password | temp_password
//      Gmail/Workspace users: leave cols E–H blank (password not used)
//      Non-Gmail:   leave cols E–H blank when adding the row — the onEdit
//        trigger below (autoProvisionStaffPassword) generates a random
//        per-account temp password the moment the row is saved, sets
//        must_change_password=TRUE, and stamps the plaintext into col H
//        (temp_password) so whoever added the row can read it back and hand
//        it to the new staff member — see the comment above onEdit() for why
//        this replaced a single shared hardcoded default. login() reports
//        must_change_password back to the client, which forces the change-
//        password screen (can't be dismissed/skipped) before anything else
//        loads; a successful change clears both must_change_password and
//        temp_password. To set a specific password instead (no forced
//        change), run setInitialPassword("email","pwd") from the Apps
//        Script editor.
//   4. Deploy → Web app · Execute as: Me · Access: Anyone
//   5. Copy URL → NeoFeed.html window.NEOFEED_GAS_URL
//
// Patient_Registry (A–R): sessionId|name|initials|bw|ga|sex|dob|admissionDate|
//   twinSuffix|status|currentBed|diagnosis|weights|lengths|hcs|bedHistory|statusDate|
//   multiplesCount (R, added 2026-08-14 — 2/3/4, disambiguates twinSuffix's
//   A–D: "A" alone doesn't say whether the set is twins or triplets)
// Daily_Log (A–AG): ts|sessionId|dol|weight|fluid|gir|pro|kcal|na|k|ca|p|
//   enVolPerKg|route|status|submittedBy|suppMTV..suppFeType|
//   calcInputJson|entryId|lastModified|lastModifiedBy|ioInput|ioOutput|drainContent|
//   constantsVersion|appVersion
//   (calcInputJson = raw Calculator inputs, JSON — lets an entry be reopened
//   and edited exactly as entered, from any device, not just the one that
//   created it. entryId is the stable key updateDailyNutrition() matches on;
//   lastModified/lastModifiedBy back the optimistic-concurrency check there.
//   ioInput/ioOutput/drainContent (AC–AE) are the Calculator's Intake/Output
//   card, mL/day as entered — per-kg/day is re-derived client-side, never stored.)
// Staff (A–H): email | role | name | active | password_hash | salt |
//   must_change_password | temp_password
//   (must_change_password/temp_password only ever hold a value for accounts
//   mid-provisioning — see autoProvisionStaffPassword below; both are blank
//   for a normal established account.)
// Audit_Log (A–D): ts | action | sessionId | actorEmail
//   (accountability trail for PDPA-relevant actions — registry reads,
//   erasures — since Apps Script's own execution log expires after 7 days)
//
// PDPA lawful basis: Section 26(6) medical necessity + professional confidentiality
// ============================================================

// ── Config (Script Properties, not source) ────────────────────
// SPREADSHEET_ID/CLIENT_ID used to be hardcoded literals here, which meant
// anyone with read access to this file — e.g. this git repo — could read
// them straight out of source history. Moved to Script Properties (Apps
// Script editor → Project Settings → Script Properties), which are never
// synced by `clasp push`/git.
//
// Note on CLIENT_ID specifically: it's unavoidably public regardless — it's
// also inline in NeoFeed.html/index.html's window.NEOFEED_CLIENT_ID, since
// Google Identity Services needs it client-side, and OAuth web client IDs
// aren't secrets by design (Google's own docs say so). Moving it here is
// config hygiene / single source of truth, not secrecy.
// SPREADSHEET_ID is the one that actually benefits: it's an internal
// pointer to the document holding patient data, with no legitimate reason
// to sit in source/git history.
//
// One-time setup: run setConfig("<spreadsheetId>", "<clientId>") from the
// Apps Script editor (Run ▸ setConfig), or set both properties directly via
// Project Settings → Script Properties. Do not commit real values here.
function setConfig(spreadsheetId, clientId) {
  var props = PropertiesService.getScriptProperties();
  if (spreadsheetId) props.setProperty("SPREADSHEET_ID", spreadsheetId);
  if (clientId) props.setProperty("CLIENT_ID", clientId);
  Logger.log("Config saved to Script Properties.");
}
function _cfg(key) {
  var val = PropertiesService.getScriptProperties().getProperty(key);
  if (!val) throw new Error("Missing Script Property '" + key + "' — run setConfig(...) from the Apps Script editor first.");
  return val;
}
function SPREADSHEET_ID_() { return _cfg("SPREADSHEET_ID"); }
function CLIENT_ID_() { return _cfg("CLIENT_ID"); }

// ── Google ID token verifier (for Gmail/Workspace Sign-In path) ─
// SECURITY: the old implementation only base64-decoded the JWT payload and
// never checked the signature (3rd segment) or audience — anyone could POST
// a hand-crafted, unsigned "token" with any staff email + email_verified:true
// and log in as that user, admin included. Apps Script has no native
// RSA/JWKS verification, so we delegate signature + expiry validation to
// Google's tokeninfo endpoint (Google's documented server-side fallback for
// environments without a JWT library: https://developers.google.com/identity/sign-in/web/backend-auth)
// and additionally check `aud` ourselves so a token minted for a *different*
// Google OAuth client can't be replayed against this app.
function verifyGoogleIdToken(idToken) {
  if (!idToken || typeof idToken !== "string") return { email: null, reason: "no token sent" };
  // CLIENT_ID_() throws if the CLIENT_ID Script Property was never set
  // (see setConfig() above) — a deployment/config problem, not a bad token.
  // Read it outside the try/catch below so that distinction isn't lost: a
  // missing config value used to get swallowed into the same "invalid
  // token" result as an actually-bad token, which sent users chasing their
  // Google account instead of the real fix (run setConfig(...)).
  var clientId = CLIENT_ID_();
  // `reason` is for Logger.log only — doPost never sends it to the caller any
  // more (2026-09-17 review, nits/UP-B14). It used to echo the whole tokeninfo
  // body, the token's aud AND the expected client ID to an unauthenticated
  // request. `unavailable` marks Google's side failing (5xx, network), which
  // the caller reports as "try again" rather than as a bad token.
  try {
    var resp = UrlFetchApp.fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken),
      { muteHttpExceptions: true }
    );
    var code = resp.getResponseCode();
    if (code >= 500) return { email: null, reason: "tokeninfo returned HTTP " + code, unavailable: true };
    if (code !== 200) return { email: null, reason: "tokeninfo returned HTTP " + code };
    var payload;
    try { payload = JSON.parse(resp.getContentText()); }
    catch (parseErr) { return { email: null, reason: "tokeninfo body is not JSON", unavailable: true }; }
    if (!payload || payload.aud !== clientId) return { email: null, reason: "aud mismatch" };
    if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") return { email: null, reason: "bad iss" };
    if (!payload.exp || Number(payload.exp) < Math.floor(Date.now() / 1000)) return { email: null, reason: "token expired" };
    if (payload.email_verified !== "true" && payload.email_verified !== true) return { email: null, reason: "email not verified" };
    if (!payload.email) return { email: null, reason: "no email in payload" };
    // `hd` is present only for a Google Workspace account (see GOOGLE_HD_ENFORCE).
    return { email: payload.email, hd: payload.hd ? String(payload.hd) : "", reason: null };
  } catch (e) { return { email: null, reason: "tokeninfo fetch failed: " + e.message, unavailable: true }; }
}

// ── Password hashing ──────────────────────────────────────────
// v1 (legacy): single-round SHA-256(password+salt) — fast to brute-force
// offline if the Staff sheet ever leaks. Kept only so existing hashes still
// verify; every successful v1 login transparently rehashes to v2 below.
function hashPwdLegacy(password, salt) {
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password + salt,
    Utilities.Charset.UTF_8
  );
  return raw.map(function(b) {
    return ("0" + (b & 0xff).toString(16)).slice(-2);
  }).join("");
}
// v2: HMAC-SHA256 stretched over many iterations (PBKDF2-style) — Apps
// Script has no native bcrypt/Argon2/PBKDF2, so this loop is the closest
// equivalent using Utilities.computeHmacSha256Signature. Iteration count is
// a deliberate latency/security tradeoff: high enough to matter offline,
// low enough to keep a login request well under Apps Script's timeout.
var HASH_V2_ITERATIONS = 3000;
function hashPwdV2(password, salt) {
  var data = String(password) + ":" + String(salt);
  for (var i = 0; i < HASH_V2_ITERATIONS; i++) {
    var raw = Utilities.computeHmacSha256Signature(data, salt);
    data = raw.map(function(b) { return ("0" + (b & 0xff).toString(16)).slice(-2); }).join("");
  }
  return "v2$" + data;
}
// Verifies against either format; tells the caller whether the stored hash
// is still on the legacy (weak) format so it can be upgraded in place.
function verifyPwd(password, salt, storedHash) {
  storedHash = String(storedHash || "");
  if (storedHash.indexOf("v2$") === 0) {
    return { ok: safeEqual(hashPwdV2(password, salt), storedHash), legacy: false };
  }
  return { ok: safeEqual(hashPwdLegacy(password, salt), storedHash), legacy: true };
}
// Constant-time string comparison — plain !== leaks timing info proportional
// to the number of matching leading characters, which (over enough attempts)
// can help an attacker guess a hash/password byte-by-byte.
function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return diff === 0;
}

// ── Brute-force lockout (shared by login + changePassword) ──────
// Locks a key for LOCKOUT_MS after 5 failures; the counter self-clears once
// the cooldown elapses so a handful of typos can't permanently brick an
// account (earlier versions of the login-only check had exactly that bug —
// see git history). Used for both the login password check and
// changePassword's oldPassword check, since a valid session token (leaked,
// or a shared unlocked NICU workstation) would otherwise let someone brute
// force the account's real password via changePassword with no rate limit.
var LOCKOUT_MS = 15 * 60 * 1000;
// One answer for "no such staff email" and "wrong password" — see login Path B.
var LOGIN_FAILED_MSG = "email หรือรหัสผ่านไม่ถูกต้อง";
// New-password floor. Existing passwords keep working; this applies the next
// time one is changed. Mirrored in app.jsx's ChangePasswordModal.
var MIN_PASSWORD_LENGTH = 10;
// Upper bound too (2026-09-17 review, SEC-B11): matches login's 256 cap, so a
// password that can be set can always be typed back in.
var MAX_PASSWORD_LENGTH = 256;
var LOCKOUT_MAX_FAILS = 5;
// Counters live in one of two stores. A real account's counter is a Script
// Property ("props"), as before. An address that is NOT a password account —
// unknown, or a Google/Workspace staff row with no hash — is counted in
// CacheService ("cache") for the same 15 minutes instead (SEC-B8): it gets the
// same lockout answer as a real account, without letting an unauthenticated
// caller create one Script Property per address it invents (2026-09-11, B3).
function _lockoutRead(key, store) {
  return store === "cache"
    ? CacheService.getScriptCache().get(key)
    : PropertiesService.getScriptProperties().getProperty(key);
}
function _lockoutStatus(key, store) {
  var raw = (_lockoutRead(key, store) || "0:0").split(":");
  var fails = parseInt(raw[0]) || 0;
  var failAt = parseInt(raw[1]) || 0;
  var locked = fails >= LOCKOUT_MAX_FAILS && (Date.now() - failAt) < LOCKOUT_MS;
  if (fails >= LOCKOUT_MAX_FAILS && !locked) fails = 0; // cooldown elapsed — fresh start
  return { fails: fails, locked: locked };
}
function _recordFailure(key, fails, store) {
  var value = (fails + 1) + ":" + Date.now();
  if (store === "cache") CacheService.getScriptCache().put(key, value, Math.ceil(LOCKOUT_MS / 1000));
  else PropertiesService.getScriptProperties().setProperty(key, value);
}
function _clearLockout(key, store) {
  if (store === "cache") CacheService.getScriptCache().remove(key);
  else PropertiesService.getScriptProperties().deleteProperty(key);
}
// Counts the attempt BEFORE the password is checked (2026-09-17 review,
// SEC-B5). The old order — read the counter, spend ~1 s on the 3000-round
// hash, then write — let every request of a parallel burst read the same
// count before any of them wrote, so twenty simultaneous guesses registered as
// one. The read+write pair now runs under a SHORT script lock (property I/O
// only, never the hash), so at most LOCKOUT_MAX_FAILS guesses reach the hash
// per window however they are timed. A correct password clears the counter
// afterwards. Returns { locked, fails } where fails is the count including
// this attempt. Throws a "Busy" coded error if the lock is not free in time.
var LOCKOUT_LOCK_WAIT_MS = 5000;
function _beginPasswordAttempt(key, store) {
  var lock = LockService.getScriptLock();
  _waitLockOrBusy(lock, LOCKOUT_LOCK_WAIT_MS);
  try {
    var st = _lockoutStatus(key, store);
    if (st.locked) return { locked: true, fails: st.fails };
    _recordFailure(key, st.fails, store);
    return { locked: false, fails: st.fails + 1 };
  } finally {
    lock.releaseLock();
  }
}
// Key names carry a SHA-256 of the address, never the address.
function _loginFailKey(email)      { return "fail_" + _emailKeyHash(email); }
function _unknownLoginKey(email)   { return "lfail_" + _emailKeyHash(email); }
function _pwdChangeFailKey(email)  { return "pwdchg_fail_" + _emailKeyHash(email); }
// The pre-2026-09-17 key shape, only so a successful sign-in can delete a
// counter left behind under it (no stranded properties after the deploy).
function _legacyFailKey(prefix, email) {
  return prefix + String(email || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
}

// ── Script lock with a contract-shaped timeout ─────────────────
// LockService.waitLock throws a raw English "Lock timeout" error, which the
// bedside saw as "บันทึกไม่สำเร็จ: Lock timeout: another process…". Every
// caller takes the lock BEFORE its first write, so a timeout here guarantees
// nothing was written — which is what makes the "Busy" answer safe to retry
// (2026-09-17 client contract; review UP-B5).
var BUSY_MSG = "มีผู้ใช้อื่นกำลังบันทึก — ลองใหม่อีกครั้ง";
function _waitLockOrBusy(lock, ms) {
  try {
    lock.waitLock(ms);
  } catch (e) {
    Logger.log("script lock not acquired in " + ms + " ms: " + e.message);
    throw _codedError(BUSY_MSG, "Busy", true);
  }
}

// ── Session epoch ────────────────────────────────────────────
// A per-user counter (in ScriptProperties, so it survives past the cache's
// 6h TTL) embedded into every token issued for that user. Bumping it
// (on password change) makes every previously-issued token for that user
// fail verifyToken() immediately, even though the token itself is still
// sitting unexpired in the cache — this is how we revoke sessions we can't
// otherwise enumerate (CacheService has no "list keys for user" op).
//
// Key shape changed 2026-09-17 (review, nits). The old key replaced every
// non-alphanumeric character with "_", so a.b@x and a_b@x shared ONE epoch —
// a password change on either signed the other out — and the key name was the
// address itself. The new key is a SHA-256 of the address.
//
// Migration, so the deploy invalidates nobody: a user with no new-shape key
// yet reads the old key's value (every token issued before the deploy carries
// that value). bumpUserEpoch writes BOTH keys, with a value above either,
// so a rollback to a version that only reads the old key still sees every
// revocation made after the deploy. The only residual old-key effect is the
// one it always had: a bump for a.b@x can sign out a_b@x until a_b@x has a
// new-shape key of their own — the fail-safe direction.
function _epochKey(email) {
  return "epoch2_" + _emailKeyHash(email);
}
function _legacyEpochKey(email) {
  return "epoch_" + String(email).trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
}
function getUserEpoch(email) {
  var props = PropertiesService.getScriptProperties();
  var current = props.getProperty(_epochKey(email));
  if (current != null && current !== "") return current;
  return props.getProperty(_legacyEpochKey(email)) || "0";
}
function bumpUserEpoch(email) {
  var props = PropertiesService.getScriptProperties();
  var seen = parseInt(getUserEpoch(email), 10) || 0;
  var legacy = parseInt(props.getProperty(_legacyEpochKey(email)) || "0", 10) || 0;
  var next = String(Math.max(seen, legacy) + 1);
  props.setProperty(_epochKey(email), next);
  props.setProperty(_legacyEpochKey(email), next);
  return next;
}

// ── Session token ─────────────────────────────────────────────
// Generates a UUID-style token, stores {email,role,name,epoch} in
// ScriptCache. CacheService.put() has a hard server-enforced cap of 21600s
// (6h) on expirationInSeconds — a value above that throws "Argument too
// large: expirationInSeconds" at call time. This used to be set to 43200
// (12h), which is over the cap: createSession() would throw on every login
// (both auth paths), and verifyToken()'s sliding-window refresh would throw
// on every authenticated request. 21600 is the real max achievable via
// CacheService alone; a longer TTL would need session state to live
// somewhere other than CacheService (e.g. PropertiesService, which has no
// TTL semantics and would need its own expiry bookkeeping).
var SESSION_TTL_SECONDS = 21600; // 6h — CacheService's documented max

// Absolute session lifetime, whatever the activity (Praew's decision
// 2026-09-17, review SEC-B9). The TTL above is SLIDING: a token used at least
// once every six hours never expired, so a session left on a shared ward
// workstation lived for as long as the tab kept polling — days. createSession
// stamps issuedAt; verifyToken refuses (and removes) a session older than this
// and answers { error: "Unauthorized", reason: "SessionMaxAge" }, which a
// client that predates the reason treats as ordinary Unauthorized. A session
// issued before this deploy has no issuedAt: it is stamped on its first
// verification instead, so the deploy logs nobody out and those sessions get
// the full 12 h from that moment. The 30-minute idle logout is client-side.
var SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
// A token is a UUID (36 chars). Anything far longer is not one of ours, and
// "sess_" + an over-long string would exceed CacheService's 250-char key limit
// and throw — which must read as "no such session", not as a service outage.
var MAX_TOKEN_LENGTH = 200;
var SERVICE_UNAVAILABLE_MSG = "ระบบไม่ว่างชั่วคราว — ลองใหม่อีกครั้ง";

// ── Daily-log edit lock ──────────────────────────────────────────
// A short, best-effort courtesy lock so two staff don't both work the same
// patient+date entry at once — see acquireLogLock/releaseLogLock below.
// Deliberately short and auto-expiring (CacheService's own TTL, not a manual
// timestamp check): a crashed tab or closed browser must never strand a
// patient's entry locked. The client re-acquires (heartbeats) roughly every
// half of this TTL while the Calculator stays open on that entry.
var LOG_LOCK_TTL_SECONDS = 90;

// How long verifyToken() may trust a cached Staff row. Bounds the window in
// which a disabled or demoted account can keep using a session it already
// holds. Straight sheet-read-per-request would make revocation instant, but
// verifyToken runs on EVERY authenticated call, so that is a full Staff-tab
// read on every save/sync/log entry — latency the ward feels and GAS quota
// spent. 60s trades a minute of stale access for one read per user per
// minute.
//
// Hand edits (role, `active`, a col G typed into the sheet) are seen within
// this TTL. The backend's own writes to a Staff row's cols E–H drop the
// cached copy at once (_forgetStaffRow), because the copy carries col G,
// must_change_password. Until 2026-09-22 nothing dropped it, and the claim
// here that password changes were unaffected was half true: bumping the user
// epoch (read from PropertiesService, never cached) still revoked every
// OTHER session at once, but a forced change was refused as
// PasswordChangeRequired for up to a minute after it succeeded.
var STAFF_RECHECK_TTL_SECONDS = 60;
// Caches ONLY what verifyToken reads — email, role, name, active,
// must_change_password — at their usual indices, with E/F/H blanked. It used to
// cache the whole Staff row: password_hash, salt and the plaintext temp
// password sat in ScriptCache for a minute per request (2026-09-17 review).
function _staffRowForCache(found) {
  if (!found) return null;
  var d = found.data || [];
  return { row: found.row, data: [d[0], d[1], d[2], d[3], "", "", d[6], ""] };
}
// One key for the reader and for _forgetStaffRow. Trimmed and lowercased like
// getStaffRow's match, so an address typed into setInitialPassword in another
// case reaches the entry cached under the session's own (normalised) email.
function _staffCacheKey(email) {
  return "staffrc_" + String(email).trim().toLowerCase();
}
function _getStaffRowCached(email) {
  var cache = CacheService.getScriptCache();
  var key   = _staffCacheKey(email);
  var hit   = cache.get(key);
  // A miss returns null; a cached "not found" round-trips as the string
  // "null" and parses back to null, so a deleted staff row also revokes
  // within the TTL instead of being re-read every request.
  if (hit !== null) {
    try { return JSON.parse(hit); } catch (e) { /* fall through and re-read */ }
  }
  var found = _staffRowForCache(getStaffRow(email));
  try { cache.put(key, JSON.stringify(found), STAFF_RECHECK_TTL_SECONDS); }
  catch (e) { Logger.log("staff row cache put skipped: " + e.message); }
  return found;
}
// Every function that writes a Staff row's cols E–H calls this after the
// write (test/verify-staff-cache-password-writes.cjs § 8 checks). A stale
// copy failed both ways: a forced change stayed refused, and a newly
// provisioned temp password read col G blank and passed the gate. Best
// effort, like _forgetSchemaCheck: if the cache throws, the 60 s TTL is the
// bound again, and the caller still goes on to bump the user epoch.
function _forgetStaffRow(email) {
  try { CacheService.getScriptCache().remove(_staffCacheKey(email)); }
  catch (e) { Logger.log("staff row cache remove skipped: " + e.message); }
}

// Authorization values fail closed. A blank/misspelled Staff role used to be
// promoted to `doctor` (blank) or preserved as an unknown role that could still
// call getActivePatients. Only these three roles exist in the product model.
var VALID_STAFF_ROLES = { admin: true, doctor: true, nurse: true };
function _staffRole(value) {
  var role = String(value == null ? "" : value).trim().toLowerCase();
  return VALID_STAFF_ROLES[role] ? role : null;
}

function createSession(email, role, name, mustChangePassword, authMethod) {
  var token = Utilities.getUuid();
  var cache = CacheService.getScriptCache();
  cache.put("sess_" + token, JSON.stringify({
    email: email,
    role: role,
    name: name,
    epoch: getUserEpoch(email),
    mustChangePassword: Boolean(mustChangePassword),
    authMethod: authMethod,   // "google" | "password": what proved it (_passwordSession)
    issuedAt: Date.now(),
  }), SESSION_TTL_SECONDS);
  return token;
}

// Only a session proved by a password can be running on a temp password, so
// only it is held by col G. A Google session never is: it has no password to
// change, and a temp password left on its row from before its domain was
// listed must not trap it (2026-09-22). Keying this on the email domain instead
// let a chula.ac.th temp password skip the change. A session minted before
// sessions recorded their method keeps the domain rule it was minted under.
function _passwordSession(session) {
  if (session.authMethod === "google") return false;
  if (session.authMethod === "password") return true;
  return !_usesGoogleSignIn(session.email);
}

// Returns the session, or null. `info` (optional) says WHY it is null, so
// doPost can answer by the 2026-09-17 contract:
//   info.reason = "SessionMaxAge"   → { error: "Unauthorized", reason }
//   info.serviceUnavailable = true  → { code: "ServiceUnavailable", retryable }
// Until then a CacheService/PropertiesService/Sheets exception anywhere in
// here was swallowed into null, i.e. "Unauthorized" — and the client answers
// Unauthorized by clearing the session. A ten-second Google hiccup therefore
// signed out every ward device that happened to sync during it (review
// SEC-B13 / UP-B2). Null now means only a genuinely invalid session: none,
// corrupt, too old, epoch mismatch, inactive, or no valid role.
function verifyToken(token, info) {
  info = info || {};
  if (typeof token !== "string" || token.length < 10 || token.length > MAX_TOKEN_LENGTH) return null;
  var cache, val;
  try {
    cache = CacheService.getScriptCache();
    val = cache.get("sess_" + token);
  } catch (e) { return _sessionServiceFailure(info, e); }
  if (!val) return null;
  var parsed;
  try { parsed = JSON.parse(val); } catch (e) { return null; } // { email, role, name, epoch, mustChangePassword, issuedAt }
  if (!parsed || typeof parsed !== "object" || !parsed.email) return null;
  try {
    var now = Date.now();
    var issuedAt = Number(parsed.issuedAt);
    if (!(issuedAt > 0)) { issuedAt = now; parsed.issuedAt = now; } // pre-cap session: stamped now, persisted below
    if (now - issuedAt > SESSION_MAX_AGE_MS) {
      cache.remove("sess_" + token);
      info.reason = "SessionMaxAge";
      return null;
    }
    if (String(parsed.epoch || "0") !== getUserEpoch(parsed.email)) {
      cache.remove("sess_" + token); // stale — password changed since this token was issued
      return null;
    }
    // Staff status and role are mutable. Re-check them so a disabled/demoted
    // account cannot retain its old PHI access for the session's full six
    // hours — via a short-TTL cache, so this costs one Staff-tab read per user
    // per minute rather than one per request (see STAFF_RECHECK_TTL_SECONDS).
    var found = _getStaffRowCached(parsed.email);
    if (!found || (found.data[3] !== true && String(found.data[3]).toUpperCase() !== "TRUE")) {
      cache.remove("sess_" + token);
      return null;
    }
    var currentRole = _staffRole(found.data[1]);
    if (!currentRole) {
      cache.remove("sess_" + token);
      return null;
    }
    parsed.role = currentRole;
    parsed.name = String(found.data[2] || parsed.email);
    parsed.mustChangePassword = _passwordSession(parsed) &&
      (found.data[6] === true || String(found.data[6] || "").toUpperCase() === "TRUE");
    cache.put("sess_" + token, JSON.stringify(parsed), SESSION_TTL_SECONDS); // sliding window — reset TTL on every use
    return parsed;
  } catch (e) { return _sessionServiceFailure(info, e); }
}
function _sessionServiceFailure(info, e) {
  Logger.log("verifyToken: service failure, answering ServiceUnavailable: " + (e && e.message));
  info.serviceUnavailable = true;
  return null;
}

// ── Staff sheet ───────────────────────────────────────────────
function getSheetStaff() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID_());
  var sh = ss.getSheetByName("Staff");
  if (!sh) {
    sh = ss.insertSheet("Staff");
    sh.appendRow(["email", "role", "name", "active", "password_hash", "salt", "must_change_password", "temp_password"]);
  }
  return sh;
}

// ── Staff lookup ──────────────────────────────────────────────
function getStaffRow(email) {
  if (!email) return null;
  var rows = getSheetStaff().getDataRange().getValues();
  var el = email.trim().toLowerCase();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === el) return { row: i + 1, data: rows[i] };
  }
  return null;
}

// ── setInitialPassword — run from Apps Script editor ─────────
// Usage: setInitialPassword("user@redcross.or.th", "MyP@ssw0rd")
function setInitialPassword(email, password) {
  if (!email || !password) { Logger.log("Usage: setInitialPassword('email@domain', 'password')"); return; }
  var sh = getSheetStaff();
  var found = getStaffRow(email);
  var salt = Utilities.getUuid();
  var hash = hashPwdV2(password, salt);
  // Cols G/H (must_change_password/temp_password) cleared here too: an admin
  // explicitly choosing a password out-of-band supersedes any pending forced-
  // change state from auto-provisioning (e.g. re-running this after the temp
  // password already leaked/was mistyped to the wrong person).
  if (found) {
    sh.getRange(found.row, 5, 1, 4).setValues([[hash, salt, false, ""]]);
    Logger.log("Password updated for: " + email);
  } else {
    sh.appendRow([_sheetSafe(email), "doctor", _sheetSafe(email.split("@")[0]), true, hash, salt, false, ""]);
    Logger.log("Staff added with password: " + email);
  }
  // Both branches: the cached copy may hold the old col G, or "not found".
  _forgetStaffRow(email);
  // An admin reset is exactly the moment an existing session must end: the
  // usual reason for one is "someone else got the temp password first". It
  // used to leave every session already issued on the old password working
  // (2026-09-17 review, SEC-B4).
  bumpUserEpoch(email);
}

// ── clearStaffPassword — run from Apps Script editor ──────────
// Usage: clearStaffPassword("user@chula.ac.th")
// Clears password_hash/salt/must_change_password/temp_password (cols E-H)
// back to blank — for an account that signs in via Google/Workspace and
// shouldn't have a password fallback, but picked one up anyway (e.g. via
// backfillDefaultPasswords, which can't tell "Workspace-enabled custom
// domain" apart from "non-Gmail, needs a password" — both just look like
// "not @gmail.com").
function clearStaffPassword(email) {
  var found = getStaffRow(email);
  if (!found) { Logger.log("No Staff row found for: " + email); return; }
  getSheetStaff().getRange(found.row, 5, 1, 4).clearContent();
  _forgetStaffRow(email);
  // Same as setInitialPassword: removing the password must also end every
  // session that was issued on it (2026-09-17 review, SEC-B4).
  bumpUserEpoch(email);
  Logger.log("Cleared password for: " + email);
}

// ── autoProvisionStaffPassword — simple onEdit trigger ─────────
// 2026-07-18: pasting a batch of new non-Gmail staff rows straight into the
// Staff tab (the normal workflow) left them with blank password_hash/salt —
// setInitialPassword() was documented as a required manual follow-up step
// per email, easy to forget, and 10 accounts silently couldn't log in until
// it was run by hand. This trigger does that step automatically: the moment
// a non-Gmail row is saved with an email but no password_hash yet, it
// provisions the account so it's usable immediately. Gmail/Workspace rows
// (no password by design) and rows that already have a hash are left alone —
// this only ever fills a blank, never overwrites a real password a user has
// since set for themselves via "เปลี่ยนรหัสผ่าน".
//
// 2026-07-18, same day, second pass: the first version of this trigger used
// one hardcoded shared password (DEFAULT_NEW_USER_PASSWORD = "nicunicu") for
// every auto-provisioned account. That's a standing vulnerability, not just
// a weak default — the app has no build step (app-walkthrough.md §7), so
// every non-secret file including this one is effectively public, and unlike
// SPREADSHEET_ID (which only needed to stop being a literal going forward)
// a *login credential* baked into source stays a working skeleton key for
// every future account until someone remembers to change it, with no
// mechanism forcing that to happen. Fixed by generating a random password
// per account (_genTempPassword) instead of reusing a constant, and by
// having login() report must_change_password so the client can force a
// change before granting any access — see login()'s Path B and app.jsx's
// post-login gate. The plaintext is stamped into col H (temp_password) only
// long enough for whoever added the row to relay it to the new staff member;
// it's cleared automatically the moment that person successfully changes it
// (see changePassword below), and it's no more exposed in the interim than
// password_hash/salt already are — Staff-tab access is the trust boundary
// here (HANDOFF.md's PDPA notes: Sheet ACLs, not obscurity, are what has to
// hold), same as it always was for those columns.
//
// `onEdit` is a *simple* trigger (the reserved name is enough — no manual
// trigger installation needed), which runs under restricted authorization.
// That's sufficient here since it only touches the spreadsheet it's bound to
// via SpreadsheetApp/Utilities; it does not need Script Properties, email,
// or UrlFetchApp. It fires only for edits made directly in the Sheets UI
// (typing or pasting), not for edits made via the Sheets API or another
// script — which covers the normal way staff rows get added.
function _genTempPassword() {
  // Utilities.getUuid() is a random (v4) UUID — 122 bits of entropy. 10 hex
  // chars off it (~40 bits) is already far past what a 5-attempt/15-min
  // lockout (_lockoutStatus) needs to make guessing infeasible, and short
  // enough for an admin to read aloud/retype when handing it off. This is a
  // use-once value the recipient is forced to replace on first login, not a
  // long-lived credential, so it doesn't need password-grade length.
  return Utilities.getUuid().replace(/-/g, "").slice(0, 10);
}

// Domains that authenticate via Google Sign-In despite not being gmail.com —
// e.g. Google Workspace on a custom domain. These never get a password_hash,
// same as gmail.com. 2026-07-18: peeraporn.po@chula.ac.th picked up a
// default password from backfillDefaultPasswords because "not @gmail.com"
// isn't the same test as "doesn't use Google Sign-In" — chula.ac.th is
// Workspace-enabled. Add a domain here (lowercase, no @) if the same
// happens for another one; use clearStaffPassword(email) to undo it for an
// account that already got one.
//
// 2026-09-22 (Praew): every Chula domain signs in with Google and gets no
// NeoFeed password. Each domain below has a Google Workspace sign-in page
// (google.com/a/<domain>/ServiceLogin; chula.ac.th and student.chula.ac.th hand
// on to Chula's Microsoft SSO). redcross.or.th has none, so it stays a password
// domain. Exact matches only: an unlisted subdomain is a password domain.
// Listing decides who gets a password, not who may sign in — that is still
// only an active Staff row (doPost's login).
var GOOGLE_WORKSPACE_DOMAINS = ["chula.ac.th", "student.chula.ac.th", "md.chula.ac.th", "docchula.com", "chulahospital.org"];
function _usesGoogleSignIn(email) {
  var domain = String(email).toLowerCase().split("@")[1] || "";
  return domain === "gmail.com" || GOOGLE_WORKSPACE_DOMAINS.indexOf(domain) !== -1;
}

// ── Google Sign-In `hd` restriction — prepared, OFF (Praew, 2026-09-17) ──
// The gap (review SEC-B7): Path A trusts any Google account whose verified
// email equals a Staff row. A Google account can be CREATED on any address —
// including a password account's @redcross.or.th address — so Google Sign-In
// currently bypasses that account's password and its lockout entirely.
// Enforced, Path A accepts only:
//   • gmail.com / googlemail.com addresses (Google owns those mailboxes), or
//   • an address in GOOGLE_WORKSPACE_DOMAINS whose token carries hd equal to
//     that domain (proves the Workspace tenant issued the account).
// Everything else is refused with a message pointing at the password path.
//
// Why it ships OFF: if some sign-ins on a listed domain arrive WITHOUT hd (a
// consumer Google account on a Workspace address), enforcing would lock those
// people out. So while it is off, every Workspace-domain Google sign-in records, with
// no personal data, whether its token carried the matching hd:
//   Script Property  hd_seen_<domain> = "yes" | "no"
// "no" is sticky — one sign-in without hd is enough to make enforcing unsafe.
//
// How to flip it: (1) Apps Script editor → Project Settings → Script
// Properties, and check hd_seen_<domain> for every GOOGLE_WORKSPACE_DOMAINS
// entry after a normal working week — a domain nobody signed in from has none.
// (2) Only if none reads "no", set GOOGLE_HD_ENFORCE = true, run the
// harnesses, and deploy the usual clasp way. If one reads "no", find out who
// signs in without a Workspace account before flipping — they would need a
// password account (setInitialPassword) first.
var GOOGLE_HD_ENFORCE = false;
var GOOGLE_HD_REFUSED_MSG = "บัญชีนี้ต้องเข้าสู่ระบบด้วย email และรหัสผ่าน";
function _googleAccountAllowed(email, hd) {
  var domain = String(email || "").toLowerCase().split("@")[1] || "";
  if (domain === "gmail.com" || domain === "googlemail.com") return true;
  var workspace = GOOGLE_WORKSPACE_DOMAINS.indexOf(domain) !== -1;
  var hdMatches = workspace && String(hd || "").toLowerCase() === domain;
  if (!GOOGLE_HD_ENFORCE) {
    if (workspace) _recordHdSeen(domain, hdMatches);
    return true;
  }
  return hdMatches;
}
// Telemetry must never block a sign-in, and must not write a property on every
// login: it writes only when the stored answer would change.
function _recordHdSeen(domain, hdMatches) {
  try {
    var props = PropertiesService.getScriptProperties();
    var key = "hd_seen_" + domain;
    var prev = props.getProperty(key);
    if (!hdMatches && prev !== "no") props.setProperty(key, "no");
    else if (hdMatches && prev == null) props.setProperty(key, "yes");
  } catch (e) { Logger.log("hd telemetry skipped: " + e.message); }
}

function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    var editedTab = sheet.getName();
    // A hand edit to either data tab makes the cached sync payload stale, and
    // an edit to row 1 may have fixed (or broken) a header the column guard
    // checks — drop both, so neither waits out its TTL. Neither helper throws.
    // (Structural edits — inserting/deleting a row or column — fire onChange,
    // not onEdit, and are caught by the TTLs and the per-write row re-check.)
    if (editedTab === "Daily_Log" || editedTab === "Patient_Registry") {
      _bumpDataVersion();
      if (e.range.getRow() === 1) _forgetSchemaCheck(editedTab);
      return;
    }
    if (editedTab !== "Staff") return;

    var firstRow = e.range.getRow();
    var startRow = Math.max(firstRow, 2); // skip the header row
    var lastRow  = firstRow + e.range.getNumRows() - 1;
    if (startRow > lastRow) return;

    for (var r = startRow; r <= lastRow; r++) {
      var row = sheet.getRange(r, 1, 1, 6).getValues()[0]; // A–F (G/H not needed to decide)
      var email        = String(row[0] || "").trim();
      var active       = row[3];
      var existingHash = String(row[4] || "");
      if (!email) continue;
      if (_usesGoogleSignIn(email)) continue; // Google Sign-In — no password
      if (existingHash) continue; // already has a password — never overwrite
      if (active !== true && String(active).toUpperCase() !== "TRUE") continue; // row not active yet

      var pwd  = _genTempPassword();
      var salt = Utilities.getUuid();
      var hash = hashPwdV2(pwd, salt);
      sheet.getRange(r, 5, 1, 4).setValues([[hash, salt, true, pwd]]);
      _forgetStaffRow(email);
      Logger.log("Auto-provisioned temp password for: " + email + " (forced change on first login)");
    }
  } catch (err) {
    Logger.log("onEdit auto-provision failed: " + err.message);
  }
}

// ── backfillDefaultPasswords — run once from Apps Script editor ─
// onEdit above only catches *future* edits — it never fired for the batch
// of non-Gmail rows pasted in before this trigger existed, so those 10
// accounts (2026-07-18) are still stuck with no password_hash. One-time
// catch-up: same logic as onEdit, applied to every existing row instead of
// just the just-edited range. Already-provisioned/Gmail rows are untouched;
// safe to re-run. Kept its original name for continuity with the Staff-tab
// comment/HANDOFF references from earlier the same day, even though it now
// generates a random per-account password rather than one shared default.
function backfillDefaultPasswords() {
  var sheet = getSheetStaff();
  var data = sheet.getDataRange().getValues();
  var fixed = [];
  for (var i = 1; i < data.length; i++) {
    var email        = String(data[i][0] || "").trim();
    var active       = data[i][3];
    var existingHash = String(data[i][4] || "");
    if (!email) continue;
    if (_usesGoogleSignIn(email)) continue;
    if (existingHash) continue;
    if (active !== true && String(active).toUpperCase() !== "TRUE") continue;

    var pwd  = _genTempPassword();
    var salt = Utilities.getUuid();
    var hash = hashPwdV2(pwd, salt);
    sheet.getRange(i + 1, 5, 1, 4).setValues([[hash, salt, true, pwd]]);
    _forgetStaffRow(email);
    fixed.push(email);
  }
  // Emails and a count only (2026-09-17 review, SEC-B10). This used to log
  // "email (temp: <password>)" for every account — into the Apps Script
  // execution log, which every editor of the project can read, and which
  // outlives the moment the password is relayed. The temp passwords are in
  // Staff col H, where they always were (Praew's call to keep).
  Logger.log("Backfilled temp password for " + fixed.length + " account(s) — read them from Staff col H: " + fixed.join(", "));
  return { count: fixed.length, emails: fixed };
}

// ── Sheet accessors ───────────────────────────────────────────
// The header rows are also what the column-drift guard (_assertSchema) checks
// the live tabs against — one list, so the two cannot disagree.
var PAT_HEADERS = [
  "sessionId","name","initials","bw","ga","sex",
  "dob","admissionDate","twinSuffix","status",
  "currentBed","diagnosis","weights","lengths","hcs","bedHistory",
  "statusDate","multiplesCount"
];
var LOG_HEADERS = [
  "ts","sessionId","dol","weight","fluid","gir",
  "pro","kcal","na","k","ca","p","enVolPerKg","route","status","submittedBy",
  "suppMTV","suppVitD_IU","suppCa_mg","suppCaType",
  "suppPO4_mmol","suppPO4Type","suppFe_mg","suppFeType",
  "calcInputJson","entryId","lastModified","lastModifiedBy",
  "ioInput","ioOutput","drainContent","constantsVersion","appVersion",
  "published","publishedBy","revisionNumber","revisionOf","supersededAt"
];
var LOG_WIDTH = LOG_HEADERS.length; // 38, A–AL
// `ss` is optional: a caller that already opened the spreadsheet can pass it,
// so one execution opens the file once. No argument behaves exactly as before.
function getSheetPat(ss) {
  ss = ss || SpreadsheetApp.openById(SPREADSHEET_ID_());
  var sh = ss.getSheetByName("Patient_Registry");
  if (!sh) {
    sh = ss.insertSheet("Patient_Registry");
    sh.appendRow(PAT_HEADERS.slice());
  }
  return sh;
}
function getSheetLog(ss) {
  ss = ss || SpreadsheetApp.openById(SPREADSHEET_ID_());
  var sh = ss.getSheetByName("Daily_Log");
  if (!sh) {
    sh = ss.insertSheet("Daily_Log");
    sh.appendRow(LOG_HEADERS.slice());
  }
  return sh;
}

// ── Column-drift guard (Praew's decision 2026-09-17: REFUSE SAVES) ───────────
// Daily_Log and Patient_Registry are read and written BY INDEX; the header
// labels are otherwise cosmetic. So a column inserted or deleted by hand in the
// Sheets UI silently re-maps every later field — an entryId lands under
// lastModified, a dose under the wrong nutrient — and nothing notices (review
// UP-B4). Before any write to either tab, the row-1 labels are compared with
// the header list the code itself creates the tab with:
//   • blank label → accepted. The live Daily_Log has never had AC–AL labelled
//     (applyLogHeaderColumns was never run), and a blank is not a shift.
//   • the expected label (trimmed, any case) → accepted.
//   • ANY other label → refused with code "SchemaMismatch", nothing written.
// Every column is checked, not just the key ones: a shift anywhere moves a
// non-blank label into a checked position. Reads are NOT guarded — a wrong
// sync is visible, a wrong save is not.
//
// The result is cached for 10 minutes, so the check costs one cache read per
// save. A bad header therefore keeps refusing for up to 10 minutes after it is
// fixed, unless the fix is typed into row 1 (onEdit drops the cache) or
// sheetHealthReport() is run (it drops it too). Run sheetHealthReport() BEFORE
// switching the deployment, so this guard cannot surprise the ward.
var SCHEMA_CACHE_TTL_SECONDS = 600;
function _schemaCacheKey(tab) { return "schema1_" + tab; }
function _colLetter(n) {
  var s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}
function _expectedHeaders(tab) {
  return tab === "Daily_Log" ? LOG_HEADERS : tab === "Patient_Registry" ? PAT_HEADERS : null;
}
// Pure check, no cache: null when fine, else { col, label } for the first bad cell.
function _schemaMismatch(sheet, tab) {
  var expected = _expectedHeaders(tab);
  var width = Math.min(expected.length, sheet.getMaxColumns());
  if (width < 1) return null;
  var labels = sheet.getRange(1, 1, 1, width).getValues()[0] || [];
  for (var c = 0; c < width; c++) {
    var got = String(labels[c] == null ? "" : labels[c]).trim();
    if (!got) continue;
    if (got.toLowerCase() !== expected[c].toLowerCase()) {
      return { col: _colLetter(c + 1), label: got.slice(0, 60) };
    }
  }
  return null;
}
function _assertSchema(sheet, tab) {
  var cache = null, cached = null;
  try { cache = CacheService.getScriptCache(); cached = cache.get(_schemaCacheKey(tab)); }
  catch (e) { cache = null; cached = null; }
  var result = null;
  if (cached) { try { result = JSON.parse(cached); } catch (e) { result = null; } }
  if (!result || typeof result !== "object") {
    var bad = _schemaMismatch(sheet, tab);
    result = bad ? { ok: false, col: bad.col, label: bad.label } : { ok: true };
    try { if (cache) cache.put(_schemaCacheKey(tab), JSON.stringify(result), SCHEMA_CACHE_TTL_SECONDS); }
    catch (e) { /* uncached: checked again next write */ }
  }
  if (result.ok !== true) {
    throw _codedError(
      "โครงสร้างคอลัมน์ใน Google Sheet ไม่ตรงกับที่ระบบคาด (" + tab + "!" + result.col + ": พบ '" + result.label +
      "') — หยุดบันทึกเพื่อป้องกันข้อมูลลงผิดช่อง แจ้ง admin",
      "SchemaMismatch", false);
  }
}
function _forgetSchemaCheck(tab) {
  try { CacheService.getScriptCache().remove(_schemaCacheKey(tab)); } catch (e) { /* TTL covers it */ }
}

// ── Positional-write re-check (2026-09-17 review, UP-B3) ─────────────────────
// The script lock serialises this file's own writes, but not a human in the
// Sheets UI: a row deleted, inserted or sorted by hand between the read that
// found row N and the write to row N sends the write to a different record.
// One cell read immediately before each positional write closes almost all of
// that window. On a mismatch nothing is written and the caller gets a
// retryable refusal (sync, then try again).
var ROW_MOVED_MSG = "แถวข้อมูลถูกย้ายระหว่างบันทึก (มีการแก้ไขชีตโดยตรง) — ไม่ได้บันทึก กรุณาซิงก์แล้วลองใหม่";
function _assertRowStillHolds(sheet, rowNumber, col, expected) {
  var now = sheet.getRange(rowNumber, col, 1, 1).getValues()[0][0];
  if (String(now == null ? "" : now) !== String(expected == null ? "" : expected)) {
    throw _codedError(ROW_MOVED_MSG, "", true);
  }
}

// ── JSON output ───────────────────────────────────────────────
function jsonOut(data) {
  var out = ContentService.createTextOutput(JSON.stringify(data));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

// ── GET handler ───────────────────────────────────────────────
// Only the unauthenticated health-check lives on GET. Every authenticated
// action (including what used to be here — getActivePatients, an admin
// "debug" staff-list dump) is POST-only in doPost, which takes the session
// token from the JSON body instead of a URL query string. The client has
// only ever called these over POST (see app.jsx), so this used to be dead
// surface from the app's own UI — but the deployed web app still accepted
// GET requests with ?token=... regardless, and a bearer token in a URL query
// string risks ending up in browser history or infra access logs in a way a
// POST body doesn't. Removed rather than left "just in case."
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "";
  try {
    if (action === "ping") return jsonOut({ ok: true, ts: new Date().toISOString() });
    return jsonOut({ error: "Use POST for authenticated actions." });
  } catch (err) { return jsonOut({ error: err.message }); }
}

// ── POST handler ──────────────────────────────────────────────
var LOCKOUT_LOGIN_MSG = "ลองใหม่ในอีก 15 นาที — login ผิดพลาดหลายครั้ง";
var GOOGLE_UNAVAILABLE_MSG = "Google Sign-In ไม่พร้อมใช้งานชั่วคราว — ลองใหม่";
// What an UNAUTHENTICATED caller sees when something throws. It used to be
// err.message verbatim (2026-09-17 review, nits) — internal detail such as a
// missing Script Property name, handed to anyone who POSTs a malformed body.
// The detail goes to Logger.log instead. Authenticated callers still get the
// message: the validation errors a save can raise are written for the bedside.
var GENERIC_ERROR_MSG = "เกิดข้อผิดพลาดในระบบ — ลองใหม่อีกครั้ง";

// One loginFail row per checked wrong password, and one lockout row on the
// attempt that trips the lock (not one per refused attempt afterwards, which
// an unauthenticated flood could grow without bound). 2026-09-17, SEC-B15.
function _auditLoginFailure(email, failsIncludingThis) {
  logAudit("loginFail", "", email);
  if (failsIncludingThis === LOCKOUT_MAX_FAILS) logAudit("lockout", "", email);
}

function doPost(e) {
  var action = "";
  var authed = false;
  try {
    var body = JSON.parse(e.postData.contents);
    if (!body || typeof body !== "object") throw new Error("request body is not a JSON object");
    action = typeof body.action === "string" ? body.action : "";

    // ── logout ────────────────────────────────────────────────
    if (action === "logout") {
      var logoutToken = body.token;
      if (typeof logoutToken === "string" && logoutToken && logoutToken.length <= MAX_TOKEN_LENGTH) {
        CacheService.getScriptCache().remove("sess_" + logoutToken);
      }
      return jsonOut({ ok: true });
    }

    // ── login ─────────────────────────────────────────────────
    if (action === "login") {

      var email, role, name;

      // Path A: Google Sign-In JWT (gmail / Google Workspace)
      if (body.googleToken) {
        var gVerify;
        try {
          gVerify = verifyGoogleIdToken(body.googleToken);
        } catch (cfgErr) {
          // Config problem (e.g. CLIENT_ID Script Property never set via
          // setConfig(...)) — distinct from an actually-invalid token, so
          // whoever's debugging isn't sent chasing the wrong thing. The detail
          // is in the execution log, not in the response.
          Logger.log("login: server config problem: " + cfgErr.message);
          return jsonOut({ status: "error", error: "ระบบยังไม่ได้ตั้งค่า (server config) — แจ้ง admin" });
        }
        email = gVerify.email;
        if (!email) {
          Logger.log("Google sign-in refused: " + gVerify.reason);
          // Google's own outage is not a bad token — say "try again", not
          // "your token is invalid" (2026-09-17 review, UP-B14).
          if (gVerify.unavailable) {
            return jsonOut({ status: "error", error: GOOGLE_UNAVAILABLE_MSG, code: "ServiceUnavailable", retryable: true });
          }
          return jsonOut({ status: "unauthorized", error: "Google token ไม่ถูกต้อง" });
        }
        if (!_googleAccountAllowed(email, gVerify.hd)) {
          logAudit("loginFail", "", email);
          return jsonOut({ status: "unauthorized", error: GOOGLE_HD_REFUSED_MSG });
        }
        var gFound = getStaffRow(email);
        if (!gFound) {
          logAudit("loginFail", "", email);
          return jsonOut({ status: "unauthorized", error: "ไม่พบบัญชีนี้ในระบบ" });
        }
        var gd = gFound.data;
        if (gd[3] !== true && String(gd[3]).toUpperCase() !== "TRUE") {
          logAudit("loginFail", "", email);
          return jsonOut({ status: "unauthorized", error: "บัญชีนี้ถูกระงับ" });
        }
        role = _staffRole(gd[1]);
        if (!role) return jsonOut({ status: "unauthorized", error: "บัญชีนี้ยังไม่ได้กำหนดสิทธิ์ที่ถูกต้อง — แจ้ง admin" });
        name = String(gd[2] || email);
        var tok = createSession(email, role, name, false, "google");
        logAudit("login", "", email);
        // A Google session is never held on a temp password (_passwordSession):
        // it has no password to change, so there's nothing to force — always false.
        return jsonOut({ status: "ok", name: name, role: role, email: email, token: tok, authMethod: "google", mustChangePassword: false });
      }

      // Path B: email + password (non-Google accounts)
      // typeof checks (2026-09-17 review, SEC-B11): a number or object here
      // used to reach .trim() / the hash as whatever String() made of it.
      email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      var password = typeof body.password === "string" ? body.password : "";
      if (!email || !password) return jsonOut({ status: "unauthorized", error: "กรุณากรอก email และรหัสผ่าน" });
      // RFC 5321 caps an address at 254 characters. Anything longer is not a
      // staff account, and refusing it here also bounds the lockout key below.
      if (email.length > 254 || password.length > MAX_PASSWORD_LENGTH)
        return jsonOut({ status: "unauthorized", error: LOGIN_FAILED_MSG });

      var found = getStaffRow(email);
      var d = found ? found.data : null;
      var storedHash = d ? String(d[4] || "") : "";
      var salt       = d ? String(d[5] || "") : "";

      // No password account behind this address: unknown email, a Google/
      // Workspace staff row, or a row not yet provisioned. All three used to be
      // told apart — "no such account" returned instantly with no hash, and a
      // hash-less row answered "ยังไม่ได้ตั้งรหัสผ่าน" — which let anyone test
      // which addresses are staff (2026-09-17 review, SEC-B8). Now: the same
      // message as a wrong password, a dummy hash so the response takes as long
      // as a real check, and the same 5-failure lockout, counted in
      // CacheService (15 min, key = SHA-256 of the address) so an invented
      // address still creates no Script Property (2026-09-11 review, B3).
      if (!storedHash) {
        var unknownKey = _unknownLoginKey(email);
        var unknownAttempt = _beginPasswordAttempt(unknownKey, "cache");
        if (unknownAttempt.locked) return jsonOut({ status: "unauthorized", error: LOCKOUT_LOGIN_MSG });
        hashPwdV2(password, "no-password-account");
        _auditLoginFailure(email, unknownAttempt.fails);
        return jsonOut({ status: "unauthorized", error: LOGIN_FAILED_MSG });
      }

      var failKey = _loginFailKey(email);
      var attempt = _beginPasswordAttempt(failKey, "props");
      if (attempt.locked) {
        return jsonOut({ status: "unauthorized", error: LOCKOUT_LOGIN_MSG });
      }
      var pwCheck = verifyPwd(password, salt, storedHash);
      if (!pwCheck.ok) {
        _auditLoginFailure(email, attempt.fails);
        return jsonOut({ status: "unauthorized", error: LOGIN_FAILED_MSG });
      }
      // The password is proven: the attempt counted above is cleared, and so
      // is any counter left under the pre-2026-09-17 key shape.
      _clearLockout(failKey, "props");
      _clearLockout(_legacyFailKey("fail_", email), "props");
      // Disabled status is reported only to someone who has just proved the
      // password — before, it was answered ahead of the password check.
      if (d[3] !== true && String(d[3]).toUpperCase() !== "TRUE") {
        logAudit("loginFail", "", email);
        return jsonOut({ status: "unauthorized", error: "บัญชีนี้ถูกระงับ" });
      }
      if (pwCheck.legacy) {
        // Transparent upgrade: user just proved they know the password, so
        // this is a safe moment to replace the weak v1 hash with v2.
        getSheetStaff().getRange(found.row, 5).setValue(hashPwdV2(password, salt));
      }

      role = _staffRole(d[1]);
      if (!role) return jsonOut({ status: "unauthorized", error: "บัญชีนี้ยังไม่ได้กำหนดสิทธิ์ที่ถูกต้อง — แจ้ง admin" });
      name = String(d[2] || email);
      // must_change_password (col G): set TRUE by auto-provisioning when this
      // account got a random temp password instead of one the user chose —
      // the client forces the change-password screen until this clears.
      var mustChange = (d[6] === true || String(d[6] || "").toUpperCase() === "TRUE");
      var token = createSession(email, role, name, mustChange, "password");
      logAudit("login", "", email);
      return jsonOut({ status: "ok", name: name, role: role, email: email, token: token, authMethod: "password", mustChangePassword: mustChange });
    }

    // ── all other actions require valid session token ──────────
    // verifyToken says WHY it refused (see its comment): a Google service
    // failure is "try again", never "you are signed out".
    var authInfo = {};
    var user = verifyToken(body.token, authInfo);
    if (!user) {
      if (authInfo.serviceUnavailable) {
        return jsonOut({ error: SERVICE_UNAVAILABLE_MSG, code: "ServiceUnavailable", retryable: true });
      }
      if (authInfo.reason === "SessionMaxAge") return jsonOut({ error: "Unauthorized", reason: "SessionMaxAge" });
      return jsonOut({ error: "Unauthorized" });
    }
    authed = true;

    // ── a temp password buys nothing but the chance to replace it ──
    // Until 2026-08-21 this was enforced ONLY in the client: login() reported
    // mustChangePassword, verifyToken() recomputed it fresh from Staff col G on
    // every request, and then nothing on the server ever looked at it. The only
    // thing between an auto-provisioned ~40-bit temp password — sitting in clear
    // text in Staff col H for a human to relay — and the whole registry was
    // app.jsx choosing to render <ChangePasswordModal forced>. curl, a stale
    // bundle, or a second tab restored from sessionStorage skipped that render
    // and was fully authorised. app.jsx's own comment had named the danger:
    // "the token is already valid and would otherwise grant full access on the
    // temp password indefinitely."
    //
    // `changePassword` MUST stay reachable — it is the only way out, and a gate
    // with no exit is a permanent lockout. `logout` is answered above, before
    // verifyToken, so it is unaffected; do not move this check any earlier
    // without re-reading that. Google sessions never reach here with the flag
    // set: verifyToken clears it for them (_passwordSession), since they have
    // no password to change and so no way out of the gate.
    //
    // The condition reads from `user`, which verifyToken re-derives from the
    // sheet on every call rather than trusting the token's cached copy — so
    // flagging col G closes a session already in flight, and clearing it
    // restores that same session without a re-login. Pinned by
    // `test/verify-must-change-password.cjs`.
    if (user.mustChangePassword && action !== "changePassword") {
      return jsonOut({ error: "PasswordChangeRequired", mustChangePassword: true });
    }

    if (action === "getActivePatients") {
      // Only an admin may ask for the full archive (data-subject requests,
      // a readmission after the sync window) — see getActivePatients. An
      // honoured archive read is audited under its own action (2026-09-17,
      // SEC-B15). Audited BEFORE the payload is produced, so a read served from
      // the payload cache is audited exactly like one read off the sheet.
      var archive = user.role === "admin" && body.includeArchived === true;
      logAudit(archive ? "readRegistryArchive" : "readRegistry", "", user.email);
      // The payload is JSON text straight from getActivePatientsJson — possibly
      // from its 5-minute cache — rather than an object re-serialised here.
      var syncOut = ContentService.createTextOutput(getActivePatientsJson({ includeArchived: archive }));
      syncOut.setMimeType(ContentService.MimeType.JSON);
      return syncOut;
    }

    var canWrite = user.role === "doctor" || user.role === "admin" || user.role === "nurse";

    if (action === "logDailyNutrition") {
      if (!canWrite) return jsonOut({ error: "Forbidden" });
      var logResult = logDailyNutrition(body.sessionId, body.entry, user.email);
      // DuplicateDate carries the existing row's entryId, so a client can open
      // that entry instead of just reporting the refusal.
      if (logResult.error) return jsonOut(_errorBody(logResult));
      return jsonOut({ ok: true, entryId: logResult.entryId, lastModified: logResult.lastModified });
    }
    if (action === "updateDailyNutrition") {
      if (!canWrite) return jsonOut({ error: "Forbidden" });
      var updResult = updateDailyNutrition(body.sessionId, body.entryId, body.expectedLastModified, body.entry, user.email);
      if (updResult.error) return jsonOut(_errorBody(updResult));
      if (updResult.conflict) return jsonOut({ conflict: true, current: updResult.current });
      // An edit of a published row appends a NEW row (a revision). The client
      // branches on `revised` and needs the new entryId/revisionNumber to show
      // it; this branch used to forward only lastModified, so a revision
      // looked like an in-place edit until the next sync (2026-09-17 review,
      // UP-B7 / UP-S16).
      var updOut = { ok: true, lastModified: updResult.lastModified };
      if (updResult.revised) {
        updOut.revised = true;
        updOut.entryId = updResult.entryId;
        updOut.revisionNumber = updResult.revisionNumber;
      }
      return jsonOut(updOut);
    }
    if (action === "publishLog") {
      if (!canWrite) return jsonOut({ error: "Forbidden" });
      var pubResult = publishDailyLog(body.sessionId, body.entryId, user.email, body.expectedLastModified);
      if (pubResult.error) return jsonOut(_errorBody(pubResult));
      if (pubResult.conflict) return jsonOut({ conflict: true, current: pubResult.current });
      return jsonOut({ ok: true, publishedAt: pubResult.publishedAt, alreadyPublished: !!pubResult.alreadyPublished });
    }
    if (action === "registerPatient" || action === "updatePatient") {
      if (!canWrite) return jsonOut({ error: "Forbidden" });
      // Strict `=== true`: an older client sends no isNew at all, and undefined
      // must not read as a fresh registration or every edit would be refused.
      var isNewReg = action === "registerPatient" && body.isNew === true;
      // `base` = the patient as this device last received it; present only
      // from a client that knows the three-way merge (see registerPatient).
      var regBase = (!isNewReg && body.base && typeof body.base === "object" && !Array.isArray(body.base)) ? body.base : null;
      registerPatient(body.patient, isNewReg, regBase);
      // A changed BW or GA silently moves every dose target for this infant,
      // and the row itself keeps no who/when — so the audit trail does.
      logAudit(isNewReg ? "registerPatient" : "updatePatient", (body.patient && body.patient.sessionId) || "", user.email);
      return jsonOut({ ok: true });
    }
    if (action === "updateWeights") {
      if (!canWrite) return jsonOut({ error: "Forbidden" });
      var uwResult = updateWeights(body.sessionId, body.weights, Array.isArray(body.baseWeights) ? body.baseWeights : null);
      if (uwResult && uwResult.error) return jsonOut(_errorBody(uwResult));
      logAudit("updateWeights", body.sessionId, user.email);
      return jsonOut({ ok: true });
    }
    if (action === "changePassword") {
      var oldPwd = body.oldPassword;
      var newPwd = body.newPassword;
      // typeof, not just length (2026-09-17 review, SEC-B11): newPassword 7
      // (a number) has no .length, so `undefined < 10` was false and a
      // one-character password was accepted.
      if (typeof newPwd !== "string" || newPwd.length < MIN_PASSWORD_LENGTH || newPwd.length > MAX_PASSWORD_LENGTH) {
        return jsonOut({ error: "รหัสผ่านใหม่ต้องมีอย่างน้อย " + MIN_PASSWORD_LENGTH + " ตัวอักษร (ไม่เกิน " + MAX_PASSWORD_LENGTH + ")" });
      }
      if (typeof oldPwd !== "string" || !oldPwd) return jsonOut({ error: "รหัสผ่านเดิมไม่ถูกต้อง" });
      var sf = getStaffRow(user.email);
      if (!sf) return jsonOut({ error: "ไม่พบบัญชี" });
      var sd = sf.data;
      if (!sd[4]) return jsonOut({ error: "บัญชี Google ไม่ใช้รหัสผ่านในระบบนี้" });
      // Same brute-force lockout as login, counted before the hash the same
      // way — a valid session token (leaked, or sitting unlocked on a shared
      // NICU workstation) shouldn't let someone guess the account's real
      // password via unlimited, or parallel, oldPassword attempts.
      var pwdChgKey = _pwdChangeFailKey(user.email);
      var pwdAttempt = _beginPasswordAttempt(pwdChgKey, "props");
      if (pwdAttempt.locked) {
        return jsonOut({ error: "ลองใหม่ในอีก 15 นาที — กรอกรหัสผ่านเดิมผิดหลายครั้ง" });
      }
      if (!verifyPwd(oldPwd, String(sd[5] || ""), String(sd[4] || "")).ok) {
        if (pwdAttempt.fails === LOCKOUT_MAX_FAILS) logAudit("lockout", "", user.email);
        return jsonOut({ error: "รหัสผ่านเดิมไม่ถูกต้อง" });
      }
      _clearLockout(pwdChgKey, "props");
      _clearLockout(_legacyFailKey("pwdchg_fail_", user.email), "props");
      var newSalt = Utilities.getUuid();
      var newHash = hashPwdV2(newPwd, newSalt);
      // Clears must_change_password/temp_password (cols G/H) in the same
      // write — a successful change always resolves any pending forced-
      // change state, whether this call came from the normal "เปลี่ยนรหัสผ่าน"
      // menu or from the forced first-login screen.
      getSheetStaff().getRange(sf.row, 5, 1, 4).setValues([[newHash, newSalt, false, ""]]);
      // This request came through verifyToken, so its cached copy of the row
      // still says col G TRUE: drop it, or the rotated token is refused as
      // PasswordChangeRequired for up to a minute (2026-09-22).
      _forgetStaffRow(user.email);
      // Bump the session epoch so every OTHER token issued for this user
      // (e.g. one that leaked, or is sitting on a shared NICU workstation)
      // is invalidated immediately — verifyToken() checks epoch on every
      // call. Re-issue a fresh token so *this* device stays logged in.
      bumpUserEpoch(user.email);
      var rotatedToken = createSession(user.email, user.role, user.name, false, "password");
      logAudit("changePassword", "", user.email);
      return jsonOut({ ok: true, token: rotatedToken, mustChangePassword: false });
    }
    if (action === "pseudonymizePatient") {
      if (user.role !== "admin") return jsonOut({ error: "Forbidden" });
      var pseudoResult = pseudonymizePatient(body.sessionId, user.email);
      if (pseudoResult && pseudoResult.error) return jsonOut(_errorBody(pseudoResult));
      return jsonOut({ ok: true });
    }
    if (action === "deletePatient") {
      if (user.role !== "admin") return jsonOut({ error: "Forbidden" });
      // deletePatient writes its own "deletePatient:start" audit row before
      // it destroys anything; this row records that it finished.
      var delPatResult = deletePatient(body.sessionId, user.email);
      if (delPatResult.error) return jsonOut(_errorBody(delPatResult));
      logAudit("deletePatient", body.sessionId, user.email);
      return jsonOut({ ok: true });
    }
    if (action === "deleteDailyNutrition") {
      if (user.role !== "admin") return jsonOut({ error: "Forbidden" });
      var delResult = deleteDailyNutrition(body.sessionId, body.entryId, user.email);
      if (delResult.error) return jsonOut(_errorBody(delResult));
      logAudit("deleteDailyLog", body.sessionId, user.email);
      return jsonOut({ ok: true });
    }
    // ── Daily-log edit lock (acquire on open + heartbeat, release on close) ──
    // Courtesy-only: it does not block a write. updateDailyNutrition's own
    // expectedLastModified check is what actually prevents a silent overwrite.
    if (action === "acquireLogLock") {
      if (!canWrite) return jsonOut({ error: "Forbidden" });
      return jsonOut(acquireLogLock(body.sessionId, body.date, user));
    }
    if (action === "releaseLogLock") {
      if (!canWrite) return jsonOut({ error: "Forbidden" });
      releaseLogLock(body.sessionId, body.date, user);
      return jsonOut({ ok: true });
    }

    return jsonOut({ error: "Unknown action: " + action });
  } catch (err) {
    var resp;
    if (err && err.neofeedSafe) {
      // Busy / SchemaMismatch / row moved — written for any caller.
      resp = { error: err.message };
      if (err.neofeedCode) resp.code = err.neofeedCode;
      if (err.retryable) resp.retryable = true;
    } else if (authed) {
      resp = { error: err && err.message };
    } else {
      Logger.log("doPost (" + (action || "no action") + ", unauthenticated) failed: " + (err && err.message));
      resp = { error: GENERIC_ERROR_MSG };
    }
    if (action === "login") resp.status = "error";
    return jsonOut(resp);
  }
}

// ── getActivePatients ─────────────────────────────────────────
// Data minimisation (PDPA Sec 22; 2026-09-11 review, B6): this used to return
// every patient ever registered and every Daily_Log row, to every role, on
// every tab focus — each device held every past infant's initials and DOB,
// and the payload grew by ~1–2 KB per logged day forever. It now returns the
// patients the ward can still see, plus a margin:
//   • status Active or blank — on the unit;
//   • status changed within ARCHIVE_SYNC_DAYS — the registry shows the last
//     7 days; 30 leaves room to find and reactivate a readmitted infant via
//     the patient picker.
// …and Daily_Log rows only for those patients. An admin can pass
// includeArchived for the full set (data-subject requests, older readmissions).
//
// A non-Active patient with NO usable statusDate (blank or unparseable) is
// OUTSIDE the window since 2026-09-17 (Praew's decision, review A1). Until then
// such a record "couldn't be aged, so it was kept" — forever, on every ward
// device, with every Daily_Log row it ever had: the legacy discharges from
// before statusDate existed were most of the sync payload and exactly the data
// minimisation this window exists for. They remain in the sheet and in the
// admin archive (includeArchived), where a readmission can still be found.
var ARCHIVE_SYNC_DAYS = 30;
function _patientInSyncWindow(statusValue, statusDateValue, todayKey) {
  var status = String(statusValue || "").trim();
  if (!status || status === "Active") return true;
  if (!statusDateValue) return false;
  var changed = _wardDateKey(statusDateValue instanceof Date ? statusDateValue
    : String(statusDateValue).slice(0, 10));
  if (!changed) return false;
  var days = (Date.parse(todayKey + "T00:00:00Z") - Date.parse(changed + "T00:00:00Z")) / 86400000;
  return days <= ARCHIVE_SYNC_DAYS;
}

// ── Bounded Daily_Log read (2026-09-17 perf review, proven by equivalence) ──
// The sync used to read the WHOLE Daily_Log — every row, all 38 columns,
// calcInputJson included — and then throw away the rows of every patient
// outside the window. What is always true: rows are only ever added by
// appendRow (create, revision) and removed by deleteRow, both of which keep
// the relative order of every other row. So every row of the in-window
// patients is found by one narrow read of column B, then fetched as at most
// SYNC_MAX_BLOCKS contiguous blocks; the rows between blocks belong to
// patients outside the window and are never read.
//
// No lock (a sync must not queue behind saves), so a delete or a hand-inserted
// row between the column-B read and a block read could shift rows. Each
// block's column B is compared against the first read and the last row is
// re-checked; ANY disagreement falls back to the old full read. The result is
// therefore always identical to a getDataRange() snapshot taken at some instant.
var SYNC_MAX_BLOCKS = 4;
var SYNC_MIN_SPLIT_GAP = 200;   // rows; smaller gaps are cheaper to read through than to split

function _planLogBlocks(hits) {
  var gaps = [];
  for (var i = 1; i < hits.length; i++) {
    var g = hits[i] - hits[i - 1];
    if (g > SYNC_MIN_SPLIT_GAP) gaps.push({ at: i, size: g });
  }
  gaps.sort(function (a, b) { return b.size - a.size || a.at - b.at; });
  var cuts = gaps.slice(0, SYNC_MAX_BLOCKS - 1)
    .map(function (x) { return x.at; })
    .sort(function (a, b) { return a - b; });
  var blocks = [], from = 0;
  for (var c = 0; c < cuts.length; c++) {
    blocks.push([hits[from], hits[cuts[c] - 1]]);
    from = cuts[c];
  }
  blocks.push([hits[from], hits[hits.length - 1]]);
  return blocks;
}

// Returns Daily_Log data rows (header excluded) in sheet order: a superset of
// every row whose sessionId is in `inWindow`, and never a row out of order.
function _readLogRowsFor(sheet, inWindow) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var n = lastRow - 1;
  var sidCol = sheet.getRange(2, 2, n, 1).getValues();
  var hits = [];
  for (var r = 0; r < n; r++) {
    var s = String(sidCol[r][0] || "");
    if (s && inWindow[s]) hits.push(r);
  }
  if (!hits.length) return [];
  var blocks = _planLogBlocks(hits);
  var width = Math.min(LOG_WIDTH, sheet.getMaxColumns());
  var out = [];
  for (var b = 0; b < blocks.length; b++) {
    var start = blocks[b][0], end = blocks[b][1];
    var vals = sheet.getRange(2 + start, 1, end - start + 1, width).getValues();
    for (var k = 0; k < vals.length; k++) {
      if (String(vals[k][1] || "") !== String(sidCol[start + k][0] || "")) return _fullLogRows(sheet);
      out.push(vals[k]);
    }
  }
  if (sheet.getLastRow() !== lastRow) return _fullLogRows(sheet);
  return out;
}
function _fullLogRows(sheet) {
  return sheet.getLastRow() > 0 ? sheet.getDataRange().getValues().slice(1) : [];
}

function getActivePatients(opts) {
  var includeArchived = !!(opts && opts.includeArchived);
  var todayKey = _wardDateKey();
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID_());
  var sheetPat = getSheetPat(ss);
  var sheetLog = getSheetLog(ss);
  var patData = sheetPat.getLastRow() > 0 ? sheetPat.getDataRange().getValues() : [[]];

  // Decide the patient set first, so log rows for anyone outside it are
  // never read, let alone serialised.
  var inWindow = {}, anyInWindow = false;
  for (var k = 1; k < patData.length; k++) {
    var kid = String(patData[k][0] || "");
    if (!kid) continue;
    if (includeArchived || _patientInSyncWindow(patData[k][9], patData[k][16], todayKey)) {
      inWindow[kid] = true;
      anyInWindow = true;
    }
  }

  // The archive wants every registered patient, so the column-B pass would
  // only add a read: it goes straight to the full snapshot, exactly as before.
  var logRows = !anyInWindow ? []
    : includeArchived ? _fullLogRows(sheetLog)
    : _readLogRowsFor(sheetLog, inWindow);
  var logMap = {};
  for (var i = 0; i < logRows.length; i++) {
    var row = logRows[i];
    var sid = String(row[1] || "");
    if (!sid || !inWindow[sid]) continue;
    if (!logMap[sid]) logMap[sid] = [];
    logMap[sid].push({
      // _fmtDate, not String(): Sheets parses the "YYYY-MM-DD" we append into a
      // real date value, so String() yields "Sun Aug 17 2026 00:00:00 GMT+0700
      // (Indochina Time)" — which matches no date string the client compares it
      // against, breaking "logged today", the needs-entry count and the
      // one-entry-per-date guard. Every other date column already goes through
      // this helper; this one was missed.
      ts:         _fmtDate(row[0]),
      dol:        Number(row[2]  || 0),
      weight:     Number(row[3]  || 0),
      fluid:      Number(row[4]  || 0),
      gir:        Number(row[5]  || 0),
      pro:        Number(row[6]  || 0),
      kcal:       Number(row[7]  || 0),
      na:         Number(row[8]  || 0),
      k:          Number(row[9]  || 0),
      ca:         Number(row[10] || 0),
      p:          Number(row[11] || 0),
      enVolPerKg: Number(row[12] || 0),
      route:      String(row[13] || ""),
      status:     String(row[14] || "submitted"),
      submittedBy:    String(row[15] || ""),
      calcInput:      _parseJson(row[24], null),
      entryId:        String(row[25] || ""),
      lastModified:   String(row[26] || ""),
      lastModifiedBy: String(row[27] || ""),
      ioInput:        Number(row[28] || 0),
      ioOutput:       Number(row[29] || 0),
      drainContent:   Number(row[30] || 0),
      published:      String(row[33] || ""),
      publishedBy:    String(row[34] || ""),
      revisionNumber: Number(row[35] || 1),
      revisionOf:     String(row[36] || ""),
      supersededAt:   String(row[37] || ""),
    });
  }

  var patients = [];
  for (var j = 1; j < patData.length; j++) {
    var p = patData[j];
    var sessionId = String(p[0] || "");
    if (!sessionId || !inWindow[sessionId]) continue;
    patients.push({
      sessionId:     sessionId,
      name:          String(p[1] || ""),
      initials:      String(p[2] || ""),
      bw:            Number(p[3] || 0),
      ga:            Number(p[4] || 0),
      sex:           String(p[5] || "boys"),
      dob:           _fmtDate(p[6]),
      admissionDate: _fmtDate(p[7]),
      twinSuffix:    String(p[8] || ""),
      status:        String(p[9] || "Active"),
      currentBed:    String(p[10] || ""),
      diagnosis:     String(p[11] || ""),
      weights:       _parseJson(p[12], [{ dol: 1, w: Number(p[3] || 0) }]),
      lengths:       _parseJson(p[13], []),
      hcs:           _parseJson(p[14], []),
      bedHistory:    _parseJson(p[15], []),
      statusDate:    _fmtDate(p[16]),
      multiplesCount: Number(p[17] || 0),
    });
  }
  return { patients: patients, log: logMap, ts: new Date().toISOString() };
}

// ── Shared sync payload cache (Praew's decision 2026-09-17: 5 minutes) ───────
// N ward tabs polling every 4 minutes cost one sheet read per data change
// instead of N. Keyed on (variant, ward date, DATA_VERSION). DATA_VERSION is a
// Script Property replaced by every write to Patient_Registry or Daily_Log —
// in the `finally` of each locked write, so INSIDE the lock and after the
// write (see _bumpDataVersion) — which makes a save visible to the very next
// sync, from any device. The version is read BEFORE the sheets, so a payload
// built from a pre-write read can only ever be stored under the pre-write
// version, which no later reader asks for.
//
// Not seen by any write path: hand edits in the Sheets UI. onEdit bumps the
// version for typed edits to either tab; a STRUCTURAL hand edit (deleting or
// sorting rows, which fires no onEdit) is served stale for at most
// SYNC_CACHE_TTL_SECONDS.
//
// CacheService caps one value at 100 KB, so the JSON is gzipped, base64'd and
// split into chunks; the head (the chunk count) is written last, so a reader
// never sees a head without its chunks, and an evicted chunk is just a miss.
// Any cache failure degrades to an ordinary read — never to an error.
//
// Audit is unaffected: doPost writes the readRegistry row before asking for
// the payload, so a cache hit is audited exactly like a sheet read. Rolling
// back to a version without this code is clean: it neither reads DATA_VERSION
// nor the sync1_ keys, which then simply expire.
var SYNC_CACHE_ENABLED = true;
var SYNC_CACHE_TTL_SECONDS = 300;
var SYNC_CACHE_CHUNK_CHARS = 90000;
var SYNC_CACHE_MAX_CHUNKS = 40;          // ~3.6 MB base64; beyond that, don't cache
var DATA_VERSION_KEY = "DATA_VERSION";

function _syncCacheKey(includeArchived, todayKey, version) {
  return "sync1_" + (includeArchived ? "all" : "ward") + "_" + todayKey + "_" + version;
}
function _dataVersion() {
  return PropertiesService.getScriptProperties().getProperty(DATA_VERSION_KEY) || "0";
}
// Call inside the script lock, after (in practice: in the finally of) any
// write to Patient_Registry or Daily_Log — and from any editor-run function
// that writes either tab. Never throws: a failed bump must not fail a save that
// has already landed. The current heads are dropped first, so even if
// setProperty then fails, the next reader misses and rebuilds from the sheet.
// Pinned by test/verify-review-0917-backend-sync.cjs, which fails if a
// function that takes the script lock and touches either tab does not bump.
function _bumpDataVersion() {
  try {
    var props = PropertiesService.getScriptProperties();
    var old = props.getProperty(DATA_VERSION_KEY) || "0";
    var today = _wardDateKey();
    try {
      CacheService.getScriptCache().removeAll([
        _syncCacheKey(false, today, old), _syncCacheKey(true, today, old)
      ]);
    } catch (e1) { /* cache unavailable: nothing to drop */ }
    props.setProperty(DATA_VERSION_KEY, Utilities.getUuid());
  } catch (e) { Logger.log("_bumpDataVersion failed: " + e.message); }
}
function _syncCacheGet(key) {
  try {
    var cache = CacheService.getScriptCache();
    var head = cache.get(key);
    var n = head ? parseInt(head, 10) : 0;
    if (!(n > 0) || n > SYNC_CACHE_MAX_CHUNKS) return null;
    var keys = [];
    for (var i = 0; i < n; i++) keys.push(key + "_" + i);
    var parts = cache.getAll(keys);
    var b64 = "";
    for (var j = 0; j < n; j++) {
      if (parts[keys[j]] == null) return null;
      b64 += parts[keys[j]];
    }
    return Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(b64), "application/x-gzip")).getDataAsString("UTF-8");
  } catch (e) { return null; }
}
function _syncCachePut(key, body) {
  try {
    var b64 = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(body, "application/json")).getBytes());
    var n = Math.ceil(b64.length / SYNC_CACHE_CHUNK_CHARS);
    if (n < 1 || n > SYNC_CACHE_MAX_CHUNKS) return;
    var map = {};
    for (var i = 0; i < n; i++) map[key + "_" + i] = b64.substr(i * SYNC_CACHE_CHUNK_CHARS, SYNC_CACHE_CHUNK_CHARS);
    var cache = CacheService.getScriptCache();
    cache.putAll(map, SYNC_CACHE_TTL_SECONDS);
    cache.put(key, String(n), SYNC_CACHE_TTL_SECONDS);
  } catch (e) { Logger.log("sync cache put skipped: " + e.message); }
}

// The JSON text doPost returns for getActivePatients. Byte-identical to
// JSON.stringify(getActivePatients(opts)) — same keys, same order — except
// that `ts` is always fresh, including on a cache hit.
function getActivePatientsJson(opts) {
  var includeArchived = !!(opts && opts.includeArchived);
  var key = null;
  if (SYNC_CACHE_ENABLED) {
    try { key = _syncCacheKey(includeArchived, _wardDateKey(), _dataVersion()); } catch (e) { key = null; }
  }
  var body = key ? _syncCacheGet(key) : null;
  if (body == null) {
    var payload = getActivePatients({ includeArchived: includeArchived });
    body = JSON.stringify({ patients: payload.patients, log: payload.log });
    if (key) _syncCachePut(key, body);
  }
  return body.slice(0, -1) + ',"ts":' + JSON.stringify(new Date().toISOString()) + "}";
}

// ── Server-side plausibility validation ─────────────────────────
// The client forms cap ranges with <input min/max> (registry.jsx doesn't
// even set an upper bound), but doPost is reachable directly — curl, a
// stale bundle, or DevTools skips the browser entirely. Nothing before this
// stopped BW=50000 or GA=200 landing in Patient_Registry/Daily_Log.
// These are sanity bounds (physically-plausible NICU values), not clinical
// targets — targets stay in data.js/TPN_TARGETS and drive UI guidance, not
// write rejection. Throws; every call site here already runs inside
// doPost's try/catch, which turns the message into jsonOut({error}).
// EPSILON: these bounds are compared against figures the calculator derived by
// floating-point arithmetic, and an order whose energy read exactly
// 200 kcal/kg/d arrived as 200.00000000000003 and was refused — naming a number
// the ward could see was inside the range it was told it had left
// (2026-09-23). The client now rounds every logged figure before sending it
// (data.js roundLogEntry), so this is the second of the two defences rather
// than the only one; it exists for rows from an older bundle, and because a
// plausibility check has no business splitting hairs in the twelfth decimal.
var RANGE_EPSILON = 1e-9;
// The refusal a nurse actually sees. It used to surface as raw English inside a
// Thai toast — "บันทึกไม่สำเร็จ: Energy (kcal/kg/d) out of range (0–200):
// 200.00000000000003" — at the bedside, mid-order. The label stays in the
// clinical English the ward's own forms use; the sentence around it does not.
function _rangeError(label, val, min, max) {
  return new Error(
    "ค่า " + label + " = " + val + " อยู่นอกช่วงที่ระบบรับได้ (" + min + "–" + max + ") — " +
    "ตรวจสอบตัวเลขอีกครั้ง หากค่านี้ถูกต้องจริง กรุณาแจ้งผู้ดูแลระบบ");
}
function _checkRange(val, min, max, label) {
  if (val === "" || val == null) return;
  var n = Number(val);
  if (!isFinite(n)) throw new Error("ค่า " + label + " ต้องเป็นตัวเลข: " + val);
  if (n < min - RANGE_EPSILON || n > max + RANGE_EPSILON) {
    throw _rangeError(label, val, min, max);
  }
}

// Mirrors data.js admissionDateIssue, with two concessions this side needs.
//
// Blank passes: a legacy row may genuinely have no admission date, and the
// client blocks saving one (registry.jsx) — refusing it here as well would
// only lock the record against the correction that fixes it.
//
// An UNCHANGED stored value passes, exactly as _checkSex allows a legacy sex
// through: this runs on every edit, so refusing a bad date the editor never
// touched would make that record uncorrectable in any other respect. A new or
// changed bad date is refused.
//
// "Future" allows one day of slack. The script's timezone and the ward
// workstation's need not agree, and a legitimate admission entered late in the
// evening must never be refused for being a few hours ahead of the server's
// idea of today. A Buddhist-era year is 543 years out and a typo is days or
// months out, so nothing this check exists for slips through the gap.
var ADMIT_DATE_MIN_GS = "2000-01-01";
function _checkAdmissionDate(val, storedOrNull, label) {
  if (val === "" || val == null) return;
  var s = String(_fmtDate(val)).trim();
  if (!s) return;
  if (storedOrNull != null && s === String(_fmtDate(storedOrNull)).trim()) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s))
    throw new Error("ค่า " + label + " ไม่ถูกต้อง (" + s + ") — ใช้รูปแบบ ปี-เดือน-วัน ค.ศ.");
  var today = _fmtDate(new Date());
  var year = Number(s.slice(0, 4)), nowYear = Number(String(today).slice(0, 4)) || year;
  if (year >= nowYear + 400)
    throw new Error("ค่า " + label + ": ปี " + year + " เป็นปี พ.ศ. — กรอกเป็น ค.ศ. (" + (year - 543) + ")");
  var tomorrow = _fmtDate(new Date(new Date().getTime() + 86400000));
  if (s > tomorrow)
    throw new Error("ค่า " + label + " (" + s + ") เป็นวันในอนาคต — ตรวจสอบอีกครั้ง");
  if (s < ADMIT_DATE_MIN_GS)
    throw new Error("ค่า " + label + " (" + s + ") เก่าเกินกว่าที่ระบบรับได้");
}

function _validatePatient(p) {
  if (p.bw === "" || p.bw == null || !isFinite(Number(p.bw)))
    throw new Error("Birth weight (g) is required and must be numeric");
  if (p.ga === "" || p.ga == null || !isFinite(Number(p.ga)))
    throw new Error("GA (weeks) is required and must be numeric");
  _checkRange(p.bw, 200, 6000, "Birth weight (g)");
  _checkRange(p.ga, 22, 44, "GA (weeks)");
  // GA is stored as WW.D shorthand, where D is a day count, not a decimal
  // fraction of a week. Reject 27.9/28.7 and extra precision at the API edge.
  var ga10 = Number(p.ga) * 10;
  var gaDay = Math.round(ga10) % 10;
  if (Math.abs(ga10 - Math.round(ga10)) > 0.000001 || gaDay > 6)
    throw new Error("GA must use WW.D with day 0–6: " + p.ga);
  _checkRange(p.multiplesCount, 0, 10, "multiplesCount");
  // The dates are checked against the STORED row, so they are validated in
  // registerPatient beside _checkSex rather than here. See _checkAdmissionDate.
  // The measurement arrays are part of the record every ward device renders.
  // They were never validated here (2026-09-17 review, SEC-B3), so one
  // registerPatient with weights "x" or [null] was stored, synced to every
  // device, and threw inside the registry render — one API call took the whole
  // ward's Patients screen down. Same validator as updateWeights, so neither
  // path accepts what the other would refuse.
  _validateMeasureArray(p.weights, "weights", true);
  _validateMeasureArray(p.lengths, "lengths", true);
  _validateMeasureArray(p.hcs, "hcs", true);
  _validateMeasureArray(p.bedHistory, "bedHistory", true);
}

// sex is stored as "boys"/"girls" (the Fenton dataset key). A new registration
// must use one of them (2026-09-17 review, F / UP-S4). An EDIT may carry a
// legacy stored value through unchanged — refusing it would lock the record
// against every other correction — but may not introduce a new invalid one.
var VALID_SEX = { boys: true, girls: true };
function _checkSex(incoming, storedOrNull) {
  var v = String(incoming == null ? "" : incoming).trim();
  if (VALID_SEX[v] === true) return;
  if (storedOrNull !== null && _patientFieldNorm("sex", incoming) === _patientFieldNorm("sex", storedOrNull)) return;
  throw new Error("sex must be \"boys\" or \"girls\": " + String(incoming).slice(0, 40));
}

function _validateLogEntry(entry) {
  if (entry.dol === "" || entry.dol == null || !isFinite(Number(entry.dol)))
    throw new Error("DOL is required and must be numeric");
  if (entry.weight === "" || entry.weight == null || !isFinite(Number(entry.weight)))
    throw new Error("Weight (g) is required and must be numeric");
  _checkRange(entry.dol,          1,   400,  "DOL");
  // Widened 2026-09-23, after three refusals of orders that were correct:
  //   • weight floor 300 → 200 g. NeoFeed is used at 22–23 weeks, where a
  //     birth weight in the 300s is ordinary and the smallest reported
  //     survivors are lighter still. 200 g remains a real floor against a
  //     mistyped 20.
  //   • GIR ceiling 20 → 30 mg/kg/min. 20 is not an upper bound on reality:
  //     congenital hyperinsulinism and refractory hypoglycaemia are managed at
  //     25–30, and those are the orders it is most important to be able to
  //     record.
  //   • energy ceiling 200 → 250 kcal/kg/d. A fortified high-density feed plus
  //     lipid passes 200 legitimately, and 200 exactly was refused outright
  //     (see RANGE_EPSILON).
  // These are plausibility bounds, not clinical targets: the calculator's own
  // alerts are what tell a doctor a figure is high. Their job here is only to
  // stop a typo or a direct POST from writing nonsense into the sheet.
  _checkRange(entry.weight,       200, 8000, "Weight (g)");
  _checkRange(entry.fluid,        0,   300,  "Fluid (mL/kg/d)");
  _checkRange(entry.gir,          0,   30,   "GIR (mg/kg/min)");
  _checkRange(entry.pro,          0,   8,    "Protein (g/kg/d)");
  _checkRange(entry.kcal,         0,   250,  "Energy (kcal/kg/d)");
  _checkRange(entry.na,           0,   15,   "Na (mEq/kg/d)");
  _checkRange(entry.k,            0,   10,   "K (mEq/kg/d)");
  _checkRange(entry.ca,           0,   300,  "Ca (mg/kg/d)");
  _checkRange(entry.p,            0,   200,  "P (mg/kg/d)");
  _checkRange(entry.enVolPerKg,   0,   250,  "EN volume (mL/kg/d)");
  _checkRange(entry.ioInput,      0,   3000, "I/O input (mL/d)");
  _checkRange(entry.ioOutput,     0,   3000, "I/O output (mL/d)");
  _checkRange(entry.drainContent, 0,   3000, "Drain content (mL/d)");
}

// ── Growth measurement arrays: weights / lengths / hcs / bedHistory ─────────
// One validator for all four (2026-09-17 review, SEC-B3). The old
// _validateWeightsArray returned early for a non-array and skipped null items,
// and registerPatient never called it at all. Every element must be a non-null
// plain object; the arrays are bounded (a JSON cell holds at most 50,000
// characters, and 400 is the DOL ceiling used everywhere else); measurement
// values keep _checkRange's convention that blank/null means "not measured".
//   weights: dol 0–400 integer; w null or 300–8000 g (same bounds as a
//            Daily_Log weight); the inline l/hc MeasurementLogger writes use
//            the length/HC bounds below.
//   lengths: dol 0–400 integer; v null or 20–70 cm.
//   hcs:     dol 0–400 integer; v null or 15–50 cm.
// No length/HC bound existed anywhere in the app to reuse (fenton.jsx's logger
// only drops negatives), so these are the review's plausibility bounds: they
// cover a 22-week infant through a long-stay infant past a year of age.
//   bedHistory: objects whose values are short strings (a bed label, a date).
var MEASURE_ARRAY_MAX = 400;
function _validateMeasureArray(arr, kind, allowMissing) {
  if (arr == null && allowMissing) return;
  if (!Array.isArray(arr)) throw new Error(kind + " must be an array");
  if (arr.length > MEASURE_ARRAY_MAX) throw new Error(kind + " has more than " + MEASURE_ARRAY_MAX + " entries");
  for (var i = 0; i < arr.length; i++) {
    var el = arr[i];
    var label = kind + "[" + i + "]";
    if (el === null || typeof el !== "object" || Array.isArray(el)) throw new Error(label + " must be an object");
    if (kind === "bedHistory") {
      for (var f in el) {
        if (!Object.prototype.hasOwnProperty.call(el, f)) continue;
        var val = el[f];
        if (val != null && typeof val !== "string" && typeof val !== "number") throw new Error(label + "." + f + " must be text");
        if (String(val == null ? "" : val).length > 100) throw new Error(label + "." + f + " is too long");
      }
      continue;
    }
    var dol = Number(el.dol);
    if (el.dol === "" || el.dol == null || !isFinite(dol) || dol !== Math.floor(dol) || dol < 0 || dol > 400) {
      throw new Error(label + ".dol must be a whole number 0–400: " + String(el.dol).slice(0, 20));
    }
    if (kind === "weights") {
      _checkRange(el.w, 200, 8000, label + ".w (g)");
      _checkRange(el.l, 20, 70, label + ".l (cm)");
      _checkRange(el.hc, 15, 50, label + ".hc (cm)");
    } else if (kind === "lengths") {
      _checkRange(el.v, 20, 70, label + ".v (cm)");
    } else {
      _checkRange(el.v, 15, 50, label + ".v (cm)");
    }
  }
}
// Kept by name for anything still calling it; it is now the full validator.
function _validateWeightsArray(weights) {
  _validateMeasureArray(weights, "weights", false);
}

// ── Daily_Log entry date (2026-09-17 review, SEC-B12 / UP-B12) ──────────────
// entry.ts was taken as-is. "2026-9-16", " 2026-09-16" or "2026/09/16" never
// equalled the duplicate guard's "2026-09-16", so a second row for the same
// day was accepted — and Sheets then parsed the odd spelling into the SAME
// date, leaving two rows for one patient-day. It is now normalised (trimmed)
// and must be a real calendar date in YYYY-MM-DD before the guard runs, and
// may not be more than one day past the ward's today (a clock or keying slip,
// not a plan). No ts at all still means the ward's today, as before.
var LOG_DATE_BAD_MSG = "วันที่ของบันทึกไม่ถูกต้อง — ต้องเป็นวันที่จริงในรูปแบบ YYYY-MM-DD";
var LOG_DATE_FUTURE_MSG = "วันที่ของบันทึกเลยวันนี้เกิน 1 วัน — ตรวจสอบวันที่อีกครั้ง";
function _normaliseEntryDate(ts) {
  if (ts === undefined || ts === null || ts === "") return { ts: _wardDateKey() };
  if (typeof ts !== "string") return { error: LOG_DATE_BAD_MSG };
  var s = ts.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { error: LOG_DATE_BAD_MSG };
  var at = Date.parse(s + "T00:00:00Z");
  if (!isFinite(at) || new Date(at).toISOString().slice(0, 10) !== s) return { error: LOG_DATE_BAD_MSG };
  if (at - Date.parse(_wardDateKey() + "T00:00:00Z") > 86400000) return { error: LOG_DATE_FUTURE_MSG };
  return { ts: s };
}

// Calendar date in the ward's fixed UTC+7 timezone. A server-side fallback is
// still needed even though the current client sends ts: old/cached clients and
// direct API calls can omit it, and UTC would label 00:00–06:59 ICT as yesterday.
function _wardDateKey(value) {
  var d = value instanceof Date ? value : (value == null ? new Date() : new Date(value));
  if (!d || isNaN(d.getTime())) return "";
  return new Date(d.getTime() + 7 * 60 * 60000).toISOString().slice(0, 10);
}

// ── Daily_Log row builder — columns shared by create + update ─
// Returns the first 24 columns (A–X); caller appends calcInputJson/entryId/
// lastModified/lastModifiedBy (Y–AB) since those differ between create/update,
// then ioInput/ioOutput/drainContent (AC–AE — see _ioLogFields below).
function _buildLogRow(sessionId, entry, submittedBy) {
  _validateLogEntry(entry);
  return [
    _sheetSafe(entry.ts || _wardDateKey()),
    _sheetSafe(sessionId),
    _numSafe(entry.dol), _numSafe(entry.weight), _numSafe(entry.fluid),
    _numSafe(entry.gir), _numSafe(entry.pro),    _numSafe(entry.kcal),
    _numSafe(entry.na),  _numSafe(entry.k),      _numSafe(entry.ca),
    _numSafe(entry.p),   _numSafe(entry.enVolPerKg), _sheetSafe(entry.route  || ""),
    _sheetSafe(entry.status || "submitted"), _sheetSafe(submittedBy || ""),
    _numSafe(entry.suppMTV, 0), _numSafe(entry.suppVitD_IU, 0),
    _numSafe(entry.suppCa_mg, 0),  _sheetSafe(entry.suppCaType  || ""),
    _numSafe(entry.suppPO4_mmol, 0), _sheetSafe(entry.suppPO4Type || ""),
    _numSafe(entry.suppFe_mg, 0),  _sheetSafe(entry.suppFeType  || ""),
  ];
}

// Intake/Output card fields (AC–AE) — mL/day as entered. Kept as a small
// shared helper since both create and update append the same three columns.
function _ioLogFields(entry) {
  return [_numSafe(entry.ioInput, 0), _numSafe(entry.ioOutput, 0), _numSafe(entry.drainContent, 0)];
}

// Provenance columns AF–AG — which clinical constants and which frontend
// produced this row's numbers. Appended LAST, and nothing may ever be
// inserted ahead of them: Daily_Log is read and written by index (the header
// labels are cosmetic), so a mid-row insert silently reassigns every column
// after it.
//
// Both default to "" rather than throwing. The frontend deploys before the
// backend does, and a save arriving from a cached bundle with no version must
// still land — a failed save at the bedside is worse than a blank cell.
// See data.js CONSTANTS_VERSION for what the value means and when to bump it.
function _provenanceFields(entry) {
  return [_sheetSafe(entry.constantsVersion || ""), _sheetSafe(entry.appVersion || "")];
}

// Publish/revision columns AH–AL — the "Save / Submit / Print" design
// (approved 2026-09-10): a saved row starts as a draft (published blank),
// editable in place. An explicit Submit calls publishDailyLog() and locks
// it. Editing a published row afterward never overwrites it — see the
// branch in updateDailyNutrition — it appends a new row instead, with
// revisionNumber bumped and revisionOf pointing back at the row it replaces.
// Used only for a brand-new row (revision 1 of a fresh date); the revision
// path in updateDailyNutrition builds its own values for revisionNumber/
// revisionOf directly, since those depend on the row being replaced.
//
// All five are server-managed, so NOTHING here comes from the client
// (2026-09-17 review, SEC-B2). entry.revisionNumber/revisionOf used to be
// honoured: a create could claim to be "revision 7 of <anything>", and a
// revisionOf of "=IMPORTXML(...)" was stored as text, read back without its
// apostrophe, and written back live by the next ordinary draft edit.
function _revisionFields(entry) {
  return [
    "", // published — set only by publishDailyLog
    "", // publishedBy
    1,  // revisionNumber — a new row is always revision 1
    "", // revisionOf — set only by the revision path
    "", // supersededAt — set only when a later revision replaces this row
  ];
}

// Widen the grid on demand before any write that could exceed it.
// getRange() past the grid edge throws, and appendRow() rejects a row wider
// than the sheet — both surface at the bedside as a failed save. This is the
// same trap AC–AE hit in 2b7d2a4; making it a shared helper means the create
// path can no longer be forgotten while the update path is protected. No-op
// once the tab is wide enough, so it costs one getMaxColumns() per save.
function _ensureLogWidth(sheet, width) {
  var have = sheet.getMaxColumns();
  if (have < width) sheet.insertColumnsAfter(have, width - have);
}

// ── Narrow reads inside the script lock (2026-09-17 perf review, UP-B5) ─────
// Every locked write used to read the WHOLE Daily_Log (every row × 38 columns,
// calcInputJson included) while holding the one script lock every other save
// waits on — so lock time, and with it the chance of a "Busy" refusal, grew
// with the sheet forever. These return exactly what the old full-scan loops
// found (pinned by test/verify-review-0917-backend-writes.cjs against a
// full-scan reference), reading one or two columns plus the one row needed.

// _patientExists over column A only. Kept under its old name: several
// harnesses stand it in for a registry they do not model.
function _patientExists(sessionId) {
  var sid = String(sessionId || "");
  if (!sid) return false;
  var pat = getSheetPat();
  var lastRow = pat.getLastRow();
  if (lastRow < 2) return false;
  var ids = pat.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === sid) return true;
  return false;
}

// First Daily_Log row whose entryId (col Z) matches, as { row, data } with
// data = that row A..AL (narrower if the grid is); null when absent.
// { shifted: true } when the row moved between the two reads (a hand edit in
// the Sheets UI — the lock does not cover humans), so the caller refuses
// instead of acting on a different row.
function _findLogRowByEntryId(sheet, entryId) {
  var want = String(entryId);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2 || sheet.getMaxColumns() < 26) return null;
  var ids = sheet.getRange(2, 26, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) !== want) continue;
    var data = sheet.getRange(i + 2, 1, 1, Math.min(LOG_WIDTH, sheet.getMaxColumns())).getValues()[0];
    if (String(data[25]) !== want) return { shifted: true };
    return { row: i + 2, data: data };
  }
  return null;
}

// logDailyNutrition's one-entry-per-date guard over columns A:B only. Returns
// { entryId } of the first existing row for that patient on that ward date
// (entryId may be "" on a legacy row), or null.
function _findLogEntryOnDate(sheet, sessionId, targetDate) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var ab = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  var sid = String(sessionId);
  for (var i = 0; i < ab.length; i++) {
    if (String(ab[i][1]) !== sid) continue;
    if (_wardDateKey(ab[i][0]) !== targetDate) continue;
    var existingId = sheet.getMaxColumns() >= 26 ? sheet.getRange(i + 2, 26, 1, 1).getValues()[0][0] : "";
    return { entryId: String(existingId == null ? "" : existingId) };
  }
  return null;
}

function _requiredString(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}

// ── logDailyNutrition (create) ─────────────────────────────────
// Locked like every other Daily_Log/Patient_Registry write in this file
// (updateDailyNutrition, deleteDailyNutrition, deletePatient, registerPatient)
// — this was the one write path without it, which left two devices submitting
// the same patient's first entry of a day free to both append with no mutual
// exclusion at all. The lock alone does not add the "one row per patient per
// date" business rule (tracked separately in BACKLOG.md) — it only makes this
// function's own append atomic with respect to every other locked write, the
// same guarantee its siblings already had.
function logDailyNutrition(sessionId, entry, submittedBy) {
  var lock = LockService.getScriptLock();
  _waitLockOrBusy(lock, 10000);
  try {
    // typeof, not truthiness (2026-09-17 review, SEC-B11): a numeric sessionId
    // used to match a stored "123" through String().
    if (!_requiredString(sessionId)) return { error: "sessionId is required" };
    // The entry's calendar date is normalised and checked BEFORE the
    // duplicate-date guard compares it — see _normaliseEntryDate.
    entry = (entry && typeof entry === "object") ? entry : {};
    var dateCheck = _normaliseEntryDate(entry.ts);
    if (dateCheck.error) return { error: dateCheck.error };
    entry = Object.assign({}, entry, { ts: dateCheck.ts });
    // _buildLogRow validates entry and throws on an implausible value
    // (_validateLogEntry) — that has to happen inside the lock too, not
    // before it, or a throwing call never takes the lock at all and the
    // "every write path takes the same lock" guarantee silently has a hole
    // on exactly the input that most needed catching.
    var entryId = Utilities.getUuid();
    var lastModified = new Date().toISOString();
    var row = _buildLogRow(sessionId, entry, submittedBy)
      .concat([_sheetSafe(JSON.stringify(entry.calcInput || {})), entryId, lastModified, _sheetSafe(submittedBy || "")])
      .concat(_ioLogFields(entry))
      .concat(_provenanceFields(entry))
      .concat(_revisionFields(entry));
    // A row for an unregistered sessionId used to be accepted (2026-09-11
    // review, B5). Real path: a registration that failed on the network was
    // kept on screen as "local only", an order was saved against it, and the
    // next sync dropped the patient — leaving orphan rows keyed to an
    // initials+BW id that a different infant could register later.
    if (!_patientExists(sessionId)) {
      return { error: "ไม่พบผู้ป่วยรายนี้ในทะเบียน — ลงทะเบียนให้สำเร็จก่อนบันทึก (" + sessionId + ")" };
    }
    var sheet = getSheetLog();
    _assertSchema(sheet, "Daily_Log");
    var targetDate = String(row[0] || "").slice(0, 10);
    var existing = _findLogEntryOnDate(sheet, sessionId, targetDate);
    if (existing) {
      // Same Thai message as before; the code and the existing row's entryId
      // are for a client that can open that entry instead (2026-09-17 contract).
      return {
        error: "มีบันทึกของผู้ป่วยรายนี้ในวันที่ " + targetDate + " แล้ว — กรุณาเปิดรายการเดิมเพื่อแก้ไข",
        code: "DuplicateDate", entryId: existing.entryId,
      };
    }
    _ensureLogWidth(sheet, row.length);
    sheet.appendRow(row);
    return { entryId: entryId, lastModified: lastModified };
  } finally {
    _bumpDataVersion();
    lock.releaseLock();
  }
}

// ── updateDailyNutrition (optimistic-locked update by entryId) ─
// Rejects the write (rather than overwriting) if the row's lastModified has
// moved on since the client last fetched it — a concurrent edit from another
// device. submittedBy (col 16, the original creator) is preserved as-is;
// only lastModified/lastModifiedBy (col 27/28) track the editor.
function updateDailyNutrition(sessionId, entryId, expectedLastModified, entry, editedBy) {
  if (!_requiredString(entryId)) return { error: "entryId is required" };
  if (!_requiredString(sessionId)) return { error: "sessionId is required" };
  var lock = LockService.getScriptLock();
  _waitLockOrBusy(lock, 10000);
  try {
    var sheet = getSheetLog();
    _assertSchema(sheet, "Daily_Log");
    var hit = _findLogRowByEntryId(sheet, entryId);
    if (hit && hit.shifted) throw _codedError(ROW_MOVED_MSG, "", true);
    if (!hit) return { error: "ไม่พบข้อมูลที่ต้องการแก้ไข — อาจถูกลบไปแล้ว" };
    var rowNum = hit.row;
    var cur = hit.data;
    if (String(cur[1]) !== String(sessionId)) return { error: "Entry does not belong to this patient" };

    var currentLastModified = String(cur[26] || "");
    if (currentLastModified !== String(expectedLastModified || "")) {
      return { conflict: true, current: {
        lastModified: currentLastModified,
        lastModifiedBy: String(cur[27] || ""),
      } };
    }

    // A superseded row is history, not an edit target. Two editors who both
    // opened the same published row used to BOTH pass the lastModified
    // check below and each append a "revision 2" — two current rows for one
    // patient-day with different doses (2026-09-11 review, B1).
    if (cur[37]) {
      return { conflict: true, current: {
        lastModified: currentLastModified,
        lastModifiedBy: String(cur[27] || ""),
        superseded: true,
      } };
    }

    // An edit keeps the row's own calendar date. `entry.ts` from the client
    // is ignored here: accepting it let an update move an entry onto a date
    // that already had one, bypassing logDailyNutrition's one-row-per-date
    // guard (2026-09-11 review, B4). The current UI always resends the
    // original date, so this only changes what a direct POST can do.
    var storedDate = _wardDateKey(cur[0] instanceof Date ? cur[0] : String(cur[0] || "").slice(0, 10));
    entry = Object.assign({}, entry, { ts: storedDate || String(cur[0] || "") });

    var originalSubmittedBy = String(cur[15] || editedBy || "");
    var newLastModified = new Date().toISOString();

    // Published rows are immutable (the "Save / Submit / Print" design,
    // approved 2026-09-10): once Submit has locked a row, an edit must
    // never overwrite it — instead it appends a NEW row (a revision) and
    // marks this one superseded. This is the only branch in the function;
    // everything below it is the pre-existing overwrite-in-place path,
    // unchanged, for a row that is still a draft.
    if (cur[33]) {
      var newEntryId = Utilities.getUuid();
      var nextRevisionNumber = _numSafe(cur[35], 1) + 1;
      var revisionRow = _buildLogRow(sessionId, entry, originalSubmittedBy)
        .concat([_sheetSafe(JSON.stringify(entry.calcInput || {})), newEntryId, newLastModified, _sheetSafe(editedBy || "")])
        .concat(_ioLogFields(entry))
        .concat(_provenanceFields(entry))
        .concat(["", "", nextRevisionNumber, _sheetSafe(entryId), ""]);
      _ensureLogWidth(sheet, revisionRow.length);
      sheet.appendRow(revisionRow);
      // Mark the row being replaced as superseded — AL — and advance its
      // lastModified — AA — so a second editor still holding the old stamp
      // fails the optimistic check even before the superseded guard above.
      // Its content, published/publishedBy and entryId stay exactly as printed.
      //
      // ONE setValues over AA..AL (2026-09-17 review, UP-B8). These used to be
      // two setValue calls after the append: a failure between the append and
      // them left the new revision AND the old row both current — two live
      // orders for one patient-day — and a retry kept the fork. AB..AK are
      // written back as read, through _sheetSafeRoundTrip (see _sheetSafe's
      // rule). If the supersede throws, the just-appended revision is removed
      // before the error is rethrown, so the day is never left forked.
      try {
        _assertRowStillHolds(sheet, rowNum, 26, entryId);
        var tail = [newLastModified];
        for (var c = 27; c <= 36; c++) tail.push(_sheetSafeRoundTrip(cur[c]));
        tail.push(newLastModified);
        sheet.getRange(rowNum, 27, 1, 12).setValues([tail]);
      } catch (supersedeErr) {
        _removeAppendedRevision(sheet, newEntryId);
        throw supersedeErr;
      }
      return {
        ok: true, revised: true,
        entryId: newEntryId, lastModified: newLastModified,
        revisionNumber: nextRevisionNumber,
      };
    }

    var row = _buildLogRow(sessionId, entry, originalSubmittedBy)
      .concat([_sheetSafe(JSON.stringify(entry.calcInput || {})), _sheetSafe(entryId), newLastModified, _sheetSafe(editedBy || "")])
      .concat(_ioLogFields(entry))
      .concat(_provenanceFields(entry))
      // Draft rows are still overwritten in place, so publish/revision
      // bookkeeping must be PRESERVED from the existing row, not
      // recomputed from `entry` (the client payload never carries these —
      // they are server-managed). A still-draft row is always its own
      // revision 1 with nothing superseded, but this reads the actual
      // cells rather than assuming that, so it stays correct even for a
      // draft that itself resulted from a revision (revisionOf must not
      // be dropped). Read back, so escaped again on the way out (SEC-B2).
      .concat([
        _sheetSafeRoundTrip(cur[33]), _sheetSafeRoundTrip(cur[34]),
        _numSafe(cur[35], 1), _sheetSafeRoundTrip(cur[36]), _sheetSafeRoundTrip(cur[37]),
      ]);
    // A Daily_Log tab created before the Intake/Output columns is only 28
    // columns wide (and one predating AF–AG only 31), and getRange() past
    // the grid edge throws — which would surface at the bedside as a failed
    // save on an EXISTING entry. Widen on demand so this can't depend on
    // whether the one-off ensureLogHeaderColumns migration has been run yet.
    // No-op once done. Shared with the create path — see _ensureLogWidth.
    _ensureLogWidth(sheet, row.length);
    _assertRowStillHolds(sheet, rowNum, 26, entryId);
    sheet.getRange(rowNum, 1, 1, row.length).setValues([row]);
    return { ok: true, lastModified: newLastModified };
  } finally {
    _bumpDataVersion();
    lock.releaseLock();
  }
}
// Best effort, and never masks the error that made it necessary: removes the
// last row only if it really is the revision just appended.
function _removeAppendedRevision(sheet, newEntryId) {
  try {
    var last = sheet.getLastRow();
    if (last >= 2 && String(sheet.getRange(last, 26, 1, 1).getValues()[0][0]) === String(newEntryId)) {
      sheet.deleteRow(last);
    } else {
      Logger.log("revision rollback: last row is not " + newEntryId + " — left for manual review");
    }
  } catch (e) { Logger.log("revision rollback failed: " + e.message); }
}

// ── publishDailyLog (submit / lock a draft row) ─────────────────
// The only way a row's `published` column (AH) is ever set. From this point
// on, updateDailyNutrition will refuse to overwrite the row in place — any
// further edit creates a new revision instead (see the branch above). There
// is no unpublish: once locked, a row stays part of the permanent record.
// Submit is a signature on specific numbers, so it is optimistic-locked the
// same way an edit is (2026-09-11 review, B2): `expectedLastModified` must
// match, or someone else's later save would be locked under the submitter's
// name. A superseded row can't be submitted, and re-submitting an already
// published row is a no-op rather than a silent overwrite of who/when.
function publishDailyLog(sessionId, entryId, publishedBy, expectedLastModified) {
  if (!_requiredString(entryId)) return { error: "entryId is required" };
  if (!_requiredString(sessionId)) return { error: "sessionId is required" };
  if (!expectedLastModified) return { error: "expectedLastModified is required" };
  var lock = LockService.getScriptLock();
  _waitLockOrBusy(lock, 10000);
  try {
    var sheet = getSheetLog();
    _assertSchema(sheet, "Daily_Log");
    var hit = _findLogRowByEntryId(sheet, entryId);
    if (hit && hit.shifted) throw _codedError(ROW_MOVED_MSG, "", true);
    if (!hit) return { error: "ไม่พบข้อมูลที่ต้องการส่ง — อาจถูกลบไปแล้ว" };
    var cur = hit.data;
    if (String(cur[1]) !== String(sessionId)) return { error: "Entry does not belong to this patient" };
    if (cur[37]) return { error: "รายการนี้มีฉบับแก้ไขใหม่แล้ว — เปิดฉบับล่าสุดก่อนส่ง" };
    if (cur[33]) return { ok: true, alreadyPublished: true, publishedAt: String(cur[33]) };
    var currentLastModified = String(cur[26] || "");
    if (currentLastModified !== String(expectedLastModified)) {
      return { conflict: true, current: {
        lastModified: currentLastModified,
        lastModifiedBy: String(cur[27] || ""),
      } };
    }
    var publishedAt = new Date().toISOString();
    _ensureLogWidth(sheet, 38);
    _assertRowStillHolds(sheet, hit.row, 26, entryId);
    // AH and AI in ONE write (2026-09-17 review, UP-B9). As two setValue
    // calls, a failure between them left a row locked with no publishedBy —
    // and since re-submitting a published row is a no-op, it could never be
    // signed afterwards.
    sheet.getRange(hit.row, 34, 1, 2).setValues([[publishedAt, _sheetSafe(publishedBy || "")]]);
    return { ok: true, publishedAt: publishedAt };
  } finally {
    _bumpDataVersion();
    lock.releaseLock();
  }
}

// ── deleteDailyNutrition (admin-only, permanent) ────────────────
// Used to remove erroneous/test rows (e.g. a mock entry saved by mistake).
// Not exposed to doctor/nurse roles — clinical history should normally be
// corrected via updateDailyNutrition, not removed.
// The audit row is written FIRST and the delete is abandoned if it cannot be
// (2026-09-17 review, SEC-B15): a destructive action must never happen
// unrecorded. doPost adds the "deleteDailyLog" row once it has succeeded.
function deleteDailyNutrition(sessionId, entryId, actorEmail) {
  if (!_requiredString(entryId)) return { error: "entryId is required" };
  if (!_requiredString(sessionId)) return { error: "sessionId is required" };
  var lock = LockService.getScriptLock();
  _waitLockOrBusy(lock, 10000);
  try {
    var sheet = getSheetLog();
    _assertSchema(sheet, "Daily_Log");
    var hit = _findLogRowByEntryId(sheet, entryId);
    if (hit && hit.shifted) throw _codedError(ROW_MOVED_MSG, "", true);
    if (!hit) return { error: "ไม่พบข้อมูลที่ต้องการลบ — อาจถูกลบไปแล้ว" };
    if (String(hit.data[1]) !== String(sessionId)) return { error: "Entry does not belong to this patient" };
    // A submitted (published) row is part of the permanent record — "there
    // is no unpublish" — so it can't be hard-deleted either. Corrections go
    // through an edit, which appends a revision. Dormant while
    // ENABLE_PUBLISH_GATE is off: nothing is published yet.
    if (hit.data[33]) return { error: "รายการนี้ส่ง (Submit) แล้ว ลบไม่ได้ — ให้แก้ไขเป็นฉบับใหม่แทน" };
    _logAuditStrict("deleteDailyLog:start", sessionId, actorEmail || "");
    _assertRowStillHolds(sheet, hit.row, 26, entryId);
    sheet.deleteRow(hit.row);
    return { ok: true };
  } finally {
    _bumpDataVersion();
    lock.releaseLock();
  }
}

// ── deletePatient (admin-only, permanent) ───────────────────────
// Removes the Patient_Registry row AND every Daily_Log row for that
// sessionId. Previously the "Delete session" button in the UI was
// deliberately local-only (see HANDOFF.md) — it only hid the patient in the
// current browser, so the next sync from GAS pulled the same row straight
// back in. This is the real, server-side counterpart: once called, the
// session no longer exists in the sheet, so a resync can't resurrect it.
// Daily_Log rows are deleted too, not just the registry row — sessionId is
// derived from initials+BW+twinSuffix (see data.js), so leaving old log rows
// behind under a sessionId that could later be regenerated for a different
// admission would silently attach one patient's clinical history to another.
//
// Since 2026-09-17 (review UP-B6, SEC-B14, SEC-B15), in this order:
//   1. refuse if ANY of the patient's Daily_Log rows is published — a
//      submitted order is part of the permanent record, the same rule
//      deleteDailyNutrition already applied to a single row;
//   2. write the "deletePatient:start" audit row, and stop if that fails;
//   3. delete the Daily_Log rows, bottom-up, re-checking each row first;
//   4. delete the registry row LAST;
// and doPost writes the "deletePatient" row once this returns ok.
// Registry-first used to mean a timeout part-way through left orphan log rows
// under an id nobody could see or delete — the retry answered "ไม่พบ session".
// Log-first means a partial failure leaves the patient visible, and a retry
// (registry row present or already gone) simply finishes the cleanup.
function deletePatient(sessionId, actorEmail) {
  if (!_requiredString(sessionId)) return { error: "sessionId is required" };
  var lock = LockService.getScriptLock();
  _waitLockOrBusy(lock, 10000);
  try {
    var sid = String(sessionId);
    var patSheet = getSheetPat();
    var logSheet = getSheetLog();
    _assertSchema(patSheet, "Patient_Registry");
    _assertSchema(logSheet, "Daily_Log");
    var patData = patSheet.getDataRange().getValues();
    var patRows = [];
    for (var i = 1; i < patData.length; i++) {
      if (String(patData[i][0]) === sid) patRows.push(i + 1);
    }
    var logData = logSheet.getLastRow() > 0 ? logSheet.getDataRange().getValues() : [[]];
    var logRows = [];
    var anyPublished = false;
    for (var j = 1; j < logData.length; j++) {
      if (String(logData[j][1]) !== sid) continue;
      logRows.push(j + 1);
      if (logData[j][33]) anyPublished = true;
    }
    if (!patRows.length && !logRows.length) return { error: "ไม่พบ session นี้ในระบบ — อาจถูกลบไปแล้ว" };
    if (anyPublished) {
      return { error: "ผู้ป่วยรายนี้มีรายการที่ส่ง (Submit) แล้ว ลบทั้ง session ไม่ได้ — รายการที่ส่งแล้วเป็นส่วนหนึ่งของเวชระเบียน" };
    }
    _logAuditStrict("deletePatient:start", sid, actorEmail || "");
    for (var k = logRows.length - 1; k >= 0; k--) {
      _assertRowStillHolds(logSheet, logRows[k], 2, sid);
      logSheet.deleteRow(logRows[k]);
    }
    for (var m = patRows.length - 1; m >= 0; m--) {
      _assertRowStillHolds(patSheet, patRows[m], 1, sid);
      patSheet.deleteRow(patRows[m]);
    }
    return { ok: true };
  } finally {
    _bumpDataVersion();
    lock.releaseLock();
  }
}

// ── Daily-log edit lock (acquireLogLock / releaseLogLock) ───────
// Keyed by sessionId+date (the same granularity as "one entry per calendar
// day"), not entryId — a brand-new entry has no entryId yet, and the whole
// point is to catch two people opening the SAME date before either has saved.
// Held in CacheService, whose own TTL is the only expiry mechanism (no
// manual "held.ts too old?" check) — that's what makes a crashed/closed tab
// self-heal instead of leaving the entry permanently locked.
function _logLockKey(sessionId, date) {
  return "loglock_" + String(sessionId || "") + "_" + String(date || "");
}
// A stored value that is not the JSON this file wrote reads as "not held"
// (2026-09-17 review, UP-B13): JSON.parse used to throw straight out of the
// request, so one corrupt cache value made the entry un-openable for everyone
// until its TTL expired. Arguments must be short strings — the key is built
// from them, and CacheService throws on a key over 250 characters.
function _logLockArgsOk(sessionId, date) {
  return typeof sessionId === "string" && sessionId.length > 0 && sessionId.length <= 100 &&
         typeof date === "string" && date.length > 0 && date.length <= 20;
}
function _parseLogLockHolder(raw) {
  try {
    var held = JSON.parse(raw);
    return (held && typeof held === "object" && typeof held.email === "string") ? held : null;
  } catch (e) { return null; }
}
function acquireLogLock(sessionId, date, user) {
  if (!_logLockArgsOk(sessionId, date)) return { ok: true, locked: false };
  var cache = CacheService.getScriptCache();
  var key = _logLockKey(sessionId, date);
  var raw = cache.get(key);
  var held = raw ? _parseLogLockHolder(raw) : null;
  if (held && held.email !== user.email) {
    return { ok: true, locked: true, holder: { name: held.name, email: held.email, ts: held.ts } };
  }
  // Not held, held by this same user (heartbeat), or unreadable — (re)acquire.
  cache.put(key, JSON.stringify({ email: user.email, name: user.name, ts: new Date().toISOString() }), LOG_LOCK_TTL_SECONDS);
  return { ok: true, locked: false };
}
function releaseLogLock(sessionId, date, user) {
  if (!_logLockArgsOk(sessionId, date)) return;
  var cache = CacheService.getScriptCache();
  var key = _logLockKey(sessionId, date);
  var raw = cache.get(key);
  if (!raw) return;
  var held = _parseLogLockHolder(raw);
  // Only the holder can release it; an unreadable value is simply cleared.
  if (!held || held.email === user.email) cache.remove(key);
}

// ── backfillLegacyEntryIds — run once from Apps Script editor ─
// Pre-migration Daily_Log rows predate the entryId/lastModified/
// lastModifiedBy columns (Z/AA/AB) and are left blank there, which makes
// the frontend treat them as read-only (see log.jsx: editable requires a
// truthy entryId). This assigns each such row a stable entryId (and a
// lastModified stamp if it doesn't already have one) so it becomes
// editable like any normal entry. Already-migrated rows are untouched;
// safe to re-run — it only ever fills in blanks, never overwrites.
//
// 2026-09-17: refuses on column drift like every other Daily_Log write,
// escapes the lastModified it writes back (it was read from the sheet — see
// _sheetSafe's rule), and bumps DATA_VERSION so ward devices see the newly
// editable rows on their next sync instead of after the payload cache expires.
function backfillLegacyEntryIds() {
  var sheet = getSheetLog();
  _assertSchema(sheet, "Daily_Log");
  var data  = sheet.getDataRange().getValues();
  var fixed = 0;
  for (var i = 1; i < data.length; i++) {
    var sessionId = String(data[i][1] || "");
    if (!sessionId) continue; // blank trailing row
    var entryId = String(data[i][25] || "");
    if (entryId) continue; // already migrated
    var newEntryId    = Utilities.getUuid();
    var lastModified  = String(data[i][26] || "") || new Date().toISOString();
    sheet.getRange(i + 1, 26, 1, 2).setValues([[newEntryId, _sheetSafe(lastModified)]]);
    fixed++;
  }
  if (fixed) _bumpDataVersion();
  Logger.log("Backfilled entryId for " + fixed + " legacy row(s).");
  return fixed;
}

// ── ensureStaffHeaderColumns — run once from the editor or clasp ─
// The Staff tab created before the forced-password-change work only has
// headers A–F. getSheetStaff() writes the full A–H header row, but ONLY when
// it has to create the sheet from scratch, so the live tab never gained
// labels for G (must_change_password) / H (temp_password). Auto-provisioning
// writes values into those columns regardless (setValues over E:H), so this
// is cosmetic — but an unlabelled column holding a plaintext temp password is
// exactly the kind of thing someone later mistakes for junk and deletes.
//
// Dry-run by default: call with no arguments to see what it WOULD do.
// Pass true to actually write. Only ever fills a blank header cell — if
// G1/H1 already contain anything at all it reports and changes nothing,
// so it is safe to re-run.
function ensureStaffHeaderColumns(apply) {
  var WANT = { 7: "must_change_password", 8: "temp_password" };
  var sh   = getSheetStaff();
  var out  = { applied: apply === true, sheetLastColumn: sh.getLastColumn(), changes: [], skipped: [] };

  Object.keys(WANT).forEach(function (colStr) {
    var col     = Number(colStr);
    var cell    = sh.getRange(1, col);
    var current = String(cell.getValue() || "").trim();
    if (current === WANT[col]) {
      out.skipped.push("col " + col + ": already '" + current + "'");
    } else if (current !== "") {
      // Someone put something else here — do not clobber it.
      out.skipped.push("col " + col + ": OCCUPIED by '" + current + "' — left alone");
    } else {
      out.changes.push("col " + col + ": '' -> '" + WANT[col] + "'");
      if (apply === true) cell.setValue(WANT[col]);
    }
  });

  out.headerRowAfter = sh.getRange(1, 1, 1, Math.max(8, sh.getLastColumn())).getValues()[0];
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

// Apply variant — the Apps Script editor's Run button can't pass arguments,
// so this exists purely so both the dry run and the real thing are pickable
// from the function dropdown. Same guarantees: only fills blank header cells.
function applyStaffHeaderColumns() {
  return ensureStaffHeaderColumns(true);
}

// ── ensureLogHeaderColumns — run once from the editor or clasp ──
// Same gap as ensureStaffHeaderColumns above, one tab over: getSheetLog()
// writes the full A–AE header row, but ONLY when it has to create Daily_Log
// from scratch. The live tab predates the Intake/Output work, so it never
// gained labels for AC (ioInput) / AD (ioOutput) / AE (drainContent).
//
// It grows the GRID to 31 columns before labelling, because
// updateDailyNutrition() writes with getRange(row, 1, 1, 31) and that range
// is out of bounds on a sheet still 28 columns wide. (Creating is fine —
// appendRow widens the sheet itself.) That part is belt-and-braces now:
// updateDailyNutrition widens on demand itself (2b7d2a4), so this helper is
// effectively cosmetic — see the caveat about unlabelled columns in
// ensureStaffHeaderColumns's comment.
//
// Dry-run by default: call with no arguments to see what it WOULD do. Pass
// true to actually write. Only ever fills a BLANK header cell — if AC1/AD1/
// AE1 already contain anything it reports and changes nothing, so it is safe
// to re-run.
function ensureLogHeaderColumns(apply) {
  var WANT = {
    29: "ioInput", 30: "ioOutput", 31: "drainContent",
    // AF–AG, added 2026-08-26 — see _provenanceFields
    32: "constantsVersion", 33: "appVersion",
    // AH–AL, added 2026-09-10 — see _revisionFields / the publish-lock design
    34: "published", 35: "publishedBy", 36: "revisionNumber",
    37: "revisionOf", 38: "supersededAt",
  };
  var sh   = getSheetLog();
  var out  = {
    applied: apply === true,
    sheetMaxColumns: sh.getMaxColumns(),
    sheetLastColumn: sh.getLastColumn(),
    changes: [], skipped: []
  };

  // 1. Widen the grid if needed — must happen before any getRange(.., 38).
  var need = 38 - sh.getMaxColumns();
  if (need > 0) {
    out.changes.push("grid: " + sh.getMaxColumns() + " -> 38 columns (+" + need + ")");
    if (apply === true) sh.insertColumnsAfter(sh.getMaxColumns(), need);
  } else {
    out.skipped.push("grid: already " + sh.getMaxColumns() + " columns — wide enough");
  }

  // 2. Label the headers (only if we actually have the columns to label).
  if (apply === true || need <= 0) {
    Object.keys(WANT).forEach(function (colStr) {
      var col     = Number(colStr);
      var cell    = sh.getRange(1, col);
      var current = String(cell.getValue() || "").trim();
      if (current === WANT[col]) {
        out.skipped.push("col " + col + ": already '" + current + "'");
      } else if (current !== "") {
        // Someone put something else here — do not clobber it.
        out.skipped.push("col " + col + ": OCCUPIED by '" + current + "' — left alone");
      } else {
        out.changes.push("col " + col + ": '' -> '" + WANT[col] + "'");
        if (apply === true) cell.setValue(WANT[col]);
      }
    });
  } else {
    out.skipped.push("headers: dry run on a too-narrow grid — re-run with apply to see them");
  }

  out.headerRowAfter = sh.getRange(1, 1, 1, Math.max(38, sh.getLastColumn())).getValues()[0];
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

// Apply variant — see applyStaffHeaderColumns for why this exists.
function applyLogHeaderColumns() {
  return ensureLogHeaderColumns(true);
}

// ── ensurePatHeaderColumns — run once from the editor or clasp ──
// Same gap as ensureLogHeaderColumns above, one tab over: getSheetPat() only
// writes the full header row when it creates Patient_Registry from scratch,
// so a live tab predating multiplesCount (added 2026-08-14, R) never gained
// that label. It still widens the grid to 18 columns before labelling, but
// that part is now belt-and-braces: registerPatient() widens on demand
// itself (2026-08-17), so a too-narrow grid no longer makes editing an
// existing patient throw and this helper is effectively cosmetic — see the
// caveat about unlabelled columns in ensureStaffHeaderColumns's comment.
//
// Dry-run by default: call with no arguments to see what it WOULD do. Pass
// true to actually write. Only ever fills a BLANK header cell — if R1
// already contains anything it reports and changes nothing, so it is safe
// to re-run.
function ensurePatHeaderColumns(apply) {
  var WANT = { 18: "multiplesCount" };
  var sh   = getSheetPat();
  var out  = {
    applied: apply === true,
    sheetLastColumn: sh.getLastColumn(),
    changes: [], skipped: []
  };

  var need = 18 - sh.getMaxColumns();
  if (need > 0) {
    out.changes.push("grid: " + sh.getMaxColumns() + " -> 18 columns (+" + need + ")");
    if (apply === true) sh.insertColumnsAfter(sh.getMaxColumns(), need);
  } else {
    out.skipped.push("grid: already " + sh.getMaxColumns() + " columns — wide enough");
  }

  if (apply === true || need <= 0) {
    Object.keys(WANT).forEach(function (colStr) {
      var col     = Number(colStr);
      var cell    = sh.getRange(1, col);
      var current = String(cell.getValue() || "").trim();
      if (current === WANT[col]) {
        out.skipped.push("col " + col + ": already '" + current + "'");
      } else if (current !== "") {
        out.skipped.push("col " + col + ": OCCUPIED by '" + current + "' — left alone");
      } else {
        out.changes.push("col " + col + ": '' -> '" + WANT[col] + "'");
        if (apply === true) cell.setValue(WANT[col]);
      }
    });
  } else {
    out.skipped.push("headers: dry run on a too-narrow grid — re-run with apply to see them");
  }

  out.headerRowAfter = sh.getRange(1, 1, 1, Math.max(18, sh.getLastColumn())).getValues()[0];
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

// Apply variant — see applyStaffHeaderColumns for why this exists.
function applyPatHeaderColumns() {
  return ensurePatHeaderColumns(true);
}

// ── sheetHealthReport — run from the Apps Script editor (2026-09-17) ─────────
// COUNTS ONLY: no email, name, initials, sessionId, bed or date of any patient
// or staff member is ever in the result (pinned by
// test/verify-review-0917-backend-writes.cjs, which fails on any of them).
//
// Run it BEFORE switching the deployment to a version with the column-drift
// guard, and read `schema` first: any tab with ok:false would refuse EVERY
// save the moment that version goes live. It answers:
//   • schema — the header check per data tab: which columns carry a label
//     different from the code's, and how many are blank (blank is accepted).
//     It also drops the cached check result, so a header fixed by hand is
//     honoured by the next save rather than up to 10 minutes later;
//   • tabs / workbookGridCells / percentOfCellLimit — grid size (rows ×
//     columns, empty cells included) against Sheets' 10,000,000-cell ceiling,
//     which is what Audit_Log's 26-column grid was eating (review UP-B1);
//   • registry — records that change what the ward sees at this deploy:
//     archived patients with no usable statusDate (they leave the ward sync),
//     duplicate sessionIds, Active patients with no Daily_Log row in 30 days
//     ("forgotten Active"), records whose stored measurement arrays or sex a
//     client edit could no longer send back unchanged (SEC-B3 / sex rule).
// Nothing is written except the schema-cache removal and the execution log.
function sheetHealthReport() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID_());
  var today = _wardDateKey();
  var out = {
    generatedAt: new Date().toISOString(),
    tabs: [], workbookGridCells: 0, cellLimit: 10000000, percentOfCellLimit: "",
    schema: [], registry: {}, dailyLog: {}
  };
  ss.getSheets().forEach(function (sh) {
    var cells = sh.getMaxRows() * sh.getMaxColumns();
    out.workbookGridCells += cells;
    out.tabs.push({ name: sh.getName(), lastRow: sh.getLastRow(), maxRows: sh.getMaxRows(),
      maxColumns: sh.getMaxColumns(), gridCells: cells });
  });
  out.percentOfCellLimit = (Math.round(out.workbookGridCells / out.cellLimit * 1000) / 10) + "%";

  var patSheet = getSheetPat(ss);
  var logSheet = getSheetLog(ss);
  [["Patient_Registry", patSheet], ["Daily_Log", logSheet]].forEach(function (pair) {
    var tab = pair[0], sh = pair[1], expected = _expectedHeaders(tab);
    var width = Math.min(expected.length, sh.getMaxColumns());
    var labels = width > 0 ? (sh.getRange(1, 1, 1, width).getValues()[0] || []) : [];
    var mismatched = [], blank = 0;
    for (var c = 0; c < expected.length; c++) {
      var got = c < width ? String(labels[c] == null ? "" : labels[c]).trim() : "";
      if (!got) { blank++; continue; }
      if (got.toLowerCase() !== expected[c].toLowerCase()) mismatched.push(_colLetter(c + 1) + " (expected " + expected[c] + ")");
    }
    out.schema.push({ tab: tab, ok: mismatched.length === 0, mismatchedColumns: mismatched,
      blankHeaderColumns: blank, gridColumns: sh.getMaxColumns(), expectedColumns: expected.length });
    _forgetSchemaCheck(tab);
  });

  var pat = patSheet.getLastRow() > 0 ? patSheet.getDataRange().getValues() : [[]];
  var r = { rows: Math.max(0, pat.length - 1), active: 0, archivedNoStatusDate: 0,
    archivedUnparseableStatusDate: 0, archivedWithin30d: 0, archivedOlder: 0, duplicateSessionIds: 0,
    activeWithNoEntryIn30d: 0, measurementArraysFailingValidation: 0, sexNotBoysOrGirls: 0 };
  var seen = {}, activeIds = {};
  for (var i = 1; i < pat.length; i++) {
    var sid = String(pat[i][0] || "");
    if (!sid) continue;
    if (seen[sid]) r.duplicateSessionIds++;
    seen[sid] = true;
    var st = String(pat[i][9] || "").trim();
    if (!st || st === "Active") { r.active++; activeIds[sid] = true; }
    else if (!pat[i][16]) r.archivedNoStatusDate++;
    else if (!_wardDateKey(pat[i][16] instanceof Date ? pat[i][16] : String(pat[i][16]).slice(0, 10))) r.archivedUnparseableStatusDate++;
    else if (_patientInSyncWindow(pat[i][9], pat[i][16], today)) r.archivedWithin30d++;
    else r.archivedOlder++;
    var sp = _storedPatient(pat[i]);
    try {
      ["weights", "lengths", "hcs", "bedHistory"].forEach(function (f, idx) {
        var parsed = _parseJson(pat[i][12 + idx], f === "weights" ? sp.weights : []);
        _validateMeasureArray(parsed, f, false);
      });
    } catch (e) { r.measurementArraysFailingValidation++; }
    if (VALID_SEX[String(pat[i][5] || "").trim()] !== true) r.sexNotBoysOrGirls++;
  }
  var lastRow = logSheet.getLastRow();
  var ab = lastRow > 1 ? logSheet.getRange(2, 1, lastRow - 1, 2).getValues() : [];
  var lastEntry = {}, blankRows = 0;
  for (var j = 0; j < ab.length; j++) {
    var s = String(ab[j][1] || "");
    if (!s) { blankRows++; continue; }
    var d = _wardDateKey(ab[j][0] instanceof Date ? ab[j][0] : String(ab[j][0]).slice(0, 10));
    if (d && (!lastEntry[s] || d > lastEntry[s])) lastEntry[s] = d;
  }
  Object.keys(activeIds).forEach(function (id) {
    var last = lastEntry[id];
    if (!last || (Date.parse(today + "T00:00:00Z") - Date.parse(last + "T00:00:00Z")) / 86400000 > 30) r.activeWithNoEntryIn30d++;
  });
  out.registry = r;
  out.dailyLog = { rows: ab.length, blankRows: blankRows };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

// ── sessionId collision guard ─────────────────────────────────
// sessionId is generated CLIENT-side as initials+BW+twinSuffix (registry.jsx),
// so two UNRELATED infants who share both initials and an integer birth weight
// generate the SAME id. Without this guard registerPatient's upsert silently
// overwrites the first infant's registry row, and every Daily_Log row for both
// babies then keys to one id — two nutrition histories merged into one, with
// nothing in the sheet to show it happened. Twins are separated by twinSuffix;
// unrelated same-initial infants never were.
//
// Two independent signals, because the frontend and backend deploy separately
// and neither can be assumed to be the newer one:
//
//  1. `isNew` — the client states this is a fresh registration rather than an
//     edit (app.jsx handleAddPatient sends it, handleEditPatient does not). A
//     fresh registration landing on an existing row IS the collision. An older
//     client omits the flag entirely, which is exactly why signal 2 exists.
//  2. dob mismatch — a stored dob disagreeing with the incoming one means a
//     different infant whatever the client claims, so this holds for any client
//     version. Skipped when either side is blank, which includes a PDPA-erased
//     row (pseudonymizePatient clears dob).
//
// Returns a Thai message for the bedside, or null when the write is a genuine
// edit of the same infant. The two messages differ on purpose: "different
// infant" and "already registered" need different actions from the nurse.
//
// ⚠️ This is a STOPGAP. The real fix is an opaque, server-generated sessionId
// carrying no patient attributes — see PDPA_SECURITY_AUDIT_2026-08-27.md §2.3
// (kept outside this repo). Keep this guard after that lands anyway: it costs
// one comparison and catches a duplicate id whatever the cause.
function _sessionIdConflict(existingRow, p, isNew) {
  var existingDob = _fmtDate(existingRow[6]);
  var incomingDob = _fmtDate(p.dob);
  if (existingDob && incomingDob && existingDob !== incomingDob) {
    return "ID ซ้ำ (" + p.sessionId + ") — เป็นคนละรายกับที่มีอยู่ (วันเกิดไม่ตรงกัน) " +
           "ถ้าเป็นแฝดให้เลือก Multiples A/B/C/D, ถ้าไม่ใช่ให้แก้ชื่อย่อ";
  }
  if (isNew === true) {
    return "ID นี้ (" + p.sessionId + ") ลงทะเบียนไว้แล้ว — " +
           "ถ้าเป็นรายใหม่ที่ชื่อย่อและน้ำหนักแรกเกิดตรงกัน ให้เลือก Multiples A/B/C/D";
  }
  return null;
}

// ── One infant per bed ────────────────────────────────────────
// The client disables an occupied bed in every picker and refuses one on
// save, but each of those checks runs against a `patients` snapshot that can
// be minutes old — two tablets admitting at the same moment both believe the
// bed is free. This is the only check that sees every device's writes, so it
// is the one that actually holds the rule.
//
// Mirrors normalizeBed() in data.js. Kept as its own small function rather
// than shared, because Apps Script cannot import the client bundle: if the
// canonical bed spelling ever changes, BOTH have to move.
function _normBed(bed) {
  var s = String(bed == null ? "" : bed).trim().replace(/\s+/g, " ");
  if (!s) return "";
  var m = s.match(/^(nicu|scn|iso)\s*-?\s*(\d+)(?:\s*-\s*(\d+))?$/i);
  if (!m) return s;
  var ward = m[1].toLowerCase();
  if (ward === "iso") return m[3] ? "iso " + m[2] + "-" + m[3] : "iso " + m[2];
  return ward.toUpperCase() + " " + m[2];
}

// Only a patient still on the unit holds a bed — a discharged/transferred/
// expired row keeps the bed it was in, but the bed itself is free. Same rule
// as isOnUnit() in data.js; a blank status means Active. It applies to the
// record being saved too: correcting a discharged record whose old bed has
// since been reused takes that bed from nobody. Mirrors bedBlocker() in data.js.
function _bedConflict(data, p) {
  if (String(p.status || "Active") !== "Active") return null;
  var bed = _normBed(p.currentBed);
  if (!bed) return null;                       // unassigned is not an occupancy
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(p.sessionId)) continue;   // the patient's own row
    var status = String(data[i][9] || "Active");
    if (status !== "Active") continue;
    if (_normBed(data[i][10]) !== bed) continue;
    var who = String(data[i][1] || data[i][0]);
    return "เตียง " + bed + " มี " + who + " อยู่แล้ว — ต้องย้ายผู้ป่วยรายนั้นออกก่อน " +
           "จึงจะบันทึกเตียงนี้ได้ (หนึ่งเตียงต่อหนึ่งราย)";
  }
  return null;
}

// ── Three-way merge of a patient record (2026-09-17 review, UP-S1 server half) ──
// The problem: every edit path on the client (EditPatientModal, the bed
// transfer, MeasurementLogger) sends the WHOLE record as that device last
// synced it, and the upsert wrote it over the row. A device that synced at
// 08:00 and moved a bed at 08:03 silently erased the DOL-17 weight another
// device saved at 08:02 — and a stale edit flipped a discharge back to Active.
//
// A client that knows the merge sends `base` (registerPatient) or
// `baseWeights` (updateWeights): the record exactly as it last received it.
// Under the script lock, per field:
//   • scalars — if incoming equals base (after the same normalisation the
//     write uses: strings trimmed, numbers as numbers, dates as YYYY-MM-DD,
//     beds canonical), the client did not touch it, so the STORED value wins;
//     otherwise the client's value wins. status/statusDate follow the same
//     rule, so a stale device whose status still equals base cannot undo a
//     discharge made elsewhere.
//   • weights / lengths / hcs — merged per dol:
//       in incoming, not in base          → added here: take incoming
//       in both, different                → edited here: take incoming
//       in both, same                     → untouched: stored wins (incl. gone)
//       in base, not incoming             → deleted here: remove only if the
//                                           stored entry still equals base
//       in stored, not base, not incoming → added elsewhere: keep
//   • bedHistory — append-only: stored entries are kept, and entries the
//     client added (in incoming, not in base) are appended.
// No base (older clients, new registrations) → the old whole-record write.
var PATIENT_SCALAR_FIELDS = ["name", "initials", "bw", "ga", "sex", "dob", "admissionDate",
  "twinSuffix", "status", "currentBed", "diagnosis", "statusDate", "multiplesCount"];
function _patientFieldNorm(field, v) {
  switch (field) {
    case "bw": case "ga": case "multiplesCount": return _numSafe(v, 0);
    case "dob": case "admissionDate": case "statusDate": return String(_fmtDate(v)).trim();
    case "currentBed": return _normBed(v);
    case "sex": return String(v == null ? "" : v).trim() || "boys";
    case "status": return String(v == null ? "" : v).trim() || "Active";
    default: return String(v == null ? "" : v).trim();
  }
}
// A stored row in the shape getActivePatients sends — which is the shape a
// client's `base` was built from, so the two compare like for like.
function _storedPatient(r) {
  return {
    sessionId: String(r[0] || ""), name: String(r[1] || ""), initials: String(r[2] || ""),
    bw: Number(r[3] || 0), ga: Number(r[4] || 0), sex: String(r[5] || "boys"),
    dob: _fmtDate(r[6]), admissionDate: _fmtDate(r[7]), twinSuffix: String(r[8] || ""),
    status: String(r[9] || "Active"), currentBed: String(r[10] || ""), diagnosis: String(r[11] || ""),
    weights: _asArray(_parseJson(r[12], [{ dol: 1, w: Number(r[3] || 0) }])),
    lengths: _asArray(_parseJson(r[13], [])),
    hcs: _asArray(_parseJson(r[14], [])),
    bedHistory: _asArray(_parseJson(r[15], [])),
    statusDate: _fmtDate(r[16]), multiplesCount: Number(r[17] || 0),
  };
}
function _asArray(v) { return Array.isArray(v) ? v : []; }
// Key-order-independent JSON, so "same entry" means same content.
function _canonJson(v) {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(_canonJson).join(",") + "]";
  var keys = Object.keys(v).filter(function (k) { return v[k] !== undefined; }).sort();
  return "{" + keys.map(function (k) { return JSON.stringify(k) + ":" + _canonJson(v[k]); }).join(",") + "}";
}
function _groupByDol(arr) {
  var groups = {}, order = [];
  for (var i = 0; i < arr.length; i++) {
    var key = String(arr[i] && arr[i].dol);
    if (!Object.prototype.hasOwnProperty.call(groups, key)) { groups[key] = []; order.push(key); }
    groups[key].push(arr[i]);
  }
  return { groups: groups, order: order };
}
function _mergeByDol(stored, base, incoming) {
  var S = _groupByDol(_asArray(stored)), B = _groupByDol(_asArray(base)), I = _groupByDol(_asArray(incoming));
  var has = function (G, k) { return Object.prototype.hasOwnProperty.call(G.groups, k); };
  var keys = [], seenKey = {};
  [S.order, B.order, I.order].forEach(function (order) {
    order.forEach(function (k) { if (!seenKey[k]) { seenKey[k] = true; keys.push(k); } });
  });
  var kept = [];
  keys.forEach(function (k) {
    var inS = has(S, k), inB = has(B, k), inI = has(I, k);
    var group = null;
    if (inI && !inB) group = I.groups[k];                                                  // added here
    else if (inI && inB && _canonJson(I.groups[k]) !== _canonJson(B.groups[k])) group = I.groups[k]; // edited here
    else if (inI && inB) group = inS ? S.groups[k] : null;                                 // untouched here
    else if (inB) group = (inS && _canonJson(S.groups[k]) !== _canonJson(B.groups[k])) ? S.groups[k] : null; // deleted here
    else if (inS) group = S.groups[k];                                                     // added elsewhere
    if (group) kept.push({ dol: Number(k), key: k, items: group });
  });
  kept.sort(function (a, b) {
    var an = isFinite(a.dol), bn = isFinite(b.dol);
    if (an && bn) return a.dol - b.dol;
    return an ? -1 : bn ? 1 : 0;
  });
  var out = [];
  kept.forEach(function (g) { g.items.forEach(function (x) { out.push(x); }); });
  return out;
}
function _mergeAppendOnly(stored, base, incoming) {
  var out = _asArray(stored).slice();
  var present = {};
  out.forEach(function (e) { present[_canonJson(e)] = true; });
  var baseCount = {};
  _asArray(base).forEach(function (e) { var c = _canonJson(e); baseCount[c] = (baseCount[c] || 0) + 1; });
  _asArray(incoming).forEach(function (e) {
    var c = _canonJson(e);
    if (baseCount[c] > 0) { baseCount[c]--; return; }   // was already there when this device synced
    if (present[c]) return;
    present[c] = true;
    out.push(e);
  });
  return out;
}
// The record to write for an existing row. `base` may be null (no merge).
function _mergePatient(storedRow, incoming, base) {
  var s = _storedPatient(storedRow);
  var m = {};
  for (var key in incoming) {
    if (Object.prototype.hasOwnProperty.call(incoming, key)) m[key] = incoming[key];
  }
  if (base) {
    PATIENT_SCALAR_FIELDS.forEach(function (f) {
      if (_patientFieldNorm(f, incoming[f]) === _patientFieldNorm(f, base[f])) {
        m[f] = f === "currentBed" ? _normBed(s.currentBed) : s[f];
      }
    });
    ["weights", "lengths", "hcs"].forEach(function (f) {
      m[f] = Array.isArray(incoming[f]) ? _mergeByDol(s[f], base[f], incoming[f]) : s[f];
    });
    m.bedHistory = Array.isArray(incoming.bedHistory)
      ? _mergeAppendOnly(s.bedHistory, base.bedHistory, incoming.bedHistory) : s.bedHistory;
  }
  // PDPA erasure is one-way (2026-09-17 review, SEC-B6). pseudonymizePatient
  // clears name/initials/dob, but ANY later whole-record write from a device
  // that synced before the erasure — an ordinary bed move — wrote them all
  // straight back, silently undoing a data-subject request. With or without
  // base, a client write can no longer restore them; a deliberate un-erase is
  // out of scope for the API.
  if (String(storedRow[1] || "").indexOf("[PDPA-erased") === 0) {
    m.name = String(storedRow[1]);
    m.initials = String(storedRow[2] || "");
    m.dob = _fmtDate(storedRow[6]);
  }
  return m;
}

// ── registerPatient (upsert) ──────────────────────────────────
// `isNew` is optional and defaults to a plain upsert, so an older client that
// does not send it keeps working exactly as before — see _sessionIdConflict.
// `base` is optional too — see the three-way merge above.
function registerPatient(p, isNew, base) {
  if (!p || typeof p !== "object" || !_requiredString(p.sessionId) || !p.sessionId.trim()) {
    throw new Error("sessionId is required");
  }
  _validatePatient(p);
  if (base != null && (typeof base !== "object" || Array.isArray(base))) base = null;
  // Serialised: the read (getDataRange) and the write (setValues/appendRow) are
  // a read-modify-write over the whole tab, so two nurses registering at once
  // could both scan a pre-append snapshot and each append the same sessionId,
  // leaving a duplicate row that the upsert's first-match loop then edits
  // inconsistently.
  var lock = LockService.getScriptLock();
  _waitLockOrBusy(lock, 10000);
  try {
    var sheet = getSheetPat();
    _assertSchema(sheet, "Patient_Registry");
    var data  = sheet.getDataRange().getValues();
    var rowIndex = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(p.sessionId)) { rowIndex = i; break; }
    }
    var stored = rowIndex >= 0 ? data[rowIndex] : null;
    // An edit that carries `base` is an edit of a record this device saw. If
    // the row is gone, it was deleted elsewhere — writing would resurrect it.
    if (!stored && base && isNew !== true) {
      throw new Error("ไม่พบ session นี้ในระบบ — อาจถูกลบไปแล้ว (ไม่ได้บันทึกการแก้ไข)");
    }
    var m = stored ? _mergePatient(stored, p, isNew === true ? null : base) : p;
    if (stored) {
      // Refuse before writing — this row may belong to a different infant.
      var conflict = _sessionIdConflict(stored, m, isNew);
      if (conflict) throw new Error(conflict);
    }
    _checkSex(m.sex, stored ? stored[5] : null);
    // Dates were never checked on this path (2026-09-23 review): every number
    // was bounded and no date at all, so a direct POST — or a client older than
    // the guards now in registry.jsx — could store a blank, future or
    // Buddhist-era admission date. Each pins DOL at 1, and with it the day-1
    // fluid, energy, Na, K, Ca and P bands, for an infant of any age. dob is
    // the anchor DOL is now computed from, so it is held to the same rule.
    _checkAdmissionDate(m.admissionDate, stored ? stored[7] : null, "Admit date");
    _checkAdmissionDate(m.dob,           stored ? stored[6] : null, "Date of birth");
    // Inside the lock and after the read, so the census it checks is the one
    // this write is about to land in — and on the MERGED record, so a stale
    // device's old "Active" status cannot claim a bed for a discharged patient.
    var bedTaken = _bedConflict(data, m);
    if (bedTaken) throw new Error(bedTaken);
    var row18 = [
      _sheetSafe(m.sessionId), _sheetSafe(m.name || ""), _sheetSafe(m.initials || ""),
      _numSafe(m.bw, 0), _numSafe(m.ga, 0), _sheetSafe(m.sex || "boys"),
      _sheetSafe(m.dob || ""), _sheetSafe(m.admissionDate || ""), _sheetSafe(m.twinSuffix || ""),
      _sheetSafe(m.status || "Active"), _sheetSafe(m.currentBed || ""), _sheetSafe(m.diagnosis || ""),
      _sheetSafe(JSON.stringify(m.weights    || [])),
      _sheetSafe(JSON.stringify(m.lengths    || [])),
      _sheetSafe(JSON.stringify(m.hcs        || [])),
      _sheetSafe(JSON.stringify(m.bedHistory || [])),
      _sheetSafe(m.statusDate || ""),
      _numSafe(m.multiplesCount, 0),
    ];
    if (stored) {
      // A Patient_Registry tab narrower than 18 columns would make this
      // getRange() out of bounds and throw — surfacing at the bedside as a
      // failed save when EDITING an existing patient. Widen on demand so the
      // upsert can't depend on whether the one-off ensurePatHeaderColumns
      // migration has been run yet, exactly as updateDailyNutrition does for
      // Daily_Log's AC–AE. No-op once wide enough (a sheet created by
      // insertSheet() starts at Sheets' 26-column default, so in practice
      // this only fires on a tab whose columns were trimmed by hand).
      // Creating is fine either way — appendRow widens the sheet itself.
      if (sheet.getMaxColumns() < row18.length) {
        sheet.insertColumnsAfter(sheet.getMaxColumns(), row18.length - sheet.getMaxColumns());
      }
      _assertRowStillHolds(sheet, rowIndex + 1, 1, p.sessionId);
      sheet.getRange(rowIndex + 1, 1, 1, row18.length).setValues([row18]);
      return;
    }
    sheet.appendRow(row18);
  } finally {
    _bumpDataVersion();
    lock.releaseLock();
  }
}

// ── updateWeights ─────────────────────────────────────────────
// Locked like every other Patient_Registry write in this file (registerPatient,
// deletePatient) — this was the other write path missing both a lock and a
// miss signal: two concurrent measurement submissions used to silently
// last-write-win, and a sessionId that didn't match anything returned
// `undefined` with no indication the write never happened.
// `baseWeights` (optional): the weights array as this device last received
// it — merged per dol against the stored array exactly like registerPatient's
// `base` (see the three-way merge above), so two devices logging different
// measurements no longer erase each other's. Every element is validated in
// full either way (SEC-B3).
function updateWeights(sessionId, weights, baseWeights) {
  _validateWeightsArray(weights);
  if (!_requiredString(sessionId)) return { error: "sessionId is required" };
  var lock = LockService.getScriptLock();
  _waitLockOrBusy(lock, 10000);
  try {
    var sheet = getSheetPat();
    _assertSchema(sheet, "Patient_Registry");
    var data  = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(sessionId)) {
        var toWrite = Array.isArray(baseWeights)
          ? _mergeByDol(_storedPatient(data[i]).weights, baseWeights, weights)
          : weights;
        _assertRowStillHolds(sheet, i + 1, 1, sessionId);
        sheet.getRange(i + 1, 13).setValue(_sheetSafe(JSON.stringify(toWrite)));
        return { ok: true };
      }
    }
    return { error: "ไม่พบ session นี้ในระบบ — อาจถูกลบไปแล้ว" };
  } finally {
    _bumpDataVersion();
    lock.releaseLock();
  }
}

// ── pseudonymizePatient (PDPA Section 33 — right to erasure) ───
// Clears the direct identifiers held on Patient_Registry: name (B), initials
// (C), and dob (G) — a birthdate is, on a small NICU census, identifying on
// its own. Clinical fields (bw/ga/diagnosis/weights/etc.) are retained: the
// hospital's own record-retention duty (Medical Facility Act) and the
// Sec 26(6)/24 medical-necessity basis this system relies on both justify
// keeping de-identified clinical history rather than deleting it outright.
//
// Known residual risk: sessionId itself is generated as initials+BW+twin
// suffix (see data.js), so it is not a true pseudonym — on a small census it
// can still be reverse-mapped to the patient by staff who were present at
// admission. Erasure here removes the *stored* identifiers but cannot scrub
// that pattern from an already-issued sessionId without breaking every
// Daily_Log row keyed on it. Flagged in HANDOFF.md; do not treat this
// function as satisfying a full erasure request on its own.
//
// Since 2026-09-17: the "pseudonymize:start" audit row is written before
// anything is cleared, and the erasure is abandoned if it cannot be (SEC-B15);
// and B..G is ONE write (UP-B9) — as three setValue calls, a failure part-way
// left a record with the name erased but the dob still in place, reported as
// an error nobody would read as "half done". D..F (bw, ga, sex) are written
// back exactly as read, through _sheetSafeRoundTrip. Registry writes can no
// longer restore the cleared fields afterwards (see _mergePatient, SEC-B6).
function pseudonymizePatient(sessionId, adminEmail) {
  if (!_requiredString(sessionId)) return { error: "sessionId is required" };
  // Locked like every other Patient_Registry write — a concurrent upsert of
  // the same row could otherwise write the name/dob straight back.
  var lock = LockService.getScriptLock();
  _waitLockOrBusy(lock, 10000);
  try {
    var sheet = getSheetPat();
    _assertSchema(sheet, "Patient_Registry");
    var data  = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(sessionId)) {
        var note = "[PDPA-erased " + new Date().toISOString().slice(0, 10) + "]";
        _logAuditStrict("pseudonymize:start", sessionId, adminEmail || "");
        _assertRowStillHolds(sheet, i + 1, 1, sessionId);
        var cur = data[i];
        sheet.getRange(i + 1, 2, 1, 6).setValues([[
          note,                          // B name
          "",                            // C initials
          _sheetSafeRoundTrip(cur[3]),   // D bw  — unchanged
          _sheetSafeRoundTrip(cur[4]),   // E ga  — unchanged
          _sheetSafeRoundTrip(cur[5]),   // F sex — unchanged
          "",                            // G dob
        ]]);
        Logger.log("PDPA erasure: " + sessionId + " by " + adminEmail);
        logAudit("pseudonymize", sessionId, adminEmail);
        return { ok: true };
      }
    }
    // Used to fall through silently and report ok — an erasure request that
    // matched nothing must say so, not claim success.
    return { error: "ไม่พบ session นี้ในระบบ — ยังไม่ได้ลบข้อมูลใด ๆ" };
  } finally {
    _bumpDataVersion();
    lock.releaseLock();
  }
}

// ── Audit_Log (PDPA Section 39 accountability) ─────────────────
// Persistent record of PDPA-relevant actions — Logger.log entries expire
// after 7 days and aren't sufficient to demonstrate compliance on request.
//
// Grid size matters, not just rows: Sheets' 10,000,000-cell workbook ceiling
// counts every cell of the grid, empty or not, and insertSheet() makes a
// 26-column grid. This tab only ever uses A–D, so a new tab is trimmed to 4
// columns on creation (2026-09-17 review, UP-B1) — at a sync-per-tab-per-4-min
// write rate the 22 empty columns were most of the workbook's cell budget.
// The LIVE tab predates this and has to be trimmed by hand (see
// sheetHealthReport for the numbers).
function getSheetAudit() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID_());
  var sh = ss.getSheetByName("Audit_Log");
  if (!sh) {
    sh = ss.insertSheet("Audit_Log");
    sh.appendRow(["ts", "action", "sessionId", "actorEmail"]);
    try {
      var extra = sh.getMaxColumns() - 4;
      if (extra > 0) sh.deleteColumns(5, extra);
    } catch (e) { Logger.log("Audit_Log column trim skipped: " + e.message); }
  }
  return sh;
}
// Every cell is escaped: sessionId and actor come from the request (a
// registerPatient sessionId of "=HYPERLINK(...)" used to land here as a live
// formula — 2026-09-17 review, SEC-B1).
function _logAuditStrict(action, sessionId, actorEmail) {
  getSheetAudit().appendRow([
    new Date().toISOString(), _sheetSafe(action), _sheetSafe(sessionId || ""), _sheetSafe(actorEmail || "")
  ]);
}
// Fail-open for reads and routine writes: an Audit_Log hiccup must not block
// a bedside save (UP-B11 is Praew's call — unchanged). Destructive actions use
// _logAuditStrict BEFORE destroying anything instead, so they cannot happen
// unrecorded.
function logAudit(action, sessionId, actorEmail) {
  try {
    _logAuditStrict(action, sessionId, actorEmail);
  } catch (e) { Logger.log("logAudit failed: " + e.message); }
}

// ── Product metric M1: weekly active users ─────────────────────
// NeoFeed had no metrics at all until 2026-08-21. The data was already here —
// Audit_Log has recorded `readRegistry` with an actor email on every
// getActivePatients since the PDPA work — so this is a READ, not new
// instrumentation. Definition and rationale: `PRD.md` § 6.
// Pinned by `test/verify-usage-metrics.cjs`.
//
// 🔴 Two rules, both enforced by that harness rather than left to good manners:
//
//  1. DISTINCT actorEmail PER WEEK, NEVER ROW COUNTS. Since `syncFromGAS`
//     started firing on tab focus, Audit_Log gains a row per user per minute.
//     A row count measures how long a tab was left open. One nurse with the
//     app open all week is ONE weekly active user.
//  2. NO EMAIL LEAVES THIS FUNCTION. Audit_Log exists for PDPA Section 39
//     accountability and holds staff email; the lawful basis for holding it is
//     accountability, not analytics. Counts only — never a per-actor
//     breakdown, not even hashed. A number that could be used to ask "why is
//     this nurse's count low" is personnel monitoring under a different legal
//     basis, and needs a conversation with the ward before it exists.

// Asia/Bangkok, which has had no DST since 1976 — a fixed offset is correct
// here, not a simplification.
var WARD_UTC_OFFSET_MIN = 7 * 60;

// ISO-8601 week key ("2026-W34") for an instant, cut in WARD-LOCAL time.
// Bucketing in UTC would file a Monday 06:00 ward round (= Sunday 23:00 UTC)
// under the previous week and quietly move part of every week into the one
// before it. Accepts a Date, an epoch number, or a string, because Sheets
// coerces a date-looking column and getValues() returns Date objects for some
// rows and strings for others *in the same column*. Returns null if unparseable.
function _isoWeekKeyLocal_(value) {
  var d;
  if (value instanceof Date) d = value;
  else if (typeof value === "number") d = new Date(value);
  else {
    var s = String(value == null ? "" : value).trim();
    if (!s) return null;
    d = new Date(s);
  }
  if (!d || isNaN(d.getTime())) return null;
  var t = new Date(d.getTime() + WARD_UTC_OFFSET_MIN * 60000);
  var dt = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  var dayNum = dt.getUTCDay() || 7;              // Mon = 1 … Sun = 7
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);   // the Thursday of this week
  var yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  var week = Math.ceil((((dt - yearStart) / 86400000) + 1) / 7);
  // The year comes off the Thursday, not the original date — that is what makes
  // 29 Dec 2025 fall in 2026-W01 rather than a 2025 week.
  return dt.getUTCFullYear() + "-W" + (week < 10 ? "0" + week : String(week));
}

// Pure: takes Audit_Log rows exactly as getDataRange().getValues() returns them
// (row 0 is the header) and returns aggregate counts. No sheet access, no I/O,
// no email in the result.
// Failed sign-ins are not use. Since 2026-09-17 (review SEC-B15) Audit_Log also
// records loginFail/lockout rows, whose actorEmail is whatever address was
// TYPED — an unknown or attacker-chosen string. Counting those would let one
// person with a wordlist inflate "weekly active users" without bound.
var NON_USAGE_AUDIT_ACTIONS = { loginFail: true, lockout: true };
function usageMetrics(rows) {
  var out = { weeks: [], totalDistinctUsers: 0, rowsScanned: 0, rowsSkipped: 0 };
  if (!rows || !rows.length) return out;

  var byWeek = {};      // weekKey -> { emails: {}, events: n }
  var allEmails = {};   // local only — never returned

  for (var i = 1; i < rows.length; i++) {
    var r = rows[i] || [];
    out.rowsScanned++;
    if (NON_USAGE_AUDIT_ACTIONS[String(r[1] == null ? "" : r[1]).trim()] === true) { out.rowsSkipped++; continue; }
    var email = String(r[3] == null ? "" : r[3]).trim().toLowerCase();
    var wk = _isoWeekKeyLocal_(r[0]);
    // A row with no actor cannot be attributed, and a row with no usable
    // timestamp cannot be placed in a week. Counted as skipped rather than
    // dropped silently, so a sheet going wrong is visible in the output.
    if (!email || !wk) { out.rowsSkipped++; continue; }
    if (!byWeek[wk]) byWeek[wk] = { emails: {}, events: 0 };
    byWeek[wk].emails[email] = true;
    byWeek[wk].events++;
    allEmails[email] = true;
  }

  var keys = Object.keys(byWeek).sort();   // "2026-W01" sorts correctly as text
  for (var k = 0; k < keys.length; k++) {
    out.weeks.push({
      week: keys[k],
      activeUsers: Object.keys(byWeek[keys[k]].emails).length,
      events: byWeek[keys[k]].events
    });
  }
  // Across the whole range, not the sum of the weekly counts — one person
  // active in four weeks is one human, not four.
  out.totalDistinctUsers = Object.keys(allEmails).length;
  return out;
}

// Thin reader. Safe to run straight from the Apps Script editor for a
// one-off number — it needs no redeploy, because it is not on the doPost path.
function getUsageMetrics() {
  return usageMetrics(getSheetAudit().getDataRange().getValues());
}

// ── Utility ───────────────────────────────────────────────────
// Defuses Google Sheets/Excel formula injection: a cell value written via
// setValue()/setValues() that *starts* with =, +, -, or @ is interpreted as
// a formula when a human opens the sheet in the Sheets UI, not stored as
// literal text. Since name/diagnosis/route/etc. below come straight from
// client-submitted JSON (not just the app's own form — anyone with a valid
// session token can POST arbitrary field values), an entry like
// `=IMPORTXML(...)` or `=HYPERLINK(...)` could exfiltrate data or phish
// whoever next opens the spreadsheet. Prefixing with an apostrophe forces
// Sheets to treat it as plain text.
//
// 🔴 RULE (2026-09-17 review, SEC-B1/SEC-B2): EVERY string this file writes to
// a sheet goes through _sheetSafe — including values it just READ back with
// getValues(). Sheets strips the protective apostrophe on read, so a value
// that was stored safely as text comes back as the bare "=IMPORTXML(...)"
// and becomes a live formula the moment it is written again unescaped. That
// second-order path was real: revisionOf (AK) is read and rewritten by the
// draft-update path, and Audit_Log wrote sessionId raw. Write-backs use
// _sheetSafeRoundTrip, which keeps numbers/booleans/Dates as they are.
function _sheetSafe(val) {
  var s = String(val == null ? "" : val);
  return /^[=+\-@\t\r]/.test(s) ? ("'" + s) : s;
}
function _sheetSafeRoundTrip(val) {
  if (val == null) return "";
  if (typeof val === "number" || typeof val === "boolean") return val;
  if (Object.prototype.toString.call(val) === "[object Date]") return val;
  return _sheetSafe(val);
}

// Lowercase hex SHA-256. Used to derive Script Property / Cache key names from
// an email (2026-09-17 review, nits): the old "replace every non-alphanumeric
// with _" mapping made a.b@x and a_b@x share one epoch and one lockout
// counter, and put the address itself in the key name.
function _sha256Hex(value) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8);
  return raw.map(function (b) { return ("0" + (b & 0xff).toString(16)).slice(-2); }).join("");
}
function _emailKeyHash(email) {
  return _sha256Hex(String(email == null ? "" : email).trim().toLowerCase());
}

// An Error doPost may show to ANY caller as-is, with a machine-readable code.
// Only messages written here are ever marked safe; everything else thrown
// before authentication is replaced by a generic message (see doPost's catch).
// Codes are the 2026-09-17 client contract: "Busy", "SchemaMismatch" —
// retryable ones also carry retryable: true.
function _codedError(message, code, retryable) {
  var err = new Error(message);
  err.neofeedSafe = true;
  err.neofeedCode = code || "";
  err.retryable = !!retryable;
  return err;
}
function _errorBody(result) {
  var out = { error: result.error };
  if (result.code) out.code = result.code;
  if (result.entryId !== undefined) out.entryId = result.entryId;
  if (result.retryable) out.retryable = true;
  return out;
}
// Numeric columns were writing entry.p/gir/bw/etc. straight from client JSON
// with just `|| 0`/`|| ""` — a non-numeric string (e.g. "=IMPORTXML(...)")
// is truthy, so it skipped that fallback and landed in the sheet unescaped.
// Coercing through Number() means anything that isn't a real number becomes
// the fallback instead of being written verbatim.
function _numSafe(val, dflt) {
  if (dflt === undefined) dflt = "";
  if (val === "" || val == null) return dflt;
  var n = Number(val);
  return isFinite(n) ? n : dflt;
}
function _parseJson(str, fallback) {
  try { if (!str) return fallback; return JSON.parse(String(str)); }
  catch (_) { return fallback; }
}
function _fmtDate(val) {
  if (!val) return "";
  if (val instanceof Date)
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
  var s = String(val);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  try { return Utilities.formatDate(new Date(s), Session.getScriptTimeZone(), "yyyy-MM-dd"); }
  catch (_) { return s; }
}
