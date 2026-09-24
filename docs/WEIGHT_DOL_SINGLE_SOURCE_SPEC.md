# One source for weight and day of life — spec

Praew, 2026-09-24: *"น้ำหนัก และ day of life ของทุกที่ ในคนๆเดียวกัน ตรงกันทุกหน้าจอ ไม่ว่าจะไปอยู่ตรงไหน
ให้เอามาจากที่เดียวกัน"*: an infant's weight and DOL must read the same on every screen, from one place.
Design approved in chat the same day, together with one clinical decision (the I/O divisor, below).

## What the audit found

The helpers already existed (`liveDol`, `dolAtDate`, `entryDol`, `lastWeighed`, `weightSeries`) and
most screens used them. What disagreed was the copies kept on the way:

| # | Where | What it showed |
|---|---|---|
| W1 | Patient strip (`app.jsx` `PatientStrip`) | The weight being **typed** in the calculator (`liveWeight`), unsaved, a draft or a back-fill, over the recorded one — and it stayed on every page until the patient changed |
| W2 | Calculator prefill and source hint | Growth-chart measurements only (`lastWeighed(patient)`), so a ward weighing in the order got a different figure from the strip; a back-filled order could be given a *later* weight; on a same-day tie the order won, where the strip lets the measurement win |
| W3 | Trend graph "Weight" (`log.jsx`) | Order weights only; the strip, Ward and Fenton read both stores |
| W4 | I/O divisor (`ioDivisorG` → `weightAtOrBeforeDol`) | "Previous day's weight" from measurements only |
| W5 | Registration (`NewPatientModal`) | Birth weight, length and HC filed on the **admission** DOL, so an outborn infant's birth point sat at the wrong PMA and outranked the admission-day order weight |
| D1 | Ward tooltip "บันทึกล่าสุด DOL", calculator banners (edit, baseline, restored), delete toast | The `dol` stored when the row was saved |
| D2 | Dashboard "Day admit" column and Trend x-axis | Anchored on `weights[0].dol`, which is the birth row for any record with a birth measurement |
| D3 | Growth-chart rows after an anchor correction | Rows store a DOL, not a date. Correcting the admission date or DOL at admission moved every order's DOL but only `weights[0]`, so a measurement and an order taken the same morning ended up on different DOLs |
| D4 | `entryDol` | Re-derived only when `admissionDate` is set, so a record with a dob but no admission date showed stored DOLs in the log and live ones in the strip |
| D5 | Calculator page head | The chip showed today's DOL above an order for another day (edit, back-fill, or a new order left open past midnight), unlabelled; the previous-order lookup also moved to the new day |
| D6 | Fenton `MeasurementLogger` | Prefilled `max(last stored DOL, today)`, so a stale stored DOL above today won |

The backend never computes a DOL: it stores the number the client sends and returns it. Every fix is
frontend-only; nothing needs a `clasp` deploy.

## The rules

**R1 — DOL.** The DOL of a calendar date is `D.dolAtDate(patient, date)`: (date − dob) + 1 in
Asia/Bangkok calendar dates, so the day of birth is DOL 1; the anchor is a credible `dob`, else the
admission date plus the DOL at admission. Today's is `D.liveDol(patient)`; a saved order's is
`D.entryDol(patient, row)`, from the row's date; the admission day's is `D.admissionDol(patient)`.
No screen shows a stored `dol` column, a browser-stored snapshot or `weights[0].dol` as a DOL.

**R2 — Current weight.** `D.currentWeight(patient, entries, asOfDol?)` is the latest point of
`D.weightSeries(patient, entries)` — growth-chart measurements joined with submitted orders' weights,
drafts excluded, the measurement winning when both fall on one DOL (the 2026-09-23 rule, #96) — on or
before `asOfDol`, or the latest overall when it is omitted. Every screen that shows or starts from "the
current weight" calls it with the patient's log. It replaces `lastWeighed` and `weightAtOrBeforeDol`.

**R3 — Growth-chart rows stay on their day.** Rows are still keyed by DOL (no stored date — adding one
means migrating every record and would collide with PR #111's nurse form). The birth row is DOL 1 (a
DOL 0 row is also treated as birth). When an edit moves the DOL anchor, every other row in `weights`,
`lengths` and `hcs` moves by the same number of days (`D.anchorShiftDays`), which keeps each
measurement on the calendar day it was taken, exactly as orders already behave. If a row would land on
or before DOL 1, Save is refused with a message naming it.

**R4 — Birth measurements are DOL 1.** New registrations file birth weight, length and HC at DOL 1.
Existing records are left as stored (their admission day is past; an outborn infant already on the
unit keeps its birth point where it is).

**R5 — The I/O divisor reads the same series (Praew, 2026-09-24).** Its previous-day weight is
`currentWeight(patient, entries, dol − 1)`; the birth-weight floor and the "today's weight once it
clears birth weight" rule are unchanged. On a ward that weighs only in the order, urine mL/kg/h is now
divided by yesterday's order weight instead of the birth weight or an old measurement. The I/O per-kg
figures are on-screen hints only: not printed, not saved.

## Screen by screen

| Screen | After |
|---|---|
| Patient strip | `currentWeight(patient, entries)` and `liveDol`; `liveWeight` and the calculator's `onWeightChange` are removed. A typed weight lives in the calculator's Step 1 box until the order is saved |
| Ward cards and table | `currentWeight`; tooltip DOL from `entryDol` |
| Calculator, new order for today | Prefills `currentWeight(patient, entries)` (the strip's figure). The hint says where it came from: measured on DOL n, the order of DOL n, or typed into this order |
| Calculator, back-fill or an order left open past midnight | Prefills `currentWeight(patient, entries, order's DOL)` — never a later weight |
| Calculator, edit | The saved order's own weight, as before |
| Calculator banners | `entryDol` / `dolAtDate` of the order's date |
| Calculator page head | The chip names the order's DOL, and its date whenever that is not today (`onOrderDate` from the Calculator); the previous-order lookup uses the order's date |
| I/O card | R5 |
| Dashboard log table | "Day admit" = `entryDol − admissionDol` |
| Trend graph | x-axis anchored on `admissionDol`; the Weight metric plots `weightSeries` |
| Fenton | Logger prefill and cap = today's DOL; "Latest" names its source |
| Alerts | Stale-weight alert on `currentWeight` |
| Delete toast | `entryDol` |

## Center Point

Praew, later on 2026-09-24: *"Check DOL ของ center point กับ neofeed ให้ตรงกัน มีplan ว่าถ้าเพิ่มผู้ป่วยใหม่จะต้อง
ลิงก์จากเซ็นทรัลพอยท์เท่านั้น"*: CP's DOL must match NeoFeed's, and new patients will be registered only
through CP and linked from there.

**What CP does today** (audit of `NICU-Center-Point` at `c722748`): CP stores no birth date, GA or birth
weight (its central schema is `patients(id, created_at)` and `encounters(id, patient_id, status,
version, created_at)`), and computes no DOL anywhere. NeoFeed's CP calculator page
(`center-point/calculator-page.jsx`, `calculator.html`) asks the user to **type** a DOL, which is saved
as `tpn.dol`, printed by CP and checked only as a whole number ≥ 1 — tied to neither a birth date nor
the order date. So the two apps agree only when the typed number happens to be right.

**Decided (Praew, 2026-09-24):**

- **CP owns the birth facts** — date of birth, GA and birth weight — captured at registration. That is
  CP-repo work, in its own PR with its own design (whether the birth date lives in the central
  database or the workstation vault is a PDPA question for that design). There, CP gets NeoFeed's DOL
  rule and a shared table of test dates both repos must pass (the way `test/tpn-document-parity` keeps
  `tpn-document.mjs` identical today), CP's own screens compute DOL with it, and CP's server checks
  every `tpn.dol` against the birth date and the order date.
- **This PR fixes the CP calculator page in the NeoFeed repo.** The setup form asks for the date of
  birth instead of a DOL, and the page passes `dob` on the patient and
  `dol = D.dolAtDate(patient, order date)` — NeoFeed's own function, the one the ward screens use. A
  blank, Buddhist-era or future birth date, or one after the order date, is refused with
  `D.admissionDateIssue`'s wording, and the computed DOL is shown before the calculator opens. Once CP
  stores the birth date, the page fills this field from the link instead.

NeoFeed's DOL convention (day of birth = DOL 1, Bangkok calendar dates) is the one CP adopts; CP has no
convention of its own to reconcile, only a typed number (its form already refuses DOL 0).

## Out of scope

- The CP-repo work above: storing the birth facts in CP and checking `tpn.dol` there (its own PR).
- CP's calculator page still takes birth weight and GA typed, GA in whole weeks, and its Current weight
  still starts at the typed birth weight; both go away when CP holds the birth facts.
- A stored date on every growth-chart row (R3 explains why not now).
- Existing outborn records' birth rows (R4).
- The PDPA dob refill in `updateWeights`, filed as its own task.
- `log.jsx` `pickTarget`'s 1000 g fallback for a row with no weight and no birth weight.

## Tests

- **New:** `test/verify-single-source-weight-dol.cjs`. One fixture infant, outborn, whose dob was
  corrected after rows were saved, weighed in the order on some days and on the growth chart on others,
  with one day carrying both, a draft with another weight and a back-filled order. It mounts the strip,
  the Ward registry, the Calculator (new, back-fill, edit), the Dashboard log and Trend, Fenton and the
  Alerts page, and requires every weight shown to equal `currentWeight`, every today-DOL `liveDol` and
  every order DOL `entryDol`. Source checks (CRLF-normalised): no `lastWeighed(`, no `onWeightChange`,
  no stored `.dol` displayed. It must fail on `main` first.
- **CP page:** the setup form has a birth-date field and no DOL field; the Calculator it mounts receives
  `dol === D.dolAtDate({ dob }, order date)`; a Buddhist-era, future or after-the-order birth date is
  refused with `admissionDateIssue`'s message. Extends `verify-center-point-entry.cjs` or the new
  harness, whichever mounts the page more simply.
- **Updated for the API change, invariants kept:** `verify-tpn-calc-weight.cjs` (the saved `weight`
  column is still the entered weight, never the floor; the strip no longer shows a typed one),
  `verify-safety-fixes-0923.cjs` and `verify-error-boundary.cjs` (`currentWeight` replaces
  `lastWeighed` / `weightAtOrBeforeDol`, still null-safe).
- Build with `node tools/build.mjs`; run every harness against the sources and against `compiled/`.
