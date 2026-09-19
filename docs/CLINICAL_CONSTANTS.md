# NeoFeed — clinical constants register

**What this file is for.** `data.js` holds numbers that become compounding instructions. Until
2026-08-26 nothing recorded where each one came from, who checked it, or when it should be looked at
again — the only trace of the difference between a verified constant and an unverified one was a
line in `CHANGELOG.md`. This is the datasheet for that dataset.

**Update trigger: whenever `CONSTANTS_VERSION` in `data.js` is bumped.** The version string is the
key; this file is what the key points at. A bump with no row here is a bug in the process.

> ⚠️ **Seeded 2026-08-26 from the repo's own documentation.** Unless a later version-history row or
> constants-table row names a fresh review, a "verified" claim is carried over from `CHANGELOG.md` /
> `CLAUDE.md`. Review dates are **proposed, not agreed** — they are Praew's to set or reject.

---

## Version history

| `CONSTANTS_VERSION` | Date | What changed |
|---|---|---|
| `2026-09-18.1` | 2026-09-18 | **No existing value changed; one new default moves every new order's bag.** Added `NEWBORN_DEAD_VOL_ML` = 30 mL: a new TPN order on NICU/SCN starts with 30 mL dead space, so pharmacy prepares delivered + 30 and every additive's bag amount grows by the Factor (delivered per-kg doses unchanged) — Praew. Added `KCMH_STOCK.aminoplasmal15` (0.15 g/mL), which **no ward is offered today**: its label contraindicates it under 2 years, and `aaProductsFor` allows it only on a ward in `OLDER_CHILD_WARDS`, which is empty (Praew). Added `MEN_MAX_ML_KG` = 24 mL/kg/d, an alert threshold that moves no dose. Logic changes in the same release: a MEN feed no longer counts toward the printed totals, a day with no TPN prepares no bag, and Soluvit/Peditrace scale with the overfill (`CHANGELOG.md` 2026-09-18 (2), §5). |
| `2026-09-05.1` | 2026-09-05 | Re-checked `FENTON_WEIGHT` against a second official source (ucalgary.ca's v2 size-for-GA cutoff table, not the table used on 2026-08-10) and corrected GA 36–41 boys / GA 36,40,41 girls, which had drifted 8–51 g on p3/p10/p90/p97 from that revision. GA ≤35 and GA 42 already matched and were untouched; p50 (not in the v2 table) was untouched everywhere. See `CHANGELOG.md` 2026-09-05 for the full diff. |
| `2026-08-27.1` | 2026-08-27 | Corrected the growing-premature PN phosphorus target from 46–62 to **50–108 mg/kg/day** (1.6–3.5 mmol/kg/day), matching the published ESPGHAN/ESPEN/ESPR/CSPEN 2018 table. The old range could label a guideline-concordant phosphorus provision as excessive. |
| `2026-08-26.1` | 2026-08-26 | **Baseline.** No clinical value changed — this is the first version, stamped so that rows written from here on are attributable. Everything before it has a blank `Daily_Log` AF and cannot be attributed. |

---

## The constants

| Constant | Source | Verified | By | Next review | Status |
|---|---|---|---|---|---|
| `FENTON_WEIGHT` | Fenton 2025 (3rd-generation) LMS + percentile tables | **2026-08-10** — GA 22–42 stored every week (was 2-weekly + interpolated), 210 cells re-checked at 0 g discrepancy against that session's source. **Re-checked 2026-09-05** against a second, independent official source (ucalgary.ca v2 cutoff table) — GA 36–41 boys / 36,40,41 girls had drifted 8–51 g from that revision and are now corrected to match it exactly | Praew | on the next Fenton revision | 🟢 verified |
| `FENTON_LENGTH` | — | ❌ **never verified — no public numeric table exists to check against** (weight has one; length/HC only have graphical PDF charts) | — | **before it is trusted**; Praew has emailed tfenton@ucalgary.ca for the LMS parameters | 🔴 unverified · 4-week steps |
| `FENTON_HC` | — | ❌ **never verified — no public numeric table exists to check against** (weight has one; length/HC only have graphical PDF charts) | — | **before it is trusted**; Praew has emailed tfenton@ucalgary.ca for the LMS parameters | 🔴 unverified · 4-week steps |
| `FENTON_*` GA 44–50 rows | — | ❌ unverified | — | — | 🔴 **not plotted.** `GA_MAX` in `fenton.jsx` clamps the chart at 42 wk because the reference stops there. Do not widen the axis to "fix" the hidden-measurement banner — source real post-term data first |
| `KCMH_STOCK.naAcetate` (3 mEq/mL) | **Inferred from the KCMH worksheet's divisors** — not read off a strength label | ❌ **never** | — | **blocked on a physical check in the ward** | 🔴 **highest-stakes open item in the repo.** Changes the mL printed on every order form |
| `KCMH_STOCK.kCl` (2 mEq/mL) | Same — inferred from a divisor | ❌ **never** | — | **blocked on a physical check in the ward** | 🔴 same |
| `KCMH_STOCK` (remaining: d50w, aminoven10, caGluconate, heparin, …) | Official KCMH pharmacy worksheet, กลุ่มงานเภสัชกรรม ward 9B2/NICU | Pinned continuously by `test/verify-kcmh-constants.cjs` and `test/verify-kcmh-factor.cjs`, which hold an **independent transcription** of the worksheet's formula chain. One named departure since 2026-09-18 (Praew): Soluvit/Peditrace are × Factor, where the sheet's G43/G45 are × actual weight; the harness adds it as `vitExtra` | harness | on any worksheet revision | 🟢 machine-checked |
| `KCMH_STOCK.aminoplasmal15` (0.15 g/mL) | B. Braun Aminoplasmal 15%: 150 g amino acids/L, Na 5.3 mmol/L, 1290 mOsm/L (UK SmPC, emc 15186); **contraindicated in newborns, infants and toddlers < 2 years** (same SmPC; Singapore HSA SIN08352P) | **2026-09-18** — strength and contraindication read from the SmPC text; not checked against the KCMH shelf or the Thai label | Claude (source check); Praew decided the gating | on first use on a real ward, and before `OLDER_CHILD_WARDS` gets a ward | ⚪ **not orderable on any ward** — `aaProductsFor` offers it only on an older-children ward, and there is none |
| `NEWBORN_DEAD_VOL_ML` (30 mL/day) | Praew, 2026-09-18: "ใน SCN+NICU แก้เป็น +30 ml อัตโนมัติไปเลย" — the dead space the ward already picked by hand | 2026-09-18 — decided | Praew | when the giving set changes | 🟢 decided · **moves printed bag amounts** (not delivered doses) on every new NICU/SCN TPN order; a starting value the order can change |
| `MEN_MAX_ML_KG` (24 mL/kg/d) | The app's own Feeding Advancement card, "MEF (trophic) 12–24 mL/kg/day" | 2026-09-18 — Praew chose "warn above 24" | Praew | with the next feeding-guideline revision | 🟢 decided · alert threshold only, moves no dose |
| `TPN_TARGETS` | ESPGHAN/ESPEN/ESPR/CSPEN 2018 (Clin Nutr 2018) | **2026-08-27** — amino-acid, electrolyte/mineral ranges reviewed; growing-premature P corrected to 50–108 mg/kg/day. This is a code/source review, not local formulary approval | Codex clinical safety review | **2027-08-27 or next guideline revision** | 🟡 source-checked; local governance pending |
| `ENTERAL_TARGETS` | ESPGHAN Committee on Nutrition 2022 (JPGN 2022) · WHO 2023 Preterm Feeding Guidelines | Not independently re-checked since first entry | — | **propose annually** | 🟡 sourced, unreviewed |
| `EN_DB` (feed/formula composition) | Chula Handbook §3 per-100 mL table; BOX 1.3.1 for term mature milk. Corrected 2026-05-28 | Partially — several entries carry an inline *"verify with actual product label at KCMH"* | — | **on any product change** | 🟡 mixed. Product labels change without notice |
| `MAX_DEXTROSE_G_KG`, `MAX_K_MEQ_PER_L` | The KCMH sheet's own hard safety ceilings | — | — | on worksheet revision | 🟡 |

---

## When to bump `CONSTANTS_VERSION`

**Bump** when a change here can move a printed dose: `KCMH_STOCK`, `MAX_DEXTROSE_G_KG`,
`MAX_K_MEQ_PER_L`, `TPN_TARGETS`, `ENTERAL_TARGETS`, `EN_DB`, `FENTON_*` — **and, since 2026-09-18,
when calculator logic can move a printed figure.** Every save stamps the version into `calcInput`, and a
saved order stamped with another version prints only after it is saved again (`calculator.jsx`,
`calcMoved`). A bump therefore also asks the ward to re-save any old order before reprinting it. Rows
saved on the first `2026-09-18.1` frontend (live 11:17 ICT on 2026-09-18, before the stamp shipped) are
dated by their `calcInput.aaProduct` key (`savedCalcVersionOf`).

One exception, the one `calcMoved` makes for older rows: a figure printed for a day with **no TPN
volume**, where there is no bag to compound. The fix that zeroed a feeds-only day's vitamin lines
therefore kept `2026-09-18.1`.

**Do not bump** for comments, labels, UI copy, or anything in `data.js` that is a helper rather than
a value — `liveDol`, the GA/PMA helpers, `normalizeBed`, `syncFreshness`. Those are covered by
`APP_VERSION`.

Format `YYYY-MM-DD` or `YYYY-MM-DD.N`. `test/verify-provenance-stamp.cjs` enforces the format and
rejects a leading `=`, `+`, `-` or `@`, which a spreadsheet would read as a formula.

## The change protocol this register is half of

A number that reaches a printed dose should not change without all four:

1. **Source citation** in the commit message — which edition, which page, which table.
2. **A harness that fails against the old value and passes against the new.** Already this repo's
   convention (`TDD.md`).
3. **A second clinician's sign-off**, recorded in the `CHANGELOG.md` entry. 🔴 This is the step
   NeoFeed cannot currently satisfy — `AI_SDLC.md` §7 states plainly that no change to a printed
   dose has ever had a second clinical reviewer.
4. **This file updated in the same commit**, with the version bumped. Same rule as `STATUS.md`.
