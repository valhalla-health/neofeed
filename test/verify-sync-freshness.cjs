// D.syncFreshness() — the decision behind the staleness banner.
//
// Why this is a pure function in data.js and not an inline ternary in app.jsx:
// "is the number on screen still trustworthy?" is a clinical-safety rule, so
// it belongs in the Business Logic layer where it can be pinned by a test
// (TDD.md §1 puts data.js there; §5.2 lists the layer violations we are not
// adding to). app.jsx only renders what this returns.
//
// The rule this encodes: silence about staleness is the failure mode. A ward
// round reading a fluid balance that is twenty minutes old, with no signal
// that it is twenty minutes old, is the "stale data appearing as current"
// case — the one 3099701 Lec 4 names as the safety-critical failure of the
// whole device pipeline.
//
// No dependencies. Run with plain `node test/verify-sync-freshness.cjs`.
const fs = require('fs');
const vm = require('vm');

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'data.js'), 'utf8'), sandbox);
const D = sandbox.window.NEOFEED_DATA;

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = Object.is(got, want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(56)} got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

const MIN = 60 * 1000;
const NOW = 1_800_000_000_000;
// Shorthand: level for a sync that succeeded `mins` ago, online, GAS on.
const at = (mins, over = {}) => D.syncFreshness({
  gasOn: true, online: true, syncState: 'ok',
  lastSyncMs: NOW - mins * MIN, nowMs: NOW, ...over,
}).level;

console.log('\n── the function exists and is exported ──');
eq('syncFreshness is exported from data.js', typeof D.syncFreshness, 'function');
if (typeof D.syncFreshness !== 'function') {
  console.log('\nsyncFreshness missing — remaining assertions cannot run.');
  console.log(`\n${pass} passed, ${fail + 1} failed`);
  process.exit(1);
}

console.log('\n── fresh data reads as ok ──');
eq('just synced',                    at(0),   'ok');
eq('1 minute old',                   at(1),   'ok');
eq('4 minutes old — still inside the stated 5-minute requirement', at(4), 'ok');

console.log('\n── the 5-minute requirement is a boundary, not a vibe ──');
// 3099701 Lec 4: "real time should always have a measurable requirement."
// The number is 5 minutes for registry freshness; this is where it lives.
eq('exactly 5 minutes → warn',       at(5),   'warn');
eq('9 minutes → warn',               at(9),   'warn');
eq('exactly 15 minutes → stale',     at(15),  'stale');
eq('40 minutes → stale',             at(40),  'stale');

console.log('\n── offline outranks everything ──');
// If the browser has no network, "sync error" is explained by being offline,
// and the banner must say offline rather than blaming the server.
eq('offline + fresh data',           at(0,  { online: false }), 'offline');
eq('offline + stale data',           at(40, { online: false }), 'offline');
eq('offline + sync error',           at(0,  { online: false, syncState: 'error' }), 'offline');

console.log('\n── a failed sync is stale even if it failed one second ago ──');
// The last SUCCESSFUL sync is what matters. A fresh failure is not freshness.
eq('online, error, synced 0 min ago', at(0,  { syncState: 'error' }), 'stale');
eq('online, error, synced 2 min ago', at(2,  { syncState: 'error' }), 'stale');

console.log('\n── never synced at all ──');
eq('lastSyncMs null → stale',        D.syncFreshness({ gasOn: true, online: true, syncState: 'ok', lastSyncMs: null,      nowMs: NOW }).level, 'stale');
eq('lastSyncMs undefined → stale',   D.syncFreshness({ gasOn: true, online: true, syncState: 'ok', lastSyncMs: undefined, nowMs: NOW }).level, 'stale');

console.log('\n── GAS not configured is not a staleness problem ──');
// Local/mock development must not raise a clinical staleness banner.
eq('gasOn false → local',            at(999, { gasOn: false }), 'local');
eq('gasOn false while offline',      at(0,   { gasOn: false, online: false }), 'local');

console.log('\n── a refresh in flight does not reset the clock ──');
// syncState "loading" during the periodic re-sync must not make 40-minute-old
// data look fresh; only a completed sync updates lastSyncMs.
eq('loading over fresh data',        at(1,  { syncState: 'loading' }), 'ok');
eq('loading over stale data',        at(40, { syncState: 'loading' }), 'stale');

console.log('\n── ageMs is reported for the UI to render ──');
const r = D.syncFreshness({ gasOn: true, online: true, syncState: 'ok', lastSyncMs: NOW - 7 * MIN, nowMs: NOW });
eq('ageMs for a 7-minute-old sync',  r.ageMs, 7 * MIN);
eq('ageMs is null when never synced', D.syncFreshness({ gasOn: true, online: true, syncState: 'ok', lastSyncMs: null, nowMs: NOW }).ageMs, null);

console.log('\n── a clock that jumps backwards must not read as fresh ──');
// Device clock skew / DST: a negative age is nonsense, not freshness.
eq('lastSync in the future clamps to 0', D.syncFreshness({ gasOn: true, online: true, syncState: 'ok', lastSyncMs: NOW + 5 * MIN, nowMs: NOW }).ageMs, 0);
eq('future lastSync still reads ok',     D.syncFreshness({ gasOn: true, online: true, syncState: 'ok', lastSyncMs: NOW + 5 * MIN, nowMs: NOW }).level, 'ok');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
