# Spec Delta

## Purpose

Holds the one list of wards and beds, so every screen and the backend agree on which ward a bed
belongs to and a new ward is added in one place.

## ADDED Requirements

### Requirement: One ward table decides every ward and bed

The system SHALL define its wards, their order, labels and beds in a single table. The bed picker, the
ward a bed belongs to, the ward page, "TPN ทั้งหอ", Print order, the admin census, the backend's bed
check and the TPN room page's ward groups SHALL all derive from it.

#### Scenario: A ward added to the table appears everywhere

- **WHEN** a ward with three beds is added to the table and nothing else is edited
- **THEN** its beds are offered at registration, it has a tile on the ward page, a tab on "TPN ทั้งหอ",
  a row in the census and the usage report, a place in the transfer dialog, and an order from one of
  its beds reaches the TPN room page with its bed and sticker label, printable

#### Scenario: A copy of the table that differs fails the checks

- **WHEN** the backend's or the TPN room page's copy of the table differs from the source
- **THEN** a blocking check fails and names the copy

### Requirement: The newborn wards keep their screens

Moving to the ward table SHALL leave NICU, SCN and ทดสอบระบบ as they are: the same beds in the same
order, the same tiles, labels and sub-labels in the same order on the ward page, isolation rooms
grouped under NICU, and a patient with no bed under ทดสอบระบบ.

#### Scenario: The ward page with no paediatric ward

- **WHEN** the table holds only NICU, SCN and ทดสอบระบบ
- **THEN** the ward page, the bed picker, "TPN ทั้งหอ", the census and the TPN room page render the
  same wards, beds and wording as before the change

### Requirement: The ward page lists the wards the viewer may open

The ward page SHALL show one tile per ward in the table that the signed-in account holds, in table
order, then ทดสอบระบบ. Each tile SHALL show the ward's label, its bed range and the same counts the
NICU and SCN tiles show today. A paediatric ward's tile SHALL offer Print order the way NICU's does.

#### Scenario: A clinician holding one paediatric ward

- **WHEN** a doctor whose wards are one paediatric ward signs in
- **THEN** the ward page shows that ward's tile and ทดสอบระบบ, and no NICU or SCN tile

#### Scenario: An admin

- **WHEN** an admin signs in
- **THEN** the ward page shows every ward in the table, then ทดสอบระบบ

### Requirement: A bed outside the table stays reachable

A patient whose bed label is in no ward of the table SHALL remain listed under ทดสอบระบบ for an
admin, and their bed SHALL still show in the bed picker as an extra option.

#### Scenario: A bed typed straight into the sheet

- **WHEN** a patient's bed is a label no ward holds
- **THEN** an admin sees the patient under ทดสอบระบบ and can move them to a bed of the table
