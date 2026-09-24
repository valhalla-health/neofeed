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
any HTML/CSS/script-loader change must be applied to **both** or they silently
drift. See `CHANGELOG.md`'s CSS-drift entries for the recurring history.

Since 2026-09-17 one thing in them is no longer hand-kept: the `?v=` tokens, which
`tools/build.mjs` writes into both. The build refuses to run while the two differ in
anything else, so a one-sided edit now stops at the build instead of shipping. The
`NEOFEED_*` config and the GitHub Pages guard are no longer in the shells at all; they
live in `boot.js`.

## The frontend build

**Changed 2026-09-17, deliberately reversing the "no build step" rule.** The shells used
to load the 3 MB `@babel/standalone` from unpkg and compile ~530 KB of JSX in every
browser on every page load — about 4.6 s to the login screen on a workstation and 35 s
on a slow one (4× CPU throttle, measured 2026-09-17), and the reason `_headers` needed
`'unsafe-eval'` and `'unsafe-inline'`. Now `tools/build.mjs` precompiles the `.jsx` modules to
`compiled/*.js`, React/ReactDOM are self-hosted in `vendor/`, and the login screen is up
in ~160 ms (~440 ms throttled). What did not change is the property the old rule
protected: **no build runs on any host.** The output is committed, both hosts serve the
bytes in git, and CI proves those bytes are a fresh build of the committed sources.

**Before committing any change to a `.jsx` file, `data.js`, `boot.js` or either shell:**

```bash
npm ci --prefix tools        # once per clone, and whenever tools/package-lock.json changes
node tools/build.mjs
```

then commit the source edit **together with** everything the build changed
(`compiled/`, both shells' `?v=` tokens). Edit the `.jsx`, never `compiled/`. If you
forget, the `test` workflow's first step rebuilds on a clean checkout and fails the PR
("compiled/, vendor/ or the HTML shells do not match a fresh build"); it then runs every
harness twice, once against the sources and once against `compiled/`
(`test/compiled-loader.cjs`).

What the build guarantees, and refuses to write anything without:
- **Load order** is the `MODULES` list in `tools/build.mjs`: `boot.js` (first in
  `<head>`) → `vendor/` React → ReactDOM → `data.js` → `compiled/` icons → calculator →
  fenton → registry → log → app. Shells that disagree are rejected, so this line cannot
  rot the way the old copies in `HANDOFF.md` did.
- **One global scope.** Babel used to lower every top-level `const`/`let` to `var`, so a
  name declared in two modules "worked". As native scripts it is a load-time
  SyntaxError and a blank screen. The build loads every script into one scope and fails
  on any collision.
- **`?v=` tokens are content hashes** (first 10 hex of SHA-256, line endings
  normalised), so a changed file can never ship under an old token and
  `appVersion()`'s provenance stamp names exact bytes (`b=…;d=…;i=…;c=…;f=…;r=…;l=…;a=…`).
- **`vendor/` is byte-identical** to the unpkg React 18.3.1 builds the shells pinned by
  SRI. Upgrading React means changing `tools/package.json` *and* those pinned hashes on
  purpose.
- No inline `<script>` in either shell, no Babel, no unpkg, and the Google Fonts
  stylesheet after the last script (in `<head>` a slow fonts request held every script
  back by up to 3.6 s). `test/verify-build-shells.cjs` checks the same from the files
  alone, plus `_headers`, `.assetsignore` and `_config.yml`.

`compiled/` is marked `-text linguist-generated` in `.gitattributes`: Git never rewrites
its line endings, and GitHub collapses it in PR diffs, so review the `.jsx` change.

## Numbers a person reads

Praew, 2026-09-22: **no number anywhere in the UI ends in a trailing zero** — "18.0" is 18, because a
trailing zero can be read as a tenfold dose (the ISMP rule). That covers the screens, the printed order
and the copied order. Every displayed figure goes through `D.displayNum(value, maxDecimals)` (or
`fmt`/`f`/`n`, which wrap it): rounded half away from zero, never a trailing zero, "—" for a missing
value. There is no "keep zeros for column alignment" option any more. Storage is untouched: saved rows
keep full precision, and only the display rounds.

- The Admin dashboard's Recent log entries show at most **2 decimals**.
- The **weight is computed from its grams**, and a kg weight shows to 2 decimals (1234 g → 1.23 kg).
- **A typed dose prints as typed.** Only computed figures are rounded.
- `test/verify-tpn-team-0922.cjs` §8 fails on any trailing zero or float tail in any text node of the
  calculator, the form, the copied order or the daily log.

## The printed order

Since 2026-09-22 the order prints on **two sheets, meant to go double-sided** (Praew):

- **Front: the doctor's order.** It is the KCMH paper form, in the paper's own layout and words, with
  one table row per product so that no figure can sit on another product's line. Ordered products are
  bold, and the paper's other choices print unticked. Oral orders go under "8. Other", and the saver's
  name goes at "แพทย์". It carries **no alert text**: alerts are settled in the app, where a critical one
  needs a confirmation with a reason at Save. The "Normal Requirement" column is NeoFeed's targets, not
  the paper's printed ranges, which disagree with the app (review F4).
- **Back: pharmacy.** The Factor, the aqueous bag stock by stock in mL with the WFI q.s., K⁺ in the bag,
  Ca·PO₄, what reaches the infant, the critical-value confirmation, changes since the last order, and
  who saved it.

Two harness contracts: the patient table stays the form's first direct `<table>` child (the parity and
§6 figure sweeps skip it), and the provenance footer stays the form's last child.

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
`release` and merging it once the `harnesses` check passes — `release` has branch protection (PR
required, `harnesses` required, `enforce_admins` on, so this applies even to Praew's own pushes)
mirroring the confirm-before-`clasp deploy` step the backend already had. The point was never
third-party peer review, it's stopping an *unattended agent push* from going live, same as "confirm
with Praew before running the redeploy step" below.

⚠️ **Corrected 2026-09-11: self-approval does not exist on GitHub.** This paragraph used to say
"self-approval is expected and fine". GitHub never lets a PR's author approve it, and with
`enforce_admins` on, that includes Praew. Every `main → release` PR therefore needed the **other**
admin collaborator (`tasamew`) to approve it — a real second reviewer, not a formality — until
Praew changed the review count.

**Changed 2026-09-18, Praew's decision: `release` needs 0 approvals.** Praew merges `release` PRs
herself; `tasamew`'s review is optional. A red `harnesses` check (`.github/workflows/test.yml`, a
required status check since 2026-09-11) still blocks the merge, and a direct push to `release` is
still refused. What no longer blocks anything: GitHub cannot tell Praew from an agent using her
login, so **an agent merges into `release` only on Praew's explicit go-ahead** — a rule, not a lock
(`STATUS.md` § Release-branch deploy gate). To restore the second reviewer: `gh api -X PATCH
repos/valhalla-health/neofeed/branches/release/protection/required_pull_request_reviews -F
required_approving_review_count=1`.

**`main` is protected too, since 2026-09-23** — the same shape as `release` minus the review count:
`harnesses` required, `enforce_admins` on, force-push and deletion refused, 0 approving reviews. Until
then `main` had **no** effective protection, so a PR with a red `harnesses` could be merged into the
branch every release ships from. The repository ruleset named `protect-main` (created 2026-09-07) is
not that protection: its target-branches list is empty, so it applies to nothing —
`gh api repos/valhalla-health/neofeed/rules/branches/main` returns `[]`. Read the real settings with
`gh api repos/valhalla-health/neofeed/branches/main/protection`.

**Every release merge carries a tag**, `release-YYYY-MM-DD-prNN`, added as part of the release the way
`STATUS.md` is written as part of the deploy. Backfilled 2026-09-23 for every release since the gate
(PR #60 onward, 11 tags). It makes a rollback `git checkout <tag>` and completes the chain from a
printed order's provenance stamp → commit → tag:

```bash
git tag -a release-$(date +%F)-pr<N> <merge sha> -m "Release $(date +%F) — PR #<N> merged into release"
git push origin release-$(date +%F)-pr<N>
```

**Recording a deploy never takes its own PR** (Praew's global PR rule, 2026-09-18). Write the
planned `STATUS.md` change in the PR that ships the code. The post-release checks below exist only
after the merge, so they go in a comment on the `main → release` PR, and `STATUS.md` catches up in
the next PR on this repo. PRs #62, #68 and #72 each existed only to record a deploy.

**A merge into `main` always comes with its release PR** (Praew, 2026-09-22). `main` deploys
nothing, so a merged PR is not live until a `main → release` PR merges, and nothing said so outside
the PR itself: on 2026-09-22 PR #87 sat merged but unreleased while Praew opened the old app and
asked why nothing had changed. So:
- **Whoever merges a PR into `main` opens the `main → release` PR in the same session.** If one is
  already open, it has absorbed the merge on its own: report that PR instead of opening a second.
  The chat report names both halves, *"merged into `main` — ⏳ not live; release PR #N is green, say
  'release' to deploy"*, and never calls that merge done or live.
- **"merge แล้ว deploy" (merge and release) means both steps in one instruction:** merge into `main`,
  open the release PR, merge it once `harnesses` is green, run `node tools/verify-release.mjs`, and
  put its result in a comment on the release PR. A plain "merge" still stops at `main`: that is how
  several PRs go out as one release (#85 took eight, so the ward was not recoloured twice in a row).
- The gate itself is unchanged: an agent still merges into `release` only on Praew's explicit go-ahead.

- **Cloudflare Workers Builds' production branch is `release`** (changed by Praew in the dashboard
  on 2026-09-12 — dashboard-only, no `wrangler` subcommand or public API covers it). Both hosts now
  deploy from `release` and **neither deploys from `main`**: merging PR #59 into `main` built
  successfully and changed nothing in production, which is the gate working as designed.
- **GitHub Pages now serves from `release`** (repointed via `gh api .../pages`, verified live and
  rebuilt clean). Both hosts were wired to deploy from the same branch on 2026-08-23 precisely so
  they cannot drift; that property is preserved, the branch just changed.
- **Cloudflare publishes only the files the app loads**, per `.assetsignore`: since the
  2026-09-17 build step that is `index.html`, `manifest.json`, `moved.html`, `boot.js`, `data.js`,
  `compiled/`, `vendor/` and `icons/` — plus the six `.jsx` sources, kept for that one release so a
  browser still holding the previous shell can finish loading (drop them in a later release).
  GitHub Pages had no equivalent until `_config.yml` shipped 2026-09-11 (`5bfdb70`) — Jekyll now
  excludes the same set (internal docs, `gas-backend.gs`, `docs/`, `test/`, `tools/`). See
  `STATUS.md` for the verification.
- **`_headers` sets CSP and other security headers, Cloudflare only.** GitHub Pages has no
  equivalent, so the legacy host is unprotected by it regardless of what ships. See `STATUS.md`
  § Response headers for what it covers and what still needs a live-page check before it ships.
  ⚠️ **Since 2026-09-17 the CSP and the shells ship together**: `script-src` no longer allows
  inline script, eval or unpkg, so the pre-build shells render a blank page under it. Never revert
  one without the other; reverting the release merge reverts both.
- **Proving what a release serves.** Workers Builds and Pages build nothing, so the served bytes
  must equal the bytes in git. After a release:

  ```bash
  node tools/verify-release.mjs             # against the tip of `release`; or pass a commit
  ```

  On **both** hosts it compares with git at that commit, byte for byte: the shell, every script and
  link the shell names, `manifest.json`, `moved.html` and every file under `icons/`. Every `?v=`
  token must equal the first 10 hex of its file's sha256. `vendor/` is checked by bytes instead: its
  files carry the React version in their name, and the build refuses other bytes under them. On
  Cloudflare the CSP's **`script-src`** must allow no `'unsafe-inline'` and no `'unsafe-eval'`.
  `style-src` keeps `'unsafe-inline'` on purpose, for the shell's own `<style>` block, so reading the
  whole header for those words raises a false alarm. It exits 0 only if everything passes, and needs
  Node 18+ and the network, no `npm install`. It retries a dropped connection or a 5xx twice, and
  never a 4xx or a byte mismatch.

  **Trust a pass only after seeing it fail.** Pointed at a commit the hosts are not serving, it must
  fail on exactly the served files that differ. Its first runs, 2026-09-22: 0 failures against
  `release` = `edbd11f` (#88), and against the previous release `066528d` exactly #87's 15 files on
  each host, nothing else.

  GitHub Pages should answer `/` with the shell and then send any browser to `moved.html` — that
  redirect is `boot.js`, which neither `curl` nor the script runs.
- **Google Sign-In is origin-bound.** Every hostname the app is served from must be an Authorized
  JavaScript origin on OAuth client `750019806043-imunne8n…`. Google allows no wildcards, so a
  Cloudflare **preview** URL fails sign-in with `Error 400: origin_mismatch` until its exact
  hostname is registered. Hit on 2026-09-22 on a branch preview; the error names the OAuth policy
  rather than the app, so it reads as a NeoFeed bug and is not one.
  - Cloudflare gives a preview two URLs, and they are not equally useful here. The **branch** URL
    (`<branch>-neofeed.valhalla-health.workers.dev`) is stable for the life of the branch, so it
    *can* be registered. The **commit** URL (`<hash>-neofeed…`) changes on every push and never can.
  - So: **use a preview for layout, and register the branch URL only if you need to get past the
    login screen on it.** Remove it when the branch is merged — a production OAuth client should
    not accumulate dead origins.
  - `npx wrangler dev` is usually the better answer: it serves on `http://localhost:8787`, one
    stable origin, and it is faster than pushing (see below).
  - **Never** add a preview-only auth bypass to the code to work around this. A login that can be
    skipped is one merge away from production, in an app that writes pharmacy orders.
- **Fast local loop:** `npx wrangler dev`. No deploy, instant reload, and quicker than pushing.
- **Rollback:** `npx wrangler rollback`, or the Worker's *Deployments* tab. GitHub Pages has no
  rollback — revert the commit. For a release that crosses the 2026-09-17 build step, revert the
  whole `main → release` merge rather than individual files: `_headers`, both shells, `boot.js`,
  `compiled/` and `vendor/` only work as a set.
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
5. **Update `STATUS.md` as part of the deploy.** This is part of the definition of done, not
   a follow-up task — but not a docs-only PR either: put the verification in a comment on the
   PR whose code you deployed, and bring `STATUS.md` up to date in the next PR on this repo.

Running a function from the Apps Script editor (e.g. the one-off `applyStaffHeaderColumns`
/ `applyLogHeaderColumns` migrations) executes as the signed-in user and may raise an OAuth
consent — that is Praew's to approve, not something to click through on her behalf.

Redeploys are live and NICU staff are on them: **always confirm before the redeploy step.**

**The nursing I/O form (2026-09-24, `docs/NURSING_FORM_SPEC.md`) ships switched off.** Its backend
code can go out with any `clasp` deploy, and its frontend with any release. Neither changes anything
until the Script Property **`NURSING_LOG_ENABLED`** is set to exactly `true`:

1. **The gate is D7.** Leave the property unset until the DPO has signed off spec § 6.
2. **Set it only once the frontend that carries the I/O card is live** on both hosts. On the next
   sync, the card appears and nurses stop saving orders, together.
3. **To switch it off, delete the property.** It takes effect on the next sync.

**Never switch it on while an old frontend is still served.** An old frontend has no I/O card, and
the backend then refuses a nurse's order save (D5), which leaves nurses nowhere to record I/O.

The sync cache key carries the payload's shape (`sync2_`, plus `+n` while the switch is on), so no
stale payload bridges a deploy or a flip. `Nursing_Log` is created by the first nursing save; there
is no migration to run.

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
