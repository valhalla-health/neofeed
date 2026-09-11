// verify-review-0911.cjs — pins every fix from the 2026-09-11 full review
// (NEOFEED_FULL_REVIEW_2026-09-11.md, kept outside this public repo).
//
// Part A drives the real gas-backend.gs in a vm sandbox (no dependencies).
// Part B mounts the real <Calculator> and <PatientRegistry> in jsdom (same
// dev-only deps as verify-tpn-calc-weight.cjs — see test/README.md).
// Part C is source-level: headers, shells, reference text.
//
// Each section names the review finding it pins. Every one of them fails
// against the pre-review source (1922488).
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const crypto = require('crypto');

const DIR = path.join(__dirname, '..') + '/';
const R = (f) => fs.readFileSync(DIR + f, 'utf8');

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(64)}${ok ? '' : ` got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
}
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name.padEnd(64)}${cond ? '' : '  ' + JSON.stringify(detail ?? '')}`);
  cond ? pass++ : fail++;
}

// ════════════════════════════ Part A · backend ═════════════════════════════
const W = 38;
function makeSheet(header, rows) {
  const data = [header.slice(), ...(rows || []).map(r => r.slice())];
  return {
    data, maxColumns: Math.max(W, header.length),
    getMaxColumns() { return this.maxColumns; },
    insertColumnsAfter(a, n) { this.maxColumns += n; },
    getLastRow() { return data.length; },
    getLastColumn() { return Math.max(...data.map(r => r.length)); },
    getDataRange() { return { getValues: () => data.map(r => r.slice()) }; },
    getRange(row, col, nr = 1, nc = 1) {
      return {
        getValue: () => (data[row - 1] || [])[col - 1] ?? '',
        getValues: () => [(data[row - 1] || []).slice(col - 1, col - 1 + nc)],
        setValue(v) { if (!data[row - 1]) data[row - 1] = []; data[row - 1][col - 1] = v; },
        setValues(v) { if (!data[row - 1]) data[row - 1] = []; v[0].forEach((x, i) => { data[row - 1][col - 1 + i] = x; }); },
        clearContent() {},
      };
    },
    appendRow(r) { data.push(r.slice()); },
    deleteRow(row) { data.splice(row - 1, 1); },
  };
}

const sheets = {};
const props = {};
let uuid = 0;
const sandbox = {
  SpreadsheetApp: { openById: () => ({
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = makeSheet([n + '-header'])),
  }) },
  Utilities: {
    getUuid: () => 'uuid-' + (++uuid),
    computeHmacSha256Signature: (data, key) => Array.from(crypto.createHmac('sha256', String(key)).update(String(data)).digest()),
    computeDigest: (a, s) => Array.from(crypto.createHash('sha256').update(String(s)).digest()),
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    formatDate: (d) => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10),
  },
  PropertiesService: { getScriptProperties: () => ({
    getProperty: (k) => (k === 'SPREADSHEET_ID' || k === 'CLIENT_ID' ? 'x' : (k in props ? props[k] : null)),
    setProperty: (k, v) => { props[k] = String(v); },
    deleteProperty: (k) => { delete props[k]; },
  }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 400, getContentText: () => '{}' }) },
  ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
  Session: { getScriptTimeZone: () => 'Asia/Bangkok' },
  Logger: { log() {} }, console,
};
vm.createContext(sandbox);
vm.runInContext(R('gas-backend.gs'), sandbox);
const post = (body) => JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify(body) } }).setMimeType());

const PAT_HEADER = new Array(18).fill('h');
const patRow = (sid, status, statusDate) => {
  const r = new Array(18).fill('');
  r[0] = sid; r[1] = sid.slice(0, 2); r[3] = 1200; r[4] = 30; r[9] = status || 'Active'; r[16] = statusDate || '';
  return r;
};
const ENTRY = { dol: 5, weight: 1200, fluid: 150, gir: 6, pro: 3, kcal: 90, na: 3, k: 2, ca: 60, p: 40,
  enVolPerKg: 20, route: 'TPN central', status: 'submitted' };
const todayKey = sandbox._wardDateKey();
const daysAgo = (n) => new Date(Date.parse(todayKey + 'T00:00:00Z') - n * 86400000).toISOString().slice(0, 10);
function freshLog() { sheets.Daily_Log = makeSheet(new Array(W).fill('h')); return sheets.Daily_Log; }
function logRows() { return sheets.Daily_Log.data.slice(1); }

console.log('\n── B5 · a log row needs a registered patient ──');
sheets.Patient_Registry = makeSheet(PAT_HEADER, [patRow('AB-1200')]);
freshLog();
let r = sandbox.logDailyNutrition('NOPE-1', { ...ENTRY, ts: '2026-09-10' }, 'a@x');
ok('logDailyNutrition refuses an unregistered sessionId', !!r.error && /ไม่พบผู้ป่วย/.test(r.error), r);
eq('and writes nothing', logRows().length, 0);
r = sandbox.logDailyNutrition('AB-1200', { ...ENTRY, ts: '2026-09-10' }, 'a@x');
ok('a registered patient still logs', !!r.entryId, r);

console.log('\n── B4 · an edit cannot move an entry onto another date ──');
const d2 = sandbox.logDailyNutrition('AB-1200', { ...ENTRY, ts: '2026-09-11' }, 'a@x');
const moved = sandbox.updateDailyNutrition('AB-1200', d2.entryId, d2.lastModified, { ...ENTRY, ts: '2026-09-10', pro: 3.2 }, 'a@x');
ok('update succeeds', moved.ok, moved);
eq('…but the row keeps its own date', logRows().map(x => String(x[0]).slice(0, 10)).sort(), ['2026-09-10', '2026-09-11']);

console.log('\n── B1 · two editors of one PUBLISHED row cannot fork it ──');
freshLog();
const c = sandbox.logDailyNutrition('AB-1200', { ...ENTRY, ts: '2026-09-11' }, 'a@x');
sandbox.publishDailyLog('AB-1200', c.entryId, 'a@x', c.lastModified);
const stale = logRows()[0][26];
// lastModified is an ISO stamp with millisecond resolution; let one pass so
// "advanced" is observable here (across real HTTP round trips it always is —
// and the superseded guard asserted below does not depend on it at all).
for (const t0 = Date.now(); Date.now() - t0 < 3;) { /* spin 3 ms */ }
const e1 =sandbox.updateDailyNutrition('AB-1200', c.entryId, stale, { ...ENTRY, pro: 3.5 }, 'b@x');
const e2 = sandbox.updateDailyNutrition('AB-1200', c.entryId, stale, { ...ENTRY, pro: 2.0 }, 'c@x');
ok('first editor gets a revision', e1.revised === true, e1);
ok('second editor holding the same stamp gets a conflict', e2.conflict === true && !e2.revised, e2);
eq('exactly one current (non-superseded) row for the date', logRows().filter(x => !x[37]).length, 1);
ok('superseding advanced the old row\'s lastModified', logRows()[0][26] !== stale);
const e3 = sandbox.updateDailyNutrition('AB-1200', c.entryId, logRows()[0][26], { ...ENTRY, pro: 2.0 }, 'c@x');
ok('even with the fresh stamp, a superseded row is not an edit target', e3.conflict === true && e3.current.superseded === true, e3);

console.log('\n── B2 · Submit is optimistic-locked and state-checked ──');
freshLog();
const p1 = sandbox.logDailyNutrition('AB-1200', { ...ENTRY, ts: '2026-09-11' }, 'a@x');
ok('publish without expectedLastModified is refused', !!sandbox.publishDailyLog('AB-1200', p1.entryId, 'a@x').error);
const pc = sandbox.publishDailyLog('AB-1200', p1.entryId, 'a@x', 'someone-elses-stamp');
ok('a stale stamp is a conflict, not a signature', pc.conflict === true, pc);
eq('…and nothing was published', logRows()[0][33], '');
const pOk = sandbox.publishDailyLog('AB-1200', p1.entryId, 'a@x', p1.lastModified);
ok('the matching stamp publishes', pOk.ok && !pOk.alreadyPublished, pOk);
const again = sandbox.publishDailyLog('AB-1200', p1.entryId, 'z@x', logRows()[0][26]);
ok('re-publishing is a no-op', again.ok && again.alreadyPublished, again);
eq('…publishedBy is not overwritten', logRows()[0][34], 'a@x');
sandbox.updateDailyNutrition('AB-1200', p1.entryId, logRows()[0][26], { ...ENTRY, pro: 3.4 }, 'a@x');
const supPub = sandbox.publishDailyLog('AB-1200', p1.entryId, 'a@x', logRows()[0][26]);
ok('a superseded row cannot be published', !!supPub.error, supPub);
const pubConflict = post({ action: 'publishLog', token: 'x'.repeat(12), sessionId: 'AB-1200', entryId: 'uuid-x' });
ok('(doPost still requires a session for publishLog)', pubConflict.error === 'Unauthorized');

console.log('\n── B7 · a published row cannot be hard-deleted ──');
const pubRowId = logRows()[0][25];
ok('delete of a published row is refused', !!sandbox.deleteDailyNutrition('AB-1200', pubRowId).error);
const draftId = logRows().find(x => !x[33])[25];
ok('a draft row can still be deleted by an admin', sandbox.deleteDailyNutrition('AB-1200', draftId).ok === true);

console.log('\n── B3 · login: no stored record for unknown emails, one message ──');
const salt = 'salt-1';
const staffRow = (email, active) => [email, 'doctor', 'Dr ' + email, active, sandbox.hashPwdV2('correct-horse-1', salt), salt, false, ''];
sheets.Staff = makeSheet(['email', 'role', 'name', 'active', 'password_hash', 'salt', 'mcp', 'tmp'],
  [staffRow('doc@kcmh.test', true), staffRow('gone@kcmh.test', false)]);
const before = Object.keys(props).length;
const unknowns = [];
for (let i = 0; i < 25; i++) unknowns.push(post({ action: 'login', email: `nobody${i}@evil.test`, password: 'x' }));
eq('25 unknown-email logins add no Script Properties', Object.keys(props).length - before, 0);
const wrong = post({ action: 'login', email: 'doc@kcmh.test', password: 'wrong' });
eq('unknown email and wrong password get the SAME message', unknowns[0].error, wrong.error);
ok('…a real account\'s failure IS still counted for lockout', Object.keys(props).some(k => k.startsWith('fail_doc')));
const longEmail = post({ action: 'login', email: 'a'.repeat(300) + '@x.test', password: 'x' });
eq('an over-long email is refused with the same message', longEmail.error, wrong.error);
const disabledWrong = post({ action: 'login', email: 'gone@kcmh.test', password: 'wrong' });
ok('disabled status is NOT revealed without the password', !/ระงับ/.test(disabledWrong.error), disabledWrong);
const disabledRight = post({ action: 'login', email: 'gone@kcmh.test', password: 'correct-horse-1' });
ok('…only after the correct password', /ระงับ/.test(disabledRight.error || ''), disabledRight);
const good = post({ action: 'login', email: 'doc@kcmh.test', password: 'correct-horse-1' });
eq('the right password still logs in', good.status, 'ok');

console.log('\n── B7 · password floor, registry audit, erasure miss ──');
const asUser = (role) => { sandbox.verifyToken = () => ({ email: role + '@kcmh.test', role, name: role, mustChangePassword: false }); };
asUser('doctor');
const shortPwd = post({ action: 'changePassword', token: 't', oldPassword: 'correct-horse-1', newPassword: '123456789' });
ok('a 9-character new password is refused', /10/.test(shortPwd.error || ''), shortPwd);
sheets.Audit_Log = makeSheet(['ts', 'action', 'sessionId', 'actorEmail']);
post({ action: 'updatePatient', token: 't', patient: { ...{ sessionId: 'AB-1200', bw: 1250, ga: 30, dob: '' } } });
const audit = sheets.Audit_Log.data.slice(1).map(x => [x[1], x[2], x[3]]);
ok('a registry edit writes an Audit_Log row (who changed BW/GA)', audit.some(a => a[0] === 'updatePatient' && a[1] === 'AB-1200' && a[2] === 'doctor@kcmh.test'), audit);
asUser('admin');
const erase = post({ action: 'pseudonymizePatient', token: 't', sessionId: 'NO-SUCH' });
ok('an erasure request that matches nothing says so', !!erase.error, erase);

console.log('\n── B6 · the sync payload is limited to the sync window ──');
sheets.Patient_Registry = makeSheet(PAT_HEADER, [
  patRow('ACT-1', 'Active'), patRow('BLANK-1', ''),
  patRow('RECENT-1', 'Discharged', daysAgo(5)), patRow('OLD-1', 'Discharged', daysAgo(60)),
  patRow('NODATE-1', 'Transferred', ''),
]);
freshLog();
for (const sid of ['ACT-1', 'RECENT-1', 'OLD-1']) {
  const row = new Array(W).fill(''); row[0] = '2026-09-01'; row[1] = sid; row[25] = 'e-' + sid; sheets.Daily_Log.data.push(row);
}
const ward = sandbox.getActivePatients();
eq('ward sync: active, blank, recent and undatable patients only',
  ward.patients.map(p => p.sessionId).sort(), ['ACT-1', 'BLANK-1', 'NODATE-1', 'RECENT-1']);
ok('…and no log rows for anyone outside it', !('OLD-1' in ward.log) && 'ACT-1' in ward.log && 'RECENT-1' in ward.log, Object.keys(ward.log));
eq('includeArchived returns everyone', sandbox.getActivePatients({ includeArchived: true }).patients.length, 5);
asUser('doctor');
eq('a doctor asking for the archive still gets the window', post({ action: 'getActivePatients', token: 't', includeArchived: true }).patients.length, 4);
asUser('admin');
eq('an admin asking for the archive gets it', post({ action: 'getActivePatients', token: 't', includeArchived: true }).patients.length, 5);

// ═══════════════════════════ Part B · frontend (jsdom) ═════════════════════
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>',
  { url: 'https://localhost/', pretendToBeVisual: true });
const { window } = dom;
Object.assign(global, {
  window, document: window.document, self: window, HTMLElement: window.HTMLElement,
  Element: window.Element, Node: window.Node, getComputedStyle: window.getComputedStyle,
  localStorage: window.localStorage,
  requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: clearTimeout,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const toasts = [];
global.showToast = (msg, type) => toasts.push({ msg, type });
let printed = 0;
window.print = () => { printed++; };
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
vm.runInThisContext(R('data.js'));
const D = window.NEOFEED_DATA;
for (const f of ['icons.jsx', 'calculator.jsx', 'registry.jsx']) {
  vm.runInThisContext(babel.transformSync(R(f), {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    filename: f, configFile: false, babelrc: false,
  }).code + (f === 'registry.jsx' ? '\n;window.__PatientRegistry = PatientRegistry;' : ''));
}

const container = document.getElementById('root');
let root = ReactDOM.createRoot(container);
const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
function inputFor(label) {
  const field = [...container.querySelectorAll('.field')].find(d => d.querySelector('label')?.textContent.startsWith(label));
  if (field) return field.querySelector('input');
  const row = [...container.querySelectorAll('.salt-row-grid')]
    .find(d => d.firstElementChild?.firstElementChild?.textContent.startsWith(label));
  return row ? row.querySelector('input') : null;
}
function setField(label, value) {
  const input = inputFor(label);
  if (!input) throw new Error('field not found: ' + label);
  act(() => { valueSetter.call(input, String(value)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
const openAll = () => act(() => {
  container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
});
const saveBtn = () => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'บันทึก' || /กำลังบันทึก/.test(b.textContent));
const alertTexts = () => [...container.querySelectorAll('.calc-bottom .alert-row')].map(a => a.textContent.replace(/\s+/g, ' '));
const printForm = () => container.querySelector('#print-form');
function mount(props) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  act(() => {
    root.render(React.createElement(window.Calculator, {
      dol: 5, editEntry: null, baselineEntry: null, previousEntry: null, logDate: '2026-09-11',
      userLabel: 'Dr Test (doc@kcmh.test)', onUpdate() {}, onSaved() {}, onWeightChange() {}, ...props,
    }));
  });
  openAll();
}
const patient = { sessionId: 'CR-900', name: 'CR', bw: 900, currentBed: 'NICU 2', diagnosis: '-', weights: [{ dol: 1, w: 900 }] };

(async () => {
  console.log('\n── F1 · a critical tile is always a critical alert ──');
  let logged = null;
  mount({ patient, onLog: (e) => { logged = e; return Promise.resolve({ ok: true, entryId: 'e-cr', lastModified: 'lm-cr' }); } });
  setField('Current weight', 858);
  setField('Volume(mL/day)', 110);
  setField('Dextrose final', 10);
  setField('Amino acid', 3);
  setField('SMOF Lipid', 3.5);
  setField('KCl', 5);
  setField('10% Ca gluconate', 60);
  const texts = alertTexts();
  ok('K 5 mEq/kg/d raises a critical alert', texts.some(t => /Potassium critically/.test(t)), texts);
  ok('Ca with zero P raises a critical alert', texts.some(t => /Ca:P ratio — ไม่มี P/.test(t)), texts);
  const offTarget = [...container.querySelectorAll('.metric.s-crit, .metric.s-warn')]
    .map(m => m.querySelector('.lbl')?.textContent).filter(l => l !== 'EN volume');
  ok('with off-target tiles on screen, the panel never claims "no flags"',
    offTarget.length === 0 || !texts.some(t => /No safety flags|All targets within range/.test(t)), { offTarget, texts });

  window.prompt = () => null;
  await act(async () => { saveBtn().dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  eq('Save with a critical value and no reason does not save', logged, null);
  ok('…and says why', toasts.some(t => /ระบุเหตุผล/.test(t.msg)), toasts.slice(-2));

  window.prompt = () => 'attending aware — hyperkalaemia treated';
  await act(async () => { saveBtn().dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  ok('with a reason it saves', !!logged);
  eq('the reason is stored with the order', logged && logged.calcInput.critOverride && logged.calcInput.critOverride.reason, 'attending aware — hyperkalaemia treated');
  ok('…with the alerts it overrode', !!(logged && logged.calcInput.critOverride.alerts.some(a => /Potassium/.test(a))), logged && logged.calcInput.critOverride);
  ok('the saved order is printable and prints the override', !!printForm() && /สั่งทั้งที่มีค่าวิกฤต/.test(printForm().textContent), printForm() && printForm().textContent.slice(0, 200));
  ok('the print form says who saved it', /บันทึกโดย\s*Dr Test/.test(printForm().textContent.replace(/\s+/g, ' ')));
  ok('the print form carries HN/AN boxes', /HN:/.test(printForm().textContent) && /AN:/.test(printForm().textContent));

  console.log('\n── F2 · unsaved edits can never reach the print form ──');
  setField('Amino acid', 3.5);
  ok('after an unsaved edit the print form is withheld', !printForm());
  const tBefore = toasts.length; printed = 0;
  act(() => { document.dispatchEvent(new window.CustomEvent('__neofeed_print')); });
  eq('Print order does not print', printed, 0);
  ok('…and asks for a save first', toasts.slice(tBefore).some(t => /ก่อนพิมพ์/.test(t.msg)), toasts.slice(tBefore));
  ok('the unsaved-changes indicator is shown', /มีการแก้ไขที่ยังไม่ได้บันทึก/.test(container.textContent));
  setField('Amino acid', 3);
  ok('typing the saved value back makes it printable again', !!printForm());

  console.log('\n── F2 · reopening a saved entry ──');
  const saved = { entryId: 'e-7', lastModified: 'lm-7', ts: '2026-09-11', dol: 5, weight: 900,
    calcInput: { curWtG: 900, totalTPN_mL: 100, dexPct: 10, aaPerKg: 3.5 } };
  const prev = { entryId: 'e-6', lastModified: 'lm-6', ts: '2026-09-10', dol: 4, weight: 900,
    calcInput: { curWtG: 900, totalTPN_mL: 100, dexPct: 10, aaPerKg: 3 } };
  mount({ patient, editEntry: saved, previousEntry: prev, onLog() {} });
  ok('an untouched saved entry is printable', !!printForm());
  const pf = printForm().textContent.replace(/\s+/g, ' ');
  ok('print: normal requirement comes from the DOL targets (P 50–108)', /P 50–108 mg\/kg\/day/.test(pf), pf.match(/K⁺[^|]{0,80}/));
  ok('print: the old hard-coded "P preterm 30-70" is gone', !/30-70/.test(pf));
  ok('print: energy line is TPN-only with its own per-kg', /Energy \(TPN\)/.test(pf));
  ok('print: changes vs previous order are listed', /เปลี่ยนแปลงจากคำสั่ง[^:]*: .*Amino acid 3→3\.5/.test(pf), pf.match(/เปลี่ยนแปลง.{0,120}/));
  ok('screen: changes vs previous order are listed', /Amino acid: 3 → 3\.5/.test(container.querySelector('.order-changes')?.textContent.replace(/\s+/g, ' ') || ''));

  console.log('\n── F3 · unsaved work survives a forced logout ──');
  localStorage.clear();
  const dp = { ...patient, sessionId: 'DR-1' };
  mount({ patient: dp, logDate: '2026-09-10', onLog() {} });
  eq('merely opening a form leaves no draft', localStorage.getItem('neofeed_draft_DR-1_2026-09-10'), null);
  setField('Amino acid', 2.5);
  ok('typing autosaves a draft for this patient + date', !!localStorage.getItem('neofeed_draft_DR-1_2026-09-10'));
  mount({ patient: dp, logDate: '2026-09-10', onLog() {} });
  ok('reopening offers the draft back', /มีข้อมูลที่กรอกค้างไว้/.test(container.textContent));
  act(() => { [...container.querySelectorAll('button')].find(b => b.textContent === 'กู้คืน').dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  eq('restore puts the typed value back', inputFor('Amino acid').value, '2.5');
  mount({ patient: dp, logDate: '2026-09-11', onLog() {} });
  ok('a draft is never offered on a different date', !/มีข้อมูลที่กรอกค้างไว้/.test(container.textContent));

  console.log('\n── F7 · Glycophos always shows the phosphate it delivers ──');
  mount({ patient, onLog() {} });
  ok('at 0 the phosphate line is still visible', /P 0 mmol\/kg\/d/.test(container.querySelector('.glycophos-p')?.textContent || ''));
  setField('Glycophos', 2);
  ok('2 mEq Na/kg reads as 1 mmol P/kg = 31 mg/kg', /P 1 mmol\/kg\/d = 31 mg\/kg\/d/.test(container.querySelector('.glycophos-p')?.textContent || ''));

  console.log('\n── F9 · twins are distinguishable on the mobile registry ──');
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  const twin = (s) => ({ sessionId: 'TW-800-' + s, name: 'TW', initials: 'TW', bw: 800, ga: 26, sex: 'boys', status: 'Active',
    currentBed: 'NICU ' + (s === 'A' ? 1 : 2), twinSuffix: s, multiplesCount: 2, weights: [{ dol: 1, w: 800 }], admissionDate: '2026-09-01' });
  act(() => { root.render(React.createElement(window.__PatientRegistry, { patients: [twin('A'), twin('B')], log: {}, onSelect() {}, onAdd() {}, onEdit() {} })); });
  eq('mobile cards carry Twin A / Twin B', [...container.querySelectorAll('.patient-card-list .pmc-twin')].map(e => e.textContent), ['Twin A', 'Twin B']);

  console.log('\n── P1 · the provenance stamp is derived, never hand-kept ──');
  eq('no <script> tags (Node) → the fallback constant', D.appVersion(), D.APP_VERSION);
  for (const src of ['data.js?v=aa-1', 'calculator.jsx?v=bb-2', 'app.jsx?v=cc-3']) {
    const s = document.createElement('script'); s.setAttribute('src', src); document.head.appendChild(s);
  }
  eq('in the browser it is the loaded cache-bust tokens', D.appVersion(), 'd=aa-1;c=bb-2;a=cc-3');
  ok('…which the sheet cannot read as a formula', !/^[=+\-@]/.test(D.appVersion()));

  // ═══════════════════════════ Part C · source ═════════════════════════════
  console.log('\n── C2/C3/C5/F4/F5/F8 · headers, shells and reference text ──');
  const headers = R('_headers'), shell = R('index.html'), twinShell = R('NeoFeed.html'), app = R('app.jsx');
  ok('CSP allows Google Sign-In\'s stylesheet', /style-src[^;]*https:\/\/accounts\.google\.com\/gsi\/style/.test(headers));
  ok('X-Robots-Tag noindex is sent', /X-Robots-Tag:\s*noindex/.test(headers));
  ok('both shells carry a robots noindex meta', /<meta name="robots" content="noindex/.test(shell) && shell === twinShell);
  ok('tweaks-panel.jsx is gone from the shells and the repo', !/tweaks-panel/.test(shell) && !fs.existsSync(DIR + 'tweaks-panel.jsx'));
  ok('app.jsx no longer mounts the Tweaks panel', !/TweaksPanel|useTweaks/.test(app));
  ok('no hard-coded "just now" sync labels', !/Sync · just now|Synced just now/.test(app));
  ok('Guidelines P row reads TPN_TARGETS, not "46–62"', !/46–62/.test(app) && /TPN_TARGETS\.p\(2\)/.test(app));
  ok('WHO tab no longer says HMF starts at EN ≥100', !/Start when EN ≥100/.test(app));
  const g = D.ESPGHAN_TARGETS.pn.electrolytes.p.growing;
  ok('ESPGHAN reference P matches TPN_TARGETS.p (mmol ×31)',
    Math.round(g[0] * 31) === D.TPN_TARGETS.p(2)[0] && Math.floor(g[1] * 31) === D.TPN_TARGETS.p(2)[1], { g, t: D.TPN_TARGETS.p(2) });
  ok('copied order text carries no patient name', !/`Patient: \$\{patient\?\.name/.test(R('calculator.jsx')));

  console.log(`\nREVIEW 2026-09-11: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
