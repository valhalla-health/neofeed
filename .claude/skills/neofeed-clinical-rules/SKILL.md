---
name: neofeed-clinical-rules
description: Use before changing, reviewing or explaining a NeoFeed calculation (a limit, target band, unit, conversion or rounding in calculator.jsx or data.js, or a figure on the printed TPN order). Every rule the calculator enforces as coded, where the code enforces it, its clinical source, and the synthetic orders the test suite runs.
---

# NeoFeed clinical rules

Pp owns this file. It lists every limit, unit and rounding rule the calculator enforces, as the code
does it on `main` after PR #171 (`CONSTANTS_VERSION` 2026-10-27.2). Each rule has a stable ID (`CR-…`)
that other work cites: NF-12 shows the breast-milk assumption from `CR-U-BREASTMILK`, NF-28 checks the
reference tabs against these values.

The clinical numbers are Pp's. An agent documents and tests what the code does; where the code and its
source disagree, or no source exists, the rule names a question under [Questions for Pp](#questions-for-pp)
and the code stays as it is until she answers. How sources are cited, and their PMIDs:
[Sources](#sources).

## Before you change calculation code

1. Find every rule your change touches: search this file for the constant, function or alert title.
2. Change the rule's block in the same commit as the code: its `coded` value, its `where` anchor, its
   cases. A change that moves a printed figure also needs the change protocol in
   `docs/CLINICAL_CONSTANTS.md` (source citation, register row, `CONSTANTS_VERSION` bump, CHANGELOG).
3. Run `node test/verify-clinical-rules.cjs`. Red means the code and this file disagree: find which one is
   wrong. A case is edited to match the code only when Pp has agreed the new behaviour.

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
  (on-screen field label → value), `tick` (checkbox label → true/false), `hours` (lipid infused over),
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
| `stop` | red line in the save panel | refused; a draft may still be kept (weight out of range: no draft either) |
| `critical` | red alert | Submit asks for a clinical reason; it prints on the order |
| `red` | red alert | no reason asked |
| `caution` | amber (or blue info) alert | unaffected |
| `cap` | a ceiling that changes the dose itself | unaffected |
| `target` | the amber band a tile is graded against | unaffected |
| `unit`, `round` | conventions every figure follows | — |

A critical alert is one `alerts.push({ level: "crit" … })`; Submit collects every one that is not
`noReason` and asks once (`calculator.jsx`, `const critical = …`). Each limit is graded on the figure the
order prints wherever the code says so; the rule says which.

---

## Stops

### CR-WT-RANGE · TPN calc. weight 200–8,000 g

Outside 200–8,000 g the order cannot be saved, draft included, and the backend refuses the row too
(`gas-backend.gs` `_checkRange`). Inclusive at both ends.
Source: Pp, 2026-10-08, after an outside review saved a 900 g infant dosed at 8,500 g; the range is the
backend's existing bound on a `Daily_Log` weight. Not a clinical threshold.

```rule
{"rule": "CR-WT-RANGE", "kind": "stop", "coded": {"TPN_WT_RANGE_G": [200, 8000]}, "where": [{"file": "data.js", "line": 831, "has": "const TPN_WT_RANGE_G = [200, 8000];"}, {"file": "calculator.jsx", "line": 1995, "has": "const tpnWtOutOfRange = wtG > 0 && (wtG < tpnWtLo || wtG > tpnWtHi);"}, {"file": "gas-backend.gs", "line": 2085, "has": "_checkRange(ci.tpnWtG, 200, 8000, \"TPN calc. weight (g)\");"}]}
{"case": "8,000 g saves", "side": "inside", "infant": {"g": 8000}, "expect": {"no_alert": "TPN calc. weight out of range", "submit": "no_reason"}}
{"case": "8,001 g is refused", "side": "outside", "infant": {"g": 8001}, "expect": {"alert": "TPN calc. weight out of range", "level": "crit", "submit": "blocked"}}
{"case": "200 g saves", "side": "inside", "infant": {"g": 200}, "expect": {"no_alert": "TPN calc. weight out of range"}}
{"case": "199 g is refused", "side": "outside", "infant": {"g": 199}, "expect": {"alert": "TPN calc. weight out of range", "submit": "blocked"}}
```

### CR-ROUTE-REQUIRED · a bag needs a route

A day with a bag (volume or any bag ingredient) cannot be submitted until Peripheral or Central is
pressed; a draft can. Until then the bag is graded as peripheral, the stricter route (`CR-OSM-PERIPH`,
`CR-K-BAG-MAX`). A feeds-only day needs no route.
Source: Pp, 2026-10-21. Not a clinical threshold.

```rule
{"rule": "CR-ROUTE-REQUIRED", "kind": "stop", "where": [{"file": "calculator.jsx", "line": 1986, "has": "const routeMissing = route == null && (bagOrdered || !!centerPoint);"}]}
{"case": "a bag with no route is refused", "side": "outside", "infant": {"g": 1000}, "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3}, "expect": {"submit": "blocked", "shows": "ยังไม่ได้เลือก route ของ TPN"}}
{"case": "feeds only need no route", "side": "inside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 20, "Frequency": 8}, "expect": {"submit": "no_reason"}}
```

### CR-BAG-NO-VOLUME · bag ingredients with no bag volume

TPN volume 0 with any amino acid, dextrose or additive left in: refused, because every total would count
the ingredients while the form asks pharmacy for a bag of "—" mL. Happens when TPN is stopped on an order
prefilled from yesterday.
Source: calculator review 2026-09-17 (UP-C3). Not a clinical threshold.

```rule
{"rule": "CR-BAG-NO-VOLUME", "kind": "stop", "where": [{"file": "calculator.jsx", "line": 1926, "has": "const zeroVolumeBag = bagIngredientsWithoutVolume.length > 0;"}]}
{"case": "amino acid with TPN volume 0 is refused", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Amino acid": 3}, "expect": {"submit": "blocked", "shows": "ปริมาตร TPN = 0 แต่ยังมีส่วนประกอบในถุง: Amino acid"}}
{"case": "an empty bag of 0 mL saves", "side": "inside", "infant": {"g": 1000}, "route": "Central", "expect": {"submit": "no_reason"}}
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
above every source found**: Q1.

```rule
{"rule": "CR-K-BAG-MAX", "kind": "stop", "coded": {"K_BAG_MEQ_PER_L.peripheral.hardMax": 60, "K_BAG_MEQ_PER_L.central.hardMax": 200}, "where": [{"file": "data.js", "line": 812, "has": "peripheral: { warn: 40, red: 60,  hardMax: 60 },"}, {"file": "data.js", "line": 813, "has": "central:    { warn: 60, red: 120, hardMax: 200 },"}, {"file": "calculator.jsx", "line": 1643, "has": "const kMeqPerL  = preparedVol > 0 ? bag.k_mEq / (preparedVol / 1000) : 0;"}, {"file": "calculator.jsx", "line": 1849, "has": "const kGrade = (v) => isFinite(v) ? Number(v.toPrecision(12)) : v;"}, {"file": "calculator.jsx", "line": 1931, "has": "const kOverMax = kLim.hardMax != null && kMeqPerLGraded > kLim.hardMax;"}]}
{"case": "peripheral 60 mEq/L (1 kg, 50 mL, KCl 3) is the maximum, not over it", "side": "inside", "infant": {"g": 1000}, "route": "Peripheral", "order": {"Volume(mL/day)": 50, "Dextrose final": 5, "Amino acid": 1, "KCl": 3}, "expect": {"no_alert": "K⁺ above the maximum", "alert": "K⁺ concentration high", "level": "warn"}}
{"case": "peripheral 61 mEq/L is refused", "side": "outside", "infant": {"g": 1000}, "route": "Peripheral", "order": {"Volume(mL/day)": 50, "Dextrose final": 5, "Amino acid": 1, "KCl": 3.05}, "expect": {"alert": "K⁺ above the maximum", "level": "crit", "submit": "blocked"}}
{"case": "central 200 mEq/L (1 kg, 20 mL, KCl 4) is critical, not refused", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 20, "Dextrose final": 5, "Amino acid": 1, "KCl": 4}, "expect": {"no_alert": "K⁺ above the maximum", "alert": "K⁺ concentration too high", "level": "crit"}}
{"case": "central 201 mEq/L is refused", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 20, "Dextrose final": 5, "Amino acid": 1, "KCl": 4.02}, "expect": {"alert": "K⁺ above the maximum", "submit": "blocked"}}
```

### CR-BOTTLE-MAX · the 1,250 mL bottle

A prepared volume (delivered + dead space) above 1,250 mL cannot be ordered; 1,250 itself can. Graded
on the prepared volume as printed (1 decimal), so 1,250.04 mL passes.
Source: KCMH TPN team, 2026-10-25 (the TPN room's largest bottle); Pp, 2026-10-27: "ห้ามสั่ง".

```rule
{"rule": "CR-BOTTLE-MAX", "kind": "stop", "coded": {"TPN_BOTTLE_MAX_ML": 1250}, "where": [{"file": "data.js", "line": 789, "has": "const TPN_BOTTLE_MAX_ML = 1250;"}, {"file": "calculator.jsx", "line": 1937, "has": "const bagOverBottle = calc.totalTPN_mL > 0 && Number(D.displayNum(calc.preparedVol, 1)) > D.TPN_BOTTLE_MAX_ML;"}]}
{"case": "1,220.04 + 30 = 1,250.04 mL prints 1,250 and saves", "side": "inside", "infant": {"g": 7500}, "route": "Central", "fluid": 160, "order": {"Volume(mL/day)": 1220.04, "Dextrose final": 10, "Amino acid": 2.5}, "expect": {"no_alert": "Bag larger than the largest bottle", "submit": "no_reason"}}
{"case": "1,221 + 30 = 1,251 mL is refused", "side": "outside", "infant": {"g": 7500}, "route": "Central", "fluid": 160, "order": {"Volume(mL/day)": 1221, "Dextrose final": 10, "Amino acid": 2.5}, "expect": {"alert": "Bag larger than the largest bottle", "level": "crit", "submit": "blocked"}}
```

### CR-STOCK-ZERO · an ordered stock that rounds to 0 mL

When a stock the order holds rounds to 0 mL at the 0.1 mL the TPN room measures (under 0.05 mL,
`CR-R-STOCK-ML`), the order cannot be submitted; a draft can. Soluvit, Peditrace and the lipid syringe
cannot get there (1 mL/kg at 200 g is 0.2 mL).
Source: Pp, 2026-10-27 (PR #171): the back sheet must never ask for 0 mL of a drug the order holds.

```rule
{"rule": "CR-STOCK-ZERO", "kind": "stop", "where": [{"file": "calculator.jsx", "line": 1977, "has": "const stockAtZeroMl = stocksAtZeroMl.length > 0;"}]}
{"case": "700 g, no dead space: ZnSO₄ 0.0715 mg/kg is 0.05 mL, prints 0.1 and saves", "side": "inside", "infant": {"g": 700}, "route": "Central", "order": {"Volume(mL/day)": 100, "ปริมาตรคาสาย (dead space)": 0, "Dextrose final": 10, "Amino acid": 3, "ZnSO₄": 0.0715}, "expect": {"no_alert": "Stock rounds to 0 mL", "submit": "no_reason", "prints": "ZnSO₄ (Zn 1 mg/mL)0.05 mg Zn0.1"}}
{"case": "ZnSO₄ 0.071 mg/kg is 0.0497 mL: refused", "side": "outside", "infant": {"g": 700}, "route": "Central", "order": {"Volume(mL/day)": 100, "ปริมาตรคาสาย (dead space)": 0, "Dextrose final": 10, "Amino acid": 3, "ZnSO₄": 0.071}, "expect": {"alert": "Stock rounds to 0 mL", "level": "crit", "submit": "blocked", "shows": "ZnSO₄ ปัดแล้วเหลือ 0 mL"}}
```

### CR-EN-FEEDS-MAX · two feeds, at most 8 a day

With two feeds given, Feed 1's and Feed 2's feeds a day together above 8 cannot be submitted; a draft
can. The two share one schedule: q3h is 8, q4h is 6. Step 2 shows their total and its interval. A feed
with no volume is not given, so feed 1 empty beside feed 2 is a day of one feed, and one feed alone is
not checked (a q2h feed is 12): Q18.
Source: Pp, 2026-10-28: "Feed 1+2 รวมกันมากสุดจะได้แค่ 8 มื้อ หรือถ้ากินทุก 4 ชม ก็จะได้ 6 มื้อ". Not a
clinical threshold.

```rule
{"rule": "CR-EN-FEEDS-MAX", "kind": "stop", "coded": {"EN_FEEDS_PER_DAY_MAX": 8}, "where": [{"file": "data.js", "line": 401, "has": "const EN_FEEDS_PER_DAY_MAX = 8;"}, {"file": "calculator.jsx", "line": 1944, "has": "const feedsOverMax = twoFeeds && feedsPerDay > D.EN_FEEDS_PER_DAY_MAX;"}]}
{"case": "4 + 4 = 8 feeds a day (q3h): saves", "side": "inside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 10, "Frequency": 4}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 10, "Frequency": 4}, "expect": {"no_alert": "Feeds above 8 a day", "submit": "no_reason", "shows": "Feed 1 + 2 = 8 feeds/d · q3h"}}
{"case": "6 + 6 = 12 feeds a day (q2h): refused", "side": "outside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 10, "Frequency": 6}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 10, "Frequency": 6}, "expect": {"alert": "Feeds above 8 a day", "level": "crit", "no_alert": "Two feeds off a regular schedule", "submit": "blocked", "shows": "Feed 1 + Feed 2 รวม 12 มื้อ/วัน เกิน 8 มื้อ"}}
{"case": "3 + 3 = 6 feeds a day (q4h): saves", "side": "inside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 15, "Frequency": 3}, "feed2": "BM_HMF_24", "order2": {"Volume(mL/feed)": 15, "Frequency": 3}, "expect": {"no_alert": "Feeds above 8 a day", "shows": "Feed 1 + 2 = 6 feeds/d · q4h"}}
{"case": "feed 1 with no volume is not given: 8 + 8 saves", "side": "inside", "infant": {"g": 1000}, "order": {"Frequency": 8}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 10, "Frequency": 8}, "expect": {"no_alert": "Feeds above 8 a day", "submit": "no_reason"}}
{"case": "feed 2 alone at 12 a day (q2h), feed 1 empty: one feed, not checked", "side": "inside", "infant": {"g": 1000}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 8, "Frequency": 12}, "expect": {"no_alert": "Feeds above 8 a day", "submit": "no_reason"}}
{"case": "one feed at 12 a day (q2h): not checked", "side": "inside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 8, "Frequency": 12}, "expect": {"no_alert": "Feeds above 8 a day", "submit": "no_reason"}}
```

### CR-EN-FEED-UNKNOWN · a feed EN_DB does not hold

A feed given (mL/day above 0) whose key is not an `EN_DB` row, such as a row removed since the order was
saved or one written by a newer NeoFeed, has no composition: the order cannot be submitted or printed
until another milk is picked, and it is never costed as the other feed. Before two feeds such a key
stopped the Calculator with an error.
Source: Vera on this change, 2026-10-28. Not a clinical threshold.

```rule
{"rule": "CR-EN-FEED-UNKNOWN", "kind": "stop", "where": [{"file": "data.js", "line": 422, "has": "function enFeedsUnknown(feeds) {"}, {"file": "calculator.jsx", "line": 1962, "has": "const feedUnknown = feedsUnknown.length > 0;"}]}
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
(between the two the rule was that both feeds be given equally often, `CR-EN-FEEDS-EQUAL`). Whole
feeds and the shared hint: Vera on that change. Not a clinical threshold.

```rule
{"rule": "CR-EN-FEEDS-SCHEDULE", "kind": "stop", "where": [{"file": "calculator.jsx", "line": 1951, "has": "const feedsIrregular = twoFeeds && (!Number.isInteger(enFreq) || !Number.isInteger(enFreq2)"}]}
{"case": "3 + 4 = 7 a day: refused", "side": "outside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 15, "Frequency": 3}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 15, "Frequency": 4}, "expect": {"alert": "Two feeds off a regular schedule", "level": "crit", "submit": "blocked", "shows": "Feed 1 + Feed 2 รวม 7 มื้อ/วัน ไม่ลงตัวกับทุก ชม. เท่ากัน"}}
{"case": "6 + 2 = 8 a day (q3h): saves, each feed shown as its share of q3h", "side": "inside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 15, "Frequency": 6}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 15, "Frequency": 2}, "expect": {"no_alert": "Two feeds off a regular schedule", "submit": "no_reason", "shows": ["Feed 1 + 2 = 8 feeds/d · q3h", "6 of 8 feeds · q3h", "2 of 8 feeds · q3h"], "hides": "q12h"}}
{"case": "4.8 + 3.2 = 8 a day: refused, not whole feeds", "side": "outside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 15, "Frequency": 4.8}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 15, "Frequency": 3.2}, "expect": {"alert": "Two feeds off a regular schedule", "submit": "blocked"}}
{"case": "7.5 + 0.5 = 8 a day: refused", "side": "outside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 15, "Frequency": 7.5}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 15, "Frequency": 0.5}, "expect": {"alert": "Two feeds off a regular schedule", "submit": "blocked"}}
{"case": "4 + 2 = 6 a day (q4h): saves", "side": "inside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 15, "Frequency": 4}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 15, "Frequency": 2}, "expect": {"no_alert": "Two feeds off a regular schedule", "submit": "no_reason", "shows": "Feed 1 + 2 = 6 feeds/d · q4h"}}
{"case": "3 + 2 = 5 a day: refused", "side": "outside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 15, "Frequency": 3}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 15, "Frequency": 2}, "expect": {"alert": "Two feeds off a regular schedule", "submit": "blocked"}}
{"case": "feed 1 with no volume beside feed 2 at 4: one feed, not checked", "side": "inside", "infant": {"g": 1000}, "order": {"Frequency": 3}, "feed2": "PRENAN_22", "order2": {"Volume(mL/feed)": 15, "Frequency": 4}, "expect": {"no_alert": "Two feeds off a regular schedule", "submit": "no_reason"}}
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
{"rule": "CR-GIR-MAX", "kind": "critical", "coded": {"GIR_HARD_HI": 12}, "where": [{"file": "data.js", "line": 886, "has": "const GIR_HARD_HI = 12;"}, {"file": "data.js", "line": 662, "has": "gir: () => [4, 12],"}, {"file": "calculator.jsx", "line": 2004, "has": "if (calc.totalTPN_mL > 0 && sGir === \"crit\") alerts.push"}]}
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
{"rule": "CR-DEX-MAX", "kind": "critical", "coded": {"MAX_DEXTROSE_G_KG": 17.3}, "where": [{"file": "data.js", "line": 785, "has": "const MAX_DEXTROSE_G_KG = 17.3;"}, {"file": "calculator.jsx", "line": 2073, "has": "if (calc.dexGPerKg > D.MAX_DEXTROSE_G_KG) alerts.push"}]}
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
ch 42 p. 10). The 850 caution and the central 1,800 warning had no source and are gone.

```rule
{"rule": "CR-OSM-PERIPH", "kind": "critical", "coded": {"OSM_PERIPHERAL_MAX": 900}, "where": [{"file": "data.js", "line": 908, "has": "const OSM_PERIPHERAL_MAX = 900;"}, {"file": "calculator.jsx", "line": 1866, "has": "? (Number(D.displayNum(v, 0)) >= D.OSM_PERIPHERAL_MAX ? \"crit\" : \"ok\")"}, {"file": "calculator.jsx", "line": 2068, "has": "if (bagOrdered && sOsm === \"crit\") alerts.push"}]}
{"case": "peripheral, prints 899: no alert", "side": "inside", "infant": {"g": 1000}, "route": "Peripheral", "order": {"Volume(mL/day)": 100, "Dextrose final": 15, "Amino acid": 1.49}, "expect": {"no_alert": "Osmolarity > peripheral limit", "shows": "Osm 899 mOsm/L"}}
{"case": "peripheral, 899.6 prints 900: critical", "side": "outside", "infant": {"g": 1000}, "route": "Peripheral", "order": {"Volume(mL/day)": 100, "Dextrose final": 15, "Amino acid": 1.496}, "expect": {"alert": "Osmolarity > peripheral limit", "level": "crit", "submit": "asks_reason"}}
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
{"rule": "CR-K-BAG-RED", "kind": "critical", "coded": {"K_BAG_MEQ_PER_L.peripheral.warn": 40, "K_BAG_MEQ_PER_L.peripheral.red": 60, "K_BAG_MEQ_PER_L.central.warn": 60, "K_BAG_MEQ_PER_L.central.red": 120}, "where": [{"file": "calculator.jsx", "line": 2079, "has": "else if (kMeqPerLGraded > kLim.red) alerts.push"}, {"file": "calculator.jsx", "line": 2080, "has": "else if (kMeqPerLGraded > kLim.warn) alerts.push"}]}
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
{"rule": "CR-PROTEIN-MAX", "kind": "critical", "coded": {"PROTEIN_HARD_HI": 4.5}, "where": [{"file": "data.js", "line": 904, "has": "const PROTEIN_HARD_HI = 4.5;"}, {"file": "calculator.jsx", "line": 1810, "has": "const PRO_HARD = { hardHi: D.PROTEIN_HARD_HI };"}]}
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
{"rule": "CR-LIPID-IV-MAX", "kind": "critical", "coded": {"LIPID_IV_HARD_HI": 4}, "where": [{"file": "data.js", "line": 905, "has": "const LIPID_IV_HARD_HI = 4.0;"}, {"file": "calculator.jsx", "line": 1891, "has": "const hardLip = D.rangeStatus(ivLipidKg, tLip, { hardHi: D.LIPID_IV_HARD_HI }) === \"crit\";"}]}
{"case": "4.0 g/kg/d: not critical", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 4}, "expect": {"no_alert": "Lipid critically out of range"}}
{"case": "4.1 g/kg/d: critical", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 4.1}, "expect": {"alert": "Lipid critically out of range", "level": "crit", "submit": "asks_reason"}}
```

### CR-LIPID-RATE · lipid infusion rate

g/kg/h = IV lipid g/kg/d ÷ hours infused (16, 20 or 24), rounded to 2 decimals as the pump card shows it,
then graded: amber above 0.13, critical above 0.17.
Source: TPN team 2026-09-28, Pp: "lipid เพดาน 0.13-0.17 g/kg/h". Koletzko 2005 (p. S20): infants at most
3–4 g/kg/d "(0.13–0.17 g/kg per hour)". ESPGHAN 2018 gives no hourly limit and advises lipid over 24 h in
newborns (Lapillonne R 4.10). Thai CPG Table 3.2: 0.17 for preterm, term and infants, 0.13 only over
1 year; so the amber at 0.13 fires from about 3.1 g/kg/d over 24 h, a dose R 4.3 allows: Q11.

```rule
{"rule": "CR-LIPID-RATE", "kind": "critical", "coded": {"LIPID_GKGH": {"warn": 0.13, "max": 0.17}}, "where": [{"file": "data.js", "line": 819, "has": "const LIPID_GKGH = { warn: 0.13, max: 0.17 };"}, {"file": "calculator.jsx", "line": 1871, "has": "const lipidGkgh = lipidPerKg > 0 && lipidDripHours > 0 ? Math.round(lipidPerKg / lipidDripHours * 100) / 100 : 0;"}]}
{"case": "3.1 g over 24 h = 0.13: no caution", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 3.1}, "expect": {"no_alert": "Lipid rate near the ceiling"}}
{"case": "3.25 g over 24 h = 0.14: caution", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 3.25}, "expect": {"alert": "Lipid rate near the ceiling", "level": "warn"}}
{"case": "3.4 g over 20 h = 0.17: not critical", "side": "inside", "infant": {"g": 1000}, "route": "Central", "hours": 20, "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 3.4}, "expect": {"no_alert": "Lipid rate above the ceiling"}}
{"case": "3.5 g over 20 h = 0.18: critical", "side": "outside", "infant": {"g": 1000}, "route": "Central", "hours": 20, "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 3.5}, "expect": {"alert": "Lipid rate above the ceiling", "level": "crit", "submit": "asks_reason"}}
```

### CR-K-IV-MAX · IV potassium ceiling

Critical above 5.0 mEq/kg/d of K⁺ in the bag (KCl + K₂HPO₄), at every weight and day. Feed K⁺ is not
counted; the tile shows the total against `CR-TGT-K`.
Source: TPN team, 2026-10-25 (it was 3.5, unsourced); 5 is Jochum Table 3's upper bound for preterm
< 1,500 g in stable growth, applied to every weight by Pp (2026-10-27). No source states a per-kg maximum
(Jochum Tables 1–3; Avery ch 20 p. 12; Fanaroff ch 42 p. 13). Jochum tops out at 3 for term and ≥ 1,500 g
infants, so 3–5 shows amber only there: Q12.

```rule
{"rule": "CR-K-IV-MAX", "kind": "critical", "coded": {"K_IV_HARD_HI": 5}, "where": [{"file": "data.js", "line": 906, "has": "const K_IV_HARD_HI = 5.0;"}, {"file": "calculator.jsx", "line": 1892, "has": "const hardK   = D.rangeStatus(ivKKg, tK, { hardHi: D.K_IV_HARD_HI }) === \"crit\";"}]}
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
{"rule": "CR-KCAL-MAX", "kind": "critical", "coded": {"KCAL_HARD_HI": 160}, "where": [{"file": "data.js", "line": 890, "has": "const KCAL_HARD_HI = 160;"}, {"file": "calculator.jsx", "line": 1817, "has": "const kcalStatusAt = (v) => D.rangeStatus(v, tKcal, { hardHi: D.KCAL_HARD_HI });"}]}
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
{"rule": "CR-ZN-MAX", "kind": "critical", "coded": {"MAX_ZN_MG_DAY": 5, "KCMH_STOCK.peditrace.znMgPerMl": 0.25, "KCMH_STOCK.znso4.znMgPerMl": 1}, "where": [{"file": "data.js", "line": 822, "has": "const MAX_ZN_MG_DAY = 5;"}, {"file": "calculator.jsx", "line": 1585, "has": "const znTotal_mg = znPeditrace_mg + znSO4_mg;"}, {"file": "calculator.jsx", "line": 2086, "has": "if (calc.znTotal_mg > D.MAX_ZN_MG_DAY) alerts.push"}]}
{"case": "5 kg: Peditrace 1.25 + ZnSO₄ 3.75 = 5 mg/day, not over", "side": "inside", "infant": {"g": 5000}, "route": "Central", "fluid": 140, "order": {"Volume(mL/day)": 600, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 3, "ZnSO₄": 0.75}, "expect": {"no_alert": "Zinc total above 5 mg/day"}}
{"case": "5 kg: 1.25 + 3.8 = 5.05 mg/day, critical", "side": "outside", "infant": {"g": 5000}, "route": "Central", "fluid": 140, "order": {"Volume(mL/day)": 600, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 3, "ZnSO₄": 0.76}, "expect": {"alert": "Zinc total above 5 mg/day", "level": "crit", "submit": "asks_reason"}}
```

### CR-WT-MANUAL · a typed weight far from the automatic one

A TPN calc. weight typed more than 20 % away from the automatic weight (`CR-U-DOSING-WEIGHT`) is
critical; exactly 20 % is not (float noise stripped). Only a typed weight is judged.
Source: Pp, 2026-10-08: "ต่างเกิน 20%". Not a clinical threshold.

```rule
{"rule": "CR-WT-MANUAL", "kind": "critical", "coded": {"TPN_WT_MANUAL_MAX_DIFF": 0.2}, "where": [{"file": "data.js", "line": 832, "has": "const TPN_WT_MANUAL_MAX_DIFF = 0.2;"}, {"file": "calculator.jsx", "line": 1999, "has": "const tpnWtFar = !tpnWtOutOfRange && Number(tpnWtDiff.toPrecision(12)) > D.TPN_WT_MANUAL_MAX_DIFF;"}]}
{"case": "1,200 g typed against 1,000 g automatic (20 %): saves", "side": "inside", "infant": {"g": 1000}, "order": {"TPN calc. weight": 1200}, "expect": {"no_alert": "TPN calc. weight far from automatic", "submit": "no_reason"}}
{"case": "1,201 g typed: critical", "side": "outside", "infant": {"g": 1000}, "order": {"TPN calc. weight": 1201}, "expect": {"alert": "TPN calc. weight far from automatic", "level": "crit", "submit": "asks_reason"}}
```

### CR-CAP-NO-P · calcium with no phosphate

Calcium ordered with zero phosphate from every source (bag, feed, and oral supplement when one is
ordered) is critical: the ratio is Infinity.
Source: Avery ch 83 p. 14 and Fanaroff ch 91 p. 21: calcium without enough phosphate gives hypercalcaemia
with hypophosphataemia; ESPGHAN 2022 C4 (Embleton p. 255). No source sets the severity tier.

```rule
{"rule": "CR-CAP-NO-P", "kind": "critical", "where": [{"file": "calculator.jsx", "line": 2057, "has": "if (caPStatus === \"crit\") alerts.push"}, {"file": "data.js", "line": 868, "has": "if (!isFinite(value)) return value > 0 ? \"crit\" : \"empty\";"}]}
{"case": "Ca 40 mg/kg/d with no phosphate: critical", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 2, "10% Ca gluconate": 40}, "expect": {"alert": "Ca:P ratio — ไม่มี P", "level": "crit", "submit": "asks_reason"}}
{"case": "Ca 40 with Glycophos: no such alert", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 2, "10% Ca gluconate": 40, "Glycophos": 2}, "expect": {"no_alert": "Ca:P ratio — ไม่มี P"}}
```

### CR-BAG-OVERFULL · components larger than the bag

When the stock volumes add up to more than the prepared volume, the WFI is negative and the order is
critical. As coded it is a critical alert, so a reason lets it through and the form prints a negative
WFI: Q2.
Source: the KCMH worksheet's WFI q.s. (I53 = prepared − Σ components). Not a clinical threshold.

```rule
{"rule": "CR-BAG-OVERFULL", "kind": "critical", "where": [{"file": "calculator.jsx", "line": 2087, "has": "if (bagOrdered && calc.wfiVol < 0) alerts.push"}]}
{"case": "10 mL of D25 with amino acid 3 and no dead space: critical", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 10, "ปริมาตรคาสาย (dead space)": 0, "Dextrose final": 25, "Amino acid": 3}, "expect": {"alert": "Bag cannot be compounded", "level": "crit", "submit": "asks_reason"}}
{"case": "100 mL of the same: fits", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "ปริมาตรคาสาย (dead space)": 0, "Dextrose final": 25, "Amino acid": 3}, "expect": {"no_alert": "Bag cannot be compounded"}}
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
The old > 32 ceiling is gone because 30–40 is a minimum. Q3.

```rule
{"rule": "CR-NPE-AA", "kind": "red", "coded": {"NPE_IV_CRIT_LO": 12}, "where": [{"file": "data.js", "line": 907, "has": "const NPE_IV_CRIT_LO = 12;"}, {"file": "data.js", "line": 725, "has": "npePerGAA: () => [24, Infinity],"}, {"file": "calculator.jsx", "line": 1890, "has": "const ivNpeN    = calc.aaG > 0 ? (calc.tpnKcal - calc.aaG * 4) / calc.aaG : null;"}, {"file": "calculator.jsx", "line": 1905, "has": "const critLowNPE = ivNpeN !== null && ivNpeN < D.NPE_IV_CRIT_LO;"}, {"file": "calculator.jsx", "line": 1906, "has": "const lowNPE  = ivNpeN !== null && !critLowNPE && ivNpeN < 20;"}]}
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
{"rule": "CR-HEPARIN", "kind": "caution", "coded": {"HEPARIN_USUAL_MAX_U_ML": 1, "KCMH_STOCK.heparin.unitsPerMl": 100}, "where": [{"file": "data.js", "line": 796, "has": "const HEPARIN_USUAL_MAX_U_ML = 1;"}, {"file": "calculator.jsx", "line": 2094, "has": "if (calc.totalTPN_mL > 0 && heparinUmL > D.HEPARIN_USUAL_MAX_U_ML) alerts.push"}]}
{"case": "1 U/mL: no caution", "side": "inside", "infant": {"g": 1500}, "route": "Central", "order": {"Volume(mL/day)": 150, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 1, "Heparin": 1}, "expect": {"no_alert": "Heparin above the usual dose"}}
{"case": "1.5 U/mL: caution", "side": "outside", "infant": {"g": 1500}, "route": "Central", "order": {"Volume(mL/day)": 150, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 1, "Heparin": 1.5}, "expect": {"alert": "Heparin above the usual dose", "level": "warn"}}
```

### CR-VITD · oral vitamin D per day

Amber above 1,000 IU/day: Step 6's IU/kg/d × weight, plus Munti-vim's 400 IU when ticked.
Source: KCMH nutrition unit, 2026-10-25: "ตั้ง upper border ไว้ที่ 1,000 IU/day". ESPGHAN 2022, Embleton
R1 (p. 257): 400–700 IU/kg/d "with a maximum dose of 1000 IU/d"; Fanaroff ch 91 p. 12: 1,000 IU/day is the
safe upper limit under 6 months.

```rule
{"rule": "CR-VITD", "kind": "caution", "coded": {"VIT_D_MAX_IU_DAY": 1000}, "where": [{"file": "data.js", "line": 793, "has": "const VIT_D_MAX_IU_DAY = 1000;"}, {"file": "calculator.jsx", "line": 2098, "has": "if (vitDIuDay > D.VIT_D_MAX_IU_DAY) alerts.push"}]}
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
{"rule": "CR-MEN-MAX", "kind": "caution", "coded": {"MEN_MAX_ML_KG": 24}, "where": [{"file": "data.js", "line": 843, "has": "const MEN_MAX_ML_KG = 24;"}, {"file": "calculator.jsx", "line": 2065, "has": "if (isMEN && calc.enVolPerKg > D.MEN_MAX_ML_KG) alerts.push"}]}
{"case": "MEN 3 mL × 8 = 24 mL/kg/d: no caution", "side": "inside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 3, "Frequency": 8}, "tick": {"MEN (trophic)": true}, "expect": {"no_alert": "MEN ticked above trophic volume"}}
{"case": "MEN 3.1 mL × 8 = 24.8 mL/kg/d: caution", "side": "outside", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 3.1, "Frequency": 8}, "tick": {"MEN (trophic)": true}, "expect": {"alert": "MEN ticked above trophic volume", "level": "warn"}}
```

### CR-AA-MISSING · a bag with no amino acid

A bag with volume and no amino acid is amber: a day without it can be meant, but left out by mistake it
reached pharmacy as "not ordered" with nothing on screen.
Source: Pp, 2026-10-21. A bag without Ca, P or Mg gets no caution (TPN team, 2026-10-25; Pp, 2026-10-27).

```rule
{"rule": "CR-AA-MISSING", "kind": "caution", "where": [{"file": "calculator.jsx", "line": 2043, "has": "if (calc.totalTPN_mL > 0 && !(aaPerKg > 0)) alerts.push"}]}
{"case": "D10 with no amino acid: caution", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10}, "expect": {"alert": "Amino acid not ordered", "level": "warn"}}
{"case": "amino acid 1 g/kg/d: none", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 1}, "expect": {"no_alert": "Amino acid not ordered"}}
```

### CR-CAPHOS-COMPAT · calcium with inorganic phosphate

Calcium with K₂HPO₄ in one bag is amber: NeoFeed does not calculate precipitation risk, pharmacy
checks it. Glycophos (organic phosphate) raises no caution.
Source: ESPGHAN/ESPEN/ESPR/CSPEN 2018 (the alert's citation).

```rule
{"rule": "CR-CAPHOS-COMPAT", "kind": "caution", "where": [{"file": "calculator.jsx", "line": 2100, "has": "if (calc.totalTPN_mL > 0 && caPerKg > 0 && k2hpo4 > 0) alerts.push"}]}
{"case": "Ca with K₂HPO₄: caution", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 2, "10% Ca gluconate": 40, "K₂HPO₄": 1}, "expect": {"alert": "Calcium–phosphate compatibility not calculated", "level": "warn"}}
{"case": "Ca with Glycophos: none", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 2, "10% Ca gluconate": 40, "Glycophos": 2}, "expect": {"no_alert": "Calcium–phosphate compatibility not calculated"}}
```

### CR-FLUID-PLAN · prescribed fluid against the plan

When the bag has volume and prescribed fluid (`CR-U-FLUID`) differs from the target by more than
20 mL/kg/d, an info line says so; the attending decides. The fluid tile has no hard limit.
Source: none needed; the 20 mL/kg/d margin is the code's own.

```rule
{"rule": "CR-FLUID-PLAN", "kind": "caution", "where": [{"file": "calculator.jsx", "line": 2069, "has": "Math.abs(calc.totalFluidPerKg - fluidTargetPerKg) > 20) alerts.push"}]}
{"case": "130 against a plan of 150 (20 off): none", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 130, "Dextrose final": 10, "Amino acid": 2}, "expect": {"no_alert": "Fluid: prescribed ≠ target"}}
{"case": "129 against 150 (21 off): info", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 129, "Dextrose final": 10, "Amino acid": 2}, "expect": {"alert": "Fluid: prescribed ≠ target", "level": "info"}}
```

## Caps that change the dose

### CR-SOLUVIT-CAP · Soluvit N

1 mL/kg/d to the infant, at most 10 mL/day, then × the overfill so the infant receives it; rounded to
1 decimal. With no TPN volume, 0. The 10 mL cap needs more than 10 kg, above the 8 kg weight limit, so
no orderable infant reaches it.
Source: the KCMH worksheet, row 43 (1 mL/kg, max 10); Soluvit N datasheet (Medsafe, 2021) §4.2: under
10 kg 1 mL/kg, from 10 kg one 10 mL vial; Thai CPG PDF p. 116. The overfill is Pp's, 2026-09-18 (the sheet
uses actual weight).

```rule
{"rule": "CR-SOLUVIT-CAP", "kind": "cap", "coded": {"KCMH_STOCK.soluvit.mlPerKg": 1, "KCMH_STOCK.soluvit.maxMl": 10}, "where": [{"file": "data.js", "line": 772, "has": "mlPerKg: 1.0, maxMl: 10 },"}, {"file": "calculator.jsx", "line": 1570, "has": "Math.min(S.soluvit.mlPerKg   * wtKg, S.soluvit.maxMl  ) * overfill"}]}
{"case": "1 kg, 100 + 30 mL: 1.3 mL in the bag", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3}, "expect": {"shows": "Soluvit N (water-sol.)1.3mL/day"}}
{"case": "8 kg, no dead space: 8 mL", "side": "inside", "infant": {"g": 8000}, "route": "Central", "fluid": 120, "order": {"Volume(mL/day)": 800, "ปริมาตรคาสาย (dead space)": 0, "Dextrose final": 10, "Amino acid": 3}, "expect": {"shows": "Soluvit N (water-sol.)8mL/day"}}
{"case": "11 kg (refused by CR-WT-RANGE): capped at 10 mL", "side": "outside", "infant": {"g": 11000}, "route": "Central", "fluid": 120, "order": {"Volume(mL/day)": 800, "ปริมาตรคาสาย (dead space)": 0, "Dextrose final": 10, "Amino acid": 3}, "expect": {"shows": "Soluvit N (water-sol.)10mL/day"}}
```

### CR-PEDITRACE-CAP · Peditrace

1 mL/kg/d, at most 15 mL/day, × the overfill, 1 decimal; 0 with no TPN volume. Its zinc counts toward
`CR-ZN-MAX` at the mL delivered. The 15 mL cap is out of reach of an orderable weight, as for Soluvit.
Source: the KCMH worksheet, row 45 (1 mL/kg, max 15); Peditrace SmPC (HPRA, 2019) §4.2: 1 mL/kg/d "to a
maximum daily dose of 15 ml"; Thai CPG PDF p. 116. Zn 250 µg/mL, pharmacy, 2026-10-25.

```rule
{"rule": "CR-PEDITRACE-CAP", "kind": "cap", "coded": {"KCMH_STOCK.peditrace.mlPerKg": 1, "KCMH_STOCK.peditrace.maxMl": 15}, "where": [{"file": "data.js", "line": 774, "has": "mlPerKg: 1.0, maxMl: 15, znMgPerMl: 0.25 },"}, {"file": "calculator.jsx", "line": 1571, "has": "Math.min(S.peditrace.mlPerKg * wtKg, S.peditrace.maxMl) * overfill"}]}
{"case": "8 kg, no dead space: 8 mL", "side": "inside", "infant": {"g": 8000}, "route": "Central", "fluid": 120, "order": {"Volume(mL/day)": 800, "ปริมาตรคาสาย (dead space)": 0, "Dextrose final": 10, "Amino acid": 3}, "expect": {"shows": "Peditrace8mL/day"}}
{"case": "16 kg (refused by CR-WT-RANGE): capped at 15 mL", "side": "outside", "infant": {"g": 16000}, "route": "Central", "fluid": 120, "order": {"Volume(mL/day)": 800, "ปริมาตรคาสาย (dead space)": 0, "Dextrose final": 10, "Amino acid": 3}, "expect": {"shows": "Peditrace (Zn 250 µg/mL)15 mL/day in bag"}}
```

### CR-VITALIPID-CAP · Vitalipid N Infant

4 mL/kg/d, at most 10 mL/day, only when lipid is ordered (it rides in the lipid syringe; no overfill).
It counts toward prescribed fluid. The 4 and the 10 are literals in `calculator.jsx`, not `data.js`.
Source: Vitalipid N Infant SmPC (HPRA, 2022) §4.2: 4 mL/kg/d up to 2.5 kg, 10 mL/day above it; the
Singapore label: "must not exceed 10 ml"; Thai CPG PDF p. 116. Both labels say to add it only to Intralipid
10 % or 20 %, and KCMH gives SMOF 20 %: Q4.

```rule
{"rule": "CR-VITALIPID-CAP", "kind": "cap", "where": [{"file": "calculator.jsx", "line": 1450, "has": "const vitalipidVol = lipidPerKg > 0 ? Math.min(4 * wtKg, 10) : 0;"}]}
{"case": "2.4 kg: 9.6 mL", "side": "inside", "infant": {"g": 2400}, "route": "Central", "order": {"Volume(mL/day)": 300, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 2}, "expect": {"shows": "Vitalipid N Infant (fat-sol.)9.6mL/day"}}
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
{"rule": "CR-TGT-FLUID", "kind": "target", "where": [{"file": "data.js", "line": 635, "has": "fluid: (dol, wtG, bwG) => {"}, {"file": "calculator.jsx", "line": 1763, "has": "const tFluid = D.TARGETS.fluid(dol, wtG, patient?.bw);"}]}
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
{"rule": "CR-TGT-PROTEIN", "kind": "target", "where": [{"file": "data.js", "line": 513, "has": "if (dol <= 1) return [1.5, 2.5];   // Day 1: start ≥1.5"}, {"file": "data.js", "line": 597, "has": "protein: () => [3.5, 4.0],"}]}
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
{"rule": "CR-TGT-KCAL", "kind": "target", "where": [{"file": "data.js", "line": 524, "has": "if (dol <= 7) return [70, 100];    // Intermediate"}, {"file": "data.js", "line": 600, "has": "kcal: () => [115, 140],"}]}
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
{"rule": "CR-TGT-LIPID", "kind": "target", "where": [{"file": "data.js", "line": 531, "has": "if (dol <= 1) return [0.5, 1.0];  // Day 1: start 0.5–1 g/kg"}, {"file": "data.js", "line": 603, "has": "lipid: () => [4.8, 8.1],"}]}
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
{"rule": "CR-TGT-NA", "kind": "target", "where": [{"file": "data.js", "line": 542, "has": "na: (dol, wtG, bwG) => {"}, {"file": "data.js", "line": 606, "has": "na: () => [3.0, 5.0],"}]}
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
{"rule": "CR-TGT-K", "kind": "target", "where": [{"file": "data.js", "line": 551, "has": "k: (dol, wtG, bwG) => {"}, {"file": "data.js", "line": 609, "has": "k: () => [2.3, 4.6],"}]}
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
{"rule": "CR-TGT-CA", "kind": "target", "coded": {"FIRST_DAYS_LAST_DOL": 7}, "where": [{"file": "data.js", "line": 495, "has": "const FIRST_DAYS_LAST_DOL = 7;"}, {"file": "data.js", "line": 699, "has": "if (isEnteral) return [120, 200];"}]}
{"case": "PN DOL 7", "side": "inside", "fn": "TPN_TARGETS.ca", "args": [7], "want": [32, 80]}
{"case": "PN DOL 8", "side": "outside", "fn": "TPN_TARGETS.ca", "args": [8], "want": [64, 140]}
{"case": "enteral", "fn": "TARGETS.ca", "args": [8, true], "want": [120, 200]}
```

### CR-TGT-P · phosphorus band

mg/kg/d. PN: DOL 1–7 31–62, DOL 8 on 50–108. Enteral 70–115.
Source: Mihatsch 2018: first days 1.0–2.0 mmol/kg, growing premature 1.6–3.5 mmol/kg, × 31 (corrected from
46–62 on 2026-08-27). Enteral: ESPGHAN 2022, 2.2–3.7 mmol/kg.

```rule
{"rule": "CR-TGT-P", "kind": "target", "where": [{"file": "data.js", "line": 576, "has": "return [50, 108];                          // Growing: 1.6–3.5 mmol×31"}, {"file": "data.js", "line": 707, "has": "if (isEnteral) return [70, 115];"}]}
{"case": "PN DOL 7", "side": "inside", "fn": "TPN_TARGETS.p", "args": [7], "want": [31, 62]}
{"case": "PN DOL 8", "side": "outside", "fn": "TPN_TARGETS.p", "args": [8], "want": [50, 108]}
{"case": "enteral", "fn": "TARGETS.p", "args": [8, true], "want": [70, 115]}
```

### CR-TGT-MG · magnesium band

mEq/kg/d (Mg is dosed in mEq): DOL 1–7 0.2–0.4, DOL 8 on 0.4–0.6. Parenteral only; feeds carry no Mg in
`EN_DB`. Graded in mEq because the guideline's mg figures are rounded and would flag the exact bounds.
Source: Mihatsch 2018: first days 0.1–0.2 mmol/kg, growing 0.2–0.3 mmol/kg, × 2.

```rule
{"rule": "CR-TGT-MG", "kind": "target", "where": [{"file": "data.js", "line": 714, "has": "mg: (dol) => TPN_TARGETS.mg(dol),"}, {"file": "calculator.jsx", "line": 1786, "has": "const tMg = D.TARGETS.mg(dol);"}]}
{"case": "DOL 7", "side": "inside", "fn": "TARGETS.mg", "args": [7], "want": [0.2, 0.4]}
{"case": "DOL 8", "side": "outside", "fn": "TARGETS.mg", "args": [8], "want": [0.4, 0.6]}
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
{"rule": "CR-TGT-CAP", "kind": "target", "where": [{"file": "data.js", "line": 718, "has": "caP: () => [1.0, 1.7],   // mass ratio; ESPGHAN molar"}, {"file": "calculator.jsx", "line": 1827, "has": "const sCaP = D.rangeStatus(calc.caP, tCaP);"}]}
{"case": "Ca 52.6 / P 31 = 1.697: in range", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 2, "10% Ca gluconate": 52.6, "Glycophos": 2}, "expect": {"no_alert": "Ca:P ratio off target"}}
{"case": "Ca 53 / P 31 = 1.71: amber", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 2, "10% Ca gluconate": 53, "Glycophos": 2}, "expect": {"alert": "Ca:P ratio off target", "level": "warn"}}
{"case": "Ca 52.7 / P 31 = 1.7 on paper: graded amber (Q7)", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 2, "10% Ca gluconate": 52.7, "Glycophos": 2}, "expect": {"alert": "Ca:P ratio off target", "shows": "Ca:P ratioHigh1.7:1 (mass)"}}
{"case": "Ca 31 / P 31 = 1.0: in range", "side": "inside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 2, "10% Ca gluconate": 31, "Glycophos": 2}, "expect": {"no_alert": "Ca:P ratio off target"}}
{"case": "Ca 30 / P 31 = 0.97: amber", "side": "outside", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 12, "Amino acid": 3, "20% lipid": 2, "10% Ca gluconate": 30, "Glycophos": 2}, "expect": {"alert": "Ca:P ratio off target"}}
```

### CR-TGT-PE · protein : energy

2.8–3.6 g protein per 100 kcal. The tile is always graded; its alert fires only when the feed is above
100 mL/kg/d and not MEN.
Source: ESPGHAN 2022, Embleton Table 1.

```rule
{"rule": "CR-TGT-PE", "kind": "target", "where": [{"file": "calculator.jsx", "line": 2060, "has": "if (!isMEN && calc.enVolPerKg > 100 && sPE === \"warn\") alerts.push"}, {"file": "calculator.jsx", "line": 1796, "has": "const tPE  = D.TARGETS.peRatio();"}]}
{"case": "Hi-Q LBW 24 at 152 mL/kg/d (3.3 g/100 kcal): in range", "side": "inside", "infant": {"g": 1000}, "fluid": 160, "feed": "FBM_PF_24", "order": {"Volume(mL/feed)": 19, "Frequency": 8}, "expect": {"no_alert": "Protein : Energy off target"}}
{"case": "breast milk at 152 mL/kg/d (1.8 g/100 kcal): amber", "side": "outside", "infant": {"g": 1000}, "fluid": 160, "order": {"Volume(mL/feed)": 19, "Frequency": 8}, "expect": {"alert": "Protein : Energy off target", "level": "warn"}}
```

## Units and conventions

### CR-U-DOSING-WEIGHT · the weight every dose is computed from

Every per-kg figure is per day on the TPN calc. weight: today's weight, held at birth weight while the
infant is below it, unless the attending types another (`CR-WT-MANUAL`, `CR-WT-RANGE`). kg = g ÷ 1,000.
Source: KCMH bedside convention (the code's comment); typed override since 2026-09-15.

```rule
{"rule": "CR-U-DOSING-WEIGHT", "kind": "unit", "where": [{"file": "calculator.jsx", "line": 697, "has": "const autoWtG = (bwG > 0 && curWtG > 0 && curWtG < bwG) ? bwG : curWtG;"}, {"file": "calculator.jsx", "line": 698, "has": "const wtG = tpnWtOverrideG > 0 ? tpnWtOverrideG : autoWtG;"}]}
{"case": "900 g, born 1,000 g: doses on 1,000 g (GIR 6.9, not 7.7)", "infant": {"g": 900, "bw": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3}, "expect": {"shows": ["= birth weight (not yet regained)", "GIR6.9mg/kg/min"]}}
{"case": "1,100 g, born 1,000 g: doses on 1,100 g (GIR 6.3)", "infant": {"g": 1100, "bw": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3}, "expect": {"shows": "GIR6.3mg/kg/min"}}
```

### CR-U-FLUID · prescribed fluid

mL/kg/d. Prescribed = TPN delivered + the lipid syringe (20 % lipid at 0.2 g/mL + Vitalipid) + other IV
+ drug volume + counted feed. The dead space is not given to the infant and is not counted. A MEN feed
is not counted (`CR-U-MEN`).
Source: NeoFeed's own Step 1 fluid plan, not a guideline.

```rule
{"rule": "CR-U-FLUID", "kind": "unit", "coded": {"KCMH_STOCK.smof20.gPerMl": 0.2}, "where": [{"file": "calculator.jsx", "line": 1509, "has": "const prescribedFluid = totalTPN_mL + lipidBagVol + otherIV_mL + drug_mL + enCounted;"}, {"file": "calculator.jsx", "line": 1442, "has": "const lipidVol = lipidG / 0.20;"}]}
{"case": "1 kg: TPN 100 + lipid 5 + Vitalipid 4 + feed 24 = 133", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 1, "Volume(mL/feed)": 3, "Frequency": 8}, "expect": {"shows": "Plan 150 · Prescribed 133 mL/d"}}
{"case": "the same feed ticked MEN: 109", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 1, "Volume(mL/feed)": 3, "Frequency": 8}, "tick": {"MEN (trophic)": true}, "expect": {"shows": "Plan 150 · Prescribed 109 mL/d"}}
```

### CR-U-FACTOR · delivered, prepared and the Factor

The TPN volume is what the pump delivers in 24 h. Pharmacy prepares delivered + dead space. Factor =
kg × prepared ÷ delivered, and every per-kg dose in the bag is × Factor, so the infant receives the dose
as ordered while the bag holds more. GIR, osmolarity and K⁺ mEq/L do not move with the dead space. Lipid is a
separate syringe with no overfill. Heparin is per mL of the prepared bag.
Source: the KCMH worksheet (C7 delivered, G7 prepared, G8 dead space, H9 Factor).

```rule
{"rule": "CR-U-FACTOR", "kind": "unit", "where": [{"file": "calculator.jsx", "line": 1434, "has": "const preparedVol = totalTPN_mL > 0 ? totalTPN_mL + deadVol_mL : 0;"}, {"file": "calculator.jsx", "line": 1436, "has": "const factor = wtKg * overfill;                                     // H9"}]}
{"case": "1 kg, 100 mL + 30 mL dead space: Factor 1.3", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3, "20% lipid": 2}, "expect": {"shows": ["Prepared (เตรียมจริง)130 mL/daydelivered 100 mLFactor1.3", "Lipid volume10 mL/day"], "prints": "Dextrose Final Conc.10% = 13 g in bag = 26 mL (D50W) · delivered 10 g = 10 g/kg/d"}}
```

### CR-U-DEAD-SPACE · dead space default

A new order on a newborn ward starts at 30 mL of dead space; an order copied from one with a dead space
keeps it, and a saved order keeps its own. No TPN volume, no dead space (and no bag). Every ward is a
newborn ward today (`OLDER_CHILD_WARDS` is empty).
Source: Pp, 2026-09-18: "ใน SCN+NICU แก้เป็น +30 ml อัตโนมัติไปเลย".

```rule
{"rule": "CR-U-DEAD-SPACE", "kind": "unit", "coded": {"NEWBORN_DEAD_VOL_ML": 30, "OLDER_CHILD_WARDS": []}, "where": [{"file": "data.js", "line": 2148, "has": "const NEWBORN_DEAD_VOL_ML = 30;"}, {"file": "calculator.jsx", "line": 131, "has": "return v > 0 ? v : window.NEOFEED_DATA.defaultDeadVolFor(patient);"}]}
{"case": "a NICU bed starts at 30 mL", "fn": "defaultDeadVolFor", "args": [{"currentBed": "NICU 5"}], "want": 30}
```

### CR-U-GIR · glucose infusion rate

GIR (mg/kg/min) = TPN delivered mL × dextrose % ÷ 100 × 1,000 ÷ (1,440 × kg). The dextrose % is the
final concentration of the prepared bag, so the infant receives it in the delivered volume. D50W mL =
dextrose g in the prepared bag ÷ 0.5. g/kg/d = GIR × 1.44.
Source: standard; matches the KCMH worksheet (D10, F10).

```rule
{"rule": "CR-U-GIR", "kind": "unit", "coded": {"KCMH_STOCK.d50w.gPerMl": 0.5}, "where": [{"file": "calculator.jsx", "line": 1457, "has": "const gir = dexG * 1000 / (1440 * wtKg);"}, {"file": "data.js", "line": 939, "has": "return gir * 1.44;  // mg/kg/min × 1.44 = g/kg/day"}]}
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
{"rule": "CR-U-ENERGY", "kind": "unit", "where": [{"file": "calculator.jsx", "line": 1514, "has": "const dexKcal = dexG * 3.4;"}, {"file": "calculator.jsx", "line": 1515, "has": "const aaKcal = aaG * 4;"}, {"file": "calculator.jsx", "line": 1519, "has": "const lipidKcal = lipidG * 9;"}]}
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
{"rule": "CR-U-OSM", "kind": "unit", "where": [{"file": "data.js", "line": 920, "has": "function estimateOsmolarity({ dexPct, aaPct, naMeqPerL, kMeqPerL, caMgPerL = 0, mgMeqPerL = 0 }) {"}, {"file": "calculator.jsx", "line": 1645, "has": "const osm = D.estimateOsmolarity({"}]}
{"case": "D10, AA 2 %, Na 30, K 20, Ca 400 mg/L, Mg 3: 831", "fn": "estimateOsmolarity", "args": [{"dexPct": 10, "aaPct": 2, "naMeqPerL": 30, "kMeqPerL": 20, "caMgPerL": 400, "mgMeqPerL": 3}], "want": 831, "within": 1e-9}
{"case": "1 kg, 100 mL of D10 with AA 3: 800", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "Dextrose final": 10, "Amino acid": 3}, "expect": {"shows": "Osm 800 mOsm/L"}}
```

### CR-U-SALTS · electrolyte units and stock strengths

What each field takes, and the divisor that turns it into stock mL (`KCMH_STOCK`, the KCMH shelf):

| field | typed as | stock |
|---|---|---|
| 20 % NaCl | mEq Na/kg/d | 3.42 mEq/mL |
| Na acetate | mEq Na/kg/d | 3 mEq Na/mL (acetate not shown: `acetateMeqPerMl` is null) |
| Glycophos | **mEq Na/kg/d**, halved to mmol P | 2 mEq Na + 1 mmol P (31 mg) per mL |
| KCl | mEq K/kg/d | 2 mEq/mL |
| K₂HPO₄ | mEq K/kg/d | 1 mEq K + 15.5 mg P per mL |
| MgSO₄ 10 % | mEq Mg/kg/d | 0.812 mEq/mL (KCMH uses 10 % only; a row saved as 50 % computes as 10 %) |
| 10 % Ca gluconate | elemental Ca mg/kg/d | 9.01755 mg/mL (0.45 mEq) |
| ZnSO₄ | elemental Zn mg/kg/d | 1 mg/mL |
| Heparin | U/mL of the prepared bag | 100 U/mL |
| Amino acid | g/kg/d | Aminoven 10 %, 0.1 g/mL |

Source: the official KCMH pharmacy worksheet (verified 2026-08-06; `test/verify-kcmh-constants.cjs`
holds an independent transcription); Na acetate 3 and KCl 2 confirmed by the TPN team and Pp on
2026-09-28; ZnSO₄ by pharmacy on 2026-10-25. The P per mL of Glycophos (31) and of K₂HPO₄ (15.5) are
also literals in the calculation.

```rule
{"rule": "CR-U-SALTS", "kind": "unit", "coded": {"KCMH_STOCK.naCl.naMeqPerMl": 3.42, "KCMH_STOCK.naAcetate.naMeqPerMl": 3, "KCMH_STOCK.naAcetate.acetateMeqPerMl": null, "KCMH_STOCK.glycophos.naMeqPerMl": 2, "KCMH_STOCK.glycophos.pMgPerMl": 31, "KCMH_STOCK.kCl.kMeqPerMl": 2, "KCMH_STOCK.k2hpo4.kMeqPerMl": 1, "KCMH_STOCK.k2hpo4.pMgPerKMeq": 15.5, "KCMH_STOCK.mgso4_10.mgMeqPerMl": 0.812, "KCMH_STOCK.caGluconate.caMgPerMl": 9.01755, "KCMH_STOCK.aminoven10.gPerMl": 0.1}, "where": [{"file": "calculator.jsx", "line": 3282, "has": "perKg={glycophosP * 2} onChange={(v) => setGlycophosP(v / 2)}"}, {"file": "calculator.jsx", "line": 1465, "has": "const p_glycophos  = glycophosP * wtKg * 31;"}, {"file": "calculator.jsx", "line": 1467, "has": "const p_k2hpo4 = k2hpo4 * wtKg * 15.5;"}]}
{"case": "1 kg, no dead space: 1 mL of each stock", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 100, "ปริมาตรคาสาย (dead space)": 0, "Dextrose final": 10, "Amino acid": 3, "20% NaCl": 3.42, "Glycophos": 2, "KCl": 2, "K₂HPO₄": 1, "10% Ca gluconate": 45.08775}, "expect": {"prints": ["3.4 mEq = 1 mL", "1 mLNa 2 mEq · P 31 mg", "K 1 mEqP 15.5 mg1 mEq = 1 mL", "2 mEq2 mEq = 1 mL", "45 mg = 5 mL"]}}
```

### CR-U-SWITCH · parenteral or enteral targets

The tiles switch from `TPN_TARGETS` to `ENTERAL_TARGETS` when the counted feed reaches 100 mL/kg/d
(at or above). A MEN feed never switches them.
Source: NeoFeed's own convention (`app-walkthrough.md`, the `enVolPerKg` switch). No source gives it: Avery
ch 60 p. 9 keeps PN to 120 mL/kg/d, Avery (p. 1) and the Thai CPG (PDF p. 93) until feeds give 75 % of
needs, and WHO 2022's ≥ 100 mL/kg/d is when to start fortifier: Q17.

```rule
{"rule": "CR-U-SWITCH", "kind": "unit", "where": [{"file": "calculator.jsx", "line": 1498, "has": "const useEnteralTargets = enCounted / wtKg >= 100;"}, {"file": "calculator.jsx", "line": 1762, "has": "const T = useEN ? D.ENTERAL_TARGETS : D.TPN_TARGETS;"}]}
{"case": "breast milk 12.5 mL × 8 = 100 mL/kg/d: enteral protein target", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 12.5, "Frequency": 8}, "expect": {"shows": "1.2 g/kg/d — target 3.5–4 g/kg/d"}}
{"case": "12.4 mL × 8 = 99.2: parenteral protein target", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 12.4, "Frequency": 8}, "expect": {"shows": "1.2 g/kg/d — target 2.5–3.5 g/kg/d"}}
```

### CR-U-MEN · a MEN feed counts toward nothing

A feed ticked MEN (trophic) counts toward neither fluid nor any nutrient: energy, protein, lipid, Na,
K, Ca, P, Ca:P and everything saved or printed from them. Step 2 still shows what it provides.
Source: NICU team, 2026-09-18: "ติ๊ก MEN แล้ว ไม่ต้องเอาไปคิดสารอาหาร".

```rule
{"rule": "CR-U-MEN", "kind": "unit", "where": [{"file": "calculator.jsx", "line": 1493, "has": "const enCounted = isMEN ? 0 : enVolTotal;"}]}
{"case": "breast milk 3 mL × 8 ticked MEN: 0 kcal and 0 mL counted", "infant": {"g": 1000}, "order": {"Volume(mL/feed)": 3, "Frequency": 8}, "tick": {"MEN (trophic)": true}, "expect": {"shows": ["Energy (total)0 kcal/kg/d", "Prescribed 0 mL/d"]}}
```

### CR-U-EN-KCAL · formula strength

kcal/oz → kcal/100 mL: 20 → 67, 22 → 73, 24 → 80, 27 → 90, 30 → 100 (1 oz = 30 mL). Formula rows are the
Chula handbook's per-100-kcal columns scaled to the ward strength. Step 2 picks the milk, then its kcal/oz
(`EN_PRODUCTS`, Pp 2026-10-28); each strength is an `EN_DB` row, so the order saves one row key per feed.
Only the strengths the formulary already had are offered: another is Pp's and the nutrition unit's call.
Changing the milk keeps the kcal/oz when the new milk comes in it; otherwise it takes the new milk's
first and says so beside the picker ("kcal/oz 30 → 22", Vera 2026-10-28).
Source: Chula Pediatric Nutrition Handbook 3rd ed. (2565), Tables 5, 7 and 16 (pinned separately by
`test/verify-en-db-sources.cjs`).

```rule
{"rule": "CR-U-EN-KCAL", "kind": "unit", "where": [{"file": "data.js", "line": 162, "has": "const EN_KCAL_PER_100ML = { 20: 67, 22: 73, 24: 80, 27: 90, 30: 100 };"}, {"file": "data.js", "line": 389, "has": "{ id: \"enfalacPrem\", group: \"Preterm formula\",     label: \"Enfalac Premature\",             strengths: [[22, \"FBM_PF_22\"], [24, \"ENFALAC_PREM_24\"]] },"}]}
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
{"rule": "CR-U-EN-TWO-FEEDS", "kind": "unit", "where": [{"file": "data.js", "line": 425, "has": "function enMixPer100mL(feeds) {"}, {"file": "calculator.jsx", "line": 1483, "has": "const en = D.enMixPer100mL(enFeeds) || EN_NO_FEED;"}, {"file": "calculator.jsx", "line": 1484, "has": "const enVolTotal = enFeeds.reduce((s, f) => s + f.mlPerDay, 0);"}]}
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
Enfamil HMF dose: +1.1 g protein, and the rest per gram of that protein. Real milk varies; NeoFeed has no
measured-milk input.
Source: WHO 2006, *Optimal feeding of low-birth-weight infants: technical review*, Box 1.3.1 (p. 16)
and Box 1.3.3 (p. 19), every stored value re-read on 2026-10-27; Chula handbook p. 8 (energy) and p. 10
(Enfamil HMF). NF-12 shows this on screen.

```rule
{"rule": "CR-U-BREASTMILK", "kind": "unit", "where": [{"file": "data.js", "line": 190, "has": "const EN_HMF_PROTEIN_G_PER_DOSE = 1.1;"}, {"file": "data.js", "line": 182, "has": "const EN_SRC_WHO_TERM_MILK_PER_L = { kcal: 640, pro: 12, fat: 34, cho: 67, naMmol: 9.0, kMmol: 13.9, caMmol: 6.5, pMmol: 4.8 };"}, {"file": "data.js", "line": 205, "has": "return { kcal: 67, pro: w.pro / 10, fat: w.fat / 10, cho: w.cho / 10,"}]}
{"case": "breast milk: 67 kcal/100 mL", "fn": "EN_DB.BM_20.kcal", "want": 67}
{"case": "breast milk: 1.2 g protein/100 mL", "fn": "EN_DB.BM_20.pro", "want": 1.2, "within": 1e-9}
{"case": "BM + HMF: 2.3 g protein/100 mL", "fn": "EN_DB.BM_HMF_24.pro", "want": 2.3, "within": 1e-9}
```

### CR-U-STATUS · how a tile is graded

`rangeStatus(value, [lo, hi], {hardHi, hardLo})`: 0 is empty (nothing ordered, not off target); inside
the band ok; outside amber; past a hard limit critical; Infinity (a nutrient with no partner, Ca with
no P) critical. Bounds are inclusive.

```rule
{"rule": "CR-U-STATUS", "kind": "unit", "where": [{"file": "data.js", "line": 865, "has": "function rangeStatus(value, [lo, hi], { hardHi = null, hardLo = null } = {}) {"}]}
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
{"rule": "CR-R-DISPLAY", "kind": "round", "where": [{"file": "data.js", "line": 854, "has": "function displayNum(value, maxDecimals = 2) {"}]}
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
{"case": "700 g, no dead space: KCl 0.35 mL prints 0.4, K₂HPO₄ 0.4, MgSO₄ 0.3, ZnSO₄ 0.3", "infant": {"g": 700}, "route": "Central", "order": {"Volume(mL/day)": 100, "ปริมาตรคาสาย (dead space)": 0, "Dextrose final": 10, "Amino acid": 3, "KCl": 1, "K₂HPO₄": 0.5, "MgSO₄": 0.4, "ZnSO₄": 0.4, "Heparin": 0.5, "10% Ca gluconate": 40}, "expect": {"prints": ["0.7 mEq = 0.4 mL", "P 7.8 mg0.4 mEq = 0.4 mL", "0.28 mEq = 0.3 mL (10%)", "ZnSO₄ (Zn 1 mg/mL)0.28 mg Zn0.3"]}}
```

### CR-R-BAG-SUM · components and water

Components are summed in whole hundredths, then rounded half up to 1 decimal. WFI q.s. = the prepared
volume as printed (1 decimal) − components, so the printed components + WFI equal the printed prepared
volume exactly.
Source: NF-17, Pp, 2026-10-11 (130.45 mL used to print 87.5 + 42.9 = 130.5).

```rule
{"rule": "CR-R-BAG-SUM", "kind": "round", "where": [{"file": "calculator.jsx", "line": 1632, "has": "const componentVol = Math.round(componentHundredths / 10) / 10;"}, {"file": "calculator.jsx", "line": 1636, "has": "const wfiVol = parseFloat((Number(D.displayNum(preparedVol, 1)) - componentVol).toFixed(1));"}]}
{"case": "80.45 + 50 mL: 87.5 + 43 = 130.5", "infant": {"g": 1000}, "route": "Central", "order": {"Volume(mL/day)": 80.45, "ปริมาตรคาสาย (dead space)": 50, "Dextrose final": 10, "Amino acid": 3, "20% NaCl": 2, "KCl": 1, "10% Ca gluconate": 40, "Heparin": 0.5}, "expect": {"prints": "Components 87.5 mL + WFI 43 mL = 130.5 mL prepared"}}
{"case": "700 g: ten stocks of 47.4 mL, WFI 52.6", "infant": {"g": 700}, "route": "Central", "order": {"Volume(mL/day)": 100, "ปริมาตรคาสาย (dead space)": 0, "Dextrose final": 10, "Amino acid": 3, "KCl": 1, "K₂HPO₄": 0.5, "MgSO₄": 0.4, "ZnSO₄": 0.4, "Heparin": 0.5, "10% Ca gluconate": 40}, "expect": {"prints": "Components 47.4 mL + WFI 52.6 mL = 100 mL prepared"}}
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

Each names the rule it belongs to. Nothing here has changed any code; the answer is Pp's, and the TPN
team's where the number is theirs.

- **Q1 · `CR-K-BAG-MAX`, `CR-K-BAG-RED`:** central K⁺ maximum 200 and central amber 60 mEq/L have no
  published source; Fanaroff (Therapeutic Agents p. 8) and IWK give 120 as the central maximum, ANMF 80.
  On a peripheral line 40–60 is orderable with an amber line, where Fanaroff and ANMF call 40 the
  maximum (IWK 60). Every source is for KCl or maintenance fluid; none is for a PN bag.
- **Q2 · `CR-BAG-OVERFULL`:** a bag whose stocks exceed its volume is a critical alert, so a typed reason
  sends pharmacy a form with a negative WFI. Should it be a stop, like the 1,250 mL bottle?
- **Q3 · `CR-NPE-AA`:** the ≥ 24 kcal/g target sits below the 30–40 kcal/g minimum in ESPGHAN 2018,
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
