// verify-fenton-monitor-1019.cjs — weight from 36.5 weeks is read and drawn
// on Fenton's growth-monitoring curve, not the size-at-birth rows (2026-10-19).
//
// FENTON_WEIGHT is Fenton's size-at-birth table. The growth chart follows it
// to about 37 weeks and then bends towards WHO at 50, so from 37 weeks the app
// read monitoring weights up to 10.2 centile points off Fenton's own
// calculator (verify-fenton-official-1017.cjs § 3). FENTON_WEIGHT_GROWTH_LMS
// (data.js) is that calculator's curve as L, M, S at each half week, solved
// from test/fenton-official-1019.json: fentongrowth.ca's z-scores for made-up
// weights, three per half-week knot plus 12 held-out points per sex.
//
//   §1  The fixture is what fentongrowth.ca returned: 96 points from two
//       submissions, every whole percentile is 100·Φ(z) rounded, every point
//       is a cell of the returned table, and nothing but sex, age and weight
//       was sent.
//   §2  The table is the calculator's answer: at every knot its L, M, S give
//       back the three official z-scores within 0.005, and at 36.5 weeks,
//       where it takes over, its five centiles are the size-at-birth row 36's
//       within 15 g, so the drawn curve has no visible step (worst: girls'
//       97th, 12 g).
//   §3  ASSERTED. The readout of a monitoring weight (DOL 15) from 37 weeks is
//       within ±1 centile point of the official percentile: the 60 points of
//       this round that fall on a whole day, and the 10 growth-mode weights of
//       test/fenton-official-1017.json. ±1 is rounding to a whole centile plus
//       a margin; the table itself is within 0.02.
//   §4  A DOL-1 weight is a size at birth and stays on the size-at-birth rows,
//       as Fenton's Birth size evaluation does: a girl born 40+5 at 3450 g
//       reads within ±5 of the official birth-size percentile on DOL 1, and the
//       same weight at the same PMA on DOL 15 reads the monitoring curve.
//   §5  The drawn 50th passes through M at every knot from 36.5 to 42.0 and
//       still through the size-at-birth row 35 at 35.5.
//
// ── NEGATIVE CONTROL ───────────────────────────────────────────────────────
// Run it against a04ba28, the commit before the change (copy this file and
// its fixture into a `git -c core.autocrlf=false archive` of it, as
// verify-fenton-official-1017.cjs describes). Expected there: §1 passes, and
// §2, §4 and § 5 stop at the missing FENTON_WEIGHT_GROWTH_LMS; § 3 fails
// where the size-at-birth rows are more than a point off. Counts in
// test/README.md.
//
// Same dev-only dependencies as the other jsdom harnesses (test/README.md).
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fenton-official-1019.json'), 'utf8'));
const OCT17 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fenton-official-1017.json'), 'utf8'));

let pass = 0, fail = 0, n = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(76)}${cond ? '' : '  ' + JSON.stringify(detail ?? '')}`);
  cond ? pass++ : fail++;
}
async function section(title, fn) {
  console.log(`\n── ${title} ──`);
  try { await fn(); } catch (e) { ok(`(section ran to the end) ${e.message}`, false, e.stack.split('\n').slice(0, 4)); }
}

// Φ, the standard normal CDF (Abramowitz & Stegun 7.1.26, error < 1.5e-7).
const phi = (z) => {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const e = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
  return z >= 0 ? (1 + e) / 2 : (1 - e) / 2;
};
const lmsZ = (L, M, S, v) => Math.abs(L) < 1e-6 ? Math.log(v / M) / S : (Math.pow(v / M, L) - 1) / (L * S);
const lmsValue = (L, M, S, z) => Math.abs(L) < 1e-6 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L);
const CENTILE_Z = [-1.88079, -1.28155, 0, 1.28155, 1.88079];

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
  await act(async () => { root.render(null); });
  await act(async () => { root.render(React.createElement(window.FentonChart, { patient, entries: [], currentDol: 15 })); });
  await flush();
};
const readout = () => {
  const box = probe().querySelector('.fenton-trajectory');
  return box ? box.children[1].textContent.trim() : null;
};

// ── Fixtures: shapes only, no real infant ─────────────────────────────────
// A weight on DOL 15 of an infant born two weeks earlier sits at exact PMA
// W+D (pma0 + (DOL − 1)/7): growth monitoring. One on DOL 1 is a size at birth.
const atPma = (sex, W, Dd, w) => ({
  sessionId: `M-${sex}-${W}${Dd}`, name: 'ทด', initials: 'ทด', sex, bw: 900,
  ga: (W - 2) + Dd / 10, weights: [{ dol: 15, w }], lengths: [], hcs: [],
});
const born = (sex, W, Dd, w) => ({
  sessionId: `M-${sex}-${W}${Dd}-b`, name: 'ทด', initials: 'ทด', sex, bw: w,
  ga: W + Dd / 10, weights: [{ dol: 1, w }], lengths: [], hcs: [],
});
// "36 1/2" → null (no whole day), "37 3/7" → [37, 3], "37" → [37, 0]
const wholeDay = (ga) => { const m = /^(\d+)(?: (\d)\/7)?$/.exec(ga); return m ? [Number(m[1]), Number(m[2] || 0)] : null; };

const parse = (s) => {
  if (s === '<3rd') return { below: 3 };
  if (s === '>97th') return { above: 97 };
  const m = /^~(\d+)(?:st|nd|rd|th)$/.exec(s || '');
  return m ? { at: Number(m[1]) } : null;
};
const gapOf = (app, off) => {
  if (!app) return null;
  if (app.below != null) return off < app.below ? 0 : app.below - off;
  if (app.above != null) return off > app.above ? 0 : app.above - off;
  return app.at - off;
};
const fmt = (v) => v == null ? '—' : (v > 0 ? '+' : '') + (Math.round(v * 10) / 10);

// The chart's scales and its 50th-centile anchors (verify-fenton-half-week-1017.cjs).
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
  return { x: (wk) => x22 + (wk - 22) * (x42 - x22) / 20, y: (v) => rows[0] + v * (rows[1] - rows[0]) / yStep };
};
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
  await section('§1 The fixture is what fentongrowth.ca returned', async () => {
    const P = FIXTURE.points, S = FIXTURE.source;
    ok(`96 points from 2 submissions (${P.length}, ${Object.keys(FIXTURE.raw).length})`,
       P.length === 96 && Object.keys(FIXTURE.raw).length === 2, P.length);
    ok('the source names the calculator, its URL, version 2.1.3.0 and the date',
       S.url === 'https://fentongrowth.ca/' && S.version === '2.1.3.0' && S.retrieved === '2026-10-19', S);
    const off = P.filter(p => Math.round(100 * phi(p.z)) !== p.pct);
    ok('every whole percentile is 100·Φ(z) rounded', off.length === 0, off);
    const keys = new Set(P.flatMap(Object.keys));
    ok('a point carries sex, GA, age, weight, z, pct and its use, nothing else',
       [...keys].sort().join() === 'age,aimedAt,ga,pct,sex,use,value,z', [...keys]);
    const bad = P.filter(p => {
      const lines = FIXTURE.raw[`${p.sex}-growth`].filter(l => /^\d/.test(l)).map(l => l.split('\t'));
      return !lines.some(c => Math.abs(Number(c[0]) - p.age) < 6e-5 && Number(c[1]) === p.value
        && Number(c[2]) === p.z && Number(c[4]) === p.pct && c[5] === '' && c[9] === '');
    });
    ok('each point is a cell of the returned table; no head or length was sent', bad.length === 0, bad);
    for (const sex of ['boys', 'girls']) {
      const k = P.filter(p => p.sex === sex && p.use === 'knot'), h = P.filter(p => p.sex === sex && p.use === 'held-out');
      ok(`${sex}: 36 knot points (3 at each half week 36.5–42) and 12 held out`,
         k.length === 36 && h.length === 12 && new Set(k.map(p => p.age)).size === 12, [k.length, h.length]);
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§2 FENTON_WEIGHT_GROWTH_LMS gives back the official z at every knot', async () => {
    for (const sex of ['boys', 'girls']) {
      const G = D.FENTON_WEIGHT_GROWTH_LMS[sex];
      ok(`${sex}: 12 knots, 36.5 to 42.0 every half week`,
         G.length === 12 && G.every((r, i) => r[0] === 36.5 + 0.5 * i), G.map(r => r[0]));
      let worst = 0, at = null;
      for (const [t, L, M, S] of G) {
        for (const p of FIXTURE.points.filter(q => q.sex === sex && q.use === 'knot' && Math.abs(q.age - t) < 1e-6)) {
          const d = Math.abs(lmsZ(L, M, S, p.value) - p.z);
          if (d > worst) { worst = d; at = { t, w: p.value, z: p.z }; }
        }
      }
      ok(`${sex}: every knot's three official z within 0.005 (worst ${worst.toFixed(4)})`, worst <= 0.005, at);
      const row36 = D.FENTON_WEIGHT[sex].find(r => r[0] === 36).slice(1);
      const [, L, M, S] = G[0];
      const diff = CENTILE_Z.map((z, i) => Math.round(lmsValue(L, M, S, z) - row36[i]));
      // 15 g: under one pixel on the chart (about 13 g per pixel), and the
      // ±15 g within which the audit called the two references the same.
      ok(`${sex}: at 36.5 its five centiles are size-at-birth row 36's within 15 g (${diff.join(', ')})`,
         diff.every(d => Math.abs(d) <= 15), diff);
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§3 A monitoring weight from 37 wk reads the official percentile ±1 (asserted)', async () => {
    const pts = [
      ...FIXTURE.points.filter(p => p.age >= 37 && wholeDay(p.ga)).map(p => ({ ...p, from: '10-19' })),
      ...OCT17.points.filter(p => p.mode === 'growth' && p.measure === 'weight' && Number(p.ga.split('+')[0]) >= 37)
        .map(p => ({ ...p, ga: p.ga.replace(/\+(\d)/, (m, d) => d === '0' ? '' : ` ${d}/7`), from: '10-17' })),
    ];
    ok(`70 points: 60 of this round on a whole day, 10 of 17 Oct (${pts.length})`, pts.length === 70, pts.length);
    let worst = 0, sum = 0;
    for (const p of pts) {
      const [W, Dd] = wholeDay(p.ga);
      await chart(atPma(p.sex, W, Dd, p.value));
      const s = readout(), off = 100 * phi(p.z), gap = gapOf(parse(s), off);
      if (gap != null) { worst = Math.max(worst, Math.abs(gap)); sum += Math.abs(gap); }
      ok(`${p.sex} ${p.ga} wk, ${p.value} g (${p.from}): app ${s}, official ${off.toFixed(1)} (gap ${fmt(gap)})`,
         gap != null && Math.abs(gap) <= 1, { s, off, gap });
    }
    console.log(`  … mean |gap| ${(sum / pts.length).toFixed(2)}, worst ${worst.toFixed(2)} centile points`);
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§4 A DOL-1 weight stays on the size-at-birth rows', async () => {
    const b = OCT17.points.find(p => p.mode === 'birth' && p.sex === 'girls' && p.ga === '40+5' && p.measure === 'weight');
    await chart(born('girls', 40, 5, b.value));
    const dol1 = readout(), birthOff = 100 * phi(b.z), g1 = gapOf(parse(dol1), birthOff);
    ok(`girl born 40+5 at ${b.value} g, DOL 1: ${dol1}, official birth size ${birthOff.toFixed(1)} ±5`,
       g1 != null && Math.abs(g1) <= 5, { dol1, birthOff });
    const [L, M, S] = (() => {
      const G = D.FENTON_WEIGHT_GROWTH_LMS.girls, t = 40 + 5 / 7;
      const lo = G.filter(r => r[0] <= t).pop(), hi = G.find(r => r[0] >= t);
      const f = (t - lo[0]) / (hi[0] - lo[0]);
      return [1, 2, 3].map(j => lo[j] + f * (hi[j] - lo[j]));
    })();
    const mon = 100 * phi(lmsZ(L, M, S, b.value));
    await chart(atPma('girls', 40, 5, b.value));
    const dol15 = readout(), g15 = gapOf(parse(dol15), mon);
    ok(`the same weight at 40+5 on DOL 15 reads the monitoring curve: ${dol15}, table ${mon.toFixed(1)} ±1`,
       g15 != null && Math.abs(g15) <= 1, { dol15, mon });
    ok('…which is not the DOL-1 reading (the two references differ here)', dol1 !== dol15, { dol1, dol15 });
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§5 The drawn 50th follows M from 36.5 to 42.0', async () => {
    await chart(atPma('boys', 39, 0, 3300));
    const s = scales(1000), pts = p50Anchors();
    const G = D.FENTON_WEIGHT_GROWTH_LMS.boys;
    const missing = G.filter(([t, , M]) => !hasAnchor(pts, s.x(t), s.y(M))).map(r => r[0]);
    ok('the 50th passes through M at all 12 knots', missing.length === 0, missing);
    const r35 = D.FENTON_WEIGHT.boys.find(r => r[0] === 35);
    ok(`…and still through size-at-birth row 35's 50th (${r35[3]} g) at 35.5`, hasAnchor(pts, s.x(35.5), s.y(r35[3])), null);
    ok('…with no other anchor between 35.5 and 36.5', !pts.some(p => p[0] > s.x(35.5) + 0.01 && p[0] < s.x(36.5) - 0.01), null);
  });

  console.log(`\n${fail ? 'FENTON MONITOR 1019: ' + fail + ' FAILED' : 'FENTON MONITOR 1019: ALL PASS'} (${pass} passed, ${fail} failed)`);
  process.exit(fail ? 1 : 0);
})();
