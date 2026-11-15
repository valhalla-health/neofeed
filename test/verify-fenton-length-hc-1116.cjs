// verify-fenton-length-hc-1116.cjs — length and head circumference are read
// and drawn on Fenton's own growth-monitoring curve (2026-11-16).
//
// Until today the Length and HC tabs used FENTON_LENGTH and FENTON_HC: five
// centiles every 4 weeks, never checked against a source. Fenton's LMS are not
// published, but his calculator (fentongrowth.ca) returns a z-score for any
// size at any age. FENTON_LENGTH_GROWTH_LMS and FENTON_HC_GROWTH_LMS (data.js)
// are that calculator's curve as L, M, S at each whole week, solved from
// test/fenton-official-1116.json by tools/fenton-lms-solve.cjs.
//
//   §1  The fixture is what fentongrowth.ca returned: two submissions, 75 rows
//       each, every point a cell of the returned table, every whole percentile
//       100·Φ(z) rounded (z to its printed precision), and nothing but sex,
//       age, head and length was sent.
//       The 12 cells it did not answer (22 weeks; length at 23.0) are named.
//   §2  The tables are the solver's answer on that fixture: L is 1, M and S
//       are the least-squares fit of each week's three points, the three
//       points read back within 0.001 z, and the half-week points no row was
//       built from within 0.02 z. Solved with L free, L is within 0.05 of 1 at
//       every week, which is why it is fixed at 1.
//   §3  ASSERTED. On screen, a length or a head circumference at a whole week
//       reads within ±1 centile point of the official percentile, for all 234
//       knot points; a DOL-1 measurement is read on the same curve; and the 24
//       length and head points of 2026-10-17 (test/fenton-official-1017.json:
//       12 between whole weeks, 8 of them on DOL 1) read within ±1 too.
//   §4  Before the curve starts (length before 24.0, head before 23.0) there
//       is no percentile, and the chart says where the reference starts.
//   §5  Each of the five drawn lines passes through its centile (z of
//       −1.88079, −1.28155, 0, 1.28155, 1.88079) at every week of the table.
//   §6  The old rows are gone, and where they were wrong is on record: at 42
//       weeks the old length "50th" is this curve's 82nd (boys), the old head
//       "50th" its 26th (boys).
//
// NEGATIVE CONTROL: against e1d99cd, the commit before the change (copy this
// file, its fixture and tools/fenton-lms-solve.cjs into a
// `git -c core.autocrlf=false archive` of it): §1 passes; §2 and §5 stop at the
// missing tables; §3 fails where the old rows are more than a point off (the
// 2026-10-17 points included).
//
// Same dev-only dependencies as the other jsdom harnesses (test/README.md).
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');
const { solveTable, solveKnot, normalKnot, lmsAt, zOf } = require('../tools/fenton-lms-solve.cjs');

const DIR = path.join(__dirname, '..') + '/';
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fenton-official-1116.json'), 'utf8'));
const OCT17 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fenton-official-1017.json'), 'utf8'));

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
const TABLE = { length: D.FENTON_LENGTH_GROWTH_LMS, head: D.FENTON_HC_GROWTH_LMS };
const TAB = { length: 'Length', head: 'HC' };

const root = ReactDOM.createRoot(document.getElementById('probe'));
const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 5)); }); };
const probe = () => document.getElementById('probe');
// Mounts the chart for `patient` and opens the Length or HC tab.
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
// A made-up infant with one length or head circumference on `dol` (1 or 15),
// born so that the measurement sits at exact PMA `week` + `days`.
const infant = (sex, week, measure, value, dol, days = 0) => ({
  sessionId: `T-${sex}-${measure}-${week}-${days}-${dol}`, name: 'ทด', initials: 'ทด', sex, bw: 900,
  ga: (dol === 1 ? week : week - 2) + days / 10, weights: [{ dol: 1, w: 900 }],
  lengths: measure === 'length' ? [{ dol, v: value }] : [], hcs: measure === 'head' ? [{ dol, v: value }] : [],
});
const parse = (s) => {
  if (s === '<3rd') return { below: 3 };
  if (s === '>97th') return { above: 97 };
  const m = /^~(\d+)(?:st|nd|rd|th)$/.exec(s || '');
  return m ? { at: Number(m[1]) } : null;
};
// How far the app's words are from the official whole percentile; 0 when the
// app says "<3rd" and the official one is under 3, and so on.
const gapOf = (app, off) => {
  if (!app) return null;
  if (app.below != null) return off < app.below ? 0 : app.below - off;
  if (app.above != null) return off >= app.above ? 0 : app.above - off;
  return app.at - off;
};

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
    const P = FIXTURE.points, S = FIXTURE.source;
    ok(`282 points from 2 submissions (${P.length}, ${Object.keys(FIXTURE.raw).length})`,
       P.length === 282 && Object.keys(FIXTURE.raw).length === 2, P.length);
    ok('the source names the calculator, its URL, version 2.1.3.0 and the date',
       S.url === 'https://fentongrowth.ca/' && S.version === '2.1.3.0' && S.retrieved === '2026-11-16', S);
    ok('Pp approved the round, and what was sent is written down', /Pp/.test(S.approvedBy) && /No name/.test(S.sent), S);
    // The calculator rounds the percentile from its own unrounded z; the z it
    // prints has three decimals. So the percentile must be 100·Φ rounded for
    // some z within half a unit of the last printed digit.
    const off = P.filter(p => ![-0.0005, 0, 0.0005].some(d => Math.round(100 * phi(p.z + d)) === p.pct));
    ok('every whole percentile is 100·Φ(z) rounded, z taken to its printed precision', off.length === 0, off.slice(0, 3));
    const keys = [...new Set(P.flatMap(Object.keys))].sort().join(',');
    ok('a point carries sex, measure, GA, age, value, z, pct, its use and its aim, nothing else',
       keys === 'age,aimedAt,ga,measure,pct,sex,use,value,z', keys);
    for (const [sex, tag] of [['girls', 'F'], ['boys', 'M']]) {
      const lines = FIXTURE.raw[`${sex}-growth`];
      ok(`${sex}: the returned text is headed Sex ${tag}, Growth, and has 75 rows`,
         lines[0] === `Sex: ${tag}` && lines[2] === 'Data type: Growth' && lines.length === 79, lines.slice(0, 3));
      const rows = lines.slice(4).map(l => l.split('\t'));
      ok(`${sex}: no row carries a weight`, rows.every(c => (c[1] || '') === ''), rows.find(c => (c[1] || '') !== ''));
      const cell = new Set(rows.flatMap(c => [`head|${Number(c[0])}|${Number(c[5])}|${c[6]}`, `length|${Number(c[0])}|${Number(c[9])}|${c[10]}`]));
      const mine = P.filter(p => p.sex === sex);
      const stray = mine.filter(p => !cell.has(`${p.measure}|${p.age}|${p.value}|${p.z.toFixed(3)}`));
      ok(`${sex}: each of its ${mine.length} points is a cell of the returned table`, mine.length === 141 && stray.length === 0, stray.slice(0, 3));
    }
    const NR = FIXTURE.notReturned;
    ok('12 cells were not answered: 22 weeks (3 rows a sex) and length at 23 weeks (3 rows a sex)',
       NR.length === 12 && NR.filter(x => x.ga === '22' && !x.measure).length === 6 && NR.filter(x => x.ga === '23' && x.measure === 'length').length === 6, NR);
    const uses = (m, u) => P.filter(p => p.measure === m && p.use === u).length;
    ok('knots: 57 length and 60 head points a sex; held-out: 12 each (length at 23.5 has no knot beside it)',
       uses('length', 'knot') === 114 && uses('head', 'knot') === 120 && uses('length', 'held-out') === 24 && uses('head', 'held-out') === 24,
       [uses('length', 'knot'), uses('head', 'knot'), uses('length', 'held-out'), uses('head', 'held-out')]);
  });

  await section('§2 The tables are the solver\'s answer on that fixture', async () => {
    for (const measure of ['length', 'head']) for (const sex of ['boys', 'girls']) {
      const rows = TABLE[measure][sex];
      const want = solveTable(FIXTURE.points, sex, measure, normalKnot);
      const first = measure === 'length' ? 24 : 23;
      ok(`${measure} ${sex}: a row at every whole week ${first} to 42, in order`,
         rows.length === 43 - first && rows.every((r, i) => r[0] === first + i), rows.map(r => r[0]));
      ok(`${measure} ${sex}: L is 1 in every row`, rows.every(r => r[1] === 1), rows.find(r => r[1] !== 1));
      const drift = rows.map((r, i) => [r[0], Math.abs(r[2] - want[i].M), Math.abs(r[3] - want[i].S)]).filter(x => x[1] > 0.0006 || x[2] > 0.000006);
      ok(`${measure} ${sex}: M and S are the least-squares fit of each week's three points`, want.length === rows.length && drift.length === 0, drift.slice(0, 3));
      const table = rows.map(r => ({ age: r[0], L: r[1], M: r[2], S: r[3] }));
      let knot = 0, held = 0, heldN = 0;
      for (const p of FIXTURE.points) {
        if (p.sex !== sex || p.measure !== measure) continue;
        const lms = lmsAt(table, p.age);
        if (!lms) continue;
        const d = Math.abs(zOf(lms, p.value) - p.z);
        if (p.use === 'knot') knot = Math.max(knot, d); else { held = Math.max(held, d); heldN++; }
      }
      ok(`${measure} ${sex}: the knot points read back within 0.001 z (${knot.toFixed(4)})`, knot <= 0.001, knot);
      ok(`${measure} ${sex}: ${heldN} held-out points read back within 0.02 z (${held.toFixed(4)})`, heldN >= 10 && held <= 0.02, [heldN, held]);
      const free = solveTable(FIXTURE.points, sex, measure, solveKnot).map(r => r.L);
      ok(`${measure} ${sex}: solved freely, L is within 0.05 of 1 at every week (${Math.min(...free).toFixed(3)} to ${Math.max(...free).toFixed(3)})`,
         free.every(L => Math.abs(L - 1) <= 0.05), free);
    }
  });

  await section('§3 On screen, a length or head circumference reads the official percentile', async () => {
    for (const measure of ['length', 'head']) for (const sex of ['boys', 'girls']) {
      const pts = FIXTURE.points.filter(p => p.sex === sex && p.measure === measure && p.use === 'knot');
      const gaps = [];
      for (const p of pts) {
        await chart(infant(sex, p.age, measure, p.value, 15), measure);
        const said = readout();
        gaps.push({ age: p.age, value: p.value, official: p.pct, said, gap: gapOf(parse(said), p.pct) });
      }
      const bad = gaps.filter(g => g.gap == null || Math.abs(g.gap) > 1);
      ok(`${measure} ${sex}: all ${pts.length} whole-week points read within ±1 of the official percentile`,
         pts.length === (measure === 'length' ? 57 : 60) && bad.length === 0, bad.slice(0, 4));
    }
    // A measurement on DOL 1 is read on the same curve: there is no other for these two.
    const b = FIXTURE.points.find(p => p.sex === 'girls' && p.measure === 'length' && p.age === 40 && p.aimedAt === 50);
    await chart(infant('girls', 40, 'length', b.value, 1), 'length');
    const within1 = (said, official) => { const g = gapOf(parse(said), official); return g != null && Math.abs(g) <= 1; };
    ok(`a girl born at 40+0, ${b.value} cm on DOL 1, reads the official percentile ${b.pct} (±1): ${readout()}`,
       within1(readout(), b.pct), readout());
    // 35.7 cm is the old table's row-42 "50th" for boys (the app drew it at 42.5).
    const h = FIXTURE.points.find(p => p.sex === 'boys' && p.measure === 'head' && p.age === 42 && p.aimedAt === 50);
    await chart(infant('boys', 42, 'head', h.value, 15), 'head');
    ok(`a boy at 42+0 with ${h.value} cm, the old row-42 "50th" head, reads the official percentile ${h.pct}, not the 50th: ${readout()}`,
       h.value === 35.7 && h.pct <= 30 && within1(readout(), h.pct), [h, readout()]);

    // The points of 2026-10-17: 12 at whole weeks and 12 between them, growth mode (DOL 15) and birth mode (DOL 1).
    const older = OCT17.points.filter(p => p.measure === 'length' || p.measure === 'hc');
    const gaps = [];
    for (const p of older) {
      const [w, d] = p.ga.split('+').map(Number);
      const measure = p.measure === 'hc' ? 'head' : 'length';
      await chart(infant(p.sex, w, measure, p.value, p.mode === 'birth' ? 1 : 15, d), measure);
      gaps.push({ ga: p.ga, mode: p.mode, measure, value: p.value, official: p.pct, said: readout(), ok: within1(readout(), p.pct) });
    }
    const between = older.filter(p => !p.ga.endsWith('+0')).length, birth = older.filter(p => p.mode === 'birth').length;
    ok(`the 24 length and head points of 2026-10-17 (${between} between whole weeks, ${birth} on DOL 1) read within ±1`,
       older.length === 24 && between === 12 && birth === 8 && gaps.every(g => g.ok), gaps.filter(g => !g.ok).slice(0, 4));
  });

  await section('§4 Before the curve starts there is no percentile, and the chart says where it starts', async () => {
    await chart(infant('girls', 23, 'length', 27, 15), 'length');
    ok(`a length at 23+0 has no percentile (${readout()})`, parse(readout()) === null, readout());
    ok('…and the chart says the reference starts at PMA 24', /เส้นอ้างอิงเริ่มที่ PMA 24/.test(probe().textContent), probe().textContent.slice(0, 200));
    await chart(infant('girls', 23, 'head', 20, 15), 'head');
    ok(`a head circumference at 23+0 is on the curve (${readout()})`, parse(readout()) !== null, readout());
    await chart({ ...infant('boys', 24, 'head', 19, 15), ga: 20.5 }, 'head');          // PMA 22+5
    ok(`a head circumference at 22+5 has no percentile (${readout()})`, parse(readout()) === null, readout());
    ok('…and the chart says the reference starts at PMA 23', /เส้นอ้างอิงเริ่มที่ PMA 23/.test(probe().textContent), '');
    ok('the "not checked against the source" note is gone from both tabs', !/ยังไม่ได้ตรวจเทียบ/.test(probe().textContent), '');
  });

  await section('§5 Each drawn line passes through its centile at every week', async () => {
    // The five lines and their colours (fenton.jsx PERCENTILES). The 3rd and
    // 97th share a colour, and so do the 10th and 90th: the lower line is the
    // one whose first point sits lower on the chart (a larger y).
    const LINES = [['3rd', -1.88079, 'oklch(82.4% 0.039 139)', 'low'], ['10th', -1.28155, 'oklch(64% 0.043 150)', 'low'],
      ['50th', 0, P50, 'only'], ['90th', 1.28155, 'oklch(64% 0.043 150)', 'high'], ['97th', 1.88079, 'oklch(82.4% 0.039 139)', 'high']];
    const anchorsOf = (path) => [...path.getAttribute('d').matchAll(/([MC])([^MC]*)/g)].map(([, cmd, rest]) => {
      const v = rest.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g).map(Number);
      return cmd === 'M' ? [v[0], v[1]] : [v[4], v[5]];
    });
    for (const [measure, step] of [['length', 10], ['head', 5]]) for (const sex of ['boys', 'girls']) {
      await chart(infant(sex, 30, measure, measure === 'length' ? 39 : 27, 15), measure);
      const s = scales(step), rows = TABLE[measure][sex];
      const bad = [];
      for (const [label, z, colour, which] of LINES) {
        const paths = [...probe().querySelectorAll(`path[stroke="${colour}"]`)].filter(p => p.getAttribute('fill') === 'none' || !p.getAttribute('fill'))
          .map(anchorsOf).sort((a, b) => b[0][1] - a[0][1]);                       // lower line first
        const want = which === 'only' ? 1 : 2;
        const pts = which === 'high' ? paths[1] : paths[0];
        if (paths.length !== want || !pts) { bad.push([label, 'paths', paths.length]); continue; }
        const miss = rows.filter(r => !pts.some(p => Math.abs(p[0] - s.x(r[0])) <= 0.01 && Math.abs(p[1] - s.y(r[2] * (1 + z * r[3]))) <= 0.01));
        if (miss.length || pts.length !== rows.length || Math.abs(pts[0][0] - s.x(rows[0][0])) > 0.01) bad.push([label, miss.length, pts.length]);
      }
      ok(`${measure} ${sex}: the 3rd, 10th, 50th, 90th and 97th each have an anchor at M·(1 + z·S) for all ${rows.length} weeks, none before the first`,
         bad.length === 0, bad);
    }
  });

  await section('§6 The old rows are gone, and where they were wrong is on record', async () => {
    ok('data.js no longer carries FENTON_LENGTH or FENTON_HC', D.FENTON_LENGTH === undefined && D.FENTON_HC === undefined, Object.keys(D).filter(k => /FENTON/.test(k)));
    const at = (measure, sex, age) => { const r = TABLE[measure][sex].find(x => x[0] === age); return { L: r[1], M: r[2], S: r[3] }; };
    // The old 42-week rows, as the app drew them (row GA + 0.5): the value at 42.0 lay on the straight line from row 38 to row 42.
    const old50At42 = { length: { boys: 49.7 + 3.5 / 4 * (55.5 - 49.7), girls: 48.9 + 3.5 / 4 * (54.3 - 48.9) },
                        head: { boys: 34.5 + 3.5 / 4 * (35.7 - 34.5), girls: 33.9 + 3.5 / 4 * (35.2 - 33.9) } };
    const pc = (measure, sex) => Math.round(100 * phi(zOf(at(measure, sex, 42), old50At42[measure][sex])));
    ok(`at 42 weeks the old length "50th" is this curve's ${pc('length', 'boys')}nd (boys) and ${pc('length', 'girls')}th (girls)`,
       pc('length', 'boys') === 82 && pc('length', 'girls') === 79, [pc('length', 'boys'), pc('length', 'girls')]);
    ok(`at 42 weeks the old head "50th" is this curve's ${pc('head', 'boys')}th (boys) and ${pc('head', 'girls')}nd (girls)`,
       pc('head', 'boys') === 26 && pc('head', 'girls') === 32, [pc('head', 'boys'), pc('head', 'girls')]);
  });

  console.log(`\n${fail === 0 ? 'FENTON LENGTH + HC (2026-11-16): ALL PASS' : `FENTON LENGTH + HC (2026-11-16): ${fail} FAILED`} (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
})();
