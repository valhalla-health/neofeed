# NeoFeed — Backlog

Everything known-but-not-done, in one place. **Review weekly.** When an item ships, delete it here
and record it in `CHANGELOG.md`.

Gathered 2026-08-21 from the old `HANDOFF.md` banner, its "Known caveats" and PDPA "Open items"
sections, `CLAUDE.md`'s "Known open items", and the *unfixed* findings of
`CODE_REVIEW_2026-08-18.md`.

**Ordered 2026-08-21 — this is now a decision, not a proposal.** The first version of this file
grouped items by *kind* (safety / security / PDPA / product) and said outright that the ordering was
"a proposal, not a decision … re-order it to taste; that act *is* the product-management job." This
is that act. Items are now grouped by **when**, and each keeps its kind as a tag so nothing is lost.

**How the ranking was decided**, so it can be argued with rather than guessed at:

1. **Reaches a patient** outranks everything. A wrong printed dose is the only failure mode here
   that is not recoverable.
2. **A live authorisation hole** outranks a latent one, because the system is in use by real NICU
   staff right now.
3. **Something already half-done** outranks something not started — an unexercised deploy is a
   liability that costs little to discharge.
4. **Compliance gaps with no incident pressure** rank below live risk but above polish, because
   they get harder to fix as the data grows.
5. **Anything whose fix could itself break a clinical number** waits for a quiet week.

🔴 **Two of these are Praew's call to overrule, not mine** — the stock-concentration check is a
physical act in the ward, and whether `TARGETS.fluid` should take birth or current weight is
clinical judgement. Everything else is engineering sequencing.

---

## 🔥 Now — this cycle

- [ ] 🩺🔒 **safety+security · Ship `review/2026-09-11-fixes` (2026-09-11 full review) — built and
      tested, NOT deployed.** See `CHANGELOG.md` 2026-09-11 (3). Two halves, deploy the **backend
      first** (the new frontend sends `expectedLastModified` on Submit, which only the new backend
      checks; everything else is additive both ways):
      1. **Backend:** copy `gas-backend.gs` → `~/nicu-tools/neofeed/รหัส.js`, `clasp push`,
         `clasp create-version`, `clasp update-deployment -V <n> AKfycbz8Nt…` — **confirm with Praew
         first**, per `REFERENCE.md`. Behaviour changes staff will notice: one login error message for
         unknown email/wrong password; ward devices stop receiving patients discharged >30 days.
      2. **Frontend:** merge the PR into `main` (Cloudflare deploys from `main` until C1 below is
         done), then `main → release` for GitHub Pages. Cache-bust `?v=review-0911`.
      3. **Human check after deploy:** open a saved order, change one dose without saving → Print must
         refuse; enter K 5 mEq/kg/d → Save must ask for a reason and print it.
- [ ] 🔒 **security · C1 — Cloudflare production branch → `release`** (dashboard only; Praew's step,
      unchanged — see the "push to `main`" item under Next). Re-confirmed 2026-09-11: Workers Builds
      built `1922488`, which is on `main` and not on `release`.

- [ ] 🔒 **security · Exercise `@50` with a real login, a real save and a real Delete.**
      ✅ **Deployed 2026-08-26** — TEMP-DEBUG reverted, and the server-side plausibility guard
      (`0004d5c`) is finally live after never having been deployed at all. What remains is the human
      half, and it is now worth more than before because one session discharges three things at
      once: the standing *"auth changes never exercised outside a stub"* item, confirmation that
      `Daily_Log` AF–AG actually fill with `2026-08-26.1`, and a first real Delete. Stubs model
      neither `CacheService` eviction nor `LockService` contention, so **only a person can close
      this.** Supersedes the old `@47` version of this item.
- [ ] 🧹 **chore · Run `applyLogHeaderColumns()` once from the Apps Script editor.** Adds the
      cosmetic `constantsVersion`/`appVersion` labels to `Daily_Log` row 1. Purely presentational —
      the columns are read and written by index and already work without it. It executes as the
      signed-in user and may raise an OAuth consent, **so it is Praew's to run.**
- [ ] 🩺 **safety · Confirm Na acetate (3 mEq/mL) and KCl (2 mEq/mL) stock concentrations against the
      shelf.** Both were *inferred* from the KCMH worksheet's divisors, not read off an explicit
      strength label. **These corrected concentrations change the mL printed on every order form** —
      the highest-stakes open item in the repo. Blocked on a physical check in the ward, not on code.
      ⬆️ **Now answerable after the fact:** since `@50` (2026-08-26) every saved row and every
      printed order carries `CONSTANTS_VERSION`, so when the shelf check lands, *"which orders used
      the old divisor?"* has an answer. Rows written **before** 2026-08-26 have a blank AF and
      cannot be attributed — that set is now fixed and will not grow.
- [ ] 📈 **product · M1, weekly active users — ⚙️ BUILT 2026-08-21, NOT YET RUN.** `usageMetrics()` +
      `getUsageMetrics()` are in `gas-backend.gs`, pinned by `test/verify-usage-metrics.cjs`
      (30 assertions, green). **The number still does not exist**, because nothing has read the live
      sheet yet. To close this: run `getUsageMetrics()` **once from the Apps Script editor** — it is
      not on the `doPost` path, so **no redeploy is needed** — and it is **already deployed**
      (`@47` onward, still present in `@50`), so it is sitting in the live project waiting to be
      called. It executes as the
      signed-in user and may raise an OAuth consent, which is Praew's to approve. **Still
      deliberately not wired to `doPost`**: it was kept off the auth deploy so that release carried
      nothing but the security fix. Wire it when a UI actually wants the number.
      Definition and the two hard constraints: `PRD.md` § 6.

## ⏭ Next

- [ ] 🩺 **safety · `registerPatient` silently overwrites on a colliding `initials+BW` pseudonym.**
      Two different infants sharing initials and birth weight collapse into one record. Needs an
      identity decision before code — a collision suffix changes every `Daily_Log` join.
- [ ] 🩺 **safety · `TARGETS.fluid` is documented as taking birth weight, but every call site passes
      current weight.** One of the two is wrong. **Clinical decision, not a bug fix** — decide which
      is correct, then make code and docs agree.
- [ ] 🔒 **security/process · A push to `main` is an unreviewed production deploy —
      ⚙️ HALF-CLOSED 2026-09-11, CLOUDFLARE STEP STILL PRAEW'S TO DO.** `release` branch created
      with branch protection (1 required approval, `enforce_admins` on); GitHub Pages repointed to
      serve from it and verified live. **Cloudflare Workers Builds still deploys from `main` on
      every push** — its production-branch setting is dashboard-only, no `wrangler`/API path found.
      Remaining: Workers & Pages → neofeed → Settings → Build → change production branch to
      `release`, then re-verify (push something harmless to `main` only, confirm Cloudflare does
      *not* redeploy; merge to `release`, confirm it does). See `STATUS.md` § Release-branch deploy
      gate for the full record. Demonstrated 2026-08-21, when an agent push put
      `app.jsx?v=pwd-gate-0821` live within minutes. Surfaced by `AI_SDLC.md` § 5.
- [ ] 🧱 **product · There is no error boundary** — `PatientStrip` throwing white-screens the whole
      app. One instance was hit and fixed on 2026-08-18; the class of bug is still open.
- [ ] 🧱 **product · The app is installable but has no offline capability.** `manifest.json` makes it
      a PWA and staff have home-screen installs, but there is **no service worker**, so a home-screen
      icon opens to nothing with no network. Partially addressed 2026-08-26: the staleness banner now
      *tells* the user they are offline and that saves will not reach the sheet — that is the
      safety-relevant half, and it is shipped. The rest is a cached shell (read-only, clearly
      labelled) and, only after the server-side one-entry-per-date guard exists, a queued save.
      See `NEOFEED_DIGIHEALTH_UPGRADE_MAP.html` §05 for the three levels.
- [ ] ⚖️ **PDPA · No retention or auto-purge policy after discharge** — records persist indefinitely
      in the Sheet today. ⭐ **This is the candidate scope for the 3099706 course project** (see
      `PRD.md`'s course-link note): it is genuinely not-yet-built, so the coursework produces real
      work rather than a hypothetical.

## 🕓 Later

- [ ] 🩺 **safety/governance · Decide who may create and Submit a TPN order.** `canWrite` includes
      nurses for `logDailyNutrition`/`publishLog`, and the Intake/Output card lives inside the
      Calculator, so a nurse recording urine output re-saves the whole order (2026-09-11 review P2).
      Proposed: a separate nursing-entry screen (weight, I/O per shift, feeds given) writing its own
      columns, then narrow order writes to prescribers. **Clinical workflow decision — Praew's.**
- [ ] 💊 **product · Pharmacist role** — read-only plus a received/verified/compounded status per
      order. The printed form now carries HN/AN boxes, saved-by/time/revision and changes-vs-previous
      (2026-09-11); the status loop is not built.
- [ ] 🩺 **safety · Confirm the HMF start threshold** the app shows (`hmfStart: 40` mL/kg/day). The WHO
      tab used to say ≥100 while the EN tab said ≥40, both citing WHO 2023; both now show NeoFeed's 40
      and say "confirm locally".
- [ ] 🔒 **security/process · GitHub hygiene from the 2026-09-11 review:** make the `test` workflow a
      required check on `release` once it has run on `main`; decide whether `tasamew` stays admin (and
      is the `release` approver — see `REFERENCE.md`); confirm 2FA on both GitHub admins and on the
      Cloudflare account; close/delete the 4 stale branches and draft PRs #56/#57 (`codex/center-point-v2`
      holds 11 unmerged commits — decide before deleting).

- [ ] 🩺 **safety · `FENTON_LENGTH` / `FENTON_HC` are unverified against any source** and sit at
      4-week steps. `FENTON_WEIGHT` was verified against Fenton 2025 on 2026-08-10 and re-checked
      2026-09-05 against the official ucalgary.ca v2 cutoff table (which caught and fixed GA
      36-41 boys / 36,40,41 girls drift — see `CHANGELOG.md`); the other two still have **no
      public numeric table to check against at all** (charts only). Praew is emailing
      tfenton@ucalgary.ca for the LMS parameters.
- [ ] ⚖️ **PDPA · No self-service access/rectification path** for data-subject requests; handled
      manually by an admin editing the registry. Worth a real endpoint if volume grows.
- [ ] ⚖️ **PDPA · Cross-border transfer (Sec 28) never evaluated** — data lives in Google
      Sheets/Apps Script. Verify Google Workspace's DPA/SCC coverage is adequate for the org's
      data-location requirements.
- [ ] ⚖️ **PDPA · `Audit_Log` gains a row per re-sync per user per minute** (since `syncFromGAS`
      began running on tab focus). It grows without bound and its signal-to-noise for accountability
      review has dropped. ⚠️ **Fixing this interacts with M1** — do not thin the log in a way that
      destroys the distinct-`actorEmail`-per-week signal.

### Carried over, unverified

Copied from the old `HANDOFF.md` "Known caveats", written around session 8 (2026-05-25). **The line
numbers are certainly stale and the claims were not re-checked during the 2026-08-21 split** —
verify before acting on any of them.

- [ ] `enVolPerKg` is logged on new submissions, but legacy entries from before session 8 lack the
      field and fall back to PN targets.
- [ ] GAS `Unauthorized` shows an error toast rather than redirecting to login (old note: `app.jsx`
      line ~145).
- [ ] `_buildLogRow`'s date fallback still uses `toISOString()`.

---

## ⛔ Standing guardrails — NOT tasks, and must never be ticked

These sat in the task list until 2026-08-21, where a future reader could have "completed" one. They
are decisions to *keep*, not work to do.

- **Do not widen the Fenton axis past 42 wk** to "fix" the hidden-measurement banner. The GA 44–50
  rows in `data.js` are unverified. Source real post-term data first. `GA_MAX` in `fenton.jsx` is the
  single switch for domain, ticks and dataset filter.
- **Accepted residual risk:** `sessionId` = `initials+BW+twinSuffix` is a **pseudonym, not
  anonymous**. Erasure cannot scrub that pattern from an already-issued sessionId without breaking
  every `Daily_Log` join. Documented and accepted, not fixed.
- **Mobile Fenton chart keeps pan/zoom**; the SVG width-760 layout survives via
  `width: 100%; height: auto`. Recorded so nobody "fixes" it into a responsive rewrite.
- 🔴 **This Sheet's sharing must never become "anyone with the link."** Verified 2026-08-23:
  `SPREADSHEET_ID` (`1cZSA2qAUWAvFmpzrcjxS8kw6r-MpCMOSVAJev1uNDtI`) was hardcoded in `gas-backend.gs`
  in the **initial commit** (2026-05-17), before being moved to Script Properties. `valhalla-health`
  has been a **public** repo since that commit, so the ID itself must be treated as permanently
  known to anyone who ever cloned or scraped the repo — rewriting git history would not undo that,
  it would only stop *future* clones from getting it. Checked `get_file_permissions` on 2026-08-23:
  the sheet is currently shared with **only** `peeraporn.po@chula.ac.th` (owner), no link-sharing,
  no domain-wide access — that ACL is the *only* thing standing between the leaked ID and real
  access. If sharing is ever loosened, even briefly, this stops being theoretical. `CLIENT_ID`
  (also hardcoded in the same early commits) is not a comparable risk — Google OAuth client IDs for
  web apps are meant to be public and this one already sits in `index.html` today.

---

## Definition of done

An item leaves this file only when all of these are true:

1. The change is on `main`.
2. If it changed behaviour, a harness in `test/` **fails against the unpatched source** and passes
   against the patched one — the repo's convention, see `TDD.md`.
3. If it was deployed, **`STATUS.md` was updated in the same commit** — not later. It went stale
   twice when deployment state lived inside `HANDOFF.md`.
4. A `CHANGELOG.md` entry exists, and the line is **deleted from here**. An item in both files is a
   bug in the process.

## The weekly review

Fifteen minutes, one pass down this file. Three questions per item, in this order:

1. **Is it still true?** § *Carried over, unverified* exists because four claims from May survived
   three months unchecked. Delete what has quietly fixed itself.
2. **Has anything moved between Now / Next / Later?** New information re-ranks; the ordering above
   is a decision, and decisions get revisited on purpose rather than by drift.
3. **Did anything ship without leaving?** Cross-check the last week of `CHANGELOG.md` against this
   file.

**`git fetch` before you start.** On 2026-08-21 three PRs landed on `main` mid-edit and the first
attempt at the doc split was built on a stale file. This repo moves under you.
