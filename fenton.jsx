// ============================================================
// Fenton 2025 Growth Chart — third-generation preterm growth
// Fenton TR, Elmrayed S, Alshaikh BN. PMID: 40534585
// ============================================================
const D_F = window.NEOFEED_DATA;

function Segmented({ value, onChange, options }) {
  return (
    <div className="seg">
      {options.map(o =>
        <button key={o.value} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>
      )}
    </div>
  );
}

function FentonChart({ patient, currentDol, onUpdate }) {
  const sex = patient?.sex || "boys";
  const [metric, setMetric] = React.useState("weight"); // weight | length | hc
  const [view, setView] = React.useState(null); // {x,y,w,h} viewBox override
  const dragRef = React.useRef(null);

  // The SVG is drawn in a fixed 760-wide coordinate space, then scaled to fit
  // its container via `width: 100%`. On a phone the container is often under
  // half that wide, so a "font-size 11" label shrinks to ~5 on-screen px —
  // unreadable. Track the actual rendered width so text (and anything sized
  // to sit next to it) can be inflated in coordinate-space to counteract the
  // shrink and land back at its intended on-screen size.
  const svgWrapRef = React.useRef(null);
  const [renderedWidth, setRenderedWidth] = React.useState(760);
  React.useEffect(() => {
    const el = svgWrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width;
      if (w) setRenderedWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dataset =
    metric === "weight" ? D_F.FENTON_WEIGHT[sex]
  : metric === "length" ? D_F.FENTON_LENGTH[sex]
  : D_F.FENTON_HC[sex];

  const yLabel =
    metric === "weight" ? "Weight (g)"
  : metric === "length" ? "Length (cm)"
  : "Head Circumference (cm)";

  // domain
  const xMin = 22, xMax = 50;
  const yVals = dataset.flatMap(r => r.slice(1));
  const yMin = 0;
  const yMax = Math.max(...yVals) * 1.05;

  // chart geometry
  const W = 760, H = 460;
  // scale <1 once the rendered SVG is narrower than its 760 design width;
  // px() inflates a coordinate-space size so it still renders at its intended
  // on-screen size (capped at 1 so desktop, which never shrinks, is untouched).
  const chartScale = Math.min(1, Math.max(renderedWidth / W, 0.35));
  const px = (v) => v / chartScale;
  // r has extra room (vs. the plot's own tick marks) to fit the percentile
  // labels ("97th" etc.) sitting just past the right edge — see
  // percentileLabelYs below. Too tight here clips those labels on phones.
  const pad = { l: px(64), r: px(42), t: px(24), b: px(44) };

  const xScale = x => pad.l + ((x - xMin) / (xMax - xMin)) * (W - pad.l - pad.r);
  const yScale = y => H - pad.b - ((y - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);

  // build curves
  const PERCENTILES = [
    { idx: 1, label: "3rd",  color: "oklch(72% 0.06 250)", w: 1.2, dash: "4 3" },
    { idx: 2, label: "10th", color: "oklch(62% 0.08 250)", w: 1.4, dash: "" },
    { idx: 3, label: "50th", color: "oklch(46% 0.085 215)", w: 2.0, dash: "" },
    { idx: 4, label: "90th", color: "oklch(62% 0.08 250)", w: 1.4, dash: "" },
    { idx: 5, label: "97th", color: "oklch(72% 0.06 250)", w: 1.2, dash: "4 3" },
  ];

  // Proper Catmull-Rom → cubic Bezier (tension 0.5) for smooth monotonic curves
  const curvePath = (idx) => {
    const pts = dataset.map(r => [xScale(r[0]), yScale(r[idx])]);
    if (pts.length === 0) return "";
    if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]}`;
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
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  };

  // band fill (between 10th and 90th)
  const bandPath = () => {
    // smooth top edge (90th) + smooth bottom edge (10th) joined
    const top = curvePath(4);
    // reverse path for 10th — build with reversed points
    const pts = dataset.slice().reverse().map(r => [xScale(r[0]), yScale(r[2])]);
    if (!pts.length || !top) return "";
    let bottom = `L ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      bottom += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
    }
    return `${top} ${bottom} Z`;
  };

  // X tick weeks
  const xTicks = [22, 26, 30, 34, 38, 42, 46, 50];

  // Y ticks - auto by data
  const yTicks = [];
  const niceStep = metric === "weight" ? 1000 : metric === "length" ? 10 : 5;
  for (let v = 0; v <= yMax; v += niceStep) yTicks.push(v);

  // Patient plot
  // Weight uses patient.weights[].w
  // Length/HC: data lives in patient.lengths[]/patient.hcs[] (separate arrays),
  //   OR inline as w.l/w.hc on weights entries (saved by MeasurementLogger) — merge both.
  // True decimal-week PMA at birth (for x-axis plotting); ga is WW.D shorthand
  const pma0 = D_F.gaToDecimalWeeks(patient?.ga || 28);
  const points = (() => {
    if (metric === "weight") {
      return (patient?.weights || []).map(w => ({
        pma: pma0 + (w.dol - 1) / 7, value: w.w, dol: w.dol,
      }));
    }
    const standalone = (metric === "length" ? (patient?.lengths || []) : (patient?.hcs || []))
      .map(e => ({ dol: e.dol, value: e.v }));
    const inline = (patient?.weights || [])
      .filter(w => (metric === "length" ? w.l : w.hc) != null)
      .map(w => ({ dol: w.dol, value: metric === "length" ? w.l : w.hc }));
    const byDol = new Map(standalone.map(e => [e.dol, e.value]));
    inline.forEach(e => byDol.set(e.dol, e.value)); // inline (fresher) wins
    return [...byDol.entries()]
      .map(([dol, value]) => ({ pma: pma0 + (dol - 1) / 7, value, dol }))
      .sort((a, b) => a.dol - b.dol);
  })().filter(p => p.pma >= xMin && p.pma <= xMax && p.value != null);

  // current percentile estimate
  const currentPercentile = (() => {
    if (points.length === 0) return null;
    const last = points[points.length - 1];
    // find dataset row by linear interp
    const t = last.pma;
    const lo = dataset.find((r, i) => dataset[i+1] && r[0] <= t && dataset[i+1][0] >= t);
    if (!lo) return null;
    const hi = dataset[dataset.indexOf(lo) + 1];
    const f = (t - lo[0]) / (hi[0] - lo[0]);
    const refs = [3, 10, 50, 90, 97];
    const vals = [1,2,3,4,5].map(i => lo[i] + f * (hi[i] - lo[i]));
    // interpolate percentile
    if (last.value < vals[0]) return "<3rd";
    if (last.value >= vals[4]) return ">97th";
    for (let i = 0; i < 4; i++) {
      if (last.value >= vals[i] && last.value < vals[i+1]) {
        const ff = (last.value - vals[i]) / (vals[i+1] - vals[i]);
        const p = refs[i] + ff * (refs[i+1] - refs[i]);
        return `~${p.toFixed(0)}th`;
      }
    }
    return null;
  })();

  // Right-edge percentile labels can sit closer together than the (now larger,
  // see px() above) label text is tall where curves converge — e.g. 10th/3rd
  // at late PMA. PERCENTILES is already ordered bottom (3rd) to top (97th), so
  // walk it once nudging each label up just enough to clear the one below it.
  const percentileLabelYs = (() => {
    const minGap = px(12);
    const ys = PERCENTILES.map(p => yScale(dataset[dataset.length - 1][p.idx]) + px(4));
    for (let i = 1; i < ys.length; i++) {
      if (ys[i - 1] - ys[i] < minGap) ys[i] = ys[i - 1] - minGap;
    }
    // If the whole stack got nudged above the plot's top edge (curves all
    // converge near term), shift it back down as a group so "97th" never
    // climbs into the axis title above the chart.
    const minY = pad.t + px(10);
    const topY = ys[ys.length - 1];
    if (topY < minY) {
      const shift = minY - topY;
      for (let i = 0; i < ys.length; i++) ys[i] += shift;
    }
    return ys;
  })();

  return (
    <div className="card">
      <div className="card-h fenton-card-h">
        <Icon name="chart" size={14} color="var(--brand)" />
        Fenton 2025 growth chart · <span className="mono">{sex === "boys" ? "Male" : "Female"}</span>
        <span className="h-meta fenton-ctrl" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Segmented value={metric} onChange={setMetric} options={[
            { value: "weight", label: "Weight" },
            { value: "length", label: "Length" },
            { value: "hc",     label: "HC" },
          ]} />
        </span>
      </div>
      <div className="card-b">
        <div className="fenton-grid" style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 18 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginBottom: 6 }}>
              <button className="btn sm" onClick={() => {
                const v = view || { x: 0, y: 0, w: W, h: H };
                const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
                const nw = v.w * 0.75, nh = v.h * 0.75;
                setView({ x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh });
              }} title="Zoom in">＋</button>
              <button className="btn sm" onClick={() => {
                const v = view || { x: 0, y: 0, w: W, h: H };
                const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
                const nw = Math.min(W, v.w / 0.75), nh = Math.min(H, v.h / 0.75);
                setView({ x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh });
              }} title="Zoom out">−</button>
              <button className="btn sm" onClick={() => setView(null)} title="Fit view">⤢ Fit</button>
            </div>
            <svg
              ref={svgWrapRef}
              viewBox={view ? `${view.x} ${view.y} ${view.w} ${view.h}` : `0 0 ${W} ${H}`}
              style={{ width: "100%", height: "auto", maxWidth: 760, cursor: dragRef.current ? "grabbing" : "grab", userSelect: "none", touchAction: "none", border: "1px solid var(--line)", borderRadius: 6 }}
              onWheel={(e) => {
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                const fx = (e.clientX - rect.left) / rect.width;
                const fy = (e.clientY - rect.top) / rect.height;
                const v = view || { x: 0, y: 0, w: W, h: H };
                const factor = e.deltaY < 0 ? 0.85 : 1.18;
                const nw = Math.min(W * 1.5, Math.max(60, v.w * factor));
                const nh = Math.min(H * 1.5, Math.max(40, v.h * factor));
                const pointX = v.x + v.w * fx;
                const pointY = v.y + v.h * fy;
                setView({ x: pointX - nw * fx, y: pointY - nh * fy, w: nw, h: nh });
              }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                const v = view || { x: 0, y: 0, w: W, h: H };
                const rect = e.currentTarget.getBoundingClientRect();
                dragRef.current = { sx: e.clientX, sy: e.clientY, v, scaleX: v.w / rect.width, scaleY: v.h / rect.height };
              }}
              onPointerMove={(e) => {
                if (!dragRef.current) return;
                const d = dragRef.current;
                const dx = (e.clientX - d.sx) * d.scaleX;
                const dy = (e.clientY - d.sy) * d.scaleY;
                setView({ x: d.v.x - dx, y: d.v.y - dy, w: d.v.w, h: d.v.h });
              }}
              onPointerUp={(e) => { dragRef.current = null; e.currentTarget.releasePointerCapture(e.pointerId); }}
            >
              {/* background grid */}
              <rect x={pad.l} y={pad.t} width={W - pad.l - pad.r} height={H - pad.t - pad.b} fill="oklch(99.5% 0.002 230)" />
              {yTicks.map(t => (
                <line key={`y${t}`} x1={pad.l} x2={W - pad.r} y1={yScale(t)} y2={yScale(t)} stroke="oklch(94% 0.005 230)" />
              ))}
              {xTicks.map(t => (
                <line key={`x${t}`} y1={pad.t} y2={H - pad.b} x1={xScale(t)} x2={xScale(t)} stroke="oklch(94% 0.005 230)" />
              ))}
              {/* 10th-90th band */}
              <path d={bandPath()} fill="oklch(50% 0.1 215 / .07)" />

              {/* percentile curves */}
              {PERCENTILES.map(p => (
                <path key={p.label} d={curvePath(p.idx)} stroke={p.color} strokeWidth={p.w} fill="none" strokeDasharray={p.dash} />
              ))}

              {/* axes */}
              <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--ink-3)" />
              <line x1={pad.l} x2={pad.l} y1={pad.t} y2={H - pad.b} stroke="var(--ink-3)" />

              {/* x labels */}
              {xTicks.map(t => (
                <text key={`xl${t}`} x={xScale(t)} y={H - pad.b + px(16)} fontSize={px(11)} textAnchor="middle" fill="var(--ink-3)" fontFamily="IBM Plex Mono, monospace">{t}</text>
              ))}
              <text x={(W - pad.r + pad.l) / 2} y={H - px(8)} fontSize={px(11)} textAnchor="middle" fill="var(--ink-3)">Post-menstrual age (weeks)</text>

              {/* y labels */}
              {yTicks.map(t => (
                <text key={`yl${t}`} x={pad.l - px(8)} y={yScale(t) + px(3)} fontSize={px(11)} textAnchor="end" fill="var(--ink-3)" fontFamily="IBM Plex Mono, monospace">
                  {metric === "weight" ? t.toLocaleString() : t}
                </text>
              ))}
              <text x={px(14)} y={(H - pad.b + pad.t) / 2} fontSize={px(11)} textAnchor="middle" fill="var(--ink-3)" transform={`rotate(-90 ${px(14)} ${(H - pad.b + pad.t) / 2})`}>{yLabel}</text>

              {/* percentile labels at right edge */}
              {PERCENTILES.map((p, i) => (
                <text key={`pl${p.label}`} x={W - pad.r + px(6)} y={percentileLabelYs[i]} fontSize={px(9.5)} fill={p.color} fontFamily="IBM Plex Mono, monospace">{p.label}</text>
              ))}

              {/* patient path */}
              {points.length > 1 && (
                <path
                  d={points.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.pma)} ${yScale(p.value)}`).join(" ")}
                  stroke="oklch(35% 0.10 25)"
                  strokeWidth="2"
                  fill="none"
                />
              )}
              {points.map((p, i) => (
                <g key={i}>
                  <circle cx={xScale(p.pma)} cy={yScale(p.value)} r={px(4)} fill="oklch(50% 0.18 25)" stroke="#fff" strokeWidth={px(1.5)} />
                  {i === points.length - 1 && (
                    <g>
                      <rect x={xScale(p.pma) + px(8)} y={yScale(p.value) - px(22)} width={px(78)} height={px(20)} fill="oklch(20% 0.01 230 / .92)" rx={px(4)} />
                      <text x={xScale(p.pma) + px(14)} y={yScale(p.value) - px(9)} fontSize={px(10)} fill="#fff" fontFamily="IBM Plex Mono, monospace">DOL {p.dol} · {metric === "weight" ? p.value : p.value}{metric === "weight" ? "g" : "cm"}</text>
                    </g>
                  )}
                </g>
              ))}
            </svg>
          </div>

          {/* side panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="fenton-trajectory" style={{ textAlign: "right" }}>
              <div className="sub-h">Current trajectory</div>
              <div style={{ fontSize: 28, fontFamily: "IBM Plex Mono, monospace", fontWeight: 500, letterSpacing: "-0.02em" }}>
                {currentPercentile || "—"}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)" }}>percentile band</div>
            </div>

            <div>
              <div className="sub-h">Latest measurement</div>
              {points.length > 0 ? (
                <div style={{ fontSize: 13 }}>
                  <div className="num" style={{ fontSize: 18, fontWeight: 500 }}>
                    {metric === "weight" ? points[points.length-1].value.toLocaleString() : points[points.length-1].value}
                    <span style={{ color: "var(--ink-3)", fontSize: 11, marginLeft: 4 }}>
                      {metric === "weight" ? "g" : "cm"}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                    PMA <span className="num">{D_F.fmtGA(D_F.daysToGA(Math.round(points[points.length-1].pma * 7)))}</span> wk · DOL {points[points.length-1].dol}
                  </div>
                </div>
              ) : <div style={{ fontSize: 12, color: "var(--ink-3)" }}>No measurements yet</div>}
            </div>

            <div>
              <div className="sub-h">Growth velocity</div>
              <GrowthVelocity points={points} metric={metric} />
            </div>

            {onUpdate && <MeasurementLogger patient={patient} currentDol={currentDol} onUpdate={onUpdate} />}

            <div className="legend" style={{ flexDirection: "column", gap: 6 }}>
              <div className="s"><span className="b" style={{ background: "oklch(46% 0.085 215)" }}></span>50th percentile</div>
              <div className="s"><span className="b" style={{ background: "oklch(62% 0.08 250)" }}></span>10th & 90th</div>
              <div className="s"><span className="b" style={{ background: "oklch(72% 0.06 250)", borderTop: "2px dashed oklch(72% 0.06 250)" }}></span>3rd & 97th</div>
              <div className="s"><span className="b" style={{ background: "oklch(50% 0.18 25)" }}></span>Patient</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GrowthVelocity({ points, metric = "weight" }) {
  if (points.length < 2) {
    return <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Need ≥ 2 measurements</div>;
  }
  const recent = points.slice(-Math.min(points.length, 5));
  const first = recent[0];
  const last = recent[recent.length - 1];
  const days = Math.max(1, (last.pma - first.pma) * 7);

  if (metric === "weight") {
    const dW = last.value - first.value;
    const avgWtKg = (first.value + last.value) / 2 / 1000;
    const gPerKg = dW / days / avgWtKg;
    const status = gPerKg >= 15 ? "ok" : gPerKg >= 10 ? "warn" : "crit";
    return (
      <div>
        <div className="num" style={{ fontSize: 22, fontWeight: 500, color:
          status === "ok" ? "var(--ok)" : status === "warn" ? "oklch(45% 0.13 65)" : "var(--crit)" }}>
          {gPerKg.toFixed(1)}<span style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 4 }}>g/kg/d</span>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>Target ≥ 15 g/kg/d</div>
      </div>
    );
  }

  // length / HC — cm/wk
  const dCm = last.value - first.value;
  const wks = days / 7;
  const cmPerWk = dCm / Math.max(wks, 0.01);
  const status = cmPerWk >= 0.5 && cmPerWk <= 1 ? "ok" : (cmPerWk >= 0.3 && cmPerWk < 0.5) ? "warn" : (cmPerWk > 1 && cmPerWk <= 1.3) ? "warn" : "crit";
  return (
    <div>
      <div className="num" style={{ fontSize: 22, fontWeight: 500, color:
        status === "ok" ? "var(--ok)" : status === "warn" ? "oklch(45% 0.13 65)" : "var(--crit)" }}>
        {cmPerWk.toFixed(2)}<span style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 4 }}>cm/wk</span>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>Target 0.5–1 cm/wk</div>
    </div>
  );
}

function MeasurementLogger({ patient, currentDol, onUpdate }) {
  const weights = patient.weights || [];
  const lastDol = weights.length ? weights[weights.length - 1].dol : 1;
  // Cap at today's auto-computed DOL (admissionDate + daysSinceAdmit) — not last stored entry
  const maxDol = Math.max(lastDol, currentDol || lastDol);
  const [dol, setDol] = React.useState(maxDol);
  const [w, setW] = React.useState("");
  const [l, setL] = React.useState("");
  const [hc, setHc] = React.useState("");
  // Set when a history row is clicked — lets us show an "editing" banner and
  // a way back to a blank entry, mirroring the Daily Log's edit-entry pattern.
  const [editingDol, setEditingDol] = React.useState(null);

  const loadRow = (x) => {
    setDol(x.dol);
    setW(x.w != null ? String(x.w) : "");
    setL(x.l != null ? String(x.l) : "");
    setHc(x.hc != null ? String(x.hc) : "");
    setEditingDol(x.dol);
  };
  const cancelEdit = () => {
    setDol(maxDol); setW(""); setL(""); setHc(""); setEditingDol(null);
  };

  const save = () => {
    let n = parseInt(dol, 10);
    if (!n || n < 1) return;
    if (n > maxDol) n = maxDol;
    const wt = parseFloat(w) || null;
    const len = parseFloat(l) || null;
    const head = parseFloat(hc) || null;
    if (!wt && !len && !head) return;
    const existing = weights.find(x => x.dol === n);
    const merged = existing
      ? weights.map(x => x.dol === n ? { ...x, ...(wt != null ? { w: wt } : {}), ...(len != null ? { l: len } : {}), ...(head != null ? { hc: head } : {}) } : x)
      : [...weights, { dol: n, w: wt ?? (weights[weights.length - 1]?.w || 0), l: len ?? null, hc: head ?? null }].sort((a, b) => a.dol - b.dol);
    onUpdate(merged);
    setW(""); setL(""); setHc(""); setEditingDol(null);
  };

  return (
    <div style={{ background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 10, padding: 12 }}>
      {editingDol != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--brand-2)",
          background: "var(--brand-bg)", border: "1px solid var(--brand-line)", borderRadius: 8,
          padding: "6px 10px", marginBottom: 8 }}>
          <span>Editing DOL <strong>{editingDol}</strong></span>
          <button className="btn sm" style={{ marginLeft: "auto", padding: "2px 8px" }} onClick={cancelEdit}>Cancel</button>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label style={{ fontSize: 10.5 }}>DOL <span className="unit">(max {maxDol})</span></label>
          <input type="number" min={1} max={maxDol} className="inp num" value={dol} disabled={editingDol != null}
            onChange={e => {
              const v = parseInt(e.target.value, 10);
              if (isNaN(v)) setDol("");
              else setDol(Math.min(maxDol, Math.max(1, v)));
            }} style={{ height: 30, opacity: editingDol != null ? 0.6 : 1 }} />
        </div>
        <div className="field">
          <label style={{ fontSize: 10.5 }}>Wt <span className="unit">(g)</span></label>
          <input type="number" className="inp num" value={w} onChange={e => setW(e.target.value)} style={{ height: 30 }} placeholder="—" />
        </div>
        <div className="field">
          <label style={{ fontSize: 10.5 }}>Length <span className="unit">(cm)</span></label>
          <input type="number" step="0.1" className="inp num" value={l} onChange={e => setL(e.target.value)} style={{ height: 30 }} placeholder="—" />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label style={{ fontSize: 10.5 }}>HC <span className="unit">(cm)</span></label>
          <input type="number" step="0.1" className="inp num" value={hc} onChange={e => setHc(e.target.value)} style={{ height: 30 }} placeholder="—" />
        </div>
      </div>
      <button className="btn primary sm" style={{ width: "100%", marginTop: 8, justifyContent: "center" }} onClick={save}>
        <Icon name="save" size={12} color="#fff" /> {editingDol != null ? "Update measurement" : "Save measurement"}
      </button>
      {weights.length > 0 && (
        <div style={{ marginTop: 10, borderTop: "1px solid var(--line-2)", paddingTop: 8 }}>
          <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>History <span style={{ textTransform: "none", letterSpacing: 0 }}>· tap a row to correct it</span></div>
          <div style={{ maxHeight: 140, overflowY: "auto" }}>
            {weights.slice().reverse().map((x, i) => (
              <div key={i} onClick={() => loadRow(x)} title={`Tap to edit DOL ${x.dol}`}
                style={{ display: "grid", gridTemplateColumns: "36px 1fr 1fr 1fr", gap: 4, fontSize: 11,
                  fontFamily: "IBM Plex Mono, monospace", padding: "3px 4px", margin: "0 -4px",
                  borderBottom: "1px dashed var(--line-2)", cursor: "pointer", borderRadius: 4,
                  background: editingDol === x.dol ? "var(--brand-bg)" : "transparent" }}>
                <span style={{ color: "var(--ink-3)" }}>{x.dol}</span>
                <span>{x.w ? x.w + "g" : "—"}</span>
                <span>{x.l ? x.l + "cm" : "—"}</span>
                <span>{x.hc ? x.hc + "cm" : "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

window.FentonChart = FentonChart;
