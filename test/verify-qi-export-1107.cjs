// verify-qi-export-1107.cjs — the QI export is pseudonymized inside Apps Script,
// so a patient name never has to reach a PC (Pp's option A, 2026-11-07;
// openspec/changes/qi-export/).
//
//   §1  setupQiExportKey makes one high-entropy key per project, keeps an
//       existing one, and the secret appears in no return value, log or sheet
//   §2  no key → no export; codes are HMAC-SHA256 of kind\0value, recomputed
//       here with Node's crypto; another project gives other codes
//   §3  the export holds no name, initials, dob, sessionId (legacy included),
//       entryId, e-mail, Thai text, calendar date or UUID, on synthetic data
//   §4  each column is what the design table says: days from admission,
//       Bangkok HH:MM, age at admission, bands, unit, C01… in release order,
//       revision links, the calc whitelist, the print critical counts
//   §5  left out: an erased infant's orders and an order with no registry row
//   §6  the tab: trimmed to its rows and columns, rewritten whole, strings
//       kept as text, no formula
//   §7  a shifted source header stops the export; a leaked identifier stops
//       the write (the scan, with the redaction switched off)
//   §8  audit rows and lookupResearchId; QI rows are not product usage
//   §9  doPost has no route to any of it
//
// Synthetic infants only. Run: node test/verify-qi-export-1107.cjs
//
// ── NEGATIVE CONTROL ───────────────────────────────────────────────────────
//   git show 6c7f608:gas-backend.gs > old.gs
//   NEOFEED_GAS_SRC=old.gs node test/verify-qi-export-1107.cjs
// fails every section: that backend has no QI functions.
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const crypto = require('crypto');
const { boot, recorder, bkkMidnight } = require('./gas-vm-sandbox.cjs');
const T = recorder('QI EXPORT 2026-11-07');

const THAI = new RegExp('[' + String.fromCharCode(0x0E00) + '-' + String.fromCharCode(0x0E7F) + ']');
const HEADER = ['research_id', 'sex', 'ga_wk', 'bw_band_g', 'age_at_admit_d', 'is_multiple', 'pat_status', 'status_day',
  'unit_current', 'diagnosis', 'pn_indication', 'liver_dysfunction', 'renal_dysfunction',
  'entry', 'revision_of', 'revisionNumber', 'day', 'dol', 'weight', 'fluid', 'gir', 'pro', 'kcal', 'na', 'k', 'ca', 'p',
  'enVolPerKg', 'route', 'status', 'staff', 'suppMTV', 'suppVitD_IU', 'suppCa_mg', 'suppCaType', 'suppPO4_mmol',
  'suppPO4Type', 'suppFe_mg', 'suppFeType', 'ioInput', 'ioOutput', 'drainContent', 'constants_v',
  'last_modified_day', 'last_modified_time', 'last_modified_by', 'published_day', 'published_time', 'published_by',
  'superseded_day', 'superseded_time', 'calc', 'print'];

const NAMES = ['ทารก ปกป้อง', 'Somchai Example', 'เด็กหญิง ทดสอบ', 'Erased Baby Zed'];
const SIDS = { A: 'PK1250A', B: 'NF-482913', C: 'NF-100200', D: 'NF-777777', X: 'NF-000999' };
const E = { a1: crypto.randomUUID(), a2: crypto.randomUUID(), a3: crypto.randomUUID(), b1: crypto.randomUUID(),
  c1: crypto.randomUUID(), d1: crypto.randomUUID(), x1: crypto.randomUUID() };
const NURSE = 'nurse.a@kcmh.test', DOC = 'doc.b@kcmh.test';

function printJson(cv, orderDate, critical) {
  return JSON.stringify({ v: 1, constantsVersion: cv, orderDate, dol: '5', dosingWeightKg: '1.25', factor: '1.2',
    deliveredMl: '150', deadMl: '30', preparedMl: '180', stockMl: { d50w: '10' }, delivered: { kcal: '80' }, critical });
}

// A ward of synthetic infants: a legacy id, an ASCII name echoed in the
// diagnosis, a Thai diagnosis, a PDPA-erased infant, and an order whose infant
// is not in the registry.
function ward(opts) {
  opts = opts || {};
  const g = boot();
  g.env.strictRows = true;
  const pat = g.sheet('Patient_Registry').data;
  const r = (sid, f) => { const row = g.patRow(sid, f); while (row.length < 21) row.push(''); return row; };
  const A = r(SIDS.A, { 1: NAMES[0], 2: 'PK', 3: 1250, 4: 30.4, 5: 'girls', 6: bkkMidnight('2026-08-30'), 7: bkkMidnight('2026-09-01'),
    8: 'A', 10: 'NICU 3', 11: 'RDS, PDA', 15: JSON.stringify([{ bed: 'SCN 1', date: '2026-09-03', at: '2026-09-03T02:00:00.000Z' }]), 17: 2 });
  const B = r(SIDS.B, { 1: NAMES[1], 2: 'SE', 3: 900, 4: 26.0, 5: 'boys', 6: '2026-10-01', 7: '2026-10-01', 9: 'Discharged',
    10: 'SCN 2', 11: 'Sepsis; phone Somchai Example at 0812345678', 16: '2026-10-20' });
  const C = r(SIDS.C, { 1: NAMES[2], 2: 'DT', 3: 2010, 4: 35.9, 5: 'girls', 6: bkkMidnight('2026-10-25'), 7: bkkMidnight('2026-10-28'),
    10: 'iso 2', 11: 'ภาวะหายใจลำบาก', 18: 'Prematurity', 19: 'yes', 20: '' });
  const D = r(SIDS.D, { 1: '[PDPA-erased 2026-10-01]', 2: '', 3: 1500, 4: 32, 6: '', 7: bkkMidnight('2026-09-10'), 11: 'NEC' });
  pat.push(A, B, C, D);

  const log = g.sheet('Daily_Log');
  log.maxColumns = 39;
  const L = (sid, ts, extra) => { const row = g.logRow(sid, ts, extra); row.push(extra && extra[38] !== undefined ? extra[38] : ''); return row; };
  const a1 = L(SIDS.A, bkkMidnight('2026-09-05'), {
    15: NURSE, 24: JSON.stringify({ wtG: 1250, enType: 'EBM', savedByLabel: 'พยาบาล สมใจ (' + NURSE + ')', savedAt: '2026-09-05T01:30:00.000Z',
      critOverride: 'GIR high, reason typed', constantsVersion: '2026-09-02.1', mysteryKey: 5 }),
    25: E.a1, 26: '2026-09-05T01:30:00.000Z', 27: NURSE, 31: '2026-09-02.1', 32: '2026-09-02.3',
    33: new Date('2026-09-05T03:00:00.000Z'), 34: DOC, 35: 1, 37: '2026-09-05T16:59:00.000Z',
    38: printJson('2026-09-02.1', '2026-09-05', { alerts: ['GIR > 12'], reason: 'ทารก ปกป้อง ร้องมาก' }) });
  const a2 = L(SIDS.A, bkkMidnight('2026-09-05'), {
    15: DOC, 24: JSON.stringify({ wtG: 1250, constantsVersion: '2026-09-02.10', stops: ['CR-S-1'], blankFields: ['fluid'] }),
    25: E.a2, 26: '2026-09-05T17:10:00.000Z', 27: DOC, 31: '2026-09-02.10', 32: 'x', 35: 2, 36: E.a1,
    38: printJson('2026-09-02.10', '2026-09-05', null) });
  const a3 = L(SIDS.A, '2026-09-07', { 15: '', 25: E.a3, 26: '', 27: '', 31: '2026-09-02.9', 14: 'draft', 24: '' });
  const b1 = L(SIDS.B, '2026-10-03', { 15: ' Nurse.A@KCMH.test ', 19: 'ทดสอบ', 25: E.b1, 27: NURSE, 31: '2026-09-02.9', 13: 'TPN central',
    28: 120, 29: '', 30: 3 });
  const c1 = L(SIDS.C, bkkMidnight('2026-10-30'), { 15: DOC, 25: E.c1, 27: DOC, 31: '2026-10-28.1', 13: '1/2' });
  const d1 = L(SIDS.D, '2026-09-12', { 25: E.d1, 31: '2026-09-02.1' });
  const x1 = L(SIDS.X, '2026-09-12', { 25: E.x1, 31: '2026-09-02.1' });
  log.data.push(a1, a2, a3, b1, c1, d1, x1);
  if (opts.withoutKey !== true) g.sb.setupQiExportKey();
  return g;
}
const tab = (g) => g.sheet('QI_Export');
const tableOf = (g) => { const d = tab(g).data; const h = d[0]; return d.slice(1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
const key = (g, p) => g.props.get('QI_EXPORT_KEY_' + (p || 'QI1'));
const hmac = (secret, kind, v) => crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(Buffer.from(kind + '\u0000' + v, 'utf8')).digest('hex');
const rid = (g, sid, p) => 'R-' + hmac(key(g, p), 'patient', sid).slice(0, 12);
const eid = (g, id) => 'E-' + hmac(key(g), 'entry', id).slice(0, 12);
const sid_ = (g, mail) => 'S-' + hmac(key(g), 'staff', mail.trim().toLowerCase()).slice(0, 10);
const everything = (g) => JSON.stringify(Object.values(g.env.sheets).map(s => s.data)) + JSON.stringify(g.env.logs);

T.section('§1 setupQiExportKey: one key per project, never shown', () => {
  const g = ward({ withoutKey: true });
  const first = g.sb.setupQiExportKey();
  const secret = key(g);
  T.ok('the key is made under QI_EXPORT_KEY_QI1', typeof secret === 'string');
  T.ok('it is at least 64 hex characters (256 bits)', /^[0-9a-f]{64,}$/.test(secret || ''), (secret || '').length);
  T.eq('the first run says it made the key', first && first.created, true);
  const again = g.sb.setupQiExportKey();
  T.eq('a second run keeps the key', key(g), secret);
  T.eq('and says it already existed', again && again.created, false);
  const other = g.sb.setupQiExportKey('QI2');
  T.ok('another project gets its own key', key(g, 'QI2') && key(g, 'QI2') !== secret);
  T.ok('no return value carries a secret', !JSON.stringify([first, again, other]).includes(secret) && !JSON.stringify([first, again, other]).includes(key(g, 'QI2')));
  T.ok('no log line or sheet carries a secret', !everything(g).includes(secret) && !everything(g).includes(key(g, 'QI2')));
  const bad = g.sb.setupQiExportKey('qi 1; drop');
  T.ok('a project name outside A–Z 0–9 is refused', bad && bad.error && !g.props.has('QI_EXPORT_KEY_qi 1; drop'), bad);
  const two = g.sb.setupQiExportKey('QI1');
  T.eq('two keys made: two qiKeyCreated audit rows', g.audit().filter(a => a.action === 'qiKeyCreated').length, 2);
  T.ok('the explicit default name keeps the same key', two.created === false && key(g) === secret);
});

T.section('§2 no key, no export; codes are keyed HMACs', () => {
  const g = ward({ withoutKey: true });
  const r = g.sb.exportQi();
  T.ok('without a key the export refuses', r && r.error, r);
  T.ok('and writes no tab', !tab(g));
  T.eq('and no qiExport audit row', g.audit().filter(a => a.action === 'qiExport').length, 0);
  g.sb.setupQiExportKey();
  const ok = g.sb.exportQi();
  T.ok('with a key it exports', ok && ok.ok === true, ok);
  const rows = tableOf(g);
  T.eq('a legacy sessionId becomes R- and 12 hex of HMAC(key, "patient\\0" + id)', rows[0].research_id, rid(g, SIDS.A));
  T.eq('an NF- sessionId too', rows.find(x => x.research_id === rid(g, SIDS.B)) ? 1 : 0, 1);
  T.eq('an entryId becomes E- and 12 hex', rows[0].entry, eid(g, E.a1));
  T.eq('a staff e-mail becomes S- and 10 hex', rows[0].staff, sid_(g, NURSE));
  g.sb.setupQiExportKey('QI2');
  g.sb.exportQi('QI2');
  const rows2 = tableOf(g);
  T.ok('project QI2 gives the same infant another research ID', rows2[0].research_id === rid(g, SIDS.A, 'QI2') && rows2[0].research_id !== rows[0].research_id);
  T.ok('nothing new is stored in Patient_Registry or Daily_Log', !/[RES]-[0-9a-f]{10}/.test(JSON.stringify(g.sheet('Patient_Registry').data) + JSON.stringify(g.sheet('Daily_Log').data)));
});

T.section('§3 no direct identifier in the export', () => {
  const g = ward();
  g.sb.exportQi();
  const blob = JSON.stringify(tab(g).data);
  for (const n of NAMES) T.ok('no name: ' + n.length + '-char name #' + NAMES.indexOf(n), !blob.includes(n));
  for (const i of ['PK', 'SE', 'DT']) T.ok('no initials as a word: ' + i, !new RegExp('\\b' + i + '\\b').test(blob));
  for (const s of Object.values(SIDS)) T.ok('no sessionId: ' + s, !blob.includes(s));
  T.ok('no part of the legacy id (initials + BW)', !blob.includes('PK1250'));
  T.ok('no e-mail (no @ at all)', !blob.includes('@'));
  T.ok('no Thai text', !THAI.test(blob));
  T.ok('no calendar date', !/(19|20)\d{2}-\d{2}-\d{2}/.test(blob));
  T.ok('no UUID, so no entryId', !/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(blob));
  T.ok('no Date value in any cell', !tab(g).data.some(r => r.some(v => v instanceof Date)));
  T.ok('no phone number', !/0812345678/.test(blob));
  T.ok('no appVersion', !blob.includes('2026-09-02.3'));
  T.ok('no constantsVersion text (only C-numbers)', !blob.includes('2026-09-02.'));
});

T.section('§4 the columns', () => {
  const g = ward();
  const sum = g.sb.exportQi();
  T.eq('the header is the design table', tab(g).data[0], HEADER);
  const rows = tableOf(g);
  T.eq('one row per exported order', rows.length, 5);
  const [a1, a2, a3] = rows.filter(r => r.research_id === rid(g, SIDS.A));
  const b1 = rows.find(r => r.research_id === rid(g, SIDS.B));
  const c1 = rows.find(r => r.research_id === rid(g, SIDS.C));
  T.eq('A: sex, GA week, BW band', [a1.sex, a1.ga_wk, a1.bw_band_g], ['girls', 30, '1200-1299']);
  T.eq('A: age at admission 2 days (dob 30 Aug, admitted 1 Sep)', a1.age_at_admit_d, 2);
  T.eq('A: a twin is a multiple', a1.is_multiple, 1);
  T.eq('A: bed NICU 3 → unit NICU; status Active, no status day', [a1.unit_current, a1.pat_status, a1.status_day], ['NICU', 'Active', '']);
  T.eq('A: a plain diagnosis passes raw', a1.diagnosis, 'RDS, PDA');
  T.eq('A order 1: day 4, last modified 08:30 Bangkok on day 4', [a1.day, a1.last_modified_day, a1.last_modified_time], [4, 4, '08:30']);
  T.eq('A order 1: published 10:00 on day 4 (a Date cell), by the doctor', [a1.published_day, a1.published_time, a1.published_by], [4, '10:00', sid_(g, DOC)]);
  T.eq('A order 1: superseded 23:59 on day 4', [a1.superseded_day, a1.superseded_time], [4, '23:59']);
  T.eq('A order 2: 17:10 UTC is 00:10 Bangkok on the next day', [a2.last_modified_day, a2.last_modified_time], [5, '00:10']);
  T.eq('A order 2 is a revision of order 1', [a2.revision_of, a2.revisionNumber, a1.revision_of], [a1.entry, 2, '']);
  T.eq('release order: .1 < .9 < .10 < 2026-10-28.1', [a1.constants_v, a3.constants_v, a2.constants_v, c1.constants_v], ['C01', 'C02', 'C03', 'C04']);
  T.eq('A order 3: a draft with no saver has no staff code', [a3.status, a3.staff, a3.last_modified_day, a3.calc], ['draft', '', '', '']);
  const calc = JSON.parse(a1.calc);
  T.eq('calc keeps whitelisted keys only', Object.keys(calc).sort(), ['constantsVersion', 'critOverride', 'enType', 'wtG']);
  T.eq('calc: critOverride is true/false, the version a C-number', [calc.critOverride, calc.constantsVersion], [true, 'C01']);
  T.eq('calc: arrays of rule IDs pass', JSON.parse(a2.calc).stops, ['CR-S-1']);
  const print = JSON.parse(a1.print);
  T.eq('print: critical becomes counts', print.critical, { alerts: 1, hasReason: true });
  T.eq('print: orderDate becomes order_day; the version a C-number', [print.order_day, print.constantsVersion, 'orderDate' in print], [4, 'C01', false]);
  T.eq('print: the figures pass', [print.preparedMl, print.stockMl, print.delivered], ['180', { d50w: '10' }, { kcal: '80' }]);
  T.eq('print with no critical alert: null', JSON.parse(a2.print).critical, null);
  T.eq('B: a diagnosis naming the infant is redacted', b1.diagnosis, '[REDACTED]');
  T.eq('B: e-mail case and spaces do not change the staff code', b1.staff, a1.staff);
  T.eq('B: discharged on day 19; day 2; SCN', [b1.pat_status, b1.status_day, b1.day, b1.unit_current], ['Discharged', 19, 2, 'SCN']);
  T.eq('B: Thai in a supp column is redacted; I/O numbers pass, blank stays blank', [b1.suppCaType, b1.ioInput, b1.ioOutput, b1.drainContent], ['[REDACTED]', 120, '', 3]);
  T.eq('C: a Thai diagnosis is redacted; PN indication and ticks pass', [c1.diagnosis, c1.pn_indication, c1.liver_dysfunction, c1.renal_dysfunction], ['[REDACTED]', 'Prematurity', 'yes', '']);
  T.eq('C: iso 2 → ISO; age 3 days; BW 2010 → 2000-2099; GA 35', [c1.unit_current, c1.age_at_admit_d, c1.bw_band_g, c1.ga_wk], ['ISO', 3, '2000-2099', 35]);
  T.eq('C: route "1/2" stays the text 1/2', c1.route, '1/2');
  T.eq('summary: rows and infants', [sum.rows, sum.infants], [5, 3]);
  T.eq('summary: redactions per column', sum.redacted, { diagnosis: 2, suppCaType: 1 });
  T.eq('summary: dropped calc keys are counted by name', sum.droppedCalcKeys, { mysteryKey: 1 });
  T.eq('summary: k-report on sex + GA + BW band + multiple', [sum.kReport.groups, sum.kReport.smallestGroup, sum.kReport.infantsBelowK, sum.kReport.minK], [3, 1, 3, 5]);
  const said = JSON.stringify(sum) + JSON.stringify(g.env.logs);
  T.ok('the summary and the log hold counts only: no code, name, id or date', !/R-[0-9a-f]|E-[0-9a-f]|S-[0-9a-f]|@|NF-|PK1250|(19|20)\d{2}-\d{2}-\d{2}/.test(said) && !THAI.test(said), said.slice(0, 300));
});

T.section('§5 orders left out', () => {
  const g = ward();
  const sum = g.sb.exportQi();
  T.eq('an erased infant\'s order and an order with no registry row are counted', [sum.leftOut.erasedInfantOrders, sum.leftOut.ordersWithoutRegistryRow], [1, 1]);
  T.ok('neither appears', !tableOf(g).some(r => r.research_id === rid(g, SIDS.D) || r.research_id === rid(g, SIDS.X)));
});

T.section('§6 the tab', () => {
  const g = ward();
  g.sb.exportQi();
  T.eq('trimmed to its columns', tab(g).maxColumns, HEADER.length);
  T.eq('trimmed to its rows', tab(g).getMaxRows(), 6);
  T.eq('no cell became a formula', g.env.injections.filter(i => i.sheet === 'QI_Export').length, 0);
  T.ok('HH:MM stays text', typeof tableOf(g)[0].last_modified_time === 'string');
  g.sheet('Daily_Log').data.splice(1, 3);   // A's three orders gone
  g.sb.exportQi();
  T.eq('a second export rewrites the tab whole: no stale row', [tab(g).data.length - 1, tab(g).getMaxRows()], [2, 3]);
  g.sheet('Daily_Log').data.splice(1);
  const empty = g.sb.exportQi();
  T.ok('an export with no orders leaves the header only', empty.ok === true && tab(g).data.length === 1 && tab(g).getMaxRows() >= 1, tab(g).data.length);
});

T.section('§7 the export stops rather than leak', () => {
  const g = ward();
  g.sheet('Daily_Log').data[0][1] = 'name';
  const r = g.sb.exportQi();
  T.eq('a shifted Daily_Log header stops it', r && r.code, 'SchemaMismatch');
  T.ok('and writes no tab', !tab(g));
  const h = ward();
  h.sheet('Patient_Registry').data[0][2] = 'dob';
  T.eq('a shifted Patient_Registry header stops it', (h.sb.exportQi() || {}).code, 'SchemaMismatch');
  const k = ward();
  k.sb._qiCleanText = (v) => String(v == null ? '' : v);   // redaction switched off: the scan is the last guard
  const leak = k.sb.exportQi();
  T.ok('with redaction off, the scan finds the leak and refuses', leak && leak.code === 'IdentifierFound', leak);
  T.ok('and names columns and counts, never a value', leak && leak.hits && leak.hits.diagnosis >= 2 && !JSON.stringify(leak).includes('Somchai') && !THAI.test(JSON.stringify(leak)), leak);
  T.ok('and writes no tab', !tab(k));
  T.eq('the scan itself: e-mail, Thai, 13 digits, phone, HN/AN, date, UUID, an original id',
    k.sb._qiScan([{ a: 'x@y.co', b: 'ทดสอบ', c: '1234567890123', d: '0812345678', e: '12345/67', f: '2026-11-07', g: crypto.randomUUID(), h: 'id NF-482913', i: 1.2000000000000002, j: '1200-1299' }], ['NF-482913']),
    { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1, h: 1 });
});

T.section('§8 audit and re-identification', () => {
  const g = ward();
  g.sb.exportQi();
  const ex = g.audit().filter(a => a.action === 'qiExport');
  T.eq('one qiExport row, actor the editor and project', ex.map(a => [a.sessionId, a.actor]), [['', 'apps-script-editor:QI1']]);
  const first = tableOf(g)[0].research_id;
  const hit = g.sb.lookupResearchId(first);
  T.eq('lookupResearchId returns the sessionId', hit && hit.sessionId, SIDS.A);
  T.eq('and audits it with the sessionId', g.audit().filter(a => a.action === 'qiReidentify').map(a => [a.sessionId, a.actor]), [[SIDS.A, 'apps-script-editor:QI1']]);
  T.ok('the execution log shows it (the editor does not show a return value)', g.env.logs.some(l => l.includes(SIDS.A)));
  const miss = g.sb.lookupResearchId('R-000000000000');
  T.ok('an unknown research ID is an error', miss && miss.error && !miss.sessionId, miss);
  T.eq('and is audited as a miss', g.audit().filter(a => a.action === 'qiReidentifyMiss').length, 1);
  const bad = g.sb.lookupResearchId('PK1250A');
  T.ok('a malformed research ID is refused', bad && bad.error, bad);
  T.ok('an erased infant is not re-identified', (g.sb.lookupResearchId(rid(g, SIDS.D)) || {}).sessionId === undefined);
  const audit = g.sheet('Audit_Log').data;
  const m = g.sb.usageMetrics(audit);
  T.eq('QI audit rows are not product usage', [m.totalDistinctUsers, m.rowsSkipped], [0, audit.length - 1]);
  const failing = ward();
  failing.sheet('Audit_Log').throwOn.appendRow = { err: new Error('Service Spreadsheets failed') };
  const noAudit = failing.sb.exportQi();
  T.ok('no audit row, no export', noAudit && noAudit.error && !tab(failing), noAudit);
});

T.section('§9 no route from doPost', () => {
  const g = ward();
  g.addStaff('admin@kcmh.test', 'admin');
  const at = g.session('admin@kcmh.test', 'admin');
  for (const action of ['exportQi', 'setupQiExportKey', 'lookupResearchId', 'qiExport']) {
    const r = g.post({ action, token: at, researchId: 'R-000000000000' });
    T.ok('an admin POST of ' + action + ' is an unknown action', r && /Unknown action/.test(r.error || ''), r);
  }
  T.ok('and no tab was written', !tab(g));
});

T.done();
