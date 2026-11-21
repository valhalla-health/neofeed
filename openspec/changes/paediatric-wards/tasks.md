# Tasks: paediatric wards

Groups 1–3 move no NICU or SCN figure and can start now. Groups 4–6 wait for the gates in § 0.
Each group is one PR with its own `CHANGELOG.md` entry, `STATUS.md` line, Vera report where the
diff touches a dose file, auth or patient data, and the newborn no-move result (design D8).

## 0. Gates (Pp and the ward; not code)

- [ ] 0.1 P1: Pp names the สก. wards, each ward's bed labels and sticker label, and the first ward to
      open. Done when the list is written in `design.md` § Decisions Pp still owns.
- [ ] 0.2 P5: a rule owner for the paediatric set and a TPN pharmacist for products are named in
      Pp's product notes (not in this repo).
- [ ] 0.3 P2, P3 and P7: the age line, the fixed-at-admission rule, corrected or chronological age,
      dosing weight, growth reference, and what replaces birth weight are decided and written into
      `design.md` D3 and D6.
- [ ] 0.4 `guideline-values.md` (in this folder) is read against its sources by an agent that had
      not seen the work; every row is marked confirmed, corrected or unreadable.
- [ ] 0.5 The rule owner answers each parameter of the readiness list in
      `specs/paediatric-pn-guards` from `guideline-values.md`; the answers become draft `CR-P-`
      blocks. Done when the rule owner and Pp have signed each block.
- [ ] 0.5b P8: Pp and the rule owner decide the PN contexts (long-term PN, intestinal failure or SBS,
      IFALD) and the guards each switches, from `guideline-values-if.md` after its second read.
      Done when each context's rules are signed `CR-P-` blocks, or P8 says "none in this phase".
- [ ] 0.6 The TPN room confirms it compounds for the first ward from the same worksheet, stocks and
      label size, gives the ward's dead-space value, and names the feeds the ward orders.
- [ ] 0.7 DPO answer in writing on the new ward's data and ward-scoped access; the IT Change Request
      covers the new wards. P4 and P6 decided.

## 1. Ward table (no ward added)

- [ ] 1.1 Write `test/verify-ward-table.cjs` first: the table yields today's `BED_OPTIONS` in order
      and today's `bedWard`, `wardGroup`, `normalizeBed`, next-free-bed and sticker-label answers for
      every bed; a fixture ward of three beds appears in the picker, gate, transfer dialog, "TPN
      ทั้งหอ", census and usage report. Red against `main`.
- [ ] 1.2 Add `WARDS` to `data.js` and derive from it every frontend place design § Context lists
      (`data.js`, `registry.jsx` incl. the transfer dialog, default bed and ward-name ternaries,
      `app.jsx` census, the dead-space hint in `calculator.jsx`); rebuild `compiled/`. Verify 1.1
      passes and `node tools/run_checks.js --level ci --phase sources` is green.
- [ ] 1.3 Generate the backend's and `tpn-room-core.js`'s copies from `data.js`; replace
      `PHARMACY_WARD_BED`, `_normBed`'s pattern, `USAGE_WARDS`, `_usageWardGroup`, `QI_SUBMIT_WARDS`,
      `_qiWardAt`, `WARD_BED`, `WARD_GROUPS`, the sticker label and the bed sort; add the digest check
      to `tools/checks.json` as blocking. Verify by editing one copy and seeing the check fail, and
      that `grep -nE "NICU|SCN" ` over the seven files leaves only the table, comments and UI text
      listed in the PR.
- [ ] 1.4 Newborn no-move: `tools/calc-compare.cjs` against `main` shows zero differences, and a new
      `test/verify-newborn-unmoved-wards.cjs` compares the ward page, bed picker, transfer dialog,
      "TPN ทั้งหอ", census, usage report, sticker and TPN room page for NICU, SCN and ทดสอบระบบ.
      Seen on dev local.
- [ ] 1.5 `REFERENCE.md` gets "Adding a ward" (the table row, the generated copies, the checks).
      Verify the steps by adding and removing the fixture ward as written.

## 2. Ward-scoped access

- [ ] 2.1 Write `test/verify-ward-scope.cjs` first from `specs/ward-scoped-access`: the sync, the
      sign-in sync, the registration duplicate reply, the bed-conflict reply, the order lock, the
      conflict replies of `updateDailyNutrition` and `publishLog`, every write that names a patient,
      two wards syncing in turn, a parked patient, a bed in no ward, a failed registry read, the
      no-ward account, admin and pharmacy. Red against `main`.
- [ ] 2.2 Backend: the `wards` column read by header; the patient's ward from bed or last bed; the
      scope check on every path in 2.1, failing closed; the sync cache keyed by ward set; audit rows
      with no patient identifier. Verify 2.1 passes.
- [ ] 2.3 Backend: an admin-only action that sets an account's wards, audited, and an editor-run
      migration that fills existing doctor and nurse accounts with NICU and SCN and lists patients
      with no ward. Verify the action's cases in 2.1 and that the migration is idempotent in the
      sandbox.
- [ ] 2.4 Frontend: the ward page shows the caller's wards and the no-ward message; the admin page
      sets wards; the "found in another ward" search and the patient switcher follow P4. Verify on
      dev local with one account per case.
- [ ] 2.5 Vera on the diff (auth boundary and patient data); `REFERENCE.md` § PDPA, § Backend (the
      order: migration, check, then `clasp update-deployment`) and `PRD.md` § 5 say access is by
      ward. Verify her report is in the PR.
- [ ] 2.6 Newborn no-move as in 1.4, and existing accounts on dev local see the same patients before
      and after the migration.

## 3. Rule-set selection, newborn branch only

- [ ] 3.1 Add cases to `test/verify-clinical-rules.cjs` and a new `test/verify-rule-set.cjs`: the
      rule set is "newborn" for every record the backend accepts today whatever the bed, with or
      without a date of birth; a new registration with a date of birth after admission is refused;
      a stored set that differs is refused; a stale tab that sends no set is treated as newborn.
      Red against `main`.
- [ ] 3.2 Add `ruleSetFor` and route `isNewbornUnit`, `aaProductsFor` and the target-table lookups
      through it; remove `OLDER_CHILD_WARDS`; `defaultDeadVolFor` reads the ward table. Verify 3.1
      passes.
- [ ] 3.3 Backend stores the rule set on the registry record, derives it from date of birth and
      admission date, refuses a mismatch, and requires a credible date of birth on new
      registrations. Verify with the sandbox cases in 3.1, including an existing record with no date
      of birth that still saves.
- [ ] 3.4 Update `CR-U-DEAD-SPACE` (by ward table) and the amino-acid product note (by rule set and
      label age) in the clinical-rules skill, in the same commit as 3.2. `CONSTANTS_VERSION` does not
      move; verify with `calc-compare` at zero differences, `test/verify-calc-sum.cjs` green, and a
      no-move case on the saved-order key and an I/O-only revision.
- [ ] 3.5 Vera on the diff; newborn no-move as in 1.4 plus Quick calc, a reopened order, a revised
      order and the Center Point entry.

## 4. The paediatric rule set (dev local and a fixture ward only)

- [ ] 4.1 Per-set versions through every reader in design D4 (`calcMoved`, Submit minimum, stale-tab
      check, `printJson`, the TPN room page, `tools/build.mjs`), and `docs/CLINICAL_CONSTANTS.md`
      "When to bump" per set. Verify with a case where a paediatric bump leaves a NICU order
      reprintable and unwarned on the TPN room page.
- [ ] 4.2 Registration and input ranges for the paediatric set (no GA or BW; signed ranges; the P7
      replacement in the duplicate check and on the TPN room page), on the form and the server.
      Verify with `verify-rule-set` cases at each range edge.
- [ ] 4.3 Dosing weight, age in years and months, and newborn-only fields and flags hidden (design
      D6). Verify on dev local and by harness on the printed order, the sticker and "TPN ทั้งหอ".
- [ ] 4.4 `PAED_*` tables and their grading, one signed `CR-P-` block at a time, each with its cases
      in `verify-clinical-rules` and its figure in `verify-calc-sum`'s on-screen check. An unsigned
      parameter shows "ยังไม่มีเกณฑ์". Verify the check that fails on a value with no block.
- [ ] 4.4b PN contexts from gate 0.5b: the context on the order form, stored and printed; each
      context's guards with cases in `verify-clinical-rules` showing the guard with and without the
      context, and that no context loosens a stop. Skipped if P8 says "none in this phase".
- [ ] 4.5 Products by label age (Aminoplasmal, trace elements, vitamins) and the feeds list, from
      gates 0.5 and 0.6. Verify with cases either side of each age line.
- [ ] 4.6 Printed order, sticker and TPN room page carry the ward and the paediatric age. Verify with
      the sticker and print harnesses and one printed sheet from dev local.
- [ ] 4.7 Quick calc asks the age group; the Center Point entry refuses outside the newborn set.
      Verify by harness.
- [ ] 4.8 The readiness check from `specs/paediatric-pn-guards`. Verify it fails with one parameter
      removed.
- [ ] 4.9 Vera; the rule owner reads the figures on dev local for the agreed synthetic children;
      newborn no-move as in 1.4, with a long-stay infant past the age line. Pp approves before merge.

## 5. The first paediatric ward's row (released together with group 4)

- [ ] 5.1 Add the ward's row from gate 0.1; regenerate the copies. Verify `verify-ward-table` and
      `verify-ward-scope` pass with the real ward, and no clinician account holds it yet.
- [ ] 5.2 The ward's tile, "TPN ทั้งหอ" tab, census row and sticker render on dev local at desktop
      and phone width with made-up children on the paediatric set; screenshots go in the PR.
- [ ] 5.3 Newborn no-move as in 1.4. The release PR carries groups 4 and 5 together, with the
      rollback target and before-and-after figures.

## 6. Opening the ward

- [ ] 6.1 Paper-beside-app trial if P6 says so: the TPN room compares both sheets; differences are
      listed in the release PR's comments with their explanation.
- [ ] 6.2 An admin gives the ward's staff their ward. Verify with `node tools/verify-release.mjs` and
      a made-up child on the ward's own device.

## 7. PN contexts for the newborn set (its own PR; Pp's decision of 2026-11-21)

- [ ] 7.1 Write the two contexts as `CR-` blocks from design D7 (Pp's decisions and wording of
      2026-11-21): cholestasis on the Liver Dysfunction tick with Peditrace or Addamel N on the
      order; the sodium and zinc advice on the indication "Short bowel syndrome". Each names its
      source, and the SBS block cites only rows of `guideline-values-if.md` that passed their second
      read. Done when Pp has signed both blocks.
- [ ] 7.2 Write the cases first in `test/verify-clinical-rules.cjs`: each message with and without its
      context, with and without Peditrace or Addamel N, an indication typed as free text switching
      nothing, and every figure, colour and alert identical with and without the context. Red against
      `main`.
- [ ] 7.3 The two messages on the order form, on screen only, with the contexts saved on the
      order; frontend only, no Sheet column, no backend change, nothing new on the printed order.
      Verify 7.2 passes, `test/verify-calc-sum.cjs` is green, the print harness shows the printed
      order unchanged, and `calc-compare` shows zero differences with and without each context.
      `CONSTANTS_VERSION` does not move.
- [ ] 7.4 Vera; the register and `CHANGELOG.md`; dev local with a made-up infant in NICU and in SCN,
      with and without each context. Pp approves before merge and before release.

## Workflow follow-up

- Archive this change once the first ward is open, so the four specs land in `openspec/specs/`.
- A second paediatric ward starts at gate 0.1 again, after the lock measurement in design § Risks.
