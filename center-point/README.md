# Center Point — isolated synthetic integration

The CP entry now routes the actual calculator's save into a fixed, versioned TPN
snapshot. It includes source units/stock strengths, dosing context, PN/EN, separate
lipid syringe, oral supplements, source versions and explicit effective period.
Clinicians review the immutable saved revision before publication or local print.
Edits require review again; corrections and withdrawal are revision checked.

Build with `npm ci --prefix center-point` and `npm run build --prefix center-point`.
Mount this directory using CP's `neofeedDirectory`, then launch the calculator
from `/neofeed/`. The authenticated same-origin CP session is required. A public
Cloudflare branch preview alone cannot exercise this workflow.

The optional `centerPoint` prop in `calculator.jsx` supplies the save/review bridge
and suppresses legacy persistence/printing in this entry. The default legacy path,
clinical formulas and GAS remain unchanged. The CP calculator stores no clinical
values in browser storage and never falls back to legacy save after a failure.
The separate linking client retains only UUID retry/link metadata.

`tpn-snapshot.mjs` captures values at the source. CP does not run this builder;
it renders the saved display packet with its matching `tpn-document.mjs` schema.
Names/HNs are joined only by the local CP desktop, never included in the packet.
The full paper remains synthetic pending clinical and physical-printer review.

Validation: five client tests (`node --test test/center-point.test.mjs`), original
KCMH factor harness all-pass, and CP HTTP browser checks at 1280/390px comparing
every saved TPN slot with the local print preview. CP's separate MyBM delivery
adapter transfers only authorized weight/coverage, never full TPN.

Remaining: clinical/template approval, workstation installation/queue/output
confirmation, service scopes, persistence/hosting, cutover and synthetic rehearsal.
This draft branch does not authorize a production clinical migration or main merge.
See [CP status](https://github.com/valhalla-health/NICU-Center-Point/blob/codex/new-admission-foundation/docs/STATUS.md).
