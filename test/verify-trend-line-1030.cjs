// verify-trend-line-1030.cjs — Pp, 2026-10-30, with two Dashboard screenshots:
// "ทําไมกราฟมันถึงโค้งไปโค้งมา ไม่เหมือนกับกราฟปกติที่ดูแนวโน้มการเจริญเติบโต
// ลองเช็คเรื่องกราฟใหม่ทั้งหมดและแก้ไข" (CHANGELOG.md 2026-10-30 (3)).
//
//   §1  The reported screen. Orders on admission days 1–4 and 16–19, nothing
//       for fifty days, then days 69 and 70. The Trend graph joined them with
//       a Catmull-Rom curve, whose bend at a point comes from the points either
//       side: from day 69 it ran right, past day 70 and off the axis, and
//       looped back. The line is now straight segments, its corners are the
//       dots in day order, and nothing of it leaves the plot, for all nine
//       metrics on both x-axes.
//   §2  Between two equal days the line stays at that value. The curve dipped
//       below both (Energy, days 1 and 3 of the screenshot).
//   §3  An order dated before the admission day (the admission date corrected
//       after it was written) is on a negative admission day. The axis started
//       at 0, so its dot was drawn left of the SVG, where nobody saw it. The
//       axis now starts at that day, and a log without one still starts at 0.
//
// The Growth tab's Fenton chart was checked the same day and not changed: its
// infant line was already straight segments, and its centile curves run
// through evenly spaced reference rows, where the curve never passes a row.
//
// ── NEGATIVE CONTROL ───────────────────────────────────────────────────────
// Run against the commit before the change; §1–§3 must each go red:
//   d=$(mktemp -d)
//   git -c core.autocrlf=false archive --format=tar 07abbe9 | tar -x -C "$d"
//   cp test/verify-trend-line-1030.cjs "$d/test/"
//   cp -r node_modules "$d/node_modules"
//   ( cd "$d" && node test/verify-trend-line-1030.cjs )
// Expected there: 36 FAILED (23 passed). On every metric and both axes the
// line reaches about x = 808 on a plot that ends at 736, and the day -3 dot
// is at x = -46. The controls pass on both: the dots inside the plot (§1),
// the two equal days at one height (§2), three dots drawn, 0 on the axis and
// a log without an early order starting at 0 (§3).
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
['icons.jsx', 'log.jsx'].forEach(load);
const D = window.NEOFEED_DATA;

const root = ReactDOM.createRoot(document.getElementById('probe'));
const render = async (el) => { await act(async () => { root.render(el); }); };
const click = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); };
const probe = () => document.getElementById('probe');
const button = (sel, text) => [...probe().querySelectorAll(sel)].find(b => b.textContent.trim() === text);

// ── What the chart drew ───────────────────────────────────────────────────
// The plot box is the white rect under everything; the line is the one path
// with no fill; the dots are the circles (no hover, so no crosshair dot).
const chart = () => {
  const svg = probe().querySelector('svg');
  const r = svg.querySelector('rect');
  const box = { x0: +r.getAttribute('x'), y0: +r.getAttribute('y') };
  box.x1 = box.x0 + +r.getAttribute('width');
  box.y1 = box.y0 + +r.getAttribute('height');
  const line = [...svg.querySelectorAll('path')].find(p => p.getAttribute('fill') === 'none');
  const d = line ? line.getAttribute('d') : '';
  const commands = [...new Set(d.match(/[A-Za-z]/g) || [])].join('');
  const nums = (d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) || []).map(Number);
  const coords = [];
  for (let i = 0; i + 1 < nums.length; i += 2) coords.push([nums[i], nums[i + 1]]);
  const dots = [...svg.querySelectorAll('circle')].map(c => [+c.getAttribute('cx'), +c.getAttribute('cy')]);
  const ticks = [...svg.querySelectorAll('text')].filter(t => t.getAttribute('text-anchor') === 'middle'
    && t.getAttribute('y') === String(+box.y1 + 16)).map(t => t.textContent);
  return { box, d, commands, coords, dots, ticks };
};
const inside = (box, [x, y]) => x >= box.x0 - 0.01 && x <= box.x1 + 0.01 && y >= box.y0 - 0.01 && y <= box.y1 + 0.01;
const r1 = (v) => Math.round(v * 10) / 10;

// ── Fixtures: shapes only, no real infant ─────────────────────────────────
const TODAY = D.todayLocal();
// Admitted on DOL 2, 70 days ago, so today is admission day 70 (DOL 71), as
// in the screenshots.
const ADMIT = D.addDaysToDateStr(TODAY, -70);
const infant = {
  sessionId: 'T-TREND', name: 'ทด', initials: 'ทด', bw: 1000, ga: 30.0, sex: 'boys',
  dob: D.addDaysToDateStr(ADMIT, -1), admissionDate: ADMIT, status: 'Active', currentBed: 'NICU 3',
  weights: [{ dol: 1, w: 1000 }], lengths: [], hcs: [],
};
// A submitted order on admission day `day`. Full enteral from day 60, as the
// screenshots' EN chip shows.
const order = (day, v) => ({
  ts: D.addDaysToDateStr(ADMIT, day), status: 'submitted', entryId: `e${day}`,
  weight: 1000 + day * 8, kcal: v.kcal, pro: v.pro, gir: v.gir, fluid: v.fluid,
  na: 3, k: 2, ca: 80, p: 50, enVolPerKg: day >= 60 ? 150 : 0,
});
// The screenshots' points (Energy, Protein), with GIR and Fluid alongside.
const REPORTED = [
  [1, 30, 2.0], [3, 30, 2.0], [4, 25, 2.0], [16, 68, 3.0], [17, 70, 3.0], [18, 70, 3.0],
  [19, 65, 3.0], [69, 93.2, 2.6], [70, 114, 2.9],
].map(([day, kcal, pro]) => order(day, { kcal, pro, gir: day >= 60 ? 0 : 6, fluid: 120 + day / 2 }));

(async () => {

  // ══════════════════════════════════════════════════════════════════════
  await section('§1 The reported screen: straight segments through the dots, inside the plot', async () => {
    await render(React.createElement(window.TrendGraph, { entries: REPORTED, patient: infant }));
    for (const axis of ['Admit day', 'DOL']) {
      await click(button('.trend-xaxis-seg button', axis));
      for (const metric of ['Weight', 'Energy', 'Protein', 'GIR', 'Fluid', 'Sodium', 'Potassium', 'Calcium', 'Phosphorus']) {
        await click(button('.trend-chip', metric));
        const c = chart();
        const tag = `${metric}, ${axis}:`;
        if (metric === 'Energy' || metric === 'Protein' || metric === 'Weight') {
          eq(`${tag} the line is M then L only, no curve`, c.commands, 'ML');
          eq(`${tag} its corners are the dots, in day order`,
             c.coords.map(p => p.map(r1)), c.dots.map(p => p.map(r1)).sort((a, b) => a[0] - b[0]));
        }
        ok(`${tag} every point of the line is inside the plot`,
           c.coords.length > 1 && c.coords.every(p => inside(c.box, p)),
           c.coords.filter(p => !inside(c.box, p)).slice(0, 3));
        ok(`${tag} every dot is inside the plot (control)`, c.dots.every(p => inside(c.box, p)), c.dots);
      }
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§2 Between two equal days the line stays at that value', async () => {
    await render(React.createElement(window.TrendGraph, { entries: REPORTED, patient: infant }));
    await click(button('.trend-xaxis-seg button', 'Admit day'));
    await click(button('.trend-chip', 'Energy'));
    const c = chart();
    const [day1, day3] = c.dots.slice().sort((a, b) => a[0] - b[0]);
    eq('days 1 and 3 (30 kcal/kg/d each) are drawn at one height', r1(day1[1]), r1(day3[1]));
    const between = c.coords.filter(([x]) => x > day1[0] && x < day3[0]);
    eq('nothing of the line between them sits lower or higher', between.filter(([, y]) => r1(y) !== r1(day1[1])), []);
    ok('the line has no Bézier control points at all', !/[CcSsQqTt]/.test(c.d), c.d.slice(0, 80));
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§3 An order dated before the admission day is drawn inside the chart', async () => {
    const early = [order(-3, { kcal: 40, pro: 1.5, gir: 5, fluid: 80 }),
      order(2, { kcal: 60, pro: 2.5, gir: 7, fluid: 110 }), order(5, { kcal: 90, pro: 3, gir: 8, fluid: 140 })];
    await render(React.createElement(window.TrendGraph, { entries: early, patient: infant }));
    await click(button('.trend-xaxis-seg button', 'Admit day'));
    await click(button('.trend-chip', 'Energy'));
    let c = chart();
    eq('three dots are drawn', c.dots.length, 3);
    ok('all three are inside the plot, the day -3 one too',
       c.dots.every(p => inside(c.box, p)), c.dots.map(p => p.map(r1)));
    ok('the day -3 dot is on the plot\'s left edge, where the axis starts',
       c.dots.some(([x]) => Math.abs(x - c.box.x0) < 0.01), { left: c.box.x0, dots: c.dots.map(p => r1(p[0])) });
    ok('the line stays inside the plot', c.coords.every(p => inside(c.box, p)), c.coords.map(p => p.map(r1)));
    ok('the axis is labelled from a day before admission', c.ticks.length > 0 && Number(c.ticks[0]) < 0, c.ticks);
    ok('…and still marks the admission day, 0', c.ticks.includes('0'), c.ticks);

    // Control: without such an order the axis starts at 0, as it always did.
    await render(React.createElement(window.TrendGraph, { entries: early.slice(1), patient: infant }));
    c = chart();
    eq('control: a log from day 2 on starts its axis at 0', c.ticks[0], '0');
    ok('control: …and its dots are inside the plot', c.dots.every(p => inside(c.box, p)), c.dots);
  });

  await act(async () => { root.unmount(); });
  console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed)`);
  process.exit(fail ? 1 : 0);
})();
