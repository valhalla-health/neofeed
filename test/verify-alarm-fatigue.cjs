// verify-alarm-fatigue.cjs — UX roadmap #1, 2026-09-24: the Alerts badge
// counts only what somebody can act on, and says how bad it is.
//
// Every section below FAILS against 68e302f (the tree before this change) and
// passes after it.
//
//   §1  The standing electrolyte *reminder* (level "info") counted toward the
//       badge, and it was pushed for every infant with an order — so the badge
//       was never empty. Info lines no longer count; the reminder appears only
//       while the latest order is parenteral, which is what its own text says.
//   §2  The badge takes its colour from the worst thing it counts: red only for
//       an unacknowledged critical, amber for cautions alone. RailItem's
//       `crit={alertCount > 0}` painted every count red.
//   §3  A session that has left the unit raises nothing — its alerts kept
//       running after discharge and were summed into the admin tile.
//   §4  An acknowledged stale-weight caution stays acknowledged until there is
//       something new to say (it escalates past 7 days, or a new weight clears
//       it). It was keyed on today's DOL, so it came back every morning.
//   §5  The Alerts page leads with the worst unacknowledged item and says why
//       an empty list is empty.
//   §6  The real <App/>: the rail and the phone's bottom nav wear the new
//       badge, and the Dashboard's entry count is no longer drawn in alarm red.
//
// ── NEGATIVE CONTROL ───────────────────────────────────────────────────────
//   d=$(mktemp -d)
//   git -c core.autocrlf=false archive --format=tar 68e302f | tar -x -C "$d"
//   cp test/verify-alarm-fatigue.cjs "$d/test/"
//   cp -r node_modules "$d/node_modules"
//   ( cd "$d" && TZ=Asia/Bangkok node test/verify-alarm-fatigue.cjs )
// There the in-range PN infant carries a badge of 1, the full-feeds infant
// still gets the PN reminder, the discharged infant still raises GIR, the
// acknowledged stale weight comes back the next day, the caution-only rail
// item is painted crit, and the Dashboard badge on a phone is solid red.
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
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(74)}${cond ? '' : '  ' + JSON.stringify(detail ?? '')}`);
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
const { act } = require('react');
global.React = React; window.React = React;
global.ReactDOM = ReactDOM; window.ReactDOM = ReactDOM;
window.NEOFEED_CLIENT_ID = 'test-client';
window.NEOFEED_GAS_URL = '';   // local mode: App starts from D.MOCK_PATIENTS / MOCK_DAILY_LOG

const load = (f) => vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + f, 'utf8'), {
  presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
  filename: f, configFile: false, babelrc: false,
}).code);
vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
const D = window.NEOFEED_DATA;

// §6 mounts the real <App/> in local mode, which seeds its state from the mock
// census. Replace that census with this file's fixtures BEFORE app.jsx loads —
// app.jsx mounts <AppRoot/> into #root as its last statement.
const TODAY = D.todayLocal();
const ago = (days) => D.addDaysToDateStr(TODAY, -days);
const base = (over) => ({
  name: over.sessionId.slice(0, 2), initials: over.sessionId.slice(0, 2), bw: 1000, ga: 28.0, sex: 'boys',
  dob: ago(20), admissionDate: ago(20), twinSuffix: '', status: 'Active', diagnosis: 'VLBW',
  // Regained on DOL 8, growing ~17 g/kg/d since, weighed today (DOL 21):
  // growth velocity grades "ok" and no weight is stale.
  weights: [{ dol: 1, w: 1000 }, { dol: 8, w: 1000 }, { dol: 14, w: 1120 }, { dol: 21, w: 1260 }],
  lengths: [], hcs: [], bedHistory: [], statusDate: '', multiplesCount: 0,
  ...over,
});
// An in-range order for DOL 21. PN targets past day 7: protein ≥ 2.5 (up to
// 3.5–4), energy ≥ 90 — 3.5 g/kg/d and 100 kcal/kg/d sit inside both.
const order = (over) => ({ ts: TODAY, dol: 21, weight: 1260, fluid: 150, gir: 8, pro: 3.5, kcal: 100,
  enVolPerKg: 20, route: 'TPN central', status: 'submitted', entryId: 'e-' + Math.random().toString(36).slice(2), ...over });

const P = {
  pnOk:       base({ sessionId: 'PN-BW1000', currentBed: 'NICU 1' }),
  enOnly:     base({ sessionId: 'EN-BW1000', currentBed: 'NICU 2' }),
  girWarn:    base({ sessionId: 'GW-BW1000', currentBed: 'NICU 3' }),
  girCrit:    base({ sessionId: 'GC-BW1000', currentBed: 'NICU 4' }),
  discharged: base({ sessionId: 'DC-BW1000', currentBed: 'NICU 5', status: 'Discharged', statusDate: TODAY }),
};
const LOG = {
  'PN-BW1000': [order({})],
  // Full feeds: the enteral targets apply (ESPGHAN 2022 — protein 3.5–4.0,
  // energy 115–140), so this order sits inside them too.
  'EN-BW1000': [order({ route: 'Enteral only', enVolPerKg: 150, gir: 0, pro: 3.6, kcal: 120 })],
  'GW-BW1000': [order({ gir: 12.5 })],
  'GC-BW1000': [order({ gir: 13.5 })],
  'DC-BW1000': [order({ gir: 13.5 })],
};
D.MOCK_PATIENTS.splice(0, D.MOCK_PATIENTS.length, ...Object.values(P));
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
const ids = (alerts) => alerts.map(a => a.id).sort();
const badge = (p, entries) => (typeof global.alertBadgeFor === 'function')
  ? global.alertBadgeFor(p, entries)
  : { count: global.activeAlertCount(p, entries), level: 'n/a (no alertBadgeFor)' };

(async () => {

  // ══════════════════════════════════════════════════════════════════════
  await section('§1 Info lines never reach the badge; the PN reminder only on PN', async () => {
    localStorage.clear();
    const pn = global.computeAlerts(P.pnOk, LOG['PN-BW1000']);
    eq('fixture: the in-range PN infant raises only the PN reminder', ids(pn), ['electrolyte-audit']);
    eq('…which is an info line', pn[0] && pn[0].level, 'info');
    eq('THE DEFECT: an info-only list puts nothing on the badge',
       global.activeAlertCount(P.pnOk, LOG['PN-BW1000']), 0);

    const en = global.computeAlerts(P.enOnly, LOG['EN-BW1000']);
    eq('fixture: the full-feeds infant raises nothing at all', ids(en), []);
    ok('an infant on full feeds ("Enteral only") gets no PN reminder',
       !en.find(a => a.id === 'electrolyte-audit'), ids(en));
    const npo = global.computeAlerts(P.enOnly, [order({ route: 'NPO', enVolPerKg: 0, gir: 0 })]);
    ok('…nor does an NPO day', !npo.find(a => a.id === 'electrolyte-audit'), ids(npo));
    const legacyEN = global.computeAlerts(P.enOnly, [order({ route: 'Full EN 135 mL/kg', enVolPerKg: 135 })]);
    ok('…nor a legacy "Full EN" row', !legacyEN.find(a => a.id === 'electrolyte-audit'), ids(legacyEN));
    const legacyPN = global.computeAlerts(P.pnOk, [order({ route: 'TPN + EBM 25 mL/kg' })]);
    ok('a legacy "TPN + EBM" row keeps it', !!legacyPN.find(a => a.id === 'electrolyte-audit'), ids(legacyPN));
    const noRoute = global.computeAlerts(P.pnOk, [order({ route: undefined })]);
    ok('a row with no route keeps it (unknown reads as PN)', !!noRoute.find(a => a.id === 'electrolyte-audit'), ids(noRoute));
    const orderless = global.computeAlerts(P.pnOk, []);
    ok('an infant with no order at all gets no PN reminder', !orderless.find(a => a.id === 'electrolyte-audit'), ids(orderless));
    const draftOnly = global.computeAlerts(P.pnOk, [order({ status: 'draft' })]);
    ok('…and a draft is not an order', !draftOnly.find(a => a.id === 'electrolyte-audit'), ids(draftOnly));
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§2 The badge wears the worst thing it counts', async () => {
    localStorage.clear();
    const w = global.computeAlerts(P.girWarn, LOG['GW-BW1000']);
    ok('fixture: GIR 12.5 is a caution', w.some(a => a.id === 'gir-off' && a.level === 'warn'), ids(w));
    const bw = badge(P.girWarn, LOG['GW-BW1000']);
    eq('a caution alone counts 1 …', bw.count, 1);
    eq('…and the badge is amber, not red', bw.level, 'warn');
    const bc = badge(P.girCrit, LOG['GC-BW1000']);
    eq('GIR 13.5: one critical', bc.count, 1);
    eq('…and the badge is red', bc.level, 'crit');
    eq('nothing actionable: no level at all', badge(P.pnOk, LOG['PN-BW1000']).level, null);

    // The rail item draws what it is given.
    await render(React.createElement(global.RailItem, { icon: 'bell', label: 'Alerts', count: 1, warn: true, onClick() {} }));
    const warnItem = document.querySelector('#probe .rail-item');
    ok('RailItem with a caution-only count carries .warn', warnItem.classList.contains('warn'), warnItem.className);
    ok('…and not .crit', !warnItem.classList.contains('crit'), warnItem.className);
    await render(React.createElement(global.RailItem, { icon: 'bell', label: 'Alerts', count: 2, crit: true, warn: false, onClick() {} }));
    ok('RailItem with a critical carries .crit', document.querySelector('#probe .rail-item').classList.contains('crit'));

    // Both shells style it.
    for (const shell of ['NeoFeed.html', 'index.html']) {
      const css = fs.readFileSync(DIR + shell, 'utf8');
      ok(`${shell}: .rail-item.warn .count is styled amber`, /\.rail-item\.warn \.count \{[^}]*var\(--warn-ink\)/.test(css));
      ok(`${shell}: .bnav-badge.warn is styled amber`, /\.bnav-badge\.warn\s*\{[^}]*var\(--warn-ink\)/.test(css));
      ok(`${shell}: .bnav-badge.neutral is styled neutral`, /\.bnav-badge\.neutral\s*\{[^}]*var\(--ink-2\)/.test(css));
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§3 A session that has left the unit raises nothing', async () => {
    localStorage.clear();
    const onUnit = global.computeAlerts({ ...P.discharged, status: 'Active' }, LOG['DC-BW1000']);
    ok('fixture: the same record on the unit would raise a critical GIR',
       onUnit.some(a => a.level === 'crit'), ids(onUnit));
    for (const status of ['Discharged', 'Transferred', 'Expired']) {
      eq(`${status}: no alerts`, ids(global.computeAlerts({ ...P.discharged, status }, LOG['DC-BW1000'])), []);
    }
    eq('…and nothing on the badge', global.activeAlertCount(P.discharged, LOG['DC-BW1000']), 0);
    eq('a blank status is still on the unit (registry parity)',
       global.computeAlerts({ ...P.discharged, status: '' }, LOG['DC-BW1000']).some(a => a.level === 'crit'), true);

    // The admin tile sums the badge rule over the census it is handed.
    await render(React.createElement(global.AdminDashboard, {
      patients: [P.girCrit, P.discharged], log: LOG, lastSync: null,
    }));
    const tiles = [...document.querySelectorAll('#probe .admin-stat-tiles .card')].map(c => c.textContent);
    const alertTile = tiles.find(t => /alert/i.test(t)) || '';
    ok('the admin alert tile counts the infant on the unit, not the discharged one',
       /1$/.test(alertTile.replace(/\s+/g, '')), tiles);
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§4 An acknowledged stale weight stays acknowledged until it escalates', async () => {
    localStorage.clear();
    // Last weighed on DOL 17; today is DOL 21 → 4 days: a caution.
    const stale = base({ sessionId: 'SW-BW1000', currentBed: 'NICU 6',
      weights: [{ dol: 1, w: 1000 }, { dol: 8, w: 1000 }, { dol: 14, w: 1120 }, { dol: 17, w: 1180 }] });
    const today = global.computeAlerts(stale, []);
    const sw = today.find(a => a.id === 'weight-stale');
    eq('fixture: a 4-day-old weight is a caution', sw && sw.level, 'warn');
    eq('…and it is on the badge', global.activeAlertCount(stale, []), 1);

    // Acknowledge it the way the Alerts page does.
    await render(React.createElement(global.AlertCenter, { patient: stale, log: { [stale.sessionId]: [] }, onAckChange() {} }));
    const ackBtn = [...document.querySelectorAll('#probe button')].find(b => b.textContent.trim() === 'Acknowledge');
    ok('the Alerts page offers Acknowledge', !!ackBtn);
    await click(ackBtn);
    eq('acknowledged: off the badge', global.activeAlertCount(stale, []), 0);

    // The next morning: the same record one day further on, same last weight.
    const tomorrow = { ...stale, dob: ago(21), admissionDate: ago(21) };
    const t2 = global.computeAlerts(tomorrow, []).find(a => a.id === 'weight-stale');
    eq('fixture: next day, still a caution (5 days)', t2 && t2.level, 'warn');
    eq('THE DEFECT: the acknowledged caution does not come back the next morning',
       global.activeAlertCount(tomorrow, []), 0);

    // Day 7: it escalates, and an escalation is news.
    const escalated = { ...stale, dob: ago(23), admissionDate: ago(23) };
    const t7 = global.computeAlerts(escalated, []).find(a => a.id === 'weight-stale');
    eq('fixture: 7 days is critical', t7 && t7.level, 'crit');
    eq('…and the critical comes back despite the earlier acknowledgement', global.activeAlertCount(escalated, []), 1);
    eq('…in red', badge(escalated, []).level, 'crit');

    // A new weight clears it outright.
    const reweighed = { ...escalated, weights: [...stale.weights, { dol: 24, w: 1300 }] };
    ok('a new weight clears it', !global.computeAlerts(reweighed, []).find(a => a.id === 'weight-stale'));
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§5 The Alerts page: worst first, and an empty list says why', async () => {
    localStorage.clear();
    // Critical GIR and a stale-weight caution on the same infant, plus the PN reminder.
    const both = base({ sessionId: 'BO-BW1000', currentBed: 'NICU 8',
      weights: [{ dol: 1, w: 1000 }, { dol: 8, w: 1000 }, { dol: 14, w: 1120 }, { dol: 17, w: 1180 }] });
    const entries = [order({ gir: 13.5, weight: undefined })];
    await render(React.createElement(global.AlertCenter, { patient: both, log: { [both.sessionId]: entries }, onAckChange() {} }));
    const levels = [...document.querySelectorAll('#probe .alert-row')].map(r =>
      ['crit', 'warn', 'info'].find(l => r.classList.contains(l)));
    eq('rows run critical → caution → info', levels, ['crit', 'warn', 'info']);
    ok('the page says what the badge counts',
       /Critical และ Caution/.test(document.querySelector('#probe').textContent));

    await render(React.createElement(global.AlertCenter, { patient: P.discharged, log: LOG, onAckChange() {} }));
    ok('a discharged session says why its list is empty',
       /ไม่ได้อยู่ใน unit แล้ว \(Discharged\)/.test(document.querySelector('#probe').textContent),
       document.querySelector('#probe').textContent.slice(0, 200));
    await render(React.createElement(global.AlertCenter, { patient: P.enOnly, log: LOG, onAckChange() {} }));
    ok('an infant with nothing wrong says so',
       /ไม่มีการแจ้งเตือนสำหรับผู้ป่วยรายนี้/.test(document.querySelector('#probe').textContent));
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§6 The real <App/>: rail and bottom nav', async () => {
    await render(null);
    localStorage.clear();
    const root = document.getElementById('root');
    const rootBtn = (re) => [...root.querySelectorAll('button')].find(b => re.test(b.textContent));
    const alertsRail = () => [...root.querySelectorAll('.rail-item')].find(r => /Alerts/.test(r.textContent));
    const openPatient = async (name) => {
      // Back to the ward list, then Open on that infant's card.
      const railPatients = [...root.querySelectorAll('.rail-item')].find(r => /Patients/.test(r.textContent));
      await click(railPatients);
      const nicu = [...root.querySelectorAll('.ward-tile')].find(t => /NICU/.test(t.textContent));
      if (nicu) await click(nicu);
      const card = [...root.querySelectorAll('.patient-mc')].find(c => c.querySelector('.pmc-name')?.textContent === name);
      const open = card && [...card.querySelectorAll('button')].find(b => /Open/.test(b.textContent));
      if (!open) throw new Error(`no Open button for ${name}`);
      await click(open);
    };
    await flush();
    ok('App mounted in local mode on the fixture census', !!rootBtn(/./) && !!alertsRail(), root.textContent.slice(0, 120));

    await openPatient('PN');
    const pnRail = alertsRail();
    ok('in-range PN infant: the Alerts rail item carries no count', !pnRail.querySelector('.count'),
       pnRail && pnRail.outerHTML.slice(0, 200));
    ok('…and is not painted critical', !pnRail.classList.contains('crit'), pnRail.className);
    const pnAlertBadge = [...root.querySelectorAll('.bnav-item')].find(b => /Alerts/.test(b.textContent))?.querySelector('.bnav-badge');
    ok('…and the phone tab has no badge', !pnAlertBadge, pnAlertBadge && pnAlertBadge.outerHTML);
    const dashBadge = [...root.querySelectorAll('.bnav-item')].find(b => /Dashboard/.test(b.textContent))?.querySelector('.bnav-badge');
    ok('the Dashboard entry count is drawn neutral, not alarm red', dashBadge && dashBadge.classList.contains('neutral'),
       dashBadge && dashBadge.outerHTML);

    await openPatient('GW');
    const gwRail = alertsRail();
    eq('caution-only infant: the rail counts 1', gwRail.querySelector('.count')?.textContent, '1');
    ok('…in amber (.warn), not red', gwRail.classList.contains('warn') && !gwRail.classList.contains('crit'), gwRail.className);
    const gwTab = [...root.querySelectorAll('.bnav-item')].find(b => /Alerts/.test(b.textContent))?.querySelector('.bnav-badge');
    ok('…and so does the phone tab', gwTab && gwTab.classList.contains('warn'), gwTab && gwTab.outerHTML);

    await openPatient('GC');
    const gcRail = alertsRail();
    ok('critical infant: the rail is red', gcRail.classList.contains('crit'), gcRail.className);
    const gcTab = [...root.querySelectorAll('.bnav-item')].find(b => /Alerts/.test(b.textContent))?.querySelector('.bnav-badge');
    ok('…and the phone tab is the solid red default', gcTab && !gcTab.classList.contains('warn') && !gcTab.classList.contains('neutral'),
       gcTab && gcTab.outerHTML);
  });

  console.log(`\nALARM FATIGUE: ${fail === 0 ? 'ALL PASS' : fail + ' FAILED'} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})();
