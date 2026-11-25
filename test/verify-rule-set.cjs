// verify-rule-set.cjs — rule-set selection, newborn branch only (openspec/changes/paediatric-wards,
// tasks 3.1–3.3; specs/clinical-rule-sets, design D3).
//
// A patient's rule set follows their age on the admission date of the record, is fixed for the
// admission, and never follows the bed or the ward. Only the newborn set exists, so every record
// the backend accepts today is on it, whatever the bed and with or without a date of birth, and no
// NICU or SCN figure moves. The real data.js runs in a vm; the real gas-backend.gs runs in
// gas-vm-sandbox.cjs. Made-up infants only.
//
//   § 1  data.js: ruleSetFor is "newborn" for every bed, no bed, a parked infant, a free-text bed,
//        no patient, with and without a date of birth; the newborn tables, products and flags
//   § 2  the dead space reads the ward table, not the rule set; a fixture ward moves no rule
//   § 3  the backend's _ruleSetOf gives data.js's answer on the same dates
//   § 4  registration: a credible date of birth on a new record; the set written to V; a legacy
//        record with no date of birth still saves
//   § 5  orders: a stale tab that sends no set is newborn; a set that differs is refused; a stored
//        set that differs is refused, for every order action and every role, before any sheet changes
//   § 6  a stored set that differs: a doctor's edit is refused, an admin's rewrites it
//   § 7  the Calculator sends its set with every save
//
// NEGATIVE CONTROL — red against main before group 3 (5363edb):
//   git -C <repo> archive 5363edb | tar -x -C /tmp/main-5363edb
//   NEOFEED_TREE=/tmp/main-5363edb node test/verify-rule-set.cjs
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const fs = require('fs');
const os = require('os');
const vm = require('vm');
const path = require('path');
const { boot, recorder, wardToday, addDays } = require('./gas-vm-sandbox.cjs');

const TREE = path.resolve(process.env.NEOFEED_TREE || path.join(__dirname, '..'));
const read = (f) => fs.readFileSync(path.join(TREE, f), 'utf8');
const T = recorder('RULE SET (NEWBORN BRANCH)');

function loadData(src) {
  const box = { console, Math, Date, JSON, Intl };
  box.window = box; box.globalThis = box;
  vm.createContext(box);
  vm.runInContext(src, box, { filename: 'data.js' });
  return box.NEOFEED_DATA;
}
const D = loadData(read('data.js'));
const fn = (name) => (typeof D[name] === 'function' ? D[name] : () => { throw new Error('data.js has no ' + name); });

const TODAY = wardToday();
const DOB = addDays(TODAY, -12);
// Patients the frontend sees, on every kind of bed. "older" was admitted at five years old: with only
// the newborn set it is still newborn (the present DOL-400 and 8 kg limits stop its orders).
const BEDS = [...(D.BED_OPTIONS || []), ''];
const CASES = [
  ...BEDS.map(b => ({ name: `bed "${b}"`, p: { currentBed: b, dob: DOB, admissionDate: DOB } })),
  { name: 'parked, left SCN 4', p: { currentBed: '', bedHistory: [{ bed: 'SCN 4' }], dob: DOB, admissionDate: DOB } },
  { name: 'a free-text bed', p: { currentBed: 'OR 1', dob: DOB, admissionDate: DOB } },
  { name: 'no date of birth', p: { currentBed: 'NICU 2', dob: '', admissionDate: DOB } },
  { name: 'no dates at all', p: { currentBed: 'NICU 2' } },
  { name: 'admitted at five years old', p: { currentBed: 'SCN 1', dob: addDays(TODAY, -5 * 365), admissionDate: TODAY } },
  { name: 'no patient (Quick calc, Center Point)', p: null },
];

T.section('§ 1 data.js: every patient is on the newborn set', () => {
  T.eq('1.1 the sets that exist', D.RULE_SETS ? [...D.RULE_SETS] : null, ['newborn']);
  const off = CASES.filter(c => fn('ruleSetFor')(c.p) !== 'newborn').map(c => c.name);
  T.eq(`1.2 ruleSetFor is "newborn" in all ${CASES.length} cases`, off, []);
  T.eq('1.3 isNewbornUnit follows it', CASES.filter(c => D.isNewbornUnit(c.p) !== true).map(c => c.name), []);
  const tables = CASES.filter(c => {
    const t = fn('ruleTablesFor')(c.p);
    return !(t && t.TARGETS === D.TARGETS && t.TPN_TARGETS === D.TPN_TARGETS && t.ENTERAL_TARGETS === D.ENTERAL_TARGETS);
  }).map(c => c.name);
  T.eq('1.4 the target tables are the newborn ones, the same objects', tables, []);
  T.eq('1.5 Aminoven only, everywhere', CASES.filter(c => JSON.stringify(D.aaProductsFor(c.p)) !== '["aminoven10"]').map(c => c.name), []);
  T.ok('1.6 OLDER_CHILD_WARDS is gone: the ward no longer chooses rules', !('OLDER_CHILD_WARDS' in D) && !/const OLDER_CHILD_WARDS/.test(read('data.js')));
  T.ok('1.7 the Calculator reads no target table by name', !/D\.(TARGETS|TPN_TARGETS|ENTERAL_TARGETS)\b/.test(read('calculator.jsx').replace(/\/\/[^\n]*/g, '')));
});

T.section('§ 2 dead space: the ward table, not the rule set', () => {
  T.eq('2.1 each ward row carries 30 mL', D.WARDS.map(w => [w.key, w.deadVolMl]), [['NICU', 30], ['SCN', 30]]);
  T.eq('2.2 every case starts at 30 mL, as before', CASES.filter(c => D.defaultDeadVolFor(c.p) !== 30).map(c => c.name), []);
  T.eq('2.3 the hint names NICU and SCN', fn('wardLabelsStartingAt')(30), ['NICU', 'SCN']);
  // A fixture ward with its own giving set, planted the way REFERENCE.md § Adding a ward plants one.
  const WT = require(path.join(TREE, 'tools', 'ward-table.cjs'));
  const row = '{ key: "PED", label: "PED", sub: "PED 1–4", stickerLabel: "PED(test)", beds: [{ prefix: "PED", count: 4 }], deadVolMl: 0 },';
  const P = loadData(WT.plantWard(read('data.js'), row));
  const ped = { currentBed: 'PED 2', dob: DOB, admissionDate: DOB };
  T.eq('2.4 a PED bed starts at the PED row\'s 0 mL', P.defaultDeadVolFor(ped), 0);
  T.eq('2.5 …and is not named in the 30 mL hint', P.wardLabelsStartingAt(30), ['NICU', 'SCN']);
  T.eq('2.6 a newborn in a PED bed keeps the newborn set, tables and products', [P.ruleSetFor(ped), P.ruleTablesFor(ped).TARGETS === P.TARGETS, P.aaProductsFor(ped)],
    ['newborn', true, ['aminoven10']]);
  const noDead = '{ key: "PED", label: "PED", sub: "PED 1–4", stickerLabel: "PED(test)", beds: [{ prefix: "PED", count: 4 }] },';
  const problems = WT.validate(loadData(WT.plantWard(read('data.js'), noDead)));
  T.ok('2.7 a ward row with no deadVolMl is refused by tools/ward-table.cjs', problems.some(p => /PED.*deadVolMl/.test(p)), problems);
});

// ── The backend ──
const PWD = 'Rule-Set-Password-1';
const ACCOUNTS = { admin: 'admin', doc: 'doctor', nurse: 'nurse' };
function backend() {
  const g = boot({ src: path.join(TREE, 'gas-backend.gs') });
  g.tok = {};
  for (const [k, role] of Object.entries(ACCOUNTS)) {
    g.addStaff(k + '@kcmh.test', role, PWD, { wards: role === 'admin' ? '' : 'NICU,SCN' });
    g.tok[k] = g.session(k + '@kcmh.test', role);
  }
  g.as = (who, body) => g.post(Object.assign({ token: g.tok[who] }, body));
  return g;
}
const seed = (g, sid, extra) => g.seedPatient(Object.assign({ sessionId: sid, name: 'ทด สอบ', initials: 'ทส', bw: 1500, ga: 32.1,
  sex: 'boys', dob: DOB, admissionDate: DOB, status: 'Active', currentBed: 'NICU 3', diagnosis: 'RDS',
  weights: [{ dol: 1, w: 1500 }] }, extra || {}));
const regRow = (g, sid) => g.rows('Patient_Registry').find(r => r[0] === sid);
const sheetsNow = (g) => JSON.stringify(['Patient_Registry', 'Daily_Log'].map(n => g.sheet(n).data));
const reg = (sid, extra) => Object.assign({ sessionId: sid, name: 'ใหม่ ทดสอบ', initials: 'ใท', bw: 1700, ga: 33.1, sex: 'girls',
  dob: addDays(TODAY, -2), admissionDate: addDays(TODAY, -2), twinSuffix: '', status: 'Active', currentBed: 'SCN 7',
  diagnosis: 'RDS', weights: [{ dol: 1, w: 1700 }], lengths: [], hcs: [], bedHistory: [], statusDate: '', multiplesCount: 0 }, extra || {});
const ORDER = (extra) => Object.assign({ ts: TODAY, dol: 13, weight: 1600, fluid: 150, gir: 7, pro: 2, kcal: 42, na: 2, k: 2.5,
  ca: 0, p: 0, enVolPerKg: 0, route: 'TPN central', status: 'draft', constantsVersion: '2026-11-18.1',
  calcInput: { wtG: 1600, tpnWtG: 1600, stops: [] } }, extra || {});
const V = 21;   // Patient_Registry V, 0-based

T.section('§ 3 the backend derives the same set as data.js', () => {
  const g = backend();
  T.ok('3.1 gas-backend.gs has _ruleSetOf', typeof g.sb._ruleSetOf === 'function');
  const diff = CASES.filter(c => c.p).filter(c => g.sb._ruleSetOf(c.p.dob || '', c.p.admissionDate || '') !== D.ruleSetFor(c.p)).map(c => c.name);
  T.eq('3.2 same answer on every case\'s dates', diff, []);
  T.eq('3.3 the backend\'s sets are data.js\'s', g.sb.RULE_SETS_GS ? [...g.sb.RULE_SETS_GS] : null, D.RULE_SETS ? [...D.RULE_SETS] : null);
  T.eq('3.4 the registry header names column V', g.sb.PAT_HEADERS && g.sb.PAT_HEADERS[V], 'ruleSet');
});

T.section('§ 4 registration', () => {
  const g = backend();
  const before = sheetsNow(g);
  const late = g.as('doc', { action: 'registerPatient', isNew: true, patient: reg('NF-330001', { dob: addDays(TODAY, -1), admissionDate: addDays(TODAY, -2) }) });
  T.ok('4.1 a date of birth after admission is refused', !late.ok && /Date of birth .*Admit date/.test(late.error || ''), late);
  const none = g.as('doc', { action: 'registerPatient', isNew: true, patient: reg('NF-330002', { dob: '' }) });
  T.ok('4.2 a new record with no date of birth is refused', !none.ok && /วันเกิด/.test(none.error || ''), none);
  T.ok('4.3 …and neither wrote anything', sheetsNow(g) === before);
  const good = g.as('doc', { action: 'registerPatient', isNew: true, patient: reg('NF-330003') });
  T.ok('4.4 a credible date of birth registers', good.ok === true, good);
  T.eq('4.5 …with the rule set in V', regRow(g, 'NF-330003') && regRow(g, 'NF-330003')[V], 'newborn');
  const born = g.as('doc', { action: 'registerPatient', isNew: true, patient: reg('NF-330004', { currentBed: 'SCN 8', bw: 1810, dob: addDays(TODAY, -2), admissionDate: addDays(TODAY, -2) }) });
  T.ok('4.6 born on the day of admission registers', born.ok === true, born);
  // A record from before this change, with no date of birth (legacy) and no V.
  seed(g, 'NF-LEG01', { dob: '' });
  const p = (g.as('doc', { action: 'getActivePatients' }).patients || []).find(x => x.sessionId === 'NF-LEG01');
  const edit = g.as('doc', { action: 'updatePatient', patient: Object.assign({}, p, { diagnosis: 'RDS, PDA' }) });
  T.ok('4.7 an existing record with no date of birth still saves an edit', edit.ok === true, edit);
  T.eq('4.8 …and is written as newborn', regRow(g, 'NF-LEG01') && regRow(g, 'NF-LEG01')[V], 'newborn');
  // A legacy pair the editor never touched passes; moving the date of birth past admission does not.
  seed(g, 'NF-LEG02', { currentBed: 'NICU 4', dob: addDays(TODAY, -3), admissionDate: addDays(TODAY, -5) });
  const p2 = (g.as('doc', { action: 'getActivePatients' }).patients || []).find(x => x.sessionId === 'NF-LEG02');
  const keep = g.as('doc', { action: 'updatePatient', patient: Object.assign({}, p2, { diagnosis: 'RDS, PDA' }) });
  T.ok('4.9 a stored pair left as it is passes', keep.ok === true, keep);
  const p3 = (g.as('doc', { action: 'getActivePatients' }).patients || []).find(x => x.sessionId === 'NF-330003');
  const move = g.as('doc', { action: 'updatePatient', base: p3, patient: Object.assign({}, p3, { dob: addDays(TODAY, -1) }) });
  T.ok('4.10 an edit that moves the date of birth past admission is refused', !move.ok && /Date of birth/.test(move.error || ''), move);
});

T.section('§ 5 orders', () => {
  const g = backend();
  seed(g, 'NF-LEG10');
  seed(g, 'NF-LEG11', { dob: '' });
  const stale = g.as('doc', { action: 'logDailyNutrition', sessionId: 'NF-LEG10', entry: ORDER() });
  T.ok('5.1 a stale tab that sends no set saves (newborn)', stale.ok === true, stale);
  const sent = g.as('doc', { action: 'logDailyNutrition', sessionId: 'NF-LEG11', entry: ORDER({ ruleSet: 'newborn' }) });
  T.ok('5.2 "newborn" saves, on a record with no date of birth too', sent.ok === true, sent);
  const before = sheetsNow(g);
  const other = g.as('doc', { action: 'updateDailyNutrition', sessionId: 'NF-LEG10', entryId: stale.entryId,
    expectedLastModified: stale.lastModified, entry: ORDER({ ruleSet: 'paediatric' }) });
  T.ok('5.3 a set the backend does not derive is refused', !other.ok && other.code === 'RuleSet', other);
  T.ok('5.4 …before any sheet changes', sheetsNow(g) === before);
  // A V typed by hand: every order action, every role, refused.
  regRow(g, 'NF-LEG10')[V] = 'paediatric';
  g.sb._bumpDataVersion();
  const now = sheetsNow(g);
  const asks = [
    ['doc', { action: 'logDailyNutrition', sessionId: 'NF-LEG10', entry: ORDER({ ts: addDays(TODAY, -1), ruleSet: 'newborn' }) }],
    ['admin', { action: 'logDailyNutrition', sessionId: 'NF-LEG10', entry: ORDER({ ts: addDays(TODAY, -1) }) }],
    ['doc', { action: 'updateDailyNutrition', sessionId: 'NF-LEG10', entryId: stale.entryId, expectedLastModified: stale.lastModified, entry: ORDER() }],
    ['nurse', { action: 'updateDailyNutrition', sessionId: 'NF-LEG10', entryId: stale.entryId, expectedLastModified: stale.lastModified, entry: ORDER() }],
    ['doc', { action: 'publishLog', sessionId: 'NF-LEG10', entryId: stale.entryId, expectedLastModified: stale.lastModified }],
  ];
  const replies = asks.map(([who, body]) => g.as(who, body));
  T.eq('5.5 a stored set that differs: refused for log, update and publish, doctor, nurse and admin',
    replies.map(r => r.code), asks.map(() => 'RuleSet'));
  T.ok('5.6 …and no sheet changed', sheetsNow(g) === now);
  T.ok('5.7 the refusal names no one', replies.every(r => !/NF-LEG10|ทด สอบ/.test(JSON.stringify(r))), replies);
  regRow(g, 'NF-LEG10')[V] = 'Newborn ';
  g.sb._bumpDataVersion();
  const caseOk = g.as('doc', { action: 'logDailyNutrition', sessionId: 'NF-LEG10', entry: ORDER({ ts: addDays(TODAY, -1) }) });
  T.ok('5.8 a stored "Newborn " (case, spaces) is the newborn set', caseOk.ok === true, caseOk);
});

T.section('§ 6 a stored set that differs, on a registry edit', () => {
  const g = backend();
  seed(g, 'NF-LEG20');
  regRow(g, 'NF-LEG20')[V] = 'paediatric';
  g.sb._bumpDataVersion();
  const p = (g.as('admin', { action: 'getActivePatients' }).patients || []).find(x => x.sessionId === 'NF-LEG20');
  const before = sheetsNow(g);
  const doc = g.as('doc', { action: 'updatePatient', patient: Object.assign({}, p, { diagnosis: 'RDS, PDA' }) });
  T.ok('6.1 a doctor\'s edit is refused', !doc.ok && doc.code === 'RuleSet', doc);
  T.ok('6.2 …and wrote nothing', sheetsNow(g) === before);
  const admin = g.as('admin', { action: 'updatePatient', patient: Object.assign({}, p, { diagnosis: 'RDS, PDA' }) });
  T.ok('6.3 an admin\'s edit goes through', admin.ok === true, admin);
  T.eq('6.4 …and V holds the derived set', regRow(g, 'NF-LEG20')[V], 'newborn');
});

T.section('§ 7 the Calculator sends its set', () => {
  T.ok('7.1 calculator.jsx puts ruleSet: D.ruleSetFor(patient) on every save', /\n\s*ruleSet: D\.ruleSetFor\(patient\),/.test(read('calculator.jsx')));
  T.ok('7.2 …and compiled/calculator.js carries it', /ruleSet:\s*D\.ruleSetFor\(patient\)/.test(read('compiled/calculator.js')));
});

T.done();
