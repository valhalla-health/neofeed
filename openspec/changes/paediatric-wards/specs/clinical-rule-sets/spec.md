# Spec Delta

## Purpose

Decides which set of clinical rules an order is computed and checked under, by the child's age, and
keeps NICU and SCN patients' orders unchanged when another set is added or edited.

## ADDED Requirements

### Requirement: The rule set follows age at admission, not ward

The system SHALL choose a patient's rule set from their age on the admission date of their record.
The bed and ward SHALL NOT change the rule set, the amino-acid products offered or any limit.

#### Scenario: A newborn boarded in a paediatric ward

- **WHEN** an infant admitted inside the newborn age range is in a paediatric ward's bed
- **THEN** the order uses the newborn rule set, with the same figures, alerts, flags and products as
  the same infant in a NICU bed

#### Scenario: An older child in a newborn bed, with the paediatric set signed

- **WHEN** a child admitted past the age line is registered in an SCN bed
- **THEN** the order uses the paediatric rule set

### Requirement: The rule set is fixed for the admission

A patient's rule set SHALL NOT change while their record is active, whatever age they reach.

#### Scenario: A long-stay NICU infant passes the age line

- **WHEN** an infant admitted as a newborn is still in NICU on the day they pass the age line
- **THEN** that day's order uses the newborn rule set, and every figure, tile, alert and product is
  the same as the day before for the same inputs

### Requirement: An age with no signed rule set cannot be ordered for

The system SHALL refuse to register a patient for ordering, and to save or submit an order, when no
signed rule set covers their age at admission, on the server as well as on the form.

#### Scenario: Before the paediatric set is signed

- **WHEN** a child admitted past the newborn limits has an order entered while no paediatric set is signed
- **THEN** the form stops with a message naming the range that can be ordered, and a hand-made request
  is refused by the server

#### Scenario: A stored set that no longer matches

- **WHEN** an order arrives for a patient whose stored rule set differs from the one the server
  derives from the date of birth and admission date
- **THEN** the server refuses it and no sheet changes

### Requirement: The paediatric set needs a credible date of birth

The server SHALL place a patient on the paediatric set only when the date of birth is present, not
in the future and not after the admission date. A record that existed before this change with no
credible date of birth SHALL stay on the newborn set.

#### Scenario: A new registration with a date of birth after admission

- **WHEN** a child is registered with a date of birth later than the admission date
- **THEN** registration is refused on the form and by the server

#### Scenario: An existing NICU record with no date of birth

- **WHEN** an order is saved for a NICU record created before this change that has no date of birth
- **THEN** the order saves under the newborn rule set, as before

### Requirement: NICU and SCN orders do not move

Adding or changing another rule set SHALL NOT change any figure, colour, alert, flag, product,
default, rounding or printed value for a patient on the newborn rule set.

#### Scenario: Newborn cases before and after

- **WHEN** the newborn comparison cases are run on the commit before and the commit after a
  paediatric change
- **THEN** every on-screen figure, tile status, alert, ward-page flag, printed order figure and
  sticker figure is identical

#### Scenario: A newborn order with no PN context

- **WHEN** a NICU or SCN order has no PN context set, before and after the newborn contexts are added
- **THEN** every figure, tile status, alert and printed value is identical

### Requirement: Each rule set has its own constants version

Each rule set SHALL carry its own constants version and its own minimum for Submit. A saved order
and its printed figures SHALL record the rule set and version they were computed under, and every
version check, the TPN room page's included, SHALL compare against that set's version.

#### Scenario: A paediatric rule changes

- **WHEN** the paediatric constants version is bumped
- **THEN** a saved NICU order reprints without a re-save and shows no version warning on the TPN room
  page, and a saved paediatric order asks for a re-save

### Requirement: Amino-acid products follow the rule set and the label's age

A product SHALL be offered only under a rule set that lists it, and only at or above the minimum
age on its label, counted on the order's date.

#### Scenario: A child under the Aminoplasmal age line in a paediatric ward

- **WHEN** a child younger than the Aminoplasmal 15 % label's minimum age is ordered for
- **THEN** Aminoplasmal 15 % is not offered

### Requirement: Newborn-only fields are not asked of an older child

Under the paediatric rule set the system SHALL NOT require gestational age or birth weight, SHALL
NOT show PMA, corrected age, the Fenton chart, the birth-weight floor on the dosing weight or the
preterm flags, and SHALL print age in years and months on the order and the sticker.

#### Scenario: Registering a child of four years

- **WHEN** a child of four years is registered with a date of birth and a weight, and no GA or BW
- **THEN** registration succeeds, and the order form and printed order show age in years and months
  with no DOL, PMA or Fenton element

#### Scenario: The ward TPN page for a child with no GA

- **WHEN** a child on the paediatric set, registered with no GA, is listed on "TPN ทั้งหอ"
- **THEN** no preterm amino-acid or lipid flag is shown for them

### Requirement: A calculation with no patient names its rule set

Quick calc SHALL state which rule set it applies. Once a signed paediatric set exists it SHALL ask
for the age group before showing any graded figure. The Center Point entry SHALL refuse a child
outside the newborn set on the form.

#### Scenario: Quick calc before a paediatric set exists

- **WHEN** an account that holds a paediatric ward opens Quick calc while only the newborn set exists
- **THEN** its heading says the newborn rules apply

#### Scenario: Center Point sends an older child

- **WHEN** the Center Point entry opens for a child whose age at admission is outside the newborn set
- **THEN** the form refuses to calculate and says why
