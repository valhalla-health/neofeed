// verify-sheet-backup-1115.cjs — the Sheet backup and the restore drill
// (gas-backend.gs § Sheet backup and restore drill, 2026-11-15).
//
// Every NeoFeed record is in one spreadsheet. The backend now keeps 14 backup
// books and, once a night, copies every tab of the live book over an empty
// one, or else the oldest
// (Pp, 2026-11-15: overwrite a fixed set of books, keep 14 nights).
//
//   §1  Setup makes exactly 14 books, once; a second run makes none; a run that
//       stopped half-way is finished, not repeated. Before setup a backup
//       refuses. Nothing here is reachable from doPost.
//   §2  One backup: the copy equals the live book cell for cell (a Date stays a
//       Date, a text cell that starts with "=" stays text), the script lock is
//       held for every tab and released after, and the book's title says which
//       night it holds.
//   §3  Rotation: 14 nights fill 14 slots, night 15 overwrites the oldest, and
//       there are never more than 14 books.
//   §4  Retention: a backup past 14 days is emptied by the next run, and an
//       infant erased from the live book is in no backup after 14 nightly runs.
//   §5  A run that fails (a copy throws, the lock times out, a tab comes back
//       short) throws, leaves its slot listed as empty, releases the lock, and
//       the next run uses that slot.
//   §6  The drill: restorable only when every data tab matches cell for cell
//       and the headers are the ones the backend accepts; a hand-built tab's
//       differences are reported, not judged; the live book is not written.
//   §7  sheetBackupStatus(): not set up, fresh, stale after 36 h, drill due.
//   §8  No log line carries a book id, a sessionId or a name.
//   §9  Audit_Log and Usage_Log are appended outside the script lock: a row
//       landing mid-copy fails neither the backup nor the drill. A drill that
//       finds a difference leaves its slot empty. Every data tab is judged; a
//       hand-built tab is only reported.
//   §10 Every slot id is checked before any book is touched (the live Sheet's
//       id, a missing id, a shared book); an unreadable state is an error,
//       never "not set up"; a backup book that will not open is skipped, the
//       run reports it after the backup is safe, status finds it by opening
//       the books, and repairSheetBackups() replaces it only when it holds no
//       listed backup; setup and repair hold the script lock; a thrown message
//       carries no book id; the time zone and locale are matched before a copy.
//
// What this cannot show: that Google's own Sheet.copyTo keeps every cell, how
// long the copy holds the lock, or a date shifted by a book's time zone. The
// sandbox's copyTo is a deep copy and its lock has no clock. The first sheetRestoreDrill() on the real
// Sheet is that proof (REFERENCE.md § Sheet backup and restore drill).
//
// Synthetic patients only. No npm dependencies (gas-vm-sandbox.cjs).
//
// NEGATIVE CONTROL — red against the backend before this change:
//   git show a7b9f6e:gas-backend.gs > /tmp/gas-a7b9f6e.gs
//   NEOFEED_GAS_SRC=/tmp/gas-a7b9f6e.gs node test/verify-sheet-backup-1115.cjs
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const { boot, recorder, withNow, isDate } = require('./gas-vm-sandbox.cjs');
const T = recorder('SHEET BACKUP (2026-11-15)');

const DAY = 86400000;
const T0 = Date.parse('2026-11-15T19:00:00.000Z');   // 02:00 on 16 Nov, ward time
const STATE_KEY = 'SHEET_BACKUP_STATE';
const HOLDER = '_neofeed_backup_placeholder';

const state = (g) => JSON.parse(g.props.get(STATE_KEY));
const book = (g, slot) => g.env.books[state(g).slots[slot - 1].id];
const tabNames = (b) => b.getSheets().map(s => s.getName());
const same = (a, b) => (isDate(a) || isDate(b)) ? (isDate(a) && isDate(b) && a.getTime() === b.getTime()) : a === b;
const sameGrid = (a, b) => a.length === b.length && a.every((r, i) => r.length === b[i].length && r.every((v, j) => same(v, b[i][j])));
const cells = (b) => b.getSheets().map(s => JSON.stringify(s.data)).join('\n');
const threw = (fn) => { try { fn(); return ''; } catch (e) { return String(e && e.message || e); } };

// A live book with two infants, one order, one staff row and a hand-built tab.
function seeded() {
  const g = boot();
  g.addStaff('doctor@kcmh.test', 'doctor', 'pw-12345678');
  g.sheet('Patient_Registry').appendRow(g.patRow('NF-100001', { 1: 'ทารก หนึ่ง' }));
  g.sheet('Patient_Registry').appendRow(g.patRow('NF-100002', { 1: 'ทารก สอง' }));
  g.sheet('Daily_Log').data.push(g.logRow('NF-100001', new Date(T0 - DAY)));
  g.env.sheets.Chart = g.makeSheet('Chart', [['week', 'orders'], ['2026-W46', 12]]);
  return g;
}
function ready() {
  const g = seeded();
  g.sb.setupSheetBackups();
  return g;
}

T.section('§1 Setup', () => {
  const g = seeded();
  T.ok('before setup a backup refuses and names the fix', /setupSheetBackups/.test(threw(() => g.sb.backupSheetNightly())));
  T.eq('…and made no book', Object.keys(g.env.books).length, 0);
  T.eq('…and released the lock', g.env.lockHeld, 0);
  T.eq('status before setup', [g.sb.sheetBackupStatus().setUp, g.sb.sheetBackupStatus().ok], [false, false]);

  T.eq('setup creates 14 books', g.sb.setupSheetBackups(), { slots: 14, created: 14 });
  T.eq('14 books exist', Object.keys(g.env.books).length, 14);
  T.eq('a second setup creates none', g.sb.setupSheetBackups(), { slots: 14, created: 0 });
  T.eq('still 14 books', Object.keys(g.env.books).length, 14);
  T.eq('every slot starts empty', state(g).slots.map(s => s.at), new Array(14).fill(''));
  T.ok('each slot has its own book', new Set(state(g).slots.map(s => s.id)).size === 14);
  T.eq('a new book is titled as an empty slot', book(g, 3).getName(), 'NeoFeed backup slot 03 (empty)');

  // Setup that stopped after 5 books (SpreadsheetApp.create failed on the 6th).
  const h = seeded();
  let made = 0;
  const realCreate = h.sb.SpreadsheetApp.create;
  h.sb.SpreadsheetApp.create = (t) => { if (made === 5) throw new Error('Service Spreadsheets failed'); made++; return realCreate(t); };
  T.ok('a setup that fails on the 6th book throws', threw(() => h.sb.setupSheetBackups()) !== '');
  T.eq('…and the 5 it made are recorded, none orphaned', [state(h).slots.length, Object.keys(h.env.books).length], [5, 5]);
  h.sb.SpreadsheetApp.create = realCreate;
  T.eq('the next setup makes only the missing 9', h.sb.setupSheetBackups(), { slots: 14, created: 9 });
  T.eq('14 books, not 19', Object.keys(h.env.books).length, 14);

  // Not reachable from the web app.
  const admin = { email: 'admin@kcmh.test' };
  g.addStaff(admin.email, 'admin', 'pw-12345678');
  const token = g.session(admin.email, 'admin');
  const before = g.props.get(STATE_KEY);
  ['backupSheetNightly', 'sheetRestoreDrill', 'setupSheetBackups', 'sheetBackupStatus', 'repairSheetBackups'].forEach((action) => {
    const res = g.post({ action, token: token && token.token ? token.token : token });
    T.eq('doPost answers Unknown action to ' + action, res, { error: 'Unknown action: ' + action });
  });
  T.eq('…and the backup state did not move', g.props.get(STATE_KEY), before);
});

T.section('§2 One backup', () => {
  const g = ready();
  // A text cell that starts with "=" (stored as text in the live book), and a Date.
  g.sheet('Patient_Registry').data[1][11] = '=HYPERLINK("x")';
  const injectionsBefore = g.env.injections.length;
  const liveBefore = cells(g.sb.SpreadsheetApp.openById('sheet-id'));
  let heldAtCopy = [];
  g.env.copyHook = () => heldAtCopy.push(g.env.lockHeld);
  const out = withNow(T0, () => g.sb.backupSheetNightly());
  g.env.copyHook = null;

  T.eq('it wrote slot 1', out.slot, 1);
  T.eq('five tabs copied', out.tabs.map(t => [t.name, t.copied]), [['Staff', true], ['Patient_Registry', true], ['Daily_Log', true], ['Audit_Log', true], ['Chart', true]]);
  const b = book(g, 1);
  T.eq('the backup holds the live tabs, in order, and no placeholder', tabNames(b), ['Staff', 'Patient_Registry', 'Daily_Log', 'Audit_Log', 'Chart']);
  ['Staff', 'Patient_Registry', 'Daily_Log', 'Audit_Log', 'Chart'].forEach((n) => {
    T.ok(n + ' equals the live tab cell for cell', sameGrid(b.getSheetByName(n).data, g.sheet(n).data));
  });
  T.ok('a Date in the live book is a Date in the backup', isDate(b.getSheetByName('Patient_Registry').data[1][6]));
  T.ok('…and not the same object', b.getSheetByName('Patient_Registry').data[1][6] !== g.sheet('Patient_Registry').data[1][6]);
  T.eq('a text cell starting with "=" is the same text', b.getSheetByName('Patient_Registry').data[1][11], '=HYPERLINK("x")');
  T.eq('…and nothing was written as a formula', g.env.injections.length, injectionsBefore);
  T.eq('the grid width came with it (Daily_Log 38)', b.getSheetByName('Daily_Log').getMaxColumns(), 38);
  T.eq('the lock was held at every tab copy', heldAtCopy, [1, 1, 1, 1, 1]);
  T.eq('…and released after', g.env.lockHeld, 0);
  T.eq('the title names the ward night', b.getName(), 'NeoFeed backup slot 01 · 2026-11-16');
  T.eq('the slot carries the time', state(g).slots[0].at, new Date(T0).toISOString());
  T.eq('the live book was not written', cells(g.sb.SpreadsheetApp.openById('sheet-id')), liveBefore);
  T.eq('no drill was recorded', state(g).lastDrill, null);

  // A tab added to the live book later is in the next backup; one removed is not.
  g.env.sheets.Usage_Log = g.makeSheet('Usage_Log', [['ts', 'week', 'ward', 'type']]);
  delete g.env.sheets.Chart;
  withNow(T0 + DAY, () => g.sb.backupSheetNightly());
  T.eq('the next backup follows the live tab list', tabNames(book(g, 2)), ['Staff', 'Patient_Registry', 'Daily_Log', 'Audit_Log', 'Usage_Log']);
});

T.section('§3 Rotation', () => {
  const g = ready();
  const slots = [];
  for (let n = 0; n < 14; n++) {
    g.sheet('Audit_Log').appendRow([new Date(T0 + n * DAY), 'night', '', 'n' + n]);
    slots.push(withNow(T0 + n * DAY, () => g.sb.backupSheetNightly()).slot);
  }
  T.eq('14 nights fill slots 1 to 14', slots, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  T.eq('each backup holds its own night (slot n has n audit rows)', slots.map(s => book(g, s).getSheetByName('Audit_Log').getLastRow() - 1), slots);
  const st = withNow(T0 + 13 * DAY, () => g.sb.sheetBackupStatus());
  T.eq('status counts 14 good backups', [st.goodBackups, st.ok, st.newestAgeHours], [14, true, 0]);

  g.sheet('Audit_Log').appendRow([new Date(T0 + 14 * DAY), 'night', '', 'n14']);
  const fifteenth = withNow(T0 + 14 * DAY, () => g.sb.backupSheetNightly());
  T.eq('night 15 overwrites slot 1, the oldest', [fifteenth.slot, fifteenth.purgedSlots], [1, 0]);
  T.eq('…with night 15 (15 audit rows)', book(g, 1).getSheetByName('Audit_Log').getLastRow() - 1, 15);
  T.eq('…and its title moved on', book(g, 1).getName(), 'NeoFeed backup slot 01 · 2026-11-30');
  T.eq('night 16 takes slot 2', withNow(T0 + 15 * DAY, () => g.sb.backupSheetNightly()).slot, 2);
  T.eq('never more than 14 books', Object.keys(g.env.books).length, 14);
});

T.section('§4 Retention', () => {
  const g = ready();
  withNow(T0, () => g.sb.backupSheetNightly());             // slot 1
  withNow(T0 + DAY, () => g.sb.backupSheetNightly());       // slot 2
  // The trigger then stops for 14 days and one hour.
  const late = T0 + 15 * DAY + 3600e3;
  const out = withNow(late, () => g.sb.backupSheetNightly());
  T.eq('both backups past 14 days are emptied, and one is rewritten', [out.purgedSlots, out.slot], [2, 1]);
  T.eq('the other old slot holds only the placeholder tab', tabNames(book(g, 2)), [HOLDER]);
  T.eq('…is titled empty', book(g, 2).getName(), 'NeoFeed backup slot 02 (empty)');
  T.eq('…and is listed as empty', state(g).slots[1].at, '');
  T.eq('one good backup is left', withNow(late, () => g.sb.sheetBackupStatus().goodBackups), 1);

  // A backup exactly 14 days old is kept by the purge (and is then the oldest, so it is overwritten).
  const k = ready();
  withNow(T0, () => k.sb.backupSheetNightly());
  withNow(T0 + DAY, () => k.sb.backupSheetNightly());
  const edge = withNow(T0 + 14 * DAY, () => k.sb.backupSheetNightly());
  T.eq('at exactly 14 days nothing is purged; the empty slot 3 is used', [edge.purgedSlots, edge.slot], [0, 3]);

  // An erased infant leaves every backup.
  const e = ready();
  const NAME = 'ทารก สอง';
  const holds = () => Object.values(e.env.books).filter(b => cells(b).includes(NAME)).length;
  for (let n = 0; n < 14; n++) withNow(T0 + n * DAY, () => e.sb.backupSheetNightly());
  T.eq('before the erasure all 14 backups hold the name', holds(), 14);
  const row = e.sheet('Patient_Registry').data.findIndex(r => r[0] === 'NF-100002');
  e.sheet('Patient_Registry').data[row][1] = '';
  e.sheet('Patient_Registry').data[row][2] = '';
  e.sheet('Patient_Registry').data[row][6] = '';
  const left = [];
  for (let n = 14; n < 28; n++) { withNow(T0 + n * DAY, () => e.sb.backupSheetNightly()); left.push(holds()); }
  T.eq('each night after it one backup fewer holds the name', left, [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);

  // …and with the trigger dead, the first run after 14 days clears them all.
  const d = ready();
  for (let n = 0; n < 14; n++) withNow(T0 + n * DAY, () => d.sb.backupSheetNightly());
  const drow = d.sheet('Patient_Registry').data.findIndex(r => r[0] === 'NF-100002');
  d.sheet('Patient_Registry').data[drow][1] = '';
  const after = withNow(T0 + 13 * DAY + 14 * DAY + 1, () => d.sb.backupSheetNightly());
  T.eq('a run 14 days after the last empties all 14 old backups', after.purgedSlots, 14);
  T.eq('…and no backup holds the erased name', Object.values(d.env.books).filter(b => cells(b).includes(NAME)).length, 0);
});

T.section('§5 A run that fails', () => {
  const g = ready();
  withNow(T0, () => g.sb.backupSheetNightly());                                   // slot 1, good
  // The Daily_Log copy throws.
  g.sheet('Daily_Log').throwOn.copyTo = { once: true };
  const msg = threw(() => withNow(T0 + DAY, () => g.sb.backupSheetNightly()));
  T.ok('a copy that throws makes the run throw', /Service Spreadsheets failed/.test(msg), msg);
  T.eq('the half-written slot 2 is listed as empty', state(g).slots[1].at, '');
  T.eq('…its title says it was being written', book(g, 2).getName(), 'NeoFeed backup slot 02 (writing)');
  T.eq('the good backup in slot 1 is untouched', state(g).slots[0].at, new Date(T0).toISOString());
  T.eq('the lock is released', g.env.lockHeld, 0);
  const st = withNow(T0 + DAY, () => g.sb.sheetBackupStatus());
  T.eq('status counts one good backup, a day old', [st.goodBackups, st.newestAgeHours, st.ok], [1, 24, true]);
  const retry = withNow(T0 + DAY + 60000, () => g.sb.backupSheetNightly());
  T.eq('the next run takes the same slot', retry.slot, 2);
  T.eq('…and leaves it whole', tabNames(book(g, 2)), ['Staff', 'Patient_Registry', 'Daily_Log', 'Audit_Log', 'Chart']);

  // After night 14 the slot being written is a dated one: a run that dies there must delist it.
  const full = ready();
  for (let n = 0; n < 14; n++) withNow(T0 + n * DAY, () => full.sb.backupSheetNightly());
  T.eq('before the failed night slot 1 is listed', state(full).slots[0].at, new Date(T0).toISOString());
  full.sheet('Daily_Log').throwOn.copyTo = { once: true };
  T.ok('night 15 fails in the copy', threw(() => withNow(T0 + 14 * DAY - 60000, () => full.sb.backupSheetNightly())) !== '');
  T.eq('…and the oldest slot, half-written, is no longer listed', state(full).slots[0].at, '');
  T.eq('…13 good backups are left', withNow(T0 + 14 * DAY - 60000, () => full.sb.sheetBackupStatus().goodBackups), 13);

  // The lock is not free: nothing is read or written.
  const before = g.props.get(STATE_KEY), titles = Object.values(g.env.books).map(b => b.getName()).join('|');
  g.env.lockTimeout = true;
  T.ok('a lock timeout throws', /Lock timeout/.test(threw(() => g.sb.backupSheetNightly())));
  g.env.lockTimeout = false;
  T.eq('…the state did not move', g.props.get(STATE_KEY), before);
  T.eq('…and no book was renamed', Object.values(g.env.books).map(b => b.getName()).join('|'), titles);

  // A copy that comes back one row short is not called good.
  const h = ready();
  const pat = h.sheet('Patient_Registry'), realCopy = pat.copyTo;
  pat.copyTo = (dest) => { const c = realCopy.call(pat, dest); c.data.pop(); return c; };
  const short = threw(() => withNow(T0, () => h.sb.backupSheetNightly()));
  T.ok('a short copy throws and says the slot is left empty', /does not match the live book/.test(short) && /left marked empty/.test(short), short);
  T.eq('…the slot is listed as empty', state(h).slots[0].at, '');
  T.eq('…the lock is released', h.env.lockHeld, 0);
  pat.copyTo = realCopy;

  // The state cannot be saved at the end: the slot stays empty rather than half-true.
  const p = ready();
  let sets = 0;
  const realSet = p.sb.PropertiesService.getScriptProperties().setProperty;
  const api = p.sb.PropertiesService.getScriptProperties();
  api.setProperty = (k, v) => { sets++; if (sets === 2) throw new Error('Service error: PropertiesService'); return realSet(k, v); };
  T.ok('a failed final save throws', threw(() => withNow(T0, () => p.sb.backupSheetNightly())) !== '');
  api.setProperty = realSet;
  T.eq('…and the slot is listed as empty', state(p).slots[0].at, '');
});

T.section('§6 The drill', () => {
  const g = ready();
  const liveBefore = cells(g.sb.SpreadsheetApp.openById('sheet-id'));
  const out = withNow(T0, () => g.sb.sheetRestoreDrill());
  T.eq('a faithful copy is restorable', [out.restorable, out.differingCellsInDataTabs, out.differingCellsInOtherTabs], [true, 0, 0]);
  T.eq('every tab reports its differing cells', out.tabs.map(t => t.differingCells), [0, 0, 0, 0, 0]);
  T.eq('the header check ran on the backup', out.schema, [{ tab: 'Patient_Registry', ok: true, mismatchedColumns: 0 }, { tab: 'Daily_Log', ok: true, mismatchedColumns: 0 }]);
  T.eq('the drill is recorded', state(g).lastDrill, { at: new Date(T0).toISOString(), ok: true });
  T.eq('the drill is also a good backup', state(g).slots[0].at, new Date(T0).toISOString());
  T.eq('the live book was not written', cells(g.sb.SpreadsheetApp.openById('sheet-id')), liveBefore);
  T.eq('the lock is released', g.env.lockHeld, 0);

  // One cell of a data tab comes back different (same row and column counts).
  const pat = g.sheet('Patient_Registry'), realCopy = pat.copyTo;
  pat.copyTo = (dest) => { const c = realCopy.call(pat, dest); c.data[1][3] = 1201; return c; };
  const bad = withNow(T0 + DAY, () => g.sb.sheetRestoreDrill());
  pat.copyTo = realCopy;
  T.eq('one changed weight is one differing cell, and not restorable', [bad.differingCellsInDataTabs, bad.restorable], [1, false]);
  T.eq('…named on its tab', bad.tabs.find(t => t.name === 'Patient_Registry').differingCells, 1);
  T.eq('…and the failed drill is recorded as failed', state(g).lastDrill.ok, false);

  // A Date that moved by a day is a difference; so is a number that became text.
  const pat2 = g.sheet('Patient_Registry');
  pat2.copyTo = (dest) => { const c = realCopy.call(pat2, dest); c.data[1][6] = new Date(c.data[1][6].getTime() + DAY); c.data[2][3] = '1200'; return c; };
  const typed = withNow(T0 + 2 * DAY, () => g.sb.sheetRestoreDrill());
  pat2.copyTo = realCopy;
  T.eq('a shifted date and a number turned to text are two differing cells', typed.differingCellsInDataTabs, 2);

  // A hand-built tab that differs is reported, not judged.
  const chart = g.sheet('Chart'), chartCopy = chart.copyTo;
  chart.copyTo = (dest) => { const c = chartCopy.call(chart, dest); c.data[1][1] = '#REF!'; return c; };
  const other = withNow(T0 + 3 * DAY, () => g.sb.sheetRestoreDrill());
  chart.copyTo = chartCopy;
  T.eq('a recalculating chart cell is counted apart and leaves it restorable', [other.differingCellsInOtherTabs, other.differingCellsInDataTabs, other.restorable], [1, 0, true]);

  // A live header that drifted fails the drill: restoring that copy would refuse every save.
  const h = ready();
  h.sheet('Daily_Log').data[0][3] = 'wt';
  const drift = withNow(T0, () => h.sb.sheetRestoreDrill());
  T.eq('a drifted Daily_Log header is not restorable', [drift.restorable, drift.schema.find(s => s.tab === 'Daily_Log')], [false, { tab: 'Daily_Log', ok: false, mismatchedColumns: 1 }]);
});

T.section('§7 Status', () => {
  const g = ready();
  const empty = withNow(T0, () => g.sb.sheetBackupStatus());
  T.eq('set up but never run: not ok, drill due', [empty.setUp, empty.ok, empty.goodBackups, empty.newestAgeHours, empty.drillDue, empty.lastDrill], [true, false, 0, null, true, null]);
  const before = g.props.get(STATE_KEY);
  withNow(T0, () => g.sb.backupSheetNightly());
  const stateAfterBackup = g.props.get(STATE_KEY);
  T.ok('a backup moved the state', stateAfterBackup !== before);
  T.eq('36 h after a backup it is still fresh', withNow(T0 + 36 * 3600e3, () => [g.sb.sheetBackupStatus().ok, g.sb.sheetBackupStatus().newestAgeHours]), [true, 36]);
  T.eq('36 h and 6 min after, it is not', withNow(T0 + 36.1 * 3600e3, () => [g.sb.sheetBackupStatus().ok, g.sb.sheetBackupStatus().newestAgeHours]), [false, 36.1]);
  T.eq('status writes nothing', g.props.get(STATE_KEY), stateAfterBackup);
  T.eq('a backup alone leaves the drill due', withNow(T0, () => g.sb.sheetBackupStatus().drillDue), true);
  withNow(T0 + DAY, () => g.sb.sheetRestoreDrill());
  T.eq('after a passed drill it is not due', withNow(T0 + DAY, () => g.sb.sheetBackupStatus().drillDue), false);
  T.eq('90 days later it is still not due', withNow(T0 + 91 * DAY, () => g.sb.sheetBackupStatus().drillDue), false);
  T.eq('a day after that it is', withNow(T0 + 91 * DAY + 60000, () => g.sb.sheetBackupStatus().drillDue), true);
  const s = withNow(T0 + DAY, () => g.sb.sheetBackupStatus());
  T.eq('status lists 14 slots with no id', [s.slots.length, Object.keys(s.slots[0]).sort()], [14, ['ageHours', 'at', 'opens', 'slot']]);
});

T.section('§8 Logs', () => {
  const g = ready();
  withNow(T0, () => g.sb.backupSheetNightly());
  withNow(T0 + DAY, () => g.sb.sheetRestoreDrill());
  withNow(T0 + DAY, () => g.sb.sheetBackupStatus());
  g.sheet('Daily_Log').throwOn.copyTo = { once: true };
  threw(() => withNow(T0 + 2 * DAY, () => g.sb.backupSheetNightly()));
  const lines = g.env.logs.filter(l => /sheet (backup|restore)/.test(l));
  T.eq('four lines: setup, backup, drill, status', lines.length, 4);
  const all = g.env.logs.join('\n');
  const ids = state(g).slots.map(s => s.id);
  T.ok('no log line carries a backup book id', !ids.some(id => all.includes(id)), all);
  T.ok('no log line carries the live Sheet id', !all.includes('sheet-id'));
  T.ok('no log line carries a sessionId', !/NF-1000\d\d/.test(all));
  T.ok('no log line carries a name or an email', !all.includes('ทารก') && !all.includes('@'));
  T.eq('the backup line is counts only', lines[1], 'sheet backup: slot 1, 5 tabs, 10 rows, 0 old slot(s) emptied, 0 book(s) not opened');
});

T.section('§9 Writes outside the lock, and a drill that fails', () => {
  // Audit_Log is appended with no script lock: a row that lands while a later
  // tab is copied must not fail the night.
  const g = ready();
  g.env.copyHook = (sh) => { if (sh.getName() === 'Chart') g.sheet('Audit_Log').appendRow([new Date(T0), 'readRegistry', '', 'x']); };
  const night = withNow(T0, () => g.sb.backupSheetNightly());
  T.eq('an audit row landing mid-copy leaves the backup good', [night.slot, state(g).slots[0].at !== ''], [1, true]);
  const drill = withNow(T0 + DAY, () => g.sb.sheetRestoreDrill());
  g.env.copyHook = null;
  T.eq('…and the drill restorable, with no differing audit cell', [drill.restorable, drill.tabs.find(t => t.name === 'Audit_Log').differingCells], [true, 0]);
  // …nor one that lands the moment Audit_Log itself has been copied: the count
  // that judges the copy is the one read before the copy began.
  const r = ready();
  const rAudit = r.sheet('Audit_Log'), rCopy = rAudit.copyTo;
  rAudit.copyTo = (dest) => { const c = rCopy.call(rAudit, dest); rAudit.appendRow([new Date(T0), 'readRegistry', '', 'y']); return c; };
  const rNight = withNow(T0, () => r.sb.backupSheetNightly());
  T.eq('an audit row landing right after its own copy leaves the backup good', [rNight.slot, state(r).slots[0].at !== '', rNight.tabs.find(t => t.name === 'Audit_Log').rows], [1, true, 1]);
  // …nor one that lands after Audit_Log's rows were counted and before it is
  // copied: the copy then holds one row MORE than the count, which is allowed.
  const b4 = ready();
  b4.env.copyHook = (sh) => { if (sh.getName() === 'Audit_Log') b4.sheet('Audit_Log').appendRow([new Date(T0), 'readRegistry', '', 'z']); };
  const b4Night = withNow(T0, () => b4.sb.backupSheetNightly());
  b4.env.copyHook = null;
  T.eq('an audit row landing between the count and the copy leaves the backup good', [state(b4).slots[0].at !== '', b4Night.tabs.find(t => t.name === 'Audit_Log').rows, book(b4, 1).getSheetByName('Audit_Log').getLastRow()], [true, 1, 2]);
  // An append tab whose copy lost its last column is refused.
  const b5 = ready();
  const b5Audit = b5.sheet('Audit_Log'), b5Copy = b5Audit.copyTo;
  b5Audit.appendRow([new Date(T0), 'readRegistry', '', 'actor']);
  b5Audit.copyTo = (dest) => { const c = b5Copy.call(b5Audit, dest); c.data.forEach(r => { r.length = Math.min(r.length, 3); }); return c; };
  T.ok('an audit copy that lost a column is refused', /does not match the live book/.test(threw(() => withNow(T0, () => b5.sb.backupSheetNightly()))));
  // An audit row that changed (not append-only) is still a difference.
  const audit = g.sheet('Audit_Log'), auditCopy = audit.copyTo;
  audit.copyTo = (dest) => { const c = auditCopy.call(audit, dest); c.data[1][1] = 'other'; return c; };
  T.eq('a changed audit cell is a difference', withNow(T0 + 2 * DAY, () => g.sb.sheetRestoreDrill()).differingCellsInDataTabs, 1);
  audit.copyTo = auditCopy;
  // An append tab whose copy is SHORTER than the tab was is refused.
  audit.copyTo = (dest) => { const c = auditCopy.call(audit, dest); c.data.pop(); return c; };
  T.ok('an audit copy that lost a row is refused', /does not match the live book/.test(threw(() => withNow(T0 + 3 * DAY, () => g.sb.backupSheetNightly()))));
  audit.copyTo = auditCopy;

  // A drill that finds a difference in a data tab is not a good backup.
  const h = ready();
  withNow(T0, () => h.sb.backupSheetNightly());                                        // slot 1, good
  const pat = h.sheet('Patient_Registry'), patCopy = pat.copyTo;
  pat.copyTo = (dest) => { const c = patCopy.call(pat, dest); c.data[1][3] = 1201; return c; };
  const bad = withNow(T0 + DAY, () => h.sb.sheetRestoreDrill());
  pat.copyTo = patCopy;
  T.eq('the failed drill wrote slot 2 and is not restorable', [bad.slot, bad.restorable], [2, false]);
  T.eq('…its slot is listed as empty', state(h).slots[1].at, '');
  T.eq('…its title says so', book(h, 2).getName(), 'NeoFeed backup slot 02 (failed drill)');
  const st = withNow(T0 + DAY, () => h.sb.sheetBackupStatus());
  T.eq('status counts only the earlier good backup, and the drill as due', [st.goodBackups, st.lastDrill.ok, st.drillDue], [1, false, true]);
  T.eq('the next run rewrites that slot', withNow(T0 + 2 * DAY, () => h.sb.backupSheetNightly()).slot, 2);

  // Every data tab is judged, not only the registry.
  ['Staff', 'Daily_Log'].forEach((name) => {
    const k = ready();
    const sh = k.sheet(name), real = sh.copyTo;
    sh.copyTo = (dest) => { const c = real.call(sh, dest); c.data[1][0] = 'changed'; return c; };
    T.eq('one changed cell in ' + name + ' fails the drill', withNow(T0, () => k.sb.sheetRestoreDrill()).restorable, false);
  });
  // A copy one column narrower, with the same rows, is refused.
  const w = ready();
  const log = w.sheet('Daily_Log'), logCopy = log.copyTo;
  log.data[1][37] = 'x';
  log.copyTo = (dest) => { const c = logCopy.call(log, dest); c.data.forEach(r => { r.length = Math.min(r.length, 37); }); return c; };
  T.ok('a data tab that lost its last column is refused', /does not match the live book/.test(threw(() => withNow(T0, () => w.sb.backupSheetNightly()))));
  // A stray tab in the backup is refused.
  const x = ready();
  x.env.copyHook = (sh, dest) => { if (sh.getName() === 'Chart') dest.insertSheet('stray'); };
  T.ok('a backup with one tab too many is refused', /does not match the live book/.test(threw(() => withNow(T0, () => x.sb.backupSheetNightly()))));
  // A hand-built tab is reported, never judged: an extra row in its copy is two differing cells.
  const c2 = ready();
  const chart = c2.sheet('Chart'), chartCopy = chart.copyTo;
  chart.copyTo = (dest) => { const c = chartCopy.call(chart, dest); c.data.push(['2026-W47', 3]); return c; };
  const extra = withNow(T0, () => c2.sb.sheetRestoreDrill());
  T.eq('a hand-built tab with an extra row: backup good, 2 cells reported, restorable', [extra.differingCellsInOtherTabs, extra.restorable, state(c2).slots[0].at !== ''], [2, true, true]);

  // The header check covers Nursing_Log when the book has it, and a book without its two core tabs is not restorable.
  const n = ready();
  n.env.sheets.Nursing_Log = n.makeSheet('Nursing_Log', [Array.from(n.sb.NURSING_HEADERS)]);
  T.eq('a sound Nursing_Log is checked', withNow(T0, () => n.sb.sheetRestoreDrill()).schema.map(s => [s.tab, s.ok]), [['Patient_Registry', true], ['Daily_Log', true], ['Nursing_Log', true]]);
  n.sheet('Nursing_Log').data[0][2] = 'drifted';
  const nd = withNow(T0 + DAY, () => n.sb.sheetRestoreDrill());
  T.eq('a drifted Nursing_Log header is not restorable', [nd.restorable, nd.schema[2]], [false, { tab: 'Nursing_Log', ok: false, mismatchedColumns: 1 }]);
  const m = ready();
  delete m.env.sheets.Patient_Registry;
  const md = withNow(T0, () => m.sb.sheetRestoreDrill());
  T.eq('a book with no Patient_Registry is not restorable', [md.restorable, md.schema[0]], [false, { tab: 'Patient_Registry', ok: false, mismatchedColumns: 0, missing: true }]);
});

T.section('§10 Books that are wrong, lost or in another time zone', () => {
  // Every slot id is checked before any book is touched. Slot 2 names the live
  // Sheet while slot 1 holds an aged-out backup the purge would otherwise clear.
  const g = ready();
  withNow(T0, () => g.sb.backupSheetNightly());                                   // slot 1
  withNow(T0 + DAY, () => g.sb.backupSheetNightly());                             // slot 2
  const st0 = state(g); st0.slots[1].id = 'sheet-id'; g.props.set(STATE_KEY, JSON.stringify(st0));
  const live = cells(g.sb.SpreadsheetApp.openById('sheet-id'));
  const booksBefore = Object.values(g.env.books).map(b => b.getName() + cells(b)).join('#');
  const stateBefore = g.props.get(STATE_KEY);
  const msg = threw(() => withNow(T0 + 20 * DAY, () => g.sb.backupSheetNightly()));
  T.ok('a slot pointing at the live Sheet throws and names the slot', /slot 02 points at the live Sheet\. No backup book was touched/.test(msg), msg);
  T.eq('…the live book keeps every tab and cell', cells(g.sb.SpreadsheetApp.openById('sheet-id')), live);
  T.eq('…no backup book lost a tab or changed its title, slot 1 included', Object.values(g.env.books).map(b => b.getName() + cells(b)).join('#'), booksBefore);
  T.eq('…and the state did not move', g.props.get(STATE_KEY), stateBefore);
  T.eq('…the lock is released', g.env.lockHeld, 0);
  T.ok('the drill refuses it too', /points at the live Sheet/.test(threw(() => withNow(T0 + 20 * DAY, () => g.sb.sheetRestoreDrill()))));
  T.ok('repair refuses it too, and makes no book', /points at the live Sheet/.test(threw(() => g.sb.repairSheetBackups())) && Object.keys(g.env.books).length === 14);
  // A live-id slot that is not yet the oldest is caught the same night, not weeks later.
  const young = ready();
  withNow(T0, () => young.sb.backupSheetNightly());
  const st1 = state(young); st1.slots[0].id = 'sheet-id'; young.props.set(STATE_KEY, JSON.stringify(st1));
  T.ok('a live-id slot holding a fresh backup is refused at once', /slot 01 points at the live Sheet/.test(threw(() => withNow(T0 + DAY, () => young.sb.backupSheetNightly()))));
  // A slot with no id, and two slots sharing a book.
  const noId = ready();
  const st2 = state(noId); st2.slots[4].id = ''; noId.props.set(STATE_KEY, JSON.stringify(st2));
  T.ok('a slot with no id is named as such', /slot 05 has no book id/.test(threw(() => withNow(T0, () => noId.sb.backupSheetNightly()))));
  const twin = ready();
  const st3 = state(twin); st3.slots[6].id = st3.slots[2].id; twin.props.set(STATE_KEY, JSON.stringify(st3));
  T.ok('two slots sharing a book are refused', /slot 07 shares its book/.test(threw(() => withNow(T0, () => twin.sb.backupSheetNightly()))));
  T.eq('…and nothing was written', twin.props.get(STATE_KEY), JSON.stringify(st3));

  // A state that cannot be read is an error, never "not set up".
  const u = ready();
  u.props.set(STATE_KEY, '{"slots":[{"id":"backup-book-1"');
  ['backupSheetNightly', 'sheetRestoreDrill', 'setupSheetBackups', 'sheetBackupStatus', 'repairSheetBackups'].forEach((fn) => {
    T.ok(fn + ' refuses an unreadable state', /cannot be read/.test(threw(() => u.sb[fn]())));
  });
  T.eq('…and no new book was made', Object.keys(u.env.books).length, 14);
  T.eq('…the lock is released', u.env.lockHeld, 0);
  // A property that is there but blank is unreadable too, not a first run.
  const blank = ready();
  blank.props.set(STATE_KEY, '');
  T.ok('a blank state is refused by setup', /cannot be read/.test(threw(() => blank.sb.setupSheetBackups())));
  T.eq('…and no new book was made', Object.keys(blank.env.books).length, 14);

  // One backup book that will not open does not stop the night: the backup is
  // written elsewhere, and THEN the run throws so the trigger's owner is mailed.
  const d = ready();
  const ids = state(d).slots.map(s => s.id);
  d.env.deadBooks = new Set([ids[0]]);
  const first = threw(() => withNow(T0, () => d.sb.backupSheetNightly()));
  T.ok('the run reports the unopened book after the backup', /backup is good \(slot 2\), but 1 backup book\(s\) could not be opened/.test(first), first);
  T.ok('…with no book id in the message', !ids.some(id => first.includes(id)));
  T.eq('…the backup is in slot 2 and listed as good', [state(d).slots[1].at, tabNames(book(d, 2)).length], [new Date(T0).toISOString(), 5]);
  T.eq('…the lock is released', d.env.lockHeld, 0);
  const sd = withNow(T0, () => d.sb.sheetBackupStatus());
  T.eq('status is not ok while a book will not open', [sd.ok, sd.unopenedSlots, sd.goodBackups, sd.slots[0].opens, sd.slots[1].opens], [false, 1, 1, false, true]);
  // The book opens again the next night (an open may fail once): nothing was remembered against it.
  d.env.deadBooks = new Set();
  const second = withNow(T0 + DAY, () => d.sb.backupSheetNightly());
  T.eq('a book that opens again is simply used', [second.slot, second.unopenedSlots], [1, 0]);
  T.eq('…and status is ok again', withNow(T0 + DAY, () => [d.sb.sheetBackupStatus().ok, d.sb.sheetBackupStatus().unopenedSlots]), [true, 0]);

  // Repair: only a slot that will not open AND holds no listed backup gets a new book.
  const r = ready();
  const rids = state(r).slots.map(s => s.id);
  withNow(T0, () => r.sb.backupSheetNightly());                                   // slot 1 holds a good backup
  r.env.deadBooks = new Set([rids[0], rids[4]]);                                  // slot 1 (good) and slot 5 (empty) will not open
  T.eq('repair replaces the empty lost slot and leaves the good one', r.sb.repairSheetBackups(), { replaced: 1, goodButUnopened: 1 });
  T.eq('…slot 1 keeps its book and its backup', [state(r).slots[0].id, state(r).slots[0].at], [rids[0], new Date(T0).toISOString()]);
  T.eq('…slot 5 has a new book, the other twelve are kept', [state(r).slots[4].id !== rids[4], state(r).slots.filter((x, i) => i !== 4).map(x => x.id)], [true, rids.filter((x, i) => i !== 4)]);
  T.eq('…one book was made', Object.keys(r.env.books).length, 15);
  T.eq('…status still shows the good backup whose book will not open', withNow(T0, () => [r.sb.sheetBackupStatus().unopenedSlots, r.sb.sheetBackupStatus().ok]), [1, false]);
  r.env.deadBooks = new Set();
  T.eq('a repair with every book opening replaces none', r.sb.repairSheetBackups(), { replaced: 0, goodButUnopened: 0 });
  T.eq('…and makes no book', Object.keys(r.env.books).length, 15);
  T.eq('…and status counts none', withNow(T0, () => r.sb.sheetBackupStatus().unopenedSlots), 0);

  // A lost book whose backup has aged out: delisted by the purge, the backup still runs, the run then reports it.
  const p = ready();
  withNow(T0, () => p.sb.backupSheetNightly());
  p.env.deadBooks = new Set([state(p).slots[0].id]);
  const later = threw(() => withNow(T0 + 20 * DAY, () => p.sb.backupSheetNightly()));
  T.ok('an aged-out lost book: the backup still runs and the run reports one book', /good \(slot 2\), but 1 backup book/.test(later), later);
  T.eq('…it is no longer listed as a backup', state(p).slots[0].at, '');
  T.eq('repair then gives that slot a new book', p.sb.repairSheetBackups(), { replaced: 1, goodButUnopened: 0 });
  // Every book lost.
  const a = ready();
  a.env.deadBooks = new Set(state(a).slots.map(s => s.id));
  const all = threw(() => withNow(T0, () => a.sb.backupSheetNightly()));
  T.ok('with every book lost the run throws and names the repair', /No backup book can be opened\. Run repairSheetBackups/.test(all), all);
  T.eq('…the lock is released', a.env.lockHeld, 0);
  // The oldest-first order when several books will not open: slots 1 and 2 are oldest and lost, slot 3 is written.
  const o = ready();
  for (let n2 = 0; n2 < 14; n2++) withNow(T0 + n2 * DAY, () => o.sb.backupSheetNightly());
  o.env.deadBooks = new Set([state(o).slots[0].id, state(o).slots[1].id]);
  const third = threw(() => withNow(T0 + 14 * DAY, () => o.sb.backupSheetNightly()));
  T.ok('with the two oldest lost, the third oldest is overwritten and two are reported', /good \(slot 3\), but 2 backup book/.test(third), third);

  // Status looks at the books itself, so a run that threw before it could report still shows.
  const sa = ready();
  withNow(T0, () => sa.sb.backupSheetNightly());
  sa.env.deadBooks = new Set([state(sa).slots[1].id]);
  sa.sheet('Daily_Log').throwOn.copyTo = { once: true };
  const saMsg = threw(() => withNow(T0 + DAY, () => sa.sb.backupSheetNightly()));
  T.ok('a night with an unopened book AND a failed copy throws the copy error', /Service Spreadsheets failed/.test(saMsg), saMsg);
  T.eq('…and status still shows the book that will not open', withNow(T0 + DAY, () => [sa.sb.sheetBackupStatus().ok, sa.sb.sheetBackupStatus().unopenedSlots]), [false, 1]);
  const sb2 = ready();
  withNow(T0, () => sb2.sb.backupSheetNightly());
  sb2.env.deadBooks = new Set(state(sb2).slots.map(x => x.id));
  threw(() => withNow(T0 + DAY, () => sb2.sb.backupSheetNightly()));
  T.eq('with every book lost, status is not ok and counts 14', withNow(T0 + DAY, () => [sb2.sb.sheetBackupStatus().ok, sb2.sb.sheetBackupStatus().unopenedSlots]), [false, 14]);
  // A lost book that tonight's run never tried (another slot was empty) still shows in status.
  const se = ready();
  for (let n3 = 0; n3 < 13; n3++) withNow(T0 + n3 * DAY, () => se.sb.backupSheetNightly());   // slots 1–13 dated, 14 empty
  se.env.deadBooks = new Set([state(se).slots[0].id]);
  const seNight = withNow(T0 + 13 * DAY, () => se.sb.backupSheetNightly());
  T.eq('the run that did not need the lost book reports none', [seNight.slot, seNight.unopenedSlots], [14, 0]);
  T.eq('…but status does', withNow(T0 + 13 * DAY, () => [se.sb.sheetBackupStatus().ok, se.sb.sheetBackupStatus().unopenedSlots, se.sb.sheetBackupStatus().goodBackups]), [false, 1, 14]);
  const stBefore = se.props.get(STATE_KEY);
  withNow(T0 + 13 * DAY, () => se.sb.sheetBackupStatus());
  T.eq('status writes nothing, lost book or not', se.props.get(STATE_KEY), stBefore);
  // A drill reports an unopened book in its result and does not throw.
  const sdr = ready();
  sdr.env.deadBooks = new Set([state(sdr).slots[0].id]);
  const drillOut = withNow(T0, () => sdr.sb.sheetRestoreDrill());
  T.eq('a drill with one book lost: written to slot 2, restorable, one reported', [drillOut.slot, drillOut.restorable, drillOut.unopenedSlots], [2, true, 1]);

  // A malformed slot entry is named, by the run and by status alike.
  [[null, 'a null entry'], [{ id: 12345, at: '' }, 'an id that is a number'], [{ at: '' }, 'an entry with no id']].forEach(([entry, what]) => {
    const mal = ready();
    const stm = state(mal); stm.slots[3] = entry; mal.props.set(STATE_KEY, JSON.stringify(stm));
    T.ok('the run names ' + what, /slot 04 has no book id/.test(threw(() => withNow(T0, () => mal.sb.backupSheetNightly()))));
    T.ok('status names ' + what, /slot 04 has no book id/.test(threw(() => mal.sb.sheetBackupStatus())));
  });
  const liveSt = ready();
  const stl = state(liveSt); stl.slots[2].id = 'sheet-id'; liveSt.props.set(STATE_KEY, JSON.stringify(stl));
  T.ok('status refuses a slot naming the live Sheet, without opening it', /slot 03 points at the live Sheet/.test(threw(() => liveSt.sb.sheetBackupStatus())));

  // Setup and repair hold the script lock, so neither can write the state under a running backup.
  const lk = seeded();
  lk.env.lockTimeout = true;
  T.ok('setup waits for the lock', /Lock timeout/.test(threw(() => lk.sb.setupSheetBackups())));
  T.eq('…and makes no book without it', Object.keys(lk.env.books).length, 0);
  lk.env.lockTimeout = false;
  lk.sb.setupSheetBackups();
  lk.env.deadBooks = new Set([state(lk).slots[0].id]);
  lk.env.lockTimeout = true;
  T.ok('repair waits for the lock', /Lock timeout/.test(threw(() => lk.sb.repairSheetBackups())));
  T.eq('…and replaces nothing without it', Object.keys(lk.env.books).length, 14);
  lk.env.lockTimeout = false;
  const waits = lk.env.lockWaits, releases = lk.env.lockReleases;
  lk.sb.repairSheetBackups();
  T.eq('a repair takes and releases the lock once', [lk.env.lockWaits - waits, lk.env.lockReleases - releases, lk.env.lockHeld], [1, 1, 0]);

  // A thrown message never carries a book id, though Google's own text does.
  const s = ready();
  const slotId = state(s).slots[0].id;
  s.sheet('Daily_Log').throwOn.copyTo = { once: true, err: new Error('Service Spreadsheets failed while accessing document with id ' + slotId + '.') };
  const m1 = threw(() => withNow(T0, () => s.sb.backupSheetNightly()));
  T.ok('a backup book id is cut from the thrown message', /with id \(book\)/.test(m1) && !m1.includes(slotId), m1);
  s.sheet('Daily_Log').throwOn.copyTo = { once: true, err: new Error('Service Spreadsheets failed while accessing document with id sheet-id.') };
  const m2 = threw(() => withNow(T0, () => s.sb.sheetRestoreDrill()));
  T.ok('the live Sheet id is cut too', /with id \(book\)/.test(m2) && !m2.includes('sheet-id'), m2);

  const lateId = state(s).slots[9].id;
  s.sheet('Daily_Log').throwOn.copyTo = { once: true, err: new Error('failed for ' + lateId + ' and ' + lateId) };
  const m3 = threw(() => withNow(T0 + DAY, () => s.sb.backupSheetNightly()));
  T.eq('every slot id is cut, each time it appears', m3, 'failed for (book) and (book)');
  const sc = seeded();
  sc.env.createThrows = 'Service Spreadsheets failed while accessing document with id sheet-id.';
  T.eq('setup cuts ids from its errors', threw(() => sc.sb.setupSheetBackups()), 'Service Spreadsheets failed while accessing document with id (book).');
  const rc = ready();
  rc.env.deadBooks = new Set([state(rc).slots[0].id]);
  rc.env.createThrows = 'no quota for ' + state(rc).slots[3].id;
  T.eq('repair cuts ids from its errors', threw(() => rc.sb.repairSheetBackups()), 'no quota for (book)');

  // Time zone and locale follow the live Sheet.
  const z = seeded();
  z.sb.setupSheetBackups();
  T.eq('a new book starts in the account zone and locale', [book(z, 1).getSpreadsheetTimeZone(), book(z, 1).getSpreadsheetLocale()], ['America/Los_Angeles', 'en_US']);
  const zoneAtCopy = [], flushesAtSave = [];
  z.env.copyHook = (sh, dest) => zoneAtCopy.push(dest.getSpreadsheetTimeZone() + ' ' + dest.getSpreadsheetLocale());
  const zApi = z.sb.PropertiesService.getScriptProperties(), zSet = zApi.setProperty;
  zApi.setProperty = (k, v) => { if (k === STATE_KEY && JSON.parse(v).slots[0].at) flushesAtSave.push(z.env.flushes || 0); return zSet(k, v); };
  withNow(T0, () => z.sb.backupSheetNightly());
  zApi.setProperty = zSet; z.env.copyHook = null;
  T.eq('zone and locale are the live Sheet\u2019s before the first tab is copied', zoneAtCopy, new Array(5).fill('Asia/Bangkok en_GB'));
  T.eq('the copy is flushed before the slot is saved as good', flushesAtSave, [1]);

  // The purge blanks and saves the slot before it deletes a tab.
  const q = ready();
  withNow(T0, () => q.sb.backupSheetNightly());
  const b1 = book(q, 1), realDelete = b1.deleteSheet;
  b1.deleteSheet = () => { throw new Error('Service Spreadsheets failed'); };
  T.ok('a purge that cannot delete throws', threw(() => withNow(T0 + 20 * DAY, () => q.sb.backupSheetNightly())) !== '');
  b1.deleteSheet = realDelete;
  T.eq('…and the aged-out slot is already listed as empty', state(q).slots[0].at, '');

  // The status log line is counts and ages only.
  const l = ready();
  withNow(T0, () => l.sb.sheetRestoreDrill());
  l.env.logs.length = 0;
  withNow(T0 + 3600e3, () => l.sb.sheetBackupStatus());
  T.eq('the status line', l.env.logs, ['sheet backup status: ok true, 1 good backup(s), newest 1 h old, 0 book(s) not opening, drill due false']);
});

T.done();
