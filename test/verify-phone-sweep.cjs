// verify-phone-sweep.cjs — nothing on any phone is cut off, out of reach, or dragged sideways.
//
// Pp, 2026-09-25, after the Android step-clipping fix: "Check ด้วย ว่า all phone
// จะไม่มีปัญหาการเลื่อนหน้าจอแบบเดียวกัน". The reported bug was one box that cut
// its own content off with nothing to scroll to (a calculator step capped at
// 1800px). This harness looks for that whole class, on the real app, on every
// screen a nurse or doctor uses, at 24 device profiles:
//   - portrait phones from the 280px Galaxy Z Fold cover to the 440px iPhone 16
//     Pro Max;
//   - landscape phones, and three tablets;
//   - three phones with text at 130%. A phone's text-size setting enlarges
//     text laid out in px, so it is modelled as the content drawn 1.3×. The
//     sheets are left out of that mode: CSS zoom there confuses the browser's
//     own hit-testing.
// On each screen it asks three things:
//   1. CLIPPED: does any box with overflow hidden hold content larger than
//      itself? That content is cut off with nothing to scroll to, which is what
//      "เลื่อนแล้วไม่เต็มช่อง" was. A closed calculator step is exempt: it is
//      invisible, 0px tall, and the user opens it.
//   2. REACH: scrolled to the end, can the lowest piece of content actually be
//      tapped? This is a hit-test, so the tab bar, the Calculator button and a
//      modal's backdrop are all accounted for in their real stacking order.
//   3. SIDEWAYS: does the document, or the workspace scroller, drag sideways?
//
// The first run found, beyond the calculator step:
// - the login's footer lying on the sign-in button on a landscape phone, so
//   nobody could sign in with the phone turned sideways;
// - the icon rail cut off on a landscape phone;
// - the patient strip clipping the weight on 280–440px phones;
// - four calculator grids clipping on a 280px phone or with large text;
// - the ward and Dashboard tables dragging the screen sideways from 768px up.
// Section 1 pins each fix in the CSS, and runs everywhere. Section 2 is the
// sweep, run when playwright is installed. CI installs no browser, so there it
// is a notice, like verify-mobile-fit.cjs. Section 3 is its negative control:
// the old 1800px rule put back must be caught.
//   node test/verify-phone-sweep.cjs
const fs = require('fs');
const path = require('path');
const http = require('http');

const DIR = path.join(__dirname, '..') + '/';
const read = (f) => fs.readFileSync(DIR + f, 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + JSON.stringify(detail === undefined ? '' : detail).slice(0, 400)}`);
  cond ? pass++ : fail++;
}

// ══ 1 · the fixes, pinned in the shells ════════════════════════════════════
console.log('\n── #1 each fix the sweep found, in both shells ──');
for (const shell of ['NeoFeed.html', 'index.html']) {
  const css = read(shell).match(/<style>([\s\S]*?)<\/style>/)[1];
  const rules = (sel) => [...css.matchAll(new RegExp(`(^|[\\n}])\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g'))].map(m => m[2]);
  const wrap = (/\n  \.login-wrap\s*\{([\s\S]*?)\n  \}/.exec(css)?.[1] || '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(`${shell}: the login column is not centred by justify-content (it pushes a tall column past the top)`,
    /justify-content:\s*flex-start/.test(wrap) && !/justify-content:\s*center/.test(wrap), wrap.slice(-900));
  ok(`${shell}: …the first child's and the footer's auto margins centre it instead`,
    rules('.login-wrap > :first-child').some(r => /margin-top:\s*auto/.test(r))
    && rules('.login-contact').some(r => /margin-top:\s*auto/.test(r)));
  ok(`${shell}: the login footer is in the flow, not laid over the form`,
    rules('.login-contact').every(r => !/position:\s*absolute/.test(r)), rules('.login-contact'));
  const tablet = /@media \(min-width: 768px\) and \(max-width: 1199px\) \{([\s\S]*?)\n  \}/.exec(css)?.[1] || '';
  ok(`${shell}: the icon rail can scroll on a short screen (no overflow: hidden)`,
    /\.rail\s*\{[^}]*overflow-y:\s*auto/.test(tablet) && !/\.rail\s*\{[^}]*overflow:\s*hidden/.test(tablet), tablet.slice(0, 300));
  ok(`${shell}: a wide table scrolls inside its card, never the page`,
    rules('.patient-table, .tbl-scroll').some(r => /overflow-x:\s*auto/.test(r)));
  const phone = [...css.matchAll(/@media \(max-width: 767px\) \{([\s\S]*?)\n  \}/g)].map(m => m[1]).join('\n');
  for (const sel of ['.patient-strip', '.metric-tiles-4', '.two-col', '.s1-grid', '.s2-aa-row', '.s2-lip-row', '.en-fields-row', '.salt-row-grid']) {
    const r = new RegExp(`\\${sel}\\s*\\{[^}]*grid-template-columns:([^;}]*)`).exec(phone)?.[1] || '';
    ok(`${shell}: on a phone, ${sel}'s columns can shrink below their content (minmax(0, …), no bare 1fr)`,
      r && !/(^|[\s,(])1fr/.test(r.replace(/minmax\(0,\s*1fr\)/g, '')), r);
  }
}
{
  const calc = read('calculator.jsx'), app = read('app.jsx'), log = read('log.jsx');
  ok('calculator.jsx: TwoCol\'s left column can shrink', /gridTemplateColumns: "minmax\(0, 1fr\) 280px"/.test(calc));
  ok('calculator.jsx: a field label can break before its unit', /<label>\{label\}\{unit && <><wbr \/><span className="unit">/.test(calc));
  ok('calculator.jsx: the GIR number can drop its unit to the next line', /\{fmt\(calc\.gir,1\)\}<wbr \/>/.test(calc));
  // The four grids the sweep caught clipping on a 280px phone or with large text.
  ok('calculator.jsx: the EN fields, TPN volume/rate, dextrose/GIR and AA grids can shrink',
    /className="en-fields-row" style=\{\{ display: "grid", gridTemplateColumns: "repeat\(3, minmax\(0, 1fr\)\)"/.test(calc)
    && /gridTemplateColumns:"minmax\(0,1fr\) 28px minmax\(0,1fr\)"/.test(calc)
    && /gridTemplateColumns:"minmax\(0,1fr\) minmax\(0,1fr\)", gap:10, alignItems:"start"/.test(calc)
    && /className="s2-aa-row" style=\{\{ display:"grid", gridTemplateColumns:"repeat\(3, minmax\(0, 1fr\)\)"/.test(calc));
  ok('app.jsx: the patient strip\'s weights wrap rather than clip',
    /flexDirection:"row", flexWrap:"wrap", overflow:"hidden"/.test(app) && !/whiteSpace:"nowrap" \}\}>\s*\{delta >= 0/.test(app));
  ok('app.jsx: a long diagnosis breaks inside the strip', /overflowWrap:"anywhere"/.test(app));
  ok('log.jsx: the entries table sits in a .tbl-scroll box', /<div className="tbl-scroll">\s*<table className="tbl">/.test(log));
}

// ══ 2 · the sweep ════════════════════════════════════════════════════════════
const DEVICES = [
  ['Galaxy Z Fold cover', 280, 653], ['iPhone SE (1st)', 320, 568], ['older Android', 360, 640], ['Galaxy S8/S9', 360, 740],
  ['Galaxy A-series', 360, 800], ['iPhone SE 2/3', 375, 667], ['iPhone 12/13 mini', 375, 812], ['Galaxy S21/S22', 384, 854],
  ['iPhone 12–14', 390, 844], ['iPhone 15/16', 393, 852], ['iPhone 16 Pro', 402, 874], ['Pixel 7 / Galaxy S20+', 412, 915],
  ['iPhone 11 / XR', 414, 896], ['iPhone 15 Pro Max', 430, 932], ['iPhone 16 Pro Max', 440, 956],
  ['landscape SE', 667, 375], ['landscape iPhone 14', 844, 390], ['landscape Pixel 7', 915, 412],
  ['iPad mini', 768, 1024], ['iPad Air', 820, 1180], ['Galaxy Tab', 800, 1280],
].map(d => [...d, false]).concat([
  ['Galaxy A-series · text 130%', 360, 800], ['Pixel 7 · text 130%', 412, 915], ['iPhone SE 2/3 · text 130%', 375, 667],
].map(d => [...d, true]));

// A fake backend in gas-backend.gs's reply shapes: a ward with a long
// diagnosis, a weight gained since birth, and three orders, so the strip, the
// Dashboard table, the trend graph and the growth chart all have content.
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const add = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const mk = (sessionId, name, bed, bw, dx, days) => ({ sessionId, name, initials: name, bw, ga: 29.3, sex: 'girls',
  dob: add(today, -days), admissionDate: add(today, -days), twinSuffix: '', status: 'Active', currentBed: bed, diagnosis: dx,
  weights: [{ dol: 1, w: bw }, { dol: 8, w: bw - 60 }, { dol: 15, w: bw + 90 }], lengths: [{ dol: 1, l: 38 }],
  hcs: [{ dol: 1, hc: 27 }], bedHistory: [], statusDate: '', multiplesCount: 0 });
const PATIENTS = [
  mk('รท-BW1180', 'รย ทอ', 'NICU 1', 1180, 'ELBW · RDS · PDA s/p ibuprofen · r/o NEC · hyperbilirubinemia on phototherapy', 20),
  mk('สจ-BW900', 'สม จด', 'NICU 2', 900, 'VLBW, RDS', 12), mk('นจ-BW1500', 'นฝ จด', 'NICU 3', 1500, 'TTNB', 5),
  mk('ปพ-BW1100', 'ปพ', 'NICU 4', 1100, 'Sepsis', 9), mk('กข-BW2000', 'กค จด', 'NICU 5', 2000, 'Jaundice', 3),
  mk('ทก-BW2500', 'ทอ กล', 'SCN 4', 2500, 'Feeding', 25),
];
const entry = (ts, dol, w, i) => ({ ts, dol, weight: w, fluid: 140, gir: 6.2, pro: 3.1, kcal: 95, na: 3, k: 2, ca: 60, p: 40,
  enVolPerKg: 60, route: 'TPN central', status: 'submitted', submittedBy: 'doc@x', entryId: 'e' + i, lastModified: 'lm' + i,
  lastModifiedBy: 'doc@x', ioInput: 170, ioOutput: 120, drainContent: 0,
  calcInput: { curWtG: w, wtG: w, fluidTargetPerKg: 140, totalTPN_mL: 120, dexPct: 10, aaPerKg: 3, enVol: 8, enFreq: 8 } });
const LOG = { 'รท-BW1180': [entry(add(today, -3), 18, 1210, 1), entry(add(today, -2), 19, 1230, 2), entry(add(today, -1), 20, 1250, 3)] };
function backend(b) {
  if (b.action === 'login') return { status: 'ok', token: 't', email: 'doc@x', role: 'doctor', name: 'Doc', authMethod: 'password' };
  if (b.action === 'getActivePatients') return { patients: PATIENTS, log: LOG, ts: new Date().toISOString() };
  return { ok: true };
}

// ── in-page probes ──
const PROBE = () => {
  const out = { clipped: [], sideways: 0 };
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (['INPUT', 'SELECT', 'TEXTAREA', 'OPTION'].includes(el.tagName) || el.closest('svg')) continue;
    const v = (cs.overflowY === 'hidden' || cs.overflowY === 'clip') && el.scrollHeight > el.clientHeight + 1;
    // A single-line ellipsis is truncation by design (the desktop table's diagnosis column).
    const h = (cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis';
    if (v || h) {
      const cls = String(el.className || '').trim().split(/\s+/)[0];
      out.clipped.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${v ? ` v:${el.scrollHeight}>${el.clientHeight}` : ''}${h ? ` h:${el.scrollWidth}>${el.clientWidth}` : ''} «${(el.textContent || '').trim().slice(0, 30)}»`);
    }
  }
  const d = document.documentElement, work = document.querySelector('.work');
  out.sideways = Math.max(d.scrollWidth - d.clientWidth, document.body.scrollWidth - document.body.clientWidth,
    work ? work.scrollWidth - work.clientWidth : 0);
  return out;
};
const REACH = (sel) => {
  const sc = document.querySelector(sel);
  if (!sc) return { ok: false, missing: sel };
  sc.scrollTop = sc.scrollHeight;
  let low = null;
  for (const el of sc.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
    // Content, not containers: a container's box includes the padding that clears the tab bar.
    const leaf = el.children.length === 0 || ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'svg'].includes(el.tagName);
    if (!leaf || (el.closest('svg') && el.tagName !== 'svg') || ['COL', 'COLGROUP', 'OPTION'].includes(el.tagName)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 1 || r.width < 1) continue;
    if (!low || r.bottom > low.r.bottom) low = { el, r };
  }
  if (!low) return { ok: false, why: 'no content' };
  const { el, r } = low;
  const x = Math.min(Math.max(r.left + r.width / 2, 1), window.innerWidth - 1);
  const y = r.bottom - Math.min(3, r.height / 2);
  const hit = y < window.innerHeight ? document.elementFromPoint(x, y) : null;
  return { ok: !!hit && (hit === el || el.contains(hit) || hit.contains(el)), low: (el.textContent || el.tagName).trim().slice(0, 24),
    hit: hit ? `${hit.tagName}.${String(hit.className || '').split(' ')[0]}` : 'off-screen', bottom: Math.round(r.bottom), vh: window.innerHeight };
};

async function sweepDevice(browser, BASE, [name, W, H, largeText], extraCss) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, hasTouch: W < 1024, isMobile: W < 768 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('https://accounts.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.route('**://script.google.com/**', r => {
    let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch {}
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(backend(b)) });
  });
  const results = [];
  const check = async (screen, scroller) => {
    await page.waitForTimeout(450);                           // past any 0.32s slide
    const p = await page.evaluate(PROBE);
    results.push({ screen, clipped: p.clipped, sideways: p.sideways, reach: scroller ? await page.evaluate(REACH, scroller) : { ok: true } });
  };
  const nav = async (label, rail) => {
    if (W < 768) await page.locator(`.bottom-nav button[aria-label="${label}"]`).click();
    else await page.locator('.rail-item', { hasText: rail }).first().click();
    await page.waitForTimeout(400);
  };
  try {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    if (extraCss) await page.addStyleTag({ content: extraCss });
    // Signing in is the first screen swept: on a landscape phone the footer used to take this tap.
    await page.locator('button', { hasText: 'email' }).first().click({ timeout: 5000 });
    await page.locator('input[type="email"]').first().fill('doc@x');
    await page.locator('input[type="password"]').first().fill('pw');
    await page.locator('form button[type="submit"]').last().click({ timeout: 5000 });
    await page.waitForSelector('.ward-tile', { timeout: 10000 });
    if (largeText) await page.addStyleTag({ content: '.work-inner { zoom: 1.3; }' });
    await page.locator('.ward-tile').first().click();
    await check('ward list', '.work');
    if (!largeText) {
      await page.locator('button', { hasText: 'New session' }).click({ timeout: 5000 });
      await check('register', '.picker');
      await page.locator('.picker .icon-btn').first().click({ timeout: 5000 });
      await page.waitForTimeout(200);
      await (W < 768 ? page.locator('.patient-mc').first().locator('button', { hasText: 'Edit' })
                     : page.locator('tr button', { hasText: 'Edit' }).first()).click({ timeout: 5000 });
      await check('edit', '.picker');
      await page.locator('.picker button', { hasText: 'Cancel' }).click({ timeout: 5000 });
      await page.waitForTimeout(200);
    }
    await (W < 768 ? page.locator('.patient-mc').first().locator('button', { hasText: 'Open' })
                   : page.locator('tr button', { hasText: 'Open' }).first()).click({ timeout: 5000 });
    await check('dashboard', '.work');
    await nav('Growth', 'Growth chart');
    await check('growth', '.work');
    await nav('Alerts', 'Alerts');
    await check('alerts', '.work');
    await nav('Calc', 'Calculator');
    await page.locator('button', { hasText: 'Open all' }).first().click({ timeout: 5000 });
    await check('calculator, every step open', '.work');
  } catch (e) {
    results.push({ screen: 'navigation', error: e.message.split('\n')[0] });
  }
  await page.close();
  return { errors, results };
}

async function sweep() {
  let chromium;
  try { chromium = require('playwright').chromium; }
  catch { console.log('  SKIP  playwright not installed — section 1 only'); return; }
  const exe = ['/opt/pw-browsers/chromium', undefined].find(p => p === undefined || fs.existsSync(p));
  let browser;
  try { browser = await chromium.launch(exe ? { executablePath: exe } : {}); }
  catch (e) { console.log('  SKIP  could not launch Chromium (' + e.message.split('\n')[0] + ')'); return; }
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  // path.join(DIR), not DIR: DIR ends in '/', which path.join turns into '\' on Windows, so
  // file.startsWith(DIR) refused every file there with a 404 and the sweep never got past
  // the login screen on Pp's PC (2026-09-25, PR #123 check).
  const ROOT = path.join(DIR);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' }); res.end(fs.readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}`;

  console.log('\n── #2 24 device profiles × every screen: nothing clipped, the end reachable, nothing sideways ──');
  let screens = 0;
  for (const dev of DEVICES) {
    const [name, W, H] = dev;
    const r = await sweepDevice(browser, BASE, dev);
    const tag = `${name} ${W}×${H}`;
    const nav = r.results.find(x => x.error);
    ok(`${tag}: every screen opens`, !nav && r.errors.length === 0, nav ? nav.error : r.errors);
    for (const x of r.results.filter(x => !x.error)) {
      screens++;
      const problems = [
        ...x.clipped.map(c => 'clipped ' + c),
        ...(x.sideways > 0.5 ? [`sideways +${x.sideways}px`] : []),
        ...(x.reach.ok ? [] : [`end out of reach ${JSON.stringify(x.reach)}`]),
      ];
      ok(`${tag} · ${x.screen}`, problems.length === 0, problems.slice(0, 3));
    }
  }
  console.log(`  (${screens} screens checked)`);

  // ══ 3 · negative control ═══════════════════════════════════════════════════
  // The measurement must be able to fail: the 1800px cap put back on a 360px
  // phone clips Step 3 (1943px there), and the sweep has to say so.
  console.log('\n── #3 negative control: the old 1800px cap is caught ──');
  const ctl = await sweepDevice(browser, BASE, ['Galaxy S8/S9 · old cap', 360, 740, false],
    '.accordion-body.open { max-height: 1800px !important; grid-template-rows: 1fr; } .accordion-inner { overflow: visible; } .accordion-body { overflow: hidden; }');
  const calcScreen = ctl.results.find(x => x.screen === 'calculator, every step open');
  ok('with the cap back, the calculator is reported clipped', !!calcScreen && calcScreen.clipped.some(c => /accordion-body v:/.test(c)),
    calcScreen && calcScreen.clipped);
  await browser.close();
  server.close();
}

(async () => {
  await sweep();
  console.log(`\nPHONE SWEEP: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})();
