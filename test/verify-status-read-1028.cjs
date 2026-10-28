// verify-status-read-1028.cjs — the backend reads a patient status the way the
// client does (Pp, 2026-10-28: "แก้ backend ให้อ่าน status แบบเดียวกับ client").
//
// The client reads a status through D.patientStatus (data.js): blank is Active,
// one of the four whatever its case or spaces is that status, anything else
// stays as typed and is not on the unit. The server read the same cell three
// ways: the sync window trimmed but matched case, the bed guard compared the
// raw cell, and the write turned an unknown word into Active. Now one helper,
// _readStatus, reads it on every server path, and the write refuses a status
// that is not one of the four, so Edit session asks for one instead of
// echoing it back.
//
//   §1  _readStatus / _onUnitStatus give exactly D.patientStatus / D.isOnUnit
//   §2  the sync: "active" with no statusDate reaches the ward (it did not);
//       an unknown word still needs a recent statusDate
//   §3  the bed guard: "Active " and "active" hold their bed; "Expird" does not
//   §4  the write: an unknown status is refused, in Thai, and nothing changes;
//       a case/space variant is stored canonical; a stored "Expird" edited
//       with only the diagnosis changed is refused, and saved once a status is
//       picked (Vera's case); a stored "active " is written back as "Active"
//   §5  Edit session: a stored "Expird" seeds the Status select blank, says
//       why, and Save stays off until a status is picked
//
// ── NEGATIVE CONTROL ───────────────────────────────────────────────────────
//   NEOFEED_GAS_SRC=<86bfc91's gas-backend.gs> node test/verify-status-read-1028.cjs
// fails §1–§4 (no _readStatus; "active" not synced; "Active " holds no bed;
// "ZZZ" accepted as Active; "Expird" revived). §5 fails on 86bfc91's
// registry.jsx (the select seeds "Expird" and Save is on).
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { boot, recorder, wardToday, addDays } = require('./gas-vm-sandbox.cjs');
const T = recorder('STATUS READ 2026-10-28 · BACKEND = CLIENT');
const DIR = path.join(__dirname, '..') + '/';
const SRC = process.env.NEOFEED_GAS_SRC;
const TODAY = wardToday();

// The client's reading, from data.js itself.
const dctx = { window: {}, console, Date, Intl, Math, JSON };
vm.createContext(dctx);
vm.runInContext(fs.readFileSync(DIR + 'data.js', 'utf8'), dctx);
const D = dctx.window.NEOFEED_DATA;

function ward() {
  const g = boot(SRC ? { src: SRC } : undefined);
  g.addStaff('doc@kcmh.test', 'doctor', 'Doctor-Password-1');
  const t = g.session('doc@kcmh.test', 'doctor');
  g.as = (body) => g.post(Object.assign({ token: t }, body));
  return g;
}
const isThai = (s) => /[฀-๿]/.test(String(s || ''));
const rowOf = (g, sid) => g.rows('Patient_Registry').find(r => String(r[0]) === sid);
// A record in the shape the client sends: what getActivePatients gave it.
const synced = (g, sid) => g.as({ action: 'getActivePatients' }).patients.find(p => p.sessionId === sid);

const CASES = ['', '   ', null, undefined, 'Active', 'Active ', ' active', 'ACTIVE', 'Discharged', ' discharged ',
  'TRANSFERRED', 'expired', 'Expird', 'ZZZ', ' Disch '];

T.section('§1 The backend reads a status exactly as the client does', () => {
  const g = ward();
  const server = CASES.map(v => g.sb._readStatus(v));
  const client = CASES.map(v => D.patientStatus({ status: v }));
  T.eq('_readStatus = D.patientStatus on every case', server, client);
  T.eq('…which is', server, ['Active', 'Active', 'Active', 'Active', 'Active', 'Active', 'Active', 'Active',
    'Discharged', 'Discharged', 'Transferred', 'Expired', 'Expird', 'ZZZ', 'Disch']);
  T.eq('_onUnitStatus = D.isOnUnit on every case',
    CASES.map(v => g.sb._onUnitStatus(v)), CASES.map(v => D.isOnUnit({ status: v })));
});

T.section('§2 The sync window reads it the same way', () => {
  const g = ward();
  T.eq('_patientInSyncWindow("active", "", today) is in (it was out)', g.sb._patientInSyncWindow('active', '', TODAY), true);
  T.eq('…an unknown word with no statusDate is out', g.sb._patientInSyncWindow('Expird', '', TODAY), false);
  const pat = g.sheet('Patient_Registry').data;
  pat.push(g.patRow('LC-1', { 9: 'active' }));
  pat.push(g.patRow('SP-1', { 9: 'Active ' }));
  pat.push(g.patRow('DI-1', { 9: ' discharged ', 16: addDays(TODAY, -2) }));
  pat.push(g.patRow('UK-1', { 9: 'Expird' }));
  pat.push(g.patRow('UK-2', { 9: 'Expird', 16: addDays(TODAY, -2) }));
  const ids = g.as({ action: 'getActivePatients' }).patients.map(p => p.sessionId).sort();
  T.eq('the ward gets "active", "Active ", a recent " discharged " and a recent "Expird"; not an undated "Expird"',
    ids, ['DI-1', 'LC-1', 'SP-1', 'UK-2']);
});

T.section('§3 The bed guard reads it the same way', () => {
  const g = ward();
  const pat = g.sheet('Patient_Registry').data;
  pat.push(g.patRow('SP-1', { 9: 'Active ', 10: 'NICU 1' }));
  pat.push(g.patRow('LC-1', { 9: 'active', 10: 'NICU 2' }));
  pat.push(g.patRow('UK-1', { 9: 'Expird', 10: 'NICU 3', 16: addDays(TODAY, -2) }));
  const reg = (sid, bed) => g.as({ action: 'registerPatient', isNew: true, confirmDuplicate: true,
    patient: { sessionId: sid, name: 'ทารก ' + sid, initials: 'XX', bw: 900 + sid.length, ga: 28.1, sex: 'girls',
      dob: addDays(TODAY, -3), admissionDate: addDays(TODAY, -3), status: 'Active', currentBed: bed,
      diagnosis: 'RDS', weights: [{ dol: 1, w: 900 }], lengths: [], hcs: [], bedHistory: [], statusDate: '' } });
  const a = reg('NA-1', 'NICU 1');
  T.ok('NICU 1 is held by "Active " (it was free)', !!a.error && /NICU 1/.test(a.error), a);
  const b = reg('NB-1', 'NICU 2');
  T.ok('NICU 2 is held by "active" (it was free)', !!b.error && /NICU 2/.test(b.error), b);
  const c = reg('NC-1', 'NICU 3');
  T.ok('NICU 3 is free: "Expird" is not on the unit', c.ok === true, c);
});

T.section('§4 The write: one of the four, or refused', () => {
  const g = ward();
  const P = (sid, extra) => Object.assign({ sessionId: sid, name: 'ทารก ' + sid, initials: 'XX', bw: 950, ga: 28.1,
    sex: 'boys', dob: addDays(TODAY, -3), admissionDate: addDays(TODAY, -3), status: 'Active', currentBed: '',
    diagnosis: 'RDS', weights: [{ dol: 1, w: 950 }], lengths: [], hcs: [], bedHistory: [], statusDate: '' }, extra);
  const zzz = g.as({ action: 'registerPatient', isNew: true, patient: P('ZZ-1', { status: 'ZZZ' }) });
  T.ok('a new record with status "ZZZ" is refused, in Thai (it was stored as Active)', !!zzz.error && isThai(zzz.error), zzz);
  T.ok('…and nothing is stored', !rowOf(g, 'ZZ-1'));
  const dis = g.as({ action: 'registerPatient', isNew: true, patient: P('DS-1', { bw: 960, status: ' discharged ', statusDate: TODAY }) });
  T.ok('" discharged " is accepted', dis.ok === true, dis);
  T.eq('…and stored canonical', rowOf(g, 'DS-1') && rowOf(g, 'DS-1')[9], 'Discharged');
  const blank = g.as({ action: 'registerPatient', isNew: true, patient: P('BL-1', { bw: 970, status: '' }) });
  T.eq('a blank status is stored as Active', blank.ok === true && rowOf(g, 'BL-1')[9], 'Active');

  // Vera's case: a row typed "Expird", edited with only the diagnosis changed.
  g.sheet('Patient_Registry').data.push(g.patRow('UK-1', { 9: 'Expird', 16: addDays(TODAY, -2) }));
  const base = synced(g, 'UK-1');
  T.eq('the ward has the "Expird" row as typed', base && base.status, 'Expird');
  const edit = g.as({ action: 'registerPatient', patient: Object.assign({}, base, { diagnosis: 'RDS, PDA' }), base });
  T.ok('a diagnosis edit that keeps "Expird" is refused, in Thai (it wrote Active)', !!edit.error && isThai(edit.error), edit);
  T.eq('…and the row is unchanged', [rowOf(g, 'UK-1')[9], rowOf(g, 'UK-1')[11]], ['Expird', base.diagnosis]);
  const fixed = g.as({ action: 'registerPatient', base,
    patient: Object.assign({}, base, { diagnosis: 'RDS, PDA', status: 'Discharged', statusDate: TODAY }) });
  T.ok('with a status picked it saves', fixed.ok === true, fixed);
  T.eq('…as Discharged, with the diagnosis', [rowOf(g, 'UK-1')[9], rowOf(g, 'UK-1')[11]], ['Discharged', 'RDS, PDA']);

  // A case/space variant is not a change the client made, and is written canonical.
  g.sheet('Patient_Registry').data.push(g.patRow('LC-1', { 9: 'active ' }));
  const lcBase = synced(g, 'LC-1');
  const lc = g.as({ action: 'registerPatient', base: lcBase,
    patient: Object.assign({}, lcBase, { status: D.patientStatus(lcBase), diagnosis: 'TTN' }) });
  T.ok('a diagnosis edit of an "active " row saves', lc.ok === true, lc);
  T.eq('…and writes the status back as "Active"', rowOf(g, 'LC-1')[9], 'Active');
});

T.section('§5 Edit session asks for a status the server would refuse', () => {
  let JSDOM, React, ReactDOM, babel, act;
  try {
    ({ JSDOM } = require('jsdom'));
    React = require('react'); ReactDOM = require('react-dom/client'); babel = require('@babel/core');
    ({ act } = require('react'));
  } catch (e) { console.log('  SKIP  jsdom/react/babel not installed'); return; }
  const dom = new JSDOM('<!doctype html><html><body><div id="probe"></div></body></html>', { url: 'https://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  Object.assign(global, { window, document: window.document, self: window, HTMLElement: window.HTMLElement,
    Element: window.Element, Node: window.Node, getComputedStyle: window.getComputedStyle,
    sessionStorage: window.sessionStorage, localStorage: window.localStorage, Event: window.Event,
    MouseEvent: window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true });
  global.React = React; window.React = React; global.ReactDOM = ReactDOM; window.ReactDOM = ReactDOM;
  const quiet = console.error; console.error = (...a) => { if (!/act\(|not wrapped/.test(String(a[0]))) quiet(...a); };
  vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
  for (const f of ['icons.jsx', 'registry.jsx']) {
    vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + f, 'utf8'), {
      presets: [[require('@babel/preset-react'), { runtime: 'classic' }]], filename: f, configFile: false, babelrc: false }).code);
  }
  const rec = { sessionId: 'UK-1', name: 'UK', initials: 'UK', bw: 1000, ga: 28.0, sex: 'girls', dob: addDays(TODAY, -5),
    admissionDate: addDays(TODAY, -5), twinSuffix: '', status: 'Expird', statusDate: addDays(TODAY, -2), currentBed: '',
    diagnosis: 'RDS', weights: [{ dol: 1, w: 1000 }], lengths: [], hcs: [], bedHistory: [], multiplesCount: 0 };
  const sent = [];
  const root = ReactDOM.createRoot(document.getElementById('probe'));
  act(() => { root.render(React.createElement(window.EditPatientModal, {
    patient: rec, patients: [rec], onClose() {}, onSubmit: (p) => { sent.push(p); return { ok: true }; } })); });
  const modal = document.querySelector('.picker');
  const statusSel = [...modal.querySelectorAll('.field')].find(f => f.querySelector('label')?.textContent.trim() === 'Status')?.querySelector('select');
  const save = () => [...modal.querySelectorAll('button')].find(b => /Save changes/.test(b.textContent));
  T.eq('the Status select seeds blank, with "— เลือก —" (it seeded "Expird")', statusSel && [statusSel.value, statusSel.options[0].textContent], ['', '— เลือก —']);
  T.ok('…the warning names the stored status', /Status ในทะเบียนของ session นี้ไม่ถูกต้อง \(Expird\)/.test(modal.textContent));
  T.ok('…Save is off and says why', save().disabled && /ต้องเลือก Status ก่อนบันทึก/.test(modal.textContent));
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  act(() => { setter.call(statusSel, 'Discharged'); statusSel.dispatchEvent(new window.Event('change', { bubbles: true })); });
  T.ok('picking Discharged turns Save on', !save().disabled);
  act(() => { save().dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  T.eq('…and Discharged is what is sent', sent[0] && sent[0].status, 'Discharged');
  act(() => root.unmount());
  console.error = quiet;
});

T.done();
