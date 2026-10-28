# NeoFeed

Feeding and TPN calculator for a NICU ward: React `.jsx` sources built into a committed `compiled/`,
served by Cloudflare Workers and GitHub Pages from `release`, with a Google Apps Script backend.
It prints pharmacy orders, so the tests and the release gate are strict on purpose.

Read before you act:

- **Opening or updating a PR** that touches a dose file, the printed order, auth or patient data:
  `REFERENCE.md` § Pre-PR review (Vera). Run her before the PR and paste her report into it.
- **Touching calculation code** (a limit, target band, unit, conversion or rounding in `calculator.jsx`
  or `data.js`, or a figure on the printed order): load the `neofeed-clinical-rules` skill first. It is
  Pp's list of every rule as coded, with its ID, source and cases; change a rule's block in the same
  commit as its code, and `test/verify-clinical-rules.cjs` runs the cases (NF-04).
- **Changing a calculation**: keep `test/verify-calc-sum.cjs` passing. A PR that adds or changes a
  figure adds it to that harness's on-screen check in the same PR (NF-17).
- **Merging, releasing or deploying** anything: `REFERENCE.md` § Deploying, and rolling back.
  Merging into `main` deploys nothing; `release` deploys. An agent merges into `release`, or runs a
  backend `clasp deploy`, only on Praew's explicit go-ahead. A release PR starts from
  `.github/PULL_REQUEST_TEMPLATE/release.md`: a release that changes a calculation records its
  before-and-after numbers from dev local there, and every one names its rollback target (NF-05).
- **Editing a `.jsx` file**: `REFERENCE.md` § The frontend build (rebuild, commit `compiled/` with it).
- **Writing down agreed behaviour before building it**: `openspec/` (OpenSpec, PR #146). `/opsx:propose`
  starts a change; `explore`, `apply`, `verify`, `sync`, `update` and `archive` follow. Specs live in
  `openspec/specs/`, this repo's rules in `openspec/config.yaml`. Neither host serves `openspec/` or `.agents/`.
- **Clinical rules, GA/PMA, the printed order, PDPA**: the matching section of `REFERENCE.md`.
- **What is live now, and rollback**: `STATUS.md`. **Open work**: `BACKLOG.md`.
- **Product work stays out of this repo.** It is public. Product decisions and bets, ward requests, ward
  feedback (read it before any UI work) and the stakeholder map live in Pp's private notes,
  `~\OneDrive\Desktop\PraewPP\NeoFeed\Product\` (Pp, 2026-10-11). Never add product, meeting or
  stakeholder documents here; `PRD.md` is the one product page this repo keeps.
- **Running the harnesses**: `test/README.md`.
- **A correction Pp makes a second time** becomes a rule in `tools/ci_bans.js` with a failing and a
  passing case in `test/ci-bans-fixtures.json` (NF-19), not a third review comment. CI runs it.
- **Why something is the way it is**: `CHANGELOG.md`, newest first. Add an entry for your session.
