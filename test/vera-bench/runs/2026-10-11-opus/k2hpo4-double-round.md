VERDICT: BLOCK
SCOPE: Dose, Printed order
FINDINGS:
1. 🔴 calculator.jsx:1400 — The K₂HPO₄ bag volume now rounds to 0.1 mL, and pharmacy draws the printed mL. K₂HPO₄ and MgSO₄ were kept at 0.01 mL on purpose, because 0.1 mL rounding of small volumes is still an open safety item waiting on pharmacy. Keep `r2(...)` here and take Pp's request back to her with the numbers below. Changing only the display to `f(…,1)` would print the same 0.1 mL, so that is not a fix.
   Evidence: `BACKLOG.md:267-269` "the same pharmacy check must cover how small volumes print … rounded to **0.1 mL** (K₂HPO₄ and MgSO₄ to 0.01)"; `test/verify-review-0917-calc.cjs:268-269` "r1/r2 stay untouched until pharmacy confirms the Na dose (Praew, 2026-09-17)"
   Fails when: 500 g, TPN 60 mL/day, dead space 0 (the harness's S5_elbw order), K₂HPO₄ 0.3 mEq/kg/d. The bag needs 0.15 mEq. The form prints "0.2 mEq = 0.1 mL", where it printed 0.15 mL before. Pharmacy draws 0.1 mL (0.1 mEq K, 1.55 mg P), so 0.2 mEq/kg/d reaches the infant, 33% short. The screen's K⁺/L and Ca:P still count 0.15 (calculator.jsx:1417, 1420). Below a 0.05 mEq bag (400 g, dead space 0, 0.1 mEq/kg) the mL becomes 0 and prints "—" on an order that has K₂HPO₄ ticked.
2. 🔴 calculator.jsx:1400 — `r1(r2(x))` rounds twice, so a value just under x.x5 rounds up past its nearest tenth. If one decimal is ever adopted, round once with `r1(x)`. Then print the mEq next to it from that same rounded mL, so a 1 mEq/mL line cannot contradict itself.
   Evidence: `k2hpo4:    k2hpo4 > 0 ? r1(r2(k2hpo4 * factor / S.k2hpo4.kMeqPerMl)) : 0, // K₂HPO₄, one decimal like the rest`
   Fails when: 447 g, dead space 0 (Factor 0.447), K₂HPO₄ 1 mEq/kg/d. The bag needs 0.447 mEq: r2 gives 0.45, then r1 gives 0.5 mL, but the nearest tenth is 0.4. The mEq cell (calculator.jsx:3958, `displayNum`) prints 0.4, so the pharmacy line reads "0.4 mEq = 0.5 mL" on a 1 mEq/mL stock. The same happens for bags of 0.246–0.249, 0.445–0.449 and 1.046–1.049 mEq, among others.
3. 🟠 data.js:34 — The diff moves printed figures (K₂HPO₄ mL, Components, WFI) but changes nothing else. `CONSTANTS_VERSION` stays the same, and there is no `CHANGELOG.md` entry, no register row and no harness. Because `calcMoved` (calculator.jsx:1835) checks the version, an order saved before this release reprints with a different K₂HPO₄ mL and no "save again" hold. Example: the harness's parity_dead order (1,234 g, 137 mL, dead space 6.3 mL, K₂HPO₄ 1.3) needs 1.678 mEq. It printed 1.68 mL and now prints 1.7, so the §6 pinned digest (test/verify-review-0917-calc.cjs:303) should fail as written. Do all four steps of the change protocol and bump the version. Recapture §6 only with Pp's sign-off.
   Evidence: `docs/CLINICAL_CONSTANTS.md:58-59` "and, since 2026-09-18, when calculator logic can move a printed figure."
TESTS TO ADD:
- test/verify-review-0917-calc.cjs: 500 g, Volume 60, dead space 0, K₂HPO₄ 0.3 → the K₂HPO₄ row on the pharmacy sheet prints 0.15 mL. Fails today because r1 prints 0.1.
- test/verify-review-0917-calc.cjs: 447 g, dead space 0, K₂HPO₄ 1 → K₂HPO₄ mL is 0.45 (never 0.5), and the mEq and mL on that row agree. Fails today because r1(r2(0.447)) = 0.5 sits next to "0.4 mEq".
NOT REVIEWED:
- No harness was run. The §6 failure and every rounding above were worked out by hand from `toFixed` and `displayNum` (data.js:681-688).
- Whether pharmacy can measure 0.01 mL of K₂HPO₄ or only 0.1 mL is a question for Pp and pharmacy. That answer decides whether one decimal is ever acceptable.
- compiled/calculator.js was not compared with calculator.jsx. CI checks the build.
- Patient data and Access: the diff touches neither.
