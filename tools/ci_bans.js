#!/usr/bin/env node
// tools/ci_bans.js — rules a PR may not break (NF-19).
//
// Each rule is a correction Pp has had to make more than once. A line in
// AGENTS.md, a skill or a review comment can be forgotten by the next session;
// a failing build cannot. So when the same correction comes up a second time,
// it becomes a rule here instead of a third comment.
//
//   node tools/ci_bans.js              # check every tracked source file
//   node tools/ci_bans.js --self-test  # run each rule on test/ci-bans-fixtures.json
//
// Adding a rule: an entry in RULES naming the correction and where Pp made it,
// and at least one failing and one passing case in the fixtures (the self-test
// refuses a rule without both). An `allow` entry is for a line the rule cannot
// tell apart from a real hit; it says why, and an entry that no longer matches
// any line fails the run, so the list cannot go stale.
//
// Exit 0 when nothing is banned, 1 on a banned line or a stale allow entry,
// 2 when the self-test fails. Needs Node 18+ and git, and no npm install.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The sources a screen, the printed order or a copied order is built from.
// compiled/ is checked through its .jsx sources, and test/ and tools/ never
// reach a person.
const SOURCE = /\.(jsx|js|mjs|gs)$/;
const SKIP = /(^|\/)(compiled|vendor|test|tools|docs|openspec|graphify-out|node_modules|\.claude)\//;

const RULES = [
  {
    id: "raw-tofixed",
    why:
      'A number a person reads never ends in a trailing zero: "18.0" can be read as 180 ' +
      '(Praew, 2026-09-22: "ห้ามมี .0 เช่น 18.0 คือ 18"; the ISMP rule). Show it with ' +
      "D.displayNum, or wrap the toFixed in parseFloat() or Number() when the value stays a number.",
    // bc46d16 removed the trailing zeros after the TPN team's feedback, and
    // displayNum lost its keepZeros option the same day, on Pp's ruling.
    source: "commit bc46d16; data.js displayNum",
    allow: [
      { file: "log.jsx", contains: "cp1x.toFixed(1)", why: "SVG path coordinates, never shown as text" },
    ],
    find: findRawToFixed,
  },
];

// toFixed(n) with n > 0 returns a string with exactly n decimals, so 18 prints
// "18.0". toFixed(0) has no decimal point and is left alone.
function findRawToFixed(text) {
  const hits = [];
  for (const m of text.matchAll(/\.toFixed\(\s*([^)]*?)\s*\)/g)) {
    if (m[1] === "0") continue;
    if (wrappedAsNumber(text, m.index)) continue;
    hits.push(m.index);
  }
  return hits;
}

// True when the call sits inside parseFloat(...) or Number(...), which turns
// "18.0" back into 18. Walks back over balanced parentheses to the first
// unclosed one; a template `${`, a JSX `{` or a statement end before it means
// the string is used as text.
function wrappedAsNumber(text, at) {
  let depth = 0;
  for (let i = at - 1; i >= 0; i--) {
    const c = text[i];
    if (c === ")") depth++;
    else if (c === "(") {
      if (depth === 0) return /(?:parseFloat|Number)\s*$/.test(text.slice(Math.max(0, i - 16), i));
      depth--;
    } else if (depth === 0 && (c === "{" || c === "}" || c === ";" || c === "`")) return false;
  }
  return false;
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

function isComment(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

// Hits in one file, as { rule, file, line, text }, with comment lines and
// allowed lines left out. `used` records which allow entries matched.
function check(rule, file, text, used) {
  const lines = text.split("\n");
  const out = [];
  const seen = new Set();
  for (const index of rule.find(text)) {
    const line = lineOf(text, index);
    const src = lines[line - 1];
    if (seen.has(line) || isComment(src)) continue;
    seen.add(line);
    const allowed = (rule.allow || []).find((a) => a.file === file && src.includes(a.contains));
    if (allowed) {
      used.add(allowed);
      continue;
    }
    out.push({ rule: rule.id, file, line, text: src.trim() });
  }
  return out;
}

function trackedSources() {
  const out = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" });
  return out.split("\0").filter((f) => f && SOURCE.test(f) && !SKIP.test(f));
}

function report(hit, why) {
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::error file=${hit.file},line=${hit.line}::[${hit.rule}] ${why}`);
  }
  console.log(`${hit.file}:${hit.line}  [${hit.rule}]  ${hit.text}`);
}

function runRepo() {
  const files = trackedSources();
  let failed = false;
  for (const rule of RULES) {
    const used = new Set();
    const hits = [];
    for (const file of files) {
      hits.push(...check(rule, file, readFileSync(path.join(ROOT, file), "utf8"), used));
    }
    for (const hit of hits) report(hit, rule.why);
    if (hits.length) {
      console.log(`\n[${rule.id}] ${rule.why}\n  source: ${rule.source}\n`);
      failed = true;
    }
    for (const a of rule.allow || []) {
      if (used.has(a)) continue;
      console.log(`[${rule.id}] stale allow entry: ${a.file} no longer has a line containing "${a.contains}". Remove it.`);
      failed = true;
    }
    if (!hits.length) console.log(`ok  ${rule.id}  (${files.length} files)`);
  }
  return failed ? 1 : 0;
}

function runSelfTest() {
  const cases = JSON.parse(readFileSync(path.join(ROOT, "test", "ci-bans-fixtures.json"), "utf8"));
  let failed = false;
  for (const rule of RULES) {
    const mine = cases.filter((c) => c.rule === rule.id);
    const kinds = new Set(mine.map((c) => c.expect));
    if (!kinds.has("fail") || !kinds.has("pass")) {
      console.log(`FAIL  ${rule.id}: needs at least one "fail" and one "pass" case in the fixtures`);
      failed = true;
    }
    for (const c of mine) {
      const hits = check(rule, c.file || "fixture.jsx", c.code, new Set());
      const got = hits.length ? "fail" : "pass";
      const ok = got === c.expect;
      if (!ok) failed = true;
      console.log(`${ok ? "ok  " : "FAIL"}  ${rule.id}: ${c.name} (expected ${c.expect}, got ${got})`);
    }
  }
  for (const c of cases) {
    if (!RULES.some((r) => r.id === c.rule)) {
      console.log(`FAIL  fixture "${c.name}" names an unknown rule "${c.rule}"`);
      failed = true;
    }
  }
  return failed ? 2 : 0;
}

process.exit(process.argv.includes("--self-test") ? runSelfTest() : runRepo());
