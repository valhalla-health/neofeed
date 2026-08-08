# Code Review Report — `calculator.jsx` + `data.js`

Reviewed 2026-08-08 · Vibe Coding 101 review format (`prompt03-code-review.md`)
Scope: `data.js` (1 052 lines) and `calculator.jsx` (2 185 lines), read in full.
Findings that reach into `app.jsx` / `log.jsx` are included where the *cause*
lives in the reviewed files or where the reviewed logic is duplicated wrongly.

Execution environment: browsers on shared NICU workstations and staff phones,
in **Asia/Bangkok (UTC+7)**. No build step; `.jsx` is transpiled in-browser by
Babel. That timezone is load-bearing for Issue #1.

---

## 1. Executive summary

* **Primary concerns:** Three defects change what a clinician is told at the
  bedside. (a) Every "today" in the app is computed in UTC, so day-of-life and
  log dates are **one day behind for the whole 00:00–07:00 night shift** — the
  shift on which the next day's TPN is written. (b) From DOL 8 the alert engine
  measures **parenteral-fed infants against enteral protein and energy targets**,
  telling a correctly-prescribed PN baby to exceed the ESPGHAN parenteral amino
  acid ceiling. (c) `TPN_TARGETS.k` disagrees with its own comment by four days,
  producing a false "off target" band for potassium on DOL 4–7.
  The arithmetic itself is in good shape — the Factor/overfill model, the Ca:P
  split, unit handling and division-by-zero guards are careful and internally
  consistent, and the KCMH worksheet reconciliation holds.
* **Refactoring priority:** **High** — but narrow. Issues #1–#3 are small,
  surgical fixes with disproportionate clinical weight. Nothing here calls for
  restructuring the calculator.

| # | Category | Severity | Location |
|---|---|---|---|
| 1 | Bug / Data integrity | **High** | `data.js:885` + 7 call sites |
| 2 | Bug / Clinical safety | **High** | `app.jsx:38–42` ← `data.js:362–373` |
| 3 | Bug / Clinical safety | **High** | `data.js:260–263` |
| 4 | Bug | **Medium** | `calculator.jsx:448–449` |
| 5 | Code smell / Clinical | **Medium** | `app.jsx:81` |
| 6 | Readability | **Medium** | `calculator.jsx:470, 609` |
| 7 | Readability | Low | `calculator.jsx:679–681` |
| 8 | Bug | Low | `data.js:836–842` vs `863–872` |
| 9 | Code smell | Low | `calculator.jsx:624` |
| 10 | Code smell | Low | `data.js:191–212` |
| 11 | Readability / Clinical | Low | `data.js:489–498` |
| 12 | **Verification needed** | Unknown | `data.js:941–961` |

---

## 2. Detailed findings

### Issue #1: Every "today" is computed in UTC, not Bangkok local time

* **Category:** Bug / Data integrity
* **Severity:** **High**
* **Location:** `data.js:885–887` (`liveDol`) — root cause. Same pattern at
  `app.jsx:246`, `app.jsx:273`, `log.jsx:549`, `registry.jsx:25`,
  `registry.jsx:365`, `registry.jsx:570`, `registry.jsx:667`.
* **Problem description:**
  `new Date().toISOString()` always renders **UTC**. Bangkok is UTC+7, so from
  00:00 to 07:00 local time `toISOString().slice(0, 10)` returns **yesterday's
  calendar date**. At 02:00 ICT on 9 August, it yields `"2026-08-08"`.

  `liveDol()` feeds that string to `dolAtDate()`, so for those seven hours
  every day the app believes the infant is **one day younger than it is**. Day
  of life is the independent variable for almost every target in this codebase:
  `TARGETS.fluid(dol, wt)`, `TPN_TARGETS.protein/kcal/lipid/na/k/ca/p(dol)`, the
  PMA on the Fenton chart, the stale-weight alert, and the registry's DOL column.
  A DOL 3 → DOL 2 slip moves an ELBW infant's fluid target from 120–140 to
  100–120 mL/kg/d and its parenteral calcium target from 64–140 to 32–80 mg/kg/d.

  The same call at `app.jsx:246/273` stamps a new `Daily_Log` row with
  yesterday's `ts`, and `log.jsx:549` offers the wrong "today" in the
  back-date picker — so a night-shift entry is filed against the wrong day
  *and* computed against the wrong day's targets, consistently, without
  anything looking obviously wrong on screen.

  Night shift is precisely when the next day's TPN is written.
* **Suggested fix:** Add one `todayLocal()` helper to `data.js`, export it, and
  route all eight call sites through it. `sv-SE` locale is used because it
  formats as `YYYY-MM-DD` natively; `Asia/Bangkok` is pinned explicitly so the
  result does not depend on the workstation's clock configuration.
* **Conceptual explanation:** `toISOString()` answers "what is the UTC instant?"
  The app needs "what calendar day is it *here*?" Those are different questions
  for 7 of every 24 hours in Thailand. Pinning the timezone rather than relying
  on the browser default also protects against a mis-set NICU workstation.

```diff
+// Today's calendar date in Bangkok, as YYYY-MM-DD.
+// NOT new Date().toISOString().slice(0,10) — that is the UTC date, which for
+// UTC+7 is *yesterday* from 00:00 to 07:00 local. Night shift writes the next
+// day's TPN, so a UTC "today" put DOL and every DOL-derived target one day
+// behind for the whole shift. The timezone is pinned rather than left to the
+// browser so a mis-set workstation clock can't reintroduce the same drift.
+function todayLocal() {
+  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok" })
+    .format(new Date());   // sv-SE formats as YYYY-MM-DD
+}
+
 function liveDol(patient) {
-  return dolAtDate(patient, new Date().toISOString().slice(0, 10));
+  return dolAtDate(patient, todayLocal());
 }
```

Then export it and replace the other seven sites:

```diff
 window.NEOFEED_DATA = {
   ...
   // Live DOL helper
-  liveDol, dolAtDate,
+  liveDol, dolAtDate, todayLocal,
```

```diff
   const handleLogToGAS = (entry) => {
     const id = active.sessionId;
-    const ts = entry.ts || new Date().toISOString().slice(0, 10);
+    const ts = entry.ts || D_A.todayLocal();
     const tempId = "tmp_" + Date.now() + "_" + Math.random().toString(36).slice(2);
```

* **Status:** Unreviewed

---

### Issue #2: PN-fed infants are measured against enteral protein and energy targets

* **Category:** Bug / Clinical safety
* **Severity:** **High**
* **Location:** `app.jsx:38–42` (`computeAlerts`), reading
  `data.js:362–373` (`TARGETS.protein`, `TARGETS.kcal`)
* **Problem description:**
  `TARGETS.ca` and `TARGETS.p` both take an `isEnteral` flag and switch regimes
  on it. `TARGETS.protein`, `TARGETS.kcal` and `TARGETS.lipid` **do not** — they
  return the *enteral* values unconditionally once `dol > 7`:

  | `dol > 7` | `TARGETS.*` returns | Correct PN value |
  |---|---|---|
  | protein | 3.5 – 4.0 g/kg/d | 2.5 – **3.5** g/kg/d |
  | kcal | 110 – 140 kcal/kg/d | 90 – 120 kcal/kg/d |

  `computeAlerts` calls them with no route awareness, so an infant on full PN
  at DOL 10 who is correctly receiving 3.0 g/kg/d amino acid is told:

  > **Protein below DOL target** — 3.0 g/kg/d on DOL 10 — target 3.5–4.0 g/kg/d
  > (ESPGHAN 2018).

  ESPGHAN 2018 places the parenteral ceiling at 3.5 g/kg/d and calls anything
  above it research-only — the guideline the alert cites says the opposite of
  what the alert says. The energy alert behaves the same way, pushing toward
  110–140 kcal/kg/d parenterally when the PN target tops out at 120.

  The codebase already contains the correct pattern: `log.jsx:21–46`
  (`pickTarget`) switches on `entry.enVolPerKg >= 100` exactly as it should.
  `computeAlerts` reads the same entries, which carry the same `enVolPerKg`
  field, and simply fails to use it.
* **Suggested fix:** Make `computeAlerts` route-aware using the entry's own
  `enVolPerKg`, and cite the guideline that actually produced the number.
* **Conceptual explanation:** Parenteral and enteral nutrition have genuinely
  different targets because bioavailability and metabolic load differ — that is
  why `TPN_TARGETS` and `ENTERAL_TARGETS` exist as separate tables. `TARGETS` is
  a convenience blend that silently resolves to the enteral branch after day 7;
  reading it in a route-blind context turns that convenience into a wrong
  clinical recommendation. Selecting the table from data already on the entry
  removes the guess.

```diff
 function computeAlerts(patient, entries) {
   const alerts = [];
   const last = entries[entries.length - 1];
   if (last) {
+    // Route-aware targets. The same switch log.jsx's pickTarget() uses:
+    // >=100 mL/kg/d enteral means the infant is on full feeds and the ESPGHAN
+    // 2022 enteral targets apply; below that it is still a PN prescription and
+    // the 2018 parenteral targets do. D_A.TARGETS.protein/kcal are NOT safe
+    // here — they return the enteral values unconditionally once dol > 7, which
+    // told a PN baby to exceed the 3.5 g/kg/d parenteral amino acid ceiling.
+    const isEN  = (last.enVolPerKg || 0) >= 100;
+    const T     = isEN ? D_A.ENTERAL_TARGETS : D_A.TPN_TARGETS;
+    const src   = isEN ? "ESPGHAN 2022" : "ESPGHAN 2018";
     const tGir  = D_A.TARGETS.gir();
-    const tPro  = D_A.TARGETS.protein(last.dol);
-    const tKcal = D_A.TARGETS.kcal(last.dol);
+    const tPro  = isEN ? T.protein() : T.protein(last.dol);
+    const tKcal = isEN ? T.kcal()    : T.kcal(last.dol);
     if (last.gir > tGir[1]) alerts.push({ id: "gir-high", level: "crit", title: "GIR critically high", body: `Logged GIR ${last.gir} mg/kg/min — reduce dextrose concentration.`, dol: last.dol, ref: "ESPGHAN 2018" });
-    if (last.pro < tPro[0] && last.dol > 2) alerts.push({ id: "protein-low", level: "warn", title: "Protein below DOL target", body: `${last.pro} g/kg/d on DOL ${last.dol} — target ${tPro[0]}–${tPro[1]} g/kg/d (ESPGHAN 2018).`, dol: last.dol, ref: "ESPGHAN 2018" });
-    if (last.kcal < tKcal[0] && last.dol > 4) alerts.push({ id: "kcal-low", level: "warn", title: "Energy below growth target", body: `${last.kcal} kcal/kg/d — target ${tKcal[0]}–${tKcal[1]} kcal/kg/d for DOL ${last.dol}.`, dol: last.dol, ref: "ESPGHAN" });
+    if (last.pro < tPro[0] && last.dol > 2) alerts.push({ id: "protein-low", level: "warn", title: "Protein below DOL target", body: `${last.pro} g/kg/d on DOL ${last.dol} — target ${tPro[0]}–${tPro[1]} g/kg/d (${src}, ${isEN ? "enteral" : "parenteral"}).`, dol: last.dol, ref: src });
+    if (last.kcal < tKcal[0] && last.dol > 4) alerts.push({ id: "kcal-low", level: "warn", title: "Energy below growth target", body: `${last.kcal} kcal/kg/d — target ${tKcal[0]}–${tKcal[1]} kcal/kg/d for DOL ${last.dol} (${src}, ${isEN ? "enteral" : "parenteral"}).`, dol: last.dol, ref: src });
   }
```

> **Note.** Legacy rows written before `enVolPerKg` existed lack the field and
> fall to the parenteral branch — the same conservative default `pickTarget`
> already takes, and the safer of the two.

* **Status:** Unreviewed

---

### Issue #3: `TPN_TARGETS.k` switches to the stable-phase band four days early

* **Category:** Bug / Clinical safety
* **Severity:** **High**
* **Location:** `data.js:260–263`
* **Problem description:**
  The function's own comment says the second branch is the **"Stable D8+"**
  band, but the guard is `dol <= 3` — so the D8+ value is returned from **DOL 4**:

  ```js
  if (!dol || dol <= 3) return [0, 3];   // Transition/Intermediate
  return [2, 3];                          // Stable D8+  ← fires from DOL 4
  ```

  Its sibling `TARGETS.k` (`data.js:391–394`) has the identical comment and the
  guard `dol <= 7`, which matches. One of the two is wrong, and the comment says
  which: ESPGHAN 2018 (Jochum) runs the intermediate phase through day 7.

  Consequence: on DOL 4–7 any potassium between 0 and 2 mEq/kg/d is rendered
  amber "off target" when 0–3 is the guideline range. Exactly zero still shows
  as "empty" (`rangeStatus` special-cases `0`), so the false-warning window is
  `0 < K < 2` — which is the normal, deliberate prescription for an infant whose
  urine output has only just established. The band this produces nudges toward
  giving potassium earlier and in larger amounts than the intermediate phase
  intends, in the population most exposed to non-oliguric hyperkalaemia.

  Blast radius is both surfaces: the Step 4 tile in `calculator.jsx:676`
  (`tK = T.k(dol)`) and the TrendGraph target band in `log.jsx:41`.
* **Suggested fix:** Change the boundary to `dol <= 7` so the code matches its
  comment, its sibling, and the guideline.
* **Conceptual explanation:** ESPGHAN's phases are transition (D1–2/3),
  intermediate (through D7) and stable (D8+). Potassium is withheld or kept low
  until the diuretic phase completes and urine output is established; the stable
  2–3 mEq/kg/d minimum only becomes a floor after that. Applying the floor on
  day 4 asserts a deficiency that does not exist yet.

```diff
   k: (dol) => {
-    if (!dol || dol <= 3) return [0, 3];   // Transition/Intermediate: 0–3 mEq/kg (hold D1-2 ELBW)
+    // Transition (D1–2/3) + Intermediate (through D7): 0–3 mEq/kg — K is held
+    // or kept low until the diuretic phase completes and urine output is
+    // established. The stable-phase 2 mEq/kg floor must NOT apply before D8:
+    // this guard read `dol <= 3` and so flagged a normal DOL 4–7 prescription
+    // of 0–2 mEq/kg/d as "off target". TARGETS.k below has always had it right.
+    if (!dol || dol <= 7) return [0, 3];
     return [2, 3];                          // Stable D8+: 2–3 mEq/kg (Jochum 2018)
   },
```

* **Status:** Unreviewed

---

### Issue #4: Vitalipid volume is prescribed even when no lipid is ordered

* **Category:** Bug
* **Severity:** Medium
* **Location:** `calculator.jsx:448–449`, consumed at `484`, `957`, `1236`,
  `1398`, `1710`, `1966`
* **Problem description:**
  ```js
  const vitalipidVol = Math.min(4 * wtKg, 10);
  const lipidBagVol  = lipidVol + vitalipidVol;
  ```
  `vitalipidVol` is computed unconditionally. Vitalipid N Infant is added *to
  the lipid bag*; with `lipidPerKg = 0` there is no lipid bag, but the app still
  adds 4 mL/kg/day (capped at 10) of phantom volume. That flows into
  `prescribedFluid` (line 484), into the "available fluid" figure the user is
  shown when sizing the TPN bag (line 957), and onto the **printed pharmacy
  order form** (lines 1710, 1966), which will read `Vitalipid N Infant: 2.8
  mL/day → lipid bag` for a patient with no lipid bag.

  It also silently defeats a guard: `calc.lipidBagVol > 0` (line 1242) is
  intended to mean "lipid is ordered", but `lipidBagVol` is never 0 once a
  weight is entered, so that branch always renders. Line 1018 guards the same
  concept correctly with `lipidPerKg > 0` — the file is inconsistent with itself.

  Magnitude: on DOL 1 for a 700 g infant, 2.8 mL against a ~56 mL/day total is
  ~5 % of the day's fluid. Below the 20 mL/kg/d threshold that raises the
  "prescribed ≠ target" alert, so nothing flags it.
* **Suggested fix:** Gate Vitalipid on lipid actually being ordered.
* **Conceptual explanation:** Vitalipid is a fat-soluble vitamin preparation
  that must be carried in a lipid emulsion — it is not a standalone infusion.
  Deriving its volume from weight alone models it as an independent order, which
  it is not. Making the dependency explicit in the expression keeps the fluid
  total, the availability figure and the printed order form consistent with
  what pharmacy will actually compound.

```diff
     const aaG = aaPerKg * wtKg;          // DELIVERED g/day — drives protein + kcal
     const aaG_bag = aaPerKg * factor;    // IN THE BAG (sheet F11) — drives Aminoven mL
     const lipidG = lipidPerKg * wtKg;    // separate syringe: no overfill applied
     const lipidVol = lipidG / 0.20;
-    const vitalipidVol = Math.min(4 * wtKg, 10);
+    // Vitalipid rides in the lipid emulsion — it is not a standalone infusion.
+    // Computing it from weight alone put 4 mL/kg/d of phantom volume into
+    // prescribedFluid, into the "fluid available" readout, and onto the printed
+    // order form for patients with no lipid ordered at all.
+    const vitalipidVol = lipidPerKg > 0 ? Math.min(4 * wtKg, 10) : 0;
     const lipidBagVol = lipidVol + vitalipidVol;
```

* **Status:** Unreviewed

---

### Issue #5: The "Weekly electrolyte audit due" alert states a fact the app cannot know

* **Category:** Code smell / Clinical
* **Severity:** Medium
* **Location:** `app.jsx:81`
* **Problem description:**
  ```js
  alerts.push({ id: "electrolyte-audit", level: "info",
    title: "Weekly electrolyte audit due",
    body: "Last serum electrolytes >72 h ago. Consider re-check given current Na/K delivery.", ... });
  ```
  This is pushed unconditionally, for every patient, on every evaluation. NeoFeed
  stores no serum electrolyte results anywhere — not in `Daily_Log`, not in
  `Patient_Registry` — so **"Last serum electrolytes >72 h ago" is asserted
  without any basis**. It is equally displayed for an infant whose electrolytes
  were drawn an hour ago.

  Two costs. It is a false statement rendered in the same visual language as the
  genuine, computed alerts, so a reader cannot tell which alerts are evidence.
  And because it never clears on its own, every patient carries a permanent
  alert until someone acknowledges it — the classic mechanism by which real
  alerts stop being read.
* **Suggested fix:** Either drop the claim and state it as the standing protocol
  reminder it actually is, or drive it from real data. The minimal honest fix is
  below; the better fix is to capture an electrolyte-draw date and compute it.
* **Conceptual explanation:** A decision-support alert carries an implicit
  claim: *I checked, and this is true of this patient.* Hardcoding one that was
  never checked spends the credibility of every alert beside it. Rewording to a
  protocol reminder keeps the useful prompt without the false assertion.

```diff
-  // System info
-  alerts.push({ id: "electrolyte-audit", level: "info", title: "Weekly electrolyte audit due", body: "Last serum electrolytes >72 h ago. Consider re-check given current Na/K delivery.", dol: last?.dol, ref: "KCMH protocol" });
+  // Standing protocol reminder — NOT a computed finding. NeoFeed does not store
+  // serum electrolyte results, so it cannot know when the last draw was; the
+  // earlier wording ("Last serum electrolytes >72 h ago") asserted that anyway,
+  // on every patient. Keep it phrased as the reminder it is until an actual
+  // electrolyte-draw date is captured and this can be computed.
+  alerts.push({ id: "electrolyte-audit", level: "info", title: "Electrolyte review — protocol reminder", body: "KCMH protocol: review serum electrolytes at least weekly while on PN. NeoFeed does not track draw dates — check the chart.", dol: last?.dol, ref: "KCMH protocol" });
```

* **Status:** Unreviewed

---

### Issue #6: `pKg` means two different things inside the same function

* **Category:** Readability
* **Severity:** Medium
* **Location:** `calculator.jsx:470` (declaration) and `609` (return)
* **Problem description:**
  Line 470 declares `const pKg = pTotal_mg / wtKg` — **parenteral phosphorus
  only**. Line 609 returns `pKg: pKg + pFromEN` — **parenteral + enteral**. The
  same identifier names two different clinical quantities 139 lines apart, and
  the returned one is what gets written to the `p` column of every `Daily_Log`
  row. `caKg` has the same shape (`caPerKg` local, `caPerKg + caFromEN`
  returned) but at least changes name in the process.

  Nothing is currently wrong — every consumer I traced uses the right one, and
  `mineral` reconstructs the parenteral figure from `calc.pTotal_mg` rather than
  from `pKg`, which is correct. The risk is prospective: this is the single
  highest-consequence function in the app, and the next person to add a line
  reading `pKg` between 470 and 609 gets the parenteral-only value while
  reasonably believing it is the total.
* **Suggested fix:** Rename the local to say what it is. Mechanical, no
  behaviour change.
* **Conceptual explanation:** In a function this long, a name is the only thing
  carrying the unit and the scope of a quantity. When one name covers two
  scopes, the reader has to reconstruct which is in play from line position —
  and position is exactly what changes when the file is edited.

```diff
     const naKg = naCl + naAcet + na_glycophos;
     const kKg = kCl + k2hpo4;
-    const pKg = pTotal_mg / wtKg;
+    const pKg_tpn = pTotal_mg / wtKg;   // parenteral P only; EN is added at the return
```
```diff
       gir, dexG, aaG, lipidG,
-      naKg, kKg, caKg: caPerKg + caFromEN, pKg: pKg + pFromEN, caP,
+      naKg, kKg, caKg: caPerKg + caFromEN, pKg: pKg_tpn + pFromEN, caP,
       caFromEN, pFromEN,
```

* **Status:** Unreviewed

---

### Issue #7: `tCaP` comment states a range the code does not return

* **Category:** Readability
* **Severity:** Low
* **Location:** `calculator.jsx:679–681`
* **Problem description:** Three consecutive comments claim the Ca:P target is
  `[1.3, 1.7]` and that it "was corrected to [1.3, 1.7]". `D.TARGETS.caP()`
  (`data.js:424`) returns `[1.0, 1.7]`. The lower bound in the comment is wrong,
  and it is the bound that decides whether a low-Ca:P prescription is flagged.
* **Suggested fix:** Correct the comments to the returned value.
* **Conceptual explanation:** A wrong comment beside a clinical constant is worse
  than no comment — a reviewer checking the code against ESPGHAN will reconcile
  against the comment and conclude the code is broken, or "fix" the code to match.

```diff
-  // Ca:P mass ratio — order form: ~1.7:1 target · ESPGHAN 2018 molar 0.8–1.3 → mass 1.3–1.7
-  // (was [1.5, 1.9] → corrected to [1.3, 1.7] per order form + ESPGHAN 2018)
-  const tCaP = D.TARGETS.caP();            // [1.3, 1.7] mass ratio
+  // Ca:P mass ratio — ESPGHAN 2018 molar 0.8–1.3 × (40/31) → mass 1.0–1.7.
+  // KCMH order form aims at the upper end (~1.7:1).
+  const tCaP = D.TARGETS.caP();            // [1.0, 1.7] mass ratio
```

* **Status:** Unreviewed

---

### Issue #8: `gaTotalDays` and `parseGAInput` disagree on out-of-range day digits

* **Category:** Bug
* **Severity:** Low
* **Location:** `data.js:836–842` vs `data.js:863–872`
* **Problem description:** `parseGAInput("27.9")` clamps the day digit to 6 and
  returns `27.6` (189 days). `gaTotalDays(27.9)` carries instead, returning 198
  days — `28+2`. Same input, two answers, nine days apart. In practice
  `parseGAInput` guards the entry path so an out-of-range value should not reach
  storage, but GA also arrives from the GAS sheet, which is edited by hand.
* **Suggested fix:** Clamp in `gaTotalDays` too, so the encoding has one meaning
  regardless of how a value entered the system.
* **Conceptual explanation:** `WW.D` is a non-standard encoding, so every
  function that decodes it has to agree on what an invalid digit means. One
  clamping and one carrying makes GA arithmetic dependent on which helper the
  caller happened to reach for.

```diff
 function gaTotalDays(ga) {
   if (!isFinite(ga) || ga <= 0) return 0;
   const weeks = Math.floor(ga);
-  // First decimal digit = days; carry if user typed 0.7-0.9
-  const raw = Math.round((ga - weeks) * 10);
+  // First decimal digit = days, clamped 0-6 — the same rule parseGAInput
+  // applies. These used to disagree: parseGAInput("27.9") clamps to 27+6 while
+  // this carried to 28+2, so a hand-edited sheet value decoded differently
+  // depending on which helper the caller used.
+  const raw = Math.min(6, Math.max(0, Math.round((ga - weeks) * 10)));
   return weeks * 7 + raw;
 }
```

* **Status:** Unreviewed

---

### Issue #9: `route` is a `calc` dependency but is never read inside it

* **Category:** Code smell
* **Severity:** Low
* **Location:** `calculator.jsx:624`
* **Problem description:** `route` sits in the `calc` dependency array but the
  memo body never reads it — `route` is used only afterwards, for `sOsm`
  (line 708) and the saved entry's route string (line 755). The effect is a
  wasted full recomputation of a 200-line memo on every central/peripheral
  toggle. Harmless today; the reason to fix it is that a stray dependency
  invites the opposite mistake, since it suggests the array is decorative.

  For the record, the rest of the array is **correct** — I checked every value
  read inside the memo against it and found no missing dependency.
* **Suggested fix:** Drop it.

```diff
   }, [wtG, wtKg, fluidTargetPerKg, otherIV_mL, drug_mL,
   totalTPN_mL, deadVol_mL, dexPct, aaPerKg, lipidPerKg,
   naCl, naAcet, glycophosP, kCl, k2hpo4, mgPerKg, mgStrength, caPerKg, extraP_mg_kg,
-  enType, enVol, enFreq, isMEN, route,
+  enType, enVol, enFreq, isMEN,
   inclSoluvit, inclPeditrace, heparinUmL]);
```

* **Status:** Unreviewed

---

### Issue #10: `SALT_SOURCES` is exported, unused by the calculator, and dangerous to wire in

* **Category:** Code smell
* **Severity:** Low
* **Location:** `data.js:191–212`, exported at `1030`
* **Problem description:** The table's own header warns that it lists strengths
  which *exist* rather than the ones KCMH stocks, and that its `NaCl 3%` /
  `KCl 1 mEq/mL` rows are not the TPN stock. `KCMH_STOCK` is the authority the
  calculator uses. The table is nonetheless exported on `window.NEOFEED_DATA`
  next to `KCMH_STOCK`, with similar keys and similar-looking `mEqPerML` fields —
  so the mistake the comment warns about is one autocomplete away, and it would
  silently change every printed compounding volume.
* **Suggested fix:** Keep the data (it is useful reference) but make misuse
  loud — rename the export to signal it, or move it under a
  `REFERENCE_ONLY` namespace. Minimal version:

```diff
   // Product reference
-  AA_PRODUCTS, LIPID_PRODUCTS, SALT_SOURCES, ADDITIVE_PRODUCTS,
+  AA_PRODUCTS, LIPID_PRODUCTS, ADDITIVE_PRODUCTS,
+  // Display-only strength reference. NOT compounding divisors — KCMH_STOCK is
+  // the only authority for those. Renamed so it cannot be reached for by
+  // mistake alongside KCMH_STOCK (see the warning at its declaration).
+  SALT_SOURCES_REFERENCE_ONLY: SALT_SOURCES,
```

* **Status:** Unreviewed

---

### Issue #11: The osmolarity formula omits the phosphate anion — by design, but undocumented in the UI

* **Category:** Readability / Clinical
* **Severity:** Low
* **Location:** `data.js:489–498`
* **Problem description:** `estimateOsmolarity` sums dextrose, amino acid, Na, K,
  Ca and Mg. Phosphate contributes no term of its own — Glycophos® is counted
  only through the sodium it carries, and K₂HPO₄ only through its potassium.
  This is **deliberate and correct for its purpose**: the formula reproduces the
  KCMH worksheet's cell E52 exactly, which `test/verify-kcmh-constants.cjs`
  confirms against the sheet's own cached results (856 / 896 mOsm/L).

  The consequence worth surfacing is clinical, not arithmetic: the value that
  the `route === "peripheral"` check compares against 900 mOsm/L is a
  sheet-faithful estimate that does not account for phosphate load, so a
  phosphate-rich bag sits closer to the peripheral limit than the number shown.
* **Suggested fix:** No code change to the formula — matching the pharmacy sheet
  is the right call. Document the limitation where the number is displayed, so
  a clinician reading "880 mOsm/L — OK for peripheral" knows what it does and
  does not include.
* **Conceptual explanation:** Two defensible definitions of osmolarity exist
  here: the pharmacy's (so the app and the compounding sheet never disagree) and
  the physiological one. The app chose the first, correctly. The risk is only
  that a reader assumes the second.
* **Status:** Unreviewed

---

### Issue #12: Oral phosphate products — confirm the label means elemental P, not PO₄³⁻

* **Category:** **Verification needed** — not a confirmed defect
* **Severity:** Unknown (High if the assumption is wrong)
* **Location:** `data.js:941–961` (`SUPP_DB.PO4_PHOSPHATE`, `SUPP_DB.PO4_NEUTRAL`)
* **Problem description:** Both entries convert milligrams to millimoles by
  dividing by **31** — phosphorus's atomic weight:
  * `PO4_PHOSPHATE`: `265 / 31 / 5` ≈ 1.710 mmol/mL, noted as "5 mL = PO4 265 mg
    (8.55 mmol)"
  * `PO4_NEUTRAL`: `72 / 31 / 5` ≈ 0.465 mmol/mL, noted as "72 mg (2.32 mmol)"

  Dividing by 31 is only correct if the handbook's "265 mg" and "72 mg" mean
  **elemental phosphorus**. If they mean the phosphate ion PO₄³⁻ (MW ≈ 95), the
  correct divisor is 95, and the app over-states oral phosphorus by roughly
  threefold — which would flow into `mineral.oralP`, `mineral.totP`, the total
  Ca:P ratio, and the `suppPO4_mmol` written to `Daily_Log`.

  The two entries are **internally consistent** with each other, and dividing by
  31 matches how phosphate supplements are conventionally labelled, so the
  likelihood is that this is correct. I am flagging it rather than asserting a
  defect because it cannot be settled from the code — it needs the Chula
  Pediatric Nutrition Handbook 3rd ed. page these were transcribed from.
* **Suggested fix:** Check the two products against the handbook. If confirmed,
  add the wording to the comment so this question does not have to be re-opened:
  `// 265 mg = elemental P (not PO4 ion) — verified vs Chula Handbook §<n>, <date>`.
  If not confirmed, the divisor and both `po4_mg_per_ml` values change.
* **Status:** Unreviewed — **needs a source document, not a code decision**

---

## 3. What I checked and found correct

Recording these so the next review does not re-derive them:

* **The Factor / overfill model** (`calculator.jsx:439–442`, and every
  `× factor` downstream) is right. Delivered dose per kg comes back out as
  ordered; osmolarity and GIR are invariant under overfill because amount and
  volume scale together; only absolute bag quantities grow. The deliberate
  non-scaling of Soluvit/Peditrace matches the sheet's `× C6` rows and is
  surfaced as an alert rather than silently corrected.
* **The Ca/PO₄ split** between `calc` (TPN + EN) and `mineral` (adds oral) holds.
  I verified algebraically that `mineral.ivCaP === calc.caP`, as the comment
  claims — they cannot drift.
* **Unit handling throughout `calc`**: Glycophos mmol→mg, K₂HPO₄ mEq K→mg P,
  Ca gluconate elemental mg/mL, the `aaPct` and `naMeqPerL` delivered-basis
  concentrations feeding osmolarity, and the `suppPO4_mmol` conversion in
  `handleSave` all check out dimensionally.
* **Division-by-zero discipline** is consistently good — `wtKg` is guarded by an
  early return, and `npeN`, `peRatio`, `kcalProtPct`, `caP` and `mineral.ratio`
  each guard their denominators, with `Infinity` used deliberately to drive the
  "Ca with no P" critical alert.
* **The `calc` dependency array is complete** for every value the memo reads
  (Issue #9 is one dependency too many, not one too few).
* `TwoCol` / `PresetChips` remain at module level, as the regression history
  requires.

---

## 4. Suggested order of work

1. **#1 (UTC dates)** — one helper, eight call sites, largest clinical footprint.
2. **#3 (potassium boundary)** — one character.
3. **#2 (route-blind alert targets)** — one function.
4. **#4 (Vitalipid)** — one line, but it changes a printed pharmacy document, so
   re-run `test/verify-kcmh-factor.cjs` both ways (`DEAD=20` and `DEAD=0`) after.
5. **#5–#11** — cleanups, batchable.
6. **#12** — needs the handbook, not a code change.

Both existing harnesses must pass before and after:

```bash
node test/verify-kcmh-constants.cjs && DEAD=20 node test/verify-kcmh-factor.cjs && DEAD=0 node test/verify-kcmh-factor.cjs
```

Note that **none of the current tests would have caught #1, #2, #3 or #5** —
they verify compounding arithmetic against the KCMH worksheet, and every one of
those four is a target-selection or date defect living outside that surface.
That gap is the strongest argument for the unit-test tier the TDD flagged as
missing.
