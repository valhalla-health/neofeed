// verify-bw-category-1019.cjs — the birth-weight category under BIRTH WEIGHT
// in the session header (PatientStrip, app.jsx).
//
// On the 2026-10-19 dev-local run of release #163, a made-up 4,400 g term boy
// read "LBW". The label was `bw < 1000 ? ELBW : bw < 1500 ? VLBW : LBW` with no
// upper bound, so every birth weight from 1,500 g up was called low.
//
//   §1  The real <PatientStrip> at 999, 1000, 1499, 1500, 2499, 2500 and
//       4400 g: ELBW < 1000 g, VLBW 1000–1499 g, LBW 1500–2499 g, and no
//       label from 2500 g. Each case first reads its own grams in the
//       Birth weight cell, so a missing label cannot pass by looking in the
//       wrong cell, and the "no label" cases also search the whole strip.
//   §2  The strip never prints: both shells hide .patient-strip in
//       @media print, so the category is not on the pharmacy order.
//
// Against 9eb3335 (main before the fix), 4 of 32 fail: the label at 2500 and
// 4400 g, in the cell and in the strip, from the sources and from compiled/.
//
// Mounts the real modules in jsdom (same dev-only deps as the other component
// harnesses; see test/README.md). It also runs against the shipped compiled/
// with NODE_OPTIONS=--require ./test/compiled-loader.cjs.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';
const R = (f) => fs.readFileSync(DIR + f, 'utf8');

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
  try { await fn(); } catch (e) { ok(`(section ran to the end) ${e.message}`, false, e.stack.split('\n').slice(0, 3)); }
}

// ── jsdom + the real modules ──────────────────────────────────────────────
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><div id="probe"></div></body></html>',
  { url: 'https://localhost/', pretendToBeVisual: true });
const { window } = dom;
Object.assign(global, {
  window, document: window.document, self: window,
  HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
  getComputedStyle: window.getComputedStyle,
  sessionStorage: window.sessionStorage, localStorage: window.localStorage,
  Event: window.Event, CustomEvent: window.CustomEvent, MouseEvent: window.MouseEvent,
  requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: clearTimeout,
  IS_REACT_ACT_ENVIRONMENT: true,
});
global.showToast = () => {};
window.print = () => {};
window.confirm = () => true;
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
global.ReactDOM = ReactDOM; window.ReactDOM = ReactDOM;
window.NEOFEED_CLIENT_ID = 'test-client';
window.NEOFEED_GAS_URL = '';           // GAS off: no network from this harness

const load = (f) => vm.runInThisContext(babel.transformSync(R(f), {
  presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
  filename: f, configFile: false, babelrc: false,
}).code);
vm.runInThisContext(R('data.js'));
['icons.jsx', 'calculator.jsx', 'fenton.jsx', 'registry.jsx', 'log.jsx'].forEach(load);
act(() => { load('app.jsx'); });

// Its own node: app.jsx's last line mounts the whole <App/> into #root.
const probe = document.getElementById('probe');
const root = ReactDOM.createRoot(probe);
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
// Text node by text node, spaced: textContent runs "4,400g" into "LBW" with no
// word boundary between them, and a \bLBW\b search of that passed on the bug.
function words(el) {
  const out = [], walk = document.createTreeWalker(el, window.NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) out.push(walk.currentNode.nodeValue);
  return out.join(' ').replace(/\s+/g, ' ').trim();
}
const CATEGORY = /\b(?:E|V)?LBW\b/;

// A made-up term infant (no real identifiers); only the birth weight changes.
const infant = (bw) => ({
  sessionId: `BW-${bw}`, name: 'ทดสอบ', bw, ga: 39.0, sex: 'boys', currentBed: 'NICU 5',
  admissionDate: '2026-10-19', dob: '2026-10-19', diagnosis: '-', status: 'Active',
  weights: [{ dol: 1, w: bw }],
});
function mount(bw) {
  act(() => {
    root.render(React.createElement(PatientStrip, {
      patient: infant(bw), entries: [], currentDol: 1, onSwitch() {}, onEdit() {},
    }));
  });
  const strip = probe.querySelector('.patient-strip');
  // The Birth weight cell is the div whose own .lbl reads "Birth weight".
  const lbl = [...probe.querySelectorAll('.patient-strip .lbl')].find(l => text(l) === 'Birth weight');
  return { strip, cell: lbl ? lbl.parentElement : null };
}

const CASES = [
  // [grams, label, colour] — colour is the label's own inline colour.
  [999,  'ELBW', 'var(--crit)'],
  [1000, 'VLBW', 'var(--warn)'],
  [1499, 'VLBW', 'var(--warn)'],
  [1500, 'LBW',  'var(--ink-3)'],
  [2499, 'LBW',  'var(--ink-3)'],
  [2500, null,   null],
  [4400, null,   null],
];

(async () => {
  await section('§1 the real PatientStrip: ELBW < 1000, VLBW 1000–1499, LBW 1500–2499, nothing from 2500 g', async () => {
    for (const [bw, want, colour] of CASES) {
      const { strip, cell } = mount(bw);
      ok(`${bw} g: the strip and its Birth weight cell are on screen`, !!strip && !!cell);
      eq(`${bw} g: the cell shows this infant's birth weight`, text(cell.querySelector('.val')), `${bw.toLocaleString('en-US')}g`);
      const sub = cell.querySelector('.sub');
      if (want) {
        eq(`${bw} g: the label under it reads ${want}`, text(sub), want);
        eq(`${bw} g: …in its own colour`, sub && sub.style.color, colour);
      } else {
        eq(`${bw} g: no category line under the birth weight`, sub ? text(sub) : null, null);
        ok(`${bw} g: no ELBW / VLBW / LBW anywhere in the strip`, !CATEGORY.test(words(strip)), words(strip));
      }
    }
  });

  await section('§2 the strip never prints, so the category is not on the order', async () => {
    for (const shell of ['index.html', 'NeoFeed.html']) {
      const src = R(shell);
      const at = src.indexOf('@media print');
      ok(`${shell}: has a print block`, at >= 0);
      // The block's first rule is the list of screen-only parts it hides.
      const rule = (src.slice(at).match(/\{\s*(?:\/\*[\s\S]*?\*\/\s*)*([^{}]*)\{\s*display:\s*none\s*!important;\s*\}/) || [])[1] || '';
      ok(`${shell}: @media print hides .patient-strip`, /(^|[\s,])\.patient-strip\s*(,|$)/.test(rule), rule.trim());
    }
  });

  act(() => root.unmount());
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
