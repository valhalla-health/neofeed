#!/usr/bin/env node
// tools/release-gate.mjs — NF-05: a PR into `release` is a promotion from the pilot.
//
// .github/workflows/release-gate.yml runs this on every PR into `release`, and again
// whenever its body is edited, so ticking the last box re-runs it. It reads the PR
// from the environment and fails, one line per reason, unless:
//   1. the PR comes from `pilot`, not `main`
//   2. "Pilot commit:" names the commit the pilot ran, and that is the PR's head
//      (a push to `pilot` during the pilot restarts the 48 h)
//   3. "Pilot started:" is at least 48 h ago, read as Bangkok time
//   4. "## Rollback target" names a release tag and the ward backend's version (@N)
//   5. no checkbox in the body is left unticked
// The body comes from .github/PULL_REQUEST_TEMPLATE/release.md.
//
// It is a check, not a lock: it is not a required status, and Pp merges. A release
// that cannot be piloted side by side shows red here, and Pp merges over it with
// her reason written in the PR (REFERENCE.md § The pilot ladder).
//
//   PR_BASE=release PR_HEAD=pilot PR_HEAD_SHA=<sha> PR_BODY="$(cat body.md)" node tools/release-gate.mjs

import { pathToFileURL } from "node:url";

export const PILOT_HOURS = 48;
const ICT_OFFSET = "+07:00";

// The text under one "## heading", up to the next "## ".
function section(body, title) {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^##\\s+${title}\\b`, "i").test(l.trim()));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s/.test(l.trim()));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n");
}

// HTML comments are the template's own instructions, never an answer.
const visible = (body) => String(body || "").replace(/<!--[\s\S]*?-->/g, "");

export function checkReleasePr({ base, head, headSha, body, now = new Date() }) {
  const problems = [];
  const text = visible(body);

  if (base !== "release") problems.push(`base is ${base || "(none)"}, not release: this gate is for release PRs only`);
  if (head !== "pilot") {
    problems.push(`head is ${head || "(none)"}: a release PR comes from pilot, the branch Pp and one fellow ran for ` +
      `${PILOT_HOURS} h (REFERENCE.md § The pilot ladder)`);
  }

  const commit = text.match(/Pilot commit:\**\s*`?([0-9a-f]{7,40})\b/i);
  if (!commit) problems.push("no \"Pilot commit:\" with the commit the pilot ran");
  else if (!headSha || !String(headSha).toLowerCase().startsWith(commit[1].toLowerCase())) {
    problems.push(`the pilot ran ${commit[1]}, but this PR's head is ${String(headSha || "(none)").slice(0, 12)}: ` +
      `a push to pilot restarts the ${PILOT_HOURS} h, so restate the commit and the start time`);
  }

  const started = text.match(/Pilot started:\**\s*(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/i);
  if (!started) problems.push("no \"Pilot started:\" as YYYY-MM-DD HH:MM (Bangkok time)");
  else {
    const at = new Date(`${started[1]}T${started[2]}:00${ICT_OFFSET}`);
    const hours = (now.getTime() - at.getTime()) / 3_600_000;
    if (Number.isNaN(hours)) problems.push(`"Pilot started: ${started[1]} ${started[2]}" is not a date`);
    else if (hours < 0) problems.push(`the pilot start ${started[1]} ${started[2]} is in the future`);
    else if (hours < PILOT_HOURS) {
      problems.push(`the pilot has run ${Math.floor(hours)} h of ${PILOT_HOURS} (started ${started[1]} ${started[2]} ICT)`);
    }
  }

  const rollback = section(text, "Rollback target");
  if (rollback === null) problems.push("no \"## Rollback target\" section");
  else {
    if (!/release-\d{4}-\d{2}-\d{2}-pr\d+/.test(rollback)) {
      problems.push("the rollback target names no release tag (release-YYYY-MM-DD-prNN)");
    }
    if (!/@\d+/.test(rollback)) problems.push("the rollback target names no backend version (@N)");
  }

  const open = text.split(/\r?\n/).filter((l) => /^\s*[-*+]\s+\[ \]/.test(l));
  // "::" taken out: the line is echoed after "::error::", and body text must not
  // read as a second workflow command.
  for (const l of open) {
    problems.push(`not ticked: ${l.replace(/^\s*[-*+]\s+\[ \]\s*/, "").replace(/::/g, ": :").slice(0, 120)}`);
  }

  return { ok: problems.length === 0, problems };
}

async function main() {
  const r = checkReleasePr({
    base: process.env.PR_BASE,
    head: process.env.PR_HEAD,
    headSha: process.env.PR_HEAD_SHA,
    body: process.env.PR_BODY,
  });
  if (r.ok) {
    console.log("release-gate: the pilot ran this commit for 48 h, the rollback target is named and every box is ticked");
    return;
  }
  for (const p of r.problems) console.log(`::error::${p}`);
  console.log(`release-gate: ${r.problems.length} problem(s). Pp can still merge; the reason then goes in the PR.`);
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main();
