# NeoFeed — Status

**Updated 2026-08-21** · 🟠 **BACKEND REDEPLOY PENDING** — production is still `@46`
(2026-08-17), carrying GitHub `main` `df5df2b`. `gas-backend.gs` on `main` is **ahead of what is
deployed**.

| | |
|---|---|
| Frontend | GitHub Pages serves `index.html` from repo root. The 2026-08-21 `app.jsx` change **ships automatically with the static files** — cache-bust `?v=pwd-gate-0821` |
| Backend | GAS deployment `AKfycbz8Nt…` at `@46`. **`gas-backend.gs` has changed since and is NOT deployed** — see below |
| Deploy identity | `peeraporn.po@chula.ac.th` (`executeAs: USER_DEPLOYING` — a different account switches the live app's identity) |
| Migrations | none outstanding on any tab |
| Cache-bust | `app.jsx?v=pwd-gate-0821`; `registry.jsx?v=dol-input-fix1`; others unchanged. Both shells verified byte-identical |

## 🟠 What is on `main` but not live

Two backend changes are waiting on a `clasp push` + `clasp update-deployment`:

1. **The `mustChangePassword` server gate** (`doPost`) — until this is deployed, the hole is still
   open in production: a temp-password account that skips the client prompt is still fully
   authorised. **The frontend half is already live**, and is harmless on its own — the server never
   sends `PasswordChangeRequired` until `@47` exists.
2. **`usageMetrics()` / `getUsageMetrics()`** — inert. Not on the `doPost` path, so it changes no
   behaviour at all; it exists to be run from the Apps Script editor.

⚠️ **Deploying is Praew's call and needs confirming — staff are on it.** Procedure and the
diff-the-clasp-mirror-first rule are in `REFERENCE.md`. The mirror at `~/nicu-tools/neofeed/รหัส.js`
**must be diffed and reconciled, never overwritten** — on 2026-08-17 it was found holding three
security fixes that existed in no other copy.

**Rollback (backend):**
```
clasp update-deployment -V 45 AKfycbz8NtHuyTdo4EP-ZKb5n5LIRqVzGSY286MZRlXMniO51xjiuQO7eOLvltsrejkL4GgV
```

⚠️ **`@46` has still not been exercised by a real login or a real Delete.** Its harnesses run
against stubs, which do not model CacheService eviction or LockService contention. Doing that
before cutting `@47` is in `BACKLOG.md` § Now.

---

**This file has exactly one job: what is live right now.** Updating it is part of the definition of
done for a deploy — same commit, not "later". It went stale twice when it lived inside `HANDOFF.md`,
and `NeoFeed/CLAUDE.md` was found on 2026-08-21 still claiming `@45`, four days out of date, which
is why that file no longer restates a version at all. Anything that is not current deployment state
belongs in `BACKLOG.md`, `PRD.md`, `REFERENCE.md` or `CHANGELOG.md`.
