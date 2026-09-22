# NeoFeed — Backlog

Everything known-but-not-done, in one place. **Review weekly.** When an item ships, delete it here
and record it in `CHANGELOG.md`.

Gathered 2026-08-21 from the old `HANDOFF.md` banner, its "Known caveats" and PDPA "Open items"
sections, `CLAUDE.md`'s "Known open items", and the *unfixed* findings of
`CODE_REVIEW_2026-08-18.md`.

**Ordered 2026-08-21 — this is now a decision, not a proposal.** The first version of this file
grouped items by *kind* (safety / security / PDPA / product) and said outright that the ordering was
"a proposal, not a decision … re-order it to taste; that act *is* the product-management job." This
is that act. Items are now grouped by **when**, and each keeps its kind as a tag so nothing is lost.

**How the ranking was decided**, so it can be argued with rather than guessed at:

1. **Reaches a patient** outranks everything. A wrong printed dose is the only failure mode here
   that is not recoverable.
2. **A live authorisation hole** outranks a latent one, because the system is in use by real NICU
   staff right now.
3. **Something already half-done** outranks something not started — an unexercised deploy is a
   liability that costs little to discharge.
4. **Compliance gaps with no incident pressure** rank below live risk but above polish, because
   they get harder to fix as the data grows.
5. **Anything whose fix could itself break a clinical number** waits for a quiet week.

🔴 **Two of these are Praew's call to overrule, not mine** — the stock-concentration check is a
physical act in the ward, and whether `TARGETS.fluid` should take birth or current weight is
clinical judgement. Everything else is engineering sequencing.

---

## 🔥 Now — this cycle

- [ ] 🩺 **safety · Before the 2026-09-22 TPN-team frontend ships, tell pharmacy and the TPN team what
      changed** (`CHANGELOG.md` 2026-09-22, "The TPN team's feedback"). **Praew's to do.**
      - The printed order is now **two sheets, for double-sided printing**. The front is the KCMH paper
        form's layout, with one row per product. The back is the compounding detail: Factor, stock mL, WFI.
      - The new **ZnSO₄ line is elemental zinc**, mg/kg/d. **Ask pharmacy whether the paper form's
        "ZnSO₄ … mg" means elemental Zn too**: a salt figure is about 4.4× higher. Also ask which ZnSO₄
        stock they add. With its mg Zn/mL, the form could print the mL and count it in the WFI.
      - MgSO₄'s in-bag mL now names its vial (10%/50%).
      - **Answers for the team.** GIR uses the delivered rate: Volume ÷ 24 is the Rate box, and dead space
        is not in it. MEN was not reproduced; ask for a screenshot of the number they saw move.
- [ ] 🩺 **safety · Tell pharmacy: the pharmacy form changed on 2026-09-18 at 11:17 ICT** (PR #77,
      `STATUS.md`). Every new NICU/SCN TPN order starts with 30 mL dead space and prints PREPARED
      figures, and Soluvit and Peditrace are × Factor, so on an overfilled bag their printed mL (and the
      components and WFI) differ from the KCMH worksheet's G43/G45 — 2.5 against 2.0 mL for a 2 kg
      infant on a 120 mL day. § Next asked for pharmacy to be told *before* this shipped, and nothing
      records that it was. **Praew's to do, or to tick if already done.**
- [ ] 📈 **ops · `Audit_Log` growth — now with a hard limit.** The poll adds **15 `readRegistry` rows per
      hour per open tab**, and Google Sheets caps a **workbook** at 10,000,000 cells — empty grid cells
      included. A tab made by `insertSheet` is 26 columns wide, so each 4-column audit row costs 26
      cells; at the limit **every bedside save fails** (the audit append fails silently, the writes
      don't). **Manual step for Praew: delete columns E:Z of the live `Audit_Log` tab** (no data lost,
      ~6.5× headroom); `sheetHealthReport()` reports the grid size. **Measured 2026-09-18: 1.6 % of
      the limit** (workbook 158,024 cells; `Audit_Log` 1,630 rows × 26 columns = 42,380), so the trim
      is not urgent. Still decide a retention/rollup policy. `PRD.md` § 6 M1 counts *distinct actors per week*, never row counts, so a rollup must not
      break that — `test/verify-usage-metrics.cjs` test 9 already fails if it does.
- [ ] 🧹 **data · What `sheetHealthReport()` found in the live Sheet on 2026-09-18** (Praew — Sheet
      edits, not code):
      - one **Transferred** record's stored first weight is `3`, kilograms where grams belong. `@55`
        refuses any edit of that record until the cell is corrected. The row is named in the private
        review file (`NEOFEED_REVIEW_2026-09-17.md` § 11), not here;
      - **7 Active records have no `Daily_Log` entry in 30 days.** Check whether those infants are still
        on the unit; each Active record stays on every ward device and in every sync;
      - **3 `Daily_Log` rows have a blank sessionId**, so no infant owns them.
- [ ] 🔒 **security · Flip `GOOGLE_HD_ENFORCE` after one normal week on the new backend** (`@55` live
      since 2026-09-18, so on or after 2026-09-25). Check the
      Script Property `hd_seen_chula.ac.th`: `"yes"` → set the flag to `true` and redeploy; `"no"` →
      someone signs in with a non-Workspace Google account for that domain and needs a password
      account first. Steps are in the comment above the flag. **Since the 2026-09-22 Chula domain
      list there are five `hd_seen_<domain>` properties to check. The four new ones started recording
      with `@56` on 2026-09-22 (16:34 ICT)**, so for them the week ends on or after 2026-09-29.
- [ ] 🔒 **security · Clear the old password on each Chula-domain row once its owner has signed in with
      Google.** The domain change itself is live (`@56`, 2026-09-22 16:34 ICT). **Praew's call:**
      Chula-domain Staff rows that already hold a password keep it — Google sign-in works for them
      either way. Once each such person has signed
      in with Google, `clearStaffPassword(email)` removes the password, per "ไม่ต้องมาสร้าง password
      ที่นี่". Not before: a Workspace admin can block Google sign-in to outside apps, and then the
      password is that person's only way in.

- [ ] 🩺🔒 **safety · Exercise the live stack (`@56` + `release` = `edbd11f`) in one bedside session.**
      ✅ *2026-09-18:* a real login and a real save on `@55` (Praew), right after the switch, from the
      old `sync-poll-0916` frontend. The review frontend has been live since 09:10 ICT and the ward
      requests since 11:17 ICT; nobody has reported using either, so every line below is open.
      *2026-09-22:* two more frontend releases, #85 (17:39 ICT) and #88 (21:15 ICT), equally unused so far.
      Everything shipped 2026-09-12, 2026-09-15 and in the 2026-09-18 frontends is verified as
      *deployed*, none of it as *used*. One session closes the lot:
      - *(no bedside needed)* the newest `Daily_Log` rows' `appVersion` (column AG), or a printed
        order's footer, reads `b=f48894ce64;d=ce3e213cfe;…;a=47c3f626cb` with constants `2026-09-18.1` —
        the live frontend's stamp since 2026-09-22 21:15 ICT, in full in `STATUS.md`;
      - a real login and a real save;
      - **edit a saved order without saving → Print must refuse**;
      - **K 5 mEq/kg/d → Save must demand a reason, and that reason must appear on the printed form**;
      - check the new printed lines (HN/AN boxes, saved-by/time/revision, changes vs the previous order);
      - a real Delete;
      - *(2026-09-15)* **from a second device, register or move an infant onto an occupied bed → the
        server must refuse it**;
      - **open a discharged record whose bed was reused → it must still save**;
      - glance at the NICU/SCN gate for any bed held by two Active infants, which is now unsaveable
        until one is transferred.
      - *(2026-09-17 review, live since 2026-09-18 09:10 ICT)* the login screen must render, not stay
        blank; leave a workstation untouched 30 min → it must log out
        with the idle notice; correct a birth weight on an infant with a saved order → Print must
        refuse with the dosing-weight banner; enter a growth measurement on one device and edit the
        same infant's diagnosis on another that has not synced → the measurement must survive; an
        infant on full feeds must no longer demand a lipid/K override reason;
        `valhalla-health.github.io/neofeed/` must land on the Thai "moved" page (its guard now runs
        from `boot.js`).
      - *(2026-09-18 ward requests, live since 11:17 ICT)* a MEN feed moves no tile; the Magnesium tile
        shows; Aminoplasmal 15% is not offered; a new NICU/SCN order starts at 30 mL dead space and
        prints PREPARED figures; the Soluvit and Peditrace rows print "× Factor → delivers …".

      Stubs model neither `CacheService` eviction nor `LockService` contention, so **only a person
      can close this.** Supersedes the `@53`/`@50`/`@47` versions of this item.
      ✅ **Deployed 2026-08-26** — TEMP-DEBUG reverted, and the server-side plausibility guard
      (`0004d5c`) is finally live after never having been deployed at all. What remains is the human
      half, and it is now worth more than before because one session discharges three things at
      once: the standing *"auth changes never exercised outside a stub"* item, confirmation that
      `Daily_Log` AF–AG actually fill with `2026-08-26.1`, and a first real Delete. Stubs model
      neither `CacheService` eviction nor `LockService` contention, so **only a person can close
      this.** Supersedes the old `@47` version of this item.
- [ ] 🧹 **chore · Run `applyLogHeaderColumns()` once from the Apps Script editor.** Adds the
      cosmetic `constantsVersion`/`appVersion` labels to `Daily_Log` row 1. Purely presentational —
      the columns are read and written by index and already work without it. It executes as the
      signed-in user and may raise an OAuth consent, **so it is Praew's to run.**
- [ ] 🩺 **safety · Confirm Na acetate (3 mEq/mL) and KCl (2 mEq/mL) stock concentrations against the
      shelf.** Both were *inferred* from the KCMH worksheet's divisors, not read off an explicit
      strength label. **These corrected concentrations change the mL printed on every order form** —
      the highest-stakes open item in the repo. Blocked on a physical check in the ward, not on code.
      ⬆️ **Now answerable after the fact:** since `@50` (2026-08-26) every saved row and every
      printed order carries `CONSTANTS_VERSION`, so when the shelf check lands, *"which orders used
      the old divisor?"* has an answer. Rows written **before** 2026-08-26 have a blank AF and
      cannot be attributed — that set is now fixed and will not grow.
      ⬆️ **2026-09-17 — the same pharmacy check must cover how small volumes print.** Stock volumes
      for NaCl, Na acetate, KCl, Glycophos, Ca gluconate, Soluvit and Peditrace are rounded to
      **0.1 mL** (K₂HPO₄ and MgSO₄ to 0.01): for a 500 g infant "NaCl 0.5 mEq = 0.1 mL" is really
      0.34 mEq (−32 %), KCl/Na acetate +20 %. Praew (2026-09-17): the Na dose itself may still be
      wrong — confirm with pharmacy before changing either. `verify-review-0917-calc.cjs` § 6 pins
      today's printed figures so nothing drifts meanwhile.
- [ ] 📈 **product · M1, weekly active users — ⚙️ BUILT 2026-08-21, NOT YET RUN.** `usageMetrics()` +
      `getUsageMetrics()` are in `gas-backend.gs`, pinned by `test/verify-usage-metrics.cjs`
      (30 assertions, green). **The number still does not exist**, because nothing has read the live
      sheet yet. To close this: run `getUsageMetrics()` **once from the Apps Script editor** — it is
      not on the `doPost` path, so **no redeploy is needed** — and it is **already deployed**
      (`@47` onward, still present in `@50`), so it is sitting in the live project waiting to be
      called. It executes as the
      signed-in user and may raise an OAuth consent, which is Praew's to approve. **Still
      deliberately not wired to `doPost`**: it was kept off the auth deploy so that release carried
      nothing but the security fix. Wire it when a UI actually wants the number.
      Definition and the two hard constraints: `PRD.md` § 6.

## ⏭ Next

- [ ] 🎨 **ui · The `search` glyph renders as a bare ring wherever it appears.** The topbar's
      Switch-patient button, the registry's search field and the empty-state "เลือกผู้ป่วย" button all
      show an outline circle instead of a magnifier — visible in every screenshot Praew has sent since
      the teal era, so it predates the palette work. `icons.jsx` lists `search` in `filled`, and its
      lens and rim subpaths are wound the same way, so under the default nonzero fill-rule the lens
      fills in and only the rim survives. Exactly the `calc` bug of 2026-09-21, with the same two
      possible fixes: a stroked sibling used only by these call sites, or `fill-rule="evenodd"` on the
      shared `<Icon>` — the latter silently redraws nine icons, so it needs a look at all nine first.
      Raised 2026-09-22 (2); **not** fixed there because it was not what was asked for.
- [ ] 🎨 **ui · At 280px the calculator's `.two-col` rows are clipped, not scrolled.** ~20px wider than
      the accordion body's `overflow: hidden` allows, so the content is cut rather than draggable. The
      Galaxy Z Fold's cover screen is the only device this narrow — below every current iPhone (320) and
      effectively every Android (360) — so it is logged, not chased. Found while measuring for
      `verify-mobile-fit.cjs` (2026-09-22 (2)), which passes at 280px precisely because nothing scrolls.
- [ ] 🎨 **ui · The login screen has no palette of its own yet.** Praew, 2026-09-22: *"เดี๋ยวไปหา
      palette สีที่เหมาะสมมาก่อน"*. It is on the app's teal sheet for now, with the re-tinted two-tone N.
      The mechanism for holding it on a different one is written down and was used once: re-declare, on
      `.login-wrap` itself, the seven tokens the screen consumes (`--bg`, `--brand`, `--brand-4`,
      `--sand`, `--line`, `--ink-2`, `--ink-3`) — custom properties inherit, so no `.login-*` rule has
      to name a literal. See `CHANGELOG.md` 2026-09-22 (2) § 4.
- [ ] 🩺 **safety · `registerPatient` silently overwrites on a colliding `initials+BW` pseudonym.**
      Two different infants sharing initials and birth weight collapse into one record. Needs an
      identity decision before code — a collision suffix changes every `Daily_Log` join.
- [ ] 🩺 **safety · `TARGETS.fluid` is documented as taking birth weight, but every call site passes
      current weight.** One of the two is wrong. **Clinical decision, not a bug fix** — decide which
      is correct, then make code and docs agree.
- [ ] 🧱 **product · The app is installable but has no offline capability.** `manifest.json` makes it
      a PWA and staff have home-screen installs, but there is **no service worker**, so a home-screen
      icon opens to nothing with no network. Partially addressed 2026-08-26: the staleness banner now
      *tells* the user they are offline and that saves will not reach the sheet — that is the
      safety-relevant half, and it is shipped. The rest is a cached shell (read-only, clearly
      labelled) and, only after the server-side one-entry-per-date guard exists, a queued save.
      See `NEOFEED_DIGIHEALTH_UPGRADE_MAP.html` §05 for the three levels.
- [ ] ⚖️ **PDPA · No retention or auto-purge policy after discharge** — records persist indefinitely
      in the Sheet today. ⭐ **This is the candidate scope for the 3099706 course project** (see
      `PRD.md`'s course-link note): it is genuinely not-yet-built, so the coursework produces real
      work rather than a hypothetical.

- [ ] 🩺 **safety · Clinical questions from the 2026-09-17 calculator review — Praew's decisions.**
      - Ca in the bag with no IV phosphate while oral phosphate is ordered: the Step 4 Ca:P tile is
        red but raises no critical alert (the one remaining red-tile-without-alert case).
      - No sanity alert for a typed TPN calc. weight far from the current weight (8500 g vs 850 g
        prints), or for heparin typed as 10 U/mL — thresholds needed.
      - Protein's 4.8 g/kg/d hard limit still reads TPN + EN; the other hard limits now read the IV
        portion only. Same rule for protein?
      - Consequence of IV-only NPE:AA: mixed TPN + feed days can now need a reason where the total
        did not (bag alone 17 kcal/g). Intended?
      - "Input" on a new day still defaults to the prescribed total and counts as filled; should it be
        typed like Urine output / Drain?
      - A feeds-only day still prints a TPN form. Since 2026-09-18 it no longer lists vitamin mL or a
        negative WFI for the bag that does not exist. Should a TPN form print at all with no TPN?
- [ ] 🩺 **safety · Questions left by the 2026-09-22 TPN-team release — Praew's**
      - **Lipid rate ceiling.** The pump card now shows g/kg/h, with no limit on it. Sources give 0.125–0.17
        g/kg/h; should NeoFeed warn above one?
      - **K⁺ route ceilings.** The team's "peripheral 60 / central 200 mEq/L" print for reference, with no
        source named. Ask for one, or drop them.
      - **Glycophos mL on a phone.** Under 768 px the shell's mobile CSS hides the Step 4 per-day column,
        which holds the new "= X mL/d"; the line under the chips still gives mL/kg/d and the bag mL. PR #87
        is reworking the phone layout.
- [ ] 🩺 **safety · Decisions from the 2026-09-18 ward requests — Praew's** (`CHANGELOG.md` 2026-09-18 (2)).
      - **Which day ends "the first days of life"?** Step 4 switches Ca and P to the growing-preterm ranges
        after DOL 1 (`TPN_TARGETS.ca/p`), but Mg (and Na) after DOL 2. On DOL 2 the new Magnesium tile
        still reads the first-days range while Calcium and Phosphorus beside it read growing. Pre-existing,
        now visible side by side; ESPGHAN 2018 gives no DOL cutoff.
      - **Term infants.** The Ca / P / Mg tiles use the preterm rows for every infant. ESPGHAN 2018's
        0–6 month row (the table the team sent) is lower: Ca 30–60, P 20–40 mg, Mg 0.1–0.2 mmol
        (0.2–0.4 mEq). A term infant past DOL 2 reads "off target" low against the growing-preterm row.
      - **FYI for the team's table:** it prints growing-preterm Ca and P as 1.6–3.5 mmol **(100–140 /
        77–108 mg)**. Those mg figures are 2.5–3.5 mmol; 1.6 mmol is 64 mg Ca / 50 mg P. The published table
        disagrees with itself, and NeoFeed uses the mmol column (64–140 / 50–108 — `CONSTANTS_VERSION`
        2026-08-27.1). Worth saying before the team reads the Calcium tile against the mg column.
      - **Feed magnesium.** `EN_DB` has no Mg for any feed, so the Magnesium tile is the TPN's Mg only
        (it says so). Counting feeds needs a sourced Mg value per feed.
      - **Should a TPN with no Ca (or no P, no Mg) be flagged?** A tile at 0 reads "empty" and raises no
        line: the app treats 0 as "not ordered", not "low". The team will notice once MEN stops counting.
        In their screenshot the MEN feed's 5 mg/kg of Ca produced "Calcium off target" on a TPN with no
        calcium. That line is gone, the same as for any TPN-only order.
      - **Tell pharmacy before this release ships: Soluvit and Peditrace are now × Factor** (Praew decided
        2026-09-18; `CHANGELOG.md` 2026-09-18 (2) §5). On an overfilled bag the printed mL are higher than
        the KCMH worksheet's G43/G45 give — 2.5 vs 2.0 mL for a 2 kg infant on a 120 mL day — so that the
        infant receives the full 1 mL/kg. The form's vitamin rows say "× Factor → delivers …" and name the
        sheet rows. Pharmacy should compound from the form, or change G43/G45 in their own sheet too.
      - **A deliberate 0 dead space has to be chosen again each day.** A new day turns yesterday's 0 into 30,
        because a saved 0 cannot be told apart from the old default. Fine if 0 is rare; otherwise it needs its
        own "no dead space" flag in `calcInput`.
      - **When an older-children ward is added** (`bedWard`, `BED_OPTIONS`, then `OLDER_CHILD_WARDS`),
        Aminoplasmal 15% becomes selectable there, and its new orders start at 0 mL dead space until that
        ward's own value is set in `defaultDeadVolFor`. Its label's line is **2 years**, not a ward, so an age
        check may be wanted then. Center Point needs a packet version with a product slot before it
        can offer it.
- [ ] 🧱 **follow-ups · From the 2026-09-18 pre-deploy review** (`CHANGELOG.md` 2026-09-18 (2) §6) —
      engineering, low risk, not blocking.
      - **Center Point, since the 2026-09-22 TPN-team release.** CP's `neofeed-tpn-v2` packet has no
        ZnSO₄ slot, so the CP entry does not offer ZnSO₄. CP's sheet (`tpn-document.mjs`, digest-pinned)
        still prints its own one-page layout and its own number formats, trailing zeros included. Bring
        both in with the next packet version.
      - **Center Point's packet cannot say a feed is MEN.** A CP order with a MEN feed prints its planned
        enteral volume, but "energy incl. EN" is TPN-only, and the EN Ca/P slots read "—". `calc.isMEN`
        reaches `buildTpn`, which drops it. The fix is a MEN slot (packet schema bump) or relabelled slots,
        either way a `tpn-document.mjs` change: sync CP's copy, re-pin, update the digest. CP is
        synthetic-only, so nothing reaches a patient meanwhile.
      - **The daily log and alert centre still treat a MEN row at 100 mL/kg/d or more as full feeds.**
        `log.jsx` `pickTarget` (target bands) and `app.jsx` `computeAlerts` read `enVolPerKg >= 100`,
        while that row's saved totals exclude the feed. Use `!entry.calcInput?.isMEN && …`.
        `enVolPerKg` must stay the real volume, because `savedDosingWeightOf` reads it. The calculator
        already warns on MEN above 24 mL/kg/d, so this only follows an input the ward was told is wrong.
- [ ] ⚖️ **PDPA · Three questions from the 2026-09-17 security review — Praew / DPO.** Should a
      registry read still be served when its `Audit_Log` row cannot be written (today: yes, fails
      open)? Should Staff column H keep plaintext temp passwords? Should a session that *expires*
      (not an explicit logout) also clear calculator prefill and alert acknowledgements?
- [ ] 🧹 **chore · Stop publishing the six `.jsx` sources in the next release.** `.assetsignore` and
      `_config.yml` kept them for the release that introduced the build step only, so that a browser
      still holding the previous shell could finish loading. That release has been live since
      2026-09-18 (`STATUS.md`). Exclude them on both hosts in the same change that flips
      `test/verify-build-shells.cjs` 5.6, which today requires them to be published.

## 🕓 Later

- [ ] 🩺 **safety/governance · Decide who may create and Submit a TPN order.** `canWrite` includes
      nurses for `logDailyNutrition`/`publishLog`, and the Intake/Output card lives inside the
      Calculator, so a nurse recording urine output re-saves the whole order (2026-09-11 review P2).
      Proposed: a separate nursing-entry screen (weight, I/O per shift, feeds given) writing its own
      columns, then narrow order writes to prescribers. **Clinical workflow decision — Praew's.**
- [ ] 💊 **product · Pharmacist role** — read-only plus a received/verified/compounded status per
      order. The printed form now carries HN/AN boxes, saved-by/time/revision and changes-vs-previous
      (2026-09-11); the status loop is not built.
- [ ] 🩺 **safety · Confirm the HMF start threshold** the app shows (`hmfStart: 40` mL/kg/day). The WHO
      tab used to say ≥100 while the EN tab said ≥40, both citing WHO 2023; both now show NeoFeed's 40
      and say "confirm locally".
- [ ] 🔒 **security/process · GitHub hygiene from the 2026-09-11 review:** (the `test` workflow is already a
      required check on `release`, and secret scanning is on — both done 2026-09-11); decide whether `tasamew` stays admin (no
      longer the required `release` approver — 0 approvals since 2026-09-18, see `REFERENCE.md`); **`tasamew` to delete the
      public fork `tasamew/neofeed`** (asked 2026-09-18) — a 2026-06-16 copy whose `main` holds 3 commits never merged here
      (the "DOL today" edit-form change, `f4c4708`, `c9e14fe`, `728158f`), so they check those first; confirm 2FA on both
      GitHub admins and on the Cloudflare account; close/delete the stale branches and draft PR #56. **Not PR #57**
      (`codex/center-point-v2`): since 2026-09-15 it is active, paired with NICU-Center-Point PR #12, and the
      two must merge together (CP accepts only the `neofeed-tpn-v2` packet #57 builds).

- [ ] 🩺 **safety · `FENTON_LENGTH` / `FENTON_HC` are unverified against any source** and sit at
      4-week steps. `FENTON_WEIGHT` was verified against Fenton 2025 on 2026-08-10 and re-checked
      2026-09-05 against the official ucalgary.ca v2 cutoff table (which caught and fixed GA
      36-41 boys / 36,40,41 girls drift — see `CHANGELOG.md`); the other two still have **no
      public numeric table to check against at all** (charts only). Praew is emailing
      tfenton@ucalgary.ca for the LMS parameters.
- [ ] ⚖️ **PDPA · No self-service access/rectification path** for data-subject requests; handled
      manually by an admin editing the registry. Worth a real endpoint if volume grows.
- [ ] ⚖️ **PDPA · Cross-border transfer (Sec 28) never evaluated** — data lives in Google
      Sheets/Apps Script. Verify Google Workspace's DPA/SCC coverage is adequate for the org's
      data-location requirements.
- [ ] ⚖️ **PDPA · `Audit_Log` gains a row per re-sync per user per minute** (since `syncFromGAS`
      began running on tab focus). It grows without bound and its signal-to-noise for accountability
      review has dropped. ⚠️ **Fixing this interacts with M1** — do not thin the log in a way that
      destroys the distinct-`actorEmail`-per-week signal.

### Carried over, unverified

Copied from the old `HANDOFF.md` "Known caveats", written around session 8 (2026-05-25). **The line
numbers are certainly stale and the claims were not re-checked during the 2026-08-21 split** —
verify before acting on any of them.

- [ ] `enVolPerKg` is logged on new submissions, but legacy entries from before session 8 lack the
      field and fall back to PN targets.

*(Removed 2026-09-17 after checking: "GAS `Unauthorized` shows a toast rather than redirecting" — it
redirects, and since the review it also says why; "`_buildLogRow`'s date fallback uses `toISOString()`"
— it uses `_wardDateKey()`.)*

- [ ] 🧹 **docs · Two identifiers in public docs** (2026-09-17 review): `REFERENCE.md` names the
      Cloudflare account email — refer to it by role; `.gitleaks.toml`'s custom rule only matches
      `NAME = "…"` assignments, so a bare Sheet ID pasted into a doc passes the scan.

---

## ⛔ Standing guardrails — NOT tasks, and must never be ticked

These sat in the task list until 2026-08-21, where a future reader could have "completed" one. They
are decisions to *keep*, not work to do.

- **Do not widen the Fenton axis past 42 wk** to "fix" the hidden-measurement banner. The GA 44–50
  rows in `data.js` are unverified. Source real post-term data first. `GA_MAX` in `fenton.jsx` is the
  single switch for domain, ticks and dataset filter.
- **Accepted residual risk:** `sessionId` = `initials+BW+twinSuffix` is a **pseudonym, not
  anonymous**. Erasure cannot scrub that pattern from an already-issued sessionId without breaking
  every `Daily_Log` join. Documented and accepted, not fixed.
- **Mobile Fenton chart keeps pan/zoom**; the SVG width-760 layout survives via
  `width: 100%; height: auto`. Recorded so nobody "fixes" it into a responsive rewrite.
- 🔴 **This Sheet's sharing must never become "anyone with the link."** Verified 2026-08-23:
  `SPREADSHEET_ID` (`1cZSA2qAUWAvFmpzrcjxS8kw6r-MpCMOSVAJev1uNDtI`) was hardcoded in `gas-backend.gs`
  in the **initial commit** (2026-05-17), before being moved to Script Properties. `valhalla-health`
  has been a **public** repo since that commit, so the ID itself must be treated as permanently
  known to anyone who ever cloned or scraped the repo — rewriting git history would not undo that,
  it would only stop *future* clones from getting it. Checked `get_file_permissions` on 2026-08-23:
  the sheet is currently shared with **only** `peeraporn.po@chula.ac.th` (owner), no link-sharing,
  no domain-wide access — that ACL is the *only* thing standing between the leaked ID and real
  access. If sharing is ever loosened, even briefly, this stops being theoretical. `CLIENT_ID`
  (also hardcoded in the same early commits) is not a comparable risk — Google OAuth client IDs for
  web apps are meant to be public and this one already sits in `index.html` today.

---

## Definition of done

An item leaves this file only when all of these are true:

1. The change is on `main`.
2. If it changed behaviour, a harness in `test/` **fails against the unpatched source** and passes
   against the patched one — the repo's convention, see `TDD.md`.
3. If it was deployed, **`STATUS.md` was updated in the same commit** — not later. It went stale
   twice when deployment state lived inside `HANDOFF.md`.
4. A `CHANGELOG.md` entry exists, and the line is **deleted from here**. An item in both files is a
   bug in the process.

## The weekly review

Fifteen minutes, one pass down this file. Three questions per item, in this order:

1. **Is it still true?** § *Carried over, unverified* exists because four claims from May survived
   three months unchecked. Delete what has quietly fixed itself.
2. **Has anything moved between Now / Next / Later?** New information re-ranks; the ordering above
   is a decision, and decisions get revisited on purpose rather than by drift.
3. **Did anything ship without leaving?** Cross-check the last week of `CHANGELOG.md` against this
   file.

**`git fetch` before you start.** On 2026-08-21 three PRs landed on `main` mid-edit and the first
attempt at the doc split was built on a stale file. This repo moves under you.
