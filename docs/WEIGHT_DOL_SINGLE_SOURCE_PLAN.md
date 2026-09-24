# One source for weight and DOL — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Every screen shows an infant's weight and day of life from one function each, and NeoFeed's
Center Point calculator page computes DOL with the same function instead of taking it typed.

**Architecture:** Read-time resolvers in `data.js` (`currentWeight`, `entryDol`, `admissionDol`,
`anchorShiftDays` / `moveGrowthRows`); every caller passes the patient's Daily_Log. No stored field is
added and the backend is untouched. One new harness walks a single fixture infant through every screen
on the real `<App/>` (`test/review-0917-boot.cjs`) and fails wherever a screen disagrees.

**Tech stack:** React 18 JSX, precompiled by `tools/build.mjs` (esbuild) into committed `compiled/`;
jsdom harnesses in `test/verify-*.cjs`; Center Point's page bundled by `center-point/build.mjs`.

**Spec:** `docs/WEIGHT_DOL_SINGLE_SOURCE_SPEC.md`

## Global constraints

- DOL of a date = `(date − dob) + 1` in Asia/Bangkok calendar dates (day of birth = DOL 1).
- Current weight = latest of `weightSeries` (measurements + submitted orders, drafts excluded, measured
  wins on the same DOL), bounded by `asOfDol` when given.
- Frontend only: no `gas-backend.gs` change, no `clasp`, `CONSTANTS_VERSION` stays `2026-09-18.1`.
- Edit `.jsx` sources, then `node tools/build.mjs`; commit sources and `compiled/` together.
- Harness source checks must normalise CRLF (this checkout has `core.autocrlf=true`).
- Ward-facing text stays in the language it is in today (Thai banners stay Thai).

## Files

| File | Change |
|---|---|
| `data.js` | add `currentWeight`, `hasDolAnchor`, `admissionDol`, `anchorShiftDays`, `moveGrowthRows`; `entryDol` gate; `ioDivisorG(…, entries)`; remove `lastWeighed`, `weightAtOrBeforeDol` |
| `app.jsx` | `PatientStrip` without `liveWeight`; drop `calcWeights`; stale-weight alert; delete toast; `CalculatorView` order date, chip, `entries` + `onOrderDate` to `<Calculator>` |
| `calculator.jsx` | `entries` / `onOrderDate` props; prefill + hint via `currentWeight`; banners via `entryDol`; I/O divisor with entries; no `onWeightChange` |
| `registry.jsx` | `currentWeight`; tooltip `entryDol`; birth row at DOL 1; Edit modal seeds from `admissionDol`, moves growth rows, refuses a conflicting move |
| `log.jsx` | "Day admit" and Trend x-axis from `admissionDol`; Trend Weight from `weightSeries` |
| `fenton.jsx` | logger prefill/cap = today's DOL (null-safe); "Latest" names an order-sourced weight |
| `center-point/order-setup.mjs` (new), `calculator-page.jsx`, `calculator.html` | birth date in, `D.dolAtDate` out |
| `test/verify-single-source-weight-dol.cjs` (new) | the cross-screen harness |
| `test/verify-tpn-calc-weight.cjs`, `verify-safety-fixes-0923.cjs`, `verify-error-boundary.cjs` | follow the API change, same invariants |
| `CHANGELOG.md`, `BACKLOG.md`, `test/README.md` | record it |

---

### Task 1: The resolvers in `data.js`

**Files:** Modify `data.js` (helpers near `lastWeighed` / `dolAtDate` / `ioDivisorG`, and the
`window.NEOFEED_DATA` export block). Test: `test/verify-single-source-weight-dol.cjs` §1.

**Produces:**
- `currentWeight(patient, entries, asOfDol?) → { dol, w, src, ts? } | null`
- `hasDolAnchor(patient) → boolean`
- `admissionDol(patient) → number`
- `anchorShiftDays(before, after) → number`
- `moveGrowthRows(rows, shift, admitDolBefore, admitDolAfter) → { rows, conflict: null | { dol, to } }`
- `ioDivisorG(patient, dol, todayWeightG, entries) → { g, source }`
- `entryDol` re-derives whenever `hasDolAnchor(patient)`

- [ ] **Step 1: Write the harness skeleton and §1 (pure `data.js`).** Scenario runner from
  `review-0917-boot.cjs`; §1 loads `data.js` alone in a vm and asserts, for the fixture:
  `currentWeight` = measured DOL 20 1,600 g (tie with the DOL-20 order at 1,610 g; draft 1,700 g
  ignored); `currentWeight(…, 17)` = order DOL 16 1,520 g; `entryDol` of a row with a stale stored `dol`
  on a record with a dob and **no** admission date = the date-derived DOL; `admissionDol` = 6 while
  `weights[0]` is a DOL-1 birth row; `anchorShiftDays` for an admission date moved 2 days earlier = +2;
  `moveGrowthRows` keeps the birth row, sends the old-admission-DOL row to the new admission DOL, moves
  the rest by the shift, and reports `{ dol, to }` for a row pushed onto DOL ≤ 1 or onto another row;
  `ioDivisorG` with an order-only yesterday = `{ g: 1610, source: 'prevDay' }`.
- [ ] **Step 2: Run it; expect §1 to fail** (`currentWeight is not a function` etc.):
  `node test/verify-single-source-weight-dol.cjs`
- [ ] **Step 3: Implement** in `data.js`:

```js
function _dobCredible(patient) {
  return !!(patient?.dob
    && !admissionDateIssue(patient.dob)
    && (!patient.admissionDate || normalizeDateStr(patient.dob) <= normalizeDateStr(patient.admissionDate)));
}
function hasDolAnchor(patient) {
  return _dobCredible(patient) || !!(patient?.admissionDate && !admissionDateIssue(patient.admissionDate));
}
function currentWeight(patient, entries, asOfDol) {
  const series = weightSeries(patient, entries || []);
  for (let i = series.length - 1; i >= 0; i--) {
    if (asOfDol == null || series[i].dol <= asOfDol) return series[i];
  }
  return null;
}
function admissionDol(patient) {
  const adm = normalizeDateStr(patient?.admissionDate);
  if (adm && !admissionDateIssue(adm)) return dolAtDate(patient, adm);
  return Number(patient?.weights?.[0]?.dol) || 1;
}
function anchorShiftDays(before, after) {
  if (!hasDolAnchor(before) || !hasDolAnchor(after)) return 0;
  const ref = todayLocal();
  return dolAtDate(after, ref) - dolAtDate(before, ref);
}
function moveGrowthRows(rows, shift, admitDolBefore, admitDolAfter) {
  const list = Array.isArray(rows) ? rows : [];
  if (!shift && admitDolBefore === admitDolAfter) return { rows: list, conflict: null };
  const out = list.map(r => {
    if (!r || typeof r !== "object") return r;
    const dol = Number(r.dol);
    if (!isFinite(dol) || dol <= 1) return r;
    if (admitDolBefore > 1 && dol === admitDolBefore) return { ...r, dol: admitDolAfter };
    return { ...r, dol: dol + shift };
  });
  for (let i = 0; i < out.length; i++) {
    const was = Number(list[i]?.dol), now = Number(out[i]?.dol);
    if (was > 1 && now <= 1) return { rows: list, conflict: { dol: was, to: now } };
    for (let j = i + 1; j < out.length; j++) {
      if (now === Number(out[j]?.dol) && was !== Number(list[j]?.dol)) return { rows: list, conflict: { dol: was, to: now } };
    }
  }
  return { rows: out.slice().sort((a, b) => (Number(a?.dol) || 0) - (Number(b?.dol) || 0)), conflict: null };
}
```

  `dolAtDate` uses `_dobCredible(patient)` in place of its inline test; `entryDol` becomes
  `if (ts && hasDolAnchor(patient)) return dolAtDate(patient, ts); return entry.dol || 1;`; `ioDivisorG`
  takes `entries` and reads `currentWeight(patient, entries, (dol || 1) - 1)?.w`. Export the new names.
- [ ] **Step 4: Run §1; expect PASS.** Also `node test/verify-bed-dol-io.cjs` and
  `node test/verify-safety-fixes-0923.cjs` still pass (the old helpers still exist until Task 7).
- [ ] **Step 5: Commit** `data.js` and the harness.

### Task 2: Patient strip, alerts, delete toast — no typed weight leaks out of the Calculator

**Files:** `app.jsx` (`PatientStrip`, `computeAlerts`, `calcWeights`, `handleDeleteEntry`,
`CalculatorView` props), `calculator.jsx` (`onWeightChange` effect and `skipWeightPropagateRef`).
Test: harness scenario `strip`; `test/verify-tpn-calc-weight.cjs` §1.

- [ ] **Step 1: Failing scenario `strip`.** Boot the App with the fixture, open the infant, read the
  strip: Current weight 1,600 g, DOL 21. Open Calc → New log → วันนี้, type 1,650 into Current weight,
  then return to Dashboard: the strip still reads 1,600 g (on `main` it reads 1,650).
- [ ] **Step 2: Run; expect FAIL** at "strip keeps the recorded weight while a weight is typed".
- [ ] **Step 3: Implement.** `PatientStrip({ patient, entries, onSwitch, currentDol, onEdit })` with
  `const last = D_A.currentWeight(patient, entries); const currentW = last?.w ?? patient.bw;
  const displayDol = currentDol;`. Delete `calcWeights` / `setCalcWeights` / `liveWeight` /
  `onWeightChange` and the unused `lastWt`. In `calculator.jsx` delete the propagation effect and
  `skipWeightPropagateRef` (and its `= true` in the baseline branch). `computeAlerts` uses
  `D_A.currentWeight(patient, entries)`. `handleDeleteEntry` toasts
  `ลบบันทึก DOL ${D_A.entryDol(active, entry)} แล้ว`.
- [ ] **Step 4: Update `verify-tpn-calc-weight.cjs` §1.** The propagation assertion becomes: the saved
  `weight` column is the entered 1,380 g (unchanged invariant), and `<Calculator>` has no
  `onWeightChange` prop to call (source check). Run it and the harness; expect PASS.
- [ ] **Step 5: Commit.**

### Task 3: The Calculator starts from the recorded weight and names the order's own day

**Files:** `calculator.jsx` (signature, prefill effect, source hint, banners, I/O divisor, `onOrderDate`
effect), `app.jsx` (`CalculatorView`). Test: harness scenarios `newOrder`, `backfill`, `edit`.

- [ ] **Step 1: Failing scenarios.**
  - `newOrder`: New log → วันนี้: Current weight box = 1,600 (the strip's figure; `main` gives the
    order's 1,610); its hint reads `= น้ำหนักที่ชั่ง (DOL 20)`.
  - `backfill`: New log → เลือกวันที่ย้อนหลัง → TODAY−4 (DOL 17): Current weight = 1,520 (`main` gives
    the later 1,600); chip reads `DOL 17 · <date>`.
  - `edit`: open the DOL-16 row (stored `dol` 14): banner reads `กำลังแก้ไขบันทึก DOL 16` (`main`: 14);
    chip `DOL 16 · <date>`.
  - I/O: a fixture without the DOL-20 measurement shows `divisor 1,610 g (previous day)`.
- [ ] **Step 2: Run; expect FAIL** on each.
- [ ] **Step 3: Implement.** `Calculator({ patient, entries, dol, …, onOrderDate, … })`;
  `React.useEffect(() => { onOrderDate?.(orderDateKey); }, [orderDateKey]);`;
  `const orderIsToday = !editEntry && !logDate && !orderDayRolledOver;` and
  `const recordedWeight = D.currentWeight(patient, entries, orderIsToday ? undefined : dol);` feeding the
  hint (`ที่ชั่ง` for measured, `ในคำสั่ง DOL n` for an order, else `ที่กรอกในใบสั่งนี้`), the baseline
  prefill (`startWeight = recorded ? recorded.w : baselineEntry.weight`, set as `curWtG`), and the
  no-baseline prefill (`recorded?.w ?? restored?.curWtG ?? restored?.wtG ?? patient.bw ?? 0`).
  `prefilledFrom.dol = D.entryDol(patient, baselineEntry)`; the restored banner shows its save date.
  Edit banner shows `dol`. `D.ioDivisorG(patient, dol, curWtG, entries)`. In `CalculatorView`:
  `orderDate` state from `onOrderDate`, `orderDateStr = editEntry ? normalizeDateStr(editEntry.ts) :
  (logDate || orderDate || today)`, `displayDol = editEntry ? entryDol(active, editEntry) :
  dolAtDate(active, orderDateStr)`, chip `DOL n` plus ` · <date>` when not today,
  `lockDate = orderDateStr`, and pass `entries={log[activeId] || []}`.
- [ ] **Step 4: Run the scenarios, `verify-tpn-calc-weight`, `verify-review-0917-drafts`,
  `verify-save-draft`, `verify-required-log-fields`, `verify-quick-calc`; expect PASS** (quick-calc's
  CRLF-only failure excepted, as on `main`).
- [ ] **Step 5: Commit.**

### Task 4: The Ward list and the two patient modals

**Files:** `registry.jsx`. Test: harness scenarios `ward`, `anchorShift`; existing
`verify-patient-ga-bw-edit.cjs`, `verify-review-fixes-0924.cjs`.

- [ ] **Step 1: Failing scenarios.**
  - `ward`: the NICU table row shows DOL 21, Wt now 1,600 g, and the badge title
    `บันทึกล่าสุด DOL 20` (`main`: the stored 18).
  - `anchorShift`: Edit session → admit date two days earlier → Save. The payload's `weights` keep the
    birth row at DOL 1 and the admission row at DOL 6, and move DOL 12 → 14 and DOL 20 → 22
    (`main` leaves them). A shift that pushes a row onto DOL ≤ 1 disables Save and names the row.
  - Register a new infant admitted on DOL 4: its first `weights` row is DOL 1 (`main`: 4).
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement.** `D_R.currentWeight(p, log[p.sessionId])` in card and table; both tooltips
  `บันทึกล่าสุด DOL ${D_R.entryDol(p, lastEntry)}`; `NewPatientModal` writes
  `weights: [{ dol: 1, w: bw, l: len || null, hc: hc || null }]`. In `EditPatientModal`:
  `initialDol1 = D_R.admissionDol(patient)`; a memo computing `shift = D_R.anchorShiftDays(patient,
  { ...patient, admissionDate: admitDate, dob })` and `moveGrowthRows` for `weights` (after the existing
  BW carry into `weights[0]`), `lengths` and `hcs` with `(initialDol1, Math.max(1, Number(dol1) || 1))`;
  a conflict renders a warn line and joins `canSave`; `save()` submits the moved arrays.
- [ ] **Step 4: Run the scenarios, `verify-patient-ga-bw-edit`, `verify-review-fixes-0924`,
  `verify-registry-logged-today`, `verify-bed-park`; expect PASS.**
- [ ] **Step 5: Commit.**

### Task 5: Dashboard and Growth

**Files:** `log.jsx` (`TrendGraph`, `DailyLog`), `fenton.jsx` (`MeasurementLogger`, the latest
readout). Test: harness scenarios `dashboard`, `growth`.

- [ ] **Step 1: Failing scenarios.**
  - `dashboard`: the table's Day admit for the DOL-16/18/20 rows reads 10/12/14 (`main`: 15/17/19 off
    the DOL-1 birth row); the Trend's Weight metric reads Latest 1,600 g (`main`: the order-only 1,610).
  - `growth`: Fenton's latest weight is 1,600 g and the logger's DOL box holds 21 even when a stored
    row carries a higher DOL.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement.** `admitDol = D_L.admissionDol(patient)` in both places. For
  `metricKey === "weight"`, build points from `D_L.weightSeries(patient, entries)` with
  `raw: <the order row on that date> || {}` and `band: null`, and show "growth chart" where a measured
  point has no date. In `MeasurementLogger`, `lastDol` = highest non-null row DOL and
  `maxDol = currentDol || lastDol`; the latest readout appends ` · จากใบสั่ง` for an order point.
- [ ] **Step 4: Run the scenarios, `verify-review-0917-shell`, `verify-review-0917-calc` (it mounts
  `DailyLog`), `verify-safety-fixes-0923`; expect PASS.**
- [ ] **Step 5: Commit.**

### Task 6: Center Point's calculator page computes DOL

**Files:** Create `center-point/order-setup.mjs`; modify `center-point/calculator-page.jsx` and
`center-point/calculator.html`. Test: harness §CP (dynamic `import()` of the module).

- [ ] **Step 1: Failing §CP.** `orderSetup({ bw: 1200, ga: 28, dob: '2026-09-10', order: '2026-09-14' },
  D).dol === 5`; `dob '2569-09-10'` → the Buddhist-era message; a dob after the order date → refused;
  `calculator.html` has a `dob` date input and no `dol` input.
- [ ] **Step 2: Run; expect FAIL** (module missing).
- [ ] **Step 3: Implement.**

```js
// center-point/order-setup.mjs
export function orderSetup({ bw, ga, dob, order }, D, today) {
  const issue = D.admissionDateIssue(dob, today);
  if (issue) return { error: issue.message };
  const birth = D.normalizeDateStr(dob), orderDate = D.normalizeDateStr(order);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) return { error: 'วันที่ให้ TPN ไม่ถูกต้อง' };
  if (birth > orderDate) return { error: `วันเกิด ${birth} อยู่หลังวันที่ให้ TPN ${orderDate}` };
  const patient = { bw: Number(bw), ga: Number(ga), dob: birth, weights: [] };
  return { patient, dol: D.dolAtDate(patient, orderDate) };
}
```

  `calculator.html`: replace `<label>DOL<input name="dol" type="number" min="1" required></label>` with
  `<label>วันเกิด<input name="dob" type="date" required></label><output id="dol-out"></output>`.
  `calculator-page.jsx`: call `orderSetup` on submit (refuse with its message) and on input (write
  `DOL n` into `#dol-out`); mount `<Calculator>` with `patient: { sessionId: link.localId,
  ...setup.patient }` and `dol: setup.dol`.
- [ ] **Step 4: Run §CP, `verify-center-point-*`, `node --test test/center-point.test.mjs`, and
  `npm ci --prefix center-point && npm run build --prefix center-point`; expect PASS.**
- [ ] **Step 5: Commit.**

### Task 7: Retire the old helpers, build, prove it, record it

- [ ] **Step 1: Source checks in the harness** (CRLF-normalised): no `lastWeighed(`,
  `weightAtOrBeforeDol(`, `onWeightChange`, `liveWeight` or `calcWeights` in any `.jsx`; no display of
  `editEntry.dol`, `lastEntry.dol`, `entry.dol}`, `restored.dol` or `weights?.[0]?.dol` outside
  `data.js`.
- [ ] **Step 2: Remove `lastWeighed` and `weightAtOrBeforeDol`** from `data.js` and its exports; move
  `verify-safety-fixes-0923.cjs` (lines 309-310) and `verify-error-boundary.cjs` (1.5, 1.6) to
  `currentWeight` / `ioDivisorG`, keeping their null-safety and both-stores assertions.
- [ ] **Step 3: Build and run everything.** `node tools/build.mjs`; every `test/verify-*.cjs` against
  the sources and again with `NODE_OPTIONS="--require ./test/compiled-loader.cjs"`; `DEAD=0` Factor;
  the CP build and client tests. Prove the new harness fails on `main`: check out `main`'s sources into
  a temporary worktree and run it there.
- [ ] **Step 4: Docs.** `CHANGELOG.md` entry; `BACKLOG.md`: close "Two current weights" and the
  admission-anchor item it lists, add "CP owns the birth facts (CP repo)"; `test/README.md` entry for
  the new harness; bring `STATUS.md` level with the last release if no open PR already does.
- [ ] **Step 5: Commit, push, open the PR** (one PR; say it is frontend-only and not live until a
  `main → release` PR).
