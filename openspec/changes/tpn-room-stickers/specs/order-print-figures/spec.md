## ADDED Requirements

### Requirement: A saved TPN order carries its sticker figures

Every save of an order with a TPN bag SHALL write `printJson` to the order's `Daily_Log` row (column AM).
`printJson` SHALL hold the figures the three stickers print, computed by the calculator and formatted by
the sticker number format below, with the `CONSTANTS_VERSION` that produced them.

#### Scenario: Save writes the figures

- **WHEN** a doctor saves an order for a synthetic 2.20 kg infant with 250 mL delivered and 30 mL dead space
- **THEN** the row's `printJson` holds the dosing weight, DOL, the TPN date, Factor, the delivered,
  dead-space and prepared volumes, the mL of every stock row on the TPN unit's sample worksheet (zeros
  included), WFI, the delivered amounts on the sample PN label, osmolarity and kcal
- **AND** each value equals the calculator's value for that order, rounded half up to the decimals the
  sticker number format sets

### Requirement: Sticker number format

`printJson` SHALL format each figure with at most the decimals the TPN unit's sample sticker of
2026-10-30 shows, and never a trailing zero (Pp, 2026-10-30, the ISMP rule): at most one decimal for D50W,
the amino acid stocks, WFI and the prepared and delivered volumes, as the doctor's form shows them (Pp,
2026-10-30), and for every other stock row;
at most two for dead space and Factor; and the sample's
units on the PN label (Ca²⁺, phosphate and Zn²⁺ in mg), except Mg²⁺, which SHALL print in mg in the
same mg the order uses (Pp, 2026-10-30), where the sample shows mEq. Formatting SHALL NOT change the
calculation, and no figure SHALL be computed from another formatted figure.

#### Scenario: Magnesium on the PN label

- **WHEN** an order with MgSO₄ is saved
- **THEN** `printJson`'s PN-label magnesium is in mg, the same unit as the doctor's order

#### Scenario: Large and small volumes

- **WHEN** the calculator gives D50W 53.6 mL and KCl 3 mL
- **THEN** `printJson` holds `53.6` for D50W, the same string the doctor's form prints, and `3` for KCl,
  never `3.0`

#### Scenario: A stock NeoFeed cannot order

- **WHEN** any order is saved
- **THEN** `printJson` holds `0` for Aminoleban, Nephrosteril, MgSO₄ 50 % and Addamel N (Addamel N has no
  figure, `null`, when it is ticked: NeoFeed has no Addamel volume)

#### Scenario: Vitamins on an overfilled bag

- **WHEN** a synthetic 2.20 kg infant has 250 mL delivered and 280 mL prepared with Soluvit 1 mL/kg
- **THEN** `printJson` holds Factor `2.46` and Soluvit `2.5`, the calculator's × Factor volume

#### Scenario: A revision keeps its own figures

- **WHEN** a submitted order is edited and the save creates a revision row
- **THEN** the revision row has its own `printJson`, and the earlier row's `printJson` is unchanged

#### Scenario: An order with no TPN bag

- **WHEN** a doctor saves an enteral-only order
- **THEN** `printJson` is empty

### Requirement: Doctor-confirmed critical values travel with the figures

When an order is saved with a doctor's critical-value confirmation, `printJson` SHALL include the alert
text and the reason, as the printed form shows them.

#### Scenario: Confirmed critical potassium

- **WHEN** a doctor confirms a critical K⁺ with a reason and saves
- **THEN** `printJson` carries that alert and that reason

### Requirement: Submit requires printed figures

Submit SHALL refuse a TPN row whose `printJson` is empty, with the message drafts from an older app
already get: "บันทึกนี้มาจากแอปรุ่นเก่า เปิดรายการแล้วบันทึกใหม่ก่อนส่ง".

#### Scenario: A draft saved before this change

- **WHEN** a doctor submits a TPN draft saved before `printJson` existed
- **THEN** Submit is refused with that message, and opening and saving the draft makes it submittable
