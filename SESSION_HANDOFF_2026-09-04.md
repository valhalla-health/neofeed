# Session Handoff — 2026-09-04

**Not part of the repo's regular doc set** (`STATUS.md`/`BACKLOG.md`/`PRD.md`/`REFERENCE.md`/
`AI_SDLC.md`/`CHANGELOG.md`) — this is a one-off summary of a single Claude Code session, written
for handoff to Pp or to whoever/whatever picks this up next. Not committed automatically; delete it
once its contents are absorbed into the regular docs (see "Follow-ups" below), or keep it as a
dated record — your call.

## What was asked, in order

1. **Review NeoFeed for real-use improvements and write a spec.** The request pointed at a local
   Windows file (`NEOFEED_REVIEW_FOR_CLAUDE.md` under `OneDrive`) this cloud session couldn't
   reach — flagged once, then proceeded using the repo's own (already extensive) self-documentation
   instead.
2. **Critically review an external document** ("NeoFeed Review for Claude") pasted into the
   conversation — a separate, independently-authored review with its own P0/P1/P2 recommendations,
   architecture comparator (MyBreastmilk), and ten explicit questions. Review-only: no code,
   deploy, Sheet, or repo-setting changes were allowed at that step.
3. **Translate that critique into Thai** (`แปลไทย`) — done in full.
4. **"Fix only the parts you see as genuinely wrong first."** Scoped to four confirmed, no-clinical-
   judgement-required defects; implemented, tested, and shipped.

## What shipped (all now on `main`, via merged PR #55)

| File | Change |
|---|---|
| `IMPROVEMENT_SPEC_2026-09-04.md` | New. Prioritized P0–P3 review of the app as used today, with a traceability table back to `BACKLOG.md`. |
| `calculator.jsx` | `SaltRow` no longer accepts a negative electrolyte dose (matches `NumField`'s existing pattern). |
| `gas-backend.gs` | `logDailyNutrition` (create) now takes a `LockService` lock like every sibling write. `updateWeights` now takes a lock and returns `{error}` on a miss instead of silently doing nothing; `doPost`'s dispatch now checks that result. `_buildLogRow`'s missing-`entry.ts` fallback is now ward-local (`_todayWardLocal_()`) instead of raw UTC. |
| `test/verify-input-validation.cjs` | +6 assertions covering the `updateWeights` miss case and the `logDailyNutrition` lock (taken/released, including on the throwing path). |
| `test/verify-nutrition-unit-review.cjs` | +1 assertion: typing `-3` into a real mounted `SaltRow` no longer renders with the minus sign. |
| `CHANGELOG.md` | New session entry describing all four fixes and how they were verified. |

**Verification standard held:** every new assertion was confirmed **failing against the pre-fix
source** (via `git stash`) before confirming it passes after — this repo's own TDD convention, not
a shortcut. Full Node suite: 18 of 19 harnesses green (temp npm deps installed on demand per
`test/README.md`, then removed — `node_modules/` is gitignored, nothing extra was committed). The
19th, `runthrough-app.cjs` (the one real-browser Playwright walkthrough), fails at the login step in
this sandbox — confirmed via the same `git stash` technique that the identical failure exists on
the **unmodified** source too, so it predates this session and wasn't investigated further.

**Merge:** Praew moved PR #55 from draft → ready → merged herself, within the same minute, no
review comments. Session unsubscribed from PR activity and cleared the standing check-in once the
`pull_request.closed` (merged) event arrived.

## ⚠️ Live-state nuance — read before assuming anything is deployed

- **Frontend:** per `STATUS.md`, a push to `main` auto-deploys both hosts (Cloudflare Workers
  Builds + GitHub Pages) with no human gate. That means the `SaltRow` fix in `calculator.jsx` is
  very likely **already live** the moment the merge landed — nobody confirmed this with a fresh
  fetch against production, and `STATUS.md` was **not** updated this session (see below).
- **Backend:** the `gas-backend.gs` changes (both `LockService` additions, the `updateWeights`
  error-return, the ward-local date fallback) are only **source on `main`**. The live Apps Script
  deployment is still whatever `STATUS.md` said before this session (`@50`) — per `AI_SDLC.md`,
  backend redeploys require Praew's explicit action (`clasp` push + version cut + the full
  mirror-diff/identity/deployment-count verification ritual in `STATUS.md`), and **nothing in this
  session performed that.** Don't assume the lock fixes or the date fix are protecting production
  writes yet — they aren't, until that deploy happens.
- **`STATUS.md` was intentionally left untouched** this session, because nothing was deployed by
  this session. Whoever runs the backend redeploy should update it in the same commit, per the
  file's own stated rule (it went stale twice before under exactly this kind of gap).

## Explicitly not done — left for a clinician or the next session

These all need Praew's judgement, not an engineering fix, and were named as out of scope on
purpose:

- **Stock concentrations** (Na acetate 3 mEq/mL, KCl 2 mEq/mL) — still need a physical check
  against the shelf. Highest-stakes open item in the whole repo.
- **`FENTON_LENGTH`/`FENTON_HC`** — still unverified against any source.
- **`TARGETS.fluid`** — still ambiguous between "birth weight" (as documented) and "current weight"
  (as every call site actually passes).
- **`registerPatient` identity collision** — two infants sharing `initials+BW` still silently
  upsert onto one record. The write path *is* lock-protected against concurrent-registration races
  (confirmed by reading the source); the residual problem is the upsert-by-string-match identity
  logic itself, which needs a UX/product decision (reject vs. flag vs. disambiguate) before code.

## Follow-ups this session flagged but did not do

1. **`BACKLOG.md` still lists two items this session closed** — "`SaltRow` accepts negative
   electrolyte doses" and "`updateWeights` fails silently and takes no lock." Per the repo's own
   definition-of-done rule (on `main` + `CHANGELOG.md` entry exists → delete the backlog line),
   these are ready to come out. Not removed this session — left for Praew's weekly backlog review,
   or ask a future session to do it.
2. **Six items from `IMPROVEMENT_SPEC_2026-09-04.md` marked NEW** (not yet real `BACKLOG.md`
   entries): branch protection + PR-gated CI, the usage-metrics dashboard UI, a round-oriented
   "today's list" view proposal, a staging Sheet/deployment, turning `REFERENCE.md`'s deploy
   checklist into a `.claude/skills/` entry, and a second-clinical-reviewer process for changes to
   printed values. See that file's §8 traceability table.
3. **The single highest-leverage open item, named independently by three sources this session**
   (the improvement spec, the external review's own P1 list, and `AI_SDLC.md` §5 itself): **`main`
   has no branch protection.** Any push — including an agent's — is a live production frontend
   deploy with no review gate. Zero engineering cost to fix (a GitHub repository setting); everything
   else in this session's work would have been safer to land with that gate already in place.
4. Two mitigations the external-review critique surfaced that aren't in `BACKLOG.md` yet: a
   documented/tested Google Sheet backup-restore drill, and Sheets protected ranges to stop a
   direct manual edit from bypassing every `doPost`-path validation and audit trail.

## Where to look

- `IMPROVEMENT_SPEC_2026-09-04.md` — the full prioritized review + spec.
- `CHANGELOG.md`'s 2026-09-04 entry — the fix session's own record, in the repo's normal format.
- PR #55 (merged) — `valhalla-health/neofeed#55` — full diff and discussion (there wasn't much;
  it merged clean).
