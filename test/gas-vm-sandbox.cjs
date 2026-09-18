// gas-vm-sandbox.cjs — shared Apps Script double for the 2026-09-17 backend
// harnesses (verify-review-0917-backend-*.cjs). Not a harness itself: CI runs
// test/verify-*.cjs only.
//
// Loads the REAL gas-backend.gs into a Node vm, like every backend harness
// here, but models the Sheets/Cache/Lock behaviour the 2026-09-17 fixes are
// about, so a regression is visible rather than stubbed away:
//   • a string written to a cell that starts with = + - @ (and is not a plain
//     number) is recorded as a FORMULA INJECTION; a leading apostrophe forces
//     text and is NOT part of the stored value — so getValues() hands the bare
//     "=..." back, which is exactly the second-order path SEC-B2 is about;
//   • a string written as exactly YYYY-MM-DD comes back as a Date at Bangkok
//     midnight, the way Sheets parses it;
//   • getRange() reads any number of rows, pads short rows with "", and throws
//     past the grid edge; getLastRow() is the last row WITH CONTENT;
//   • CacheService honours TTLs against Date.now(), the 100 KB value cap, the
//     21600 s TTL cap and the 250-char key cap; putAll/getAll/removeAll exist;
//   • one clock: an argument-less `new Date()` in gas-backend.gs reads
//     Date.now(), so withNow() pins every clock read, not just Date.now();
//   • LockService can be told to time out; every service can be told to throw;
//   • real HMAC-SHA256 / SHA-256 / gzip / base64.
//
// The source under test is ../gas-backend.gs, or the file named by
// NEOFEED_GAS_SRC — which is how a harness is run against an older revision
// to prove it fails there.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const SRC_PATH = process.env.NEOFEED_GAS_SRC || path.join(__dirname, '..', 'gas-backend.gs');

const LOG_HEADER = ['ts', 'sessionId', 'dol', 'weight', 'fluid', 'gir', 'pro', 'kcal', 'na', 'k', 'ca', 'p', 'enVolPerKg', 'route', 'status', 'submittedBy',
  'suppMTV', 'suppVitD_IU', 'suppCa_mg', 'suppCaType', 'suppPO4_mmol', 'suppPO4Type', 'suppFe_mg', 'suppFeType',
  'calcInputJson', 'entryId', 'lastModified', 'lastModifiedBy', 'ioInput', 'ioOutput', 'drainContent', 'constantsVersion', 'appVersion',
  'published', 'publishedBy', 'revisionNumber', 'revisionOf', 'supersededAt'];
const PAT_HEADER = ['sessionId', 'name', 'initials', 'bw', 'ga', 'sex', 'dob', 'admissionDate', 'twinSuffix', 'status',
  'currentBed', 'diagnosis', 'weights', 'lengths', 'hcs', 'bedHistory', 'statusDate', 'multiplesCount'];
const STAFF_HEADER = ['email', 'role', 'name', 'active', 'password_hash', 'salt', 'must_change_password', 'temp_password'];
const AUDIT_HEADER = ['ts', 'action', 'sessionId', 'actorEmail'];

const wardToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const addDays = (key, n) => new Date(Date.parse(key + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const bkkMidnight = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d) - 7 * 3600e3); };
const isDate = (v) => Object.prototype.toString.call(v) === '[object Date]';

// The backend's Date: the host's own (shared realm, so `instanceof Date` holds
// for fixture Dates), except that an argument-less `new Date()` / `Date()` reads
// Date.now(), which the real constructor never does. Without this, withNow()
// moved Date.now() but not the `ts` stamps, and § A2's "…with a fresh ts" in
// verify-review-0917-backend-sync.cjs passed only if the real clock ticked
// between two syncs (it didn't on CI run 35302157754, 2026-09-18).
const HostDate = Date;
function SandboxDate(...args) {
  if (!new.target) return new HostDate(HostDate.now()).toString();
  return args.length ? new HostDate(...args) : new HostDate(HostDate.now());
}
SandboxDate.prototype = HostDate.prototype;
SandboxDate.now = () => HostDate.now();
SandboxDate.parse = HostDate.parse;
SandboxDate.UTC = HostDate.UTC;

function boot(opts) {
  opts = opts || {};
  const env = {
    sheets: {}, injections: [], logs: [], cacheThrows: false, propsThrow: false, propSetThrows: false,
    openByIdThrows: null, lockTimeout: false, lockWaits: 0, lockReleases: 0, lockHeld: 0,
    urlFetch: { code: 400, body: '{"error":"invalid_token"}' }, urlFetchThrows: null, hmacCalls: 0, hmacHook: null,
  };

  function cellIn(sheetName, row, col, v) {
    if (typeof v !== 'string') return v;
    if (v.startsWith("'")) return v.slice(1);
    if (/^[=+\-@]/.test(v) && !/^[-+]?\d+(\.\d+)?$/.test(v)) env.injections.push({ sheet: sheetName, row, col, value: v });
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return bkkMidnight(v);
    return v;
  }

  function makeSheet(name, rows, sheetOpts) {
    sheetOpts = sheetOpts || {};
    const data = (rows || []).map(r => r.slice());
    const sh = {
      name, data,
      maxColumns: sheetOpts.maxColumns || Math.max(26, ...data.map(r => r.length), 1),
      maxRows: sheetOpts.maxRows || Math.max(1000, data.length),
      hooks: {},        // hooks.beforeRead(sh, r, c, nr, nc) / hooks.beforeWrite(sh, kind, r, c)
      throwOn: {},      // method -> { err, skip, once }
      stats: { rangeReads: 0, cellsRead: 0 },
      _guard(m) {
        const t = sh.throwOn[m];
        if (!t) return;
        if (t.skip > 0) { t.skip--; return; }
        if (t.once) delete sh.throwOn[m];
        throw t.err || new Error('Service Spreadsheets failed while accessing document with id x.');
      },
      getName: () => name,
      getMaxColumns: () => sh.maxColumns,
      getMaxRows: () => Math.max(sh.maxRows, data.length),
      insertColumnsAfter(after, n) { sh._guard('insertColumnsAfter'); sh.maxColumns += n; },
      deleteColumns(pos, n) {
        sh._guard('deleteColumns');
        sh.maxColumns -= n;
        data.forEach(r => r.splice(pos - 1, n));
      },
      _lastRow() {
        for (let i = data.length - 1; i >= 0; i--) if ((data[i] || []).some(v => v !== '' && v != null)) return i + 1;
        return 0;
      },
      _lastCol() {
        let m = 0;
        for (const r of data) for (let j = (r || []).length - 1; j >= m; j--) if (r[j] !== '' && r[j] != null) { m = j + 1; break; }
        return m;
      },
      getLastRow: () => sh._lastRow(),
      getLastColumn: () => sh._lastCol(),
      _read(r, c, nr, nc) {
        if (sh.hooks.beforeRead) sh.hooks.beforeRead(sh, r, c, nr, nc);
        sh._guard('getValues');
        if (c < 1 || c + nc - 1 > sh.maxColumns) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
        const out = [];
        for (let i = 0; i < nr; i++) {
          const src = data[r - 1 + i] || [];
          const line = [];
          for (let j = 0; j < nc; j++) { const v = src[c - 1 + j]; line.push(v === undefined || v === null ? '' : v); }
          out.push(line);
        }
        sh.stats.rangeReads++; sh.stats.cellsRead += nr * nc;
        return out;
      },
      _write(r, c, v) {
        while (data.length < r) data.push([]);
        const row = data[r - 1];
        while (row.length < c - 1) row.push('');
        row[c - 1] = cellIn(name, r, c, v);
      },
      getDataRange() {
        return { getValues() { const lr = sh._lastRow(), lc = sh._lastCol(); return lr && lc ? sh._read(1, 1, lr, lc) : [[]]; } };
      },
      getRange(row, col, nr, nc) {
        nr = nr || 1; nc = nc || 1;
        if (col < 1 || col + nc - 1 > sh.maxColumns) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
        return {
          getValue: () => sh._read(row, col, 1, 1)[0][0],
          getValues: () => sh._read(row, col, nr, nc),
          setValue(v) {
            if (sh.hooks.beforeWrite) sh.hooks.beforeWrite(sh, 'setValue', row, col);
            sh._guard('setValue');
            sh._write(row, col, v);
          },
          setValues(vals) {
            if (sh.hooks.beforeWrite) sh.hooks.beforeWrite(sh, 'setValues', row, col);
            sh._guard('setValues');
            vals.forEach((rv, i) => rv.forEach((v, j) => sh._write(row + i, col + j, v)));
          },
          clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) sh._write(row + i, col + j, ''); },
        };
      },
      appendRow(r) {
        if (sh.hooks.beforeWrite) sh.hooks.beforeWrite(sh, 'appendRow', null, null);
        sh._guard('appendRow');
        if (r.length > sh.maxColumns) sh.maxColumns = r.length;
        const at = sh._lastRow();
        data.splice(at, 0, []);
        r.forEach((v, j) => sh._write(at + 1, j + 1, v));
      },
      deleteRow(row) {
        if (sh.hooks.beforeWrite) sh.hooks.beforeWrite(sh, 'deleteRow', row, null);
        sh._guard('deleteRow');
        data.splice(row - 1, 1);
      },
    };
    return sh;
  }

  // ── Cache ──
  const cacheStore = new Map();
  const cacheCheck = () => { if (env.cacheThrows) throw new Error('Service error: CacheService'); };
  const liveEntry = (k) => { const e = cacheStore.get(k); if (!e) return null; if (e.exp <= Date.now()) { cacheStore.delete(k); return null; } return e; };
  const keyCheck = (k) => { if (String(k).length > 250) throw new Error('Argument too large: key'); };
  const cache = {
    get(k) { cacheCheck(); keyCheck(k); const e = liveEntry(k); return e ? e.v : null; },
    getAll(ks) { cacheCheck(); const o = {}; ks.forEach(k => { const e = liveEntry(k); if (e) o[k] = e.v; }); return o; },
    put(k, v, ttl) {
      cacheCheck(); keyCheck(k);
      if (ttl > 21600) throw new Error('Argument too large: expirationInSeconds');
      if (String(v).length > 100 * 1024) throw new Error('Argument too large: value');
      cacheStore.set(k, { v: String(v), exp: Date.now() + (ttl || 600) * 1000, ttl: ttl || 600 });
    },
    putAll(o, ttl) { cacheCheck(); for (const k of Object.keys(o)) cache.put(k, o[k], ttl); },
    remove(k) { cacheCheck(); cacheStore.delete(k); },
    removeAll(ks) { cacheCheck(); ks.forEach(k => cacheStore.delete(k)); },
  };

  // ── Properties ──
  const props = new Map([['SPREADSHEET_ID', 'sheet-id'], ['CLIENT_ID', 'client-id.apps.googleusercontent.com']]);
  const propsApi = {
    getProperty: (k) => { if (env.propsThrow) throw new Error('Service error: PropertiesService'); return props.has(k) ? props.get(k) : null; },
    setProperty: (k, v) => { if (env.propsThrow || env.propSetThrows) throw new Error('Service error: PropertiesService'); props.set(k, String(v)); },
    deleteProperty: (k) => { if (env.propsThrow) throw new Error('Service error: PropertiesService'); props.delete(k); },
  };

  const toSigned = (buf) => Array.from(buf).map(b => (b > 127 ? b - 256 : b));
  const newBlob = (d, type) => {
    const buf = typeof d === 'string' ? Buffer.from(d, 'utf8') : Buffer.from(d.map(b => b & 0xff));
    return { _buf: buf, type, getBytes: () => toSigned(buf), getDataAsString: () => buf.toString('utf8') };
  };
  const spreadsheet = {
    getSheetByName: (n) => env.sheets[n] || null,
    insertSheet: (n) => (env.sheets[n] = makeSheet(n, [], { maxColumns: 26 })),
    getSheets: () => Object.values(env.sheets),
  };
  const sandbox = {
    SpreadsheetApp: { openById: () => { if (env.openByIdThrows) throw new Error(env.openByIdThrows); return spreadsheet; } },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      computeHmacSha256Signature: (value, key) => {
        env.hmacCalls++;
        if (env.hmacHook) env.hmacHook();
        return toSigned(crypto.createHmac('sha256', Buffer.from(String(key), 'utf8')).update(Buffer.from(String(value), 'utf8')).digest());
      },
      computeDigest: (alg, value) => toSigned(crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest()),
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      formatDate: (d, tz) => {
        if (!isDate(d) || isNaN(d.getTime())) throw new Error('Invalid argument: date');
        return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
      },
      newBlob,
      gzip: (blob) => newBlob(Array.from(zlib.gzipSync(blob._buf)), 'application/x-gzip'),
      ungzip: (blob) => newBlob(Array.from(zlib.gunzipSync(blob._buf))),
      base64Encode: (bytes) => Buffer.from(bytes.map(b => b & 0xff)).toString('base64'),
      base64Decode: (s) => toSigned(Buffer.from(s, 'base64')),
    },
    Session: { getScriptTimeZone: () => 'Asia/Bangkok' },
    PropertiesService: { getScriptProperties: () => propsApi },
    CacheService: { getScriptCache: () => cache },
    LockService: { getScriptLock: () => ({
      waitLock: () => { env.lockWaits++; if (env.lockTimeout) throw new Error('Lock timeout: another process was holding the lock for too long.'); env.lockHeld++; },
      tryLock: () => !env.lockTimeout,
      releaseLock: () => { env.lockReleases++; env.lockHeld = Math.max(0, env.lockHeld - 1); },
    }) },
    UrlFetchApp: { fetch: () => {
      if (env.urlFetchThrows) throw new Error(env.urlFetchThrows);
      return { getResponseCode: () => env.urlFetch.code, getContentText: () => env.urlFetch.body };
    } },
    ContentService: { createTextOutput: (t) => ({ _text: t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    Logger: { log: (m) => env.logs.push(String(m)) },
    console,
    Date: SandboxDate,   // the host's Date; `new Date()` reads Date.now() (see SandboxDate)
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(opts.src || SRC_PATH, 'utf8'), sandbox, { filename: 'gas-backend.gs' });

  env.sheets.Staff = makeSheet('Staff', [STAFF_HEADER]);
  env.sheets.Patient_Registry = makeSheet('Patient_Registry', [PAT_HEADER]);
  env.sheets.Daily_Log = makeSheet('Daily_Log', [LOG_HEADER], { maxColumns: 38 });
  env.sheets.Audit_Log = makeSheet('Audit_Log', [AUDIT_HEADER], { maxColumns: 4 });

  const g = {
    sb: sandbox, env, props, cacheStore, makeSheet,
    sheet: (n) => env.sheets[n],
    rows: (n) => env.sheets[n].data.slice(1),
    audit: () => env.sheets.Audit_Log.data.slice(1).map(r => ({ action: r[1], sessionId: r[2], actor: r[3] })),
    postText(body) {
      const out = sandbox.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } });
      return out._text;
    },
    post(body) { return JSON.parse(g.postText(body)); },
    addStaff(email, role, password, extra) {
      extra = extra || {};
      let hash = '', salt = '';
      if (password) { salt = crypto.randomUUID(); hash = sandbox.hashPwdV2(password, salt); }
      env.sheets.Staff.data.push([email, role, extra.name || email.split('@')[0], extra.active === undefined ? true : extra.active,
        hash, salt, !!extra.mustChange, extra.temp || '']);
    },
    session(email, role) { return sandbox.createSession(email, role, email.split('@')[0], false); },
    expireStaffCache(email) { cacheStore.delete('staffrc_' + String(email).toLowerCase()); },
    // Registry row in sheet shape. Dates as Date values, like Sheets returns them.
    patRow(sid, extra) {
      const r = new Array(18).fill('');
      r[0] = sid; r[1] = 'ทารก ' + sid; r[2] = sid.slice(0, 2); r[3] = 1200; r[4] = 30.1; r[5] = 'boys';
      r[6] = bkkMidnight(addDays(wardToday(), -20)); r[7] = bkkMidnight(addDays(wardToday(), -20)); r[9] = 'Active';
      r[12] = JSON.stringify([{ dol: 1, w: 1200 }]); r[13] = '[]'; r[14] = '[]'; r[15] = '[]'; r[17] = 0;
      for (const [k, v] of Object.entries(extra || {})) r[k] = v;
      return r;
    },
    logRow(sid, ts, extra) {
      const r = new Array(38).fill('');
      r[0] = ts; r[1] = sid; r[2] = 3; r[3] = 1250; r[4] = 150; r[13] = 'TPN central'; r[14] = 'submitted'; r[15] = 'nurse@kcmh.test';
      r[24] = JSON.stringify({ wtG: 1250 }); r[25] = 'e-' + crypto.randomUUID(); r[26] = '2026-09-10T01:00:00.000Z'; r[27] = 'nurse@kcmh.test'; r[35] = 1;
      for (const [k, v] of Object.entries(extra || {})) r[k] = v;
      return r;
    },
  };
  return g;
}

// Minimal PASS/FAIL recorder shared by the three harnesses. A section that
// throws counts as one FAIL (so running against an older gas-backend.gs, where
// whole functions are missing, reports failures instead of crashing).
function recorder(title) {
  let pass = 0, fail = 0, n = 0;
  const r = {
    ok(name, cond, detail) {
      n++;
      const label = String(n).padStart(3, '0') + '  ' + name;
      console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : '  ' + JSON.stringify(detail === undefined ? '' : detail).slice(0, 400)}`);
      cond ? pass++ : fail++;
    },
    eq(name, got, want) { r.ok(name, JSON.stringify(got) === JSON.stringify(want), { got, want }); },
    section(name, fn) {
      console.log('\n── ' + name + ' ──');
      try { fn(); } catch (e) { r.ok('section ran without throwing', false, (e && e.stack || String(e)).split('\n').slice(0, 3).join(' | ')); }
    },
    done() {
      console.log(`\n${fail === 0 ? `${title}: ALL PASS` : `${title}: ${fail} FAILED`} (${pass} passed, ${fail} failed)`);
      process.exit(fail === 0 ? 0 : 1);
    },
  };
  return r;
}

// Run fn with the clock pinned to `ms`: Date.now() on both sides, and every
// argument-less `new Date()` in the backend (SandboxDate reads Date.now()).
function withNow(ms, fn) {
  const real = Date.now;
  Date.now = () => ms;
  try { return fn(); } finally { Date.now = real; }
}

module.exports = { boot, recorder, withNow, wardToday, addDays, bkkMidnight, isDate,
  LOG_HEADER, PAT_HEADER, STAFF_HEADER, AUDIT_HEADER, SRC_PATH };
