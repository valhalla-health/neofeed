// verify-pharmacy-frontend-1030.cjs — the ward app refuses a pharmacy sign-in
// (openspec tpn-room-stickers, D6; Pp, 2026-10-30): the account works with the
// TPN-room page only. The server refuses it everything else (verify-pharmacy-
// backend-1030.cjs § 4); this is the readable half. Synthetic accounts only.
//
// § 1 calls loginRequest directly with gasRequest swapped for a recorder, so it
//     sees exactly which actions the app sent. loginRequest does not write to
//     sessionStorage itself (the caller does), so "nothing is stored" proves
//     nothing there: § 2 signs in through the real form and checks it.
// § 3 a signed-in ward account whose role becomes pharmacy is signed out at its
//     next sync (attack pass on e1a7e87, 2026-10-30).
// boot() only prepares the page; start() is what runs app.jsx and makes
// loginRequest and gasRequest reachable as globals. One page per process, so
// each scenario runs in its own (runScenarios).
const B = require('./review-0917-boot.cjs');

const scenarios = {
  async 'sign-in'(A) {
    const t = B.boot({ session: null, patients: [] });
    await t.start();
    const realGas = globalThis.gasRequest;
    const sent = [];
    const reply = (role) => async (body) => {
      sent.push(body.action);
      if (body.action === 'login') return { status: 'ok', name: 'Synthetic', role, email: role + '@kcmh.test', token: 'tok-' + role + '-1', authMethod: 'password' };
      return { ok: true };
    };

    console.log('── § 1 loginRequest ──');
    globalThis.gasRequest = reply('pharmacy');
    let err = null;
    try { await globalThis.loginRequest({ email: 'pharmacy@kcmh.test', password: 'Synthetic-Pass-1' }); } catch (e) { err = e; }
    A.eq('a pharmacy sign-in is refused', !!err, true);
    A.eq('…with the reason in Thai', /บัญชีเภสัช/.test(err && err.message), true);
    await new Promise(r => setTimeout(r, 0));
    A.eq('…and the session it opened is closed', sent, ['login', 'logout']);
    A.eq('…and nothing is stored', window.sessionStorage.getItem('neofeed_session'), null);

    sent.length = 0; err = null;
    try { await globalThis.loginRequest({ googleToken: 'synthetic-credential' }); } catch (e) { err = e; }
    A.eq('the Google path is refused the same way', [/บัญชีเภสัช/.test(err && err.message), sent], [true, ['login', 'logout']]);

    sent.length = 0;
    globalThis.gasRequest = reply('doctor');
    const res = await globalThis.loginRequest({ email: 'doctor@kcmh.test', password: 'Synthetic-Pass-1' });
    A.eq('a doctor signs in as before', [res.user.role, sent], ['doctor', ['login']]);

    console.log('── § 2 the sign-in form ──');
    globalThis.gasRequest = realGas;
    t.server.loginReply = { status: 'ok', name: 'Synthetic', role: 'pharmacy', email: 'pharmacy@kcmh.test', token: 'tok-pharmacy-form-1', authMethod: 'password' };
    await t.click(t.btn(/เข้าด้วย email อื่น/));
    const [em, pw] = document.querySelectorAll('.login-form-wrap input');
    await t.typeInto(em, 'pharmacy@kcmh.test');
    await t.typeInto(pw, 'Synthetic-Pass-1');
    await t.act(async () => {
      document.querySelector('.login-form-wrap form').dispatchEvent(new t.window.Event('submit', { bubbles: true, cancelable: true }));
    });
    await t.flush(); await t.flush();
    A.eq('the form shows the reason', /บัญชีนี้เป็นบัญชีเภสัช/.test((document.querySelector('.login-error') || {}).textContent || ''), true);
    A.eq('…the ward app does not open', !!document.querySelector('.ward-gate'), false);
    A.eq('…nothing is written to sessionStorage', window.sessionStorage.getItem('neofeed_session'), null);
    A.eq('…the token it got was logged out', t.callsOf('logout').map(c => c.token), ['tok-pharmacy-form-1']);
  },

  // The server answers a pharmacy session's sync Forbidden (gas-backend.gs, the pharmacy allow-list).
  // Until this fix the app only turned the sync pill red, and the registry, names included, stayed on
  // screen until the 30-minute idle logout.
  async 'role-changed'(A) {
    console.log('── § 3 a ward session whose role became pharmacy ──');
    const t = B.boot({});
    t.quiet();
    await t.start();
    await t.pickWard('NICU');
    A.eq('the ward list is on screen first', /Total sessions/.test(t.text()), true);
    const ls = t.window.localStorage;
    ls.setItem('neofeed_calc_SYNTH-1', '{}');
    ls.setItem('neofeed_acked_SYNTH-1', '{}');
    ls.setItem('neofeed_draft_SYNTH-1', '{}');
    t.server.hooks.getActivePatients = () => ({ reply: { error: 'Forbidden' } });
    await t.click(t.syncButton());
    await t.flush();
    A.eq('a Forbidden sync ends the session: the login screen', !!document.querySelector('.login-wrap'), true);
    A.eq('…nothing of the ward list remains', /Total sessions/.test(t.text()), false);
    A.eq('…the session is gone from sessionStorage', t.window.sessionStorage.getItem('neofeed_session'), null);
    A.eq('…and the notice says why', /หน้าห้อง TPN/.test((document.querySelector('.login-notice') || {}).textContent || ''), true);
    A.eq('…and its token is logged out (it still opens the TPN room\'s actions)',
      t.callsOf('logout').map(c => c.token), ['tok-doctor-123456']);
    A.eq('…the calculator caches are cleared and the draft is kept, as on an idle logout',
      ['neofeed_calc_SYNTH-1', 'neofeed_acked_SYNTH-1', 'neofeed_draft_SYNTH-1'].map(k => ls.getItem(k) !== null), [false, false, true]);
  },

  // A pharmacy session found in sessionStorage at load (a page on the same origin that stored it under the
  // ward app's key). The walkthrough on e1a7e87 saw the first-load gate loop on "Forbidden … ลองใหม่".
  async 'restored-pharmacy'(A) {
    console.log('── § 4 a pharmacy session restored at load ──');
    const t = B.boot({ session: { name: 'Rx', role: 'pharmacy', email: 'rx@kcmh.test', token: 'tok-rx-restored-1', authMethod: 'password' } });
    t.quiet();
    t.server.hooks.getActivePatients = () => ({ reply: { error: 'Forbidden' } });
    await t.start();
    await t.flush(); await t.flush();
    A.eq('the first sync ends the session: the login screen', !!document.querySelector('.login-wrap'), true);
    A.eq('…no retry loop on screen', /ลองใหม่/.test(t.text()) && /Forbidden/.test(t.text()), false);
    A.eq('…the session is gone from sessionStorage', t.window.sessionStorage.getItem('neofeed_session'), null);
    A.eq('…the notice gives the sign-in refusal\'s words', /บัญชีนี้เป็นบัญชีเภสัช ใช้กับหน้าห้อง TPN เท่านั้น/
      .test((document.querySelector('.login-notice') || {}).textContent || ''), true);
    A.eq('…and the token is logged out', t.callsOf('logout').map(c => c.token), ['tok-rx-restored-1']);
  },
};

B.runScenarios(__filename, 'PHARMACY FRONTEND 1030', scenarios);
