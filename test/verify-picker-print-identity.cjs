// Regression cover for the 2026-09-10 patient-identification review.
//
// Two independent defects, both about misidentifying a patient rather than
// miscalculating a dose:
//
//   1. <PatientPicker> — the modal behind the header's "switch patient"
//      button, the fastest path to changing the active patient mid-shift —
//      rendered bed/name/GA/BW/diagnosis per row but never the twin/multiples
//      label. Twins share initials by construction (registry.jsx's sessionId
//      is initials+BW+twinSuffix) and are usually in adjacent beds, so two
//      rows here could look identical except for a small bed chip. The
//      registry table/cards already call multiplesLabel(); the picker was
//      the one place it was missing.
//   2. PrintOrderForm — the physical pharmacy order, the highest-consequence
//      document leaving the app — labeled its own derived sessionId as
//      "AN:", which reads to a pharmacist as the hospital's real Admission
//      Number. It is not: it's NeoFeed's collision-prone
//      initials+BW+twinSuffix key (see gas-backend.gs's _sessionIdConflict).
//      Mislabeling it hands a pharmacist a false cross-check against the
//      chart. Relabeled to "NeoFeed ID:" and the twin suffix is now printed
//      next to the name too, for the same reason the picker needed it.
//
// Same jsdom harness as verify-registry-logged-today.cjs (mounts registry.jsx
// for real) and verify-tpn-calc-weight.cjs (mounts calculator.jsx for real
// and reads the rendered print form). Needs the same dev-only npm deps as the
// other jsdom harnesses (see test/README.md):
//   node test/verify-picker-print-identity.cjs
const fs = require('fs');
const vm = require('vm');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = require('path').join(__dirname, '..') + '/';

let pass = 0, fail = 0;
function ok_(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name.padEnd(60)}${cond ? '' : '  ' + JSON.stringify(detail)}`);
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

// Both registry.jsx and calculator.jsx only reach for <Icon> as decoration —
// stub it rather than pulling icons.jsx in, same as verify-registry-logged-today.cjs.
global.Icon = () => null; window.Icon = global.Icon;

for (const f of ['calculator.jsx', 'registry.jsx']) {
  vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + f, 'utf8'), {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    filename: f, configFile: false, babelrc: false,
  }).code);
}
const PatientPicker = window.PatientPicker;
const Calculator = window.Calculator;

// ── #1: PatientPicker shows the multiples label ─────────────────────────────
console.log('\n── PatientPicker: twin/multiples label ──');
const twinA = { sessionId: 'PP-BW1200-A', name: 'PP', initials: 'PP', bw: 1200, ga: 30.0,
                currentBed: 'NICU 3', diagnosis: 'RDS', twinSuffix: 'A', multiplesCount: 2 };
const twinB = { sessionId: 'PP-BW1180-B', name: 'PP', initials: 'PP', bw: 1180, ga: 30.0,
                currentBed: 'NICU 4', diagnosis: 'RDS', twinSuffix: 'B', multiplesCount: 2 };
const singleton = { sessionId: 'AT-BW1450-A', name: 'AT', initials: 'AT', bw: 1450, ga: 31.0,
                     currentBed: 'NICU 5', diagnosis: 'TTN' };

const pickerContainer = document.getElementById('root');
const pickerRoot = ReactDOM.createRoot(pickerContainer);
act(() => {
  pickerRoot.render(React.createElement(PatientPicker, {
    patients: [twinA, twinB, singleton], activeId: null, onSelect() {}, onClose() {},
  }));
});
const rows = [...pickerContainer.querySelectorAll('.picker-row')].map(r => r.textContent);

ok_('twin A row is labeled', /Twin A/.test(rows[0]), rows[0]);
ok_('twin B row is labeled', /Twin B/.test(rows[1]), rows[1]);
ok_('two twin rows are distinguishable by text alone (not just bed color)',
    rows[0] !== rows[1], rows);
ok_('a non-twin row carries no multiples label', !/Twin|Triplet|Quadruplet/.test(rows[2]), rows[2]);

// ── #2: PrintOrderForm identity fields ──────────────────────────────────────
console.log('\n── PrintOrderForm: no false "AN:", twin suffix shown ──');
const printContainer = document.createElement('div');
document.body.appendChild(printContainer);
const printRoot = ReactDOM.createRoot(printContainer);

function printTextFor(patient) {
  act(() => {
    printRoot.render(React.createElement(Calculator, {
      key: 'print-' + patient.sessionId,
      patient, dol: 3,
      editEntry: { entryId: 'w-print-' + patient.sessionId, lastModified: 'lm-print', ts: '2026-09-10',
                   dol: 3, weight: patient.bw, calcInput: { curWtG: patient.bw } },
      baselineEntry: null, logDate: null,
      onLog(){}, onUpdate(){}, onSaved(){}, onWeightChange(){},
    }));
  });
  const form = printContainer.querySelector('#print-form');
  if (!form) throw new Error('print form did not render for ' + patient.sessionId);
  return form.textContent.replace(/\s+/g, ' ');
}

const twinPrintText = printTextFor(twinA);
ok_('print form never claims a NeoFeed sessionId is a real "AN:"',
    !/\bAN:/.test(twinPrintText), twinPrintText);
ok_('print form labels the id as NeoFeed\'s own, not the hospital\'s',
    twinPrintText.includes('NeoFeed ID: ' + twinA.sessionId), twinPrintText);
ok_('print form names the twin letter next to the patient name',
    /PP \(Twin A\)/.test(twinPrintText), twinPrintText);

const singletonPrintText = printTextFor(singleton);
ok_('a non-twin print form carries no "(Twin ...)" tag',
    !/\(Twin/.test(singletonPrintText), singletonPrintText);
ok_('a non-twin print form still gets the relabeled id',
    singletonPrintText.includes('NeoFeed ID: ' + singleton.sessionId), singletonPrintText);

console.log(`\n${fail === 0 ? 'PICKER/PRINT IDENTITY: ALL PASS' : `PICKER/PRINT IDENTITY: ${fail} FAILED`} (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
