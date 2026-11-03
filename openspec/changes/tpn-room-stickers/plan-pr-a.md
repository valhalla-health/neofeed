# PR A: sticker figures and a read-only pharmacy account — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every TPN save carries the figures the TPN unit's three stickers print, and a `pharmacy` account can read one date's orders and nothing else.

**Architecture:** `data.js` gains one pure function, `stickerFigures`, that turns the calculator's own values into strings in the sample sticker's format. `calculator.jsx` sends its result as `entry.printJson` on every save. `gas-backend.gs` stores it in a new `Daily_Log` column AM, adds a `pharmacy` role that an allow-list limits to a few actions, and adds `pharmacyOrders`. `app.jsx` turns a pharmacy account away at sign-in. The TPN-room page itself is PR B.

**Tech Stack:** React 18 `.jsx` built by `tools/build.mjs` (esbuild, committed `compiled/`); Google Apps Script; Node harnesses (`test/verify-*.cjs`, jsdom, `test/gas-vm-sandbox.cjs`).

**Spec:** `openspec/changes/tpn-room-stickers/` (`proposal.md`, `design.md`, `specs/`, `tasks.md`).

## Changes to the agreed spec (Pp approves them with this plan)

1. **D3 is dropped.** The backend stores `printJson` when a save carries it and does not refuse a submitted TPN save without it. Sixteen backend harnesses post submitted saves and would all need the field, and the only orders that could lack figures come from a tab opened before the release. The TPN-room page already refuses to print an order without figures and says to save it again (`specs/tpn-room-stickers`).
2. **No trailing zeros on the stickers** (Pp, 2026-10-30, the ISMP rule). Each figure goes through `D.displayNum` with the sample's decimals as the maximum: KCl `3`, not `3.0`; an empty row `0`.
3. **Deploy order: backend first, then the frontend release.** Required since Task 2's marker (corrected 2026-11-02): on an older backend a new frontend writes `calcInput.printJsonV` with no AM behind it, so the order shows no notice and the TPN room says "save again". Backend first means the login fix in item 4 is live before anyone makes a pharmacy account.
4. **Found while planning: the login reply must never carry the registry for a pharmacy account.** `_loginReply` attaches the first registry snapshot (names included) to any successful login that asks for it, before the allow-list could run. Task 4 closes that.
5. **`pharmacyOrders` also answers an admin**, so Pp can check it without a pharmacy account.

6. **The TPN unit's answers, 2026-11-03 (`tasks.md` 0.3).** `stickerFigures` and the backend's lists no longer
   have `aminoleban8`, `nephrosteril7` or `mgso4_50`, and figures a–d are no longer PROVISIONAL, whatever the
   tables and code below still show. This plan stays as the record of how PR A was built.

## Added after the cold-reader passes (2026-10-30), for Tasks 1–2

Tasks 3–6 are built. Two cold readers (an attack on the whole app, and a walk through it by role) found
these for the client half; each needs its own failing test first.

1. **`_printJsonField` holds the figures to the final key set** (attack, finding 1). Today any object with
   `v: 1` up to 8,000 characters is stored, and the TPN-room page is the first print path that does not
   recompute from `calcInput`. Once the TPN unit's answers fix the keys: known keys only; each value a
   short number string (`^\d+(\.\d+)?$`, no minus sign: review of Task 2b, 2026-11-02) or `null` where the spec allows; a length cap on any text (the
   critical alert's reason); and a refusal when `printJson.dol`, `dosingWeightKg` or `constantsVersion`
   differs from the same request's `entry.dol`, `calcInput.tpnWtG / 1000` and `entry.constantsVersion`.
   Compare the weight after the sticker's own formatting (at most two decimals, no trailing zero): 1625 g
   is 1.625 kg raw and `1.63` on the sticker, so a raw comparison would refuse a valid order.
2. **An order without figures can be saved again, and the doctor can see it** (walkthrough, finding 2). A
   locked order on the current `CONSTANTS_VERSION` has Submit and Save draft disabled, and an unlocked
   submitted order's Submit only locks it, so "open and save again" saves nothing. The ward sync does not
   read AM, so the client writes a marker it can read, `calcInput.printJsonV = 1`, with the figures. A
   saved TPN order without the marker shows "ยังไม่มีตัวเลขสติกเกอร์ — กด Submit อีกครั้ง" with Submit
   enabled, and that save writes a revision with figures.

## Global Constraints

- Specs, tests and examples use synthetic infants only: never a real name, HN, AN or bed history (`openspec/config.yaml`).
- No dose moves, so `CONSTANTS_VERSION` stays `2026-10-28.1`.
- Every clinical behaviour added gets a case in a `test/verify-*.cjs` harness. CI runs every `test/verify-*.cjs` twice, against the sources and against `compiled/`.
- After a `.jsx` edit: `npm ci --prefix tools && node tools/build.mjs`, and commit `compiled/` and both HTML shells with the edit.
- `tools/ci_bans.js` must pass: no raw `.toFixed(n)` with n > 0 in shipped sources; no patient identifier or raw sheet cell in a log.
- Sticker figures: the sample's rows and units, at most the sample's decimals except the volume rows at one decimal, no trailing zero; Soluvit and Peditrace × Factor; Mg²⁺ in mg (Pp, 2026-10-30).
- `pharmacyOrders` replies carry no name, initials or date of birth.
- Merging into `main` deploys nothing. Merging into `release` and `clasp deploy` happen only on Pp's word.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Task 0: Pp signs off the figure map (gate, before any code)

Every figure on the sample stickers, where NeoFeed gets it, and its maximum decimals. Rows marked **new** are computations NeoFeed does not make today.

| `printJson` key | Sticker figure | From | Max dp |
|---|---|---|---|
| `dosingWeightKg` | bw | `wtKg` | 2 |
| `dol` | อายุ | `dol` | 0 |
| `factor` | factor | `calc.factor` | 2 |
| `deliveredMl` / `deadMl` / `preparedMl` | ปริมาตรที่ให้ / ค้างสาย / เตรียมจริง | `calc.totalTPN_mL` / `calc.deadVol_mL` / `calc.preparedVol` | 1 / 2 / 1 |
| `stockMl.d50w` | D50W | `calc.d50wVol` | 1 |
| `stockMl.aminoven10`, `aminoplasmal15` | amino acid stock | `calc.solVol.aa` under the chosen `aaStockKey`, else 0 | 1 |
| `stockMl.amiparen10` | 10% Amiparen | NeoFeed cannot order it: `0` | 0 |
| `stockMl.nacl20`, `glycophos`, `k2hpo4`, `naAcetate`, `kcl`, `mgso4_10`, `caGluconate`, `heparin`, `znso4` | the salt and additive rows | `calc.solVol.*` | 1 |
| `stockMl.soluvit`, `peditrace` | Soluvit N, Peditrace (bag) | `calc.soluvitVol`, `calc.peditrace_vol` (× Factor) | 1 |
| `stockMl.wfi` | WFI | `calc.wfiVol` | 1 |

The volume rows (D50W, amino acid, WFI, delivered, prepared) print one decimal, as the doctor's form does
(Pp, 2026-10-30). The sample's whole mL rounded NeoFeed's 0.1 mL value a second time: an independent check
of 170 orders found D50W, amino acid and WFI 1 mL off in 4–8 % of them, and the worksheet adding up to the
prepared volume in 7 %.
| `stockMl.aminoleban8`, `nephrosteril7`, `mgso4_50` | right-hand rows | NeoFeed cannot order them: `0` | 1 |
| `stockMl.addamel` | Addamel N | `0`: NeoFeed offers no Addamel yet. Its field comes in its own PR, with the older-children ward (Pp, 2026-10-30). Null if a saved row has `inclAddamel` on | 1 |
| `delivered.dextrosePct` / `dextroseG` | Dextrose % = g | `dexPct` / `calc.dexG` | 1 / 1 |
| `delivered.aminoAcidPct` | Amino acid % | `calc.osmIn.aaPct` | 2 |
| `delivered.aminoAcidG.*` | g per AA product | `calc.aaG` under the chosen key, else 0 | 1 |
| `delivered.naMeq` / `kMeq` | Na⁺ / K⁺ | `calc.naKg × wtKg` / `calc.kKg × wtKg` | 1 |
| `delivered.caMg` | Ca²⁺ | `caPerKg × wtKg` | 1 |
| `delivered.mgMg` | Mg²⁺ (mg) | `mgPerKg × MG_MG_PER_MEQ × wtKg` (the back sheet's own figure) | 1 |
| `delivered.phosphateMg` | Phosphate | `calc.pTotal_mg` | 1 |
| `delivered.acetateMeq` | Acetate⁻ | **new:** `naAcet × wtKg`, the Na acetate ordered, 1 : 1 (Pp, 2026-10-30: "Acetate คือ Na acetate") | 1 |
| `delivered.clMeq` | Cl⁻ | **new:** `(naCl + kCl) × wtKg`, chloride from 20% NaCl and KCl, 1 : 1 | 1 |
| `delivered.znMg` | Zn²⁺ | `calc.znTotal_mg` | 1 |
| `delivered.soluvitMl` / `peditraceMl` | SoluvitN / Peditrace (delivered) | **new:** `min(1 mL/kg × wtKg, cap)` when ticked, what reaches the infant | 1 |
| `delivered.addamelMl` | Addamel N | as `stockMl.addamel` | 1 |
| `delivered.heparinUnits` | Heparin unit | **new:** `heparinUmL × totalTPN_mL`, units in the delivered volume | 1 |
| `delivered.osmolarity` | Osmolarity | `calc.osm` | 0 |
| `delivered.kcal` | Calories/Deliv.Vol | **new:** `calc.dexKcal + calc.aaKcal`, the aqueous bag only (3.4 kcal/g dextrose, 4 kcal/g AA, as the KCMH sheet's E53) | 0 |

A `null` means NeoFeed has no figure, and PR B's page will not print that order. Pp decided acetate on 2026-10-30. The other four **new** rows wait for the TPN unit's answers (`tasks.md` 0.3); Pp's sign-off on all five goes in the PR body.

**Order of work.** Tasks 3–6 (column AM, the role, `pharmacyOrders`, the sign-in) do not depend on the
TPN unit's answers and may go first. Tasks 1–2 wait for answers a–d, since each can change one line of
`stickerFigures` and its test.

## File structure

| File | Change |
|---|---|
| `data.js` | `STICKER_SCHEMA_VERSION`, `stickerFigures()`; both exported on `NEOFEED_DATA` |
| `calculator.jsx` | `handleSave` puts `printJson` in the saved entry |
| `gas-backend.gs` | column AM; `_printJsonField`; `LOG_SYNC_WIDTH`; `pharmacy` role; allow-list; `_loginReply` fix; `pharmacyOrders` |
| `app.jsx` | `loginRequest` turns a pharmacy account away |
| `test/verify-sticker-figures-1030.cjs` | new: §1 pure figures, §2 the saved entry from the real `<Calculator>` |
| `test/verify-pharmacy-backend-1030.cjs` | new: column AM, the role, the login reply, `pharmacyOrders` |
| `test/verify-pharmacy-frontend-1030.cjs` | new: the app refuses a pharmacy sign-in |
| `REFERENCE.md`, `CHANGELOG.md`, `STATUS.md`, `BACKLOG.md`, `openspec/.../tasks.md` | docs |

---

### Task 1: `stickerFigures` in `data.js`

**Files:**
- Modify: `data.js` (after `displayNum`, which ends at line 871; the export object that lists `KCMH_STOCK, MAX_DEXTROSE_G_KG` at line 2736)
- Create: `test/verify-sticker-figures-1030.cjs`

**Interfaces:**
- Produces: `window.NEOFEED_DATA.stickerFigures(o)` → object or `null`, where `o = { calc, wtKg, dol, orderDate, dexPct, aaStockKey, naCl, naAcet, kCl, mgPerKg, caPerKg, heparinUmL, inclSoluvit, inclPeditrace, inclAddamel, critOverride }`. `window.NEOFEED_DATA.STICKER_SCHEMA_VERSION === 1`. The returned object's keys are the `printJson` keys in Task 0's table plus `v`, `constantsVersion`, `orderDate` (`"YYYY-MM-DD"` or `""`) and `critical` (`null` or `{ alerts: string[], reason: string }`).

- [ ] **Step 0: Commit the spec and this plan on the branch**

```bash
git -C "C:/Users/USER/repos/PraewPP/Web App Projects/NeoFeed/neofeed/.claude/worktrees/tpn-room-stickers" add openspec/changes/tpn-room-stickers
git -C "C:/Users/USER/repos/PraewPP/Web App Projects/NeoFeed/neofeed/.claude/worktrees/tpn-room-stickers" commit -m "TPN room stickers: spec and the PR A plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 1: Write the failing test (§1)**

Create `test/verify-sticker-figures-1030.cjs`:

```js
// verify-sticker-figures-1030.cjs — the TPN room's sticker figures
// (openspec/changes/tpn-room-stickers; Pp, 2026-10-30).
//
//   §1  stickerFigures(): the sample's rows and units, at most the sample's
//       decimals, no trailing zero; null rules; the critical copy;
//   §2  the real <Calculator> sends them as entry.printJson on Submit and on
//       Save draft, from the same calc the doctor saved.
//
// Synthetic infants only. Mounts the real <Calculator> in jsdom — the deps in
// test/README.md.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';
const R = (f) => fs.readFileSync(DIR + f, 'utf8');

let pass = 0, fail = 0, n = 0;
function eq(name, got, want) {
  const yes = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${yes ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(72)}${yes ? '' : ` got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
  yes ? pass++ : fail++;
}
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(72)}${cond ? '' : '  ' + JSON.stringify(detail ?? '')}`);
  cond ? pass++ : fail++;
}
async function section(title, fn) {
  console.log(`\n── ${title} ──`);
  try { await fn(); } catch (e) { ok(`(section ran to the end) ${e.message}`, false, e.stack.split('\n').slice(0, 3)); }
}

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>',
  { url: 'https://localhost/', pretendToBeVisual: true });
const { window } = dom;
Object.assign(global, {
  window, document: window.document, self: window, HTMLElement: window.HTMLElement,
  Element: window.Element, Node: window.Node, getComputedStyle: window.getComputedStyle,
  localStorage: window.localStorage,
  requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: clearTimeout,
  IS_REACT_ACT_ENVIRONMENT: true,
});
global.showToast = () => {};
window.print = () => {};
window.confirm = () => true;
window.prompt = () => null;
{ const w = console.error; console.error = (...a) => { if (!/act\(|not wrapped|Not implemented/.test(String(a[0]))) w(...a); }; }
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
vm.runInThisContext(R('data.js'));
for (const f of ['icons.jsx', 'calculator.jsx']) {
  vm.runInThisContext(babel.transformSync(R(f), {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    filename: f, configFile: false, babelrc: false,
  }).code);
}
const D = window.NEOFEED_DATA;

// A synthetic 1.8 kg order, 200 mL delivered + 30 mL dead space = 230 mL,
// Factor 1.8 × 230/200 = 2.07. The calc values are what calculator.jsx's calc
// returns for it, written out, so §1 needs no React.
const C = (extra) => Object.assign({
  totalTPN_mL: 200, deadVol_mL: 30, preparedVol: 230, factor: 2.07,
  d50wVol: 57.5,
  solVol: { aa: 62.1, naCl: 1.2, naAcet: 0, glycophos: 2.1, kCl: 1.6, k2hpo4: 0, mg: 0.8, ca: 9.2, heparin: 1.2, znso4: 0 },
  soluvitVol: 2.1, peditrace_vol: 2.1, wfiVol: 90.1,
  dexG: 25, aaG: 5.4, osmIn: { aaPct: 2.7 }, naKg: 4, kKg: 1.5, pTotal_mg: 55.8,
  znTotal_mg: 0.45, osm: 1012.6, dexKcal: 85, aaKcal: 21.6,
}, extra);
const O = (extra) => Object.assign({
  calc: C(), wtKg: 1.8, dol: 7, orderDate: '2026-11-16', dexPct: 12.5, aaStockKey: 'aminoven10',
  naCl: 2, naAcet: 0, kCl: 1.5, mgPerKg: 0.3, caPerKg: 40, heparinUmL: 0.5,
  inclSoluvit: true, inclPeditrace: true, inclAddamel: false, critOverride: null,
}, extra);
const strings = (o) => typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(strings) : [];

(async () => {
  await section('§1 stickerFigures: the sample sticker, from the calc', async () => {
    eq('schema version', D.STICKER_SCHEMA_VERSION, 1);
    const f = D.stickerFigures(O());
    eq('v and constants', [f.v, f.constantsVersion], [1, D.CONSTANTS_VERSION]);
    eq('order date, dol, weight, factor', [f.orderDate, f.dol, f.dosingWeightKg, f.factor], ['2026-11-16', '7', '1.8', '2.07']);
    eq('volumes: delivered, dead, prepared', [f.deliveredMl, f.deadMl, f.preparedMl], ['200', '30', '230']);
    eq('worksheet rows', f.stockMl, {
      d50w: '57.5', aminoven10: '62.1', amiparen10: '0', aminoplasmal15: '0',
      nacl20: '1.2', glycophos: '2.1', k2hpo4: '0', naAcetate: '0', kcl: '1.6', mgso4_10: '0.8',
      caGluconate: '9.2', soluvit: '2.1', peditrace: '2.1', heparin: '1.2', wfi: '90.1',
      aminoleban8: '0', nephrosteril7: '0', znso4: '0', mgso4_50: '0', addamel: '0',
    });
    eq('PN label', f.delivered, {
      dextrosePct: '12.5', dextroseG: '25', aminoAcidPct: '2.7',
      aminoAcidG: { aminoven10: '5.4', amiparen10: '0', aminoplasmal15: '0', aminoleban8: '0', nephrosteril7: '0' },
      naMeq: '7.2', kMeq: '2.7', caMg: '72', mgMg: '6.6', phosphateMg: '55.8', acetateMeq: '0', clMeq: '6.3',
      znMg: '0.5', soluvitMl: '1.8', peditraceMl: '1.8', addamelMl: '0', heparinUnits: '100',
      osmolarity: '1013', kcal: '107',
    });
    eq('no critical value', f.critical, null);
    eq('no string ends in a trailing zero after a decimal point', strings(f).filter(s => /\.\d*0$/.test(s)), []);
    ok('fits a Sheets cell with room to spare (< 8,000 characters)', JSON.stringify(f).length < 8000, JSON.stringify(f).length);
  });

  await section('§1b the rules around it', async () => {
    eq('no TPN volume → null', D.stickerFigures(O({ calc: C({ totalTPN_mL: 0 }) })), null);
    eq('no weight → null', D.stickerFigures(O({ wtKg: 0 })), null);
    const ap = D.stickerFigures(O({ aaStockKey: 'aminoplasmal15' }));
    eq('Aminoplasmal: its rows, not Aminoven', [ap.stockMl.aminoven10, ap.stockMl.aminoplasmal15, ap.delivered.aminoAcidG.aminoplasmal15], ['0', '62.1', '5.4']);
    eq('Na acetate 1 mEq/kg → acetate 1.8 mEq, 1 : 1', D.stickerFigures(O({ naAcet: 1 })).delivered.acetateMeq, '1.8');
    const ad = D.stickerFigures(O({ inclAddamel: true }));
    eq('Addamel ticked → no figure on either sticker', [ad.stockMl.addamel, ad.delivered.addamelMl], [null, null]);
    eq('Soluvit unticked → 0 delivered', D.stickerFigures(O({ inclSoluvit: false })).delivered.soluvitMl, '0');
    eq('chloride counts NaCl and KCl, 1 : 1', D.stickerFigures(O({ naCl: 3, kCl: 2 })).delivered.clMeq, '9');
    const crit = D.stickerFigures(O({ critOverride: { reason: 'synthetic reason', alerts: ['K⁺ above max'], at: '2026-11-16T03:00:00Z' } }));
    eq('a confirmed critical value is copied, without its time', crit.critical, { alerts: ['K⁺ above max'], reason: 'synthetic reason' });
    eq('an ISO timestamp is cut to the date', D.stickerFigures(O({ orderDate: '2026-11-16T00:00:00.000Z' })).orderDate, '2026-11-16');
    eq('anything else is no date', D.stickerFigures(O({ orderDate: 'Mon Nov 16 2026' })).orderDate, '');
  });

  console.log(`\n${fail === 0 ? 'STICKER FIGURES 1030: ALL PASS' : `STICKER FIGURES 1030: ${fail} FAILED`} (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
})();
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node test/verify-sticker-figures-1030.cjs`
Expected: FAIL at `schema version` (got `undefined`) and a section error `D.stickerFigures is not a function`.

- [ ] **Step 3: Implement**

In `data.js`, directly after the closing `}` of `displayNum` (line 871), add:

```js
// ── Sticker figures (TPN room, Pp 2026-10-30) ─────────────────
// What the TPN unit's three stickers print, computed once, here, and saved
// with the order (Daily_Log AM, printJson). The TPN-room page copies these
// strings and computes nothing (openspec/changes/tpn-room-stickers, D1, D2).
// Rows and units follow the unit's sample sticker of 2026-10-30; each figure
// goes through displayNum with the sample's decimals as the maximum, so there
// is no trailing zero (Pp, 2026-10-30: the ISMP rule holds on a sticker too).
// A stock NeoFeed cannot order prints 0. null means NeoFeed has no figure for
// it, and the page will not print that order.
const STICKER_SCHEMA_VERSION = 1;
function stickerFigures(o) {
  const c = o && o.calc;
  if (!c || !(c.totalTPN_mL > 0) || !(o.wtKg > 0)) return null;
  const n = displayNum;
  const wt = o.wtKg;
  const aa = (key, v) => (o.aaStockKey === key ? v : 0);
  // What reaches the infant: 1 mL/kg, capped, when ticked. The bag holds this
  // × Factor (calc.soluvitVol), which is the worksheet's row.
  const vit = (stock, on) => (on ? Math.min(stock.mlPerKg * wt, stock.maxMl) : 0);
  const date = String(o.orderDate || "");
  return {
    v: STICKER_SCHEMA_VERSION,
    constantsVersion: CONSTANTS_VERSION,
    orderDate: /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : "",
    dol: n(o.dol, 0),
    dosingWeightKg: n(wt, 2),
    factor: n(c.factor, 2),
    // Volumes at one decimal, as the doctor's form (Pp, 2026-10-30): whole mL
    // rounded the calc's 0.1 mL value a second time and was 1 mL off in 4–8 %
    // of orders.
    deliveredMl: n(c.totalTPN_mL, 1),
    deadMl: n(c.deadVol_mL, 2),
    preparedMl: n(c.preparedVol, 1),
    stockMl: {
      d50w: n(c.d50wVol, 1),
      aminoven10: n(aa("aminoven10", c.solVol.aa), 1),
      amiparen10: "0",
      aminoplasmal15: n(aa("aminoplasmal15", c.solVol.aa), 1),
      nacl20: n(c.solVol.naCl, 1),
      glycophos: n(c.solVol.glycophos, 1),
      k2hpo4: n(c.solVol.k2hpo4, 1),
      naAcetate: n(c.solVol.naAcet, 1),
      kcl: n(c.solVol.kCl, 1),
      mgso4_10: n(c.solVol.mg, 1),
      caGluconate: n(c.solVol.ca, 1),
      soluvit: n(c.soluvitVol, 1),
      peditrace: n(c.peditrace_vol, 1),
      heparin: n(c.solVol.heparin, 1),
      wfi: n(c.wfiVol, 1),
      aminoleban8: "0",
      nephrosteril7: "0",
      znso4: n(c.solVol.znso4, 1),
      mgso4_50: "0",
      addamel: o.inclAddamel ? null : "0",
    },
    delivered: {
      dextrosePct: n(o.dexPct, 1),
      dextroseG: n(c.dexG, 1),
      aminoAcidPct: n(c.osmIn ? c.osmIn.aaPct : 0, 2),
      aminoAcidG: {
        aminoven10: n(aa("aminoven10", c.aaG), 1),
        amiparen10: "0",
        aminoplasmal15: n(aa("aminoplasmal15", c.aaG), 1),
        aminoleban8: "0",
        nephrosteril7: "0",
      },
      naMeq: n(c.naKg * wt, 1),
      kMeq: n(c.kKg * wt, 1),
      caMg: n(o.caPerKg * wt, 1),
      mgMg: n(o.mgPerKg * MG_MG_PER_MEQ * wt, 1),
      phosphateMg: n(c.pTotal_mg, 1),
      // The label's acetate is the Na acetate ordered, 1 : 1 (Pp, 2026-10-30:
      // "Acetate คือ Na acetate"). KCMH_STOCK.naAcetate.acetateMeqPerMl, which
      // the calculator's own screen waits on, is a separate question.
      acetateMeq: n((o.naAcet || 0) * wt, 1),
      // Chloride from 20% NaCl and KCl, 1 : 1 with their Na and K.
      clMeq: n(((o.naCl || 0) + (o.kCl || 0)) * wt, 1),
      znMg: n(c.znTotal_mg, 1),
      soluvitMl: n(vit(KCMH_STOCK.soluvit, o.inclSoluvit), 1),
      peditraceMl: n(vit(KCMH_STOCK.peditrace, o.inclPeditrace), 1),
      addamelMl: o.inclAddamel ? null : "0",
      heparinUnits: n(o.heparinUmL * c.totalTPN_mL, 1),
      osmolarity: n(c.osm, 0),
      // The aqueous bag only, as the KCMH sheet's E53 without its fat term.
      kcal: n(c.dexKcal + c.aaKcal, 0),
    },
    critical: o.critOverride
      ? { alerts: (o.critOverride.alerts || []).map(String), reason: String(o.critOverride.reason || "") }
      : null,
  };
}
```

In the export object that lists `KCMH_STOCK, MAX_DEXTROSE_G_KG` (data.js:2736), add `STICKER_SCHEMA_VERSION, stickerFigures,` at the start of that same line.

- [ ] **Step 4: Run it and watch it pass**

Run: `node test/verify-sticker-figures-1030.cjs`
Expected: `STICKER FIGURES 1030: ALL PASS`. Then `node tools/ci_bans.js` → no finding.

- [ ] **Step 5: Commit**

```bash
git add data.js test/verify-sticker-figures-1030.cjs
git commit -m "Sticker figures: the TPN unit's sample, computed once in data.js

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: the calculator saves `printJson`

**Files:**
- Modify: `calculator.jsx` (`handleSave`, the `entry` object, right after its `calcInput: { ... },` block, about line 2480)
- Modify: `test/verify-sticker-figures-1030.cjs` (add §2 before the final summary line)
- Build: `compiled/calculator.js`, both HTML shells

**Interfaces:**
- Consumes: `D.stickerFigures(o)` from Task 1.
- Produces: every `onLog(entry)` / `onUpdate(id, lm, entry)` call carries `entry.printJson` (object, or `null` for a bag-less order).

- [ ] **Step 1: Write the failing test (§2)**

Add to `test/verify-sticker-figures-1030.cjs`, before the `console.log(\`\n${fail === 0 ...` line:

```js
  // ── §2 helpers: the real <Calculator>, as verify-stock-ml-1027.cjs mounts it ──
  const container = document.getElementById('root');
  let root = ReactDOM.createRoot(container);
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  const fieldOf = (label) => [...container.querySelectorAll('.field')].find(d => d.querySelector('label')?.textContent.startsWith(label)) || null;
  const saltRow = (label) => [...container.querySelectorAll('.salt-row-grid')]
    .find(d => d.firstElementChild?.firstElementChild?.textContent.startsWith(label)) || null;
  const inputFor = (label) => fieldOf(label)?.querySelector('input') || saltRow(label)?.querySelector('input') || null;
  function setField(label, value) {
    const input = inputFor(label);
    if (!input) throw new Error('field not found: ' + label);
    act(() => { valueSetter.call(input, String(value)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
  }
  const click = (el) => act(() => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  const clickAsync = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  const submitBtn = () => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Submit') || null;
  const draftBtn = () => container.querySelector('button.save-draft');
  const routeBtn = (name) => [...container.querySelectorAll('.step2-ctrl .seg button')].find(b => b.textContent.trim() === name);
  const BASE = { dol: 10, editEntry: null, baselineEntry: null, previousEntry: null, logDate: '2026-11-16',
    userLabel: 'Dr Test (doc@kcmh.test)', onUpdate() { return Promise.resolve({ ok: true, lastModified: 'lm-u' }); },
    onSaved() {}, onWeightChange() {} };
  const logger = () => { const box = { entry: null, calls: 0 };
    box.onLog = (e) => { box.entry = e; box.calls++; return Promise.resolve({ ok: true, entryId: 'e-' + box.calls, lastModified: 'lm-' + box.calls }); };
    return box; };
  function mount(props) {
    act(() => { root.unmount(); });
    root = ReactDOM.createRoot(container);
    window.localStorage.clear();
    act(() => { root.render(React.createElement(window.Calculator, { ...BASE, ...props })); });
    act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
  }
  // 1.6 kg, 160 mL + 30 mL dead space = 190 mL, Factor 1.9. 20% NaCl 2 and
  // KCl 2.5 mEq/kg, MgSO₄ 4.861 mg/kg (0.4 mEq), heparin 1 U/mL (the default),
  // Soluvit and Peditrace ticked (the default). No Ca or P, so no Ca:P alert.
  function order1600(box) {
    mount({ patient: { sessionId: 'NF-900016', name: 'SY', bw: 1600, currentBed: 'NICU 3', diagnosis: '-',
      weights: [{ dol: 1, w: 1600 }], admissionDate: '2026-11-07' }, onLog: box.onLog });
    click(routeBtn('Central'));
    setField('Current weight', 1600);
    ['Target fluid', 'Other IV', 'Drug volume', 'Input', 'Urine output', 'Drain content'].forEach(l => setField(l, l === 'Target fluid' ? 150 : 0));
    setField('Volume(mL/day)', 160); setField('ปริมาตรคาสาย (dead space)', 30);
    setField('Dextrose final', 10); setField('Amino acid', 2);
    setField('20% NaCl', 2); setField('KCl', 2.5); setField('MgSO₄', 4.861);
  }
  const WANT_STOCK = { d50w: '38', aminoven10: '38', amiparen10: '0', aminoplasmal15: '0', nacl20: '1.1', glycophos: '0',
    k2hpo4: '0', naAcetate: '0', kcl: '2.4', mgso4_10: '0.9', caGluconate: '0', soluvit: '1.9', peditrace: '1.9',
    heparin: '1.9', wfi: '103.9', aminoleban8: '0', nephrosteril7: '0', znso4: '0', mgso4_50: '0', addamel: '0' };

  await section('§2 Submit saves printJson from the calc it saved', async () => {
    const box = logger();
    order1600(box);
    await clickAsync(submitBtn());
    eq('the order is logged once', box.calls, 1);
    const pj = box.entry && box.entry.printJson;
    ok('entry.printJson is there', !!pj, box.entry && Object.keys(box.entry));
    if (!pj) return;
    eq('date, dol, weight, factor, volumes', [pj.orderDate, pj.dol, pj.dosingWeightKg, pj.factor, pj.deliveredMl, pj.deadMl, pj.preparedMl],
      ['2026-11-16', '10', '1.6', '1.9', '160', '30', '190']);
    eq('worksheet rows', pj.stockMl, WANT_STOCK);
    eq('PN label: Na K Mg Cl', [pj.delivered.naMeq, pj.delivered.kMeq, pj.delivered.mgMg, pj.delivered.clMeq], ['3.2', '4', '7.8', '7.2']);
    eq('PN label: dextrose, AA, vitamins, heparin, kcal',
      [pj.delivered.dextroseG, pj.delivered.aminoAcidPct, pj.delivered.aminoAcidG.aminoven10, pj.delivered.soluvitMl, pj.delivered.heparinUnits, pj.delivered.kcal],
      ['16', '2', '3.2', '1.6', '160', '67']);
    const osmOnScreen = (container.textContent.match(/Osm (\d+) mOsm\/L/) || [])[1];
    eq('osmolarity is the figure the doctor saw', pj.delivered.osmolarity, osmOnScreen);
    eq('no critical value', pj.critical, null);
    eq('the doctor’s order (calcInput) carries no copy of it', 'printJson' in box.entry.calcInput, false);
  });

  await section('§2b Save draft saves printJson too', async () => {
    const box = logger();
    order1600(box);
    await clickAsync(draftBtn());
    eq('the draft is logged', box.calls, 1);
    eq('…with the same worksheet rows', box.entry && box.entry.printJson && box.entry.printJson.stockMl, WANT_STOCK);
  });
```

- [ ] **Step 2: Run it and watch §2 fail**

Run: `node test/verify-sticker-figures-1030.cjs`
Expected: §1 PASS; §2 FAIL at `entry.printJson is there`.

- [ ] **Step 3: Implement**

In `calculator.jsx` `handleSave`, inside `const entry = ({ ... })`, directly after the `calcInput: { ...captureState(), ... },` block ends (the line with `...(asDraft ? { blankFields: missingFields.map(f => f.key) } : {}) },`), add:

```jsx
      // The TPN room's sticker figures (Daily_Log AM; openspec
      // tpn-room-stickers, D1): from this same calc, at the moment the order is
      // saved, so a sticker cannot show a figure the saved order does not have.
      // null for a bag-less order. The doctor's sheet does not change.
      printJson: D.stickerFigures({ calc, wtKg, dol, orderDate: editEntry ? editEntry.ts : (logDate || newOrderDate),
        dexPct, aaStockKey, naCl, naAcet, kCl, mgPerKg, caPerKg, heparinUmL,
        inclSoluvit, inclPeditrace, inclAddamel, critOverride: override }),
```

- [ ] **Step 4: Rebuild, run it and watch it pass**

```bash
npm ci --prefix tools && node tools/build.mjs
node test/verify-sticker-figures-1030.cjs
node test/verify-stock-ml-1027.cjs
node test/verify-calc-oracle.cjs
```
Expected: `STICKER FIGURES 1030: ALL PASS`; the two existing calculator harnesses still pass (the saved entry gained a key; nothing they read moved).

- [ ] **Step 5: Commit**

```bash
git add calculator.jsx compiled/ index.html NeoFeed.html test/verify-sticker-figures-1030.cjs
git commit -m "Calculator: save the sticker figures with every TPN order

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `Daily_Log` column AM

**Files:**
- Modify: `gas-backend.gs`: the header comment (lines 39–42); `LOG_HEADERS` (line 880); `LOG_WIDTH` comment (line 889); the sync read (line 1646) and `_fullLogRows` (line 1659); `logDailyNutrition` (line 2447); `updateDailyNutrition` revision row (line 2550) and in-place row (line 2586)
- Create: `test/verify-pharmacy-backend-1030.cjs` (§1–§3)

**Interfaces:**
- Consumes: `entry.printJson` from Task 2 (object with `v === 1`, or absent/null).
- Produces: Daily_Log column AM (index 38) = the figures as JSON text, or `""`. `LOG_SYNC_WIDTH = 38`.

- [ ] **Step 1: Write the failing test**

Create `test/verify-pharmacy-backend-1030.cjs`:

```js
// verify-pharmacy-backend-1030.cjs — the TPN room's half of gas-backend.gs
// (openspec/changes/tpn-room-stickers; Pp, 2026-10-30).
//
//   §1–§3  Daily_Log AM holds printJson: stored, checked, kept per revision,
//          and never sent to the ward;
//   §4     a pharmacy account reaches five actions and nothing else;
//   §5     its login reply carries no registry;
//   §6–§7  pharmacyOrders: one date, counts, no name, initials or dob, audited.
//
// Real gas-backend.gs in gas-vm-sandbox.cjs. Synthetic infants only.
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const fs = require('fs');
const { boot, recorder, SRC_PATH } = require('./gas-vm-sandbox.cjs');
const T = recorder('PHARMACY BACKEND 2026-10-30');

const PJ = (extra) => Object.assign({ v: 1, constantsVersion: '2026-10-28.1', orderDate: '2026-10-20', dol: '10',
  dosingWeightKg: '1.6', factor: '1.9', deliveredMl: '160', deadMl: '30', preparedMl: '190',
  stockMl: { d50w: '38', wfi: '104' }, delivered: { kcal: '67' }, critical: null }, extra);
const E = (extra, ci) => Object.assign({ dol: 10, weight: 1600, fluid: 150, gir: 7, pro: 2, kcal: 42, na: 2, k: 2.5, ca: 0, p: 0,
  enVolPerKg: 0, route: 'TPN central', status: 'submitted', printJson: PJ(),
  calcInput: Object.assign({ wtG: 1600, stops: [] }, ci) }, extra || {});
const P = (sid, bed) => ({ sessionId: sid, name: 'ทารกทดสอบ ' + sid, initials: 'ทท', bw: 1600, ga: 32.1, sex: 'boys',
  dob: '2026-10-01', admissionDate: '2026-10-01', twinSuffix: '', status: 'Active',
  currentBed: bed, diagnosis: 'RDS', weights: [{ dol: 1, w: 1600 }], lengths: [], hcs: [], bedHistory: [],
  statusDate: '', multiplesCount: 0 });

function ward() {
  const g = boot();
  g.addStaff('doc@kcmh.test', 'doctor', 'Doctor-Password-1', { name: 'Dr Test' });
  g.addStaff('rx@kcmh.test', 'pharmacy', 'Pharmacy-Password-1', { name: 'Rx Test' });
  g.addStaff('admin@kcmh.test', 'admin', 'Admin-Password-1');
  g.dt = g.session('doc@kcmh.test', 'doctor');
  g.rt = g.session('rx@kcmh.test', 'pharmacy');
  g.at = g.session('admin@kcmh.test', 'admin');
  g.as = (tok, body) => g.post(Object.assign({ token: tok }, body));
  g.as(g.dt, { action: 'registerPatient', isNew: true, patient: P('NF-100001', 'NICU 3') });
  g.as(g.dt, { action: 'registerPatient', isNew: true, patient: P('NF-100002', 'SCN 12') });
  g.log = (sid, ts, entry) => g.as(g.dt, { action: 'logDailyNutrition', sessionId: sid, entry: Object.assign(entry, { ts }) });
  g.cell = (row, col) => g.sheet('Daily_Log').data[row][col];
  g.am = (row) => JSON.parse(g.cell(row, 38));
  return g;
}

T.section('§1 AM · every save stores the figures it carries', () => {
  const g = ward();
  const r = g.log('NF-100001', '2026-10-20', E());
  T.ok('a submitted TPN order saves', !!r.entryId, r);
  T.eq('the row is 39 columns wide (A–AM)', g.sheet('Daily_Log').data[1].length, 39);
  T.eq('AM holds the figures as sent', g.am(1), PJ());
  const d = g.log('NF-100002', '2026-10-20', E({ status: 'draft' }));
  T.ok('a draft stores them too', !!d.entryId && g.am(2).v === 1, d);
  const none = g.log('NF-100001', '2026-10-21', E({ printJson: undefined }));
  T.ok('a save without figures still lands (a tab from before the release)', !!none.entryId, none);
  T.eq('…with AM blank', g.cell(3, 38), '');
  T.eq('no formula injection recorded', g.env.injections, []);
});

T.section('§2 AM · a bad shape is refused, and nothing is written', () => {
  const g = ward();
  const v2 = g.log('NF-100001', '2026-10-20', E({ printJson: { v: 2 } }));
  T.ok('an unknown version → refused, naming printJson', !v2.entryId && /printJson/.test(v2.error || ''), v2);
  const big = g.log('NF-100001', '2026-10-20', E({ printJson: PJ({ pad: 'x'.repeat(9000) }) }));
  T.ok('over 8,000 characters → refused', !big.entryId && /printJson/.test(big.error || ''), big);
  const str = g.log('NF-100001', '2026-10-20', E({ printJson: '=IMPORTXML("x")' }));
  T.ok('a string → refused', !str.entryId && /printJson/.test(str.error || ''), str);
  const arr = g.log('NF-100001', '2026-10-20', E({ printJson: [1] }));
  T.ok('a list → refused', !arr.entryId && /printJson/.test(arr.error || ''), arr);
  T.eq('nothing was written', g.sheet('Daily_Log').data.length - 1, 0);
  T.eq('no formula injection recorded', g.env.injections, []);
});

T.section('§3 AM · edits: a revision has its own figures, a draft moves in place; the ward sync never sees them', () => {
  const g = ward();
  const r1 = g.log('NF-100001', '2026-10-20', E());
  const r2 = g.as(g.dt, { action: 'updateDailyNutrition', sessionId: 'NF-100001', entryId: r1.entryId,
    expectedLastModified: g.cell(1, 26), entry: E({ printJson: PJ({ factor: '2' }) }) });
  T.ok('an edit of a submitted order is a revision', r2.revised === true, r2);
  T.eq('the old row keeps its figures', g.am(1).factor, '1.9');
  T.eq('the revision row has the new ones', g.am(2).factor, '2');

  const d1 = g.log('NF-100002', '2026-10-20', E({ status: 'draft' }));
  const up = g.as(g.dt, { action: 'updateDailyNutrition', sessionId: 'NF-100002', entryId: d1.entryId,
    expectedLastModified: g.cell(3, 26), entry: E({ status: 'draft', printJson: PJ({ factor: '2.1' }) }) });
  T.ok('a draft edit stays in place', up.ok === true && !up.revised, up);
  T.eq('…and AM moves with it', g.am(3).factor, '2.1');

  const text = g.postText({ token: g.dt, action: 'getActivePatients' });
  T.ok('the ward payload carries the order', text.includes(r2.entryId), text.slice(0, 160));
  T.ok('…and none of its sticker figures', !/deliveredMl|stockMl/.test(text));
});

T.done();
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node test/verify-pharmacy-backend-1030.cjs`
Expected: FAIL at `the row is 39 columns wide` (got 38) and `AM holds the figures` (section error from `JSON.parse(undefined)`).

- [ ] **Step 3: Implement**

a. Header comment, `gas-backend.gs` lines 39–42: change `// Daily_Log (A–AG):` to `// Daily_Log (A–AM):` and after the `constantsVersion|appVersion` line add:

```js
//   |published|publishedBy|revisionNumber|revisionOf|supersededAt|printJson
//   (printJson, AM since 2026-10-30: the TPN room's sticker figures, as
//   calculator.jsx computed them — see _printJsonField.)
```

b. `LOG_HEADERS` (line 887, the line ending `"published","publishedBy","revisionNumber","revisionOf","supersededAt"`): append `,"printJson"` inside the array. Change the `LOG_WIDTH` line comment to `// 39, A–AM`, and directly below it add:

```js
// The ward sync reads A–AL only: printJson (AM) is for the TPN room, about
// 1–2 KB a row, and no ward screen reads it (login speed, 2026-09-24).
var LOG_SYNC_WIDTH = 38;
```

c. Sync read, line 1646: replace `var width = Math.min(LOG_WIDTH, sheet.getMaxColumns());` with `var width = Math.min(LOG_SYNC_WIDTH, sheet.getMaxColumns());`. Replace `_fullLogRows`:

```js
function _fullLogRows(sheet) {
  return sheet.getLastRow() > 0
    ? sheet.getDataRange().getValues().slice(1).map(function (r) { return r.slice(0, LOG_SYNC_WIDTH); })
    : [];
}
```

d. Add after `_revisionFields` (ends line 2344):

```js
// Sticker figures, AM (TPN room, Pp 2026-10-30). What calculator.jsx computed
// for the TPN unit's three stickers, stored as sent after a shape and size
// check. Nothing here recomputes them: the backend has no copy of the bag
// arithmetic, as with the stop list. "" for a bag-less order, and for a tab
// from before the release, which sends none (the TPN-room page will not print
// such an order and says to save it again).
var PRINT_JSON_MAX_CHARS = 8000;
function _printJsonField(entry) {
  var pj = entry ? entry.printJson : null;
  if (pj === null || pj === undefined || pj === "") return [""];
  if (typeof pj !== "object" || Array.isArray(pj) || pj.v !== 1) throw new Error("printJson: unknown shape");
  var text = JSON.stringify(pj);
  if (text.length > PRINT_JSON_MAX_CHARS) throw new Error("printJson: longer than " + PRINT_JSON_MAX_CHARS + " characters");
  return [_sheetSafe(text)];
}
```

e. `logDailyNutrition`, line 2451: after `.concat(_revisionFields(entry));` make it `.concat(_revisionFields(entry))` and add `.concat(_printJsonField(entry));` on the next line.

f. `updateDailyNutrition` revision row, line 2554: after `.concat(["", "", nextRevisionNumber, _sheetSafe(entryId), ""])` add `.concat(_printJsonField(entry))` before the `;`.

g. `updateDailyNutrition` in-place row, line 2601: after the `.concat([ ... _sheetSafeRoundTrip(cur[37]), ])` block add `.concat(_printJsonField(entry))` before the `;`.

- [ ] **Step 4: Run it, then every backend harness**

```bash
node test/verify-pharmacy-backend-1030.cjs
for f in test/verify-*.cjs; do node "$f" > /dev/null 2>&1 || echo "FAILED: $f"; done
```
Expected: §1–§3 PASS (§4 onward is not written yet). In the full run, a harness that pins the Daily_Log row at exactly 38 columns (`verify-provenance-stamp.cjs` and `verify-review-0917-backend-writes.cjs` are the likely ones) is updated to 39 with a comment naming AM and this change; nothing else may fail.

- [ ] **Step 5: Commit**

```bash
git add gas-backend.gs test/verify-pharmacy-backend-1030.cjs test/
git commit -m "Daily_Log AM: store the sticker figures; the ward sync stays A-AL

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: the `pharmacy` role, its allow-list and its login reply

**Files:**
- Modify: `gas-backend.gs`: `VALID_STAFF_ROLES` (line 502); `_loginReply` (line 1089); after the password-change gate in `doPost` (line 1308)
- Modify: `test/verify-pharmacy-backend-1030.cjs` (add §4, §5 before `T.done();`)

**Interfaces:**
- Produces: role `pharmacy`. A pharmacy session gets `{ error: "Forbidden" }` for every action except `ping`, `login`, `logout`, `changePassword`, `pharmacyOrders`. Its login reply has no `sync` key.

- [ ] **Step 1: Write the failing tests**

```js
T.section('§4 pharmacy · every action but five is refused, and nothing changes', () => {
  const g = ward();
  g.log('NF-100001', '2026-10-20', E());
  const src = fs.readFileSync(SRC_PATH, 'utf8');
  const actions = [...new Set([...src.matchAll(/action === "([A-Za-z]+)"/g)].map(m => m[1]))];
  const allowed = new Set(['ping', 'login', 'logout', 'changePassword', 'pharmacyOrders']);
  T.ok('the backend names at least 20 actions', actions.length >= 20, actions);
  const snap = () => JSON.stringify(['Daily_Log', 'Patient_Registry', 'Staff'].map(t => g.rows(t)));
  const before = snap(), auditBefore = g.audit().length;
  for (const a of actions.filter(x => !allowed.has(x))) {
    const res = g.as(g.rt, { action: a, sessionId: 'NF-100001', entryId: g.cell(1, 25), expectedLastModified: g.cell(1, 26),
      entry: E(), patient: P('NF-100009', 'NICU 9'), isNew: true });
    T.eq(`${a} → Forbidden`, res.error, 'Forbidden');
  }
  T.eq('no sheet changed', snap(), before);
  T.eq('no audit row was written (the registry was never read)', g.audit().length, auditBefore);
});

T.section('§5 pharmacy · the login reply carries no registry', () => {
  const g = ward();
  const rx = g.post({ action: 'login', email: 'rx@kcmh.test', password: 'Pharmacy-Password-1', wantSync: true });
  T.eq('signed in as pharmacy', [rx.status, rx.role], ['ok', 'pharmacy']);
  T.ok('no sync in the reply', !('sync' in rx), Object.keys(rx));
  T.ok('no infant name anywhere in it', !/ทารกทดสอบ/.test(JSON.stringify(rx)));
  const doc = g.post({ action: 'login', email: 'doc@kcmh.test', password: 'Doctor-Password-1', wantSync: true });
  T.ok('a doctor still gets the first snapshot', !!doc.sync && Array.isArray(doc.sync.patients), Object.keys(doc));
});
```

- [ ] **Step 2: Run it and watch §4–§5 fail**

Run: `node test/verify-pharmacy-backend-1030.cjs`
Expected: §4 FAIL (`Unauthorized`, or the action's own reply, instead of `Forbidden`); §5 FAIL (`signed in as pharmacy`: the role is not valid yet).

- [ ] **Step 3: Implement**

a. Line 502: `var VALID_STAFF_ROLES = { admin: true, doctor: true, nurse: true, pharmacy: true };`

b. `_loginReply`, line 1089: change `if (!resp.mustChangePassword) {` to:

```js
    // A pharmacy account never gets the registry: it carries every infant's
    // name, and the TPN room reads only pharmacyOrders (Pp, 2026-10-30).
    if (!resp.mustChangePassword && resp.role !== "pharmacy") {
```

c. In `doPost`, directly after the password-change gate's closing `}` (line 1308), add:

```js
    // ── a pharmacy account reads one list, and changes nothing ──
    // TPN room, Pp 2026-10-30: pharmacy staff, weekend cover from other units
    // included, must not be able to change anything in NeoFeed. An allow-list,
    // before every other action, so an action added later is refused to
    // pharmacy until it is named here. ping, login and logout are answered
    // above, before the token is checked.
    var PHARMACY_ACTIONS = { changePassword: true, pharmacyOrders: true };
    if (user.role === "pharmacy" && !PHARMACY_ACTIONS[action]) return jsonOut({ error: "Forbidden" });
```

- [ ] **Step 4: Run it and watch it pass**

Run: `node test/verify-pharmacy-backend-1030.cjs`
Expected: §1–§5 PASS. `node test/verify-login-speed-0924.cjs` and `node test/verify-review-0917-backend-security.cjs` still pass.

- [ ] **Step 5: Commit**

```bash
git add gas-backend.gs test/verify-pharmacy-backend-1030.cjs
git commit -m "Pharmacy role: an allow-list of five actions, and no registry at login

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `pharmacyOrders`

> Built as planned below, then changed by the cold-reader fixes (a57595c and the review round after it):
> the prescriber comes from Staff, not `savedByLabel`; the reply adds `entryId`, `twinSuffix` and
> `multiplesCount`; the headers are checked uncached; only the date's rows are read. The code below is
> the original plan. Read `gas-backend.gs` for the current one.

**Files:**
- Modify: `gas-backend.gs`: a `doPost` branch after `getUsageWeekly` (line 1346); the function itself after `publishDailyLog`
- Modify: `test/verify-pharmacy-backend-1030.cjs` (add §6, §7 before `T.done();`)

**Interfaces:**
- Consumes: column AM (Task 3); role `pharmacy` (Task 4).
- Produces: `POST { action: "pharmacyOrders", token, date: "YYYY-MM-DD" }` → `{ ok: true, date, counts: { submitted, drafts, active }, orders: [{ sessionId, bed, bw, dol, status, revision, prescriber, savedAt, submittedAt, printJson }] }`. PR B reads exactly these names.

- [ ] **Step 1: Write the failing tests**

```js
T.section('§6 pharmacyOrders · one date, counts, and no identifying field', () => {
  const g = ward();
  g.as(g.dt, { action: 'registerPatient', isNew: true, patient: P('NF-100003', 'iso 2-1') });
  g.as(g.dt, { action: 'registerPatient', isNew: true, patient: P('NF-100004', 'SCN 1') });
  g.log('NF-100001', '2026-10-20', E({}, { savedByLabel: 'Dr Test (doc@kcmh.test)' }));
  g.log('NF-100002', '2026-10-20', E());
  g.log('NF-100003', '2026-10-20', E());
  g.log('NF-100004', '2026-10-20', E({ status: 'draft' }));
  g.log('NF-100001', '2026-10-21', E());
  g.log('NF-100002', '2026-10-21', E({ route: 'Enteral only', printJson: null }));
  const auditBefore = g.audit().length;
  const res = g.as(g.rt, { action: 'pharmacyOrders', date: '2026-10-20' });
  T.ok('ok', res.ok === true, res);
  T.eq('counts for that date', res.counts, { submitted: 3, drafts: 1, active: 4 });
  T.eq('four orders', res.orders.length, 4);
  const one = res.orders.find(o => o.sessionId === 'NF-100001');
  T.eq('the fields, and only those', Object.keys(one).sort(),
    ['bed', 'bw', 'dol', 'prescriber', 'printJson', 'revision', 'savedAt', 'sessionId', 'status', 'submittedAt']);
  T.eq('bed, BW, DOL, status, revision', [one.bed, one.bw, one.dol, one.status, one.revision], ['NICU 3', 1600, 10, 'submitted', 1]);
  T.eq('the prescriber by name, without the email', one.prescriber, 'Dr Test');
  T.eq('figures on a submitted order', one.printJson.factor, '1.9');
  T.eq('none on the draft', res.orders.find(o => o.sessionId === 'NF-100004').printJson, null);
  const text = JSON.stringify(res);
  T.ok('no name or initials in the reply', !/ทารกทดสอบ|ทท/.test(text));
  T.ok('no date of birth', !/2026-10-01/.test(text));
  T.ok('no email', !/@/.test(text));
  T.eq('one audit row', g.audit().slice(auditBefore), [{ action: 'readPharmacyOrders', sessionId: '', actor: 'rx@kcmh.test' }]);
  const other = g.as(g.rt, { action: 'pharmacyOrders', date: '2026-10-21' });
  T.eq('the next date: the enteral-only order is not a TPN order', [other.counts.submitted, other.orders.length], [1, 1]);
});

T.section('§7 pharmacyOrders · revisions, who may ask, and the date', () => {
  const g = ward();
  const r1 = g.log('NF-100001', '2026-10-20', E());
  g.as(g.dt, { action: 'updateDailyNutrition', sessionId: 'NF-100001', entryId: r1.entryId,
    expectedLastModified: g.cell(1, 26), entry: E({ printJson: PJ({ factor: '2' }) }) });
  const res = g.as(g.rt, { action: 'pharmacyOrders', date: '2026-10-20' });
  T.eq('only the revision is listed', res.orders.map(o => [o.revision, o.printJson.factor]), [[2, '2']]);
  T.eq('a doctor is refused', g.as(g.dt, { action: 'pharmacyOrders', date: '2026-10-20' }).error, 'Forbidden');
  T.eq('an admin is served', g.as(g.at, { action: 'pharmacyOrders', date: '2026-10-20' }).ok, true);
  T.ok('no date → refused', /date/.test(g.as(g.rt, { action: 'pharmacyOrders' }).error || ''));
  T.ok('a malformed date → refused', /date/.test(g.as(g.rt, { action: 'pharmacyOrders', date: '20/10/2026' }).error || ''));
});
```

- [ ] **Step 2: Run it and watch §6–§7 fail**

Run: `node test/verify-pharmacy-backend-1030.cjs`
Expected: §6 FAIL at `ok` (the action is unknown).

- [ ] **Step 3: Implement**

a. `doPost`, directly after the `getUsageWeekly` branch's closing `}` (line 1346):

```js
    // The TPN room's order list (Pp, 2026-10-30). Pharmacy, and admin so the
    // list can be checked without a pharmacy account. Audited before it is
    // read, like a registry read.
    if (action === "pharmacyOrders") {
      if (user.role !== "pharmacy" && user.role !== "admin") return jsonOut({ error: "Forbidden" });
      var pharmacyDate = typeof body.date === "string" ? body.date : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(pharmacyDate)) return jsonOut({ error: "date is required, as YYYY-MM-DD" });
      logAudit("readPharmacyOrders", "", user.email);
      return jsonOut(pharmacyOrders(pharmacyDate));
    }
```

b. After `publishDailyLog`'s closing `}`:

```js
// ── pharmacyOrders (TPN room, Pp 2026-10-30) ──────────────────────────────────
// One ward date's TPN orders, current revisions only: counts, and per order the
// NeoFeed ID, bed, birth weight, DOL, status, revision, the prescriber's name,
// the times and, for a submitted order, the sticker figures (AM). No name,
// initials or date of birth: the TPN room links an ID to an infant from the
// paper order, on its own PC (openspec tpn-room-stickers, D5).
function pharmacyOrders(dateKey) {
  var ss = _book();
  var pat = getSheetPat(ss).getDataRange().getValues();
  var bedOf = {}, bwOf = {}, active = 0;
  for (var i = 1; i < pat.length; i++) {
    var sid = String(pat[i][0] || "");
    if (!sid) continue;
    bedOf[sid] = _normBed(pat[i][10]);
    bwOf[sid] = _numSafe(pat[i][3], 0);
    if (_onUnitStatus(pat[i][9])) active++;
  }
  var sheet = getSheetLog(ss);
  var lastRow = sheet.getLastRow();
  var orders = [], submitted = 0, drafts = 0;
  if (lastRow >= 2) {
    var rows = sheet.getRange(2, 1, lastRow - 1, Math.min(LOG_WIDTH, sheet.getMaxColumns())).getValues();
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      if (_wardDateKey(row[0]) !== dateKey) continue;
      if (!/^TPN/.test(String(row[13] || ""))) continue;
      if (row[37]) continue;   // superseded by a later revision
      var isDraft = String(row[14] || "").trim().toLowerCase() === "draft";
      if (isDraft) drafts++; else submitted++;
      var ci = _parseJson(row[24], {});
      var label = ci && typeof ci.savedByLabel === "string" ? ci.savedByLabel : "";
      var rowSid = String(row[1] || "");
      orders.push({
        sessionId: rowSid,
        bed: bedOf[rowSid] || "",
        bw: bwOf[rowSid] || 0,
        dol: _numSafe(row[2], 0),
        status: isDraft ? "draft" : "submitted",
        revision: _numSafe(row[35], 1),
        prescriber: label.replace(/\s*\([^()]*@[^()]*\)\s*$/, "").trim(),
        savedAt: String(row[26] || ""),
        submittedAt: row[33] ? String(row[33]) : "",
        printJson: isDraft ? null : _parseJson(row[38], null),
      });
    }
  }
  return { ok: true, date: dateKey, counts: { submitted: submitted, drafts: drafts, active: active }, orders: orders };
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
node test/verify-pharmacy-backend-1030.cjs
node tools/ci_bans.js
```
Expected: `PHARMACY BACKEND 2026-10-30: ALL PASS`; no ci_bans finding (nothing here logs a cell).

- [ ] **Step 5: Commit**

```bash
git add gas-backend.gs test/verify-pharmacy-backend-1030.cjs
git commit -m "pharmacyOrders: one date's TPN orders for the TPN room, audited, no names

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: the NeoFeed app turns a pharmacy account away

**Files:**
- Modify: `app.jsx` (`loginRequest`, line 3511)
- Create: `test/verify-pharmacy-frontend-1030.cjs`
- Build: `compiled/app.js`, both HTML shells

**Interfaces:**
- Consumes: the login reply's `role` (Task 4).
- Produces: `loginRequest` rejects with a Thai message for role `pharmacy`, after sending `logout` for the token it got.

- [ ] **Step 1: Write the failing test**

```js
// verify-pharmacy-frontend-1030.cjs — the ward app refuses a pharmacy sign-in
// (openspec tpn-room-stickers, D6; Pp, 2026-10-30): the account works with the
// TPN-room page only. The server refuses it everything else (verify-pharmacy-
// backend-1030.cjs § 4); this is the readable half. Synthetic accounts only.
const B = require('./review-0917-boot.cjs');
let pass = 0, fail = 0;
const eq = (name, got, want) => { const y = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${y ? 'PASS' : 'FAIL'}  ${name}${y ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); y ? pass++ : fail++; };

(async () => {
  B.boot({ session: null, patients: [] });
  const sent = [];
  const reply = (role) => async (body) => {
    sent.push(body.action);
    if (body.action === 'login') return { status: 'ok', name: 'Synthetic', role, email: role + '@kcmh.test', token: 'tok-' + role + '-1', authMethod: 'password' };
    return { ok: true };
  };

  globalThis.gasRequest = reply('pharmacy');
  let err = null;
  try { await globalThis.loginRequest({ email: 'pharmacy@kcmh.test', password: 'Synthetic-Pass-1' }); } catch (e) { err = e; }
  eq('a pharmacy sign-in is refused', !!err, true);
  eq('…with the reason in Thai', /บัญชีเภสัช/.test(err && err.message), true);
  await new Promise(r => setTimeout(r, 0));
  eq('…and the session it opened is closed', sent, ['login', 'logout']);
  eq('…and nothing is stored', window.sessionStorage.getItem('neofeed_session'), null);

  sent.length = 0;
  globalThis.gasRequest = reply('doctor');
  const res = await globalThis.loginRequest({ email: 'doctor@kcmh.test', password: 'Synthetic-Pass-1' });
  eq('a doctor signs in as before', [res.user.role, sent], ['doctor', ['login']]);

  console.log(`\n${fail === 0 ? 'PHARMACY FRONTEND 1030: ALL PASS' : `PHARMACY FRONTEND 1030: ${fail} FAILED`} (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
})();
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node test/verify-pharmacy-frontend-1030.cjs`
Expected: FAIL at `a pharmacy sign-in is refused`.

- [ ] **Step 3: Implement**

In `app.jsx` `loginRequest`, directly after `if (data.status !== "ok") throw new Error(data.error || "ไม่พบบัญชีนี้ในระบบ");` (line 3511):

```jsx
  // A pharmacy account works with the TPN-room page only (Pp, 2026-10-30).
  // The server refuses it everything else; here the ward app says so, closes
  // the session it just opened, and never stores it.
  if (data.role === "pharmacy") {
    gasRequest({ action: "logout", token: data.token }).catch(() => {});
    throw new Error("บัญชีนี้เป็นบัญชีเภสัช ใช้กับหน้าห้อง TPN เท่านั้น");
  }
```

- [ ] **Step 4: Rebuild, run it and watch it pass**

```bash
npm ci --prefix tools && node tools/build.mjs
node test/verify-pharmacy-frontend-1030.cjs
node test/verify-forced-password-client.cjs
node test/verify-login-speed-0924.cjs
```
Expected: `PHARMACY FRONTEND 1030: ALL PASS`; the two sign-in harnesses still pass.

- [ ] **Step 5: Commit**

```bash
git add app.jsx compiled/ index.html NeoFeed.html test/verify-pharmacy-frontend-1030.cjs
git commit -m "Ward app: a pharmacy account is turned away at sign-in

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: docs, the full run, the one-page check, Vera and the PR

**Files:**
- Modify: `REFERENCE.md` (§ Backend: role `pharmacy`, column AM, `pharmacyOrders`, deploy order), `CHANGELOG.md` (an entry for 2026-10-30), `STATUS.md` (not live), `BACKLOG.md` (the "Pharmacist role" item: read-only part built, status loop still open; the 2026-09-28 "add Addamel" note becomes an item of its own: an Addamel N field for the older-children ward, its own PR, Pp 2026-10-30), `openspec/changes/tpn-room-stickers/tasks.md` (tick 1.2–1.7a), `openspec/changes/tpn-room-stickers/proposal.md`, `design.md` and `specs/order-print-figures/spec.md` (record changes 1, 3, 4 and 5 at the top of this plan; change 2 is already in them)

- [ ] **Step 1: Docs.** Write the entries above. In `design.md`, replace D3's row with "dropped (plan for PR A, change 1)", and in `specs/order-print-figures/spec.md` remove the requirement "Submit requires printed figures" and its scenario.

- [ ] **Step 2: The full run, both modes, as CI does**

```bash
npm ci --prefix tools && node tools/build.mjs && git status --porcelain
cmp index.html NeoFeed.html
node tools/ci_bans.js --self-test && node tools/ci_bans.js
for f in test/verify-*.cjs; do node "$f" > /dev/null 2>&1 || echo "FAILED: $f"; done
```
Expected: the build leaves no change; the shells match; no ci_bans finding; no `FAILED:` line. Then the compiled pass as `test/README.md` describes for CI.

- [ ] **Step 3: The one-page check (D11, no code).** Run `node tools/dev-local.mjs --tree HEAD`, open the fullest synthetic order (every stock line ordered, a confirmed critical value, a previous day so the changes line shows), press Print, and save as PDF. Expected: one A4 page. Put the page count and the order's inputs in the PR body.

- [ ] **Step 4: Vera.** Run Vera as `REFERENCE.md` § Pre-PR review says (this PR touches the printed order's data, auth and patient data) and paste her report into the PR body.

- [ ] **Step 5: PR.** Use the `pr` skill for the body. It carries: Pp's sign-off on Task 0's table, changes 1–5, the one-page result, Vera's report, the deploy order (backend `clasp push` then `clasp deploy --deploymentId AKfycbz8Nt...` on Pp's go-ahead, `applyLogHeaderColumns()` run once from the editor by Pp; then the `main → release` PR), and a `learned:` list. Check it with `python ~/.claude/hooks/slop_check.py`. Push the branch, open the PR against `main`, bind it with the ccd_pr tools.

- [ ] **Step 6: Commit the docs**

```bash
git add REFERENCE.md CHANGELOG.md STATUS.md BACKLOG.md openspec/
git commit -m "Docs for the TPN-room sticker figures and the pharmacy role

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
