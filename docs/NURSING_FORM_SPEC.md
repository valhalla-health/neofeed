# Nursing I/O form: spec, PDPA review and decisions

**UX roadmap #4, the big one.** Drafted 2026-09-24. Status: **DRAFT. Nothing in this document is built
yet.** Phase 1 is blocked on the decisions in § 8, all of which are Pp's to make. Items #1–#3 of the same
roadmap (alarm fatigue, admin census, mobile bed button) shipped in the same PR as this draft.

---

## 1 · The problem

- **A nurse who records urine output re-saves the whole TPN order.** Intake/Output lives inside the
  Calculator (Step 1's card: `ioInput`, `ioOutput`, `drainContent`, mL/day). So a nurse who records I/O
  also triggers the order's machinery: its revision, the Print gate, the edit lock, and even the
  "K 5 mEq/kg/d needs a reason" prompt, for an order they did not write. This was 2026-09-11 review P2,
  and it is still in `BACKLOG.md` § Later.
- **The ward records I/O per shift, but NeoFeed stores it per day.** One daily total is typed by hand,
  so the three shift figures it came from are lost. Nothing checks that the total matches them.
- **Governance.** `canWrite` in `gas-backend.gs` lets admin, doctor **and nurse** create, edit and
  Submit TPN orders. `PRD.md` § 2 already says that nurses "in practice" use the Calculator to record
  I/O and weight, not to prescribe. The access is wider than the job.

## 2 · Scope and phases

| Phase | What | Needs |
|---|---|---|
| **0 (this PR)** | This spec, the PDPA review and the decisions list | nothing |
| **1** | Backend: a `Nursing_Log` tab, 3 actions, and the sync payload. Harnessed. | § 8 answers, then a `clasp` deploy (Pp) |
| **2** | Frontend: an **I/O** view per infant (per-shift form + 24 h totals). The Calculator's I/O card offers the nursing totals as a **one-tap suggestion**, never an auto-fill. | Phase 1 live |
| **3** | Narrow TPN-order writes to prescribers. On phones, nurses' **Calc** tab becomes **I/O**. | ≥ 2 weeks of Phase 2 in use, plus Pp's governance decision (D5) |

**Out of scope on purpose:** nursing notes, vital signs, medications, a nursing care plan. `PRD.md`
§ 5 says "not an EMR", and each of those is a step towards one. **The ward's chart stays the
record.** NeoFeed's I/O is a nutrition worksheet, and the form says so on screen.

## 3 · Data model: a new `Nursing_Log` tab (A–P)

`ts | shift | sessionId | weightG | ivInMl | enInMl | feedType | urineMl | drainMl | stoolCount |
entryId | enteredBy | lastModified | lastModifiedBy | appVersion | status`

- **One row per (sessionId, date, shift).** A second save for the same shift becomes an edit of the
  first. This mirrors Daily_Log's one-entry-per-date guard (`DuplicateDate`): the server refuses with
  a new `DuplicateShift` code, and the client turns that into "open the existing one".
- **Blank ≠ 0.** A blank cell means *not recorded*; `0` means *measured, none*. The totals say
  "2 of 3 shifts recorded" instead of adding a missing shift as zero. This is the Calculator's own
  `NumField` / `typedRef` lesson (walkthrough § 5).
- **mL per shift, as measured.** Per-kg and mL/kg/h figures are derived on display through
  `D.ioDivisorG`, never stored. That is the rule the I/O card already follows.
- **`feedType` comes from a fixed list** (the `EN_DB` keys, plus EBM/DBM). It is never free text.
  **There is no notes column** (§ 6, minimisation).
- **`status`: `active` | `voided`.** An edit keeps its `entryId`, and a mistaken row is voided rather
  than deleted. Only admin can delete, as with Daily_Log.
- **Create the tab at exactly 16 columns.** `insertSheet` makes 26, and Google counts empty grid cells
  against the 10 M-cell workbook cap. That is the `Audit_Log` lesson in `BACKLOG.md` § Now; § 7 has
  the arithmetic.

## 4 · Backend (Atlas)

| Action | Who | Guards |
|---|---|---|
| `logNursingEntry` | nurse, doctor | patient exists and is on the unit · date not in the future (1 day of slack, as the admit-date check allows) and not before admission · `shift` ∈ enum · bounds: weight 200–8000 g (the order bounds), each mL 0–1000 per shift, stool 0–20 · strings through `_sheetSafe` · one row per shift → `DuplicateShift` · Thai refusals (BE-3's rule) · `Audit_Log` row |
| `updateNursingEntry` | nurse, doctor | the above, plus the `expectedLastModified` conflict check (Daily_Log's) and a row guard that the entryId is still on that row |
| `deleteNursingEntry` | admin | `Audit_Log` row |
| `getActivePatients` (extended) | as today | also returns `nursing[sessionId]`, **last 3 days only** (§ 7). Older days come from a separate `getNursingLog(sessionId, from, to)` when a screen asks. |

The actions never write to `Daily_Log` or `Patient_Registry`. A harness asserts both tabs are
byte-identical before and after.

## 5 · Frontend (Jett)

- **An I/O view** in `PATIENT_VIEWS`, so the identity strip (name · bed · DOL) sits above it. Wrong
  infant is the #1 risk on a phone (§ 7).
- **A date, then three shift cards** (เช้า / บ่าย / ดึก). The current shift is pre-selected from the
  clock, including the midnight edge (§ 8 D1). Each card shows who saved it and when.
- **A 24 h total row:** in, urine, drain, balance, mL/kg/d, and urine mL/kg/h. It shows "2/3 เวร"
  while a shift is missing, never a silent partial sum.
- **The Calculator's I/O card, Phase 2:** "ตามบันทึกพยาบาล 24 ชม.: Input X · Urine Y · Drain Z —
  [ใช้ค่านี้]". One tap copies the totals. Nothing fills itself, and the order's own fields stay the
  order's record.
- **No PHI in `localStorage`.** If an unsaved-shift draft is ever added, it lives under
  `neofeed_nurse_`, and that prefix joins `endSession`'s list in `app.jsx`. The list is explicit
  (`neofeed_calc_`, `neofeed_acked_`, `neofeed_draft_`), not a sweep of every `neofeed_*` key, so a
  new prefix that is not added there stays on a shared workstation after logout.

## 6 · PDPA review (Vera): a DPIA-lite

This adds **a new flow of sensitive personal data** (health data, PDPA Sec 26), so it needs a
recorded assessment before go-live, not after.

| Question | Answer / condition |
|---|---|
| Purpose | Treatment only: the infant's fluid and nutrition management. Nothing secondary. |
| Lawful basis | The same basis as `Daily_Log`, for treatment under professional confidentiality. ⚠️ **The repo cites it as "Sec 26(6)"** (`gas-backend.gs:58` and `:3101`, `REFERENCE.md` § PDPA, `PRD.md` § 5, `app-walkthrough.md` § 6). **The Act's health-care exception is Sec 26(5)(a)** (medical diagnosis, health care, medical treatment, under professional confidentiality). **The DPO should confirm the citation**, and then all five places should be corrected together. It is not changed in this PR. |
| Minimisation | Only nutrition-relevant fields (§ 3). No free text and no names: `sessionId` only, which is the accepted pseudonym residual risk. |
| Accountability (Sec 39) | Every write adds an `Audit_Log` row. `enteredBy` holds **staff** personal data, **for accountability only**. **No per-nurse metric, ever** (`PRD.md` § 6 constraint 2): a harness serialises every aggregate and fails on an `@`, which is `verify-usage-metrics.cjs` test 9's pattern. |
| Access | Enforced server-side: nurse/doctor write, admin delete. The Sheet's ACL stays owner-only (`BACKLOG.md` guardrail). |
| Retention | **This inherits the open "no retention policy" item and makes it bigger.** Pp and the DPO decide one period for `Daily_Log` + `Nursing_Log` together (D6). |
| Cross-border (Sec 28) | Same Google Workspace as today. The open Sec 28 item is unchanged, but the volume grows. |
| Devices | Nothing on the device beyond the existing keys. Any new key's prefix goes on `endSession`'s logout list (§ 5). |
| Research / QI | Not covered. Any export needs its own basis and, if it is research, the KCMH IRB. |
| Notice | The DPO checks that the hospital's privacy notice for inpatients covers nursing observations held in a hospital-approved tool. |

**Gate:** Phase 1 does not deploy until D6 (retention) and D7 (DPO sign-off on this table) are
answered. Building it before then is fine; deploying it is not.

## 7 · Red team (Omen), cost (Sindri)

| Risk | Plan |
|---|---|
| Wrong infant on a phone | Identity strip above the form. Save's confirm names bed + name + shift. |
| A บ่าย-shift entry typed at 00:10 gets dated tomorrow | The ward date belongs to the **shift**, not to the clock at save time. Harness the 23:59 / 00:01 / 07:59 / 08:01 edges. |
| Double documentation, where NeoFeed and the chart disagree | The chart stays the record (§ 2), and the screen says so. NeoFeed never shows a nursing figure as the order's I/O without a tap. |
| Counting a missing shift as 0 | Blank ≠ 0 (§ 3). Totals show n/3. |
| Two nurses on one shift | `expectedLastModified` conflict, the same banner as the order's. |
| Phase 3 removes nurses' order access before the form is trusted | Phase 3 is gated on ≥ 2 weeks of use, and on Pp. |
| Ward Wi-Fi dead zones | A clear failed-save error. No silent offline queue: the app has no service worker on purpose (walkthrough § 7). |
| **Cells (Sindri)** | 3 rows × ~45 infants × 365 d ≈ 49 k rows/yr. At 16 columns that is **0.8 M cells/yr**; at `insertSheet`'s 26 it would be 1.3 M. Trim to 16 (§ 3). |
| **Sync payload (Sindri)** | 3 days × 3 shifts × ~45 infants ≈ 400 small rows per 4-min poll. The history is on demand. |
| **Quota** | One `doPost` per save, on the same path as an order save. No new triggers. |

## 8 · Decisions for Pp (defaults proposed; reply "ตาม default" to take them all)

| # | Decision | Proposed default |
|---|---|---|
| **D1** | Shifts, and which 24 h an I/O total covers | เช้า 08–16 · บ่าย 16–24 · ดึก 00–08. The I/O day **D = เช้า(D) + บ่าย(D) + ดึก(D+1)**. It closes at 08:00, before rounds, and is offered to the order dated D+1. (The order's "Input" currently defaults to *today's prescribed* fluid, which is also an open question in `BACKLOG.md`.) |
| **D2** | Fields in Phase 1 | weight · IV in · enteral in (+ feed type) · urine · drain · stool count. Add gastric residual / vomiting? Default **no**. |
| **D3** | Who writes | nurse + doctor; admin deletes only |
| **D4** | Calculator link | the totals are a one-tap suggestion, never an auto-fill |
| **D5** | Narrow TPN-order writes to prescribers | Phase 3, after ≥ 2 weeks of the form in use |
| **D6** | Retention | one period for `Daily_Log` + `Nursing_Log`, decided with the DPO |
| **D7** | DPO sign-off | on § 6, including the 26(5)(a) citation |

## 9 · Test plan (Logic)

- `verify-nursing-backend.cjs` (`gas-vm-sandbox`): role gates; one row per shift; bounds and Thai
  refusals; the date guard; `_sheetSafe`; audit rows; the conflict check; the tab created at 16
  columns; `Daily_Log`/`Patient_Registry` byte-identical after every action.
- `verify-nursing-form.cjs` (jsdom + Chromium): blank ≠ 0; shift defaulting at the four clock edges;
  totals and per-kg through `ioDivisorG`; a duplicate opens the existing shift; the Calculator
  suggestion never fills without a tap; 280–430 px fit.
- `verify-nursing-pdpa.cjs`: no `@` in any aggregate; no free-text field accepted; logout clears
  `neofeed_nurse_` (the prefix is on `endSession`'s list); no name in any admin/census view of nursing data.

Each fails against the tree before its phase, per `TDD.md`.
