// verify-usage-metrics.cjs — pins M1, weekly active users, and the two
// constraints that make it safe to compute at all.
//
// NeoFeed has never had a product metric. The data has been there the whole
// time — `Audit_Log (A–D): ts | action | sessionId | actorEmail`, written by
// `logAudit("readRegistry", ...)` on every `getActivePatients` — so this is a
// *read*, not instrumentation. See `PRD.md` § 6.
//
// Two constraints are not preferences, and this harness treats them as
// correctness:
//
//   1. DISTINCT actorEmail PER WEEK, NEVER ROW COUNTS. Since `syncFromGAS`
//      began firing on tab focus, Audit_Log gains a row per user per minute.
//      A row count now measures how long a tab was left open, not usage.
//      One nurse with a tab open all week is ONE weekly active user.
//   2. NO EMAIL MAY LEAVE THE FUNCTION. Audit_Log exists for PDPA Sec 39
//      accountability and holds staff email. Aggregate counts only — a
//      per-staff figure turns product analytics into personnel monitoring,
//      which is a different lawful basis and a different conversation with
//      the ward. Test 9 serialises the whole result and fails on an "@".
//
// Two traps that a naive implementation gets wrong, both pinned below:
//
//   - `ts` is written as an ISO string, but Sheets coerces a date-looking
//     column, so `getDataRange().getValues()` hands back a **Date object**
//     for some rows and a string for others. Both must bucket identically.
//   - Bucketing in UTC puts a Monday 06:00 ward event (= Sunday 23:00 UTC)
//     in the PREVIOUS week. The ward is UTC+7 and rounds in the morning, so
//     weeks are cut in Bangkok local time, not UTC. Test 7 is the one that
//     fails if someone "simplifies" this back to UTC.
//
// `gas-backend.gs` is Apps Script, not Node — every top-level statement is a
// `var` or a function declaration, so the whole file evaluates against
// stubbed globals and `usageMetrics` can be called directly. No dependencies;
// run it with plain `node test/verify-usage-metrics.cjs`.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(52)} got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
function ok(name, cond) { eq(name, !!cond, true); }

// ── Load gas-backend.gs against stubbed Apps Script globals ───────────────
const sandbox = {
  SpreadsheetApp: { openById: () => ({ getSheetByName: () => null, insertSheet: () => null }) },
  Utilities: { getUuid: () => 'uuid', computeHmacSha256Signature: () => [], base64Encode: () => '' },
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
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'gas-backend.gs'), 'utf8'), sandbox);

const { usageMetrics } = sandbox;
if (typeof usageMetrics !== 'function') {
  console.error('\n  FAIL  usageMetrics() is not defined in gas-backend.gs\n');
  process.exit(1);
}

const HEADER = ['ts', 'action', 'sessionId', 'actorEmail'];
const row = (ts, email, action) => [ts, action || 'readRegistry', '', email];
// Week of the metric: 2026-08-17 Mon .. 2026-08-23 Sun is ISO 2026-W34.
const weekOf = (r) => r.week;

console.log('\n1 · Distinct users per week — the re-sync noise must not inflate it');
{
  // One nurse, a tab left open: 500 rows in a single week. That is 1 user.
  const rows = [HEADER];
  for (let i = 0; i < 500; i++) rows.push(row(`2026-08-19T0${i % 10}:${String(i % 60).padStart(2, '0')}:00.000Z`, 'nurse@kcmh.test'));
  const m = usageMetrics(rows);
  eq('one tab open all week is ONE active user', m.weeks.map(weekOf), ['2026-W34']);
  eq('activeUsers is 1, not 500', m.weeks[0].activeUsers, 1);
  eq('events still reported alongside, unrounded', m.weeks[0].events, 500);
}

console.log('\n2 · Email normalisation — one human is one user');
{
  const m = usageMetrics([HEADER,
    row('2026-08-19T03:00:00.000Z', 'Nurse@KCMH.test'),
    row('2026-08-19T04:00:00.000Z', '  nurse@kcmh.test  '),
    row('2026-08-19T05:00:00.000Z', 'NURSE@kcmh.TEST'),
  ]);
  eq('case and whitespace variants collapse to one', m.weeks[0].activeUsers, 1);
}

console.log('\n3 · Rows with no actor are skipped, not counted as a user');
{
  const m = usageMetrics([HEADER,
    row('2026-08-19T03:00:00.000Z', 'a@kcmh.test'),
    row('2026-08-19T03:01:00.000Z', ''),
    row('2026-08-19T03:02:00.000Z', null),
    row('2026-08-19T03:03:00.000Z', '   '),
  ]);
  eq('only the real actor counts', m.weeks[0].activeUsers, 1);
  eq('blank-actor rows reported as skipped', m.rowsSkipped, 3);
}

console.log('\n4 · The header row is not a data row');
{
  const m = usageMetrics([HEADER, row('2026-08-19T03:00:00.000Z', 'a@kcmh.test')]);
  eq('header contributes no week', m.weeks.length, 1);
  eq('header is not an actor named "actorEmail"', m.totalDistinctUsers, 1);
}

console.log('\n5 · A Date object and an ISO string bucket identically');
{
  // Sheets coerces a date-looking column, so getValues() returns Date objects
  // for some rows and strings for others — in the same column, same sheet.
  const asString = usageMetrics([HEADER, row('2026-08-19T03:00:00.000Z', 'a@kcmh.test')]);
  const asDate = usageMetrics([HEADER, row(new Date('2026-08-19T03:00:00.000Z'), 'a@kcmh.test')]);
  eq('Date object yields the same week key', asDate.weeks.map(weekOf), asString.weeks.map(weekOf));
  eq('Date object is not skipped as unparseable', asDate.rowsSkipped, 0);
}

console.log('\n6 · ISO week boundaries — Monday starts the week');
{
  const m = usageMetrics([HEADER,
    row('2026-08-16T05:00:00.000Z', 'a@kcmh.test'), // Sun → W33
    row('2026-08-17T05:00:00.000Z', 'a@kcmh.test'), // Mon → W34
    row('2026-08-23T05:00:00.000Z', 'a@kcmh.test'), // Sun → W34
    row('2026-08-24T05:00:00.000Z', 'a@kcmh.test'), // Mon → W35
  ]);
  eq('Sunday closes the week, Monday opens the next', m.weeks.map(weekOf), ['2026-W33', '2026-W34', '2026-W35']);
  eq('weeks are sorted oldest first', m.weeks.map(weekOf), [...m.weeks.map(weekOf)].sort());
}

console.log('\n7 · Weeks are cut in WARD-LOCAL time (UTC+7), not UTC');
{
  // Mon 24 Aug 06:00 in Bangkok is Sun 23 Aug 23:00 UTC. The ward rounds in
  // the morning; bucketing in UTC would file a Monday round under Sunday and
  // silently move a chunk of every week into the one before it.
  const m = usageMetrics([HEADER, row('2026-08-23T23:00:00.000Z', 'a@kcmh.test')]);
  eq('Monday 06:00 ward time lands in Monday\'s week', m.weeks.map(weekOf), ['2026-W35']);

  // The mirror case: Sun 23 Aug 23:00 ward time is Sun 16:00 UTC — still W34.
  const m2 = usageMetrics([HEADER, row('2026-08-23T16:00:00.000Z', 'a@kcmh.test')]);
  eq('Sunday late-shift ward time stays in Sunday\'s week', m2.weeks.map(weekOf), ['2026-W34']);
}

console.log('\n8 · Year boundaries use the ISO week-year, not the calendar year');
{
  const m = usageMetrics([HEADER,
    row('2025-12-29T05:00:00.000Z', 'a@kcmh.test'), // Mon → 2026-W01
    row('2026-01-01T05:00:00.000Z', 'a@kcmh.test'), // Thu → 2026-W01
  ]);
  eq('late December can belong to the next ISO year', m.weeks.map(weekOf), ['2026-W01']);
  eq('and it is one week, not two', m.weeks.length, 1);
}

console.log('\n9 · 🔴 No staff email may leave the function — PDPA Sec 39');
{
  const m = usageMetrics([HEADER,
    row('2026-08-19T03:00:00.000Z', 'nurse@kcmh.test'),
    row('2026-08-19T04:00:00.000Z', 'doctor@kcmh.test'),
  ]);
  const serialised = JSON.stringify(m);
  ok('result contains no "@" anywhere', serialised.indexOf('@') === -1);
  ok('result contains no "kcmh"', serialised.toLowerCase().indexOf('kcmh') === -1);
  eq('the count itself is still right', m.weeks[0].activeUsers, 2);
  // A per-actor breakdown is the thing that must not exist, even keyed by hash.
  ok('no per-actor structure of any kind', !('byActor' in m) && !('actors' in m) && !('emails' in m));
}

console.log('\n10 · Garbage in does not throw');
{
  let threw = null;
  let m;
  try {
    m = usageMetrics([HEADER,
      row('not-a-date', 'a@kcmh.test'),
      row('', 'b@kcmh.test'),
      row(undefined, 'c@kcmh.test'),
      [],
      row('2026-08-19T03:00:00.000Z', 'd@kcmh.test'),
    ]);
  } catch (e) { threw = e.message; }
  eq('no throw on unparseable rows', threw, null);
  eq('the one good row still counts', m.weeks[0].activeUsers, 1);
  ok('bad rows are reported, not silently dropped', m.rowsSkipped >= 4);
}

console.log('\n11 · Empty and missing input');
{
  eq('empty sheet yields no weeks', usageMetrics([]).weeks, []);
  eq('header-only sheet yields no weeks', usageMetrics([HEADER]).weeks, []);
  eq('undefined yields no weeks', usageMetrics(undefined).weeks, []);
  eq('totalDistinctUsers is 0, not NaN', usageMetrics([HEADER]).totalDistinctUsers, 0);
}

console.log('\n12 · totalDistinctUsers is across the whole range, not a sum of weeks');
{
  const m = usageMetrics([HEADER,
    row('2026-08-19T03:00:00.000Z', 'a@kcmh.test'), // W34
    row('2026-08-26T03:00:00.000Z', 'a@kcmh.test'), // W35, same person
    row('2026-08-26T04:00:00.000Z', 'b@kcmh.test'), // W35, new person
  ]);
  eq('per-week counts', m.weeks.map(w => w.activeUsers), [1, 2]);
  eq('the same person across two weeks is one human', m.totalDistinctUsers, 2);
  ok('total is not the sum of the weekly counts', m.totalDistinctUsers !== 3);
}

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
