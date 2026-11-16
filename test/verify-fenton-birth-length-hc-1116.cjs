// verify-fenton-birth-length-hc-1116.cjs — a length or head circumference on
// DOL 1 is read as a size at birth, on Fenton's own Birth size evaluation
// (2026-11-16, Pp: "length หรือ HC ของ DOL 1 ในทารกตั้งแต่ 36 สัปดาห์ ตอนนี้
// อ่านบนเส้น growth").
//
// Until today a DOL-1 length or head was read on the growth-monitoring curve
// (FENTON_LENGTH_GROWTH_LMS, FENTON_HC_GROWTH_LMS), while a DOL-1 weight was
// read on the size-at-birth rows. Fenton says the two differ after 36 weeks.
// FENTON_LENGTH_BIRTH_LMS and FENTON_HC_BIRTH_LMS (data.js) are the
// calculator's birth-size curve as L, M, S, solved by tools/fenton-lms-solve.cjs
// from test/fenton-official-birth-1116.json.
//
//   §1  The fixture is what fentongrowth.ca returned: the raw text hashes to the
//       SHA-256 taken in the page, every point is a cell of it at the GA it was
//       sent with, every whole percentile is 100·Φ(z) rounded, no row carries a
//       weight, and the rows it did not answer (42 weeks; past 41 4/7) are named.
//   §2  The tables are the solver's answer on that fixture from 35.0 weeks: L is
//       1, the knot points read back within 0.001 z, the half-week and probe
//       points within 0.02 z, and L solved freely is within 0.05 of 1. At 33, 34
//       and 35 weeks the birth-size curve is the monitoring curve (which is why
//       the rows start at 35.0), and from 36 weeks it is not.
//   §3  ASSERTED. On screen, every knot and probe point measured on DOL 1 reads
//       within ±1 centile point of the official birth-size percentile (33 to
//       41 4/7 weeks, both sexes). The same value on DOL 15 is read on the
//       monitoring curve instead: a boy's 35.9 cm head at 41+0 is ~69th on DOL 1
//       and ~50th on DOL 15.
//   §4  From 41+5 to 42+0 a DOL-1 point is read on the 41 4/7 row, held.
//   §5  While the only point is DOL 1, the drawn 50th passes through the
//       birth-size M at each row from 35.0; from DOL 2 it is the monitoring one.
//
// NEGATIVE CONTROL: against 302dae6, the commit before the change (copy this
// file and its fixture into a `git -c core.autocrlf=false archive` of it): §1
// passes; §2, §4 and §5 stop at the missing tables; §3 fails on the DOL-1
// points from 39+0, where the two curves first part by more than a point, and
// on the 35.9 cm head at 41+0 (~51st on DOL 1).
//
// Same dev-only dependencies as the other jsdom harnesses (test/README.md).
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const crypto = require('crypto');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');
const { solveTable, solveKnot, normalKnot, lmsAt, zOf } = require('../tools/fenton-lms-solve.cjs');

const DIR = path.join(__dirname, '..') + '/';
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fenton-official-birth-1116.json'), 'utf8'));
const PAGE_SHA256 = '3208da8b727dedba0083981e6e1812950d91384ccc529d833351736b638fdfe2';

let pass = 0, fail = 0, n = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(78)}${cond ? '' : '  ' + JSON.stringify(detail ?? '').slice(0, 400)}`);
  cond ? pass++ : fail++;
}
async function section(title, fn) {
  console.log(`\n── ${title} ──`);
  try { await fn(); } catch (e) { ok(`(section ran to the end) ${e.message}`, false, e.stack.split('\n').slice(0, 4)); }
}
const phi = (z) => {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const e = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
  return z >= 0 ? (1 + e) / 2 : (1 - e) / 2;
};

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
const BIRTH = { length: D.FENTON_LENGTH_BIRTH_LMS, head: D.FENTON_HC_BIRTH_LMS };
const GROWTH = { length: D.FENTON_LENGTH_GROWTH_LMS, head: D.FENTON_HC_GROWTH_LMS };
const TAB = { length: 'Length', head: 'HC' };
const asTable = (rows) => rows.map(r => ({ age: r[0], L: r[1], M: r[2], S: r[3] }));

const root = ReactDOM.createRoot(document.getElementById('probe'));
const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 5)); }); };
const probe = () => document.getElementById('probe');
const chart = async (patient, measure) => {
  await act(async () => { root.render(null); });
  await act(async () => { root.render(React.createElement(window.FentonChart, { patient, entries: [], currentDol: 15 })); });
  await flush();
  const tab = [...probe().querySelectorAll('button')].find(b => b.textContent.trim() === TAB[measure]);
  if (!tab) throw new Error(`no ${TAB[measure]} tab`);
  await act(async () => { tab.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await flush();
};
const readout = () => {
  const box = probe().querySelector('.fenton-trajectory');
  return box ? box.children[1].textContent.trim() : null;
};
// A made-up infant with one length or head circumference on `dol`, measured
// at exact PMA `week` + `days` (born then if DOL 1, two weeks earlier if not).
const infant = (sex, week, days, measure, value, dol) => ({
  sessionId: `T-${sex}-${measure}-${week}-${days}-${dol}`, name: 'ทด', initials: 'ทด', sex, bw: 3000,
  ga: (dol === 1 ? week : week - 2) + days / 10, weights: [{ dol: 1, w: 3000 }],
  lengths: measure === 'length' ? [{ dol, v: value }] : [], hcs: measure === 'head' ? [{ dol, v: value }] : [],
});
const parse = (s) => {
  if (s === '<3rd') return { below: 3 };
  if (s === '>97th') return { above: 97 };
  const m = /^~(\d+)(?:st|nd|rd|th)$/.exec(s || '');
  return m ? { at: Number(m[1]) } : null;
};
const gapOf = (app, off) => {
  if (!app) return null;
  if (app.below != null) return off < app.below ? 0 : app.below - off;
  if (app.above != null) return off >= app.above ? 0 : app.above - off;
  return app.at - off;
};
const within1 = (said, official) => { const g = gapOf(parse(said), official); return g != null && Math.abs(g) <= 1; };
// A point's age as whole weeks and days (41.5714 → 41+4); null between days.
const wd = (age) => { const w = Math.floor(age + 1e-9), d = Math.round((age - w) * 7); return Math.abs(w + d / 7 - age) < 1e-3 ? [w, d] : null; };

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

(async () => {

  await section('§1 The fixture is what fentongrowth.ca returned', async () => {
    const P = FIXTURE.points, S = FIXTURE.source, R = FIXTURE.raw;
    const sha = crypto.createHash('sha256').update(JSON.stringify(R)).digest('hex');
    ok('the raw text hashes to the SHA-256 taken in the page', sha === PAGE_SHA256 && S.request.includes(PAGE_SHA256), sha);
    ok('the source names the calculator, its URL, version 2.1.3.0 and the date',
       S.url === 'https://fentongrowth.ca/' && S.version === '2.1.3.0' && S.retrieved === '2026-11-16', S);
    ok('Pp approved the round, and what was sent is written down', /Pp/.test(S.approvedBy) && /No name/.test(S.sent), S);
    const off = P.filter(p => ![-0.0005, 0, 0.0005].some(d => Math.round(100 * phi(p.z + d)) === p.pct));
    ok('every whole percentile is 100·Φ(z) rounded, z taken to its printed precision', off.length === 0, off.slice(0, 3));
    const keys = [...new Set(P.flatMap(Object.keys))].sort().join(',');
    ok('a point carries sex, measure, GA, age, value, z, pct, its use and its aim, nothing else',
       keys === 'age,aimedAt,ga,measure,pct,sex,use,value,z', keys);
    const cells = new Set();
    for (const [k, txt] of Object.entries(R)) {
      const sex = k.startsWith('boys') ? 'boys' : 'girls';
      const lines = txt.split('\n');
      if (/^Sex:/.test(lines[0])) {
        ok(`${k}: headed Sex ${sex === 'boys' ? 'M' : 'F'}, data type BirthSize`,
           lines[0] === `Sex: ${sex === 'boys' ? 'M' : 'F'}` && lines[2] === 'Data type: BirthSize', lines.slice(0, 3));
      }
      for (const c of lines.filter(l => /^\d/.test(l)).map(l => l.split('\t'))) {
        if ((c[1] || '') !== '') ok(`${k}: a row carries a weight`, false, c);
        cells.add(`${sex}|head|${Number(c[0]).toFixed(4)}|${Number(c[5])}|${c[6]}`);
        cells.add(`${sex}|length|${Number(c[0]).toFixed(4)}|${Number(c[9])}|${c[10]}`);
      }
    }
    const stray = P.filter(p => !cells.has(`${p.sex}|${p.measure}|${p.age.toFixed(4)}|${p.value}|${p.z.toFixed(3)}`));
    ok(`each of the ${P.length} points is a cell of a returned table, at the GA it was sent with`, P.length === 164 && stray.length === 0, stray.slice(0, 3));
    const NR = FIXTURE.notReturned;
    ok('the rows not answered are named: the six 42-week rows a sex, and the probes past 41 4/7',
       NR.filter(x => x.ga === '42').length === 6 && ['41 5/7', '41 6/7', '42 0/7', '41.99'].every(g => NR.some(x => x.ga === g)), NR.map(x => x.sex + ' ' + x.ga));
    const knots = (sex, m) => P.filter(p => p.sex === sex && p.measure === m && p.use === 'knot').length;
    ok('knots: three a week at 33 to 41 and at 41 4/7, 30 a sex and measure',
       ['boys', 'girls'].every(s => knots(s, 'length') === 30 && knots(s, 'head') === 30), '');
  });

  await section('§2 The tables are the solver\'s answer on that fixture, from 35.0', async () => {
    for (const measure of ['length', 'head']) for (const sex of ['boys', 'girls']) {
      const rows = BIRTH[measure][sex];
      const want = solveTable(FIXTURE.points, sex, measure, normalKnot).filter(r => r.age >= 35);
      ok(`${measure} ${sex}: rows at 35 to 41 and at 41.5714, in order`,
         rows.map(r => r[0]).join() === '35,36,37,38,39,40,41,41.5714', rows.map(r => r[0]));
      ok(`${measure} ${sex}: L is 1 in every row`, rows.every(r => r[1] === 1), rows.find(r => r[1] !== 1));
      const drift = rows.map((r, i) => [r[0], Math.abs(r[2] - want[i].M), Math.abs(r[3] - want[i].S)]).filter(x => x[1] > 0.0006 || x[2] > 0.000006);
      ok(`${measure} ${sex}: M and S are the least-squares fit of each week's three points`, want.length === rows.length && drift.length === 0, drift);
      const table = asTable(rows);
      let knot = 0, held = 0, heldN = 0;
      for (const p of FIXTURE.points) {
        if (p.sex !== sex || p.measure !== measure || p.age < 35) continue;
        const lms = lmsAt(table, p.age);
        if (!lms) continue;
        const d = Math.abs(zOf(lms, p.value) - p.z);
        if (p.use === 'knot') knot = Math.max(knot, d); else { held = Math.max(held, d); heldN++; }
      }
      ok(`${measure} ${sex}: the knot points read back within 0.001 z (${knot.toFixed(4)})`, knot <= 0.001, knot);
      ok(`${measure} ${sex}: ${heldN} half-week and probe points read back within 0.02 z (${held.toFixed(4)})`, heldN >= 7 && held <= 0.02, [heldN, held]);
      const free = solveTable(FIXTURE.points, sex, measure, solveKnot).map(r => r.L);
      ok(`${measure} ${sex}: solved freely, L is within 0.05 of 1 at every week`, free.every(L => Math.abs(L - 1) <= 0.05), free);
      // Where the two curves agree, and where they part.
      const all = solveTable(FIXTURE.points, sex, measure, normalKnot);
      const g = (age) => GROWTH[measure][sex].find(r => r[0] === age);
      const same = all.filter(r => r.age <= 35).map(r => [r.age, Math.abs(r.M - g(r.age)[2]), Math.abs(r.S - g(r.age)[3])]);
      ok(`${measure} ${sex}: at 33, 34 and 35 weeks the birth-size curve is the monitoring one (M within 0.002 cm, S within 0.00003)`,
         same.length === 3 && same.every(x => x[1] <= 0.002 && x[2] <= 0.00003), same);
      const r41 = rows.find(r => r[0] === 41), g41 = g(41);
      ok(`${measure} ${sex}: at 41 weeks it is not (birth M ${r41[2]} S ${r41[3]}, monitoring M ${g41[2]} S ${g41[3]})`,
         Math.abs(r41[3] - g41[3]) > 0.002 || Math.abs(r41[2] - g41[2]) > 0.3, [r41, g41]);
    }
  });

  await section('§3 On screen, a DOL-1 length or head reads the official birth-size percentile', async () => {
    for (const measure of ['length', 'head']) for (const sex of ['boys', 'girls']) {
      const pts = FIXTURE.points.filter(p => p.sex === sex && p.measure === measure && wd(p.age));
      const gaps = [];
      for (const p of pts) {
        const [w, d] = wd(p.age);
        await chart(infant(sex, w, d, measure, p.value, 1), measure);
        gaps.push({ ga: `${w}+${d}`, value: p.value, official: p.pct, said: readout(), ok: within1(readout(), p.pct) });
      }
      const bad = gaps.filter(g => !g.ok);
      ok(`${measure} ${sex}: all ${pts.length} DOL-1 points at 33+0 to 41+4 read within ±1 of the official birth-size percentile`,
         pts.length >= 31 && bad.length === 0, bad.slice(0, 4));
    }
    const h = FIXTURE.points.find(p => p.sex === 'boys' && p.measure === 'head' && p.age === 41 && p.aimedAt === 50);
    await chart(infant('boys', 41, 0, 'head', h.value, 1), 'head');
    const dol1 = readout();
    await chart(infant('boys', 41, 0, 'head', h.value, 15), 'head');
    const dol15 = readout();
    ok(`a boy's ${h.value} cm head at 41+0 reads ${dol1} on DOL 1 (official ${h.pct}) and ${dol15} on DOL 15 (the monitoring 50th)`,
       h.value === 35.9 && h.pct === 69 && within1(dol1, 69) && within1(dol15, 50), [dol1, dol15]);
  });

  await section('§4 From 41+5 to 42+0 a DOL-1 point is read on the 41 4/7 row, held', async () => {
    for (const measure of ['length', 'head']) for (const sex of ['boys', 'girls']) {
      const last = BIRTH[measure][sex].at(-1);
      const v = Math.round(last[2] * 10) / 10;
      const want = Math.round(100 * phi((v / last[2] - 1) / last[3]));
      const said = [];
      for (const [w, d] of [[41, 5], [41, 6], [42, 0]]) { await chart(infant(sex, w, d, measure, v, 1), measure); said.push(readout()); }
      ok(`${measure} ${sex}: ${v} cm on DOL 1 at 41+5, 41+6 and 42+0 reads the 41 4/7 row's centile, ${want} (${said.join(', ')})`,
         said.every(s => parse(s) && parse(s).at === want), said);
    }
  });

  await section('§5 The drawn 50th is the birth-size curve while the only point is DOL 1', async () => {
    for (const [measure, step] of [['length', 10], ['head', 5]]) for (const sex of ['boys', 'girls']) {
      const rows = BIRTH[measure][sex];
      await chart(infant(sex, 40, 0, measure, rows[5][2], 1), measure);
      let s = scales(step), a = p50Anchors();
      const has = (t, v) => a.some(p => Math.abs(p[0] - s.x(t)) <= 0.01 && Math.abs(p[1] - s.y(v)) <= 0.01);
      const miss = rows.filter(r => !has(r[0], r[2])).map(r => r[0]);
      ok(`${measure} ${sex}: on DOL 1 the 50th has an anchor at the birth-size M of all ${rows.length} rows, and at 42 the 41 4/7 value`,
         miss.length === 0 && has(42, rows.at(-1)[2]), miss);
      await chart(infant(sex, 40, 0, measure, rows[5][2], 15), measure);
      s = scales(step); a = p50Anchors();
      const g41 = GROWTH[measure][sex].find(r => r[0] === 41);
      ok(`${measure} ${sex}: on DOL 15 it is the monitoring M at 41 (${g41[2]}), not the birth-size one`,
         has(41, g41[2]) && !has(41, rows.find(r => r[0] === 41)[2]), '');
    }
  });

  console.log(`\n${fail === 0 ? 'FENTON BIRTH LENGTH + HC (2026-11-16): ALL PASS' : `FENTON BIRTH LENGTH + HC (2026-11-16): ${fail} FAILED`} (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
})();
