// verify-name-id-0927.cjs — names, Edit patient and the NeoFeed ID, after the
// 2026-09-27 audit and Pp's decisions that day.
//
// The audit drove the real client against the real backend and found what the
// harnesses on either side could not see, because each fakes the other:
//   • no Admit date or DOL แรกรับ could be corrected. The Edit modal moves dob
//     with them (2026-09-23), and registerPatient read any moved dob as "a
//     different infant" and refused, telling the ward to fix the initials;
//   • gasPost dropped `needsConfirm`, so the registration's confirm step never
//     ran, and the id (initials + BW) of two unrelated infants could collide
//     with no way through;
//   • a name part with one consonant (ฤดี, ใจ) could not be registered at all.
// Pp: fix the first in the backend; a random id, "user ไม่ต้องรู้ความหมาย";
// "ฤดี จะใช้ ฤด … ให้นับสระเฉพาะชื่อแบบนี้".
//
//   § 1 names       a name with fewer than two letters keeps two characters
//   § 2 id          "NF-" + six random digits; search finds it, with or without NF-
//   § 3 one source  one definition each: the displayed name, dob from an
//                   admission date + DOL, the bed-taken message, "on the unit",
//                   the NF prefix; the look-alike rule and its words on the
//                   server only (Pp: "ข้อมูลชนิดเดียวกัน ต้องมาจากแหล่งเดียว")
//   § 4 backend     corrections save; a conflict, a taken id and a look-alike are
//                   each refused in words (none says ชื่อย่อ), nothing written
//   § 5 together    the real <App/> in jsdom against the real gas-backend.gs
//                   (gas-vm-sandbox): an Admit-date correction lands, a taken id
//                   is drawn again, and the server asks about a look-alike (synced or not)
//
// Negative control: every section fails against f675420 (release 10a4272).
// Dev-only deps as in test/README.md. One scenario per process (runScenarios).
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const SBX = require('./gas-vm-sandbox.cjs');          // before boot() swaps Date
const RB = require('./review-0917-boot.cjs');

const DIR = path.join(__dirname, '..');
// data.js in a context of its own, so a scenario can choose what `crypto` is.
function loadData(extra) {
  const window = {};
  const ctx = vm.createContext({ window, console, ...(extra || {}) });
  vm.runInContext(fs.readFileSync(path.join(DIR, 'data.js'), 'utf8'), ctx, { filename: 'data.js' });
  return window.NEOFEED_DATA;
}
const NF = /^NF-\d{6}$/;

// ── § 4 / § 5 fixtures: the real backend ────────────────────────────────────
const today = SBX.wardToday();
const day = (n) => SBX.addDays(today, n);
const sheetDate = (v) => SBX.isDate(v) ? new Date(v.getTime() + 7 * 3600e3).toISOString().slice(0, 10) : String(v || '');
function backend() {
  const g = SBX.boot();
  g.addStaff('dr@test.th', 'doctor', 'Doctor-Password-1');
  g.tok = g.session('dr@test.th', 'doctor');
  g.as = (b) => g.post({ token: g.tok, ...b });
  g.row = (sid) => {
    const r = g.rows('Patient_Registry').find(x => String(x[0]) === sid);
    return r && { sessionId: r[0], name: r[1], initials: r[2], bw: r[3], dob: sheetDate(r[6]),
      admissionDate: sheetDate(r[7]), status: r[9], currentBed: r[10], diagnosis: r[11] };
  };
  g.seed = (sid, o) => g.sheet('Patient_Registry').data.push(g.patRow(sid, {
    1: o.name, 2: o.initials || '', 3: o.bw, 6: o.dob === '' ? '' : SBX.bkkMidnight(o.dob),
    7: SBX.bkkMidnight(o.admit), 9: o.status || 'Active', 10: o.bed || '',
    12: JSON.stringify([{ dol: 1, w: o.bw }]), 16: o.statusDate ? SBX.bkkMidnight(o.statusDate) : '' }));
  g.synced = (sid) => g.as({ action: 'getActivePatients' }).patients.find(p => p.sessionId === sid);
  return g;
}
const P = (o) => ({ sessionId: 'NF-000100', name: 'สม จด', initials: 'สจ', bw: 900, ga: 28.1, sex: 'girls',
  dob: day(-5), admissionDate: day(-5), twinSuffix: '', status: 'Active', currentBed: 'NICU 2', diagnosis: '',
  weights: [{ dol: 1, w: 900 }], lengths: [], hcs: [], bedHistory: [], statusDate: '', multiplesCount: 0, ...o });

// ── § 5 fixtures: the app, against that backend ─────────────────────────────
function app(g) {
  const t = RB.boot({ session: { ...RB.DOCTOR, email: 'dr@test.th', token: g.tok }, patients: [] });
  const fetchReal = (url, o) => {
    const body = JSON.parse(o.body);
    t.server.calls.push(body);
    return Promise.resolve({ json: () => Promise.resolve(JSON.parse(g.postText(body))) });
  };
  t.window.fetch = global.fetch = fetchReal;
  t.confirms = [];
  t.answer = true;
  t.window.confirm = (msg) => { t.confirms.push(String(msg)); return t.answer; };
  t.row = (re) => [...t.window.document.querySelectorAll('.patient-table tbody tr')].find(r => re.test(r.textContent));
  t.modal = () => t.window.document.querySelector('.picker');
  t.settle = async () => { for (let i = 0; i < 8; i++) await t.flush(20); };
  t.register = async ({ first, last, bw, gaW, gaD, sex, bed }) => {
    await t.click(t.btn(/New session/));
    const m = t.modal();
    const names = m.querySelectorAll('.name-fields input.inp');
    await t.typeInto(names[0], first);
    await t.typeInto(names[1], last);
    await t.typeInto(t.fieldInput('Birth weight', m), bw);
    const ga = [...m.querySelectorAll('.field')].find(f => /^GA/.test(f.querySelector('label').textContent.trim())).querySelectorAll('select');
    await t.selectVal(ga[0], gaW); await t.selectVal(ga[1], gaD);
    await t.selectVal(t.fieldInput('Sex', m), sex);
    await t.selectVal(t.fieldInput('Bed', m), bed);
    await t.click(t.btn(/Register/, m));
    await t.settle();
  };
  return t;
}
const modalError = (t) => (t.modal()?.querySelector('.modal-submit-error')?.textContent || '').trim();

const scenarios = {
  // ════ § 1 ════
  async 'names'(A) {
    console.log('\n── § 1 a name with fewer than two letters keeps two characters ──');
    const D = loadData();
    const part = (s) => D.namePart(s, false);
    A.eq('1.1 ฤดี → ฤด (Pp\'s example)', part('ฤดี'), 'ฤด');
    A.eq('1.2 ใจ → ใจ', part('ใจ'), 'ใจ');
    A.eq('1.3 คำ → คำ', part('คำ'), 'คำ');
    A.eq('1.4 อ้า → อา (a tone mark never counts)', part('อ้า'), 'อา');
    A.eq('1.5 ก → ก: one character is still one', part('ก'), 'ก');
    A.eq('1.6 two letters or more: letters only, as before', ['ทองดี', 'เรยา', 'สมศรี', 'ใจดี', 'พัฒนา', 'น้ำฝน', 'ฤทัย', 'เอื้อ', 'ณ อยุธยา'].map(part),
      ['ทอ', 'รย', 'สม', 'จด', 'พฒ', 'นฝ', 'ทย', 'ออ', 'ณอ']);
    A.ok('1.7 a part is its own part (the box shows what is saved)',
      ['ฤดี', 'ใจ', 'คำ', 'อ้า', 'ทองดี', 'เรยา'].every(s => part(part(s)) === part(s)));
    A.ok('1.8 ฤด + ทอ is a complete name', D.nameComplete('ฤด', 'ทอ', false));
    A.eq('1.9 stored as "ฤด ทอ", and it splits back', [D.composePatientName('ฤดี', 'ทองดี', false), D.splitPatientName('ฤด ทอ')],
      ['ฤด ทอ', { first: 'ฤด', last: 'ทอ', foreign: false }]);
    const typed = (keys) => keys.reduce((box, k) => part(box + k), '');
    A.eq('1.10 typed one key at a time: ฤ ด ี ends at ฤด', typed(['ฤ', 'ด', 'ี']), 'ฤด');
    A.eq('1.11 …and เ ร ย า ends at รย, not at เร', typed(['เ', 'ร', 'ย', 'า']), 'รย');
    const hits = (q) => D.searchPatients([{ sessionId: 'NF-000001', name: 'ฤด ทอ', currentBed: 'NICU 1', status: 'Active' }], q).hits.length;
    A.eq('1.12 search: ฤดี and ฤด find "ฤด ทอ"', [hits('ฤดี'), hits('ฤด'), hits('ฤดี ทองดี')], [1, 1, 1]);
    A.eq('1.13 foreign names are untouched', D.namePart('John', true), 'Jo');
  },

  // ════ § 2 ════
  async 'id'(A) {
    console.log('\n── § 2 a new NeoFeed ID is NF- and six random digits ──');
    const D = loadData({ crypto: require('crypto').webcrypto });
    const ids = Array.from({ length: 500 }, () => D.newSessionId());
    A.ok('2.1 every draw is NF-dddddd', ids.every(s => NF.test(s)));
    A.ok('2.2 draws differ (≥ 490 distinct of 500)', new Set(ids).size >= 490);
    let calls = 0;
    const stub = { getRandomValues(a) { a[0] = calls++ === 0 ? 4294967295 : 1123456; return a; } };
    A.eq('2.3 a value in the biased tail is drawn again (no modulo bias)', loadData({ crypto: stub }).newSessionId(), 'NF-123456');
    A.eq('2.4 …which took two draws', calls, 2);
    const noCrypto = loadData();
    A.ok('2.5 without crypto it still returns NF-dddddd', NF.test(noCrypto.newSessionId()));
    const list = [{ sessionId: 'NF-482913', name: 'รย ทอ', currentBed: 'NICU 3', status: 'Active' },
      { sessionId: 'สจ-BW900', name: 'ปพ', currentBed: 'NICU 4', status: 'Active' }];
    const found = (q) => D.searchPatients(list, q).hits.map(p => p.sessionId);
    A.eq('2.6 search: NF-482913, nf482913, 482913 and 4829 find it', [found('NF-482913'), found('nf482913'), found('482913'), found('4829')],
      [['NF-482913'], ['NF-482913'], ['NF-482913'], ['NF-482913']]);
    A.eq('2.7 three digits are a bed number, not an id', found('482'), []);
    A.eq('2.8 an old id is still found by its start', [found('สจ-BW'), found('สจbw900')], [['สจ-BW900'], ['สจ-BW900']]);
    // registry.jsx draws it; nothing else builds a sessionId from patient data.
    const reg = fs.readFileSync(path.join(DIR, 'registry.jsx'), 'utf8');
    A.ok('2.9 NewPatientModal draws its id from newSessionId', /useState\(\(\) => D_R\.newSessionId\(\)\)/.test(reg));
    A.ok('2.10 …and no longer builds one from initials and BW', !/-BW\$\{bw\}/.test(reg));
  },

  // ════ § 3 ════
  async 'single-source'(A) {
    console.log('\n── § 3 one source for each kind of data ──');
    const D = loadData();
    const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
    const code = (f) => read(f).split('\n').filter(l => !/^\s*(\/\/|\*|\{\/\*)/.test(l)).join('\n');
    A.eq('3.1 patientName: the name, else the old initials, else ""',
      [D.patientName({ name: 'สม จด', initials: 'สจ' }), D.patientName({ name: '', initials: 'ปพ' }), D.patientName({}), D.patientName(null)],
      ['สม จด', 'ปพ', '', '']);
    A.eq('3.2 dobFromAdmitDol: admission date − (DOL − 1); a blank DOL is 1',
      [D.dobFromAdmitDol('2026-09-20', 3), D.dobFromAdmitDol('2026-09-20', ''), D.dobFromAdmitDol('2026-09-20', '3')],
      ['2026-09-18', '2026-09-20', '2026-09-18']);
    A.eq('3.3 …and the legacy-record dob is the same arithmetic',
      D.dobFromAdmission({ admissionDate: '2026-09-20', weights: [{ dol: 3, w: 900 }] }), D.dobFromAdmitDol('2026-09-20', 3));
    const m1 = D.bedTakenMsg('NICU 5', { sessionId: 'NF-000001', name: 'สม จด' });
    const m2 = D.bedTakenMsg('NICU 5', { sessionId: 'NF-000002', name: '', initials: '' });
    A.ok('3.4 bedTakenMsg names who is in the bed, or the id when there is no name',
      m1.split('สม จด').length === 3 && m2.includes('NF-000002'));
    A.ok('3.5 the look-alike rule is not on the device', typeof D.possibleDuplicate === 'undefined' && typeof D.possibleDuplicateMsg === 'undefined');
    const Q = 'ถ้าเป็นคนเดียวกัน ให้เปิด record เดิม';
    A.eq('3.6 …and its words are in gas-backend.gs only',
      ['data.js', 'app.jsx', 'registry.jsx', 'gas-backend.gs'].map(f => code(f).includes(Q)), [false, false, false, true]);
    const views = ['registry.jsx', 'app.jsx', 'calculator.jsx', 'log.jsx'];
    // A patient's name falls back to its initials, its id or `id`; a staff user's (the edit-lock
    // holder: holder.name || holder.email) is not a patient's name and is left alone.
    A.eq('3.7 no view builds its own patient name (name || initials / sessionId / id)',
      views.map(f => /\.name \|\| ([\w?]+\.)?(initials|sessionId|id)\b/.test(code(f))), [false, false, false, false]);
    A.ok('3.8 registry\'s "still on the unit" is isOnUnit itself', /const isActivePatient = D_R\.isOnUnit;/.test(read('registry.jsx')));
    A.eq('3.9 …and no view writes that rule out again',
      ['registry.jsx', 'app.jsx'].map(f => /!\w+\.status \|\| \w+\.status === "Active"|\w+\.status && \w+\.status !== "Active"/.test(code(f))), [false, false]);
    A.eq('3.10 both modals take dob from dobFromAdmitDol, and no view does the arithmetic',
      [(code('registry.jsx').match(/D_R\.dobFromAdmitDol\(/g) || []).length, /addDaysToDateStr\(admitDate/.test(code('registry.jsx'))], [2, false]);
    A.eq('3.11 one bed-taken wording on the device (data.js)',
      ['data.js', 'registry.jsx', 'app.jsx'].map(f => (code(f).match(/จึงจะบันทึกเตียงนี้ได้/g) || []).length), [1, 0, 0]);
    A.ok('3.12 the NF prefix is one constant', /const SESSION_ID_PREFIX = "NF-";/.test(read('data.js'))
      && /SESSION_ID_PREFIX \+ String\(n\)/.test(read('data.js')) && !/"nf" \+/.test(read('data.js')));
  },

  // ════ § 4 ════
  async 'backend'(A) {
    console.log('\n── § 4 the backend ──');
    const noInitials = (m) => !/ชื่อย่อ/.test(String(m || ''));
    { const g = backend();
      A.ok('4.0 register', g.as({ action: 'registerPatient', isNew: true, patient: P() }).ok === true);
      const base = g.synced('NF-000100');
      const r = g.as({ action: 'registerPatient', base, patient: { ...base, admissionDate: day(-6), dob: day(-6) } });
      A.eq('4.1 an Admit date correction (dob moves with it) saves', [r.ok, g.row('NF-000100').admissionDate, g.row('NF-000100').dob], [true, day(-6), day(-6)]);
      const base2 = g.synced('NF-000100');
      const r2 = g.as({ action: 'registerPatient', base: base2, patient: { ...base2, dob: day(-8) } });
      A.eq('4.2 a DOL แรกรับ correction (dob alone) saves', [r2.ok, g.row('NF-000100').dob], [true, day(-8)]); }
    { const g = backend();
      g.seed('ลก-BW1700', { name: 'ลก', initials: 'ลก', bw: 1700, dob: '', admit: day(-4), bed: 'NICU 9' });
      const b1 = g.synced('ลก-BW1700');
      const r1 = g.as({ action: 'registerPatient', base: b1, patient: { ...b1, admissionDate: day(-5), dob: day(-5) } });
      const b2 = g.synced('ลก-BW1700');
      const r2 = g.as({ action: 'registerPatient', base: b2, patient: { ...b2, admissionDate: day(-4), dob: day(-4) } });
      A.eq('4.3 a record with no stored dob: corrected, then corrected again', [r1.ok, r2.ok, g.row('ลก-BW1700').admissionDate], [true, true, day(-4)]); }
    { const g = backend();
      const be = (k) => String(Number(k.slice(0, 4)) + 543) + k.slice(4);
      g.seed('บธ-BW1400', { name: 'บญ ธร', bw: 1400, dob: be(day(-8)), admit: be(day(-6)), bed: 'NICU 7' });
      const b = g.synced('บธ-BW1400');
      const r = g.as({ action: 'registerPatient', base: b, patient: { ...b, admissionDate: day(-6), dob: day(-8) } });
      A.eq('4.4 a พ.ศ. admission date converted to ค.ศ. saves (it is what Edit demands first)', [r.ok, g.row('บธ-BW1400').admissionDate], [true, day(-6)]); }
    { const g = backend();
      g.as({ action: 'registerPatient', isNew: true, patient: P() });
      const stale = g.synced('NF-000100');
      const other = g.as({ action: 'registerPatient', base: stale, patient: { ...stale, admissionDate: day(-7), dob: day(-7) } });
      const r = g.as({ action: 'registerPatient', base: stale, patient: { ...stale, admissionDate: day(-6), dob: day(-6) } });
      A.ok('4.5 two devices correcting one dob: the second is refused', other.ok === true && !r.ok && /อีกเครื่อง/.test(r.error || ''));
      A.eq('4.6 …the first one\'s value stands', g.row('NF-000100').dob, day(-7));
      const dx = g.as({ action: 'registerPatient', base: stale, patient: { ...stale, diagnosis: 'RDS' } });
      A.eq('4.7 a stale device that does not touch dob still saves, and keeps the newer dob',
        [dx.ok, g.row('NF-000100').diagnosis, g.row('NF-000100').dob], [true, 'RDS', day(-7)]);
      A.ok('4.8 the refusal does not say ชื่อย่อ', noInitials(r.error)); }
    { const g = backend();
      g.as({ action: 'registerPatient', isNew: true, patient: P() });
      const r = g.as({ action: 'registerPatient', patient: P({ dob: day(-9), admissionDate: day(-9) }) });
      A.eq('4.9 a write with no base whose dob differs: still asked (older clients)', [r.needsConfirm, r.code], [true, 'DifferentInfant']);
      A.ok('4.10 …in words that do not say ชื่อย่อ', noInitials(r.error)); }
    { const g = backend();
      g.as({ action: 'registerPatient', isNew: true, patient: P() });
      const before = g.rows('Patient_Registry').length;
      const r = g.as({ action: 'registerPatient', isNew: true, patient: P({ name: 'กร ขว', bw: 1500, dob: day(-1), admissionDate: day(-1), currentBed: 'NICU 6' }) });
      A.eq('4.11 a registration on a taken id: IdTaken, nothing written', [r.needsConfirm, r.code, g.rows('Patient_Registry').length, g.row('NF-000100').name], [true, 'IdTaken', before, 'สม จด']);
      A.ok('4.12 …in words that do not say ชื่อย่อ', noInitials(r.error)); }
    { const g = backend();
      g.seed('NF-111111', { name: 'สม จด', bw: 900, dob: day(-20), admit: day(-20), status: 'Transferred', bed: 'NICU 11', statusDate: day(-60) });
      const reg = P({ sessionId: 'NF-222222', name: 'สด จง', dob: day(-20), admissionDate: day(-2), currentBed: 'NICU 6' });
      const r = g.as({ action: 'registerPatient', isNew: true, patient: reg });
      A.eq('4.13 same BW and dob as a record on file (even one no ward syncs): PossibleDuplicate', [r.needsConfirm, r.code], [true, 'PossibleDuplicate']);
      A.ok('4.14 …naming it: name, status, bed, id', ['สม จด', 'Transferred', 'NICU 11', 'NF-111111'].every(s => String(r.error).includes(s)));
      A.eq('4.15 …and nothing written', g.row('NF-222222'), undefined);
      const ok = g.as({ action: 'registerPatient', isNew: true, confirmDuplicate: true, patient: reg });
      A.eq('4.16 confirmDuplicate: registered as a new infant', [ok.ok, g.row('NF-222222')?.name], [true, 'สด จง']); }
    { const g = backend();
      g.seed('NF-333333', { name: '[PDPA-erased 2026-09-20]', bw: 900, dob: '', admit: day(-20), bed: 'SCN 4' });
      g.seed('NF-444444', { name: 'กร ขว', bw: 900, dob: day(-19), admit: day(-19), bed: 'SCN 5' });
      const r = g.as({ action: 'registerPatient', isNew: true, patient: P({ sessionId: 'NF-555555', dob: day(-20), admissionDate: day(-20), currentBed: 'NICU 6' }) });
      A.eq('4.17 an erased record or another dob is not a look-alike', r.ok, true); }
  },

  // ════ § 5 ════
  async 'app-admit-date'(A) {
    console.log('\n── § 5a the Edit modal corrects an Admit date, end to end ──');
    const g = backend();
    g.seed('NF-100001', { name: 'รย ทอ', initials: 'รท', bw: 1200, dob: day(-12), admit: day(-10), bed: 'NICU 1' });
    const t = app(g); t.quiet();
    await t.start(); await t.pickWard('NICU');
    await t.click(t.btn(/^Edit$/, t.row(/รย ทอ/)));
    await t.typeInto(t.fieldInput('Admit date', t.modal()), day(-11));
    await t.click(t.btn(/Save changes/, t.modal()));
    await t.settle();
    A.eq('5a.1 no error in the modal', modalError(t), '');
    A.ok('5a.2 the modal closed', !t.modal());
    A.eq('5a.3 the sheet holds the corrected Admit date and the dob it moves', [g.row('NF-100001').admissionDate, g.row('NF-100001').dob], [day(-11), day(-13)]);
  },

  async 'app-id-redraw'(A) {
    console.log('\n── § 5b a taken id is drawn again before anything is shown ──');
    const g = backend();
    g.seed('NF-000001', { name: 'กร ขว', initials: 'กข', bw: 1500, dob: day(-3), admit: day(-3), bed: 'NICU 4' });
    const t = app(g); t.quiet();
    const D = t.window.NEOFEED_DATA;
    const real = D.newSessionId;
    let draws = 0;
    D.newSessionId = () => (draws++ === 0 ? 'NF-000001' : real());
    await t.start(); await t.pickWard('NICU');
    await t.register({ first: 'เรยา', last: 'ทองดี', bw: 1300, gaW: 31, gaD: 4, sex: 'girls', bed: 'NICU 3' });
    const regs = t.callsOf('registerPatient');
    const mine = g.rows('Patient_Registry').find(r => r[1] === 'รย ทอ');
    A.eq('5b.1 two requests: the taken id, then a fresh one', [regs.length, regs[0]?.patient.sessionId], [2, 'NF-000001']);
    A.ok('5b.2 the infant is registered under a new NF id', !!mine && NF.test(mine[0]) && mine[0] !== 'NF-000001');
    A.eq('5b.3 the record that held the id is untouched', g.row('NF-000001').name, 'กร ขว');
    A.eq('5b.4 nobody was asked anything, and the modal closed', [t.confirms.length, !!t.modal()], [0, false]);
    A.ok('5b.5 the list shows the new infant', !!t.row(/รย ทอ/));
  },

  async 'app-lookalike'(A) {
    console.log('\n── § 5c the server asks about a look-alike, synced to this device or not ──');
    const g = backend();
    // Synced to the ward (transferred three days ago)…
    g.seed('NF-600001', { name: 'สม จด', initials: 'สจ', bw: 900, dob: day(-20), admit: day(-20), status: 'Transferred', bed: 'NICU 11', statusDate: day(-3) });
    // …and one only the server can see (sixty days ago).
    g.seed('NF-600002', { name: 'ปร พฒ', initials: 'ปพ', bw: 1100, dob: day(-70), admit: day(-70), status: 'Discharged', bed: 'SCN 2', statusDate: day(-60) });
    const t = app(g); t.quiet();
    await t.start(); await t.pickWard('NICU');
    // 1. The synced look-alike, declined.
    t.answer = false;
    const admitAs = async (dob) => {
      await t.click(t.btn(/New session/));
      const m = t.modal();
      const names = m.querySelectorAll('.name-fields input.inp');
      await t.typeInto(names[0], 'สุดา'); await t.typeInto(names[1], 'ใจงาม');
      await t.typeInto(t.fieldInput('Birth weight', m), 900);
      const ga = [...m.querySelectorAll('.field')].find(f => /^GA/.test(f.querySelector('label').textContent.trim())).querySelectorAll('select');
      await t.selectVal(ga[0], 28); await t.selectVal(ga[1], 0);
      await t.selectVal(t.fieldInput('Sex', m), 'boys');
      await t.selectVal(t.fieldInput('Bed', m), 'NICU 6');
      await t.typeInto(t.fieldInput('Admit date', m), dob);
      await t.click(t.btn(/Register/, m));
      await t.settle();
    };
    await admitAs(day(-20));
    A.ok('5c.1 the server asked, naming the infant on file', t.confirms.length === 1 && /สม จด/.test(t.confirms[0]) && /Transferred/.test(t.confirms[0]));
    A.eq('5c.2 declined: one request (the question), nothing written', [t.callsOf('registerPatient').length, g.rows('Patient_Registry').length], [1, 2]);
    A.ok('5c.3 …and the modal says so', /ยกเลิก/.test(modalError(t)));
    await t.click(t.btn(/Cancel/, t.modal()));
    // 2. The same, accepted: asked again, then sent with confirmDuplicate.
    t.answer = true;
    await admitAs(day(-20));
    const r1 = t.callsOf('registerPatient').slice(1);
    A.eq('5c.4 accepted: the question, then the request with confirmDuplicate', [r1.length, !!r1[0]?.confirmDuplicate, r1[1]?.confirmDuplicate], [2, false, true]);
    A.ok('5c.5 …and a second record exists, under its own id', g.rows('Patient_Registry').filter(r => r[1] === 'สด จง').length === 1);
    // 3. A look-alike only the server sees: it asks, and a yes sends again.
    t.confirms.length = 0;
    await t.click(t.btn(/New session/));
    {
      const m = t.modal();
      const names = m.querySelectorAll('.name-fields input.inp');
      await t.typeInto(names[0], 'ปริยา'); await t.typeInto(names[1], 'พงษ์');
      await t.typeInto(t.fieldInput('Birth weight', m), 1100);
      const ga = [...m.querySelectorAll('.field')].find(f => /^GA/.test(f.querySelector('label').textContent.trim())).querySelectorAll('select');
      await t.selectVal(ga[0], 30); await t.selectVal(ga[1], 0);
      await t.selectVal(t.fieldInput('Sex', m), 'girls');
      await t.selectVal(t.fieldInput('Bed', m), 'NICU 8');
      await t.typeInto(t.fieldInput('Admit date', m), day(-2));
      await t.typeInto(t.fieldInput('DOL at admit', m), 69);   // dob = admit − 68 days = day(-70)
      await t.click(t.btn(/Register/, m));
      await t.settle();
    }
    const r2 = t.callsOf('registerPatient').slice(3);
    A.ok('5c.6 the server asked, naming the record no ward syncs', t.confirms.length === 1 && /ปร พฒ/.test(t.confirms[0]) && /NF-600002/.test(t.confirms[0]));
    A.eq('5c.7 a yes sends it again with confirmDuplicate, and it lands', [r2.length, r2[1]?.confirmDuplicate, g.rows('Patient_Registry').some(r => r[1] === 'ปร พง')], [2, true, true]);
  },
};

RB.runScenarios(__filename, 'NAMES + NEOFEED ID 2026-09-27', scenarios);
