// verify-admin-census.cjs — UX roadmap #2, 2026-09-24: the admin dashboard
// carries a ward census, and an admin can reach it from a phone.
//
// Every section FAILS against 68e302f (before the UX roadmap) and passes after.
//
//   §1  buildCensus: per ward — beds occupied of capacity, active, logged
//       today, needs entry (drafts named), waiting for a bed, infants with a
//       critical / a caution — plus seven days of admissions and departures
//       and the data problems a census should surface (two infants in one
//       bed, no bed, a bed not on the list). Counted with the same helpers the
//       ward screens use, and the alert columns NOT net of any device's acks.
//   §2  The rendered page: the numbers above, in cards; no patient name or
//       NeoFeed ID anywhere in the census (it names beds, never babies); the
//       alert tile no longer sums discharged sessions and info lines.
//   §3  The real <App/> in an admin session: the phone's tab bar has an Admin
//       tab (the dashboard was unreachable on a phone) and it opens the
//       census; the rail's Admin item no longer wears Growth chart's glyph.
//   §4  Real Chromium, when playwright is installed: the census page never
//       scrolls sideways, from a 280px Galaxy Fold cover screen to a desktop.
//       Recent log entries may scroll inside its own card, never the page.
//       (Run with NODE_PATH="$(npm root -g)" to use a global playwright; CI
//       installs no browser, so there it degrades to a notice.)
//
// ── NEGATIVE CONTROL ───────────────────────────────────────────────────────
//   d=$(mktemp -d)
//   git -c core.autocrlf=false archive --format=tar 68e302f | tar -x -C "$d"
//   cp test/verify-admin-census.cjs "$d/test/"
//   cp -r node_modules "$d/node_modules"
//   ( cd "$d" && TZ=Asia/Bangkok node test/verify-admin-census.cjs )
// There buildCensus does not exist, the page has no census, the alert tile
// counts the discharged infant and every info line, and an admin's phone
// shows the same five tabs as a nurse's, none of them Admin.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0, n = 0;
function eq(name, got, want) {
  const yes = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${yes ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(74)}${yes ? '' : ` got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
  yes ? pass++ : fail++;
}
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(74)}${cond ? '' : '  ' + JSON.stringify(detail ?? '').slice(0, 300)}`);
  cond ? pass++ : fail++;
}
async function section(title, fn) {
  console.log(`\n── ${title} ──`);
  try { await fn(); } catch (e) { ok(`(section ran to the end) ${e.message}`, false, e.stack.split('\n').slice(0, 4)); }
}

// ── jsdom + the real modules ──────────────────────────────────────────────
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><div id="probe"></div></body></html>',
  { url: 'https://localhost/', pretendToBeVisual: true });
const { window } = dom;
Object.assign(global, {
  window, document: window.document, self: window,
  HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
  getComputedStyle: window.getComputedStyle,
  sessionStorage: window.sessionStorage, localStorage: window.localStorage,
  Event: window.Event, CustomEvent: window.CustomEvent, MouseEvent: window.MouseEvent,
  requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: clearTimeout,
  IS_REACT_ACT_ENVIRONMENT: true,
});
global.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
global.showToast = () => {};
window.print = () => {};
window.confirm = () => true;
const React = require('react');
const ReactDOM = require('react-dom/client');
const ReactDOMServer = require('react-dom/server');
const { act } = require('react');
global.React = React; window.React = React;
global.ReactDOM = ReactDOM; window.ReactDOM = ReactDOM;
window.NEOFEED_CLIENT_ID = 'test-client';
window.NEOFEED_GAS_URL = '';   // local mode: App starts from D.MOCK_PATIENTS / MOCK_DAILY_LOG
// §3 needs the auto-mounted App to be an ADMIN session. Local mode honours a
// stored session before falling back to its stub doctor.
window.sessionStorage.setItem('neofeed_session',
  JSON.stringify({ name: 'Census Admin', role: 'admin', email: 'admin@example.test', token: '' }));

const load = (f) => vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + f, 'utf8'), {
  presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
  filename: f, configFile: false, babelrc: false,
}).code);
vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
const D = window.NEOFEED_DATA;

// ── The fixture census ─────────────────────────────────────────────────────
// Names and ids are distinctive tokens (QX…) so §2 can prove none leaks into
// the census. Everyone was weighed today with velocity on target, so the only
// findings are the two GIR orders.
const TODAY = D.todayLocal();
const ago = (days) => D.addDaysToDateStr(TODAY, -days);
const rec = (id, over) => ({
  sessionId: `${id}-BW1000`, name: id, initials: id, bw: 1000, ga: 28.0, sex: 'girls',
  dob: ago(20), admissionDate: ago(20), twinSuffix: '', status: 'Active', diagnosis: 'VLBW',
  currentBed: '', bedHistory: [],
  weights: [{ dol: 1, w: 1000 }, { dol: 8, w: 1000 }, { dol: 14, w: 1120 }, { dol: 21, w: 1260 }],
  lengths: [], hcs: [], statusDate: '', multiplesCount: 0, ...over,
});
const order = (over) => ({ ts: TODAY, dol: 21, weight: 1260, fluid: 150, gir: 8, pro: 3.5, kcal: 100,
  enVolPerKg: 20, route: 'TPN central', status: 'submitted', entryId: 'e-' + Math.random().toString(36).slice(2), ...over });
const PATIENTS = [
  // NICU (NICU 1–12 + the iso rooms)
  rec('QXNA', { currentBed: 'NICU 1', admissionDate: ago(2) }),              // logged today; admitted in the window
  rec('QXNB', { currentBed: 'NICU 2' }),                                     // a draft today, nothing submitted
  rec('QXNC', { currentBed: 'iso 1-1', status: '' }),                        // blank status is still on the unit
  rec('QXND', { currentBed: '', bedHistory: [{ bed: 'NICU 4', date: ago(1) }] }),   // parked, left NICU 4
  // SCN
  rec('QXSA', { currentBed: 'SCN 1' }),                                      // GIR 13.5 → critical
  rec('QXSB', { currentBed: 'SCN 2', admissionDate: ago(6) }),               // GIR 12.5 → caution; window edge, inside
  rec('QXSC', { currentBed: 'SCN 5' }),                                      // two infants in SCN 5
  rec('QXSD', { currentBed: 'SCN 5' }),
  // other
  rec('QXOA', { currentBed: '', admissionDate: ago(7) }),                    // no bed, never had one; window edge, outside
  rec('QXOB', { currentBed: 'Ward 9B' }),                                    // a bed not on the list
  // left the unit
  rec('QXDA', { currentBed: 'NICU 6', status: 'Discharged', statusDate: ago(3), admissionDate: ago(5) }),
  rec('QXTA', { currentBed: 'SCN 9', status: 'Transferred', statusDate: ago(10) }),
  rec('QXEA', { currentBed: 'SCN 10', status: 'Expired', statusDate: ago(1) }),
];
const LOG = {
  'QXNA-BW1000': [order({})],
  'QXNB-BW1000': [order({ status: 'draft' })],
  'QXSA-BW1000': [order({ gir: 13.5 })],
  'QXSB-BW1000': [order({ gir: 12.5 })],
  'QXDA-BW1000': [order({ gir: 13.5 })],        // would be critical, had they stayed
};
D.MOCK_PATIENTS.splice(0, D.MOCK_PATIENTS.length, ...PATIENTS);
Object.keys(D.MOCK_DAILY_LOG).forEach(k => delete D.MOCK_DAILY_LOG[k]);
Object.assign(D.MOCK_DAILY_LOG, LOG);

['icons.jsx', 'calculator.jsx', 'fenton.jsx', 'registry.jsx', 'log.jsx'].forEach(load);
load('app.jsx');

const probe = ReactDOM.createRoot(document.getElementById('probe'));
const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 20)); }); };
const render = async (el) => { await act(async () => { probe.render(el); }); await flush(); };
const click = async (el) => {
  await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await flush();
};
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const pick = (w) => w && { capacity: w.capacity, occupied: w.occupied, active: w.active, logged: w.logged,
  needs: w.needs, draft: w.draft, parked: w.parked, crit: w.crit, warn: w.warn };

(async () => {

  // ══════════════════════════════════════════════════════════════════════
  await section('§1 buildCensus — the counts', async () => {
    localStorage.clear();
    ok('buildCensus exists', typeof global.buildCensus === 'function');
    // Fixture self-checks: the only findings are the two GIR orders.
    const findings = PATIENTS.filter(D.isOnUnit)
      .map(p => [p.name, global.computeAlerts(p, LOG[p.sessionId] || []).filter(a => a.level !== 'info').map(a => a.id)])
      .filter(([, ids]) => ids.length);
    eq('fixture: only QXSA (gir-high) and QXSB (gir-off) carry a finding', findings, [['QXSA', ['gir-high']], ['QXSB', ['gir-off']]]);

    const c = global.buildCensus(PATIENTS, LOG, TODAY);
    eq('wards shown: NICU, SCN and อื่นๆ (someone is in it)', c.wards.map(w => w.ward), ['NICU', 'SCN', 'other']);
    const W = Object.fromEntries(c.wards.map(w => [w.ward, w]));
    eq('NICU: 20 beds (NICU 1–12 + 8 iso), 3 held; 4 infants, 1 logged, 3 need entry (1 draft), 1 waiting for a bed',
       pick(W.NICU), { capacity: 20, occupied: 3, active: 4, logged: 1, needs: 3, draft: 1, parked: 1, crit: 0, warn: 0 });
    eq('SCN: 30 beds, 3 held (SCN 5 once); 4 infants, 2 logged; 1 critical, 1 caution',
       pick(W.SCN), { capacity: 30, occupied: 3, active: 4, logged: 2, needs: 2, draft: 0, parked: 0, crit: 1, warn: 1 });
    eq('อื่นๆ: no bed list, the unbedded and the off-list infant',
       pick(W.other), { capacity: null, occupied: 0, active: 2, logged: 0, needs: 2, draft: 0, parked: 0, crit: 0, warn: 0 });
    eq('the unit: 50 beds, 6 held, 10 infants on the unit',
       pick(c.total), { capacity: 50, occupied: 6, active: 10, logged: 3, needs: 7, draft: 1, parked: 1, crit: 1, warn: 1 });
    eq('logged + needs entry = active, ward by ward (the ward tiles\' rule)',
       [...c.wards, c.total].every(w => w.logged + w.needs === w.active), true);
    eq('…and the census agrees with the registry\'s own on-unit count',
       c.total.active, PATIENTS.filter(p => !p.status || p.status === 'Active').length);
    eq('seven days of movement: 3 admitted (edge day 6 in, day 7 out), 1 discharged, 1 expired, the 10-day transfer out',
       c.movement, { admitted: 3, Discharged: 1, Transferred: 0, Expired: 1 });
    eq('two infants in SCN 5 are reported', c.doubleBooked, [{ bed: 'SCN 5', n: 2 }]);
    eq('…as are the unbedded and the off-list infants', [c.unbedded, c.offList], [1, 1]);
    ok('the discharged infant\'s old bed (NICU 6) is not held', W.NICU.occupied === 3);

    // The alert columns are the unit's, not this device's.
    const sa = PATIENTS.find(p => p.name === 'QXSA');
    const crit = global.computeAlerts(sa, LOG[sa.sessionId]).find(a => a.level === 'crit');
    // alertAckKey is a top-level const in app.jsx: script scope, not a global property.
    const alertAckKey = vm.runInThisContext('alertAckKey');
    localStorage.setItem(`neofeed_acked_${sa.sessionId}`, JSON.stringify({ [alertAckKey(crit)]: new Date().toISOString() }));
    eq('fixture: acknowledged here, QXSA is off this device\'s badge', global.activeAlertCount(sa, LOG[sa.sessionId]), 0);
    eq('…but the census still counts the infant as critical', global.buildCensus(PATIENTS, LOG, TODAY).total.crit, 1);
    localStorage.clear();

    const clean = global.buildCensus(PATIENTS.filter(p => ['QXNA', 'QXSA'].includes(p.name)), LOG, TODAY);
    eq('with nobody in อื่นๆ, there is no อื่นๆ ward', clean.wards.map(w => w.ward), ['NICU', 'SCN']);
    eq('…and nothing to flag', [clean.doubleBooked.length, clean.unbedded, clean.offList], [0, 0, 0]);
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§2 The rendered admin page', async () => {
    localStorage.clear();
    await render(React.createElement(global.AdminDashboard, { patients: PATIENTS, log: LOG, lastSync: null }));
    const host = document.getElementById('probe');
    const card = host.querySelector('.census-card');
    ok('the admin page carries a Census card', !!card, text(host).slice(0, 160));
    const ward = (w) => card && card.querySelector(`.census-ward[data-ward="${w}"]`);
    ok('NICU: beds 3/20, 17 free', /เตียง 3\/20 · ว่าง 17/.test(text(ward('NICU'))), text(ward('NICU')));
    ok('SCN: beds 3/30, 27 free', /เตียง 3\/30 · ว่าง 27/.test(text(ward('SCN'))), text(ward('SCN')));
    ok('อื่นๆ: says it has no bed list', /ไม่มีเตียงในรายการ/.test(text(ward('other'))), text(ward('other')));
    ok('the unit: 6/50', /6\/50/.test(text(ward('total'))), text(ward('total')));
    const stat = (w, label) => {
      const s = [...(ward(w)?.querySelectorAll('.census-stat') || [])].find(x => x.querySelector('.l').textContent.startsWith(label));
      return s && { v: s.querySelector('.v').textContent, tone: s.className.replace('census-stat', '').trim() };
    };
    eq('NICU needs entry: 3, amber, with its draft named', [stat('NICU', 'Needs entry'), /draft 1/.test(text(ward('NICU')))],
       [{ v: '3', tone: 'warn' }, true]);
    eq('NICU waiting for a bed: 1, amber', stat('NICU', 'รอเตียง'), { v: '1', tone: 'warn' });
    eq('SCN critical: 1, red', stat('SCN', 'Critical'), { v: '1', tone: 'crit' });
    eq('SCN caution: 1, amber', stat('SCN', 'Caution'), { v: '1', tone: 'warn' });
    eq('a zero is plain ink, not a status', stat('NICU', 'Critical'), { v: '0', tone: '' });
    const flags = text(card && card.querySelector('.census-flags'));
    ok('flags: two infants in SCN 5', /เตียงซ้อน SCN 5 \(2 ราย\)/.test(flags), flags);
    ok('flags: one unbedded, one off-list', /ยังไม่ระบุเตียง 1 ราย/.test(flags) && /เตียงนอกรายการ 1 ราย/.test(flags), flags);
    const moves = text(card && card.querySelector('.census-movement'));
    ok('movement: 3 admitted · 1 discharged · 0 transferred · 1 expired',
       /รับใหม่ 3 · Discharged 1 · Transferred 0 · Expired 1/.test(moves), moves);

    // PDPA data minimisation: the census names beds, never babies.
    const leaks = PATIENTS.flatMap(p => [p.name, p.sessionId]).filter(s => text(card).includes(s));
    eq('no patient name or NeoFeed ID anywhere in the census', leaks, []);

    const tiles = [...host.querySelectorAll('.admin-stat-tiles .card')].map(text);
    eq('tile: Active sessions counts the unit (blank status included)', tiles[0], 'Active sessions10');
    const alertTile = tiles.find(t => /alert/i.test(t));
    eq('tile: infants with alerts — the critical and the caution, not the discharged one', alertTile, 'Infants with alerts2');

    await render(React.createElement(global.AdminDashboard, {
      patients: PATIENTS.filter(p => ['QXNA', 'QXSA'].includes(p.name)), log: LOG, lastSync: null }));
    ok('a clean census shows no flag box', !host.querySelector('.census-flags'));
    ok('…and no อื่นๆ card', !host.querySelector('.census-ward[data-ward="other"]'));
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§3 The real <App/>: an admin can reach it from a phone', async () => {
    await render(null);
    const root = document.getElementById('root');
    await flush();
    const tabs = [...root.querySelectorAll('.bottom-nav .bnav-item')].map(b => b.getAttribute('aria-label'));
    eq('an admin\'s tab bar: five tabs, the fifth is Admin', tabs, ['Patients', 'Dashboard', 'Growth', 'Alerts', 'Admin']);
    const adminTab = [...root.querySelectorAll('.bottom-nav .bnav-item')].find(b => b.getAttribute('aria-label') === 'Admin');
    if (adminTab) await click(adminTab);
    ok('…and it opens the census', !!root.querySelector('.census-card'), text(root).slice(0, 160));
    ok('…with the Admin tab shown as the current one', adminTab && adminTab.classList.contains('active'));

    // Growth chart and Admin dashboard used to share one glyph on the rail.
    const railPath = (label) => [...root.querySelectorAll('.rail-item')]
      .find(r => r.textContent.includes(label))?.querySelector('svg path')?.getAttribute('d');
    ok('the rail\'s Admin item no longer wears Growth chart\'s glyph',
       railPath('Admin dashboard') && railPath('Admin dashboard') !== railPath('Growth chart'),
       [railPath('Admin dashboard'), railPath('Growth chart')]);

    // A doctor's bar is unchanged.
    await render(React.createElement(global.BottomNav, { view: 'registry', setView() {}, alertCount: 0, alertLevel: null, logCount: 0, role: 'doctor' }));
    eq('a doctor\'s tab bar is unchanged', [...document.querySelectorAll('#probe .bnav-item')].map(b => b.getAttribute('aria-label')),
       ['Patients', 'Dashboard', 'Calc', 'Growth', 'Alerts']);
    await render(null);
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§4 Real Chromium: the census page never scrolls sideways', async () => {
    for (const shell of ['NeoFeed.html', 'index.html']) {
      const css = fs.readFileSync(DIR + shell, 'utf8');
      ok(`${shell}: the ward grid cannot overflow a narrow screen (min(240px, 100%))`,
         /\.census-grid\s*\{[^}]*minmax\(min\(240px,\s*100%\),\s*1fr\)/.test(css));
      ok(`${shell}: Recent log entries scrolls inside its card`, /\.admin-recent\s*\{[^}]*overflow-x:\s*auto/.test(css));
    }
    let chromium;
    try { chromium = require('playwright').chromium; }
    catch { console.log('  SKIP  playwright not installed — static CSS assertions only'); return; }
    const exe = ['/opt/pw-browsers/chromium'].find(p => fs.existsSync(p));
    let browser;
    try { browser = await chromium.launch(exe ? { executablePath: exe } : {}); }
    catch (e) { console.log('  SKIP  could not launch Chromium (' + e.message.split('\n')[0] + ')'); return; }

    const css = fs.readFileSync(DIR + 'NeoFeed.html', 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
    const page = ReactDOMServer.renderToStaticMarkup(
      React.createElement(global.AdminDashboard, { patients: PATIENTS, log: LOG, lastSync: null }));
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
      <div class="app"><div class="topbar"><div class="spacer"></div></div><nav class="rail"></nav>
      <main class="work"><div class="work-inner">${page}</div></main>
      <nav class="bottom-nav">${['Patients', 'Dashboard', 'Growth', 'Alerts', 'Admin']
        .map(t => `<button class="bnav-item"><span>${t}</span></button>`).join('')}</nav></div></body></html>`;
    for (const W of [280, 320, 360, 390, 430, 768, 1280]) {
      const tab = await browser.newPage({ viewport: { width: W, height: 900 } });
      await tab.setContent(html);
      const r = await tab.evaluate(() => {
        const drags = [];
        for (const el of [document.documentElement, document.body, ...document.querySelectorAll('body *')]) {
          const over = el.scrollWidth - el.clientWidth;
          if (over <= 0.5 || el.clientWidth <= 0) continue;
          const ox = getComputedStyle(el).overflowX;
          if ((ox === 'auto' || ox === 'scroll' || el === document.documentElement || el === document.body)
              && !el.classList.contains('admin-recent')) drags.push(`${el.tagName.toLowerCase()}.${el.className} +${over.toFixed(1)}`);
        }
        const grid = document.querySelector('.census-grid').getBoundingClientRect();
        const spill = [...document.querySelectorAll('.census-ward, .census-stat')]
          .filter(el => el.getBoundingClientRect().right > grid.right + 0.5).length;
        return { drags, spill, cols: getComputedStyle(document.querySelector('.census-grid')).gridTemplateColumns.split(' ').length };
      });
      ok(`${W}px: nothing but Recent log entries scrolls sideways`, r.drags.length === 0, r.drags);
      ok(`${W}px: no ward card or figure spills out of the grid (${r.cols} column${r.cols > 1 ? 's' : ''})`, r.spill === 0, r);
      await tab.close();
    }
    await browser.close();
  });

  console.log(`\nADMIN CENSUS: ${fail === 0 ? 'ALL PASS' : fail + ' FAILED'} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})();
