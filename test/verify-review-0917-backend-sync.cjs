// verify-review-0917-backend-sync.cjs — pins the sync-path changes from the
// 2026-09-17 backend review, all three Praew's decisions:
//   A1  an archived patient with no usable statusDate leaves the ward sync;
//   A2  a 5-minute shared payload cache, invalidated by DATA_VERSION, which
//       every locked write bumps in its `finally` (pinned at source level too);
//   A3  the narrow Daily_Log read, with a full-read fallback on any row shift.
//
// Equivalence: the perf reviewer's edge cases, comparing the new
// getActivePatients / getActivePatientsJson against REFERENCE — the pre-review
// full-read getActivePatients, embedded verbatim below and evaluated in the
// same sandbox, so it uses the same (new, A1) window rule and helpers. Output
// must be identical except `ts`, which must be fresh.
//
// See gas-vm-sandbox.cjs for the Sheets/Cache double. No npm dependencies.
// Fails against the pre-review source (42ce553): NEOFEED_GAS_SRC=<that file>.
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const { boot, recorder, withNow, wardToday, addDays, bkkMidnight, SRC_PATH } = require('./gas-vm-sandbox.cjs');
const T = recorder('REVIEW 2026-09-17 BACKEND · SYNC');

// ── REFERENCE: getActivePatients as of 42ce553 (full getDataRange reads) ──
const REFERENCE_SRC = `
function __refGetActivePatients(opts) {
  var includeArchived = !!(opts && opts.includeArchived);
  var todayKey = _wardDateKey();
  var sheetPat = getSheetPat();
  var sheetLog = getSheetLog();
  var patData = sheetPat.getLastRow() > 0 ? sheetPat.getDataRange().getValues() : [[]];
  var logData = sheetLog.getLastRow() > 0 ? sheetLog.getDataRange().getValues() : [[]];

  // Decide the patient set first, so log rows for anyone outside it are
  // never serialised at all.
  var inWindow = {};
  for (var k = 1; k < patData.length; k++) {
    var kid = String(patData[k][0] || "");
    if (!kid) continue;
    if (includeArchived || _patientInSyncWindow(patData[k][9], patData[k][16], todayKey)) inWindow[kid] = true;
  }

  var logMap = {};
  for (var i = 1; i < logData.length; i++) {
    var row = logData[i];
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
`;

const TODAY = wardToday();
const strip = (o) => JSON.stringify(Object.assign({}, o, { ts: 'X' }));
const stripText = (s) => s.replace(/,"ts":"[^"]*"}$/, ',"ts":"X"}');
const E = (extra) => Object.assign({ dol: 4, weight: 1260, fluid: 150, gir: 6, pro: 3, kcal: 90, na: 3, k: 2, ca: 60, p: 40,
  enVolPerKg: 20, route: 'TPN central', status: 'submitted', calcInput: { wtG: 1260 } }, extra || {});

function setup(patRows, logRows, logOpts) {
  const g = boot();
  vm.runInContext(REFERENCE_SRC, g.sb, { filename: 'reference-getActivePatients.gs' });
  if (patRows) g.sheet('Patient_Registry').data.push(...patRows);
  if (logRows === null) delete g.env.sheets.Daily_Log;
  else {
    if (logRows) g.sheet('Daily_Log').data.push(...logRows);
    if (logOpts && logOpts.maxColumns) g.sheet('Daily_Log').maxColumns = logOpts.maxColumns;
  }
  g.addStaff('doc@kcmh.test', 'doctor', 'Doctor-Password-1');
  g.addStaff('adm@kcmh.test', 'admin', 'Admin-Password-1');
  g.addStaff('nur@kcmh.test', 'nurse', 'Nurse-Password-1');
  g.dt = g.session('doc@kcmh.test', 'doctor');
  g.at = g.session('adm@kcmh.test', 'admin');
  g.nt = g.session('nur@kcmh.test', 'nurse');
  return g;
}
function same(g, label, opts) {
  const ref = g.sb.__refGetActivePatients(opts);
  const got = g.sb.getActivePatients(opts);
  T.ok(label + ' — object identical to the full-read reference', strip(ref) === strip(got), { ref: strip(ref).slice(0, 240), got: strip(got).slice(0, 240) });
  const text = g.sb.getActivePatientsJson(opts);
  T.ok(label + ' — JSON text identical except ts', stripText(text) === stripText(JSON.stringify(ref)), { ref: JSON.stringify(ref).slice(0, 200), text: text.slice(0, 200) });
  return ref;
}
let eid = 0;
const pat = (g, sid, status, statusDate, extra) => g.patRow(sid, Object.assign({ 9: status == null ? 'Active' : status, 16: statusDate || '' }, extra || {}));
const lrow = (g, sid, ts, extra) => g.logRow(sid, ts, Object.assign({ 25: 'e' + (++eid), 26: '2026-09-0' + (1 + eid % 9) + 'T01:00:00.000Z', 24: JSON.stringify({ wtG: 1250, note: 'ทดสอบ' }) }, extra || {}));

T.section('A1 · the ward sync window: undated archive out, admin archive unchanged', () => {
  const g = setup([]);
  const P = (sid, st, sd) => pat(g, sid, st, sd);
  g.sheet('Patient_Registry').data.push(
    P('ACT', 'Active'), P('BLANK', ''), P('D30', 'Discharged', bkkMidnight(addDays(TODAY, -30))), P('D31', 'Discharged', bkkMidnight(addDays(TODAY, -31))),
    P('S30', 'Transferred', addDays(TODAY, -30)), P('NODATE', 'Discharged', ''), P('BADDATE', 'Expired', 'not a date'));
  const ids = (res) => res.patients.map(p => p.sessionId).sort();
  T.eq('_patientInSyncWindow: non-Active with no statusDate is OUT', g.sb._patientInSyncWindow('Discharged', '', TODAY), false);
  T.eq('…with an unparseable statusDate is OUT', g.sb._patientInSyncWindow('Discharged', 'not a date', TODAY), false);
  T.eq('…Active / blank status stays IN whatever the date', [g.sb._patientInSyncWindow('Active', '', TODAY), g.sb._patientInSyncWindow('', '', TODAY)], [true, true]);
  T.eq('ward sync via doPost', ids(g.post({ action: 'getActivePatients', token: g.dt })), ['ACT', 'BLANK', 'D30', 'S30']);
  T.eq('admin archive via doPost still returns everyone', ids(g.post({ action: 'getActivePatients', token: g.at, includeArchived: true })).length, 7);
});

T.section('A3 · equivalence on sheet shapes and edge values', () => {
  { const g = setup([]); g.sheet('Patient_Registry').data.push(pat(g, 'AA-1')); same(g, 'Daily_Log header only'); }
  { const g = setup([], null); g.sheet('Patient_Registry').data.push(pat(g, 'AA-1')); same(g, 'Daily_Log tab missing (auto-created)'); }
  { const g = setup([], []); g.sheet('Daily_Log').data.push(lrow(g, 'AA-1', TODAY)); same(g, 'registry header only, orphan log rows'); }
  { const g = setup([]); g.sheet('Patient_Registry').data.push(pat(g, 'OLD-1', 'Discharged', bkkMidnight(addDays(TODAY, -90))));
    g.sheet('Daily_Log').data.push(lrow(g, 'OLD-1', TODAY), lrow(g, 'OLD-1', TODAY));
    same(g, 'nobody in window');
    g.sheet('Daily_Log').stats.cellsRead = 0; g.sb.getActivePatients({});
    T.eq('…and no Daily_Log cell is read at all', g.sheet('Daily_Log').stats.cellsRead, 0); }
  { const g = setup([]); const blank = new Array(38).fill('');
    g.sheet('Patient_Registry').data.push(pat(g, 'AA-1'), pat(g, 'BB-1', ''));
    g.sheet('Daily_Log').data.push(lrow(g, 'AA-1', TODAY), blank.slice(), blank.slice(), lrow(g, 'BB-1', addDays(TODAY, -1)), blank.slice(), lrow(g, 'AA-1', addDays(TODAY, -1)));
    same(g, 'blank rows in the middle and between hits'); }
  { const g = setup([], [], { maxColumns: 31 }); g.sheet('Patient_Registry').data.push(pat(g, 'AA-1'));
    g.sheet('Daily_Log').data[0] = g.sheet('Daily_Log').data[0].slice(0, 31);
    g.sheet('Daily_Log').data.push(lrow(g, 'AA-1', TODAY).slice(0, 28), lrow(g, 'AA-1', addDays(TODAY, -1)).slice(0, 28));
    same(g, 'grid narrower than 38 (31), rows 28 wide'); }
  { const g = setup([], [], { maxColumns: 45 }); g.sheet('Patient_Registry').data.push(pat(g, 'AA-1'));
    g.sheet('Daily_Log').data.push(lrow(g, 'AA-1', TODAY).slice(0, 28)); same(g, 'grid wider than 38, content only to col 28'); }
  { const g = setup([]); g.sheet('Patient_Registry').data.push(pat(g, 'DU-1'), pat(g, 'XX-1', 'Discharged', ''), pat(g, 'DU-1', 'Discharged', bkkMidnight(addDays(TODAY, -200))));
    g.sheet('Daily_Log').data.push(lrow(g, 'DU-1', TODAY)); same(g, 'duplicate registry sessionId'); }
  { const g = setup([]); g.sheet('Patient_Registry').data.push(pat(g, 'AA-1'));
    g.sheet('Daily_Log').data.push(lrow(g, 'AA-1', bkkMidnight(TODAY)), lrow(g, 'AA-1', addDays(TODAY, -1)), lrow(g, 'AA-1', '17/09/2026'), lrow(g, 'AA-1', 46000),
      lrow(g, 'AA-1', ''), lrow(g, 'AA-1', addDays(TODAY, -2) + 'T10:00:00Z'), lrow(g, 'AA-1', TODAY, { 24: '{"truncated": ' }),
      lrow(g, 'AA-1', TODAY, { 24: 'x'.repeat(50000) }), lrow(g, 'AA-1', TODAY, { 24: '' }));
    same(g, 'ts as Date / string / garbage / serial / blank / ISO; malformed + 50k-char calcInputJson'); }
  { const g = setup([]); g.sheet('Patient_Registry').data.push(pat(g, 'AA-1'));
    const r1 = lrow(g, 'AA-1', TODAY, { 33: '2026-09-10T01:00:00Z', 34: 'd@k', 37: '2026-09-11T01:00:00Z' });
    g.sheet('Daily_Log').data.push(r1, lrow(g, 'AA-1', TODAY, { 35: 2, 36: r1[25] })); same(g, 'published + superseded + revision rows'); }
  { const g = setup([]);
    ['D30', 'D31', 'S30', 'I30', 'BAD', 'LOW', 'SPC', 'NOD'].forEach((sid, i) => g.sheet('Patient_Registry').data.push(pat(g, sid,
      ['Discharged', 'Discharged', 'Transferred', 'Expired', 'Discharged', 'active', ' Active ', 'Discharged'][i],
      [bkkMidnight(addDays(TODAY, -30)), bkkMidnight(addDays(TODAY, -31)), addDays(TODAY, -30), addDays(TODAY, -30) + 'T23:59:00Z', 'not a date', '', '', ''][i])));
    ['D30', 'D31', 'S30', 'I30', 'BAD', 'LOW', 'SPC', 'NOD'].forEach(sid => g.sheet('Patient_Registry') && g.sheet('Daily_Log').data.push(lrow(g, sid, TODAY)));
    same(g, 'window boundaries, Date/string/ISO statusDate, odd status casing, undated');
    same(g, '…includeArchived', { includeArchived: true }); }
});

T.section('A3 · block planning: rows between far-apart hits are never read', () => {
  const g = setup([]);
  const rows = [lrow(g, 'LEG-1', addDays(TODAY, -400))];
  for (let i = 0; i < 1500; i++) rows.push(lrow(g, 'OUT-' + (i % 40), addDays(TODAY, -300)));
  rows.push(lrow(g, 'AA-1', addDays(TODAY, -2)));
  for (let i = 0; i < 150; i++) rows.push(lrow(g, 'OUT-' + (i % 40), addDays(TODAY, -2)));
  rows.push(lrow(g, 'AA-1', TODAY));
  g.sheet('Daily_Log').data.push(...rows);
  g.sheet('Patient_Registry').data.push(pat(g, 'LEG-1', 'Discharged', bkkMidnight(addDays(TODAY, -3))), pat(g, 'AA-1'),
    ...[...Array(40).keys()].map(i => pat(g, 'OUT-' + i, 'Discharged', bkkMidnight(addDays(TODAY, -100)))));
  const st = g.sheet('Daily_Log').stats;
  st.rangeReads = 0; st.cellsRead = 0;
  g.sb.getActivePatients({});
  T.ok('a legacy row at the top + recent rows: column B + 2 blocks, not the 1,650 rows between', st.rangeReads === 3 && st.cellsRead < rows.length + 160 * 38, st);
  same(g, '…and the result is still identical');
});

T.section('A3 · a row shift between the column-B read and a block read falls back to a full read', () => {
  const once = (sh, fn) => { let fired = false; sh.hooks.beforeRead = (s, r, c, nr, nc) => { if (!fired && nc === 38) { fired = true; fn(s); } }; };
  { const g = setup([]);
    g.sheet('Patient_Registry').data.push(pat(g, 'AA-1'), pat(g, 'BB-1'), pat(g, 'OUT-1', 'Discharged', bkkMidnight(addDays(TODAY, -99))));
    g.sheet('Daily_Log').data.push(lrow(g, 'OUT-1', TODAY), lrow(g, 'AA-1', TODAY), lrow(g, 'BB-1', TODAY), lrow(g, 'AA-1', addDays(TODAY, -1)), lrow(g, 'OUT-1', TODAY));
    once(g.sheet('Daily_Log'), (sh) => sh.data.splice(1, 1));
    const b = g.sb.getActivePatients({}); g.sheet('Daily_Log').hooks = {};
    T.ok('a delete above the block → identical to a post-delete snapshot', strip(b) === strip(g.sb.__refGetActivePatients({}))); }
  { const g = setup([]);
    g.sheet('Patient_Registry').data.push(pat(g, 'AA-1'));
    g.sheet('Daily_Log').data.push(lrow(g, 'AA-1', TODAY), lrow(g, 'AA-1', addDays(TODAY, -1)), lrow(g, 'AA-1', addDays(TODAY, -2)));
    once(g.sheet('Daily_Log'), (sh) => sh.data.splice(2, 1));
    const b = g.sb.getActivePatients({}); g.sheet('Daily_Log').hooks = {};
    T.ok('a delete inside one patient\'s run (column B unchanged) → caught by the last-row check', strip(b) === strip(g.sb.__refGetActivePatients({}))); }
  { const g = setup([]);
    g.sheet('Patient_Registry').data.push(pat(g, 'AA-1'), pat(g, 'BB-1'));
    g.sheet('Daily_Log').data.push(lrow(g, 'AA-1', TODAY), lrow(g, 'BB-1', TODAY));
    once(g.sheet('Daily_Log'), (sh) => sh.data.push(lrow(g, 'AA-1', addDays(TODAY, -5))));
    const b = g.sb.getActivePatients({}); g.sheet('Daily_Log').hooks = {};
    T.ok('an append between reads → the re-read includes it', strip(b) === strip(g.sb.__refGetActivePatients({}))); }
});

T.section('A2 · 5-minute cache: hit/miss, fresh ts, audited, every write visible to the next sync', () => {
  const g = setup([]);
  g.sheet('Patient_Registry').data.push(pat(g, 'AA-1'), pat(g, 'BB-1'));
  g.sheet('Daily_Log').data.push(lrow(g, 'AA-1', addDays(TODAY, -1)), lrow(g, 'BB-1', addDays(TODAY, -1)));
  const syncText = (tok, archived) => g.postText({ action: 'getActivePatients', token: tok || g.dt, includeArchived: !!archived });
  const matches = (label, tok, archived) => {
    const text = syncText(tok, archived);
    const ref = JSON.stringify(g.sb.__refGetActivePatients({ includeArchived: !!archived && tok === g.at }));
    T.ok(label, stripText(text) === stripText(ref), { got: text.slice(0, 160), want: ref.slice(0, 160) });
    return text;
  };
  const first = matches('first sync (miss)');
  const sheetsCells = () => g.sheet('Daily_Log').stats.cellsRead + g.sheet('Patient_Registry').stats.cellsRead;
  const auditRows = g.rows('Audit_Log').length;
  const cellsBefore = sheetsCells();
  const at = Date.now() + 2000;
  const second = withNow(at, () => syncText());
  T.eq('a second sync inside 5 minutes reads no Patient_Registry / Daily_Log cells', sheetsCells(), cellsBefore);
  T.eq('…returns the same bytes except ts', stripText(second), stripText(first));
  // Exact, not `!== first.ts`: that passed or failed on whether the real clock
  // ticked between two fast syncs (CI run 35302157754).
  T.eq('…with a fresh ts: the time of this request, not the cached one', JSON.parse(second).ts, new Date(at).toISOString());
  T.eq('…and is audited exactly like a sheet read', g.rows('Audit_Log').length, auditRows + 1);
  const head = [...g.cacheStore.entries()].find(([k]) => /^sync1_ward_/.test(k) && g.cacheStore.has(k + '_0'));
  T.ok('cached under the ward date + DATA_VERSION, for 300 s', head && head[0].includes(TODAY) && head[1].ttl === 300, head && head[0]);
  const expired = withNow(Date.now() + 301e3, () => { const c = sheetsCells(); syncText(); return sheetsCells() > c; });
  T.ok('after 300 s it reads the sheet again', expired);

  const post = (body, tok) => g.post(Object.assign({ token: tok || g.dt }, body));
  const created = post({ action: 'logDailyNutrition', sessionId: 'AA-1', entry: E({ ts: TODAY }) });
  T.ok('create ok', !!created.entryId, created); matches('after create');
  const upd = post({ action: 'updateDailyNutrition', sessionId: 'AA-1', entryId: created.entryId, expectedLastModified: created.lastModified, entry: E({ ts: TODAY, pro: 3.4 }) });
  T.ok('draft update ok', upd.ok, upd); matches('after draft update');
  const pub = post({ action: 'publishLog', sessionId: 'AA-1', entryId: created.entryId, expectedLastModified: upd.lastModified });
  T.ok('publish ok', pub.ok, pub); matches('after publish');
  const rev = post({ action: 'updateDailyNutrition', sessionId: 'AA-1', entryId: created.entryId, expectedLastModified: g.rows('Daily_Log').find(r => r[25] === created.entryId)[26], entry: E({ ts: TODAY, pro: 3.8 }) });
  T.ok('revision ok', rev.revised, rev); matches('after revision (append + supersede)');
  T.ok('refused duplicate-date create', !!post({ action: 'logDailyNutrition', sessionId: 'AA-1', entry: E({ ts: TODAY }) }).error); matches('after a refused write');
  const reg = post({ action: 'registerPatient', isNew: true, patient: { sessionId: 'CC-1', name: 'ใหม่', bw: 1500, ga: 31, sex: 'girls', dob: addDays(TODAY, -3), status: 'Active', currentBed: 'NICU 9' } });
  T.ok('register ok', reg.ok, reg); matches('after registerPatient');
  const w = post({ action: 'updateWeights', sessionId: 'CC-1', weights: [{ dol: 1, w: 1500 }, { dol: 2, w: 1490 }] });
  T.ok('updateWeights ok', w.ok, w); matches('after updateWeights');
  const disch = post({ action: 'updatePatient', patient: { sessionId: 'BB-1', name: 'x', bw: 1200, ga: 30.1, sex: 'boys', status: 'Discharged', statusDate: addDays(TODAY, -45), currentBed: '' } });
  T.ok('discharge ok', disch.ok, disch); matches('after a discharge moves a patient out of the window');
  matches('admin archive variant', g.at, true);
  const bbEntry = g.rows('Daily_Log').find(r => r[1] === 'BB-1')[25];
  T.ok('deleteDailyNutrition ok', post({ action: 'deleteDailyNutrition', sessionId: 'BB-1', entryId: bbEntry }, g.at).ok); matches('admin archive after deleteDailyNutrition', g.at, true);
  T.ok('pseudonymize ok', post({ action: 'pseudonymizePatient', sessionId: 'CC-1' }, g.at).ok); matches('after pseudonymizePatient');
  T.ok('deletePatient ok', post({ action: 'deletePatient', sessionId: 'CC-1' }, g.at).ok); matches('after deletePatient');
  matches('a nurse gets the same ward payload', g.nt);
  matches('a doctor asking for the archive gets the ward payload', g.dt, true);

  syncText();
  g.sheet('Patient_Registry').data.find(r => r[0] === 'AA-1')[10] = 'NICU 11';
  g.sb.onEdit({ range: { getSheet: () => g.sheet('Patient_Registry'), getRow: () => 2, getNumRows: () => 1 } });
  matches('a typed hand edit + onEdit is visible at once');
  syncText();
  g.sheet('Daily_Log').data.splice(1, 1);
  const stale = stripText(syncText()) !== stripText(JSON.stringify(g.sb.__refGetActivePatients({})));
  T.ok('KNOWN LIMIT (documented): a structural hand edit with no onEdit is stale until the TTL', stale);
  const fresh = withNow(Date.now() + 301e3, () => stripText(syncText()) === stripText(JSON.stringify(g.sb.__refGetActivePatients({}))));
  T.ok('…and correct once the TTL has passed', fresh);
});

T.section('A2 · cache failure modes degrade to a correct read', () => {
  const g = setup([]);
  g.sheet('Patient_Registry').data.push(pat(g, 'AA-1'));
  g.sheet('Daily_Log').data.push(lrow(g, 'AA-1', TODAY));
  g.sb.getActivePatientsJson({});
  const chunk = [...g.cacheStore.keys()].find(k => /^sync1_.*_0$/.test(k));
  g.cacheStore.delete(chunk);
  same(g, 'an evicted chunk → miss → correct');
  g.env.cacheThrows = true;
  same(g, 'CacheService throwing → uncached read, no error');
  g.env.cacheThrows = false;
  g.sb.getActivePatientsJson({});
  g.sheet('Daily_Log').data.push(lrow(g, 'AA-1', addDays(TODAY, -1)));
  g.env.propSetThrows = true;
  g.sb._bumpDataVersion();
  g.env.propSetThrows = false;
  same(g, 'a bump whose setProperty fails still drops the cached payload');
  // A payload big enough to need several 90,000-char chunks (random text defeats gzip).
  for (let i = 0; i < 60; i++) g.sheet('Daily_Log').data.push(lrow(g, 'AA-1', addDays(TODAY, -2 - i), { 24: JSON.stringify({ blob: crypto.randomBytes(2500).toString('hex') }) }));
  g.sb._bumpDataVersion();
  const a = g.sb.getActivePatientsJson({});
  const head = [...g.cacheStore.entries()].find(([k]) => /^sync1_ward_/.test(k) && g.cacheStore.has(k + '_0'));
  const b = g.sb.getActivePatientsJson({});
  T.ok('a multi-chunk payload (' + (head && head[1].v) + ' chunks) round-trips byte-identical', head && Number(head[1].v) >= 2 && stripText(a) === stripText(b) &&
    stripText(b) === stripText(JSON.stringify(g.sb.__refGetActivePatients({}))));
  const realKey = g.sb._wardDateKey;
  g.sb.getActivePatientsJson({});
  g.sb._wardDateKey = function (v) { return v === undefined ? addDays(TODAY, 1) : realKey(v); };
  same(g, 'midnight rollover changes the key');
  g.sb._wardDateKey = realKey;
});

T.section('A2 · every write path bumps DATA_VERSION — behaviour and source', () => {
  const g = setup([]);
  g.sheet('Patient_Registry').data.push(pat(g, 'AA-1'));
  const version = () => g.props.get('DATA_VERSION');
  const bumps = (label, fn) => { const v0 = version(); fn(); T.ok(label + ' bumps DATA_VERSION', version() && version() !== v0); };
  let c;
  bumps('logDailyNutrition', () => { c = g.sb.logDailyNutrition('AA-1', E({ ts: '2026-09-10' }), 'doc@kcmh.test'); });
  bumps('a REFUSED logDailyNutrition (finally, not just success)', () => g.sb.logDailyNutrition('AA-1', E({ ts: '2026-09-10' }), 'doc@kcmh.test'));
  bumps('updateDailyNutrition', () => g.sb.updateDailyNutrition('AA-1', c.entryId, c.lastModified, E(), 'doc@kcmh.test'));
  bumps('publishDailyLog', () => g.sb.publishDailyLog('AA-1', c.entryId, 'doc@kcmh.test', g.rows('Daily_Log')[0][26]));
  bumps('registerPatient', () => g.sb.registerPatient({ sessionId: 'BB-1', bw: 1000, ga: 29, sex: 'boys', status: 'Active' }, true));
  bumps('updateWeights', () => g.sb.updateWeights('BB-1', [{ dol: 1, w: 1000 }]));
  bumps('pseudonymizePatient', () => g.sb.pseudonymizePatient('BB-1', 'adm@kcmh.test'));
  bumps('deleteDailyNutrition', () => g.sb.deleteDailyNutrition('AA-1', 'no-such', 'adm@kcmh.test'));
  bumps('deletePatient', () => g.sb.deletePatient('BB-1', 'adm@kcmh.test'));
  g.sheet('Daily_Log').data.push(lrow(g, 'AA-1', '2026-09-01', { 25: '' }));
  bumps('backfillLegacyEntryIds (editor-run)', () => g.sb.backfillLegacyEntryIds());
  bumps('onEdit on Daily_Log', () => g.sb.onEdit({ range: { getSheet: () => g.sheet('Daily_Log'), getRow: () => 3, getNumRows: () => 1 } }));

  // Source level: any function that takes the script lock and touches either
  // data tab must call _bumpDataVersion() inside its finally.
  const src = fs.readFileSync(SRC_PATH, 'utf8');
  const fns = [];
  const re = /^function\s+([A-Za-z0-9_]+)\s*\(/gm;
  let m;
  while ((m = re.exec(src))) {
    let i = src.indexOf('{', m.index), depth = 0, j = i;
    for (; j < src.length; j++) {
      const ch = src[j];
      if (ch === '"' || ch === "'") { const q = ch; for (j++; j < src.length && src[j] !== q; j++) if (src[j] === '\\') j++; continue; }
      if (ch === '/' && src[j + 1] === '/') { j = src.indexOf('\n', j); continue; }
      if (ch === '/' && src[j + 1] === '*') { j = src.indexOf('*/', j) + 1; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) break; }
    }
    fns.push({ name: m[1], body: src.slice(i, j + 1) });
  }
  const locked = fns.filter(f => /\bgetScriptLock\(\)/.test(f.body) && /\bgetSheet(Log|Pat)\(/.test(f.body));
  const missing = locked.filter(f => !/finally\s*\{[^}]*_bumpDataVersion\(\)/.test(f.body)).map(f => f.name);
  T.ok('source: ' + locked.length + ' locked functions touch Patient_Registry/Daily_Log', locked.length >= 8, locked.map(f => f.name));
  T.eq('source: every one of them bumps DATA_VERSION in its finally', missing, []);
  const expected = ['logDailyNutrition', 'updateDailyNutrition', 'publishDailyLog', 'deleteDailyNutrition', 'deletePatient', 'registerPatient', 'updateWeights', 'pseudonymizePatient'];
  T.eq('source: the known write paths are all in that set', expected.filter(n => !locked.some(f => f.name === n)), []);
  const onEdit = (fns.find(f => f.name === 'onEdit') || {}).body || '';
  T.ok('source: onEdit bumps for both data tabs', /Daily_Log/.test(onEdit) && /Patient_Registry/.test(onEdit) && /_bumpDataVersion\(\)/.test(onEdit));
});

T.done();
