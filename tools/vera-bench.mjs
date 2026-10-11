#!/usr/bin/env node
// Vera's seeded-bug benchmark (2026-10-11). Each case in test/vera-bench/ is a
// diff against key.base with planted defects and decoys (changes that look
// wrong and are right); key.json says where each one is. A reviewer is scored
// on what she catches, at what severity, and on the decoys she flags.
//
//   node tools/vera-bench.mjs prepare [--out DIR]   one worktree per case at
//        key.base with its patch applied, and DIR/<id>.review.md for Vera
//   (start the vera subagent once per review file, its prompt the file's path
//    alone, and save each report as DIR/reports/<id>.md)
//   node tools/vera-bench.mjs score DIR             grade the reports
//   node tools/vera-bench.mjs clean DIR             remove the worktrees
//
// Run it again whenever vera.md, her tools or her model change, and record the
// score in CHANGELOG.md. The key sits in this repo: a reviewer that searches
// the repo root instead of the Repo: folder could read it, so check her tool
// calls stayed inside the prepared worktree. test/verify-vera-bench.cjs pins
// the scorer and checks the key against the patches.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BENCH = path.join(ROOT, 'test', 'vera-bench');
const require = createRequire(import.meta.url);
const { checkReport } = require(path.join(ROOT, '.claude', 'hooks', 'vera-report.cjs'));

const RANK = { '🟡': 1, '🟠': 2, '🔴': 3 };
const LINE_SLACK = 5;    // a finding this close to a planted line counts as on it
const DECOY_SLACK = 2;   // decoys sit near real code, so they are matched tighter
const FINDING = /^\s*(\d+)\.\s*(🔴|🟠|🟡)\s*(.*)$/u;
const SECTION = /^\s*(TESTS TO ADD|NOT REVIEWED):/;
const PATH_LINE = /([\w./-]+\.[A-Za-z0-9]+):(\d+)/;

export function parseFindings(text) {
  const lines = String(text || '').split(/\r?\n/);
  const out = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(FINDING);
    if (m) {
      const pl = m[3].match(PATH_LINE);
      cur = { severity: m[2], path: pl ? pl[1] : '', line: pl ? Number(pl[2]) : NaN, text: m[3] };
      out.push(cur);
    } else if (SECTION.test(line)) {
      cur = null;
    } else if (cur) {
      cur.text += '\n' + line;
    }
  }
  return out;
}

const sameFile = (f, file) => f.path === file || f.path.endsWith('/' + file);
const near = (f, item, slack) => sameFile(f, item.file) && Math.abs(f.line - item.line) <= slack;
const quotes = (f, item) => sameFile(f, item.file) && f.text.includes(item.snippet);

// `root`, when given, lets the shape check refuse a cited path that does not exist.
export function scoreCase(c, text, root) {
  const findings = parseFindings(text);
  const verdict = (String(text || '').match(/^\s*VERDICT:\s*(.*?)\s*$/m) || [])[1] || '';
  const used = new Set();
  const caught = [], partial = [], missed = [];
  for (const d of c.defects) {
    const hits = findings.filter(f => quotes(f, d) || near(f, d, LINE_SLACK));
    hits.forEach(f => used.add(f));
    const best = Math.max(0, ...hits.map(f => RANK[f.severity]));
    if (best >= RANK[d.min]) caught.push(d.id);
    else if (best > 0) partial.push(d.id);
    else missed.push(d.id);
  }
  const decoyHits = [], decoyNoise = [];
  for (const d of c.decoys) {
    const hits = findings.filter(f => !used.has(f) && (quotes(f, d) || near(f, d, DECOY_SLACK)));
    hits.forEach(f => used.add(f));
    const worst = Math.max(0, ...hits.map(f => RANK[f.severity]));
    if (worst >= RANK['🟠']) decoyHits.push(d.id);
    else if (worst > 0) decoyNoise.push(d.id);
  }
  return {
    id: c.id, expect: c.expect, verdict, verdictOk: verdict === c.expect,
    defects: c.defects.length, decoys: c.decoys.length,
    caught, partial, missed, decoyHits, decoyNoise,
    unkeyed: findings.filter(f => !used.has(f)).map(f => `${f.severity} ${f.path}:${f.line}`),
    shape: checkReport(text, root),
  };
}

export function summarize(results) {
  const sum = (k) => results.reduce((n, r) => n + (Array.isArray(r[k]) ? r[k].length : r[k]), 0);
  return {
    cases: results.length,
    verdictsRight: results.filter(r => r.verdictOk).length,
    defects: sum('defects'), caught: sum('caught'), partial: sum('partial'), missed: sum('missed'),
    decoys: sum('decoys'), decoyHits: sum('decoyHits'), decoyNoise: sum('decoyNoise'),
    unkeyed: sum('unkeyed'), shapeProblems: results.filter(r => r.shape.length).length,
  };
}

// New-file line number → text of every line a unified diff adds, per file.
export function addedLines(patch) {
  const out = {};
  let file = null, line = 0;
  for (const raw of String(patch).split(/\r?\n/)) {
    if (raw.startsWith('+++ ')) { file = raw.slice(4).replace(/^b\//, ''); out[file] = out[file] || {}; continue; }
    if (raw.startsWith('--- ') || raw.startsWith('diff ') || raw.startsWith('index ')) continue;
    const h = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (h) { line = Number(h[1]); continue; }
    if (!file || raw.startsWith('\\')) continue;
    if (raw.startsWith('+')) { out[file][line] = raw.slice(1); line++; }
    else if (raw.startsWith(' ')) line++;
  }
  return out;
}

const loadKey = () => JSON.parse(fs.readFileSync(path.join(BENCH, 'key.json'), 'utf8'));
const git = (args, opts = {}) => execFileSync('git', args, { encoding: 'utf8', ...opts });
const section = (md, name) => (md.split(new RegExp(`^## ${name}\\s*$`, 'm'))[1] || '').split(/^## /m)[0].trim();

function prepare(outDir) {
  const key = loadKey();
  fs.mkdirSync(path.join(outDir, 'reports'), { recursive: true });
  for (const c of key.cases) {
    const wt = path.join(outDir, c.id);
    if (fs.existsSync(wt)) git(['-C', ROOT, 'worktree', 'remove', '--force', wt]);
    git(['-C', ROOT, 'worktree', 'add', '--detach', '-q', wt, key.base]);
    git(['-C', wt, 'apply', path.join(BENCH, 'cases', `${c.id}.patch`)]);
    const md = fs.readFileSync(path.join(BENCH, 'cases', `${c.id}.md`), 'utf8');
    const review = [
      `Repo: ${wt}`, '',
      "## Pp's request", section(md, "Pp's request"), '',
      '## Diff', '```diff', git(['-C', wt, 'diff']).trimEnd(), '```', '',
      "## Author's claims", section(md, "Author's claims"), '',
    ].join('\n');
    const reviewPath = path.join(outDir, `${c.id}.review.md`);
    fs.writeFileSync(reviewPath, review);
    console.log(`${c.id.padEnd(22)} ${reviewPath}`);
  }
  console.log(`\nStart vera once per review file above, prompt = the path alone, and save each\nreport as ${path.join(outDir, 'reports', '<id>.md')}; then: node tools/vera-bench.mjs score ${outDir}`);
}

function score(outDir) {
  const key = loadKey();
  const results = key.cases.map(c => {
    const p = path.join(outDir, 'reports', `${c.id}.md`);
    return scoreCase(c, fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '', ROOT);
  });
  for (const r of results) {
    console.log(`${r.id.padEnd(22)} verdict ${r.verdictOk ? 'right' : `WRONG (${r.verdict || 'none'}, want ${r.expect})`}` +
      `  caught ${r.caught.length}/${r.defects}` + (r.partial.length ? `  weak ${r.partial.join(',')}` : '') +
      (r.missed.length ? `  missed ${r.missed.join(',')}` : '') + (r.decoyHits.length ? `  DECOY ${r.decoyHits.join(',')}` : '') +
      (r.decoyNoise.length ? `  decoy-noise ${r.decoyNoise.join(',')}` : '') + (r.unkeyed.length ? `  other ${r.unkeyed.length}` : '') +
      (r.shape.length ? `  SHAPE ${r.shape.length}` : ''));
  }
  const t = summarize(results);
  console.log(`\nverdicts ${t.verdictsRight}/${t.cases} · defects caught ${t.caught}/${t.defects} (weak ${t.partial}, missed ${t.missed})` +
    ` · decoys flagged ${t.decoyHits}/${t.decoys} (🟡 noise ${t.decoyNoise}) · other findings ${t.unkeyed} · reports off-shape ${t.shapeProblems}`);
  fs.writeFileSync(path.join(outDir, 'score.json'), JSON.stringify({ base: key.base, totals: t, results }, null, 2));
}

function clean(outDir) {
  for (const c of loadKey().cases) {
    const wt = path.join(outDir, c.id);
    if (fs.existsSync(wt)) git(['-C', ROOT, 'worktree', 'remove', '--force', wt]);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, a, b] = process.argv.slice(2);
  const outDir = path.resolve(cmd === 'prepare' ? (a === '--out' ? b : path.join(os.tmpdir(), 'vera-bench')) : (a || ''));
  if (cmd === 'prepare') prepare(outDir);
  else if (cmd === 'score' && a) score(outDir);
  else if (cmd === 'clean' && a) clean(outDir);
  else { console.error('usage: vera-bench.mjs prepare [--out DIR] | score DIR | clean DIR'); process.exit(2); }
}
