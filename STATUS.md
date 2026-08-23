# NeoFeed — Status

**Updated 2026-08-23** · 🟢 **DEPLOYED — backend production is `@47`**, carrying GitHub `main`
`34af805`. The frontend now serves from **two hosts, both auto-deployed from the same commit**;
backend and frontend are in step. **Two things are pending, both written and verified but not yet
on `main`:** `_headers` (§ Response headers below) and the GitHub Pages retirement mechanism
(§ GitHub Pages retirement below). Neither is live on either host until pushed.

| | |
|---|---|
| Frontend — primary | Cloudflare Workers static assets → `neofeed.valhalla-health.workers.dev`. Live and verified 2026-08-23 |
| Frontend — legacy | GitHub Pages → `valhalla-health.github.io/neofeed/`. Still live, and still where NICU staff home-screen installs point |
| Frontend deploy | `git push origin main` deploys **both**. Workers Builds runs `npx wrangler deploy`; GitHub Pages rebuilds from the repo root. Connected 2026-08-23 |
| Backend | GAS deployment `AKfycbz8Nt…` at **`@47`** — *"mustChangePassword server gate + usageMetrics M1 (GitHub main 34af805)"* |
| Deploy identity | Backend: `peeraporn.po@chula.ac.th` via `clasp` (`executeAs: USER_DEPLOYING`, so a different account switches the live app's identity). Frontend hosting: Cloudflare account `praew.tvl@gmail.com` — **a different identity from the backend**, unsettled on purpose |
| Migrations | none outstanding on any tab |
| Cache-bust | `app.jsx?v=pwd-gate-0821`; `registry.jsx?v=dol-input-fix1`; others unchanged. Both shells byte-identical |

**App code is unchanged since `34af805`.** `8e6c056` added frontend hosting config only —
`wrangler.jsonc` and `.assetsignore` — and touched no file the app loads. The HTML served by
Cloudflare was verified byte-identical to `index.html`.

**What `@47` changed:** the `mustChangePassword` server gate — a temp-password account can now do
nothing but change its password — plus `usageMetrics()` / `getUsageMetrics()`, which are inert
(not on the `doPost` path).

**Rollback (backend):**
```
clasp update-deployment -V 46 AKfycbz8NtHuyTdo4EP-ZKb5n5LIRqVzGSY286MZRlXMniO51xjiuQO7eOLvltsrejkL4GgV
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

⚠️ **Written 2026-08-23, sitting in the working tree, not yet on `main` — not live yet on either
host.** `_headers` adds a CSP plus `X-Frame-Options`, `Referrer-Policy`,
`X-Content-Type-Options`, `Cross-Origin-Opener-Policy`, `Permissions-Policy` and HSTS. It applies
**to Cloudflare only** — GitHub Pages has no `_headers` support, so the legacy host stays
unprotected regardless. Wrangler consumes the file as config rather than serving it back;
confirmed via `wrangler dev` against a copy of the published file set that `/_headers` itself
404s, so it needs no `.assetsignore` entry.

Verified against `wrangler dev` (not the live Worker) that all seven headers land on `/` and on a
sample sub-resource (`/app.jsx`). The CSP was built from a static audit of every external origin
the app's own files reference — `unpkg.com`, `accounts.google.com`, `fonts.googleapis.com`,
`fonts.gstatic.com`, `script.google.com`, `*.googleusercontent.com`, one `data:` SVG in
`tweaks-panel.jsx` — not from a live in-browser console check, because Claude in Chrome was
unreachable this session. `script-src` still carries `'unsafe-inline' 'unsafe-eval'`, unavoidable
without a build step since `@babel/standalone` compiles the `.jsx` modules client-side.
**Before this goes live: load the real app through it once (Cloudflare preview URL is fine for
this, since it's a layout/console check, not a login check) and watch the console for CSP
violations** — the static audit is thorough but has not been exercised against the actual page
load.

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

⚠️ **Written 2026-08-23, sitting in the working tree, not yet on `main` — not live yet.** Answers
the `BACKLOG.md` § Now item about `gas-backend.gs` and the `CODE_REVIEW_*.md` files being publicly
served from `valhalla-health.github.io/neofeed/`.

**Mechanism:** a hostname guard, first script in `<head>` of both `index.html` and `NeoFeed.html`
(kept byte-identical, per `NeoFeed/CLAUDE.md`) — `if (location.hostname ===
"valhalla-health.github.io") location.replace("moved.html")`. New file `moved.html`: a
self-contained Thai "moved" page (no external font/CDN dependency, so it can't fail to render) with
a button to `neofeed.valhalla-health.workers.dev`. Cloudflare visitors never match the hostname
check — no-op for them, confirmed via `wrangler dev` against a copy of the published file set
(`/` still serves the real app, `id="root"` present, `app.jsx` still 200).

**Once pushed, this *is* the real cutover** — anyone still opening the GitHub Pages link stops
being able to use the calculator there immediately, not just when the repo eventually goes
private. Plan: push → announce in the staff LINE group same day → 2-week window where the old link
shows the moved page instead of a dead link → repo goes private (Praew's action, GitHub Settings)
→ re-run the `gas-backend.gs`/`CODE_REVIEW_*.md` exposure check to confirm it actually closed →
tick the `BACKLOG.md` item.

**Rollback:** revert the one commit. No backend involvement at any point in this mechanism.

**Verification gap, matching the one on `_headers`:** confirmed via Node that the hostname string
match doesn't false-positive on lookalikes (`workers.dev`, `localhost`, `*.github.io.evil.com`)
and via `wrangler dev` that the Cloudflare path is untouched. Have **not** exercised the redirect
actually firing in a real browser against the real `valhalla-health.github.io` hostname — Claude in
Chrome was unreachable this session (same gap as `_headers`). Low risk given the mechanism is a
single string comparison and the whole change reverts in one commit, but load
`valhalla-health.github.io/neofeed/` in an actual browser once after pushing, before telling staff
it's live.

---

**This file has exactly one job: what is live right now.** Updating it is part of the definition of
done for a deploy — same commit, not "later". It went stale twice when it lived inside `HANDOFF.md`,
and `NeoFeed/CLAUDE.md` was found on 2026-08-21 still claiming `@45`, four days out of date, which
is why that file no longer restates a version at all. Anything that is not current deployment state
belongs in `BACKLOG.md`, `PRD.md`, `AI_SDLC.md`, `REFERENCE.md` or `CHANGELOG.md`.
