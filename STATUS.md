# NeoFeed — Status

**Updated 2026-08-26** · 🔴 **Backend production is `@49`, and `@49` is a TEMP-DEBUG deployment.**

> ### This file was wrong for two days, in the way it exists to prevent
> Until 2026-08-26 this file said production was `@47` carrying `34af805`, and that *"nothing is
> pending on either host."* Both were false. `clasp list-deployments` reports:
>
> ```
> AKfycbz8NtHuyTdo4EP-… @49 - TEMP-DEBUG: sheet-backed login-kickback diagnostics
> ```
>
> Two deployments (`@48`, `@49`) were cut on 2026-08-24 without the same-commit update to this file
> that is supposed to be part of the definition of done. **The instrumentation is live in
> production**: `verifyToken`/`createSession` tracing, the `Debug_Log` sheet writer, and
> `getDebugLogText()`. Reverting it is a decision, not a chore — the login-kickback bug it was
> chasing may still be open. Tracked in `BACKLOG.md` § Now.

**Five commits sit on `main` beyond the `30dbff7` this file used to describe:** three TEMP-DEBUG
(`489a977`, `a52846d`, `680fe69`), the server-side plausibility guard (`0004d5c`), and a docs
commit. `main` and `origin/main` are in step.

| | |
|---|---|
| Frontend — primary | Cloudflare Workers static assets → `neofeed.valhalla-health.workers.dev`. Live and verified 2026-08-23 |
| Frontend — legacy | GitHub Pages → `valhalla-health.github.io/neofeed/`. Still live, and still where NICU staff home-screen installs point |
| Frontend deploy | `git push origin main` deploys **both**. Workers Builds runs `npx wrangler deploy`; GitHub Pages rebuilds from the repo root. Connected 2026-08-23 |
| Backend | GAS deployment `AKfycbz8Nt…` at **`@49`** — *"TEMP-DEBUG: sheet-backed login-kickback diagnostics"*, cut 2026-08-24. ⚠️ **Debug instrumentation is live** |
| Clasp mirror | `~/nicu-tools/neofeed/รหัส.js` reconciled to the repo on 2026-08-26 (`a65233f`) and **byte-identical to `gas-backend.gs`**. It is therefore *ahead* of what is deployed — a `clasp push` would ship the provenance columns and the plausibility guard together |
| Deploy identity | Backend: `peeraporn.po@chula.ac.th` via `clasp` (`executeAs: USER_DEPLOYING`, so a different account switches the live app's identity). Frontend hosting: Cloudflare account `praew.tvl@gmail.com` — **a different identity from the backend**, unsettled on purpose |
| Migrations | ⏳ **`Daily_Log` AF–AG pending.** `constantsVersion`/`appVersion` are written by the *committed* backend, which is not deployed. Both write paths widen the grid on demand, so no manual migration is required before a deploy; `applyLogHeaderColumns()` only adds the cosmetic header labels |
| Cache-bust | `app.jsx?v=pwd-gate-0821`; `registry.jsx?v=dol-input-fix1`; others unchanged. Both shells byte-identical |

### 🟠 Two backend changes are committed on `main` and have never been deployed

Verified 2026-08-26 against the pre-reconciliation clasp mirror, which *is* the deployed source:

| Committed | Live? | What it does |
|---|---|---|
| **Server-side plausibility guard** — `0004d5c`, 2026-08-25 | ❌ **No** | `_checkRange`/`_validatePatient`/`_validateLogEntry`/`_validateWeightsArray` on `doPost`'s three write paths. `_checkRange` appears **zero times** in the deployed source — `registry.jsx` sets no upper bound and `doPost` is reachable by `curl`, so nothing live stops BW=50000 or GA=200 reaching the sheet today |
| **Provenance columns** — 2026-08-26 | ❌ No | `constantsVersion`/`appVersion` → Daily_Log AF–AG |

The **frontend half of the provenance change is safe to ship alone**: `@49` ignores the two extra
fields it will start receiving, so the printed order-form footer works immediately and the two sheet
columns stay blank until a backend deploy.

**What `@49` changed** (relative to `@47`, which is what this file used to describe): the
TEMP-DEBUG instrumentation only. `@47`'s own content — the `mustChangePassword` server gate, plus
`usageMetrics()`/`getUsageMetrics()`, which are inert and not on the `doPost` path — is still in
there underneath.

**Rollback (backend):**
```
clasp update-deployment -V 47 AKfycbz8NtHuyTdo4EP-ZKb5n5LIRqVzGSY286MZRlXMniO51xjiuQO7eOLvltsrejkL4GgV
```
`-V 47` drops only the TEMP-DEBUG instrumentation; it loses nothing else, because nothing else has
ever been deployed on top of `@47`. The better move is forward, not back: cut a clean version from
the reconciled mirror, which carries the plausibility guard and the provenance columns together.

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

⚠️ **Real login: reported working by Praew on 2026-08-23**, on the Cloudflare host, after
`https://neofeed.valhalla-health.workers.dev` was added as an Authorized JavaScript origin on
OAuth client `750019806043-imunne8n…`. That exercises GIS → `verifyToken` → Sheet against `@47`
end to end, outside a stub, for the first time.

**A real Delete is still unexercised**, and the harnesses still model neither `CacheService`
eviction nor `LockService` contention. So the `BACKLOG.md` § Now item **narrows, it does not
close** — confirm the login personally before ticking it.

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
