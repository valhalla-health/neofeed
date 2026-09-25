// verify-nursing-backend.cjs — UX roadmap #4, the nursing Intake/Output backend
// (docs/NURSING_FORM_SPEC.md; Pp's decisions 2026-09-24). Uses the shared
// Sheets double (gas-vm-sandbox.cjs); no npm dependencies.
//
//   §0  The go-live switch (D7): with the Script Property NURSING_LOG_ENABLED
//       unset this backend is the one before the nursing form — the sync has
//       no `nursing`, the nursing actions refuse (NotEnabled), nurses still
//       save orders. Flipping it on or off is seen on the next sync, with no
//       write in between; erasure (deletePatient) works either way; an
//       unreadable property reads as off.
//   §1  Nursing_Log is created on the first nursing SAVE, at exactly its 13
//       columns (insertSheet makes 26, and empty cells count against the
//       workbook cap) — and never by a sync, which only reads.
//   §2  D3: nurse, doctor and admin record; only admin deletes.
//   §3  D5: a nurse can no longer save, edit or submit a TPN order — the
//       Calculator is still the nurse's to compute with — while registry
//       edits and growth measurements stay nursing work.
//   §4  Validation: blank stays blank (never 0), plausibility bounds, whole
//       stools, feed type from a list and never free text, an empty record
//       refused, an unregistered patient refused, dates checked — in Thai.
//   §5  One row per patient per date (DuplicateDate + the existing entryId);
//       an edit keeps the date and the original author; a stale edit is a
//       conflict, not an overwrite.
//   §6  The sync carries the rows: blanks as null, a measured 0 as 0, only
//       for patients in the sync window — and a save shows on the very next
//       sync (DATA_VERSION bump through the payload cache). A payload the
//       previous deploy cached (no `nursing`) is never served after this one,
//       nor, switched on, a stale payload after a failed version bump.
//   §7  Accountability (PDPA Sec 39): every write is an Audit_Log row; a
//       delete is recorded before anything is destroyed.
//   §8  Formula injection: nothing a client sends lands as a live formula;
//       appVersion is a build token or blank, never a note.
//   §9  deletePatient takes the patient's Nursing_Log rows with it, and no one
//       else's.
//   §10 The column-drift guard covers Nursing_Log.
//
// NEGATIVE CONTROL — every section goes red against the pre-nursing backend:
//   git show 68e302f:gas-backend.gs > /tmp/gas-68e302f.gs
//   NEOFEED_GAS_SRC=/tmp/gas-68e302f.gs node test/verify-nursing-backend.cjs
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const { boot, recorder, wardToday, addDays, withNow } = require('./gas-vm-sandbox.cjs');
const T = recorder('NURSING BACKEND');

const TODAY = wardToday();
const NURSING_HEADERS = ['ts', 'sessionId', 'ivInMl', 'enInMl', 'feedType', 'urineMl', 'drainMl', 'stoolCount',
  'entryId', 'enteredBy', 'lastModified', 'lastModifiedBy', 'appVersion'];
const E = (extra) => Object.assign({ dol: 5, weight: 1250, fluid: 150, gir: 6, pro: 3, kcal: 90,
  na: 3, k: 2, ca: 60, p: 40, enVolPerKg: 20, route: 'TPN central', status: 'submitted',
  calcInput: { wtG: 1250 } }, extra || {});
const N = (extra) => Object.assign({ ts: TODAY, ivInMl: 120, enInMl: 40, feedType: 'BM_20',
  urineMl: 80, drainMl: 0, stoolCount: 2, appVersion: 'test' }, extra || {});
const isThai = (s) => /[฀-๿]/.test(String(s || ''));

// Every section but §0 runs with the go-live switch ON — the behaviour the
// ward gets after the DPO's sign-off. §0 is the switch itself.
function ward(opts, { nursing = true } = {}) {
  const g = boot(opts);
  if (nursing) g.props.set('NURSING_LOG_ENABLED', 'true');
  g.addStaff('doc@kcmh.test', 'doctor', 'Doctor-Password-1');
  g.addStaff('nur@kcmh.test', 'nurse', 'Nurse-Password-1');
  g.addStaff('adm@kcmh.test', 'admin', 'Admin-Password-1');
  g.dt = g.session('doc@kcmh.test', 'doctor');
  g.nt = g.session('nur@kcmh.test', 'nurse');
  g.at = g.session('adm@kcmh.test', 'admin');
  g.as = (tok, body) => g.post(Object.assign({ token: tok }, body));
  g.sheet('Patient_Registry').data.push(g.patRow('AA-900'), g.patRow('BB-900'));
  return g;
}
const nursingRows = (g) => (g.sheet('Nursing_Log') ? g.rows('Nursing_Log') : []);
const sync = (g, tok) => JSON.parse(g.postText({ action: 'getActivePatients', token: tok || g.dt }));

// ════════════════════════════════════════════════════════════════════════
T.section('§0 Off until switched on: deploying this code changes nothing (D7)', () => {
  const g = ward(undefined, { nursing: false });
  const s = sync(g);
  T.eq('switch unset: the sync keeps its old shape — no `nursing` key at all', Object.keys(s).sort(), ['log', 'patients', 'ts']);
  for (const action of ['logNursingEntry', 'updateNursingEntry', 'deleteNursingEntry']) {
    const r = g.as(action === 'deleteNursingEntry' ? g.at : g.nt,
      { action, sessionId: 'AA-900', entryId: 'x', expectedLastModified: 'y', entry: N() });
    T.eq(`${action} is refused as NotEnabled, in Thai`, [r.code, isThai(r.error)], ['NotEnabled', true]);
  }
  T.ok('…and no Nursing_Log tab is created', !g.sheet('Nursing_Log'));
  const nLog = g.as(g.nt, { action: 'logDailyNutrition', sessionId: 'AA-900', entry: E({ ts: TODAY }) });
  T.ok('a nurse still saves an order, exactly as before (no D5 yet)', nLog.ok === true && !!nLog.entryId, nLog);
  for (const v of ['TRUE', '1', 'yes', ' true']) {
    g.props.set('NURSING_LOG_ENABLED', v);
    T.ok(`"${v}" is not "true": still off`, !('nursing' in sync(g)));
  }
  // Flipping it is seen on the very next sync — no write in between, so
  // DATA_VERSION has not moved: the cache key carries the switch.
  g.props.set('NURSING_LOG_ENABLED', 'true');
  const on = sync(g);
  T.eq('switched on: the next sync carries `nursing`, with no write in between', on.nursing, {});
  const nLog2 = g.as(g.nt, { action: 'logDailyNutrition', sessionId: 'AA-900', entry: E({ ts: addDays(TODAY, -1) }) });
  T.eq('…and a nurse\'s order save is now refused (D5)', nLog2.code, 'Forbidden');
  const rec = g.as(g.nt, { action: 'logNursingEntry', sessionId: 'AA-900', entry: N() });
  T.ok('…and the nurse records I/O instead', rec.ok === true, rec);
  g.props.delete('NURSING_LOG_ENABLED');
  T.ok('switched off again: the next sync has no `nursing`', !('nursing' in sync(g)));
  const nLog3 = g.as(g.nt, { action: 'logDailyNutrition', sessionId: 'AA-900', entry: E({ ts: addDays(TODAY, -2) }) });
  T.ok('…and nurses save orders again', nLog3.ok === true, nLog3);
  // Erasure does not wait for the switch: rows written while it was on go
  // with the patient.
  const del = g.as(g.at, { action: 'deletePatient', sessionId: 'AA-900' });
  T.ok('switched off, deletePatient still succeeds', del.ok === true, del);
  T.eq('…and still takes the patient\'s Nursing_Log rows', nursingRows(g).filter(r => r[1] === 'AA-900').length, 0);
  // A Script Properties outage reads as OFF: the behaviour before the form.
  const g2 = ward();
  T.eq('fixture: a ward switched on reads it as on', g2.sb._nursingEnabled(), true);
  g2.env.propsThrow = true;
  T.eq('…and as OFF while Script Properties cannot be read (never throws)', g2.sb._nursingEnabled(), false);
  g2.env.propsThrow = false;
});

// ════════════════════════════════════════════════════════════════════════
T.section('§1 Nursing_Log appears on the first save, at 13 columns, never on a read', () => {
  const g = ward();
  const s = sync(g);
  T.ok('a sync on a sheet with no Nursing_Log answers', Array.isArray(s.patients), s);
  T.ok('…does NOT create the tab', !g.sheet('Nursing_Log'));
  T.eq('…and carries an empty nursing map', s.nursing, {});
  const r = g.as(g.nt, { action: 'logNursingEntry', sessionId: 'AA-900', entry: N() });
  T.ok('the first nursing save succeeds', r.ok === true && !!r.entryId, r);
  const sh = g.sheet('Nursing_Log');
  T.ok('…and creates the tab', !!sh);
  T.eq('…with the 13 headers', sh && sh.data[0], NURSING_HEADERS);
  T.eq('…trimmed to exactly 13 columns (not insertSheet\'s 26)', sh && sh.maxColumns, 13);
});

// ════════════════════════════════════════════════════════════════════════
T.section('§2 D3: every role records; only admin deletes', () => {
  const g = ward();
  const byNurse = g.as(g.nt, { action: 'logNursingEntry', sessionId: 'AA-900', entry: N({ ts: addDays(TODAY, -2) }) });
  const byDoc = g.as(g.dt, { action: 'logNursingEntry', sessionId: 'AA-900', entry: N({ ts: addDays(TODAY, -1) }) });
  const byAdmin = g.as(g.at, { action: 'logNursingEntry', sessionId: 'AA-900', entry: N({ ts: TODAY }) });
  T.ok('a nurse records', byNurse.ok === true, byNurse);
  T.ok('a doctor records', byDoc.ok === true, byDoc);
  T.ok('an admin records (D3: admin does everything)', byAdmin.ok === true, byAdmin);
  const upd = g.as(g.at, { action: 'updateNursingEntry', sessionId: 'AA-900', entryId: byNurse.entryId,
    expectedLastModified: byNurse.lastModified, entry: N({ urineMl: 95 }) });
  T.ok('an admin edits a nurse\'s record', upd.ok === true, upd);
  T.eq('a nurse cannot delete', g.as(g.nt, { action: 'deleteNursingEntry', sessionId: 'AA-900', entryId: byDoc.entryId }), { error: 'Forbidden' });
  T.eq('a doctor cannot delete', g.as(g.dt, { action: 'deleteNursingEntry', sessionId: 'AA-900', entryId: byDoc.entryId }), { error: 'Forbidden' });
  const del = g.as(g.at, { action: 'deleteNursingEntry', sessionId: 'AA-900', entryId: byDoc.entryId });
  T.ok('an admin deletes', del.ok === true, del);
  T.eq('…exactly that row', nursingRows(g).map(r => r[8]).sort(), [byNurse.entryId, byAdmin.entryId].sort());
});

// ════════════════════════════════════════════════════════════════════════
T.section('§3 D5: nurses compute but cannot save or submit an order', () => {
  const g = ward();
  const nLog = g.as(g.nt, { action: 'logDailyNutrition', sessionId: 'AA-900', entry: E({ ts: TODAY }) });
  T.ok('a nurse\'s order save is refused', !!nLog.error && !nLog.entryId, nLog);
  T.ok('…in Thai, pointing to where I/O now goes', isThai(nLog.error) && /Dashboard/.test(nLog.error), nLog.error);
  T.eq('…and nothing reached Daily_Log', g.rows('Daily_Log').length, 0);
  const dLog = g.as(g.dt, { action: 'logDailyNutrition', sessionId: 'AA-900', entry: E({ ts: TODAY }) });
  T.ok('a doctor\'s order save still works', !!dLog.entryId, dLog);
  const aLog = g.as(g.at, { action: 'logDailyNutrition', sessionId: 'BB-900', entry: E({ ts: TODAY }) });
  T.ok('an admin\'s too', !!aLog.entryId, aLog);
  const nUpd = g.as(g.nt, { action: 'updateDailyNutrition', sessionId: 'AA-900', entryId: dLog.entryId,
    expectedLastModified: dLog.lastModified, entry: E({ ts: TODAY, pro: 3.5 }) });
  T.ok('a nurse cannot edit the doctor\'s order', !!nUpd.error && !nUpd.ok, nUpd);
  const nPub = g.as(g.nt, { action: 'publishLog', sessionId: 'AA-900', entryId: dLog.entryId, expectedLastModified: dLog.lastModified });
  T.ok('…nor submit it', !!nPub.error && !nPub.ok, nPub);
  const dPub = g.as(g.dt, { action: 'publishLog', sessionId: 'AA-900', entryId: dLog.entryId, expectedLastModified: dLog.lastModified });
  T.ok('the doctor can', dPub.ok === true, dPub);
  // Nursing work stays nursing work.
  const w = g.as(g.nt, { action: 'updateWeights', sessionId: 'AA-900', weights: [{ dol: 1, w: 1200 }, { dol: 21, w: 1300 }] });
  T.ok('a nurse still records a growth measurement', w.ok === true, w);
  const lock = g.as(g.nt, { action: 'acquireLogLock', sessionId: 'AA-900', date: TODAY });
  T.ok('the courtesy edit lock is untouched (it blocks nothing)', lock.ok === true, lock);
});

// ════════════════════════════════════════════════════════════════════════
T.section('§4 Validation — blank stays blank; bounds, stools, feed type, empties, dates', () => {
  const g = ward();
  const blank = g.as(g.nt, { action: 'logNursingEntry', sessionId: 'AA-900',
    entry: { ts: TODAY, ivInMl: '', enInMl: null, urineMl: 0, drainMl: undefined, stoolCount: '', feedType: '' } });
  T.ok('a record with only a measured 0 urine saves', blank.ok === true, blank);
  const row = nursingRows(g)[0] || [];
  T.eq('…blank IV / EN / drain / stool are stored blank, not 0', [row[2], row[3], row[6], row[7]], ['', '', '', '']);
  T.eq('…and the measured 0 is stored as 0', row[5], 0);
  const refuse = (label, entry, re) => {
    const r = g.as(g.nt, { action: 'logNursingEntry', sessionId: 'BB-900', entry: Object.assign({ ts: addDays(TODAY, -3) }, entry) });
    T.ok(label, !!r.error && !r.ok && isThai(r.error) && (!re || re.test(r.error)), r);
  };
  refuse('3001 mL is refused', { urineMl: 3001 }, /3000/);
  refuse('a negative volume is refused', { ivInMl: -5 });
  refuse('a non-number is refused', { enInMl: 'lots' });
  refuse('a fractional stool count is refused', { stoolCount: 1.5 });
  refuse('21 stools is refused', { stoolCount: 21 });
  refuse('a free-text feed type is refused (no free text in this sheet)', { enInMl: 40, feedType: 'นมแม่ของคุณแม่สมศรี' });
  refuse('a formula as feed type is refused', { enInMl: 40, feedType: '=HYPERLINK("x")' });
  refuse('a record with nothing in it is refused', { ivInMl: '', urineMl: null }, /อย่างน้อยหนึ่งช่อง/);
  refuse('a malformed date is refused', { ts: '24/09/2026', urineMl: 10 });
  // "Two days ahead" and the backend's own "tomorrow" come from ONE pinned
  // instant. TODAY is fixed when this file loads, while the backend reads the
  // live clock. A run that crossed Bangkok midnight between the two made this
  // date only one day ahead of the backend's today, so the save was accepted.
  // That turned the release's post-merge run red at 00:00 ICT, 2026-09-25.
  withNow(Date.now(), () => refuse('a date two days ahead is refused', { ts: addDays(wardToday(), 2), urineMl: 10 }));
  const ghost = g.as(g.nt, { action: 'logNursingEntry', sessionId: 'ZZ-000', entry: N() });
  T.ok('an unregistered patient is refused, in Thai', !!ghost.error && isThai(ghost.error), ghost);
  T.eq('none of the refusals wrote a row', nursingRows(g).length, 1);
});

// ════════════════════════════════════════════════════════════════════════
T.section('§5 One row per patient per date; edits keep date and author; stale edits conflict', () => {
  const g = ward();
  const first = g.as(g.nt, { action: 'logNursingEntry', sessionId: 'AA-900', entry: N() });
  const dup = g.as(g.dt, { action: 'logNursingEntry', sessionId: 'AA-900', entry: N({ urineMl: 70 }) });
  T.eq('a second record for the same day is refused with DuplicateDate and the existing entryId',
    { code: dup.code, entryId: dup.entryId, thai: isThai(dup.error) }, { code: 'DuplicateDate', entryId: first.entryId, thai: true });
  const other = g.as(g.dt, { action: 'logNursingEntry', sessionId: 'BB-900', entry: N() });
  T.ok('another infant on the same day is fine', other.ok === true, other);
  // A second later, as any real edit is: lastModified is a millisecond stamp,
  // and two writes inside one millisecond would share it (Daily_Log's too).
  const upd = withNow(Date.now() + 1000, () => g.as(g.dt, { action: 'updateNursingEntry', sessionId: 'AA-900', entryId: first.entryId,
    expectedLastModified: first.lastModified, entry: N({ ts: addDays(TODAY, -1), urineMl: 64 }) }));
  T.ok('the doctor corrects the nurse\'s urine', upd.ok === true, upd);
  const row = nursingRows(g).find(r => r[8] === first.entryId) || [];
  T.eq('…the value moved', row[5], 64);
  T.eq('…the date did not (the edit tried to move it)', g.sb._fmtDate(row[0]), TODAY);
  T.eq('…the original author stays', row[9], 'nur@kcmh.test');
  T.eq('…and the editor is recorded', row[11], 'doc@kcmh.test');
  const stale = withNow(Date.now() + 2000, () => g.as(g.nt, { action: 'updateNursingEntry', sessionId: 'AA-900', entryId: first.entryId,
    expectedLastModified: first.lastModified, entry: N({ urineMl: 99 }) }));
  T.ok('an edit from a stale copy is a conflict, not an overwrite', stale.conflict === true && stale.current.lastModifiedBy === 'doc@kcmh.test', stale);
  T.eq('…and the value stands', (nursingRows(g).find(r => r[8] === first.entryId) || [])[5], 64);
  const cross = g.as(g.dt, { action: 'updateNursingEntry', sessionId: 'BB-900', entryId: first.entryId,
    expectedLastModified: upd.lastModified, entry: N() });
  T.ok('an entry cannot be edited under another patient', !!cross.error && isThai(cross.error), cross);
});

// ════════════════════════════════════════════════════════════════════════
T.section('§6 The sync carries it — blanks null, zeros 0, window-scoped, fresh on the next sync', () => {
  const g = ward();
  // A third patient discharged long ago is outside every device's sync window.
  g.sheet('Patient_Registry').data.push(g.patRow('OLD-1', { 9: 'Discharged', 16: addDays(TODAY, -60) }));
  const before = sync(g);   // primes the payload cache
  g.as(g.nt, { action: 'logNursingEntry', sessionId: 'AA-900', entry: { ts: TODAY, urineMl: 0, stoolCount: 1, feedType: '' } });
  g.sheet('Nursing_Log').data.push(['2026-01-02', 'OLD-1', 10, 10, '', 10, 0, 0, 'e-old', 'x@kcmh.test', 'y', 'x@kcmh.test', '']);
  const after = sync(g);
  T.eq('before any record, the map was empty', before.nursing, {});
  const rec = (after.nursing['AA-900'] || [])[0] || {};
  T.ok('the next sync already carries the new record (the cache was invalidated)', !!rec.entryId, after.nursing);
  T.eq('…with blanks as null and the measured zero as 0',
    { iv: rec.ivInMl, en: rec.enInMl, urine: rec.urineMl, drain: rec.drainMl, stool: rec.stoolCount },
    { iv: null, en: null, urine: 0, drain: null, stool: 1 });
  T.eq('…dated as YYYY-MM-DD', rec.ts, TODAY);
  T.ok('a patient outside the sync window sends no nursing rows', !after.nursing['OLD-1'], Object.keys(after.nursing));
  T.eq('a nurse\'s sync carries the same map', sync(g, g.nt).nursing, after.nursing);

  // After a clasp deploy, the cache still holds what the code BEFORE it stored
  // for the same data version — a payload with no `nursing`, which the
  // frontend reads as "this backend still takes a nurse's order". It is never
  // served: the key's prefix names the payload's shape (sync1_ before this).
  // Simulated by moving what this code cached to the old key, then changing
  // the sheet without a version bump: a reader of the old key serves the stale
  // payload, which lacks the new row.
  const g3 = ward();
  g3.as(g3.nt, { action: 'logNursingEntry', sessionId: 'BB-900', entry: N({ ts: addDays(TODAY, -3) }) });
  sync(g3);
  const head = [...g3.cacheStore.keys()].find(k => /^sync\d+_ward(\+n)?_[^_]+_[^_]+$/.test(k));
  T.ok('fixture: the sync cached its payload', !!head, [...g3.cacheStore.keys()]);
  // What the code before this change would have stored for the same version.
  const oldKey = head ? head.replace(/^sync\d+_ward(\+n)?_/, 'sync1_ward_') : '';
  if (head && head !== oldKey) {
    for (const k of [...g3.cacheStore.keys()].filter(k => k === head || k.startsWith(head + '_'))) {
      g3.cacheStore.set(oldKey + k.slice(head.length), g3.cacheStore.get(k));
      g3.cacheStore.delete(k);
    }
  }
  g3.sheet('Nursing_Log').data.push([TODAY, 'AA-900', 5, 5, '', 5, 0, 0, 'e-hand', 'x@kcmh.test', 'z', 'x@kcmh.test', '']);
  const fresh = sync(g3);
  T.ok('a payload cached under the pre-nursing key (sync1_) is never served after the deploy',
    (fresh.nursing['AA-900'] || []).some(r => r.entryId === 'e-hand'), fresh.nursing);

  // A write whose DATA_VERSION bump fails must still not leave the switched-on
  // payload in the cache: the bump drops the current heads FIRST — every
  // variant of them, "+n" included — so the next reader rebuilds from the
  // sheet (review of 2026-09-24: only the switched-off heads were dropped).
  const g4 = ward();
  sync(g4);                                   // primes the "+n" payload
  g4.env.propSetThrows = true;
  const w4 = g4.as(g4.nt, { action: 'logNursingEntry', sessionId: 'AA-900', entry: N() });
  g4.env.propSetThrows = false;
  T.ok('fixture: the save landed although its version bump failed', w4.ok === true && nursingRows(g4).length === 1, w4);
  T.eq('switched on, a failed version bump still does not serve the stale payload: the new row is in the next sync',
    (sync(g4).nursing['AA-900'] || []).length, 1);

  // The switch is read once per sync, and the payload obeys that one read.
  const g5 = ward();
  T.ok('getActivePatients follows the nursingOn it is handed (off → no `nursing`)',
    !('nursing' in g5.sb.getActivePatients({ nursingOn: false })));
  g5.props.delete('NURSING_LOG_ENABLED');
  T.ok('…and (on → `nursing`) whatever the property says at that instant',
    'nursing' in g5.sb.getActivePatients({ nursingOn: true }));
});

// ════════════════════════════════════════════════════════════════════════
T.section('§7 Every write is on the Audit_Log; a delete before it destroys anything', () => {
  const g = ward();
  const c = g.as(g.nt, { action: 'logNursingEntry', sessionId: 'AA-900', entry: N() });
  g.as(g.dt, { action: 'updateNursingEntry', sessionId: 'AA-900', entryId: c.entryId, expectedLastModified: c.lastModified, entry: N({ urineMl: 81 }) });
  g.as(g.at, { action: 'deleteNursingEntry', sessionId: 'AA-900', entryId: c.entryId });
  const acts = g.audit().filter(a => /Nursing/.test(a.action)).map(a => [a.action, a.sessionId, a.actor]);
  T.eq('create · update · delete-start · delete, each with who and which infant', acts, [
    ['logNursingEntry', 'AA-900', 'nur@kcmh.test'],
    ['updateNursingEntry', 'AA-900', 'doc@kcmh.test'],
    ['deleteNursingLog:start', 'AA-900', 'adm@kcmh.test'],
    ['deleteNursingEntry', 'AA-900', 'adm@kcmh.test'],
  ]);
  // The start row is strict: if it cannot be written, nothing is deleted.
  const g2 = ward();
  const c2 = g2.as(g2.nt, { action: 'logNursingEntry', sessionId: 'AA-900', entry: N() });
  g2.sheet('Audit_Log').throwOn.appendRow = { err: new Error('audit down') };
  const d2 = g2.as(g2.at, { action: 'deleteNursingEntry', sessionId: 'AA-900', entryId: c2.entryId });
  T.ok('with the Audit_Log down, the delete is refused', !d2.ok, d2);
  T.eq('…and the row survives', nursingRows(g2).length, 1);
});

// ════════════════════════════════════════════════════════════════════════
T.section('§8 Nothing a client sends lands as a live formula', () => {
  const g = ward();
  g.addStaff('=cmd@evil.test', 'nurse', 'Nurse-Password-9');
  const evil = g.session('=cmd@evil.test', 'nurse');
  const r = g.as(evil, { action: 'logNursingEntry', sessionId: 'AA-900', entry: N({ appVersion: '=IMPORTXML("x")' }) });
  T.ok('the save goes through', r.ok === true, r);
  T.eq('…with no formula injected anywhere', g.env.injections, []);
  // Column M is a build token, never free text: the one column a hand-made
  // request could otherwise fill with a name or a note (PDPA minimisation).
  const note = 'Baby of Mrs Somchai, HN 1234567 — HBsAg+ ' + 'x'.repeat(200);
  const r2 = g.as(g.nt, { action: 'logNursingEntry', sessionId: 'BB-900', entry: N({ appVersion: note }) });
  T.ok('a note smuggled in as appVersion does not block the save', r2.ok === true, r2);
  const byId = (id) => nursingRows(g).find(x => x[8] === id) || [];
  T.eq('…and is not stored: column M is blank', byId(r2.entryId)[12], '');
  const r3 = g.as(g.nt, { action: 'logNursingEntry', sessionId: 'BB-900',
    entry: N({ ts: addDays(TODAY, -1), appVersion: 'b=f48894ce64;d=09ec74e9c7;a=c11b05a99d' }) });
  T.eq('a real build token is kept', byId(r3.entryId)[12], 'b=f48894ce64;d=09ec74e9c7;a=c11b05a99d');
  const r4 = g.as(g.nt, { action: 'logNursingEntry', sessionId: 'BB-900', entry: N({ ts: addDays(TODAY, -2), appVersion: '2026-09-11-review' }) });
  T.eq('…and so is the fallback version name', byId(r4.entryId)[12], '2026-09-11-review');
});

// ════════════════════════════════════════════════════════════════════════
T.section('§9 deletePatient takes the patient\'s nursing rows, and only theirs', () => {
  const g = ward();
  g.as(g.nt, { action: 'logNursingEntry', sessionId: 'AA-900', entry: N({ ts: addDays(TODAY, -1) }) });
  g.as(g.nt, { action: 'logNursingEntry', sessionId: 'AA-900', entry: N() });
  g.as(g.nt, { action: 'logNursingEntry', sessionId: 'BB-900', entry: N() });
  const r = g.as(g.at, { action: 'deletePatient', sessionId: 'AA-900' });
  T.ok('the admin deletes the session', r.ok === true, r);
  T.eq('its two nursing rows are gone; the other infant\'s stays', nursingRows(g).map(x => x[1]), ['BB-900']);
});

// ════════════════════════════════════════════════════════════════════════
T.section('§10 The column-drift guard covers Nursing_Log', () => {
  const g = ward();
  g.as(g.nt, { action: 'logNursingEntry', sessionId: 'AA-900', entry: N({ ts: addDays(TODAY, -1) }) });
  // Someone swaps two headers by hand in the Sheets UI.
  const hdr = g.sheet('Nursing_Log').data[0];
  [hdr[5], hdr[6]] = [hdr[6], hdr[5]];
  g.cacheStore.delete('schema1_Nursing_Log');   // the guard's 10-minute verdict, not the sessions
  const r = g.as(g.nt, { action: 'logNursingEntry', sessionId: 'AA-900', entry: N() });
  T.ok('a save into a shifted Nursing_Log is refused with SchemaMismatch', r.code === 'SchemaMismatch' && !r.ok, r);
  T.eq('…and writes nothing', nursingRows(g).length, 1);
});

T.done();
