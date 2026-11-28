// verify-stale-tab-1117.cjs — a tab left open across a release (Pp, 2026-11-17).
//
// On 2026-11-17 an order took three Submits to reach the TPN room. A ward tab opened before
// the 23:21 release (#279) went on saving CONSTANTS_VERSION 2026-11-15.1. The backend took it,
// the doctor's own sheet printed, and the room refused it: "NeoFeed ปรับการคำนวณหลัง order นี้
// ให้หมอเปิดแล้วกด Submit อีกครั้ง". The same tab sent the same version again, and the order
// printed only after a reload. A room page left open the same way says the same thing about
// every new order, and no Submit helps.
//
//   §1 tpn-room-core printReasons judges an order against the release the host serves
//      (ctx.served): on it, the doctor has nothing to do and the page reloads if it is behind;
//      off it, older or newer (a rollback), the doctor reloads NeoFeed and submits, and the page
//      reloads too when behind. Without a served read, the page's own versions stand in.
//   §2 data.js tabDiffersFromServed reads compiled/tpn-room-version.js as served.
//   §3 the real gas-backend.gs: the old tab's order is saved and reaches the room, and the room
//      asks the doctor to reload; a current order on a page left open asks only the room to.
//   §4 the real <Calculator> in jsdom: the form reads the served version file when it opens and
//      warns before anyone types. Another release: Submit sends nothing, a banner and a toast
//      say reload, what was typed stays as a draft. The same release, a request that fails or a
//      404: the Submit goes as before. A draft saves either way. A read under a minute old, or
//      one still in flight, decides the Submit without a wait, so the save call stays in the
//      same tick; an older read is done again first, and two presses during it send one save.
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

  const at = (cv, v) => ({ ...pj(), constantsVersion: cv, v: v == null ? VERS.stickerSchema : v });
  const SERVED_NOW = { constantsVersion: NOW_V, stickerSchema: VERS.stickerSchema };
  const SERVED_NEWER = { constantsVersion: NEWER, stickerSchema: VERS.stickerSchema };
  const OLD_PAGE = { constantsVersion: OLDER, stickerSchema: VERS.stickerSchema };
  const NO_DOCTOR = /หมอไม่ต้อง Submit ใหม่/;

  // Served release read, and this page is on it: the order decides.
  eq('a current order on a current page prints', reasons(order(), ctx({ served: SERVED_NOW })), []);
  const old = reasons(order({ printJson: at(OLDER) }), ctx({ served: SERVED_NOW }));
  ok('an order on an older calculation asks the doctor to reload NeoFeed first, then Submit', old.length === 1 && DOCTOR.test(old[0]), old);
  ok('…and not the room to reload', !old.some((r) => PAGE.test(r)), old);
  const oldSchema = reasons(order({ printJson: at(NOW_V, 0) }), ctx({ served: SERVED_NOW }));
  ok('an older sticker schema is the doctor\'s too', oldSchema.length === 1 && DOCTOR.test(oldSchema[0]), oldSchema);
  const rolledBack = reasons(order({ printJson: at(NEWER) }), ctx({ served: SERVED_NOW }));
  ok('after a rollback, an order newer than the served release is the doctor\'s to reload and Submit (Vera 2)',
    rolledBack.length === 1 && DOCTOR.test(rolledBack[0]), rolledBack);
  ok('…and the room is not sent to reload a page that is already current', !rolledBack.some((r) => PAGE.test(r)), rolledBack);
  const bad = reasons(order({ printJson: at('x') }), ctx({ served: SERVED_NOW }));
  ok('an unreadable version on the order is the doctor\'s', bad.length === 1 && DOCTOR.test(bad[0]), bad);

  // This page is behind the served release.
  const pageOnly = reasons(order({ printJson: at(NEWER) }), ctx({ ...OLD_PAGE, served: SERVED_NEWER }));
  ok('an order on the served release, on a page left open: only the page reloads, the doctor has nothing to do',
    pageOnly.length === 1 && PAGE.test(pageOnly[0]) && NO_DOCTOR.test(pageOnly[0]), pageOnly);
  const both = reasons(order({ printJson: at(OLDER) }), ctx({ ...OLD_PAGE, served: SERVED_NEWER }));
  ok('an order on the page\'s own old version, both left open: the doctor reloads and submits (Vera 1)',
    both.some((r) => DOCTOR.test(r)), both);
  ok('…the page reloads too', both.some((r) => PAGE.test(r)), both);
  ok('…and nothing tells the room the doctor has nothing to do', !both.some((r) => NO_DOCTOR.test(r)), both);
  const staleDate = reasons(order({ printJson: at(NEWER) }), ctx({ ...OLD_PAGE, served: SERVED_NEWER, date: '2026-11-16' }));
  ok('the other reasons still show beside it (another date)', staleDate.some((r) => /ไม่ตรงกับวันที่เลือก/.test(r)) && staleDate.some((r) => PAGE.test(r)), staleDate);

  // No served release read: the page's own versions stand in.
  eq('no served read, the order on the page\'s versions prints', reasons(order(), ctx()), []);
  const oldNoRead = reasons(order({ printJson: at(OLDER) }), ctx());
  ok('no served read, an older order is the doctor\'s', oldNoRead.length === 1 && DOCTOR.test(oldNoRead[0]), oldNoRead);
  const newNoRead = reasons(order({ printJson: at(NEWER) }), ctx());
  ok('no served read, an order newer than the page can only mean the page was left open', newNoRead.length === 1 && PAGE.test(newNoRead[0]) && NO_DOCTOR.test(newNoRead[0]), newNoRead);
  const newSchemaNoRead = reasons(order({ printJson: at(NOW_V, 99) }), ctx());
  ok('…and so can a newer sticker schema', newSchemaNoRead.length === 1 && PAGE.test(newSchemaNoRead[0]), newSchemaNoRead);
  const badNoRead = reasons(order({ printJson: at('x') }), ctx());
  ok('no served read, an unreadable version is not "newer": the doctor\'s', badNoRead.length === 1 && DOCTOR.test(badNoRead[0]), badNoRead);

  eq('versionsOf reads the served file', typeof Core.versionsOf === 'function'
    ? Core.versionsOf(R('compiled/tpn-room-version.js')) : 'no function', VERS);
  eq('…and nothing else', typeof Core.versionsOf === 'function' ? [Core.versionsOf('<html>'), Core.versionsOf(null)] : 'no function', [null, null]);
  for (const [name, c] of [['served current', { served: SERVED_NOW }], ['page behind', { ...OLD_PAGE, served: SERVED_NEWER }], ['no read', {}]]) {
    const keys = reasons(order({ printJson: at(OLDER, 0) }), ctx(c));
    eq(`no reason is listed twice, ${name} (the list uses each as a React key)`, keys.length, new Set(keys).size);
  }
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
      const why = o ? reasons(o, { date: today, ...VERS, served: VERS, nameFileOpen: true, mapping: MAP, fixed: FIXED }) : [];
      ok('the room asks the doctor to reload before Submit, not only to Submit again', why.length === 1 && DOCTOR.test(why[0]), why);
    }
    ok('the second infant registers', !reg('NF-111702', 'NICU 4').error);
    const fresh = as(dt, { action: 'logDailyNutrition', sessionId: 'NF-111702', entry: entry(NOW_V) });
    ok('a current tab saves too', !!fresh.entryId, fresh);
    const o2 = inRoom('NF-111702');
    const onOldPage = o2 ? reasons(o2, { date: today, constantsVersion: OLDER, stickerSchema: VERS.stickerSchema, served: VERS, nameFileOpen: true, mapping: MAP, fixed: FIXED }) : [];
    ok('on a room page from before the release, the room reloads its page and the doctor does nothing', onOldPage.length === 1 && PAGE.test(onOldPage[0]) && !DOCTOR.test(onOldPage[0]), onOldPage);
    const onPage = o2 ? reasons(o2, { date: today, ...VERS, served: VERS, nameFileOpen: true, mapping: MAP, fixed: FIXED }) : ['no order'];
    eq('on a current page it prints', onPage, []);
  });
}

section('§4 the real calculator: the form reads the served release when it opens; Submit acts on it');
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
  const updated = [];
  function mountFilled(over = {}) {
    act(() => { root.unmount(); });
    root = ReactDOM.createRoot(container);
    localStorage.clear();
    act(() => {
      root.render(React.createElement(window.Calculator, {
        patient, dol: 6, editEntry: null, baselineEntry: null, logDate: '2026-11-17',
        onLog(e) { logged.push(e); return Promise.resolve({ ok: true, entryId: 'st-' + logged.length, lastModified: 'lm-' + logged.length }); },
        onUpdate(id, lm, e) { updated.push(e); return Promise.resolve({ ok: true, lastModified: 'lm-u' + updated.length }); }, onSaved() {}, onWeightChange() {},
        ...over,
      }));
    });
    act(() => { container.querySelectorAll('.card-h.clickable').forEach((h) => click(h)); });
    { const r = [...container.querySelectorAll('.step2-ctrl .seg button')];
      if (r.length && !r.some((b) => b.classList.contains('on'))) act(() => click(r.find((b) => b.textContent.trim() === 'Central'))); }
    for (const [l, v] of [['Current weight', 1250], ['Volume(mL/day)', 100], ['Dextrose final', 10], ['Amino acid', 3],
      ['Target fluid', 150], ['Other IV', 0], ['Drug volume', 2], ['Input', 180], ['Urine output', 90], ['Drain content', 0]]) setField(l, v);
  }

  const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  // Date.now moved forward, so the read the form made when it opened is too old to decide.
  const realNow = Date.now;
  const later = () => { Date.now = () => realNow() + 61000; };
  const undoLater = () => { Date.now = realNow; };
  const submitBtn = () => btn('Submit');
  const banners = () => container.querySelectorAll('.release-behind').length;

  try {
    // Another release served when the form opens.
    served.mode = 'other'; served.calls.length = 0; toasts.length = 0;
    mountFilled(); logged.length = 0;
    await tick();
    ok('the form reads the version file when it opens, uncached, at the page\'s own relative path',
      served.calls.length === 1 && served.calls[0].url === 'compiled/tpn-room-version.js' && served.calls[0].cache === 'no-store', served.calls);
    ok('…and warns before anyone types: reload before filling in the order',
      !!banner() && /แท็บนี้ยังเป็นรุ่นเก่า/.test(banner().textContent) && /กดโหลดหน้าใหม่ก่อนกรอก order/.test(banner().textContent), banner() && banner().textContent);
    ok('…with a reload button', !!banner() && [...banner().querySelectorAll('button')].some((b) => b.textContent.trim() === 'โหลดหน้าใหม่'));
    ok('the filled form still offers Submit', submitBtn() && submitBtn().disabled === false, submitBtn() && submitBtn().disabled);
    await clickAsync(submitBtn());
    eq('Submit sends nothing', logged.length, 0);
    eq('…decided by the read the form made, with no second request', served.calls.length, 1);
    ok('…the banner now says the order did not reach the TPN room, and to reload then Submit',
      !!banner() && /ยังไม่ถึงห้อง TPN/.test(banner().textContent) && /กดโหลดหน้าใหม่ แล้วกด Submit อีกครั้ง/.test(banner().textContent), banner() && banner().textContent);
    eq('…one banner, not two', banners(), 1);
    ok('…and says what was typed is kept as a draft', !!banner() && /เก็บเป็นร่างแล้ว/.test(banner().textContent), banner() && banner().textContent);
    ok('…which it is, in this user\'s draft for the order\'s date', !!localStorage.getItem('neofeed_draft_ST-9_2026-11-17'));
    ok('…and a toast says it too', toasts.some((t) => t.type === 'error' && /ออกรุ่นใหม่แล้ว/.test(t.msg)), toasts);
    ok('…Submit is not left waiting ("กำลังบันทึก")', submitBtn() && submitBtn().disabled === false, submitBtn() && submitBtn().textContent);
    await clickAsync(draftBtn());
    eq('another release served: Save draft still saves', logged.map((e) => e.status), ['draft']);

    // The same release.
    served.mode = 'same';
    mountFilled(); logged.length = 0;
    await tick();
    ok('the same release: no banner when the form opens', !banner());
    await clickAsync(submitBtn());
    eq('…and Submit saves as before', logged.map((e) => e.status), ['submitted']);

    // A Submit pressed in the same tick as the form opened, the read still in flight: the
    // save call comes in that tick, as before this check (verify-bed-dol-io re-save).
    served.mode = 'same';
    mountFilled(); logged.length = 0;
    act(() => { click(submitBtn()); });
    eq('a Submit while the first read is in flight reaches its save in the same tick', logged.map((e) => e.status), ['submitted']);
    await tick();
    ok('…and, the read finding the same release, says nothing more', !banner());

    // The same, but the read in flight finds another release (Vera's second review, 2026-11-17):
    // the order went out unchecked, so the tab says it will not print and must be sent again.
    served.mode = 'other'; toasts.length = 0;
    let land;
    served.hold = new Promise((r) => { land = r; });
    mountFilled(); logged.length = 0;
    act(() => { click(submitBtn()); });
    eq('a Submit while a read that will find another release is in flight still saves', logged.map((e) => e.status), ['submitted']);
    land(); served.hold = null;
    await tick(); await tick();
    ok('…and when the read lands, a toast says the order sent will not print: reload and Submit again',
      toasts.some((t) => t.type === 'error' && /ห้อง TPN จะไม่รับ/.test(t.msg) && /กด Submit อีกครั้ง/.test(t.msg)), toasts);
    ok('…and the banner says the same', !!banner() && /ห้อง TPN จะไม่รับ/.test(banner().textContent), banner() && banner().textContent);

    // The read is over a minute old by the Submit, and a release landed since.
    served.mode = 'same';
    mountFilled(); logged.length = 0;
    await tick();
    served.mode = 'other'; served.calls.length = 0;
    later();
    try { await clickAsync(submitBtn()); } finally { undoLater(); }
    eq('a read over a minute old is done again before the Submit', served.calls.length, 1);
    eq('…and the release that landed since stops it', logged.length, 0);
    ok('…with the banner', !!banner() && /ยังไม่ถึงห้อง TPN/.test(banner().textContent), banner() && banner().textContent);

    // The read fails, or the file is not there: fail open.
    served.mode = 'fail';
    mountFilled(); logged.length = 0;
    await tick();
    later();
    try { await clickAsync(submitBtn()); } finally { undoLater(); }
    eq('the request fails: Submit goes on (fails open, the room still checks)', logged.map((e) => e.status), ['submitted']);
    served.mode = '404';
    mountFilled(); logged.length = 0;
    await tick();
    later();
    try { await clickAsync(submitBtn()); } finally { undoLater(); }
    eq('a 404: Submit goes on', logged.map((e) => e.status), ['submitted']);
    ok('…and neither shows the banner', !banner());

    // Two presses while an old read is done again.
    served.mode = 'same';
    mountFilled(); logged.length = 0;
    await tick();
    let release;
    served.hold = new Promise((r) => { release = r; });
    later();
    try {
      await act(async () => { click(submitBtn()); });
      await act(async () => { const b = submitBtn() || [...container.querySelectorAll('button')].find((x) => /กำลังบันทึก/.test(x.textContent)); if (b) click(b); });
      release(); served.hold = null;
      await tick(); await tick();
    } finally { undoLater(); }
    eq('two presses while the file is read again send one save', logged.length, 1);

    // §5 (2026-11-28, ward photo) — the critical-value reason is asked in the tap, before the
    // release read is awaited. iPhone Safari drops the tap's user gesture across that await, and
    // window.prompt then returns null without opening: the doctor saw only "ต้องระบุเหตุผลก่อน".
    // This prompt behaves like Safari: asked after a read went out in the same tap, it returns null.
    // A TPN calc. weight 24 % under the automatic one (hydrops, an ELBW swing) raises the red line.
    console.log('\n── §5 the reason is asked before the release read (iPhone Safari) ──');
    const realPrompt = window.prompt;
    const asked = [];
    let callsAtTap = 0;
    window.prompt = (msg) => {
      const afterRead = served.calls.length > callsAtTap;
      asked.push({ msg: String(msg), afterRead });
      return afterRead ? null : 'harness: hydrops, dry weight';
    };
    try {
      served.mode = 'same';
      mountFilled(); logged.length = 0;
      setField('TPN calc. weight', 950);
      await tick();
      ok('the form shows "TPN calc. weight far from automatic"', /TPN calc\. weight far from automatic/.test(container.textContent));
      served.calls.length = 0; callsAtTap = 0; toasts.length = 0;
      later();
      try { await clickAsync(submitBtn()); } finally { undoLater(); }
      eq('the reason is asked once', asked.length, 1);
      ok('…and it names the weight line', asked.length === 1 && /TPN calc\. weight far from automatic/.test(asked[0].msg), asked);
      ok('…before the release read went out, so Safari opens it', asked.length === 1 && asked[0].afterRead === false, asked);
      eq('the release is still read before the save', served.calls.length, 1);
      eq('the order is submitted', logged.map((e) => e.status), ['submitted']);
      eq('…with the reason, which prints', logged[0] && logged[0].calcInput && logged[0].calcInput.critOverride
        && logged[0].calcInput.critOverride.reason, 'harness: hydrops, dry weight');
      ok('…and no "ต้องระบุเหตุผลก่อน" toast', !toasts.some((t) => /ต้องระบุเหตุผลก่อน/.test(t.msg)), toasts);

      // Another release landed since: the reason was asked, and the release still stops the order.
      mountFilled(); logged.length = 0; asked.length = 0;
      setField('TPN calc. weight', 950);
      await tick();
      served.mode = 'other'; served.calls.length = 0; callsAtTap = 0;
      later();
      try { await clickAsync(submitBtn()); } finally { undoLater(); }
      ok('another release since: the reason is asked in the tap', asked.length === 1 && asked[0].afterRead === false, asked);
      eq('…and the release read still stops the Submit', logged.length, 0);
      ok('…with the banner', !!banner() && /ยังไม่ถึงห้อง TPN/.test(banner().textContent), banner() && banner().textContent);

      // The ward then found a second Submit did not help either: this iPhone opened no
      // window.prompt at all. The reason box above Submit takes the reason in the page.
      window.prompt = (msg) => { asked.push({ msg: String(msg), afterRead: false }); return null; };
      served.mode = 'same';
      mountFilled(); logged.length = 0; asked.length = 0; toasts.length = 0;
      setField('TPN calc. weight', 950);
      await tick();
      const box = () => container.querySelector('textarea.crit-reason-input');
      ok('a red line that needs a reason shows the reason box above Submit', !!box());
      ok('…naming the line', /TPN calc\. weight far from automatic/.test(container.querySelector('.crit-reason-box')?.textContent || ''));
      await clickAsync(submitBtn());
      eq('a prompt that never opens, box empty: nothing saved', logged.length, 0);
      ok('…and the toast points at the box', toasts.some((t) => /ต้องระบุเหตุผลก่อน/.test(t.msg) && /ช่องเหตุผลเหนือปุ่ม Submit/.test(t.msg)), toasts);
      ok('…which has the focus', document.activeElement === box());
      const taSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      act(() => { taSetter.call(box(), '  hydrops, dry weight  '); box().dispatchEvent(new window.Event('input', { bubbles: true })); });
      asked.length = 0;
      await clickAsync(submitBtn());
      eq('the reason typed in the box: no prompt', asked.length, 0);
      eq('…the order is submitted', logged.map((e) => e.status), ['submitted']);
      eq('…with that reason, trimmed, which prints', logged[0]?.calcInput?.critOverride?.reason, 'hydrops, dry weight');
      eq('…for the red line on screen', logged[0]?.calcInput?.critOverride?.alerts, ['TPN calc. weight far from automatic']);
      ok('…and the box is gone once the reason is saved', !box());

      // Vera on PR #314: the doctor then revises the order. Submit asks again, so the box
      // must show again, on the same lines Submit confirms.
      updated.length = 0; asked.length = 0; toasts.length = 0;
      setField('Volume(mL/day)', 96);
      await tick();
      ok('a revision of the confirmed order shows the box again', !!box());
      ok('…naming the line Submit confirms', /TPN calc\. weight far from automatic/.test(container.querySelector('.crit-reason-box')?.textContent || ''));
      act(() => { taSetter.call(box(), 'still hydrops'); box().dispatchEvent(new window.Event('input', { bubbles: true })); });
      await clickAsync(submitBtn());
      eq('…and the revision goes with the new reason, no prompt', [asked.length, updated.length, updated[0]?.calcInput?.critOverride?.reason], [0, 1, 'still hydrops']);
    } finally { window.prompt = realPrompt; served.mode = 'same'; }

    // §6 (2026-11-28) — the rest of the order path, on a phone that opens no pop-up.
    console.log('\n── §6 Print in the tap; a throw or a conflict says so ──');
    let printed = 0;
    const realPrint = window.print;
    window.print = () => { printed++; };
    const firePrint = () => document.dispatchEvent(new window.CustomEvent('__neofeed_print'));
    try {
      served.mode = 'same';
      mountFilled(); logged.length = 0; toasts.length = 0;
      await tick();
      await clickAsync(submitBtn());
      eq('a plain order is submitted', logged.map((e) => e.status), ['submitted']);
      act(() => { container.querySelectorAll('.print-ack input[type="checkbox"]').forEach((c) => { if (!c.checked) click(c); }); });
      printed = 0; toasts.length = 0;
      act(() => { firePrint(); });
      eq('a fresh read: Print opens the sheet in the tap itself, no wait (iPhone blocks a print that waited)', printed, 1);
      ok('…with no refusal', !toasts.some((t) => t.type === 'error'), toasts);
      printed = 0;
      later();
      try {
        act(() => { firePrint(); });
        eq('a read over a minute old: nothing in the tap, the read goes first', printed, 0);
        await tick(); await tick();
        eq('…then the sheet', printed, 1);
      } finally { undoLater(); }

      // Something inside Submit throws (an input no case foresaw): the button comes back and a toast says so.
      mountFilled({ onLog() { throw new Error('harness: save threw'); } });
      toasts.length = 0;
      await tick();
      await clickAsync(submitBtn());
      ok('a Submit that throws says the order did not go', toasts.some((t) => t.type === 'error' && /ยังไม่ได้บันทึก — แอปขัดข้อง/.test(t.msg)), toasts);
      ok('…and Submit is offered again', submitBtn() && submitBtn().disabled === false, submitBtn() && submitBtn().textContent);

      // Saved from another device meanwhile: the banner is at the top, off a phone's screen, so a toast says it.
      mountFilled({ onLog() { return Promise.resolve({ ok: false, conflict: true, current: { lastModified: 'x', lastModifiedBy: 'Dr Other' } }); } });
      toasts.length = 0;
      await tick();
      await clickAsync(submitBtn());
      ok('a save conflict shows a toast where the doctor is looking', toasts.some((t) => t.type === 'error' && /ถูกแก้จากเครื่องอื่น/.test(t.msg)), toasts);
      ok('…and the banner', !!container.querySelector('.save-conflict'));
    } finally { window.print = realPrint; served.mode = 'same'; }
  } catch (e) {
    ok('§4 ran without throwing', false, String(e && e.stack || e));
  }
  act(() => root.unmount());
  console.log(`\nSTALE TAB 2026-11-17: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
