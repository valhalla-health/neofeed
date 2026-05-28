// ============================================================
// NeoFeed V2 — Google Apps Script backend
// ============================================================
// Setup:
//   1. Create a Google Sheet → fill SPREADSHEET_ID below
//   2. Tabs auto-created on first use: Patient_Registry, Daily_Log, Staff
//   3. Staff tab (A–D): email | role (doctor/admin) | name | active (TRUE/FALSE)
//      → Add yourself manually first; auto-registration is DISABLED (PDPA)
//   4. GCP: create OAuth 2.0 Client ID → paste in NeoFeed.html window.NEOFEED_CLIENT_ID
//   5. Deploy → New deployment → Web app
//      Execute as: Me · Who has access: Anyone
//   6. Copy URL → paste in NeoFeed.html window.NEOFEED_GAS_URL
//
// Patient_Registry (A–P): sessionId|name|initials|bw|ga|sex|dob|admissionDate|
//   twinSuffix|status|currentBed|diagnosis|weights(JSON)|lengths(JSON)|hcs(JSON)|bedHistory(JSON)
// Daily_Log (A–X): ts|sessionId|dol|weight|fluid|gir|pro|kcal|na|k|ca|p|enVolPerKg|route|status|submittedBy|
//   suppMTV|suppVitD_IU|suppCa_mg|suppCaType|suppPO4_mmol|suppPO4Type|suppFe_mg|suppFeType
// Staff (A–D): email | role | name | active
//
// PDPA (พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562) lawful basis:
//   Health data processed under Section 26(6) — medical necessity + professional confidentiality
//   Staff emails stored for audit under Section 24(2) — contractual necessity
//   Data erasure: use action=pseudonymizePatient to comply with Section 33
// ============================================================

var SPREADSHEET_ID = "1cZSA2qAUWAvFmpzrcjxS8kw6r-MpCMOSVAJev1uNDtI";
var CLIENT_ID      = "750019806043-imunne8ndetdesii70a3t1vnr0ta2br4.apps.googleusercontent.com";

// ── Staff sheet accessor ──────────────────────────────────────
function getSheetStaff() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName("Staff");
  if (!sh) {
    sh = ss.insertSheet("Staff");
    sh.appendRow(["email", "role", "name", "active"]);
    // No auto-seed here — admin must add first user manually (PDPA: controlled access)
  }
  return sh;
}

// ── JWT decoder — local base64url decode, no network call ────
// Does NOT verify cryptographic signature; relies on staff whitelist for authz.
// Checks issuer, expiry, and email_verified only.
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

// ── Staff whitelist check ─────────────────────────────────────
// Returns { email, name, role } only if email is in Staff sheet + active=TRUE.
// Unknown users are REJECTED — no auto-registration (PDPA compliance).
function verifyToken(token) {
  if (!token) return null;
  try {
    var email = decodeJwtEmail(token);
    if (!email) return null;
    var sh = getSheetStaff();
    var rows = sh.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim().toLowerCase() === email.trim().toLowerCase()) {
        var active = rows[i][3];
        if (active !== true && String(active).toUpperCase() !== "TRUE") return null;
        return { email: email, role: String(rows[i][1] || "doctor"), name: String(rows[i][2] || email) };
      }
    }
    // Unknown user — reject. Add email to Staff sheet manually to grant access.
    Logger.log("Access denied for unknown user: " + email);
    return null;
  } catch (e) { Logger.log("verifyToken error: " + e.message); return null; }
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
      "suppMTV","suppVitD_IU","suppCa_mg","suppCaType","suppPO4_mmol","suppPO4Type","suppFe_mg","suppFeType"
    ]);
  }
  return sh;
}

// ── JSON output helper ────────────────────────────────────────
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

    // All GET actions require a valid token (including debug — no unauthenticated PHI exposure)
    var user = verifyToken(e.parameter.token);
    if (!user) return jsonOut({ error: "Unauthorized" });

    if (action === "debug") {
      // Returns only non-PHI setup info for authenticated admins
      if (user.role !== "admin") return jsonOut({ error: "Forbidden" });
      var staffRows = [];
      try {
        var rows = getSheetStaff().getDataRange().getValues();
        for (var i = 1; i < rows.length; i++) {
          staffRows.push({ email: rows[i][0], role: rows[i][1], active: rows[i][3] });
        }
      } catch(ex) {}
      return jsonOut({ gasClientId: CLIENT_ID, user: user.email, staffRows: staffRows });
    }

    if (action === "getActivePatients") return jsonOut(getActivePatients());
    return jsonOut({ error: "Unknown action: " + action });
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

// ── POST handler ──────────────────────────────────────────────
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action || "";

    if (action === "login") {
      var u = verifyToken(body.token);
      if (!u) return jsonOut({ status: "unauthorized", error: "ไม่พบบัญชีนี้ในระบบ หรือบัญชีถูกระงับ" });
      return jsonOut({ status: "ok", name: u.name, role: u.role, email: u.email });
    }

    var user = verifyToken(body.token);
    if (!user) return jsonOut({ error: "Unauthorized" });

    if (action === "getActivePatients") return jsonOut(getActivePatients());

    var canWrite = user.role === "doctor" || user.role === "admin";

    if (action === "logDailyNutrition") {
      if (!canWrite) return jsonOut({ error: "Forbidden" });
      logDailyNutrition(body.sessionId, body.entry, user.email);
      return jsonOut({ ok: true });
    }
    if (action === "registerPatient") {
      if (!canWrite) return jsonOut({ error: "Forbidden" });
      registerPatient(body.patient);
      return jsonOut({ ok: true });
    }
    if (action === "updatePatient") {
      // For bed transfers, status changes, and other partial updates
      if (!canWrite) return jsonOut({ error: "Forbidden" });
      registerPatient(body.patient);  // registerPatient upserts on sessionId match
      return jsonOut({ ok: true });
    }
    if (action === "updateWeights") {
      if (!canWrite) return jsonOut({ error: "Forbidden" });
      updateWeights(body.sessionId, body.weights);
      return jsonOut({ ok: true });
    }
    // PDPA Section 33: right to erasure — pseudonymize (remove name/initials, keep clinical data)
    if (action === "pseudonymizePatient") {
      if (user.role !== "admin") return jsonOut({ error: "Forbidden" });
      pseudonymizePatient(body.sessionId, user.email);
      return jsonOut({ ok: true });
    }

    return jsonOut({ error: "Unknown action: " + action });
  } catch (err) {
    return jsonOut({ error: err.message });
  }
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
      bedHistory:    _parseJson(p[15], []),  // col P — bed transfer audit trail
    });
  }

  return { patients: patients, log: logMap, ts: new Date().toISOString() };
}

// ── logDailyNutrition ─────────────────────────────────────────
function logDailyNutrition(sessionId, entry, submittedBy) {
  getSheetLog().appendRow([
    entry.ts          || new Date().toISOString().slice(0, 10),
    sessionId,
    entry.dol         || "",
    entry.weight      || "",
    entry.fluid       || "",
    entry.gir         || "",
    entry.pro         || "",
    entry.kcal        || "",
    entry.na          || "",
    entry.k           || "",
    entry.ca          || "",
    entry.p           || "",
    entry.enVolPerKg  || "",
    entry.route       || "",
    entry.status      || "submitted",
    submittedBy       || "",
    entry.suppMTV        || 0,
    entry.suppVitD_IU    || 0,
    entry.suppCa_mg      || 0,
    entry.suppCaType     || "",
    entry.suppPO4_mmol   || 0,
    entry.suppPO4Type    || "",
    entry.suppFe_mg      || 0,
    entry.suppFeType     || "",
  ]);
}

// ── registerPatient (upsert) ──────────────────────────────────
function registerPatient(p) {
  var sheet = getSheetPat();
  var data = sheet.getDataRange().getValues();
  var row16 = [
    p.sessionId, p.name || "", p.initials || "",
    p.bw || 0, p.ga || 0, p.sex || "boys",
    p.dob || "", p.admissionDate || "", p.twinSuffix || "",
    p.status || "Active", p.currentBed || "", p.diagnosis || "",
    JSON.stringify(p.weights    || []),
    JSON.stringify(p.lengths    || []),
    JSON.stringify(p.hcs        || []),
    JSON.stringify(p.bedHistory || []),  // col P
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
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(sessionId)) {
      sheet.getRange(i + 1, 13).setValue(JSON.stringify(weights));
      return;
    }
  }
}

// ── pseudonymizePatient (PDPA Section 33 — right to erasure) ─
// Clears identifying fields (name, initials) while retaining clinical data
// for mandatory medical record retention under Thai medical law.
// Records the erasure event in column B as "[PDPA-erased YYYY-MM-DD by admin]".
function pseudonymizePatient(sessionId, adminEmail) {
  var sheet = getSheetPat();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(sessionId)) {
      var eraseNote = "[PDPA-erased " + new Date().toISOString().slice(0, 10) + "]";
      sheet.getRange(i + 1, 2).setValue(eraseNote);  // name col
      sheet.getRange(i + 1, 3).setValue("");          // initials col
      Logger.log("PDPA erasure: " + sessionId + " by " + adminEmail);
      return;
    }
  }
}

// ── Utility ───────────────────────────────────────────────────
function _parseJson(str, fallback) {
  try {
    if (!str) return fallback;
    return JSON.parse(String(str));
  } catch (_) { return fallback; }
}

function _fmtDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  var s = String(val);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  try {
    return Utilities.formatDate(new Date(s), Session.getScriptTimeZone(), "yyyy-MM-dd");
  } catch (_) { return s; }
}
