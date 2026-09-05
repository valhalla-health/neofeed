# NeoFeed — Improvement Review & Spec (2026-09-04)

**What this file is for:** a review of NeoFeed as it stands in real ward use today, with a
prioritized, actionable spec for closing the gaps that matter most. It is **not** a replacement for
`BACKLOG.md` — every item below that is already tracked there is cited, not duplicated in full, and
this file's job ends the day its recommendations are either in `BACKLOG.md` with an owner or
explicitly rejected. Items marked **NEW** are not currently in `BACKLOG.md`.

**Method:** read `STATUS.md`, `BACKLOG.md`, `PRD.md`, `AI_SDLC.md`, `app-walkthrough.md`,
`REFERENCE.md`, `CHANGELOG.md` (recent sessions) and `git log`, then organized what was found by
*who has to act* and *how much it costs to leave unfixed*, the same ranking rule `BACKLOG.md`
already uses. No source outside this repository was available to this review — an external file the
requester pointed at (`NEOFEED_REVIEW_FOR_CLAUDE.md`, on a local Windows path) lives on a machine
this session cannot reach; if it contains ward feedback not already captured in `PRD.md` §8 or
`BACKLOG.md`, paste or attach it and this spec should be revised against it.

**Reviewed state:** backend `@50`, frontend `746051d`+ (both hosts in step per `STATUS.md`,
2026-08-26), 15 verification harnesses in `test/`, one maintainer (Praew).

---

## 1 · Headline assessment

NeoFeed is unusually well self-documented for a single-maintainer clinical tool — the six-file doc
split (`STATUS`/`BACKLOG`/`PRD`/`REFERENCE`/`AI_SDLC`/`CHANGELOG`), the TDD convention, and the
KCMH-worksheet-matched calculation harnesses are real engineering discipline, not decoration. The
gaps that remain are not "the app is unfinished" gaps — they are **the specific things a mature
clinical tool with one maintainer runs out of runway for**: a deploy gate on the half that draws the
printed dose, a retention policy, and confirmation that the numbers it prints are being looked at by
a second person before they change.

**The single highest-leverage fix available is not a feature — it's closing the frontend deploy
gate** (§3.1). Everything else in this file is safety-relevant in the way a checklist is; that one
is safety-relevant in the way a lock on a door is.

---

## 2 · P0 — clinical safety (Praew's call, not engineering's)

These are already `BACKLOG.md` § Now items. Restated here only because a "review" that omits them
to focus on novel suggestions would be answering the wrong question.

| # | Item | Why it's P0 | Decision needed from |
|---|---|---|---|
| 2.1 | Confirm Na-acetate (3 mEq/mL) / KCl (2 mEq/mL) stock concentrations against the shelf label | These were *inferred* from the worksheet's divisors, never read off a strength label — they change the mL on every printed order | Praew, physical check |
| 2.2 | `TARGETS.fluid` documented as birth weight, every call site passes current weight | One of the two is wrong today, silently | Praew, clinical judgement |
| 2.3 | `registerPatient` silently collapses two infants sharing initials+BW into one record | Needs an identity decision — a collision suffix changes every `Daily_Log` join | Praew + engineering, together |
| 2.4 | Exercise backend `@50` with one real login, save and Delete | Closes three standing "never exercised outside a stub" items in one session | Praew |

**Spec for 2.3** (the one with an actual code shape, once the decision lands): on a `registerPatient`
collision, do not silently overwrite. Server-side, detect the collision *before* the upsert and
return a distinguishable error (`{error: "duplicate_session_id", existing: {...}}`) rather than a
generic failure or a silent merge. Client-side, `NewPatientModal` shows the existing record's bed/GA
and asks the registering user to either (a) confirm this is the same infant returning to the
registry, or (b) append a disambiguating suffix the pharmacy will also see on the printed order. This
needs Praew's sign-off on what the suffix should look like before it's built — a suffix that isn't
also visible on the physical order form doesn't solve the problem it's meant to solve.

---

## 3 · P1 — governance & security (the ward is exposed to this today, not hypothetically)

### 3.1 · Close the frontend deploy gate — `AI_SDLC.md` § 5's named gap

**Current state:** a push to `main` is a live production deploy of the frontend on both hosts within
minutes, with no review step. The backend requires Praew's explicit confirmation to redeploy; the
frontend — which is what actually draws the printed dose — has no equivalent. This was demonstrated,
not theorized: `app.jsx?v=pwd-gate-0821` went live from an agent push in minutes on 2026-08-21.

**Spec:**
1. Enable GitHub branch protection on `main`: require a pull request before merge, at least one
   approving review, and status checks (the `test/` suite, once it runs in CI — see 3.2) green
   before merge is allowed.
2. Point both Cloudflare Workers Builds and GitHub Pages at the protected `main` (they already are —
   no redeploy-target change needed, only the merge gate).
3. Agents (including this one) continue to draft on feature branches and open PRs, exactly as this
   session already does. The only behavior change is that "push to `main`" stops being something an
   agent can do unilaterally — merge becomes Praew's action, mirroring how backend deploys already
   work.

**Acceptance criteria:** an agent-authored commit cannot reach either production host without a
human merging a PR on GitHub. Verify by attempting a direct push to `main` from a session after the
protection is enabled and confirming it is rejected.

**Effort:** near-zero engineering cost — this is a GitHub repository setting, not a code change.
It is the smallest-effort, highest-leverage item in this entire document.

### 3.2 · **NEW** — CI: run the `test/` suite and the shell-drift check on every PR

**Problem:** the 15 harnesses in `test/` — including the ones that pin the KCMH worksheet arithmetic
— currently only run when someone remembers to run them locally. Nothing blocks a PR that breaks one.
Once 3.1 requires status checks, this is what they check.

**Spec:** a GitHub Actions workflow (`.github/workflows/test.yml`) that runs `node test/*.cjs` (or
however the suite is invoked today — confirm against `TDD.md`) on every PR into `main`, plus one new
check: a byte-diff of `NeoFeed.html` against `index.html` outside the single documented
divergence point (the GitHub Pages hostname-redirect guard, per `REFERENCE.md`). The two files have
drifted silently before (§ `REFERENCE.md`'s CSS-drift note); a CI check that fails loudly the moment
they diverge again is cheaper than another multi-session hunt for why one host renders differently
from the other.

**Acceptance criteria:** a PR that breaks `verify-kcmh-factor.cjs`, or that edits `NeoFeed.html`
without a matching edit to `index.html`, shows a red check and cannot merge once 3.1's "required
status checks" is turned on.

**Effort:** small — the harnesses already exist and already pass/fail cleanly; this is packaging,
not new test-writing.

### 3.3 · Server-side one-entry-per-date guard

Already `BACKLOG.md` § Next. The duplicate-date lock (`startAddToday` in `app.jsx`) is frontend-only
today — the invariant "one `Daily_Log` row per patient per date" is unenforced at the source of
truth. **Spec:** `updateDailyNutrition`/the insert path in `gas-backend.gs` rejects (or redirects
into an update of) a second insert for a `sessionId` + date pair that already has a row, the same
invariant the client already tries to hold, moved to where a direct POST (bypassing the UI) can't
evade it. Pairs naturally with 3.4 below since both are "the client's protection has no server-side
backstop" in the same file.

### 3.4 · `updateWeights` fails silently and takes no lock

Already `BACKLOG.md` § Next. No new spec beyond what's there — flagging because it is a genuine data-
loss risk (a failed weight save that reports success) sitting next to 3.3 in priority, not because
this review found anything the backlog entry doesn't already say.

### 3.5 · GitHub Pages still serves `gas-backend.gs` and both `CODE_REVIEW_*.md` files

Already in progress (`BACKLOG.md` § Now — redirect stub shipped 2026-08-23, staff not yet told). No
new spec; the sequence is already correct (announce → 2-week window → repo private). Flagging only
because it is the second-highest-leverage item after 3.1: a public, dated list of this app's
*unpatched* vulnerabilities sitting next to the backend source that shows exactly where they live is
exactly the kind of thing a real-use review exists to keep surfacing until it's actually closed.

---

## 4 · P2 — product, for how the ward actually uses this today

### 4.1 · **NEW** — Ship M1/M2/M3 usage metrics as a real (aggregate-only) view

`PRD.md` § 6 already defines the three metrics and the two hard constraints (distinct `actorEmail`
per week, never row counts; aggregate only, never per-staff). `usageMetrics()`/`getUsageMetrics()`
are built and pinned by `test/verify-usage-metrics.cjs`, but nothing has read the live sheet and
nothing renders the number anywhere. Running it once from the Apps Script editor (the `BACKLOG.md`
§ Now item) answers "does anyone use this" for a single week. It does not answer it *continuously*,
which is what a maintainer deciding where to spend the next month of effort actually needs.

**Spec:**
1. Wire `getUsageMetrics()` to a new `doPost` action, admin-role-gated (it is currently
   deliberately unwired — the security release carried nothing else, per `BACKLOG.md`).
2. A small card in `AdminDashboard` (admin-only, matching the PDPA constraint that this data must
   never be staff-facing at the individual level) showing M1 (WAU, sparkline over recent weeks), M2
   (today's log-coverage ratio — already computed on every registry render and thrown away per
   `PRD.md` §6, just needs to be surfaced), and M3 (back-fill rate).
3. Reuse `test/verify-usage-metrics.cjs` test 9's pattern (serialize the whole response, fail on an
   `@`) as the shape of the *rendering* code's own guard, not just the backend's — a UI regression
   that accidentally interpolates `actorEmail` into a label is the same PDPA violation the backend
   test already refuses to allow to exist server-side.

**Effort:** medium. The hard part (the aggregation logic, the PDPA-safe boundary) is done and
tested; this is a `doPost` action plus one dashboard card.

**Why this is P2 not P1:** it's a maintainer-decision-support tool, not a patient-facing risk. It's
ranked above the items in §5 because a maintainer who doesn't know whether TrendGraph is used (an
open question in `PRD.md` §8) is guessing at every prioritization call below this line, including
some of the ones in this document.

### 4.2 · **NEW** — Spec: a round-oriented "Today's list" view

`PRD.md` §8 asks this as an open question rather than answering it: *"is the ward's real unit of
work the infant or the round?"* The registry's `NEEDS ENTRY` badge already hints the answer is the
round — staff work through a list, not one infant in isolation. This is worth turning from an open
question into a shipped view, gated behind confirming it with the ward first (see the 🟡 flags
throughout `PRD.md` — this is exactly the kind of claim that shouldn't be built on inference alone).

**Proposed shape**, contingent on ward confirmation:
- A view (or a registry sort/filter mode, not necessarily a new nav item) that leads with **Needs
  entry** patients, sorted by however the ward actually walks the unit (bed order is already the
  registry's default sort — confirm that's also round order, it may not be), with **Logged today**
  patients collapsed below rather than interleaved.
- One-tap from that list straight into `LogDateModal` → Calculator for the patient at the top, so
  finishing an entry advances to the next "needs entry" patient without a trip back through the full
  registry.
- Explicitly **not** a new patient-data view — it's a filter/ordering layer over data the registry
  already renders, which keeps it inside the existing PDPA data-flow boundary with no new export or
  endpoint.

**Acceptance criteria:** a nurse or doctor can go from login to "next patient needing an entry, ready
to log" in fewer taps than today's path (login → Patients → scan for `NEEDS ENTRY` → tap → Dashboard
→ "บันทึกวันนี้"). Measure taps before and after, not just ship-and-assume.

**Do this only after 4.1's M2 confirms the badge/stats-strip framing is actually how staff work** —
building a round-oriented view on the same unverified assumption `PRD.md` already flags as 🟡 doubles
down on an unconfirmed premise instead of checking it first.

### 4.3 · Offline capability — partially shipped, spec the rest

`BACKLOG.md` § Next already frames this as three levels (`NEEDS ENTRY` staleness banner shipped
2026-08-26; cached read-only shell and a queued-save mode not yet built) and points at
`NEOFEED_DIGIHEALTH_UPGRADE_MAP.html` §05 for detail. No new spec here — the existing framing already
correctly sequences "queued save" behind 3.3 (the server-side one-entry-per-date guard), since a
queued save replaying against a sheet with no server-side duplicate guard is exactly how two
back-filled rows for the same day would appear. Flagging the dependency explicitly so it isn't
resequenced by accident.

---

## 5 · P3 — engineering health (compounds over months, doesn't bite this week)

### 5.1 · **NEW** — A staging Sheet + staging deployment

`AI_SDLC.md` § 4 already names this as the "smallest real next step" for isolated dev environments,
but it isn't in `BACKLOG.md` as a trackable item yet. **Spec:** a second Google Sheet (same schema,
seeded with the existing `MOCK_PATIENTS`/`MOCK_DAILY_LOG` shape, never real patient data) and a
second Apps Script deployment pointed at it, with its own `NEOFEED_GAS_URL`. This is what would let
"a real login, a real save, a real Delete" (the recurring §Now item this review's §2.4 restates
*again*) be discharged by an automated check instead of needing a person on the ward every time a
deploy needs exercising. **This is the fix for the fact that this exact item — "exercise the backend
with a real login" — has now appeared at `@46`, `@47`, and `@50`.** A staging environment turns a
recurring manual chore into a one-time engineering cost.

**Effort:** medium — a second Sheet is free, a second Apps Script deployment is a few minutes, the
work is wiring a `NEOFEED_GAS_URL` switch (env-style, e.g., a `?staging=1` query param or a second
HTML shell) without adding a third hand-synced file to the drift list in §3.2.

### 5.2 · **NEW** — Turn `REFERENCE.md`'s deploy procedure into a checklist skill

`AI_SDLC.md` § 2 names this as the smallest real next step for the "managed skills" layer: the deploy
procedure is already written as numbered steps with a verify-don't-assume rule at step 4 (mirror
diffed before overwrite, deploy identity checked, deployment count confirmed unchanged, deployed
source pulled back and diffed byte-for-byte). Turning it into a `.claude/skills/` entry — the repo
currently has exactly one (`app-walkthrough`) — makes it something an agent is prompted to *run*
rather than something it has to remember exists in `REFERENCE.md`. This is process tooling, not a
patient-facing change, and is safe for an agent to build without triggering `AI_SDLC.md`'s human-
gate rules.

### 5.3 · Second reviewer for changes to a computed/printed clinical value

`AI_SDLC.md` § 7 states the rule already: *"For anything that alters a computed or printed clinical
value, that decision is not the same person who wrote the change if it can possibly be avoided."*
Today there is no mechanism enforcing this beyond the KCMH-worksheet harnesses (a proxy for a second
reviewer, not a substitute — they can't catch a change to something the worksheet doesn't cover).
**Spec, contingent on Praew finding a second clinician willing to be that reviewer:** a lightweight
PR label (`clinical-value-change`) an agent applies to any PR touching `calculator.jsx`'s dosing
math, `data.js`'s `TARGETS`/`ENTERAL_TARGETS`/Fenton constants, or `gas-backend.gs`'s plausibility
guard ranges — and a note in `AI_SDLC.md` that a PR carrying that label is not merged (§3.1's gate)
without that second person's sign-off, distinct from ordinary code review. This is a process
proposal, not a code change, and depends entirely on Praew identifying who that second person is —
`PRD.md` §8's open question ("who owns NeoFeed if Praew stops maintaining it") is the same gap.

### 5.4 · `Audit_Log` unbounded growth

Already `BACKLOG.md` § Later, correctly flagged as interacting with M1 (§4.1 here) — don't thin the
log in a way that destroys the distinct-`actorEmail`-per-week signal M1 needs. No new spec; sequence
this after 4.1 ships so the thinning logic can be tested against the metric it must not break.

---

## 6 · Explicitly not recommending

- **A build step / bundler.** `REFERENCE.md` and `PRD.md` both name no-build-step as a deliberate
  security property (every file is public by design; nothing secret goes in source). Nothing in this
  review found a problem a bundler would solve that's worth that trade.
- **A service worker for full offline support**, ahead of 4.3's sequencing. `PRD.md` §7 and
  `BACKLOG.md` already correctly identify a cache-first SW as a risk (stale patient data, stale
  `.jsx?v=` bundle) before the server-side one-entry-per-date guard (§3.3) exists to make a queued
  save safe to replay.
- **Widening the Fenton chart past 42 weeks**, or **unifying the split Ca/PO₄ accounting** (§3 of
  `app-walkthrough.md`) — both are explicit standing guardrails in `BACKLOG.md`, not open questions.
  Restated here only so a future pass over this file doesn't read their absence as an oversight.

---

## 7 · Suggested sequencing

Not a schedule — a dependency order, since several of the P1/P2 items above explicitly build on each
other:

1. **3.1** (branch protection) — zero cost, unblocks nothing else being risky in the meantime, do it
   this week regardless of what else is prioritized.
2. **2.1–2.4** — Praew's physical/clinical checks, parallel to everything else, blocked on her time
   not on engineering.
3. **3.2** (CI) — needed for 3.1's "required status checks" to mean anything.
4. **3.3, 3.4** — server-side backstops, small and independent of each other.
5. **4.1** (metrics view) — unblocks an informed answer to 4.2 and to `PRD.md` §8.4 (does anyone use
   TrendGraph).
6. **4.2** (round-oriented view) — only after 4.1 gives real usage data and after confirming the
   premise with the ward directly.
7. **5.1, 5.2** — engineering-health items, no patient-facing urgency, good "quiet week" work per
   `BACKLOG.md`'s own ranking rule 5.
8. **5.3** — depends on Praew finding a second reviewer; not schedulable by engineering alone.

---

## 8 · Traceability to `BACKLOG.md`

| This file | `BACKLOG.md` |
|---|---|
| §2.1–2.4 | § Now |
| §3.1 | § Next — "A push to `main` is an unreviewed production deploy" |
| §3.2 | **NEW** — not yet in `BACKLOG.md` |
| §3.3 | § Next — "No server-side one-entry-per-date guard" |
| §3.4 | § Next — "`updateWeights` fails silently and takes no lock" |
| §3.5 | § Now — GitHub Pages exposure |
| §4.1 | § Now — M1 (metrics *reading*); dashboard *rendering* is **NEW** |
| §4.2 | **NEW** — `PRD.md` §8 open question, not yet a backlog item |
| §4.3 | § Next — offline capability |
| §5.1 | **NEW** — named in `AI_SDLC.md` §4 as a next step, not yet a backlog item |
| §5.2 | **NEW** — named in `AI_SDLC.md` §2 as a next step, not yet a backlog item |
| §5.3 | **NEW** — `AI_SDLC.md` §7's rule, no tracked mechanism yet |
| §5.4 | § Later |

**Next step for this file:** the six items marked **NEW** in the table above (§3.2, the rendering
half of §4.1, §4.2, §5.1, §5.2, §5.3) should be copied into `BACKLOG.md` at whatever priority Praew
assigns them, per that file's own definition-of-done rule — an item that exists in a review doc but
not in `BACKLOG.md` is exactly the kind of thing that file exists to prevent from going quiet.
