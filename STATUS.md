# NeoFeed — Status

**Updated 2026-08-21** · 🟢 **DEPLOYED — backend production is `@47`**, carrying GitHub `main`
`34af805`. Frontend and backend are in step; **nothing is pending.**

| | |
|---|---|
| Frontend | GitHub Pages serves `index.html` from repo root. Live and verified — `app.jsx?v=pwd-gate-0821` |
| Backend | GAS deployment `AKfycbz8Nt…` at **`@47`** — *"mustChangePassword server gate + usageMetrics M1 (GitHub main 34af805)"* |
| Deploy identity | `peeraporn.po@chula.ac.th` — confirmed via `clasp show-authorized-user` before the push (`executeAs: USER_DEPLOYING`, so a different account switches the live app's identity) |
| Migrations | none outstanding on any tab |
| Cache-bust | `app.jsx?v=pwd-gate-0821`; `registry.jsx?v=dol-input-fix1`; others unchanged. Both shells byte-identical |

**What `@47` changed:** the `mustChangePassword` server gate — a temp-password account can now do
nothing but change its password — plus `usageMetrics()` / `getUsageMetrics()`, which are inert
(not on the `doPost` path).

**Rollback (backend):**
```
clasp update-deployment -V 46 AKfycbz8NtHuyTdo4EP-ZKb5n5LIRqVzGSY286MZRlXMniO51xjiuQO7eOLvltsrejkL4GgV
```

## How `@47` was verified

Not assumed — each step checked, per `REFERENCE.md`:

1. **Mirror diffed first, not overwritten.** `~/nicu-tools/neofeed/รหัส.js` was 1,346 lines to the
   repo's 1,470, and **every one of the 124 differing lines was a repo addition** — the mirror held
   nothing unique this time. (It did on 2026-08-17, which is why the rule exists.) A backup was
   taken before the copy regardless.
2. **`clasp show-authorized-user`** → `peeraporn.po@chula.ac.th`, the correct deploy identity.
3. `clasp push` → 2 files. `clasp create-version` → **47**.
4. **`clasp update-deployment -V 47 <existing id>`** — the deployment count stayed at **26**, which
   is the proof a *new* deployment was not created and `NEOFEED_GAS_URL` is unchanged.
5. **`clasp pull` into a scratch dir, diffed against `gas-backend.gs` → byte-identical.** The
   deployed source is exactly the source the 14 harnesses pass against.
6. **Live smoke test:** an unauthenticated `getActivePatients` against the production URL returns
   `{"error":"Unauthorized"}` — the script loads, `doPost` runs, `verifyToken` refuses, and no
   patient data is returned.

⚠️ **Still not exercised by a real login or a real Delete.** This carried over from `@46` and now
applies to `@47`, which adds an auth gate on top. The harnesses run against stubs that model
neither `CacheService` eviction nor `LockService` contention. **One real login by Praew discharges
it** — see `BACKLOG.md` § Now.

---

**This file has exactly one job: what is live right now.** Updating it is part of the definition of
done for a deploy — same commit, not "later". It went stale twice when it lived inside `HANDOFF.md`,
and `NeoFeed/CLAUDE.md` was found on 2026-08-21 still claiming `@45`, four days out of date, which
is why that file no longer restates a version at all. Anything that is not current deployment state
belongs in `BACKLOG.md`, `PRD.md`, `AI_SDLC.md`, `REFERENCE.md` or `CHANGELOG.md`.
