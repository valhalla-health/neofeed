// verify-hardening-1102.cjs — five whole-app findings of the attack pass of 2026-10-30, all older than the
// TPN-room work (Pp, 2026-11-02).
//
//   §1     A3: a caller with no account can no longer grow Audit_Log without limit;
//   §2     A3: a replayed Google token no longer refetches tokeninfo;
//   §3     A4: the lock stays, and a flood of invented addresses does not touch it;
//   §4     A5: the possible-duplicate question names an infant only to someone whose sync carries that
//          infant, and is audited (this reverses Pp's 2026-09-27 "every row": her call at merge);
//   §5–§6  A10: size caps on calcInput and the registry's free text;
//   §7     R2: a NEW sessionId must be NF- and six digits, and an old id keeps working everywhere;
//   §8     what the real <Calculator> saves sits well under the cap, and the real backend takes it whole.
//
// Real gas-backend.gs in gas-vm-sandbox.cjs, and in §8 the real calculator.jsx in jsdom (the deps in
// test/README.md). Synthetic infants only. Every number is written here rather than read from the backend,
// so moving a limit fails this file. HARDENING_BACKEND_ONLY=1 skips §8, for the mutation check, which runs
// this file once per mutant.
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { boot, recorder, withNow, wardToday, addDays, bkkMidnight } = require('./gas-vm-sandbox.cjs');
const T = recorder('HARDENING 2026-11-02');

const AUDIT_MAX = 60;           // rows per window from callers with no account
const CALC_MAX = 10000;         // characters of serialised calcInput
const FIELD_MAX = { name: 200, initials: 40, diagnosis: 2000, currentBed: 60, twinSuffix: 20,
  dob: 40, admissionDate: 40, statusDate: 40 };
const LOGIN_FAILED = 'email หรือรหัสผ่านไม่ถูกต้อง';
const LOCKED = 'ลองใหม่ในอีก 15 นาที — login ผิดพลาดหลายครั้ง';

// The sections that compare dates run at noon, ward time, of the day the run starts, so a run that crosses
// midnight ICT cannot flip a sync-window case. The ceiling's sections start at the top of an hour.
const NOON = Date.parse(wardToday() + 'T05:00:00Z');
const HOUR_MS = 3600e3;
const HOUR = Math.floor(NOON / HOUR_MS) * HOUR_MS;
const atNoon = (fn) => () => withNow(NOON, fn);
const atHour = (fn) => () => withNow(HOUR, fn);
const day = (n) => addDays(wardToday(), n);

function ward() {
  const g = boot();
  // The floods below would otherwise spend most of a minute on rounds that are not what they test.
  g.sb.HASH_V2_ITERATIONS = 1;
  g.addStaff('doc@kcmh.test', 'doctor', 'Doctor-Password-1', { name: 'Dr Test' });
  g.addStaff('nurse@kcmh.test', 'nurse', 'Nurse-Password-1', { name: 'Nurse Test' });
  g.addStaff('admin@kcmh.test', 'admin', 'Admin-Password-1', { name: 'Admin Test' });
  g.dt = g.session('doc@kcmh.test', 'doctor');
  g.nt = g.session('nurse@kcmh.test', 'nurse');
  g.at = g.session('admin@kcmh.test', 'admin');
  g.as = (tok, body) => g.post(Object.assign({ token: tok }, body));
  g.failRows = () => g.audit().filter(a => ['loginFail', 'lockout', 'loginFailCapped'].includes(a.action));
  g.fetches = 0;
  const realFetch = g.sb.UrlFetchApp.fetch;
  g.sb.UrlFetchApp.fetch = (...a) => { g.fetches++; return realFetch(...a); };
  return g;
}
const P = (sid, extra) => Object.assign({ sessionId: sid, name: 'ทารกใหม่', initials: 'ทม', bw: 1000, ga: 30.1, sex: 'boys',
  dob: day(-5), admissionDate: day(-5), twinSuffix: '', status: 'Active', currentBed: '', diagnosis: 'RDS',
  weights: [{ dol: 1, w: 1000 }], lengths: [], hcs: [], bedHistory: [], statusDate: '', multiplesCount: 0 }, extra);
const E = (status, calcInput) => ({ dol: 5, weight: 1000, fluid: 150, gir: 7, pro: 2, kcal: 42, na: 2, k: 2.5, ca: 0, p: 0,
  enVolPerKg: 0, route: 'TPN central', status, constantsVersion: '2026-10-28.1', calcInput });
// A calcInput whose serialised length is exactly n.
function sized(n) {
  const c = { tpnWtG: 1000, stops: [], pad: '' };
  c.pad = 'ก'.repeat(n - JSON.stringify(c).length);
  if (JSON.stringify(c).length !== n) throw new Error('sized(' + n + ') is off');
  return c;
}
// The characters of the first Daily_Log row's calcInput, or null with no row.
// What the client sent, as stored: the server's own orderBy/orderRev/orderAt stamp (2026-11-07) is left out, as
// the cap leaves it out.
const storedCalcInput = (g) => {
  const r = g.rows('Daily_Log')[0];
  if (!r) return null;
  const { orderBy, orderRev, orderAt, ...sent } = JSON.parse(r[24]);
  return JSON.stringify(sent).length;
};
const stranger = (g, i) => g.post({ action: 'login', email: 'ghost' + i + '@evil.test', password: 'guess-' + i });
const fillCeiling = (g) => { for (let i = 0; i < AUDIT_MAX + 3; i++) stranger(g, 'fill' + i); };
// What Google says about the token this call sends. A life of 3000 s is a token 10 minutes old.
function googleSays(g, email, opts) {
  opts = opts || {};
  g.env.urlFetch = { code: 200, body: JSON.stringify({ aud: 'client-id.apps.googleusercontent.com', iss: 'https://accounts.google.com',
    exp: String(Math.floor(Date.now() / 1000) + (opts.life === undefined ? 3000 : opts.life)), email_verified: 'true', email, hd: opts.hd }) };
}
const googleRefuses = (g) => { g.env.urlFetch = { code: 400, body: '{"error":"invalid_token"}' }; };

T.section('§1 A3 · a flood of addresses with no account cannot grow Audit_Log', atHour(() => {
  const g = ward();
  const replies = new Set();
  for (let i = 0; i < 200; i++) replies.add(JSON.stringify(stranger(g, i)));
  T.eq('200 invented addresses: 60 loginFail rows', g.audit().filter(a => a.action === 'loginFail').length, AUDIT_MAX);
  T.eq('…and one row says the ceiling was reached, with no address on it',
    g.audit().filter(a => a.action === 'loginFailCapped'), [{ action: 'loginFailCapped', sessionId: '', actor: '' }]);
  T.eq('…and nothing else: 61 rows, not the 200 of before', g.audit().length, AUDIT_MAX + 1);
  T.eq('every one of the 200 gets the same answer, so nobody can tell the ceiling from the outside',
    [...replies], [JSON.stringify({ status: 'unauthorized', error: LOGIN_FAILED })]);
  T.eq('the rows name what was typed, so the first of a flood is still evidence',
    g.audit()[0], { action: 'loginFail', sessionId: '', actor: 'ghost0@evil.test' });
  withNow(HOUR + HOUR_MS - 1000, () => {
    stranger(g, 'late');
    T.eq('59:59 into the hour: still 61', g.audit().length, AUDIT_MAX + 1);
  });
  withNow(HOUR + HOUR_MS, () => {
    stranger(g, 'next');
    T.eq('the next hour writes again', g.audit().length, AUDIT_MAX + 2);
    T.eq('…the address it names', g.audit().slice(-1)[0].actor, 'ghostnext@evil.test');
    for (let i = 0; i < 200; i++) stranger(g, 'n' + i);
    T.eq('…up to its own 60, and one more marker', g.audit().length, 2 * (AUDIT_MAX + 1));
  });
  T.eq('no flood row counts as a weekly active user (M1)', g.sb.usageMetrics(g.sheet('Audit_Log').data).totalDistinctUsers, 0);
}));

T.section('§1 A3 · the ceiling is per clock hour: a slow stream never reaches it', () => {
  const g = ward();
  withNow(HOUR + 50 * 60e3, () => { for (let i = 0; i < 40; i++) stranger(g, 'early' + i); });
  withNow(HOUR + 70 * 60e3, () => { for (let i = 0; i < 40; i++) stranger(g, 'later' + i); });
  T.eq('40 late in one hour and 40 early in the next: all 80 are on the record, and no marker',
    [g.audit().filter(a => a.action === 'loginFail').length, g.audit().filter(a => a.action === 'loginFailCapped').length], [80, 0]);
  // HOUR is an odd UTC hour; this one is even, so a window of two hours would span the two starts below.
  const even = Date.parse(wardToday() + 'T04:00:00Z');
  const h = ward();
  withNow(even, () => { fillCeiling(h); });
  const full = h.audit().length;
  withNow(even + HOUR_MS, () => { stranger(h, 'next'); });
  T.eq('the window is one hour wherever it starts: the full hour ends at its own top', h.audit().length, full + 1);
});

T.section('§1 A3 · every refusal for an address with no proven account shares the one ceiling', atHour(() => {
  const paths = [
    ['Google sign-in, no Staff row', 'ไม่พบบัญชีนี้ในระบบ', (g) => {
      googleSays(g, 'outsider@gmail.com');
      return g.post({ action: 'login', googleToken: 'tok-outsider' });
    }],
    ['Google sign-in, a suspended Staff row', 'บัญชีนี้ถูกระงับ', (g) => {
      g.addStaff('left@gmail.com', 'doctor', null, { active: false });
      googleSays(g, 'left@gmail.com');
      return g.post({ action: 'login', googleToken: 'tok-left' });
    }],
    ['Google sign-in, a Workspace account whose hd does not match', 'บัญชีนี้ต้องเข้าสู่ระบบด้วย email และรหัสผ่าน', (g) => {
      g.sb.GOOGLE_HD_ENFORCE = true;
      googleSays(g, 'someone@chula.ac.th');
      return g.post({ action: 'login', googleToken: 'tok-hd' });
    }],
    ['password form, a Staff row with no password', LOGIN_FAILED, (g) => {
      g.addStaff('googleonly@chula.ac.th', 'doctor', null);
      return g.post({ action: 'login', email: 'googleonly@chula.ac.th', password: 'a-guess-here' });
    }],
    ['password form, the right password of a suspended account', 'บัญชีนี้ถูกระงับ', (g) => {
      g.addStaff('sus@kcmh.test', 'doctor', 'Suspended-Pass-1', { active: false });
      return g.post({ action: 'login', email: 'sus@kcmh.test', password: 'Suspended-Pass-1' });
    }],
  ];
  for (const [name, refusal, go] of paths) {
    const fresh = ward();
    const r1 = go(fresh);
    T.eq(name + ': the refusal is unchanged', [r1.status, r1.error], ['unauthorized', refusal]);
    T.eq('…below the ceiling it writes its row', fresh.audit().map(a => a.action), ['loginFail']);
    const full = ward();
    fillCeiling(full);
    const before = full.audit().length;
    const r2 = go(full);
    T.eq('…past the ceiling the same refusal', [r2.status, r2.error], ['unauthorized', refusal]);
    T.eq('…and no row', full.audit().length, before);
  }
  const g = ward();
  for (let i = 0; i < 6; i++) g.post({ action: 'login', email: 'one@evil.test', password: 'guess' });
  T.eq('five tries at one invented address: five loginFail and one lockout, as before; the refused sixth adds none',
    g.audit().map(a => a.action), ['loginFail', 'loginFail', 'loginFail', 'loginFail', 'loginFail', 'lockout']);
}));

T.section('§1 A3 · guesses at a real password account stay on the record', atHour(() => {
  const g = ward();
  fillCeiling(g);
  const before = g.audit().length;
  for (let i = 0; i < 5; i++) g.post({ action: 'login', email: 'doc@kcmh.test', password: 'wrong-' + i });
  const after = g.audit().slice(before);
  T.eq('past the ceiling, five wrong passwords at a real account still write five rows and the lockout',
    after.map(a => [a.action, a.actor]), [
      ['loginFail', 'doc@kcmh.test'], ['loginFail', 'doc@kcmh.test'], ['loginFail', 'doc@kcmh.test'],
      ['loginFail', 'doc@kcmh.test'], ['loginFail', 'doc@kcmh.test'], ['lockout', 'doc@kcmh.test']]);
  const h = ward();
  for (let i = 0; i < 4; i++) h.post({ action: 'login', email: 'doc@kcmh.test', password: 'wrong-' + i });
  for (let i = 0; i < AUDIT_MAX; i++) stranger(h, i);
  T.eq('…and they do not use up the ceiling: 60 invented addresses still get 60 rows after 4 real guesses',
    h.audit().filter(a => a.action === 'loginFail' && a.actor !== 'doc@kcmh.test').length, AUDIT_MAX);
}));

T.section('§1 A3 · a cache outage keeps the row and the answer', atHour(() => {
  const g = ward();
  googleSays(g, 'outsider@gmail.com');
  g.env.cacheThrows = true;
  const r = g.post({ action: 'login', googleToken: 'tok-down' });
  T.eq('CacheService down: the refusal is still the refusal', [r.status, r.error], ['unauthorized', 'ไม่พบบัญชีนี้ในระบบ']);
  T.eq('…and the row is written: an audit row is worth more than the ceiling', g.audit().map(a => a.action), ['loginFail']);
  T.eq('…and the token was checked with Google', g.fetches, 1);
}));

T.section('§2 A3 · a replayed Google token asks Google once', atNoon(() => {
  const g = ward();
  googleSays(g, 'outsider@gmail.com');
  for (let i = 0; i < 40; i++) g.post({ action: 'login', googleToken: 'tok-replay' });
  T.eq('40 replays of one non-staff token: one tokeninfo fetch (was 40)', g.fetches, 1);
  T.eq('…and 40 rows, under the ceiling', g.failRows().length, 40);
  for (let i = 0; i < 100; i++) g.post({ action: 'login', googleToken: 'tok-replay' });
  T.eq('100 more: still one fetch', g.fetches, 1);
  T.eq('…and the rows stop at the ceiling', g.failRows().length, AUDIT_MAX + 1);
  googleSays(g, 'other@gmail.com');
  g.post({ action: 'login', googleToken: 'tok-other' });
  T.eq('a different token is its own check', g.fetches, 2);

  const s = ward();
  s.addStaff('real@gmail.com', 'doctor', null, { name: 'Real Doc' });
  googleSays(s, 'real@gmail.com');
  const a = s.post({ action: 'login', googleToken: 'tok-staff' });
  const b = s.post({ action: 'login', googleToken: 'tok-staff' });
  T.eq('a staff token signs in on the first try and on a replay, with one fetch',
    [a.status, a.email, b.status, b.email, s.fetches], ['ok', 'real@gmail.com', 'ok', 'real@gmail.com', 1]);
  s.sheet('Staff').data.find(r => r[0] === 'real@gmail.com')[3] = false;
  s.expireStaffCache('real@gmail.com');
  const c = s.post({ action: 'login', googleToken: 'tok-staff' });
  T.eq('what is kept is the signature check, never the decision: suspended now, refused now, no fetch',
    [c.status, c.error, s.fetches], ['unauthorized', 'บัญชีนี้ถูกระงับ', 1]);

  const w = ward();
  w.sb.GOOGLE_HD_ENFORCE = true;
  w.addStaff('ws@chula.ac.th', 'doctor', null);
  googleSays(w, 'ws@chula.ac.th', { hd: 'chula.ac.th' });
  w.post({ action: 'login', googleToken: 'tok-ws' });
  const ws = w.post({ action: 'login', googleToken: 'tok-ws' });
  T.eq('a replay keeps the Workspace hd, so the domain rule reads the same', [ws.status, w.fetches], ['ok', 1]);
}));

T.section('§2 A3 · only a verified token is kept, and only for its own life', () => {
  const t0 = NOON;
  const g = ward();
  withNow(t0, () => {
    g.addStaff('real@gmail.com', 'doctor', null);
    googleSays(g, 'real@gmail.com', { life: 3000 });
    T.eq('signs in', g.post({ action: 'login', googleToken: 'tok-life' }).status, 'ok');
    googleRefuses(g);
  });
  withNow(t0 + 2999e3, () => {
    T.eq('a second before it expires: still kept, no fetch', [g.post({ action: 'login', googleToken: 'tok-life' }).status, g.fetches], ['ok', 1]);
  });
  withNow(t0 + 3001e3, () => {
    const r = g.post({ action: 'login', googleToken: 'tok-life' });
    T.eq('past its exp: asked again, and Google refuses it', [r.status, r.error, g.fetches], ['unauthorized', 'Google token ไม่ถูกต้อง', 2]);
  });

  const e = ward();
  withNow(t0, () => {
    e.addStaff('real@gmail.com', 'doctor', null);
    googleSays(e, 'real@gmail.com', { life: 0 });
    T.eq('a token in its last second signs in', e.post({ action: 'login', googleToken: 'tok-last' }).status, 'ok');
    googleRefuses(e);
    const again = e.post({ action: 'login', googleToken: 'tok-last' });
    T.eq('…and is not kept: there is no life left to keep it for', [again.status, e.fetches], ['unauthorized', 2]);
  });

  withNow(t0, () => {
    const b = ward();
    b.addStaff('real@gmail.com', 'doctor', null);
    googleRefuses(b);
    const bad = b.post({ action: 'login', googleToken: 'tok-flip' });
    googleSays(b, 'real@gmail.com');
    const good = b.post({ action: 'login', googleToken: 'tok-flip' });
    T.eq('a refusal is not kept: Google is asked again', [bad.status, good.status, b.fetches], ['unauthorized', 'ok', 2]);

    const o = ward();
    o.addStaff('real@gmail.com', 'doctor', null);
    o.env.urlFetch = { code: 503, body: 'down' };
    const down = o.post({ action: 'login', googleToken: 'tok-outage' });
    googleSays(o, 'real@gmail.com');
    const up = o.post({ action: 'login', googleToken: 'tok-outage' });
    T.eq('Google\'s outage is not kept: the retry that its message asks for works', [down.code, up.status, o.fetches], ['ServiceUnavailable', 'ok', 2]);

    const a = ward();
    a.env.urlFetch = { code: 200, body: JSON.stringify({ aud: 'someone-elses-app', iss: 'https://accounts.google.com',
      exp: String(Math.floor(Date.now() / 1000) + 3000), email_verified: 'true', email: 'x@gmail.com' }) };
    a.post({ action: 'login', googleToken: 'tok-aud' });
    a.post({ action: 'login', googleToken: 'tok-aud' });
    T.eq('a token minted for another app is not kept', a.fetches, 2);

    const k = ward();
    const token = 'eyJhbGciOiJSUzI1NiJ9.SENTINEL-TOKEN-BODY.' + 'x'.repeat(1500);
    googleSays(k, 'outsider@gmail.com');
    k.post({ action: 'login', googleToken: token });
    k.post({ action: 'login', googleToken: token });
    const stored = JSON.stringify([...k.cacheStore.entries()]);
    T.eq('a 1,500-character token still caches (a key is hashed, so the 250-character cap never bites)', k.fetches, 1);
    T.ok('the token itself is in no cache key or value', !stored.includes('SENTINEL-TOKEN-BODY'));
    const entry = [...k.cacheStore.keys()].find(key => /^gtok_[0-9a-f]{64}$/.test(key));
    T.ok('…the key is gtok_ and a SHA-256', !!entry, [...k.cacheStore.keys()]);
    if (entry) k.cacheStore.get(entry).v = 'not json';
    k.post({ action: 'login', googleToken: token });
    T.eq('a cached value that cannot be read is a miss', k.fetches, 2);
  });
});

T.section('§3 A4 · the lock stays: a choice, written down in REFERENCE.md', atHour(() => {
  const g = ward();
  for (let i = 0; i < 5; i++) g.post({ action: 'login', email: 'doc@kcmh.test', password: 'wrong-' + i });
  const r = g.post({ action: 'login', email: 'doc@kcmh.test', password: 'Doctor-Password-1' });
  T.eq('five wrong passwords lock the account, and the right one is refused', [r.status, r.error], ['unauthorized', LOCKED]);
  withNow(HOUR + 16 * 60e3, () => {
    T.eq('sixteen minutes later it signs in', g.post({ action: 'login', email: 'doc@kcmh.test', password: 'Doctor-Password-1' }).status, 'ok');
  });
  const h = ward();
  for (let i = 0; i < 200; i++) stranger(h, i);
  T.eq('a flood of invented addresses does not lock a real account',
    h.post({ action: 'login', email: 'doc@kcmh.test', password: 'Doctor-Password-1' }).status, 'ok');
  const ref = fs.readFileSync(path.join(__dirname, '..', 'REFERENCE.md'), 'utf8');
  const note = (ref.match(/\*\*Five wrong passwords lock[\s\S]*?\n\n/) || [''])[0];
  T.ok('REFERENCE.md says who can do it, for how long, and what the ward does',
    /anyone/i.test(note) && /15 minutes/.test(note) && /ward/i.test(note) && /LOCKOUT_MS/.test(note), note.slice(0, 200));
}));

// A registry row as Sheets hands it back: dates as Date values.
function seed(g, sid, o) {
  g.sheet('Patient_Registry').data.push(g.patRow(sid, { 1: o.name, 2: 'สจ', 3: o.bw, 6: bkkMidnight(o.dob), 7: bkkMidnight(o.dob),
    9: o.status, 10: o.bed, 16: o.statusDate ? bkkMidnight(o.statusDate) : '' }));
}
const askDup = (g, tok, sid, bw, dob, extra) => g.as(tok, Object.assign({ action: 'registerPatient', isNew: true,
  patient: P(sid, { bw, dob, admissionDate: dob }) }, extra));
const dupRows = (g) => g.audit().filter(a => a.action === 'possibleDuplicate');

T.section('§4 A5 · an infant outside the caller\'s sync is not named', atNoon(() => {
  const dob = day(-60);
  for (const [who, tokenOf, email] of [['a nurse', g => g.nt, 'nurse@kcmh.test'], ['a doctor', g => g.dt, 'doc@kcmh.test']]) {
    const g = ward();
    seed(g, 'NF-900001', { name: 'SENTINEL-ARCHIVED', bw: 1234, dob, status: 'Discharged', bed: 'NICU 9', statusDate: day(-40) });
    const before = g.rows('Patient_Registry').length;
    const r = askDup(g, tokenOf(g), 'NF-100001', 1234, dob);
    T.eq(who + ': it is still asked', [r.needsConfirm, r.code], [true, 'PossibleDuplicate']);
    T.ok('…with no name, bed, status or ID', !['SENTINEL', 'NICU 9', 'Discharged', 'NF-900001', 'สจ'].some(s => JSON.stringify(r).includes(s)), r);
    T.ok('…the BW and date the caller typed, and to ask an admin', String(r.error).includes('1234') && String(r.error).includes(dob) && String(r.error).includes('admin'), r.error);
    T.eq('…and the reply carries nothing else', Object.keys(r).sort(), ['code', 'error', 'needsConfirm']);
    T.eq('…nothing written', g.rows('Patient_Registry').length, before);
    T.eq('…and the question is audited, with the record it matched and who asked', dupRows(g),
      [{ action: 'possibleDuplicate', sessionId: 'NF-900001', actor: email }]);
  }
  const g = ward();
  seed(g, 'NF-900002', { name: 'SENTINEL-NODATE', bw: 1500, dob, status: 'Transferred', bed: 'SCN 2', statusDate: '' });
  const r = askDup(g, g.nt, 'NF-100002', 1500, dob);
  T.ok('a discharge with no usable statusDate is outside the window too', r.needsConfirm && !String(r.error).includes('SENTINEL'), r);
}));

T.section('§4 A5 · the message names a row exactly when the caller\'s own sync carries it', atNoon(() => {
  const dob = day(-70);
  const rows = [
    ['NF-910001', 'Active', '', 1101], ['NF-910002', 'Discharged', day(-10), 1102], ['NF-910003', 'Discharged', day(-30), 1103],
    ['NF-910004', 'Discharged', day(-31), 1104], ['NF-910005', 'Transferred', day(-200), 1105], ['NF-910006', 'Expired', '', 1106],
  ];
  const g = ward();
  rows.forEach(([sid, status, statusDate, bw], i) => seed(g, sid, { name: 'SENTINEL-' + sid, bw, dob, status, statusDate, bed: 'NICU ' + (20 + i) }));
  const synced = new Set(g.as(g.nt, { action: 'getActivePatients' }).patients.map(p => p.sessionId));
  T.eq('the sync carries the first three', [...synced].sort(), ['NF-910001', 'NF-910002', 'NF-910003']);
  rows.forEach(([sid, status, statusDate, bw], i) => {
    const r = askDup(g, g.nt, 'NF-10000' + i, bw, dob);
    const named = String(r.error).includes('SENTINEL-' + sid) && String(r.error).includes(sid) && String(r.error).includes(status);
    T.eq(sid + ' ' + status + ' ' + (statusDate || 'no date') + ': named ' + synced.has(sid), named, synced.has(sid));
    T.eq('…no ask-an-admin line when it is named', String(r.error).includes('admin'), !synced.has(sid));
  });
  T.eq('every question is audited, one row each', dupRows(g).length, rows.length);
}));

T.section('§4 A5 · an admin holds the archive, and a named match beats a hidden one', atNoon(() => {
  const dob = day(-60);
  const g = ward();
  seed(g, 'NF-900003', { name: 'SENTINEL-OLD', bw: 1234, dob, status: 'Discharged', bed: 'NICU 9', statusDate: day(-40) });
  const r = askDup(g, g.at, 'NF-100003', 1234, dob);
  T.ok('an admin\'s sync can carry every row, so an admin gets the name, bed and ID',
    ['SENTINEL-OLD', 'NICU 9', 'NF-900003'].every(s => String(r.error).includes(s)), r);
  T.ok('…and is not told to ask an admin', !String(r.error).includes('ถาม admin'), r.error);
  T.eq('…and is audited the same way', dupRows(g), [{ action: 'possibleDuplicate', sessionId: 'NF-900003', actor: 'admin@kcmh.test' }]);

  const m = ward();
  seed(m, 'NF-900004', { name: 'SENTINEL-HIDDEN', bw: 1234, dob, status: 'Discharged', bed: 'NICU 9', statusDate: day(-40) });
  seed(m, 'NF-900005', { name: 'SENTINEL-ONWARD', bw: 1234, dob, status: 'Active', bed: 'SCN 3', statusDate: '' });
  const both = askDup(m, m.nt, 'NF-100004', 1234, dob);
  T.ok('an archived row first and an on-unit row second: the on-unit one is named', String(both.error).includes('SENTINEL-ONWARD') && String(both.error).includes('NF-900005'), both);
  T.ok('…the archived one is not', !String(both.error).includes('SENTINEL-HIDDEN') && !String(both.error).includes('NF-900004'), both);
  T.eq('…and the audit row names the one shown', dupRows(m).map(a => a.sessionId), ['NF-900005']);

  const c = ward();
  seed(c, 'NF-900006', { name: 'SENTINEL-CONFIRM', bw: 1234, dob, status: 'Discharged', bed: 'NICU 9', statusDate: day(-40) });
  const ok = askDup(c, c.nt, 'NF-100005', 1234, dob, { confirmDuplicate: true });
  T.eq('"a different baby" registers, and asks no question to audit', [ok.ok, dupRows(c).length], [true, 0]);
  T.eq('…the registration has its own row', c.audit().map(a => [a.action, a.sessionId]), [['registerPatient', 'NF-100005']]);

  const n = ward();
  const plain = askDup(n, n.dt, 'NF-100006', 1234, dob);
  T.eq('no look-alike: no question and no such row', [plain.ok, dupRows(n).length], [true, 0]);
}));

T.section('§5 A10 · calcInput', atNoon(() => {
  const made = (g) => { g.as(g.dt, { action: 'registerPatient', isNew: true, patient: P('NF-100101') }); };
  const log = (g, entry, ts) => g.as(g.dt, { action: 'logDailyNutrition', sessionId: 'NF-100101', entry: Object.assign(entry, { ts: ts || day(-1) }) });

  const g = ward(); made(g);
  const ok = log(g, E('draft', sized(CALC_MAX)));
  T.ok('10,000 characters land', !!ok.entryId, ok);
  T.eq('…whole', storedCalcInput(g), CALC_MAX);

  const over = log(g, E('draft', sized(CALC_MAX + 1)), day(-2));
  T.ok('10,001 are refused, in Thai, with both counts', /[ก-๙]/.test(over.error || '') && String(over.error).includes('10001') && String(over.error).includes('10000'), over);
  T.ok('…and the refusal repeats none of what was sent', !String(over.error).includes('ก'.repeat(5)), String(over.error).slice(0, 200));
  T.eq('…nothing written', g.rows('Daily_Log').length, 1);

  const sub = ward(); made(sub);
  const s1 = log(sub, E('submitted', sized(CALC_MAX + 1)));
  T.ok('a submitted save is held to the same cap', !!s1.error && String(s1.error).includes('10001') && sub.rows('Daily_Log').length === 0, s1);

  const str = ward(); made(str);
  const s2 = log(str, E('draft', 'x'.repeat(CALC_MAX + 10)));
  T.ok('a calcInput that is one long string, not an object, is measured too', !!s2.error && str.rows('Daily_Log').length === 0, s2);

  const u = ward(); made(u);
  const r0 = log(u, E('draft', sized(2000)));
  const bad = u.as(u.dt, { action: 'updateDailyNutrition', sessionId: 'NF-100101', entryId: r0.entryId, expectedLastModified: r0.lastModified, entry: E('draft', sized(CALC_MAX + 1)) });
  T.ok('editing a draft in place: refused', !!bad.error && String(bad.error).includes('10001'), bad);
  T.eq('…the row keeps what it had', storedCalcInput(u), 2000);
  const good = u.as(u.dt, { action: 'updateDailyNutrition', sessionId: 'NF-100101', entryId: r0.entryId, expectedLastModified: r0.lastModified, entry: E('draft', sized(CALC_MAX)) });
  T.ok('…10,000 goes through', good.ok === true, good);

  const v = ward(); made(v);
  const r1 = log(v, E('submitted', sized(2000)));
  const rev = v.as(v.dt, { action: 'updateDailyNutrition', sessionId: 'NF-100101', entryId: r1.entryId, expectedLastModified: r1.lastModified, entry: E('submitted', sized(CALC_MAX + 1)) });
  T.ok('revising a submitted order: refused, and no revision row', !!rev.error && String(rev.error).includes('10001') && v.rows('Daily_Log').length === 1, rev);
}));

T.section('§6 A10 · the registry\'s free text', atNoon(() => {
  const LABEL = { name: 'Name', initials: 'Initials', diagnosis: 'Diagnosis', currentBed: 'Bed', twinSuffix: 'Twin letter',
    dob: 'Date of birth', admissionDate: 'Admit date', statusDate: 'Status date' };
  // A date field is written whole after the date check reads its first ten characters.
  const fill = (f, n) => (['dob', 'admissionDate', 'statusDate'].includes(f) ? day(-5) + 'x'.repeat(n - 10) : 'ก'.repeat(n));
  for (const f of Object.keys(FIELD_MAX)) {
    const max = FIELD_MAX[f];
    const g = ward();
    const atCap = g.as(g.dt, { action: 'registerPatient', isNew: true, patient: P('NF-100201', { [f]: fill(f, max) }) });
    T.eq(f + ': ' + max + ' characters land', atCap.ok, true);
    const h = ward();
    const r = h.as(h.dt, { action: 'registerPatient', isNew: true, patient: P('NF-100202', { [f]: fill(f, max + 1) }) });
    T.ok('…' + (max + 1) + ' are refused, naming the field and both counts',
      !!r.error && String(r.error).includes(LABEL[f]) && String(r.error).includes(String(max + 1)) && String(r.error).includes(String(max)), r);
    T.ok('…repeating none of it, in Thai', !String(r.error).includes('กกกกก') && !String(r.error).includes('xxxxx') && /[ก-๙]/.test(r.error), String(r.error).slice(0, 200));
    T.eq('…nothing written', h.rows('Patient_Registry').length, 0);
  }
  // A row longer than the cap can be on the sheet already: a name registered before these caps, or a cell
  // typed by hand. _checkAdmissionDate's rule: refusing what the editor never touched would make the record
  // uncorrectable, and one record that cannot be edited stops a bedside save.
  const g = ward();
  const longName = 'ก'.repeat(300), longDx = 'RDS · '.repeat(600), longBed = 'เตียง  ชั่วคราว '.repeat(10).trim();
  g.sheet('Patient_Registry').data.push(g.patRow('NF-300001', { 1: longName, 11: longDx, 10: longBed }));
  const stored = g.as(g.dt, { action: 'getActivePatients' }).patients.find(p => p.sessionId === 'NF-300001');
  const withBase = g.as(g.dt, { action: 'updatePatient', base: stored, patient: Object.assign({}, stored, { twinSuffix: 'A' }) });
  T.eq('a stored 300-character name, 3,600-character diagnosis and long bed: an edit of something else goes through', withBase.ok, true);
  const noBase = g.as(g.dt, { action: 'updatePatient', patient: Object.assign({}, stored, { twinSuffix: 'B' }) });
  T.eq('…from a client with no base too, carrying the same text', noBase.ok, true);
  const spaced = g.as(g.dt, { action: 'updatePatient', patient: Object.assign({}, stored, { name: longName + ' ', twinSuffix: 'C' }) });
  T.eq('…a stray space does not make it new', spaced.ok, true);
  const nameBefore = g.sheet('Patient_Registry').data[1][1];
  const changed = g.as(g.dt, { action: 'updatePatient', base: stored, patient: Object.assign({}, stored, { name: longName + 'ข' }) });
  T.ok('…changing the long name to another long name is refused', !!changed.error && String(changed.error).includes('Name'), changed);
  T.eq('…the sheet keeps the stored name', g.sheet('Patient_Registry').data[1][1], nameBefore);
}));

T.section('§7 R2 · a new sessionId is NF- and six digits', atNoon(() => {
  const bad = ['TT-BW900-A', 'สจ-BW900-A', 'x', 'NF-12345', 'NF-1234567', 'nf-100001', 'NF100001', ' NF-100001', 'NF-100001 ',
    'NF-100001\n', 'NF-10000a', 'NF-١٢٣٤٥٦', 'SENTINEL-NAME HN TEST0001', '=HYPERLINK("x")'];
  for (const sid of bad) {
    const g = ward();
    const r = g.as(g.dt, { action: 'registerPatient', isNew: true, patient: P(sid) });
    T.ok(JSON.stringify(sid) + ' is refused', !!r.error && /[ก-๙]/.test(r.error) && g.rows('Patient_Registry').length === 0, r);
    T.ok('…the refusal does not repeat it', !String(r.error).includes('SENTINEL') && !String(r.error).includes('HYPERLINK'), r.error);
    T.eq('…and no audit row carries it', g.audit().length, 0);
  }
  const g = ward();
  const up = g.as(g.dt, { action: 'registerPatient', patient: P('TT-BW900-A') });
  T.ok('a registerPatient with no isNew cannot make a new row with another shape either', !!up.error && g.rows('Patient_Registry').length === 0, up);
  const upd = g.as(g.dt, { action: 'updatePatient', patient: P('TT-BW901-A') });
  T.ok('…nor an updatePatient with no base', !!upd.error && g.rows('Patient_Registry').length === 0, upd);
  const q = ward();
  seed(q, 'NF-900007', { name: 'SENTINEL-ONWARD', bw: 1234, dob: day(-60), status: 'Active', bed: 'SCN 3', statusDate: '' });
  const asked = askDup(q, q.nt, 'TT-BW1234-A', 1234, day(-60));
  T.ok('a refused id asks no question about the baby: no name in the reply', !!asked.error && !asked.needsConfirm && !String(asked.error).includes('SENTINEL'), asked);
  T.eq('…and no question to audit', dupRows(q).length, 0);
  const taken = ward();
  taken.sheet('Patient_Registry').data.push(taken.patRow('NF-900008', { 10: 'SCN 3' }));
  const stays = taken.as(taken.dt, { action: 'registerPatient', isNew: true, patient: P('TT-BW900-A', { currentBed: 'SCN 3' }) });
  T.ok('a save refused for another reason keeps its own message', !!stays.error && String(stays.error).includes('SCN 3'), stays);
  for (const sid of ['NF-000000', 'NF-999999']) {
    const h = ward();
    T.eq(sid + ' registers', h.as(h.dt, { action: 'registerPatient', isNew: true, patient: P(sid) }).ok, true);
  }

  // The rule and the app must agree: data.js newSessionId, the only thing that makes an id, run as it ships.
  const ctx = { window: {}, globalThis: null, console, crypto: require('crypto').webcrypto };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'data.js'), 'utf8').replace(/\r\n/g, '\n'), ctx, { filename: 'data.js' });
  const D = ctx.window.NEOFEED_DATA;
  const draws = Array.from({ length: 2000 }, () => D.newSessionId());
  T.ok('2,000 draws of the app\'s own newSessionId all match the shape', draws.every(s => /^NF-\d{6}$/.test(s)), draws.find(s => !/^NF-\d{6}$/.test(s)));
  const a = ward();
  const twinA = a.as(a.dt, { action: 'registerPatient', isNew: true, patient: P(draws[0], { twinSuffix: 'A', multiplesCount: 2 }) });
  const twinB = a.as(a.dt, { action: 'registerPatient', isNew: true, confirmDuplicate: true, patient: P(draws[1] === draws[0] ? 'NF-000001' : draws[1], { twinSuffix: 'B', multiplesCount: 2 }) });
  T.eq('twins are two draws and a letter: the second confirms it is another baby, and both land', [twinA.ok, twinB.ok, a.rows('Patient_Registry').length], [true, true, 2]);
}));

T.section('§7 R2 · an id issued before 2026-09-27 keeps working everywhere', atNoon(() => {
  const OLD = 'สจ-BW900-A';
  const g = ward();
  g.sheet('Patient_Registry').data.push(g.patRow(OLD, { 3: 900 }));
  const sync = g.as(g.nt, { action: 'getActivePatients' });
  const p = sync.patients.find(x => x.sessionId === OLD);
  T.ok('sync carries it', !!p, sync.patients.map(x => x.sessionId));
  T.eq('an edit with base', g.as(g.dt, { action: 'updatePatient', base: p, patient: Object.assign({}, p, { diagnosis: 'RDS, PDA' }) }).ok, true);
  T.eq('an edit from a client with no base', g.as(g.dt, { action: 'registerPatient', patient: Object.assign({}, p, { diagnosis: 'RDS' }) }).ok, true);
  T.eq('weights', g.as(g.dt, { action: 'updateWeights', sessionId: OLD, weights: [{ dol: 1, w: 900 }, { dol: 5, w: 950 }] }).ok, true);
  const logged = g.as(g.dt, { action: 'logDailyNutrition', sessionId: OLD, entry: Object.assign(E('draft', { tpnWtG: 1000, stops: [] }), { ts: day(-1) }) });
  T.ok('a save', !!logged.entryId, logged);
  const edit = g.as(g.dt, { action: 'updateDailyNutrition', sessionId: OLD, entryId: logged.entryId, expectedLastModified: logged.lastModified, entry: E('draft', { tpnWtG: 1000, stops: [] }) });
  T.eq('an edit of that save', edit.ok, true);
  T.eq('the order reads back under it', (g.as(g.nt, { action: 'getActivePatients' }).log[OLD] || []).length, 1);
  const taken = g.as(g.dt, { action: 'registerPatient', isNew: true, patient: Object.assign({}, p) });
  T.eq('a registration landing on it is IdTaken, as before', [taken.needsConfirm, taken.code], [true, 'IdTaken']);
  T.eq('…a taken id is not the look-alike question, so it has no such row', dupRows(g).length, 0);
}));

// §8 — what the real form saves. Mounted last, because it changes globals the sandbox does not need.
async function realCalculator() {
  console.log('\n── §8 A10 · the real <Calculator>: every save sits well under the cap, and the backend takes it whole ──');
  const babel = require('@babel/core');
  const { JSDOM } = require('jsdom');
  const DIR = path.join(__dirname, '..') + '/';
  const R = (f) => String(fs.readFileSync(DIR + f, 'utf8')).replace(/\r\n/g, '\n');
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'https://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  Object.assign(global, { window, document: window.document, self: window, HTMLElement: window.HTMLElement,
    Element: window.Element, Node: window.Node, getComputedStyle: window.getComputedStyle, localStorage: window.localStorage,
    requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true });
  global.showToast = () => {};
  window.print = () => {};
  window.confirm = () => true;
  // The longest reason a person can type: the prompt keeps 300 characters of it.
  window.prompt = () => 'ทารกมีภาวะน้ำตาลในเลือดต่ำรุนแรงและดื้อต่อการรักษา '.repeat(20);
  const React = require('react');
  const ReactDOM = require('react-dom/client');
  const { act } = require('react');
  global.React = React; window.React = React;
  { const w = console.error; console.error = (...a) => { if (!/act\(|not wrapped|Not implemented/.test(String(a[0]))) w(...a); }; }
  vm.runInThisContext(R('data.js'));
  for (const f of ['icons.jsx', 'calculator.jsx']) {
    vm.runInThisContext(babel.transformSync(R(f), { presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
      filename: f, configFile: false, babelrc: false }).code);
  }
  const container = document.getElementById('root');
  let root = ReactDOM.createRoot(container);
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  const typeInto = (input, v) => act(() => { valueSetter.call(input, String(v)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
  const set = (label, v) => {
    const input = [...container.querySelectorAll('.field')].find(d => d.querySelector('label')?.textContent.startsWith(label))?.querySelector('input')
      || [...container.querySelectorAll('.salt-row-grid')].find(d => d.firstElementChild?.firstElementChild?.textContent.startsWith(label))?.querySelector('input');
    if (!input) throw new Error('no field labelled ' + label);
    typeInto(input, v);
  };
  const press = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  // A long Staff name and address: what savedByLabel is built from.
  const userLabel = 'ศาสตราจารย์ แพทย์หญิง ชื่อยาวมากเป็นพิเศษ นามสกุลยาวมากเป็นพิเศษ (a.very.long.staff.address.for.this.test@kcmh.test)';
  const patient = { sessionId: 'NF-110201', name: 'สม จด', bw: 1000, currentBed: 'NICU 5', diagnosis: '-', weights: [{ dol: 1, w: 1000 }], admissionDate: '2026-10-20' };
  let saved = [];
  const logDate = day(-1);
  function mount() {
    act(() => { root.unmount(); });
    root = ReactDOM.createRoot(container);
    window.localStorage.clear();
    saved = [];
    act(() => { root.render(React.createElement(window.Calculator, { patient, dol: 10, editEntry: null, baselineEntry: null, previousEntry: null, logDate, userLabel,
      onLog: (e) => { saved.push(e); return Promise.resolve({ ok: true, entryId: 'e-' + saved.length, lastModified: 'lm' }); },
      onUpdate: () => Promise.resolve({ ok: true, lastModified: 'lm-u' }), onSaved() {}, onWeightChange() {} })); });
    act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
  }
  function required(fluid) {
    set('Current weight', 1000);
    for (const l of ['Target fluid', 'Other IV', 'Drug volume', 'Input', 'Urine output', 'Drain content']) set(l, l === 'Target fluid' ? fluid : 0);
    const central = [...container.querySelectorAll('.step2-ctrl .seg button')].find(b => b.textContent.trim() === 'Central');
    if (central) act(() => { central.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  }
  const submit = () => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Submit');
  const draft = () => container.querySelector('button.save-draft');
  const cases = [];

  mount();
  set('Current weight', 1000);
  await press(draft());
  cases.push(['a draft with the required boxes blank', saved[0], 'draft']);

  mount();
  required(150);
  set('Volume(mL/day)', 100); set('Dextrose final', 10); set('Amino acid', 3); set('20% lipid', 2); set('KCl', 2);
  await press(submit());
  cases.push(['an ordinary submitted bag', saved[0], 'submitted']);

  // The longest the boxes can make it: every number box left holding a 19-character decimal, every tick on,
  // kept as a draft so that no stop holds it back. The weights keep to what the backend's range check takes.
  mount();
  for (const box of [...container.querySelectorAll('input[type=checkbox]')]) {
    if (!box.closest('label.no-tpn-chk') && !box.checked) act(() => { box.click(); });
  }
  for (const input of [...container.querySelectorAll('input')]) {
    if (!['checkbox', 'radio', 'date'].includes(input.type)) typeInto(input, '0.12345678901234567');
  }
  set('Current weight', '1234.56789012345678');
  set('TPN calc. weight', '1234.56789012345678');
  await press(draft());
  cases.push(['every box a 19-character decimal, every tick on', saved[0], 'draft']);

  // The most words a save can carry: a critical override, the 300-character reason, every alert named.
  mount();
  required(250);
  set('Volume(mL/day)', 240); set('Dextrose final', 17); set('Amino acid', 5.5); set('20% lipid', 4.8); set('KCl', 6); set('ZnSO₄', 5);
  await press(submit());
  cases.push(['a critical override with its 300-character reason', saved[0], 'submitted']);
  act(() => { root.unmount(); });

  const over = cases[3][1]?.calcInput?.critOverride;
  T.ok('the override case is the real thing: several critical alerts and the whole reason', !!over && over.alerts.length >= 5 && over.reason.length === 300, over);
  cases.forEach(([name, entry, status], i) => {
    if (!entry) { T.ok(name + ': the form saved', false, 'nothing saved'); return; }
    const chars = JSON.stringify(entry.calcInput).length;
    console.log(`        ${name}: ${chars} characters of calcInput`);
    T.ok(name + ': under half the cap, so a later field cannot walk a real order into the refusal', chars <= CALC_MAX / 2, chars);
    T.eq('…status as pressed', entry.status, status);
    withNow(NOON, () => {
      const g = ward();
      g.as(g.dt, { action: 'registerPatient', isNew: true, patient: P(patient.sessionId) });
      const r = g.as(g.dt, { action: 'logDailyNutrition', sessionId: patient.sessionId, entry });
      // Whole, plus the server's own stamp of whose order it is (orderBy, orderRev, orderAt; 2026-11-07 N1).
      // The calculator sends its own guess of orderRev for the ward's copy; the server's stamp is what is stored.
      const { orderBy, orderRev, orderAt, ...stored } = JSON.parse(g.rows('Daily_Log')[0][24]);
      const { orderBy: _b, orderRev: _r, orderAt: _a, ...sent } = entry.calcInput;
      T.ok('…the real backend takes it whole', !!r.entryId && JSON.stringify(stored) === JSON.stringify(sent)
        && orderBy === 'doc@kcmh.test' && orderRev === 1 && !!orderAt, r);
    });
  });
}

(async () => {
  if (process.env.HARDENING_BACKEND_ONLY) console.log('\n(§8 skipped: HARDENING_BACKEND_ONLY)');
  else {
    try { await realCalculator(); }
    catch (e) { T.ok('§8 ran without throwing', false, (e && e.stack || String(e)).split('\n').slice(0, 3).join(' | ')); }
  }
  T.done();
})();
