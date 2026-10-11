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

- [ ] 🩺 **safety · What the 2026-10-08 outside review left open** (`CHANGELOG.md` 2026-10-08 (2)). Its
      advice: hold routine pharmacy use until these close. Fixed already: the peripheral K⁺ maximum (#137,
      released by #138) and the dosing weight (that entry). The 0.1 mL rounding is the pharmacy item below.
      - **Ward acceptance before the first routine order**, with synthetic infants on the ward's own phone,
        workstation and printer: ELBW small-volume salts; dosing below birth weight; outborn admission and
        DOL; peripheral K⁺ at and above 60, central at and above 200; lipid either side of the ceiling; MEN
        and feeds-only days; mixed PN/EN; a revision of a published order. Pharmacy reconciles the printed
        ingredients, prepared against delivered volume, Factor, WFI, the salt rounding and both sheets.
        Also: a draft after a network failure, two people editing one order, logout and a shared device.
        **Praew's to arrange.**
      - **Lipid ceiling against the label.** The US SMOFlipid label caps pediatric infusion at 0.75 mL/kg/h
        (0.15 g/kg/h); NeoFeed turns critical above 0.17 (TPN team, 2026-09-28). Ask the TPN team what the
        Thai product label and local policy say. **Praew's to ask.**
      - **The backend trusts the client's numbers.** It range-checks the totals but does not recompute
        them from `calcInput`, check route concentration limits, or require an override reason before a
        publish. A signed-in account with a modified client can store safe-looking totals beside
        contradictory inputs. Separate hardening; size it after the ward acceptance.
      - Decided, not to do (Pp, 2026-10-08): nurse order writes stay tied to `NURSING_LOG_ENABLED` (D5
        holds once the nursing form is on); the lipid rate stays graded on the 2-decimal figure shown.
- [ ] 💬 **ops · Send one real help request** (`CHANGELOG.md` 2026-10-05). Shipped on 2026-10-06 by #136
      with backend `@62`. Left: send one from the app and check it reaches praew.tvl@gmail.com through the
      valhalla.team.th filter. Once PR #144 is live (`@64` first), send it from the topbar button on a phone,
      with a cropped picture, and check the forwarded copy still carries the attachment. As of 2026-10-09
      the only "[NeoFeed help]" mail in praew.tvl@gmail.com is the 2026-10-05 filter test, which Gmail
      showed in Sent alone, so the forward itself is unproven.
- [ ] ⚖️ **PDPA · Tell the DPO a help request can carry a picture** (PR #144, `CHANGELOG.md` 2026-10-09
      (2)). A screenshot of NeoFeed can show an infant's initials, bed and weights, and it leaves by email to
      a Gmail account. The form asks for names, beds and HN to be cropped out and shows the picture before
      it goes; nothing enforces it. The app strips EXIF. Goes in the same DPIA note as the four-letter name
      (§ Next) and D7. **Praew / DPO.**
- [ ] ⚖️ **PDPA · Check the live `Patient_Registry` for erased rows the refill already reached.**
      **Praew's to do** (Sheet access). Look for rows whose name (B) starts `[PDPA-erased` and whose dob (G)
      is not empty. A refill could only have run on 2026-09-24, from about 14:22 ICT to 21:17:37 ICT, when
      `@59` went live. `Audit_Log`'s `pseudonymize` rows name every erased sessionId, and none means there
      is nothing to check. For a hit, either clear that G cell by hand and note it here, or erase the
      record again, now that `@59` is live. The second way is audited, but it re-dates the marker to that
      day.
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
      - **K⁺ in the bag (2026-10-08).** The notice now says: **peripheral maximum 60 mEq/L** (it was 200;
        Praew), central 200. Above 60 a peripheral order cannot be saved or printed, and the form reads "max
        60". Orders saved before that release must be saved again before they print (`CONSTANTS_VERSION`
        2026-10-08.1), and a peripheral order saved at 61–200 only once its K⁺ is 60 or below. **It goes out
        after the release that carries it**, not before.
- [ ] 🩺 **safety · Tell pharmacy: the pharmacy form changed on 2026-09-18 at 11:17 ICT** (PR #77,
      `STATUS.md`). Every new NICU/SCN TPN order starts with 30 mL dead space and prints PREPARED
      figures, and Soluvit and Peditrace are × Factor, so on an overfilled bag their printed mL (and the
      components and WFI) differ from the KCMH worksheet's G43/G45 — 2.5 against 2.0 mL for a 2 kg
      infant on a 120 mL day. § Next asked for pharmacy to be told *before* this shipped, and nothing
      records that it was. **Praew's to do, or to tick if already done.**
- [ ] 🩺 **safety/product · The TPN team's meeting of 2026-09-28: 28 requests, in three groups.** The item
      numbers are those of Praew's meeting notes. Items 1 and 3 already work that way, so there is nothing
      to build, only the team to tell: Peditrace is × Factor, so it covers the line's volume
      (`calculator.jsx` `peditrace_vol`, since 2026-09-18), and lipid is dosed on the actual weight with no
      overfill (`lipidG`).
      - **A · Can do now — built in PR #129** (`CHANGELOG.md` 2026-09-28): 4 (no
        Nutritional Status), 6 (feed groups), 10 (dead-space chips 30 / 50 / 100), 11 (dextrose hint),
        14 (no grams column), 15 (no WFI in Step 2), 16 (g/kg/h to 2 decimals, typed hours), 18 ("20% lipid"
        on screen), 19 (P per mL), 25 ("สารน้ำเกินแผน"), 28 (no email at "แพทย์"). The parts of 6, 14, 16,
        18 and 19 that need the team are under B and C.
      - **B · Waiting for the team's numbers — Praew to ask.**
        - **6 · New feeds.** Hi-Q Pepti Gastro 20 and 24 kcal/oz, and Nutramigen: per 100 mL kcal, protein,
          fat, CHO, Na, K, Ca, P and osmolality from the labels KCMH stocks, and how 24 kcal/oz is mixed.
        - **12–13 · Phase.** Who sets acute / stable / recovery, on what criteria; for each phase the
          glucose (mg/kg/min and g/kg/d), energy, amino acid and lipid ranges; which references follow the
          phase and which stay on DOL. Today energy, lipid, Na and K switch by DOL (transition ≤ 2,
          intermediate ≤ 7, then stable, as the Reference page's electrolyte table prints), so "stable"
          would mean two things. Below 37 weeks PMA, what separates acute from recovery? The calculator
          uses no PMA yet.
        - **14 · Amino acid for older children.** Is "10% aminoparen" Amiparen 10% (`AA_PRODUCTS` lists it,
          > 1 yr) and "15% aa" Aminoplasmal 15% (not under 2 yr)? Which beds count as an older-children
          ward (`OLDER_CHILD_WARDS` is empty), and their dead space.
        - ~~16 · Lipid~~ — **answered by Praew on 2026-09-28 and built** (`CHANGELOG.md` 2026-09-28 (2)): the
          pump rate stays at 2 decimals; ceiling amber above 0.13, critical above 0.17 g/kg/h; hours 1–24.
        - **17 · Vitalipid.** Which products (N Infant, N Adult), each one's dose (today 4 mL/kg, max
          10 mL) and who gets which.
        - ~~20 · Na acetate~~ — **answered by Praew on 2026-09-28, after checking with the TPN team**:
          *"confirm with tpn team แล้ว 1 mL มี Na 3 กับ acetate 6 mEq"*. **Na 3 mEq/mL is
          `KCMH_STOCK.naAcetate`**, so every Na dose and printed mL stands; the Na half of "Confirm Na
          acetate …" below is closed. The team gives acetate as 6 mEq/mL. Sodium acetate is 1 : 1, so
          3 mEq Na/mL would carry 3 mEq acetate/mL, and 6 may be the osmolarity (6 mOsm/mL). NeoFeed shows no
          acetate today (`naAcet` feeds Na only), so nothing prints wrong. **Before acetate is ever shown (in
          mmol/kg/d?), read acetate and mOsm per mL off the vial label.**
          ➡️ *Later the same day:* Praew asked for acetate to be shown, then chose to wait for the label. The
          display is built (Step 4 caption and note, copied order) and switched off:
          `KCMH_STOCK.naAcetate.acetateMeqPerMl` is `null`.
          - [ ] 🩺 **Praew: photograph the Na acetate vial label; set `acetateMeqPerMl` from it (3 if the 6 is
            mOsm/mL) and add its row to `docs/CLINICAL_CONSTANTS.md`.**
        - **21 · Ca–P precipitation.** Whose curve (manufacturer or pharmacy) for K₂HPO₄ with Aminoven
          Infant 10 %, at which AA and Ca concentrations and temperature, and where it warns or stops.
          Glycophos is an organic phosphate, outside such a curve.
        - **22 · Mg in mg/kg/d.** Milligrams of elemental Mg or of MgSO₄·7H₂O? They differ about 10×:
          1 mEq = 12.2 mg Mg = 123 mg MgSO₄·7H₂O. The app's mg/kg/d line is elemental. Which range: the
          one the Magnesium tile already cites (ESPGHAN 2018: preterm first days 0.1–0.2 mmol, 2.5–5 mg;
          growing 0.2–0.3 mmol, 5–7.5 mg)?
        - ~~23 · 26 · K⁺ and osmolarity by route~~ — **answered by Praew on 2026-09-28 and built**: central
          amber from 60; the KCMH 40 mEq/L stop is cancelled; no upper osmolarity limit on a central line.
          **Source search (2026-09-28):** peripheral 60 fits published neonatal practice, but central 200 is
          above every neonatal or paediatric source found (ANMF 2020 central ≤ 80; IWK Health NICU 120; IMSN
          2020: 200 mmol/L bags are adult critical care only). At the 3.5 mEq/kg/d IV K⁺ stop a bag reaches
          200 only below 17.5 mL/kg/d, so its critical alert would almost never fire. ESPGHAN 2018 gives no
          central osmolarity limit either; "central" should mean a checked central tip (Kolaček R 10.13–10.16).
          `docs/CLINICAL_CONSTANTS.md` has the sources.
          - [x] 🩺 **Praew / TPN team, before this ships: keep central K⁺ 200, or lower it (80–120)?** Answered
            2026-09-28: red above 120, and 200 as a maximum that cannot be ordered (`CHANGELOG.md` 2026-09-28 (3)).
          - [x] 🩺 **Peripheral K⁺ maximum.** The review of PR #129 found that switching a central bag above
            200 to Peripheral made it orderable with a reason. Praew: "max 200 ทั้งสองสาย" — built
            (`CHANGELOG.md` 2026-09-28 (6)). ~~Whether peripheral should stop lower than 200 is for the team.~~
            **Answered by Praew on 2026-10-08, in chat: "เพดาน K⁺ สาย peripheral จะให้อยู่ที่ 60"** — built
            (`CHANGELOG.md` 2026-10-08). Above 60 a peripheral bag cannot be ordered; there is no confirm tier left
            on that route.
        - **25 · 26 · Bottles.** The TPN room's bottle sizes, and whether over the largest one is a confirm
          (split in two) or a stop.
        - **24 · Trade names.** Which products are the only one of their kind (Peditrace, Soluvit N,
          Vitalipid N, Glycophos?) and keep their name; the rest read generic (brand), as item 14 says.
        - **The edges of what A built.** 18: the form still ticks "20% SMOF" on the KCMH paper form's own list,
          and the copied order names SMOF: change them too? 11 and 14: the form keeps "g in bag", as the paper
          form has it: fine? 6: built as groups, not as new names: the right reading? 25: "สารน้ำเกินแผน": the
          right words? (19 is answered: the split is removed from the screen and still calculated.)
      - **C · New design work** (each needs a design Praew signs off; some also need B's numbers).
        - **7 · 8 · Feeds.** Brand and concentration chosen separately; a second feed with its own volume
          and feeds a day (BM alternating with PF, unequal counts) in place of the fixed 50 : 50
          "FBM 24 ↔ Infatrini 30". Touches `calcInput`, `Daily_Log`, the form and Center Point's packet.
        - **2 · Phosphate typed directly**, in which unit and landing in which salt. Today P follows the
          Na or K typed for Glycophos or K₂HPO₄.
        - **5 · Liver and renal dysfunction in the app**, saved with the order and printed ticked; decide
          whether they prompt anything (Peditrace's Mn and Cu in cholestasis, for one).
        - **9 · 28 · Acknowledging red alerts.** A tick per red alert before Print (today: a typed reason
          at Submit); the front sheet lists the critical alerts with a tick and a signature, and has a
          "ยืนยันการสั่ง" box for the sticker and signature.
        - **19 · 27 · A pharmacist view.** How many TPN orders there are; Submit = compound, Save draft =
          may be waiting for labs, do not compound yet. The "ถึงผู้ป่วย + คาสาย" split left the doctor's
          screen on 2026-09-28 (Praew: calculated, not shown); a pharmacist view could show it again. Joins
          "Pharmacist role" in § Later.
        - **26 · Alert tiers.** Confirm with a reason (osmolarity, K⁺, over the bottle) versus a hard stop.
          **"Bag cannot be compounded"** (components over the prepared bag) is a critical alert today, so
          a typed reason saves and prints it; a bag that cannot be made should stop.
        - **12 · 13 · The phase field, and glucose g/kg/d as large as GIR**, once B has the ranges.
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
- [ ] 🩺 **safety · Small-volume rounding on the pharmacy form — both stock strengths are now confirmed.**
      Na acetate 3 mEq/mL and KCl 2 mEq/mL were confirmed on 2026-09-28 (below); what stays open is the
      0.1 mL rounding of small stock volumes. History: both strengths were *inferred* from the KCMH worksheet's divisors, not read off an explicit
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
      ✅ **2026-09-28 — Na acetate confirmed** (B · 20 above): Praew checked with the TPN team, and 1 mL
      carries Na 3 mEq, the value NeoFeed already uses. ✅ **2026-09-28 — KCl confirmed**: Praew, "KCl 2 mEq/mL
      ถูกต้อง", the value NeoFeed already uses. **Still open: the small-volume rounding above.**
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

- [ ] **cleanup · `confirmOverwrite` is unused since 2026-09-27.** `registerPatient` still accepts it and
      writes a registration over the record that holds the id, which would file one infant's Daily_Log
      under another's name. No client sends it: a taken id is drawn again. Remove it, and the 2026-09-24
      decision it served, with the next backend change. Needs a `clasp` deploy.
- [ ] **product · a foreign name with one letter, or with no surname** (a Myanmar "U", a single-name
      mother) still cannot be registered: each part needs two English letters. Rare. Pp to say whether to
      allow a one-letter part or an empty surname for ชาวต่างชาติ.
- [ ] 🧱 **ux/infra · Loose ends from the bed-transfer review (2026-09-27).** Found while tracing the bed
      moves (`CHANGELOG.md` § Session 2026-09-27). None of them misplaces an infant, so none was built.
      1. **The phone sweep cannot see one box printing over another.** `verify-phone-sweep.cjs` flags
         content cut off inside an `overflow: hidden` box. The parked chip spilled over the Name column
         with overflow visible, so it passed. `verify-bed-transfer-0927.cjs` § 7 now measures bed
         cells. A general probe would compare each table cell's drawn content with its column.
      2. **Switch patient on a phone styles its cells by position** (`.picker-row > span:nth-child(n)`
         in both shells). That rule was written on 2026-05-28 for the old order (name first). The same
         day the columns were reordered with the bed first, and the rule was not updated. So on a phone
         the bed chip is drawn large and the name small and grey, the reverse of the rule's own comment.
         It is readable, but give the cells classes and decide which one leads.
      3. **An infant never given a bed shows an empty pill** in the Bed column (`BedChip` with a blank
         `currentBed` and no history). "—" would say it.
      4. **"SCN 01" ≠ "SCN 1"** in `normalizeBed`/`_normBed` (already listed under the 2026-09-23
         review, below) is the one bed-label gap left.

- [ ] 🩺⚖️ **product · ชื่อ + นามสกุล and the ward search (2026-09-25): three loose ends, all "later" (Pp).**
      Built in `CHANGELOG.md` § Session 2026-09-25 (2) and (3), pinned by
      `test/verify-ward-requests-0925.cjs` and `test/verify-phone-sweep.cjs`. Pp answered on PR #123
      (entry (4)): the topbar switcher stays unit-wide, the foreign-name rule is confirmed, and these three
      wait.
      1. ~~**The server's duplicate-id message still says "แก้ชื่อย่อ"**~~ **Done 2026-09-27**
         (PR #127): a new id is random, a taken one is drawn again, and no message
         names initials. Live with the next `clasp` deploy (`CHANGELOG.md` 2026-09-27 (2)).
      2. ⚖️ **Tell the DPO the name holds four letters now.** It held two (one letter of each name), and
         now holds two letters of each, with no vowels or tone marks, or two English letters of each for a
         foreign infant. It is Pp's decision, for finding and identifying an infant. A new infant's id
         carries nothing since 2026-09-27 (`NF-` and six random digits), so Copy Order carries no initials;
         no full name is stored. It belongs in the next DPIA note, beside D7.
         **Pp: later.**
      3. **One look on a real iPhone (Safari).** `test/verify-phone-sweep.cjs` checks 24 device sizes, but
         only in Chromium; the cloud container has no WebKit. Check two things there:
         - the calculator with every step open;
         - the login in landscape.
         Everything used is supported from iOS 16. Older iOS opens a step without its slide.
         **Pp: later.**

- [ ] ⚡ **perf · Login speed: fixes 1–4 LIVE 2026-09-25 (`release` = `e05a78d`, backend `@60`); the rest
      waits on numbers.**
      Pp: "login เริ่มช้า … จะทำยังไงให้เร็วขึ้น lean ขึ้นได้". The diagnosis and what was built are in
      `CHANGELOG.md` § Session 2026-09-24 (11). In short: the first sync now rides in the login reply,
      a request opens the Sheet once, login fills the staff cache, the ward sync drops superseded
      rows, a temp-password account syncs as soon as it changes its password, and both ends measure.
      Pinned by `test/verify-login-speed-0924.cjs`.

      **To close:**
      1. ✅ Deploy both halves. The frontend went out in release PR #120 (2026-09-24, 23:58 ICT), and
         the backend as `@60` (2026-09-25, 12:11:30 ICT; comments on #120 and #119).
      2. Read the numbers: the admin dashboard's "Sign-in on this device" line, and the
         `{"timing":…}` lines under Apps Script ▸ Executions. Decide from those which of the items
         below is worth its risk.

      **Not built, each needs a decision** (the 2026-09-24 diagnosis, ranked):
      - **calcInput on demand.** It is about 55% of every synced row. Fetch it when an order is opened
        for edit or print. Clinical: an old order can no longer be reprinted offline. PDPA: less data
        on each device. Needs `clasp` + frontend.
      - **Sync only the last N days per infant**, and the full history when one is opened. This stops
        the growth, but the trend graph, alerts and census need clinical review first.
      - **At most one `readRegistry` audit row per user per N minutes.** It must keep M1 (distinct
        users per week). The DPO decides, because Audit_Log is the PDPA s.39 record.
      - **Take the password-attempt counter off the global script lock**, so a sign-in stops queuing
        up to 5 s behind order saves at shift change. Needs a security review of SEC-B5.
      - **Do not lower the 3,000 hash rounds.** A PBKDF2 "v3", rehashed at each account's next login,
        could be stronger at the same speed. Needs a security review.
      - **Minify and defer `calculator.js`.** This only affects the page load before the login screen.
        Long-term caching needs hashed file names, because the hosts ignore `?v=`.

- [ ] 🩺⚖️ **product · UX roadmap #4: the nursing I/O form + PDPA — ⚙️ BUILT 2026-09-24, SWITCHED
      OFF: `NURSING_LOG_ENABLED` waits for D7 (DPO sign-off).** Pp decided § 8 of `docs/NURSING_FORM_SPEC.md`
      the same day, and it was built to those answers (`CHANGELOG.md` § Session 2026-09-24 (5)):
      - daily totals only (D1);
      - an "I/O ประจำวัน" card + form on each infant's Dashboard;
      - the weight goes to the growth store;
      - the nurses' record is a one-tap offer on a new order's Intake/Output, and the weight is
        prefilled (D4);
      - nurses compute but no longer save or Submit orders (D5).

      Pinned by `test/verify-nursing-backend.cjs` and `test/verify-nursing-frontend.cjs`.

      **To close:**
      1. Release the frontend and `clasp push` the backend, in either order. Both are inert while the
         switch is off, so they can ride any release.
      2. D7: the DPO signs off spec § 6 (and the 26(5)(a) citation below). Praew, 2026-10-08: the
         hospital's DPO role sits with IT; she is drafting the letter to IT.
      3. Set the Script Property `NURSING_LOG_ENABLED` = `true`. **Only after step 1's frontend is
         live**: an old frontend has no I/O card, and its nurses would be refused order saves with
         nowhere to record I/O. To switch it off, delete the property (it takes effect on the next
         sync).

      **Still open:**
      - D6: retention is indefinite for now, to settle with the DPO.

      D4 is settled (Pp: "หมอพิมพ์เอง"). The prescriber types Intake/Output, and the nurses' record is
      a one-tap offer. The weight is prefilled from `D.currentWeight` on or before the order's
      day, the nurses' morning weight included (`CHANGELOG.md` § 2026-09-24 (6), (8)).
- [ ] ⚖️ **PDPA · The lawful-basis citation reads "Sec 26(6)"; the Act's health-care exception is Sec
      26(5)(a)** (medical diagnosis, health care, medical treatment, under professional confidentiality).
      Found 2026-09-24 while reviewing the nursing form. **DPO to confirm** (it is part of the nursing
      form's D7), then correct all five at once: `gas-backend.gs` (the header's "PDPA lawful basis"
      line, and the note above `pseudonymizePatient`), `REFERENCE.md` § PDPA, `PRD.md`
      § 5, and `app-walkthrough.md` § 6. It is legal text, so it is not edited on an agent's reading
      alone.
- [ ] 🩺 **safety · Center Point owns the birth facts — CP repo (Praew's decision, 2026-09-24).** New
      patients will be registered in CP only and linked from there, so CP captures the date of birth, GA
      and birth weight at registration. CP stores none of them today and computes no DOL. Its calculator
      page asks for the birth date and computes DOL with NeoFeed's `D.dolAtDate`
      (`center-point/order-setup.mjs`, `CHANGELOG.md` 2026-09-24 (8)). Then:
      - NeoFeed's CP page fills the birth date from the link instead of asking.
      - CP carries NeoFeed's DOL rule (day of birth = DOL 1, Bangkok calendar dates), and a shared table
        of test dates keeps the two copies in step (like the `tpn-document` parity test).
      - CP's own screens show that DOL.
      - CP's server checks every `tpn.dol` against the birth date and the order date.
      Whether the birth date lives in the central database or the workstation vault is a PDPA question
      for that design. CP's browser test that types "DOL 3" (`test/browser/tpn-calculator.mjs`) changes
      with it.

- [ ] 🩺 **safety · A *persistent* low NPE:AA has nowhere to show, now that it no longer stops the
      order.** Condition attached to Praew's 2026-09-23 sign-off of the NPE:AA downgrade (PR #96;
      `CHANGELOG.md` § Session 2026-09-23 (b)). Only `crit` alerts are persisted — `calcInput.critOverride`
      stores titles, and only criticals reach the pharmacy form — so a sub-20 ratio is now visible in
      the amber tile while the order is being written and leaves no trace afterwards: not in the saved
      `Daily_Log` row, not on the printed form, not on the Alerts page tomorrow. That is the right
      trade for a *transient* ramp, which is precisely what the downgrade was for. It is the wrong
      trade for the same infant sitting below 20 for three or four consecutive days, which is a
      nutrition question rather than an order-time interruption, and is the one case the downgrade
      gives up the ability to see. Wanted: a trend signal on the Alerts page computed from the saved
      rows — the infant has been below 20 kcal/g AA on N consecutive days — not a second order-time
      alert, and not a return of the stop. `D.girStatus` is the shape to copy: grade it once, in
      `data.js`, so the order screen and the Alerts page cannot drift apart again the way GIR did.
- [ ] 🎨 **ui · At 280px the calculator's `.two-col` rows are clipped, not scrolled.** ~20px wider than
      the accordion body's `overflow: hidden` allows, so the content is cut rather than draggable. The
      Galaxy Z Fold's cover screen is the only device this narrow — below every current iPhone (320) and
      effectively every Android (360) — so it is logged, not chased. Found while measuring for
      `verify-mobile-fit.cjs` (2026-09-22 (2)), which passes at 280px precisely because nothing scrolls.
- [ ] 🎨 **ui · The login screen has no palette of its own yet.** Praew, 2026-09-22: *"เดี๋ยวไปหา
      palette สีที่เหมาะสมมาก่อน"*. It shares the app's ground, with the 2026-09-23 logo as its hero
      (whose colours are its own literals). The mechanism for holding it on a different palette is
      written down and was used once: re-declare, on `.login-wrap` itself, the tokens the screen
      consumes (today `--brand`, `--line`, `--ink-2`, `--ink-3`, plus `--bg` if the ground should
      differ) — custom properties inherit, so no `.login-*` rule has to name a literal. See
      `CHANGELOG.md` 2026-09-22 (2) § 4 and 2026-09-23 (h).
- [ ] 🩺 **safety · The 2026-09-23 review's clinically-important findings** (`CHANGELOG.md`
      2026-09-23). Each reproduced; none moves a compounded dose:
      - **The Alert centre and the calculator disagree about GIR** — `app.jsx:199-204` calls anything
        above 12 critical, `calculator.jsx:1459` makes 12–13 the yellow margin (Praew, 2026-09-22).
        The same four alert bodies interpolate the stored value unrounded ("GIR 7.206498951781971").
      - **Growth velocity** fires "critically low" during the expected postnatal nadir, and freezes
        past 42 wk PMA because `GrowthVelocity` and "latest measurement" read the clamped `points`
        (`fenton.jsx:206,421`) — the long-stay infants it matters most for.
      - **The trend graph draws the latest row's target band across the whole history**
        (`log.jsx:185,324-343`), so a day that was on target reads far below it.
      - **Quick calc wears the previously opened infant's identity strip** (`app.jsx:1818`), and its
        DOL box cannot be emptied — 14 → backspace → "1" → type 5 → **15** (`app.jsx:2096`).
      - **The NPE:AA < 20 hard stop fires on ordinary orders.** With AA 3 g/kg and lipid 2 it needs
        GIR ≥ 8.6 to clear; a fluid-restricted day-3 ELBW trips it and must be saved with a typed
        reason. **Team decision:** warning, or a lower critical floor, or DOL-aware.
      - **Server bounds refuse legitimate orders** (`gas-backend.gs:1677-1681`): weight < 300 g or
        > 8 kg (while DOL is allowed to 400 days), GIR > 20, and kcal exactly 200 (float, refused as
        `200.00000000000003`) — in raw English at the bedside.
      - **The reference panels contradict the calculator** on six figures (`app.jsx:2954,2965,3013,
        3034-3036,3054,3144`): lipid 2.0 kcal/mL vs 9 kcal/g, term fluid "DOL 5+", the ELBW/term Na
        rows, the ≥17–20 growth target vs the alert at 15, Peditrace's Zn, and the DOL-2 lipid band.
      - **`FENTON_LENGTH`'s 42-week row is ~3 cm high** (`data.js:912-933`): the 50th steps
        +1.05 cm/wk to 38, +1.45 to 42, then +0.38 — so a 49.9 cm term boy plots near the 8th
        percentile. Already unverified in `docs/CLINICAL_CONSTANTS.md`; say so on the chart until the
        LMS parameters arrive.
      - Smaller, batchable: "SCN 01" ≠ "SCN 1" in `normalizeBed`/`_normBed`; a measurement row cannot
        be cleared or deleted; with no admit date the logger caps DOL at the last stored one and
        overwrites it; the weight series is not sorted before plotting; a blank date in `LogDateModal`
        silently becomes today; a blank sex cell charts as a boy; the Dashboard GIR band is 8–10 while
        the calculator's is 4–12; a MEN row switches regime differently on the trend; the strip prints a
        raw delta float; on a phone Formulas is unreachable. *(Closed 2026-09-24 by the UX roadmap: the
        info reminder no longer lights the Alerts badge, discharged sessions raise no alerts and the
        admin tile no longer counts them, and the Admin dashboard has a phone tab.)*
- [ ] 🧱 **infra · A harness that fixes `TODAY` at load can go red on a run across Bangkok midnight.**
      Release #120's post-merge run did, at 00:00:00.229 ICT on 2026-09-25: `verify-nursing-backend.cjs`
      built "two days ahead" from its load-time `TODAY`, while the backend refused against its own live
      tomorrow (`CHANGELOG.md` 2026-09-25 (1)). #121 fixes that one refusal with `withNow(Date.now(), …)`;
      this line is the class. Other harnesses also fix `TODAY` at load and were not swept. Start
      `Date.now()` just before midnight, run each of them at a few offsets, and pin any that fail the same
      way.
- [ ] 🧱 **infra · A hand-stubbed GAS harness can pass its "must reject" cases for the wrong reason.**
      `test/verify-input-validation.cjs:25` is `throws(name, fn)` — it asserts only that *something* was
      thrown, never what. It is the one harness left that stubs the GAS globals by hand (the other five
      backend harnesses use `test/gas-vm-sandbox.cjs`), so the moment the code under test touches a global
      that stub does not carry, every refusal assertion in it passes on a `ReferenceError` instead of on a
      validation refusal, and the "still saves" cases fail loudly enough to look like the only problem.
      Found on 2026-09-23 by the session working on PR #96, when `registerPatient` began calling `_fmtDate`
      and `Session` was undefined in that sandbox. **#96 closes the instance** (it adds `Session` and
      `Utilities.formatDate`); this line is the class. Two ways out, either is small: have `throws()` take
      the expected message pattern and fail a `ReferenceError` outright, or fold that harness onto
      `gas-vm-sandbox.cjs`, which does not have the problem.
- [ ] 🧱 **infra · A harness that runs nothing passes CI.** `.github/workflows/test.yml` grades each
      harness by exit code alone (`for f in test/verify-*.cjs; do node "$f"; done` under `set -e`), so a
      file that executes no assertion — emptied, corrupted, or with its body swallowed by a stray line
      comment — exits 0 and is counted green. Demonstrated by accident on 2026-09-23: a harness copied
      through a PowerShell pipeline lost every newline, which commented out everything after the first
      `//` on the resulting single line; it printed **nothing at all** and exited 0. Only the missing
      output gave it away, and nothing in the loop looks at output. The compiled pass already greps for
      `[compiled-loader] swapped in`, which covers module-mounting harnesses in that mode only. Close it
      the same way for both modes: every harness here ends with a summary line (`ALL PASS`, `N FAILED`,
      `CALC ORACLE:`, …), so require a recognisable summary token in each harness's stdout and fail the
      step when one is missing.
      **Blast radius, measured twice (this session and the PR #96 session, independently, same answer):
      with both PRs in, 54 harnesses — 30 carry the compiled-pass grep, 24 carry nothing in either pass.**
      The list is one command, and stays current as harnesses are added:
      `for f in test/verify-*.cjs; do grep -qE 'transformSync|review-0917-boot' "$f" || echo "$f"; done`.
      It is not a harmless 24: it holds `verify-kcmh-constants` and `verify-kcmh-factor`'s companion
      checks, `verify-provenance-stamp`, every `verify-review-0917-backend-*`, the auth and session
      harnesses (`verify-must-change-password`, `verify-login-endorsement`,
      `verify-gas-session-revocation`, `verify-chula-google-signin`, `verify-staff-cache-password-writes`)
      and `verify-input-validation` — the ones whose silence would be least noticed and cost the most.
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
      - **Center Point, since the 2026-09-28 TPN-team meeting (PR #129).** NeoFeed's changes list says "20%
        lipid"; CP's `tpn-document.mjs:116` still says "SMOF lipid". Rename it with the next packet version, in
        both copies, and re-pin the digest.
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
- [ ] ⚖️ **PDPA · An erasure leaves the date of birth recoverable — Praew / DPO.** `pseudonymizePatient`
      blanks the dob (G), but the clinical data it keeps gives it back. Every `Daily_Log` row has a date
      and a DOL (dob = date − (DOL − 1)). On a legacy record, so do the admission date and the first
      weight row's DOL: `test/verify-pdpa-erased-dob-backend.cjs` § 1 asserts that equality. Decide whether
      that is acceptable under the medical-necessity basis, or what else an erasure must change. Found on
      2026-09-24 while fixing the dob refill (#116); the only residual risk recorded before was the
      `sessionId`.
- [ ] 🧹 **chore · Stop publishing the six `.jsx` sources in the next release.** `.assetsignore` and
      `_config.yml` kept them for the release that introduced the build step only, so that a browser
      still holding the previous shell could finish loading. That release has been live since
      2026-09-18 (`STATUS.md`). Exclude them on both hosts in the same change that flips
      `test/verify-build-shells.cjs` 5.6, which today requires them to be published.

## 🕓 Later

- [ ] 🧱 **data · A date on every growth-chart row.** Rows in `weights`, `lengths` and `hcs` are keyed by
      DOL. Since 2026-09-24 an anchor correction moves them with it (`D.moveGrowthRows`); a stored date
      would make that unnecessary. It needs a migration of every record, and it must agree with PR #111's
      nurse form, which writes rows in the current `{dol, w}` shape.
- [ ] 🧱 **data · Existing outborn records keep the birth weight on the admission DOL.** New registrations
      file it on DOL 1 since 2026-09-24. Records registered before still plot their birth point at the
      admission PMA on the growth chart. A one-off correction is possible if Praew wants it.

- [ ] 🩺 **safety/governance · Decide who may create and Submit a TPN order.** `canWrite` includes
      nurses for `logDailyNutrition`/`publishLog`, and the Intake/Output card lives inside the
      Calculator, so a nurse recording urine output re-saves the whole order (2026-09-11 review P2).
      Proposed: a separate nursing-entry screen (weight, I/O per shift, feeds given) writing its own
      columns, then narrow order writes to prescribers. **Clinical workflow decision — Praew's.**
      ➡️ *2026-09-24: now designed as `docs/NURSING_FORM_SPEC.md` — see § Next, UX roadmap #4; this
      decision is its D5.* ➡️ *2026-09-24 (5): **decided and built.** Pp: "พยาบาลบันทึกหรือ submit
      ไม่ได้ ได้แค่ใช้ calculator". It goes live with the nursing form's switch (§ Next), not
      before.*
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
      GitHub admins and on the Cloudflare account; close/delete the stale branches and draft PR #56.
      The 2026-10-08 outside review adds two org settings: default repository permission is `admin`
      and 2FA is not required. The org has one member (Praew), so today the default reaches only her;
      set it to `read` and require 2FA before anyone else joins. **Not PR #57**
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
- **Accepted residual risk:** a `sessionId` issued before 2026-09-27 = `initials+BW+twinSuffix` is a
  **pseudonym, not anonymous**. Erasure cannot scrub that pattern from an already-issued sessionId
  without breaking every `Daily_Log` join. Documented and accepted, not fixed. Ids issued since are
  `NF-` and six random digits and carry nothing.
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
