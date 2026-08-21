# NeoFeed — Handoff (index)

**This file was split on 2026-08-21.** It had grown to 2,138 lines doing four jobs at
once, and the parts that changed rarely sank to the bottom where nothing ever looked at
them again. Each job now has its own file and its own update trigger:

| Read this | For | Changes |
|---|---|---|
| **`STATUS.md`** | what is deployed **right now**, and how to roll it back | every deploy |
| **`BACKLOG.md`** | everything known-but-not-done | weekly |
| **`REFERENCE.md`** | GA/PMA convention, hand-synced shells, deploy procedure, PDPA posture | rarely |
| **`CHANGELOG.md`** | session-by-session history, newest first | append-only |

Architecture and file inventory live in **`app-walkthrough.md` § 2** — one copy, not three.
Code-review write-ups keep their own dated files (`CODE_REVIEW_YYYY-MM-DD.md`); their
*unfixed* findings are carried into `BACKLOG.md` so they cannot go quiet.

### If you followed a reference here

Code comments and older docs say things like *"see `HANDOFF.md` 2026-08-10 (3)"*. Those
mean the **session entry** of that date, which is now in **`CHANGELOG.md`** — all 36
entries were carried over verbatim, and the one that had been filed out of order
(2026-07-12 (3)) is back in its chronological slot.

### What was deleted rather than moved

Two sections were **not** carried over, because both were stale enough to be actively
misleading. Both dated from around session 8 (2026-05-25) and had survived 31 later
sessions being appended above them:

- **`## TLDR — read this only`** — sat near the very bottom of the file, so the section
  titled *"read this only"* was the least findable thing in it, and every load-bearing
  claim was wrong: a superseded GAS URL, `"currently commented out … sandbox uses mock
  data"` (production was live), `"Daily_Log now has 16 columns (A-P)"` (it reaches AC-AE),
  and **`"No open bugs."`** while the banner twelve lines from the top of the same file
  listed an unconfirmed stock concentration.
- **`## Restore production checklist`** — described restoring the app *from* sandbox mode
  and told the reader to paste the backend into the Apps Script editor, which would have
  switched the live app's executing identity. Replaced by the verified procedure in
  `REFERENCE.md`.

A third, **`## File inventory`**, was dropped as a duplicate: it still described
`fenton.jsx` as *"Fenton 2013"* and the schema as *"A-P"*. `app-walkthrough.md` § 2 is the
one copy.

The rest of the old tail — GA/PMA convention, PDPA posture, and the May-era "Known
caveats" (kept, but flagged unverified, in `BACKLOG.md` § 5) — was carried over.
