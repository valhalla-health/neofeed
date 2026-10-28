// 2026-09-17 shell review — hosting, the two shells, and component-level
// checks that need no running backend. One scenario per process
// (review-0917-boot.cjs).
//
//   #1  UP-S15  fmtDate formats a calendar date from its digits: the same day
//               on a device west of UTC, east of it, and in Bangkok
//   #2  SEC-F4  _headers connect-src names exactly the NEOFEED_GAS_URL both
//               shells use — not every Apps Script deployment
//   #3  SEC-F5  the GitHub Pages guard clears neofeed_* storage before it
//       SEC-F6  redirects, and a trailing-dot hostname no longer slips past
//   (#2 and #3 read boot.js since the 2026-09-17 build step moved the shells'
//   two inline scripts into it; test/verify-build-shells.cjs pins the rest.)
//   #4  SEC-F5  moved.html clears the same storage on its own
//   #5  deploy  cache-bust tokens, byte-identical shells, AppRoot, admin view
//               role check
//   #6  UP-S4   normalizeSex
//   #7  UP-S7   showToast has a host even with no workspace mounted
//   #8  archive a discharged record with no usable statusDate is hidden from
//               the ward list (Praew, 2026-09-17)
//   #9  UP-S9   the three patient modals wait for the server, keep the form on
//               a refusal and close only on success
//   #10 UP-S1   an Active record's empty statusDate is re-sent unchanged
//   #11 UP-S4   an unknown sex does not crash FentonChart
//       UP-S2   MeasurementLogger follows today's DOL unless a DOL was typed
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { boot, runScenarios, mkPatient, TODAY, addDays, DIR } = require('./review-0917-boot.cjs');

const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

// A storage double that can also be made to throw on every access.
function fakeStorage(entries = {}) {
  const m = new Map(Object.entries(entries));
  const s = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    _map: m,
  };
  // Object.keys(localStorage) in a browser lists the stored keys.
  return new Proxy(s, {
    ownKeys: () => [...m.keys()],
    getOwnPropertyDescriptor: (t, k) => (m.has(k) ? { enumerable: true, configurable: true, value: m.get(k) } : Reflect.getOwnPropertyDescriptor(t, k)),
  });
}
function runInlineScript(src, hostname, { blocked = false } = {}) {
  const local = fakeStorage({ neofeed_calc_AA: '{}', neofeed_draft_AA_2026: '{}', neofeed_acked_AA: '{}', other_site_key: 'keep' });
  const session = fakeStorage({ neofeed_session: '{"token":"t"}', other_session: 'keep' });
  const replaced = [];
  const ctx = { Object, window: { location: { hostname, replace: (u) => replaced.push(u) } } };
  if (blocked) {
    Object.defineProperty(ctx, 'localStorage', { get() { throw new Error('SecurityError'); } });
    Object.defineProperty(ctx, 'sessionStorage', { get() { throw new Error('SecurityError'); } });
  } else { ctx.localStorage = local; ctx.sessionStorage = session; }
  vm.createContext(ctx);
  let threw = null;
  try { vm.runInContext(src, ctx); } catch (e) { threw = e.message; }
  return { replaced, threw, localKeys: [...local._map.keys()].sort(), sessionKeys: [...session._map.keys()].sort() };
}

const scenarios = {
  async 'fmtdate-timezones'(A) {
    console.log('\n── #1 UP-S15: fmtDate is the same calendar day in every timezone ──');
    const t = boot({ session: null });
    t.quiet();
    await t.start();
    const cases = [['2026-09-17', '17 ก.ย. 2569'], ['2026-01-01', '1 ม.ค. 2569'], ['2025-12-31', '31 ธ.ค. 2568']];
    for (const tz of ['America/Los_Angeles', 'Pacific/Kiritimati', 'Asia/Bangkok']) {
      process.env.TZ = tz;
      if (tz === 'America/Los_Angeles') {
        // Proves the zone switch took: this is the conversion that used to misfire.
        A.eq(`1.0 (${tz}: new Date("2026-09-17") is the 16th locally)`, new Date('2026-09-17').getDate(), 16);
      }
      for (const [iso, want] of cases) A.eq(`1.x ${tz} fmtDate("${iso}")`, global.fmtDate(iso), want);
    }
    process.env.TZ = 'Asia/Bangkok';
    A.eq('1.4 empty → "—" (unchanged)', global.fmtDate(''), '—');
    A.eq('1.5 non-date text is returned as-is (unchanged)', global.fmtDate('not a date'), 'not a date');
    A.eq('1.6 a stringified sheet Date still goes through Date parsing (unchanged)',
      global.fmtDate('Mon Aug 17 2026 00:00:00 GMT+0700 (Indochina Time)'), '17 ส.ค. 2569');
    A.eq('1.7 an impossible day keeps its old handling (V8 rolls it over)', global.fmtDate('2026-02-31'), '3 มี.ค. 2569');
  },

  async 'csp-connect-src'(A) {
    console.log('\n── #2 SEC-F4: connect-src pins the one Apps Script deployment ──');
    const headers = read('_headers');
    const csp = headers.split(/\r?\n/).find(l => l.trim().startsWith('Content-Security-Policy:'));
    const connect = csp.split(';').map(s => s.trim()).find(s => s.startsWith('connect-src')).split(/\s+/).slice(1);
    // The URL lives in boot.js, which both shells load: one copy, not two.
    const urls = [...read('boot.js').matchAll(/window\.NEOFEED_GAS_URL\s*=\s*"([^"]+)"/g)].map(m => m[1]);
    const gasIndex = urls[0];
    const loadsBoot = (html) => /<script src="boot\.js\?v=[0-9a-f]{10}"><\/script>/.test(html);
    A.ok('2.1 both shells load boot.js, which names the GAS URL once',
      urls.length === 1 && loadsBoot(read('index.html')) && loadsBoot(read('NeoFeed.html')));
    A.ok('2.2 connect-src lists that exact URL, full path', connect.includes(gasIndex));
    A.ok('2.3 …and no bare script.google.com origin', !connect.some(s => /^https:\/\/script\.google\.com\/?$/.test(s) || /\*\.google\.com/.test(s)));
    A.eq('2.4 the only script.google.com source is the deployment', connect.filter(s => s.includes('script.google.com')), [gasIndex]);
    A.ok('2.5 script.googleusercontent.com (the /exec redirect) is kept', connect.includes('https://script.googleusercontent.com'));
    A.ok('2.6 the comment no longer claims it pins every origin', !/It DOES pin every external origin/.test(headers));
  },

  async 'pages-guard'(A) {
    console.log('\n── #3 SEC-F5 / SEC-F6: the GitHub Pages guard (boot.js, first in both shells) ──');
    for (const shell of ['index.html', 'NeoFeed.html']) {
      // Comments removed first: the shell's own comment above the tag names <link>.
      const html = read(shell).replace(/<!--[\s\S]*?-->/g, '');
      const head = html.slice(0, html.indexOf('</head>'));
      const first = head.indexOf('<script');
      A.ok(`3.0 ${shell}: boot.js is the first script in <head>, before any <link>`,
        first >= 0 && head.startsWith('<script src="boot.js?v=', first) && first < head.indexOf('<link'));
    }
    const src = read('boot.js');
    for (const host of ['valhalla-health.github.io', 'valhalla-health.github.io.']) {
      const r = runInlineScript(src, host);
      A.eq(`3.1 ${host}: redirects to moved.html`, r.replaced, ['moved.html']);
      A.eq(`3.2 ${host}: every neofeed_* localStorage key removed, others kept`, r.localKeys, ['other_site_key']);
      A.eq(`3.3 ${host}: the session removed, others kept`, r.sessionKeys, ['other_session']);
    }
    const cf = runInlineScript(src, 'neofeed.valhalla-health.workers.dev');
    A.eq('3.4 Cloudflare host: no redirect', cf.replaced, []);
    A.eq('3.5 Cloudflare host: storage untouched', cf.localKeys.length + cf.sessionKeys.length, 6);
    const blocked = runInlineScript(src, 'valhalla-health.github.io', { blocked: true });
    A.ok('3.6 storage blocked: still redirects, never throws', blocked.threw === null && blocked.replaced[0] === 'moved.html');
  },

  async 'moved-page'(A) {
    console.log('\n── #4 SEC-F5: moved.html clears NeoFeed storage by itself ──');
    const html = read('moved.html');
    const m = html.match(/<script>([\s\S]*?)<\/script>/);
    A.ok('4.0 moved.html has an inline script', !!m);
    const r = runInlineScript(m ? m[1] : '', 'valhalla-health.github.io');
    A.eq('4.1 every neofeed_* localStorage key removed, others kept', r.localKeys, ['other_site_key']);
    A.eq('4.2 the session removed, others kept', r.sessionKeys, ['other_session']);
    A.ok('4.3 blocked storage does not throw', runInlineScript(m ? m[1] : '', 'x', { blocked: true }).threw === null);
    A.ok('4.4 still no external dependency on the page', !/<script[^>]+src=|<link[^>]+href="http/.test(html));
  },

  async 'deploy-wiring'(A) {
    console.log('\n── #5 cache-bust tokens and shell wiring ──');
    const index = read('index.html'), shell = read('NeoFeed.html'), app = read('app.jsx');
    A.ok('5.1 the two shells are byte-identical', index === shell);
    // The hand-kept "review-0917" tags became content hashes with the
    // 2026-09-17 build step, so a changed module cannot ship under an old token.
    for (const m of ['app', 'registry', 'fenton']) {
      A.ok(`5.2 ${m} loads precompiled, cache-busted by content hash`, new RegExp(`src="compiled/${m}\\.js\\?v=[0-9a-f]{10}"`).test(index));
    }
    // The root error boundary (verify-error-boundary.cjs) may wrap it; what
    // matters here is that AppRoot, not App, is what gets mounted.
    A.ok('5.3 the app mounts AppRoot (the session boundary)', /render\((<ViewErrorBoundary variant="root">)?<AppRoot \/>/.test(app));
    A.ok('5.4 the admin view is rendered only for role admin', /view === "admin" && role === "admin" && <AdminDashboard/.test(app));
    A.ok('5.5 no in-tree #toast-host left in App', !/<div id="toast-host"/.test(app));
    A.ok('5.6 no bare fetch(GAS_URL) outside the one transport', (app.match(/fetch\(/g) || []).length === 1);
  },

  async 'normalize-sex'(A) {
    console.log('\n── #6 UP-S4: normalizeSex ──');
    const t = boot({ session: null });
    t.quiet();
    await t.start();
    const n = global.normalizeSex;
    A.ok('6.0 app.jsx defines normalizeSex', typeof n === 'function');
    if (typeof n !== 'function') return;
    for (const v of ['boys', 'boy', 'M', 'm', 'Male', ' male ', 'ชาย']) A.eq(`6.1 ${JSON.stringify(v)} → boys`, n(v), 'boys');
    for (const v of ['girls', 'girl', 'F', 'Female', 'หญิง']) A.eq(`6.2 ${JSON.stringify(v)} → girls`, n(v), 'girls');
    A.eq('6.3 unknown stays as it was', n('X'), 'X');
    A.eq('6.4 blank stays blank', n(''), '');
    A.eq('6.5 missing becomes blank', n(undefined), '');
  },

  async 'toast-host'(A) {
    console.log('\n── #7 UP-S7: a toast needs no workspace ──');
    const t = boot({ session: null });
    t.quiet();
    await t.start();
    A.ok('7.0 the login screen is up (no workspace mounted)', !!document.querySelector('.login-wrap'));
    await t.act(async () => { global.showToast('ทดสอบ toast', 'error'); });
    const host = document.getElementById('toast-host');
    A.ok('7.1 showToast created a host', !!host);
    A.ok('7.2 …on document.body, outside the React root', host && host.parentNode === document.body);
    A.ok('7.3 …and the toast is in it', host && /ทดสอบ toast/.test(host.textContent));
  },

  async 'archived-without-date'(A) {
    console.log('\n── #8 a discharged record with no usable statusDate is hidden ──');
    const t = boot({ session: null });
    t.quiet();
    await t.start();
    const host = document.createElement('div'); document.body.appendChild(host);
    const root = t.ReactDOM.createRoot(host);
    const pts = [
      mkPatient({ sessionId: 'AC-1', name: 'AC', currentBed: 'NICU 1' }),
      mkPatient({ sessionId: 'BL-1', name: 'BL', currentBed: 'NICU 2', status: '' }),
      mkPatient({ sessionId: 'D3-1', name: 'D3', currentBed: 'NICU 3', status: 'Discharged', statusDate: addDays(TODAY, -3) }),
      mkPatient({ sessionId: 'DX-1', name: 'DX', currentBed: 'NICU 4', status: 'Discharged', statusDate: '' }),
      mkPatient({ sessionId: 'TX-1', name: 'TX', currentBed: 'NICU 5', status: 'Transferred', statusDate: 'garbage' }),
      mkPatient({ sessionId: 'E9-1', name: 'E9', currentBed: 'NICU 6', status: 'Expired', statusDate: addDays(TODAY, -10) }),
    ];
    await t.act(async () => {
      root.render(t.React.createElement(window.PatientRegistry, {
        patients: pts, activeId: null, log: {}, ward: 'NICU', onWardChange() {}, onSelect() {}, onAdd() {}, onEdit() {},
      }));
    });
    const toggle = [...host.querySelectorAll('.patient-table button')].find(b => /Discharged \/ Transferred \/ Expired/.test(b.textContent));
    A.eq('8.1 only the one discharged 3 days ago is listed as archived', toggle && (toggle.textContent.match(/\((\d+)\)/) || [])[1], '1');
    const activeRows = [...host.querySelectorAll('.patient-table tbody tr')].filter(r => /Active/.test(r.textContent));
    A.eq('8.2 Active and blank-status patients are unaffected', activeRows.length, 2);
  },

  async 'modals-wait-for-server'(A) {
    console.log('\n── #9 UP-S9: the patient modals wait for the server ──');
    const t = boot({ session: null });
    t.quiet();
    await t.start();
    const host = document.createElement('div'); document.body.appendChild(host);
    const root = t.ReactDOM.createRoot(host);
    const patient = mkPatient();
    const pending = () => { let resolve; const p = new Promise(r => { resolve = r; }); return { p, resolve }; };
    let seq = 0;
    const mount = async (Comp, props) => {
      await t.act(async () => { root.render(t.React.createElement(Comp, { key: 'm' + (++seq), patients: [patient], ...props })); });
    };
    const settle = async (d, value) => { await t.act(async () => { d.resolve(value); await d.p; }); await t.flush(); };

    // Edit session
    let calls = 0, closed = 0, d = pending();
    await mount(global.EditPatientModal, { patient, onClose: () => closed++, onSubmit: () => { calls++; return d.p; } });
    await t.typeInto(t.fieldInput('Diagnosis', host), 'RDS, PDA');
    const save = () => [...host.querySelectorAll('button')].find(b => /Save changes|กำลังบันทึก/.test(b.textContent));
    await t.click(save());
    A.ok('9.1 Edit: while the request is out the button says กำลังบันทึก… and is disabled', /กำลังบันทึก/.test(save().textContent) && save().disabled);
    A.eq('9.2 Edit: the modal has not closed itself', closed, 0);
    await settle(d, { ok: false, error: 'เตียง NICU 1 มีผู้ป่วยอื่นอยู่แล้ว' });
    A.ok('9.3 Edit: a refusal is shown inside the modal', /เตียง NICU 1 มีผู้ป่วยอื่นอยู่แล้ว/.test(host.textContent));
    A.eq('9.4 Edit: …which stays open', closed, 0);
    A.eq('9.5 Edit: …with the typed diagnosis intact', t.fieldInput('Diagnosis', host).value, 'RDS, PDA');
    d = pending();
    await t.click(save());
    A.eq('9.6 Edit: Save can be pressed again', calls, 2);
    await settle(d, { ok: true });
    A.eq('9.7 Edit: success closes the modal', closed, 1);

    // Register
    calls = 0; closed = 0; d = pending();
    await mount(global.NewPatientModal, { onClose: () => closed++, onSubmit: () => { calls++; return d.p; } });
    await t.typeInto(t.fieldInput('ชื่อ', host), 'บบ');
    await t.typeInto(t.fieldInput('นามสกุล', host), 'ดด');
    await t.typeInto(t.fieldInput('Birth weight', host), 1000);
    await t.selectVal(t.fieldInput('GA', host), 30);
    await t.selectVal(t.fieldInput('Sex', host), 'boys');
    await t.click([...host.querySelectorAll('button')].find(b => /Register/.test(b.textContent)));
    await settle(d, { ok: false, error: 'ID นี้ (BB-BW1000) ลงทะเบียนไว้แล้ว' });
    A.ok('9.8 Register: the refusal is shown inside the modal', /ลงทะเบียนไว้แล้ว/.test(host.textContent));
    A.ok('9.9 Register: nothing typed was lost', closed === 0 && t.fieldInput('ชื่อ', host).value === 'บบ'
      && t.fieldInput('นามสกุล', host).value === 'ดด');

    // Transfer
    calls = 0; closed = 0; d = pending();
    await mount(global.TransferBedModal, { patient, onClose: () => closed++, onSubmit: () => { calls++; return d.p; } });
    await t.click([...host.querySelectorAll('button')].find(b => /^SCN · SCN/.test(b.textContent.trim())));
    await t.click([...host.querySelectorAll('button')].find(b => /Confirm transfer/.test(b.textContent)));
    await settle(d, { ok: false, error: 'บันทึกไม่สำเร็จ: Busy' });
    A.ok('9.10 Transfer: the refusal is shown and the modal stays', closed === 0 && /บันทึกไม่สำเร็จ: Busy/.test(host.textContent));
    d = pending();
    await t.click([...host.querySelectorAll('button')].find(b => /Confirm transfer/.test(b.textContent)));
    await settle(d, undefined);
    A.eq('9.11 Transfer: a caller that returns nothing counts as success (local mode)', closed, 1);
  },

  async 'status-date-identity'(A) {
    console.log('\n── #10 UP-S1: an edit re-sends an empty statusDate exactly as it came ──');
    const t = boot({ session: null });
    t.quiet();
    await t.start();
    const host = document.createElement('div'); document.body.appendChild(host);
    const root = t.ReactDOM.createRoot(host);
    let sent = null;
    await t.act(async () => {
      root.render(t.React.createElement(global.EditPatientModal, {
        patient: mkPatient({ statusDate: '' }), patients: [], onClose() {}, onSubmit: (p) => { sent = p; },
      }));
    });
    await t.typeInto(t.fieldInput('Diagnosis', host), 'RDS, PDA');
    await t.click([...host.querySelectorAll('button')].find(b => /Save changes/.test(b.textContent)));
    A.eq('10.1 "" stays "" (a phantom "" → null would count as a change in the merge)', sent && sent.statusDate, '');
  },

  async 'fenton-components'(A) {
    console.log('\n── #11 UP-S4 / UP-S2: FentonChart and MeasurementLogger ──');
    const t = boot({ session: null });
    t.quiet();
    await t.start();
    const host = document.createElement('div'); document.body.appendChild(host);
    const root = t.ReactDOM.createRoot(host);
    let threw = null;
    try {
      await t.act(async () => {
        root.render(t.React.createElement(window.FentonChart, { patient: mkPatient({ sex: 'X' }), currentDol: 6, onUpdate() {} }));
      });
    } catch (e) { threw = e.message; }
    A.eq('11.1 FentonChart with sex "X" renders without throwing', threw, null);
    A.ok('11.2 …and says what to fix', /เพศในทะเบียนไม่ถูกต้อง — แก้ที่ Edit session/.test(host.textContent));

    const Logger = global.MeasurementLogger;
    const p = mkPatient({ weights: [{ dol: 1, w: 900 }] });
    const render = (currentDol) => t.act(async () => { root.render(t.React.createElement(Logger, { patient: p, currentDol, onUpdate() {} })); });
    await render(5);
    const dolBox = () => t.fieldInput('DOL', host);
    A.eq('11.3 the logger opens on today\'s DOL', dolBox().value, '5');
    await render(6);                               // the tab stayed open past midnight
    A.eq('11.4 …and follows it when the day rolls over', dolBox().value, '6');
    await t.typeInto(dolBox(), 3);                 // deliberately back-dating
    await render(7);
    A.eq('11.5 a DOL someone typed is left alone', dolBox().value, '3');
  },
};

runScenarios(__filename, 'REVIEW 0917 · SHELL + COMPONENTS', scenarios);
