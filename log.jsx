// ============================================================
// Daily log + trends view
// ============================================================
const D_L = window.NEOFEED_DATA;

// Safe number formatter — handles strings / null from GAS. At most `d`
// decimals and never a trailing zero: "3.0 g/kg" can be read as 30 (Praew,
// 2026-09-22) — D_L.displayNum.
const n = (v, d = 1) => D_L.displayNum(v, d);

// ============================================================
// TrendGraph — single-metric trend with target zone + axis toggle
// ============================================================
// Metric configs: target zones derived from D_L.TARGETS / KCMH practice
// Score = entry[key]; x = DOL or DayAdmit (entry.dol - admitDol)
// ============================================================
// Target picker — switches between PN and EN regimes per entry.
// Trigger: entry.enVolPerKg >= 100 mL/kg/d → ENTERAL_TARGETS, else TPN_TARGETS.
// Returns [lo, hi] or null when no target band applies in that mode.
function pickTarget(metricKey, entry, patient) {
  if (!entry) return null;
  const isEN = (entry.enVolPerKg || 0) >= 100;
  // Re-derived from the row's date, not the stored snapshot — a stale `dol`
  // would pick the wrong day's TPN target band (see D_L.entryDol).
  const dol = D_L.entryDol(patient, entry);
  const wt  = entry.weight || patient?.bw || 1000;
  if (isEN) {
    if (metricKey === "kcal")  return D_L.ENTERAL_TARGETS.kcal();
    if (metricKey === "pro")   return D_L.ENTERAL_TARGETS.protein();
    if (metricKey === "gir")   return null; // GIR n/a when fully enteral
    if (metricKey === "fluid") return D_L.TARGETS.fluid(dol, wt, patient?.bw);
    if (metricKey === "na")    return D_L.ENTERAL_TARGETS.na();
    if (metricKey === "k")     return D_L.ENTERAL_TARGETS.k();
    if (metricKey === "ca")    return D_L.ENTERAL_TARGETS.ca();
    if (metricKey === "p")     return D_L.ENTERAL_TARGETS.p();
  } else {
    if (metricKey === "kcal")  return D_L.TPN_TARGETS.kcal(dol);
    if (metricKey === "pro")   return D_L.TPN_TARGETS.protein(dol);
    if (metricKey === "gir")   return [8, 10];
    if (metricKey === "fluid") return D_L.TARGETS.fluid(dol, wt, patient?.bw);
    if (metricKey === "na")    return D_L.TPN_TARGETS.na(dol);
    if (metricKey === "k")     return D_L.TPN_TARGETS.k(dol);
    if (metricKey === "ca")    return D_L.TPN_TARGETS.ca(dol);
    if (metricKey === "p")     return D_L.TPN_TARGETS.p(dol);
  }
  return null;
}

const METRICS = [
  // Energy is blue, not the dark green it was: that green sat on top of the
  // green target band and the two read as one (Praew, 2026-09-23).
  { key: "kcal",   label: "Energy",    unit: "kcal/kg/d", color: "oklch(50% 0.15 250)", yMax: 160, ticks: [0, 30, 60, 90, 120, 150] },
  { key: "pro",    label: "Protein",   unit: "g/kg/d",    color: "oklch(55% 0.13 155)",  yMax: 5,   ticks: [0, 1, 2, 3, 4, 5] },
  { key: "gir",    label: "GIR",       unit: "mg/kg/min", color: "oklch(58% 0.14 35)",   yMax: 14,  ticks: [0, 2, 4, 6, 8, 10, 12, 14] },
  { key: "fluid",  label: "Fluid",     unit: "mL/kg/d",   color: "oklch(56% 0.11 280)",  yMax: 200, ticks: [0, 40, 80, 120, 160, 200] },
  { key: "na",     label: "Sodium",    unit: "mEq/kg/d",  color: "oklch(64% 0.13 60)",   yMax: 8,   ticks: [0, 2, 4, 6, 8] },
  { key: "k",      label: "Potassium", unit: "mEq/kg/d",  color: "oklch(60% 0.13 320)",  yMax: 6,   ticks: [0, 1, 2, 3, 4, 5, 6] },
  { key: "ca",     label: "Calcium",   unit: "mg/kg/d",   color: "oklch(58% 0.12 95)",   yMax: 220, ticks: [0, 50, 100, 150, 200] },
  { key: "p",      label: "Phosphorus",unit: "mg/kg/d",   color: "oklch(54% 0.13 340)",  yMax: 130, ticks: [0, 25, 50, 75, 100, 125] },
  { key: "weight", label: "Weight",    unit: "g",         color: "oklch(50% 0.12 25)",   yMax: null, ticks: null },
];

function TrendGraph({ entries, patient }) {
  const [metricKey, setMetricKey] = React.useState("kcal");
  const [xMode, setXMode] = React.useState("dayAdmit"); // "dol" | "dayAdmit"
  const [hover, setHover] = React.useState(null);
  const svgRef = React.useRef(null);

  const metric = METRICS.find(m => m.key === metricKey);

  // admit DOL = first weight entry's DOL (matches app.jsx convention)
  const admitDol = patient?.weights?.[0]?.dol ?? entries[0]?.dol ?? 1;

  // map entries → {x, y, raw}. Each point's DOL is re-derived from the row's
  // calendar date (D_L.entryDol) rather than read off the stored `dol`
  // column, so a row written before the admission date was set — or before a
  // later correction to it — plots on the day it was actually recorded
  // instead of collapsing onto DOL 1.
  const points = React.useMemo(() => entries
    .filter(e => e[metricKey] != null && isFinite(parseFloat(e[metricKey])))
    .map(e => {
      const eDol = D_L.entryDol(patient, e);
      return {
        x: xMode === "dayAdmit" ? (eDol - admitDol) : eDol,
        y: parseFloat(e[metricKey]),
        dol: eDol,
        dayAdmit: eDol - admitDol,
        ts: e.ts,
        raw: e,
        // The band that applied on THIS day, under THIS day's regime. Almost
        // every TPN target steps with DOL (fluid, energy, protein, Na, K, Ca,
        // P), so one band cannot describe a history — see `bandPath` below.
        band: pickTarget(metricKey, e, patient),
      };
    })
    .sort((a, b) => a.x - b.x), [entries, metricKey, xMode, admitDol, patient]);

  if (entries.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
        No log entries yet — submit a daily log from the Calculator to start the trend.
      </div>
    );
  }

  // ── domain & geometry ─────────────────────────────────────
  const W = 760, H = 280, pad = { l: 52, r: 24, t: 16, b: 36 };

  const xMin = 0;
  const xMaxRaw = Math.max(...points.map(p => p.x), xMode === "dayAdmit" ? 7 : (admitDol + 7));
  const xMax = Math.max(xMaxRaw, xMin + 1);

  // dynamic Y: weight uses data range, others use metric.yMax (with auto-expand if exceeded)
  let yMin = 0, yMax;
  if (metric.key === "weight") {
    const ys = points.map(p => p.y).filter(v => v > 0);
    if (ys.length === 0) { yMin = 0; yMax = 1000; }
    else {
      const lo = Math.min(...ys), hi = Math.max(...ys);
      const span = Math.max(hi - lo, 50);
      yMin = Math.max(0, lo - span * 0.15);
      yMax = hi + span * 0.15;
    }
  } else {
    const dataMax = points.length ? Math.max(...points.map(p => p.y)) : 0;
    yMax = Math.max(metric.yMax, dataMax * 1.1);
  }

  const xScale = x => pad.l + ((x - xMin) / (xMax - xMin)) * (W - pad.l - pad.r);
  const yScale = y => H - pad.b - ((y - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);

  // ticks
  const xTickStep = xMax <= 10 ? 1 : xMax <= 20 ? 2 : xMax <= 40 ? 5 : 10;
  const xTicks = [];
  for (let t = 0; t <= xMax; t += xTickStep) xTicks.push(t);

  const yTicks = metric.ticks || (() => {
    // weight: 6 ticks
    const step = (yMax - yMin) / 5;
    return Array.from({ length: 6 }, (_, i) => yMin + step * i);
  })();

  // ── path: smooth via Catmull-Rom → cubic Bezier ───────────
  const linePath = () => {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${xScale(points[0].x)} ${yScale(points[0].y)}`;
    const pts = points.map(p => [xScale(p.x), yScale(p.y)]);
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  };

  // ── hover handling ────────────────────────────────────────
  const handleMove = e => {
    if (!points.length) return;
    const rect = svgRef.current.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / rect.width * W;
    // find nearest point
    let nearest = points[0], best = Infinity;
    for (const p of points) {
      const d = Math.abs(xScale(p.x) - sx);
      if (d < best) { best = d; nearest = p; }
    }
    if (best < 80) setHover(nearest);
    else setHover(null);
  };

  // ── status of latest point ────────────────────────────────
  const latest = points[points.length - 1];
  // Dynamic target band based on latest entry's regime (PN vs EN ≥ 100 mL/kg).
  // Used for the status dot and the legend — i.e. for the LATEST value only,
  // which is the one question it answers correctly. The band drawn on the
  // chart is per-day (bandSteps below).
  const targetBand = latest ? latest.band : null;
  const isENMode = latest && (latest.raw.enVolPerKg || 0) >= 100;
  let status = "empty";
  if (latest && targetBand) {
    const [lo, hi] = targetBand;
    if (latest.y >= lo && latest.y <= hi) status = "ok";
    else if (latest.y < lo * 0.7 || latest.y > hi * 1.3) status = "crit";
    else status = "warn";
  }
  const statusColor = status === "ok" ? "var(--ok)" : status === "warn" ? "var(--warn)" : status === "crit" ? "var(--crit)" : "var(--ink-3)";

  // ── The target band, as it actually moved ─────────────────────────────
  // It used to be ONE rectangle, spanning the full width at the latest entry's
  // band. Nearly every target here steps with DOL, so a day that was exactly
  // on target for its own day was drawn far below "the" band — a DOL-2 energy
  // of 55 kcal/kg/d (target 50–60) read as less than half of the DOL-20 band
  // painted over it, and a nurse checking whether the week had gone well was
  // reading a comparison nobody had made (2026-09-23). Now each point's own
  // band (point.band) is drawn as a step, so the chart compares every day
  // against the day it was.
  //
  // Steps, not a smooth ribbon: the targets are step functions of DOL, and
  // interpolating between them would draw a band that never existed.
  // A plain computation, not a useMemo: this sits below the early return for
  // an empty log, and a hook there would change the hook order between renders.
  const bandSteps = (() => {
    const withBand = points.filter(p => p.band);
    if (withBand.length === 0) return [];
    const out = [];
    for (let i = 0; i < withBand.length; i++) {
      const p = withBand[i];
      const prev = out[out.length - 1];
      // Merge consecutive days that share a band, so a long stretch on one
      // band is one rectangle rather than a row of abutting ones.
      if (prev && prev.lo === p.band[0] && prev.hi === p.band[1]) { prev.x1 = p.x; continue; }
      out.push({ x0: prev ? prev.x1 : p.x, x1: p.x, lo: p.band[0], hi: p.band[1] });
    }
    // Extend the first and last steps to the chart edges, so the band does not
    // appear to start and stop inside the plot area.
    if (out.length) { out[0].x0 = xMin; out[out.length - 1].x1 = xMax; }
    return out;
  })();

  const xAxisLabel = xMode === "dayAdmit" ? "Day of admission" : "Day of life (DOL)";

  return (
    <div>
      {/* ── Controls: metric chips + x-axis toggle ── */}
      <div className="trend-controls" style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid var(--line-2)" }}>
        <div className="trend-chips" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {METRICS.map(m => {
            const active = m.key === metricKey;
            return (
              <button
                key={m.key}
                onClick={() => setMetricKey(m.key)}
                className="trend-chip"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: active ? 600 : 500,
                  border: "1px solid",
                  borderColor: active ? m.color : "var(--line)",
                  background: active ? m.color : "var(--surface)",
                  color: active ? "#fff" : "var(--ink-2)",
                  borderRadius: 999,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  letterSpacing: "-0.005em",
                  boxShadow: active ? `0 1px 4px ${m.color}40` : "none",
                  fontFamily: "inherit",
                }}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: 999,
                  background: active ? "#fff" : m.color,
                  opacity: active ? 0.95 : 1,
                }} />
                {m.label}
              </button>
            );
          })}
        </div>

        <div className="trend-xaxis" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>X-axis</span>
          <div className="seg trend-xaxis-seg">
            <button className={xMode === "dayAdmit" ? "on" : ""} onClick={() => setXMode("dayAdmit")}>Admit day</button>
            <button className={xMode === "dol" ? "on" : ""} onClick={() => setXMode("dol")}>DOL</button>
          </div>
        </div>
      </div>

      {/* ── Current reading: Latest / Target / Δ ── */}
      {latest && (
        <div className="trend-latest" style={{ display: "flex", gap: 28, alignItems: "stretch", marginBottom: 14, padding: "4px 0" }}>
          <div>
            <div style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>Latest</div>
            <div style={{ fontSize: 26, fontFamily: "IBM Plex Mono, monospace", fontWeight: 500, color: statusColor, lineHeight: 1.05, marginTop: 2 }}>
              {n(latest.y, metric.key === "weight" ? 0 : 1)}
              <span style={{ fontSize: 11.5, color: "var(--ink-3)", marginLeft: 6, fontFamily: "inherit", fontWeight: 400 }}>{metric.unit}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2, fontFamily: "IBM Plex Mono, monospace" }}>
              DOL {latest.dol} · Day {latest.dayAdmit} of admission · {window.NEOFEED_FMT_DATE?.(latest.ts) || latest.ts}
            </div>
          </div>
          {targetBand && (
            <div>
              <div style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, display:"flex", alignItems:"center", gap:6 }}>
                Target
                <span style={{ fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 999,
                  background: isENMode ? "oklch(94% 0.05 155)" : "var(--brand-bg-2)",
                  color: isENMode ? "oklch(40% 0.13 155)" : "var(--brand-ink)",
                  letterSpacing: "0.04em" }}>
                  {isENMode ? "EN" : "PN"}
                </span>
              </div>
              <div style={{ fontSize: 14, fontFamily: "IBM Plex Mono, monospace", color: "var(--ink-2)", marginTop: 6 }}>
                {targetBand[0]}–{targetBand[1]} <span style={{ color: "var(--ink-3)", fontSize: 11 }}>{metric.unit}</span>
              </div>
            </div>
          )}
          {points.length >= 2 && latest.y > 0 && points[points.length - 2].y > 0 && (
            <div>
              <div style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>Δ vs prev</div>
              <div style={{ fontSize: 14, fontFamily: "IBM Plex Mono, monospace", color: "var(--ink-2)", marginTop: 6 }}>
                {(() => {
                  const prev = points[points.length - 2];
                  const d = latest.y - prev.y;
                  const sign = d > 0 ? "+" : "";
                  return `${sign}${n(d, metric.key === "weight" ? 0 : 1)} ${metric.unit}`;
                })()}
              </div>
            </div>
          )}
          {/* Route-change indicator when current is 0 but had value before (PN stopped, etc.) */}
          {points.length >= 2 && latest.y === 0 && points[points.length - 2].y > 0 && (
            <div>
              <div style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>Status</div>
              <div style={{ fontSize: 13, color: "var(--warn)", fontWeight: 600, marginTop: 6 }}>
                Route stopped ↓
              </div>
            </div>
          )}
        </div>
      )}

      {/* chart */}
      <div style={{ position: "relative" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", height: "auto", maxWidth: W, display: "block" }}
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
        >
          {/* plot area background — white, so the green target band is the
              only colour behind the line (Praew, 2026-09-23) */}
          <rect x={pad.l} y={pad.t} width={W - pad.l - pad.r} height={H - pad.t - pad.b} fill="var(--surface)" />

          {/* target zone — one step per band, following the DOL */}
          {bandSteps.map((b, i) => (
            <g key={i}>
              <rect
                x={xScale(b.x0)}
                y={yScale(b.hi)}
                width={Math.max(0, xScale(b.x1) - xScale(b.x0))}
                height={Math.max(0, yScale(b.lo) - yScale(b.hi))}
                fill="oklch(52% 0.12 155 / .09)"
              />
              <line x1={xScale(b.x0)} x2={xScale(b.x1)} y1={yScale(b.lo)} y2={yScale(b.lo)}
                    stroke="oklch(52% 0.12 155 / .35)" strokeWidth="1" strokeDasharray="3 3" />
              <line x1={xScale(b.x0)} x2={xScale(b.x1)} y1={yScale(b.hi)} y2={yScale(b.hi)}
                    stroke="oklch(52% 0.12 155 / .35)" strokeWidth="1" strokeDasharray="3 3" />
              {/* The risers that make it read as a step rather than two
                  unrelated bars. */}
              {i > 0 && (
                <line x1={xScale(b.x0)} x2={xScale(b.x0)}
                      y1={yScale(Math.max(b.hi, bandSteps[i - 1].hi))}
                      y2={yScale(Math.min(b.lo, bandSteps[i - 1].lo))}
                      stroke="oklch(52% 0.12 155 / .22)" strokeWidth="1" strokeDasharray="3 3" />
              )}
            </g>
          ))}
          {bandSteps.length > 0 && (
            <text x={W - pad.r - 4} y={yScale(bandSteps[bandSteps.length - 1].hi) - 4} fontSize="9.5" textAnchor="end"
                  fill="oklch(40% 0.12 155)" fontFamily="IBM Plex Mono, monospace" fontWeight="600"
                  style={{ letterSpacing: "0.04em" }}>
              TARGET
            </text>
          )}

          {/* y grid + labels */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={pad.l} x2={W - pad.r} y1={yScale(t)} y2={yScale(t)}
                    stroke="oklch(93% 0.008 198)" strokeWidth="1" />
              <text x={pad.l - 8} y={yScale(t) + 3.5} fontSize="10" textAnchor="end"
                    fill="var(--ink-3)" fontFamily="IBM Plex Mono, monospace">
                {metric.key === "weight" ? Math.round(t) : D_L.displayNum(t, 1)}
              </text>
            </g>
          ))}

          {/* x ticks */}
          {xTicks.map(t => (
            <g key={t}>
              <line x1={xScale(t)} x2={xScale(t)} y1={H - pad.b} y2={H - pad.b + 4} stroke="var(--ink-4)" />
              <text x={xScale(t)} y={H - pad.b + 16} fontSize="10" textAnchor="middle"
                    fill="var(--ink-3)" fontFamily="IBM Plex Mono, monospace">{t}</text>
            </g>
          ))}

          {/* axes */}
          <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--ink-3)" strokeWidth="1" />
          <line x1={pad.l} x2={pad.l} y1={pad.t} y2={H - pad.b} stroke="var(--ink-3)" strokeWidth="1" />

          {/* line only: the tinted area under it used to grey the white plot
              and muddy the target band (2026-09-23) */}
          {points.length > 0 && (
            <path d={linePath()} stroke={metric.color} strokeWidth="2" fill="none"
                  strokeLinecap="round" strokeLinejoin="round" />
          )}

          {/* data points */}
          {points.map((p, i) => (
            <circle key={i} cx={xScale(p.x)} cy={yScale(p.y)} r={hover?.x === p.x ? 5 : 3.5}
                    fill="#fff" stroke={metric.color} strokeWidth="2"
                    style={{ transition: "r 0.15s" }} />
          ))}

          {/* hover crosshair */}
          {hover && (
            <>
              <line x1={xScale(hover.x)} x2={xScale(hover.x)} y1={pad.t} y2={H - pad.b}
                    stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
              <circle cx={xScale(hover.x)} cy={yScale(hover.y)} r="6"
                      fill={metric.color} stroke="#fff" strokeWidth="2" />
            </>
          )}

          {/* x-axis label */}
          <text x={pad.l + (W - pad.l - pad.r) / 2} y={H - 6} fontSize="10.5"
                textAnchor="middle" fill="var(--ink-3)"
                style={{ letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600 }}>
            {xAxisLabel}
          </text>
        </svg>

        {/* hover tooltip */}
        {hover && (
          <div style={{
            position: "absolute",
            left: `${(xScale(hover.x) / W) * 100}%`,
            top: `${(yScale(hover.y) / H) * 100}%`,
            transform: `translate(${xScale(hover.x) > W * 0.7 ? "calc(-100% - 12px)" : "12px"}, -50%)`,
            background: "oklch(24% 0.022 205)",
            color: "#fff",
            padding: "8px 10px",
            borderRadius: 6,
            fontSize: 11,
            fontFamily: "IBM Plex Mono, monospace",
            lineHeight: 1.5,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            boxShadow: "0 6px 16px oklch(25% 0.02 205 / .26)",
            zIndex: 10,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>
              {n(hover.y, metric.key === "weight" ? 0 : 1)} <span style={{ opacity: 0.7, fontWeight: 400 }}>{metric.unit}</span>
            </div>
            <div style={{ opacity: 0.7, fontSize: 10 }}>
              DOL {hover.dol} · Day {hover.dayAdmit} admit
            </div>
            {/* That day's own target, so the point can be read against the
                band that applied when it was written. */}
            {hover.band && (
              <div style={{ opacity: 0.7, fontSize: 10 }}>
                target {n(hover.band[0], 1)}–{n(hover.band[1], 1)} {metric.unit}
              </div>
            )}
            <div style={{ opacity: 0.55, fontSize: 9.5 }}>{window.NEOFEED_FMT_DATE?.(hover.ts) || hover.ts}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// `nursing` is this infant's nursing I/O records, or null while the backend
// does not serve them (the card is then not shown at all — see NursingIOCard).
function DailyLog({ patient, log, dol, onAddToday, onEditEntry, onDeleteEntry, nursing = null, onSaveNursing, onDeleteNursing }) {
  const entries = log[patient?.sessionId] || [];
  // undefined = closed; null = a new record; an object = that record.
  const [nursingOpen, setNursingOpen] = React.useState(undefined);
  // The trend graph plots submitted orders only; a draft is listed in the
  // table below (to open and finish) but is not a data point (D.isDraftEntry).
  const finalLog = D_L.finalEntries(entries);
  const [showDateModal, setShowDateModal] = React.useState(false);

  const handleDelete = (e, entry) => {
    e.stopPropagation();
    const label = `DOL ${D_L.entryDol(patient, entry)} (${window.NEOFEED_FMT_DATE?.(entry.ts) || entry.ts})`;
    if (!window.confirm(`ลบบันทึก ${label} ใช่หรือไม่? การลบนี้ไม่สามารถย้อนกลับได้`)) return;
    onDeleteEntry(entry);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Daily nutritional log</h1>
        </div>
        {onAddToday && (
          <div>
            <button className="btn primary" onClick={() => setShowDateModal(true)}>
              <Icon name="plus" size={14} color="#fff" /> New log
            </button>
          </div>
        )}
      </div>

      {showDateModal && (
        <LogDateModal patient={patient} dol={dol}
          onClose={() => setShowDateModal(false)}
          onConfirm={(dateStr) => { setShowDateModal(false); onAddToday(dateStr); }} />
      )}

      {nursing && onSaveNursing && (
        <NursingIOCard patient={patient} records={nursing} onOpen={(rec) => setNursingOpen(rec)}
          onDelete={onDeleteNursing} />
      )}
      {nursingOpen !== undefined && (
        <NursingEntryModal patient={patient} record={nursingOpen} onClose={() => setNursingOpen(undefined)}
          onSubmit={onSaveNursing} />
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-h">
          <Icon name="chart" size={14} color="var(--brand)" />
          Trend graph
          <span className="h-meta">{finalLog.length} {finalLog.length === 1 ? "record" : "records"}</span>
        </div>
        <div className="card-b">
          <TrendGraph entries={finalLog} patient={patient} />
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <Icon name="log" size={14} color="var(--brand)" />
          All entries
          <span className="h-meta">{entries.length} records</span>
        </div>
        {entries.length === 0 ? (
          <div className="card-b" style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 13, padding: 24 }}>
            No log entries yet.
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>DOL</th>
                <th>Day admit</th>
                <th>Date</th>
                <th>Weight</th>
                <th>Fluid</th>
                <th>GIR</th>
                <th>Protein</th>
                <th>Energy</th>
                <th>Na / K</th>
                <th>Ca / P</th>
                <th>Route</th>
                <th>สถานะ</th>
                {onDeleteEntry && <th></th>}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const admitDol = patient?.weights?.[0]?.dol ?? entries[0]?.dol ?? 1;
                // Newest first by calendar date. Sorting on the stored `dol`
                // put rows out of order whenever that column was stale (the
                // same reason the DOL cell below is re-derived); `ts` is the
                // fact the row is actually filed under.
                return entries.slice()
                  .sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")))
                  .map((e, i) => {
                  // A row still under app.jsx's optimistic "tmp_" id (or
                  // "local_tmp_" with no backend) has not been confirmed by
                  // the server. Opening it gave a printable order with an id
                  // no Daily_Log row has (review 2026-09-17, UP-C9) — so it is
                  // shown, marked as saving, and not opened or deleted until
                  // the real entryId arrives. calculator.jsx has the same test.
                  const pending = /^(local_)?tmp_/.test(String(e.entryId || ""));
                  const editable = !!(onEditEntry && e.entryId) && !pending;
                  const eDol = D_L.entryDol(patient, e);
                  return (
                    <tr key={e.entryId || i}
                      onClick={editable ? () => onEditEntry(e) : undefined}
                      title={pending ? "กำลังบันทึก…" : editable ? (e.lastModifiedBy ? `แก้ไขล่าสุดโดย ${e.lastModifiedBy} — กดเพื่อแก้ไข` : "กดเพื่อแก้ไข") : "บันทึกเก่า — แก้ไขไม่ได้"}
                      style={{ cursor: editable ? "pointer" : "default" }}>
                      <td className="num" style={{ fontWeight: 600 }}>{eDol}</td>
                      <td className="num" style={{ color: "var(--ink-3)" }}>{eDol - admitDol}</td>
                      <td style={{ color: "var(--ink-3)", fontSize: 11.5 }}>{window.NEOFEED_FMT_DATE?.(e.ts) || e.ts}</td>
                      <td className="num">{e.weight || "—"} g</td>
                      <td className="num">{n(e.fluid, 0)} mL/kg</td>
                      <td className="num">{n(e.gir, 1)}</td>
                      <td className="num">{n(e.pro, 1)} g/kg</td>
                      <td className="num">{n(e.kcal, 0)} kcal/kg</td>
                      <td className="num">{n(e.na, 1)} / {n(e.k, 1)}</td>
                      <td className="num">{n(e.ca, 0)} / {n(e.p, 0)}</td>
                      <td style={{ color: "var(--ink-2)" }}>{e.route}</td>
                      <td>
                        {pending
                          ? <span className="chip"><span className="d" />กำลังบันทึก…</span>
                          : <span className={`chip${D_L.isDraftEntry(e) ? " warn" : " ok"}`}>
                              <span className="d" />{D_L.isDraftEntry(e) ? "Draft · ยังไม่ submit" : "Submitted"}
                            </span>}
                      </td>
                      {onDeleteEntry && (
                        <td onClick={e2 => e2.stopPropagation()}>
                          {e.entryId && !pending && (
                            <button className="icon-btn" title="ลบบันทึกนี้" onClick={ev => handleDelete(ev, e)}>
                              <Icon name="trash" size={14} color="var(--crit)" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// Choice shown when starting a new log entry — today, or back-dated to a
// past calendar date (so a missed day can still be logged).
function LogDateModal({ patient, dol, onClose, onConfirm }) {
  const today = D_L.todayLocal();   // local date, not UTC — before 07:00 ICT the UTC date is yesterday
  const [mode, setMode] = React.useState("today"); // "today" | "pick"
  const [date, setDate] = React.useState(today);
  const pickedDol = D_L.dolAtDate(patient, date);

  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker" style={{ width: 380 }} onClick={e => e.stopPropagation()}>
        <div className="picker-h" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>บันทึกข้อมูลโภชนาการ</div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { key: "today", label: `วันนี้ · DOL ${dol}` },
            { key: "pick", label: "เลือกวันที่ย้อนหลัง" },
          ].map(opt => (
            <label key={opt.key} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "14px 14px", fontSize: 14.5, cursor: "pointer",
              border: "1.5px solid " + (mode === opt.key ? "var(--brand)" : "var(--line)"),
              background: mode === opt.key ? "var(--brand-bg)" : "transparent",
              borderRadius: 10, transition: "border-color .15s ease, background .15s ease",
            }}>
              <input type="radio" name="logdate-mode" checked={mode === opt.key} onChange={() => setMode(opt.key)}
                style={{ width: 18, height: 18, flexShrink: 0 }} />
              {opt.label}
            </label>
          ))}
          {mode === "pick" && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <input type="date" className="inp" min={patient?.admissionDate || undefined} max={today} value={date}
                onChange={e => setDate(e.target.value)} style={{ flex: "1 1 160px", minHeight: 44 }} />
              <span className="chip brand" style={{ fontSize: 12 }}>DOL {pickedDol}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
            <button className="btn" onClick={onClose}>ยกเลิก</button>
            <button className="btn primary" onClick={() => onConfirm(mode === "pick" ? date : today)}>
              <Icon name="plus" size={14} color="#fff" /> ดำเนินการต่อ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Nursing Intake/Output — the ward's daily totals (UX roadmap #4)
// ============================================================
// docs/NURSING_FORM_SPEC.md, built to Pp's decisions of 2026-09-24. ONE record
// per infant per date (D1: daily totals only), dated the morning the 24-hour
// total closed — so the order written that morning can take it with one tap
// (D4: the prescriber types Intake/Output; nothing fills itself).
// The chart stays the record of care; this is the nutrition worksheet. Shown
// only once the backend serves nursing records (App passes `nursing` = null
// until then), which is also when nurses stop saving orders (D5).
//
// What the ward can pick as the feed: the formulary's own keys plus "several".
// Never free text — the backend refuses anything that is not a key (PDPA
// minimisation: nothing in Nursing_Log can hold a name or a note).
const NURSING_FEED_OPTIONS = [...Object.entries(D_L.EN_DB).map(([k, v]) => [k, v.label]), ["MIXED", "หลายชนิด"]];
const nursingFeedLabel = (k) => k === "MIXED" ? "หลายชนิด" : (D_L.EN_DB[k]?.label || k || "");
const NURSING_ML_FIELDS = [
  ["ivInMl", "IV เข้า"], ["enInMl", "นม/EN เข้า"], ["urineMl", "ปัสสาวะ"], ["drainMl", "Drain"],
];
const whoOf = (email) => String(email || "").split("@")[0];
// Sums of typed decimals, to 0.1 mL — never "99.60000000000001".
const ml1 = (x) => Math.round(x * 10) / 10;
// Out = urine + drain, and only when BOTH were recorded: a blank drain is not
// "no drain" (blank ≠ 0 — the form asks for 0 when there is none).
const nursingOutMl = (r) => (r?.urineMl == null || r?.drainMl == null) ? null : ml1(Number(r.urineMl) + Number(r.drainMl));

// Urine in mL/kg/h against the same divisor the Calculator's Intake/Output card
// uses for the order of that date (D.ioDivisorG — the previous day's weight,
// floored at birth weight). Null when either is missing.
function urineRate(patient, rec) {
  if (rec?.urineMl == null) return null;
  const { g } = D_L.ioDivisorG(patient, D_L.dolAtDate(patient, rec.ts), null);
  return g ? rec.urineMl / (g / 1000) / 24 : null;
}

// A box where EMPTY means "not recorded" — which is not 0. The form keeps the
// raw text; parsing happens once, on submit and for the live totals.
function NurseNum({ name, label, unit, value, onChange, integer = false, hint }) {
  return (
    <div className="field">
      <label htmlFor={`nio-${name}`}>{label}{unit && <span className="unit">({unit})</span>}</label>
      <input id={`nio-${name}`} name={name} type="text" inputMode={integer ? "numeric" : "decimal"}
        className="inp num" placeholder="—" value={value}
        onChange={e => {
          // Digits and one point, integer or not: a count typed as "1.5" must
          // be refused below, never silently rewritten to 15.
          let s = e.target.value.replace(/[^0-9.]/g, "");
          const dot = s.indexOf(".");
          if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
          onChange(s);
        }} />
      {hint && <div className="field-hint" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function NursingEntryModal({ patient, record, onClose, onSubmit }) {
  const today = D_L.todayLocal();
  const editing = !!record;
  const [date, setDate] = React.useState(record ? record.ts : today);
  const dol = D_L.dolAtDate(patient, date);
  const measuredAt = (d) => (patient?.weights || []).find(w => w && w.dol === D_L.dolAtDate(patient, d) && w.w != null) || null;
  const str = (v) => v == null ? "" : String(v);
  const [f, setF] = React.useState(() => ({
    weightG: str(measuredAt(record ? record.ts : today)?.w),
    ivInMl: str(record?.ivInMl), enInMl: str(record?.enInMl), feedType: record?.feedType || "",
    urineMl: str(record?.urineMl), drainMl: str(record?.drainMl), stoolCount: str(record?.stoolCount),
  }));
  const [weightTouched, setWeightTouched] = React.useState(false);
  const set = (k) => (v) => setF(prev => ({ ...prev, [k]: v }));
  // A tap outside the sheet closes it only while nothing has been typed — on a
  // phone the backdrop is the strip above a bottom sheet, one stray tap away
  // from losing a whole day's figures. Cancel and ✕ always close.
  const [opened] = React.useState(() => JSON.stringify({ date, f }));
  const pristine = JSON.stringify({ date, f }) === opened;
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  // A new record's weight follows the date until someone types one.
  const pickDate = (d) => {
    setDate(d);
    if (!weightTouched) setF(prev => ({ ...prev, weightG: str(measuredAt(d)?.w) }));
  };

  const num = (s) => (s === "" || s == null) ? null : Number(s);
  const vals = { ivInMl: num(f.ivInMl), enInMl: num(f.enInMl), urineMl: num(f.urineMl),
    drainMl: num(f.drainMl), stoolCount: num(f.stoolCount) };
  const weight = num(f.weightG);
  const anyIO = Object.values(vals).some(v => v != null);
  const measured = measuredAt(date);
  const weightChanged = weight != null && weight !== (measured?.w ?? null);
  const problems = [];
  NURSING_ML_FIELDS.forEach(([k, lbl]) => {
    if (vals[k] != null && !(vals[k] >= 0 && vals[k] <= 3000)) problems.push(`${lbl} ต้องอยู่ระหว่าง 0–3000 mL`);
  });
  if (vals.stoolCount != null && !(Number.isInteger(vals.stoolCount) && vals.stoolCount <= 20)) problems.push("อุจจาระเป็นจำนวนเต็ม 0–20 ครั้ง");
  if (weight != null && !(weight >= 200 && weight <= 8000)) problems.push("น้ำหนัก 200–8000 g");
  if (!date || date > today) problems.push("วันที่ต้องไม่เกินวันนี้");
  const admitted = D_L.normalizeDateStr(patient?.admissionDate || "");
  if (!editing && date && admitted && date < admitted) problems.push("วันที่ต้องไม่ก่อนวันรับเข้า");
  if (editing && !anyIO) problems.push("บันทึกต้องมีอย่างน้อยหนึ่งค่า — การลบทั้งรายการทำได้โดย admin");
  if (!editing && !anyIO && !weightChanged) problems.push("ยังไม่ได้กรอกค่าใดเลย");

  const intake = D_L.nursingIntakeMl(vals);
  const out = nursingOutMl(vals);
  const rate = urineRate(patient, { ts: date, urineMl: vals.urineMl });

  const submit = () => {
    if (busy || problems.length) return;
    setError("");
    setBusy(true);
    Promise.resolve(onSubmit({
      date, dol,
      entry: anyIO ? { ts: date, ...vals, feedType: f.feedType, appVersion: D_L.appVersion() } : null,
      weightG: weightChanged ? weight : null,
      record: record || null,
    })).then(res => {
      setBusy(false);
      if (res && res.ok === false) { setError(res.error || "บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง"); return; }
      onClose();
    }, (e) => { setBusy(false); setError((e && e.message) || "บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง"); });
  };

  return (
    <div className="picker-backdrop" onClick={() => { if (pristine && !busy) onClose(); }}>
      <div className="picker nursing-modal" role="dialog" aria-modal="true" aria-label={editing ? "แก้ไข I/O ประจำวัน" : "บันทึก I/O ประจำวัน"}
        style={{ width: 460 }} onClick={e => e.stopPropagation()}>
        <div className="picker-h" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>
            {editing ? "แก้ไข I/O ประจำวัน" : "บันทึก I/O ประจำวัน"} · {patient?.name || patient?.initials || "—"}
            <span style={{ fontWeight: 400, color: "var(--ink-3)" }}> · {patient?.currentBed || "—"}</span>
          </div>
          {/* Not while a save is in flight: the save answers into this form
              (its writes are quiet), so closing it would hide a refusal. */}
          <button className="icon-btn" onClick={onClose} aria-label="ปิด" disabled={busy}><Icon name="x" size={14} /></button>
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="field">
            <label htmlFor="nio-date">ยอด 24 ชม. ที่ปิดยอดเช้าวันที่</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <input id="nio-date" type="date" className="inp" value={date} disabled={editing}
                min={admitted || undefined} max={today}
                onChange={e => pickDate(e.target.value)} style={{ flex: "1 1 160px", minHeight: 44 }} />
              <span className="chip brand" style={{ fontSize: 12 }}>DOL {dol}</span>
            </div>
            <div className="field-hint" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
              ใบสั่งของวันที่ {window.NEOFEED_FMT_DATE?.(date) || date} กดใช้ยอดนี้ได้ที่ Intake/Output ใน Calculator
            </div>
          </div>
          <div className="nio-grid">
            <NurseNum name="weightG" label="น้ำหนักเช้านี้" unit="g" value={f.weightG}
              onChange={(v) => { setWeightTouched(true); set("weightG")(v); }}
              hint={measured ? `บันทึกไว้แล้ว ${measured.w} g — แก้ได้` : "ไม่บังคับ · เข้ากราฟการเจริญเติบโต"} />
            <NurseNum name="ivInMl" label="IV เข้า" unit="mL/24 ชม." value={f.ivInMl} onChange={set("ivInMl")} />
            <NurseNum name="enInMl" label="นม/EN เข้า" unit="mL/24 ชม." value={f.enInMl} onChange={set("enInMl")} />
            <div className="field">
              <label htmlFor="nio-feed">ชนิดนม</label>
              <select id="nio-feed" className="sel" value={f.feedType} onChange={e => set("feedType")(e.target.value)} style={{ minHeight: 44 }}>
                <option value="">— ไม่ระบุ —</option>
                {NURSING_FEED_OPTIONS.map(([k, lbl]) => <option key={k} value={k}>{lbl}</option>)}
              </select>
            </div>
            <NurseNum name="urineMl" label="ปัสสาวะ" unit="mL/24 ชม." value={f.urineMl} onChange={set("urineMl")}
              hint={rate != null ? `${D_L.displayNum(rate, 1)} mL/kg/h` : null} />
            <NurseNum name="drainMl" label="Drain" unit="mL/24 ชม." value={f.drainMl} onChange={set("drainMl")} />
            <NurseNum name="stoolCount" label="อุจจาระ" unit="ครั้ง" value={f.stoolCount} onChange={set("stoolCount")} integer />
          </div>
          <div className="nio-sum" aria-live="polite">
            เข้า <span className="num">{intake ?? "—"}</span> mL · ออก <span className="num">{out ?? "—"}</span> mL
            {intake != null && out != null && <> · Balance <span className="num">{intake - out >= 0 ? "+" : ""}{ml1(intake - out)}</span> mL</>}
            {(intake == null || out == null) && (vals.ivInMl != null || vals.enInMl != null || vals.urineMl != null || vals.drainMl != null) &&
              <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>ยอดรวมต้องมีทั้งสองช่อง — ไม่ได้ให้/ไม่มี ใส่ 0</div>}
          </div>
          <div className="nio-note">
            ช่องที่เว้นว่าง = ไม่ได้บันทึก (ไม่ใช่ 0) · ข้อมูลนี้ใช้คำนวณโภชนาการ แฟ้มผู้ป่วยยังเป็นบันทึกหลัก
          </div>
          {problems.length > 0 && (
            <div className="nio-problems" role="alert" style={{ fontSize: 12, color: "var(--crit-ink)", lineHeight: 1.5 }}>
              {problems.join(" · ")}
            </div>
          )}
          {error && <div role="alert" style={{ fontSize: 12.5, color: "var(--crit-ink)", fontWeight: 600 }}>{error}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn" onClick={onClose} disabled={busy}>ยกเลิก</button>
            <button className="btn primary" disabled={busy || problems.length > 0} onClick={submit}>
              <Icon name="save" size={14} color="#fff" /> {busy ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// The Dashboard card: today's state first (the round's question is "is it in
// yet?"), then the last seven days newest first, each opening its record.
function NursingIOCard({ patient, records, onOpen, onDelete }) {
  const today = D_L.todayLocal();
  const todays = D_L.nursingRecordOn(records, today);
  const shown = records.slice(0, 7);
  const v = (x) => x == null ? "—" : x;
  return (
    <div className="card nursing-io" style={{ marginBottom: 14 }}>
      <div className="card-h">
        <Icon name="drop" size={14} color="var(--brand)" />
        I/O ประจำวัน (พยาบาล)
        <span className="h-meta">ยอด 24 ชม. · {records.length} วัน</span>
      </div>
      <div className="card-b">
        <div className="nio-head">
          <span className={"log-badge" + (todays ? " is-logged" : "")}>{todays ? "✓ วันนี้บันทึกแล้ว" : "วันนี้ยังไม่ได้บันทึก"}</span>
          <button className="btn primary nio-add" onClick={() => onOpen(todays || null)}>
            <Icon name={todays ? "log" : "plus"} size={14} color="#fff" /> {todays ? "แก้ไข I/O วันนี้" : "บันทึก I/O"}
          </button>
        </div>
        {shown.length === 0
          ? <div className="nio-empty">ยังไม่มีบันทึก I/O — กด “บันทึก I/O” (เลือกวันที่ย้อนหลังได้)</div>
          : <div className="nio-list">
              {shown.map(r => {
                const intake = D_L.nursingIntakeMl(r);
                const rate = urineRate(patient, r);
                const out = nursingOutMl(r);
                const bal = intake != null && out != null ? ml1(intake - out) : null;
                // Only one half of the intake recorded: show the halves, never
                // a "total" that silently counts the blank one as 0.
                const inText = intake != null ? String(intake)
                  : (r.ivInMl != null || r.enInMl != null) ? `— (IV ${v(r.ivInMl)} · นม/EN ${v(r.enInMl)})` : "—";
                return (
                  <div key={r.entryId || r.ts} className="nio-row" role="button" tabIndex={0}
                    onClick={() => onOpen(r)}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(r); } }}>
                    <div className="nio-date">
                      <strong>{window.NEOFEED_FMT_DATE?.(r.ts) || r.ts}</strong>
                      <span className="nio-dol">DOL {D_L.dolAtDate(patient, r.ts)}</span>
                    </div>
                    <div className="nio-vals num">
                      <span>เข้า {inText}{r.enInMl != null && r.feedType ? ` (${nursingFeedLabel(r.feedType)})` : ""}</span>
                      <span>ปัสสาวะ {v(r.urineMl)}{rate != null ? ` · ${D_L.displayNum(rate, 1)} mL/kg/h` : ""}</span>
                      <span>Drain {v(r.drainMl)}</span>
                      <span>Bal {bal == null ? "—" : `${bal >= 0 ? "+" : ""}${bal}`}</span>
                      <span>อุจจาระ {v(r.stoolCount)}</span>
                    </div>
                    <div className="nio-who">
                      {whoOf(r.lastModifiedBy || r.enteredBy)}
                      {onDelete && r.entryId && !String(r.entryId).startsWith("tmp_") && (
                        <button className="btn sm nio-del" aria-label={`ลบ I/O ${r.ts}`}
                          onClick={e => {
                            e.stopPropagation();
                            if (window.confirm(`ลบบันทึก I/O วันที่ ${window.NEOFEED_FMT_DATE?.(r.ts) || r.ts} ใช่หรือไม่? การลบนี้ไม่สามารถย้อนกลับได้`)) onDelete(r);
                          }}>
                          <Icon name="trash" size={12} color="var(--crit)" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>}
        {records.length > shown.length &&
          <div className="nio-more">แสดง 7 วันล่าสุด จาก {records.length} วัน</div>}
      </div>
    </div>
  );
}

window.DailyLog = DailyLog;
window.TrendGraph = TrendGraph;
window.NursingIOCard = NursingIOCard;
window.NursingEntryModal = NursingEntryModal;
