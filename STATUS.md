# NeoFeed — Status

**Updated 2026-09-12** · 🟢 **Backend production is `@53`** (the 2026-09-11 review's backend fixes,
PR #59, deployed 2026-09-12 03:37 ICT). 🟡 **Frontend is the `publishlock-0910` build on both hosts
until PR #59 is merged** — backend-first is the documented order and the two are compatible; see
"How `@53` was verified" for what staff notice in between. (This record rides in PR #59 because a
direct docs push to `main` is itself a Cloudflare deploy.)
🟡 **Deploy gate is half-closed — see "Release-branch deploy gate" below before assuming a push to
`main` is safe on both hosts.**

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
outstanding until PR #60 (`main` → `release`) merges.

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
| Backend | GAS deployment `AKfycbz8Nt…` at **`@53`** — *"2026-09-11 review B1-B7 - GitHub review/2026-09-11-fixes df85531 (PR #59)"*, cut 2026-09-12 03:37 ICT. Previous: `@52` (PR #58) |
| Clasp mirror | `~/nicu-tools/neofeed/รหัส.js` at `f453583`, **byte-identical to `gas-backend.gs` and to the deployed source** (`clasp pull` into a clean scratch dir, diffed clean) |
| Deploy identity | Backend: `peeraporn.po@chula.ac.th` via `clasp` (`executeAs: USER_DEPLOYING`, so a different account switches the live app's identity) — confirmed via `clasp show-authorized-user` before deploying, not assumed. Frontend hosting: Cloudflare account `praew.tvl@gmail.com` — **a different identity from the backend**, unsettled on purpose |
| Migrations | 🟡 **`Daily_Log` AH–AL: no action required, one cosmetic step outstanding** — same shape as AF/AG. Both write paths widen the grid on demand, so the columns appear on the first save/publish — no manual migration needed. `applyLogHeaderColumns()` would add the header *labels*, which are cosmetic (the columns are read and written by index). It runs as the signed-in user from the editor and may raise an OAuth consent, **so it is Praew's to run, not an agent's** |
| Cache-bust | `data.js?v=publishlock-0910`, `calculator.jsx?v=publishlock-0910`, `app.jsx?v=publishlock-0910` (all three bumped 2026-09-10); `registry.jsx?v=patientid-0910`, `tweaks-panel.jsx?v=dashboard-edit2`, `icons.jsx?v=notes-date-sel1`, `fenton.jsx?v=ga-clamp42`, `log.jsx?v=bed-dol-io2` unchanged. Both shells byte-identical, confirmed live on both hosts |

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

**What staff notice while the frontend is still `publishlock-0910`:**
- Login failures read "email หรือรหัสผ่านไม่ถูกต้อง" for both unknown email and wrong password; a
  disabled account only hears "บัญชีนี้ถูกระงับ" after typing the right password.
- A new password must be ≥ 10 characters; the old modal still says "อย่างน้อย 6" but shows the
  server's "อย่างน้อย 10" refusal.
- Ward devices (and, until the new frontend asks for `includeArchived`, admin devices too) no longer
  receive patients discharged/transferred more than 30 days ago. The registry already hid them after 7.
- Saving an order for a patient whose registration never reached the server is refused.
- Nothing else is visible: Submit/publish is still unreachable from the UI (`ENABLE_PUBLISH_GATE` off).

⚠️ **Still unexercised by a human:** a real login + save + edit against `@53`.

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
