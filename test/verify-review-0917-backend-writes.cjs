// verify-review-0917-backend-writes.cjs — pins the write-path fixes from the
// 2026-09-17 backend review: Praew's column-drift decision (A4) and
// sheetHealthReport, the Busy / SchemaMismatch / DuplicateDate contract at the
// doPost level, row re-checks (UP-B3), narrow in-lock reads (UP-B5), atomic
// publish / revision / erasure (UP-B8, UP-B9), deletePatient ordering (UP-B6,
// SEC-B14), the doPost revision passthrough (UP-B7), the log edit lock (UP-B13),
// entry dates (SEC-B12), the server half of the patient three-way merge (UP-S1,
// SEC-B6), measurement-array validation (SEC-B3), sex validation (F), and the
// Audit_Log grid trim (UP-B1).
//
// See gas-vm-sandbox.cjs for the Sheets double. No npm dependencies. Fails
// against the pre-review source (42ce553): NEOFEED_GAS_SRC=<that file>.
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const crypto = require('crypto');
const { boot, recorder, withNow, wardToday, addDays, bkkMidnight } = require('./gas-vm-sandbox.cjs');
const T = recorder('REVIEW 2026-09-17 BACKEND · WRITES');

const TODAY = wardToday();
const BUSY = { error: 'มีผู้ใช้อื่นกำลังบันทึก — ลองใหม่อีกครั้ง', code: 'Busy', retryable: true };
const MOVED = { error: 'แถวข้อมูลถูกย้ายระหว่างบันทึก (มีการแก้ไขชีตโดยตรง) — ไม่ได้บันทึก กรุณาซิงก์แล้วลองใหม่', retryable: true };
const E = (extra) => Object.assign({ dol: 5, weight: 1250, fluid: 150, gir: 6, pro: 3, kcal: 90, na: 3, k: 2, ca: 60, p: 40,
  enVolPerKg: 20, route: 'TPN central', status: 'submitted', calcInput: { wtG: 1250 } }, extra || {});
const P = (sid, extra) => Object.assign({
  sessionId: sid, name: 'ทารก ' + sid, initials: sid.slice(0, 2), bw: 900, ga: 28.1, sex: 'boys',
  dob: '2026-09-01', admissionDate: '2026-09-01', twinSuffix: '', status: 'Active',
  currentBed: '', diagnosis: 'RDS', weights: [{ dol: 1, w: 900 }], lengths: [], hcs: [], bedHistory: [],
  statusDate: '', multiplesCount: 0,
}, extra || {});
const snapshot = (g) => JSON.stringify(['Patient_Registry', 'Daily_Log'].map(n => g.sheet(n).data));

function ward(opts) {
  const g = boot(opts);
  g.addStaff('doc@kcmh.test', 'doctor', 'Doctor-Password-1');
  g.addStaff('nurse@kcmh.test', 'nurse', 'Nurse-Password-1');
  g.addStaff('admin@kcmh.test', 'admin', 'Admin-Password-1');
  g.dt = g.session('doc@kcmh.test', 'doctor');
  g.nt = g.session('nurse@kcmh.test', 'nurse');
  g.at = g.session('admin@kcmh.test', 'admin');
  g.as = (tok, body) => g.post(Object.assign({ token: tok }, body));
  g.synced = (sid, tok) => g.post({ action: 'getActivePatients', token: tok || g.dt }).patients.find(p => p.sessionId === sid);
  return g;
}

T.section('A4 · column-drift guard refuses saves, accepts blank optional headers, leaves reads alone', () => {
  const g = ward();
  const logHdr = g.sheet('Daily_Log').data[0];
  for (let c = 28; c < 38; c++) logHdr[c] = '';            // AC–AL never labelled on the live tab
  g.sheet('Patient_Registry').data[0][17] = '';            // R unlabelled too
  const reg = g.as(g.dt, { action: 'registerPatient', isNew: true, patient: P('AB-900') });
  T.ok('registration accepted with a blank optional header (R)', reg.ok === true, reg);
  const c1 = g.as(g.dt, { action: 'logDailyNutrition', sessionId: 'AB-900', entry: E({ ts: '2026-09-10' }) });
  T.ok('save accepted with AC–AL blank in row 1', !!c1.entryId, c1);
  const schemaEntry = g.cacheStore.get('schema1_Daily_Log');
  T.ok('the check result is cached for 10 minutes', schemaEntry && schemaEntry.ttl === 600, schemaEntry);

  // A column inserted by hand at N shifts every later label one to the right.
  g.sheet('Daily_Log').data.forEach(r => r.splice(13, 0, ''));
  g.sheet('Daily_Log').data[0][13] = 'note';
  g.sheet('Daily_Log').maxColumns += 1;
  const before = snapshot(g);
  const refused = withNow(Date.now() + 601e3, () => g.as(g.dt, { action: 'logDailyNutrition', sessionId: 'AB-900', entry: E({ ts: '2026-09-11' }) }));
  T.eq('after the cache window, a save is refused with the exact contract shape', refused, {
    error: "โครงสร้างคอลัมน์ใน Google Sheet ไม่ตรงกับที่ระบบคาด (Daily_Log!N: พบ 'note') — หยุดบันทึกเพื่อป้องกันข้อมูลลงผิดช่อง แจ้ง admin",
    code: 'SchemaMismatch' });
  T.eq('…and nothing was written', snapshot(g), before);
  const edit = withNow(Date.now() + 601e3, () => g.as(g.dt, { action: 'updateDailyNutrition', sessionId: 'AB-900', entryId: c1.entryId, expectedLastModified: c1.lastModified, entry: E() }));
  T.eq('an edit is refused the same way', edit.code, 'SchemaMismatch');
  const read = withNow(Date.now() + 601e3, () => g.as(g.dt, { action: 'getActivePatients' }));
  T.ok('a sync still works (reads are not guarded)', Array.isArray(read.patients) && read.patients.length === 1, read);

  const g2 = ward();
  g2.as(g2.dt, { action: 'registerPatient', isNew: true, patient: P('CD-1000') });
  g2.sheet('Patient_Registry').data[0][10] = 'bed';
  g2.sb._forgetSchemaCheck && g2.sb._forgetSchemaCheck('Patient_Registry');
  g2.cacheStore.delete('schema1_Patient_Registry');
  const before2 = snapshot(g2);
  const r2 = g2.as(g2.dt, { action: 'updatePatient', patient: P('CD-1000', { diagnosis: 'RDS, PDA' }) });
  T.eq('a registry edit under a wrong label is refused', r2, {
    error: "โครงสร้างคอลัมน์ใน Google Sheet ไม่ตรงกับที่ระบบคาด (Patient_Registry!K: พบ 'bed') — หยุดบันทึกเพื่อป้องกันข้อมูลลงผิดช่อง แจ้ง admin",
    code: 'SchemaMismatch' });
  T.eq('updateWeights too', g2.as(g2.dt, { action: 'updateWeights', sessionId: 'CD-1000', weights: [{ dol: 1, w: 1000 }] }).code, 'SchemaMismatch');
  T.eq('…and nothing was written', snapshot(g2), before2);
  // Fixing the header by typing in row 1 fires onEdit, which drops the cache.
  g2.sheet('Patient_Registry').data[0][10] = ' CurrentBed ';
  g2.sb.onEdit({ range: { getSheet: () => g2.sheet('Patient_Registry'), getRow: () => 1, getNumRows: () => 1 } });
  T.ok('fixed in row 1 (any case / spacing): the next save goes through at once', g2.as(g2.dt, { action: 'updatePatient', patient: P('CD-1000', { diagnosis: 'RDS, PDA' }) }).ok === true);
});

T.section('A4 · sheetHealthReport counts, and carries no email, name, ID or bed', () => {
  const g = ward();
  const T0 = TODAY;
  const reg = g.sheet('Patient_Registry').data;
  reg.push(g.patRow('KH-BW1090', { 1: 'สมหญิง ใจดี', 10: 'NICU 7' }));
  reg.push(g.patRow('FO-BW2025', { 1: 'Fo Mother', 9: 'Discharged', 16: '' }));
  reg.push(g.patRow('ZZ-BW777', { 1: 'Zed', 9: 'Transferred', 16: 'not a date' }));
  reg.push(g.patRow('OLD-BW1500', { 9: 'Discharged', 16: bkkMidnight(addDays(T0, -90)) }));
  reg.push(g.patRow('REC-BW1600', { 9: 'Discharged', 16: bkkMidnight(addDays(T0, -3)) }));
  reg.push(g.patRow('KH-BW1090', { 1: 'duplicate copy', 9: 'Discharged', 16: '' }));
  reg.push(g.patRow('BAD-BW900', { 12: '[null]', 5: 'M' }));
  const log = g.sheet('Daily_Log').data;
  log.push(g.logRow('KH-BW1090', bkkMidnight(addDays(T0, -2)), { 15: 'nurse.a@kcmh.test' }));
  log.push(g.logRow('BAD-BW900', bkkMidnight(addDays(T0, -45))));
  log.push(new Array(38).fill(''));
  log.push(g.logRow('KH-BW1090', bkkMidnight(addDays(T0, -1))));
  g.sheet('Daily_Log').data[0][24] = 'note';
  g.cacheStore.set('schema1_Daily_Log', { v: '{"ok":true}', exp: Date.now() + 600e3, ttl: 600 });
  const out = g.sb.sheetHealthReport();
  const text = JSON.stringify(out);
  const forbidden = ['@', 'KH-BW1090', 'FO-BW2025', 'ZZ-BW777', 'BAD-BW900', 'สมหญิง', 'Fo Mother', 'Zed', 'NICU 7', 'ทารก', 'doc', 'nurse'];
  T.eq('no email, name, sessionId or bed anywhere in the report', forbidden.filter(f => text.includes(f)), []);
  T.eq('registry rows', out.registry.rows, 7);
  T.eq('Active patients', out.registry.active, 2);
  T.eq('non-Active with no statusDate', out.registry.archivedNoStatusDate, 2);
  T.eq('non-Active with an unparseable statusDate', out.registry.archivedUnparseableStatusDate, 1);
  T.eq('duplicate sessionIds', out.registry.duplicateSessionIds, 1);
  T.eq('Active with no Daily_Log row in 30 days', out.registry.activeWithNoEntryIn30d, 1);
  T.eq('records whose stored arrays would now be refused', out.registry.measurementArraysFailingValidation, 1);
  T.eq('records with a sex other than boys/girls', out.registry.sexNotBoysOrGirls, 1);
  T.eq('Daily_Log rows (blank ones included) / blank rows', out.dailyLog, { rows: 4, blankRows: 1 });
  const dl = out.schema.find(s => s.tab === 'Daily_Log');
  T.ok('schema: Daily_Log reported as NOT ok at Y', dl && dl.ok === false && dl.mismatchedColumns.length === 1 && /^Y /.test(dl.mismatchedColumns[0]), dl);
  T.ok('schema: Patient_Registry ok', out.schema.find(s => s.tab === 'Patient_Registry').ok === true);
  T.ok('running it drops the cached check, so a fixed header is honoured at once', !g.cacheStore.has('schema1_Daily_Log'));
  const cells = Object.values(g.env.sheets).reduce((a, s) => a + s.getMaxRows() * s.maxColumns, 0);
  T.eq('workbook grid cells counted from rows × columns of every tab', out.workbookGridCells, cells);
  T.ok('percent of the 10,000,000-cell limit', out.cellLimit === 10000000 && /%$/.test(out.percentOfCellLimit), out.percentOfCellLimit);
});

T.section('contract B · Busy: a lock timeout on any write answers Busy and writes nothing', () => {
  const g = ward();
  g.as(g.dt, { action: 'registerPatient', isNew: true, patient: P('AB-900') });
  const c = g.as(g.dt, { action: 'logDailyNutrition', sessionId: 'AB-900', entry: E({ ts: '2026-09-10' }) });
  const before = snapshot(g);
  g.env.lockTimeout = true;
  const calls = [
    ['logDailyNutrition', g.dt, { sessionId: 'AB-900', entry: E({ ts: '2026-09-11' }) }],
    ['updateDailyNutrition', g.dt, { sessionId: 'AB-900', entryId: c.entryId, expectedLastModified: c.lastModified, entry: E({ pro: 3.5 }) }],
    ['publishLog', g.dt, { sessionId: 'AB-900', entryId: c.entryId, expectedLastModified: c.lastModified }],
    ['registerPatient', g.dt, { isNew: true, patient: P('CD-1000') }],
    ['updatePatient', g.dt, { patient: P('AB-900', { diagnosis: 'x' }) }],
    ['updateWeights', g.dt, { sessionId: 'AB-900', weights: [{ dol: 1, w: 900 }, { dol: 2, w: 905 }] }],
    ['deleteDailyNutrition', g.at, { sessionId: 'AB-900', entryId: c.entryId }],
    ['deletePatient', g.at, { sessionId: 'AB-900' }],
    ['pseudonymizePatient', g.at, { sessionId: 'AB-900' }],
  ];
  for (const [action, tok, extra] of calls) T.eq(action + ' → Busy', g.as(tok, Object.assign({ action }, extra)), BUSY);
  T.eq('…and not one cell changed', snapshot(g), before);
  T.ok('a sync is not blocked by the lock', Array.isArray(g.as(g.dt, { action: 'getActivePatients' }).patients));
  T.eq('login\'s short lockout lock answers Busy too (with status)', g.post({ action: 'login', email: 'doc@kcmh.test', password: 'Doctor-Password-1' }),
    Object.assign({}, BUSY, { status: 'error' }));
  g.env.lockTimeout = false;
});

T.section('UP-B5 · narrow in-lock reads match a full scan exactly, and read far less', () => {
  const g = ward();
  const sids = ['A-1', 'B-2', 'C-3', 'D-4', 'E-5'];
  sids.forEach(s => g.sheet('Patient_Registry').data.push(g.patRow(s)));
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const log = g.sheet('Daily_Log').data;
  for (let i = 0; i < 2000; i++) {
    if (rnd() < 0.01) { log.push(new Array(38).fill('')); continue; }
    const day = addDays(TODAY, -Math.floor(rnd() * 120));
    const ts = rnd() < 0.8 ? bkkMidnight(day) : day;
    log.push(g.logRow(sids[Math.floor(rnd() * sids.length)], ts, rnd() < 0.05 ? { 25: '' } : {}));
  }
  log.push(g.logRow('A-1', bkkMidnight(TODAY), { 25: log[5][25] }));   // a duplicate entryId: first match must win
  const sh = g.sheet('Daily_Log');
  const full = sh.data;
  let mismatches = 0, checked = 0;
  for (let i = 1; i < full.length; i += 3) {
    const id = full[i][25];
    const hit = g.sb._findLogRowByEntryId(sh, id);
    const ref = id ? full.findIndex((r, k) => k > 0 && String(r[25]) === String(id)) : -1;
    if (id) { checked++; if (!hit || hit.row !== ref + 1 || String(hit.data[25]) !== String(id)) mismatches++; }
    const sid = full[i][1];
    if (!sid) continue;
    const date = g.sb._wardDateKey(full[i][0]);
    const refRow = full.findIndex((r, k) => k > 0 && String(r[1]) === String(sid) && g.sb._wardDateKey(r[0]) === date);
    const got = g.sb._findLogEntryOnDate(sh, sid, date);
    if (!got || got.entryId !== String(full[refRow][25])) mismatches++;
  }
  T.ok('_findLogRowByEntryId / _findLogEntryOnDate agree with a full scan on ' + checked + ' lookups', mismatches === 0 && checked > 500, { mismatches, checked });
  T.eq('an absent entryId is null', g.sb._findLogRowByEntryId(sh, 'no-such-entry'), null);
  T.eq('_patientExists agrees (present / absent)', [g.sb._patientExists('C-3'), g.sb._patientExists('Z-9')], [true, false]);
  sh.stats.cellsRead = 0;
  const r = g.sb.logDailyNutrition('B-2', E({ ts: addDays(TODAY, 1) }), 'doc@kcmh.test');
  T.ok('a create against 2,000 rows succeeded', !!r.entryId, r);
  T.ok('…reading under 10% of the cells a full read would (' + sh.stats.cellsRead + ' vs ' + 2002 * 38 + ')', sh.stats.cellsRead < 2002 * 38 / 10, sh.stats.cellsRead);
});

T.section('UP-B3 · a row moved by hand between read and write is refused, never overwritten', () => {
  // Shift once, at the first of: the one-cell re-read the fix adds, or any write.
  const armShift = (sh, col) => {
    let fired = false;
    const shift = () => { if (fired) return; fired = true; sh.data.splice(1, 0, new Array(38).fill('')); };
    sh.hooks.beforeRead = (s, r, c, nr, nc) => { if (r > 1 && c === col && nr === 1 && nc === 1) shift(); };
    sh.hooks.beforeWrite = (s, kind) => { if (kind !== 'appendRow') shift(); };
  };
  const scenario = (label, setup, act, colFor) => {
    const g = ward();
    g.as(g.at, { action: 'registerPatient', isNew: true, patient: P('AA-1') });
    g.as(g.at, { action: 'registerPatient', isNew: true, patient: P('BB-2') });
    const ids = setup(g);
    const sheetName = colFor === 1 ? 'Patient_Registry' : 'Daily_Log';
    const beforeRows = JSON.stringify(g.rows(sheetName).filter(r => r.some(v => v !== '')));
    armShift(g.sheet(sheetName), colFor);
    const res = act(g, ids);
    g.sheet(sheetName).hooks = {};
    const afterRows = JSON.stringify(g.rows(sheetName).filter(r => r.some(v => v !== '')));
    T.eq(label + ': refused, retryable', res, MOVED);
    T.ok(label + ': no record changed', afterRows === beforeRows, { before: beforeRows.slice(0, 300), after: afterRows.slice(0, 300) });
  };
  const twoRows = (g) => {
    const a = g.as(g.at, { action: 'logDailyNutrition', sessionId: 'AA-1', entry: E({ ts: '2026-09-10' }) });
    const b = g.as(g.at, { action: 'logDailyNutrition', sessionId: 'BB-2', entry: E({ ts: '2026-09-10' }) });
    return { a, b };
  };
  scenario('draft update', twoRows, (g, x) => g.as(g.at, { action: 'updateDailyNutrition', sessionId: 'BB-2', entryId: x.b.entryId, expectedLastModified: x.b.lastModified, entry: E({ pro: 3.9 }) }), 26);
  scenario('publish', twoRows, (g, x) => g.as(g.at, { action: 'publishLog', sessionId: 'BB-2', entryId: x.b.entryId, expectedLastModified: x.b.lastModified }), 26);
  scenario('delete entry', twoRows, (g, x) => g.as(g.at, { action: 'deleteDailyNutrition', sessionId: 'BB-2', entryId: x.b.entryId }), 26);
  scenario('registry edit', () => ({}), (g) => g.as(g.at, { action: 'updatePatient', patient: P('BB-2', { diagnosis: 'moved?' }) }), 1);
  scenario('updateWeights', () => ({}), (g) => g.as(g.at, { action: 'updateWeights', sessionId: 'BB-2', weights: [{ dol: 1, w: 900 }, { dol: 3, w: 950 }] }), 1);
  scenario('erasure', () => ({}), (g) => g.as(g.at, { action: 'pseudonymizePatient', sessionId: 'BB-2' }), 1);
});

T.section('UP-B6 / SEC-B14 · deletePatient: log rows first, registry last, retry finishes, published refused', () => {
  const g = ward();
  g.as(g.at, { action: 'registerPatient', isNew: true, patient: P('AA-1') });
  g.as(g.at, { action: 'registerPatient', isNew: true, patient: P('BB-2') });
  ['2026-09-08', '2026-09-09', '2026-09-10'].forEach(d => g.as(g.at, { action: 'logDailyNutrition', sessionId: 'AA-1', entry: E({ ts: d }) }));
  g.as(g.at, { action: 'logDailyNutrition', sessionId: 'BB-2', entry: E({ ts: '2026-09-10' }) });
  const order = [];
  ['Patient_Registry', 'Daily_Log'].forEach(n => { g.sheet(n).hooks.beforeWrite = (s, kind) => { if (kind === 'deleteRow') order.push(n); }; });
  g.sheet('Daily_Log').throwOn.deleteRow = { skip: 1, once: true, err: new Error('Exceeded maximum execution time') };
  const first = g.as(g.at, { action: 'deletePatient', sessionId: 'AA-1' });
  T.ok('a timeout part-way reports an error', !!first.error, first);
  T.ok('…Daily_Log rows are deleted before the registry row is touched', !order.includes('Patient_Registry'), order);
  T.ok('…so the patient is still visible and deletable', g.rows('Patient_Registry').some(r => r[0] === 'AA-1'));
  const retry = g.as(g.at, { action: 'deletePatient', sessionId: 'AA-1' });
  T.ok('the retry finishes', retry.ok === true, retry);
  T.eq('…every AA-1 row gone, BB-2 untouched', [g.rows('Daily_Log').filter(r => r[1] === 'AA-1').length, g.rows('Patient_Registry').some(r => r[0] === 'AA-1'),
    g.rows('Daily_Log').filter(r => r[1] === 'BB-2').length], [0, false, 1]);
  T.eq('…and the registry row went last', order[order.length - 1], 'Patient_Registry');
  // Registry already gone, log rows left behind by an older partial delete.
  g.sheet('Daily_Log').data.push(g.logRow('CC-3', bkkMidnight('2026-09-01')), g.logRow('CC-3', bkkMidnight('2026-09-02')));
  const orphan = g.as(g.at, { action: 'deletePatient', sessionId: 'CC-3' });
  T.ok('orphan log rows with no registry row are cleaned up, not "not found"', orphan.ok === true && !g.rows('Daily_Log').some(r => r[1] === 'CC-3'), orphan);
  T.ok('nothing at all for the id is still "not found"', /ไม่พบ/.test(g.as(g.at, { action: 'deletePatient', sessionId: 'NOPE-9' }).error || ''));
  const pub = g.as(g.at, { action: 'logDailyNutrition', sessionId: 'BB-2', entry: E({ ts: '2026-09-11' }) });
  g.as(g.at, { action: 'publishLog', sessionId: 'BB-2', entryId: pub.entryId, expectedLastModified: pub.lastModified });
  const auditBefore = g.audit().length, rowsBefore = snapshot(g);
  const refused = g.as(g.at, { action: 'deletePatient', sessionId: 'BB-2' });
  T.ok('a patient with a submitted (published) row cannot be deleted', /Submit/.test(refused.error || ''), refused);
  T.eq('…nothing deleted, and no start row written', [snapshot(g) === rowsBefore, g.audit().length], [true, auditBefore]);
});

T.section('UP-B7 · doPost forwards revised / entryId / revisionNumber', () => {
  const g = ward();
  g.as(g.dt, { action: 'registerPatient', isNew: true, patient: P('AB-900') });
  const c = g.as(g.dt, { action: 'logDailyNutrition', sessionId: 'AB-900', entry: E({ ts: '2026-09-10' }) });
  const p = g.as(g.dt, { action: 'publishLog', sessionId: 'AB-900', entryId: c.entryId, expectedLastModified: c.lastModified });
  const lm = g.rows('Daily_Log')[0][26];
  const rev = g.as(g.dt, { action: 'updateDailyNutrition', sessionId: 'AB-900', entryId: c.entryId, expectedLastModified: lm, entry: E({ pro: 3.6 }) });
  T.ok('publish ok', p.ok === true, p);
  T.eq('the response carries the revision fields the client branches on', Object.keys(rev).sort(), ['entryId', 'lastModified', 'ok', 'revised', 'revisionNumber']);
  T.ok('…with the NEW entryId and revision 2', rev.revised === true && rev.entryId !== c.entryId && rev.revisionNumber === 2 && rev.entryId === g.rows('Daily_Log')[1][25], rev);
  const draft = g.as(g.dt, { action: 'logDailyNutrition', sessionId: 'AB-900', entry: E({ ts: '2026-09-11' }) });
  const upd = g.as(g.dt, { action: 'updateDailyNutrition', sessionId: 'AB-900', entryId: draft.entryId, expectedLastModified: draft.lastModified, entry: E({ pro: 3.1 }) });
  T.eq('a draft edit still answers { ok, lastModified } only', Object.keys(upd).sort(), ['lastModified', 'ok']);
});

T.section('UP-B8 · a failed supersede never leaves two current rows for one day', () => {
  const g = ward();
  g.as(g.dt, { action: 'registerPatient', isNew: true, patient: P('AB-900') });
  const c = g.as(g.dt, { action: 'logDailyNutrition', sessionId: 'AB-900', entry: E({ ts: '2026-09-10' }) });
  g.as(g.dt, { action: 'publishLog', sessionId: 'AB-900', entryId: c.entryId, expectedLastModified: c.lastModified });
  const lm = g.rows('Daily_Log')[0][26];
  const current = () => g.rows('Daily_Log').filter(r => r[1] === 'AB-900' && !r[37]).length;
  const failure = new Error('Service Spreadsheets failed while accessing document');
  g.sheet('Daily_Log').throwOn.setValues = { once: true, err: failure };
  g.sheet('Daily_Log').throwOn.setValue = { once: true, err: failure };
  const r1 = g.as(g.dt, { action: 'updateDailyNutrition', sessionId: 'AB-900', entryId: c.entryId, expectedLastModified: lm, entry: E({ pro: 3.5 }) });
  g.sheet('Daily_Log').throwOn = {};
  T.ok('the failure is reported', !!r1.error && !r1.ok, r1);
  T.eq('…the appended revision was removed: one row, still current', [g.rows('Daily_Log').length, current()], [1, 1]);
  const r2 = g.as(g.dt, { action: 'updateDailyNutrition', sessionId: 'AB-900', entryId: c.entryId, expectedLastModified: lm, entry: E({ pro: 3.5 }) });
  T.ok('the retry revises', r2.revised === true, r2);
  T.eq('…leaving exactly one current row', current(), 1);
  const old = g.rows('Daily_Log')[0];
  T.ok('…the old row superseded, with lastModified advanced in the same write', !!old[37] && old[26] === old[37], old.slice(26, 38));
});

T.section('UP-B9 · publish and erasure are single writes', () => {
  const g = ward();
  g.as(g.at, { action: 'registerPatient', isNew: true, patient: P('AB-900') });
  const c = g.as(g.dt, { action: 'logDailyNutrition', sessionId: 'AB-900', entry: E({ ts: '2026-09-10' }) });
  const failure = new Error('Service Spreadsheets failed while accessing document');
  g.sheet('Daily_Log').throwOn.setValues = { once: true, err: failure };
  g.sheet('Daily_Log').throwOn.setValue = { skip: 1, once: true, err: failure };
  const r1 = g.as(g.dt, { action: 'publishLog', sessionId: 'AB-900', entryId: c.entryId, expectedLastModified: c.lastModified });
  g.sheet('Daily_Log').throwOn = {};
  const row = g.rows('Daily_Log')[0];
  T.ok('a failed publish reports an error', !!r1.error, r1);
  T.eq('…and leaves NEITHER published nor publishedBy set', [row[33], row[34]], ['', '']);
  const r2 = g.as(g.dt, { action: 'publishLog', sessionId: 'AB-900', entryId: c.entryId, expectedLastModified: c.lastModified });
  T.ok('so it can still be signed on retry', r2.ok === true && !r2.alreadyPublished && g.rows('Daily_Log')[0][34] === 'doc@kcmh.test', r2);

  const reg = g.sheet('Patient_Registry');
  const beforeIdentity = JSON.stringify([reg.data[1][1], reg.data[1][2], reg.data[1][6]]);
  reg.throwOn.setValues = { once: true, err: failure };
  reg.throwOn.setValue = { skip: 1, once: true, err: failure };
  const e1 = g.as(g.at, { action: 'pseudonymizePatient', sessionId: 'AB-900' });
  reg.throwOn = {};
  T.ok('a failed erasure reports an error', !!e1.error, e1);
  T.eq('…and leaves name, initials and dob all as they were (never half-erased)', JSON.stringify([reg.data[1][1], reg.data[1][2], reg.data[1][6]]), beforeIdentity);
  const e2 = g.as(g.at, { action: 'pseudonymizePatient', sessionId: 'AB-900' });
  T.ok('the retry erases all three, keeping bw/ga/sex', e2.ok === true && /^\[PDPA-erased/.test(reg.data[1][1]) && reg.data[1][2] === '' && reg.data[1][6] === '' &&
    reg.data[1][3] === 900 && reg.data[1][4] === 28.1 && reg.data[1][5] === 'boys', reg.data[1]);
});

T.section('UP-B13 · a corrupt edit-lock value reads as unheld', () => {
  const g = ward();
  g.cacheStore.set('loglock_AB-900_2026-09-17', { v: 'not json {', exp: Date.now() + 60e3, ttl: 90 });
  T.eq('acquireLogLock answers normally', g.as(g.dt, { action: 'acquireLogLock', sessionId: 'AB-900', date: '2026-09-17' }), { ok: true, locked: false });
  g.cacheStore.set('loglock_AB-900_2026-09-17', { v: 'null', exp: Date.now() + 60e3, ttl: 90 });
  T.eq('releaseLogLock answers normally', g.as(g.dt, { action: 'releaseLogLock', sessionId: 'AB-900', date: '2026-09-17' }), { ok: true });
  T.ok('…and clears the unreadable value', !g.cacheStore.has('loglock_AB-900_2026-09-17'));
  g.as(g.nt, { action: 'acquireLogLock', sessionId: 'AB-900', date: '2026-09-17' });
  T.eq('a real holder still blocks someone else', g.as(g.dt, { action: 'acquireLogLock', sessionId: 'AB-900', date: '2026-09-17' }).locked, true);
});

T.section('SEC-B12 · entry dates are real YYYY-MM-DD, normalised before the duplicate guard', () => {
  const g = ward();
  g.as(g.dt, { action: 'registerPatient', isNew: true, patient: P('AB-900') });
  const first = g.as(g.dt, { action: 'logDailyNutrition', sessionId: 'AB-900', entry: E({ ts: '2026-09-10' }) });
  T.ok('a canonical date saves', !!first.entryId, first);
  const dup = g.as(g.dt, { action: 'logDailyNutrition', sessionId: 'AB-900', entry: E({ ts: '2026-09-10' }) });
  T.eq('a duplicate keeps the Thai message and adds code + the existing entryId', dup,
    { error: 'มีบันทึกของผู้ป่วยรายนี้ในวันที่ 2026-09-10 แล้ว — กรุณาเปิดรายการเดิมเพื่อแก้ไข', code: 'DuplicateDate', entryId: first.entryId });
  T.eq('" 2026-09-10" is trimmed first — and is then the same day', g.as(g.dt, { action: 'logDailyNutrition', sessionId: 'AB-900', entry: E({ ts: ' 2026-09-10' }) }).code, 'DuplicateDate');
  const bad = ['2026-9-10', '2026/09/10', '2026-02-30', '10-09-2026', 20260910].map(ts =>
    g.as(g.dt, { action: 'logDailyNutrition', sessionId: 'AB-900', entry: E({ ts }) }).error);
  T.eq('non-canonical or impossible dates are refused', bad.map(e => e === 'วันที่ของบันทึกไม่ถูกต้อง — ต้องเป็นวันที่จริงในรูปแบบ YYYY-MM-DD'), [true, true, true, true, true]);
  T.eq('two days ahead is refused', g.as(g.dt, { action: 'logDailyNutrition', sessionId: 'AB-900', entry: E({ ts: addDays(TODAY, 2) }) }).error,
    'วันที่ของบันทึกเลยวันนี้เกิน 1 วัน — ตรวจสอบวันที่อีกครั้ง');
  T.ok('one day ahead is allowed', !!g.as(g.dt, { action: 'logDailyNutrition', sessionId: 'AB-900', entry: E({ ts: addDays(TODAY, 1) }) }).entryId);
  const noTs = g.as(g.dt, { action: 'logDailyNutrition', sessionId: 'AB-900', entry: E() });
  T.ok('no ts still means the ward\'s today', !!noTs.entryId && g.sb._wardDateKey(g.rows('Daily_Log').slice(-1)[0][0]) === TODAY, noTs);
  T.eq('only the three good saves reached the sheet', g.rows('Daily_Log').length, 3);
});

T.section('UP-S1 · three-way merge: a stale device no longer erases another device\'s work', () => {
  const W0 = [{ dol: 1, w: 900, l: 34, hc: 24 }, { dol: 8, w: 880, l: null, hc: null }];
  const g = ward();
  g.as(g.dt, { action: 'registerPatient', isNew: true, patient: P('AA-BW900', { weights: W0, currentBed: 'NICU 3' }) });
  const deviceB = g.synced('AA-BW900');                            // 08:00 snapshot on the workstation
  const deviceA = g.synced('AA-BW900', g.nt);
  const addA = g.as(g.nt, { action: 'updateWeights', sessionId: 'AA-BW900', baseWeights: deviceA.weights,
    weights: deviceA.weights.concat([{ dol: 17, w: 1010, l: 36, hc: 26 }]) });
  T.ok('08:02 device A logs DOL 17', addA.ok === true, addA);
  const move = g.as(g.dt, { action: 'updatePatient', base: deviceB,
    patient: Object.assign({}, deviceB, { currentBed: 'SCN 4', bedHistory: [{ bed: 'NICU 3', date: TODAY }] }) });
  T.ok('08:03 device B (stale) moves the bed', move.ok === true, move);
  const now = g.synced('AA-BW900');
  T.ok('the DOL-17 measurement survives the stale whole-record save', now.weights.some(w => w.dol === 17 && w.w === 1010 && w.l === 36), now.weights);
  T.eq('…and the bed move itself landed', [now.currentBed, now.bedHistory], ['SCN 4', [{ bed: 'NICU 3', date: TODAY }]]);

  const s1 = g.synced('AA-BW900'), s2 = g.synced('AA-BW900', g.nt);
  g.as(g.dt, { action: 'updateWeights', sessionId: 'AA-BW900', baseWeights: s1.weights, weights: s1.weights.concat([{ dol: 18, w: 1020, l: null, hc: null }]) });
  g.as(g.nt, { action: 'updateWeights', sessionId: 'AA-BW900', baseWeights: s2.weights, weights: s2.weights.concat([{ dol: 19, w: 1035, l: null, hc: null }]) });
  T.eq('two devices logging different days both keep theirs, in dol order', g.synced('AA-BW900').weights.map(w => w.dol), [1, 8, 17, 18, 19]);

  const s3 = g.synced('AA-BW900'), s4 = g.synced('AA-BW900', g.nt);
  g.as(g.nt, { action: 'updateWeights', sessionId: 'AA-BW900', baseWeights: s4.weights, weights: s4.weights.map(w => w.dol === 8 ? Object.assign({}, w, { w: 885 }) : w) });
  g.as(g.dt, { action: 'updateWeights', sessionId: 'AA-BW900', baseWeights: s3.weights, weights: s3.weights.filter(w => w.dol !== 8) });
  T.ok('a stale delete of an entry edited elsewhere keeps the edit', g.synced('AA-BW900').weights.some(w => w.dol === 8 && w.w === 885));
  const s5 = g.synced('AA-BW900');
  g.as(g.dt, { action: 'updateWeights', sessionId: 'AA-BW900', baseWeights: s5.weights, weights: s5.weights.filter(w => w.dol !== 8) });
  T.ok('a delete of an entry nobody else touched removes it', !g.synced('AA-BW900').weights.some(w => w.dol === 8));

  const s6 = g.synced('AA-BW900'), stale = g.synced('AA-BW900', g.nt);
  g.as(g.dt, { action: 'updatePatient', base: s6, patient: Object.assign({}, s6, { status: 'Discharged', statusDate: TODAY, currentBed: 'SCN 4' }) });
  g.as(g.nt, { action: 'updatePatient', base: stale, patient: Object.assign({}, stale, { diagnosis: 'RDS, PDA' }) });
  const after = g.synced('AA-BW900');
  T.eq('a stale diagnosis edit cannot undo a discharge (status + statusDate kept)', [after.status, after.statusDate, after.diagnosis], ['Discharged', TODAY, 'RDS, PDA']);

  const s7 = g.synced('AA-BW900'), s8 = g.synced('AA-BW900', g.nt);
  g.as(g.dt, { action: 'updatePatient', base: s7, patient: Object.assign({}, s7, { bedHistory: s7.bedHistory.concat([{ bed: 'SCN 4', date: TODAY, note: 'x' }]) }) });
  g.as(g.nt, { action: 'updatePatient', base: s8, patient: Object.assign({}, s8, { bedHistory: s8.bedHistory.concat([{ bed: 'SCN 9', date: TODAY }]) }) });
  T.eq('bedHistory is append-only: both devices\' entries kept', g.synced('AA-BW900').bedHistory.length, 3);

  // Old clients (no base) keep the old whole-record behaviour.
  const g2 = ward();
  g2.as(g2.dt, { action: 'registerPatient', isNew: true, patient: P('OLD-1', { weights: W0 }) });
  const oldSnap = g2.synced('OLD-1');
  g2.as(g2.nt, { action: 'updateWeights', sessionId: 'OLD-1', weights: oldSnap.weights.concat([{ dol: 17, w: 1010 }]) });
  g2.as(g2.dt, { action: 'updatePatient', patient: Object.assign({}, oldSnap, { diagnosis: 'no base' }) });
  T.ok('without base the write is the old whole record (documented, not merged)', !g2.synced('OLD-1').weights.some(w => w.dol === 17));

  const g3 = ward();
  g3.as(g3.dt, { action: 'registerPatient', isNew: true, patient: P('GONE-1') });
  const gone = g3.synced('GONE-1');
  g3.as(g3.at, { action: 'deletePatient', sessionId: 'GONE-1' });
  const res = g3.as(g3.dt, { action: 'updatePatient', base: gone, patient: Object.assign({}, gone, { diagnosis: 'late edit' }) });
  T.ok('an edit with base of a patient deleted elsewhere is refused, not resurrected', !!res.error && g3.rows('Patient_Registry').length === 0, res);

  const g4 = ward();
  g4.sheet('Patient_Registry').data.push(g4.patRow('LEG-1', { 10: 'NICU 1-1' }));
  const leg = g4.synced('LEG-1');
  leg.currentBed = 'NICU 1';                                         // the client normalises on ingest
  g4.as(g4.dt, { action: 'updatePatient', base: leg, patient: Object.assign({}, leg, { diagnosis: 'edited' }) });
  T.eq('an untouched legacy bed spelling is written back canonical', g4.rows('Patient_Registry')[0][10], 'NICU 1');

  const g5 = ward();
  g5.as(g5.at, { action: 'registerPatient', isNew: true, patient: P('X-1', { currentBed: 'NICU 5' }) });
  const staleX = g5.synced('X-1');
  g5.as(g5.at, { action: 'updatePatient', base: staleX, patient: Object.assign({}, staleX, { status: 'Discharged', statusDate: TODAY }) });
  g5.as(g5.at, { action: 'registerPatient', isNew: true, patient: P('Y-2', { currentBed: 'NICU 5' }) });
  const ok5 = g5.as(g5.nt, { action: 'updatePatient', base: staleX, patient: Object.assign({}, staleX, { diagnosis: 'late note' }) });
  T.ok('the bed check runs on the merged record: a stale "Active" cannot claim a reused bed', ok5.ok === true && g5.rows('Patient_Registry')[0][9] === 'Discharged', ok5);
});

T.section('SEC-B6 · a PDPA erasure cannot be undone by any registry write', () => {
  const g = ward();
  g.as(g.dt, { action: 'registerPatient', isNew: true, patient: P('CD-1000', { name: 'CD', initials: 'CD', dob: '2026-08-20', currentBed: 'NICU 4' }) });
  const snap = g.synced('CD-1000');
  T.ok('erase', g.as(g.at, { action: 'pseudonymizePatient', sessionId: 'CD-1000' }).ok === true);
  g.as(g.dt, { action: 'updatePatient', patient: Object.assign({}, snap, { currentBed: 'NICU 5' }) });
  const r = g.rows('Patient_Registry')[0];
  T.ok('a stale edit WITHOUT base keeps name/initials/dob erased', /^\[PDPA-erased/.test(r[1]) && r[2] === '' && r[6] === '' && r[10] === 'NICU 5', r);
  g.as(g.dt, { action: 'updatePatient', base: snap, patient: Object.assign({}, snap, { name: 'CD again', diagnosis: 'x' }) });
  const r2 = g.rows('Patient_Registry')[0];
  T.ok('an edit WITH base that changes the name still cannot restore it', /^\[PDPA-erased/.test(r2[1]) && r2[2] === '' && r2[6] === '' && r2[11] === 'x', r2);
});

T.section('F · sex must be boys/girls on create; a legacy stored value may ride along unchanged', () => {
  const g = ward();
  T.ok('create with "M" is refused', !!g.as(g.dt, { action: 'registerPatient', isNew: true, patient: P('S-1', { sex: 'M' }) }).error);
  T.ok('create with no sex is refused', !!g.as(g.dt, { action: 'registerPatient', isNew: true, patient: P('S-2', { sex: '' }) }).error);
  T.ok('create with "girls" saves', g.as(g.dt, { action: 'registerPatient', isNew: true, patient: P('S-3', { sex: 'girls' }) }).ok === true);
  g.sheet('Patient_Registry').data.push(g.patRow('LEG-9', { 5: 'M' }));
  const leg = g.synced('LEG-9');
  T.ok('an old-client edit carrying the stored "M" unchanged saves', g.as(g.dt, { action: 'updatePatient', patient: Object.assign({}, leg, { diagnosis: 'a' }) }).ok === true);
  T.ok('a base edit with sex untouched saves', g.as(g.dt, { action: 'updatePatient', base: leg, patient: Object.assign({}, leg, { diagnosis: 'b' }) }).ok === true);
  T.ok('changing it to another invalid value is refused', !!g.as(g.dt, { action: 'updatePatient', patient: Object.assign({}, leg, { sex: 'x' }) }).error);
  T.ok('correcting it to "girls" saves', g.as(g.dt, { action: 'updatePatient', patient: Object.assign({}, leg, { sex: 'girls' }) }).ok === true);
});

T.section('SEC-B3 · malformed measurement arrays are refused on every path', () => {
  const g = ward();
  g.as(g.dt, { action: 'registerPatient', isNew: true, patient: P('AB-900') });
  const before = snapshot(g);
  const bad = [
    ['weights "x"', { weights: 'x' }], ['weights [null]', { weights: [null] }], ['weights w=99999', { weights: [{ dol: 2, w: 99999 }] }],
    ['weights dol "a"', { weights: [{ dol: 'a', w: 900 }] }], ['weights no dol', { weights: [{ w: 900 }] }], ['weights dol 401', { weights: [{ dol: 401, w: 900 }] }],
    ['weights inline l=5', { weights: [{ dol: 2, w: null, l: 5, hc: null }] }], ['lengths v=5', { lengths: [{ dol: 1, v: 5 }] }],
    ['hcs 401 entries', { hcs: Array.from({ length: 401 }, (_, i) => ({ dol: i % 400, v: 30 })) }], ['hcs v=80', { hcs: [{ dol: 1, v: 80 }] }],
    ['bedHistory [null]', { bedHistory: [null] }], ['bedHistory [[1]]', { bedHistory: [[1]] }],
  ];
  bad.forEach(([label, patch], i) => {
    T.ok('updatePatient ' + label + ' refused', !!g.as(g.dt, { action: 'updatePatient', patient: P('AB-900', patch) }).error);
    // a distinct id each time, so a refusal cannot come from the collision guard instead
    T.ok('registerPatient (new) ' + label + ' refused', !!g.as(g.dt, { action: 'registerPatient', isNew: true, patient: P('NEW-' + i, patch) }).error);
  });
  for (const [label, w] of [['"x"', 'x'], ['[null]', [null]], ['w=99999', [{ dol: 2, w: 99999 }]], ['missing', undefined]]) {
    T.ok('updateWeights ' + label + ' refused', !!g.as(g.dt, { action: 'updateWeights', sessionId: 'AB-900', weights: w }).error);
  }
  T.eq('…none of it reached the sheet', snapshot(g), before);
  const good = g.as(g.dt, { action: 'updateWeights', sessionId: 'AB-900', weights: [{ dol: 1, w: 900 }, { dol: 5, w: null, l: 36.5, hc: 26 }] });
  T.ok('a length/HC-only entry (w null) is still accepted', good.ok === true, good);
  const synced = g.synced('AB-900');
  T.ok('every synced array is an array of objects', ['weights', 'lengths', 'hcs', 'bedHistory'].every(f => Array.isArray(synced[f]) && synced[f].every(x => x && typeof x === 'object')));
});

T.section('UP-B1 · a newly created Audit_Log tab is 4 columns, not 26', () => {
  const g = ward();
  delete g.env.sheets.Audit_Log;
  g.sb.logAudit('readRegistry', '', 'doc@kcmh.test');
  T.eq('grid trimmed to A–D on creation', g.sheet('Audit_Log').maxColumns, 4);
  T.eq('…with the header and the row intact', g.sheet('Audit_Log').data.map(r => r.slice(0, 2)), [['ts', 'action'], [g.sheet('Audit_Log').data[1][0], 'readRegistry']]);
});

T.done();
