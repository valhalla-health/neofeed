// verify-pharmacy-frontend-1030.cjs — the ward app refuses a pharmacy sign-in
// (openspec tpn-room-stickers, D6; Pp, 2026-10-30): the account works with the
// TPN-room page only. The server refuses it everything else (verify-pharmacy-
// backend-1030.cjs § 4); this is the readable half. Synthetic accounts only.
//
// § 1 calls loginRequest directly with gasRequest swapped for a recorder, so it
//     sees exactly which actions the app sent. loginRequest does not write to
//     sessionStorage itself (the caller does), so "nothing is stored" proves
//     nothing there: § 2 signs in through the real form and checks it.
// boot() only prepares the page; start() is what runs app.jsx and makes
// loginRequest and gasRequest reachable as globals.
const B = require('./review-0917-boot.cjs');
let pass = 0, fail = 0;
const eq = (name, got, want) => { const y = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${y ? 'PASS' : 'FAIL'}  ${name}${y ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); y ? pass++ : fail++; };

(async () => {
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
  eq('a pharmacy sign-in is refused', !!err, true);
  eq('…with the reason in Thai', /บัญชีเภสัช/.test(err && err.message), true);
  await new Promise(r => setTimeout(r, 0));
  eq('…and the session it opened is closed', sent, ['login', 'logout']);
  eq('…and nothing is stored', window.sessionStorage.getItem('neofeed_session'), null);

  sent.length = 0; err = null;
  try { await globalThis.loginRequest({ googleToken: 'synthetic-credential' }); } catch (e) { err = e; }
  eq('the Google path is refused the same way', [/บัญชีเภสัช/.test(err && err.message), sent], [true, ['login', 'logout']]);

  sent.length = 0;
  globalThis.gasRequest = reply('doctor');
  const res = await globalThis.loginRequest({ email: 'doctor@kcmh.test', password: 'Synthetic-Pass-1' });
  eq('a doctor signs in as before', [res.user.role, sent], ['doctor', ['login']]);

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
  eq('the form shows the reason', /บัญชีนี้เป็นบัญชีเภสัช/.test((document.querySelector('.login-error') || {}).textContent || ''), true);
  eq('…the ward app does not open', !!document.querySelector('.ward-gate'), false);
  eq('…nothing is written to sessionStorage', window.sessionStorage.getItem('neofeed_session'), null);
  eq('…the token it got was logged out', t.callsOf('logout').map(c => c.token), ['tok-pharmacy-form-1']);

  console.log(`\n${fail === 0 ? 'PHARMACY FRONTEND 1030: ALL PASS' : `PHARMACY FRONTEND 1030: ${fail} FAILED`} (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
})();
