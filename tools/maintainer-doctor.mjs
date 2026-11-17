#!/usr/bin/env node
// tools/maintainer-doctor.mjs — is this computer ready to maintain NeoFeed?
//
// For a new maintainer, after docs/MAINTAINER_SETUP.md (Pp, 2026-11-17: a setup a second admin
// can run on their own computer). It checks every tool and sign-in that guide asks for and prints
// one line per item, with the fix for anything missing.
//
//   node tools/maintainer-doctor.mjs              # the checks, read-only
//   node tools/maintainer-doctor.mjs --offline    # skip the two GitHub reads over the network
//   node tools/maintainer-doctor.mjs --checks     # then the pre-PR checks too (see below)
//   node tools/maintainer-doctor.mjs --json       # the results as JSON, nothing else printed
//
// By default it only reads. Every command it starts is in PROBES below: a version, a status, a
// `git config --get`, or one GitHub read of this repo's permissions. It installs nothing, signs in
// to nothing, writes no file and never opens a credential: for clasp it asks only whether
// ~/.clasprc.json exists. --offline cannot confirm the GitHub sign-in, so it always ends not ready.
//
// --checks is not read-only. It runs `node tools/run_checks.js --level ci --phase pre`, the command
// AGENTS.md asks for before any PR, whose build-fresh step runs `npm ci --prefix tools` (a download)
// and `node tools/build.mjs` (it rewrites compiled/ and the shells), then fails on any change in
// `git status`, an untracked file included. Exit 0 when every required item passes, 1 when one
// does not. test/verify-maintainer-doctor.cjs pins the checks and the read-only list.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Every command this tool may start. One string each, so Windows finds .cmd shims (gh, clasp)
// through the shell; nothing in them comes from the user.
export const PROBES = Object.freeze({
  git: "git --version",
  hooks: "git config --get core.hooksPath",
  remote: "git config --get remote.origin.url",
  gh: "gh --version",
  ghAuth: "gh auth status",
  ghRepo: "gh api repos/valhalla-health/neofeed --jq .permissions",
  clasp: "clasp --version",
});
export const NETWORK_PROBES = Object.freeze(["ghAuth", "ghRepo"]);

export const CI_NODE_MAJOR = 22;

export function nodeVersionCheck(version) {
  const major = Number(String(version).replace(/^v/, "").split(".")[0]);
  if (!Number.isFinite(major) || major < CI_NODE_MAJOR) {
    return { ok: false, detail: `Node ${version}`, fix: `ลง Node ${CI_NODE_MAJOR} หรือใหม่กว่า (CI ใช้ ${CI_NODE_MAJOR})` };
  }
  const note = major === CI_NODE_MAJOR ? "ตรงกับ CI" : `CI ใช้ ${CI_NODE_MAJOR} ถ้า harness ให้ผลต่างจาก CI ให้ลอง ${CI_NODE_MAJOR}`;
  return { ok: true, detail: `Node ${version} (${note})` };
}

export function remoteCheck(url) {
  const u = String(url || "").trim();
  if (/^(https:\/\/github\.com\/|git@github\.com:)valhalla-health\/neofeed(\.git)?\/?$/i.test(u)) {
    return { ok: true, detail: u };
  }
  return { ok: false, detail: u || "ไม่มี remote origin", fix: "clone ใหม่ด้วย gh repo clone valhalla-health/neofeed" };
}

export function hooksCheck(value) {
  const v = String(value || "").trim();
  if (v === ".githooks") return { ok: true, detail: "core.hooksPath = .githooks" };
  return { ok: false, detail: `core.hooksPath = ${v || "(ไม่ได้ตั้ง)"}`, fix: "node tools/run_checks.js --install-hooks" };
}

export function ghPermissionCheck(jsonText) {
  let p = null;
  try { p = JSON.parse(String(jsonText)); } catch (e) { p = null; }
  if (!p || typeof p !== "object") {
    return { ok: false, detail: "อ่านสิทธิ์ของ repo ไม่ได้", fix: "gh auth login แล้วขอให้ Pp เพิ่มสิทธิ์ใน repo" };
  }
  const role = p.admin ? "admin" : p.maintain ? "maintain" : p.push ? "write" : p.triage ? "triage" : p.pull ? "read" : "none";
  if (p.push === true) return { ok: true, detail: `role ${role}` };
  return { ok: false, detail: `role ${role}`, fix: "ขอให้ Pp เพิ่มเป็น maintain ใน valhalla-health/neofeed" };
}

export function claspVersionCheck(text) {
  const m = String(text || "").match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return { ok: false, detail: "clasp ไม่ตอบ", fix: "npm install -g @google/clasp@3" };
  if (Number(m[1]) !== 3) {
    return { ok: false, detail: `clasp ${m[0]}`, fix: "ขั้นตอนใน REFERENCE.md เขียนสำหรับ clasp 3: npm install -g @google/clasp@3" };
  }
  return { ok: true, detail: `clasp ${m[0]}` };
}

// Exit code from the results: a required item that failed or was skipped fails the run.
export function summarize(results) {
  const failed = results.filter(r => r.required && r.ok !== true);
  return { exitCode: failed.length ? 1 : 0, failed: failed.map(r => r.id) };
}

function run(cmd) {
  const r = spawnSync(cmd, { cwd: ROOT, encoding: "utf8", shell: true, timeout: 60000 });
  return { ran: !r.error && r.status === 0, out: `${r.stdout || ""}${r.stderr || ""}`.trim() };
}

function moduleResolves(name, from) {
  try { createRequire(path.join(from, "noop.js")).resolve(name); return true; } catch (e) { return false; }
}

export function collect({ offline = false } = {}) {
  const results = [];
  const add = (id, label, required, check) => results.push({ id, label, required, ...check });
  const probe = id => run(PROBES[id]);

  add("node", "Node.js", true, nodeVersionCheck(process.versions.node));

  const git = probe("git");
  add("git", "git", true, git.ran
    ? { ok: true, detail: git.out.split("\n")[0] }
    : { ok: false, detail: "ไม่เจอ git", fix: "ลง git (Windows: winget install --id Git.Git -e, Mac: brew install git)" });
  if (git.ran) {
    add("remote", "repo นี้คือ valhalla-health/neofeed", true, remoteCheck(probe("remote").out));
    add("hooks", "git hooks ของ repo", true, hooksCheck(probe("hooks").out));
  }

  const build = existsSync(path.join(ROOT, "tools", "node_modules", "esbuild", "package.json"));
  add("buildDeps", "เครื่องมือ build (tools/node_modules)", true, build
    ? { ok: true, detail: "มี esbuild ใน tools/node_modules" }
    : { ok: false, detail: "ยังไม่ได้ลง", fix: "npm ci --prefix tools" });

  const testDeps = ["jsdom", "react", "react-dom", "@babel/core", "@babel/preset-react"].filter(n => !moduleResolves(n, ROOT));
  add("testDeps", "ชุดที่ harness ใช้ (jsdom และ React)", true, testDeps.length
    ? { ok: false, detail: `ยังไม่มี ${testDeps.join(", ")}`, fix: "npm install --no-save --no-package-lock react@18 react-dom@18 @babel/core@7 @babel/preset-react@7 jsdom@30 (AGENTS.md ให้รัน harness ก่อน PR)" }
    : { ok: true, detail: "ครบ" });
  add("playwright", "Playwright (ส่วน browser ของ harness)", false, moduleResolves("playwright", ROOT)
    ? { ok: true, detail: "มี" }
    : { ok: false, detail: "ไม่มี ส่วน browser จะขึ้น SKIP ในเครื่องนี้ ส่วน CI รันให้เอง", fix: "ใส่ playwright@1 ต่อท้ายคำสั่ง npm install ของชุด harness ในคำสั่งเดียวกัน แล้วรัน npx playwright install chromium" });

  const gh = probe("gh");
  add("gh", "GitHub CLI (gh)", true, gh.ran
    ? { ok: true, detail: gh.out.split("\n")[0] }
    : { ok: false, detail: "ไม่เจอ gh", fix: "ลง gh (Windows: winget install --id GitHub.cli -e, Mac: brew install gh)" });
  if (gh.ran && !offline) {
    const auth = probe("ghAuth");
    add("ghAuth", "gh sign in แล้ว", true, auth.ran
      ? { ok: true, detail: "sign in แล้ว" }
      : { ok: false, detail: "ยังไม่ได้ sign in", fix: "gh auth login" });
    if (auth.ran) add("ghRepo", "สิทธิ์เขียนใน repo", true, ghPermissionCheck(probe("ghRepo").out));
  } else if (gh.ran) {
    for (const id of NETWORK_PROBES) add(id, `${id} (ข้ามเพราะ --offline)`, true, { ok: null, detail: "ข้าม" });
  }

  const clasp = probe("clasp");
  add("clasp", "clasp", true, clasp.ran
    ? claspVersionCheck(clasp.out)
    : { ok: false, detail: "ไม่เจอ clasp", fix: "npm install -g @google/clasp@3" });
  const claspLogin = existsSync(path.join(os.homedir(), ".clasprc.json"));
  add("claspLogin", "clasp sign in แล้ว", true, claspLogin
    ? { ok: true, detail: "มี ~/.clasprc.json (ไม่ได้เปิดอ่าน)" }
    : { ok: false, detail: "ยังไม่ได้ sign in", fix: "เปิด Google Apps Script API ที่ script.google.com/home/usersettings แล้ว clasp login ด้วยบัญชี Google ของตัวเอง" });

  return results;
}

function print(results) {
  for (const r of results) {
    const mark = r.ok === true ? "ok  " : r.ok === null ? "skip" : r.required ? "FIX " : "opt ";
    console.log(`${mark}  ${r.label}: ${r.detail}`);
    if (r.ok === false && r.fix) console.log(`      แก้: ${r.fix}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const results = collect({ offline: args.includes("--offline") });
  if (!json) print(results);

  if (args.includes("--checks")) {
    if (!json) console.log("\nรันเช็กก่อน PR (npm ci และ build ด้วย): node tools/run_checks.js --level ci --phase pre");
    const r = spawnSync(process.execPath, [path.join(ROOT, "tools", "run_checks.js"), "--level", "ci", "--phase", "pre"],
      { cwd: ROOT, stdio: json ? "ignore" : "inherit" });
    results.push({ id: "preChecks", label: "เช็กก่อน PR", required: true, ok: r.status === 0, detail: r.status === 0 ? "ผ่าน" : `ไม่ผ่าน (exit ${r.status})` });
  }

  const { exitCode, failed } = summarize(results);
  if (json) console.log(JSON.stringify({ results, exitCode }, null, 2));
  else console.log(exitCode ? `\nยังไม่พร้อม: ${failed.join(", ")} ดู docs/MAINTAINER_SETUP.md` : "\nพร้อมแล้ว");
  process.exit(exitCode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
