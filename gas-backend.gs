// ============================================================
// NeoFeed V2 — Google Apps Script backend
// Hybrid auth:
//   • Gmail / Google Workspace → Google Sign-In JWT (no password)
//   • Any other email           → SHA-256 password + session token
// Both paths issue a CacheService session token (6 h TTL — the max
// CacheService.put() allows; see SESSION_TTL_SECONDS below).
// ============================================================
// Setup:
//   1. Create a Google Sheet, create/find the OAuth Client ID for Google
//      Sign-In, then run setConfig("<spreadsheetId>", "<clientId>") once
//      from the Apps Script editor — this writes both into Script
//      Properties instead of hardcoding them in source (see "Config" below).
//   2. Tabs auto-created: Patient_Registry, Daily_Log, Staff
//   3. Staff tab (A–F): email | role | name | active | password_hash | salt
//      Gmail users: leave cols E–F blank (password not used)
//      Non-Gmail:   leave cols E–F blank when adding the row — the onEdit
//        trigger below (autoProvisionStaffPassword) fills in a default
//        password (DEFAULT_NEW_USER_PASSWORD) automatically as soon as the
//        row is saved. Staff change it themselves afterward via the app's
//        "เปลี่ยนรหัสผ่าน" menu. To set a specific password instead, run
//        setInitialPassword("email","pwd") from the Apps Script editor.
//   4. Deploy → Web app · Execute as: Me · Access: Anyone
//   5. Copy URL → NeoFeed.html window.NEOFEED_GAS_URL
//
// Patient_Registry (A–P): sessionId|name|initials|bw|ga|sex|dob|admissionDate|
//   twinSuffix|status|currentBed|diagnosis|weights|lengths|hcs|bedHistory
// Daily_Log (A–AB): ts|sessionId|dol|weight|fluid|gir|pro|kcal|na|k|ca|p|
//   enVolPerKg|route|status|submittedBy|suppMTV..suppFeType|
//   calcInputJson|entryId|lastModified|lastModifiedBy
//   (calcInputJson = raw Calculator inputs, JSON — lets an entry be reopened
//   and edited exactly as entered, from any device, not just the one that
//   created it. entryId is the stable key updateDailyNutrition() matches on;
//   lastModified/lastModifiedBy back the optimistic-concurrency check there.)
// Staff (A–F): email | role | name | active | password_hash | salt
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
  try {
    var resp = UrlFetchApp.fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken),
      { muteHttpExceptions: true }
    );
    var code = resp.getResponseCode();
    if (code !== 200) return { email: null, reason: "tokeninfo returned HTTP " + code + ": " + resp.getContentText() };
    var payload = JSON.parse(resp.getContentText());
    if (payload.aud !== clientId) return { email: null, reason: "aud mismatch: token aud=" + payload.aud + " expected=" + clientId };
    if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") return { email: null, reason: "bad iss: " + payload.iss };
    if (payload.email_verified !== "true" && payload.email_verified !== true) return { email: null, reason: "email not verified" };
    if (!payload.email) return { email: null, reason: "no email in payload" };
    return { email: payload.email, reason: null };
  } catch (e) { return { email: null, reason: "exception: " + e.message }; }
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
function _lockoutStatus(key) {
  var props = PropertiesService.getScriptProperties();
  var raw = (props.getProperty(key) || "0:0").split(":");
  var fails = parseInt(raw[0]) || 0;
  var failAt = parseInt(raw[1]) || 0;
  var locked = fails >= 5 && (Date.now() - failAt) < LOCKOUT_MS;
  if (fails >= 5 && !locked) fails = 0; // cooldown elapsed — fresh start
  return { fails: fails, locked: locked };
}
function _recordFailure(key, fails) {
  PropertiesService.getScriptProperties().setProperty(key, (fails + 1) + ":" + Date.now());
}
function _clearLockout(key) {
  PropertiesService.getScriptProperties().deleteProperty(key);
}

// ── Session epoch ────────────────────────────────────────────
// A per-user counter (in ScriptProperties, so it survives past the cache's
// 6h TTL) embedded into every token issued for that user. Bumping it
// (on password change) makes every previously-issued token for that user
// fail verifyToken() immediately, even though the token itself is still
// sitting unexpired in the cache — this is how we revoke sessions we can't
// otherwise enumerate (CacheService has no "list keys for user" op).
function _epochKey(email) {
  return "epoch_" + String(email).trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
}
function getUserEpoch(email) {
  return PropertiesService.getScriptProperties().getProperty(_epochKey(email)) || "0";
}
function bumpUserEpoch(email) {
  var props = PropertiesService.getScriptProperties();
  var key = _epochKey(email);
  var next = String((parseInt(props.getProperty(key) || "0", 10) || 0) + 1);
  props.setProperty(key, next);
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
function createSession(email, role, name) {
  var token = Utilities.getUuid();
  var cache = CacheService.getScriptCache();
  cache.put("sess_" + token, JSON.stringify({ email: email, role: role, name: name, epoch: getUserEpoch(email) }), SESSION_TTL_SECONDS);
  return token;
}

function verifyToken(token) {
  if (!token || token.length < 10) return null;
  try {
    var cache = CacheService.getScriptCache();
    var val = cache.get("sess_" + token);
    if (!val) return null;
    var parsed = JSON.parse(val); // { email, role, name, epoch }
    if (String(parsed.epoch || "0") !== getUserEpoch(parsed.email)) {
      cache.remove("sess_" + token); // stale — password changed since this token was issued
      return null;
    }
    cache.put("sess_" + token, val, SESSION_TTL_SECONDS); // sliding window — reset TTL on every use
    return parsed;
  } catch (e) { return null; }
}

// ── Staff sheet ───────────────────────────────────────────────
function getSheetStaff() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID_());
  var sh = ss.getSheetByName("Staff");
  if (!sh) {
    sh = ss.insertSheet("Staff");
    sh.appendRow(["email", "role", "name", "active", "password_hash", "salt"]);
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
  if (found) {
    sh.getRange(found.row, 5, 1, 2).setValues([[hash, salt]]);
    Logger.log("Password updated for: " + email);
  } else {
    sh.appendRow([email, "doctor", email.split("@")[0], true, hash, salt]);
    Logger.log("Staff added with password: " + email);
  }
}

// ── clearStaffPassword — run from Apps Script editor ──────────
// Usage: clearStaffPassword("user@chula.ac.th")
// Clears password_hash/salt (cols E-F) back to blank — for an account that
// signs in via Google/Workspace and shouldn't have a password fallback, but
// picked one up anyway (e.g. via backfillDefaultPasswords, which can't tell
// "Workspace-enabled custom domain" apart from "non-Gmail, needs a password"
// — both just look like "not @gmail.com").
function clearStaffPassword(email) {
  var found = getStaffRow(email);
  if (!found) { Logger.log("No Staff row found for: " + email); return; }
  getSheetStaff().getRange(found.row, 5, 1, 2).clearContent();
  Logger.log("Cleared password for: " + email);
}

// ── autoProvisionStaffPassword — simple onEdit trigger ─────────
// 2026-07-18: pasting a batch of new non-Gmail staff rows straight into the
// Staff tab (the normal workflow) left them with blank password_hash/salt —
// setInitialPassword() was documented as a required manual follow-up step
// per email, easy to forget, and 10 accounts silently couldn't log in until
// it was run by hand. This trigger does that step automatically: the moment
// a non-Gmail row is saved with an email but no password_hash yet, it
// backfills a default password so the account is usable immediately. Gmail
// rows (no password by design) and rows that already have a hash are left
// alone — this only ever fills a blank, never overwrites a real password a
// user has since set for themselves via "เปลี่ยนรหัสผ่าน".
//
// `onEdit` is a *simple* trigger (the reserved name is enough — no manual
// trigger installation needed), which runs under restricted authorization.
// That's sufficient here since it only touches the spreadsheet it's bound to
// via SpreadsheetApp/Utilities; it does not need Script Properties, email,
// or UrlFetchApp. It fires only for edits made directly in the Sheets UI
// (typing or pasting), not for edits made via the Sheets API or another
// script — which covers the normal way staff rows get added.
var DEFAULT_NEW_USER_PASSWORD = "nicunicu";

// Domains that authenticate via Google Sign-In despite not being gmail.com —
// e.g. Google Workspace on a custom domain. These never get a password_hash,
// same as gmail.com. 2026-07-18: peeraporn.po@chula.ac.th picked up a
// default password from backfillDefaultPasswords because "not @gmail.com"
// isn't the same test as "doesn't use Google Sign-In" — chula.ac.th is
// Workspace-enabled. Add a domain here (lowercase, no @) if the same
// happens for another one; use clearStaffPassword(email) to undo it for an
// account that already got one.
var GOOGLE_WORKSPACE_DOMAINS = ["chula.ac.th"];
function _usesGoogleSignIn(email) {
  var domain = String(email).toLowerCase().split("@")[1] || "";
  return domain === "gmail.com" || GOOGLE_WORKSPACE_DOMAINS.indexOf(domain) !== -1;
}

function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    if (sheet.getName() !== "Staff") return;

    var firstRow = e.range.getRow();
    var startRow = Math.max(firstRow, 2); // skip the header row
    var lastRow  = firstRow + e.range.getNumRows() - 1;
    if (startRow > lastRow) return;

    for (var r = startRow; r <= lastRow; r++) {
      var row = sheet.getRange(r, 1, 1, 6).getValues()[0]; // A–F
      var email        = String(row[0] || "").trim();
      var active       = row[3];
      var existingHash = String(row[4] || "");
      if (!email) continue;
      if (_usesGoogleSignIn(email)) continue; // Google Sign-In — no password
      if (existingHash) continue; // already has a password — never overwrite
      if (active !== true && String(active).toUpperCase() !== "TRUE") continue; // row not active yet

      var salt = Utilities.getUuid();
      var hash = hashPwdV2(DEFAULT_NEW_USER_PASSWORD, salt);
      sheet.getRange(r, 5, 1, 2).setValues([[hash, salt]]);
      Logger.log("Auto-provisioned default password for: " + email);
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
// safe to re-run.
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

    var salt = Utilities.getUuid();
    var hash = hashPwdV2(DEFAULT_NEW_USER_PASSWORD, salt);
    sheet.getRange(i + 1, 5, 1, 2).setValues([[hash, salt]]);
    fixed.push(email);
  }
  Logger.log("Backfilled default password for " + fixed.length + " account(s): " + fixed.join(", "));
  return fixed;
}

// ── Sheet accessors ───────────────────────────────────────────
function getSheetPat() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID_());
  var sh = ss.getSheetByName("Patient_Registry");
  if (!sh) {
    sh = ss.insertSheet("Patient_Registry");
    sh.appendRow([
      "sessionId","name","initials","bw","ga","sex",
      "dob","admissionDate","twinSuffix","status",
      "currentBed","diagnosis","weights","lengths","hcs","bedHistory"
    ]);
  }
  return sh;
}
function getSheetLog() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID_());
  var sh = ss.getSheetByName("Daily_Log");
  if (!sh) {
    sh = ss.insertSheet("Daily_Log");
    sh.appendRow([
      "ts","sessionId","dol","weight","fluid","gir",
      "pro","kcal","na","k","ca","p","enVolPerKg","route","status","submittedBy",
      "suppMTV","suppVitD_IU","suppCa_mg","suppCaType",
      "suppPO4_mmol","suppPO4Type","suppFe_mg","suppFeType",
      "calcInputJson","entryId","lastModified","lastModifiedBy"
    ]);
  }
  return sh;
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
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action || "";

    // ── logout ────────────────────────────────────────────────
    if (action === "logout") {
      var logoutToken = body.token || "";
      if (logoutToken) CacheService.getScriptCache().remove("sess_" + logoutToken);
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
          // whoever's debugging isn't sent chasing the wrong thing.
          return jsonOut({ status: "error", error: "ระบบยังไม่ได้ตั้งค่า (server config): " + cfgErr.message });
        }
        email = gVerify.email;
        if (!email) return jsonOut({ status: "unauthorized", error: "Google token ไม่ถูกต้อง (" + gVerify.reason + ")" });
        var gFound = getStaffRow(email);
        if (!gFound) return jsonOut({ status: "unauthorized", error: "ไม่พบบัญชีนี้ในระบบ" });
        var gd = gFound.data;
        if (gd[3] !== true && String(gd[3]).toUpperCase() !== "TRUE")
          return jsonOut({ status: "unauthorized", error: "บัญชีนี้ถูกระงับ" });
        role = String(gd[1] || "doctor");
        name = String(gd[2] || email);
        var tok = createSession(email, role, name);
        return jsonOut({ status: "ok", name: name, role: role, email: email, token: tok, authMethod: "google" });
      }

      // Path B: email + password (non-Google accounts)
      email = (body.email || "").trim().toLowerCase();
      var password = body.password || "";
      if (!email || !password) return jsonOut({ status: "unauthorized", error: "กรุณากรอก email และรหัสผ่าน" });

      var failKey = "fail_" + email.replace(/[^a-z0-9]/g, "_");
      var lockState = _lockoutStatus(failKey);
      if (lockState.locked) {
        return jsonOut({ status: "unauthorized", error: "ลองใหม่ในอีก 15 นาที — login ผิดพลาดหลายครั้ง" });
      }
      var fails = lockState.fails;

      var found = getStaffRow(email);
      if (!found) { _recordFailure(failKey, fails); return jsonOut({ status: "unauthorized", error: "ไม่พบบัญชีนี้ในระบบ" }); }

      var d = found.data;
      if (d[3] !== true && String(d[3]).toUpperCase() !== "TRUE")
        return jsonOut({ status: "unauthorized", error: "บัญชีนี้ถูกระงับ" });

      var storedHash = String(d[4] || "");
      var salt       = String(d[5] || "");
      if (!storedHash) return jsonOut({ status: "unauthorized", error: "ยังไม่ได้ตั้งรหัสผ่าน — แจ้ง admin" });
      var pwCheck = verifyPwd(password, salt, storedHash);
      if (!pwCheck.ok) {
        _recordFailure(failKey, fails);
        return jsonOut({ status: "unauthorized", error: "รหัสผ่านไม่ถูกต้อง" });
      }
      if (pwCheck.legacy) {
        // Transparent upgrade: user just proved they know the password, so
        // this is a safe moment to replace the weak v1 hash with v2.
        getSheetStaff().getRange(found.row, 5).setValue(hashPwdV2(password, salt));
      }

      _clearLockout(failKey); // reset on success
      role = String(d[1] || "doctor");
      name = String(d[2] || email);
      var token = createSession(email, role, name);
      return jsonOut({ status: "ok", name: name, role: role, email: email, token: token, authMethod: "password" });
    }

    // ── all other actions require valid session token ──────────
    var user = verifyToken(body.token);
    if (!user) return jsonOut({ error: "Unauthorized" });

    if (action === "getActivePatients") { logAudit("readRegistry", "", user.email); return jsonOut(getActivePatients()); }

    var canWrite = user.role === "doctor" || user.role === "admin" || user.role === "nurse";

    if (action === "logDailyNutrition") {
      if (!canWrite) return jsonOut({ error: "Forbidden" });
      var logResult = logDailyNutrition(body.sessionId, body.entry, user.email);
      return jsonOut({ ok: true, entryId: logResult.entryId, lastModified: logResult.lastModified });
    }
    if (action === "updateDailyNutrition") {
      if (!canWrite) return jsonOut({ error: "Forbidden" });
      var updResult = updateDailyNutrition(body.sessionId, body.entryId, body.expectedLastModified, body.entry, user.email);
      if (updResult.error) return jsonOut({ error: updResult.error });
      if (updResult.conflict) return jsonOut({ conflict: true, current: updResult.current });
      return jsonOut({ ok: true, lastModified: updResult.lastModified });
    }
    if (action === "registerPatient" || action === "updatePatient") {
      if (!canWrite) return jsonOut({ error: "Forbidden" });
      registerPatient(body.patient);
      return jsonOut({ ok: true });
    }
    if (action === "updateWeights") {
      if (!canWrite) return jsonOut({ error: "Forbidden" });
      updateWeights(body.sessionId, body.weights);
      return jsonOut({ ok: true });
    }
    if (action === "changePassword") {
      var oldPwd = body.oldPassword || "";
      var newPwd = body.newPassword || "";
      if (!newPwd || newPwd.length < 6) return jsonOut({ error: "รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร" });
      // Same brute-force lockout as login — a valid session token (leaked, or
      // sitting unlocked on a shared NICU workstation) shouldn't let someone
      // guess the account's real password via unlimited oldPassword attempts.
      var pwdChgKey = "pwdchg_fail_" + String(user.email || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
      var pwdChgLock = _lockoutStatus(pwdChgKey);
      if (pwdChgLock.locked) {
        return jsonOut({ error: "ลองใหม่ในอีก 15 นาที — กรอกรหัสผ่านเดิมผิดหลายครั้ง" });
      }
      var sf = getStaffRow(user.email);
      if (!sf) return jsonOut({ error: "ไม่พบบัญชี" });
      var sd = sf.data;
      if (!sd[4]) return jsonOut({ error: "บัญชี Google ไม่ใช้รหัสผ่านในระบบนี้" });
      if (!verifyPwd(oldPwd, String(sd[5] || ""), String(sd[4] || "")).ok) {
        _recordFailure(pwdChgKey, pwdChgLock.fails);
        return jsonOut({ error: "รหัสผ่านเดิมไม่ถูกต้อง" });
      }
      _clearLockout(pwdChgKey);
      var newSalt = Utilities.getUuid();
      var newHash = hashPwdV2(newPwd, newSalt);
      getSheetStaff().getRange(sf.row, 5, 1, 2).setValues([[newHash, newSalt]]);
      // Bump the session epoch so every OTHER token issued for this user
      // (e.g. one that leaked, or is sitting on a shared NICU workstation)
      // is invalidated immediately — verifyToken() checks epoch on every
      // call. Re-issue a fresh token so *this* device stays logged in.
      bumpUserEpoch(user.email);
      var rotatedToken = createSession(user.email, user.role, user.name);
      return jsonOut({ ok: true, token: rotatedToken });
    }
    if (action === "pseudonymizePatient") {
      if (user.role !== "admin") return jsonOut({ error: "Forbidden" });
      pseudonymizePatient(body.sessionId, user.email);
      return jsonOut({ ok: true });
    }
    if (action === "deleteDailyNutrition") {
      if (user.role !== "admin") return jsonOut({ error: "Forbidden" });
      var delResult = deleteDailyNutrition(body.sessionId, body.entryId);
      if (delResult.error) return jsonOut({ error: delResult.error });
      logAudit("deleteDailyLog", body.sessionId, user.email);
      return jsonOut({ ok: true });
    }

    return jsonOut({ error: "Unknown action: " + action });
  } catch (err) { return jsonOut({ error: err.message }); }
}

// ── getActivePatients ─────────────────────────────────────────
function getActivePatients() {
  var sheetPat = getSheetPat();
  var sheetLog = getSheetLog();
  var patData = sheetPat.getLastRow() > 0 ? sheetPat.getDataRange().getValues() : [[]];
  var logData = sheetLog.getLastRow() > 0 ? sheetLog.getDataRange().getValues() : [[]];

  var logMap = {};
  for (var i = 1; i < logData.length; i++) {
    var row = logData[i];
    var sid = String(row[1] || "");
    if (!sid) continue;
    if (!logMap[sid]) logMap[sid] = [];
    logMap[sid].push({
      ts:         String(row[0]  || ""),
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
    });
  }

  var patients = [];
  for (var j = 1; j < patData.length; j++) {
    var p = patData[j];
    var sessionId = String(p[0] || "");
    if (!sessionId) continue;
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
    });
  }
  return { patients: patients, log: logMap, ts: new Date().toISOString() };
}

// ── Daily_Log row builder — columns shared by create + update ─
// Returns the first 24 columns (A–X); caller appends calcInputJson/entryId/
// lastModified/lastModifiedBy (Y–AB) since those differ between create/update.
function _buildLogRow(sessionId, entry, submittedBy) {
  return [
    _sheetSafe(entry.ts || new Date().toISOString().slice(0, 10)),
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

// ── logDailyNutrition (create) ─────────────────────────────────
function logDailyNutrition(sessionId, entry, submittedBy) {
  var entryId = Utilities.getUuid();
  var lastModified = new Date().toISOString();
  var row = _buildLogRow(sessionId, entry, submittedBy)
    .concat([JSON.stringify(entry.calcInput || {}), entryId, lastModified, submittedBy || ""]);
  getSheetLog().appendRow(row);
  return { entryId: entryId, lastModified: lastModified };
}

// ── updateDailyNutrition (optimistic-locked update by entryId) ─
// Rejects the write (rather than overwriting) if the row's lastModified has
// moved on since the client last fetched it — a concurrent edit from another
// device. submittedBy (col 16, the original creator) is preserved as-is;
// only lastModified/lastModifiedBy (col 27/28) track the editor.
function updateDailyNutrition(sessionId, entryId, expectedLastModified, entry, editedBy) {
  if (!entryId) return { error: "entryId is required" };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheetLog();
    var data  = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][25]) !== String(entryId)) continue;
      if (String(data[i][1]) !== String(sessionId)) return { error: "Entry does not belong to this patient" };

      var currentLastModified = String(data[i][26] || "");
      if (currentLastModified !== String(expectedLastModified || "")) {
        return { conflict: true, current: {
          lastModified: currentLastModified,
          lastModifiedBy: String(data[i][27] || ""),
        } };
      }

      var originalSubmittedBy = String(data[i][15] || editedBy || "");
      var newLastModified = new Date().toISOString();
      var row = _buildLogRow(sessionId, entry, originalSubmittedBy)
        .concat([JSON.stringify(entry.calcInput || {}), entryId, newLastModified, _sheetSafe(editedBy || "")]);
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      return { ok: true, lastModified: newLastModified };
    }
    return { error: "ไม่พบข้อมูลที่ต้องการแก้ไข — อาจถูกลบไปแล้ว" };
  } finally {
    lock.releaseLock();
  }
}

// ── deleteDailyNutrition (admin-only, permanent) ────────────────
// Used to remove erroneous/test rows (e.g. a mock entry saved by mistake).
// Not exposed to doctor/nurse roles — clinical history should normally be
// corrected via updateDailyNutrition, not removed.
function deleteDailyNutrition(sessionId, entryId) {
  if (!entryId) return { error: "entryId is required" };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheetLog();
    var data  = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][25]) !== String(entryId)) continue;
      if (String(data[i][1]) !== String(sessionId)) return { error: "Entry does not belong to this patient" };
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
    return { error: "ไม่พบข้อมูลที่ต้องการลบ — อาจถูกลบไปแล้ว" };
  } finally {
    lock.releaseLock();
  }
}

// ── backfillLegacyEntryIds — run once from Apps Script editor ─
// Pre-migration Daily_Log rows predate the entryId/lastModified/
// lastModifiedBy columns (Z/AA/AB) and are left blank there, which makes
// the frontend treat them as read-only (see log.jsx: editable requires a
// truthy entryId). This assigns each such row a stable entryId (and a
// lastModified stamp if it doesn't already have one) so it becomes
// editable like any normal entry. Already-migrated rows are untouched;
// safe to re-run — it only ever fills in blanks, never overwrites.
function backfillLegacyEntryIds() {
  var sheet = getSheetLog();
  var data  = sheet.getDataRange().getValues();
  var fixed = 0;
  for (var i = 1; i < data.length; i++) {
    var sessionId = String(data[i][1] || "");
    if (!sessionId) continue; // blank trailing row
    var entryId = String(data[i][25] || "");
    if (entryId) continue; // already migrated
    var newEntryId    = Utilities.getUuid();
    var lastModified  = String(data[i][26] || "") || new Date().toISOString();
    sheet.getRange(i + 1, 26, 1, 2).setValues([[newEntryId, lastModified]]);
    fixed++;
  }
  Logger.log("Backfilled entryId for " + fixed + " legacy row(s).");
  return fixed;
}

// ── registerPatient (upsert) ──────────────────────────────────
function registerPatient(p) {
  var sheet = getSheetPat();
  var data  = sheet.getDataRange().getValues();
  var row16 = [
    _sheetSafe(p.sessionId), _sheetSafe(p.name || ""), _sheetSafe(p.initials || ""),
    _numSafe(p.bw, 0), _numSafe(p.ga, 0), _sheetSafe(p.sex || "boys"),
    _sheetSafe(p.dob || ""), _sheetSafe(p.admissionDate || ""), _sheetSafe(p.twinSuffix || ""),
    _sheetSafe(p.status || "Active"), _sheetSafe(p.currentBed || ""), _sheetSafe(p.diagnosis || ""),
    JSON.stringify(p.weights    || []),
    JSON.stringify(p.lengths    || []),
    JSON.stringify(p.hcs        || []),
    JSON.stringify(p.bedHistory || []),
  ];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(p.sessionId)) {
      sheet.getRange(i + 1, 1, 1, 16).setValues([row16]);
      return;
    }
  }
  sheet.appendRow(row16);
}

// ── updateWeights ─────────────────────────────────────────────
function updateWeights(sessionId, weights) {
  var sheet = getSheetPat();
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(sessionId)) {
      sheet.getRange(i + 1, 13).setValue(JSON.stringify(weights));
      return;
    }
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
function pseudonymizePatient(sessionId, adminEmail) {
  var sheet = getSheetPat();
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(sessionId)) {
      var note = "[PDPA-erased " + new Date().toISOString().slice(0, 10) + "]";
      sheet.getRange(i + 1, 2).setValue(note); // name
      sheet.getRange(i + 1, 3).setValue("");   // initials
      sheet.getRange(i + 1, 7).setValue("");   // dob
      Logger.log("PDPA erasure: " + sessionId + " by " + adminEmail);
      logAudit("pseudonymize", sessionId, adminEmail);
      return;
    }
  }
}

// ── Audit_Log (PDPA Section 39 accountability) ─────────────────
// Persistent record of PDPA-relevant actions — Logger.log entries expire
// after 7 days and aren't sufficient to demonstrate compliance on request.
function getSheetAudit() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID_());
  var sh = ss.getSheetByName("Audit_Log");
  if (!sh) {
    sh = ss.insertSheet("Audit_Log");
    sh.appendRow(["ts", "action", "sessionId", "actorEmail"]);
  }
  return sh;
}
function logAudit(action, sessionId, actorEmail) {
  try {
    getSheetAudit().appendRow([new Date().toISOString(), action, sessionId || "", actorEmail || ""]);
  } catch (e) { Logger.log("logAudit failed: " + e.message); }
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
function _sheetSafe(val) {
  var s = String(val == null ? "" : val);
  return /^[=+\-@\t\r]/.test(s) ? ("'" + s) : s;
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
