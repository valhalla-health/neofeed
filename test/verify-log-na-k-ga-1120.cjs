// The Log tab's Na and K trend bands read GA, as the Calculator's tiles do
// (Pp, 2026-11-20, Q23: the Jochum Table 3 term row from PMA 37 weeks at
// more than 1,500 g; with no GA, 2,500 g).
//
// log.jsx's pickTarget passes patient.ga into TPN_TARGETS.na/k. Vera on PR
// #296: nothing called pickTarget, so a dropped argument would put a 34-week
// infant born at 2,600 g on the term band (2–3) on the trend graph with no
// test failing. This harness runs the real pickTarget on synthetic rows.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');

const DIR = path.join(__dirname, '..') + '/';
let pass = 0, fail = 0;
function eq(name, got, want) {
  const yes = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${yes ? 'PASS' : 'FAIL'}  ${name.padEnd(70)} got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
  yes ? pass++ : fail++;
}

global.window = {};
global.React = { createElement() {}, useState() {}, useMemo() {}, useEffect() {}, useRef() {}, Fragment: 'f' };
window.React = global.React;
vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + 'log.jsx', 'utf8'), {
  presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
  filename: 'log.jsx', configFile: false, babelrc: false,
}).code);

// A TPN row (no feed, so the parenteral bands) on DOL 10 at the weight given.
const row = (dol, weight) => ({ dol, weight, enVolPerKg: 0, calcInput: {} });

console.log('\n── the Log tab picks the Na and K bands by PMA (Q23) ──');
eq('GA 34+0, born 2,600 g, DOL 10: Na on the preterm row 3–5', pickTarget('na', row(10, 2600), { bw: 2600, ga: 34 }), [3, 5]);
eq('…and K 1–3', pickTarget('k', row(10, 2600), { bw: 2600, ga: 34 }), [1, 3]);
eq('GA 38+0, 3 kg, DOL 10: Na on the term row 2–3', pickTarget('na', row(10, 3000), { bw: 3000, ga: 38 }), [2, 3]);
eq('…and K 1.5–3', pickTarget('k', row(10, 3000), { bw: 3000, ga: 38 }), [1.5, 3]);
eq('GA 28+0, 1,600 g, DOL 64 (PMA 37+0): Na on the term row 2–3', pickTarget('na', row(64, 1600), { bw: 1000, ga: 28 }), [2, 3]);
eq('no GA, 3 kg, DOL 10: the 2,500 g fallback, Na 2–3', pickTarget('na', row(10, 3000), { bw: 3000 }), [2, 3]);

console.log('\n── the Log tab picks the fluid band by weight, Fanaroff Table 96.1 (Q24) ──');
eq('GA 34+0, 2,600 g, DOL 1: > 1,500 g, 60–80', pickTarget('fluid', row(1, 2600), { bw: 2600, ga: 34 }), [60, 80]);
eq('GA 38+0, 2,600 g, DOL 1: the same row, no GA', pickTarget('fluid', row(1, 2600), { bw: 2600, ga: 38 }), [60, 80]);
eq('600 g, DOL 1: < 750 g, 100–200', pickTarget('fluid', row(1, 600), { bw: 600, ga: 24 }), [100, 200]);

console.log(`\n${fail === 0 ? 'LOG NA K GA 1120: ALL PASS' : `LOG NA K GA 1120: ${fail} FAILED`} (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
