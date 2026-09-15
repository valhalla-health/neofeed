# NeoFeed — Reference

Conventions, schema rules and compliance posture. **This file changes rarely** — if
something here needs updating every week, it belongs in `STATUS.md` or `BACKLOG.md`.

Split out of `HANDOFF.md` on 2026-08-21.

---

## Architecture and file inventory

**Deliberately not duplicated here.** `app-walkthrough.md` § 2 holds the authoritative
architecture table and the script load order. The old `HANDOFF.md` kept a third copy and
it rotted — by 2026-08-21 it still described `fenton.jsx` as *"Fenton 2013"* (it has been
2025 data since 2026-08-10), `gas-backend.gs` as *"Daily_Log schema extended A–P"* (it
reaches AC–AE), and the calculator as Steps 1–5 (it is a six-step wizard). One copy only.

## The two hand-synced shells

`NeoFeed.html` is the file you edit locally. `index.html` is what **both hosts** actually
serve — Cloudflare Workers and GitHub Pages. They are hand-synced copies, **not** a
canonical/generated pair —
any HTML/CSS/config/script-loader change must be applied to **both** or they silently
drift. See `CHANGELOG.md`'s CSS-drift entries for the recurring history.

## GA/PMA convention

**Storage:** `ga` is a number in `WW.D` shorthand:
- `26.4` = 26 weeks + 4 days
- Integer part = weeks, first decimal digit = days (literal 0–6)
- `28.1` is **28+1**, not "28.1 weeks decimal"

**Display:** Always go through `D.fmtGA(ga)` → `"W+D"` string
**Math:** `D.gaTotalDays(ga)` for day math; `D.pmaShort(ga, dol)` for PMA
**Plotting (Fenton):** `D.gaToDecimalWeeks(ga)` for true decimal x-axis
**Input parsing:** `D.parseGAInput(str)` accepts `"28+4"`, `"28.4"`, `"28"`; clamps days 0–6

The HMF threshold `patient.ga < 32` still works because all valid values stay under integer 32.

## Deploying, and rolling back

### Frontend

**`main` is a working branch, not a deploy trigger — `release` is.** Changed 2026-09-11
(`STATUS.md` § Release-branch deploy gate) to close the exact gap `AI_SDLC.md` § 5 named: a push
to `main` used to be an unreviewed production deploy on two hosts, because the backend demands
explicit confirmation before a redeploy and the frontend did not, backwards from the risk since
the frontend is where the printed dose is drawn. Deploying now means opening a PR from `main` into
`release` and getting it approved — `release` has branch protection (1 required approval,
`enforce_admins` on, so this applies even to Praew's own pushes) mirroring the confirm-before-
`clasp deploy` step the backend already had. The point was never third-party peer review, it's
stopping an *unattended agent push* from going live, same as "confirm with Praew before running
the redeploy step" below.

⚠️ **Corrected 2026-09-11: self-approval does not exist on GitHub.** This paragraph used to say
"self-approval is expected and fine". GitHub never lets a PR's author approve it, and with
`enforce_admins` on, that includes Praew. Every `main → release` PR therefore needs the **other**
admin collaborator (`tasamew`) to approve it — which is a real second reviewer, not a formality.
Praew's decision whether that stays the rule or the review count changes; either way, a release
blocked by "Review required" is this, not a bug. The `test` workflow (`.github/workflows/test.yml`)
runs every harness on each PR and is intended as a required status check on `release`.

- **Cloudflare Workers Builds' production branch is `release`** (changed by Praew in the dashboard
  on 2026-09-12 — dashboard-only, no `wrangler` subcommand or public API covers it). Both hosts now
  deploy from `release` and **neither deploys from `main`**: merging PR #59 into `main` built
  successfully and changed nothing in production, which is the gate working as designed.
- **GitHub Pages now serves from `release`** (repointed via `gh api .../pages`, verified live and
  rebuilt clean). Both hosts were wired to deploy from the same branch on 2026-08-23 precisely so
  they cannot drift; that property is preserved, the branch just changed.
- **Cloudflare publishes only the 18 files the app loads**, per `.assetsignore`. GitHub Pages had
  no equivalent until `_config.yml` shipped 2026-09-11 (`5bfdb70`) — Jekyll now excludes the same
  set (internal docs, `gas-backend.gs`, `docs/`, `test/`). See `STATUS.md` for the verification.
- **`_headers` sets CSP and other security headers, Cloudflare only.** GitHub Pages has no
  equivalent, so the legacy host is unprotected by it regardless of what ships. See `STATUS.md`
  § Response headers for what it covers and what still needs a live-page check before it ships.
- **Google Sign-In is origin-bound.** Every hostname the app is served from must be an Authorized
  JavaScript origin on OAuth client `750019806043-imunne8n…`. Google allows no wildcards, so
  Cloudflare **preview** URLs can never complete a login — use them for layout only.
- **Fast local loop:** `npx wrangler dev`. No deploy, instant reload, and quicker than pushing.
- **Rollback:** `npx wrangler rollback`, or the Worker's *Deployments* tab. GitHub Pages has no
  rollback — revert the commit.
- The Cloudflare account is `praew.tvl@gmail.com`, **not** the `peeraporn.po@chula.ac.th` identity
  that owns the backend. Deliberate for now, unresolved long-term.

### Backend (GAS)

⚠️ **The old `HANDOFF.md` "Restore production checklist" was deleted in the 2026-08-21
split rather than carried over.** It was written around session 8 (2026-05-25), described
the app as sitting in sandbox mode with `NEOFEED_GAS_URL` commented out, and instructed the
reader to *"paste `gas-backend.gs` into the Apps Script editor"* — which directly
contradicts the clasp-only rule below and would have switched the live app's executing
identity. None of it was true any more. The current procedure:

1. **Diff before you push.** `~/nicu-tools/neofeed/รหัส.js` **is** `gas-backend.gs`, but
   the two drift independently. Diff and **reconcile — never overwrite**. On 2026-08-17
   the mirror was found holding three security fixes that existed in no other copy.
2. `clasp push`, then `clasp update-deployment -V <n> <deploymentId>` against the
   **existing** deployment so `NEOFEED_GAS_URL` is unchanged. A plain `clasp deploy`
   creates a new, unused deployment instead.
3. **Deploy via `clasp`, never the editor's blue Deploy button.** The manifest sets
   `"executeAs": "USER_DEPLOYING"`, so the live web app runs as whoever *cut the
   deployment*. More than one Google account has editor access; deploying from the UI
   while signed in as the wrong one breaks Sheet access. Deploy as
   `peeraporn.po@chula.ac.th`.
4. **Verify rather than assume:** `clasp pull` into a scratch dir and diff against
   `gas-backend.gs`; check `clasp list-deployments` shows the same deployment ID at the
   new version; `curl` the served HTML on **both** frontend hosts to confirm the `?v=`
   cache-bust shipped.
5. **Update `STATUS.md` in the same commit.** This is part of the definition of done, not
   a follow-up task.

Running a function from the Apps Script editor (e.g. the one-off `applyStaffHeaderColumns`
/ `applyLogHeaderColumns` migrations) executes as the signed-in user and may raise an OAuth
consent — that is Praew's to approve, not something to click through on her behalf.

Redeploys are live and NICU staff are on them: **always confirm before the redeploy step.**

**Apps Script project timezone must be `Asia/Bangkok`.** Several date paths read Sheets' own date
values through `Session.getScriptTimeZone()` (`_fmtDate`) or assume a Sheets date sits at Bangkok
midnight (`_wardDateKey` in the one-entry-per-date guard, the 2026-09-11 edit-keeps-its-date rule,
and the sync window). `appsscript.json` lives only in the clasp mirror, not in this repo — check its
`"timeZone"` when touching it, and never change it without re-running `test/`.

**Password floor is 10 characters** for any new password (`MIN_PASSWORD_LENGTH`, server and
client, since 2026-09-11). Existing shorter passwords keep working until next changed.

## Thai PDPA compliance posture

This app processes infant health data — "sensitive personal data" under PDPA
Sec 26. What's in place and what's still open:

**Lawful basis:** Sec 26(6) medical necessity + professional confidentiality
(documented at the top of `gas-backend.gs`). No separate consent flow —
consistent with the exemption, but only covers *treatment* processing, not
secondary uses (e.g. research/QI exports) if those are ever added.

**Data subject rights implemented:**
- *Erasure/pseudonymization* — `pseudonymizePatient()` in `gas-backend.gs`,
  admin-only, triggered via `action: "pseudonymizePatient"`. Clears name,
  initials, dob from Patient_Registry; retains de-identified clinical history
  (bw/ga/diagnosis/weights) for the hospital's own medical-record retention
  duty. **Residual risk:** `sessionId` is generated as
  `initials+BW+twinSuffix` (see `data.js`), so it's a pseudonym, not
  anonymous — staff present at admission can still reverse-map it on a small
  census. Erasure does not (and structurally cannot, without breaking every
  Daily_Log join) scrub that pattern from an already-issued sessionId.
- *Access/rectification* — no self-service path yet; handled manually via
  admin editing the registry. Worth a real endpoint if request volume grows.

**Accountability (Sec 39):** `Audit_Log` sheet (auto-created by
`getSheetAudit()`) records registry reads and erasures with actor email +
timestamp — persists past Apps Script's 7-day execution-log window.

**Data minimization:** `handleLogout()` in `app.jsx` clears
`neofeed_calc_*`/`neofeed_acked_*` localStorage keys on logout, since those
hold per-patient clinical inputs (weight, fluids, labs) and NICU workstations
are typically shared devices.

**Open items are tracked in `BACKLOG.md` § 2**, not here.
