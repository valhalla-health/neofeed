# Nursing I/O form: spec, PDPA review and decisions

**UX roadmap #4, the big one.** Drafted 2026-09-24; decided by Pp the same day (§ 8); built the same day.

**Status: BUILT, SWITCHED OFF.** The backend (`gas-backend.gs`) and the frontend are in the repo and
harnessed. The backend ships dark: it goes live only when Pp sets the Script Property
**`NURSING_LOG_ENABLED` = `true`**, and that **waits for D7, the DPO's sign-off** (§ 6). Deploying
the code, including alongside an unrelated backend fix, switches nothing on. Until the switch is on,
the backend and the new frontend behave exactly like the old ones (§ 5.4). Items #1–#3 of the same
roadmap (alarm fatigue, admin census, mobile bed button) shipped in PR #111.

---

## 1 · The problem

- **A nurse who records urine output re-saves the whole TPN order.** Intake/Output lives inside the
  Calculator (Step 1's card: `ioInput`, `ioOutput`, `drainContent`, mL/day). So a nurse who records I/O
  also triggers the order's machinery: its revision, the Print gate, the edit lock, and even the
  "K 5 mEq/kg/d needs a reason" prompt, for an order they did not write. This was 2026-09-11 review P2.
- **Governance.** `canWrite` in `gas-backend.gs` let admin, doctor **and nurse** create, edit and
  Submit TPN orders. `PRD.md` § 2 already said that nurses "in practice" use the Calculator to record
  I/O and weight, not to prescribe. The access was wider than the job.

## 2 · What was built

| Part | What | Where |
|---|---|---|
| **Backend** | A `Nursing_Log` tab, 3 actions, `nursing` in the sync payload, and **D5**: a nurse's order write is refused | `gas-backend.gs` · `verify-nursing-backend.cjs` |
| **Frontend** | An **I/O ประจำวัน** card on each infant's Dashboard, with its form; the Calculator's Intake/Output **filled from it** on a new order (D4); a nurse's Calculator **computes but does not save** (D5) | `log.jsx`, `app.jsx`, `calculator.jsx`, `data.js`, both shells · `verify-nursing-frontend.cjs` |
| **Go-live** | Release the frontend and `clasp push` the backend in either order; both are inert. **After D7**, set `NURSING_LOG_ENABLED` = `true` (§ 5.4). | Pp |

A card and a form, not a new view: the Dashboard is where the ward already looks for an infant, it sits
under the identity strip, and a daily total (D1) is one small form, not a screen.

**Out of scope on purpose:** nursing notes, vital signs, medications, a nursing care plan. `PRD.md`
§ 5 says "not an EMR", and each of those is a step towards one. **The ward's chart stays the
record.** NeoFeed's I/O is a nutrition worksheet, and the form says so on screen.

## 3 · Data model: a `Nursing_Log` tab (A–M)

`ts | sessionId | ivInMl | enInMl | feedType | urineMl | drainMl | stoolCount | entryId | enteredBy |
lastModified | lastModifiedBy | appVersion`

- **One row per infant per date (D1: daily totals, no shifts).** `ts` is the morning the 24-hour total
  **closed**. The order dated X is filled from the record dated X: the order written that morning reads
  it as "the past 24 h". A second record for a date is refused with `DuplicateDate` and the existing
  `entryId`, as Daily_Log does, and the client says "open the existing one".
- **Blank ≠ 0.** A blank cell means *not recorded*; `0` means *measured, none*. The sync sends a blank
  as `null` (`_numOrNull`), never 0, and every total says "—" rather than add a blank as zero. This is
  the Calculator's own `NumField` / `typedRef` lesson (walkthrough § 5).
- **mL per 24 h, as measured.** Per-kg and mL/kg/h figures are derived on display through
  `D.ioDivisorG` (the same divisor as the Calculator's I/O card), never stored.
- **No weight column.** The form's weight goes to `Patient_Registry.weights` through `updateWeights`,
  exactly as the growth chart's MeasurementLogger saves it (`D.upsertWeight`). **One weight store**:
  the chart, "Wt now", the stale-weight alert and the Calculator all read it already.
- **`feedType` is a formulary key** (the `EN_DB` keys, plus `MIXED` for several), from a list in the
  form and checked against `^[A-Z][A-Z0-9_]{0,39}$` on the server. It is never free text. **There is
  no notes column** (§ 6, minimisation).
- **No status/void column.** An edit keeps its `entryId`, its date and its first author; a mistaken
  row is deleted by an admin, audited (D3).
- **Created on the first nursing save, at exactly 13 columns.** `insertSheet` makes 26, and Google
  counts empty grid cells against the 10 M-cell workbook cap (the `Audit_Log` lesson). A sync only
  reads: "no tab yet" is "no records yet", and a read never adds a tab to the live Sheet.

## 4 · Backend (Atlas)

| Action | Who | Guards |
|---|---|---|
| `logNursingEntry` | nurse, doctor, admin | registered patient · a real `YYYY-MM-DD`, at most 1 day past the ward's today (`_normaliseEntryDate`) · each mL 0–3000 per 24 h · stool a whole number 0–20 · feed key from the list · **at least one figure** · `_sheetSafe` / `_numSafe` · one row per date → `DuplicateDate` · Thai refusals · `Audit_Log` row |
| `updateNursingEntry` | nurse, doctor, admin | the above, plus the `expectedLastModified` conflict check and `_assertRowStillHolds` (Daily_Log's); the date and first author stay the row's |
| `deleteNursingEntry` | admin | `deleteNursingLog:start` written strictly **before** the row goes (no audit row, no delete), then the `Audit_Log` row |
| `getActivePatients` | as today | also returns `nursing[sessionId]`: every row for a patient in the sync window. A nursing row is about a tenth of an order row and there is one per infant per day (§ 7). |
| **D5** · `logDailyNutrition`, `updateDailyNutrition`, `publishLog` | **doctor, admin** | a nurse gets `Forbidden`: "พยาบาลใช้ Calculator ได้ แต่บันทึกหรือ Submit ใบสั่ง TPN ไม่ได้ — บันทึก I/O ที่ Dashboard". Registry edits and growth measurements stay nursing work. |
| `deletePatient` | admin | also removes that patient's `Nursing_Log` rows, and no one else's |

**The go-live switch, `_nursingEnabled()`:** the Script Property `NURSING_LOG_ENABLED` must be
exactly `"true"`. It is read per request, and an unreadable property reads as off. **Off, the
backend is the one before the nursing form:**
- the sync has no `nursing` key;
- the three nursing actions refuse with `NotEnabled`;
- D5 does not apply, so nurses save orders as before;
- no tab is created.

**On,** all of this table applies. `deletePatient`'s cascade runs either way, so erasure reaches rows
written while the switch was on.

Also: the column-drift guard (`_assertSchema`) and `onEdit`'s version bump cover `Nursing_Log`. **The
sync cache key names the payload's shape:** `sync2_` (was `sync1_`), with `+n` while the switch is
on. So neither a deploy nor a flip of the switch ever serves a payload of the other shape, which
would show nurses a Submit the server refuses (or hide one it accepts) for up to 5 minutes. A flip is
seen on the next sync, with no write needed.

Not checked on the server: "not before admission" (the form checks it, and the order path does not
check it either); "on the unit" (a discharged infant's last day can still be completed).

## 5 · Frontend (Jett)

### 5.1 The card (Dashboard, every role)

- **Today first:** "✓ วันนี้บันทึกแล้ว" / "วันนี้ยังไม่ได้บันทึก", and one button: **บันทึก I/O**,
  or **แก้ไข I/O วันนี้** once today is in.
- **The last 7 days, newest first,** each row showing: date · DOL · in (and the feed) · urine +
  mL/kg/h · drain · balance · stools · who saved it. A blank shows "—", never 0. A row opens that
  day's record. When there are more than 7 days the card says so ("แสดง 7 วันล่าสุด จาก N วัน").
- **Admin only:** a 🗑 on each saved row, behind a confirm (D3).

### 5.2 The form

- **Header:** name · bed, then a date (default today, ≤ today, ≥ admission; fixed when editing), with
  the DOL beside it, and the line "ใบสั่งของวันที่ X จะเติม Intake/Output จากยอดนี้".
- **Fields (D2):** weight (optional; it offers the weight already measured for that DOL), IV in,
  EN in, feed (a list), urine, drain, stools. The ward's bounds are shown before Save, in Thai.
- **A live sum:** in · out · balance, to 0.1 mL. The form states that a blank box means not recorded
  (not 0), and that the chart stays the record.
- **Errors in place.** A refusal, a `DuplicateDate` (which re-syncs) or an edit conflict (which
  re-syncs and names who) is shown in the form, and the form keeps what was typed. The one
  exception: once the I/O row has landed, the form closes even if the weight could not be sent
  (an earlier write's result is unknown). A second Save would be a second record for the date, so
  a toast says the weight is the one thing to re-type.
- **A tap outside the form closes it only while nothing has been typed.** On a phone the backdrop is
  the strip above a bottom sheet, one stray tap from losing a day's figures.
- **Nothing in browser storage.** The form keeps no draft, so there is no new key for `endSession`'s
  logout list to miss.

### 5.3 The Calculator (D4, D5)

- **D4, a new order only:** Input = IV + EN actually received, Urine = urine, Drain = drain, all
  taken from the nurses' record **for the order's date**. The fields stay editable, and a note says
  where the figures came from. A recorded 0 counts as entered for the required-field gate; a blank
  stays blank and the gate still asks for it. **Opening a prefilled form writes no draft.** Once
  filled, Input no longer tracks the prescribed total.
- **Never** on a saved order (its figures are its record), on Center Point, or on the quick calc.
- **A record that arrives after the form opened** is offered as one tap, not forced in. **A record
  corrected or deleted after the fill is flagged**, with a one-tap "ใช้ยอดล่าสุด" / "ล้างยอดที่เติมไว้".
  An order is not written on totals the ward has already corrected. **Restoring an unsaved draft**
  brings back what was typed: the note goes, and the record is offered again.
- **D5, a nurse:** no Save draft, no Submit, no publish, no **New log** on the Dashboard, no
  unsaved-order draft in browser storage, and no edit lock (a nurse computing is not "editing this
  order"). A note sits where the buttons were. Copy and Print still work on an order a doctor saved.

### 5.4 Switched on by the backend's switch, not by a release or a deploy

`nursingLive` follows the sync payload. It is on exactly while the payload carries `nursing`, which
the backend sends only while its switch is on, and that is also exactly when it refuses a nurse's
order write (D5). While the switch is off, the new frontend shows no card and nurses still save
orders, as today. So:

1. **Release the frontend** (`main → release`) and **`clasp push` the backend**, in either order,
   whenever convenient. Nothing changes on the ward.
2. **After D7, and once the frontend is released,** set `NURSING_LOG_ENABLED` = `true` (Apps Script
   → Project Settings → Script Properties). On the next sync the card appears and nurses stop saving
   orders, together.
3. **To switch it off,** delete the property. On the next sync the card goes, and nurses' New log and
   Submit come back. Records already written stay in `Nursing_Log`.

**Never switch it on while an old frontend is still being served.** An old frontend has no I/O card,
and its nurses would be refused order saves with nowhere to record I/O.

## 6 · PDPA review (Vera): a DPIA-lite

This adds **a new flow of sensitive personal data** (health data, PDPA Sec 26), so it needs a
recorded assessment before go-live, not after.

| Question | Answer / condition |
|---|---|
| Purpose | Treatment only: the infant's fluid and nutrition management. Nothing secondary. |
| Lawful basis | The same basis as `Daily_Log`, for treatment under professional confidentiality. ⚠️ **The repo cites it as "Sec 26(6)"** (`gas-backend.gs`, `REFERENCE.md` § PDPA, `PRD.md` § 5, `app-walkthrough.md` § 6). **The Act's health-care exception is Sec 26(5)(a)** (medical diagnosis, health care, medical treatment, under professional confidentiality). **The DPO should confirm the citation** (part of D7), and then every place should be corrected together. Nothing new cites it. |
| Minimisation | Only nutrition-relevant fields (§ 3). No free text and no names: `sessionId` only, the accepted pseudonym residual risk. The feed is a key, checked on the server. |
| Accountability (Sec 39) | Every write adds an `Audit_Log` row, and a delete's start row is written before anything is destroyed. `enteredBy`/`lastModifiedBy` hold **staff** personal data, **for accountability only**; the card shows the name before the `@`, as the Daily log shows who submitted. **No per-nurse metric, ever** (`PRD.md` § 6 constraint 2). Nothing aggregates nursing data, and the admin census does not read it. |
| Access | Enforced server-side: nurse/doctor/admin write, admin deletes (D3). The Sheet's ACL stays owner-only (`BACKLOG.md` guardrail). |
| Retention | **D6 (Pp): kept indefinitely for now, pending discussion** ("เก็บไว้ตลอดไปก่อน รอคุย"). This inherits the open "no retention policy" item and makes it bigger. One period for `Daily_Log` + `Nursing_Log` together, set with the DPO. |
| Cross-border (Sec 28) | Same Google Workspace as today. The open Sec 28 item is unchanged, but the volume grows. |
| Devices | Nothing new on the device: the form stores nothing, and a nurse's Calculator keeps no draft (§ 5). |
| Research / QI | Not covered. Any export needs its own basis and, if it is research, the KCMH IRB. |
| Notice | The DPO checks that the hospital's privacy notice for inpatients covers nursing observations held in a hospital-approved tool. |

**Gate: `NURSING_LOG_ENABLED` stays unset until D7** (the DPO's sign-off on this table, the 26(5)(a)
citation included). Deploying the code and releasing the frontend before then is fine: switched off,
neither collects anything (§ 5.4).

## 7 · Red team (Omen), cost (Sindri)

| Risk | Plan |
|---|---|
| Wrong infant on a phone | The card lives on that infant's Dashboard, under the identity strip; the form's header names the infant and bed. |
| A total dated a day off | The date is chosen, not inferred from the clock, and the form says which order it feeds. No shift arithmetic (D1). |
| Double documentation: NeoFeed and the chart disagree | The chart stays the record (§ 2), and the form says so. A figure a nurse later corrects is flagged on an open order (§ 5.3). |
| A blank counted as 0 | Blank ≠ 0, end to end (§ 3), in the payload, the card, the sums and the Calculator's gate. |
| Two devices, one record | `DuplicateDate` on create, `expectedLastModified` conflict on edit; both are shown in the form and both re-sync. |
| **The nursing backend goes live with an unrelated deploy, before D7** | It ships dark: nothing happens until `NURSING_LOG_ENABLED` is set by hand (§ 4). A backend batch is already waiting on a `clasp` deploy (`CHANGELOG.md` § 2026-09-24 (2)–(3)), which is why this switch exists. |
| **Nurses lose order saves before the I/O form exists for them** | D5 and the form come on together, with the switch (§ 5.4). The sync cache key carries the switch, so no stale payload bridges a flip (§ 4). |
| Auto-fill hides that a figure is not a prescription | The note on the Calculator's I/O card says where it came from; every field stays editable; a saved order is never touched. |
| Ward Wi-Fi dead zones | A clear failed-save error in the form. No silent offline queue: the app has no service worker on purpose (walkthrough § 7). |
| **Cells (Sindri)** | 1 row × ~45 infants × 365 d ≈ 16 k rows/yr × 13 columns ≈ **0.21 M cells/yr**. |
| **Sync payload (Sindri)** | One ~250-byte row per infant per day on the unit, about a tenth of an order row, which carries its `calcInput` JSON. It rides the existing 5-minute shared cache. |
| **Quota** | One `doPost` per save (two with a weight), on the same path as an order save. No new triggers. |

## 8 · Decisions (Pp, 2026-09-24)

| # | Decision | Pp's answer | Built as |
|---|---|---|---|
| **A** | The three behaviour changes in PR #111 | "ส่วน A OK" | accepted |
| **D1** | Shifts, and which 24 h a total covers | "เอาแค่ยอดประจำวัน" · "Input ในใบ order เป็นเหมือนยอดที่จะคำนวณในวันนั้นเฉยๆ แต่จะ prefill โดยใช้ข้อมูล intake ที่ได้รับจริงใน 24 ชม. ที่ผ่านมาได้" | one daily total per infant, dated the morning it closed (§ 3) |
| **D2** | Fields | "default" | weight · IV in · EN in (+ feed) · urine · drain · stools; no residual/vomit |
| **D3** | Who writes | "admin ทำได้ทุกอย่าง" | nurse, doctor and admin write; admin also deletes |
| **D4** | Calculator link | "calculator ให้เติมเอง เพราะเหมือนมาใช้เครื่องคิดเลขเฉยๆ" | **read as "the Calculator fills it in itself"**: a new order is prefilled and stays editable (§ 5.3). *If Pp meant "the prescriber types it themselves", switching to the one-tap offer that already exists for a late record is a one-line change.* |
| **D5** | Narrow order writes to prescribers | "พยาบาลบันทึกหรือ submit ไม่ได้ ได้แค่ใช้ calculator" | now, not after 2 weeks: server-side refusal plus a compute-only Calculator, switched on together (§ 5.4) |
| **D6** | Retention | "เก็บไว้ตลอดไปก่อน รอคุย" | indefinite for now; open with the DPO (§ 6) |
| **D7** | DPO sign-off | "รอคุย" | **open. `NURSING_LOG_ENABLED` stays unset until it is given.** |

## 9 · Tests (Logic)

- **`verify-nursing-backend.cjs`** (`gas-vm-sandbox`, 86 assertions): the go-live switch (off = the old
  backend, a flip seen on the next sync, erasure either way, unreadable = off); the tab created on the
  first save at 13 columns and never by a sync; D3 role gates; D5 order refusals, with registry and weight writes
  still open to nurses; bounds, whole stools, the feed key, an empty record, an unregistered patient
  and dates, all in Thai; `DuplicateDate`, edits keeping date and author, conflicts; the sync payload
  (blank → null, 0 → 0, window-scoped, fresh on the next sync, never a pre-deploy cached payload);
  audit rows, including the strict delete-start; formula injection; the `deletePatient` cascade; the
  column-drift guard. It fails on `68e302f`.
- **`verify-nursing-frontend.cjs`** (jsdom and the real `<App/>` against a fake Apps Script; Chromium
  when playwright is installed; 222 assertions, 198 without a browser):
  - the helpers;
  - the form: blank ≠ 0 in the payload, bounds, no free-text box, weight-only saves, the offered
    weight, in-place errors, the backdrop guard, nothing in browser storage;
  - the card;
  - D4 (prefill, no draft on open, saved orders untouched, late / corrected / deleted records);
  - D5;
  - the App before and after the backend serves `nursing`, for nurse, doctor and admin, including
    `DuplicateDate`, the conflict and the switch both ways;
  - layout at 280–1280 px.

  It fails on `b64c7fa` (the backend commit) in every scenario except the one that pins "nothing
  changes until the switch is on".

Both run in CI against the sources and against `compiled/`.
