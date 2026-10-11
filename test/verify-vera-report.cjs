// verify-vera-report.cjs — the shape check on Vera's pre-PR review (2026-10-11).
//
// Vera (.claude/agents/vera.md) reviews a risky diff in her own context and
// returns BLOCK or NO BLOCK; she never approves, so PASS is not a verdict. Her
// report goes unedited into the PR body, so a vague finding there costs Pp a
// review round. .claude/hooks/vera-report.cjs runs when Vera stops and sends her
// back once if the report breaks § Report: no verdict, more than five findings,
// a finding without a path:line or a quoted Evidence line, a 🔴 without the
// input that fails, or a verdict that disagrees with the severities (any 🔴 is
// a BLOCK). Dependency-free.
//
//   #1 a well-formed BLOCK, a NO BLOCK with no findings, and one with a 🟠 pass
//   #2 each broken shape is caught, with a reason naming what to fix
//   #3 the hook: a bad report blocks once with that reason; a good one, or a
//      second stop, lets Vera finish
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.join(__dirname, '..', '.claude', 'hooks', 'vera-report.cjs');
const { checkReport } = require(HOOK);

let pass = 0, fail = 0;
function eq(name, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${good ? 'PASS' : 'FAIL'}  ${name.padEnd(66)}${good ? '' : ` got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
  good ? pass++ : fail++;
}
const ok = (name, cond) => eq(name, !!cond, true);

const BLOCK = `VERDICT: BLOCK
SCOPE: computed or printed value
FINDINGS:
1. 🔴 calculator.jsx:412 — the peripheral K⁺ maximum is compared with < where the source says ≤ — use <=
   Evidence: \`+  if (kConc < PERIPHERAL_K_MAX) {\`
   Fails when: peripheral K⁺ = 60 mEq/L → the order is refused, though the source allows 60.
2. 🟡 CHANGELOG.md:14 — the entry names no second clinician — say there is none, as the change protocol asks
   Evidence: \`+### Why\`
TESTS TO ADD:
- test/verify-kcmh-constants.cjs: peripheral K⁺ 60 mEq/L → saves; 60.1 → refused. Fails today because 60 is refused.
NOT REVIEWED:
- none
`;

const CLEAR_EMPTY = `VERDICT: NO BLOCK
SCOPE: outside Vera's scope
FINDINGS:
- none
TESTS TO ADD:
- none
NOT REVIEWED:
- none
`;

const CLEAR_AMBER = BLOCK
  .replace('VERDICT: BLOCK', 'VERDICT: NO BLOCK')
  .replace('1. 🔴 calculator.jsx:412', '1. 🟠 calculator.jsx:412');

console.log('\n── #1 well-formed reports ──');
eq('1.1 a BLOCK with a 🔴 and a 🟡, both with evidence', checkReport(BLOCK), []);
eq('1.2 a NO BLOCK with no findings', checkReport(CLEAR_EMPTY), []);
eq('1.3 a NO BLOCK whose worst finding is 🟠', checkReport(CLEAR_AMBER), []);

console.log('\n── #2 broken shapes ──');
const has = (problems, re) => problems.some(p => re.test(p));
ok('2.1 no VERDICT line', has(checkReport(BLOCK.replace(/^VERDICT: BLOCK\n/, '')), /VERDICT/));
ok('2.2 VERDICT: PASS (Vera never approves)', has(checkReport(CLEAR_EMPTY.replace('NO BLOCK', 'PASS')), /VERDICT/));
ok('2.3 a 🔴 under a NO BLOCK', has(checkReport(BLOCK.replace('VERDICT: BLOCK', 'VERDICT: NO BLOCK')), /🔴/));
ok('2.4 a BLOCK with no 🔴', has(checkReport(CLEAR_AMBER.replace('VERDICT: NO BLOCK', 'VERDICT: BLOCK')), /🔴/));
ok('2.5 a finding without path:line', has(checkReport(BLOCK.replace('calculator.jsx:412', 'the calculator')), /path:line/));
ok('2.6 a finding without an Evidence line', has(checkReport(BLOCK.replace(/\n {3}Evidence: `\+ {2}if[^\n]*/, '')), /Evidence/));
const six = BLOCK.replace('TESTS TO ADD:', [3, 4, 5, 6].map(n =>
  `${n}. 🟡 data.js:${n} — x — y\n   Evidence: \`+ x\``).join('\n') + '\nTESTS TO ADD:');
ok('2.7 six findings', has(checkReport(six), /at most 5/));
ok('2.8 no SCOPE line', has(checkReport(BLOCK.replace(/^SCOPE:[^\n]*\n/m, '')), /SCOPE/));
ok('2.9 no NOT REVIEWED section', has(checkReport(BLOCK.replace(/NOT REVIEWED:[\s\S]*$/, '')), /NOT REVIEWED/));
ok('2.10 an empty report', checkReport('').length > 0);
ok('2.11 a 🔴 without the input that fails', has(checkReport(BLOCK.replace(/\n {3}Fails when:[^\n]*/, '')), /Fails when/));
// The benchmark's first run (2026-10-11) had Vera cite gas-backend.gas:3689 for
// a gas-backend.gs line. Given the repo root, the check refuses a path that is
// not there.
const ROOT = path.join(__dirname, '..');
eq('2.12 every cited path exists in the repo', checkReport(BLOCK, ROOT), []);
ok('2.13 a cited path that is not in the repo', has(checkReport(BLOCK.replace('calculator.jsx:412', 'calculator.jsxx:412'), ROOT), /calculator\.jsxx.*not in the repo/));

console.log('\n── #3 the SubagentStop hook ──');
// Claude Code runs the hook as a plain node process. CI's compiled pass sets
// NODE_OPTIONS=--require ./test/compiled-loader.cjs, which would also load into
// this child and print its own line on the stdout the hook answers on. The
// hook checks cited paths under CLAUDE_PROJECT_DIR, pinned here to this repo.
const HOOK_ENV = { ...process.env, NODE_OPTIONS: '', CLAUDE_PROJECT_DIR: ROOT };
function runHook(input) {
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: 'utf8', env: HOOK_ENV });
  let out = null;
  try { out = r.stdout.trim() ? JSON.parse(r.stdout) : null; } catch { out = 'unparsable: ' + r.stdout; }
  return { status: r.status, out };
}
const bad = runHook({ agent_type: 'vera', stop_hook_active: false, last_assistant_message: 'Looks fine to me.' });
eq('3.1 a bad report: exit 0 with a JSON decision', bad.status, 0);
eq('3.2 …that blocks the stop', bad.out && bad.out.decision, 'block');
ok('3.3 …with a reason naming § Report', bad.out && /§ Report/.test(bad.out.reason || ''));
const good = runHook({ agent_type: 'vera', stop_hook_active: false, last_assistant_message: BLOCK });
eq('3.4 a good report: Vera finishes (no output)', [good.status, good.out], [0, null]);
const again = runHook({ agent_type: 'vera', stop_hook_active: true, last_assistant_message: 'still not a report' });
eq('3.5 a second stop: Vera finishes, so the hook cannot loop', [again.status, again.out], [0, null]);
const junk = spawnSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8', env: HOOK_ENV });
eq('3.6 unreadable input: Vera finishes', [junk.status, junk.stdout.trim()], [0, '']);

console.log(`\nVERA REPORT: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
