// ============================================================
// NeoFeed V2 — Google Apps Script backend
// ============================================================
// Setup:
//   1. Create a Google Sheet → fill SPREADSHEET_ID below
//   2. Tabs auto-created on first use: Patient_Registry, Daily_Log, Staff
//   3. Staff tab (A–D): email | role (doctor/admin) | name | active (TRUE/FALSE)
//      → Add yourself first; deployer auto-added as admin on first call to getSheetStaff()
//   4. GCP: create OAuth 2.0 Client ID → paste in NeoFeed.html window.NEOFEED_CLIENT_ID
//   5. Deploy → New deployment → Web app
//      Execute as: Me · Who has access: Anyone
//   6. Copy URL → paste in NeoFeed.html window.NEOFEED_GAS_URL
//
// Patient_Registry (A–O): sessionId|name|initials|bw|ga|sex|dob|admissionDate|
//   twinSuffix|status|currentBed|diagnosis|weights(JSON)|lengths(JSON)|hcs(JSON)
// Daily_Log (A–P): ts|sessionId|dol|weight|fluid|gir|pro|kcal|na|k|ca|p|enVolPerKg|route|status|submittedBy
// Staff (A–D): email | role | name | active
// ============================================================

var SPREADSHEET_ID = "1cZSA2qAUWAvFmpzrcjxS8kw6r-MpCMOSVAJev1uNDtI";
var CLIENT_ID      = "750019806043-imunne8ndetdesii70o3t1vnr0ta2br4.apps.googleusercontent.com";

// ── Staff sheet accessor — auto-creates with deployer as first admin ──────────
function getSheetStaff() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName("Staff");
  if (!sh) {
    sh = ss.insertSheet("Staff");
    sh.appendRow(["email", "role", "name", "active"]);
    sh.appendRow([Session.getActiveUser().getEmail(), "admin", "Admin", true]);
  }
  return sh;
}

// ── JWT verifier — calls Google tokeninfo to verify signature ─────────────────
// Replaces local base64 decode (which did NOT verify the signature).
// tokeninfo endpoint validates: signature, expiry, issuer, and audience.
function decodeJwtEmail(token) {
  try {
    var res = UrlFetchApp.fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token=" + token,
      { muteHttpExceptions: true }
    );
    if (res.getResponseCode() !== 200) return null;
    var payload = JSON.parse(res.getContentText());
    // Verify token was issued for this app (prevents token reuse from other apps)
    if (payload.aud !== CLIENT_ID) return null;
    if (!payload.email || payload.email_verified !== "true") return null;
    return payload.email;
  } catch (e) { return null; }
}

// ── Staff whitelist check ─────────────────────────────────────────────────────
// Returns { email, name, role } if email is in Staff sheet + active, null otherwise.
function verifyToken(token) {
  if (!token) return null;
  try {
    var email = decodeJwtEmail(token);
    if (!email) return null;
    var rows = getSheetStaff().getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim().toLowerCase() === email.trim().toLowerCase()) {
        var active = rows[i][3];
        if (active !== true && String(active).toUpperCase() !== "TRUE") return null;
        return {
          email: email,
          role:  String(rows[i][1] || "doctor"),
          name:  String(rows[i][2] || email),
        };
      }
    }
    return null; // not in whitelist
  } catch (e) { return null; }
}

// Sheet accessors — auto-create with headers if tab doesn't exist yet
function getSheetPat() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName("Patient_Registry");
  if (!sh) {
    sh = ss.insertSheet("Patient_Registry");
    sh.appendRow([
      "sessionId","name","initials","bw","ga","sex",
      "dob","admissionDate","twinSuffix","status",
      "currentBed","diagnosis","weights","lengths","hcs"
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
      "pro","kcal","na","k","ca","p","enVolPerKg","route","status","submittedBy"
    ]);
  }
  return sh;
}

// ── JSON output helper ───────────────────────────────────────
// GAS automatically adds CORS headers for deployed web apps.
// Do NOT chain setHeader() after setMimeType() — not supported.
function jsonOut(data) {
  var out = ContentService.createTextOutput(JSON.stringify(data));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

// ── GET handler ──────────────────────────────────────────────
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "";
  try {
    if (action === "ping") return jsonOut({ ok: true, ts: new Date().toISOString() });
    // All GET actions (except ping) require a valid Google token
    var user = verifyToken(e.parameter.token);
    if (!user) return jsonOut({ error: "Unauthorized" });
    if (action === "getActivePatients") return jsonOut(getActivePatients());
    return jsonOut({ error: "Unknown action: " + action });
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

// ── POST handler ─────────────────────────────────────────────
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action || "";

    // login: verify JWT → return user object (no prior auth needed)
    if (action === "login") {
      var u = verifyToken(body.token);
      if (!u) return jsonOut({ status: "unauthorized", error: "ไม่พบบัญชีนี้ในระบบ หรือบัญชีถูกระงับ" });
      return jsonOut({ status: "ok", name: u.name, role: u.role, email: u.email });
    }

    // All other actions require a valid token
    var user = verifyToken(body.token);
    if (!user) return jsonOut({ error: "Unauthorized" });

    // Sync — any authenticated user can read patient list
    if (action === "getActivePatients") return jsonOut(getActivePatients());

    // Write actions — doctor or admin only
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
    if (action === "updateWeights") {
      if (!canWrite) return jsonOut({ error: "Forbidden" });
      updateWeights(body.sessionId, body.weights);
      return jsonOut({ ok: true });
    }
    return jsonOut({ error: "Unknown action: " + action });
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

// ── getActivePatients ────────────────────────────────────────
function getActivePatients() {
  var sheetPat = getSheetPat();
  var sheetLog = getSheetLog();
  var patData = sheetPat.getLastRow() > 0 ? sheetPat.getDataRange().getValues() : [[]];
  var logData = sheetLog.getLastRow() > 0 ? sheetLog.getDataRange().getValues() : [[]];

  // Build log map: sessionId → [entries]
  var logMap = {};
  for (var i = 1; i < logData.length; i++) {
    var row = logData[i];
    var sid = String(row[1] || "");
    if (!sid) continue;
    if (!logMap[sid]) logMap[sid] = [];
    logMap[sid].push({
      ts:     String(row[0]  || ""),
      dol:    Number(row[2]  || 0),
      weight: Number(row[3]  || 0),
      fluid:  Number(row[4]  || 0),
      gir:    Number(row[5]  || 0),
      pro:    Number(row[6]  || 0),
      kcal:   Number(row[7]  || 0),
      na:     Number(row[8]  || 0),
      k:      Number(row[9]  || 0),
      ca:        Number(row[10] || 0),
      p:         Number(row[11] || 0),
      enVolPerKg:Number(row[12] || 0),
      route:     String(row[13] || ""),
      status:    String(row[14] || "submitted"),
    });
  }

  // Build patient list (row 0 is header)
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
    });
  }

  return { patients: patients, log: logMap, ts: new Date().toISOString() };
}

// ── logDailyNutrition ────────────────────────────────────────
function logDailyNutrition(sessionId, entry, submittedBy) {
  getSheetLog().appendRow([
    entry.ts        || new Date().toISOString().slice(0, 10),
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
    submittedBy       || "",  // col M — audit trail
  ]);
}

// ── registerPatient ──────────────────────────────────────────
function registerPatient(p) {
  var sheet = getSheetPat();
  var data = sheet.getDataRange().getValues();
  // Update existing row if sessionId matches
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(p.sessionId)) {
      sheet.getRange(i + 1, 1, 1, 15).setValues([[
        p.sessionId, p.name || "", p.initials || "",
        p.bw || 0, p.ga || 0, p.sex || "boys",
        p.dob || "", p.admissionDate || "", p.twinSuffix || "",
        p.status || "Active", p.currentBed || "", p.diagnosis || "",
        JSON.stringify(p.weights || []),
        JSON.stringify(p.lengths || []),
        JSON.stringify(p.hcs    || []),
      ]]);
      return;
    }
  }
  // New patient
  sheet.appendRow([
    p.sessionId, p.name || "", p.initials || "",
    p.bw || 0, p.ga || 0, p.sex || "boys",
    p.dob || "", p.admissionDate || "", p.twinSuffix || "",
    p.status || "Active", p.currentBed || "", p.diagnosis || "",
    JSON.stringify(p.weights || [{ dol: 1, w: p.bw || 0 }]),
    JSON.stringify(p.lengths || []),
    JSON.stringify(p.hcs    || []),
  ]);
}

// ── updateWeights ────────────────────────────────────────────
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

// ── Utility ──────────────────────────────────────────────────
function _parseJson(str, fallback) {
  try {
    if (!str) return fallback;
    return JSON.parse(String(str));
  } catch (_) {
    return fallback;
  }
}

// Format a cell value as YYYY-MM-DD (handles Date objects and strings)
function _fmtDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  var s = String(val);
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Try parsing
  try {
    return Utilities.formatDate(new Date(s), Session.getScriptTimeZone(), "yyyy-MM-dd");
  } catch (_) { return s; }
}
