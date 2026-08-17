# Verification harnesses

Six Node scripts. Two check the TPN calculator against the **official KCMH
pharmacy worksheet** (กลุ่มงานเภสัชกรรม, ward 9B2/NICU), because those numbers
become compounding instructions — a wrong divisor is a wrong dose. The third
pins the clinical-target and calendar-date behaviour fixed in the 2026-08-08
code review, which the worksheet harnesses cannot see. The fourth pins the
three bedside-reported defects fixed on 2026-08-17 (bed label, log-entry DOL,
Intake/Output persistence). The fifth is the only thing here that exercises
`gas-backend.gs` at all, and the sixth drives the whole app in a real browser.

## Running

`verify-targets-and-dates.cjs` and `verify-gas-registry-upsert.cjs` need **no
dependencies at all** — run them directly:

```bash
node test/verify-targets-and-dates.cjs
node test/verify-gas-registry-upsert.cjs
```

`verify-bed-dol-io.cjs` and the two KCMH harnesses are the only things in this
repo that need `npm`; nothing
else does, and the app itself still has no build step. Dependencies are dev-only
and are **not** committed — install them into a scratch folder and point Node at it:

```bash
npm install --no-save react@18 react-dom@18 @babel/core@7 @babel/preset-react@7 jsdom
```

Then, from the repo root:

```bash
node test/verify-kcmh-constants.cjs && node test/verify-kcmh-factor.cjs
node test/verify-bed-dol-io.cjs
```

The browser runthrough additionally needs Playwright and a Chromium:

```bash
npm install --no-save playwright && npx playwright install chromium
node test/runthrough-app.cjs           # screenshots → test/.screenshots/
```

It also needs the **exact** pinned CDN versions in `node_modules`
(`react@18.3.1 react-dom@18.3.1 @babel/standalone@7.29.0`) — see below.

`verify-kcmh-factor.cjs` reads `DEAD` from the environment (mL of dead space,
default 20). Run it both ways — overfilled and not:

```bash
DEAD=20 node test/verify-kcmh-factor.cjs && DEAD=0 node test/verify-kcmh-factor.cjs
```

## What each one proves

**`verify-targets-and-dates.cjs`** — regression cover for the 2026-08-08 code
review fixes (`../CODE_REVIEW_2026-08-08.md`). 46 assertions, pure `data.js`, no
React and no jsdom. It freezes the clock at 19:00 UTC — 02:00 ICT, the night
shift — to reproduce directly the condition under which every `toISOString()`
date in the app used to return *yesterday*. It also asserts that
`TPN_TARGETS.k` and `TARGETS.k` agree at every DOL (their four-day divergence is
what exposed the potassium bug), that a parenteral prescription is never scored
against enteral protein/energy targets, and that GA `WW.D` decoding is
single-valued across both helpers.

These are the checks the two KCMH harnesses structurally cannot make: those
verify compounding arithmetic against the worksheet, and every defect this file
covers lives outside that surface.

**`verify-kcmh-constants.cjs`** — loads `data.js` and checks every
`KCMH_STOCK` strength against the divisor the worksheet uses, then reproduces
the worksheet's *own cached results* for its two starter recipes (sheets
`s tpn2` / `s tpn3`): osmolarity 856/896 mOsm/L, calories 46/48 kcal, component
total 59.9/63.4 mL, WFI 40.1/36.6 mL.

**`verify-kcmh-factor.cjs`** — transpiles the real `.jsx` through Babel, mounts
`<Calculator>` in jsdom, drives the actual inputs, and reads the numbers back
out of the rendered order form. It compares them against an **independent
transcription of the worksheet's formula chain** held in the script's `sheet()`
function — two implementations of the same documented formulas must agree.

It also asserts the identities the Factor exists to guarantee:

- delivered dose per kg comes back out **exactly as ordered**, for AA, Na and Ca
- **osmolarity and GIR are unchanged** by overfill (amount and volume scale
  together, so concentration is invariant)
- Soluvit and Peditrace are deliberately **not** scaled — the worksheet's
  compounding cells `G43`/`G45` use actual weight `C6`, while every electrolyte
  row uses the Factor `H9`. The app surfaces this as an info alert rather than
  silently "correcting" the sheet.

**`verify-bed-dol-io.cjs`** — regression cover for the three defects reported
from the ward on 2026-08-17. Sections 1 and 2 are pure `data.js`:
`normalizeBed()` collapses every legacy spelling of a NICU/SCN bed onto the
label the ward uses (and onto a value that actually exists in `BED_OPTIONS`,
which is what the old `"NICU 1-1"` default did not), while leaving iso rooms'
genuine room-bed pairs and unrecognized free-text beds alone; `entryDol()`
re-derives a saved log row's DOL from its calendar date, reproducing the
reported patient's rows (a row dated nine days into the admission that
displayed as "DOL 1").

Section 3 mounts the real `<Calculator>` in jsdom like the Factor harness does,
because the Intake/Output defect was an effect-ordering race that only exists
once mounted: reopening a saved entry restored `ioInput` and then immediately
had it overwritten with the not-yet-recomputed prescribed-fluid total, so the
field came back empty and the next save wrote that `0` over the real figure. It
asserts the round trip (restore → untouched re-save writes the same numbers),
the fallback to the `ioInput`/`ioOutput`/`drainContent` columns for a row whose
`calcInput` predates the card, and — in the other direction — that a brand-new
entry's Input still tracks the prescribed total live until the user types in it.

**`verify-gas-registry-upsert.cjs`** — the only harness that runs backend
code. `gas-backend.gs` is Apps Script, but every top-level statement in it is
a `var` constant or a function declaration, so the whole file evaluates in a
`vm` context against stubbed `SpreadsheetApp`/`Utilities`/`CacheService`
globals and the real `registerPatient()` can be called directly. The sheet
double throws on an out-of-bounds `getRange()` exactly as SpreadsheetApp
does, which is the defect being pinned: `registerPatient` upserts, and its
in-place write (`getRange(row, 1, 1, 18)`) used to throw on a
`Patient_Registry` tab narrower than 18 columns — a failed save when
*editing* a patient, while registering a new one kept working, because
`appendRow` widens the sheet itself. It now widens on demand, the same fix
`updateDailyNutrition` got for Daily_Log in `2b7d2a4`. The harness also
checks the no-op case on a wide grid, that `multiplesCount`/`currentBed`
land in columns R/K, and that `_sheetSafe`'s formula-injection guard still
applies on the widened path.

This one is worth extending whenever a backend function's sheet-range
arithmetic changes — it is cheap (no npm) and there is no other way to run
`gas-backend.gs` outside a live Apps Script project.

**`runthrough-app.cjs`** — the only harness that runs the whole app the way a
nurse does: it serves the repo statically **as-is** (no file edits, `index.html`
exactly as GitHub Pages would serve it), launches Chromium, logs in, and clicks
through the registry → dashboard → calculator. Two things a sandbox cannot
reach are intercepted: `unpkg.com` is answered from `node_modules`, and the
GAS URL is answered by an in-process fake backend that mirrors
`gas-backend.gs`'s response shapes **and records every write it receives**, so
the assertions can check what actually went over the wire rather than only what
the screen shows. Everything in between — `data.js`, `calculator.jsx`,
`log.jsx`, `registry.jsx`, `app.jsx` — is the shipped code.

The UMD bundles must be the exact versions the script tags pin, because
`index.html` carries SRI `integrity` hashes and Chromium rejects anything else.
That is a feature: a passing run is also proof those hashes still match the
versions named beside them.

Its fixture is the patient from the 2026-08-17 bug report — bed stored as
`"NICU 1-1"`, log rows whose stored `dol` disagrees with their own date, and an
entry carrying real Intake/Output figures — so the three defects would all be
visible on screen if they came back. It checks the rendered bed label and that
the picker offers nothing outside `BED_OPTIONS`, the DOL/day-admit columns and
their ordering, that reopening an entry restores Input/urine/drain and the
balance line, that editing drain and saving sends the right numbers to the
backend, that reopening round-trips them, and that a different entry does not
inherit them. It fails on any uncaught page error, and on any failed request
other than the two that are expected to be offline (Google Identity Services
and Google Fonts).

Screenshots land in `test/.screenshots/` (gitignored) — useful when a layout
question is easier to look at than to assert.

## Note on the source workbook

The worksheet these were derived from (`TPN 05082569.xlsx`) contained ~45 named
real-patient sheets alongside the templates. It was never committed to this repo
and is no longer on disk. Every constant and formula used here came from the
anonymous template sheets (`NEW Temphate`, `Starter TPN`, `s tpn2/3`), and the
expected values baked into these scripts are the only thing that survives from
it — no patient-level data is present in either script.
