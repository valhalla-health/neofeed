// verify-qi-submit-times-1118.cjs — QI_SubmitTimes, when each day's TPN orders
// reach the TPN room. Pp, 2026-11-18: "งาน QI อยากดูเรื่องตั้งแต่การซับมิตครั้งสุดท้าย
// ของวันว่าเป็นเวลาเท่าไหร่"; she chose a tab in the Sheet rebuilt every night, admin
// only, with the TPN room's cut-off at 14:00.
//
//   §1  one day: the whole unit (ALL = NICU + SCN) and each ward; first, last and
//       median Submit; the cut-off; drafts; "other" outside ALL; an erased infant,
//       an EN order and a superseded row left out; an empty day still has rows
//   §2  a revision: the TPN room's version is the last Submit, the first Submit of
//       any version is first_submit, and the order counts as revised
//   §3  an I/O-only revision (a nurse's, through the real backend) does not move
//       the Submit time, and the TPN room's page reads the same time
//   §4  a Submit after midnight: "HH:MM (+1)", next_day, after the cut-off
//   §5  the ward at the moment of Submit, from bedHistory, not today's bed
//   §6  no_time, the cut-off by the minute shown, another cut-off, a bad one
//   §7  the tab: written whole, rewritten whole, plain-text times and number
//       counts, no patient field, from QI_SUBMIT_FROM to yesterday
//   §8  out of doPost's reach; a schema fault throws before the tab is touched
//   §9  Vera, 2026-11-18: the run reads AM, so a sticker-only revision is the
//       TPN room's version here too; the grid grows past 1000 rows
//
// Made-up infants only (this repo is public). No npm dependencies.
//
// NEGATIVE CONTROL: red against the backend before it (no qiSubmitDays):
//   git show origin/main:gas-backend.gs > /tmp/gas-main.gs
//   NEOFEED_GAS_SRC=/tmp/gas-main.gs node test/verify-qi-submit-times-1118.cjs
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const crypto = require('crypto');
const { boot, recorder, withNow, addDays, bkkMidnight, LOG_HEADER, PAT_HEADER } = require('./gas-vm-sandbox.cjs');
const T = recorder('QI SUBMIT TIMES');

const D = '2026-11-02';            // a Monday
const D1 = addDays(D, 1);
// The moment `hh:mm[:ss]` ward time on `day`, as the ISO stamp the backend writes.
const at = (day, hhmm) => {
  const [h, m, s] = hhmm.split(':').map(Number);
  return new Date(bkkMidnight(day).getTime() + ((h * 60 + m) * 60 + (s || 0)) * 1000).toISOString();
};
const H = Object.fromEntries(['date', 'weekday', 'ward', 'tpn_orders', 'first_submit', 'last_submit', 'last_submit_min',
  'median_submit', 'after_cutoff', 'cutoff', 'revised', 'next_day', 'drafts', 'no_time', 'updated_at'].map((k, i) => [k, i]));

// A Daily_Log row (A–AL). `pub` the Submit stamp (AH), `rev` AJ, `of` AK, `sup` AL.
function logRow(g, sid, day, { route = 'TPN central', status = 'submitted', pub = '', lm = '', ci = {}, id, rev = 1, of = '', sup = '', cv = '2026-11-16.1', figures = {} } = {}) {
  return g.logRow(sid, day, Object.assign({ 13: route, 14: status, 24: JSON.stringify(Object.assign({ wtG: 1250, aaPerKg: 3, stops: [] }, ci)),
    25: id || crypto.randomUUID(), 26: lm || pub || at(day, '08:00'), 31: cv, 33: pub, 35: rev, 36: of, 37: sup }, figures));
}
function sandbox() {
  const g = boot();
  g.pat = (sid, extra) => g.sheet('Patient_Registry').data.push(g.patRow(sid, extra));
  g.log = (row) => g.sheet('Daily_Log').data.push(row);
  g.days = (opts) => g.sb.qiSubmitDays(g.sheet('Daily_Log').data, g.sheet('Patient_Registry').data,
    Object.assign({ from: D, to: D1, now: new Date(at(addDays(D1, 1), '01:00')) }, opts || {}));
  return g;
}
const pick = (out, day, ward) => (out.rows || []).find(r => r[H.date] === day && r[H.ward] === ward);
const view = (r, keys) => (r ? keys.map(k => r[H[k]]) : 'no row');

T.section('§1 one day: the unit and each ward', () => {
  const g = sandbox();
  if (typeof g.sb.qiSubmitDays !== 'function') { T.ok('qiSubmitDays exists', false); return; }
  g.pat('NF-1', { 10: 'NICU 3' }); g.pat('NF-2', { 10: 'NICU 5' }); g.pat('NF-3', { 10: 'SCN 2' });
  g.pat('NF-4', { 10: 'OR 1' });                                     // a free-text bed: "other"
  g.pat('NF-5', { 1: '[PDPA-erased 2026-11-10]', 10: 'NICU 6' });   // erased
  g.pat('NF-6', { 10: 'NICU 7' }); g.pat('NF-7', { 10: 'iso 2-1' });
  g.log(logRow(g, 'NF-1', D, { pub: at(D, '09:10') }));
  g.log(logRow(g, 'NF-2', D, { pub: at(D, '11:30') }));
  g.log(logRow(g, 'NF-3', D, { pub: at(D, '15:20') }));
  g.log(logRow(g, 'NF-4', D, { pub: at(D, '10:00') }));
  g.log(logRow(g, 'NF-5', D, { pub: at(D, '16:00') }));
  g.log(logRow(g, 'NF-6', D, { status: 'draft', lm: at(D, '12:00') }));
  g.log(logRow(g, 'NF-7', D, { route: 'Enteral only', pub: at(D, '17:00') }));
  g.log(logRow(g, 'NF-7', D, { route: 'TPN central', pub: at(D, '08:30'), sup: at(D, '17:00') }));   // its superseded TPN row
  g.log(logRow(g, 'NF-9', D, { pub: at(D, '18:00') }));             // no registry row
  const out = g.days();
  const keys = ['tpn_orders', 'first_submit', 'last_submit', 'last_submit_min', 'median_submit', 'after_cutoff', 'cutoff', 'revised', 'next_day', 'drafts', 'no_time'];
  T.eq('ALL: 3 orders, 09:10 to 15:20, median 11:30, 1 after 14:00, 1 draft', view(pick(out, D, 'ALL'), keys),
    [3, '09:10', '15:20', 920, '11:30', 1, '14:00', 0, 0, 1, 0]);
  T.eq('NICU: 2 orders, median the mean of the middle two (10:20), its draft', view(pick(out, D, 'NICU'), keys),
    [2, '09:10', '11:30', 690, '10:20', 0, '14:00', 0, 0, 1, 0]);
  T.eq('SCN: its one order at 15:20, after the cut-off', view(pick(out, D, 'SCN'), keys),
    [1, '15:20', '15:20', 920, '15:20', 1, '14:00', 0, 0, 0, 0]);
  T.eq('"other" gets its own row on a day it has an order, outside ALL', view(pick(out, D, 'other'), ['tpn_orders', 'last_submit']), [1, '10:00']);
  T.eq('the day reads Mon', pick(out, D, 'ALL')?.[H.weekday], 'Mon');
  T.eq('an empty day still has ALL, NICU and SCN, at 0 with blank times, and no "other"',
    ['ALL', 'NICU', 'SCN', 'other'].map(w => view(pick(out, D1, w), ['tpn_orders', 'first_submit', 'last_submit', 'last_submit_min', 'median_submit', 'after_cutoff', 'drafts'])),
    [[0, '', '', '', '', 0, 0], [0, '', '', '', '', 0, 0], [0, '', '', '', '', 0, 0], 'no row']);
  T.eq('rows in order: day, then ALL, NICU, SCN, other', out.rows.map(r => r[H.date].slice(8) + r[H.ward]),
    ['02ALL', '02NICU', '02SCN', '02other', '03ALL', '03NICU', '03SCN']);
  T.eq('the erased infant and the one with no registry row are counted as left out', [out.skippedErased, out.skippedNoPatient], [1, 1]);
  T.eq('4 orders read: NICU 2, SCN 1, other 1; the EN order, the superseded row, the erased and the unknown infant not among them', out.orders, 4);
  T.eq('every row is 15 columns', out.rows.every(r => r.length === 15), true);
});

T.section('§2 a revision: the TPN room\'s version is the last Submit', () => {
  const g = sandbox();
  g.pat('NF-1', { 10: 'NICU 3' }); g.pat('NF-2', { 10: 'NICU 4' });
  const r1 = crypto.randomUUID();
  g.log(logRow(g, 'NF-1', D, { id: r1, pub: at(D, '09:10'), sup: at(D, '16:05'), ci: { orderRev: 1 } }));
  g.log(logRow(g, 'NF-1', D, { pub: at(D, '16:05:20'), rev: 2, of: r1, ci: { aaPerKg: 3.5, orderRev: 2 } }));
  g.log(logRow(g, 'NF-2', D, { pub: at(D, '10:00') }));
  const out = g.days();
  T.eq('ALL: 2 orders, first 09:10 (version 1), last 16:05 (version 2), revised 1, after the cut-off 1',
    view(pick(out, D, 'ALL'), ['tpn_orders', 'first_submit', 'last_submit', 'revised', 'after_cutoff']), [2, '09:10', '16:05', 1, 1]);
  T.eq('…the median reads the final versions (10:00, 16:05 → 13:02)', pick(out, D, 'ALL')?.[H.median_submit], '13:02');
  // An order revised before the cut-off is not late.
  const g2 = sandbox();
  g2.pat('NF-1', { 10: 'NICU 3' });
  const s1 = crypto.randomUUID();
  g2.log(logRow(g2, 'NF-1', D, { id: s1, pub: at(D, '09:00'), sup: at(D, '13:00'), ci: { orderRev: 1 } }));
  g2.log(logRow(g2, 'NF-1', D, { pub: at(D, '13:00'), rev: 2, of: s1, ci: { aaPerKg: 2, orderRev: 2 } }));
  T.eq('a version 2 at 13:00: revised, not after 14:00', view(pick(g2.days(), D, 'ALL'), ['revised', 'after_cutoff', 'last_submit']), [1, 0, '13:00']);
});

T.section('§3 an I/O-only revision does not move the Submit (real backend)', () => {
  const g = boot();
  g.addStaff('doc@kcmh.test', 'doctor', 'Doctor-Password-1', { name: 'Dr Test' });
  g.addStaff('nur@kcmh.test', 'nurse', 'Nurse-Password-1', { name: 'Nurse Test' });
  g.addStaff('rx@kcmh.test', 'pharmacy', 'Pharmacy-Password-1', { name: 'Rx Test' });
  g.sheet('Patient_Registry').data.push(g.patRow('NF-300001', { 10: 'NICU 3' }));
  const as = (ms, email, role, body) => withNow(ms, () => g.post(Object.assign({ token: g.session(email, role) }, body)));
  const ms = (hhmm) => Date.parse(at(D, hhmm));
  const entry = { dol: 5, weight: 1250, fluid: 150, gir: 6, pro: 3, kcal: 90, na: 3, k: 2, ca: 60, p: 40, enVolPerKg: 20,
    route: 'TPN central', status: 'submitted', calcInput: { wtG: 1250, aaPerKg: 3, stops: [] }, ts: D };
  const saved = as(ms('10:00'), 'doc@kcmh.test', 'doctor', { action: 'logDailyNutrition', sessionId: 'NF-300001', entry });
  const pub = as(ms('10:00:02'), 'doc@kcmh.test', 'doctor', { action: 'publishLog', sessionId: 'NF-300001',
    entryId: saved.entryId, expectedLastModified: saved.lastModified });
  T.eq('the doctor\'s Submit lands and locks', [!!saved.entryId, !!pub.publishedAt], [true, true]);
  const io = as(ms('17:30'), 'nur@kcmh.test', 'nurse', { action: 'updateDailyNutrition', sessionId: 'NF-300001', entryId: saved.entryId,
    expectedLastModified: saved.lastModified, entry: Object.assign({}, entry, { ioInput: 120, calcInput: Object.assign({}, entry.calcInput, { ioInput: 120 }) }) });
  T.eq('the nurse\'s I/O save lands as a revision', [io.ok, io.revised], [true, true]);
  const out = g.sb.qiSubmitDays(g.sheet('Daily_Log').data, g.sheet('Patient_Registry').data, { from: D, to: D, now: new Date(at(D1, '01:00')) });
  T.eq('the summary reads the doctor\'s Submit (10:00), not the nurse\'s save (17:30), and nothing is revised',
    view(pick(out, D, 'ALL'), ['tpn_orders', 'last_submit', 'revised', 'after_cutoff', 'no_time']), [1, '10:00', 0, 0, 0]);
  const room = as(ms('18:00'), 'rx@kcmh.test', 'pharmacy', { action: 'pharmacyOrders', date: D });
  const ord = (room.orders || []).find(o => o.sessionId === 'NF-300001');
  T.eq('…and the TPN room\'s page reads the same Submit for that order', ord && ord.submittedAt, pub.publishedAt);
});

T.section('§4 a Submit after midnight', () => {
  const g = sandbox();
  g.pat('NF-1', { 10: 'NICU 3' }); g.pat('NF-2', { 10: 'NICU 4' });
  g.log(logRow(g, 'NF-1', D, { pub: at(D, '09:00') }));
  g.log(logRow(g, 'NF-2', D, { pub: at(D1, '00:30') }));            // D's order, submitted at 00:30 on D+1
  const r = pick(g.days(), D, 'ALL');
  T.eq('last "00:30 (+1)", 1470 minutes, next_day 1, after the cut-off 1 (09:00 is not)',
    view(r, ['last_submit', 'last_submit_min', 'next_day', 'after_cutoff']), ['00:30 (+1)', 1470, 1, 1]);
  T.eq('it stays on its own day: D+1 has no order', pick(g.days(), D1, 'ALL')?.[H.tpn_orders], 0);
  const g2 = sandbox();
  g2.pat('NF-3', { 10: 'NICU 5' }); g2.pat('NF-4', { 10: 'NICU 6' });
  g2.log(logRow(g2, 'NF-3', D, { pub: at(D, '23:59:59') }));
  g2.log(logRow(g2, 'NF-4', D, { pub: at(D1, '00:00:00') }));
  T.eq('23:59:59 is the same day; exactly midnight is the next: one next_day, last "00:00 (+1)"',
    view(pick(g2.days(), D, 'ALL'), ['next_day', 'last_submit', 'last_submit_min']), [1, '00:00 (+1)', 1440]);
});

T.section('§5 the ward at the moment of Submit', () => {
  const g = sandbox();
  // Left NICU 9 for SCN 4 at 12:00 on D.
  g.pat('NF-1', { 10: 'SCN 4', 15: JSON.stringify([{ bed: 'NICU 9', date: D, at: at(D, '12:00') }]) });
  g.log(logRow(g, 'NF-1', D, { pub: at(D, '09:00') }));
  g.log(logRow(g, 'NF-1', D1, { pub: at(D1, '09:00') }));
  const out = g.days();
  T.eq('D 09:00, before the move: NICU', [pick(out, D, 'NICU')?.[H.tpn_orders], pick(out, D, 'SCN')?.[H.tpn_orders]], [1, 0]);
  T.eq('D+1 09:00, after it: SCN', [pick(out, D1, 'NICU')?.[H.tpn_orders], pick(out, D1, 'SCN')?.[H.tpn_orders]], [0, 1]);
  // A hop from before `at` existed: taken as made at the end of its date.
  const g2 = sandbox();
  g2.pat('NF-2', { 10: 'SCN 1', 15: JSON.stringify([{ bed: 'NICU 2', date: D }]) });
  g2.log(logRow(g2, 'NF-2', D, { pub: at(D, '20:00') }));
  g2.log(logRow(g2, 'NF-2', D1, { pub: at(D1, '08:00') }));
  const o2 = g2.days();
  T.eq('a hop with only a date: that whole day in the old bed (NICU), the next in the new (SCN)',
    [pick(o2, D, 'NICU')?.[H.tpn_orders], pick(o2, D1, 'SCN')?.[H.tpn_orders]], [1, 1]);
  // Parked: no current bed, the last bed left (patientWard).
  const g3 = sandbox();
  g3.pat('NF-3', { 10: '', 15: JSON.stringify([{ bed: 'SCN 7', date: '2026-10-20', at: '2026-10-20T03:00:00.000Z' }]) });
  g3.log(logRow(g3, 'NF-3', D, { pub: at(D, '09:00') }));
  T.eq('parked after leaving SCN 7: SCN, as the ward list files it', pick(g3.days(), D, 'SCN')?.[H.tpn_orders], 1);
  T.eq('iso rooms are NICU\'s', (() => { const g4 = sandbox(); g4.pat('NF-4', { 10: 'iso 1' }); g4.log(logRow(g4, 'NF-4', D, { pub: at(D, '09:00') })); return pick(g4.days(), D, 'NICU')?.[H.tpn_orders]; })(), 1);
});

T.section('§6 no_time and the cut-off', () => {
  const g = sandbox();
  g.pat('NF-1', { 10: 'NICU 1' }); g.pat('NF-2', { 10: 'NICU 2' }); g.pat('NF-3', { 10: 'NICU 3' }); g.pat('NF-4', { 10: 'NICU 4' });
  g.log(logRow(g, 'NF-1', D, { pub: at(D, '13:59:59') }));
  g.log(logRow(g, 'NF-2', D, { pub: at(D, '14:00:59') }));
  g.log(logRow(g, 'NF-3', D, { pub: at(D, '14:01:00') }));
  g.log(logRow(g, 'NF-4', D, { pub: '', lm: at(D, '15:00') }));    // submitted, its lock never landed
  const r = pick(g.days(), D, 'ALL');
  T.eq('13:59:59 and 14:00:59 are not after 14:00, 14:01 is (by the minute shown)', r?.[H.after_cutoff], 1);
  T.eq('a submitted order with no Submit stamp: counted in tpn_orders and no_time, not in the times',
    view(r, ['tpn_orders', 'no_time', 'last_submit']), [4, 1, '14:01']);
  T.eq('seconds are dropped, never rounded up: 13:59:59 reads 13:59', r?.[H.first_submit], '13:59');
  T.eq('another cut-off for one run: 13:00 → all three after, and says so', view(pick(g.days({ cutoff: '13:00' }), D, 'ALL'), ['after_cutoff', 'cutoff']), [3, '13:00']);
  let threw = false;
  try { g.days({ cutoff: '25:00' }); } catch (e) { threw = /HH:MM/.test(e.message); }
  T.eq('a cut-off that is not a time is refused', threw, true);
  T.eq('the cut-off is 14:00 and the first day 2026-10-30 (release #201 live 2026-10-29 18:34)', [g.sb.QI_SUBMIT_CUTOFF, g.sb.QI_SUBMIT_FROM], ['14:00', '2026-10-30']);
});

T.section('§7 the tab', () => {
  const g = sandbox();
  g.pat('NF-1', { 10: 'NICU 3' });
  g.log(logRow(g, 'NF-1', '2026-11-16', { pub: at('2026-11-16', '09:10') }));
  g.log(logRow(g, 'NF-1', '2026-11-17', { pub: at('2026-11-17', '14:30') }));
  g.log(logRow(g, 'NF-1', '2026-11-18', { pub: at('2026-11-18', '08:00') }));   // today: not yet
  T.ok('no tab before the first run', !g.sheet('QI_SubmitTimes'));
  const now = Date.parse(at('2026-11-18', '01:30'));
  const res = withNow(now, () => g.sb.qiSubmitTimesRefresh());
  const sh = g.sheet('QI_SubmitTimes');
  T.ok('the run creates QI_SubmitTimes', !!sh);
  const rows = sh ? sh.data : [];
  T.eq('its header', rows[0], ['date', 'weekday', 'ward', 'tpn_orders', 'first_submit', 'last_submit', 'last_submit_min',
    'median_submit', 'after_cutoff', 'cutoff', 'revised', 'next_day', 'drafts', 'no_time', 'updated_at']);
  const days = [...new Set(rows.slice(1).map(r => r[0]))];
  T.eq('every day from 2026-10-30 to yesterday (2026-11-17), today left for tomorrow night', [days[0], days[days.length - 1], days.length], ['2026-10-30', '2026-11-17', 19]);
  T.eq('three rows a day with no "other"', rows.length - 1, 19 * 3);
  const r17 = rows.find(r => r[0] === '2026-11-17' && r[2] === 'ALL');
  T.eq('2026-11-17: 1 order at 14:30, after the cut-off', r17 && [r17[3], r17[5], r17[6], r17[8]], [1, '14:30', 870, 1]);
  T.eq('the reply counts, no rows', [res.ok, res.rows, res.orders], [true, 57, 2]);
  T.eq('the tab is 15 columns wide', sh && sh.maxColumns, 15);
  T.eq('times and dates are plain text, counts and minutes are numbers',
    sh && [sh.formats['2,1'], sh.formats['2,5'], sh.formats['2,6'], sh.formats['2,8'], sh.formats['2,4'], sh.formats['2,7'], sh.formats['2,9'], sh.formats['2,14']],
    ['@', '@', '@', '@', '0', '0', '0', '0']);
  const flat = rows.flat().map(String).join('|');
  T.eq('no patient field: no NeoFeed ID, entryId, e-mail, name or Thai text in the tab',
    [/NF-/.test(flat), /[0-9a-f]{8}-[0-9a-f]{4}-/.test(flat), /@/.test(flat), /[฀-๿]/.test(flat)], [false, false, false, false]);
  T.eq('the tab\'s name is not a log tab (NF-08 treats /log|audit/i as one)', /log|audit/i.test('QI_SubmitTimes'), false);
  withNow(now + 3600e3, () => g.sb.qiSubmitTimesRefresh());
  T.eq('a second run rewrites the tab whole: same rows, no duplicates', g.sheet('QI_SubmitTimes').data.length, rows.length);
  g.log(logRow(g, 'NF-1', '2026-11-17', { pub: at('2026-11-17', '20:00'), status: 'submitted' }));
  withNow(Date.parse(at('2026-11-19', '01:30')), () => g.sb.qiSubmitTimesNightly());
  const again = g.sheet('QI_SubmitTimes').data;
  T.eq('the nightly run takes the next day in and reads a row added since', [again.length - 1, again.find(r => r[0] === '2026-11-17' && r[2] === 'ALL')[5]], [20 * 3, '20:00']);
});

T.section('§8 out of doPost\'s reach; a schema fault throws first', () => {
  const g = sandbox();
  g.addStaff('adm@kcmh.test', 'admin', 'Admin-Password-1');
  const tok = g.session('adm@kcmh.test', 'admin');
  for (const action of ['qiSubmitTimesRefresh', 'qiSubmitTimesNightly', 'qiSubmitDays']) {
    const res = g.post({ token: tok, action });
    T.ok(`an admin's POST of "${action}" runs nothing`, !(res && res.ok) && !g.sheet('QI_SubmitTimes'), res);
  }
  const g2 = sandbox();
  g2.sheet('Daily_Log').data[0][33] = 'publishedAt';   // a header typed over by hand
  let threw = false;
  try { g2.sb.qiSubmitTimesNightly(); } catch (e) { threw = true; }
  T.eq('a Daily_Log header changed by hand: the nightly run throws (the trigger mails its owner), and writes no tab', [threw, !g2.sheet('QI_SubmitTimes')], [true, true]);
});

T.section('§9 Vera: the sticker column, and a grid past 1000 rows', () => {
  // A revision that differs only in its sticker figures (AM) is a new version to the TPN room.
  const g = sandbox();
  g.sheet('Daily_Log').maxColumns = 39;
  g.pat('NF-1', { 10: 'NICU 3' });
  const v1 = crypto.randomUUID(), v2 = crypto.randomUUID();
  g.log(logRow(g, 'NF-1', D, { id: v1, pub: at(D, '09:00'), sup: at(D, '15:00'), ci: { orderRev: 1, printJsonV: 1 },
    figures: { 38: JSON.stringify({ v: 1, preparedMl: 80 }) } }));
  g.log(logRow(g, 'NF-1', D, { id: v2, pub: at(D, '15:00'), rev: 2, of: v1, ci: { orderRev: 2, printJsonV: 2 },
    figures: { 38: JSON.stringify({ v: 2, preparedMl: 90 }) } }));
  withNow(Date.parse(at(D1, '01:30')), () => g.sb.qiSubmitTimesRefresh());
  const all = g.sheet('QI_SubmitTimes').data.find(r => r[0] === D && r[2] === 'ALL');
  T.eq('a sticker-only revision at 15:00: last 15:00, after the cut-off, revised (the run read AM)',
    all && [all[5], all[8], all[10]], ['15:00', 1, 1]);
  const room = withNow(Date.parse(at(D, '16:00')), () => g.sb.pharmacyOrders(D));
  T.eq('…the same Submit the TPN room\'s page reads for it', (room.orders || [])[0]?.submittedAt, at(D, '15:00'));
  // 1 header + 3 rows a day from 2026-10-30 to 2027-09-30 = 1009 rows on a 1000-row grid.
  const g2 = sandbox();
  g2.env.strictRows = true;
  g2.pat('NF-2', { 10: 'NICU 4' });
  g2.log(logRow(g2, 'NF-2', '2027-09-30', { pub: at('2027-09-30', '10:00') }));
  let err = '';
  try { withNow(Date.parse(at('2027-10-01', '01:30')), () => g2.sb.qiSubmitTimesRefresh()); } catch (e) { err = e.message; }
  const tab = g2.sheet('QI_SubmitTimes');
  T.eq('a year on, 1009 rows: the grid grows and the tab is written whole', [err, tab && tab.data.length], ['', 1009]);
  T.eq('…its last day is 2027-09-30, with the order', tab && tab.data[tab.data.length - 3].slice(0, 6), ['2027-09-30', 'Thu', 'ALL', 1, '10:00', '10:00']);
});

T.done();
