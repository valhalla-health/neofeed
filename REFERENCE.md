# NeoFeed — Reference

Conventions, schema rules and compliance posture. **This file changes rarely** — if
something here needs updating every week, it belongs in `STATUS.md` or `BACKLOG.md`.

Split out of `HANDOFF.md` on 2026-08-21.

---

## Architecture and file inventory

**Deliberately not duplicated here.** `app-walkthrough.md` § 2 holds the authoritative
architecture table and the script load order. The old `HANDOFF.md` kept a third copy and
it rotted — by 2026-08-21 it still described `fenton.jsx` as *"Fenton 2013"* (it has been
2025 data since 2026-08-10), `gas-backend.gs` as *"Daily_Log schema extended A–P"* (it
reaches AC–AE), and the calculator as Steps 1–5 (it is a six-step wizard). One copy only.

## The two hand-synced shells

`NeoFeed.html` is the file you edit locally. `index.html` is what **both hosts** actually
serve — Cloudflare Workers and GitHub Pages. They are hand-synced copies, **not** a
canonical/generated pair —
any HTML/CSS/script-loader change must be applied to **both** or they silently
drift. See `CHANGELOG.md`'s CSS-drift entries for the recurring history.

Since 2026-09-17 one thing in them is no longer hand-kept: the `?v=` tokens, which
`tools/build.mjs` writes into both. The build refuses to run while the two differ in
anything else, so a one-sided edit now stops at the build instead of shipping. The
`NEOFEED_*` config and the GitHub Pages guard are no longer in the shells at all; they
live in `boot.js`.

## The frontend build

**Changed 2026-09-17, deliberately reversing the "no build step" rule.** The shells used
to load the 3 MB `@babel/standalone` from unpkg and compile ~530 KB of JSX in every
browser on every page load — about 4.6 s to the login screen on a workstation and 35 s
on a slow one (4× CPU throttle, measured 2026-09-17), and the reason `_headers` needed
`'unsafe-eval'` and `'unsafe-inline'`. Now `tools/build.mjs` precompiles the `.jsx` modules to
`compiled/*.js`, React/ReactDOM are self-hosted in `vendor/`, and the login screen is up
in ~160 ms (~440 ms throttled). What did not change is the property the old rule
protected: **no build runs on any host.** The output is committed, both hosts serve the
bytes in git, and CI proves those bytes are a fresh build of the committed sources.

**Before committing any change to a `.jsx` file, `data.js`, `boot.js` or either shell:**

```bash
npm ci --prefix tools        # once per clone, and whenever tools/package-lock.json changes
node tools/build.mjs
```

then commit the source edit **together with** everything the build changed
(`compiled/`, both shells' `?v=` tokens). Edit the `.jsx`, never `compiled/`. If you
forget, the `test` workflow's `pre` job rebuilds on a clean checkout and fails the PR
("compiled/, vendor/ or the HTML shells do not match a fresh build"). Alongside that job,
parallel shards run every harness twice, once against the sources and once against `compiled/`
(`test/compiled-loader.cjs`); `verify-calc-compare.cjs`, which never loads `compiled/`, runs in
the sources pass only.

What the build guarantees, and refuses to write anything without:
- **Load order** is the `MODULES` list in `tools/build.mjs`: `boot.js` (first in
  `<head>`) → `vendor/` React → ReactDOM → `data.js` → `compiled/` icons → calculator →
  fenton → registry → log → app. Shells that disagree are rejected, so this line cannot
  rot the way the old copies in `HANDOFF.md` did.
- **One global scope.** Babel used to lower every top-level `const`/`let` to `var`, so a
  name declared in two modules "worked". As native scripts it is a load-time
  SyntaxError and a blank screen. The build loads every script into one scope and fails
  on any collision.
- **`?v=` tokens are content hashes** (first 10 hex of SHA-256, line endings
  normalised), so a changed file can never ship under an old token and
  `appVersion()`'s provenance stamp names exact bytes (`b=…;d=…;i=…;c=…;f=…;r=…;l=…;a=…`).
- **`vendor/` is byte-identical** to the unpkg React 18.3.1 builds the shells pinned by
  SRI. Upgrading React means changing `tools/package.json` *and* those pinned hashes on
  purpose.
- No inline `<script>` in either shell, no Babel, no unpkg, and the Google Fonts
  stylesheet after the last script (in `<head>` a slow fonts request held every script
  back by up to 3.6 s). `test/verify-build-shells.cjs` checks the same from the files
  alone, plus `_headers`, `.assetsignore` and `_config.yml`.

`compiled/` is marked `-text linguist-generated` in `.gitattributes`: Git never rewrites
its line endings, and GitHub collapses it in PR diffs, so review the `.jsx` change.

## Numbers a person reads

Praew, 2026-09-22: **no number anywhere in the UI ends in a trailing zero** — "18.0" is 18, because a
trailing zero can be read as a tenfold dose (the ISMP rule). That covers the screens, the printed order
and the copied order. Every displayed figure goes through `D.displayNum(value, maxDecimals)` (or
`fmt`/`f`/`n`, which wrap it): rounded half away from zero, never a trailing zero, "—" for a missing
value. There is no "keep zeros for column alignment" option any more. Storage is untouched: saved rows
keep full precision, and only the display rounds.

- The Admin dashboard's Recent log entries show at most **2 decimals**.
- The **weight is computed from its grams**, and a kg weight shows to 2 decimals (1234 g → 1.23 kg).
- **A typed dose prints as typed.** Only computed figures are rounded.
- `test/verify-tpn-team-0922.cjs` §8 fails on any trailing zero or float tail in any text node of the
  calculator, the form, the copied order or the daily log.
- **Whole numbers too** (2026-11-15): `fmt(v, 0)`, `f0` or `D.displayNum(v, 0)`, never `.toFixed(0)` or a
  `{Math.round(…)}` in the text. Those read the float, so 899.5 on paper (899.4999999999999 in JS) read 899
  in the red osmolarity line beside a 900 tile. `tools/ci_bans.js` `raw-round-display` fails the PR, and
  `test/verify-calc-sum.cjs` § 4 checks four tie orders on screen, on the sheet and on the sticker.

## The printed order

Since 2026-09-22 the order prints on **two sheets, meant to go double-sided** (Praew):

- **Front: the doctor's order.** It is the KCMH paper form, in the paper's own layout and words, with
  one table row per product so that no figure can sit on another product's line. Ordered products are
  bold, and the paper's other choices print unticked. **One departure from the paper's order (2026-11-02):**
  the Amino acid cell is two lines, the ticked product first with its dose, then the paper's other choices
  side by side, so a ticked product that is not first on the paper (Aminoplasmal) is no longer printed
  where the paper has it. Oral orders go under "8. Other", and "แพทย์" is a
  blank line the checking doctor writes and signs (Pp, 2026-11-06; it printed the saver's name before). Alerts are settled in the app, where a critical one needs a confirmation with a
  reason at Save; the only alert text on the front is that confirmation, since 2026-10-28, and since 2026-11-12
  the ticks made before Print ("รับทราบก่อนพิมพ์ ☑ n/m ข้อ", a red line with no reason by name; the sheet
  does not render until all are ticked) in the same red box, which an order with only such a line now prints too. The "Normal Requirement" column is NeoFeed's targets, not
  the paper's printed ranges, which disagree with the app (review F4). **A departure in words (2026-11-10):**
  the route line's "Peripheral (<900 mOsm/L)" prints `OSM_PERIPHERAL_MAX`, so it follows the app's limit if that
  ever moves, not the paper's fixed text (Pp, PR #240: "ตามค่าในแอป"). **An addition (2026-11-15):** the Total
  Volume line ends with the bag's own osmolarity in small grey type, "· Bag osm N mOsm/L", rounded as the
  Osmolarity tile (Pp, PR #265: "osm เอาขึ้นหน้าแรกตัวเล็กๆ ได้"). **An addition (2026-11-19):** the "2. K⁺" group line ends with the bag's
  K⁺ concentration in the same small grey type, "· K⁺ in bag N mEq/L", the K⁺ in bag tile's figure at one decimal (TPN unit
  through Pp: K⁺ is a high-alert drug; the back sheet's line never reached paper). **An addition (2026-11-16):** the "7. Heparin" line
  prints the mL of 100 unit/mL stock the prepared bag takes (`calc.solVol.heparin`, the back sheet's figure; ward:
  the paper had no heparin volume), and the amino-acid choices drop the age range after "10% Aminoven infant /
  PED AMINE" and "10% Amiparen" (ward request). Feeds stay off the sheet: the TPN room does not
  need them (Pp, the same day).
- **Back: pharmacy.** The Factor, the aqueous bag stock by stock in mL with the WFI q.s., K⁺ in the bag,
  Ca·PO₄, what reaches the infant, changes since the last order, and who saved it.

**Since 2026-10-28 only the front prints** (the TPN team: "print เฉพาะแค่หน้าแรก หน้าสองเก็บไว้ก่อน"). Both
shells hide `.print-back` in print; it still renders. The stickers are not this sheet: they print from `printJson`
(`openspec/changes/tpn-room-stickers`).
Pharmacy works out the stock mL, Factor and WFI from the front. Two things moved from the back to the
front so they stay on paper (Pp, after Vera): the lipid pump rate, and, when a critical value was
confirmed at Submit, "✔ แพทย์ยืนยันคำสั่ง" with the alerts and the reason. A revision prints
"Revision · ฉบับที่ N" at the front's top right.

**A No TPN order** (Step 3's tick, 2026-11-01, Pp) prints only a short sheet, and only when it has something
for paper: its oral orders (Step 6, "8. Other"), the first No TPN day after a day with TPN, or a revision
that replaces a TPN order submitted the same day (`calcInput.replacesTpn`, `D.orderCancelsTpn`). The sheet is
titled "NO TPN — ORAL / STOP ORDER" and keeps the header's pharmacy line, the patient table (dated "วันที่สั่ง",
route "— (No TPN)"), a box with one of two lines, as short as Pp asked: "TPN stopped today" on those two
days, else "No TPN today", "8. Other", the confirmation box when a reason was given, the signature and the
footer; no TPN lines and no back. With none of the three, nothing prints, and Print says so. The Calculator and the
ward's Print order list both read `D.orderPrints`.

Two harness contracts: the patient table stays the form's first direct `<table>` child (the parity and
§6 figure sweeps skip it), and the provenance footer stays the form's last child.

**One A4 page at its fullest (Pp, 2026-11-02).** The front must stay one page with the signature on it, also
with a confirmed critical value (all 15 critical titles that take a reason, and the 300 characters Submit allows a reason). With a
confirmation the signature line is **inside** the red box (`.print-crit-box`), and the box and the line never
split (`break-inside: avoid` in both shells). In the box the line also carries "NeoFeed ID: … · วันที่ให้ TPN:
…" (the strings the sheet prints at its top, "วันที่สั่ง" on a No TPN sheet) between the doctor and the code,
so that if an order does overflow and the box moves whole to page 2, that page still names the infant and the day. The room comes from spacing (cell padding 1.5 px, line height 1.35,
the form's own padding 0 / 2 mm, the amino-acid choices on two lines), never from a smaller figure or a
removed line. `verify-print-one-page-1102.cjs` counts the pages in Chromium, so a line added to the front
that tips the fullest order onto a second page fails it.

**Larger when it fits (2026-11-16).** Pharmacy and the ward's older nurses read the sheet at 115 %, and Pp asked for
the figures to stand out too, on one page. Just before the print dialog (`beforeprint`, whatever opened it),
`D.fitPrintSheet` lays a copy out off-screen at 190 mm (`.print-probe` in both shells) and sets `--print-zoom` and
`--print-fig` on the sheet to the first `PRINT_FIT_STEPS` step that fits 279 mm, measured on the unzoomed wrapper
(a zoomed element's own box reads zoomed only from Chromium 128): 115 %, 110 %, 105 %, 100 %, the bold
values (`<strong>`) at 1.15 em; the last step is the sheet as it printed before. A print rule added to `#print-form`
that changes its height needs its `.print-probe` twin, or the probe measures a different sheet. Staff leave the
dialog's Scale at its default: 115 % there as well would print about 132 %.

**Prepared volume and whole mL (2026-11-16).** A bag with dead space prepares delivered + dead space rounded up to
the next 10 mL above the sum (`D.preparedVolFor`), so the TPN set's 30 mL always has more behind it; the Factor
carries the extra. D50W, the amino acid and the WFI are whole mL, half up; the other stocks keep one decimal, so
components + WFI is the bag to within half a mL. D50W keeps one decimal in a bag with no dead space, and on a
peripheral bag ordered at or under 12.5 % it rounds down where rounding up would pass 12.5 % (Pp, 2026-11-16). The provenance footer stays two lines (8 px, about
226 mm of text on 186 mm of page).

## GA/PMA convention

**Storage:** `ga` is a number in `WW.D` shorthand:
- `26.4` = 26 weeks + 4 days
- Integer part = weeks, first decimal digit = days (literal 0–6)
- `28.1` is **28+1**, not "28.1 weeks decimal"

**Display:** Always go through `D.fmtGA(ga)` → `"W+D"` string
**Math:** `D.gaTotalDays(ga)` for day math; `D.pmaShort(ga, dol)` for PMA
**Plotting (Fenton):** `D.gaToDecimalWeeks(ga)` for true decimal x-axis
**Input parsing:** `D.parseGAInput(str)` accepts `"28+4"`, `"28.4"`, `"28"`; clamps days 0–6

The HMF threshold `patient.ga < 32` still works because all valid values stay under integer 32.

## The ward's TPN page, "TPN ทั้งหอ" (2026-11-15)

One page per ward that lists the infants on TPN, so the team need not open each Dashboard (Pp, 2026-11-14). The rail
has it after Dashboard; on a phone, the ward list's "TPN ทั้งหอ" button. A tap on a row opens that infant's Dashboard.
Every role that sees the ward list sees it. Display only: nothing on it is saved, printed or dosed, so it moves no
`CONSTANTS_VERSION`. The rule is `D.wardTpnRow` in `data.js`, the page `WardTpnPage` in `registry.jsx`, and
`test/verify-ward-tpn-page-1115.cjs` holds both.

**Who is listed.** An Active infant of the ward whose latest Submitted order has TPN (`orderHadTpn`), or whose latest
order *with TPN* is at most `WARD_TPN_RECENT_DAYS` (14) days old. The days count from the last order with TPN, not the
last submit: a No TPN infant is asked for an order every 3 days, so an infant who never had TPN would otherwise stay on
the page for good (Pp, 2026-11-15). That holds where the No TPN AA flag would fire: a preterm infant on DOL 2–7 with
counted EN < 50 whose orders were all No TPN is not listed (Pp, 2026-11-18: "ไม่ต้องขึ้น"). A draft is not an order.
Flagged rows first (red, then amber), then by bed.

**The figures** are the latest Submitted order's, as ordered: `calcInput.aaPerKg`, `calcInput.lipidPerKg`, the saved IV
GIR and `enVolPerKg`. DOL and the day of PN are today's; the day of PN counts from the first order of the current run,
which a No TPN order ends. AA, lipid and EN are graded as the page prints them (`displayNum`: AA and lipid to 2
decimals, EN to 1), so a float tail never puts one on the other side of a line, and EN 49.96, printed "50", is not
"EN < 50" (2026-11-18). GIR is graded raw by `girStatus`, as the Calculator and the Alerts page grade the same saved
number: one GIR, one grading on every screen (Vera, 2026-11-18).

**"Submit ล่าสุด"** is `D.orderSubmittedAt`: `calcInput.orderAt`, which the server stamps on every save that changes
the order and keeps on an I/O-only save (a nurse's, or a doctor's since 2026-11-15), so a later I/O save never moves
it. Submit saves and locks in one press, so that save is the Submit; it is the time the Calculator prints beside
"บันทึกโดย". A row from before `orderAt` (2026-11-07) falls back to `published`, then `lastModified`. Until
2026-11-17 the column read `lastModified`, the last save of any kind.

**The care flags**, only what today's order can still change. No QI figure is shown (Pp, 2026-11-14: QI stays in the
back end, admin only, until the indicators are chosen).

| Flag | When | Source |
|---|---|---|
| AA < 2.5 (amber) | preterm, today's DOL 2–7, counted EN < 50 mL/kg/d, AA < 2.5 g/kg/d. By DOL, also for an infant admitted after birth, and today's DOL when the latest order is older (Pp, 2026-11-14, 2026-11-15). A No TPN order counts as AA 0 and its chip reads "หยุด PN ตอน EN < 50" (Pp, 2026-11-17) | van Goudoever 2018 R 3.2; EN < 50 is NeoFeed's own (`pn_aa_ge_2_5`) |
| DOL 2 ยังไม่มี lipid (amber) | preterm, today's DOL 2, no lipid; a No TPN order too while counted EN < 50 mL/kg/d (Pp, 2026-11-17, asked about EN < 50) | Lapillonne 2018 R 4.2 |
| GIR > 12 (red), GIR < 2.5 (amber; 4 until 2026-11-18) | `girStatus`, every GA; a GIR of 0 (no dextrose) is not flagged | `CR-GIR-MAX` |
| EN ≥ 140 / 120 ยังมี PN (amber) | dextrose, AA or lipid still ordered once counted EN reaches 140 mL/kg/d below 28 wk, 120 from 28 wk and at term; every GA (Pp, 2026-11-15) | NICE NG154 rec 1.8.2 (born before 28+0 wk, 140–150) and rec 1.8.3 (28+0 wk or later and term, 120–140), the lower end of each; not `FULL_EN_ML_KG` |
| No TPN (no colour) | the latest order is No TPN (`orderIsNoTpn`); the AA and lipid flags above may come with it, never the GIR or PN-after-EN flag | — |

Preterm is GA below `PRETERM_GA_WK` (37) weeks (Pp, 2026-11-15, as QI decision 6.6). A record with no usable GA counts
as preterm and takes the 120 line, so a missing GA never hides a flag. Counted EN leaves out a MEN feed (`CR-U-MEN`).
Every number on the page reads `data.js`.

## Adding a ward (2026-11-22)

The wards and their beds are one table, `WARDS` in `data.js` (`openspec/changes/paediatric-wards`, design D1). The
ward page's tiles, "TPN ทั้งหอ"'s tabs, the bed picker, New session's default bed, the transfer dialog's next-free
buttons, the census and usage cards, the backend's bed check and its usage and QI wards, and the TPN room's ward
groups, bed sort and sticker label all read it. Until 2026-11-22 each wrote NICU and SCN out by hand. A ward added to
the table is a data change: one row, two generated copies, and no other edit.

**Not for a real ward yet.** The rules an order follows come from the child's age (`ruleSetFor`, tasks.md group 3),
never the ward, and only the newborn set exists: a child on a new ward's bed is offered Aminoven only and graded on the
newborn bands, like every infant on NICU and SCN. Access is limited by ward since
group 2 (§ Thai PDPA compliance posture, "Access by ward"): no clinician account holds a new ward until an admin gives it
one. A paediatric ward's row lands with its rule set (group 5), on Pp's word. Until then, add a ward only
to try the steps, on dev local or in a harness, and take it out again.

1. **The row.** Add one line to `WARDS`, in the place the ward should be listed (table order is screen order;
   ทดสอบระบบ always comes last):
   ```js
   { key: "DEMO", label: "DEMO", sub: "DEMO 1–4", stickerLabel: "DEMO(ทดลอง)", beds: [{ prefix: "DEMO", count: 4 }], deadVolMl: 30 },
   ```
   - `key`: letters and digits, not `other`, `none`, `ALL` or `total`. It is written into `Usage_Log` and
     `QI_SubmitTimes`, so a ward keeps its key. `FIX` is the harnesses' own fixture ward; do not use it.
   - `label` names the tile, the tab and the census card; `sub` is the tile's second line, the bed range.
   - `stickerLabel` is the ward as the TPN room's bag sticker prints it. A real ward's comes from the TPN room (gate 0.6).
   - `deadVolMl` is the dead space (ปริมาตรคาสาย) a new TPN order on the ward starts with, mL/day: its giving set
     (`defaultDeadVolFor`). It moves printed bag amounts. A real ward's comes from the TPN room (gate 0.6);
     `tools/ward-table.cjs` refuses a row without one.
   - `beds` is a list of runs, each `{ prefix, count }` (`DEMO 1` … `DEMO 4`) or `{ prefix, rooms }`, beds per
     room (`{ prefix: "iso", rooms: [2, 2, 4] }` is `iso 1-1` … `iso 3-4`). A prefix is letters only and no other
     run's, in any case. Before a real ward: a bed already in the sheet that the new prefix matches (a free-text
     `DEMO 9`) moves from ทดสอบระบบ to the new ward; the census's off-list count shows it.
2. **The copies.** `node tools/ward-table.cjs --write` rewrites the marked block in `gas-backend.gs` and
   `tpn-room-core.js`. Never edit either block by hand.
3. **The build.** `node tools/build.mjs`: `data.js` and `tpn-room-core.js` sit under `?v=` tokens in both shells and
   `tpn-room.html`. Commit the row, both copies and the build together.
4. **The checks.**
   - `node tools/ward-table.cjs`: both copies match `data.js`, and the table is well formed (a second key, a reserved
     key, a prefix another run has, a ward with no bed or no sticker label is refused). It is `ward-table-copies` in
     `tools/checks.json`, blocking, at every level.
   - `node test/verify-ward-table.cjs`: NICU and SCN answer as before for every bed and spelling, and its own fixture
     ward (`FIX`, three beds) reaches every screen, the backend and the TPN room. A ward of yours is left out of its
     NICU/SCN sections, so this harness needs no edit for it.
   - `node test/verify-newborn-unmoved-wards.cjs`: NICU's, SCN's and ทดสอบระบบ's screens read as on `main` before the
     table (`test/newborn-unmoved-wards.json`). With another ward in the table it cuts both readings to those three
     and leaves out the two sums over every ward (the unit's census total, the editor's usage table).
   - `node tools/run_checks.js --level ci --phase sources` before the PR, as always. Six older harnesses pin the
     unit as NICU and SCN alone, so a ward of yours fails them by design. With `DEMO` in the table (2026-11-22):
     `verify-admin-census.cjs` (its cards and the unit's 50 beds), `verify-admin-usage-1028.cjs` (two usage charts),
     `verify-bed-dol-io.cjs` (every bed in NICU or SCN), `verify-qi-submit-times-1118.cjs` (three QI rows a day),
     `verify-tpn-room-core-1105.cjs` (two room groups) and `verify-usage-log.cjs` (three usage wards). A real
     ward's PR (task 5.1) updates their expected lists with the row; a try that is taken out again needs none.
5. **On dev local.** Restart `node tools/dev-local.mjs` after the copies change (it runs `gas-backend.gs`): the new
   tile, its tab on "TPN ทั้งหอ", its beds in the picker and its button in the transfer dialog are there, and an
   order from one of its beds reaches `/tpn-room.html` under its own group with its sticker label.
6. **Taking it out** is the same steps backwards: delete the row, `--write`, build, checks. A patient still in one of
   its beds moves to ทดสอบระบบ, so move them first.

## Pre-PR review (Vera)

Before you open or update a PR whose diff touches a dose file (`data.js`, `calculator.jsx`,
`gas-backend.gs`, `docs/CLINICAL_CONSTANTS.md`), the printed order, the auth boundary or patient
data, run the `vera` subagent (`.claude/agents/vera.md`). She reads the diff in her own context with
read-only tools and returns BLOCK or NO BLOCK. She is a second pair of eyes for what CI cannot see;
the `harnesses` check stays the only machine gate, and Pp the only approver.

1. **Keep the change small.** Split a dose-file diff of more than about 400 changed lines first;
   review finds less as a change grows.
2. **Write one review file outside the repo**, in this order: Pp's request as she wrote it, when
   there is one; then the diff; then a line `## Author's claims` and the commit messages.
   ```
   git fetch -q origin
   git diff origin/main...HEAD
   git log --format='%h %s%n%n%b' origin/main..HEAD
   ```
   Give Vera that path and nothing else. Your own summary and reasoning stay out, and the commit
   messages come last, so she judges the change before she reads its pitch.
3. **Paste her report unedited** into the PR body under `## Vera`, and under each finding write
   `fixed in <sha>` or `disputed: <why>`.
4. **A BLOCK holds the PR** until the 🔴 is fixed and Vera has run again, or until Pp overrides it in
   the PR with her reason.
5. **A test Vera proposes goes in only if it fails on the code before the fix and passes after.**
   Otherwise leave it out and say so under the finding.
6. **An agent that cannot start a subagent** (Codex, a chat) writes `Vera: not run` under `## Vera`.

Her report's shape is checked by `.claude/hooks/vera-report.cjs` when she stops, which sends her back
once if it is off (`test/verify-vera-report.cjs`). It needs Node, and Claude Code runs a project
agent's hooks only in a folder you have trusted.

**Her benchmark.** `test/vera-bench/` holds six diffs against a fixed commit, with five planted defects
(a dose on the wrong basis, a `>` turned `>=`, an erased name in a log, a nurse given an admin-only
delete, a volume rounded twice) and seven decoys that look wrong and are right; `key.json` says where
each sits. Before you change `vera.md`, her tools or her model, run `node tools/vera-bench.mjs
prepare`, start Vera once per review file it prints, save each report under `reports/`, run
`node tools/vera-bench.mjs score <folder>`, and record the score in `CHANGELOG.md`. A change that
catches less or flags more decoys does not go in.

**Keeping her useful.** The `fixed` and `disputed` marks are her score. A class of finding that is
useful less than three times in four, over about 20 findings, comes out of `vera.md`. A class she
raises twice becomes a harness test whose failure message says how to fix it, and leaves her prompt.
The reasons for each rule, with sources: the two 2026-10-11 Vera entries in `CHANGELOG.md`.

## Deploying, and rolling back

### Before and after, and rolling back (NF-05, 2026-10-28)

**A release that changes a calculation shows its numbers before it merges.** Pp's decision of
2026-10-28: what protects an infant is comparing the figures before they reach pharmacy, so every
`main → release` PR that changes a calculation carries a before-and-after table, and every release PR
names what it rolls back to. The release PR starts from `.github/PULL_REQUEST_TEMPLATE/release.md`:

```bash
gh pr create --base release --head main --template release.md
```

**Before and after, in dev local.** Serve the release live now and the PR's head side by side, each
with its own made-up infants (§ Frontend, "Dev local before every release"):

```bash
git worktree add <scratch>/nf-before origin/release                     # what the ward runs now
node tools/dev-local.mjs --tree <scratch>/nf-before --port 8155         # before
node tools/dev-local.mjs --tree <checkout of the PR's head> --port 8156  # after
```

For each calculation the release changes, enter **at least three cases** in both: the same made-up
infant and the same inputs, then every figure the change could move, on screen and on the printed
order. Pick the cases to cover the change, one inside the usual range and one at each edge it
touches. Write each in the release PR's table: inputs, figure before, figure after, and whether the
difference is the intended one. A difference nobody intended stops the merge.

**The comparison on every release (NF-42, 2026-11-08).** The three hand cases are what a person reads; this reads many
more orders than a person would. It types the same made-up orders into the `release` Calculator and the PR's, and
compares each tile and its colour, the alerts and their levels, the GIR readout, the rest of the screen's text, the boxes,
lists and colours, every saved field, the sticker figures and the printed form:

```bash
node tools/calc-compare.cjs --base origin/release --head origin/main --out compare.md
```

Paste the report into the release PR. For a release that changes no calculation the answer is no difference. For one
that does, name what it means to move with `--intended "<regular expression over field names>"`, usually with
`screen:` among them, since most figures also appear there. A field left unexplained exits 1 and stops the merge, the
same as a difference nobody intended in the table above. Exit 2 means it could not compare at all (a bad ref, or no
order entered or submitted), which is not a pass.

The orders cover one or two feeds, No TPN, oral orders and a typed dosing weight, over the ranges in the tool. It does
not cover a reopened or revised order, the copy from yesterday's order, Quick calc or Center Point. A gradient built on a
CSS variable is also out of reach, because jsdom drops it; the status behind that colour is compared. It never sees a real input, so the hand cases at the edges a change touches are still needed. It reads no patient's figures and puts
nothing on a ward device.

**Rolling back.** The rollback targets are the release tags, `release-YYYY-MM-DD-prNN`, one per release
merge since PR #60 (§ Frontend; #172's was never pushed). List them with `git tag -l 'release-*'` or on
the repo's Tags page. Every release PR names the tag and commit live before it, and the ward
deployment's version.

- **Cloudflare:** `npx wrangler rollback`, signed in as `praew.tvl@gmail.com`, or the Worker's
  *Deployments* tab → the version built from the rollback-target commit → *Rollback*. It acts in
  seconds and changes nothing in git, so revert the change on `main` next and release the revert,
  or the following release ships the bad change again. `node tools/verify-release.mjs <rollback
  commit>` then passes on Cloudflare, and GitHub Pages differs until the revert reaches `release`.
- **GitHub Pages:** it has no rollback of its own; it changes only when that revert reaches `release`.
- **The build step:** for a release that crosses the 2026-09-17 build step, revert the whole
  `main → release` merge rather than single files: `_headers`, both shells, `boot.js`, `compiled/` and
  `vendor/` only work as a set.
- **Backend:** from this repo's root (its `.clasp.json`), as `peeraporn.po@chula.ac.th`,
  `clasp update-deployment <ward deployment id> -V <previous version>` (`clasp list-deployments` shows
  the version live now: `AKfycbz8…` at `@64` on 2026-10-28). It is a live redeploy, so it still waits
  for Pp's go-ahead. Rows the newer version wrote stay in the Sheet, since every deployment of one Apps
  Script project shares its Sheet, Script Properties and cache: the older version must read them.

### Frontend

**`main` is a working branch, not a deploy trigger — `release` is.** Changed 2026-09-11
(`STATUS.md` § Release-branch deploy gate) to close the exact gap `AI_SDLC.md` § 5 named: a push
to `main` used to be an unreviewed production deploy on two hosts, because the backend demands
explicit confirmation before a redeploy and the frontend did not, backwards from the risk since
the frontend is where the printed dose is drawn. Deploying now means opening a PR from `main` into
`release` and merging it once the `harnesses` check passes — `release` has branch protection (PR
required, `harnesses` required, `enforce_admins` on, so this applies even to Praew's own pushes)
mirroring the confirm-before-`clasp deploy` step the backend already had. The point was never
third-party peer review, it's stopping an *unattended agent push* from going live, same as "confirm
with Praew before running the redeploy step" below.

⚠️ **Corrected 2026-09-11: self-approval does not exist on GitHub.** This paragraph used to say
"self-approval is expected and fine". GitHub never lets a PR's author approve it, and with
`enforce_admins` on, that includes Praew. Every `main → release` PR therefore needed the **other**
admin collaborator (`tasamew`) to approve it — a real second reviewer, not a formality — until
Praew changed the review count.

**Changed 2026-09-18, Praew's decision: `release` needs 0 approvals.** Praew merges `release` PRs
herself; `tasamew`'s review is optional. A red `harnesses` check (`.github/workflows/test.yml`, a
required status check since 2026-09-11) still blocks the merge, and a direct push to `release` is
still refused. What no longer blocks anything: GitHub cannot tell Praew from an agent using her
login, so **an agent merges into `release` only on Praew's explicit go-ahead** — a rule, not a lock
(`STATUS.md` § Release-branch deploy gate). To restore the second reviewer: `gh api -X PATCH
repos/valhalla-health/neofeed/branches/release/protection/required_pull_request_reviews -F
required_approving_review_count=1`.

**`main` is protected too, since 2026-09-23** — the same shape as `release` minus the review count:
`harnesses` required, `enforce_admins` on, force-push and deletion refused, 0 approving reviews. Until
then `main` had **no** effective protection, so a PR with a red `harnesses` could be merged into the
branch every release ships from. The repository ruleset named `protect-main` (created 2026-09-07) is
not that protection: its target-branches list is empty, so it applies to nothing —
`gh api repos/valhalla-health/neofeed/rules/branches/main` returns `[]`. Read the real settings with
`gh api repos/valhalla-health/neofeed/branches/main/protection`.

**Merge commits only, since 2026-10-04.** Squash and rebase merging are switched off for the whole
repo (`allow_squash_merge` and `allow_rebase_merge` false). #130 was squash-merged into `release` on
2026-09-28, so `main` never contained `release`'s new commit and the next release PR, #132, conflicted
with a green `harnesses`; #133 had to rebuild it as a merge commit. Every other merge into `main` and
`release` had been a merge commit, so the setting removes the one button that broke the chain.

**Every release merge carries a tag**, `release-YYYY-MM-DD-prNN`, added as part of the release the way
`STATUS.md` is written as part of the deploy. Backfilled 2026-09-23 for every release since the gate
(PR #60 onward, 11 tags). It makes a rollback `git checkout <tag>` and completes the chain from a
printed order's provenance stamp → commit → tag:

```bash
git tag -a release-$(date +%F)-pr<N> <merge sha> -m "Release $(date +%F) — PR #<N> merged into release"
git push origin release-$(date +%F)-pr<N>
```

**Recording a deploy never takes its own PR** (Praew's global PR rule, 2026-09-18), and nor does
recording a merge (2026-10-28: one piece of work, one PR, `AGENTS.md`). Write the
planned `STATUS.md` change in the PR that ships the code. The post-release checks below exist only
after the merge, so they go in a comment on the `main → release` PR, and `STATUS.md` catches up in
the next PR on this repo. PRs #62, #68 and #72 each existed only to record a deploy; #193, closed
unmerged, only to record #189's merge.

**A merge into `main` always comes with its release PR** (Praew, 2026-09-22). `main` deploys
nothing, so a merged PR is not live until a `main → release` PR merges, and nothing said so outside
the PR itself: on 2026-09-22 PR #87 sat merged but unreleased while Praew opened the old app and
asked why nothing had changed. So:
- **Whoever merges a PR into `main` opens the `main → release` PR in the same session.** If one is
  already open, it has absorbed the merge on its own: report that PR instead of opening a second.
  The chat report names both halves, *"merged into `main` — ⏳ not live; release PR #N is green, say
  'release' to deploy"*, and never calls that merge done or live.
- **"merge แล้ว deploy" (merge and release) means both steps in one instruction:** merge into `main`,
  open the release PR, run it on dev local (below), merge it once `harnesses` is green, run
  `node tools/verify-release.mjs --wait`, and put both results in a comment on the release PR. A plain "merge" still stops at `main`: that is how
  several PRs go out as one release (#85 took eight, so the ward was not recoloured twice in a row).
- The gate itself is unchanged: an agent still merges into `release` only on Praew's explicit go-ahead.

- **Cloudflare Workers Builds' production branch is `release`** (changed by Praew in the dashboard
  on 2026-09-12 — dashboard-only, no `wrangler` subcommand or public API covers it). Both hosts now
  deploy from `release` and **neither deploys from `main`**: merging PR #59 into `main` built
  successfully and changed nothing in production, which is the gate working as designed.
- **GitHub Pages now serves from `release`** (repointed via `gh api .../pages`, verified live and
  rebuilt clean). Both hosts were wired to deploy from the same branch on 2026-08-23 precisely so
  they cannot drift; that property is preserved, the branch just changed.
- **Cloudflare publishes only the files the app loads**, per `.assetsignore`: since the
  2026-09-17 build step that is `index.html`, `manifest.json`, `moved.html`, `boot.js`, `data.js`,
  `compiled/`, `vendor/` and `icons/` — plus the six `.jsx` sources, kept for that one release so a
  browser still holding the previous shell can finish loading (drop them in a later release).
  GitHub Pages had no equivalent until `_config.yml` shipped 2026-09-11 (`5bfdb70`) — Jekyll now
  excludes the same set (internal docs, `gas-backend.gs`, `docs/`, `test/`, `tools/`). See
  `STATUS.md` for the verification.
- **`_headers` sets CSP and other security headers, Cloudflare only.** GitHub Pages has no
  equivalent, so the legacy host is unprotected by it regardless of what ships. See `STATUS.md`
  § Response headers for what it covers and what still needs a live-page check before it ships.
  ⚠️ **Since 2026-09-17 the CSP and the shells ship together**: `script-src` no longer allows
  inline script, eval or unpkg, so the pre-build shells render a blank page under it. Never revert
  one without the other; reverting the release merge reverts both.
- **The reference tables are checked before a release (NF-28).** Every clinical number the calculator
  reads is in `data.js` (`EN_DB`, `KCMH_STOCK`, `SUPP_DB`, the limits, the target bands), so it ships
  with the frontend. `test/verify-reference-tabs.cjs` runs in `harnesses`, the check `release`
  requires: a cell that is a string, blank, of the wrong sign, outside its range or without a unit, or a
  dropdown key that matches no row, turns it red and is listed by name, and the `main → release` PR
  cannot merge. To change a reference value, change it with its CR- rule in the clinical-rules skill;
  a new column or table also needs its unit and range in `tools/reference-tabs.json`.
- **Proving what a release serves.** Workers Builds and Pages build nothing, so the served bytes
  must equal the bytes in git. After a release:

  ```bash
  node tools/verify-release.mjs             # against the tip of `release`; or pass a commit
  node tools/verify-release.mjs --wait      # right after the merge: re-check every 30 s until
                                            # both hosts serve the new tip (10 min; --wait=N)
  ```

  Both hosts take a minute or two to pick up a merge, so a run straight after it fails on every
  changed file. `--wait` holds each attempt's output and prints one line per retry, then the full
  report of the last attempt. It refuses a commit that is not the tip of `release`, since the hosts
  would never serve it.

  On **both** hosts it compares with git at that commit, byte for byte: the shell, every script and
  link the shell names, `manifest.json`, `moved.html` and every file under `icons/`. Every `?v=`
  token must equal the first 10 hex of its file's sha256. `vendor/` is checked by bytes instead: its
  files carry the React version in their name, and the build refuses other bytes under them. On
  Cloudflare the CSP's **`script-src`** must allow no `'unsafe-inline'` and no `'unsafe-eval'`.
  `style-src` keeps `'unsafe-inline'` on purpose, for the shell's own `<style>` block, so reading the
  whole header for those words raises a false alarm. It exits 0 only if everything passes, and needs
  Node 18+ and the network, no `npm install`. It retries a dropped connection or a 5xx twice, and
  never a 4xx or a byte mismatch.

  **Trust a pass only after seeing it fail.** Pointed at a commit the hosts are not serving, it must
  fail on exactly the served files that differ. Its first runs, 2026-09-22: 0 failures against
  `release` = `edbd11f` (#88), and against the previous release `066528d` exactly #87's 15 files on
  each host, nothing else.

  GitHub Pages should answer `/` with the shell and then send any browser to `moved.html` — that
  redirect is `boot.js`, which neither `curl` nor the script runs.
- **Google Sign-In is origin-bound.** Every hostname the app is served from must be an Authorized
  JavaScript origin on OAuth client `750019806043-imunne8n…`. Google allows no wildcards, so a
  Cloudflare **preview** URL fails sign-in with `Error 400: origin_mismatch` until its exact
  hostname is registered. Hit on 2026-09-22 on a branch preview; the error names the OAuth policy
  rather than the app, so it reads as a NeoFeed bug and is not one.
  - Cloudflare gives a preview two URLs, and they are not equally useful here. The **branch** URL
    (`<branch>-neofeed.valhalla-health.workers.dev`) is stable for the life of the branch, so it
    *can* be registered. The **commit** URL (`<hash>-neofeed…`) changes on every push and never can.
  - So: **use a preview for layout, and register the branch URL only if you need to get past the
    login screen on it.** Remove it when the branch is merged — a production OAuth client should
    not accumulate dead origins.
  - `npx wrangler dev` is usually the better answer: it serves on `http://localhost:8787`, one
    stable origin, and it is faster than pushing (see below).
  - **Never** add a preview-only auth bypass to the code to work around this. A login that can be
    skipped is one merge away from production, in an app that writes pharmacy orders.
- **Dev local before every release** (Pp, 2026-10-12: "ให้ dev local ก่อน deploy"). Before a
  `main → release` PR merges, run its head on this machine and use what changed the way the ward will:

  ```bash
  node tools/dev-local.mjs --tree <checkout of the release PR's head>   # http://127.0.0.1:8155
  ```

  It serves the files the hosts publish, with `boot.js` pointed at itself and `gas-backend.gs` behind
  it in `test/gas-vm-sandbox.cjs`: the real login and server checks, made-up infants (the file's header
  lists them), nothing from production. Open `http://127.0.0.1:8155` in the Browser pane at phone
  size (375 × 812), sign in with an account it prints, and walk every screen the release changes.
  Press Back with the pane's own Back: it applies Chrome's history rules, and jsdom or a scripted
  `history.back()` does not. On #155 this run found what 34 jsdom checks and three reviews had not:
  a second Back in a row left the app (`CHANGELOG.md` 2026-10-12 (3)). Write what was tried and what
  it showed in the release PR's comment, beside `verify-release`'s result.
  `test/verify-dev-local.cjs` proves the tool never points at the production backend.
- **Fast local loop:** `npx wrangler dev`. No deploy, instant reload, and quicker than pushing. It
  talks to the production backend; to try a change past the login screen with made-up infants, use
  `tools/dev-local.mjs`.
- **Rollback:** `npx wrangler rollback`, or the Worker's *Deployments* tab. Past the release that
  sends the stop list (2026-10-28), roll the backend back first, or every Submit is refused
  (§ Backend). GitHub Pages has no
  rollback — revert the commit. For a release that crosses the 2026-09-17 build step, revert the
  whole `main → release` merge rather than individual files: `_headers`, both shells, `boot.js`,
  `compiled/` and `vendor/` only work as a set.
- The Cloudflare account is `praew.tvl@gmail.com`, **not** the `peeraporn.po@chula.ac.th` identity
  that owns the backend. Deliberate for now, unresolved long-term.

### Backend (GAS)

⚠️ **The old `HANDOFF.md` "Restore production checklist" was deleted in the 2026-08-21
split rather than carried over.** It was written around session 8 (2026-05-25), described
the app as sitting in sandbox mode with `NEOFEED_GAS_URL` commented out, and instructed the
reader to *"paste `gas-backend.gs` into the Apps Script editor"* — which directly
contradicts the clasp-only rule below and would have switched the live app's executing
identity. None of it was true any more.

**The gate (Pp, 2026-11-03): exactly two deployments, or stop.** From this repo, run
`node tools/check-deployments.mjs` before step 1 and again after step 2. It reads
`clasp list-deployments` in this repo and passes only on `@HEAD` plus the ward's
deployment, whose ID it takes from `boot.js`. A third deployment, or a list it cannot read, exits
non-zero: do not push or deploy. The list lags a delete in both directions (on 2026-11-03 a removed
deployment showed again for one read), so run it once more first. If it still stops, tell Pp. Removing
a deployment is her call: read that version's code first, remove one ID at a time, and never use
`clasp undeploy --all`, which takes the ward's with it. A rollback does not wait for this gate: roll
back first and run it after. It covers a release because every deployment runs its own version's code
against the live Sheet, Script Properties and cache until someone removes it, and a plain
`clasp deploy` adds one without a word. `test/verify-check-deployments.cjs` pins it.

The current procedure:

1. **Push from this repo, from a clean checkout of the commit you deploy** (Pp, 2026-11-11).
   `.clasp.json` and `.claspignore` at the root make `clasp push` send exactly `gas-backend.gs`
   and `appsscript.json`; `clasp status` must list those two as tracked and nothing else
   (`test/verify-clasp-push-set.cjs` pins the list). Deploy only a commit on `main` whose
   `harnesses` check is green, with `git status` clean. The old hand-copied mirror,
   `~/nicu-tools/neofeed` (`รหัส.js`), was retired after `@70`: never push from it again. `clasp push`
   replaces the project's whole file set, so a push from the stale mirror rolls the backend back.
2. `clasp push`, then `clasp update-deployment -V <n> <deploymentId>` against the
   **existing** deployment so `NEOFEED_GAS_URL` is unchanged. A plain `clasp deploy`
   creates a new, unused deployment instead.
3. **Deploy via `clasp`, never the editor's blue Deploy button.** The manifest sets
   `"executeAs": "USER_DEPLOYING"`, so the live web app runs as whoever *cut the
   deployment*. More than one Google account has editor access; deploying from the UI
   while signed in as the wrong one breaks Sheet access. Deploy as
   `peeraporn.po@chula.ac.th`.
4. **Verify rather than assume:** `clasp pull` into a scratch dir and diff against
   `gas-backend.gs`; check `clasp list-deployments` shows the same deployment ID at the
   new version; `curl` the served HTML on **both** frontend hosts to confirm the `?v=`
   cache-bust shipped.
5. **Name the source commit in the version.** `clasp create-version "Backend @<n>: … (main <sha>, PR #<n>)"`,
   and the same text as the deployment description (`clasp update-deployment -V <n> -d "<same text>" <deploymentId>`). The repo is the only copy, so the commit is
   the record; there is no mirror to commit any more.
6. **Update `STATUS.md` as part of the deploy.** This is part of the definition of done, not
   a follow-up task — but not a docs-only PR either: put the verification in a comment on the
   PR whose code you deployed, and bring `STATUS.md` up to date in the next PR on this repo.

**A backend that checks the stop list goes out after the frontend that sends it (2026-10-28).**
`_stopRefusal` refuses a submitted Daily_Log row whose `calcInput.stops` is missing, and every frontend
built before then sends none. So release the frontend first, then `clasp deploy`; to roll the frontend
back past that release, roll the backend back first. After the deploy, a tab opened before the release is
refused once and asked to reload; its draft still saves.

**So does a backend that raises `MIN_SUBMIT_CONSTANTS_VERSION` (2026-10-29).** The stop list alone does not
catch a tab opened on a release that already sent one. `_validateLogEntry` also refuses a submitted row
whose `constantsVersion` is older than `MIN_SUBMIT_CONSTANTS_VERSION` in `gas-backend.gs`, so an old tab
cannot go on printing the old sheet after a release that moved printed figures. Raise it with such a
release, release the frontend, then deploy the backend in the same sitting. The backend refuses every
frontend still on the older version, so roll the backend back first.

**A tab opened since 2026-11-17 checks the release itself.** The calculator reads `compiled/tpn-room-version.js`
uncached when the form opens, and again before a Submit when that read is over a minute old; when it names
other versions than the tab's, a banner asks for a reload and Submit sends nothing (`tabIsBehindRelease` in
`calculator.jsx`, `D.tabDiffersFromServed`). It fails open on a failed request. So a
release that moves `CONSTANTS_VERSION` needs no backend step to stop such a tab; raise
`MIN_SUBMIT_CONSTANTS_VERSION` only to refuse a tab older than the 2026-11-17 release, or to close the fail-open
path. Say in the ward's release notice that open NeoFeed tabs and the TPN room's page reload (F5).

Running a function from the Apps Script editor (e.g. the one-off `applyStaffHeaderColumns`
/ `applyLogHeaderColumns` migrations) executes as the signed-in user and may raise an OAuth
consent — that is Praew's to approve, not something to click through on her behalf.

**Ward-scoped access (2026-11-24, `paediatric-wards` group 2) deploys in this order: migration, check, then
`clasp update-deployment`.** The backend that filters by ward gives an account with no ward no infant, and every
Staff row today has no `wards` cell. So run the migration from the pushed HEAD before the ward's deployment moves:

1. `clasp push` from this repo (step 1 above). HEAD now holds the migration; the ward's deployment is unchanged.
2. In the editor, run `migrateStaffWards` (the dry run). Its log says where the `wards` column will go, how many
   doctor and nurse rows it would fill (`wouldFill`) and which infants on the unit have no ward
   (`patientRowsWithNoWard`, by Patient_Registry row number: an ID from before 2026-09-27 carries the initials).
3. Give each listed infant a bed in the app first, as an admin. After the deploy only an admin sees them.
4. Run `applyStaffWardsMigration`. It adds the `wards` header after the last Staff column if missing, and writes
   `NICU,SCN` into every doctor and nurse row whose cell is blank. A cell that holds anything, and admin and
   pharmacy rows, are left as they are. It is safe to run again: a second run fills nothing.
5. **The check:** run `migrateStaffWards` again. `wouldFill` must be 0 and `patientRowsWithNoWard` empty. If not, stop.
6. `clasp update-deployment` (steps 2–5 above). On dev local before this step, compare one doctor's and one nurse's
   ward list with the same accounts on the current release: the same infants.

The frontend can go before or after: a frontend from before ignores the sync's `wards` list and shows every ward's
tile (the ones the account does not hold are empty), and this frontend against an older backend reads no list and
shows every ward, as before. **To roll back,** move the deployment to the previous version; the `wards` column stays
and the older backend never reads it. A Staff row an admin adds later starts with no ward: give it one on the Admin
page (`setStaffWards`), or type ward keys into its `wards` cell (comma separated, any case; seen within a minute).
The sync cache key carries the ward set (`sync3_`), so no ward's cached reply reaches another.

**The rule set (2026-11-25, `paediatric-wards` group 3) needs no migration.** `registerPatient` writes the record's
rule set into Patient_Registry V (`ruleSet`) on its next save, and an order is checked against the set the backend
derives (`_ruleSetOf`), with a blank V read as that set. Either half can go first: an older frontend sends no set,
which is read as newborn, and an older backend ignores the one this frontend sends. To label column V, run
`ensurePatHeaderColumns()` (dry run), then `ensurePatHeaderColumns(true)`; a blank header passes the schema guard,
so this is cosmetic. From this backend on, a new registration needs a date of birth no later than the admission
date (the Register form always sends one, derived from the admit date and DOL แรกรับ). **To roll back,** move the
deployment to the previous version; column V stays and the older backend never reads it.

Redeploys are live and NICU staff are on them: **always confirm before the redeploy step.**

**The backend holds no reference table (NF-28).** The Sheet has no clinical reference tab, and the
backend sends the frontend no clinical number, so a `clasp deploy` cannot change one. What the two share
is a key rule: the nursing form saves an `EN_DB` key as `feedType`, and the backend refuses any key that
fails `NURSING_FEED_KEY_RE`. `test/verify-reference-tabs.cjs` reads that rule from `gas-backend.gs` and
checks every key against it, so deploy the backend only from a commit whose `harnesses` check is green.

**The nursing I/O form (2026-09-24, `docs/NURSING_FORM_SPEC.md`) ships switched off.** Its backend
code can go out with any `clasp` deploy, and its frontend with any release. Neither changes anything
until the Script Property **`NURSING_LOG_ENABLED`** is set to exactly `true`:

1. **The gate is D7.** Leave the property unset until the DPO has signed off spec § 6.
2. **Set it only once the frontend that carries the I/O card is live** on both hosts. On the next
   sync, the card appears and nurses stop saving orders, together.
3. **To switch it off, delete the property.** It takes effect on the next sync.

**Never switch it on while an old frontend is still served.** An old frontend has no I/O card, and
the backend then refuses a nurse's order save (D5), which leaves nurses nowhere to record I/O.

The sync cache key carries the payload's shape (`sync2_`, plus `+n` while the switch is on), so no
stale payload bridges a deploy or a flip. `Nursing_Log` is created by the first nursing save; there
is no migration to run.

**Help requests (2026-10-05) need one more OAuth scope.** `sendHelpRequest` mails through `MailApp`,
which no deployment before it used, and the manifest lists its scopes explicitly:

1. **Before `clasp push`, confirm `"https://www.googleapis.com/auth/script.send_mail"`** is in `oauthScopes` in
   `appsscript.json` at this repo's root (`test/verify-clasp-push-set.cjs` checks it). Without it every harness passes and production still fails.
2. **After the push, approve the scope once.** In the Apps Script editor, signed in as
   `peeraporn.po@chula.ac.th`, run `authorizeHelpMail` and accept the consent screen. That is Praew's to
   approve. It sends no mail; the execution log shows the day's remaining quota.
3. **Then `clasp update-deployment` as usual, and send one real request from the app.** It should reach
   valhalla.team.th@gmail.com and arrive at praew.tvl@gmail.com through the team account's Gmail filter
   on `[NeoFeed help]`. Do not test the forward by mailing the team from praew.tvl: Gmail drops the
   forwarded copy as a duplicate of the one in Sent (seen 2026-10-05).

Until step 2, a staff member who presses ส่ง sees "ส่งเรื่องไม่สำเร็จ — ลองใหม่อีกครั้ง…" and nothing else
changes. The Script Property **`HELP_REQUEST_TO`** moves the recipient without a code change. The
subject tag is load-bearing: change `HELP_SUBJECT_TAG` only together with that Gmail filter.

**A picture with the request (2026-10-09, `@64`) needs no new scope:** a `MailApp` attachment goes under
`script.send_mail`. Deploy the backend before the frontend. An older backend ignores `image`, so the
request would arrive without the picture and nobody would see why.

**The usage tab (NF-02, 2026-10-28) needs no new scope and no Script Property. Deploy the backend first,
then release the frontend** that draws it on the Admin page. After the `clasp` deploy, the first order saved as submitted creates `Usage_Log`, 4 columns:
`ts | week | ward | type`. Each row is one completed calculation, a TPN/EN order that reaches
"submitted" for the first time; a draft, an edit, Submit, a revision, a print and the quick calc do
not count (`gas-backend.gs` § Product metric NF-02). No row carries a patient field, so erasure has
nothing to reach there. The row is written after the save's lock is released, and a failed write
only leaves a `Usage_Log row not written (NF-02)` line in the execution log.

To chart it, add a tab to the Sheet (say `Usage_Chart`) and put one formula in A1:

```
=QUERY(Usage_Log!B:D, "select B, count(D) where B is not null group by B pivot C", 1)
```

That gives one row per week and one column per ward (NICU, SCN, other). Select `A1:D200`, then
Insert ▸ Chart ▸ column chart; it grows as rows arrive. For one ward by calculation type, use
`=QUERY(Usage_Log!B:D, "select B, count(C) where C = 'NICU' group by B pivot D", 1)`. Weeks are ISO
weeks in Bangkok time (`2026-W44` starts Monday 26 October). A blank cell is 0, and a week in which no
ward saved anything has no row at all, so read the week labels. `getUsageWeekly()`, run from the
editor, prints every week with its zeros, per ward and type, and returns the same as an object.

**The Admin page's Usage card** (Pp, 2026-10-28) asks the `doPost` action `getUsageWeekly` each time
the page opens. It is admin only (`Forbidden` for anyone else, before the tab is read) and returns the
last 12 weeks as counts: `weeks` (each with `week`, `weekStart`, `total` and `byWard`, ward by type),
`wards` and `types`. Nothing about an infant or a staff member, so the read is not audited. The order
after merge:

1. **Backend:** the `clasp` steps above (push from the repo, `sheetHealthReport()`, `clasp push`,
   `clasp update-deployment`).
2. **Frontend:** the `main → release` PR, as in § Frontend.

Released the other way round, an admin sees ยังไม่มีข้อมูล on the card (the old backend answers
"Unknown action") and nothing else changes. Before the first completed calculation the card says the
same.

**Apps Script project timezone must be `Asia/Bangkok`.** Several date paths read Sheets' own date
values through `Session.getScriptTimeZone()` (`_fmtDate`) or assume a Sheets date sits at Bangkok
midnight (`_wardDateKey` in the one-entry-per-date guard, the 2026-09-11 edit-keeps-its-date rule,
and the sync window). `appsscript.json` is at this repo's root (since 2026-11-11) — check its
`"timeZone"` when touching it, and never change it without re-running `test/`.

**Password floor is 10 characters** for any new password (`MIN_PASSWORD_LENGTH`, server and
client, since 2026-09-11). Existing shorter passwords keep working until next changed.

**Five wrong passwords lock a password account for 15 minutes, whoever typed them**
(`LOCKOUT_MAX_FAILS`, `LOCKOUT_MS`; attack pass 2026-10-30, A4, kept on 2026-11-02). The lock stays on
purpose: it is what holds guessing to five tries per window, and it is counted before the hash, so a
parallel burst cannot slip past it. The price is that anyone who knows a staff email can lock that person
out, and a script repeating it every 15 minutes keeps them out for a whole shift, with the right password
refused ("ลองใหม่ในอีก 15 นาที"). It reaches password accounts only: a Google or Workspace sign-in has no
password to lock, and a session already open carries on. The other option was a growing delay instead. It would
either hold a script execution open for each delayed request, which a flood turns into a lockout of everyone,
or refuse until the delay ends, which is this lock on a shorter clock. **What the ward does:** wait the 15
minutes, or have a colleague who is signed in save the order under their own name. If the lock is back straight
after the 15 minutes, it is not a typo: tell an admin, who looks for `lockout` rows with that address in
`Audit_Log` and can lift it at once by deleting the Script Property `fail_` + the SHA-256 of the lower-case
address.

**Before the `clasp push` that brings the size caps (2026-11-02),** count the stored `calcInput` over 10,000
characters on the live `Daily_Log`, for example `=SUMPRODUCT(--(LEN(Daily_Log!Y2:Y)>10000))` in a scratch cell. An edit
that sends such a `calcInput` back is refused: the registry's unchanged-value pass has no twin there. Real saves are
about 1,500 characters, so expect 0; if it is not 0, hold the push and tell Pp.

### Sheet backup and restore drill (2026-11-15, switched on 2026-11-18)

Every record is in one spreadsheet, and a backend deploy runs against it with no staging. The backend keeps
**14 backup spreadsheets** and a nightly trigger copies every tab of the live book over an empty slot, or else
the oldest one
(`gas-backend.gs` § Sheet backup and restore drill; `test/verify-sheet-backup-1115.cjs`). Pp's choices,
2026-11-15: overwrite a fixed set of books, and keep 14 nights.

- **No new scope.** `SpreadsheetApp.create`, `Sheet.copyTo`, `setName`, `rename` and `deleteSheet` are each listed
  by Google under the `spreadsheets` scope the manifest already has (Apps Script reference, read 2026-11-15).
  The time-zone and locale setters and `SpreadsheetApp.flush` were not looked up. The first drill calls
  `flush`; a setter is called only when a backup book's time zone or locale differs from the live Sheet's, so
  a clean drill shows nothing about a setter unless one differed. The backend still cannot reach Drive.
- **Nothing is reachable from the web app.** The five functions run from the editor or the trigger only;
  `doPost` answers "Unknown action" to their names.
- **A slot is good only while it carries a time.** A run blanks the slot's time before it touches the book and
  writes it back after the check, so a run that dies half-way leaves a slot listed as empty. The check: every tab
  is there, and each tab the backend writes (`BACKUP_DATA_TABS`) has the row and column counts it had when its
  copy began. A tab built by hand is copied but not judged. **Listed as empty is about the list:** the book of a
  failed run or a failed drill still holds what was copied into it until it is next written. An empty slot is
  always written first, one per run. If the trigger is off, it stays.
- **Every slot's book id is checked before any book is touched.** A slot that names the live Sheet, has no id
  (or one that is not text), or shares its book with another slot stops the run, the drill, the repair, the
  setup and the status with nothing changed.
- **The script lock is held for the whole copy**, so no patient, order or nursing save lands between two tabs.
  While it is held a save waits its own 10 s and a password sign-in 5 s, then each answers "Busy". How long the
  copy holds the lock on the real Sheet is not known until the first run. `Audit_Log` and `Usage_Log` are
  appended without the lock (every sync writes an audit row), so they may gain rows during the copy: the copy
  must hold at least the rows the tab had when its copy began. A hand edit in the Sheets UI is not locked either.
  Setup and repair take the same lock, so neither can write the backup state while a backup runs.
- **The state is the truth, not the title.** Titles in Drive read `NeoFeed backup slot 03 · 2026-11-16` (the
  ward date of the copy), `(empty)`, `(writing)` or `(failed drill)`, and help find a book; a run that failed
  between two steps can leave a title behind. `sheetBackupStatus` is what says which slots are good.
- **A backup book that will not open does not stop the night.** It is skipped, the backup is written to the
  next slot, and the run then fails on purpose so the trigger's owner is mailed: "Tonight's backup is good (slot
  N), but K backup book(s) could not be opened." Nothing is remembered against the book: an open may fail once and
  work the next night, and then the book is used. A run reports only the books it tried; `sheetBackupStatus` tries
  to open every book itself, shows `unopenedSlots`, and is not `ok` while that is above 0. If the mail repeats, Run ▸ `repairSheetBackups`: a slot whose book will not
  open **and** that holds no listed backup gets a new empty book. A slot that holds a listed backup is never
  replaced (`goodButUnopened`); it is replaced once that backup has aged out. **The code cannot delete the book
  it replaced.** If that file still exists in Drive or its trash, with patient data in it, delete it by hand:
  search Drive for `NeoFeed backup slot NN`.
- **A backup book is set to the live Sheet's time zone and locale before every copy.** A new book may start
  in another zone (where Google takes it from was not looked up), and a date cell read from a book in another
  zone is expected to come back shifted. Neither was tested here; the drill's cell compare would show a shift.

**What it does not cover.**

- The backup books are owned by the same Google account as the live Sheet. Losing that account loses both.
  They are private to that account; do not share them.
- **Each backup book has its own version history** (File ▸ Version history), which the backend cannot reach.
  Deleting a backup's tabs after 14 days removes them from the book as it stands; the book's owner can still bring
  them back from its history, for as long as Google keeps it. The live Sheet's own history has the same property
  and is not addressed anywhere in this repo. See § Thai PDPA compliance posture.

**Setting it up (Pp, once, from the Apps Script editor, as the account that owns the Sheet), after the backend
code is pushed. Do steps 1 and 2 at a quiet hour: both hold the script lock, step 1 while it creates 14 books
and step 2 for the whole copy and compare. `repairSheetBackups` holds it too: quiet hour as well.**

1. Run ▸ `setupSheetBackups`. It creates the 14 books and logs `14 slots, 14 created now`. Running it again
   creates none.
2. Before the drill, open one new backup book and compare File ▸ Settings (time zone, locale) with the live
   Sheet's: only if they differ does the drill call the setters, so only then does a clean drill show that they
   work. Then Run ▸ `sheetRestoreDrill` (below). This is also the first backup. Note how long it ran
   (Executions).
3. Triggers ▸ Add trigger: function `backupSheetNightly`, event source Time-driven, Day timer, failure
   notifications "immediately". Pick the hour from step 2's duration and the ward's night: 2am to 3am is a
   starting point, not a finding, and night nurses chart then. A trigger runs under the account that created it.
4. The next morning, Run ▸ `sheetBackupStatus`: `ok: true`, `newestAgeHours` 36 or less,
   `unopenedSlots: 0`.

A trigger is not pinned to the web app's deployed version, so it is expected to run whatever `clasp push` last
put in the project (`clasp push` changes HEAD only). Google's trigger guide does not say so in words: on the
first morning, confirm it ran from the Executions list. A push of a broken `gas-backend.gs` would then break
the backup the same night; the failure mail and `sheetBackupStatus` are how that shows.

**The restore drill (every 90 days, and before a backend deploy that changes how a tab is written), at a quiet
hour.** Run ▸ `sheetRestoreDrill`. Under the script lock it takes a backup and compares every cell of the copy
with the live book. It writes one backup slot and nothing in the live book. Read:

- `restorable: true`: every tab the backend writes matches cell for cell (for `Audit_Log` and `Usage_Log`, every
  row the copy holds), `Patient_Registry` and `Daily_Log` are in the copy, and their headers, with
  `Nursing_Log`'s when that tab exists, are the ones the column-drift guard accepts.
- `differingCellsInOtherTabs`: a tab built by hand (a chart with formulas) may differ while it recalculates.
  Reported, not judged.
- `restorable: false`: that copy is **not** kept as a backup (its slot stays empty, titled `(failed drill)`).
  Read `tabs[].differingCells` and `schema`, and tell Pp. One known harmless cause: a sign-in that upgrades an
  old password hash writes one `Staff` cell without the lock; run the drill again.

`sheetBackupStatus` reports `drillDue: true` once no drill has passed in 90 days.

**What the drill does not prove.** It proves the copy is faithful and readable by the backend's own header check.
It does not switch the app to a backup. That switch (below) has never been rehearsed on production; rehearsing
it on a quiet night is Pp's call (`BACKLOG.md`), and the steps below are untested until then.

**A real restore (Pp's decision, never an agent's).** Use it when the live Sheet's data is damaged past a
hand fix, and the Sheet's own version history (File ▸ Version history) cannot take it back. Try that history
first: it keeps the Sheet the script is bound to.

1. Tell the wards to stop saving. **Delete the `backupSheetNightly` trigger now and run no drill**: every run
   copies the damaged Sheet into a backup slot, and once no slot is empty that is the oldest good backup. Add
   it back after step 5. Run ▸
   `sheetBackupStatus` and pick the newest good slot from before the damage.
2. In Drive, open that backup by its title and **File ▸ Make a copy**. Never point the app at a slot itself:
   every backup run would then refuse to start. Check the copy's File ▸ Settings: time zone and locale as the live Sheet's.
3. Share the copy as the live Sheet is shared. Check its protected ranges against the live Sheet's and set
   again any that are missing (whether `copyTo` carries them has not been tested here).
4. Project Settings ▸ Script Properties: note the current `SPREADSHEET_ID`, then set it to the copy's ID. The
   damaged Sheet is left as it is, as the record of what happened. Setting the old ID back undoes the switch.
5. Run ▸ `sheetHealthReport` and read `schema` first: both tabs `ok: true`.
6. **Wait 5 minutes, then have every ward device reload.** The sync payload is cached for up to 300 s
   (`SYNC_CACHE_TTL_SECONDS`) and the switch does not drop it, so until then a device can be shown the damaged
   Sheet's data. Then sign in as a doctor and open one infant per ward.
7. **Everything after the backup's time is gone from the copy, and everything removed since is back.** From the
   damaged Sheet's `Audit_Log`, which lists each of these:
   - re-enter the orders, nursing entries and registrations saved after the backup, from the printed orders and
     the ward's paper;
   - **repeat every erasure** (`pseudonymizePatient`, from the Admin page): the copy holds the erased infant's
     name again;
   - **repeat every deletion** of a patient, an order or a nursing entry: a deleted order is a live order again;
   - **Staff:** an account disabled since the backup can sign in again, a password changed since is the old one
     again, and a `temp_password` cleared since is back in the tab. Disable, and reset, again.
8. **The script stays bound to the damaged Sheet.** `onEdit` (the temp password for a Staff row typed by hand,
   and the cache drop after a hand edit) fires only there, never on the copy. Until the data is moved back into
   the bound Sheet, add staff from the Admin page, not by hand. Moving it back is a second, planned step.
9. Write what happened, and why, in `CHANGELOG.md`.

### QI: submit times, `QI_SubmitTimes` (2026-11-18, set up the same day)

When each day's TPN orders reach the TPN room, for QI (Pp, 2026-11-18: "งาน QI อยากดูเรื่องตั้งแต่การซับมิตครั้ง
สุดท้ายของวันว่าเป็นเวลาเท่าไหร่"). **Nothing new is stored per order:** since release #201 (2026-10-29, 18:34 ICT)
every Submit locks its row and stamps `published` (AH), and a change after it is a new revision row with the old
one kept (`supersededAt`, AL). This adds one summary tab, rebuilt in full from `Daily_Log` on each run
(`gas-backend.gs` § QI: when each day's TPN orders reach the TPN room; `test/verify-qi-submit-times-1118.cjs`).
Pp's choices, 2026-11-18: a tab in the Sheet, refreshed every night, admin only, cut-off 14:00.

**One row per day and ward**, from `QI_SUBMIT_FROM` (2026-10-30, the first whole day under the lock) to
yesterday, ward time: `ALL` (NICU and SCN together, the TPN room's day), then `NICU`, `SCN`, and `other` only on a
day it has an order (no bed or a free-text bed, kept outside `ALL`). A day with no order still has its rows, at 0.

| Column | What it holds |
|---|---|
| `tpn_orders` | submitted TPN orders dated that day: the current row (no AL) whose route starts "TPN", as the TPN room counts them |
| `first_submit` | the earliest Submit of any of them, any version |
| `last_submit` | **the latest Submit of the version the TPN room makes**, "HH:MM", or "HH:MM (+1)" after midnight |
| `last_submit_min` | the same, in minutes after that day's midnight, for a chart |
| `median_submit` | the median of the final versions' Submits (the mean of the middle two) |
| `after_cutoff`, `cutoff` | orders whose final version came after the cut-off, by the minute shown (14:01 is after 14:00, 14:00:59 is not); the cut-off used |
| `revised` | orders the TPN room got a later version of (the order's revision above 1) |
| `next_day` | orders whose final version came after midnight |
| `drafts` | TPN orders of that day still a draft when the tab was built |
| `no_time` | submitted orders with no Submit stamp (a lock that failed); counted in `tpn_orders`, not in the times |

- **One time for one order.** An order's Submit is the AH of the row that signed it (`_orderSignerWalk`, shared
  with `pharmacyOrders`): a revision saved with only I/O changed, a nurse's or a doctor's, is not a new version.
  So the tab and the TPN room's "Submit" column read the same time.
- **The day is the order's own date** (column A, ward time). **The ward is the one at the moment of Submit**, from
  `bedHistory` (the first hop made after that moment names the bed held; a hop with no `at` counts as made at the
  end of its date), else the current bed or a parked infant's last bed, as the ward list files it. An infant
  moved from NICU to SCN keeps their NICU days in NICU. **One exception:** a Submit made while the infant was parked
  (no bed) takes the ward of the bed they were placed in afterwards, since placing a parked infant writes no hop
  (`registry.jsx`); until then it is filed under the bed they left. A day's ward split can move once, on placement.
  The `ALL` row never moves.
- **No patient field.** A date, a weekday, a ward, counts and times of day; no NeoFeed ID, entryId, name or e-mail.
  An infant whose record was erased (PDPA) is left out, as `exportQi` leaves them out, so a later erasure can lower
  an old day's count. A day with one TPN order shows that order's time; that is a process time, not a clinical
  value. The tab is aggregate, but QI use of NeoFeed data still needs its own lawful basis (`PRD.md` non-goals, §
  QI export above): ask the DPO before its numbers leave the Sheet.
- **Nothing is reachable from the web app.** `qiSubmitTimesRefresh()` runs from the editor, `qiSubmitTimesNightly()`
  from a trigger; `doPost` answers "Unknown action" to both. Neither takes the script lock: a save that lands mid-read
  is read right by the next run. It is not in `BACKUP_DATA_TABS`: a backup copies it without judging it, and after a
  restore one run rebuilds it.
- **Cost.** Each run reads `Daily_Log` A–AM and the whole registry. AM, the sticker figures (1–2 KB a row), is read
  because the walk compares it, as `pharmacyOrders` does: a revision that changes only the sticker figures is a new
  version for the TPN room (Vera, 2026-11-18). Once a night, that is affordable.
- **The tab grows its own grid** before it clears anything: a new tab has 1000 rows, about 330 days.

**Setting it up** (on Pp's go-ahead; no new scope: a trigger added in the editor needs none, as the backup's):

1. `clasp push` from `main` once this PR is merged (HEAD only; the web app's deployment does not change). On
   2026-11-18 `main`'s `gas-backend.gs` was `@75`'s (deployed from `e1d99cd`; `git diff e1d99cd origin/main --
   gas-backend.gs` is empty), so HEAD gains this section and the walk it shares with `pharmacyOrders` alone.
2. Run ▸ `qiSubmitTimesRefresh`. The log reads `QI_SubmitTimes: N rows, M submitted TPN orders, …`; open the tab
   and check one day against the TPN room's page for that date.
3. Triggers ▸ Add trigger: function `qiSubmitTimesNightly`, Time-driven, Day timer, 1am to 2am (before the backup's
   2am slot, so the two never overlap), failure notifications "immediately". It runs under the account that adds it.
4. The next morning, check the Executions list and that the tab's last date is yesterday.

Another cut-off for one look: Run a one-line function `function qi13() { qiSubmitTimesRefresh("13:00"); }`. The
next night's run writes 14:00 again; change `QI_SUBMIT_CUTOFF` by PR to change it for good.

### MyBreastmilk push, `mybmPushRun` (2026-11-27, off)

`mybmPushRun` sends MyBreastmilk (MyBM), the pumping app for the mothers of NICU and SCN infants, each linked
infant's weights and the feeds on the current order. It is a time trigger's function only: doPost has no action
for it, and it writes no tab but Audit_Log. The rules and the envelope are the MyBM repo's
`docs/superpowers/specs/2026-11-27-neofeed-push-design.md`, signed by Pp on 2026-11-27; the comments in
`gas-backend.gs` § MyBreastmilk push use its section numbers. Pinned by `test/verify-mybm-push-1127.cjs`.

What leaves: MyBM's link id, the weights with their dates and DOL, the feeds of the current order (feed key, mL a
feed, feeds a day), its date and DOL, a ward bed (never free text) and the twin letter. What never leaves: the
sessionId, a name, initials, HN, AN, DOB, admission date, diagnosis, a TPN or IV figure, a staff email. The DOB
can be worked out from a weight's date and DOL, and the DPO's scope has to say so.

**Switching it on.** Each step is Pp's, in this order:

1. The gates outside this repo: the DPO's written approval naming the bed, the twin letter and the weight dates;
   KCMH IT's change request, if IT asks for one for an outbound flow; MyBM's side deployed with its secret
   `NEOFEED_PUSH_SECRET`.
2. Confirm that the Apps Script project's HEAD is the ward's deployed backend plus this change only, as before the
   2026-11-18 QI push: a `clasp push` also changes what the backup and QI triggers run.
3. `clasp push` from a clean checkout of a green `main`. With `MYBM_PUSH_ENABLED` unset the code sends nothing.
4. Script Properties: `MYBM_PUSH_URL` (MyBM's `receive-neofeed` URL, https only) and `MYBM_PUSH_SECRET` (the
   value of MyBM's `NEOFEED_PUSH_SECRET`, at least 32 characters). Never in source, chat or a log.
5. Triggers ▸ Add trigger: function `mybmPushRun`, Time-driven, Day timer, 4pm to 5pm, failure notifications
   "immediately"; a second trigger the same way at 7pm to 8pm, the catch-up run. A trigger runs under the
   account that adds it.
6. One synthetic infant end to end on a test spreadsheet before the ward's Sheet.
7. Last, the Script Property `MYBM_PUSH_ENABLED` = `true`. Run ▸ `mybmPushRun` once and read its log line.

**Stopping it.** Delete `MYBM_PUSH_ENABLED`: the next run sends nothing. MyBM can also unset its secret, and every
request then gets 401.

**What a run writes.** One Audit_Log row per envelope sent (`mybmPush`, the sessionId, actor
`trigger:mybmPush`) and one execution-log line of counts. It throws, so the trigger's owner gets a mail, when MyBM
refuses the signature (401) or any envelope was not recorded. The next run sends every link again, so a missed
run costs a few hours, never data.

### The TPN room's page: `tpn-room.html`

PR B of `openspec/changes/tpn-room-stickers`. Not live: `STATUS.md` says what holds it.

- **What loads.** `boot.js`, React, `compiled/tpn-room-version.js`, `tpn-room-core.js` (the rules, no DOM),
  `tpn-room-store.js` (the name file, no DOM) and `compiled/tpn-room.js` (from `tpn-room.jsx`). It does not load `data.js`,
  so it has no dose code; `tools/build.mjs` writes the two versions it checks. `tools/build.mjs` writes both room shells'
  `?v=` tokens, and `index.html` does not link them, so `tools/verify-release.mjs` names their files. Sarabun is in `fonts/sarabun/`.
- **`*.github.io`:** the page leaves for `moved.html` before it touches storage, on any such host. Use the Workers URL.
- **Sign-in.** Google (gmail and Chula accounts, which have no NeoFeed password) or email and password; pharmacy or admin only. Google is a redirect to Google and back with no Google script on the page; its redirect URI, `https://neofeed.valhalla-health.workers.dev/tpn-room`, must be on the OAuth client's list (§ Deploying), so a real Google sign-in works on the Workers host only.
- **Two things in `tpn-room-core.js`:** `PN_FIXED`, the label's heading, storage line and extension, as the TPN unit wrote
  them on 2026-11-16; with any of the three blank, the whole sheet prints as a trial, "ทดลองพิมพ์ ห้ามใช้จริง" across each part and
  `PN_TRIAL`'s placeholders in the PN label's blank lines; `CONTACTS`, who to call. A release follows either change.
- **The sheet's sizes (TPN unit, 2026-11-16).** The worksheet is 150 × 85 mm, 5 mm from the left and 10 mm from the top,
  each figure beside its name; the PN label 200 × 80 mm; the bag sticker takes the rest. Each part has a dashed outline to
  cut along. The page refuses a sheet whose content overflows a part (`sheetOverflows`).
- **A page left open across a release (2026-11-17).** Each list load reads `compiled/tpn-room-version.js` beside
  `pharmacyOrders`, and a page behind it shows a reload banner. `printReasons` judges each order against that served
  release (`ctx.served`): an order on it needs nothing from the doctor; one on anything else, older or newer, asks the
  doctor to reload NeoFeed and Submit. Without a served read, the page's own versions stand in.
- **`tpn-room-check.html`** checks a PC's browser: folder, rewrite, permission, device key, after a restart. Use it on a
  new PC too. It calls no server and holds no patient data.
- **The name file** is `neofeed-tpn-room-names.nfenc`, in a folder the room picks: never OneDrive, never one a restore clears. A
  lost passphrase means a new file: the old one stays beside it, and a week of orders say to check the paper first.
- **Dev local:** `node tools/dev-local.mjs` prints a pharmacy account and `/tpn-room.html`, under the hosts' real CSP.

### The TPN room: `pharmacy`, column AM, `pharmacyOrders` (live, backend `@67`)

PR A of `openspec/changes/tpn-room-stickers`.

- **`Daily_Log` AM, `printJson`.** The figures for the TPN unit's three stickers, as `D.stickerFigures` made
  them at the save, drafts too. A save with none (no bag, a No TPN order, a tab from before the release) lands
  with AM blank. The ward sync does not read AM, so the calculator also writes `calcInput.printJsonV`; a saved
  bag without it, dated today or tomorrow, shows "ยังไม่มีตัวเลขสติกเกอร์ — กด Submit อีกครั้ง". Print is not held for it.
- **`_printJsonField` refuses** a sticker off the schema or off its order (design D14), and a refusal stops a
  doctor's save. Its key lists mirror `stickerFigures` by hand, and `test/verify-pharmacy-backend-1030.cjs` §13
  compares them. `stickerFigures` returns null rather than send what the server would refuse, so the order
  saves with no sticker. **Compare the weight after rounding:** raw, |sticker − kg| > 0.005 refuses 220 of the
  whole-gram weights from 200 to 8000 g, such as 1005 g printing 1.01.
- **The `pharmacy` role.** `login` and `logout` are answered before the token check, GET `ping` is open, and
  `PHARMACY_ACTIONS` lets a signed-in session reach `changePassword` and `pharmacyOrders` only. The login reply
  carries no registry. The ward app turns the account away with one line.
- **`pharmacyOrders`.** One real date from the ward's today −7 to +1, for an admin too. Audited before the log
  is read. It checks both tabs' headers uncached on every call and reads the whole column, so call it on demand,
  not on a short timer. No name, initials or date of birth, except the initials inside an ID issued before
  2026-09-27 (Pp accepted that on 2026-10-30, design D5). A lipid-only order is not on it: its route is not
  `TPN…`, and the unit does not compound lipid.
- **A cancelled order** leaves the list without a mark. The doctor phones the room for a cancelled or a revised order
  (Pp, 2026-11-02 and 2026-11-03, D16).

**Deploy: the backend first, and this is required** (D15), the opposite of the usual order. All of it on Pp's
go-ahead:

1. `sheetHealthReport` from the editor. `Daily_Log`'s `gridColumns` should be 38. If it is wider, read AM1 first: the
   new schema check refuses every save when AM1 holds any other label.
2. `clasp push` from this repo's root, at the commit being deployed (`clasp status`: two files).
3. From the editor, on the pushed code: `ensureLogHeaderColumns()` as a dry run. It reports `38 -> 39`, or "already
   39" if a save got there first. `OCCUPIED` means stop.
4. `clasp update-deployment` as above, then `clasp list-deployments` and the `clasp pull` diff, then
   `applyLogHeaderColumns()` from the editor.
5. The `main → release` PR, as § Frontend says. **Release it close to PR B:** until the room's page is live, the re-save
   notice asks doctors to press Submit for a page nobody has yet. Say what the line means in the ward's release notice.
6. On the first new bag order after the release, AM starts `{"v":1` and `calcInput.printJsonV` is 1. A marker with a
   blank AM means D15 is broken, so roll the frontend back.
7. Make no pharmacy account until `tpn-room.html` is live. For one, type the Staff row with role `pharmacy` and active TRUE, or name the
   role: `setInitialPassword(email, password, "pharmacy")`. Without a row and a role it writes nothing.

**A later schema change** goes the same way: a backend on `v: 1` refuses a client on a new key or version.

**Rollback:** the frontend first, then the backend. An older backend under the new frontend writes the marker with no
AM, which is D15's failure. It also rewrites a draft 38 columns wide and leaves that row's AM stale. To find the rows
afterwards: `calcInput` has `printJsonV` and AM is blank. Nothing reads AM until PR B.

## Thai PDPA compliance posture

This app processes infant health data — "sensitive personal data" under PDPA
Sec 26. What's in place and what's still open:

**Lawful basis:** Sec 26(6) medical necessity + professional confidentiality
(documented at the top of `gas-backend.gs`). No separate consent flow —
consistent with the exemption, but only covers *treatment* processing, not
secondary uses (e.g. research/QI exports) if those are ever added.

**What the registry holds as a name (2026-11-20):** two letters of the first name and two of the surname
("สม จด"), cut by the client (`data.js` `namePart`) since 2026-09-25 and by the backend (`_shortPatientName` in
`registerPatient`) since 2026-11-20, and the `initials` column cut to two letters the same way (`_shortInitials`), so
no caller can store a full name in either column. A value an edit leaves unchanged is kept as stored. The free-text
`diagnosis` (2,000 characters) can still hold a name. The full name and AN for the TPN room's stickers live in the room's local name file (§ The TPN room's page).
Names in the Sheet before 2026-09-25, its backups and its version history are not touched by this.

**Data subject rights implemented:**
- *Erasure/pseudonymization* — `pseudonymizePatient()` in `gas-backend.gs`,
  admin-only, triggered via `action: "pseudonymizePatient"`. Clears name,
  initials, dob from Patient_Registry; retains de-identified clinical history
  (bw/ga/diagnosis/weights) for the hospital's own medical-record retention
  duty. **Residual risk:** a `sessionId` issued before 2026-09-27 is
  `initials+BW+twinSuffix`, so it's a pseudonym, not anonymous — staff
  present at admission can still reverse-map it on a small census. Erasure
  does not (and structurally cannot, without breaking every Daily_Log join)
  scrub that pattern from an already-issued sessionId. An id issued since is
  `NF-` and six random digits (`data.js` `newSessionId`) and carries nothing.
- *Access/rectification* — no self-service path yet; handled manually via
  admin editing the registry. Worth a real endpoint if request volume grows.

**QI export (since 2026-11-07, not live):** `exportQi()`, run from the Apps Script editor, writes a
pseudonymized table to the `QI_Export` tab (`openspec/changes/qi-export/design.md` has every column). Research
IDs are an HMAC under a per-project key in Script Properties (`setupQiExportKey`), computed at export and stored
nowhere; `lookupResearchId` re-identifies, and every key, export and lookup is in `Audit_Log`. It is
**pseudonymized, not anonymous**: the key re-identifies every row, and on a census of about 90 infants no banding
reaches k = 5, so the CSV stays personal data. The lawful basis above covers treatment, not this, so the basis
for a QI export is open with Pp and the DPO (`BACKLOG.md`). Small cells (≤ 7) are suppressed or rounded to 5 in
the analysis, on aggregates; the export itself is row-level.

**A copy at MyBreastmilk (2026-11-27, not live):** once Pp switches on `mybmPushRun` (§ MyBreastmilk push),
MyBM holds, for each infant its staff linked, the newest 7 envelopes: weights with their dates and DOL, the
current order's feeds, a ward bed and the twin letter. No name, sessionId, HN, AN or DOB leaves, but the DOB can be
worked out from a weight's date and DOL, so the copy is personal data. Erasure reaches it only by rotation:
`pseudonymizePatient` blanks the DOB, every later envelope is a `mismatch` with no data, and the older envelopes
leave MyBM as newer ones replace them, about 3.5 days at two runs a day. That holds only while MyBM still lists the
link: a link it stops listing (the mother's consent lapsed, say) gets no newer envelope, and its stored ones stay
until MyBM deletes them on its own rules. MyBM's link row also keeps the sessionId and the DOB the nurse typed, which
`pseudonymizePatient` cannot reach. Nothing here deletes any of it at once. Whether that is enough, and the lawful
basis for this copy, are for Pp and the DPO before the switch goes on.

**A store of names outside the Sheet (not live):** the TPN room's name file holds the name, AN and edit history on
one PC, encrypted (§ The TPN room's page). **Two gaps for Pp and the DPO, with the change request (tasks.md
0.2):** `pseudonymizePatient()` cannot reach that PC, so an erasure leaves the name there until the 30-day purge, and
an edit keeps the old name in the history until then; and a `.replaced-*` file left by "start a new file" has no end date,
because the purge runs on the open file only. No retention rule or manual erasure step exists yet. Since 2026-11-17
the names page ("รายชื่อทั้งหมด") lists on one screen every name the open file holds, with its AN and edit history,
including a name kept after an erasure until the purge; a remove action there is the obvious manual erasure step for
Pp and the DPO to weigh.
**Trial sheets (since 2026-11-16, until the unit's PN lines come):** each carries a real name and AN on all three
parts and is meant to be thrown away. The row tells the room to shred it or put it in the confidential-waste bin;
where the ward's own disposal rule differs, that rule is for Pp and the DPO to name.

**Backups of the Sheet (code since 2026-11-15, running since 2026-11-18):** 14 backup spreadsheets in the same Google account, one
overwritten each night, hold everything the live Sheet holds, names included (§ Sheet backup and restore drill).
A backup older than 14 days has its tabs deleted by the next nightly run. So **an erasure reaches the backups by
rotation, not at once**: while the trigger runs every night and each run succeeds, an infant erased with
`pseudonymizePatient()` is out of every listed backup in about 15 days (14 days and the wait for the next run). Three things keep a name
longer: the trigger stopped (until its next run); a book left by a failed run or a failed drill, which is cleared
only when next written; and a book that would not open, or one `repairSheetBackups` replaced, which the code
cannot reach at all. **Past that, the name is still in each backup book's version history**, which the backend cannot clear and whose length Google sets; the live
Sheet's own version history holds erased names the same way and always has. A restore from a backup brings back
every infant erased, and every record deleted, after the backup's time, until each is repeated (restore step 7).
Open with Pp and the DPO (`BACKLOG.md`): whether 14 days is acceptable, and what to do about version history.

**Accountability (Sec 39):** `Audit_Log` sheet (auto-created by
`getSheetAudit()`) records registry reads and erasures with actor email +
timestamp — persists past Apps Script's 7-day execution-log window. Two additions
of 2026-11-02 (attack pass A3, A5): `loginFail` and `lockout` rows about an address
with no proven account stop at 60 an hour (`LOGIN_FAIL_AUDIT_MAX`), and a
`loginFailCapped` row with no address on it marks the hour a flood reached that
ceiling. A wrong password for a real account is outside the ceiling and is never
dropped; the sign-in of a suspended account, even with the right password, is under
it and is dropped past it. Registration's look-alike question leaves a
`possibleDuplicate` row with the ID it matched, whether or not the answer named
that infant.

**Access by ward (code since 2026-11-24, not live; `openspec/changes/paediatric-wards`, design D2):** a doctor or
nurse reads and changes only the infants of the wards their Staff row holds, and the server enforces it. Until then
every signed-in role but pharmacy received every ward's infants on every sync. The wards are a `wards` column on
`Staff`, read by header; an admin holds every ward by role and pharmacy none. An infant's ward is the ward of their
bed, or, while parked between beds, of the bed they last left; an infant with neither, or on a bed in no ward of the
table, reaches an admin only. The rule covers the sync and the copy the sign-in reply carries, every write and the
order lock that names an infant, the bed-conflict reply (a bed in another ward is "taken", and nobody is named) and
registration's look-alike question (a match in another ward is said to exist, with no name, bed or ID). It fails
closed when the registry cannot be read. An account with no ward signs in and receives no infant. Only an admin
changes an account's wards (`setStaffWards`, the Admin page's "หอของแต่ละบัญชี" card), and the TPN room still lists
every ward's orders, with no name, initials or date of birth. `test/verify-ward-scope.cjs` pins it. **Open with Pp
and the DPO:** gate 0.7 (the DPO's written answer on ward-scoped access, and the IT Change Request), and who gets
which ward on the live Sheet. The migration's default is NICU and SCN for every doctor and nurse that exists today,
which is what each saw before.

Ward scope's own `Audit_Log` rows: `wardScopeRefused:<action>` (a doctor or nurse refused an infant outside their
wards; the row has no sessionId), `readStaffWards` and `setStaffWards <wards>` (an admin read or changed the wards of
the account in the sessionId column, written `staff:<email>`).

**Data minimization:** `handleLogout()` in `app.jsx` clears
`neofeed_calc_*`/`neofeed_acked_*` localStorage keys on logout, since those
hold per-patient clinical inputs (weight, fluids, labs) and NICU workstations
are typically shared devices. The test area's store, `neofeed_test_ward_v1` (the
names, orders, I/O and weights of patients registered with no bed, 2026-11-14), goes
on a chosen, idle or pharmacy logout too. It names the account that wrote it, so a
session that ends with no logout (expiry, a closed tab) leaves it only until another
account signs in on that browser, which deletes it unread.

**Open items are tracked in `BACKLOG.md` § 2**, not here.
