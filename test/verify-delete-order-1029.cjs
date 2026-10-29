// verify-delete-order-1029.cjs — an admin can delete a submitted order, and
// the delete takes every revision of it (Pp, 2026-10-29, answering Vera's
// second review of the nutrition-meeting PR, finding 2).
//
// Since 2026-10-28 every Submit locks (publishes) the order, and
// deleteDailyNutrition refused any published row, so an order saved on the
// wrong infant could not be taken off at all. Pp chose an admin delete with a
// confirm prompt and the Audit_Log rows as before. The delete removes the row
// and every revision before it: a superseded row left behind would stay on
// that infant's record, unseen, and hold the date against a new order
// (_findLogEntryOnDate).
//
// Real gas-backend.gs in gas-vm-sandbox.cjs. Fails on 4a49e9b, the source
// before this change: NEOFEED_GAS_SRC=<that file>.
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const { boot, recorder } = require('./gas-vm-sandbox.cjs');
const T = recorder('DELETE A SUBMITTED ORDER 2026-10-29');

const E = (extra) => Object.assign({ dol: 5, weight: 1250, fluid: 150, gir: 6, pro: 3, kcal: 90, na: 3, k: 2, ca: 60, p: 40,
  enVolPerKg: 20, route: 'TPN central', status: 'submitted', calcInput: { wtG: 1250, stops: [] } }, extra || {});
// Two infants different enough that registerPatient does not ask whether the
// second is the first again.
const P = (sid, bw, dob) => ({
  sessionId: sid, name: 'ทารก ' + sid, initials: sid.slice(0, 2), bw, ga: 28.1, sex: 'boys',
  dob, admissionDate: dob, twinSuffix: '', status: 'Active',
  currentBed: '', diagnosis: 'RDS', weights: [{ dol: 1, w: bw }], lengths: [], hcs: [], bedHistory: [],
  statusDate: '', multiplesCount: 0,
});

function ward() {
  const g = boot();
  g.addStaff('doc@kcmh.test', 'doctor', 'Doctor-Password-1');
  g.addStaff('admin@kcmh.test', 'admin', 'Admin-Password-1');
  g.dt = g.session('doc@kcmh.test', 'doctor');
  g.at = g.session('admin@kcmh.test', 'admin');
  g.as = (tok, body) => g.post(Object.assign({ token: tok }, body));
  g.as(g.dt, { action: 'registerPatient', isNew: true, patient: P('DL-1', 900, '2026-09-01') });
  const two = g.as(g.dt, { action: 'registerPatient', isNew: true, patient: P('KM-2', 1400, '2026-08-20') });
  if (!two.ok) throw new Error('second infant not registered: ' + JSON.stringify(two));
  g.log = (sid, ts, extra) => g.as(g.dt, { action: 'logDailyNutrition', sessionId: sid, entry: Object.assign(E(extra), { ts }) });
  g.row = (id) => g.sheet('Daily_Log').data.find(r => r[25] === id);
  g.lm = (id) => g.row(id)[26];
  g.publish = (sid, id) => g.as(g.dt, { action: 'publishLog', sessionId: sid, entryId: id, expectedLastModified: g.lm(id) });
  g.edit = (sid, id, extra) => g.as(g.dt, { action: 'updateDailyNutrition', sessionId: sid, entryId: id, expectedLastModified: g.lm(id), entry: E(extra) });
  g.del = (tok, sid, id) => g.as(tok, { action: 'deleteDailyNutrition', sessionId: sid, entryId: id });
  g.ids = () => g.sheet('Daily_Log').data.slice(1).map(r => r[25]);
  return g;
}

T.section('a submitted (published) order is deleted by an admin', () => {
  const g = ward();
  const a = g.log('DL-1', '2026-10-01');
  T.ok('the order publishes', g.publish('DL-1', a.entryId).ok === true);
  const other = g.log('DL-1', '2026-10-02');
  const res = g.del(g.at, 'DL-1', a.entryId);
  T.ok('admin delete → ok', res.ok === true, res);
  T.eq('…only that day\'s row is gone', g.ids(), [other.entryId]);
  const audit = g.audit().filter(x => x.sessionId === 'DL-1').map(x => x.action);
  T.ok('…recorded before and after (deleteDailyLog:start, deleteDailyLog)',
    audit.includes('deleteDailyLog:start') && audit.includes('deleteDailyLog'), audit);
});

T.section('every revision of the order goes with it', () => {
  const g = ward();
  const a = g.log('DL-1', '2026-10-01');
  g.publish('DL-1', a.entryId);
  const r2 = g.edit('DL-1', a.entryId, { pro: 3.5 });
  T.ok('an edit appends revision 2', r2.revised === true, r2);
  g.publish('DL-1', r2.entryId);
  const r3 = g.edit('DL-1', r2.entryId, { pro: 3.8 });
  T.ok('…and revision 3', r3.revised === true && r3.revisionNumber === 3, r3);
  const keep = g.log('KM-2', '2026-10-01');
  T.eq('four rows: three revisions of one order, one other infant', g.ids().length, 4);

  const sup = g.del(g.at, 'DL-1', a.entryId);
  T.ok('a superseded revision is not deleted on its own', !sup.ok && !!sup.error, sup);
  T.eq('…nothing was deleted', g.ids().length, 4);

  const res = g.del(g.at, 'DL-1', r3.entryId);
  T.ok('deleting the current revision → ok', res.ok === true, res);
  T.eq('…all three revisions are gone; the other infant\'s order stays', g.ids(), [keep.entryId]);
  const again = g.log('DL-1', '2026-10-01');
  T.ok('…and a new order can be saved on that date', !!again.entryId, again);
});

T.section('the guards that stay', () => {
  const g = ward();
  const a = g.log('DL-1', '2026-10-01');
  g.publish('DL-1', a.entryId);
  const doc = g.del(g.dt, 'DL-1', a.entryId);
  T.ok('a doctor cannot delete', !doc.ok, doc);
  const wrong = g.del(g.at, 'KM-2', a.entryId);
  T.ok('the wrong patient\'s id → refused', !wrong.ok, wrong);
  T.eq('…the order is still there', g.ids(), [a.entryId]);
  const d = g.log('KM-2', '2026-10-01', { status: 'draft' });
  T.ok('a draft is deleted as before', g.del(g.at, 'KM-2', d.entryId).ok === true);
});

T.done();
