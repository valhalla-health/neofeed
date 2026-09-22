#!/usr/bin/env node
// tools/verify-release.mjs — proves what a NeoFeed release actually serves.
//
// Neither host builds anything: tools/build.mjs runs on a developer machine and
// in CI, and its output is committed. So after a `main` → `release` merge, every
// file the app needs must be byte-identical, on BOTH hosts, to git at the
// release commit. Per host, this checks:
//   - the shell (`/` is index.html)
//   - every same-origin script and link the shell names, and every ?v= token
//     against the first 10 hex of its file's sha256. vendor/ carries its React
//     version in the file name instead of a token, so it is checked by bytes.
//   - manifest.json, moved.html and every file under icons/ at that commit
//   - Cloudflare only: the CSP's script-src allows no 'unsafe-inline' and no
//     'unsafe-eval'. style-src keeps 'unsafe-inline' on purpose, for the
//     shell's own <style> block, so the header as a whole is not the test.
//
//   node tools/verify-release.mjs             # against the tip of `release`
//   node tools/verify-release.mjs <commit>    # against any commit or branch
//
// Exit 0 only if every check passes. Needs Node 18+ and the network, and no
// npm install. Set GH_TOKEN to lift GitHub's anonymous API rate limit (two
// calls a run). See REFERENCE.md § Frontend, "Proving what a release serves".
//
// Trust a pass only after you have seen it fail. Pointed at a commit the hosts
// are NOT serving, such as `main` while it is ahead of `release`, it must fail
// on exactly the served files that differ, and on nothing else.

import { createHash, randomBytes } from "node:crypto";

const REPO = "valhalla-health/neofeed";
const HOSTS = [
  { base: "https://neofeed.valhalla-health.workers.dev/", csp: true },
  // Cannot set response headers, so no CSP here (REFERENCE.md § Frontend, `_headers`).
  { base: "https://valhalla-health.github.io/neofeed/", csp: false },
];
const ALWAYS = ["manifest.json", "moved.html"]; // plus every file under icons/

let failures = 0;
const pass = (m) => console.log(`  PASS ${m}`);
const fail = (m) => { failures++; console.log(`  FAIL ${m}`); };
const note = (m) => console.log(`  note ${m}`);
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A dropped connection or a 5xx is retried twice; a 4xx and a byte mismatch
// never are. So a network blip cannot read as a failed release, and a real
// failure cannot be retried away. (The first run hit one "fetch failed" on
// GitHub Pages that did not recur in nine further requests.)
async function get(url, init = {}) {
  let why = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) { note(`retrying ${url} after: ${why}`); await sleep(1500 * (attempt - 1)); }
    let res, buf;
    try {
      // follow: Cloudflare answers /x.html with a 307 to /x (its html_handling).
      res = await fetch(url, { ...init, redirect: "follow", signal: AbortSignal.timeout(30_000) });
      buf = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      why = e.cause ? `${e.message}: ${e.cause.code || e.cause.message}` : e.message;
      continue;
    }
    if (res.status >= 500) { why = `HTTP ${res.status}`; continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { buf, headers: res.headers };
  }
  throw new Error(`${why} (3 tries)`);
}

async function github(path) {
  const headers = { accept: "application/vnd.github+json" };
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    return JSON.parse((await get(`https://api.github.com/repos/${REPO}/${path}`, { headers })).buf);
  } catch (e) {
    throw new Error(`GitHub API ${path}: ${e.message}`);
  }
}

// A random query on every request, so no CDN copy can answer for the host.
// Static hosts ignore it, and an existing ?v= is kept.
function fresh(url) {
  const u = new URL(url);
  u.searchParams.append("cb", randomBytes(6).toString("hex"));
  return u.href;
}

async function main() {
  const ref = process.argv[2] || "release";
  const sha = (await github(`commits/${encodeURIComponent(ref)}`)).sha;
  const releaseTip = ref === "release" ? sha : (await github("commits/release")).sha;
  console.log(`Checking both hosts against ${sha}${ref === sha ? "" : ` (${ref})`}`);
  if (sha !== releaseTip) {
    note(`not the tip of release (${releaseTip.slice(0, 7)}), which is what the hosts serve: expect failures`);
  }

  const tree = await github(`git/trees/${sha}?recursive=1`);
  if (tree.truncated) note("git tree listing truncated: icons/ may be incomplete");
  const iconPaths = tree.tree
    .filter((e) => e.type === "blob" && e.path.startsWith("icons/"))
    .map((e) => e.path);

  const gitCache = new Map();
  const gitBytes = (path) => {
    if (!gitCache.has(path)) {
      const enc = path.split("/").map(encodeURIComponent).join("/");
      gitCache.set(path, get(`https://raw.githubusercontent.com/${REPO}/${sha}/${enc}`).then((r) => r.buf));
    }
    return gitCache.get(path);
  };

  async function compare(path, served) {
    let git;
    try { git = await gitBytes(path); }
    catch (e) { fail(`${path}: not readable from git at ${sha.slice(0, 7)} (${e.message})`); return; }
    if (served.equals(git)) pass(`${path} == git`);
    else fail(`${path} differs from git (served ${served.length} B, git ${git.length} B)`);
  }

  for (const { base, csp } of HOSTS) {
    console.log(`=== ${base}`);
    const basePath = new URL(base).pathname;
    let shell;
    try { shell = await get(fresh(base)); }
    catch (e) { fail(`shell: ${e.message}`); continue; }
    await compare("index.html", shell.buf);

    const seen = new Set(["index.html"]);
    const html = shell.buf.toString("utf8");
    for (const [, attr, value] of html.matchAll(/\s(src|href)="([^"]+)"/g)) {
      const url = new URL(value, base);
      if (!/^https?:$/.test(url.protocol)) continue;
      if (url.origin !== new URL(base).origin) {
        if (attr === "src") note(`skip external script ${value}`);
        continue;
      }
      if (!url.pathname.startsWith(basePath)) { fail(`${value} points outside the app`); continue; }
      const path = decodeURIComponent(url.pathname.slice(basePath.length));
      if (path === "" || seen.has(path)) continue;
      seen.add(path);

      let served;
      try { served = (await get(fresh(url.href))).buf; }
      catch (e) { fail(`${path}: ${e.message} from host`); continue; }
      await compare(path, served);

      const token = url.searchParams.get("v");
      if (!token) continue;
      const got = sha256(served).slice(0, 10);
      if (got === token) pass(`${path} ?v=${token} matches its hash`);
      else if (path.startsWith("vendor/")) note(`${path} ?v=${token}, hash ${got}: vendor/ is checked by name`);
      else fail(`${path} ?v=${token} but the served file hashes to ${got}`);
    }

    for (const path of [...ALWAYS, ...iconPaths]) {
      if (seen.has(path)) continue;
      seen.add(path);
      let served;
      try { served = (await get(fresh(new URL(path, base).href))).buf; }
      catch (e) { fail(`${path}: ${e.message} from host`); continue; }
      await compare(path, served);
    }

    if (!csp) { note("no CSP check: this host cannot set response headers"); continue; }
    const header = shell.headers.get("content-security-policy");
    if (!header) { fail("no Content-Security-Policy header"); continue; }
    const directives = header.split(";").map((d) => d.trim()).filter(Boolean);
    const named = (n) => directives.find((d) => d.split(/\s+/)[0].toLowerCase() === n);
    const scriptSrc = named("script-src") || named("default-src");
    if (!scriptSrc) fail("CSP has neither script-src nor default-src");
    else if (/'unsafe-(inline|eval)'/i.test(scriptSrc)) fail(`CSP allows inline script or eval: ${scriptSrc}`);
    else pass(`CSP ${scriptSrc}, no 'unsafe-inline' or 'unsafe-eval'`);
  }

  console.log(`=== ${failures} failure(s)`);
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error(`verify-release: ${e.message}`);
  process.exitCode = 2;
});
