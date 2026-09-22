# Verification harnesses

Twenty-four Node scripts. Two check the TPN calculator against the **official KCMH
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
sessionId moving under the log. The tenth pins the admin-only, permanent
"Delete session" flow — client button gating, the confirm dialog, and the
server's own cascade + role re-check. The eleventh drives the whole app in a
real browser. The twelfth pins **M1, the first product metric this repo has
ever had** — weekly active users off `Audit_Log` — and treats its two PDPA
constraints as correctness rather than good manners: distinct `actorEmail` per
week (never row counts, which since the focus re-sync measure how long a tab
was open), and **no staff email in the output at all**, asserted by serialising
the whole result and failing on an `@`. The thirteenth and fourteenth are the
two halves of the 2026-08-21 `mustChangePassword` fix — the server gate, and
what the client does when it meets that gate mid-session. The fifteenth pins
the 2026-08-25 server-side plausibility guard on `doPost`'s three write
paths — `registry.jsx`'s inputs had no upper bound at all, so nothing before
this stopped an out-of-range value reaching Patient_Registry/Daily_Log via a
direct POST. The sixteenth pins the **provenance stamp** — `CONSTANTS_VERSION`/`APP_VERSION` into
Daily_Log AF–AG and onto the printed order form — including that the columns land at index
31/32 without shunting anything before them, that a save with no version still writes 33 columns
rather than throwing, and that a Daily_Log tab predating AF–AG is widened on **both** the
create and update paths. The seventeenth pins `syncFreshness()`, the decision behind the offline/
staleness banner: offline outranks a sync error, a failure one second ago is not freshness, and a
clock that jumps backwards must not read as fresh. The eighteenth pins the 2026-08-26
Current-weight / TPN-calc-weight split in Step 1: the calc weight floors at birth weight until
regained, tracks current weight automatically once it clears it, re-floors if weight drops back
down, and the Daily_Log `weight` column stays the actual entered weight throughout. The nineteenth pins the two items acted on from
the **Nutrition Unit's AUG 2026 review** — that every salt caption states the mEq→mL conversion it
performs and separates compounded from delivered, and that the oral Ca/P timing advisory appears
exactly when both are ordered. It is the only harness here whose subject is **legibility rather
than arithmetic**: what it guards against is a correct number being read as a wrong one.

The twenty-third, `verify-review-0911.cjs`, pins every fix from the **2026-09-11 full review**: the
backend half (revision forks, Submit locking, login records, date moves, unregistered patients,
the sync window, audit rows) in a vm sandbox, and the frontend half in jsdom — a critical tile
always being a critical alert with a required override reason, the print form never showing
unsaved edits, draft recovery, the Glycophos phosphate line and the mobile twin label. It needs the
same jsdom dependencies as the harnesses below.

The twenty-fourth, `verify-sync-gate-and-poll.cjs`, pins the **2026-09-16 sync work**, and it is
the only harness here that measures a *layout*. The staleness banner is a bare
`<div role="status">` child of `.app`, and `.app` was a two-row grid with nothing after `.topbar`
placed explicitly — so grid auto-placement gave the banner the rail's cell, pushed the rail into
the workspace column, and left the workspace 232 px wide and clipped. The app's layout therefore
broke in exactly the two states the banner exists to announce. Section 1 asserts the grid contract
in **both** hand-synced shells and then measures all four boxes in real Chromium at 1440 and
390 px, with and without the banner — static CSS assertions cannot see what a browser does with
auto-placement, which is the whole lesson of that bug. Sections 2-4 drive the real `<App/>` in
jsdom: the first-load gate holds on a *failed* first sync (it used to fall through and render an
empty registry as fact while the server was down) and its retry re-issues exactly one request; a
visible tab re-syncs on its own every `SYNC_POLL_MS` while a hidden or offline one does not — the
absence of any such poll is what the ward reported as "sync นานกว่าปกติ"; and of two overlapping
syncs the **newer** response wins rather than the last to arrive.

`verify-review-0917-calc.cjs` and `verify-review-0917-drafts.cjs` pin the **2026-09-17 calculator
review**. The first is about when an order may reach the pharmacy form: the lipid 4.5 / K 3.5 /
NPE:AA 20–32 hard limits judged on the IV portion only (Praew's decision — full enteral feeds used to
raise critical alerts that could only be cleared by typing a reason), with the F1 invariant re-checked
across full feeds, IV breaches and a no-volume bag; a digest of every printed figure for six orders,
captured from `42ce553`, so nothing printed moved (electrolyte `r1` rounding is deliberately
unchanged until pharmacy confirms the Na dose); ingredients with TPN volume 0 blocking Save and Print;
yesterday's urine output and drain never satisfying today's required fields; and Print withheld when
a birth-weight edit re-doses a saved order, when a critical alert is not named in the saved reason, or
when the row is still an optimistic `tmp_` insert (also unclickable in `log.jsx`). The second pins
unsaved work: a draft is offered only to the user who typed it, drafts expire at 72 h and
"previous submission" state at 7 days for every patient on mount, a save conflict's typed order comes
back after the reload and saves as an ordinary edit of the newer row, and a new order open across
midnight keeps its date, DOL, typed zeros and draft key. Both fail against `42ce553` (70 of 117 and
23 of 39 assertions).

`verify-ward-requests-0918.cjs` pins **three requests from the NICU team (2026-09-18)**, with the
screenshot's own order as its fixture. **MEN** — a trophic feed ticked MEN counts toward no nutrient total
(tiles, Step 6 EN row, alerts, saved `Daily_Log` figures, printed totals, copied order) while Step 2 still
shows what the feed provides; an unticked control proves the harness can see EN at all; a Ca-with-no-IV-P
order whose only P was the MEN feed now raises the no-P stop; and Praew's guard warns (never stops) when
MEN is ticked above `MEN_MAX_ML_KG`. **Magnesium** — a Step 4 tile against `TARGETS.mg`, in mEq so the
ESPGHAN bounds 0.2 / 0.4 read in range, with its own alert line citing the parenteral guideline even on
full feeds. **Aminoplasmal 15%** — contraindicated under 2 years, so `aaProductsFor` offers it on no ward
today (NICU, iso, SCN, blank and free-text beds all get Aminoven); a saved Aminoplasmal order reopened on
NICU recomputes as Aminoven and cannot print until saved again; and, with the ward gate stubbed, the
future-ward path (product buttons, 0.15 g/mL, print, copy, saved choice, "changes vs previous order") works
end to end while the Center Point entry stays Aminoven only. **Dead space** (§10) — a new NICU/SCN order
starts at 30 mL and the Factor follows; a new day keeps a dead space somebody set and turns the old
default's 0 into 30; a saved order reopens with its own; the 0 chip still overrides; a feeds-only day
prepares no bag. **Vitamins** (§11) — Soluvit and Peditrace scale with the overfill (2.5 mL in a 150 mL
bag for a 2 kg infant on a 120 mL day, delivering 2 mL), the old info line is gone, the print, bag make-up
and copied order agree, and the 10 / 15 mL caps apply to what the infant receives. **Reprints** (§12) — a
save stamps `calcInput.constantsVersion`; a saved order stamped with another version, or an unstamped one
whose printout this release changed (overfilled vitamins, a MEN feed), prints only after it is saved
again, while other old orders print as before. A row saved on `fc2c35c` (live from 11:17 ICT on
2026-09-18, before the stamp shipped) is dated by its `aaProduct` key and prints as-is. 193 assertions: it
fails 112 against `f0c172c`, 24 against `3f35ef8` (PR #75 merged) and 12 — the pre-deploy review's fixes —
against `fc2c35c`. A harness row that stands for a current order carries the current stamp
(`verify-kcmh-factor.cjs`).
Since the dead-space change, a harness order that means "no dead space" types 0
(`verify-review-0917-calc.cjs` §6, `verify-center-point-print-parity.cjs`).

`verify-tpn-team-0922.cjs` pins **the KCMH TPN team's feedback and Praew's rules of 2026-09-22**.
**Zinc** — a ZnSO₄ line in mg of elemental Zn/kg/d, a total with Peditrace's delivered mL × 0.25 mg,
exactly 5 mg/day passing and 5.1 stopping at Save (confirm + reason), saved as `calcInput.znPerKg`,
diffed, compounded × Factor, printed as typed, copied, part of the no-volume stop, and absent on Center
Point. **Lipid** in g/kg/h beside the pump rate. **MEN** named beside the Step 3 totals it is left out of.
**Glycophos** mL/day beside its mEq Na/day. **The Save stop** asks "ยืนยันการสั่งหรือไม่?" and the back
sheet says "แพทย์ยืนยันคำสั่ง". **The saver's name** is saved with the order and shown only while it
belongs to the row's server-stamped email. **K⁺ in bag** has its own tile; the stop stays at 40 mEq/L.
**The two-sheet order** (§10): one row per product so no figure sits on another product's line, ordered
products bold, the paper form's own choices printed unticked, no alert text on the doctor's front, and
the Factor, bag recipe and confirmation on the back. **No trailing zero or float noise** (§8) in any text
node of the calculator, the form or the copied order, or in the daily log fed the live Sheet's float
noise; `D.displayNum` is pinned case by case (§9), and a 1234 g infant is computed from its grams while
its kg shows to 2 decimals (§11). It fails 33 against `6ee2762`.

`verify-quick-calc.cjs` pins the **Quick calc** (2026-09-21, ward request: a floating button that
calculates from a typed weight and saves nothing). It exists because that feature makes two claims
that would rot quietly. The first is that it is *the same calculator* — so § 1 mounts the real
`<Calculator>` twice, once with `scratch` and once patient-bound, drives the identical order into
both, and fails on the first disagreement across every metric tile and every figure rendered inside
the six wizard steps; a non-zero GIR is asserted separately so a page of zeros cannot make that pass
vacuously. The second is that it *persists nothing*: § 2 drives the quick calc and then reads
`localStorage`, and — this is the load-bearing half — drives the patient entry through the same
keystrokes and requires that one **did** write its unsaved-order draft. Without it the assertion
passes for the wrong reason, which is exactly what happened while writing this harness: `calculator.jsx`
writes through a bare `localStorage`, which under `vm.runInThisContext` resolves against the global
scope, so the writes threw inside their own `try/catch` and the store was empty because nothing could
write at all. (The same applies to the bare `navigator` the Copy button uses, and Node 22 ships a
read-only `globalThis.navigator` that has to be redefined rather than assigned.) § 3-§ 4 then pin what
the mode may not produce — no Save, no Submit, no delete, no `#print-form`, no Intake/Output card —
and that the text it *does* copy names itself as not a treatment order and carries neither bed nor
NeoFeed ID. § 5-§ 7 are source-level: `SCRATCH_PATIENT` carries no identifiers and a birth weight of
0, `QuickCalcView` passes no save handler of any kind, every write path in `calculator.jsx` is behind
the flag, and the button is styled in both hand-synced shells and hidden when printing. It also pins
where the button is: since 2026-09-22 the Ward page only (the gate and the ward's list), with ← back to
the Ward page and the workspace padded clear of the button while it shows.

`verify-status-zones.cjs` pins the **range bars' green / yellow / red zones** (Praew, 2026-09-22: "สีเขียว
OK, สีเหลืองระวัง สีแดง alert"). The claim is that a bar can never disagree with its own tile, so it
mounts the real `<Calculator>` on three orders — mixed, past the hard limits (GIR ≈ 15, protein 5,
peripheral line, calcium with no phosphate), thin — and checks the rendered page: every needle sits in the
zone of its tile's status, GIR's inline readout included (§ 1); each bar is tiled edge to edge, and red
appears only where a tile has a hard limit — GIR above 13, protein 4.8, K⁺ in bag 40, peripheral
osmolarity 900 (§ 2); 0 and "!!" draw no needle, because neither is a point on the scale (§ 3); and both
shells style every zone (§ 4). § 2 also reads the source, so a hard-limited tile added later cannot skip
handing its rule to its bar. Withholding GIR's and protein's rules from their bars fails it 11 times.

`verify-build-shells.cjs` pins the **2026-09-17 build step**, which replaced in-browser Babel with
`tools/build.mjs` (`REFERENCE.md` § The frontend build). It is dependency-free and reads files only:
both shells load nothing but `boot.js`, `vendor/` React, `data.js`, `compiled/*.js` and Google
Sign-In, with no inline `<script>`, no `text/babel` and no unpkg, in the exact load order with
`boot.js` first in `<head>`; every `?v=` token is the SHA-256 prefix of the file it loads;
`vendor/` is byte-identical to the React builds the shells used to pin by SRI; `_headers`'
`script-src` is `'self'` plus Google Sign-In and nothing looser; `.assetsignore` and `_config.yml`
publish every file the shell loads (a missing `boot.js` silently drops the app into LOCAL MOCK
MODE) and keep `tools/` private; the Google Fonts stylesheet sits after the last script; and
`appVersion()` still turns the new script list into the provenance stamp. The CSP and the shells
only work as a pair — the new CSP renders the old shells blank — so it checks both halves. It fails
33 of 43 assertions against `claude/review-0917` (the tree before the build step), and each of the
build's own refusals and this harness's checks was proven to catch a deliberate breakage.

`verify-login-endorsement.cjs` pins the Valhalla line at the foot of the login screen as Praew
last set it on 2026-09-22: one line, "by Valhalla Health · © 2026". It also pins what that line no longer
has: no Guardian V (no `<img>`, no `.login-endorse img` rule in either shell, no
`icons/valhalla-guardian-v.png`) and no version line. Source-level and CRLF-normalised, no dependencies:
`node test/verify-login-endorsement.cjs`. It fails 5 of 11 against `76f7610`, where the Guardian V was
still stacked above "by Valhalla Health". The earlier version, which pinned that stacked lockup, failed
5 of 7 against `e39f66b`.

`verify-neofeed-mark.cjs` pins the **two-tone N** Praew approved on 2026-09-22 (no dot; a Sage left
stem, the diagonal and right stem in Forest). `icons/icon.svg` is the master: two filled shapes on the
approved jade tile, no `<circle>`, no stroke. The login wordmark must draw the same two paths with the
same four gradient colours, so the app icon and the wordmark cannot drift apart. It decodes all seven
PNGs with Node's own `zlib` (a small in-file reader, no dependencies) and checks what each one actually shows:
the jade tile as the ground, Forest present but no longer the whole tile, no white, the Sage stem left of
the Forest body, and the right corners (transparent on the "any" icons, opaque on the maskable and Apple
ones). A re-rendered master without re-rendered PNGs, or the reverse, fails. It also checks that the
weight "Feed" is set in is one the Google Fonts link loads. `node test/verify-neofeed-mark.cjs`. It
fails 54 of 70 against `75a3038` (the N+dot), and six deliberate breakages were each caught: a gradient
stop, one path coordinate, the dot put back, an unloaded weight, the rule's Sage half, one stale PNG.
Since 2026-09-22's second round it measures the letter as well: 52–57% of the square on the whole-square
icons and 36–42% on the maskable pair, whose furthest ink must also sit inside Android's 66/108 dp
circle (Praew: "Install icon ... มัน fit ไป"); the light stem is measured against the letter's ink, not
the tile, so the smaller maskable letter does not read as a missing stem. The maskable PNGs before that
change fail it 4 times. The PNGs are rendered by `tools/render-icons.cjs`.

**`compiled-loader.cjs` is not a harness** but a `--require` preload that runs the harnesses
against the shipped `compiled/*.js` instead of their in-harness `@babel/preset-react` transform of
the `.jsx` sources — no harness is edited for it:

```bash
NODE_OPTIONS="--require ./test/compiled-loader.cjs" node test/verify-resync-and-lists.cjs
```

It swaps a module only when the harness transforms the whole, unmodified `.jsx` file, throws
otherwise, and prints which modules it replaced. Source-text assertions (regexes over the `.jsx`)
still read the sources, which is what they pin.

**CI:** `.github/workflows/test.yml` first rebuilds with `npm ci --prefix tools && node tools/build.mjs`
on the clean checkout and fails if that changes anything (stale or hand-edited `compiled/`, or
shell tokens), then checks shell byte-identity, then runs every `verify-*.cjs` (plus `DEAD=0` for
the Factor harness) **twice** — against the sources, then with the compiled preload, where a harness
that mounts modules but swapped none fails the step. It runs on each pull request and on pushes to
`main`/`release`.
CI installs no browser, so `verify-sync-gate-and-poll.cjs`'s Chromium measurement prints a SKIP
there and its static CSS assertions carry the section; run it locally (with `playwright`
installed) to get the real measurement.

## Running

`verify-targets-and-dates.cjs`, `verify-gas-registry-upsert.cjs`,
`verify-gas-session-revocation.cjs`, `verify-usage-metrics.cjs`,
`verify-must-change-password.cjs`, `verify-input-validation.cjs`,
`verify-provenance-stamp.cjs`, `verify-sync-freshness.cjs`,
`verify-publish-lock.cjs`, `verify-build-shells.cjs` and `verify-chula-google-signin.cjs` need **no dependencies at all** — run them directly:

```bash
node test/verify-build-shells.cjs
node test/verify-targets-and-dates.cjs
node test/verify-gas-registry-upsert.cjs
node test/verify-gas-session-revocation.cjs
node test/verify-usage-metrics.cjs
node test/verify-must-change-password.cjs
node test/verify-input-validation.cjs
node test/verify-provenance-stamp.cjs
node test/verify-sync-freshness.cjs
node test/verify-publish-lock.cjs
node test/verify-chula-google-signin.cjs
```

`verify-sync-gate-and-poll.cjs` needs the jsdom set below, and additionally
uses `playwright` **if it is installed** — without it the harness still runs and
simply reports SKIP for the Chromium measurement. To get that measurement:

```bash
npm install --no-save --no-package-lock playwright
node test/verify-sync-gate-and-poll.cjs
```

The two KCMH harnesses, `verify-registry-logged-today.cjs`,
`verify-bed-dol-io.cjs`, `verify-patient-ga-bw-edit.cjs`,
`verify-delete-session.cjs`, `verify-forced-password-client.cjs`,
`verify-tpn-calc-weight.cjs`, `verify-required-log-fields.cjs`,
`verify-center-point-entry.cjs`, `verify-center-point-print-parity.cjs`,
`verify-center-point-drafts-view.cjs`, `verify-center-point-order-changes.cjs`,
`verify-nutrition-unit-review.cjs`, `verify-review-0917-calc.cjs`,
`verify-review-0917-drafts.cjs`, `verify-ward-requests-0918.cjs`,
`verify-tpn-team-0922.cjs` and
`verify-picker-print-identity.cjs` are the only things
in this repo that need `npm` (they
mount real components in jsdom); nothing else does. (The frontend build has its
own pinned install, `npm ci --prefix tools`, which the harnesses do not need:
they transpile the `.jsx` themselves, or read `compiled/` through
`compiled-loader.cjs`.) Dependencies are dev-only
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
node test/verify-delete-session.cjs
node test/verify-forced-password-client.cjs
node test/verify-tpn-calc-weight.cjs
node test/verify-required-log-fields.cjs
node test/verify-center-point-entry.cjs
node test/verify-center-point-print-parity.cjs
node test/verify-center-point-drafts-view.cjs
node test/verify-center-point-order-changes.cjs
node test/verify-nutrition-unit-review.cjs
node test/verify-picker-print-identity.cjs
node test/verify-ward-requests-0918.cjs
node test/verify-tpn-team-0922.cjs
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

It no longer needs React or Babel in `node_modules`: since the 2026-09-17 build step the
app loads React from `vendor/` and its modules from `compiled/`, straight from the repo.

To run every harness against the shipped compiled output, as CI's second pass does:

```bash
NODE_OPTIONS="--require ./test/compiled-loader.cjs" node test/verify-kcmh-factor.cjs   # any verify-*.cjs
```

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
- Soluvit and Peditrace are **the one named departure from the sheet** (since
  2026-09-18, Praew). The worksheet's compounding cells `G43`/`G45` use actual
  weight `C6`, while every electrolyte row uses the Factor `H9`. Until then the
  app followed the sheet and showed an info alert that an overfilled bag
  under-delivered them. Now it scales them by the overfill too, so they come
  back to the ordered 1 mL/kg. `sheet()` is left exactly as the workbook
  computes, and the harness adds the difference as `vitExtra`: the vitamin mL,
  components and WFI on an overfilled bag.

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

Sections 1b-1c were added on 2026-09-15 with the ward's one-patient-per-bed
rule: `bedOccupancy`/`bedOccupant` (a discharged patient frees their bed, an
unbedded one occupies nothing, a legacy spelling still collides with the bed
it names, and excluding a patient frees their own bed so re-saving them is
never blocked), `nextFreeBed` (the lowest free running number in a ward, `""`
when the ward is full — never a wrong bed), and `wardGroup`, which decides
which tile of the registry's ward gate a patient appears under. The bed list
itself now comes from `data.js` rather than being re-listed here: a second
copy in the harness would pass while the app rendered a different set of beds,
which is the exact class of defect this file exists for. It also pins that
`registry.jsx` does **not** re-declare `const BED_OPTIONS` — the two files
share one global lexical scope, so that is a parse-time redeclaration that
kills the page, and it happened during this change.

`bedBlocker` was added the same day, in 2026-09-15 (2). It answers "who stops this record being
saved on its bed", and a record that is not on the unit is stopped by nobody. A discharged record
still carries the bed label it left from, so without this rule, correcting it after that bed was
reused read as a double-book. There is also a structural check that `app.jsx`'s `bedConflict` calls
`bedBlocker` rather than re-deriving the rule.

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

Section 7 (2026-09-15 (2)) mounts the modal for a discharged record whose bed now holds another,
active infant. Save stays enabled, the correction is submitted with `statusDate` unchanged, and
picking Active in the form blocks Save and names the infant in the bed.

**`verify-delete-session.cjs`** — pins the admin-only, permanent "Delete
session" flow end to end, written after a ward question ("can a whole session
be deleted?") was answered by reading the code rather than by a bug report.
Three parts:

- `deletePatient()` itself, called directly through the same `vm`-sandbox
  technique as `verify-gas-registry-upsert.cjs`: it removes the matching
  `Patient_Registry` row **and** every `Daily_Log` row for that `sessionId`,
  leaves a different patient's registry row and log rows untouched, takes and
  releases the script lock, and rejects a missing/unknown `sessionId` without
  touching either sheet.
- `doPost`'s `"deletePatient"` branch — a structural check (regex over the
  branch's own source slice, same technique as the GA/BW harness's shared-list
  check) that the `user.role !== "admin"` gate runs *before* the delete, and
  that `logAudit("deletePatient", …)` runs *after* it succeeds. Not exercised
  end-to-end: no harness here stubs `ContentService`'s chainable
  `setMimeType()` output, so this is the cheapest thing that would actually
  fail if the gate or the audit call were ever removed.
- `<EditPatientModal>`'s "Delete session" button, mounted for real in jsdom
  (same technique as `verify-patient-ga-bw-edit.cjs`): the button does not
  render at all when `onDelete` is `undefined` — the shape
  `role === "admin" ? handleDeletePatient : undefined` in `app.jsx` produces
  for anyone who isn't an admin — declining `window.confirm()` calls neither
  `onDelete` nor `onClose`, accepting it calls `onDelete` with the patient
  being edited and then closes, and the confirm text itself names the patient
  and says the deletion is permanent and irreversible (`ถาวร` /
  `ไม่สามารถย้อนกลับได้`) rather than a generic "are you sure?".

Not covered here: `app.jsx`'s `handleDeletePatient` — the optimistic
client-side removal that rolls back on any server failure (error,
unauthorized, or a network exception; `gasPost` never throws past its own
try/catch, so the rollback branch always runs). That would need the full
`<App/>` mount `verify-resync-and-lists.cjs` uses; worth adding there if this
flow ever regresses in a way the three checks above don't catch.

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

Section 6 pins the server-side one-infant-per-bed rule in `_bedConflict`, including that a record
not on the unit (Discharged/Transferred/Expired) can be edited after its old bed has been reused,
while an Active or blank-status one on that bed is still refused.

This one is worth extending whenever a backend function's sheet-range
arithmetic changes — it is cheap (no npm) and there is no other way to run
`gas-backend.gs` outside a live Apps Script project.

The collision-guard section also carries a case added in the 2026-09-10
identification review: registering a second twin under the *same* Multiples
letter as an already-registered sibling (same initials, same integer BW, same
`twinSuffix` by mistake) is refused exactly like any other duplicate
`sessionId` — this doesn't add new guard logic, it documents the specific
nurse-facing mistake ("picked A for both twins") that the generic
same-initials-same-BW case already covers.

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
through the registry → dashboard → calculator. One thing a sandbox cannot
reach is intercepted: the GAS URL is answered by an in-process fake backend that
mirrors `gas-backend.gs`'s response shapes **and records every write it
receives**, so the assertions can check what actually went over the wire rather
than only what the screen shows. Everything in between — `boot.js`, `vendor/`
React, `data.js` and `compiled/*.js` — is the shipped code.

Until 2026-09-17 it also answered `unpkg.com` from `node_modules` with the exact
React and Babel builds the shells pinned by SRI. The build step removed both
from the page, so now the reverse is asserted: every script comes from the
served repo or Google Sign-In, and `compiled/app.js` and `vendor/` React were
the ones loaded. A request to unpkg fails the run. The SRI pin itself moved to
`tools/build.mjs` and `verify-build-shells.cjs` §3.

Its fixture is the patient from the 2026-08-17 bug reports — plus, since
2026-09-15, a roommate on `NICU 5` so the one-patient-per-bed rule has a bed
to hold — bed stored as
`"NICU 1-1"`, log rows whose stored `dol` disagrees with their own date, an
entry carrying real Intake/Output figures, and one row whose `ts` arrives in
the stringified-`Date` shape the live sheet can return — so every defect fixed
that day would be visible on screen if it came back. The malformed-`ts` row is
also the one with a stale `dol`, so it only renders correctly if `ts`
normalization and the DOL re-derivation both work, which is the one real
interaction between that day's two sessions. Since 2026-09-15 it also clicks through the ward gate on the way in (the app
no longer lands on the patient list), checks that the roommate's bed is
offered-but-disabled in the picker while the patient's own stays selectable,
and drives the editable TPN calculation weight: that it is a real input, that
overriding it raises the `แก้เอง` flag alongside the automatic figure, and that
`ใช้ค่าอัตโนมัติ` puts it back. It checks the rendered bed label and that
the picker offers nothing outside `BED_OPTIONS`, the DOL/day-admit columns and
their ordering, that reopening an entry restores Input/urine/drain and the
balance line, that editing drain and saving sends the right numbers to the
backend, that reopening round-trips them, and that a different entry does not
inherit them. It fails on any uncaught page error, and on any failed request
other than the two that are expected to be offline (Google Identity Services
and Google Fonts).

Screenshots land in `test/.screenshots/` (gitignored) — useful when a layout
question is easier to look at than to assert.

**`verify-usage-metrics.cjs`** — pins **M1, the first product metric this repo
has ever had**: weekly active users, read off `Audit_Log`. No new
instrumentation was needed — the PDPA accountability trail has recorded
`readRegistry` with an actor email on every `getActivePatients` all along — so
`usageMetrics()` is a pure function over rows and this harness never touches a
sheet. 30 assertions.

Two of them are compliance, not correctness-in-the-usual-sense, and are written
that way on purpose. Test 1 feeds **500 rows from one nurse in one week** and
asserts the answer is **1**: since `syncFromGAS` began firing on tab focus a row
count measures how long a tab was left open, not usage. Test 9 serialises the
entire result and fails on an `@`, on the string `kcmh`, and on any per-actor
key — `Audit_Log` holds staff email under an accountability basis, and a
per-staff figure would be personnel monitoring under a different one.

It also pins two traps a naive implementation walks into. Sheets coerces the
`ts` column, so `getValues()` returns **Date objects for some rows and strings
for others in the same column** (test 5). And weeks are cut in **ward-local time
(UTC+7)**, because bucketing in UTC files a Monday 06:00 round — Sunday 23:00
UTC — under the previous week (test 7). That test is the one that fails if
someone later "simplifies" the offset away.

**`verify-must-change-password.cjs`** — the server half of the 2026-08-21 fix,
43 assertions, driving the real `doPost` in a `vm` sandbox.

The gap it closes: `mustChangePassword` was enforced **only in the client**.
`login()` reported it and `verifyToken()` even recomputed it from Staff col G on
every single request — and then nothing on the server ever acted on it. The only
thing between an auto-provisioned ~40-bit temp password, sitting in clear text
in Staff col H for a human to relay, and the whole registry was `app.jsx`
choosing to render `<ChangePasswordModal forced>`. Anything that skipped that
render — curl, a stale bundle, a second tab restored from `sessionStorage` — was
fully authorised. Before the fix this harness failed 23 assertions, one of them
being that the refusal carried no patient payload: it did.

It pins that every action is refused, that **an admin gets no exemption**, and
— just as importantly — that `changePassword` keeps working, because a gate with
no exit is a permanent lockout. Part 4 pins that the **sheet** governs and not
the token: flagging col G closes a session already in flight, clearing it
restores that same session without a re-login. Part 6 pins that Google/Workspace
accounts are never gated, since they have no password to change and so no way
out.

**`verify-forced-password-client.cjs`** — the client half. Mounts the real
`<App/>` in jsdom and flips the stubbed server to refusing **mid-session**,
which is the only way a browser ever meets that refusal: in the normal flow
`App` renders the forced modal before a single request goes out.

Writing it surfaced the thing that made the fix two branches instead of one:
**`syncFromGAS` does not go through `gasPost`.** It issues its own `fetch`, and
it is the call that fires on login, on tab focus and on day rollover — so the
most frequent authenticated request in the app took a completely separate error
path, where the refusal did nothing but turn the sync pill red.

Note the trigger it uses: the header's "Sync now from GAS" button, not a
synthetic `focus` event. The focus listener is throttled to one call a minute
(`RESYNC_AFTER_MS`), so on a freshly-loaded app a focus event is swallowed and
nothing is sent — the first version of this harness failed for exactly that
reason and looked like a product bug.

**`verify-staff-cache-password-writes.cjs`** — the gate's exit, found stuck on 2026-09-22. `verifyToken`
reads the Staff row through a 60 s cache that carries col G, and the `changePassword` request had just
cached col G `TRUE`. So after a successful forced change the rotated token, and a fresh sign-in with the
new password, answered `PasswordChangeRequired` until the cache expired, and the client put the forced
screen back up. The harness drives each function that writes a Staff row's cols E–H (`changePassword`,
`setInitialPassword`, `clearStaffPassword`, `onEdit`, `backfillDefaultPasswords`) and requires the next
request to see the write. That includes a row re-added by `setInitialPassword` after its "not found" was
cached, and the two provisioners, where the stale copy failed **open**: col G read blank, so a sign-in
on a brand-new temp password passed the gate. It also pins that the cache still caches (one Staff-tab
read after a change), that a cache failure while dropping the copy neither fails the change nor skips
the epoch bump, and, at source level, that every E–H write sits in a function that drops the copy. Same
`gas-vm-sandbox.cjs` as the review harnesses, no npm dependencies. 33 assertions; 10 fail against
`f3e9e23` (`@55`'s source), and six deliberate breakages of the fix were each caught.

**`verify-input-validation.cjs`** — pins the 2026-08-25 server-side
plausibility guard. `registry.jsx`'s number inputs set `min="0"` and no upper
bound at all, and `calculator.jsx`'s daily-entry fields were never
range-checked outside the UI meters/tiles — but `doPost` is reachable
directly (curl, a stale bundle, DevTools), so nothing stopped an out-of-range
BW, GA, or daily-entry value (the "BP = 400 mmHg" case) reaching
Patient_Registry or Daily_Log. `_checkRange` is a plausibility bound, not a
clinical target — those stay in `data.js`/`TPN_TARGETS` and drive UI
guidance, not write rejection, so a value can be outside the ESPGHAN target
and still save; only physically-implausible values (BW=50000 g, GA=99 wk,
fluid=99999 mL/kg/d) are rejected.

Same `vm`-sandbox technique as `verify-gas-registry-upsert.cjs`: `_checkRange`
directly (range, boundary, empty/null/garbage skipped, error message shape),
then the three write choke points it guards — `registerPatient` (implausible
BW/GA rejected before reaching the sheet; a registration with BW/GA not yet
known does not get blocked), `_buildLogRow`/`logDailyNutrition` (shared by
create and update, so both inherit the guard from one call site), and
`updateWeights` (an implausible growth-chart point rejected before the write).
Each rejection is checked against the sheet double's own write/append log, not
just the thrown error, so a validation that fired too late to stop the write
would still fail the harness.

**`verify-tpn-calc-weight.cjs`** — regression cover for the 2026-08-26 split of
Step 1's single weight field into "Current weight" (the actual measured
figure, entered directly) and "TPN calc. weight" (what every per-kg dose and
target actually runs on — derived by the birth-weight-floor rule, and
**editable since 2026-09-15**). Same jsdom harness as the
Factor/bed-dol-io scripts: mounts the real `<Calculator>` and drives it.

It pins the floor/track/re-floor state machine — below birth weight the calc
weight pins to `patient.bw` (and the printed order form both switches its
"Weight for calculation" figure and adds a birth-weight note), at or above it
tracks the current weight automatically, and dropping back below birth weight
re-floors rather than sticking at the last value seen above it (a stale-
closure bug this harness would catch). It also pins that `onWeightChange` and
the saved Daily_Log `weight` column both carry the real entered weight, never
the floored one — that's what feeds the growth chart and PatientStrip, so
using the calc weight there would fabricate a weight the infant was never
actually measured at. A patient with no birth weight on record never floors
(nothing to floor against). Last, restoring a pre-migration saved entry —
`calcInput.wtG` with no `curWtG` key, the only shape that existed before this
split — must land in Current weight and then re-derive TPN calc. weight from
it and the patient's `bw`, not silently show 0.

Sections 6-8 cover the 2026-09-15 change that made the derived field editable:
that it renders as a real input, that an override drives the doses (not just
the box) while leaving Current weight alone, that typing the automatic figure
back in *releases* the override so the field resumes tracking the weight, and
that a real override round-trips through a saved entry without the `weight`
column picking it up. Sections 1-5 are unchanged and are what pins that the
automatic behaviour still prefills exactly as it did.

**`verify-required-log-fields.cjs`** — the 2026-09-15 rule that every field in
Step 1 and the Intake / Output card must be filled in before an order can be
saved ("บังคับลง log ทุกช่อง ถึงจะ save ได้"). Mounts the real `<Calculator>`.

The interesting part is what "filled" means. A fresh form renders 0 as an
**empty box with a "0" placeholder**, so a field nobody has touched looks
exactly like one somebody deliberately zeroed — and Other IV, Drug volume and
Drain really are 0 most days. The gate therefore asks for a non-empty box, not
a non-zero value, which means a typed `0` has to survive the effect that
re-renders the field from its value. It did not, at first: the keystroke set
the value to 0, the effect wiped the box back to empty, and the field could
not be satisfied at all. That case is section 2 here.

The rest: a prefilled figure (the ESPGHAN fluid midpoint, the last weight)
counts as entered, because the rule is about silent defaults and a visible 130
mL/kg/d is not silent — but clearing it puts it back in the missing list;
entering Current weight also satisfies TPN calc. weight, which derives from
it; Steps 2-6 are outside the gate, so an NPO day with no TPN and no feed
still saves; reopening a saved entry does not demand re-typing the zeros it
already records; and a fresh form for the **next** patient starts blocked
again, which is what stops one infant's answers pre-satisfying another's.

**`verify-center-point-entry.cjs`** — the Center Point entry to `<Calculator>`
(the `centerPoint` prop, PR #57), pinned after the 2026-09-15 review of that PR.
It mounts the real calculator with a stub bridge. Nothing clinical may reach
`localStorage` on that screen: no draft autosave and no draft read, with a
legacy-screen control proving the harness can see an autosave at all. A CP save
reads as saved, and there is no Copy Order button. The Intake / Output card is
absent and not required, while the legacy screen still requires it. The
critical-value reason goes to the bridge, into the `neofeed-tpn-v2` snapshot
and onto `renderTpn`'s sheet as plain text, and `validateTpn` rejects a
malformed one. §4b: any reason the prompt accepts (a cut ending on a space, a
pasted tab, an emoji split at 300) still saves through CP. Both host ignore files keep `center-point/` off NeoFeed's domain.

**`verify-center-point-drafts-view.cjs`** — the `/neofeed/` drafts view on a
record whose latest draft carries a TPN order. That view's review shows no TPN
value and its save carries no TPN, so such a record is read-only there. Form,
Publish and print job do nothing even when forced, and a notice points to the
calculator page. An observation-only record stays editable, which is the
control. CP's `tpn_draft_superseded` refusal is explained. Mounts the real
`center-point/drafts-view.mjs` in jsdom with a stub client.

**`verify-center-point-order-changes.cjs`** — "changes since the previous
confirmed version" on CP's sheet (Praew, 2026-09-16). `tpnChanges` compares what
a prescriber orders, in `ORDER_DIFF_FIELDS` terms plus dosing weight and each
preparation, and never amounts that only follow the weight. `renderTpn`'s third
argument draws the section: nothing when it is left out, "first confirmed
version" for `null`, a note when the previous version had no TPN, "no changes",
or the list. A malformed previous version is refused. CP's server decides which
revision is previous.

**`verify-center-point-print-parity.cjs`** — CP prints from a hand-kept slot
list (`center-point/tpn-document.mjs`), so nothing noticed when NeoFeed's
pharmacy form gained a figure CP lacked. This saves one fully populated order
through both screens and requires every dose figure on `<PrintOrderForm>` (each
is its own `<strong>`) to appear in a CP value slot, allowing for CP printing
more decimals. A new figure on NeoFeed's form fails it until CP gets a slot, or
the figure is listed in `NOT_ON_CP` with its reason. It found the Mg mg/kg and
TPN-only kcal/kg figures missing. The order runs twice, without and with dead
space, because an overfilled bag prints extra lines. Figures are matched by
value, so keep fixture values distinct: a second slot with the same number can
hide a missing one. The patient table, the saved-by line and "changes since the
previous order" are outside it; CP has no previous order yet.

**`verify-nutrition-unit-review.cjs`** — the two items acted on from the
Nutrition Unit's AUG 2026 review, and the only harness here whose subject is
**legibility rather than arithmetic**.

Every salt row's caption used to be a bare `→ {solVol} mL/d`, sitting directly
under an input in mEq/kg. For Glycophos and KCl the two numbers land almost on
top of each other — an order of 3 mEq/kg renders a caption of `3.2 mL/d` — so
the arrow reads as "3 mL becomes 3.2 mL after dead space". The Nutrition Unit
read it that way and filed a phosphorus formula error against it: from
`3 → 3.2 mL` they computed P = 3 × 31 = 93 mg/day and asked why the app showed
47 mg/kg/d.

The arithmetic was never wrong. The Glycophos input is **mEq Na/kg/day, not mL**
(`calculator.jsx` renders `glycophosP * 2` and stores `v / 2`), so an entered 3
is 1.5 mL/kg/day and 1.5 × 31 = 46.5 → "47". Their 93 mg is the right answer for
a different prescription — 3 mL/kg/day, i.e. double the Na actually ordered.
Nothing miscalculated; the caption made the misreading available.

So what is pinned is that each caption **states the conversion it performs** and
**separates what pharmacy compounds from what reaches the infant**. Expected
strings are computed from an independent transcription of the chain, the same
two-implementations rule `verify-kcmh-factor.cjs` follows, against that report's
own case (1.8 kg, 162 mL bag, 30 mL dead space). It also pins that both
phosphorus sources report P the same way — before this, only Glycophos did — and
carries a canary on the three arrow captions deliberately left in the old form
(MgSO₄, which changes when their slide 5 lands; Ca gluconate, whose input is
already mg/kg; and the heparin hint, which states both units either side of the
arrow), so a *new* bare-arrow caption under a mEq/kg input trips it.

Section 3 is their slide 8: oral calcium and phosphate bind each other in the
gut lumen, so the doses must be separated in time — a fact no daily total can
express. The advisory must appear when, and only when, both are ordered.

**`verify-publish-lock.cjs`** — the 2026-09-10 "Save / Submit / Print" publish-lock design
(`CHANGELOG.md`, same date). A saved `Daily_Log` row starts as a draft (editable in place, printed
with a "รอผลแลป" watermark) until a clinician explicitly publishes it (`publishDailyLog` /
`doPost`'s `publishLog` action). Once published, `updateDailyNutrition` never overwrites the row
again — an edit appends a new revision (columns AH–AL: `published`, `publishedBy`,
`revisionNumber`, `revisionOf`, `supersededAt`) and marks the old row superseded. Same `vm`-sandbox
technique as the provenance-stamp harness, driving the real `gas-backend.gs` functions directly:
schema/width (a 33-column, AF/AG-era tab widens to 38 without throwing, on all three write paths),
the draft-overwrite path staying byte-for-byte unchanged, the revision-creation path (new row,
old row superseded, nothing else about the old row touched), the same lock taken on both paths,
`getActivePatients` exposing the five new fields, and `doPost`'s RBAC gate on `publishLog`. A short
regex-based section (the same technique the provenance harness uses for its own frontend checks)
pins that `calculator.jsx`/`app.jsx` actually wire Submit and the watermark through, and that
`data.js`'s `normalizeLogEntries` — the single funnel every log view reads through — drops
superseded rows so TrendGraph and the entry table never double-count a revision chain. Gated behind
`ENABLE_PUBLISH_GATE` in `data.js`, defaulting off; the harness pins that default too.

Checked the way the session-revocation harness was: run against the pre-edit
`calculator.jsx` it fails 14 of its 20 assertions.

**`verify-picker-print-identity.cjs`** — regression cover for the 2026-09-10
patient-identification review, and unlike every harness above it, the subject
is *which infant* rather than *which number*. Two defects, both mount real
components in jsdom:

- `<PatientPicker>` (the modal behind the header's "switch patient" button —
  the fastest path to changing the active patient mid-shift) listed bed, name,
  GA, birth weight and diagnosis per row, but never the twin/multiples label.
  Twins share initials by construction (`sessionId` is
  initials+BW+twinSuffix) and are usually in adjacent beds, so two rows here
  could read identically except for a small bed chip. The registry table and
  mobile cards already call `multiplesLabel()`; the picker was the one place
  it was missing. The harness asserts both twin rows carry distinct,
  human-readable text (not just distinguishable-in-theory via bed color).
- `PrintOrderForm` — the printed pharmacy TPN order, the highest-consequence
  document that leaves the app — labeled its own derived `sessionId` as
  `"AN:"`, which reads to a pharmacist as the hospital's real Admission
  Number. It is not one: it's the same collision-prone
  initials+BW+twinSuffix key `_sessionIdConflict` in `gas-backend.gs` exists
  to guard, mislabeled as if it were an independent hospital identifier a
  pharmacist could cross-check against the chart. Relabeled to
  `"NeoFeed ID:"`, and the twin letter is now printed next to the patient's
  name on the same line, for the same reason the picker needed it. The
  harness reads the rendered `#print-form` text (same technique as
  `verify-tpn-calc-weight.cjs`) and asserts no `"AN:"` ever appears, the new
  label carries the right id, and the twin tag appears only when
  `twinSuffix` is actually set.

Checked against the pre-edit `calculator.jsx`/`registry.jsx`: 5 of 9
assertions fail (the twin-label ones, and both `"AN:"`-relabeling
assertions — the print form's twin-tag assertion coincidentally reuses the
mislabeled-id assertion's regex).

**`verify-review-0917-backend-security.cjs`**, **`verify-review-0917-backend-writes.cjs`**,
**`verify-review-0917-backend-sync.cjs`** — the 2026-09-17 backend review, split three ways. No
npm dependencies. All three load the real `gas-backend.gs` through **`gas-vm-sandbox.cjs`** (a shared
helper, not a harness — CI's `verify-*.cjs` glob does not pick it up), whose Sheets double models what
these fixes are about and the older stubs did not: a string starting `= + - @` written to a cell is
recorded as a formula injection, a leading apostrophe is stripped on read (so the second-order path
is visible), `YYYY-MM-DD` comes back as a Date, ranges read any number of rows and throw past the grid,
CacheService honours TTLs / the 100 KB value cap / the 250-char key cap, and every service can be made
to throw or the script lock to time out. `withNow(ms, fn)` pins the backend's whole clock: `Date.now()`
and an argument-less `new Date()` alike. Until 2026-09-18 it pinned `Date.now()` only, so *sync*'s
"…with a fresh ts" passed only when the real clock ticked between two syncs, and failed CI run
35302157754 when it didn't. Set `NEOFEED_GAS_SRC=<path>` to run any of them against a
different `gas-backend.gs` — that is how they were shown to fail against the pre-review source
(42ce553: 63, 97 and 25 failures respectively).

- *security* — formula escaping in Audit_Log and on read-back write paths; admin password reset/clear
  ending sessions; parallel login guesses counted before the hash; no account enumeration (one message,
  a dummy hash, a CacheService lockout for unknown addresses); the prepared-but-off Google `hd`
  restriction and its telemetry; the 12-hour absolute session age, including pre-deploy sessions being
  stamped rather than logged out; `ServiceUnavailable` instead of `Unauthorized` on a Google service
  failure (at the `doPost` level); SHA-256 key names and the epoch migration (with a rollback check);
  nothing internal echoed to an unauthenticated caller.
- *writes* — the column-drift guard (blank optional headers accepted, a different label refused with the
  exact `SchemaMismatch` shape, reads unaffected) and `sheetHealthReport()` (counts, and no email, name,
  ID or bed anywhere in it); `Busy` on every write; narrow in-lock reads equal to a full scan on 2,000
  rows; a hand-moved row refused on every positional write; `deletePatient` ordering, retry and the
  published-row refusal; the revision fields reaching the client; failed supersede / publish / erasure
  never half-applied; entry-date normalisation and `DuplicateDate`; the three-way patient merge
  (including the lost-DOL-17-weight reproduction); PDPA erasure staying erased; sex and
  measurement-array validation; the 4-column Audit_Log grid.
- *sync* — the undated-archive window decision; the narrow Daily_Log read proven identical to the
  pre-review full read (embedded verbatim as the reference) across the perf review's edge cases and
  row-shift races; the 5-minute payload cache (hit, miss, fresh `ts`, audited hits, TTL, eviction, cache
  outage, multi-chunk payloads, every write visible to the next sync); and a source-level check that
  every function taking the script lock and touching either data tab bumps `DATA_VERSION` in its
  `finally`.

The 2026-09-17 change also upgraded four older harness stubs where the new code legitimately needs
more of the Sheets API — multi-row `getRange`, column-true `setValues`, `getMaxColumns`, an Audit_Log
tab, and real header labels in row 1 (a placeholder header is now, correctly, refused as column
drift). No assertion was weakened; two in `verify-review-0911.cjs` were updated to decisions made that
day — the lockout counter's hashed key name, and an undated archived patient leaving the ward sync.

**`verify-chula-google-signin.cjs`** — Praew's 2026-09-22 rule: every Chula Google Workspace domain
(`chula.ac.th`, `student.chula.ac.th`, `md.chula.ac.th`, `docchula.com`, `chulahospital.org`) signs in
with Google and gets no NeoFeed password, and nobody signs in without a Staff row. Same
`gas-vm-sandbox.cjs` as the review harnesses, no npm dependencies. It pins that no password is
provisioned for those domains by the `onEdit` trigger or the backfill (with a `redcross.or.th` control,
and look-alike domains staying password domains); that a Google sign-in on a row that picked up a temp
password before its domain was listed is **not** stopped by the forced-change gate, while a **password**
sign-in on that same row still is — the gate follows how the session signed in, not the address; that
both paths refuse a missing, disabled or role-less Staff row, and deleting the row ends a live session;
that the prepared `hd` restriction and its telemetry cover all five domains; and that a session minted
before the change keeps its old rule. 57 assertions; 21 fail against `7049f60` (`@55`), including the
chula.ac.th temp password that the domain-keyed gate let skip the change.

## `verify-safety-fixes-0923.cjs` — the 2026-09-23 review's findings, fixed

The review that found these wrote them down; this is the harness that keeps them fixed. Ten sections,
100 assertions, **38 of which fail against `d08e0fc`** — and they fail by reproducing the reported
symptom, not merely by missing a new function: § 2 returns DOL 5 where the infant is 9 days old, § 3b
finds the admit-date field pre-stamped with today and lets the save through, § 4 finds no merge base
sent at all, § 7 finds one target band step at one height, § 8 finds the DOL box snapping back to "1",
and § 10 finds a 250 g weight, GIR 25 and 240 kcal/kg/d all refused, in English.

Sections: § 1 the two weight stores read as one · § 2 DOL anchored on the date of birth · § 3 and
§ 3b the admit-date guards, in the helper and in the edit modal · § 4 the merge base frozen at editor
open · § 5 one GIR grading and no float noise in an alert body · § 6 growth velocity, including the
two states in which it must refuse to grade · § 7 the per-day target band · § 8 the patient-less quick
calculator · § 9 NPE:AA's low side as a warning · § 10 the server's bounds, its Thai refusals and the
legacy tolerance on its date check.

§ 1–2, § 5–6 and § 10 are pure functions and a vm sandbox; § 3b, § 4 and § 7–8 mount the real
`EditPatientModal`, `TrendGraph` and `QuickCalcView` in jsdom, so they need the same dev-only deps as
the other component harnesses. The jsdom sections render into their own `#probe` node: `app.jsx`
mounts the whole app into `#root` on its last line.

## Note on the source workbook

The worksheet these were derived from (`TPN 05082569.xlsx`) contained ~45 named
real-patient sheets alongside the templates. It was never committed to this repo
and is no longer on disk. Every constant and formula used here came from the
anonymous template sheets (`NEW Temphate`, `Starter TPN`, `s tpn2/3`), and the
expected values baked into these scripts are the only thing that survives from
it — no patient-level data is present in either script.
