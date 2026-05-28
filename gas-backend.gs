// ============================================================
// NeoFeed V2 — Google Apps Script backend
// Email + password auth (SHA-256 + session token via CacheService)
// ============================================================
// Setup:
//   1. Create a Google Sheet → fill SPREADSHEET_ID below
//   2. Tabs auto-created: Patient_Registry, Daily_Log, Staff
//   3. Staff tab (A–F): email | role | name | active | password_hash | salt
//   4. To add first user, run setInitialPassword("email","password") from
//      Apps Script editor (⌘+Enter) — or use the bootstrap action below
//   5. Deploy → Web app · Execute as: Me · Access: Anyone
//   6. Copy URL → NeoFeed.html window.NEOFEED_GAS_URL
//
// Patient_Registry (A–P): sessionId|name|initials|bw|ga|sex|dob|admissionDate|
//   twinSuffix|status|currentBed|diagnosis|weights|lengths|hcs|bedHistory
// Daily_Log (A–X): ts|sessionId|dol|weight|fluid|gir|pro|kcal|na|k|ca|p|
//   enVolPerKg|route|status|submittedBy|suppMTV|suppVitD_IU|suppCa_mg|suppCaType|
//   suppPO4_mmol|suppPO4Type|suppFe_mg|suppFeType
// Staff (A–F): email | role | name | active | password_hash | salt
//
// PDPA lawful basis: Section 26(6) medical necessity + professional confidentiality
// ============================================================

var SPREADSHEET_ID = "1cZSA2qAUWAvFmpzrcjxS8kw6r-MpCMOSVAJev1uNDtI";

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
      "suppPO4_mmol","suppPO4Type","suppFe_mg","suppFeType"
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
    if (action === "getActivePatients") return jsonOut(getActivePatients());
    return jsonOut({ error: "Unknown action: " + action });
  } catch (err) { return jsonOut({ error: err.message }); }
}

// ── POST handler ──────────────────────────────────────────────
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action || "";

    // ── login ─────────────────────────────────────────────────
    if (action === "login") {
      var email = (body.email || "").trim().toLowerCase();
      var password = body.password || "";
      if (!email || !password) return jsonOut({ status: "unauthorized", error: "กรุณากรอก email และรหัสผ่าน" });

      var found = getStaffRow(email);
      if (!found) return jsonOut({ status: "unauthorized", error: "ไม่พบบัญชีนี้ในระบบ" });

      var d = found.data;
      var active = d[3];
      if (active !== true && String(active).toUpperCase() !== "TRUE") {
        return jsonOut({ status: "unauthorized", error: "บัญชีนี้ถูกระงับ" });
      }

      var storedHash = String(d[4] || "");
      var salt       = String(d[5] || "");
      if (!storedHash) return jsonOut({ status: "unauthorized", error: "ยังไม่ได้ตั้งรหัสผ่าน — แจ้ง admin" });

      if (hashPwd(password, salt) !== storedHash) {
        return jsonOut({ status: "unauthorized", error: "รหัสผ่านไม่ถูกต้อง" });
      }

      var role = String(d[1] || "doctor");
      var name = String(d[2] || email);
      var token = createSession(email, role, name);
      return jsonOut({ status: "ok", name: name, role: role, email: email, token: token });
    }

    // ── all other actions require valid session token ──────────
    var user = verifyToken(body.token);
    if (!user) return jsonOut({ error: "Unauthorized" });

    if (action === "getActivePatients") return jsonOut(getActivePatients());

    var canWrite = user.role === "doctor" || user.role === "admin";

    if (action === "logDailyNutrition") {
      if (!canWrite) return jsonOut({ error: "Forbidden" });
      logDailyNutrition(body.sessionId, body.entry, user.email);
      return jsonOut({ ok: true });
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

// ── logDailyNutrition ─────────────────────────────────────────
function logDailyNutrition(sessionId, entry, submittedBy) {
  getSheetLog().appendRow([
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
  ]);
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

// ── pseudonymizePatient (PDPA Section 33) ─────────────────────
function pseudonymizePatient(sessionId, adminEmail) {
  var sheet = getSheetPat();
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(sessionId)) {
      var note = "[PDPA-erased " + new Date().toISOString().slice(0, 10) + "]";
      sheet.getRange(i + 1, 2).setValue(note);
      sheet.getRange(i + 1, 3).setValue("");
      Logger.log("PDPA erasure: " + sessionId + " by " + adminEmail);
      return;
    }
  }
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
