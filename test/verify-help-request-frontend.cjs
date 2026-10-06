// verify-help-request-frontend.cjs — the help request form (Pp, 2026-10-05),
// driven through the REAL <App/> in jsdom against the fake Apps Script in
// review-0917-boot.cjs, one scenario per process. The backend half is
// verify-help-request-backend.cjs.
//
//   #1  The user menu has ขอความช่วยเหลือ; it opens a form with the four
//       categories, a detail box and the "no HN" notice. A blank detail is
//       refused in place without a request. A filled form sends ONE
//       sendHelpRequest carrying the category, the detail and the context —
//       the page, the app version, the browser, the time — and nothing about
//       the patient on screen. The form closes and a toast confirms.
//   #2  A refusal (RateLimited) is shown in the form in the server's own
//       words, not as "บันทึกไม่สำเร็จ"; the form stays open with the text.
//   #3  A network failure says the request may not have arrived; the form
//       stays open with the text, so it can be sent again.
//   #4  A Google sign-in user (no password to change) still gets the item.
//
// Dev-only deps as in test/README.md.
const { boot, runScenarios, DOCTOR } = require('./review-0917-boot.cjs');

const modal = () => [...document.querySelectorAll('.modal-box')].find(m => /ขอความช่วยเหลือ/.test(m.textContent)) || null;
async function openHelp(t) {
  await t.click(document.querySelector('.topbar .user'));
  const item = t.btn(/ขอความช่วยเหลือ/);
  if (!item) return false;
  await t.click(item);
  return !!modal();
}
async function typeArea(t, area, v) {
  const setter = Object.getOwnPropertyDescriptor(t.window.HTMLTextAreaElement.prototype, 'value').set;
  await t.act(async () => { setter.call(area, v); area.dispatchEvent(new t.window.Event('input', { bubbles: true })); });
  await t.flush();
}
const sendBtn = () => t0.btn(/^ส่ง/, modal());
let t0;

const scenarios = {
  async 'menu-form-send'(A) {
    console.log('\n── #1 the menu item, the form, one request ──');
    const t = t0 = boot();
    t.quiet();
    await t.start();
    await t.pickWard('NICU');
    A.ok('1.1 the user menu has ขอความช่วยเหลือ, and it opens the form', await openHelp(t));
    const m = modal();
    const sel = m && m.querySelector('select');
    A.eq('1.2 four categories', sel ? [...sel.options].map(o => o.value).filter(Boolean) : null, ['bug', 'numbers', 'feature', 'other']);
    A.ok('1.3 a detail box', !!(m && m.querySelector('textarea')));
    A.ok('1.4 the form asks for no HN or patient name', m && /HN/.test(m.textContent) && /ชื่อผู้ป่วย/.test(m.textContent));
    A.ok('1.5 …and says what is attached', m && /แนบ/.test(m.textContent));

    await t.click(sendBtn());
    A.eq('1.6 a blank detail sends nothing', t.callsOf('sendHelpRequest').length, 0);
    A.ok('1.7 …and says why, in the form', !!modal() && /เขียนรายละเอียดก่อนส่ง/.test(modal().textContent));

    await t.selectVal(modal().querySelector('select'), 'numbers');
    await typeArea(t, modal().querySelector('textarea'), 'GIR ขึ้นไม่ตรงกับที่คิดมือ');
    await t.click(sendBtn());
    const calls = t.callsOf('sendHelpRequest');
    A.eq('1.8 exactly one request', calls.length, 1);
    const c = calls[0] || {};
    A.eq('1.9 category', c.category, 'numbers');
    A.eq('1.10 detail', c.detail, 'GIR ขึ้นไม่ตรงกับที่คิดมือ');
    A.eq('1.11 the page it was sent from', c.context && c.context.view, 'registry');
    A.ok('1.12 the app version', c.context && typeof c.context.appVersion === 'string' && c.context.appVersion.length > 0);
    A.ok('1.13 the browser', c.context && typeof c.context.userAgent === 'string');
    A.ok('1.14 the device time', c.context && !isNaN(Date.parse(c.context.clientTime)));
    A.eq('1.15 nothing else: no patient, no session id', Object.keys(c).sort(), ['action', 'category', 'context', 'detail', 'token']);
    A.eq('1.16 …and the context has only those four', Object.keys(c.context || {}).sort(), ['appVersion', 'clientTime', 'userAgent', 'view']);
    A.eq('1.17 the session token rides along', c.token, DOCTOR.token);
    A.ok('1.18 the form closes', !modal());
    A.ok('1.19 a toast confirms', t.toasts().some(x => /ส่งถึงทีม Valhalla แล้ว/.test(x)));
  },

  async 'refusal-in-place'(A) {
    console.log('\n── #2 a refusal is shown in the form, in the server\'s words ──');
    const t = t0 = boot();
    t.quiet();
    t.server.hooks.sendHelpRequest = () => ({ reply: { error: 'ส่งไปแล้ว 5 เรื่องในชั่วโมงที่ผ่านมา — รอสักพักแล้วค่อยส่งเรื่องถัดไป', code: 'RateLimited' } });
    await t.start();
    await t.pickWard('NICU');
    await openHelp(t);
    await typeArea(t, modal().querySelector('textarea'), 'เรื่องที่หก');
    await t.click(sendBtn());
    A.ok('2.1 the form stays open', !!modal());
    A.ok('2.2 with the server\'s sentence', modal() && /ส่งไปแล้ว 5 เรื่อง/.test(modal().textContent));
    A.ok('2.3 not "บันทึกไม่สำเร็จ"', modal() && !/บันทึกไม่สำเร็จ/.test(modal().textContent));
    A.eq('2.4 the text is kept', modal() && modal().querySelector('textarea').value, 'เรื่องที่หก');
    A.ok('2.5 no success toast', !t.toasts().some(x => /ส่งถึงทีม/.test(x)));
  },

  async 'network-failure'(A) {
    console.log('\n── #3 a network failure keeps the form and says so ──');
    const t = t0 = boot();
    t.quiet();
    t.server.hooks.sendHelpRequest = () => ({ network: true });
    await t.start();
    await t.pickWard('NICU');
    await openHelp(t);
    await typeArea(t, modal().querySelector('textarea'), 'ทดสอบ');
    await t.click(sendBtn());
    A.ok('3.1 the form stays open', !!modal());
    A.ok('3.2 it says the request may not have arrived', modal() && /ไม่แน่ใจว่าส่งถึงทีมหรือยัง/.test(modal().textContent));
    A.eq('3.3 the text is kept', modal() && modal().querySelector('textarea').value, 'ทดสอบ');
  },

  async 'google-user'(A) {
    console.log('\n── #4 a Google sign-in user gets the item too ──');
    const t = t0 = boot({ session: { ...DOCTOR, authMethod: 'google' } });
    t.quiet();
    await t.start();
    await t.pickWard('NICU');
    await t.click(document.querySelector('.topbar .user'));
    A.ok('4.1 no change-password item (unchanged)', !t.btn(/เปลี่ยนรหัสผ่าน/));
    A.ok('4.2 ขอความช่วยเหลือ is there', !!t.btn(/ขอความช่วยเหลือ/));
  },
};

runScenarios(__filename, 'HELP REQUEST FRONTEND', scenarios);
