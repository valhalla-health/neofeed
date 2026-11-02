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

### Requirement: An order without figures can be saved again

A save without `printJson` SHALL still land, with column AM blank. The calculator SHALL write
`calcInput.printJsonV` with the figures, because the ward sync does not read column AM. A saved, submitted
order with a bag and no marker, dated today or tomorrow, SHALL
show "ยังไม่มีตัวเลขสติกเกอร์ — กด Submit อีกครั้ง" with Submit enabled unless a stop holds, and that Submit SHALL
write a revision with figures. Print SHALL NOT be held for it: the doctor's sheet uses no sticker figure.

#### Scenario: A locked order from before the release

- **WHEN** a doctor reopens a locked order with a bag and no marker, and presses Submit
- **THEN** the save writes a revision whose `printJson` holds the figures and whose `calcInput` has the marker

#### Scenario: A day with no bag

- **WHEN** a doctor reopens a No TPN order, or a draft
- **THEN** no notice shows

#### Scenario: A bag from an earlier day

- **WHEN** a doctor reopens a locked order with a bag and no marker, dated yesterday
- **THEN** no notice shows and Submit stays disabled, as for any locked order

### Requirement: The server holds printJson to the sticker schema

The TPN-room page prints from `printJson` alone, so the server SHALL refuse a save whose `printJson`:
has a key `stickerFigures` does not make, or lacks one it does; has a figure that is not a number as text of
at most 12 characters with no minus sign (`null` only on `stockMl.addamel` and `delivered.addamelMl`); has a
bad `v`, `constantsVersion`, `orderDate` or `critical`; or is longer than 8,000 characters. It SHALL also
refuse one whose `constantsVersion`, DOL, weight or date is not the order's, the weight compared after the
sticker's rounding. A refusal SHALL name `printJson` and write nothing. An edit SHALL be held to the row's
own date. Because a refusal stops a doctor's save, `stickerFigures` SHALL return null rather than a figure
the server would refuse.

#### Scenario: A patient name inside the figures

- **WHEN** a save carries `printJson` with an extra key `patientName`
- **THEN** the save is refused and no row changes

#### Scenario: Figures from another order

- **WHEN** a save for a DOL 10 order carries `printJson` with `dol` 25
- **THEN** the save is refused and no row changes

#### Scenario: A weight the sticker rounded

- **WHEN** a 1005 g order is saved with `dosingWeightKg` `1.01`
- **THEN** the save lands, as it does for every whole gram from 200 to 8000 g with the figure the sticker prints

#### Scenario: A No TPN order

- **WHEN** a doctor ticks No TPN, for a new order or over a submitted one the same day
- **THEN** `printJson` is null, the save lands with AM blank, and an earlier row keeps its own figures
