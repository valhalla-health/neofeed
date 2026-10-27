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
// Since 2026-10-27 the days follow Jochum 2018's own tables (TPN team, 2026-10-25):
// Table 1 0–3 to DOL 3 and 2–3 on DOL 4–5, Table 2 1–3 on DOL 6–7, Table 3 from
// DOL 8 (2–5 below 1500 g, 2–3 above). Until then DOL 1–7 were all 0–3.
console.log('\n── #3 potassium phase boundary (ESPGHAN/Jochum 2018) ──');
eq('TPN K, DOL 1  → Table 1 D1–3',  D.TPN_TARGETS.k(1), [0, 3]);
eq('TPN K, DOL 3  → Table 1 D1–3',  D.TPN_TARGETS.k(3), [0, 3]);
eq('TPN K, DOL 4  → Table 1 D4–5',  D.TPN_TARGETS.k(4), [2, 3]);
eq('TPN K, DOL 7  → Table 2',       D.TPN_TARGETS.k(7), [1, 3]);
eq('TPN K, DOL 8  → stable',        D.TPN_TARGETS.k(8), [2, 3]);
eq('TPN K, DOL 30 → stable',        D.TPN_TARGETS.k(30), [2, 3]);
eq('TPN K, DOL 8, 1200 g → stable < 1500 g', D.TPN_TARGETS.k(8, 1200), [2, 5]);
eq('TPN K, DOL 8, 1400 g now, born 1600 g → the birth-weight tier', D.TPN_TARGETS.k(8, 1400, 1600), [2, 3]);
// TPN_TARGETS.k and TARGETS.k must not diverge again — that divergence was the tell.
for (const dol of [1, 2, 3, 4, 5, 6, 7, 8, 14, 30]) for (const w of [undefined, 900, 2000]) {
  eq(`TPN K == TARGETS K at DOL ${dol}${w ? `, ${w} g` : ''}`, D.TPN_TARGETS.k(dol, w), D.TARGETS.k(dol, w));
  eq(`TPN Na == TARGETS Na at DOL ${dol}${w ? `, ${w} g` : ''}`, D.TPN_TARGETS.na(dol, w), D.TARGETS.na(dol, w));
}
// Na by Jochum 2018: DOL 3 0–5 below 1500 g, 0–3 above; DOL 4–7 2–5.
eq('TPN Na, DOL 3, 1200 g → 0–5', D.TPN_TARGETS.na(3, 1200), [0, 5]);
eq('TPN Na, DOL 3, 1800 g → 0–3', D.TPN_TARGETS.na(3, 1800), [0, 3]);
eq('TPN Na, DOL 5 → 2–5', D.TPN_TARGETS.na(5, 1800), [2, 5]);
eq('TPN Na, DOL 10 stays 2–5 (Table 3 preterm 3–5 waits for the term rows)', D.TPN_TARGETS.na(10, 1200), [2, 5]);
// An intermediate-phase prescription of 1.0 reads "ok" on DOL 6, "off target" from DOL 8.
eq('K 1.0 mEq/kg/d on DOL 6 is on target', D.rangeStatus(1.0, D.TPN_TARGETS.k(6)), 'ok');
eq('K 1.0 mEq/kg/d on DOL 5 is off target (Table 1 D4–5 is 2–3)', D.rangeStatus(1.0, D.TPN_TARGETS.k(5)), 'warn');
eq('K 1.0 mEq/kg/d on DOL 10 is off target', D.rangeStatus(1.0, D.TPN_TARGETS.k(10)), 'warn');

// Growing-premature PN phosphorus is 1.6–3.5 mmol/kg/day. At 31 mg/mmol,
// that is approximately 50–108 mg/kg/day; the previous [46,62] range was an
// older/narrower band and could tell a clinician to reduce a recommended dose.
console.log('\n── #3b growing-premature PN phosphorus target (Mihatsch 2018) ──');
// "First days" end at DOL 7 since 2026-10-27 (TPN team); until then DOL 1.
eq('TPN P, DOL 1 stays in the early-PN band', D.TPN_TARGETS.p(1), [31, 62]);
eq('TPN P, DOL 7 is still the first days', D.TPN_TARGETS.p(7), [31, 62]);
eq('TPN P, growing premature is 1.6–3.5 mmol/kg/d', D.TPN_TARGETS.p(8), [50, 108]);
eq('TPN_TARGETS.p and TARGETS.p agree for PN', D.TPN_TARGETS.p(10), D.TARGETS.p(10, false));
eq('80 mg/kg/d P is on target for growing PN', D.rangeStatus(80, D.TPN_TARGETS.p(10)), 'ok');

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
