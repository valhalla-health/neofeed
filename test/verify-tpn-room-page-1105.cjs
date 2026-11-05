// verify-tpn-room-page-1105.cjs — the TPN room's page in real Chromium, under the hosts'
// real CSP, against the real gas-backend.gs in the sandbox (tools/dev-local.mjs).
// openspec/changes/tpn-room-stickers, PR B. Synthetic infants only.
//
// The folder picker needs a person, so the harness hands the page an origin-private
// folder in its place. It is a real FileSystemDirectoryHandle: createWritable, IndexedDB
// storage and the encryption are all the browser's own. What this cannot prove is the
// real PC's folder and permission: that is tasks.md 0.1, tpn-room-check.html.
//
// Set TPN_ROOM_PDF_OUT=<file> to keep the sample sheet (made-up infant, placeholder
// fixed lines) for checking against a real sticker sheet (tasks.md 2.6).
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, n = 0;
function eq(name, got, want) {
  const yes = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${yes ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name}${yes ? '' : `  got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
  yes ? pass++ : fail++;
}
const ok = (name, cond) => eq(name, !!cond, true);
const section = (t) => console.log(`\n── ${t} ──`);

const SENTINEL = 'SENTINEL-NAME-7Q';
const SENTINEL_AN = '98765/69';
const PASSPHRASE = 'synthetic-room-passphrase';
const FIXED_FILLED = 'const PN_FIXED = { heading: "ฉลากตัวอย่าง TPN", storage: "ข้อความตัวอย่างการเก็บรักษา", extension: "โทรภายในตัวอย่าง" };';
const FIXED_BLANK = 'const PN_FIXED = { heading: "", storage: "", extension: "" };';

const INIT = `
  window.__prints = 0;
  window.print = () => {
    window.__prints++;
    const s = document.getElementById('sticker-sheet');
    window.__sheet = s ? s.outerHTML : null;
  };
  window.showDirectoryPicker = async () => {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle('tpn-room-test', { create: true });
  };
`;

(async () => {
  let chromium;
  try { chromium = require('playwright').chromium; }
  catch { console.log('  SKIP  playwright not installed'); process.exit(0); }
  const exe = ['/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p));
  let browser;
  try { browser = await chromium.launch(exe ? { executablePath: exe } : {}); }
  catch (e) { console.log('  SKIP  could not launch Chromium (' + e.message.split('\n')[0] + ')'); process.exit(0); }

  const { start } = await import(pathToFileURL(path.join(ROOT, 'tools', 'dev-local.mjs')).href);
  const dev = await start({ port: 0, quiet: true });
  const { g, today, url, pharmacy } = dev;
  const requests = [];
  const problems = [];

  // One browser profile. `fill` swaps in made-up fixed lines, as the unit's real ones will be.
  async function newRoom({ fill = true, fixed = FIXED_FILLED, versionFile = null } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    await ctx.addInitScript(INIT);
    await ctx.route('**/*', async (route) => {
      const req = route.request();
      requests.push({ url: req.url(), headers: await req.allHeaders(), body: req.postData() || '' });
      const u = new URL(req.url());
      if (u.hostname !== '127.0.0.1') return route.abort();
      if (fill && u.pathname === '/tpn-room-core.js') {
        const res = await route.fetch();
        const body = (await res.text()).replace(FIXED_BLANK, fixed);
        return route.fulfill({ response: res, body });
      }
      if (versionFile && versionFile.body && u.pathname === '/compiled/tpn-room-version.js') {
        return route.fulfill({ status: 200, contentType: 'text/javascript', body: versionFile.body });
      }
      return route.continue();
    });
    return ctx;
  }
  async function open(ctx) {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) problems.push('console: ' + m.text()); });
    await page.goto(url + '/tpn-room.html');
    return page;
  }
  async function signIn(page, email, password) {
    await page.fill('input[type=email]', email);
    await page.fill('input[type=password]', password);
    await page.click('button[type=submit]');
  }
  const text = (page, sel) => page.locator(sel).first().innerText();
  const row = (page, id) => page.locator(`li[data-session="${id}"]`);
  const calls = (action) => requests.filter((r) => { try { return JSON.parse(r.body).action === action; } catch { return false; } });
  const logRowOf = (sid) => g.sheet('Daily_Log').data.find((r) => r[1] === sid);
  const pjOf = (sid) => JSON.parse(logRowOf(sid)[38]);
  async function mapInfant(page, id, name, an) {
    await row(page, id).getByRole('button', { name: /ชื่อ \/ AN/ }).click();
    await page.getByLabel('ชื่อที่จะพิมพ์').fill(name);
    await page.getByLabel('AN', { exact: true }).fill(an);
    await page.getByRole('dialog').getByRole('button', { name: 'บันทึก' }).click();
  }
  async function createNameFile(page) {
    await page.getByRole('button', { name: 'เลือกโฟลเดอร์' }).click();
    await page.getByLabel(/^รหัสผ่านของห้อง TPN/).fill(PASSPHRASE);
    await page.getByLabel('รหัสผ่านอีกครั้ง').fill(PASSPHRASE);
    await page.getByRole('button', { name: 'สร้างไฟล์ชื่อ' }).click();
    await page.getByRole('status').filter({ hasText: 'ไฟล์เปิดอยู่' }).waitFor();
  }

  try {
    // Beds and a critical value on the seeded infants, as the registry and a Submit make them.
    const pat = g.sheet('Patient_Registry').data;
    pat.find((r) => r[0] === 'AA-1')[10] = 'iso 2-1';
    const twinRow = pat.find((r) => r[0] === 'SS-1');
    twinRow[8] = 'B'; twinRow[17] = 2;
    const ssPj = pjOf('SS-1');
    ssPj.critical = { alerts: ['GIR สูงกว่าเกณฑ์'], reason: 'เหตุผลตัวอย่างจากหมอ' };
    logRowOf('SS-1')[38] = JSON.stringify(ssPj);

    section('§1 the shell');
    const ctxA = await newRoom({ fill: false });
    const raw = await ctxA.request.get(url + '/tpn-room.html');
    ok('served under the hosts\' CSP', /connect-src/.test(raw.headers()['content-security-policy'] || ''));
    const page = await open(ctxA);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).waitFor();
    ok('Sarabun is served with the page', (await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.family.includes('Sarabun')).length; })) >= 4);
    ok('no Google or other third-party request', !requests.some((r) => !r.url.startsWith(url)));
    eq('nothing in sessionStorage before sign-in', await page.evaluate(() => sessionStorage.length), 0);

    section('§2 sign-in');
    await signIn(page, pharmacy.email, 'wrong-password');
    await page.getByRole('alert').waitFor();
    ok('a wrong password stays on the form', await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).isVisible());
    const doctor = dev.accounts.find((a) => a.role === 'doctor');
    await signIn(page, doctor.email, doctor.password);
    await page.getByText('บัญชีนี้ไม่มีสิทธิ์ใช้หน้าห้อง TPN').waitFor();
    eq('a doctor is turned away, and nothing is stored', await page.evaluate(() => sessionStorage.length), 0);
    requests.length = 0;
    await signIn(page, pharmacy.email, pharmacy.password);
    await page.getByRole('status').filter({ hasText: 'เข้าระบบ' }).waitFor();
    await row(page, 'AA-1').waitFor();
    eq('its own session key', await page.evaluate(() => Object.keys(sessionStorage)), ['neofeed_tpn_room_session']);
    eq('one read of the orders on open', calls('pharmacyOrders').length, 1);
    eq('…for today', JSON.parse(calls('pharmacyOrders')[0].body).date, today);
    const counts = await text(page, '.counts');
    ok('counts: 3 submitted, 1 draft, 6 on the unit', /3\s*Submit แล้ว/.test(counts) && /1\s*ฉบับร่าง/.test(counts) && /6\s*ผู้ป่วยในหน่วย/.test(counts));
    ok('and when they were loaded', /โหลดเมื่อ \d\d:\d\d/.test(counts));
    ok('the draft is folded away', !(await row(page, 'BB-1').isVisible()));
    await page.locator('details.drafts summary').click();
    ok('…and opens', await row(page, 'BB-1').isVisible());
    ok('…with no print button', (await row(page, 'BB-1').getByRole('button', { name: 'พิมพ์สติกเกอร์' }).count()) === 0);
    const pick = page.locator('input[type=date]').first();
    eq('the date picker stays inside the server\'s window', [await pick.getAttribute('min') <= today, await pick.getAttribute('max') > today], [true, true]);
    ok('saver labelled บันทึกโดย', /บันทึกโดย/.test(await row(page, 'AA-1').innerText()));
    ok('the row shows BW and the weight used to calculate', /BW 1200 g/.test(await row(page, 'AA-1').innerText()) && /น้ำหนักที่ใช้คำนวณ 0\.9 kg/.test(await row(page, 'AA-1').innerText()));
    ok('a doctor-confirmed critical value shows on the row', /GIR สูงกว่าเกณฑ์/.test(await row(page, 'SS-1').innerText()) && /เหตุผลตัวอย่างจากหมอ/.test(await row(page, 'SS-1').innerText()));
    ok('the twin shows', /Twin B of 2/.test(await row(page, 'SS-1').innerText()));
    ok('the older constants version names its reason', /ปรับการคำนวณ/.test(await row(page, 'CC-1').innerText()));

    section('§3 the name file');
    ok('the page says the file is not open, and the list still shows', /ไฟล์ชื่อยังไม่เปิด/.test(await text(page, '.status-line')));
    ok('no print without it', /ไฟล์ชื่อยังไม่เปิด/.test(await row(page, 'AA-1').innerText()));
    await page.getByRole('button', { name: 'เลือกโฟลเดอร์' }).click();
    await page.getByLabel(/^รหัสผ่านของห้อง TPN/).fill(PASSPHRASE);
    await page.getByLabel('รหัสผ่านอีกครั้ง').fill('not-the-same-passphrase');
    await page.getByRole('button', { name: 'สร้างไฟล์ชื่อ' }).click();
    await page.getByText('รหัสผ่านสองช่องไม่ตรงกัน').waitFor();
    ok('two passphrases that differ make no file', true);
    await page.getByLabel(/^รหัสผ่านของห้อง TPN/).fill(PASSPHRASE);
    await page.getByLabel('รหัสผ่านอีกครั้ง').fill(PASSPHRASE);
    await page.getByRole('button', { name: 'สร้างไฟล์ชื่อ' }).click();
    await page.getByRole('status').filter({ hasText: 'ไฟล์เปิดอยู่' }).waitFor();
    const status = await text(page, '.status-line');
    ok('status line: count, open, folder, who', /ชื่อในไฟล์ 0 คน/.test(status) && /โฟลเดอร์ tpn-room-test/.test(status) && /Pharmacist Dev/.test(status));

    section('§4 mapping');
    await row(page, 'AA-1').getByRole('button', { name: /ชื่อ \/ AN/ }).click();
    const dialog = page.getByRole('dialog');
    const dtext = await dialog.innerText();
    ok('the dialog shows the bed, BW, DOL and the weight', /iso 2-1/.test(dtext) && /1200 g/.test(dtext) && /0\.9 kg/.test(dtext));
    await page.getByLabel('ชื่อที่จะพิมพ์').fill(SENTINEL);
    await page.getByLabel('AN', { exact: true }).fill('1234');
    await dialog.getByRole('button', { name: 'บันทึก' }).click();
    await dialog.getByRole('alert').waitFor();
    ok('an AN off the pattern is refused', /nnnnn\/yy/.test(await dialog.getByRole('alert').innerText()));
    await page.getByLabel('AN', { exact: true }).fill(SENTINEL_AN);
    await dialog.getByRole('button', { name: 'บันทึก' }).click();
    await row(page, 'AA-1').getByText(SENTINEL).waitFor();
    await row(page, 'SS-1').getByRole('button', { name: /ชื่อ \/ AN/ }).click();
    ok('twins: the letter in large type', /Twin B of 2/.test(await page.locator('.twin-big').innerText()));
    await page.getByLabel('ชื่อที่จะพิมพ์').fill('ทารกสังเคราะห์ บี');
    await page.getByLabel('AN', { exact: true }).fill(SENTINEL_AN);
    await dialog.getByRole('button', { name: 'บันทึก' }).click();
    await dialog.getByRole('alert').waitFor();
    ok('an AN on another ID names that ID', /AA-1/.test(await dialog.getByRole('alert').innerText()));
    ok('…and does not save yet', await dialog.isVisible());
    await page.getByLabel('AN', { exact: true }).fill('11111/69');
    await dialog.getByRole('button', { name: 'บันทึก' }).click();
    await row(page, 'SS-1').getByText('11111/69').waitFor();
    await row(page, 'AA-1').getByRole('button', { name: /ชื่อ \/ AN/ }).click();
    await page.getByLabel('AN', { exact: true }).fill('11111/69');
    await dialog.getByRole('button', { name: 'บันทึก' }).click();
    await dialog.getByRole('alert').waitFor();
    await dialog.getByRole('button', { name: 'บันทึก' }).click();
    await row(page, 'AA-1').getByText('11111/69').waitFor();
    ok('a second press confirms it', true);
    await row(page, 'AA-1').getByRole('button', { name: /ชื่อ \/ AN/ }).click();
    ok('the edit history shows', /ประวัติการแก้/.test(await dialog.innerText()) && dialog.getByText(SENTINEL_AN).first() !== null);
    await page.getByLabel('AN', { exact: true }).fill(SENTINEL_AN);
    await dialog.getByRole('button', { name: 'บันทึก' }).click();
    await row(page, 'AA-1').getByText(SENTINEL_AN).waitFor();

    section('§5 as shipped, the fixed lines hold every print');
    ok('the reason shows on a mapped order', /ข้อความคงที่/.test(await row(page, 'AA-1').innerText()));
    eq('no print button', await row(page, 'AA-1').getByRole('button', { name: 'พิมพ์สติกเกอร์' }).count(), 0);
    await ctxA.close();

    section('§6 printing');
    const ctxB = await newRoom({ fill: true });
    const p2 = await open(ctxB);
    await signIn(p2, pharmacy.email, pharmacy.password);
    await row(p2, 'AA-1').waitFor();
    await createNameFile(p2);
    await mapInfant(p2, 'AA-1', SENTINEL, SENTINEL_AN);
    await row(p2, 'AA-1').getByText(SENTINEL).waitFor();
    await mapInfant(p2, 'SS-1', 'ทารกสังเคราะห์ บี', '11111/69');
    await row(p2, 'SS-1').getByText('11111/69').waitFor();
    const aaPrint = row(p2, 'AA-1').getByRole('button', { name: 'พิมพ์สติกเกอร์' });
    await aaPrint.waitFor();
    ok('the date box defaults to today', (await row(p2, 'AA-1').locator('input[type=date]').inputValue()) === today);
    const made = new Date(Date.parse(today + 'T00:00:00Z') + 2 * 86400000).toISOString().slice(0, 10);
    await row(p2, 'AA-1').locator('input[type=date]').fill(made);
    const before = calls('pharmacyOrders').length;
    await aaPrint.click();
    await p2.waitForFunction(() => window.__prints === 1);
    eq('the order is read once more just before printing', calls('pharmacyOrders').length, before + 1);
    const fig = pjOf('AA-1');
    const sheetCheck = await p2.evaluate((pj) => {
      const sheet = document.getElementById('sticker-sheet');
      const get = (p) => p.split('.').reduce((o, k) => (o ? o[k] : undefined), pj);
      const figs = [...sheet.querySelectorAll('[data-fig]')].map((e) => [e.dataset.fig, e.textContent]);
      const wrong = figs.filter(([p, v]) => get(p) !== v);
      const copy = sheet.cloneNode(true);
      copy.querySelectorAll('[data-fig],[data-lbl],[data-mapped],[data-date],[data-fixed]').forEach((e) => e.remove());
      return {
        figures: figs.length, wrong, rest: copy.textContent,
        bagWard: sheet.querySelector('.bag-ward').textContent,
        names: sheet.querySelectorAll('[data-mapped="name"]').length,
        dates: [...sheet.querySelectorAll('[data-date]')].map((e) => e.textContent),
        fixed: [...sheet.querySelectorAll('[data-fixed]')].map((e) => e.textContent),
        zero: [...sheet.querySelectorAll('[data-fig="stockMl.amiparen10"]')].map((e) => e.textContent),
        rows: sheet.querySelectorAll('.stock tr').length,
      };
    }, fig);
    ok(`every figure on the sheet (${sheetCheck.figures}) is its printJson string`, sheetCheck.figures > 30 && sheetCheck.wrong.length === 0);
    eq('…and no number sits anywhere else on the sheet', /\d/.test(sheetCheck.rest), false);
    eq('an iso bed prints 9B2(NICU)', sheetCheck.bagWard, '9B2(NICU)');
    eq('a zero row prints its 0', sheetCheck.zero, ['0']);
    eq('sixteen stock rows, less the three the unit dropped already', sheetCheck.rows, 16);
    eq('the name on all three parts', sheetCheck.names, 3);
    const be = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${Number(d.slice(0, 4)) + 543}`;
    eq('Buddhist-era dates; date made comes from the box', sheetCheck.dates, [be(today), be(today), be(made), be(today)]);
    eq('the fixed lines print', sheetCheck.fixed.length, 3);
    await p2.emulateMedia({ media: 'print' });
    const fits = await p2.evaluate(() => [document.getElementById('sticker-sheet'), ...document.querySelectorAll('#sticker-sheet .part')].map((e) => e.scrollHeight <= e.clientHeight + 1));
    ok('the sheet and each part fit, measured under print', fits.length === 4 && fits.every(Boolean));
    eq('print shows the sheet and hides the screen', await p2.evaluate(() => [getComputedStyle(document.querySelector('.screen')).display, getComputedStyle(document.getElementById('sticker-sheet')).visibility, getComputedStyle(document.getElementById('sticker-sheet')).position]), ['none', 'visible', 'static']);
    const pdf = await p2.pdf({ preferCSSPageSize: true, printBackground: true });
    await p2.emulateMedia({ media: null });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    eq('the fullest row set fits one A4 page', pages, 1);
    if (process.env.TPN_ROOM_PDF_OUT) fs.writeFileSync(process.env.TPN_ROOM_PDF_OUT, pdf);
    await p2.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await p2.waitForFunction(() => !document.getElementById('sticker-sheet'));
    ok('the sheet leaves the page after the print dialog', true);
    await row(p2, 'AA-1').getByText(/พิมพ์แล้ว/).waitFor();
    ok('the row says who printed it', /Pharmacist Dev/.test(await row(p2, 'AA-1').innerText()));
    ok('and offers a reprint', await row(p2, 'AA-1').getByRole('button', { name: 'พิมพ์ซ้ำ' }).isVisible());

    section('§7 the order moves after printing');
    const ssPrint = row(p2, 'SS-1').getByRole('button', { name: 'พิมพ์สติกเกอร์' });
    await ssPrint.click();
    await p2.waitForFunction(() => window.__prints === 2);
    const bag = await p2.evaluate(() => document.querySelector('.bag-ward').textContent);
    eq('SCN prints 9B2(SCN)', bag, '9B2(SCN)');
    await p2.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    const crypto = require('crypto');
    // A revision after the print: the server now holds a new row for this order.
    const aaLog = logRowOf('AA-1');
    aaLog[25] = crypto.randomUUID(); aaLog[35] = 2;
    await p2.getByRole('button', { name: 'รีเฟรช' }).click();
    await row(p2, 'AA-1').getByText('หมอแก้ order หลังพิมพ์ → ฉบับ 2').waitFor();
    ok('a revision after printing warns, and offers the new order', await row(p2, 'AA-1').getByRole('button', { name: 'พิมพ์สติกเกอร์' }).isVisible());
    if (process.env.TPN_ROOM_SHOT_DIR) {
      await p2.screenshot({ path: path.join(process.env.TPN_ROOM_SHOT_DIR, 'room-1200.png'), fullPage: true });
      await p2.setViewportSize({ width: 390, height: 800 });
      await p2.screenshot({ path: path.join(process.env.TPN_ROOM_SHOT_DIR, 'room-390.png'), fullPage: true });
      eq('no sideways scroll at phone width', await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await p2.setViewportSize({ width: 1200, height: 900 });
    }
    // A revision between the list and the print: the re-read refuses.
    const printsBefore = await p2.evaluate(() => window.__prints);
    aaLog[25] = crypto.randomUUID(); aaLog[35] = 3;
    await row(p2, 'AA-1').getByRole('button', { name: 'พิมพ์สติกเกอร์' }).click();
    await p2.getByRole('alert').filter({ hasText: 'หมอแก้ order ระหว่างนี้' }).waitFor();
    eq('an order changed under the list does not print', await p2.evaluate(() => window.__prints), printsBefore);
    // Deleted after printing, or cancelled by a No TPN tick: gone from the reply.
    const logSheet = g.sheet('Daily_Log');
    logSheet.data.splice(logSheet.data.findIndex((r) => r[1] === 'SS-1'), 1);
    await p2.getByRole('button', { name: 'รีเฟรช' }).click();
    await p2.locator('[data-gone="SS-1"]').waitFor();
    ok('gone after printing says not to use the bag', /อย่าใช้ถุงนี้/.test(await p2.locator('[data-gone="SS-1"]').innerText()));
    eq('the reply really holds no SS-1', await row(p2, 'SS-1').count(), 0);

    section('§8 reopening');
    const p3 = await open(ctxB);
    await signIn(p3, pharmacy.email, pharmacy.password);
    await p3.getByRole('status').filter({ hasText: 'ไฟล์เปิดอยู่' }).waitFor();
    ok('the next day\'s open is silent, and the names are back', /ชื่อในไฟล์ 2 คน/.test(await text(p3, '.status-line')) && await row(p3, 'AA-1').getByText(SENTINEL).isVisible());
    await p3.close();
    await p2.close();
    // The browser's data is cleared: the device key and the folder handle go, the file stays.
    const p4 = await ctxB.newPage();
    await p4.goto(url + '/moved.html');
    await p4.evaluate(() => new Promise((res) => { const r = indexedDB.deleteDatabase('neofeed_tpn_room'); r.onsuccess = r.onerror = r.onblocked = () => res(); }));
    await p4.goto(url + '/tpn-room.html');
    await signIn(p4, pharmacy.email, pharmacy.password);
    await p4.getByRole('button', { name: 'เลือกโฟลเดอร์' }).click();
    await p4.getByRole('button', { name: 'เปิดไฟล์ชื่อ' }).waitFor();
    ok('a cleared device key asks for the passphrase', /ใส่รหัสผ่านของห้อง TPN/.test(await text(p4, '.panel')));
    await p4.getByLabel('รหัสผ่านของห้อง TPN').fill('wrong-passphrase-here');
    await p4.getByRole('button', { name: 'เปิดไฟล์ชื่อ' }).click();
    await p4.getByRole('alert').filter({ hasText: 'รหัสผ่านไม่ถูกต้อง' }).waitFor();
    ok('a wrong passphrase is refused, and no table opens', /ไฟล์ชื่อยังไม่เปิด/.test(await text(p4, '.status-line')));
    await p4.getByLabel('รหัสผ่านของห้อง TPN').fill(PASSPHRASE);
    await p4.getByRole('button', { name: 'เปิดไฟล์ชื่อ' }).click();
    await p4.getByRole('status').filter({ hasText: 'ไฟล์เปิดอยู่' }).waitFor();
    ok('the right one opens the names', /ชื่อในไฟล์ 2 คน/.test(await text(p4, '.status-line')));
    // A changed byte on disk: refused, never an empty table.
    await p4.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('tpn-room-test');
      const fh = await dir.getFileHandle('neofeed-tpn-room-names.nfenc');
      const t = await (await fh.getFile()).text();
      const w = await fh.createWritable();
      await w.write(t.slice(0, t.length - 30) + (t[t.length - 30] === 'A' ? 'B' : 'A') + t.slice(t.length - 29));
      await w.close();
    });
    await p4.reload();
    await p4.getByText('ไฟล์ชื่อเปิดไม่ได้').waitFor();
    ok('a changed byte stops the file', /ไฟล์ชื่อยังไม่เปิด/.test(await text(p4, '.status-line')));
    ok('…with no empty table in its place', /ไม่เริ่มตารางเปล่าเอง/.test(await text(p4, '.panel')));
    // Start a new file: warns, keeps the old one, marks the window.
    await p4.getByRole('button', { name: 'เริ่มไฟล์ใหม่' }).click();
    ok('the flow warns that the print log goes', /ไม่มีบันทึกการพิมพ์/.test(await text(p4, '.panel')));
    await p4.getByLabel(/^รหัสผ่านของห้อง TPN/).fill('another-room-passphrase');
    await p4.getByLabel('รหัสผ่านอีกครั้ง').fill('another-room-passphrase');
    await p4.getByRole('button', { name: 'เริ่มไฟล์ใหม่' }).click();
    await p4.getByRole('alert').filter({ hasText: 'ติ๊กยอมรับ' }).waitFor();
    await p4.getByLabel(/เข้าใจแล้ว/).check();
    await p4.getByRole('button', { name: 'เริ่มไฟล์ใหม่' }).click();
    await p4.getByRole('status').filter({ hasText: 'ไฟล์เปิดอยู่' }).waitFor();
    ok('every order in the window goes against the paper first', /เทียบกับ order กระดาษก่อน/.test(await row(p4, 'AA-1').innerText()));
    eq('the old file stays beside the new one', await p4.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('tpn-room-test');
      let c = 0;
      for await (const k of dir.keys()) if (k.endsWith('.nfenc')) c++;
      return c;
    }), 2);

    section('§9 session');
    await p4.evaluate(() => {
      const s = JSON.parse(sessionStorage.getItem('neofeed_tpn_room_session'));
      s.token = 'expired-synthetic-token';
      sessionStorage.setItem('neofeed_tpn_room_session', JSON.stringify(s));
    });
    await p4.reload();
    await p4.getByRole('button', { name: 'เข้าสู่ระบบ' }).waitFor();
    ok('a dead token lands on sign-in with a reason', /หมดเวลาเข้าสู่ระบบ/.test(await p4.innerText('main')));
    eq('…and clears the stored session', await p4.evaluate(() => sessionStorage.length), 0);
    await ctxB.close();

    // A pharmacy row typed into Staff with a temporary password: forced to change it.
    g.addStaff('temp-ph@dev.local', 'pharmacy', 'Temporary-Pass-1', { name: 'เภสัชใหม่', mustChange: true });
    const ctxC = await newRoom();
    const p5 = await open(ctxC);
    await signIn(p5, 'temp-ph@dev.local', 'Temporary-Pass-1');
    await p5.getByRole('heading', { name: 'ตั้งรหัสผ่านใหม่ก่อนใช้งาน' }).waitFor();
    ok('a temporary password goes to the forced screen', true);
    await p5.getByLabel('รหัสผ่านเดิม').fill('Temporary-Pass-1');
    await p5.getByLabel('รหัสผ่านใหม่', { exact: true }).fill('Synthetic-New-Pass-9');
    await p5.getByLabel('รหัสผ่านใหม่อีกครั้ง').fill('Synthetic-New-Pass-9');
    await p5.getByRole('button', { name: 'บันทึก' }).click();
    await row(p5, 'AA-1').waitFor();
    ok('the rotated token reads the orders straight away', true);
    await p5.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }).click();
    ok('a change-password button stays on the page', await p5.getByRole('heading', { name: 'เปลี่ยนรหัสผ่าน' }).isVisible());
    await p5.getByRole('button', { name: 'ยกเลิก' }).click();
    await p5.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await p5.getByRole('button', { name: 'เข้าสู่ระบบ' }).waitFor();
    eq('sign-out clears the session', await p5.evaluate(() => sessionStorage.length), 0);
    ok('…and takes the names off the screen', !/ชื่อในไฟล์/.test(await p5.innerText('body')));
    await ctxC.close();

    section('§10 the ward app\'s refusal links here');
    const ctxD = await browser.newContext();
    await ctxD.route('**/*', (route) => (new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort()));
    const ward = await ctxD.newPage();
    await ward.goto(url + '/');
    await ward.getByRole('button', { name: /email/ }).first().click();
    await ward.locator('input[type=email]').fill(pharmacy.email);
    await ward.locator('input[type=password]').fill(pharmacy.password);
    await ward.locator('input[type=password]').press('Enter');
    await ward.getByText(/บัญชีเภสัช/).first().waitFor();
    eq('the line links to the page', await ward.getByRole('link', { name: 'เปิดหน้าห้อง TPN' }).getAttribute('href'), 'tpn-room.html');
    await ctxD.close();

    section('§11 *.github.io: gone before any storage');
    for (const host of ['valhalla-health.github.io', 'someone-else.github.io']) {
      const ctxE = await browser.newContext();
      const base = `https://${host}/neofeed/`;
      await ctxE.route('**/*', async (route) => {
        const u = new URL(route.request().url());
        if (u.hostname !== host) return route.abort();
        const rel = u.pathname.replace('/neofeed/', '');
        const file = path.join(ROOT, rel);
        if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'no' });
        return route.fulfill({ status: 200, contentType: rel.endsWith('.html') ? 'text/html; charset=utf-8' : rel.endsWith('.css') ? 'text/css' : 'text/javascript', body: fs.readFileSync(file) });
      });
      const hub = await ctxE.newPage();
      await hub.goto(base + 'tpn-room.html');
      await hub.waitForURL(/moved\.html/);
      const left = await hub.evaluate(async () => ({
        db: (await indexedDB.databases()).map((d) => d.name),
        ss: sessionStorage.length,
      }));
      eq(`${host}: moved, with no database and no session`, left, { db: [], ss: 0 });
      await ctxE.close();
    }

    section('§12 the sentinel never leaves');
    const leaked = requests.filter((r) => [r.url, JSON.stringify(r.headers), r.body].some((s) => s.includes(SENTINEL) || s.includes(SENTINEL_AN)));
    eq(`no request of ${requests.length} carries the name or the AN`, leaked.map((r) => r.url), []);
    const actions = [...new Set(requests.map((r) => { try { return JSON.parse(r.body).action; } catch { return null; } }).filter(Boolean))].sort();
    eq('the page sent only these actions', actions, ['changePassword', 'login', 'logout', 'pharmacyOrders']);
    const fields = new Set();
    for (const r of calls('pharmacyOrders')) Object.keys(JSON.parse(r.body)).forEach((k) => fields.add(k));
    eq('pharmacyOrders carries action, token and date, nothing else', [...fields].sort(), ['action', 'date', 'token']);

    section('§12b Vera on this PR, 2026-11-05: each failed on the first commit');
    const within = (loc, ms = 5000) => loc.waitFor({ timeout: ms }).then(() => true, () => false);
    {
      // A cleared browser and an empty folder look like a first run, so a new file marks the window.
      const c = await newRoom();
      const pg = await open(c);
      await signIn(pg, pharmacy.email, pharmacy.password);
      await row(pg, 'AA-1').waitFor();
      await createNameFile(pg);
      ok('a new file from the first-run view says to check the paper', /เทียบกับ order กระดาษก่อน/.test(await row(pg, 'AA-1').innerText()));

      // Printed, then the order goes back to a draft: the warning must not sit inside the fold.
      await mapInfant(pg, 'AA-1', 'ทารกสังเคราะห์', '22222/69');
      await row(pg, 'AA-1').getByText('22222/69').waitFor();
      await row(pg, 'AA-1').getByRole('button', { name: 'พิมพ์สติกเกอร์' }).click();
      await pg.waitForFunction(() => window.__prints === 1, null, { timeout: 8000 });
      await pg.evaluate(() => window.dispatchEvent(new Event('afterprint')));
      const live = logRowOf('AA-1');
      const saved = [live[25], live[14], live[38]];
      live[25] = require('crypto').randomUUID(); live[14] = 'draft'; live[38] = '';
      await pg.getByRole('button', { name: 'รีเฟรช' }).click();
      ok('a printed order now only a draft warns on the open screen', await within(pg.locator('.screen > .warn').filter({ hasText: 'AA-1' })));
      [live[25], live[14], live[38]] = saved;
      await c.close();
    }
    {
      // Too much text for the sheet: refuse, rather than cut the bag label off silently.
      const long = 'ข้อความยาวมาก '.repeat(40);
      const c = await newRoom({ fixed: `const PN_FIXED = { heading: "${long}", storage: "${long}", extension: "${long}" };` });
      const pg = await open(c);
      await signIn(pg, pharmacy.email, pharmacy.password);
      await row(pg, 'AA-1').waitFor();
      await createNameFile(pg);
      await mapInfant(pg, 'AA-1', 'ทารกสังเคราะห์ '.repeat(5).trim(), '33333/69');
      await row(pg, 'AA-1').getByText('33333/69').waitFor();
      await row(pg, 'AA-1').getByRole('button', { name: 'พิมพ์สติกเกอร์' }).click();
      ok('a sheet that does not fit refuses with a reason', await within(pg.getByRole('alert').filter({ hasText: 'ไม่พอ' })));
      eq('…and does not print', await pg.evaluate(() => window.__prints), 0);
      ok('…and the log does not call it printed', !/พิมพ์แล้ว/.test(await row(pg, 'AA-1').innerText()));
      await c.close();
    }
    {
      // A tab left open across a release that moved a figure.
      const versionFile = { body: null };
      const c = await newRoom({ versionFile });
      const pg = await open(c);
      await signIn(pg, pharmacy.email, pharmacy.password);
      await row(pg, 'AA-1').waitFor();
      await createNameFile(pg);
      await mapInfant(pg, 'AA-1', 'ทารกสังเคราะห์', '44444/69');
      await row(pg, 'AA-1').getByText('44444/69').waitFor();
      versionFile.body = '"use strict";\nwindow.TPN_ROOM_VERSIONS = { constantsVersion: "2099-01-01.1", stickerSchema: 1 };\n';
      await row(pg, 'AA-1').getByRole('button', { name: 'พิมพ์สติกเกอร์' }).click();
      ok('a tab older than the release says to reload', await within(pg.getByRole('alert').filter({ hasText: 'โหลดหน้านี้ใหม่' })));
      eq('…and does not print', await pg.evaluate(() => window.__prints), 0);
      await c.close();
    }

    section('§13 no page error, no CSP violation');
    eq('the console stayed clean', problems, []);
  } catch (e) {
    fail++;
    console.log('  FAIL  the run stopped: ' + (e && e.stack ? e.stack.split('\n').slice(0, 6).join(' | ') : e));
  } finally {
    await browser.close();
    await dev.stop();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
