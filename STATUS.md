# NeoFeed — Status

**Updated 2026-08-17** · 🟢 **DEPLOYED — production is `@46`**, carrying GitHub `main` `df5df2b`.

| | |
|---|---|
| Frontend | GitHub Pages serves `index.html` from repo root |
| Backend | GAS deployment `AKfycbz8Nt…` — URL unchanged since `@43` |
| Deploy identity | `peeraporn.po@chula.ac.th` (`executeAs: USER_DEPLOYING` — a different account switches the live app's identity) |
| Migrations | none outstanding on any tab |

**Rollback:**
```
clasp update-deployment -V 45 AKfycbz8NtHuyTdo4EP-ZKb5n5LIRqVzGSY286MZRlXMniO51xjiuQO7eOLvltsrejkL4GgV
```

⚠️ **`@46` has not been exercised by a real login or a real Delete.** Its harnesses run
against stubs, which do not model CacheService eviction or LockService contention.

---

**This file has exactly one job: what is live right now.** Updating it is part of the
definition of done for a deploy — same commit, not "later". It went stale twice when it
lived inside `HANDOFF.md`. Anything that is not current deployment state belongs in
`BACKLOG.md`, `REFERENCE.md` or `CHANGELOG.md`.
