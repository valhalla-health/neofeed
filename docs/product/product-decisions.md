# NeoFeed — product decisions

One page: who NeoFeed is for, what problem it solves, the bets in flight and the decisions already made.
`PRD.md` holds the full product definition; this page holds what changes week to week at the product level.
Ward requests go in [`requests.md`](requests.md), check-in answers in [`feedback.md`](feedback.md).
Started 2026-10-11 (NF-20). Blanks marked `TODO(Pp)` are Pp's to fill; nothing here was invented to fill them.

## Who, what problem, why it matters

- **Ward user.** KCMH NICU and SCN doctors, who write the daily TPN and EN order in the six-step calculator,
  and nurses, who use the same calculator and record intake, output and weight (`PRD.md` § 2). Pharmacy and
  the TPN team read the printed order but do not sign in.
- **Problem.** Each infant's PN and EN order is recalculated by hand every day from weight and age. The
  arithmetic is long, and a decimal slip in GIR or an electrolyte reaches the infant. The paper form and
  spreadsheet kept no history, no trend and no growth chart (`PRD.md` § 1).
- **Why it matters to the unit.** A wrong printed dose is the one failure here that cannot be undone
  (`BACKLOG.md`, ranking rule 1). The 2026-10-08 outside review advised holding routine pharmacy use until
  its open items close, so the unit does not yet get the full benefit.
- 🟡 Both the problem and the user split are reconstructed from the code, not confirmed by one ward user
  (`PRD.md`, header). The weekly check-in in `feedback.md` is how that changes.

## Bets in flight

Stages: **problem → design → build → ship → measure**. A success line (which metric, how big a change
counts) is written before work starts. **A bet with no success line stays at problem**, whatever has been
built. Commitment labels (probe, experiment, promise; NF-16) are not in `STATUS.md` yet; when they are,
each bet names its label here.

| # | Bet | Stage | Success line | Predicted outcome | Check on |
|---|---|---|---|---|---|
| B1 | The printed order can be used for routine pharmacy compounding (`BACKLOG.md` § Now, the outside review's open items) | problem | TODO(Pp). The ward-acceptance cases and pharmacy's reconciliation are candidates, not a decision | TODO(Pp) | TODO(Pp) |
| B2 | Weekly active users (M1) gives a first count of who uses NeoFeed (`PRD.md` § 6) | build (`usageMetrics()` built 2026-08-21, never run) | M1 = distinct `actorEmail` per ISO week, aggregate only. The target is set from the first month's baseline, as `PRD.md` § 6 decided. | TODO(Pp) | TODO(Pp) |
| B3 | The nursing I/O form moves I/O and weight entry off the order (`docs/NURSING_FORM_SPEC.md`; built, switched off until the DPO signs off D7) | problem | TODO(Pp). `PRD.md` § 6's M2 (logged today ÷ active) is a candidate, not a decision | TODO(Pp) | TODO(Pp) |
| B4 | Help requests from the app reach Pp (#136, #144) | problem | TODO(Pp). Not one real request has been sent yet (`BACKLOG.md` § Now) | TODO(Pp) | TODO(Pp) |
| B5 | Severity as a word and a shape, and no *In range* chip on a tile that is fine (#147, #149; live 2026-10-11) | problem | TODO(Pp). No one has looked at the new tiles on a ward phone or PC yet (`STATUS.md`) | TODO(Pp) | TODO(Pp) |

B2 is the only bet with a defined metric; its size of change waits for the baseline. B3 to B5 are built or
live with no success line, so by the rule above they sit at problem until Pp writes one.

## Decisions

Newest first. Each entry: the decision, who was in the room, the options dropped and why. The source is
the `CHANGELOG.md` entry named; staff other than Pp are named by team, not by person.

### 2026-10-08 · Peripheral K⁺ maximum is 60 mEq/L
- **Room:** Pp, in chat with the agent (`CHANGELOG.md` 2026-10-08).
- **Dropped:** a 200 maximum on both lines, which let a peripheral bag of 61–200 through on one typed reason.
  60 is the IWK Health NICU peripheral figure from the 2026-09-28 source search.

### 2026-10-08 · Two outside-review items not to do
- **Room:** Pp (`BACKLOG.md` § Now, outside review).
- **Decided:** nurse order writes stay tied to `NURSING_LOG_ENABLED`; the lipid rate stays graded on the
  2-decimal figure shown. **Dropped:** separate switches for either. TODO(Pp): the reason.

### 2026-09-28 · Central K⁺: red above 120, maximum 200
- **Room:** Pp, after meeting the KCMH TPN team the same day (`CHANGELOG.md` 2026-09-28 (2), (3)).
- **Dropped:** 200 as the red line, since no neonatal or paediatric source supports it (ANMF 2020 ≤ 80,
  IWK 120). The KCMH 40 mEq/L stop and a central osmolarity limit were dropped too.

### 2026-09-25 · The topbar switcher stays unit-wide
- **Room:** Pp, answering on PR #123 (`CHANGELOG.md` 2026-09-25 (4)).
- **Dropped:** a ward-scoped switcher. It is the way to any infant from any screen; only the ward list's
  own search box is ward-scoped.

### 2026-09-24 · Nurses compute but do not save or Submit orders (D5)
- **Room:** Pp (`BACKLOG.md` § Later, "Decide who may create and Submit a TPN order").
- **Dropped:** nurses keeping order writes, since recording urine output re-saved the whole order.
