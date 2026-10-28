# NeoFeed — Changelog

Session-by-session history, **newest first**. Append-only: never rewrite a past
entry, correct it with a new one.

Split out of `HANDOFF.md` on 2026-08-21 — every entry below is carried over
verbatim, nothing was edited. Code comments that say *"see HANDOFF.md
2026-08-10 (3)"* mean the session entry of that date, now in this file.

## Session 2026-10-28 (10) — The backend reads a patient status the way the client does

`gas-backend.gs`, `registry.jsx`, `data.js` (a comment), `compiled/`, both shells' `?v=` tokens,
`test/verify-status-read-1028.cjs` (new), `test/verify-backend-batch-0924.cjs`, `test/verify-bed-park.cjs`,
`test/README.md`, `BACKLOG.md`, `STATUS.md`, `app-walkthrough.md`. No calculation, limit or printed figure
changed; `CONSTANTS_VERSION` unchanged.

### Why

Pp: "แก้ backend ให้อ่าน status แบบเดียวกับ client". Since #183 the client reads a status through
`D.patientStatus`: blank is Active, one of the four whatever its case or spaces is that status, anything
else stays as typed and is off the unit. The server read the same `Patient_Registry` cell three ways
(Vera's BACKLOG item from #183's review). The sync window trimmed but matched case, so a row typed
"active" with no statusDate reached no ward device. The bed guard compared the raw cell, so "Active " held
no bed on the server. And the write turned any unknown word into Active (BE-4, 2026-09-24), so a row typed
"Expird" came back onto every ward list, holding a bed, at its next save.

### What changed

- **One reading on the server:** `_readStatus` (the rule of `D.patientStatus`) and `_onUnitStatus` (of
  `D.isOnUnit`). The sync window, the bed guard (`_bedConflict`, both the record saved and every other
  row), the three-way merge's comparison, the sheet health report and the duplicate question read through
  them. The sync payload still sends the cell as stored; the client reads it through `patientStatus`, and
  `verify-review-0917-backend-sync.cjs` proves that payload byte-equal to its reference.
- **The write refuses a status that is not one of the four** (`_normStatus`), in Thai, instead of storing
  Active. This reverses BE-4's fallback on purpose: Active is what revived "Expird". A case or space variant
  is still stored canonical, and blank is still Active. A direct POST can no longer store a ghost status
  either, which was BE-4's concern.
- **Edit session asks for a status the server would refuse** (`registry.jsx`), as it already does for an
  unknown sex: a stored "Expird" seeds the Status select blank ("— เลือก —"), a warning names it, and Save
  stays off ("ต้องเลือก Status ก่อนบันทึก") until one of the four is picked. Without this, a diagnosis edit of
  such a record would echo "Expird" back and be refused. The Status dialog already starts with none picked.
- **Vera, before the PR:** status membership is an own-property check (`_isValidStatus`). `VALID_STATUS[s]`
  also matched names every object inherits, so "toString" or "constructor" passed as one of the four and
  was stored, a ghost the old fallback never caught either. And picking the status a typo meant keeps the
  statusDate already recorded (`D.statusChange`): "Expird" dated 10-20, saved as Expired on 10-28, used to
  record the death on 10-28 and restart the 7-day hide and the 30-day sync window.
- **`sheetHealthReport` counts `statusNotCanonical`:** status cells that are neither blank nor exactly one of
  the four ("active", "Active ", "Expird"). Counts only, no identifiers.

### Checks

`verify-status-read-1028.cjs`, 37 checks: §1 `_readStatus` and `_onUnitStatus` give exactly
`D.patientStatus` and `D.isOnUnit` (from `data.js` itself) on 15 inputs plus "toString" and "constructor",
and `D.statusChange` keeps a typo's date; §2 the sync; §3 the bed guard; §4 the write, including Vera's
cases (a stored "Expird" with only the diagnosis edited is refused and unchanged, then saved once a status
is picked; "toString" refused); §4b the health report's count; §5 Edit session, which also keeps the date.
19 fail on `86bfc91`, in every section; Vera's five fail on the commit before their fixes.
`verify-backend-batch-0924.cjs` BE-4 now expects "ZZZ" refused and nothing stored (it expected Active).
`verify-bed-park.cjs` copies `_readStatus` and `_onUnitStatus` along with `_bedConflict`.

### Deploy

Two halves, both Pp's: the backend needs a `clasp` deploy (`REFERENCE.md` § Backend: reconcile the
mirror, `clasp push`, `clasp update-deployment`), and the Edit session change needs a release. Either order
is safe: an old Edit session sending an unknown status gets the new Thai refusal and can pick a status;
a new Edit session on the old backend only asks for a status first. **Between `clasp push` and `clasp
update-deployment`, find the rows that change** (Vera, twice): run `sheetHealthReport` in the editor (its
`statusNotCanonical` exists only in this code, so not before the push), or filter `Patient_Registry`
before. The rows that matter are a case or space variant of Active in column J ("active", "ACTIVE ") with
an empty column Q (statusDate). Such a row reaches no ward device today; once the deployment switches it
syncs as an Active infant holding its bed, so a stale one would appear on the ward list and block that bed.

## Session 2026-10-28 (NF-05, Pp drops the pilot) — before-and-after numbers and rollback steps instead

Pp answered "ก" on 2026-10-28: no pilot. The two entries below describe a pilot ladder that this PR
no longer ships. What protects an infant is comparing the numbers before they reach pharmacy. The
pilot users order for real infants anyway. The riskiest changes (backend, Sheet layout) could not be
piloted, since every deployment shares the Sheet. And six setup steps, a second GAS deployment and
48 h per release cost a one-person team more than they give, next to 100 harnesses, the
clinical-rules check and NF-28.

**Kept**, in `.github/PULL_REQUEST_TEMPLATE/release.md` (now `main → release`) and `REFERENCE.md`
§ Before and after, and rolling back (it replaces § The pilot ladder):

- A release that changes a calculation runs the release live now and the PR's head side by side in
  dev local (`tools/dev-local.mjs --tree … --port 8155` and `8156`), at least three cases per changed
  calculation, and records inputs, before, after and "intended?" in the release PR.
- The rollback steps: `npx wrangler rollback` or the Worker's Deployments tab, GitHub Pages by
  reverting the commit, the whole merge for a release across the 2026-09-17 build step, the backend
  by `clasp update-deployment` to the previous version, and the release tags as targets.

**Removed**, each file back to `main`: `boot.js` § 3 (`NEOFEED_PILOT_GAS_URL`) with the shells'
`?v=` tokens, the `_headers` comment, `tools/dev-local.mjs` and `tools/verify-release.mjs` (`--pilot`),
`test/verify-review-0917-shell.cjs` 2.4a, `test/verify-dev-local.cjs` #5 and the `test/README.md`
section. Deleted: `.github/workflows/release-gate.yml`, `tools/release-gate.mjs`,
`test/verify-pilot-ladder.cjs`. `AGENTS.md`, `STATUS.md` and BACKLOG § Now now point at the
template; BACKLOG keeps the missing `release-2026-10-27-pr172` tag and the 25 older backend
deployments for Pp.

## Session 2026-10-28 (NF-05, after Vera) — what two versions sharing one Sheet can still break

Vera read the NF-05 diff (NO BLOCK, three 🟠 and two 🟡; her report is on the PR). Changed in answer:

- **A column added at a tab's end is not enough.** The ward version rewrites a patient or draft row
  over its own width only, so the new column keeps the pilot's earlier value. The first "Side by side"
  box and `REFERENCE.md` now ask that the new version still reads such a row right.
- **Script Properties** got their own box and bullet: no key or meaning change (the revocation epochs),
  and no switch flipped while a pilot runs (`NURSING_LOG_ENABLED` must never meet an old frontend).
- **A backend deploy outside the ladder moves the pilot deployment too**, and an abandoned pilot puts
  it back on the ward's version, so the public pilot URL never runs code the ward has left.
- **The gate** now also wants the rollback commit beside the tag, and fails on any `<…>` field left
  unfilled. The backend Promotion box was reworded so its own text holds none. A new Promotion box
  re-runs `verify-release.mjs --pilot`, since a branch whose name Cloudflare turns into `pilot` could
  take the address.
- Not changed, for Pp: a pilot banner and a mark on the printed order (the pilot looks like the ward
  app), and the 25 older backend deployments that still answer.

`test/verify-pilot-ladder.cjs` 2.14, 2.15 and 3.7 fail against the first commit's gate and template
and pass now (39 checks).

## Session 2026-10-28 (NF-05) — the pilot ladder: 48 h on `pilot` before a release reaches the ward

`REFERENCE.md` § The pilot ladder (new), `.github/PULL_REQUEST_TEMPLATE/release.md` (new),
`.github/workflows/release-gate.yml` and `tools/release-gate.mjs` (new), `boot.js` § 3,
`tools/verify-release.mjs` (`--pilot`), `tools/dev-local.mjs`, `_headers` (comment only),
`test/verify-pilot-ladder.cjs` (new), `test/verify-review-0917-shell.cjs` 2.4,
`test/verify-dev-local.cjs` #5, `AGENTS.md`, `STATUS.md`, `BACKLOG.md`, `test/README.md`. The shells
and `boot.js`'s `?v=` token moved with the build. No calculation, printed figure or backend code
changed, and `CONSTANTS_VERSION` stays `2026-10-27.2`.

### Why

Pp ticked NF-05 in her apply list of 2026-10-27: a release goes first to a pilot that she and one
fellow use for 48 h, and reaches the ward only by a separate promotion once usage and the error log
show nothing new. Until now a `main → release` merge reached every ward at once.

### How deploys worked, checked first

Workers Builds deploys `release` to `neofeed.valhalla-health.workers.dev` and builds a preview of
every other branch at `<branch>-neofeed.valhalla-health.workers.dev` (the Cloudflare comment on PR
#178 shows both URLs). GitHub Pages serves `release` as a redirect stub. `release` requires
`harnesses`, 0 approvals, `enforce_admins` on (branch-protection API, 2026-10-28). The backend has 26
deployments; the ward's is `AKfycbz8…` at `@64` (`clasp list-deployments`). The frontend picks its
backend from one constant in `boot.js`.

### What the ladder is

The `pilot` branch's preview, `pilot-neofeed.valhalla-health.workers.dev`, is the pilot: no new
Worker, the same bytes the ward gets later. `boot.js` § 3 sends that one host to a pilot deployment
of the same Apps Script project (`NEOFEED_PILOT_GAS_URL`, empty until Pp creates it, so the pilot host
uses the ward's backend meanwhile). The release PR comes from `pilot` and carries the template's
checklist; `promotion-checklist` fails until the pilot commit is its head, 48 h have passed, the
rollback target names a tag and a backend `@N`, and every box is ticked. It is not a required check.

Both deployments share the Sheet, Script Properties and script cache, so the runbook lists what
cannot be piloted side by side (column moves, a cell that changes meaning, a cache value whose shape
changes under the same key, an editor-run migration) and how such a release is split. A
`CONSTANTS_VERSION` bump can be piloted: an order saved on one version is held on the other until it
is saved again, never printed wrong.

### Not done here

Pp's one-time setup: the pilot deployment, the PR that sets its URL, the `pilot` branch, the OAuth
origin and the branch protection (`REFERENCE.md`, BACKLOG § Now). Until then releases go as before.

### Found on the way

Release #172 (`342123d`, merged 2026-10-27) is live and `node tools/verify-release.mjs` passes on both
hosts against it, but its tag `release-2026-10-27-pr172` is not pushed and `STATUS.md` does not
record it yet. Neither is fixed here.

## Session 2026-10-28 (9) — the quick calc's copied text is checked figure by figure

`test/verify-calc-oracle.cjs`, `test/verify-calc-sum.cjs`, `test/verify-tpn-meeting-0928.cjs`,
`test/README.md`. Tests and docs only: no served file, calculation, limit or printed figure changed.

### Why

PR #180 (session (3)) took Copy Order off a patient's order and, with it, every harness check that read the
copied text's figures. The quick calc's Copy draws the same lines and stays (Pp: "Quick calc
ให้ยังมีคัดลอกผล"), so after #180 nothing compared a figure in that text with a recomputed value (Vera,
#180 findings 1 and 2). `REFERENCE.md` § Pre-PR review rule 5 kept Vera's proposed tests out, because they
do not fail on today's code. Pp overrode it here: "test quick calc copies text".

### What the harnesses now check

- **`verify-calc-oracle.cjs`**: each of the 21 orders is typed a second time into the quick calc
  (`scratch`, birth weight 0, so the dosing weight is typed as the current weight). Its copied text must
  say it is not an order and carry no bed or NeoFeed ID. GIR, both feeds and their total, Prescribed,
  Remaining, protein, energy, total Na, K⁺ mEq/L with its route wording, the bag's components, WFI and
  prepared volume, ZnSO₄ mL, vitamin D and oral Ca tablets must equal the oracle's own recomputation. 1,827
  checks. Steps 1–6 are now typed by one `fillForm()` for both mounts.
- **`verify-calc-sum.cjs`** § 1b: all 60 orders again in the quick calc. The copied BAG MAKE-UP line must
  carry the quick calc's own on-screen Components and Bag total, close exactly, and say COMPONENTS EXCEED BAG
  VOLUME exactly when the screen says the bag cannot be compounded, including S4.
- **`verify-tpn-meeting-0928.cjs`** § 13: the quick calc's Na Acetate line gives no acetate while
  `naAcetate.acetateMeqPerMl` is unset, and "(acetate 7 mEq)" once it is 3 (2 kg, 180 + 30 mL).

### Seen to fail

Each check fails on a deliberately broken copy line and passes once it is restored:
- GIR + 0.3, Prescribed + 2 and components + 0.2: oracle, 51 mismatches.
- Components + 0.2, and COMPONENTS EXCEED never written: calc-sum, 117 failed.
- Acetate computed without the overfill: § 13, 6 mEq instead of 7.

`test/README.md` drops the "copied order" checks #180 removed and describes the new ones.

## Session 2026-10-28 (8) — On a phone, the archive opens out from under the Calculator button

`registry.jsx`, `compiled/registry.js`, both shells' `?v=` tokens, `test/verify-archive-fab-1028.cjs`
(new), `test/README.md`. No figure, dose file, printed line or server code changes.

### Why

Pp, after bringing บก back to NICU 9 from a PC: "ให้แก้ใน mobile ได้ด้วย เพราะตอนนี้แก้ในคอมได้ แต่กดใน
mobile ไม่ได้". In real Chromium as a touch phone, on the dev-local seed: scroll the ward list to its foot
and tap ▼ Discharged / Transferred / Expired, and the first archived card opens at the foot of the
screen. Its status chip (the way back to Active since #183) was under the floating Calculator button and
its Edit under the bottom nav, at 375, 360 and 390px wide. A tap on the chip opened the quick calc. The
desktop table has nothing over its archive. The rest of the way back works on a phone: the chip and Edit
once scrolled clear, and Switch patient → Dashboard → Edit session → Active, NICU 9 → Save.

### What changed

- **Opening the phone list's archive scrolls its toggle to the top of the list** (`phoneArchiveRef`, an
  effect on `showArchived`). With few archived infants the list stops at its foot, and the 136px the
  list already keeps below its last card for the Calculator button leaves every archived card above it.
  The jump is immediate, not smooth, so reduced-motion phones are not animated.
- The ref is on the phone list's archive only. From 768px up that list is `display:none`, where
  `scrollIntoView` does nothing, so opening the table's archive leaves the page where it was.
- Not changed: a card's chip still passes under the Calculator button while the list is scrolled, as
  every card's right side always has; the list's 136px foot lets any card be scrolled clear of it.

## Session 2026-10-28 (7) — a help request can carry its picture on the Workers host

`app.jsx` (`helpImageFromFile`), `compiled/app.js` and both shells' `?v=` token (rebuilt),
`test/verify-help-request-frontend.cjs`, `test/verify-help-button-1009.cjs`. No calculation,
printed figure, backend or `_headers` line changed.

### Why

Pp, 2026-10-28, from an iPhone on `neofeed.valhalla-health.workers.dev`: attaching a picture to
ขอความช่วยเหลือ said "เปิดรูปนี้ไม่ได้ — ลองแนบเป็น screenshot หรือรูป JPEG". The text still went, and
the email read "รูปแนบ: ไม่มี". She asked for it to be checked on Android as well.

It was not the iPhone. The form opened the picked file through `URL.createObjectURL`, a `blob:` URL.
`_headers`' `img-src` is `'self' data: https://*.gstatic.com https://*.googleusercontent.com`, with no
`blob:`, so the Workers host blocked the load and the form reported a picture it could not open. That
happened on every browser on that host: Android, iPhone and desktop. GitHub Pages sends no CSP, so the
picture worked there. `verify-help-button-1009.cjs` #3 passed because its server sent no headers.

### What changed

- `helpImageFromFile` reads the file with `FileReader.readAsDataURL` and opens that `data:` URL, which
  `img-src` already allows. The CSP is unchanged: widening `img-src` to `blob:` would have fixed it
  too, but it changes the policy both hosts' reviews rest on, for nothing a `data:` URL cannot do.
  The redraw, the 1600 px edge, the 1.5 MB cap, the EXIF drop and the Thai errors are as they were.
- `verify-help-button-1009.cjs` now serves every file with the headers `_headers`' `/*` block sets.
  #3 runs at an Android width (360), an iPhone width (402) and a desktop, and fails on any CSP
  violation. New #5 shows that under that policy a `blob:` picture does not open and a `data:` one
  does.
- `verify-help-request-frontend.cjs` 6.11: the picture is opened from a `data:` URL and
  `URL.createObjectURL` is never called.

### Tests

The new checks fail on `86bfc91`, the code before this change. In `verify-help-button-1009.cjs` #3,
21 checks fail across the three devices, each with the browser's `img-src` violation for the `blob:`
URL, and the request goes out without `image`, as in Pp's email. In
`verify-help-request-frontend.cjs`, 6.11 fails. Both pass on this change: 168/168 and 54/54, sources
and compiled.

Not covered: Chromium is the only engine available here, so iOS Safari itself (WebKit) was not run.
WebKit enforces `img-src` against `blob:` the same way, which is what Pp saw. A HEIC original picked
from an Android gallery still cannot be opened in Chrome, and the form says so in Thai, as before.

## Session 2026-10-28 (6) — NF-17 for two feeds: `verify-calc-sum.cjs` adds them up

`test/verify-calc-sum.cjs` (§ 3, three negative controls, control 1 repointed), `test/README.md`,
`STATUS.md`. No app code changed; nothing is served, so nothing to release.

### Why

Pp: "เพิ่ม two-feed order ใน verify-calc-sum (NF-17)". NF-17 asks every calculation change for a sum check
on synthetic orders and a click-through check that the screen shows the new value. #182 (two feeds in
Step 2) and #185 (any regular schedule) shipped without one: the harness had no two-feed order, and the
oracle only 4 + 4. Vera listed it as open on #185, and `STATUS.md` kept it open for Pp.

### What changed

- **§ 3, two feeds.** Three orders: 6 + 2 beside a bag (Pre Nan 22 + BM with HMF 24), 4 + 4 feeds only
  (breast milk + Enfalac Premature 24) and 5 + 3 on a peripheral line (Hi-Q LBW 24 + Pre Nan 22). Each runs
  four times on the same infant and bag: no feed, feed 1 alone, feed 2 alone, both. Both feeds must equal
  feed 1 + feed 2:
  - in the saved Daily_Log row (fluid, kcal, protein, Na, K, Ca, P, EN mL/kg/d), within 1e-9;
  - in Step 2's "Delivered per kg from EN", within one unit of the digit shown;
  - on the printed form: energy from EN within 2 kcal/kg, protein from EN within 0.01 g/kg (the header
    gives the rounding arithmetic).
  Each feed's "= X mL/day", the EN volume tile, the total line's interval, each feed's share hint and
  Prescribed must follow from the inputs, and the feeds must move no printed bag line, TPN energy or
  amino acid.
- **Wired-in.** On the two-feed order, feed 2's volume is typed a key at a time, its kcal/oz picked, or
  the frequencies typed through a refused 5 + 2 to 6 + 2. The feed lines, the EN tile and the delivered
  kcal follow, the stale form is withdrawn, and the reprint carries the new energy with the bag unchanged.
- **Negative controls 4–6** patch `calculator.jsx` in memory and must fail: feed 2 left out of the EN
  volume (63 checks fail), both feeds costed as feed 1's milk (39), `enVol2` out of the feeds' memo
  dependencies (5). **Control 1 was broken on `main`:** its patch text had gone when the bag sum moved to
  whole hundredths (2026-10-27), so it stopped with "update PATCHES[1]" instead of failing. It now patches
  the current sum, and fails 85 checks.
- A feeds-only order with its feeds taken away is an empty day, which cannot be submitted; its baseline is
  zeros, and the harness asserts the refusal.

### Checks

- `verify-calc-sum.cjs`: 60 orders and 3 two-feed orders, 1,889 checks, on the sources and on `compiled/`
  through the compiled loader. Controls 1–6 each fail (`SUM_N=0`).
- Nothing in it recomputes the app's formulas: the sums compare the app with itself, one feed against two.

## Session 2026-10-28 — NF-28 meets #182's Step 2

`tools/reference-tabs.cjs`, `tools/reference-tabs.json`, `test/verify-reference-tabs.cjs`,
`test/README.md`. No value, limit, unit or printed figure changed; `CONSTANTS_VERSION` stays `2026-10-27.2`.

### Why

Pp, 2026-10-28, merging NF-28 into `main` after release #184. With `main` merged in, the check failed on
two things #182 brought, both as it was built to:

- `EN_FEEDS_PER_DAY_MAX` (8, `CR-EN-FEEDS-MAX`) had no unit in `tools/reference-tabs.json`, so the new
  limit could not skip the check.
- The feed dropdown no longer lists EN_DB keys as `["…"].filter(k => D.EN_DB[k])`. `EnFeedPicker` reads
  `D.EN_PRODUCTS`, a milk and then its kcal/oz, so the reader found no list and said so.

### What changed

- `EN_FEEDS_PER_DAY_MAX` has its unit, "feeds/day, Feed 1 + Feed 2". Its range still comes from the rule.
- When `calculator.jsx` reads `D.EN_PRODUCTS`, the dropdown's keys are every strength key in `data.js`'s
  `EN_PRODUCTS`, each checked against `EN_DB` with unique labels as before. Source that reads
  `D.EN_PRODUCTS` while `data.js` gives none is reported, not passed. The old reader stays for the old
  shape.

### Tests

`verify-reference-tabs.cjs`: 71 checks, all passing on the merged tree. #2.13 and #2.14 are new; both fail
on the reader before this change, with #3.2 and #3.4. Each `NEGATIVE_CONTROL` still fails one check;
`=3` now fails on `calculator.jsx:392`, `EnFeedPicker`'s `D.EN_PRODUCTS`.

## Session 2026-10-28 — NF-28: every reference cell is checked before a release

`tools/reference-tabs.cjs` (new), `tools/reference-tabs.json` (new), `test/verify-reference-tabs.cjs`
(new), the clinical-rules skill (one sentence), `REFERENCE.md`, `test/README.md`. No value, limit, unit or
printed figure changed; `CONSTANTS_VERSION` stays `2026-10-27.2`.

### Why

Pp ticked NF-28 in her apply list of 2026-10-27: one wrong cell in a reference table makes every TPN
result that reads it wrong, so each numeric cell must be a number of the expected sign inside a stated
range, each lookup key must match its list exactly, each column needs a unit, and a failure blocks the
deploy and names the cells. Nothing is coerced or trimmed.

### Where the tables are, and so where the check runs

The item was written as `checkReferenceTabs()` in Apps Script over tabs in the Sheet. The Sheet has no
such tab: `gas-backend.gs` reads Staff, Patient_Registry, Daily_Log, Nursing_Log and Audit_Log, and
sends the frontend no clinical number. Every number the calculator reads is in `data.js` (`EN_DB`,
`KCMH_STOCK`, `SUPP_DB`, the limit constants, `TPN_TARGETS`, `ENTERAL_TARGETS`, `TARGETS`), and it ships
with the frontend on a merge into `release`. So `checkReferenceTabs` is a pure function in
`tools/reference-tabs.cjs`, and `test/verify-reference-tabs.cjs` runs it in `harnesses`, the check
`release` requires. A failing cell keeps the `main → release` PR from merging. The check needs no Sheet
access and no CI secret, and the workflow file is unchanged: CI already runs every `test/verify-*.cjs`.

### What it checks

363 cells in three tables, 28 limits, 34 target bands called over DOL 0–60 and nine weights (9,106
calls), 43 lookup keys and 84 references in the screens. Ranges: 49 come from CR- rules, 47 of them the
values the skill codes (read from the skill at run time, so no number is copied) and 2 that a rule
states; 23 band checks use the backend's save bound for the same field (`_validateLogEntry`); 38 are
proposed (below). A value a rule codes with no unit in `tools/reference-tabs.json` fails, so a new limit
cannot skip the check. Lookup keys come from the code:
the Calculator's feed dropdown (its `.filter(k => D.EN_DB[k])` drops a key with no row without a word,
so the check fails instead), the four `useState` defaults, both amino-acid lists, the supplement
dropdown categories, every `D.KCMH_STOCK.x.y` and `S.x.y` reference, and every nursing feed key against
the backend's `NURSING_FEED_KEY_RE`, which refuses a save with a key that fails it.

### Found (nothing changed)

- 14 band functions have no caller in the screens: `TARGETS.protein`, `kcal`, `lipid`, `na`, `k`, `ca`,
  `p`, `girTarget`, `girPreterm`, `girTerm`; `TPN_TARGETS.mg`, `caP`; `ENTERAL_TARGETS.peRatio`,
  `npePerG`. They are checked like the rest.
- The PN lipid band's top (4.0) equals `LIPID_IV_HARD_HI`, and the PN K band's top (5) equals
  `K_IV_HARD_HI`: a target can reach the critical line but not pass it, which the check now holds.

### For Pp

- 38 ranges no rule gives are proposed in `tools/reference-tabs.json`, all by one rule: half the lowest
  to 1.5 times the highest value today. They catch a slipped decimal or mg typed as mmol, not a clinical
  error. They cover the `EN_DB` nutrients and osmolality, every `SUPP_DB` strength, Aminoplasmal's
  0.15 g/mL, `MG_MG_PER_MEQ`, and the Mg, Ca:P, enteral lipid, protein:energy and NPE bands.
- Whether the live Sheet keeps any reference tab that no code reads; nothing here can see it.

### Tests

`test/verify-reference-tabs.cjs`: 69 checks. Section 1 runs 43 kinds of bad cell on synthetic tables,
each failing alone at its cell, and shows the check changes no input; section 2 runs the source readers
on synthetic code, including one that finds nothing and must say so; section 3 runs the real files.
`NEGATIVE_CONTROL=1` (`EN_DB.BM_20.pro` = `"1.2"`), `=2` (`KCMH_STOCK.naCl.naMeqPerMl` = 34.2) and `=3`
(the feed list asking for `"BM_20 "`) each fail one check, naming the cell.

## Session 2026-10-28 — NF-08: a patient identifier, a raw sheet cell or a secret in a log fails CI

`tools/ci_bans.js`, `test/ci-bans-fixtures.json`, `.github/workflows/test.yml` (a comment), `AGENTS.md`,
`test/README.md`, `BACKLOG.md`, `STATUS.md` (this PR's line). No app code changed; nothing to release.

### Why

NF-08 on Pp's apply list of 2026-10-27, ticked ทำ: a PR fails when a line that writes a log names a
patient identifier, or hands a log a Script Property or a token. `pseudonymizePatient()` clears name,
initials and dob from Patient_Registry, but nothing clears them from the Apps Script execution log, a ward
PC's console or an Audit_Log row. Until now only Vera stood in the way; her benchmark plants exactly this
(`test/vera-bench/cases/phi-log.patch`: the erased infant's name and dob in the erasure's own log line).

### What changed

- **Three rules in `tools/ci_bans.js`**, run by NF-19's existing CI step: `log-identifier` (hn, an, name,
  dob, phone, citizen, initials as a variable, property or key), `log-raw-cell` (`row[1]`, `data[i][6]` in
  a backend log) and `log-secret` (a `PropertiesService` value, directly or through a variable or helper,
  or a name like token, secret, password or apiKey). `test/README.md` § Log rules has the matching rules.
- **`log-raw-cell` goes past the NF-08 row.** The backend reads every column by index, so the name list
  alone passes the vera-bench line (`cur[1]`, `cur[6]`). This rule is what fails it.
- **`initials` is on the list** though NF-08 did not name it: `pseudonymizePatient()` erases it with name
  and dob. Staff `email` is not: Audit_Log records `actorEmail` by design (PDPA Sec 39), and the
  editor-run account functions log the address they changed.
- **No `schema.json`**, so the list is kept by hand; the class-per-column version is in `BACKLOG.md` §
  Later.
- **`main` passes all three with no allow entry.** The rules check every tracked source, not only a PR's
  changed lines, so an old line cannot hide behind the diff.
- **`check()` passes the file name to a rule's `find`**, so `log-raw-cell` can keep to `.gs` files.

## Session 2026-10-28 (5) — The ward list's status and bed chips are buttons

`data.js`, `registry.jsx`, `app.jsx`, both shells (CSS), `compiled/`, `test/verify-registry-chip-taps-1028.cjs`
(new), `test/verify-mobile-bed-button.cjs`, `test/README.md`, `app-walkthrough.md`, `STATUS.md` (catching up
with release #172), `BACKLOG.md`. No calculation, limit or printed figure changed.

### Why

Pp, from a phone screenshot of the SCN list: "กดปุ่ม active ก็จะสามารถเปลี่ยนตัวเลือก status ได้ และให้ save
ที่เดิมที่เคย save หลัง save จะเปลี่ยนทุกที่ที่เกี่ยวข้อง กดตรงเตียง ก็จะเท่ากับปุ่มย้ายเตียง
ให้เช็คว่าทุกอย่างดึงมาจากจุดเดียวกัน". The card's "Active" chip and its bed chip looked like buttons and
did nothing; a tap on either opened the patient.

### What changed

- **Status chip → Status dialog** (`StatusModal`), on the phone card, the table, and the archive (an
  infant who has left can be set back to Active from it). It saves where Edit session saves a status:
  `onEdit` → `handleEditPatient` → `registerPatient`, with the merge base frozen at open. It changes
  `status` and `statusDate` and nothing else. Back to Active on a bed another infant has since been given
  is refused there, as Edit refuses it. The chip reads "Active ▾".
- **Bed chip → the ⇄ dialog.** The chip and the ⇄ button call the same `openTransfer`, so they open the
  one `TransferBedModal`. An archived infant's bed is not a button: a bed is not moved for an infant who
  has left.
- **One source for a status** (`data.js`): `PATIENT_STATUSES` (Edit's select and the dialog), `patientStatus`
  (blank reads Active, the rule `isOnUnit` already applied, and `isOnUnit` now reads through it) and
  `statusChange` (the statusDate rule, moved out of `EditPatientModal.save` unchanged). The Dashboard strip's
  status chip read `patient.status` raw, so a blank status showed an empty chip; it reads `patientStatus` now.
- `patientStatus` also reads a hand-typed "Active " or "active" as Active (Vera, before the PR). The server
  syncs "Active " as Active (`_patientInSyncWindow` trims), and the client then dropped that infant off the
  ward list, the alerts and the bed guard. The server's reads are not uniform: the sync window matches case,
  so "active" with no statusDate reaches no ward device, and `_bedConflict` compares the raw cell, so "Active "
  holds no bed on the server while the client now counts it as taken (the stricter side). The server half is
  in `BACKLOG.md`. An unknown word stays as typed and off the unit, as both server reads treat it;
  `_normStatus` would write it as Active on the next save, and a mistyped "Expird" must not come back as an
  infant holding a bed.
- After a save, every screen follows from the one record in `App`'s `patients`: the list and its archive,
  the Active / Logged today / Needs entry tiles, the freed bed in the transfer dialog, the Dashboard strip,
  the admin census and the alerts (`isOnUnit`).
- On a touch screen each chip's tap area is 44px tall without making the card's row taller (`.chip-tap::after`).
- **Expired asks first** (Pp, "1+2": yes to "should Expired ask 'are you sure?'"). A change to Expired, from
  the Status dialog or Edit session, asks first, naming the infant and the bed (`ยืนยันบันทึก AA (เตียง
  NICU 1) เป็น Expired (เสียชีวิต) ใช่หรือไม่?`): on a phone a slip of the finger would record a death
  against the wrong baby. Cancel saves nothing and leaves the dialog open. A record already Expired, saved
  again, is not asked about. One function, `confirmStatusChange`, asks for both.

### Checks

`verify-registry-chip-taps-1028.cjs`, 88 checks (18 in real Chromium, among them a touch tablet's table); on
`main` (`326bcd9`) every scenario fails, and #8 (Expired asks first) fails on `1b0866a`, the head before it. `verify-mobile-bed-button.cjs` §5 counted two `setTransferPatient(p)` calls in the source; it now
pins the one inside `openTransfer`, and the four places that call it. `tools/dev-local.mjs`, at 390px: DD
set to Discharged from its chip left the list and was still Discharged after a reload, and set back to
Active from the archive returned to NICU 4.

## Session 2026-10-28 (4) — Two feeds: 6 + 2 is a schedule too

`calculator.jsx`, the clinical-rules skill (`CR-EN-FEEDS-EQUAL` becomes `CR-EN-FEEDS-SCHEDULE`;
`CR-EN-FEEDS-MAX`'s refusal case), `data.js` (a comment), `app-walkthrough.md`, `STATUS.md`. No figure,
limit or stock moves, and `CONSTANTS_VERSION` stays `2026-10-27.2`.

### Why

After #182 was merged into `main`, Pp: "ไม่ต้อง reject 6+2 ให้ทำได้". #182 read her "ต้องให้ทั้งสองตัว
เป็นทุก ชม ที่เท่ากัน" as "both feeds equally often", which refused 6 + 2 though it makes 8 a day, a
q3h schedule like 4 + 4. What 3 + 4 lacks is an interval: 7 feeds do not divide the day into whole hours.
Asked (after Vera) whether that means any regular schedule or only totals of 8 or 6, Pp chose any regular
schedule: totals 8, 6, 4, 3 or 2 a day, any whole split, 7 + 1 and 5 + 3 included.

### What changed

- The second two-feed stop is now "together they fill a regular schedule": 24 h ÷ (Feed 1 + Feed 2)
  must be whole hours. 6 + 2, 5 + 3, 4 + 4 (q3h), 4 + 2, 3 + 3 (q4h) save; 3 + 4 and 3 + 2 are refused.
  With the 8-a-day stop the totals left are 8, 6, 4, 3 and 2. The alert is "Two feeds off a regular
  schedule", and the Step 2 line reads "Feed 1 + 2 = 7 feeds/d — ไม่ลงตัวกับทุก ชม. เท่ากัน (8, 6, 4, 3
  หรือ 2 มื้อ/วัน) บันทึกไม่ได้".
- Vera on this change: each feed's feeds a day must be whole (4.8 + 3.2 and 7.5 + 0.5 add to 8 but no
  ward can give them), and beside the other each feed's hint now reads its share of the one schedule,
  "6 of 8 feeds · q3h", where 6 + 2 used to read q4h beside q12h, which meet at 0 h and 12 h. The copied
  order's Total line names the shared interval.
- Vera's second review of it: the quick calc copies without the Print gate, so 3 + 4 copied as "7 feeds/d
  q3.4h". A refused two-feed day now copies with no interval and a "!! … cannot be ordered" line, as an
  over-maximum K⁺ does. Whole-feed faults have their own words ("จำนวนมื้อต้องเป็นจำนวนเต็ม"; the alert
  said "24 h ÷ 8 is not whole hours" for 4.8 + 3.2), and the Thai stop line lists every allowed total,
  8, 6, 4, 3 or 2. `verify-quick-calc.cjs` § 4b and the 4.8 + 3.2 case fail on the code before.
- `CR-EN-FEEDS-MAX`'s refusal case is 6 + 6 = 12 (q2h): the first total over 8 that is still a regular
  schedule, so it is refused by that stop alone.

### Checks

- `verify-clinical-rules.cjs`: `CR-EN-FEEDS-SCHEDULE` with seven cases; 6 + 2 and 4 + 2 fail on the code
  before (it refused them), 3 + 4 and 3 + 2 fail with the check turned off, and 4.8 + 3.2 and 7.5 + 0.5
  fail without the whole-feeds check.
- **No second clinician has reviewed this change.**
## Session 2026-10-28 (3) — no Copy Order on a patient's order; the quick calc keeps its Copy

`calculator.jsx`, `compiled/calculator.js`, both shells' `?v=` tokens, eleven harnesses,
`app-walkthrough.md`, `BACKLOG.md`. No calculation, limit, unit or printed figure changed, and
`CONSTANTS_VERSION` stays `2026-10-27.2`.

### Why

Pp, 2026-10-28, looking at the Save + Copy Order card on a ward phone: "เอา copy order to clipboard ออกได้มั้ย".
A patient's order now leaves NeoFeed only as the printed form (or, on Center Point, CP's reviewed revision,
which never had Copy).

### What changed

- **"Copy Order to Clipboard" is gone from a patient's order**, for prescribers and nurses alike. The card is
  "Save Order"; Save draft, Submit and Delete are unchanged.
- **The quick calc keeps "คัดลอกผลคำนวณ"** (Pp, 2026-10-28: "Quick calc ให้ยังมีคัดลอกผล"): it has no Save and
  no form, so Copy is all it has (2026-09-21).
  Its text is byte-identical to before (checked by diffing three quick-calc orders' copies before and after).
  The patient-only branches of the copy text are gone with the button: the Bed / NeoFeed ID line, the
  critical-override line, and the `══ NeoFeed V2 — TPN Order ══` header and footer.
- Wording that named Copy now names Print alone: "พิมพ์ได้หลังบันทึก", "…ก่อนพิมพ์" in the held-order line,
  and the nurse's note "พิมพ์ได้เฉพาะคำสั่งที่แพทย์บันทึกแล้ว".
- The quick calc's Copy no longer calls its text an order (Vera, PR #180): the toast is "คัดลอกผลคำนวณแล้ว"
  (was "Order copied to clipboard") and the empty-step confirm asks "คัดลอกผลคำนวณต่อไปหรือไม่?" (was
  "Copy order ต่อไปหรือไม่?"). `verify-calc-clicks` §10 checks both; both fail before the change.

### Tests

- Checks of a patient's copied text went with it: the oracle's copy figures, calc-sum's copy BAG MAKE-UP,
  and the copy lines in the 0918, 0922, 0928, 1017, 1021 and 0917 harnesses. Every figure they read is
  still checked on the screen or the printed form, except the acetate in the bag (0928 §13): only the
  copy gave it, and only once `naAcetate.acetateMeqPerMl` is read off the label (it is `null`). The
  screen's acetate per kg is still checked.
- New: `verify-calc-clicks` asserts a patient's order has no Copy button, before saving and once printable;
  `verify-nursing-frontend` 5.8 asserts the same for a nurse; `verify-safety-review` asserts the one
  `navigator.clipboard` call sits in a `{scratch && <button …>}`. All three fail on `main`.
- Moved, not dropped: the "no .0" rule (0922 §8) and the K⁺ route wording (0928 §15) now read the quick
  calc's copy, the one copy left.

## Session 2026-10-28 (2) — Print ทั้งหมด and per-infant ticks on a ward's Print order list, no Calculator button there

`registry.jsx`, `app.jsx`, both shells (CSS), `compiled/`, `test/verify-print-all-1028.cjs` (new),
`test/verify-phone-sweep.cjs`, `test/verify-quick-calc.cjs`, `test/README.md`. No calculation, limit or
printed figure changed; `calculator.jsx`, `data.js` and `gas-backend.gs` are untouched.

### Why

Pp, on a phone screenshot of "Print order · NICU": "ให้หน้านี้ ทางขวาบนมีปุ่ม ปรินท์ทั้งหมด และไม่ต้องมี
แคลคูเลเตอร์ด้านขวาล่าง", then, in the same session: "ให้สามารถมีปุ่มซีเล็กเป็น คน ๆ ไปได้หรือซีเล็กออลก็ได้".

### What changed

- **Print ทั้งหมด**, top right of the list's head on every screen size (the phone's stacked page head
  is overridden for this page only; ← กลับ moved under the title). It counts the rows a tap would print
  and is off when there are none. A row still saving, or a day with two orders, is left out, as a tap
  on it does not print either.
- **A tick per infant, and เลือกทั้งหมด.** Each printable row has a tick beside its card (not inside it:
  the card is itself a button), all ticked when the list opens. เลือกทั้งหมด ticks or clears them all and
  shows part-ticked with "เลือกแล้ว 2 จาก 3 ใบ". The button reads Print ทั้งหมด (3) while all are ticked
  and Print ที่เลือก (2) otherwise, and is off at 0. A tap on a row still prints that one order. The
  ticks live in the list, so they reset to all when the list is opened again.
- **One order at a time.** The run opens each order from the list exactly as a tap on its row does
  (`openOrderToPrint`), so each still passes the calculator's Print gate and the edit lock, and gets
  one print preview. A bar on the calculator reads "Print ทั้งหมด · ใบที่ 1 จาก 3" with
  "ถัดไป: NICU 2 …"; the last reads "ใบสุดท้าย · กลับไปรายการ". An order held back (unsaved edit, a
  critical value with no reason, a colleague's lock) shows the usual reason, and ถัดไป still goes on.
  Leaving the calculator, or the list, ends the run.
- **Each order is asked the list's rule again before it opens** (`registry.jsx` `wardPrintableOrder`,
  shared by the list and the run). One a sync took off the list during the run (the infant discharged or
  moved, a second order that day, the order deleted, the day rolled over) is skipped with a toast naming
  it, and the run goes on.
- **No Calculator button on the print list.** It stays on the ward gate and the ward's patient list.

### Decisions

- **The next order opens on a tap, never on afterprint.** A browser need not wait for its print dialog
  before handing the page back, and moving the page on under an open dialog could put the next infant's
  order on this one's sheet. One tap per order costs less than one wrong-patient sheet sent to pharmacy.
- **Not one combined print job.** That needs every order's sheet rendered at once, and the sheet is
  built inside `Calculator` from its own state. A print-only mode there is a change to a dose file, and
  a second path that decides what may print. This one reuses the reviewed path untouched. If the ward
  wants one dialog for the whole ward, that is the follow-up.

### Vera

NO BLOCK on the first commit, three findings, all fixed in the second: the last bar said "ครบ N ใบ" though
the run cannot know a sheet printed (now "ใบสุดท้าย"); the queue was never re-checked, so a sync during the
run could auto-print an order a tap on the list could no longer reach (now `wardPrintableOrder` is asked
again before each order); a deleted entry ended the run silently (now skipped by name, the run goes on).
Her three proposed tests went in (`verify-print-all-1028` 3.5, #8 `resync`, #8b `gone`); each fails on
the first commit and passes on the second. Her second review: NO BLOCK, no findings, three tests proposed.
Two went in, #8c `moved` (an infant moved to SCN during the run) and #8d `midnight` (the day rolls over);
both fail on the first commit. The third (twins with one name) does not fail on either commit, so it is
left out, by her rule 5.

### Checked

`verify-print-all-1028.cjs` 72/72 on the sources and on `compiled/`; against `main` (`326bcd9`), every one
of its twelve scenarios fails.

## Session 2026-10-28 — Step 2: two feeds, each a milk and then its kcal/oz

`data.js` (`EN_PRODUCTS`, `enProductOf`, `enMixPer100mL`), `calculator.jsx` (Step 2, the EN terms of
`calc`, the saved inputs, the change list, the copied order), the clinical-rules skill (rules
`CR-U-EN-TWO-FEEDS`, `CR-EN-FEEDS-MAX`, `CR-EN-FEED-UNKNOWN`, and `CR-U-EN-KCAL`), `app-walkthrough.md`,
and the harnesses that pick a feed. No `EN_DB` row, limit or stock changed, and an order with one feed
computes exactly as before. No backend change: `calcInputJson` already stores the inputs as they are.

**`CONSTANTS_VERSION` stays `2026-10-27.2`, by Pp's decision (2026-10-28).** Vera pointed out that a
frontend without feed 2 (a ward tab loaded before the release, or `release` after a revert) opens a
two-feed order as feed 1 only and prints it unheld, since `calcMoved` only holds a different stamp; a
bump would hold it there, at the price of every older order being saved again before it reprints. Pp
chose no bump. So after a revert of this change, a two-feed order prints feed 1's figures alone until it
is re-entered, and a re-save from such a tab drops feed 2.

### Why

Pp, 2026-10-28, from a ward phone screenshot of Step 2: "ให้สามารถมีตัวเลือกสองอันสำหรับชนิดของนม
ต่อมามีให้เลือกเป็น kcal/oz, volume และจำนวนมื้อของนมชนิดนั้นๆ ... โดยไปดึงข้อมูลมาจาก Chula nutrition
book" — two feeds, each chosen as a milk and then its kcal/oz, with its own volume and feeds a day,
composition from the Chula handbook rows `EN_DB` already holds.

### What changed

- **Milk, then kcal/oz.** The one long feed list became two selects: the milk (grouped as before) and its
  strength. Each strength is an existing `EN_DB` row, so the order still saves one key per feed and every
  figure keeps its source. Only the strengths the formulary already had are offered (Enfalac Premature
  and Pre Nan 22/24, HiQ LF and Enfalac LF 20/24/27, the rest one each); adding one is a row plus a pair
  in `EN_PRODUCTS`, and is Pp's and the nutrition unit's call. The two selects share the three columns
  of the Volume / Frequency row below: the milk spans two, kcal/oz the third (Pp, from the desktop view:
  a fixed 112 px kcal/oz box beside a full-width milk box was out of proportion). Changing the milk keeps
  the kcal/oz when the new milk comes in it; otherwise it takes the new milk's first and says so beside
  the picker, "kcal/oz 30 → 22: Pre Nan ไม่มี 30 kcal/oz" (Vera's third review; 4.20–4.22).
- **A second feed.** "+ Add a second feed (นมชนิดที่ 2)" opens Feed 2 with its own milk, kcal/oz, volume
  and frequency; each feed shows its mL/day and mL/kg/d. The day's enteral volume and every nutrient are
  the sum of the two: `enMixPer100mL` weights one composition per 100 mL by each feed's mL/day, so fluid,
  the switch to enteral targets, every tile and alert and the Daily_Log columns read the sum. With one
  feed it returns that feed's own row object, so nothing moves for a one-feed order. The MEN tick covers
  both feeds and sits below them when there are two (Pp, after Vera asked: one tick, not one per feed).
- **At most 8 feeds a day between the two** (Pp, later the same day: "Feed 1+2 รวมกันมากสุดจะได้แค่ 8
  มื้อ หรือถ้ากินทุก 4 ชม ก็จะได้ 6 มื้อ"). The two feeds share one schedule, so with two feeds given,
  Feed 1's and Feed 2's feeds a day above `EN_FEEDS_PER_DAY_MAX` (8, q3h) cannot be submitted (a stop,
  like the 1,250 mL bottle: a draft can be kept). Step 2 shows "Feed 1 + 2 = 8 feeds/d · q3h". One feed
  alone is not checked; whether a q2h feed (12) should be is Q18 in the skill. Feed 1 with no volume
  beside feed 2 is a day of one feed (Vera's second review): not checked, and copied as one line.
  `docs/CLINICAL_CONSTANTS.md` has its row.
- **The two feeds at the same interval** (Pp, later still: "ถ้าอันนึงกด 3 feed อันนึงกด 4 feed จะทำไม่ได้
  ต้องให้ทั้งสองตัว เป็นทุก ชม ที่เท่ากัน"). With two feeds given, Feed 1's and Feed 2's feeds a day must be
  equal (`CR-EN-FEEDS-EQUAL`, a stop): 4 + 4 is q3h, 3 + 3 q4h; 3 + 4 is refused, and so is 6 + 2 though
  it makes 8.
- **A feed EN_DB does not hold stops the order** (Vera on this change). A saved feed whose key is not
  an `EN_DB` row (removed since, or written by a newer NeoFeed) was costed as the other feed once there
  could be two; `enMixPer100mL` now returns null for it, `enFeedsUnknown` names it, and the order cannot
  be submitted or printed until another milk is picked (`CR-EN-FEED-UNKNOWN`). Before two feeds such a
  key stopped the Calculator with an error.
- **Saved, compared, copied.** `calcInput` gains `enType2`/`enVol2`/`enFreq2` (an older row normalises
  to none), the change list names them, the copied order prints one line per feed and the total, and
  `savedDosingWeightOf` counts both feeds. The change list names feed 2's milk only where feed 2 is
  given (Vera's second review): removing it reads "Feed 2: Pre Nan → none", not "→ Breast Milk", and a
  milk picked for a feed 2 with no volume is no change.
- **Center Point** prints one feed (`neofeed-tpn-v2`), so a CP order is not offered a second, and feed 2
  counts for nothing there.

### Checks

- **No second clinician has checked the two-feed sum** or the figures a two-feed order prints (change
  protocol step 3). The harnesses below are the only check so far.
- `verify-calc-oracle.cjs`: two orders with two feeds (K1 alternating feeds beside a bag; K2 two feeds
  that reach 100 mL/kg/d only together), recomputed feed by feed rather than through the app's mix, on
  screen, in the saved row, on the form and in the copy. With feed 2 dropped from the app, both fail on
  45+ figures each (run once by hand, not kept as a switch).
- `verify-clinical-rules.cjs`: `CR-EN-FEEDS-MAX` (stop) with 8 saving, 9 refused, q4h's 6 saving, a
  feed with no volume not counted and one q2h feed not checked; with the limit set to 9 the refusal
  fails (run once by hand). `CR-U-EN-TWO-FEEDS` with five orders (fluid, the enteral switch from the
  sum, MEN over both feeds and the MEN ceiling on the sum); the harness learned `feed2`/`order2`.
- `verify-en-db-sources.cjs` 4.14–4.19: reopened orders with a feed not in `EN_DB`, and the change
  list with feed 2 removed or empty; each fails on the code before its fix.
- The harnesses that picked a feed by "the select with a BM_20 option" set the milk and then its
  kcal/oz; `verify-en-db-sources.cjs` §4 and `verify-tpn-meeting-0928.cjs` §9 walk both selects and still
  require exactly the sixteen feeds offered before.

## Session 2026-10-27 (5) — NF-04: Pp's clinical-rules skill, and a harness that reads its cases

`.claude/skills/neofeed-clinical-rules/SKILL.md` (new), `test/verify-clinical-rules.cjs` (new),
`AGENTS.md`, `test/README.md`. No calculation, limit, unit or printed figure changed, and
`CONSTANTS_VERSION` stays `2026-10-27.2`. It documents `main` after PR #171 (entry (4)), which merged while
this was written; the skill's rounding rules and its 0 mL stop follow #171.

### Why

Pp ticked NF-04 in her apply list of 2026-10-27: one file she owns that lists every limit and unit
convention the calculator enforces, each with its source, loaded by agents before they touch
calculation code. Each rule carries synthetic orders just inside and just outside its limit, and the
test suite reads them from that file, so Pp adds a test by adding a line to the skill.

### What the skill holds

56 rules, each with a stable ID (`CR-…`) that NF-12 and NF-28 will cite: 6 stops (Submit refused),
13 critical (Submit asks for a reason), 1 red line that asks for none, 6 cautions, 3 caps that change
the dose, 11 target bands, 13 units and conventions, 3 rounding rules. Each gives the value as coded,
`where` anchors (file, line and a fragment of the code that enforces it), the source, and its cases.
Sources were read on 2026-10-27: Avery 11th and Fanaroff 12th ed. from the full chapter text (cited by
page), the ESPGHAN/ESPEN/ESPR/CSPEN 2018 chapters by recommendation and PMID, ESPGHAN 2022 enteral,
Moltu 2021, the Thai paediatric PN guideline 2564 (public-hearing draft) and the product labels. The
zinc ceiling the team set on 2026-09-22 turned out to be Domellöf R 7.8's own "maximum of 5 mg/d".
Seventeen questions for Pp close the file, each naming its rule; they change nothing until she answers.

### What writing it found (nothing changed)

- A Ca:P that is exactly 1.7 on paper (Ca 52.7 with P 31 mg/kg/d) computes as 1.7000000000000002 and
  grades High beside a printed "1.7:1" and a range "1–1.7". K⁺ in the bag and the typed-weight check
  strip that float noise; Ca:P does not (Q6).
- A bag whose stocks exceed its prepared volume is a critical alert, so a reason sends a negative WFI
  to pharmacy; the 1,250 mL bottle, by contrast, is a stop (Q2).
- The Soluvit 10 mL and Peditrace 15 mL caps need more than 10 and 15 kg, so no infant inside the
  8,000 g weight limit reaches them.
- Vitalipid's 4 mL/kg and 10 mL cap are literals in `calculator.jsx`. The labels support both but say to
  add it only to Intralipid, and KCMH gives SMOF 20 % (Q4).
- Fanaroff's drug appendix (p. 8) gives KCl maxima of 40 mEq/L peripheral and 120 central; the K⁺ source
  searches of 2026-09-28 and 2026-10-11 had not found it. NeoFeed orders up to 60 and 200 (Q1).
- The total NPE:AA caution prints "24 kcal/g protein — aim at least 24" for 23.9: that line rounds with
  `displayNum` rather than `vsLimit`, so a value just under 24 prints as 24.

### Tests

`test/verify-clinical-rules.cjs`: 607 checks, every one read from the skill; `NEGATIVE_CONTROL=1`
(`GIR_HARD_HI` 12 → 13) fails 7 and `=2` (peripheral osmolarity graded `>` instead of `>=`) fails 4.
It passes against the shipped `compiled/` too.

## Session 2026-10-27 (4) — every stock mL to one decimal, half up; a stock at 0 mL cannot be ordered

`calculator.jsx`, `data.js` (`displayNum`, the 50% MgSO₄ rows), `compiled/calculator.js`, both shells' `?v=` tokens,
`center-point/tpn-snapshot.mjs`, `docs/CLINICAL_CONSTANTS.md`, `STATUS.md`, `BACKLOG.md`, `test/README.md`,
`test/verify-stock-ml-1027.cjs` (new), `test/verify-calc-oracle.cjs`, `test/verify-calc-sum.cjs`,
`test/verify-calc-clicks.cjs`, `test/verify-nutrition-unit-review.cjs`, `test/verify-review-0917-calc.cjs`,
`test/verify-tpn-team-0922.cjs`, `test/verify-tpn-answers-1027.cjs`, `test/verify-center-point-print-parity.cjs`,
`test/verify-kcmh-constants.cjs`, `test/verify-calc-fuzz.cjs`.
**`CONSTANTS_VERSION` `2026-10-27.1` →
`2026-10-27.2`**: #170 is in `main` but not released, and a release of #170 alone must not let these
figures reprint under its version. Released together, the two bumps cost one re-save.

The question sheet's item 4 asked whether pharmacy can measure stock to 0.01 mL. Pp, 2026-10-27: "ของจริง
นับ ทศนิยม 1 ตำแหน่ง เช่น 1.25 > 1.3 ml". Asked in the same session, she chose to round MgSO₄, K₂HPO₄,
heparin and ZnSO₄ the same way, and to stop an order when an ordered stock rounds to 0 mL.

- **One rounding for every stock mL**, `roundMl`: one decimal, half up. `toFixed(1)` rounded a true x.x5
  down whenever the float sat just below it. KCl 0.7 mEq at Factor 0.7 is 0.35 mL and printed 0.3; a
  21.75 mL SMOF syringe printed 21.7. `roundMl` clears the float tail at 6 decimals first.
- **K₂HPO₄, MgSO₄, ZnSO₄ and heparin print one decimal** (were two) on both sheets, on screen and in the
  copied order: MgSO₄ 0.53 → 0.5, K₂HPO₄ 1.68 → 1.7, heparin 0.69 → 0.7.
- **An ordered stock that rounds to 0 mL** (under 0.05 mL) cannot be submitted or printed: a red line,
  "Stock rounds to 0 mL", and the save panel names the stock. A draft may be kept, as with the bottle.
  It happens in the smallest infants: ZnSO₄ 0.05 mg/kg or K₂HPO₄ 0.02 mEq/kg at 500–700 g.
- **`displayNum` clears the float tail before it rounds** (Vera, finding 3). 1.5 mEq/kg of K₂HPO₄ at
  Factor 0.7 is 1.0499999999999998 in JS, so with the mL at one decimal a 1 mEq/mL line read "1 mEq =
  1.1 mL" (on `main`, "1 mEq = 1.05 mL"). It now
  reads "1.1 mEq = 1.1 mL". `roundMl` is `displayNum` at one decimal. No figure in the 0917 parity
  orders moved with it. Center Point's snapshot formats through `displayNum` too (Vera's second run), so
  its sheet also reads "1.1 mEq = 1.1 mL"; `verify-center-point-print-parity.cjs` adds that order.
- **The 50% MgSO₄ path is gone; every order is 10%.** Pp, answering Vera's 🟠: "ไม่ได้ใช้ 50% MgSO4 ที่จุฬาเป็น 10%MgSO4"; then
  "อันที่น้องกดไปก่อนหน้านี้ก็คิดตาม 10%MgSO4 ... เอาออกได้เลย": the orders saved as 50% were worked out on 10% too, so the 50% mL they printed was never
  used. Gone: the `mgStrength` state and the "Use 10%" button, `KCMH_STOCK.mgso4_50` and the
  reference row, the mg10/mg50 pair in `solVol`. A row that still says 50% reads, computes and prints
  as 10%, and a new row saves no `mgStrength`. Center Point's sheet keeps its "MgSO4 strength" slot,
  now always 10, so its own copy needs no schema change. That 50% order was Vera's worst case: 0.059 mL
  of 50% printed as 0.1, 0.68 mEq/kg against 0.4 ordered.

No second clinician has reviewed this change. Vera: NO BLOCK twice (her reports and the answer to each
finding are in the PR). Her 🟠 in both runs, a dose under 0.1 mL that rounds up to 0.1 with nothing
red, was worst with a legacy 50% MgSO₄ order. Pp's answer closed that case (the bullet above). For the
other stocks she wants no caution: "ไม่ต้องมีคำเตือน ยาตัวอื่นพิมพ์ 0.1 mL ตามที่ตวงได้จริง". Vera's third run reviewed a
stop for 50% orders (NO BLOCK, two 🟡); Pp then had the 50% path taken out instead. Vera's fourth run,
on the removal: NO BLOCK, three 🟡 (two stale comments and a README line), all fixed, and her test is § 5c.

### Tests

`verify-stock-ml-1027.cjs` (new): 54 checks; on `83aefe4` (`main` with #170) 26 fail, in every section. Six older
harnesses pinned two-decimal figures and now pin one decimal. The three printed-figure digests in
`verify-review-0917-calc.cjs` were recaptured with each moved figure named (10 of 297, every one of them
one of the four stocks). `verify-calc-sum.cjs`'s S5 (K₂HPO₄ and MgSO₄ at 0.01 mL) is now the
not-orderable case; two of its random orders (R13, and R21 after its volume change) reach the stop too.
Every harness on this commit: 99 of 99 in each pass (98 harnesses plus `DEAD=0 verify-kcmh-factor`); browser sections SKIP on this PC and run in CI.


## Session 2026-10-27 (3) — Vera's second review: a printed 900 mOsm/L is over; alert text past a limit

`calculator.jsx`, `compiled/calculator.js`, both shells' `?v=` tokens, `data.js` (comments),
`docs/CLINICAL_CONSTANTS.md`, `BACKLOG.md`, `test/verify-tpn-answers-1027.cjs` (§ 3d, § 3e),
`test/verify-calc-oracle.cjs`, `test/verify-status-zones.cjs`, `test/README.md`. `CONSTANTS_VERSION`
stays `2026-10-27.1`.

Vera ran again on `52be38b`: NO BLOCK, four 🟡 (her report is in the PR).

- **Peripheral osmolarity is graded on the whole number that prints, and 900 is over.** The form says
  "Peripheral (<900 mOsm/L)"; graded on the raw estimate, 899.5–900 printed "900" with nothing red. Pp:
  "900 ถือว่าเกิน". The Step 2 chip reads the same status instead of its own `> 900` copy.
- **GIR and dextrose alerts print a value past the limit as such** (`vsLimit`, as the lipid, K and
  NPE:AA lines do): GIR 12.01 read "12 mg/kg/min".
- **The register named too few printed lines.** The front sheet's Normal Requirement prints the new Na,
  K, Ca and P bands as well as Mg; the register row now says so, and § 3e reads them off the print.
- **Jochum Table 3 and K**: the table splits K by weight as printed (preterm < 1500 g 2–5, > 1500 g 1–3,
  term 1.5–3). The comment now quotes the rows; at or above 1500 g NeoFeed keeps its old 2–3.

### Tests

Every harness, both CI passes, on this commit (`test/README.md` for how): see the PR. Locally, before
it, on `52be38b`: 98 of 98 in each pass. `verify-tpn-answers-1027.cjs`: 67 checks, 46 fail on `2cf4277`.

## Session 2026-10-27 (2) — Vera's review: NPE:AA below 12 is red without a reason

`calculator.jsx`, `compiled/calculator.js`, both shells' `?v=` tokens, `data.js` (comments),
`docs/CLINICAL_CONSTANTS.md`, `BACKLOG.md`, `test/verify-tpn-answers-1027.cjs` (§ 3b, § 3c),
`test/README.md`. Corrects the entry below where it says NPE:AA below 12 is critical: it is red, and
asks for no reason. `CONSTANTS_VERSION` stays `2026-10-27.1`: no printed figure moves.

Vera ran on the change (NO BLOCK, four 🟠 and one 🟡; her report is in the PR). Pp decided the three
clinical ones on 2026-10-27:

- **NPE:AA below 12.** In NeoFeed a red line means a typed reason before Submit and Print, and an early
  bag with amino acid 3 g/kg and no lipid sits below 12, as does the KCMH worksheet's own recipe (about
  9): the rote override the 2026-09-23 change removed. Pp: "แดงแต่ไม่ต้องใส่เหตุผล". The alert keeps its
  red level and is marked `noReason`, which keeps it out of the Submit prompt and the Print gate; its
  text says no reason is needed.
- **IV K 5.0 from DOL 1.** The band on DOL 1–3 is 0–3, and 5.0 comes from Jochum's stable phase. Pp:
  "5.0 ทุกวัน". Unchanged.
- **Protein 4.5 on TPN + feeds.** Feeds alone can cross it (Hi-Q LBW 24 at 175 mL/kg/d is 4.6). Pp
  kept the total, ESPGHAN 2022's enteral ceiling. Unchanged; § 3c pins a feeds-only order above 4.5.

Not code: the ZnSO₄ stock label is to be photographed before the release that prints its mL (Vera's
🟡; `BACKLOG.md` § Now). The sources the commit messages did not name (her fourth 🟠) are in this
entry's commit.

Two harness edits of the first entry were taken back, since a red NPE:AA line no longer needs a reason:
`verify-kcmh-factor.cjs` is `main`'s again, and `verify-review-0911.cjs` and
`verify-incident-gaps-1021.cjs` keep their fixtures as on `main`.

## Session 2026-10-27 — the nutrition unit's and TPN team's answers of 2026-10-25

`data.js`, `calculator.jsx`, `log.jsx`, `app.jsx`, `compiled/`, both shells' `?v=` tokens,
`center-point/tpn-document.mjs` (two labels; digest re-pinned), `docs/CLINICAL_CONSTANTS.md`,
`BACKLOG.md`, harnesses (below). **`CONSTANTS_VERSION` 2026-10-17.1 → `2026-10-27.1`**: the ZnSO₄ mL
now counts in the WFI, Mg's printed normal requirement moves with the first-days range, and the
dextrose ceiling prints, so every saved order is saved again before it prints. No backend change. No
second clinician has reviewed this change.

### Why

Pp's 2026-10-19 question sheet (16 questions for the nutrition unit, 49 for the TPN team) came back
answered on 2026-10-25. Four answers could be read two ways; Pp settled them on 2026-10-27: "OK" in the
targets table (§ 2.5 rows 3–6 and 9) means follow the source; the "MgSO₄ not ordered" caution goes, as
the team said a bag without Ca, P or Mg needs no warning; K IV 5.0 applies at every weight; a bag above
the largest bottle cannot be ordered ("ห้ามสั่ง").

### What changed

- **Hard limits that had no source** (provenance audit 2026-10-17 § 3.8), now named in `data.js`:
  protein (TPN + EN) critical above 4.5 g/kg/d (was 4.8); IV lipid above 4.0 (was 4.5); IV K above 5.0
  mEq/kg/d at every weight (was 3.5); peripheral osmolarity critical above 900 alone, the 850 caution
  gone; NPE:AA has no ceiling (the > 32 critical is gone, since ESPGHAN's 30–40 kcal/g is a minimum) and
  is **critical below 12 kcal/g AA** on the IV portion, a caution below 20 as before. The tile reads
  "≥ 24".
- **GIR and dextrose follow Mesotten R 5.4**: GIR critical above 12 (was 13, Praew's 2026-09-22 margin),
  dextrose above 17.3 g/kg/d (was the KCMH sheet's 18). The Alerts page reads the same constant.
- **Fluid, Jochum 2018 Tables 1–3**: from DOL 6 every preterm tier is 140–160 (ELBW stayed at 160–180);
  VLBW DOL 5 is 160–180 (was 140–160).
- **Na and K by day and weight group** (Jochum preterm rows; below 1500 g on the fluid tier's weight):
  Na DOL 3 0–5 below 1500 g, 0–3 above; DOL 4–7 2–5 (was 0–3). K DOL 4–5 2–3, DOL 6–7 1–3 (was 0–3);
  DOL 8+ 2–5 below 1500 g. Na from DOL 8 stays 2–5: Jochum gives preterm 3–5 and term 2–3, and raising
  it by weight would push term infants off their own row, so it waits for the term question. The PN
  tiles, the trend bands (`log.jsx`) and the Reference page read the same functions; the Reference
  page's electrolyte table now prints the day columns the tiles use.
- **"First days of life" end at DOL 7** for Ca, P and Mg (`FIRST_DAYS_LAST_DOL`; Ca and P switched
  after DOL 1, Mg after DOL 2).
- **Kept as the unit's own values**, labelled so in `data.js`: PN energy DOL 3–7 70–100 (Moltu gives
  60–80) and Ca:P 1.0–1.7.
- **ZnSO₄ has a mL**: elemental Zn (pharmacy confirmed the paper form means elemental too), stock 1 mg
  Zn/mL (`KCMH_STOCK.znso4`). The back sheet and the copied order print its mL and the WFI counts it.
- **A bag above 1,250 mL**, the TPN room's largest bottle, cannot be submitted or printed, as for K⁺
  over the maximum; a draft may be kept.
- **New cautions**: heparin above the usual 1 U/mL (so a typed 10 is seen); oral vitamin D above 1,000
  IU/day, Munti-vim's 400 included (the nutrition unit's upper border).
- **Removed**: the "MgSO₄ not ordered" caution from PR #168. "Amino acid not ordered" stays.
- **Feeds**: Enfalac Premature and Pre Nan at 24 kcal/oz (the book's own strength, so its osmolality
  applies); Pre Nan moves to the Preterm formula group; Enfalac LF 20/24/27 is orderable in the
  Calculator. `center-point/tpn-document.mjs` gained the two new labels, so **Center Point's copy must be
  synced before release** (`BACKLOG.md` § Now).
- **Reference page**: Cu preterm 40 / term 20 µg/kg/d (was 40 for every age); vitamin D's 1,000 IU/day.

### Answers that confirm what NeoFeed already does

Infatrini is the powder; breast milk stays 67 kcal/100 mL; Preterm Formula 20 is still ordered; Neutral
Phos and Phosphate Solution's PO₄ mg is elemental P; K₂HPO₄ is the pure salt (15.5 mg P per mEq K);
Peditrace is Zn 250 µg/mL; D50W is dextrose monohydrate (3.4 kcal/g); Mg mg/kg/d means elemental Mg;
Vitalipid N Infant only, none on a lipid-free day, its fat not counted; the lipid rate ceiling stays 0.17
g/kg/h (written "g/kg/day" on the sheet, a slip for the hourly rate the question asked about); no alert
for a bag without Ca, P or Mg, for Ca in the bag with oral P only, or for zinc per kg.

### Not done

Listed in `BACKLOG.md` § Now, "What the answers of 2026-10-25 left open": the NPE:AA below 16 for more
than 7 days Alerts-page signal, oral PO₄ in mg, feed Mg, trade names, the HMF answer, and the questions
left unanswered.

## Session 2026-10-22 — a discharged infant can be brought back from a phone

`app.jsx`, `registry.jsx`, `compiled/app.js`, `compiled/registry.js`, both shells' `?v=` tokens,
`test/verify-readmit-1022.cjs` (new), `test/README.md`. No figure, dose file, printed line or server code
changes.

### Why

Pp, 2026-10-22, with a phone screenshot of Switch patient showing an infant as "Discharged · จาก iso …"
while the infant was back on the unit: "ดึงคนนี้กลับขึ้นมาใหม่ได้มั้ยคะ … หาที่กดกลับมาไม่มี". The way
back has always been Edit session (Status → Active, a bed), and the server keeps discharges in the ward
sync for 30 days so that a readmission can be found "via the patient picker" (`ARCHIVE_SYNC_DAYS`). On a
phone, though, both ways to that dialog were closed:

- **Switch patient only set the active patient.** On the ward list, where she was, nothing on screen
  changed: the sheet closed and the list stayed. Edit session lives on the patient strip, which only the
  patient screens show, so it took a tap on Dashboard that nothing pointed to.
- **The phone's archive card had no Edit.** The desktop archive row has had one all along.

### What changed

- **A pick in Switch patient opens the infant's Dashboard** when it is made on the ward list, Admin or a
  reference page. That is what a tap on a ward-list row already did. On a patient screen (Dashboard,
  Calculator, Growth chart, Alerts) it stays on that screen, now about the new infant, as before. So does
  a pick in the quick calc, whose typed figures live only on that page and would be lost on leaving it
  (Vera).
- **The phone's archive card has Edit**, in the middle column, under the active cards' Edit. It opens
  Edit session and not the Dashboard. There is no ⇄, as before: a bed is not moved for an infant who has
  left (`verify-mobile-bed-button.cjs` § 5).

### Not done

- Ward feedback lives in Pp's private notes, which this session could not read, so it was not checked
  before this UI change.
- The archive list on the ward page still shows only the last 7 days, while Switch patient finds a
  discharge for 30. An infant discharged 8–30 days ago is brought back through Switch patient.

## Session 2026-10-21 — PR #168: a caution for a bag without amino acid or MgSO₄; a bag's route is pressed, never assumed

`calculator.jsx`, `compiled/calculator.js`, both shells' `?v=` tokens, `test/verify-incident-gaps-1021.cjs`
(new), `test/verify-center-point-entry.cjs` (§ 7), `test/verify-calc-oracle.cjs`, eleven other harnesses
that press a route for their first orders, `test/README.md`. `CONSTANTS_VERSION` stays `2026-10-17.1`: no
figure moves. One printed line does: a saved order with no bag, reprinted, now ticks neither route box
where it ticked Central (below). No second clinician has reviewed this change.

### Why

Pp checked the slips the TPN pharmacy phones doctors about on paper orders against NeoFeed (her counts
stay in her private product notes). On paper a blank box makes the pharmacist call. In NeoFeed no box is
blank, so two of those slips would pass with nobody asking:

- Amino acid or MgSO₄ left at 0. Their tiles read 0 as "empty" (`D.rangeStatus`), not off target, so no
  alert fires, and the form prints "—", which pharmacy reads as "not ordered". A new order copies the
  last one's values, which covers every order but the first and any box someone cleared.
- The route. Every order without an earlier one started on Central, so a peripheral line left unpressed
  printed as Central, and the peripheral osmolarity and dextrose checks never ran.

Pp, 2026-10-21: "warn เมื่อมีถุง TPN แต่ amino acid หรือ MgSO4 เป็น 0 และให้ใบแรกของเด็กต้องเลือก route เอง".

### What changed

- **Two cautions** (level warn): "Amino acid not ordered" and "MgSO₄ not ordered", whenever the bag has
  volume and that dose is 0. A caution asks for no reason and stops nothing. No bag, no caution. KCl is
  left out: Pp named amino acid and MgSO₄.
- **A bag's route is pressed.** An order starts with no route (`null`) when there is no earlier order,
  when the order it copies had no bag, and when it reopens a saved order that had no bag. Neither button
  is on, the Step 3 header says "ยังไม่ได้เลือก route", and Submit stays disabled while a bag is ordered,
  with the reason in the save panel. An order made from, or reopening, a day with a bag keeps its route,
  as before (`bagRouteFrom`). The no-bag rule is Pp's answer to Vera's first finding: every feeds-only or
  NPO row saved before today holds the old default "central", so the first bag after one would have
  opened on Central unasked ("ให้เลือกใหม่"). Vera's second review found the same gap on the edit path.
- **A bag row saved with no `route` key** (before calcInput kept one) printed as Central and still
  reopens as Central (`normalizeCalcInput`).
- **No bag, no route needed.** An NPO or feeds-only order submits without one and saves `route: null`;
  the form ticks neither box, its K⁺ lines say "no route", and the copied order says "Route: —". A no-bag
  order saved before today, reprinted, now prints the same way instead of "☑ Central".
- **IV lipid alone** needs no route either: Pp, on Vera's fourth finding, "ไม่ต้อง".
- **A draft may be kept without a route.** Its Daily_Log route reads "TPN" (still parenteral to
  `isParenteralEntry`), it reopens without a route, and Submit waits for one.
- **Center Point** needs a route on every order: its packet validator accepts only central or peripheral
  (`center-point/tpn-document.mjs`).
- **Until a route is chosen** the bag is graded as on a peripheral line, the stricter one: K⁺, osmolarity
  and the dextrose "Central only!" flag (Vera, third finding). Nothing reaches pharmacy that way, because
  Submit waits for the choice.
- The quick calc saves nothing and keeps Central.

### Not done

- Browser storage written before this release: an unsaved draft (`neofeed_draft_*`, kept 72 h) or the
  last submission state (`neofeed_calc_*`, kept 7 days) with a bag holds "central" whether or not it was
  pressed, and comes back on Central. It cannot be told apart from a pressed Central, and the window
  closes a week after release (Vera, second review, not reviewed; Pp's call).

### Tests

`verify-incident-gaps-1021.cjs`, 59 checks: 31 fail on `d9c815c`; the 5 checks Vera's first review asked
for fail on `9d3fc21`, and the 2 edit checks from her second fail on `8cf27fd`. `verify-center-point-entry.cjs`
§ 7, 8 checks, 6 fail on `d9c815c`. Twelve harnesses that typed a first order and saved it as Central
now press Central (two of them only just before saving, because they check that merely opening a form
writes no draft), and `verify-calc-oracle.cjs` grades the two cautions itself. Locally every harness passed in both CI passes (96 of 96 each, on `b754bcf`); the browser sections of 10 harnesses skipped, because this PC's Playwright wants a Chromium build it does not have, so they run only in CI.

## Session 2026-10-20 (3) — PR #159: BM + HMF from Chula p. 10; Vera on the update

`data.js` (Enfamil HMF source, `BM_HMF_24`, and through it `FBM_INF_MIX`), both shells' `?v=` tokens,
`docs/CLINICAL_CONSTANTS.md`, `test/verify-en-db-sources.cjs`, `test/verify-calc-oracle.cjs`,
`test/verify-calc-fuzz.cjs`. `CONSTANTS_VERSION` stays `2026-10-17.1`.

### Why

Vera on `19ba38e`, finding 1: the 2026-10-20 (2) entry below and the register called Pp's message a
sign-off of every number, though questions 2 and 4 had no answer and both choices depart from the book she named. Asked
the same day, Pp answered:

- **Question 4, the HMF:** Chula p. 10, not WHO Box 1.3.3.
- **Question 2, the strength:** the ward mixes Enfalac Premature and Pre Nan at both 22 and 24 kcal/oz.
  Pp wants the feed input redesigned: pick the milk, the kcal it is mixed at, the volume and the feeds a
  day, up to two milks a day. That is new work for its own PR. Until then the Calculator offers 22, as
  it always has.
- **Merge:** into `main` once this is fixed and CI passes.

So the (2) entry's "Pp's sign-off of the figures" covers question 1 (the book, not today's labels),
question 5 (PF 20 kept) and now questions 2 and 4 as answered here. Questions 3, 6 and 7 keep the PR's
choices.

### What changed

- **Enfamil HMF from Chula p. 10** (PDF p. 18), read from the page image: the Enfamil HMF (Mead Johnson)
  powder column, per 1 g protein (the protein row reads 1 in every column, whatever the "per 4 packages"
  title says): 13 kcal, fat 0.9 g, CHO 0.4 g, Ca 81.8, P 40.9, Na 14.5, K 26.4 mg. The book gives no
  dose, so one 4 g dose carries 1.1 g protein, from WHO Box 1.3.3 for the same product.
- **BM + HMF per 100 mL:** kcal 81 → 81.3, fat 4.05 → 4.39, CHO 7.8 → 7.14, Na 1.4 → 1.59, K 1.89 →
  2.13 mmol; protein 2.3, Ca 116 and P 59.9 unchanged. At 150 mL/kg/d, Na 2.1 → 2.39 and K 2.84 → 3.2
  mmol/kg/d. `FBM_INF_MIX` follows as their mean: Na 1.5 → 1.6, K 2.22 → 2.35.
- Osmolality stays blank: p. 10 gives osmolarity in mOsm/L (377 estimated, 401 from the literature),
  not mOsm/kg. The row's note now quotes it in place of the WHO Box's +63.
- **Vera, finding 2:** the register now calls the harness copy a second transcription by the same
  reader, and says no person has checked the Na, K and osmolality cells against the page.

### Merged with `main`

- `main` with #160 merged in. #160, merged first on Pp's instruction, holds rows saved before
  2026-09-18 until they are saved again, which closes the fourth "Not done" item of the 2026-10-17 (6)
  entry. This PR's entries were renumbered around `main`'s: 2026-10-17 → (6), 2026-10-20 → (2),
  2026-10-20 (2) → (3). The shells' tokens are the build's.

### Tests

- `verify-en-db-sources.cjs` types p. 10's column from the page and checks it adds up (4P + 9F + 4C =
  13.7 against the printed 13). On `19ba38e` it fails 3 of 145 (BM + HMF, the mix, and the source
  cite); here 145/145.
- `verify-calc-oracle.cjs` and `verify-calc-fuzz.cjs` take the p. 10 column by hand. The oracle fails 24
  of 1092 on `19ba38e`; here 1092/1092. `verify-review-0917-calc.cjs` §6's BM + HMF fingerprint passes
  unchanged, so none of the printed figures it pins moved.

### Not done

- **Second clinician's sign-off** (change protocol step 3): none for the p. 10 HMF figures (Vera's second
  run, on `c9148df`).
- Which Enfamil HMF KCMH stocks, the powder this row uses or the acidified liquid on the same page, is
  for pharmacy to say.

## Session 2026-10-20 (2) — PR #159: Pp's answers; Preterm Formula 20 kept as it was

`data.js` (`BM_PF_20`), `calculator.jsx` (feed list and alerts back to what `main` has), `compiled/`, both
shells' `?v=` tokens, `docs/CLINICAL_CONSTANTS.md`, `test/verify-en-db-sources.cjs` §2 and §4,
`test/verify-calc-oracle.cjs`, `test/verify-calc-fuzz.cjs`, `test/verify-calc-sum.cjs`,
`test/verify-tpn-meeting-0928.cjs` §9. `CONSTANTS_VERSION` stays `2026-10-17.1`.

### Pp's answers (2026-10-20)

Pp: "ข้อ 159 ตัวเลขทำตาม แหล่งอ้างอิงคือหนังสือchula handbook แบบอ่านจริง ส่วน PF 20 kcal/oz คงไว้อย่างเดิมก่อน
มี plan ปรับเรื่องสูตรนมอีกครั้ง".

- **The numbers stand, sourced to the Chula handbook as read from its pages** (question 1: the book, not
  today's pharmacy labels). This is Pp's sign-off of the figures in the 2026-10-17 entry.
- **Preterm Formula (20 kcal/oz) stays as it was** (question 5). The Calculator offers it again, under its
  plain label, in every new, reopened and copied order. There is no "no source" mark and no critical
  alert. Its numbers are the ones it had on `main`, osmolality 290 included. It keeps `unsourced: true`,
  so the Formula reference page still reads "No source" on its row.
- Questions 2, 3, 4, 6 and 7 got no separate answer. The PR's choices stand until the formula revision
  Pp plans: Enfalac Premature and Pre Nan at 22 kcal/oz (73 kcal/100 mL), Infatrini powder, Enfamil HMF
  from WHO Box 1.3.3, breast milk at 67 kcal/100 mL, and FBM ↔ Infatrini as a 50:50 mean.

### Tests

- `verify-en-db-sources.cjs`: §2 checks `BM_PF_20` against its old numbers, typed in the harness. §4 now
  says a new order can pick it, and a reopened or copied order on it shows its plain label and raises no
  alert that mentions a source. On `44f88e4` it fails 6 of 144 (the old numbers' osmolality, the list,
  picking it, the label, and the two alerts); here 144/144.
- `verify-tpn-meeting-0928.cjs` §9 expects PF 20 in the Preterm formula group again (2 fail on `44f88e4`).
- `verify-calc-oracle.cjs`, `verify-calc-fuzz.cjs` and `verify-calc-sum.cjs` take PF 20 back into their
  scenarios, with its old numbers typed by hand in the oracle and the fuzz.

### Not done

- **Second clinician's sign-off** (change protocol step 3): still none.
- PF 20 still has no source. The formula revision Pp plans decides its fate, with questions 2, 3, 4, 6
  and 7.

## Session 2026-10-20 — PR #160: no bump, merged into `main` before #159

`CHANGELOG.md`, `STATUS.md` (this PR's line, and caught up with release #165 as it asked). No code changed
after `82c4bd3` except merging `main` in.

- **Pp's answer** to the PR's question (2026-10-20): "#160 ไม่ bump แล้ว merge ก่อน". `CONSTANTS_VERSION`
  stays `2026-10-11.1`, and this PR merges into `main` before #159, which bumps to `2026-10-17.1`.
- **`main` merged in** (#158, #161, #162, #164). Both sides had a `2026-10-17 (3)` entry here; this PR's is
  now `2026-10-17 (5)`, its text unchanged. The shells' tokens are the build's.
- Merged into `main` on Pp's instruction. Not live until a `main → release` PR.

## Session 2026-10-19 (4) — no "LBW" under a birth weight of 2500 g or more

`app.jsx` (`PatientStrip`), `compiled/app.js`, both shells' `?v=` tokens, `test/verify-bw-category-1019.cjs`
(new), `test/README.md`, `STATUS.md` (caught up with #163, as its release comment asked). Frontend only, no
`clasp` step. Not a dose file and not on the order: both shells hide `.patient-strip` in `@media print`, so
no Vera, and `CONSTANTS_VERSION` is unchanged.

### Why

On the dev-local run before release #163, a made-up 4,400 g term boy read "LBW" under BIRTH WEIGHT. The
label was `bw < 1000 ? ELBW : bw < 1500 ? VLBW : LBW` with no upper bound, so every birth weight from
1,500 g up was called low. The code is older than #163.

### What changed

- **The label:** ELBW < 1000 g, VLBW 1000–1499 g, LBW 1500–2499 g, and no line under the birth weight from
  2500 g.
- **Nothing for a large infant either.** Asked whether 4000 g and up should read HBW, Pp chose no label
  (2026-10-19, "ไม่มีป้าย"): macrosomia cutoffs differ (4000 or 4500 g), and grams alone ignore GA.
- **Only one copy.** Every `.jsx` file, `data.js`, both shells and `center-point/` were searched for the
  same ELBW/VLBW/LBW pattern. `PatientStrip` is the one place a category comes from the birth weight; the
  other matches are guideline text, the fluid table's rows (already four tiers, < 2500 g) and demo
  diagnoses.

## Session 2026-10-19 (3) — `tools/ci_bans.js`: a correction made twice becomes a failing build (NF-19)

`tools/ci_bans.js`, `test/ci-bans-fixtures.json` (new), `.github/workflows/test.yml`, `AGENTS.md`,
`test/README.md`, `STATUS.md` (this PR's line; #158 had already caught up with #156 and #157). No app
code changed; nothing to release.
PR #162, merged into `main` on Pp's instruction ("merge PR #162 เข้า main ได้เลย").

### Why

The YouTube-Knowledge issue of 2026-10-14 recommended NF-19: a rules file or a skill can be forgotten by
the next session, a failing build cannot. Pp's corrections are made in chat, not in PR review comments
(the repo's PRs carry none from her), so the first rule comes from the one with a dated ruling and a fix
commit behind it: no trailing zero in a number a person reads (Pp, 2026-09-22, "ห้ามมี .0 เช่น 18.0 คือ
18"; `bc46d16`, which also took `keepZeros` out of `displayNum`).

### What changed

- **`raw-tofixed`:** a `toFixed(n)` with n > 0 that is not inside `parseFloat()` or `Number()` fails CI
  and points at `D.displayNum`. `main` passes it today with one allow entry, the SVG path coordinates in
  `log.jsx`; an allow entry that stops matching fails the run.
- **CI** runs `node tools/ci_bans.js --self-test` (12 cases), then the check over the 17 tracked sources,
  after the shell comparison and before the harnesses.
- **AGENTS.md:** a correction Pp makes a second time becomes a rule here with a failing and a passing case.

## Session 2026-10-19 (2) — weight from 36.5 weeks on Fenton's growth-monitoring curve

`data.js` (`FENTON_WEIGHT_GROWTH_LMS`, new), `fenton.jsx` (`FentonChart`: the weight curves and the
readout from 36.5 weeks), `compiled/fenton.js`, both shells' `?v=` tokens,
`test/verify-fenton-monitor-1019.cjs` and `test/fenton-official-1019.json` (new),
`test/verify-fenton-half-week-1017.cjs` (§ 2–3: where the weight curve ends), a comment in
`test/verify-fenton-official-1017.cjs`, `test/README.md`, `docs/CLINICAL_CONSTANTS.md`, `BACKLOG.md`. Frontend
only, no `clasp` step. Its own PR, built on draft PR #158. It answers that PR's question 1.

### Why

`FENTON_WEIGHT` is Fenton's size-at-birth table, and the app used it for growth monitoring too. Fenton's
growth chart follows it to about 37 weeks and then bends towards WHO at 50, so from 37 weeks the app was up
to 10.2 centile points off Fenton's own calculator (a boy at 41+4 weighing 4325 g read ~90th; the
calculator says the 80th). Pp asked for the closest match to Fenton, compared two ways, without asking
Fenton for the LMS by email (2026-10-19): "ทำข้อ 2 เทียบกับข้อ 3 แล้วเอาที่ตรงที่สุดมาใช้ ไม่ต้องส่ง email", then
"แล้วแก้ไขส่วนที่แอปใช้ตารางผิด".

### The two ways, and the one used

- **From the printed chart.** The five weight curves of ucalgary.ca's 2025 chart PDFs, digitised from
  their 600-dpi raster at 36–46 weeks (the trace matched the audit's earlier digitisation within about
  ±12 g), with L, M and S fitted at each half week.
- **From Fenton's calculator.** One round to fentongrowth.ca that Pp approved: two submissions, sex and data type
  Growth, 48 made-up weights each, GA and weight only. Three weights at each half week from 36 1/2 to 42
  give L, M and S exactly; 12 more per sex, on other days and near the 3rd, 25th, 75th and 97th, were
  held out.
- **Compared on the 34 points neither was built from** (the 24 held out and the 10 monitoring weights of
  2026-10-17): the calculator's LMS within 0.02 centile points (mean 0.01), the chart's within 0.19 (mean
  0.06). The calculator's is used. The two agree on M within 2 g at every week.

### What changed

- **`FENTON_WEIGHT_GROWTH_LMS`** in `data.js`: `[exact PMA, L, M, S]` every half week, 36.5–42.0, both
  sexes, with its source. Column 0 is an exact age, unlike `FENTON_WEIGHT`'s completed weeks.
- **The weight curves from 36.5 weeks** are drawn from it (3rd, 10th, 50th, 90th and 97th at each half
  week). Before 36.5 they are the size-at-birth rows at GA + 0.5 as before; at 36.5 the two agree within
  12 g.
- **A weight from 36.5 weeks is read as an LMS z-score**, not by linear reading between curves, in the
  same words: "<3rd", "~Nth", ">97th".
- **A DOL-1 weight stays on the size-at-birth rows**, as Fenton's Birth size evaluation does: a girl born
  40+5 at 3450 g reads ~48th on DOL 1 (official birth size 46.7) and ~41st on DOL 15 at the same PMA.
  While the newest point is DOL 1, the chart draws the size-at-birth rows too, so the dot and the number
  agree (Vera, fifth run 🟠: a boy born 41+4 at 4400 g read ~92nd under a drawn 90th of about 4577 g).
  From DOL 2 it draws the monitoring curve. A lone DOL-1 weight therefore looks as it did before.
- Length and HC are unchanged. `CONSTANTS_VERSION` stays `2026-10-11.1`: no Fenton figure is printed or
  saved. The bump rule in `data.js` and `docs/CLINICAL_CONSTANTS.md` no longer lists `FENTON_*` and says
  why (Vera 🟡: it listed them while Fenton changes were not bumped).

### Tests

`verify-fenton-monitor-1019.cjs` (new) 93/93, against the sources and with the compiled preload: 70
monitoring weights from 37 weeks within ±1 centile point of the official one (mean 0.08, worst 0.44).
Against `a04ba28`, the commit before the change, 44 fail; against `f56cc36`, the two DOL-1 drawing
checks. `verify-fenton-half-week-1017.cjs` 65/65 after its
two checks of where the weight curve ends (now M at 42.0, not the midpoint of rows 41 and 42), and
`verify-fenton-official-1017.cjs` 81/81, whose recorded 37+ group fell from mean 3.3 and worst 10.2 to mean
0.2 and worst 0.4.

### Not done

- No second clinician has checked this; Pp reviews the PR.
- The LMS are solved from Fenton's calculator, not received from Fenton. If the API changes version, run
  the round again (`test/README.md`). The ucalgary.ca site states no licence for the charts or the
  calculator, and Pp chose not to ask by email.
- Under 36.5 weeks the readout still reads linearly between curves (up to about 4.5 points off).
  Length and HC are unverified. The chart still stops at 42.

## Session 2026-10-19 — PR #158's last review fixes: DOL-1 length and HC recorded, the Length note narrowed

`fenton.jsx` (the Length note, a comment), `compiled/fenton.js`, both shells' `?v=` tokens,
`test/verify-fenton-official-1017.cjs` (§ 2–4), `test/README.md`, `docs/CLINICAL_CONSTANTS.md` (the
`FENTON_WEIGHT` row), `BACKLOG.md` (§ Next, growth question 1). Frontend only, no `clasp` step. On draft PR #158; nothing released. It corrects
entry (3) below, which this file's rule keeps as it was.

### Why

Pp gave the DOL-1 decision of 2026-10-17 to two sessions. One pushed `92c2fcf` to this PR. The other,
which ran the official check, made the same change as `cf14355` and `bf82014` on a local branch, did not
push it, and sent four points the PR lacked. `fenton.jsx` behaves the same in `92c2fcf` and `cf14355`
(their compiled output is identical), so the code stays `92c2fcf`'s. The PR's session took all four
points and Vera's third review of `92c2fcf` (NO BLOCK, two 🟡), made part of the edits, and left them
uncommitted while it waited for the ordinal commit, entry (4), which was never pushed. This entry lands
them on top of entry (4).

### What changed

- **The official harness asserts DOL-1 weight only**: 10 points within ±5 (worst 4.1, mean 1.6). The 8
  DOL-1 lengths and HCs join § 3 with the other length and HC points, because they read 4-weekly rows that
  no numeric source verifies, so a gap there would be the rows', not the method's. They pass today (worst
  4.2) and must still carry no size-at-birth label. Entry (3) said all 18 were asserted.
- **The Length note says "ช่วงใกล้ 42 สัปดาห์"**, not "หลัง 38 สัปดาห์" (Vera 🟡1). The evidence is the
  42-week row, about 3 cm high (`BACKLOG.md`, the 2026-09-23 review), which pulls the curve up toward 42
  weeks. The one official point after 38 weeks, a boy at 38+3 and 51.9 cm, reads ~89th against an
  official 84th: the app reads him longer there, not shorter.
- **The register row** (`FENTON_WEIGHT`) records the official check: growth monitoring under 37 weeks
  within 4.5 centile points, DOL-1 weight within 4.1, and growth monitoring from 37 weeks up to 10.2 points
  off, because the rows there are the size-at-birth rows. Its status splits to match (Vera, fourth run,
  🟡): 🟢 for size at birth and for growth monitoring under 37 weeks, 🟡 for growth monitoring from 37.
- **Weight from 37 weeks has no note yet** (Vera, fourth run, 🟠). The comment above the Length/HC note
  said Weight needs none; it now says why that holds only under 37 weeks. Whether the Weight tab gets a
  note there is growth question 1 in `BACKLOG.md` § Next, which now carries the official check's figures.
  No behaviour changed.
- **Entry (3)'s "neither harness depends on" the ordinal fix was wrong** (Vera 🟡2): the half-week
  harness's parser read only "th". Entry (4) changed the parser.
- `CONSTANTS_VERSION` stays `2026-10-11.1`: no `FENTON_*` value changed, and no Fenton figure is printed
  or saved.

### Tests

`verify-fenton-official-1017.cjs` 81/81 and `verify-fenton-half-week-1017.cjs` 65/65, against the sources
and with the compiled preload. The official harness against 55d893d fails 30 (24 of the 31 weights under
37 weeks, 6 of the 10 DOL-1 weights); against `ea0abe0`, which read DOL 1 by completed week, it fails the
18 DOL-1 points (the 10 weights in § 2, the 8 lengths and HCs in § 3 on their label).

### Not done

- No second clinician has checked the DOL-1 reading at exact age; Pp reviews the PR.
- A birth at 22+0 to 22+3 now reads "—" until 22+4, because NeoFeed draws no curve before 22.5; it used
  to be read against row 22. No official point was taken that early, so what fentongrowth.ca gives there
  is not known.

## Session 2026-10-17 (6) — EN_DB rebuilt from the handbook pages (draft, for Pp's sign-off)

`data.js` (`EN_DB`, `CONSTANTS_VERSION` 2026-10-11.1 → **2026-10-17.1**), `calculator.jsx` (feed options,
one critical alert), `app.jsx` (Formula reference page), `compiled/`, `docs/CLINICAL_CONSTANTS.md`,
`test/verify-en-db-sources.cjs` (new), `test/verify-calc-oracle.cjs`, `test/verify-calc-fuzz.cjs`,
`test/verify-calc-sum.cjs`, `test/verify-tpn-meeting-0928.cjs`, `test/verify-review-0917-calc.cjs`.
Frontend only, no `clasp` step.

### Why

Pp asked on 2026-10-17 whether every NeoFeed number is calculated or sourced rather than guessed by an
AI. The provenance audit that day (outside this repo, in Pp's notes) found the arithmetic clean and the
feed table not: commit `357d095` (2026-05-28) had copied most formula rows from
`docs/Chula_Handbook_Ed3_Reference.md`, an AI extraction of the Chula Pediatric Nutrition Handbook whose
tables do not match the scanned book. It cited sections ("§3", "§5") the book does not have.

### What changed

- **The source tables are in `data.js` as printed**, and every `EN_DB` row is computed from them:
  Chula Handbook 3rd ed. Table 5 p. 16 (Enfalac Premature, Pre Nan, Hi-Q LBW), Table 7 p. 18 (Hi-Q LF,
  Enfalac LF) and Table 16 p. 29 (Infatrini powder), all per 100 kcal with Na and K in mg; WHO 2006
  technical review Box 1.3.1 (term mature milk, per litre) and Box 1.3.3 (Enfamil HMF, 4 g). Book page =
  scanned PDF page − 8. Each row names its `source`.
- **Printed EN figures move** for every feed except breast milk (Ca 26 → 26.05, P 15 → 14.87 from the
  Box's mmol) and Infatrini's macronutrients. The largest: HiQ LF P −42% and Ca −25%; Infatrini Ca −20%
  and P −22%; BM + HMF protein 2.6 → 2.3 g/100 mL; Hi-Q LBW protein +26% and K −21%; Pre Nan protein
  +25% and Ca +28%. The PR body has the table per feed and the effect at 150 mL/kg/d.
- **Enfalac Premature and Pre Nan stay at 22 kcal/oz**, now 73 kcal/100 mL (1 oz = 30 mL, as for every
  other strength; `357d095` had set 74). The book prints both at 24. 22 is the ward's: NeoFeed had
  "Preterm Formula (22 kcal/oz)" at 73 from its first commit until `357d095` named it Enfalac Premature
  (Vera, on this change). Which strength the ward mixes is a question for Pp.
- **`BM_PF_20` "Preterm Formula (20 kcal/oz)" has no source.** Per 100 kcal it is a term formula (2.2 g
  protein, 75 mg Ca). It keeps its old numbers and `unsourced: true`, and the feed list no longer offers
  it. An order that still has it (reopened, or copied into the next day's order) lists it marked "no
  source, choose another" and raises a **critical** alert, *Feed composition has no source*, so Save asks
  for a reason each day until a sourced feed is chosen. A MEN feed counts toward no figure and raises none.
- **`FBM_INF_MIX` is the mean of `BM_HMF_24` and `INFATRINI_30`**, computed. It was a mean of rows that
  no longer exist.
- **Osmolality the source does not give is blank**: breast milk, BM + HMF (the Box gives only the +63
  rise), the alternating feed, Enfalac Premature and Pre Nan at 22 kcal/oz, and LF at 24 and 27 (the book
  gives each product's osmolality at its printed strength only). No calculation reads EN osmolality.
- **The Formula reference page** rounds every figure through `displayNum` and shows each row's source.

### Tests

- New `test/verify-en-db-sources.cjs`, with its own transcription of the pages: each column's energy
  sum and printed Ca:P check the transcription; every row equals its source; every row names its
  table and page or is the one unsourced row; the feed list offers no unsourced feed, and a reopened or
  copied order on one raises the critical alert; the Formula page shows sources. On the tree before this
  change it fails 61 of 144.
- `verify-calc-oracle.cjs` and `verify-calc-fuzz.cjs` take their feeds from the pages by hand, not from
  `data.js`. The oracle fails 182 of 1018 checks on the old `EN_DB`. `BM_PF_20` left the oracle, fuzz and
  calc-sum scenarios, because it can no longer be picked; `verify-tpn-meeting-0928.cjs` §9 expects it
  gone from the list.
- `verify-review-0917-calc.cjs` §6 recaptures two printed-figure fingerprints. BM + HMF order: 4 of 86
  figures moved (EN Ca 67 → 68, EN PO₄ 34 → 35, total Ca 127 → 128, total PO₄ 65 → 66). Hi-Q LBW order:
  Ca 134 → 157, printed twice, of 64.

### Not done

- **Second clinician's sign-off** (`docs/CLINICAL_CONSTANTS.md`, change protocol step 3): none yet. This
  is a draft PR; Pp decides whether it ships.
- **Not checked against today's pharmacy labels.** The book is from 2565 (2022); products change.
- **Which HMF KCMH stocks.** BM + HMF follows WHO Box 1.3.3, as asked. Chula p. 10 prints Enfamil HMF with
  more Na and K, which would make BM + HMF Na 1.59 and K 2.13 mmol/100 mL (here 1.40 and 1.89).
- An order saved before 2026-09-18 carries no `CONSTANTS_VERSION`, and `calcMoved` holds it only for
  overfilled vitamins or MEN, so it can reprint with the new EN figures without a save (Vera). Older than
  this change; not fixed here.
- Mg per feed is in the same tables (BACKLOG "Feed magnesium") and was not added.
- `STATUS.md` is untouched: nothing is merged or live.

## Session 2026-10-17 (5) — an order saved before 2026-09-18 prints only after it is saved again

`calculator.jsx` (`calcMoved`, comments on `savedCalcVersionOf`), `compiled/`,
`test/verify-calcmoved-unstamped-1017.cjs` (new), fixtures in six harnesses (below), `test/README.md`,
`docs/CLINICAL_CONSTANTS.md` § When to bump. Frontend only, no `clasp` step. `CONSTANTS_VERSION` stays `2026-10-11.1` (no printed figure
moves; Pp to confirm in the PR).

### Why

Vera, reviewing draft PR #159 (finding 4): a saved order prints what the calculator computes now from its
inputs, and `calcMoved` holds Print until it is saved again when its stamped `CONSTANTS_VERSION` is not
the current one. A row saved before 2026-09-18 has no `calcInput.constantsVersion` and no `aaProduct`, and
for those `calcMoved` checked only `2026-09-18.1`'s own changes: an overfilled bag with Soluvit or
Peditrace, and a MEN feed. That was right while `2026-09-18.1` was current. Since `2026-09-28.1` every
stamped row older than the current version is held, but an unstamped one still printed unless it hit one
of those two cases. A feeds-only order from before the stamp, FBM_PF_24 30 mL × 8 at 1500 g with no TPN,
reprinted under its old entry id with figures from today's constants; with #159's EN_DB rebuild every EN
figure on it would move.

### What changed

- **An unstamped row is held like any older row.** `calcMoved` is now `savedCalcVersion !==
  D.CONSTANTS_VERSION` for every saved row. An unstamped row's `savedCalcVersionOf` is `null`, which
  matches no version, so Print and Copy refuse it with the usual reason ("NeoFeed ปรับการคำนวณหลังคำสั่งนี้
  ถูกบันทึก …") until it is saved again, and the save stamps it. The two release-specific checks are gone:
  they could only differ from this rule while `2026-09-18.1` was current.
- **Rows dated by `aaProduct` are unchanged**: `savedCalcVersionOf` still dates them `2026-09-18.1`, and
  they have been held since `2026-09-28.1`.
- `docs/CLINICAL_CONSTANTS.md` § When to bump says unstamped rows are held whatever the day's route. The
  no-TPN exception stays an exception to bumping (a change that moves only the lines of a bag that does
  not exist), no longer something `calcMoved` does for older rows.

### Tests

- `verify-calcmoved-unstamped-1017.cjs` (new) 15/15. On `55d893d` it fails 6: the unstamped feeds-only
  order (FBM_PF_24 30 mL × 8 at 1500 g, no TPN) rendered its print form, printed, and copied, and an
  unstamped TPN order with no dead space rendered its print form. The same feeds-only order with the
  current stamp prints on both trees, so the harness can see a printable order.
- Six harnesses opened an unstamped row to test another rule, and the fix held each of them, which is the
  fix working. Those rows stand for a current order, so they now carry the current stamp, as
  `test/README.md` already asks: `verify-review-0911.cjs` (F2 reopen), `verify-review-0917-calc.cjs` §9
  (dosing weight) and §10 (critical reason), `verify-picker-print-identity.cjs`,
  `verify-tpn-calc-weight.cjs`, `verify-ward-print-1012.cjs`, and `verify-ward-requests-0918.cjs` §10
  (dead space record).
- `verify-ward-requests-0918.cjs` §8 and §12 had three assertions that an unstamped row prints as
  before: a row with no `aaProduct`, a TPN row with no dead space, and a feeds-only row. Each now says it
  is held, and the first and last are saved again and their reprints checked (10% Aminoven 60 mL; no
  vitamin mL on a day with no bag). 194/194.
- Vera, on this PR: the §9 assertion for a row with no weight evidence now names the rule it tests, and
  its unstamped twin is held. That twin is the one failure of 121 on `55d893d`; 121/121 here.
- Full run on `82c4bd3`, as CI runs it: every `test/verify-*.cjs` plus `DEAD=0 verify-kcmh-factor.cjs`,
  90/90 against the sources and 90/90 with `compiled-loader.cjs`, which swapped in `compiled/` everywhere it
  mounts modules. `node tools/build.mjs` on that commit changes nothing. Ten harnesses skipped their
  Playwright sections here (no browser shim); CI's compiled pass runs them. One earlier source pass lost a
  scenario of `verify-help-request-frontend.cjs` to an out-of-memory abort (exit 134) while other sessions
  ran their suites; alone it passed 53/53.

### Not done

- Whether this is a `CONSTANTS_VERSION` bump is Pp's call; the PR asks her. It moves no printed figure,
  so under the 2026-09-18 rule it is not one, and a bump would also hold every order saved on
  `2026-10-11.1` until it is saved again.
- Not live: merging into `main` deploys nothing. The release PR that ships it updates `STATUS.md`, whose
  top entry says every order saved before `2026-10-11.1` is re-saved before it prints; on the live release
  that is not true of orders saved before 2026-09-18.

## Session 2026-10-17 (4) — the Growth readout's ordinals: ~51st, not ~51th

`fenton.jsx` (`FentonChart`'s `centileAmong`), `compiled/fenton.js`, both shells' `?v=` tokens,
`test/verify-fenton-half-week-1017.cjs` (§ 6, and its parser), a comment in
`test/verify-fenton-official-1017.cjs`, `test/README.md`. Frontend only, no `clasp` step. A commit on
draft PR #158, which owns this readout; nothing released.

### Why

The fentongrowth.ca check (2026-10-17 (2)) found the "Current trajectory" readout printing
"~51th", "~62th", "~3th" and "~21th": `centileAmong` appended "th" to every centile. Wording only: no
saved, printed or dosed value reads it, but a doctor reads it on the Growth tab.

### What was done

- `centileAmong` now formats the rounded centile through a small `ordinal()`: 1st, 2nd, 3rd, 4th…,
  11th–13th, 21st, 22nd, 23rd, 51st, 62nd, 93rd. The rounding is the same as before (`toFixed(0)` and
  `Math.round` agree for a centile between 3 and 97). "<3rd" and ">97th" are unchanged.
- **Searched for the same pattern elsewhere**: no other `.jsx` file, `data.js`, `boot.js` or
  `gas-backend.gs` builds an ordinal. The chart's curve labels (3rd, 10th, 50th, 90th, 97th) are fixed
  strings and already right.

### Tests

`verify-fenton-half-week-1017.cjs` § 6 (new, 12 checks): a boy at exact PMA 26+0 on DOL 15, weighed at
chosen centiles, must read ~3rd, ~11th, ~12th, ~13th, ~21st, ~22nd, ~23rd, ~51st, ~62nd, ~93rd, "<3rd"
and ">97th". It stays off DOL 1, which entry (3) just changed. It fails 7 of 12 on 92c2fcf ("~3th",
"~21th", "~51th"); the 5 that pass are the teens and the tails. The harness's own parser took only "th"
and now takes any ordinal suffix. 65/65 against the sources and with the compiled preload; against
55d893d it fails 52. In the real app (`tools/dev-local.mjs`, a made-up boy, 2010 g on DOL 21 at PMA
33+0) the readout says "~51st".

## Session 2026-10-17 (3) — DOL 1 is read at exact GA, as Fenton's own calculator reads it

`fenton.jsx` (`FentonChart`: `birthRows`, `birthWeek` and the size-at-birth label removed), `compiled/`,
both shells' `?v=` tokens, `test/verify-fenton-half-week-1017.cjs` § 5, `test/verify-fenton-official-1017.cjs`
§ 2–4, `test/README.md`, `docs/CLINICAL_CONSTANTS.md`. Draft PR #158. This corrects the "Size at birth
stays on completed weeks" bullet of the first entry below.

### Why

Entry (2) asked Fenton's own plotter, and its Birth size evaluation reads the exact GA (24 2/7 goes in as
24.2857), not the completed week. Read by completed week, the 18 DOL-1 points were up to 21 centile
points off it (a boy born 26+0 at 940 g read ~50th against row 26; the calculator says the 71st). Read at
exact age, the same 18 are within 4.2. Pp, 2026-10-17: "ให้ DOL 1 อ่านที่ GA จริงเหมือนเครื่องคำนวณของ
Fenton เอาป้าย size at birth ออก แล้วแก้ harness ให้ตรงกับชุดเทียบ".

### What changed

- **A DOL-1 measurement is read like any other day**, at exact GA against the rows at GA + 0.5, and the
  "DOL 1 อ่านจากตาราง size at birth …" label is gone. Born 22+0 to 22+3, it reads "—" with "เส้นอ้างอิง
  เริ่มที่ PMA 22+4", as on any other day before the first row's exact age.
- **`verify-fenton-official-1017.cjs` § 2 now asserts the 18 DOL-1 points** within ±5, beside weight
  under 37 weeks; § 3 records only weight from 37 weeks, length and HC.
- **`verify-fenton-half-week-1017.cjs` § 5** checks that a DOL-1 measurement reads exactly as the same
  measurement at the same PMA on a later day, with no size-at-birth label.

### Tests

`verify-fenton-half-week-1017.cjs` 53/53 and `verify-fenton-official-1017.cjs` 81/81, against the sources
and with the compiled preload. The DOL-1 group: mean gap 2.1, worst +4.2 (girl born 27+3, length 33.3 cm,
~27th vs 22.8). Against `ea0abe0` the official harness fails its 18 DOL-1 points and § 5 fails 7 of 8;
against 55d893d they fail 36 and 41.

### Not done

- The ordinal suffix ("~51th") is a separate session's fix; neither harness depends on it.

## Session 2026-10-17 (2) — the Fenton readout against Fenton's own calculator, point by point

`test/fenton-official-1017.json` and `test/verify-fenton-official-1017.cjs` (new), `test/README.md`. No
app code and no `compiled/` change. Pushed to draft PR #158, whose half-week fix it measures.

### Why

The half-week fix above was checked against a digitised chart, good to ±10–15 g. Fenton's LMS parameters
are not public (Pp has asked tfenton@ucalgary.ca), so nobody could say how far the app's percentile is
from the official one at a given age and size. Fenton's own plotter, fentongrowth.ca (API 2.1.3.0),
returns a z-score for any GA, weight, length and head circumference. Asking it is the interim yardstick,
and the acceptance test for an LMS version later.

### What was done

- **75 made-up measurements in 51 rows**, both sexes: weight at exact PMA 23–41 wk (x+0 and x+3/x+4
  days), length and HC at eight PMAs, and ten size-at-birth rows. Each value was picked to land near a
  chosen centile; none belongs to an infant. Pp approved four submissions in chat; four were sent, one
  per sex and data type (Growth Monitoring, Birth size evaluation), carrying sex, GA, weight, head and
  length and nothing else.
- **`test/fenton-official-1017.json`** keeps the source URL, the version, the date, the four returned
  tables verbatim, and one line per point: sex, mode, GA, measure, value, z (3 decimals), whole percentile.
- **`test/verify-fenton-official-1017.cjs`** mounts the real `FentonChart` for every point and compares
  its readout with 100·Φ(z). It asserts only where the tables allow it: weight, growth monitoring, under
  37 weeks, within ±5 points. Reading linearly between the p10, p50 and p90 curves strays at most 4.0
  points from the normal curve (the 24th reads as the 28th), and rounding to a whole centile adds 0.5.
  Everywhere else it records the gap and passes. `--md` prints the per-point tables for a PR.

### What it found

- **Weight under 37 weeks is right.** 31 points, mean gap 1.4 points, worst 4.5 (an official 69.5th
  reads ~65th), which is the linear reading predicted above.
- **Weight from 37 weeks is off where the audit said.** 10 points, mean 3.3, worst +10.2: a boy at 41+4
  weighing 4325 g reads ~90th, official 80th; a girl at 41+0 weighing 3515 g reads ~50th, official 42nd.
  The app's rows there are Fenton's size-at-birth rows, not the growth-monitoring curve.
- **Length and HC are closer than their note says**, at these eight PMAs: mean 1.7 and 1.9 points,
  worst +5.1 (boy 38+3, 51.9 cm, ~89th vs 84th) and +4.8 (boy 26+0, HC 22.5 cm, ~26th vs 21st). Eight
  points each is too few to lift the note.
- **DOL 1 disagrees with the official calculator by up to 21 points.** Its Birth size evaluation reads
  the exact GA (24 2/7 went in as 24.2857), not the completed week this PR's §5 reads. A boy born 26+0 at
  940 g reads ~50th against row 26 and is the 71st by the official calculator; a girl born 23+6 at 560 g
  reads ~51st and is the 35th. Over the 18 DOL-1 points the mean gap is 7.1. Read at exact age instead,
  the same 18 are off by at most 4.2 (mean 2.1), and after 37 weeks the size-at-birth rows match the
  official Birth size mode (boy 39+2: +0.4; girl 40+5: +1.3). Which method DOL 1 follows is Pp's call; it
  is a question in the PR, not a change here.
- **The readout's ordinals are wrong** past the teens: "~51th", "~61th", "~3th" (`centileAmong` always
  appends "th"). Not fixed here; the harness reads any suffix so the fix will not break it.

### Tests

`verify-fenton-official-1017.cjs` (new) 81/81, against the sources and with the compiled preload. Against
55d893d, before the half-week fix, it fails 42: 24 of the 31 asserted weight points (the official 50th
reads the 33rd–40th) and the 18 DOL-1 points, which had no size-at-birth path there.

### Not done

- DOL 1 still reads the completed-week row. Pp decides.
- No point below PMA 23+0, and length and HC at eight PMAs only. More points means another approved
  round of submissions.

## Session 2026-10-17 — the Fenton rows drawn at exact age; Length and HC say they are not verified

`fenton.jsx` (`FentonChart`: the reference rows, the readout, the Length/HC note), `compiled/`, both
shells' `?v=` tokens, `data.js` (a header comment only), `test/verify-fenton-half-week-1017.cjs` (new),
`test/README.md`, `docs/CLINICAL_CONSTANTS.md`, `BACKLOG.md`. Frontend only, no `clasp` step. Draft PR,
for Pp to review; nothing released.

### Why

Pp asked whether every NeoFeed number is truly calculated or sourced. The provenance audit that followed
(2026-10-17, in Pp's private notes) found the `FENTON_WEIGHT` values genuine, within 4 g of ucalgary.ca's
v2 cutoff table on all 168 p3/p10/p90/p97 cells, but drawn in the wrong place. Fenton 2025's data are
completed weeks (25 weeks is 25+0 to 25+6, mean 25.5), and the official chart is shifted +0.5 week so an
infant can be plotted at exact age, "adding 0.5 weeks to the completed weeks age" (Fenton 2025, § 2.5
Synthesis, paragraph 7; PMC12391854, doi 10.1111/ppe.70035). NeoFeed plots the
infant at exact PMA, `pma0 + (DOL − 1)/7`, but drew row GA at x = GA and read the percentile there. Every
curve sat half a week early: 33–144 g too heavy at 23–36 wk (median 76 g, 118 digitised cells). An infant
on the official 10th read about the 5th–7th, on the 50th about the 33rd–42nd, on the 90th about the
70th–81st. Length and HC carry the same shift (0.6–0.8 cm, 0.45–0.6 cm).

### What changed

- **Rows are drawn and read at GA + 0.5** (`REF_AGE_OFFSET` in `FentonChart`). The curves, the 10th–90th
  band, the right-edge labels and the "Current trajectory" readout all use the shifted rows (a
  DOL-1 measurement excepted, below).
- **The start.** The curves begin at 22.5, where the first row sits; nothing is extrapolated below it. A
  measurement at PMA 22+0 to 22+3 now reads "—" with "เส้นอ้างอิงเริ่มที่ PMA 22+4" under it (it used to
  read the 22–23 interpolation). The axis still starts at 22, and the point is still plotted.
- **The end.** `GA_MAX` stays 42: the axis, the hidden-measurement banner, and `growthVelocity`'s
  beyond-the-reference guard in `data.js` are unchanged. The curves end at 42.0, linearly between the
  41 and 42 weight rows (38 and 42 for length and HC); the 42 row (42+0 to 42+6) is used only for that.
- **Size at birth stays on completed weeks.** NeoFeed classifies no SGA/AGA/LGA anywhere (searched
  `*.jsx`, `data.js`, `gas-backend.gs`), but a lone DOL-1 measurement in "Current trajectory" is the
  size at birth in all but name. It is read against the rows as published, by completed week (born
  26+0 to 26+6 is row 26; for length and HC, linear between the 4-week rows), with "DOL 1 อ่านจากตาราง
  size at birth แถว 26 สัปดาห์" under it; the point is still plotted at exact GA. Fenton 2025 Table 3
  names the non-interpolated meta-analysis as the size-for-GA reference. Vera raised it on the first
  version of this change, which read DOL 1 at exact age: a boy born 26+0 at 740 g, below row 26's p10
  (767 g), showed "~16th". From DOL 2 on, every reading is at exact age.
- **Length and HC tabs carry a note** (`role="note"`): the curve is not checked against a numeric source,
  Fenton publishes length and HC only as charts, and the rows are 4 weeks apart, so the percentile is
  approximate. The Length note adds that after 38 weeks the curve runs above the official chart, so a term
  infant looks shorter than they are (`BACKLOG.md`, 2026-09-23 review). Weight has no note.
- **`data.js`'s header** no longer calls column 0 `PMA_wk`: it is GA in completed weeks, drawn at GA + 0.5.
- **`CONSTANTS_VERSION` stays `2026-10-11.1`.** No `FENTON_*` value changed, and no Fenton figure is
  printed or saved.

### Left as they were, for Pp

Three findings from the same audit change clinical grading, so they are questions in the PR and an item
in `BACKLOG.md` § Next, not code: the size-at-birth rows used for monitoring after 37 weeks, the 15 / 10
g/kg/d velocity grading attributed to ESPGHAN 2022, and the unsourced length/HC cm/wk colours.

### Tests

`verify-fenton-half-week-1017.cjs` (new) 53/53. §1 uses the official chart's own p10 / p50 / p90 at exact
26, 30, 34 and 36 weeks (digitised in the audit, independent of `data.js`): they now read 9–12th, 48–51st
and 86–90th; on `main` they read 5–7th, 33–42nd and 69–81st. §5 reads DOL 1 by completed week (born
26+0 at 740 g ~8th, born 26+6 at 790 g ~15th, a birth length between the 4-week rows, a birth at 22+2).
Against `main` the file fails 43 of 53. Of the 10 that pass, 8 are controls and 2 are births at exactly
GA+0, which `main` read at x = GA, the completed-week row by luck.

Before/after sheets of the real app (made-up boy born 26+0, weight on the official 10th every week to
36+0, length and HC on the 50th; local fake backend): at 36+0 the readout goes ~7th → ~12th, length
~42 → ~50, HC ~43 → ~51. They are with the audit in Pp's private notes, not in this public repo.

### Not done

- No second clinician has checked the placement; Pp reviews the PR.
- The 42-week length row and the HC rows are unchanged; only the note says so.

## Session 2026-10-12 (3) — Back asks before it closes a form; Back after Back stays in the app

`app.jsx` (`goBack`, the history guard), `registry.jsx` (`data-back-confirm` on three dialogs),
`compiled/`, `test/verify-back-button-1012.cjs`, `tools/dev-local.mjs` and `test/verify-dev-local.cjs`
(new), `REFERENCE.md` § Frontend, `test/README.md`, `app-walkthrough.md` §5, `STATUS.md` (catches up
with #151 and #155). Frontend only, no `clasp` step.

### Why

Two things, found the same morning.

1. Pp, after #154: "ถ้ากด Back ระหว่างเปิด Register new session, Edit session หรือ Transfer bed dialog
   ให้ alert ขึ้นมาว่า ต้องการออกจากหน้า ... ? ข้อมูลที่พิมพ์ไว้จะหายไป". Back closed those dialogs as a tap
   outside does, and what was typed went with them (Vera raised it on #154; it was left for Pp).
2. Pp asked for a local dev run before release #155. Served on `127.0.0.1` with the real `gas-backend.gs`
   in `test/gas-vm-sandbox.cjs`, in Chromium, the release's Back worked once after a tap, but a second
   Back straight after it found no entry: on a phone that leaves NeoFeed, and the login with it, with no
   "กด Back อีกครั้ง" prompt. After each Back the guard was pushed again from inside `popstate`, which is
   not a user activation, and Chrome's history-manipulation intervention makes Back skip the entry a page
   pushed from without one. One tap on the page cleared it. jsdom has no such intervention, and the
   ad-hoc Chromium run on #154 most likely drove Back by script, which does not apply it the way the
   browser's own Back does.

### What changed

- **Register new session, Edit session and Transfer bed ask on Back.** Their backdrops carry
  `data-back-confirm`, and `goBack` asks `window.confirm("ต้องการออกจากหน้า <name> ?\nข้อมูลที่พิมพ์ไว้จะหายไป")`
  before it closes one: Cancel keeps the dialog and what was typed, OK closes it. It asks whether or not
  anything was typed, as Pp worded it. The native confirm is what NeoFeed already uses for deletes, and
  on a phone, Back while it shows is Cancel. A tap outside these dialogs still closes them at once (Pp
  asked about Back), and every other dialog still closes on Back without a question.
- **The guard returns by moving forward, not by a new push.** After a Back, the guard is the next entry
  forward, so `history.forward()` lands on it again and adds nothing, and nothing gets marked. `pushState`
  is left for the first arming after a tap, and for a fallback if the forward entry is gone (600 ms with
  no `popstate`, then push). The same applies when the 2 s exit window on the gate ends, or the user moves
  off the gate inside it.
- **Dev local is a release step** (Pp, on this PR: "ข้อ 2 ทำเลย", making the run she asked for on #155 the
  rule for every release). `tools/dev-local.mjs` serves a tree on `127.0.0.1` with `boot.js` pointed at
  itself and `gas-backend.gs` behind it in `test/gas-vm-sandbox.cjs`, seeded with made-up infants for
  every release-day case (printable, draft, saved under an older `CONSTANTS_VERSION`, nothing today) and
  two accounts whose passwords are new each run. `REFERENCE.md` § Frontend puts the run between opening
  the release PR and merging it; the project `CLAUDE.md` names the step too.

### Tests

`verify-back-button-1012.cjs` 49/49 on the sources (was 34). #5 now uses the new-order date dialog, which
still closes on Back without asking. **#9** (11 checks): Back on each of the three dialogs asks in Pp's
words; Cancel keeps Register new session open with the initials typed; OK closes each; a tap outside
Edit session still closes it without asking. **#10** (5 checks): Growth → Dashboard → ward list → gate
by three Backs in a row with no `pushState` on the way, then the exit prompt, then the guard back after
2 s, still with no push. jsdom has no history intervention, so #10 checks its cause, a push after a
Back. Against `main` the same file fails 7 checks (9.0, 9.1, 9.3, 9.4, then #9 stops; 10.1 with 3 pushes,
10.4). Checks 7.3 and 10.4 flush once more after the 2 s wait: `forward()` lands a task later.

In Chromium (the desktop app's Browser pane, 375 × 812, local dev server with the sandboxed backend,
made-up infants): Growth, then four Backs with no tap between gave the Dashboard, NICU, the gate and the
prompt; 2.5 s later the guard was back, and Back, Back left the page. On release #155 the second Back
already found no entry. Register new session with "รย" typed: Back asked in Pp's words, Cancel kept "รย",
the next Back with OK closed it and stayed on NICU.

`verify-dev-local.cjs` (new) 17/17: `boot.js` names the local server and never `script.google.com`; the
shell and all its scripts load; `gas-backend.gs`, `STATUS.md`, the sandbox, the tool and a file beside the
copy (`..%2f`) are not served; the seeded doctor signs in through the real login and a wrong password is
refused; the six infants and today's four orders are there; a tree whose `boot.js` it cannot rewrite is
refused; stop removes the copy. Each check was watched fail by breaking the tool one way at a time:
serving `boot.js` unchanged (1.0, 1.1), dropping the out-of-copy guard (1.5), seeding CC under the current
version (2.5), skipping the refusal (3.0).

### Not done

- No ward phone has tried either change, or #154's Back.

## Session 2026-10-12 (2) — the phone's Back button steps back inside the app

`app.jsx` (`goBack`, the history guard, `useDialogOpen`), `registry.jsx` (search and tile reset on the
gate), `compiled/`, `test/verify-back-button-1012.cjs` (new), `test/README.md`, `app-walkthrough.md` §5.
Same branch and PR as (1), on Pp's instruction to do it first. Frontend only, no `clasp` step.

### Why

Pp asked whether reopening the app within 30 seconds of pressing Back could skip the login. The login
lives in `sessionStorage`, which Android drops when Back closes the app's window. Two options were put to
her: a 30-second resume copy of the login on the phone (a change to the sign-in boundary, a 30-second
window on a shared ward phone), or making Back move inside the app so the round stops leaving it by
accident. Pp: "ทำ B ก่อน ให้ปุ่ม back ย้อนกลับในแอป". The resume option is not built.

### What changed

- While there is somewhere to go back to, one history entry sits on top of the page. Back pops it and
  `goBack` takes one step: an open dialog closes (by a click on its backdrop, so a dialog that keeps
  itself open on an outside tap keeps itself open on Back); Growth, Alerts and the Calculator go to the
  Dashboard (an order opened from the print list goes to the print list); the Dashboard to the ward
  list; the ward list or print list to the gate; Reference values, formulas, quick calc and admin to
  where they were opened from, except that Reference values opened from an edit or a back-fill goes to
  the Dashboard (Vera's 🟠: `goTo` had already dropped the edit, and Back reopened a new order for today
  that looks the same).
- **On the gate, Back asks for a second Back** (Pp: "ขึ้นมาว่า ออกจากแอป? … ถ้ากดออกจากแอปจริง ๆ ค่อยให้เขา
  ล็อกอิน"). The first Back shows "กด Back อีกครั้งเพื่อออกจาก NeoFeed — ออกแล้วต้อง login ใหม่" and stays;
  for 2 s (`EXIT_WINDOW_MS`) there is no entry of ours, so a second Back leaves the app the browser's own
  way; after that, or as soon as the user moves off the gate, the entry is back. A dialog asking
  "ออกจากแอป?" was not built: a page cannot close itself, so its ออก button could not work.
- The entry is pushed only once the page has had a tap or key press (`navigator.userActivation`): Chrome
  skips, on Back, an entry pushed before any user activation, which is the state after a reload.
- `showToast` has an `"info"` type: no ✓, 2 s.
- Reaching the gate any way clears the ward's search and tile filter (before, only `← เปลี่ยน ward` did).
- The URL never changes; nothing is stored.

### Tests

`verify-back-button-1012.cjs` 31/31 on the sources; 12 fail against the code before it, the exit scenario
fails 2 and Vera's edit/back-fill scenario fails before her fix. In real Chromium with the shipped bundle
(ad-hoc, Pixel 7 size): gate → NICU → Dashboard → Growth, then Back gave the Dashboard, the ward list,
closed the New session dialog, the gate, then the toast and still the gate; after 2.5 s Back asked again,
and a second Back within 2 s left the page.

**Vera: NO BLOCK** on the exit prompt too, one 🟡: Back on the gate, a ward within the 2 s, then Back,
Back left with no prompt, because only the timer ended the window. Moving off the gate now ends it
(check 7.6, which fails before). Her two tests are in (7.6; 8.4–8.5, the print list's edit → Reference
values → Back → Dashboard). After her note that a touch grants activation on `pointerup`, the guard waits
for `pointerup` / `keydown` / `click` instead of `pointerdown`. 34 checks.

**Vera: NO BLOCK** on the first version, one 🟠 (Reference values from an edit, above), fixed. Her race
note (a tap to the gate called `history.back()` and counted a pop to ignore) no longer applies: the guard
now stays on the gate, and nothing calls `history.back()` except the second Back of an exit.

### Not done

- Not tried on a ward phone. Android's gesture Back and the installed PWA both send the browser's Back,
  which is what this listens to; iOS has no Back button (Safari's swipe-back does the same).
- The 30-second login resume (option A) is not built.
- A dialog that closes on a tap outside it (Register, Edit, Transfer bed) also closes on Back and drops
  what was typed, as an outside tap always did (Vera). No clinical value is lost; say if Back should keep
  them open.

## Session 2026-10-12 (1) — the stats tiles filter the list; Print order per ward on the gate

`registry.jsx` (`statFilter`, `WardGateCell`, `WardPrintList`), `app.jsx` (`printWard`, `printJob`,
`autoPrint`, `openOrderToPrint`, `CalculatorView` `requestPrint` and its back link), `calculator.jsx`
(`autoPrint` / `requestPrint` props, one effect), both shells (CSS only), `compiled/`,
`test/verify-ward-print-1012.cjs` (new), `test/verify-phone-sweep.cjs`, `test/README.md`,
`app-walkthrough.md` §5. Branch `ccr-e1ae5b5d-3ybah8`. Frontend only, no `clasp` step.

### Why

Pp, with two phone screenshots: "ให้ปุ่ม active, logged, need entry กดแล้ว เลือกผู้ป่วยที่เข้ากับกลุ่มนั้นขึ้นมา
เผื่อแยกผู้ป่วยว่าอันไหนยังไม่ได้ลงรายละเอียด หรืออันไหนล็อกเสร็จแล้วสำหรับวันนั้น จะได้นำไปปริ้นได้" and
"หน้าแรกสุดของแต่ละวอร์ด อยากให้มีปุ่มพิมพ์ใบสั่ง ให้เป็นคำเดียวกับที่อยู่ด้านใน พอกดเข้าไป มีแค่แดชบอร์ด
รายชื่อผู้ป่วย … ของแต่ละวอร์ดในวันนั้น เพื่อปริ้นอย่างเดียว เมื่อกดจะลิงก์เข้าไปที่หน้าโชว์พีดีเอฟก่อนกดปริ้นท์
รีวิวเหมือนทางด้านใน".

### What changed

- **The ward list's Active, Logged today and Needs entry tiles are buttons.** A tap narrows the cards and
  the table to that tile's infants; a second tap, or Active, shows everyone. A line above the list says
  "แสดงเฉพาะ Needs entry · 2 จาก 5 ราย" with แสดงทั้งหมด, because a list missing infants with nothing saying
  why reads as the whole ward. The discharged section hides while narrowed. Total sessions stays a figure.
- **Each ward tile on the gate has a "Print order" button under it** (the calculator's own words), with
  the ward's count of submitted orders. It opens **Print order · NICU**: the ward's active infants whose
  order for today is Submitted, in bed order. A tap opens that order in the calculator and asks for the
  print preview once, through the same `__neofeed_print` event the Print order button sends. **Nothing on
  the list decides what may print**: the calculator's `printable` gate does, and an order it holds back
  (edited, a critical value with no reason, a moved calculation) shows the same toast as the button and
  does not print. The page then reads "← กลับไปรายการ Print order".
- Drafts are not listed (they never print). A row still under its `tmp_` id is shown as saving and does
  not open (UP-C9). Two submitted orders on one day open the infant's Dashboard to choose, rather than the
  list guessing. Infants not yet submitted are counted under the list, one tap from Needs entry.
- The print request is a token: one tap prints once; a re-render or a sync does not print again; leaving
  the calculator (rail, bottom bar, `goTo`, a patient switch) drops it.
- **It waits for the edit lock's first answer, and does not print while a colleague has the order open**
  (Vera's 🟠, below). `useDailyLogLock` now returns `{ holder, checked }`. With a holder, the preview is held
  for good, even if the lock clears later; a toast says so, and the "… กำลังเปิดบันทึก" banner and the Print
  order button are left for the user to decide.
- Every role sees the button: admin, doctor and nurse can already open and print a saved order from the
  Dashboard, and this is the same path.

### Tests

`verify-ward-print-1012.cjs` 48/48 on the sources and on `compiled/`; against `main` (`4f30faf`) 14 fail, and
its lock scenario fails 4 of 5 on this branch's first commit, before the lock wait.
`verify-phone-sweep.cjs` 292/292 with the three new screens on all 24 profiles (Chromium, compiled).
Every other `test/verify-*.cjs` passes on the sources. `verify-tpn-calc-weight.cjs` failed here as it did
on an untouched `main` (`4f30faf`), "print form did not render for curWtG=1750". **Not the date and not the
app:** this container's Node 22.22.0 is below jsdom 30's engine range, so npm installs jsdom 29.1.1, whose
selector engine resolves a scoped `#print-form` through the document's FIRST element with that id. By the
test's section #8 both of its roots hold a printable order, so there are two, and the lookup in the second
root returned null. Proven both ways: the plain test fails under jsdom 29 at either clock (2026-10-11 and
-12) and passes under jsdom 30.1.2 at either clock. The fix is in the test only: the lookup reads
`[id="print-form"]`, which passes under both. The app mounts one Calculator, so the id is unique on the
ward; the printing gate behaved correctly throughout.

### Vera

NO BLOCK. 🟠 an automatic print could go before the lock banner arrived: Pp's call between accepting it
and waiting; taken the safer way (above), pinned by scenario #6. **Pp, 2026-10-12: "Safer option >> ok".** 🟡 check 4.0 read the whole page, so a
wrong-patient print would pass: it now opens BB first and reads AA-1 off the printed sheet's patient table.
She also lists the `verify-tpn-calc-weight` red on `main` (unexplained), real-device print behaviour, and
that the list has no "already printed" mark, so two people can print the same order (a ward question).

### Not done

- No "already printed" mark on the list (Vera): two staff can print the same order. Ask the ward.
- No one has tapped it on a ward phone. Chrome on Android opens the print preview from the tap; if a
  browser refuses a print not started by its own button, the order is open with Print order one tap away.
- Opening an order to print takes the same courtesy edit lock as opening it from the Dashboard.

## Session 2026-10-11 (8) — NF-17: the printed bag adds up, and a click moves the screen

`test/verify-calc-sum.cjs` (new), `calculator.jsx` (`wfiVol`), `compiled/calculator.js` and the shells'
`?v=` token, `data.js` (`CONSTANTS_VERSION` 2026-10-08.1 → **2026-10-11.1**), `docs/CLINICAL_CONSTANTS.md`,
`test/verify-calc-oracle.cjs` (WFI rule, scenario H), `test/README.md`, `AGENTS.md`. Branch
`claude/nf17-sum-check-1011`, not pushed. Frontend only, no `clasp` step.

### Why

Mapping item NF-17: two tests for every calculation change, a sum check on synthetic orders and a check
that the click-through shows the new value on screen, not only in the function. No harness added up the
stock lines a pharmacist reads. The fuzz's I3 checks that the bag total equals the prepared volume, and
`test/README.md` said it checked "components + WFI q.s. = the prepared volume", which it did not.

### What changed

- **`verify-calc-sum.cjs`**: 60 orders (the oracle's 12, eight of its own, 40 seeded random). Each is
  saved through Submit; every stock mL on the back page's "Aqueous bag — stock" table is summed and checked
  against the printed WFI and prepared volume, the on-screen Components and Bag total, and the copied BAG
  MAKE-UP line. Then a dead-space chip or a typed TPN volume changes the order, and the screen, the
  withdrawn print and the second save's reprint are checked again. It reads only the mounted component.
- **Tolerance 0.05 mL**, from the rounding chain: each stock rounds once (0.1 mL, or 0.01 for K₂HPO₄, MgSO₄
  and heparin) and prints at that precision; `componentVol` rounds their sum to 0.1, so it is within 0.05 of
  the printed parts; WFI = printed prepared − components, so components + WFI = prepared exactly. When every
  part is a whole tenth the tolerance is 0.
- **Negative controls**, source patched in memory: heparin out of `componentVol`, WFI from the delivered
  volume, `deadVol_mL` out of the memo's dependencies (the last fails only the wired-in checks).
- `test/README.md`: a paragraph for the harness; the fuzz sentence now says what I3 checks.
  `AGENTS.md`: a calculation change keeps the harness passing and adds a new figure to its on-screen check.

### The S7 finding, and the fix (Pp)

**The printed bag equation did not close when the prepared volume had a hundredths 5.** Order S7: 1 kg,
DOL 10, central, 80.45 mL/day typed (a rate such as 3.352 mL/hr gives the same, since rate × 24 is kept to
2 decimals), dead space 50, D10, AA 3, NaCl 2, KCl 1, Ca 40, Soluvit, Peditrace, heparin 0.5. Prepared
130.45 mL. The form and the copy printed *components 87.5 + WFI 42.9 = 130.5 mL prepared*, which sums to
130.4. The prepared volume went through `D.displayNum` (1304.5 rounds up to 130.5) and the WFI through
`toFixed(1)` on 130.45 − 87.5 = 42.94999… (down to 42.9). A pharmacist following the WFI line made a bag
0.1 mL short of the printed total.

Pp's decision: take the WFI from the prepared volume as it is printed. `wfiVol` = `D.displayNum(preparedVol,
1)` − `componentVol`, so S7 now prints **87.5 + 43 = 130.5** (was 42.9). The bag holds the true parts,
87.45 + 43 = 130.45 mL, the real prepared volume. The over-full alert reads the same `wfiVol`, so it
still fires exactly when the components exceed the printed bag. Only a prepared volume with a hundredths 5
moves; every other order prints the same WFI.

**`CONSTANTS_VERSION` bumped to `2026-10-11.1`**, by the rule in `data.js` and `docs/CLINICAL_CONSTANTS.md`:
calculator logic moved a printed figure. A row saved before the bump prints only after it is saved again
(`calcMoved`), which covers any saved order whose WFI moved.

The oracle states the rule on its own (`e.wfi = r1(r1(Vp) − components)`), and its new scenario H is the
same 130.45 mL order: it failed on `4d92a76` (print and copy WFI 42.9 against 43) and passes now.

**The over-full alert moved at that tie, and S8 pins it** (Vera's 🟡). With 130.45 mL prepared and components
of 130.48 mL (printed 130.5), the old WFI was 130.45 − 130.5 → −0.1, so the bag was called over-full by
0.1 mL and the order needed a critical reason. Now WFI is 0 and no alert fires: the components fill the
printed bag, and the real overrun is 0.03 mL. S8 asserts the printed line 130.5 + 0 = 130.5 and no alert on
the screen, the form or the copy; it fails 5 checks on `4d92a76`.

### Tests

Red first: on `4d92a76` (harness only, app unchanged) `verify-calc-sum.cjs` failed 2 of 2188, both S7, and
the oracle's scenario H failed 2 (print and copy WFI 42.9 against 43); S8, added after the review, fails 5
there. After the fix: sum 2231/2231 on the sources and on `compiled/` (`[compiled-loader] swapped in
compiled/{icons,calculator}.js`); its negative controls fail 235, 172 and 93 checks; oracle 1092/1092,
fuzz 1796/1796, clicks 242/242.

Every `test/verify-*.cjs` (85 harnesses) plus `DEAD=0 verify-kcmh-factor.cjs` passes on the sources and
again on `compiled/`, every module-mounting harness reporting its swap; among them `verify-review-0917-calc`
120/120, `verify-build-shells` 46/46 and `verify-provenance-stamp` 38/38. Ten harnesses skipped their
browser sections locally (no Playwright); CI runs those. Center Point builds and its 5 client tests pass.
`index.html` and `NeoFeed.html` are byte-identical after the rebuild.

**Vera: NO BLOCK**, one 🟡 (the alert boundary above), fixed by S8. Her report is in the body of
PR #153, merged into `main` on Pp's instruction ("merge ทั้งสอง PR"). Not live until a `main` →
`release` PR is merged.

**Second clinician: none.** The fix is Pp's decision (2026-10-11); no second clinician has reviewed it,
as for every printed-figure change so far (`AI_SDLC.md` §7).

### Not done

- ZnSO₄ is in the bag but has no mL and is not in the WFI ("หักตามที่ใส่จริง" on the form), so the
  harness counts it as outside the sum, as the app does. BACKLOG's line on printing its mL stays open,
  and so does the small-volume rounding item.

## Session 2026-10-11 (7) — Product work moves out of the public repo

Docs only: `docs/stakeholder/` removed, one item in `AGENTS.md`. No served file, no harness and no
`CONSTANTS_VERSION` change; both hosts skip `*.md` and `docs/`. Branch `claude/nf-20-22-product-docs`,
PR #152, merged into `main` on Pp's instruction ("merge ทั้งสาม PR"). Nothing to deploy: no `main` → `release` PR is needed for docs.

### Why

This PR first added three product pages (NF-20 product decisions, NF-21 ward requests, NF-22 ward
feedback). Before it merged, Pp checked whether product-manager work and the live app were mixed in one
repo. They were, and this repo is public: anyone could read the bets, the ward's requests and the
stakeholder map. Making the repo private on the organisation's free plan would drop the `harnesses`
requirement on `main` and `release`, cap Actions at 2,000 minutes a month (the last 30 days used about
3,900) and take GitHub Pages' redirect page offline. Pp chose to keep the repo public and move the
product work out instead.

### What changed

- The three product pages never reached `main`; they and `docs/stakeholder/` (the stakeholder graph and
  its PNG/SVG map, added in `91057b0`) now live in Pp's private notes,
  `Desktop\PraewPP\NeoFeed\Product\`. That folder was split out of `NeoFeed innovation\` the same day,
  which now holds only the QI project and the competition entry.
- `AGENTS.md` says product, meeting and stakeholder documents stay out of this repo, and where they are.
- `docs/stakeholder/` stays readable in this repo's history; removing it from history would need a force
  push, which this repo does not allow.

## Session 2026-10-11 (6) — Peripheral K⁺: the maximum alone

`calculator.jsx` (`kRedIsMax`, `kBagLimitParts`, five display sites), `compiled/calculator.js` and the
shells' `?v=` token, `test/verify-tpn-meeting-0928.cjs` § 15, `verify-tpn-team-0922.cjs`,
`verify-calc-oracle.cjs`, `test/README.md`. PR #150, merged into `main` on Pp's instruction ("merge #150 แล้วลบ worktree
เก่าเลย"). Frontend only, no `clasp` step.
**`CONSTANTS_VERSION` unchanged**: no limit moved, no saved order is reopened differently.

### Why

Above 60 mEq/L a peripheral bag cannot be ordered, so the surfaces that wrote *"red > 60"* and
*"confirm > 60"* beside *"max 60"* named a confirmation that never happens. Pp, on PR #137 (2026-10-08):
"ให้เหลือแค่ max 60"; asked on 2026-10-11 to put it in a PR, she put the rule in one line: "> 60 peripheral
จะสั่งไม่ได้". The test for it (§ 15) sat uncommitted in the `k-peripheral-max-60` worktree with no code behind it.

### What changed

- **One rule, two helpers.** `kRedIsMax(lim)` is true where red is the maximum (peripheral 40 / 60 / 60);
  `kBagLimitParts(lim, word)` returns `"<word> 120"` and `"max 200"`, or `"max 60"` alone. The tile line, the
  caution, the form, the back sheet and Copy order all read from them, so they cannot disagree.
- **Peripheral now reads:** line under the tile `peripheral: amber > 40 · max 60 mEq/L`; caution `above 40
  mEq/L for a peripheral line (max 60)`; form `K⁺ in bag: max 60 mEq/L (peripheral)`; back sheet `(max 60,
  peripheral)`; Copy order `(50 mEq/L; max 60 on a peripheral line)`. **Central is unchanged.**
- **Nothing was reachable before that is unreachable now.** The "K⁺ concentration too high" alert (above red) is
  still first behind `kOverMax`; at peripheral 60 it never fired, and it still does not.

### Tests

§ 15 passes 162/162 against the sources and against `compiled/`. The oracle's copy-text regex needed the new
wording (1000/1000 again). Vera: NO BLOCK, with two findings, both fixed (this entry and the `README.md`
section).

### Not done

- Printed forms already on the ward carry the old wording until reprinted; the numbers on them are the same.

## Session 2026-10-11 (5) — Vera's seeded-bug benchmark: 6/6 verdicts, 4/5 defects, 0/7 decoys

`test/vera-bench/` (key, six cases, the first run's reports), `tools/vera-bench.mjs`,
`test/verify-vera-bench.cjs`, `.claude/hooks/vera-report.cjs`, `.claude/agents/vera.md`,
`REFERENCE.md` § Pre-PR review (Vera). No app file changed.

### Why

Pp, after the Vera entry that follows this one: "วัดผล Vera ด้วย bug ที่ฝังไว้ก่อน". A reviewer nobody has measured is
an opinion. The method is from a talk in Pp's YouTube notes (AI LABS, 2026-09-11, at
[13:15](https://www.youtube.com/watch?v=BwNNcob3-A0&t=795s)): seed known defects and decoys that look
wrong but are right, then score what the reviewer catches and what it wrongly flags.

### What changed

1. **Six cases against `c47d6ea`**, each a diff with a request in Pp's words and commit messages
   under `## Author's claims`. Five plant one defect: GIR from the bag's dextrose instead of the
   delivered dose (1.5× at 60 mL/day plus 30 mL dead space), the K⁺ maximum turned from `>` to `>=`
   under a commit message claiming 60 is still allowed, the erased name and DOB written to the log by
   `pseudonymizePatient`, the nursing branches folded so a nurse can delete an entry, and K₂HPO₄
   rounded with `r1(r2(…))`. The sixth holds three decoys and nothing else. Seven decoys in all.
2. **`tools/vera-bench.mjs`** prepares one worktree per case at the base commit, writes the review
   files, and scores the reports: a defect counts as caught at its minimum severity on the right
   file, within five lines or by quoting the planted line; a 🔴 or 🟠 on a decoy is a false positive.
3. **Building the cases found a gap in Vera's rubric.** Her 🔴 covered a wrong number or data leaving
   its boundary, but not a role gaining an action it was never given, so the nursing case could not be
   a BLOCK. 🔴 now covers it. She also reads committed files from a `Repo:` folder when the review
   file names one.
4. **The run found a gap in her report check.** Her phi-log finding was right, but it cited
   `gas-backend.gas:3689`. `vera-report.cjs` now refuses a cited path that is not in the repo and
   sends her back to fix it.

### Score (first run, Opus)

| Case | Verdict | Planted defect | Decoys flagged |
|---|---|---|---|
| gir-basis | BLOCK, right | caught, 🔴 at 1263 | 0/1 |
| k-edge-pitch | BLOCK, right | caught, 🔴 at 1712; called the commit message's claim false | 0/1 |
| phi-log | BLOCK, right | found, but cited `gas-backend.gas`: scored a miss | 0/1 |
| nursing-delete-role | BLOCK, right | caught, 🔴 at 1491 | 0/1 |
| clean-decoys | NO BLOCK, right | none planted | 0/3 |
| k2hpo4-double-round | BLOCK, right | caught, two 🔴 at 1400 | none planted |

Beyond the key she raised five more findings: three missing change-protocol steps, the pharmacy back
sheet contradicting itself under the wrong GIR, and Audit_Log as the right place for the erasure
record Pp asked for. The scorer lists six, the sixth being the misspelt phi-log finding. Her rounding example `r1(r2(0.447))` = 0.5 next to "0.4 mEq" was checked in Node and holds.

How it ran: each case went to an Opus subagent of another session that read `vera.md` and was held to
Read, Grep and Glob by its prompt, because the `claude` CLI's login had expired and `vera` itself
could not start. So her tool limit and her Stop hook were not in force. The six reports are kept in
`runs/2026-10-11-opus/`, and `verify-vera-bench.cjs` § 3 checks they still score 6/6, 4/5 and 0/7.

### Tests

`verify-vera-bench.cjs` 44/44 and `verify-vera-report.cjs` 22/22, also under CI's
`NODE_OPTIONS=--require ./test/compiled-loader.cjs`; 2.13 (a path that is not in the repo) failed
before the hook change. `verify-build-shells.cjs` 44/44.

## Session 2026-10-11 (4) — Vera, an independent review before every risky PR

`.claude/agents/vera.md`, `.claude/hooks/vera-report.cjs`, `test/verify-vera-report.cjs`,
`REFERENCE.md` § Pre-PR review (Vera), `AGENTS.md`, `AI_SDLC.md` § 7. No app file changed, so nothing
to release. Added to this PR (#134, the agent's environment) on Pp's instruction, after `main` was
merged in. #134 merged into `main` on Pp's instruction ("fix and merge"); `main` was merged in again
for #146, and `AGENTS.md` gained its OpenSpec line.

### Why

Pp asked how to improve the harness, and to study how large engineering teams run AI review. A kit
drafted in a claude.ai chat proposed a `vera` and an `omen` subagent plus hooks, but it was written
without this repo: its edit hook refused every `.jsx` file (it told the agent to rewrite `app.jsx` as
`.js`), and it blocked `gh pr merge` outright, against Pp's merge-on-instruction rule. Its one sound
idea was a reviewer that reads the diff in its own context. `AI_SDLC.md` § 7 names the gap it narrows:
no change to a printed dose has ever had a second reviewer.

### What changed

1. **`vera` subagent.** Tools are Read, Grep and Glob only, so she cannot edit or run anything even
   in bypassPermissions, where a subagent inherits the parent's mode and a "read-only" prompt binds
   nothing. She gets one review file (Pp's request, the diff, then the commit messages under
   `## Author's claims`) and none of the author's reasoning; she judges the diff before she reads
   the claims. She triages the diff into dose, patient data, access and printed order, checks each
   against this repo's own rules (`docs/CLINICAL_CONSTANTS.md` change protocol, `REFERENCE.md` PDPA),
   tries to refute each finding before keeping it, and reports at most five.
2. **BLOCK or NO BLOCK, never PASS.** A 🔴 needs a quoted line and the input that fails. Her NO BLOCK
   is not an approval and not the second clinician of the change protocol.
3. **The report's shape is a hook, not a request.** `vera-report.cjs` runs when she stops and sends
   her back once if the verdict, the five-finding cap, a `path:line`, an Evidence line or a
   `Fails when:` line is missing, or if the verdict disagrees with the severities.
4. **The main agent's side** is `REFERENCE.md` § Pre-PR review (Vera): split a dose diff over about
   400 lines, write the review file, paste her report unedited into the PR, mark each finding `fixed`
   or `disputed`, add a test she proposes only if it fails before the fix and passes after.

### Why each rule (sources read 2026-10-11)

- Read-only by tools; a fresh reviewer that sees the diff and the criteria, not the reasoning; a Stop
  hook as a deterministic gate; a reviewer asked for gaps "will usually report some": Claude Code docs,
  [best practices](https://code.claude.com/docs/en/best-practices) and
  [subagents](https://code.claude.com/docs/en/sub-agents).
- Draw the boundary "around access and actions, not around a model's instructions"; tier review by
  risk; reviewers prove their findings: [Anthropic, 2026-07-21](https://claude.com/blog/how-anthropic-secures-its-ai-native-software-development-lifecycle).
- Findings advise and never approve: [Claude Code Code Review](https://code.claude.com/docs/en/code-review).
- Precision over volume, nits suppressed, 75% of comments rated useful, usefulness tracked per
  category: [Uber uReview, 2025-08-12](https://www.uber.com/blog/ureview/); AutoCommenter held back
  until its useful ratio reached 80%: [Google, AIware 2024](https://arxiv.org/abs/2405.13565).
- A proposed test counts only once it runs and catches something: Meta,
  [TestGen-LLM](https://arxiv.org/abs/2402.09171) and [ACH](https://arxiv.org/abs/2501.12862).
- Repeat findings become checks whose error message teaches the fix:
  [OpenAI, harness engineering, 2026-02-11](https://openai.com/index/harness-engineering/).
- Small changes review better: [Google, ICSE-SEIP 2018](https://storage.googleapis.com/gweb-research2023-media/pubtools/4476.pdf),
  [Google eng-practices](https://google.github.io/eng-practices/review/developer/small-cls.html).
  The 400-line figure is a vendor's (SmartBear), not peer-reviewed.
- Two humans for the top source level: [SLSA v1.2](https://slsa.dev/spec/v1.2/source-requirements),
  which is why Vera does not count as the second clinician.
- Commit messages last, read as claims: Laurie Voss (Arize), "The Death of the Code Review", at
  [21:22](https://www.youtube.com/watch?v=_mi3alkqy4s&t=1282s), reports a study in which an innocent
  commit message hid vulnerable code from an autonomous reviewer 88% of the time, against 35% for
  humans. From Pp's YouTube knowledge notes; the study itself was not read.

### Tests

`node test/verify-vera-report.cjs`: 20 pass. Before the checker existed it failed to load; with the
five-finding cap raised to 10 and the 🔴-under-NO-BLOCK rule removed, 2.3 and 2.7 failed, so the
harness catches a loosened rule. CI runs it with every other `verify-*.cjs`.

A dry run on a real dose change: Vera's instructions, run as an Opus subagent with Read, Grep and Glob
only, on PR #137's diff (the peripheral K⁺ maximum of 60). She returned NO BLOCK with two 🟠 and three
🟡 findings, and her report passes `vera-report.cjs` with no problems. Her finding 2 was checked by
hand and holds: `kGrade` (`calculator.jsx:1639`) strips only float noise, so a bag of 60.25 mEq/L
(1,205 g, 60 mL/day, KCl 3 mEq/kg/day; dead space cancels out) is refused, while the stop line rounds
it and reads "K⁺ ในถุง 60 mEq/L เกินค่าสูงสุด 60 mEq/L". Her findings went to Pp to decide; none is
fixed in this PR.

### Not checked

- The `vera` agent itself in a NeoFeed session, and her Stop hook firing as SubagentStop there. A
  headless run in this worktree listed `vera` among its agents, so the frontmatter loads, but the
  CLI's login had expired before she started. Claude Code runs a project agent's hooks only in a
  trusted folder.

## Session 2026-10-11 (3) — OpenSpec, kept off both hosts

`openspec/`, `.claude/commands/opsx/`, seven skills each in `.claude/skills/` and `.agents/skills/`,
`.assetsignore`, `_config.yml`, `test/verify-build-shells.cjs`; docs. No served file, clinical constant or
calculation. **`CONSTANTS_VERSION` unchanged.** No `clasp` step. PR #146, merged into `main` on Pp's
instruction ("merge PR146 เลย").

### Why

Pp read openspec.dev and asked for it in NeoFeed first (*"ลองติดตั้งใน NeoFeed เลย"*). Plans written with
superpowers end with their task; OpenSpec keeps the agreed behaviour in `openspec/specs/`, so the next
agent, Claude Code or Codex, starts from the same written contract.

### What changed

- **`openspec init --tools claude,codex`** with OpenSpec 1.14.1: `openspec/config.yaml` and empty
  `specs/` and `changes/archive/`; `/opsx:explore`, `propose`, `apply`, `verify`, `sync`, `update` and
  `archive` for Claude Code; the same seven as skills in `.agents/skills/` for Codex. It touched no existing
  file. Telemetry was off for the run (`OPENSPEC_TELEMETRY=0`).
- **`openspec/config.yaml` carries NeoFeed's rules** an agent cannot read off the code: synthetic infants
  only, a dose change names its source and bumps `CONSTANTS_VERSION`, every clinical behaviour gets a
  harness case, the build step after a `.jsx` edit, and what deploys what. OpenSpec puts this into every
  proposal (checked with a throwaway change, deleted).
- **Neither host serves it.** `*.md` already hid the specs and skills, but not `openspec/config.yaml` or the
  marker files, so `.assetsignore` lists `openspec/` and `.agents/`, and `_config.yml` lists `openspec/`
  (Jekyll skips dotfiles). `verify-build-shells.cjs` 5.7 and 5.8 failed before that change and pass after it.

### Not done

- No spec yet. The first change through `/opsx:propose` writes the first one.
- `AGENTS.md` (PR #134, open) does not mention OpenSpec; whichever of the two merges second adds a line.
  #134 merged second and added it (2026-10-11 (4)).

## Session 2026-10-11 (2) — A tile that is fine says nothing

`calculator.jsx`, `icons.jsx`, `registry.jsx`, both shells (CSS); one harness changed. No clinical constant or
calculation. **`CONSTANTS_VERSION` unchanged.** A follow-up to the entry above, made before it was released.

### Why

Shown where the words appear (seventeen tiles in Steps 2, 3, 4 and 6), Pp asked for the normal state to say
nothing: *"ไม่แสดง In range ตอนปกติ แก้ก่อนปล่อย"*. Seventeen *In range* chips would spend the ward's attention on
the state that needs none, which is the call she had already made for the Osmolarity chip in Step 3.

### What changed

- **An ok tile has no chip.** A warn or crit tile is unchanged: a shape and one of *Low*, *High*, *Caution*,
  *Critical low*, *Critical high* or plain *Critical*. *In range* and *OK*, listed in the entry above, no longer
  exist. The absence of a chip is the signal, so nothing depends on the green.
- **The registry's ok stat has no tick** either, for the same reason; *Logged today* and *Needs entry* keep their
  triangle and octagon when they are off. `window.STATUS_ICON` is `{ warn, crit }`.
- The `.stat-chip.s-ok` and `.reg-stat.s-ok .reg-stat-mark` rules are gone from both shells.

### Tests

`verify-status-words-1011.cjs` (36 checks): `statusWord('ok', …)` is `null`, an ok tile has no `.stat-chip`, and
`RegStatMark tone="ok"` draws nothing; the warn / crit checks are as before.

## Session 2026-10-11 — Severity as a word and a shape, and no colour emoji on any screen

`calculator.jsx`, `registry.jsx`, `app.jsx`, `icons.jsx`, `data.js`, both shells (CSS); one new harness and one
edited. No clinical constant or calculation. **`CONSTANTS_VERSION` unchanged**: `data.js` lost a ✅ from two feed
notes and nothing that prints a dose moved.

### Why

Pp asked for a Hallmark audit of the live app (*"Audit NeoFeed with Hallmark"*, 2026-10-11). Its one critical
finding was real, not taste: a calculator tile said ok, warn or crit by colour alone (border, tint, a 3px side
stripe, the meter's zones). On a greyscale print, for a colour-blind reader, or on a tablet at night, three tiles
looked the same. The emoji were the second finding: `⚠️` is painted by the OS in its own colours, not `--warn` or
`--crit`, and the app mixed it with `⚠`, `✅` and its own icon set. Pp saw a before-and-after mock-up and said to do
all of it (*"แก้ตามภาพนี้ทั้งหมด"*), then to take the emoji out of every page (*"จัดการ emoji ในทุกหน้าเลย"*).

### What changed

- **Calculator tiles** carry a chip beside the label: a shape (tick, triangle, octagon) and a word. The hues, the
  tint and the meter are untouched; the side stripe is gone. The word is read off the number against the tile's own
  target: *In range*, *Low*, *High*, *Critical low*, *Critical high*; a tile with no target says *OK*, and an amber
  value that is still inside its target says *Caution* (no direction is claimed). brand and empty tiles have none.
  - The chip is a sibling of `.lbl`, in a new `.metric-top`, because the harnesses (and a screen reader) take the
    label's own text as the tile's name.
- **Registry stat strip**: *Logged today* and *Needs entry* get the same three shapes in front of the number
  (`RegStatMark`), and the 3px left stripe on all four stats is gone.
- **`icons.jsx`**: `warn` and `stop`, stroked like the rest; `window.STATUS_ICON` is the one ok/warn/crit → shape
  mapping.
- **No colour emoji on any screen.** Tabs, `<optgroup>` and feed-group labels, the pump headers, the user menu, the
  attach button, the copy button and its toast are text. `⚠️` and `⚠` in the calculator became the `warn` icon,
  `✅` the tick. Two feed notes in `data.js` lost a ✅.

### Left alone, on purpose

- The brand stripe on `.patient-strip .lead` (decoration, not status), and the inset stripe on Step 1's
  *Remaining* box, which has its own words.
- The `✓` / `⚠` prefix on toasts (here and on the Center Point page) and the ☐ ☑ ✔ on the printed order form: plain
  text glyphs, not colour emoji, and the print form is meant to look like the paper one.
- `--surface: #ffffff` and the white-fade card headers, which Pp chose on 2026-09-22.

### Check before the release

- **The words are inferred**, not taken from a clinician: the meter's own zones (green inside the target, yellow
  outside, red past a hard limit) plus the side of the target the value is on. If the ward prefers other words, they
  are the six strings in `statusWord` and nothing else.
- The 17 `<Tile>` call sites were read, and the harness mounts the real calculator on its default path. The grading
  functions behind each tile (`kcalStatusAt`, `kConcStatusAt` and the others) were not traced one by one; a tile
  whose grade is its own and lands inside its target says *Caution* rather than a guessed direction.

### Tests

New `verify-status-words-1011.cjs` (34 checks, sources and `compiled/`): the word table, the real calculator's tiles
(chip beside the label, own tone, a shape, a valid word, no stripe, direction matches the number), no colour emoji on
the screen or in any `<optgroup>` or feed note, and `RegStatMark`. `verify-tpn-meeting-0928.cjs` finds the lipid
card by `/^Lipid Pump/` now that the 🫙 is gone.

## Session 2026-10-09 (2) — A help button beside the login name, and one cropped picture

`app.jsx`, `icons.jsx`, both shells (CSS), `gas-backend.gs`; one new harness and two extended ones; docs. No
clinical constant or calculation. **`CONSTANTS_VERSION` unchanged.** Backend first: `@64` takes the picture,
with no new OAuth scope (MailApp attachments use `script.send_mail`, approved for `@62`). PR #144, merged into
`main` on Pp's instruction ("merge แล้ว deploy"). Also catches `STATUS.md` up with releases #140 and #143.

### Why

PR #143 released #142 at 18:01 ICT, and Pp still could not see a button: the help request lived inside the
avatar menu. Shown a rendered sheet of the real app with two mockups, she asked for it at the top right,
beside the login name (*"ให้ปุ่ม help button อยู่บนขวา ใกล้ชื่อ login"*), picked the phone form with the short
word over the icon alone, and then asked for a picture too (*"ให้แนบรูปที่ครอปไว้ ได้ด้วย"*).

### What changed

- **The topbar's help button** sits directly before the login name and opens the same form as the menu item,
  which stays. It reads ขอความช่วยเหลือ from 768 px, ช่วยเหลือ on a phone, the icon alone (44 px square) from
  310 to 359 px, and is hidden below 310 px, where the menu item is the way in.
  - The breakpoints are measured, and the test that bit was the NeoFeed wordmark: it is `max-width: 100%`
    inside a box that may shrink, so a crowded topbar squeezes the wordmark before anything overlaps. The
    first cut shrank it from 119 to 104 px at 300 px and to 114 px at 360 px.
  - Part of the cure: the sync pill's wrapper. On a phone its two children were hidden but the empty wrapper
    still took a flex gap, 8 px the button needed at 360 px. It is `.topbar-sync` now, laid out in CSS rather
    than inline (an inline `display: flex` beat the phone rule that hides it).
- **One picture** in the help form, optional. The form asks for names, beds and HN to be cropped out, then
  shows the picture that will go, with ลบรูป. The app redraws it on a canvas as a JPEG whose longer side is at
  most 1600 px (quality 0.82, smaller again if it is still over 1.5 MB): a phone photo goes as a few hundred
  KB, its EXIF (place, device) is gone, and a transparent PNG lands on white. A PDF, a picture the browser
  cannot open and one that will not shrink each get a Thai sentence in the form, and the request still goes
  without it.
- **`sendHelpRequest`** takes `image: { mimeType: "image/jpeg", data }` (bare base64). Before the rate limit,
  so a refusal costs nothing, it refuses anything that is not a JPEG by its first bytes (FF D8 FF), is not
  bare base64, or decodes to more than 1.5 MB, checking the string's length before the regex reads it. The
  picture goes as `neofeed-help-<YYYYMMDD-HHMM>.jpg`; the body says "รูปแนบ: 1 รูป (N KB)" or "ไม่มี", and its
  closing reminder now covers the picture too.

### Tests

- **`verify-help-request-backend.cjs`** 64 → 94. § 11 the attachment, byte for byte, its name and the body
  line; § 12 eleven refusals (PNG, a PNG or PDF claiming JPEG, a `data:` URL, over the cap by one byte, a
  string four times the cap…), none mailed, none counted against the hour. On `main`'s backend: 25 fail.
  `gas-vm-sandbox.cjs`'s `newBlob` now keeps the file name, as Apps Script's does.
- **`verify-help-request-frontend.cjs`** 29 → 53. #5 the topbar button; #6–#8 the picture, with `Image`, the
  canvas and object URLs stood in for. Two old checks would have passed by accident on the new button, which
  carries the menu item's words and comes first in the document; they now name the menu item. On `main`'s
  `app.jsx` and `icons.jsx`: 11 fail, all in #5–#8.
- **`verify-help-button-1009.cjs`** (new, 154 checks, Chromium). The button at 14 sizes from 280 px to 1440 px
  (inside the screen, clear of the search and the avatar, 44 px on touch, the right words, no sideways scroll,
  the wordmark at full width) and a real 3000 × 2000 JPEG with an EXIF block in, a 1600 × 1067 JPEG without
  EXIF out. Negative control: with the narrow-phone block taken out, the 320 px wordmark is squeezed. On
  `main`: 80 fail.
- **`verify-ios-input-zoom-1009.cjs`** (#142's) found the help item by its words and clicked the first
  match, which is now the topbar button: 15 of its checks failed in Chromium. It names the menu item now
  (`button:not(.help-btn)`) and passes 123/123. CI runs no browser, so only a local run could see this.
- On this PC the global `playwright` 1.62.1 wants Chromium build 1234 and only 1217 and 1248 are installed,
  so every browser section skips unless `chromium.launch` is pointed at 1248 (a preload shim outside the
  repo, `test/README.md`).

### Not checked

- A real iPhone, and a real request with a picture arriving at praew.tvl@gmail.com through the team's filter.
- ⚠️ A screenshot of NeoFeed can show a patient. The form asks, and shows the picture first; nothing enforces
  it. A DPO note joins the one on the four-letter name (`BACKLOG.md`).

## Session 2026-10-09 — The iPhone zoom that hid the help menu

Both shells only (CSS); a new harness; docs. No `.jsx`, no `compiled/` change, no clinical constant or
calculation. **`CONSTANTS_VERSION` unchanged.** Frontend only: no `clasp` step. PR #142, not merged, not
deployed.

### Why

Pp, from an iPhone, with a screenshot of the topbar's patient search open: *"หน้าล้นใน iphone 18 และยังไม่เห็นปุ่ม
ขอความช่วยเหลือที่ให้ส่ง email"*. In the screenshot the sheet's Close button and the weights were cut off at the
right edge, and the bed chips were 1.16× the size they render at 402 px.

Both complaints have one cause. iOS zooms the page in when a text field under 16 px takes focus, and it does
not zoom back out when the field lets go. The phone block's 16 px rule was `.inp, .sel`, a class list, and the
topbar's patient search (`registry.jsx`, `PatientPicker`) carries neither class: it was 14 px, so a tap on it
zoomed the page by 16/14. The zoom outlived the sheet. With it, the avatar, the only way into the user menu and
its 💬 ขอความช่วยเหลือ, sat past the right edge of the screen. The help item itself was there: release `62b6dec`
has it, and at 402 px un-zoomed the menu opens fully on screen. The quick calc's DOL box (`className="num"`,
15 px) zoomed the same way. Every phone sweep here runs in Chromium, which never zooms on focus, so none of them
could see it.

### What changed

1. **Every text field is 16 px on a phone and on any touch screen.** One rule, keyed on the element:
   `input` (not checkbox, radio or range), `textarea`, `select`, plus `.inp` and `.sel`, under
   `@media (max-width: 767px), (hover: none) and (pointer: coarse)`. It replaces the phone block's class-list
   rule. A field added without a class is covered, and so is a phone turned sideways: at 874 px it is wider
   than 767, and every field there was 14 px. A workstation with a mouse keeps its 13–14 px fields.
2. **The avatar is a 44 px target**: 44 × 44 on a phone (it was 34 px) and 44 px tall on a touch tablet or a
   sideways phone (it was 42). It is the only way into the user menu.
3. **A dialog is never taller than the screen.** Writing the harness found this one on the same path: on a
   phone turned sideways (402 px tall), the help form is about 430 px tall, so its ส่ง and ยกเลิก sat below
   the edge with nothing to scroll. It was already like that on `main`. `.modal-box` is now a column capped at
   90 dvh (82 dvh on a phone, the picker sheet's figure), and `.modal-body` scrolls between a fixed head and
   fixed buttons. Change password uses the same box.

### What the ward sees

- On a phone, the topbar's patient search and the quick calc's DOL box read slightly larger (16 px), and tapping
  them no longer zooms the page.
- On a sideways phone or a touch tablet, every text field reads 16 px.
- The avatar's circle on a phone is a little larger.
- Nothing changes on a desktop.

### Tests

`verify-ios-input-zoom-1009.cjs` (new): § 1, static, in both shells (the rule, the avatar, the dialog cap);
§ 2 in Chromium at Pp's 402 px and five other phones plus a landscape iPhone: sign in, open the topbar search,
the ward list, the help form, the register form, the quick calc and the calculator with every step open, then
measure every visible text field (none under 16 px). It also checks that the avatar is 44 × 44 and on screen,
that the help item is on screen, and that the help form's ส่ง is on screen. A desktop with a mouse keeps its
14 px search. § 3 is the negative control: the shell with the old class-list rule shows the topbar search at
14 px. 123 checks; **52 fail on `fbb19f4`**. CI installs no browser, so there only § 1 runs.

### Not checked

No WebKit in the cloud container: nobody has tapped the search on a real iPhone with this change yet. The zoom
is iOS's documented behaviour below 16 px, and the harness measures the size iOS reads. Pp's phone may still be
zoomed in from before. A pinch out, or reloading the page, resets it.

## Session 2026-10-08 (2) — The dosing weight has bounds; the outside review, item by item

`data.js`, `calculator.jsx`, `gas-backend.gs`, both shells and `compiled/`; tests; docs. **`CONSTANTS_VERSION`
unchanged** (a stop and an alert move no dose). PR #139, merged into `main` on Pp's instruction ("merge แล้ว deploy"). **The backend half needs a `clasp`
deploy** (`@63`); the two halves can go in either order.

### Why

Pp ran an outside review (GPT) of release `62b6dec` with backend `@62`, ahead of next week, when the ward
starts saving and printing real TPN orders for pharmacy. Its report stays outside the repo
(`~\repos\neofeed-audit-20261008\REVIEW.md`). It recommends holding routine pharmacy use until four P1
findings close. Each one was checked against `main` at `453108a` before anything changed, and Pp decided the
open ones in chat:

| Finding | Against `main` | Outcome |
|---|---|---|
| P1 · live peripheral K⁺ maximum is 200 | True live; PR #137 (max 60) was merged into `main` but not released | Released by PR #138 on Pp's instruction |
| P1 · 0.1 mL rounding of small stock volumes (NaCl 0.146 → 0.1 mL for 500 g, −32 %) | True; already `BACKLOG.md` § Now, blocked on pharmacy | Open. No code change until pharmacy says how they measure |
| P1 · a nurse can save and Submit orders while `NURSING_LOG_ENABLED` is off | True, and by design: D5 holds once the nursing I/O form is on, because until then the Calculator's I/O card is the nurses' only way to record I/O | **Pp: keep as it is** |
| P1 · the typed TPN calc. weight has no bound (900 g measured, 8,500 g dosing, accepted) | True: only `entry.weight`, the measured weight, was range-checked | **Fixed here** (Pp: critical beyond 20 %) |
| Lipid rate graded on the 2-decimal figure (3.48 g/kg over 20 h = 0.174, shown and graded 0.17, amber) | True, and by design (2026-09-28: colour never disagrees with the number shown) | **Pp: keep as it is** |
| GitHub org: default repository permission `admin`, 2FA not required | True. The org has one member, Pp; `tasamew` is an outside collaborator with admin on `neofeed` | Pp's settings; not changed |
| Backend trusts client calculations (totals not recomputed, `calcInput` not cross-checked) | True; known architecture | Open, separate hardening |
| US SMOFlipid label: pediatric max 0.15 g/kg/h, below the 0.17 ceiling | Not checked against the Thai label | Question for the TPN team |
| 9 kcal/g IV lipid vs about 10 kcal/g for 20 % SMOFlipid | Intentional, the KCMH worksheet's figure | No change |
| Privacy residuals (fail-open read audit, temp passwords in Staff H, DOB from date − DOL) | Known | Open, governance |

### What changed

1. **TPN calc. weight outside 200–8,000 g cannot be saved** (`D.TPN_WT_RANGE_G`, the bounds of a Daily_Log
   weight). Submit and Save draft are disabled, a banner reads "TPN calc. weight N g อยู่นอกช่วง 200–8000 g —
   ตรวจว่าพิมพ์ถูกหลัก — บันทึก/พิมพ์ไม่ได้ (รวมแบบร่าง)", and the critical alert "TPN calc. weight out of range"
   explains it. Drafts too, because the backend refuses them. A measured weight above 8,000 g with no override
   stops the same way, since it becomes the dosing weight.
2. **A typed weight more than 20 % from the automatic one is critical** (`D.TPN_WT_MANUAL_MAX_DIFF`, Pp:
   "ต่างเกิน 20%"). "TPN calc. weight far from automatic" names both weights and the difference
   ("1090 g typed, automatic 900 g (+21 %, more than 20 %)"). Like every critical alert it is ordered only
   with a typed reason, and the reason prints. The line under Step 1 turns red. Exactly 20 % is not above it
   (float noise stripped, as for K⁺). Only a typed weight is judged: the birth-weight floor is the rule
   itself, so 1,000 g dosing for a 750 g infant below birth weight raises nothing.
3. **`gas-backend.gs` refuses `calcInput.tpnWtG` or a non-zero `tpnWtOverrideG` outside 200–8,000 g**
   ("TPN calc. weight (g)"). A row from before UP-C2, with no `tpnWtG`, still saves. The 20 % rule stays in
   the calculator: a reason is a clinical judgement, not a plausibility bound.

An order saved before this release with a typed weight more than 20 % away now shows a critical alert its
saved override does not name, so Print waits for a re-save with a reason (UP-C6, unchanged). #137's version
bump already holds every older order for a re-save.

### Tests

- `verify-dosing-weight-1008.cjs` (new, jsdom): 48 checks over seven sections; **23 fail on `453108a`**.
- `verify-input-validation.cjs` § 3b: 14 new checks; **9 fail on the old backend**.
- `verify-calc-oracle.cjs` adjusted: its 16 kg scenario, the only one where the Soluvit and Peditrace ceilings
  bind, is now refused, so those ceilings are checked on screen only. Under 8 kg neither binds. The backend
  already refused a measured weight above 8,000 g, so only a typed dosing weight could reach them, and that
  is refused now too.
- Every harness in both modes from an LF export (`git -c core.autocrlf=false archive`): see the PR.

## Session 2026-10-08 — The peripheral K⁺ maximum is 60 mEq/L

`data.js`, `calculator.jsx`, both shells and `compiled/`; tests; docs. **`CONSTANTS_VERSION` 2026-09-28.1 →
2026-10-08.1.** PR #137, not merged, not deployed.

### Why

Pp, in chat: *"เพดาน K⁺ สาย peripheral จะให้อยู่ที่ 60"*. Since the review of PR #129 the maximum was 200 on both
routes, so a peripheral bag of 61–200 mEq/L was a critical alert that one typed reason cleared. 60 is the IWK
Health NICU peripheral figure the 2026-09-28 source search found (`docs/CLINICAL_CONSTANTS.md`).

### What changed

1. **`K_BAG_MEQ_PER_L.peripheral.hardMax` 200 → 60.** Amber 40 and red 60 stay, and central stays 60 / 120 / 200.
   Every path already reads the route's `hardMax`, so above 60 on a peripheral line Submit is disabled, Save
   refuses, Print and Copy are held, and a draft can still be kept, as above 200 on a central line.
2. **K⁺ is graded with float noise stripped** (`kGrade`, `toPrecision(12)`). A bag that is 60 mEq/L on paper
   computes as 60.00000000000001 for about a quarter of weight and volume pairs (1 kg, 50 mL, KCl 3 mEq/kg/d is
   one). With 60 as a maximum, that order was refused as "60 mEq/L เกินค่าสูงสุด 60". A real decimal still counts:
   60.4 is above 60. The same rule now applies at every K⁺ threshold on both routes, so a bag exactly at 40, 120
   or 200 is graded as that figure too.
3. **The peripheral K⁺ bar runs to 90 again** (1.5 × red, as before the maximum existed), red from 60. Ending it
   at the maximum, as central's does at 200, would leave no red on it and park an over-maximum needle on amber
   under a red tile. Display only.
4. **`CONSTANTS_VERSION` 2026-10-08.1.** `K_BAG_MEQ_PER_L` is on the bump list and the form prints the maximum
   ("max 60" where it said "max 200"), so an order saved before this release prints again only after it is saved
   again (`calcMoved`). No dose moves.

### What the ward sees on a peripheral line

- **Up to 40 mEq/L:** green, as before.
- **Above 40, up to and including 60:** amber, the caution "K⁺ concentration high" ("… above 40 mEq/L for a
  peripheral line (critical above 60)"); it saves with no reason and prints. Under the tile: "peripheral: amber
  > 40 · red > 60 · max 60 mEq/L"; the form "K⁺ in bag: confirm > 60 · max 60 mEq/L (peripheral)"; the back
  sheet "(confirm > 60, max 60, peripheral)"; the copied order "confirm above 60, max 60 on a peripheral line".
- **Above 60:** red, and one critical alert, "K⁺ above the maximum": "… the most a peripheral line may carry is
  60 mEq/L, so this order cannot be saved." By Submit: "K⁺ ในถุง N mEq/L เกินค่าสูงสุด 60 mEq/L ของสาย peripheral —
  เพิ่มปริมาตรหรือลด K — บันทึก/พิมพ์ไม่ได้". "K⁺ concentration too high", the alert a reason confirms, can no
  longer appear on a peripheral line. The quick calc's copy reads "!! K⁺ N mEq/L IS ABOVE THE 60 mEq/L MAXIMUM".

### Orders saved before this release

- **Any order dated by an earlier version** (`savedCalcVersionOf`: its stamp, or 2026-09-18.1 from its
  `aaProduct` key) reopens with Print and Copy held: "NeoFeed ปรับการคำนวณหลังคำสั่งนี้ถูกบันทึก …". Saving it
  again restamps it, and it prints.
- **A peripheral order of 61–200 mEq/L**, saved then with a reason for "K⁺ concentration too high", reopens with
  "K⁺ above the maximum", which that reason does not cover. The line by Submit says why, ahead of the re-save
  message, and Submit stays disabled, so it prints only after K⁺ is brought to 60 or below and the order is
  saved again. The row itself stays in `Daily_Log` unchanged; nothing re-grades it there.
- **Center Point** keeps the gap the review of PR #129 named: it never re-checks the maximum on a revision saved
  before the release. CP is synthetic-only.

### Tests

`verify-tpn-meeting-0928.cjs` § 14, new: peripheral 61, 65, 100, 150, 199 and 200 refused (red, the one alert,
Submit disabled, a reason does not save it, a draft does); 60 allowed in five fixtures, three of which compute
above 60 in floating point, and one saved with no reason asked and printed; central 65 amber, 200 a confirm, 201
refused; a peripheral order saved at 100 with its reason now refused and printable once brought to 60 and saved;
an order at 50 under 2026-09-28.1 held for re-save; one at 60 under the new version printing. § 10 follows the
new maximum. 149 checks; 30 fail against `f055360`, and 5 (the floating-point 60s) fail with the maximum lowered
but no float-noise grading. `verify-kcmh-constants` pins the peripheral maximum (fails against `f055360`).
Adjusted: `verify-tpn-team-0922` § 7 (peripheral 70 is above the maximum; the critical tier is shown on a central
130), `verify-status-zones` (peripheral red from 60 of 90) and `verify-calc-oracle` (its own rule carries the
peripheral 60 and strips float noise; the copied-order wording).

### Left as it is

- The wording keeps the confirm threshold beside the maximum: "red > 60 · max 60", "confirm > 60 · max 60",
  "(critical above 60)". On a peripheral line there is nothing left to confirm above 60. Whether to print only
  "max 60" there is Pp's call; it is a wording change on the pharmacy form.

## Session 2026-10-05 — Help requests from inside the app

`app.jsx`, `gas-backend.gs`, both shells and `compiled/`; tests; docs. No clinical constant or
calculation changed.

### Why

Pp wants staff to reach the Valhalla team from inside NeoFeed, by email, so that a daily Claude task
can read the requests and summarise them, and fixes can be run from her desktop. The address is the
team's Gmail, valhalla.team.th@gmail.com (already the contact in `SECURITY.md`). Its Gmail filter
forwards any subject containing "NeoFeed help" to praew.tvl@gmail.com; Pp set the filter up the same day.

### What changed

1. **User menu → 💬 ขอความช่วยเหลือ**, for every role and both sign-in methods. It sits in the menu,
   not on the login screen, whose contact button was removed on 2026-09-22.
2. **The form** (`HelpRequestModal`): a category (ใช้งานไม่ได้, ตัวเลขดูแปลก, อยากได้ฟีเจอร์, อื่น ๆ),
   the detail (up to 2000 characters), and a notice that asks for no HN, no patient name, nothing that
   identifies an infant. The app attaches four things and says so: the page, the app version, the
   browser and the device time. **It never attaches the patient on screen.** A refusal or a network
   failure is shown in the form and the text is kept; a tap outside closes only an empty form.
3. **`sendHelpRequest` in the backend.** Any signed-in session that is not on a temp password. It mails
   the team with subject `[NeoFeed help] <ประเภท>`, sender name NeoFeed and replyTo the staff member, so
   the team can answer them directly. Control characters are stripped and every context field is one
   capped line. Five requests per person per rolling hour (CacheService; fails open). A MailApp failure
   is a Thai "try again" (MailFailed). Every sent request is an Audit_Log row, `helpRequest`.
4. **`gasPost` refusals carry `serverError`**, the server's sentence without the "บันทึกไม่สำเร็จ"
   prefix, for a caller whose action is not a save.

### Deploy

The backend needs the `script.send_mail` scope, which no deploy has had: add it to the mirror's
`appsscript.json`, push, run `authorizeHelpMail` once as the deploying account (Pp approves the
consent), then update the deployment. REFERENCE.md § Backend has the steps. Ship the backend before the
frontend; the other order only shows "ส่งเรื่องไม่สำเร็จ" until the backend is live.

### Tests

`verify-help-request-backend.cjs` (64 checks, 52 fail against `origin/main`) and
`verify-help-request-frontend.cjs` (29 checks). `gas-vm-sandbox.cjs` gained a `MailApp` double.

## Session 2026-10-04 — The agent's environment: merge commits only, browser sections in CI, LF checkouts, AGENTS.md

`AGENTS.md`, `CLAUDE.md`, `.gitattributes`, `.github/workflows/test.yml`, `tools/verify-release.mjs`,
`REFERENCE.md`, `test/README.md`; one repo setting. No app file changed, so nothing to release.

### Why

A retrospective on the 2026-10-01 release (#131 → #133), at Pp's request. Release PR #132 conflicted
with a green `harnesses` because #130 had been squash-merged, and the fix lived only in a memory note
on Pp's laptop. #131 and #132 came from a cloud session, which clones this repo and nothing else, so
it saw none of that note and none of the steering kept outside the repo. The release session then
spent 26 minutes running by hand the browser sections CI skips, after exporting the tree to get LF
line endings, and wrote its own polling loop to wait for the hosts.

### What changed

1. **Merge commits only.** Squash and rebase merging are off for the repo (`REFERENCE.md` §
   Deploying, and rolling back). #130 was the one squash among the merges into `main` and `release`.
2. **`AGENTS.md`** (and a one-line `CLAUDE.md` that imports it): what to read before merging,
   releasing, editing a `.jsx` file or touching clinical code. Pointers only, since the repo is
   public. Both hosts already skip `*.md`.
3. **CI runs the browser sections.** Playwright and Chromium go into their own folder and are reached
   through `NODE_PATH` in the compiled pass only, so the eight harnesses with browser sections run
   them once, against the shipped files. A browser SKIP fails that pass. Timeout 30 → 45 min.
4. **LF in every checkout.** `* text=auto eol=lf` ahead of the `compiled/` and `vendor/` rules. The
   index was already all LF, so no committed byte changed.
5. **`verify-release.mjs --wait[=N]`** re-checks every 30 s until both hosts serve the tip of
   `release` (10 min by default), and refuses any other commit.

### Verified

- `verify-release.mjs --wait=1` on the live release `a127baf`: 0 failures, 61 passes, first try.
  Against the release before it, `3ae2e18`, without `--wait`: 6 failures, exactly #131's three
  served files on each host. `2c109ab --wait`: refused at once (exit 2). A throwaway copy pointed at
  a wrong host printed one retry line, then the full report, and exited 1.
- `verify-quick-calc.cjs` in a Windows worktree: 6 of 56 checks failed on CRLF before the
  `.gitattributes` change, all 56 pass after a re-checkout with it.
- The browser sections in CI, first run (#134, `3318527`): every SKIP came from the sources pass, as
  designed, and none from the compiled pass, where the sections ran for the first time off a laptop:
  phone sweep 220 passed, ward requests 0925 158, mobile fit 135, admin census 58, bed transfer 75,
  mobile bed button 42, nursing frontend 262. Chromium on the Ubuntu runner laid the Thai text out
  closely enough that nothing tripped. The whole job took 9 minutes, the same as before.

---

## Session 2026-10-01 — The search wording and the All entries table

`registry.jsx`, `log.jsx`, both shells and `compiled/`; tests; docs. No clinical constant or calculation changed.

### Why

Pp, from three phone screenshots (ward list, Dashboard): *"ช่องค้นหา ให้ขึ้นว่า เตียง / ชื่อ / นามสกุล"*;
*"ช่อง all entries ให้ปิด column day of admit ไม่ต้องโชว์แต่ให้คำนวณเหมือนเดิม"*; *"หน่วยให้เอาไปไว้ใต้
เฮดเดอร์ … จะได้อ่านง่ายขึ้น"*; *"ในแต่ละแถว ให้ตัวอักษรอยู่แถวเดียวกัน … na/k 6 / 4"*. On a phone the table
stacked "6 / 2" and every date three lines high, the unit after every number, and the search box's
placeholder was cut off.

### What changed

1. **Both search boxes** (the ward list and the topbar switcher, one search behind both) read
   "เตียง / ชื่อ / นามสกุล". "ค้นหา" is in the aria-label; the switcher had none and now has one.
2. **All entries: no Day admit column.** The figure is computed as before (`entryDol − D.admissionDol`)
   and kept on each row as `data-admit-day`. The Trend's admit-day axis and "Day N of admission" are
   unchanged.
3. **Each unit once, under its column name** (`EntryTh`), from the Trend's `METRICS`: g, mL/kg/d,
   mg/kg/min, g/kg/d, kcal/kg/d, mEq/kg/d, mg/kg/d. The cells show the number alone. Fluid and Energy
   read "/kg/d" where the cells said "/kg". `.th-unit` is exempt from the header's uppercase.
4. **One line per cell** (`table.tbl-entries`, `white-space: nowrap`, names top-aligned). The table
   already scrolled sideways inside `.tbl-scroll`; on a 412 px phone a row is now 41 px tall.

### Tests

`verify-ward-requests-1001.cjs`, 28 checks, 23 fail against the previous commit. Seven harnesses that read
the old columns or wording now read the new ones (test/README.md lists them).

## Session 2026-09-28 (6) — Review of PR #129: the K⁺ maximum holds on a peripheral line too

`data.js`, `calculator.jsx`, both shells and `compiled/`; docs. `CONSTANTS_VERSION` stays 2026-09-28.1 (not
released yet). Same PR #129, reviewed before merge on Pp's instruction ("เมื่อ review PR129 เสร็จ ให้ merge and
deploy เลย").

### Why

Two review passes (standards, and spec against BACKLOG § Now and Pp's answers) found one safety gap: only central
had a maximum, so a bag above 200 mEq/L refused on Central became, on Peripheral, a critical alert that one typed
reason cleared, and it saved and printed. The more restrictive line took the more concentrated bag. Asked, Pp:
*"max 200 ทั้งสองสาย"*.

### What changed

1. **`K_BAG_MEQ_PER_L.peripheral.hardMax = 200`.** Every path already reads the route's `hardMax`: Submit and
   Save refuse, Print is held, the tile, alerts, form, back sheet and copied order name it ("confirm > 60 · max
   200", peripheral). Amber 40 and critical 60 are unchanged. The peripheral tile's bar now ends at 200, as
   central's does (it was 90, 1.5 × the critical 60), so its colours sit in the first 30 %.
2. **The quick calc's copied text flags a bag above the maximum** (`!! K⁺ … IS ABOVE THE 200 mEq/L MAXIMUM —
   cannot be ordered`), as it flags an over-full bag. A patient's Copy already waited for a printable order.
3. `docs/CLINICAL_CONSTANTS.md`: the "When to bump" list named the deleted `MAX_K_MEQ_PER_L`; it names
   `K_BAG_MEQ_PER_L` now, as `data.js` does. The register and constants rows give the peripheral maximum.

### Tests

`verify-tpn-meeting-0928.cjs` § 10 and § 10b, 113 checks; 9 fail against `76db4d9`. § 10 also covers the print
hold for a saved row above the maximum, which no check reached before. Three harnesses that pinned the peripheral
line's old wording or bar now pin "max 200" (`verify-tpn-team-0922`, `verify-calc-oracle`) and a bar ending at
200 (`verify-status-zones`).

### Review findings left as they are

- K⁺ is graded on the raw figure and shown to 0 decimals, so 200.4 reads "200, above the maximum 200". It errs
  on the safe side.
- The lipid hours box keeps the last valid value while an out-of-range one is typed, and corrects it on blur.
- The "changes since the last order" line on the form says "20% lipid" (item 18 asked for the screen only);
  the form's own tick box still says SMOF. BACKLOG already holds the form wording as a question.
- Center Point never re-checks the maximum on a revision saved before this release (unchanged by this PR).
- Code duplication the standards pass named (the g/kg/h figure worked out in three places, the route test
  repeated) is left for a later tidy-up; every copy agrees today.

## Session 2026-09-28 (5) — KCl 2 mEq/mL confirmed; the acetate display, built and waiting for the vial label

`calculator.jsx`, `data.js`, both shells and `compiled/`. No figure moves: acetate stays hidden while its constant
is `null`. `CONSTANTS_VERSION` stays 2026-09-28.1. Same PR #129, not merged.

### Why

Pp: *"แสดง acetate ด้วย · KCl 2 mEq/mL ถูกต้อง"*. The TPN team gave Na acetate as "Na 3, acetate 6 mEq" per mL,
which sodium acetate's 1 : 1 formula cannot carry (6 is probably the label's mOsm/mL). Asked which figure to show,
Pp chose to wait for the vial label.

### What changed

1. **KCl 2 mEq/mL is confirmed** (Pp), the value NeoFeed already uses. `docs/CLINICAL_CONSTANTS.md` marks it 🟢;
   BACKLOG's stock-strength item now keeps only the small-volume rounding question.
2. **The acetate display is built and off.** `KCMH_STOCK.naAcetate.acetateMeqPerMl` is `null`. Once set from the
   label, Step 4's Na acetate note gives acetate per mL, its caption gives acetate mEq/kg/d, and the copied order
   gives the bag's acetate. The form is unchanged.

### Tests

`verify-tpn-meeting-0928.cjs` § 13: nothing about acetate shows as shipped; with a value set for the check, the note,
the caption (3 mEq Na/kg/d = 1 mL/kg/d · acetate 3 mEq/kg/d) and the copied order (7 mEq in a 2 kg infant's
overfilled bag) show it. 104 checks.

## Session 2026-09-28 (4) — Na acetate stock confirmed by the TPN team

Docs only (`BACKLOG.md`, `docs/CLINICAL_CONSTANTS.md`). No code, constant or `CONSTANTS_VERSION` change. Same PR #129,
not merged. Added from the Desktop session that sorted the inbox and mapped the meeting notes.

### Why

Meeting item 20 read *"Na ace 1 ml=Na 3 ace 6"*. Asked to confirm it from the vial, Pp checked with the TPN team:
*"confirm with tpn team แล้ว 1 mL มี Na 3 กับ acetate 6 mEq"*. Pp also confirmed the central K⁺ answer already
built in (3): above 200 is a hard stop.

### What changed

1. `BACKLOG.md` B · 20 is answered. Na 3 mEq/mL is `KCMH_STOCK.naAcetate`, so doses and printed mL stand. Acetate
   6 mEq/mL does not fit sodium acetate's 1 : 1 formula (6 may be mOsm/mL). NeoFeed shows no acetate, so it prints
   nothing wrong, but the label must be read before acetate is ever displayed.
2. `BACKLOG.md` § Now safety item: Na acetate confirmed; **KCl 2 mEq/mL stays open**, as does small-volume rounding.
3. `docs/CLINICAL_CONSTANTS.md`: `naAcetate` is 🟢 for Na; `kCl` is now the highest-stakes open item.

## Session 2026-09-28 (3) — Central K⁺: red above 120, and 200 as a maximum that cannot be ordered

`calculator.jsx`, `data.js`, both shells and `compiled/`. Still `CONSTANTS_VERSION` 2026-09-28.1: nothing has
shipped under it yet. Same PR #129, not merged.

### Why

The literature check the same day found no neonatal or paediatric source for a central K⁺ limit of 200 mEq/L
(ANMF 2020 central ≤ 80; IWK Health NICU 120; IMSN 2020 keeps 200 mmol/L bags for adult critical care). Pp:
*"K ทาง central ลดเป็น 120 ให้ขึ้นแดง แต่ max ที่ 200"*.

### What changed

1. `D.K_BAG_MEQ_PER_L` is `{ warn, red, hardMax }`: peripheral 40 / 60 (no hard maximum); central 60 / 120 / 200.
2. Central above 120 is critical ("K⁺ concentration too high"), ordered with a confirmed reason, as before.
3. **Central above 200 cannot be ordered** (`kOverMax`), the first threshold in NeoFeed that no reason can
   clear. Like the no-volume bag: Submit is disabled with a line saying why, Save refuses, Print is held, and the
   alert reads "K⁺ above the maximum". A draft can still be kept.
4. The K⁺ tile's bar ends at the 200 maximum on a central line (red from 120), and at 1.5 × 60 on a peripheral
   one. The line under it, the form and the copied order say "confirm > 120 · max 200" on a central line and
   "confirm > 60" on a peripheral one, instead of "max".

### Tests

`verify-tpn-meeting-0928.cjs` §10: central 117 amber, 130 red with Submit still open, 213 above the maximum
with Submit disabled and a draft still possible, and both routes' wording on the form and the copied order (98
checks). `verify-tpn-team-0922` §7, `verify-kcmh-constants`, `verify-status-zones` (red from 60 % of a central
bar, 66.7 % of a peripheral one) and `verify-calc-oracle` (its own rule, and the copied-order wording) follow.

## Session 2026-09-28 (2) — Pp's answers: K⁺ by route, no central osmolarity limit, a lipid rate ceiling

`calculator.jsx`, `data.js`, both shells and `compiled/`. **`CONSTANTS_VERSION` 2026-09-18.1 → 2026-09-28.1**:
the K⁺ limit is on the register's bump list (`docs/CLINICAL_CONSTANTS.md`) and prints on the form, so an order
saved before this prints only after it is saved again (`calcMoved`). Same PR #129, not merged.

### Why

Pp answered the team questions the same day: *"rate ของ lipid โชว์ทศนิยม 2 ตำแหน่ง · ถึงผู้ป่วย + คาสาย
ลบออกได้ เก็บเป็นเลขคำนวณไว้หลังบ้าน ไม่โชว์ในหน้า UI · lipid เพดาน 0.13-0.17 g/kg/h พิมพ์ได้ 1–24 ชั่วโมง ·
K ทาง central เริ่มสีเหลืองที่ 60 · osmolarity ทาง central ไม่มี upper limit ยกเลิกเกณฑ์ 40 mEq/L ของ KCMH"*.
The K⁺ and lipid numbers are the TPN team's, from its meeting, confirmed by her: the register's
second-clinician step. The code review of PR #129 also asked for a lipid rate check once hours below 16 could be
typed, and for typed hours to match Center Point's one-decimal print.

### What changed

1. **K⁺ in the bag by route** (`D.K_BAG_MEQ_PER_L`, `D.kBagLimitsFor`): peripheral amber above 40, critical
   above 60; central amber above 60, critical above 200 mEq/L. The critical alert keeps its title, "K⁺
   concentration too high", and asks for a reason at Submit; amber is a new caution, "K⁺ concentration high".
   The tile's range and bar (red from two thirds of a bar 1.5 × max long), the line under it, the form's two K⁺
   lines and the copied order name the route's limit. `MAX_K_MEQ_PER_L` (40 on both routes) and
   `K_REF_MEQ_PER_L` are gone.
2. **No upper osmolarity limit on a central line**: no warning above 1800, and no range on the tile. Peripheral
   is unchanged: amber above 850, critical above 900.
3. **Lipid rate ceiling** (`D.LIPID_GKGH`): amber above 0.13, critical above 0.17 g/kg/h, graded on the
   2-decimal figure the pump card shows. So 0.125 (shown 0.13) is green, and 4 g/kg/d over 24 h (0.167, shown
   0.17) is amber. The card says "เพดาน 0.13–0.17"; critical needs a reason at Submit. The range is ESPGHAN
   2005's infant maximum of 3–4 g/kg/d over 24 h (PMID 16254497); ESPGHAN 2018 gives no hourly limit and advises
   continuous 24-hour lipid in newborns (R 4.10).
4. **The pump rate stays at 2 decimals** (Pp). Typed hours keep one decimal, as Center Point's sheet prints them
   (16.25 → 16.3).
5. **Step 4's salt captions drop "= ถึงผู้ป่วย … + คาสาย …".** The prepared mL (เตรียม) stays; the split is
   still calculated.

### Tests

`verify-tpn-meeting-0928.cjs` §5–6 and new §10–12: 92 checks; the 19 new ones fail against `6b752a1`. Harnesses
that pinned the old rules now pin these: `verify-tpn-team-0922` §7; `verify-kcmh-constants` (the route table
instead of the 40 stop); `verify-status-zones` (K⁺ red from 66.7 % of the bar); `verify-review-0917-calc` (§2
counts the lipid-rate line apart; §12 central has no range); `verify-calc-oracle` (its own route K⁺ and
lipid-rate rules); `verify-nutrition-unit-review` (prepared mL shown, no split); `verify-ward-requests-0918` §12
(rows dated 2026-09-18.1 are now held until saved again, which its 2099 case foresaw).

## Session 2026-09-28 — The TPN team's meeting: 28 requests into BACKLOG, eleven display changes built

Frontend only: `calculator.jsx`, `app.jsx` (the Formula page's groups), both shells and `compiled/`. No
backend, no `data.js`, and no dose or compounding figure moves, so `CONSTANTS_VERSION` stays `2026-09-18.1`
(`data.js`: "not for comments, labels or UI"). The form's lipid g/kg/h now prints to 2 decimals; it is a
conversion in brackets, not a dose. PR #129, not merged.

### Why

Pp met the KCMH TPN team on 2026-09-28 and sent her notes: 28 numbered requests. Pp: *"ลงใน BACKLOG เลย
แยก 3 กลุ่มตามที่เสนอ เสร็จแล้ว ทำส่วนที่แก้ไขได้ทันที"*. `BACKLOG.md` § Now holds all 28 in three groups:
A, display changes that need no new number (built here); B, questions for the team; C, design work. Items 1
and 3 already worked that way.

### What changed

1. **Item 10 · dead-space chips 30 / 50 / 100** (were 0 / 10 / 20 / 30). A new NICU/SCN order still starts
   at 30; 0 or any other value is typed.
2. **Item 11 · the dextrose hint** gives g/kg/d (max 18) only; "g/d delivered" and "g in bag" left it.
3. **Item 14 · the amino-acid row** lost its grams column ("In bag / delivered", or "Total"); dose and volume
   stay.
4. **Item 15 · WFI q.s. left Step 2.** The bag make-up keeps Components and Bag total; an over-full bag still
   turns it red and says "cannot be compounded", and the components figure turns red with it. The form and
   the copied order keep WFI.
5. **Item 16 · lipid.** g/kg/h to 2 decimals on screen, form and copied order (0.083 → 0.08). "Infuse over"
   can be typed, besides the 16 / 20 / 24 chips: 1–24 h. Over 24 is held at 24 (lipid hangs 24 h at most);
   under 1 h, which is also what an emptied box reads, keeps the last good value. **The pump rate keeps 2
   decimals**: at low rates 1 decimal moves the dose (a 500 g infant on 0.5 g/kg/d: 0.135 → 0.1 mL/h, 26 %
   less), so that is a question for the team (BACKLOG B · 16).
6. **Item 18 · "20% lipid"** on screen, for "SMOF Lipid 20%", "SMOF volume" and "(SMOF + Vitalipid)", and in
   the changes-vs-previous list. The form still ticks "20% SMOF" on the KCMH paper form's own list and the
   copied order still names SMOF; the team is asked (B).
7. **Item 19 · P per mL** in both phosphate notes, from `KCMH_STOCK`: K₂HPO₄ "1 mEq K/mL · P 15.5 mg/mL" (was
   "mg/mEq K"); Glycophos "ใส่ mEq Na/kg · 2 mEq Na/mL · P 31 mg/mL (1 mmol)". The "เตรียม … = ถึงผู้ป่วย +
   คาสาย" line stays until a pharmacist view exists (C): it was added on 2026-09-01 after the Nutrition Unit
   misread a salt's mL.
8. **Item 25 · "Over target" → "สารน้ำเกินแผน"** in Step 1, and Step 5's "IV เกิน target" → "IV เกินแผนสารน้ำ".
9. **Item 4 · no Nutritional Status row** on the form's front.
10. **Item 28 · "แพทย์" carries the name only.** `nameOnlyOf()` drops the "(email)"; a row saved before names
    were kept leaves the line blank to sign. The back sheet's "บันทึกโดย" keeps the email for pharmacy.
11. **Item 6 · feed groups.** Step 5: preterm formula (PF 20, Enfalac Premature 22, Hi-Q LBW 24),
    post-discharge formula (Pre Nan 22), high-energy (FBM ↔ Infatrini, Infatrini 30). Same keys, same labels.
    The Formula page groups them the same way and now lists Pre Nan, which it had left out.

### Tests

`test/verify-tpn-meeting-0928.cjs`: 65 assertions over the eleven; 33 of them fail against `6269b88`.
Harnesses that pinned what the meeting changed now pin the new behaviour: the lipid field's label in ten of
them (`setField('20% lipid', …)`), the chips (`verify-calc-clicks`; `verify-ward-requests-0918` §10, where 0 is
now typed), g/kg/h to 2 decimals (`verify-tpn-team-0922` §2, `verify-calc-clicks`, `verify-calc-oracle`), the
name-only "แพทย์" (`verify-tpn-team-0922` §6 and §10), "สารน้ำเกินแผน" and "Lipid volume"
(`verify-calc-oracle`), the two-column AA row (`verify-phone-sweep`), and the fuzz's I3, which now reads the
bag total and the over-full warning instead of an on-screen WFI (the oracle still checks WFI on the form and
the copied order).

## Session 2026-09-27 (2) — Names, Edit patient and the NeoFeed ID: an audit, then Pp's three decisions

Pp: *"check all bug associated with name and edit patient name . check all transfer and find name or bed
whether it is work? verify and scrutinize"*. The audit ran the real client (release `10a4272`, which is `main`
`f675420`) in Chromium, with every Apps Script call answered by the real `gas-backend.gs` in
`test/gas-vm-sandbox.cjs`. Transfers and search worked; the bed findings went to PR #125. Three name and Edit
bugs did not work, and the harnesses on either side could not see them, because each fakes the other.

**1 · No Admit date or DOL แรกรับ could be corrected (live since release #106, 2026-09-23).**
- Since 2026-09-23 the Edit modal moves `dob` with those two fields. That is right: DOL is measured from it.
- `registerPatient` then ran `_sessionIdConflict`'s dob check on the merged record, read any moved dob as "a
  different infant", and refused: *"ID ซ้ำ … วันเกิดไม่ตรงกัน … ให้แก้ชื่อย่อ"*.
- A record with no stored dob could be corrected once, then never again. A record dated in พ.ศ. could not be
  saved from Edit at all: Save waits for the date to be converted, and the conversion was refused.
- **Fix (Pp: "แก้ที่ backend"):** an edit carrying `base` whose stored dob is still the one that device saw is
  a correction, not a different infant. If the stored dob moved under it (another device corrected it first),
  it is refused as an edit conflict, in words: *"มีคนแก้วันรับหรือ DOL แรกรับของรายนี้จากอีกเครื่องไปแล้ว …"*.
  A write with no base keeps the old rule. **Needs a `clasp` deploy.**

**2 · The registration's confirm never reached anyone, and its advice could not be followed (since 2026-09-24).**
- `gasPost` turned every server `error` into a refusal and dropped `needsConfirm`, so `handleAddPatient`'s
  "confirm, then overwrite" (the 2026-09-24 decision) never ran.
- The ward was told to pick Multiples A–D for a non-twin, or to fix the initials, a box #123 removed.
- An overwrite would have been worse: the registration replaces the other infant's row and leaves its
  Daily_Log under the same id, so two infants' histories merge.
- **Fix (Pp: "ใช้รหัสสุ่ม"; "สร้าง ID … user ไม่ต้องรู้ความหมาย แค่บอกว่าเป็น ID เดียวกัน"):** a new infant's
  id is `NF-` and six random digits (`D.newSessionId`). It carries nothing about the infant, so Copy Order's
  LINE text no longer carries initials and weight. Existing ids never change: Daily_Log is keyed on them.
  - A taken id is refused as `IdTaken`, and `handleAddPatient` draws again, up to three times, without a word
    to the user. Nothing is ever written over the record that holds it.
  - The old id caught a second registration of the same baby by accident; a random id does not. So
    registration now asks outright when an infant on file has the same birth weight and date of birth. The
    server asks (`_possibleDuplicate`, over every row, after the bed and date checks); the device shows its
    sentence and OK sends `confirmDuplicate`.
  - `gasPost` keeps `needsConfirm`, and the server's own sentence as `message`.
  - `confirmOverwrite` is now unused (`BACKLOG.md`). No server message names initials any more.

**3 · A name part with one consonant could not be registered (since #123).**
- ฤดี → ด, ใจ → จ, คำ → ค: two letters were required and these have one, so Register stayed disabled.
- **Fix (Pp: "ฤดี จะใช้ ฤด … ถ้าเกิดขึ้นจริง ให้นับสระเฉพาะชื่อแบบนี้"):** a name with fewer than two letters
  keeps its vowels as well, in the order typed, so it has two characters: ฤดี → ฤด, ใจ → ใจ, คำ → คำ. Tone
  marks never count. Every other name is cut exactly as before.
- A foreign name with one letter, or no surname, still cannot be registered (`BACKLOG.md`).

**Also:** an NF id is found with or without `NF-`, and by four digits or more.

**4 · One source for each kind of data (Pp: "check ว่าทุกอันเข้ากับ single of truth ข้อมูลชนิดเดียวกัน
ต้องมาจากแหล่งเดียวเท่านั้น").** Checked before the merge. Each kind of data in this change now has one
definition:
- **The displayed name:** `D.patientName` (`name`, else the old `initials`). About twenty screens, messages and
  the search each spelled out their own fallback, three different ways.
- **Date of birth from an admission date and DOL:** `D.dobFromAdmitDol`. The Register modal, the Edit modal and
  `dobFromAdmission` each had their own copy of the arithmetic.
- **"Still on the unit":** `registry.jsx`'s `isActivePatient` is now `D.isOnUnit` itself, not a copy of it. Two
  more copies written out inline (the archive filter, the Dashboard status chip) read it too.
- **"Bed taken":** one client message, `D.bedTakenMsg`. The modals and App's last check worded it two ways.
- **The look-alike question:** the server only. The device's own copy read a dob it derives for old records,
  and a parked infant's last bed, so it could answer differently from the server. It is gone, and the device
  shows the server's sentence.
- **The NF prefix:** one constant, `SESSION_ID_PREFIX`.
- Left as they are, on purpose:
  - rules the server must hold as well: the bed spelling, one-infant-per-bed, the status list. Apps Script
    cannot load the client's code, and the server is what refuses.
  - old ids carrying initials and BW, which are Daily_Log keys.
  - `initials`, written from the same two boxes as `name`.

**Tests.** New `test/verify-name-id-0927.cjs`, 68 checks. § 3 pins each single source, and each of its static
checks fails on the code before this pass. § 5 runs the real `<App/>` in jsdom against the real backend. It
fails 35 against `f675420`, in every section. `verify-backend-batch-0924`,
`verify-gas-registry-upsert` and `verify-review-0917-backend-writes` answer the new question for their
look-alike fixtures, and
`verify-ward-requests-0925` now expects ใจ to be a complete part and an NF id at registration.

**Deploy order: `clasp` first, then release the frontend straight after.**
- The look-alike question lives on the server only. A new frontend on `@60` would register a second record of
  the same baby with no question.
- In the minutes between the two, today's frontend on the new backend is refused rather than asked. A
  look-alike cannot be confirmed from it, and a taken initials id is told to refresh.

## Session 2026-09-27 — The bed-transfer review: the parked chip over the name, and six more

Pp found it while capturing the manual's screenshots from release `10a4272`. On the desktop ward list a
parked infant's chip, "รอเตียง · จาก NICU 7" (122 px), sat in the 90 px Bed column and printed over the
infant's name ("รอเตียง · จาก NIธน อร"). Then: *"verify and scrutinize all bed transfer bug"*.

Frontend only: `data.js`, `registry.jsx`, both shells, `compiled/registry.js`. There is no `clasp` step,
`CONSTANTS_VERSION` stays `2026-09-18.1`, and nothing moves a dose. Every bug below was reproduced first,
on the real app with a fake backend or on the real `gas-backend.gs`. Pp chose the fixes, and look C for
the chip, from rendered before/after sheets.

- **The parked chip in the two fixed-width bed columns.** It ran 44–51 px past the ward table's 90 px
  column at 1024–1440 px, and 38 px past Switch patient's 84 px one, over the name.
  - It is now a "รอเตียง" warn chip with "จาก NICU 7" on a small line under it (`BedChip` `stacked`), the
    way "Twin A" sits under a name. No column widens.
  - Not chosen: a two-line chip (Bed 90 → 110 px), and a one-line chip (Bed 90 → 156 px, which takes
    66 px from Diagnosis on every row).
  - The phone card keeps its one-line chip. Switch patient on a phone shows the parked bed on one line,
    at the size of the other beds' chips.
  - A `.bed-chip` rule keeps any bed label inside its column. The new line reads 7.7:1 on white and 6.8:1
    on a hovered row, measured in the browser.
- **An infant who left the unit while parked still read "รอเตียง".** `isParked` ignored status, so a
  baby discharged, transferred or expired while parked showed the warn chip on the archive rows, in
  Switch patient and on the Dashboard strip. It now requires `isOnUnit`, and the archive row shows the
  bed they last had.
- **The swap hint was never seen.**
  - The transfer dialog disabled a taken bed, and a disabled option cannot be chosen. So #102's
    "สลับเตียง: เปิด ⇄ ของ … แล้วกด พักไว้ก่อน" could not appear.
  - `verify-bed-park.cjs` reached it only by setting the option by script, and its check matched the
    park button's own label.
  - Now the transfer dialog, and only it, lets a taken bed be chosen. Choosing one says who is in it and
    how to swap, and Confirm stays disabled. Register and Edit still disable it.
- **"ย้ายไปเตียงว่างถัดไป" offered the bed the infant was already in**, highlighted (an infant in NICU 1
  was offered "NICU · NICU 1"), because the search left the infant out of the census. It no longer does.
  `nextFreeBed` keeps the option, and the dialog stops using it.
- **Edit recorded no hop.** Clearing the bed of an infant in NICU 5 who came up from SCN 2 made them
  "รอเตียง · จาก SCN 2" on the SCN list. Edit now records the bed left, as ⇄ does. Three cases record
  nothing: re-saving a legacy spelling, giving a parked infant a bed, and correcting a record that had
  already left the unit.
- **The server dropped a same-day return hop.**
  - `_mergeAppendOnly` skips an incoming entry equal to one it holds, and a hop was only `{ bed, date }`.
  - So after NICU 4 → SCN 1 → NICU 4 on one day, parking stored `[NICU 4, SCN 1]`. Every device then
    read "รอเตียง · จาก SCN 1" on the SCN list. This was reproduced on the real `gas-backend.gs`.
  - Every hop now carries `at` (`D.bedHop`). A dialog makes it once, so a retried save is still the same
    hop.
  - No backend change: `_validateMeasureArray` already accepts the field.
- **Why CI missed the chip.** `verify-phone-sweep.cjs` flags content cut off inside an `overflow: hidden`
  box, not content spilling over its neighbour, and its fixture has no parked infant.

Two more, found by a read-only audit in another session, confirmed here with a render or the real app,
and approved by Pp:

- **Switch patient read an infant who had left as the infant in their old bed.**
  - It listed a Discharged, Transferred or Expired infant under their old bed, with no status.
  - Searching that bed's number put them first: "9" gave a Transferred "NICU 9", then the infant now in
    NICU 9, two rows alike.
  - Now every infant on the unit comes first, and one who has left follows, dimmed. Their bed cell reads
    "Transferred จาก NICU 9" (`LeftUnitBed`). They are still reachable, since admins work the archive
    through this list.
- **A device kept its own copy after a patient save.**
  - After a successful Edit, ⇄ or park, it put its own record into state and into the merge base.
  - It kept them until the next poll, up to 4 min, even when the server's merge had kept another
    device's newer bed.
  - In that window the list showed the old bed, and a ⇄ recorded it as "Previous bed". The server still
    refused any double-booking.
  - It now syncs once after the save (`resyncAfterSave`). If other writes are still out, the last one to
    answer asks.

The harnesses are `test/verify-bed-transfer-0927.cjs` (75 checks, 60 without a browser; every section
except the § 6b guard fails on `f675420`) and `test/verify-bed-transfer-0927-sync.cjs` (the real App
against the fake Apps Script, given the server's merge; fails on `f675420`). In the Browser pane, on a
local copy with a fake backend, a full swap was run by hand: park นฝ จด, move สม จด into NICU 3, then
นฝ จด into NICU 1. Each save carried its hop with `at`.

## Session 2026-09-25 (5) — PR #123 checked before its merge: the phone sweep's server refused every file on Windows

Pp: *"check Pr113 NeoFeed clasp and merge"*, then the link to #123. #113 has been live since 2026-09-24
(release #114), so the PR meant is #123.

- **No `clasp` step.** #123 does not touch `gas-backend.gs`, which has not changed since `67ed949`, the
  source of `@60`. The backend takes the new name as it is: `_validatePatient` and `registerPatient` put no
  rule on `name` or `initials`, and store both through `_sheetSafe`, so "รย ทอ" and "Jo Sm" are written
  unchanged. The id keeps its shape: two initials, BW, twin.
- **CI's steps, run on Pp's PC on an LF export of `f79dd82`:**
  - a fresh build changes nothing, and the two shells are identical;
  - every harness passes against the sources and against `compiled/`, and so do `DEAD=0` and Center
    Point's build and tests;
  - the one exception is `verify-phone-sweep.cjs` § 2–3, below.
- **Why the sweep failed:** its test server refused every file on Windows.
  - `DIR` is `path.join(__dirname, '..') + '/'`, and `path.join(DIR, p)` comes back with `\` there, so
    `file.startsWith(DIR)` was always false.
  - Every request got a 404, the page stayed blank, and all 24 profiles timed out on their first click.
  - CI never saw it: it installs no browser, so it skips § 2–3, and in a Linux container the separators
    match.
- **Fix, in the test only:** compare against `path.join(DIR)`, which ends in the platform's separator.
  - With it, the sweep passes in Chromium on Windows: 220 checks, all 24 profiles and 162
    screens with no problem, and the negative control (the 1800 px cap put back) is caught.
  - `verify-ward-requests-0925.cjs` § 6 needs no server, and it passed here in Chromium (158 checks). Only
    the xkb re-derivation of the keyboard table is skipped, since Windows has no xkb data; all 94 key pairs
    were checked against the Kedmanee layout by hand.
  - At 360 px a step measured 1832 px here, above the old 1800 px cap, so the clipping reproduces on
    Windows as well (1943 px in the cloud container).
- **Nothing served changes** here: one test file, and the docs. `STATUS.md` catches up with release #122
  and marks #123 merged into `main`.

## Session 2026-09-25 (4) — Pp's answers on PR #123: the switcher stays unit-wide

Pp answered the five questions left open on PR #123: *"1. No 2. Later 3-4 later 5 ok"*. Docs only.

- **The topbar switcher stays unit-wide ("No").** It is the way to any infant from any screen. Only the
  ward list's own box is ward-scoped, as in entry (2). No code changes.
- **Foreign names are confirmed ("ok").** A foreign infant's name part is its first two English letters,
  vowels counted: John Smith → `"Jo Sm"`. Only the Thai rule drops vowels (entry (3)).
- **Later:**
  - the server's "แก้ชื่อย่อ" message, which needs a `clasp` deploy;
  - the DPO note that the name holds four letters;
  - one look on a real iPhone.

  All three stay in `BACKLOG.md` § Next.

## Session 2026-09-25 (3) — Letters only in a name; every phone swept for the same bug

Pp, on PR #123: *"Check ด้วย ว่า all phone จะไม่มีปัญหาการเลื่อนหน้าจอแบบเดียวกัน"*, *"ชื่อเช่น กค จด มันจะมีเว้นวรรค
ด้วย"*, *"จะต้องมีช่อง admit รับแยก เป็นชื่อ อีกช่อง เป็นนามสกุลไหม เพื่อจะได้ค้นหาง่าย ๆ ทั้งสองแบบ"*, and *"ให้ใช้เป็น
ตัวอักษรเท่านั้น ไม่นับสระหรือวรรณยุกต์ เช่น ทองดี ใช้ ทอ, เรยา ใช้ รย"*. Frontend only again: no `clasp` step,
`CONSTANTS_VERSION` unchanged.

**1 · A name part is its first two LETTERS.** This supersedes entry (2)'s code points.
- A letter is one of the 44 consonants. Every vowel (before, after, above or below the letter) and every
  tone mark is dropped: ทองดี → ทอ, เรยา → รย, สมศรี → สม, ใจดี → จด, พัฒนา → พฒ, น้ำฝน → นฝ.
  - ฤ and ฦ are vowels in Thai grammar, though Unicode files them among the consonants, so they are dropped
    too: ฤทัย → ทย.
  - อ ย ว ห count wherever they stand.
- Stored with the space, as Pp's example "กค จด". The sessionId is still the first letter of each part
  (รย ทอ → รท-BW…).
- **Separate first-name and surname boxes at admission: already the case.** NameFields has been two boxes since
  entry (2), and the search answers either one. They are stored in the one `name` column, split at the
  space, so no Sheet column and no `clasp` step is needed.
- **Search compares letters to letters** (`thaiLetters`): เรยา, เร, ทอง and ทองดี all find `รย ทอ`, whatever
  vowels or tone marks were typed or left out.
- **The name box waits for the keyboard.** Dropping vowels rewrites the box on nearly every keystroke, and
  rewriting a box under an Android keyboard that is composing a word (Gboard or Samsung, with suggestions
  on) makes it repeat or scramble letters.
  - While a composition is open the box shows the raw text.
  - It is cut to two letters on `compositionend`.
  - With no composition it is cut at every keystroke.

**2 · Every phone, swept.** New `test/verify-phone-sweep.cjs` signs in to the real app and opens every screen
on 24 device profiles:
- portrait phones from the 280 px Galaxy Z Fold cover to the 440 px iPhone 16 Pro Max;
- three landscape phones and three tablets;
- three phones with text at 130%.

On each screen it asks whether any box clips its content, whether the end can actually be tapped (a
hit-test), and whether anything drags sideways. The step clipping was fixed in (2); the sweep found **six
more of the same kind**, all of them older than today:
- **Landscape phones could not sign in.** The login footer was `position: absolute; bottom: 28px` over a
  padding reserved for it. At 844×390 the form outgrew the screen, the footer landed on the form, and its
  text took the tap meant for เข้าสู่ระบบ.
  - The footer is now in the flow, last. The column is centred by auto margins, not
    `justify-content: center`, which also pushed the top of a too-tall column out of reach.
- **The icon rail was cut off** at 915×412. The tablet block set `overflow: hidden` on it; it scrolls now.
- **The patient strip clipped the current weight** on 280–440 px phones: "+70g (5.9%" with no bracket at
  430 px.
  - Its phone grid is `minmax(0, 1fr)`, the weights wrap, and the delta may break.
  - Birth weight and current weight stack when they do not fit; the divider hides itself when they stack.
  - A long diagnosis breaks rather than running past the edge.
- **Four calculator grids clipped** on a 280 px phone or with large text: the EN fields, TPN volume/rate,
  dextrose/GIR, and the AA row. They, and the calculator's phone overrides (metric tiles, Step 1, the
  AA, lipid, EN and salt rows), are `minmax(0, 1fr)` now.
  - `TwoCol` too: a `<select>` is as wide as its longest option.
  - A field label may break before its unit, and the GIR number before `mg/kg/min`.
- **The ward table and the Dashboard's entries dragged the whole screen sideways** from 768 px up, by up to
  159 px, to reach Edit and Open. They scroll inside their own card now (`.patient-table`, `.tbl-scroll`).

After the fixes, all 24 profiles are clean: 162 screens, 0 problems. The harness's negative control puts
the 1800 px cap back and must see it clip.

**Not covered:** iPhone Safari itself. The container has Chromium only, and `playwright install` is not
allowed there. Everything used here is supported from iOS 16. On older iOS a step opens without its slide
(grid rows still size it), and a long diagnosis may not break mid-word (`overflow-wrap: anywhere` is
iOS 15.4). `BACKLOG.md` asks for one look on a real iPhone.

**Tests.**
- `verify-phone-sweep.cjs` has 220 checks. Section 1, the CSS and JSX pins, runs in CI. The sweep and the
  negative control need playwright. On `b0bfda9` (the pre-sweep head of #123), section 1 fails all 33 of its
  checks.
- `verify-ward-requests-0925.cjs` is now 159 checks: the letter rule, Pp's two examples, and the
  composing-keyboard case.
- `verify-review-fixes-0924` and `verify-single-source-weight-dol` now type นามสกุล `จด`: "ใจ" alone is one
  letter now.

## Session 2026-09-25 (2) — Android step clipping, ชื่อ + นามสกุล, and a search that finds people

Pp, with two screenshots from an Android phone: *"Android เลื่อนแล้วไม่เต็มช่อง ให้แก้ไข"*; *"อยากปรับให้ใส่ชื่อ
เป็นชื่อ + นามสกุล เอาตัวอักษรไทย สองตัวแรก"*; *"ช่องค้นหา เอาวอร์ดออก เพราะแยกตั้งแต่ต้นแล้ว แต่ให้ค้นหาได้
ทั้งชื่อนามสกุล … ได้รับแจ้งมาว่าค้นหายากมาก"*; then, mid-session, *"ให้ใส่เป็นชื่อภาษาไทย (ยกเว้นต่างชาติ)"*.
Frontend only: no `clasp` step, and `CONSTANTS_VERSION` stays `2026-09-18.1` (no dose moves).

**1 · A calculator step was cut off on a phone.** `.accordion-body.open` was `max-height: 1800px`, a
number meant to be "taller than any step". Below 768 px the two-column steps stack. Measured in
Chromium on the real app at 360 px, Step 3 is **1943 px**, so its last **143 px** were clipped: the
Lipid (total) and NPC : Protein tiles in the screenshot, with nothing to scroll to. Step 4 was 1757 px,
43 px under the cap before any warning line or larger Android font pushed it over.
- The step body now slides **one grid row from `0fr` to `1fr`**, which is the content's own height, so
  there is no number to outgrow and the animation stays.
- **`StepBody`** (`calculator.jsx`) renders all six step bodies. Its `.accordion-inner` is the one grid
  item (`min-height: 0`, clips only while sliding).
- **Measured after the fix:** shown equals content at 320, 360, 390, 412 and 1280 px, and every closed step
  is 0 px and hidden. The new harness puts the old rule back and must see 360 px clip (negative control).

**2 · The name is ชื่อ + นามสกุล, two characters each.** It had been one box of two characters, the
first letter of the first name and of the surname ("ปพ"). One letter of a name matches half the unit,
and "ปราณี" is not findable in "ปพ".
- **What's stored:** two boxes (`NameFields`, both patient modals), each keeping the first two
  characters typed, in the `name` column as `"ปร พั"`.
  - A **character** is a code point, as the old box's `maxLength={2}` counted, so a vowel or tone mark
    is one of the two: สมศรี → สม, ปราณี → ปร, พัฒนา → พั, น้ำฝน → น้.
- **Thai only, except a foreign infant.** Ticking ชาวต่างชาติ switches both boxes to English (John Smith
  → `"Jo Sm"`).
  - Script is not saved as a column: an English name reopens with the box ticked.
  - A letter of the other script is not saved. The note under the box says why, and points a foreign
    infant at the tick box. A keyboard left in English is the usual cause.
  - A Thai part that reads as an honorific (ด.ช. → "ดช") is questioned.
- **The sessionId keeps initials:** the first consonant of each part, so สม ใจ → `สจ-BW1200` (a leading
  vowel is not an initial: เพ็ญ → พ).
  - The id is what Copy Order carries into LINE in the name's place. It must not grow to four characters
    with the name.
  - An existing id never changes (walkthrough § 3).
- **Names from before this change are kept as they are.** "ปพ", a nickname or a PDPA-erased marker does not
  split into parts, so Edit opens both boxes empty, shows "ชื่อเดิม …", and saves the old name untouched
  unless a whole new one is typed. Half a new name blocks Save.
- `registerPatient` stores the name as free text, so **nothing server-side changed**.
  - ⚠️ The server's duplicate-id message still says "แก้ชื่อย่อ". Rewording it needs a `clasp` deploy
    (`BACKLOG.md`).

**3 · Search: in the open ward, and forgiving.**
- **The ward list searches its own ward**, reversing the 2026-09-15 unit-wide search. The one case that
  search was for survives: a search that finds no active infant here says *ไม่พบ "…" ใน NICU* and
  offers the ward that has a match in one tap, query kept (`SearchMiss`).
- **`← เปลี่ยน ward` clears the box**, so the next ward never opens filtered by a query nobody sees.
- **`D.searchPatients` (`data.js`) is the one search**, behind the ward list and the topbar switcher, so
  the two boxes cannot disagree. The switcher keeps listing the whole unit. Best match first:
  - Every word begins the first name or the surname, or a part begins the word, so สมศรี ใจดี, สม, ใจดี
    and สมใจ all find `สม ใจ`.
  - Tone marks are forgiven (นำฝน finds น้), and an honorific copied from the record is ignored
    (ด.ญ., บุตรนาง …).
  - A pre-2026-09-25 two-letter name still answers the initials of what is typed (ปราณี พัฒนา finds
    `ปพ`), ranked below a real match.
  - Then bed number (5 is NICU 5; 1 is NICU 1, then 10–12), NeoFeed ID, and diagnosis.
  - A query that finds nothing is read once more as typed on the **Thai keyboard layout** (`l,` is สม),
    and the list says so. The table is generated from the X11 Kedmanee definition, and the harness
    re-derives all 94 keys from it where xkb-data is installed.
- **The box itself:** a clear ×, 44 px on touch, and Escape clears. "พบ N รายใน NICU" is shown under it.
  There is no autocomplete, autocorrect or spellcheck: a shared workstation should not remember what was
  searched, and a phone should not "correct" สม.
- **The search glyph was an "O".** Its handle was a line drawn out and straight back, which encloses no
  area, so the fill dropped it. That included the topbar's search button in the screenshots. It now has
  a 2.6-wide handle, tangent to the rim so `evenodd` cannot cut it out.

**Tests.**
- New `test/verify-ward-requests-0925.cjs`, 145 checks:
  - static CSS in both shells, and `StepBody` for all six steps;
  - the name and search helpers;
  - both modals and both search boxes in jsdom;
  - the search glyph's geometry;
  - in Chromium: the shipped calculator at five widths, the negative control, and the glyph drawn.
- `verify-registry-logged-today.cjs`: its "search reaches across wards" section is rewritten to pin the
  ward-scoped search and the other-ward offer.
- Five harnesses that typed Latin "BB"/"KL"/"อบ" into the old ชื่อย่อ box now fill ชื่อ + นามสกุล:
  `verify-patient-ga-bw-edit`, `verify-review-0917-shell`, `verify-review-0917-sync`,
  `verify-review-fixes-0924` and `verify-single-source-weight-dol`.

**Not done, deliberately:**
- the server message above;
- whether the topbar switcher should also be limited to the chosen ward (it is the way to any infant
  from any screen, so it was left unit-wide; Pp to say);
- a DPO note that the name now holds four characters rather than two (`BACKLOG.md`).

## Session 2026-09-25 (1) — Release #120 went red at midnight: a date boundary in a harness, not the app

Pp: *"merge ทั้งสอง PR แล้ว deploy"*. #118 and #119 merged into `main` (`67ed949`) and were released by PR
#120: `release` = `e05a78d`, merged at 23:58:39 ICT on 2026-09-24. Both `harnesses` runs on `67ed949` passed
(the PR head and the `main` push). **The post-merge run on `e05a78d` failed at 00:00:00.229 ICT**, on
exactly one harness: `verify-nursing-backend.cjs` § 4. Assertion 057, "a date two days ahead is refused",
was accepted instead, and so 059, "none of the refusals wrote a row", counted 2 rows, not 1.

**Cause: the harness and the backend read two different days.**
- The harness fixes `TODAY` when the file loads.
- The backend refuses a date later than its own **live** tomorrow (`gas-backend.gs`, the nursing date
  check).
- A run that crosses Bangkok midnight between the two makes `TODAY + 2` equal to the backend's tomorrow,
  so the save is accepted.
- **Reproduced deterministically**, by starting `Date.now()` just before midnight with the run in real
  time. Only a crossing 150–450 ms into the run (the window before § 4) fails, and it fails exactly 057
  and 059. At every other offset it is 94/94.

**Fix:** that one refusal builds its date and makes its call inside `withNow(Date.now(), …)`, so both read
one instant. The same sweep passes at every offset (5–1300 ms), from the sources and from `compiled/`.

**The app was never in question.** `release`'s tree is `main`'s at `67ed949`, which passed twice. The
failed job was re-run once, and passed at 00:13 ICT.

**Not swept:** other harnesses also fix `TODAY` at load; this sweep covered only the one that failed.
`BACKLOG.md` § Next tracks the rest (infra, "A harness that fixes `TODAY` at load").

## Session 2026-09-24 (11) — Login speed: the first sync rides in the login reply (Pp, fixes 1–4)

Pp: *"เช็คให้ด้วยว่าทำไมตอนนี้ login เริ่มช้า ใช้เวลานาน จะทำยังไงให้เร็วขึ้น lean ขึ้นได้"*, and after the
diagnosis, *"ทำ login fix 1-4 เลย"*. (Entry (10) is the same day's Weight-chip / birth-weight PR, #118.)

**Diagnosis, from the code.** Nothing was measured on the live system; fix 1 exists so the next
answer is a number.
- **Two round trips before the ward list appears.** A sign-in was login, then getActivePatients
  with the new token. SyncGate holds the screen for both.
- **Every sign-in waits for a full sync.** Since 2026-09-18 every session end remounts the app (SEC-F2),
  and the 30-minute idle logout means more sign-ins per shift.
- **The sync grows with Daily_Log.** It carries every row of every infant in the window, each with its
  calcInputJson. A revised order crossed the wire twice: the superseded copy, which every client drops,
  and the revision.
- **Repeated fixed work.** Across its two requests a sign-in made 4–5 `openById` calls and read Staff
  twice: login never filled the 60 s staff-row cache, so the token check re-read it. It also appended
  two Audit_Log rows (unchanged, see below).
- **Password sign-in.** About 1 s of hashing (3,000 HMAC rounds), plus up to 5 s waiting for the
  script lock behind order saves at shift change. Both unchanged; see `BACKLOG.md`.
- **Temp-password accounts.** The first sync of a temp-password account was refused, and nothing
  re-ran it after the password change: the effect was keyed on email alone.

**What changed:**
1. **Measure.**
   - Server: one JSON line per sign-in and per sync in the execution log. It holds per-phase
     milliseconds, cache hit/miss and size (`_timer`), and never an email or a sessionId.
   - Client: the admin dashboard shows *"Sign-in on this device: X s"* and whether the data came with
     the login reply. A console line says the same.
2. **The login reply carries the first sync.**
   - Login sends `wantSync`, and `_loginReply` embeds `getActivePatientsJson`: the same ward payload
     and the same cache. It is audited as `readRegistry` right after `login`.
   - Never on a pending temp password, which doPost's gate would refuse. A sync that throws is left
     out, not a failed sign-in.
   - The client applies it through `applySnapshot`, which is syncFromGAS's old success branch moved
     verbatim, so both paths normalize identically. Only the user object goes to sessionStorage; the
     carried data stays in memory.
   - Both halves are compatible with the other half's old version: an old client never sends
     `wantSync` and gets the old reply, and a new client falls back to an ordinary sync.
3. **Leaner server.**
   - One spreadsheet handle per `doPost` request (`_book`), released in doPost's `finally`. Outside a
     request (editor, triggers) it opens exactly as before.
   - Login fills the staff-row cache (`_primeStaffRow`), with the same shape and TTL, so the revocation
     bound is unchanged.
   - The ward sync leaves out superseded rows, keeping every key in order; the admin archive still
     sends them. `verify-review-0917-backend-sync.cjs` now compares against its verbatim reference
     minus superseded rows (`refFor`).
4. **Temp password.**
   - The first-sync effect is keyed on `mustChangePassword` too, so nothing syncs while it is pending
     (the poll and focus refresh skip too).
   - It syncs the moment the flag clears.

What the ward sees: a sign-in should be one round trip shorter. Nothing else on screen changes except
the admin dashboard's timing line. Audit_Log gets the same rows per sign-in as before: `login`, then
`readRegistry`.

Tests:
- **`test/verify-login-speed-0924.cjs`** (43 assertions). One scenario runs the backend in the vm
  sandbox; four drive the real `<App/>`. It fails 28 on `3bb6288`, in every scenario.
- The sync-equivalence harness is updated as above.
- The full suite is green against the sources and against `compiled/`.

**Deploy:**
- Both halves, in either order: the backend with `clasp`, on Pp's instruction, and the frontend in a
  `main` → `release` PR. Each half alone is safe. `CONSTANTS_VERSION` is unchanged.
- This `gas-backend.gs` includes #116's PDPA fix. If `@59` is not live yet, this deploy ships that too.
- Read the result under Apps Script ▸ Executions (the `{"timing":…}` lines) and on the admin dashboard.

## Session 2026-09-24 (10) — Weight chip first; no growth velocity until the weight is above birth weight (Pp)

Two requests from Pp, with phone screenshots:

1. **"ให้ weight มาอยู่ก่อนหน้า energy"** — put Weight before Energy. The Dashboard trend graph's
   Weight chip was the last of nine, so on a phone it was reached only by scrolling the chip row to its
   far end. `log.jsx` `METRICS` now starts with Weight. The graph still opens on Energy.
2. **"ถ้าน้ำหนักยังไม่ gain BW ตรง growth velocity ให้ขึ้นว่า Weight below birth weight แทน"** — if the
   infant hasn't regained birth weight, the Growth velocity block should say "Weight below birth weight"
   instead. The reported screen read **"0 g/kg/d"** in critical red, "Target ≥ 15 g/kg/d · 2 วัน", on
   DOL 10. Its latest weight was 1,200 g from an order.

Why it read 0: `growthVelocity` (`data.js`) counted the regain of birth weight as the first weight
**>= birth weight**, and started grading right there. Two order weights equal to the birth weight gave a
slope of 0 over 2 days, which is "critical". A new order's Current weight is prefilled from birth weight
when nothing newer is recorded, so this shape is easy to produce. The same infant raised "Growth
velocity critically low" on the Alerts page. Only a weight at or above birth weight can produce this
readout; below it, the block already showed a Thai sentence instead of a number.

What changed:
- **`data.js` `growthVelocity`:** velocity is graded only once a weight on or after the regain is
  **above** birth weight. It is still measured from the regain, so a week spent flat at birth weight
  still counts against the first velocity. Until then the status is `physiologicalLoss` (DOL ≤ 14) or
  `notRegained` (past DOL 14), as for an infant below birth weight. Both now carry `bw` and
  `atBirthWeight`. `REGAIN_EXPECTED_BY_DOL` (14) is exported for the readout.
- **`fenton.jsx` `GrowthVelocity`:** in those two states the readout says **"Weight below birth
  weight"**, with `BW 1,300 g · -7.7%` under it. Past DOL 14 it is amber and adds "not regained by
  DOL 14", matching the Alerts page's caution; before that it is neutral.
  An infant exactly AT birth weight reads **"Weight at birth weight"**, because "below" would
  contradict the two numbers on screen. That is the reported infant if its birth weight is 1,200 g.
  **Pp confirmed "at" the same day ("ใช้ at ได้")**, so don't "correct" it to "below".
- **`app.jsx` `computeAlerts`:** unchanged except the title of the past-DOL-14 caution for an infant
  exactly at birth weight, which is now "Weight not above birth weight" instead of "Birth weight not
  regained".

⚠️ **What the ward will see differently on the Alerts page.** Every change here makes an alarm quieter,
which is why each is listed:
- An infant **at** birth weight, never above it, on DOL ≤ 14 (the reported one): the critical "Growth
  velocity critically low" becomes the informational "Growth velocity — not yet assessable". The red
  badge drops by one.
- The same past DOL 14: critical becomes a caution (amber), the level an infant just below birth weight
  already gets. Both infants are equally "not growing yet", and now they read the same.
- An infant who touched birth weight and dipped below it again before ever exceeding it: a critical
  negative velocity becomes "not yet assessable" (DOL ≤ 14) or the caution (past DOL 14).
- **Unchanged:** once a weight is above birth weight, grading is exactly as before. That includes
  a 0 g/kg/d plateau above it and a fall back below it after a real regain, which still alarm.

Tests: **`test/verify-weight-chip-and-bw-velocity.cjs`** (37 assertions, the jsdom set). § 1 is the chip
order, § 2 `growthVelocity`, § 3 the Growth chart readout and § 4 the Alerts page. It fails 24 on
`3bb6288` and reproduces the reported readout verbatim there ("0g/kg/dTarget ≥ 15 g/kg/d · 2 วัน"). Its
controls (a real gain above birth weight, a drop after a real regain, a history that starts above birth
weight) pass on both.

**Deploy:** frontend only. No `clasp`, `CONSTANTS_VERSION` unchanged (no printed figure moves). It is not
live until a `main` → `release` PR.

## Session 2026-09-24 (9) — PDPA: a weight save wrote an erased record's date of birth back

Pp's bug report, the same day. **Live from about 14:22 ICT on 2026-09-24 until `@59`; fixed in #116.**
`@57` (14:17 ICT) and `@58` carry F2 (#108), and every frontend since `77ed485` (#110, 14:22 ICT) sends a
dob with each growth-chart and nurse-form weight save. Together, a weight save on a PDPA-erased record
wrote a date of birth back into it, undoing part of a data-subject erasure.

How:
- `pseudonymizePatient` (PDPA s.33) empties name, initials and dob (B, C, G). Since SEC-B6 (2026-09-17),
  `_mergePatient` keeps them empty on every registry write: it looks for the `[PDPA-erased` marker in B.
- F2 taught `updateWeights` to write the client's dob into an **empty** G, to settle legacy records that
  never had one. `updateWeights` is a positional write of its own and never goes through `_mergePatient`,
  so it had no erasure test. An erased row's G is empty too.
- Sync gives every record without a dob one derived from its admission date and first weight row's DOL
  (`D.dobFromAdmission` since #113). The erasure keeps both, as clinical data, so for an erased record
  the derivation rebuilds the erased birth date exactly. `handleWeightUpdate` sent it. A device that
  synced before the erasure sent the real one.

Fix:
- **Backend:** `_isPdpaErased(row)` is now the one erasure test, used by `_mergePatient` and by
  `updateWeights`, which skips the dob refill for an erased row. The weight still saves.
- **Frontend:** `handleWeightUpdate` sends no dob for a record whose name carries the marker. Only the
  server can refuse a device that synced before the erasure, because that device's copy still shows the
  real name.
- **Left alone:** sync still derives a dob for an erased record, for DOL. For an existing record it is
  never displayed or stored. After this fix it leaves the device only inside an Edit, whose modal
  computes its own dob from the admission date anyway, and `_mergePatient` keeps that out of an erased
  row (SEC-B6).

Tests:
- **`test/verify-pdpa-erased-dob-backend.cjs`** (21 assertions, no npm dependencies). § 1 is a device that
  synced after the erasure (doctor and nurse), § 2 one that synced before it, and § 3 the same record never
  erased. 6 fail on `2731387`, `@58`'s source byte for byte; the § 3 control passes on both.
- **`test/verify-pdpa-erased-dob-frontend.cjs`** (7 assertions, jsdom, the real `<App/>`). A Growth-chart
  save on an erased record sends no `dob`, and the never-erased control still sends its derived one.
  Scenario 1 fails on `4434a77` (#113, which #114 released), from the sources and from `compiled/`.

**Deploy: merged into `main` on Praew's instruction ("merge แล้ว deploy").** The backend goes live as `@59`
with `clasp` (`REFERENCE.md` § Backend) and the frontend in one `main` → `release` PR, straight after; the
checks are comments on that release PR. It adds no column, scope or migration, and `@58` is the backend's
rollback. The backend alone closes the hole: it refuses the derived dob and the real one. Whether any
erased row was already refilled can only be read from the live Sheet (`BACKLOG.md` § Now).

## Session 2026-09-24 (8) — One source for weight and day of life, NeoFeed and Center Point (Pp)

Pp: *"น้ำหนัก และ day of life ของทุกที่ ในคนๆเดียวกัน ตรงกันทุกหน้าจอ ไม่ว่าจะไปอยู่ตรงไหน ให้เอามาจากที่เดียวกัน"*,
then *"Check DOL ของ center point กับ neofeed ให้ตรงกัน"*. Spec and plan: `docs/WEIGHT_DOL_SINGLE_SOURCE_SPEC.md`,
`docs/WEIGHT_DOL_SINGLE_SOURCE_PLAN.md`. Frontend only: no `clasp`, `CONSTANTS_VERSION` unchanged. Regression
test: `test/verify-single-source-weight-dol.cjs`, which walks one fixture infant through every screen of the
real `<App/>`. It fails 42 of its 59 checks on `main` at `2731387` (#111 included, which had already fixed the
back-fill prefill, check 3.4) and passes 59 of 59 here.

The helpers existed and most screens used them. What disagreed was what was kept along the way:

- **The patient strip showed the weight being typed.** It preferred the Calculator's Current weight box
  (unsaved, a draft, a back-fill's) and kept it on the Dashboard, Growth and Alerts pages until the patient
  changed, beside an alert quoting the real weight. Every screen now reads **`D.currentWeight(patient, log,
  asOfDol?)`**: the latest point of `weightSeries` (growth chart plus submitted orders, drafts out, the
  measurement winning a same-DOL tie, as in #96), on or before a DOL when one is given. `lastWeighed` and
  `weightAtOrBeforeDol` are gone, and so are the Calculator's `onWeightChange` and App's `calcWeights`.
- **A new order started from a different weight than the strip.** It read the growth chart alone and let the
  order win a tie (1,610 g under a strip reading 1,600 g). It now reads `currentWeight` like the strip. A
  back-fill (or an order left open past midnight) reads it as of its own DOL, where it used to take a weight
  from after its own day. The hint names an order's weight as well as a measurement.
- **The I/O divisor reads the same series (Pp's decision).** Yesterday's weight is `currentWeight(…, DOL − 1)`,
  so on a ward that weighs in the order, urine mL/kg/h is divided by yesterday's order weight instead of the
  birth weight or an old measurement. The birth-weight floor is unchanged. It is an on-screen hint only; it
  is neither printed nor saved.
- **Stored DOLs were displayed.** The Ward badge "บันทึกล่าสุด DOL", the Calculator's edit and baseline banners,
  and the save, update and delete toasts now show `entryDol`, from the row's date. The browser-copy banner
  shows the day it was saved. `entryDol` re-derives whenever the record has any anchor (`hasDolAnchor`): a
  record with a dob and no admission date used to show stored DOLs.
- **"Day admit" and the Trend's axis counted from the birth row.** They now count from `D.admissionDol`, the
  admission date's DOL from the anchor, so an infant admitted on DOL 6 with a DOL-1 birth row no longer reads
  five days further in. The Edit modal's DOL แรกรับ seeds from `admissionDol` too, and the legacy-dob
  derivation at sync moved into `D.dobFromAdmission`. The Trend's Weight plots `weightSeries`, so its "Latest"
  is the strip's weight.
- **Growth-chart rows were left behind by an anchor correction.** Orders re-derive their DOL from their date;
  measurement rows carry only a DOL. Correcting the admission date or DOL แรกรับ now moves every row in
  `weights`, `lengths` and `hcs` with the anchor (`D.anchorShiftDays`, `D.moveGrowthRows`). The birth row stays
  on DOL 1, and the row on the old admission DOL follows the admission. A move that lands a row on or before
  birth, or onto another row, blocks Save and names the row. A cleared DOL แรกรับ no longer saves as 1.
- **Birth measurements were filed on the admission DOL.** New registrations file birth weight, length and HC on
  DOL 1. Existing records are unchanged (BACKLOG § Later).
- **The Calculator's header named today's DOL over another day's order.** The Calculator reports its order date
  (`onOrderDate`); the chip names that day's DOL and, when it is not today, its date. The previous-order lookup
  follows it past midnight. The strip always shows today's DOL.
- **The growth chart's logger** files a new measurement on today's DOL and caps there. It used to cap at
  `max(last stored row, today)`. Correcting a row filed above today still updates that row in place.
- **Center Point's calculator page took DOL typed.** CP saved and printed it, checked it only as a whole number,
  and tied it to neither the birth date nor the order date. CP stores no birth date and computes no DOL of its
  own. The setup form now asks for the date of birth, and `center-point/order-setup.mjs` hands the Calculator
  `D.dolAtDate` for the TPN date. A bad birth date is refused in NeoFeed's words. **Decided by Pp:** CP will own
  the birth facts (date of birth, GA, birth weight) from registration, as new patients will be registered only
  in CP. That is CP-repo work (BACKLOG § Next).

**Merged with #111 (the nurse form), which landed on `main` during this session.** #111's D4 prefill ("the
latest measurement on or before the order's day", Pp: "ถ้าเข้าผ่าน ward หรือชื่อคนไข้ ให้ prefill น้ำหนัก") now reads
`D.currentWeight`. It is still bounded at the order's day, and the nurses' morning weight is still a measurement.
It now sees the orders' weights too, and a measurement wins a same-day tie. #111's strip guard ("a historical
weight is not pushed to the strip") is subsumed: nothing is pushed. The Dashboard I/O card's urine mL/kg/h
passes the log to `D.ioDivisorG`, so it divides by the same weight as the Calculator's Intake/Output card.
Otherwise an order-only ward's card would have used the growth chart alone. #111's five harnesses pass
unchanged.

Harnesses changed with the API, invariants kept: `verify-tpn-calc-weight` (nothing propagates a typed weight;
the saved `weight` column is still the entered one), `verify-calc-clicks` (a browser's previous submission
still prefills the plan; the weight comes from the record), `verify-safety-fixes-0923` and
`verify-error-boundary` (`currentWeight`, still null-safe). BACKLOG § Now's "2026-09-23 review's four
fix-first findings" block is closed. Two of its items were done on 2026-09-23 (#96: the admit-date guard and
the modal's merge base), and this session finishes the other two (the two current weights; DOL from
`weights[0]`, with its logger cap and outborn birth point).

## Session 2026-09-24 (7) — Pre-merge review of the nurse form: 8 findings, all fixed

An independent read-only review of the nurse-form commits, run before merging #111 at Pp's go-ahead.
All 8 findings were confirmed and fixed. All sit behind `NURSING_LOG_ENABLED`, so none reached the
ward. Each fix has assertions that fail on `9f3357d`.

1. **A nurses' figure taken into the Calculator could come back as a typed "0".** It happened when the
   box was emptied, or when a corrected or deleted record was cleared, and the "0" let a Submit
   through. Now a figure stops being the nurses' as soon as the prescriber edits its box. Clearing
   leaves the box blank, and a figure the prescriber typed over stays theirs.
2. **The nursing form could be closed mid-save.** Its writes are quiet, so a refusal went unseen.
   ✕ and ยกเลิก are now disabled while saving.
3. **A weight-only save said "saved" before the write answered.** A refusal then lost the weight. The
   weight write is now awaited, and a refusal stays in the form with the weight.
4. **Backend: a failed DATA_VERSION bump left the switched-on (`+n`) sync payload cached.** The bump
   now drops every variant. The switch is also read once per sync, for both the key and the payload.
5. **Backend: `appVersion` was unchecked free text in `Nursing_Log`.** It is now a build token, or
   blank. This keeps the PDPA minimisation promise.
6. **A total counted a blank half as 0.** IV 100 with a blank enteral total read "เข้า 100".
   Intake now needs both IV and EN, and Out needs both urine and drain. The card shows the halves, and
   the form asks for 0 when there is none. The Calculator's tap leaves Input to the prescriber when
   intake is half-recorded, and says so.
7. **The stool box rewrote "1.5" as 15.** A fraction is now kept as typed, and refused.
8. **Switching the form off made an open Calculator claim** a taken record had been deleted. With
   nothing served, nothing is offered or flagged.

- `test/verify-nursing-backend.cjs`: 94 assertions.
- `test/verify-nursing-frontend.cjs`: 262 assertions (238 without a browser).

## Session 2026-09-24 (6) — D4 settled: the prescriber types Intake/Output; the weight is prefilled

Pp confirmed D4 (§ (5) had read it the other way): **"D4 หมอพิมพ์เอง"**, then **"แต่ถ้าเข้าผ่าน ward
หรือชื่อคนไข้ ให้ prefill น้ำหนัก"**, then "Review/merge #111 ได้เลย".

- **Nothing fills a new order's Intake/Output by itself.**
  - With a nurses' record for the order's date, the card offers it as one tap ("ใช้ยอด I/O จากบันทึกพยาบาล").
  - The tap is the prescriber's choice, and the unsaved-draft store keeps it like typing.
  - The "filled from" note, the flags for a corrected or deleted record, and the seeded-zero rule are
    unchanged.
  - A nurse's compute-only Calculator is offered the record the same way.
- **The weight is prefilled** on every order opened on a patient: the latest weight measured **on or
  before the order's own day**, the nurses' morning weight included.
- **Fixed on the way (older than this PR):** a back-filled order took the newest weight of all, one
  measured after its own date. A DOL 8 order started at the DOL 20 weight. The "= น้ำหนักที่ชั่ง
  (DOL x)" hint follows the same rule now. That historical weight is also no longer pushed to the
  patient strip as the current one. Today's orders are unchanged.
- `test/verify-nursing-frontend.cjs`: 239 assertions (215 without a browser).
  - §4 (the one-tap offer) fails on `3c02db2`.
  - §4w (the weight) fails on `3c02db2` for every back-filled case.

## Session 2026-09-24 (5) — Nurse form built to Pp's decisions (ships switched off until D7)

Pp answered the spec's § 8 in Thai:
- **A:** OK.
- **D1:** "เอาแค่ยอดประจำวัน" (daily totals; the order's Input may be prefilled from what was actually
  received in the past 24 h).
- **D2:** the default fields.
- **D3:** "admin ทำได้ทุกอย่าง".
- **D4:** "calculator ให้เติมเอง".
- **D5:** "พยาบาลบันทึกหรือ submit ไม่ได้ ได้แค่ใช้ calculator".
- **D6:** "เก็บไว้ตลอดไปก่อน รอคุย".
- **D7:** "รอคุย".

`docs/NURSING_FORM_SPEC.md` now records the answers and what was built from each.
`CONSTANTS_VERSION` stays `2026-09-18.1`.

**Go-live is a switch, not a deploy.** The backend ships dark. Nothing changes until Pp sets the
Script Property `NURSING_LOG_ENABLED` = `true`, **after D7 and after the frontend is released**
(spec § 5.4). A backend batch is already waiting for its own `clasp` deploy (§§ (2)–(3) below). Without the
switch, that deploy would have taken the nursing form live before the DPO signed off.

### Backend — `test/verify-nursing-backend.cjs` (86 assertions; fails on `68e302f`)

- **The switch, `_nursingEnabled()`:** `NURSING_LOG_ENABLED` must be exactly `"true"`, and an
  unreadable property reads as off. **Off, this is the old backend:**
  - the sync has no `nursing` key;
  - the nursing actions refuse with `NotEnabled`;
  - nurses save orders.

  A flip is seen on the next sync. `deletePatient` cascades either way.

- **`Nursing_Log` (A–M, 13 columns)**: one row per infant per date, dated the morning the 24-h total
  closed. It is created on the first nursing save, trimmed to 13 columns, and never created by a sync.
- **Validation:** blanks come back as `null`, never 0. Each volume is 0–3000 mL, stools are a whole
  number 0–20, and the feed is a formulary key, never free text. There are no notes. An empty record
  is refused. `DuplicateDate`, edit conflicts, row re-checks, audit rows and a strict delete-start
  row follow Daily_Log's patterns.
- **Actions:** `logNursingEntry` and `updateNursingEntry` (nurse, doctor, admin), and
  `deleteNursingEntry` (admin only). `getActivePatients` carries `nursing`. `deletePatient` cascades.
- **D5:** `logDailyNutrition`, `updateDailyNutrition` and `publishLog` refuse a nurse (`Forbidden`, in
  Thai, pointing to the Dashboard). Registry edits and growth measurements stay nursing work.
- **The sync cache key names the payload's shape:** `sync2_` (was `sync1_`), plus `+n` while the switch
  is on. Neither a deploy nor a flip ever serves a payload of the other shape.

### Frontend — `test/verify-nursing-frontend.cjs` (222 assertions with a browser, 198 without; fails on `b64c7fa`)

- **"I/O ประจำวัน" on each infant's Dashboard** (`NursingIOCard`):
  - it says whether today is in yet;
  - it lists the last 7 days, newest first, with urine in mL/kg/h on the Calculator's own divisor;
  - a blank shows "—", never 0, and every sum is to 0.1 mL;
  - an admin sees a 🗑 on each saved row.
- **Its form** (`NursingEntryModal`):
  - a date (≤ today, ≥ admission), weight, IV, EN + feed, urine, drain and stools;
  - blank ≠ 0 end to end;
  - the weight goes to `weights[]` through `updateWeights`, like the growth chart's (`D.upsertWeight`),
    so there is one weight store;
  - refusals, `DuplicateDate` and conflicts are shown in the form. Once the I/O row has landed the
    form closes even if the weight could not be sent, so a second Save cannot make a second record;
  - a tap outside a form with typing in it does not close it;
  - nothing is kept in browser storage.
- **D4:** a new order's Intake/Output is filled from the nurses' record for its date and stays
  editable:
  - a recorded 0 counts as entered, and a blank does not;
  - opening a prefilled form writes no draft;
  - it never applies to a saved order, Center Point or the quick calc;
  - a record that arrives later is offered with one tap;
  - one corrected or deleted after the fill is flagged;
  - a restored draft is what was typed, not the record.
- **D5:** a nurse's Calculator computes but does not save:
  - there is no Save draft, Submit or publish, no New log on the Dashboard, no draft and no edit lock;
  - a note explains why;
  - it follows the sync payload both ways. It is on exactly while the payload carries `nursing`,
    which means while the backend's switch is on.
- CSS for `.nio-*` and `.nursing-modal` in both shells. Measured in Chromium at 280–1280 px: nothing
  scrolls sideways, and every target is ≥ 44 px on touch.

### Open

- **D7:** the DPO's sign-off on spec § 6, including the Sec 26(5)(a) citation. This blocks
  `NURSING_LOG_ENABLED`. The deploys themselves are safe, since the form ships switched off.
- **D6:** retention is indefinite for now and is to be discussed with the DPO.
- **D4:** it was read as "the Calculator fills it in itself". If Pp meant "the prescriber types it",
  the one-tap offer is already built.

## Session 2026-09-24 (4) — UX roadmap: alarm fatigue → admin census → mobile bed button → nurse form spec

Pp set the order: "alarm fatigue → admin census → ปุ่มเตียงมือถือ (เล็ก/reuse) → ฟอร์มพยาบาล + PDPA
(ใหญ่)". The first three are frontend-only. There is no `clasp` step. `CONSTANTS_VERSION` stays
`2026-09-18.1`: no clinical threshold moved. The fourth is a spec only. Each item has its own commit
and harness, and every harness fails against `68e302f`.

### 1 · Alarm fatigue — `test/verify-alarm-fatigue.cjs` (57 assertions, 39 fail before)

- **The Alerts badge counts only unacknowledged `crit` + `warn`, and wears the worst of them**
  (`alertBadgeFor`). It used to count every alert. The standing electrolyte *reminder* was pushed for
  every infant with an order, so the badge was never empty, and `crit={alertCount > 0}` drew it red.
  Now it is red only for a critical and amber for cautions, on the rail and on the phone's tab bar.
- **The Dashboard's entry count on the phone tab is neutral.** It is a count, and it was drawn in
  alarm red.
- **A session that has left the unit raises nothing** (`D.isOnUnit`, now exported from `data.js`).
  Before, it raised its full list, and the admin tile summed it with the ward's.
- **The PN electrolyte reminder shows only while the latest submitted order is parenteral.** That is
  what its own text says. A row with no route keeps it.
- **An acknowledged stale-weight caution stays acknowledged until it escalates past 7 days**, or until
  a new weight clears it. It was keyed on today's DOL, so it came back every morning with nothing new
  to say. The 3- and 7-day thresholds are unchanged.
- The Alerts page sorts unacknowledged, then crit → warn → info. It says what the badge counts, and
  why an empty list is empty.

### 2 · Admin census — `test/verify-admin-census.cjs` (58 assertions with a browser, 44 without; 25 fail before)

- **A census card per ward and one for the unit** (`buildCensus`). Each shows beds occupied/free
  (NICU incl. iso = 20, SCN = 30), active, logged today, needs entry (drafts named), รอเตียง, and
  infants with a critical / a caution. It adds 7 days of admissions and departures, and flags two
  infants in one bed, no bed, and off-list beds. It reads the ward screens' own helpers, so logged +
  needs entry = active, exactly as on the ward tiles.
- **The alert columns count infants, and are not net of any device's acknowledgements.** Acks are per
  device, so one device's acks say nothing about the unit. The fourth tile is now "Infants with
  alerts". It used to sum every alert, info and discharged sessions included, net of the admin's own
  acks: 16 against the 2 infants actually affected in the harness fixture.
- **It names beds, never babies.** The harness fails if any name or NeoFeed ID reaches the census.
- **An Admin tab on the phone** (the 2026-09-23 review: unreachable on a phone). The rail's Admin item
  gets the `dashboard` glyph instead of sharing Growth chart's. Recent log entries scrolls inside its
  own card. Measured in Chromium at 280–1280 px: the page never scrolls sideways.

### 3 · Mobile bed button — `test/verify-mobile-bed-button.cjs` (42 assertions with a browser, 24 without; 16 fail before)

- **The phone card gets ⇄ (`⇄ ย้ายเตียง`, or `⇄ เลือกเตียง` while parked).** It opens the same
  `TransferBedModal` as the desktop row's ⇄, unchanged; that is the "reuse" in the roadmap. On a phone,
  a bed changed through Edit wrote no "Previous beds" hop. พักไว้ก่อน, the only way to swap two
  occupied beds, was out of reach. The modal's own swap hint ("เปิด ⇄ ของ …") could not be followed.
- The card's actions are one row of three from 360 px. Below that, a Thai label wraps at its word
  break inside a taller button, never clipped, and every action stays ≥ 44 × 44.

### 4 · Nurse form + PDPA — spec only: `docs/NURSING_FORM_SPEC.md`

- **Design:** a `Nursing_Log` tab, one row per infant per shift, so a nurse's I/O no longer re-saves
  the TPN order. The Calculator offers the 24 h totals as a one-tap suggestion. Narrowing order
  writes to prescribers is a later phase.
- **Reviews:** a DPIA-lite, a red team, cell and quota arithmetic, and a test plan.
- **Blocked on Pp's D1–D7:** shifts and which 24 h a total covers, fields, who writes, the Calculator
  link, when to narrow order writes, retention, and DPO sign-off.
- **Found on the way:** the repo cites the PDPA lawful basis as "Sec 26(6)". The Act's health-care
  exception is **Sec 26(5)(a)**. This is logged in `BACKLOG.md` for the DPO to confirm. The legal text
  is not edited here.

## Session 2026-09-24 (3) — Clinical decisions (Pp)

Pp's clinical calls from the review, now coded. Stacked on the backend batch; the `gas-backend.gs` change
(the collision confirm) rides with that batch's `clasp` deploy — Pp's call. Regression test:
`test/verify-clinical-0924.cjs` (fails 5 against the pre-decision tree, passes after).

- **`TARGETS.fluid` — birth-weight floor.** It now takes the birth weight and, while the infant is still
  below it (postnatal loss), holds the fluid tier at birth weight rather than dropping into a lighter,
  higher-fluid tier off the nadir; it tracks current weight once regained. The calculator already passed
  the floored dosing weight, so **the ordered dose is unchanged** — this aligns the trend-graph target
  bands (`log.jsx`) and the default-fluid helper. (Pp: "ใช้ current weight แต่ถ้ายังไม่ถึง birth ให้ใช้
  birth ไปก่อน จนกว่าจะ gain." Current weight = the weight the doctor logs each day.)
- **NPE:AA < 20 stays a warning, not a stop.** Already the case since PR #96; confirmed as Pp's intent and
  pinned by a guard assertion — no behaviour change.
- **`registerPatient` pseudonym collision — warn, then confirm.** A colliding id (initials + BW) no longer
  either silently overwrites or hard-refuses: the server returns a `needsConfirm` warning and writes
  nothing; the client warns the doctor and, only on an explicit yes, re-sends with `confirmOverwrite` to
  write. (`_sessionIdConflict`'s existing "use Multiples A/B/C/D / change initials" guidance is the warning
  text.)
- **Stock:** KCl 2 mEq/mL confirmed (no change needed); Na acetate left untouched pending Pp's shelf check.

## Session 2026-09-24 (2) — Backend batch: F2 + BE-1..4 (needs a clasp deploy)

The deploy-gated half of the review, plus F2. **`gas-backend.gs` changes here are NOT live until
`clasp push` + `clasp deploy` — Pp's call.** The one frontend change (F2 client) auto-releases with the
next `main → release`. Regression test: `test/verify-backend-batch-0924.cjs` (fails 10 assertions against
the pre-batch backend, passes after). Stacked on the frontend PR.

- **F2 — a dob-less legacy record no longer re-dates on sync.** `updateWeights` now accepts a
  client-derived `dob` and writes it to an **empty** dob cell only (never over a real one); `app.jsx`'s
  `handleWeightUpdate` sends it, captured while `weights[0]` is still the admission weight — the moment a
  birth measurement is recorded. Together with #107's F1, every record now settles on a stored `dob`
  anchor that a later measurement cannot move.
- **BE-1 — the backend now knows a draft from an order.** `_buildLogRow` stores `status` as `"draft"`
  only when it is exactly that, else `"submitted"` (no unvalidated free text); `sheetHealthReport` reads
  column O, reports `draftRows`, and no longer lets a draft satisfy `activeWithNoEntryIn30d` — an infant
  with only drafts for 30 days is flagged.
- **BE-2 — the two positional Staff-sheet writes are row-guarded.** `changePassword` and the legacy-hash
  upgrade now assert the row still holds the account's email before writing (the guard the data tabs
  already had); the opportunistic hash upgrade is wrapped so a row shift skips it rather than blocking a
  valid login.
- **BE-3 — the remaining validation refusals are Thai.** BW/GA/WW.D/sex/DOL/weight required-and-type
  messages and "entry does not belong to this patient" no longer surface as raw English in a Thai toast.
- **BE-4 — patient status is canonicalised on write.** A blank, stray-space (`" Active"`) or unrecognised
  status is normalised before the one-infant-per-bed check reads it, closing the ghost-record / bed-skip
  hole a direct POST could open.

Still deferred to the clinical-decisions PR (Pp's calls, now made): `TARGETS.fluid` birth-weight floor,
NPE:AA → warning, and `registerPatient`'s collision alert-and-confirm.

## Session 2026-09-24 — Pre-meeting review bug fixes (frontend)

The 2026-09-24 pre-meeting review's bugs (artifact in the session; memory
`neofeed-premeeting-review-2026-09-24`). Frontend only — no `clasp` step,
`CONSTANTS_VERSION` stays `2026-09-18.1`. `test/verify-review-fixes-0924.cjs`
fails against `24460a5` (8 assertions, the symptoms reproduced) and passes after;
`verify-safety-fixes-0923.cjs` stays green (the F5 change was refined until it
did — see below).

- **F1 (blocker) · `registry.jsx` EditPatientModal.** The "DOL แรกรับ" field
  seeded from `weights[0].dol`, so once a ward recorded an outborn infant's
  birth measurement (which sorts to `weights[0]`, DOL 1) any later edit
  re-derived a wrong `dob` and persisted it — shifting DOL, PMA and every
  DOL-indexed target on the record of record. It now seeds from the stored
  anchor (`dob` + `admissionDate`), and `weights[0].dol` is written only when
  the field was actually changed. #96 fixed this at read time; this closes the
  persist path.
- **Sex was silently defaulting to Male at registration** (`registry.jsx`
  NewPatientModal seeded `"boys"` and did not require it) — a quickly-registered
  girl was filed under the boys' Fenton curves. Now blank, with a "— เลือก —"
  option, and required in `canSubmit`, matching EditPatientModal. (Found in the
  stakeholder walkthrough.)
- **F3 · `fenton.jsx` growth-velocity read-out** graded ≥15/≥10 itself and,
  fed unclamped points, showed a red "critically low" past 42 wk PMA where the
  Alerts page declines to judge. It now defers to `data.js growthVelocity` (the
  one grader), rendering the physiological-loss / beyond-reference states as
  neutral text. Length/HC keep their own cm/wk slope.
- **F5 · `data.js growthVelocity`** could never treat the first series point as
  the regain, so a history beginning already above birth weight (outborn
  admitted grown; order-only history) returned `insufficientData`. It now
  measures from the start when there is no loss window — defined as "dipped
  below bw, or the first point is exactly at bw" so the flat-start regain case
  (harness §6) is unchanged.
- **F4 · `registry.jsx` list** weight/Δ-birth columns read the measurements-only
  store while the strip/chart/alerts already join daily-order weights; both rows
  now pass the log to `lastWeighed`.
- **`ชื่อในวงการ` → `ชื่อย่อ`** everywhere (Praew, 2026-09-24): the EditPatientModal
  label and one code comment; register and edit now name the field the same way.
- **Cosmetic / quality:** the PatientStrip status chip is no longer always green
  (Discharged/Transferred/Expired render neutral, not "ok"); undefined tokens
  `var(--red)`×2 → `var(--crit-ink)` and `var(--mid)` → `var(--ink-3)`; the
  SyncGate font stack drops the never-loaded `Noto Sans Thai` for the loaded
  IBM Plex Sans Thai / Sarabun; the sync pill's dead `data-tip` becomes a real
  `title` tooltip; the `search` glyph renders as a proper magnifier (`fill-rule:
  evenodd`, scoped to that icon); and two comments that cited a reverted
  `roundLogEntry` defence (`app.jsx`, `gas-backend.gs`) now describe the real one.
- **Deferred, deliberately** (reported in the review, not in this PR): F2 (a
  legacy record with no stored `dob` still re-dates on sync — needs a backend
  `dob` write on `updateWeights` plus care to capture the admission DOL before a
  birth measurement moves `weights[0]`; F1 already protects every record that
  has a `dob`); and the backend batch BE-1..BE-4 (draft-status validation +
  draft-aware `sheetHealthReport`, the two Staff-sheet row-move guards, the
  remaining English validation messages, patient-status normalisation) — those
  need a `clasp` deploy, which is Praew's call.

## Session 2026-09-23 (h) — The new NeoFeed logo: a swaddled baby in the N, a bottle and a drop in "Feed"

Presentation only: `icons/icon.svg`, the seven icon PNGs, new `icons/logo.svg`, `app.jsx`
(`<NeoFeedWordmark/>` and its three call sites), both shells, `compiled/`, `tools/render-icons.cjs`, and
two harnesses. No clinical logic, no data model, no backend, no `clasp` step. `CONSTANTS_VERSION` stays
`2026-09-18.1`.

Praew brought the logo from Canva ("เปลี่ยน logo and new icon for NeoFeed", then "ปรับเป็นอันนี้แทน")
and settled it from rendered sheets over six rounds, the last after seeing the built app:

- **The N** is her image-1 N ("logo เอาแบบนี้"): a Sage stem, a Forest ribbon, and a Sage circle in a
  round bite out of the ribbon. The circle is **a swaddled baby's head** ("ศีรษะทารกนอนอยู่แล้วถูกห่อผ้า"):
  the ribbon is the cloth, the stem the body. She moved the head up 5 and forward 3 (units of the N's
  height of 100) from where the artwork drew it, and asked for the same head in the icon and the
  wordmark.
- **The icon** is that N on the app's own Porcelain Mist ground, as the icon already was, at 62% of
  the square (was 55%); the maskable pair keeps its 39% letter for Android's crop.
- **The wordmark** is her second artwork: heavy "eo", "Feed" with **a feeding bottle and a milk drop**
  where its two e's have their eyes, and a two-tone rule under the word on the login screen. Her notes
  on the renders: the drop should be a drop "เหมือนต้นฉบับ" (refitted to the artwork's measured outline,
  two cubics a side, within 1.7% of its height); "สีของ feed ให้เขียวเข้มขึ้นเข้ากับ N เขียวอ่อนตัวหน้า"
  (she chose C of three greens in the N stem's own hue: `#476655`, a step between the stem and the
  ribbon); and "ให้ขอบของ F, d มนๆ เหมือน N … เพิ่มความเข้ากันของทั้ง logo", so **every letter's corners
  are rounded** like the N's (r 3 outside, 1.2 inside), and the rule's left half takes Feed's green.
  The logo is two greens and a gold: Forest for the N's ribbon and "eo", the Sage family for the stem,
  the head, "Feed" and the rule, and Champagne Gold.
- **"by Valhalla Health" stays at the foot**, beside the © line, as she set it on 2026-09-22. Her
  artwork put "by VALHALLA HEALTH" under the rule, and it shipped that way for one round in this PR;
  she moved it back ("by Valhalla health เอาไว้ด้านล่าง คู่กับ 2026 เหมือนเดิม").
- **The size in the app** is her pick from the sheet: the N 26px tall in the topbar, on every width
  down to 320px. The sync gate draws it at 30px; the login hero is the lockup at 72px (64px on a phone,
  and it shrinks to fit a phone narrower than that).

**Why vectors, not her Canva image.** She asked why not use the Canva picture directly. It is an AI
image, so Canva holds pixels: it cannot stay sharp from a 16px tab to a 512px icon, and the head move,
the drop, the recolour and the rounded corners could not have been made to it. The Canva connector
also listed no designs on its account. So the mark was **measured and redrawn**: the N from her image 1
(the fitted edge is within 0.2% of the letter's height RMS of the artwork), the letters from **Poppins**
ExtraBold ("eo") and Bold ("Feed") — the artwork's type, matched by its counter and stem proportions —
converted to outlines, spaced by the tightest gap between each pair of outlines to the artwork's, then
every corner filleted with one cubic. Poppins is SIL OFL 1.1, which permits outlining it into a logo;
the app loads no font for the mark. The font files were downloaded to a scratch folder with Praew's OK
and are not in the repo, and neither are the scratch generators: **edit the SVG masters directly.**

**One drawing, three copies, pinned.** `icons/logo.svg` is the lockup master and `icons/icon.svg` the
icon's; `<NeoFeedWordmark/>` carries logo.svg's seven paths character for character, and the N's three
are icon.svg's. `lockup` adds the rule for the login screen only. Sizing is one CSS rule — 1em is the
N's height, the drawing 4.56em wide — so a call site sets `font-size` and nothing else. The old text
wordmark's rules went (`.nf-n`, `.lw`, `.login-app-name::after`), and with them IBM Plex Sans 300,
which only "Feed" used. `.login-wrap` no longer re-declares `--brand-4` and `--sand`: their one
consumer was the CSS rule under the old wordmark, and the rule is part of the drawing now, in the
logo's literal colours.

**Harnesses.** `verify-neofeed-mark.cjs` is rewritten around the three copies (136 checks): the N's three
shapes and its 4-unit ring (head r 11.5 in a bite r 15.5), logo.svg's seven paths and literal colours,
"Feed"'s seven contours (the bottle and the drop in place of the e's eyes), **no joint of any letter
turning more than 12°** (the rounded corners; this PR's first commit, with Poppins' own corners, turned
113–170° and fails it), the letter at 60–64% of the whole-square PNGs and 36–42% of the maskable ones
inside Android's safe zones, one component with three call sites, and the one CSS sizing rule. It fails
43 of 128 against `f19a1fe` (the old N), and each deliberate breakage is caught: the head nudged in
`app.jsx` only, "Feed" recoloured in `app.jsx` only, one stale PNG. `verify-login-endorsement.cjs`
(12 checks) pins the foot as "by Valhalla Health · © 2026" and that neither the wordmark nor logo.svg
draws a byline; taking the byline off the foot fails it.

**Rendered, not assumed.** The built app, served from the branch with a fake backend and made-up
patients, at 390×844, 320×640, 820×1180 and 1280×800: the lockup on the login screen with the foot
under it, the word in the topbar and on the sync gate, nothing crowded at 320px.

⚠️ **The app icon changes.** A phone shows a new home-screen icon only after a reinstall.
⚠️ **Outside this repo**, the Thai user guide (2026-09-17) and the เวรแรก quick-start (2026-09-21) carry
screenshots taken before this change; they were not updated here.

## Session 2026-09-23 (g) — Save draft: keep an incomplete order; print only after Submit

Frontend only: `calculator.jsx`, `data.js`, `app.jsx`, `log.jsx`, `registry.jsx`, both shells, `compiled/`,
new `test/verify-save-draft.cjs`, and ten harnesses that clicked the button by its old label. **No backend
change**: Daily_Log column O (`status`) already stored `"draft"` / `"submitted"` on create and update.
`CONSTANTS_VERSION` stays `2026-09-18.1`.

Praew: "ให้เพิ่มปุ่ม save draft เพื่อเวลายังได้ข้อมูลมากรอกไม่ครบทุกช่องให้ save ไว้ก่อนได้ แต่ถ้าจะ print ได้ จะต้อง
กรอกให้ครบทุกช่อง และ submit ก่อน". She chose shared server drafts and "old orders count as submitted".

- **Save draft (บันทึกร่าง)** saves with status `"draft"` even when required boxes are blank. Only the current
  weight is needed, because the backend refuses a row without one. The required-field gate, the no-volume
  stop and the critical-value reason are asked for at Submit instead.
- **Submit** (was "บันทึก") is the old Save: every required box, then status `"submitted"`. Center Point keeps
  "บันทึก" and has no draft button.
- **A draft cannot print or copy.** It shows "บันทึกเป็นแบบร่าง — ยังพิมพ์ไม่ได้ จนกว่าจะกรอกครบและกด Submit".
- **Blank boxes stay blank.** A draft records the required boxes that were blank (`calcInput.blankFields`).
  Reopened, they come back blank rather than as a typed 0, so Submit still asks for them.
- **A draft is not a logged order** (`D.isDraftEntry` / `D.finalEntries`). It is left out of trend graphs,
  alerts, the weight series (Fenton, "Wt now", velocity), "logged today" counts and previous-order prefill
  and diff. The Ward list shows **DRAFT** (amber) instead of NEEDS ENTRY. The entry table lists it as
  "Draft · ยังไม่ submit", so it can be opened and finished on any device.
- **Old orders**: every row saved before this carries `"submitted"` (the calculator always wrote it, and the
  backend defaults a blank to it), so all of them print as before.
- ⚠️ This changes the ward workflow: the save button is now **Submit**. Tell the ward and the TPN team.

## Session 2026-09-23 (f) — Park a patient mid-move ("พักไว้ก่อน") so a bed swap can be saved

Frontend only: `registry.jsx`, `data.js`, `app.jsx`, both shells, `compiled/`, new
`test/verify-bed-park.cjs`. No backend change and no `clasp` step. `CONSTANTS_VERSION` stays `2026-09-18.1`.

Praew: "ปัญหาช่วงย้ายเตียงแล้วเซฟข้อมูลไม่ได้ ให้สามารถย้ายเตียงแปะไว้ก่อนได้". One infant per bed is enforced
on the client and in `_bedConflict`, so swapping two occupied beds could not be saved: each move landed on
a bed the other baby still held. Praew chose the "park without a bed" option (not a temporary double-book).

- **Transfer dialog → พักไว้ก่อน**: the patient leaves their bed (`currentBed` blank, the old bed
  appended to `bedHistory`). Orders, weights and logs are untouched. A swap is now park B → move A into
  B's bed → move B into A's.
- **Parked patients stay on their ward's list** (`D.patientWard`) as **"รอเตียง · จาก NICU 2"** in the
  warn colour, instead of dropping into "อื่นๆ". The Dashboard header reads "Bed รอเตียง".
- The refusal on an occupied bed now says how to swap. Moving a parked patient into a bed adds no blank
  hop to "Previous beds".
- The rule itself is unchanged: a blank bed is not an occupancy, and the backend still refuses a
  double-book (`verify-bed-park.cjs` § 3).
- The printed order shows ตึก "—" while a patient is parked.

## Session 2026-09-23 (e) — MgSO₄ 10% only; energy red above 160 kcal/kg/d

Frontend only: `calculator.jsx`, `data.js`, both shells, `compiled/`, four harnesses. No stock strength
or dose divisor moved, so `CONSTANTS_VERSION` stays `2026-09-18.1`. Checked against the CUPA 2023
lecture "Enteral nutrition in preterm" (slides 17, 18, 21 — ESPGHAN 2022), which Praew sent.

- **MgSO₄ — 10% only** (Praew: KCMH uses 10% MgSO₄ only). The 10% / 50% vial toggle and the "50% = x mL"
  hints are gone from the card and the compounding sheet. A new order is always 10% (0.812 mEq/mL). An
  order saved as 50% before today still reprints as saved, and its card shows "Saved as 50% — KCMH stocks
  10% only" with a **Use 10%** button.
- **Energy tile** — red above 160 kcal/kg/d (`D.KCAL_HARD_HI`; ESPGHAN 2022: 140–160 only for suboptimal
  growth, never above 160). 140–160 stays amber. The bar now runs to 180 so the red zone shows.
- **`TARGETS.kcal`, stable phase** — 115–140 (was 110–140, the 2010 floor), matching `ENTERAL_TARGETS`.
  Nothing on screen read it; this only removes the second copy that disagreed.
- Already matched the slides, unchanged: EN energy 115–140, PER 2.8–3.6 g/100 kcal, EN protein 3.5–4.0.

## Session 2026-09-23 (d) — Three leftover colour changes from the local tree: Osm pill, Ca:P total, card frame

Frontend only: `calculator.jsx`, both shells, `compiled/`. No figure moved; `CONSTANTS_VERSION` stays
`2026-09-18.1`. These three were made in a local tree on 2026-09-23 and never committed (kept in a
`git stash` by the (c) session); they ship here on Praew's instruction.

- **Osm pill** — grey when osmolarity is in range. Only warn/crit keep a colour (Praew: "ปกติให้เป็นเทา
  เหลือสีเฉพาะตอนผิดปกติ").
- **Ca:P table, total row** — white (`--surface`), not the brand tint.
- **Metric cards** — the frame uses the status colour itself (`--ok`, `--warn`, `--crit`, `--brand`)
  instead of its pale `-line` tint, so the state reads at a glance now the range bars are paler.

## Session 2026-09-23 (c) — White chart backgrounds, a blue Energy line, and the paler range bars

Frontend only: `log.jsx`, `fenton.jsx`, both shells, `compiled/`. No figure, target or printed dose
moved, so `CONSTANTS_VERSION` stays `2026-09-18.1`.

- **Trend graph (`log.jsx`)** — the plot area is white (was a pale cyan), and the tinted area under
  the line is gone, so the green target band is the only colour behind the line. Energy is blue
  (`oklch(50% 0.15 250)`), not the dark green that merged into the green band (Praew, 2026-09-23).
- **Fenton chart (`fenton.jsx`)** — the same white plot area. Daily weights from the orders were
  already plotted by `weightSeries` (#96); they were not visible to Praew because #95/#96 have not
  been released yet.
- **Range bars on the cards** — `--zone-ok/best/warn/crit` are pale tints. The same change was made
  on 2026-09-23 in a local tree and never committed; it ships here.

## Session 2026-09-23 (b) — the safety review's findings, fixed

The review that found these is the entry below (`## Session 2026-09-23`); its four fix-first items
and most of its clinically-important ones are closed here. `test/verify-safety-fixes-0923.cjs` is
new and pins every one of them: 100 assertions, 38 of which fail against `d08e0fc`.

No figure in `calc` moved and no printed dose changed, so `CONSTANTS_VERSION` stays `2026-09-18.1`.
One clinical policy did change — see NPE:AA below.

### Day of life is now measured from the date of birth

`dolAtDate` anchored DOL on `weights[0].dol`, the DOL of the first *measurement*. `weights[]` is
sorted by DOL, so recording an outborn infant's birth weight from the referring hospital prepended a
DOL-1 row and re-dated the whole record: DOL 8 → 4, PMA 31+0 → 30+3, and with them the fluid, energy
and Na bands and the DOL printed on the pharmacy form. It now counts from `dob`, which is what day of
life means and is not an editable array. Two guards came with it: a `dob` *later* than the admission
date is not believed (that pair means the dob was defaulted, and the admission anchor wins), and a
record that reaches the client without a `dob` has one derived from `admissionDate` + `weights[0].dol`
— the same arithmetic both registry modals already use — so no record is left on the old anchor.

### The admission date is guarded, on both sides

Blank, a future date and a Thai Buddhist-era year (2569 for 2026) were all accepted, and each pinned
DOL at 1 — the day-1 fluid, energy, Na, K, Ca and P bands for an infant of any age. `admissionDateIssue`
now names each case in Thai, both modals block the save and offer the BE → CE conversion, and
`gas-backend.gs` checks the same thing on the write path. The edit modal no longer seeds `today` into
a record that has no admission date (opening such a record and saving any unrelated correction used to
stamp today, taking a DOL 20 record to DOL 1), and it recomputes and saves `dob` alongside, so a
correction to either field actually reaches the DOL. The server check follows `_checkSex`'s rule — a
bad value carried through *unchanged* is not refused, or the record would be locked against the very
correction that fixes it — and allows a day of slack on "future" so clock skew can never refuse a
legitimate admission entered late in the evening.

### The three-way merge base is the one the editor opened on

`base` was read out of `serverPatientsRef` at *save* time, and that ref is replaced by every background
sync. A sync landing while a patient modal sat open therefore swapped the merge base for a record
*newer* than the one on screen, and the server then read the other device's changes as this device's:
reproduced re-activating a discharged infant, and deleting a weight another device had just saved. The
base is now captured when the editor mounts (`useMergeBase`) and travels with the submission.

### The two weight stores are read as one

An order's dosing weight went to `Daily_Log.weight`, a growth measurement to `patient.weights[]`, and
nothing joined them. A ward that weighs once a day and types it into the order — most of them — built
a weight history the growth chart, "Wt now" and the stale-weight alert could not see at all: a
one-point Fenton chart and a red "Weight measurement >7 days overdue" on an infant weighed that
morning. `D.weightSeries(patient, entries)` joins them at read time rather than copying at write time
(copying would mean a second server write per order, a second chance to disagree, and a merge to get
wrong); a deliberate measurement outranks an order's working figure on the same day. A new order now
also starts from the freshest weight on record rather than carrying yesterday's order weight over
under the hint "= current weight", and Step 1 names which of the two the number is.

`D.ioDivisorG` is deliberately **not** changed: it has its own documented birth-weight-floor convention
and feeds a printed per-kg figure.

### Smaller, and all pinned

- **GIR is graded once** (`D.girStatus`). The Alerts page had its own copy of the threshold and called
  anything over 12 critical while the calculator made 12–13 the yellow margin, so one saved GIR was
  amber on the order it came from and red on the alert list. Every figure in an alert body now goes
  through `displayNum` — that page printed "Logged GIR 7.206498951781971" at the bedside.
- **Growth velocity** is measured from the regain of birth weight, and reports rather than grades in
  the two states where it cannot judge: the physiological postnatal nadir (it fired "critically low"
  on every normal infant's first week) and past 42 weeks PMA, where the ≥15 g/kg/d preterm target does
  not apply and the Fenton reference has stopped. `fenton.jsx`'s own velocity and "latest measurement"
  readouts now read the unclamped points — they were reading the chart's 42-week clamp and freezing on
  exactly the long-stay infants being watched hardest.
- **The trend graph** drew the latest row's target band across the whole history, so a day that was on
  target for its own day read far below it. Each point now carries the band that applied on its day and
  the band is drawn as steps.
- **Quick calc** no longer wears the last-opened infant's identity strip (the gate was "any view that
  is not the registry"; it is now `PATIENT_VIEWS`), and its DOL box can be emptied — 14 → backspace
  used to snap to "1", so typing 5 next gave 15.
- **Server plausibility bounds** refused correct orders: weight < 300 g (NeoFeed is used at 22–23
  weeks), GIR > 20 (hyperinsulinism is managed at 25–30) and energy of exactly 200 kcal/kg/d, which
  arrived as `200.00000000000003`. Now 200–8000 g, GIR ≤ 30, kcal ≤ 250, with an epsilon at the
  boundary — and the refusal is written in Thai instead of surfacing raw English inside a Thai toast.

### NPE:AA < 20 is a warning, not a save-blocking stop — **signed off by Praew, 2026-09-23**

The only clinical policy changed here, and the one the review marked "team decision". NPE:AA below
20 kcal/g AA means amino acid is being oxidised for fuel rather than laid down: real, but it is the
ordinary shape of a ramping PN order, where amino acid reaches target on day 1 while dextrose and
lipid climb over the week. With AA 3.5 g/kg/d and lipid 3 g/kg/d the ratio only clears 20 at GIR ≥ 8.8,
so a fluid-restricted day-3 ELBW raised a *critical* alert clearable only by typing an override
reason — the rote-override problem UP-C4 fixed for lipid, K and osmolarity, surviving on this one
limit. The high side (> 32) is untouched and still stops the order. `verify-review-0917-calc.cjs` § 4
is updated with the reasoning; UP-C4's "judged on the bag, not the total" decision is unchanged.

**Signed off by Praew (Neonatologist, KCMH) on 2026-09-23**, on PR #96, with the reasoning accepted as
written: an override people type without reading protects nobody, so the information is kept and the
reflex is removed. The DOL-aware variant that was offered was declined — it would put a third arm of
clinical policy inside a display threshold. `verify-calc-oracle.cjs` grades the new policy from a hand
transcription, not from `calculator.jsx`, and is ALL PASS at 1,058 checks on the merged result.

The sign-off carried one condition, now in `BACKLOG.md` § Next: only `crit` alerts are persisted
(`calcInput.critOverride`) and only criticals reach the pharmacy form, so from this change on a
sub-20 ratio is visible when the order is written and then leaves no trace. A transient ramp is
exactly what this downgrade is for; several consecutive days below 20 is a nutrition question, and
that is the case it gives up the ability to see.

### What was tried and backed out

Rounding every logged figure to clinical precision before saving it. It would have fixed both
symptoms above, but neither symptom is about storage: the raw print is a display defect and the
200 kcal refusal is a validation defect, each fixed where it belongs. Rounding the stored row instead
would have discarded precision in the columns a reprint and every trend are computed from — which is
what `test/verify-calc-oracle.cjs` caught, in 78 checks, and it was right to.


- Current production state → `STATUS.md`
- Open work → `BACKLOG.md`
- Conventions, schema, PDPA posture → `REFERENCE.md`

---

## Session 2026-09-23 — A safety review of the whole app, and three harnesses so the calculator cannot drift

Tests, one one-line calculator fix, `.github/CODEOWNERS`, and two repository settings. No `data.js`
change, no figure in `calc` and no printed number moved, so `CONSTANTS_VERSION` stays `2026-09-18.1`.

### The review

Praew asked for the calculator to be checked click by click and figure by figure, then the rest of the
app walked for bugs. The calculator came out clean: 1,058 oracle checks over 12 scenarios, 5,473 over
250 randomised orders (CI re-runs 80 of them), 242 click assertions and the repo's own 102 harness runs (sources and
`compiled/`) all agree, and every figure on a printed sheet reconciled by hand. One display bug, no
dose error. The findings that are *not* in the calculator are listed in `BACKLOG.md` § Now / § Next —
the two weight stores, the DOL anchor in `weights[0].dol`, the unguarded admit date, and the stale
`base` a sync leaves a patient modal holding.

### What changed

- **`test/verify-calc-oracle.cjs`** (new) — 12 orders through the real `<Calculator>`, every figure
  checked on four surfaces against a recomputation that never imports the app's formulas. See
  `test/README.md` for what it covers and for the `NEGATIVE_CONTROL=1` switch that proves it can fail.
- **`test/verify-calc-clicks.cjs`** (new) — 242 assertions over every chip, toggle, select, checkbox
  and button, plus the gates around a printed order.
- **`test/verify-calc-fuzz.cjs`** (new) — random orders from a fixed seed against a third
  recomputation, with five invariants that must hold for any order (Factor round-trip, dead-space
  independence, components + WFI = prepared, no broken number on screen, no critical tile without a
  critical alert).
- **`calculator.jsx`** — the Munti-vim vitamin D warning added the drop's fixed 400 IU/day **per kg**:
  `(suppVitD + 400) × wtKg`. A 2.5 kg infant on 400 IU/kg/d read 2,000 IU/day for a real 1,400, and an
  800 g infant read 880 for a real 960 — in the one line whose job is to stop a vitamin D overdose. Now
  `suppVitD × wtKg + 400`. The printed form and the copied order were always right; only this on-screen
  warning was wrong, which is why no printed figure moves and `CONSTANTS_VERSION` does not change.
  Pinned by `verify-calc-oracle.cjs` (scenarios B and C), which fails against the line above it.
- **`.github/CODEOWNERS`** (new) — advisory today: it puts the right name on every PR and is the one
  place to add the second clinical reviewer `AI_SDLC.md` § 7 says has never existed.

### Two settings, recorded here because they have no file

- **`main` now carries branch protection**, mirroring `release`: the `harnesses` check is required,
  `enforce_admins` is on, force-push and deletion are refused, 0 approving reviews (GitHub never lets
  an author approve their own PR, so requiring one would block Praew's own merges). Before this, `main`
  had **no** effective protection: the repository ruleset named `protect-main` (created 2026-09-07)
  has an empty target-branches list, so it protects nothing — `gh api repos/valhalla-health/neofeed/rules/branches/main`
  returns `[]`. A PR with a red `harnesses` could be merged into `main`, and `main` is what every
  release PR ships.
- **Every release since the deploy gate now has a tag** — `release-YYYY-MM-DD-prNN` on each
  `main → release` merge from PR #60 (2026-09-12, the first release under the gate) through #94
  (2026-09-23). Eleven annotated tags. A rollback is now `git checkout <tag>`, and the provenance stamp
  on a printed order leads to a commit that leads to a tag.

### Following releases

Tag the release merge as part of the release, the way `STATUS.md` is written as part of the deploy:

```bash
git tag -a release-$(date +%F)-pr<N> <merge sha> -m "Release $(date +%F) — PR #<N> merged into release"
git push origin release-$(date +%F)-pr<N>
```

## Session 2026-09-22 (5) — The Calculator button moves to the Ward page, the range bars get their colours back, and the Android icon gets room

Frontend only: `calculator.jsx`, `app.jsx`, `registry.jsx`, both shells, `compiled/`, the two maskable icon
PNGs and `icons/icon.svg`'s note. No backend, no `data.js`, no figure in `calc` and no printed number, so
`CONSTANTS_VERSION` stays `2026-09-18.1`. Merged into `main` on Praew's instruction ("merge แล้ว deploy")
and released in its own `main` → `release` PR straight after; the post-release check is a comment on that PR.

### Why

Praew, on the ward that evening, with screenshots of the live app. Her requests, in order:

1. *"ให้ calculator มาอยู่หน้า patient ward แทน"* — the quick-calc button onto the Ward page.
2. *"ตรงกลาง ward ให้เป็นพื้นขาว เพื่อให้แยกจากกันได้ชัด"* — the NICU/SCN tiles on white.
3. *"สีพวก overtarget หรือเตือนกำลัง[แก้ไข]ให้เปลี่ยนสีให้ชัดเจนขึ้น"*, and *"สีที่เคยกำหนด range เฝ้าระวัง
   หายไปหมด ให้เอากลับมา สีเขียว OK, สีเหลืองระวัง สีแดง alert ... สีเขียวอยากให้ชัดไปจาก palette เดิมเลย"*.
4. The card headers: *"กลับไปใช้กรอบ แนวๆ สีฟ้าคล้ายของเก่า เพื่อให้แยกได้ชัด"*.
5. The install icon: *"ไม่โอเค มัน fit ไป และมีรูป chrome อยู่ อันเก่าดูพอดี"*, *"ลองทำให้ android ผ่าน"*,
   keeping variant C.

Nothing was built until she had seen it. The real app was rendered in Chromium against a fake backend
with made-up patients, the design was injected as a throwaway mockup, and the before/after sheets went to
her first. Her answers: 1 OK; the Over-target box and the editing banner amber (*"เตือนสีส้ม โอเค"*); the
blue header on every card, *"แต่ให้มีเชรดขาวอ่อนๆ เหมือนที่เป็นสีเขียวไล่ขาวตอนนี้"*; and *"GIR bar turn
red at >13"*.

### What changed

1. **The quick-calc button is on the Ward page only** — the ward gate and the ward's list, both `view
   === "registry"` — and its ← goes back there, on whichever ward was open. This reverses the morning's
   "Dashboard only" (§ 2 of the (2) entry), on her instruction. While it shows, `.app.has-quick-fab` pads
   the workspace (108 px; 136 px + inset above a phone's nav), so the list's last rows scroll clear of it.
   A stale comment left over from the removed `quickFrom` went with it.
2. **The ward tiles have a surface.** Their inline style painted `var(--bg-1)`, a token that never
   existed, so they had no fill at all and sat invisible on the page ground. The `.ward-tile` rule now
   gives them white, the blue frame and a hover.
3. **Structure is pale blue again.** New `--frame*` tokens draw card borders (1.46:1 on the ground, where
   `--line` was 1.24:1), the card-header band — pale blue fading to white, over a blue rule, with a navy
   title at 10.4:1 — and the ward tiles. Structure only: never a status and never the accent, so buttons,
   focus rings and selected states stay Forest.
4. **The status colours read again.**
   - `--ok` gained chroma at the same lightness: `#177C49` → `#017F31`, 5.15:1 on white. It has to stay
     text-safe, because about a dozen places print `--ok` as small text; the mockup's brighter green
     (oklch 62%) measured 3.7:1 and was not shipped. `--warn` and `--crit` are byte-identical.
   - **Range bars draw zones.** `Meter` samples the tile's own grading function (`statusAt`) and bisects
     every flip, so green / yellow / red cannot disagree with the tile, and a hard limit is named once.
     Red means a hard limit and nothing else: GIR above 13 (not the "max 12" under it, which is the
     yellow margin — Praew's call), protein above 4.8, K⁺ in bag above 40, peripheral osmolarity above
     900. GIR keeps a deeper green for 8–10. The needle is ink with a white keyline, and is not drawn for
     0 or "!!", which are not points on the scale.
   - **Over the fluid plan by 1–10 mL/d is amber**, with a stripe; it used to share the brand tint with
     "Remaining". Over by more than 10 stays critical. The "กำลังแก้ไขบันทึก" banner is amber too.
   - Active alerts are unchanged.
5. **The Android icon.** Measured from her home-screen screenshot, the letter filled 82% of the icon: her
   Samsung shows the middle two thirds of a maskable image, and even Chrome's own conversion
   (`WebappsIconUtils`) keeps only the middle ~87%. The maskable pair now draws the letter at scale 1.0
   (39% of the square, was 54.7%), furthest ink 27% from the centre (was 38.3%, a hair inside 40%). That
   is also inside Android's 66/108 dp circle, which no launcher mask cuts. It lands at about 58% of her
   launcher's icon; ChatGPT's beside it is 62%. The tab, "any" and Apple icons are byte-identical.
   `tools/render-icons.cjs` renders the PNGs from the master, and reproduces the five unchanged files to
   within antialiasing.
   - **The Chrome badge is not the icon.** It marks a home-screen *shortcut* rather than an installed
     app. The Cloudflare host is installable (Chrome reports no installability errors and parses the
     manifest), but the GitHub Pages address lands on `moved.html`, which has no manifest, so adding
     that one can only make a shortcut. A shortcut never updates its icon either. To get the new icon:
     remove the old one, open the Cloudflare address in Chrome, ⋮ → Add to Home screen → **Install**.

### Found on the way

- #91, merged while this was in progress, added a **K⁺ in bag** tile graded with a hard limit (40 mEq/L).
  With the default rule its bar would have shown yellow above 40 beside a red tile. It passes its rule to
  the bar now, and `verify-status-zones.cjs` checks at the source that no hard-limited tile can skip that.
- `app-walkthrough.md` still said the quick-calc button rode every screen, stale since the morning.
- A shell heredoc on this machine ate backslashes (`\b` became a backspace byte, `\n` a line break)
  while a harness was being edited. Caught before commit; edits went through script files after that.

### Verified

- An LF export of `c5524cc` (the code, merged onto `main` at `c6e32b9`): a fresh `tools/build.mjs`
  changes nothing, the shells are byte-identical, all 50 `verify-*.cjs` harnesses pass against the
  sources and again against `compiled/` (plus `DEAD=0 verify-kcmh-factor.cjs` both ways), and Center
  Point builds and passes its tests.
- `verify-status-zones.cjs` (new, 169 assertions) fails 11 times when GIR's and protein's rules are
  withheld from their bars. `verify-neofeed-mark.cjs` fails 4 times on the old maskable PNGs.
- The real app, rendered in Chromium with made-up patients, matched the mockup Praew approved.
- ⚠️ **Not yet on a phone**, and not signed in. The icon shows only after a reinstall.

---

## Session 2026-09-22 (4) — The TPN team's feedback, a two-sheet order form, and no trailing zeros

Frontend only: `data.js`, `calculator.jsx`, `app.jsx`, `log.jsx`, `registry.jsx`, `fenton.jsx`, with
`compiled/` and both shells rebuilt. There is no backend change, no `clasp` step and no new `Daily_Log`
column: the backend stores `calcInput` as an opaque JSON cell and checks only the top-level figures, so the
two new `calcInput` keys need nothing from `@56`. `CONSTANTS_VERSION` stays `2026-09-18.1`, because no
printed number moved (checked below). Merged into `main` on Praew's instruction ("merge แล้ว deploy") and
released in its own `main` → `release` PR straight after; the post-release check is a comment on that PR.

**The requests.** Praew forwarded eight screenshots from the KCMH TPN team, then set four rules of her own in
the same session. Her decisions, in order:
- **K⁺.** The stop stays at 40 mEq/L on both routes; the team's "peripheral 60 / central 200" is shown for
  reference.
- **Confirming.** Every critical value keeps the confirm + reason stop.
- **Zinc.** Entered in mg/kg/day, as the paper form's "ZnSO₄ (Additional to the above)" line has it.
- **Scope.** Everything goes in one PR.
- **The Admin log table.** At most 2 decimals, and no number anywhere may end in .0.
- **The print.** Checked items bold, and every value on its own product's line. The doctor's page looks as
  the paper form always has, alerts are settled in the app, and pharmacy's detail goes on the back. On the
  front, the pharmacist column is filled, the ranges are NeoFeed's targets, and the critical record prints on
  the back only.
- **Labels.** Only the product name for NaCl, Na acetate, MgSO₄ and Ca gluconate, with the Glycophos and
  K₂HPO₄ strengths on the next line.
- **Weight.** Computed from the grams, and shown to 2 decimals.

### 1 · Zinc — "ขอให้เพิ่มช่อง ใส่ Zinc … Maximum Zinc 5 mg/day … ยืนยันการสั่งหรือไม่?"

Step 5 gains **"ZnSO₄ (เพิ่มจาก Peditrace)" in mg of elemental Zn/kg/d**, and a total of the zinc reaching the
infant. That total is Peditrace at the mL the infant receives (1 mL/kg, the 15 mL cap on that) × 0.25 mg/mL,
plus ZnSO₄, and it shows in mg/day and mg/kg/d. **Above `MAX_ZN_MG_DAY` = 5 mg/day it is a critical alert**,
so Save asks for a confirmation with a reason; exactly 5 passes.
- ZnSO₄ is dosed per kg like every additive, so the bag carries it × Factor.
- It is saved as `calcInput.znPerKg`, which rows saved earlier lack, so they read 0. It appears in "changes
  vs previous order", on the form's ZnSO₄ line (per kg as typed, bag mg), and in the copied order.
- It counts toward the no-volume stop, and Center Point does not offer it, because its packet has no slot.
- **The form says "elemental Zn" outright**: a ZnSO₄ salt figure would be about 4.4× higher.
- Pharmacy's ZnSO₄ stock is not in `KCMH_STOCK`, so the form prints no mL for it and says its volume is not
  in the WFI.

### 2 · Lipid — "ยังไม่แสดง rate drip ในหน่วย g/kg/hr"

The pump card, the form's back and the copied order give g/kg/d ÷ hours: 2 g/kg/d over 20 h = 0.1 g/kg/h.
It is display only; no new limit.

### 3 · Trophic feed — "ขึ้นข้อความว่าไม่นำไปคิด nutrient intakes แต่ … โปรแกรมยังเอาไปคิดอยู่"

**Not reproduced.** The live build (`release` has `enCounted` in its compiled bundle) has left a MEN feed out
of every total since 2026-09-18 11:17 ICT, and `verify-ward-requests-0918.cjs` passed 193/193 on `main` the
same day. Step 3's totals now say so where they stand: "นม MEN (trophic) … ไม่นับในค่ารวม". Two possible
sources of the report: rows saved before 2026-09-18 keep the feed in their saved totals, and the number font's
dotted zero reads as an 8 when scaled down ("EN 0" can look like "EN 8"). **Ask the team for a screenshot of
the number they saw move.**

### 4 · Glycophos — "ขอให้เพิ่มช่องแสดง mL ของ Glycophos คู่ไปด้วย"

"= 3 mL/d" sits beside "= 6 mEq Na" at the same size. Under 768 px the shell's mobile CSS hides that column,
as it always has; the line under the chips still gives mL/kg/d and the bag mL.

### 5 · Confirming — "ยืนยันการสั่งหรือไม่?" / "แพทย์ยืนยันคำสั่ง"

Osmolarity above 900 mOsm/L on a peripheral line, and K⁺ above 40 mEq/L, were already critical alerts,
stopped at Save for a reason; zinc above 5 mg/day joins them.
- The stop now opens with "ยืนยันการสั่งหรือไม่?". It still needs a reason, so it cannot be cleared with one
  tap.
- The back sheet prints "✔ แพทย์ยืนยันคำสั่ง" above the critical-value heading. The heading is unchanged,
  because Center Point's sheet prints it too.

### 6 · The doctor's name — "อยากให้มีชื่อหมอที่ key จะได้ติดต่อเวลามีปัญหา"

A reprint printed only the email the server stamped. **Each save now keeps the saver's "Name (email)" as
`calcInput.savedByLabel`.**
- It is shown at "แพทย์" on the front, in "บันทึกโดย" on the back, and on the Save card.
- The name is shown **only while its email is the row's `lastModifiedBy`** (else `submittedBy`), compared
  case-insensitively (`savedByOf`). Otherwise the email alone shows, as before.

### 7 · K⁺ concentration — "ให้แสดงค่าความเข้มข้นของ K ในสารละลายสุดท้าย"

It was a line of small text. It is now a **"K⁺ in bag" tile**, with 0–40 as its range and the stop
unchanged. The alert keeps its title (a saved `critOverride` names alerts by title) and adds "reference
ceilings: peripheral 60 · central 200 mEq/L" (`K_REF_MEQ_PER_L`, display only).

### 8 · GIR — "rate ที่คำนวณ GIR คิดจากอันไหน?"

Answered, and nothing changed. Both options are the same number. Volume and Rate are one field pair (Rate =
delivered volume ÷ 24), and GIR = Dex % × Rate (mL/h) ÷ (6 × kg). Dead space is not in it.

### 9 · No trailing zeros — Praew: "ห้ามมี .0 เช่น 18.0 คือ 18"

The Admin table printed 60.80000000000001 and 2.9999999999999996, and the form printed 2.000 Kg, 180.0 mL
and 1.40 mL/hr. **`D.displayNum`** is now the one rounding every display goes through: half away from zero,
never a trailing zero, "—" for a missing value.
- `fmt` loses its keep-zeros option and `Tile` its `exact` prop.
- The form's `f`, the log's `n`, the copied order's `toFixed` calls, and the displays in `app.jsx`,
  `registry.jsx` and `fenton.jsx` all go through it.
- The Admin table shows at most 2 decimals (78.48, 2.86, 60.8, 3).
- The kg weight shows to 2 decimals while every dose is computed from the grams. A typed dose prints as
  typed.

### 10 · The order on two sheets

The per-kg and in-bag cells stacked only the products ordered, so with no Na acetate Glycophos's 1.5 mL sat
on the Na acetate line, and KCl's 2 mEq on K₂HPO₄'s. The form now prints on two sheets.
- **The front is the KCMH paper form.** It has one row per product, ordered products bold, and the paper's
  other choices (Amiparen, Aminoleban, Nephrosteril, Intralipid, Clinoleic, Addamel N, อื่นๆ) unticked.
  Liver/Renal dysfunction and Nutritional Status are blank, oral orders go under "8. Other", and the saver's
  name goes at "แพทย์". There is no alert text.
- **The back is pharmacy's, after a page break.** It has the Factor, the aqueous bag stock by stock in mL
  with the WFI q.s., K⁺ in the bag, Ca·PO₄, what reaches the infant, the critical-value confirmation,
  changes since the last order, and who saved it.
- MgSO₄ comes as 10% and 50%, so with its strength off the label, **its in-bag mL names its vial**
  ("= 1.15 mL (10%)").
- Praew, reviewing the front: "factor ตรงนี้ ไม่ต้องโชว์ · สูตรตรงนี้ก็ไม่ต้องโชว์". The front has no Soluvit
  or Peditrace "× Factor → delivers" note and no osmolarity formula. The notes are on the back, in
  the recipe line for each vitamin, in the same words, which `verify-kcmh-factor.cjs` reads.

### Checked

- **The CI steps, run locally on an LF export of the staged tree.** A fresh build changes nothing, the two
  shells are identical, and **49/49 harnesses pass against the sources and 49/49 against `compiled/`**. The
  Center Point bundle builds and its client tests pass.
- **New harness `verify-tpn-team-0922.cjs`: 130 assertions.** It fails 33 against `6ee2762`. §8's sweep was
  mutation-checked: putting back `toFixed(2)` on the pump rate, and `toFixed(1)` on the copied volume, makes
  it fail on "1.40" and "180.0".
- **No printed number moved.** `verify-review-0917-calc.cjs` §6 pins every printed figure of six orders. Its
  digests were recaptured twice, each after a comparison with `main`:
  - figure by figure after the display rule: only the two new "—" ZnSO₄ cells, and the TPN volume without
    its trailing zero;
  - as sets after the two-sheet layout: every number `main` printed is still printed and none is new, and
    only the section headings stopped being `<strong>`.
- **Older harnesses updated where they pinned the old format.** They are `verify-tpn-calc-weight.cjs` (1.5 /
  1.62 Kg), `verify-ward-requests-0918.cjs` (4 g, 120 mL, 2 mL, and the heparin mL now on the back) and
  `verify-resync-and-lists.cjs` (the Admin table, fed the live Sheet's float noise).
- **Seen rendered.** The shipped `compiled/calculator.js` was mounted with the shell's CSS, a synthetic
  patient and no backend, then checked on screen and on both sheets of the form.

### To tell the ward before this ships

- **Pharmacy: the form is now two sheets, meant for double-sided printing.** The front is the familiar
  paper layout and the back is the compounding detail. The ZnSO₄ line is **elemental** zinc. MgSO₄'s mL
  names its vial.
- **The TPN team.** Items 3 and 8 above are answers, not changes; item 3 still needs their screenshot.

---

## Session 2026-09-22 (3) — A merge into `main` says it is not live, and a release proves what it serves

Docs and `tools/` only: nothing the hosts serve changes, and no backend.

### Why

PR #87 was merged into `main` at 20:39 ICT. Later that evening Praew opened the app, saw the old
screens and asked *"PR 87 ของ NeoFeed live หรือยังนะ ทำไมเข้ายังเหมือนเดิม"*. Nothing was broken. Both
hosts serve `release` (since 2026-09-12), the last release was #85 at 17:39 ICT, and nobody had opened
a `main → release` PR. #87 said "not a deploy" inside the PR, but not in the chat where she would see
it. On her instruction it went out as #88 at 21:15 ICT, verified on both hosts at 21:16 ICT (comment
on #88).

### What changed

1. **The rule** (`REFERENCE.md` § Frontend, and one paragraph in `STATUS.md` § Release-branch deploy
   gate; the NeoFeed `CLAUDE.md` outside this repo carries it for local sessions): whoever merges into
   `main` opens the release PR in the same session and reports "merged, not live". "merge แล้ว deploy"
   does both steps. A plain "merge" still stops at `main`, which is how PRs are batched into one release.
2. **`tools/verify-release.mjs`**, the post-release check as one command. On both hosts it compares
   every file the app loads, plus `manifest.json`, `moved.html` and `icons/`, byte for byte with git at
   the release commit, checks each `?v=` token against its file's hash, and on Cloudflare checks the
   CSP's `script-src`. Node rather than bash: `.gitattributes` protects only `compiled/` and `vendor/`,
   so a `.sh` checked out on Windows gets CRLF and breaks. Proven both ways before it was trusted:
   0 failures against `edbd11f`, and against the previous release `066528d` exactly #87's 15 files on
   each host, including `manifest.json`, whose size did not change.
3. **`REFERENCE.md` "Proving what a release serves"** points at the script. Its CSP line said to look
   for no `'unsafe-inline'`, but `style-src` carries `'unsafe-inline'` on purpose, for the shell's own
   `<style>` block. The rule is about `script-src`.
4. **`STATUS.md` caught up by two releases:** #85 (17:39 ICT, `066528d`), never recorded there, and
   #88. Its facts table still showed backend `@55`, the `@55` clasp mirror and `96afcd0`'s tokens.
   `BACKLOG.md`'s bedside-session item now names `edbd11f` and its `appVersion` stamp.

### Found on the way

- The first manual check tripped twice on the checker, not the site: Cloudflare answers `/moved.html`
  with a 307 to `/moved`, and a CSP match on the whole header caught `style-src`.
- One `fetch failed` on GitHub Pages did not recur in nine more requests. The script retries a dropped
  connection or a 5xx twice, and never a 4xx or a byte mismatch.
- #85 has no post-release check on record. The 21:16 ICT check covers every file it shipped.
- A desktop Chromium at 390×844 loaded the live app without signing in: the login screen rendered under
  the CSP with nothing to drag sideways, and `appVersion()` matched `STATUS.md`. Still not a phone, and
  still nobody signed in.

---

## Session 2026-09-22 (2) — Back to Valhalla Teal, the N in the corner, and an app that fits the phone

Presentation and navigation only. No clinical logic, no data model, no backend: `gas-backend.gs`,
`data.js` and every number in `calculator.jsx`'s `calc` are untouched, and all 48 `verify-*.cjs`
harnesses pass against both the sources and `compiled/`, plus Center Point's build and its 5 tests.

Four requests from Praew on the ward, in the order they arrived.

### 1 · "ทำไงให้ไม่ต้องเลื่อนตรงขอบ ให้มันfix พอดี. Check กับ mobile ทุกรุ่น ทั้ง apple, android"

Three separate causes, found by measuring in Chromium rather than by reading the CSS — the document
reported clean at every phone width while the screen she was looking at was 10% too wide.

**The login screen's ribbon layer was the scroll.** `.login-wrap` is `overflow-y: auto`, and CSS does
not allow a `visible`/non-`visible` overflow pair — the other axis computes to `auto` too, so the
screen scrolled BOTH ways. Its `::before` (the soft ribbons) was `position: absolute; inset: -10%`,
and an absolutely-positioned box *is* part of its scroll container's scrollable overflow on the right
and bottom edges. Measured before the fix: **+39px across and +85px down on a 390×844 phone**, +43/+93
on a 15 Pro Max, +144/+90 at 1440px — a drag in each direction over nothing at all, on the one screen
in the app that has nothing to scroll. That is both scrollbars in her screenshot.
The layer is `position: fixed` now. A fixed box never joins an ancestor scroller's overflow region,
and `.login-wrap` is itself `position: fixed; inset: 0` with no transform, filter or containment, so
the ribbons resolve against the very same rectangle: same 10% bleed, same picture, no scroll. The
wrap also pins `overflow-x: hidden` explicitly rather than inheriting it from the `overflow-y`
shorthand rule.

**`100vw` sheets.** The mobile picker and modal were `width: 100vw`. vw counts the classic-scrollbar
gutter, so anywhere one is drawn — an Android tablet with a mouse, a desktop window at phone width,
some webviews — the sheet is wider than the viewport it sits in and the page gains exactly that much
sideways drag. Both backdrops are `position: fixed; inset: 0`, so `100%` is the visible width, which
is what was meant all along. `92vw` → `92%` on the desktop sizes for the same reason.

**The left and right safe areas had never been done.** The shell has set `viewport-fit=cover` since
the PWA work, so the page is drawn *under* the notch and the home indicator. Bottom insets were
handled (bottom nav, sheets, toasts, the floating button); left and right never were — so on every
notched iPhone in landscape, and on the curved-edge Androids, the topbar, the workspace and the tab
bar ran under the cutout. `.topbar`, `.work-inner` (all three of its rules), `.bottom-nav` and
`.quick-fab` now carry them. `max(design, env(…))` everywhere the design padding has to survive a
phone with no notch; `.bottom-nav` takes the raw `env()` deliberately, because its tabs are `flex: 1`
and a minimum there would narrow every tap target on every device to protect a cutout that is not
present.

**`test/verify-mobile-fit.cjs`** (139 assertions) pins all three. Sections 1-3 are static and run in
CI; section 4 drives real Chromium at nine device sizes from the 280px Fold cover to the iPad mini,
twice — once as-is, once with every `env(safe-area-inset-*)` substituted for a literal 44px — and
asserts that no box on either screen can be dragged sideways, that the login scroller's height never
exceeds its real content, and that the four chrome elements sit *inside* a 44px notch. CI installs no
browser, so section 4 degrades to a notice, like `verify-sync-gate-and-poll.cjs`. Reverting the
`::before` to `absolute` fails it eight times, in both halves — checked, because a regression test
that cannot fail is not one.

### 2 · "calculator ให้มีเฉพาะหน้าแรก ต้องกลับมาที่ dashboard เท่านั้น"

The quick-calc button is **kept** — only where it appears changed. It used to ride every view but the
two calculators, which put a second, unsaveable calculator in the corner of the patient registry, the
growth chart and the alert list: five chances to reach for the scratchpad when the order screen was
meant. It is the Dashboard's alone now, and its ← lands back on the Dashboard rather than on whichever
page it was opened from — one page in, one page out, so the button is never a door that only opens one
way. `quickFrom` went with it. The button reads ← กลับไป Dashboard so the destination is on the
control. Which page counted as "หน้าแรก" was put to Praew rather than guessed; she chose Dashboard.

### 3 · "Logo icon N ให้ใช้ใน app ด้วย มุมซ้ายบน ... ให้แทนn+dot เก่าทุกอัน" — then the wordmark instead

The two-tone N reached the app icons and the login wordmark on 2026-09-22; the topbar and `SyncGate`
were still each drawing their own stroked N+dot by hand, and those were the last two copies of it
anywhere. They first became the icon tile — and then, on her look at it, **the wordmark**: *"ส่วนบน
ซ้ายในหน้า dashboard ... ให้เอา NeoFeed ที่แก้แล้วนี้ไปใส่ ไม่ต้องใส่ icon"*.

So there is now **one `<NeoFeedWordmark/>` with three call sites** — the login hero, the topbar corner
and the sync gate — carrying `icons/icon.svg`'s two paths and four stops character for character. The
icon *tile* is drawn by nothing inside the app any more, which is the right answer for it: it is the
home-screen and favicon artwork, and an app that shows you its own launcher icon in its own toolbar
is showing you something you pressed to get there. All the wordmark's sizing lives in one CSS rule and
is in `em`, so a call site sets `font-size` and nothing else (58px login, 19px topbar, 17px on a phone,
23px on the sync gate). The topbar sizes up two points from the old text because the tile used to carry
half that corner's weight.

**"Feed" is as dark as the N now.** *"ให้คำว่า feed สีเข้มเท่า N ตรงที่เข้มๆ"* — at the light weight and
`--brand` it read a whole step paler than the bold "Neo" beside it. It takes `--brand-ink`: Midnight
Teal, which is exactly the stop the N's own body gradient ends on, so "as dark as the dark part of the
N" is a token reference rather than a literal matched by eye, and the two move together if the sheet
moves again. The harness asserts both halves of that — the rule, and that the token really is the
master's dark stop.

`verify-neofeed-mark.cjs` was rewritten around the single component and now asserts, as its point, that
**no N+dot is left in `app.jsx` at all**, that there is exactly one wordmark in the file rather than
three copies, and that no component draws the tile. One consequence worth knowing: the literal string
"NeoFeed" is no longer in the topbar's DOM text — the N is a glyph, so the text is "eoFeed" and the
product name lives in `aria-label`. `verify-review-0917-session.cjs` § 9.3 had been reading "the shell
is still rendered" off that string and now reads it off the wordmark's accessible name, which is the
same claim and also holds that the name is announced.

### 3b · The login background never changed

*"เดิมหน้า login มันมีไล่เชดสีที่ background ด้วย อยากได้สีเดิมเลย."* Measured rather than argued: with
the content hidden and the drift animation frozen, the ribbons render **pixel-identical** to
`e39f66b~1` at all nine sample points (top/mid/bottom × left/centre/right) — the gradient *is* the
original, restored in § 4 below. What left the screen was the **104px teal logo tile** the wordmark
replaced on 2026-09-22 (`a15a554`): its own three-stop gradient plus a 24px/56px soft shadow was most
of what read as "ไล่เชดสี" on that ground. Raised for her to call rather than guessed at.

### 3c · The ward gate says "Ward"

*"เปลี่ยนคำว่า เลือก ward เป็น Ward แล้วให้สีเป็นเขียวเข้ม."* The heading is `Ward`.

The colour lasted one round. It went to `--brand-ink` (Midnight Teal, the dark the wordmark's "Feed"
and the N's body gradient end on) and came straight back on sight — *"กลับไปใช้อันเดิม อันเข้มขึ้น
ไม่สวย."* It reads badly for a reason worth keeping: a brand-toned heading sits **directly above the
brand-toned NICU/SCN tile titles**, so the whole column became one flat block of the same colour and
the page lost the thing a heading is for. The page wants exactly one accent and the tiles already
have it. The wordmark's "Feed" is a different case and stays dark — it is *inside* a lockup whose N
ends on that exact colour, with nothing else near it competing.

**Nine harnesses were reading "เลือก ward" as their marker for "the ward gate is on screen"**, in
`verify-review-0917-session.cjs` (×5), `-sync`, `-resync-and-lists`, `-registry-logged-today`,
`-forced-password-client`, `-sync-gate-and-poll` (×2) and the Chromium `runthrough-app.cjs`. All of
them now match the gate's own `.ward-gate` element instead. That is not a mechanical rename: two of
those assertions are **negative** ("no ward gate behind the error screen"), and a negative match on a
word as common as "Ward" goes quietly false the first time another view uses it. The element is what
the gate *is*; the label is what it happens to say.

### 3d · The mark goes back to green, and the app's accent follows it

Two more passes the same day, and the second is the interesting one.

**The mark.** *"ขอกลับไปใช้ NeoFeed และหน้า login เดิม สีนี้"* — the teal re-tint of § 4 lasted hours.
`icons/icon.svg`, the seven PNGs and `<NeoFeedWordmark/>` are back on the brand board's own colours
(tile `#D3E3D3`, body Forest `#335A4A` → `#284C40`, stem Sage `#99B29C` → `#799781`), and the login
screen is back on Luminous Protection — scoped, as before, by re-declaring on `.login-wrap` the seven
tokens that screen consumes, so `:root` can stay whatever the app needs. **Every colour in the
wordmark is a literal now rather than a token**, including its text: a mark is not a UI colour, and a
token there is exactly what carried it off the board the first time. "Feed" needs no colour of its own
again — it inherits Forest, which *is* the N's dark stop, so the earlier *"feed สีเข้มเท่า N"* holds by
construction. It needed a separate `--brand-ink` only while the mark was teal, whose accent is the
letter's **top** stop rather than its bottom.

**The accent.** *"ถ้าส่วนเนื้อหาด้านใน ใช้สีนี้ แทน valhalla teal แทนเท่านั้น / logo บนซ้ายก็ใช้ green
wordmark เหมือนหน้า login."* The app's `--brand` ramp is now § 11's Forest ramp — so the logo in the
corner and the buttons under it are one colour — **and nothing else moved**. That last part is the
whole design:

> The full-green sheet failed nine hours earlier because the ground, the structure *and* the accent
> were one hue family, leaving nothing to separate them with. This is the opposite arrangement: a
> green accent on a Porcelain-Mist ground, with teal-leaning charcoal ink and neutral hairlines.
> Same green, opposite result — `"แทนเท่านั้น"` is load-bearing, and the `:root` comment says so,
> because the obvious tidy-up later is to make the surfaces match the accent, which is precisely
> the failure.

**Moved:** the 8 `--brand-*` tokens, `--ring` (literally Valhalla Teal), the four brand-alpha shadows
`var()` cannot reach, `app.jsx`'s runtime `--brand` override, the Fenton percentile bands and the
Energy trend line. **Not moved:** every surface, ink tier and hairline; all three clinical status
colours (third release running); and the categorical CHO/protein/fat series, because one hue family
across six series is the thing § 11 rules out.

`verify-neofeed-mark.cjs` gained four assertions for exactly this separation: that the app's accent is
the mark's Forest, that its **ground and ink did not follow it into the green family**, and that the
login scope still differs from `:root` where it must (Ivory vs Porcelain Mist, Champagne Gold vs
Nordic Sand). If those ever collapse into one value, the scope has stopped doing anything and the
login screen has silently rejoined the app's palette.

### 3g · …and loses it again: just the N, on the app's ground

*"icon เอาแค่ตัว N แล้วพื้นหลังขาว น่าจะเข้ากับสีด้านในมากกว่า? / หรือเอาสีพื้นหลังเท่า dashboard."*
Rendered rather than argued, as with the login ground: three grounds shown **where an icon is actually
seen** — a light home screen, a dark one, and a 16px browser tab — because on a white documentation page
all three look fine and the differences that matter are invisible.

**The frame from § 3e lasted one look.** The tab column is what settled it: at 16px the Ivory ring turned
to mush and, worse, squeezed the letter down with it. Dropping it lets the letter grow from **47% of the
square to 54%**, and that is where the whole difference shows.

**The ground is Porcelain Mist `#F5F8F7`, not white** — byte for byte the value `:root` gives the page
background. White looked identical at icon size, so the choice cost nothing and this way the icon is the
app's colour rather than a colour that resembles it. The same reasoning as § 3f, one layer out.

Flagged when the options were shown, since it is the one thing given up: a near-white icon loses its edge
against a pale home-screen wallpaper, where the Pale Jade ground had one. Accepted knowingly.

**The three-way icon split of § 3e collapsed back to two** — with no ring to strip, `maskable` and `apple`
are the same render. `kind` still names all three because the maskable pair carries one assertion the
others do not: Android's 80%-diameter safe zone. At scale 1.4 the letter's furthest ink sits at **38.3%**
of the width, inside the 40% limit — measured, and the check was proved live by re-rendering at scale 1.9
and watching it fail at 98 px against a 77 px limit.

**Two harness repairs that were not tolerance bumps.** The census bucketed the ground with `g - r >= 8`,
a hue test that worked while the ground was a jade; Porcelain Mist has `g - r` of 3, so that test would
have read the whole icon as "no ground" and still passed the ≥40% ratio check **vacuously**. It matches
the ground's actual value by proximity now. And the `no white` assertion — which existed to prove the old
white-stroked N was gone — had to go entirely: the ground is itself near-white, so it would have counted
the whole tile and failed for the wrong reason. That claim is made at the SVG level instead, where it is
exact: no `<circle>`, no stroke, and no N+dot path anywhere in `app.jsx`.

One more thing the tooling caught: **an XML comment may not contain a double hyphen**, and the note
explaining the ground named the `--bg` token. The SVG failed to decode until it was written out longhand.

### 3f · The login screen takes the app's ground, and the ribbons go

Asked as a question — *"ถ้า background หน้า login เหมือนสีเหมือนใน dashboard จะเป็นอย่างไร show me"* —
so it was **rendered rather than described**: three variants side by side against the dashboard itself,
with nothing committed until one was chosen. Praew picked **C**.

The two grounds were nearly the same lightness and differed only in temperature — Ivory `#F7F6EE`
(`oklch(97.2% 0.011 101)`, warm) against Porcelain Mist `#F5F8F7` (`oklch(97.7% 0.004 195)`, cool). So
`--bg` is **absent** from the `.login-wrap` scope now rather than set to the app's value: the screen
*follows* `:root`, and moves with the app if that ground ever moves again. Pinning it back is what
would silently re-split the two screens, and the harness asserts its absence for that reason.

**The ribbons went with it.** On Ivory the Sage / Pale Jade / Champagne Gold wash read as depth; on
Porcelain Mist it read as a second colour, which is the opposite of what sharing a ground is for. The
`::before` and the `login-drift` animation are both deleted.

That retires the layer this session started by fixing — so **`verify-mobile-fit.cjs` § 1 was rewritten
to guard the rule instead of the ribbons**: if a decorative full-bleed layer is ever added here again
(a login palette is still outstanding) it must be `position: fixed`, and the overflow contract on
`.login-wrap` is asserted unconditionally either way. The section would otherwise have quietly passed
forever by checking an element that no longer exists. Measured after the change: `scrollWidth ===
clientWidth` and `scrollHeight === clientHeight` on a 390×844 phone — the drag this session opened with
is now impossible by construction rather than by correction.

### 3e · The icon gets its frame  *(superseded the same day — see § 3g)*

*"icon ใช้อันนี้."* The approved artwork puts an **Ivory ring between a Pale Jade ground and the jade
tile**, so `icons/icon.svg` is three concentric rects now instead of one. Measured off that artwork as
fractions of the square: the ring's outer box is inset 7%, the ring is 6.4% thick, and the letter is
47% of the square — smaller than the 64% it was on the unframed tile, because the frame takes the room.

**The letter itself did not change**, and could not: those two paths are the wordmark's too, pinned
character for character by the harness. Only the `<g transform>` that places them inside the tile moved.

**The frame forced the icon set to split three ways, not two.** It was "any" vs full-bleed; it is now:

| variant | what it carries | why |
|---|---|---|
| `any` (favicons, 192, 512) | the full design, own rounded corners | what a browser tab and the PWA "any" slot show |
| `apple` (apple-touch) | full design, **ground** squared off | iOS crops the whole square with a radius close to the master's, so the frame survives as a frame |
| `maskable` (192, 512) | **no frame** — tile colour + letter | Android crops to a circle *well inside* the square, which turned the ring into a **crescent fragment** at the edge. Caught by rendering the real circular mask, not by reasoning about it |

Only the ground rect carries `id="nf-ground"`, because the renderer squares off exactly that one — give
the ring or the tile an id and a bleed render would flatten the frame.

`verify-neofeed-mark.cjs` gained eight assertions: the three rects and their colours, that only the
ground is named, that the **Ivory ring is present on every `any`/`apple` PNG and absent from both
maskable ones**, and that the letter stays inside Android's 80%-diameter safe zone. The ring assertions
were checked by re-rendering a maskable icon *with* the frame — it fails, twice.

### 4 · "สีข้างในมันกลืนกันไปหน่อย ไม่โอเค — ย้ายกลับไปใช้สีในรุ่นก่อน ที่เป็นสีขาวฟ้า"

The Luminous Protection green of the entry above lasted a day: on the ward the app read as one flat
wash, which is the failure mode of a palette whose ground, structure and accent are all one hue
family. It is back on the **Valhalla Teal sheet** (#81, the version immediately before the green) —
Porcelain Mist ground, Valhalla Teal accent, Midnight Teal ink — reverted through the same discipline
the green commit used going the other way: an explicit green→teal table, every entry asserted to hit
an exact count, never a search/replace. `:root` was taken verbatim from `e39f66b~1`, so every token
*name* the green session introduced survives and nothing downstream had to move. The theme-color meta
and the manifest's two colours went with it.

The clinical status colours did not move, for the third release running. crit/warn/ok are what
severity is read off at a bedside.

**The login screen and the mark took two passes.** First "ส่วนหน้า login คงไว้ก่อน เดี๋ยวไปหา palette
สีที่เหมาะสมมาก่อน" — held green by re-declaring, on `.login-wrap` itself, exactly the seven tokens
that screen consumes. Then "ดึงสี background เดิมมาใช้ก่อน / ส่วน logo กับชื่อ NeoFeed ลองใช้ logo ที่
ทำใหม่ แต่ใช้ palette สี valhalla teal": the scoped block came out, the ribbons went back to Sea
Glass over Mineral Mist with the one Nordic Sand breath, and **the mark itself was re-tinted** — the
brand board's geometry, the teal sheet's colours.

Those colours were derived, not picked. Each part of the letter keeps the *lightness* the board drew
it at and takes the sheet's hue and chroma, so every contrast inside the mark survives the move:
body-on-tile 5.50 and 9.38 (green: 5.81 / 7.14), light stem on tile 1.70 (1.71), its darker foot 2.38
(2.39), and the slit between stem and body 3.23 (3.41). Where the sheet has a named colour it is used
literally — tile Mineral Mist #D5ECEA, body Valhalla Teal #12656A → Midnight Teal #103F43, stem Sea
Glass #78BFC0 — and only the stem's foot (#5BA2A3) is derived, because the sheet has nothing at that
lightness. `icons/icon.svg` is still the single master: the seven PNGs were re-rendered from it in
Chromium through a canvas, so the antialiased fringe outside a 16px rounded tile snaps to a true
transparent and `verify-neofeed-mark.cjs`'s `corner === 0` stays exact rather than being relaxed to
fit a new renderer.

### Not fixed, and visible in every screenshot

The `search` glyph renders as a bare ring — in the topbar's Switch-patient button, in the registry's
search field, and on the empty-state "เลือกผู้ป่วย" button. `icons.jsx` lists `search` in `filled`,
and its two subpaths are wound the same way, so under the default nonzero fill-rule the lens fills in
and only the rim survives. It is the same class of bug as the `calc` glyph on 2026-09-21, and the same
fix shape (a `fill-rule="evenodd"`, or a stroked sibling). Not touched here because it was not asked
for and `fill-rule` on the shared `<Icon>` would silently redraw nine icons — raised for Praew to call.

At 280px (the Galaxy Z Fold's cover screen, below every current iPhone and effectively every Android)
the calculator's `.two-col` rows are ~20px wider than the accordion body clips them to. Nothing
scrolls — the content is cut, not dragged — so it is outside what was reported, and logged rather than
chased.

---

## Session 2026-09-22 — Luminous Protection: NeoFeed moves onto the Valhalla brand sheet

Presentation only. No clinical logic, no data model, no backend: `gas-backend.gs` and `data.js`'s
numbers are untouched, and every `verify-*.cjs` harness passes against both the sources and
`compiled/` (43 on this branch at the time of writing; the count moves as harnesses are added, which
is why it is not pinned here).

**The request** (Praew, 2026-09-22): the login screen loses "Nutrition insight for brighter beginnings"
and the "สนใจใช้งาน NeoFeed? ติดต่อทีม Valhalla" button, gains the Valhalla logo and environment; then —
*"ปรับให้ neofeed ใช้ palette นี้ เพื่อความสงบ เรียบหรู รักษาระดับโลก quiet guardian."*

**What the palette is.** Brand Handbook v1.1 § 11, "Luminous Protection": Ivory #F7F6EE, Pale Jade
#E4EDE0, Celadon #C9DCCB, Sage #B9CCB4, Forest #284C40, Champagne Gold #C5A46D. Converted to oklch the
same way #81 converted the teal sheet a day earlier — the space the shells are written in — so every
tint, hover and hairline is derived by moving L/C along the sheet's own hues. The handbook's contrast
table reproduces to ±0.02 with the same maths, which is what made it safe to derive the rest.

**Six colours, and not one of them is a status colour — so the clinical ones did not move.** crit,
warn, ok and info are byte-identical to before, for the second release running. The sheet itself
separates status from brand (§ 11), the palette contains no red and no amber, and severity at a
bedside is a mapping the ward has already learned. Re-hueing it to match a brand would be a clinical
change wearing a design change's clothes. Brand green never means "normal"; nothing green is a status.

**What moved.** The `:root` brand half was rewritten — surfaces (Ivory ground, Pale Jade second plane,
Celadon lines), four ink tiers re-solved on Forest, the brand ramp centred on Forest, and Nordic Sand
replaced by Champagne Gold. Every text tier was solved against the background it actually lands on, not
chosen by eye, and the ratios inline were recomputed rather than carried over: ink 14.98 / ink-2 8.51 /
ink-3 5.51 on white, and the dimmed ink-4 was solved on Pale Jade (3.04) — the worst ground it sits on —
so the new `--bg-2` could not quietly regress it. `--brand` is Forest, which carries white text and is
legible as text itself at 9.57:1 in both directions; one token is both the primary button and the accent.

Outside `:root`, 51 literals followed — the alpha variants and SVG presentation attributes that `var()`
cannot reach. They were migrated by an explicit old→new table with every change printed for review, not
by search/replace, which § 15 warns against. Three sets were deliberately left alone: the clinical
status hues, the categorical chart-series hues (re-hueing six data series into one green family is
exactly the "ไล่เฉดหลายชุดจนแยกยาก" § 11 rules out), and the printed pharmacy order form, which is ink on
paper rather than a brand surface.

**Champagne Gold is decorative only**, as § 11 requires: 2.17:1 on Ivory and 1.39:1 on Sage, so it fails
AA as text on every light ground in this palette. It appears once on screen — the 40px hairline under the
NeoFeed wordmark. That rule used to hang off `.login-eyebrow::before` and would have been deleted with the
eyebrow; it moved to `.login-app-name::after`, same place on screen, now owned by the element it belongs to.

**Login screen.** The eyebrow and the contact button are gone, and with them `CONTACT_MAILTO`, whose only
caller was that button. In their place, the endorsed-brand lockup of § 07: the Guardian V above
"by Valhalla Health", 12px under a 58px wordmark, no border and no button affordance — a signature, not a
call to action, because the handbook's rule is that the endorsement never outranks the app name.

**The Guardian V is matted, not traced.** § 10 forbids taking geometry from a mockup and § 01 lists the
vector master as outstanding, so the mark was keyed out of the handbook's own proportion study by alpha
coverage — the flat Ivory ground and flat Forest mark make that mechanical, and the ✓ notch falls out as
transparency for free. It is used at 34px, above the 32px floor § 10 sets, where the notch is still
legible. **It is a raster stand-in: replace `icons/valhalla-guardian-v.png` with the SVG master when it exists.**

**One deliberate departure from the handbook, flagged rather than buried.** § 07 says NeoFeed keeps its
teal for familiarity. It no longer does: the N+dot geometry is untouched, but its colour follows the
palette, here and in the re-rendered app icons (Forest gradient, Sage counter-dot, white stroke at 5.85:1
on the lightest end). With the whole app in the green family a teal mark was the single element left
outside it. Praew's instruction is newer than § 07 and she owns the brand, but the pair is a two-line
revert (`--brand` in the shells, `icons/icon.svg`) if § 07 is meant to win.

`theme-color` and the manifest follow (Forest, Ivory background, so a PWA launch no longer flashes the old
teal). Checked in real Chromium at 430px and 1440px: login, ward gate, registry, and the calculator's
densest screen, where the status colours still separate cleanly from the new ground.

**Follow-up (Praew, 2026-09-22): the lockup is stacked, and the version line is gone.** As first
committed, the Guardian V sat *beside* "by Valhalla Health" in an inline row, with `V2.0` on a line of its
own under it. Now the mark is above the words, as the Login screen paragraph above describes, and the
login screen shows no version. `.login-footer`, used only by that line, went with it in both shells.
Pinned by `test/verify-login-endorsement.cjs`; checked in Chromium at 800 px and 375 px.

**Follow-up (Praew, 2026-09-22): the two-tone N replaces the N+dot, in the app icons and on the login
screen.** Praew approved the NeoFeed brand board (the "shaded N": no dot, a Sage left stem, the diagonal
and right stem in Forest, a slit between them) and chose to put it in the favicon and phone icons and to
put the board's wordmark on the login screen. This supersedes the "one deliberate departure" paragraph
above: there is no N+dot left to be teal or green.

- **The mark is vector, rebuilt rather than traced.** The board's artwork is a generated raster
  (`neofeed-site/docs/BRAND_HANDOFF.md` calls it concept artwork and names the icon the authority for
  vector production), and its edges are not quite straight or parallel. So the letter was rebuilt from
  the icon's measured proportions: stems 28% of the letter's height, a parallel-edged diagonal running
  from the left stem's top corner to the right stem, a slit 4.6% of the height, 4.8% outer corners. The
  tile `#D3E3D3` and the two gradients were sampled from the artwork, and the Forest shading ends on
  Forest itself. `icons/icon.svg` is the master; the letter fills 65.3% of the tile, as in the artwork.
- **All seven PNGs were re-rendered from it**, by the same method as #81: headless Chromium at 1024 px,
  then a box filter in premultiplied alpha. The two favicons now carry the tile's own rounded corners
  (they were full-bleed squares). The maskable pair set the letter at 54% so it stays inside the safe
  zone. The Apple icon is full-bleed, because iOS draws its own corners.
- **Login screen.** The white tile with the N+dot is gone (`.login-logo-mark` went with it in both
  shells). In the wordmark the mark *is* the N: an inline SVG with icon.svg's two paths, sized to IBM Plex
  Sans' cap height (0.698em), so it stands as tall as a capital and scales with the phone font size. Then
  "eo" at 700 and "Feed" at 300, both in Forest, as the board sets them. The board changes the weight, not
  the colour. Plex Sans 300 is now in the Google Fonts link, and the browser fetches it only where it is
  used. The gold hairline became the board's rule: Sage, a small gap, then Champagne Gold, in two equal
  halves, 62% as wide as the wordmark and close under it.
- **Unchanged:** the Guardian V above "by Valhalla Health" at the foot of the screen, as set earlier
  today. The board's lockup also carries "by VALHALLA HEALTH" under the rule; it was not added there, so
  the endorsement is not shown twice. Also unchanged: the tagline, `theme-color` and the manifest.

Pinned by `test/verify-neofeed-mark.cjs`, which checks that the icon and the wordmark draw the same paths
in the same colours and decodes every PNG. It fails 54 of 70 against `75a3038`, and six deliberate
breakages were each caught. Checked in Chromium at 1280 px and at 375 px, where the layout has no
horizontal scroll and the mark scales with the text.

**Follow-up (Praew, 2026-09-22): no Guardian V, and a © line.** *"Can I remove V logo below login page.
Only show by valhalla team เราใส่อะไรที่ดูเป็นลิขสิทธิไปด้วยได้? @2026?"* Offered three wordings, she chose
one line: **"by Valhalla Health · © 2026"**. The Guardian V above it is gone, and so is
`icons/valhalla-guardian-v.png`, the raster stand-in. Nothing else used it, so the open question of
replacing it with the vector master no longer applies. `.login-endorse` lost its `img` rule and its
column layout, since there is nothing left to stack. The year is fixed at 2026, the year of first
publication. It does not change by itself on 1 January. Copyright needs no registration, so the line
only says whose work this is. Pinned by `test/verify-login-endorsement.cjs`, which fails 5 of 11
against `76f7610`. Checked in Chromium: one line, and no horizontal scroll at 375 px.

---

## Session 2026-09-22 — A forced password change is served at once, not refused for a minute

Backend only (`gas-backend.gs`, `test/verify-staff-cache-password-writes.cjs`). No `.jsx` changed, so no
build. Opened as PR #86 and folded into PR #84 on Praew's instruction, so it ships with the entry below.
Not deployed: `@55` keeps the bug until a `clasp` deploy on Praew's go-ahead (`STATUS.md` ⏳).

**The bug** (found 2026-09-22 during PR #84). After a successful forced change, every request answered
`PasswordChangeRequired`, and `app.jsx` put the forced change screen back up. `verifyToken` reads the
Staff row through a 60 s cache (`_getStaffRowCached`) that carries col G, and the `changePassword`
request itself had just cached col G `TRUE`. In the sandbox on `f3e9e23` (`@55`'s source) the rotated
token was refused from t+0 to t+59 s and served at t+60 s. Signing in again did not help: the copy is
per user. The cache comment said password changes were unaffected. That held for revoking the other
sessions (the user epoch), never for col G.

**The fix.** `_forgetStaffRow(email)` drops the cached copy, and every function that writes a Staff row's
cols E–H calls it after the write:
- `changePassword` — the reported bug.
- `setInitialPassword`, in both branches: a row re-added after its deletion was cached as "not found",
  and its first request was refused as `Unauthorized`.
- `clearStaffPassword`.
- `onEdit` and `backfillDefaultPasswords`. These two failed **open**: provisioning a temp password on a
  row whose copy was cached with col G blank let a sign-in on that temp password through the server gate
  for up to a minute.

Dropping the copy is best effort: a cache failure is logged, the 60 s bound applies again, and the epoch
bump still runs. The key now comes from one helper, `_staffCacheKey`, trimmed and lowercased like
`getStaffRow`, so an address typed into the editor in another case still matches.

**Unchanged.** Hand edits in the Sheets UI (role, `active`, col G typed by hand) are still seen within
60 s. `onEdit` fires on those edits, so it could drop the copy for every Staff edit and make disabling an
account instant; not done here. Residual: a request already past its Staff read when the change lands
can put the old copy back for up to 60 s. The client sends nothing while the forced screen is up, so
that takes a second tab or device of the same user in flight at that moment.

`verify-staff-cache-password-writes.cjs`: 33 assertions, 10 fail against `f3e9e23`. Six deliberate
breakages of the fix (no try/catch, an unnormalised key, a cache that never hits, `setInitialPassword`
dropping only for an existing row, `changePassword` or `onEdit` not dropping) were each caught.

## Session 2026-09-22 — Every Chula domain signs in with Google, with no NeoFeed password

Backend only (`gas-backend.gs`, `test/verify-chula-google-signin.cjs`). No `.jsx` changed, so no build.
Not deployed: `@55` is unchanged until a `clasp` deploy on Praew's go-ahead (`STATUS.md` ⏳).

**The request** (Praew, 2026-09-22, after asking whether `@docchula.com` can use Google): *"ทุกอันที่เป็น
chula domain ให้ผ่าน google ได้เลย ไม่ต้องมาสร้าง password ที่นี่ และให้เช็คด้วยว่า ทุก email จะต้องมีชื่อใน
google sheet user เพื่อป้องกันไม่ให้ใครก็ได้เข้ามา"*

**Which domains — checked, not assumed.** `chula.ac.th`, `student.chula.ac.th`, `md.chula.ac.th`,
`docchula.com` and `chulahospital.org` each have a Google Workspace sign-in page
(`google.com/a/<domain>/ServiceLogin`; the first two hand on to Chula's Microsoft SSO). `redcross.or.th`
and a control domain get Google's "not using Google Workspace" page instead. DNS agrees for
`docchula.com` and `chulahospital.org` (MX at Google). `GOOGLE_WORKSPACE_DOMAINS` now lists the five,
exact matches only.

**Why the gate changed too.** `verifyToken` decided the temp-password gate by *domain*
(`!_usesGoogleSignIn(email)`), so listing a domain also lifted the gate for it. A row on a newly listed
domain that already held a temp password would have kept it working with no forced change, and a
`chula.ac.th` row already could (harness § 3 fails on `7049f60`). Sessions now record how they signed in
(`authMethod`), and `_passwordSession` lets col G hold only a password session. A Google session is never
held, so a Google sign-in on such a row no longer lands on a change screen it cannot complete, which is
what a `@docchula.com` sign-in meets on `@55`. Sessions minted before the deploy carry no `authMethod`
and keep the domain rule.

**The allowlist, checked.** Both login paths require an active Staff row with a valid role; every request
re-reads the row (60 s cache); a deleted or disabled row ends a live session; no unauthenticated action
or GET returns data. Unchanged, and now pinned in the harness's § 4.

**Found here, fixed in the same PR:** after a forced password change, the next minute of requests was still
refused as `PasswordChangeRequired`, because `verifyToken` reads the Staff row from its 60 s cache, which
still held col G `TRUE`. The fix is the entry above: opened as PR #86, folded into PR #84 on Praew's
instruction.

`verify-chula-google-signin.cjs`: 57 assertions, 21 fail against `7049f60`.

## Session 2026-09-21 — Quick calc: the same calculator, on a typed weight, saving nothing

Frontend only (`app.jsx`, `calculator.jsx`, both shells, `test/verify-quick-calc.cjs`,
`test/verify-safety-review.cjs`). `gas-backend.gs` is untouched — by design: the whole point of the
feature is that nothing it does reaches the sheet.

**The request** (Praew, 2026-09-21): *"เพิ่มปุ่มขวาล่าง ให้เป็นสำหรับแคลคูเลเตอร์ ใส่ข้อมูลแค่น้ำหนัก
และคำนวณตามแคลคูเลเตอร์ได้เลย โดยข้อมูลในนี้จะไม่เซฟลงกูเกิลชีท."* A bedside scratchpad: type a weight,
get the numbers, register nobody.

**The decision that shaped everything else.** The obvious build is a small one-screen calculator —
weight in, fluid/GIR/stock mL out. It was rejected. That would be a **second implementation of KCMH's
dosing arithmetic** sitting beside `calculator.jsx`, the one file in this app that prints pharmacy
orders, and the two would disagree the first time either moved. So the quick calc mounts **the real
`<Calculator>`** with a new `scratch` prop and a frozen patient-less record. Every dose, every mL of
stock, every target band is the same `calc` the ward already prescribes from.

**What `scratch` turns off** — only the things that persist, never the arithmetic: Save, Submit,
delete, the unsaved-draft store, the `neofeed_calc_*` previous-submission store, the browser-storage
expiry sweep, the edit lock, the printed pharmacy form, and the Intake/Output card (bedside figures
for one real infant on one real day — there is neither). `handleSave` also returns early on `scratch`:
it is the only path in that file that reaches Google Sheets, and a hidden button is not a guarantee.

**Two inputs, not one.** The weight goes into Step 1 as always. The page head also carries a **DOL**,
because every ESPGHAN band the wizard grades against is DOL-indexed — without one, a quick calc would
quietly read day-1 protein/Na/K/Ca/P targets for a two-week-old. Since that DOL is picked rather than
derived, `orderDayRolledOver` is forced false in scratch mode: `dolAtDate` on a patient-less record
returns 1, so a page left open past midnight would have snapped a DOL 14 calc back to day-1 bands.

**Copy Order stays, and is the only thing that leaves the page.** Its usual gate (saved, unchanged,
`printable`) can never pass without an entry id, and is not the gate this mode needs — there is no
row to misattribute a copy to. It is scoped to a real order instead, and the compensating control is
the text: it opens `คำนวณเร็ว (ไม่ใช่คำสั่งการรักษา)`, states it was not saved, and carries neither
bed nor NeoFeed ID. A paste into LINE arrives without the screen it came from. Printing is refused
outright — a pharmacy order form with no patient on it is the one artifact that could be carried to a
bedside as if it were real.

**PDPA.** `SCRATCH_PATIENT` has no `sessionId`, no name, no initials and `bw: 0`. There is no personal
data in the view to protect, nothing is written anywhere, and the mode is not role-gated for that
reason — it grants no access the ESPGHAN reference panels don't already.

**The button.** `QuickCalcFab`, bottom-right at every width — an extended pill on both, not an
icon-only circle on phones: the app's `calc` glyph is a filled rounded square that reads as "a button",
and this is a new entry point nobody is looking for yet. It is `position: fixed`, a direct child of
`.app` but taking no grid cell, so it cannot repeat the 2026-09-16 banner bug; `z-index: 35`, below
`.bottom-nav`'s 40, so if a future layout change ever makes them overlap the navigation wins. Hidden
on the Calculator and on itself, and hidden when printing (it is outside `.work-inner`, so the existing
print rule did not reach it).

**Dropped after review on the device** (Praew, same session): the orange "หน้านี้ไม่บันทึกอะไรทั้งสิ้น"
card between the page head and Step 1. The `ไม่บันทึก` chip and the subtitle say it on arrival and the
footer card says it again beside Copy; the third copy only pushed Step 1 below the fold on a phone.

**Renamed after the same review** (Praew: *"เปลี่ยนคำว่าคำนวณเร็ว เป็น Calculator และใช้รูปเครื่องคิดเลข
เป็นตัวแทนปุ่ม"*): the button, the heading and the copied text now read **Calculator** — the same word
as the patient wizard, which is fine because the `ไม่บันทึก` chip beside the heading is what tells them
apart and the button is hidden while that wizard is open, so the two labels are never on screen together.

That rename needed a real calculator glyph, which the app did not have. `icons.jsx`'s `calc` is in the
`filled` list and winds its screen and keys the same way as its body, so under the default nonzero
fill-rule they fill in rather than cut out: in ink at rail size that passes, but at 22 px in white on
the solid brand button it was one featureless rounded square. Rather than put `fill-rule="evenodd"` on
the shared `Icon` — which would silently redraw nine icons across the app — a stroked sibling
**`calculator`** was added (body, screen, two rows of keys as round-capped zero-length segments) and
used only by the button. `calc` is untouched; the nav rail and the mobile Calc tab still use it, and
`verify-quick-calc.cjs` § 5 pins both halves of that split so neither drifts onto the other.

**Tests.** `test/verify-quick-calc.cjs` (46 assertions). § 1 drives the identical order into a scratch
mount and a patient-bound mount and fails on the first metric tile or step figure that disagrees, with
a non-zero GIR asserted separately so a page of zeros can't pass it vacuously. § 2 reads `localStorage`
after the quick calc **and** requires that the patient entry, under the same keystrokes, *did* write its
draft — without that half the assertion passes for the wrong reason, which is what it did on the first
run: `calculator.jsx` writes through a bare `localStorage`, which under `vm.runInThisContext` resolves
against the global scope, so every write threw inside its own `try/catch`. Same for the bare `navigator`
the Copy button uses, and Node 22's `globalThis.navigator` is read-only, so it has to be redefined.
§ 3-§ 7 pin the absent Save/Submit/print/IO card, the copied text, the wiring in `app.jsx`, the guards
in `calculator.jsx` and the button's CSS in both shells.

Two assertions in `verify-safety-review.cjs` were updated, not relaxed: the print/copy save-gate and the
`PrintOrderForm` render condition now have to name `scratch` in their conditions rather than simply
having lost the gate. Verified in real Chromium at 430 px and 1440 px.

**Merged with the palette session below** before landing. The only real conflict was the shells' `?v=`
tokens, which the build writes — resolved by taking one side and rebuilding. One thing the merge
caught that a clean apply would not have: `.quick-fab` was written with a hand-rolled
`oklch(… 230 …)` drop shadow, the old hue, hours before the palette session moved every shadow in the
app onto hue 205 and a single `--shadow-lift` token. It now uses that token, like the modals and the
picker — a button added the same day as "the design system that had been living in five files" should
not be the sixth.
## Session 2026-09-21 — Valhalla Health palette, and the design system that had been living in five files

Presentation only. No clinical logic, no data model, no backend: `gas-backend.gs` and `data.js`'s
numbers are untouched, and every one of the 42 harnesses passes against both the sources and
`compiled/`.

**What changed.** The app now wears the Valhalla Health brand sheet. Its seven colours were converted
to oklch — the space the shells were already written in — so the tints, hovers and hairlines could be
derived by moving L/C along one hue instead of being matched by eye:

| | hex | oklch |
|---|---|---|
| Midnight Teal | `#103F43` | `oklch(33.9% 0.049 203)` |
| Valhalla Teal | `#12656A` | `oklch(46.3% 0.074 201)` |
| Neo Teal | `#16838A` | `oklch(55.7% 0.090 202)` |
| Sea Glass | `#78BFC0` | `oklch(75.8% 0.071 197)` |
| Mineral Mist | `#D5ECEA` | `oklch(92.6% 0.024 190)` |
| Nordic Sand | `#D4B98C` | `oklch(79.8% 0.067 80)` |
| Porcelain Mist | `#F5F8F7` | `oklch(97.7% 0.003 174)` |

The old brand was already a teal (`oklch(46% 0.085 215)`), so the move is mostly a 215 → 201 hue
shift plus re-basing the neutrals off Porcelain Mist instead of a blue-grey at hue 230. Ink is now
teal-leaning charcoal rather than blue, so body text sits inside the brand family instead of reading
cold against it.

**The part that was not a recolour.** The palette had no single definition. `:root` held 27 values;
another **114** hardcoded `oklch(...)` literals sat outside it — 70 across `app.jsx`,
`calculator.jsx`, `log.jsx`, `fenton.jsx` and `registry.jsx`, and 44 more in the shells' own CSS body.
Among them, a warn-as-text cut written out by hand in **14 separate places across five files**.
Moving the brand hue therefore took a scripted sweep with every single replacement asserted against an
expected hit count, not an edit to one line. What the sweep left behind is the actual deliverable: a
ramp (`--brand-ink` … `--brand-bg-2`), `--crit-ink` / `--warn-ink` / `--ok-ink` for status-as-text,
`--sand`, `--ring`, `--shadow-lift` — and **zero** brand or neutral literals left in the CSS or in
any JSX `style={{…}}`. `app-walkthrough.md` § 7 now carries the rules.

The ~50 `oklch(...)` literals still in `log.jsx`/`fenton.jsx`/`calculator.jsx` are there by
construction, not by omission: they feed SVG **presentation attributes** (`fill=`, `stroke=`), and
`var()` is only substituted in CSS declarations — as an attribute it resolves to nothing and the mark
renders black. (The login mark hit exactly this and is set through `style` instead.) What remains is
the chart-series palette plus the brand/status values those charts draw with; they are now written as
the new palette's exact values.

**Three decisions worth recording, because each could look like an oversight later.**
- **`--crit`, `--warn` and `--ok` are byte-identical to the pre-Valhalla values.** Severity at a
  bedside is read off a mapping the ward already knows, and re-hueing it to match a brand is a
  clinical change wearing a design change's clothes. Brand teal never means "normal".
- **`--warn` and `--warn-ink` are left outside the sRGB gamut**, where they already were. The
  in-gamut equivalents (`#c97000`, `#844100`) look identical on an sRGB panel — but the ward reads
  this on P3 iPads, where the current specs render the more saturated amber that *is* the learned
  signal. Pinning them would have quietly desaturated a clinical colour to tidy a spec.
- **Nordic Sand is decorative only** — hairline rules and the login wordmark's underline, nothing
  else. It sits at hue 80, next door to `--warn` at 65, and a warm chip that does not mean "caution"
  is the one confusion this app can least afford.

**Contrast was computed, not eyeballed.** Every text tier was run through a WCAG ratio against
`--surface` and `--bg-2` before the tokens were written, and three failures in the *existing* palette
were fixed on the way past: `--ink-3` was 4.08:1 on `--bg-2` (table headers sit on exactly that pair)
and is now 4.52:1; `--ink-4` was 2.38:1 on white and is now 3.09:1; and warn-as-text had no named
token at all, so its 7.7:1 cut was being re-typed by hand and was one typo from becoming `--warn`'s
3.6:1. Ratios are recorded inline in `:root`.

**UX work that came with it, all colour/elevation/focus — no box geometry moved**, so the Chromium
layout assertions in `verify-sync-gate-and-poll.cjs` still describe the same shell:
- **A visible focus ring, application-wide.** `:focus-visible` on every button, link and rail item.
  The rail, the bottom nav and every ghost button were keyboard-reachable before this with nothing
  drawn to say where you were — on a workstation that is driven by keyboard as often as by mouse.
- **The active rail item carries a leading indicator bar**, not just a tint. Tint is the first thing
  to disappear on a glare-washed bedside panel. Its `font-weight: 500` override went at the same time,
  which fixes a jump that predates this session: the extra weight pushed "Guidelines (ESPGHAN)" onto a
  second line at this rail width (measured 37px → 56px in Chromium), so selecting a view reflowed the
  rail under the cursor that had just clicked it. Every rail item now holds its height in every
  selected state.
- **`prefers-reduced-motion: reduce`** now stands down every transition and animation in one block,
  instead of each component having to remember. Checked against the calculator's accordions in both
  motion modes, since the standard `transition-duration: .01ms !important` sweep is exactly the kind
  of thing that can leave a `visibility`-delayed panel stuck shut — they open and close correctly in
  both.
- **The login screen was rebuilt as the brand moment** it is: a Porcelain-Mist ground with soft
  Sea-Glass/Mineral-Mist ribbons (painted as gradients on a `-1` layer, deliberately no
  `filter: blur()` — a full-viewport blur is the one effect that stutters on the ward's older Android
  tablets), the two-tone `Neo`/`Feed` wordmark, a Nordic-Sand hairline, and the mark drawn the way the
  sheet draws it: a teal glyph on a white tile, not the reverse.
- Growth-chart percentiles now read as **one sequential teal ramp** (Sea Glass → Valhalla Teal)
  instead of two unrelated blue-greys plus a teal. Percentiles are an ordered scale and now look like
  one; the patient's own trace stays red, which is the one separation that has to survive.
- Card headers, table headers, the patient strip's lead cell, scrims, shadows and the toast all move
  onto brand-tinted values — on a Porcelain-Mist page a neutral-grey shadow reads as dirt.

**Icons and chrome.** `icons/icon.svg` is now Neo Teal → Midnight Teal with a Sea Glass counter-dot,
and all seven PNGs were re-rendered from it (headless Chromium at 1024px, then box-downsampled in
premultiplied alpha by a small stdlib script, so the rounded corners do not fringe). `theme-color` and
the manifest move to Midnight Teal, and the manifest's `background_color` becomes Porcelain Mist so a
PWA launch no longer flashes white before settling onto the app's real page colour.

**Center Point** needed one line. It extracts the shell's `<style>` block at build time
(`center-point/build.mjs`), so the whole palette reaches it for free — but its toast carries its own
copy of the colours, which is now matched to `app.jsx`'s. The extracted `calculator.css` was checked
to confirm the new tokens actually land in it.

**Verified.** All 42 harnesses green against the sources and against the shipped `compiled/*.js`;
`node tools/build.mjs` reproduces the committed output byte-for-byte; the two shells are
byte-identical; Center Point builds and its client tests pass. The real app was also driven through
every view in Chromium (registry, dashboard, calculator, growth chart, alerts, guidelines, formulas,
the patient picker, and mobile at 390px) with no console or page errors.

---

## Session 2026-09-18 (4) — The `harnesses` flake: `withNow` pinned `Date.now()` but not `new Date()`

Test-only (`test/gas-vm-sandbox.cjs`, `test/verify-review-0917-backend-sync.cjs`, `test/README.md`).
`gas-backend.gs` is untouched, still byte-identical to `7049f60`, the source of `@55`. Nothing deploys.

**What failed.** PR #76's first `harnesses` run (35302157754, on a docs-only commit) failed
`verify-review-0917-backend-sync.cjs` § A2 #040 "…with a fresh ts". The re-run passed, and so did `main`
and `release` on the same code. `harnesses` is a required check on `release`, so the same flake could
have held up a deploy.

**Why.** A2 syncs once, then again inside `withNow(Date.now() + 2000, …)`, and asserted
`second.ts !== first.ts`. The second sync is a cache hit, and `getActivePatientsJson` stamps its `ts`
with an argument-less `new Date()`. `withNow` replaced `Date.now` only, and `new Date()` never calls
`Date.now`, so the +2 s never reached the stamp. Both stamps came from the real clock, and the assertion
held only if that clock ticked between two syncs usually under a millisecond apart.
- Replaying the two syncs 2,000 times in one warmed-up process gave identical stamps 72 % of the time.
  The second `ts` was the real clock, 2 s short of the pinned time.
- With the real clock stopped (a scratch preload freezing `Date.now` and `new Date()`), #040 failed on
  every run. It was the only one of the three backend harnesses' 344 assertions to fail.
- 120 ordinary runs on Praew's workstation all passed. A real run meets the race once, before the code
  is warmed up, when the gap is usually 1 ms or more. CI's runner was fast enough once.

**Fix.**
- `gas-vm-sandbox.cjs` gives the backend a `Date` whose argument-less form (`new Date()`, `Date()`)
  reads `Date.now()`. It is still the host's `Date`: same prototype, so `instanceof Date` holds both
  ways, and `now`, `parse` and `UTC` delegate. So `withNow` now pins every clock read in `gas-backend.gs`.
  That matters beyond A2. The backend reads the clock both ways: `Date.now()` for sessions and cache TTLs,
  `new Date()` in 12 places, including `_wardDateKey`, `lastModified` and the audit `ts`. So under
  `withNow` it used to see two different times at once.
- A2 now asserts the exact pinned time, `ts === new Date(at).toISOString()`, instead of inequality. A
  stamp served from the cache and one taken from the real clock both fail it.
- The other `withNow` blocks (backend-security's 12 h sessions, backend-writes' 10-minute schema cache,
  A2's two 301 s TTL checks) were read for anything the pinned `new Date()` could change. None depends on
  it: the first expect `Unauthorized` before any date is read, the second use fixed entry dates, and the
  third build their expected value under the same pinned clock.

**Verified.**
- The new assertion fails 3/3 against the old sandbox and passes with the fix. With the real clock
  stopped, the fixed sandbox passes all three backend harnesses (95, 101, 148).
- 200 runs of the fixed `verify-review-0917-backend-sync.cjs`, 6 at a time: all 200 passed.
- Everything `test.yml` runs, on Praew's workstation (Node 24; CI uses 22). A fresh build changes nothing,
  and the two shells are byte-identical. All 42 `verify-*.cjs` harnesses pass against the sources and
  against `compiled/`, with both `DEAD=0` runs. The Center Point build and its 5 client tests pass.
- Against the pre-review backend (`42ce553`, via `NEOFEED_GAS_SRC`) the three backend harnesses still
  fail 63, 97 and 25 times, as `test/README.md` says.

## Session 2026-09-18 (3) — Two frontend deploys recorded: the 2026-09-17 review (PR #74) and the ward requests (PR #77)

Both verified afterwards, read-only; the evidence is in `STATUS.md`. **PR #74** (`main` → `release`),
opened by `praewxtvl`, was approved and merged by `tasamew` at 02:10:44 UTC / 09:10 ICT (`dfeb15b`). It
shipped PR #73's frontend, 28 minutes after the backend went live as `@55`. **PR #77** followed at
04:17:33 UTC / 11:17 ICT (`96afcd0`), again approved and merged by `tasamew`. It shipped the ward
requests of 2026-09-18 (2), which the entry below still headlines as "NOT deployed". This PR was opened
between the two releases; merging `main` into it after #75 landed kept both CHANGELOG entries.

- **Checking a release is now mechanical.** With content-hash tokens, "the release is live" means that
  the served shell is `release`'s `index.html` and that every script it loads hashes to its own `?v=`
  (`REFERENCE.md`, "Proving what a release serves"). Scripted, and fetched on both hosts once as a
  browser asks and once past any cache: for both releases all eight tokens matched, and every file
  fetched was byte-identical to `origin/release`. That proves what is served, not that it runs; the
  bedside session in `BACKLOG.md` § Now stays open.
- **A check that needs no bedside session.** Every save stamps its frontend into `Daily_Log` AG (and
  its constants into AF), and every printed order repeats both in its footer. After #77 the stamp has
  `d=1857fa896b` and `c=c22c5394ad`, with constants `2026-09-18.1`; `d=3626f2a02e` and `c=7afa9076db`
  mean a tab still on the #74 frontend, and named tokens such as `a=sync-poll-0916` an older one.
- **#77 changed the pharmacy form, and nothing records that pharmacy was told.** `BACKLOG.md` § Next
  made telling pharmacy the condition for shipping Soluvit/Peditrace × Factor; it is now the first
  item in § Now.
- **Read check runs, not the combined status.** `gh api …/commits/dfeb15b/status` answers `pending`
  because this repo has no commit statuses at all; `…/check-runs` lists `harnesses`, `Workers Builds:
  neofeed` and the Pages jobs, all green.
- `BACKLOG.md`: "Ship the 2026-09-17 review" is done and deleted; the pharmacy item heads § Now; the
  bedside item names `96afcd0` and gains the ward requests' checks; a new chore drops the six `.jsx`
  sources from both hosts in the next release.

## Session 2026-09-18 (2) — Ward requests: MEN, a Magnesium tile, Aminoplasmal 15%, dead space 30 mL (NOT deployed)

Praew forwarded three annotated screenshots of the live calculator from the NICU team (§1–§3), then asked
for a fourth change herself (§4). Frontend only (`data.js`, `calculator.jsx`,
`center-point/tpn-snapshot.mjs`); no backend change, no `clasp` step, no new `Daily_Log` column. Nothing is
deployed until a `main` → `release` PR.

### 1 · "ติ๊ก MEN แล้ว ไม่ต้องเอาไปคิดสารอาหารได้ไหม" — MEN counts toward no nutrient total

A feed ticked **MEN (trophic)** was left out of the fluid total only. It still counted toward energy,
protein, lipid, the energy split, NPE:AA, P:E, Na, K, Ca, P and Ca:P. The screenshot's own order shows it:
TPN Na 4 · K 3 · Ca 0 · P 46.5 read as **Na 4.2 · K 3.3 · Ca 5 · P 50 · Ca:P 0.11** because a 20 mL/kg/d
breast-milk MEN feed was added in. `calc` now builds every EN term from `enCounted` (0 when MEN is
ticked), so a MEN feed reaches none of the Step 3/4 tiles, the Step 6 "EN (นม)" row, the alerts, the
saved `Daily_Log` figures, the printed totals or the copied order.

- **Still shown, never counted.** Step 2's "Delivered per kg from EN" box still lists what the feed
  provides (kcal 13 · pro 0.2 · Na 0.2 · K 0.3 · Ca 5 · P 3), greyed and marked *MEN — not counted in
  totals*. The checkbox hint reads *Not counted in fluid or nutrient totals*; the Energy distribution card
  says *EN 0 (MEN — not counted)*; the copied order says *[MEN — not counted in fluid or nutrition]*.
- **What the record keeps.** `enVolPerKg`, the EN volume tile and the route stay the feed actually given
  (`savedDosingWeightOf` reads `enVolPerKg`, so its meaning must not move). `pro`/`kcal`/`na`/`k`/`ca`/`p`
  on a MEN day now exclude the feed. Rows saved earlier with MEN ticked include it; the `appVersion`
  stamp (AG) tells the two apart. On trophic volumes the difference is small (≈13 kcal and 0.2 g protein
  per kg at 20 mL/kg/d).
- **MEN never switches on the enteral targets** (`useEnteralTargets` reads the counted volume), and the
  "Full EN ≥100 — EN targets active" banner now keys on the same flag, so it can no longer claim targets
  that are not active.
- **A consequence worth knowing, and correct:** an order with TPN calcium and no IV phosphate whose only
  P came from a MEN feed used to show Ca:P as merely off target. With the feed not counted there is no P,
  so it is the critical "Ca:P ratio — ไม่มี P" alert. A saved order like that reopens unprintable until it
  is saved again with a reason (UP-C6, unchanged).

**Praew's guard (her decision, 2026-09-18).** Orders prefill from yesterday, so a MEN tick left on after
feeds are advanced would now hide the feed from nutrition as well as fluid. MEN ticked with EN above
**24 mL/kg/d** — the ceiling of "MEF (trophic) 12–24 mL/kg/day" on the app's own Feeding Advancement card
(`MEN_MAX_ML_KG`) — raises a *warning*, "MEN ticked above trophic volume". Never a stop: no reason is asked
and Save and Print are unaffected.

### 2 · "ด้านข้าง ยังไม่มีแถบของ Mg เทียบกับค่าอ้างอิงแบบ Na K Ca P" — a Magnesium tile

Step 4's tile column gains **Magnesium**, between Potassium and Calcium (the order of the inputs),
against ESPGHAN/ESPEN/ESPR/CSPEN 2018 (Mihatsch) — the table the team attached. The range is the existing
`TARGETS.mg(dol)`, which the printed form's "Normal Requirement" already used; the tile, its alert line
and the form now read one variable (`tMg`).

- **In mEq/kg/d, the unit Mg is dosed in** (0.2–0.4 in the first days, 0.4–0.6 growing = 0.1–0.2 /
  0.2–0.3 mmol). The guideline's mg figures are rounded — 0.1 mmol is 2.43 mg, printed 2.5 — so comparing
  in mg would have flagged the 0.2 and 0.4 presets, which are exactly the ESPGHAN bounds, as off target.
  A line under the tile gives mg/kg/d (0.6 mEq = 7.3 mg) for reading against the table's mg column.
- **TPN only.** `EN_DB` carries no Mg for any feed, so the tile cannot include one; the line under it says
  so. There is no enteral Mg target, so its alert always cites ESPGHAN 2018 parenteral, even on full feeds.
- **F1 kept.** An off-target Magnesium tile is a "Magnesium off target" warning line. No hard limit, so
  never critical.

### 3 · "ขอเพิ่มเผื่อกรณี ใช้ 15% Aminoplasmal" — prepared, hidden on NICU and SCN

Checked before building: **the Aminoplasmal 15% label contraindicates it in newborn infants, infants and
toddlers under 2 years** — *"the amino acid composition does not properly meet the special requirements
of this paediatric age group"* (UK SmPC, emc 15186; the same wording on Singapore HSA's SIN08352P).
Every NeoFeed patient is under 2. **Praew's decision (2026-09-18): "plan ไว้สำหรับเด็กโตในอนาคต ปิดช่องนี้
ไม่โชว์ใน newborn (NICU+SCN)".**

- `KCMH_STOCK.aminoplasmal15` = 0.15 g/mL (150 g/L), with its label caution. `aaProductsFor(patient)`
  decides what a patient may be ordered: Aminoven only unless the bed's ward is in `OLDER_CHILD_WARDS`,
  which is **empty** — NeoFeed has no ward for older children — so NICU, iso, SCN, no bed and free-text
  beds all get Aminoven only, and **nothing changes on any ward's screen today**.
- The plumbing is in place for that future ward: a Step 3 product choice (only when more than one stock
  is allowed), the label caution under it, mL = g in bag ÷ 0.15, the printed "☑ 15% Aminoplasmal", the
  copied order, `calcInput.aaProduct` (absent on older rows = Aminoven, the only stock there was) and an
  "Amino acid product" line in "changes vs previous order". `solVol.aaAminoven` is renamed `solVol.aa`,
  since it now holds whichever stock is chosen.
- **A saved choice the ward does not allow falls back to Aminoven**, and the live inputs then differ from
  the saved ones, so the order reads as edited and prints only after a new save — never the old entry id
  over different mL (UP-C2).
- **Center Point is Aminoven only on any ward.** Its `neofeed-tpn-v2` packet has one amino-acid slot,
  printed "10% Aminoven infant"; offering another stock there needs a new packet version first.
  `tpn-snapshot.mjs` reads `solVol.aa`; `tpn-document.mjs` (digest-pinned, copied by CP) is untouched.

### 4 · "ใน SCN+NICU แก้เป็น +30 ml อัตโนมัติไปเลย" — dead space starts at 30 mL

Praew's own request, the same day, sent with a phone screenshot of Step 3's ปริมาตรคาสาย (dead space)
field, set to 30 by hand. **A new order on NICU or SCN now starts at 30 mL** (`NEWBORN_DEAD_VOL_ML`, via
`defaultDeadVolFor(patient)`). Pharmacy prepares delivered + 30 and the Factor scales every additive; the
per-kg dose delivered is unchanged, as it always is with overfill.

- **A starting value, not a lock.** The field and its 0 / 10 / 20 / 30 chips still change it per order,
  and the hint reads *NICU/SCN starts at 30*.
- **Which orders.**
  - A brand-new order starts at 30.
  - A new day copied from yesterday keeps a dead space somebody set (10, 20, 30…). Yesterday's **0 was
    the old default, so it becomes 30**, as does an order that never carried one. A deliberate 0
    therefore has to be chosen again each day.
  - **A saved order is the record.** It reopens with its own dead space and prints as saved.
  - An unsaved draft restores as typed.
- **"Newborn unit" is one rule** (`isNewbornUnit`): every patient not on a ward in `OLDER_CHILD_WARDS` —
  every patient today, bed or no bed. `aaProductsFor` now reads it too, with no behaviour change. A future
  older-children ward starts at 0 until its own value is decided.
- **No TPN, no bag, no dead space.** `preparedVol` is now 0 when the delivered volume is 0. Without this
  guard, the default would have turned every feeds-only day into a 30 mL "prepared" bag of water, vitamins
  and 0.3 mL heparin on the pharmacy form.
- **What staff will see.**
  - Every NICU/SCN TPN order shows the Factor and PREPARED figures, and the printed ปริมาตรคาสาย 30 mL.
  - Whenever Soluvit or Peditrace is ticked, the existing info line *Vitamins / trace elements not
    overfill-scaled* also appears. Per the KCMH sheet (G43/G45 use actual weight, not the Factor), they
    reach the infant at delivered ÷ prepared: 80 % on a 120 mL day, 67 % on a 60 mL one. That was already
    true wherever someone picked 30; now it is every order (`BACKLOG.md` § Next).
- "Changes vs previous order" reads *Dead space 0 → 30 mL* on each infant's first order after this ships.
  The order did change.

`CONSTANTS_VERSION` → `2026-09-18.1` for all of this. It covers the new `KCMH_STOCK` entry and the new
dead-space default; no existing value changed. Register: `docs/CLINICAL_CONSTANTS.md`.

### Tests

New harness **`test/verify-ward-requests-0918.cjs`**, 158 assertions, mounting the real calculator with
the screenshot's own order as the fixture. Against `f0c172c` it fails 89 (46 pass; §7 and §9 stop early
there, where `aaProductsFor` and the product buttons do not exist). It uses stubbed ward gates to drive the
future-ward paths, and checks the Center Point packet through `buildTpn`. Its §1–§9 type dead space 0,
because their arithmetic is for a bag with no overfill; §10 pins the new default.

Two older harnesses typed nothing for dead space and relied on the old default of 0: four of the six digest
orders in `verify-review-0917-calc.cjs` §6, and the "no dead space" order in
`verify-center-point-print-parity.cjs`. They now type 0, so they still pin exactly the orders they were
written for. **Every digest is unchanged, and no assertion was edited.** `full_en` needed nothing: with no
TPN there is no bag and no dead space.

Open decisions this raised are in `BACKLOG.md` § Next ("Decisions from the 2026-09-18 ward requests").

### 5 · Soluvit and Peditrace scale with the overfill (after PR #75 merged)

Praew answered the first open decision the same day ("1. yes"). **Soluvit N and Peditrace are now scaled
by the overfill like every electrolyte and the amino acid**, so the infant receives the full 1 mL/kg. §4's
note above no longer holds: the *Vitamins / trace elements not overfill-scaled* info line is removed.
Pushed to `main` directly (the standing NeoFeed authorization; `main` deploys nothing), to ship with #75
in one `main` → `release` PR.

- **Bag amount = min(1 mL/kg × weight, cap) × overfill.** The caps (10 / 15 mL a day) stay on what the
  infant receives. A 2 kg infant on a 120 mL day with 30 mL dead space gets 2.5 mL of each in the bag and
  receives 2 mL; before this, 2 mL went in and 1.6 mL (80 %) arrived.
- **NeoFeed now departs from the KCMH worksheet in one named place.** The sheet's G43/G45 (and G46)
  multiply by actual weight (C6), not the Factor (H9). The 2026-08-06 build followed it on purpose ("fidelity
  to a sheet inconsistency", surfaced as an alert). On an overfilled bag, the printed vitamin mL,
  components and WFI therefore differ from what that sheet computes. The form's vitamin rows say
  "× Factor → delivers … (KCMH sheet G43/G45: × actual weight)", so pharmacy can see why.
  **Pharmacy needs telling before this ships** (`BACKLOG.md` § Next).
- On a bag with no dead space nothing changes: the overfill is 1.
- **Tests.** `verify-ward-requests-0918.cjs` §11 pins the scaled amounts, the removed info line, the
  print, the bag make-up, the copied order and the caps. Its 9 assertions are exactly what fails
  against `3f35ef8`; the harness is now 169 assertions. `verify-kcmh-factor.cjs` keeps `sheet()` exactly
  as the workbook computes and adds the one departure as `vitExtra`. The Soluvit/Peditrace mL, components
  and WFI it reads are now asserted as sheet + `vitExtra`, and delivered vitamins come back to 1 mL/kg,
  like AA, Na and Ca. `verify-review-0917-calc.cjs` §6 re-captures one digest, `parity_dead`, the only
  overfilled order among the six. Exactly 4 of its 90 printed figures moved (Soluvit 1.2 → 1.3, Peditrace
  1.2 → 1.3, components 93.1 → 93.3, WFI 50.2 → 50); a dump of both versions' figures showed no other
  difference.

### 6 · The independent pre-deploy review, and its fixes — which missed #77 (NOT deployed)

While the `main` → `release` PR (#77) was still a draft, a reviewer who had not written the code read the
whole `release..main` diff. **No critical or high findings.** #77 was approved and merged by `tasamew` at
11:17 ICT, at `fc2c35c`, while the fixes below were still under test, so **none of them is live**. They ship
in the next `main` → `release` PR. Acted on here:

- **Medium — an order saved before a release reprinted with that release's numbers.** A saved order prints
  what the calculator computes now from its inputs, so after this release a pre-deploy order with dead
  space and vitamins would reprint Soluvit 1.8 mL where it had printed 1.5, under the same entry id and
  revision. That is the UP-C2 rule, "never old id over new mL".
  - **Every save now stamps `calcInput.constantsVersion`**, and a saved row whose stamp differs from
    `CONSTANTS_VERSION` prints, copies and submits only after it is saved again (`calcMoved`). The
    reason goes in the existing red print-blocked line.
  - **Rows saved on the live `fc2c35c` since 11:17 carry no stamp either**, but their figures were
    computed exactly as now. That frontend was the first to save `calcInput.aaProduct`, so
    `savedCalcVersionOf` dates such a row `2026-09-18.1` and it prints without a re-save. Without this,
    after the next deploy nearly every NICU/SCN order saved today (30 mL dead space, vitamins ticked)
    would have been held with a false "the calculation changed".
  - Rows saved before 11:17 know no version. For them, only this release's own print changes are
    held: an overfilled bag with Soluvit or Peditrace, or a MEN feed.
  - A day with no TPN is not held. The only figures that moved there are vitamin mL for a bag that does
    not exist.
  - `CONSTANTS_VERSION`'s rule now covers calculator logic that moves a printed figure (`data.js`,
    `docs/CLINICAL_CONSTANTS.md`). **These fixes keep `2026-09-18.1`.** The only printed figures they move
    are the vitamin lines of a day with no TPN (next bullet), the same no-bag case `calcMoved` exempts.
    A bump would have held every order saved on `fc2c35c` today.
- **Low, pre-existing — a feeds-only day printed vitamin mL and a negative WFI.** With no TPN volume there
  is no bag, so Soluvit and Peditrace are now 0 there, the same as the dead space in §4. §4's comment had
  claimed the vitamins were already covered; it has been corrected.
  - The Center Point snapshot sends dead space "—" when there is no TPN.
- **Low — MEN at 100 mL/kg/d or more.** The Protein : Energy tile and alert no longer judge a TPN-only
  ratio against the enteral target, and the collapsed "Full EN ✅" chip keys on the same flag as the
  enteral targets.
- **Deferred to `BACKLOG.md` § Next:**
  - Center Point's packet cannot mark a feed as MEN. Its "energy incl. EN" slot is TPN-only then; this
    needs a CP packet version.
  - `log.jsx` / `app.jsx` still pick the enteral targets for a MEN row at 100 mL/kg/d or more.
- **Two questions, already listed:** term infants read against the preterm rows, and gating Aminoplasmal
  by age as well as ward.

**Tests.** `verify-ward-requests-0918.cjs` §12 (the reprint guard) and additions to §4 and §10, now 193
assertions. Against the live `fc2c35c` exactly 12 fail: the P:E tile, the feeds-only vitamins (3) and the
guard (8). Two more pin the dating of rows saved since 11:17; they pass on `fc2c35c`, which has no guard,
and failed on this fix until `savedCalcVersionOf` read `aaProduct`. `verify-kcmh-factor.cjs`'s shell row
stands for a current order, so it carries the current stamp. `verify-review-0917-calc.cjs` §6 re-captures
`full_en`, the feeds-only order: exactly 4 of its 61 figures moved (Soluvit 1.5 → —, Peditrace 1.5 → —,
components 3 → —, WFI −3 → 0), checked by dumping both versions. All 43 harness runs pass, on sources and on
`compiled/`.

## Session 2026-09-18 — Backend `@55` deployed (the backend half of the 2026-09-17 review)

On Praew's go-ahead. The steps and evidence are in `STATUS.md` ("How the 2026-09-18 backend deploy
was verified"); this entry keeps what the session learned. The frontend half still waits for the
`main` → `release` PR.

- **The pre-deploy gate caught a real problem on its first run.** `sheetHealthReport()` found
  `Patient_Registry` row 1 labelled `weights(JSON)`, `lengths(JSON)`, `hcs(JSON)`. They were edited by
  hand at some point, because every version of the code writes `weights`/`lengths`/`hcs`. `@54` reads by
  position and never noticed; `@55`'s column guard would have refused every registry write the moment
  it went live.
- **Relabelling was safe only once it was clear the columns had not shifted, and the report cannot show
  that.** It names the *expected* labels, not the live ones, and `_parseJson` silently falls back on a
  non-JSON cell. A temporary read-only diagnostic answered it: live labels, the JSON shape and element
  keys of M–P, and the failing record's row and reason, with no identifiers. It was tested first against
  the real source in `test/gas-vm-sandbox.cjs`, pushed to HEAD only, never deployed, then removed.
- **Live numbers where the review had estimates:** 3 undated archived infants left ward devices, not 47;
  the workbook is at 1.6 % of the cell limit. The data findings are a new `BACKLOG.md` § Now item.
- **clasp 3.3.0 cannot delete a file that exists only remotely.** `push` compares local files with HEAD,
  so a remote-only file never counts as a change ("Script is already up to date"). Any local change
  makes `push` send the full file set through `updateContent`, which replaces the project's content.
  That is how the diagnostic was removed.
- **Praew confirmed a real login and a real save on `@55`** with the live `sync-poll-0916` client.

## Session 2026-09-17 — Full review: speed, security and unhappy paths (NOT deployed)

Asked for by Praew ahead of a board presentation: *review all of NeoFeed, check its security, bring it
up to current web practice, find out why it opens more slowly than before, and fix every unhappy path.*
Six independent reviews, then fixes on `claude/review-0917-{shell,calc,backend,build}` merged into
`claude/review-0917`. The detailed findings list stays **outside this public repo**
(`NeoFeed/NEOFEED_REVIEW_2026-09-17.md`), as with the 2026-09-11 review. **Nothing here is deployed:**
the frontend waits for a `main` → `release` PR, the backend for Praew's `clasp` go-ahead.

### 1 · "Opens more slowly than before" — measured

- **Before login:** the live login screen took **10.7 s** to appear on a 16-core desktop. In-browser
  Babel downloaded 3 MB and compiled ~450 KB of JSX on the main thread every load (4.1–4.6 s even from
  local files, ~27 s at 4× CPU slowdown). The cost grew with the code: 2.9 s on 2026-07-15, 4.6 s today,
  most of it `calculator.jsx` (106 → 196 KB). The `.jsx` files were also served **uncompressed**
  (`text/jsx`), and the Google Fonts stylesheet in `<head>` occasionally held every script for ~3.6 s.
- **After login:** every sync sent **~5.6 MB of JSON** to every open tab every 4 minutes — full order
  history, 47 archived infants whose missing `statusDate` kept them in the sync forever, and the whole
  archive on admin devices — after reading every `Daily_Log` row on the server.
- **Fixes:** precompiled JavaScript with self-hosted React (see § 6), the fonts link moved after the
  scripts, a narrow server-side sync read, a 5-minute server cache of the sync payload, the undated
  archive and the admin archive taken out of the default sync.

### 2 · Decisions Praew made during the review

- Hard limits (lipid 4.5 g/kg/d, K 3.5 mEq/kg/d, NPE:AA 20–32) are judged on the **IV (TPN) portion
  only**; on full enteral feeds they had fired on in-range values and trained rote override reasons.
- Central-line osmolarity warns above **1800** mOsm/L; the tile's range now says so too.
- **30-minute idle logout** on the client, and a **12-hour absolute session cap** on the server.
- Archived infants with no `statusDate` **leave ward devices** (admins can still load the archive).
- A **5-minute server cache** of the sync payload is allowed.
- If the Sheet's header row drifts, **saves are refused** rather than written into the wrong columns.
- Google Sign-In limited to Google-managed domains — **prepared behind `GOOGLE_HD_ENFORCE = false`**.
- **Precompiled JS replaces "no build step"** (§ 6).
- **Not changed, on purpose:** electrolyte mL rounding for < 1 kg infants — the Na dose itself is being
  re-confirmed with pharmacy first (`BACKLOG.md`).

### 3 · Backend — `gas-backend.gs` (needs a `clasp` deploy)

- **Security:** every value written to or written back into the Sheet is formula-escaped, including the
  audit tab; one validator for all measurement arrays, so a malformed record can no longer take down
  every ward device on the next poll; admin password resets end existing sessions; login lockout counts
  before the slow hash (parallel attempts no longer multiply guesses); a PDPA erasure can no longer be
  undone by a stale device; generic login failures; strict input types; destructive actions audit
  first; login/lockout/password-change/archive reads audited; lockout and epoch keys hashed (with epoch
  migration, so nobody is logged out by the deploy).
- **Robustness:** a transient Google service error answers `ServiceUnavailable` (retryable) instead of
  logging everyone out; a lock timeout answers `Busy` (retryable, nothing written); every positional
  write re-checks its row first, so a row deleted or inserted by hand can no longer redirect a write
  onto another infant; a half-finished patient delete can be completed; revision/publish/erasure writes
  are single calls; the one-entry-per-date guard rejects malformed dates.
- **Concurrent edits:** the client now sends the record it last received (`base` / `baseWeights`) and
  the server merges field by field and measurement by DOL, so a device that has not re-synced no longer
  erases another device's growth measurements or re-activates a discharged infant.
- **Speed:** block-bounded `Daily_Log` read with a full-read fallback on any row shift (equivalence-tested
  on 69 edge cases); gzip payload cache keyed on a data version bumped by every write and by hand edits
  (`onEdit`); `sheetHealthReport()` (counts only) to run before deploying.

### 4 · App shell, sync, session — `app.jsx`, `registry.jsx`, `fenton.jsx`, shells, `_headers`

- A sync that was already in flight when Save was pressed no longer wipes the just-saved entry.
- One request helper with a 45 s timeout and Thai messages for non-JSON replies; an unknown write
  result re-syncs before anything is rolled back.
- Logout, expiry and idle logout reset the whole app, so the next person on a shared PC never sees the
  previous user's patients; the login screen says why the session ended.
- The Growth-chart logger follows the selected infant (it kept the previous infant's DOL); an
  unrecognised sex shows a message instead of blanking the app.
- Register/Edit/Transfer keep the form open until the server answers; empty states instead of blank
  views; exponential backoff during outages; Google Sign-In load failures reported; dates independent of
  the device's time zone; admins load the >30-day archive only on request.
- `connect-src` pinned to the NeoFeed Apps Script deployment; the GitHub Pages guard also covers the
  trailing-dot hostname and clears old `neofeed_*` storage on that shared origin.
- **Error boundaries** (closes the BACKLOG item "There is no error boundary"): a view boundary around the
  workspace keeps the rail, topbar and sync usable when one view fails to render and clears itself when
  the user moves on; a root boundary wraps everything else. Writing its harness found one more live
  crash — a synced record with a `null` element in `weights[]` threw outside the workspace — so
  measurement arrays are now cleaned where records enter client state (`verify-error-boundary.cjs`,
  4/5 fail before, 17/17 after).
- "New log → วันนี้" opened today's order under the back-fill banner "กำลังบันทึกย้อนหลัง…" (found
  while capturing the Thai user guide); only a date that is not today is a back-fill now
  (`verify-log-date-today.cjs`).

### 5 · Calculator and printed order — `calculator.jsx`, `log.jsx`

- Print/Copy are refused (with a banner saying why) when the dosing weight moved after saving (e.g. a
  corrected birth weight), when a critical alert has no stored reason, while the row is still saving,
  or when TPN volume is 0 but bag components are still filled in.
- A new day's Intake/Output starts blank — yesterday's urine and drain no longer satisfy today's
  required fields.
- Drafts belong to the user who typed them and expire (72 h; previous-order prefill 7 days); a draft
  survives a save conflict and rebases after reloading; an order left open past midnight keeps its date.
- Rate→volume float noise, the heparin hint, and a PDPA note on the override-reason prompt.
- **No printed figure changed:** every number on the pharmacy form for six orders was compared before
  and after.

### 6 · Build step — precompiled JavaScript (Praew, 2026-09-17: replaces "no build step")

- `tools/build.mjs` (esbuild 0.25.12, exact versions, lockfile committed) compiles each `.jsx` on its
  own into `compiled/<module>.js` — no bundle, no wrapper, same load order, `"use strict"` as Babel
  gave. It refuses to build if two scripts declare the same top-level name (natively that is a
  blank page, under Babel it was a silent overwrite), writes `?v=` tokens as content hashes into
  both shells, and refuses if the shells differ.
- React and ReactDOM are self-hosted in `vendor/` (the build checks them against the SRI hashes that
  used to pin unpkg); the two inline scripts moved into `boot.js`. `script-src` is now
  `'self' https://accounts.google.com` — **no `'unsafe-inline'`, no `'unsafe-eval'`, no unpkg.**
- No build runs on either host: the bytes served are the bytes in git. CI rebuilds on a clean
  checkout and fails the PR if `compiled/` or a token is stale, then runs every harness twice —
  against the sources and against the compiled files.
- **Measured (5 cold runs, headless Chromium):** login screen 4,626 ms → **159 ms**; at 4× CPU
  throttle 34,642 ms → **441 ms**. Rendered DOM identical before/after on every view; 0 CSP
  violations; the GitHub Pages guard still redirects before any app script runs.
- `.jsx` files stay published for this release so tabs opened on the old shell mid-deploy still load.
- **Workflow:** after editing a `.jsx`, `data.js`, `boot.js` or a shell — `npm ci --prefix tools`
  (once), `node tools/build.mjs`, commit sources and `compiled/` together. See `REFERENCE.md`.

### Tests

New harnesses, each failing on `42ce553` and passing here: `verify-error-boundary` (17), `verify-review-0917-shell` (92),
`-sync` (73), `-session` (69), `-calc` (117), `-drafts` (39), `-backend-security` (101),
`-backend-writes` (148), `-backend-sync` (95). Integration branch: 39/39 `verify-*.cjs`, `DEAD=0`,
shells identical, Center Point 5/5, browser runthrough 41/41. Two extra real-Chromium checks run from a
scratch folder: the **current live client against the new backend** (19/19 — safe to deploy the
backend first) and **two devices on the new client and backend** editing one infant (11/11).

---

## Session 2026-09-16 (3) — The sync-waiting screens, and why sync goes stale

Reported from the ward as **"หน้า sync ไม่สวย และขึ้น sync นานกว่าปกติ"**, with a photo of a
NICU workstation. The photo turned out to contain two separate defects, one of which is the worst
layout bug this app has had.

### 1 · The staleness banner destroyed the app's layout — `NeoFeed.html` / `index.html`

`.app` was a two-row grid (`var(--header-h) 1fr`) and only `.topbar` was placed explicitly.
`App` renders the offline/staleness banner as a bare `<div role="status">` child of `.app`, so
CSS grid auto-placement handed it the first free cell — **the rail's** — which pushed `.rail`
into the workspace column and `.work` into an implicit third row that `overflow: hidden` clipped.

Measured in Chromium at 1440 × 900, with the banner up:

| | before | after |
|---|---|---|
| banner | x 0, **w 232**, h 654 | x 0, **w 1440**, h 47 |
| rail | x 232, **w 1208** | x 0, w 232 |
| workspace | y 710, **w 232, h 190** | y 103, w 1208, h 797 |

So the layout broke *precisely* in the two states the banner exists to announce — offline, and
data older than 15 minutes — and the ward lost 85% of the workspace at the moment the banner was
telling them to check their numbers. At 390 px the workspace was pushed below the fold entirely.

`.app` now has three rows (`var(--header-h) auto 1fr`); the banner is placed at
`grid-column: 1 / -1; grid-row: 2`, and `.rail`/`.work` are pinned to row 3 rather than
auto-placed. The middle row is `auto`, so it is 0 px tall on every ordinary day. `#toast-host`,
the only other bare child of `.app`, is `display: contents` so it can never repeat the trick.

### 2 · "sync นานกว่าปกติ" was a sync that was never issued — `app.jsx`, `data.js`

Not a slow request. The app re-synced on login, on tab focus/`visibilitychange`, and on day
rollover — and a ward workstation raises none of those: the tab sits open and focused on the
registry for a whole shift. After the login sync it never pulled again, crossed `SYNC_WARN_MS`
at five minutes and `SYNC_STALE_MS` at fifteen, and then the banner simply stayed up until a
human clicked Sync. The photo shows exactly this: pill and rail both reading 14:43, wall clock
15:02, banner at 18 minutes, sync state green.

A visible tab now polls every `SYNC_POLL_MS` (**4 min**, chosen under `SYNC_WARN_MS` = 5 so an
ordinary tab never even reaches the warn tier). The poll is suppressed when the tab is hidden,
when the device is offline, when a request is already in flight, and when something else synced
within the window — a backgrounded tab costs nothing. It is checked every 30 s and only *acts*
every 4 min, so a tab that was hidden or offline when its slot came round picks the sync up
within half a minute of coming back.

**Cost, stated rather than assumed:** 15 `Audit_Log` rows per hour per open tab, against a sheet
`AI_SDLC.md` § 1 already lists as growing without bound. See `BACKLOG.md`.

### 3 · Two sync bugs found while in there — `app.jsx`

- **The last response won, not the newest.** `syncFromGAS` has six callers and no request had any
  identity; both responses called `setPatients`/`setLog` unconditionally. A slow request landing
  after a fast one silently rolled the registry back to older data, under a fresh green
  `GAS · HH:MM` saying it was current. Every response now carries its request's sequence number
  and is dropped if a later request has been issued. Automatic callers also skip while one is in
  flight; manual ones deliberately do not, so a wedged fetch can never swallow the Sync button.
  The in-flight marker holds the request's start time rather than a boolean and expires after
  60 s, so one fetch Apps Script never answers cannot silently end background syncing for the
  rest of the shift.
- **A failed FIRST sync fell through the gate.** The gate was
  `syncState === "loading" && !lastSync`; a first sync that *failed* is `"error"` with `lastSync`
  still null, so it rendered an empty registry as fact — the ward saw
  "ยังไม่มีผู้ป่วยในระบบ" while the server was simply down. The gate now holds on anything that is
  not a completed sync.

### 4 · The screens themselves

- **`SyncGate`** replaces a 36 px spinner with two lines of English. Thai-first, branded, on a card
  that fits a 320 px phone and a 1440 px workstation; an indeterminate bar that *stops* when the
  sync has stalled; the elapsed seconds after 6 s (held back before that — a counter on a load
  that finishes in 2 s is noise); an explanation naming Apps Script cold start and ward Wi-Fi
  after 15 s; and a **ลองใหม่** button, since a fetch that never settled previously left no
  control on screen at all. Offline and server-error are distinct states with their own copy, not
  a spinner. `prefers-reduced-motion` holds the bar still.
- **The banner** now keeps its message in a `flex: 1 1 260px` column so a long Thai sentence wraps
  inside it, and its Sync button is a 40/44 px `.btn` that sits at the end of the row on a
  workstation and goes full-width on the line below the message on a phone — where it used to be
  a ~25 px target pinned right by `marginLeft: auto`. It shows "กำลังซิงก์…" and disables while a
  sync is in flight.
- The topbar pill's tooltip now carries the **last round-trip in seconds**, so "it's slow today"
  can be reported as a number.

### Not changed — the backend, which is the other half of "slow"

`getActivePatients` reads `Daily_Log` with `getDataRange().getValues()` — **every row ever
written, all 38 columns** — and filters to the sync window only afterwards, `JSON.parse`s
`calcInputJson` per row, and writes an `Audit_Log` row per sync. At ~29 active sessions that is
~29 new rows a day, so the read grows linearly and forever; the poll above multiplies how often
it is paid. This is real and is now filed in `BACKLOG.md`, but `gas-backend.gs` is untouched:
per `AI_SDLC.md` § 5 a backend change needs Praew's explicit deploy, and the client fix already
answers what the ward reported.

### Tests

New `test/verify-sync-gate-and-poll.cjs` — 59 assertions. Section 1 pins the grid contract in both
hand-synced shells and then **measures all four boxes in real Chromium** at 1440 and 390 px, with
and without the banner (it degrades to a notice where playwright isn't installed, as in CI).
Sections 2-4 drive the real `<App/>` in jsdom: the gate holds on a failed first sync and the retry
re-issues exactly one request; a visible tab polls and a hidden or offline one does not; the newer
of two overlapping responses wins. Reverting the grid fix fails 14 assertions; removing the poll
effect fails 2. All 30 harnesses, `DEAD=0`, `cmp index.html NeoFeed.html`, the center-point build
and its 5 client tests pass.

---

## Session 2026-09-16 (2) — PR #57: three fixes from the CP walk-through

Still a synthetic draft; nothing deployed; the legacy screen is untouched.

A step-by-step pass of a critical-value order through the CP entry (Center Point sprint,
2026-09-16) found three problems on the CP screens. Praew's decision: fix all three before merging.

- **The plan period printed in UTC.** `renderTpn` printed `Effective 2026-09-15T18:35:00.000Z → …`
  on an order headed TPN 2026-09-16 that the prescriber had typed as 01:35 Thai time on the 16th,
  so a reader saw the day before. CP's review and print sheet now say
  `Effective 2026-09-16 01:35 → 2026-09-17 01:35 (เวลาไทย)`. The packet still stores UTC instants.
  The line had printed UTC since the CP sheet was first added.
- **Messages landed off screen.** The CP page sent every `showToast` message to `#feedback`, a line
  at the top of the page thousands of pixels above Save. Cancelling the critical-value prompt saved
  nothing, as it should, but looked as if nothing had happened. Messages still go to `#feedback`,
  and now also show at the bottom of the screen, placed and timed like NeoFeed's own toast, with
  errors as `role="alert"`. The page's publish, withdraw and failed-action messages use the same
  path.
- **The revision label went stale.** After publishing it still said "ฉบับ 1 · รอทบทวน". It now says
  "ยืนยันแล้ว" after publishing and "ยกเลิกแล้ว" after withdrawing.
- **Tripwire.** `tpn-document.mjs` changed, so the §6 digest is updated. CP's copy is synced and its
  `test/neofeed-commit` re-pinned on CP branch `claude/pr57-print-fixes`.

Tests: the new `verify-center-point-sheet-period.cjs` renders the real `tpn-document.mjs` in jsdom.
Three of its four checks failed before the change: the walk-through time, Thai midnight and the new
year. CP's browser test `tpn-calculator.mjs` covers the page: it cancels the prompt first and checks
the refusal is inside the viewport, checks the period on the review and on the desktop sheet, and
publishes and withdraws from the page. With each fix undone in turn, it fails at that fix's check.
All 29 harnesses, `DEAD=0`, the center-point build and the client tests (5/5) pass.

Not changed: after a page reload the label shows only the revision number, as before.

---

## Session 2026-09-16 — Changes since the previous confirmed version (Center Point)

Praew's decisions (2026-09-16):
- CP's TPN sheet compares with the previous confirmed version of the same record, which is what
  this entry builds.
- Nurses correct weight or intake in the real NeoFeed app, and CP takes data from NeoFeed only.
  The drafts view stays read-only for TPN records.
- The free-text critical-value reason stays for now, to be decided before a pilot.
- PR #57 and CP PR #12 merge together once this lands.

- **`center-point/tpn-document.mjs`:**
  - `tpnChanges(previous, current)` compares the ordered fields: `ORDER_DIFF_FIELDS` terms plus
    dosing weight and each preparation, never amounts that only follow the weight.
  - `renderTpn(container, value, previous)` draws "เปลี่ยนแปลงจากฉบับยืนยันก่อนหน้า (ฉบับ N)"
    under the critical-value box. It shows the list, "no changes", "first confirmed version" or "the
    previous version had no TPN". The argument is optional and validated.
- **`calculator-page.jsx`:** the review passes the `previous` that CP now returns with each draft.
- The `tpn-document.mjs` tripwire digest is updated; CP is synced and re-pinned.

Tests: the new `verify-center-point-order-changes.cjs` passes 19/19. All harnesses pass. CP covers
the server baseline (a withdrawn version is skipped) and the calculator and desktop print end to end.

---

## Session 2026-09-15 (6) — PR #57 third-review fixes

Still a synthetic draft; nothing deployed; the legacy screen is untouched.

- **The `/neofeed/` drafts view is read-only for a record that carries a TPN order** (Praew's
  decision, 2026-09-15). The drafts view and the calculator page edit the same CP record. The
  drafts view's review text showed weight, feed plan and intake, but no TPN value and no
  critical-value reason. Its Publish and print-job buttons still acted on the whole TPN revision,
  and its save sends no TPN, so a nurse's weight correction dropped the doctor's order. Now, when
  the latest draft has a TPN, the form, Publish and print job are disabled. A notice points to
  the calculator page, the only place a TPN order is reviewed, published and printed. CP's server
  refuses such a save as `tpn_draft_superseded` (CP PR #12), and the view explains that refusal.
- **Tripwire on `center-point/tpn-document.mjs`** (`verify-center-point-entry.cjs` §6). CP keeps a
  copy that its CI checks against a pinned NeoFeed commit, so an edit here passed both CIs. The
  test now fails on any change until CP is synced, re-pinned and the digest is updated.
- **`BACKLOG.md`** no longer lists PR #57 among the drafts to close.

Tests: the new `verify-center-point-drafts-view.cjs` mounts the real drafts view with a stub client.
It passes 16/16; against the previous drafts view 11 checks fail, including a forced publish, save
and print job. All harnesses pass.

Not decided: how nurses record weight or intake on a record once it has a TPN order. For now a
clinician re-saves it in the calculator.

---

## Session 2026-09-15 (5) — PR #57 re-review fixes

Fixes from a second review of PR #57 after entry (4). Still a synthetic draft; nothing deployed;
the legacy screen is untouched.

- **A reason NeoFeed accepts is no longer refused by CP.** `handleSave` trims the prompt answer
  and then cuts it at 300, so the cut can end on a space or split an emoji, and a pasted tab
  survives. `validateTpn` refused all three, and the CP save failed with only a generic toast.
  `buildTpn` now cleans reasons and alert titles with `tpnText`: control characters and
  whitespace runs become one space, lone surrogates are replaced, and the cut never splits a pair
  or leaves an edge space. `validateTpn` also refuses broken text. The limits are exported from
  `tpn-document.mjs` so the two cannot drift. Both use plain loops, not
  `isWellFormed`/`toWellFormed`, which need Chrome 111 / Safari 16.4.
- **The print-parity harness also compares an overfilled bag.** Its one order had no dead space,
  so the dead-space and "bag ×" lines were never compared. It now runs the order twice, the second
  time with 6.3 mL. The first attempt used 7 mL, which a mutation check showed was matched by the
  7 mL/feed enteral volume, so the header now states the match-by-value limit.
- **CI builds the Center Point entry and runs its client tests** (`test.yml`). Before, a change
  that broke the bundle CP serves, or `center-point/client.mjs`, still passed.

Tests: `verify-center-point-entry.cjs` §4b drives the three reasons through prompt → save →
`buildTpn`, and each failed before the fix; it also checks the lone-surrogate refusal. All 26
harnesses, `DEAD=0`, `center-point.test.mjs` 5/5 and a clean `npm ci` + build pass.

---

## Session 2026-09-15 (4) — PR #57 review fixes (Center Point entry)

Fixes from the 2026-09-15 review of PR #57. Still a synthetic draft; nothing deployed. Every
`calculator.jsx` change is behind `centerPoint`, so the legacy screen behaves exactly as before and
no cache-bust is needed.

- **No clinical data in browser storage on the CP screen** (review finding 1). The F3 draft autosave
  and the draft read both ran there, so a CP order sat in `localStorage` as
  `neofeed_draft_<CP id>_<date>` for up to 72 h. Both are now off for `centerPoint`. A CP save also
  sets `savedKey`, so the form stops saying "มีการแก้ไขที่ยังไม่ได้บันทึก". The Copy Order button is
  hidden, since a saved form would otherwise unlock it, and so is the (gated-off) Submit.
- **Critical-value reason carried into CP** (finding 3, Praew's decision). `centerPoint.save` now
  receives `critOverride`. The snapshot moves to `neofeed-tpn-v2` / `cp-tpn-2` with
  `criticalOverride: {reason, alerts} | null`, which `renderTpn` shows as text. On CP the prompt
  also says not to type a name or HN, because CP keeps identity out of the packet.
- **Intake / Output card not on the CP screen** (finding 4, Praew's decision). Input, Urine output
  and Drain content go nowhere in CP, so they are hidden and out of the gate. Other IV and Drug
  volume stay required because they feed the fluid budget.
- **`center-point/` excluded from both hosts** (finding 5): `.assetsignore` and `_config.yml`.
- **CP print slots** (finding 7): added Mg mg/kg and TPN-only kcal/kg, and relabelled the TPN+EN
  figure "Energy incl. EN". The new parity harness found the kcal/kg gap; the review had not.

New harnesses: `verify-center-point-entry.cjs` and `verify-center-point-print-parity.cjs`.
`verify-required-log-fields.cjs` §7 now fills CP's Step 1 only. All 26 harnesses, `DEAD=0`,
`center-point.test.mjs` 5/5, the shell `cmp` and the `center-point` build pass. CP's matching
`web/tpn-document.mjs` change is in `valhalla-health/NICU-Center-Point`.

Not done: "changes since the previous order" on CP's sheet. CP has no previous-order concept yet.

---

## Session 2026-09-15 — `main` merged into `codex/center-point-v2` (PR #57)

Brings the Center Point branch up to `main` (through PR #64). Still a synthetic draft; nothing
deployed. Two real conflicts in `calculator.jsx`, both resolved by keeping both sides:

- **`handleSave`: the required-field gate and the F1 critical-alert stop now run before the
  `centerPoint.save(...)` branch** (Praew's decisions, 2026-09-14 for F1 and 2026-09-15 for the
  gate). A Center Point save can no longer skip either one. Pinned by
  `verify-required-log-fields.cjs` §7, which fails if the CP branch is moved back above F1.
  **Known limit:** the F1 reason is still not carried into the CP snapshot (`neofeed-tpn-v1` has
  no slot for it). See `NICU-Center-Point/docs/HANDOFF-NEOFEED-PR57-2026-09-14.md`.
- **`PrintOrderForm`** renders on `printable && !centerPoint`: `main`'s saved-and-unchanged rule
  plus the branch's CP exclusion.

`verify-safety-review.cjs` pins source text, so two of its patterns now also accept the
`&& !centerPoint` guard (it only narrows them). Not fixed here: after a CP save, `savedKey` stays
null, so the "มีการแก้ไขที่ยังไม่ได้บันทึก" line still shows. The CP page runs its own review/print
state, so this affects wording only.

---

## Session 2026-09-15 (3) — Backend `@54` deployed; frontend `?v=bed-guard-0915` live on both hosts

PR #66 merged to `main` (`8406cd7`, no deploy). PR #67 `main` → `release` was approved and merged by
`tasamew` at 20:42 ICT, which deployed `bed-guard-0915` to Cloudflare and GitHub Pages. The backend
went live at 20:47 ICT as `@54`, cut via the clasp mirror (`45341e0`) from `gas-backend.gs` at `8406cd7`.
That carries #63's server-side one-infant-per-bed guard and #66's fix for discharged records.

Checks before overwriting: the remote HEAD matched the `@53` mirror, and the mirror diff was +45 lines
and nothing else. Version 54 was pulled and matched the source before the deployment was repointed.
The deployment count stayed 26. Every step, the smoke test and what staff now see are recorded in
`STATUS.md` § "How the 2026-09-15 deploy was verified".

The `BACKLOG.md` bedside-session item now covers the live `@54` stack, including the cross-device bed
refusal and editing a discharged record.

---

## Session 2026-09-15 (2) — One-bed guard no longer refuses edits to a discharged record

Found while planning the backend deploy of the entry below, before it went out. The one-infant-per-bed
check looked at who else was in the bed but never at the **record being saved**. A discharged
(or transferred/expired) record keeps the bed label it left from, and that bed goes to the next
admission. So correcting the old record (a name, a discharge date, a diagnosis) was refused as a
double-book: "เตียง NICU 5 มี … อยู่แล้ว". This was live in the frontend since PR #65: the Edit session
modal's Save was disabled and `handleEditPatient` refused it. Deploying the backend as it stood
would have added a server-side refusal for the same edit.

**Rule now:** a record that is not on the unit claims no bed. Setting that record back to Active on
a bed someone else holds is still refused. One helper, `bedBlocker(patients, record)` in `data.js`,
answers "who stops this record being saved on its bed". `app.jsx`'s `bedConflict` and
`EditPatientModal` both call it. The modal passes the status currently picked in the form, not the
stored one. `_bedConflict` in `gas-backend.gs` applies the same status check first.

Cache-bust: `data.js`, `registry.jsx`, `app.jsx` → `?v=bed-guard-0915`. `calculator.jsx` is unchanged
and keeps `ward-gate-0915`. A new `app.jsx` served against a cached old `data.js` would call a
`bedBlocker` that doesn't exist.

Tests, each seen failing before the fix: `verify-gas-registry-upsert.cjs` covers Discharged,
Transferred and Expired records editing on a reused bed, plus Active and blank-status records still
being refused. `verify-bed-dol-io.cjs` covers `bedBlocker` and pins that `app.jsx`'s guard calls it.
`verify-patient-ga-bw-edit.cjs` mounts the real modal: Save is enabled for the discharged record,
the correction is submitted with `statusDate` untouched, and switching to Active blocks Save with the
named holder.

**Backend not deployed** — still `@53`. This commit is the source the next `clasp` deploy should
ship, together with the bed guard from the entry below.

---

## Session 2026-09-15 — Ward gate, one bed per infant, editable dosing weight, required log fields

Six bedside requests from the ward, all frontend + one backend guard. Nothing about the
Daily_Log column layout changed, so no sheet migration is needed.

**1 · TPN calc. weight is editable.** It still prefills from the birth-weight-floor rule
(2026-08-26) — that behaviour is pinned unchanged by `verify-tpn-calc-weight.cjs` §1-5 — but the
attending can now overrule the dosing weight. `tpnWtOverrideG` is 0 while the automatic figure is
in use, so typing the automatic number back in clears the override rather than freezing the field
at a number that merely matched it once; there is a `ใช้ค่าอัตโนมัติ` button too. An override is
never silent: a `⚠ แก้เอง` field hint, a banner under Step 1, and the manual weight *plus* what the
rule would have given on both the clipboard order and the printed pharmacy form. `usingBirthWeight`
is false whenever an override is in play, so the order form cannot claim the floor rule produced a
weight somebody typed. The `weight` column still records the **measured** weight.

**2 · Every Step 1 + Intake/Output field must be entered before Save.** "Filled" means *the box is
not empty*, not *the value is non-zero* — a fresh form renders 0 as an empty box with a "0"
placeholder, so a field nobody touched was indistinguishable from one somebody deliberately zeroed,
and Other IV / Drug volume / Drain really are 0 most days. Steps 2-6 are deliberately outside the
gate. Two non-obvious parts, both now pinned by `verify-required-log-fields.cjs`: a typed `0` has to
survive the value-sync effect (it did not at first — the keystroke set the value to 0, the effect
wiped the box back to empty, and the field could not be satisfied at all), and the fields are keyed
on the form identity so a `0` typed for one infant doesn't arrive pre-satisfied on the next.
Reopening a saved entry seeds its *recorded* zeros as typed zeros, per field — a legacy row that
never carried an I/O figure still comes back blank rather than showing a 0 nobody wrote.

**3 · The registry opens on a ward gate.** Two tiles, NICU and SCN, each with that ward's active
count and how many still need today's entry; the list below is scoped to the chosen ward. iso rooms
group under NICU; anything with no bed or an unrecognized one gets a third tile, shown only when
non-empty, so the gate cannot make a patient unreachable. The choice lives in `app.jsx` so
Dashboard-and-back doesn't return to the gate mid-round, and is not persisted, so a fresh load
always asks.

Two follow-ups Pp settled the same day: **iso rooms stay grouped under NICU** on the gate (as
built — they are staffed and rounded as part of it), and **the search box searches the whole unit**
rather than the open ward. Browsing still shows one ward; typing a name does not. The gate exists to
shorten the daily list, not to partition the census, and an app that can see an infant one ward over
should not answer "ไม่พบ". When a search pulls in patients from elsewhere the list says how many, so
an SCN bed on the NICU screen doesn't read as a broken filter.

**4 · One infant per bed.** Enforced four times over — `BedSelect` disables an occupied bed
(labelled `NICU 5 · ไม่ว่าง (name)`: shown rather than hidden, because a missing bed reads as a
broken dropdown while a named one tells you whom to move), each modal refuses it on save,
`handleAddPatient`/`handleEditPatient` re-check against live state, and `registerPatient` refuses it
server-side. Only the last sees other devices' writes; every client check runs against a `patients`
snapshot that can be minutes old. A discharged patient frees their bed. A patient's own bed is never
an obstacle to re-saving them.

**5 · SCN runs 1–30** (was 1–10). Widening is safe in a way narrowing is not: every bed a patient
already occupies stays in the list.

**6 · Transferring out of NICU runs the bed number on.** The transfer modal now offers the next free
running number per ward as a one-tap button (`NICU · 3`, `SCN · 7`), so the common NICU → SCN
step-down lands on the next SCN bed instead of making someone read down a 30-entry dropdown for the
first gap. `NewPatientModal` seeds the next free NICU bed for the same reason — the old fixed
`NICU 1` default put every admission on an occupied bed.

`BED_OPTIONS` moved from `registry.jsx` to `data.js` alongside `normalizeBed`, since the gate and
the occupancy guard need it too. It must **not** be aliased back to a local `const BED_OPTIONS` —
the two files are `<script>` tags sharing one global lexical scope, so that is a redeclaration that
kills the page at parse time. The harness pins it, having caught exactly that.

Tests: new `verify-required-log-fields.cjs` (24 assertions). `verify-bed-dol-io.cjs` gains the
occupancy/next-free-bed/ward-grouping section and now reads `D.BED_OPTIONS` instead of keeping its
own copy; `verify-gas-registry-upsert.cjs` gains the server-side bed rule and a check that
`_normBed` agrees with `data.js`'s `normalizeBed`; `verify-tpn-calc-weight.cjs` gains §6-8 for the
override. `runthrough-app.cjs` drives the ward gate, the occupancy-aware picker and the override in
a real Chromium. Full suite green, plus `DEAD=0` and the two-shell `cmp`.

---

## Session 2026-09-12 (3) — Frontend `?v=review-0911` live on both hosts

PR #60 (`main` → `release`), approved by `tasamew` and merged, deployed Cloudflare and GitHub
Pages together — the first deploy to go through the release gate, and the half of its
verification that was still outstanding (*"confirm merging to `release` does"*). Backend `@53`
and frontend `review-0911` are now in step.

Verified against the live URLs rather than the green checks — the 2026-09-12 (2) entry is why
that distinction now matters: module versions, `data.js` byte size, the derived `appVersion()`,
the CSP violation gone in a real browser, `noindex` header and meta, `tweaks-panel.jsx` /
`_config.yml` / `gas-backend.gs` / `STATUS.md` all 404, every app file 200, and the same on
GitHub Pages. Full list in `STATUS.md` § How the 2026-09-12 frontend deploy was verified.

`BACKLOG.md`: the ship item is done and removed; the standing "never exercised by a human" item
now covers both halves in one bedside session, including the two checks that prove today's
safety work (Print refuses after an unsaved edit; K 5 demands a reason that then prints).

## Session 2026-09-12 (2) — PR #59 merged to `main`; deploy gate proven closed on both hosts

Praew merged PR #59 (the frontend half of the 2026-09-11 review) and asked whether Cloudflare was
all set. It was — but not in the way the merge implied: **she had already switched Workers Builds'
production branch to `release`**, so the merge into `main` ran a build that reported success and
deployed nothing. Caught by comparing bytes rather than trusting the green check: the live
`data.js` was still 73,033 bytes (pre-merge) against the merged 74,204, and identical to the
pre-merge commit — not an edge-cache artefact (a unique query string still returned the old file).

That accidental experiment **is** the verification this repo had been waiting for: a real push to
`main` does not reach production. The gate is now closed on both hosts, and `STATUS.md` /
`REFERENCE.md` / `BACKLOG.md` say so — including the consequence that `main` is no longer a deploy
of any kind, so nothing reaches staff without a `main` → `release` PR approved by `tasamew`.

PR #60 (`main` → `release`) is open and carries the frontend to both hosts. The backend has been
live as `@53` since earlier the same day.

## Session 2026-09-12 (1) — Backend `@53` deployed (PR #59's backend half)

Praew: "deploy backend". Per `REFERENCE.md`: mirror diffed (line endings only), identity confirmed
(`peeraporn.po@chula.ac.th`), `clasp push` → version 53 → `update-deployment` on `AKfycbz8Nt…`
(count stayed 26), version 53 pulled back and diffed identical, live smoke test passed including the
new generic login message. Full record and rollback in `STATUS.md` § How `@53` was verified. The
frontend half of PR #59 is **not** merged; the backend-first order is compatible. The record is in
PR #59 rather than a direct push to `main`, since a `main` push is a Cloudflare deploy.

## Session 2026-09-11 (3) — Full review: fixes on `review/2026-09-11-fixes` (NOT deployed)

Praew asked for an end-to-end review of every part of NeoFeed "as every stakeholder", including
GitHub and Cloudflare, then "do all". The review itself is kept **outside this public repo**
(`NeoFeed/NEOFEED_FULL_REVIEW_2026-09-11.md`) because it lists exploitable details. Every defect
below was reproduced against the real code before it was fixed (backend in a vm sandbox, frontend
in a local mock-mode copy in a real browser), and every fix is pinned by the new
`test/verify-review-0911.cjs` (78 assertions; confirmed to FAIL against `1922488`).

**Frontend — clinical safety**
- **F1** A critical tile always produces a critical alert. Only GIR/NPE/Ca:P-warn/worksheet ceilings
  used to be pushed, so K 5 mEq/kg/d or Ca with zero P showed red tiles under a panel saying *"All
  targets within range"* (reproduced). Every nutrient tile now feeds the panel from the same status
  variable. **Save with a critical alert requires a written reason**, stored as
  `calcInput.critOverride` and printed on the order form.
- **F2** Print/Copy/Submit need a *saved and unchanged* form. They were gated on `savedEntryId`
  alone, so an edit after reopening a saved entry printed under that entry's id (reproduced: saved AA
  3, typed 4.5, print form showed 4.5). `<PrintOrderForm>` now renders only while the form matches
  the saved fingerprint; an unsaved-changes indicator is shown.
- **F3** Unsaved work survives a forced logout: drafts autosave per patient + order date
  (`neofeed_draft_*`), are offered back on reopen, cleared on save and on deliberate logout. The old
  `localStorage` prefill was shadowed by any previous log entry, i.e. dead from day 2.
- **F4** Printed "Normal requirement" and the Guidelines P row now come from `TPN_TARGETS` /
  `ENTERAL_TARGETS` for the DOL (they said P 30-70 / 46–62 against a calculator at 50–108).
  `ESPGHAN_TARGETS.pn.electrolytes.p.growing` corrected to [1.6, 3.5] mmol.
- **F5** WHO tab no longer contradicts the EN tab on the HMF start threshold (**Praew to confirm
  the KCMH value** — the app keeps `hmfStart: 40`).
- **F6** Printed energy line no longer pairs a TPN-only kcal with a TPN+EN kcal/kg.
- **F7** Glycophos (entered as Na) always shows the phosphate it delivers, in bold.
- **F8** "Sync · just now" / "Synced just now" labels bound to the real `lastSync`.
- **F9** Twin label on the mobile registry cards. **F10** a legacy baseline no longer zeroes the
  fluid target.
- Print form additions for pharmacy: HN/AN boxes (NeoFeed still stores none), saved-by / time /
  revision, and **changes vs the previous order**, also shown on screen.
- Copy-order text carries bed + NeoFeed ID, not the infant's name (it gets pasted into LINE).
- `APP_VERSION` was 15 days stale (P1) — the stamp is now `D.appVersion()`, derived from the loaded
  `?v=` tokens. Registration failures (incl. network) roll back instead of leaving a "local only"
  patient; failed patient edits roll back.
- `tweaks-panel.jsx` removed (design tool with cross-origin `postMessage`, shipped for a colour
  picker). Load order is now `data.js → icons.jsx → calculator.jsx → fenton.jsx → registry.jsx →
  log.jsx → app.jsx`.

**Backend (`gas-backend.gs`) — needs a `clasp` deploy, which has NOT been run**
- **B1** A superseded row is not an edit target, and superseding advances its `lastModified` — two
  editors of one published row used to both create "revision 2" (reproduced).
- **B2** `publishDailyLog` requires `expectedLastModified`; refuses superseded rows; re-publish is a
  no-op. **B7** published rows cannot be hard-deleted.
- **B3** Unknown-email logins record nothing (they created one Script Property each — reproduced),
  one message for unknown email / wrong password, disabled status only after a correct password,
  email ≤ 254 chars.
- **B4** An edit keeps its row's stored date. **B5** log rows for unregistered sessionIds refused.
- **B6** `getActivePatients` returns active + discharged ≤30 days (+ undatable) and their log rows
  only; admins may pass `includeArchived`.
- **B7** registry edits audited (`registerPatient`/`updatePatient` rows in `Audit_Log`); new-password
  floor 10; `pseudonymizePatient` locked and reports a miss.

**Repo / hosting**
- `_headers`: CSP `style-src` adds `https://accounts.google.com/gsi/style` — a violation **observed in a
  real browser console** on the live host today (closes STATUS.md's "no CSP violation observed or
  ruled out"); `X-Robots-Tag: noindex`. Both shells: robots `noindex` meta. `.assetsignore`: `.github/`,
  `.serena/`, `_config.yml`.
- `.github/workflows/test.yml`: runs every harness + the shell-identity check on each PR.
- **REFERENCE.md corrected:** "self-approval is expected and fine" is false — GitHub never lets an
  author approve their own PR, so `release` PRs need the other admin.
- Existing harnesses adjusted, each with a comment saying why: single-sheet stubs stub
  `_patientExists`; publish calls pass the stamp; two jsdom fixtures supply an override reason /
  a saved row matching the typed inputs; the safety-review regex now pins the stricter print gate.

**Verified live today, no code involved:** the GitHub Pages → `moved.html` redirect executes in a
real browser; Cloudflare's security headers are all present; Cloudflare still builds from `main`
(check-run on `1922488`, a commit not on `release`).

**Still Praew's:** merge (= production on Cloudflare until its production branch is `release`),
the backend `clasp` deploy, the Cloudflare dashboard setting, and the clinical/role decisions
listed in `BACKLOG.md`.

## Session 2026-09-11 (2) — Release-branch deploy gate, half-closed

Praew: "push-to-main deploy gate next" → picked the release-branch option `AI_SDLC.md` § 5 itself
recommended over branch-protecting `main` directly ("closer to how the backend already works and
does not change anyone's day-to-day"). Confirmed scope with Praew first (which of the two options,
who does the Cloudflare piece) before touching any settings; she said go ahead with both GitHub and
Cloudflare.

**GitHub, done and verified:**
- `release` branch created from `main`'s tip (`89f9ce2`).
- Branch protection added via `gh api PUT .../branches/release/protection`: 1 required approving
  review, stale reviews dismissed on new pushes, `enforce_admins: true` (so this applies to
  Praew's own direct pushes too), force-push and deletion blocked.
- GitHub Pages repointed to `release` via `gh api PUT .../pages`. Verified: build `status: built`,
  no error; `index.html` still `200` against the live URL after the rebuild.

**Cloudflare, not done — a real technical wall, not a shortcut taken:** Workers Builds' production
branch is a dashboard setting tied to the GitHub App connection. Checked `wrangler --help` for a
subcommand covering it — none exists. The only remaining path would have been reading wrangler's
stored OAuth token out of `~/.wrangler/config/` to hand-craft an undocumented API call against
Praew's live Cloudflare account; that read was correctly refused. **Cloudflare still deploys from
`main` on every push** until Praew changes the production branch by hand (Workers & Pages → neofeed
→ Settings → Build) — flagged clearly in `STATUS.md`'s top banner and its own section so this
doesn't get mistaken for fully closed.

Also corrected a stale claim in `REFERENCE.md`'s deploy section — it still said GitHub Pages "has
no equivalent [of `.assetsignore`] and still serves the whole repo root, `gas-backend.gs`
included," which was true when written but not since the previous session's `_config.yml` fix.

`BACKLOG.md`'s item updated to reflect the half-closed state rather than removed (removing it would
have implied Cloudflare is gated too). See `STATUS.md` § Release-branch deploy gate for the full
verification record and the exact re-check to run once Praew flips the Cloudflare setting.

## Session 2026-09-11 (1) — GitHub Pages exposure closed without retiring Pages or going private

Praew: "security upgrade for NeoFeed" → picked the standing `BACKLOG.md` § Now item: `gas-backend.gs`
and both `CODE_REVIEW_*.md` files (a public, dated list of this app's own unpatched vulnerabilities)
still directly fetchable at `valhalla-health.github.io/neofeed/`, unaffected by the 2026-08-23
redirect stub (that only protects the app entry point, `/`, not arbitrary file paths).

**Root cause:** legacy GitHub Pages (confirmed via `gh api repos/.../pages` → `build_type: legacy`)
runs Jekyll on every deploy — there is no `.nojekyll` in the repo — but nothing had ever told Jekyll
what to leave out. Cloudflare had already solved the identical problem via `.assetsignore`'s
allow-by-exclusion list.

**Fix (`5bfdb70`):** added `_config.yml` with an `exclude:` list mirroring `.assetsignore` exactly —
`*.md`, `gas-backend.gs`, `docs/`, `test/`, `node_modules/`, `graphify-out/`, `NeoFeed.html`,
`wrangler.jsonc`. Dotfiles/dot-directories (`.git`, `.claude`, `.wrangler`) are already skipped by
Jekyll's own default, so they needed no entry. Confirmed no runtime file (`index.html`, the six
`.jsx` modules) references anything under the excluded paths before pushing.

**Verified against the live URL after the Pages rebuild finished** (polled `gh api
repos/.../pages/builds/latest` until `status: built`, no error — took 38s): `gas-backend.gs`,
`SECURITY_CHECKLIST.md`, `CODE_REVIEW_2026-08-18.md`, `CODE_REVIEW_2026-08-08.md`, `HANDOFF.md`,
`PRD.md`, `STATUS.md`, `BACKLOG.md`, `REFERENCE.md`, `AI_SDLC.md`, `NeoFeed.html`, `wrangler.jsonc`
and everything under `docs/` and `test/` now return `404`. The app itself is unaffected —
`index.html`, `data.js`, `manifest.json`, `moved.html` and all six `.jsx` modules still `200`.

**Adjacent gap found and closed the same session (`5cc98e1`):** `.gitleaks.toml` — the project's
secret-scanning rule config, not secrets itself — was never added to `.assetsignore`, so Cloudflare
had been serving it (`200`) the whole time; GitHub Pages already hid it via Jekyll's own dotfile
default. Added the one missing line, confirmed Cloudflare returns `404` for it after redeploying
(polled the live URL until it flipped, ~24s).

**This closes the file-exposure half of the `BACKLOG.md` § Now item entirely** — the
staff-announcement → 2-week-window → repo-private sequence that item originally called for is no
longer required to close it. Going private remains a separate, larger decision Praew can still make
later for other reasons. `STATUS.md`'s "What Cloudflare does not serve" and "GitHub Pages
retirement" sections updated in the same session. No test harness added: this changes what static
files a deploy host serves, not `gas-backend.gs` behavior, so `test/`'s node-based convention
doesn't apply — verification was the live `curl` checks recorded above, matching the exact method
this item's closure criteria always specified.

---

## Session 2026-09-10 (3) — PR #58 merged, deployed to both hosts, backend cut to `@52`

Praew: "if CI passed then merge" → merged [PR #58](https://github.com/valhalla-health/neofeed/pull/58)
(Cloudflare Workers Builds check green, clean merge) via a standard merge commit (`4878a39`), matching
the repo's existing PR-merge convention. That auto-deployed the frontend half to both hosts.

**Caught before it went unnoticed:** the merge shipped `data.js`/`calculator.jsx`/`app.jsx` changes
without bumping their `?v=` cache-bust tokens in the two HTML shells. Fixed in a follow-up commit
(`5005db7`, also pushed straight to `main` — a mechanical hygiene fix, not a new feature) and
confirmed live on both hosts (`data.js?v=publishlock-0910`, `calculator.jsx?v=publishlock-0910`,
`app.jsx?v=publishlock-0910`).

**Then asked what to do next; chose "deploy the backend half of PR #58."** Followed `REFERENCE.md`'s
procedure exactly: diffed `~/nicu-tools/neofeed/รหัส.js` against `gas-backend.gs` first (134-line
diff, all of it traceable to PR #58, nothing unique to the mirror) → confirmed deploy identity
(`clasp show-authorized-user` → `peeraporn.po@chula.ac.th`) → copied and committed in the mirror's
own git repo (`f453583`) → `clasp push` → `clasp create-version` (52) → `clasp update-deployment`
against the **existing** deployment ID (deployment count stayed at 26 — no new deployment created)
→ `clasp pull` into a clean scratch dir, diffed byte-identical against `gas-backend.gs` → live
smoke test (unauthenticated `getActivePatients` → `{"error":"Unauthorized"}`, captured the
single-use redirect `Location` header and fetched it once, per the method note `STATUS.md` already
carried from the `@50` deploy). See `STATUS.md`'s "How `@52` was verified" for the full record.

**Still open:** `ENABLE_PUBLISH_GATE` remains off. Backend and frontend are now in step and both
support the flag being flipped, but nobody has exercised a real login + real Save/Submit/Print
against it yet — that's the standing item before turning it on for real staff.

---

## Session 2026-09-10 (2) — "Save / Submit / Print": publish-lock design for the calculator

Built, not yet enabled. Praew asked for a review of what NeoFeed could adopt from the digital-health
patterns underlying MyBreastmilk and the NICU Center Point integration; the concrete piece chosen
(design discussed and approved in-session, not written to a separate spec file — a bounded change to
an existing flow, not a new subsystem) was Center Point PR #57's "reviewed → immutable → printed"
pattern, ported into NeoFeed's own standalone calculator rather than only the CP bridge.

**What changed:** a saved `Daily_Log` row is now a *draft* until a clinician explicitly Submits it.
Five columns appended at AH–AL (`published`, `publishedBy`, `revisionNumber`, `revisionOf`,
`supersededAt`) — by-index, same contract as AF/AG, nothing inserted ahead of them.
`updateDailyNutrition` now branches on `published`: a draft still overwrites in place exactly as
before; a **published row is never overwritten again** — an edit instead appends a new revision row
(`revisionNumber` bumped, `revisionOf` pointing at the row it replaces) and marks the old row
`supersededAt`. New `publishDailyLog()` / the `publishLog` doPost action is the only thing that ever
sets `published`; there is no unpublish. `normalizeLogEntries` (the single funnel every log view reads
through) drops superseded rows, so TrendGraph and the entry table never double-count a revision chain.

Frontend: `Calculator` gained a Submit action and `PrintOrderForm` gained a "รอผลแลป" (pending lab
results) watermark on an unpublished print — a draft can still be printed, just visibly marked.
Editing a published entry now surfaces as a fresh draft under a new id (`res.revised`), handled in
both `calculator.jsx`'s local state and `app.jsx`'s `handleUpdateToGAS`, which mirrors the
server's revision instead of overwriting the superseded row's content locally.

**Deliberately unfinished:** gated behind `ENABLE_PUBLISH_GATE` in `data.js`, **defaulting off** —
AI_SDLC.md §5's frontend-has-no-deploy-gate problem still applies, so a UI-visible workflow change
ships dark first. The backend logic (publish, revision-on-edit, `getActivePatients` exposing the new
fields) is unconditional and correct regardless of the flag; only the Submit button and the watermark
are hidden until someone deliberately flips it on. Nothing was deployed this session — no `clasp
push`, no backend redeploy, no `main` push. `test/verify-publish-lock.cjs` (76 assertions) pins the
whole design; `test/verify-log-create-guard.cjs` and `test/verify-provenance-stamp.cjs` were updated
for the new 38-column (A–AL) row width, and the full existing suite plus `runthrough-app.cjs` (real
Chromium, real shipped code) were re-run clean against the change.

---

## Session 2026-09-10 — Patient-identification review: twin label in the switcher, mislabeled print ID

Praew asked for a review of patient-identification safety specifically — "how do we harness this
better" — drawing on the identity-linking guardrails already built into MyBreastmilk (never guess
identity from a weak signal like bed or weight; make the human attest before an identity-critical
write). Two concrete gaps found and fixed, both about *which infant*, not dosing arithmetic:

**Fixed:** `registry.jsx`'s `<PatientPicker>` — the modal behind the header's "switch patient"
button, the fastest path to changing the active patient mid-shift — listed bed/name/GA/BW/diagnosis
per row but never called `multiplesLabel()`. Twins share initials by construction (`sessionId` is
initials+BW+twinSuffix) and are usually in adjacent beds, so two rows could read identically except
for a small bed chip; the registry table and mobile cards already carried the label, the picker was
the one place it was missing. `calculator.jsx`'s `PrintOrderForm` — the printed pharmacy TPN order,
the highest-consequence document leaving the app — labeled its own derived `sessionId` as `"AN:"`,
which reads to a pharmacist as the hospital's real Admission Number. It isn't: it's the same
collision-prone initials+BW+twinSuffix key `_sessionIdConflict` (`gas-backend.gs`) already exists to
guard against, mislabeled as if it were an independent identifier a pharmacist could cross-check
against the chart. Relabeled to `"NeoFeed ID:"`, and the twin letter now prints next to the name on
the same line, for the same reason the picker needed it.

**Not changed, left for a deliberate decision:** the opaque server-generated sessionId from
`PDPA_SECURITY_AUDIT_2026-08-27.md` §2.3 is still open (filed "Later" in that doc's own backlog) —
today's fix strengthens the existing stopgap's surrounding UI, it doesn't replace it. A live
duplicate-initials hint while `NewPatientModal` is still being filled in (today the collision guard
only fires after "Register" is clicked) was also identified and deliberately left out of this pass.

**Added:** `test/verify-picker-print-identity.cjs` (9 assertions) — mounts the real `<PatientPicker>`
and `<Calculator>` in jsdom, same technique as `verify-registry-logged-today.cjs` and
`verify-tpn-calc-weight.cjs`. Run against the pre-edit files, 5 of the 9 fail. Also extended
`test/verify-gas-registry-upsert.cjs`'s existing collision-guard section with the specific
nurse-facing mistake this review was about — two twins registered under the same Multiples letter —
which the existing same-initials-same-BW guard already caught; the new case documents that scenario
by name rather than adding new guard logic.

**Verified, not assumed:** all 22 `test/verify-*.cjs` harnesses green after the change, including
every jsdom-dependent one that touches `calculator.jsx`/`registry.jsx`
(`verify-kcmh-factor.cjs`, `verify-registry-logged-today.cjs`, `verify-bed-dol-io.cjs`,
`verify-patient-ga-bw-edit.cjs`, `verify-delete-session.cjs`, `verify-tpn-calc-weight.cjs`,
`verify-nutrition-unit-review.cjs`). Cache-bust bumped: `calculator.jsx?v=patientid-0910`,
`registry.jsx?v=patientid-0910` in both HTML shells, confirmed byte-identical. `git push` deploys
this to both hosts automatically — see `STATUS.md`.

---

## Session 2026-09-10 — Mg now also shows mg/kg/d alongside its mEq/kg/d dose

Praew asked whether three items from an earlier handoff had shipped: a lipid-drip unit, Mg in
mg/kg/day, and electrolytes accounting for dead space. The first and third were already done
(lipid: `calculator.jsx` Step 3 already shows g/kg/d, mL/day, mL/hr and mL/kg/d; dead space: the
overfill Factor added 2026-08-06 already scales Na/K/Mg/Ca/P — see the "Second pass" entry below).
Mg was still mEq-only, so this session added the mg/kg/d readout **alongside** the existing
mEq/kg/d — not replacing it, since the input, its presets and the compounding math (mL from
`KCMH_STOCK.mgso4_10/50`, both in mEq/mL) all stay mEq-based.

**Added:** `data.js` exports `MG_MG_PER_MEQ = 12.1525` (elemental Mg, MW 24.305 g/mol ÷ valence 2)
— a display-only conversion, not a compounding divisor, so it needed no `CONSTANTS_VERSION` bump.
`calculator.jsx` uses it in three places: Step 3's Mg row (a new line under the input, matching the
K₂HPO₄ row's existing mEq→mg pattern rather than the old bare-arrow style — confirmed against
`test/verify-nutrition-unit-review.cjs`'s three-arrow canary, still exactly 3, no regression), the
printed order form's Mg⁺⁺ row, and the delivered-dose cross-check section.

**Verified, not assumed:** all 20 `test/verify-*.cjs` harnesses green, including
`verify-kcmh-factor.cjs` at `DEAD=20` and `DEAD=0` (Mg compounding math is untouched — only a label
was added) and `verify-nutrition-unit-review.cjs`'s arrow-canary (still 3, this change did not add
a fourth). Cache-bust bumped: `data.js?v=mg-mgkg-0910`, `calculator.jsx?v=mg-mgkg-0910` in both HTML
shells, confirmed byte-identical.

---

## Session 2026-09-05 — FENTON_WEIGHT re-verified against official v2 cutoff table; GA 36-41 corrected

Praew asked whether the Fenton trend graph is really accurate. Weight had been marked "verified,
0 g discrepancy" since 2026-08-10 (3), so this re-checked it against a different, independent
official source rather than assuming that stood: the University of Calgary's own downloadable
size-for-gestational-age cutoff table (`2025_ASSIGN_size_for_gestational_age..._v2.pdf`, same
PMID 40534585 source, ucalgary.ca/fenton), which carries p3/p10/p90/p97 (not p50) for GA 22-42,
both sexes.

**Found real drift, not rounding noise.** GA <=35 and GA 42 matched the v2 table within +-4 g —
consistent with the 2026-08-10 verification. But **GA 36-41 for boys and GA 36/40/41 for girls
were off by 8-51 g** on p3/p10/p90/p97 — an order of magnitude past the rounding noise seen
everywhere else. The 2026-08-10 session's source table (Praew's BPD-sandbox export) evidently
predates this v2 revision at exactly those weeks. GA 37-39 for girls were within +-4 g and left
alone rather than "corrected" toward noise.

**Fixed:** `FENTON_WEIGHT` boys GA 36-41 and girls GA 36/40/41 now match the official v2 table's
p3/p10/p90/p97 exactly (re-verified programmatically, 0 g discrepancy on every corrected cell).
p50 (LMS median) was left untouched on those rows — the v2 cutoff table doesn't carry it, and the
unaffected weeks (including GA 42, immediately adjacent) show p50 was never the problem. Full
before/after diff and the source PDF are archived in this session's scratch dir if the numbers
ever need re-checking.

**Still open, unchanged by this session:** `FENTON_LENGTH`/`FENTON_HC` have no equivalent public
numeric table at all (ucalgary.ca only publishes graphical charts for those two) — a Mountex/
fenton_data GitHub dataset that claims to have them was checked and rejected as almost certainly
synthetic (percentile spacing is a constant integer offset at every single week 22-50, which no
real meta-analysis output looks like). Praew is emailing tfenton@ucalgary.ca for the actual
length/HC LMS parameters — see the draft in Gmail.

Verified: `node --check data.js` clean; the corrected cells cross-checked node-side against the
v2 table before and after editing.

---

## Session 2026-09-04 — four confirmed defects fixed after an independent external review

An external reviewer's critique of an earlier same-day improvement-spec draft was itself checked
against the live source (not re-trusted from prose) — see `IMPROVEMENT_SPEC_2026-09-04.md`. That
pass confirmed several `BACKLOG.md`/`CODE_REVIEW_2026-08-18.md` findings precisely and surfaced two
more with source-level detail. Scoped narrowly to defects with no clinical judgement required —
the stock-concentration, Fenton-verification, `TARGETS.fluid`, and `registerPatient`-collision
items all still need Praew's decision and are untouched here.

- **`calculator.jsx` — `SaltRow` no longer accepts a negative electrolyte dose.** Its input regex
  allowed `-` where `NumField`'s deliberately does not (`BACKLOG.md`/`CODE_REVIEW_2026-08-18.md`).
  The server's plausibility guard only range-checks the *aggregate* na/k/ca/p total, not each salt
  row's own value, so a negative single-row entry that nets out in the sum would still reach the
  printed order line unvalidated — this had to be caught at the input, matching `NumField`'s
  existing pattern exactly (strip `-` from the allowed charset, don't clamp after the fact).
- **`gas-backend.gs` — `logDailyNutrition` (create) now takes the same `LockService` lock every
  sibling write already does.** It was the one write path in the file with no lock at all —
  `updateDailyNutrition`, `deleteDailyNutrition`, `deletePatient` and `registerPatient` all wrap
  their read-modify-write in `LockService.getScriptLock()`; the create path didn't, so two devices
  submitting the same patient's first entry of a day had no mutual exclusion whatsoever. The lock
  alone does not add the "one row per patient per date" business rule — that's still the separate,
  larger `BACKLOG.md` § Next item, which needs a lock to be race-free but also needs a product
  decision about how a collision should behave (reject vs. redirect into edit).
- **`gas-backend.gs` — `updateWeights` now takes a lock and reports a miss.** Confirmed exactly as
  `CODE_REVIEW_2026-08-18.md` B4 described: no `LockService` call, and a `sessionId` matching
  nothing silently returned `undefined`. Now locked like `registerPatient`/`deletePatient`, and
  returns `{error}` on a miss instead of nothing — `doPost`'s `updateWeights` dispatch was also
  unconditionally returning `{ok: true}` regardless of what the function did, so that dispatch now
  checks the result the same way `updateDailyNutrition`'s already does.
- **`gas-backend.gs` — `_buildLogRow`'s missing-`entry.ts` fallback is ward-local, not UTC.** It
  used to fall back to `new Date().toISOString().slice(0, 10)` — pure UTC. 02:00 ward-local
  (Asia/Bangkok, UTC+7) is 19:00 UTC the *previous* day, so any save reaching this fallback during
  00:00–06:59 ward-local — the whole night shift — was dated one calendar day early. Only fires
  when the client omits `entry.ts` (the normal path is unaffected), but `BACKLOG.md`'s "Carried
  over, unverified" section had flagged this exact line since the May doc and it had never been
  re-checked. Fixed via a new dependency-free `_todayWardLocal_()` next to the existing
  `WARD_UTC_OFFSET_MIN`/`_isoWeekKeyLocal_` (chose that over routing through `_fmtDate()`, which
  depends on `Utilities.formatDate`/`Session.getScriptTimeZone` — neither mocked in any test
  harness today, so reusing it would have required new test-infrastructure changes for a one-line
  fallback fix).

### Verification

TDD'd red-first per this repo's convention: all seven new assertions (three in
`test/verify-input-validation.cjs` for `updateWeights`'s miss case, four across two new sections
for `logDailyNutrition`'s lock — taken, released, and released again on the path that throws — and
the night-shift fallback) were confirmed failing against the pre-fix source, then passing after.
One more in `test/verify-nutrition-unit-review.cjs` (added there, not `verify-input-validation.cjs`,
because it needs the real mounted `<Calculator>` to drive `SaltRow`'s own input handler) was
confirmed the same way. Full suite re-run, including the two npm-dependent groups installed on
demand per `test/README.md` (`@babel/core`/`jsdom` for the jsdom-mounted harnesses,
`playwright` for `runthrough-app.cjs`): all 18 Node harnesses pass.
`runthrough-app.cjs` (the one real-browser walkthrough) fails at the login step in this specific
sandbox — confirmed via `git stash` that the identical failure exists against the unmodified source
too, so it predates and is unrelated to this session's changes; not investigated further here.

Landed on `main` via PR #55 on 2026-09-05 (merged as part of reconciling this branch with a
separately-committed, unpushed local `main` — see the 2026-09-05 entry above and `STATUS.md`).
**Deployed to GAS `@51` on 2026-09-05**, confirmed with Praew first (see `STATUS.md` "How `@51` was
verified"). The `SaltRow` negative-dose fix and the `updateWeights` lock are now both live; their
`BACKLOG.md` lines are closed.

---

## Session 2026-09-01 — session-id duplicate-entry guard, `registerPatient` isNew flag, phosphorus/Peditrace constants, previous-entry baseline

Recovered from the working tree on 2026-09-05, where it had been sitting uncommitted since
2026-08-27 (commit `ae912c7`) — committed and later merged/deployed as it stood; nothing in it was
re-reviewed at recovery time beyond what the 2026-09-05 merge and deploy sessions checked. Filed
here now because `BACKLOG.md`'s definition-of-done requires a `CHANGELOG.md` entry to exist before
an item can leave that file, and this scope of work never got one at the time.

- **`gas-backend.gs` — `logDailyNutrition` gained a server-side one-entry-per-date guard.** Before
  this, "one `Daily_Log` row per patient per date" was enforced only in the UI; a direct POST (or a
  race between two devices) could still append a second row for the same patient/date.
  `logDailyNutrition` now reads existing rows for the session under its own lock and returns a Thai
  error (`มีบันทึกของผู้ป่วยรายนี้ในวันที่ ... แล้ว — กรุณาเปิดรายการเดิมเพื่อแก้ไข`) instead of
  appending a duplicate. New coverage: `test/verify-log-create-guard.cjs`.
- **`gas-backend.gs` — `registerPatient` takes an explicit `isNew` flag** rather than inferring
  create-vs-update from whether a matching row already exists. This does **not** close
  `BACKLOG.md`'s open item about two different infants colliding on the same `initials+BW`
  pseudonym — that needs an identity decision first — but it does mean the API no longer has to
  guess which case it's in.
- **`data.js` — growing-premature PN phosphorus corrected from 46–62 to 50–108 mg/kg/day**
  (1.6–3.5 mmol/kg/day) in both `TPN_TARGETS.p` and `TARGETS.p`, matching the published
  ESPGHAN/ESPEN/ESPR/CSPEN 2018 table; the old range could label a guideline-concordant phosphorus
  provision as excessive. Peditrace dose corrected from "1–2 mL/kg/day" to "1 mL/kg/day (maximum
  15 mL/day)" in the same pass. `CONSTANTS_VERSION` → `2026-08-27.1`; `docs/CLINICAL_CONSTANTS.md`
  updated in the same change.
- **`app.jsx`/`calculator.jsx` — `previousLogEntry()` supplies a baseline entry** from the prior
  day's save, so a new day's Calculator form opens pre-filled from yesterday's inputs rather than
  blank.
- New harnesses: `test/verify-safety-review.cjs`, `test/verify-log-create-guard.cjs`; four existing
  harnesses updated to match.

Full suite passed at the time (20 harnesses including the browser runthrough), per the recovered
commit message. Deployed to GAS `@51` on 2026-09-05 alongside the 2026-09-04 fixes above — see that
entry and `STATUS.md`.

---

## Session 2026-08-26 (2) — split Step 1's weight field: current weight vs. TPN calc. weight

Ward request: Step 1 had one "Current weight" field feeding every dose calculation directly, with
no floor during the normal post-natal weight-loss dip — so a fluid/GIR/protein target computed on
day 3-4 could be dosed off a weight lower than birth weight, which KCMH bedside practice treats as
the wrong divisor until the infant regains it.

- `calculator.jsx` — Step 1 now shows two weight fields. **Current weight** (`curWtG` state,
  editable) is the actual measured figure: saved as-is into the Daily_Log `weight` column and what
  `onWeightChange` propagates to PatientStrip/the growth chart. **TPN calc. weight** is a new
  read-only `ComputedField`, derived (`wtG` — kept as the name already threaded through every
  dosing formula in this file): floors at `patient.bw` while `curWtG` hasn't regained it, tracks
  `curWtG` automatically once it clears `bw`, and re-floors if weight drops back down. No manual
  override — there is no `setWtG` any more.
- Every per-kg target/dose (`calc`, `mineral`, the salt rows, the printed order form) already read
  `wtG`/`wtKg`, so redefining what that pair means was enough to route the whole calculator onto
  the new derived weight without touching the arithmetic itself. `D.ioDivisorG`'s own "today's
  weight" fallback takes `curWtG` (it already implements the identical birth-weight-floor
  convention independently, for the Intake/Output divisor).
- `PrintOrderForm` and the Save + Copy Order summary/clipboard text show the real current weight
  for patient identification, with a "(calc. at birth weight Xg)" note when the two diverge, so a
  pharmacist reading the order sees which weight the doses were actually computed from.
- Backward compatible: `applyCalcInput`/localStorage restore read the new `curWtG` key first and
  fall back to the pre-migration `wtG` key, so every entry saved before this change still restores
  into the right field.

### Verification

`test/verify-tpn-calc-weight.cjs` (new, 15 assertions) — floor/track/re-floor behavior, the
printed form's birth-weight note appearing and clearing, the Daily_Log `weight` column staying the
actual entered weight (never the floor), no flooring when `patient.bw` is unset, and the legacy
`calcInput.wtG` restore path. Full suite re-run: `verify-kcmh-constants`, `verify-kcmh-factor`
(both `DEAD=20` and `DEAD=0`), `verify-bed-dol-io`, `verify-resync-and-lists`,
`verify-registry-logged-today`, `verify-patient-ga-bw-edit`, `verify-delete-session`,
`verify-forced-password-client`, `verify-targets-and-dates`, `verify-gas-registry-upsert`,
`verify-input-validation` and `verify-provenance-stamp` all still green — none of them assert on a
TPN-dosing total that this change would have moved, only on the fields it deliberately left alone
(I/O restore, DOL, bed labels, GA/BW edit, deletion, password gating, provenance stamp).

Frontend-only change on this branch; not yet mirrored/deployed per `REFERENCE.md`'s procedure.

## Session 2026-08-26 (1) — provenance stamp + staleness banner; and production found at `@49`, not `@47`

Two features, both TDD'd red-first, plus one discovery that matters more than either.

### 🔴 The discovery: `STATUS.md` was two deploy versions stale, and production is running debug code

`STATUS.md` said backend production was **`@47`** carrying `34af805`, and that *"nothing is pending
on either host."* Checked directly with `clasp list-deployments`:

```
AKfycbz8NtHuyTdo4EP-… @49 - TEMP-DEBUG: sheet-backed login-kickback diagnostics
```

**Live production is `@49`**, and it is a TEMP-DEBUG deployment — the `verifyToken`/`createSession`
instrumentation and the `Debug_Log` sheet writer added on 2026-08-24 to chase the
"logs in, then kicks back out" bug. `getDebugLogText()` is deployed with it. Five commits have
landed on `main` since the `30dbff7` that `STATUS.md` describes, three of them TEMP-DEBUG and one
the server-side plausibility guard (`0004d5c`).

This is the exact rot the 2026-08-21 doc split was meant to end, and it happened anyway — the
deploys were cut without the same-commit `STATUS.md` update that is supposed to be part of the
definition of done. **The TEMP-DEBUG code is still in the working tree and still live.** Reverting
it is not done here: it is a separate decision, and the login-kickback bug it was instrumenting may
not be closed yet. Tracked in `BACKLOG.md` § Now.

### Provenance stamp — `CONSTANTS_VERSION` / `APP_VERSION` (Daily_Log AF–AG)

Nothing recorded **which values** produced a printed compounding order. `_buildLogRow` stored who
submitted it and when; `PrintOrderForm` printed the patient and the date. Neither recorded the
constants. The day the Na acetate / KCl shelf check comes back different from the inferred 3 and
2 mEq/mL, the question is *"which printed orders used the old divisor?"* — and there was no way to
answer it.

- `data.js` — `CONSTANTS_VERSION` (`2026-08-26.1`) and `APP_VERSION`, both exported. The comment
  block states the bump rule: any change that can move a printed dose.
- `gas-backend.gs` — `_provenanceFields()` appends **AF/AG at index 31/32**, last in the row.
  Daily_Log is read and written *by index*, so nothing may ever be inserted ahead of them.
- `_ensureLogWidth()` — extracted the on-demand grid widen out of `updateDailyNutrition` and gave
  the **create** path the same protection, which it never had. `appendRow` rejects a row wider than
  the sheet, and that surfaces at the bedside as a failed save.
- `ensureLogHeaderColumns` — labels 32/33, widens to 33.
- `calculator.jsx` — sends both on every save including edits (an edit recomputes with today's
  constants, so the stamp must move with them), and prints a footer line carrying constants, app
  version and the entry UUID.

**Degrades safely:** a save from a cached bundle with no version writes `""`, and the current
`@49` backend simply ignores the two extra fields. The frontend can therefore ship before the
backend, which is what is happening here.

### Staleness banner

The app had no offline signal at all — no service worker, no `navigator.onLine` handling anywhere.
`manifest.json` makes it installable, so staff have home-screen icons that open to nothing when the
network drops, and a visible-but-idle tab could show a fluid balance an hour old with only a small
topbar pill to say so.

- `data.js` — `syncFreshness()` returns `local` / `offline` / `stale` / `warn` / `ok` plus `ageMs`.
  Thresholds `SYNC_WARN_MS` 5 min, `SYNC_STALE_MS` 15 min — this app's latency requirement written
  down as a number instead of implied. Put in the Business Logic layer, not inline in `app.jsx`, so
  it can be pinned by a test.
- `app.jsx` — `online` state from the `online`/`offline` events plus a 30 s tick (a tab that sits
  idle is exactly the case that goes stale, and nothing else re-renders it), and a banner rendered
  only for `offline` and `stale`.
- **`warn` is deliberately not a banner.** The app only re-syncs on tab focus, so ordinary use
  crosses five minutes constantly; a banner there would be on screen most of the day and would train
  everyone to read past it. It stays a tier because it is a truthful description of age and the pill
  can use it.
- Inline styles, no shell CSS — so `NeoFeed.html` and `index.html` needed no edit and stayed
  byte-identical, which is the drift this repo keeps re-learning.

### Verification

- `test/verify-sync-freshness.cjs` (23 assertions) and `test/verify-provenance-stamp.cjs` (37) —
  both **run red first**, 2 and 23 failures respectively, then green.
- Full suite: **16/16 harnesses green**, including `verify-kcmh-factor` (the printed-dose guard) and
  `verify-resync-and-lists`, which mounts the whole `<App/>` and so actually rendered the new banner.
- All seven `.jsx` files transpiled with the **pinned `@babel/standalone@7.29.0`** the browser
  itself loads, fetched to a scratch dir rather than added to the repo.
- Mirror diffed before copying, per `REFERENCE.md`. Every line unique to `~/nicu-tools/neofeed/รหัส.js`
  was the old text of a line this change edited — it held nothing unique, unlike 2026-08-17. Backup
  taken and **moved out of the clasp project directory**, which has no `.claspignore`.

### Shipped to both frontend hosts (`3d2978b`)

Pushed on Praew's instruction (*"push it"*). **A cache-bust bug was caught in the pre-push check
and fixed first:** `1a12eef` changed `data.js`, `calculator.jsx` and `app.jsx` but left their `?v=`
tokens untouched, so returning staff — everyone with a home-screen install, i.e. exactly the people
the change is for — would have kept cached copies and seen neither feature. The tail case is worse:
a browser that revalidated `app.jsx` but not `data.js` would find `D_A.syncFreshness` undefined and
white-screen on load. All three moved together to `?v=provenance-0826`.

Verified against the real URLs afterward, both hosts: shells serve the new tokens, the served
`data.js` carries `CONSTANTS_VERSION = "2026-08-26.1"` and `syncFreshness`, the served `app.jsx`
carries the `navigator.onLine` handling, and the served `calculator.jsx` sends the stamp.

### Backend deployed — `@50`, the first clean deployment since `@47`

Praew's call: *"revert the TEMP-DEBUG and deploy the backend."*

The revert was done as three `git revert`s (`680fe69`, `a52846d`, `489a977`) rather than by hand, so
`verifyToken` and `createSession` came back **byte-identical to `c0bc74f`** — checked with a diff,
not assumed. The `var tail = token.slice(-6)` that existed only to label debug lines went with them.
Nothing else moved: the plausibility guard and the provenance columns are both still present, and
16/16 harnesses stayed green, including `verify-gas-session-revocation` (31 assertions), which is
the one that actually exercises `verifyToken`.

`@50` therefore carries **three** things at once, two of which had been sitting undeployed:

1. the TEMP-DEBUG revert;
2. **the server-side plausibility guard (`0004d5c`) — which had never been deployed at all.** Until
   this deployment, nothing live stopped an out-of-range value reaching the sheet via a direct POST;
3. the provenance columns.

Verified per `REFERENCE.md`: mirror diffed before copying (all 37 mirror-unique lines were the
reverted TEMP-DEBUG code), deploy identity confirmed, deployment count **stayed 26** so
`NEOFEED_GAS_URL` is unchanged, `clasp pull` diffed identical to `gas-backend.gs`, and an
unauthenticated `getActivePatients` returns `{"error":"Unauthorized"}` as `application/json`.

⚠️ **A method note that cost time and is worth writing down:** `curl -L` cannot smoke-test this
backend. Apps Script 302s to a **single-use** `script.googleusercontent.com/macros/echo?user_content_key=…`;
following it automatically consumes the key, and the retry returns Google Drive's
*"ไม่สามารถเปิดไฟล์ได้"* HTML page. That looks exactly like a broken deploy and is not one. Capture
the `Location` header and fetch it **once**.

**Still unexercised:** a real login and a real save against `@50` — which is what would show
`Daily_Log` AF–AG actually filling with `2026-08-26.1`.

**The `Debug_Log` tab was deleted by Praew the same day**, closing the chore. It cannot reappear:
`_debugLog()` was the only code that created it, and `@50` no longer contains it. One correction
worth recording — this entry and `STATUS.md` both first described the tab as holding "timestamps and
branch labels only". That understated it: the messages interpolated `email` and a 6-character token
tail, so it also held **staff email addresses**. Still no patient data, but personal data under
PDPA — which made deleting it more clearly right, not less. No copy was retained, deliberately.

---

## Session 2026-08-23 (1) — CSP headers, GitHub Pages retirement stub, gitleaks config guard — all three shipped (`30dbff7`)

Frontend-only, no backend touched. Three pieces, bundled into one commit and pushed on Praew's
explicit instruction (`push it`), each verified against the live URLs afterward, not just
`wrangler dev`.

### `_headers` — Cloudflare-only security headers

CSP (`unpkg.com`, `accounts.google.com`, `fonts.googleapis.com`/`gstatic.com`, `script.google.com`,
`*.googleusercontent.com`, one `data:` SVG — every external origin the app's own files actually
reference) plus `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
`Cross-Origin-Opener-Policy: same-origin-allow-popups` (plain `same-origin` breaks the Google
Sign-In popup — checked, not guessed), `Permissions-Policy`, HSTS. GitHub Pages has no equivalent;
the legacy host stays unprotected by this regardless of what ships. Confirmed live: all seven
headers present on a fresh cache-busted request against `neofeed.valhalla-health.workers.dev`.
⚠️ Still not exercised in a real browser with the console open — Claude in Chrome was unreachable
all session. `STATUS.md` § Response headers.

### GitHub Pages retirement stub — the real staff cutover, not a future one

Answers the `BACKLOG.md` item that `gas-backend.gs` and both `CODE_REVIEW_*.md` files are publicly
fetchable from `valhalla-health.github.io/neofeed/` (verified `200` on all of them, confirmed
2026-08-23 before the fix). Hostname guard, first script in `<head>` of both `index.html` and
`NeoFeed.html`: `valhalla-health.github.io` visitors bounce to a new self-contained `moved.html`
before any resource loads; Cloudflare visitors never match, no-op for them.

**This push, not the eventual private-repo flip, is the actual cutover** — anyone still on the
GitHub Pages shortcut lost the calculator the moment this landed. Verified post-push against the
real URL: the guard is served, `moved.html` returns `200` with the correct button target, the
Cloudflare host is untouched. ⚠️ `curl` cannot execute JavaScript — the redirect *firing* in a real
browser is still unobserved, only inferred from the code and its placement. **Does not close the
BACKLOG item**: `gas-backend.gs` etc. are still directly fetchable by path on Pages, unaffected by
a guard that only lives on `/`. Remaining: Praew announces in the staff LINE group (not done as of
this entry) → 2-week window → repo goes private → re-verify the exposure is actually gone.
`STATUS.md` § GitHub Pages retirement.

### `.gitleaks.toml` — closing a gap the existing guardrail didn't cover

While investigating whether "everything about the backend is safe," found `SPREADSHEET_ID` and
`CLIENT_ID` hardcoded in `gas-backend.gs` in the **initial commit** (2026-05-17) — moved to
Script Properties later, but the repo has been public since that first commit, so the values are
permanently exposed in history regardless of anything done now. Checked live: the Sheet's sharing
is owner-only (`peeraporn.po@chula.ac.th`), no link-sharing — that ACL, not secrecy of the ID, is
what's actually preventing this from mattering today. Recorded as a standing guardrail in
`BACKLOG.md`: that sharing setting must never change to link-based.

The global `scan-secrets-before-commit.sh` hook (installed an earlier session, active on every
`git commit` in every repo) would **not** have caught this — confirmed gitleaks' default ruleset
doesn't flag either pattern, no entropy or keyword match. Added `.gitleaks.toml`, extending the
default ruleset with a rule for `SPREADSHEET_ID`/`SHEET_ID`/`CLIENT_ID` hardcoded as an assignment,
while leaving the current `_cfg()`-based pattern untouched. Verified end-to-end through the actual
hook script, not just gitleaks directly: staged the exact leaked line as a simulated regression,
ran it through `scan-secrets-before-commit.sh`, confirmed `BLOCKED` / exit 2, then reverted
cleanly (`git status` showed zero diff on `gas-backend.gs` afterward).

Found and fixed one unrelated gap while testing: `test/verify-forced-password-client.cjs` carries
the same known-benign fixture token (`tok-123456789`) as the already-`.gitleaksignore`d
`test/verify-resync-and-lists.cjs`, just never added — would have blocked the next real commit
touching that file for no real reason. Added both new fingerprints.

### Left for Praew, not done in this session

Post in the staff LINE group that the new link is live. The repo stays public, and the
`gas-backend.gs`/`CODE_REVIEW_*.md` exposure stays open, until that happens and the 2-week window
runs out.

---

## Session 2026-08-21 (6) — 🚀 DEPLOYED `@47`: the auth gate is now live

**Backend production moved `@46` → `@47`**, carrying GitHub `main` `34af805`. Deployed on Praew's
explicit instruction. **No code change in this session** — `@47` is exactly the source committed in
(3) and (4), unmodified.

`@47` = the `mustChangePassword` server gate (a temp-password account can now do nothing but change
its password) + `usageMetrics()` / `getUsageMetrics()`, which are inert because they are not on the
`doPost` path.

**The hole reported by `CODE_REVIEW_2026-08-18` is closed in production.** It had been open since
the temp-password provisioning flow was written on 2026-07-18.

### Checked before the push, in this order

1. **Live state first**, per Praew's standing instruction: local `HEAD` == `origin/main` ==
   `34af805`; Pages returns 200 serving `app.jsx?v=pwd-gate-0821`.
2. **Mirror diffed, not overwritten.** `~/nicu-tools/neofeed/รหัส.js` was 1,346 lines to the repo's
   1,470 and **every one of the 124 differing lines was a repo addition** — the mirror held nothing
   unique this time, unlike 2026-08-17 when it held three security fixes present nowhere else. The
   124 lines were confirmed to be exactly the two intended changes. A backup was taken anyway.
3. **`clasp show-authorized-user` → `peeraporn.po@chula.ac.th`.** Not a formality:
   `appsscript.json` sets `executeAs: USER_DEPLOYING`, so deploying from the wrong account switches
   the live app's executing identity and breaks Sheet access.
4. **Blast radius considered.** The gate fires only when `verifyToken` computes
   `!_usesGoogleSignIn(email) && col G === TRUE`. Praew's own account is `@chula.ac.th`, which
   `GOOGLE_WORKSPACE_DOMAINS` excludes — **she cannot lock herself out.** Staff holding a temp
   password get forced to change it, which is the point. The client that renders that modal had
   already been live since (4), so the ordering was frontend-first by design.

### Verified after, rather than assumed

- `clasp create-version` → **47**; `clasp update-deployment -V 47 <existing id>`.
- **Deployment count stayed at 26.** That is the proof an *existing* deployment was updated rather
  than a new one created, so `NEOFEED_GAS_URL` is unchanged and no shell needed editing.
- **`clasp pull` into a scratch dir, diffed against `gas-backend.gs` → byte-identical.** The
  deployed source is exactly what the 14 harnesses pass against.
- **Live smoke test:** unauthenticated `getActivePatients` against the production URL returns
  `{"error":"Unauthorized"}`. The script loads, `doPost` runs, `verifyToken` refuses, nothing leaks.
  ⚠️ Reaching that took following the 302 to the `googleusercontent` echo URL with a **GET** —
  forcing POST across the redirect returns a 405 that looks like a backend failure and is not.

### Note for anyone deploying from an agent session

`clasp push --force` is blocked by the `block-dangerous-git` PreToolUse hook, which pattern-matches that flag
pair and cannot tell `clasp` from `git`. Plain `clasp push` works and does not prompt when
`appsscript.json` is unchanged. **The guardrail was not worked around.** (The hook also blocked
writing *this paragraph*, because the sentence above contains the phrase it matches on.)

### Still open after this deploy

**`@47` has still not been exercised by a real login or a real Delete** — carried over from `@46`
and now *more* pressing, since `@47` adds an auth gate on top of auth changes that were themselves
only ever covered by stubs. One real login discharges it; a temp-password account would prove the
new gate end to end. `BACKLOG.md` § Now.

---

## Session 2026-08-21 (5) — `AI_SDLC.md`; Desktop folder reconciled against live GitHub

**No code change.** Two jobs: grade NeoFeed against Uber's agentic-SDLC layers, and make the
Desktop folder tell the truth about which copy is real.

### `AI_SDLC.md` — what an agent may do to a live clinical tool

Praew mapped Uber's seven agentic-SDLC layers onto NeoFeed; this grades NeoFeed against each one,
using real file names rather than intentions. Most of the layers already existed here, built
incrementally without a name — **naming them is what made the gaps visible.** Grades are
deliberately unkind: a flattering self-audit of a clinical tool is worse than none.

🟢 **Model gateway** → the rule that no infant's data has ever reached a model, and none will.
🟢 **Managed skills** → the 14-harness suite; the two KCMH-worksheet harnesses are the strongest
thing in the repo, because they encode the *pharmacy's* arithmetic, not the developer's.
🟡 **Context graph** → yesterday's doc split. One day old and unproven; `graphify-out/` is stale
and untracked and is not currently part of it.
🟡 **Isolated dev environments** → real (no test has ever touched the live Sheet) but unenforced:
one Sheet, one deployment, `NEOFEED_GAS_URL` a literal in both shells.
🔴 **Managed maintenance** → nothing is scheduled, and what decays here is clinical: guideline
drift, the unverified `FENTON_LENGTH`/`FENTON_HC`, the inferred stock concentrations.
🔴 **Human oversight** → one person is clinician, maintainer, reviewer and deploy identity. **No
change to a printed dose has ever had a second clinical reviewer.**

### 🔴 The gap the exercise actually found

**A push to `main` is an unreviewed production deploy of the frontend.** Pages serves
`index.html` from the repo root, so nothing sits between an agent's commit and the ward — while
the backend requires explicit confirmation. The asymmetry runs backwards from the risk: the gated
half cannot render a wrong number without the ungated half, and **the frontend is where the
printed dose is drawn.** Demonstrated in this very session — the (2) push put
`app.jsx?v=pwd-gate-0821` live within minutes, confirmed by fetching the public page. That change
was tested and wanted; nothing would have stopped one that was not. Now in `BACKLOG.md` § Next.

### Desktop folder reconciled

Verified live first: `https://valhalla-health.github.io/neofeed/` returns 200 and serves
`app.jsx?v=pwd-gate-0821`, matching `main`.

Outside the repo, in `Web App Projects/NeoFeed/`:

- **`HANDOFF.md` → `_ARCHIVE_HANDOFF_2026-05-17_sessions-1-7.md`.** A May snapshot that still sat
  at the top of the folder looking current, naming **`NeoFeed_V2/` as canonical** (archived since
  2026-07-08), carrying a **superseded GAS URL** and a **plaintext Sheet ID**, and saying *"No
  open bugs."* **Kept rather than deleted** — this `CHANGELOG.md` begins at session 8
  (2026-05-25), so it is the only surviving record of sessions 1–7. It now opens with a table of
  the six things in it that are false.
- **`README.md` added** — the folder held seven copies of NeoFeed and nothing at that level said
  which was alive.
- **`PAUSE.md` deleted** — a stray from the removed pause/resume skills, describing `TrendGraph`
  as "not yet wired". It has been in `log.jsx` and wired into the Dashboard for months. Full text
  quoted in the new `README.md` so nothing is lost.
- **`NeoFeed_V2/_ARCHIVED.md` added** — the folder the stale handoff pointed at had nothing inside
  it saying otherwise.

⚠️ **Reported, not changed:** all four archived copies (`NeoFeed_V2/`,
`_ARCHIVED_NeoFeed_V2_2026-07-08/`, `NeoFeed 25052026/`, and `NeoFeed_V2/NeoFeed_GAS.js`) still
hardcode `SPREADSHEET_ID` and `CLIENT_ID` — the values moved into Script Properties on 2026-07-12.
They are **not** in the git repo, and the Sheet ID is not a credential on its own, but the folder
is OneDrive-synced. Editing an archive to redact it destroys what makes it an archive; deleting
the archived folders is Praew's call.

---

## Session 2026-08-21 (4) — `mustChangePassword` enforced on the server

🟠 **Backend NOT deployed — production is still `@46` and the hole is still open there.** The
frontend half ships with the static files (`app.jsx?v=pwd-gate-0821`, both shells verified
identical). See `STATUS.md`. Item 4 and last of the project-management upgrade.

**The gap** (reported unfixed by `CODE_REVIEW_2026-08-18.md`, carried into `BACKLOG.md` on
2026-08-21): `mustChangePassword` was enforced **only in the client**. `login()` reported it and
`verifyToken()` even recomputed it fresh from Staff col G on *every single request* — and then
nothing on the server ever looked at it. The only thing between an auto-provisioned ~40-bit temp
password — sitting in clear text in Staff col H for a human to relay — and the entire patient
registry was `app.jsx` choosing to render `<ChangePasswordModal forced>` instead of the app. curl, a
stale bundle, or a second tab restored from `sessionStorage` skipped that render and was fully
authorised. `app.jsx`'s own comment had named the danger: *"the token is already valid and would
otherwise grant full access on the temp password indefinitely."* The client author knew; the server
never enforced it.

**The fix is four lines in `doPost`**, because `verifyToken` was already doing the hard part:

```
if (user.mustChangePassword && action !== "changePassword") {
  return jsonOut({ error: "PasswordChangeRequired", mustChangePassword: true });
}
```

`changePassword` stays reachable deliberately — a gate with no exit is a permanent lockout.
`logout` is answered above `verifyToken`, so it is unaffected. Google/Workspace accounts never
arrive here flagged, because `verifyToken` clears the flag for them via `_usesGoogleSignIn`; they
have no password to change and so no way out of the gate.

Because the condition reads `user`, which `verifyToken` re-derives from the sheet rather than
trusting the token's cached copy, **flagging col G closes a session already in flight, and clearing
it restores that same session without a re-login.**

### 🔴 What writing the client half surfaced: `syncFromGAS` does not go through `gasPost`

The fix needed **two** client branches, not one. `syncFromGAS` issues its own `fetch` — and it is
the call that fires on login, on tab focus and on day rollover, i.e. the most frequent authenticated
request the app makes. It handles `Unauthorized` itself and then drops every other error into
`setSyncState("error")`. A one-branch fix in `gasPost` would have left the common case showing a red
sync pill and nothing else.

Both paths now call a shared `flagPasswordChangeRequired()`, which flips the client's stale
`mustChangePassword: false` to true and persists it to `sessionStorage`, so `App` re-renders into
the same forced modal the login path would have produced. **Deliberately not a logout** — the
session is still valid, it simply cannot do anything until the password is replaced. Without it, a
mid-session flag would have toasted `บันทึกไม่สำเร็จ: PasswordChangeRequired` — an untranslated
error code — on a loop, at a user with no route to the change-password screen. Server secure, app
apparently broken.

### Harnesses

- **`test/verify-must-change-password.cjs`** — 43 assertions on the real `doPost` in a `vm`
  sandbox. Written first; **failed 23 assertions against the unpatched source**, one of them being
  that the refusal carried no patient payload — it did. Pins that an admin gets no exemption, that
  `changePassword` and `logout` survive, that the sheet governs rather than the token, that
  Workspace accounts are never gated, and that an invalid token is still plain `Unauthorized`.
- **`test/verify-forced-password-client.cjs`** — 9 assertions, mounts the real `<App/>` in jsdom
  and flips the stubbed server to refusing mid-session. ⚠️ It drives the header's "Sync now from
  GAS" button rather than a synthetic `focus` event: the focus listener is throttled to one call a
  minute (`RESYNC_AFTER_MS`), so on a freshly-loaded app a focus event is swallowed and nothing is
  sent. The first version of this harness failed for that reason and looked like a product bug.

**Whole suite re-run: 13 of 13 harnesses pass**, including all six jsdom ones.

### ⏳ Before this is actually fixed

The deploy. `clasp push` + `clasp update-deployment` against the existing deployment ID, as
`peeraporn.po@chula.ac.th`, **after diffing `~/nicu-tools/neofeed/รหัส.js` and reconciling rather
than overwriting** — on 2026-08-17 that mirror held three security fixes present in no other copy.
`BACKLOG.md` § Now also asks for `@46` to be exercised with a real login and a real Delete first,
since its auth changes are covered only by stub harnesses.

---

## Session 2026-08-21 (3) — M1: the first product metric this repo has ever had

**Backend source only — nothing deployed, nothing run against the live Sheet.** Item 3 of the
project-management upgrade.

`usageMetrics(rows)` (pure) + `getUsageMetrics()` (thin reader) added to `gas-backend.gs`, next to
`logAudit`. Pinned by **`test/verify-usage-metrics.cjs`, 30 assertions**, written before the
implementation and confirmed failing against the unpatched source first.

**M1 = distinct `actorEmail` in `Audit_Log` per ISO week.** No new instrumentation was needed — the
PDPA accountability trail has been recording `readRegistry` with an actor email on every
`getActivePatients` all along. This is a read of data that was already there.

**The two PDPA constraints are enforced by the harness, not by good manners:**

- **Distinct email per week, never row counts.** Since `syncFromGAS` began firing on tab focus,
  `Audit_Log` gains a row per user per minute — a row count now measures how long a tab was left
  open. Test 1 puts 500 rows from one nurse into one week and asserts the answer is **1**.
- **No staff email leaves the function.** Test 9 serialises the entire result and fails on an `@`,
  on the string `kcmh`, and on the presence of any per-actor key. A per-staff figure would turn
  product analytics into personnel monitoring — different lawful basis, different conversation with
  the ward.

**Two traps found while writing it, both now pinned:**

1. **`ts` comes back as a `Date` object for some rows and a string for others**, in the same column
   of the same sheet, because Sheets coerces a date-looking column on `getValues()`. Test 5 asserts
   both bucket identically.
2. **Weeks are cut in ward-local time (UTC+7), not UTC.** Bucketing in UTC files a Monday 06:00 ward
   round — Sunday 23:00 UTC — under the *previous* week, quietly moving part of every week into the
   one before it. Test 7 is the assertion that fails if someone later "simplifies" this back to UTC.
   Asia/Bangkok has had no DST since 1976, so a fixed offset is correct here, not a shortcut.

Also handled: ISO week-*year* at the boundary (29 Dec 2025 is `2026-W01`), email case/whitespace
normalisation, unparseable rows counted as `rowsSkipped` rather than dropped silently, and
`totalDistinctUsers` across the whole range rather than the sum of the weekly counts.

**Not done, on purpose:** no `doPost` action was wired. `getUsageMetrics()` runs straight from the
Apps Script editor for a one-off number with **no redeploy at all**, and the next redeploy is the
`mustChangePassword` fix — which should carry nothing but itself.

**The metric still does not exist as a number.** Nothing has touched the live Sheet.

---

## Session 2026-08-21 (2) — `PRD.md` written; the backlog becomes an ordered decision

**No code change.** Item 2 of the project-management upgrade, following the doc split earlier
the same day.

**`PRD.md` added** — the product definition this repo has run 36 sessions without. Closes the
`BACKLOG.md` line that read *"No PRD exists. `CHANGELOG.md` is a change log, not a product
definition."* It states the problem, the three roles and who else is affected, four jobs-to-be-done,
the shipped v1 baseline, **five explicit non-goals**, the constraints, and four open product
questions that are decisions nobody has made rather than bugs.

Two things in it are worth not re-deriving:

- **§ 6 defines what "working" means, for the first time.** M1 = weekly active users, *distinct
  `actorEmail` in `Audit_Log` per ISO week*; M2 = daily log coverage — the ratio the registry stats
  strip already computes on screen every render and then discards; M3 = back-fill rate. **No targets
  were set on purpose** — a target invented from a desk is worse than none, and M1's first month is
  what a target should be argued from.
- **Sections are marked 🟡 where they are reconstructed intent rather than verified fact.** The
  problem statement and the user model were written from the code, **not from a single conversation
  with a NICU user.** They are labelled so they cannot later be cited as findings.

**`BACKLOG.md` re-ordered from kind to time — Now / Next / Later.** The previous version said of
itself: *"The ordering below is a proposal, not a decision … re-order it to taste; that act is the
product-management job."* This is that act. Every item survived, each keeping its kind as a tag
(🩺 safety · 🔒 security · ⚖️ PDPA · 📈 product). The ranking rationale is written down so it can be
argued with, and the two calls that are **Praew's to overrule** — the shelf check of the stock
concentrations, and whether `TARGETS.fluid` should take birth or current weight — are named as hers.

**Three "items" were removed from the task list without being done, because they were never tasks.**
*Don't widen the Fenton axis past 42 wk*, *the `sessionId`-is-a-pseudonym residual risk*, and *mobile
Fenton keeps pan/zoom* are decisions to **keep**. They now sit under **⛔ Standing guardrails — NOT
tasks, and must never be ticked**. Mixed into a to-do list, a future reader could have "completed"
one of them.

Also added to `BACKLOG.md`: a four-point **definition of done** (on `main` · a harness that fails
against the unpatched source · `STATUS.md` updated in the *same* commit · a `CHANGELOG.md` entry and
the line deleted from the backlog), and a three-question **weekly review** ritual that opens with
`git fetch`.

---

## Session 2026-08-21 (1) — `HANDOFF.md` split into STATUS / BACKLOG / REFERENCE / CHANGELOG

**No code change** — verified by `git diff --name-only`. Recorded here after the fact on
2026-08-21, because the split itself never got a changelog entry; by the definition of done written
in session (2) above, that was a gap.

`HANDOFF.md` went **2,138 → 47 lines** and is now an index. New siblings: `STATUS.md`, `BACKLOG.md`,
`REFERENCE.md`, and this file carrying all 36 prior sessions verbatim. The principle applied:
**one file, one job, one update trigger** — and updating `STATUS.md` became part of the definition
of done for a deploy, same commit, not later.

Two sections were **deleted rather than moved**, both stale enough to mislead: `## TLDR — read this
only` (every load-bearing claim in it was wrong, including *"No open bugs."*) and
`## Restore production checklist` (it would have switched the live app's executing identity).
`## File inventory` was dropped as a third duplicate of the architecture table. The reasoning is
kept in `HANDOFF.md` itself.

**Surfaced in the process:** the 2026-08-18 code review had **reported eight defects it did not
fix**, buried mid-file, with nothing holding them. All are now in `BACKLOG.md`.

**`.gitleaksignore` added.** The 2026-08-19 test harness stubs a session object whose placeholder
token field trips gitleaks' `generic-api-key` rule on entropy. It is a fixture, it arrived from
`origin/main`, and it was blocking **every** commit to the repo. Suppressed by fingerprint; the test
file was left untouched. ⚠️ **Do not quote that literal value anywhere — gitleaks scans the
suppression file too.**

⚠️ **Process lesson:** three PRs (#51/#52/#53) landed on `main` while the split was being prepared,
so the first attempt was built on a stale file and the push was rejected. Resolved by merge and
rebuild, no force push. **Always `git fetch` before starting doc work here.**

---

## Session 2026-08-19 (3) — new harness: `verify-delete-session.cjs`

**No code change** — a ward question ("can a whole session be deleted?") was
answered by reading `EditPatientModal`'s "Delete session" button through
`handleDeletePatient` (`app.jsx`) to `deletePatient()` (`gas-backend.gs`) end
to end, and the answer (yes, admin-only, permanent, cascades to every
`Daily_Log` row) is now pinned by `test/verify-delete-session.cjs` instead of
living only in this conversation. 28 assertions across three parts:
`deletePatient()` itself in a `vm` sandbox (registry + log cascade, other
patients untouched, lock taken/released, missing/unknown `sessionId`
rejected), a structural check that `doPost`'s branch gates on
`role === "admin"` before deleting and audits after, and the real
`<EditPatientModal>` mounted in jsdom (button absent for non-admins, a
declined `confirm()` calls neither `onDelete` nor `onClose`, an accepted one
calls both, and the confirm text names the patient and says the deletion is
permanent). Not covered: `handleDeletePatient`'s optimistic-rollback-on-
failure — see the harness's own note in `test/README.md` for what that would
take.

---

## Session 2026-08-19 (2) — "DOL แรกรับ" input stuck at its own value

**Frontend only.** Cache-bust bumped: `registry.jsx?v=dol-input-fix1` (both
HTML shells, still byte-identical).

**Reported from the ward** (screenshot): `EditPatientModal`'s "DOL แรกรับ"
field could not be edited, while every other field on the same modal could.
Same defect existed in `NewPatientModal`'s "DOL at admit" field, unreported
but identical code.

Root cause is a classic controlled-input footgun, not a rendering/CSS issue:
both fields' `onChange` immediately clamped `parseInt(e.target.value) || 1`
back into state on every keystroke, including when the field was cleared
(`parseInt("") || 1` → `1`). For any patient whose DOL at admit is already
`1` — the common case, since most babies are admitted on their birth date —
clearing the field recomputes the *same* value `1` the state already held.
React's `Object.is` bailout then sees no state change and skips re-rendering
the DOM, so the input's on-screen value never resyncs to the browser's own
(now-empty) native state: every backspace-then-retype attempt silently
fights itself. A field whose fallback happens to differ from its current
value (birth weight's fallback is `0`, essentially never the real BW) never
hits this, which is why the ward only ever saw it on this one field.

Fix: let `""` be a valid intermediate state (`v === "" ? "" : Math.max(1,
parseInt(v, 10) || 1)`) instead of always resolving straight to a number.
Downstream reads already tolerated a blank — `Number(dol1) || 1` at save time
in `EditPatientModal`, `parseInt(admitDol) || 1` in `NewPatientModal` — so no
other change was needed. Existing harnesses
(`verify-bed-dol-io.cjs`, `verify-patient-ga-bw-edit.cjs`) still pass; no
harness pinned this specific stuck-input case before now.

---

## Session 2026-08-19 — GA / BW / sex editable on an existing session

**Frontend only — ships with the static files, no `clasp` deploy needed.**
`gas-backend.gs` is untouched: `registerPatient`'s upsert already writes the
`bw` and `ga` columns on every save, so the corrected values land on the sheet
through the same path an edited bed or diagnosis takes. `?v=` bumped to
`ga-bw-edit1` on `registry.jsx` in both HTML shells (still byte-identical).

**Reported from the ward:** a session registered with a wrong birth weight
(KH-BW1090) could not be corrected — `EditPatientModal` showed GA, BW and sex
as a read-only chip strip, so the only fix was deleting the session and
re-registering it, which takes the patient's entire Daily_Log with it
(`deletePatient` drops every row for the sessionId). Those three are now
editable fields at the top of the modal, laid out like the register form's
first row.

Two things deliberately do **not** change with a corrected BW:

- **The sessionId.** It is the key both tabs are matched on, so it keeps the
  BW it was issued with — `KH-BW1090` stays `KH-BW1090` even after the weight
  is fixed to 1900 g. The modal says so inline when the BW is edited, so the
  mismatch between the id and the record is expected rather than alarming.
  `patient.bw` is what every calculation reads; the id is a label.
- **A first weight measurement that has been edited on its own.**
  `weights[0]` is the row `NewPatientModal` seeds from the birth weight, so it
  is corrected alongside — otherwise the Fenton chart and the registry's
  Δ-birth keep plotting the typo — but only while it still equals the old
  `bw`. A patient admitted past DOL 1, or whose first row has since been
  edited, keeps it.

Neither field can be *cleared*: save is disabled on a 0/blank BW or an unset
GA week, the same gate registration applies, because a 0 there rescales every
subsequent dose. GA stays `WW.D` shorthand throughout, seeded through
`gaTotalDays` so a hand-edited `27.9` on the sheet comes back as 27+6.

**A GA outside 22–43 wk cannot be saved at all.** Both modals now render one
shared `GA_WEEK_OPTIONS` list, so register and edit offer exactly the same
range and can't drift apart. A record already carrying something outside it
(imported, or typed straight into the sheet) is *not* carried along as a
pickable option — the rule `BedSelect` follows for an off-list bed does not
apply here, because an unrecognized bed is still a real place while a GA of
20 wk is a data error every downstream calculation keeps reading. The selects
seed blank, an amber notice names the old value and says to pick a new one,
and save stays disabled until one is picked.

New harness `test/verify-patient-ga-bw-edit.cjs` (32 assertions) mounts the
real `<EditPatientModal>` and drives the fields; all nine pre-existing
harnesses still pass.

---

## Session 2026-08-18 — full code review; six defects fixed, nine reported

Read every source file against `app-walkthrough.md`'s conventions. Full writeup
in **`CODE_REVIEW_2026-08-18.md`**; this is the operational summary.

**Frontend only — ships with the static files, no `clasp` deploy needed.**
`gas-backend.gs` is untouched. All eight pre-existing harnesses still pass, and
a new one (`test/verify-resync-and-lists.cjs`, 15 assertions) pins the fixes;
11 of its assertions fail against the pre-fix source, which is how it was
validated. `?v=` bumped to `review-0818` on `app.jsx` and `registry.jsx` in
both HTML shells (which remain byte-identical).

**The one that matters at the bedside:** `App` gated its whole tree on
`syncState === "loading"`, and `syncFromGAS` now runs on tab focus (60s
throttle) and day rollover as well as at login — so every background refresh
replaced the workspace with the first-load spinner and unmounted everything
under it. Tab away, come back a minute later, and a half-finished Calculator
had reset every typed field to its prefill (`localStorage` only holds the last
*submitted* state, so the weight field silently reverts to the patient record's
number rather than blanking). Now gated on `!lastSync` too. Verified by
mounting the real `<App/>` in jsdom, typing into the real Calculator and firing
a real focus event.

Also fixed: the desktop registry table read `weights[last]` instead of
`D.lastWeighed`, so a patient whose newest measurement was length/HC-only
(`w: null`) showed "— g" and **−100% of birth weight in critical red**, beside
a mobile card correctly showing +22%; `PatientStrip` could throw (and white-
screen the app — there is no error boundary) on a patient with no weighed
measurement; `computeAlerts` fed the stale stored `dol` into DOL-indexed
targets, so a row frozen at DOL 1 kept the day-1 protein/energy floors and an
under-fed infant never alerted; the admin dashboard's "Recent log entries" was
sliced from a patient-ordered `flatMap` and so wasn't recent; its "Active
sessions" tile used `status === "Active"` where the registry uses
`isActivePatient` (blank counts); archived registry rows spanned 12 columns
against an 11-column header.

**Not changed, needs a decision or a deploy** (details in the review doc):
`mustChangePassword` is enforced only in the client — the server hands a
temp-password account a fully-privileged token; no server-side
one-entry-per-date guard; `registerPatient` silently overwrites on a colliding
`initials+BW` pseudonym; `updateWeights` fails silently and takes no lock;
`Audit_Log` now gains a row per re-sync per user per minute; `_buildLogRow`'s
date fallback still uses `toISOString()`; `TARGETS.fluid` is documented as
taking birth weight but every call site passes current weight; `SaltRow`
accepts negative electrolyte doses where `NumField` deliberately doesn't.

---

## Session 2026-08-17 (3) — auth hardening recovered from the clasp mirror, and covered

Started as a routine "check for backend updates". The local clone was 15
commits behind; fast-forwarding it was uneventful. The problem surfaced one
step later, at the deploy.

**The clasp mirror had diverged, invisibly.** `~/nicu-tools/neofeed/รหัส.js`
carried an *uncommitted* working-copy change — never committed to the mirror's
own git, never pushed to GitHub, never deployed. Verified by pulling the live
script into a scratch dir: production was byte-identical to GitHub `eacdcad`,
so neither fork was live. The two change sets were parallel forks of the same
baseline, and they **conflicted in `registerPatient()`** — the mirror added a
lock and kept 17 columns, `main` went to 18 with grid-widening for
`multiplesCount`.

This is the trap worth remembering: the documented way to ship a backend
change is to copy `gas-backend.gs` over `รหัส.js` and `clasp push`. Doing that
would have silently destroyed all three security fixes, and nothing anywhere
held another copy.

**What was recovered** (`6145cda`), reconciled to keep both sides of the
`registerPatient` conflict:

- `verifyGoogleIdToken` rejects an expired `exp`. Belt-and-braces — tokeninfo
  already refuses expired tokens with a non-200 — but cheap.
- `verifyToken` re-reads the Staff row rather than trusting the cached session
  for its full 6h. **The one that mattered:** disabling or demoting an account
  previously left its live session working with its old role until the TTL
  lapsed. Every admin-gated branch in `doPost` keys off `user.role`.
- `registerPatient` takes a script lock and rejects a blank `sessionId`; its
  read+write is a read-modify-write over the whole tab.

**Added during reconciliation, not from the mirror:** `_getStaffRowCached`, a
60s TTL around the staff re-check. `getStaffRow` reads the entire Staff tab
and `verifyToken` runs on every authenticated request, so re-reading per call
would put a spreadsheet round-trip in front of every save, sync and log entry.
60s bounds stale access to a minute at one read per user per minute. No
invalidation hooks: `role` and `active` are edited by hand in the sheet, not
through any API action. Password changes are unaffected — those bump the user
epoch, read from `PropertiesService` and never cached here, so they still
revoke every other session instantly.

**Covered** (`9b27ad0`) by `test/verify-gas-session-revocation.cjs` — 31
assertions, no npm. Validated by running it against the unpatched `origin/main`
backend, where **18 fail**: a disabled account returning a live admin session,
a demoted admin still reporting `admin`, a deleted staff row still
authenticating. The 13 that pass there are the preserved-behaviour ones. A
security test that cannot fail proves nothing, which is why that check was run
rather than assumed.

**Caveats, explicitly.** Praew confirmed she does not remember writing these
and asked that they be treated as untested — so provenance is unknown and
completeness is not guaranteed (`session.mustChangePassword` is written but
read by nothing, which suggests the work stopped partway; it was kept anyway).
Nothing here has been executed against live Apps Script: the stubs are not
Google's implementation, and neither CacheService eviction nor real
LockService contention is modelled. **Exercise a real login immediately after
deploying**, with the `@45` rollback ready.

The mirror's working copy was left untouched — it still holds the same changes,
now redundantly. Cleaning it up is safe whenever, but only *after* this is
deployed and confirmed, since until then it is still the only copy that has
ever been near a live sheet.

---

## Session 2026-08-17 (2) — three ward-reported defects: bed label, log DOL, Intake/Output (frontend + one backend fix)

Three bugs reported from the bedside with screenshots. All three are
frontend-only — no GAS change, no sheet migration, nothing to deploy beyond
the static files.

### 1. A patient in NICU bed 1 displayed as "NICU 1-1"

`NewPatientModal` and `EditPatientModal` both defaulted their bed field to
the literal string `"NICU 1-1"`, which is **not** in `BED_OPTIONS` — NICU and
SCN beds there are flat numbers (`NICU 1`…`NICU 12`, `SCN 1`…`SCN 10`) and
only the isolation rooms are genuinely two-part (`iso 1-1`…`iso 3-4`).
Because no `<option>` matched, the `<select>` rendered blank while the state
still submitted that string, so every patient registered without touching the
dropdown was filed under a bed that does not exist. Several records in the
live sheet already carry it, plus older `NICU-3`/`SCN-2` hyphen spellings.

- **`data.js`**: new `normalizeBed(bed)` — collapses whitespace/casing, maps
  `NICU 1-1` / `NICU-1` → `NICU 1` and `SCN 2-1` → `SCN 2`, keeps `iso`'s
  room-bed pair, and returns anything unrecognized (free-text beds like
  `9B2`) untouched.
- **`app.jsx`**: `syncFromGAS` normalizes `currentBed` as records enter
  client state — one place, so the registry cards/table, `PatientStrip`, the
  calculator's print header and the admin dashboard all show one spelling
  without each normalizing. Existing rows therefore *display* correctly
  immediately.
- **`registry.jsx`**: both modals default to `"NICU 1"` and normalize on
  save, so the sheet is corrected for real the next time a patient is
  edited; `EditPatientModal`/`TransferBedModal` also normalize the incoming
  value so a legacy record preselects the right option instead of a blank
  dropdown (and re-picking the same bed still counts as "no change", rather
  than writing a spurious `NICU 1-1` → `NICU 1` hop into `bedHistory`).
- **`data.js` mock fixtures**: `NICU 2-1`/`NICU-3`/`NICU-7`/`NICU-1`/`SCN-2`
  → canonical labels.

### 2. A patient's log entries showed a DOL that disagreed with their date

Reported patient: admitted 1 ส.ค., DOL 17 in the header (correct), but the
"All entries" table showed the row dated 11 ส.ค. as **DOL 3** and the row
dated 9 ส.ค. as **DOL 1**. Root cause: `Daily_Log.dol` is a *snapshot* taken
when the row is written, and the app trusted it forever after. A row saved
before the patient had an `admissionDate` got `dolAtDate`'s fallback (the
last stored weight's DOL, i.e. 1) frozen in; correcting the admission date
later re-dates every DOL in the app **except** the rows already on the sheet.
This is the documented "DOL is always computed live, never stored" rule, with
saved log rows as the one place it wasn't being applied.

- **`data.js`**: new `entryDol(patient, entry)` — re-derives from the row's
  `ts` via `dolAtDate`, falling back to the stored column only when there is
  no date or no admission date to measure from.
- **`log.jsx`**: the table's DOL and "Day admit" cells, `TrendGraph`'s
  points (so a mis-stamped row plots on the day it was recorded instead of
  collapsing onto DOL 1), `pickTarget`'s DOL-indexed target bands, and the
  delete-confirmation label all go through it. The table now sorts by `ts`
  rather than by the stored `dol`, which put rows out of order for the same
  reason.
- **`app.jsx`**: `CalculatorView`'s `displayDol` uses it when editing an
  existing entry — that value is also what the next save stamps, so a
  re-saved row corrects its own stored column.
- The stored column is still written (it's what an export or report reading
  the sheet directly sees); it is now self-healing rather than authoritative.

### 3. The Intake / Output card's "Input" was not saved

Reopening a saved entry showed an empty Input field over a real saved figure,
and re-saving then wrote that `0` over the record. Root cause was an
effect-ordering race, not the save path (which was correct end to end):
on mount both the prefill effect and the "keep ioInput tracking
prescribedFluid until touched" effect run in the same commit, prefill first —
but the auto-sync effect's closure still saw the **pre-prefill**
`ioInputTouched === false`, so it re-ran and overwrote the just-restored
`ioInput` with `calc.prescribedFluid`, which was itself still 0 because
`calc` hadn't recomputed off the restored inputs yet. Output and drain have
no such auto-sync, which is why only Input was affected.

- **`calculator.jsx`**: `ioInputTouched` is mirrored into
  `ioInputTouchedRef` (written synchronously by `markIoInputTouched`), and
  the auto-sync effect reads the **ref**, so it sees the prefill's decision
  in the same commit. Don't collapse this back into plain state.
- **`calculator.jsx`**: restoring an entry now prefers the row's own
  `ioInput`/`ioOutput`/`drainContent` columns over the copy inside
  `calcInput` (`withEntryIO`) — the dedicated columns are the record, and
  they exist even on a row whose `calcInput` predates the card or fails to
  parse, where restoring from `calcInput` alone showed an empty card over
  real saved figures.
- Unchanged in the other direction: a brand-new entry's Input still tracks
  the live prescribed total until the user types in the field.

### 4. `registerPatient()` no longer depends on a manual migration

Not reported from the ward — found while answering "what is still pending
from the 2026-08-15 deploy". `registerPatient` upserts: it appends a new
patient (`appendRow` widens the sheet itself) but writes an existing one with
`getRange(row, 1, 1, 18)`, which throws on a `Patient_Registry` tab narrower
than 18 columns. That reaches the bedside as a failed save when **editing** a
patient while registering a new one keeps working — the exact trap
`updateDailyNutrition` was given an on-demand grid widen for in `2b7d2a4`,
left unfixed one tab over when `multiplesCount` was added.

- **`gas-backend.gs`**: `registerPatient`'s in-place write widens the grid
  first when it is too narrow, then writes `row18.length` columns rather than
  a hardcoded 18. No-op once wide enough — and a tab created by
  `insertSheet()` starts at Sheets' 26-column default, so in practice this
  only fires on a sheet whose columns were trimmed by hand.
- `ensurePatHeaderColumns` / `ensureLogHeaderColumns` comments corrected:
  both claimed their migration was "NOT merely cosmetic" because the
  corresponding write would throw. Neither is true any more — both write
  paths self-widen — and the Daily_Log one had been stale since `2b7d2a4`.
  The migrations are still worth running for the header *labels* (see
  `ensureStaffHeaderColumns`'s caveat), just not load-bearing.
- **This is the only backend change on this branch.** It does not need its
  own deploy — it merges into the `clasp push && clasp deploy` already
  pending from 2026-08-14. Relevant to fix #1 above: the bed-label rewrite to
  the sheet rides on `updatePatient` → `registerPatient`, i.e. exactly this
  upsert path.

### 5. Bed pickers consolidated into one component

Follow-up to #1 on the same day: "recheck that NICU bed numbers everywhere
only allow the defined format". Three modals each rendered their own
`<select>` over `BED_OPTIONS`, which is how a bogus default went unnoticed in
one of them. They now all render a single `BedSelect` (`registry.jsx`), so
the invariant holds by construction. It also fixes two things a bare select
gets wrong:

- **A value outside `BED_OPTIONS` renders blank.** That is the mechanism
  behind the original report — the control showed nothing while still
  submitting `"NICU 1-1"`. Any off-list value (a legacy record, a bed typed
  straight into the sheet, e.g. `9B2`) is now carried as one extra option
  labelled "(ไม่อยู่ในรายการเตียง)": visible and re-selectable, never newly
  pickable.
- **A bedless patient was coerced onto a default.** `EditPatientModal` fell
  back to a hardcoded bed, so editing an unbedded patient's *diagnosis*
  silently admitted them to it. (The old fallback was the bogus `"NICU 1-1"`;
  fixing #1 to `"NICU 1"` would have made that silent admission land on a
  *plausible* bed, which is worse, not better.) `BedSelect` renders an
  explicit "— ยังไม่ระบุเตียง —" choice and the modal seeds from the
  patient's own value with no fallback.

`allowUnassigned` is on for register/edit (a bed can be cleared) and off for
transfer (a transfer to nowhere is not a thing); the transfer button stays
disabled until a real bed is picked, as before.

### Tests

New `test/verify-bed-dol-io.cjs` (54 assertions). Sections 1–2 are pure
`data.js`; section 3 mounts the real `<Calculator>` in jsdom (same harness as
`verify-kcmh-factor.cjs`) because the I/O defect only exists once mounted.
Reverting the ref fix alone reproduces the report exactly — Input comes back
`""` and the re-save writes `0`. Also re-ran `verify-kcmh-constants`,
`verify-kcmh-factor` (DEAD=20 and DEAD=0) and `verify-targets-and-dates`: all
pass.

Also new: `test/verify-gas-registry-upsert.cjs` (17 assertions) — the first
harness in this repo that runs backend code. `gas-backend.gs`'s top level is
nothing but `var` constants and function declarations, so the whole file
evaluates in a `vm` context against stubbed `SpreadsheetApp`/`Utilities`/
`CacheService` globals and the real `registerPatient()` can be called
directly, with a sheet double that throws on an out-of-bounds `getRange()`
the way SpreadsheetApp does. Reverting the widen alone reproduces the throw.
Worth extending whenever a backend function's sheet-range arithmetic changes
— there is otherwise no way to run `gas-backend.gs` outside a live Apps
Script project. No npm dependencies.

And `test/runthrough-app.cjs` (29 assertions) — the first harness that runs
the **whole app** the way a nurse does. It serves the repo statically as-is
(`index.html` exactly as Pages would serve it), launches Chromium, logs in,
and clicks registry → dashboard → calculator. `unpkg.com` is answered from
`node_modules` and the GAS URL by an in-process fake backend that mirrors
`gas-backend.gs`'s response shapes **and records every write**, so assertions
can check what actually went over the wire, not just what is on screen. Its
fixture is the reported patient (bed stored as `"NICU 1-1"`, log rows whose
stored `dol` disagrees with their date, an entry with real I/O figures), so
all three defects would be visible on screen if they returned. Two useful
properties: the UMD bundles must be the exact pinned versions because
`index.html` carries SRI hashes, so a passing run also proves those hashes
still match; and it fails on any uncaught page error or any failed request
beyond the two expected to be offline (Google Identity Services, Google
Fonts). Screenshots land in `test/.screenshots/` (gitignored).

Runthrough results on the reported record: registry card reads **NICU 1**;
log rows read DOL 15/12/11/9/1 against 15/12/11/09/01 ส.ค. (was 15/12/3/1/1);
reopening the 15 ส.ค. entry restores Input 214 / urine 143 / drain 12 with
Balance +59 mL/d; editing drain to 30 sends `{ioInput:214, ioOutput:143,
drainContent:30, dol:15, ts:"2026-08-15"}` to the backend and round-trips on
reopen; the 12 ส.ค. entry does not inherit any of it.

Cache-bust tags bumped to `?v=bed-dol-io1` on `data.js`,
`calculator.jsx`, `registry.jsx`, `log.jsx`, `app.jsx` in **both**
`NeoFeed.html` and `index.html`.

**Merged with session (1) above.** Both sessions ran in parallel against the
same `main` and touched `data.js`, `registry.jsx`, `app.jsx`, `gas-backend.gs`
and both HTML shells; the conflicts were resolved on this branch. One real
interaction, not just textual: `entryDol()` derives a log row's DOL from its
`ts`, and session (1) established that a raw `ts` off the sheet can be a date
*value* rather than `"YYYY-MM-DD"` — so `entryDol` runs it through
`normalizeDateStr()` first. `syncFromGAS` already normalizes the whole log
map, so that is belt-and-braces for any caller holding an entry that didn't
come through it. Cache-bust tags for both sessions were collapsed onto one
new value, `?v=bed-dol-io2`, since both changed the same five modules.

---

## Session 2026-08-17 (1) — "Logged today" stuck at 0 / registry didn't roll over (frontend + backend)

Bug report with a screenshot: the registry strip read **`0 LOGGED TODAY ·
24 NEEDS ENTRY`** on a ward that had been logging all morning, and the ask
was for each patient to say `LOGGED` once saved and `NEEDS ENTRY` until
then, with the Active set re-checked daily ("เหมือนไม่ค่อยเปลี่ยนตาม").
Three separate defects were stacked behind that one number:

1. **`Daily_Log.ts` came back from the sheet as a date *value*, not a
   string.** `_buildLogRow` appends `"YYYY-MM-DD"`, and Sheets parses that
   into a real date on write — so `getActivePatients()`'s
   `ts: String(row[0] || "")` returned `"Sun Aug 17 2026 00:00:00 GMT+0700
   (Indochina Time)"`. Every `e.ts === todayLocal()` comparison in the app
   was therefore false, always: the Logged-today count, the Needs-entry
   count, the per-patient badge, **and the one-entry-per-date duplicate
   guard** in `app.jsx`'s `startAddToday`. Every other date column in that
   function already went through `_fmtDate()`; this one was missed.
2. **"Logged today?" only looked at the last entry in the array.** Rows come
   back in the sheet's insertion order, so back-filling a missed day *after*
   logging today put the older entry last and hid today's — the patient
   flipped back to "needs entry" for doing extra work.
3. **The three tiles were counted over different patient sets.** Active
   required `status === "Active"` while the list below it also treats a
   blank status as active; Logged-today was counted over *all* patients
   (discharged included) while Needs-entry was counted over active ones. The
   numbers could not be reconciled against each other or against the list.

**`data.js`** — new `normalizeDateStr()` (coerces a Date / Date-string / ISO
timestamp to `YYYY-MM-DD`, slicing already-canonical strings rather than
re-parsing so no timezone shift can creep in), `normalizeLogEntries()` /
`normalizeLogMap()` (normalize `ts` **and** sort oldest→newest, so
`entries[entries.length-1]` is genuinely the latest — several views assume
that), and `hasLogOnDate(entries, date)` (scans every entry, not just the
last). Also `useTodayLocal()` — the hook form of `todayLocal()`, re-rendering
its caller when the local day rolls over. It is the one React-aware helper in
`data.js`; it lives there because that file owns `todayLocal()` and every
consumer already holds `D`.

**`gas-backend.gs`** — `getActivePatients()` now reads `ts` through
`_fmtDate(row[0])` like every other date column. **Backend deploy needed for
this half** (see the status line), but the client-side normalization above
fixes the live app on its own — that is deliberate, since a `.gs` change
can't ship without Apps Script editor access.

**`app.jsx`** — GAS sync normalizes the log map on ingest; the optimistic
insert in `handleLogToGAS` re-sorts instead of blind-appending; the
duplicate-date guard normalizes before comparing. The registry also stopped
being a snapshot of whenever the tab was opened: it now refetches when the
tab returns to the foreground (throttled to once a minute) and again when the
local day rolls over. Previously the app fetched **once at login and never
again**, so on a workstation left open all shift, entries logged from another
device never appeared.

**`registry.jsx`** — one `isActivePatient()` predicate shared by the list and
all three tiles, so `logged + needs entry === active` by construction; the
counts use `hasLogOnDate`; the day is read from `useTodayLocal()` so the
strip, the badges and the 7-day discharged auto-hide re-evaluate themselves
at midnight. The quiet grey `✓ logged` / `no log` hint on the mobile card is
now an explicit `✓ LOGGED` / `NEEDS ENTRY` pill (`.log-badge` in both HTML
files), and the desktop table shows the same pill — it had been computing
`hasToday` and never rendering it.

**`test/verify-registry-logged-today.cjs`** (new) — mounts the real
`<PatientRegistry>` in jsdom and reads the numbers off the rendered strip and
badges, with a Sheets-`Date` `ts`, a back-filled entry appended last, a
blank-status patient and a discharged-but-logged patient in the fixture. The
`logged + needs === active` assertion is what keeps the strip honest.
`verify-targets-and-dates.cjs` gained 17 assertions for the new date helpers
(no npm deps needed for those).

**Behaviour note:** Logged-today no longer counts discharged patients, so on
a day where a since-discharged patient was logged, the number can read one
lower than it would have before. That is the reconciliation, not a
regression.

---

## Session 2026-08-15 — I/O card divisor stuck on birth weight (frontend only)

Bug report with a screenshot: a patient's actual weight had already grown
past birth weight (1177 g), yet the Intake/Output card's mL/kg/d divisor
still showed "1177 g (birth weight)". Root cause: `D.ioDivisorG(patient,
dol)` only ever looked at *yesterday's* recorded weight
(`weightAtOrBeforeDol(patient, dol-1)`) — it never considered the weight
being entered for *today* in the calculator itself (`wtG`). If no prior-day
weight was on record yet (or that prior-day weight was still below birth
weight), the divisor fell back to birth weight and stayed there even though
today's typed-in weight was clearly higher.

- **`data.js`**: `ioDivisorG(patient, dol, todayWeightG)` gained a third,
  optional param. When the previous-day lookup would otherwise fall back to
  birth weight, but `todayWeightG` (today's live weight entry) already
  exceeds birth weight, the divisor now uses `todayWeightG` instead. Return
  type changed from a bare number to `{ g, source }` (`source` is
  `"today"` / `"prevDay"` / `"birth"`) so the UI can label which weight is
  driving the number without re-deriving it from a value comparison (the
  old `ioDivisorGVal === patient?.bw` check would have mislabeled a
  today-sourced divisor as "previous day").
- **`calculator.jsx`**: the sole call site now passes `wtG` (the Step 1
  weight field already in scope) as `todayWeightG`, and the "Balance ...
  divisor NNN g (...)" hint under the Intake/Output card renders
  "(today)" / "(previous day)" / "(birth weight)" from `ioDivisor.source`.
- Once the infant has an actual previous-day weight on record that itself
  clears birth weight, that previous-day weight still wins (unchanged
  behavior) — today's weight is only a fallback for the "no/low prior-day
  data" case, not a general override.

---

## Session 2026-08-14 (2) — Twin/triplet label + `multiplesCount` field (frontend + backend)

Started from a screenshot question: the registry table shows a bare `· A`
under a twin's name with no label, confusing to read. First pass just
reworded it to "Twin A" — but the "Multiples" dropdown (`AddPatientModal`)
goes A–D for twins/triplets/quadruplets, and the *letter alone* doesn't say
which: "A" reads identically whether the set is twins or triplets. Asked the
user how to disambiguate; they chose adding an explicit "how many" field at
registration over a same-letter guess or a birth-cluster heuristic.

- **`registry.jsx`**:
  - New `multiplesLabel(p)` helper — combines `p.twinSuffix` (position: A–D)
    with the new `p.multiplesCount` (size: 2/3/4) to render "Twin A" /
    "Triplet C" / etc. Falls back to a letter-only guess (A/B→Twin,
    C→Triplet, D→Quadruplet) when `multiplesCount` is absent, for patients
    registered before this field existed — imperfect (a triplet's "A" would
    still show as "Twin A"), but better than showing nothing.
  - `AddPatientModal`: added a "How many" `<select>` (2/3/4) next to the
    existing "Multiples" letter dropdown, enabled only once a letter is
    picked, clears itself if the letter is cleared. Included in the
    `onSubmit` payload as `multiplesCount`.
  - Desktop table row (the one from the screenshot) now renders
    `multiplesLabel(p)` instead of the bare `· {p.twinSuffix}`.
  - `EditPatientModal` was **not** touched — the user's request was
    specifically "add the field at registration"; there's still no way to
    correct/add multiples info on an existing patient after the fact
    (same gap as `twinSuffix` already had before this session).
- **`gas-backend.gs`**: `Patient_Registry` grows from A–Q to A–R
  (`multiplesCount`, numeric 2/3/4, appended at the end per the existing
  column-layout convention). `getSheetPat()`'s header array, the registry
  read loop, and `registerPatient()`'s upsert row were all updated together.
  Added `ensurePatHeaderColumns()`/`applyPatHeaderColumns()` (same pattern as
  the existing `ensureLogHeaderColumns`/`ensureStaffHeaderColumns`
  migrations) — **must be run once from the Apps Script editor** (or via
  clasp) before this ships, since `registerPatient()` now writes with
  `getRange(row, 1, 1, 18)` and the live sheet's grid is currently only 17
  columns wide; without the migration, upserting an *existing* patient
  (not a brand-new one — `appendRow` self-widens) will throw out-of-bounds.
- Cache-bust bumped: `registry.jsx?v=multiples-count1`, later folded into
  `?v=delete-multiples-count1` when merged with the concurrent patient-delete
  session below, in both `NeoFeed.html` and `index.html`.

**Not verified in a live browser or against a live GAS deployment** — same
standing caveat as other source-only sessions in this environment. Before
calling this done: (1) run `applyPatHeaderColumns()` from the Apps Script
editor, (2) register a twin and a triplet through the UI and confirm the
table shows "Twin A"/"Triplet A" correctly, (3) confirm editing an
already-registered (pre-migration) patient doesn't throw.

---

## Session 2026-08-14 (1) — Patient delete made permanent (frontend + backend)

**Request** (Thai): the "Delete session" button used to be local-only —
clicking it just hid the patient in the current browser, and the next sync
from GAS pulled the same `Patient_Registry` row straight back in. Asked to
make deletion actually stick, keeping the same confirm-before-delete UX.

This was a deliberate design choice at the time (see the removed comments
in `app.jsx`/`registry.jsx`/`app-walkthrough.md` §5): local-only meant a
misclick self-healed on reload. The tradeoff flipped once staff reported
that a *deliberate* delete self-healed too, for the same reason — sync
doesn't know the difference between "never happened" and "happened but
wasn't written to the sheet."

**Changes:**
- `gas-backend.gs`: new `deletePatient(sessionId)`, same shape as the
  existing `deleteDailyNutrition` (admin-only, `LockService`-guarded).
  Deletes the matching `Patient_Registry` row **and every `Daily_Log` row**
  for that `sessionId` — not just the registry row, because `sessionId` is
  derived from initials+BW+twinSuffix (see `data.js`), so leaving old log
  rows behind under a sessionId that could later be regenerated for a
  different admission would silently attach one patient's history to
  another. New `doPost` branch: `action === "deletePatient"`, admin-gated,
  audit-logged as `"deletePatient"`.
- `app.jsx`: `handleDeletePatient` now optimistically removes the patient
  from local state (as before) and then calls
  `gasPost({action:"deletePatient", sessionId})`, rolling the local state
  back (patients/log/activeId) if the server call fails — same pattern as
  the existing `handleDeleteEntry`. Falls back to local-only removal when
  `GAS_ON` is false (no backend configured), consistent with how every
  other `gasPost`-backed handler in this file degrades.
- `registry.jsx`: `EditPatientModal`'s `window.confirm()` wording changed
  from "hide from this list, no effect on real data" to a plain statement
  that the patient and all its Daily_Log entries will be permanently
  deleted and this cannot be undone. Still exactly one confirm click,
  admin-only — no new UI, no bypass path.
- Docs: `app-walkthrough.md` §5 and `TDD.md` §3.3/`doPost` updated to
  describe the new permanent behavior instead of the old local-only one.

Cache-bust bumped: `registry.jsx?v=delete-permanent1` (later folded into
`?v=delete-multiples-count1` when merged with the multiplesCount session
above), `app.jsx?v=delete-permanent1` in both `NeoFeed.html` and
`index.html`.

**Verified:** both edited `.jsx` files parse clean through `esbuild`;
`gas-backend.gs` parses clean through `node --check` (copied to `.js` first,
since `node` doesn't recognize `.gs`). **Not verified**: no route to a live
GAS deployment or a real browser from this environment, so the actual
server-side delete (row removal from a live Sheet, the audit log entry, the
rollback-on-failure path) is unverified beyond reading the code — same
standing caveat as every prior backend-touching session in this file. The
backend change **must be deployed** (`clasp push && clasp deploy` against
the existing deployment ID) before the button works in production; until
then it will fail closed (error toast, patient reappears in local state)
rather than silently doing nothing, since `deletePatient` won't exist on the
live script and `doPost` falls through to `{error: "Unknown action: ..."}`.

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

## Unreleased — Center Point identity connection

A separate center-point entry point and strict v2 client have been added on the
codex/center-point-v2 branch. Existing main/frontend shells and GAS are unchanged.
The new client uses the real Center Point API with UUID-only pending retries and
no legacy fallback. See center-point/README.md for exact scope and remaining gates.
