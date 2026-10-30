// verify-pharmacy-backend-1030.cjs — the TPN room's half of gas-backend.gs
// (openspec/changes/tpn-room-stickers; Pp, 2026-10-30).
//
//   §1–§3  Daily_Log AM holds printJson: stored, checked, kept per revision,
//          and never sent to the ward;
//   §4     a pharmacy account reaches five actions and nothing else;
//   §5     its login reply carries no registry;
//   §6–§7  pharmacyOrders: one date, counts, no name, initials or dob, audited.
//
// Real gas-backend.gs in gas-vm-sandbox.cjs. Synthetic infants only.
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const fs = require('fs');
const { boot, recorder, SRC_PATH } = require('./gas-vm-sandbox.cjs');
const T = recorder('PHARMACY BACKEND 2026-10-30');

const PJ = (extra) => Object.assign({ v: 1, constantsVersion: '2026-10-28.1', orderDate: '2026-10-20', dol: '10',
  dosingWeightKg: '1.6', factor: '1.9', deliveredMl: '160', deadMl: '30', preparedMl: '190',
  stockMl: { d50w: '38', wfi: '104' }, delivered: { kcal: '67' }, critical: null }, extra);
const E = (extra, ci) => Object.assign({ dol: 10, weight: 1600, fluid: 150, gir: 7, pro: 2, kcal: 42, na: 2, k: 2.5, ca: 0, p: 0,
  enVolPerKg: 0, route: 'TPN central', status: 'submitted', printJson: PJ(),
  calcInput: Object.assign({ wtG: 1600, stops: [] }, ci) }, extra || {});
const P = (sid, bed) => ({ sessionId: sid, name: 'ทารกทดสอบ ' + sid, initials: 'ทท', bw: 1600, ga: 32.1, sex: 'boys',
  dob: '2026-10-01', admissionDate: '2026-10-01', twinSuffix: '', status: 'Active',
  currentBed: bed, diagnosis: 'RDS', weights: [{ dol: 1, w: 1600 }], lengths: [], hcs: [], bedHistory: [],
  statusDate: '', multiplesCount: 0 });

function ward() {
  const g = boot();
  g.addStaff('doc@kcmh.test', 'doctor', 'Doctor-Password-1', { name: 'Dr Test' });
  g.addStaff('rx@kcmh.test', 'pharmacy', 'Pharmacy-Password-1', { name: 'Rx Test' });
  g.addStaff('admin@kcmh.test', 'admin', 'Admin-Password-1');
  g.dt = g.session('doc@kcmh.test', 'doctor');
  g.rt = g.session('rx@kcmh.test', 'pharmacy');
  g.at = g.session('admin@kcmh.test', 'admin');
  g.as = (tok, body) => g.post(Object.assign({ token: tok }, body));
  g.as(g.dt, { action: 'registerPatient', isNew: true, patient: P('NF-100001', 'NICU 3') });
  // Same BW and dob as the first infant, so the registry asks "possible duplicate?" first.
  g.as(g.dt, { action: 'registerPatient', isNew: true, confirmDuplicate: true, patient: P('NF-100002', 'SCN 12') });
  g.log = (sid, ts, entry) => g.as(g.dt, { action: 'logDailyNutrition', sessionId: sid, entry: Object.assign(entry, { ts }) });
  g.cell = (row, col) => g.sheet('Daily_Log').data[row][col];
  g.am = (row) => JSON.parse(g.cell(row, 38));
  return g;
}

T.section('§1 AM · every save stores the figures it carries', () => {
  const g = ward();
  const r = g.log('NF-100001', '2026-10-20', E());
  T.ok('a submitted TPN order saves', !!r.entryId, r);
  T.eq('the row is 39 columns wide (A–AM)', g.sheet('Daily_Log').data[1].length, 39);
  T.eq('AM holds the figures as sent', g.am(1), PJ());
  const d = g.log('NF-100002', '2026-10-20', E({ status: 'draft' }));
  T.ok('a draft stores them too', !!d.entryId && g.am(2).v === 1, d);
  const none = g.log('NF-100001', '2026-10-21', E({ printJson: undefined }));
  T.ok('a save without figures still lands (a tab from before the release)', !!none.entryId, none);
  T.eq('…with AM blank', g.cell(3, 38), '');
  T.eq('no formula injection recorded', g.env.injections, []);
});

T.section('§2 AM · a bad shape is refused, and nothing is written', () => {
  const g = ward();
  const v2 = g.log('NF-100001', '2026-10-20', E({ printJson: { v: 2 } }));
  T.ok('an unknown version → refused, naming printJson', !v2.entryId && /printJson/.test(v2.error || ''), v2);
  const big = g.log('NF-100001', '2026-10-20', E({ printJson: PJ({ pad: 'x'.repeat(9000) }) }));
  T.ok('over 8,000 characters → refused', !big.entryId && /printJson/.test(big.error || ''), big);
  const str = g.log('NF-100001', '2026-10-20', E({ printJson: '=IMPORTXML("x")' }));
  T.ok('a string → refused', !str.entryId && /printJson/.test(str.error || ''), str);
  const arr = g.log('NF-100001', '2026-10-20', E({ printJson: [1] }));
  T.ok('a list → refused', !arr.entryId && /printJson/.test(arr.error || ''), arr);
  T.eq('nothing was written', g.sheet('Daily_Log').data.length - 1, 0);
  T.eq('no formula injection recorded', g.env.injections, []);
});

T.section('§3 AM · edits: a revision has its own figures, a draft moves in place; the ward sync never sees them', () => {
  const g = ward();
  const r1 = g.log('NF-100001', '2026-10-20', E());
  const r2 = g.as(g.dt, { action: 'updateDailyNutrition', sessionId: 'NF-100001', entryId: r1.entryId,
    expectedLastModified: g.cell(1, 26), entry: E({ printJson: PJ({ factor: '2' }) }) });
  T.ok('an edit of a submitted order is a revision', r2.revised === true, r2);
  T.eq('the old row keeps its figures', g.am(1).factor, '1.9');
  T.eq('the revision row has the new ones', g.am(2).factor, '2');

  const d1 = g.log('NF-100002', '2026-10-20', E({ status: 'draft' }));
  const up = g.as(g.dt, { action: 'updateDailyNutrition', sessionId: 'NF-100002', entryId: d1.entryId,
    expectedLastModified: g.cell(3, 26), entry: E({ status: 'draft', printJson: PJ({ factor: '2.1' }) }) });
  T.ok('a draft edit stays in place', up.ok === true && !up.revised, up);
  T.eq('…and AM moves with it', g.am(3).factor, '2.1');

  let widest = 0;
  g.sheet('Daily_Log').hooks.beforeRead = (sh, r, c, nr, nc) => { if (r > 1) widest = Math.max(widest, c + nc - 1); };
  const text = g.postText({ token: g.dt, action: 'getActivePatients' });
  g.sheet('Daily_Log').hooks.beforeRead = null;
  T.ok('the ward payload carries the order', text.includes(r2.entryId), text.slice(0, 160));
  T.ok('…and none of its sticker figures', !/deliveredMl|stockMl/.test(text));
  T.eq('…and the sync does not even read AM (A–AL only)', widest, 38);
});

T.section('§4 pharmacy · every action but five is refused, and nothing changes', () => {
  const g = ward();
  g.log('NF-100001', '2026-10-20', E());
  const src = fs.readFileSync(SRC_PATH, 'utf8');
  // `(?<![\w.])` skips `typeof body.action === "string"`, which is a type check, not an action.
  const actions = [...new Set([...src.matchAll(/(?<![\w.])action === "([A-Za-z]+)"/g)].map(m => m[1]))];
  const allowed = new Set(['ping', 'login', 'logout', 'changePassword', 'pharmacyOrders']);
  T.ok('the backend names at least 20 actions', actions.length >= 20, actions);
  T.ok('…and the list holds real actions only (no `string` from the typeof check)', !actions.includes('string'), actions);
  // Names an object literal answers for without having set them. A truthiness lookup lets them through.
  const protoKeys = ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf'];
  const snap = () => JSON.stringify(['Daily_Log', 'Patient_Registry', 'Staff'].map(t => g.rows(t)));
  const before = snap(), auditBefore = g.audit().length;
  let reads = 0;
  const count = () => { reads++; };
  g.sheet('Daily_Log').hooks.beforeRead = count;
  g.sheet('Patient_Registry').hooks.beforeRead = count;
  for (const a of actions.filter(x => !allowed.has(x)).concat(protoKeys)) {
    const res = g.as(g.rt, { action: a, sessionId: 'NF-100001', entryId: g.cell(1, 25), expectedLastModified: g.cell(1, 26),
      entry: E(), patient: P('NF-100009', 'NICU 9'), isNew: true });
    T.eq(`${a} → Forbidden`, res.error, 'Forbidden');
  }
  const pharmacyReads = reads, after = snap(), auditAfter = g.audit().length;
  // Not vacuous: the same counter sees a doctor read the registry.
  g.as(g.dt, { action: 'getActivePatients' });
  const doctorReads = reads - pharmacyReads;
  g.sheet('Daily_Log').hooks.beforeRead = null;
  g.sheet('Patient_Registry').hooks.beforeRead = null;
  T.eq('Daily_Log and Patient_Registry were never read for pharmacy', pharmacyReads, 0);
  T.ok('…and the counter does see a doctor read them', doctorReads > 0, doctorReads);
  T.eq('no sheet changed', after, before);
  T.eq('no audit row was written (the registry was never read)', auditAfter, auditBefore);
});

T.section('§5 pharmacy · the login reply carries no registry', () => {
  const g = ward();
  const rx = g.post({ action: 'login', email: 'rx@kcmh.test', password: 'Pharmacy-Password-1', wantSync: true });
  T.eq('signed in as pharmacy', [rx.status, rx.role], ['ok', 'pharmacy']);
  T.ok('no sync in the reply', !('sync' in rx), Object.keys(rx));
  T.ok('no infant name anywhere in it', !/ทารกทดสอบ/.test(JSON.stringify(rx)));
  const doc = g.post({ action: 'login', email: 'doc@kcmh.test', password: 'Doctor-Password-1', wantSync: true });
  T.ok('a doctor still gets the first snapshot', !!doc.sync && Array.isArray(doc.sync.patients), Object.keys(doc));
});

T.section('§6 pharmacyOrders · one date, counts, and no identifying field', () => {
  const g = ward();
  // Same BW and dob as the two infants ward() registers, so each needs confirmDuplicate.
  g.as(g.dt, { action: 'registerPatient', isNew: true, confirmDuplicate: true, patient: P('NF-100003', 'iso 2-1') });
  g.as(g.dt, { action: 'registerPatient', isNew: true, confirmDuplicate: true, patient: P('NF-100004', 'SCN 1') });
  g.log('NF-100001', '2026-10-20', E({}, { savedByLabel: 'Dr Test (doc@kcmh.test)' }));
  g.log('NF-100002', '2026-10-20', E());
  g.log('NF-100003', '2026-10-20', E());
  g.log('NF-100004', '2026-10-20', E({ status: 'draft' }));
  g.log('NF-100001', '2026-10-21', E());
  g.log('NF-100002', '2026-10-21', E({ route: 'Enteral only', printJson: null }));
  const auditBefore = g.audit().length;
  // The audit row must exist before the log is read: note the row count at the first read.
  let auditAtFirstRead = null;
  g.sheet('Daily_Log').hooks.beforeRead = () => { if (auditAtFirstRead === null) auditAtFirstRead = g.audit().length; };
  const res = g.as(g.rt, { action: 'pharmacyOrders', date: '2026-10-20' });
  g.sheet('Daily_Log').hooks.beforeRead = null;
  T.ok('ok', res.ok === true, res);
  T.eq('the audit row was written before Daily_Log was read', auditAtFirstRead, auditBefore + 1);
  T.eq('counts for that date', res.counts, { submitted: 3, drafts: 1, active: 4 });
  T.eq('four orders', res.orders.length, 4);
  const one = res.orders.find(o => o.sessionId === 'NF-100001');
  T.eq('the fields, and only those', Object.keys(one).sort(),
    ['bed', 'bw', 'dol', 'prescriber', 'printJson', 'revision', 'savedAt', 'sessionId', 'status', 'submittedAt']);
  T.eq('bed, BW, DOL, status, revision', [one.bed, one.bw, one.dol, one.status, one.revision], ['NICU 3', 1600, 10, 'submitted', 1]);
  T.eq('the prescriber by name, without the email', one.prescriber, 'Dr Test');
  T.eq('figures on a submitted order', one.printJson.factor, '1.9');
  T.eq('none on the draft', res.orders.find(o => o.sessionId === 'NF-100004').printJson, null);
  const text = JSON.stringify(res);
  T.ok('no name or initials in the reply', !/ทารกทดสอบ|ทท/.test(text));
  T.ok('no date of birth', !/2026-10-01/.test(text));
  T.ok('no email', !/@/.test(text));
  T.eq('one audit row', g.audit().slice(auditBefore), [{ action: 'readPharmacyOrders', sessionId: '', actor: 'rx@kcmh.test' }]);
  const other = g.as(g.rt, { action: 'pharmacyOrders', date: '2026-10-21' });
  T.eq('the next date: the enteral-only order is not a TPN order', [other.counts.submitted, other.orders.length], [1, 1]);
});

T.section('§7 pharmacyOrders · revisions, who may ask, and the date', () => {
  const g = ward();
  const r1 = g.log('NF-100001', '2026-10-20', E());
  g.as(g.dt, { action: 'updateDailyNutrition', sessionId: 'NF-100001', entryId: r1.entryId,
    expectedLastModified: g.cell(1, 26), entry: E({ printJson: PJ({ factor: '2' }) }) });
  const res = g.as(g.rt, { action: 'pharmacyOrders', date: '2026-10-20' });
  T.eq('only the revision is listed', res.orders.map(o => [o.revision, o.printJson.factor]), [[2, '2']]);
  T.eq('a doctor is refused', g.as(g.dt, { action: 'pharmacyOrders', date: '2026-10-20' }).error, 'Forbidden');
  T.eq('an admin is served', g.as(g.at, { action: 'pharmacyOrders', date: '2026-10-20' }).ok, true);
  T.ok('no date → refused', /date/.test(g.as(g.rt, { action: 'pharmacyOrders' }).error || ''));
  T.ok('a malformed date → refused', /date/.test(g.as(g.rt, { action: 'pharmacyOrders', date: '20/10/2026' }).error || ''));
  // An account with no name saves a label that is only its email: nothing to show, and no email in the reply.
  g.log('NF-100002', '2026-10-22', E({}, { savedByLabel: 'admin@kcmh.test' }));
  const bare = g.as(g.rt, { action: 'pharmacyOrders', date: '2026-10-22' });
  T.eq('a label that is only an email → a blank prescriber, no email in the reply', [bare.orders.length, bare.orders[0].prescriber, /@/.test(JSON.stringify(bare))], [1, '', false]);
});

T.done();
