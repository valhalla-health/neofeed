// verify-dev-local.cjs — tools/dev-local.mjs, the local run before every
// release (Pp, 2026-10-12: "ให้ dev local ก่อน deploy").
//
// The tool serves a copy of the app whose boot.js points at itself, with
// gas-backend.gs behind it in test/gas-vm-sandbox.cjs. Its one dangerous
// failure is a copy that still talks to the production backend, so:
//   #1 served  boot.js names the local server and never script.google.com;
//              the shell and every script it names load; internal files and
//              a path out of the copy do not
//   #2 backend a seeded account signs in through the real login; a wrong
//              password is refused; the six made-up infants and today's four
//              orders are there, CC's under an older CONSTANTS_VERSION
//   #3 refuses a tree whose boot.js has no NEOFEED_GAS_URL line it can
//              rewrite, rather than serve it
//   #4 stop    removes the copy
//   #5 pilot   a boot.js that names the pilot deployment (NF-05) is served
//              with it blanked, so no script.google.com URL is left in it
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + JSON.stringify(detail === undefined ? '' : detail).slice(0, 300)}`);
  cond ? pass++ : fail++;
};
const get = async (url) => { const r = await fetch(url); return { status: r.status, text: await r.text() }; };
const post = async (url, body) => (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify(body) })).json();

(async () => {
  const { start } = await import(pathToFileURL(path.join(ROOT, 'tools', 'dev-local.mjs')).href);
  const dev = await start({ tree: ROOT, port: 0, quiet: true });
  const gas = dev.url + '/gas';
  try {
    console.log('\n── #1 what it serves ──');
    const boot = await get(dev.url + '/boot.js');
    ok('1.0 boot.js names this server as the backend', boot.text.includes(`window.NEOFEED_GAS_URL = "${gas}";`));
    ok('1.1 …and never the production backend', !/script\.google\.com\/macros/.test(boot.text));
    const shell = await get(dev.url + '/');
    ok('1.2 the shell loads', shell.status === 200 && /<div id="root">/.test(shell.text));
    const scripts = [...shell.text.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]).filter(s => !/^https?:/.test(s));
    const loaded = await Promise.all(scripts.map(s => get(dev.url + '/' + s.replace(/^\.?\//, '')).then(r => r.status)));
    ok('1.3 every script the shell names loads', scripts.length >= 8 && loaded.every(s => s === 200), { scripts, loaded });
    for (const p of ['/gas-backend.gs', '/STATUS.md', '/test/gas-vm-sandbox.cjs', '/tools/dev-local.mjs']) {
      ok(`1.4 ${p} is not served`, (await get(dev.url + p)).status === 404);
    }
    // The copy lives in the temp folder: a file beside it must stay out of reach.
    const sentinel = path.join(os.tmpdir(), `neofeed-devtest-sentinel-${process.pid}.txt`);
    fs.writeFileSync(sentinel, 'outside the served copy');
    try {
      const out = await get(dev.url + '/..%2f' + path.basename(sentinel));
      ok('1.5 a path out of the copy (..%2f) is not served', out.status === 404, out.status);
    } finally { fs.rmSync(sentinel, { force: true }); }

    console.log('\n── #2 the backend behind it ──');
    const doctor = dev.accounts.find(a => a.role === 'doctor');
    ok('2.0 a doctor and a nurse account, each with a new password', dev.accounts.length === 2
      && dev.accounts.every(a => a.password.length >= 12) && dev.accounts.some(a => a.role === 'nurse'));
    const login = await post(gas, { action: 'login', email: doctor.email, password: doctor.password });
    ok('2.1 the doctor signs in through the real login', login.status === 'ok' && login.role === 'doctor' && !!login.token, login);
    const wrong = await post(gas, { action: 'login', email: doctor.email, password: doctor.password + 'x' });
    ok('2.2 a wrong password is refused', wrong.status !== 'ok', wrong);
    const sync = await post(gas, { action: 'getActivePatients', token: login.token });
    const pats = sync.patients || [];
    ok('2.3 six made-up infants, NICU 1–4 and SCN 1–2',
      JSON.stringify(pats.map(p => p.currentBed).sort()) === JSON.stringify(['NICU 1', 'NICU 2', 'NICU 3', 'NICU 4', 'SCN 1', 'SCN 2']),
      pats.map(p => p.currentBed));
    const logs = sync.logs || sync.log || {};
    const today = (sid) => (logs[sid] || []).filter(e => String(e.ts).slice(0, 10) === dev.today);
    ok('2.4 AA submitted today under this tree\'s CONSTANTS_VERSION',
      today('AA-1').length === 1 && today('AA-1')[0].status === 'submitted'
      && (today('AA-1')[0].calcInput || {}).constantsVersion === dev.constants, today('AA-1'));
    ok('2.5 BB a draft, CC submitted under an older version, DD nothing',
      today('BB-1')[0]?.status === 'draft'
      && (today('CC-1')[0]?.calcInput || {}).constantsVersion !== dev.constants && today('CC-1')[0]?.status === 'submitted'
      && today('DD-1').length === 0, { BB: today('BB-1'), CC: today('CC-1'), DD: today('DD-1') });
  } finally {
    await dev.stop();
  }

  console.log('\n── #3 a boot.js it cannot rewrite ──');
  const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'neofeed-devtest-'));
  try {
    for (const f of ['gas-backend.gs', 'data.js', 'index.html', path.join('test', 'gas-vm-sandbox.cjs')]) {
      fs.mkdirSync(path.dirname(path.join(fake, f)), { recursive: true });
      fs.copyFileSync(path.join(ROOT, f), path.join(fake, f));
    }
    fs.writeFileSync(path.join(fake, 'boot.js'),
      fs.readFileSync(path.join(ROOT, 'boot.js'), 'utf8').replace(/window\.NEOFEED_GAS_URL\s*=/, 'window.NEOFEED_GAS_URL_X ='));
    let err = null;
    try { const d = await start({ tree: fake, port: 0, quiet: true }); await d.stop(); } catch (e) { err = e; }
    ok('3.0 it refuses to start', !!err && /NEOFEED_GAS_URL/.test(err.message), err && err.message);
  } finally {
    fs.rmSync(fake, { recursive: true, force: true });
  }

  console.log('\n── #5 a boot.js that names a pilot deployment (NF-05) ──');
  const piloted = fs.mkdtempSync(path.join(os.tmpdir(), 'neofeed-devtest-'));
  try {
    for (const f of ['gas-backend.gs', 'data.js', 'index.html', path.join('test', 'gas-vm-sandbox.cjs')]) {
      fs.mkdirSync(path.dirname(path.join(piloted, f)), { recursive: true });
      fs.copyFileSync(path.join(ROOT, f), path.join(piloted, f));
    }
    const pilotUrl = 'https://script.google.com/macros/s/AKfycbPILOTdevlocaltest/exec';
    const src = fs.readFileSync(path.join(ROOT, 'boot.js'), 'utf8');
    const filled = src.replace(/window\.NEOFEED_PILOT_GAS_URL\s*=\s*"[^"]*";/, `window.NEOFEED_PILOT_GAS_URL = "${pilotUrl}";`);
    ok('5.0 (the copy under test names a pilot deployment)', filled !== src && filled.includes(pilotUrl));
    fs.writeFileSync(path.join(piloted, 'boot.js'), filled);
    const d = await start({ tree: piloted, port: 0, quiet: true });
    try {
      const served = (await get(d.url + '/boot.js')).text;
      ok('5.1 the served boot.js blanks the pilot deployment', served.includes('window.NEOFEED_PILOT_GAS_URL = "";'));
      ok('5.2 …and names no script.google.com deployment at all', !/script\.google\.com\/macros/.test(served));
    } finally { await d.stop(); }
  } finally {
    fs.rmSync(piloted, { recursive: true, force: true });
  }

  console.log('\n── #4 stop ──');
  const before = fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('neofeed-dev-')).length;
  const d2 = await start({ tree: ROOT, port: 0, quiet: true });
  const during = fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('neofeed-dev-')).length;
  await d2.stop();
  const after = fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('neofeed-dev-')).length;
  ok('4.0 the served copy exists while it runs and is gone after stop', during === before + 1 && after === before, { before, during, after });

  console.log(`\n${fail === 0 ? 'DEV-LOCAL: ALL PASS' : `DEV-LOCAL: ${fail} FAILED`} (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
