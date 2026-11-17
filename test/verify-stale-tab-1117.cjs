// verify-stale-tab-1117.cjs — a tab left open across a release (Pp, 2026-11-17).
//
// On 2026-11-17 an order took three Submits to reach the TPN room. A ward tab opened before
// the 23:21 release (#279) went on saving CONSTANTS_VERSION 2026-11-15.1. The backend took it,
// the doctor's own sheet printed, and the room refused it: "NeoFeed ปรับการคำนวณหลัง order นี้
// ให้หมอเปิดแล้วกด Submit อีกครั้ง". The same tab sent the same version again, and the order
// printed only after a reload. A room page left open the same way says the same thing about
// every new order, and no Submit helps.
//
//   §1 tpn-room-core printReasons says which side reloads: an older order is the doctor's to
//      reload before Submit, a newer one the room page's; a page the host has moved past
//      (ctx.pageStale) only asks to reload itself.
//   §2 data.js tabDiffersFromServed reads compiled/tpn-room-version.js as served.
//   §3 the real gas-backend.gs: the old tab's order is saved and reaches the room, and the room
//      asks the doctor to reload; the same order on a page older than it asks the room to.
//   §4 the real <Calculator> in jsdom: Submit reads the served version file first. Another
//      release: nothing is sent, a banner and a toast say reload, what was typed stays as a
//      draft. The same release, a request that fails or a 404: the Submit goes as before. A
//      draft saves either way. A second press during the read sends one save.
//
// §1, §3 and §4 fail on origin/main 0284ee0, the code before this change. Synthetic infants only.
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const Core = require('../tpn-room-core.js');
const FX = require('./tpn-room-fixture.cjs');
const SBX = require('./gas-vm-sandbox.cjs');

let pass = 0, fail = 0, n = 0;
function eq(name, got, want) {
  const yes = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${yes ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name}${yes ? '' : `  got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
  yes ? pass++ : fail++;
}
const ok = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name}${cond ? '' : '  ' + JSON.stringify(detail ?? '')}`);
  cond ? pass++ : fail++;
};
const section = (t) => console.log(`\n── ${t} ──`);

const data = FX.loadData(ROOT);
const NOW_V = data.CONSTANTS_VERSION;
const VERS = { constantsVersion: NOW_V, stickerSchema: data.STICKER_SCHEMA_VERSION };
const MAP = { name: 'ทารกสังเคราะห์', an: '12345/69' };
const FIXED = { heading: 'H', storage: 'S', extension: 'E' };
const DATE = '2026-11-17';
const pj = (extra) => FX.printJson(data, DATE, extra);
const order = (over) => ({
  sessionId: 'ST-1', entryId: '11111111-1111-4111-8111-111111111111', bed: 'NICU 3', bw: 900, twinSuffix: '', multiplesCount: 0,
  dol: 5, status: 'submitted', revision: 1, prescriber: 'Dr Synthetic', savedAt: '', submittedAt: '', printJson: pj(), ...over,
});
const ctx = (over) => ({ date: DATE, ...VERS, nameFileOpen: true, mapping: MAP, fixed: FIXED, ...over });
const reasons = (o, c) => Core.printReasons(o, c);
const DOCTOR = /ให้หมอกดโหลดหน้า NeoFeed ใหม่ก่อน แล้วเปิด order กด Submit อีกครั้ง/;
const PAGE = /กดโหลดหน้านี้ใหม่/;
const OLDER = '2026-11-15.1';
const NEWER = '2099-01-01.1';

section('§1 the room says which side reloads');
{
  eq('compareVersions: older, same, newer', typeof Core.compareVersions === 'function'
    ? [Core.compareVersions(OLDER, NOW_V), Core.compareVersions(NOW_V, NOW_V), Core.compareVersions(NEWER, NOW_V)] : 'no function', [-1, 0, 1]);
  eq('…the number after the date is a number: .10 is after .9', typeof Core.compareVersions === 'function'
    ? Core.compareVersions('2026-11-16.10', '2026-11-16.9') : 'no function', 1);
  eq('…anything else is not a version', typeof Core.compareVersions === 'function'
    ? [Core.compareVersions('', NOW_V), Core.compareVersions(null, NOW_V), Core.compareVersions('2026-11-16', NOW_V)] : 'no function', [null, null, null]);

  eq('a current order prints', reasons(order(), ctx()), []);
  const old = reasons(order({ printJson: { ...pj(), constantsVersion: OLDER } }), ctx());
  ok('an order on an older calculation asks the doctor to reload first, then Submit', old.length === 1 && DOCTOR.test(old[0]), old);
  ok('…and not the room to reload', !old.some((r) => PAGE.test(r)), old);
  const newer = reasons(order({ printJson: { ...pj(), constantsVersion: NEWER } }), ctx());
  ok('an order newer than this page asks the room to reload this page', newer.length === 1 && PAGE.test(newer[0]), newer);
  ok('…and tells the room the doctor has nothing to do', newer.length === 1 && /หมอไม่ต้อง Submit ใหม่/.test(newer[0]), newer);
  const oldSchema = reasons(order({ printJson: { ...pj(), v: 0 } }), ctx());
  ok('an older sticker schema asks the doctor to reload first', oldSchema.length === 1 && /ตัวเลขสติกเกอร์เป็นรุ่นเก่า/.test(oldSchema[0]) && /โหลดหน้า NeoFeed ใหม่ก่อน/.test(oldSchema[0]), oldSchema);
  const both = reasons(order({ printJson: { ...pj(), v: 99, constantsVersion: NEWER } }), ctx());
  ok('a newer schema and newer constants say "reload this page" once', both.length === 1 && PAGE.test(both[0]), both);
  const bad = reasons(order({ printJson: { ...pj(), constantsVersion: 'x' } }), ctx());
  ok('an unreadable version is not "newer": the doctor reloads and submits', bad.length === 1 && DOCTOR.test(bad[0]), bad);
  const stale = reasons(order(), ctx({ pageStale: true }));
  ok('a page the host has moved past says only to reload, even on a matching order', stale.length === 1 && PAGE.test(stale[0]), stale);
  const staleOld = reasons(order({ printJson: { ...pj(), constantsVersion: OLDER } }), ctx({ pageStale: true }));
  ok('…and judges no order against its own old versions', staleOld.length === 1 && PAGE.test(staleOld[0]), staleOld);
  const staleDate = reasons(order(), ctx({ pageStale: true, date: '2026-11-16' }));
  ok('…while the other reasons still show (another date)', staleDate.some((r) => /ไม่ตรงกับวันที่เลือก/.test(r)) && staleDate.some((r) => PAGE.test(r)), staleDate);
  const keys = reasons(order({ printJson: { ...pj(), v: 0, constantsVersion: OLDER } }), ctx());
  eq('no reason is listed twice (the list uses each as a React key)', keys.length, new Set(keys).size);
}

section('§2 data.js reads the served version file');
{
  const D = data;
  const file = (cv, ss) => `"use strict";\nwindow.TPN_ROOM_VERSIONS = { constantsVersion: ${JSON.stringify(cv)}, stickerSchema: ${ss} };\n`;
  ok('tabDiffersFromServed exists', typeof D.tabDiffersFromServed === 'function');
  const f = typeof D.tabDiffersFromServed === 'function' ? D.tabDiffersFromServed : () => 'no function';
  eq('the same release: false', f(file(NOW_V, VERS.stickerSchema)), false);
  eq('a newer release: true', f(file(NEWER, VERS.stickerSchema)), true);
  eq('a rollback to an older one: true', f(file(OLDER, VERS.stickerSchema)), true);
  eq('another sticker schema: true', f(file(NOW_V, VERS.stickerSchema + 1)), true);
  eq('an HTML page, empty text or null: unknown (null)', [f('<!doctype html><title>404</title>'), f(''), f(null)], [null, null, null]);
  eq('the committed compiled/tpn-room-version.js is this data.js\'s release', f(R('compiled/tpn-room-version.js')), false);
}

section('§3 the real backend: the old tab\'s order is saved, and the room says who reloads');
{
  const backendMin = /var MIN_SUBMIT_CONSTANTS_VERSION = "([^"]+)"/.exec(R('gas-backend.gs'))[1];
  const today = SBX.wardToday();
  SBX.withNow(Date.parse(today + 'T05:00:00Z'), () => {
    const g = SBX.boot();
    g.addStaff('doc@kcmh.test', 'doctor', ['Doctor', 'Pass', '1'].join('-'), { name: 'Dr Synthetic' });
    g.addStaff('rx@kcmh.test', 'pharmacy', ['Pharmacy', 'Pass', '1'].join('-'), { name: 'Rx Synthetic' });
    const dt = g.session('doc@kcmh.test', 'doctor');
    const rt = g.session('rx@kcmh.test', 'pharmacy');
    const as = (tok, body) => g.post(Object.assign({ token: tok }, body));
    // Same BW and date of birth for both, so the second is a confirmed "possible duplicate".
    const reg = (sid, bed) => as(dt, { action: 'registerPatient', isNew: true, confirmDuplicate: true, patient: { sessionId: sid, name: 'ทารกสังเคราะห์ ' + sid,
      initials: 'ทส', bw: 900, ga: 30, sex: 'boys', dob: '2026-11-01', admissionDate: '2026-11-01', twinSuffix: '', status: 'Active',
      currentBed: bed, diagnosis: 'RDS', weights: [{ dol: 1, w: 900 }], lengths: [], hcs: [], bedHistory: [], statusDate: '',
      multiplesCount: 0 } });
    const entry = (cv) => ({ ts: today, dol: 5, weight: 900, fluid: 150, gir: 7, pro: 2.7, kcal: 60, na: 2.5, k: 1, ca: 0, p: 0,
      enVolPerKg: 0, route: 'TPN central', status: 'submitted', constantsVersion: cv,
      printJson: { ...FX.printJson(data, today), constantsVersion: cv },
      calcInput: { wtG: 900, tpnWtG: 900, stops: [], constantsVersion: cv } });
    const inRoom = (sid) => Core.currentOrders(as(rt, { action: 'pharmacyOrders', date: today }).orders).find((o) => o.sessionId === sid);
    // The oldest version the backend takes is what a tab left open can still send.
    // Compared here, not with Core.compareVersions, so this section runs on the code before it too.
    const [bd, bn] = backendMin.split('.'), [nd, nn] = NOW_V.split('.');
    const stale = bd < nd || (bd === nd && Number(bn) < Number(nn)) ? backendMin : null;
    if (!stale) {
      ok(`SKIP: the backend refuses every version before ${NOW_V}, so no old tab gets this far`, true);
    } else {
      ok('the first infant registers', !reg('NF-111701', 'NICU 3').error);
      const saved = as(dt, { action: 'logDailyNutrition', sessionId: 'NF-111701', entry: entry(stale) });
      ok(`a tab on ${stale} (the oldest the backend takes) still saves a submitted order`, !!saved.entryId, saved);
      const o = inRoom('NF-111701');
      ok('…which reaches the room', !!o && o.status === 'submitted', o);
      const why = o ? reasons(o, { date: today, ...VERS, nameFileOpen: true, mapping: MAP, fixed: FIXED }) : [];
      ok('the room asks the doctor to reload before Submit, not only to Submit again', why.length === 1 && DOCTOR.test(why[0]), why);
    }
    ok('the second infant registers', !reg('NF-111702', 'NICU 4').error);
    const fresh = as(dt, { action: 'logDailyNutrition', sessionId: 'NF-111702', entry: entry(NOW_V) });
    ok('a current tab saves too', !!fresh.entryId, fresh);
    const o2 = inRoom('NF-111702');
    const onOldPage = o2 ? reasons(o2, { date: today, constantsVersion: OLDER, stickerSchema: VERS.stickerSchema, nameFileOpen: true, mapping: MAP, fixed: FIXED }) : [];
    ok('on a room page from before the release, the room reloads its page and the doctor does nothing', onOldPage.length === 1 && PAGE.test(onOldPage[0]) && !DOCTOR.test(onOldPage[0]), onOldPage);
    const onPage = o2 ? reasons(o2, { date: today, ...VERS, nameFileOpen: true, mapping: MAP, fixed: FIXED }) : ['no order'];
    eq('on a current page it prints', onPage, []);
  });
}

section('§4 the real calculator: Submit reads the served release first');
(async () => {
  const babel = require('@babel/core');
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  Object.assign(global, { window, document: window.document, self: window, HTMLElement: window.HTMLElement,
    Element: window.Element, Node: window.Node, getComputedStyle: window.getComputedStyle, localStorage: window.localStorage,
    requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true });
  const toasts = [];
  global.showToast = (msg, type) => toasts.push({ msg, type });
  window.prompt = () => 'harness: acknowledged';
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
  const D = window.NEOFEED_DATA;

  // The served version file, as the stub answers it.
  const served = { mode: 'same', calls: [], hold: null };
  const fileFor = (cv) => `"use strict";\nwindow.TPN_ROOM_VERSIONS = { constantsVersion: ${JSON.stringify(cv)}, stickerSchema: ${D.STICKER_SCHEMA_VERSION} };\n`;
  global.fetch = (url, opts) => {
    served.calls.push({ url: String(url), cache: opts && opts.cache });
    if (served.mode === 'fail') return Promise.reject(new TypeError('Failed to fetch'));
    if (served.mode === '404') return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('not found') });
    const body = served.mode === 'other' ? fileFor(NEWER) : fileFor(D.CONSTANTS_VERSION);
    const res = { ok: true, status: 200, text: () => Promise.resolve(body) };
    if (served.hold) return served.hold.then(() => res);
    return Promise.resolve(res);
  };

  const container = document.getElementById('root');
  let root = ReactDOM.createRoot(container);
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  const inputFor = (label) => {
    const d = [...container.querySelectorAll('.field')].find((x) => x.querySelector('label')?.textContent.startsWith(label));
    const i = d?.querySelector('input'); if (!i) throw new Error('field not found: ' + label); return i;
  };
  const setField = (label, v) => act(() => {
    const i = inputFor(label); valueSetter.call(i, String(v)); i.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  const btn = (t) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
  const draftBtn = () => container.querySelector('button.save-draft');
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const clickAsync = async (el) => { await act(async () => { click(el); }); await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
  const banner = () => container.querySelector('.release-behind');
  const patient = { sessionId: 'ST-9', name: 'ST', bw: 1200, currentBed: 'NICU 1', diagnosis: '-', weights: [], admissionDate: '2026-11-12' };
  const logged = [];
  function mountFilled() {
    act(() => { root.unmount(); });
    root = ReactDOM.createRoot(container);
    localStorage.clear();
    act(() => {
      root.render(React.createElement(window.Calculator, {
        patient, dol: 6, editEntry: null, baselineEntry: null, logDate: '2026-11-17',
        onLog(e) { logged.push(e); return Promise.resolve({ ok: true, entryId: 'st-' + logged.length, lastModified: 'lm-' + logged.length }); },
        onUpdate() { return Promise.resolve({ ok: true, lastModified: 'lm-u' }); }, onSaved() {}, onWeightChange() {},
      }));
    });
    act(() => { container.querySelectorAll('.card-h.clickable').forEach((h) => click(h)); });
    { const r = [...container.querySelectorAll('.step2-ctrl .seg button')];
      if (r.length && !r.some((b) => b.classList.contains('on'))) act(() => click(r.find((b) => b.textContent.trim() === 'Central'))); }
    for (const [l, v] of [['Current weight', 1250], ['Volume(mL/day)', 100], ['Dextrose final', 10], ['Amino acid', 3],
      ['Target fluid', 150], ['Other IV', 0], ['Drug volume', 2], ['Input', 180], ['Urine output', 90], ['Drain content', 0]]) setField(l, v);
  }

  try {
    mountFilled();
    ok('the filled form can Submit', btn('Submit') && btn('Submit').disabled === false, btn('Submit') && btn('Submit').disabled);

    served.mode = 'other'; served.calls.length = 0; toasts.length = 0;
    await clickAsync(btn('Submit'));
    eq('another release served: Submit sends nothing', logged.length, 0);
    ok('…it read the version file, uncached, at the page\'s own relative path',
      served.calls.length === 1 && served.calls[0].url === 'compiled/tpn-room-version.js' && served.calls[0].cache === 'no-store', served.calls);
    ok('…a banner says the tab is old, the order did not reach the TPN room, and to reload then Submit',
      !!banner() && /แท็บนี้ยังเป็นรุ่นเก่า/.test(banner().textContent) && /ยังไม่ถึงห้อง TPN/.test(banner().textContent)
        && /กดโหลดหน้าใหม่ แล้วกด Submit อีกครั้ง/.test(banner().textContent), banner() && banner().textContent);
    ok('…with a reload button', !!banner() && [...banner().querySelectorAll('button')].some((b) => b.textContent.trim() === 'โหลดหน้าใหม่'));
    ok('…and says what was typed is kept as a draft', !!banner() && /เก็บเป็นร่างแล้ว/.test(banner().textContent), banner() && banner().textContent);
    ok('…which it is, in this user\'s draft for the order\'s date', !!localStorage.getItem('neofeed_draft_ST-9_2026-11-17'));
    ok('…and a toast says it too', toasts.some((t) => t.type === 'error' && /ออกรุ่นใหม่แล้ว/.test(t.msg)), toasts);
    ok('…Submit is not left waiting ("กำลังบันทึก")', btn('Submit') && btn('Submit').disabled === false, btn('Submit') && btn('Submit').textContent);

    await clickAsync(draftBtn());
    eq('another release served: Save draft still saves', logged.map((e) => e.status), ['draft']);

    mountFilled(); logged.length = 0;
    served.mode = 'same'; served.calls.length = 0;
    await clickAsync(btn('Submit'));
    eq('the same release: Submit saves as before', logged.map((e) => e.status), ['submitted']);
    ok('…and shows no banner', !banner());

    mountFilled(); logged.length = 0;
    served.mode = 'fail';
    await clickAsync(btn('Submit'));
    eq('the request fails: Submit goes on (fails open, the room still checks)', logged.map((e) => e.status), ['submitted']);

    mountFilled(); logged.length = 0;
    served.mode = '404';
    await clickAsync(btn('Submit'));
    eq('a 404: Submit goes on', logged.map((e) => e.status), ['submitted']);

    mountFilled(); logged.length = 0;
    served.mode = 'same';
    let release;
    served.hold = new Promise((r) => { release = r; });
    await act(async () => { click(btn('Submit')); });
    await act(async () => { const b = btn('Submit') || [...container.querySelectorAll('button')].find((x) => /กำลังบันทึก/.test(x.textContent)); if (b) click(b); });
    release(); served.hold = null;
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    eq('two presses while the file is read send one save', logged.length, 1);
  } catch (e) {
    ok('§4 ran without throwing', false, String(e && e.stack || e));
  }
  act(() => root.unmount());
  console.log(`\nSTALE TAB 2026-11-17: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
