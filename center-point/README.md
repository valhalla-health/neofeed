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
and suppresses legacy persistence/printing in this entry: no draft autosave or draft
read, no Copy Order, no Intake / Output card (none of it goes to CP). The default
legacy path, clinical formulas and GAS remain unchanged. The CP calculator stores no
clinical values in browser storage (`test/verify-center-point-entry.cjs` §1) and never
falls back to legacy save after a failure. The separate linking client retains only
UUID retry/link metadata.

A record whose latest draft carries a TPN order is reviewed, published and printed
only on the calculator page. The `/neofeed/` drafts view shows it read-only, and CP's
server refuses a save without a TPN over it (`tpn_draft_superseded`).

The review and CP's print list changes since the previous confirmed version of the
same record. CP sends that version as `previous`, and `tpnChanges` compares the ordered
fields.

`tpn-snapshot.mjs` captures values at the source. CP does not run this builder;
it renders the saved display packet with its matching `tpn-document.mjs` schema.
The packet is `neofeed-tpn-v2` / `cp-tpn-2`: v1 plus the Mg mg/kg and TPN-only
kcal/kg slots and `criticalOverride`, the reason given at NeoFeed's critical-value
stop, which CP prints. CP's `web/tpn-document.mjs` must stay identical apart from
its own helpers; CP's `test/tpn-document-parity.test.mjs` checks that.
Names/HNs are joined only by the local CP desktop, never included in the packet.
The full paper remains synthetic pending clinical and physical-printer review.

Validation: five client tests (`node --test test/center-point.test.mjs`),
`verify-center-point-entry.cjs`, `verify-center-point-print-parity.cjs` (every dose
figure on NeoFeed's pharmacy form has a CP slot), the KCMH factor harness, and CP's
HTTP browser checks at 1280/390px comparing every saved TPN slot with the local
print preview. CP's separate MyBM delivery
adapter transfers only authorized weight/coverage, never full TPN.

Remaining: clinical/template approval, workstation installation/queue/output
confirmation, service scopes, persistence/hosting, cutover and synthetic rehearsal.
This draft branch does not authorize a production clinical migration or main merge.
See [CP status](https://github.com/valhalla-health/NICU-Center-Point/blob/codex/new-admission-foundation/docs/STATUS.md).
