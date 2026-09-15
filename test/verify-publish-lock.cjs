// verify-publish-lock.cjs — the "Save / Submit / Print" publish-lock design.
//
// A saved Daily_Log row starts as a draft: editable in place, printed with a
// "รอผลแลป" watermark. A clinician's explicit Submit (publishDailyLog) locks
// it — published rows are never overwritten again. Editing a published row
// creates a NEW row (a revision) instead: the old row is marked superseded,
// the new one starts life as another draft. This is the same immutable-
// revision pattern already accepted for the Center Point integration
// (docs/superpowers/specs/... "publish/lock" design, approved by Praew
// 2026-09-10) — nothing here overwrites a row once it has been submitted.
//
// Schema note: five columns are APPENDED at AH–AL (index 33–37), after AF/AG
// (constantsVersion/appVersion). Daily_Log is read and written BY INDEX — the
// header labels are cosmetic — so nothing may ever be inserted ahead of them.
//
// `gas-backend.gs` is Apps Script, not Node, but every top-level statement is
// a var or a function declaration, so the file evaluates against stubbed
// globals and the real functions can be called directly. No dependencies.
// Run with plain `node test/verify-publish-lock.cjs`.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(58)} got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
function ok(name, cond) { eq(name, !!cond, true); }

const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// ── Column indices. Any change here is a schema migration, not a tweak. ───
const COL_PUBLISHED       = 33; // AH
const COL_PUBLISHED_BY    = 34; // AI
const COL_REVISION_NUMBER = 35; // AJ
const COL_REVISION_OF     = 36; // AK
const COL_SUPERSEDED_AT   = 37; // AL
const ROW_WIDTH           = 38;

function makeSheet(maxColumns, rows) {
  const data = [new Array(ROW_WIDTH).fill('header'), ...(rows || [])];
  return {
    maxColumns, appended: [], insertedColumns: [], deleted: [],
    getMaxColumns() { return this.maxColumns; },
    insertColumnsAfter(after, howMany) {
      this.insertedColumns.push([after, howMany]);
      this.maxColumns += howMany;
    },
    getLastRow() { return data.length; },
    getLastColumn() { return Math.max(1, ...data.map(row => row.length)); },
    getDataRange() { return { getValues: () => data.map(r => r.slice()) }; },
    getRange(row, col, numRows = 1, numCols = 1) {
      if (col + numCols - 1 > this.maxColumns) {
        throw new Error('The coordinates or dimensions of the range are invalid.');
      }
      const sheet = this;
      return {
        getValue: () => (data[row - 1] || [])[col - 1] ?? '',
        getValues: () => [(data[row - 1] || []).slice(col - 1, col - 1 + numCols)],
        setValue(value) { if (!data[row - 1]) data[row - 1] = []; data[row - 1][col - 1] = value; },
        setValues(values) { data[row - 1] = values[0].slice(); },
      };
    },
    appendRow(r) {
      // Real appendRow does not throw on width — only getRange() past the
      // current grid does (see makeSheet's getRange above). Matches
      // test/verify-log-create-guard.cjs's stub, which exercises the same
      // brand-new-sheet header-creation path this test also needs.
      this.appended.push(r); data.push(r.slice());
    },
    deleteRow(row) { this.deleted.push(row); data.splice(row - 1, 1); },
  };
}

let sheet = null;
let lockTaken = 0, lockReleased = 0;
const sandbox = {
  SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet, insertSheet: () => (sheet = makeSheet(0)) }) },
  Utilities: { getUuid: () => 'uuid-new', computeHmacSha256Signature: () => [], base64Encode: () => '' },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'sheet-id', setProperty() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  LockService: { getScriptLock: () => ({ waitLock() { lockTaken++; }, releaseLock() { lockReleased++; } }) },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) },
  ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
  Logger: { log() {} },
  console,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(R('gas-backend.gs'), sandbox);

// logDailyNutrition refuses a sessionId that is not in Patient_Registry since
// the 2026-09-11 review (B5). This harness's single-sheet stub has no registry
// tab, so treat every id as registered here; verify-review-0911.cjs exercises
// the real _patientExists against a real registry stub.
sandbox._patientExists = () => true;

const ENTRY = {
  dol: 5, weight: 1200, fluid: 150, gir: 6, pro: 3, kcal: 90,
  na: 3, k: 2, ca: 60, p: 40, enVolPerKg: 20,
  ioInput: 180, ioOutput: 120, drainContent: 0,
  route: 'TPN central', status: 'submitted',
  constantsVersion: '2026-09-05.1', appVersion: 'test-app-version',
};

console.log('\n── a new Daily_Log sheet has the publish/revision columns ──');
sheet = null;
const created = sandbox.getSheetLog();
eq('header is A–AL (38 columns)', created.appended[0].length, ROW_WIDTH);
eq('AH is published',        created.appended[0][COL_PUBLISHED], 'published');
eq('AI is publishedBy',      created.appended[0][COL_PUBLISHED_BY], 'publishedBy');
eq('AJ is revisionNumber',   created.appended[0][COL_REVISION_NUMBER], 'revisionNumber');
eq('AK is revisionOf',       created.appended[0][COL_REVISION_OF], 'revisionOf');
eq('AL is supersededAt',     created.appended[0][COL_SUPERSEDED_AT], 'supersededAt');

console.log('\n── create path: a fresh entry is revision 1, unpublished ──');
sheet = makeSheet(40);
sandbox.logDailyNutrition('AB-1200', ENTRY, 'doc@kcmh');
const row1 = sheet.appended[0] || [];
eq('row is 38 columns wide',            row1.length, ROW_WIDTH);
eq('published starts blank',            row1[COL_PUBLISHED], '');
eq('publishedBy starts blank',          row1[COL_PUBLISHED_BY], '');
eq('revisionNumber defaults to 1',      row1[COL_REVISION_NUMBER], 1);
eq('revisionOf starts blank',           row1[COL_REVISION_OF], '');
eq('supersededAt starts blank',         row1[COL_SUPERSEDED_AT], '');

console.log('\n── publishDailyLog: submit locks the row ──');
{
  const existing = new Array(ROW_WIDTH).fill('');
  existing[1] = 'AB-1200'; existing[25] = 'entry-1'; existing[26] = 'stamp-1'; existing[35] = 1;
  sheet = makeSheet(40, [existing]);
  // expectedLastModified is required since the 2026-09-11 review (B2) —
  // Submit is optimistic-locked like an edit. verify-review-0911.cjs pins it.
  const res = sandbox.publishDailyLog('AB-1200', 'entry-1', 'doc@kcmh', 'stamp-1');
  ok('publish succeeds', res.ok);
  ok('publishedAt is returned', !!res.publishedAt);
  const publishedRow = sheet.getDataRange().getValues()[1];
  ok('published column is now set',        !!publishedRow[COL_PUBLISHED]);
  eq('publishedBy recorded',                publishedRow[COL_PUBLISHED_BY], 'doc@kcmh');

  const missing = sandbox.publishDailyLog('AB-1200', 'no-such-entry', 'doc@kcmh', 'stamp-1');
  ok('publishing a missing entryId errors', missing.error);

  const wrongPatient = sandbox.publishDailyLog('WRONG-ID', 'entry-1', 'doc@kcmh', 'stamp-1');
  ok('publishing under the wrong sessionId errors', wrongPatient.error);
}

console.log('\n── updateDailyNutrition on a DRAFT row: overwrites in place (unchanged behaviour) ──');
{
  const draft = new Array(ROW_WIDTH).fill('');
  draft[1] = 'AB-1200'; draft[15] = 'orig@kcmh';
  draft[25] = 'entry-1'; draft[26] = 'stamp-1'; draft[27] = 'orig@kcmh';
  draft[33] = ''; draft[35] = 1; // unpublished, revision 1
  sheet = makeSheet(40, [draft]);
  const res = sandbox.updateDailyNutrition('AB-1200', 'entry-1', 'stamp-1', ENTRY, 'editor@kcmh');
  ok('update succeeds', res.ok);
  ok('draft update is NOT reported as a revision', !res.revised);
  eq('no new row was appended', sheet.appended.length, 0);
  const after = sheet.getDataRange().getValues()[1];
  eq('entryId unchanged',        after[25], 'entry-1');
  eq('still unpublished',        after[COL_PUBLISHED], '');
  eq('revisionNumber unchanged', after[COL_REVISION_NUMBER], 1);
  eq('lastModifiedBy is the editor', after[27], 'editor@kcmh');
}

console.log('\n── updateDailyNutrition on a PUBLISHED row: creates a new revision, does not overwrite ──');
{
  const published = new Array(ROW_WIDTH).fill('');
  published[1] = 'AB-1200'; published[15] = 'orig@kcmh';
  published[25] = 'entry-1'; published[26] = 'stamp-1'; published[27] = 'orig@kcmh';
  published[COL_PUBLISHED] = '2026-09-09T10:00:00.000Z';
  published[COL_PUBLISHED_BY] = 'doc@kcmh';
  published[COL_REVISION_NUMBER] = 1;
  sheet = makeSheet(40, [published]);
  const res = sandbox.updateDailyNutrition('AB-1200', 'entry-1', 'stamp-1', ENTRY, 'editor@kcmh');
  ok('update succeeds', res.ok);
  ok('reported as a revision', res.revised);
  eq('a new entryId is returned', res.entryId, 'uuid-new');
  eq('the new revision number is returned', res.revisionNumber, 2);
  eq('exactly one new row was appended', sheet.appended.length, 1);

  const data = sheet.getDataRange().getValues();
  const oldRow = data[1];
  const newRow = data[2];
  eq('the OLD row keeps its original entryId', oldRow[25], 'entry-1');
  ok('the OLD row is untouched otherwise (still published)', !!oldRow[COL_PUBLISHED]);
  ok('the OLD row is now marked superseded', !!oldRow[COL_SUPERSEDED_AT]);

  eq('the NEW row has the new entryId',   newRow[25], 'uuid-new');
  eq('the NEW row starts unpublished',    newRow[COL_PUBLISHED], '');
  eq('the NEW row starts with no publisher', newRow[COL_PUBLISHED_BY], '');
  eq('the NEW row points back at the original', newRow[COL_REVISION_OF], 'entry-1');
  eq('the NEW row is revision 2',         newRow[COL_REVISION_NUMBER], 2);
  eq('the NEW row is not itself superseded', newRow[COL_SUPERSEDED_AT], '');
  eq('the NEW row carries the edited values', newRow[3], ENTRY.weight);
}

console.log('\n── concurrency: both paths still take the same lock ──');
{
  lockTaken = 0; lockReleased = 0;
  const draft = new Array(ROW_WIDTH).fill('');
  draft[1] = 'AB-1200'; draft[25] = 'entry-1'; draft[26] = 'stamp-1';
  sheet = makeSheet(40, [draft]);
  sandbox.updateDailyNutrition('AB-1200', 'entry-1', 'stamp-1', ENTRY, 'editor@kcmh');
  eq('draft update takes the lock once', lockTaken, 1);
  eq('and releases it', lockReleased, 1);

  lockTaken = 0; lockReleased = 0;
  const published = new Array(ROW_WIDTH).fill('');
  published[1] = 'AB-1200'; published[25] = 'entry-1'; published[26] = 'stamp-1';
  published[COL_PUBLISHED] = '2026-09-09T10:00:00.000Z';
  sheet = makeSheet(40, [published]);
  sandbox.updateDailyNutrition('AB-1200', 'entry-1', 'stamp-1', ENTRY, 'editor@kcmh');
  eq('revision-creating update also takes the lock once', lockTaken, 1);
  eq('and releases it', lockReleased, 1);
}

console.log('\n── a Daily_Log tab that predates AH–AL is widened, not broken ──');
{
  sheet = makeSheet(33); // only as wide as the AF/AG-era schema
  let threw = null;
  try { sandbox.logDailyNutrition('AB-1200', ENTRY, 'doc@kcmh'); } catch (e) { threw = e.message; }
  eq('create on a 33-column tab does not throw', threw, null);
  eq('grid widened to 38',                       sheet.maxColumns, ROW_WIDTH);

  const oldDraft = new Array(33).fill('');
  oldDraft[1] = 'AB-1200'; oldDraft[25] = 'entry-1'; oldDraft[26] = 'stamp-1';
  sheet = makeSheet(33, [oldDraft]);
  threw = null;
  try { sandbox.updateDailyNutrition('AB-1200', 'entry-1', 'stamp-1', ENTRY, 'editor@kcmh'); } catch (e) { threw = e.message; }
  eq('draft update on a 33-column tab does not throw', threw, null);
  eq('grid widened to 38 on update',                   sheet.maxColumns, ROW_WIDTH);

  const oldPublished = new Array(33).fill('');
  oldPublished[1] = 'AB-1200'; oldPublished[25] = 'entry-1'; oldPublished[26] = 'stamp-1';
  // A row from before AH existed has no way to BE published yet, but a
  // migrated-in-place value must still not crash the revision path.
  sheet = makeSheet(33, [oldPublished]);
  threw = null;
  try { sandbox.publishDailyLog('AB-1200', 'entry-1', 'doc@kcmh', 'stamp-1'); } catch (e) { threw = e.message; }
  eq('publish on a 33-column tab does not throw', threw, null);
  eq('grid widened to 38 on publish',             sheet.maxColumns, ROW_WIDTH);
}

console.log('\n── getActivePatients exposes the new fields to the client ──');
{
  // Since the 2026-09-11 review (B6) getActivePatients only returns log rows
  // for patients it returns, so the registry needs the (active) patient.
  const patRow = new Array(18).fill(''); patRow[0] = 'AB-1200'; patRow[3] = 1200; patRow[4] = 30; patRow[9] = 'Active';
  const patSheet = { getLastRow: () => 2, getDataRange: () => ({ getValues: () => [new Array(18).fill('header'), patRow] }) };
  const row = new Array(ROW_WIDTH).fill('');
  row[0] = '2026-09-09'; row[1] = 'AB-1200'; row[25] = 'entry-2';
  row[COL_PUBLISHED] = '2026-09-09T10:00:00.000Z';
  row[COL_PUBLISHED_BY] = 'doc@kcmh';
  row[COL_REVISION_NUMBER] = 2;
  row[COL_REVISION_OF] = 'entry-1';
  row[COL_SUPERSEDED_AT] = '';
  const logSheet = { getLastRow: () => 2, getDataRange: () => ({ getValues: () => [new Array(ROW_WIDTH).fill('header'), row] }) };
  const savedOpen = sandbox.SpreadsheetApp.openById;
  sandbox.SpreadsheetApp.openById = () => ({ getSheetByName: (n) => n === 'Daily_Log' ? logSheet : patSheet });
  const result = sandbox.getActivePatients();
  sandbox.SpreadsheetApp.openById = savedOpen;

  const entry = (result.log['AB-1200'] || [])[0];
  ok('entry exists', !!entry);
  eq('published exposed',       entry.published, '2026-09-09T10:00:00.000Z');
  eq('publishedBy exposed',     entry.publishedBy, 'doc@kcmh');
  eq('revisionNumber exposed',  entry.revisionNumber, 2);
  eq('revisionOf exposed',      entry.revisionOf, 'entry-1');
  eq('supersededAt exposed',    entry.supersededAt, '');
}

console.log('\n── doPost: publishLog action ──');
{
  function callDoPost(body, tokenUser) {
    sandbox.verifyToken = () => tokenUser;
    return sandbox.doPost({ postData: { contents: JSON.stringify(body) } });
  }
  const published = new Array(ROW_WIDTH).fill('');
  published[1] = 'AB-1200'; published[25] = 'entry-1'; published[26] = 'stamp-1'; published[35] = 1;
  sheet = makeSheet(40, [published]);

  const forbidden = callDoPost({ action: 'publishLog', token: 't', sessionId: 'AB-1200', entryId: 'entry-1' },
    { email: 'guest@kcmh', role: 'guest', name: 'Guest' });
  const forbiddenBody = JSON.parse(forbidden.setMimeType());
  ok('a role with no write access is refused', forbiddenBody.error === 'Forbidden');

  const asDoctor = callDoPost({ action: 'publishLog', token: 't', sessionId: 'AB-1200', entryId: 'entry-1', expectedLastModified: 'stamp-1' },
    { email: 'doc@kcmh', role: 'doctor', name: 'Doc' });
  const asDoctorBody = JSON.parse(asDoctor.setMimeType());
  ok('a doctor can publish', asDoctorBody.ok);
  ok('publishedAt comes back', !!asDoctorBody.publishedAt);
}

console.log('\n── ensureLogHeaderColumns knows about the new columns ──');
{
  const gas = R('gas-backend.gs');
  ok('WANT map labels column 34 published',       /34:\s*["']published["']/.test(gas));
  ok('WANT map labels column 35 publishedBy',      /35:\s*["']publishedBy["']/.test(gas));
  ok('WANT map labels column 36 revisionNumber',   /36:\s*["']revisionNumber["']/.test(gas));
  ok('WANT map labels column 37 revisionOf',       /37:\s*["']revisionOf["']/.test(gas));
  ok('WANT map labels column 38 supersededAt',     /38:\s*["']supersededAt["']/.test(gas));
  ok('widens to 38, not 33',                       /\b38 - sh\.getMaxColumns\(\)/.test(gas));
}

// ══ frontend wiring — regex checks on source, same pattern as
// verify-provenance-stamp.cjs §3 (no jsdom mount needed for wiring checks) ══
console.log('\n── data.js: the rollout flag exists and defaults off ──');
{
  const dsb = { window: {}, console };
  vm.createContext(dsb);
  vm.runInContext(R('data.js'), dsb);
  const D = dsb.window.NEOFEED_DATA;
  eq('ENABLE_PUBLISH_GATE is a boolean',  typeof D.ENABLE_PUBLISH_GATE, 'boolean');
  eq('ENABLE_PUBLISH_GATE defaults off',  D.ENABLE_PUBLISH_GATE, false);
}

console.log('\n── calculator.jsx wires Submit and the draft watermark ──');
{
  const calc = R('calculator.jsx');
  ok('Calculator accepts an onPublish prop', /function Calculator\(\{[^}]*onPublish/.test(calc));
  ok('a Submit action exists',               /handlePublish/.test(calc));
  ok('handleUpdateToGAS revision result resets published to false',
     /res\.revised/.test(calc));
  const printForm = calc.slice(calc.indexOf('function PrintOrderForm'));
  ok('PrintOrderForm accepts a published prop', /function PrintOrderForm\(\{[^}]*published/.test(printForm));
  ok('unpublished prints show the lab-pending watermark', /รอผลแลป/.test(printForm));
}

console.log('\n── app.jsx wires the publishLog action through ──');
{
  const appjs = R('app.jsx');
  ok('handlePublishToGAS exists',            /handlePublishToGAS/.test(appjs));
  ok('it posts the publishLog action',       /action:\s*["']publishLog["']/.test(appjs));
  ok('a revised update is handled locally', /res\.revised/.test(appjs));
}

console.log('\n── log.jsx / data.js: superseded revisions never reach the trend graph or entry list ──');
{
  const dataSrc = R('data.js');
  ok('normalizeLogEntries filters out superseded rows', /normalizeLogEntries[\s\S]{0,600}supersededAt/.test(dataSrc));
}

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
