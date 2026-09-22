# NeoFeed — Changelog

Session-by-session history, **newest first**. Append-only: never rewrite a past
entry, correct it with a new one.

Split out of `HANDOFF.md` on 2026-08-21 — every entry below is carried over
verbatim, nothing was edited. Code comments that say *"see HANDOFF.md
2026-08-10 (3)"* mean the session entry of that date, now in this file.

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
