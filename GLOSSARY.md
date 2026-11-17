# NeoFeed

NeoFeed is a feeding and TPN calculator for a NICU ward, and it prints the order the TPN room prepares from. This glossary fixes one word for each idea, even where a screen label still differs.

## Language

### Patients and places

**Patient**:
One infant's record in NeoFeed. A readmission can reopen the same record rather than start a new one.
_Avoid_: session, case, episode

**NeoFeed ID**:
The identifier NeoFeed gives a Patient. It is not the hospital's HN or AN.
_Avoid_: session ID, AN

**Ward list**:
One ward's Patients on the unit, arranged by bed, with those Discharged, Transferred or Expired up to 7 days before today (by status date) folded below.
_Avoid_: registry, patient list

**Parked**:
A Patient mid-move who has left one bed and has no new bed yet (รอเตียง).
_Avoid_: bedless, unassigned

**TPN room**:
The place where TPN bags are prepared from submitted Orders.
_Avoid_: TPN unit

**Role**:
What a staff login is allowed to do: admin, doctor, nurse or pharmacy.
_Avoid_: user type, access level

**Center Point**:
A separate NICU system that can host NeoFeed's calculator and keep its own reviewed TPN orders.

### Age

**DOL**:
Day of life, counted so that the day of birth is DOL 1.
_Avoid_: postnatal age

**Day of admission**:
Days since admission, counted so that the admission day is Day 0. It counts from 0 while DOL counts from 1.
_Avoid_: admit day

**DOL at admission**:
The Patient's DOL on the admission date.
_Avoid_: admission age

**GA**:
Gestational age at birth, in completed weeks and days (W+D).

**PMA**:
GA plus the days since birth, which is GA + (DOL − 1) days.

**Corrected age**:
PMA minus 40 weeks. It exists only from 40 weeks PMA.
_Avoid_: CA in prose

### Weight

**Birth weight**:
The Patient's weight at birth.
_Avoid_: BW in prose

**Current weight**:
The latest weight on record for a Patient as of a given day, which an Order starts from and saves. It can be carried over from an earlier Order, so it is not always that day's measurement.
_Avoid_: Wt now, today's weight, measured weight

**Dosing weight**:
The weight an Order's TPN doses and targets are calculated from. It is Birth weight while Current weight is below it, otherwise Current weight, unless the doctor sets another figure.
_Avoid_: TPN calc. weight, Weight for calculation, working weight

### Feeding

**EN**:
Enteral feeding, meaning milk or formula given into the gut.

**MEN**:
Minimal enteral nutrition: the Order's EN when its MEN tick is set. The one tick covers every feed on the Order, and that EN counts toward neither Prescribed fluid nor nutrients.
_Avoid_: MEF, trophic feed

**Counted EN**:
The EN on an Order that is not marked MEN.

**Full EN**:
Counted EN of at least 100 mL/kg/d on Dosing weight.
_Avoid_: full feeds

**EN targets**:
The guideline nutrition targets that apply to an Order at Full EN.

**PN targets**:
The guideline nutrition targets that apply to an Order below Full EN.

**NPO**:
An Order with no TPN bag and no EN. A Lipid infusion may still be running. This is the Order route value: an infant on a TPN bag with no feeds is NPO clinically, but its Order route names the bag's Access route.
_Avoid_: nil by mouth

**Target fluid**:
The fluid the doctor plans for the whole day, per kg.
_Avoid_: plan, TFI

**Prescribed fluid**:
The day's ordered fluid: Delivered volume, Lipid infusion, other IV, drugs and Counted EN.
_Avoid_: total fluid

### TPN

**TPN**:
Intravenous nutrition as ordered in NeoFeed, made up of the TPN bag and the Lipid infusion. PN stays only in guideline terms such as PN targets.
_Avoid_: PN, parenteral nutrition

**TPN bag**:
The compounded solution of an Order (dextrose, amino acid, electrolytes and minerals, Soluvit, trace elements, heparin and water for injection), without the Lipid infusion.
_Avoid_: main bag, aqueous bag

**Lipid infusion**:
The 20% lipid emulsion, with any Vitalipid added to it, given separately from the TPN bag.
_Avoid_: lipid bag, lipid syringe

**Delivered volume**:
The volume of the TPN bag meant to reach the infant over the day.
_Avoid_: TPN volume

**Dead space**:
The extra volume that stays in the giving set (ปริมาตรคาสาย).
_Avoid_: overfill

**Prepared volume**:
Delivered volume plus Dead space, rounded up to the next 10 mL above that sum (48 + 30 → 80 mL; 110 + 30 → 150 mL). With no Dead space it is the Delivered volume.

**Access route**:
The line that carries the TPN bag: central or peripheral.
_Avoid_: route, Route of Delivery in prose

**Order route**:
The one-line summary saved with an Order, set by the TPN bag and any EN, MEN included: "TPN central" or "TPN peripheral" for a bag (plain "TPN" on a Draft with no Access route yet), "Enteral only" for no bag and some EN, and "NPO" for no bag and no EN. Rows saved before this rule, or sent outside the app, may carry free text.
_Avoid_: route

**Stock**:
A product, at the strength kept on the shelf for the TPN room.

### Orders

**Order**:
A nutrition prescription for one Patient on one date.
_Avoid_: log, entry

**No TPN order**:
An Order ticked as having no TPN that day, so it has neither a TPN bag nor a Lipid infusion.
_Avoid_: zero-volume order

**Draft**:
An Order saved but not submitted, which can still be edited in place. A Draft is not yet a record: it is left out of weights, trends, alerts, the logged-today count and the copy into the next Order, and it cannot print. Typing not yet saved is not a Draft.
_Avoid_: unpublished

**Submit**:
The save by a doctor or admin that finishes an Order and locks it.
_Avoid_: publish, send

**Revision**:
A new version of a submitted Order. The earlier row stays on record, marked superseded, and the Order's revision number (`orderRev`: the printed ฉบับที่, the TPN room's ฉบับ) goes up by one. A save that changes only Intake/Output, while the Order's Constants version is current and its figures are unchanged, also writes a new row and supersedes the old one but keeps that number, so it is not a Revision; on a held Order a doctor's save is a Revision even when only Intake/Output was typed. Every version goes when an admin deletes the Order or a doctor or admin deletes the Patient.
_Avoid_: edit, amendment

**Printed order**:
The doctor's order sheet, printed in the layout of the KCMH paper form.
_Avoid_: order form, doctor's sheet

**Short sheet**:
The Printed order of a No TPN order. It prints only when the Order has oral orders, follows an Order that had TPN, or cancels a same-day Order that had TPN; the last two say "TPN stopped today". Any other No TPN order prints nothing.

**Nursing log**:
A nurse's daily record for a Patient. It is not an Order.
_Avoid_: daily log

**Quick calc**:
A calculation with no Patient, which saves and prints nothing.
_Avoid_: scratch

**Constants version**:
The stamp (`CONSTANTS_VERSION`) of NeoFeed's clinical constants and calculation that an Order's figures were computed under. It is bumped by hand in `data.js` with any change that can move a printed figure. An Order saved under another version prints only after it is Submitted again, and the Ward list tags "ต้อง Submit ใหม่" on a Patient on the unit whose Submitted Order for today or tomorrow is held this way and would otherwise print.
