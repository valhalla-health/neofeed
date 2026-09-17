"use strict";
const D_F = window.NEOFEED_DATA;
function Segmented({ value, onChange, options }) {
  return /* @__PURE__ */ React.createElement("div", { className: "seg" }, options.map(
    (o) => /* @__PURE__ */ React.createElement("button", { key: o.value, className: value === o.value ? "on" : "", onClick: () => onChange(o.value) }, o.label)
  ));
}
function FentonChart({ patient, currentDol, onUpdate }) {
  const sex = patient?.sex;
  const sexValid = !!(sex && D_F.FENTON_WEIGHT[sex] && D_F.FENTON_LENGTH[sex] && D_F.FENTON_HC[sex]);
  const [metric, setMetric] = React.useState("weight");
  const [view, setView] = React.useState(null);
  const dragRef = React.useRef(null);
  const svgWrapRef = React.useRef(null);
  const [renderedWidth, setRenderedWidth] = React.useState(760);
  React.useEffect(() => {
    const el = svgWrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setRenderedWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [sexValid]);
  if (!sexValid) {
    return /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "card-h fenton-card-h" }, /* @__PURE__ */ React.createElement(Icon, { name: "chart", size: 14, color: "var(--brand)" }), "Fenton 2025 growth chart"), /* @__PURE__ */ React.createElement("div", { className: "card-b" }, /* @__PURE__ */ React.createElement("div", { role: "alert", className: "fenton-sex-invalid", style: {
      padding: "12px 14px",
      background: "var(--warn-bg)",
      border: "1px solid var(--warn-line)",
      borderRadius: 8,
      marginBottom: 12,
      fontSize: 13,
      color: "oklch(42% 0.12 65)",
      lineHeight: 1.5
    } }, /* @__PURE__ */ React.createElement("strong", null, "เพศในทะเบียนไม่ถูกต้อง — แก้ที่ Edit session"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, marginTop: 2 } }, "กราฟ Fenton แยกตามเพศ จึงแสดงไม่ได้จนกว่าจะระบุ Male หรือ Female", sex ? ` (ค่าที่บันทึกไว้: "${String(sex)}")` : "", " · ยังบันทึกน้ำหนัก/ความยาว/HC ได้ตามปกติ")), onUpdate && /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 320 } }, /* @__PURE__ */ React.createElement(MeasurementLogger, { key: patient.sessionId, patient, currentDol, onUpdate }))));
  }
  const GA_MAX = 42;
  const dataset = (metric === "weight" ? D_F.FENTON_WEIGHT[sex] : metric === "length" ? D_F.FENTON_LENGTH[sex] : D_F.FENTON_HC[sex]).filter((r) => r[0] <= GA_MAX);
  const yLabel = metric === "weight" ? "Weight (g)" : metric === "length" ? "Length (cm)" : "Head Circumference (cm)";
  const xMin = 22, xMax = GA_MAX;
  const yVals = dataset.flatMap((r) => r.slice(1));
  const yMin = 0;
  const yMax = Math.max(...yVals) * 1.05;
  const W = 760, H = 460;
  const chartScale = Math.min(1, Math.max(renderedWidth / W, 0.35));
  const px = (v) => v / chartScale;
  const pad = { l: px(64), r: px(42), t: px(24), b: px(44) };
  const xScale = (x) => pad.l + (x - xMin) / (xMax - xMin) * (W - pad.l - pad.r);
  const yScale = (y) => H - pad.b - (y - yMin) / (yMax - yMin) * (H - pad.t - pad.b);
  const PERCENTILES = [
    { idx: 1, label: "3rd", color: "oklch(72% 0.06 250)", w: 1.2, dash: "4 3" },
    { idx: 2, label: "10th", color: "oklch(62% 0.08 250)", w: 1.4, dash: "" },
    { idx: 3, label: "50th", color: "oklch(46% 0.085 215)", w: 2, dash: "" },
    { idx: 4, label: "90th", color: "oklch(62% 0.08 250)", w: 1.4, dash: "" },
    { idx: 5, label: "97th", color: "oklch(72% 0.06 250)", w: 1.2, dash: "4 3" }
  ];
  const curvePath = (idx) => {
    const pts = dataset.map((r) => [xScale(r[0]), yScale(r[idx])]);
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
  const bandPath = () => {
    const top = curvePath(4);
    const pts = dataset.slice().reverse().map((r) => [xScale(r[0]), yScale(r[2])]);
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
  const xTicks = [22, 26, 30, 34, 38, 42].filter((t) => t <= GA_MAX);
  const yTicks = [];
  const niceStep = metric === "weight" ? 1e3 : metric === "length" ? 10 : 5;
  for (let v = 0; v <= yMax; v += niceStep) yTicks.push(v);
  const pma0 = D_F.gaToDecimalWeeks(patient?.ga || 28);
  const allPoints = (() => {
    if (metric === "weight") {
      return (patient?.weights || []).map((w) => ({
        pma: pma0 + (w.dol - 1) / 7,
        value: w.w,
        dol: w.dol
      }));
    }
    const standalone = (metric === "length" ? patient?.lengths || [] : patient?.hcs || []).map((e) => ({ dol: e.dol, value: e.v }));
    const inline = (patient?.weights || []).filter((w) => (metric === "length" ? w.l : w.hc) != null).map((w) => ({ dol: w.dol, value: metric === "length" ? w.l : w.hc }));
    const byDol = new Map(standalone.map((e) => [e.dol, e.value]));
    inline.forEach((e) => byDol.set(e.dol, e.value));
    return [...byDol.entries()].map(([dol, value]) => ({ pma: pma0 + (dol - 1) / 7, value, dol })).sort((a, b) => a.dol - b.dol);
  })().filter((p) => p.value != null);
  const points = allPoints.filter((p) => p.pma >= xMin && p.pma <= xMax);
  const hiddenPastMax = allPoints.filter((p) => p.pma > xMax).length;
  const currentPercentile = (() => {
    if (points.length === 0) return null;
    const last = points[points.length - 1];
    const t = last.pma;
    const lo = dataset.find((r, i) => dataset[i + 1] && r[0] <= t && dataset[i + 1][0] >= t);
    if (!lo) return null;
    const hi = dataset[dataset.indexOf(lo) + 1];
    const f = (t - lo[0]) / (hi[0] - lo[0]);
    const refs = [3, 10, 50, 90, 97];
    const vals = [1, 2, 3, 4, 5].map((i) => lo[i] + f * (hi[i] - lo[i]));
    if (last.value < vals[0]) return "<3rd";
    if (last.value >= vals[4]) return ">97th";
    for (let i = 0; i < 4; i++) {
      if (last.value >= vals[i] && last.value < vals[i + 1]) {
        const ff = (last.value - vals[i]) / (vals[i + 1] - vals[i]);
        const p = refs[i] + ff * (refs[i + 1] - refs[i]);
        return `~${p.toFixed(0)}th`;
      }
    }
    return null;
  })();
  const percentileLabelYs = (() => {
    const minGap = px(12);
    const ys = PERCENTILES.map((p) => yScale(dataset[dataset.length - 1][p.idx]) + px(4));
    for (let i = 1; i < ys.length; i++) {
      if (ys[i - 1] - ys[i] < minGap) ys[i] = ys[i - 1] - minGap;
    }
    const minY = pad.t + px(10);
    const topY = ys[ys.length - 1];
    if (topY < minY) {
      const shift = minY - topY;
      for (let i = 0; i < ys.length; i++) ys[i] += shift;
    }
    return ys;
  })();
  return /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "card-h fenton-card-h" }, /* @__PURE__ */ React.createElement(Icon, { name: "chart", size: 14, color: "var(--brand)" }), "Fenton 2025 growth chart · ", /* @__PURE__ */ React.createElement("span", { className: "mono" }, sex === "boys" ? "Male" : "Female"), /* @__PURE__ */ React.createElement("span", { className: "h-meta fenton-ctrl", style: { display: "flex", gap: 8, alignItems: "center" } }, /* @__PURE__ */ React.createElement(Segmented, { value: metric, onChange: setMetric, options: [
    { value: "weight", label: "Weight" },
    { value: "length", label: "Length" },
    { value: "hc", label: "HC" }
  ] }))), /* @__PURE__ */ React.createElement("div", { className: "card-b" }, hiddenPastMax > 0 && /* @__PURE__ */ React.createElement("div", { style: {
    padding: "10px 12px",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-line)",
    borderRadius: 8,
    marginBottom: 10,
    fontSize: 12.5,
    color: "var(--warn)",
    display: "flex",
    alignItems: "center",
    gap: 8
  } }, /* @__PURE__ */ React.createElement(Icon, { name: "info", size: 13, color: "var(--warn)" }), /* @__PURE__ */ React.createElement("span", null, "มีค่าที่วัดหลัง PMA ", GA_MAX, " สัปดาห์ ", /* @__PURE__ */ React.createElement("strong", null, hiddenPastMax), " ค่า ไม่ได้แสดงบนกราฟ — Fenton 2025 มีข้อมูลอ้างอิงถึง ", GA_MAX, " สัปดาห์เท่านั้น")), /* @__PURE__ */ React.createElement("div", { className: "fenton-grid", style: { display: "grid", gridTemplateColumns: "1fr 200px", gap: 18 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "flex-end", gap: 4, marginBottom: 6 } }, /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: () => {
    const v = view || { x: 0, y: 0, w: W, h: H };
    const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
    const nw = v.w * 0.75, nh = v.h * 0.75;
    setView({ x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh });
  }, title: "Zoom in" }, "＋"), /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: () => {
    const v = view || { x: 0, y: 0, w: W, h: H };
    const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
    const nw = Math.min(W, v.w / 0.75), nh = Math.min(H, v.h / 0.75);
    setView({ x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh });
  }, title: "Zoom out" }, "−"), /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: () => setView(null), title: "Fit view" }, "⤢ Fit")), /* @__PURE__ */ React.createElement(
    "svg",
    {
      ref: svgWrapRef,
      viewBox: view ? `${view.x} ${view.y} ${view.w} ${view.h}` : `0 0 ${W} ${H}`,
      style: { width: "100%", height: "auto", maxWidth: 760, cursor: dragRef.current ? "grabbing" : "grab", userSelect: "none", touchAction: "none", border: "1px solid var(--line)", borderRadius: 6 },
      onWheel: (e) => {
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
      },
      onPointerDown: (e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const v = view || { x: 0, y: 0, w: W, h: H };
        const rect = e.currentTarget.getBoundingClientRect();
        dragRef.current = { sx: e.clientX, sy: e.clientY, v, scaleX: v.w / rect.width, scaleY: v.h / rect.height };
      },
      onPointerMove: (e) => {
        if (!dragRef.current) return;
        const d = dragRef.current;
        const dx = (e.clientX - d.sx) * d.scaleX;
        const dy = (e.clientY - d.sy) * d.scaleY;
        setView({ x: d.v.x - dx, y: d.v.y - dy, w: d.v.w, h: d.v.h });
      },
      onPointerUp: (e) => {
        dragRef.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    /* @__PURE__ */ React.createElement("rect", { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: H - pad.t - pad.b, fill: "oklch(99.5% 0.002 230)" }),
    yTicks.map((t) => /* @__PURE__ */ React.createElement("line", { key: `y${t}`, x1: pad.l, x2: W - pad.r, y1: yScale(t), y2: yScale(t), stroke: "oklch(94% 0.005 230)" })),
    xTicks.map((t) => /* @__PURE__ */ React.createElement("line", { key: `x${t}`, y1: pad.t, y2: H - pad.b, x1: xScale(t), x2: xScale(t), stroke: "oklch(94% 0.005 230)" })),
    /* @__PURE__ */ React.createElement("path", { d: bandPath(), fill: "oklch(50% 0.1 215 / .07)" }),
    PERCENTILES.map((p) => /* @__PURE__ */ React.createElement("path", { key: p.label, d: curvePath(p.idx), stroke: p.color, strokeWidth: p.w, fill: "none", strokeDasharray: p.dash })),
    /* @__PURE__ */ React.createElement("line", { x1: pad.l, x2: W - pad.r, y1: H - pad.b, y2: H - pad.b, stroke: "var(--ink-3)" }),
    /* @__PURE__ */ React.createElement("line", { x1: pad.l, x2: pad.l, y1: pad.t, y2: H - pad.b, stroke: "var(--ink-3)" }),
    xTicks.map((t) => /* @__PURE__ */ React.createElement("text", { key: `xl${t}`, x: xScale(t), y: H - pad.b + px(16), fontSize: px(11), textAnchor: "middle", fill: "var(--ink-3)", fontFamily: "IBM Plex Mono, monospace" }, t)),
    /* @__PURE__ */ React.createElement("text", { x: (W - pad.r + pad.l) / 2, y: H - px(8), fontSize: px(11), textAnchor: "middle", fill: "var(--ink-3)" }, "Post-menstrual age (weeks)"),
    yTicks.map((t) => /* @__PURE__ */ React.createElement("text", { key: `yl${t}`, x: pad.l - px(8), y: yScale(t) + px(3), fontSize: px(11), textAnchor: "end", fill: "var(--ink-3)", fontFamily: "IBM Plex Mono, monospace" }, metric === "weight" ? t.toLocaleString() : t)),
    /* @__PURE__ */ React.createElement("text", { x: px(14), y: (H - pad.b + pad.t) / 2, fontSize: px(11), textAnchor: "middle", fill: "var(--ink-3)", transform: `rotate(-90 ${px(14)} ${(H - pad.b + pad.t) / 2})` }, yLabel),
    PERCENTILES.map((p, i) => /* @__PURE__ */ React.createElement("text", { key: `pl${p.label}`, x: W - pad.r + px(6), y: percentileLabelYs[i], fontSize: px(9.5), fill: p.color, fontFamily: "IBM Plex Mono, monospace" }, p.label)),
    points.length > 1 && /* @__PURE__ */ React.createElement(
      "path",
      {
        d: points.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.pma)} ${yScale(p.value)}`).join(" "),
        stroke: "oklch(35% 0.10 25)",
        strokeWidth: "2",
        fill: "none"
      }
    ),
    points.map((p, i) => /* @__PURE__ */ React.createElement("g", { key: i }, /* @__PURE__ */ React.createElement("circle", { cx: xScale(p.pma), cy: yScale(p.value), r: px(4), fill: "oklch(50% 0.18 25)", stroke: "#fff", strokeWidth: px(1.5) }), i === points.length - 1 && /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("rect", { x: xScale(p.pma) + px(8), y: yScale(p.value) - px(22), width: px(78), height: px(20), fill: "oklch(20% 0.01 230 / .92)", rx: px(4) }), /* @__PURE__ */ React.createElement("text", { x: xScale(p.pma) + px(14), y: yScale(p.value) - px(9), fontSize: px(10), fill: "#fff", fontFamily: "IBM Plex Mono, monospace" }, "DOL ", p.dol, " · ", metric === "weight" ? p.value : p.value, metric === "weight" ? "g" : "cm"))))
  )), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } }, /* @__PURE__ */ React.createElement("div", { className: "fenton-trajectory", style: { textAlign: "right" } }, /* @__PURE__ */ React.createElement("div", { className: "sub-h" }, "Current trajectory"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 28, fontFamily: "IBM Plex Mono, monospace", fontWeight: 500, letterSpacing: "-0.02em" } }, currentPercentile || "—"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--ink-3)" } }, "percentile band")), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "right" } }, /* @__PURE__ */ React.createElement("div", { className: "sub-h" }, "Latest measurement"), points.length > 0 ? /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13 } }, /* @__PURE__ */ React.createElement("div", { className: "num", style: { fontSize: 18, fontWeight: 500 } }, metric === "weight" ? points[points.length - 1].value.toLocaleString() : points[points.length - 1].value, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--ink-3)", fontSize: 11, marginLeft: 4 } }, metric === "weight" ? "g" : "cm")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 } }, "PMA ", /* @__PURE__ */ React.createElement("span", { className: "num" }, D_F.fmtGA(D_F.daysToGA(Math.round(points[points.length - 1].pma * 7)))), " wk · DOL ", points[points.length - 1].dol)) : /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--ink-3)" } }, "No measurements yet")), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "right" } }, /* @__PURE__ */ React.createElement("div", { className: "sub-h" }, "Growth velocity"), /* @__PURE__ */ React.createElement(GrowthVelocity, { points, metric })), onUpdate && /* @__PURE__ */ React.createElement(MeasurementLogger, { key: patient.sessionId, patient, currentDol, onUpdate }), /* @__PURE__ */ React.createElement("div", { className: "legend", style: { flexDirection: "column", gap: 6 } }, /* @__PURE__ */ React.createElement("div", { className: "s" }, /* @__PURE__ */ React.createElement("span", { className: "b", style: { background: "oklch(46% 0.085 215)" } }), "50th percentile"), /* @__PURE__ */ React.createElement("div", { className: "s" }, /* @__PURE__ */ React.createElement("span", { className: "b", style: { background: "oklch(62% 0.08 250)" } }), "10th & 90th"), /* @__PURE__ */ React.createElement("div", { className: "s" }, /* @__PURE__ */ React.createElement("span", { className: "b", style: { background: "oklch(72% 0.06 250)", borderTop: "2px dashed oklch(72% 0.06 250)" } }), "3rd & 97th"), /* @__PURE__ */ React.createElement("div", { className: "s" }, /* @__PURE__ */ React.createElement("span", { className: "b", style: { background: "oklch(50% 0.18 25)" } }), "Patient"))))));
}
function GrowthVelocity({ points, metric = "weight" }) {
  if (points.length < 2) {
    return /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--ink-3)" } }, "Need ≥ 2 measurements");
  }
  const recent = points.slice(-Math.min(points.length, 5));
  const first = recent[0];
  const last = recent[recent.length - 1];
  const days = Math.max(1, (last.pma - first.pma) * 7);
  if (metric === "weight") {
    const dW = last.value - first.value;
    const avgWtKg = (first.value + last.value) / 2 / 1e3;
    const gPerKg = dW / days / avgWtKg;
    const status2 = gPerKg >= 15 ? "ok" : gPerKg >= 10 ? "warn" : "crit";
    return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "num", style: { fontSize: 22, fontWeight: 500, color: status2 === "ok" ? "var(--ok)" : status2 === "warn" ? "oklch(45% 0.13 65)" : "var(--crit)" } }, gPerKg.toFixed(1), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--ink-3)", marginLeft: 4 } }, "g/kg/d")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 } }, "Target ≥ 15 g/kg/d"));
  }
  const dCm = last.value - first.value;
  const wks = days / 7;
  const cmPerWk = dCm / Math.max(wks, 0.01);
  const status = cmPerWk >= 0.5 && cmPerWk <= 1 ? "ok" : cmPerWk >= 0.3 && cmPerWk < 0.5 ? "warn" : cmPerWk > 1 && cmPerWk <= 1.3 ? "warn" : "crit";
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "num", style: { fontSize: 22, fontWeight: 500, color: status === "ok" ? "var(--ok)" : status === "warn" ? "oklch(45% 0.13 65)" : "var(--crit)" } }, cmPerWk.toFixed(2), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--ink-3)", marginLeft: 4 } }, "cm/wk")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 } }, "Target 0.5–1 cm/wk"));
}
function MeasurementLogger({ patient, currentDol, onUpdate }) {
  const weights = patient.weights || [];
  const lastDol = weights.length ? weights[weights.length - 1].dol : 1;
  const maxDol = Math.max(lastDol, currentDol || lastDol);
  const [dol, setDol] = React.useState(maxDol);
  const [w, setW] = React.useState("");
  const [l, setL] = React.useState("");
  const [hc, setHc] = React.useState("");
  const [editingDol, setEditingDol] = React.useState(null);
  const prevMaxDolRef = React.useRef(maxDol);
  React.useEffect(() => {
    const prev = prevMaxDolRef.current;
    prevMaxDolRef.current = maxDol;
    if (prev === maxDol || editingDol != null) return;
    setDol((d) => d === prev || d === "" ? maxDol : Math.min(d, maxDol));
  }, [maxDol]);
  const loadRow = (x) => {
    setDol(x.dol);
    setW(x.w != null ? String(x.w) : "");
    setL(x.l != null ? String(x.l) : "");
    setHc(x.hc != null ? String(x.hc) : "");
    setEditingDol(x.dol);
  };
  const cancelEdit = () => {
    setDol(maxDol);
    setW("");
    setL("");
    setHc("");
    setEditingDol(null);
  };
  const save = () => {
    let n = parseInt(dol, 10);
    if (!n || n < 1) return;
    if (n > maxDol) n = maxDol;
    let wt = parseFloat(w) || null;
    let len = parseFloat(l) || null;
    let head = parseFloat(hc) || null;
    if (wt != null && wt < 0) wt = null;
    if (len != null && len < 0) len = null;
    if (head != null && head < 0) head = null;
    if (!wt && !len && !head) return;
    const existing = weights.find((x) => x.dol === n);
    const merged = existing ? weights.map((x) => x.dol === n ? { ...x, ...wt != null ? { w: wt } : {}, ...len != null ? { l: len } : {}, ...head != null ? { hc: head } : {} } : x) : [...weights, { dol: n, w: wt, l: len ?? null, hc: head ?? null }].sort((a, b) => a.dol - b.dol);
    if (onUpdate(merged) === false) return;
    setW("");
    setL("");
    setHc("");
    setEditingDol(null);
  };
  return /* @__PURE__ */ React.createElement("div", { style: { background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 10, padding: 12 } }, editingDol != null && /* @__PURE__ */ React.createElement("div", { style: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 11,
    color: "var(--brand-2)",
    background: "var(--brand-bg)",
    border: "1px solid var(--brand-line)",
    borderRadius: 8,
    padding: "6px 10px",
    marginBottom: 8
  } }, /* @__PURE__ */ React.createElement("span", null, "Editing DOL ", /* @__PURE__ */ React.createElement("strong", null, editingDol)), /* @__PURE__ */ React.createElement("button", { className: "btn sm", style: { marginLeft: "auto", padding: "2px 8px" }, onClick: cancelEdit }, "Cancel")), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } }, /* @__PURE__ */ React.createElement("div", { className: "field", style: { gridColumn: "1 / -1" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: 10.5 } }, "DOL ", /* @__PURE__ */ React.createElement("span", { className: "unit" }, "(max ", maxDol, ")")), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: 1,
      max: maxDol,
      className: "inp num",
      value: dol,
      disabled: editingDol != null,
      onChange: (e) => {
        const v = parseInt(e.target.value, 10);
        if (isNaN(v)) setDol("");
        else setDol(Math.min(maxDol, Math.max(1, v)));
      },
      style: { height: 30, opacity: editingDol != null ? 0.6 : 1 }
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: 10.5 } }, "Wt ", /* @__PURE__ */ React.createElement("span", { className: "unit" }, "(g)")), /* @__PURE__ */ React.createElement("input", { type: "number", min: "0", className: "inp num", value: w, onChange: (e) => setW(e.target.value), style: { height: 30 }, placeholder: "—" })), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: 10.5 } }, "Length ", /* @__PURE__ */ React.createElement("span", { className: "unit" }, "(cm)")), /* @__PURE__ */ React.createElement("input", { type: "number", step: "0.1", min: "0", className: "inp num", value: l, onChange: (e) => setL(e.target.value), style: { height: 30 }, placeholder: "—" })), /* @__PURE__ */ React.createElement("div", { className: "field", style: { gridColumn: "1 / -1" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: 10.5 } }, "HC ", /* @__PURE__ */ React.createElement("span", { className: "unit" }, "(cm)")), /* @__PURE__ */ React.createElement("input", { type: "number", step: "0.1", min: "0", className: "inp num", value: hc, onChange: (e) => setHc(e.target.value), style: { height: 30 }, placeholder: "—" }))), /* @__PURE__ */ React.createElement("button", { className: "btn primary sm", style: { width: "100%", marginTop: 8, justifyContent: "center" }, onClick: save }, /* @__PURE__ */ React.createElement(Icon, { name: "save", size: 12, color: "#fff" }), " ", editingDol != null ? "Update measurement" : "Save measurement"), weights.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10, borderTop: "1px solid var(--line-2)", paddingTop: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 } }, "History ", /* @__PURE__ */ React.createElement("span", { style: { textTransform: "none", letterSpacing: 0 } }, "· tap a row to correct it")), /* @__PURE__ */ React.createElement("div", { style: { maxHeight: 140, overflowY: "auto" } }, weights.slice().reverse().map((x, i) => /* @__PURE__ */ React.createElement(
    "div",
    {
      key: i,
      onClick: () => loadRow(x),
      title: `Tap to edit DOL ${x.dol}`,
      style: {
        display: "grid",
        gridTemplateColumns: "36px 1fr 1fr 1fr",
        gap: 4,
        fontSize: 11,
        fontFamily: "IBM Plex Mono, monospace",
        padding: "3px 4px",
        margin: "0 -4px",
        borderBottom: "1px dashed var(--line-2)",
        cursor: "pointer",
        borderRadius: 4,
        background: editingDol === x.dol ? "var(--brand-bg)" : "transparent"
      }
    },
    /* @__PURE__ */ React.createElement("span", { style: { color: "var(--ink-3)" } }, x.dol),
    /* @__PURE__ */ React.createElement("span", null, x.w ? x.w + "g" : "—"),
    /* @__PURE__ */ React.createElement("span", null, x.l ? x.l + "cm" : "—"),
    /* @__PURE__ */ React.createElement("span", null, x.hc ? x.hc + "cm" : "—")
  )))));
}
window.FentonChart = FentonChart;
