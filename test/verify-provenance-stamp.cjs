// Provenance stamp — CONSTANTS_VERSION / APP_VERSION on every Daily_Log row.
//
// Why this exists. `PrintOrderForm` prints a compounding order that a
// pharmacy acts on, and `_buildLogRow` records who submitted it and when —
// but until this change nothing recorded WHICH VALUES produced the numbers.
// The day the Na acetate / KCl stock strengths come back from the shelf check
// different from the inferred 3 and 2 mEq/mL (BACKLOG.md § Now), the question
// is "which printed orders used the old divisor?" and there was no way to
// answer it. This is 3099701 Lec 2's model-store argument applied to a
// rung-0 tool: a number you cannot version is a number you cannot recall.
//
// Schema note: the two columns are APPENDED at AF/AG (index 31/32). Daily_Log
// is read and written BY INDEX — the header labels are cosmetic — so nothing
// may ever be inserted in the middle of this row.
//
// `gas-backend.gs` is Apps Script, not Node, but every top-level statement is
// a var or a function declaration, so the file evaluates against stubbed
// globals and the real logDailyNutrition/updateDailyNutrition can be called.
// No dependencies. Run with plain `node test/verify-provenance-stamp.cjs`.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = Object.is(got, want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(58)} got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
function ok(name, cond) { eq(name, !!cond, true); }

const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// ── Column indices. Any change here is a schema migration, not a tweak. ───
const COL_CONSTANTS_VERSION = 31; // AF
const COL_APP_VERSION       = 32; // AG
const ROW_WIDTH             = 33;

// ══ 1 · data.js owns the version strings ══════════════════════════════════
console.log('\n── data.js exports the versions ──');
const dsb = { window: {}, console };
vm.createContext(dsb);
vm.runInContext(R('data.js'), dsb);
const D = dsb.window.NEOFEED_DATA;

eq('CONSTANTS_VERSION is a string', typeof D.CONSTANTS_VERSION, 'string');
eq('APP_VERSION is a string',       typeof D.APP_VERSION,       'string');
ok('CONSTANTS_VERSION is non-empty', (D.CONSTANTS_VERSION || '').length > 0);
ok('APP_VERSION is non-empty',       (D.APP_VERSION || '').length > 0);
ok('CONSTANTS_VERSION is YYYY-MM-DD or YYYY-MM-DD.N',
   /^\d{4}-\d{2}-\d{2}(\.\d+)?$/.test(D.CONSTANTS_VERSION || ''));

// A version that can contain a comma or a leading "=" would break the sheet
// or be read as a formula. _sheetSafe defuses the formula case; this pins the
// format so it never gets there.
ok('CONSTANTS_VERSION has no formula-injection prefix',
   !/^[=+\-@]/.test(D.CONSTANTS_VERSION || ''));

// ══ 2 · the backend writes them, at the right index ═══════════════════════
function makeSheet(maxColumns, rows) {
  const data = [new Array(ROW_WIDTH).fill('header'), ...(rows || [])];
  return {
    maxColumns, writes: [], appended: [], insertedColumns: [],
    getMaxColumns() { return this.maxColumns; },
    insertColumnsAfter(after, howMany) {
      this.insertedColumns.push([after, howMany]);
      this.maxColumns += howMany;
    },
    getLastRow() { return data.length; },
    getDataRange() { return { getValues: () => data.map(r => r.slice()) }; },
    getRange(row, col, numRows, numCols) {
      if (col + numCols - 1 > this.maxColumns) {
        throw new Error('The coordinates or dimensions of the range are invalid.');
      }
      const sheet = this;
      return {
        setValues(values) { sheet.writes.push({ row, col, numCols, values }); },
        setValue() {}, getValue: () => '', getValues: () => [[]],
      };
    },
    appendRow(r) {
      if (r.length > this.maxColumns) {
        throw new Error('The number of columns in the data does not match the number of columns in the range.');
      }
      this.appended.push(r); data.push(r.slice());
    },
  };
}

let sheet = null;
const sandbox = {
  SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }) },
  Utilities: { getUuid: () => 'uuid-1', computeHmacSha256Signature: () => [], base64Encode: () => '' },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'sheet-id', setProperty() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) },
  ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
  Logger: { log() {} },
  console,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(R('gas-backend.gs'), sandbox);

const ENTRY = {
  dol: 5, weight: 1200, fluid: 150, gir: 6, pro: 3, kcal: 90,
  na: 3, k: 2, ca: 60, p: 40, enVolPerKg: 20,
  ioInput: 180, ioOutput: 120, drainContent: 0,
  route: 'TPN central', status: 'submitted',
  constantsVersion: '2026-08-26.1', appVersion: 'test-app-version',
};

console.log('\n── create path: logDailyNutrition ──');
sheet = makeSheet(40);
sandbox.logDailyNutrition('AB-1200', ENTRY, 'doc@kcmh');
const created = sheet.appended[0] || [];
eq('row is 33 columns wide',                    created.length, ROW_WIDTH);
eq('constantsVersion lands in AF (index 31)',   created[COL_CONSTANTS_VERSION], '2026-08-26.1');
eq('appVersion lands in AG (index 32)',         created[COL_APP_VERSION], 'test-app-version');

console.log('\n── the existing columns did not move ──');
// The whole risk of appending to a by-index schema is shunting something.
eq('sessionId still index 1',        created[1],  'AB-1200');
eq('submittedBy still index 15',     created[15], 'doc@kcmh');
eq('entryId still index 25',         created[25], 'uuid-1');
ok('lastModified still index 26',    typeof created[26] === 'string' && created[26].includes('T'));
eq('lastModifiedBy still index 27',  created[27], 'doc@kcmh');
eq('ioInput still index 28',         created[28], 180);
eq('ioOutput still index 29',        created[29], 120);
eq('drainContent still index 30',    created[30], 0);

console.log('\n── update path: updateDailyNutrition ──');
const existing = new Array(ROW_WIDTH).fill('');
existing[1] = 'AB-1200'; existing[15] = 'orig@kcmh';
existing[25] = 'uuid-1'; existing[26] = 'stamp-1'; existing[27] = 'orig@kcmh';
sheet = makeSheet(40, [existing]);
sandbox.updateDailyNutrition('AB-1200', 'uuid-1', 'stamp-1', ENTRY, 'editor@kcmh');
const updated = (sheet.writes[0] && sheet.writes[0].values[0]) || [];
eq('update writes 33 columns',                  sheet.writes[0] && sheet.writes[0].numCols, ROW_WIDTH);
eq('constantsVersion lands in AF on update',    updated[COL_CONSTANTS_VERSION], '2026-08-26.1');
eq('appVersion lands in AG on update',          updated[COL_APP_VERSION], 'test-app-version');
eq('original submittedBy still preserved',      updated[15], 'orig@kcmh');
eq('editor recorded as lastModifiedBy',         updated[27], 'editor@kcmh');

console.log('\n── an old client that sends no version must still save ──');
// The frontend deploys before the backend does. A save arriving from a cached
// bundle with no constantsVersion must write an empty cell, not throw and not
// lose the row — a failed save at the bedside is worse than a blank column.
sheet = makeSheet(40);
let threw = null;
try {
  const { constantsVersion, appVersion, ...noVersion } = ENTRY;
  sandbox.logDailyNutrition('AB-1200', noVersion, 'doc@kcmh');
} catch (e) { threw = e.message; }
eq('save without versions does not throw',      threw, null);
eq('still writes 33 columns',                   (sheet.appended[0] || []).length, ROW_WIDTH);
eq('missing constantsVersion becomes ""',       (sheet.appended[0] || [])[COL_CONSTANTS_VERSION], '');
eq('missing appVersion becomes ""',             (sheet.appended[0] || [])[COL_APP_VERSION], '');

console.log('\n── a Daily_Log tab that predates AF/AG is widened, not broken ──');
// Same trap as AC–AE in 2b7d2a4: getRange/appendRow past the grid edge throws,
// and it surfaces at the bedside as a failed save. Both paths must widen.
sheet = makeSheet(31);
threw = null;
try { sandbox.logDailyNutrition('AB-1200', ENTRY, 'doc@kcmh'); } catch (e) { threw = e.message; }
eq('create on a 31-column tab does not throw',  threw, null);
eq('grid widened to 33',                        sheet.maxColumns, ROW_WIDTH);

sheet = makeSheet(31, [existing.slice(0, 31)]);
threw = null;
try { sandbox.updateDailyNutrition('AB-1200', 'uuid-1', 'stamp-1', ENTRY, 'editor@kcmh'); } catch (e) { threw = e.message; }
eq('update on a 31-column tab does not throw',  threw, null);
eq('grid widened to 33 on update',              sheet.maxColumns, ROW_WIDTH);

console.log('\n── header migration knows about the new columns ──');
const gas = R('gas-backend.gs');
ok('ensureLogHeaderColumns labels column 32', /32:\s*["']constantsVersion["']/.test(gas));
ok('ensureLogHeaderColumns labels column 33', /33:\s*["']appVersion["']/.test(gas));
ok('ensureLogHeaderColumns widens to 33',     /\b33 - sh\.getMaxColumns\(\)/.test(gas));

// ══ 3 · the frontend actually sends them, and prints them ═════════════════
console.log('\n── calculator.jsx wires the stamp through ──');
const calc = R('calculator.jsx');
ok('handleSave sends constantsVersion',  /constantsVersion:\s*D\.CONSTANTS_VERSION/.test(calc));
ok('handleSave sends appVersion',        /appVersion:\s*D\.APP_VERSION/.test(calc));
ok('PrintOrderForm accepts an entryId',  /entryId/.test(calc.slice(calc.indexOf('function PrintOrderForm'))));
ok('print form renders CONSTANTS_VERSION',
   /CONSTANTS_VERSION/.test(calc.slice(calc.indexOf('function PrintOrderForm'))));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
