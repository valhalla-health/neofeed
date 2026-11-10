# QI export: pseudonymized inside Apps Script, so names never reach a PC

## Why

Pp wants NeoFeed's orders for quality-improvement analysis, possibly by a cloud AI later. Today the
only path is to download `Patient_Registry` and `Daily_Log` as CSV, names included, into `LocalOnly`,
and run the local pseudonymizer there (praewxtvl/praewpp-workspace#80). That download is the weakest
step: a file with every infant's name sits on a PC. Pseudonymizing at the source (the NHS model, and
EDPB Guidelines 01/2025 on keyed hashes with a key per purpose) removes it. Pp chose option A on
2026-11-07: research IDs are a keyed HMAC computed at export time, not a stored column.

## What changes

- **`setupQiExportKey()`**, run once from the Apps Script editor, makes one random secret per project
  in Script Properties (`QI_EXPORT_KEY_<project>`). Nothing returns, logs or writes the secret.
- **`exportQi()`**, run from the editor, writes one table to a `QI_Export` tab: one row per `Daily_Log`
  order with its infant's registry fields, every identifier replaced or dropped, every date turned into
  a day counted from admission. It scans its own output for identifiers and writes nothing if one is
  found. Pp downloads the tab with File ▸ Download ▸ CSV.
- **`lookupResearchId(researchId)`**, editor-only, answers an admin re-identification request with the
  `sessionId`, and audits it.
- `Audit_Log` gets a row for each key, export and re-identification. These rows are not product usage.

## Impact

- `gas-backend.gs` only. No new `doPost` action, no new OAuth scope, no frontend change, no dose moves,
  `CONSTANTS_VERSION` stays. Nothing new is stored in `Patient_Registry` or `Daily_Log`.
- One new tab, `QI_Export`, created on the first export, trimmed to its width and rows.
- Goes live only with a backend `clasp push` + `clasp update-deployment`, on Pp's go-ahead.
- The export is pseudonymized, not anonymous: on a 90-infant census k ≥ 5 is out of reach, so it stays
  personal data under PDPA. Its lawful basis is not the treatment basis at the top of `gas-backend.gs`
  (`REFERENCE.md` § PDPA says that basis does not cover a QI export). Pp and the DPO settle that before
  the first real export.

## Out of scope

- The local checker's `--check-only` mode for this one file (praewpp-workspace, not this repo).
- Mapping diagnosis text to categories: the local checker does that from the raw text.
- Small-cell suppression (≤ 7) and rounding: done on the analysis side, on aggregates.
