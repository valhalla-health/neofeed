# NeoFeed V2 — Session Handoff
**Last updated:** 2026-08-11 | **Status:** 🟢 DEPLOYED · the Intake/Output + edit-lock backend went live as **`@45`** on the existing deployment `AKfycbz8Nt…` (see session 2026-08-10 (2) below). Verified by pulling the script project back down and diffing it against `main` — identical — and by confirming GitHub Pages serves `calculator.jsx?v=io-balance1`. **Confirmed working in production on 2026-08-10**: a real Calculator save was checked in the sheet and AC–AE populate. `applyLogHeaderColumns()` was also run that day from the editor as `peeraporn.po@chula.ac.th`. (Header labels are cosmetic regardless — those columns are read and written by index, not by name.)

**TPN calculator:** the KCMH-worksheet alignment + overfill Factor (session 2026-08-06 below) is merged to `main` and live — frontend only. Its four corrected stock concentrations change the mL printed on every order form. Open item: Na acetate (3 mEq/mL) and KCl (2 mEq/mL) were *inferred* from the worksheet's divisors, not from an explicit strength label — worth confirming against the shelf.

---

## Session 2026-08-12 — Urine output field reverted to mL/day entry (frontend only)

Reverts the *entry direction* of the "Urine output" field the 2026-08-10 (5)
session set up. That session made the field an mL/kg/h **entry**, converting
to raw mL/day only for the hint underneath. Explicit request this session:
enter the field in **mL/day**, and derive/display mL/kg/h as the hint below —
i.e. back to the direction PR #41 (2aead3b) originally had, but keeping this
repo's naming (`ioOutputPerKgH`) and the drain-explicit Balance formula from
2026-08-10 (5), neither of which this change touches.

`calculator.jsx`, one field:
- `NumField label="Urine output"` now `unit="mL/d"`, `value={ioOutput}`,
  `onChange={setIoOutput}` directly (no rate→volume conversion on input),
  `hint` now shows `${fmt(ioOutputPerKgH, 2)} mL/kg/h` (derived, 2dp) instead
  of the raw mL/day figure.
- `ioOutput` state, the `Daily_Log` column it's written to, and
  `ioOutputPerKgH`'s derivation formula are all unchanged — this is a
  display/entry-direction swap only, no schema or backend impact.
- Comments near the Intake/Output block (state derivation, JSX, and the
  `handleSave` entry payload) updated to describe mL/day as the entered
  value and mL/kg/h as the derived one.

Cache-bust bumped: `calculator.jsx?v=io-urine-mld1` in both `NeoFeed.html`
and `index.html`.

**Not verified in a live browser** — same standing caveat as prior
source-only sessions in this environment (no route to a live GAS deployment
or a real browser here). Worth a quick manual check that typing an mL/day
value and watching the mL/kg/h hint update looks right, and that saving
still round-trips (`ioOutput` is unchanged in shape, so this should be a
non-event on the backend side).

---

## Session 2026-08-11 — removed auto-select-a-patient-on-open (branch `claude/frame-color-blue-white-1uj864`)

Reported as "ทำไมมัน auto เลือกคนนี้ตลอด" (why does it always auto-select this
patient) — every fresh app load, and every GAS resync where the previously
active patient wasn't in the fresh data, silently landed the user on
`data.patients[0]`: whatever row happened to be first in the `Patient_Registry`
sheet (row order, unrelated to the bed-sorted order the registry displays).
On a shared NICU workstation that's a real mix-up risk, not just a UI quirk.

- `app.jsx`: `activeId` now always initializes to `null` (previously
  `MOCK_PATIENTS[0].sessionId` in local/mock mode) — the app opens on the
  registry list with nobody selected.
- `syncFromGAS`'s patient-list handler no longer falls back to
  `data.patients[0].sessionId` when the current `activeId` isn't in the
  fresh data; it now falls back to `null` (back to the registry list)
  instead of silently jumping to an arbitrary patient.
- Bed-number sort (`registry.jsx`'s `bedSort`, used by both the registry
  list and `PatientPicker`) was already correct — numeric-aware
  `localeCompare` naturally orders `1, 2, 3, …, iso 1-2, iso 2-1` — so no
  change was needed there; confirmed with a quick Node repro.

---

## Session 2026-08-10 (5) — Calculator delete button + urine-output rate entry (frontend only)

**Supersedes the urine-output edit from the parallel session below** (the one
that renamed the edit-session nickname label and touched `calculator.jsx`
without a HANDOFF entry, merged to `main` as `2aead3b`/PR #41): that session
only relabeled the field to "Urine output" and changed its **hint text** to
mL/kg/hr, while leaving the actual input still raw mL/day and Balance still
`Input − Output` (gross, drain not subtracted). This session's version, below,
makes the field itself an mL/kg/h **entry** (not just a relabeled hint) and
fixes Balance to subtract drain explicitly — resolved in `calculator.jsx`'s
favor of this session's implementation when merging the two, since it's the
one that actually satisfies "change the unit to mL/kg/h" rather than just the
display hint next to an unchanged mL/day field.

Four requests, all landing in `calculator.jsx` (plus small prop-threading in `app.jsx`):

**1. Delete button in the Calculator itself.** The Dashboard already had a
per-row delete (trash icon + `window.confirm`, admin-only) — this adds the
same capability directly inside the Save + Copy Order card, so an admin
editing an entry doesn't have to leave the Calculator to remove it. Shown
once the open entry actually exists on the server (`savedEntryId` — true both
when editing an existing row and right after a brand-new entry's first save
in the same visit), gated to `role === "admin"` exactly like the Dashboard's
icon, and gated behind `window.confirm()` before it fires — no bypass path.
Wired as `Calculator`'s new `onDelete` prop, threaded through `CalculatorView`
(`app.jsx`) from the same `handleDeleteEntry` the Dashboard already uses, and
navigates back to the log view on success.

**2. "Prefilled from last save" — already existed, verified not re-broken.**
The Calculator already restores the full form (including the Intake/Output
card) from the most recent `Daily_Log` entry (`baselineEntry`) or, absent
that, from `localStorage["neofeed_calc_<sessionId>"]` — both predate this
session (2026-08-10 (1) below). No code change needed here; called out
because the request re-raised it and it's worth confirming this still covers
the renamed/reunited urine-output field (it does — `ioOutput` itself didn't
change shape, see #3).

**3 & 4. Output field renamed to urine output, entered as mL/kg/h, and
Balance now subtracts drain explicitly.** Two related asks, one root cause:
the 2026-08-10 (2) session had defined `ioOutput` as the bedside **total**
output (drain included), netting drain out only for the per-kg *display*.
That's no longer true — the "Output" field is now **urine output only**, and
drain is always its own term. Concretely:
- Field relabeled "Urine output", entered/displayed directly as a **rate**
  (mL/kg/h, the number actually judged against the 1–3 mL/kg/h target)
  instead of a raw mL/day total — `ioOutputPerKgH` in `calculator.jsx` is a
  pure display/conversion layer; the underlying state (`ioOutput`) and the
  `Daily_Log` column it's written to are unchanged in shape (still raw
  mL/day), so no backend/schema change was needed. The hint under the field
  now shows the equivalent raw mL/day instead of a per-kg/day figure.
- **Balance = Input − Output(urine) − Drain**, both output and drain
  subtracted explicitly now that Output no longer folds drain in. (This is
  arithmetically back to what 2026-08-10 (2) deliberately moved *away* from,
  under the old "Output already includes drain" premise — that premise no
  longer holds once Output is redefined to mean urine only, so the same
  gross-vs-net argument now points the other way.)
- `ioNetOutput` (the old drain-netting helper) is gone — no longer needed
  since Output never contains drain to net out of in the first place.

**Caveat worth carrying forward, not fixed here:** the `Daily_Log` `ioOutput`
column's *meaning* changed in place — rows saved before this session recorded
the old "total incl. drain" figure; rows saved after mean "urine only." There
is no version marker distinguishing them (same class of gap `app-walkthrough.md`
now flags at the field's definition). Given the field existed for exactly one
day (added 2026-08-10 (1), same day as this redefinition) the live-data
exposure is minimal, but don't assume historical `ioOutput` values are
urine-only if this repo is ever revisited with real accumulated data.

**Verified**, not just read: wrote a scratch jsdom harness (same pattern as
`test/verify-kcmh-factor.cjs` — real `<Calculator>` mounted via Babel +
jsdom, not committed per this repo's `test/` convention of worksheet-fidelity
checks only) covering: no delete button before first save; urine output
2 mL/kg/h at a 1000 g divisor converts to 48 mL/d; Balance reads +42 for
Input 100 / Output 48 (from 2 mL/kg/h) / Drain 10; delete button appears once
`savedEntryId` is set; a declined `confirm()` does not call `onDelete`; an
accepted one calls it with the right `entryId`. All 6 checks passed. Pre-
existing harnesses (`verify-targets-and-dates.cjs`, `verify-kcmh-constants.cjs`,
`verify-kcmh-factor.cjs` at both `DEAD=0` and `DEAD=20`) still pass unchanged,
confirming this session didn't regress the TPN/EN or Factor math. **Not
verified**: no route to a live GAS deployment or a real browser from this
environment — same standing caveat as every prior source-only session. This
session touched no backend fields (the `Daily_Log` `ioOutput` column shape is
unchanged), so there's nothing new to deploy server-side, unlike 2026-08-10 (2).

Cache-bust bumped: `calculator.jsx?v=io-urine-rate1`, `app.jsx?v=calc-delete1`
in both `NeoFeed.html` and `index.html`.

---

## Session 2026-08-10 (4) — Fenton chart axis clamped at 42 weeks

Praew's decision on the open question from session (3): rather than source
replacement values for GA 44–50, **stop the chart at 42** — the last week the
Fenton 2025 reference actually covers.

- `fenton.jsx` now has a single `GA_MAX = 42` constant driving the domain
  (`xMax`), the tick list, and a `.filter(r => r[0] <= GA_MAX)` on the dataset.
  Raising it back is a one-line change *if* the post-term rows are ever
  sourced — the constant is the whole switch.
- The GA 44–50 rows are **still in `data.js`**, flagged in-code, just no longer
  plotted. Deleting them would have thrown away the only record of what was
  there; leaving them unflagged was the original problem.
- Applies to all three metrics. `FENTON_LENGTH`/`FENTON_HC` lose their 46/50
  rows from the plot too, which is consistent — those were never verified
  either (see session (3)).

**An infant past 42 weeks PMA now sees a warning, not a silent gap.** The old
code filtered points to `pma <= xMax` and said nothing; with the axis at 50
that rarely bit, but at 42 it would routinely hide the most recent measurement
on exactly the long-stay infants under closest watch. `points` is now derived
from `allPoints`, and `hiddenPastMax` drives a Thai banner above the chart
naming how many measurements are not shown and why. A chart that looks
complete while hiding the newest point is worse than one that admits the gap.

Verified: `fenton.jsx`, `calculator.jsx` and `app.jsx` all parse clean through
esbuild; `data.js` through `node --check`; both HTML shells bumped to
`fenton.jsx?v=ga-clamp42` and confirmed identical.

---

## Session 2026-08-10 (3) — Fenton 2025 verified against source; weight table refreshed to weekly resolution

The "is `fenton.jsx` really Fenton 2025, or carried-forward 2013 data?" caveat
had been open in this file since 2026-07. Praew supplied the reference tables
(LMS + percentiles, GA 22–42, from her BPD sandbox) and it is now settled.

**The label is correct — the suspicion was wrong.** Reconstructed all five
centile curves from the reference and compared every cell of `FENTON_WEIGHT`:
p3/p10/p90 reproduce the published integers **exactly** (0 g on all of them,
both sexes), p50 matches the LMS median `M`, and p97 — which the reference
table doesn't carry, so it was recomputed from L/M/S via
`X = M(1 + LSZ)^(1/L)` — landed within ±2 g. That residue was rounding.
`FENTON_WEIGHT` is genuinely the third-generation 2025 data. **Close that
open item.**

**Refreshed to the source's own resolution.** The table stored even weeks
only and `fenton.jsx` linearly interpolated the odd ones at render time, even
though the reference publishes all 21 weekly rows — so the interpolation was
avoidable error, worst case **56 g at girls GA 41**, which is exactly where a
borderline SGA call sits at term. GA 22–42 now carries every week.
Re-verified after the edit: **210 cells, 0 g discrepancy.**

**Still open — percentiles past 42 weeks.** The eight rows at GA 44/46/48/50
are outside the Fenton reference entirely. The header in `data.js` attributes
them to "WHO Growth Standard 2026", so they are not unsourced — but **every
value in them is a multiple of 10**, which is not what an LMS-derived table
produces (contrast the precise values below 42), and that attribution has not
been verified. This matters more than it looks: `fenton.jsx` sets `xMax = 50`
with ticks at 46 and 50, so the region of the chart backed by the weakest data
is precisely where long-stay BPD infants are plotted. Left in place and
flagged in-code rather than changed, because the fix is a clinical decision —
source real values, or clamp the axis at 42 and stop drawing curves the data
doesn't support.

**Also unverified: `FENTON_LENGTH` and `FENTON_HC`.** Only weight reference
data was available. Both of those are stored at **4-week** steps (22, 26, 30,
…) — coarser still than weight was — and carry the same "Fenton 2025"
attribution, which nobody has checked. Worth the same exercise if the length/
HC reference tables can be exported.

Method note for whoever repeats this: the first two comparison runs produced
nonsense (a "4605 g discrepancy") because the extractor over-ran the
`FENTON_WEIGHT` block into `FENTON_LENGTH`/`FENTON_HC` and compared cm against
g, then over-ran `boys:` into `girls:`. If a growth-table diff reports large
systematic errors, suspect the parser before the data.

---

## Session 2026-08-10 (2) — review of the Intake/Output work, two fixes, and the backend deploy (`@44` → `@45`)

Praew asked for a check of the I/O + data-log feature merged earlier the same
day (PR #39, session below), on the grounds that it "needs the GAS backend
also". It did — and the review turned up two problems before it went live.

**The feature was inert, not broken.** The frontend had already shipped to
GitHub Pages, but the live Apps Script deployment was still `@44`. An old
backend silently ignores the extra properties on the `entry` object and
returns `"Unknown action"` for the lock, which `useDailyLogLock` deliberately
swallows — so staff could fill in the Intake/Output card and watch it save
with no error while all three values were discarded. Worth remembering as a
failure mode: **this feature pair fails silently, not loudly.**

**1. Fluid balance credited drain instead of debiting it (clinical).**
`calculator.jsx` had `ioBalance = ioInput - ioNetOutput`, where
`ioNetOutput = ioOutput - drainContent`. Netting drain out is correct for the
*per-kg display* — that is what makes it read as urine output against the
1–3 mL/kg/h target — but feeding the same figure into Balance removes drain
losses from the balance entirely. An infant with a chest tube draining
50 mL/d read **+50 mL/d more positive than reality**. Confirmed with Praew
that the bedside "Output" total already includes drain, so Balance now uses
gross output (`ioInput - ioOutput`) and `ioNetOutput` is retained solely as
the per-kg divisor input. The formula was wrong under *either* reading of the
Output field, which is what flagged it.

**2. `Daily_Log` AC–AE headers could never appear on the live sheet.**
`getSheetLog()` writes the full A–AE header row only when it *creates* the
tab, and Daily_Log has existed since 2026-05 — the identical gap that
`ensureStaffHeaderColumns` was written for. Added `ensureLogHeaderColumns` /
`applyLogHeaderColumns` on the same pattern (dry-run by default, never
clobbers an occupied header cell, safe to re-run), with one addition: it
grows the sheet **grid** to 31 columns before labelling.

**3. Then made the grid widen self-healing anyway.** `updateDailyNutrition`
writes `sheet.getRange(i + 1, 1, 1, row.length)` where `row.length` is now 31
(24 + 4 + 3). On a Daily_Log still 28 columns wide that range is out of
bounds and **throws** — reaching the bedside as a failed save when *editing*
an existing entry. Since `ensureLogHeaderColumns` is a manual one-off, the
edit path would have been load-bearing on a migration nobody had necessarily
run, so `updateDailyNutrition` now widens the grid itself when it is too
narrow. No-op once wide enough. This is why the header migration is now only
cosmetic — but see the caveat about unlabelled columns in
`ensureStaffHeaderColumns`'s comment, which applies here too.

**Deploy.** `clasp push`, then
`clasp deploy --deploymentId AKfycbz8Nt…` → **`@45`**. Verified three ways:
`clasp pull` into a scratch dir diffed byte-identical against `main`'s
`gas-backend.gs`; `list-deployments` shows `AKfycbz8Nt…` at `@45`; and the
live Pages HTML serves `calculator.jsx?v=io-balance1`.

**Two things worth carrying forward:**
- The migration could not be run from this session — the Apps Script editor
  raised an **"Authorization required"** OAuth consent, which is the user's
  to grant. Praew ran `applyLogHeaderColumns` herself, signed in as
  `peeraporn.po@chula.ac.th`.
- The manifest sets `"executeAs": "USER_DEPLOYING"`, so the live web app runs
  as whoever **cut the deployment**, not whoever is signed into the editor.
  Deploying through `clasp` keeps that identity stable. **Using the editor's
  blue Deploy button while signed in as a different Google account would
  switch the executing identity and probably break sheet access** — a trap
  worth avoiding given more than one account now has editor access.

Commits: `986ecb1` (balance + `ensureLogHeaderColumns`), `2b7d2a4` (on-demand
grid widen). Both on `main`; clasp mirror `~/nicu-tools/neofeed` synced.

---

## Session 2026-08-10 — duplicate-date guard + edit-in-progress notice, Calculator Intake/Output card (branch `claude/duplicate-date-volume-calc-t2az3p`)

Two requests from ปภาวี (Neonatology, KCMH), both scoped via `AskUserQuestion` before implementing (Calculator Step 1 for the card, editable-not-read-only Input, lightweight auto-expiring lock):

**1. Duplicate-date guard + "someone else has this open" notice.**
- `app.jsx`'s `startAddToday` now checks `log[activeId]` for an existing entry
  whose `ts` matches the requested date before opening a blank Calculator. If
  one exists, it redirects into editing that entry instead (`startEditEntry`)
  with an explanatory toast — a patient can no longer get two `Daily_Log` rows
  for the same calendar date via the Dashboard's "New log" button.
- New `CalculatorView` component (`app.jsx`) wraps `<Calculator>` and the page
  header; it was split out of what used to be an inline IIFE in `App`'s JSX
  specifically so its new `useDailyLogLock` hook has a clean, independently-
  mounted component to run in (calling a hook inside a conditionally-executed
  IIFE inside `App` would have violated the rules of hooks the moment `view`
  changed).
- `useDailyLogLock` acquires a short server-side lock when the Calculator
  opens for a patient+date (`gas-backend.gs`'s new `acquireLogLock` action,
  `CacheService`-backed, `LOG_LOCK_TTL_SECONDS = 90`), heartbeats it every 45s
  while mounted, and releases it on unmount. **Deliberately courtesy-only, not
  a hard block** (per the user's chosen option): if someone else holds the
  lock, the form still opens — a warning banner just names who. The lock
  can never need manual clearing because CacheService's own TTL is the only
  expiry mechanism (no stored timestamp to compare against) — a crashed tab
  or closed browser self-heals in ≤90s. The actual protection against a lost
  edit is unchanged: `updateDailyNutrition`'s existing `expectedLastModified`
  optimistic-concurrency check, which already surfaces a conflict banner in
  `calculator.jsx` at save time.

**2. Calculator Step 1 — new "Intake / Output" card.**
Sits directly below the Fluid plan card (not inside its accordion — always
visible, no toggle). Three fields, each mL/day with a "(X mL/kg/d)" hint
underneath, per the request:
- **Input** — defaults to `calc.prescribedFluid` (the same "Prescribed"
  figure Step 1 already computes: TPN bag + lipid + other IV + drug volume +
  counted EN) and keeps tracking it live as those change, until the user
  edits the field directly (`ioInputTouched`) — same "live default, sticky
  once touched" pattern the rest of the wizard already uses for its smart
  prefills (e.g. weight/fluid-target restore). This was the specific
  trade-off requested: pull from the computed total, but stay editable.
- **Output** — plain manual entry, no computed default (a bedside-measured
  number).
- **Drain content** — same shape as Output. When >0, it's subtracted from
  Output *before* Output's own per-kg/day hint is derived — the raw Output
  mL/day field is left exactly as entered; only the per-kg/day figure nets
  it out (`"120 mL/kg/d · net of drain"` in the hint once drain > 0).

Per-kg/day divisor for all three fields: `D.ioDivisorG(patient, dol)`
(new helper, `data.js`) — the previous day's weight
(`D.weightAtOrBeforeDol`), or **birth weight** if that weight is still below
birth weight (i.e. the infant hasn't regained it yet), per KCMH bedside
convention. A small balance line (`Input − net Output`) under the three
fields also names which divisor applied ("birth weight" vs "previous day").

**Data model / backend.** `entry.ioInput`/`ioOutput`/`drainContent` (raw
mL/day) are now written to `Daily_Log` — three new columns appended at the
**end** (AC–AE), not inserted mid-row, per the existing column-layout
convention (`_ioLogFields()` in `gas-backend.gs`, referenced from both
`logDailyNutrition` and `updateDailyNutrition`). Per-kg/day is intentionally
**not** stored — it's re-derived from the raw mL and the patient's current
weight history on every render, so it stays correct even if a historical
weight gets corrected later.

**Verified**, not just read: `test/verify-targets-and-dates.cjs` and
`test/verify-kcmh-factor.cjs` (both pre-existing) still pass unchanged
against a real jsdom-mounted `<Calculator>` — confirms this session's changes
didn't regress the TPN/EN math. Wrote an additional scratch jsdom harness
(not committed — this repo's `test/` convention is worksheet-fidelity checks,
and this isn't one) driving the real `<Calculator>` through the DOM: Input
auto-fills from prescribed fluid, re-syncs on further changes, freezes once
manually edited; Output's per-kg hint nets out drain content while the raw
mL value stays untouched; birth-weight-floor divisor applied correctly for a
patient still below birth weight. All 8 checks passed. `app.jsx`/`log.jsx`/
`calculator.jsx`/`registry.jsx`/`fenton.jsx` and `gas-backend.gs` all
transpile/parse cleanly (Babel + `node --check`). **Not verified**: no route
to a live GAS deployment or a real browser from this environment, so the
lock's actual cross-session behavior (two real browser tabs) and the new
Daily_Log columns landing correctly in a live Sheet are unverified beyond
the jsdom/unit level — same standing caveat as every prior source-only
backend session in this file.

Cache-bust bumped: `data.js?v=io-divisor1`, `calculator.jsx?v=io-card1`,
`app.jsx?v=dup-date-lock1` in both `NeoFeed.html` and `index.html`.

**Still needs**, same as every backend-touching session: someone with Apps
Script editor access must `clasp push && clasp deploy` (or paste
`gas-backend.gs` into the editor) against the live project before
`acquireLogLock`/`releaseLogLock` or the new `Daily_Log` columns do anything
in production — until then the frontend's lock-check fails open (see
`useDailyLogLock`'s "fails open" comment) and the Intake/Output fields simply
won't persist server-side, without breaking anything else.

---

## Session 2026-08-06 (3) — Step 6 Ca:P summary: total ratio silently lost a decimal (branch `claude/android-ios-walkthrough-elbagm`)

**User report (screenshot):** in the "สรุป Ca · PO₄ · Ca:P ratio" table added in the
2026-07-31 (2) session, the two source rows read `1.72` and `1.67` (2 decimals) but
the `รวมทั้งหมด` (total) row read `1.7` — one fewer digit than its neighbors in the
same column, right below a Phosphate tile visibly over its target range. Reproduced
exactly: TPN Ca 80/PO₄ 47 → 1.72, Oral Ca 50/PO₄ 30 → 1.67, total Ca 130/PO₄ 77 →
displayed **1.7**, not 1.70.

**Root cause:** `fmt(n, d)` in `calculator.jsx` rounds to `d` decimals but returns
`String(r)` on the rounded *number* — and `String(1.70)` is `"1.7"` in JS, since a
trailing zero isn't part of the numeric value. `fmt(x, 2)` on 1.72/1.67 (no trailing
zero to lose) looked fine; the total happened to round to a clean `x.x0` and silently
dropped a digit of precision versus the rows next to it. Same bug, same pattern
(`Number(n.toFixed(d)).toString()`), was also present in `PrintOrderForm`'s local
`f()` helper for the identical three Ca:P cells on the printed order form.

**Fix:** `fmt()` gained a third `keepZeros` param — `false` keeps the existing
strip-trailing-zero behavior everywhere it's relied on (mg/kg values, mL/day, etc.),
`true` uses `.toFixed(d)` for values that are compared side-by-side at fixed
precision. Applied `keepZeros=true` (or an equivalent direct `.toFixed(2)`, in the
three `isFinite && >0`-guarded print-form cells that don't need `fmt`'s Infinity/null
handling) everywhere a Ca:P mass ratio renders: `CaPRow` (the summary table),
both `Tile`s showing a 2-decimal Ca:P ratio (Step 4's TPN+EN-only tile too, for the
same reason — it's the same class of value even though this report was about Step 6),
the two Ca:P alert bodies, the clipboard/plain-text summary, and `PrintOrderForm`.
Nothing else changed — `fmt(n, 1)`'s default (mg/kg tiles, mL/day readouts, etc.)
keeps stripping trailing zeros exactly as before.

**Verified live**, not just by inspection: vendored React/ReactDOM/Babel locally
(`npm install --no-save` — `unpkg.com` CDN is proxy-blocked from this environment,
same constraint as every prior session) into a scratch copy with `NEOFEED_GAS_URL`
blanked to exercise the mock-patient/"Local user" path, served over
`http://127.0.0.1`, driven with Playwright under both an **iPhone 13** and a
**Pixel 7** device profile: opened the mock patient → Calculator → Step 4 (Ca
gluconate 80 mg/kg/d, K₂HPO₄ 3 mEq/kg/d) → Step 6 (oral Ca 50, oral PO₄ 30 mg/kg/d) —
reproducing the exact 80/47/50/30 numbers from the report. Both profiles now render
`1.72` / `1.67` / **`1.70`** in the summary table and `1.70:1` in the "Ca:P ratio
(total)" tile, no console/page errors, no layout overflow. Same caveat as every prior
mobile sweep in this file: Chromium emulating device metrics, not real iOS Safari or
Android Chrome.

Cache-bust bumped: `calculator.jsx?v=cap-ratio-fmt1` in both `NeoFeed.html` and
`index.html`.

---

## Session 2026-08-06 (2) — deployed the auth fix to production (`@43` → `@44`)

`clasp push` + `clasp create-deployment -i AKfycbz8Nt...` from `~/nicu-tools/neofeed/`,
carrying GitHub `main` `5b017e9`. Redeployed the **existing** deployment, so
`NEOFEED_GAS_URL` is unchanged and the deployment count stayed at 26. Verified after:
`GET ?action=ping` → `200 {"ok":true}`. `รหัส.js` now byte-matches `gas-backend.gs`.

**This carried two changes, not one** — you cannot deploy a partial file, and both
were already sitting on `main` undeployed:
1. the auth fix (random per-account temp password + forced change), and
2. `Patient_Registry.statusDate` (col Q), backing the 7-day auto-hide of
   Discharged/Transferred/Expired patients.

**Neither migrates the live sheets, and both are backward-safe by design** — checked
before deploying rather than after:
- `login()` reads `must_change_password` positionally as `d[6]`. On the existing A–F
  Staff sheet that is `undefined` → `mustChange` false → **no existing staff member
  is forced to change anything, and no existing password is invalidated.**
- The registry treats a missing `statusDate` as "unknown age" and keeps the patient
  visible (`if (!p.statusDate) return -1`), so nothing vanished from the dashboard.

New columns are written on demand (`setValues` over E:H), so G/H initially had no
header labels. **Praew added `must_change_password` / `temp_password` to the Staff
tab header row on 2026-08-07 — done, don't chase it.** (Not verified from here: this
session had no route to read the live sheet — see the `ensureStaffHeaderColumns` note
below.)

`ensureStaffHeaderColumns()` / `applyStaffHeaderColumns()` in `gas-backend.gs` do the
same job idempotently and are kept for the case where the Staff tab is ever rebuilt.
They were pushed to the script project but **never run** — `clasp run-function` needs
the project deployed as an API executable linked to a standard GCP project, which it
is not, and setting that up on the production script just to write two cells was not
proportionate. If you ever do need to run them, it's from the Apps Script editor
(`ensureStaffHeaderColumns` is dry-run; the `apply` wrapper exists because the Run
button can't pass arguments).

**Not yet exercised in production:** no new non-Gmail staff row has been added since
the deploy, so the forced-change flow is live but unproven end-to-end. The first time
someone adds a staff row, check col H for the generated temp password and confirm the
app forces the change screen.

---

## Session 2026-08-06 — TPN calculator aligned to the official KCMH worksheet (branch `fix/kcmh-tpn-alignment`)

Praew supplied the official KCMH pharmacy TPN calculator
(`../TPN 05082569.xlsx` — กลุ่มงานเภสัชกรรม, ward 9B2/NICU). Reverse-engineered its
formulas from the template sheets (`NEW Temphate`, `Starter TPN`, `s tpn2/3`) and
diffed against `calculator.jsx`. **The workbook also contains ~45 named real-patient
sheets — do not read, copy or publish those; every number below came from the
anonymous template sheets only.**

### Four stock concentrations were wrong → the printed order form asked for the wrong mL

| Item | KCMH actual | NeoFeed had | Error |
|---|---|---|---|
| NaCl | **20%** = 3.42 mEq/mL | 3% = 0.51 | volume **6.7× too high** |
| KCl | **2 mEq/mL** | 1 mEq/mL (7.46%) | **2× too high** |
| Na acetate | **3 mEq/mL** | 2 mEq/mL | 1.5× too high |
| Peditrace | **1 mL/kg** | 1.5 mL/kg | 1.5× — and the print form already said 1 mL/kg, so code and output disagreed |

Also: MgSO₄ — the sheet's recipe line compounds from **10%** (0.812 mEq/mL), not the
50% NeoFeed assumed. Added a 10%/50% vial selector (defaults to 10%), since the
choice changes the mL and therefore the WFI q.s.

### Other changes
- **Lipid energy 10 → 9 kcal/g** (Praew's call) so kcal/kg/d reconciles with the
  pharmacy printout. The sheet's E53 is `3.4×dex + 4×AA + 9×fat`.
- **New: bag make-up** — Σ component mL and WFI q.s. (the sheet's J52/I53), shown in
  Step 3, the print form and the copied order text. Pharmacy cannot compound without
  it. A negative WFI raises a crit alert ("components exceed the bag").
- **New hard ceilings from the sheet:** max dextrose 18 g/kg/d (F9) and max K⁺
  40 mEq/L in the bag (G25) — both crit alerts + inline readouts.
- Order form now prints mEq **and** mL for every electrolyte, plus the heparin volume.
- `data.js` gained `KCMH_STOCK` — the single authority for every mL conversion.
  `SALT_SOURCES` (exported but unused) claimed to be "KCMH formulary" while listing
  the *wrong* strengths; corrected and annotated so it can't be wired in by mistake.

### Verified, not assumed
Reproduced the workbook's own cached results from NeoFeed's new constants:
osmolarity **856 / 896 mOsm/L**, calories **46 / 48 kcal**, component total
**59.9 / 63.4 mL**, WFI **40.1 / 36.6 mL** (sheets `s tpn2` / `s tpn3`) — all match.
Osmolarity formula (`estimateOsmolarity`) was already correct and is unchanged; its
comment attributed it to Ramathibodi, now corrected to the KCMH sheet's cell E52.
Also confirmed correct and left alone: GIR, D50W, Aminoven 10%, Glycophos
(2 mEq Na + 31 mg P/mL), K₂HPO₄ (1 mEq K + 15.5 mg P/mL), Ca gluconate, Soluvit,
the 900 mOsm/L peripheral limit.

### Second pass (same branch) — the overfill Factor is now implemented

New input **ปริมาตรคาสาย / dead space** (mL/day, default 0) in Step 3. Dead space
is the state, not prepared volume, because it is a property of the giving set —
so `prepared = delivered + dead` can never fall below delivered when the daily
volume changes. From it: `overfill = prepared ÷ delivered` and
**`Factor = weight × overfill`** (the sheet's H9).

What is scaled by the Factor (matching the sheet cell-for-cell): amino acid, all
Na/K/Mg/Ca/P electrolytes, and therefore every stock-solution mL. Dextrose grams
and heparin units come off the *prepared* volume (sheet F10, G51). WFI q.s. is now
`prepared − components`.

**Two non-obvious invariants** — both asserted in the test harness:
- Per-kg *delivered* dose returns exactly the ordered value
  (`perKg × factor × delivered/prepared ÷ wtKg = perKg`). So every per-kg target,
  tile and GIR still keys off actual weight and needed **no change**.
- **Osmolarity and GIR are invariant under overfill** — amount and volume scale
  together, so bag concentration is unchanged. `estimateOsmolarity` needed no
  change either. Verify this before "fixing" anything that looks unscaled.

**Deliberate fidelity to a sheet inconsistency:** Soluvit/Peditrace/Addamel are
compounded on *actual weight* (sheet `G43`/`G45`/`G46` use `C6`) even though their
own reference cells `B43`/`B45`/`B46` use `H9`. So an overfilled bag under-delivers
them — at ×1.2 the infant gets 83% of the 1 mL/kg. Implemented as the sheet does
and surfaced as an info alert plus a note on the printed form, rather than silently
"corrected". **If Praew decides the vitamins should be scaled too, that is a
one-line change (`wtKg` → `factor` in the soluvitVol/peditrace_vol lines) — but it
is a deviation from the official sheet and should be agreed with pharmacy first.**

Print form now fills in the "Prepared Vol." blank, prints the Factor and its
derivation, labels the pharmacist column "IN BAG (× Factor)", and adds the sheet's
delivered-dose section (`องค์ประกอบที่ผู้ป่วยได้รับ`, rows 83–98) as the ward's
cross-check that the Factor was applied.

### Test harnesses — `test/` (new)
`node test/verify-kcmh-constants.cjs` and `node test/verify-kcmh-factor.cjs`
(the latter reads `DEAD`, run it at `20` **and** `0`). The factor one mounts the
real `<Calculator>` in jsdom, drives the actual inputs, reads the rendered order
form, and compares against an independent transcription of the sheet's formula
chain. See `test/README.md` — dev deps are npm-installed but not committed; the
app itself still has no build step.

### Still missing vs the official sheet
- Alternative amino-acid products (Amiparen 10%, Aminoplasmal 15%, Aminoleban 8%,
  Nephrosteril 7%), ZnSO₄, total-Zn tally with the 5 mg/day ceiling, Cl⁻ tally.
- The sheet's "↓P / ↓Ca" manual-reduction columns (I26/I35) and its `add.KCl`
  back-calculation, which also looked internally inconsistent (mixes mL into an
  mEq sum at F94) — not replicated.

### Source workbook is gone
`TPN 05082569.xlsx` was in the folder *above* the repo and is no longer on disk;
it was never committed (it held ~45 named real-patient sheets). Everything derived
from it is recorded here and in `test/`. **To change any KCMH constant later you
will need the workbook again** — nothing else on disk documents those divisors.
---

## Session 2026-07-31 (3) — touch targets: every interactive element to 44px

Follow-up to the device sweep in (2), which flagged sub-44px tap targets.
Audited **effective** tap targets (nearest `<label>`/`<button>`/`.clickable`
ancestor — measuring the bare `<input>` under-reports a checkbox whose real
hit area is the label wrapping it) across all five views on an iPhone 13
profile. Every failure traced to an explicit override that outranked the
already-present `.btn/.btn.sm/.seg button { min-height: 44px }` block, so
the fixes are at those rules rather than layered on top:

| element | was | cause |
|---|---|---|
| `.preset-chip` | 26–31 × 24 | mobile block shrank it, no min-height |
| `.patient-mc .pmc-actions .btn` | 164 × 40 | explicit `min-height: 40px` beat `.btn.sm`'s 44 |
| `.trend-chips > button` | × 38 | explicit `min-height: 38px` |
| `.trend-xaxis-seg button` | 144 × 28 | `min-height: 28px !important` beat `.seg button`'s 44 |
| `.switch-patient` | 40 × 36 | `height: 36px`, no mobile rule |
| `.card-h.clickable` | × 43 | 1px short |
| Growth `＋`/`−`, lipid-hours `16h/20h/24h` | 36–39 wide | height fine, no min-width anywhere |

**The one behavioural change worth understanding: `.preset-chips` now wraps.**
It was `flex-wrap: nowrap` + `flex: 1 1 0`, deliberately, so a dose row
always stayed on one line — but that meant the four 5-chip rows sitting in
half-width grid cells (`.s1-grid` fluid, dextrose %, `.s2-aa-row`,
`.s2-lip-row`) squeezed to 26–31px wide. These are the controls that set
clinical doses; two 28px chips 3px apart is a mis-tap that changes a
prescription. Now `flex-wrap: wrap` + `flex: 1 1 44px` + `min-width: 44px`:
44px is the floor, leftover space is still shared out so each line's chips
stretch flush (not ragged at content width), and a row only breaks to a
second line when staying on one would violate the floor. Wide rows are
unchanged — one line, as before. At 390px the AA row becomes 3+2; at 320px
the fluid row becomes 2+2+1. `white-space: nowrap` is untouched, so a dose
value still never truncates or splits.

**Tablets.** All of the above lives in the `≤767px` query, which an iPad
(768px+) never matches — so a touch tablet kept the desktop's ~25px chips.
Added a second block keyed on `(hover: none) and (pointer: coarse) and
(min-width: 768px)` carrying the same minimums, plus a 1px trim to `.rail`'s
side padding so the collapsed 60px tablet rail can fit a full 44px item
(was 43px). Keyed on the input device, not the width, so a mouse-driven
desktop at the same width is untouched — verified: at 1440px with a fine
pointer the chips are still 40×24 and the rail item 37px, exactly as before.

**Verified**: effective-tap-target audit reports **0 elements under 44px**
across Registry / Dashboard / Calculator (all six steps expanded) / Growth /
Alerts, on iPhone 13 and on both iPad profiles under `pointer: coarse`.
Overflow regression sweep across iPhone SE / 13 / 14 Pro Max / Pixel 5 /
Galaxy S8 / Galaxy S9+ / iPad Mini / iPad Pro 11: **0px** page, card, and
`.preset-chips` horizontal overflow everywhere; no page errors. Same WebKit
caveat as session (2) — Chromium emulation, not iOS Safari.

---

## Session 2026-07-31 (2) — Ca · PO₄ · Ca:P summary in Step 6 (oral supplement, and combined with TPN)

**Problem.** Calculator Step 4's `Calcium` / `Phosphorus` / `Ca:P ratio`
tiles only ever counted TPN + EN. Once a baby is also on oral Ca and/or
oral PO₄ from Step 6, the ratio the doctor is actually looking at in Step 4
is not the ratio the baby receives — and nothing on screen showed the
difference. In the user's own screenshots, Step 4 read a comfortable
`1.72:1` while an oral order of Ca 150 mg + PO₄ 56.4 mg/day was already
entered in Step 6.

**What was added** (all in `calculator.jsx`, no data-model change):

1. **`mineral` memo** (next to `calc`, deliberately *not* inside it): splits
   Ca and PO₄ per kg/day by source — `tpn*` (Ca-gluconate + Glycophos /
   K₂HPO₄ / extra P), `en*` (from the feed's own Ca/P), `oral*` (Step 6
   `suppCa`/`suppPO4`, already entered as elemental mg/kg/day so they add
   directly) — plus `iv*` (tpn+en) and `tot*` (everything), each with its
   mass ratio. `ratio()` returns `Infinity` when Ca is ordered with zero P,
   which `D.rangeStatus` already reports as `crit` and `fmt` renders `!!`.
   By construction `mineral.ivCaP === calc.caP`, so Step 4 and the new panel
   can't disagree about the TPN+EN number.
   **Kept out of `calc` on purpose:** `calc` feeds the saved `Daily_Log`
   entry and the Step 4 tiles, and both stay TPN+EN-only. Folding oral
   supplement into `calc.caKg`/`calc.pKg` would silently change what
   `ca`/`p` mean in every historical row and in `log.jsx`'s `TrendGraph`
   target bands.
2. **Step 6 summary panel** — a source-breakdown table (TPN (IV) / EN (นม),
   shown only when the feed contributes / Oral supplement / รวมทั้งหมด)
   over `Ca | PO₄ | Ca:P`, then three `Tile`s for the **total** intake with
   the normal target meters. Targets are the existing route-aware
   `T.ca(dol, useEnteralTargets)` / `T.p(...)` / `TARGETS.caP()` — no new
   clinical constants. Panel is hidden entirely when neither oral nor
   IV/EN minerals are present.
3. **Two alerts**, firing only when an oral supplement exists (otherwise
   they'd duplicate the existing TPN-only Ca:P alert): `crit` for
   Ca-with-no-P, `warn` for a combined ratio outside `1.0–1.7:1`.
4. **Same breakdown in the printed order form and the clipboard text.**
   Both of those already carried a `Ca:P` figure computed from `calc.caP`;
   since two different Ca:P numbers now appear on the same sheet, the old
   one is labelled `(TPN+EN)` in each so they can't be confused.

New CSS class `.capo4-tiles` (3-col → 1-col under 767px) added to **both**
HTML shells. Cache-bust bumped to `calculator.jsx?v=capo4-summary1`.

**Verified** headlessly (Chromium + the mock-patient fixture, `GAS_URL`
blanked in a scratch copy so the login gate falls through): panel hidden
when empty; TPN-only, TPN+EN, and oral-only cases all render with the
arithmetic matching a hand check; Ca-with-no-P shows `!!` and raises the
crit alert; targets flip to the ESPGHAN-2022 enteral ranges once EN
≥ 100 mL/kg/d; print form and clipboard text both checked.

**Mobile/tablet sweep** — 11 Playwright device profiles (iPhone SE 320px,
iPhone 13, iPhone 14 Pro Max + landscape, Pixel 5/7, Galaxy S8, Galaxy S9+
320px @4.5x, iPad Mini, iPad Pro 11), each driven through the real flow
(open patient → Calculator → fill Step 4 + Step 2 + Step 6) with touch
emulation on. Every profile: **0px** page/card/panel horizontal overflow,
no clipped table cells, no page errors. Narrowest case is 320px → 274px
panel, where the "Oral supplement" label wraps to two lines and stays
legible. Screenshots in the session scratchpad.

⚠️ **Two caveats on that sweep, both worth carrying forward:**

1. **No WebKit — this is Chromium emulating iOS device metrics, not iOS
   Safari.** `npx playwright install webkit` is blocked by the sandbox's
   network policy (the Playwright CDN is not reachable; only the npm
   registry is). So it validates layout/overflow/tap geometry but *cannot*
   reproduce iOS-Safari-specific behaviour — which is exactly the class the
   2026-07-31 (1) bottom-sheet bug fell into (`position:fixed` / `dvh`
   compositing). This panel is static in-flow content with no fixed/sticky
   positioning, no `vh`/`dvh` units, no `:has()`, no container queries — so
   it's not in that risk class — but "passes the sweep" ≠ "tested on iOS".
2. **Pre-existing tap targets under 44px in Step 6** (flagged by the sweep,
   *not* introduced here — the new panel contains zero interactive
   elements): `.preset-chip` renders 24px tall on mobile (`NeoFeed.html`
   ~L1045 shrinks it to `padding: 5px 1px; font-size: 10px` under 767px),
   and the Munti-vim checkbox is 18px. Both are below the 44px iOS / 48dp
   Android guidance and affect every preset-chip row in the calculator, not
   just Step 6. Left alone deliberately — out of scope for this change, and
   raising chip height touches the whole wizard's layout.

---

## Session 2026-07-31 — iPhone "New log" sheet: unreachable Confirm button + oral phosphate dosing switched to mg/kg/day

**1. Confirm button unreachable on iPhone.** User screenshot: opening "New log"
(`LogDateModal` in `log.jsx`, and by the same markup pattern every other
`.picker`/`.modal-box` bottom sheet — several in `registry.jsx` too) on an
iPhone left the sheet's "ดำเนินการต่อ" button sitting flush against the very
bottom of the screen, in the same strip the app's fixed bottom-nav
(`Patients/Dashboard/Calc/Growth/Alerts`) occupies — unreachable/overlapping
rather than clearly above it. `.picker-backdrop`/`.modal-backdrop` (z-index
50/60) are supposed to out-stack `.bottom-nav` (z-index 40) and cover it
entirely when a sheet is open, but evidently didn't reliably in the field
(iOS Safari / in-app webviews are known to be inconsistent about `vh`/`dvh`
recalculation and `position:fixed` compositing when their own chrome
resizes). Rather than chase that, made the sheet's position not depend on
the stacking order being right at all: added
`padding-bottom: calc(58px + env(safe-area-inset-bottom, 0px))` (matching
`.bottom-nav`'s own height formula) to `.picker-backdrop`/`.modal-backdrop`
in the mobile media query, so the bottom-aligned sheet's own bottom edge
always sits above where the nav bar is, geometrically, regardless of
z-index behavior on any given device. Applied to **both**
`NeoFeed.html`/`index.html` per the CSS-drift convention; not verified
against a live iPhone from this environment, so re-check on the next
mobile-Safari pass instead of assuming it's fully fixed.

**2. Oral phosphate supplement dosing switched from mmol/kg/day to
mg/kg/day.** Calculator Step 6 → Phosphate (oral) previously took input
directly in mmol/kg/day with presets `1/1.5/2/2.5`. At the user's request,
the input (`NumField` + `PresetChips`) is now mg/kg/day elemental P with
presets `30/40/60`, matching the Calcium field right above it. Internals:
the `suppPO4` state itself now means mg/kg/day; every downstream mmol
computation (volume-per-day via `SUPP_DB[...].po4_mg_per_ml` — used
directly now, no molar step needed for volume; the `suppPO4_mmol` field
still written to `Daily_Log`/GAS on submit, converted `mg/31` using the
same elemental-P molar mass — 31 mg/mmol — already used elsewhere in this
file for Glycophos/K₂HPO₄ dosing) was updated to match: Step 6 summary
chip, the Supplement-order mini-readout, the plain-text clipboard summary,
and the review-table row. **`suppPO4_mmol` written to `Daily_Log` is
unchanged in meaning** (still mmol/day) — only the on-screen input/label
changed, so existing rows and the backend schema are unaffected. One real
caveat: any `localStorage["neofeed_calc_<sessionId>"]` draft saved before
this change stored `suppPO4` as mmol/kg/day (values like `1`/`1.5`/`2`); on
restore it'll now display as mg/kg/day with the same number (e.g. a saved
`1.5` shows as "1.5 mg/kg" instead of being reinterpreted) — a purely
client-side, per-browser prefill cache, not the Daily_Log source of truth,
so left as-is rather than adding migration logic for it.
Cache-bust bumped: `calculator.jsx?v=po4-mg-dosing1` in both HTML shells.

---

## Session 2026-07-18 (4) — backend sync: local clasp copy + live deploy were behind `main`

`~/nicu-tools/neofeed/` (the clasp-linked working copy of `gas-backend.gs`, deployed
as the live web app) had drifted behind this repo's `main` in two ways:
1. **Live deployment (`@42`) was three commits behind `main`** — `d778cfb`
   (auto-provision default password) was live, but `435e09f`
   (`backfillDefaultPasswords`) and `8dcfbf6` (Workspace-domain exclusion +
   `clearStaffPassword`) were sitting uncommitted in the clasp working copy, never
   pushed or deployed.
2. **Working copy was also missing `2802e90`** — the `authMethod: "google"/"password"`
   tag on the login response (added so the frontend can tell which auth path a
   session came from) — this one hadn't even been copied over yet.

Diffed `gas-backend.gs` (GitHub `main`) against `รหัส.js` (the clasp copy) directly to
confirm the exact remaining delta (just the two `authMethod` lines) rather than
re-deriving it from commit history. Applied the fix, committed in the clasp repo,
`clasp push`ed, then `clasp deploy --deploymentId AKfycbz8Nt...` to update the
*existing* production deployment (not a new one) — now live at `@43`. Confirmed
`รหัส.js` byte-matches `gas-backend.gs` post-fix.

**Take-away for future sessions:** the clasp working copy is not git-tracked against
GitHub and won't auto-update — after merging backend changes to `main`, someone has to
manually diff/copy/push/deploy from `~/nicu-tools/neofeed/`, same as this session did.
Worth checking whenever HANDOFF says a backend fix landed on `main` but doesn't also
say it was deployed.

---

## Session 2026-07-18 (3) — debug pass: Alert-count drift + colgroup DOM warning (branch `claude/neofeed-debug-9arm-wvrssf`)

Applied a reproduce-first debugging pass (no specific bug report — drove the
app end-to-end via a local Playwright rig against vendored React/Babel and
mock data, `unpkg.com` blocked from this environment same as prior sessions,
`registry.npmjs.org` reachable so React/ReactDOM/Babel were vendored via
`npm install --no-save` instead). Found and fixed two reproducible bugs by
watching the live app, not just reading the diff:

1. **Nav-rail "Alerts" badge under-counted the Alerts page by 1, always.**
   `app.jsx` had **three independent, hand-copied implementations** of "how
   many alerts does this patient have" — the `AlertCenter` page's own
   builder, the `alertCount` `useMemo` driving the nav-rail/bottom-nav badge,
   and `AdminDashboard`'s "Active alerts" tile — and they'd drifted out of
   sync (the badge memo predates the page's `electrolyte-audit` info alert,
   added later only to the page; the admin tile was missing growth-velocity,
   weight-stale, *and* electrolyte-audit entirely, undercounting by up to 3).
   Concretely reproducible: on the seeded mock patient, the sidebar showed
   "Alerts 2" while opening the page showed "3 active · 3 total" — confirmed
   by acknowledging just the electrolyte-audit alert and watching the page
   count drop 3→2 while the badge stayed at 2 throughout (proof the badge
   never counted it). Fixed by extracting one shared `computeAlerts(patient,
   entries)` (full alert list) + `activeAlertCount(patient, entries)`
   (unacked count) near the top of `app.jsx`, and switching all three call
   sites to use them. Verified: badge, page header, and (by code, same
   helper) the admin tile now agree by construction — the old inline copies
   are gone, so they can't drift again silently.
2. **React DOM-nesting warning on the Patients table** (`registry.jsx`):
   `<colgroup>` had `<col ... /> {/* comment */}` on each line — the same-line
   trailing whitespace before each `{/* ... */}` compiled to whitespace text
   nodes as children of `<colgroup>`, which the DOM spec doesn't allow there.
   Cosmetic (browsers silently drop it) but a real, reproducible console
   warning on every Patients-page load. Moved each comment to its own line
   above the `<col>` it describes — no more inline trailing whitespace, no
   more text-node children of `<colgroup>`. Verified clean in the console
   after the fix.

Cache-busting `?v=` bumped for `app.jsx` and `registry.jsx` in **both**
`NeoFeed.html` and `index.html` per the existing convention (see
`app-walkthrough.md` §7) — no CSS changed this session, so no `<style>`
reconciliation needed.

**Not investigated further, flagged only:** `fenton.jsx` labels the growth
chart "Fenton 2025" / cites "Fenton TR, Elmrayed S, Alshaikh BN, PMID
40534585", while `app-walkthrough.md` (now corrected) and prior HANDOFF
entries describe it as "Fenton 2013." This has been the label since the
chart's original commit (`ccaefc6`, 2026-05-28) — not new drift — but nobody
in this project's history appears to have verified the citation/percentile
data against a real 2025 Fenton revision vs. just carrying a mislabeled 2013
dataset forward. Needs a clinician/citation check, not a code fix; flagging
so a future session doesn't assume it's already verified.

---

## Session 2026-07-18 (2) — walkthrough/scrutinize/verify pass, fixed shared default password (branch `claude/app-walkthrough-verify-hxzivt`)

Prompted by "walkthrough, scrutinize and verify this app" — re-verified every
fix claimed in earlier sessions against current code (all held up: TTL,
lockout, `_numSafe`/`_sheetSafe`, Google token verification, `doGet`
trimming, the `dol1` crash fix, negative-value validation, `lastWeighed()`
usage, GA/PMA math). Found one new, real, currently-deployed issue introduced
by the session below, same day:

**Critical — shared hardcoded default password for auto-provisioned staff.**
`gas-backend.gs`'s new `onEdit`/`backfillDefaultPasswords` (added by the
session below, same morning, and confirmed live in production at deploy
`@42`/`@43` by Session (4) above) set every new non-Gmail Staff row to one
constant, `DEFAULT_NEW_USER_PASSWORD = "nicunicu"`, with nothing forcing a
change afterward — `login()` returned `status: "ok"` for it exactly like any
real password. Since this repo has no build step, that string is public and
permanently recoverable from git history (same class of leak already flagged
for `SPREADSHEET_ID`), except this one is a live login credential for any
role including admin, not just an internal pointer. 10 real staff accounts
were already provisioned with it before this was caught — and, per Session
(4) above, this trigger really was deployed live, so this wasn't just a
theoretical source-only gap.

Fixed, at the user's request ("random per-user password + forced change
flow"):
- `_genTempPassword()` generates a random ~40-bit temp password per account
  (`Utilities.getUuid()`-derived) instead of reusing one constant.
- Staff sheet gains cols G/H: `must_change_password` (bool) and
  `temp_password` (plaintext, write-once handoff value for whoever added the
  row to relay to the new staff member). Both auto-clear the moment the
  account's password is actually changed.
- `login()`'s password path now returns `mustChangePassword` from col G;
  `app.jsx` gates on it right after the login screen — full-screen forced
  `ChangePasswordModal` (no Cancel, backdrop click does nothing, only
  escape hatch is "ออกจากระบบ"/logout) blocks everything else, including the
  GAS patient sync, until a real password is set.
- `setInitialPassword`/`clearStaffPassword` updated to also touch cols G/H
  so they can't leave stale forced-change state behind.

Verified end-to-end with a local Playwright rig (vendored React/ReactDOM/
Babel via `npm install` — `registry.npmjs.org` is reachable from this
environment even though `unpkg.com` is proxy-blocked like prior sessions
noted — served over `http://127.0.0.1` since `file://` origin can't load the
Babel-transpiled `.jsx` via XHR) against a mocked GAS backend: forced modal
appears after a mustChangePassword:true login, backdrop click and Cancel are
both absent/inert, a wrong temp password shows an error and keeps the gate
up, and a correct temp password + valid new password clears it and drops
into the normal app. This test run caught a real bug before it shipped: the
first pass of this fix used an `Edit` `replace_all` that silently only
updated the Google login path's `onLogin(...)` call, not the email/password
path's — i.e. the exact path real (non-Gmail) staff use, which would have
made the whole fix a no-op for the accounts it was meant to protect. Fixed
by patching that call site directly and re-running the same test.

**Still needs (same as every source-only change to this file):** someone
with Apps Script editor access must `clasp push && clasp deploy` (or paste
`gas-backend.gs` into the editor) against the live project before this takes
effect — this one is more urgent than most: production is confirmed live
with the vulnerable version (Session (4) above deployed it to `@42`/`@43`),
not just carrying an unshipped source fix. None of the 10 already-
provisioned accounts benefit until redeployed — they're still sitting on
the shared `"nicunicu"` password with no forced change in the meantime.
Cache-bust tag for `app.jsx` merged with Session (3)'s bump into
`app.jsx?v=alert-fix-pwdchange1` in both `NeoFeed.html`/`index.html`.

---

## Session 2026-07-18 — auto-provision default password for new Staff rows (undocumented here until now, see above)

Not written up in this file when it happened — reconstructed from git log
for continuity. Commits `d778cfb`/`435e09f`/`8dcfbf6`: pasting a batch of 10
new non-Gmail staff rows into the Staff tab left them with no
`password_hash`, so added an `onEdit` trigger + one-time
`backfillDefaultPasswords()` to auto-fill a password (originally one shared
hardcoded default) as soon as such a row is saved, plus
`GOOGLE_WORKSPACE_DOMAINS`/`clearStaffPassword()` to stop Workspace-domain
accounts (e.g. `chula.ac.th`) from picking one up. Also redeployed
`gas-backend.gs` live, bringing the TTL/lockout hardening from the
2026-07-13(2) session below into production for the first time (it had only
been merged to `main`, never actually pushed to Apps Script, until this
commit's message says so). **The shared-default-password part of this was a
real vulnerability, fixed by Session 2026-07-18 (2) above — if you're
reading this session in isolation, read that one too.**

---

## Session 2026-07-13 (2) — cybersecurity review + fixes (branch `claude/neofeed-cybersecurity-review-8vflvy`)

Full fresh audit prompted by "check cybersecurity of neofeed, scrutinize and
verify" — re-verified every fix claimed in the sessions below against actual
current code (not just trusted the write-ups), plus new coverage of the
client-side `.jsx` files. Found and fixed:

1. **Critical — session TTL exceeds CacheService's hard cap, breaking every
   login independent of the config issue below.** `createSession()` and
   `verifyToken()`'s sliding-window refresh both called
   `CacheService.getScriptCache().put(key, value, 43200)` (12h) — but
   `CacheService.put()` has a documented hard max of **21600 seconds (6h)**;
   anything above that throws `"Argument too large: expirationInSeconds"` at
   call time. This has been in `gas-backend.gs` since its first commit, so
   it's not new, and it's independent of the `CLIENT_ID`/`SPREADSHEET_ID`
   Script Properties gap the session below diagnoses. **Practical effect:
   even once `setConfig(...)` is run to fix that gap, login would still
   throw inside `createSession()` right after credentials are verified —
   for both the Google and the password path.** Fixed: clamped to a
   `SESSION_TTL_SECONDS = 21600` constant used in both places. Comments/docs
   updated from "12h" to "6h" TTL throughout (`gas-backend.gs`,
   `app-walkthrough.md`). **This still needs `clasp push`+deploy like the
   sessions below — unverified against the live Apps Script project from
   this environment.** Worth testing directly with
   `CacheService.getScriptCache().put('t','v',43200)` in the Apps Script
   editor before deploy, to confirm the throw behavior rather than relying
   on documentation alone.
2. **High — production Spreadsheet ID is permanently recoverable from git
   history.** The 2026-07-12 (4) session below moved `SPREADSHEET_ID` out of
   HEAD into Script Properties, but `git log -p` still recovers the literal
   ID from the commits before that move — removing it from HEAD didn't scrub
   history. Not code-fixable from here. **Action item for someone with
   access to the Google Sheet: verify its sharing settings are not "anyone
   with the link," since the app's entire security model (RBAC, audit log,
   PDPA erasure) lives in the Apps Script layer, not the Sheet's own ACL —
   direct Sheet access bypasses all of it regardless of whether the ID is
   secret.**
3. **Medium — `changePassword` had no brute-force lockout** on the
   `oldPassword` check, unlike `login`'s 5-attempt/15-min lockout. Anyone
   holding a valid session token (leaked, or a shared unlocked NICU
   workstation) could brute-force the account's real password via unlimited
   `changePassword` attempts. Extracted the login lockout into shared
   `_lockoutStatus`/`_recordFailure`/`_clearLockout` helpers and applied the
   same 5-attempt/15-min lockout to `changePassword`.
4. **Medium — `doGet` exposed authenticated actions
   (`getActivePatients`, an admin `debug` staff-list dump) with the session
   token passed as a URL query parameter.** The client has only ever called
   these via POST with the token in the JSON body (verified — no GET calls
   anywhere in `app.jsx`), so this was live-but-unused surface on the
   deployed web app. A token in a URL risks exposure via browser history or
   infra logs in a way a POST body doesn't. Trimmed `doGet` to just the
   unauthenticated `ping` health check; both actions already exist (and stay
   available) via `doPost`.
5. **Low — negative-value clinical inputs accepted with no validation.**
   `calculator.jsx`'s `NumField` declared a `min` prop but never enforced it,
   and its input regex explicitly allowed a leading `-` — every TPN/EN
   dose/volume/rate field could take a negative number straight into the
   nutrition calc with no downstream sanity check. Also birth
   weight/length/HC in `registry.jsx`'s `NewPatientModal`, `EditPatientModal`'s
   DOL-at-admit, and `fenton.jsx`'s `MeasurementLogger` weight/length/HC
   fields. All physical clinical quantities here are non-negative by
   definition, so: `NumField` no longer allows typing `-` at all (removed
   from the allowed charset, not just clamped after parse) and defaults
   `min` to 0; the registry/fenton fields now clamp to `Math.max(0, ...)` on
   change (fenton's `MeasurementLogger.save()` also drops — rather than
   saves — any individual negative field). Not an injection vector (server
   already coerces numerics via `_numSafe()`), but a real data-integrity/
   patient-safety gap since nothing previously stopped a fat-fingered
   negative weight or dose from being calculated and persisted.
6. **Doc correction — `app-walkthrough.md` described a possible `if (false)`
   LoginScreen-bypass toggle.** Verified in current `app.jsx`: login is gated
   on `GAS_ON` (true whenever `NEOFEED_GAS_URL` is configured), not a
   separate bypass flag — this was already fixed in code, the walkthrough
   text was just stale. Corrected so a future session doesn't misdiagnose or
   reintroduce a bypass.

**Confirmed already fixed** (re-verified against current code, not just the
write-ups below): Google ID token signature/audience verification,
constant-time hash comparison, session-epoch revocation on password change,
time-boxed login lockout, `_sheetSafe()` formula-injection guarding
including the numeric-field gap flagged in the 2026-07-12 (4) session below
(fixed in this branch's `d4bf4fe`, before this review session started), SRI
hashes on all CDN `<script>` tags, no XSS sinks anywhere client-side (no
`dangerouslySetInnerHTML`/`innerHTML`, all patient data goes through React's
auto-escaping JSX interpolation), no hardcoded secrets in current source,
`Audit_Log` writes aren't exploitable (traced every `logAudit()` call site —
attacker-supplied strings can't reach it unvalidated, only already-verified
real sessionIds do).

**Not done / open:** password hashing is still a 3000-round HMAC-SHA256
stretch, well below current PBKDF2 guidance (~600k+ iterations) — flagged as
an accepted Apps Script constraint by the 2026-07-12 (3) session below and
still true. Bumping the round count isn't a safe drop-in change: existing
`v2$`-prefixed hashes were computed at the current iteration count with no
version marker for it, so raising `HASH_V2_ITERATIONS` would silently break
every already-migrated staff password (unlike the v1→v2 upgrade path, there's
no "v3" format to gate a proper re-hash-on-next-login migration). Needs a
deliberate versioned migration, not a quick edit — left alone this session.

Same as every prior hardening session: **this is source-only until someone
with Apps Script editor access runs `clasp push && clasp deploy`** (or pastes
`gas-backend.gs` into the editor) against the live project
(`~/nicu-tools/neofeed/`, deployment `AKfycbz8Nt...`) — none of items 1, 3,
or 4 above have any effect on the currently-broken production login until
that happens, on top of the still-outstanding `setConfig(...)` step from the
session directly below.

---

## Session 2026-07-13 — diagnosed "Google token ไม่ถูกต้อง" on every login (branch `claude/login-access-issue-o8wc70`)

User report (screenshot): Google Sign-In on the live site (`valhalla-health.github.io`)
fails immediately with a red "⚠ Google token ไม่ถูกต้อง" banner for every account,
right after the 2026-07-12 auth-hardening deploys.

**Root cause:** this is the exact risk flagged (but not yet resolved) in the
2026-07-12 (4) session below. PR #20 moved `CLIENT_ID`/`SPREADSHEET_ID` out of
`gas-backend.gs` source and into Apps Script Script Properties, requiring a
one-time `setConfig("<spreadsheetId>", "<clientId>")` run in the Apps Script
editor **before/at** the next deploy. That one-time step was never confirmed
done. Once `gas-backend.gs` (PR #19 + #20's `verifyGoogleIdToken`/`CLIENT_ID_()`)
went live without it, `CLIENT_ID_()` throws `Missing Script Property 'CLIENT_ID'`
on every login attempt — but the old code caught that exception inside
`verifyGoogleIdToken`'s try/catch and returned `null`, indistinguishable from an
actually-invalid token, so every user sees the generic "Google token ไม่ถูกต้อง"
message. **This is a server-config gap, not a bug in the user's Google account
or browser** — no client-side action fixes it.

**Code fix (this session):** `CLIENT_ID_()` is now read *outside* `verifyGoogleIdToken`'s
try/catch, and `doPost`'s login handler catches that specific exception and returns
`{status:"error", error:"ระบบยังไม่ได้ตั้งค่า (server config): Missing Script Property..."}`
instead of the misleading "Google token ไม่ถูกต้อง". This doesn't fix login by
itself — it makes the real cause visible in the response instead of silently
mimicking a bad-token error.

**Manual step still required (cannot be done from this session — needs Apps
Script editor access):**
1. Open the live Apps Script project (`~/nicu-tools/neofeed/`, deployment
   `AKfycbz8Nt...`).
2. Run `setConfig("<the Google Sheet's ID>", "750019806043-imunne8ndetdesii70o3t1vnr0ta2br4.apps.googleusercontent.com")`
   from the Apps Script editor (the client ID must match `window.NEOFEED_CLIENT_ID`
   in `NeoFeed.html`/`index.html` — copied verbatim above from those files).
   Alternatively set `SPREADSHEET_ID` and `CLIENT_ID` directly under
   Project Settings → Script Properties.
3. Redeploy `gas-backend.gs` (this session's fix included) via `clasp push && clasp deploy`
   or paste-into-editor, per the existing "Restore production checklist" below.
4. Confirm with a real login — should no longer show any "ระบบยังไม่ได้ตั้งค่า"/
   "Google token ไม่ถูกต้อง" error.

**Still open:** deploy step above not performed this session (no Apps Script
credentials in this environment) — production login remains broken until an
admin with access runs it.

---

## Session 2026-07-12 (4) — move SPREADSHEET_ID/CLIENT_ID out of source (branch `claude/backend-security-cloning-czphxy`)

Follow-up to the PR #19 auth-bypass fix (below): `SPREADSHEET_ID` and
`CLIENT_ID` were hardcoded literals at the top of `gas-backend.gs`, readable
to anyone with repo access. Moved both to Script Properties — `SPREADSHEET_ID_()`/
`CLIENT_ID_()` (via a shared `_cfg()` getter) read them from
`PropertiesService.getScriptProperties()` instead. One-time setup: run
`setConfig("<spreadsheetId>", "<clientId>")` from the Apps Script editor (or
set both properties directly under Project Settings → Script Properties) —
**this must be done before/at the next `clasp push`+deploy**, or every
request will fail with "Missing Script Property" until it is.

**Worth knowing:** `CLIENT_ID` is unavoidably public regardless of this
change — it's also inline in `NeoFeed.html`/`index.html`'s
`window.NEOFEED_CLIENT_ID`, since Google Identity Services needs it in the
browser, and OAuth web client IDs aren't secrets by design. Moving it into
Script Properties is config hygiene (one source of truth), not secrecy.
`SPREADSHEET_ID` is the one that actually benefits — it's an internal
pointer to the document holding patient data with no reason to sit in git
history.

**Also reviewed (not changed):** PR #19's `_sheetSafe()` formula-injection
guard covers the string fields it targeted (sessionId/route/status/supp*Type/
name/diagnosis/etc.) but not the numeric-typed fields passed straight through
from client JSON (`entry.dol/weight/fluid/gir/pro/kcal/na/k/ca/p/enVolPerKg`,
`suppMTV/suppVitD_IU/suppCa_mg/suppPO4_mmol/suppFe_mg`, `entry.ts`) or
`registerPatient`'s `p.dob`/`p.admissionDate` — none of these coerce to
`Number`/validate format, so a forged POST (or a buggy client) could still
land a leading `=`/`+`/`-`/`@` string in one of those cells. Lower severity
than the auth bypass (requires a valid session token already), flagged for a
follow-up rather than fixed here.

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
- **Two hand-synced shells, not one canonical file:** `NeoFeed.html` is the file you edit locally; `index.html` is what GitHub Pages actually serves at the public URL (repo-root convention). Any CSS/config/script-loader change must go into **both** — see "CSS drift & reconciliation" below for the recurring-drift history. Open `NeoFeed.html` for local dev.
- **GAS URL:** `https://script.google.com/macros/s/AKfycby44DAIfEueeGj_XSKCyWEWmgr46WjP-vKFEGnDhZSr2_q0KdyO8O5CBxY2qqdoNkoN/exec` — currently **commented out** in `NeoFeed.html` line ~960 (sandbox uses mock data; `index.html` must be checked/updated to match). Restore for production.
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
NeoFeed.html      App shell + all CSS (oklch design system) — edit this locally
index.html        Hand-synced copy of NeoFeed.html — what GitHub Pages actually serves
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
- *Retention policy:* no automatic purge after discharge — records persist
  indefinitely in the sheet today.

---

## Session 2026-07-12 (3) — auth/backend security hardening (branch `claude/static-frontend-token-api-q41vrr`)

Deep review of `gas-backend.gs`'s token-checked API prompted by a direct
"do we have a cybersecurity backend?" question. Found and fixed:

1. **Critical — Google Sign-In auth bypass.** `decodeJwtEmail` only
   base64-decoded the JWT payload; it never verified the signature (3rd JWT
   segment) or checked `aud`. Anyone could POST a hand-crafted, unsigned
   `googleToken` claiming `email_verified:true` for **any staff email in the
   Staff sheet, including an admin's**, and log in with no password and no
   real Google auth. Replaced with `verifyGoogleIdToken()`, which validates
   the token against Google's `tokeninfo` endpoint (signature + expiry) and
   additionally checks `aud === CLIENT_ID` so a token minted for a different
   OAuth client can't be replayed here.
2. **Password hashing was single-round SHA-256.** Added `hashPwdV2` (an
   iterated HMAC-SHA256 loop, `v2$`-prefixed, 3000 rounds — Apps Script has
   no native PBKDF2/bcrypt). Legacy hashes still verify via `hashPwdLegacy`
   and are transparently rehashed to v2 on the user's next successful login;
   `setInitialPassword()` now writes v2 hashes directly. Also switched the
   hash-equality check from `!==` to a constant-time `safeEqual()` — plain
   string inequality leaks timing info proportional to matching prefix
   length.
3. **Google Sheets formula injection.** Client-submitted string fields
   (patient name/diagnosis/route/sessionId/etc.) were written to the sheet
   unsanitized; a value starting with `=`/`+`/`-`/`@` executes as a formula
   when a human opens the sheet in the Sheets UI — could exfiltrate data via
   `=IMPORTXML(...)` or phish via `=HYPERLINK(...)`. Added `_sheetSafe()`
   (apostrophe-prefixes such values so Sheets treats them as literal text)
   and applied it everywhere client strings reach `_buildLogRow`/
   `registerPatient`.
4. **No session revocation on password change.** A leaked/shared-workstation
   token stayed valid for its full 12h TTL even after the account owner
   changed their password. Added a per-user "epoch" counter
   (`getUserEpoch`/`bumpUserEpoch`, `PropertiesService`) embedded in every
   token; `changePassword` bumps it, which invalidates every other
   outstanding token for that user on next use, while reissuing a fresh
   token for the device that just changed the password (returned as
   `res.token`, persisted by `app.jsx`'s `ChangePasswordModal` `onSave`).

**Not done — needs explicit sign-off, same as the item 2 GAS-deploy note
above:** this is source-only. The live Apps Script deployment (`AKfycbz8Nt...`)
still runs the old code until someone runs `clasp push && clasp deploy`
(or pastes `gas-backend.gs` into the Apps Script editor and redeploys) — see
`~/nicu-tools/neofeed/`. The auth-bypass fix in particular has zero effect
against the live backend until that happens.
