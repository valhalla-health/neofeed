---
name: app-walkthrough
description: Use at the start of any session working on the NeoFeed codebase, or whenever the user asks "how does this app work", "give me a walkthrough/tour", "orient me in this repo", or before making changes to auth, patient identifiers (sessionId/GA/DOL), the Daily_Log schema, or anything PDPA/compliance-related. Loads app-walkthrough.md, the canonical map of NeoFeed's architecture, data model, and conventions, so changes don't violate them.
---

# NeoFeed app walkthrough

NeoFeed is a NICU nutrition-management app (React 18 + Babel via CDN, no
build step; Google Apps Script + Google Sheets backend). Before making
non-trivial changes, read `app-walkthrough.md` at the repo root — it covers:

1. How to run it (`NeoFeed.html` is canonical, not `index.html`)
2. File-by-file architecture (`app.jsx`, `data.js`, `calculator.jsx`,
   `log.jsx`, `fenton.jsx`, `registry.jsx`, `gas-backend.gs`)
3. The data model — especially the `WW.D` GA/PMA shorthand encoding, the
   `sessionId`/`entryId` identifiers, and the Daily_Log entry shape
   (`enVolPerKg` PN/EN target switch)
4. The backend Google Sheet schemas (`Patient_Registry`, `Daily_Log`,
   `Staff`, `Audit_Log`) and hybrid Gmail-JWT / SHA-256-password auth
5. The six main views and what each does
6. Thai PDPA compliance posture — lawful basis, erasure/pseudonymization,
   audit trail, what's still open
7. Conventions that must be preserved (no bundler, GA math only through
   `data.js` helpers, DOL always computed live, Thai BE date formatting,
   mobile-first)

## How to use this skill

1. Read `app-walkthrough.md` in full before starting work that touches
   more than a single isolated UI tweak.
2. For the current state of in-flight work, open/known caveats, and the
   session-by-session change log, also read `HANDOFF.md` — it's updated
   more frequently than the walkthrough and reflects what's actually live
   vs. sandboxed right now (e.g. whether the GAS backend URL is live or
   commented out, whether the login screen is enabled).
3. If a task touches GA/PMA values, `sessionId` generation, the Daily_Log
   column layout, or anything that moves patient data (exports, new
   endpoints, logging) — re-read walkthrough §3 and §6 specifically before
   writing code; these are the areas where a "simplification" has broken
   things before.
4. When you learn something new and durable about the app while working
   (a new convention, a new gotcha, a new view), update
   `app-walkthrough.md` in the same change so the next session starts from
   accurate knowledge — don't let it drift out of date.
