# NeoFeed — how AI is allowed to build a clinical tool

**What this file is for:** NeoFeed is written largely with AI assistance and runs on real infants
in a real NICU. This is the boundary between those two facts — what an agent may do, what it must
never do, and who decides.

**Update trigger: rarely.** When the boundary itself moves. Open work belongs in `BACKLOG.md`;
what is deployed belongs in `STATUS.md`.

---

## Where this came from

Uber published how they run an agentic software-development lifecycle at scale. Praew's mapping of
its seven layers onto NeoFeed, 2026-08-21, is the frame this file is built on:

> *NeoFeed does not need Uber-scale infrastructure, but it needs the same discipline adapted to the
> NICU: strong privacy boundaries, clinically validated skills, a trusted knowledge layer,
> mock-data development environments, automated safety testing, and mandatory human review before
> deployment. For a clinical tool, producing code faster is not the main goal. The real question is
> no longer "Can AI build it?" but "Should we ship it — and can we prove that it is safe for every
> infant?"*

The mapping is not aspirational. Most of these layers already exist here in some form, built
incrementally without a name for what they were. **Naming them makes the gaps visible**, which is
the whole reason to write this down. Grades below are deliberately unkind; a flattering self-audit
of a clinical tool is worse than none.

| # | Uber layer | NeoFeed's version | Grade |
|---|---|---|---|
| 1 | Model gateway | Patient data never reaches a model | 🟢 strong |
| 2 | Managed skills | The 14-harness verification suite | 🟢 strongest layer |
| 3 | Context graph | The doc split + `app-walkthrough.md` § 2 | 🟡 new, unproven |
| 4 | Isolated dev environments | `MOCK_PATIENTS`, `GAS_ON`, fixture-only tests | 🟡 real but unenforced |
| 5 | AI agents stop before production | True for the backend. **Not true for the frontend** | 🔴 gap |
| 6 | Managed maintenance | A weekly ritual, written yesterday | 🔴 nothing scheduled |
| 7 | Human oversight | One person is author, clinician and reviewer | 🔴 single point of failure |

---

## 1 · Model gateway → the data boundary 🟢

Uber's gateway is infrastructure. NeoFeed's is a rule, and the rule is stronger than infrastructure
because it has no exceptions to configure:

> ### 🔴 No infant's data has ever been sent to a model, and none ever will be.
> Not a row, not a screenshot, not a "just this once to debug it". Agents work on
> `MOCK_PATIENTS` / `MOCK_DAILY_LOG` in `data.js`. If a bug can only be reproduced with real data,
> **the bug gets reproduced by a human, and only the shape of it is described to the agent** — GA,
> DOL, which field, what it did. Never the record.

What backs it up in code, rather than in good intentions:

- **Pseudonymised at the source.** `sessionId` = `initials + BW + twinSuffix`. ⚠️ A pseudonym, not
  anonymous — staff present at admission can reverse-map it on a small census. Documented and
  **accepted** as residual risk in `BACKLOG.md`, not quietly treated as solved.
- **Role-based access** — `admin` / `doctor` / `nurse`, enforced server-side in `doPost`.
- **Hybrid auth** — Google ID token verified against `tokeninfo` with an `aud` check; otherwise
  salted iterated-hash passwords. 6 h sliding sessions, per-user epoch revocation, Staff row
  re-checked every 60 s so a disabled account loses access within the minute.
- **As of 2026-08-21, a temp password buys nothing but the chance to replace it** — the
  `mustChangePassword` gate now lives in `doPost`, not only in the client.
- **`Audit_Log`** — PDPA Sec 39 accountability, actor email + timestamp, outliving Apps Script's
  7-day execution log.
- **`_sheetSafe()`** — defuses formula injection from client-submitted strings.
- **Secrets are not in source.** `SPREADSHEET_ID` / `CLIENT_ID` live in Script Properties.
- **`handleLogout()` clears `neofeed_calc_*` localStorage** — NICU workstations are shared.

**Still open** (all in `BACKLOG.md` § PDPA): no retention or auto-purge after discharge, no
self-service data-subject path, cross-border transfer under Sec 28 never evaluated, and `Audit_Log`
growing without bound since the focus re-sync.

⚠️ **The metric layer is the place this boundary is most likely to erode.** `PRD.md` § 6 defines
M1 as aggregate-only and forbids a per-staff breakdown — `Audit_Log` is held for accountability,
not analytics, and a per-nurse count is personnel monitoring under a different lawful basis.
`test/verify-usage-metrics.cjs` test 9 enforces that by serialising the whole result and failing
on an `@`. That is the pattern to copy: **when a boundary matters, make a test fail rather than
write it in a doc.**

## 2 · Managed skills → the verification suite 🟢

This is NeoFeed's strongest layer and it predates the framing.

**Fourteen harnesses in `test/`.** The two that matter most are not code tests at all — they check
the TPN calculator against the **official KCMH pharmacy worksheet** (กลุ่มงานเภสัชกรรม, ward
9B2/NICU), because those numbers become compounding instructions and a wrong divisor is a wrong
dose. `verify-kcmh-factor.cjs` holds an *independent transcription* of the worksheet's formula
chain and requires two implementations of the same documented formulas to agree.

That is exactly a "validated clinical-calculation skill": a machine-checkable statement of what
correct means, owned by the pharmacy rather than by the developer.

**The repo's TDD convention is the enforcement mechanism** (`TDD.md`): a harness must **fail
against the unpatched source** before it passes. Both changes on 2026-08-21 were done that way —
the metrics harness was run red first, and the auth harness failed 23 assertions before the fix,
one of them proving the refusal had been returning a patient payload.

**Missing:** these are harnesses, not invocable skills. `.claude/skills/` holds exactly one
(`app-walkthrough`). The PDPA and deployment checklists exist as prose (`REFERENCE.md`,
`SECURITY_CHECKLIST.md`) and are followed by memory and habit rather than by a step that refuses
to complete.

**Smallest real next step:** turn `REFERENCE.md`'s deploy procedure into a checklist skill, because
it is the one already written as numbered steps with a verify-don't-assume rule at step 4.

## 3 · Context graph → the knowledge layer 🟡

Uber's context graph connects code to specs to tickets. NeoFeed's equivalent was built on
2026-08-21 out of necessity, when `HANDOFF.md` reached 2,138 lines doing four jobs and its own
section titled *"read this only"* had been wrong for three months.

**The principle now in force: one file, one job, one update trigger.** `STATUS.md` (deployed
state) · `BACKLOG.md` (open work) · `PRD.md` (what it is for) · `REFERENCE.md` (conventions) ·
`CHANGELOG.md` (history) · `app-walkthrough.md` § 2 (the *one* architecture table).

**Why duplication is the specific enemy here:** three copies of the architecture table existed,
and the two that were not authoritative rotted silently — still calling `fenton.jsx` "Fenton 2013"
after it became 2025, still describing a 5-step calculator that has six steps. Nobody noticed,
because nothing was wrong at the moment each copy was written.

**Unproven, honestly.** The structure is one day old. The same rot has already been caught once
outside the repo: `NeoFeed/CLAUDE.md` claimed the backend was `@45` four days after it became
`@46`, which is why that file no longer states a version at all.

**`graphify-out/` exists but is stale and untracked** — a real knowledge graph, neither wired into
anything nor rebuilt on a trigger. It is not currently part of this layer.

**Not connected yet:** the clinical guidelines (ESPGHAN targets, Fenton 2025) sit in `data.js` as
constants with no link back to the source that justifies them, except in prose. `FENTON_LENGTH` and
`FENTON_HC` are *unverified against any source* — which the graph cannot tell you, because the
graph does not know what "verified" means for a clinical constant.

## 4 · Isolated dev environments → mock data only 🟡

**What is genuinely true:** every one of the fourteen harnesses runs against fixtures or stubs.
**Not one test has ever touched the live Sheet.** `data.js` ships `MOCK_PATIENTS` /
`MOCK_DAILY_LOG`; `LoginScreen` is gated on `GAS_ON`, so a dev without `NEOFEED_GAS_URL` gets a
stubbed local user and mock patients.

**What is not true:** nothing *enforces* it. There is no staging Sheet and no staging deployment —
one Apps Script deployment, one spreadsheet, and `NEOFEED_GAS_URL` is a literal in both HTML
shells. A developer who wants live data has only to leave it in place.

This is also why the stub harnesses cannot model everything: `STATUS.md` has carried the warning
that **`@46` has never been exercised by a real login or a real Delete** since 2026-08-17, because
stubs model neither `CacheService` eviction nor `LockService` contention.

**Smallest real next step:** a second Sheet + a second deployment used by nothing but testing.
That is the change that would let `@46`'s warning be discharged by a test instead of by a person
logging in on the ward.

## 5 · AI agents stop before production 🔴 — and there is a real gap here

**Backend: correct.** Redeploying the Apps Script backend always needs Praew's explicit
confirmation, even though pushing source to GitHub `main` does not. The rule is in `CLAUDE.md` and
`REFERENCE.md` and was honoured on 2026-08-21: the `mustChangePassword` fix is on `main` and
**deliberately not deployed**. `STATUS.md` says so in orange.

Agents also already do the parts Uber's layer describes — draft changes, run the calculation
harnesses, and compare UI screenshots (`test/runthrough-app.cjs`, Playwright, screenshots to
`test/.screenshots/`).

> ### 🔴 But the frontend has no human gate at all.
> GitHub Pages serves `index.html` from the repo root, so **a push to `main` is a production
> deployment of the frontend.** There is no review step between an agent's commit and the browser
> a nurse is holding.
>
> This is not theoretical. On 2026-08-21 an agent push put `app.jsx?v=pwd-gate-0821` live within
> minutes — verified by fetching the public page. That change happened to be desirable and tested.
> The point is that nothing would have stopped one that was not.
>
> The asymmetry is backwards from the risk: the backend, which is gated, cannot render a wrong
> number to a clinician without the frontend. **The frontend, which is ungated, is where the
> printed dose is drawn.**

**Smallest real next step:** protect `main` and require a PR, or serve Pages from a `release`
branch that only a human merges into. The second is closer to how the backend already works and
does not change anyone's day-to-day.

## 6 · Managed maintenance 🔴

**A weekly backlog review now exists** (`BACKLOG.md`) — three questions per item, starting with
*"is it still true?"*, which exists because four caveats from May survived three months unchecked.

**Nothing is actually scheduled**, and the things that decay here are clinical:

- **Guideline drift.** ESPGHAN targets and the Fenton reference are constants in `data.js`.
  Nothing re-checks them when a guideline is revised.
- **Unverified constants shipped.** `FENTON_LENGTH` / `FENTON_HC` were never verified against any
  source and sit at 4-week steps. `FENTON_WEIGHT` was verified on 2026-08-10 — the other two were
  not, and only the changelog records the difference.
- **The stock concentrations.** Na acetate (3 mEq/mL) and KCl (2 mEq/mL) were **inferred from the
  worksheet's divisors, not read off a strength label.** These change the mL printed on every order
  form. This is the highest-stakes open item in the repo and it cannot be closed by any agent — it
  needs someone to look at the shelf.
- **Retention.** There is no policy to review, so no review can be scheduled.

## 7 · Human oversight 🔴 — the layer with the least redundancy

**Praew is the clinician, the maintainer, the reviewer and the deploy identity.** That is why
NeoFeed is clinically credible at all — the person writing the calculator is the person who
prescribes from it. It is also the single point of failure, and `PRD.md`'s first open product
question is exactly this: *who owns NeoFeed if she stops maintaining it?*

Concretely: **no change to a printed dose has ever had a second clinical reviewer.** The KCMH
worksheet harnesses are a proxy for one — they encode the pharmacy's arithmetic and refuse to let
it drift — but a worksheet cannot catch a change to something the worksheet does not cover.

**The rule to hold, whatever else changes:**

> An agent may draft, test, document, and push source. **A human clinician decides whether it
> reaches an infant.** For anything that alters a computed or printed clinical value, that decision
> is not the same person who wrote the change if it can possibly be avoided.

---

## The question this file exists to answer

Not *"can AI build it?"* — that was answered, repeatedly, and it is not interesting.

**"Should we ship it, and can we prove it is safe for every infant?"**

Today NeoFeed can prove a fair amount: the compounding arithmetic against the pharmacy's own
worksheet, the auth boundary, the date handling that used to report yesterday on the night shift,
the PDPA constraint on its own metrics. It cannot yet prove that the growth chart's length and
head-circumference references are right, that the electrolyte stock concentrations match the
shelf, or that a frontend change reached the ward with any human having looked at it.

**Those three are the honest answer to "what would you need to trust it more", and all three are
in `BACKLOG.md`.**
