// verify-mobile-fit.cjs — the app fits the phone, on every phone.
//
// Praew, 2026-09-22, from a Pixel: "ทำไงให้ไม่ต้องเลื่อนตรงขอบ ให้มันfix พอดี.
// Check กับ mobile ทุกรุ่น ทั้ง apple, android."
//
// Three separate causes were found, and each has its own section here, because
// each can come back on its own:
//
//   1. THE LOGIN SCREEN'S RIBBON LAYER. `.login-wrap` is `overflow-y: auto`,
//      and CSS does not allow a `visible`/non-`visible` overflow pair — the
//      other axis computes to `auto` too. So the screen scrolls BOTH ways. Its
//      `::before` (the soft ribbons) was `position: absolute; inset: -10%`, and
//      an absolutely-positioned box IS part of its scroll container's
//      scrollable overflow on the right and bottom edges. Measured in Chromium
//      before the fix: +39px across and +85px down on a 390×844 phone, +43/+93
//      on a 15 Pro Max, +144/+90 at 1440px — a drag in each direction over
//      nothing at all, on the one screen that has nothing to scroll. A
//      *fixed* box never joins an ancestor scroller's overflow region, and
//      `.login-wrap` is itself `position: fixed; inset: 0` with no transform,
//      filter or containment, so the ribbons resolve against the very same
//      rectangle: same bleed, same picture, no scroll.
//
//   2. `100vw` SHEETS. The mobile picker and modal were `width: 100vw`. vw
//      counts the classic-scrollbar gutter, so anywhere one is drawn — an
//      Android tablet with a mouse, a desktop window at phone width, some
//      webviews — the sheet is wider than the viewport it sits in and the page
//      gains exactly that much sideways drag. Both backdrops are
//      `position: fixed; inset: 0`, so a percentage is the visible width,
//      which is what was meant.
//
//   3. THE LEFT AND RIGHT SAFE AREAS. The shell sets `viewport-fit=cover`, so
//      the page is drawn under the notch and the home indicator. The bottom
//      and the sheets had been handled; left/right never were. On every
//      notched iPhone in landscape, and on the curved-edge Androids, the
//      topbar and the workspace ran under the cutout. `max(design, env(…))`
//      keeps the design padding wherever the inset is 0, which is every
//      device in portrait.
//
// Sections 1-3 are static and run everywhere. Section 4 measures the real
// thing in Chromium at nine device sizes when playwright is installed, and at
// a simulated 44px notch — CI installs no browser, so it degrades to a notice
// rather than a failure, like verify-sync-gate-and-poll.cjs.
//   node test/verify-mobile-fit.cjs
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..') + '/';
const read = (f) => fs.readFileSync(DIR + f, 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + JSON.stringify(detail === undefined ? '' : detail).slice(0, 300)}`);
  cond ? pass++ : fail++;
}

const SHELLS = ['NeoFeed.html', 'index.html'];

// ══ 1 · the login screen's decorative layer is out of the scroll region ════
console.log('\n── #1 the login ribbons are not scrollable overflow ──');
for (const shell of SHELLS) {
  const css = read(shell);
  const before = /\.login-wrap::before\s*\{([\s\S]*?)\}/.exec(css)?.[1] || '';
  ok(`${shell}: .login-wrap::before is found`, before.length > 0);
  ok(`${shell}: …and it is position: fixed, not absolute`,
    /position:\s*fixed/.test(before) && !/position:\s*absolute/.test(before), before.slice(0, 200));
  ok(`${shell}: …still bleeding 10% past every edge (same picture)`,
    /inset:\s*-10%/.test(before), before.slice(0, 200));

  const wrap = /\n  \.login-wrap\s*\{([\s\S]*?)\n  \}/.exec(css)?.[1] || '';
  ok(`${shell}: .login-wrap pins BOTH overflow axes`,
    /overflow-x:\s*hidden/.test(wrap) && /overflow-y:\s*auto/.test(wrap), wrap.slice(0, 400));
  ok(`${shell}: …and it is the fixed, full-viewport layer the ::before assumes`,
    /position:\s*fixed;\s*inset:\s*0/.test(wrap), wrap.slice(0, 200));
  // A transform/filter/contain on .login-wrap would make it the containing
  // block for the fixed ::before, which is fine — but `contain: paint` or a
  // filter would ALSO re-introduce it into the scroll region on some engines.
  ok(`${shell}: …with nothing on it that would capture a fixed child`,
    !/\b(filter|backdrop-filter|transform|perspective|contain|will-change)\s*:/.test(wrap), wrap.slice(0, 400));
}

// ══ 2 · no vw width on anything that fills the viewport ════════════════════
console.log('\n── #2 sheets are sized in %, never vw ──');
for (const shell of SHELLS) {
  const css = read(shell);
  for (const sel of ['.picker', '.modal-box']) {
    const rules = [...css.matchAll(new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`, 'g'))].map(m => m[1]);
    ok(`${shell}: ${sel} is styled`, rules.length > 0);
    ok(`${shell}: ${sel} never sizes itself in vw`,
      rules.every(r => !/width:[^;]*\bvw\b/.test(r)), rules.join(' | ').slice(0, 220));
    ok(`${shell}: ${sel} is full-width on a phone, as a %`,
      rules.some(r => /width:\s*100%\s*!important/.test(r)), rules.join(' | ').slice(0, 220));
  }
  // Their backdrops have to be the fixed, inset:0 box those percentages
  // resolve against, or 100% is 100% of something else.
  for (const sel of ['.picker-backdrop', '.modal-backdrop']) {
    const r = new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`).exec(css)?.[1] || '';
    ok(`${shell}: ${sel} is position: fixed; inset: 0`,
      /position:\s*fixed;\s*inset:\s*0/.test(r), r.slice(0, 120));
  }
}

// ══ 3 · every edge of the shell respects the safe area ═════════════════════
console.log('\n── #3 left/right safe-area insets (viewport-fit=cover) ──');
for (const shell of SHELLS) {
  const css = read(shell);
  ok(`${shell}: the viewport is still cover-fit`,
    /<meta name="viewport"[^>]*viewport-fit=cover/.test(css));
  // Each of these sits against a physical screen edge.
  const EDGES = [
    ['.topbar',     /\.topbar\s*\{([^}]*)\}/g],
    ['.work-inner', /\.work-inner\s*\{([^}]*)\}/g],
    ['.bottom-nav', /\.bottom-nav\s*\{([^}]*)\}/g],
  ];
  for (const [sel, re] of EDGES) {
    const bodies = [...css.matchAll(re)].map(m => m[1]);
    ok(`${shell}: ${sel} is styled`, bodies.length > 0);
    // Every rule that sets side padding must carry the inset, or a later rule
    // silently drops it again — which is exactly how the mobile block used to
    // undo the desktop one. `padding: 0` is a reset (the print sheet), not an
    // edge: there is no physical screen to be clear of on paper.
    const sided = bodies.filter(b => /padding(-left|-right)?\s*:/.test(b) && !/padding:\s*0\s*;/.test(b));
    ok(`${shell}: every ${sel} rule that pads the sides uses env(safe-area-inset-*)`,
      sided.length > 0 && sided.every(b =>
        /env\(safe-area-inset-left/.test(b) && /env\(safe-area-inset-right/.test(b)),
      sided.map(b => b.replace(/\s+/g, ' ').slice(0, 130)));
  }
  // The floating button too — it is the one control pinned to the right edge.
  const fabs = [...css.matchAll(/\.quick-fab\s*\{([^}]*)\}/g)].map(m => m[1]).filter(b => /right\s*:/.test(b));
  ok(`${shell}: every .quick-fab rule keeps `
     + `its right edge clear of the inset`,
    fabs.length > 0 && fabs.every(b => /right:\s*max\([^)]*env\(safe-area-inset-right/.test(b)),
    fabs.map(b => b.replace(/\s+/g, ' ').slice(0, 120)));
  // max(), not a bare env(), wherever a design padding has to survive a phone
  // with no notch. .bottom-nav is the deliberate exception and is checked as
  // one: its five tabs are `flex: 1` and share the whole width, so a minimum
  // there would narrow every tap target on every device to protect a cutout
  // that is not there.
  for (const [sel, re] of EDGES) {
    if (sel === '.bottom-nav') continue;
    const bodies = [...css.matchAll(re)].map(m => m[1]).filter(b => /env\(safe-area-inset-(left|right)/.test(b));
    ok(`${shell}: ${sel}'s insets are max()-guarded, so a phone with no notch is unchanged`,
      bodies.length > 0 && bodies.every(b => !/(padding|padding-left|padding-right):\s*[^;]*(?<!max\()env\(safe-area-inset-(left|right)/.test(
        b.replace(/max\(\s*[\d.]+px,\s*env\(safe-area-inset-(left|right)[^)]*\)\s*\)/g, 'GUARDED'))),
      bodies.map(b => b.replace(/\s+/g, ' ').slice(0, 140)));
  }
  const navBody = [...css.matchAll(/\.bottom-nav\s*\{([^}]*)\}/g)]
    .map(m => m[1]).find(b => /padding-left/.test(b)) || '';
  ok(`${shell}: .bottom-nav takes the raw inset on purpose (flex: 1 tabs)`,
    /padding-left:\s*env\(safe-area-inset-left/.test(navBody)
    && /padding-right:\s*env\(safe-area-inset-right/.test(navBody), navBody.replace(/\s+/g, ' ').slice(0, 200));
}

// ══ 4 · measured in a real browser ═════════════════════════════════════════
// Static CSS cannot tell you what a box actually did. This is the section that
// found the bug: every phone reported clean on the DOCUMENT while the login
// screen's own scroller was 10% too wide.
const DEVICES = [
  ['Galaxy Fold (cover)', 280, 653], ['iPhone SE 1',        320, 568],
  ['Galaxy S8 / A-class', 360, 740], ['iPhone SE 3',        375, 667],
  ['iPhone 13 / 14',      390, 844], ['iPhone 16 Pro',      402, 874],
  ['Pixel 7',             412, 915], ['iPhone 15 Pro Max',  430, 932],
  ['iPad mini',           768, 1024],
];

async function measureInChromium() {
  let chromium;
  try { chromium = require('playwright').chromium; }
  catch { console.log('  SKIP  playwright not installed — static CSS assertions only'); return; }
  const exe = ['/opt/pw-browsers/chromium', undefined].find(p => p === undefined || fs.existsSync(p));
  let browser;
  try { browser = await chromium.launch(exe ? { executablePath: exe } : {}); }
  catch (e) { console.log('  SKIP  could not launch Chromium (' + e.message.split('\n')[0] + ')'); return; }

  const css = read('NeoFeed.html').match(/<style>([\s\S]*?)<\/style>/)[1];
  // `env()` cannot be set from a page, so the notch run substitutes a literal
  // for it — the same arithmetic the browser would do with a real inset.
  const withNotch = (s, px) => s.replace(/env\(safe-area-inset-(top|bottom|left|right)(,\s*[^)]*)?\)/g, `${px}px`);

  const LOGIN = `<div class="login-wrap">
    <div class="login-app-name">NeoFeed</div>
    <div class="login-tagline">Neonatal nutrition,<br>calculated precisely</div>
    <div class="login-btn-area"><button class="btn primary">เข้าสู่ระบบ</button></div>
    <button class="login-alt-link">เข้าด้วย email อื่น →</button>
    <div class="login-contact"><div class="login-endorse">by Valhalla Health · © 2026</div></div>
  </div>`;
  const APP = `<div class="app">
    <div class="topbar"><div class="brandmark"><div class="logo"></div><div class="name">NeoFeed</div></div>
      <button class="switch-patient"><span class="sp-label">Switch patient</span></button><div class="spacer"></div></div>
    <nav class="rail"><div class="rail-item">Patients</div></nav>
    <main class="work"><div class="work-inner"><h1>Ward</h1>
      <div class="card"><div class="card-h">NICU</div><div class="card-b">NICU 1–12 · iso 1–3</div></div></div></main>
    <button class="quick-fab"><span class="quick-fab-label">Calculator</span></button>
    <nav class="bottom-nav">${['Patients','Dashboard','Calc','Growth','Alerts']
      .map(t => `<button class="bnav-item"><span>${t}</span></button>`).join('')}</nav>
  </div>`;
  const doc = (body, sheet) => `<!doctype html><html><head><meta charset="utf-8"><style>${sheet}</style></head><body>${body}</body></html>`;

  // Returns every box that can be dragged sideways, document included.
  const SCAN = () => {
    const out = [];
    for (const el of [document.documentElement, document.body, ...document.querySelectorAll('body *')]) {
      const over = el.scrollWidth - el.clientWidth;
      if (over <= 0.5 || el.clientWidth <= 0) continue;
      const ox = getComputedStyle(el).overflowX;
      if (ox === 'auto' || ox === 'scroll' || el === document.documentElement || el === document.body) {
        const cls = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').toString().trim();
        out.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls.split(/\s+/)[0] : ''} +${over.toFixed(1)}px`);
      }
    }
    return out;
  };

  for (const [sheet, note, extra] of [[css, '', null], [withNotch(css, 44), ' · 44px notch', 44]]) {
    for (const [name, W, H] of DEVICES) {
      const page = await browser.newPage({ viewport: { width: W, height: H } });
      for (const [screen, body] of [['login', LOGIN], ['app', APP]]) {
        await page.setContent(doc(body, sheet));
        const drags = await page.evaluate(SCAN);
        ok(`${name} ${W}×${H} ${screen}${note}: nothing scrolls sideways`, drags.length === 0, drags);
        // Sideways was only half of it: the ribbon bleed added the SAME 10%
        // DOWNWARDS, and `overflow-x: hidden` would hide the horizontal half
        // of a regression while leaving a vertical scrollbar over nothing.
        // So measure the login scroller's height against its real content.
        if (screen === 'login') {
          const v = await page.evaluate(() => {
            const el = document.querySelector('.login-wrap');
            const cs = getComputedStyle(el);
            const padB = parseFloat(cs.paddingBottom);
            // The lowest real child, in the scroller's own content coordinates.
            let low = 0;
            for (const k of el.children) {
              const b = k.getBoundingClientRect();
              low = Math.max(low, b.bottom - el.getBoundingClientRect().top + el.scrollTop);
            }
            return { need: Math.ceil(low + padB), have: el.scrollHeight, client: el.clientHeight };
          });
          ok(`${name} ${W}×${H} login${note}: no phantom vertical scroll under the content`,
            v.have <= Math.max(v.client, v.need) + 1, v);
        }
      }
      // With a notch, the chrome has to sit INSIDE it, not under it.
      if (extra) {
        await page.setContent(doc(APP, sheet));
        const r = await page.evaluate((inset) => {
          const pad = (sel, side) => {
            const el = document.querySelector(sel);
            return el ? parseFloat(getComputedStyle(el)['padding' + side]) : -1;
          };
          const fab = document.querySelector('.quick-fab').getBoundingClientRect();
          return { topL: pad('.topbar', 'Left'), topR: pad('.topbar', 'Right'),
                   workL: pad('.work-inner', 'Left'), workR: pad('.work-inner', 'Right'),
                   navL: pad('.bottom-nav', 'Left'), navR: pad('.bottom-nav', 'Right'),
                   fabRight: document.documentElement.clientWidth - fab.right, inset };
        }, extra);
        ok(`${name} ${W}×${H}: the topbar clears a ${extra}px notch on both sides`,
          r.topL >= extra && r.topR >= extra, r);
        ok(`${name} ${W}×${H}: so does the workspace`, r.workL >= extra && r.workR >= extra, r);
        // Only below 768px: above it .bottom-nav is display:none and the
        // rail is the navigation, inside .topbar's own inset.
        if (W < 768) ok(`${name} ${W}×${H}: so does the tab bar`, r.navL >= extra && r.navR >= extra, r);
        ok(`${name} ${W}×${H}: and the Calculator button`, r.fabRight >= extra, r);
      }
      await page.close();
    }
  }
  await browser.close();
}

(async () => {
  console.log('\n── #4 measured in Chromium ──');
  await measureInChromium();
  console.log(`\nMOBILE FIT: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})();
