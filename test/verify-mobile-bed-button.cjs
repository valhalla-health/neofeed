// verify-mobile-bed-button.cjs — UX roadmap #3, 2026-09-24: the phone's
// patient card can move an infant's bed.
//
// The desktop table has had a ⇄ per row since the transfer modal was built;
// the phone card had Edit and Open only. On a phone that meant:
//   • a bed changed through Edit writes no "Previous beds" hop — only the
//     transfer modal appends to bedHistory;
//   • พักไว้ก่อน (park), the ONLY way to swap two occupied beds, was out of
//     reach — it lives in the transfer modal and nowhere else;
//   • the transfer modal's own swap hint reads "เปิด ⇄ ของ … แล้วกด
//     พักไว้ก่อน", an instruction no phone could follow.
// The fix reuses the modal as it stands (the "reuse" in the roadmap): one more
// button on the card, the same TransferBedModal, the same save path.
//
// Every section FAILS against 68e302f and passes after.
//
//   §1  every active card carries ⇄; a parked infant's reads เลือกเตียง
//   §2  it opens the one TransferBedModal, and does not also open the patient
//   §3  a move from the card saves the new bed AND the "Previous beds" hop
//   §4  พักไว้ก่อน from the card frees the bed and keeps the infant listed
//   §5  archived cards get no ⇄; there is still exactly one transfer modal
//   §6  the shell lays the card's three actions out as one row of three
//   §7  real Chromium, when playwright is installed: 280–430px, every action
//       at least 44×44, none clipped, one row from 360px, no sideways page
//
// ── NEGATIVE CONTROL ───────────────────────────────────────────────────────
//   d=$(mktemp -d)
//   git -c core.autocrlf=false archive --format=tar 68e302f | tar -x -C "$d"
//   cp test/verify-mobile-bed-button.cjs "$d/test/"
//   cp -r node_modules "$d/node_modules"
//   ( cd "$d" && TZ=Asia/Bangkok node test/verify-mobile-bed-button.cjs )
// There no card has a ⇄, so nothing on a phone can open the transfer modal.
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

// ── jsdom + the real registry ─────────────────────────────────────────────
const dom = new JSDOM('<!doctype html><html><body><div id="probe"></div></body></html>',
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
window.alert = () => {};
window.confirm = () => true;
const React = require('react');
const ReactDOM = require('react-dom/client');
const ReactDOMServer = require('react-dom/server');
const { act } = require('react');
global.React = React; window.React = React;
global.ReactDOM = ReactDOM; window.ReactDOM = ReactDOM;

// registry.jsx is the only module under test; it reads Icon from icons.jsx.
const load = (f) => vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + f, 'utf8'), {
  presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
  filename: f, configFile: false, babelrc: false,
}).code);
vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
['icons.jsx', 'registry.jsx'].forEach(load);
const D = window.NEOFEED_DATA;

const TODAY = D.todayLocal();
const rec = (id, over) => ({
  sessionId: `${id}-BW1000`, name: id, initials: id, bw: 1000, ga: 28.0, sex: 'girls',
  dob: TODAY, admissionDate: TODAY, twinSuffix: '', status: 'Active', diagnosis: 'VLBW',
  currentBed: '', bedHistory: [], weights: [{ dol: 1, w: 1000 }], lengths: [], hcs: [],
  statusDate: '', multiplesCount: 0, ...over,
});
const PATIENTS = [
  rec('BA', { currentBed: 'NICU 1' }),
  rec('BB', { currentBed: '', bedHistory: [{ bed: 'NICU 4', date: TODAY }] }),     // parked
  rec('BC', { currentBed: 'NICU 3', status: 'Discharged', statusDate: TODAY }),    // archived, still listed
];

const probe = document.getElementById('probe');
const root = ReactDOM.createRoot(probe);
const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 20)); }); };
const click = async (el) => {
  await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await flush();
};
let edits = [], selected = [];
const mount = async () => {
  edits = []; selected = [];
  await act(async () => {
    root.render(React.createElement(window.PatientRegistry, {
      patients: PATIENTS, activeId: null, log: {}, ward: 'NICU', onWardChange() {},
      onSelect: (id) => selected.push(id), onAdd() {},
      onEdit: (p, base) => { edits.push({ p, base }); return { ok: true }; },
      mergeBaseFor: (id) => PATIENTS.find(p => p.sessionId === id),
    }));
  });
  await flush();
};
const card = (name) => [...probe.querySelectorAll('.patient-card-list .patient-mc')]
  .find(c => c.querySelector('.pmc-name')?.textContent === name);
const bedBtn = (c) => c && [...c.querySelectorAll('.pmc-actions button')].find(b => b.textContent.includes('⇄'));
const modalTitle = () => [...probe.querySelectorAll('.picker-h div')].map(d => d.textContent).find(t => /Transfer bed/.test(t)) || null;
const btn = (re, scope = probe) => [...scope.querySelectorAll('button')].find(b => re.test(b.textContent));

(async () => {

  // ══════════════════════════════════════════════════════════════════════
  await section('§1 Every active card carries ⇄', async () => {
    await mount();
    const a = bedBtn(card('BA')), b = bedBtn(card('BB'));
    ok('the card of an infant in a bed has ⇄', !!a, card('BA') && card('BA').querySelector('.pmc-actions').textContent);
    eq('…labelled ย้ายเตียง', a && a.textContent.trim(), '⇄ ย้ายเตียง');
    eq('a parked infant\'s reads เลือกเตียง — they have no bed to move out of', b && b.textContent.trim(), '⇄ เลือกเตียง');
    eq('the screen reader hears what it does and to whom', a && a.getAttribute('aria-label'), 'ย้ายเตียง BA');
    eq('the row runs ⇄, Edit, Open — the desktop row\'s order',
       card('BA') && [...card('BA').querySelectorAll('.pmc-actions button')].map(x => x.textContent.trim().replace(/\s+/g, ' ')),
       ['⇄ ย้ายเตียง', 'Edit', 'Open']);
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§2 It opens the one transfer modal — and only that', async () => {
    await mount();
    await click(bedBtn(card('BA')));
    eq('the card\'s ⇄ opens TransferBedModal for that infant', modalTitle(), 'Transfer bed · BA');
    eq('…without also opening the patient underneath it', selected, []);
    await click(btn(/^Cancel$/));
    ok('Cancel closes it', !modalTitle());
    // The desktop row's ⇄ opens the very same component.
    const deskRow = [...probe.querySelectorAll('.patient-table tbody tr')].find(tr => tr.textContent.includes('BA'));
    await click([...deskRow.querySelectorAll('button')].find(x => x.textContent.trim() === '⇄'));
    eq('the desktop ⇄ opens the same modal, same title', modalTitle(), 'Transfer bed · BA');
    await click(btn(/^Cancel$/));
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§3 A move from the card saves the bed and its history', async () => {
    await mount();
    await click(bedBtn(card('BA')));
    const scn = btn(/^SCN · SCN \d+$/);
    ok('the next-free-bed shortcuts are there', !!scn, [...probe.querySelectorAll('.picker button')].map(x => x.textContent));
    await click(scn);
    await click(btn(/Confirm transfer/));
    eq('one save', edits.length, 1);
    const saved = edits[0] && edits[0].p;
    eq('…to SCN 1', saved && saved.currentBed, 'SCN 1');
    eq('…with the bed it left in "Previous beds"', saved && saved.bedHistory, [{ bed: 'NICU 1', date: TODAY }]);
    ok('…carrying the merge base frozen when the modal opened', edits[0] && edits[0].base && edits[0].base.sessionId === 'BA-BW1000');
    ok('the modal closed itself on success', !modalTitle());
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§4 พักไว้ก่อน from the card', async () => {
    await mount();
    await click(bedBtn(card('BA')));
    await click(btn(/พักไว้ก่อน/));
    const saved = edits[0] && edits[0].p;
    eq('park frees the bed', saved && saved.currentBed, '');
    eq('…and records the bed it left', saved && saved.bedHistory, [{ bed: 'NICU 1', date: TODAY }]);
    ok('…so the infant is parked, and stays on the NICU list', saved && D.isParked(saved) && D.patientWard(saved) === 'NICU');
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§5 Archived cards, and one modal', async () => {
    await mount();
    await click(btn(/Discharged \/ Transferred \/ Expired/, probe.querySelector('.patient-card-list')));
    const archived = [...probe.querySelectorAll('.patient-card-list .patient-mc')].find(c => c.textContent.includes('BC'));
    ok('the discharged card is listed', !!archived);
    ok('…with no ⇄ — a bed is not moved for an infant who has left', archived && !bedBtn(archived));
    const src = fs.readFileSync(DIR + 'registry.jsx', 'utf8');
    eq('there is still exactly one transfer modal', (src.match(/function TransferBedModal\b/g) || []).length, 1);
    eq('…opened from two places: the desktop row and the phone card',
       (src.match(/setTransferPatient\(p\)/g) || []).length, 2);
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§6 The shells lay three actions out as one row of three', async () => {
    for (const shell of ['NeoFeed.html', 'index.html']) {
      const css = fs.readFileSync(DIR + shell, 'utf8');
      ok(`${shell}: .pmc-actions is three equal columns`,
         /\.patient-mc \.pmc-actions \{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/.test(css));
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§7 Real Chromium, 280–430px', async () => {
    let chromium;
    try { chromium = require('playwright').chromium; }
    catch { console.log('  SKIP  playwright not installed — static CSS assertions only'); return; }
    const exe = ['/opt/pw-browsers/chromium'].find(p => fs.existsSync(p));
    let browser;
    try { browser = await chromium.launch(exe ? { executablePath: exe } : {}); }
    catch (e) { console.log('  SKIP  could not launch Chromium (' + e.message.split('\n')[0] + ')'); return; }
    const css = fs.readFileSync(DIR + 'NeoFeed.html', 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
    const page = ReactDOMServer.renderToStaticMarkup(React.createElement(window.PatientRegistry, {
      patients: PATIENTS, activeId: null, log: {}, ward: 'NICU', onWardChange() {}, onSelect() {} }));
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
      <div class="app"><div class="topbar"></div><nav class="rail"></nav>
      <main class="work"><div class="work-inner">${page}</div></main></div></body></html>`;
    for (const W of [280, 320, 360, 390, 430]) {
      const tab = await browser.newPage({ viewport: { width: W, height: 900 } });
      await tab.setContent(html);
      const r = await tab.evaluate(() => {
        const rows = [...document.querySelectorAll('.patient-card-list .pmc-actions')].map(row =>
          [...row.querySelectorAll('button')].map(b => {
            const rc = b.getBoundingClientRect();
            return { w: rc.width, h: rc.height, top: Math.round(rc.top), clipped: b.scrollWidth > b.clientWidth + 0.5 };
          }));
        const doc = document.documentElement;
        return { rows, pageDrag: doc.scrollWidth - doc.clientWidth };
      });
      const all = r.rows.flat();
      ok(`${W}px: every card action is at least 44×44`, all.length === 6 && all.every(b => b.w >= 44 && b.h >= 44),
         all.map(b => `${Math.round(b.w)}×${Math.round(b.h)}`));
      ok(`${W}px: no label is clipped`, all.every(b => !b.clipped), all);
      if (W >= 360) ok(`${W}px: the three actions share one row`, r.rows.every(row => new Set(row.map(b => b.top)).size === 1), r.rows);
      ok(`${W}px: the page does not scroll sideways`, r.pageDrag <= 0.5, r.pageDrag);
      await tab.close();
    }
    await browser.close();
  });

  console.log(`\nMOBILE BED BUTTON: ${fail === 0 ? 'ALL PASS' : fail + ' FAILED'} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})();
