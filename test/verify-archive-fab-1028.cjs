// verify-archive-fab-1028.cjs — on a phone, opening the ward list's
// Discharged / Transferred / Expired archive brings its cards out from under
// the Calculator button.
//
// Pp, 2026-10-28: "ให้แก้ใน mobile ได้ด้วย เพราะตอนนี้แก้ในคอมได้ แต่กดใน mobile
// ไม่ได้". On a phone the archive opens at the foot of the screen, and the
// first archived card's status chip (the way back to Active since #183) sat
// under the floating Calculator button: a tap on it opened the quick calc. The
// desktop table has nothing over it. Opening the archive now scrolls its
// toggle to the top of the list (registry.jsx, phoneArchiveRef).
//
// The real app in real Chromium, served by tools/dev-local.mjs with
// gas-backend.gs in the sandbox and its made-up infants; nothing reaches
// production. A nurse scrolls to the foot of the NICU list and opens the
// archive, as the list is long enough on every ward that the toggle is below
// the fold.
//   #1 three phones (375×667, 360×740, 390×844): DD, set Discharged from its
//      chip, is in the archive; with the archive just opened and nothing else
//      scrolled, its status chip and its Edit are the elements under their
//      own centres; a tap on the chip opens the Status dialog, not the quick
//      calc; Active → Save brings DD back to NICU 4
//   #2 a workstation (1366×768): opening the table's archive leaves the page
//      where it was, and its status chip is not covered either
//
// Needs Playwright and a Chromium; prints SKIP without them, as the other
// browser harnesses do (CI runs it in the compiled pass).
//
// ── NEGATIVE CONTROL ───────────────────────────────────────────────────────
//   d=$(mktemp -d) && git worktree add "$d" 294d00e
//   cp test/verify-archive-fab-1028.cjs "$d/test/" && ( cd "$d" && node test/verify-archive-fab-1028.cjs )
//   git worktree remove "$d"
// On 294d00e (main before this change) #1 fails at every phone size: the
// element over the chip is the Calculator button, and the tap opens the
// quick calc.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + JSON.stringify(detail === undefined ? '' : detail).slice(0, 300)}`);
  cond ? pass++ : fail++;
};

// What a tap at the centre of `loc` would land on: `self` when it is `loc`
// itself (or inside it), and `top` the class of what is there.
const hitTarget = loc => loc.evaluate(el => {
  const r = el.getBoundingClientRect();
  const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  const named = top && top.closest('[class]');
  return { self: !!top && el.contains(top), top: named ? named.getAttribute('class') : top && top.tagName, y: Math.round(r.y) };
});

async function signIn(page, url, account, touch) {
  await page.goto(url);
  const tap = touch ? 'tap' : 'click';
  await page.getByText('เข้าด้วย email อื่น')[tap]();
  await page.locator('input[type=email]').fill(account.email);
  await page.locator('input[placeholder="รหัสผ่าน"]').fill(account.password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' })[tap]();
  await page.getByText('NICU 1–12').waitFor();
}

const scrollWork = (page, to) => page.evaluate(to => {
  const w = document.querySelector('main.work');
  if (to === 'foot') w.scrollTop = w.scrollHeight;
  return Math.round(w.scrollTop);
}, to);

(async () => {
  let chromium;
  try { chromium = require('playwright').chromium; }
  catch { console.log('  SKIP  playwright not installed'); process.exit(0); }
  const exe = ['/opt/pw-browsers/chromium'].find(p => fs.existsSync(p));
  let browser;
  try { browser = await chromium.launch(exe ? { executablePath: exe } : {}); }
  catch (e) { console.log('  SKIP  could not launch Chromium (' + e.message.split('\n')[0] + ')'); process.exit(0); }
  const { start } = await import(pathToFileURL(path.join(ROOT, 'tools', 'dev-local.mjs')).href);

  try {
    for (const [w, h] of [[375, 667], [360, 740], [390, 844]]) {
      console.log(`\n── #1 a phone, ${w}×${h} ──`);
      const dev = await start({ tree: ROOT, port: 0, quiet: true });
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      try {
        await signIn(page, dev.url, dev.accounts.find(a => a.role === 'doctor'), true);
        await page.getByText('NICU 1–12').tap();
        const list = page.locator('.patient-card-list');
        const card = who => list.locator('.patient-mc', { has: page.locator('.pmc-name', { hasText: new RegExp(`^${who}$`) }) });

        // Set up: DD discharged from its own chip, scrolled clear first.
        const ddChip = card('DD').locator('button.chip-tap', { hasText: 'Active' });
        await ddChip.evaluate(e => e.scrollIntoView({ block: 'center' }));
        await ddChip.tap();
        await page.getByRole('radio', { name: 'Discharged' }).tap();
        await page.locator('.picker').getByRole('button', { name: /Save/ }).tap();
        await page.locator('.picker').waitFor({ state: 'detached' });
        await card('DD').waitFor({ state: 'detached' });

        // The nurse scrolls to the foot and opens the archive.
        await scrollWork(page, 'foot');
        await list.getByRole('button', { name: /Discharged \/ Transferred \/ Expired/ }).tap();
        const arch = card('DD');
        await arch.waitFor();
        await page.waitForTimeout(150);
        const chip = arch.locator('button.chip-tap', { hasText: 'Discharged' });
        const chipHit = await hitTarget(chip);
        ok(`1.0 the archived card's status chip is not under anything (${chipHit.top})`, chipHit.self, chipHit);
        const editHit = await hitTarget(arch.getByRole('button', { name: 'Edit' }));
        ok(`1.1 …nor its Edit (${editHit.top})`, editHit.self, editHit);

        // The tap where the chip shows, as a finger would make it.
        const b = await chip.boundingBox();
        await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
        const dialog = page.locator('.picker', { hasText: 'Status · DD' });
        const opened = await dialog.waitFor({ timeout: 2000 }).then(() => true, () => false);
        const quickCalc = await page.getByText('ไม่ผูกกับผู้ป่วย').count();
        ok('1.2 a tap on it opens the Status dialog, not the quick calc', opened && quickCalc === 0, { opened, quickCalc });
        if (opened) {
          await page.getByRole('radio', { name: 'Active' }).tap();
          await dialog.getByRole('button', { name: /Save/ }).tap();
          await dialog.waitFor({ state: 'detached' });
          const back = card('DD').filter({ has: page.locator('button.chip-tap', { hasText: 'Active' }) });
          const ok3 = await back.waitFor({ timeout: 3000 }).then(() => true, () => false);
          const bed = ok3 ? (await back.locator('.chip-tap-bed').innerText()).trim() : null;
          ok('1.3 Active → Save brings DD back on the list, in NICU 4', ok3 && bed === 'NICU 4', { ok3, bed });
        }
      } finally {
        await ctx.close();
        await dev.stop();
      }
    }

    console.log('\n── #2 a workstation, 1366×768 ──');
    const dev = await start({ tree: ROOT, port: 0, quiet: true });
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    try {
      await signIn(page, dev.url, dev.accounts.find(a => a.role === 'doctor'));
      await page.getByText('NICU 1–12').click();
      const table = page.locator('.patient-table');
      const row = who => table.locator('tr', { hasText: who });
      await row('DD').locator('button.chip-tap', { hasText: 'Active' }).click();
      await page.getByRole('radio', { name: 'Discharged' }).click();
      await page.locator('.picker').getByRole('button', { name: /Save/ }).click();
      await page.locator('.picker').waitFor({ state: 'detached' });
      const before = await scrollWork(page, 'foot');
      await table.getByRole('button', { name: /Discharged \/ Transferred \/ Expired/ }).click();
      const chip = row('DD').locator('button.chip-tap', { hasText: 'Discharged' });
      await chip.waitFor();
      await page.waitForTimeout(150);
      const after = await scrollWork(page);
      ok('2.0 opening the table\'s archive leaves the page where it was', after === before, { before, after });
      const hit = await hitTarget(chip);
      ok(`2.1 the archived row's status chip is not under anything (${hit.top})`, hit.self, hit);
    } finally {
      await ctx.close();
      await dev.stop();
    }
  } finally {
    await browser.close();
  }

  console.log(`\n${fail === 0 ? 'ARCHIVE-FAB: ALL PASS' : `ARCHIVE-FAB: ${fail} FAILED`} (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
