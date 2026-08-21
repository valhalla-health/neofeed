# NeoFeed — Product Requirements

**What this file is for:** the product definition NeoFeed has been running without. `CHANGELOG.md`
records what changed; nothing recorded what the thing is *for*, who it is for, or how we would know
it was working. Thirty-six sessions of change history and no line anyone could point at to answer
"should we build this?"

**Update trigger: rarely.** Only when the product's purpose, users or scope genuinely change. If
something here needs editing weekly it belongs in `BACKLOG.md` or `STATUS.md`.

> ⚠️ **Written 2026-08-21 from the code and the existing docs, not from user research.** Everything
> under *What it does today* is verified against the source. Everything under *Who it is for* and
> *Problem* is **reconstructed intent** — plausible, consistent with the app's shape, and **not yet
> confirmed with a single NICU user.** Sections marked 🟡 are the ones to check with the ward first.
> Do not cite them as findings.

---

## 1 · Problem

Neonatal parenteral and enteral nutrition is prescribed daily, per infant, from a set of
weight-and-gestational-age-dependent targets. Done by hand it is arithmetic-heavy, error-prone in a
way that reaches the patient (a misplaced decimal in a GIR or an electrolyte dose is a real event,
not a typo), and it has to be redone every single day as the infant's weight changes.

The KCMH NICU's prior tool was a paper worksheet plus a spreadsheet. That gives no history, no trend,
no growth chart alongside the numbers, and no way to see who still needs today's entry.

🟡 **Unverified:** that this is the problem the ward would name first if asked. It is the problem the
app is built around.

## 2 · Who it is for

| Role | In-app | What they do |
|---|---|---|
| **Doctor** | `role: "doctor"` | Prescribes the daily TPN + EN plan through the 6-step Calculator. Full clinical write access. |
| **Nurse** | `role: "nurse"` | Same Calculator access; in practice records intake/output and weights. |
| **Admin** | `role: "admin"` | Everything above, plus the cross-patient Admin dashboard, per-entry delete, patient delete, and the PDPA erasure endpoint. |

Roles gate the nav rail in `app.jsx` (~L409–423): Calculator is doctor/nurse, Admin dashboard is
admin only.

**Not users, but affected:** the infants (the data subjects, who cannot consent), their parents (data
subjects by proxy under PDPA), ward pharmacy (receives the order the Calculator prints), and the
hospital's data-protection function (accountable for the Sheet).

🟡 **Unverified:** the doctor/nurse split above describes what the *roles permit*, not what each
group actually does at 3 a.m. Session 3 of the journey map is where that gets checked.

## 3 · Jobs to be done

1. *"When I round on this infant, I want today's fluid, macronutrient and electrolyte plan computed
   from their current weight, so I can prescribe without doing the arithmetic by hand."*
2. *"When I come on shift, I want to see which infants still need today's entry, so nothing is
   missed."* — this is the `✓ LOGGED` / `NEEDS ENTRY` badge and the stats strip.
3. *"When I'm deciding whether nutrition is working, I want the trend and the growth chart next to
   each other, so I can see the effect rather than the last number."*
4. *"When I got yesterday wrong, I want to correct it in place without creating a second row for the
   same day."* — the duplicate-date guard and in-place editing.

## 4 · What it does today — the v1 baseline

This is shipped and live, not a plan. Authoritative detail in `app-walkthrough.md` § 5.

- **Patient registry** — admit/edit/discharge, NICU → iso → SCN ordering, per-patient
  logged-today badge, stats strip (Active / Total sessions / Logged today / Needs entry).
- **6-step TPN + EN Calculator** — fluid plan → TPN macros → electrolytes → vitamins/trace/heparin →
  enteral feeding → enteral supplements, plus a non-collapsible Intake/Output card. One submission =
  one `Daily_Log` row. Draft state persisted per session in `localStorage`.
- **Daily nutrition log + TrendGraph** — nine metrics plotted against target bands, past entries
  editable in place, back-fill to a past date via `LogDateModal`.
- **Fenton 2025 growth chart** — weight/length/HC vs PMA, clamped at 42 wk, with `MeasurementLogger`.
- **Alerts** — stale-weight warnings (≥3 d warn, ≥7 d critical), acknowledgeable per alert.
- **Admin dashboard** — cross-patient view.
- **Static clinical reference** — ESPGHAN guidelines and a formula/product panel.
- **Hybrid auth** — Google Sign-In for Workspace/Gmail, salted iterated-hash password otherwise,
  6 h sliding session tokens, per-user epoch invalidation on password change.
- **PDPA machinery** — `Audit_Log` accountability trail, admin `pseudonymizePatient()` erasure,
  localStorage clearing on logout.

**Platform:** React 18 via CDN + in-browser Babel, no build step; GitHub Pages front end; Google Apps
Script + Google Sheets backend; installable as a PWA.

## 5 · Explicit non-goals

Naming these matters more than usual here, because the app is one file-drop away from becoming an
EMR by accident.

- **Not a medical record.** It records nutrition, not the chart. No notes, orders, meds beyond
  nutrition, labs beyond what the calculator consumes.
- **Not a prescribing authority.** It computes and prints an order a clinician signs. Every number
  is a clinician's to accept or override.
- **Not a research dataset.** The PDPA lawful basis is Sec 26(6) *medical necessity* — treatment
  processing only. A research or QI export is a **different lawful basis** and needs its own
  conversation, not a new endpoint. See `REFERENCE.md`.
- **Not multi-hospital.** One ward, one Sheet. Nothing in the data model carries a site identifier.
- **Not an analytics product about staff.** See § 6.

## 6 · How we would know it is working

**NeoFeed has no metrics at all today.** Nobody knows how many staff use it. The data to answer the
first question is *already being collected* — `Audit_Log (A–D): ts | action | sessionId | actorEmail`,
written by `logAudit("readRegistry")` on every `getActivePatients`. **What is missing is a read, not
instrumentation.**

| # | Metric | Definition | Status |
|---|---|---|---|
| **M1** | **Weekly active users** | **distinct `actorEmail` in `Audit_Log` per ISO week** | first one to build |
| M2 | Daily log coverage | `logged today ÷ active patients`, the ratio the registry stats strip already computes on screen every render and then throws away | not built |
| M3 | Back-fill rate | share of `Daily_Log` rows whose entry date is before the date they were written — a proxy for whether the tool fits the round or is caught up on later | not built |

**No targets are set, deliberately.** A target invented from a desk is worse than no target; M1's
first month of numbers is what a target should be argued from.

### 🔴 Two constraints that must survive into any implementation

1. **Use distinct `actorEmail` per week, never row counts.** Since `syncFromGAS` began firing on tab
   focus, `Audit_Log` gains a row per user per minute. Row counts stopped measuring usage and now
   measure how long a tab was left open.
2. **`Audit_Log` exists for PDPA Sec 39 accountability, not analytics, and it holds staff email.**
   **Aggregate counts only.** A per-staff ranking turns product analytics into personnel monitoring —
   a different lawful basis, and a different conversation with the ward. If a number could be used to
   ask "why is this nurse's count low", it should not be produced.

## 7 · Constraints that shape every decision

- **Clinical safety first.** A wrong number reaches an infant. Where product convenience and
  arithmetic conservatism conflict, conservatism wins. The open stock-concentration item in
  `BACKLOG.md` § Now is a live example: those four values change the mL printed on every order form.
- **PDPA Sec 26 sensitive personal data.** Lawful basis is medical necessity; there is no consent
  flow, and that is correct — but it means the basis does not stretch to secondary use.
- **No build step is a security property, not just a convenience.** Every non-secret file in this
  repo is effectively public. Nothing secret goes in source; `SPREADSHEET_ID`/`CLIENT_ID` live in
  Script Properties for this reason.
- **Apps Script's ceilings are real product limits** — 6 h is the maximum session TTL `CacheService`
  allows, not a chosen value; `LockService` and `CacheService` eviction are not modelled by any test
  harness we have.
- **Two hand-synced HTML shells.** Any shell change must land in both or they drift silently.

## 8 · Open product questions

Not bugs — decisions nobody has made.

1. **Who owns NeoFeed if Praew stops maintaining it?** It is a live clinical tool with one
   maintainer, no second reviewer, and a deploy identity tied to one Google account.
2. **What is the retention policy after discharge?** Records persist indefinitely today. This is
   both a PDPA gap (`BACKLOG.md`) and an unmade product decision — "how long is this useful for" is
   a product question before it is a compliance one.
3. **Is the ward's real unit of work the infant or the round?** The app is built patient-first; the
   `NEEDS ENTRY` badge hints the actual job is *"get through today's list"*. If so, a round-oriented
   view might beat the registry.
4. 🟡 **Does anyone use the TrendGraph?** It is one of the more expensive things in the codebase.
   M1 tells us if anyone uses the app; nothing tells us which view earns its keep.

---

## Provenance and course link

Reconstructed on 2026-08-21 from `app-walkthrough.md`, `REFERENCE.md`, `CLAUDE.md`, the source, and
the backlog. **A PRD and a product-metrics definition are also sessions 6 and 7 of DigiHealth
`3099706 · Digital Project Management`** — see `Desktop\DigiHealth\00_admin\COURSE_3099706.md`. The
coursework and this file are the same work; that is deliberate, not double-counting.

⚠️ **For any coursework artefact: screenshots come from `data.js`'s mock fixtures, never the live
ward Sheet.** `DigiHealth\` is on OneDrive and no patient data goes there.
