// verify-sheet-backup-1115.cjs — the Sheet backup and the restore drill
// (gas-backend.gs § Sheet backup and restore drill, 2026-11-15).
//
// Every NeoFeed record is in one spreadsheet. The backend now keeps 14 backup
// books and, once a night, copies every tab of the live book over the oldest
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
//   §10 A slot that names the live Sheet is refused before anything is
//       deleted; an unreadable state is an error, never "not set up"; a lost
//       backup book is skipped and repairSheetBackups() replaces it; a thrown
//       message carries no book id; new books take the live Sheet's time zone.
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
  T.eq('status lists 14 slots with no id', [s.slots.length, Object.keys(s.slots[0]).sort()], [14, ['ageHours', 'at', 'broken', 'slot']]);
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
  T.eq('the backup line is counts only', lines[1], 'sheet backup: slot 1, 5 tabs, 10 rows, 0 old slot(s) emptied');
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
  // A slot that names the live Sheet is refused before anything is deleted.
  const g = ready();
  const st0 = state(g); st0.slots[0].id = 'sheet-id'; g.props.set(STATE_KEY, JSON.stringify(st0));
  const live = cells(g.sb.SpreadsheetApp.openById('sheet-id'));
  const msg = threw(() => withNow(T0, () => g.sb.backupSheetNightly()));
  T.ok('a slot pointing at the live Sheet throws', /points at the live Sheet/.test(msg), msg);
  T.eq('…and the live book keeps every tab and cell', cells(g.sb.SpreadsheetApp.openById('sheet-id')), live);
  T.eq('…the lock is released', g.env.lockHeld, 0);
  const old = ready();
  withNow(T0, () => old.sb.backupSheetNightly());
  const st1 = state(old); st1.slots[0].id = 'sheet-id'; old.props.set(STATE_KEY, JSON.stringify(st1));
  const live2 = cells(old.sb.SpreadsheetApp.openById('sheet-id'));
  T.ok('…also when the purge would reach it', /points at the live Sheet/.test(threw(() => withNow(T0 + 20 * DAY, () => old.sb.backupSheetNightly()))));
  T.eq('…live book untouched', cells(old.sb.SpreadsheetApp.openById('sheet-id')), live2);

  // A state that cannot be read is an error, never "not set up".
  const u = ready();
  u.props.set(STATE_KEY, '{"slots":[{"id":"backup-book-1"');
  ['backupSheetNightly', 'sheetRestoreDrill', 'setupSheetBackups', 'sheetBackupStatus', 'repairSheetBackups'].forEach((fn) => {
    T.ok(fn + ' refuses an unreadable state', /cannot be read/.test(threw(() => u.sb[fn]())));
  });
  T.eq('…and no new book was made', Object.keys(u.env.books).length, 14);
  T.eq('…the lock is released', u.env.lockHeld, 0);

  // One backup book deleted in Drive does not stop the night.
  const d = ready();
  const ids = state(d).slots.map(s => s.id);
  d.env.deadBooks = new Set([ids[0]]);
  const night = withNow(T0, () => d.sb.backupSheetNightly());
  T.eq('with slot 1 unopenable the backup goes to slot 2', night.slot, 2);
  T.eq('…slot 1 is marked broken and empty', [state(d).slots[0].broken, state(d).slots[0].at], [true, '']);
  T.eq('status reports one broken slot', withNow(T0, () => d.sb.sheetBackupStatus()).brokenSlots, 1);
  T.eq('the next night skips it', withNow(T0 + DAY, () => d.sb.backupSheetNightly()).slot, 3);
  T.eq('repair replaces only the lost book', d.sb.repairSheetBackups(), { replaced: 1 });
  T.eq('…with a new id, and the others kept', [state(d).slots[0].id !== ids[0], state(d).slots.slice(1).map(s => s.id)], [true, ids.slice(1)]);
  T.eq('…no broken slot left, two good backups kept', (() => { const s = withNow(T0 + DAY, () => d.sb.sheetBackupStatus()); return [s.brokenSlots, s.goodBackups]; })(), [0, 2]);
  T.eq('a repair with nothing lost replaces none', d.sb.repairSheetBackups(), { replaced: 0 });
  T.eq('the repaired slot is used next', withNow(T0 + 2 * DAY, () => d.sb.backupSheetNightly()).slot, 1);
  // A lost book whose backup has aged out: marked broken by the purge, the run goes on.
  const p = ready();
  withNow(T0, () => p.sb.backupSheetNightly());
  p.env.deadBooks = new Set([state(p).slots[0].id]);
  const later = withNow(T0 + 20 * DAY, () => p.sb.backupSheetNightly());
  T.eq('an aged-out lost book is marked broken and the backup still runs', [later.slot, later.purgedSlots, state(p).slots[0].broken, state(p).slots[0].at], [2, 0, true, '']);
  // Every book lost.
  const a = ready();
  a.env.deadBooks = new Set(state(a).slots.map(s => s.id));
  const all = threw(() => withNow(T0, () => a.sb.backupSheetNightly()));
  T.ok('with every book lost the run throws and names the repair', /repairSheetBackups/.test(all), all);
  T.eq('…the lock is released', a.env.lockHeld, 0);

  // A thrown message never carries a book id, though Google's own text does.
  const s = ready();
  const slotId = state(s).slots[0].id;
  s.sheet('Daily_Log').throwOn.copyTo = { once: true, err: new Error('Service Spreadsheets failed while accessing document with id ' + slotId + '.') };
  const m1 = threw(() => withNow(T0, () => s.sb.backupSheetNightly()));
  T.ok('a backup book id is cut from the thrown message', /with id \(book\)/.test(m1) && !m1.includes(slotId), m1);
  s.sheet('Daily_Log').throwOn.copyTo = { once: true, err: new Error('Service Spreadsheets failed while accessing document with id sheet-id.') };
  const m2 = threw(() => withNow(T0, () => s.sb.sheetRestoreDrill()));
  T.ok('the live Sheet id is cut too', /with id \(book\)/.test(m2) && !m2.includes('sheet-id'), m2);

  // Time zone and locale follow the live Sheet.
  const z = seeded();
  z.sb.setupSheetBackups();
  const zones = Object.values(z.env.books).map(b => b.getSpreadsheetTimeZone() + ' ' + b.getSpreadsheetLocale());
  T.eq('every new book takes the zone and locale of the live Sheet', [...new Set(zones)], ['Asia/Bangkok en_GB']);
  book(z, 1).setSpreadsheetTimeZone('America/Los_Angeles');
  withNow(T0, () => z.sb.backupSheetNightly());
  T.eq('a book whose zone was changed is set back before the copy', book(z, 1).getSpreadsheetTimeZone(), 'Asia/Bangkok');
  T.ok('the copy is flushed before the slot is called good', z.env.flushes >= 1);

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
  T.eq('the status line', l.env.logs, ['sheet backup status: ok true, 1 good backup(s), newest 1 h old, 0 broken slot(s), drill due false']);
});

T.done();
