// The 2026-09-16 sync-screen work, in four parts.
//
//   1. THE SHELL GRID. App renders the offline/staleness banner as a bare
//      <div role="status"> child of .app. .app was a two-row grid and nothing
//      after .topbar was placed explicitly, so the banner took grid
//      auto-placement's first free cell — the RAIL's — pushing .rail into the
//      workspace column and .work into an implicit third row that
//      `overflow: hidden` clipped. The app's layout therefore broke in exactly
//      the two states the banner exists to announce: offline, and data older
//      than 15 minutes. Section 1 pins the CSS contract in both hand-synced
//      shells, and — when playwright is installed — measures all four boxes in
//      real Chromium, which is the only place grid placement is actually true.
//
//   2. THE FIRST-LOAD GATE. It used to be `syncState === "loading" && !lastSync`,
//      so a first sync that FAILED (state "error", lastSync still null) fell
//      through to the workspace and rendered an empty registry as fact —
//      "ยังไม่มีผู้ป่วยในระบบ" while the server was simply down. The gate now
//      holds on anything that is not a completed sync, and SyncGate says which.
//
//   3. THE POLL. The app re-synced on login, tab focus/visibility and day
//      rollover — and on a ward workstation, which sits open and focused on the
//      registry all shift, none of those ever fire. After the login sync it
//      never pulled again, so the staleness banner appeared at 15 minutes and
//      stayed there until someone clicked Sync by hand. That is the reported
//      "sync ใช้เวลานานกว่าปกติ". A visible tab now polls every SYNC_POLL_MS;
//      a hidden or offline one still costs nothing.
//
//   4. THE SUPERSEDE GUARD. syncFromGAS has six callers and no request had any
//      identity, so two in flight at once meant the LAST response to arrive won
//      rather than the NEWEST — a slow request landing after a fast one rolled
//      the registry back to older data under a fresh green "GAS · HH:MM".
//
// Sections 2-4 drive the REAL <App/> in jsdom against a stubbed GAS endpoint.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(52)} got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
function ok(name, cond) { eq(name, !!cond, true); }

// ══ 1. Shell grid contract ═══════════════════════════════════════════════
console.log('\n── #1 the .app grid gives the banner its own row ──');
{
  const shells = ['NeoFeed.html', 'index.html'];
  for (const shell of shells) {
    const css = fs.readFileSync(DIR + shell, 'utf8');
    // Collapse whitespace so these read against the CSS, not its indentation.
    const flat = css.replace(/\s+/g, ' ');
    const has = (re) => re.test(flat);

    ok(`${shell}: .app has three rows (topbar / banner / body)`,
      has(/\.app \{[^}]*grid-template-rows: var\(--header-h\) auto 1fr;/));
    ok(`${shell}: the banner is placed full-width on row 2`,
      has(/\.app > \[role="status"\] \{ grid-column: 1 \/ -1; grid-row: 2; \}/));
    ok(`${shell}: .rail is pinned to column 1 of the body row`,
      has(/\.rail \{ grid-column: 1; grid-row: 3;/));
    ok(`${shell}: .work is pinned to column 2 of the body row`,
      has(/\.work \{ grid-column: 2; grid-row: 3;/));
    // Without this the phone layout puts the workspace in a column that
    // doesn't exist there, since the desktop rule above says column 2.
    ok(`${shell}: the ≤767px block keeps the banner row and re-homes .work`,
      has(/@media \(max-width: 767px\) \{.*\.app \{ grid-template-columns: 1fr; grid-template-rows: var\(--header-h\) auto 1fr; \} \.work \{ grid-column: 1; \}/));
    // An empty grid item is how this bug started; the toast host is the only
    // other bare child of .app.
    ok(`${shell}: #toast-host generates no box of its own`,
      has(/#toast-host \{ display: contents; \}/));
    // The banner's Sync button: end-of-row on a workstation, full-width on the
    // wrapped line on a phone. It is the one part of the banner that cannot be
    // expressed inline, so it is the one part that can silently desync.
    ok(`${shell}: the banner's Sync button hugs its content by default`,
      has(/\.sync-banner-btn \{ flex: 0 0 auto; \}/));
    ok(`${shell}: …and goes full-width below 768px`,
      has(/@media \(max-width: 767px\) \{.*\.sync-banner-btn \{ flex: 1 0 100%; \}/));
  }
}

// Real Chromium, when it is available. The static assertions above cannot see
// what the browser actually does with auto-placement — that is the whole
// lesson of this bug — so measure it for real whenever we can. CI installs no
// browser, so this degrades to a notice rather than a failure.
async function measureInChromium() {
  let chromium;
  try { chromium = require('playwright').chromium; }
  catch { console.log('  SKIP  playwright not installed — static CSS assertions only'); return; }
  const exe = ['/opt/pw-browsers/chromium', undefined].find(
    p => p === undefined || fs.existsSync(p));
  const css = fs.readFileSync(DIR + 'NeoFeed.html', 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
  const page_html = (withBanner) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>
<body><div id="root"><div class="app">
  <div class="topbar"><div class="brandmark"><div class="logo">N</div></div><div class="spacer"></div></div>
  ${withBanner ? '<div role="status" style="padding:8px 14px;font-size:12.5px;background:var(--warn-bg)">ข้อมูลไม่เป็นปัจจุบัน</div>' : ''}
  <nav class="rail"><div class="rail-item">Patients</div></nav>
  <main class="work"><div class="work-inner">เลือก ward</div></main>
  <div id="toast-host"></div>
</div></div></body></html>`;

  let browser;
  try { browser = await chromium.launch(exe ? { executablePath: exe } : {}); }
  catch (e) { console.log('  SKIP  could not launch Chromium (' + e.message.split('\n')[0] + ')'); return; }

  for (const [label, W, H] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    for (const withBanner of [false, true]) {
      await page.setContent(page_html(withBanner));
      const r = await page.evaluate(() => {
        const box = (sel) => { const el = document.querySelector(sel); if (!el) return null;
          const b = el.getBoundingClientRect();
          return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
        return { banner: box('[role="status"]'), rail: box('.rail'), work: box('.work'), topbar: box('.topbar') };
      });
      const tag = `${label}/${withBanner ? 'banner' : 'clean'}`;
      if (withBanner) {
        eq(`${tag}: banner spans the full width`, r.banner.w, W);
        eq(`${tag}: banner sits directly under the topbar`, r.banner.y, r.topbar.h);
        ok(`${tag}: banner is only as tall as its text`, r.banner.h > 0 && r.banner.h < 120);
        eq(`${tag}: workspace starts below the banner`, r.work.y, r.topbar.h + r.banner.h);
      } else {
        eq(`${tag}: workspace starts below the topbar`, r.work.y, r.topbar.h);
      }
      // The regression itself: the workspace kept neither its width nor its
      // height once the banner appeared. Desktop lost 1208px → 232px.
      eq(`${tag}: workspace keeps its column`, r.work.x, label === 'mobile' ? 0 : r.rail.w);
      eq(`${tag}: workspace keeps its width`, r.work.w, W - (label === 'mobile' ? 0 : r.rail.w));
      ok(`${tag}: workspace reaches the bottom of the viewport`, r.work.y + r.work.h === H);
      if (label === 'desktop') {
        eq(`${tag}: rail stays in column 1`, r.rail.x, 0);
        ok(`${tag}: rail keeps the rail's width`, r.rail.w > 0 && r.rail.w < 300);
      }
    }
    await page.close();
  }
  await browser.close();
}

// ── boot the app modules in a jsdom window ────────────────────────────────
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'https://localhost/', pretendToBeVisual: true });
const { window } = dom;
global.window = window;
global.document = window.document;
global.self = window;
global.HTMLElement = window.HTMLElement;
global.Element = window.Element;
global.Node = window.Node;
global.getComputedStyle = window.getComputedStyle;
global.sessionStorage = window.sessionStorage;
global.localStorage = window.localStorage;
global.Event = window.Event;
global.CustomEvent = window.CustomEvent;
global.MouseEvent = window.MouseEvent;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = clearTimeout;
global.IS_REACT_ACT_ENVIRONMENT = true;
// In a browser a bare `navigator` IS window.navigator; under vm.runInThisContext
// it would otherwise resolve to Node's own global navigator, which has no
// `onLine` at all — so the app's offline checks would silently read as "online"
// here and the offline assertions below would pass for the wrong reason.
Object.defineProperty(globalThis, 'navigator',
  { value: window.navigator, configurable: true, writable: true });
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
global.ReactDOM = ReactDOM; window.ReactDOM = ReactDOM;

window.NEOFEED_CLIENT_ID = 'test-client';
window.NEOFEED_GAS_URL = 'https://example.test/macros/s/AKfycTEST/exec';

// Every long interval the app registers, captured so the test can advance
// four minutes of ward time without waiting four minutes. The poll and the
// staleness tick both run at 30 s; firing all of them is what a real 30 s
// would have done anyway.
const intervals = [];
const realSetInterval = window.setInterval.bind(window);
window.setInterval = global.setInterval = (fn, ms, ...rest) => {
  if (ms >= 1000) { intervals.push({ fn, ms }); return { __captured: true }; }
  return realSetInterval(fn, ms, ...rest);
};
const realClearInterval = window.clearInterval.bind(window);
window.clearInterval = global.clearInterval = (h) => {
  if (h && h.__captured) return;
  return realClearInterval(h);
};
const fireIntervals = () => intervals.forEach(i => i.fn());

const TODAY = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date());
const mkPatient = (initials) => ({
  sessionId: `${initials}-BW900`, name: initials, initials, bw: 900, ga: 27.2, sex: 'boys',
  dob: TODAY, admissionDate: TODAY, twinSuffix: '', status: 'Active',
  currentBed: 'NICU 1', diagnosis: 'RDS', weights: [{ dol: 1, w: 900, l: null, hc: null }],
  lengths: [], hcs: [], bedHistory: [], statusDate: '', multiplesCount: 0,
});

// Stubbed GAS. `plan` is consumed one entry per getActivePatients call, so a
// test can say exactly what the 1st, 2nd and 3rd sync each return — including
// "hang until I say so" and "fail".
let syncCalls = 0;
let plan = [];
window.fetch = global.fetch = (url, opts) => {
  const body = JSON.parse(opts.body);
  const reply = (data) => ({ json: () => Promise.resolve(data) });
  if (body.action === 'getActivePatients') {
    const step = plan[syncCalls] || plan[plan.length - 1] || { patients: [mkPatient('AA')] };
    syncCalls++;
    if (step.reject) return Promise.reject(new Error('network down'));
    const data = { patients: step.patients, log: step.log || {} };
    return step.hold ? step.hold.then(() => reply(data)) : Promise.resolve(reply(data));
  }
  return Promise.resolve(reply({ ok: true }));
};
window.sessionStorage.setItem('neofeed_session', JSON.stringify(
  { name: 'Dr Test', role: 'doctor', email: 'dr@test.th', token: 'tok-123456789' }));

const load = (f) => vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + f, 'utf8'), {
  presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
  filename: f, configFile: false, babelrc: false,
}).code);
vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
['icons.jsx', 'calculator.jsx', 'fenton.jsx', 'registry.jsx', 'log.jsx'].forEach(load);
const appSrc = babel.transformSync(fs.readFileSync(DIR + 'app.jsx', 'utf8'), {
  presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
  filename: 'app.jsx', configFile: false, babelrc: false,
}).code;
const D = window.NEOFEED_DATA;

const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 20)); }); };
const text = () => document.getElementById('root').textContent;
const click = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); await flush(); };
const setVisibility = (v) => Object.defineProperty(window.document, 'visibilityState',
  { value: v, configurable: true });
const setOnline = (v) => Object.defineProperty(window.navigator, 'onLine',
  { value: v, configurable: true });

(async () => {
  await measureInChromium();

  // ══ 2. The first-load gate ═══════════════════════════════════════════════
  console.log('\n── #2 the first-load gate holds on a FAILED first sync ──');
  // A first sync that never succeeds used to fall straight through to an empty
  // registry, which the ward reads as "there are no patients".
  plan = [{ reject: true }];
  // syncFromGAS warns on a failed fetch, which is the point of this section —
  // don't print the stack of an expected failure over the results.
  const realWarn = console.warn; console.warn = () => {};
  await act(async () => { vm.runInThisContext(appSrc); });
  await flush();
  console.warn = realWarn;
  ok('gate still up after the first sync fails', /เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ/.test(text()));
  ok('…and the empty-registry message is NOT shown', !/ยังไม่มีผู้ป่วยในระบบ/.test(text()));
  ok('…and no ward gate / workspace behind it', !/เลือก ward/.test(text()));
  ok('a retry control is offered', /ลองใหม่/.test(text()));

  console.log('\n── #2b retry re-issues the sync and lets the app through ──');
  const before = syncCalls;
  plan = [{ reject: true }, { patients: [mkPatient('AA')] }];
  await click([...document.querySelectorAll('button')].find(b => /ลองใหม่/.test(b.textContent)));
  await flush();
  eq('retry issued exactly one more request', syncCalls - before, 1);
  ok('app is through the gate', /เลือก ward/.test(text()));

  // ══ 3. The background poll ═══════════════════════════════════════════════
  console.log('\n── #3 a visible tab re-syncs on its own ──');
  const realNow = Date.now;
  const advance = (ms) => { Date.now = () => realNow() + ms; };

  setVisibility('visible'); setOnline(true);
  let n = syncCalls;
  advance(60000);                       // one minute on: too soon
  await act(async () => { fireIntervals(); }); await flush();
  eq('no poll a minute after the last sync', syncCalls - n, 0);

  advance(D.SYNC_POLL_MS + 5000);       // past SYNC_POLL_MS: due
  await act(async () => { fireIntervals(); }); await flush();
  eq('polls once past SYNC_POLL_MS', syncCalls - n, 1);
  ok('SYNC_POLL_MS stays under the warn threshold', D.SYNC_POLL_MS < D.SYNC_WARN_MS);

  console.log('\n── #3b a hidden or offline tab costs nothing ──');
  n = syncCalls;
  setVisibility('hidden');
  advance(D.SYNC_POLL_MS * 4);
  await act(async () => { fireIntervals(); }); await flush();
  eq('hidden tab does not poll', syncCalls - n, 0);

  setVisibility('visible'); setOnline(false);
  await act(async () => { fireIntervals(); }); await flush();
  eq('offline tab does not poll', syncCalls - n, 0);

  setOnline(true);
  await act(async () => { fireIntervals(); }); await flush();
  eq('…and picks it straight back up once online', syncCalls - n, 1);

  console.log('\n── #3c a hung sync must not end background syncing ──');
  // The in-flight check is an economy measure, not a lock. If it never expired,
  // one fetch that Apps Script simply never answers would suppress the poll for
  // the rest of the shift — silently, since the tab looks fine.
  let neverRelease;
  n = syncCalls;
  plan = []; plan[syncCalls] = { hold: new Promise(r => { neverRelease = r; }), patients: [mkPatient('AA')] };
  plan[syncCalls + 1] = { patients: [mkPatient('AA')] };
  advance(D.SYNC_POLL_MS * 2);
  await act(async () => { fireIntervals(); }); await flush();
  eq('the poll issues the sync that then hangs', syncCalls - n, 1);

  advance(D.SYNC_POLL_MS * 2 + 30000);   // still inside the in-flight window
  await act(async () => { fireIntervals(); }); await flush();
  eq('…and holds off while it is plausibly still in flight', syncCalls - n, 1);

  advance(D.SYNC_POLL_MS * 2 + 90000);   // past SYNC_INFLIGHT_MAX_MS (60 s)
  await act(async () => { fireIntervals(); }); await flush();
  eq('…but resumes once that request is hopeless', syncCalls - n, 2);
  neverRelease();
  await flush();
  Date.now = realNow;

  // ══ 4. The supersede guard ═══════════════════════════════════════════════
  console.log('\n── #4 the NEWEST response wins, not the last to arrive ──');
  // Sync #1 is held and will return one patient. Sync #2 is issued after it
  // and returns two, immediately. Then #1 lands. Before the sequence guard,
  // #1's stale payload overwrote #2's.
  let release;
  const held = new Promise(r => { release = r; });
  plan = [];
  plan[syncCalls]     = { hold: held, patients: [mkPatient('AA')] };
  plan[syncCalls + 1] = { patients: [mkPatient('AA'), mkPatient('BB')] };
  const syncBtn = () => [...document.querySelectorAll('.topbar .icon-btn')]
    .find(b => /Sync now/.test(b.getAttribute('title') || ''));

  await act(async () => { syncBtn().dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await act(async () => { syncBtn().dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await flush();
  eq('a second manual sync is never swallowed', syncCalls, plan.length);

  await act(async () => { release(); });
  await flush(); await flush();
  const count = () => Number((text().match(/(\d+) active sessions/) || [])[1]);
  eq('registry shows the newer payload, not the late one', count(), 2);

  console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
