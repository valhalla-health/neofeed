// ============================================================
// NeoFeed V2 — Google Apps Script backend
// Hybrid auth:
//   • Gmail / Google Workspace → Google Sign-In JWT (no password)
//   • Any other email           → SHA-256 password + session token
// Both paths issue a CacheService session token (12 h TTL).
// ============================================================
// Setup:
//   1. Create a Google Sheet → fill SPREADSHEET_ID below
//   2. Tabs auto-created: Patient_Registry, Daily_Log, Staff
//   3. Staff tab (A–F): email | role | name | active | password_hash | salt
//      Gmail users: leave cols E–F blank (password not used)
//      Non-Gmail:   run setInitialPassword("email","pwd") from Apps Script editor
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

var SPREADSHEET_ID = "1cZSA2qAUWAvFmpzrcjxS8kw6r-MpCMOSVAJev1uNDtI";
var CLIENT_ID      = "750019806043-imunne8ndetdesii70o3t1vnr0ta2br4.apps.googleusercontent.com";

// ── Google JWT decoder (for Gmail/Workspace Sign-In path) ────
function decodeJwtEmail(token) {
  try {
    var parts = token.split(".");
    if (parts.length !== 3) return null;
    var b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    var payload = JSON.parse(Utilities.newBlob(Utilities.base64Decode(b64)).getDataAsString());
    if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") return null;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.email || payload.email_verified !== true) return null;
    return payload.email;
  } catch (e) { return null; }
}

// ── Password hashing ──────────────────────────────────────────
function hashPwd(password, salt) {
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password + salt,
    Utilities.Charset.UTF_8
  );
  return raw.map(function(b) {
    return ("0" + (b & 0xff).toString(16)).slice(-2);
  }).join("");
}

// ── Session token ─────────────────────────────────────────────
// Generates a UUID-style token, stores {email,role,name} in ScriptCache for 12 h.
function createSession(email, role, name) {
  var token = Utilities.getUuid();
  var cache = CacheService.getScriptCache();
  cache.put("sess_" + token, JSON.stringify({ email: email, role: role, name: name }), 43200);
  return token;
}

function verifyToken(token) {
  if (!token || token.length < 10) return null;
  try {
    var cache = CacheService.getScriptCache();
    var val = cache.get("sess_" + token);
    if (!val) return null;
    cache.put("sess_" + token, val, 43200); // sliding window — reset TTL on every use
    return JSON.parse(val); // { email, role, name }
  } catch (e) { return null; }
}

// ── Staff sheet ───────────────────────────────────────────────
function getSheetStaff() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
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
  var hash = hashPwd(password, salt);
  if (found) {
    sh.getRange(found.row, 5, 1, 2).setValues([[hash, salt]]);
    Logger.log("Password updated for: " + email);
  } else {
    sh.appendRow([email, "doctor", email.split("@")[0], true, hash, salt]);
    Logger.log("Staff added with password: " + email);
  }
}

// ── Sheet accessors ───────────────────────────────────────────
function getSheetPat() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
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
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
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
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "";
  try {
    if (action === "ping") return jsonOut({ ok: true, ts: new Date().toISOString() });
    var user = verifyToken(e.parameter.token);
    if (!user) return jsonOut({ error: "Unauthorized" });
    if (action === "debug") {
      if (user.role !== "admin") return jsonOut({ error: "Forbidden" });
      var staffRows = [];
      var rows = getSheetStaff().getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        staffRows.push({ email: rows[i][0], role: rows[i][1], active: rows[i][3] });
      }
      return jsonOut({ user: user.email, staffRows: staffRows });
    }
    if (action === "getActivePatients") { logAudit("readRegistry", "", user.email); return jsonOut(getActivePatients()); }
    return jsonOut({ error: "Unknown action: " + action });
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
        email = decodeJwtEmail(body.googleToken);
        if (!email) return jsonOut({ status: "unauthorized", error: "Google token ไม่ถูกต้อง" });
        var gFound = getStaffRow(email);
        if (!gFound) return jsonOut({ status: "unauthorized", error: "ไม่พบบัญชีนี้ในระบบ" });
        var gd = gFound.data;
        if (gd[3] !== true && String(gd[3]).toUpperCase() !== "TRUE")
          return jsonOut({ status: "unauthorized", error: "บัญชีนี้ถูกระงับ" });
        role = String(gd[1] || "doctor");
        name = String(gd[2] || email);
        var tok = createSession(email, role, name);
        return jsonOut({ status: "ok", name: name, role: role, email: email, token: tok });
      }

      // Path B: email + password (non-Google accounts)
      email = (body.email || "").trim().toLowerCase();
      var password = body.password || "";
      if (!email || !password) return jsonOut({ status: "unauthorized", error: "กรุณากรอก email และรหัสผ่าน" });

      // Brute-force protection: lock after 5 failed attempts
      var failKey = "fail_" + email.replace(/[^a-z0-9]/g, "_");
      var props = PropertiesService.getScriptProperties();
      var fails = parseInt(props.getProperty(failKey) || "0");
      if (fails >= 5) return jsonOut({ status: "unauthorized", error: "ลองใหม่ในอีกสักครู่ — login ผิดพลาดหลายครั้ง" });

      var found = getStaffRow(email);
      if (!found) { props.setProperty(failKey, String(fails + 1)); return jsonOut({ status: "unauthorized", error: "ไม่พบบัญชีนี้ในระบบ" }); }

      var d = found.data;
      if (d[3] !== true && String(d[3]).toUpperCase() !== "TRUE")
        return jsonOut({ status: "unauthorized", error: "บัญชีนี้ถูกระงับ" });

      var storedHash = String(d[4] || "");
      var salt       = String(d[5] || "");
      if (!storedHash) return jsonOut({ status: "unauthorized", error: "ยังไม่ได้ตั้งรหัสผ่าน — แจ้ง admin" });
      if (hashPwd(password, salt) !== storedHash) {
        props.setProperty(failKey, String(fails + 1));
        return jsonOut({ status: "unauthorized", error: "รหัสผ่านไม่ถูกต้อง" });
      }

      props.deleteProperty(failKey); // reset on success
      role = String(d[1] || "doctor");
      name = String(d[2] || email);
      var token = createSession(email, role, name);
      return jsonOut({ status: "ok", name: name, role: role, email: email, token: token });
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
      var sf = getStaffRow(user.email);
      if (!sf) return jsonOut({ error: "ไม่พบบัญชี" });
      var sd = sf.data;
      if (!sd[4]) return jsonOut({ error: "บัญชี Google ไม่ใช้รหัสผ่านในระบบนี้" });
      if (hashPwd(oldPwd, String(sd[5] || "")) !== String(sd[4] || "")) {
        return jsonOut({ error: "รหัสผ่านเดิมไม่ถูกต้อง" });
      }
      var newSalt = Utilities.getUuid();
      var newHash = hashPwd(newPwd, newSalt);
      getSheetStaff().getRange(sf.row, 5, 1, 2).setValues([[newHash, newSalt]]);
      return jsonOut({ ok: true });
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
    entry.ts         || new Date().toISOString().slice(0, 10),
    sessionId,
    entry.dol        || "", entry.weight   || "", entry.fluid    || "",
    entry.gir        || "", entry.pro      || "", entry.kcal     || "",
    entry.na         || "", entry.k        || "", entry.ca       || "",
    entry.p          || "", entry.enVolPerKg || "", entry.route  || "",
    entry.status     || "submitted", submittedBy || "",
    entry.suppMTV    || 0, entry.suppVitD_IU || 0,
    entry.suppCa_mg  || 0, entry.suppCaType  || "",
    entry.suppPO4_mmol || 0, entry.suppPO4Type || "",
    entry.suppFe_mg  || 0, entry.suppFeType  || "",
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
        .concat([JSON.stringify(entry.calcInput || {}), entryId, newLastModified, editedBy || ""]);
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
    p.sessionId, p.name || "", p.initials || "",
    p.bw || 0, p.ga || 0, p.sex || "boys",
    p.dob || "", p.admissionDate || "", p.twinSuffix || "",
    p.status || "Active", p.currentBed || "", p.diagnosis || "",
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
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
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
