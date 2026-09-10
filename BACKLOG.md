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
- [ ] 🔒 **security · GitHub Pages publicly serves `gas-backend.gs` and every internal review,
      right now — ⚙️ REDIRECT STUB SHIPPED 2026-08-23 (`30dbff7`), STAFF NOT YET TOLD.** The
      redirect stub (option (b), see below) is live: `valhalla-health.github.io/neofeed/` now
      bounces the app entry point to `moved.html`. **This does not close the item** — it stops
      staff from using the calculator there, it does not stop the files below from being fetched
      directly. Remaining: Praew announces in the staff LINE group → 2-week window → repo goes
      private (Praew, GitHub Settings) → re-run the exposure check below → tick this.
      Verified 2026-08-23: `valhalla-health.github.io/neofeed/gas-backend.gs`,
      `SECURITY_CHECKLIST.md`, `CODE_REVIEW_2026-08-18.md`, `HANDOFF.md`, `PRD.md` and `STATUS.md`
      all return `200`. (`.git/` does not — checked directly, that part of `STATUS.md`'s "serves all
      of them" is broader than confirmed.) The two `CODE_REVIEW_*.md` files are the sharpest problem:
      they are a public, dated list of this app's *unpatched* vulnerabilities, next to the backend
      source that shows exactly where they live. Cloudflare already blocks this via `.assetsignore`
      (2026-08-23) — GitHub Pages has no equivalent mechanism, so this stays open on that host until
      one of: (a) a `.nojekyll`-style file-level exclusion is found for Pages, (b) Pages is retired in
      favour of Cloudflare alone, or (c) the repo goes private — which **on this free org plan
      disables Pages immediately** and breaks every staff install pointing there, so it requires the
      redirect-stub sequence in `REFERENCE.md` first, not a same-day flip. Distinct from the
      *"push to `main` is an unreviewed deploy"* item below: that one is about an ungated code path,
      this one is about content already sitting at a public URL independent of any future push.
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
- [ ] 🔒 **security/process · A push to `main` is an unreviewed production deploy of the
      frontend.** GitHub Pages serves `index.html` from the repo root, so there is no human gate
      between an agent's commit and the browser a nurse is holding — while the *backend* requires
      explicit confirmation to deploy. **The asymmetry is backwards from the risk:** the gated half
      cannot render a wrong number without the ungated half, and the frontend is where the printed
      dose is drawn. Demonstrated 2026-08-21, when an agent push put `app.jsx?v=pwd-gate-0821` live
      within minutes. Fix: protect `main` and require a PR, or serve Pages from a `release` branch
      that only a human merges into — the second mirrors how the backend already works. Surfaced by
      `AI_SDLC.md` § 5.
- [ ] 🔒 **process · Deploy the backend half of PR #58 (publish-lock) before flipping
      `ENABLE_PUBLISH_GATE` on.** Merged 2026-09-10: `gas-backend.gs` gained `publishDailyLog()`, the
      `publishLog` action and `updateDailyNutrition`'s revision branch, but only the frontend
      auto-deployed — the backend needs its own `clasp push` + deploy step (`REFERENCE.md`), not yet
      taken. Safe today only because the flag defaults off. See `STATUS.md`'s 2026-09-10 entry for
      the full warning; delete this line once the backend is actually deployed and verified.
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
