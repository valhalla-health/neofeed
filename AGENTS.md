# NeoFeed

Feeding and TPN calculator for a NICU ward: React `.jsx` sources built into a committed `compiled/`,
served by Cloudflare Workers and GitHub Pages from `release`, with a Google Apps Script backend.
It prints pharmacy orders, so the tests and the release gate are strict on purpose.

Read before you act:

- **Merging, releasing or deploying** anything: `REFERENCE.md` § Deploying, and rolling back.
  Merging into `main` deploys nothing; `release` deploys. An agent merges into `release`, or runs a
  backend `clasp deploy`, only on Praew's explicit go-ahead.
- **Editing a `.jsx` file**: `REFERENCE.md` § The frontend build (rebuild, commit `compiled/` with it).
- **Clinical rules, GA/PMA, the printed order, PDPA**: the matching section of `REFERENCE.md`.
- **What is live now, and rollback**: `STATUS.md`. **Open work**: `BACKLOG.md`.
- **Running the harnesses**: `test/README.md`.
- **Why something is the way it is**: `CHANGELOG.md`, newest first. Add an entry for your session.
