// End-to-end runthrough of the real NeoFeed app in Chromium.
//
// The repo is served statically as-is (no file edits). Two things the sandbox
// can't reach are intercepted and answered locally:
//   • unpkg.com  → React/ReactDOM/Babel UMD bundles from node_modules
//   • the GAS URL → an in-process fake backend that mirrors gas-backend.gs's
//     response shapes and records every write it receives
// Everything else — data.js, calculator.jsx, log.jsx, registry.jsx, app.jsx —
// is the actual shipped code.
// CommonJS on purpose, like every other harness here: `node` honours NODE_PATH
// for require() but not for ESM import, and the documented way to run these is
// to install the dev dependencies into a scratch folder and point NODE_PATH at
// it (see README). Top-level await lives in the async main() at the bottom.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const require_ = require;
const HERE = __dirname;
const REPO = path.join(HERE, '..');
const OUT  = process.argv[2] || path.join(HERE, '.screenshots');
fs.mkdirSync(OUT, { recursive: true });

// The three CDN bundles index.html pins, resolved out of node_modules. They
// must be the EXACT pinned versions: index.html carries SRI integrity hashes,
// so a different build is rejected by the browser — which doubles as a check
// that those hashes still match the versions named in the script tags.
// Resolved via the package's own root rather than a deep subpath: React's
// package.json "exports" map does not expose umd/, so require.resolve() on
// the file directly is rejected.
const umdPath = (pkg, sub) =>
  path.join(path.dirname(require_.resolve(pkg + '/package.json')), sub);

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(52)} got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
};
const ok_ = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name.padEnd(52)}${cond ? '' : '  ' + JSON.stringify(detail)}`);
  cond ? pass++ : fail++;
};

async function main() {
// ── static server for the repo ────────────────────────────────────────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.jsx': 'text/babel',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(REPO, p);
  if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('nope'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
  res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ── fake GAS backend ──────────────────────────────────────────────────────
// Patient "Fo" reproduces the reported record: admitted 2026-08-01, and two
// Daily_Log rows whose stored `dol` disagrees with their own date (written
// before the admission date existed). The 08-15 row carries real I/O figures.
const patients = [{
  sessionId: 'FO-1', name: 'Fo', initials: 'Fo', bw: 2025, ga: 33.1, sex: 'girls',
  dob: '2026-07-01', admissionDate: '2026-08-01', twinSuffix: '', status: 'Active',
  currentBed: 'NICU 1-1',            // ← legacy bed label, as stored today
  diagnosis: 'RDS', weights: [{ dol: 1, w: 2025 }, { dol: 15, w: 1930 }],
  lengths: [], hcs: [], bedHistory: [], statusDate: '', multiplesCount: 0,
}];
const mkEntry = (o) => ({
  ts: o.ts, dol: o.dol, weight: o.weight, fluid: o.fluid, gir: o.gir, pro: o.pro,
  kcal: o.kcal, na: 2, k: 2, ca: 60, p: 40, enVolPerKg: o.en || 0,
  route: o.route, status: 'submitted', submittedBy: 'nurse@x', entryId: o.entryId,
  lastModified: 'lm-' + o.entryId, lastModifiedBy: 'nurse@x',
  ioInput: o.ioInput || 0, ioOutput: o.ioOutput || 0, drainContent: o.drain || 0,
  calcInput: {
    wtG: o.weight, fluidTargetPerKg: o.fluid, otherIV_mL: 0, drug_mL: 9,
    ioInput: o.ioInput || 0, ioOutput: o.ioOutput || 0, drainContent: o.drain || 0,
    totalTPN_mL: o.tpn || 0, dexPct: 10, aaPerKg: 3, enVol: 0, enFreq: 0,
  },
});
const log = { 'FO-1': [
  mkEntry({ entryId: 'e1', ts: '2026-08-01', dol: 1,  weight: 1930, fluid: 78,  gir: 0,   pro: 0,   kcal: 20, route: 'NPO' }),
  mkEntry({ entryId: 'e2', ts: '2026-08-09', dol: 1,  weight: 2025, fluid: 117, gir: 3.3, pro: 2.7, kcal: 80, route: 'TPN central', tpn: 200, ioInput: 237, ioOutput: 150, drain: 0 }),
  mkEntry({ entryId: 'e3', ts: '2026-08-11', dol: 3,  weight: 2025, fluid: 120, gir: 1.6, pro: 2.0, kcal: 75, route: 'TPN central', tpn: 200, ioInput: 243, ioOutput: 160, drain: 8 }),
  mkEntry({ entryId: 'e4', ts: '2026-08-12', dol: 12, weight: 2025, fluid: 116, gir: 0.8, pro: 1.2, kcal: 70, route: 'TPN central', tpn: 190 }),
  mkEntry({ entryId: 'e5', ts: '2026-08-15', dol: 15, weight: 1930, fluid: 118, gir: 0,   pro: 2.8, kcal: 90, route: 'Enteral only', ioInput: 214, ioOutput: 143, drain: 12 }),
] };
const received = [];

function backend(body) {
  const a = body.action;
  if (a === 'login') return { status: 'ok', token: 'tok', email: 'admin@x', role: 'admin', name: 'Admin', authMethod: 'password' };
  if (a === 'getActivePatients') return { patients, log, ts: new Date().toISOString() };
  if (a === 'acquireLogLock') return { ok: true };
  if (a === 'releaseLogLock') return { ok: true };
  if (a === 'updateDailyNutrition') {
    received.push(body);
    const row = log[body.sessionId].find(e => e.entryId === body.entryId);
    if (!row) return { error: 'not found' };
    // Mirror the real backend: the entry's own I/O columns and calcInput are
    // both persisted, and lastModified moves on.
    Object.assign(row, body.entry, { lastModified: 'lm2-' + body.entryId });
    return { ok: true, lastModified: row.lastModified };
  }
  if (a === 'logDailyNutrition') {
    received.push(body);
    const entryId = 'new-' + (log[body.sessionId].length + 1);
    log[body.sessionId].push({ ...body.entry, entryId, lastModified: 'lm-' + entryId });
    return { ok: true, entryId, lastModified: 'lm-' + entryId };
  }
  if (a === 'registerPatient' || a === 'updatePatient') {
    received.push(body);
    const i = patients.findIndex(p => p.sessionId === body.patient.sessionId);
    if (i >= 0) patients[i] = body.patient; else patients.push(body.patient);
    return { ok: true };
  }
  if (a === 'updateWeights') { received.push(body); return { ok: true }; }
  return { error: 'Unknown action: ' + a };
}

// ── browser ───────────────────────────────────────────────────────────────
// Prefer whatever Playwright installed; fall back to a preinstalled Chromium
// (NEOFEED_CHROME, or the usual PLAYWRIGHT_BROWSERS_PATH layout).
function findChrome() {
  if (process.env.NEOFEED_CHROME) return process.env.NEOFEED_CHROME;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !fs.existsSync(root)) return undefined;
  const dir = fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort().pop();
  const exe = dir && path.join(root, dir, 'chrome-linux', 'chrome');
  return exe && fs.existsSync(exe) ? exe : undefined;
}
let browser;
try { browser = await chromium.launch(); }
catch { browser = await chromium.launch({ executablePath: findChrome() }); }
const page = await browser.newPage({ viewport: { width: 430, height: 900 } });  // phone-sized: this is a bedside app

const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const failedReqs = [];
page.on('requestfailed', r => failedReqs.push(r.url() + ' — ' + (r.failure()?.errorText || '')));

const UMD = {
  'react.production.min.js': umdPath('react', 'umd/react.production.min.js'),
  'react-dom.production.min.js': umdPath('react-dom', 'umd/react-dom.production.min.js'),
  'babel.min.js': umdPath('@babel/standalone', 'babel.min.js'),
};
await page.route('**://unpkg.com/**', route => {
  const hit = Object.keys(UMD).find(k => route.request().url().endsWith(k));
  if (!hit) return route.fulfill({ status: 404, body: '' });
  route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(UMD[hit], 'utf8') });
});
await page.route('https://accounts.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
await page.route('**://script.google.com/**', route => {
  let body = {};
  try { body = JSON.parse(route.request().postData() || '{}'); } catch {}
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(backend(body)) });
});

const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });

await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// ── log in ────────────────────────────────────────────────────────────────
console.log('\n── login ──');
await page.locator('button', { hasText: 'email' }).first().click();
await page.waitForTimeout(500);
await page.locator('input[type="email"], input[placeholder*="email" i]').first().fill('admin@x');
await page.locator('input[type="password"]').first().fill('pw');
await page.locator('form button[type="submit"], button:has-text("เข้าสู่ระบบ")').last().click();
await page.waitForTimeout(1500);
await shot('01-registry');
ok_('logged in, registry visible', await page.getByText('Patient registry').isVisible().catch(() => false));

// ── #1 bed label ──────────────────────────────────────────────────────────
console.log('\n── bed label on the registry card ──');
const cardBed = await page.locator('.patient-mc .pmc-row').nth(1).locator('.chip').first().innerText().catch(() => '');
eq('stored "NICU 1-1" displays as', cardBed.trim(), 'NICU 1');
// Rendered text only — Babel-standalone injects each .jsx module's compiled
// source (comments and all) back into the DOM, so page.content() contains
// registry.jsx's own comments about the bug and can't be used here.
{
  const txt = await page.locator('body').innerText();
  ok_('no "NICU 1-1" in any visible text', !txt.includes('NICU 1-1'),
    txt.split('\n').filter(l => l.includes('NICU 1-1')));
}

// bed picker in the edit modal
await page.locator('.patient-mc').first().getByRole('button', { name: /edit/i }).click().catch(async () => {
  await page.locator('button:has-text("Edit")').first().click();
});
await page.waitForTimeout(600);
await shot('02-edit-modal');
const bedSel = page.locator('select').filter({ has: page.locator('option', { hasText: 'NICU 1' }) }).first();
eq('edit modal preselects the canonical bed', await bedSel.inputValue(), 'NICU 1');
const opts = await bedSel.locator('option').allTextContents();
ok_('picker offers only defined beds + unassigned',
  opts.every(o => /^(NICU|SCN) \d+$|^iso \d-\d$|ยังไม่ระบุเตียง/.test(o.trim())), opts);
eq('picker option count (30 beds + unassigned)', opts.length, 31);
await page.keyboard.press('Escape');
await page.locator('button:has-text("Cancel")').first().click().catch(() => {});
await page.waitForTimeout(400);

// ── #2 DOL ────────────────────────────────────────────────────────────────
console.log('\n── DOL in the daily log ──');
await page.locator('.patient-mc').first().click();
await page.waitForTimeout(800);
await page.locator('.bottom-nav button, nav button').filter({ hasText: /Dashboard/i }).first().click().catch(() => {});
await page.waitForTimeout(1000);
await shot('03-dashboard');

const rows = await page.locator('table.tbl tbody tr').evaluateAll(trs =>
  trs.map(tr => [...tr.children].slice(0, 3).map(td => td.textContent.trim())));
console.log('    DOL | Day admit | Date');
rows.forEach(r => console.log(`     ${r[0].padStart(2)} |    ${r[1].padStart(2)}     | ${r[2]}`));
eq('rows are newest-date first, DOL matches date',
  rows.map(r => r[0]), ['15', '12', '11', '9', '1']);
eq('day-of-admission column agrees',
  rows.map(r => r[1]), ['14', '11', '10', '8', '0']);

// header DOL for today (2026-08-17 is "today" only if the clock says so, so
// just assert it is >= the newest row and consistent with the admission date)
const strip = await page.locator('body').innerText();
const headerDol = (strip.match(/DOL\s+(\d+)/) || [])[1];
ok_('patient header DOL >= newest log row', Number(headerDol) >= 15, headerDol);

// ── #3 I/O + drain ────────────────────────────────────────────────────────
console.log('\n── Intake / Output + drain, reopening the 15 ส.ค. entry ──');
await page.locator('table.tbl tbody tr').first().click();
await page.waitForTimeout(1200);
await shot('04-calculator-io');

async function ioFields() {
  return page.evaluate(() => {
    const out = {};
    for (const f of document.querySelectorAll('.field')) {
      const l = f.querySelector('label')?.textContent || '';
      if (/^Input/.test(l)) out.input = f.querySelector('input').value;
      if (/^Urine output/.test(l)) out.urine = f.querySelector('input').value;
      if (/^Drain content/.test(l)) out.drain = f.querySelector('input').value;
    }
    const bal = [...document.querySelectorAll('div')].map(d => d.textContent)
      .filter(t => t && t.startsWith('Balance ')).pop();
    return { ...out, balance: bal ? bal.trim() : null };
  });
}
const io1 = await ioFields();
eq('Input restored from the saved entry', io1.input, '214');
eq('Urine output restored',               io1.urine, '143');
eq('Drain content restored',              io1.drain, '12');
ok_('balance = input − urine − drain (214−143−12 = +59)',
  (io1.balance || '').includes('+59'), io1.balance);
ok_('divisor hint names which weight it used',
  /divisor .* g \((today|previous day|birth weight)\)/.test(io1.balance || ''), io1.balance);

// change drain, save, and check what actually reached the backend
console.log('\n── editing drain and saving ──');
const drainInput = page.locator('.field', { has: page.locator('label:text-matches("^Drain content")') }).locator('input');
await drainInput.fill('30');
await page.waitForTimeout(400);
const io2 = await ioFields();
eq('drain accepted', io2.drain, '30');
ok_('balance recomputed (214−143−30 = +41)', (io2.balance || '').includes('+41'), io2.balance);

await page.locator('button:has-text("บันทึก"), button:has-text("Save")').first().click();
await page.waitForTimeout(1500);
await shot('05-after-save');

const saved = received.filter(r => r.action === 'updateDailyNutrition').pop();
ok_('a save reached the backend', !!saved);
if (saved) {
  eq('saved ioInput',      saved.entry.ioInput, 214);
  eq('saved ioOutput',     saved.entry.ioOutput, 143);
  eq('saved drainContent', saved.entry.drainContent, 30);
  eq('saved dol re-derived from the row date', saved.entry.dol, 15);
  eq('saved ts unchanged',  saved.entry.ts, '2026-08-15');
  eq('calcInput carries I/O too',
    [saved.entry.calcInput.ioInput, saved.entry.calcInput.ioOutput, saved.entry.calcInput.drainContent],
    [214, 143, 30]);
}

// reopen and confirm it round-trips
console.log('\n── reopening the same entry ──');
await page.locator('.bottom-nav button, nav button').filter({ hasText: /Dashboard/i }).first().click().catch(() => {});
await page.waitForTimeout(900);
await page.locator('table.tbl tbody tr').first().click();
await page.waitForTimeout(1200);
const io3 = await ioFields();
eq('Input round-trips',  io3.input, '214');
eq('Urine round-trips',  io3.urine, '143');
eq('Drain round-trips',  io3.drain, '30');
await shot('06-reopened');

// a row that had NO drain must not inherit one
console.log('\n── a different entry does not inherit the edited values ──');
await page.locator('.bottom-nav button, nav button').filter({ hasText: /Dashboard/i }).first().click().catch(() => {});
await page.waitForTimeout(900);
await page.locator('table.tbl tbody tr').nth(1).click();   // 12 ส.ค. — no I/O recorded
await page.waitForTimeout(1200);
const io4 = await ioFields();
eq('12 ส.ค. row keeps its own (empty) I/O', [io4.input, io4.urine, io4.drain], ['', '', '']);
await shot('07-other-entry');

console.log('\n── page errors ──');
// Two external resources are unreachable in this sandbox and are expected to
// fail: Google Identity Services (so the login screen's Google button is dead
// here — hence the email/password path above) and Google Fonts (the app falls
// back to system fonts). Anything else failing is a real finding.
const EXPECTED_OFFLINE = /accounts\.google\.com|fonts\.(googleapis|gstatic)\.com/;
ok_('only expected-offline resources failed',
  failedReqs.every(u => EXPECTED_OFFLINE.test(u)), failedReqs);
const realErrors = errors.filter(e => !/ERR_CONNECTION_RESET|ERR_FAILED|net::/.test(e));
ok_('no uncaught page errors', realErrors.length === 0, realErrors.slice(0, 5));

await browser.close();
server.close();
console.log(`\n${fail === 0 ? 'RUNTHROUGH: ALL PASS' : `RUNTHROUGH: ${fail} FAILED`} (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
