#!/usr/bin/env node
// tools/ci_bans.js — rules a PR may not break (NF-19, NF-08).
//
// Each rule is a correction Pp has had to make more than once. A line in
// AGENTS.md, a skill or a review comment can be forgotten by the next session;
// a failing build cannot. So when the same correction comes up a second time,
// it becomes a rule here instead of a third comment. The three log rules
// (NF-08: no patient identifier, raw sheet cell or secret in a log) came from
// Pp's apply list instead, and use the same fixtures and allow list. So did
// jsx-comment-text, from a developer comment #182 put on every ward device.
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
    allow: [],
    find: findRawToFixed,
  },
  {
    id: "log-identifier",
    why:
      "A log must not name a patient identifier (HN, AN, name, initials, date of birth, phone, " +
      "citizen ID). pseudonymizePatient() clears name, initials and dob from Patient_Registry, but " +
      "not from the Apps Script execution log, a ward PC's browser console or an Audit_Log row. " +
      "Log the sessionId, a count or the reason instead.",
    source: "NF-08 (Pp's apply list, 2026-10-27); REFERENCE.md § Thai PDPA compliance posture",
    allow: [],
    find: findLogIdentifiers,
  },
  {
    id: "log-raw-cell",
    why:
      "A backend log must not take a raw sheet cell (row[1], data[i][6]). gas-backend.gs reads every " +
      "column by index, so this check cannot tell a weight from a name there: in the vera-bench " +
      "phi-log case cur[1] is the name and cur[6] the date of birth. Log the sessionId or a count.",
    source: "NF-08; test/vera-bench/cases/phi-log.patch",
    allow: [],
    find: findLogRawCells,
  },
  {
    id: "log-secret",
    why:
      "A log must not receive a value read from PropertiesService, or anything named like a token, " +
      "key, secret or password. Every editor of the Apps Script project can read the execution log, " +
      "and Script Properties exist to keep SPREADSHEET_ID and CLIENT_ID out of source.",
    source: "NF-08 (Secrets leak through agents, 2026-10-17); gas-backend.gs § Config",
    allow: [],
    find: findLogSecrets,
  },
  {
    id: "jsx-comment-text",
    why:
      "Between two JSX children a // line is text, not a comment, and React prints it. #182 put " +
      'one in Step 2\'s feed picker and every ward device showed it under "Step 2 · Enteral feeding". ' +
      "Write {/* … */} there, or move the comment above the return.",
    source: "PR #182 (commit 97227e7); seen on dev local in the PR #175 release, 2026-10-28",
    // Its hits are comment lines, which every other rule leaves out.
    comments: true,
    allow: [],
    find: findJsxCommentText,
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

// ── NF-08: what goes into a log ─────────────────────────────────────────────
//
// A log call is Logger.log, console.log/info/warn/error/debug/trace, any other
// x.log() but Math.log (the backend's request timer is tm.log), an appendRow
// onto a log tab, and a function that hands one of its own parameters to any of
// those (logAudit → _logAuditStrict → Audit_Log is found that way, and so is a
// new wrapper). Only what is inside the call's parentheses counts, read as code:
// words inside a string are text, so "an HN" in a message passes, while a quoted
// object key or row["dob"] is a field and counts.

// Tabs whose rows are the clinical record, not a log, though the names end in _Log.
const RECORD_TABS = new Set(["Daily_Log", "Nursing_Log"]);
const isLogTab = (name) => /log|audit/i.test(name) && !RECORD_TABS.has(name);

// The NF-08 list (hn, an, name, dob, phone, citizen), plus initials, which
// pseudonymizePatient() clears with name and dob, and their usual spellings.
const ID_WORDS = new Set([
  "hn", "an", "mrn", "dob", "birthdate", "birthday", "dateofbirth", "phone", "phones", "telephone", "tel",
  "phonenumber", "citizen", "citizenid", "nationalid", "idcard", "passport", "initials", "surname",
  "firstname", "lastname", "fullname", "nickname", "patientname",
]);
// "name" alone or first (name, nameTh) is a person's name; after another word it
// is one only when that word is about a person: patientName yes, sheetName no.
const PERSON_WORDS = new Set([
  "first", "last", "middle", "full", "given", "family", "maiden", "nick", "display", "real", "legal",
  "thai", "eng", "english", "patient", "baby", "infant", "child", "mother", "father", "parent",
  "guardian", "contact", "person", "user", "staff", "doctor", "nurse", "sender", "owner", "actor",
]);
// `.name` on these is an error's or a tab's name, never a person's.
const NOT_A_PERSON = /^(e|e\d|ex|err|error|exception|\w*(Err|Error)|constructor|fn|func|sheet|sh|tab|file)$/;
const SECRET_WORDS = new Set([
  "token", "tokens", "secret", "secrets", "password", "passwords", "passwd", "pwd", "passcode",
  "passphrase", "credential", "credentials", "salt", "otp", "bearer", "apikey", "privatekey",
]);
// "key" is a secret only after one of these: apiKey, VISION_API_KEY, privateKey; cacheKey is not.
const KEY_WORDS = new Set([
  "api", "private", "secret", "access", "signing", "hmac", "auth", "client", "master", "encryption",
  "crypto", "license", "service",
]);
const CONSOLE_METHODS = new Set(["log", "info", "warn", "error", "debug", "trace", "dir", "table"]);
const PASS_THROUGH = new Set(["String", "stringify", "parse", "encodeURIComponent", "decodeURIComponent"]);
const COMPARISONS = new Set(["===", "!==", "==", "!=", "<", ">", "<=", ">=", "!"]);
const NOT_CALLEES = new Set(["return", "typeof", "if", "while", "for", "switch", "catch", "function", "in", "of", "case", "throw"]);

// patientHN → [patient, hn]; getOAuthToken → [get, o, auth, token]; VISION_API_KEY → [vision, api, key].
function words(name) {
  return (name.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/g) || []).map((w) => w.toLowerCase());
}

function isIdentifierName(name) {
  const w = words(name);
  if (w.some((x) => ID_WORDS.has(x))) return true;
  for (let k = 0; k < w.length; k++) {
    if (w[k] !== "name" && w[k] !== "names") continue;
    if (k === 0 || PERSON_WORDS.has(w[k - 1])) return true;
  }
  if (w.includes("birth") && (w.includes("date") || w.includes("day"))) return true;
  if (w.includes("national") && w.includes("id")) return true;
  if (w.includes("id") && w.includes("card")) return true;
  const number = w.includes("number") || w.includes("no") || w.includes("num");
  return number && (w.includes("admission") || w.includes("hospital"));
}

function isSecretName(name) {
  const w = words(name);
  if (w.some((x) => SECRET_WORDS.has(x))) return true;
  return w.some((x, k) => (x === "key" || x === "keys") && k > 0 && KEY_WORDS.has(w[k - 1]));
}

// A small JavaScript tokenizer: identifiers, strings (a template literal's text
// is a string and each ${...} inside it is code), numbers, regexes and
// punctuation, with comments dropped. `nl` marks a token that starts a line.
// A quote in JSX text opens a "string" that stops at the end of its line.
const OPS = [
  ">>>=", "===", "!==", "...", "**=", "<<=", ">>=", ">>>", "=>", "==", "!=", "<=", ">=", "&&", "||",
  "??", "?.", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "**", "<<", ">>",
];
// Not "}": after it, JSX text such as {used}/{capacity} is far more common here than a regex.
const REGEX_AFTER = new Set([
  "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", ";", "+", "-", "*", "%", "<", ">", "~", "^",
  "&&", "||", "??", "=>", "==", "===", "!=", "!==", "<=", ">=", "+=", "-=", "*=", "%=", "return",
  "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "yield", "await",
]);
const IDENT = /[A-Za-z_$][\w$]*/y;
const NUMBER = /\.?\d[\w.]*/y;

function tokenize(text) {
  const toks = [];
  const templateDepth = []; // brace depth at which each open ${ closes
  const n = text.length;
  let i = 0, depth = 0, nl = true;
  const add = (t, v, at) => { toks.push({ t, v, at, nl }); nl = false; };
  const template = () => { // i is just past a backtick, or past the } that closed a ${
    const start = i;
    while (i < n) {
      const c = text[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "`") { add("str", text.slice(start, i), start); i++; return; }
      if (c === "$" && text[i + 1] === "{") {
        add("str", text.slice(start, i), start);
        add("p", "{", i);
        i += 2;
        templateDepth.push(depth++);
        return;
      }
      if (c === "\n") nl = true;
      i++;
    }
    add("str", text.slice(start), start);
  };
  while (i < n) {
    const c = text[i];
    if (c === "\n") { nl = true; i++; continue; }
    if (c === " " || c === "\t" || c === "\r" || c === "\f" || c === "\v" || c === " " || c === "﻿") { i++; continue; }
    if (c === "/" && text[i + 1] === "/") { const j = text.indexOf("\n", i); i = j < 0 ? n : j; continue; }
    if (c === "/" && text[i + 1] === "*") {
      const j = text.indexOf("*/", i + 2);
      if (text.slice(i, j < 0 ? n : j).includes("\n")) nl = true;
      i = j < 0 ? n : j + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const start = i++;
      let s = "";
      while (i < n && text[i] !== c && text[i] !== "\n") {
        if (text[i] === "\\") { s += text[i + 1] || ""; i += 2; } else s += text[i++];
      }
      if (text[i] === c) i++;
      add("str", s, start);
      continue;
    }
    if (c === "`") { i++; template(); continue; }
    IDENT.lastIndex = i;
    let m = IDENT.exec(text);
    if (m) { add("id", m[0], i); i += m[0].length; continue; }
    NUMBER.lastIndex = i;
    m = /[\d.]/.test(c) ? NUMBER.exec(text) : null;
    if (m) { add("num", m[0], i); i += m[0].length; continue; }
    // A regex can start where a value can, but not as JSX's </span> or <br/>.
    if (c === "/" && text[i - 1] !== "<" && text[i + 1] !== ">") {
      const prev = toks[toks.length - 1];
      if (!prev || (prev.t !== "str" && prev.t !== "num" && REGEX_AFTER.has(prev.v))) {
        let j = i + 1, inClass = false, closed = false;
        while (j < n && text[j] !== "\n") {
          const d = text[j];
          if (d === "\\") { j += 2; continue; }
          if (d === "[") inClass = true;
          else if (d === "]") inClass = false;
          else if (d === "/" && !inClass) { closed = true; break; }
          j++;
        }
        if (closed) {
          j++;
          while (j < n && /[a-z]/i.test(text[j])) j++;
          add("re", text.slice(i, j), i);
          i = j;
          continue;
        }
      }
    }
    const op = OPS.find((o) => text.startsWith(o, i));
    if (op) { add("p", op, i); i += op.length; continue; }
    if (c === "}" && templateDepth.length && depth - 1 === templateDepth[templateDepth.length - 1]) {
      templateDepth.pop();
      depth--;
      add("p", "}", i);
      i++;
      template();
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth = Math.max(0, depth - 1);
    if ("()[]{};,.:?=+-*/%<>!~^&|@#".includes(c)) add("p", c, i);
    i++; // anything else (Thai or other text in JSX) carries no code
  }
  return toks;
}

// match[k] is the index of the bracket that closes (or opens) toks[k].
function matchBrackets(toks) {
  const match = new Array(toks.length);
  const stack = [];
  const pair = { ")": "(", "]": "[", "}": "{" };
  toks.forEach((tok, k) => {
    if (tok.t !== "p") return;
    if (tok.v === "(" || tok.v === "[" || tok.v === "{") stack.push(k);
    else if (pair[tok.v]) {
      let s = stack.length - 1;
      while (s >= 0 && toks[stack[s]].v !== pair[tok.v]) s--;
      if (s < 0) return;
      match[k] = stack[s];
      match[stack[s]] = k;
      stack.length = s;
    }
  });
  return match;
}

// block[k]: the outermost { around toks[k], or -1 at the top of the file. A
// variable read from PropertiesService inside a function stays tainted only
// within that outermost block.
function topBlocks(toks) {
  const block = new Array(toks.length);
  let depth = 0, cur = -1;
  toks.forEach((tok, k) => {
    const v = tok.t === "p" ? tok.v : "";
    if (v === "{") { if (depth++ === 0) cur = k; block[k] = cur; return; }
    if (v === "}") { block[k] = cur; depth = Math.max(0, depth - 1); if (depth === 0) cur = -1; return; }
    block[k] = depth === 0 ? -1 : cur;
  });
  return block;
}

const CONTINUES_AFTER = new Set([
  "=", "+", "-", "*", "/", "%", "?", ":", "&&", "||", "??", "(", "[", "{", ",", ".", "?.", "!",
  "==", "===", "!=", "!==", "<", ">", "<=", ">=", "=>", "+=", "-=",
]);
const CONTINUES_WITH = new Set([
  ".", "?.", "?", ":", "+", "-", "*", "/", "&&", "||", "??", "==", "===", "!=", "!==", "<", ">",
  "<=", ">=", "=>",
]);

// Where an expression starting at toks[start] ends: a ; or , or an unmatched
// closer at its own depth, or a new line that does not continue it.
function exprEnd(toks, start) {
  let depth = 0;
  for (let j = start; j < toks.length; j++) {
    const v = toks[j].t === "p" ? toks[j].v : null;
    if (v === "(" || v === "[" || v === "{") depth++;
    else if (v === ")" || v === "]" || v === "}") { if (depth-- === 0) return j; }
    else if (depth === 0 && (v === ";" || v === ",")) return j;
    else if (depth === 0 && j > start && toks[j].nl) {
      const prev = toks[j - 1];
      if (!(prev.t === "p" && CONTINUES_AFTER.has(prev.v)) && !(v && CONTINUES_WITH.has(v))) return j;
    }
  }
  return toks.length;
}

const analyses = new Map();

function analyze(text) {
  if (analyses.has(text)) return analyses.get(text);
  const toks = tokenize(text);
  const match = matchBrackets(toks);
  const block = topBlocks(toks);
  const at = (k) => toks[k] || { t: "", v: "" };

  // function NAME(params) { body }
  const fns = [];
  toks.forEach((tok, k) => {
    if (tok.v !== "function" || at(k + 1).t !== "id" || at(k + 2).v !== "(") return;
    const close = match[k + 2];
    if (close == null || at(close + 1).v !== "{" || match[close + 1] == null) return;
    // Each parameter's name, by position; a default value's names are not parameters.
    const params = [];
    for (let j = k + 3; j < close; j++) {
      if (toks[j].t === "id" && ["(", ",", "..."].includes(toks[j - 1].v)) params.push(toks[j].v);
    }
    fns.push({ name: at(k + 1).v, params, open: close + 1, close: match[close + 1] });
  });

  // getSheetByName("Audit_Log") / insertSheet("Audit_Log") at toks[k]
  const opensLogTab = (k) =>
    (at(k).v === "getSheetByName" || at(k).v === "insertSheet") && at(k + 1).v === "(" &&
    at(k + 2).t === "str" && isLogTab(at(k + 2).v);
  // A function that returns a log tab (getSheetAudit).
  const accessors = new Set();
  for (const fn of fns) {
    let opens = false, returns = false;
    for (let k = fn.open; k < fn.close; k++) {
      if (opensLogTab(k)) opens = true;
      if (at(k).t === "id" && at(k).v === "return") returns = true;
    }
    if (opens && returns) accessors.add(fn.name);
  }
  const rangeOpensLogTab = (from, to) => {
    for (let k = from; k < to; k++) {
      if (opensLogTab(k) || (accessors.has(at(k).v) && at(k + 1).v === "(")) return true;
    }
    return false;
  };
  // The receiver of .appendRow at toks[k]: a call that opens a log tab, or a
  // variable whose last assignment in the same function did.
  const appendsToLogTab = (k) => {
    const r = k - 2;
    if (at(r).v === ")" && match[r] != null) {
      const open = match[r];
      return opensLogTab(open - 1) || (accessors.has(at(open - 1).v) && at(open - 1).t === "id");
    }
    if (at(r).t !== "id") return false;
    for (let j = r - 1; j >= 0 && block[j] === block[r]; j--) {
      if (toks[j].t === "id" && toks[j].v === at(r).v && at(j + 1).v === "=" && at(j - 1).v !== ".") {
        return rangeOpensLogTab(j + 2, exprEnd(toks, j + 2));
      }
    }
    return false;
  };

  // The arguments of the call whose ( is toks[open], as [from, to) ranges.
  const argRanges = (open) => {
    const ranges = [];
    let from = open + 1;
    for (let j = open + 1; j < match[open]; j++) {
      if (toks[j].t !== "p") continue; // a string "," is not a separator
      if ("([{".includes(toks[j].v) && match[j] != null) { j = match[j]; continue; }
      if (toks[j].v === ",") { ranges.push([from, j]); from = j + 1; }
    }
    if (from < match[open]) ranges.push([from, match[open]]);
    return ranges;
  };

  // Every log call, as the token ranges that reach the log: all of a
  // Logger.log's arguments, but only those of a wrapper's arguments that it
  // hands on. wrappers maps a function to those argument positions, and grows
  // until nothing new is found: _logAuditStrict first, then logAudit.
  const wrappers = new Map();
  const findSinks = () => {
    const sinks = [];
    toks.forEach((tok, k) => {
      if (tok.t !== "id" || at(k + 1).v !== "(" || match[k + 1] == null) return;
      const prev = at(k - 1), before = at(k - 2);
      const all = [[k + 2, match[k + 1]]];
      let ranges = null;
      if (prev.v === "." || prev.v === "?.") {
        if (tok.v === "log") ranges = before.v !== "Math" ? all : null;
        else if (CONSOLE_METHODS.has(tok.v)) ranges = before.v === "console" ? all : null;
        else if (tok.v === "appendRow") ranges = appendsToLogTab(k) ? all : null;
      }
      if (!ranges && prev.v !== "function" && wrappers.has(tok.v)) {
        const flows = wrappers.get(tok.v);
        ranges = argRanges(k + 1).filter((r, n) => flows.has(n));
      }
      if (ranges && ranges.length) sinks.push({ open: k + 1, close: match[k + 1], ranges });
    });
    return sinks;
  };
  let sinks = findSinks();
  for (let grew = true; grew; ) {
    grew = false;
    for (const fn of fns) {
      const flows = new Set(wrappers.get(fn.name) || []);
      const known = flows.size;
      for (const s of sinks) {
        if (s.open < fn.open || s.close > fn.close) continue;
        for (const [from, to] of s.ranges) {
          for (let j = from; j < to; j++) {
            const n = fn.params.indexOf(toks[j].v);
            if (toks[j].t === "id" && n >= 0 && at(j - 1).v !== "." && at(j - 1).v !== "?." &&
                ![".", "?.", "["].includes(at(j + 1).v)) flows.add(n);
          }
        }
      }
      if (flows.size > known) { wrappers.set(fn.name, flows); grew = true; }
    }
    if (grew) sinks = findSinks();
  }

  // Names that hold a value read from PropertiesService: variables (within
  // their outermost block) and functions that return one, to a fixed point.
  // The value travels through String(), JSON and member calls (val.trim()), but
  // not into another call's result: openById(SPREADSHEET_ID_()) is a
  // Spreadsheet, parseInt(counter) a count, and v === "true" a yes or no.
  const taintedVars = new Map(); // name -> Set of block ids (-1: the whole file)
  const taintedFns = new Set();
  const tainted = (j) => {
    const t = toks[j];
    if (t.t !== "id" || at(j - 1).v === "." || at(j - 1).v === "?.") return false;
    if (t.v === "PropertiesService") return true;
    if (taintedFns.has(t.v) && at(j + 1).v === "(") return true;
    const scopes = taintedVars.get(t.v);
    return !!scopes && (scopes.has(-1) || scopes.has(block[j]));
  };
  const carries = (from, to) => {
    let depth = 0, ternary = false, boolean = false;
    for (let j = from; j < to; j++) {
      const v = toks[j].t === "p" ? toks[j].v : "";
      if (v === "(" || v === "[" || v === "{") depth++;
      else if (v === ")" || v === "]" || v === "}") depth--;
      else if (depth === 0 && v === "?") ternary = true;
      else if (depth === 0 && (COMPARISONS.has(v) || toks[j].v === "typeof" || toks[j].v === "instanceof")) boolean = true;
    }
    if (boolean && !ternary) return false;
    for (let j = from; j < to; j++) {
      const callee = at(j - 1);
      const isCall = toks[j].v === "(" && j > from && match[j] != null &&
        ((callee.t === "id" && !NOT_CALLEES.has(callee.v)) || callee.v === ")" || callee.v === "]");
      if (isCall && !PASS_THROUGH.has(callee.v) && !tainted(j - 1)) { j = match[j]; continue; }
      if (tainted(j)) return true;
    }
    return false;
  };
  const DECL = new Set(["var", "let", "const"]);
  for (let changed = true, round = 0; changed && round < 20; round++) {
    changed = false;
    for (let j = 0; j < toks.length; j++) {
      const t = toks[j];
      if (t.t !== "id") continue;
      let names = null, rhs = -1;
      if (DECL.has(t.v)) {
        const next = at(j + 1);
        if (next.t === "id" && at(j + 2).v === "=") { names = [next.v]; rhs = j + 3; }
        else if ((next.v === "{" || next.v === "[") && match[j + 1] != null && at(match[j + 1] + 1).v === "=") {
          names = toks.slice(j + 2, match[j + 1]).filter((x) => x.t === "id").map((x) => x.v);
          rhs = match[j + 1] + 2;
        }
      } else if (at(j + 1).v === "=" && at(j - 1).v !== "." && !DECL.has(at(j - 1).v)) {
        names = [t.v];
        rhs = j + 2;
      }
      if (!names || !carries(rhs, exprEnd(toks, rhs))) continue;
      for (const name of names) {
        const scopes = taintedVars.get(name) || new Set();
        if (!scopes.has(block[j])) { scopes.add(block[j]); taintedVars.set(name, scopes); changed = true; }
      }
    }
    for (const fn of fns) {
      if (taintedFns.has(fn.name)) continue;
      for (let r = fn.open + 1; r < fn.close; r++) {
        if (toks[r].t === "id" && toks[r].v === "return" && carries(r + 1, exprEnd(toks, r + 1))) {
          taintedFns.add(fn.name);
          changed = true;
          break;
        }
      }
    }
  }

  // A string that names a field: a quoted key ({ "dob": x }), row["dob"], indexOf("dob").
  const isFieldString = (j) => {
    const prev = at(j - 1), next = at(j + 1);
    if ((prev.v === "{" || prev.v === ",") && next.v === ":") return true;
    if (prev.v === "[" && next.v === "]") {
      const base = at(j - 2); // row["dob"], not the array literal ["ts", "dob"]
      return base.t === "id" || base.v === ")" || base.v === "]";
    }
    return prev.v === "(" && next.v === ")" && at(j - 2).v === "indexOf";
  };

  const result = { toks, sinks, tainted, isFieldString, at };
  analyses.set(text, result);
  return result;
}

// Each token that reaches a log, once.
function* logArguments(a) {
  const seen = new Set();
  for (const s of a.sinks) {
    for (const [from, to] of s.ranges) {
      for (let j = from; j < to; j++) {
        if (seen.has(j)) continue;
        seen.add(j);
        yield j;
      }
    }
  }
}

function findLogIdentifiers(text) {
  const a = analyze(text);
  const hits = [];
  for (const j of logArguments(a)) {
    const tok = a.toks[j];
    if (tok.t === "id") {
      if (!isIdentifierName(tok.v)) continue;
      const dotted = a.at(j - 1).v === "." || a.at(j - 1).v === "?.";
      if (dotted && tok.v === "name" && NOT_A_PERSON.test(a.at(j - 2).v)) continue;
      hits.push(tok.at);
    } else if (tok.t === "str" && a.isFieldString(j) && isIdentifierName(tok.v)) {
      hits.push(tok.at);
    }
  }
  return hits;
}

// row[1] or data[i][6] inside a log call in the backend.
function findLogRawCells(text, file = "") {
  if (!file.endsWith(".gs")) return [];
  const a = analyze(text);
  const hits = [];
  for (const j of logArguments(a)) {
    const tok = a.toks[j];
    if (tok.t !== "p" || tok.v !== "[" || a.at(j + 1).t !== "num" || a.at(j + 2).v !== "]") continue;
    const base = a.at(j - 1);
    if (base.t === "id" || base.v === "]") hits.push(tok.at);
  }
  return hits;
}

function findLogSecrets(text) {
  const a = analyze(text);
  const hits = [];
  for (const j of logArguments(a)) {
    const tok = a.toks[j];
    if (tok.t === "id" && (a.tainted(j) || isSecretName(tok.v))) hits.push(tok.at);
    else if (tok.t === "str" && a.isFieldString(j) && isSecretName(tok.v)) hits.push(tok.at);
  }
  return hits;
}

// ── A // line inside JSX children ───────────────────────────────────────────
//
// Without a JSX parser (this file needs no npm install) the rule reads the lines
// around a run of // lines. The line before ends a tag (`>`, not an arrow's `=>`)
// or an expression container (`}`); the line after starts an element (`<`) or,
// after a tag, an expression container (`{`). In plain JS no such pair can
// stand side by side, so the run sits between two children. A run after `(` or
// before `:` is JS and passes: calculator.jsx's prefill notice has one between
// a ternary's two fragments. A run before a text child is missed. Over all 294
// first-parent trees of main (2026-10-28) it finds only #182's line.
function findJsxCommentText(text, file = "") {
  if (!file.endsWith(".jsx")) return [];
  const lines = text.split("\n");
  const offsets = [];
  for (let i = 0, at = 0; i < lines.length; at += lines[i].length + 1, i++) offsets.push(at);
  const code = (i) => {
    const t = lines[i].trim();
    return t !== "" && !t.startsWith("//");
  };
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith("//")) continue;
    let before = i - 1;
    while (before >= 0 && lines[before].trim() === "") before--;
    if (before < 0 || !code(before)) continue; // a run is reported once, at its first line
    if (isComment(lines[before])) continue; // after a /* */ block, not after a tag
    let after = i + 1;
    while (after < lines.length && !code(after)) after++;
    if (after >= lines.length) continue;
    const prev = lines[before].trim();
    const next = lines[after].trim();
    const afterTag = prev.endsWith(">") && !prev.endsWith("=>");
    if ((afterTag && /^[<{]/.test(next)) || (prev.endsWith("}") && next.startsWith("<"))) {
      hits.push(offsets[i] + lines[i].indexOf("//"));
    }
  }
  return hits;
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

function isComment(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

// Hits in one file, as { rule, file, line, text }, with comment lines (unless
// the rule is about comments) and allowed lines left out. `used` records which
// allow entries matched.
function check(rule, file, text, used) {
  const lines = text.split("\n");
  const out = [];
  const seen = new Set();
  for (const index of rule.find(text, file)) {
    const line = lineOf(text, index);
    const src = lines[line - 1];
    if (seen.has(line) || (!rule.comments && isComment(src))) continue;
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
