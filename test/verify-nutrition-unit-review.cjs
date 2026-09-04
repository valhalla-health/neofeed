// Nutrition Unit review, AUG 2026 — the two items acted on in the 2026-09-01 pass.
//
// 1. SALT CAPTIONS. Every salt row's caption used to be a bare `→ {solVol} mL/d`
//    sitting directly under an input in mEq/kg. For Glycophos and KCl the two
//    numbers land almost on top of each other — an order of 3 mEq/kg renders a
//    caption of "3.2 mL/d" — so the arrow reads as "3 mL becomes 3.2 mL after
//    dead space". The Nutrition Unit read it exactly that way and reported a
//    phosphorus formula error against it: from `3 → 3.2 mL` they computed
//    P = 3 x 31 = 93 mg/day and asked why the app showed 47 mg/kg/d.
//
//    The arithmetic was never wrong. The Glycophos input is mEq Na/kg/day, not
//    mL — `calculator.jsx` renders `glycophosP * 2` and stores `v / 2` — so an
//    entered 3 is 1.5 mL/kg/day, and 1.5 x 31 = 46.5 -> "47". Their 93 mg is the
//    right answer for a different prescription (3 mL/kg/day, i.e. double the Na).
//    Nothing was miscalculated; the caption made the misreading available.
//
//    So what is pinned here is the caption's *legibility*: each row must state
//    the unit conversion it performs, and must separate what the pharmacy
//    compounds from what reaches the infant. A regression here does not produce
//    a wrong number — it produces a correct number that is read as a wrong one,
//    which is why an arithmetic harness cannot see it and this one exists.
//
// 2. Ca/P TIMING (their slide 8). Oral calcium and phosphate bind each other in
//    the gut lumen, so the two doses have to be separated in time — a fact no
//    daily total can express. The advisory must appear when, and only when, both
//    are ordered.
//
// Expected strings are computed from an independent transcription of the KCMH
// chain held in this file, not copied out of the app — the same two-implementations
// rule verify-kcmh-factor.cjs follows. Needs npm (mounts real components in jsdom).
const fs = require('fs');
const vm = require('vm');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = require('path').join(__dirname, '..') + '/';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'https://localhost/', pretendToBeVisual: true });
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
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = React;
global.React = React; window.React = React;

vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
for (const f of ['icons.jsx', 'calculator.jsx']) {
  vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + f, 'utf8'), {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    filename: f, configFile: false, babelrc: false,
  }).code);
}

// ── Drive the real component ───────────────────────────────────────────────
const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
const patient = { sessionId: 'N-1', name: 'T', currentBed: '9B2', diagnosis: '-', weights: [] };

act(() => {
  root.render(React.createElement(window.Calculator, {
    patient, dol: 5,
    editEntry: { entryId: 'fixture-entry', lastModified: 'fixture-stamp', ts: '2026-08-06', dol: 5, weight: 0, calcInput: {} },
    baselineEntry: null, logDate: null,
    onLog(){}, onUpdate(){}, onSaved(){}, onWeightChange(){},
  }));
});
act(() => {
  container.querySelectorAll('.card-h.clickable').forEach((h) =>
    h.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
});

const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
function setField(labelText, value) {
  // NumField renders .field > label; SaltRow renders .salt-row-grid > div > div
  let input = null;
  const field = [...container.querySelectorAll('.field')]
    .find((d) => d.querySelector('label')?.textContent.startsWith(labelText));
  if (field) input = field.querySelector('input');
  if (!input) {
    const row = [...container.querySelectorAll('.salt-row-grid')]
      .find((d) => d.firstElementChild?.firstElementChild?.textContent.startsWith(labelText));
    if (row) input = row.querySelector('input');
  }
  if (!input) throw new Error('field not found: ' + labelText);
  act(() => {
    valueSetter.call(input, String(value));
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  return input;
}
const text = () => container.textContent.replace(/\s+/g, ' ');

let fails = 0;
function check(label, cond, detail) {
  if (!cond) { fails++; if (detail) console.log('        want: ' + detail); }
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`);
}

// ── the worksheet's own rounding + the app's formatter, transcribed ─────────
// fmt(n,d) = String(Math.round(n*10^d)/10^d) — strips trailing zeros (calculator.jsx:14)
const fmt = (n, d) => String(Math.round(n * Math.pow(10, d)) / Math.pow(10, d));
const r = (x, d) => parseFloat(x.toFixed(d));      // solVol's r1 / r2
const TRIEM = 'เตรียม';                        // เตรียม
const TUENG = 'ถึงผู้ป่วย'; // ถึงผู้ป่วย
const KASAI = 'คาสาย';                              // คาสาย

// The case from their slide 4, reproduced exactly: 1.8 kg, 162 mL bag, 30 mL
// dead space (the unit's standard, confirmed 2026-09-01).
const WT = 1.8, DELIVERED = 162, DEAD = 30;
const overfill = (DELIVERED + DEAD) / DELIVERED;   // G7/C7
const factor = overfill * WT;                      // H9

// label, perKg entered, divisor (units per mL), decimals solVol rounds to, head unit
const SALTS = [
  ['20% NaCl',           3, 3.42, 1, 'mEq Na/kg/d'],
  ['Na Acetate',         2, 3.0,  1, 'mEq Na/kg/d'],
  ['Glycophos',          3, 2.0,  1, 'mEq Na/kg/d'],   // 1 mL = 2 mEq Na = 1 mmol P
  ['KCl',                3, 2.0,  1, 'mEq K/kg/d'],
  ['K₂HPO₄',   1, 1.0,  2, 'mEq K/kg/d'],
];

setField('Current weight(g)', WT * 1000);
setField('Volume(mL/day)', DELIVERED);
setField('ปริมาตรคาสาย (dead space)(mL/day)', DEAD);
for (const [label, perKg] of SALTS) setField(label, perKg);
// Not part of this change; set so their captions render for the canary below.
setField('MgSO₄', 0.4);
setField('10% Ca gluconate', 80);

console.log('── every salt caption states its mEq → mL conversion ──');
const t1 = text();
for (const [label, perKg, divisor, dp, head] of SALTS) {
  const mlPerKg = perKg / divisor;
  const prepared = r(mlPerKg * factor, dp);
  const delivered = mlPerKg * WT;

  const wantHead = `${fmt(perKg, 1)} ${head} = ${fmt(mlPerKg, 2)} mL/kg/d`;
  const wantSplit = `${TRIEM} ${fmt(prepared, dp)} mL/d = ${TUENG} ${fmt(delivered, dp)}`
                  + ` + ${KASAI} ${fmt(prepared - delivered, dp)} mL`;

  check(`${label} — conversion shown`, t1.includes(wantHead), wantHead);
  check(`${label} — compounded vs delivered split`, t1.includes(wantSplit), wantSplit);
}

// Both phosphorus sources must report P the same way — only Glycophos did before.
check('Glycophos reports P mg/kg/d', /P 47 mg\/kg\/d/.test(t1));
check('K₂HPO₄ reports P mg/kg/d', /P 16 mg\/kg\/d/.test(t1));

// Canary. Three arrow captions are deliberately left in the old form:
//   MgSO4 (their slide 5 asks for mg/kg here, so it changes with that item),
//   Ca gluconate (input is already mg/kg — no mEq→mL ambiguity to remove),
//   the heparin hint (states both units either side of the arrow).
// A NEW bare-arrow caption under a mEq/kg input is the regression to catch.
const arrows = t1.match(/→ \d/g) || [];
check('only the 3 known arrow captions remain', arrows.length === 3,
      `3, got ${arrows.length} :: ${JSON.stringify(t1.match(/.{18}→ \d.{8}/g))}`);

// ── with no dead space there is nothing to split ───────────────────────────
console.log('\n── no dead space ──');
setField('ปริมาตรคาสาย (dead space)(mL/day)', 0);
const t0 = text();
// NB: KASAI also appears in the dead-space input's OWN label, so assert on the
// split marker rather than on the bare word.
check('split disappears', !t0.includes('= ' + TUENG));
check('conversion still shown', t0.includes('3 mEq Na/kg/d = 0.88 mL/kg/d'));

// ── slide 8 — oral Ca and P must not be given together ─────────────────────
console.log('\n── slide 8 — Ca/P timing advisory ──');
const ADV = new RegExp('บริหารยาคนละเวลา'
  + ' หรือห่างกันอย่างน้อย 1 ชั่วโมง');
check('absent when neither ordered', !ADV.test(text()));
setField('ปริมาณ elem Ca', 80);
check('absent when only Ca ordered', !ADV.test(text()));
setField('ปริมาณ elem P', 40);
check('present when both ordered', ADV.test(text()));
setField('ปริมาณ elem Ca', 0);
check('absent again once Ca is removed', !ADV.test(text()));

// ── SaltRow rejects a negative electrolyte dose (fixed 2026-09-04) ─────────
// NumField already deliberately excludes '-' from its allowed charset (see
// its own comment in calculator.jsx); SaltRow's regex allowed it, so a
// mistyped negative dose reached calc() unclamped. The server's plausibility
// guard (_checkRange, min 0 on na/k/ca/p) only ever sees the AGGREGATE total,
// not this row's own value, so a negative single-salt entry that nets out in
// the sum would still reach the printed order line unvalidated — this has to
// be caught here, at the input.
console.log('\n── SaltRow rejects a negative dose ──');
const naclInput = setField('20% NaCl', '-3');
check('a typed "-3" is not rendered with its minus sign', naclInput.value === '3', naclInput.value);
setField('20% NaCl', 3); // restore the value the SALTS-table assertions above depend on

console.log(fails === 0 ? '\nNUTRITION UNIT REVIEW: ALL PASS' : `\nNUTRITION UNIT REVIEW: ${fails} FAILURE(S)`);
process.exit(fails ? 1 : 0);
