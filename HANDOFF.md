# NeoFeed — Handoff (index)

**This file was split on 2026-08-21.** It had grown to 1,985 lines doing four jobs at
once, and the parts that changed rarely sank to the bottom where nothing ever looked at
them again. Each job now has its own file and its own update trigger:

| Read this | For | Changes |
|---|---|---|
| **`STATUS.md`** | what is deployed **right now**, and how to roll it back | every deploy |
| **`BACKLOG.md`** | everything known-but-not-done | weekly |
| **`REFERENCE.md`** | GA/PMA convention, hand-synced shells, deploy procedure, PDPA posture | rarely |
| **`CHANGELOG.md`** | session-by-session history, newest first | append-only |

Architecture and file inventory live in **`app-walkthrough.md` § 2** — one copy, not three.

### If you followed a reference here

Code comments and older docs say things like *"see `HANDOFF.md` 2026-08-10 (3)"*. Those
mean the **session entry** of that date, which is now in **`CHANGELOG.md`** — every entry
was carried over verbatim, and the one that had been filed out of order
(2026-07-12 (3)) is back in its chronological slot.

### What was deleted rather than moved

Two sections were **not** carried over, because both were stale enough to be actively
misleading. Both dated from around session 8 (2026-05-25) and had survived 27 later
sessions being appended above them:

- **`## TLDR — read this only`** — sat at line 1798 of 1985, i.e. the section titled
  *"read this only"* was the least findable thing in the file, and every load-bearing
  claim in it was wrong: a superseded GAS URL, `"currently commented out … sandbox uses
  mock data"` (production was live), `"Daily_Log now has 16 columns (A–P)"` (it reaches
  AC–AE), and **`"No open bugs."`** while the banner twelve lines from the top of the same
  file listed an unconfirmed stock concentration.
- **`## Restore production checklist`** — described restoring the app *from* sandbox mode
  and told the reader to paste the backend into the Apps Script editor, which would have
  switched the live app's executing identity. Replaced by the verified procedure in
  `REFERENCE.md`.

The rest of the old tail — GA/PMA convention, PDPA posture, and the May-era "Known
caveats" (kept, but flagged unverified, in `BACKLOG.md` § 4) — was carried over.
