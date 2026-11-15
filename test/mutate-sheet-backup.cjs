// mutate-sheet-backup.cjs — does verify-sheet-backup-1115.cjs notice wrong code?
//
// Each entry below breaks one line of gas-backend.gs § Sheet backup and restore
// drill in a temp copy and runs the harness against it (NEOFEED_GAS_SRC). A
// mutation is KILLED when the harness fails or does not finish in 60 s, and
// SURVIVED when it still passes: a survivor is a behaviour no assertion pins.
// Not a harness: CI runs test/verify-*.cjs only. Run it by hand after changing
// that block or its harness:
//
//   node test/mutate-sheet-backup.cjs          (exit 1 if any mutation survives)
//
// An anchor that no longer occurs exactly once in gas-backend.gs is an error,
// not a pass: fix the entry.
//
// Left out on purpose, because the result is the same either way: dropping the
// `continue` that skips a book the purge already failed to open costs only one
// more failed open.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SRC = path.join(__dirname, '..', 'gas-backend.gs');
const HARNESS = path.join(__dirname, 'verify-sheet-backup-1115.cjs');
const src = fs.readFileSync(SRC, 'utf8');

const M = [
  // The slot is good only after the check.
  ['slot not blanked before the write', '    var label = _backupSlotLabel(slot);\n    st.slots[slot].at = "";\n    _saveBackupState(st);\n', '    var label = _backupSlotLabel(slot);\n'],
  ['count check off', '    if (bad > 0) {', '    if (false) {'],
  ['column count not checked', ': (copyRows === row.rows && copyCols === row.columns);', ': (copyRows === row.rows);'],
  ['tab count not checked', '    if (dest.getSheets().length !== srcSheets.length) bad++;\n', ''],
  ['placeholder tab left in', '    dest.deleteSheet(holder);\n', '\n'],
  ['flush after the slot is saved as good', '    dest.deleteSheet(holder);\n    SpreadsheetApp.flush();\n', '    dest.deleteSheet(holder);\n'],
  ['failed drill kept as a good backup', '      if (!out.restorable) {', '      if (false) {'],
  ['failed drill not recorded', '      st.lastDrill = { at: doneAt, ok: out.restorable };', '      st.lastDrill = { at: doneAt, ok: true };'],
  // Retention.
  ['no purge', 'if (st.slots[i].at && (isNaN(slotTime) || now - slotTime > keepMs)) {', 'if (false) {'],
  ['purge at 15 days', 'var keepMs = BACKUP_KEEP_DAYS * 24', 'var keepMs = (BACKUP_KEEP_DAYS + 1) * 24'],
  ['purge at exactly 14 days', 'now - slotTime > keepMs', 'now - slotTime >= keepMs'],
  ['purge clears before it saves the blank', '        st.slots[i].at = "";\n        _saveBackupState(st);\n        var stale', '        st.slots[i].at = "";\n        var stale'],
  ['13 slots', 'var BACKUP_SLOTS = 14;', 'var BACKUP_SLOTS = 13;'],
  ['newest slot overwritten first', "      while (pos > 0 && Date.parse(st.slots[dated[pos - 1]].at) > Date.parse(st.slots[k2].at)) pos--;", "      while (pos > 0 && Date.parse(st.slots[dated[pos - 1]].at) < Date.parse(st.slots[k2].at)) pos--;"],
  ['empty slots not used first', '    order = order.concat(dated);', '    order = dated.concat(order);'],
  // The lock.
  ['no lock', '  lock.waitLock(BACKUP_LOCK_WAIT_MS);\n', '\n'],
  // Tabs appended outside the lock.
  ['append tab must equal its count', ': appendOnly ? (copyRows >= row.rows && copyCols >= row.columns)\n', ': appendOnly ? (copyRows === row.rows && copyCols >= row.columns)\n'],
  ['append tab rows not checked', ': appendOnly ? (copyRows >= row.rows && copyCols >= row.columns)\n', ': appendOnly ? (copyCols >= row.columns)\n'],
  ['append tab columns not checked', ': appendOnly ? (copyRows >= row.rows && copyCols >= row.columns)\n', ': appendOnly ? (copyRows >= row.rows)\n'],
  ['append tab compared over the live rows', 'var rows = appendOnly ? b.length : Math.max(a.length, b.length), diff = 0;', 'var rows = Math.max(a.length, b.length), diff = 0;'],
  ['counts read after the copy', '      var copy = sh.copyTo(dest);\n      copy.setName(row.name);\n      tabs.push(row);', '      var copy = sh.copyTo(dest);\n      copy.setName(row.name);\n      row.rows = sh.getLastRow();\n      tabs.push(row);'],
  // The drill's verdict.
  ['drill ignores differing cells', 'out.restorable = judgedDiff === 0 && ', 'out.restorable = '],
  ['only two data tabs judged', 'var BACKUP_DATA_TABS = ["Staff", "Patient_Registry", "Daily_Log", "Nursing_Log", "Audit_Log", "Usage_Log", "QI_Export"];', 'var BACKUP_DATA_TABS = ["Patient_Registry", "Audit_Log"];'],
  ['Nursing_Log headers not checked', '["Patient_Registry", "Daily_Log", "Nursing_Log"].forEach(function (tab) {\n    var sh = dest.getSheetByName(tab), expected', '["Patient_Registry", "Daily_Log"].forEach(function (tab) {\n    var sh = dest.getSheetByName(tab), expected'],
  ['a missing core tab passes the header check', 'if (tab !== "Nursing_Log") out.push({ tab: tab, ok: false, mismatchedColumns: 0, missing: true });', ''],
  ['cell diff over the shorter side only', 'var rows = appendOnly ? b.length : Math.max(a.length, b.length), diff = 0;', 'var rows = Math.min(a.length, b.length), diff = 0;'],
  ['a Date equals any Date', 'if (aDate || bDate) return aDate && bDate && a.getTime() === b.getTime();', 'if (aDate || bDate) return aDate && bDate;'],
  // Slot ids.
  ['live-id slot not refused', ': id === live ? "points at the live Sheet"', ': false ? "points at the live Sheet"'],
  ['missing id not refused', 'var what = !id ? "has no book id"', 'var what = false ? "has no book id"'],
  ['shared book not refused', ': seen[id] ? "shares its book with another slot" : "";', ': "";'],
  ['slot ids not checked before the run', '    _backupCheckSlots(st);\n    var now = Date.now();', '    var now = Date.now();'],
  ['slot ids not checked before a repair', '    _backupCheckSlots(st);\n    var replaced = 0, goodButUnopened = 0;', '    var replaced = 0, goodButUnopened = 0;'],
  // The stored state.
  ['unreadable state read as empty', '    throw new Error("The Script Property SHEET_BACKUP_STATE cannot be read.', '    return { slots: [], lastDrill: null }; throw new Error("The Script Property SHEET_BACKUP_STATE cannot be read.'],
  ['blank state read as a first run', '  if (raw === null || raw === undefined) return { slots: [], lastDrill: null };', '  if (!raw) return { slots: [], lastDrill: null };'],
  // Books that will not open.
  ['an unopened book is not reported', '    if (out.unopenedSlots > 0) {', '    if (false) {'],
  ['status ok with an unopened book', ' && newestHours <= BACKUP_FRESH_HOURS && unopened === 0;', ' && newestHours <= BACKUP_FRESH_HOURS;'],
  ['repair replaces a good backup that did not open', '      if (st.slots[i].at) { goodButUnopened++; continue; }\n', ''],
  ['repair replaces every slot', '      if (_backupOpenSlot(st, i)) continue;\n      if (st.slots[i].at)', '      if (st.slots[i].at)'],
  ['repair does not save its count', '    st.unopened = goodButUnopened;\n', ''],
  // Ids and logs.
  ['book id in the run log line', 'return "sheet " + kind + ": slot " + out.slot', 'return "sheet " + kind + ": slot " + out.slot + _backupState().slots[0].id'],
  ['drill time in the status log line', '+ " book(s) not opened last run, drill due " + drillDue);', '+ " book(s) not opened last run, drill due " + drillDue + " " + (st.lastDrill ? st.lastDrill.at : ""));'],
  ['thrown message not scrubbed', '  ids.forEach(function (id) { msg = msg.split(id).join("(book)"); });', ''],
  ['only the first id scrubbed', '  ids.forEach(function (id) { msg = msg.split(id).join("(book)"); });', '  ids.slice(0, 2).forEach(function (id) { msg = msg.split(id).join("(book)"); });'],
  ['scrub shortest id first', '  ids.sort(function (x, y) { return y.length - x.length; });', '  ids.sort(function (x, y) { return x.length - y.length; });'],
  ['setup errors not scrubbed', 'function setupSheetBackups() {\n  return _backupGuarded(function () {', 'function setupSheetBackups() {\n  return (function (f) { return f(); })(function () {'],
  ['repair errors not scrubbed', 'function repairSheetBackups() {\n  return _backupGuarded(function () {', 'function repairSheetBackups() {\n  return (function (f) { return f(); })(function () {'],
  // Time zone and locale.
  ['new book keeps the account time zone', '  _backupMatchSettings(_book(), book);\n  return book;', '  return book;'],
  ['time zone not matched before the copy', '    _backupMatchSettings(src, dest);\n    var holder = _clearBackupBook(dest);\n', '    var holder = _clearBackupBook(dest);\n'],
  ['locale not matched', '  if (dest.getSpreadsheetLocale() !== src.getSpreadsheetLocale()) dest.setSpreadsheetLocale(src.getSpreadsheetLocale());', ''],
  // Status.
  ['fresh for 37 h', 'var BACKUP_FRESH_HOURS = 36;', 'var BACKUP_FRESH_HOURS = 37;'],
  ['drill due at 89 days', 'var BACKUP_DRILL_DAYS = 90;', 'var BACKUP_DRILL_DAYS = 89;'],
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'neofeed-mut-'));
const file = path.join(tmp, 'gas-mutant.gs');
let survived = 0, broken = 0;
for (const [name, from, to] of M) {
  const count = src.split(from).length - 1;
  if (count !== 1) { console.log('ANCHOR  ' + name + '  (found ' + count + ' times)'); broken++; continue; }
  fs.writeFileSync(file, src.replace(from, () => to));
  const r = spawnSync(process.execPath, [HARNESS], { env: Object.assign({}, process.env, { NEOFEED_GAS_SRC: file }), encoding: 'utf8', timeout: 60000 });
  const last = String(r.stdout || '').trim().split('\n').pop() || '';
  const passed = r.status === 0 && /ALL PASS/.test(last);
  if (passed) survived++;
  console.log((passed ? 'SURVIVED' : 'killed  ') + '  ' + name + (r.error && r.error.code === 'ETIMEDOUT' ? '  (did not finish)' : ''));
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + M.length + ' mutations: ' + (M.length - survived - broken) + ' killed, ' + survived + ' survived, ' + broken + ' with a stale anchor');
process.exit(survived || broken ? 1 : 0);
