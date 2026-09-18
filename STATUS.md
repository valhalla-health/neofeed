# NeoFeed — Status

> ✅ **2026-09-18, 11:17 ICT — frontend `release` = `96afcd0` on both hosts, with backend `@55`.** Two
> frontend deploys today: the 2026-09-17 review (PR #74, 09:10 ICT), then the ward requests plus
> Soluvit/Peditrace × Factor (PR #77, 11:17 ICT). On both hosts the shell and every script it loads
> are byte-identical to `release`. ⚠️ **#77 changed the pharmacy form**: every new NICU/SCN order
> starts with 30 mL dead space, and Soluvit and Peditrace are now × Factor. `BACKLOG.md` asked for
> pharmacy to be told before it shipped, and nothing records that it was. ⚠️ **No one has reported
> using either frontend yet**, and `curl` runs no JavaScript. Next: pharmacy, then the bedside session
> (`BACKLOG.md` § Now).

**Updated 2026-09-18, 11:17 ICT** · 🟢 **Backend `@55` and frontend `release` = `96afcd0` are live.**
- **Frontend:** PR #77 (`main` → `release`), approved and merged by `tasamew` at 04:17 UTC /
  11:17 ICT. On top of the review frontend (#74) it ships PR #75, the 2026-09-18 ward requests (MEN
  counts toward no nutrient total, a Magnesium tile, Aminoplasmal 15% hidden on NICU/SCN, a 30 mL
  dead-space default on NICU/SCN), and Soluvit/Peditrace × Factor — `CHANGELOG.md` 2026-09-18 (2).
  `CONSTANTS_VERSION` is now `2026-09-18.1`. Served bytes verified on both hosts at 11:37 ICT — see
  "How the 2026-09-18 ward-requests deploy was verified".
- **Backend:** `@55`, unchanged since 08:42 ICT. Neither frontend deploy touched `gas-backend.gs`, which
  is still byte-identical to `7049f60`, the source `@55` was cut from.
- ⚠️ **Not yet exercised by a person:** either frontend. Their provenance stamps, in `Daily_Log`
  columns AF–AG and in every printed order's footer, can show them in use without a bedside session —
  see those sections.

**Previous (2026-09-18, 09:10–11:17 ICT):** backend `@55` + frontend `release` = `dfeb15b` — the
review's frontend (PR #74), approved and merged by `tasamew` at 02:10:44 UTC / 09:10 ICT: the `.jsx`
modules precompiled into `compiled/`, React self-hosted in `vendor/`, `?v=` tokens that are content
hashes, and a CSP with no inline script and no eval. Served bytes verified on both hosts at 09:54 ICT
— see "How the 2026-09-18 frontend deploy was verified".

**Previous (2026-09-18, 08:42–09:10 ICT):** backend `@55` + frontend `?v=sync-poll-0916` — the
review's backend half, shipped first.
- **Backend:** `@55` = `gas-backend.gs` at `7049f60` (PR #73), deployed with `clasp` at 08:42 ICT on
  Praew's go-ahead, after `sheetHealthReport()` passed on its second run — see "How the 2026-09-18
  backend deploy was verified".
- **Frontend:** unchanged since 2026-09-16 (`release` = `098bd37`).
- ✅ **Real login + save on `@55`:** reported working by Praew on 2026-09-18, minutes after the
  switch, with the live `sync-poll-0916` client.

**Previous (2026-09-16):** backend `@54` + frontend `?v=sync-poll-0916` — the sync-screen release
(#70 → #71).
- **Frontend:** `release` = `098bd37`, merged by `tasamew` at 10:29 UTC / 17:29 ICT on 2026-09-16.
  `data.js` and `app.jsx` move to `?v=sync-poll-0916`; `calculator.jsx` stays `ward-gate-0915`
  (its content changed, but only Center-Point-gated code — see below).
- **Backend:** **unchanged, still `@54`.** `gas-backend.gs` is byte-identical across this deploy,
  so no `clasp` step was run and none was needed.
- ✅ **Served bytes verified on both hosts** at 10:47 UTC / 17:47 ICT — `index.html`, `app.jsx`,
  `data.js` and `calculator.jsx` fetched live are byte-identical to `origin/release`, and
  `/center-point/` is `404` on both. ⚠️ **Still open: no human has opened the live app since the
  merge** — `curl` does not run JavaScript. See "How the 2026-09-16 deploy was verified".

**Previous (2026-09-15):** frontend `?v=bed-guard-0915` + backend `@54` — the ward-gate /
one-infant-per-bed release (#63) plus the discharged-record fix (#66), deployed in two steps,
`ward-gate-0915` via PR #65 and `bed-guard-0915` via PR #67 (20:42 ICT), backend `@54` via `clasp`
at 20:47 ICT. Verified on both hosts and against the pulled version 54 source — see "How the
2026-09-15 deploy was verified".
🟢 **Deploy gate is CLOSED on both hosts** — merging into `release` deploys Cloudflare *and* GitHub
Pages; `main` deploys nothing. See "Release-branch deploy gate".

## How the 2026-09-18 ward-requests deploy was verified

**What ships:** PR #77 merged `main` (`fc2c35c`) into `release` as `96afcd0` — opened by
`praewxtvl`, approved by `tasamew` at 04:17:23 UTC, merged by `tasamew` at 04:17:33 UTC / 11:17 ICT.
Eight commits since the previous release (`dfeb15b`), merge included: PR #75 (the ward requests) and
two commits pushed straight to `main` (`6d52242`, `fc2c35c`: Soluvit/Peditrace × Factor and its docs).
`git diff origin/main origin/release` was empty when checked. What changed on the hosts: `data.js`
(`CONSTANTS_VERSION` `2026-09-05.1` → `2026-09-18.1`), `compiled/calculator.js`, and the two shell
tokens that load them; `calculator.jsx` changed too, published but not loaded. No backend change:
`gas-backend.gs` is untouched.

**Confirmed from primary sources** (read-only; `gh`, then `curl` at 04:37–04:38 UTC / 11:37 ICT, by
the method in the next section):
- ✅ **Checks on `96afcd0` itself:** `harnesses` success (run 35306407007, 04:17:38–04:21:39 UTC);
  `Workers Builds: neofeed` success at 04:18:01 UTC; `pages build and deployment` (run 35306405983)
  success — the Pages build of `96afcd0` is `built` with no error, and the `github-pages` deployment
  reached `success` at 04:18:15 UTC.
- ✅ **Served bytes, both hosts:** `/` is byte-identical to `release`'s `index.html`, and all eight
  scripts are byte-identical to `origin/release`, each hashing to its own `?v=`. Two tokens changed:
  `data.js?v=1857fa896b` (84,295 bytes) and `compiled/calculator.js?v=c22c5394ad` (189,428 bytes); the
  other six are unchanged. The `vendor/` files, the six `.jsx` sources, `manifest.json` and
  `moved.html` are byte-identical too, and the `404`s and Cloudflare's CSP are unchanged.

**What changes for staff** (details in `CHANGELOG.md` 2026-09-18 (2)):
- A feed ticked **MEN (trophic)** counts toward no nutrient total: no tile, alert, saved `Daily_Log`
  figure, printed total or copied order includes it.
- A **Magnesium tile** beside Na, K, Ca and P. **Aminoplasmal 15%** is built but not offered on NICU
  or SCN, which is every patient today.
- **Every new NICU/SCN TPN order starts with 30 mL dead space.** The pharmacy form prints the Factor and
  PREPARED figures and ปริมาตรคาสาย 30 mL; a day copied from yesterday turns yesterday's 0 into 30; each
  infant's first order afterwards shows *Dead space 0 → 30 mL* under "Changes vs previous order".
- **Soluvit and Peditrace are × Factor**, so the infant receives the full 1 mL/kg. On an overfilled bag
  the printed vitamin mL, components and WFI now differ from the KCMH worksheet (G43/G45): 2.5 against
  2.0 mL for a 2 kg infant on a 120 mL day.
- ⚠️ **Pharmacy.** `BACKLOG.md` said to tell pharmacy about × Factor *before this release ships*.
  Nothing in the repo records that it was done; it is now the first item in § Now.

**Still NOT confirmed — `curl` does not run JavaScript:** the same three gaps as in the next section,
and nobody has reported using this frontend. **The quickest proof** is its stamp. Saves and printouts
from this frontend carry

```
b=f48894ce64;d=1857fa896b;i=e7f309e445;c=c22c5394ad;f=690bebc4ac;r=2ab223374f;l=7c8755be83;a=b7969bb20d
```

with constants `2026-09-18.1` (`Daily_Log` AF, and the printed footer). A stamp with `d=3626f2a02e` and
`c=7afa9076db` came from a tab loaded between 09:10 and 11:17 ICT (the #74 frontend); one with named
tokens such as `a=sync-poll-0916`, from a tab loaded before 09:10.

**Rollback (frontend):** revert `96afcd0` on `release` — `git revert -m 1 96afcd0` in a PR into
`release`, the procedure in the next section — which returns both hosts to `dfeb15b`. The backend
needs no change either way.

---

## How the 2026-09-18 frontend deploy was verified

*Superseded at 11:17 ICT by PR #77 (section above). The tokens and stamp in this section are
`dfeb15b`'s; `data.js` and `compiled/calculator.js` have changed since.*

**What ships:** PR #74 merged `main` (`f0c172c`) into `release` as `dfeb15b` — opened by
`praewxtvl`, approved by `tasamew` at 02:03 UTC, merged by `tasamew` at 02:10:44 UTC / 09:10 ICT.
Enumerated because a `main` → `release` merge ships everything waiting (the 2026-09-16 lesson): 33
commits since the previous release (`098bd37`), which are PR #73 (the 2026-09-17 review) and three
docs-only changes (#72, `42ce553`, `f0c172c`). Nothing else rode along, and
`git diff origin/main origin/release` is empty. What changed on the hosts: both shells, `boot.js`
(new), `compiled/` and `vendor/` (new), `data.js` (null-safe weight look-ups only;
`CONSTANTS_VERSION` stays `2026-09-05.1`), `moved.html`, and the host configuration (`_headers`,
`.assetsignore`, `_config.yml`, `wrangler.jsonc`). Five `.jsx` sources changed as well; all six are
still published, for this release only, but no shell loads them any more.

**Confirmed from primary sources** (read-only; `gh`, then `curl` at 02:54–02:55 UTC / 09:54 ICT):
- ✅ **Checks on `dfeb15b` itself:** `harnesses` success (run 35298318707, 02:10:51–02:14:37 UTC);
  `Workers Builds: neofeed` success at 02:11:24 UTC; `pages build and deployment` (run 35298317108)
  success — the Pages build of `dfeb15b` is `built` with no error, and the `github-pages` deployment
  reached `success` at 02:11:26 UTC. The combined commit status reads `pending` only because this
  repo has no commit statuses; everything here reports as a check run.
- ✅ **Served bytes, both hosts, every request with a `?nocache=` query string.** `/` is
  byte-identical to `release`'s `index.html` (61,438 bytes) on Cloudflare and on GitHub Pages. Each
  script the shell loads was fetched twice, once exactly as a browser asks for it and once with
  `&nocache=` added. Every copy is byte-identical to `origin/release`, and every `?v=` token equals
  the first 10 hex characters of the SHA-256 of the file it loads (CRLF → LF, as `token()` in
  `tools/build.mjs`):

  | Script | `?v=` | Bytes |
  |---|---|---|
  | `boot.js` | `f48894ce64` | 3,037 |
  | `data.js` | `3626f2a02e` | 81,018 |
  | `compiled/icons.js` | `e7f309e445` | 2,515 |
  | `compiled/calculator.js` | `7afa9076db` | 186,708 |
  | `compiled/fenton.js` | `690bebc4ac` | 27,307 |
  | `compiled/registry.js` | `2ab223374f` | 57,286 |
  | `compiled/log.js` | `7c8755be83` | 28,158 |
  | `compiled/app.js` | `b7969bb20d` | 130,398 |

  The two `vendor/` React 18.3.1 files (no token; the name carries the version) are byte-identical
  too, and so are the six `.jsx` sources, `manifest.json` and `moved.html`. Cloudflare answers
  `/moved.html` with a `307` to `/moved`, its default HTML handling, and serves the same bytes there.
  `boot.js` matters most here: without it the app silently falls back to LOCAL MOCK MODE.
- ✅ **Not served — `404` on both hosts:** `gas-backend.gs`, `STATUS.md`, `tools/build.mjs`,
  `tools/package.json`, `test/verify-build-shells.cjs`, `center-point/`, `NeoFeed.html`.
- ✅ **Cloudflare's CSP, as served:** `script-src 'self' https://accounts.google.com` — no
  `'unsafe-inline'`, no `'unsafe-eval'`, no unpkg — and `connect-src` names the NeoFeed Apps Script
  deployment by its full path. GitHub Pages still sends no CSP (it has no `_headers` support).
- ✅ **Caching:** Cloudflare serves the shell with `Cache-Control: public, max-age=0, must-revalidate`,
  so each device gets the new shell at its next page load. GitHub Pages sends `max-age=600`, which
  matters little, because that host only redirects.

**Still NOT confirmed — `curl` does not run JavaScript:**
- ❌ **No one has reported using the new frontend since the merge.** Byte identity proves what is
  *served*, not that it *runs*. If the live CSP refused one of the scripts, the page would be blank,
  and only a browser can show that.
- ❌ **Which devices have switched.** A tab opened before 02:11 UTC keeps running `sync-poll-0916`
  until it is reloaded. That pairing is safe — it is what ran with `@55` from 08:42 to 09:10 ICT — but
  it has no idle logout and none of the review's client fixes.
- ❌ **The GitHub Pages redirect now runs from `boot.js`**, not from an inline script in the shell.
  `curl` shows `boot.js` is served; the redirect was last watched in a real browser on 2026-09-11,
  under the old inline guard.

**The quickest proof, no bedside session needed:** every save records the frontend that made it in
`Daily_Log` column AG (`appVersion`), and every printed order carries the same stamp in its footer,
after "app". The new frontend's stamp is

```
b=f48894ce64;d=3626f2a02e;i=e7f309e445;c=7afa9076db;f=690bebc4ac;r=2ab223374f;l=7c8755be83;a=b7969bb20d
```

A stamp made of the old named tokens (for example `a=sync-poll-0916`) came from a tab still on the
old frontend. `window.NEOFEED_DATA.appVersion()` returns the same string in the console of the login
screen, with no sign-in.

**Then, at the bedside** — what only this frontend makes checkable (also in `BACKLOG.md` § Now):
1. The login screen must render, not stay blank, and should appear almost at once (on 2026-09-17 it
   took 10.7 s).
2. Leave a workstation untouched for 30 minutes: it must log out and say why.
3. Correct the birth weight of an infant with a saved order: Print must refuse, with the
   dosing-weight banner.
4. Enter a growth measurement on one device, then edit the same infant's diagnosis on another device
   that has not synced: the measurement must survive.
5. An infant on full feeds must no longer demand a lipid or K override reason.
6. Open `valhalla-health.github.io/neofeed/`: it must land on the Thai "moved" page.

**Rollback (frontend):** revert `dfeb15b` on `release` — `git revert -m 1 dfeb15b` on a branch cut
from `release`, then a PR into `release`; branch protection means `tasamew` approves it, and there is
no direct push. Both hosts redeploy from `release`. Revert the whole merge, never single files:
`_headers`, both shells, `boot.js`, `compiled/` and `vendor/` only work as a set (`REFERENCE.md`).
The result is `sync-poll-0916` with `@55`, the pairing that ran from 08:42 to 09:10 ICT today,
including Praew's real login and save; the backend needs no change. To release the review again
afterwards, revert the revert: Git counts the reverted commits as already merged, so a plain
`main` → `release` PR would not bring them back. If the primary host shows a blank page,
`npx wrangler rollback` (or the Worker's *Deployments* tab) is faster while the revert PR waits, but
it covers Cloudflare only, and any build from `release` before the revert lands would put the new
frontend back.

---

## How the 2026-09-18 backend deploy was verified

**Backend `@55`.** Deployed on Praew's explicit go-ahead, following `REFERENCE.md` and the review's
pre-deploy gate, with each step checked:

1. **All three copies agreed before anything was overwritten.** The mirror's working tree was clean.
   `clasp pull` of the editor HEAD, and of `--versionNumber 54`, into clean scratch dirs were
   byte-identical to the mirror's `รหัส.js` and `appsscript.json`, and the mirror was byte-identical to
   `gas-backend.gs` on `release`. Nobody had edited in the Apps Script editor since `@54`.
2. **Deploy identity and settings:** `clasp show-authorized-user` → `peeraporn.po@chula.ac.th`
   (clasp 3.3.0). The manifest is unchanged (`timeZone: Asia/Bangkok`, `executeAs: USER_DEPLOYING`,
   the same two `oauthScopes`), and the new code calls no Google service that needs another scope
   (new calls: `Utilities.gzip`/`ungzip`/`newBlob`/base64 and `LockService.waitLock`).
3. Copied `gas-backend.gs` from `7049f60` into `รหัส.js` with `git show`, so no CRLF: +1586 / −344
   lines. Committed in the mirror (`42dd655`), `clasp push`, `clasp create-version` → **55**.
4. **Pre-deploy gate: `sheetHealthReport()`, run by Praew from the editor, FAILED first.**
   `Patient_Registry` row 1 held `weights(JSON)`, `lengths(JSON)`, `hcs(JSON)` in M1:O1, so the
   column guard (`_assertSchema`, D7) would have refused every registry write. Every version of the
   code since the first commit writes `weights`/`lengths`/`hcs`, so the suffixes were added by hand;
   `@54` and earlier read by position and never noticed. Before anything was relabelled, a temporary
   read-only diagnostic (pushed to HEAD only, never deployed, removed afterwards) showed nothing had
   shifted: all 58 records hold JSON arrays in M–P, M's elements carry `dol`/`w`/`l`/`hc` and P's
   carry `bed`/`date`. Praew retyped M1:O1 and labelled the blank P1 (`bedHistory`) and Q1
   (`statusDate`). The second run passed: both tabs `ok: true`, and `Patient_Registry` has no blank labels.
5. **The rest of that report (08:40 ICT):**
   - the workbook is **158,024** grid cells = **1.6 %** of the 10,000,000-cell limit (`Audit_Log`:
     1,630 rows × 26 columns = 42,380 cells) — the trim in `BACKLOG.md` is worth doing, not urgent;
   - `archivedNoStatusDate` **3** — the infants who left ward devices at this deploy (the review
     estimated 47). `active` 30, `archivedWithin30d` 8, `archivedOlder` 17, `duplicateSessionIds` 0;
   - `measurementArraysFailingValidation` **1** — a Transferred record, off ward devices, whose stored
     first weight is `3` (kilograms where grams belong). `@55` refuses an edit of that record until
     the cell is corrected (`BACKLOG.md` § Now);
   - `activeWithNoEntryIn30d` 7, `sexNotBoysOrGirls` 0; `Daily_Log` 216 rows, 3 with a blank sessionId.
6. **`clasp update-deployment -V 55 AKfycbz8Nt…`** at 08:42:09 ICT. `clasp list-deployments` shows
   `AKfycbz8Nt…` at `@55`, and the count stayed **26**, so `NEOFEED_GAS_URL` is unchanged.
7. **Verified after going live:** `clasp pull --versionNumber 55` into a clean scratch dir is
   byte-identical to `gas-backend.gs` at `7049f60`, manifest unchanged. Live smoke test with no
   credentials and no writes, before (`@54`) and after (`@55`):
   - `GET ?action=ping` → `{"ok":true,…}` both times;
   - malformed `POST` (`not json`) → `@54` returned the raw parse error (`Unexpected token 'o', "not json"
     is not valid JSON`); `@55` returns the generic `เกิดข้อผิดพลาดในระบบ — ลองใหม่อีกครั้ง`, which proves
     `@55` is the one serving;
   - `GET` without an action → `{"error":"Use POST for authenticated actions."}`.
8. **Real login + save:** ✅ reported working by Praew (live `sync-poll-0916` client × `@55`). Which
   save path it used (an order or a registry edit) was not recorded.

⚠️ **clasp 3.3.0 never deletes a file that exists only in the remote project.** `clasp push` compares
the local files with HEAD, so after the temporary diagnostic it answered "Script is already up to
date" and left the extra file there. It was removed by pushing a scratch copy with one trailing
newline added (any change makes `push` send the full file set, which replaces the project's content),
then pushing the mirror; `clasp pull` confirmed HEAD = mirror, two files. `@55` was cut before the
diagnostic existed.

**What changes for staff under `@55` + `sync-poll-0916`** (the rest of the review needs the new frontend):
- **Sessions end 12 h after they start.** A session already open at the switch was stamped at its
  first request afterwards, so the deploy logged nobody out.
- **Saves are refused, with a Thai message, if a column is inserted by hand** into `Daily_Log` or
  `Patient_Registry`, or if a row moves between the read and the write (UP-B3/B4). Nothing is written.
- The 3 undated archived infants no longer reach ward devices (the admin archive keeps them). Sync
  reads less of the sheet and is served from a 5-minute cache.
- Login failures give one generic message, lockout counts before the slow hash, and logins, failures,
  lockouts and password changes are audited.

**Rollback (backend):** `@54` is a clean target. `@55` adds no columns, and old code ignores its new
cache and property keys (revoked session epochs stay revoked). The relabelled headers need no
rollback, because `@54` reads by position:
```
clasp update-deployment -V 54 AKfycbz8NtHuyTdo4EP-ZKb5n5LIRqVzGSY286MZRlXMniO51xjiuQO7eOLvltsrejkL4GgV
```

---

## How the 2026-09-16 deploy was verified

**What ships:** PR #70 (the sync-screen fix) merged to `main` as `39c7dd3`, then PR #71 merged
`main` → `release` as `098bd37`. 17 commits, because `release` had silently accumulated 15 before
this one — **a `main` → `release` merge is never "just the change you were working on"**, and the
backlog has to be enumerated before it is called a deploy. Alongside the sync fix it carried
**Center Point v2** (#57, #69), which `CHANGELOG.md` 2026-09-16 (2) had described as *"still a
synthetic draft; nothing deployed"*.

**Confirmed (primary sources, not inspection):**
- ✅ `origin/release` = `098bd37`; `git merge-base --is-ancestor 6e3b95f origin/release` passes, so
  the sync fix is genuinely on the deployed branch.
- ✅ `git show origin/release:NeoFeed.html` carries
  `grid-template-rows: var(--header-h) auto 1fr`, `.app > [role="status"] { grid-column: 1 / -1;
  grid-row: 2; }`, and `src="data.js?v=sync-poll-0916"` / `src="app.jsx?v=sync-poll-0916"`.
- ✅ **GitHub Pages** `pages build and deployment` run 206 on `098bd37` — **success**, 10:30 UTC.
- ✅ `harnesses` green on `098bd37` itself (run 41, 10:30 UTC), and on both `39c7dd3` (PR #71's
  head) and `6e3b95f` (PR #70's head). It is a required check on `release`.
- ✅ **Center Point is inert on the ward's screen.** `calculator.jsx` gains 66 lines, every one
  behind a `centerPoint` prop: that identifier appears **15× in `calculator.jsx` and 0× in
  `app.jsx` / `registry.jsx` / `log.jsx` / `fenton.jsx`**. The legacy screen never passes it, so the
  prop is always `undefined` there and every CP branch is dead code. `center-point/` is excluded
  from both hosts (`_config.yml` for Pages, `.assetsignore` for Workers).
- ✅ Both shells byte-identical (`cmp index.html NeoFeed.html`); all 30 harnesses + `DEAD=0` + the
  center-point build and its 5 client tests pass on `39c7dd3`.

**Closed later the same day (10:47 UTC / 17:47 ICT, from Praew's workstation)** — the first entry
of this section was written by a session whose egress policy answered `403` to `CONNECT` for both
hosts, so it recorded two gaps. Both are now closed by primary sources:
- ✅ **Served bytes, both hosts.** `curl` of `neofeed.valhalla-health.workers.dev` and
  `valhalla-health.github.io/neofeed` returns `200`; the root (vs `index.html`), `app.jsx`, `data.js` and
  `calculator.jsx` are each **byte-identical** (`cmp`) to the same file on `origin/release`, and the
  root carries both `v=sync-poll-0916` tags. `/center-point/` returns **`404` on both** — CP is not
  served from the clinical domain.
- ✅ **Cloudflare Workers' build on `098bd37`** — `Workers Builds: neofeed` **success** 10:29:48 UTC
  (with `build`, `deploy`, `report-build-status` and `harnesses` all success on the same commit).

**Still NOT confirmed:**
- ❌ **No human has opened the live app since the merge.** Byte-identity proves what is *served*,
  not that it *runs* — `curl` does not execute JavaScript. The bedside checks below are the only
  evidence that the poll and the grid fix work in a real ward browser.

**The 60-second byte check, for whoever repeats this** (`?v=` forces past any cache):

```bash
curl -s https://neofeed.valhalla-health.workers.dev/ | grep -c 'v=sync-poll-0916'   # expect 2
curl -s https://valhalla-health.github.io/neofeed/ | grep -c 'v=sync-poll-0916'     # expect 2
```

**Then, at the bedside — the two things only this deploy makes checkable:**
1. Leave the registry open and untouched for ~5 minutes. **The topbar pill's timestamp must advance
   on its own.** Before this deploy it never did on a workstation that stayed focused, which is the
   entire content of the "sync นานกว่าปกติ" report.
2. **Hover the pill.** Its tooltip now reports the last round trip in seconds. That number is what
   `BACKLOG.md` § Now needs to size the backend half of "slow" (`getActivePatients` re-reads the
   whole `Daily_Log` on every sync, and the new 4-minute poll multiplies how often that is paid).

**Rollback:** revert `098bd37` on `release` and push — both hosts redeploy from `release`. No schema
change, no backend change, no migration. The only persistent side effect is extra `readRegistry`
rows in `Audit_Log` (~15/hour per open tab) for as long as the poll is live.

**2026-09-10 — PR #58, "Save / Submit / Print" publish-lock design — backend now deployed.** See
`CHANGELOG.md` 2026-09-10 (2) for the full description. Merged to `main` (`4878a39`, frontend
cache-bust fix `5005db7`), which auto-deployed the frontend to both hosts. The backend half
(`publishDailyLog()`, the `publishLog` doPost action, `updateDailyNutrition`'s
revision-on-published-edit branch, `Daily_Log` AH–AL) was deployed separately via the
`~/nicu-tools/neofeed/` clasp mirror, per `REFERENCE.md` — see "How `@52` was verified" below.

**`ENABLE_PUBLISH_GATE` (`data.js`) still defaults off** — the backend fully supports it now, but
nothing in the UI calls `publishLog` or exercises the revision path until the flag is deliberately
flipped. Frontend and backend are no longer mismatched the way the first version of this entry
described.

Cache-bust: `data.js?v=publishlock-0910`, `calculator.jsx?v=publishlock-0910`,
`app.jsx?v=publishlock-0910`. Both HTML shells confirmed byte-identical. `gas-backend.gs`'s new
20th harness (`test/verify-publish-lock.cjs`, 76 assertions) and the full existing suite are green;
see `CHANGELOG.md`.

**2026-09-10 — frontend-only, no backend involved.** Patient-identification review: `<PatientPicker>`
(the header's "switch patient" modal) now shows the twin/multiples label next to the name, same as
the registry table already did — two twins previously rendered as identical rows there except for a
small bed chip. The printed TPN order form's `"AN:"` field is relabeled `"NeoFeed ID:"` (it was never
the hospital's real Admission Number, just the derived, collision-prone `sessionId`) and now also
prints the twin letter next to the name. `git push` deploys this to both hosts automatically.
Cache-bust: `calculator.jsx?v=patientid-0910`, `registry.jsx?v=patientid-0910`, both HTML shells
confirmed byte-identical. New harness `test/verify-picker-print-identity.cjs` (9 assertions) plus one
added case in `verify-gas-registry-upsert.cjs`; all 22 `verify-*.cjs` harnesses green. See
`CHANGELOG.md` 2026-09-10.

## Release-branch deploy gate

🟢 **CLOSED 2026-09-12 — both hosts.** Closes the exact gap `AI_SDLC.md` § 5 named — a push to `main` used
to be an unreviewed production deploy on both hosts, backwards from the backend's explicit-
confirmation-before-`clasp deploy` model, and the frontend is where the printed dose is drawn.

**Done:**
- `release` branch created from `main`'s tip (`89f9ce2`).
- Branch protection on `release`: 1 required approving review, stale reviews dismissed on new
  pushes, `enforce_admins` on (applies to Praew's own pushes too, not just an agent's), force-push
  and deletion blocked. Deploying now means a PR from `main` → `release`, approved before merge.
  ⚠️ **Corrected 2026-09-11:** this line used to say "self-approval is expected and fine" — GitHub
  never lets a PR's author approve it, so every `release` PR needs the **other** admin
  (`tasamew`). See `REFERENCE.md` § Frontend.
- **2026-09-11 (3), live now:** the `harnesses` check (`.github/workflows/test.yml`, every
  `verify-*.cjs` + shell identity) is a **required status check on `release`** — verified via
  `gh api` (`app_id 15368`, GitHub Actions). The workflow file itself lands on `main` with PR #59;
  it already runs on that PR's branch, green.
- GitHub Pages repointed to serve from `release` (`gh api PUT .../pages`, verified: fresh build
  `status: built`, no error, `index.html` still `200` against the live URL).

- **Cloudflare Workers Builds' production branch is now `release`** — changed by Praew in the
  dashboard (Workers & Pages → neofeed → Settings → Build), which is the only place it can be
  changed: no `wrangler` subcommand or public API covers it.

**Verified by the real thing, not by inspection (2026-09-12):** merging PR #59 into `main`
(`891ed2b`) ran a Workers build that reported success **and production did not change** — the live
`data.js` stayed byte-identical to the pre-merge commit (73,033 bytes vs the merged 74,204). That is
exactly the check this section used to ask for: *"push something harmless to `main` only, confirm
Cloudflare does not pick it up."* The other half — *"confirm merging to `release` does"* — is
since satisfied too: merging PR #60 into `release` deployed **both** hosts (a Cloudflare build and a
GitHub Pages deployment on the same commit, both green, both serving the new files). Both directions
of the gate are now demonstrated rather than assumed.

⚠️ **Consequence, and it is the point:** `main` is no longer a deploy of any kind. **Nothing reaches
staff until a `main` → `release` PR is approved and merged**, and GitHub forbids self-approval, so
that approval comes from `tasamew`. A merge to `main` that "did nothing" is the gate working.

**Rollback:** revert the branch-protection settings and the Pages source via the same `gh api`
calls with the previous values (`branch: main`), or just keep pushing to `main` and drop `release`
— nothing about `main`'s own history or the backend changed.

**2026-09-10 — frontend-only, no backend involved.** Mg's Step 3 row, the printed order form, and
the delivered-dose cross-check now also show mg/kg/d next to the existing mEq/kg/d (display only —
the input, presets and compounding math are unchanged, still mEq-based). `git push` deploys this to
both hosts automatically. Cache-bust: `data.js?v=mg-mgkg-0910`, `calculator.jsx?v=mg-mgkg-0910`,
both HTML shells confirmed byte-identical. See `CHANGELOG.md` 2026-09-10.

2026-09-05 landed a merge of two branches that had diverged without knowing about each other:
Praew's own `ae912c7` (phosphorus target correction, Peditrace dose correction, a session-id
duplicate-entry guard + lock on `logDailyNutrition`, `registerPatient`'s `isNew` flag, and a
previous-log-entry baseline for the day's form) plus PR #55's fixes (`SaltRow` negative-dose
rejection, an `updateWeights` lock, and the night-shift UTC date-fallback bug) — see `CHANGELOG.md`
2026-09-05 for the merge itself, including one real regression the merge introduced and fixed
before it landed (the lock in `logDailyNutrition` had stopped wrapping its own input-validation
throw). A Fenton `FENTON_WEIGHT` data correction (GA 36-41) rode along in the same push.

**`git push` (25bd5a5) deployed the frontend automatically** (`data.js`, `calculator.jsx`, both HTML
shells → Cloudflare Workers + GitHub Pages). **The backend half needed its own step**, confirmed
with Praew first per `CLAUDE.md` (this batch also includes a *behavior change*, not just additive
fixes: Staff role validation now fails closed — a blank/misspelled role that used to be silently
treated as `doctor` is now rejected with a Thai "ยังไม่ได้กำหนดสิทธิ์" error. Praew confirmed all
current Staff rows already carry a valid `admin`/`doctor`/`nurse` role, so this was deployed without
a row-by-row check). Shipped via `clasp push` + `clasp deploy --deploymentId AKfycbz8Nt...` to `@51`.
**Verified, not assumed:** `clasp list-deployments` shows `AKfycbz8Nt...` at `@51`; a fresh
`clasp pull` into a clean scratch dir diffed byte-identical against `gas-backend.gs`; both live
hosts' HTML confirmed serving `data.js?v=fenton-weight-v2-0905` and
`calculator.jsx?v=saltrow-negdose-0905`. The session-id duplicate-guard, both new locks
(`updateWeights`/`logDailyNutrition`), the night-shift date fix, and the fail-closed role check are
now live and protecting production. The two `BACKLOG.md` lines these close (`SaltRow` negative
doses, `updateWeights` lock) can now be marked done.

`@50` is the first clean (non-TEMP-DEBUG) backend deployment since `@47`, and it carries three
things that had been sitting undeployed:

1. **The TEMP-DEBUG revert.** `@48`/`@49` carried login-kickback instrumentation —
   `verifyToken`/`createSession` tracing, a `Debug_Log` sheet writer and `getDebugLogText()`. All of
   it is gone; `verifyToken` and `createSession` are byte-identical to `c0bc74f`, their last
   pre-instrumentation state.
2. **The server-side plausibility guard** (`0004d5c`, committed 2026-08-25) — which had **never been
   deployed at all**. Until `@50`, nothing live stopped an out-of-range value reaching
   `Patient_Registry`/`Daily_Log` via a direct POST.
3. **The provenance columns** — `constantsVersion`/`appVersion` into `Daily_Log` AF–AG.

✅ **The `Debug_Log` sheet tab was deleted by Praew on 2026-08-26**, and it cannot come back:
`_debugLog()` was the only thing that recreated it (`if (!sh) ss.insertSheet("Debug_Log")`), and the
deployed `@50` source contains zero occurrences of it. Its rows held timestamps, staff email
addresses and 6-character session-token tails — no patient data, but personal data, so no copy was
retained.

| | |
|---|---|
| Frontend — primary | Cloudflare Workers static assets → `neofeed.valhalla-health.workers.dev`. Live and verified 2026-08-23 |
| Frontend — legacy | GitHub Pages → `valhalla-health.github.io/neofeed/`. Still live, and still where NICU staff home-screen installs point |
| Frontend deploy | **Merging into `release` deploys both** (since 2026-09-12). Cloudflare Workers Builds' production branch is `release`; GitHub Pages serves `release`. A push or merge to `main` deploys **nothing** — it only runs a preview build. See § Release-branch deploy gate |
| Backend | GAS deployment `AKfycbz8Nt…` at **`@55`** = `gas-backend.gs` at `7049f60` (PR #73, the 2026-09-17 review), live since 2026-09-18 08:42 ICT. Previous: `@54` (PR #63 + #66, cut 2026-09-15 20:47 ICT) |
| Clasp mirror | `~/nicu-tools/neofeed/รหัส.js` at `42dd655`, **identical to `gas-backend.gs` at `7049f60` and to the deployed version 55** (`clasp pull --versionNumber 55` into a clean scratch dir at the deploy). Re-checked read-only after the frontend deploy: clean working tree, still identical ignoring CR |
| Deploy identity | Backend: `peeraporn.po@chula.ac.th` via `clasp` (`executeAs: USER_DEPLOYING`, so a different account switches the live app's identity) — confirmed via `clasp show-authorized-user` before deploying, not assumed. Frontend hosting: Cloudflare account `praew.tvl@gmail.com` — **a different identity from the backend**, unsettled on purpose |
| Migrations | 🟡 **`Daily_Log` AH–AL: no action required, one cosmetic step outstanding** — same shape as AF/AG. Both write paths widen the grid on demand, so the columns appear on the first save/publish — no manual migration needed. `applyLogHeaderColumns()` would add the header *labels*, which are cosmetic (the columns are read and written by index). It runs as the signed-in user from the editor and may raise an OAuth consent, **so it is Praew's to run, not an agent's** |
| Cache-bust | Since 2026-09-18 (`dfeb15b`) every `?v=` token is a **content hash** written by `tools/build.mjs`. Live (`96afcd0`): `boot.js?v=f48894ce64`, `data.js?v=1857fa896b`, `compiled/calculator.js?v=c22c5394ad`; the other five `compiled/` tokens are unchanged since `dfeb15b` (listed in "How the 2026-09-18 frontend deploy was verified"). The `vendor/` React files carry their version in the file name instead. Both shells byte-identical, confirmed live on both hosts |

## How the 2026-09-15 deploy was verified

**Frontend.** PR #63 → `main`, then PR #64 bumped the cache-bust tokens, and PR #65 `main` → `release`
deployed `ward-gate-0915`. While the backend deploy was being planned, a bug turned up in that
release: the one-bed guard refused edits to a discharged record whose old bed had been reused.
PR #66 → `main` fixed it (`CHANGELOG.md` 2026-09-15 (2)), and PR #67 `main` → `release` deployed it,
approved and merged by `tasamew` at 20:42 ICT. That left `ward-gate-0915`'s version of the bug live
for about 3.5 h, client-side only; `@53` never had the server guard. Checked against the live URLs:

- **Cloudflare and GitHub Pages** both serve `data.js`, `registry.jsx`, `app.jsx` at `?v=bed-guard-0915`
  and `calculator.jsx` at `?v=ward-gate-0915`. `data.js` is 79,305 bytes on both hosts, matching
  `release`. `gas-backend.gs` returns 404 on both.
- **In a real browser** (Cloudflare, login screen only, no sign-in):
  - `window.NEOFEED_DATA.appVersion()` returns
    `d=bed-guard-0915;i=notes-date-sel1;c=ward-gate-0915;f=ga-clamp42;r=bed-guard-0915;l=bed-dol-io2;a=bed-guard-0915`.
  - `NEOFEED_DATA.bedBlocker` and `EditPatientModal` are defined, and `NEOFEED_GAS_URL` is the production deployment.
  - The only console error is a *report-only* `frame-ancestors` notice from Google's own
    `accounts.google.com` sign-in frame. Nothing was blocked.
- CI `test` passed on `fd49e1b`, on `8406cd7` (`main`) and on `release` after #67. A `pages-build-deployment` succeeded on `release`.

**Backend `@54`.** Deployed on Praew's explicit go-ahead, following `REFERENCE.md`, with each step checked:

1. **Remote diffed before overwriting.** `clasp pull` of the live project HEAD into a clean scratch dir
   was identical to the mirror's `รหัส.js` and `appsscript.json`, and the mirror was identical to `@53`'s
   source (`ffb62ee`). Nobody had edited HEAD in the Apps Script editor since `@53`, so nothing was lost.
2. **Deploy identity and settings, checked before deploying:**
   - `clasp show-authorized-user` → `peeraporn.po@chula.ac.th`;
   - `appsscript.json` has `timeZone: Asia/Bangkok` and `executeAs: USER_DEPLOYING`;
   - 53 versions and 26 deployments before the deploy.
3. Copied `gas-backend.gs` from `8406cd7` into `รหัส.js`. The mirror diff was **+45 lines and nothing
   else**: `_normBed` and `_bedConflict` with #66's status check, plus the two-line call inside
   `registerPatient`. Committed in the mirror (`45341e0`). `clasp push` pushed 2 files, and
   `clasp create-version` created **54**.
4. **Verified before going live:** `clasp pull --versionNumber 54` into a clean scratch dir matched
   `gas-backend.gs` at `8406cd7` (ignoring CR). The status check is present, the `@53` markers
   (`LOGIN_FAILED_MSG`, `MIN_PASSWORD_LENGTH`, `_patientInSyncWindow`) are still there, and the
   manifest is unchanged.
5. **`clasp update-deployment -V 54 AKfycbz8Nt…`**: the count stayed **26**, so no new deployment
   was created and `NEOFEED_GAS_URL` is unchanged. `clasp list-deployments` shows `AKfycbz8Nt…` at `@54`.
6. **Live smoke test**, with no credentials and no writes:
   - `GET ?action=ping` → `{"ok":true}`;
   - `POST registerPatient` without a token → `{"error":"Unauthorized"}`;
   - `POST getActivePatients` without a token → `{"error":"Unauthorized"}`.

   The bed guard sits behind the auth gate, so this proves the deployment answers, not the guard
   itself. The guard is pinned by `verify-gas-registry-upsert.cjs` § 6 against the same source.

**What staff see under `@54` + `bed-guard-0915`:**
- **A bed already held by an Active infant is refused, including across devices.** The server
  refuses registering or moving another Active infant onto it with
  "เตียง … มี … อยู่แล้ว — ต้องย้ายผู้ป่วยรายนั้นออกก่อน จึงจะบันทึกเตียงนี้ได้ (หนึ่งเตียงต่อหนึ่งราย)".
  Until today only the client checked, against a `patients` snapshot that could be minutes old.
- **Discharged, Transferred and Expired records can be edited** even after their old bed has been
  reused. Setting one back to Active on that bed is refused.
- ⚠️ **Beds that were double-booked before 2026-09-15** (two Active infants on one bed, including
  legacy spellings such as `NICU-3` vs `NICU 3`): re-saving *either* infant without moving one of
  them is refused. The client has refused this since #65, and the server now does too. The fix is
  to transfer one of them. Nobody has checked the live census for this; it needs a signed-in person.

⚠️ **Still unexercised by a human:** registering onto an occupied bed from a second device, and
editing a discharged record whose bed was reused. Both were added to the bedside session in
`BACKLOG.md` § Now.

**Rollback (backend):** `@53` is a clean target, because `@54` adds no columns and changes no stored format:
```
clasp update-deployment -V 53 AKfycbz8NtHuyTdo4EP-ZKb5n5LIRqVzGSY286MZRlXMniO51xjiuQO7eOLvltsrejkL4GgV
```
**Rollback (frontend):** revert the PR #67 merge on `release`, which returns to `ward-gate-0915` and
its discharged-record bug. Revert PR #65 as well to return to `review-0911`. Either works with `@54`
or `@53`.

---

## How the 2026-09-12 frontend deploy was verified

PR #59 → `main` (which deployed nothing, by design), then PR #60 `main` → `release`, approved by
`tasamew` because GitHub forbids self-approval. That merge deployed Cloudflare and GitHub Pages
together. Checked against the live URLs, not inferred from the green checks:

- **Cloudflare** serves `data.js?v=review-0911`, `calculator.jsx?v=review-0911`,
  `registry.jsx?v=review-0911`, `app.jsx?v=review-0911`; `data.js` is 74,204 bytes (the pre-deploy
  file was 73,033) and contains `function appVersion`.
- **In a real browser:** no CSP violation — the `accounts.google.com/gsi/style` error observed on
  2026-09-11 is gone and the Sign-In button renders; `window.NEOFEED_DATA.appVersion()` returns
  `d=review-0911;i=notes-date-sel1;c=review-0911;f=ga-clamp42;r=review-0911;l=bed-dol-io2;a=review-0911`,
  derived from the loaded files so it cannot go stale; `window.TweaksPanel` is gone.
- **Headers:** `X-Robots-Tag: noindex, nofollow` plus the `<meta name="robots">` tag; `style-src` now
  includes `https://accounts.google.com/gsi/style`.
- **Not served (404):** `tweaks-panel.jsx`, `_config.yml`, `gas-backend.gs`, `STATUS.md`,
  `SECURITY.md`. **Served (200):** every `.jsx` module, `data.js`, `manifest.json`, icons.
- **GitHub Pages** (legacy host, still redirecting to Cloudflare) serves the same 74,204-byte
  `data.js` and still 404s `gas-backend.gs`, `STATUS.md` and `tweaks-panel.jsx`.

**Rollback (frontend):** revert the PR #60 merge on `release`. Independent of the backend — `@53`
works with the previous frontend, which is exactly the pairing that ran for ~20 h today.

---

## How `@53` was verified

Deployed on Praew's explicit "deploy backend" (2026-09-12), per `REFERENCE.md`, each step checked:

1. **Mirror diffed first, not overwritten.** `~/nicu-tools/neofeed/รหัส.js` differed from `main`'s
   `gas-backend.gs` only in line endings (CRLF on disk) — content identical to `5005db7`, the `@52`
   source. Nothing unique in the mirror. `appsscript.json` `"timeZone": "Asia/Bangkok"` confirmed (the
   date logic assumes it — `REFERENCE.md`).
2. **Deploy identity before deploying:** `clasp show-authorized-user` → `peeraporn.po@chula.ac.th`.
3. Copied the PR #59 branch's `gas-backend.gs` (`df85531`) → `รหัส.js`, committed in the mirror
   (`8009b39`). `clasp push` → 2 files. `clasp create-version` → **53**.
4. **`clasp update-deployment -V 53 AKfycbz8Nt…`** — deployment count stayed **26** (no new
   deployment; `NEOFEED_GAS_URL` unchanged). `clasp list-deployments` shows `AKfycbz8Nt…` at `@53`.
5. **`clasp pull --versionNumber 53` into a clean scratch dir, diffed against `gas-backend.gs` →
   identical** (ignoring CR). `LOGIN_FAILED_MSG`, `MIN_PASSWORD_LENGTH`, `_patientExists`,
   `_patientInSyncWindow` and the publish `expectedLastModified` check are all present.
6. **Live smoke test** (single-use redirect captured and fetched once): `GET ?action=ping` → `ok`;
   unauthenticated `getActivePatients` → `{"error":"Unauthorized"}`; `login` with a non-staff email →
   `"email หรือรหัสผ่านไม่ถูกต้อง"` — the new generic message, which proves `@53` is what answers
   (`@52` said "ไม่พบบัญชีนี้ในระบบ"), and under `@53` that request writes no Script Property.

**What staff saw during the ~20 h the backend ran ahead of the frontend (window now closed):**
- Login failures read "email หรือรหัสผ่านไม่ถูกต้อง" for both unknown email and wrong password; a
  disabled account only hears "บัญชีนี้ถูกระงับ" after typing the right password.
- A new password must be ≥ 10 characters; the old modal still says "อย่างน้อย 6" but shows the
  server's "อย่างน้อย 10" refusal.
- Ward devices (and, until the new frontend asks for `includeArchived`, admin devices too) no longer
  receive patients discharged/transferred more than 30 days ago. The registry already hid them after 7.
- Saving an order for a patient whose registration never reached the server is refused.
- Nothing else is visible: Submit/publish is still unreachable from the UI (`ENABLE_PUBLISH_GATE` off).

⚠️ **Still unexercised by a human:** a real login + save + edit against `@53` + `review-0911` —
now one bedside session for both halves, see `BACKLOG.md` § Now.

**Rollback (backend):** `@52` is a clean target — `@53` adds no columns and changes no stored format:
```
clasp update-deployment -V 52 AKfycbz8NtHuyTdo4EP-ZKb5n5LIRqVzGSY286MZRlXMniO51xjiuQO7eOLvltsrejkL4GgV
```
If PR #59's frontend is live by then, roll it back too (its Submit sends a stamp `@52` ignores —
harmless — but the admin archive request assumes `@53`).

---

## How `@52` was verified

Not assumed — each step checked, per `REFERENCE.md`:

1. **Diffed the mirror against the repo first, not overwritten.** `~/nicu-tools/neofeed/รหัส.js`
   (still at `@51`'s source, `26465c6`) vs. `gas-backend.gs`: every line of the 134-line diff traced
   to PR #58 (the five new columns, `_revisionFields`, the `updateDailyNutrition` revision branch,
   `publishDailyLog`, `getActivePatients`'s new fields, `ensureLogHeaderColumns`'s WANT map). The
   mirror held nothing unique — no reconciliation needed, only a copy.
2. **Deploy identity confirmed before deploying, not after.** `clasp show-authorized-user` →
   `peeraporn.po@chula.ac.th`, the documented deploy identity.
3. Copied `gas-backend.gs` → `รหัส.js`, committed in the mirror's own git repo (`f453583`).
   `clasp push` → 2 files (`รหัส.js`, `appsscript.json`). `clasp create-version` → **52**.
4. **`clasp update-deployment -V 52 <existing id>`** — the deployment count stayed at **26**, which
   is the proof a *new* deployment was not created and `NEOFEED_GAS_URL` is unchanged.
5. **`clasp pull` into a clean scratch dir (not the working mirror), diffed against `gas-backend.gs`
   → byte-identical.** Confirms what's live is what's in source control.
6. **Live smoke test:** an unauthenticated `getActivePatients` against the production URL returns
   `{"error":"Unauthorized"}` — the script loads, `doPost` runs, `verifyToken` refuses, no patient
   data returned. Captured the single-use `script.googleusercontent.com/macros/echo?…` redirect
   `Location` header and fetched it once, per the method note below.
7. **Frontend cache-bust confirmed live on both hosts** (`data.js?v=publishlock-0910`,
   `calculator.jsx?v=publishlock-0910`, `app.jsx?v=publishlock-0910`) before this deploy, so backend
   and frontend are now genuinely in step, not just both individually current.

⚠️ **Still unexercised by a human:** a real login, a real Save, a real Submit and a real Print with
`ENABLE_PUBLISH_GATE` flipped on — everything above proves the backend is correctly *deployed*, not
that the end-to-end flow works against a live login outside the test harnesses' mocks. That's the
standing item to close before turning the flag on for real staff.

**Rollback (backend):** `-V 51` restores the pre-publish-lock source (provenance AF-AG, staff-role
fail-closed, input validation, locks, night-shift date fix — everything `@51` had):
```
clasp update-deployment -V 51 AKfycbz8NtHuyTdo4EP-ZKb5n5LIRqVzGSY286MZRlXMniO51xjiuQO7eOLvltsrejkL4GgV
```
Safe to roll back to at any time: `@52`'s new columns/functions are additive and nothing in `@51`
reads them, so dropping back to `@51` just makes `publishLog` unreachable again (the frontend
already can't reach it either, with the flag off).

---

## How `@51` was verified

Not assumed — each step checked, per `REFERENCE.md`:

1. **Deploy identity confirmed before deploying, not after.** Decoded the `id_token` clasp already
   had stored (`~/.clasprc.json`) rather than trusting `STATUS.md`'s own prose — came back
   `peeraporn.po@chula.ac.th`, the documented deploy identity.
2. **Mirror diffed against the repo first.** `~/nicu-tools/neofeed/รหัส.js` (still at `@50`'s source,
   `a5a60ee`) vs. `gas-backend.gs`: 190 changed lines across 15 functions, none of it TEMP-DEBUG or
   otherwise unaccounted for — every hunk traced to a named, dated fix (provenance columns,
   staff-role validation, input-throw validation, the two new locks, the duplicate-entry guard, the
   night-shift date fix). Copied over and committed in the mirror's own git repo before touching GAS.
3. `clasp push` → 2 files (`รหัส.js`, `appsscript.json`). `clasp deploy --deploymentId
   AKfycbz8Nt...` → **51**, same deployment ID (`NEOFEED_GAS_URL` unchanged).
4. **`clasp list-deployments` shows `AKfycbz8Nt...` at `@51`** with the description this deploy was
   cut with.
5. **`clasp pull` into a clean scratch dir (not the working mirror), diffed against `gas-backend.gs`
   → byte-identical.** Confirms what's live is what's in source control, not some intermediate
   `@HEAD` state.
6. **Both live frontend hosts checked directly** (not assumed from the git push alone): GitHub Pages
   and the Cloudflare Workers URL both serve `data.js?v=fenton-weight-v2-0905` and
   `calculator.jsx?v=saltrow-negdose-0905` — the cache-bust actually shipped, on both hosts.

⚠️ **Known accepted risk, confirmed with Praew before deploying, not discovered after:** the new
Staff-role validation fails closed — a blank/misspelled role that used to be silently treated as
`doctor` is now rejected. Praew confirmed all current Staff rows already carry a valid role, so this
was not re-verified row-by-row against the live sheet before deploying.

⚠️ **Still unexercised by a human:** a real login and a real Calculator save against `@51` — the
same standing item `@50`'s verification left open, now compounded by the new fail-closed role check
and the same-day duplicate-entry guard, neither of which has been exercised outside the test suite's
mocks.

**Rollback (backend):** `-V 50` restores the source `@50` was actually built from (no TEMP-DEBUG,
plausibility guard present) — the only clean rollback target on the list, since everything in `@51`
shipped in one batch:
```
clasp update-deployment -V 50 AKfycbz8NtHuyTdo4EP-ZKb5n5LIRqVzGSY286MZRlXMniO51xjiuQO7eOLvltsrejkL4GgV
```
That reintroduces the un-fixed night-shift date bug, the un-locked `updateWeights`/
`logDailyNutrition`, and the pre-fail-closed role handling — a real rollback, not a free one. Prefer
fixing forward (cut `52` from a corrected source) unless `@51` is actively locking staff out.

---

## How `@50` was verified

Not assumed — each step checked, per `REFERENCE.md`:

1. **Mirror diffed first, not overwritten.** All 37 lines unique to `~/nicu-tools/neofeed/รหัส.js`
   were the TEMP-DEBUG code the repo had just reverted; the 3 lines unique to the repo were their
   de-instrumented replacements. The mirror held nothing unique. Backup taken first, into
   `~/nicu-tools/_backups/` — **outside** the clasp project dir, which has no `.claspignore`.
2. **`clasp show-authorized-user`** → `peeraporn.po@chula.ac.th`, the correct deploy identity.
3. `clasp push` → 2 files. `clasp create-version` → **50**.
4. **`clasp update-deployment -V 50 <existing id>`** — the deployment count stayed at **26**, which
   is the proof a *new* deployment was not created and `NEOFEED_GAS_URL` is unchanged.
5. **`clasp pull` into a scratch dir, diffed against `gas-backend.gs` → identical.** The deployed
   source contains `_checkRange` (19), `_provenanceFields` (4), `_ensureLogWidth` (4) and
   **zero** occurrences of `TEMP-DEBUG`, `_debugLog` or `getDebugLogText`.
6. **Live smoke test:** an unauthenticated `getActivePatients` against the production URL returns
   `{"error":"Unauthorized"}` with `content-type: application/json` — the script loads, `doPost`
   runs, `verifyToken` refuses, and no patient data is returned.
   ⚠️ *Method note for whoever repeats this:* `curl -L` does **not** work here. Apps Script 302s to a
   single-use `script.googleusercontent.com/macros/echo?user_content_key=…`; following it
   automatically consumes the key and the retry returns Google Drive's *"ไม่สามารถเปิดไฟล์ได้"* HTML,
   which looks like a broken deploy and is not. Capture the `Location` header and fetch it **once**.

⚠️ **Still unexercised by a human:** a real login and a real Calculator save against `@50`. That is
what would confirm `Daily_Log` AF–AG actually fill with `2026-08-26.1`, and it is also the standing
`BACKLOG.md` item about `@46`/`@47`'s auth changes never having been exercised outside a stub.
**One real login plus one save discharges both.**

**Rollback (backend):** there is no clean target, and that is worth knowing *before* an incident.
`-V 49` restores the TEMP-DEBUG instrumentation; `-V 47` drops the plausibility guard, which only
became live at `@50`. If `@50` misbehaves, prefer **fixing forward** — cut `51` from a corrected
source — and reserve this for a genuine emergency:
```
clasp update-deployment -V 49 AKfycbz8NtHuyTdo4EP-ZKb5n5LIRqVzGSY286MZRlXMniO51xjiuQO7eOLvltsrejkL4GgV
```

**Rollback (frontend, Cloudflare):**
```
npx wrangler rollback
```
GitHub Pages has no rollback — revert the commit and push.

## GitHub repository security settings

🟢 **2026-09-11 (3):** secret scanning and push protection **enabled** (they were off on this public
repo, which already had one leaked-identifier incident — see `BACKLOG.md` § Standing guardrails);
wiki disabled (unused). Verified via `gh api repos/valhalla-health/neofeed`.

## What Cloudflare does not serve

`.assetsignore` restricts Cloudflare to the 18 files the app actually loads. Verified
cache-busted on 2026-08-23: `gas-backend.gs`, `gas-backend.gs.js`, `SECURITY_CHECKLIST.md`,
`CODE_REVIEW_*.md`, `HANDOFF.md`, `PRD.md`, `STATUS.md`, `NeoFeed.html`, `test/`, `docs/`,
`graphify-out/` and `.git/` all return **404** there. `.gitleaks.toml` was missed from this list
until 2026-09-11 (`5cc98e1`) — confirmed serving `200` before that fix, `404` after (Cloudflare
redeployed, checked against the live URL, not `wrangler dev`). No real secrets were in it (rules
and a description of the already-known Spreadsheet-ID incident, not credential values), but it's
the same "internal tooling, not public" category as everything else here.

🟢 **GitHub Pages closed 2026-09-11 (`5bfdb70`), without retiring Pages or going private.**
Legacy Pages runs Jekyll (no `.nojekyll`), which was never told what to exclude. Added
`_config.yml` with an `exclude:` list mirroring `.assetsignore`'s allow-list exactly
(`*.md`, `gas-backend.gs`, `docs/`, `test/`, `NeoFeed.html`, `wrangler.jsonc`; dotfiles were
already skipped by Jekyll's own default). Verified against the live URL after the Pages rebuild
completed (`gh api .../pages/builds/latest` → `status: built`, no error): `gas-backend.gs`,
`SECURITY_CHECKLIST.md`, both `CODE_REVIEW_*.md` files, `HANDOFF.md`, `PRD.md`, `STATUS.md`,
`BACKLOG.md`, `REFERENCE.md`, `AI_SDLC.md`, `NeoFeed.html`, `wrangler.jsonc` and everything under
`docs/` and `test/` now all return **404**. The app itself still loads correctly — `index.html`,
`data.js`, `manifest.json`, `moved.html` and all six `.jsx` modules still return `200`, confirmed
same session. This closes the `BACKLOG.md` § Now item's file-exposure half; the app-entry-point
half was already closed by the redirect stub below.

## Response headers (Cloudflare only)

🟢 **2026-09-18 (`dfeb15b`): `script-src` is now `'self' https://accounts.google.com`** — no
`'unsafe-inline'`, no `'unsafe-eval'`, no unpkg — checked in the header Cloudflare serves. The build
step removed the reason for all three. Where the older paragraphs below say `script-src` still
carries them, they describe the policy before this release.

🟢 **Live on Cloudflare since `30dbff7`, pushed and verified 2026-08-23.** `_headers` adds a CSP
plus `X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options`, `Cross-Origin-Opener-Policy`,
`Permissions-Policy` and HSTS. It applies **to Cloudflare only** — GitHub Pages has no `_headers`
support, so the legacy host stays unprotected regardless. `/_headers` itself 404s on Cloudflare
(confirmed both pre-push via `wrangler dev` and post-push against the live URL), so it needs no
`.assetsignore` entry.

Confirmed via a fresh cache-busted request against `neofeed.valhalla-health.workers.dev` after the
push: all seven headers present, exact values as written. The CSP was built from a static audit of
every external origin the app's own files reference — `unpkg.com`, `accounts.google.com`,
`fonts.googleapis.com`, `fonts.gstatic.com`, `script.google.com`, `*.googleusercontent.com`, one
`data:` SVG in `tweaks-panel.jsx`. `script-src` still carries `'unsafe-inline' 'unsafe-eval'`,
unavoidable without a build step since `@babel/standalone` compiles the `.jsx` modules
client-side.

🟡 **Exercised in a real browser 2026-09-11 — one violation found:** loading the live login page
logged *"Loading the stylesheet 'https://accounts.google.com/gsi/style' violates … style-src"*.
The Sign-In button still renders (it lives in Google's iframe), so nothing is broken for staff;
the fix (add that URL to `style-src`) is in PR #59, **not yet live**. The paragraph below is the
pre-2026-09-11 note, kept for history.

~~Gap not yet closed~~ — the CSP has been confirmed served correctly, but not yet exercised
against a real page load with the browser console open — Claude in Chrome was unreachable both
when this was written and when it was verified live. No CSP violation has actually been observed
or ruled out in a real browser. Low risk (the CSP was derived from an exhaustive static audit, and
`_headers` alone reverts in one commit with no backend involvement), but load the live app once
with dev tools open before treating this as fully closed.

`wrangler.jsonc` is the one exception on Cloudflare: wrangler force-includes its own config when
it sits inside the assets directory, so it is served and cannot be hidden from `.assetsignore`.
It holds no secrets. Reasoning recorded in `.assetsignore` itself.

## What has been exercised by a real human

**Real login + real save on `@55`: reported working by Praew on 2026-09-18**, with the live
`sync-poll-0916` client, minutes after the switch. It is the first human use of the 2026-09-17
backend (auth hardening, column guard, row re-check, sync cache). Which save path it exercised was
not recorded.

**Real login: reported working by Praew on 2026-08-23**, on the Cloudflare host, after
`https://neofeed.valhalla-health.workers.dev` was added as an Authorized JavaScript origin on
OAuth client `750019806043-imunne8n…`. That exercised GIS → `verifyToken` → Sheet end to end,
outside a stub — **against `@47`**. `verifyToken` is byte-identical again at `@50`, so that
evidence still applies to the auth path.

**Never exercised by a human, at any version:** a real Delete; a real save landing in `Daily_Log`
AF–AG; `CacheService` eviction; `LockService` contention. The harnesses model none of the last two.
The `@47` verification steps themselves are not repeated here — `CHANGELOG.md` holds them, and this
file's job is what is live now, not how a superseded version got there.

## GitHub Pages retirement

🟢 **Live since `30dbff7`, pushed 2026-08-23 — this is the real staff cutover, already in effect.**
Partial progress on the `BACKLOG.md` § Now item about `gas-backend.gs` and the `CODE_REVIEW_*.md`
files being publicly served from `valhalla-health.github.io/neofeed/` — this closes the *app*
exposure, not the *file* exposure. See below for what's still open.

**Mechanism:** a hostname guard, first script in `<head>` of both `index.html` and `NeoFeed.html`
(kept byte-identical, per `NeoFeed/CLAUDE.md`) — `if (location.hostname ===
"valhalla-health.github.io") location.replace("moved.html")`. `moved.html`: a self-contained Thai
"moved" page (no external font/CDN dependency) with a button to
`neofeed.valhalla-health.workers.dev`.

**Since 2026-09-18 (`dfeb15b`) the guard lives in `boot.js`**, still the first script in `<head>`,
because the shells may no longer carry inline script. It now also strips a trailing dot from the
hostname and clears old `neofeed_*` storage on that shared origin before redirecting (`CHANGELOG.md`
2026-09-17 § 4). `boot.js` is served byte-identical on GitHub Pages; the redirect itself has not been
watched in a browser since the move.

**Verified against the real URLs after the push**, not just `wrangler dev`: `valhalla-health.
github.io/neofeed/` now serves the guard script (confirmed present in the HTML via `curl`);
`moved.html` there returns `200` with the correct button target; `neofeed.valhalla-health.
workers.dev` is untouched — guard present in the HTML but inert there, real app still loads,
headers still correct.

✅ **Observed in a real browser 2026-09-11:** opening `valhalla-health.github.io/neofeed/` landed on
the Thai "NeoFeed ย้ายที่อยู่แล้ว" page with the button to the Cloudflare host. The paragraph below is
the pre-2026-09-11 note, kept for history.

~~Still not closed~~ — `curl` confirms the guard *script is served*, not that it *executes and
redirects* — `curl` doesn't run JavaScript. Nobody has opened `valhalla-health.github.io/neofeed/`
in an actual browser since this shipped and watched it bounce to `moved.html`. The logic was
checked in Node (string-match doesn't false-positive on lookalikes) and the mechanism is placed
correctly (first script in `<head>`, before any resource fetch), but that is inference, not
observation. Do this check in a real browser before telling staff it's live.

**File exposure closed separately, 2026-09-11 (`5bfdb70`):** the guard above protects the app
entry point (`/`), not arbitrary file paths — `gas-backend.gs`, `SECURITY_CHECKLIST.md` and both
`CODE_REVIEW_*.md` files stayed fetchable after this push, `200`, until the `_config.yml` Jekyll
exclude shipped. See "What Cloudflare does not serve" above for the full verification. The
staff-announcement → 2-week-window → repo-private sequence originally planned for this is no
longer required to close the item; going private remains a separate, larger decision Praew can
still make later for other reasons, but is not blocking on this exposure anymore.

**Rollback:** revert `30dbff7`. No backend involvement.

---

**This file has exactly one job: what is live right now.** Updating it is part of the definition of
done for a deploy — same commit, not "later". It went stale twice when it lived inside `HANDOFF.md`,
and `NeoFeed/CLAUDE.md` was found on 2026-08-21 still claiming `@45`, four days out of date, which
is why that file no longer restates a version at all. Anything that is not current deployment state
belongs in `BACKLOG.md`, `PRD.md`, `AI_SDLC.md`, `REFERENCE.md` or `CHANGELOG.md`.
