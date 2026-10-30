// verify-pharmacy-backend-1030.cjs — the TPN room's half of gas-backend.gs
// (openspec/changes/tpn-room-stickers; Pp, 2026-10-30).
//
//   §1–§3  Daily_Log AM holds printJson: stored, checked, kept per revision,
//          and never sent to the ward;
//   §4     a signed-in pharmacy account reaches changePassword and pharmacyOrders and nothing else
//          (doGet answers ping; login and logout are answered before the token is checked);
//   §5     its login reply carries no registry;
//   §6–§7  pharmacyOrders: one date inside the ward window (7 days back to tomorrow), counts,
//          no name, initials or date of birth, audited;
//   §8     the header migration labels AM and widens the tab to 39 columns.
//
// Real gas-backend.gs in gas-vm-sandbox.cjs. Synthetic infants only.
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const fs = require('fs');
const { boot, recorder, withNow, wardToday, addDays, bkkMidnight, SRC_PATH } = require('./gas-vm-sandbox.cjs');
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
  g.addStaff('nurse@kcmh.test', 'nurse', 'Nurse-Password-1', { name: 'Nurse Test' });
  g.dt = g.session('doc@kcmh.test', 'doctor');
  g.nt = g.session('nurse@kcmh.test', 'nurse');
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
  // Explicit nulls and blanks mean "no figures", the same as leaving the field out.
  const nul = g.log('NF-100001', '2026-10-22', E({ printJson: null }));
  T.ok('printJson: null still lands', !!nul.entryId, nul);
  T.eq('…with AM blank', g.cell(4, 38), '');
  const emp = g.log('NF-100002', '2026-10-22', E({ printJson: '' }));
  T.ok('printJson: "" still lands', !!emp.entryId, emp);
  T.eq('…with AM blank', g.cell(5, 38), '');
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

  // An edit that carries no figures stores none. The row is replaced, not merged with the old
  // one: a revision must not inherit the figures of the order it supersedes, nor a draft keep them.
  const r3 = g.as(g.dt, { action: 'updateDailyNutrition', sessionId: 'NF-100001', entryId: r2.entryId,
    expectedLastModified: g.cell(2, 26), entry: E({ printJson: undefined }) });
  T.ok('a revision sent without figures is still a revision', r3.revised === true, r3);
  T.eq('…the new row (row 4) has AM blank', g.cell(4, 38), '');
  T.eq('…the row it superseded keeps its own figures', g.am(2).factor, '2');
  T.eq('…and so does the first revision', g.am(1).factor, '1.9');
  const up2 = g.as(g.dt, { action: 'updateDailyNutrition', sessionId: 'NF-100002', entryId: d1.entryId,
    expectedLastModified: g.cell(3, 26), entry: E({ status: 'draft', printJson: undefined }) });
  T.ok('a draft edited in place without figures', up2.ok === true && !up2.revised, up2);
  T.eq('…has AM blank', g.cell(3, 38), '');

  // A bad shape on an edit is refused as on a create, and nothing is written.
  const snap = () => JSON.stringify(g.rows('Daily_Log'));
  const before = snap();
  const badRev = g.as(g.dt, { action: 'updateDailyNutrition', sessionId: 'NF-100001', entryId: r3.entryId,
    expectedLastModified: g.cell(4, 26), entry: E({ printJson: { v: 2 } }) });
  T.ok('a revision with an unknown version → refused, naming printJson', !badRev.revised && /printJson/.test(badRev.error || ''), badRev);
  T.eq('…no row added, none changed', snap(), before);
  const badDraft = g.as(g.dt, { action: 'updateDailyNutrition', sessionId: 'NF-100002', entryId: d1.entryId,
    expectedLastModified: g.cell(3, 26), entry: E({ status: 'draft', printJson: { v: 2 } }) });
  T.ok('a draft edit with an unknown version → refused, naming printJson', !badDraft.ok && /printJson/.test(badDraft.error || ''), badDraft);
  T.eq('…the draft row is unchanged', snap(), before);
  T.eq('no formula injection recorded', g.env.injections, []);
});

T.section('§4 pharmacy · every action but changePassword and pharmacyOrders is refused, and nothing changes', () => {
  const g = ward();
  g.log('NF-100001', '2026-10-20', E());
  const src = fs.readFileSync(SRC_PATH, 'utf8');
  // `(?<![\w.])` skips `typeof body.action === "string"`, which is a type check, not an action.
  const actions = [...new Set([...src.matchAll(/(?<![\w.])action === "([A-Za-z]+)"/g)].map(m => m[1]))];
  // Not refused by the allow-list: ping is answered by doGet, login and logout before the token is
  // checked. The allow-list itself names two actions, changePassword and pharmacyOrders.
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
  // Dates are the ward's today and tomorrow, so they stay inside the date window whenever CI runs.
  const today = wardToday(), tomorrow = addDays(today, 1);
  // Same BW and dob as the two infants ward() registers, so each needs confirmDuplicate.
  g.as(g.dt, { action: 'registerPatient', isNew: true, confirmDuplicate: true, patient: P('NF-100003', 'iso 2-1') });
  g.as(g.dt, { action: 'registerPatient', isNew: true, confirmDuplicate: true, patient: P('NF-100004', 'SCN 1') });
  // A fifth infant who has left the unit: the registry takes the status, and `active` must not count it.
  const gone = g.as(g.dt, { action: 'registerPatient', isNew: true, confirmDuplicate: true,
    patient: Object.assign(P('NF-100005', 'SCN 2'), { status: 'Discharged', statusDate: today }) });
  T.ok('a discharged infant is registered', !gone.error, gone);
  const first = g.log('NF-100001', today, E({}, { savedByLabel: 'Dr Test (doc@kcmh.test)' }));
  g.log('NF-100002', today, E());
  g.log('NF-100003', today, E());
  g.log('NF-100004', today, E({ status: 'draft' }));
  g.log('NF-100001', tomorrow, E());
  g.log('NF-100002', tomorrow, E({ route: 'Enteral only', printJson: null }));
  const auditBefore = g.audit().length;
  // The audit row must exist before the log is read: note the row count at the first read.
  let auditAtFirstRead = null;
  g.sheet('Daily_Log').hooks.beforeRead = () => { if (auditAtFirstRead === null) auditAtFirstRead = g.audit().length; };
  const res = g.as(g.rt, { action: 'pharmacyOrders', date: today });
  g.sheet('Daily_Log').hooks.beforeRead = null;
  T.ok('ok', res.ok === true, res);
  T.eq('the audit row was written before Daily_Log was read', auditAtFirstRead, auditBefore + 1);
  T.eq('counts for that date (the discharged infant is not active)', res.counts, { submitted: 3, drafts: 1, active: 4 });
  T.eq('four orders', res.orders.length, 4);
  const one = res.orders.find(o => o.sessionId === 'NF-100001');
  T.eq('the fields, and only those', Object.keys(one).sort(),
    ['bed', 'bw', 'dol', 'entryId', 'multiplesCount', 'prescriber', 'printJson', 'revision', 'savedAt', 'sessionId', 'status',
      'submittedAt', 'twinSuffix']);
  T.eq('bed, BW, DOL, status, revision', [one.bed, one.bw, one.dol, one.status, one.revision], ['NICU 3', 1600, 10, 'submitted', 1]);
  T.eq('the prescriber by name, without the email', one.prescriber, 'Dr Test');
  T.eq('figures on a submitted order', one.printJson.factor, '1.9');
  T.eq('none on the draft', res.orders.find(o => o.sessionId === 'NF-100004').printJson, null);
  const text = JSON.stringify(res);
  T.ok('no name or initials in the reply', !/ทารกทดสอบ|ทท/.test(text));
  T.ok('no date of birth', !/2026-10-01/.test(text));
  T.ok('no email', !/@/.test(text));
  T.eq('one audit row', g.audit().slice(auditBefore), [{ action: 'readPharmacyOrders', sessionId: '', actor: 'rx@kcmh.test' }]);
  const other = g.as(g.rt, { action: 'pharmacyOrders', date: tomorrow });
  T.eq('the next date: the enteral-only order is not a TPN order', [other.counts.submitted, other.orders.length], [1, 1]);

  // Submit is the action the app calls after a submitted save. It writes AH (the time) and, next to it,
  // AI: publishedBy, an email. The list shows the time and nothing of the email.
  const pub = g.as(g.dt, { action: 'publishLog', sessionId: 'NF-100001', entryId: first.entryId, expectedLastModified: g.cell(1, 26) });
  T.ok('the order is published', pub.ok === true && !!pub.publishedAt, pub);
  T.eq('the email is in AI of the sheet, so the no-@ check below can fail', g.cell(1, 34), 'doc@kcmh.test');
  const after = g.as(g.rt, { action: 'pharmacyOrders', date: today });
  const pubd = after.orders.find(o => o.sessionId === 'NF-100001');
  T.eq('submittedAt is the publishedAt that publish returned', pubd.submittedAt, pub.publishedAt);
  T.eq('savedAt is the row\'s lastModified', pubd.savedAt, g.cell(1, 26));
  T.eq('a draft has no submittedAt', after.orders.find(o => o.sessionId === 'NF-100004').submittedAt, '');
  T.ok('still no @ anywhere in the reply', !/@/.test(JSON.stringify(after)));
});

T.section('§7 pharmacyOrders · revisions, who may ask, and the date window', () => {
  const g = ward();
  const today = wardToday(), yesterday = addDays(today, -1);
  const r1 = g.log('NF-100001', today, E());
  g.as(g.dt, { action: 'updateDailyNutrition', sessionId: 'NF-100001', entryId: r1.entryId,
    expectedLastModified: g.cell(1, 26), entry: E({ printJson: PJ({ factor: '2' }) }) });
  const ask = (tok, date) => g.as(tok, { action: 'pharmacyOrders', date });
  const res = ask(g.rt, today);
  T.eq('only the revision is listed', res.orders.map(o => [o.revision, o.printJson.factor]), [[2, '2']]);

  // Who may ask. A refusal reads nothing and writes no audit row.
  let a = g.audit().length;
  T.eq('a doctor is refused', ask(g.dt, today).error, 'Forbidden');
  T.eq('a nurse is refused', ask(g.nt, today).error, 'Forbidden');
  T.eq('…and neither wrote an audit row', g.audit().length, a);
  T.eq('an admin is served', ask(g.at, today).ok, true);

  // The date: a real calendar date from 7 days ago to tomorrow, by the ward's clock.
  const refused = [
    ['no date', undefined, /date/],
    ['a malformed date', '20/10/2026', /date/],
    ['an impossible date (month 13)', '2026-13-45', /real date.*7 days ago to tomorrow/],
    ['an impossible date (30 February)', '2026-02-30', /real date.*7 days ago to tomorrow/],
    ['8 days ago', addDays(today, -8), /real date.*7 days ago to tomorrow/],
    ['2 days ahead', addDays(today, 2), /real date.*7 days ago to tomorrow/],
  ];
  for (const [label, date, why] of refused) {
    a = g.audit().length;
    const bad = ask(g.rt, date);
    T.ok(`${label} → refused`, !bad.ok && why.test(bad.error || ''), bad);
    T.eq('…no audit row', g.audit().length, a);
  }
  for (const [label, date] of [['7 days ago', addDays(today, -7)], ['tomorrow', addDays(today, 1)], ['yesterday', yesterday]]) {
    a = g.audit().length;
    const okRes = ask(g.rt, date);
    T.ok(`${label} → served`, okRes.ok === true && okRes.date === date, okRes);
    T.eq('…and audited once', g.audit().length, a + 1);
  }

  // The label a client writes is not read: the prescriber is the saver's Staff name (§9), and no email reaches the reply.
  g.log('NF-100002', yesterday, E({}, { savedByLabel: 'admin@kcmh.test' }));
  const bare = ask(g.rt, yesterday);
  T.eq('a label that is only an email is ignored: the saver\'s Staff name, no email in the reply', [bare.orders.length, bare.orders[0].prescriber, /@/.test(JSON.stringify(bare))], [1, 'Dr Test', false]);

  // The calendar check on its own. With the ward's clock at 1 March, "30 February" parses to 2 March:
  // tomorrow, inside the window. Only the real-date round trip refuses it. Last in the section,
  // because the pinned clock leaves the cached pharmacy session expired once the real clock is back.
  a = g.audit().length;
  withNow(Date.parse('2026-03-01T05:00:00Z'), () => {
    const feb30 = ask(g.rt, '2026-02-30');
    T.ok('30 February is refused even when the day it parses to is tomorrow', !feb30.ok && /real date/.test(feb30.error || ''), feb30);
    T.eq('…while 2 March, asked for as itself, is served', ask(g.rt, '2026-03-02').ok, true);
  });
  T.eq('…one audit row, for the date that was real', g.audit().length, a + 1);
});

T.section('§8 header migration · ensureLogHeaderColumns labels AM and widens to 39', () => {
  // A deploy runs applyLogHeaderColumns (the editor's Run button cannot pass an argument).
  const g = boot();   // Daily_Log as the live tab is today: A–AL, 38 wide, no AM
  const sh = g.sheet('Daily_Log');
  T.eq('before: 38 wide, 38 headers', [sh.getMaxColumns(), sh.data[0].length], [38, 38]);
  const dry = g.sb.ensureLogHeaderColumns();
  T.eq('a dry run reports the widening and the label it brings', dry.changes,
    ['grid: 38 -> 39 columns (+1)', "col 39: '' -> 'printJson' (after the widening)"]);
  T.eq('…and writes nothing', [sh.getMaxColumns(), sh.data[0].length], [38, 38]);
  const done = g.sb.applyLogHeaderColumns();
  T.eq('applyLogHeaderColumns widens the grid to 39', sh.getMaxColumns(), 39);
  T.eq('…and labels AM printJson', sh.data[0][38], 'printJson');
  T.eq('…reporting both', done.changes, ['grid: 38 -> 39 columns (+1)', "col 39: '' -> 'printJson'"]);
  T.eq('…and the header row it returns runs to AM', [done.headerRowAfter.length, done.headerRowAfter[38]], [39, 'printJson']);
  T.eq('a second run changes nothing', g.sb.applyLogHeaderColumns().changes, []);

  // Someone else's label in AM is left alone, as for every other column.
  const h = boot();
  const hs = h.sheet('Daily_Log');
  hs.maxColumns = 39; hs.data[0][38] = 'notes';
  const kept = h.sb.applyLogHeaderColumns();
  T.eq('an occupied AM1 is not overwritten', [hs.data[0][38], kept.changes], ['notes', []]);

  // A dry run on a tab still short of the grid reads only what exists (it used to ask for 38 columns regardless).
  const n = boot();
  const ns = n.sheet('Daily_Log');
  ns.maxColumns = 31; ns.data[0].length = 31;
  let narrow = null;
  try { narrow = n.sb.ensureLogHeaderColumns(); } catch (e) { narrow = { threw: e.message }; }
  T.eq('a dry run on a 31-column tab does not throw, and reports the widening', narrow.changes[0], 'grid: 31 -> 39 columns (+8)');
  T.eq('…with the eight labels past the grid', narrow.changes.slice(1).map(c => /^col (\d+): .* \(after the widening\)$/.exec(c)[1]),
    ['32', '33', '34', '35', '36', '37', '38', '39']);

  // The tab the walkthrough found: 38 wide with AC–AL blank. The dry run used to list one change and the apply twelve.
  const b = boot();
  const bs = b.sheet('Daily_Log');
  for (let c = 28; c < 38; c++) bs.data[0][c] = '';
  const bdry = b.sb.ensureLogHeaderColumns();
  const bdone = b.sb.applyLogHeaderColumns();
  T.eq('on a 38-wide tab with AC–AL blank, the dry run lists what the apply then does', bdry.changes.length, bdone.changes.length);
  T.eq('…twelve: the grid, AC–AL and AM', bdone.changes.length, 12);
});

// The attack pass and the stakeholder walkthrough on e1a7e87, and the task review of their fixes
// (2026-10-30), found these; each case fails with its fix taken out.
T.section('§9 pharmacyOrders · prescriber and bed come from the server, not from what a client wrote', () => {
  const g = ward();
  const today = wardToday();
  g.addStaff('doc2@kcmh.test', 'doctor', 'Doctor-Password-2', { name: 'doc2@kcmh.test' });
  g.addStaff('doc3@kcmh.test', 'doctor', 'Doctor-Password-3', { name: 'Dr Three' });
  const d2 = g.session('doc2@kcmh.test', 'doctor');
  const d3 = g.session('doc3@kcmh.test', 'doctor');
  g.as(g.dt, { action: 'registerPatient', isNew: true, confirmDuplicate: true, patient: P('NF-100006', 'SENTINEL-BED TEST0001') });
  g.as(g.dt, { action: 'registerPatient', isNew: true, confirmDuplicate: true, patient: P('NF-100007', 'NICU 5') });
  g.as(g.dt, { action: 'registerPatient', isNew: true, confirmDuplicate: true, patient: P('NF-100008', 'NICU 6') });
  g.as(g.dt, { action: 'registerPatient', isNew: true, confirmDuplicate: true, patient: P('NF-100009', 'NICU 9') });
  g.log('NF-100001', today, E({}, { savedByLabel: 'Prof Synthetic Boss (boss@kcmh.test)' }));
  g.log('NF-100002', today, E({}, { savedByLabel: 'SENTINEL-LABEL <img src=x onerror=alert(1)>' }));
  const bedRow = g.log('NF-100006', today, E());
  const ns = g.as(g.nt, { action: 'logDailyNutrition', sessionId: 'NF-100007',
    entry: E({ ts: today }, { savedByLabel: 'Dr Test (doc@kcmh.test)' }) });
  T.ok('a nurse save lands while the nursing switch is off', !!ns.entryId, ns);
  g.as(d2, { action: 'logDailyNutrition', sessionId: 'NF-100008', entry: E({ ts: today }) });
  // A revision by a second doctor: P (submittedBy) keeps the first saver, AB names the second.
  const r1 = g.log('NF-100009', today, E());
  const rev = g.as(d3, { action: 'updateDailyNutrition', sessionId: 'NF-100009', entryId: r1.entryId,
    expectedLastModified: r1.lastModified, entry: E({ ts: today, gir: 8 }) });
  T.ok('the second doctor\'s revision lands', !!rev.entryId || rev.ok === true, rev);
  // An AB cell in another case than the Staff tab (typed by hand, or from an older save).
  const L = g.sheet('Daily_Log');
  const bedIdx = L.data.findIndex(r => r[25] === bedRow.entryId);
  L.data[bedIdx][27] = 'DOC@KCMH.Test';
  const res = g.as(g.rt, { action: 'pharmacyOrders', date: today });
  const of = (sid) => res.orders.find(o => o.sessionId === sid);
  T.eq('the saver\'s Staff name, not the label the client sent',
    [of('NF-100001').prescriber, of('NF-100002').prescriber], ['Dr Test', 'Dr Test']);
  T.eq('a nurse\'s save names the nurse', of('NF-100007').prescriber, 'Nurse Test');
  T.eq('a Staff name that is an email gives a blank prescriber', of('NF-100008').prescriber, '');
  T.eq('a revision names who saved it (AB), not who saved the first version (P)', of('NF-100009').prescriber, 'Dr Three');
  T.eq('the saver\'s email matches the Staff tab whatever its case', of('NF-100006').prescriber, 'Dr Test');
  T.eq('a free-text bed comes back blank; a ward bed as it is',
    [of('NF-100006').bed, of('NF-100001').bed, of('NF-100002').bed], ['', 'NICU 3', 'SCN 12']);
  const text = JSON.stringify(res);
  T.ok('no client text, markup or email in the reply', !/SENTINEL|<img|Boss|@/.test(text), text.slice(0, 400));
});

T.section('§10 pharmacyOrders · a column moved by hand is refused at once; a cell edited by hand is held to shape', () => {
  const today = wardToday();
  // No figures: a row whose AM is blank would stay listed once columns shift, so its other cells get read.
  const setup = () => {
    const g = ward();
    const s = g.log('NF-100001', today, E({ printJson: undefined }));
    g.as(g.dt, { action: 'publishLog', sessionId: 'NF-100001', entryId: s.entryId, expectedLastModified: s.lastModified });
    return g;
  };
  const ask = (g) => g.as(g.rt, { action: 'pharmacyOrders', date: today });
  let g = setup();
  T.ok('the sheet holds staff emails in AB and AI, so the checks below can fail',
    g.cell(1, 27) === 'doc@kcmh.test' && g.cell(1, 34) === 'doc@kcmh.test');
  // The save above cached a passing schema verdict for 10 minutes; this read does not rely on it.
  T.ok('the write guard\'s verdict is cached', !!g.cacheStore.get('schema1_Daily_Log'));
  g.sheet('Daily_Log').deleteColumns(17, 1);   // column Q, as a hand edit in the Sheets UI would
  const auditBefore = g.audit().length;
  const del = ask(g);
  T.eq('a deleted Daily_Log column is refused at once, inside the cached window', del.code, 'SchemaMismatch');
  T.ok('…with no orders and no email in the reply', !('orders' in del) && !/@/.test(JSON.stringify(del)), del);
  T.eq('…and it is still audited (the ask came in)', g.audit().length, auditBefore + 1);

  g = setup();
  const L = g.sheet('Daily_Log');
  L.data.forEach(r => r.splice(16, 0, ''));   // a blank column inserted at Q: calcInputJson moves into Z
  L.maxColumns += 1;
  const ins = ask(g);
  T.eq('an inserted Daily_Log column is refused too', ins.code, 'SchemaMismatch');
  T.ok('…and no calcInput text reaches the reply', !/wtG|stops|@/.test(JSON.stringify(ins)), ins);

  g = setup();
  g.sheet('Patient_Registry').deleteColumns(3, 1);
  T.eq('a deleted Patient_Registry column is refused', ask(g).code, 'SchemaMismatch');

  // Cells typed over by hand, headers intact: entryId, savedAt and submittedAt keep their shape or come back blank.
  g = setup();
  const row = g.sheet('Daily_Log').data[1];
  row[25] = '{"savedByLabel":"Prof SENTINEL (boss@kcmh.test)"}';
  row[26] = 'doc@kcmh.test';
  row[33] = 'doc@kcmh.test';
  const hand = ask(g);
  T.eq('a hand-typed entryId, savedAt and submittedAt come back blank',
    [hand.orders[0].entryId, hand.orders[0].savedAt, hand.orders[0].submittedAt], ['', '', '']);
  T.ok('…and nothing of what was typed is in the reply', !/SENTINEL|@/.test(JSON.stringify(hand)), JSON.stringify(hand));
});

T.section('§11 Staff roles fail closed, and setInitialPassword never invents one', () => {
  for (const role of ['constructor', '__proto__']) {
    const g = boot();
    g.addStaff('odd@kcmh.test', role, 'Odd-Password-1', { name: 'Odd' });
    const li = g.post({ action: 'login', email: 'odd@kcmh.test', password: 'Odd-Password-1', wantSync: true });
    T.ok(`a Staff role "${role}" cannot sign in`, li.status !== 'ok' && !li.sync, li);
    const tok = g.session('odd@kcmh.test', 'doctor');
    T.eq(`…and a session for it is refused`, g.post({ action: 'getActivePatients', token: tok }), { error: 'Unauthorized' });
  }

  const g = boot();
  const has = (email) => g.sheet('Staff').data.find(r => r[0] === email);
  g.sb.setInitialPassword('new.rx@kcmh.test', 'Initial-Password-1');
  T.eq('a new email with no role adds no Staff row', !!has('new.rx@kcmh.test'), false);
  g.sb.setInitialPassword('new.rx@kcmh.test', 'Initial-Password-1', 'boss');
  T.eq('…nor with a role that does not exist', !!has('new.rx@kcmh.test'), false);
  g.sb.setInitialPassword('new.rx@kcmh.test', 'Initial-Password-1', 'Pharmacy');
  T.eq('with a role, the new row carries it, active', [has('new.rx@kcmh.test')[1], has('new.rx@kcmh.test')[3]], ['pharmacy', true]);
  const li = g.post({ action: 'login', email: 'new.rx@kcmh.test', password: 'Initial-Password-1', wantSync: true });
  T.eq('…and signs in as that role, with no registry', [li.status, li.role, 'sync' in li], ['ok', 'pharmacy', false]);
  g.addStaff('nurse2@kcmh.test', 'nurse', 'Old-Password-1');
  g.sb.setInitialPassword('nurse2@kcmh.test', 'New-Password-1', 'admin');
  T.eq('an existing row keeps its role (the Staff tab changes roles)', has('nurse2@kcmh.test')[1], 'nurse');
  const n2 = g.post({ action: 'login', email: 'nurse2@kcmh.test', password: 'New-Password-1' });
  T.eq('…and takes the new password', [n2.status, n2.role], ['ok', 'nurse']);
});

T.section('§12 pharmacyOrders · entryId and the twin letter tell orders and infants apart; one date is read, not the tab', () => {
  const g = ward();
  const today = wardToday();
  const ask = () => g.as(g.rt, { action: 'pharmacyOrders', date: today });
  const of = (res, sid) => res.orders.find(o => o.sessionId === sid);

  const first = g.log('NF-100001', today, E());
  const before = of(ask(), 'NF-100001');
  T.eq('each order carries its row\'s entryId', before.entryId, first.entryId);
  const del = g.as(g.at, { action: 'deleteDailyNutrition', sessionId: 'NF-100001', entryId: first.entryId });
  T.ok('an admin deletes the order (written on the wrong infant)', del.ok === true, del);
  g.log('NF-100001', today, E());
  const after = of(ask(), 'NF-100001');
  T.eq('the order written again is revision 1 as well', [before.revision, after.revision], [1, 1]);
  T.ok('…but a different entryId, so the room can tell a new order from the one it printed',
    !!after.entryId && after.entryId !== before.entryId, [before.entryId, after.entryId]);

  for (const [sid, bed, letter, size] of [['NF-200001', 'NICU 7', 'A', 2], ['NF-200002', 'NICU 8', 'B', 2],
    ['NF-200003', 'NICU 10', 'TWINSENTINEL', 0]]) {
    g.as(g.dt, { action: 'registerPatient', isNew: true, confirmDuplicate: true,
      patient: Object.assign(P(sid, bed), { twinSuffix: letter, multiplesCount: size }) });
    g.log(sid, today, E());
  }
  const res = ask();
  T.eq('twins carry their letter and the set size (same BW and DOL otherwise)',
    ['NF-200001', 'NF-200002'].map(s => [of(res, s).twinSuffix, of(res, s).multiplesCount]), [['A', 2], ['B', 2]]);
  T.eq('a singleton carries none', [of(res, 'NF-100001').twinSuffix, of(res, 'NF-100001').multiplesCount], ['', 0]);
  T.eq('a twin cell holding anything but A–D comes back blank', of(res, 'NF-200003').twinSuffix, '');
  T.ok('…and its text is nowhere in the reply', !/TWINSENTINEL/.test(JSON.stringify(res)));

  // 2,000 rows on older dates above today's: the read is two columns plus today's rows, not the tab.
  const L = g.sheet('Daily_Log');
  const old = [];
  for (let i = 0; i < 2000; i++) old.push(g.logRow('NF-100002', bkkMidnight(addDays(today, -30 - (i % 200))), {}));
  L.data.splice(1, 0, ...old);
  L.stats.cellsRead = 0;
  const big = ask();
  const n = L.data.length - 1;
  T.eq('the same orders come back', big.orders.length, res.orders.length);
  T.ok('cells read: columns A and Z plus a few rows, not 39 per row',
    L.stats.cellsRead <= 2 * n + 10 * 39 && L.stats.cellsRead < n * 3, { cellsRead: L.stats.cellsRead, rows: n });

  // An edit lands between the first read and the block read. The reader must notice and read the tab again.
  const race = (mutate) => {
    const h = boot();
    const R = h.sheet('Daily_Log');
    for (let i = 0; i < 300; i++) R.data.push(h.logRow('NF-OLD' + i, bkkMidnight(addDays(today, -20)), {}));
    for (let i = 0; i < 5; i++) R.data.push(h.logRow('NF-T' + i, bkkMidnight(today), { 25: 'e-today-' + i }));
    let done = false;
    R.hooks.beforeRead = (sh, r, c, nr, nc) => { if (!done && nc > 1) { done = true; mutate(sh, h); } };
    const got = h.sb._pharmacyLogRows(R, today).filter(x => h.sb._wardDateKey(x[0]) === today).map(x => x[25]).sort();
    R.hooks.beforeRead = null;
    const truth = R.data.slice(1).filter(x => h.sb._wardDateKey(x[0]) === today).map(x => x[25]).sort();
    return [got, truth];
  };
  const moved = race((sh, h) => {
    sh.data.splice(5, 1);                                                          // an old row deleted above the block
    sh.data.push(h.logRow('NF-T9', bkkMidnight(today), { 25: 'e-today-9' }));      // a ward save for today, same row count
  });
  T.eq('a row deleted above and one appended, same row count: every order of the day still comes back', moved[0], moved[1]);
  const grew = race((sh, h) => sh.data.push(h.logRow('NF-T9', bkkMidnight(today), { 25: 'e-today-9' })));
  T.eq('a ward save appended during the read is in the result', grew[0], grew[1]);
});

T.done();
