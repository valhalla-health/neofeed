// verify-status-zones.cjs — the range bars' green / yellow / red zones.
//
// Praew, 2026-09-22: "สีที่เคยกำหนด range เฝ้าระวัง หายไปหมด ให้เอากลับมา สีเขียว
// OK, สีเหลืองระวัง สีแดง alert". Every tile's bar now draws zones: green in the
// target, yellow outside it, red past a hard limit (GIR's red above 13 —
// "GIR bar turn red at >13"). The claim that matters clinically is that a
// bar can NEVER disagree with its own tile: a needle on green beside a red
// border is worse than no bar at all. calculator.jsx makes that true by
// construction (Meter samples the very function that grades the tile); this
// harness checks it from the outside, on the rendered page:
//
//   § 1  on three orders — mixed, past the hard limits, thin — every needle
//        sits in the zone of its tile's own status, GIR's inline readout too;
//   § 2  the zones tile each bar exactly, and red appears only where a tile
//        has a hard limit (GIR 13, protein 4.8, peripheral osmolarity 900);
//   § 3  no needle for a reading that is not a point on the scale (0, "!!");
//   § 4  the shells style every zone, in both hand-synced copies.
//
// Same jsdom mount as verify-kcmh-factor.cjs: the real <Calculator>, prefilled
// from a saved row, every step opened. Runs against compiled/ as well under
// NODE_OPTIONS=--require ./test/compiled-loader.cjs.
const fs = require('fs');
const vm = require('vm');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = require('path').join(__dirname, '..') + '/';
const lf = (s) => s.replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + JSON.stringify(detail === undefined ? '' : detail).slice(0, 400)}`);
  cond ? pass++ : fail++;
}

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://localhost/', pretendToBeVisual: true });
const { window } = dom;
global.window = window;
global.document = window.document;
global.self = window;
global.HTMLElement = window.HTMLElement;
global.Element = window.Element;
global.Node = window.Node;
global.getComputedStyle = window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = clearTimeout;
global.localStorage = window.localStorage;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;

vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
for (const f of ['icons.jsx', 'calculator.jsx']) {
  vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + f, 'utf8'), {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    filename: f, configFile: false, babelrc: false,
  }).code);
}
const D = window.NEOFEED_DATA;

// ── the three orders ──────────────────────────────────────────────────────
// A 1.55 kg infant on DOL 5, central line — the order behind the 2026-09-22
// screenshots — and two variations on it.
const BASE = {
  constantsVersion: D.CONSTANTS_VERSION, curWtG: 1550, fluidTargetPerKg: 140, drug_mL: 2,
  route: 'central', totalTPN_mL: 196, deadVol_mL: 20, dexPct: 10, aaPerKg: 3, lipidPerKg: 2,
  naAcet: 1, glycophosP: 1.5, kCl: 2, mgPerKg: 0.4, caPerKg: 70,
};
const ORDERS = [
  // Sodium, phosphorus and NPE:AA off target; the rest in range.
  ['mixed', BASE],
  // Dextrose 17.5% (GIR ≈ 15), amino acid 5 g/kg/d, on a PERIPHERAL line —
  // and calcium with no phosphate, so Ca:P reads "!!".
  ['past the hard limits', { ...BASE, route: 'peripheral', dexPct: 17.5, aaPerKg: 5, glycophosP: 0 }],
  // Too little of most things, a trickle of feed (which brings its own
  // calcium), no lipid, no TPN calcium.
  ['thin', { ...BASE, dexPct: 4, aaPerKg: 1, lipidPerKg: 0, caPerKg: 0, enVol: 5, enFreq: 8 }],
];

function mount(calcInput) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  act(() => {
    root.render(React.createElement(window.Calculator, {
      patient: { sessionId: 'Z-1', name: 'Z', bw: 1500, ga: 30, currentBed: 'NICU 1', diagnosis: '-', weights: [] },
      dol: 5,
      editEntry: { entryId: 'z-entry', lastModified: 'z-stamp', ts: '2026-09-22', dol: 5, weight: 1550, calcInput },
      baselineEntry: null, logDate: null,
      onLog() {}, onUpdate() {}, onSaved() {}, onWeightChange() {},
    }));
  });
  act(() => {
    container.querySelectorAll('.card-h.clickable').forEach((h) =>
      h.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
  });
  return { container, root };
}

const STATUSES = ['ok', 'warn', 'crit', 'empty'];
const statusOf = (el) => STATUSES.find((s) => el.classList.contains(`s-${s}`)) || null;
const pctOf = (el, prop) => parseFloat(el.style[prop]);
function bar(meter) {
  const zones = [...meter.querySelectorAll('.zone')].filter((z) => !z.classList.contains('z-best'))
    .map((z) => ({ s: [...z.classList].find((c) => c.startsWith('z-')).slice(2), from: pctOf(z, 'left'), w: pctOf(z, 'width') }));
  const needle = meter.querySelector('.needle');
  return { zones, needle: needle ? pctOf(needle, 'left') : null };
}
// The zone(s) under x. Within 0.05% of a boundary the needle is ON the line
// (a value exactly at a target bound), and either neighbour is a fair reading.
const EDGE = 0.05;
function zonesAt(zones, x) {
  return zones.filter((z) => x >= z.from - EDGE && x <= z.from + z.w + EDGE).map((z) => z.s);
}

// Every graded bar on the page: the tiles, and GIR's inline readout.
function readings(container) {
  const out = [];
  container.querySelectorAll('.metric').forEach((m) => {
    const meter = m.querySelector('.meter');
    if (!meter) return;
    out.push({ label: m.querySelector('.lbl')?.textContent.trim(), status: statusOf(m),
      value: m.querySelector('.val')?.textContent.trim(), ...bar(meter) });
  });
  const gir = container.querySelector('.gir-readout');
  if (gir) out.push({ label: 'GIR (readout)', status: statusOf(gir), value: gir.querySelector('.num')?.textContent.trim(), ...bar(gir.querySelector('.meter')) });
  return out;
}

const mounted = ORDERS.map(([name, ci]) => ({ name, ...mount(ci) }));

// ── § 1 · the needle sits in its own tile's zone ───────────────────────────
console.log('\n── § 1 every needle sits in the zone of its tile\'s own status ──');
const seen = { ok: 0, warn: 0, crit: 0 };
let onEdge = 0;
for (const { name, container } of mounted) {
  const rs = readings(container);
  ok(`${name}: the page has graded bars, GIR's among them`, rs.length >= 12 && rs.some((r) => r.label === 'GIR (readout)'), rs.length);
  for (const r of rs) {
    if (r.needle === null) continue;                      // § 3 checks these
    const under = zonesAt(r.zones, r.needle);
    if (under.length > 1) onEdge++;
    ok(`${name} · ${r.label} ${r.value}: needle on ${under.join('/')} — tile is ${r.status}`,
      under.includes(r.status), { needle: r.needle, zones: r.zones });
    if (seen[r.status] !== undefined) seen[r.status]++;
  }
}
ok('the orders exercise all three statuses', seen.ok > 0 && seen.warn > 0 && seen.crit > 0, seen);
console.log(`    (${seen.ok} ok, ${seen.warn} warn, ${seen.crit} crit; ${onEdge} exactly on a target bound)`);

// ── § 2 · the zones themselves ─────────────────────────────────────────────
console.log('\n── § 2 each bar is tiled exactly, and red means a hard limit ──');
const HARD = {                                          // where red must start, as % of the bar
  'GIR (readout)': 13 / 16 * 100,                       // Praew: red above 13
  'Protein': 4.8 / 5.5 * 100,
  'K⁺ in bag': 40 / 80 * 100,                           // the worksheet's stop (D.MAX_K_MEQ_PER_L)
};
for (const { name, container } of mounted) {
  for (const r of readings(container)) {
    const end = r.zones.reduce((at, z) => (Math.abs(z.from - at) < 1e-6 ? z.from + z.w : NaN), 0);
    ok(`${name} · ${r.label}: zones run edge to edge, no gap, no overlap`, Math.abs(end - 100) < 1e-6, r.zones);
    const red = r.zones.filter((z) => z.s === 'crit');
    const route = name === 'past the hard limits' ? 'peripheral' : 'central';
    let want = HARD[r.label];
    if (r.label === 'Osmolarity' && route === 'peripheral') want = 900 / 1100 * 100;
    if (want === undefined) {
      ok(`${name} · ${r.label}: no red — it has no hard limit of its own`, red.length === 0, red);
    } else {
      ok(`${name} · ${r.label}: red from ${want.toFixed(2)}% to the end`,
        red.length === 1 && Math.abs(red[0].from - want) < 1e-3 && Math.abs(red[0].from + red[0].w - 100) < 1e-6, red);
    }
  }
}
{
  const gir = mounted[0].container.querySelector('.gir-readout .meter');
  const best = gir.querySelector('.z-best');
  ok('GIR keeps its deeper-green 8–10 optimum', !!best &&
    Math.abs(pctOf(best, 'left') - 50) < 1e-6 && Math.abs(pctOf(best, 'width') - 12.5) < 1e-6,
    best && best.getAttribute('style'));
  const z = bar(gir).zones.map((x) => x.s).join(' ');
  ok('GIR reads yellow · green · yellow · red (4 | 12 | 13)', z === 'warn ok warn crit', z);
  const osm = readings(mounted[1].container).find((r) => r.label === 'Osmolarity');
  ok('peripheral osmolarity: green to 850, yellow to 900, red beyond',
    osm && osm.zones.map((x) => x.s).join(' ') === 'ok warn crit' &&
    Math.abs(osm.zones[1].from - 850 / 1100 * 100) < 1e-3, osm && osm.zones);
}

// The same claim at the source, so a tile added later cannot slip past the
// three orders above: a status graded with a hard limit must reach the tile's
// bar as its statusAt. (The IV-portion checks, hardLip/hardK/hardNPE, raise
// alerts and colour no tile, so they are not in scope.)
{
  const src = lf(fs.readFileSync(DIR + 'calculator.jsx', 'utf8'));
  const tiles = [...src.matchAll(/<Tile\b[^>]*\/>/g)].map((m) => m[0]);
  const direct = [...src.matchAll(/const (s\w+) = D\.rangeStatus\([^;\n]*\{\s*hard/g)].map((m) => m[1]);
  const bare = direct.filter((n) => tiles.some((t) => t.includes(`status={${n}}`)));
  ok('no tile is graded with a hard limit its bar does not draw', bare.length === 0, bare);
  const fns = [...src.matchAll(/const (\w+StatusAt) = \(v\) =>/g)].map((m) => m[1]);
  ok('every tile grading function reaches a bar as its statusAt',
    fns.length >= 5 && fns.every((f) => src.includes(`statusAt={${f}}`)), fns);
  const withHard = tiles.filter((t) => /status=\{(sPro|sKConc)\}/.test(t));
  ok('…the protein and K⁺-in-bag tiles among them', withHard.length === 2 && withHard.every((t) => /statusAt=\{\w+StatusAt\}/.test(t)), withHard);
}

// ── § 3 · no needle where there is no reading ──────────────────────────────
console.log('\n── § 3 no needle for 0 or "!!" ──');
{
  const mixed = readings(mounted[0].container), hard = readings(mounted[1].container), thin = readings(mounted[2].container);
  const en = mixed.find((x) => x.label === 'EN volume');
  ok('mixed order · EN volume 0 is "nothing ordered": green tile, no needle', en && en.status === 'ok' && en.needle === null, en);
  const p0 = hard.find((x) => x.label === 'Phosphorus');
  ok('no phosphate ordered · Phosphorus 0 is "empty": no needle', p0 && p0.status === 'empty' && p0.needle === null, p0);
  const caP = hard.find((x) => x.label === 'Ca:P ratio');
  ok('calcium with no phosphate · Ca:P reads "!!", critical, with no needle', caP && caP.value.startsWith('!!') &&
    caP.status === 'crit' && caP.needle === null, caP);
  const needles = thin.filter((r) => r.needle !== null).length;
  ok('…while every non-zero reading still has one', needles >= 8, needles);
}

// ── § 4 · the shells ───────────────────────────────────────────────────────
console.log('\n── § 4 shell CSS ──');
const shell = lf(fs.readFileSync(DIR + 'NeoFeed.html', 'utf8'));
const twin = lf(fs.readFileSync(DIR + 'index.html', 'utf8'));
ok('both shells carry the same stylesheet', shell === twin);
for (const z of ['ok', 'warn', 'crit', 'best']) {
  ok(`--zone-${z} is defined and .z-${z} paints with it`,
    new RegExp(`--zone-${z}:\\s*oklch\\(`).test(shell) &&
    new RegExp(`\\.meter \\.z-${z}\\s*\\{ background: var\\(--zone-${z}\\); \\}`).test(shell));
}
ok('the needle is ink with a white keyline, whatever zone it sits on',
  /\.meter \.needle \{[^}]*background: var\(--ink\);[^}]*box-shadow: 0 0 0 2px var\(--surface\);/.test(shell));
ok('the track clips the zones to its rounded ends',
  /\.meter \.meter-track \{[^}]*border-radius: 999px;[^}]*overflow: hidden;/.test(shell));
ok('no status-coloured needle rules are left behind', !/\.meter\.s-(ok|warn|crit) \.needle/.test(shell));

for (const { root } of mounted) act(() => root.unmount());
console.log(`\nSTATUS ZONES: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
