// verify-help-request-backend.cjs — the in-app help request (Pp, 2026-10-05):
// staff ask the Valhalla team for help from inside NeoFeed, and the backend
// mails it to valhalla.team.th@gmail.com. Uses the shared Sheets double
// (gas-vm-sandbox.cjs); no npm dependencies.
//
//   §1  Only a signed-in session can send, and a temp password cannot (the
//       mustChangePassword gate covers this action like every other).
//   §2  The mail: to the team address, subject "[NeoFeed help] <ประเภท>" (the
//       Gmail filter on the team account forwards on that subject), sender
//       name NeoFeed, replyTo the staff member's own email, and a body with
//       the request plus what the app attached. One Audit_Log row.
//   §3  Every role can ask: doctor, nurse, admin.
//   §4  The Script Property HELP_REQUEST_TO moves the recipient without a
//       code change; a value that is not an address is ignored.
//   §5  Validation, in Thai: a category from the list, a non-blank detail,
//       at most 2000 characters. Nothing is sent when it fails.
//   §6  What the client sends is cleaned: control characters out of the
//       detail (newlines kept), out of every context field (newlines too), and
//       each context field capped — a crafted userAgent cannot start a new
//       line in the mail.
//   §7  Five requests per person per rolling hour; the sixth is refused
//       (RateLimited) and sends nothing; another person is unaffected; an hour
//       later it works again.
//   §8  A MailApp failure (no send_mail scope yet, quota spent) is a Thai
//       "try again" (MailFailed, retryable), writes no audit row and does not
//       use up the hourly allowance.
//   §9  A CacheService outage does not block a request (the limit fails open).
//
// NEGATIVE CONTROL — every section but §1's Unauthorized goes red against the
// backend before this feature:
//   git show origin/main:gas-backend.gs > /tmp/gas-pre-help.gs
//   NEOFEED_GAS_SRC=/tmp/gas-pre-help.gs node test/verify-help-request-backend.cjs
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const { boot, recorder, withNow } = require('./gas-vm-sandbox.cjs');
const T = recorder('HELP REQUEST BACKEND');

const TEAM = 'valhalla.team.th@gmail.com';
const isThai = (s) => /[฀-๿]/.test(String(s || ''));
const CTX = { view: 'registry', appVersion: 'a=abc123;c=def456', userAgent: 'Mozilla/5.0 (iPhone)', clientTime: '2026-10-05T10:00:00.000Z' };

function ward() {
  const g = boot();
  g.addStaff('doc@kcmh.test', 'doctor', 'Doctor-Password-1', { name: 'Dr Doc' });
  g.addStaff('nur@kcmh.test', 'nurse', 'Nurse-Password-1');
  g.addStaff('adm@kcmh.test', 'admin', 'Admin-Password-1');
  g.addStaff('tmp@kcmh.test', 'doctor', 'Temp-Password-1', { mustChange: true });
  return g;
}
const ask = (g, token, extra) => g.post(Object.assign({ action: 'sendHelpRequest', token,
  category: 'bug', detail: 'กด Save แล้วหมุนค้าง', context: CTX }, extra || {}));
const helpAudits = (g) => g.audit().filter(a => a.action === 'helpRequest');

T.section('§1 only a signed-in session, and not on a temp password', () => {
  const g = ward();
  const noTok = ask(g, undefined);
  T.eq('1.1 no token → Unauthorized', noTok.error, 'Unauthorized');
  const bad = ask(g, 'not-a-real-token');
  T.eq('1.2 an unknown token → Unauthorized', bad.error, 'Unauthorized');
  const tmp = ask(g, g.session('tmp@kcmh.test', 'doctor'));
  T.eq('1.3 a temp-password session → PasswordChangeRequired', tmp.error, 'PasswordChangeRequired');
  T.eq('1.4 …and nothing was mailed', g.env.mails.length, 0);
});

T.section('§2 the mail the team receives', () => {
  const g = ward();
  const res = ask(g, g.session('doc@kcmh.test', 'doctor'), { detail: 'กด Save แล้วหมุนค้าง\nลองสองครั้งแล้ว' });
  T.eq('2.1 ok', res, { ok: true });
  T.eq('2.2 exactly one mail', g.env.mails.length, 1);
  const m = g.env.mails[0] || {};
  T.eq('2.3 to the team address', m.to, TEAM);
  T.eq('2.4 subject carries the filter tag and the category', m.subject, '[NeoFeed help] ใช้งานไม่ได้');
  T.eq('2.5 sender name is NeoFeed', m.name, 'NeoFeed');
  T.eq('2.6 replyTo is the staff member, so the team can answer them', m.replyTo, 'doc@kcmh.test');
  const body = String(m.body || '');
  T.ok('2.7 the body has the request, newline kept', body.includes('กด Save แล้วหมุนค้าง\nลองสองครั้งแล้ว'), body);
  T.ok('2.8 …who sent it, with role', body.includes('doc@kcmh.test') && body.includes('doctor'), body);
  T.ok('2.9 …the page, the app version and the browser', body.includes('registry') && body.includes('a=abc123;c=def456') && body.includes('Mozilla/5.0 (iPhone)'), body);
  T.ok('2.10 …and the server\'s own time in Bangkok', /\d{4}-\d{2}-\d{2} \d{2}:\d{2} \(Asia\/Bangkok\)/.test(body), body);
  T.ok('2.11 the body reminds the reader it holds no patient identifiers by design', body.includes('HN'), body);
  T.eq('2.12 one Audit_Log row, by the sender', helpAudits(g).map(a => a.actor), ['doc@kcmh.test']);
  T.ok('2.13 no html body — plain text only', m.htmlBody === undefined, m);
});

T.section('§3 every role can ask', () => {
  const g = ward();
  T.eq('3.1 nurse', ask(g, g.session('nur@kcmh.test', 'nurse')).ok, true);
  T.eq('3.2 admin', ask(g, g.session('adm@kcmh.test', 'admin')).ok, true);
  T.eq('3.3 two mails', g.env.mails.length, 2);
});

T.section('§4 HELP_REQUEST_TO moves the recipient', () => {
  const g = ward();
  g.props.set('HELP_REQUEST_TO', 'team-two@example.test');
  ask(g, g.session('doc@kcmh.test', 'doctor'));
  T.eq('4.1 the property wins', (g.env.mails[0] || {}).to, 'team-two@example.test');
  g.props.set('HELP_REQUEST_TO', 'not an address');
  ask(g, g.session('doc@kcmh.test', 'doctor'));
  T.eq('4.2 a value that is not an address falls back to the team', (g.env.mails[1] || {}).to, TEAM);
});

T.section('§5 validation, in Thai, sends nothing', () => {
  const g = ward();
  const tok = g.session('doc@kcmh.test', 'doctor');
  const cases = [
    ['5.1 an unknown category', { category: 'urgent' }],
    ['5.2 no category', { category: undefined }],
    ['5.3 a blank detail', { detail: '   \n  ' }],
    ['5.4 a detail over 2000 characters', { detail: 'ก'.repeat(2001) }],
    ['5.5 a detail that is not text', { detail: { text: 'x' } }],
  ];
  for (const [name, extra] of cases) {
    const r = ask(g, tok, extra);
    T.ok(name + ' → BadRequest with a Thai message', r.code === 'BadRequest' && isThai(r.error), r);
  }
  T.eq('5.6 nothing was mailed', g.env.mails.length, 0);
  T.eq('5.7 exactly 2000 characters is fine', ask(g, tok, { detail: 'ก'.repeat(2000) }).ok, true);
  for (const c of ['bug', 'numbers', 'feature', 'other']) {
    T.eq('5.8 category ' + c + ' is accepted', ask(g, tok, { category: c }).ok, true);
  }
  T.eq('5.9 the four labels', g.env.mails.slice(1).map(m => m.subject),
    ['[NeoFeed help] ใช้งานไม่ได้', '[NeoFeed help] ตัวเลขดูแปลก', '[NeoFeed help] อยากได้ฟีเจอร์', '[NeoFeed help] อื่น ๆ']);
});

T.section('§6 what the client sends is cleaned', () => {
  const g = ward();
  const tok = g.session('doc@kcmh.test', 'doctor');
  ask(g, tok, {
    detail: 'line one\u0000\u0007\nline two\ttabbed',
    context: { view: 'registry\r\nBcc: evil@example.test', appVersion: 'v'.repeat(500),
      userAgent: 'UA\nX-Injected: yes' + 'u'.repeat(600), clientTime: 42 },
  });
  const body = String((g.env.mails[0] || {}).body || '');
  T.ok('6.1 control characters are dropped from the detail', body.includes('line one\nline two\ttabbed'), body);
  T.ok('6.2 a context field cannot start a new line', !/^Bcc:/m.test(body) && !/^X-Injected:/m.test(body), body);
  T.ok('6.3 appVersion is capped at 200 characters', !body.includes('v'.repeat(201)) && body.includes('v'.repeat(200)), body.length);
  T.ok('6.4 userAgent is capped at 300 characters', !body.includes('u'.repeat(300)), body.length);
  T.ok('6.5 a context field that is not text reads as "-"', /clientTime[^\n]*: -$/m.test(body) || /เวลาในเครื่อง[^\n]*: -$/m.test(body), body);
  const r = ask(g, tok, { context: 'not an object' });
  T.eq('6.6 a context that is not an object is still a request', r.ok, true);
});

T.section('§7 five per person per rolling hour', () => {
  const g = ward();
  const doc = g.session('doc@kcmh.test', 'doctor');
  const t0 = Date.parse('2026-10-05T03:00:00Z');
  withNow(t0, () => {
    for (let i = 1; i <= 5; i++) T.eq('7.' + i + ' request ' + i + ' goes', ask(g, doc).ok, true);
  });
  const sixth = withNow(t0 + 10 * 60000, () => ask(g, doc));
  T.ok('7.6 the sixth is refused, in Thai', sixth.code === 'RateLimited' && isThai(sixth.error), sixth);
  T.eq('7.7 …and sent nothing', g.env.mails.length, 5);
  const nurse = withNow(t0 + 10 * 60000, () => ask(g, g.session('nur@kcmh.test', 'nurse')));
  T.eq('7.8 another person is unaffected', nurse.ok, true);
  const later = withNow(t0 + 61 * 60000, () => ask(g, doc));
  T.eq('7.9 an hour after the first, it works again', later.ok, true);
});

T.section('§8 a MailApp failure is "try again", unrecorded, and free', () => {
  const g = ward();
  const doc = g.session('doc@kcmh.test', 'doctor');
  g.env.mailThrows = 'You do not have permission to call MailApp.sendEmail. Required permissions: https://www.googleapis.com/auth/script.send_mail';
  const r = ask(g, doc);
  T.ok('8.1 MailFailed, retryable, in Thai', r.code === 'MailFailed' && r.retryable === true && isThai(r.error), r);
  T.ok('8.2 the raw Google error is not shown to staff', !String(r.error).includes('permission'), r);
  T.ok('8.3 …but it is in the script log', g.env.logs.some(l => l.includes('send_mail')), g.env.logs);
  T.eq('8.4 no audit row for a request that did not go', helpAudits(g).length, 0);
  g.env.mailThrows = null;
  for (let i = 1; i <= 5; i++) T.eq('8.' + (4 + i) + ' after the failure, request ' + i + ' still goes', ask(g, doc).ok, true);
});

T.section('§9 a cache outage does not block a request', () => {
  const g = ward();
  const doc = g.session('doc@kcmh.test', 'doctor');
  // verifyToken itself needs the cache, so the outage starts after it: the
  // rate-limit read is the first cache call this action makes.
  const realGet = g.sb.CacheService.getScriptCache;
  let calls = 0;
  g.sb.CacheService.getScriptCache = () => {
    const c = realGet();
    return Object.assign({}, c, {
      get: (k) => { if (String(k).startsWith('helprl_')) { calls++; throw new Error('Service error: CacheService'); } return c.get(k); },
      put: (k, v, ttl) => { if (String(k).startsWith('helprl_')) throw new Error('Service error: CacheService'); return c.put(k, v, ttl); },
    });
  };
  const r = ask(g, doc);
  T.eq('9.1 the request goes', r.ok, true);
  T.ok('9.2 …after the limit tried the cache', calls > 0, calls);
  T.eq('9.3 one mail', g.env.mails.length, 1);
});

T.section('§10 authorizeHelpMail: the one-off consent run, which sends nothing', () => {
  const g = ward();
  T.eq('10.1 it reports the day\'s remaining quota', g.sb.authorizeHelpMail(), 100);
  T.eq('10.2 …without mailing anyone', g.env.mails.length, 0);
  T.ok('10.3 …and says so in the script log', g.env.logs.some(l => /MailApp/.test(l) && /100/.test(l)), g.env.logs);
});

T.done();
