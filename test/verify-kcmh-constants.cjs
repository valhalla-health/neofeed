// Verify NeoFeed's post-fix constants reproduce the official KCMH worksheet.
// Expected values are the sheet's OWN cached results (data_only read of the xlsx).
const fs = require('fs');
const vm = require('vm');

const DATA = require('path').join(__dirname, '..', 'data.js');
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(DATA, 'utf8'), sandbox);
const D = sandbox.window.NEOFEED_DATA;
const S = D.KCMH_STOCK;

let fails = 0;
const near = (label, got, want, tol) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(30)} got ${Number(got.toFixed(4))}  want ${want}  (±${tol})`);
};

// ── Case 1: sheet "s tpn2" — 1.0 kg, 100 mL bag, D10, AA 3.0 g/kg, Ca 80 mg/kg, heparin 1 U/mL
// ── Case 2: sheet "s tpn3" — same but AA 3.4 g/kg, heparin 0.5 U/mL
const cases = [
  { name: 's tpn2', wtKg: 1.0, vol: 100, dexPct: 10, aaPerKg: 3.0, caPerKg: 80, heparinUmL: 1.0,
    want: { osm: 856, kcal: 46, d50w: 20, aa: 30, ca: 8.872, heparinMl: 1.0, componentVol: 59.9, wfi: 40.1 } },
  { name: 's tpn3', wtKg: 1.0, vol: 100, dexPct: 10, aaPerKg: 3.4, caPerKg: 80, heparinUmL: 0.5,
    want: { osm: 896, kcal: 48, d50w: 20, aa: 34, ca: 8.872, heparinMl: 0.5, componentVol: 63.4, wfi: 36.6 } },
];

for (const c of cases) {
  console.log(`\n── ${c.name} ──  ${c.wtKg} kg · ${c.vol} mL · D${c.dexPct} · AA ${c.aaPerKg} g/kg`);
  const dexG = c.vol * c.dexPct / 100;
  const aaG  = c.aaPerKg * c.wtKg;

  const d50w    = dexG / S.d50w.gPerMl;
  const aaVol   = aaG / S.aminoven10.gPerMl;
  const caVol   = c.caPerKg * c.wtKg / S.caGluconate.caMgPerMl;
  const hepVol  = c.heparinUmL * c.vol / S.heparin.unitsPerMl;
  // Sheet's Soluvit/Peditrace are 0 in these two starter recipes
  const componentVol = d50w + aaVol + caVol + hepVol;
  const wfi = c.vol - componentVol;

  // Osmolarity — sheet E52. Ca enters as mEq/L; NeoFeed passes elemental mg/L ÷ 20.
  const osm = D.estimateOsmolarity({
    dexPct: c.dexPct,
    aaPct: aaG / c.vol * 100,
    naMeqPerL: 0, kMeqPerL: 0,
    caMgPerL: c.caPerKg * c.wtKg / (c.vol / 1000),
    mgMeqPerL: 0,
  });
  const kcal = 3.4 * dexG + 4 * aaG + 9 * 0;   // no lipid in the aqueous bag

  near('D50W mL',        d50w,        c.want.d50w,        0.05);
  near('Aminoven 10% mL', aaVol,      c.want.aa,          0.05);
  near('Ca gluconate mL', caVol,      c.want.ca,          0.005);
  near('Heparin mL',      hepVol,     c.want.heparinMl,   0.005);
  near('Component total mL', componentVol, c.want.componentVol, 0.1);
  near('WFI q.s. mL',     wfi,        c.want.wfi,         0.1);
  near('Osmolarity mOsm/L', osm,      c.want.osm,         1.0);   // sheet rounds to integer
  near('Calories kcal',   kcal,       c.want.kcal,        0.6);   // sheet rounds to integer
}

// ── Stock strengths must equal the sheet's divisors exactly ─────────────
console.log('\n── Stock strengths vs sheet divisors ──');
near('20% NaCl mEq/mL',   S.naCl.naMeqPerMl,        3.42,    0);
near('Na acetate mEq/mL', S.naAcetate.naMeqPerMl,   3.0,     0);
near('KCl mEq/mL',        S.kCl.kMeqPerMl,          2.0,     0);
near('K2HPO4 mEq K/mL',   S.k2hpo4.kMeqPerMl,       1.0,     0);
near('K2HPO4 P mg/mEq',   S.k2hpo4.pMgPerKMeq,      15.5,    0);
near('Glycophos Na mEq/mL', S.glycophos.naMeqPerMl, 2,       0);
near('Glycophos P mg/mL', S.glycophos.pMgPerMl,     31,      0);
// sheet I32 = mEq × 2 / 8.12 × 5  →  1 mEq needs 2/8.12*5 mL  →  0.812 mEq/mL
near('MgSO4 10% mEq/mL',  S.mgso4_10.mgMeqPerMl,    1 / (2 / 8.12 * 5), 0.0005);
near('MgSO4 50% mEq/mL',  S.mgso4_50.mgMeqPerMl,    1 / (2 / 8.12),     0.0005);
near('Ca gluc mg/mL',     S.caGluconate.caMgPerMl,  9.01755, 0.00001);
near('Peditrace mL/kg',   S.peditrace.mlPerKg,      1.0,     0);
near('Soluvit mL/kg',     S.soluvit.mlPerKg,        1.0,     0);
near('Max dextrose g/kg', D.MAX_DEXTROSE_G_KG,      18,      0);
near('Max K mEq/L',       D.MAX_K_MEQ_PER_L,        40,      0);

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURE(S)`);
process.exit(fails ? 1 : 0);
