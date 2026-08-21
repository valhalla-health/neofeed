# NeoFeed — Backlog

Everything known-but-not-done, in one place. **Review weekly.** When an item ships,
delete it here and record it in `CHANGELOG.md`.

Gathered 2026-08-21 from the old `HANDOFF.md` banner, its "Known caveats" and PDPA
"Open items" sections, and `CLAUDE.md`'s "Known open items". **The ordering below is a
proposal, not a decision** — it ranks clinical safety first, then compliance, then
product. Re-order it to taste; that act *is* the product-management job.

---

## 1 · Clinical safety

- [ ] **Confirm Na acetate (3 mEq/mL) and KCl (2 mEq/mL) stock concentrations against the
      shelf.** Both were *inferred* from the KCMH worksheet's divisors, not read off an
      explicit strength label. **These four corrected concentrations change the mL printed
      on every order form** — this is the highest-stakes open item in the repo.
- [ ] **Exercise `@46` with a real login and a real Delete.** Its auth changes are covered
      only by stub harnesses, and their provenance is unknown (see `CHANGELOG.md`,
      session 2026-08-17 (3)).
- [ ] **`FENTON_LENGTH` / `FENTON_HC` are unverified against any source** and sit at 4-week
      steps. `FENTON_WEIGHT` was verified against Fenton 2025 on 2026-08-10; the other two
      were not.
- [ ] Do **not** widen the Fenton axis past 42 wk to "fix" the hidden-measurement banner.
      The GA 44–50 rows in `data.js` are unverified. Source real post-term data first.

## 2 · PDPA / compliance

- [ ] **No retention or auto-purge policy after discharge** — records persist indefinitely
      in the Sheet today.
- [ ] **No self-service access/rectification path** for data-subject requests; handled
      manually by an admin editing the registry. Worth a real endpoint if volume grows.
- [ ] **Cross-border transfer (Sec 28) never evaluated** — data lives in Google
      Sheets/Apps Script. Verify Google Workspace's DPA/SCC coverage is adequate for the
      org's data-location requirements.
- [ ] Residual risk, structural: `sessionId` = `initials+BW+twinSuffix` is a **pseudonym,
      not anonymous**. Erasure cannot scrub that pattern from an already-issued sessionId
      without breaking every `Daily_Log` join. Documented, not fixed.

## 3 · Product — no metrics exist today

- [ ] **Nobody knows how many staff use NeoFeed.** The data is already being collected:
      `Audit_Log (A–D): ts | action | sessionId | actorEmail`, and `logAudit("readRegistry")`
      fires on every `getActivePatients`. What is missing is a *read* of it, not
      instrumentation. Start with weekly active users.
      ⚠️ `Audit_Log` exists for **PDPA Sec 39 accountability**, not analytics, and it holds
      staff email. Aggregate counts only — a per-staff ranking turns product analytics into
      personnel monitoring, which needs a different legal basis and a different conversation
      with the ward.
- [ ] No PRD exists. `CHANGELOG.md` is a change log, not a product definition.

## 4 · Carried over, unverified

Copied from the old `HANDOFF.md` "Known caveats", written around session 8 (2026-05-25).
**The line numbers are certainly stale and the claims were not re-checked during the
2026-08-21 split** — verify before acting on any of them.

- [ ] `enVolPerKg` is logged on new submissions, but legacy entries from before session 8
      lack the field and fall back to PN targets.
- [ ] GAS `Unauthorized` shows an error toast rather than redirecting to login
      (old note: `app.jsx` line ~145).
- [ ] Mobile Fenton chart keeps pan/zoom; the SVG width-760 layout survives via
      `width: 100%; height: auto`.
