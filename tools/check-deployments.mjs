#!/usr/bin/env node
// tools/check-deployments.mjs — the gate before a backend release (Pp, 2026-11-03):
// the Apps Script project must have exactly two deployments, @HEAD and the ward's.
//
// Every deployment runs the code of its own version against the live Sheet, Script
// Properties and cache, until someone removes it, and a plain `clasp deploy` adds one
// without a word. So a third deployment stops the release until a person has looked at it.
//
//   node tools/check-deployments.mjs                # asks clasp, in this repo (its .clasp.json)
//   node tools/check-deployments.mjs --dir <path>   # the clasp project is somewhere else
//   node tools/check-deployments.mjs --from <file>  # a saved `clasp list-deployments`
//
// Exit 0 only if the list is exactly those two. Exit 1 is a stop. Exit 2 means the list
// could not be read, which is a stop too. It only reads; it changes no deployment.
//
// Production's ID comes from boot.js. Any other deployment is printed by version and the
// start of its ID, never in full: this output gets pasted into comments on a public repo.
// See REFERENCE.md § Backend (GAS).

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROW = /^- (AKfycb[\w-]+) @(\S+)/;
const COUNT = /^Found (\d+) deployments?\./m;
const BOOT_URL = /NEOFEED_GAS_URL\s*=\s*"https:\/\/script\.google\.com\/macros\/s\/(AKfycb[\w-]+)\/exec"/;

export function productionIdFrom(bootJs) {
  const m = bootJs.match(BOOT_URL);
  if (!m) throw new Error("boot.js names no production deployment");
  return m[1];
}

export function checkDeployments(listing, productionId) {
  const rows = listing.split(/\r?\n/).map(line => line.match(ROW)).filter(Boolean)
    .map(m => ({ id: m[1], version: m[2] }));
  const count = listing.match(COUNT);
  if (!count || Number(count[1]) !== rows.length || rows.length === 0) {
    return { ok: false, summary: "the deployment list could not be read", problems: ["no count, or a count that disagrees with its rows"] };
  }

  const production = rows.filter(r => r.id === productionId && r.version !== "HEAD");
  const head = rows.filter(r => r.version === "HEAD" && r.id !== productionId);
  const others = rows.filter(r => r.id !== productionId && r.version !== "HEAD");
  if (rows.length === 2 && production.length === 1 && head.length === 1) {
    return { ok: true, summary: `exactly two: @HEAD and production at @${production[0].version}`, problems: [] };
  }

  const problems = others.map(r => `not production: @${r.version} (${r.id.slice(0, 10)}…)`);
  if (production.length !== 1) problems.push(`production is listed ${production.length} times, on a version`);
  if (head.length !== 1) problems.push(`@HEAD is listed ${head.length} times`);
  return { ok: false, summary: `${rows.length} listed, and a backend release needs exactly 2`, problems };
}

function argValue(args, flag) {
  const at = args.indexOf(flag);
  if (at === -1) return null;
  if (!args[at + 1]) throw new Error(`${flag} needs a value`);
  return args[at + 1];
}

function readListing(args) {
  const from = argValue(args, "--from");
  if (from) return readFileSync(from, "utf8");
  const dir = argValue(args, "--dir") || path.join(HERE, "..");
  // One string, so Windows can find clasp.cmd through the shell. Nothing here comes from the user.
  const r = spawnSync("clasp list-deployments", { cwd: dir, encoding: "utf8", shell: true });
  if (r.error || r.status !== 0) throw new Error(`clasp list-deployments did not run in ${dir}`);
  return r.stdout;
}

function main() {
  let listing, productionId;
  try {
    listing = readListing(process.argv.slice(2));
    productionId = productionIdFrom(readFileSync(path.join(HERE, "..", "boot.js"), "utf8"));
  } catch (e) {
    console.error(`deployments: STOP. ${e.message}`);
    process.exit(2);
  }
  const result = checkDeployments(listing, productionId);
  if (result.ok) {
    console.log(`deployments: OK, ${result.summary}`);
    return;
  }
  console.error(`deployments: STOP. ${result.summary}`);
  for (const problem of result.problems) console.error(`  ${problem}`);
  console.error("Do not push or deploy. The list can lag just after a delete, so run this once more.");
  console.error("Still here: tell Pp, and undeploy nothing without her word. REFERENCE.md § Backend (GAS).");
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
