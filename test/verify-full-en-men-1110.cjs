// Full EN never counts a MEN feed (Pp, 2026-11-10).
//
// The calculator already switches to the enteral targets on counted EN only
// (calculator.jsx useEnteralTargets). The Daily log's target bands and the
// patient page's targets read the saved row's enVolPerKg, which is the feed
// actually given and includes MEN, so a MEN-ticked feed of 100 mL/kg/d or
// more showed enteral targets there while the order itself used parenteral
// ones. D.isFullEn is the one rule for a saved row; this pins it and checks
// that log.jsx and app.jsx no longer carry their own copy.
//
//   node test/verify-full-en-men-1110.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const sandbox = { window: {}, console, Intl, Date, Math, Number, isFinite, isNaN, parseInt, parseFloat, String };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8'), sandbox);
const D = sandbox.window.NEOFEED_DATA;

let fails = 0;
const eq = (label, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(58)} got ${got}  want ${want}`);
};

console.log('\n── D.isFullEn on saved rows ──');
eq('helper exists', typeof D.isFullEn, 'function');
const full = (row) => (typeof D.isFullEn === 'function' ? D.isFullEn(row) : undefined);
eq('140 mL/kg/d, no MEN', full({ enVolPerKg: 140, calcInput: { isMEN: false } }), true);
eq('exactly 100 mL/kg/d counts', full({ enVolPerKg: 100, calcInput: {} }), true);
eq('99 mL/kg/d is below Full EN', full({ enVolPerKg: 99, calcInput: {} }), false);
eq('140 mL/kg/d ticked MEN is not Full EN', full({ enVolPerKg: 140, calcInput: { isMEN: true } }), false);
eq('row without calcInput (older rows) reads the volume', full({ enVolPerKg: 120 }), true);
eq('row without enVolPerKg (legacy) is parenteral', full({ calcInput: {} }), false);
eq('no row', full(null), false);

console.log('\n── no second copy of the rule ──');
const inline = /enVolPerKg \|\| 0\)\s*>=\s*100/;
for (const f of ['log.jsx', 'app.jsx']) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  eq(`${f} has no inline enVolPerKg >= 100 test`, inline.test(src), false);
  eq(`${f} calls isFullEn`, /\.isFullEn\(/.test(src), true);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
