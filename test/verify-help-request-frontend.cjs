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
//   #5  The topbar has a help button directly before the login name (Pp,
//       2026-10-09); one tap opens the form and it sends the same request.
//       The user menu keeps its item.
//   #6  One cropped picture (Pp, 2026-10-09): the form asks for names, beds
//       and HN to be cut out, shows a preview, and sends the picture redrawn
//       as a JPEG no wider than 1600 px, as bare base64.
//   #7  ลบรูป removes it: the request goes with no image key.
//   #8  A PDF, a picture that will not open, and one that stays over 1.5 MB
//       are each refused in Thai in the form; the request still goes without.
//
// NEGATIVE CONTROL — #5 to #8 fail on main before this change (d59e156):
//   git -c core.autocrlf=false archive d59e156 app.jsx icons.jsx | tar -x -C <dir>, then
//   run this harness from a copy whose app.jsx and icons.jsx are main's.
//
// Dev-only deps as in test/README.md.
const { boot, runScenarios, DOCTOR } = require('./review-0917-boot.cjs');

const modal = () => [...document.querySelectorAll('.modal-box')].find(m => /ขอความช่วยเหลือ/.test(m.textContent)) || null;
// The user menu's item, never the topbar's .help-btn, which carries the same
// words and comes first in the document.
const menuItem = () => [...document.querySelectorAll('.topbar button')]
  .find(b => !b.classList.contains('help-btn') && /ขอความช่วยเหลือ/.test(b.textContent)) || null;
async function openHelp(t) {
  await t.click(document.querySelector('.topbar .user'));
  const item = menuItem();
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
    A.ok('4.2 ขอความช่วยเหลือ is there', !!menuItem());
  },

  async 'topbar-button'(A) {
    console.log('\n── #5 the topbar button beside the login name opens the form directly ──');
    const t = t0 = boot();
    t.quiet();
    await t.start();
    await t.pickWard('NICU');
    const tb = document.querySelector('.topbar');
    const hb = tb && tb.querySelector('button.help-btn');
    A.ok('5.1 the topbar has a help button', !!hb);
    A.eq('5.2 …named ขอความช่วยเหลือ for a screen reader', hb && hb.getAttribute('aria-label'), 'ขอความช่วยเหลือ');
    A.ok('5.3 …with the full word and the short one (the CSS picks)', hb && /ขอความช่วยเหลือ/.test(hb.textContent) && !!hb.querySelector('.hb-short'));
    const kids = tb ? [...tb.children] : [];
    const userWrap = tb && tb.querySelector('.user') && tb.querySelector('.user').parentElement;
    A.ok('5.4 …directly before the login name', !!hb && kids.indexOf(hb) >= 0 && kids[kids.indexOf(hb) + 1] === userWrap);
    await t.click(hb);
    A.ok('5.5 one tap opens the form, without the user menu', !!modal());
    await typeArea(t, modal().querySelector('textarea'), 'จากปุ่มบนขวา');
    await t.click(sendBtn());
    A.eq('5.6 it sends the same request as the menu item', t.callsOf('sendHelpRequest').map(c => c.detail), ['จากปุ่มบนขวา']);
    await t.click(document.querySelector('.topbar .user'));
    A.ok('5.7 the user menu keeps its item, for a screen too narrow for the button', !!menuItem());
  },

  async 'picture'(A) {
    console.log('\n── #6 one cropped picture: preview, remove, sent as a JPEG ──');
    const t = t0 = boot();
    t.quiet();
    const pic = stubPictures(t);
    await t.start();
    await t.pickWard('NICU');
    await openHelp(t);
    A.ok('6.1 the form offers แนบรูป', !!t.btn(/แนบรูป/, modal()));
    A.ok('6.2 …and asks for names, beds and HN to be cropped out first', /ครอป/.test(modal().textContent) && /เตียง/.test(modal().textContent) && /HN/.test(modal().textContent));
    const input = modal().querySelector('input[type="file"]');
    A.eq('6.3 the picker takes pictures only', input && input.getAttribute('accept'), 'image/*');

    await choose(t, input, 'ward.png', 'image/png');
    const img = modal().querySelector('.help-shot img');
    A.ok('6.4 a preview shows the picture that will go', !!img && img.getAttribute('src') === pic.dataUrl);
    A.ok('6.5 a 3000 × 2000 picture is drawn at 1600 × 1067, on white first', JSON.stringify(pic.drawn) === '[[1600,1067]]' && pic.filled[0] === '#fff', pic);
    A.eq('6.6 as a JPEG', pic.types, ['image/jpeg']);
    A.ok('6.7 the attach button gives way to ลบรูป', !t.btn(/แนบรูป/, modal()) && !!t.btn(/ลบรูป/, modal()));

    await typeArea(t, modal().querySelector('textarea'), 'ตัวเลขในรูปนี้แปลก');
    await t.click(sendBtn());
    const c = t.callsOf('sendHelpRequest')[0] || {};
    A.eq('6.8 the request carries the picture: a JPEG, bare base64', c.image, { mimeType: 'image/jpeg', data: pic.dataUrl.split(',')[1] });
    A.eq('6.9 …and nothing else new', Object.keys(c).sort(), ['action', 'category', 'context', 'detail', 'image', 'token']);
    A.ok('6.10 the form closes', !modal());
  },

  async 'picture-remove'(A) {
    console.log('\n── #7 ลบรูป: the request goes without it ──');
    const t = t0 = boot();
    t.quiet();
    stubPictures(t);
    await t.start();
    await t.pickWard('NICU');
    await openHelp(t);
    await choose(t, modal().querySelector('input[type="file"]'), 'ward.png', 'image/png');
    await t.click(t.btn(/ลบรูป/, modal()));
    A.ok('7.1 the preview is gone and แนบรูป is back', !modal().querySelector('.help-shot img') && !!t.btn(/แนบรูป/, modal()));
    await typeArea(t, modal().querySelector('textarea'), 'ไม่มีรูป');
    await t.click(sendBtn());
    const c = t.callsOf('sendHelpRequest')[0] || {};
    A.ok('7.2 no image key in the request', !('image' in c), Object.keys(c));
  },

  async 'picture-refused'(A) {
    console.log('\n── #8 a file that is not a picture, one that will not open, one that will not shrink ──');
    const t = t0 = boot();
    t.quiet();
    const pic = stubPictures(t);
    await t.start();
    await t.pickWard('NICU');
    await openHelp(t);
    const input = () => modal().querySelector('input[type="file"]');
    await choose(t, input(), 'notes.pdf', 'application/pdf');
    A.ok('8.1 a PDF: "แนบได้เฉพาะรูปภาพ", nothing attached', /แนบได้เฉพาะรูปภาพ/.test(modal().textContent) && !modal().querySelector('.help-shot img'));
    pic.failDecode = true;
    await choose(t, input(), 'odd.heic', 'image/heic');
    A.ok('8.2 a picture the browser cannot open: says so in Thai', /เปิดรูปนี้ไม่ได้/.test(modal().textContent) && !modal().querySelector('.help-shot img'));
    pic.failDecode = false;
    pic.huge = true;
    pic.drawn.length = 0;
    await choose(t, input(), 'noisy.png', 'image/png');
    A.ok('8.3 a picture that stays over 1.5 MB: "รูปใหญ่เกินไป"', /รูปใหญ่เกินไป/.test(modal().textContent) && !modal().querySelector('.help-shot img'));
    A.ok('8.4 …after drawing it smaller each time it tried', pic.drawn.length > 1 && pic.drawn.every((d, i) => i === 0 || d[0] < pic.drawn[i - 1][0]), pic.drawn);
    await typeArea(t, modal().querySelector('textarea'), 'ส่งได้โดยไม่มีรูป');
    await t.click(sendBtn());
    const c = t.callsOf('sendHelpRequest')[0] || {};
    A.ok('8.5 the request still goes, without a picture', c.detail === 'ส่งได้โดยไม่มีรูป' && !('image' in c), c);
  },
};

// jsdom draws nothing: Image, object URLs and the canvas are stood in for, and
// record what the app asked them to do. The app code runs in this process's
// global scope (review-0917-boot.cjs), so Image and URL are the globals.
function stubPictures(t) {
  const pic = { drawn: [], filled: [], types: [], failDecode: false, huge: false,
    dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD' + 'A'.repeat(400) + '==' };
  global.URL.createObjectURL = () => 'blob:harness';
  global.URL.revokeObjectURL = () => {};
  global.Image = class {
    set src(v) {
      this._src = v;
      setTimeout(() => {
        if (pic.failDecode) { if (this.onerror) this.onerror(); return; }
        this.naturalWidth = 3000; this.naturalHeight = 2000;
        if (this.onload) this.onload();
      }, 0);
    }
    get src() { return this._src; }
  };
  const proto = t.window.HTMLCanvasElement.prototype;
  proto.getContext = function () {
    return {
      set fillStyle(v) { pic.filled.push(v); }, get fillStyle() { return pic.filled[pic.filled.length - 1]; },
      fillRect() {}, drawImage: (_img, _x, _y, w, h) => { pic.drawn.push([w, h]); },
    };
  };
  proto.toDataURL = function (type) {
    pic.types.push(type);
    // Two million base64 characters is 1.5 MB: over the cap at every size.
    return pic.huge ? 'data:image/jpeg;base64,' + 'A'.repeat(2000004) : pic.dataUrl;
  };
  return pic;
}
async function choose(t, input, name, type) {
  const file = new t.window.File(['harness'], name, { type });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await t.act(async () => { input.dispatchEvent(new t.window.Event('change', { bubbles: true })); });
  await t.flush(50);
}

runScenarios(__filename, 'HELP REQUEST FRONTEND', scenarios);
