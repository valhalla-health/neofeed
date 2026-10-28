<!--
  Release PR: main → release. Merging it deploys both hosts. Open it with
    gh pr create --base release --head main --template release.md
  REFERENCE.md § Before and after, and rolling back says how to fill it.
  Comments like this one do not show on the PR.
-->

## What ships

PRs merged into `main` since the last release, and what each changes on the ward:

- #<N>: <what the ward sees>

- **`CONSTANTS_VERSION`:** unchanged / `<old>` → `<new>`
- **Backend:** unchanged / ward `@<old>` → `@<new>`

## Before and after

<!--
  For a release that changes a calculation: dev local, the release live now on port 8155 and this
  PR's head on 8156, the same made-up infant and inputs in both. At least three cases for each
  calculation that changes, covering its usual range and each edge the change touches. A difference
  nobody intended stops the merge. For a release that changes no calculation, write that instead.
-->

| Case | Calculation | Inputs | Before (`release`) | After (this PR) | Intended? |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

## Rollback target

The release live before this one, and the backend version it runs:

- **Frontend:** `release-YYYY-MM-DD-prNN` (`<sha>`): `npx wrangler rollback`, or the Worker's Deployments tab
- **Backend:** ward deployment `AKfycbz8…` at `@<n>`: `clasp update-deployment <id> -V <n>`

## Before the merge

- [ ] `harnesses` green on this PR
- [ ] Dev local walked every screen this release changes (what was tried, in a comment)
- [ ] The before-and-after table is filled in, or says no calculation changes

## After the merge

In a comment on this PR, as for every release: `node tools/verify-release.mjs --wait`, the tag
`release-YYYY-MM-DD-prNN` pushed, and the backend version if it moved.
