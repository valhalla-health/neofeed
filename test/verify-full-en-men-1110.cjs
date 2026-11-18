// Full EN never counts a MEN feed (Pp, 2026-11-10).
//
// The calculator already switches to the enteral targets on counted EN only
// (calculator.jsx useEnteralTargets). The Daily log's target bands and the
// patient page's targets read the saved row's enVolPerKg, which is the feed
// actually given and includes MEN, so a MEN-ticked feed of 100 mL/kg/d (the
// switch then; 120 or 75 % of needs since 2026-11-18) or
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
// The switch is 120 mL/kg/d, or 75 % of the enteral energy and protein needs
// (86.25 kcal and 2.625 g/kg/d), whichever first (Pp, 2026-11-18, Q17,
// CR-U-SWITCH). Until then it was 100 mL/kg/d.
eq('exactly 120 mL/kg/d counts', full({ enVolPerKg: 120, calcInput: {} }), true);
eq('119 mL/kg/d with no feed named is below Full EN', full({ enVolPerKg: 119, calcInput: {} }), false);
eq('100 mL/kg/d, the switch until 2026-11-18, is not', full({ enVolPerKg: 100, calcInput: {} }), false);
eq('Hi-Q LBW 24 at 108 mL/kg/d gives 75 % of both: Full EN', full({ enVolPerKg: 108, calcInput: { enType: 'FBM_PF_24', enVol: 13.5, enFreq: 8 } }), true);
eq('Hi-Q LBW 24 at 107.2 mL/kg/d (85.8 kcal) is not', full({ enVolPerKg: 107.2, calcInput: { enType: 'FBM_PF_24', enVol: 13.4, enFreq: 8 } }), false);
eq('breast milk at 108 mL/kg/d (1.3 g protein) is not', full({ enVolPerKg: 108, calcInput: { enType: 'BM_20', enVol: 13.5, enFreq: 8 } }), false);
eq('two feeds are read together: BM 88 + Infatrini 20 mL/kg/d', full({ enVolPerKg: 108, calcInput: { enType: 'BM_20', enVol: 22, enFreq: 4, enType2: 'INFATRINI_30', enVol2: 5, enFreq2: 4 } }), false);
eq('a feed EN_DB does not hold is judged on volume alone', full({ enVolPerKg: 110, calcInput: { enType: 'NOT_A_FEED', enVol: 13.75, enFreq: 8 } }), false);
eq('Hi-Q LBW 24 at 108 ticked MEN is not Full EN', full({ enVolPerKg: 108, calcInput: { isMEN: true, enType: 'FBM_PF_24', enVol: 13.5, enFreq: 8 } }), false);
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
