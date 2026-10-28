// verify-usage-log.cjs — NF-02, the usage tab. One Usage_Log row per
// completed calculation, with no patient field, and a weekly count per ward
// and calculation type for Pp to chart. A falling count means a ward went
// back to paper.
//
// What counts as one completed calculation: a TPN/EN order that reaches
// "submitted" for the first time, by a new order saved as submitted or by a
// draft saved again as submitted. Not a draft, an edit of a submitted order, a
// Submit lock, a revision, a print (it needs that saved order first), a sync,
// a nursing I/O entry or the quick calc (which sends nothing to the backend).
// The rule is decided under the script lock by what the save itself sees, so a
// request fired twice writes one row: the second create is DuplicateDate and
// the second promotion finds the order already submitted.
//
//   §1  The tab is created on the first completed calculation, never by a read,
//       at exactly 4 columns (ts | week | ward | type), and the save's reply to
//       the ward is unchanged.
//   §2  ward = the ward list the infant is on (data.js patientWard: the bed's
//       ward, or a parked infant's last bed), type = the order's route family.
//   §3  What is not a completed calculation, and a request fired twice.
//   §4  No patient field: no sessionId, entryId, bed, name, initials, weight,
//       date of birth or email, nothing a formula, and erasure has nothing to
//       reach.
//   §5  Never blocks or slows a save: written after the script lock is
//       released, and any failure is swallowed and noted in the execution log.
//   §6  usageWeekly(): ISO weeks cut in ward time, every ward and type present,
//       empty weeks filled with 0 up to this week, extra columns ignored (room
//       for NF-31); with a span of 12, the Admin page's last 12 weeks.
//   §7  doPost getUsageWeekly (2026-10-28, Pp: "ได้" to the Admin chart): admin
//       only, refused like the other admin-only actions before the tab is
//       read; counts only; the last 12 weeks; writes nothing.
//   §8  getUsageWeekly() from the editor: it reads, never creates the tab, and
//       logs a table with no identifier.
//
// Synthetic patients only. No npm dependencies (gas-vm-sandbox.cjs).
//
// NEGATIVE CONTROL — red against the backend before NF-02:
//   git show 326bcd9:gas-backend.gs > /tmp/gas-326bcd9.gs
//   NEOFEED_GAS_SRC=/tmp/gas-326bcd9.gs node test/verify-usage-log.cjs
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { boot, recorder, withNow, wardToday, addDays } = require('./gas-vm-sandbox.cjs');
const T = recorder('USAGE LOG (NF-02)');

const TODAY = wardToday();
const USAGE_HEADER = ['ts', 'week', 'ward', 'type'];
const WARDS = ['NICU', 'SCN', 'other'];
const TYPES = ['TPN', 'EN', 'NPO', 'other'];
const E = (extra) => Object.assign({ dol: 5, weight: 1250, fluid: 150, gir: 6, pro: 3, kcal: 90,
  na: 3, k: 2, ca: 60, p: 40, enVolPerKg: 20, route: 'TPN central', status: 'submitted',
  calcInput: { wtG: 1250 }, ts: TODAY }, extra || {});
const wardDay = (ms) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10);

// Six synthetic infants, one per way the ward list files a patient.
const PATIENTS = {
  'NF-100001': { bed: 'NICU 3', want: 'NICU' },
  'NF-100002': { bed: 'SCN 12', want: 'SCN' },
  'NF-100003': { bed: 'iso 2-1', want: 'NICU' },     // the iso rooms are NICU's
  'NF-100004': { bed: '', want: 'other' },           // no bed, never had one
  'NF-100005': { bed: '', history: [{ bed: 'NICU 7', date: '2026-10-20' }, { bed: 'SCN 4', date: '2026-10-27' }], want: 'SCN' },  // parked
  'NF-100006': { bed: 'OR 1', want: 'other' },       // free text typed into the sheet
};
function ward(opts, { nursing = false } = {}) {
  const g = boot(opts);
  if (nursing) g.props.set('NURSING_LOG_ENABLED', 'true');
  g.addStaff('doc@kcmh.test', 'doctor', 'Doctor-Password-1');
  g.addStaff('nur@kcmh.test', 'nurse', 'Nurse-Password-1');
  g.addStaff('adm@kcmh.test', 'admin', 'Admin-Password-1');
  g.dt = g.session('doc@kcmh.test', 'doctor');
  g.nt = g.session('nur@kcmh.test', 'nurse');
  g.at = g.session('adm@kcmh.test', 'admin');
  g.as = (tok, body) => g.post(Object.assign({ token: tok }, body));
  for (const [sid, p] of Object.entries(PATIENTS)) {
    g.sheet('Patient_Registry').data.push(g.patRow(sid, {
      1: 'เด็กหญิง สมมุติ ' + sid.slice(-1), 2: 'ส.ม.', 10: p.bed, 15: JSON.stringify(p.history || []),
    }));
  }
  g.save = (sid, extra, tok) => g.as(tok || g.dt, { action: 'logDailyNutrition', sessionId: sid, entry: E(extra) });
  g.update = (sid, c, extra, tok) => g.as(tok || g.dt, { action: 'updateDailyNutrition', sessionId: sid,
    entryId: c.entryId, expectedLastModified: c.lastModified, entry: E(extra) });
  return g;
}
const usage = (g) => (g.sheet('Usage_Log') ? g.rows('Usage_Log') : []);

// ════════════════════════════════════════════════════════════════════════
T.section('§1 The tab is made by the first completed calculation, 4 columns wide', () => {
  const g = ward();
  T.ok('no Usage_Log before anything is saved', !g.sheet('Usage_Log'));
  for (let i = 0; i < 3; i++) g.as(g.dt, { action: 'getActivePatients' });
  T.ok('three syncs create no Usage_Log (a read never makes the tab)', !g.sheet('Usage_Log'));

  const ms = Date.parse('2026-10-28T02:00:00.000Z');          // Wed 28 Oct, 09:00 in Bangkok
  const c = withNow(ms, () => g.as(g.session('doc@kcmh.test', 'doctor'), {
    action: 'logDailyNutrition', sessionId: 'NF-100001', entry: E({ ts: wardDay(ms) }) }));
  T.ok('the order saved', !!c.entryId, c);
  T.eq('the reply to the ward is unchanged: ok, entryId, lastModified', Object.keys(c).sort(), ['entryId', 'lastModified', 'ok']);
  const sh = g.sheet('Usage_Log');
  T.ok('Usage_Log now exists', !!sh);
  T.eq('its header is ts | week | ward | type', sh && sh.data[0], USAGE_HEADER);
  T.eq('trimmed to 4 columns (insertSheet makes 26, and empty cells count against the 10 M-cell cap)', sh && sh.getMaxColumns(), 4);
  T.eq('one row', usage(g).length, 1);
  T.eq('the row: the save\'s instant, its ISO week in ward time, the ward, the type',
    usage(g)[0], ['2026-10-28T02:00:00.000Z', '2026-W44', 'NICU', 'TPN']);

  // Mon 26 Oct 06:00 in Bangkok is Sun 25 Oct 23:00 UTC: a morning round
  // belongs to Monday's week, not the week before.
  const mon = Date.parse('2026-10-25T23:00:00.000Z');
  withNow(mon, () => g.as(g.session('doc@kcmh.test', 'doctor'), {
    action: 'logDailyNutrition', sessionId: 'NF-100002', entry: E({ ts: wardDay(mon) }) }));
  T.eq('a Monday 06:00 round is filed under Monday\'s week (W44), not Sunday\'s', usage(g)[1] && usage(g)[1][1], '2026-W44');
  const sun = Date.parse('2026-10-25T16:00:00.000Z');          // Sun 25 Oct 23:00 in Bangkok
  withNow(sun, () => g.as(g.session('doc@kcmh.test', 'doctor'), {
    action: 'logDailyNutrition', sessionId: 'NF-100003', entry: E({ ts: wardDay(sun) }) }));
  T.eq('a Sunday 23:00 night order stays in Sunday\'s week (W43)', usage(g)[2] && usage(g)[2][1], '2026-W43');
  T.eq('a second write does not re-create the tab or the header', [sh.data[0], g.sheet('Usage_Log') === sh], [USAGE_HEADER, true]);
});

// ════════════════════════════════════════════════════════════════════════
T.section('§2 ward = the ward list the infant is on, type = the order\'s route family', () => {
  const g = ward();
  for (const [sid, p] of Object.entries(PATIENTS)) {
    const c = g.save(sid);
    T.ok(`${sid} saved`, !!c.entryId, c);
    const row = usage(g)[usage(g).length - 1] || [];
    T.eq(`bed "${p.bed}"${p.history ? ' (parked, last bed SCN 4)' : ''} → ${p.want}`, row[2], p.want);
  }
  const routes = [['TPN central', 'TPN'], ['TPN peripheral', 'TPN'], ['TPN', 'TPN'], ['Enteral only', 'EN'],
    ['NPO', 'NPO'], ['', 'other'], ['=HYPERLINK("http://x.test","y")', 'other']];
  routes.forEach(([route, want], k) => {
    const c = g.save('NF-100001', { route, ts: addDays(TODAY, -(k + 1)) });
    T.ok(`route "${route}" saved`, !!c.entryId, c);
    T.eq(`route "${route}" → type ${want}`, (usage(g)[usage(g).length - 1] || [])[3], want);
  });

  // The backend mirrors data.js patientWard(); the two must never disagree.
  const ctx = { window: {}, console };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'data.js'), 'utf8'), ctx);
  const D = ctx.window.NEOFEED_DATA;
  const beds = [...D.BED_OPTIONS, 'nicu-3', ' SCN  2 ', 'NICU 1-1', 'ISO 3-4', 'iso1-2', 'scn', 'NICU', 'SCN-30',
    'SCNX 1', 'OR', 'ห้องคลอด', '', null, undefined, 12];
  const histories = [[], [{ bed: 'NICU 2' }, { bed: '' }], [{ bed: 'SCN 1' }, { bed: 'NICU 4' }], [{ bed: 'xyz' }],
    [null, 'SCN 3', { bed: ' scn-9 ' }], undefined];
  let agree = 0, first = null;
  for (const bed of beds) for (const h of histories) {
    const got = g.sb._usageWardOf(bed, h);
    const want = D.patientWard({ currentBed: bed, bedHistory: h });
    if (got === want) agree++; else if (!first) first = { bed, h, got, want };
  }
  T.eq(`_usageWardOf agrees with data.js patientWard on all ${beds.length * histories.length} bed × history cases`,
    first, null);
});

// ════════════════════════════════════════════════════════════════════════
T.section('§3 Not a completed calculation, and a request fired twice', () => {
  const g = ward({}, { nursing: true });
  // One clock second per save: two saves in the same millisecond share a
  // lastModified, and the stale retry below would then not be stale.
  let clock = Date.now();
  const step = (fn) => withNow(clock += 1000, fn);
  const d = step(() => g.save('NF-100001', { status: 'draft' }));
  T.ok('a draft saved', !!d.entryId, d);
  T.eq('a draft writes no row (it can neither print nor count)', usage(g).length, 0);
  const d2 = step(() => g.update('NF-100001', d, { status: 'draft', fluid: 140 }));
  T.eq('a draft edited and kept a draft: still no row', [d2.ok, usage(g).length], [true, 0]);
  const s = step(() => g.update('NF-100001', { entryId: d.entryId, lastModified: d2.lastModified }, { status: 'submitted' }));
  T.eq('the draft saved as submitted: one row', [s.ok, usage(g).length], [true, 1]);
  T.eq('the promotion\'s reply to the ward is unchanged', Object.keys(s).sort(), ['lastModified', 'ok']);
  const again = step(() => g.update('NF-100001', { entryId: d.entryId, lastModified: s.lastModified }, { status: 'submitted' }));
  T.eq('the same promotion fired twice: the second finds it submitted, no second row', [again.ok, usage(g).length], [true, 1]);
  const stale = step(() => g.update('NF-100001', { entryId: d.entryId, lastModified: d2.lastModified }, { status: 'submitted' }));
  T.eq('a stale retry is a conflict and writes nothing', [stale.conflict, usage(g).length], [true, 1]);
  const edit = step(() => g.update('NF-100001', { entryId: d.entryId, lastModified: again.lastModified }, { status: 'submitted', fluid: 160 }));
  T.eq('an edit of a submitted order is the same calculation: no row', [edit.ok, usage(g).length], [true, 1]);

  const c = g.save('NF-100002');
  T.eq('a new order saved as submitted: one row', [!!c.entryId, usage(g).length], [true, 2]);
  const dup = g.save('NF-100002');
  T.eq('the same create fired twice: DuplicateDate, no second row', [dup.code, usage(g).length], ['DuplicateDate', 2]);
  const pub = g.as(g.at, { action: 'publishLog', sessionId: 'NF-100002', entryId: c.entryId, expectedLastModified: c.lastModified });
  T.eq('Submit (the publish lock) writes no row', [pub.ok, usage(g).length], [true, 2]);
  const rev = g.update('NF-100002', { entryId: c.entryId, lastModified: g.rows('Daily_Log').find(r => r[25] === c.entryId)[26] }, { fluid: 120 });
  T.eq('an edit of a published order appends a revision, and writes no row', [rev.revised, usage(g).length], [true, 2]);

  const bad = g.save('NF-100003', { weight: 20 });
  T.eq('a save refused on validation writes no row', [!!bad.error, usage(g).length], [true, 2]);
  const ghost = g.save('NF-999999');
  T.eq('a save for an unregistered sessionId writes no row', [!!ghost.error, usage(g).length], [true, 2]);
  const nurse = g.save('NF-100003', {}, g.nt);
  T.eq('a nurse\'s order save, refused while nursing I/O is on, writes no row', [nurse.code, usage(g).length], ['Forbidden', 2]);
  const io = g.as(g.nt, { action: 'logNursingEntry', sessionId: 'NF-100003', entry: { ts: TODAY, ivInMl: 100, urineMl: 60, appVersion: 'test' } });
  T.eq('a nursing I/O entry is not a calculation: no row', [io.ok, usage(g).length], [true, 2]);
  g.env.lockTimeout = true;
  const busy = g.save('NF-100004');
  g.env.lockTimeout = false;
  T.eq('a save refused as Busy writes no row', [busy.code, usage(g).length], ['Busy', 2]);
  for (let i = 0; i < 5; i++) g.as(g.dt, { action: 'getActivePatients' });
  T.eq('syncs write no row', usage(g).length, 2);
});

// ════════════════════════════════════════════════════════════════════════
T.section('§4 No patient field in a usage row', () => {
  const g = ward();
  const ids = [];
  for (const sid of Object.keys(PATIENTS)) {
    const c = g.save(sid, { route: sid.endsWith('2') ? 'Enteral only' : 'TPN peripheral' });
    ids.push(c.entryId);
  }
  const rows = usage(g);
  T.eq('six orders, six rows', rows.length, 6);
  T.ok('every row is exactly ts | week | ward | type', rows.every(r => r.length === 4), rows);
  T.ok('ts is an ISO instant', rows.every(r => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r[0])), rows.map(r => r[0]));
  T.ok('week is an ISO week key', rows.every(r => /^\d{4}-W\d{2}$/.test(r[1])), rows.map(r => r[1]));
  T.ok('ward is one of NICU, SCN, other', rows.every(r => WARDS.includes(r[2])), rows.map(r => r[2]));
  T.ok('type is one of TPN, EN, NPO, other', rows.every(r => TYPES.includes(r[3])), rows.map(r => r[3]));
  const text = JSON.stringify(g.sheet('Usage_Log').data);
  const forbidden = [...Object.keys(PATIENTS), ...ids, 'NICU 3', 'SCN 12', 'iso 2-1', 'SCN 4', 'OR 1', 'สมมุติ', 'ส.ม.',
    '1250', '1200', 'doc@kcmh.test', '@', 'boys'];
  T.eq('no sessionId, entryId, bed, name, initials, weight, sex or email anywhere in the tab',
    forbidden.filter(s => text.includes(s)), []);
  const dob = g.rows('Patient_Registry')[0][6];
  T.ok('no date of birth either (the rows carry no date-only cell at all)', !rows.some(r => r.some(v => v instanceof Date)) &&
    !text.includes(new Date(dob.getTime() + 7 * 3600e3).toISOString().slice(0, 10)), rows);
  T.eq('nothing written to Usage_Log is a live formula', g.env.injections.filter(x => x.sheet === 'Usage_Log'), []);

  // Erasure: no row points at an infant, so neither path has anything to reach.
  const before = JSON.stringify(g.sheet('Usage_Log').data);
  const ps = g.as(g.at, { action: 'pseudonymizePatient', sessionId: 'NF-100001' });
  const del = g.as(g.at, { action: 'deletePatient', sessionId: 'NF-100002' });
  T.ok('pseudonymize and delete ran', ps.ok === true && del.ok === true, { ps, del });
  T.eq('…and Usage_Log is exactly as it was: a count of past work, linked to nobody', JSON.stringify(g.sheet('Usage_Log').data), before);
});

// ════════════════════════════════════════════════════════════════════════
T.section('§5 A usage row never blocks or slows a save', () => {
  {
    const g = ward();
    g.env.sheets.Usage_Log = g.makeSheet('Usage_Log', [USAGE_HEADER], { maxColumns: 4 });
    const heldAt = { log: [], usage: [] };
    g.sheet('Daily_Log').hooks.beforeWrite = () => heldAt.log.push(g.env.lockHeld);
    g.sheet('Usage_Log').hooks.beforeWrite = () => heldAt.usage.push(g.env.lockHeld);
    g.save('NF-100001');
    T.eq('the order is written inside the script lock', heldAt.log, [1]);
    T.eq('the usage row is written after the lock is released, so no other save queues behind it', heldAt.usage, [0]);
    const d = g.save('NF-100002', { status: 'draft' });
    heldAt.usage.length = 0;
    g.update('NF-100002', d, { status: 'submitted' });
    T.eq('…on the draft-promotion path too', heldAt.usage, [0]);
  }
  const failing = [
    ['Usage_Log appendRow throws', (g) => {
      g.env.sheets.Usage_Log = g.makeSheet('Usage_Log', [USAGE_HEADER], { maxColumns: 4 });
      g.sheet('Usage_Log').throwOn.appendRow = { err: new Error('Service Spreadsheets timed out while accessing document with id x.') };
    }],
    ['the tab cannot be created', (g) => {
      const ss = g.sb.SpreadsheetApp.openById();
      const real = ss.insertSheet;
      ss.insertSheet = (n) => { if (n === 'Usage_Log') throw new Error('Service Spreadsheets failed while accessing document with id x.'); return real(n); };
    }],
    // Armed by each Daily_Log write, it fails the next registry read once: the
    // ward lookup that follows a completed order, not the next save's own check.
    ['the registry read for the ward fails after the order is written', (g) => {
      let armed = false;
      g.sheet('Daily_Log').hooks.beforeWrite = () => { armed = true; };
      g.sheet('Patient_Registry').hooks.beforeRead = () => {
        if (armed) { armed = false; throw new Error('Service Spreadsheets timed out while accessing document with id x.'); }
      };
    }],
  ];
  for (const [label, arm] of failing) {
    const g = ward();
    arm(g);
    const c = g.save('NF-100001');
    T.ok(`${label}: the save still succeeds with its entryId`, c.ok === true && !!c.entryId && !c.error, c);
    T.ok(`${label}: the order is in Daily_Log`, g.rows('Daily_Log').some(r => r[25] === c.entryId));
    T.eq(`${label}: the reply carries nothing about it`, Object.keys(c).sort(), ['entryId', 'lastModified', 'ok']);
    T.ok(`${label}: noted in the execution log`, g.env.logs.some(l => /Usage_Log/.test(l) && /NF-02/.test(l)), g.env.logs);
    T.ok(`${label}: …with no sessionId in the note`, !g.env.logs.some(l => /Usage_Log/.test(l) && l.includes('NF-100001')), g.env.logs);
    const d = g.save('NF-100002', { status: 'draft' });
    const s = g.update('NF-100002', d, { status: 'submitted' });
    T.ok(`${label}: a draft promotion still succeeds`, s.ok === true && !s.error, s);
  }
});

// ════════════════════════════════════════════════════════════════════════
T.section('§6 usageWeekly(): weekly counts per ward and type', () => {
  const g = ward();
  const uw = g.sb.usageWeekly;
  T.ok('usageWeekly is defined', typeof uw === 'function');
  if (typeof uw !== 'function') return;
  const H = USAGE_HEADER;
  const row = (ts, wardName, type, extra) => [ts, 'ignored', wardName, type].concat(extra || []);
  T.eq('no rows: no weeks', uw([], Date.parse('2026-10-28T02:00:00Z')).weeks, []);
  T.eq('header only: no weeks', uw([H], Date.parse('2026-10-28T02:00:00Z')).weeks, []);

  const rows = [H,
    row('2026-10-19T02:00:00.000Z', 'NICU', 'TPN'),               // W43
    row(new Date('2026-10-20T03:00:00.000Z'), 'NICU', 'EN'),     // W43, a Date object as Sheets may hand back
    row('2026-10-21T04:00:00.000Z', 'SCN', 'TPN'),               // W43
    row('2026-10-25T23:00:00.000Z', 'SCN', 'NPO'),               // Mon 06:00 Bangkok → W44
    row('2026-11-05T02:00:00.000Z', 'Ward 9', 'TPN'),            // W45, a ward not on the list
    row('2026-11-05T02:30:00.000Z', 'NICU', 'quick'),            // W45, a type not on the list
    row('not a time', 'NICU', 'TPN'),                           // unplaceable
    row('', 'NICU', 'TPN'),
    row('2026-11-06T02:00:00.000Z', 'NICU', 'TPN', ['5c1f…']),   // a fifth column (NF-31 later) is ignored
  ];
  const now = Date.parse('2026-11-18T02:00:00.000Z');             // W47
  const out = uw(rows, now);
  T.eq('weeks run from the first row\'s week to this week, empty ones included', out.weeks.map(w => w.week),
    ['2026-W43', '2026-W44', '2026-W45', '2026-W46', '2026-W47']);
  T.eq('each week names its Monday (ward time)', out.weeks.map(w => w.weekStart),
    ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']);
  T.eq('totals per week', out.weeks.map(w => w.total), [3, 1, 3, 0, 0]);
  T.eq('W43 by ward', Object.fromEntries(WARDS.map(k => [k, out.weeks[0].byWard[k].total])), { NICU: 2, SCN: 1, other: 0 });
  T.eq('W43 NICU by type', out.weeks[0].byWard.NICU, { total: 2, TPN: 1, EN: 1, NPO: 0, other: 0 });
  T.eq('a Monday 06:00 row is in Monday\'s week', out.weeks[1].byWard.SCN.NPO, 1);
  T.eq('a ward not on the list counts under other', out.weeks[2].byWard.other.TPN, 1);
  T.eq('a type not on the list counts under other', out.weeks[2].byWard.NICU.other, 1);
  T.eq('an empty week reads 0 for every ward and type, never a gap', out.weeks[3].byWard,
    Object.fromEntries(WARDS.map(k => [k, { total: 0, TPN: 0, EN: 0, NPO: 0, other: 0 }])));
  T.eq('rows without a usable ts are skipped and counted as skipped', [out.rowsScanned, out.rowsSkipped], [9, 2]);
  T.eq('the ward and type lists come with the result', [out.wards, out.types], [WARDS, TYPES]);
  T.eq('the week column is not trusted: weeks come from ts', uw([H, ['2026-10-19T02:00:00.000Z', '2031-W01', 'NICU', 'TPN']],
    Date.parse('2026-10-19T03:00:00Z')).weeks.map(w => w.week), ['2026-W43']);
  T.eq('a row after `now` (a skewed clock) still shows, the range stretches to it', uw([H, row('2026-10-29T02:00:00.000Z', 'NICU', 'TPN')],
    Date.parse('2026-10-19T03:00:00Z')).weeks.map(w => w.week), ['2026-W44']);

  // 2026 has 53 ISO weeks; the fill must cross the year without a gap.
  const yr = uw([H, row('2026-12-21T03:00:00.000Z', 'SCN', 'TPN'), row('2027-01-05T03:00:00.000Z', 'SCN', 'TPN')],
    Date.parse('2027-01-05T04:00:00.000Z'));
  T.eq('the fill crosses the year: W52, W53, then 2027-W01', yr.weeks.map(w => [w.week, w.weekStart, w.total]),
    [['2026-W52', '2026-12-21', 1], ['2026-W53', '2026-12-28', 0], ['2027-W01', '2027-01-04', 1]]);

  // The Admin page's window: usageWeekly(rows, now, 12).
  const now44 = Date.parse('2026-10-28T02:00:00.000Z');           // W44
  const weekly = [H];
  for (let k = 0; k < 20; k++) weekly.push(row(new Date(now44 - k * 7 * 86400000).toISOString(), 'NICU', 'TPN'));
  const last12 = uw(weekly, now44, 12);
  T.eq('span 12: exactly the 12 weeks ending this week', [last12.weeks.length, last12.weeks[0].week, last12.weeks[11].week],
    [12, '2026-W33', '2026-W44']);
  T.eq('span 12: each of those weeks keeps its own count, older rows are left out', last12.weeks.map(w => w.total), Array(12).fill(1));
  T.eq('span 12 since a recent first row: from that row\'s week, no zeros before it',
    uw([H, row('2026-10-07T02:00:00.000Z', 'SCN', 'EN')], now44, 12).weeks.map(w => [w.week, w.total]),
    [['2026-W41', 1], ['2026-W42', 0], ['2026-W43', 0], ['2026-W44', 0]]);
  T.eq('span 12 when the only rows are older: 12 weeks of 0 (a ward that stopped), not an empty chart',
    uw([H, row('2026-05-20T02:00:00.000Z', 'NICU', 'TPN')], now44, 12).weeks.map(w => w.total), Array(12).fill(0));
  T.eq('span 12: a row after this week (a skewed clock) is left out, the window still ends now',
    uw([H, row('2026-10-27T02:00:00.000Z', 'NICU', 'TPN'), row('2026-11-20T02:00:00.000Z', 'NICU', 'TPN')], now44, 12)
      .weeks.map(w => [w.week, w.total]), [['2026-W44', 1]]);
  T.eq('span 12 with no rows: no weeks', uw([H], now44, 12).weeks, []);
});

// ════════════════════════════════════════════════════════════════════════
T.section('§7 doPost getUsageWeekly: admin only, counts only, the last 12 weeks', () => {
  const g = ward();
  const usageReads = () => (g.sheet('Usage_Log') ? g.sheet('Usage_Log').stats.rangeReads : 0);
  const none = g.post({ action: 'getUsageWeekly' });
  T.eq('no token: Unauthorized, like every signed-in action', none.error, 'Unauthorized');
  const forbidden = g.as(g.dt, { action: 'pseudonymizePatient', sessionId: 'NF-100001' });
  for (const [who, tok] of [['a doctor', g.dt], ['a nurse', g.nt]]) {
    const r = g.as(tok, { action: 'getUsageWeekly' });
    T.eq(`${who} gets the same refusal as the other admin-only actions`, r, forbidden);
  }
  T.eq('…and the refusal happens before the tab is read', usageReads(), 0);
  const empty = g.as(g.at, { action: 'getUsageWeekly' });
  T.eq('an admin before the first completed calculation: no weeks', [empty.ok, empty.weeks], [true, []]);
  T.ok('…and asking did not create the tab', !g.sheet('Usage_Log'));

  // Twenty weeks of synthetic rows, one a week, the newest this week.
  g.env.sheets.Usage_Log = g.makeSheet('Usage_Log', [USAGE_HEADER], { maxColumns: 4 });
  const now = Date.now();
  for (let k = 0; k < 20; k++) g.sheet('Usage_Log').data.push([new Date(now - k * 7 * 86400000).toISOString(), '', k % 2 ? 'SCN' : 'NICU', 'TPN']);
  g.save('NF-100001');
  g.save('NF-100002', { route: 'Enteral only' });
  const before = JSON.stringify([g.sheet('Usage_Log').data, g.sheet('Audit_Log').data]);
  const r = g.as(g.at, { action: 'getUsageWeekly' });
  T.eq('the reply carries ok, weeks, wards and types, nothing else', Object.keys(r).sort(), ['ok', 'types', 'wards', 'weeks']);
  T.eq('12 weeks, ending this week', [r.weeks.length, r.weeks[11] && r.weeks[11].week],
    [12, g.sb._isoWeekKeyLocal_(now)]);
  T.eq('each week: week, weekStart, total, byWard', [...new Set(r.weeks.map(w => Object.keys(w).sort().join()))],
    ['byWard,total,week,weekStart']);
  T.eq('the same counts as usageWeekly(tab, now, 12)', JSON.stringify(r.weeks),
    JSON.stringify(g.sb.usageWeekly(g.sheet('Usage_Log').data.map(x => x.slice()), now, 12).weeks));
  T.eq('this week: the two orders saved here plus the synthetic row', r.weeks[11].byWard.NICU.TPN + r.weeks[11].byWard.SCN.EN, 3);
  T.ok('every count is a whole number', r.weeks.every(w => Number.isInteger(w.total) &&
    Object.values(w.byWard).every(c => Object.values(c).every(Number.isInteger))));
  const text = JSON.stringify(r);
  T.eq('no email, sessionId, entryId, bed or name in the reply',
    ['@', ...Object.keys(PATIENTS), ...g.rows('Daily_Log').map(x => x[25]), 'NICU 3', 'SCN 12', 'สมมุติ'].filter(s => text.includes(s)), []);
  T.eq('reading writes nothing: Usage_Log and Audit_Log as they were', JSON.stringify([g.sheet('Usage_Log').data, g.sheet('Audit_Log').data]), before);
});

// ════════════════════════════════════════════════════════════════════════
T.section('§8 getUsageWeekly() from the editor: reads only, logs a table', () => {
  const g = ward();
  T.ok('getUsageWeekly is defined', typeof g.sb.getUsageWeekly === 'function');
  if (typeof g.sb.getUsageWeekly !== 'function') return;
  const empty = g.sb.getUsageWeekly();
  T.eq('no tab yet: no weeks', empty.weeks, []);
  T.ok('…and the read did not create the tab', !g.sheet('Usage_Log'));
  g.save('NF-100001');
  g.save('NF-100002', { route: 'Enteral only' });
  g.env.logs.length = 0;
  const out = g.sb.getUsageWeekly();
  const thisWeek = out.weeks[out.weeks.length - 1];
  T.eq('this week: NICU 1 TPN, SCN 1 EN', [thisWeek.byWard.NICU.TPN, thisWeek.byWard.SCN.EN, thisWeek.total], [1, 1, 2]);
  T.eq('the same as usageWeekly() over the tab', JSON.stringify(out),
    JSON.stringify(g.sb.usageWeekly(g.sheet('Usage_Log').data.map(r => r.slice()), Date.now())));
  const table = g.env.logs.join('\n');
  T.ok('a weekly table is written to the execution log', /NICU/.test(table) && /SCN/.test(table) && table.includes(thisWeek.week), g.env.logs);
  T.ok('…with no sessionId or email in it', !/NF-1000|@/.test(table), table);
});

T.done();
