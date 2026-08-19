# Verification harnesses

Ten Node scripts. Two check the TPN calculator against the **official KCMH
pharmacy worksheet** (กลุ่มงานเภสัชกรรม, ward 9B2/NICU), because those numbers
become compounding instructions — a wrong divisor is a wrong dose. The third
pins the clinical-target and calendar-date behaviour fixed in the 2026-08-08
code review, which the worksheet harnesses cannot see. The fourth pins what the
registry reports back to the ward — who has been logged today and who still
needs an entry. The fifth pins the three bedside-reported defects fixed on
2026-08-17 (bed label, log-entry DOL, Intake/Output persistence). The sixth and
seventh are the only things here that exercise `gas-backend.gs` at all — the
registry upsert, and session revocation on the auth path. The eighth pins the
2026-08-18 code review: that a background re-sync doesn't tear the workspace
down mid-entry, and that the registry/admin lists report the ward's own numbers
back to it. The ninth pins the patient-record fields that were read-only until
2026-08-19 — GA, birth weight and sex — staying correctable without the
sessionId moving under the log. The tenth drives the whole app in a real
browser.

## Running

`verify-targets-and-dates.cjs`, `verify-gas-registry-upsert.cjs` and
`verify-gas-session-revocation.cjs` need **no dependencies at all** — run them
directly:

```bash
node test/verify-targets-and-dates.cjs
node test/verify-gas-registry-upsert.cjs
node test/verify-gas-session-revocation.cjs
```

The two KCMH harnesses, `verify-registry-logged-today.cjs`,
`verify-bed-dol-io.cjs` and `verify-patient-ga-bw-edit.cjs` are the only things
in this repo that need `npm` (they
mount real components in jsdom); nothing else does, and the app itself still
has no build step. Dependencies are dev-only
and are **not** committed — install them into a scratch folder and point Node at it:

```bash
npm install --no-save react@18 react-dom@18 @babel/core@7 @babel/preset-react@7 jsdom
```

Then, from the repo root:

```bash
node test/verify-kcmh-constants.cjs && node test/verify-kcmh-factor.cjs
node test/verify-registry-logged-today.cjs
node test/verify-bed-dol-io.cjs
node test/verify-resync-and-lists.cjs
node test/verify-patient-ga-bw-edit.cjs
```

`verify-resync-and-lists.cjs` is the only one that mounts the **whole**
`<App/>` (against a stubbed `fetch`, with `window.NEOFEED_GAS_URL` set so the
GAS code paths are live) rather than a single component, because the defect it
pins — the app blanking to its first-load spinner on every focus re-sync — only
exists at that level. It drives the real Calculator through a real focus event,
so it also serves as the closest thing here to an integration test.

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

**`verify-registry-logged-today.cjs`** — mounts the real `<PatientRegistry>` in
jsdom and reads the counts straight off the rendered stats strip and the
per-patient `LOGGED` / `NEEDS ENTRY` badges. It exists because the registry
once reported "0 logged today · everyone needs entry" on a ward that had been
logging all morning: the counts were computed correctly from the wrong values.
It pins all three causes — a Daily_Log `ts` that comes back from Sheets as a
date *value* (so `e.ts === todayLocal()` is false for a Date, always), a
"logged today?" check that only looked at the last array element (a back-filled
past date is appended after today's entry and hid it), and an Active tile
counted over a different patient set than the Needs-entry tile beside it. The
assertion that logged + needs entry === active is the one that keeps the strip
internally honest.

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

**`verify-patient-ga-bw-edit.cjs`** — mounts the real `<EditPatientModal>` in
jsdom and drives its fields, because what it pins is the payload the modal
submits. GA, birth weight and sex were a read-only chip strip there until
2026-08-19, so a registration typo (the reported one was a BW keyed as 1090)
could only be corrected by deleting the session and re-registering it — which
takes the whole Daily_Log with it, since `deletePatient` drops every row for
the sessionId. The two invariants that make editing them safe are what the
assertions are for: the **sessionId is not re-derived** from the corrected BW
(it is the key both tabs are matched on — regenerating it strands the log), and
GA stays **`WW.D` shorthand** rather than decimal weeks, seeded through
`gaTotalDays` so a hand-edited `27.9` in the sheet comes back as 27+6. It also
covers the birth measurement following a corrected BW only while
`weights[0].w` still matches the old one, that neither field can be *cleared*
(the same gate registration applies — a 0 there corrupts every subsequent
dose), and that a GA outside 22–43 wk is neither preselected nor offered but
must be re-picked before the record can be saved — with a structural check
that both modals render the one shared `GA_WEEK_OPTIONS` list, so the range
can't drift between register and edit.

**`verify-gas-registry-upsert.cjs`** — one of the two harnesses that run
backend code. `gas-backend.gs` is Apps Script, but every top-level statement in it is
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

**`verify-gas-session-revocation.cjs`** — the same `vm` technique pointed at
the auth path. Sessions live in `CacheService` for `SESSION_TTL_SECONDS`
(21600 — 6h, Apps Script's cap) and used to be trusted wholesale for that
window: only the user *epoch* was re-checked, which a password change bumps,
so nothing re-read `role` or `active`. Disabling or demoting someone in the
Staff tab left their existing session working, with its old role, for up to
six hours. `verifyToken` now re-reads the Staff row behind a 60s cache
(`_getStaffRowCached`). The harness pins both halves — that revocation
happens (disable, demote, rename, deleted row) and that the caching caches
(one sheet read per user per minute, not one per request, negative results
included) — plus the `exp` check in `verifyGoogleIdToken` and
`createSession`'s `mustChangePassword` flag.

Unlike the sheet double above, the `CacheService` and `PropertiesService`
doubles here are **real stores**, not no-ops, because the caching behaviour is
itself under test; the cache double also records the TTL each key was written
with, so the 60s bound is asserted rather than assumed.

Worth knowing: these changes were recovered from an uncommitted working copy
with no known author (branch
`security/session-revocation-and-registry-lock`), so the harness was written
against the *intended* behaviour rather than to ratify the code. It was
checked by running it against the unpatched `origin/main` backend, where 18
of the 31 assertions fail — a disabled account still returning a live admin
session, a demoted admin still reporting `admin`. If you change this area,
re-run it against both versions; a security test that cannot fail is worth
nothing.

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

Its fixture is the patient from the 2026-08-17 bug reports — bed stored as
`"NICU 1-1"`, log rows whose stored `dol` disagrees with their own date, an
entry carrying real Intake/Output figures, and one row whose `ts` arrives in
the stringified-`Date` shape the live sheet can return — so every defect fixed
that day would be visible on screen if it came back. The malformed-`ts` row is
also the one with a stale `dol`, so it only renders correctly if `ts`
normalization and the DOL re-derivation both work, which is the one real
interaction between that day's two sessions. It checks the rendered bed label and that
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
