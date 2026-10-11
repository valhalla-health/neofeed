// verify-help-button-1009.cjs — the help button beside the login name, and the
// picture that can go with a help request, in a real browser.
//
// Pp, 2026-10-09: "ให้ปุ่ม help button อยู่บนขวา ใกล้ชื่อ login", then "ให้แนบรูปที่
// ครอปไว้ ได้ด้วย". She picked the form from a rendered sheet: on a phone, the
// icon and the short word ช่วยเหลือ; on a wider screen, ขอความช่วยเหลือ. The
// form logic is pinned in jsdom by verify-help-request-frontend.cjs (#5–#8);
// this harness measures what jsdom cannot: where the button lands at each
// width, and what the canvas really sends.
//
//   1. Both shells carry the same .help-btn rules, and the narrow-phone block
//      comes after the phone block, which would otherwise undo it.
//   2. In Chromium at every phone width from 280 to 440 px, a landscape phone,
//      a touch tablet and two desktops: the button is in the topbar, inside the
//      screen, clear of the patient search and the avatar, 44 px tall on a
//      touch screen, with no sideways scroll, and the NeoFeed wordmark keeps
//      its full width (the wordmark shrinks before anything overlaps, so this
//      is the check that bites). It shows ขอความช่วยเหลือ from 768 px,
//      ช่วยเหลือ from 360 px, the icon alone from 310 px, and is hidden below
//      that, where the user menu's item stays. A tap opens the form with ส่ง
//      on screen.
//   3. A real 3000 × 2000 picture carrying an EXIF block goes through the
//      form: the preview and the request hold a JPEG of 1600 × 1067 with no
//      EXIF, under 1.5 MB.
//   4. Negative control: with the narrow-phone block taken out of the shell,
//      the 320 px button squeezes the wordmark, and section 2 says so.
// CI installs no browser, so there sections 2–4 are a notice, as in
// verify-phone-sweep.cjs.
//   node test/verify-help-button-1009.cjs
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

const NARROW_HEAD = '  /* ============ HELP BUTTON ON NARROW PHONES ============ */';
const PHONE_HEAD = '  /* ============ MOBILE: ≤767px ============ */';

// ══ 1 · the rules, in both shells ═════════════════════════════════════════════
console.log('\n── #1 both shells: the .help-btn rules, the narrow-phone block after the phone block ──');
{
  const rules = (f) => read(f).match(/<style>([\s\S]*?)<\/style>/)[1].split('\n').filter(l => /help-btn|hb-short|hb-long|help-shot|help-attach/.test(l)).join('\n');
  const a = rules('index.html'), b = rules('NeoFeed.html');
  ok('index.html carries .help-btn rules', a.length > 0 && a.includes('.help-btn'));
  ok('NeoFeed.html carries the same ones, line for line', a === b);
  for (const shell of ['index.html', 'NeoFeed.html']) {
    const s = read(shell);
    ok(`${shell}: the narrow-phone block exists, after the phone block`, s.indexOf(NARROW_HEAD) > s.indexOf(PHONE_HEAD) && s.indexOf(PHONE_HEAD) > 0);
  }
}

// ══ 2–4 · in Chromium ═════════════════════════════════════════════════════════
// [name, width, height, touch, expected form: 'long' | 'short' | 'icon' | 'hidden']
const DEVICES = [
  ['Galaxy Z Fold cover (280)', 280, 653, true, 'hidden'],
  ['300', 300, 640, true, 'hidden'],
  ['310', 310, 640, true, 'icon'],
  ['iPhone SE 1st gen (320)', 320, 568, true, 'icon'],
  ['340', 340, 720, true, 'icon'],
  ['359', 359, 760, true, 'icon'],
  ['Galaxy A-series (360)', 360, 800, true, 'short'],
  ['iPhone SE 2/3 (375)', 375, 667, true, 'short'],
  ['Pp\'s iPhone (402)', 402, 874, true, 'short'],
  ['iPhone Pro Max (440)', 440, 956, true, 'short'],
  ['landscape iPhone (874)', 874, 402, true, 'long'],
  ['iPad Air (820)', 820, 1180, true, 'long'],
  ['desktop 1024, mouse', 1024, 768, false, 'long'],
  ['desktop 1440, mouse', 1440, 900, false, 'long'],
];

const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const add = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const mk = (sessionId, name, bed, bw, dx, days) => ({ sessionId, name, initials: name, bw, ga: 31.2, sex: 'girls',
  dob: add(today, -days), admissionDate: add(today, -days), twinSuffix: '', status: 'Active', currentBed: bed, diagnosis: dx,
  weights: [{ dol: 1, w: bw }], lengths: [{ dol: 1, l: 40 }], hcs: [{ dol: 1, hc: 28 }], bedHistory: [], statusDate: '',
  multiplesCount: 0 });
const PATIENTS = [mk('บศ-BW1180', 'บว ศว', 'NICU 1', 1180, 'RDS', 20), mk('MO-BW1300', 'MO', 'NICU 2', 1300, 'VLBW', 12)];

async function signedIn(browser, BASE, file, [, W, H, touch], sent) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch && W < 768 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('https://accounts.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.route('**://script.google.com/**', r => {
    let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch {}
    let reply = { ok: true };
    if (b.action === 'login') reply = { status: 'ok', token: 't', email: 'nur@x', role: 'nurse', name: 'Nurse', authMethod: 'password' };
    else if (b.action === 'getActivePatients') reply = { patients: PATIENTS, log: {}, ts: new Date().toISOString() };
    else if (b.action === 'sendHelpRequest' && sent) sent.push(b);
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) });
  });
  await page.goto(BASE + '/' + file, { waitUntil: 'networkidle' });
  await page.locator('button', { hasText: 'email' }).first().click({ timeout: 5000 });
  await page.locator('input[type="email"]').first().fill('nur@x');
  await page.locator('input[type="password"]').first().fill('pw');
  await page.locator('form button[type="submit"]').last().click({ timeout: 5000 });
  await page.waitForSelector('.ward-tile', { timeout: 10000 });
  await page.locator('.ward-tile').first().click();
  await page.waitForTimeout(300);
  return { page, errors };
}

// Where the topbar's pieces are, and which of the button's words show.
const MEASURE = () => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
  const hb = document.querySelector('.topbar .help-btn');
  const shown = (sel) => !!hb && !!hb.querySelector(sel) && getComputedStyle(hb.querySelector(sel)).display !== 'none';
  return {
    vw: innerWidth, scrollW: document.documentElement.scrollWidth,
    help: hb && getComputedStyle(hb).display !== 'none' ? box(hb) : null,
    search: box(document.querySelector('.topbar .switch-patient')),
    user: box(document.querySelector('.topbar .user')),
    brand: box(document.querySelector('.topbar .brandmark')),
    // The wordmark is 4.56em wide (index.html .nf-mark) unless its box squeezes it.
    word: (() => { const wm = document.querySelector('.topbar .brandmark .nf-mark'); if (!wm) return null;
      return { w: wm.getBoundingClientRect().width, full: 4.56 * parseFloat(getComputedStyle(wm).fontSize) }; })(),
    long: shown('.hb-long'), short: shown('.hb-short'), icon: !!hb && !!hb.querySelector('svg'),
  };
};

function checkPlacement(name, m, form, touch) {
  ok(`${name}: no sideways scroll`, m.scrollW <= m.vw, { scrollW: m.scrollW, vw: m.vw });
  ok(`${name}: the NeoFeed wordmark keeps its full width`, !!m.word && m.word.w >= m.word.full - 0.5, m.word);
  if (form === 'hidden') {
    ok(`${name}: too narrow, so the button is hidden`, m.help === null, m.help);
    return;
  }
  ok(`${name}: the button is inside the screen`, !!m.help && m.help.l >= 0 && m.help.r <= m.vw + 0.5 && m.help.t >= 0, m.help);
  ok(`${name}: …clear of the patient search`, !!m.help && !!m.search && m.help.l >= m.search.r + 4, { help: m.help, search: m.search });
  ok(`${name}: …and just left of the login name`, !!m.help && !!m.user && m.help.r <= m.user.l - 4 && m.user.l - m.help.r <= 24, { help: m.help, user: m.user });
  ok(`${name}: the wordmark is not overrun either`, !!m.brand && !!m.search && m.brand.r <= m.search.l + 0.5, { brand: m.brand, search: m.search });
  if (touch) ok(`${name}: …44 px tall on a touch screen`, !!m.help && m.help.h >= 44, m.help);
  const words = form === 'long' ? 'ขอความช่วยเหลือ' : form === 'short' ? 'ช่วยเหลือ' : 'the icon alone';
  ok(`${name}: shows ${words}`, m.icon && m.long === (form === 'long') && m.short === (form === 'short'), { long: m.long, short: m.short });
  if (form === 'icon') ok(`${name}: …as a 44 px square`, !!m.help && Math.round(m.help.w) === 44, m.help);
}

// The JPEG's own size, from its SOF marker, and whether it carries EXIF.
function jpegInfo(buf) {
  if (!(buf[0] === 0xff && buf[1] === 0xd8)) return null;
  let i = 2, exif = false, size = null;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (marker === 0xe1 && buf.slice(i + 4, i + 10).toString('latin1') === 'Exif\0\0') exif = true;
    if (marker >= 0xc0 && marker <= 0xc3) size = { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    if (marker === 0xda) break;
    i += 2 + len;
  }
  return { size, exif, bytes: buf.length };
}

async function run() {
  let chromium;
  try { chromium = require('playwright').chromium; }
  catch { console.log('\n  SKIP  playwright not installed — section 1 only'); return; }
  const exe = ['/opt/pw-browsers/chromium', undefined].find(p => p === undefined || fs.existsSync(p));
  let browser;
  try { browser = await chromium.launch(exe ? { executablePath: exe } : {}); }
  catch (e) { console.log('\n  SKIP  could not launch Chromium (' + e.message.split('\n')[0] + ')'); return; }

  // Section 4's shell: the narrow-phone block taken out.
  const shell = read('index.html');
  const a = shell.indexOf(NARROW_HEAD), b = shell.indexOf('  /* ============ iOS: NO ZOOM', a);
  const NO_NARROW = a > 0 && b > a ? shell.slice(0, a) + shell.slice(b) : shell;
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  // path.join(DIR), not DIR: see verify-phone-sweep.cjs (Windows separators).
  const ROOT = path.join(DIR);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    if (p === '/no-narrow.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(NO_NARROW); return; }
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' }); res.end(fs.readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}`;

  console.log('\n── #2 the button beside the login name, at every width ──');
  for (const d of DEVICES) {
    const [name, , , touch, form] = d;
    let page, errors;
    try { ({ page, errors } = await signedIn(browser, BASE, '', d)); }
    catch (e) { ok(`${name}: signed in`, false, e.message.split('\n')[0]); continue; }
    checkPlacement(name, await page.evaluate(MEASURE), form, touch);
    if (form === 'hidden') {
      await page.locator('.topbar .user').click({ timeout: 5000 });
      await page.waitForTimeout(150);
      const item = await page.evaluate(() => {
        const b = [...document.querySelectorAll('.topbar button')].find(x => !x.classList.contains('help-btn') && /ขอความช่วยเหลือ/.test(x.textContent));
        if (!b) return null; const r = b.getBoundingClientRect(); return { l: r.left, r: r.right, vw: innerWidth };
      });
      ok(`${name}: the user menu's ขอความช่วยเหลือ is the way in, on screen`, !!item && item.l >= 0 && item.r <= item.vw + 0.5, item);
    } else {
      try { await page.locator('.topbar .help-btn').click({ timeout: 5000 }); }
      catch (e) { ok(`${name}: the button can be tapped`, false, e.message.split('\n')[0]); await page.close(); continue; }
      await page.waitForTimeout(250);
      const send = await page.evaluate(() => {
        const b = [...document.querySelectorAll('.modal-foot button')].find(x => /ส่ง/.test(x.textContent));
        if (!b) return null; const r = b.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, vw: innerWidth, vh: innerHeight };
      });
      ok(`${name}: a tap opens the form, with ส่ง on screen`, !!send && send.l >= 0 && send.t >= 0 && send.r <= send.vw + 0.5 && send.b <= send.vh + 0.5, send);
    }
    ok(`${name}: no page errors`, errors.length === 0, errors);
    await page.close();
  }

  console.log('\n── #3 a real picture: 3000 × 2000 with EXIF in, 1600 × 1067 JPEG without EXIF out ──');
  for (const d of [DEVICES[8], DEVICES[13]]) {
    const sent = [];
    const { page, errors } = await signedIn(browser, BASE, '', d, sent);
    // A JPEG drawn by the browser, with an EXIF block spliced in after SOI,
    // the way a phone camera writes one.
    const plain = Buffer.from(await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 3000; c.height = 2000;
      const g = c.getContext('2d');
      for (let i = 0; i < 30; i++) { g.fillStyle = `hsl(${i * 12},60%,${30 + i}%)`; g.fillRect(i * 100, 0, 100, 2000); }
      return c.toDataURL('image/jpeg', 0.9).split(',')[1];
    }), 'base64');
    const tiff = Buffer.from('MM\0*\0\0\0\x08\0\0', 'latin1');
    const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0, 2 + 6 + tiff.length]), Buffer.from('Exif\0\0', 'latin1'), tiff]);
    const withExif = Buffer.concat([plain.slice(0, 2), app1, plain.slice(2)]);
    const src = jpegInfo(withExif);
    ok(`${d[0]}: the test picture is 3000 × 2000 and carries EXIF`, !!src && src.exif && src.size && src.size.w === 3000 && src.size.h === 2000, src);

    try {
      await page.locator('.topbar .help-btn').click({ timeout: 5000 });
      await page.locator('.modal-box input[type="file"]').setInputFiles({ name: 'ward.jpg', mimeType: 'image/jpeg', buffer: withExif }, { timeout: 5000 });
    } catch (e) { ok(`${d[0]}: the form takes a picture`, false, e.message.split('\n')[0]); await page.close(); continue; }
    await page.waitForSelector('.help-shot img', { timeout: 10000 }).catch(() => {});
    const preview = await page.evaluate(() => {
      const img = document.querySelector('.help-shot img');
      if (!img) return null;
      const r = img.getBoundingClientRect();
      return { w: img.naturalWidth, h: img.naturalHeight, boxR: r.right, vw: innerWidth, jpeg: /^data:image\/jpeg;base64,/.test(img.src) };
    });
    ok(`${d[0]}: the preview is the JPEG that will go, 1600 × 1067`, !!preview && preview.jpeg && preview.w === 1600 && preview.h === 1067, preview);
    ok(`${d[0]}: …and fits the form`, !!preview && preview.boxR <= preview.vw + 0.5, preview);
    await page.locator('.modal-box textarea').fill('ตัวเลขในรูปนี้แปลก');
    await page.locator('.modal-foot button', { hasText: 'ส่ง' }).click({ timeout: 5000 });
    await page.waitForTimeout(400);
    const req = sent[0] || {};
    const buf = req.image && typeof req.image.data === 'string' ? Buffer.from(req.image.data, 'base64') : Buffer.alloc(0);
    const out = jpegInfo(buf);
    ok(`${d[0]}: one request, with image.mimeType image/jpeg`, sent.length === 1 && req.image && req.image.mimeType === 'image/jpeg', Object.keys(req));
    ok(`${d[0]}: …a JPEG of 1600 × 1067`, !!out && out.size && out.size.w === 1600 && out.size.h === 1067, out);
    ok(`${d[0]}: …with no EXIF left`, !!out && !out.exif, out);
    ok(`${d[0]}: …under 1.5 MB`, !!out && out.bytes <= 1500000, out && out.bytes);
    ok(`${d[0]}: no page errors`, errors.length === 0, errors);
    await page.close();
  }

  console.log('\n── #4 negative control: the narrow-phone block taken out ──');
  ok('the block was taken out of the served shell', NO_NARROW !== shell && !NO_NARROW.includes(NARROW_HEAD));
  {
    const d = DEVICES[3];
    const { page } = await signedIn(browser, BASE, 'no-narrow.html', d);
    const m = await page.evaluate(MEASURE);
    const clear = !!m.help && !!m.search && m.help.l >= m.search.r + 4 && m.scrollW <= m.vw
      && !!m.word && m.word.w >= m.word.full - 0.5;
    ok(`without it, at ${d[1]} px the button squeezes the wordmark, and section 2 catches it`, !clear, m.word);
    await page.close();
  }
  await browser.close();
  server.close();
}

run().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}).catch(e => { console.error(e); process.exit(1); });
