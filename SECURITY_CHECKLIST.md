# Frontend Logic Leak — Pre-Deploy Checklist

Run this before every deploy. NeoFeed has **no build step** — `NeoFeed.html`/
`index.html` load `.jsx`/`.js` files directly via in-browser Babel
(`app-walkthrough.md` §1). That changes what this checklist means in two
ways vs. a normal bundled app:

- **What ships to the browser IS the source.** There is no minifier to
  strip comments or dead code, and no separate `dist/`/`build/` output to
  diff against source — round 2 below always finds exactly what round 1
  found, byte-for-byte. Treat every comment and every commented-out block
  in `.html`/`.jsx`/`.js` as public.
- **`gas-backend.gs` is the only real trust boundary.** Everything else in
  the repo (`app.jsx`, `data.js`, `calculator.jsx`, `log.jsx`, `fenton.jsx`,
  `registry.jsx`, `icons.jsx`, `tweaks-panel.jsx`, both HTML shells) is
  static and public. `gas-backend.gs` runs server-side on Apps Script — it's
  the only place a secret or a server-enforced check can actually live.

**Governing principle:** a true secret (credential, patient identifier,
algorithm meant to be protected) must never be *sent* to the browser in the
first place. Minifying, obfuscating, or hiding it in a collapsed UI panel
after it's already in the response is not a fix.

---

## Round 1 — Source audit (`grep` the repo root, every `.jsx`/`.js`/`.html`)

- [ ] No API keys / tokens / passwords hardcoded as string literals.
      Pattern to run:
      `grep -rniE "(api[_-]?key|secret|password|token|bearer|private[_-]?key)\s*[:=]\s*[\"'][^\"']" *.jsx *.js *.html`
      — then manually clear each hit (session-token *variables*/state and
      `<input type="password">` fields are expected noise, not findings).
- [ ] `window.NEOFEED_CLIENT_ID` in `NeoFeed.html`/`index.html` is the
      **OAuth web client ID** — public by design (Google Identity Services
      needs it in-browser). Confirm it hasn't been swapped for a client
      *secret* by mistake; a client secret must never appear here.
- [ ] `window.NEOFEED_GAS_URL` is a public API endpoint, not a secret —
      auth happens per-request inside `gas-backend.gs` (session token +
      role check), not by hiding the URL. Confirm that assumption still
      holds (see Round 3) before treating the URL itself as fine to expose.
- [ ] No commented-out secrets/URLs/credentials left in `<script>` blocks —
      check history-sensitive spots specifically: `NeoFeed.html`/`index.html`
      around the `NEOFEED_GAS_URL`/`NEOFEED_CLIENT_ID` assignment, and any
      `// old:` / `// TODO` comment near auth code in `app.jsx`.
- [ ] `gas-backend.gs`'s `SPREADSHEET_ID`/`CLIENT_ID` are read from Script
      Properties (`_cfg()`), not literals in the file. If either is ever a
      literal again, stop — that's a regression of the 2026-07-12(4) fix.
- [ ] No `password_hash`/`salt` (Staff sheet columns E–F) referenced,
      logged, or returned anywhere outside `gas-backend.gs`'s own
      `verifyPwd`/`hashPwdV2` functions. `login`'s response must stay
      `{status, name, role, email, token}` only.
- [ ] `MOCK_PATIENTS`/`MOCK_DAILY_LOG` in `data.js` contain only the
      labelled synthetic test fixture (`TT-BW900-A`) — never a real
      patient's data pasted in for debugging.
- [ ] No `console.log`/`console.debug` printing a full request/response
      body, token, or patient record — `console.warn("... failed:", err)`
      on network errors is fine, dumping payloads is not.
- [ ] Role checks that only exist client-side (`role === "admin"` gating a
      nav item or button in `app.jsx`) are cosmetic only — verify the
      matching server-side check exists in `gas-backend.gs` (see Round 3).
      A UI-only gate is not a leak by itself, but it's a red flag that the
      real check may be missing server-side.

## Round 2 — "Build output" audit

- [ ] Confirm there is still no `package.json`/bundler/`dist`/`build`
      folder in the repo. If one has been added since this checklist was
      last run, **stop and re-scope this checklist** — a real build step
      means Round 1's grep needs to also run against the built output
      (minified code can still contain literal strings; minification is
      not redaction).
- [ ] If still no build step: Round 1's results already are the "build
      output" audit — GitHub Pages serves these files as-is. No further
      action needed here beyond re-confirming Round 1 was run against the
      actual deployed files (`NeoFeed.html` *and* `index.html` — GitHub
      Pages serves whichever is at the repo root as `index.html`; both
      drift independently, see `app-walkthrough.md` §7).

## Round 3 — API response audit (`gas-backend.gs` responses vs. what the UI shows)

For each `action` in `gas-backend.gs`'s `doPost`, compare the fields it
returns against what the corresponding frontend view actually reads/renders:

- [ ] `login` → `{status, name, role, email, token}`. No hash/salt/other
      staff rows.
- [ ] `getActivePatients` → `{patients: [...], log: {...}, ts}`. Every
      field in the `patients[]`/`log[sessionId][]` shape (see
      `app-walkthrough.md` §3) should map to something `registry.jsx`,
      `log.jsx`, `fenton.jsx`, or the Calculator's edit-prefill
      (`calcInputJson`) actually uses. If a new column is added to
      `Patient_Registry`/`Daily_Log` and echoed back here, confirm it's
      either used or intentionally omitted from the response — don't let
      "just in case" fields accumulate in the payload.
- [ ] Any new admin-only action (`pseudonymizePatient`,
      `deleteDailyNutrition`, and anything added later) has
      `if (user.role !== "admin") return jsonOut({error: "Forbidden"})`
      as the **first** line after the action dispatch, not just a
      client-side `role === "admin"` UI gate. Test by hand: call the
      action directly with a non-admin token and confirm it's rejected.
- [ ] `doGet` stays limited to the unauthenticated `ping` health check.
      Any authenticated action must be POST-only, token in the JSON body
      — never a token in a URL query string (browser history / server
      access logs).
- [ ] When adding a genuinely new field to a sheet/response, ask: does the
      *browser* need this value to render something, or does only
      server-side logic need it? If only the server needs it, don't add it
      to the JSON response at all — that's the actual fix, not trimming it
      from the UI afterward.

## Architectural note — not a per-deploy checklist item, just don't forget it

The TPN/EN calculator (`calculator.jsx`, ESPGHAN/WHO targets and KCMH
thresholds in `data.js`) computes entirely client-side and submits an
already-computed row; `gas-backend.gs` is CRUD-only, it does not
independently recompute or validate the clinical math server-side (beyond
`_numSafe()` type coercion). This means the clinical calculation logic is,
structurally, 100% visible and client-tamperable — not a "leak" introduced
by a specific change, but a standing property of the current architecture
(no compute-capable backend exists to move it to). If that ever needs to
change (e.g. server-side dose validation before a row is accepted), it's a
deliberate redesign, not a checklist fix — flag it to whoever owns the
clinical-safety sign-off rather than patching it ad hoc.

## Known open items (tracked in `HANDOFF.md`, re-check they're still open)

- Production `SPREADSHEET_ID`/`CLIENT_ID` literals are permanently
  recoverable from pre-2026-07-12(4) git history even though HEAD is
  clean — not fixable by editing current files. Verify the Google Sheet's
  own sharing settings are not "anyone with the link" as a mitigation.
- Password hashing is a 3000-round HMAC-SHA256 stretch (Apps Script has no
  native PBKDF2/bcrypt) — accepted constraint, not a per-deploy check.
