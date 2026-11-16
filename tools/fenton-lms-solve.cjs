// tools/fenton-lms-solve.cjs — L, M and S at each knot, solved from the
// z-scores fentongrowth.ca returned for three made-up values per knot.
//
//   node tools/fenton-lms-solve.cjs test/fenton-official-1116.json
//
// Fenton's LMS parameters are not published. His calculator returns a z-score
// for any size at any age, and z = ((x/M)^L − 1) / (L·S). For a given L that
// is a straight line in (z, x^L): x^L = M^L + (M^L·L·S)·z. So L is the value
// that puts the three points of a knot on one line (found by bisection), and M
// and S follow from that line. Prints the rows for data.js and, for the
// held-out points no row was built from, how far the table's z is from the
// official one (rows read by straight line between knots, as fenton.jsx does).
//
// The same method gave FENTON_WEIGHT_GROWTH_LMS on 2026-10-19; this file is
// the solver written down, so a later API version can be re-solved.
const fs = require('fs');

function solveKnot(pts) {
  // pts: three { value, z }, distinct z.
  const [a, b, c] = pts.slice().sort((p, q) => p.z - q.z);
  // Box-Cox form, (x^L − 1)/L, which tends to ln x at L = 0. With plain x^L
  // every L near 0 looks collinear (x^L ≈ 1 + L·ln x), a root that is not one.
  const g = (L) => {
    const y = (x) => (Math.abs(L) < 1e-9 ? Math.log(x) : (Math.pow(x, L) - 1) / L);
    return (y(b.value) - y(a.value)) / (b.z - a.z) - (y(c.value) - y(b.value)) / (c.z - b.z);
  };
  // Walk L from −6 to 10 in steps of 0.25 and bisect in the first step where g
  // changes sign. Growth data has one such L (1 when the size is normal at that age).
  let lo = null, hi = null;
  for (let L0 = -6; L0 < 10; L0 += 0.25) {
    if (g(L0) === 0) { lo = hi = L0; break; }
    if (g(L0) * g(L0 + 0.25) < 0) { lo = L0; hi = L0 + 0.25; break; }
  }
  if (lo === null) throw new Error('no L in [-6, 10] puts the three points on one line: ' + JSON.stringify(pts));
  for (let i = 0; i < 200 && hi > lo; i++) {
    const mid = (lo + hi) / 2;
    if (g(lo) * g(mid) <= 0) hi = mid; else lo = mid;
  }
  const L = (lo + hi) / 2;
  const y = (x) => Math.pow(x, L);
  const slope = (y(c.value) - y(a.value)) / (c.z - a.z);
  const intercept = y(a.value) - slope * a.z;
  const M = Math.pow(intercept, 1 / L);
  const S = slope / (intercept * L);
  return { L, M, S };
}
// L fixed at 1 (a normal distribution: x = M + M·S·z), M and S by least
// squares over the knot's points. Used for length and head circumference,
// where the free L above comes out as 1 within the noise of a 3-decimal z.
function normalKnot(pts) {
  const n = pts.length;
  const sz = pts.reduce((a, p) => a + p.z, 0), sx = pts.reduce((a, p) => a + p.value, 0);
  const szz = pts.reduce((a, p) => a + p.z * p.z, 0), szx = pts.reduce((a, p) => a + p.z * p.value, 0);
  const sd = (n * szx - sz * sx) / (n * szz - sz * sz);
  const M = (sx - sd * sz) / n;
  return { L: 1, M, S: sd / M };
}
const zOf = ({ L, M, S }, x) => (Math.abs(L) < 1e-9 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S));

function solveTable(points, sex, measure, fit = solveKnot) {
  const knots = new Map();
  for (const p of points) {
    if (p.sex !== sex || p.measure !== measure || p.use !== 'knot') continue;
    if (!knots.has(p.age)) knots.set(p.age, []);
    knots.get(p.age).push(p);
  }
  return [...knots.entries()].sort((x, y) => x[0] - y[0]).map(([age, pts]) => {
    if (pts.length !== 3) throw new Error(`${sex} ${measure} ${age}: ${pts.length} points, want 3`);
    return { age, ...fit(pts), pts };
  });
}
function lmsAt(rows, t) {
  if (t < rows[0].age || t > rows[rows.length - 1].age) return null;
  const i = Math.max(0, rows.findIndex((r) => r.age >= t) - 1);
  const lo = rows[i], hi = rows[Math.min(i + 1, rows.length - 1)];
  const f = hi.age === lo.age ? 0 : (t - lo.age) / (hi.age - lo.age);
  return { L: lo.L + f * (hi.L - lo.L), M: lo.M + f * (hi.M - lo.M), S: lo.S + f * (hi.S - lo.S) };
}

module.exports = { solveKnot, normalKnot, solveTable, lmsAt, zOf };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node tools/fenton-lms-solve.cjs <fixture.json>'); process.exit(2); }
  const fx = JSON.parse(fs.readFileSync(file, 'utf8'));
  const sgn = (v, d) => (v >= 0 ? '+' : '') + v.toFixed(d);
  for (const [title, fit] of [['free L', solveKnot], ['L = 1 (the rows in data.js)', normalKnot]]) {
    for (const measure of ['length', 'head']) {
      for (const sex of ['boys', 'girls']) {
        const rows = solveTable(fx.points, sex, measure, fit);
        console.log(`\n// ${measure} · ${sex} · ${title}`);
        for (const r of rows) console.log(`    [${r.age.toFixed(1)}, ${sgn(r.L, 3)}, ${r.M.toFixed(3).padStart(6)}, ${r.S.toFixed(5)}],`);
        let worstKnot = 0, worstHeld = 0, n = 0;
        for (const r of rows) for (const p of r.pts) worstKnot = Math.max(worstKnot, Math.abs(zOf(r, p.value) - p.z));
        for (const p of fx.points) {
          if (p.sex !== sex || p.measure !== measure || p.use !== 'held-out') continue;
          const lms = lmsAt(rows, p.age);
          if (!lms) continue;
          worstHeld = Math.max(worstHeld, Math.abs(zOf(lms, p.value) - p.z)); n++;
        }
        console.log(`// knots read back within ${worstKnot.toFixed(4)} z; ${n} held-out points within ${worstHeld.toFixed(4)} z`);
      }
    }
  }
}
