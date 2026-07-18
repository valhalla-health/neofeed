# NeoFeed V2 — Session Handoff
**Last updated:** 2026-07-18 | **Status:** 🟢 PRODUCTION · stable — no open bugs (login confirmed working since deploy `@41`; the previous 🟡 banner here was stale, left over from the since-resolved Script Properties config issue in the 2026-07-13 sessions below)

---

## Session 2026-07-18 (2) — backend sync: local clasp copy + live deploy were behind `main`

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

## Session 2026-07-18 — debug pass: Alert-count drift + colgroup DOM warning (branch `claude/neofeed-debug-9arm-wvrssf`)

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
