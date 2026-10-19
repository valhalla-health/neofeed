// verify-fenton-official-1017.cjs — NeoFeed's Fenton readout against the
// official Fenton 2025 calculator, point by point (2026-10-17).
//
// test/fenton-official-1017.json holds 75 made-up measurements (51 rows, both
// sexes, weight at exact PMA 23–41 wk, length and HC at eight PMAs, ten
// size-at-birth rows) and what fentongrowth.ca, Fenton's own plotter (API
// 2.1.3.0), returned for each: a z-score to 3 decimals and a whole percentile.
// This harness mounts the real FentonChart for every point and compares its
// "Current trajectory" readout with 100·Φ(z). Until NeoFeed reads Fenton's
// LMS parameters (not public; Pp has asked tfenton@ucalgary.ca), this is how
// the app's error is known. Afterwards it is the acceptance test.
//
//   §1  The fixture is what the calculator returned: every whole percentile
//       is Φ(z) rounded, each point is a cell of the returned table at the GA
//       it was sent with, and a point holds nothing but sex, age and size.
//   §2  ASSERTED. Weight, growth monitoring, PMA under 37 weeks, and weight
//       on DOL 1 at any GA: within ±5 points of the official
//       percentile, and "<3rd" / ">97th" only when the official value is
//       below 3 / above 97. Why ±5: the app reads linearly between its p10,
//       p50 and p90 curves, and a straight line between z = −1.28 and 0
//       strays at most 4.0 points from Φ (at z ≈ −0.70, the 24th, read as the
//       28th; mirrored above the median), plus 0.5 for rounding to a whole
//       centile. FENTON_WEIGHT under 37 weeks is the official table, so
//       nothing else should be off. DOL 1 is read at exact GA, as the
//       official Birth size evaluation reads it (24 2/7 is GA_weeks 24.2857),
//       and after 37 weeks the size-at-birth rows are what that mode uses
//       (Pp, 2026-10-17, after this harness found a completed-week reading up
//       to 21 points off).
//   §3  RECORDED, NOT ASSERTED. Where the app is known to be off, the gap is
//       printed and the run still passes; each point only has to produce a
//       reading through the path it is meant to take:
//         - weight at PMA 37 wk and later: FENTON_WEIGHT holds Fenton's
//           size-at-birth rows there, and growth monitoring uses another curve;
//         - length and HC, on DOL 1 too: 4-weekly rows that no numeric
//           source verifies, so a gap there is the rows', not the method's.
//   §4  The report: every point, app against official, worst gap first in
//       each group. `--md` also prints it as Markdown tables for a PR body.
//
// ── NEGATIVE CONTROL ───────────────────────────────────────────────────────
// §2 must go red on the placement this PR's first commit fixed. Run it
// against 55d893d, where row GA was drawn at x = GA:
//   d=$(mktemp -d)
//   git archive --format=tar 55d893d | tar -x -C "$d"
//   cp test/verify-fenton-official-1017.cjs test/fenton-official-1017.json "$d/test/"
//   ( cd "$d" && TZ=Asia/Bangkok node test/verify-fenton-official-1017.cjs )   # NODE_PATH = the jsdom set
// Expected there: 30 FAILED (51 passed). §2 fails 24 of its 31 PMA < 37 wk
// weight points (the official 50th reads the 33rd–40th, the official 90th
// the 69th–80th; the 7 that pass are tails, where half a week moves the
// centile by less than 5 points) and 6 of its 10 DOL-1 weight points. §1 and
// §3 pass: they do not depend on the placement. Against ea0abe0, which read
// DOL 1 by completed week, all 18 DOL-1 points fail: the 10 weights in §2
// (worst: a boy born 26+0 at 940 g read ~50th against row 26; the official
// calculator says the 71st), and the 8 lengths and HCs in §3 on their
// size-at-birth label.
//
// Same dev-only dependencies as the other jsdom harnesses (test/README.md).
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fenton-official-1017.json'), 'utf8'));
const MD = process.argv.includes('--md');

let pass = 0, fail = 0, n = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(72)}${cond ? '' : '  ' + JSON.stringify(detail ?? '')}`);
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
const officialPct = (p) => 100 * phi(p.z);

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

const root = ReactDOM.createRoot(document.getElementById('probe'));
const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 10)); }); };
const probe = () => document.getElementById('probe');
// Unmount first: the chart keeps its Weight/Length/HC tab in state, and a
// fresh mount starts on Weight.
const chart = async (patient) => {
  await act(async () => { root.render(null); });
  await act(async () => { root.render(React.createElement(window.FentonChart, { patient, entries: [], currentDol: 15 })); });
  await flush();
};
const TAB = { weight: 'Weight', length: 'Length', hc: 'HC' };
const tab = async (measure) => {
  if (measure === 'weight') return;
  const b = [...probe().querySelectorAll('.seg button')].find(x => x.textContent.trim() === TAB[measure]);
  if (!b) throw new Error(`no "${TAB[measure]}" tab`);
  await act(async () => { b.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await flush();
};
const readout = () => {
  const box = probe().querySelector('.fenton-trajectory');
  return box ? box.children[1].textContent.trim() : null;
};
const hint = () => {
  const box = probe().querySelector('.fenton-trajectory');
  return box ? box.children[2].textContent.trim() : null;
};

// ── Fixtures: shapes only, no real infant ─────────────────────────────────
const wk = (p) => Number(p.ga.split('+')[0]);
const dd = (p) => Number(p.ga.split('+')[1]);
const one = (p) => ({
  w: p.measure === 'weight' ? p.value : null,
  l: p.measure === 'length' ? p.value : null,
  hc: p.measure === 'hc' ? p.value : null,
});
// Measured on DOL 15 by an infant born two weeks earlier, so the point sits
// at exact PMA wk+dd (pma0 + (DOL − 1)/7): growth monitoring.
const atPma = (p) => {
  const m = one(p);
  return {
    sessionId: `O-${p.sex}-${p.ga}`, name: 'ทด', initials: 'ทด', sex: p.sex, bw: 900,
    ga: (wk(p) - 2) + dd(p) / 10,                 // WW.D shorthand: 28.4 = 28+4
    weights: m.w != null ? [{ dol: 15, w: m.w }] : [],
    lengths: m.l != null ? [{ dol: 15, v: m.l }] : [],
    hcs: m.hc != null ? [{ dol: 15, v: m.hc }] : [],
  };
};
// Measured on DOL 1 by an infant born at wk+dd: size at birth.
const born = (p) => {
  const m = one(p);
  return {
    sessionId: `O-${p.sex}-${p.ga}-b`, name: 'ทด', initials: 'ทด', sex: p.sex, bw: m.w || 900,
    ga: wk(p) + dd(p) / 10,
    weights: [{ dol: 1, w: m.w, l: m.l, hc: m.hc }], lengths: [], hcs: [],
  };
};

// The app's readout as a number, or the side of the range it names. Any
// ordinal suffix: the app printed "~51th" when this harness was written, and
// "~51st" since; verify-fenton-half-week-1017.cjs § 6 pins the suffix.
const parse = (s) => {
  if (s === '<3rd') return { below: 3 };
  if (s === '>97th') return { above: 97 };
  const m = /^~(\d+)(?:st|nd|rd|th)$/.exec(s || '');
  return m ? { at: Number(m[1]) } : null;
};
// App minus official, in centile points. "<3rd" against an official 1.4 is
// no gap; against an official 4.2 it is at least −1.2.
const gapOf = (app, off) => {
  if (!app) return null;
  if (app.below != null) return off < app.below ? 0 : app.below - off;
  if (app.above != null) return off > app.above ? 0 : app.above - off;
  return app.at - off;
};
const groupOf = (p) =>
  p.mode === 'birth' ? (p.measure === 'weight' ? 'DOL 1 weight (exact GA)' : 'DOL 1 length / HC (exact GA)')
  : p.measure !== 'weight' ? (p.measure === 'hc' ? 'HC' : 'Length')
  : wk(p) >= 37 ? 'Weight, PMA 37+ wk' : 'Weight, PMA < 37 wk';

const ASSERTED = ['Weight, PMA < 37 wk', 'DOL 1 weight (exact GA)'];
const rows = [];
const fmt = (v, d = 1) => v == null ? '—' : String(Math.round(v * 10 ** d) / 10 ** d);
const signed = (v) => v == null ? '—' : (v > 0 ? '+' : '') + fmt(v);

(async () => {

  // ══════════════════════════════════════════════════════════════════════
  await section('§1 The fixture is what fentongrowth.ca returned', async () => {
    const P = FIXTURE.points, S = FIXTURE.source;
    ok(`75 points from 4 submissions (${P.length}, ${Object.keys(FIXTURE.raw).length})`,
       P.length === 75 && Object.keys(FIXTURE.raw).length === 4, P.length);
    ok('the source names the calculator, its URL, version 2.1.3.0 and the date',
       S.url === 'https://fentongrowth.ca/' && S.version === '2.1.3.0' && S.retrieved === '2026-10-17', S);
    const off = P.filter(p => Math.round(officialPct(p)) !== p.pct);
    ok('every whole percentile is 100·Φ(z) rounded (no typo in z or pct)', off.length === 0, off);
    const keys = new Set(P.flatMap(Object.keys));
    ok('a point carries sex, mode, GA, measure, value, z and pct, nothing else',
       [...keys].sort().join() === 'ga,measure,mode,pct,sex,value,z', [...keys]);
    // GA_weeks, then (value, z, changeZ, %) for weight, head and length.
    const COL = { weight: 1, hc: 5, length: 9 };
    const bad = P.filter(p => {
      const cells = FIXTURE.raw[`${p.sex}-${p.mode}`].slice(4).map(l => l.split('\t'));
      const r = cells.find(c => Math.abs(Number(c[0]) - (wk(p) + dd(p) / 7)) < 6e-5);
      return !r || Number(r[COL[p.measure]]) !== p.value || Number(r[COL[p.measure] + 1]) !== p.z
        || Number(r[COL[p.measure] + 3]) !== p.pct;
    });
    ok('each point is a cell of the returned table, at the GA it was sent with', bad.length === 0, bad);
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§2 Weight under 37 wk, and weight on DOL 1: within ±5 points (asserted)', async () => {
    for (const p of FIXTURE.points.filter(q => ASSERTED.includes(groupOf(q)))) {
      const unit = p.measure === 'weight' ? 'g' : 'cm';
      if (p.mode === 'birth') { await chart(born(p)); await tab(p.measure); } else await chart(atPma(p));
      const s = readout(), h = hint() || '', off = officialPct(p), gap = gapOf(parse(s), off);
      rows.push({ p, s, off, gap, asserted: true });
      ok(`${p.sex} ${p.mode === 'birth' ? 'born ' : ''}${p.ga} ${p.measure} ${p.value} ${unit}: app ${s}, official ${fmt(off)} (gap ${signed(gap)})`,
         gap != null && Math.abs(gap) <= 5 && !/size at birth/.test(h), { app: s, official: fmt(off), gap: fmt(gap), hint: h });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§3 Known gaps: recorded, not asserted', async () => {
    for (const p of FIXTURE.points.filter(q => !ASSERTED.includes(groupOf(q)))) {
      const unit = p.measure === 'weight' ? 'g' : 'cm';
      const off = officialPct(p);
      await chart(p.mode === 'birth' ? born(p) : atPma(p)); await tab(p.measure);
      const s = readout(), h = hint() || '', gap = gapOf(parse(s), off);
      rows.push({ p, s, off, gap });
      ok(`${p.sex} ${p.mode === 'birth' ? 'born ' : ''}${p.ga} ${p.measure} ${p.value} ${unit}: app ${s}, official ${fmt(off)} (gap ${signed(gap)})`,
         parse(s) != null && !/size at birth/.test(h), { s, h });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§4 Report: app against official, worst gap first in each group', async () => {
    const GROUPS = ['Weight, PMA < 37 wk', 'DOL 1 weight (exact GA)', 'Weight, PMA 37+ wk', 'Length', 'HC',
      'DOL 1 length / HC (exact GA)'];
    ok(`every point was read (${rows.length} of ${FIXTURE.points.length})`, rows.length === FIXTURE.points.length, rows.length);
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const cells = (r) => {
      const { p } = r, unit = p.measure === 'weight' ? 'g' : 'cm';
      return [p.sex === 'boys' ? 'M' : 'F', p.ga, `${p.measure} ${p.value} ${unit}`, r.s,
        `${fmt(r.off)} (${p.pct}; z ${p.z})`, signed(r.gap)];
    };
    const md = [];
    for (const g of GROUPS) {
      const rs = rows.filter(r => groupOf(r.p) === g).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
      const w = rs[0];
      const summary = `${rs.length} points, ${w.asserted ? 'asserted ±5' : 'recorded, not asserted'}; ` +
        `mean |gap| ${fmt(mean(rs.map(r => Math.abs(r.gap))))}, worst ${signed(w.gap)} ` +
        `(${w.p.sex} ${w.p.ga} ${w.p.measure} ${w.p.value}: app ${w.s}, official ${fmt(w.off)})`;
      console.log(`\n  ${g}: ${summary}`);
      for (const r of rs) console.log('    ' + cells(r).join(' · '));
      md.push(`\n**${g}**: ${summary}\n`,
        '| Sex | GA | Measurement | App | Official % (whole; z) | Gap |',
        '|---|---|---|---|---|---|',
        ...rs.map(r => `| ${cells(r).join(' | ')} |`));
    }
    if (MD) console.log('\n' + md.join('\n'));
  });

  await act(async () => { root.unmount(); });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
