# NeoFeed as a local tool, with no internet — spec

Praew, 2026-10-08: *"ลองคิดวิธีที่จะทำให้ NeoFeed กลายเป็น local tool ได้ โดยไม่ผ่าน internet แต่สามารถเก็บ data
ทั้งหมดได้ด้วย"*: NeoFeed should run as a local tool that never touches the internet and still keeps all
of its data. The design below was approved in chat the same day, one section at a time.

## Decisions (Pp, 2026-10-08)

| # | Question | Decision |
|---|---|---|
| D1 | How the ward reaches it | **One ward PC is the server.** Other PCs and tablets open it over the hospital LAN or Wi-Fi. Nothing goes to the internet. |
| D2 | Why local | All four reasons: patient data stays in the hospital (PDPA); the ward keeps working when the internet or Google is down; another hospital can install its own copy; and the app stops depending on Apps Script's speed, quotas and deploy steps. |
| D3 | Approach | **Run the existing `gas-backend.gs` on Node 24 and replace the Google services under it with SQLite-backed equivalents.** Rejected: rewriting the backend as native Node (two backends to keep in step while KCMH stays on Apps Script), and Next.js + Docker (below). |
| D4 | Where backups go (pilot) | A central drive managed by hospital IT (NAS or file share). |
| D5 | HTTPS certificate (pilot) | Issued by hospital IT. The admin CLI can also make a local CA, as a fallback. |

This replaces the plan noted on 2026-09-13 in the Desktop wiki (move to Next.js + Docker; never written
in this repo). That plan came from a Gemini answer that assumed NeoFeed was a Next.js app with an AI
service; it is neither. A Next.js rewrite would throw away a working frontend and its harnesses, and
Docker Desktop on a hospital PC needs administrator rights, WSL2 and possibly a paid licence for a
large organisation.

## What the code already gives us

- **The backend already runs in Node.** `test/gas-vm-sandbox.cjs` loads the real `gas-backend.gs`
  into a `vm` with stateful doubles for SpreadsheetApp, CacheService, PropertiesService, LockService,
  UrlFetchApp, MailApp and Utilities, and drives `doPost` end to end. The local server is that
  sandbox with a durable store under it.
- **One endpoint.** The frontend's `gasRequest` (`app.jsx`) POSTs `{action, token, ...}` as
  `text/plain` to `window.NEOFEED_GAS_URL` (`boot.js:50`). `doGet` only answers `ping`.
- **Five tabs with fixed headers.** Patient_Registry, Daily_Log, Nursing_Log, Staff and Audit_Log;
  the column map is at `gas-backend.gs:35-61`, and `_assertSchema` (`gas-backend.gs:985`) refuses
  writes when a header row drifts.
- **Few Google-only calls.** `UrlFetchApp` is used once, to check a Google sign-in token
  (`gas-backend.gs:184`). `MailApp` sends help requests (`gas-backend.gs:3845`). `onEdit`
  (`gas-backend.gs:784`) issues temporary passwords for Staff rows typed into the sheet. Fonts load
  from Google Fonts (`index.html:1984`, `NeoFeed.html:1984`).
- **A sibling on the same stack.** NICU Center Point runs on Node 24 with the built-in `node:sqlite`
  and two npm dependencies. Using the same stack keeps a later NeoFeed ↔ Center Point link simple.

The frontend's mock mode (empty `NEOFEED_GAS_URL`) is not the starting point: it keeps writes in memory
only.

## Architecture

```
ward PCs / tablets ──LAN or Wi-Fi (HTTPS)──▶ ward server PC
                                              ├─ static frontend (the same built files)
                                              ├─ POST /api ─▶ gas-backend.gs (unchanged) in a vm
                                              │                └─ local Google services ─▶ neofeed.db
                                              └─ admin CLI (staff, health report, backup, restore)
```

### Components

1. **`local/server.mjs`** — Node 24 `node:https`, no framework. Serves the built frontend and
   `/neofeed-config.js`, and passes each `POST /api` body to `doPost`. One origin, so no CORS.
2. **`local/gas-runtime/`** — the Google services, each replaced:

   | Service | Local replacement |
   |---|---|
   | SpreadsheetApp | Sheets model on SQLite (below) |
   | PropertiesService | SQLite table `properties` (config, lockout counters, session epochs, `DATA_VERSION`, switches) |
   | CacheService | In-memory map with the same TTL and size rules; a server restart signs everyone out, as an Apps Script cache flush would |
   | LockService | No-op. Node handles one request at a time and `node:sqlite` is synchronous, so writes are already serialised |
   | MailApp | Rows in SQLite table `outbox`, read with `admin.mjs outbox`; nothing is sent |
   | UrlFetchApp | Throws "unavailable offline"; the Google sign-in path is unreachable |
   | Utilities, Session, ContentService | Node `crypto`/`zlib`; time zone Asia/Bangkok; JSON text out |

3. **Frontend config** — `boot.js` reads `window.NEOFEED_CONFIG` from `/neofeed-config.js` when the
   server provides it: backend URL `/api`, no Google client ID (so no Google button). Without the file
   the cloud values stay. One build serves both. Fonts (IBM Plex Sans, Mono, Sans Thai; Sarabun; all
   OFL) move into the repo, so the cloud app stops calling Google Fonts too.
4. **`local/admin.mjs`** — replaces hand edits to the sheet and the functions run from the Apps Script
   editor: `add-staff` (prints the temporary password once; the must-change flow is unchanged),
   `reset-password`, `set-role`, `deactivate`, `health` (`sheetHealthReport`), `usage`
   (`getUsageMetrics`), `outbox`, `backup`, `verify-backup`, `restore`, `import`, `make-ca`.

### One Sheets model, two stores

The backend depends on how Sheets stores values, and `gas-vm-sandbox.cjs` already models it: a
`YYYY-MM-DD` string comes back as a Date at Bangkok midnight; a leading apostrophe forces text and is
not stored; `getLastRow()` is the last row with content; reads past the grid edge throw. Move that model
out of the test file into `local/gas-runtime/` and give it two stores: memory (the harnesses) and SQLite
(the server). The test double and the production runtime then cannot drift apart.

Cells are stored as typed JSON (string, number, boolean, or date as an ISO instant), so a Date written
by the backend comes back as a Date.

### Request lifecycle

1. Parse the body (limit 5 MB) and open a SQLite transaction.
2. Call `doPost`. Everything it writes, including `Audit_Log` rows, goes through the transaction.
3. When `doPost` returns, commit, then reply. The client never sees "saved" for data that is not on
   disk.
4. If `doPost` throws, roll back and reply with a server error. The frontend already treats that as a
   failed save; an unsaved order stays in its 72-hour browser draft (`neofeed_draft_*`).

Apps Script keeps the writes made before an error that the backend catches and reports; so does this
runtime, because a caught error still returns normally. Only an uncaught throw rolls back.

## Data

- **One file**: `C:\ProgramData\NeoFeed\neofeed.db`, outside OneDrive and any synced folder (the
  Center Point rule). File access for the server's Windows account and local administrators only.
  BitLocker on the drive.
- **Tables**: `sheet_rows(tab, row, cells)`, one row per sheet row with row 1 as the header row, so
  `_assertSchema` keeps working; `properties(key, value)`; `outbox(id, ts, to_addr, subject, body)`;
  `schema_version`.
- **Durability**: `journal_mode=WAL`, `synchronous=FULL`. A power cut after a reply loses nothing.
- **Everything is kept.** Whatever the backend writes on Apps Script, it writes here, `Audit_Log`
  included. Nothing is purged; retention stays the open PDPA item in `BACKLOG.md`.
- **Backups (D4)**: nightly `VACUUM INTO` a dated file in `C:\ProgramData\NeoFeed\backups\`, then
  copied to the hospital share. Keep 30 daily and 12 monthly copies, and take one before every update.
  If the share is unreachable the local copy stays and `admin.mjs status` reports the last copy that
  reached the share. Backup files hold patient data: the share is limited to NeoFeed admins and IT.
- **Restore drill**: `admin.mjs verify-backup <file>` runs `PRAGMA integrity_check` and compares row
  counts per tab with the live database. Run it monthly. A backup that has never been restored does
  not count.
- **Moving data from Google Sheets**: `admin.mjs import <export>` loads a Sheets export into an empty
  database and runs the health report. The export format (`.xlsx` or one CSV per tab) is chosen in the
  plan; JSON-in-cell columns and blank cells must round-trip unchanged. It is built and tested on
  synthetic exports only. Moving KCMH's real data is phase 3.

## Security

- **HTTPS is required (D5).** Over plain HTTP, passwords and patient data cross the ward Wi-Fi
  readable by anyone on it. The browser also withholds `navigator.clipboard` outside a secure context,
  which breaks the order copy button (`calculator.jsx:3492`). The server reads a PEM certificate and
  key from its config; `admin.mjs make-ca` makes a local CA and server certificate when IT cannot
  supply one, at the cost of installing the CA on every ward device.
- **Sign-in**: password only, with the existing rules unchanged: HMAC-SHA256 with 3000 rounds, a
  15-minute lockout after 5 failures, sessions sliding for 6 hours with a 12-hour cap, a 30-minute idle
  logout in the browser, and the roles admin, doctor and nurse. The temporary password still sits in
  plain text in Staff column H until first sign-in, as on Apps Script.
- **Network**: the server binds to the address in its config. A Windows Firewall rule opens its one
  port to the hospital subnet only. The server makes no outbound connection.
- **Headers**: the CSP and security headers from `_headers`, with `connect-src 'self'` and fonts from
  `'self'`.
- **Server PC**: a dedicated Windows account runs the server; screen lock and BitLocker on.
- **PDPA**: data stays in the hospital, so the cross-border question in `BACKLOG.md` (Sec 28) does not
  arise for a local install. Each hospital is the controller of its own data; Valhalla supplies the
  software. This design is not a PDPA determination. Help requests no longer reach the Valhalla team
  from a local install; the local admin reads them.

## Install and update

- **Package**: one zip with the official portable Node (24.20 or newer; older Windows builds can crash
  on exit, see Center Point's README), the app and the fonts. Installing needs no internet and no
  Docker.
- **`install.ps1`**: creates the data and backup folders with their permissions, adds the firewall
  rule, registers a Task Scheduler task that starts the server at boot whether or not anyone is signed
  in, with "start on battery" ticked (Windows' default silently skips the task on battery), creates the
  first admin, and prints the URL and a QR code for tablets.
- **`update.ps1`**: backs up, swaps the program folder, restarts, and checks `/api` answers `ping`.
  If it does not, it puts the old folder back. Schema changes are versioned in `schema_version` and
  run once at start.
- **Version**: the footer shows the version, so it is clear which build each ward runs.

## Tests, written before the code

1. **Backend harnesses on SQLite.** The `gas-vm-sandbox.cjs` harnesses run a second time on the SQLite
   store and must pass the same way.
2. **Parity.** One scripted session (login, register, order, edit, publish, nursing entry, weights,
   delete) runs against the memory store and the SQLite store; every reply must match.
3. **Durability.** Write, kill the server, restart: every row is there. A request whose `doPost` throws
   leaves no trace.
4. **No network.** A Playwright run of `test/runthrough-app.cjs`'s flow against the real local server,
   with every host except the server blocked: the app works and makes no other request.
5. **Backup and restore.** Back up, restore into an empty folder, compare every row.
6. **CI.** A `local-runtime` job in the existing workflow runs 1–5.

## Phases

1. **Runtime, server, config, fonts, admin CLI and tests**, on Pp's PC with synthetic data. Done when
   tests 1–6 pass and the app works with the network cable out.
2. **Installer, backups to the share, HTTPS**, on one ward PC with synthetic data. Done when a tablet
   on the ward Wi-Fi completes the runthrough and a backup is restored from the share.
3. **Decide what goes live**: moving KCMH's real data, or a first install at another hospital. Needs
   hospital IT (certificate, share, firewall), the unit head and the DPO first.

## Effect on the cloud app

The self-hosted fonts and the `boot.js` config read reach the cloud app too: `_headers` drops the
Google Fonts origins, and the test that pins `NEOFEED_GAS_URL` against `_headers` must still pass for
the cloud values. They ship the usual way, `main` → `release`. `gas-backend.gs` is unchanged, so no
`clasp` deploy is needed.

## Not in this work

- Sync between devices, or between a local install and the cloud.
- Google sign-in without internet.
- The Center Point link.
- Rewriting the backend as native Node. Reconsider once Apps Script is retired.
- A service worker for the cloud app (its own `BACKLOG.md` item).
- Docker.

## Open, to settle in the plan or with IT

- The Sheets export format for `import`.
- Which ward PC is the server, and who is its local admin.
- With IT: the certificate and hostname, the backup share, the firewall rule.
