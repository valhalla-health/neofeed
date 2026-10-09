// verify-ios-input-zoom-1009.cjs — no text field on a phone or a touch screen is under 16px.
//
// Pp, 2026-10-09, from an iPhone, with a screenshot of the topbar's patient search open:
// "หน้าล้นใน iphone 18 และยังไม่เห็นปุ่ม ขอความช่วยเหลือที่ให้ส่ง email".
//
// iOS zooms the page in when a text field under 16px takes focus, and it does not zoom
// back out when the field lets go. The phone block's 16px rule named two classes, .inp and
// .sel, and the topbar's patient search carries neither: it was 14px. Tapping it zoomed the
// page by 16/14 (the screenshot's bed chips are 1.16× their size at 402px). That cut the
// sheet's Close button and the weights off at the right edge, and the zoom outlived the
// sheet, leaving the avatar, the only way into the user menu and its 💬 ขอความช่วยเหลือ,
// past the right edge of the screen. The quick calc's DOL box (15px) did the same.
// Chromium never zooms on focus, so the phone sweeps, all Chromium, could not see it.
// This harness measures the font size, which is what iOS reads.
//
// Writing this harness found one more thing on the same path: on a phone turned sideways
// (402px tall) the help form is about 430px tall, so its ส่ง and ยกเลิก sat below the edge
// with nothing to scroll. A dialog is now capped at the screen and its body scrolls.
//
//   1. Both shells: one rule, keyed on the element instead of a class list, sets every text
//      field to 16px on a phone (≤767px) and on any touch screen, since a phone turned
//      sideways is wider than 767px. On a phone the avatar is a 44px target. A dialog is
//      never taller than the screen, and its body scrolls.
//   2. In Chromium, when playwright is installed: every visible text field on every screen
//      that has one is ≥16px at six phone sizes and a landscape iPhone. The avatar is a 44px
//      target inside the screen, and so is the help item in its menu; the help form's ส่ง
//      button is on screen. A desktop with a mouse keeps its 14px search.
//   3. Negative control: the shell with the old class-list rule put back shows the topbar
//      search at 14px, and section 2's check catches it.
// CI installs no browser, so there sections 2 and 3 are a notice, as in verify-phone-sweep.cjs.
//   node test/verify-ios-input-zoom-1009.cjs
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

// The rule, as the shells carry it. Section 3 swaps it for the old one.
const TOUCH_MEDIA = '@media (max-width: 767px), (hover: none) and (pointer: coarse) {';
const FIELD_SELECTOR = ['input:not([type="checkbox"]):not([type="radio"]):not([type="range"])', 'textarea', 'select', '.inp', '.sel'];

// ══ 1 · the rule, in both shells ═══════════════════════════════════════════════
console.log('\n── #1 every text field is 16px on a phone and on a touch screen, in both shells ──');
for (const shell of ['NeoFeed.html', 'index.html']) {
  const css = read(shell).match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, '');
  const at = css.indexOf(TOUCH_MEDIA);
  const block = at < 0 ? '' : css.slice(at + TOUCH_MEDIA.length, css.indexOf('\n  }', at));
  ok(`${shell}: a block for phones and touch screens: ${TOUCH_MEDIA}`, at >= 0);
  const rule = [...block.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .map(m => ({ sel: m[1].split(',').map(s => s.trim()), body: m[2] }))
    .find(r => /font-size:\s*16px\s*!important/.test(r.body));
  ok(`${shell}: …in it, font-size: 16px !important`, !!rule, block.slice(0, 300));
  for (const s of FIELD_SELECTOR) {
    ok(`${shell}: …for ${s}`, !!rule && rule.sel.includes(s), rule && rule.sel);
  }
  // Keyed on the element: a field with no class is covered. The old rule was a class list.
  ok(`${shell}: …so a field with neither .inp nor .sel is covered (the old rule named only the classes)`,
    !!rule && rule.sel.some(s => /^input\b/.test(s)) && rule.sel.includes('textarea') && rule.sel.includes('select'));
  const phone = [...css.matchAll(/@media \(max-width: 767px\) \{([\s\S]*?)\n  \}/g)].map(m => m[1]).join('\n');
  ok(`${shell}: the phone block no longer carries its own class-list 16px rule`,
    !/\.inp,\s*\.sel\s*\{\s*font-size:\s*16px/.test(phone));
  const user = [...phone.matchAll(/(^|[\n}])\s*\.user\s*\{([^}]*)\}/g)].map(m => m[2]).join(';');
  ok(`${shell}: on a phone the avatar, the way into the user menu, is a 44px target`,
    /min-width:\s*44px/.test(user) && /min-height:\s*44px/.test(user), user);
  const base = (sel) => [...css.matchAll(new RegExp(`\\n  \\${sel}\\s*\\{([^}]*)\\}`, 'g'))].map(m => m[1]).join(';');
  ok(`${shell}: a dialog is never taller than the screen, and lays out as a column`,
    /max-height:\s*90dvh/.test(base('.modal-box')) && /flex-direction:\s*column/.test(base('.modal-box')), base('.modal-box'));
  ok(`${shell}: …its body scrolls and may shrink, so the head and the buttons stay on screen`,
    /overflow-y:\s*auto/.test(base('.modal-body')) && /min-height:\s*0/.test(base('.modal-body')), base('.modal-body'));
  ok(`${shell}: …and on a phone it stops below the screen's top, as the picker sheet does`,
    /max-height:\s*82dvh/.test([...phone.matchAll(/(^|[\n}])\s*\.modal-box\s*\{([^}]*)\}/g)].map(m => m[2]).join(';')));
}
{
  // The two fields the old rule missed: they still carry no .inp, so only the element rule covers them.
  const app = read('app.jsx'), reg = read('registry.jsx');
  ok('registry.jsx: the topbar patient search is still a bare <input> (the element rule is what covers it)',
    /<input aria-label="ค้นหาผู้ป่วย"(?![^>]*className)/.test(reg));
  ok('app.jsx: the quick calc DOL box is still className="num" (likewise)',
    /<input id="quick-dol-input" className="num"/.test(app));
}

// ══ 2 · in Chromium ═══════════════════════════════════════════════════════════
const DEVICES = [
  // [name, width, height, touch]. 402 is Pp's iPhone: her screenshot is 1206 px wide at 3×.
  ['Pp\'s iPhone (402)', 402, 874, true], ['iPhone SE 2/3', 375, 667, true], ['Galaxy Z Fold cover', 280, 653, true],
  ['Galaxy A-series', 360, 800, true], ['iPhone Air (420)', 420, 912, true], ['iPhone Pro Max (440)', 440, 956, true],
  ['landscape iPhone (874)', 874, 402, true],
];
const DESKTOP = ['desktop, mouse', 1440, 900, false];

const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const add = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const mk = (sessionId, name, bed, bw, dx, days) => ({ sessionId, name, initials: name, bw, ga: 31.2, sex: 'girls',
  dob: add(today, -days), admissionDate: add(today, -days), twinSuffix: '', status: 'Active', currentBed: bed, diagnosis: dx,
  weights: [{ dol: 1, w: bw }], lengths: [{ dol: 1, l: 40 }], hcs: [{ dol: 1, hc: 28 }], bedHistory: [], statusDate: '',
  multiplesCount: 0 });
const PATIENTS = [mk('บศ-BW1180', 'บว ศว', 'NICU 1', 1180, 'RDS', 20), mk('MO-BW1300', 'MO', 'NICU 2', 1300, 'VLBW', 12),
  mk('นจ-BW1500', 'นฝ จด', 'NICU 3', 1500, 'TTNB', 5)];
function backend(b) {
  if (b.action === 'login') return { status: 'ok', token: 't', email: 'doc@x', role: 'doctor', name: 'Doc', authMethod: 'password' };
  if (b.action === 'getActivePatients') return { patients: PATIENTS, log: {}, ts: new Date().toISOString() };
  return { ok: true };
}

// Every visible field a keyboard types into, with its computed size.
const FIELDS = () => [...document.querySelectorAll('input, textarea, select')].filter(el => {
  const t = (el.getAttribute('type') || 'text').toLowerCase();
  if (['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color', 'file', 'hidden', 'image'].includes(t)) return false;
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden';
}).map(el => ({ field: `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}`
  + ` «${el.getAttribute('aria-label') || el.id || el.placeholder || el.name || ''}»`, px: parseFloat(getComputedStyle(el).fontSize) }));
// page.evaluate passes one argument: a selector, or [selector, text the element must contain].
const BOX = (q) => {
  const [sel, text] = Array.isArray(q) ? q : [q];
  const el = [...document.querySelectorAll(sel)].find(e => !text || (e.textContent || '').includes(text));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight };
};
const inside = (b) => !!b && b.left >= 0 && b.top >= 0 && b.right <= b.vw + 0.5 && b.bottom <= b.vh + 0.5;

async function visit(browser, BASE, file, [name, W, H, touch], only) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch && W < 768 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('https://accounts.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.route('**://script.google.com/**', r => {
    let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch {}
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(backend(b)) });
  });
  const seen = [];
  let last = 'loading';
  const look = async (screen) => { await page.waitForTimeout(350); seen.push({ screen, fields: await page.evaluate(FIELDS) }); last = screen; };
  const out = { errors, seen };
  try {
    await page.goto(BASE + '/' + file, { waitUntil: 'networkidle' });
    await page.locator('button', { hasText: 'email' }).first().click({ timeout: 5000 });
    await look('login');
    await page.locator('input[type="email"]').first().fill('doc@x');
    await page.locator('input[type="password"]').first().fill('pw');
    await page.locator('form button[type="submit"]').last().click({ timeout: 5000 });
    await page.waitForSelector('.ward-tile', { timeout: 10000 });
    await page.locator('.ward-tile').first().click();
    await page.waitForTimeout(300);
    // The bug's own screen first: the topbar's patient search, open.
    await page.locator('.switch-patient').click({ timeout: 5000 });
    await look('topbar patient search');
    await page.locator('.picker button', { hasText: 'Close' }).click({ timeout: 5000 });
    await page.waitForTimeout(200);
    if (only === 'picker') { await page.close(); return out; }
    await look('ward list');
    // The avatar, and the help item behind it.
    out.avatar = await page.evaluate(BOX, '.topbar .user');
    await page.locator('.topbar .user').click({ timeout: 5000 });
    await page.waitForTimeout(200);
    out.helpItem = await page.evaluate(BOX, ['button', 'ขอความช่วยเหลือ']);
    await page.locator('button', { hasText: 'ขอความช่วยเหลือ' }).click({ timeout: 5000 });
    await look('help request');
    out.sendBtn = await page.evaluate(BOX, ['.modal-foot button', 'ส่ง']);
    await page.locator('.modal-box button', { hasText: 'ยกเลิก' }).click({ timeout: 5000 });
    await page.waitForTimeout(200);
    await page.locator('button', { hasText: 'New session' }).click({ timeout: 5000 });
    await look('register');
    await page.locator('.picker .icon-btn').first().click({ timeout: 5000 });
    await page.waitForTimeout(200);
    await page.locator('.quick-fab').click({ timeout: 5000 });
    await look('quick calc');
    await page.locator('button', { hasText: 'กลับไป Ward' }).click({ timeout: 5000 });
    await page.waitForTimeout(300);
    await (W < 768 ? page.locator('.patient-mc').first().locator('button', { hasText: 'Open' })
                   : page.locator('tr button', { hasText: 'Open' }).first()).click({ timeout: 5000 });
    await page.waitForTimeout(300);
    if (W < 768) await page.locator('.bottom-nav button[aria-label="Calc"]').click({ timeout: 5000 });
    else await page.locator('.rail-item', { hasText: 'Calculator' }).first().click({ timeout: 5000 });
    await page.locator('button', { hasText: 'Open all' }).first().click({ timeout: 5000 });
    await look('calculator, every step open');
  } catch (e) {
    out.error = `after ${last}: ${e.message.split('\n')[0]}`;
  }
  await page.close();
  return out;
}

async function run() {
  let chromium;
  try { chromium = require('playwright').chromium; }
  catch { console.log('\n  SKIP  playwright not installed — section 1 only'); return; }
  const exe = ['/opt/pw-browsers/chromium', undefined].find(p => p === undefined || fs.existsSync(p));
  let browser;
  try { browser = await chromium.launch(exe ? { executablePath: exe } : {}); }
  catch (e) { console.log('\n  SKIP  could not launch Chromium (' + e.message.split('\n')[0] + ')'); return; }

  // Section 3's shell: the element rule swapped back for the old class list.
  const shell = read('index.html');
  const OLD = shell.replace(/\n  @media \(max-width: 767px\), \(hover: none\) and \(pointer: coarse\) \{[\s\S]*?\n  \}/,
    '\n  @media (max-width: 767px) {\n    .inp, .sel { font-size: 16px !important; }\n  }');
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  // path.join(DIR), not DIR: see verify-phone-sweep.cjs (Windows separators).
  const ROOT = path.join(DIR);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    if (p === '/old-rule.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(OLD); return; }
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' }); res.end(fs.readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}`;

  console.log('\n── #2 every text field on every screen is ≥16px on a phone; the help menu is on screen ──');
  for (const d of DEVICES) {
    const r = await visit(browser, BASE, '', d);
    ok(`${d[0]}: every screen reached`, !r.error, r.error);
    ok(`${d[0]}: no page errors`, r.errors.length === 0, r.errors);
    for (const { screen, fields } of r.seen) {
      const small = fields.filter(f => f.px < 16);
      ok(`${d[0]} · ${screen}: ${fields.length} text field(s), none under 16px`, fields.length > 0 && small.length === 0,
        small.length ? small : 'no fields seen');
    }
    ok(`${d[0]}: the avatar is inside the screen`, inside(r.avatar), r.avatar);
    ok(`${d[0]}: …and at least 44×44`, !!r.avatar && r.avatar.w >= 44 && r.avatar.h >= 44, r.avatar);
    ok(`${d[0]}: the menu's 💬 ขอความช่วยเหลือ is inside the screen, 44px tall`, inside(r.helpItem) && r.helpItem.h >= 44, r.helpItem);
    ok(`${d[0]}: the help form's ส่ง button is inside the screen`, inside(r.sendBtn), r.sendBtn);
  }
  {
    // A mouse never zooms, so a workstation keeps the denser 14px search.
    const r = await visit(browser, BASE, '', DESKTOP, 'picker');
    const search = ((r.seen.find(s => s.screen === 'topbar patient search') || { fields: [] }).fields)
      .filter(f => f.field === 'input «ค้นหาผู้ป่วย»');
    ok('desktop, mouse: the topbar search stays 14px', search.length === 1 && search[0].px === 14, search);
  }

  console.log('\n── #3 negative control: the old class-list rule put back ──');
  ok('the old rule was swapped in', OLD !== shell && !OLD.includes('(hover: none) and (pointer: coarse) {\n    input:not('));
  {
    const r = await visit(browser, BASE, 'old-rule.html', DEVICES[0], 'picker');
    const search = ((r.seen.find(s => s.screen === 'topbar patient search') || { fields: [] }).fields)
      .filter(f => f.field === 'input «ค้นหาผู้ป่วย»');
    ok('with it, the topbar search on Pp\'s iPhone is 14px again, which iOS zooms on', search.length === 1 && search[0].px === 14, search);
    ok('…and section 2\'s check would fail on it', search.some(f => f.px < 16));
  }
  await browser.close();
  server.close();
}

run().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}).catch(e => { console.error(e); process.exit(1); });
