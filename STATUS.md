# NeoFeed — Status

**Updated 2026-09-05** · 🟢 **Backend production is `@51`. Frontend is live on both hosts with the
matching source. Backend and frontend are in step, and nothing is pending on either.**

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
| Frontend deploy | `git push origin main` deploys **both**. Workers Builds runs `npx wrangler deploy`; GitHub Pages rebuilds from the repo root. Connected 2026-08-23 |
| Backend | GAS deployment `AKfycbz8Nt…` at **`@51`** — *"Sync merged backend (provenance AF-AG, staff-role fail-closed, input validation, locks, night-shift date fix) - GitHub main 25bd5a5"*, cut 2026-09-05 |
| Clasp mirror | `~/nicu-tools/neofeed/รหัส.js` at `26465c6`, **byte-identical to `gas-backend.gs` and to the deployed source** (`clasp pull` into a clean scratch dir, diffed clean) |
| Deploy identity | Backend: `peeraporn.po@chula.ac.th` via `clasp` (`executeAs: USER_DEPLOYING`, so a different account switches the live app's identity) — confirmed via the stored id_token before deploying, not assumed. Frontend hosting: Cloudflare account `praew.tvl@gmail.com` — **a different identity from the backend**, unsettled on purpose |
| Migrations | 🟡 **`Daily_Log` AF–AG: no action required, one cosmetic step outstanding.** Both write paths widen the grid on demand, so the columns appear on the first save — no manual migration needed. `applyLogHeaderColumns()` would add the header *labels*, which are cosmetic (the columns are read and written by index). It runs as the signed-in user from the editor and may raise an OAuth consent, **so it is Praew's to run, not an agent's** |
| Cache-bust | `data.js?v=fenton-weight-v2-0905`, `calculator.jsx?v=saltrow-negdose-0905` (both bumped 2026-09-05); `app.jsx?v=safety-dupguard-0827`, `tweaks-panel.jsx?v=dashboard-edit2`, `icons.jsx?v=notes-date-sel1`, `fenton.jsx?v=ga-clamp42`, `registry.jsx?v=dol-input-fix1`, `log.jsx?v=bed-dol-io2` unchanged. Both shells byte-identical, confirmed live on both hosts |

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

## What Cloudflare does not serve

`.assetsignore` restricts Cloudflare to the 18 files the app actually loads. Verified
cache-busted on 2026-08-23: `gas-backend.gs`, `gas-backend.gs.js`, `SECURITY_CHECKLIST.md`,
`CODE_REVIEW_*.md`, `HANDOFF.md`, `PRD.md`, `STATUS.md`, `NeoFeed.html`, `test/`, `docs/`,
`graphify-out/` and `.git/` all return **404** there.

⚠️ **GitHub Pages still serves most of them.** It has no equivalent of `.assetsignore`, so the
backend source and every internal review remain publicly fetchable at
`valhalla-health.github.io/neofeed/` — confirmed 2026-08-23 for `gas-backend.gs`,
`SECURITY_CHECKLIST.md`, `CODE_REVIEW_2026-08-18.md`, `HANDOFF.md`, `PRD.md` and this file itself
(all `200`). `.git/` does not serve there — checked directly, unlike the rest of this list.
Closing the exposure means retiring Pages or making the repo private — and on a free org plan,
making it private **disables Pages entirely**, which would break every staff install pointing
there. Tracked in `BACKLOG.md` § Now.

## Response headers (Cloudflare only)

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

⚠️ **Gap not yet closed:** the CSP has been confirmed served correctly, but not yet exercised
against a real page load with the browser console open — Claude in Chrome was unreachable both
when this was written and when it was verified live. No CSP violation has actually been observed
or ruled out in a real browser. Low risk (the CSP was derived from an exhaustive static audit, and
`_headers` alone reverts in one commit with no backend involvement), but load the live app once
with dev tools open before treating this as fully closed.

`wrangler.jsonc` is the one exception on Cloudflare: wrangler force-includes its own config when
it sits inside the assets directory, so it is served and cannot be hidden from `.assetsignore`.
It holds no secrets. Reasoning recorded in `.assetsignore` itself.

## What has been exercised by a real human

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

**Verified against the real URLs after the push**, not just `wrangler dev`: `valhalla-health.
github.io/neofeed/` now serves the guard script (confirmed present in the HTML via `curl`);
`moved.html` there returns `200` with the correct button target; `neofeed.valhalla-health.
workers.dev` is untouched — guard present in the HTML but inert there, real app still loads,
headers still correct.

⚠️ **Still not closed:** `curl` confirms the guard *script is served*, not that it *executes and
redirects* — `curl` doesn't run JavaScript. Nobody has opened `valhalla-health.github.io/neofeed/`
in an actual browser since this shipped and watched it bounce to `moved.html`. The logic was
checked in Node (string-match doesn't false-positive on lookalikes) and the mechanism is placed
correctly (first script in `<head>`, before any resource fetch), but that is inference, not
observation. Do this check in a real browser before telling staff it's live.

**Still open, unaffected by this push:** `gas-backend.gs`, `SECURITY_CHECKLIST.md` and both
`CODE_REVIEW_*.md` files are still directly fetchable on GitHub Pages (`200`, checked same
session) — the guard protects the app entry point (`/`), not arbitrary file paths. That closes
only when the repo goes private. Remaining sequence: **staff announcement (Praew's action, not yet
done)** → 2-week window → repo goes private (Praew's action, GitHub Settings) → re-run the
exposure check → tick the `BACKLOG.md` item.

**Rollback:** revert `30dbff7`. No backend involvement.

---

**This file has exactly one job: what is live right now.** Updating it is part of the definition of
done for a deploy — same commit, not "later". It went stale twice when it lived inside `HANDOFF.md`,
and `NeoFeed/CLAUDE.md` was found on 2026-08-21 still claiming `@45`, four days out of date, which
is why that file no longer restates a version at all. Anything that is not current deployment state
belongs in `BACKLOG.md`, `PRD.md`, `AI_SDLC.md`, `REFERENCE.md` or `CHANGELOG.md`.
