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

- [ ] 🚀 **deploy · Ship the 2026-09-17 review** (`CHANGELOG.md` 2026-09-17; findings list outside the
      repo in `NeoFeed/NEOFEED_REVIEW_2026-09-17.md` § 6). **Backend first** — the new backend is
      proven compatible with the live client (19/19 in real Chromium).
      1. ✅ **Backend done 2026-09-18 — `@55` live at 08:42 ICT** (`STATUS.md`, "How the 2026-09-18
         backend deploy was verified"). The `sheetHealthReport()` gate caught real drift: row 1 of
         `Patient_Registry` said `weights(JSON)`/`lengths(JSON)`/`hcs(JSON)`, which the column guard
         would have refused on every registry write. Relabelled by Praew before the switch.
      2. `main` → `release` PR (approver `tasamew`); curl both hosts and check each served
         `compiled/*.js` hashes to its `?v=`.
      ⚠️ Deploy-gated on both halves — **Praew's go-ahead, not an agent's.**
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
      account first. Steps are in the comment above the flag.

- [ ] 🩺🔒 **safety · Exercise the live stack (`@55` + `?v=sync-poll-0916`) in one bedside session.**
      ✅ *2026-09-18:* a real login and a real save on `@55` (Praew), right after the switch; the
      rest of this list is still open.
      Everything shipped 2026-09-12 and 2026-09-15 is verified as *deployed*, none of it as *used*.
      One session closes the lot:
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
      - *(2026-09-17, once the review ships)* leave a workstation untouched 30 min → it must log out
        with the idle notice; correct a birth weight on an infant with a saved order → Print must
        refuse with the dosing-weight banner; enter a growth measurement on one device and edit the
        same infant's diagnosis on another that has not synced → the measurement must survive; an
        infant on full feeds must no longer demand a lipid/K override reason.

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
      - A feeds-only day with Soluvit/Peditrace ticked still prints their mL and a negative WFI line
        on the TPN form (pre-existing). Should a TPN form print at all with no TPN?
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
      - **When an older-children ward is added** (`bedWard`, `BED_OPTIONS`, then `OLDER_CHILD_WARDS`),
        Aminoplasmal 15% becomes selectable there. Its label's line is **2 years**, not a ward, so an age
        check may be wanted then. Center Point needs a packet version with a product slot before it
        can offer it.
- [ ] ⚖️ **PDPA · Three questions from the 2026-09-17 security review — Praew / DPO.** Should a
      registry read still be served when its `Audit_Log` row cannot be written (today: yes, fails
      open)? Should Staff column H keep plaintext temp passwords? Should a session that *expires*
      (not an explicit logout) also clear calculator prefill and alert acknowledgements?

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
      required check on `release`, and secret scanning is on — both done 2026-09-11); decide whether `tasamew` stays admin (and
      is the `release` approver — see `REFERENCE.md`); confirm 2FA on both GitHub admins and on the
      Cloudflare account; close/delete the stale branches and draft PR #56. **Not PR #57**
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
