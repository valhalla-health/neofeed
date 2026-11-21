# Paediatric wards: new wards on the dashboard, and a rule set for children past the newborn period

## Why

Pp wants NeoFeed in the other children's wards at KCMH (the สก. building wards), each as a new ward on
the ward page beside NICU and SCN (Pp, 2026-11-17 and 2026-11-21). Today the app cannot take them
safely: wards and beds are written by hand in five files, every doctor, nurse and admin receives every
infant on the unit, and every limit and target band is a newborn rule keyed to DOL. A child past
DOL 400 or 8 kg cannot be ordered for at all, and a younger one would silently get preterm rules.

## What Changes

- **One ward table** that the frontend, the backend and the TPN room page all read, replacing the
  bed and ward patterns repeated in `data.js`, `registry.jsx`, `app.jsx`, `gas-backend.gs` and
  `tpn-room-core.js`. A new ward is one row: key, label, beds, sticker label and dead-space default.
- **The ward page shows every ward in the table.** NICU, SCN and ทดสอบระบบ keep their tiles, order
  and wording. "TPN ทั้งหอ", Print order, the admin census and the TPN room's ward groups take their
  ward list from the same table.
- **Ward-scoped access.** `Staff` gets a wards column, and an admin action sets it; a doctor or nurse
  receives, and may write to, only the patients of their wards. Admin and the TPN room keep the whole
  unit. **BREAKING** for any account left without a ward: it sees no patient until an admin sets one
  (migration fills existing accounts with NICU and SCN). A patient whose bed is in no ward becomes
  admin-only.
- **A rule set per age group, chosen by age at admission, never by ward, and fixed for the
  admission.** The newborn rule set is the one coded today and does not change. A paediatric rule
  set carries its own stops, critical limits, target bands, input ranges, products and constants
  version. An order is refused when the child's age has no signed rule set.
- **Amino-acid product follows age, not ward** (`OLDER_CHILD_WARDS` goes): Aminoplasmal 15 % is
  offered only at or above its label's age line. The dead-space default stays with the ward.
- **The paediatric guards themselves**: each value enters the code only with a source, a `CR-P-` rule
  block, a harness case and the rule owner's and Pp's sign-off. `guideline-values.md` in this folder
  is the sourced starting table; it proposes nothing.
- **Rules for a clinical group** (long-term PN, intestinal failure or short bowel, PN-associated
  liver disease), switched by a PN context the prescriber sets on the order. Which groups and which
  rules is Pp's and the rule owner's decision, from `guideline-values-if.md`. Newborns with
  intestinal failure or cholestasis get the same kind of tighter guards, in a newborn PR of their own.
- The printed order, the sticker and the TPN room page name the ward and print age the paediatric
  way (years and months) for a child on the paediatric rule set.

## Capabilities

### New Capabilities

- `ward-directory`: the single list of wards and beds, and every screen that lists wards from it.
- `ward-scoped-access`: which staff receive and may write which ward's patients.
- `clinical-rule-sets`: how a patient's rule set is chosen by age, the guarantee that the newborn set
  is untouched, per-set constants versions, and refusal when no set applies.
- `paediatric-pn-guards`: the stops, critical limits, bands, input ranges and product age lines of the
  paediatric rule set, and the evidence each needs before it ships.

### Modified Capabilities

None. `openspec/specs/` holds no archived spec yet.

## Impact

- `data.js`, `calculator.jsx`, `registry.jsx`, `app.jsx`, `log.jsx`, `tpn-room-core.js`, `gas-backend.gs`,
  both HTML shells if the ward table is its own file, `compiled/`, and Center Point's hand-off (it sends
  no age group today).
- Sheets: a wards column in `Staff`; no patient column is added (ward stays derived from the bed).
- `.claude/skills/neofeed-clinical-rules/SKILL.md`, `docs/CLINICAL_CONSTANTS.md`, `REFERENCE.md`,
  `PRD.md` § 5 (one unit, one Sheet), `test/` (a harness per rule set, and newborn no-move checks).
- Ships as several PRs (design § Migration). Groups 1–3 move no newborn figure and must prove it;
  groups 4–6 wait for the gates in `tasks.md` § 0. Backend parts go live only by `clasp` on Pp's go-ahead.
- Not in scope: a second hospital, a separate deployment per ward, changing any NICU or SCN card
  for an order with no PN context,
  and a retention policy. Feeds for older children are in scope as a gate: the paediatric set lists
  which feeds it holds, from which source, before a ward opens.
