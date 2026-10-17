// verify-fenton-half-week-1017.cjs — the Fenton 2025 rows drawn at exact age
// (2026-10-17 provenance audit; CHANGELOG.md 2026-10-17).
//
// FENTON_WEIGHT/LENGTH/HC hold COMPLETED weeks: the row for 25 is infants of
// 25+0 to 25+6, mean age 25.5. The official chart draws each row half a week
// later, at GA + 0.5 (Fenton 2025 Methods, PMC12391854, doi
// 10.1111/ppe.70035). The app plots the infant at exact PMA but drew row GA at
// x = GA and read the percentile there, so every curve sat half a week early:
// 33–144 g too heavy at 23–36 wk, and an infant on the official 10th read
// about the 5th.
//
//   §1  An infant on the official p10 / p50 / p90 at an exact PMA reads about
//       the 10th / 50th / 90th. The weights are the official chart at exact
//       GA.0, digitised from ucalgary.ca's 2025_English_Boys/Girls.pdf in the
//       audit (audit_growth.md § 1d, "chart at exact GA.0"), so they are
//       independent of data.js. Tolerance: the digitiser's ±10–15 g error bar
//       plus linear interpolation between weekly rows, which is ±2 points at
//       p10, ±3 at p50 and ±4 at p90 (the bands are 6, 6 and 4 g per point).
//   §2  The weight curve: row GA is drawn at GA + 0.5. It starts at 22.5,
//       where the first row sits (nothing is extrapolated), and ends at the
//       42-week axis edge, between the 41 and 42 rows.
//   §3  The edges. Before PMA 22+4 there is no reference to read against, so
//       the readout says so instead of extrapolating; a measurement exactly at
//       42+0 is still read.
//   §4  Length and HC: the same half-week placement, and a note on both tabs
//       that those curves are not verified against a numeric source (none is
//       public). The weight tab carries no such note.
//   §5  A measurement on DOL 1 is size at birth, read by completed week
//       against the rows as published (Vera, on this PR): born 26+0 to 26+6
//       is row 26. From DOL 2 on, the reading is at exact age.
//
// ── NEGATIVE CONTROL ───────────────────────────────────────────────────────
// Run against the commit before the change; every section must go red:
//   d=$(mktemp -d)
//   git archive --format=tar 55d893d | tar -x -C "$d"
//   cp test/verify-fenton-half-week-1017.cjs "$d/test/"
//   cp -r node_modules "$d/node_modules"
//   ( cd "$d" && TZ=Asia/Bangkok node test/verify-fenton-half-week-1017.cjs )
// Expected there: 43 FAILED (10 passed). §1 reads the official p10 / p50 /
// p90 as about the 5th / 33rd–42nd / 70th–81st, §2 finds the 50th starting
// at 22.0 and passing through row GA at GA.0, §3 finds 22+2 read as ~18th,
// §4 finds no note on Length or HC, and §5 reads a birth at 26+6 against the
// 26/27 interpolation. Of the 10 that pass, 8 are controls (the point is
// still plotted, Weight has no note, the curve stays inside the 42-week
// edge, a DOL-2 weight is read at exact age), and 2 are births at exactly
// GA+0, which the old code read at x = GA, the same row by luck.
//
// Same dev-only dependencies as the other jsdom harnesses (test/README.md).
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0, n = 0;
function eq(name, got, want) {
  const yes = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${yes ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(72)}${yes ? '' : ` got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
  yes ? pass++ : fail++;
}
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(72)}${cond ? '' : '  ' + JSON.stringify(detail ?? '')}`);
  cond ? pass++ : fail++;
}
async function section(title, fn) {
  console.log(`\n── ${title} ──`);
  try { await fn(); } catch (e) { ok(`(section ran to the end) ${e.message}`, false, e.stack.split('\n').slice(0, 4)); }
}

// ── jsdom + the real modules ──────────────────────────────────────────────
const dom = new JSDOM('<!doctype html><html><body><div id="probe"></div></body></html>',
  { url: 'https://localhost/', pretendToBeVisual: true });
const { window } = dom;
Object.assign(global, {
  window, document: window.document, self: window,
  HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
  getComputedStyle: window.getComputedStyle,
  sessionStorage: window.sessionStorage, localStorage: window.localStorage,
  Event: window.Event, MouseEvent: window.MouseEvent,
  requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: clearTimeout,
  IS_REACT_ACT_ENVIRONMENT: true,
});
// FentonChart observes its container; jsdom has no ResizeObserver, so the
// chart keeps its 760-wide design scale and every coordinate below is in it.
global.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
global.ReactDOM = ReactDOM; window.ReactDOM = ReactDOM;

const load = (f) => vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + f, 'utf8'), {
  presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
  filename: f, configFile: false, babelrc: false,
}).code);
vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
['icons.jsx', 'fenton.jsx'].forEach(load);
const D = window.NEOFEED_DATA;

const root = ReactDOM.createRoot(document.getElementById('probe'));
const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 10)); }); };
const probe = () => document.getElementById('probe');
const chart = async (patient) => {
  await act(async () => { root.render(React.createElement(window.FentonChart, { patient, entries: [], currentDol: 15 })); });
  await flush();
};
const tab = async (label) => {
  const b = [...probe().querySelectorAll('.seg button')].find(x => x.textContent.trim() === label);
  if (!b) throw new Error(`no "${label}" tab`);
  await act(async () => { b.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await flush();
};

// ── Fixtures: shapes only, no real infant ─────────────────────────────────
// An infant measured on DOL 15, so the point sits at exact PMA GA + 2 weeks
// (pma0 + (DOL − 1)/7). Born two weeks before the PMA under test, so it is a
// growth-monitoring reading, not a size-at-birth one.
const atPma = (sex, pmaWeeks, pmaDays, m) => ({
  sessionId: `T-${sex}-${pmaWeeks}${pmaDays}`, name: 'ทด', initials: 'ทด', sex, bw: 900,
  ga: (pmaWeeks - 2) + pmaDays / 10,          // WW.D shorthand: 28.4 = 28+4
  weights: m.w != null ? [{ dol: 15, w: m.w }] : [],
  lengths: m.l != null ? [{ dol: 15, v: m.l }] : [],
  hcs: m.hc != null ? [{ dol: 15, v: m.hc }] : [],
});

// The side panel's "Current trajectory" value, e.g. "~10th".
const readout = () => {
  const box = probe().querySelector('.fenton-trajectory');
  return box ? box.children[1].textContent.trim() : null;
};
const centile = (s) => { const m = /^~(\d+)th$/.exec(s || ''); return m ? Number(m[1]) : null; };
const readoutHint = () => {
  const box = probe().querySelector('.fenton-trajectory');
  return box ? box.children[2].textContent.trim() : null;
};

// The chart's own scales, recovered from what it drew: the x tick labels
// (22 … 42) and the first two horizontal grid lines (0 and one y step). The
// chart is the <svg> holding the 50th-centile path; the card header's icon is
// an <svg> too.
const GRID = 'oklch(94% 0.008 198)';
const P50 = 'oklch(38.5% 0.047 170)';
const scales = (yStep) => {
  const svg = probe().querySelector(`path[stroke="${P50}"]`).ownerSVGElement;
  const ticks = [...svg.querySelectorAll('text[text-anchor="middle"]')]
    .filter(t => /^\d+$/.test(t.textContent)).map(t => [Number(t.textContent), Number(t.getAttribute('x'))]);
  const x22 = ticks.find(t => t[0] === 22)[1], x42 = ticks.find(t => t[0] === 42)[1];
  const rows = [...svg.querySelectorAll('line')]
    .filter(l => l.getAttribute('stroke') === GRID && l.getAttribute('y1') === l.getAttribute('y2'))
    .map(l => Number(l.getAttribute('y1')));
  const y0 = rows[0], y1 = rows[1];
  return { x: (wk) => x22 + (wk - 22) * (x42 - x22) / 20, y: (v) => y0 + v * (y1 - y0) / yStep };
};
// The on-curve points of the 50th-centile path: the M point and each C's end.
const p50Anchors = () => {
  const d = probe().querySelector(`path[stroke="${P50}"]`).getAttribute('d');
  return [...d.matchAll(/([MC])([^MC]*)/g)].map(([, cmd, rest]) => {
    const v = rest.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g).map(Number);
    return cmd === 'M' ? [v[0], v[1]] : [v[4], v[5]];
  });
};
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
const hasAnchor = (pts, x, y) => pts.some(p => near(p[0], x) && near(p[1], y));

(async () => {

  // ══════════════════════════════════════════════════════════════════════
  await section('§1 An infant on the official p10 / p50 / p90 reads ~10th / ~50th / ~90th', async () => {
    // [sex, exact PMA (wk+0), official p10, p50, p90 in g] — audit § 1d.
    const OFFICIAL = [
      ['boys', 26, 712, 867, 1021],
      ['boys', 30, 1197, 1438, 1722],
      ['boys', 36, 2254, 2689, 3185],
      ['girls', 26, 674, 818, 960],
      ['girls', 30, 1125, 1361, 1624],
      ['girls', 34, 1761, 2135, 2567],
    ];
    for (const [sex, pma, ...g] of OFFICIAL) {
      for (const [want, w, tol] of [[10, g[0], 2], [50, g[1], 3], [90, g[2], 4]]) {
        await chart(atPma(sex, pma, 0, { w }));
        const got = readout();
        ok(`${sex} ${pma}+0 wk, ${w} g (official ${want}th) reads ${want}th ±${tol}`,
           centile(got) != null && Math.abs(centile(got) - want) <= tol, got);
      }
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§2 Weight curve: row GA drawn at GA + 0.5, from 22.5 to the 42-week edge', async () => {
    const B = D.FENTON_WEIGHT.boys;
    const row = (ga) => B.find(r => r[0] === ga);
    await chart(atPma('boys', 30, 0, { w: 1400 }));
    const s = scales(1000), pts = p50Anchors();
    const [x0, y0] = pts[0];
    ok('the 50th starts at 22.5 wk, where the GA-22 row sits', near(x0, s.x(22.5)), { x0, want: s.x(22.5) });
    ok('…at the GA-22 row\'s 50th (505 g), not an extrapolated value', near(y0, s.y(row(22)[3])), { y0, want: s.y(row(22)[3]) });
    for (const ga of [24, 30, 36]) {
      ok(`the GA-${ga} row's 50th (${row(ga)[3]} g) is drawn at ${ga}.5 wk`, hasAnchor(pts, s.x(ga + 0.5), s.y(row(ga)[3])), pts.map(p => p.map(v => +v.toFixed(1))));
      ok(`…and nothing is drawn at ${ga}.0 wk`, !pts.some(p => near(p[0], s.x(ga))), null);
    }
    const [xe, ye] = pts[pts.length - 1];
    const end = (row(41)[3] + row(42)[3]) / 2;
    ok('the 50th ends at the 42-week axis edge', near(xe, s.x(42)), { xe, want: s.x(42) });
    ok(`…halfway between the 41 and 42 rows (${end} g)`, near(ye, s.y(end)), { ye, want: s.y(end) });
    ok('no curve point lies past the 42-week edge', pts.every(p => p[0] <= s.x(42) + 0.01), null);
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§3 The edges: no reading before 22+4, a reading at 42+0', async () => {
    await chart(atPma('girls', 22, 2, { w: 430 }));
    eq('a girl at PMA 22+2 has no percentile (the curves start at 22.5)', readout(), '—');
    ok('…and the panel says the reference starts at 22+4', /22\+4/.test(readoutHint() || ''), readoutHint());
    ok('…while her point is still plotted', !!probe().querySelector('circle[fill="oklch(50% 0.18 25)"]'), null);

    await chart(atPma('girls', 22, 4, { w: 430 }));
    ok('at PMA 22+4 the same girl is read', centile(readout()) != null, readout());

    const B = D.FENTON_WEIGHT.boys;
    const mid50 = (B.find(r => r[0] === 41)[3] + B.find(r => r[0] === 42)[3]) / 2;
    await chart(atPma('boys', 42, 0, { w: mid50 }));
    eq(`a boy at PMA 42+0 on the 41/42-row midpoint 50th (${mid50} g) reads ~50th`, readout(), '~50th');
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§4 Length and HC: same placement, and a not-verified note on both tabs', async () => {
    const NOTE = 'ยังไม่ได้ตรวจเทียบกับตัวเลขต้นฉบับ';
    const noteText = () => {
      const el = [...probe().querySelectorAll('[role="note"]')].find(e => e.textContent.includes(NOTE));
      return el ? el.textContent : null;
    };
    const L = D.FENTON_LENGTH.boys, H = D.FENTON_HC.boys;
    const lrow = (ga) => L.find(r => r[0] === ga), hrow = (ga) => H.find(r => r[0] === ga);

    // On the official 50th at ~30.5 wk: the GA-30 row's own 50th, at PMA 30+4.
    await chart(atPma('boys', 30, 4, { w: 1500, l: lrow(30)[3], hc: hrow(30)[3] }));
    eq('the Weight tab carries no not-verified note', noteText(), null);

    await tab('Length');
    ok('the Length tab says its curves are not verified', !!noteText() && /Length/.test(noteText()), noteText());
    const ls = scales(10), lp = p50Anchors();
    ok('the length 50th starts at 22.5 wk', near(lp[0][0], ls.x(22.5)), { x: lp[0][0], want: ls.x(22.5) });
    ok(`the GA-30 length row's 50th (${lrow(30)[3]} cm) is drawn at 30.5 wk`, hasAnchor(lp, ls.x(30.5), ls.y(lrow(30)[3])), lp.map(p => p.map(v => +v.toFixed(1))));
    const lEnd = lrow(38)[3] + (42 - 38.5) / 4 * (lrow(42)[3] - lrow(38)[3]);
    ok('the length 50th ends at the 42-week edge, between the 38 and 42 rows', near(lp[lp.length - 1][0], ls.x(42)) && near(lp[lp.length - 1][1], ls.y(lEnd)), lp[lp.length - 1]);
    const lr = readout();
    ok(`a boy at 30+4 wk on the GA-30 row's 50th (${lrow(30)[3]} cm) reads 50th ±2`, centile(lr) != null && Math.abs(centile(lr) - 50) <= 2, lr);

    await tab('HC');
    ok('the HC tab says its curves are not verified', !!noteText() && /HC/.test(noteText()), noteText());
    const hs = scales(5), hp = p50Anchors();
    ok('the HC 50th starts at 22.5 wk', near(hp[0][0], hs.x(22.5)), { x: hp[0][0], want: hs.x(22.5) });
    ok(`the GA-30 HC row's 50th (${hrow(30)[3]} cm) is drawn at 30.5 wk`, hasAnchor(hp, hs.x(30.5), hs.y(hrow(30)[3])), hp.map(p => p.map(v => +v.toFixed(1))));
    const hr = readout();
    ok(`a boy at 30+4 wk on the GA-30 row's 50th HC (${hrow(30)[3]} cm) reads 50th ±2`, centile(hr) != null && Math.abs(centile(hr) - 50) <= 2, hr);

    await tab('Weight');
    eq('back on Weight, the note is gone', noteText(), null);
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§5 A DOL-1 measurement is size at birth: read by completed week', async () => {
    // Vera on this PR: read at exact age, a boy born 26+0 at 740 g (below
    // row 26's p10, 767 g) showed "~16th", because the exact-age p10 at 26.0
    // is 716 g. Size at birth is classified by completed week, against the
    // row as published, so a measurement on DOL 1 is read that way.
    const born = (sex, ga, m, more = []) => ({
      sessionId: `B-${sex}-${ga}`, name: 'ทด', initials: 'ทด', sex, bw: m.w || 900, ga,
      weights: [{ dol: 1, w: m.w ?? null, l: m.l ?? null, hc: m.hc ?? null }, ...more],
      lengths: [], hcs: [],
    });
    const B = D.FENTON_WEIGHT.boys, r26 = B.find(r => r[0] === 26);
    // Row 26: p3 684, p10 767, p50 938.
    const cw = (v, lo, hi, plo, phi) => Math.round(plo + (v - lo) / (hi - lo) * (phi - plo));

    await chart(born('boys', 26.0, { w: 740 }));
    eq('born 26+0 at 740 g reads against row 26 (≈8th, below the 10th)', readout(), `~${cw(740, r26[1], r26[2], 3, 10)}th`);
    ok('…and says it is read from the size-at-birth row for 26 weeks',
       /size at birth/.test(readoutHint() || '') && /26/.test(readoutHint() || ''), readoutHint());

    await chart(born('boys', 26.6, { w: 790 }));
    eq('born 26+6 at 790 g reads against the same row 26 (≈15th)', readout(), `~${cw(790, r26[2], r26[3], 10, 50)}th`);

    const L30 = D.FENTON_LENGTH.boys.find(r => r[0] === 30);
    await chart(born('boys', 30.0, { w: 1300, l: L30[3] }));
    await tab('Length');
    eq(`born 30+0 at row 30's 50th length (${L30[3]} cm) reads ~50th`, readout(), '~50th');
    // Length rows are 4 weeks apart: born 28+3 reads halfway between rows 26 and 30.
    const L26 = D.FENTON_LENGTH.boys.find(r => r[0] === 26);
    await chart(born('boys', 28.3, { w: 1100, l: +((L26[3] + L30[3]) / 2).toFixed(2) }));
    await tab('Length');
    eq('born 28+3 on the 26/30 midpoint 50th length reads ~50th', readout(), '~50th');
    ok('…from the size-at-birth rows for 28 weeks', /size at birth/.test(readoutHint() || '') && /28/.test(readoutHint() || ''), readoutHint());
    await tab('Weight');

    // Born 22+2: the exact-age curves start at 22.5, but row 22 is the size at birth.
    const G22 = D.FENTON_WEIGHT.girls.find(r => r[0] === 22);
    await chart(born('girls', 22.2, { w: G22[3] }));
    eq(`born 22+2 at row 22's 50th (${G22[3]} g) reads ~50th, not "—"`, readout(), '~50th');

    // Control: from DOL 2 on, the reading is growth monitoring at exact age.
    await chart(born('boys', 26.0, { w: 740 }, [{ dol: 2, w: 745 }]));
    ok('a DOL-2 weight is read at exact age, not from the birth row',
       !/size at birth/.test(readoutHint() || '') && centile(readout()) != null, { readout: readout(), hint: readoutHint() });
  });

  await act(async () => { root.unmount(); });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
