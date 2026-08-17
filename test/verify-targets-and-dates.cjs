// Regression harness for the 2026-08-08 code review fixes (CODE_REVIEW_2026-08-08.md).
//
// Why this file exists: the two KCMH harnesses verify compounding arithmetic
// against the pharmacy worksheet, and none of them would have caught any of the
// defects that review found — they were target-selection and calendar-date bugs,
// which live entirely outside the worksheet's surface. Each block below pins one
// fixed behaviour so it cannot silently regress.
//
// Pure data.js + logic; no React, no jsdom, no npm dependencies.
//   node test/verify-targets-and-dates.cjs

const fs = require('fs');
const vm = require('vm');

const DATA = require('path').join(__dirname, '..', 'data.js');
const sandbox = { window: {}, console, Intl, Date, Math, Number, isFinite, isNaN, parseInt, parseFloat, String };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(DATA, 'utf8'), sandbox);
const D = sandbox.window.NEOFEED_DATA;

let fails = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// Issue #1 — calendar dates are Bangkok-local, never UTC
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── #1 local calendar dates (not UTC) ──');

// The exact failure: 02:00 ICT on 9 Aug is 19:00Z on 8 Aug. toISOString() gives
// the 8th; todayLocal() must give the 9th. Freeze the clock to prove it.
const RealDate = Date;
const freezeAt = (iso) => {
  const fixed = new RealDate(iso);
  sandbox.Date = class extends RealDate {
    constructor(...a) { return a.length ? new RealDate(...a) : new RealDate(fixed); }
    static now() { return fixed.getTime(); }
  };
};
const unfreeze = () => { sandbox.Date = RealDate; };

freezeAt('2026-08-08T19:00:00Z');   // = 2026-08-09 02:00 ICT — night shift
eq('night shift: todayLocal is the local day', D.todayLocal(), '2026-08-09');
eq('night shift: UTC slice would have been', new RealDate('2026-08-08T19:00:00Z').toISOString().slice(0, 10), '2026-08-08');

freezeAt('2026-08-09T04:00:00Z');   // = 2026-08-09 11:00 ICT — day shift, no offset crossing
eq('day shift: todayLocal is the local day', D.todayLocal(), '2026-08-09');

// DOL must not slip a day across the 07:00 ICT boundary.
const pt = { admissionDate: '2026-08-01', weights: [{ dol: 1, w: 900 }] };
freezeAt('2026-08-08T19:00:00Z');   // 9 Aug 02:00 ICT → 8 days after admission → DOL 9
const dolNight = D.liveDol(pt);
freezeAt('2026-08-09T04:00:00Z');   // 9 Aug 11:00 ICT → same calendar day → same DOL
const dolDay = D.liveDol(pt);
eq('liveDol identical either side of 07:00 ICT', dolNight, dolDay);
eq('liveDol value on 2026-08-09 (admitted 08-01)', dolDay, 9);
unfreeze();

// DOB arithmetic: local-midnight + toISOString() used to lose a day for EVERY
// patient at EVERY hour, including admitDol = 1 where nothing is subtracted.
eq('DOB, admitDol 1 → admit date unchanged', D.addDaysToDateStr('2026-08-09', 0), '2026-08-09');
eq('DOB, admitDol 4 → 3 days earlier', D.addDaysToDateStr('2026-08-09', -3), '2026-08-06');
eq('DOB across a month boundary', D.addDaysToDateStr('2026-08-02', -3), '2026-07-30');
eq('DOB across a year boundary', D.addDaysToDateStr('2026-01-01', -1), '2025-12-31');
eq('DOB across a leap day', D.addDaysToDateStr('2028-03-01', -1), '2028-02-29');

// dolAtDate is UTC-anchored at both ends, so the difference is exact.
eq('dolAtDate on the admission date', D.dolAtDate(pt, '2026-08-01'), 1);
eq('dolAtDate 8 days later', D.dolAtDate(pt, '2026-08-09'), 9);
eq('dolAtDate before admission clamps to admit DOL', D.dolAtDate(pt, '2026-07-28'), 1);

// ─────────────────────────────────────────────────────────────────────────────
// Issue #3 — potassium: intermediate phase runs through D7, not D3
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── #3 potassium phase boundary (ESPGHAN/Jochum 2018) ──');
eq('TPN K, DOL 1  → transition',   D.TPN_TARGETS.k(1), [0, 3]);
eq('TPN K, DOL 4  → intermediate', D.TPN_TARGETS.k(4), [0, 3]);   // regressed to [2,3] before the fix
eq('TPN K, DOL 7  → intermediate', D.TPN_TARGETS.k(7), [0, 3]);   // regressed to [2,3] before the fix
eq('TPN K, DOL 8  → stable',       D.TPN_TARGETS.k(8), [2, 3]);
eq('TPN K, DOL 30 → stable',       D.TPN_TARGETS.k(30), [2, 3]);
// TPN_TARGETS.k and TARGETS.k must not diverge again — that divergence was the tell.
for (const dol of [1, 2, 3, 4, 5, 6, 7, 8, 14, 30]) {
  eq(`TPN K == TARGETS K at DOL ${dol}`, D.TPN_TARGETS.k(dol), D.TARGETS.k(dol));
}
// A normal intermediate-phase prescription must read "ok", not "off target".
eq('K 1.0 mEq/kg/d on DOL 5 is on target', D.rangeStatus(1.0, D.TPN_TARGETS.k(5)), 'ok');
eq('K 1.0 mEq/kg/d on DOL 10 is off target', D.rangeStatus(1.0, D.TPN_TARGETS.k(10)), 'warn');

// ─────────────────────────────────────────────────────────────────────────────
// Issue #2 — route-aware targets: a PN infant is never held to enteral numbers
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── #2 parenteral vs enteral target selection ──');
// Mirrors computeAlerts()/pickTarget(): >=100 mL/kg/d enteral means full feeds.
const pickT = (entry) => ((entry.enVolPerKg || 0) >= 100 ? D.ENTERAL_TARGETS : D.TPN_TARGETS);

const pnDay10 = { dol: 10, enVolPerKg: 0, pro: 3.0, kcal: 100 };
const enDay10 = { dol: 10, enVolPerKg: 140, pro: 3.6, kcal: 125 };
const legacy  = { dol: 10, pro: 3.0, kcal: 100 };   // pre-enVolPerKg row

eq('PN DOL 10 protein target is parenteral', pickT(pnDay10).protein(pnDay10.dol), [2.5, 3.5]);
eq('PN DOL 10 energy target is parenteral',  pickT(pnDay10).kcal(pnDay10.dol),   [90, 120]);
eq('EN DOL 10 protein target is enteral',    pickT(enDay10).protein(),           [3.5, 4.0]);
eq('EN DOL 10 energy target is enteral',     pickT(enDay10).kcal(),              [115, 140]);
eq('legacy row (no enVolPerKg) defaults to parenteral', pickT(legacy).protein(legacy.dol), [2.5, 3.5]);

// The concrete regression: 3.0 g/kg/d parenteral AA on DOL 10 is a correct
// prescription at the ESPGHAN ceiling, and must NOT raise "protein below target".
const tProPN = pickT(pnDay10).protein(pnDay10.dol);
eq('PN AA 3.0 g/kg/d on DOL 10 raises no alert', pnDay10.pro < tProPN[0], false);
eq('parenteral AA ceiling stays 3.5 g/kg/d', tProPN[1], 3.5);
// D.TARGETS.protein is the blended table that caused it — pin what it actually is,
// so anyone reaching for it in a route-blind context sees why that is wrong.
eq('TARGETS.protein(10) is the ENTERAL band (do not use route-blind)', D.TARGETS.protein(10), [3.5, 4.0]);

// ─────────────────────────────────────────────────────────────────────────────
// Issue #8 — GA decoding agrees between the two helpers
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── #8 GA WW.D decoding is single-valued ──');
eq('gaTotalDays(28.1) = 28w1d', D.gaTotalDays(28.1), 197);
eq('gaTotalDays(26.4) = 26w4d', D.gaTotalDays(26.4), 186);
eq('parseGAInput("28+4") == parseGAInput("28.4")', D.parseGAInput('28+4'), D.parseGAInput('28.4'));
// The old disagreement: parseGAInput clamped 27.9 to 27+6, gaTotalDays carried to 28+2.
eq('out-of-range day clamps, not carries', D.gaTotalDays(27.9), D.gaTotalDays(D.parseGAInput('27.9')));
eq('gaTotalDays(27.9) = 27w6d (clamped)', D.gaTotalDays(27.9), 195);
eq('fmtGA round-trips 28.1', D.fmtGA(28.1), '28+1');
// The HMF eligibility test (patient.ga < 32) depends on this encoding.
eq('GA 31+6 stays under the 32 threshold', D.parseGAInput('31+6') < 32, true);

// ─────────────────────────────────────────────────────────────────────────────
// Issue #10 — SALT_SOURCES is not reachable as a compounding divisor
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── #10 compounding divisors have one source ──');
eq('SALT_SOURCES no longer exported under that name', D.SALT_SOURCES, undefined);
eq('reference table still available, clearly named', typeof D.SALT_SOURCES_REFERENCE_ONLY, 'object');
eq('KCMH_STOCK remains the compounding authority', D.KCMH_STOCK.naCl.naMeqPerMl, 3.42);

// ─────────────────────────────────────────────────────────────────────────────
// Daily_Log `ts` normalization — "Logged today" must survive the sheet's own
// date formatting. Google Sheets parses the "YYYY-MM-DD" the backend appends
// into a real date value, so a row can come back as a Date (or its
// toString()), which `e.ts === todayLocal()` never matched — that is what
// pinned the registry at "0 logged today / everyone needs entry".
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Daily_Log ts normalization + logged-today ──');
eq('plain date string passes through',        D.normalizeDateStr('2026-08-17'), '2026-08-17');
eq('ISO timestamp is sliced, not re-zoned',   D.normalizeDateStr('2026-08-17T00:00:00.000Z'), '2026-08-17');
eq('Sheets Date object → local date string',  D.normalizeDateStr(new Date('2026-08-17T00:00:00+07:00')), '2026-08-17');
eq('stringified Sheets Date → date string',   D.normalizeDateStr(String(new Date('2026-08-17T00:00:00+07:00'))), '2026-08-17');
// A Date at 23:00 ICT must stay on its ICT day, not roll forward/back via UTC.
eq('late-evening Date keeps the local day',   D.normalizeDateStr(new Date('2026-08-17T23:00:00+07:00')), '2026-08-17');
eq('empty stays empty',                       D.normalizeDateStr(''), '');
eq('unparseable string is left alone',        D.normalizeDateStr('not a date'), 'not a date');

const today = '2026-08-17';
eq('raw Sheets Date would have missed today',
   [{ ts: new Date('2026-08-17T00:00:00+07:00') }].some(e => e.ts === today), false);
eq('hasLogOnDate sees it anyway',
   D.hasLogOnDate([{ ts: new Date('2026-08-17T00:00:00+07:00') }], today), true);
eq('no entry for the day → not logged',
   D.hasLogOnDate([{ ts: '2026-08-16' }], today), false);
eq('empty log → not logged', D.hasLogOnDate([], today), false);
eq('missing log → not logged', D.hasLogOnDate(undefined, today), false);
// The other half of the same bug: "logged today?" used to read only the last
// array element, so back-filling a missed day after logging today hid today's
// entry behind the back-dated one.
eq('back-dated entry saved last does not hide today',
   D.hasLogOnDate([{ ts: '2026-08-17' }, { ts: '2026-08-12' }], today), true);
// normalizeLogEntries restores date order so `entries[entries.length-1]` is
// genuinely the latest entry, which several views rely on.
const ordered = D.normalizeLogEntries([
  { ts: '2026-08-17', dol: 9 },
  { ts: new Date('2026-08-12T00:00:00+07:00'), dol: 4 },
  { ts: '2026-08-15', dol: 7 },
]);
eq('entries sorted oldest → newest', ordered.map(e => e.ts),
   ['2026-08-12', '2026-08-15', '2026-08-17']);
eq('last entry is the newest', ordered[ordered.length - 1].dol, 9);
eq('normalizeLogMap normalizes every patient',
   D.normalizeLogMap({ a: [{ ts: new Date('2026-08-17T00:00:00+07:00') }], b: [{ ts: '2026-08-16' }] }),
   { a: [{ ts: '2026-08-17' }], b: [{ ts: '2026-08-16' }] });

console.log(fails === 0 ? '\nTARGETS + DATES: ALL PASS\n' : `\nTARGETS + DATES: ${fails} FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
