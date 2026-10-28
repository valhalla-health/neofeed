<!--
  NF-05 release PR: pilot → release. Open it when the pilot starts:
    gh pr create --base release --head pilot --template release.md
  Merging it is the promotion to the ward, so it waits for the checklist.
  REFERENCE.md § The pilot ladder says what each line means, and
  tools/release-gate.mjs (the promotion-checklist check) reads the lines
  marked "gate", and fails while any <…> is left unfilled. Comments like
  this one are ignored.
-->

## What ships

PRs merged into `main` since the last release, and what each changes on the ward:

- #<N>: <what the ward sees>

- **`CONSTANTS_VERSION`:** unchanged / `<old>` → `<new>`
- **Backend:** unchanged / ward `@<old>` → `@<new>`

## Side by side

For 48 h the pilot and the ward write to one Sheet and share its Script Properties and cache.
If a box cannot be ticked, this release is not piloted side by side: say why here and follow
REFERENCE.md § The pilot ladder, "When a release cannot be piloted".

- [ ] No column in any tab is renamed, moved, inserted or removed. A new column goes at a tab's end, both versions accept it blank, and the new version still reads right after the ward version rewrites the row and leaves that column's old value in place
- [ ] No stored cell changes what it holds (unit, JSON shape, an allowed value) in a way the ward version would misread
- [ ] A cached value whose shape changed has a new key (`sync2_…`, `sess_…`, `schema1_…`)
- [ ] No Script Property changes its key or its meaning, and no switch (`NURSING_LOG_ENABLED`, `HELP_REQUEST_TO`) is changed while the pilot runs
- [ ] No editor-run migration rewrites rows while the pilot runs
- [ ] The ward's frontend, unchanged, works with the new backend (it runs on it between the backend promotion and this merge)

## Pilot

- **Pilot commit:** `<sha>` <!-- gate: must be this PR's head -->
- **Pilot started:** YYYY-MM-DD HH:MM ICT <!-- gate: 48 h before the merge -->
- **Pilot users:** Pp, <fellow>
- **Pilot backend:** pilot deployment at `@<n>`

- [ ] `node tools/dev-local.mjs` ran on the pilot commit before the pilot started (what was tried: <…>)
- [ ] `node tools/verify-release.mjs --pilot` passed on the pilot commit
- [ ] Both pilot users signed in on pilot-neofeed.valhalla-health.workers.dev

## Rollback target

The release live now, and where each half goes back to if the promotion goes wrong.

- **Frontend:** `release-YYYY-MM-DD-prNN` (`<sha>`) <!-- gate: a release tag and its commit -->
- **Backend:** ward deployment `AKfycbz8…` at `@<n>` <!-- gate: @N -->

## Promotion

Tick after 48 h.

- [ ] 48 h have passed since the pilot started, with no new push to `pilot`
- [ ] The pilot users saved at least <N> orders on the pilot, at least one of each calculation this release changes
- [ ] Each changed figure on those orders was checked against the ward app or a hand calculation before it went to pharmacy, and none was wrong
- [ ] Apps Script ▸ Executions since the pilot started: no failed run of a kind the week before did not have
- [ ] No help request or ward report traced to the pilot
- [ ] Usage_Log (NF-02): no ward's count over the pilot days fell below the same days the week before (or write "Usage_Log not live yet")
- [ ] `node tools/verify-release.mjs --pilot` still passes: the pilot host served the pilot commit to the end
- [ ] Backend unchanged, or promoted first: `sheetHealthReport()` all ok, then `clasp update-deployment` moved the ward deployment to the pilot's version, then this merge

## After the merge

In a comment on this PR, as for every release: `node tools/verify-release.mjs --wait`, the tag
`release-YYYY-MM-DD-prNN`, the backend version on both deployments, and what the ward reports in
the week after (the Usage_Log counts and any failed run). A falling count or a wrong figure means
rollback first, questions after.
