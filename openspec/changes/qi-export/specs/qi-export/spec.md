## ADDED Requirements

### Requirement: One key per project, never shown

`setupQiExportKey(project)` SHALL create the Script Property `QI_EXPORT_KEY_<project>` holding at least
256 random bits when it is absent, and SHALL leave an existing key unchanged. The secret SHALL NOT appear
in a return value, the execution log, a sheet or `Audit_Log`.

#### Scenario: Run twice

- **WHEN** Pp runs `setupQiExportKey()` twice
- **THEN** the second run reports the key already exists and the property is unchanged

### Requirement: Research IDs are keyed hashes, computed at export

The export SHALL give each infant `R-` + the first 12 hex of HMAC-SHA256(key, `patient\0` + sessionId),
each order `E-` + 12 hex (`entry\0`), each staff e-mail `S-` + 10 hex (`staff\0`, lower case), and SHALL
store none of them in `Patient_Registry` or `Daily_Log`.

#### Scenario: Two projects

- **WHEN** the same synthetic infant is exported under `QI1` and `QI2`
- **THEN** its two research IDs differ

### Requirement: The export holds no direct identifier

`exportQi()` SHALL write one row per `Daily_Log` order of a registered, non-erased infant to `QI_Export`,
with no name, initials, date of birth, sessionId, entryId, e-mail, Thai text, calendar date or UUID, and
every date as a day counted from admission. It SHALL write nothing when its own identifier scan finds one,
or when a source tab's header does not match the backend's columns.

#### Scenario: Synthetic ward

- **GIVEN** synthetic infants, one with a pre-2026-09-27 sessionId, with Thai names, saver names and
  e-mails in `calcInputJson`, and a Thai critical-alert reason in `printJson`
- **WHEN** `exportQi()` runs
- **THEN** no cell of `QI_Export` holds any of them, and each day and time equals the one computed by hand

### Requirement: Re-identification is audited

`lookupResearchId(researchId)` SHALL return the matching sessionId and write a `qiReidentify` row to
`Audit_Log` before it returns; a research ID that matches nothing SHALL write `qiReidentifyMiss` and
return an error.

#### Scenario: Admin request

- **WHEN** Pp looks up a research ID from the last export
- **THEN** she gets that infant's sessionId and `Audit_Log` names it
