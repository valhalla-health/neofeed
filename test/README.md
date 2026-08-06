# TPN verification harnesses

Two Node scripts that check the TPN calculator against the **official KCMH
pharmacy worksheet** (กลุ่มงานเภสัชกรรม, ward 9B2/NICU). They exist because the
numbers here become compounding instructions — a wrong divisor is a wrong dose.

## Running

These are the only things in this repo that need `npm`; nothing else does, and
the app itself still has no build step. Dependencies are dev-only and are **not**
committed — install them into a scratch folder and point Node at it:

```bash
npm install --no-save react@18 react-dom@18 @babel/core@7 @babel/preset-react@7 jsdom
```

Then, from the repo root:

```bash
node test/verify-kcmh-constants.cjs && node test/verify-kcmh-factor.cjs
```

`verify-kcmh-factor.cjs` reads `DEAD` from the environment (mL of dead space,
default 20). Run it both ways — overfilled and not:

```bash
DEAD=20 node test/verify-kcmh-factor.cjs && DEAD=0 node test/verify-kcmh-factor.cjs
```

## What each one proves

**`verify-kcmh-constants.cjs`** — loads `data.js` and checks every
`KCMH_STOCK` strength against the divisor the worksheet uses, then reproduces
the worksheet's *own cached results* for its two starter recipes (sheets
`s tpn2` / `s tpn3`): osmolarity 856/896 mOsm/L, calories 46/48 kcal, component
total 59.9/63.4 mL, WFI 40.1/36.6 mL.

**`verify-kcmh-factor.cjs`** — transpiles the real `.jsx` through Babel, mounts
`<Calculator>` in jsdom, drives the actual inputs, and reads the numbers back
out of the rendered order form. It compares them against an **independent
transcription of the worksheet's formula chain** held in the script's `sheet()`
function — two implementations of the same documented formulas must agree.

It also asserts the identities the Factor exists to guarantee:

- delivered dose per kg comes back out **exactly as ordered**, for AA, Na and Ca
- **osmolarity and GIR are unchanged** by overfill (amount and volume scale
  together, so concentration is invariant)
- Soluvit and Peditrace are deliberately **not** scaled — the worksheet's
  compounding cells `G43`/`G45` use actual weight `C6`, while every electrolyte
  row uses the Factor `H9`. The app surfaces this as an info alert rather than
  silently "correcting" the sheet.

## Note on the source workbook

The worksheet these were derived from (`TPN 05082569.xlsx`) contained ~45 named
real-patient sheets alongside the templates. It was never committed to this repo
and is no longer on disk. Every constant and formula used here came from the
anonymous template sheets (`NEW Temphate`, `Starter TPN`, `s tpn2/3`), and the
expected values baked into these scripts are the only thing that survives from
it — no patient-level data is present in either script.
