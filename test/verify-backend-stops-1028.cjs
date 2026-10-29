// verify-backend-stops-1028.cjs — the backend refuses a submitted order a stop
// holds (Pp, 2026-10-28: "แอปส่งผลเช็กไปด้วย").
//
// The backend has no copy of the bag arithmetic, so the app sends the stops
// that hold, by the neofeed-clinical-rules skill's IDs, as calcInput.stops on
// every save. gas-backend.gs refuses a submitted row that carries one, and a
// submitted row with no list at all: a tab opened before the app sent one,
// still running the rules of its day. A draft is kept either way. Submit with
// the publish gate on (publishDailyLog) reads the list stored with the row.
//
// Real gas-backend.gs in gas-vm-sandbox.cjs. Fails on 07f3403, the source
// before this check: NEOFEED_GAS_SRC=<that file>.
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const { boot, recorder } = require('./gas-vm-sandbox.cjs');
const T = recorder('BACKEND STOPS 2026-10-28');

const E = (extra, ci) => Object.assign({ dol: 5, weight: 1250, fluid: 150, gir: 6, pro: 3, kcal: 90, na: 3, k: 2, ca: 60, p: 40,
  enVolPerKg: 20, route: 'TPN central', status: 'submitted', calcInput: Object.assign({ wtG: 1250 }, ci) }, extra || {});
const P = (sid) => ({
  sessionId: sid, name: 'ทารก ' + sid, initials: sid.slice(0, 2), bw: 900, ga: 28.1, sex: 'boys',
  dob: '2026-09-01', admissionDate: '2026-09-01', twinSuffix: '', status: 'Active',
  currentBed: '', diagnosis: 'RDS', weights: [{ dol: 1, w: 900 }], lengths: [], hcs: [], bedHistory: [],
  statusDate: '', multiplesCount: 0,
});
const STALE = /แอปในแท็บนี้เป็นรุ่นเก่า/;
const STOPPED = /ติด stop/;

function ward() {
  const g = boot();
  g.addStaff('doc@kcmh.test', 'doctor', 'Doctor-Password-1');
  g.addStaff('admin@kcmh.test', 'admin', 'Admin-Password-1');
  g.dt = g.session('doc@kcmh.test', 'doctor');
  g.at = g.session('admin@kcmh.test', 'admin');
  g.as = (tok, body) => g.post(Object.assign({ token: tok }, body));
  g.as(g.dt, { action: 'registerPatient', isNew: true, patient: P('ST-1') });
  g.log = (ts, entry) => g.as(g.dt, { action: 'logDailyNutrition', sessionId: 'ST-1', entry: Object.assign(entry, { ts }) });
  g.rows = () => g.sheet('Daily_Log').data.length - 1;
  return g;
}

T.section('create · a submitted row carries the list, and it is empty', () => {
  const g = ward();
  const ok = g.log('2026-10-01', E({}, { stops: [] }));
  T.ok('stops [] → saved', !!ok.entryId, ok);
  const stored = JSON.parse(g.sheet('Daily_Log').data[1][24]);
  T.eq('…the list is stored with the row (calcInputJson)', stored.stops, []);

  const over = g.log('2026-10-02', E({}, { stops: ['CR-BAG-OVERFULL'] }));
  T.ok('stops ["CR-BAG-OVERFULL"] → refused', !over.entryId && STOPPED.test(over.error || ''), over);
  T.ok('…the refusal names the stop', /CR-BAG-OVERFULL/.test(over.error || ''), over.error);
  const two = g.log('2026-10-02', E({}, { stops: ['CR-K-BAG-MAX', 'CR-BOTTLE-MAX'] }));
  T.ok('two stops → refused, both named', /CR-K-BAG-MAX/.test(two.error || '') && /CR-BOTTLE-MAX/.test(two.error || ''), two);
  const odd = g.log('2026-10-02', E({}, { stops: ['=IMPORTXML("x")'] }));
  T.ok('a stop that is not a rule ID → refused, and not echoed back', STOPPED.test(odd.error || '') && !/IMPORTXML/.test(odd.error || ''), odd);
  T.eq('nothing was written by the three refusals', g.rows(), 1);
});

T.section('create · a submitted row with no list is a stale tab', () => {
  const g = ward();
  const noList = g.log('2026-10-01', E());
  T.ok('calcInput without stops → refused, reload asked', !noList.entryId && STALE.test(noList.error || ''), noList);
  const noCi = g.log('2026-10-01', E({ calcInput: undefined }));
  T.ok('no calcInput at all → refused the same way', !noCi.entryId && STALE.test(noCi.error || ''), noCi);
  const notArray = g.log('2026-10-01', E({}, { stops: 'CR-BAG-OVERFULL' }));
  T.ok('stops as a string, not a list → refused as stale', !notArray.entryId && STALE.test(notArray.error || ''), notArray);
  const noStatus = g.log('2026-10-01', E({ status: undefined }));
  T.ok('no status reads as submitted (the row builder\'s rule) → refused', !noStatus.entryId && STALE.test(noStatus.error || ''), noStatus);
  T.eq('nothing was written', g.rows(), 0);
});

T.section('create · a draft is kept, with or without stops', () => {
  const g = ward();
  const d1 = g.log('2026-10-01', E({ status: 'draft' }, { stops: ['CR-BAG-OVERFULL'] }));
  T.ok('draft with a stop → saved', !!d1.entryId, d1);
  const d2 = g.log('2026-10-02', E({ status: 'draft' }));
  T.ok('draft with no list (stale tab) → saved', !!d2.entryId, d2);
  T.eq('two rows', g.rows(), 2);
});

T.section('update · the same rule on an edit and on a revision', () => {
  const g = ward();
  const d = g.log('2026-10-01', E({ status: 'draft' }, { stops: ['CR-BAG-OVERFULL'] }));
  const up = (entry, c) => g.as(g.dt, { action: 'updateDailyNutrition', sessionId: 'ST-1', entryId: c.entryId, expectedLastModified: c.lastModified, entry });
  const r1 = up(E({}, { stops: ['CR-BAG-OVERFULL'] }), d);
  T.ok('draft → submitted with a stop → refused', !r1.ok && STOPPED.test(r1.error || ''), r1);
  const r2 = up(E(), d);
  T.ok('draft → submitted with no list → refused as stale', !r2.ok && STALE.test(r2.error || ''), r2);
  const r3 = up(E({}, { stops: [] }), d);
  T.ok('draft → submitted with stops [] → saved', r3.ok === true, r3);
  T.ok('…in place: a draft is not revised', !r3.revised && g.rows() === 1, r3);

  // A published row is edited by appending a revision (updateDailyNutrition).
  const s = g.log('2026-10-02', E({ status: 'draft' }, { stops: [] }));
  const pub = g.as(g.dt, { action: 'publishLog', sessionId: 'ST-1', entryId: s.entryId, expectedLastModified: s.lastModified });
  T.ok('a clean draft publishes', pub.ok === true, pub);
  const lm = g.sheet('Daily_Log').data.find(r => r[25] === s.entryId)[26];
  const rev = up(E({}, { stops: ['CR-STOCK-ZERO'] }), { entryId: s.entryId, lastModified: lm });
  T.ok('a revision with a stop → refused', !rev.ok && STOPPED.test(rev.error || ''), rev);
  T.eq('…and no revision row was appended', g.rows(), 2);
});

// Pp, 2026-10-29 (Vera's second review, finding 1): every order submitted
// before this release has no stop list, so publishDailyLog refuses it, and a
// client that locked it before editing could never edit or reprint it. The
// backend now revises any row stored as submitted, published or not; a blank
// status reads as submitted, as the read path has it.
T.section('update · an order submitted before the list is revised, never overwritten', () => {
  const g = ward();
  const up = (entry, id) => {
    const lm = g.sheet('Daily_Log').data.find(r => r[25] === id)[26];
    return g.as(g.dt, { action: 'updateDailyNutrition', sessionId: 'ST-1', entryId: id, expectedLastModified: lm, entry });
  };
  const old = (ts, status) => {
    const d = g.log(ts, E({ status: 'draft' }));
    g.sheet('Daily_Log').data.find(r => r[25] === d.entryId)[14] = status;
    return d.entryId;
  };
  const id = old('2026-10-01', 'submitted');
  const before = JSON.stringify(g.sheet('Daily_Log').data.find(r => r[25] === id).slice(0, 26));
  const rev = up(E({ pro: 3.5 }, { stops: [] }), id);
  T.ok('a submitted, unpublished row with no list → a revision', rev.ok === true && rev.revised === true && rev.revisionNumber === 2, rev);
  const oldRow = g.sheet('Daily_Log').data.find(r => r[25] === id);
  T.ok('…the old row is superseded', !!oldRow[37], oldRow[37]);
  T.eq('…its order is left as it was', JSON.stringify(oldRow.slice(0, 25)), JSON.stringify(JSON.parse(before).slice(0, 25)));
  const newRow = g.sheet('Daily_Log').data.find(r => r[25] === rev.entryId);
  T.ok('…the revision names the row it replaces', newRow && newRow[36] === id, newRow && newRow[36]);
  const pub = g.as(g.dt, { action: 'publishLog', sessionId: 'ST-1', entryId: rev.entryId, expectedLastModified: rev.lastModified });
  T.ok('…and the revision publishes', pub.ok === true && !!pub.publishedAt, pub);

  const blank = old('2026-10-02', '');
  const r2 = up(E({ pro: 3.5 }, { stops: [] }), blank);
  T.ok('a row with a blank status (read as submitted) → a revision', r2.ok === true && r2.revised === true, r2);

  const draft = old('2026-10-03', 'draft');
  const r3 = up(E({ pro: 3.5 }, { stops: [] }), draft);
  T.ok('a draft is still saved in place', r3.ok === true && !r3.revised, r3);
  T.eq('three days, two of them revised: five rows', g.rows(), 5);
});

// Pp, 2026-10-29 (Vera's third review, finding 1): a tab opened on the release
// before the meeting change sends a stop list, so the check above lets it
// through, and it would go on printing the old sheet (Vitalipid not rounded
// down, Mg in mEq). A submitted save computed on a CONSTANTS_VERSION older
// than the backend's minimum is refused and the tab asked to reload; a draft
// still saves. A save with no version, or one the backend cannot read, is let
// through: no live client sends either.
T.section('a submitted save computed on an older calculation is refused', () => {
  const g = ward();
  const OLD = { constantsVersion: '2026-10-27.2' };
  const old = g.log('2026-10-01', E(OLD, { stops: [] }));
  T.ok('submitted, version 2026-10-27.2 → refused, reload asked', !old.entryId && STALE.test(old.error || ''), old);
  const draft = g.log('2026-10-01', E(Object.assign({ status: 'draft' }, OLD), { stops: [] }));
  T.ok('…the same as a draft → saved', !!draft.entryId, draft);
  const up = g.as(g.dt, { action: 'updateDailyNutrition', sessionId: 'ST-1', entryId: draft.entryId, expectedLastModified: draft.lastModified, entry: E(OLD, { stops: [] }) });
  T.ok('…and submitting that draft from the old tab → refused', !up.ok && STALE.test(up.error || ''), up);
  const cur = g.log('2026-10-02', E({ constantsVersion: '2026-10-28.1' }, { stops: [] }));
  T.ok('submitted, version 2026-10-28.1 → saved', !!cur.entryId, cur);
  const later = g.log('2026-10-03', E({ constantsVersion: '2026-11-02.1' }, { stops: [] }));
  T.ok('a later version → saved', !!later.entryId, later);
  const none = g.log('2026-10-04', E({}, { stops: [] }));
  T.ok('no version at all → saved', !!none.entryId, none);
  const before = g.sb._constantsVersionBefore;
  T.ok('2026-10-28.9 is before 2026-10-28.10 (numbers, not text)', typeof before === 'function' && before('2026-10-28.9', '2026-10-28.10') === true);
  T.ok('2026-10-28.1 is not before itself', typeof before === 'function' && before('2026-10-28.1', '2026-10-28.1') === false);
  T.ok('an unreadable version is not "before"', typeof before === 'function' && before('2026-test', '2026-10-28.1') === false);
});

T.section('publishDailyLog · reads the list stored with the row', () => {
  const g = ward();
  const pub = (c) => g.as(g.dt, { action: 'publishLog', sessionId: 'ST-1', entryId: c.entryId, expectedLastModified: c.lastModified });
  const withStop = g.log('2026-10-01', E({ status: 'draft' }, { stops: ['CR-BAG-OVERFULL'] }));
  const p1 = pub(withStop);
  T.ok('a draft stored with a stop → Submit refused', !p1.ok && STOPPED.test(p1.error || ''), p1);
  const stale = g.log('2026-10-02', E({ status: 'draft' }));
  const p2 = pub(stale);
  T.ok('a draft stored with no list → Submit refused, reopen and save asked', !p2.ok && /บันทึกใหม่/.test(p2.error || ''), p2);
  T.ok('…neither row is published', g.sheet('Daily_Log').data.slice(1).every(r => !r[33]));
  const clean = g.log('2026-10-03', E({ status: 'draft' }, { stops: [] }));
  const p3 = pub(clean);
  T.ok('a draft stored with stops [] → Submit accepted', p3.ok === true && !!p3.publishedAt, p3);
});

T.done();
