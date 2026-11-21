# Design: paediatric wards

## Context

See `proposal.md` for why. Read from `main` at `2c54f26` (2026-11-21), and checked against the code
by a reviewer who had not seen the draft; its findings are folded in below. Code is cited by name,
not line, so the names can be searched as the files move.

- **Wards are derived from the bed label**, and the pattern is written by hand in many places:
  `BED_OPTIONS`, `bedWard`, `wardGroup`, `normalizeBed` (`data.js`); `WARD_RANK`, `WardGate`,
  `WARD_TPN_WARDS`, the transfer dialog's `WARDS`, the registration default bed and several
  ward-name ternaries (`registry.jsx`); the census (`app.jsx`); `PHARMACY_WARD_BED`, `_normBed`,
  `USAGE_WARDS`, `QI_SUBMIT_WARDS` (`gas-backend.gs`); `WARD_BED`, `WARD_GROUPS`, `wardLabel` and
  the bed sort (`tpn-room-core.js`). The backend blanks a bed outside its pattern, and the TPN room
  page then refuses to print the order.
- **A patient with no bed on the server is a real infant** parked between beds; `patientWard`
  (`data.js`) lists them under the ward of the bed they left. Test patients have a `TEST-` id and
  never leave the browser (`handleAddPatient`, `app.jsx`).
- **Access is by role only.** A doctor, nurse or admin gets every patient in the sync window. The
  sync reply is cached under a key with no caller in it (`_syncCacheKey`, `gas-backend.gs`), and
  `login` embeds the same reply. There is no action that writes `Staff`, and no Staff screen.
- **Rules are keyed to DOL and weight tier** (`TPN_TARGETS`, `ENTERAL_TARGETS`, `TARGETS`, `data.js`).
  The backend accepts GA 22–44 wk, BW 200–6,000 g, DOL 1–400, weight 200–8,000 g (the `_checkRange`
  calls in `gas-backend.gs`), and takes DOL from the client; it derives no age itself. When the date
  of birth is blank or not credible the client falls back to the admission date or DOL 1. The dosing
  weight is floored at birth weight whenever the current weight is below it.
- **Amino-acid product and the dead-space default are keyed to ward**: `OLDER_CHILD_WARDS`,
  `isNewbornUnit`, `aaProductsFor`, `defaultDeadVolFor` (`data.js`). Adding a ward there would offer
  Aminoplasmal 15 % to an infant of 3 months, against its label (under 2 years).
- **One constants line** runs through `CONSTANTS_VERSION` (`data.js`), the backend's
  `MIN_SUBMIT_CONSTANTS_VERSION`, `calcMoved`, the stale-tab check, `printJson`, the TPN room page's
  version compare (`tpn-room-core.js`) and `tools/build.mjs`.
- **Quick calc** has no patient and no date of birth, and uses newborn bands (`SCRATCH_PATIENT`,
  `app.jsx`). **Center Point** saves to Center Point, not to the GAS backend (`centerPoint.save`,
  `calculator.jsx`), and sends BW, GA and date of birth only.
- Pp's standing decisions (2026-11-17): one app and one dashboard with ward configuration; a separate
  children's rule set chosen by age; NICU and SCN cards never change for an older-children change.

## Goals / Non-Goals

**Goals**

- Adding a ward is a data change in one place, checked by one harness.
- A PR in this change can prove that NICU and SCN patients' orders did not move.
- A child cannot get a rule set written for another age, whatever bed they are in.
- Every paediatric guard is traceable to a source and a signature.

**Non-Goals**

- Choosing the paediatric numbers. This design carries where they live and how they are admitted.
- Splitting `calculator.jsx`, or making the TPN calculation a pure function.
- Capacity (one lock). Measure after the first ward; see Risks.

## Decisions

### D1. A ward table in `data.js`, with checked copies in the backend and the TPN room page

`WARDS` is an ordered list: `{ key, label, sub, beds[], stickerLabel, deadVolMl, tile }`. It carries
no clinical flag. Everything in the first Context bullet derives from it, including bed
normalisation, the transfer modal, the usage log's and the QI export's ward names, and the sticker's
ward label. `gas-backend.gs` and `tpn-room-core.js` cannot import `data.js` (Apps Script; a page the
pharmacy role loads without the app), so each keeps a generated copy, and a blocking check fails when
a copy's digest differs from the source.

*Dropped:* a `Wards` sheet tab read at login. It makes a ward a live edit with no review and no
harness, and beds feed the pharmacy bed filter. *Dropped:* a ward column on the patient. The bed
already decides the ward; a second field can disagree with it.

The dead-space default stays a property of the ward (its giving set), as Pp set it for NICU and SCN
on 2026-09-18; a new ward's value comes from gate 0.6. It is not part of a rule set.

### D2. Ward scope is enforced on the server, for every path that carries a patient field

`Staff` gains a `wards` column (ward keys, or `*`), read by header. Admin is `*` by role; pharmacy is
unchanged. A patient's ward on the server is the ward of their bed, or of the bed they last left
while parked. A patient with no bed and no last bed, or a bed in no ward, is returned to admins
only; the migration lists such rows so an admin gives them a bed first.

The check covers: the sync and the copy `login` embeds; the duplicate reply at registration; the
bed-conflict reply; the order lock (acquire and release); the conflict replies of
`updateDailyNutrition` and `publishLog`; and every write in `WARD_LIST_WRITES`, `updatePatient`,
`updateWeights` and the nursing actions. A reply about a patient outside the caller's wards names no
one: a bed conflict says the bed is taken, a duplicate says a matching record exists in another ward.
The check fails closed when the registry cannot be read. The sync cache key includes the caller's
ward set, and a write drops every ward's cached reply.

A new backend action lets an admin set an account's wards, audited; the admin page gets the control.
The migration fills existing doctor and nurse accounts with NICU and SCN and is run, and checked,
before the backend version that filters is made live. An account created later starts with no ward.

The ward page is the view of this: the caller's wards, then ทดสอบระบบ (browser-only test patients).

*Dropped:* filtering in the frontend only. The ward buttons are a view today; the data still reaches
the device.

### D3. The rule set is chosen by age at admission, and fixed for that admission

`ruleSetFor(patient)` returns `"newborn"` or `"paediatric"` from the child's age on the admission
date of the registry record. It does not change while that record is active. Every place that reads
`isNewbornUnit`, a target table, an input range or a product list goes through it.

Why fixed: an age line under the present DOL-400 limit would otherwise move a long-stay NICU infant
onto paediatric cards on the day the line is crossed, which Pp's NICU-and-SCN rule forbids, and a
child would change bands overnight. A child admitted past the line gets the paediatric set in any
bed, NICU and SCN included; that is the one way a newborn-unit card can differ after this change,
and it is P2 for Pp to accept.

Date of birth: the paediatric set requires a credible date of birth (not blank, not in the future,
not after admission), checked on the server at registration from this change on. A record that
already exists with no credible date of birth stays on the newborn set, as today. The server stores
the rule set on the registry record when it is first decided, derives it again from the date of
birth and admission date on every order, and refuses an order when the two differ; a corrected date
of birth that would change the set is refused unless an admin makes it and re-saves the orders.

Until the paediatric set is signed, `ruleSetFor` has only the newborn branch and the present limits
stay as they are. That is how group 3 moves no figure.

Quick calc has no patient. It keeps the newborn rules and says so in its heading; once a signed
paediatric set exists it asks for the age group first. Center Point's entry is newborn-only: the form
refuses there when the age falls outside the newborn set, since the GAS backend never sees that
order.

*Dropped:* by ward (a newborn boarded in a paediatric ward, or the reverse, gets the wrong rules).
*Dropped:* by weight alone. *Dropped:* by age on each order's date (the reason above).

### D4. The paediatric rule set is its own tables and its own version

`PAED_*` tables sit beside the newborn ones; no newborn table gains a row. `CONSTANTS_VERSION`
stays the newborn line. `PAED_CONSTANTS_VERSION` covers the paediatric set. A saved order and its
`printJson` record the set and the version; `calcMoved`, the backend's Submit minimum, the stale-tab
check, the TPN room page's compare and the version file `tools/build.mjs` writes each read the line
of the order's own set. A paediatric rule change therefore asks no NICU order to re-save.

*Dropped:* one version line for both sets: one minimum cannot hold two independent histories.

### D5. How a paediatric value is admitted

Each guard is a `CR-P-<NAME>` block in `.claude/skills/neofeed-clinical-rules/SKILL.md` with its
source (author, recommendation or table, page), its kind (stop, critical, caution, band, cap), and
synthetic cases that `test/verify-clinical-rules.cjs` runs. A value enters the code when: its row in
`guideline-values.md` has been read against the source by an agent that had not seen the work; the
rule owner and Pp have signed the block; the TPN pharmacist has checked product and stock rows.
A parameter with no signed value is not graded, and its tile says "ยังไม่มีเกณฑ์".

Nothing is inherited. Every check the newborn set makes, the ones with no age key included (GIR,
dextrose, peripheral osmolarity, K⁺ in the bag, the bottle, zinc, NPE per gram of amino acid, the
enteral bands, MEN, feeds per day, the No TPN floor, the typed-weight difference, oral supplements
and vitamin D, pump hours, weight gain and regain, the "TPN ทั้งหอ" flags, and the server's per-kg
plausibility bounds), gets a signed paediatric value or a signed "not applicable".

### D6. Fields that are newborn-only are switched by rule set

GA, PMA, corrected age, Fenton, the Sunday length and head prompts, twin letters, the birth-weight
floor on the dosing weight and the preterm flags on "TPN ทั้งหอ" belong to the newborn set; a missing
GA means preterm only under that set. On the paediatric set: registration needs a date of birth and
a weight, not GA or BW; the dosing weight is the one the prescriber enters (P3); age prints as years
and months; the growth chart is hidden until a reference is chosen (P3).

Birth weight does two jobs outside the calculation: the duplicate check at registration, and the
figure the TPN room uses to tell two orders apart (it holds no name or date of birth). The
paediatric set needs a replacement for each (P7).

### D7. Rules for a clinical group: long-term PN, intestinal failure, IFALD

Pp, 2026-11-21: the paediatric wards order much of their TPN for short bowel syndrome, intestinal
failure and PN-associated liver disease, and these children may need rules of their own. The
guidelines treat them apart from the age bands (lipid dose and emulsion in cholestasis, cycling,
copper and manganese, sodium and zinc with high stoma losses, long-term monitoring);
`guideline-values-if.md` collects what they print.

A group rule is switched by a **PN context**, never by reading the diagnosis text. A context adds
or tightens guards on top of the age band's; it never loosens a stop. Each rule is a `CR-P-` block
admitted the way D5 says.

The app already holds the structured fields a context can come from (`release`, read 2026-11-21):

- **"Indication for PN"** on the patient record: one dropdown, one value, eight choices (Short bowel
  syndrome, Motility disorder, Mucosal disease, Preterm infant, NEC, Post-surgery, Feeding
  intolerance, For supplementation; `PN_INDICATIONS`, `data.js`). Cholestasis is not among them, and
  a child with two indications can record only one.
- **Liver Dysfunction** and **Renal Dysfunction**: two ticks beside it.

All three are saved and printed on the order, and no calculation reads them today. So the contexts
build on them instead of adding a parallel field. The indication stays one choice for now, and
the prescriber types anything further as free text (Pp, 2026-11-21: "เลือกได้ตัวเดียวไปก่อน
ยกเว้นพิมพ์เพิ่มใน free text"); free text switches no context. The system does not decide which
indication a child has or map one indication onto another: the context follows the indication the
prescriber chose ("Indication แล้วแต่แพทย์เลือก ไม่ตัดสินให้"). Cholestasis is the existing Liver Dysfunction tick (Pp, 2026-11-21:
"cholestasis ใช้ช่องติ๊ก Liver Dysfunction ที่มีอยู่"), because it is a complication of PN and not a
reason to start it. The tick therefore starts to show a message; today it only prints. The
registry column, its 60-character limit, the printed line and the QI export's indication code keep
holding one value. An order saves the contexts it was
graded under, so a reopened order shows the same messages after the patient record changes. The
contexts themselves already print (the indication and the Liver Dysfunction tick are on the order
form today); a context's message is for the prescriber's screen unless its rule says it prints.

**The cholestasis context, as Pp decided it on 2026-11-21** (her four answers to the points where
the guidelines disagree; each becomes a signed rule block before it is coded):

1. **Threshold: 2.** Cholestasis means conjugated bilirubin of 2 mg/dL, the line Modi 2022 (ASPEN)
   prints for IFALD ("2 mg/dl (34 µmol/L) sustained for 2 weeks", after at least 2 weeks of PN,
   without sepsis). NeoFeed stores no laboratory value, so the number is the definition shown beside
   the Liver Dysfunction tick, and the prescriber applies it. *Dropped:* 1.2 mg/dL (Lacaille 2015's
   red flag) and 3 mg/dL (some centres).
2. **Lipid: no enforced number when the emulsion is SMOF** ("ถ้าใช้ smof ไม่มีเลขบังคับ"). The ward's
   lipid is SMOF 20 %, so the context adds no lipid-dose limit. *Dropped:* Wales 2014's ≤ 1 g/kg/d,
   which is for soybean emulsion.
3. **Manganese: the order says to stop it** (Pp, later the same day, replacing her first answer of
   a copper and manganese caution: "ถ้าเป็น cholestasis ให้แจ้งไปเลยว่าให้หยุดแมงกานีส ให้พิจารณา off
   Peditrace แล้วให้ zinc แทน"). With the context set and a trace-element product that carries
   manganese on the order, the form states: stop manganese; consider taking Peditrace off and giving
   zinc in its place. This follows ESPGHAN 2018 R 7.18 (parenteral manganese "should be
   discontinued" in cholestasis). It is a message on the order form, not a stop: Peditrace is a
   fixed mixture, so the prescriber decides whether it comes off. *Dropped:* the copper and
   manganese caution alone; blocking Save or Submit.
4. **Cycling: not enforced** ("ไม่บังคับ"). No rule on infusion hours for newborns or by weight.

Pp, 2026-11-21, on the message: it goes on to warn that taking Peditrace off also removes copper,
selenium and iodine ("เตือนต่อ"), and it shows on the prescriber's screen only, not on the printed
order ("แสดงแค่บนจอแพทย์"). ESPGHAN 2018 keeps copper in cholestasis with monitoring, which is why
the warning matters. Addamel N triggers the message as Peditrace does ("ขึ้นกับ Addamel N ด้วย").

The wording Pp accepted on 2026-11-21 ("Ok ตามนั้น"), to be carried into the signed rule blocks:

- Cholestasis: "Liver dysfunction: ควรหยุด manganese · พิจารณา off Peditrace/Addamel N แล้วให้ zinc แทน ·
  ถ้า off จะไม่ได้ copper, selenium และ iodine ด้วย"
- Short bowel syndrome: "Short bowel syndrome: เมื่อ stoma ออกมาก ให้ดู sodium และ zinc เพิ่มเติมจากปกติ"
 The zinc that replaces it is ordered in
the existing ZnSO₄ field and is held to `CR-ZN-MAX` as today. **The intestinal-failure context, as Pp decided it on 2026-11-21:** it is the existing indication
"Short bowel syndrome" (Pp chose this over adding an "Intestinal failure" choice to the list), and
it gives advice, no limit ("intestinal
failure ให้ขึ้นเป็นคำแนะนำ ว่าให้ดูโซเดียมและซิงค์เพิ่มเติมจากปกติ เมื่อ stoma ออกมาก"). With the context
set, the form advises looking at sodium and zinc beyond the usual when stoma output is high. It
changes no band, colour or limit, and blocks nothing. The guidelines print no dose to code here:
ESPGHAN 2018 says to replace the losses and that zinc needs rise with ileostomy losses, without a
figure; Norsa 2023 gives a urinary sodium target for short bowel. Those rows are in
`guideline-values-if.md` and wait for their second read before the advice cites them. A child with
a motility disorder or mucosal disease and a stoma, chosen under that indication, does not get the
advice: accepted with this choice. *Not chosen for this context:* a ninth "Intestinal failure"
choice; the long-term-PN trace-element limits.

*Dropped:* inferring the group from the diagnosis field (free text, and wrong silently).
*Dropped:* a separate rule set per diagnosis (a child with SBS is still in an age band).

The newborn set gets the intestinal-failure and cholestasis contexts too (Pp, 2026-11-21: "ของ
newborn ถ้ามี indication เป็น intestinal failure หรือ cholestasis ก็ให้ใช้การ์ดเข้มขึ้นแบบนี้ได้"). It is a
change made for the newborn units, so it ships in its own PR (tasks group 7) with its own `CR-`
blocks from the neonatal rows of `guideline-values-if.md`, signed by Pp. A NICU or SCN order with no
context set stays exactly as it is, which the no-move proof (D8) checks; an order with a context
shows the tighter guards. It needs none of the paediatric gates and can come before or after them.

### D8. The newborn no-move proof

Every PR in this change runs `tools/calc-compare.cjs` on the newborn cases against `main` and
attaches the result, and adds to `test/verify-newborn-unmoved-*.cjs` what `calc-compare` does not
cover: Quick calc, a reopened and a revised order, a record with no date of birth, a long-stay
infant past the age line, the ward page, "TPN ทั้งหอ", and the printed order and sticker of a NICU
and an SCN infant. A difference moves that work to its own newborn PR for Pp to judge.

## Risks / Trade-offs

- [A copy of the ward table drifts] → the digest check in D1 is blocking in `tools/checks.json`.
- [An account loses its patients at the migration] → D2's order: migration, check, then the backend
  version. Rows with no ward are listed first.
- [A cached sync reply reaches another ward] → the cache key carries the ward set; the scope harness
  calls sync as two wards in turn.
- [A child admitted just under the age line stays on newborn rules for a long admission] → accepted
  with D3; the present DOL-400 and 8 kg limits still stop the order, and P2 can add an upper age for
  the newborn set at admission.
- [One release reaches every ward] → per-set harnesses, D8, and the rollback target each release PR
  names. Lock contention is measured on dev local with two wards' load before the second paediatric
  ward.
- [The clinical approver is one person] → the ward's rule owner and Pp check each other (tasks § 0).
- [`calculator.jsx` grows further] → paediatric tables and their grading live in `data.js`; the
  component asks `ruleSetFor` and reads the tables it is handed.

## Migration Plan

Six groups, one PR each (tasks.md): (1) ward table, no ward added; (2) ward-scoped access; (3)
`ruleSetFor` with the newborn branch only; (4) the paediatric rule set, built and tested on dev
local against a fixture ward that production does not have; (5) the first real ward's row, released
together with group 4 so no child can be registered there before their rule set exists; (6) opening
the ward to its staff. Groups 1–3 can release as they land. Rollback is the previous `release` and
the previous backend version named in each release PR; the `wards` column is additive and can stay.

## Decisions Pp still owns

These change the specs or tasks, so they are listed here, not deferred.

- **P1. Which wards, and their beds.** The key, label, bed labels and sticker label of each สก. ward,
  and which one opens first.
- **P2. The age line** between the sets, corrected or chronological age for a former preterm infant,
  and D3's rule that the set is fixed at admission (so a child admitted past the line to NICU or SCN
  gets paediatric cards). The TPN team said "เด็กโตคือ อายุมากกว่า 1 ปี"; Aminoplasmal's label line is
  2 years; `guideline-values.md` shows where the guidelines' own bands break.
- **P3. Dosing weight and growth reference** for older children.
- **P4. The topbar patient switcher** once access is ward-scoped: the caller's wards only, or as now.
- **P5. The rule owner** for the paediatric set, and the TPN pharmacist who checks products.
- **P6. Whether the first ward runs beside paper first**, and for how long.
- **P7. What replaces birth weight** in the duplicate check and on the TPN room page for a child.
- **P8. PN contexts** (D7). Decided 2026-11-21: cholestasis is the existing Liver Dysfunction tick,
  with the four answers in D7; intestinal failure shows advice on sodium and zinc; the newborn set
  gets the same contexts (tasks group 7); the indication stays single-choice with free text for
  more; the prescriber chooses the indication and the system maps nothing; Addamel N triggers the
  cholestasis message too. The advice on sodium and zinc is carried by the indication "Short
  bowel syndrome". The wording of both messages is in D7. Still open: whether "long-term PN" is a
  context at all.
