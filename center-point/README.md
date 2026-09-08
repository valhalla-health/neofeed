# Center Point connection — staging branch only

## Local draft review/publication update — 2026-09-08

Checkpoint: this page also records milk-source selection and creates a
publication/workstation-bound synthetic print job for local CP identity review.
This prints an observation summary, **not a full TPN order**. The complete
calculator payload, queue/pairing, MyBM delivery and clinical deployment remain
unfinished. Five client tests plus CP desktop/mobile HTTP browser checks pass.
See [CP status](https://github.com/valhalla-health/NICU-Center-Point/blob/codex/new-admission-foundation/docs/STATUS.md).

The staging page now saves versioned synthetic weight/feeding drafts to Center.
Clinicians can open an existing nurse-linked encounter, review its saved snapshot
and explicitly publish that revision. Nurses may save drafts but cannot publish.
New edits require review again; a replacement publication needs a structured
correction reason. Previous published values remain separate from newer drafts.
Date-only weights retain their precision; form times use Asia/Bangkok explicitly.
Server authorization and revision checks are performed on each operation.

This requires the matching Center publication API. It is not calculator routing,
an order signature, a 16:00 transfer or MyBM integration. Clinical values remain
out of browser storage. No legacy clinical calculator or GAS code was modified.
The Center `docs/NEOFEED-PUBLICATION.md` documents the API and browser checks.

This directory is a new entry point in the real NeoFeed repository. It calls the
actual authenticated Center Point API and is not loaded by the legacy app shells.
No production frontend, GAS code, clinical formula, Sheet or historical record
has changed. Do not merge/deploy it as a complete NeoFeed clinical migration.

Mount this directory at `/neofeed/` in the Center Point staging server using its
`neofeedDirectory` option. The same-origin mount is required for the authenticated
session cookie; serving this HTML directly from the legacy public host is not a
supported integration. Follow Center Point's OIDC/MFA setup first.

The connection workflow resolves an issued QR, shows the encounter for confirmation,
then requests a v2 association with a random local UUID. Pending retry identity is
saved before the network request. Responses are validated. Unknown legacy-shaped
records are rejected, and no error triggers a fallback to Apps Script. The only
browser storage used is the separate neofeed-v2 namespace containing UUID links
and pending/linked state. QR payloads, names, HNs and clinical observations are not
persisted there. A saved linked state never substitutes for server authorization.

Validation: `node --test test/center-point.test.mjs`. Also verified from a real
browser against the Center Point HTTP server, following signed synthetic OIDC
login, local bedside verification, QR issuance and linking. No real provider or
patient was used in that run.

Still required: approved cloud storage for new-cohort clinical observations,
calculator save routing, app scopes, cutover rules and batch ingestion. This page
connects the identity layer; it does not yet save nutritional data for clinical use.
