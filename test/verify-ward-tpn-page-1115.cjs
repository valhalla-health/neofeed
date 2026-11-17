// verify-ward-tpn-page-1115.cjs — "TPN ทั้งหอ", the ward's TPN page.
//
// Pp asked for one page per ward that lists every infant on TPN (2026-11-14:
// "ไม่มีใครมาเปิดดูเองทีละคน"), and settled its rules on 2026-11-14 and
// 2026-11-15. This harness holds them:
//
//   1  who is listed  Active only; latest Submitted order has TPN, or the latest
//                     order WITH TPN is at most 14 days old (not the last submit:
//                     a No TPN infant submits every 3 days); a draft is not an
//                     order; one ward at a time
//   2  AA flag        AA < 2.5 g/kg/d, DOL 2–7, counted EN < 50, preterm (GA < 37)
//                     only, by today's DOL, also for an infant admitted later
//   3  lipid flag     no lipid on DOL 2, preterm only
//   4  GIR flag       girStatus: above 12 red, below 4 amber, 0 (no dextrose) none
//   5  PN after EN    PN still ordered at NICE's line: 140 below 28 wk, 120 from 28
//                     wk and term, every GA
//   6  No TPN         the latest order is No TPN: that chip, and since 2026-11-17
//                     the AA and lipid flags as for AA 0 (Pp: "ขึ้นธง")
//   7  PN day         from the first order of the current run, today
//   8  the page       rows flagged first, chips in words, no QI figure, a tap
//                     opens the infant, phone cards, the ward switch
//   9  the way in     the rail item, the view and the ward list's button
//  10  as printed     each figure graded as the page prints it: no float tail
//                     puts a value on the wrong side of a line (2026-11-17)
//  11  Submit time    the order's Submit (calcInput.orderAt), not a later
//                     I/O-only save (2026-11-17)
//
// Each boundary has a case on each side. Made-up infants only; this repo is public.
// Mounts the real data.js and registry.jsx in jsdom (deps in test/README.md).
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://localhost/', pretendToBeVisual: true });
const { window } = dom;
Object.assign(global, { window, document: window.document, self: window, HTMLElement: window.HTMLElement, Element: window.Element,
  Node: window.Node, getComputedStyle: window.getComputedStyle, requestAnimationFrame: (cb) => setTimeout(cb, 0),
  cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true });
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
const D = window.NEOFEED_DATA;
global.Icon = () => null; window.Icon = global.Icon;
vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + 'registry.jsx', 'utf8'), {
  presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
  filename: 'registry.jsx', configFile: false, babelrc: false,
}).code + '\n;window.__PatientRegistry = PatientRegistry; window.__WardTpnPage = typeof WardTpnPage === "function" ? WardTpnPage : null;');

let pass = 0, fail = 0, n = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name}${cond ? '' : '\n         ' + JSON.stringify(detail ?? '')}`);
  cond ? pass++ : fail++;
}

const today = D.todayLocal();
const day = (k) => D.addDaysToDateStr(today, k);
const NOW_ISO = new Date().toISOString();

// A made-up infant on `dol` today. `admitDol` > 1: admitted after birth.
function pt(id, { ga = 30, bw = 1200, dol = 4, admitDol = 1, bed = 'NICU 1', status = 'Active' } = {}) {
  return { sessionId: id, name: 'Baby ' + id, initials: 'B' + id, bw, ga, sex: 'girls', status, currentBed: bed,
    dob: day(-(dol - 1)), admissionDate: day(-(dol - admitDol)), diagnosis: 'dx', weights: [{ dol: admitDol, w: bw }],
    statusDate: status === 'Active' ? '' : today };
}
// A Submitted order with TPN. dex/aa/lipid as ordered; gir the saved IV GIR; en enVolPerKg.
function tpn(ts, { dex = 10, aa = 3, lipid = 2, gir = 6, en = 20, men = false, extra = {}, status = 'submitted' } = {}) {
  const bag = dex > 0 || aa > 0 || Object.keys(extra).length > 0;
  return { ts, status, gir, enVolPerKg: en, lastModified: NOW_ISO, entryId: 'e-' + ts,
    calcInput: { noTpn: false, totalTPN_mL: bag ? 100 : 0, dexPct: dex, aaPerKg: aa, lipidPerKg: lipid, isMEN: men, ...extra } };
}
function noTpn(ts, { en = 150, status = 'submitted' } = {}) {
  return { ts, status, gir: 0, enVolPerKg: en, lastModified: NOW_ISO, entryId: 'n-' + ts,
    calcInput: { noTpn: true, totalTPN_mL: 0, dexPct: 0, aaPerKg: 0, lipidPerKg: 0 } };
}
const row = (p, entries) => D.wardTpnRow(p, entries, today);
const keys = (r) => (r ? r.flags.map(f => f.key).join(',') : 'not listed');
const has = (r, k) => !!r && r.flags.some(f => f.key === k);

console.log('\n── 1. who is listed ──');
ok('the rule is in data.js', typeof D.wardTpnRow === 'function' && typeof D.wardTpnRows === 'function');
if (typeof D.wardTpnRow !== 'function' || typeof D.wardTpnRows !== 'function') {
  console.log(`\nFAILED: ${pass} passed, ${fail} failed (nothing else can run without the rule)`);
  process.exit(1);
}
ok('14 days, the number the page names', D.WARD_TPN_RECENT_DAYS === 14, D.WARD_TPN_RECENT_DAYS);
ok('Active, latest order has TPN: listed', !!row(pt('A'), [tpn(today)]));
ok('a blank status is Active: listed', !!row({ ...pt('A2'), status: '' }, [tpn(today)]));
ok('Discharged, latest order has TPN: not listed', row(pt('B', { status: 'Discharged' }), [tpn(today)]) === null);
ok('Transferred: not listed', row(pt('B2', { status: 'Transferred' }), [tpn(today)]) === null);
ok('No TPN now, last TPN order 14 days ago: listed', !!row(pt('C'), [tpn(day(-14)), noTpn(day(-13)), noTpn(today)]));
ok('No TPN now, last TPN order 15 days ago: not listed', row(pt('D'), [tpn(day(-15)), noTpn(day(-14)), noTpn(today)]) === null);
ok('the 14 days count from the last TPN order, not the last submit (No TPN submitted today)',
  row(pt('D2'), [tpn(day(-20)), noTpn(day(-3)), noTpn(today)]) === null);
ok('never had TPN, a No TPN order today: not listed', row(pt('E'), [noTpn(day(-3)), noTpn(today)]) === null);
ok('latest order has TPN though 30 days old: still listed', !!row(pt('F', { dol: 40 }), [tpn(day(-30))]));
ok('a TPN draft today is not an order (No TPN yesterday, TPN 20 days ago): not listed',
  row(pt('G', { dol: 25 }), [tpn(day(-20)), noTpn(day(-1)), tpn(today, { status: 'draft' })]) === null);
ok('a TPN draft never lists an infant who had no TPN', row(pt('G2'), [tpn(today, { status: 'draft' })]) === null);
ok('no orders: not listed', row(pt('H'), []) === null && row(pt('H2'), undefined) === null);
ok('the date decides, not the array order (No TPN back-filled after today\'s TPN)',
  row(pt('I', { dol: 30 }), [tpn(today), noTpn(day(-20))])?.onTpn === true);
const wardPatients = [pt('N1', { bed: 'NICU 2' }), pt('S1', { bed: 'SCN 3' })];
const wardLog = { N1: [tpn(today)], S1: [tpn(today)] };
ok('one ward at a time: NICU lists the NICU infant only',
  D.wardTpnRows(wardPatients, wardLog, 'NICU', today).map(r => r.sessionId).join() === 'N1');
ok('…and SCN the SCN infant', D.wardTpnRows(wardPatients, wardLog, 'SCN', today).map(r => r.sessionId).join() === 'S1');
ok('the last day an infant off TPN stays listed is that order\'s date + 14',
  row(pt('C3'), [tpn(day(-5)), noTpn(today)])?.listedUntil === day(9), row(pt('C3'), [tpn(day(-5)), noTpn(today)])?.listedUntil);

console.log('\n── 2. AA < 2.5 on DOL 2–7, EN < 50, preterm ──');
const A = D.WARD_AA_FLAG;
ok('the line is 2.5 g/kg/d, DOL 2–7, EN 50', A.belowGPerKg === 2.5 && A.fromDol === 2 && A.toDol === 7 && A.enBelowMlKg === 50, A);
const aaRow = (o = {}, who = {}) => row(pt('AA', { dol: 4, ga: 30, ...who }), [tpn(today, { aa: 2, en: 10, ...o })]);
ok('AA 2, DOL 4, EN 10, GA 30: flagged', has(aaRow(), 'aa'), keys(aaRow()));
ok('AA 2.49: flagged', has(aaRow({ aa: 2.49 }), 'aa'));
ok('AA 2.5: not flagged', !has(aaRow({ aa: 2.5 }), 'aa'), keys(aaRow({ aa: 2.5 })));
ok('no AA at all (lipid only): flagged', has(aaRow({ aa: 0, dex: 0, lipid: 1 }), 'aa'), keys(aaRow({ aa: 0, dex: 0, lipid: 1 })));
ok('DOL 1: not flagged', !has(aaRow({}, { dol: 1 }), 'aa'));
ok('DOL 2: flagged', has(aaRow({}, { dol: 2 }), 'aa'));
ok('DOL 7: flagged', has(aaRow({}, { dol: 7 }), 'aa'));
ok('DOL 8: not flagged', !has(aaRow({}, { dol: 8 }), 'aa'));
ok('EN 49.9: flagged', has(aaRow({ en: 49.9 }), 'aa'));
ok('EN 50: not flagged', !has(aaRow({ en: 50 }), 'aa'));
ok('a MEN feed counts no EN (ticked MEN at 60: flagged)', has(aaRow({ en: 60, men: true }), 'aa'), keys(aaRow({ en: 60, men: true })));
ok('GA 36+6 is preterm: flagged', has(aaRow({}, { ga: 36.6 }), 'aa'));
ok('GA 37+0 is not: not flagged', !has(aaRow({}, { ga: 37 }), 'aa'), keys(aaRow({}, { ga: 37 })));
ok('GA 40: not flagged', !has(aaRow({}, { ga: 40 }), 'aa'));
ok('preterm below 37 weeks, the number the page names', D.PRETERM_GA_WK === 37 && D.isPretermGa(36.6) && !D.isPretermGa(37));
ok('no usable GA counts as preterm: flagged', has(aaRow({}, { ga: 0 }), 'aa'));
ok('by DOL, also admitted after birth: DOL 5, admitted on DOL 4 (PN day 2): flagged',
  has(row(pt('AO', { dol: 5, admitDol: 4 }), [tpn(day(-1), { aa: 1.5, en: 10 }), tpn(today, { aa: 2, en: 10 })]), 'aa'));
ok('…and not from admission: DOL 9, admitted on DOL 8 (day 2 of the stay): not flagged',
  !has(row(pt('AP', { dol: 9, admitDol: 8 }), [tpn(day(-1), { aa: 1.5, en: 10 }), tpn(today, { aa: 2, en: 10 })]), 'aa'));
ok('by today\'s DOL: DOL 2 today, the latest order DOL 1\'s (AA 1.5): flagged',
  has(row(pt('AY', { dol: 2 }), [tpn(day(-1), { aa: 1.5, en: 0 })]), 'aa'));
ok('…and DOL 8 today with DOL 7\'s order (AA 2): not flagged',
  !has(row(pt('AZ', { dol: 8 }), [tpn(day(-1), { aa: 2, en: 0 })]), 'aa'));

console.log('\n── 3. no lipid on DOL 2, preterm ──');
const lipRow = (o = {}, who = {}) => row(pt('L', { dol: 2, ga: 30, ...who }), [tpn(today, { aa: 3, lipid: 0, en: 10, ...o })]);
ok('DOL 2 is the day', D.WARD_LIPID_FLAG_DOL === 2);
ok('DOL 2, no lipid, GA 30: flagged', has(lipRow(), 'lipid'), keys(lipRow()));
ok('DOL 2, lipid 0.5: not flagged', !has(lipRow({ lipid: 0.5 }), 'lipid'));
ok('DOL 1, no lipid: not flagged', !has(lipRow({}, { dol: 1 }), 'lipid'));
ok('DOL 3, no lipid: not flagged', !has(lipRow({}, { dol: 3 }), 'lipid'));
ok('GA 36+6: flagged', has(lipRow({}, { ga: 36.6 }), 'lipid'));
ok('GA 37+0: not flagged', !has(lipRow({}, { ga: 37 }), 'lipid'));
ok('by today\'s DOL: DOL 2 today, DOL 1\'s order without lipid: flagged',
  has(row(pt('LY', { dol: 2 }), [tpn(day(-1), { aa: 3, lipid: 0 })]), 'lipid'));

console.log('\n── 4. GIR: above 12 red, below 4 amber ──');
const girRow = (gir) => row(pt('GI', { dol: 10, ga: 38 }), [tpn(today, { gir, en: 20 })]);
const girFlag = (gir) => (girRow(gir)?.flags || []).find(f => f.key === 'gir');
ok('GIR 12: no flag', !girFlag(12), girFlag(12));
ok('GIR 12.01: red', girFlag(12.01)?.level === 'crit', girFlag(12.01));
ok('GIR 4: no flag', !girFlag(4));
ok('GIR 3.99: amber, low', girFlag(3.99)?.level === 'warn' && girFlag(3.99)?.low === true, girFlag(3.99));
ok('GIR 0 (no dextrose, lipid only): no flag', !girFlag(0));
ok('a red GIR makes the row red', girRow(12.5)?.level === 'crit');
ok('GIR applies at every GA (term, GA 40)', row(pt('GT', { ga: 40, dol: 10 }), [tpn(today, { gir: 13 })])?.level === 'crit');

console.log('\n── 5. PN still ordered at NICE\'s EN line ──');
const S = D.PN_STOP_EN_ML_KG;
ok('140 below 28 wk, 120 from 28 wk', S.below === 140 && S.atOrAbove === 120 && S.belowGaWk === 28, S);
const enRow = (en, ga, o = {}) => row(pt('EN', { dol: 20, ga }), [tpn(today, { en, aa: 2, lipid: 1, gir: 5, ...o })]);
ok('GA 27+6, EN 139.9: no flag', !has(enRow(139.9, 27.6), 'pnAfterEn'), keys(enRow(139.9, 27.6)));
ok('GA 27+6, EN 140: flagged at 140', (enRow(140, 27.6)?.flags || []).find(f => f.key === 'pnAfterEn')?.stopAt === 140, keys(enRow(140, 27.6)));
ok('GA 28+0, EN 119.9: no flag', !has(enRow(119.9, 28), 'pnAfterEn'));
ok('GA 28+0, EN 120: flagged at 120', (enRow(120, 28)?.flags || []).find(f => f.key === 'pnAfterEn')?.stopAt === 120);
ok('GA 28+0, EN 130 (between the lines): flagged', has(enRow(130, 28), 'pnAfterEn'));
ok('GA 27+6, EN 130: not flagged', !has(enRow(130, 27.6), 'pnAfterEn'));
ok('term (GA 39), EN 120: flagged', has(enRow(120, 39), 'pnAfterEn'));
ok('lipid alone is PN: term, EN 125, lipid only: flagged', has(enRow(125, 39, { dex: 0, aa: 0, lipid: 1 }), 'pnAfterEn'), keys(enRow(125, 39, { dex: 0, aa: 0, lipid: 1 })));
ok('a bag with no dextrose, AA or lipid is not PN: no flag',
  !has(enRow(150, 39, { dex: 0, aa: 0, lipid: 0, extra: { naCl: 2 } }), 'pnAfterEn'), keys(enRow(150, 39, { dex: 0, aa: 0, lipid: 0, extra: { naCl: 2 } })));
ok('no usable GA takes the lower line (120)', D.pnStopEnFor(0) === 120 && has(enRow(120, 0), 'pnAfterEn'));
ok('a MEN feed counts nothing toward the line', !has(enRow(150, 30, { men: true }), 'pnAfterEn'));

console.log('\n── 6. No TPN ──');
// Pp, 2026-11-17 ("ขึ้นธง"): a preterm infant off PN on DOL 2–7 with EN < 50 is
// flagged as AA 0, and on DOL 2 as no lipid. Before, a No TPN order took its
// chip and nothing else.
const nt = row(pt('NT', { dol: 2, ga: 26 }), [tpn(day(-1), { aa: 1.5, lipid: 0 }), noTpn(today, { en: 30 })]);
ok('No TPN on DOL 2, GA 26, EN 30: the No TPN chip, then the AA and lipid flags', keys(nt) === 'noTpn,aa,lipid', keys(nt));
ok('…the AA and lipid flags say they come from a No TPN order', nt && nt.flags.filter(f => f.noTpn === true).map(f => f.key).join() === 'aa,lipid', nt && nt.flags);
ok('…its AA, lipid and GIR are blank, its EN shown', nt && nt.aa === null && nt.lipid === null && nt.gir === null && nt.en === 30, nt && [nt.aa, nt.lipid, nt.gir, nt.en]);
ok('…and it is amber', nt?.level === 'warn', nt?.level);
const ntRow = (who, en) => row(pt('NX', { ga: 30, ...who }), [tpn(day(-2)), noTpn(today, { en })]);
ok('No TPN, DOL 4, EN 30, GA 30: No TPN and AA', keys(ntRow({ dol: 4 }, 30)) === 'noTpn,aa', keys(ntRow({ dol: 4 }, 30)));
ok('No TPN, DOL 4, EN 49.9: AA', keys(ntRow({ dol: 4 }, 49.9)) === 'noTpn,aa', keys(ntRow({ dol: 4 }, 49.9)));
ok('No TPN, DOL 4, EN 50: the No TPN chip only', keys(ntRow({ dol: 4 }, 50)) === 'noTpn', keys(ntRow({ dol: 4 }, 50)));
ok('No TPN, DOL 7, EN 30: AA', keys(ntRow({ dol: 7 }, 30)) === 'noTpn,aa', keys(ntRow({ dol: 7 }, 30)));
ok('No TPN, DOL 8, EN 30: the No TPN chip only', keys(ntRow({ dol: 8 }, 30)) === 'noTpn', keys(ntRow({ dol: 8 }, 30)));
ok('No TPN, DOL 2, EN 60: lipid only (EN is past the AA line)', keys(ntRow({ dol: 2 }, 60)) === 'noTpn,lipid', keys(ntRow({ dol: 2 }, 60)));
ok('No TPN, GA 37+0, DOL 4, EN 10: the No TPN chip only (term)', keys(ntRow({ dol: 4, ga: 37 }, 10)) === 'noTpn', keys(ntRow({ dol: 4, ga: 37 }, 10)));
ok('No TPN never takes a GIR or PN-after-EN flag (GA 26, DOL 20, EN 150)', keys(ntRow({ dol: 20, ga: 26 }, 150)) === 'noTpn', keys(ntRow({ dol: 20, ga: 26 }, 150)));
ok('a MEN feed counts no EN on a No TPN order too (ticked MEN at 60, DOL 4: AA)',
  keys(row(pt('NM', { dol: 4 }), [tpn(day(-1)), { ...noTpn(today, { en: 60 }), calcInput: { noTpn: true, totalTPN_mL: 0, isMEN: true } }])) === 'noTpn,aa');
ok('an order older than the tick, no bag (no noTpn key), is No TPN',
  keys(row(pt('NT2'), [tpn(day(-2)), { ts: today, status: 'submitted', gir: 0, enVolPerKg: 150, calcInput: { totalTPN_mL: 0, dexPct: 0, aaPerKg: 0 } }])) === 'noTpn');

console.log('\n── 7. PN day ──');
ok('TPN every day from 4 days ago: PN day 5', row(pt('P1', { dol: 6 }), [0, -1, -2, -3, -4].map(k => tpn(day(k))))?.pnDay === 5);
ok('a No TPN day restarts the run: PN day 1', row(pt('P2', { dol: 6 }), [tpn(day(-3)), tpn(day(-2)), noTpn(day(-1)), tpn(today)])?.pnDay === 1);
ok('a day with no order does not break the run: PN day 4', row(pt('P3', { dol: 6 }), [tpn(day(-3)), tpn(day(-1)), tpn(today)])?.pnDay === 4);
ok('today\'s, like DOL: the latest order yesterday, run from 2 days ago: PN day 3', row(pt('P4', { dol: 6 }), [tpn(day(-2)), tpn(day(-1))])?.pnDay === 3);
ok('admitted on DOL 4, PN from that day, DOL 5 today: PN day 2, DOL 5',
  (() => { const r = row(pt('P5', { dol: 5, admitDol: 4 }), [tpn(day(-1)), tpn(today)]); return r?.pnDay === 2 && r?.dol === 5; })());
ok('off TPN: no PN day', row(pt('P6'), [tpn(day(-2)), noTpn(today)])?.pnDay === null);

console.log('\n── 8. the page ──');
const Page = window.__WardTpnPage;
ok('registry.jsx defines WardTpnPage', typeof Page === 'function');
// Out of bed order on purpose, so the page's own bed sort is what orders them.
const patients = [
  pt('n06', { bed: 'NICU 6', dol: 15, ga: 31 }),               // PN after EN
  pt('n05', { bed: 'NICU 5', dol: 18, ga: 28.2 }),             // No TPN
  pt('n03', { bed: 'NICU 3', dol: 2, ga: 29 }),                // lipid flag
  pt('n02', { bed: 'NICU 2', dol: 6, ga: 27.1 }),              // no flag
  pt('n01', { bed: 'NICU 1', dol: 4, ga: 25.3 }),              // AA flag
  pt('n04', { bed: 'NICU 4', dol: 6, ga: 30.4 }),              // GIR red
  pt('n07', { bed: 'NICU 7', dol: 12, ga: 33, status: 'Discharged' }),
  pt('n08', { bed: 'NICU 8', dol: 9, ga: 38 }),                // never TPN
  pt('s01', { bed: 'SCN 1', dol: 3, ga: 34 }),                 // SCN, no flag
  pt('n09', { bed: 'NICU 9', dol: 5, ga: 29 }),                // No TPN at EN 20 on DOL 5
];
// Local times today, for the Submit column.
const at = (h, m) => { const [y, mo, d] = today.split('-').map(Number); return new Date(y, mo - 1, d, h, m).toISOString(); };
const log = {
  n01: [tpn(today, { aa: 2, lipid: 1, gir: 6.5, en: 10 })],
  // Submitted at 09:10; a nurse's I/O-only save at 15:45 keeps calcInput.orderAt.
  n02: [{ ...tpn(today, { aa: 3, lipid: 3, gir: 8.2, en: 30 }), lastModified: at(15, 45), published: '',
    calcInput: { ...tpn(today, { aa: 3, lipid: 3, gir: 8.2, en: 30 }).calcInput, orderAt: at(9, 10) } }],
  n03: [tpn(today, { aa: 2.5, lipid: 0, gir: 5.8, en: 5 })],
  n04: [tpn(today, { aa: 3.5, lipid: 3, gir: 12.8, en: 20 })],
  n05: [tpn(day(-3)), noTpn(day(-2), { en: 150 })],
  n06: [tpn(today, { aa: 1.5, lipid: 1, gir: 4.5, en: 125 })],
  n07: [tpn(today)],
  n08: [noTpn(today)],
  s01: [tpn(today, { aa: 3, lipid: 2, gir: 6, en: 20 })],
  n09: [tpn(day(-2)), noTpn(today, { en: 20 })],
};
const selected = [];
const root = ReactDOM.createRoot(document.getElementById('root'));
if (Page) act(() => { root.render(React.createElement(Page, { patients, log, ward: 'NICU', onSelect: (id) => selected.push(id) })); });
const host = document.getElementById('root');
const sids = (sel) => [...host.querySelectorAll(sel)].map(el => el.getAttribute('data-sid'));
const tableOrder = sids('.wtpn-table tbody tr');
ok('NICU lists its seven: not the discharged, the never-TPN or the SCN infant',
  [...tableOrder].sort().join() === 'n01,n02,n03,n04,n05,n06,n09', tableOrder);
ok('flagged first: red, then amber by bed (a flagged No TPN too), then no flag, then No TPN', tableOrder.join() === 'n04,n01,n03,n06,n09,n02,n05', tableOrder);
ok('the phone cards list the same, in the same order', sids('.wtpn-cards .wtpn-card').join() === tableOrder.join(), sids('.wtpn-cards .wtpn-card'));
const tr = (sid) => host.querySelector(`.wtpn-table tr[data-sid="${sid}"]`);
const chips = (sid) => [...(tr(sid)?.querySelectorAll('.wtpn-flags .chip') || [])].map(c => c.textContent);
ok('AA chip reads "AA < 2.5"', chips('n01').join() === 'AA < 2.5', chips('n01'));
ok('lipid chip reads "DOL 2 ยังไม่มี lipid"', chips('n03').join() === 'DOL 2 ยังไม่มี lipid', chips('n03'));
ok('GIR chip reads "GIR 12.8 > 12", red', chips('n04').join() === 'GIR 12.8 > 12' && !!tr('n04')?.querySelector('.chip.crit'), chips('n04'));
ok('PN-after-EN chip reads "EN ≥ 120 ยังมี PN"', chips('n06').join() === 'EN ≥ 120 ยังมี PN', chips('n06'));
ok('No TPN chip, no colour', chips('n05').join() === 'No TPN' && !tr('n05')?.querySelector('.chip.warn, .chip.crit'), chips('n05'));
ok('No TPN on DOL 5 at EN 20: "No TPN" then "หยุด PN ตอน EN < 50", amber',
  chips('n09').join() === 'No TPN,หยุด PN ตอน EN < 50' && !!tr('n09')?.querySelector('.chip.warn'), chips('n09'));
ok('a row with nothing flagged says so', chips('n02').join() === 'ไม่มีธง', chips('n02'));
ok('the No TPN chip says when the infant leaves the page',
  new RegExp(`อยู่ในหน้านี้ถึง ${day(11).slice(8, 10)}/${day(11).slice(5, 7)}`).test(tr('n05')?.querySelector('.wtpn-flags .chip')?.title || ''), tr('n05')?.querySelector('.wtpn-flags .chip')?.title);
const cells = (sid) => [...(tr(sid)?.querySelectorAll('td') || [])].map(td => td.textContent.trim());
ok('row cells: DOL 4, PN day 1, AA 2, lipid 1, GIR 6.5, EN 10', cells('n01').slice(2, 8).join('|') === '4|1|2|1|6.5|10', cells('n01'));
ok('no trailing zeros: AA 3, lipid 3 (not 3.0)', cells('n02')[4] === '3' && cells('n02')[5] === '3', cells('n02'));
ok('No TPN row: PN day, AA, lipid and GIR blank, EN 150', cells('n05').slice(3, 8).join('|') === '—|—|—|—|150', cells('n05'));
ok('the flagged figure is coloured, its neighbours not',
  tr('n01')?.children[4]?.classList.contains('wtpn-cell-warn') && !tr('n01')?.children[5]?.classList.contains('wtpn-cell-warn'));
ok('GA and BW under the name', /GA 25\+3 · BW 1,200 g/.test(tr('n01')?.textContent || ''), tr('n01')?.textContent);
ok('submitted today reads "วันนี้ HH:MM"', /วันนี้ \d\d:\d\d/.test(cells('n01')[9] || ''), cells('n01')[9]);
ok('the Submit column reads the order\'s Submit (09:10), not a nurse\'s I/O save after it (15:45)',
  cells('n02')[9] === 'วันนี้ 09:10', cells('n02')[9]);
ok('…and so does the phone card', host.querySelector('.wtpn-card[data-sid="n02"] .wtpn-card-top .wtpn-sub')?.textContent === 'วันนี้ 09:10',
  host.querySelector('.wtpn-card[data-sid="n02"] .wtpn-card-top .wtpn-sub')?.textContent);
const tiles = [...host.querySelectorAll('.wtpn-tile .v')].map(v => v.textContent);
ok('tiles: 7 on the page, 5 to look at today', tiles.join() === '7,5', tiles);
ok('…of which 5 on TPN, 2 stopped', /ได้ TPN 5 · หยุดแล้ว 2/.test(host.querySelector('.wtpn-tile .l')?.textContent || ''));
const text = host.textContent;
ok('no QI figure: no QI, rate, median or run chart on the page', !/\bQI\b|median|run chart|ร้อยละ|%/.test(text), text.match(/\bQI\b|median|run chart|ร้อยละ|%/));
ok('the legend names the lines from data.js (2.5, 37, 140, 120, 14)',
  ['AA < 2.5', 'GA < 37 wk', '140 mL/kg/d', '120 ตั้งแต่ 28 wk', '14 วัน'].every(s => text.includes(s)),
  ['AA < 2.5', 'GA < 37 wk', '140 mL/kg/d', '120 ตั้งแต่ 28 wk', '14 วัน'].filter(s => !text.includes(s)));
ok('the legend cites NICE NG154 recs 1.8.2–1.8.3 (1.8.2 is the 140 line, 1.8.3 the 120)', text.includes('NICE NG154 rec 1.8.2–1.8.3'));
ok('the legend says a No TPN order counts as AA 0', text.includes('นับคำสั่ง No TPN เป็น AA 0'));
if (tr('n04')) act(() => { tr('n04').dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
ok('a tap on a row opens that infant', selected.join() === 'n04', selected);
const card = host.querySelector('.wtpn-card[data-sid="n03"]');
if (card) act(() => { card.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
ok('Enter on a phone card opens that infant', selected.join() === 'n04,n03', selected);
const scnBtn = [...host.querySelectorAll('.seg button')].find(b => b.textContent === 'SCN');
if (scnBtn) act(() => { scnBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
ok('the ward switch: SCN lists its infant only', sids('.wtpn-table tbody tr').join() === 's01', sids('.wtpn-table tbody tr'));
ok('…and names the ward', /TPN ทั้งหอ · SCN/.test(host.querySelector('h1')?.textContent || ''), host.querySelector('h1')?.textContent);
const otherBtn = [...host.querySelectorAll('.seg button')].find(b => b.textContent === 'ทดสอบระบบ');
if (otherBtn) act(() => { otherBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
ok('an empty ward says so', /ยังไม่มีทารกที่ได้ TPN ใน ทดสอบระบบ/.test(host.textContent), host.textContent.slice(0, 200));
act(() => { root.unmount(); });

console.log('\n── 9. the way in ──');
const app = fs.readFileSync(DIR + 'app.jsx', 'utf8');
ok('a rail item "TPN ทั้งหอ" right after Dashboard',
  /label="Dashboard"[^\n]*\n(?:\s*\{\/\*[\s\S]*?\*\/\}\n)?\s*<RailItem icon="drop" label="TPN ทั้งหอ" active=\{view === "wardtpn"\}/.test(app));
ok('the view renders WardTpnPage', /view === "wardtpn" && <WardTpnPage /.test(app));
ok('the ward list gets its way in', /onOpenWardTpn=\{\(\) => goTo\("wardtpn"\)\}/.test(app));
const Reg = window.__PatientRegistry;
let opened = 0;
const root2 = ReactDOM.createRoot(document.getElementById('root'));
act(() => { root2.render(React.createElement(Reg, { patients, log, activeId: null, ward: 'NICU', onWardChange() {}, onSelect() {}, onAdd() {}, onEdit() {}, onDelete() {}, onOpenWardTpn: () => opened++ })); });
const btn = [...document.querySelectorAll('button')].find(b => /TPN ทั้งหอ/.test(b.textContent));
if (btn) act(() => { btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
ok('the ward list has a "TPN ทั้งหอ" button that opens the page', !!btn && opened === 1, { btn: !!btn, opened });
act(() => { root2.unmount(); });
const css = fs.readFileSync(DIR + 'index.html', 'utf8');
ok('the page\'s phone cards replace the table under 768px', /\.wtpn-cards \{ display: none; \}/.test(css) && /@media \(max-width: 767px\) \{\s*\.wtpn-cards \{ display: grid;/.test(css));
ok('and the shells are still one file', css === fs.readFileSync(DIR + 'NeoFeed.html', 'utf8'));

console.log('\n── 10. graded as printed ──');
// A saved figure is a float: 8 feeds of 17.5 mL over 1 kg is 140, but a
// division can leave 139.99999999999997. The page prints EN to 1 decimal and
// AA, lipid and GIR to 2 (displayNum), and grades the printed figure.
const tail = (x, sign) => x + sign * 3e-14;
ok('the float tails here are real: 140 − 3e-14 is below 140', tail(140, -1) < 140 && tail(50, 1) > 50);
ok('GA 27+6, EN 140 less a float tail: flagged at 140', has(enRow(tail(140, -1), 27.6), 'pnAfterEn'), keys(enRow(tail(140, -1), 27.6)));
ok('GA 28+0, EN 120 less a float tail: flagged at 120', has(enRow(tail(120, -1), 28), 'pnAfterEn'), keys(enRow(tail(120, -1), 28)));
ok('GA 27+6, EN 139.94 (prints 139.9): no flag', !has(enRow(139.94, 27.6), 'pnAfterEn'), keys(enRow(139.94, 27.6)));
ok('GA 27+6, EN 139.96 (prints 140): flagged', has(enRow(139.96, 27.6), 'pnAfterEn'), keys(enRow(139.96, 27.6)));
ok('EN 49.96 prints 50, so it is not "EN < 50": no AA flag', !has(aaRow({ en: 49.96 }), 'aa'), keys(aaRow({ en: 49.96 })));
ok('EN 49.94 prints 49.9: AA flag', has(aaRow({ en: 49.94 }), 'aa'), keys(aaRow({ en: 49.94 })));
ok('EN 50 less a float tail prints 50: no AA flag', !has(aaRow({ en: tail(50, -1) }), 'aa'), keys(aaRow({ en: tail(50, -1) })));
ok('AA 2.5 less a float tail prints 2.5: no AA flag', !has(aaRow({ aa: tail(2.5, -1) }), 'aa'), keys(aaRow({ aa: tail(2.5, -1) })));
ok('AA 2.494 prints 2.49: AA flag', has(aaRow({ aa: 2.494 }), 'aa'), keys(aaRow({ aa: 2.494 })));
ok('GIR 12 plus a float tail prints 12: no flag', !girFlag(tail(12, 1)), girFlag(tail(12, 1)));
ok('GIR 4 less a float tail prints 4: no flag', !girFlag(tail(4, -1)), girFlag(tail(4, -1)));
ok('GIR 12.006 prints 12.01: red', girFlag(12.006)?.level === 'crit', girFlag(12.006));
ok('lipid 0.004 prints 0: DOL 2 no-lipid flag', has(lipRow({ lipid: 0.004 }), 'lipid'), keys(lipRow({ lipid: 0.004 })));
ok('…and the row still shows the figure as saved', aaRow({ en: 49.96 })?.en === 49.96);

console.log('\n── 11. Submit time ──');
// Submit saves and locks in one press; the server stamps calcInput.orderAt on
// every save that changes the order and keeps it on an I/O-only save.
const sub = D.orderSubmittedAt;
ok('orderSubmittedAt is in data.js', typeof sub === 'function');
if (typeof sub === 'function') {
  ok('orderAt first', sub({ calcInput: { orderAt: at(9, 10) }, published: at(9, 11), lastModified: at(15, 45) }) === at(9, 10));
  ok('then the lock (published), for a row from before orderAt', sub({ calcInput: {}, published: at(9, 11), lastModified: at(15, 45) }) === at(9, 11));
  ok('then the last save', sub({ calcInput: {}, published: '', lastModified: at(15, 45) }) === at(15, 45));
  ok('a stamp that is not a date is skipped', sub({ calcInput: { orderAt: 'x' }, published: 'nope', lastModified: at(8, 0) }) === at(8, 0));
  ok('no stamp at all: ""', sub({ calcInput: null }) === '' && sub(null) === '');
  ok('the row carries it', row(pt('ST'), [{ ...tpn(today), calcInput: { ...tpn(today).calcInput, orderAt: at(7, 5) } }])?.submittedAt === at(7, 5));
}

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
