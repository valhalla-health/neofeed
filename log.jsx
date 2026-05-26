// ============================================================
// Daily log + trends view
// ============================================================
const D_L = window.NEOFEED_DATA;

// Safe number formatter — handles strings / null from GAS
const n = (v, d = 1) => {
  const x = parseFloat(v);
  return isFinite(x) ? x.toFixed(d) : "—";
};

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
  const dol = entry.dol || 1;
  const wt  = entry.weight || patient?.bw || 1000;
  if (isEN) {
    if (metricKey === "kcal")  return D_L.ENTERAL_TARGETS.kcal();
    if (metricKey === "pro")   return D_L.ENTERAL_TARGETS.protein();
    if (metricKey === "gir")   return null; // GIR n/a when fully enteral
    if (metricKey === "fluid") return D_L.TARGETS.fluid(dol, wt);
    if (metricKey === "na")    return D_L.ENTERAL_TARGETS.na();
    if (metricKey === "k")     return D_L.ENTERAL_TARGETS.k();
    if (metricKey === "ca")    return D_L.ENTERAL_TARGETS.ca();
    if (metricKey === "p")     return D_L.ENTERAL_TARGETS.p();
  } else {
    if (metricKey === "kcal")  return D_L.TPN_TARGETS.kcal(dol);
    if (metricKey === "pro")   return D_L.TPN_TARGETS.protein(dol);
    if (metricKey === "gir")   return [8, 10];
    if (metricKey === "fluid") return D_L.TARGETS.fluid(dol, wt);
    if (metricKey === "na")    return D_L.TPN_TARGETS.na(dol);
    if (metricKey === "k")     return D_L.TPN_TARGETS.k(dol);
    if (metricKey === "ca")    return D_L.TPN_TARGETS.ca(dol);
    if (metricKey === "p")     return D_L.TPN_TARGETS.p(dol);
  }
  return null;
}

const METRICS = [
  { key: "kcal",   label: "Energy",    unit: "kcal/kg/d", color: "oklch(46% 0.085 215)", yMax: 160, ticks: [0, 30, 60, 90, 120, 150] },
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

  // map entries → {x, y, raw}
  const points = React.useMemo(() => entries
    .filter(e => e[metricKey] != null && isFinite(parseFloat(e[metricKey])))
    .map(e => ({
      x: xMode === "dayAdmit" ? (e.dol - admitDol) : e.dol,
      y: parseFloat(e[metricKey]),
      dol: e.dol,
      dayAdmit: e.dol - admitDol,
      ts: e.ts,
      raw: e,
    }))
    .sort((a, b) => a.x - b.x), [entries, metricKey, xMode, admitDol]);

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

  // area fill under line
  const areaPath = () => {
    const lp = linePath();
    if (!lp || points.length === 0) return "";
    const lastX = xScale(points[points.length - 1].x);
    const firstX = xScale(points[0].x);
    const baseY = H - pad.b;
    return `${lp} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
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
  // Dynamic target band based on latest entry's regime (PN vs EN ≥ 100 mL/kg)
  const targetBand = latest ? pickTarget(metricKey, latest.raw, patient) : null;
  const isENMode = latest && (latest.raw.enVolPerKg || 0) >= 100;
  let status = "empty";
  if (latest && targetBand) {
    const [lo, hi] = targetBand;
    if (latest.y >= lo && latest.y <= hi) status = "ok";
    else if (latest.y < lo * 0.7 || latest.y > hi * 1.3) status = "crit";
    else status = "warn";
  }
  const statusColor = status === "ok" ? "var(--ok)" : status === "warn" ? "var(--warn)" : status === "crit" ? "var(--crit)" : "var(--ink-3)";

  const xAxisLabel = xMode === "dayAdmit" ? "Day of admission" : "Day of life (DOL)";

  // gradient id (per metric, avoids collisions)
  const gradId = `grad-${metricKey}`;

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
                  background: isENMode ? "oklch(94% 0.05 155)" : "oklch(94% 0.04 215)",
                  color: isENMode ? "oklch(40% 0.13 155)" : "oklch(40% 0.13 215)",
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
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={metric.color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={metric.color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* plot area background */}
          <rect x={pad.l} y={pad.t} width={W - pad.l - pad.r} height={H - pad.t - pad.b} fill="oklch(99.5% 0.002 230)" />

          {/* target zone */}
          {targetBand && (
            <>
              <rect
                x={pad.l}
                y={yScale(targetBand[1])}
                width={W - pad.l - pad.r}
                height={yScale(targetBand[0]) - yScale(targetBand[1])}
                fill="oklch(52% 0.12 155 / .09)"
              />
              <line x1={pad.l} x2={W - pad.r} y1={yScale(targetBand[0])} y2={yScale(targetBand[0])}
                    stroke="oklch(52% 0.12 155 / .35)" strokeWidth="1" strokeDasharray="3 3" />
              <line x1={pad.l} x2={W - pad.r} y1={yScale(targetBand[1])} y2={yScale(targetBand[1])}
                    stroke="oklch(52% 0.12 155 / .35)" strokeWidth="1" strokeDasharray="3 3" />
              <text x={W - pad.r - 4} y={yScale(targetBand[1]) - 4} fontSize="9.5" textAnchor="end"
                    fill="oklch(40% 0.12 155)" fontFamily="IBM Plex Mono, monospace" fontWeight="600"
                    style={{ letterSpacing: "0.04em" }}>
                TARGET
              </text>
            </>
          )}

          {/* y grid + labels */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={pad.l} x2={W - pad.r} y1={yScale(t)} y2={yScale(t)}
                    stroke="oklch(93% 0.005 230)" strokeWidth="1" />
              <text x={pad.l - 8} y={yScale(t) + 3.5} fontSize="10" textAnchor="end"
                    fill="var(--ink-3)" fontFamily="IBM Plex Mono, monospace">
                {metric.key === "weight" ? Math.round(t) : (t % 1 === 0 ? t : t.toFixed(1))}
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

          {/* area + line */}
          {points.length > 0 && <path d={areaPath()} fill={`url(#${gradId})`} />}
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
            background: "oklch(22% 0.015 250)",
            color: "#fff",
            padding: "8px 10px",
            borderRadius: 6,
            fontSize: 11,
            fontFamily: "IBM Plex Mono, monospace",
            lineHeight: 1.5,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            boxShadow: "0 4px 12px oklch(20% 0.01 230 / .25)",
            zIndex: 10,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>
              {n(hover.y, metric.key === "weight" ? 0 : 1)} <span style={{ opacity: 0.7, fontWeight: 400 }}>{metric.unit}</span>
            </div>
            <div style={{ opacity: 0.7, fontSize: 10 }}>
              DOL {hover.dol} · Day {hover.dayAdmit} admit
            </div>
            <div style={{ opacity: 0.55, fontSize: 9.5 }}>{window.NEOFEED_FMT_DATE?.(hover.ts) || hover.ts}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function DailyLog({ patient, log }) {
  const entries = log[patient?.sessionId] || [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Daily nutritional log</h1>
          <div className="sub">Track delivery vs ESPGHAN targets — pick a metric, toggle x-axis between DOL and day-of-admission.</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-h">
          <Icon name="chart" size={14} color="var(--brand)" />
          Trend graph
          <span className="h-meta">{entries.length} {entries.length === 1 ? "record" : "records"}</span>
        </div>
        <div className="card-b">
          <TrendGraph entries={entries} patient={patient} />
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
              </tr>
            </thead>
            <tbody>
              {(() => {
                const admitDol = patient?.weights?.[0]?.dol ?? entries[0]?.dol ?? 1;
                return entries.slice().reverse().map((e, i) => (
                  <tr key={i}>
                    <td className="num" style={{ fontWeight: 600 }}>{e.dol}</td>
                    <td className="num" style={{ color: "var(--ink-3)" }}>{e.dol - admitDol}</td>
                    <td style={{ color: "var(--ink-3)", fontSize: 11.5 }}>{window.NEOFEED_FMT_DATE?.(e.ts) || e.ts}</td>
                    <td className="num">{e.weight || "—"} g</td>
                    <td className="num">{n(e.fluid, 0)} mL/kg</td>
                    <td className="num">{n(e.gir, 1)}</td>
                    <td className="num">{n(e.pro, 1)} g/kg</td>
                    <td className="num">{n(e.kcal, 0)} kcal/kg</td>
                    <td className="num">{n(e.na, 1)} / {n(e.k, 1)}</td>
                    <td className="num">{n(e.ca, 0)} / {n(e.p, 0)}</td>
                    <td style={{ color: "var(--ink-2)" }}>{e.route}</td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

window.DailyLog = DailyLog;
window.TrendGraph = TrendGraph;
