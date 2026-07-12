# NeoFeed V2 — Session Handoff
**Last updated:** 2026-07-12 | **Status:** 🟢 PRODUCTION

---

## Session 2026-07-12 (2) — diagnostic review + correctness/UX fixes (branch `claude/code-review-ux-improvements-k6zyj0`)

Full read-through of every `.jsx`/`.js`/`.gs` file plus a local Playwright rig
(npm-installed React/ReactDOM/Babel served locally, `NEOFEED_GAS_URL` blanked
to exercise the mock-data path — `unpkg.com` is policy-blocked from this
environment, same constraint noted in the 2026-07-11 session). Verified every
fix by driving the actual UI (screenshots + console/pageerror capture) before
and after, not just by reading the diff.

**1. Critical — "Register new session" crashed the whole app.** `registry.jsx`
`NewPatientModal` had a leftover duplicate Thai-labeled Admit-date/DOL block
referencing `dol1`/`setDol1`, state that only exists in the unrelated
`EditPatientModal`. Clicking **+ New session** threw `ReferenceError: dol1 is
not defined` and white-screened the app — **new patients could not be
registered at all** before this fix. Removed the dead duplicate block (the
real admit-date/DOL fields already exist earlier in the same form).

**2. Permanent login lockout.** `gas-backend.gs`'s brute-force counter (5
failed email/password attempts) never expired and was only cleared on a
*successful* login — which a locked-out user could never reach, since the
lockout check ran before the password check. A mistyped password 5x meant
permanent, admin-unrecoverable lockout (fixable only by hand-editing Apps
Script properties). Now time-boxed to a 15-minute cooldown that self-clears.

**3. Weight-measurement data integrity.** `fenton.jsx`'s `MeasurementLogger`
fabricated a weight (duplicated the previous value, or `0` if none existed
yet) whenever a length/HC-only entry was saved for a new DOL, polluting the
Fenton weight chart and the growth-velocity/stale-weight alert math with a
"measurement" that never happened. Now stores `w: null` for those rows. Since
several places assumed `weights[weights.length-1]` was always a weighed
entry, added `D.lastWeighed(patient)` in `data.js` and switched
`PatientStrip`, the registry's WT-NOW column, the Calculator's weight
prefill, and the alert-center/badge-count growth-velocity + stale-weight
logic (`app.jsx`) to use it instead of the raw array tail.

**4. Route mislabeling.** `calculator.jsx` always logged `route` as "TPN
central"/"TPN peripheral" from the IV-access toggle alone, even on a fully
enteral day (`totalTPN_mL === 0`). Now logs "Enteral only" / "NPO" when no
TPN was actually delivered that day.

**5. UX/QOL:**
- Patient rows/cards in `registry.jsx` (table row + mobile card) are now
  keyboard-activatable (Enter/Space), not just mouse/touch-clickable.
- `NewPatientModal`'s Register button is now disabled with an inline hint
  until name, birth weight (>0), and GA are filled in — previously a blank
  or zero birth weight could be submitted and would silently corrupt every
  downstream nutrition calc and Fenton percentile for that patient, plus
  render as `NaN%`/`Infinity%` wherever the weight delta is shown.
- Added a `:disabled` style for `.btn`/`.btn.primary` — there was no disabled
  button styling anywhere in the app (in **both** `NeoFeed.html` and
  `index.html`, kept in sync per the 2026-07-11 CSS-reconciliation note
  below), so disabled buttons looked identical to active ones.

**Reviewed but not changed** (lower confidence / needs clinical sign-off, not
touched this session): `calculator.jsx`'s Glycophos dosing-input direction
(Na is the editable field, P is derived, which a code comment nearby flags as
backwards from clinical convention — needs a clinician to confirm before
changing); `handleSave` has no all-zero-entry guard (lower risk now that
weight is always prefilled from `lastWeighed`/`patient.bw`, never really 0).

---

## Session 2026-07-12 — repo audit + drift cleanup (branch `chore/gas-sync-and-css-fix`, not yet merged)

GitHub review turned up four issues, all fixed on this branch:

1. **CSS drifted again** — despite the 2026-07-11 reconciliation below, `index.html`
   had since fallen behind `NeoFeed.html` again (missing `.reg-stats`/`.reg-filter`/
   `.patient-table` registry styles and trend-graph divider/hover rules). Confirmed
   `NeoFeed.html` still had everything `index.html` uniquely needed (`--toast-bottom`,
   `.admin-stat-tiles`, `.guidelines-grid`, `.alert-summary-tiles`, `.feeding-steps-grid`)
   before replacing `index.html`'s whole `<style>` block with `NeoFeed.html`'s. The
   "collapse to one physical file" follow-up noted below is now overdue — this will
   keep recurring otherwise.
2. **Deployed GAS is behind git** — `deleteDailyNutrition` + `Audit_Log`/`logAudit`
   (from the two 2026-07-11 sessions below) are in `gas-backend.gs` on `main` but were
   **not yet pushed to the live Apps Script project** as of this session. Still needs
   `clasp push` + `clasp deploy` — not done here, needs explicit sign-off since it's a
   live production backend (see `~/nicu-tools/neofeed/`).
3. **Untracked local fix, only in production** — a `backfillLegacyEntryIds()` helper
   existed only as a live Apps Script edit (pushed via clasp 2026-07-09) with no git
   record. Committed to `gas-backend.gs` so git matches what's actually deployed.
4. **Local working copies were duplicated/stale** — there was a second, untracked
   clone nested inside this one (`neofeed/neofeed/`), both behind `origin/main` by
   different amounts. Consolidated to this single directory, now in sync.
   Also merged and deleted a stray unmerged branch, `claude/mobile-readability-
   improvement-79e2kb` — its fixes turned out to already be superseded by later work.

**Still open:** merge this branch, then redeploy `gas-backend.gs` to Apps Script (item 2).

---

## Session 2026-07-11 (2) — back-dated log entries + admin delete-entry

**Correction to the note below:** `NEOFEED_GAS_URL` in `NeoFeed.html`/`index.html`
is **live**, not commented out (and it's a different Apps Script deployment URL
than the one recorded in the TLDR — `AKfycbz8Nt...`, not `AKfycby44D...`). The
"sandbox uses mock data" TLDR line is stale; both shells currently talk to the
real Google Sheet. Screenshots reported by users (e.g. odd-looking DOL 75/69
rows with a weight that jumps backward) are real `Daily_Log` rows, not the
`MOCK_DAILY_LOG` fixture in `data.js` — check the live sheet, not the fixture,
when a user reports a bad entry.

**1. Back-dated log entries:** "บันทึกวันนี้" on the Dashboard now opens a small
picker (`LogDateModal` in `log.jsx`) — today, or a past calendar date (capped at
today). Picking a date computes that date's DOL via the new `D.dolAtDate(patient,
dateStr)` helper in `data.js` (same math as `liveDol`, just at an arbitrary
date) and carries it into the Calculator (`logDate` prop), which stamps the
saved entry's `ts` with the chosen date instead of always defaulting to today
(`app.jsx`'s `handleLogToGAS` now respects `entry.ts` if the caller set one,
same pattern `handleUpdateToGAS` already used).

**2. Admin delete-entry:** there was previously no way to remove a bad
`Daily_Log` row — only add/edit. Added a trash-icon column to the "All
entries" table, visible only when `role === "admin"` (gated in `app.jsx` via
`onDeleteEntry={role === "admin" ? handleDeleteEntry : undefined}`, same
pattern as the existing edit gate) and only for rows that have an `entryId`
(legacy pre-session-8 rows without one still aren't deletable/editable from
the UI). Confirms via `window.confirm` before calling the new
`deleteDailyNutrition` GAS action (admin-only server-side too, permanent row
delete, audit-logged to `Audit_Log`). **You must redeploy `gas-backend.gs`
to the Apps Script editor for this to work against the live sheet** — the
`deleteDailyNutrition` action doesn't exist in the currently-deployed script.

Verified end-to-end (date picker → correct DOL → correct `ts` on the saved
row → delete button appears/hides by role → row removal) with a local
Playwright rig against vendored React/ReactDOM/Babel (unpkg unreachable from
this environment, same as noted below) and `NEOFEED_GAS_URL` blanked out to
exercise the local mock-data path.

---

## Session 2026-07-11 — mobile UX pass + index.html/NeoFeed.html CSS reconciliation

**Growth chart percentile labels** (`fenton.jsx`): the right-edge 3rd/10th/50th/
90th/97th labels were getting clipped against the SVG's right edge and, when
curves converge near term, nudged up past the plot's top edge — worst on
narrow phones. Fixed: `pad.r` widened (28→42 px in SVG coordinate space),
label font trimmed slightly, and `percentileLabelYs` now clamps the whole
stack back down if it climbs above the plot area. Also gave the chart's
`card-h` (title + Weight/Length/HC segmented control) a wrap fix — it was
overlapping on phones exactly like the Calculator's Step 2 header did
before that got `.step2-card-h`/`.step2-ctrl`; Fenton now has the same
pattern (`.fenton-card-h`/`.fenton-ctrl`).

**Important, non-obvious finding:** `index.html` and `NeoFeed.html` are two
separate static shells that both load the same `.jsx`/`.js` modules but each
embed their **own copy of all the CSS** in a `<style>` block — and those two
copies had drifted apart over many sessions, each accumulating fixes the
other never got (e.g. `index.html` was missing `.trend-latest`/`.calc-save-bar`/
`.bnav-badge` mobile styling entirely; `NeoFeed.html` was missing the
`.fenton-grid` mobile stack, `.admin-stat-tiles`/`.guidelines-grid`/
`.alert-summary-tiles`/`.feeding-steps-grid` base styles, Android EN-grid/
step-header-wrap fixes, and `--toast-bottom` — meaning toasts sat behind the
bottom nav on `NeoFeed.html` specifically). **GitHub Pages serves whichever
file is at the repo root as `index.html`** — i.e. `index.html`, not
`NeoFeed.html`, is what a bare-domain visit actually renders, despite the
walkthrough calling `NeoFeed.html` canonical. Both files' `<style>` blocks
were reconciled to the union of fixes in this session (verified brace-balanced
and functionally equivalent via diff). **Going forward: any CSS change must be
applied to both files' `<style>` blocks, or this will silently drift again.**
Worth a follow-up to collapse this to one physical file (e.g. make
`index.html` a redirect, or extract the CSS to a shared `.css` file) rather
than keeping two hand-synced copies.

Verified on emulated iPhone (390×844) and Android (393×851) viewports with a
local Playwright rig (vendored React/ReactDOM/Babel-standalone + mock data,
since `unpkg.com` and the live GAS backend aren't reachable from this
environment) — Registry, Dashboard/TrendGraph, Growth chart, and Calculator
all render correctly post-fix on both files.

---

## TLDR — read this only
- **Canonical:** `NeoFeed.html` (React 18 CDN + Babel) — open this
- **GAS URL:** `https://script.google.com/macros/s/AKfycby44DAIfEueeGj_XSKCyWEWmgr46WjP-vKFEGnDhZSr2_q0KdyO8O5CBxY2qqdoNkoN/exec` — currently **commented out** in `NeoFeed.html` line ~960 (sandbox uses mock data). Restore for production.
- **Sheet schema CHANGED in session 8:** Daily_Log now has 16 columns (A–P). If you redeploy `gas-backend.gs`, you must add `ca | p | enVolPerKg` columns before the existing `route | status | submittedBy` cols, OR clear the sheet so the script re-creates headers.
- **No open bugs.** Mobile-first polish done.
- **Next (optional):** discharge workflow · drug compatibility · Buddhist calendar in Edit modals

---

## Session 8 changes (2026-05-25)

### New features
1. **TrendGraph** in Daily log — single-metric trend with target band shading, metric chips (Energy / Protein / GIR / Fluid / Na / K / Ca / P / Weight), X-axis toggle (Admit day ↔ DOL), smooth Catmull-Rom curve, hover crosshair + tooltip
2. **PN/EN dynamic targets** — TrendGraph picks `ENTERAL_TARGETS` when an entry's `enVolPerKg ≥ 100`, else `TPN_TARGETS(dol)`. PN/EN badge shown next to target value (blue / green)
3. **Live DOL** — single helper `liveDol(patient)` in `data.js` (admit date + days since). Used everywhere: PatientStrip, Calculator, Registry table, Fenton MeasurementLogger
4. **GA / PMA in WW+D format** — stored as `WW.D` shorthand (e.g. `28.1` = 28 wk 1 d). `fmtGA(ga)` → `"28+1"`. `parseGAInput("28+4")` accepts both `28+4` and `28.4`. Days digit clamped to 0-6
5. **Thai BE date format** — `fmtDate("2026-05-15")` → `"15 พ.ค. 2569"`. Exposed via `window.NEOFEED_FMT_DATE`
6. **Stale-weight alert** — warn at 3+ days, crit at 7+ days since last weight entry
7. **Calculator prefill** — full input state persisted to `localStorage[neofeed_calc_<sessionId>]` on submit/draft. Restored on patient switch with blue "Prefilled from previous submission (DOL X)" banner
8. **Smart defaults Step 1** — current weight prefilled from latest stored weight; target fluid prefilled from ESPGHAN midpoint for DOL+BW
9. **Feed-type dropdown reorder** — BM → FBM with HMF → Preterm Formula 20/22/24 → FBM↔Infatrini → Infatrini → LF 20/24/27. Brands merged into generic LF (HiQ + Enfalac averaged in `EN_DB.LF_*`)

### UX polish
- Login screen REMOVED — app skips straight to registry with stub Local user. To restore: `app.jsx` line ~220 flip `if (false)` → `if (!user)`
- Calculator opens with only Step 1 expanded (was Steps 1+2)
- Step 4 collapsed summary hides "ยังไม่ได้ตั้ง" placeholder when no enteral set
- Shell scroll fixed: `.app` is `height: 100dvh + overflow: hidden`, only `.work` scrolls (topbar + bottom-nav stay pinned)
- Δ vs prev in TrendGraph hidden when either value is 0 (route-change noise)
- Route stopped indicator shows when going non-zero → 0

### Mobile QOL (session 8 final pass)
- **Registry on mobile** = card list (each patient = tappable card with name+status, bed+GA/BW/DOL, diagnosis, Wt+Δ, Edit/Open). Desktop keeps the table
- **Patient strip on mobile** — Identity row spans full width on top, other 4 cells in 2×2 below
- **TrendGraph chips** — horizontal-scroll with snap on mobile, larger 38-44px tap targets, pill style with color-dot indicator
- **TrendGraph stats row** — vertical dividers between Latest / Target / Δ on desktop; 2-col grid stack on mobile (Latest spans full width)
- **X-axis seg** — compact pill-style (28px tall, 6px radius) using `.trend-xaxis-seg` class. Labels shortened: "Admit day" / "DOL"
- **Alert rows** stack on mobile (Acknowledge button full-width below)
- **Calculator save bar** sticky on mobile (above bottom nav)
- **Bottom-nav badge** positioned next to icon (top:4, left: 50%+6) — no center overlap
- **Modal safe-area** padding (iOS bottom inset)

### Logged data (per Daily_Log entry)
Now captures combined PN+EN totals:
`{ dol, weight, fluid, gir, pro, kcal, na, k, ca, p, enVolPerKg, route, status }`

Where `enVolPerKg` drives target picker. `pro/kcal/na/k/ca/p` are per-kg combined PN+EN.

---

## File inventory

```
NeoFeed.html      App shell + all CSS (oklch design system)
data.js           Clinical data — ESPGHAN/WHO targets + formulas + helpers (liveDol, fmtGA, pmaShort, gaToDecimalWeeks, parseGAInput)
calculator.jsx    TPN + EN calculator (Steps 1–5) + prefill from localStorage
app.jsx           Nav rail, patient registry routing, fmtDate (Thai BE), AlertCenter, BottomNav
fenton.jsx        Fenton 2013 growth chart + MeasurementLogger
log.jsx           Daily nutrition log + TrendGraph (pickTarget for PN/EN)
registry.jsx      Patient registry — mobile card list + desktop table
icons.jsx         SVG icon library
tweaks-panel.jsx  UI customization
gas-backend.gs    Apps Script backend (Daily_Log schema extended A–P)
```

---

## GA/PMA convention (NEW)

**Storage:** `ga` is a number in `WW.D` shorthand:
- `26.4` = 26 weeks + 4 days
- Integer part = weeks, first decimal digit = days (literal 0–6)
- `28.1` is **28+1**, not "28.1 weeks decimal"

**Display:** Always go through `D.fmtGA(ga)` → `"W+D"` string
**Math:** `D.gaTotalDays(ga)` for day math; `D.pmaShort(ga, dol)` for PMA
**Plotting (Fenton):** `D.gaToDecimalWeeks(ga)` for true decimal x-axis
**Input parsing:** `D.parseGAInput(str)` accepts `"28+4"`, `"28.4"`, `"28"`; clamps days 0–6

The HMF threshold `patient.ga < 32` still works because all valid values stay under integer 32.

---

## Restore production checklist

When ready to redeploy:

1. **`NeoFeed.html` line ~960** — uncomment the `NEOFEED_GAS_URL` line (production URL preserved as comment)
2. **`data.js`** — remove the test patient `TT-BW900-A` from `MOCK_PATIENTS` and `MOCK_DAILY_LOG` if you don't want it as a permanent fixture. (It's labelled `// Test fixture` in the file.)
3. **`gas-backend.gs`** — paste into Apps Script editor. Clear `Daily_Log` sheet (or add `ca, p, enVolPerKg` columns at positions K, L, M) — the script will re-write headers on next run.
4. **Restore LoginScreen** if desired — `app.jsx` line ~220: `if (false)` → `if (!user)`. Stub user fallback at line ~25 can stay or be removed.

---

## Known caveats

- **GAS Unauthorized** no longer redirects to login (shows error toast instead). Restore login behavior in `app.jsx` line ~145 if needed.
- **`enVolPerKg`** is logged on new submissions but legacy log entries (pre-session-8) lack this field — they default to PN targets.
- **Mobile Fenton chart** retains pan/zoom but the SVG width-760 layout works because of `width: 100%; height: auto`.

---

## Thai PDPA compliance posture

This app processes infant health data — "sensitive personal data" under PDPA
Sec 26. What's in place and what's still open:

**Lawful basis:** Sec 26(6) medical necessity + professional confidentiality
(documented at the top of `gas-backend.gs`). No separate consent flow —
consistent with the exemption, but only covers *treatment* processing, not
secondary uses (e.g. research/QI exports) if those are ever added.

**Data subject rights implemented:**
- *Erasure/pseudonymization* — `pseudonymizePatient()` in `gas-backend.gs`,
  admin-only, triggered via `action: "pseudonymizePatient"`. Clears name,
  initials, dob from Patient_Registry; retains de-identified clinical history
  (bw/ga/diagnosis/weights) for the hospital's own medical-record retention
  duty. **Residual risk:** `sessionId` is generated as
  `initials+BW+twinSuffix` (see `data.js`), so it's a pseudonym, not
  anonymous — staff present at admission can still reverse-map it on a small
  census. Erasure does not (and structurally cannot, without breaking every
  Daily_Log join) scrub that pattern from an already-issued sessionId.
- *Access/rectification* — no self-service path yet; handled manually via
  admin editing the registry. Worth a real endpoint if request volume grows.

**Accountability (Sec 39):** `Audit_Log` sheet (auto-created by
`getSheetAudit()`) records registry reads and erasures with actor email +
timestamp — persists past Apps Script's 7-day execution-log window.

**Data minimization:** `handleLogout()` in `app.jsx` clears
`neofeed_calc_*`/`neofeed_acked_*` localStorage keys on logout, since those
hold per-patient clinical inputs (weight, fluids, labs) and NICU workstations
are typically shared devices.

**Open items / not addressed here:**
- *Cross-border transfer (Sec 28):* data lives in Google Sheets/Apps Script —
  verify Google Workspace's DPA/SCC coverage is adequate for the org's data
  location requirements; not evaluated as part of this change.
- *Password hashing:* `hashPwd()` is single-round SHA-256 + per-user salt —
  fine against casual DB browsing but not iterated/memory-hard. Apps Script
  has no native bcrypt/Argon2; would need a manual PBKDF2 loop over
  `Utilities.computeHmacSha256Signature` if strengthened.
- *Retention policy:* no automatic purge after discharge — records persist
  indefinitely in the sheet today.
