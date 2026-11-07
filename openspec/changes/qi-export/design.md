# Design: QI export

Synthetic data only in this change, its tests and its examples. The live Sheet is never opened.

## D1. Editor-only, three public functions

`setupQiExportKey(project)`, `exportQi(project)` and `lookupResearchId(researchId, project)` are top-level
functions, run from the Apps Script editor (Run ▸ function). `doPost` gains no action, so no ward session
can reach them; editor access to the script is the gate. `doGet` serves only JSON (no `HtmlService`),
so `google.script.run` cannot call them either.

`project` defaults to `QI_EXPORT_DEFAULT_PROJECT` (`QI1`), because the editor's Run button passes no
argument. A new project with unlinkable IDs is one line in the editor:
`function runQi2() { setupQiExportKey("QI2"); }`, then the same wrapper for `exportQi`. A project name
is 1–16 of `A–Z 0–9`.

The audit actor is `apps-script-editor:<project>`. Reading the runner's e-mail needs the
`userinfo.email` scope, which the manifest does not have; the script's editors are the ones who can run
it.

## D2. The key

`QI_EXPORT_KEY_<project>` in Script Properties: three `Utilities.getUuid()` values without dashes, 96 hex
characters. `getUuid` is `java.util.UUID.randomUUID()` (Apps Script reference), which draws from
`SecureRandom`; 3 × 122 random bits = 366 bits. `setupQiExportKey` never replaces an existing key: a new
key would orphan every earlier export. Rotating means a new project name. Script Properties are not synced
by `clasp push` or git (same as `SPREADSHEET_ID`).

## D3. Codes

`HMAC-SHA256(key, "<kind>\u0000" + value)` in lowercase hex, with `Utilities.computeHmacSha256Signature`:

| kind | input | output |
|---|---|---|
| `patient` | `sessionId`, trimmed | `R-` + 12 hex (48 bits) |
| `entry` | `entryId` / `revisionOf`, trimmed | `E-` + 12 hex |
| `staff` | e-mail, trimmed, lower case | `S-` + 10 hex |

The kind prefix is domain separation: the same text never gives the same code in two columns. Nothing is
stored. A collision inside one export (two inputs, one code) stops the export. 48 bits keeps the chance
for 10 000 infants near 1 in 5 million.

## D4. Columns (one row per `Daily_Log` order)

Mirrors `neofeed_pseudonymize.py` (praewpp-workspace#80, `63f9949`) and its README table. "Day" is the
Bangkok calendar date minus the infant's admission date; "time" is Bangkok `HH:MM`.

| Source | `QI_Export` column |
|---|---|
| `sessionId` | `research_id` (D3) |
| `name`, `initials`, `twinSuffix`, `lengths`, `hcs`, `appVersion` | dropped |
| `dob` | `age_at_admit_d` = admission − dob, days |
| `admissionDate` | day 0, not exported |
| `bw`, `ga` | `bw_band_g` (100 g, `1200-1299`), `ga_wk` (whole weeks) |
| `sex` | `sex` |
| `twinSuffix`, `multiplesCount` | `is_multiple` 1/0 |
| registry `status`, `statusDate` | `pat_status`, `status_day` |
| `currentBed` | `unit_current` (NICU, SCN, ISO, OTHER) |
| `bedHistory`, `weights` | dropped: one row per order would repeat them; each order carries its weight |
| `diagnosis` | `diagnosis`, raw, unless it holds an identifier (D6), then `[REDACTED]` |
| `pnIndication`, `liverDysfunction`, `renalDysfunction` | same, short ASCII code or `[REDACTED]` |
| `entryId`, `revisionOf`, `revisionNumber` | `entry`, `revision_of` (D3), `revisionNumber` |
| `ts` | `day` |
| `dol` … `enVolPerKg`, `ioInput`, `ioOutput`, `drainContent` | as stored (numbers) |
| `route`, `status`, `supp*` | short ASCII code, else `[REDACTED]` |
| `submittedBy`, `lastModifiedBy`, `publishedBy` | `staff`, `last_modified_by`, `published_by` (D3) |
| `lastModified`, `published`, `supersededAt` | `*_day` + `*_time` |
| `constantsVersion` (column and inside both JSONs) | `constants_v`: `C01`, `C02`… in release order (date, then the number after the dot) |
| `calcInputJson` | `calc`: the local script's `CALC_KEYS` only; `savedAt`, `savedByLabel` dropped; `critOverride` → true/false; a string holding an identifier → `[REDACTED]`; other keys dropped and counted |
| `printJson` | `print`: `v`, figures, `stockMl`, `delivered`; `orderDate` → `order_day`; `critical` → `{alerts: n, hasReason: bool}` (the reason text never leaves) |

`C01…` numbers the versions present in this export, so a later export with a newer version keeps the old
numbers; a version that vanished from `Daily_Log` would shift them. Rows deleted from `Daily_Log` are
rare (admin delete only), so the analysis joins exports on `research_id`, not on `constants_v`.

**Left out of the export, counted in the summary:** an order whose `sessionId` is not in the registry, and
every order of a PDPA-erased infant (`_isPdpaErased`). An erasure keeps clinical history for the
hospital's record duty, not for secondary use. An infant with no order has no row.

## D5. The tab

`QI_Export` is created on the first export. Each export clears it and writes header + rows in one
`setValues`, then trims the grid to exactly that many rows and columns (the 10 M-cell workbook cap, as
for `Audit_Log`). Every string cell is written with a leading `'`, so Sheets keeps it as text: `08:15`
does not become a time, `1/2` does not become a date, and nothing becomes a formula. The download then
carries the bare text.

Before reading, both source tabs pass `_schemaMismatch` (blank header cells pass, as `_assertSchema`
allows): a shifted column could move a name into an exported column, so a mismatch stops the export.

## D6. The identifier scan

Before writing, every output cell is checked for an e-mail, Thai script, a 13-digit number, a phone
number, an HN/AN `12345/67`, a calendar date, a UUID, and any source `sessionId`, `entryId` or name of 5
characters or more (the local script's patterns). One hit stops the export: nothing is written and the
summary names the columns and counts, never a value. The diagnosis, `calc` strings and short codes are
redacted by the same patterns plus the infant's own name before the scan, so the scan stops only a bug.

A Thai diagnosis is therefore `[REDACTED]`, and the local checker cannot map it. That is the safe side of
an open decision for Pp (passing Thai diagnosis text through would put free text that may hold a name on
a PC).

## D7. Audit and the summary

`Audit_Log` rows, written strictly (no row, no action): `qiKeyCreated` when a key is made, `qiExport`
before the tab is written, `qiReidentify` with the matched `sessionId`, `qiReidentifyMiss` when nothing
matches. All four are in `NON_USAGE_AUDIT_ACTIONS`, so an export is not a weekly active user.

`exportQi` returns and logs a summary of counts only: rows, infants, orders left out and why, redactions
and dropped `calc` keys per column, and a k-report on sex + GA week + BW band + multiple birth (groups,
smallest group, infants below k = 5).

`lookupResearchId` returns `{ sessionId }` and writes it to the execution log, because the editor's Run
shows the log and not the return value.
