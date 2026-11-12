---
name: neofeed-clinical-rules
description: Use before changing, reviewing or explaining a NeoFeed calculation (a limit, target band, unit, conversion or rounding in calculator.jsx or data.js, or a figure on the printed TPN order). Every rule the calculator enforces as coded, where the code enforces it, its clinical source, and the synthetic orders the test suite runs.
---

# NeoFeed clinical rules

Pp owns this file. It lists every limit, unit and rounding rule the calculator enforces, as the code
does it on `main` after PR #171 (`CONSTANTS_VERSION` 2026-10-27.2), with Pp's answers of 2026-10-28 to
Q1–Q3, and the nutrition-meeting change of 2026-10-28 (`CONSTANTS_VERSION` 2026-10-28.1). Each rule has a stable ID (`CR-…`)
that other work cites: NF-12 shows the breast-milk assumption from `CR-U-BREASTMILK`, NF-28 checks the
reference tables against these values (`test/verify-reference-tabs.cjs`): a cell a rule codes must hold
that value, and every value coded here needs its unit in `tools/reference-tabs.json`.

The clinical numbers are Pp's. An agent documents and tests what the code does; where the code and its
source disagree, or no source exists, the rule names a question under [Questions for Pp](#questions-for-pp)
and the code stays as it is until she answers. How sources are cited, and their PMIDs:
[Sources](#sources).

## Before you change calculation code

1. Find every rule your change touches: search this file for the constant, function or alert title.
2. Change the rule's block in the same commit as the code: its `coded` value, its `where` anchor, its
   cases. A change that moves a printed figure also needs the change protocol in
   `docs/CLINICAL_CONSTANTS.md` (source citation, register row, `CONSTANTS_VERSION` bump, CHANGELOG).
   A new `stop` rule's ID also goes into `submitStops` in `calculator.jsx`, the list each save sends
   and `gas-backend.gs` checks; the harness fails until the list and the stop rules match.
3. Run `node test/verify-clinical-rules.cjs`. Red means the code and this file disagree: find which one is
   wrong. A case is edited to match the code only when Pp has agreed the new behaviour.
4. Step 3's "ที่มาของตัวเลข" panels (NF-12) show the GIR, osmolarity, energy and protein formulas as text
   and read every limit from `data.js`. A changed factor in `CR-U-GIR`, `CR-U-OSM` or `CR-U-ENERGY` needs
   the panel text changed too: `test/verify-show-working-1028.cjs` fails until the terms add up again.

## Adding a case

Copy a case line inside the rule's ```` ```rule ```` block, change the numbers and the expectation, and
run the harness. `node test/verify-clinical-rules.cjs --show CR-GIR-MAX` prints what each case of one
rule produced (its alerts and Submit state), which is the quickest way to find the boundary.

- **The first line** of a block is the rule: `kind`, `coded` (each key a path in `data.js`, each value
  what it must be) and `where` (`file`, `line`, `has`: the code that enforces it must contain `has`).
  When lines move, `--fix-lines` rewrites the numbers.
- **A case** is either `fn` (a `data.js` function and its `args`, with the `want`ed result) or an order
  typed into the real Calculator: `infant` `{g, bw, dol}` (bw defaults to g, DOL to 10, the bed is
  NICU, so dead space starts at 30 mL), `route` (`"Central"`, `"Peripheral"`, or left out for none),
  `fluid` (target, default 150 mL/kg/d), `feed` (an `EN_DB` key; breast milk if left out), `order`
  (on-screen field label → value), `tick` (checkbox label → true/false), `then` (fields typed after
  the ticks, the same labels as `order`), `hours` (lipid infused over),
  and for a second feed `feed2` (its `EN_DB` key) and `order2` (its fields, the same labels as feed 1's).
- **`expect`**: `alert` (a title, with `level` crit, warn or info), `no_alert`, `submit` (`blocked`,
  `asks_reason` or `no_reason`), `shows` / `hides` (text on the Calculator), `prints` (text on the
  order form after Submit).
- **`side`**: every limit has at least one case `inside` and one `outside` it, as close to the edge as the
  inputs allow.

Synthetic infants only: this repo is public.

## What each kind does

| kind | on the Calculator | Submit and Print |
|---|---|---|
| `stop` | red line in the save panel | refused; a draft may still be kept (weight out of range: no draft either). The backend refuses a submitted row that carries it (`calcInput.stops`) |
| `critical` | red alert | Submit asks for a clinical reason; it prints on the order. Print waits for a tick on it |
| `red` | red alert | no reason asked. Print waits for a tick on it |
| `caution` | amber (or blue info) alert | unaffected |
| `cap` | a ceiling that changes the dose itself | unaffected |
| `target` | the amber band a tile is graded against | unaffected |
| `unit`, `round` | conventions every figure follows | — |

A critical alert is one `alerts.push({ level: "crit" … })`; Submit collects every one that is not
`noReason` and asks once (`calculator.jsx`, `const critical = …`). The Print button and the ward's Print list
wait until every red alert, `noReason` ones too, is ticked on screen (`printReady`, 2026-11-12); each prints
in the red box beside the doctor's signature, ☑ or ☐ (a browser Ctrl+P), and is asked again after every save. Each limit is graded on the figure the
order prints wherever the code says so; the rule says which.

---

## Stops

### CR-WT-RANGE · TPN calc. weight 200–8,000 g

Outside 200–8,000 g the order cannot be saved, draft included, and the backend refuses the row too
(`gas-backend.gs` `_checkRange`). Inclusive at both ends.
Source: Pp, 2026-10-08, after an outside review saved a 900 g infant dosed at 8,500 g; the range is the
backend's existing bound on a `Daily_Log` weight. Not a clinical threshold.

```rule
{"rule": "CR-WT-RANGE", "kind": "stop", "coded": {"TPN_WT_RANGE_G": [200, 8000]}, "where": [{"file": "data.js", "line": 967, "has": "const TPN_WT_RANGE_G = [200, 8000];"}, {"file": "calculator.jsx", "line": 2309, "has": "const tpnWtOutOfRange = wtG > 0 && (wtG < tpnWtLo || wtG > tpnWtHi);"}, {"file": "gas-backend.gs", "line": 2340, "has": "_checkRange(ci.tpnWtG, 200, 8000, \"TPN calc. weight (g)\");"}]}
{"case": "8,000 g saves", "side": "inside", "infant": {"g": 8000}, "order": {"Volume(mL/feed)": 80, "Frequency": 8}, "tick": {"No TPN": true}, "expect": {"no_alert": "TPN calc. weight out of range", "submit": "no_reason"}}
{"case": "8,001 g is refused", "side": "outside", "infant": {"g": 8001}, "expect": {"alert": "TPN calc. weight out of range", "level": "crit", "submit": "blocked"}}
{"case": "200 g saves", "side": "inside", "infant": {"g": 200}, "expect": {"no_alert": "TPN calc. weight out of range"}}
{"case": "199 g is refused", "side": "outside", "infant": {"g": 199}, "expect": {"alert": "TPN calc. weight out of range", "submit": "blocked"}}
```

### CR-ROUTE-REQUIRED · a bag needs a route

A day with a bag (volume or any bag ingredient) cannot be submitted until Peripheral or Central is
pressed; a draft can. Until then the bag is graded as peripheral, the stricter route (`CR-OSM-PERIPH`,
`CR-K-BAG-MAX`). A feeds-only day needs no route; it needs "No TPN" ticked instead (`CR-NO-TPN-TICK`).
Source: Pp, 2026-10-21. Not a clinical threshold.

```rule
{"rule": "CR-ROUTE-REQUIRED", "kind": "stop", "where": [{"file": "calculator.jsx", "line": 2294, "has": "const routeMissing = route == null && !noTpnOn && (bagOrdered || !!centerPoint);"}]}
{"case": "a bag with no route is refused", "side": "outside", "infant": {"g": 1000}, "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3}, "expect": {"submit": "blocked", "shows": "ยังไม่ได้เลือก route ของ TPN"}}
{"case": "feeds only, ticked No TPN, need no route", "side": "inside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 20, "Frequency": 8}, "tick": {"No TPN": true}, "expect": {"submit": "no_reason"}}
```

### CR-BAG-NO-VOLUME · bag ingredients with no bag volume

TPN volume 0 with any amino acid, dextrose or additive left in: refused, because every total would count
the ingredients while the form asks pharmacy for a bag of "—" mL. Happens when TPN is stopped on an order
prefilled from yesterday.
Source: calculator review 2026-09-17 (UP-C3). Not a clinical threshold.

```rule
{"rule": "CR-BAG-NO-VOLUME", "kind": "stop", "where": [{"file": "calculator.jsx", "line": 2207, "has": "const zeroVolumeBag = bagIngredientsWithoutVolume.length > 0;"}]}
{"case": "amino acid with TPN volume 0 is refused", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Amino acid": 3}, "expect": {"submit": "blocked", "shows": "ปริมาตร TPN = 0 แต่ยังมีส่วนประกอบในถุง: Amino acid — ลบส่วนประกอบ หรือใส่ปริมาตร หรือถ้าวันนี้ไม่มี TPN ติ๊ก \"No TPN\" ที่ Step 3"}}
{"case": "an empty bag of 0 mL saves (No TPN, feeds 10 mL × 8)", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/feed)": 10, "Frequency": 8}, "tick": {"No TPN": true}, "expect": {"submit": "no_reason"}}
```

### CR-K-BAG-MAX · K⁺ in the bag, hard maximum

K⁺ mEq/L of the prepared bag above the route's maximum cannot be ordered: peripheral 60, central 200.
No route yet counts as peripheral. The concentration is `bag K mEq ÷ prepared L`; the dead space cancels,
so it equals K mEq/kg/d × kg × 1,000 ÷ TPN mL. Graded with float noise stripped (`toPrecision(12)`), so a
bag that is 60 on paper is not refused as 60.00000000000001 (1 kg, 50 mL, KCl 3 is that case).
Source: KCMH TPN team meeting 2026-09-28 and Pp ("max 200 ทั้งสองสาย", then peripheral 60 on
2026-10-08). Fanaroff ch Therapeutic Agents p. 8 (KCl): "typical maximum concentrations are 40 mEq/L for
peripheral and 120 mEq/L for central"; ANMF 2020 gives peripheral ≤ 40, central ≤ 80; IWK Health NICU
peripheral 60, central 120. All are for KCl or maintenance fluid, none for a PN bag. **Central 200 is
above every source found**: Q1, which Pp answered on 2026-10-28: keep as is for now.

```rule
{"rule": "CR-K-BAG-MAX", "kind": "stop", "coded": {"K_BAG_MEQ_PER_L.peripheral.hardMax": 60, "K_BAG_MEQ_PER_L.central.hardMax": 200}, "where": [{"file": "data.js", "line": 948, "has": "peripheral: { warn: 40, red: 60,  hardMax: 60 },"}, {"file": "data.js", "line": 949, "has": "central:    { warn: 60, red: 120, hardMax: 200 },"}, {"file": "calculator.jsx", "line": 1908, "has": "const kMeqPerL  = preparedVol > 0 ? bag.k_mEq / (preparedVol / 1000) : 0;"}, {"file": "calculator.jsx", "line": 2122, "has": "const kGrade = (v) => isFinite(v) ? Number(v.toPrecision(12)) : v;"}, {"file": "calculator.jsx", "line": 2212, "has": "const kOverMax = kLim.hardMax != null && kMeqPerLGraded > kLim.hardMax;"}]}
{"case": "peripheral 60 mEq/L (1 kg, 50 mL, KCl 3) is the maximum, not over it", "side": "inside", "infant": {"g": 1000}, "route": "Peripheral", "order": {"Volume(mL/day)": 50, "Dextrose final": 5, "Amino acid": 1, "KCl": 3}, "expect": {"no_alert": "K⁺ above the maximum", "alert": "K⁺ concentration high", "level": "warn"}}
{"case": "peripheral 61 mEq/L is refused", "side": "outside", "infant": {"g": 1000}, "route": "Peripheral", "order": {"Volume(mL/day)": 50, "Dextrose final": 5, "Amino acid": 1, "KCl": 3.05}, "expect": {"alert": "K⁺ above the maximum", "level": "crit", "submit": "blocked"}}
{"case": "central 200 mEq/L (1 kg, 20 mL, KCl 4) is critical, not refused", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 20, "Dextrose final": 5, "Amino acid": 1, "KCl": 4}, "expect": {"no_alert": "K⁺ above the maximum", "alert": "K⁺ concentration too high", "level": "crit"}}
{"case": "central 201 mEq/L is refused", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 20, "Dextrose final": 5, "Amino acid": 1, "KCl": 4.02}, "expect": {"alert": "K⁺ above the maximum", "submit": "blocked"}}
```

### CR-BOTTLE-MAX · the 1,250 mL bottle

A prepared volume (delivered + dead space) above 1,250 mL cannot be ordered; 1,250 itself can. Graded
on the prepared volume as printed (1 decimal), so 1,250.04 mL passes. On screen it is one stop with
`CR-BAG-OVERFULL`, "Bag cannot be made (ใส่ถุงไม่ได้)", which names whichever limit holds, each with its own
fix, or, when both hold, both steps (a lower dose, and the bag down to 1,250 mL); the two rules and their IDs are unchanged.
Source: KCMH TPN team, 2026-10-25 (the TPN room's largest bottle); Pp, 2026-10-27: "ห้ามสั่ง". One stop on
screen: Pp, 2026-11-01: "ใส่ถุงไม่ได้ คือรวม Bag over the 1,250 mL bottle, WFI negative"; she chose the title.

```rule
{"rule": "CR-BOTTLE-MAX", "kind": "stop", "coded": {"TPN_BOTTLE_MAX_ML": 1250}, "where": [{"file": "data.js", "line": 925, "has": "const TPN_BOTTLE_MAX_ML = 1250;"}, {"file": "calculator.jsx", "line": 2218, "has": "const bagOverBottle = calc.totalTPN_mL > 0 && Number(D.displayNum(calc.preparedVol, 1)) > D.TPN_BOTTLE_MAX_ML;"}]}
{"case": "1,220.04 + 30 = 1,250.04 mL prints 1,250 and saves", "side": "inside", "infant": {"g": 7500}, "route": "Central", "fluid": 160, "order": {"Volume(mL/day)": 1220.04, "Dextrose final": 10, "Amino acid": 2.5}, "expect": {"no_alert": "Bag cannot be made (ใส่ถุงไม่ได้)", "submit": "no_reason"}}
{"case": "1,221 + 30 = 1,251 mL is refused", "side": "outside", "infant": {"g": 7500}, "route": "Central", "fluid": 160, "order": {"Volume(mL/day)": 1221, "Dextrose final": 10, "Amino acid": 2.5}, "expect": {"alert": "Bag cannot be made (ใส่ถุงไม่ได้)", "level": "crit", "submit": "blocked", "shows": "ใส่ถุงไม่ได้: ถุง TPN ต้องเตรียม 1251 mL เกินขวดใหญ่สุด 1250 mL ของห้อง TPN — ลดปริมาตรหรือ dead space — บันทึก/พิมพ์ไม่ได้", "hides": "ส่วนประกอบรวม"}}
{"case": "1,251 mL of D45 with amino acid 3.5: over the bottle and over-full, one stop naming both, and both steps", "side": "outside", "infant": {"g": 7500}, "route": "Central", "fluid": 160, "order": {"Volume(mL/day)": 1221, "Dextrose final": 45, "Amino acid": 3.5}, "expect": {"alert": "Bag cannot be made (ใส่ถุงไม่ได้)", "level": "crit", "submit": "blocked", "shows": ["ใส่ถุงไม่ได้: ถุง TPN ต้องเตรียม 1251 mL เกินขวดใหญ่สุด 1250 mL และส่วนประกอบรวม", "เกินถุงไป", "mL — ลดขนาดยา และลด dead space หรือปริมาตรให้ไม่เกิน 1250 mL — บันทึก/พิมพ์ไม่ได้", "Lower a dose, and lower the dead space or the volume until the bag is 1250 mL or less. This order cannot be submitted."], "hides": ["เพิ่มปริมาตร TPN", "Raise the volume"]}}
```

### CR-STOCK-ZERO · an ordered stock that rounds to 0 mL

When a stock the order holds rounds to 0 mL at the 0.1 mL the TPN room measures (under 0.05 mL,
`CR-R-STOCK-ML`), the order cannot be submitted; a draft can. Soluvit, Peditrace and the lipid syringe
cannot get there (1 mL/kg at 200 g is 0.2 mL).
Source: Pp, 2026-10-27 (PR #171): the back sheet must never ask for 0 mL of a drug the order holds.

```rule
{"rule": "CR-STOCK-ZERO", "kind": "stop", "where": [{"file": "calculator.jsx", "line": 2262, "has": "const stockAtZeroMl = stocksAtZeroMl.length > 0;"}]}
{"case": "700 g, no dead space: ZnSO₄ 0.0715 mg/kg is 0.05 mL, prints 0.1 and saves", "side": "inside", "infant": {"g": 700}, "route": "Central", "order": {"Volume(mL/day)": 100, "ปริมาตรคาสาย (dead space)": 0, "Dextrose final": 10, "Amino acid": 3, "ZnSO₄": 0.0715}, "expect": {"no_alert": "Stock rounds to 0 mL", "submit": "no_reason", "prints": "ZnSO₄ (Zn 1 mg/mL)0.05 mg Zn0.1"}}
{"case": "ZnSO₄ 0.071 mg/kg is 0.0497 mL: refused", "side": "outside", "infant": {"g": 700}, "route": "Central", "order": {"Volume(mL/day)": 100, "ปริมาตรคาสาย (dead space)": 0, "Dextrose final": 10, "Amino acid": 3, "ZnSO₄": 0.071}, "expect": {"alert": "Stock rounds to 0 mL", "level": "crit", "submit": "blocked", "shows": "ZnSO₄ ปัดแล้วเหลือ 0 mL"}}
```

### CR-BAG-OVERFULL · components larger than the bag

When the stock volumes add up to more than the prepared volume as printed (WFI below 0), the order
cannot be submitted or printed, on Center Point too, and no reason clears it; a draft can be
kept. A row saved before 2026-10-28 with a reason for it is held the same way. Center Point refuses to
save, confirm or print such a packet, a revision confirmed before then included (`tpnBagOverfull`). WFI is graded as printed
(`CR-R-BAG-SUM`), so a bag its components fill exactly (WFI 0) can be ordered. On screen it is one stop
with `CR-BOTTLE-MAX`, "Bag cannot be made (ใส่ถุงไม่ได้)" (Pp, 2026-11-01); its alert was titled "Bag cannot be
compounded" until then, the title a reason saved before 2026-10-28 names, and such a row is held all the
same.
Source: Pp, 2026-10-28, answering Q2: "ถ้า WFI ติดลบ ให้ ไม่สามารถสั่งได้". The WFI q.s. is the KCMH
worksheet's I53 (prepared − Σ components). Until 2026-10-28 it was a critical alert that a reason cleared,
so pharmacy could receive a form with a negative WFI.

```rule
{"rule": "CR-BAG-OVERFULL", "kind": "stop", "where": [{"file": "calculator.jsx", "line": 2272, "has": "const bagOverfull = bagOrdered && calc.wfiVol < 0;"}, {"file": "calculator.jsx", "line": 2279, "has": "const bagCannotBeMade = bagOverBottle || bagOverfull;"}, {"file": "center-point/tpn-document.mjs", "line": 131, "has": "export function tpnBagOverfull(value) { return Number(value.values.wfi) < 0; }"}]}
{"case": "2 kg, 130.45 mL: 130.5 mL of stock fills the bag (WFI 0) and saves", "side": "inside", "infant": {"g": 2000}, "route": "Central", "fluid": 120, "order": {"Volume(mL/day)": 130.45, "ปริมาตรคาสาย (dead space)": 0, "Dextrose final": 20, "Amino acid": 3.5, "20% NaCl": 2, "KCl": 1, "Glycophos": 1.3, "Heparin": 0.6}, "expect": {"no_alert": "Bag cannot be made (ใส่ถุงไม่ได้)", "submit": "no_reason"}}
{"case": "KCl 1.1 adds 0.1 mL: WFI −0.1 is refused", "side": "outside", "infant": {"g": 2000}, "route": "Central", "fluid": 120, "order": {"Volume(mL/day)": 130.45, "ปริมาตรคาสาย (dead space)": 0, "Dextrose final": 20, "Amino acid": 3.5, "20% NaCl": 2, "KCl": 1.1, "Glycophos": 1.3, "Heparin": 0.6}, "expect": {"alert": "Bag cannot be made (ใส่ถุงไม่ได้)", "level": "crit", "submit": "blocked", "shows": "ใส่ถุงไม่ได้: ส่วนประกอบรวม 130.6 mL เกินถุง 130.5 mL ไป 0.1 mL", "hides": "เกินขวดใหญ่สุด"}}
{"case": "10 mL of D25 with amino acid 3 and no dead space: refused", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 10, "ปริมาตรคาสาย (dead space)": 0, "Dextrose final": 25, "Amino acid": 3}, "expect": {"alert": "Bag cannot be made (ใส่ถุงไม่ได้)", "submit": "blocked"}}
```

### CR-EN-FEEDS-MAX · two feeds, at most 8 a day

With two feeds given, Feed 1's and Feed 2's feeds a day together above 8 cannot be submitted; a draft
can. The two share one schedule: q3h is 8, q4h is 6. Step 2 shows their total and its interval. A feed
with no volume is not given, so feed 1 empty beside feed 2 is a day of one feed, and one feed alone is
not checked (a q2h feed is 12): Q18.
Source: Pp, 2026-10-28: "Feed 1+2 รวมกันมากสุดจะได้แค่ 8 มื้อ หรือถ้ากินทุก 4 ชม ก็จะได้ 6 มื้อ". Not a
clinical threshold.

```rule
{"rule": "CR-EN-FEEDS-MAX", "kind": "stop", "coded": {"EN_FEEDS_PER_DAY_MAX": 8}, "where": [{"file": "data.js", "line": 523, "has": "const EN_FEEDS_PER_DAY_MAX = 8;"}, {"file": "calculator.jsx", "line": 2225, "has": "const feedsOverMax = twoFeeds && feedsPerDay > D.EN_FEEDS_PER_DAY_MAX;"}]}
{"case": "4 + 4 = 8 feeds a day (q3h): saves", "side": "inside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 10, "Frequency": 4}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 10, "Frequency": 4}, "tick": {"No TPN": true}, "expect": {"no_alert": "Feeds above 8 a day", "submit": "no_reason", "shows": "Feed 1 + 2 = 8 feeds/d · q3h"}}
{"case": "6 + 6 = 12 feeds a day (q2h): refused", "side": "outside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 10, "Frequency": 6}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 10, "Frequency": 6}, "expect": {"alert": "Feeds above 8 a day", "level": "crit", "no_alert": "Two feeds off a regular schedule", "submit": "blocked", "shows": "Feed 1 + Feed 2 รวม 12 มื้อ/วัน เกิน 8 มื้อ"}}
{"case": "3 + 3 = 6 feeds a day (q4h): saves", "side": "inside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 15, "Frequency": 3}, "feed2": "BM_PFP_24", "order2": {"Volume(mL/feed)": 15, "Frequency": 3}, "expect": {"no_alert": "Feeds above 8 a day", "shows": "Feed 1 + 2 = 6 feeds/d · q4h"}}
{"case": "feed 1 with no volume is not given: 8 + 8 saves", "side": "inside", "infant": {"g": 1000}, "order": {"Frequency": 8}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 10, "Frequency": 8}, "tick": {"No TPN": true}, "expect": {"no_alert": "Feeds above 8 a day", "submit": "no_reason"}}
{"case": "feed 2 alone at 12 a day (q2h), feed 1 empty: one feed, not checked", "side": "inside", "infant": {"g": 1000}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 8, "Frequency": 12}, "tick": {"No TPN": true}, "expect": {"no_alert": "Feeds above 8 a day", "submit": "no_reason"}}
{"case": "one feed at 12 a day (q2h): not checked", "side": "inside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 8, "Frequency": 12}, "tick": {"No TPN": true}, "expect": {"no_alert": "Feeds above 8 a day", "submit": "no_reason"}}
```

### CR-EN-FEED-UNKNOWN · a feed EN_DB does not hold

A feed given (mL/day above 0) whose key is not an `EN_DB` row, such as a row removed since the order was
saved or one written by a newer NeoFeed, has no composition: the order cannot be submitted or printed
until another milk is picked, and it is never costed as the other feed. Before two feeds such a key
stopped the Calculator with an error.
Source: Vera on this change, 2026-10-28. Not a clinical threshold.

```rule
{"rule": "CR-EN-FEED-UNKNOWN", "kind": "stop", "where": [{"file": "data.js", "line": 546, "has": "function enFeedsUnknown(feeds) {"}, {"file": "calculator.jsx", "line": 2247, "has": "const feedUnknown = feedsUnknown.length > 0;"}]}
{"case": "feed 2 given from a key EN_DB lacks: refused", "side": "outside", "fn": "enFeedsUnknown", "args": [[{"key": "BM_20", "mlPerDay": 80}, {"key": "NOT_A_FEED", "mlPerDay": 80}]], "want": ["NOT_A_FEED"]}
{"case": "…and it is not costed as the other feed", "side": "outside", "fn": "enMixPer100mL", "args": [[{"key": "BM_20", "mlPerDay": 80}, {"key": "NOT_A_FEED", "mlPerDay": 80}]], "want": null}
{"case": "the same key with no volume: nothing is fed from it", "side": "inside", "fn": "enFeedsUnknown", "args": [[{"key": "BM_20", "mlPerDay": 80}, {"key": "NOT_A_FEED", "mlPerDay": 0}]], "want": []}
```

### CR-EN-FEEDS-SCHEDULE · two feeds on one regular schedule

With two feeds given, Feed 1's and Feed 2's feeds a day together must fill a regular schedule: 24 h
divided by their total is whole hours. 3 + 4 = 7 has no interval to give them on and cannot be submitted
(a draft can); 6 + 2, 5 + 3 and 4 + 4 make 8 (q3h), 4 + 2 and 3 + 3 make 6 (q4h). With
`CR-EN-FEEDS-MAX` the totals left are 8, 6, 4, 3 and 2. Each feed's feeds a day must be a whole
number (4.8 + 3.2 is refused), and beside the other each feed's hint shows its share of the one schedule
("6 of 8 feeds · q3h"), not an interval of its own. One feed given alone is not checked.
Source: Pp, 2026-10-28: "ถ้าอันนึงกด 3 feed อันนึงกด 4 feed จะทำไม่ได้", then "ไม่ต้อง reject 6+2 ให้ทำได้"
(between the two the rule was that both feeds be given equally often, `CR-EN-FEEDS-EQUAL`). Asked
whether that means any regular schedule (totals 8, 6, 4, 3, 2, any whole split, 7 + 1 and 5 + 3
included) or only totals of 8 or 6, Pp chose any regular schedule (2026-10-28). Whole feeds and the
shared hint: Vera on that change. Not a clinical threshold.

```rule
{"rule": "CR-EN-FEEDS-SCHEDULE", "kind": "stop", "where": [{"file": "calculator.jsx", "line": 2233, "has": "const feedsNotWhole = twoFeeds && (!Number.isInteger(enFreq) || !Number.isInteger(enFreq2));"}]}
{"case": "3 + 4 = 7 a day: refused", "side": "outside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 15, "Frequency": 3}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 15, "Frequency": 4}, "expect": {"alert": "Two feeds off a regular schedule", "level": "crit", "submit": "blocked", "shows": "Feed 1 + Feed 2 รวม 7 มื้อ/วัน ไม่ลงตัวกับทุก ชม. เท่ากัน"}}
{"case": "6 + 2 = 8 a day (q3h): saves, each feed shown as its share of q3h", "side": "inside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 15, "Frequency": 6}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 15, "Frequency": 2}, "tick": {"No TPN": true}, "expect": {"no_alert": "Two feeds off a regular schedule", "submit": "no_reason", "shows": ["Feed 1 + 2 = 8 feeds/d · q3h", "6 of 8 feeds · q3h", "2 of 8 feeds · q3h"], "hides": "q12h"}}
{"case": "4.8 + 3.2 = 8 a day: refused, not whole feeds", "side": "outside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 15, "Frequency": 4.8}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 15, "Frequency": 3.2}, "expect": {"alert": "Two feeds off a regular schedule", "submit": "blocked", "shows": "จำนวนมื้อต้องเป็นจำนวนเต็ม", "hides": "is not whole hours"}}
{"case": "7.5 + 0.5 = 8 a day: refused", "side": "outside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 15, "Frequency": 7.5}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 15, "Frequency": 0.5}, "expect": {"alert": "Two feeds off a regular schedule", "submit": "blocked"}}
{"case": "4 + 2 = 6 a day (q4h): saves", "side": "inside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 15, "Frequency": 4}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 15, "Frequency": 2}, "tick": {"No TPN": true}, "expect": {"no_alert": "Two feeds off a regular schedule", "submit": "no_reason", "shows": "Feed 1 + 2 = 6 feeds/d · q4h"}}
{"case": "3 + 2 = 5 a day: refused", "side": "outside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 15, "Frequency": 3}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 15, "Frequency": 2}, "expect": {"alert": "Two feeds off a regular schedule", "submit": "blocked"}}
{"case": "feed 1 with no volume beside feed 2 at 4: one feed, not checked", "side": "inside", "infant": {"g": 1000}, "order": {"Frequency": 3}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 20, "Frequency": 4}, "tick": {"No TPN": true}, "expect": {"no_alert": "Two feeds off a regular schedule", "submit": "no_reason"}}
```

## Critical: Submit asks for a reason

### CR-GIR-MAX · GIR ceiling

Critical above 12 mg/kg/min, amber outside 4–12, graded only when the bag has volume. A GIR just past
12 prints with enough decimals to read differently from the limit (12.01, not 12). The ward Alerts page
grades a saved GIR with the same `girStatus`. The dextrose ceiling (`CR-DEX-MAX`) is the same limit in
g/kg/d.
Source: ESPGHAN 2018, Mesotten R 5.4: at most 12 mg/kg/min (17.3 g/kg/d); preterm day 1 4–8, then
target 8–10, minimum 4; term day 1 2.5–5, minimum 2.5. Avery ch 60 p. 4: "a reasonable maximum glucose
infusion rate of 12 mg/kg/min"; Fanaroff ch 90 p. 22: 4–8 on day 1, 8–10 over 2–3 days. The TPN team chose
this source on 2026-10-25; until 2026-10-27 GIR turned red above 13. The amber floor of 4 applies to term
infants too, where R 5.4 sets 2.5: Q9.

```rule
{"rule": "CR-GIR-MAX", "kind": "critical", "coded": {"GIR_HARD_HI": 12}, "where": [{"file": "data.js", "line": 1180, "has": "const GIR_HARD_HI = 12;"}, {"file": "data.js", "line": 798, "has": "gir: () => [4, 12],"}, {"file": "calculator.jsx", "line": 2332, "has": "if (calc.totalTPN_mL > 0 && sGir === \"crit\") alerts.push"}]}
{"case": "GIR 11.94 (1.2 kg, 172 mL of D12) is not critical", "side": "inside", "infant": {"g": 1200}, "route": "Central", "order": {"Volume(mL/day)": 172, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 2}, "expect": {"no_alert": "GIR critically high", "submit": "no_reason"}}
{"case": "GIR 12.01 (173 mL) is critical and reads 12.01", "side": "outside", "infant": {"g": 1200}, "route": "Central", "order": {"Volume(mL/day)": 173, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 2}, "expect": {"alert": "GIR critically high", "level": "crit", "submit": "asks_reason", "shows": "12.01 mg/kg/min — above 12"}}
{"case": "4 is the bottom of the band", "side": "inside", "fn": "girStatus", "args": [4], "want": "ok"}
{"case": "3.99 is amber", "side": "outside", "fn": "girStatus", "args": [3.99], "want": "warn"}
{"case": "12 is still in the band", "side": "inside", "fn": "girStatus", "args": [12], "want": "ok"}
{"case": "12.01 is critical", "side": "outside", "fn": "girStatus", "args": [12.01], "want": "crit"}
```

### CR-DEX-MAX · dextrose ceiling

Critical above 17.3 g/kg/d of dextrose delivered. 17.3 g/kg/d is GIR 12.01, so an order between 17.28
and 17.3 g/kg/d is already GIR-critical without this alert. The title still says "KCMH max", which a
saved reason names.
Source: Mesotten R 5.4 (12 mg/kg/min = 17.3 g/kg/d); Thai CPG Table 4.1 (PDF p. 50) repeats it. TPN team,
2026-10-25. Until 2026-10-27 it was the KCMH sheet's 18 (cell F9).

```rule
{"rule": "CR-DEX-MAX", "kind": "critical", "coded": {"MAX_DEXTROSE_G_KG": 17.3}, "where": [{"file": "data.js", "line": 921, "has": "const MAX_DEXTROSE_G_KG = 17.3;"}, {"file": "calculator.jsx", "line": 2457, "has": "if (calc.dexGPerKg > D.MAX_DEXTROSE_G_KG) alerts.push"}]}
{"case": "17.3 g/kg/d (1 kg, 100 mL of D17.3) is not over", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 17.3, "Amino acid": 3}, "expect": {"no_alert": "Dextrose over KCMH max", "alert": "GIR critically high"}}
{"case": "17.4 g/kg/d is critical", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 17.4, "Amino acid": 3}, "expect": {"alert": "Dextrose over KCMH max", "level": "crit", "submit": "asks_reason"}}
```

### CR-OSM-PERIPH · peripheral-line osmolarity

On a peripheral line, or with no route yet, critical at 900 mOsm/L and above, graded on the whole
number that prints: an estimate of 899.6 prints 900 and is critical, 899.4 prints 899 and is not.
Central: no upper limit. The estimate is `CR-U-OSM`.
Source: ESPGHAN 2018, Hartman R 14.22: peripheral PN osmolarity "should be kept less than 900"; the KCMH
TPN form, "Peripheral (<900 mOsm/L)"; Pp, 2026-10-27: 900 itself is over. Thai CPG PDF p. 77 says "not
exceeding" 900, which would allow 900. No guideline sets a central limit (Kolaček, venous access). Avery
and Fanaroff give no mOsm figure, only dextrose above 12.5 % on a central line (Avery ch 60 p. 8, Fanaroff
ch 42 p. 10). The 850 caution and the central 1,800 warning had no source and are gone. Dextrose above
12.5 % on a peripheral line, or with no route yet, adds a "Central only!" flag under the dextrose field
(`DEX_PERIPHERAL_MAX_PCT`, 2026-11-10); it is not an alert and changes nothing at Submit. The printed form's
route line prints `OSM_PERIPHERAL_MAX`, not the paper form's fixed "<900" (Pp, 2026-11-10, PR #240).

```rule
{"rule": "CR-OSM-PERIPH", "kind": "critical", "coded": {"OSM_PERIPHERAL_MAX": 900, "DEX_PERIPHERAL_MAX_PCT": 12.5}, "where": [{"file": "calculator.jsx", "line": 3637, "has": "route!==\"central\" && dexPct > D.DEX_PERIPHERAL_MAX_PCT && ("}, {"file": "data.js", "line": 1206, "has": "const OSM_PERIPHERAL_MAX = 900;"}, {"file": "calculator.jsx", "line": 2139, "has": "? (Number(D.displayNum(v, 0)) >= D.OSM_PERIPHERAL_MAX ? \"crit\" : \"ok\")"}, {"file": "calculator.jsx", "line": 2436, "has": "if (bagOrdered && sOsm === \"crit\") alerts.push"}]}
{"case": "peripheral, prints 899: no alert", "side": "inside", "infant": {"g": 1000}, "route": "Peripheral", "order": {"Volume(mL/day)": 100, "Dextrose final": 15, "Amino acid": 1.49}, "expect": {"no_alert": "Osmolarity > peripheral limit", "shows": "Osm 899 mOsm/L"}}
{"case": "peripheral, 899.6 prints 900: critical", "side": "outside", "infant": {"g": 1000}, "route": "Peripheral", "order": {"Volume(mL/day)": 100, "Dextrose final": 15, "Amino acid": 1.496}, "expect": {"alert": "Osmolarity > peripheral limit", "level": "crit", "submit": "asks_reason"}}
{"case": "peripheral D12.5: no Central only! flag", "side": "inside", "infant": {"g": 1000}, "route": "Peripheral", "order": {"Volume(mL/day)": 100, "Dextrose final": 12.5, "Amino acid": 2}, "expect": {"hides": "Central only!"}}
{"case": "peripheral D12.6: Central only!", "side": "outside", "infant": {"g": 1000}, "route": "Peripheral", "order": {"Volume(mL/day)": 100, "Dextrose final": 12.6, "Amino acid": 2}, "expect": {"shows": "Central only!"}}
{"case": "central D12.6: no flag", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12.6, "Amino acid": 2}, "expect": {"hides": "Central only!"}}
{"case": "the same bag on a central line: no limit", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 15, "Amino acid": 1.496}, "expect": {"no_alert": "Osmolarity > peripheral limit"}}
{"case": "no route yet is graded as peripheral", "side": "outside", "infant": {"g": 1000}, "order": {"Volume(mL/day)": 100, "Dextrose final": 15, "Amino acid": 1.496}, "expect": {"alert": "Osmolarity > peripheral limit", "level": "crit"}}
```

### CR-K-BAG-RED · K⁺ in the bag, amber and red

Below the maximum (`CR-K-BAG-MAX`): amber above 40 mEq/L peripheral and 60 central; critical above 120
central. On a peripheral line red equals the maximum, so there is no confirm-with-a-reason tier there.
Same concentration and float-noise grading as the maximum.
Source: TPN team 2026-09-28 and Pp ("K ทาง central เริ่มสีเหลืองที่ 60", "ลดเป็น 120 ให้ขึ้นแดง"). Central
red 120 matches Fanaroff ch Therapeutic Agents p. 8 and IWK; peripheral amber 40 matches Fanaroff's and
ANMF's peripheral maximum, so a peripheral bag of 40–60 is orderable where those call 40 the most (Q1).
Central amber 60 has no source. ESPGHAN 2018 sets no K⁺ concentration limit (Hartman R 14.13 asks only for
the supplier's stability data).

```rule
{"rule": "CR-K-BAG-RED", "kind": "critical", "coded": {"K_BAG_MEQ_PER_L.peripheral.warn": 40, "K_BAG_MEQ_PER_L.peripheral.red": 60, "K_BAG_MEQ_PER_L.central.warn": 60, "K_BAG_MEQ_PER_L.central.red": 120}, "where": [{"file": "calculator.jsx", "line": 2463, "has": "else if (kMeqPerLGraded > kLim.red) alerts.push"}, {"file": "calculator.jsx", "line": 2464, "has": "else if (kMeqPerLGraded > kLim.warn) alerts.push"}]}
{"case": "peripheral 40 mEq/L: no caution", "side": "inside", "infant": {"g": 1000}, "route": "Peripheral", "order": {"Volume(mL/day)": 50, "Dextrose final": 5, "Amino acid": 1, "KCl": 2}, "expect": {"no_alert": "K⁺ concentration high"}}
{"case": "peripheral 41 mEq/L: caution", "side": "outside", "infant": {"g": 1000}, "route": "Peripheral", "order": {"Volume(mL/day)": 50, "Dextrose final": 5, "Amino acid": 1, "KCl": 2.05}, "expect": {"alert": "K⁺ concentration high", "level": "warn"}}
{"case": "central 60 mEq/L: no caution", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 50, "Dextrose final": 5, "Amino acid": 1, "KCl": 3}, "expect": {"no_alert": "K⁺ concentration high"}}
{"case": "central 61 mEq/L: caution", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 50, "Dextrose final": 5, "Amino acid": 1, "KCl": 3.05}, "expect": {"alert": "K⁺ concentration high", "level": "warn"}}
{"case": "central 120 mEq/L (25 mL, KCl 3): amber, not red", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 25, "Dextrose final": 5, "Amino acid": 1, "KCl": 3}, "expect": {"no_alert": "K⁺ concentration too high", "alert": "K⁺ concentration high"}}
{"case": "central 121 mEq/L: critical", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 25, "Dextrose final": 5, "Amino acid": 1, "KCl": 3.025}, "expect": {"alert": "K⁺ concentration too high", "level": "crit", "submit": "asks_reason"}}
```

### CR-PROTEIN-MAX · protein ceiling

Critical above 4.5 g/kg/d of protein, TPN amino acid and counted feed together, so feeds alone can
cross it. The tile's amber band is `CR-TGT-PROTEIN`.
Source: TPN team, 2026-10-25 (it was 4.8, unsourced, from the first commit); ESPGHAN 2022, Embleton R1
(p. 252): up to 4.5 g/kg/d where growth is slow; Fanaroff ch 42 p. 2: VLBW total 3.5–4.5, "with a maximum
of 3.5 g/kg parenterally". Pp chose the TPN + feed total on 2026-10-27, after Vera. ESPGHAN 2018 R 3.3
keeps PN amino acid above 3.5 to trials, so a PN-only 3.5–4.5 shows amber only: Q10.

```rule
{"rule": "CR-PROTEIN-MAX", "kind": "critical", "coded": {"PROTEIN_HARD_HI": 4.5}, "where": [{"file": "data.js", "line": 1198, "has": "const PROTEIN_HARD_HI = 4.5;"}, {"file": "calculator.jsx", "line": 2079, "has": "const PRO_HARD = { hardHi: D.PROTEIN_HARD_HI };"}]}
{"case": "amino acid 4.5 g/kg/d: amber, not critical", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 4.5, "20% lipid": 3}, "expect": {"no_alert": "Protein critically out of range", "alert": "Protein off target"}}
{"case": "amino acid 4.51 g/kg/d: critical", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 4.51, "20% lipid": 3}, "expect": {"alert": "Protein critically out of range", "level": "crit", "submit": "asks_reason"}}
{"case": "feeds alone: Hi-Q LBW 24 at 176 mL/kg/d (about 4.6)", "side": "outside", "infant": {"g": 1000}, "fluid": 180, "feed": "FBM_PF_24", "order": {"Volume(mL/feed)": 22, "Frequency": 8}, "expect": {"alert": "Protein critically out of range", "level": "crit"}}
```

### CR-LIPID-IV-MAX · IV lipid ceiling

Critical above 4.0 g/kg/d of IV lipid (the syringe only; feed fat is not counted). The tile shows the
total against `CR-TGT-LIPID`.
Source: TPN team, 2026-10-25 (it was 4.5, unsourced); ESPGHAN 2018, Lapillonne R 4.3: at most 4 g/kg/d
in preterm and term infants; Thai CPG Table 3.2 (PDF p. 42–43) the same; Fanaroff ch 42 p. 10: not above
3–4 g/kg/d. The IV-only basis is Pp's, 2026-09-17 (UP-C4): on full feeds the total sat inside the enteral
band and fired on every infant.

```rule
{"rule": "CR-LIPID-IV-MAX", "kind": "critical", "coded": {"LIPID_IV_HARD_HI": 4}, "where": [{"file": "data.js", "line": 1199, "has": "const LIPID_IV_HARD_HI = 4.0;"}, {"file": "calculator.jsx", "line": 2172, "has": "const hardLip = D.rangeStatus(ivLipidKg, tLip, { hardHi: D.LIPID_IV_HARD_HI }) === \"crit\";"}]}
{"case": "4.0 g/kg/d: not critical", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 4}, "expect": {"no_alert": "Lipid critically out of range"}}
{"case": "4.1 g/kg/d: critical", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 4.1}, "expect": {"alert": "Lipid critically out of range", "level": "crit", "submit": "asks_reason"}}
```

### CR-LIPID-RATE · lipid infusion rate

g/kg/h = IV lipid g/kg/d ÷ the hours the lipid pump actually runs, rounded to 2 decimals as the pump card
shows it, then graded: amber above 0.13, critical above 0.17. The hours are the lipid bag (20 % lipid +
Vitalipid) ÷ its rate at 0.1 mL/hr (`CR-R-PUMP-RATE`), not the 16, 20 or 24 typed: rounding the rate up
shortens the run, so a dose can grade higher than over the hours typed (1 kg over 24 h: 3.05 g/kg/d is
0.9 mL/hr for 21.4 h, 0.14; over the 24 h typed it was 0.13). Under 24 h typed the nearest 0.1 can round
the rate down and lengthen the run, so a dose can grade lower too (1 kg over 16 h: 2.85 g/kg/d is 1.1 mL/hr
for 16.6 h, 0.17, amber; over the 16 h typed it was 0.18, critical; Vera on this change).
Critical needs the dose above 0.17 over the hours ordered as well (dose ÷ the hours typed, 2 decimals). Where
only the pump's hours are above it, because the rate rounded up, the line stays amber and says so (940 g, 4 g/kg/d
over 24 h: 21.8 mL at 1 mL/hr runs 21.8 h, 0.18; 0.17 as ordered). Pp, 2026-11-09, after the release comparison:
4 g/kg/d over 24 h had become critical at 52 of 351 weights from 500 to 4,000 g, 30 of the 50 under 1 kg.
Above 0.20 at the pump it is critical whatever the hours ordered (Vera: 200 g on 4 g/kg/d over 24 h runs 0.3
mL/hr for 16.7 h, 0.24; Pp, 2026-11-10, 0.20). The lipid syringe stops at the volume ordered (Pp, 2026-11-10).
Source: TPN team 2026-09-28, Pp: "lipid เพดาน 0.13-0.17 g/kg/h". Koletzko 2005 (p. S20): infants at most
3–4 g/kg/d "(0.13–0.17 g/kg per hour)". ESPGHAN 2018 gives no hourly limit and advises lipid over 24 h in
newborns (Lapillonne R 4.10). Thai CPG Table 3.2: 0.17 for preterm, term and infants, 0.13 only over
1 year; so the amber at 0.13 fires from about 3.05 g/kg/d over 24 h at 1 kg, a dose R 4.3 allows: Q11.
The actual hours: Pp, 2026-11-06, asked with the rate rounding ("Actual hours"); until then the hours typed.

```rule
{"rule": "CR-LIPID-RATE", "kind": "critical", "coded": {"LIPID_GKGH": {"warn": 0.13, "max": 0.17, "pumpMax": 0.2}}, "where": [{"file": "data.js", "line": 955, "has": "const LIPID_GKGH = { warn: 0.13, max: 0.17, pumpMax: 0.2 };"}, {"file": "data.js", "line": 1231, "has": "function lipidGkghAt(lipidPerKg, bagMl, hours) {"}, {"file": "data.js", "line": 1242, "has": "function lipidRateGrade(lipidPerKg, bagMl, hours) {"}, {"file": "calculator.jsx", "line": 2149, "has": "const lipidGrade = D.lipidRateGrade(lipidPerKg, calc.lipidBagVol, lipidDripHours);"}]}
{"case": "3.0 g over 24 h: 19 mL at 0.8 mL/hr runs 23.75 h = 0.13: no caution", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 3}, "expect": {"no_alert": "Lipid rate near the ceiling"}}
{"case": "3.05 g over 24 h: 19.25 mL at 0.9 mL/hr runs 21.4 h = 0.14: caution", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 3.05}, "expect": {"alert": "Lipid rate near the ceiling", "level": "warn", "shows": "0.14 g/kg/h over 21.4 h"}}
{"case": "3.35 g over 20 h: 20.75 mL at 1 mL/hr runs 20.75 h = 0.16: not critical", "side": "inside", "infant": {"g": 1000}, "route": "Central", "hours": 20, "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 3.35}, "expect": {"no_alert": "Lipid rate above the ceiling"}}
{"case": "3.4 g over 20 h: 21 mL at 1.1 mL/hr runs 19.1 h = 0.18, but 0.17 over the 20 h ordered: amber, no reason asked", "side": "inside", "infant": {"g": 1000}, "route": "Central", "hours": 20, "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 3.4}, "expect": {"alert": "Lipid rate near the ceiling", "level": "warn", "shows": "because the pump rate rounds up"}}
{"case": "3.5 g over 20 h: 21.5 mL at 1.1 mL/hr runs 19.5 h = 0.18, and 0.18 over the 20 h ordered: critical", "side": "outside", "infant": {"g": 1000}, "route": "Central", "hours": 20, "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 3.5}, "expect": {"alert": "Lipid rate above the ceiling", "level": "crit", "submit": "asks_reason"}}
{"case": "940 g, 4 g over 24 h: 21.8 mL at 1 mL/hr runs 21.8 h = 0.18, 0.17 over the 24 h ordered: amber", "side": "inside", "infant": {"g": 940}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 4}, "expect": {"alert": "Lipid rate near the ceiling", "level": "warn", "shows": "0.17 over the 24 h ordered"}}
{"case": "over the ceiling only because the rate rounded up: amber", "side": "inside", "fn": "lipidRateGrade", "args": [4, 21.8, 24], "want": {"status": "warn", "gkgh": 0.18, "gkghOrdered": 0.17, "overByRounding": true}}
{"case": "over the ceiling on both counts: critical", "side": "outside", "fn": "lipidRateGrade", "args": [3.5, 21.5, 20], "want": {"status": "crit", "gkgh": 0.18, "gkghOrdered": 0.18, "overByRounding": false}}
{"case": "200 g, 4 g over 24 h: 5 mL at 0.3 mL/hr runs 16.7 h = 0.24, above 0.20 at the pump: critical", "side": "outside", "fn": "lipidRateGrade", "args": [4, 5, 24], "want": {"status": "crit", "gkgh": 0.24, "gkghOrdered": 0.17, "overByRounding": false}}
{"case": "0.20 at the pump is not above 0.20: amber", "side": "inside", "fn": "lipidRateGrade", "args": [4, 6, 24], "want": {"status": "warn", "gkgh": 0.2, "gkghOrdered": 0.17, "overByRounding": true}}
{"case": "over 0.17 as ordered, 0.17 as the pump runs: amber", "side": "inside", "fn": "lipidRateGrade", "args": [2.85, 18.25, 16], "want": {"status": "warn", "gkgh": 0.17, "gkghOrdered": 0.18, "overByRounding": false}}
{"case": "0.17 is not above the ceiling", "side": "inside", "fn": "lipidGkghAt", "args": [4, 24, 24], "want": 0.17}
{"case": "2.85 g over 16 h: 18.25 mL at 1.1 mL/hr runs 16.6 h = 0.17: amber, not critical", "side": "inside", "infant": {"g": 1000}, "route": "Central", "hours": 16, "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 2.85}, "expect": {"alert": "Lipid rate near the ceiling", "level": "warn", "no_alert": "Lipid rate above the ceiling"}}
```

### CR-K-IV-MAX · IV potassium ceiling

Critical above 5.0 mEq/kg/d of K⁺ in the bag (KCl + K₂HPO₄), at every weight and day. Feed K⁺ is not
counted; the tile shows the total against `CR-TGT-K`.
Source: TPN team, 2026-10-25 (it was 3.5, unsourced); 5 is Jochum Table 3's upper bound for preterm
< 1,500 g in stable growth, applied to every weight by Pp (2026-10-27). No source states a per-kg maximum
(Jochum Tables 1–3; Avery ch 20 p. 12; Fanaroff ch 42 p. 13). Jochum tops out at 3 for term and ≥ 1,500 g
infants, so 3–5 shows amber only there: Q12.

```rule
{"rule": "CR-K-IV-MAX", "kind": "critical", "coded": {"K_IV_HARD_HI": 5}, "where": [{"file": "data.js", "line": 1200, "has": "const K_IV_HARD_HI = 5.0;"}, {"file": "calculator.jsx", "line": 2173, "has": "const hardK   = D.rangeStatus(ivKKg, tK, { hardHi: D.K_IV_HARD_HI }) === \"crit\";"}]}
{"case": "KCl 5 mEq/kg/d: not critical", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 2, "KCl": 5}, "expect": {"no_alert": "Potassium critically out of range"}}
{"case": "KCl 5.1 mEq/kg/d: critical", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 2, "KCl": 5.1}, "expect": {"alert": "Potassium critically out of range", "level": "crit", "submit": "asks_reason"}}
```

### CR-KCAL-MAX · energy ceiling

Critical above 160 kcal/kg/d, TPN and counted feed together; amber outside the phase band
(`CR-TGT-KCAL`).
Source: ESPGHAN 2022, Embleton R2 (p. 251): above 140 only once protein and other nutrients suffice, and
not above 160 (the code cites the CUPA 2023 lecture, slide 17). That is an enteral ceiling; no source gives
one for PN, whose bands stop at 120 (`CR-TGT-KCAL`): Q13.

```rule
{"rule": "CR-KCAL-MAX", "kind": "critical", "coded": {"KCAL_HARD_HI": 160}, "where": [{"file": "data.js", "line": 1184, "has": "const KCAL_HARD_HI = 160;"}, {"file": "calculator.jsx", "line": 2086, "has": "const kcalStatusAt = (v) => D.rangeStatus(v, tKcal, { hardHi: D.KCAL_HARD_HI });"}]}
{"case": "160 kcal/kg/d (Hi-Q LBW 24, 25 mL × 8): amber, not critical", "side": "inside", "infant": {"g": 1000}, "fluid": 200, "feed": "FBM_PF_24", "order": {"Volume(mL/feed)": 25, "Frequency": 8}, "expect": {"no_alert": "Energy critically out of range", "alert": "Energy off target"}}
{"case": "161 kcal/kg/d (25.2 mL × 8): critical", "side": "outside", "infant": {"g": 1000}, "fluid": 200, "feed": "FBM_PF_24", "order": {"Volume(mL/feed)": 25.2, "Frequency": 8}, "expect": {"alert": "Energy critically out of range", "level": "crit"}}
```

### CR-ZN-MAX · total zinc

Critical above 5 mg/day of elemental zinc reaching the infant: Peditrace at the mL delivered (1 mL/kg,
capped at 15 mL, × 0.25 mg/mL) plus ZnSO₄ (mg/kg/d × kg).
Source: KCMH TPN team, 2026-09-22: "กำหนด Maximum Zinc 5 mg/day". ESPGHAN 2018, Domellöf R 7.8: preterm
400–500 µg/kg/d, "up to a maximum of 5 mg/d for routine supplementation"; Thai CPG PDF p. 68 the same.
Peditrace SmPC §2: 250 µg Zn/mL.

```rule
{"rule": "CR-ZN-MAX", "kind": "critical", "coded": {"MAX_ZN_MG_DAY": 5, "KCMH_STOCK.peditrace.znMgPerMl": 0.25, "KCMH_STOCK.znso4.znMgPerMl": 1}, "where": [{"file": "data.js", "line": 958, "has": "const MAX_ZN_MG_DAY = 5;"}, {"file": "calculator.jsx", "line": 1850, "has": "const znTotal_mg = znPeditrace_mg + znSO4_mg;"}, {"file": "calculator.jsx", "line": 2472, "has": "if (calc.znTotal_mg > D.MAX_ZN_MG_DAY) alerts.push"}]}
{"case": "5 kg: Peditrace 1.25 + ZnSO₄ 3.75 = 5 mg/day, not over", "side": "inside", "infant": {"g": 5000}, "route": "Central", "fluid": 140, "order": {"Volume(mL/day)": 600, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 3, "ZnSO₄": 0.75}, "expect": {"no_alert": "Zinc total above 5 mg/day"}}
{"case": "5 kg: 1.25 + 3.8 = 5.05 mg/day, critical", "side": "outside", "infant": {"g": 5000}, "route": "Central", "fluid": 140, "order": {"Volume(mL/day)": 600, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 3, "ZnSO₄": 0.76}, "expect": {"alert": "Zinc total above 5 mg/day", "level": "crit", "submit": "asks_reason"}}
```

### CR-WT-MANUAL · a typed weight far from the automatic one

A TPN calc. weight typed more than 20 % away from the automatic weight (`CR-U-DOSING-WEIGHT`) is
critical; exactly 20 % is not (float noise stripped). Only a typed weight is judged.
Source: Pp, 2026-10-08: "ต่างเกิน 20%". Not a clinical threshold.

```rule
{"rule": "CR-WT-MANUAL", "kind": "critical", "coded": {"TPN_WT_MANUAL_MAX_DIFF": 0.2}, "where": [{"file": "data.js", "line": 968, "has": "const TPN_WT_MANUAL_MAX_DIFF = 0.2;"}, {"file": "calculator.jsx", "line": 2313, "has": "const tpnWtFar = !tpnWtOutOfRange && Number(tpnWtDiff.toPrecision(12)) > D.TPN_WT_MANUAL_MAX_DIFF;"}]}
{"case": "1,200 g typed against 1,000 g automatic (20 %): saves", "side": "inside", "infant": {"g": 1000}, "order": {"TPN calc. weight": 1200, "Volume(mL/feed)": 13, "Frequency": 8}, "tick": {"No TPN": true}, "expect": {"no_alert": "TPN calc. weight far from automatic", "submit": "no_reason"}}
{"case": "1,201 g typed: critical", "side": "outside", "infant": {"g": 1000}, "order": {"TPN calc. weight": 1201, "Volume(mL/feed)": 13, "Frequency": 8}, "tick": {"No TPN": true}, "expect": {"alert": "TPN calc. weight far from automatic", "level": "crit", "submit": "asks_reason"}}
```

### CR-CAP-NO-P · calcium with no phosphate

Calcium ordered with zero phosphate from every source (bag, feed, and oral supplement when one is
ordered) is critical: the ratio is Infinity.
Source: Avery ch 83 p. 14 and Fanaroff ch 91 p. 21: calcium without enough phosphate gives hypercalcaemia
with hypophosphataemia; ESPGHAN 2022 C4 (Embleton p. 255). No source sets the severity tier.

```rule
{"rule": "CR-CAP-NO-P", "kind": "critical", "where": [{"file": "calculator.jsx", "line": 2407, "has": "if (caPStatus === \"crit\") alerts.push"}, {"file": "data.js", "line": 1162, "has": "if (!isFinite(value)) return value > 0 ? \"crit\" : \"empty\";"}]}
{"case": "Ca 40 mg/kg/d with no phosphate: critical", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 2, "10% Ca gluconate": 40}, "expect": {"alert": "Ca:P ratio — ไม่มี P", "level": "crit", "submit": "asks_reason"}}
{"case": "Ca 40 with Glycophos: no such alert", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 2, "10% Ca gluconate": 40, "Glycophos": 2}, "expect": {"no_alert": "Ca:P ratio — ไม่มี P"}}
```

### CR-MG-MEQ-HABIT · a Mg dose typed in mEq

A MgSO₄ dose above 0 and below 1 mg/kg/d is critical, and its title asks whether it was typed in mEq, so
the Submit prompt and the printed critical box ask it too. The box took mEq/kg/d until 2026-10-28, so a
dose typed from habit (0.2–0.6) now reads as mg, a twelfth of what was meant. 1 itself is not critical. Graded on the mg figure the box shows; from 1 up, the band
(`CR-TGT-MG`) grades it as before. Not a clinical threshold: a guard against the unit change.
Source: Pp, 2026-10-29, answering Vera's second review of the nutrition-meeting PR (finding 4).

```rule
{"rule": "CR-MG-MEQ-HABIT", "kind": "critical", "coded": {"MG_MEQ_HABIT_MG": 1}, "where": [{"file": "data.js", "line": 976, "has": "const MG_MEQ_HABIT_MG = 1;"}, {"file": "calculator.jsx", "line": 2100, "has": "const mgStatusAt = (v) => D.rangeStatus(v, tMg, { hardLo: D.MG_MEQ_HABIT_MG });"}, {"file": "calculator.jsx", "line": 2367, "has": "if (sMg === \"crit\") alerts.push"}]}
{"case": "MgSO₄ 1 mg/kg/d on DOL 10: amber only, no reason asked", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 150, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 2, "MgSO₄": 1}, "expect": {"alert": "Magnesium off target", "level": "warn", "submit": "no_reason"}}
{"case": "MgSO₄ 0.99 mg/kg/d: critical, asks whether it was mEq", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 150, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 2, "MgSO₄": 0.99}, "expect": {"alert": "Magnesium below 1 mg/kg/d: พิมพ์เป็น mEq หรือเปล่า", "level": "crit", "submit": "asks_reason", "shows": "พิมพ์เป็น mEq หรือเปล่า"}}
{"case": "0.4 typed from mEq habit, 2 kg: critical", "side": "outside", "infant": {"g": 2000}, "route": "Central", "order": {"Volume(mL/day)": 300, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 2, "MgSO₄": 0.4}, "expect": {"alert": "Magnesium below 1 mg/kg/d: พิมพ์เป็น mEq หรือเปล่า", "level": "crit", "submit": "asks_reason"}}
{"case": "no MgSO₄: no Mg line at all", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 150, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 2}, "expect": {"no_alert": "Magnesium below 1 mg/kg/d: พิมพ์เป็น mEq หรือเปล่า"}}
```

### CR-GLYCO-UNIT-HABIT · a Glycophos dose typed in the other unit

The Glycophos box takes mEq Na/kg/d (chips 1–4) or, with its P button, mg P/kg/d (chips 15–60); one unit
is 15.5 times the other (`CR-U-SALTS`), and Na and P have no hard limit. A Glycophos dose of 10 mEq Na/kg/d
or more (P 155 mg/kg/d) is critical in either unit, and its title asks whether it was typed as mg P; 9.99 is
not (float noise stripped). Graded on the dose, not the box, so reopening an order (it opens on Na) never
raises a line the saved reason did not name. With the box on P, a dose above 0 and below 10 mg P/kg/d is
critical too, asking whether it was typed as mEq Na; on Na the same dose (under 0.65 mEq) is not graded.
Not a clinical threshold: a guard against the two units.
Source: Pp, 2026-11-06, answering Vera's review of the Na / P buttons: of 10 / 10, 5 / 15 or no guard, she
chose 10 / 10.

```rule
{"rule": "CR-GLYCO-UNIT-HABIT", "kind": "critical", "coded": {"GLYCO_NA_HABIT_MEQ": 10, "GLYCO_P_HABIT_MG": 10}, "where": [{"file": "data.js", "line": 983, "has": "const GLYCO_NA_HABIT_MEQ = 10;"}, {"file": "data.js", "line": 986, "has": "const GLYCO_P_HABIT_MG = 10;"}, {"file": "calculator.jsx", "line": 2378, "has": "if (glycoNaKg >= D.GLYCO_NA_HABIT_MEQ) alerts.push"}, {"file": "calculator.jsx", "line": 2384, "has": "else if (glycophosBy === \"p\" && glycoPMgKg > 0 && glycoPMgKg < D.GLYCO_P_HABIT_MG) alerts.push"}]}
{"case": "1 kg: Glycophos 9.99 mEq Na/kg/d is not critical", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3, "Glycophos": 9.99}, "expect": {"no_alert": "Glycophos 10 mEq Na/kg/d or more: พิมพ์เป็น mg P หรือเปล่า"}}
{"case": "30 typed on Na (meant 30 mg P): 30 mEq Na = P 465 mg/kg/d, critical, a reason asked", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3, "Glycophos": 30}, "expect": {"alert": "Glycophos 10 mEq Na/kg/d or more: พิมพ์เป็น mg P หรือเปล่า", "level": "crit", "submit": "asks_reason", "shows": "Glycophos 30 mEq Na/kg/d = P 465 mg/kg/d = 15 mL/kg/d"}}
{"case": "10 mEq Na/kg/d itself is critical", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3, "Glycophos": 10}, "expect": {"alert": "Glycophos 10 mEq Na/kg/d or more: พิมพ์เป็น mg P หรือเปล่า", "level": "crit"}}
{"case": "0.5 mEq Na/kg/d on Na (P 7.75 mg): the low line is graded only on P", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3, "Glycophos": 0.5}, "expect": {"no_alert": "Glycophos below 10 mg P/kg/d: พิมพ์เป็น mEq Na หรือเปล่า"}}
```

## Red without a reason

### CR-NPE-AA · non-protein energy per gram of amino acid

Two figures. The IV figure, (TPN kcal − 4 × AA g) ÷ AA g: red below 12 with no reason asked, amber
below 20 (normal while dextrose and lipid ramp up in week 1). The total figure (TPN + feed): amber below
24, no upper end. No amino acid in the bag, no IV figure.
Source: 24 kcal/g AA is the classic NPC:N 150:1 ÷ 6.25 g AA per g N (clinical review 2026-08-11), which
neither textbook, no ESPGHAN 2018 chapter, Moltu 2021 nor the Thai CPG states. They give "a minimum of
30–40 Kcal per 1 g amino acids" (van Goudoever, text; Avery ch 60 p. 2; Thai CPG PDF p. 28–29) and
"> 25 kcal/g" parenterally (Moltu p. 279). Red below 12: TPN team, 2026-10-25, the bottom of the Thai
CPG's 12–16 for critical illness; no reason: Pp, 2026-10-27, after Vera. The caution at 20 has no source.
The old > 32 ceiling is gone because 30–40 is a minimum. Q3, which Pp answered on 2026-10-28: keep as is
for now. The 20 is `NPE_IV_WARN_LO` since 2026-11-10; it had been a literal in `calculator.jsx`.

```rule
{"rule": "CR-NPE-AA", "kind": "red", "coded": {"NPE_IV_CRIT_LO": 12, "NPE_IV_WARN_LO": 20}, "where": [{"file": "data.js", "line": 1201, "has": "const NPE_IV_CRIT_LO = 12;"}, {"file": "data.js", "line": 860, "has": "npePerGAA: () => [24, Infinity],"}, {"file": "calculator.jsx", "line": 2171, "has": "const ivNpeN    = calc.aaG > 0 ? (calc.tpnKcal - calc.aaG * 4) / calc.aaG : null;"}, {"file": "calculator.jsx", "line": 2186, "has": "const critLowNPE = ivNpeN !== null && ivNpeN < D.NPE_IV_CRIT_LO;"}, {"file": "calculator.jsx", "line": 2187, "has": "const lowNPE  = ivNpeN !== null && !critLowNPE && ivNpeN < D.NPE_IV_WARN_LO;"}]}
{"case": "IV 11.7 (100 mL of D10, AA 2.9): red, saves with no reason", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 2.9}, "expect": {"alert": "NPE:AA critically low", "level": "crit", "submit": "no_reason"}}
{"case": "IV 12.1 (AA 2.8): amber, not red", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 2.8}, "expect": {"no_alert": "NPE:AA critically low", "shows": "kcal/g AA < 20"}}
{"case": "IV 19.9 (AA 1.71): the below-20 caution", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 1.71}, "expect": {"shows": "NPE:AA IV 19.9 kcal/g AA < 20"}}
{"case": "IV 20 (AA 1.7): only the total's below-24 caution", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 1.7}, "expect": {"hides": "kcal/g AA < 20", "shows": "aim at least 24 kcal/g AA"}}
{"case": "23.9 (AA 1.42): amber", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 1.42}, "expect": {"alert": "NPE:AA off target", "level": "warn"}}
{"case": "24.3 (AA 1.4): in range", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 1.4}, "expect": {"no_alert": "NPE:AA off target"}}
```

## Cautions

### CR-HEPARIN · heparin above the usual dose

Amber above 1 U/mL of the aqueous bag (usual 0.5–1, KCMH default 1), so a tenfold 10 U/mL is seen. No
bag, no caution.
Source: KCMH TPN team, 2026-10-25. ESPGHAN 2018, Kolaček: 0.5–1.0 U/mL is unlikely to destabilise the
lipid emulsion; Fanaroff ch Therapeutic Agents p. 8: 0.5–1 unit/mL for central-line patency.

```rule
{"rule": "CR-HEPARIN", "kind": "caution", "coded": {"HEPARIN_USUAL_MAX_U_ML": 1, "KCMH_STOCK.heparin.unitsPerMl": 100}, "where": [{"file": "data.js", "line": 932, "has": "const HEPARIN_USUAL_MAX_U_ML = 1;"}, {"file": "calculator.jsx", "line": 2491, "has": "if (calc.totalTPN_mL > 0 && heparinUmL > D.HEPARIN_USUAL_MAX_U_ML) alerts.push"}]}
{"case": "1 U/mL: no caution", "side": "inside", "infant": {"g": 1500}, "route": "Central", "order": {"Volume(mL/day)": 150, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 1, "Heparin": 1}, "expect": {"no_alert": "Heparin above the usual dose"}}
{"case": "1.5 U/mL: caution", "side": "outside", "infant": {"g": 1500}, "route": "Central", "order": {"Volume(mL/day)": 150, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 1, "Heparin": 1.5}, "expect": {"alert": "Heparin above the usual dose", "level": "warn"}}
```

### CR-VITD · oral vitamin D per day

Amber above 1,000 IU/day: Step 6's IU/kg/d × weight, plus Munti-vim's 400 IU when ticked.
Source: KCMH nutrition unit, 2026-10-25: "ตั้ง upper border ไว้ที่ 1,000 IU/day". ESPGHAN 2022, Embleton
R1 (p. 257): 400–700 IU/kg/d "with a maximum dose of 1000 IU/d"; Fanaroff ch 91 p. 12: 1,000 IU/day is the
safe upper limit under 6 months.

```rule
{"rule": "CR-VITD", "kind": "caution", "coded": {"VIT_D_MAX_IU_DAY": 1000}, "where": [{"file": "data.js", "line": 929, "has": "const VIT_D_MAX_IU_DAY = 1000;"}, {"file": "calculator.jsx", "line": 2495, "has": "if (vitDIuDay > D.VIT_D_MAX_IU_DAY) alerts.push"}]}
{"case": "1.5 kg: 400 IU/kg + Munti-vim 400 = 1,000 IU/day, not above", "side": "inside", "infant": {"g": 1500}, "order": {"Vitamin D": 400}, "tick": {"Munti-vim": true}, "expect": {"no_alert": "Vitamin D above 1,000 IU/day"}}
{"case": "450 IU/kg + Munti-vim = 1,075 IU/day: caution", "side": "outside", "infant": {"g": 1500}, "order": {"Vitamin D": 450}, "tick": {"Munti-vim": true}, "expect": {"alert": "Vitamin D above 1,000 IU/day", "level": "warn"}}
```

### CR-MEN-MAX · MEN still ticked above trophic volume

A feed ticked MEN counts toward nothing (`CR-U-MEN`), and orders prefill from yesterday, so MEN ticked on
a feed above 24 mL/kg/d is amber: the feed was probably advanced and the tick left on.
Source: the app's own Feeding Advancement card, "MEF (trophic) 12–24 mL/kg/day"; Pp, 2026-09-18.
ESPGHAN 2022 (Embleton p. 257): minimal enteral feeding "typically 12–24 mL/kg/d"; Fanaroff ch 42 p. 7:
≤ 25 mL/kg/d.

```rule
{"rule": "CR-MEN-MAX", "kind": "caution", "coded": {"MEN_MAX_ML_KG": 24}, "where": [{"file": "data.js", "line": 992, "has": "const MEN_MAX_ML_KG = 24;"}, {"file": "calculator.jsx", "line": 2417, "has": "if (isMEN && calc.enVolPerKg > D.MEN_MAX_ML_KG) alerts.push"}]}
{"case": "MEN 3 mL × 8 = 24 mL/kg/d: no caution", "side": "inside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 3, "Frequency": 8}, "tick": {"MEN (trophic)": true}, "expect": {"no_alert": "MEN ticked above trophic volume"}}
{"case": "MEN 3.1 mL × 8 = 24.8 mL/kg/d: caution", "side": "outside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 3.1, "Frequency": 8}, "tick": {"MEN (trophic)": true}, "expect": {"alert": "MEN ticked above trophic volume", "level": "warn"}}
```

### CR-AA-MISSING · a bag with no amino acid

A bag with volume and no amino acid is amber: a day without it can be meant, but left out by mistake it
reached pharmacy as "not ordered" with nothing on screen.
Source: Pp, 2026-10-21. A bag without Ca, P or Mg gets no caution (TPN team, 2026-10-25; Pp, 2026-10-27).

```rule
{"rule": "CR-AA-MISSING", "kind": "caution", "where": [{"file": "calculator.jsx", "line": 2393, "has": "if (calc.totalTPN_mL > 0 && !(aaPerKg > 0)) alerts.push"}]}
{"case": "D10 with no amino acid: caution", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10}, "expect": {"alert": "Amino acid not ordered", "level": "warn"}}
{"case": "amino acid 1 g/kg/d: none", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 1}, "expect": {"no_alert": "Amino acid not ordered"}}
```

### CR-CAPHOS-COMPAT · calcium with inorganic phosphate

Calcium with K₂HPO₄ in one bag is amber: NeoFeed does not calculate precipitation risk, pharmacy
checks it. Glycophos (organic phosphate) raises no caution.
Source: ESPGHAN/ESPEN/ESPR/CSPEN 2018 (the alert's citation).

```rule
{"rule": "CR-CAPHOS-COMPAT", "kind": "caution", "where": [{"file": "calculator.jsx", "line": 2497, "has": "if (calc.totalTPN_mL > 0 && caPerKg > 0 && k2hpo4 > 0) alerts.push"}]}
{"case": "Ca with K₂HPO₄: caution", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 2, "10% Ca gluconate": 40, "K₂HPO₄": 1}, "expect": {"alert": "Calcium–phosphate compatibility not calculated", "level": "warn"}}
{"case": "Ca with Glycophos: none", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 2, "10% Ca gluconate": 40, "Glycophos": 2}, "expect": {"no_alert": "Calcium–phosphate compatibility not calculated"}}
```

### CR-FLUID-PLAN · prescribed fluid against the plan

When the bag has volume, or "No TPN" is ticked (`CR-U-NO-TPN`), and prescribed fluid (`CR-U-FLUID`)
differs from the target by more than 20 mL/kg/d, an info line says so; the attending decides. On a ticked
day it is left out where `CR-NO-TPN-EN` or `CR-NO-TPN-PLAN` already names the shortfall, so it is left for
feeds above the plan. The fluid tile has no hard limit.
Source: none needed; the 20 mL/kg/d margin is the code's own. On a ticked day: Vera, 2026-11-01.

```rule
{"rule": "CR-FLUID-PLAN", "kind": "caution", "where": [{"file": "calculator.jsx", "line": 2451, "has": "if ((calc.totalTPN_mL > 0 || (noTpnOn && !noTpnEnLow && !noTpnPlanLow)) && Math.abs(calc.totalFluidPerKg - fluidTargetPerKg) > 20) alerts.push"}]}
{"case": "130 against a plan of 150 (20 off): none", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 130, "Dextrose final": 10, "Amino acid": 2}, "expect": {"no_alert": "Fluid: prescribed ≠ target"}}
{"case": "129 against 150 (21 off): info", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 129, "Dextrose final": 10, "Amino acid": 2}, "expect": {"alert": "Fluid: prescribed ≠ target", "level": "info"}}
{"case": "No TPN, feeds 21.5 mL × 8 = 172 against 150: info", "side": "outside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 21.5, "Frequency": 8}, "tick": {"No TPN": true}, "expect": {"alert": "Fluid: prescribed ≠ target", "level": "info"}}
{"case": "No TPN, feeds 16.25 mL × 8 = 130 against 150: none", "side": "inside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 16.25, "Frequency": 8}, "tick": {"No TPN": true}, "expect": {"no_alert": "Fluid: prescribed ≠ target"}}
```

### CR-NO-TPN-EN · a day with no TPN lives on its feeds

With "No TPN" ticked (`CR-U-NO-TPN`), the counted feed must reach 80 mL/kg/d, or the day's fluid
requirement where that is lower: the lower bound of `CR-TGT-FLUID`, on the same tier (held at birth
weight). So DOL 1 at 1,000–1,499 g needs 70 and at 1,500–2,499 g 60, a term infant 40, 50, 60 and 60 on
DOL 1–4, and every other day and tier 80. Below it, critical: Submit asks for a reason, saved with the
order (a No TPN order prints only a short sheet, for its oral orders, the day TPN stopped or a same-day TPN order it cancels, with the reason box; `CR-U-NO-TPN`), so a day on IV fluid alone can still be ordered; the line names any Other IV. A MEN feed counts for nothing
(`CR-U-MEN`), so MEN feeds alone are always below it. 80 itself is enough (bounds inclusive, as
`CR-U-STATUS`); float noise stripped. Not checked while the tick is off (`CR-NO-TPN-TICK` holds then).
Source: Pp, 2026-11-01: "cross check ว่าคนไข้เป็น enteral fluid ล้วน มากกว่า 80ml/kg/day หรือตาม fluid
requirement ตามวัน"; asked whether a feed below it blocks Submit or asks a reason, Pp chose "Submit with a
reason" the same day; asked (Q20), she kept "หรือ" as whichever is lower and 80 itself as enough.

```rule
{"rule": "CR-NO-TPN-EN", "kind": "critical", "coded": {"NO_TPN_EN_MIN_ML_KG": 80}, "where": [{"file": "data.js", "line": 1006, "has": "const NO_TPN_EN_MIN_ML_KG = 80;"}, {"file": "data.js", "line": 1010, "has": "return Math.min(NO_TPN_EN_MIN_ML_KG, TARGETS.fluid(dol, wtG, bwG)[0]);"}, {"file": "calculator.jsx", "line": 2428, "has": "const noTpnEnLow = noTpnOn && calc.wtKg > 0 && Number(enCountedPerKg.toPrecision(12)) < noTpnEnMin;"}, {"file": "calculator.jsx", "line": 2431, "has": "if (noTpnEnLow) alerts.push({ level: \"crit\", title: `No TPN: feeds below ${D.NO_TPN_EN_MIN_ML_KG} mL/kg/d or the day's minimum`,"}]}
{"case": "DOL 10, 1 kg: 80", "fn": "noTpnEnMinPerKg", "args": [10, 1000], "want": 80}
{"case": "DOL 1, 999 g (80–100): 80", "fn": "noTpnEnMinPerKg", "args": [1, 999], "want": 80}
{"case": "DOL 1, 1,200 g (70–90): 70", "fn": "noTpnEnMinPerKg", "args": [1, 1200], "want": 70}
{"case": "DOL 1, 1,600 g (60–80): 60", "fn": "noTpnEnMinPerKg", "args": [1, 1600], "want": 60}
{"case": "DOL 2, 1,600 g (80–100): 80", "fn": "noTpnEnMinPerKg", "args": [2, 1600], "want": 80}
{"case": "DOL 1, term 3 kg (40–60): 40", "fn": "noTpnEnMinPerKg", "args": [1, 3000], "want": 40}
{"case": "DOL 2, term 3 kg (50–70): 50", "fn": "noTpnEnMinPerKg", "args": [2, 3000], "want": 50}
{"case": "DOL 3, term 3 kg (60–80): 60", "fn": "noTpnEnMinPerKg", "args": [3, 3000], "want": 60}
{"case": "DOL 4, term 3 kg (60–100): 60", "fn": "noTpnEnMinPerKg", "args": [4, 3000], "want": 60}
{"case": "DOL 5, term 3 kg (100–140): 80", "fn": "noTpnEnMinPerKg", "args": [5, 3000], "want": 80}
{"case": "DOL 1, 2,400 g now, born 2,600 g: the term tier, 40", "fn": "noTpnEnMinPerKg", "args": [1, 2400, 2600], "want": 40}
{"case": "1 kg, DOL 10: breast milk 10 mL × 8 = 80 mL/kg/d reaches it", "side": "inside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 10, "Frequency": 8}, "tick": {"No TPN": true}, "expect": {"no_alert": "No TPN: feeds below 80 mL/kg/d or the day's minimum", "submit": "no_reason"}}
{"case": "9.9 mL × 8 = 79.2 mL/kg/d: critical, a reason asked (saved with the order; a No TPN order is not printed)", "side": "outside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 9.9, "Frequency": 8}, "tick": {"No TPN": true}, "expect": {"alert": "No TPN: feeds below 80 mL/kg/d or the day's minimum", "level": "crit", "submit": "asks_reason", "shows": "No TPN แต่นมที่นับได้ 79 mL/kg/d ต่ำกว่า 80 mL/kg/d (เกณฑ์ 80 mL/kg/d)"}}
{"case": "term 3 kg, DOL 1: 15 mL × 8 = 40 mL/kg/d reaches the day's 40–60", "side": "inside", "infant": {"g": 3000, "dol": 1}, "fluid": 50, "order": {"Volume(mL/feed)": 15, "Frequency": 8}, "tick": {"No TPN": true}, "expect": {"no_alert": "No TPN: feeds below 80 mL/kg/d or the day's minimum", "submit": "no_reason"}}
{"case": "term 3 kg, DOL 1: 14.9 mL × 8 = 39.7 mL/kg/d: critical, named against the day's requirement", "side": "outside", "infant": {"g": 3000, "dol": 1}, "fluid": 50, "order": {"Volume(mL/feed)": 14.9, "Frequency": 8}, "tick": {"No TPN": true}, "expect": {"alert": "No TPN: feeds below 80 mL/kg/d or the day's minimum", "level": "crit", "shows": "(fluid requirement DOL 1 40–60 mL/kg/d)"}}
{"case": "12 mL × 8 ticked MEN: counts as 0, critical", "side": "outside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 12, "Frequency": 8}, "tick": {"MEN (trophic)": true, "No TPN": true}, "expect": {"alert": "No TPN: feeds below 80 mL/kg/d or the day's minimum", "level": "crit", "shows": "No TPN แต่นมที่นับได้ 0 mL/kg/d ต่ำกว่า 80 mL/kg/d (เกณฑ์ 80 mL/kg/d) · นม MEN ไม่นับ"}}
{"case": "IV fluid alone, Other IV 60 mL with feeds 5 mL × 8: critical, ordered with a reason, the line names the IV", "side": "outside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 5, "Frequency": 8, "Other IV": 60}, "tick": {"No TPN": true}, "expect": {"alert": "No TPN: feeds below 80 mL/kg/d or the day's minimum", "level": "crit", "submit": "asks_reason", "shows": "No TPN แต่นมที่นับได้ 40 mL/kg/d ต่ำกว่า 80 mL/kg/d (เกณฑ์ 80 mL/kg/d) · Other IV 60 mL/kg/d — ตรวจว่าหยุด TPN ได้แล้ว"}}
{"case": "the tick off, no feed and no bag: not checked here (CR-NO-TPN-TICK holds)", "side": "inside", "infant": {"g": 1000}, "expect": {"no_alert": "No TPN: feeds below 80 mL/kg/d or the day's minimum"}}
```

### CR-NO-TPN-TICK · an order with no TPN must say so

An order with neither a bag (volume or any bag ingredient) nor lipid cannot be submitted until "No TPN"
is ticked in Step 3 (`CR-U-NO-TPN`), so its feeds are always cross-checked (`CR-NO-TPN-EN`); a draft can
be kept. A lipid-only order is TPN and needs no tick. Center Point offers no tick (its packet is a TPN
order) and is not checked; the quick calc submits nothing.
Source: Pp, 2026-11-01: "ถ้าติ๊กช่องนี้และผ่าน cross check จะสามารถ submit ได้โดยไม่ต้องมี TPN", then,
asked about an order with no TPN left unticked, "Block until ticked". Not a clinical threshold.

```rule
{"rule": "CR-NO-TPN-TICK", "kind": "stop", "where": [{"file": "calculator.jsx", "line": 2300, "has": "const noTpnUnticked = !noTpnOn && !centerPoint && !scratch && !bagOrdered && !(lipidPerKg > 0);"}]}
{"case": "feeds only, 10 mL × 8, the tick off: refused", "side": "outside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 10, "Frequency": 8}, "expect": {"submit": "blocked", "shows": "คำสั่งนี้ไม่มี TPN — ติ๊ก \"No TPN\" ที่ Step 3 ก่อน Submit"}}
{"case": "nothing ordered at all, the tick off: refused", "side": "outside", "infant": {"g": 1000}, "expect": {"submit": "blocked"}}
{"case": "the same feeds with the tick on: saves", "side": "inside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 10, "Frequency": 8}, "tick": {"No TPN": true}, "expect": {"submit": "no_reason", "hides": "คำสั่งนี้ไม่มี TPN"}}
{"case": "lipid alone is TPN: no tick needed", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"20% lipid": 2, "Volume(mL/feed)": 10, "Frequency": 8}, "expect": {"hides": "คำสั่งนี้ไม่มี TPN"}}
{"case": "a bag: no tick needed", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3}, "expect": {"submit": "no_reason", "hides": "คำสั่งนี้ไม่มี TPN"}}
```

### CR-NO-TPN-PLAN · a day with no TPN far below its fluid plan

With "No TPN" ticked, a counted feed more than 20 mL/kg/d below Step 1's fluid plan is amber, in case the
TPN was forgotten; the order still saves. 20 below exactly is not. Quiet while `CR-NO-TPN-EN`'s red line
holds (feeds under 80, or under the day's requirement), so one shortfall is not said twice, and with no
plan (0). A MEN feed counts for nothing. Where it holds, `CR-FLUID-PLAN`'s info line is not added.
Source: Pp, 2026-11-01: "ถ้ามีฟูอิดแพลน แล้ว มากกว่าเอนเทอรัลเยอะๆ ให้alarmด้วย อ่า เผื่อลืมสั่ง ทีพีเอ็น"; asked,
she chose more than 20 mL/kg/d (the margin `CR-FLUID-PLAN` uses) and amber.

```rule
{"rule": "CR-NO-TPN-PLAN", "kind": "caution", "coded": {"NO_TPN_PLAN_GAP_ML_KG": 20}, "where": [{"file": "data.js", "line": 1017, "has": "const NO_TPN_PLAN_GAP_ML_KG = 20;"}, {"file": "calculator.jsx", "line": 2443, "has": "&& Number(noTpnPlanGap.toPrecision(12)) > D.NO_TPN_PLAN_GAP_ML_KG;"}]}
{"case": "plan 150, feeds 16.25 mL × 8 = 130 (20 below): none", "side": "inside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 16.25, "Frequency": 8}, "tick": {"No TPN": true}, "expect": {"no_alert": "No TPN: feeds well below the fluid plan", "submit": "no_reason"}}
{"case": "plan 150, feeds 16.1 mL × 8 = 128.8 (21.2 below): amber, still saves", "side": "outside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 16.1, "Frequency": 8}, "tick": {"No TPN": true}, "expect": {"alert": "No TPN: feeds well below the fluid plan", "level": "warn", "no_alert": "Fluid: prescribed ≠ target", "submit": "no_reason", "shows": "No TPN · plan 150 mL/kg/d แต่นมที่นับได้ 129 mL/kg/d (ขาด 21 mL/kg/d) — ลืมสั่ง TPN หรือเปล่า?"}}
{"case": "plan 150, feeds 16.2 mL × 8 = 129.6: the shortfall reads 20.4, not 20", "side": "outside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 16.2, "Frequency": 8}, "tick": {"No TPN": true}, "expect": {"alert": "No TPN: feeds well below the fluid plan", "shows": "แต่นมที่นับได้ 129.6 mL/kg/d (ขาด 20.4 mL/kg/d)"}}
{"case": "plan 150, feeds 10 mL × 8 = 80: amber (80 reaches CR-NO-TPN-EN)", "side": "outside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 10, "Frequency": 8}, "tick": {"No TPN": true}, "expect": {"alert": "No TPN: feeds well below the fluid plan", "level": "warn", "no_alert": ["No TPN: feeds below 80 mL/kg/d or the day's minimum", "Fluid: prescribed ≠ target"]}}
{"case": "plan 150, feeds 9.9 mL × 8 = 79.2: the red line alone", "side": "inside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 9.9, "Frequency": 8}, "tick": {"No TPN": true}, "expect": {"alert": "No TPN: feeds below 80 mL/kg/d or the day's minimum", "level": "crit", "no_alert": ["No TPN: feeds well below the fluid plan", "Fluid: prescribed ≠ target"]}}
{"case": "plan 100, feeds 10 mL × 8 = 80 (20 below): none", "side": "inside", "infant": {"g": 1000}, "fluid": 100, "order": {"Volume(mL/feed)": 10, "Frequency": 8}, "tick": {"No TPN": true}, "expect": {"no_alert": "No TPN: feeds well below the fluid plan", "submit": "no_reason"}}
{"case": "the tick off with a bag: not checked", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 50, "Dextrose final": 10, "Amino acid": 2, "Volume(mL/feed)": 5, "Frequency": 8}, "expect": {"no_alert": "No TPN: feeds well below the fluid plan"}}
```

## Caps that change the dose

### CR-SOLUVIT-CAP · Soluvit N

1 mL/kg/d to the infant, at most 10 mL/day, then × the overfill so the infant receives it; rounded to
1 decimal. With no TPN volume, 0. The 10 mL cap needs more than 10 kg, above the 8 kg weight limit, so
no orderable infant reaches it; the cap is `D.vitaminMlPerDay` and is tested as a function. Since 2026-11-06 the
Calculator shows the dose (1 mL/kg/day), not the mL (Pp: "Hide them all"); the order prints the mL.
Source: the KCMH worksheet, row 43 (1 mL/kg, max 10); Soluvit N datasheet (Medsafe, 2021) §4.2: under
10 kg 1 mL/kg, from 10 kg one 10 mL vial; Thai CPG PDF p. 116. The overfill is Pp's, 2026-09-18 (the sheet
uses actual weight).

```rule
{"rule": "CR-SOLUVIT-CAP", "kind": "cap", "coded": {"KCMH_STOCK.soluvit.mlPerKg": 1, "KCMH_STOCK.soluvit.maxMl": 10}, "where": [{"file": "data.js", "line": 908, "has": "mlPerKg: 1.0, maxMl: 10 },"}, {"file": "data.js", "line": 2609, "has": "return Math.min(s.mlPerKg * wtKg, s.maxMl);"}, {"file": "calculator.jsx", "line": 1835, "has": "roundMl(D.vitaminMlPerDay(\"soluvit\",   wtKg) * overfill)"}]}
{"case": "1 kg, 100 + 30 mL: 1.3 mL in the bag", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3}, "expect": {"prints": "Soluvit N1.3 mL/day", "hides": "Soluvit N (water-sol.)1.3"}}
{"case": "8 kg, no dead space: 8 mL", "side": "inside", "infant": {"g": 8000}, "route": "Central", "fluid": 120, "order": {"Volume(mL/day)": 800, "ปริมาตรคาสาย (dead space)": 0, "Dextrose final": 10, "Amino acid": 3}, "expect": {"prints": "Soluvit N8 mL/day"}}
{"case": "10 kg (refused by CR-WT-RANGE): 10 mL, the cap itself", "side": "inside", "fn": "vitaminMlPerDay", "args": ["soluvit", 10], "want": 10}
{"case": "11 kg (refused by CR-WT-RANGE): capped at 10 mL", "side": "outside", "fn": "vitaminMlPerDay", "args": ["soluvit", 11], "want": 10}
```

### CR-PEDITRACE-CAP · Peditrace

1 mL/kg/d, at most 15 mL/day, × the overfill, 1 decimal; 0 with no TPN volume. Its zinc counts toward
`CR-ZN-MAX` at the mL delivered. The 15 mL cap is out of reach of an orderable weight, as for Soluvit, and is
tested the same way (`D.vitaminMlPerDay`).
Source: the KCMH worksheet, row 45 (1 mL/kg, max 15); Peditrace SmPC (HPRA, 2019) §4.2: 1 mL/kg/d "to a
maximum daily dose of 15 ml"; Thai CPG PDF p. 116. Zn 250 µg/mL, pharmacy, 2026-10-25.

```rule
{"rule": "CR-PEDITRACE-CAP", "kind": "cap", "coded": {"KCMH_STOCK.peditrace.mlPerKg": 1, "KCMH_STOCK.peditrace.maxMl": 15}, "where": [{"file": "data.js", "line": 910, "has": "mlPerKg: 1.0, maxMl: 15, znMgPerMl: 0.25 },"}, {"file": "data.js", "line": 2607, "has": "function vitaminMlPerDay(stockKey, wtKg) {"}, {"file": "calculator.jsx", "line": 1836, "has": "roundMl(D.vitaminMlPerDay(\"peditrace\", wtKg) * overfill)"}]}
{"case": "8 kg, no dead space: 8 mL", "side": "inside", "infant": {"g": 8000}, "route": "Central", "fluid": 120, "order": {"Volume(mL/day)": 800, "ปริมาตรคาสาย (dead space)": 0, "Dextrose final": 10, "Amino acid": 3}, "expect": {"prints": "Peditrace (Zn 250 µg/mL)8 mL/day"}}
{"case": "15 kg (refused by CR-WT-RANGE): 15 mL, the cap itself", "side": "inside", "fn": "vitaminMlPerDay", "args": ["peditrace", 15], "want": 15}
{"case": "16 kg (refused by CR-WT-RANGE): capped at 15 mL", "side": "outside", "fn": "vitaminMlPerDay", "args": ["peditrace", 16], "want": 15}
```

### CR-VITALIPID-CAP · Vitalipid N Infant

4 mL/kg/d, at most 10 mL/day, only when lipid is ordered (it rides in the lipid syringe; no overfill),
rounded **down** to a whole mL, as the ward gives it (TPN team, 2026-10-28: "ทำให้ในระบบและทำจริงเหมือนกัน >
ปัดลง"), and never below 1 mL when lipid is ordered (Pp, 2026-10-28, answering Q19 after Vera: under
500 g the floor alone gave 1 mL or none). It counts toward prescribed fluid. The 4 and the 10 are literals
in `calculator.jsx`, not `data.js`. Rounding down keeps most small infants under the label's 4 mL/kg: 490 g
gets 1 mL (2 mL/kg), 740 g gets 2 mL (2.7 mL/kg). Below 250 g the 1 mL floor goes over the label, by Pp's
choice: 240 g gets 4.2 mL/kg/d and 200 g gets 5 mL/kg/d (Vera, second review of 2026-10-28).
Source: Vitalipid N Infant SmPC (HPRA, 2022) §4.2: 4 mL/kg/d up to 2.5 kg, 10 mL/day above it; the
Singapore label: "must not exceed 10 ml"; Thai CPG PDF p. 116. Both labels say to add it only to Intralipid
10 % or 20 %, and KCMH gives SMOF 20 %: Q4.

```rule
{"rule": "CR-VITALIPID-CAP", "kind": "cap", "where": [{"file": "calculator.jsx", "line": 1715, "has": "const vitalipidVol = lipidPerKg > 0 ? Math.max(1, Math.floor(Math.min(4 * wtKg, 10) + 1e-9)) : 0;"}]}
{"case": "2.4 kg: 9.6 mL rounds down to 9", "side": "inside", "infant": {"g": 2400}, "route": "Central", "order": {"Volume(mL/day)": 300, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 2}, "expect": {"shows": "Vitalipid N Infant (fat-sol.)9mL/day"}}
{"case": "850 g: 3.4 mL rounds down to 3, and prints 3", "side": "inside", "infant": {"g": 850}, "route": "Central", "order": {"Volume(mL/day)": 120, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 2}, "expect": {"shows": "Vitalipid N Infant (fat-sol.)3mL/day", "prints": "Vitalipid N infant = 3 mL"}}
{"case": "750 g: 4 × 0.75 is exactly 3, not 2", "side": "inside", "infant": {"g": 750}, "route": "Central", "order": {"Volume(mL/day)": 110, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 2}, "expect": {"shows": "Vitalipid N Infant (fat-sol.)3mL/day"}}
{"case": "490 g: 1.96 mL rounds down to 1", "side": "inside", "infant": {"g": 490}, "route": "Central", "order": {"Volume(mL/day)": 70, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 1}, "expect": {"shows": "Vitalipid N Infant (fat-sol.)1mL/day"}}
{"case": "240 g: 0.96 mL would round to none; at least 1 mL", "side": "outside", "infant": {"g": 240}, "route": "Central", "order": {"Volume(mL/day)": 35, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 1}, "expect": {"shows": "Vitalipid N Infant (fat-sol.)1mL/day", "prints": "Vitalipid N infant = 1 mL"}}
{"case": "200 g: 0.8 mL; the 1 mL floor is 5 mL/kg/d, above the label", "side": "outside", "infant": {"g": 200}, "route": "Central", "order": {"Volume(mL/day)": 30, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 1}, "expect": {"shows": "Vitalipid N Infant (fat-sol.)1mL/day", "prints": "Vitalipid N infant = 1 mL"}}
{"case": "3 kg: capped at 10 mL", "side": "outside", "infant": {"g": 3000}, "route": "Central", "order": {"Volume(mL/day)": 300, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 2}, "expect": {"shows": "Vitalipid N Infant (fat-sol.)10mL/day"}}
{"case": "no lipid: none", "side": "inside", "infant": {"g": 3000}, "route": "Central", "order": {"Volume(mL/day)": 300, "Dextrose final": 10, "Amino acid": 3}, "expect": {"shows": "Vitalipid N Infant (fat-sol.)0mL/day"}}
```

## Target bands (amber)

Which table a tile reads: when the counted feed is at least 100 mL/kg/d, `ENTERAL_TARGETS`; below that,
`TPN_TARGETS` (`CR-U-SWITCH`). Fluid, GIR, Mg and Ca:P read `TARGETS` on either side. `rangeStatus`
grades every tile (`CR-U-STATUS`). Each case below sits on the last day or weight of a band and the first
of the next.

### CR-TGT-FLUID · fluid by day and weight tier

mL/kg/d by DOL (DOL 7 rules from then on) and tier: < 1,000, < 1,500, < 2,500 g and term. From DOL 6
every preterm tier is 140–160. The tier is held at birth weight while the infant is below it.
Source: ESPGHAN 2018, Jochum Tables 1–3; the TPN team asked to follow the source on 2026-10-25. The
birth-weight floor is Pp's, 2026-09-24.

```rule
{"rule": "CR-TGT-FLUID", "kind": "target", "where": [{"file": "data.js", "line": 771, "has": "fluid: (dol, wtG, bwG) => {"}, {"file": "calculator.jsx", "line": 2030, "has": "const tFluid = D.TARGETS.fluid(dol, wtG, patient?.bw);"}]}
{"case": "999 g, DOL 1: ELBW 80–100", "side": "inside", "fn": "TARGETS.fluid", "args": [1, 999], "want": [80, 100]}
{"case": "1,000 g, DOL 1: VLBW 70–90", "side": "outside", "fn": "TARGETS.fluid", "args": [1, 1000], "want": [70, 90]}
{"case": "900 g, DOL 5: 160–180", "side": "inside", "fn": "TARGETS.fluid", "args": [5, 900], "want": [160, 180]}
{"case": "900 g, DOL 6: 140–160", "side": "outside", "fn": "TARGETS.fluid", "args": [6, 900], "want": [140, 160]}
{"case": "2,499 g, DOL 1: preterm 60–80", "side": "inside", "fn": "TARGETS.fluid", "args": [1, 2499], "want": [60, 80]}
{"case": "2,500 g, DOL 1: term 40–60", "side": "outside", "fn": "TARGETS.fluid", "args": [1, 2500], "want": [40, 60]}
{"case": "1,100 g now, born 1,600 g, DOL 5: held at the birth-weight tier", "side": "inside", "fn": "TARGETS.fluid", "args": [5, 1100, 1600], "want": [140, 160]}
```

### CR-TGT-PROTEIN · protein band

PN: DOL 1 1.5–2.5, DOL 2 on 2.5–3.5 g/kg/d. Enteral: 3.5–4.0. The ceiling is `CR-PROTEIN-MAX`.
Source: ESPGHAN 2018, van Goudoever R 3.1 (day 1 at least 1.5) and R 3.2 (from day 2 2.5–3.5); the DOL-1
cap of 2.5 is the Thai CPG's Table 2.1 (PDF p. 32), not ESPGHAN's. Day-1 starts in Avery Table 60.1 (2–3,
ch 60 p. 2) and Fanaroff ch 42 (2.5–3.0) show amber; term infants have their own cap, R 3.4: 3.0, not
coded: Q14. Enteral: Embleton R1 and Table 1.

```rule
{"rule": "CR-TGT-PROTEIN", "kind": "target", "where": [{"file": "data.js", "line": 637, "has": "if (dol <= 1) return [1.5, 2.5];   // Day 1: start ≥1.5"}, {"file": "data.js", "line": 733, "has": "protein: () => [3.5, 4.0],"}]}
{"case": "PN DOL 1", "side": "inside", "fn": "TPN_TARGETS.protein", "args": [1], "want": [1.5, 2.5]}
{"case": "PN DOL 2", "side": "outside", "fn": "TPN_TARGETS.protein", "args": [2], "want": [2.5, 3.5]}
{"case": "enteral", "fn": "ENTERAL_TARGETS.protein", "args": [], "want": [3.5, 4]}
```

### CR-TGT-KCAL · energy band

PN: DOL 1–2 45–55, DOL 3–7 70–100, DOL 8 on 90–120 kcal/kg/d. Enteral 115–140. Ceiling `CR-KCAL-MAX`.
Source: ESPGHAN 2018, Joosten R 2.4 (day 1 at least 45–55, a floor for day 1 only) and R 2.6 (VLBW
90–120); Moltu 2021 Table 2 (p. 283): preterm PN 40–55, 60–80, 90–120 by phase. DOL 3–7 at 70–100 is the
unit's own: Moltu gives 60–80 and Avery Table 60.1 60–80 by weight (ch 60 p. 2–3); the TPN team kept 70–100
on 2026-10-25. Term infants' own rows (Joosten Table 2) are not coded: Q13. Enteral: Embleton R1, 115–140.

```rule
{"rule": "CR-TGT-KCAL", "kind": "target", "where": [{"file": "data.js", "line": 648, "has": "if (dol <= 7) return [70, 100];    // Intermediate"}, {"file": "data.js", "line": 736, "has": "kcal: () => [115, 140],"}]}
{"case": "PN DOL 2", "side": "inside", "fn": "TPN_TARGETS.kcal", "args": [2], "want": [45, 55]}
{"case": "PN DOL 3", "side": "outside", "fn": "TPN_TARGETS.kcal", "args": [3], "want": [70, 100]}
{"case": "PN DOL 7", "side": "inside", "fn": "TPN_TARGETS.kcal", "args": [7], "want": [70, 100]}
{"case": "PN DOL 8", "side": "outside", "fn": "TPN_TARGETS.kcal", "args": [8], "want": [90, 120]}
{"case": "enteral", "fn": "ENTERAL_TARGETS.kcal", "args": [], "want": [115, 140]}
```

### CR-TGT-LIPID · lipid band

PN: DOL 1 0.5–1.0, DOL 2 on 1.0–4.0 g/kg/d. Enteral fat 4.8–8.1. The IV ceiling is `CR-LIPID-IV-MAX`.
Source: ESPGHAN 2018, Lapillonne R 4.2–4.3: start from birth, at most 4. No source gives 0.5–1.0 as a
day-1 dose: Koletzko 2005's 0.5–1 is a daily step, Avery ch 60 p. 8 starts at 2 and Fanaroff ch 42 p. 10 at
3: Q15. Enteral: Embleton Table 1.

```rule
{"rule": "CR-TGT-LIPID", "kind": "target", "where": [{"file": "data.js", "line": 655, "has": "if (dol <= 1) return [0.5, 1.0];  // Day 1: start 0.5–1 g/kg"}, {"file": "data.js", "line": 739, "has": "lipid: () => [4.8, 8.1],"}]}
{"case": "PN DOL 1", "side": "inside", "fn": "TPN_TARGETS.lipid", "args": [1], "want": [0.5, 1]}
{"case": "PN DOL 2", "side": "outside", "fn": "TPN_TARGETS.lipid", "args": [2], "want": [1, 4]}
{"case": "enteral", "fn": "ENTERAL_TARGETS.lipid", "args": [], "want": [4.8, 8.1]}
```

### CR-TGT-NA · sodium band

PN, mEq/kg/d: DOL 1–2 0–2; DOL 3 0–5 below 1,500 g, 0–3 at or above; DOL 4–7 2–5; DOL 8 on 2–5. The weight
group uses the fluid tier's weight (held at birth weight). Enteral 3.0–5.0.
Source: Jochum Tables 1–3, preterm rows (TPN team, 2026-10-25); Thai CPG PDF p. 56–57 repeats them. From
DOL 8 Jochum gives preterm 3–5 and term 2–3; NeoFeed keeps 2–5 for everyone until the term rows are
decided: Q5. Enteral: Embleton Table 1.

```rule
{"rule": "CR-TGT-NA", "kind": "target", "where": [{"file": "data.js", "line": 666, "has": "na: (dol, wtG, bwG) => {"}, {"file": "data.js", "line": 742, "has": "na: () => [3.0, 5.0],"}]}
{"case": "DOL 2", "side": "inside", "fn": "TPN_TARGETS.na", "args": [2, 1200], "want": [0, 2]}
{"case": "DOL 3, 1,499 g", "side": "outside", "fn": "TPN_TARGETS.na", "args": [3, 1499], "want": [0, 5]}
{"case": "DOL 3, 1,500 g", "side": "outside", "fn": "TPN_TARGETS.na", "args": [3, 1500], "want": [0, 3]}
{"case": "DOL 3, 1,400 g now, born 1,600 g: the 1,500 g row", "side": "inside", "fn": "TPN_TARGETS.na", "args": [3, 1400, 1600], "want": [0, 3]}
{"case": "DOL 4", "side": "outside", "fn": "TPN_TARGETS.na", "args": [4, 1200], "want": [2, 5]}
{"case": "DOL 8", "side": "inside", "fn": "TPN_TARGETS.na", "args": [8, 1200], "want": [2, 5]}
{"case": "enteral", "fn": "ENTERAL_TARGETS.na", "args": [], "want": [3, 5]}
```

### CR-TGT-K · potassium band

PN, mEq/kg/d: DOL 1–3 0–3; DOL 4–5 2–3; DOL 6–7 1–3; DOL 8 on 2–5 below 1,500 g, 2–3 at or above.
Enteral 2.3–4.6. The IV ceiling is `CR-K-IV-MAX`.
Source: Jochum 2018 Tables 1–3, preterm rows (TPN team, 2026-10-25). At or above 1,500 g from DOL 8 Jochum
gives preterm 1–3 and term 1.5–3; NeoFeed keeps 2–3, inside both, until the term rows are decided: Q5.

```rule
{"rule": "CR-TGT-K", "kind": "target", "where": [{"file": "data.js", "line": 675, "has": "k: (dol, wtG, bwG) => {"}, {"file": "data.js", "line": 745, "has": "k: () => [2.3, 4.6],"}]}
{"case": "DOL 3", "side": "inside", "fn": "TPN_TARGETS.k", "args": [3, 1200], "want": [0, 3]}
{"case": "DOL 4", "side": "outside", "fn": "TPN_TARGETS.k", "args": [4, 1200], "want": [2, 3]}
{"case": "DOL 6", "side": "outside", "fn": "TPN_TARGETS.k", "args": [6, 1200], "want": [1, 3]}
{"case": "DOL 8, 1,499 g", "side": "inside", "fn": "TPN_TARGETS.k", "args": [8, 1499], "want": [2, 5]}
{"case": "DOL 8, 1,500 g", "side": "outside", "fn": "TPN_TARGETS.k", "args": [8, 1500], "want": [2, 3]}
{"case": "enteral", "fn": "ENTERAL_TARGETS.k", "args": [], "want": [2.3, 4.6]}
```

### CR-TGT-CA · calcium band

Elemental mg/kg/d. PN: DOL 1–7 32–80, DOL 8 on 64–140. Enteral 120–200.
Source: ESPGHAN 2018, Mihatsch: first days 0.8–2.0 mmol/kg, growing 1.6–3.5 mmol/kg,
× 40. Mihatsch does not say when "the first days" end; the TPN team set DOL 7 (2026-10-25). Enteral:
ESPGHAN 2022, 3.0–5.0 mmol/kg.

```rule
{"rule": "CR-TGT-CA", "kind": "target", "coded": {"FIRST_DAYS_LAST_DOL": 7}, "where": [{"file": "data.js", "line": 619, "has": "const FIRST_DAYS_LAST_DOL = 7;"}, {"file": "data.js", "line": 835, "has": "if (isEnteral) return [120, 200];"}]}
{"case": "PN DOL 7", "side": "inside", "fn": "TPN_TARGETS.ca", "args": [7], "want": [32, 80]}
{"case": "PN DOL 8", "side": "outside", "fn": "TPN_TARGETS.ca", "args": [8], "want": [64, 140]}
{"case": "enteral", "fn": "TARGETS.ca", "args": [8, true], "want": [120, 200]}
```

### CR-TGT-P · phosphorus band

mg/kg/d. PN: DOL 1–7 31–62, DOL 8 on 50–108. Enteral 70–115.
Source: Mihatsch 2018: first days 1.0–2.0 mmol/kg, growing premature 1.6–3.5 mmol/kg, × 31 (corrected from
46–62 on 2026-08-27). Enteral: ESPGHAN 2022, 2.2–3.7 mmol/kg.

```rule
{"rule": "CR-TGT-P", "kind": "target", "where": [{"file": "data.js", "line": 700, "has": "return [50, 108];                          // Growing: 1.6–3.5 mmol×31"}, {"file": "data.js", "line": 843, "has": "if (isEnteral) return [70, 115];"}]}
{"case": "PN DOL 7", "side": "inside", "fn": "TPN_TARGETS.p", "args": [7], "want": [31, 62]}
{"case": "PN DOL 8", "side": "outside", "fn": "TPN_TARGETS.p", "args": [8], "want": [50, 108]}
{"case": "enteral", "fn": "TARGETS.p", "args": [8, true], "want": [70, 115]}
```

### CR-TGT-MG · magnesium band

Elemental mg/kg/d: DOL 1–7 2.5–5, DOL 8 on 5–7.5. Parenteral only; feeds carry no Mg in `EN_DB`. Graded
on the dose in mg to 2 decimals, the figure the box shows. Until 2026-10-28 it was 0.2–0.4 / 0.4–0.6 mEq;
an order of 0.2 mEq (2.43 mg) now reads just under the first-days band. Below 1 mg/kg/d the line is
critical instead (`CR-MG-MEQ-HABIT`).
Source: Mihatsch 2018, the mg column: first days 0.1–0.2 mmol/kg (2.5–5 mg), growing 0.2–0.3 mmol/kg
(5–7.5 mg). TPN team, 2026-09-28 and 2026-10-28: Mg in mg/kg/d; Pp, 2026-10-28: the guideline's round mg
figures, chips 2.5 / 5 / 7.5.

```rule
{"rule": "CR-TGT-MG", "kind": "target", "where": [{"file": "data.js", "line": 849, "has": "mg: (dol) => TPN_TARGETS.mg(dol),"}, {"file": "calculator.jsx", "line": 2056, "has": "const tMg = D.TARGETS.mg(dol);"}]}
{"case": "DOL 7", "side": "inside", "fn": "TARGETS.mg", "args": [7], "want": [2.5, 5]}
{"case": "DOL 8", "side": "outside", "fn": "TARGETS.mg", "args": [8], "want": [5, 7.5]}
```

### CR-TGT-CAP · Ca:P mass ratio

Mass ratio 1.0–1.7 on bag + counted feed (with an oral supplement ordered, on the total with oral).
Ca with no P is `CR-CAP-NO-P`. No float-noise strip: Ca 52.7 mg/kg with P 31 mg/kg is 1.7 on paper,
computes as 1.7000000000000002 and grades High beside a printed "1.7:1" and a range "1–1.7": Q6.
Source: the code's comment says ESPGHAN 2018 molar 0.8–1.3, × 40/31 → mass 1.0–1.7, with the KCMH order
form aiming at 1.7:1. Mihatsch says otherwise: R 8.12 gives molar 0.8–1.0 in early PN, and 1.3 (1.7 by
mass) is the optimum in stable growth, not the top of a range. Thai CPG PDF p. 61: early preterm PN 1–1.3
by mass, 1.7 later; Avery ch 60 p. 6: 1.7:1 by weight likely optimal. The team kept 1.0–1.7 as the unit's
own (2026-10-25): Q7.

```rule
{"rule": "CR-TGT-CAP", "kind": "target", "where": [{"file": "data.js", "line": 853, "has": "caP: () => [1.0, 1.7],   // mass ratio; ESPGHAN molar"}, {"file": "calculator.jsx", "line": 2096, "has": "const sCaP = D.rangeStatus(calc.caP, tCaP);"}]}
{"case": "Ca 52.6 / P 31 = 1.697: in range", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 2, "10% Ca gluconate": 52.6, "Glycophos": 2}, "expect": {"no_alert": "Ca:P ratio off target"}}
{"case": "Ca 53 / P 31 = 1.71: amber", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 2, "10% Ca gluconate": 53, "Glycophos": 2}, "expect": {"alert": "Ca:P ratio off target", "level": "warn"}}
{"case": "Ca 52.7 / P 31 = 1.7 on paper: graded amber (Q7)", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 2, "10% Ca gluconate": 52.7, "Glycophos": 2}, "expect": {"alert": "Ca:P ratio off target", "shows": "Ca:P ratioHigh1.7:1 (mass)"}}
{"case": "Ca 31 / P 31 = 1.0: in range", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 2, "10% Ca gluconate": 31, "Glycophos": 2}, "expect": {"no_alert": "Ca:P ratio off target"}}
{"case": "Ca 30 / P 31 = 0.97: amber", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 2, "10% Ca gluconate": 30, "Glycophos": 2}, "expect": {"alert": "Ca:P ratio off target"}}
```

### CR-TGT-PE · protein : energy

2.8–3.6 g protein per 100 kcal. The tile and its alert show only on the enteral targets (`CR-U-SWITCH`):
a counted feed at or above `FULL_EN_ML_KG` (100) mL/kg/d, never a MEN feed. Until 2026-11-10 they needed
the feed above 100, so at exactly 100 the tiles were enteral and P:E was missing; Pp, 2026-11-10: "≥ 100
เหมือนกันหมด".
Source: ESPGHAN 2022, Embleton Table 1.

```rule
{"rule": "CR-TGT-PE", "kind": "target", "where": [{"file": "calculator.jsx", "line": 2412, "has": "if (calc.useEnteralTargets && sPE === \"warn\") alerts.push"}, {"file": "calculator.jsx", "line": 2066, "has": "const tPE  = D.TARGETS.peRatio();"}]}
{"case": "Hi-Q LBW 24 at 152 mL/kg/d (3.3 g/100 kcal): in range", "side": "inside", "infant": {"g": 1000}, "fluid": 160, "feed": "FBM_PF_24", "order": {"Volume(mL/feed)": 19, "Frequency": 8}, "expect": {"no_alert": "Protein : Energy off target"}}
{"case": "breast milk at 152 mL/kg/d (1.8 g/100 kcal): amber", "side": "outside", "infant": {"g": 1000}, "fluid": 160, "order": {"Volume(mL/feed)": 19, "Frequency": 8}, "expect": {"alert": "Protein : Energy off target", "level": "warn"}}
{"case": "breast milk 12.5 mL × 8 = 100 mL/kg/d, the switch itself: amber", "side": "outside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 12.5, "Frequency": 8}, "expect": {"alert": "Protein : Energy off target", "level": "warn"}}
{"case": "12.4 mL × 8 = 99.2 mL/kg/d, parenteral targets: no P:E tile or alert", "side": "inside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 12.4, "Frequency": 8}, "expect": {"no_alert": "Protein : Energy off target", "hides": "Protein : Energy"}}
```

## Units and conventions

### CR-U-DOSING-WEIGHT · the weight every dose is computed from

Every per-kg figure is per day on the TPN calc. weight: today's weight, held at birth weight while the
infant is below it, unless the attending types another (`CR-WT-MANUAL`, `CR-WT-RANGE`). kg = g ÷ 1,000.
Source: KCMH bedside convention (the code's comment); typed override since 2026-09-15.

```rule
{"rule": "CR-U-DOSING-WEIGHT", "kind": "unit", "where": [{"file": "calculator.jsx", "line": 850, "has": "const autoWtG = (bwG > 0 && curWtG > 0 && curWtG < bwG) ? bwG : curWtG;"}, {"file": "calculator.jsx", "line": 851, "has": "const wtG = tpnWtOverrideG > 0 ? tpnWtOverrideG : autoWtG;"}]}
{"case": "900 g, born 1,000 g: doses on 1,000 g (GIR 6.9, not 7.7)", "infant": {"g": 900, "bw": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3}, "expect": {"shows": ["= birth weight (not yet regained)", "GIR6.9mg/kg/min"]}}
{"case": "1,100 g, born 1,000 g: doses on 1,100 g (GIR 6.3)", "infant": {"g": 1100, "bw": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3}, "expect": {"shows": "GIR6.3mg/kg/min"}}
```

### CR-U-FLUID · prescribed fluid

mL/kg/d. Prescribed = TPN delivered + the lipid syringe (20 % lipid at 0.2 g/mL + Vitalipid) + other IV
+ drug volume + counted feed. The dead space is not given to the infant and is not counted. A MEN feed
is not counted (`CR-U-MEN`).
Source: NeoFeed's own Step 1 fluid plan, not a guideline.

```rule
{"rule": "CR-U-FLUID", "kind": "unit", "coded": {"KCMH_STOCK.smof20.gPerMl": 0.2}, "where": [{"file": "calculator.jsx", "line": 1774, "has": "const prescribedFluid = totalTPN_mL + lipidBagVol + otherIV_mL + drug_mL + enCounted;"}, {"file": "calculator.jsx", "line": 1702, "has": "const lipidVol = lipidG / 0.20;"}]}
{"case": "1 kg: TPN 100 + lipid 5 + Vitalipid 4 + feed 24 = 133", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 1, "Volume(mL/feed)": 3, "Frequency": 8}, "expect": {"shows": "Plan 150 · Prescribed 133 mL/d"}}
{"case": "the same feed ticked MEN: 109", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 1, "Volume(mL/feed)": 3, "Frequency": 8}, "tick": {"MEN (trophic)": true}, "expect": {"shows": "Plan 150 · Prescribed 109 mL/d"}}
```

### CR-U-FACTOR · delivered, prepared and the Factor

The TPN volume is what the pump delivers in 24 h. Pharmacy prepares delivered + dead space. Factor =
kg × prepared ÷ delivered, and every per-kg dose in the bag is × Factor, so the infant receives the dose
as ordered while the bag holds more. GIR, osmolarity and K⁺ mEq/L do not move with the dead space. Lipid is a
separate syringe with no overfill. Heparin is per mL of the prepared bag. Since 2026-11-06 the Calculator
shows the prepared volume, not the Factor (Pp: doctors and nurses do not need it on screen). The Factor is
still on the pharmacy back sheet, which renders but has not printed since 2026-10-28, and in the quick
calc's copied text; pharmacy works it out from the front (REFERENCE.md § The printed order).
Source: the KCMH worksheet (C7 delivered, G7 prepared, G8 dead space, H9 Factor).

```rule
{"rule": "CR-U-FACTOR", "kind": "unit", "where": [{"file": "calculator.jsx", "line": 1694, "has": "const preparedVol = totalTPN_mL > 0 ? totalTPN_mL + deadVol_mL : 0;"}, {"file": "calculator.jsx", "line": 1696, "has": "const factor = wtKg * overfill;                                     // H9"}]}
{"case": "1 kg, 100 mL + 30 mL dead space: Factor 1.3", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 2}, "expect": {"shows": ["Prepared (เตรียมจริง)130 mL/daydelivered 100 mL", "Lipid volume10 mL/day"], "hides": "Factor1.3", "prints": ["Dextrose Final Conc.10% = 13 g in bag = 26 mL (D50W) · delivered 10 g = 10 g/kg/d", "Factor:1.3"]}}
```

### CR-U-DEAD-SPACE · dead space default

A new order on a newborn ward starts at 30 mL of dead space; an order copied from one with a dead space
keeps it, and a saved order keeps its own. No TPN volume, no dead space (and no bag). Every ward is a
newborn ward today (`OLDER_CHILD_WARDS` is empty).
Source: Pp, 2026-09-18: "ใน SCN+NICU แก้เป็น +30 ml อัตโนมัติไปเลย".

```rule
{"rule": "CR-U-DEAD-SPACE", "kind": "unit", "coded": {"NEWBORN_DEAD_VOL_ML": 30, "OLDER_CHILD_WARDS": []}, "where": [{"file": "data.js", "line": 2602, "has": "const NEWBORN_DEAD_VOL_ML = 30;"}, {"file": "calculator.jsx", "line": 135, "has": "return v > 0 ? v : window.NEOFEED_DATA.defaultDeadVolFor(patient);"}]}
{"case": "a NICU bed starts at 30 mL", "fn": "defaultDeadVolFor", "args": [{"currentBed": "NICU 5"}], "want": 30}
```

### CR-U-GIR · glucose infusion rate

GIR (mg/kg/min) = TPN delivered mL × dextrose % ÷ 100 × 1,000 ÷ (1,440 × kg). The dextrose % is the
final concentration of the prepared bag, so the infant receives it in the delivered volume. D50W mL =
dextrose g in the prepared bag ÷ 0.5. g/kg/d = GIR × 1.44.
Source: standard; matches the KCMH worksheet (D10, F10).

```rule
{"rule": "CR-U-GIR", "kind": "unit", "coded": {"KCMH_STOCK.d50w.gPerMl": 0.5}, "where": [{"file": "calculator.jsx", "line": 1722, "has": "const gir = dexG * 1000 / (1440 * wtKg);"}, {"file": "data.js", "line": 1325, "has": "return gir * 1.44;  // mg/kg/min × 1.44 = g/kg/day"}]}
{"case": "1 kg, 100 mL of D10: GIR 6.9", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3}, "expect": {"shows": "GIR6.9mg/kg/min"}}
{"case": "12 mg/kg/min = 17.28 g/kg/d", "fn": "girToGPerKg", "args": [12], "want": 17.28, "within": 1e-9}
{"case": "17.28 g/kg/d at 1 kg = 12 mg/kg/min", "fn": "calcGIR", "args": [17.28, 1], "want": 12, "within": 1e-9}
```

### CR-U-ENERGY · kcal per gram

TPN: dextrose 3.4, amino acid 4, fat 9 kcal/g. Feed energy comes from `EN_DB` per 100 mL; the energy split
counts the feed's carbohydrate and protein at 4 and its fat at 9 kcal/g. The factors are literals in
`calculator.jsx`.
Source: the KCMH worksheet, E53 = 3.4 × dextrose + 4 × AA + 9 × fat, so the figure reconciles with the
pharmacy printout. Joosten (ESPGHAN 2018, energy) names 4/4/9 the Atwater convention and puts a lipid
emulsion at about 10 kcal/g with its glycerol; Lapillonne gives 2.0 kcal/mL for a 20 % emulsion (NeoFeed's
9 gives 1.8); the Thai CPG (PDF p. 19) uses 3.4/4/10: Q8.

```rule
{"rule": "CR-U-ENERGY", "kind": "unit", "where": [{"file": "calculator.jsx", "line": 1779, "has": "const dexKcal = dexG * 3.4;"}, {"file": "calculator.jsx", "line": 1780, "has": "const aaKcal = aaG * 4;"}, {"file": "calculator.jsx", "line": 1784, "has": "const lipidKcal = lipidG * 9;"}]}
{"case": "1 kg: D10 100 mL (34) + AA 2 (8) + lipid 1 (9) = 51 kcal/kg/d", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 2, "20% lipid": 1}, "expect": {"shows": "Energy (total)Low51 kcal/kg/d"}}
```

### CR-U-OSM · osmolarity estimate

mOsm/L = 50 × dextrose % + 100 × AA % + 2 × Na + 2 × K + 1.4 × Ca + 1 × Mg, each electrolyte in mEq/L of
the delivered volume (Ca: elemental mg/L ÷ 20). Graded by `CR-OSM-PERIPH`.
Source: the KCMH worksheet, cell E52, reproduced exactly (856 and 896 mOsm/L on its own sheets,
2026-08-06). No published source found: none in Avery, Fanaroff, the twelve ESPGHAN 2018 chapters or the
Thai CPG, and the published neonatal equations use other terms (Pereira-da-Silva 2004, PMID 14763792).
The 1.4 (Ca) and 1 (Mg) factors appear in no primary source: Q16.

```rule
{"rule": "CR-U-OSM", "kind": "unit", "where": [{"file": "data.js", "line": 1306, "has": "function estimateOsmolarity({ dexPct, aaPct, naMeqPerL, kMeqPerL, caMgPerL = 0, mgMeqPerL = 0 }) {"}, {"file": "calculator.jsx", "line": 1917, "has": "}, osm = D.estimateOsmolarity(osmIn);"}]}
{"case": "D10, AA 2 %, Na 30, K 20, Ca 400 mg/L, Mg 3: 831", "fn": "estimateOsmolarity", "args": [{"dexPct": 10, "aaPct": 2, "naMeqPerL": 30, "kMeqPerL": 20, "caMgPerL": 400, "mgMeqPerL": 3}], "want": 831, "within": 1e-9}
{"case": "1 kg, 100 mL of D10 with AA 3: 800", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3}, "expect": {"shows": "Osm 800 mOsm/L"}}
```

### CR-U-SALTS · electrolyte units and stock strengths

What each field takes, and the divisor that turns it into stock mL (`KCMH_STOCK`, the KCMH shelf):

| field | typed as | stock |
|---|---|---|
| 20 % NaCl | mEq Na/kg/d | 3.42 mEq/mL |
| Na acetate | mEq Na/kg/d | 3 mEq Na/mL (acetate not shown: `acetateMeqPerMl` is null) |
| Glycophos | **mEq Na/kg/d**, halved to mmol P; or, with its P button, **mg P/kg/d** ÷ 31 (since 2026-11-06) | 2 mEq Na + 1 mmol P (31 mg) per mL |
| KCl | mEq K/kg/d | 2 mEq/mL |
| K₂HPO₄ | mEq K/kg/d | 1 mEq K + 15.5 mg P per mL |
| MgSO₄ 10 % | **elemental mg Mg/kg/d**, stored ÷ 12.1525 as mEq (since 2026-10-28) | 0.812 mEq/mL = 9.87 mg/mL (KCMH uses 10 % only; a row saved as 50 % computes as 10 %) |
| 10 % Ca gluconate | elemental Ca mg/kg/d | 9.01755 mg/mL (0.45 mEq) |
| ZnSO₄ | elemental Zn mg/kg/d | 1 mg/mL |
| Heparin | U/mL of the prepared bag | 100 U/mL |
| Amino acid | g/kg/d | Aminoven 10 %, 0.1 g/mL |

Source: the official KCMH pharmacy worksheet (verified 2026-08-06; `test/verify-kcmh-constants.cjs`
holds an independent transcription); Na acetate 3 and KCl 2 confirmed by the TPN team and Pp on
2026-09-28; ZnSO₄ by pharmacy on 2026-10-25. The P per mL of Glycophos (31) and of K₂HPO₄ (15.5) are
also literals in the calculation. Glycophos typed by P (Pp, 2026-11-06): the Na / P buttons beside its
label change what the box and its chips are in (Na 1–4 mEq/kg/d; P 15, 30, 45, 60 mg/kg/d of elemental P,
Pp confirmed), never the
dose. The order stores one figure, mL/kg/d (= mmol P/kg/d), whichever is typed; every Calculator opens
on Na, and goes back to Na when the infant or the order changes (the header's "Switch patient"
keeps it mounted; Vera), so a dose typed from habit is read as Na, as before. A P-typed dose shows to 4
decimals of mL/kg at most on the order form and in the changes list; Center Point's packet keeps its own 3
(`glycoKg`, 0.645 where the form prints 0.6452). Both compute the stock mL from the unrounded dose.

```rule
{"rule": "CR-U-SALTS", "kind": "unit", "coded": {"KCMH_STOCK.naCl.naMeqPerMl": 3.42, "KCMH_STOCK.naAcetate.naMeqPerMl": 3, "KCMH_STOCK.naAcetate.acetateMeqPerMl": null, "KCMH_STOCK.glycophos.naMeqPerMl": 2, "KCMH_STOCK.glycophos.pMgPerMl": 31, "KCMH_STOCK.kCl.kMeqPerMl": 2, "KCMH_STOCK.k2hpo4.kMeqPerMl": 1, "KCMH_STOCK.k2hpo4.pMgPerKMeq": 15.5, "KCMH_STOCK.mgso4_10.mgMeqPerMl": 0.812, "KCMH_STOCK.caGluconate.caMgPerMl": 9.01755, "KCMH_STOCK.aminoven10.gPerMl": 0.1}, "where": [{"file": "calculator.jsx", "line": 1058, "has": "const glycophosPerMl = glycophosBy === \"p\" ? S.glycophos.pMgPerMl : S.glycophos.naMeqPerMl;"}, {"file": "calculator.jsx", "line": 1060, "has": "const setGlycophosTyped = (v) => setGlycophosP(v / glycophosPerMl);"}, {"file": "calculator.jsx", "line": 1730, "has": "const p_glycophos  = glycophosP * wtKg * S.glycophos.pMgPerMl;"}, {"file": "calculator.jsx", "line": 1732, "has": "const p_k2hpo4 = k2hpo4 * wtKg * S.k2hpo4.pMgPerKMeq;"}]}
{"case": "1 kg, no dead space: 1 mL of each stock", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "ปริมาตรคาสาย (dead space)": 0, "Dextrose final": 10, "Amino acid": 3, "20% NaCl": 3.42, "Glycophos": 2, "KCl": 2, "K₂HPO₄": 1, "10% Ca gluconate": 45.08775}, "expect": {"prints": ["3.4 mEq = 1 mL", "1 mLNa 2 mEq · P 31 mg", "K 1 mEqP 15.5 mg1 mEq = 1 mL", "2 mEq2 mEq = 1 mL", "45 mg = 5 mL"]}}
```

### CR-U-SWITCH · parenteral or enteral targets

The tiles switch from `TPN_TARGETS` to `ENTERAL_TARGETS` when the counted feed reaches `FULL_EN_ML_KG`,
100 mL/kg/d (at or above). A MEN feed never switches them. The same constant decides a saved row's Full EN
(`isFullEn`), the Protein : Energy tile and alert (`CR-TGT-PE`), Step 2's EN volume tile and the Reference
page's "Full EN" step.
Source: NeoFeed's own convention (`app-walkthrough.md`, the `enVolPerKg` switch). No source gives it: Avery
ch 60 p. 9 keeps PN to 120 mL/kg/d, Avery (p. 1) and the Thai CPG (PDF p. 93) until feeds give 75 % of
needs, and WHO 2022's ≥ 100 mL/kg/d is when to start fortifier: Q17.

```rule
{"rule": "CR-U-SWITCH", "kind": "unit", "coded": {"FULL_EN_ML_KG": 100}, "where": [{"file": "calculator.jsx", "line": 1763, "has": "const useEnteralTargets = enCounted / wtKg >= D.FULL_EN_ML_KG;"}, {"file": "data.js", "line": 725, "has": "return (Number(entry.enVolPerKg) || 0) >= FULL_EN_ML_KG;"}, {"file": "calculator.jsx", "line": 2029, "has": "const T = useEN ? D.ENTERAL_TARGETS : D.TPN_TARGETS;"}]}
{"case": "breast milk 12.5 mL × 8 = 100 mL/kg/d: enteral protein target", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 12.5, "Frequency": 8}, "expect": {"shows": "1.2 g/kg/d — target 3.5–4 g/kg/d"}}
{"case": "12.4 mL × 8 = 99.2: parenteral protein target", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 12.4, "Frequency": 8}, "expect": {"shows": "1.2 g/kg/d — target 2.5–3.5 g/kg/d"}}
```

### CR-U-MEN · a MEN feed counts toward nothing

A feed ticked MEN (trophic) counts toward neither fluid nor any nutrient: energy, protein, lipid, Na,
K, Ca, P, Ca:P and everything saved or printed from them. Step 2 still shows what it provides.
Source: NICU team, 2026-09-18: "ติ๊ก MEN แล้ว ไม่ต้องเอาไปคิดสารอาหาร".

```rule
{"rule": "CR-U-MEN", "kind": "unit", "where": [{"file": "calculator.jsx", "line": 1758, "has": "const enCounted = isMEN ? 0 : enVolTotal;"}]}
{"case": "breast milk 3 mL × 8 ticked MEN: 0 kcal and 0 mL counted", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 3, "Frequency": 8}, "tick": {"MEN (trophic)": true}, "expect": {"shows": ["Energy (total)0 kcal/kg/d", "Prescribed 0 mL/d"]}}
```

### CR-U-NO-TPN · the "No TPN" tick

A tick at the top right of Step 3, labelled "No TPN", says the day has no TPN: no aqueous bag and no
lipid. Ticking it clears every bag ingredient left in the order (TPN volume, dextrose, amino acid, 20 %
lipid, every Step 4 salt, ZnSO₄), so a TPN order prefilled from yesterday never reaches pharmacy, and a
toast names what it cleared. Unticking it in the same visit puts each back into a box still empty, a
dose typed since being kept (Vera, 2026-11-01), and names what it put back. While it is ticked Step 3
shows no pumps and no route or osmolarity, with no note in their place (Pp: "คำอธิบาย ไม่ต้องใส่"), its
dot and Step 4's read done, and the order needs no route (`CR-ROUTE-REQUIRED`: no bag). It is saved with
the order (`calcInput.noTpn`), a new order copied from a ticked one starts ticked, and the changes list
names it. **A No TPN order prints no TPN order** (Pp, 2026-11-01: "ถ้า ไม่มี tpn เราก็จะไม่ปริ้นท order"): only a
short sheet, titled "NO TPN — ORAL / STOP ORDER", for its oral orders ("Print orals only"), on the first No
TPN day after a day with TPN, or as a revision that replaces a TPN order submitted the same day
(`calcInput.replacesTpn`, Vera's fifth review; Pp: "Yes, print it"). Its one line says "TPN stopped today" on
those two, else "No TPN today" (Pp: "เอาแค่สองแบบ พิมพ์ให้สั้นที่สุด"); otherwise Print says "No TPN — ไม่มีใบสั่ง TPN ให้พิมพ์", and the ward's
Print order list marks the infant "No TPN — ไม่ต้องพิมพ์" and leaves it out of Print ทั้งหมด. Both read
`D.orderPrints`. A salt typed into Step 4 while it is ticked is still `CR-BAG-NO-VOLUME`, whose line then points
at the tick. Center Point offers no tick: its packet is a TPN order. An order with no TPN must carry it:
`CR-NO-TPN-TICK`. What the feeds must reach: `CR-NO-TPN-EN`; far below the plan: `CR-NO-TPN-PLAN`.
A submitted order saved before the tick existed, with neither a bag nor lipid, reads as ticked when it is
reopened, copied to a new day or compared in the changes list, and so is not printed either; its feeds are
checked as today's; a draft does not (its TPN may not be filled in yet), nor does a row whose
calcInput never recorded a TPN volume (empty or unparsed: missing data, not a day without TPN).
Source: Pp, 2026-11-01: "มุมติ๊กขวาบน ช่อง tpn ว่า ไม่มี tpn เพื่อให้ข้ามช่องนี้ได้", then "ขอเป็นภาษาอังกฤษ
no TPN". Not a clinical threshold.

```rule
{"rule": "CR-U-NO-TPN", "kind": "unit", "where": [{"file": "calculator.jsx", "line": 156, "has": "function withLegacyNoTpn(entry, src) {"}, {"file": "data.js", "line": 1895, "has": "function orderIsNoTpn(entry) {"}, {"file": "registry.jsx", "line": 288, "has": "&& D_R.orderPrints(orders[0], D_R.previousFinalEntry(entries, today)) ? orders[0] : null;"}, {"file": "data.js", "line": 1929, "has": "function orderPrints(entry, previousEntry) {"}, {"file": "calculator.jsx", "line": 78, "has": "noTpn: src.noTpn === true,"}, {"file": "calculator.jsx", "line": 1134, "has": "const tickNoTpn = (on) => {"}]}
{"case": "1 kg: a bag of 100 mL, lipid and KCl, then the tick: cleared, feeds 10 mL × 8 alone, saves", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 2, "KCl": 2, "Volume(mL/feed)": 10, "Frequency": 8}, "tick": {"No TPN": true}, "expect": {"submit": "no_reason", "no_alert": "Amino acid not ordered", "shows": "Plan 150 · Prescribed 80 mL/d", "hides": ["TPN Aqueous Pump", "Lipid Pump", "ปริมาตร TPN = 0 แต่ยังมีส่วนประกอบในถุง"]}}
{"case": "the tick on, then KCl typed into Step 4: refused, and the line points at the tick", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 10, "Frequency": 8}, "tick": {"No TPN": true}, "then": {"KCl": 2}, "expect": {"submit": "blocked", "shows": "ปริมาตร TPN = 0 แต่ยังมีส่วนประกอบในถุง: KCl — ลบส่วนประกอบ หรือเอาติ๊ก \"No TPN\" ออกแล้วใส่ปริมาตร"}}
```

### CR-U-EN-KCAL · formula strength

kcal/oz → kcal/100 mL: 20 → 67, 22 → 73, 24 → 80, 26 → 87, 27 → 90, 30 → 100 (1 oz = 30 mL). Formula rows are the
Chula handbook's per-100-kcal columns scaled to the ward strength. Step 2 picks the milk, then its kcal/oz
(`EN_PRODUCTS`, Pp 2026-10-28); each strength is an `EN_DB` row, so the order saves one row key per feed.
Every preterm formula (Preterm Formula, Enfalac Premature, Pre Nan, Hi-Q LBW) is offered at 20, 22, 24, 26 and
27, all of which the milk room makes (Pp, 2026-11-11); Breast Milk is always 20, FBM with HMF 24 and Infatrini 30,
and a milk with one strength shows its kcal/oz locked. "Preterm Formula" is the Enfalac Premature column (Pp,
2026-11-11: "PF ใช้ข้อมูลจาก brand Enfalac Premature formula"); until then its 20 row was an unsourced term-formula
profile. Every row comes from the book's per-100-kcal column (`_enFromChula`). Another
strength is Pp's and the nutrition unit's call.
Changing the milk keeps the kcal/oz when the new milk comes in it; otherwise it takes the new milk's
first and says so beside the picker ("kcal/oz 30 → 22", Vera 2026-10-28). FBM with HMF is hidden from Step 2 since
2026-11-11 (Pp: no HMF in Thailand; FBM with PF instead); an order saved on `BM_HMF_24` still computes and shows it as saved. FBM 24 ↔ Infatrini 30
(alternating) is not offered since 2026-11-06 (Pp: feed 1 and feed 2 give FBM with HMF and Infatrini as
two feeds); its `EN_DB` row stays, so an order saved on it still computes and shows it as saved.
Source: Chula Pediatric Nutrition Handbook 3rd ed. (2565), Tables 5, 7 and 16 (pinned separately by
`test/verify-en-db-sources.cjs`).

```rule
{"rule": "CR-U-EN-KCAL", "kind": "unit", "where": [{"file": "data.js", "line": 167, "has": "const EN_KCAL_PER_100ML = { 20: 67, 22: 73, 24: 80, 26: 87, 27: 90, 30: 100 };"}, {"file": "data.js", "line": 512, "has": "{ id: \"enfalacPrem\", group: \"Preterm formula\",     label: \"Enfalac Premature\",             strengths: [[20, \"ENFALAC_PREM_20\"], [22, \"FBM_PF_22\"], [24, \"ENFALAC_PREM_24\"], [26, \"ENFALAC_PREM_26\"], [27, \"ENFALAC_PREM_27\"]] },"}]}
{"case": "Preterm Formula at 24 kcal/oz is Enfalac Premature: protein 2.4 g/100 mL", "fn": "EN_DB.BM_PF_24.pro", "want": 2.4, "within": 1e-9}
{"case": "26 kcal/oz: 87 kcal/100 mL", "fn": "EN_DB.HIQLBW_26.kcal", "want": 87}
{"case": "Pre Nan at 27 kcal/oz: 90 kcal/100 mL", "fn": "EN_DB.PRENAN_27.kcal", "want": 90}
{"case": "Hi-Q LBW at 24 kcal/oz: 80 kcal/100 mL", "fn": "EN_DB.FBM_PF_24.kcal", "want": 80}
{"case": "Enfalac Premature at 22 kcal/oz: 73 kcal/100 mL", "fn": "EN_DB.FBM_PF_22.kcal", "want": 73}
```

### CR-U-EN-TWO-FEEDS · two feeds on one day

An order can give two feeds, each its own milk, kcal/oz, mL per feed and feeds a day. The day's enteral
volume is the sum of the two, and so is every nutrient: the code weights one composition per 100 mL by
each feed's mL/day (`enMixPer100mL`), which is the same sum. With one feed it is that feed's own row, so
a one-feed order's figures do not move. Everything downstream reads the sum: prescribed fluid
(`CR-U-FLUID`), the switch to enteral targets (`CR-U-SWITCH`), every tile and alert, and the MEN
trophic ceiling (`CR-MEN-MAX`). The one MEN tick covers both feeds (`CR-U-MEN`): a MEN breast-milk feed
beside a full formula feed takes the formula out of every total too, with only the amber MEN line to
say so. Center Point's TPN packet holds one feed, so a Center Point order is not offered a second.
Source: Pp, 2026-10-28 ("ให้สามารถเลือกได้ 2 ชนิดนม"); one MEN tick for both feeds rather than one per
feed: Pp, 2026-10-28, after Vera raised that case. Not a clinical threshold.

```rule
{"rule": "CR-U-EN-TWO-FEEDS", "kind": "unit", "where": [{"file": "data.js", "line": 549, "has": "function enMixPer100mL(feeds) {"}, {"file": "calculator.jsx", "line": 1748, "has": "const en = D.enMixPer100mL(enFeeds) || EN_NO_FEED;"}, {"file": "calculator.jsx", "line": 1749, "has": "const enVolTotal = enFeeds.reduce((s, f) => s + f.mlPerDay, 0);"}]}
{"case": "1 kg: feed 1 6 mL × 4 + feed 2 4 mL × 4 = 40 mL counted in fluid", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 6, "Frequency": 4}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 4, "Frequency": 4}, "expect": {"shows": "Plan 150 · Prescribed 40 mL/d"}}
{"case": "breast milk 11 mL × 8 (88 mL/kg/d) alone: parenteral protein target", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 11, "Frequency": 8}, "expect": {"shows": "target 2.5–3.5 g/kg/d"}}
{"case": "breast milk 22 mL × 4 (88) with Enfalac Premature 24 at 6 mL × 4: 112 mL/kg/d together, enteral target", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 22, "Frequency": 4}, "feed2": "ENFALAC_PREM_24", "order2": {"Volume(mL/feed)": 6, "Frequency": 4}, "expect": {"shows": "1.6 g/kg/d — target 3.5–4 g/kg/d"}}
{"case": "both feeds ticked MEN: 0 kcal and 0 mL counted", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 3, "Frequency": 4}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 3, "Frequency": 4}, "tick": {"MEN (trophic)": true}, "expect": {"shows": ["Energy (total)0 kcal/kg/d", "Prescribed 0 mL/d"], "no_alert": "MEN ticked above trophic volume"}}
{"case": "MEN 3 + 3.2 mL × 4 = 24.8 mL/kg/d together: above the trophic ceiling", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 3, "Frequency": 4}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 3.2, "Frequency": 4}, "tick": {"MEN (trophic)": true}, "expect": {"alert": "MEN ticked above trophic volume", "level": "warn"}}
```

### CR-U-BREASTMILK · what NeoFeed assumes breast milk contains

Breast milk is WHO 2006's term mature milk per litre, ÷ 10 per 100 mL: protein 1.2 g, fat 3.4 g, CHO
6.7 g, Na 0.9 and K 1.39 mmol, Ca 26 and P 14.9 mg. Energy is the one departure: 67 kcal/100 mL (20
kcal/oz, inside the Chula handbook's mature-milk range of 65.2–70; WHO gives 64). BM + HMF adds one 4 g
Enfamil HMF dose: +1.1 g protein, and the rest per gram of that protein (+14.3 kcal). FBM with PF (`BM_PFP_22/24/27`, Pp 2026-11-11) is the milk room's chart: breast milk mixed with concentrated Enfalac A+
Preterm (1 scoop + 10 mL water = 13.6 mL), the concentrate 0.5, 1 or 2 mL in 10 for 22, 24 or 27 kcal/oz; the milk at
(1 − share) and the concentrate bringing the rest of the energy with Chula Table 5's column. 26 is not on the chart and
is not offered. FBM with HMF is hidden from Step 2 (no HMF in Thailand). Real milk varies;
NeoFeed has no measured-milk input: NOURISH (Belfort, JAMA Pediatrics) found standard fortification
enough and did not support routine milk analysis.
Source: WHO 2006, *Optimal feeding of low-birth-weight infants: technical review*, Box 1.3.1 (p. 16)
and Box 1.3.3 (p. 19), every stored value re-read on 2026-10-27; Chula handbook p. 8 (energy) and p. 10
(Enfamil HMF).
On screen (NF-12): with a breast-milk feed (BM, BM + HMF, or FBM ↔ Infatrini on an order saved on it) given as feed 1 or feed 2,
Step 2 names the protein and kcal per 100 mL it assumes, with `EN_DB.BM_20.source`; what HMF adds, from
`EN_HMF_PROTEIN_G_PER_DOSE` and the Chula p. 10 column, with `EN_DB.BM_HMF_24.source`; and one line that
real milk varies. It reads these values when it renders, so they change here and nowhere else. Not
printed, and not in the quick calc's copied text.

```rule
{"rule": "CR-U-BREASTMILK", "kind": "unit", "coded": {"EN_DB.BM_20.kcal": 67, "EN_DB.BM_20.pro": 1.2, "EN_HMF_PROTEIN_G_PER_DOSE": 1.1, "EN_SRC_CHULA_ENFAMIL_HMF_PER_G_PROTEIN.kcal": 13}, "where": [{"file": "data.js", "line": 195, "has": "const EN_HMF_PROTEIN_G_PER_DOSE = 1.1;"}, {"file": "data.js", "line": 187, "has": "const EN_SRC_WHO_TERM_MILK_PER_L = { kcal: 640, pro: 12, fat: 34, cho: 67, naMmol: 9.0, kMmol: 13.9, caMmol: 6.5, pMmol: 4.8 };"}, {"file": "data.js", "line": 210, "has": "return { kcal: 67, pro: w.pro / 10, fat: w.fat / 10, cho: w.cho / 10,"}, {"file": "calculator.jsx", "line": 4866, "has": "function MilkAssumption({ keys }) {"}]}
{"case": "breast milk: 67 kcal/100 mL", "fn": "EN_DB.BM_20.kcal", "want": 67}
{"case": "FBM with PF 24 (milk room chart: 1 in 10 is concentrated Enfalac Premature): 80 kcal", "fn": "EN_DB.BM_PFP_24.kcal", "want": 80}
{"case": "FBM with PF 24: protein 0.9 × 1.2 + 19.7 kcal × 3 g/100 kcal = 1.671 g/100 mL", "fn": "EN_DB.BM_PFP_24.pro", "want": 1.671, "within": 1e-9}
{"case": "FBM with PF 27 (2 in 10): protein 0.8 × 1.2 + 36.4 kcal × 3 g/100 kcal = 2.052 g/100 mL", "fn": "EN_DB.BM_PFP_27.pro", "want": 2.052, "within": 1e-9}
{"case": "breast milk: 1.2 g protein/100 mL", "fn": "EN_DB.BM_20.pro", "want": 1.2, "within": 1e-9}
{"case": "BM + HMF: 2.3 g protein/100 mL", "fn": "EN_DB.BM_HMF_24.pro", "want": 2.3, "within": 1e-9}
{"case": "breast milk 2 mL × 8: Step 2 names 1.2 g and 67 kcal per 100 mL, the source, and that milk varies", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 2, "Frequency": 8}, "expect": {"shows": ["นมแม่ที่ใช้คำนวณ ต่อ 100 mL: protein 1.2 g · 67 kcal · WHO 2006 technical review, Box 1.3.1 (term mature milk); kcal: Chula Handbook p. 8", "นมแม่จริงแต่ละคนมีโปรตีนและพลังงานไม่เท่ากัน"]}}
{"case": "BM + HMF (hidden from Step 2 since 2026-11-11, saved orders still compute): 81.3 kcal/100 mL", "fn": "EN_DB.BM_HMF_24.kcal", "want": 81.3, "within": 1e-9}
{"case": "Hi-Q LBW 24: no breast-milk line", "infant": {"g": 1000}, "feed": "FBM_PF_24", "order": {"Volume(mL/feed)": 2, "Frequency": 8}, "expect": {"hides": "นมแม่ที่ใช้คำนวณ"}}
{"case": "no feed volume: no breast-milk line", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3}, "expect": {"hides": "นมแม่ที่ใช้คำนวณ"}}
{"case": "Hi-Q LBW 24 as feed 1 and breast milk as feed 2: the breast-milk line", "infant": {"g": 1000}, "feed": "FBM_PF_24", "order": {"Volume(mL/feed)": 2, "Frequency": 4}, "feed2": "BM_20", "order2": {"Volume": 2, "Frequency": 4}, "expect": {"shows": "นมแม่ที่ใช้คำนวณ ต่อ 100 mL: protein 1.2 g · 67 kcal"}}
{"case": "feed 1 at 0 mL, Hi-Q LBW 24 as feed 2 only: no breast-milk line", "infant": {"g": 1000}, "feed2": "FBM_PF_24", "order2": {"Volume": 2, "Frequency": 8}, "expect": {"hides": "นมแม่ที่ใช้คำนวณ"}}
```

### CR-U-STATUS · how a tile is graded

`rangeStatus(value, [lo, hi], {hardHi, hardLo})`: 0 is empty (nothing ordered, not off target); inside
the band ok; outside amber; past a hard limit critical; Infinity (a nutrient with no partner, Ca with
no P) critical. Bounds are inclusive.

```rule
{"rule": "CR-U-STATUS", "kind": "unit", "where": [{"file": "data.js", "line": 1159, "has": "function rangeStatus(value, [lo, hi], { hardHi = null, hardLo = null } = {}) {"}]}
{"case": "0 is empty", "fn": "rangeStatus", "args": [0, [1, 2]], "want": "empty"}
{"case": "the bounds are in range", "fn": "rangeStatus", "args": [2, [1, 2]], "want": "ok"}
{"case": "past the band is amber", "fn": "rangeStatus", "args": [2.01, [1, 2]], "want": "warn"}
{"case": "past the hard limit is critical", "fn": "rangeStatus", "args": [4.01, [1, 2], {"hardHi": 4}], "want": "crit"}
```

## Rounding

Every figure a person reads goes through `displayNum`; saved rows keep full precision. Limits are graded
on the printed figure where the rule says so (osmolarity to 0 decimals, the bottle to 1, the lipid rate
to 2) or with float noise stripped (K⁺ in the bag, the typed-weight difference). A value just past a
limit gets the decimals it needs to read differently from the limit (`vsLimit`, `CR-GIR-MAX`).

### CR-R-DISPLAY · numbers a person reads

At most 2 decimals (or the count given), never a trailing zero ("18.0" can be read as 180), half away
from zero after clearing the float tail at 6 decimals (1.5 × 0.7 is 1.0499999999999998 and prints 1.1),
never "-0"; blank, NaN and Infinity print "—".
Source: Pp, 2026-09-22: "ห้ามมี .0 เช่น 18.0 คือ 18"; the ISMP rule. The float tail: Vera on PR #171.

```rule
{"rule": "CR-R-DISPLAY", "kind": "round", "where": [{"file": "data.js", "line": 1028, "has": "function displayNum(value, maxDecimals = 2) {"}]}
{"case": "18.0 prints 18", "fn": "displayNum", "args": [18.0], "want": "18"}
{"case": "0.125 prints 0.13", "fn": "displayNum", "args": [0.125], "want": "0.13"}
{"case": "1.25 at 1 decimal prints 1.3", "fn": "displayNum", "args": [1.25, 1], "want": "1.3"}
{"case": "1.5 × 0.7 (1.0499999999999998) at 1 decimal prints 1.1", "fn": "displayNum", "args": [1.0499999999999998, 1], "want": "1.1"}
{"case": "899.6 at 0 decimals prints 900", "fn": "displayNum", "args": [899.6, 0], "want": "900"}
{"case": "-0.004 prints 0", "fn": "displayNum", "args": [-0.004], "want": "0"}
{"case": "blank prints —", "fn": "displayNum", "args": [null], "want": "—"}
```

### CR-R-STOCK-ML · stock volumes

Every stock mL is rounded once, by `roundMl`: one decimal, half up (`displayNum(n, 1)`, so the float tail
is cleared first and 0.35 mL prints 0.4). That covers D50W, amino acid, NaCl, Na acetate, Glycophos, KCl,
K₂HPO₄, MgSO₄, Ca gluconate, ZnSO₄, heparin, SMOF, Soluvit and Peditrace. Until 2026-10-27 the code used
`toFixed`, at 2 decimals for K₂HPO₄, MgSO₄, ZnSO₄ and heparin, and read 0.35 mL as 0.3. A stock that
rounds to 0 mL is `CR-STOCK-ZERO`.
Source: Pp, 2026-10-27: "ของจริง นับทศนิยม 1 ตำแหน่ง เช่น 1.25 > 1.3 ml" (PR #171).

```rule
{"rule": "CR-R-STOCK-ML", "kind": "round", "where": [{"file": "calculator.jsx", "line": 21, "has": "const roundMl = (n) => Number(D.displayNum(n, 1));"}]}
{"case": "700 g, no dead space: KCl 0.35 mL prints 0.4, K₂HPO₄ 0.4, MgSO₄ 0.3, ZnSO₄ 0.3", "infant": {"g": 700}, "route": "Central", "order": {"Volume(mL/day)": 100, "ปริมาตรคาสาย (dead space)": 0, "Dextrose final": 10, "Amino acid": 3, "KCl": 1, "K₂HPO₄": 0.5, "MgSO₄": 4.861, "ZnSO₄": 0.4, "Heparin": 0.5, "10% Ca gluconate": 40}, "expect": {"prints": ["0.7 mEq = 0.4 mL", "P 7.8 mg0.4 mEq = 0.4 mL", "3.4 mg (0.28 mEq) = 0.3 mL (10%)", "ZnSO₄ (Zn 1 mg/mL)0.28 mg Zn0.3"]}}
```

### CR-R-BAG-SUM · components and water

Components are summed in whole hundredths, then rounded half up to 1 decimal. WFI q.s. = the prepared
volume as printed (1 decimal) − components, so the printed components + WFI equal the printed prepared
volume exactly.
Source: NF-17, Pp, 2026-10-11 (130.45 mL used to print 87.5 + 42.9 = 130.5).

```rule
{"rule": "CR-R-BAG-SUM", "kind": "round", "where": [{"file": "calculator.jsx", "line": 1897, "has": "const componentVol = Math.round(componentHundredths / 10) / 10;"}, {"file": "calculator.jsx", "line": 1901, "has": "const wfiVol = parseFloat((Number(D.displayNum(preparedVol, 1)) - componentVol).toFixed(1));"}]}
{"case": "80.45 + 50 mL: 87.5 + 43 = 130.5", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 80.45, "ปริมาตรคาสาย (dead space)": 50, "Dextrose final": 10, "Amino acid": 3, "20% NaCl": 2, "KCl": 1, "10% Ca gluconate": 40, "Heparin": 0.5}, "expect": {"prints": "Components 87.5 mL + WFI 43 mL = 130.5 mL prepared"}}
{"case": "700 g: ten stocks of 47.4 mL, WFI 52.6", "infant": {"g": 700}, "route": "Central", "order": {"Volume(mL/day)": 100, "ปริมาตรคาสาย (dead space)": 0, "Dextrose final": 10, "Amino acid": 3, "KCl": 1, "K₂HPO₄": 0.5, "MgSO₄": 4.861, "ZnSO₄": 0.4, "Heparin": 0.5, "10% Ca gluconate": 40}, "expect": {"prints": "Components 47.4 mL + WFI 52.6 mL = 100 mL prepared"}}
```

### CR-R-LIPID-WHOLE-ML · the lipid syringe to a whole mL, on a tap

Tapping Step 3's "Lipid volume" rounds the 20 % lipid syringe (`CR-U-FLUID`'s 0.2 g/mL, no overfill) to the
nearest whole mL/day, half up, and sets 20 % lipid to the dose that volume gives: mL × 0.2 ÷ kg. The pump
rate (`CR-R-PUMP-RATE`), g/kg/h (`CR-LIPID-RATE`), lipid kcal and the printed order follow from that dose. A
tap never makes a critical lipid line the typed dose did not have: where the nearest mL would take the dose
above 4.0 g/kg/d (`CR-LIPID-IV-MAX`) or the g/kg/h above 0.17, the whole mL below is used (again, until
neither holds). Only these two lipid lines are guarded: a tap moves energy by under 1 kcal and NPE:AA a
little, which could still tip a near-edge Energy or NPE:AA line (Q22). A line the typed dose already had stays,
and that dose rounds to the nearest mL, up as well as down (4.5 → 4.52 g/kg/d at 1.68 kg; Q22). Under 0.5 mL
there is no whole mL and the dose is left as typed. The dose is kept to 2 decimals, else 3, whichever still
gives that whole mL at 0.1 mL (`CR-R-STOCK-ML`); 3 always does up to 8 kg, and the order prints the lipid dose
to 3 decimals so the printed dose and mL agree. Nothing rounds until the tap; a toast names the mL and the
dose before and after.
Source: Pp, 2026-11-06: "ถ้ากดที่ลิพิตโวลุ่มจะ rounding ให้ หน่วยเป็น ml/day และย้อนกลับไปคำนวณ"; asked, she
chose the nearest whole mL, and the whole mL below where rounding would cross 4.0 ("so a tap never creates a
critical alert"). The g/kg/h ceiling, the 0.5 mL floor and the 3-decimal print: Vera on this PR, for Pp to
confirm. Not a clinical threshold.

```rule
{"rule": "CR-R-LIPID-WHOLE-ML", "kind": "round", "where": [{"file": "data.js", "line": 1275, "has": "function lipidDoseAtWholeMl(lipidPerKg, wtKg, { hours = 24, vitalipidMl = 0 } = {}) {"}, {"file": "calculator.jsx", "line": 1112, "has": "const roundLipidToWholeMl = () => {"}]}
{"case": "1.68 kg, 2 g/kg/d = 16.8 mL: 17 mL, 2.02 g/kg/d", "side": "inside", "fn": "lipidDoseAtWholeMl", "args": [2, 1.68, {"vitalipidMl": 6}], "want": 2.02}
{"case": "580 g, 3.7 g/kg/d = 10.7 mL: 11 mL is 0.18 at the pump but 0.16 over the 24 h ordered, so amber, and the tap keeps the nearest mL", "side": "inside", "fn": "lipidDoseAtWholeMl", "args": [3.7, 0.58, {"hours": 24, "vitalipidMl": 2}], "want": 3.79}
{"case": "1.68 kg, 2.02 g/kg/d is 17 mL already: unchanged", "side": "inside", "fn": "lipidDoseAtWholeMl", "args": [2.02, 1.68, {"vitalipidMl": 6}], "want": 2.02}
{"case": "1.68 kg, 3.9 g/kg/d = 32.8 mL: 33 mL, 3.93", "side": "inside", "fn": "lipidDoseAtWholeMl", "args": [3.9, 1.68, {"vitalipidMl": 6}], "want": 3.93}
{"case": "1.68 kg, 4 g/kg/d = 33.6 mL: 34 mL would be 4.05, so 33 mL, 3.93", "side": "outside", "fn": "lipidDoseAtWholeMl", "args": [4, 1.68, {"vitalipidMl": 6}], "want": 3.93}
{"case": "1.71 kg, 4 g/kg/d = 34.2 mL: 34 mL, 3.98", "side": "inside", "fn": "lipidDoseAtWholeMl", "args": [4, 1.71, {"vitalipidMl": 6}], "want": 3.98}
{"case": "1.68 kg, 4.5 g/kg/d (already over 4) = 37.8 mL: 38 mL, 4.52", "side": "outside", "fn": "lipidDoseAtWholeMl", "args": [4.5, 1.68, {"vitalipidMl": 6}], "want": 4.52}
{"case": "400 g, 3.4 g/kg/d over 20 h (0.17): 7 mL would be 0.18, so 6 mL, 3", "side": "outside", "fn": "lipidDoseAtWholeMl", "args": [3.4, 0.4, {"hours": 20, "vitalipidMl": 1}], "want": 3}
{"case": "3.5 kg, 1.5 g/kg/d = 26.25 mL: 26 mL needs 3 decimals, 1.486", "side": "inside", "fn": "lipidDoseAtWholeMl", "args": [1.5, 3.5, {"vitalipidMl": 10}], "want": 1.486}
{"case": "400 g, 0.2 g/kg/d = 0.4 mL: under 0.5 mL, left as typed", "side": "inside", "fn": "lipidDoseAtWholeMl", "args": [0.2, 0.4, {"vitalipidMl": 1}], "want": 0.2}
{"case": "430 g, 1 g/kg/d = 2.15 mL: 2 mL, 0.93", "side": "inside", "fn": "lipidDoseAtWholeMl", "args": [1, 0.43, {"vitalipidMl": 1}], "want": 0.93}
{"case": "no lipid: nothing to round", "side": "inside", "fn": "lipidDoseAtWholeMl", "args": [0, 1.68], "want": null}
{"case": "1,680 g on 2.02 g/kg/d prints 17 mL", "infant": {"g": 1680}, "route": "Central", "order": {"Volume(mL/day)": 200, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 2.02}, "expect": {"shows": "17 mL/day", "prints": "2.02 g/kg/d = 17 mL"}}
{"case": "3,500 g on 1.486 g/kg/d prints 1.486 = 26 mL", "infant": {"g": 3500}, "route": "Central", "order": {"Volume(mL/day)": 400, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 1.486}, "expect": {"prints": "1.486 g/kg/d = 26 mL"}}
```

### CR-R-PUMP-RATE · pump rates at 0.1 mL/hr, and how long they run

Both pumps set to 0.1 mL/hr: the TPN aqueous pump (its delivered volume over 24 h) and the lipid pump (the
lipid bag over the hours typed). The rate is the nearest 0.1 (half up); where that would run the volume past
24 h, it is rounded up to the next 0.1 instead. Step 3, the copied order, the printed order and Center Point
show the rate and the hours it actually runs (volume ÷ rate, 1 decimal): 100 mL is 4.2 mL/hr for 23.8 h,
130 mL is 5.5 mL/hr for 23.6 h (5.4 would run 24.1 h). The TPN pump's volume and every dose are unchanged; the
pump stops when the bag is empty. Lipid g/kg/h is graded on those hours (`CR-LIPID-RATE`); GIR is still
over 24 h (1,440 min). On a small TPN bag the round-up stops the pump hours early: 12.1 mL is 0.6 mL/hr for
20.2 h, and while it runs the glucose rate is 24 ÷ 20.2 = 19 % above the GIR on screen (Vera on this change).
The ward sets no volume limit on the TPN pump (Pp, 2026-11-10): it runs the rate for 24 h and draws the extra from
the dead space, so the hours above do not apply to it and Step 3 no longer shows them. Where 24 h at the rate gives
5 % or more above the volume ordered, Step 3 says "24 ชม. ได้ X mL เกิน Y mL (Z%)" under Rate and the alert list
carries the info line "TPN rate gives more than ordered". No figure changes (Pp, 2026-11-10, Q21); the 5 % is the
agent's default, for her to change.
The hours typed into the lipid card are held at the same `PUMP_MAX_HOURS`, and its hint reads "1–24 h"
from it. That cap is older than the pump rule: lipid hangs 24 h at most (TPN team, 2026-09-28, with the
typed hours). Since 2026-11-10 both read the one constant; the cap is also what keeps a lipid run at or
under 24 h, since `pumpRate` holds that only for hours of 24 or fewer.
Source: Pp, 2026-11-06: "Pump rate ให้ปรับเป็นทศนิยม 1 ตำแหน่ง และแจ้ง infusion in กี่ hr ให้ ถ้าเกิน 24 ชม.
ให้ปัดเพิ่ม rate แทน ให้ไม่เกิน"; asked, she chose 24 h as the limit (not the hours typed) and both pumps.
Not a clinical threshold.

```rule
{"rule": "CR-R-PUMP-RATE", "kind": "round", "coded": {"PUMP_MAX_HOURS": 24, "TPN_OVER_NOTE_PCT": 5}, "where": [{"file": "data.js", "line": 1219, "has": "const PUMP_MAX_HOURS = 24;"}, {"file": "data.js", "line": 1220, "has": "function pumpRate(volMl, hours = 24) {"}, {"file": "calculator.jsx", "line": 2147, "has": "const tpnPump = D.pumpRate(totalTPN_mL, 24);"}, {"file": "calculator.jsx", "line": 1042, "has": "if (r >= 1) setLipidDripHours(Math.min(r, D.PUMP_MAX_HOURS));"}]}
{"case": "100 mL over 24 h: 4.2 mL/hr", "side": "inside", "fn": "pumpRate", "args": [100, 24], "want": {"rate": 4.2, "hours": 23.80952380952381}}
{"case": "130 mL: 5.4 would run 24.07 h, so 5.5", "side": "outside", "fn": "pumpRate", "args": [130, 24], "want": {"rate": 5.5, "hours": 23.636363636363637}}
{"case": "lipid bag 22.8 mL over 24 h: 0.95 rounds half up to 1, 22.8 h", "side": "inside", "fn": "pumpRate", "args": [22.8, 24], "want": {"rate": 1, "hours": 22.8}}
{"case": "lipid bag 22.8 mL over 16 h: 1.4 mL/hr runs 16.3 h (only 24 h forces it up)", "side": "inside", "fn": "pumpRate", "args": [22.8, 16], "want": {"rate": 1.4, "hours": 16.28571428571429}}
{"case": "1 mL over 24 h: 0.04 is 0.0, so 0.1 mL/hr, 10 h", "side": "outside", "fn": "pumpRate", "args": [1, 24], "want": {"rate": 0.1, "hours": 10}}
{"case": "no volume: no pump", "side": "inside", "fn": "pumpRate", "args": [0, 24], "want": null}
{"case": "a small bag: 12.1 mL is 0.5 for 24.2 h, so 0.6 mL/hr, 20.2 h (Q21)", "side": "outside", "fn": "pumpRate", "args": [12.1, 24], "want": {"rate": 0.6, "hours": 20.166666666666668}}
{"case": "12.5 mL at 0.6 mL/hr for 24 h gives 14.4 mL: 1.9 mL, 15 % more", "side": "outside", "fn": "tpnOverDelivery", "args": [12.5], "want": {"givenMl": 14.4, "extraMl": 1.9, "pct": 15}}
{"case": "13.7 mL at 0.6 mL/hr gives 14.4 mL: 5 % is said", "side": "outside", "fn": "tpnOverDelivery", "args": [13.7], "want": {"givenMl": 14.4, "extraMl": 0.7, "pct": 5}}
{"case": "13.8 mL at 0.6 mL/hr gives 14.4 mL: 4 % is not", "side": "inside", "fn": "tpnOverDelivery", "args": [13.8], "want": null}
{"case": "100 mL at 4.2 mL/hr gives 100.8 mL: nothing to say", "side": "inside", "fn": "tpnOverDelivery", "args": [100], "want": null}
{"case": "no volume: nothing to say", "side": "inside", "fn": "tpnOverDelivery", "args": [0], "want": null}
{"case": "1 kg, TPN 12.5 mL: Step 3 says 24 h gives 14.4 mL, 1.9 mL more", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 12.5, "Dextrose final": 10, "Amino acid": 3}, "expect": {"alert": "TPN rate gives more than ordered", "level": "info", "shows": ["· 24 ชม. ได้ 14.4 mL เกิน 1.9 mL (15%)", "run 15 % above the figures shown"]}}
{"case": "1 kg, TPN 100 mL: no over-delivery line", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3}, "expect": {"no_alert": "TPN rate gives more than ordered"}}
{"case": "1 kg, TPN 100 mL: Step 3 shows 4.2 mL/hr; the TPN pump runs 24 h", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3}, "expect": {"shows": "= 100 mL/day"}}
{"case": "1.68 kg, lipid 2 g/kg/d: 16.8 + 6 = 22.8 mL, 1 mL/hr, infusion 22.8 h, printed", "infant": {"g": 1680}, "route": "Central", "order": {"Volume(mL/day)": 200, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 2}, "expect": {"shows": "22.8 mL/day · infusion 22.8 h", "prints": "Rate 1 mL/hr, infusion 22.8 h"}}
```

---

## Not in this file

- The ward Alerts page (`app.jsx`) grades a saved GIR with `girStatus` (`CR-GIR-MAX`) and adds growth and
  weighing alerts of its own (`GROWTH_VEL_TARGET`, `GROWTH_VEL_CRITICAL` in `data.js`); those are not
  calculator limits.
- Fenton growth references (`FENTON_*`): display only, `docs/CLINICAL_CONSTANTS.md`.
- The backend's plausibility bounds on every saved field (`gas-backend.gs` `_checkRange`): input
  validation, `test/verify-input-validation.cjs`.

## Questions for Pp

Each names the rule it belongs to. The answer is Pp's, and the TPN team's where the number is theirs.
An answered question keeps its evidence, so it can be reopened.

- **Q1 · `CR-K-BAG-MAX`, `CR-K-BAG-RED`:** answered, Pp 2026-10-28: keep as is for now. Central K⁺ maximum 200 and central amber 60 mEq/L have no
  published source; Fanaroff (Therapeutic Agents p. 8) and IWK give 120 as the central maximum, ANMF 80.
  On a peripheral line 40–60 is orderable with an amber line, where Fanaroff and ANMF call 40 the
  maximum (IWK 60). Every source is for KCl or maintenance fluid; none is for a PN bag.
- **Q2 · `CR-BAG-OVERFULL`:** answered, Pp 2026-10-28: "ถ้า WFI ติดลบ ให้ ไม่สามารถสั่งได้". A bag whose
  stocks exceed its volume was a critical alert, so a typed reason sent pharmacy a form with a negative WFI;
  it is now a stop, like the 1,250 mL bottle.
- **Q3 · `CR-NPE-AA`:** answered, Pp 2026-10-28: keep as is for now. The ≥ 24 kcal/g target sits below the 30–40 kcal/g minimum in ESPGHAN 2018,
  Avery and the Thai CPG, and under Moltu's > 25; no source states NPC:N 150:1. The caution at 20 has no
  source, and red at 12 matches only the bottom of the Thai CPG's 12–16 for critical illness. Should 12
  apply to every infant?
- **Q4 · `CR-VITALIPID-CAP`:** both Vitalipid N Infant labels read (HPRA, Singapore) say to add it only to
  Intralipid 10 % or 20 %; KCMH gives SMOF 20 %. Pharmacy to check the Thai-registered label (not found
  for any of the three vitamin and trace products).
- **Q5 · `CR-TGT-NA`, `CR-TGT-K`:** from DOL 8 Jochum gives Na 3–5 (preterm) and 2–3 (term) and K by weight;
  NeoFeed keeps Na 2–5 and K 2–3 at or above 1,500 g until the term rows are decided.
- **Q6 · `CR-TGT-CAP`:** a Ca:P that is exactly 1.7 on paper (Ca 52.7 with P 31 mg/kg) grades High from
  float noise, beside a printed "1.7:1" and a range "1–1.7". K⁺ and the typed weight strip that noise.
- **Q7 · `CR-TGT-CAP`:** Mihatsch R 8.12 gives molar 0.8–1.0 (about 1.0–1.3 by mass) in early PN, and the
  Thai CPG the same; NeoFeed's band reaches 1.7 by mass from day 1, and its code comment cites "ESPGHAN
  molar 0.8–1.3", which the guideline does not say.
- **Q8 · `CR-U-ENERGY`:** lipid counts 9 kcal/g, the KCMH sheet's Atwater figure; ESPGHAN's lipid chapter
  gives a 20 % emulsion 2.0 kcal/mL (10 kcal/g) and the Thai CPG 10 kcal/g, so total energy reads about
  1 kcal low per g of lipid.
- **Q9 · `CR-GIR-MAX`:** the amber floor of 4 mg/kg/min applies to term infants too; Mesotten R 5.4 and the
  Thai CPG put the term minimum at 2.5, so a term infant at 2.5–4 shows amber.
- **Q10 · `CR-PROTEIN-MAX`:** the 4.5 g/kg/d critical line counts TPN and feed together, so parenteral
  amino acid of 3.5–4.5 shows amber only; van Goudoever R 3.3 keeps PN above 3.5 to trials, and
  Fanaroff ch 42 caps parenteral protein at 3.5.
- **Q11 · `CR-LIPID-RATE`:** the 0.13 g/kg/h amber is the Thai CPG's ceiling for children over 1 year
  (infants 0.17); over 24 h it fires from about 3.1 g/kg/d, which Lapillonne R 4.3 allows.
- **Q12 · `CR-K-IV-MAX`:** IV K⁺ is critical only above 5 mEq/kg/d at every weight; Jochum reaches 5 only for
  preterm infants under 1,500 g, so term and ≥ 1,500 g infants can get 3–5 with an amber line only. No
  source states a maximum.
- **Q13 · `CR-TGT-KCAL`, `CR-KCAL-MAX`:** PN energy DOL 3–7 at 70–100 is above Moltu (60–80) and Avery
  Table 60.1; DOL 1–2 at 45–55 is a day-1 floor in Joosten R 2.4, not a range; term rows are not coded;
  and 160 is an enteral ceiling, so PN-only energy of 120–160 shows amber only.
- **Q14 · `CR-TGT-PROTEIN`:** the DOL-1 band tops out at 2.5 (the Thai CPG's; ESPGHAN gives only a floor),
  so Avery's 2–3 and Fanaroff's 2.5–3.0 day-1 starts show amber; term infants' own cap of 3.0 (R 3.4) is
  not coded.
- **Q15 · `CR-TGT-LIPID`:** DOL 1 at 0.5–1.0 g/kg/d has no source as a day-1 dose; ESPGHAN 2018 sets none,
  Avery starts at 2 and Fanaroff at 3.
- **Q16 · `CR-U-OSM`:** no published source found for the osmolarity formula, in particular its 1.4 (Ca)
  and 1 (Mg) factors; its only known origin is the KCMH worksheet. Pharmacy to name its reference.
- **Q17 · `CR-U-SWITCH`:** the switch to enteral targets at 100 mL/kg/d has no source; Avery keeps PN to
  120 mL/kg/d or 75 % of needs, the Thai CPG 75 %, and WHO's 100 is when to start fortifier.
- **Q18 · `CR-EN-FEEDS-MAX`:** the 8-a-day limit is checked only when there are two feeds. Should one
  feed above 8 a day (q2h, 12) be refused too, or is q2h still ordered on the ward?
- ~~**Q19 · `CR-VITALIPID-CAP`:** rounded down, a lipid order below 250 g gets 0 mL of Vitalipid.~~
  Answered by Pp, 2026-10-28: at least 1 mL whenever lipid is ordered.
- ~~**Q20 · `CR-NO-TPN-EN`:** "มากกว่า 80ml/kg/day หรือตาม fluid requirement ตามวัน": the lower or the higher
  of 80 and the day's requirement, and does exactly 80 pass?~~ Answered by Pp, 2026-11-01: the lower of
  the two, as coded (a preterm on DOL 6 on clears the red line at 80, and `CR-NO-TPN-PLAN` names the gap to
  the plan), and 80 itself passes. Earlier the same day: below the bar Submit asks a reason, not a stop.

- **Q21 · `CR-R-PUMP-RATE`:** answered, Pp 2026-11-10: the TPN pump has no volume limit, so it runs on; say how much more it gives. Rounding the TPN pump rate up stops a small bag hours early (12.1 mL: 0.6 mL/hr,
  20.2 h), while GIR is still graded over 24 h, so the glucose rate while the pump runs is up to about a fifth
  above the GIR shown. Show the gap ("หยุด N h ก่อนถุงใหม่"), grade GIR over the pump's hours, or accept it?
- **Q22 · `CR-R-LIPID-WHOLE-ML`:** the tap guards only the two lipid lines (4.0 g/kg/d, 0.17 g/kg/h). Should it also
  never tip Energy above 160 or NPE:AA below 12, and should a dose already above 4.0 round toward the limit (the
  whole mL below) rather than to the nearest?

## Sources

Avery's *Diseases of the Newborn* 11th ed. and Fanaroff and Martin's *Neonatal-Perinatal Medicine* 12th
ed. are cited by chapter and the page marker of the full-chapter text (the `neonatal-textbooks` skill).
ESPGHAN/ESPEN/ESPR/CSPEN 2018 paediatric PN guidelines (Clin Nutr 2018) are cited by first author and
recommendation number: Joosten, energy, PMID 30078715 · van Goudoever, amino acids, 30100107 ·
Lapillonne, lipids, 30143306 · Mesotten, carbohydrates, 30037708 · Jochum, fluid and electrolytes,
30064846 · Mihatsch, Ca, P, Mg, 30097365 · Domellöf, iron and trace minerals, 30078716 · Bronsky,
vitamins, 30100105 · Kolaček, venous access, 30055869 · Hartman, complications, 30033173. Also:
Koletzko 2005 (ESPGHAN/ESPEN lipids), 16254497 · Moltu 2021 (JPGN 2021;73:274–289), 33605663 ·
Embleton 2023, ESPGHAN 2022 enteral preterm (JPGN 2023;76:248–268, journal pages), 36705703 · WHO 2022
preterm feeding recommendations (GDG summary), 37753445 · WHO 2006, *Optimal feeding of low-birth-weight
infants: technical review*. "Thai CPG" is the Thai paediatric PN guideline 2564 (Thai Pediatric Nutrition
Society), a public-hearing draft, cited by PDF page. K⁺ concentration: ANMF neonatal KCl monograph (2020)
and IWK Health NICU guideline (2026). Product labels: Peditrace SmPC (HPRA, 2019), Vitalipid N Infant SmPC
(HPRA, 2022; Singapore SIN05207P), Soluvit N datasheet (Medsafe, 2021). Every citation was read on
2026-10-27; `docs/CLINICAL_CONSTANTS.md` keeps who decided each constant and when.
