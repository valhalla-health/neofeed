#!/usr/bin/env node
// Runs when the vera subagent stops (a Stop hook in .claude/agents/vera.md, which
// Claude Code turns into SubagentStop). If her report breaks § Report there, it
// sends her back once with the reason; the second time she stops, she finishes,
// so the hook can never loop. The shape is checked here, not in the prompt,
// because her report goes unedited into the PR body. test/verify-vera-report.cjs.
'use strict';

const MAX_FINDINGS = 5;
const FINDING = /^\s*(\d+)\.\s*(🔴|🟠|🟡)\s*(.*)$/u;
const PATH_LINE = /[\w./-]+\.[A-Za-z0-9]+:\d+/;

function checkReport(text) {
  const lines = String(text || '').split(/\r?\n/);
  const problems = [];

  // Vera blocks or does not; she never approves, so PASS is not a verdict.
  const verdict = lines.map(l => l.match(/^\s*VERDICT:\s*(.*?)\s*$/)).find(Boolean);
  if (!verdict || !/^(BLOCK|NO BLOCK)$/.test(verdict[1])) {
    problems.push('Start with "VERDICT: BLOCK" or "VERDICT: NO BLOCK".');
  }
  for (const section of ['SCOPE:', 'FINDINGS:', 'TESTS TO ADD:', 'NOT REVIEWED:']) {
    if (!lines.some(l => l.trim().startsWith(section))) problems.push(`Add the ${section} section.`);
  }

  const findings = [];
  lines.forEach((line, i) => {
    const m = line.match(FINDING);
    if (m) findings.push({ n: m[1], severity: m[2], head: m[3], index: i });
  });
  if (findings.length > MAX_FINDINGS) {
    problems.push(`Keep at most ${MAX_FINDINGS} findings, most severe first; you have ${findings.length}.`);
  }
  findings.forEach((f, k) => {
    if (!PATH_LINE.test(f.head)) problems.push(`Finding ${f.n} needs a path:line from the diff.`);
    const end = k + 1 < findings.length ? findings[k + 1].index : lines.length;
    const body = lines.slice(f.index + 1, end);
    if (!body.some(l => /^\s*Evidence:\s*\S/.test(l))) {
      problems.push(`Finding ${f.n} needs an Evidence: line quoting the diff or a committed file.`);
    }
    if (f.severity === '🔴' && !body.some(l => /^\s*Fails when:\s*\S/.test(l))) {
      problems.push(`Finding ${f.n} is 🔴, so it needs a Fails when: line with the input that gives the wrong result.`);
    }
  });

  const red = findings.some(f => f.severity === '🔴');
  if (verdict && verdict[1] === 'NO BLOCK' && red) problems.push('A 🔴 finding means VERDICT: BLOCK.');
  if (verdict && verdict[1] === 'BLOCK' && !red) problems.push('VERDICT: BLOCK needs at least one 🔴 finding.');
  return problems;
}

function main() {
  let input;
  try { input = JSON.parse(require('fs').readFileSync(0, 'utf8')); } catch { return; }
  if (input.stop_hook_active) return;
  const problems = checkReport(input.last_assistant_message);
  if (problems.length === 0) return;
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason: 'Your report does not follow .claude/agents/vera.md § Report. Rewrite it: ' + problems.join(' '),
  }));
}

if (require.main === module) main();
module.exports = { checkReport };
