#!/usr/bin/env node
// tools/dev-local.mjs — runs a NeoFeed tree on this machine against the REAL
// backend code, before a release (Pp, 2026-10-12: "ให้ dev local ก่อน deploy").
//
// Serves the files the hosts publish (index.html, boot.js, data.js, compiled/,
// vendor/, icons/, manifest.json, moved.html) from a temporary copy whose
// boot.js points at this server, and answers POST /gas with gas-backend.gs
// running in test/gas-vm-sandbox.cjs. The sandbox is seeded with made-up
// infants and two made-up accounts, so nothing reaches production and no real
// patient is on screen.
//
//   node tools/dev-local.mjs                      # this checkout, http://127.0.0.1:8155
//   node tools/dev-local.mjs --port 8156          # another port
//   node tools/dev-local.mjs --tree <dir>         # another tree, e.g. a release PR's head
//
// Open http://127.0.0.1:<port>, not localhost: the fetch is same-origin only
// there. Sign in with "เข้าด้วย email อื่น" and an account the server prints at
// start; the passwords are new every run. See REFERENCE.md § Frontend,
// "Dev local before every release".
//
// Seeded for today (ward time), so the release-day screens are all reachable:
//   NICU 1 AA  submitted under this tree's CONSTANTS_VERSION   → prints
//   NICU 2 BB  draft                                            → not on the print list
//   NICU 3 CC  submitted under an older CONSTANTS_VERSION       → held: saved again first
//   NICU 4 DD  nothing today                                    → Needs entry
//   SCN 1  SS  submitted                                        → prints
//   SCN 2  TT  nothing today                                    → Needs entry

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVED = ["index.html", "boot.js", "data.js", "manifest.json", "moved.html", "compiled", "vendor", "icons"];
const GAS_URL_LINE = /window\.NEOFEED_GAS_URL\s*=\s*"https:\/\/script\.google\.com\/macros\/s\/[^"]+";/;
// The pilot deployment (NF-05, boot.js § 3) is production too: blank it, so a
// local copy can never reach it even on a host named like the pilot.
const PILOT_URL_LINE = /window\.NEOFEED_PILOT_GAS_URL\s*=\s*"[^"]*";/;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon",
};
// A day's order whose saved figures reproduce on reload (test/verify-ward-print-1012.cjs).
const CALC = { curWtG: 900, fluidTargetPerKg: 150, otherIV_mL: 0, drug_mL: 0, ioInput: 130, ioOutput: 60, drainContent: 0,
  totalTPN_mL: 110, dexPct: 12.5, aaPerKg: 3, lipidPerKg: 3, naCl: 2, kCl: 1, caPerKg: 60, glycophosP: 1 };
const OLDER_CONSTANTS = "2000-01-01.1";

// The served copy, with boot.js pointed at `gasUrl`. Throws rather than serve a
// copy that could still reach production.
function servedCopy(tree, gasUrl) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neofeed-dev-"));
  for (const f of SERVED) {
    const src = path.join(tree, f);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(dir, f), { recursive: true });
  }
  const boot = path.join(dir, "boot.js");
  const src = fs.readFileSync(boot, "utf8");
  if (!GAS_URL_LINE.test(src)) throw new Error("boot.js: the NEOFEED_GAS_URL line was not found");
  const out = src.replace(GAS_URL_LINE, `window.NEOFEED_GAS_URL = "${gasUrl}";`)
    .replace(PILOT_URL_LINE, `window.NEOFEED_PILOT_GAS_URL = "";`);
  if (/script\.google\.com\/macros/.test(out)) throw new Error("boot.js still names the production backend");
  fs.writeFileSync(boot, out);
  return dir;
}

function seed(tree) {
  const require = createRequire(pathToFileURL(path.join(tree, "test", "x.cjs")));
  const SBX = require("./gas-vm-sandbox.cjs");
  const g = SBX.boot({ src: path.join(tree, "gas-backend.gs") });
  const constants = (fs.readFileSync(path.join(tree, "data.js"), "utf8").match(/CONSTANTS_VERSION\s*=\s*"([^"]+)"/) || [])[1];
  if (!constants) throw new Error("data.js: CONSTANTS_VERSION not found");

  const accounts = [
    { email: "doctor@dev.local", role: "doctor", name: "Dr Dev" },
    { email: "nurse@dev.local", role: "nurse", name: "Nurse Dev" },
  ].map(a => ({ ...a, password: randomBytes(9).toString("base64url") }));
  for (const a of accounts) g.addStaff(a.email, a.role, a.password, { name: a.name });

  for (const [sid, name, bed] of [["AA-1", "AA", "NICU 1"], ["BB-1", "BB", "NICU 2"], ["CC-1", "CC", "NICU 3"],
    ["DD-1", "DD", "NICU 4"], ["SS-1", "SS", "SCN 1"], ["TT-1", "TT", "SCN 2"]]) {
    g.sheet("Patient_Registry").data.push(g.patRow(sid, { 1: name, 2: name, 10: bed }));
  }
  const today = SBX.wardToday();
  // The calculator reads an order's version from calcInput (calculator.jsx
  // savedCalcVersionOf), as real saves stamp it; the sheet column is a copy.
  const order = (status, version) => ({
    2: 5, 3: 900, 13: "TPN central", 14: status, 15: "doctor@dev.local",
    24: JSON.stringify({ ...CALC, constantsVersion: version }), 26: today + "T02:00:00.000Z",
    27: "doctor@dev.local", 28: 130, 29: 60, 30: 0, 31: version,
  });
  const day = SBX.bkkMidnight(today);
  const log = g.sheet("Daily_Log").data;
  log.push(g.logRow("AA-1", day, order("submitted", constants)));
  log.push(g.logRow("BB-1", day, order("draft", constants)));
  log.push(g.logRow("CC-1", day, order("submitted", OLDER_CONSTANTS)));
  log.push(g.logRow("SS-1", day, order("submitted", constants)));
  return { g, accounts, constants, today };
}

// Start the server. `port` 0 picks a free one. Resolves to { url, accounts,
// constants, today, stop }.
export async function start({ tree = path.join(HERE, ".."), port = 8155, quiet = false } = {}) {
  tree = path.resolve(tree);
  const { g, accounts, constants, today } = seed(tree);
  let dir = null;
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url.split("?")[0] === "/gas") {
      let body = "";
      req.on("data", c => { body += c; });
      req.on("end", () => {
        let out;
        try { out = g.postText(body); } catch (e) { out = JSON.stringify({ status: "error", error: String(e) }); }
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(out);
      });
      return;
    }
    const rel = decodeURIComponent(req.url.split("?")[0]);
    const file = path.resolve(dir, "." + (rel === "/" ? "/index.html" : rel));
    // path.resolve on both sides: a '/'-joined root never prefixes a '\' path on Windows.
    if (!file.startsWith(path.resolve(dir) + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end("not found"); return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((ok, fail) => { server.once("error", fail); server.listen(port, "127.0.0.1", ok); });
  const url = `http://127.0.0.1:${server.address().port}`;
  dir = servedCopy(tree, url + "/gas");
  const stop = () => new Promise(ok => server.close(() => { fs.rmSync(dir, { recursive: true, force: true }); ok(); }));
  if (!quiet) {
    console.log(`NeoFeed dev-local: ${url}  (tree ${tree})`);
    console.log(`  backend: gas-backend.gs in the sandbox · CONSTANTS_VERSION ${constants} · ward day ${today}`);
    for (const a of accounts) console.log(`  ${a.role.padEnd(6)} ${a.email}  ${a.password}`);
    console.log("  Ctrl+C stops it. Made-up infants AA–DD (NICU) and SS–TT (SCN); see the header of this file.");
  }
  return { url, accounts, constants, today, stop };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  start({ tree: arg("--tree") || path.join(HERE, ".."), port: Number(arg("--port") || 8155) })
    .catch(e => { console.error("dev-local: " + e.message); process.exit(1); });
}
