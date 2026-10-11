VERDICT: NO BLOCK
SCOPE: Dose, Printed order, Patient data (log line), Access (log line in the staff-row cache only)
FINDINGS:
- none
TESTS TO ADD:
- none
NOT REVIEWED:
- compiled/calculator.js was not rebuilt. It still has the old lines: line 969 `const wfiVol = parseFloat((preparedVol - componentVol).toFixed(1));` and line 1219 ``body: `${fmt(calc.gir, 1)} — aim ${tGir[0]}–${tGir[1]}.` ``. CI's "Compiled output is a fresh build of the sources" step (.github/workflows/test.yml:49) will fail until the rebuild is committed, so this is left to CI. Checks done: the WFI change returns exactly the same value, because `r1` is defined in the same scope at calculator.jsx:1392 as `(n) => parseFloat(n.toFixed(1))`. The GIR unit is correct, because `gir = dexG * 1000 / (1440 * wtKg)` (calculator.jsx:1263) is in mg/kg/min. The front sheet carries no alert text (REFERENCE.md § The printed order). `e.name` is only the error class name and holds no patient field. `_getStaffRowCached` returns the same value as before. No constant moved, so the change protocol and `CONSTANTS_VERSION` do not apply.
