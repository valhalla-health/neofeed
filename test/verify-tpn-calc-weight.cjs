// Regression cover for the "TPN calculated weight" split (added after a
// ward request): Step 1 used to have one "Current weight" field that fed
// every dose calculation directly. That field now only records the actual
// measured weight — every per-kg dose is computed off a second, derived
// "TPN calc. weight" that floors at birth weight until the infant regains
// it (KCMH bedside convention: dosing per-kg off a still-falling post-natal
// nadir over/under-doses everything), then tracks current weight
// automatically once it clears birth weight.
//
// Same jsdom harness as verify-kcmh-factor.cjs / verify-bed-dol-io.cjs
// section 3: mounts the real <Calculator> and drives its actual inputs.
const fs = require('fs');
const vm = require('vm');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = require('path').join(__dirname, '..') + '/';

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = Object.is(got, want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(56)} got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
function ok_(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name.padEnd(56)}${cond ? '' : '  ' + JSON.stringify(detail)}`);
  cond ? pass++ : fail++;
}

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
const { act } = require('react');
global.React = React; window.React = React;

vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
for (const f of ['icons.jsx', 'calculator.jsx']) {
  vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + f, 'utf8'), {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    filename: f, configFile: false, babelrc: false,
  }).code);
}

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);

// The order form is deliberately withheld until an entry has actually been
// saved (`savedEntryId` in calculator.jsx) — printing an actionable PN order
// for a record that does not exist yet is the thing that guard prevents. A
// freshly-mounted, unsaved Calculator therefore has no #print-form at all.
//
// Sections #1/#2 below need BOTH: an unsaved mount (so `onWeightChange` fires —
// it is skipped whenever `editEntry` is set) and a saved one (so the order form
// renders). Rather than remounting the primary root mid-section and losing the
// state those assertions are still driving, read the order form from a separate
// root seeded with a saved shell entry at the weight under test.
const printContainer = document.createElement('div');
document.body.appendChild(printContainer);
const printRoot = ReactDOM.createRoot(printContainer);

function printTextAt(pt, curWtG) {
  act(() => {
    printRoot.render(React.createElement(window.Calculator, {
      key: 'print-' + curWtG,
      patient: pt, dol: 3,
      editEntry: { entryId: 'w-print', lastModified: 'lm-print', ts: '2026-08-20',
                   dol: 3, weight: curWtG, calcInput: { curWtG: curWtG } },
      baselineEntry: null, logDate: null,
      onLog(){}, onUpdate(){}, onSaved(){}, onWeightChange(){},
    }));
  });
  const form = printContainer.querySelector('#print-form');
  if (!form) throw new Error('print form did not render for curWtG=' + curWtG);
  return form.textContent.replace(/\s+/g, ' ');
}

const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
function fieldByLabel(labelText) {
  return [...container.querySelectorAll('.field')]
    .find((d) => d.querySelector('label')?.textContent.startsWith(labelText));
}
function setField(labelText, value) {
  const input = fieldByLabel(labelText)?.querySelector('input');
  if (!input) throw new Error('field not found: ' + labelText);
  act(() => {
    valueSetter.call(input, String(value));
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
function readOnlyValue(labelText) {
  const field = fieldByLabel(labelText);
  if (!field) throw new Error('field not found: ' + labelText);
  const box = field.querySelector('.inp');
  return box ? box.textContent.trim() : null;
}

// ── #1: weight loss phase — current weight below birth weight ──────────────
console.log('\n── #1 below birth weight: TPN calc. weight floors at BW ──');
const patient = { sessionId: 'W-1', name: 'W', bw: 1500, currentBed: 'NICU 1', diagnosis: '-', weights: [] };
let lastWeightChange = null;
act(() => {
  root.render(React.createElement(window.Calculator, {
    patient, dol: 3, editEntry: null, baselineEntry: null, logDate: '2026-08-20',
    onLog(){}, onUpdate(){}, onSaved(){}, onWeightChange(w) { lastWeightChange = w; },
  }));
});
act(() => {
  container.querySelectorAll('.card-h.clickable').forEach((h) =>
    h.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
});

setField('Current weight', 1380); // below BW 1500 — still in the post-natal nadir
eq('Current weight field shows what was typed', fieldByLabel('Current weight').querySelector('input').value, '1380');
eq('TPN calc. weight floors at birth weight', readOnlyValue('TPN calc. weight'), '1500');
eq('onWeightChange propagates the ACTUAL weight, not the floor', lastWeightChange, 1380);

// The order form must compute off the floored weight (1.5 kg), not 1.38 kg.
const printText1 = printTextAt(patient, 1380);
ok_('print form uses the floored calc weight (1.500 Kg)', /Weight for calculation:\s*1\.500\s*Kg/.test(printText1), printText1);
ok_('print form flags the birth-weight floor', /birth weight/.test(printText1), printText1);

// ── #2: infant regains birth weight — TPN calc. weight tracks current ──────
console.log('\n── #2 at/above birth weight: TPN calc. weight tracks current ──');
setField('Current weight', 1500);
eq('exactly at BW counts as regained', readOnlyValue('TPN calc. weight'), '1500');
setField('Current weight', 1620);
eq('TPN calc. weight follows current weight once above BW', readOnlyValue('TPN calc. weight'), '1620');
const printText2 = printTextAt(patient, 1620);
ok_('print form now uses the real current weight (1.620 Kg)', /Weight for calculation:\s*1\.620\s*Kg/.test(printText2), printText2);
ok_('print form no longer flags the floor', !/birth weight/.test(printText2), printText2);

// Drop back below BW again — must re-floor, not stick at the last value seen
// above BW (this would be a stale-closure bug, not a deliberate "never look
// back down" rule).
setField('Current weight', 1490);
eq('dropping back below BW re-floors', readOnlyValue('TPN calc. weight'), '1500');

// ── #3: saved entry — Daily_Log weight is the ACTUAL weight ────────────────
console.log('\n── #3 saved entry weight column is the actual weight, not the floor ──');
setField('Current weight', 1380);
let saved = null;
act(() => {
  root.render(React.createElement(window.Calculator, {
    patient, dol: 3, editEntry: null, baselineEntry: null, logDate: '2026-08-20',
    onLog(entry) { saved = entry; return Promise.resolve({ ok: true, entryId: 'e-9', lastModified: 'lm-9' }); },
    onUpdate(){}, onSaved(){}, onWeightChange(){},
  }));
});
act(() => {
  container.querySelectorAll('.card-h.clickable').forEach((h) =>
    h.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
});
setField('Current weight', 1380);
act(() => {
  [...container.querySelectorAll('button')]
    .find(b => /บันทึก|Save/i.test(b.textContent))
    ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
});
eq('Daily_Log weight column is the actual current weight', saved && saved.weight, 1380);
ok_('saved calcInput has no bare "wtG" (birth-weight-floored) written as truth',
  saved && saved.calcInput && saved.calcInput.curWtG === 1380, saved && saved.calcInput);

// ── #4: no birth weight on record — never floors, just passes through ──────
console.log('\n── #4 patient with no bw recorded — no flooring possible ──');
const noBw = { sessionId: 'W-2', name: 'NoBW', currentBed: 'NICU 2', diagnosis: '-', weights: [] };
act(() => {
  root.render(React.createElement(window.Calculator, {
    patient: noBw, dol: 3, editEntry: null, baselineEntry: null, logDate: '2026-08-20',
    onLog(){}, onUpdate(){}, onSaved(){}, onWeightChange(){},
  }));
});
act(() => {
  container.querySelectorAll('.card-h.clickable').forEach((h) =>
    h.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
});
setField('Current weight', 900);
eq('no bw on record → TPN calc. weight = current weight', readOnlyValue('TPN calc. weight'), '900');

// ── #5: backward compatibility — restoring a pre-migration saved entry ─────
// Entries saved before this change only have calcInput.wtG (the plain
// entered weight) — applyCalcInput must fall back to it as curWtG.
console.log('\n── #5 legacy calcInput.wtG restores as Current weight ──');
const legacyEntry = {
  entryId: 'e-legacy', ts: '2026-08-10', dol: 5, weight: 1400, lastModified: 'x',
  calcInput: { wtG: 1400, fluidTargetPerKg: 120, totalTPN_mL: 150, dexPct: 10 },
};
act(() => {
  root.render(React.createElement(window.Calculator, {
    patient, dol: 5, editEntry: legacyEntry, baselineEntry: null, logDate: null,
    onLog(){}, onUpdate(){ return Promise.resolve({ ok: true }); }, onSaved(){}, onWeightChange(){},
  }));
});
eq('legacy wtG restores into Current weight', fieldByLabel('Current weight').querySelector('input').value, '1400');
eq('TPN calc. weight re-derives (floors, bw=1500 > 1400)', readOnlyValue('TPN calc. weight'), '1500');

console.log(`\n${fail === 0 ? 'TPN CALC WEIGHT: ALL PASS' : `TPN CALC WEIGHT: ${fail} FAILED`} (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
