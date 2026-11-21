# Spec Delta

## Purpose

Limits which patients a doctor or nurse receives and may change to the wards their account holds, so
adding a ward does not show its children's names to every other ward's staff.

## ADDED Requirements

### Requirement: Staff accounts hold wards

Each Staff account SHALL hold a list of wards. An admin holds every ward by role. A pharmacy account
holds none and keeps exactly the access it has today. Only an admin SHALL set an account's wards,
and each change SHALL be audited.

#### Scenario: A new clinician account with no ward

- **WHEN** a doctor account has an empty ward list
- **THEN** sign-in succeeds, no patient is returned, and the ward page says an admin must assign a ward

#### Scenario: Existing accounts at the migration

- **WHEN** the migration has run on a registry where every patient has a bed, or last left a bed, in
  NICU or SCN
- **THEN** every doctor and nurse account that existed before it holds NICU and SCN, and receives the
  same patients as before

#### Scenario: A non-admin sets wards

- **WHEN** a doctor calls the action that sets an account's wards
- **THEN** the reply is `Forbidden` and `Staff` does not change

### Requirement: A patient belongs to one ward on the server

The server SHALL place a patient in the ward of their bed, or, while they have no bed, in the ward
of the bed they last left. A patient with neither, or whose bed is in no ward, SHALL be returned to
admins only.

#### Scenario: A child parked between beds

- **WHEN** a paediatric-ward child has been taken off their bed and not yet given another
- **THEN** that ward's staff still receive the child, and no NICU or SCN account does

#### Scenario: A bed in no ward

- **WHEN** a patient's bed label is in no ward of the table
- **THEN** only an admin receives the patient, listed under ทดสอบระบบ

### Requirement: Replies carry only the caller's wards

Every reply to a doctor or nurse SHALL carry patient fields only for patients in a ward the caller
holds. This covers the sync, the copy returned at sign-in, and the replies of registration, bed
changes, the order lock and write conflicts. The check SHALL run on the server and SHALL refuse when
the registry cannot be read.

#### Scenario: Sync for a paediatric ward's nurse

- **WHEN** a nurse who holds only one paediatric ward signs in, then syncs
- **THEN** both replies hold that ward's patients and no field of any NICU or SCN patient

#### Scenario: Two wards sync in turn

- **WHEN** a NICU doctor syncs, and a paediatric-ward doctor syncs a moment later with no write between
- **THEN** each reply holds only its caller's wards

#### Scenario: A bed taken by another ward's patient

- **WHEN** a NICU doctor transfers a patient to a paediatric ward's bed that is occupied
- **THEN** the reply says the bed is taken and names no patient

#### Scenario: A registration that matches another ward's patient

- **WHEN** a doctor registers a child who matches a record in a ward the doctor does not hold
- **THEN** the reply says a matching record exists in another ward and carries no name, bed or ID

### Requirement: Writes and locks are refused outside the caller's wards

A write or an order lock that names a patient SHALL be refused, before any sheet changes, when the
patient's ward is not one the caller holds. A transfer SHALL be accepted when the caller holds the
ward the patient is leaving.

#### Scenario: An order for another ward's patient

- **WHEN** a doctor who holds only one paediatric ward saves an order, or takes the order lock, for a
  NICU patient's `sessionId`
- **THEN** the request is refused, no sheet changes, the reply names no one, and the refusal is
  audited without a patient identifier

#### Scenario: A transfer out of the caller's ward

- **WHEN** a NICU doctor moves a patient to a free bed in a paediatric ward
- **THEN** the transfer is saved, and on the next sync the patient is no longer in that doctor's list

### Requirement: The TPN room still sees every ward's orders

`pharmacyOrders` SHALL keep returning the orders of every ward for a date, with no name, initials or
date of birth, each with a bed and a ward the table holds.

#### Scenario: Orders from two wards on one date

- **WHEN** a NICU infant and a paediatric-ward child each have a submitted order for the same date
- **THEN** the TPN room page lists both, each under its own ward group with its sticker label, and
  both print
