# NeoFeed

Feeding and TPN calculator for a NICU ward: React `.jsx` sources built into a committed `compiled/`,
served by Cloudflare Workers and GitHub Pages from `release`, with a Google Apps Script backend.
It prints pharmacy orders, so the tests and the release gate are strict on purpose.

Read before you act:

- **Opening or updating a PR** that touches a dose file, the printed order, auth or patient data:
  `REFERENCE.md` § Pre-PR review (Vera). Run her before the PR and paste her report into it.
- **Merging, releasing or deploying** anything: `REFERENCE.md` § Deploying, and rolling back.
  Merging into `main` deploys nothing; `release` deploys. An agent merges into `release`, or runs a
  backend `clasp deploy`, only on Praew's explicit go-ahead.
- **Editing a `.jsx` file**: `REFERENCE.md` § The frontend build (rebuild, commit `compiled/` with it).
- **Writing down agreed behaviour before building it**: `openspec/` (OpenSpec, PR #146). `/opsx:propose`
  starts a change; `explore`, `apply`, `verify`, `sync`, `update` and `archive` follow. Specs live in
  `openspec/specs/`, this repo's rules in `openspec/config.yaml`. Neither host serves `openspec/` or `.agents/`.
- **Clinical rules, GA/PMA, the printed order, PDPA**: the matching section of `REFERENCE.md`.
- **What is live now, and rollback**: `STATUS.md`. **Open work**: `BACKLOG.md`.
- **Product work stays out of this repo.** It is public. Product decisions and bets, ward requests, ward
  feedback (read it before any UI work) and the stakeholder map live in Pp's private notes,
  `~\OneDrive\Desktop\PraewPP\NeoFeed innovation\Product\` (Pp, 2026-10-11). Never add product, meeting or
  stakeholder documents here; `PRD.md` is the one product page this repo keeps.
- **Running the harnesses**: `test/README.md`.
- **Why something is the way it is**: `CHANGELOG.md`, newest first. Add an entry for your session.
