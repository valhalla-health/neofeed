"use strict";
const D_R = window.NEOFEED_DATA;
const rowA11y = (onActivate) => ({
  role: "button",
  tabIndex: 0,
  onKeyDown: (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate();
    }
  }
});
const WARD_RANK = { nicu: 0, iso: 1, scn: 2 };
const bedSort = (a, b) => {
  const bedA = a.currentBed || "zzz";
  const bedB = b.currentBed || "zzz";
  const rank = (bed) => WARD_RANK[(bed.match(/^[a-z]+/i) || [""])[0].toLowerCase()] ?? 3;
  return rank(bedA) - rank(bedB) || bedA.localeCompare(bedB, void 0, { numeric: true, sensitivity: "base" });
};
function BedChip({ p, style }) {
  if (D_R.isParked(p)) {
    return /* @__PURE__ */ React.createElement("span", { className: "chip warn", style, title: `ย้ายออกจาก ${D_R.lastBed(p)} แล้ว — ยังไม่ได้เลือกเตียงใหม่` }, /* @__PURE__ */ React.createElement("span", { className: "d" }), "รอเตียง · จาก ", D_R.lastBed(p));
  }
  return /* @__PURE__ */ React.createElement("span", { className: "chip", style }, /* @__PURE__ */ React.createElement("span", { className: "d" }), p.currentBed);
}
const isActivePatient = (p) => !p.status || p.status === "Active";
const MULTIPLES_COUNT_TERM = { 2: "Twin", 3: "Triplet", 4: "Quadruplet" };
const MULTIPLES_LETTER_FALLBACK = { A: "Twin", B: "Twin", C: "Triplet", D: "Quadruplet" };
function multiplesLabel(p) {
  if (!p.twinSuffix) return null;
  const term = MULTIPLES_COUNT_TERM[p.multiplesCount] || MULTIPLES_LETTER_FALLBACK[p.twinSuffix] || "Multiple";
  return `${term} ${p.twinSuffix}`;
}
function WardTile({ label, sub, list, log, today, onPick }) {
  const logged = list.filter((p) => D_R.hasLogOnDate(log[p.sessionId], today)).length;
  const needs = list.length - logged;
  return /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "ward-tile",
      onClick: onPick,
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 6,
        padding: "22px 24px",
        borderRadius: 12,
        cursor: "pointer",
        textAlign: "left",
        width: "100%"
      }
    },
    /* @__PURE__ */ React.createElement("div", { style: { fontSize: 22, fontWeight: 600, color: "var(--brand-2)", letterSpacing: "-0.02em" } }, label),
    /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--ink-3)" } }, sub),
    /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 14, marginTop: 8, fontSize: 12.5 } }, /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("span", { className: "num", style: { fontSize: 18, fontWeight: 600 } }, list.length), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--ink-3)" } }, " active")), /* @__PURE__ */ React.createElement("span", { style: { color: needs === 0 ? "var(--ok)" : "var(--crit)" } }, /* @__PURE__ */ React.createElement("span", { className: "num", style: { fontSize: 18, fontWeight: 600 } }, needs), /* @__PURE__ */ React.createElement("span", null, " needs entry")))
  );
}
function WardGate({ patients, log, today, onPick }) {
  const groups = { NICU: [], SCN: [], other: [] };
  const active = patients.filter(isActivePatient);
  active.forEach((p) => groups[D_R.patientWard(p)].push(p));
  const tile = (ward) => ({ list: groups[ward], log, today, onPick: () => onPick(ward) });
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "page-head", style: { marginBottom: 16 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", null, "Ward"), /* @__PURE__ */ React.createElement("div", { className: "sub" }, active.length, " active sessions · ", today))), /* @__PURE__ */ React.createElement("div", { className: "ward-gate", style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, maxWidth: 760 } }, /* @__PURE__ */ React.createElement(WardTile, { label: "NICU", sub: "NICU 1–12 · iso 1–3", ...tile("NICU") }), /* @__PURE__ */ React.createElement(WardTile, { label: "SCN", sub: "SCN 1–30", ...tile("SCN") }), groups.other.length > 0 && /* @__PURE__ */ React.createElement(WardTile, { label: "อื่นๆ", sub: "ยังไม่ระบุเตียง / เตียงนอกรายการ", ...tile("other") })));
}
function SearchMiss({ query, wardName, elsewhere, onWardChange }) {
  return /* @__PURE__ */ React.createElement("div", { className: "search-miss" }, /* @__PURE__ */ React.createElement("div", null, "ไม่พบ “", query, "” ใน ", wardName), elsewhere.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 12 } }, elsewhere.map((x) => /* @__PURE__ */ React.createElement("button", { key: x.ward, type: "button", className: "btn sm", onClick: () => onWardChange?.(x.ward) }, "พบใน ", x.ward === "other" ? "อื่นๆ" : x.ward, " ", x.n, " ราย · ไปดู →"))));
}
function PatientRegistry({ patients, activeId, log = {}, ward, onWardChange, onSelect, onAdd, onEdit, onDelete, mergeBaseFor }) {
  const [filter, setFilter] = React.useState("");
  const [showAdd, setShowAdd] = React.useState(false);
  const [editPatient, setEditPatient] = React.useState(null);
  const [transferPatient, setTransferPatient] = React.useState(null);
  const [showArchived, setShowArchived] = React.useState(false);
  const today = D_R.useTodayLocal();
  if (!ward) return /* @__PURE__ */ React.createElement(WardGate, { patients, log, today, onPick: onWardChange });
  const q = filter.trim();
  const wardName = ward === "other" ? "อื่นๆ" : ward;
  const wardPatients = patients.filter((p) => D_R.patientWard(p) === ward);
  const byBed = [...wardPatients].sort(bedSort);
  const search = q ? D_R.searchPatients(byBed, q) : null;
  const sorted = search ? search.hits : byBed;
  const activeSorted = sorted.filter(isActivePatient);
  const ARCHIVE_VISIBLE_DAYS = 7;
  const daysSinceStatus = (p) => {
    if (!p.statusDate) return Infinity;
    const changed = /* @__PURE__ */ new Date(p.statusDate + "T00:00:00");
    if (isNaN(changed)) return Infinity;
    return Math.floor((/* @__PURE__ */ new Date(today + "T00:00:00") - changed) / 864e5);
  };
  const archivedSorted = sorted.filter(
    (p) => p.status && p.status !== "Active" && daysSinceStatus(p) <= ARCHIVE_VISIBLE_DAYS
  );
  const activePatients = wardPatients.filter(isActivePatient);
  const loggedSet = new Set(
    activePatients.filter((p) => D_R.hasLogOnDate(log[p.sessionId], today)).map((p) => p.sessionId)
  );
  const totalActive = activePatients.length;
  const loggedToday = loggedSet.size;
  const needsLog = totalActive - loggedToday;
  const elsewhere = q && activeSorted.length === 0 ? ["NICU", "SCN", "other"].filter((w) => w !== ward).map((w) => ({
    ward: w,
    n: D_R.searchPatients(patients.filter((p) => D_R.patientWard(p) === w && isActivePatient(p)), q).hits.length
  })).filter((x) => x.n > 0) : [];
  const miss = /* @__PURE__ */ React.createElement(SearchMiss, { query: q, wardName, elsewhere, onWardChange });
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "page-head", style: { marginBottom: 12 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", null, wardName), /* @__PURE__ */ React.createElement("div", { className: "sub" }, wardPatients.length, " sessions · ", totalActive, " active")), /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: () => {
    setFilter("");
    onWardChange?.(null);
  }, style: { fontSize: 12.5 } }, "← เปลี่ยน ward")), /* @__PURE__ */ React.createElement("div", { className: "reg-stats" }, /* @__PURE__ */ React.createElement("div", { className: "reg-stat s-brand" }, /* @__PURE__ */ React.createElement("span", { className: "reg-stat-val" }, totalActive), /* @__PURE__ */ React.createElement("span", { className: "reg-stat-lbl" }, "Active")), /* @__PURE__ */ React.createElement("div", { className: "reg-stat" }, /* @__PURE__ */ React.createElement("span", { className: "reg-stat-val" }, wardPatients.length), /* @__PURE__ */ React.createElement("span", { className: "reg-stat-lbl" }, "Total sessions")), /* @__PURE__ */ React.createElement("div", { className: `reg-stat ${loggedToday === totalActive && totalActive > 0 ? "s-ok" : loggedToday > 0 ? "s-warn" : "s-crit"}` }, /* @__PURE__ */ React.createElement("span", { className: "reg-stat-val" }, loggedToday), /* @__PURE__ */ React.createElement("span", { className: "reg-stat-lbl" }, "Logged today")), /* @__PURE__ */ React.createElement("div", { className: `reg-stat ${needsLog === 0 ? "" : needsLog <= 1 ? "s-warn" : "s-crit"}` }, /* @__PURE__ */ React.createElement("span", { className: "reg-stat-val" }, needsLog), /* @__PURE__ */ React.createElement("span", { className: "reg-stat-lbl" }, "Needs entry"))), /* @__PURE__ */ React.createElement("div", { className: "reg-filter" }, /* @__PURE__ */ React.createElement("div", { className: "reg-search" }, /* @__PURE__ */ React.createElement("div", { className: "s-ico" }, /* @__PURE__ */ React.createElement(Icon, { name: "search", size: 14 })), /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "inp",
      lang: "th",
      inputMode: "search",
      enterKeyHint: "search",
      autoComplete: "off",
      autoCorrect: "off",
      autoCapitalize: "off",
      spellCheck: false,
      "aria-label": `ค้นหาผู้ป่วยใน ${wardName}`,
      placeholder: "ค้นหา ชื่อ หรือ นามสกุล · เลขเตียง",
      value: filter,
      onChange: (e) => setFilter(e.target.value),
      onKeyDown: (e) => {
        if (e.key === "Escape" && filter) {
          e.preventDefault();
          setFilter("");
        }
      }
    }
  ), filter && /* @__PURE__ */ React.createElement("button", { type: "button", className: "s-clear", "aria-label": "ล้างคำค้นหา", onClick: () => setFilter("") }, /* @__PURE__ */ React.createElement(Icon, { name: "x", size: 14 }))), /* @__PURE__ */ React.createElement("button", { className: "btn primary", style: { whiteSpace: "nowrap" }, onClick: () => setShowAdd(true) }, /* @__PURE__ */ React.createElement(Icon, { name: "plus", size: 14, color: "#fff" }), " New session")), q && activeSorted.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "reg-search-note" }, "พบ ", activeSorted.length, " รายใน ", wardName, search.thai && /* @__PURE__ */ React.createElement(React.Fragment, null, " · ค้นเป็น “", search.thai, "” (แป้นพิมพ์ภาษาไทย)")), /* @__PURE__ */ React.createElement("div", { className: "patient-card-list" }, activeSorted.map((p) => {
    const last = D_R.currentWeight(p, log[p.sessionId]) || null;
    const dol = D_R.liveDol(p);
    const delta = last ? last.w - p.bw : 0;
    const deltaPct = delta / p.bw * 100;
    const deltaColor = deltaPct < -10 ? "var(--crit)" : deltaPct < 0 ? "var(--warn-ink)" : "var(--ok)";
    const isActive = p.sessionId === activeId;
    const entries = D_R.finalEntries(log[p.sessionId]);
    const lastEntry = entries[entries.length - 1];
    const hasToday = loggedSet.has(p.sessionId);
    const draftToday = !hasToday && D_R.hasDraftOnDate(log[p.sessionId], today);
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        key: p.sessionId,
        className: "patient-mc" + (isActive ? " active" : ""),
        onClick: () => onSelect(p.sessionId),
        ...rowA11y(() => onSelect(p.sessionId))
      },
      /* @__PURE__ */ React.createElement("div", { className: "pmc-row pmc-head" }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, /* @__PURE__ */ React.createElement("span", { className: "pmc-name" }, p.name || p.initials || "—"), p.twinSuffix && /* @__PURE__ */ React.createElement("span", { className: "pmc-twin chip", style: { fontSize: 11, fontWeight: 700 } }, multiplesLabel(p)), /* @__PURE__ */ React.createElement("span", { className: "pmc-dol" }, "DOL ", dol)), /* @__PURE__ */ React.createElement("span", { className: "chip ok" }, /* @__PURE__ */ React.createElement("span", { className: "d" }), "Active")),
      /* @__PURE__ */ React.createElement("div", { className: "pmc-row" }, /* @__PURE__ */ React.createElement(BedChip, { p }), /* @__PURE__ */ React.createElement("span", { className: "pmc-meta" }, /* @__PURE__ */ React.createElement("span", { className: "num" }, D_R.fmtGA(p.ga)), " wk ·", " ", /* @__PURE__ */ React.createElement("span", { className: "num" }, p.bw.toLocaleString()), " g")),
      p.diagnosis && /* @__PURE__ */ React.createElement("div", { className: "pmc-diagnosis" }, p.diagnosis),
      /* @__PURE__ */ React.createElement("div", { className: "pmc-row pmc-stats" }, /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("span", { className: "pmc-lbl" }, "Wt"), /* @__PURE__ */ React.createElement("span", { className: "num" }, last?.w?.toLocaleString() || "—"), " g"), /* @__PURE__ */ React.createElement("span", { style: { color: last ? deltaColor : "var(--ink-3)" } }, /* @__PURE__ */ React.createElement("span", { className: "pmc-lbl" }, "Δ"), last ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { className: "num" }, delta >= 0 ? "+" : "", delta), " g (", D_R.displayNum(deltaPct, 1), "%)") : /* @__PURE__ */ React.createElement("span", { className: "num" }, "—")), /* @__PURE__ */ React.createElement(
        "span",
        {
          className: "log-badge" + (hasToday ? " is-logged" : draftToday ? " is-draft" : ""),
          title: hasToday ? "บันทึกวันนี้แล้ว" : draftToday ? "บันทึกร่างไว้ — กรอกให้ครบแล้ว Submit" : lastEntry ? `บันทึกล่าสุด DOL ${D_R.entryDol(p, lastEntry)}` : "ยังไม่มีบันทึก"
        },
        hasToday ? "✓ LOGGED" : draftToday ? "DRAFT" : "NEEDS ENTRY"
      )),
      /* @__PURE__ */ React.createElement("div", { className: "pmc-actions" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "btn sm pmc-bed",
          onClick: (e) => {
            e.stopPropagation();
            setTransferPatient(p);
          },
          "aria-label": `${D_R.isParked(p) ? "เลือกเตียง" : "ย้ายเตียง"} ${p.name || p.initials || ""}`.trim()
        },
        "⇄ ",
        D_R.isParked(p) ? "เลือกเตียง" : "ย้ายเตียง"
      ), /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: (e) => {
        e.stopPropagation();
        setEditPatient(p);
      } }, "Edit"), /* @__PURE__ */ React.createElement("button", { className: "btn sm primary", onClick: (e) => {
        e.stopPropagation();
        onSelect(p.sessionId);
      } }, "Open ", /* @__PURE__ */ React.createElement(Icon, { name: "arrow", size: 11, color: "#fff" })))
    );
  }), activeSorted.length === 0 && /* @__PURE__ */ React.createElement("div", { style: { padding: "48px 16px", textAlign: "center", color: "var(--ink-3)", fontSize: 13 } }, q ? miss : `ยังไม่มีผู้ป่วยใน ${ward === "other" ? "กลุ่มนี้" : ward}`), archivedSorted.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8 } }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn",
      style: { width: "100%", justifyContent: "center", color: "var(--ink-3)", fontSize: 12 },
      onClick: () => setShowArchived((s) => !s)
    },
    showArchived ? "▲" : "▼",
    " Discharged / Transferred / Expired (",
    archivedSorted.length,
    ")"
  ), showArchived && archivedSorted.map((p) => /* @__PURE__ */ React.createElement(
    "div",
    {
      key: p.sessionId,
      className: "patient-mc",
      style: { opacity: 0.55 },
      onClick: () => onSelect(p.sessionId)
    },
    /* @__PURE__ */ React.createElement("div", { className: "pmc-row pmc-head" }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, /* @__PURE__ */ React.createElement("span", { className: "pmc-name" }, p.name || p.initials || "—"), p.twinSuffix && /* @__PURE__ */ React.createElement("span", { className: "pmc-twin chip", style: { fontSize: 11, fontWeight: 700 } }, multiplesLabel(p)), /* @__PURE__ */ React.createElement(BedChip, { p })), /* @__PURE__ */ React.createElement("span", { className: "chip" }, /* @__PURE__ */ React.createElement("span", { className: "d" }), p.status)),
    /* @__PURE__ */ React.createElement("div", { className: "pmc-row" }, /* @__PURE__ */ React.createElement("span", { className: "pmc-meta" }, /* @__PURE__ */ React.createElement("span", { className: "num" }, D_R.fmtGA(p.ga)), " wk · ", /* @__PURE__ */ React.createElement("span", { className: "num" }, p.bw.toLocaleString()), " g")),
    p.diagnosis && /* @__PURE__ */ React.createElement("div", { className: "pmc-diagnosis" }, p.diagnosis)
  )))), /* @__PURE__ */ React.createElement("div", { className: "card patient-table" }, /* @__PURE__ */ React.createElement("table", { className: "tbl", style: { tableLayout: "fixed", width: "100%" } }, /* @__PURE__ */ React.createElement("colgroup", null, /* @__PURE__ */ React.createElement("col", { style: { width: 90 } }), /* @__PURE__ */ React.createElement("col", { style: { width: 68 } }), /* @__PURE__ */ React.createElement("col", { style: { width: 62 } }), /* @__PURE__ */ React.createElement("col", { style: { width: 62 } }), /* @__PURE__ */ React.createElement("col", { style: { width: 68 } }), /* @__PURE__ */ React.createElement("col", null), /* @__PURE__ */ React.createElement("col", { style: { width: 48 } }), /* @__PURE__ */ React.createElement("col", { style: { width: 78 } }), /* @__PURE__ */ React.createElement("col", { style: { width: 108 } }), /* @__PURE__ */ React.createElement("col", { style: { width: 118 } }), /* @__PURE__ */ React.createElement("col", { style: { width: 150 } })), /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Bed"), /* @__PURE__ */ React.createElement("th", null, "Name"), /* @__PURE__ */ React.createElement("th", null, "GA"), /* @__PURE__ */ React.createElement("th", null, "PCA"), /* @__PURE__ */ React.createElement("th", null, "BW (g)"), /* @__PURE__ */ React.createElement("th", null, "Diagnosis"), /* @__PURE__ */ React.createElement("th", null, "DOL"), /* @__PURE__ */ React.createElement("th", null, "Wt now"), /* @__PURE__ */ React.createElement("th", null, "Δ birth"), /* @__PURE__ */ React.createElement("th", null, "Status"), /* @__PURE__ */ React.createElement("th", null))), /* @__PURE__ */ React.createElement("tbody", null, activeSorted.map((p) => {
    const last = D_R.currentWeight(p, log[p.sessionId]) || null;
    const dol = D_R.liveDol(p);
    const delta = last ? last.w - p.bw : 0;
    const deltaPct = delta / p.bw * 100;
    const entries = D_R.finalEntries(log[p.sessionId]);
    const lastEntry = entries[entries.length - 1];
    const hasToday = loggedSet.has(p.sessionId);
    const draftToday = !hasToday && D_R.hasDraftOnDate(log[p.sessionId], today);
    const isSelected = p.sessionId === activeId;
    return /* @__PURE__ */ React.createElement(
      "tr",
      {
        key: p.sessionId,
        className: isSelected ? "p-active" : "",
        style: { cursor: "pointer" },
        onClick: () => onSelect(p.sessionId),
        tabIndex: 0,
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(p.sessionId);
          }
        }
      },
      /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(BedChip, { p })),
      /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, fontSize: 14 } }, p.name || p.initials || "—"), p.twinSuffix && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--ink-3)" } }, multiplesLabel(p))),
      /* @__PURE__ */ React.createElement("td", { className: "num", style: { fontWeight: 600, color: "var(--brand-2)" } }, D_R.fmtGA(p.ga)),
      /* @__PURE__ */ React.createElement("td", { className: "num", style: { fontWeight: 600, color: "var(--ok)" } }, D_R.fmtGA(D_R.pmaShort(p.ga, dol))),
      /* @__PURE__ */ React.createElement("td", { className: "num" }, p.bw.toLocaleString()),
      /* @__PURE__ */ React.createElement("td", { style: { color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, p.diagnosis),
      /* @__PURE__ */ React.createElement("td", { className: "num", style: { fontWeight: 700, color: "var(--brand-2)", fontSize: 15 } }, dol),
      /* @__PURE__ */ React.createElement("td", { className: "num" }, last ? `${last.w.toLocaleString()} g` : "—"),
      /* @__PURE__ */ React.createElement("td", { className: "num", style: { color: !last ? "var(--ink-3)" : deltaPct < -10 ? "var(--crit)" : deltaPct < 0 ? "var(--warn-ink)" : "var(--ok)", fontWeight: 600 } }, last ? /* @__PURE__ */ React.createElement(React.Fragment, null, delta >= 0 ? "+" : "", delta, " g", /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 400, color: "var(--ink-3)", fontSize: 11, marginLeft: 3 } }, "(", D_R.displayNum(deltaPct, 1), "%)")) : "—"),
      /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--ok)", fontWeight: 600 } }, /* @__PURE__ */ React.createElement("span", { style: { width: 7, height: 7, borderRadius: "50%", background: "var(--ok)", flexShrink: 0 } }), "Active"), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 3 } }, /* @__PURE__ */ React.createElement(
        "span",
        {
          className: "log-badge" + (hasToday ? " is-logged" : draftToday ? " is-draft" : ""),
          title: hasToday ? "บันทึกวันนี้แล้ว" : draftToday ? "บันทึกร่างไว้ — กรอกให้ครบแล้ว Submit" : lastEntry ? `บันทึกล่าสุด DOL ${D_R.entryDol(p, lastEntry)}` : "ยังไม่มีบันทึก"
        },
        hasToday ? "✓ LOGGED" : draftToday ? "DRAFT" : "NEEDS ENTRY"
      ))),
      /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "nowrap" } }, /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "btn sm",
          title: "ย้ายเตียง",
          onClick: (e) => {
            e.stopPropagation();
            setTransferPatient(p);
          },
          style: { padding: "0 8px", fontSize: 13 }
        },
        "⇄"
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "btn sm",
          style: { padding: "0 8px" },
          onClick: (e) => {
            e.stopPropagation();
            setEditPatient(p);
          }
        },
        "Edit"
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "btn sm",
          style: {
            padding: "0 8px",
            background: "var(--brand)",
            color: "#fff",
            borderColor: "var(--brand-2)"
          },
          onClick: (e) => {
            e.stopPropagation();
            onSelect(p.sessionId);
          }
        },
        "Open ",
        /* @__PURE__ */ React.createElement(Icon, { name: "arrow", size: 11, color: "#fff" })
      )))
    );
  }), archivedSorted.length > 0 && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 11, style: { padding: "6px 12px", background: "var(--bg-2)", borderTop: "2px solid var(--line)" } }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn sm",
      style: { color: "var(--ink-3)", fontSize: 11 },
      onClick: (e) => {
        e.stopPropagation();
        setShowArchived((s) => !s);
      }
    },
    showArchived ? "▲" : "▼",
    " Discharged / Transferred / Expired (",
    archivedSorted.length,
    ")"
  ))), showArchived && archivedSorted.map((p) => /* @__PURE__ */ React.createElement(
    "tr",
    {
      key: p.sessionId,
      style: { opacity: 0.5, cursor: "pointer" },
      onClick: () => onSelect(p.sessionId)
    },
    /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(BedChip, { p })),
    /* @__PURE__ */ React.createElement("td", { style: { fontWeight: 600, fontSize: 13 } }, p.name || p.initials || "—"),
    /* @__PURE__ */ React.createElement("td", { className: "num" }, D_R.fmtGA(p.ga)),
    /* @__PURE__ */ React.createElement("td", { className: "num" }, D_R.fmtGA(D_R.pmaShort(p.ga, D_R.liveDol(p)))),
    /* @__PURE__ */ React.createElement("td", { className: "num" }, p.bw.toLocaleString()),
    /* @__PURE__ */ React.createElement("td", { style: { color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, p.diagnosis),
    /* @__PURE__ */ React.createElement("td", { colSpan: 3 }),
    /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { className: "chip" }, /* @__PURE__ */ React.createElement("span", { className: "d" }), p.status)),
    /* @__PURE__ */ React.createElement("td", { style: { display: "flex", gap: 4, justifyContent: "flex-end" } }, /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: (e) => {
      e.stopPropagation();
      setEditPatient(p);
    } }, "Edit"))
  )))), (q ? activeSorted.length === 0 : sorted.length === 0) && /* @__PURE__ */ React.createElement("div", { style: { padding: "48px 24px", textAlign: "center", color: "var(--ink-3)", fontSize: 13 } }, q ? miss : `ยังไม่มีผู้ป่วยใน ${ward === "other" ? "กลุ่มนี้" : ward} — กด New session เพื่อเริ่มต้น`)), showAdd && /* @__PURE__ */ React.createElement(NewPatientModal, { patients, onClose: () => setShowAdd(false), onSubmit: (p) => onAdd(p) }), editPatient && /* @__PURE__ */ React.createElement(
    EditPatientModal,
    {
      patient: editPatient,
      patients,
      onClose: () => setEditPatient(null),
      onSubmit: (p, base) => onEdit?.(p, base),
      mergeBaseFor,
      onDelete
    }
  ), transferPatient && /* @__PURE__ */ React.createElement(
    TransferBedModal,
    {
      patient: transferPatient,
      patients,
      onClose: () => setTransferPatient(null),
      onSubmit: (p, base) => onEdit?.(p, base),
      mergeBaseFor
    }
  ));
}
const GA_WEEK_OPTIONS = Array.from({ length: 22 }, (_, i) => 22 + i);
function BedSelect({ value, onChange, allowUnassigned = false, style, occupancy }) {
  const current = D_R.normalizeBed(value);
  const isKnown = current === "" || D_R.BED_OPTIONS.includes(current);
  const takenBy = (b) => occupancy?.get(b);
  return /* @__PURE__ */ React.createElement(
    "select",
    {
      className: "sel",
      style,
      value: current,
      onChange: (e) => onChange(e.target.value)
    },
    (allowUnassigned || current === "") && /* @__PURE__ */ React.createElement("option", { value: "" }, "— ยังไม่ระบุเตียง —"),
    D_R.BED_OPTIONS.map((b) => {
      const holder = takenBy(b);
      return /* @__PURE__ */ React.createElement("option", { key: b, value: b, disabled: !!holder }, holder ? `${b} · ไม่ว่าง (${holder.name || holder.sessionId})` : b);
    }),
    !isKnown && /* @__PURE__ */ React.createElement("option", { value: current }, current, " (ไม่อยู่ในรายการเตียง)")
  );
}
const bedTakenMsg = (bed, holder) => `เตียง ${bed} มี ${holder.name || holder.sessionId} อยู่แล้ว — ต้องย้าย ${holder.name || holder.sessionId} ออกก่อน (Transfer) จึงจะบันทึกเตียงนี้ได้`;
function useModalSubmit(onSubmit, onClose) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const busyRef = React.useRef(false);
  const mountedRef = React.useRef(true);
  React.useEffect(() => () => {
    mountedRef.current = false;
  }, []);
  const fallback = "บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง";
  const finish = (res) => {
    busyRef.current = false;
    if (!mountedRef.current) return;
    setBusy(false);
    if (res && res.ok === false) {
      setError(res.error || fallback);
      return;
    }
    onClose();
  };
  const submit = (payload, extra) => {
    if (busyRef.current) return;
    setError("");
    let out;
    try {
      out = onSubmit(payload, extra);
    } catch (e) {
      setError(e && e.message || fallback);
      return;
    }
    if (!out || typeof out.then !== "function") {
      finish(out);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    out.then(finish, (e) => finish({ ok: false, error: e && e.message || fallback }));
  };
  return { busy, error, submit };
}
function AdmitDateIssue({ issue, correction, onFix }) {
  if (!issue) return null;
  const canFix = issue.code === "buddhistEra" && correction && onFix;
  return /* @__PURE__ */ React.createElement("div", { style: { marginTop: 4, fontSize: 11, color: "var(--crit)", lineHeight: 1.45 } }, issue.message, canFix && /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "btn sm",
      style: { marginLeft: 8, fontSize: 11 },
      onClick: () => onFix(correction)
    },
    "ใช้ ",
    correction
  ));
}
function useMergeBase(mergeBaseFor, sessionId) {
  const ref = React.useRef(void 0);
  if (ref.current === void 0) ref.current = mergeBaseFor ? mergeBaseFor(sessionId) ?? null : void 0;
  return ref.current;
}
function SubmitError({ error }) {
  if (!error) return null;
  return /* @__PURE__ */ React.createElement("div", { role: "alert", className: "modal-submit-error", style: {
    padding: "8px 12px",
    background: "var(--crit-bg)",
    border: "1px solid var(--crit-line)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--crit)",
    lineHeight: 1.5
  } }, error);
}
const NAME_TITLE_PARTS = ["ดช", "ดญ", "นส"];
function NameFields({ value, onChange }) {
  const { first, last, foreign } = value;
  const [wrongScript, setWrongScript] = React.useState({ first: false, last: false });
  const type = (key) => (e) => {
    const raw = e.target.value;
    setWrongScript((s) => ({ ...s, [key]: (foreign ? /[\u0E00-\u0E7F]/ : /[A-Za-z]/).test(raw) }));
    onChange({ ...value, [key]: D_R.namePart(raw, foreign) });
  };
  const note = (key, part) => wrongScript[key] ? foreign ? "ติ๊ก “ชาวต่างชาติ” ไว้ — พิมพ์เป็นภาษาอังกฤษ" : "พิมพ์เป็นภาษาไทย (ชาวต่างชาติ: ติ๊กช่องด้านล่าง)" : !foreign && NAME_TITLE_PARTS.includes(part) ? "ไม่ต้องใส่คำนำหน้า (ด.ช. / ด.ญ. / น.ส.)" : "";
  const box = (key, label, example) => {
    const part = value[key];
    const says = note(key, part);
    return /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, label, " ", /* @__PURE__ */ React.createElement("span", { className: "unit" }, "(2 ตัวแรก)")), /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "inp",
        lang: foreign ? "en" : "th",
        value: part,
        placeholder: example,
        autoComplete: "off",
        autoCorrect: "off",
        autoCapitalize: foreign ? "words" : "off",
        spellCheck: false,
        onChange: type(key)
      }
    ), says && /* @__PURE__ */ React.createElement("div", { className: "name-note" }, says));
  };
  return /* @__PURE__ */ React.createElement("div", { className: "name-fields" }, /* @__PURE__ */ React.createElement("div", { className: "row-2 pair-row" }, box("first", "ชื่อ", foreign ? "เช่น John → Jo" : "เช่น สมศรี → สม"), box("last", "นามสกุล", foreign ? "เช่น Smith → Sm" : "เช่น ใจดี → ใจ")), /* @__PURE__ */ React.createElement("label", { className: "name-foreign" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: foreign, onChange: (e) => {
    setWrongScript({ first: false, last: false });
    onChange({ first: "", last: "", foreign: e.target.checked });
  } }), "ชาวต่างชาติ — ใช้ชื่อภาษาอังกฤษ"));
}
function NewPatientModal({ patients, onClose, onSubmit }) {
  const today = D_R.todayLocal();
  const [nameIn, setNameIn] = React.useState({ first: "", last: "", foreign: false });
  const nameOk = D_R.nameComplete(nameIn.first, nameIn.last, nameIn.foreign);
  const name = nameOk ? D_R.composePatientName(nameIn.first, nameIn.last, nameIn.foreign) : "";
  const [bw, setBw] = React.useState(0);
  const [gaW, setGaW] = React.useState("");
  const [gaD, setGaD] = React.useState("");
  const [hc, setHc] = React.useState(0);
  const [len, setLen] = React.useState(0);
  const [twin, setTwin] = React.useState("");
  const [multiplesCount, setMultiplesCount] = React.useState("");
  const [sex, setSex] = React.useState("");
  const [bed, setBed] = React.useState(() => D_R.nextFreeBed(patients, "NICU"));
  const occupancy = React.useMemo(() => D_R.bedOccupancy(patients), [patients]);
  const bedTaken = occupancy.get(D_R.normalizeBed(bed)) || null;
  const [dx, setDx] = React.useState("");
  const [admitDate, setAdmitDate] = React.useState(today);
  const [admitDol, setAdmitDol] = React.useState(1);
  const admitIssue = D_R.admissionDateIssue(admitDate, today);
  const admitCE = D_R.toChristianEraDateStr(admitDate, today);
  const ga = gaW !== "" ? parseInt(gaW) + parseInt(gaD || 0) / 10 : 0;
  const initials = nameOk ? D_R.nameInitials(nameIn.first, nameIn.last) : "";
  const sessionId = `${initials || "XX"}-BW${bw}${twin ? "-" + twin : ""}`;
  const canSubmit = nameOk && bw > 0 && gaW !== "" && sex !== "" && !bedTaken && !admitIssue;
  const { busy, error: submitError, submit } = useModalSubmit(onSubmit, onClose);
  const dob = React.useMemo(() => {
    if (!admitDate) return today;
    return D_R.addDaysToDateStr(admitDate, -(Math.max(1, parseInt(admitDol) || 1) - 1));
  }, [admitDate, admitDol]);
  return /* @__PURE__ */ React.createElement("div", { className: "picker-backdrop", onClick: onClose }, /* @__PURE__ */ React.createElement("div", { className: "picker", style: { width: 560 }, onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "picker-h", style: { display: "flex", justifyContent: "space-between" } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, fontSize: 15 } }, "Register new session"), /* @__PURE__ */ React.createElement("button", { className: "icon-btn", onClick: onClose }, /* @__PURE__ */ React.createElement(Icon, { name: "x", size: 14 }))), /* @__PURE__ */ React.createElement("div", { style: { padding: 18 } }, /* @__PURE__ */ React.createElement(NameFields, { value: nameIn, onChange: setNameIn }), /* @__PURE__ */ React.createElement("div", { style: { height: 10 } }), /* @__PURE__ */ React.createElement("div", { className: "row-2 pair-row" }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "Multiples ", /* @__PURE__ */ React.createElement("span", { className: "unit" }, "(optional)")), /* @__PURE__ */ React.createElement("select", { className: "sel", value: twin, onChange: (e) => {
    setTwin(e.target.value);
    if (!e.target.value) setMultiplesCount("");
  } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "—"), /* @__PURE__ */ React.createElement("option", { value: "A" }, "A"), /* @__PURE__ */ React.createElement("option", { value: "B" }, "B"), /* @__PURE__ */ React.createElement("option", { value: "C" }, "C"), /* @__PURE__ */ React.createElement("option", { value: "D" }, "D"))), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "How many ", /* @__PURE__ */ React.createElement("span", { className: "unit" }, "(twin/triplet/quad)")), /* @__PURE__ */ React.createElement("select", { className: "sel", value: multiplesCount, disabled: !twin, onChange: (e) => setMultiplesCount(e.target.value) }, /* @__PURE__ */ React.createElement("option", { value: "" }, "—"), /* @__PURE__ */ React.createElement("option", { value: "2" }, "2 · Twin"), /* @__PURE__ */ React.createElement("option", { value: "3" }, "3 · Triplet"), /* @__PURE__ */ React.createElement("option", { value: "4" }, "4 · Quadruplet")))), /* @__PURE__ */ React.createElement("div", { style: { height: 10 } }), /* @__PURE__ */ React.createElement("div", { className: "row-3" }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "Birth weight ", /* @__PURE__ */ React.createElement("span", { className: "unit" }, "(g)")), /* @__PURE__ */ React.createElement("input", { type: "number", min: "0", className: "inp", value: bw || "", onChange: (e) => setBw(Math.max(0, parseInt(e.target.value) || 0)), placeholder: "0" })), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "GA ", /* @__PURE__ */ React.createElement("span", { className: "unit" }, "(weeks + days)")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("select", { className: "sel", value: gaW, onChange: (e) => setGaW(e.target.value), style: { flex: 1 } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "wk"), GA_WEEK_OPTIONS.map((w) => /* @__PURE__ */ React.createElement("option", { key: w, value: w }, w))), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--ink-3)", fontWeight: 500 } }, "+"), /* @__PURE__ */ React.createElement("select", { className: "sel", value: gaD, onChange: (e) => setGaD(e.target.value), style: { width: 68 } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "d"), [0, 1, 2, 3, 4, 5, 6].map((d) => /* @__PURE__ */ React.createElement("option", { key: d, value: d }, d))))), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "Sex"), /* @__PURE__ */ React.createElement("select", { className: "sel", value: sex, onChange: (e) => setSex(e.target.value) }, sex === "" && /* @__PURE__ */ React.createElement("option", { value: "" }, "— เลือก —"), /* @__PURE__ */ React.createElement("option", { value: "boys" }, "Male"), /* @__PURE__ */ React.createElement("option", { value: "girls" }, "Female")))), /* @__PURE__ */ React.createElement("div", { style: { height: 10 } }), /* @__PURE__ */ React.createElement("div", { className: "row-2" }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "Admit date"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "date",
      className: "inp",
      max: today,
      min: D_R.ADMIT_DATE_MIN,
      value: admitDate,
      onChange: (e) => setAdmitDate(e.target.value)
    }
  ), /* @__PURE__ */ React.createElement(AdmitDateIssue, { issue: admitIssue, correction: admitCE, onFix: setAdmitDate })), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "DOL at admit"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      className: "inp",
      min: 1,
      style: { flex: 1 },
      value: admitDol,
      onChange: (e) => {
        const v = e.target.value;
        setAdmitDol(v === "" ? "" : Math.max(1, parseInt(v, 10) || 1));
      }
    }
  ), admitDol > 1 && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" } }, "DOB: ", dob)))), /* @__PURE__ */ React.createElement("div", { style: { height: 10 } }), /* @__PURE__ */ React.createElement("div", { className: "row-2" }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "Length at birth ", /* @__PURE__ */ React.createElement("span", { className: "unit" }, "(cm)")), /* @__PURE__ */ React.createElement("input", { type: "number", min: "0", className: "inp", step: 0.1, value: len || "", onChange: (e) => setLen(Math.max(0, parseFloat(e.target.value) || 0)), placeholder: "0" })), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "HC at birth ", /* @__PURE__ */ React.createElement("span", { className: "unit" }, "(cm)")), /* @__PURE__ */ React.createElement("input", { type: "number", min: "0", className: "inp", step: 0.1, value: hc || "", onChange: (e) => setHc(Math.max(0, parseFloat(e.target.value) || 0)), placeholder: "0" }))), /* @__PURE__ */ React.createElement("div", { style: { height: 10 } }), /* @__PURE__ */ React.createElement("div", { className: "row-2" }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "Bed"), /* @__PURE__ */ React.createElement(BedSelect, { value: bed, onChange: setBed, allowUnassigned: true, occupancy }), bedTaken && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--crit)", marginTop: 4 } }, bedTakenMsg(D_R.normalizeBed(bed), bedTaken))), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "Diagnosis"), /* @__PURE__ */ React.createElement("input", { className: "inp", value: dx, onChange: (e) => setDx(e.target.value), placeholder: "ELBW · RDS …" }))), submitError && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 14 } }, /* @__PURE__ */ React.createElement(SubmitError, { error: submitError })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 20 } }, !canSubmit && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11.5, color: "var(--ink-3)", marginRight: "auto" } }, bedTaken ? "เลือกเตียงที่ว่างก่อนลงทะเบียน" : admitIssue ? "แก้วันที่รับเข้าก่อนลงทะเบียน — ทุกเป้าหมายสารอาหารคิดจากวันนี้" : !nameOk ? "กรอกชื่อ + นามสกุล อย่างละ 2 ตัวก่อนลงทะเบียน" : "กรอกน้ำหนักแรกเกิด · GA · เพศ ให้ครบก่อนลงทะเบียน"), /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: onClose }, "Cancel"), /* @__PURE__ */ React.createElement("button", { className: "btn primary", disabled: !canSubmit || busy, onClick: () => submit({
    sessionId,
    name,
    initials,
    bw,
    ga,
    twinSuffix: twin,
    multiplesCount: twin ? parseInt(multiplesCount) || 0 : 0,
    sex,
    currentBed: D_R.normalizeBed(bed),
    diagnosis: dx,
    status: "Active",
    admissionDate: admitDate,
    dob,
    // Birth weight, length and HC are the DAY OF BIRTH's, so they are
    // filed on DOL 1 — not on the admission DOL, where an outborn
    // infant's birth point used to sit at the admission PMA on the
    // growth chart and outrank the admission-day order's weight
    // (2026-09-24). DOL comes from `dob`, never from this row.
    weights: [{ dol: 1, w: bw, l: len || null, hc: hc || null }]
  }) }, /* @__PURE__ */ React.createElement(Icon, { name: "save", size: 14, color: "#fff" }), " ", busy ? "กำลังบันทึก…" : "Register")))));
}
function PatientPicker({ patients, activeId, onSelect, onClose }) {
  const [q, setQ] = React.useState("");
  const byBed = [...patients].sort(bedSort);
  const filtered = q.trim() ? D_R.searchPatients(byBed, q).hits : byBed;
  React.useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  return /* @__PURE__ */ React.createElement("div", { className: "picker-backdrop", onClick: onClose }, /* @__PURE__ */ React.createElement("div", { className: "picker", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "picker-h" }, /* @__PURE__ */ React.createElement(Icon, { name: "search", size: 16, color: "var(--ink-3)" }), /* @__PURE__ */ React.createElement(
    "input",
    {
      placeholder: "ค้นหา ชื่อ หรือ นามสกุล · เลขเตียง",
      value: q,
      onChange: (e) => setQ(e.target.value),
      autoFocus: true,
      lang: "th",
      enterKeyHint: "search",
      autoComplete: "off",
      autoCorrect: "off",
      autoCapitalize: "off",
      spellCheck: false
    }
  ), /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: onClose }, "Close")), /* @__PURE__ */ React.createElement("div", { style: { padding: "6px 0", maxHeight: 480, overflowY: "auto" } }, filtered.map((p) => /* @__PURE__ */ React.createElement(
    "div",
    {
      key: p.sessionId,
      className: "picker-row",
      onClick: () => {
        onSelect(p.sessionId);
        onClose();
      },
      style: {
        display: "grid",
        gridTemplateColumns: "84px 96px 64px 76px 1fr",
        gap: 10,
        alignItems: "center",
        padding: "10px 18px",
        cursor: "pointer",
        background: p.sessionId === activeId ? "var(--brand-bg)" : void 0,
        borderBottom: "1px solid var(--line-2)"
      },
      onMouseEnter: (e) => {
        if (p.sessionId !== activeId) e.currentTarget.style.background = "var(--bg-2)";
      },
      onMouseLeave: (e) => {
        if (p.sessionId !== activeId) e.currentTarget.style.background = "";
      }
    },
    /* @__PURE__ */ React.createElement(BedChip, { p, style: { justifySelf: "start" } }),
    /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, fontSize: 14 } }, p.name || p.initials || "—"), p.twinSuffix && /* @__PURE__ */ React.createElement("span", { style: { display: "block", fontSize: 10.5, color: "var(--ink-3)" } }, multiplesLabel(p))),
    /* @__PURE__ */ React.createElement("span", { className: "mono", style: { fontSize: 12, color: "var(--brand-2)", fontWeight: 600 } }, D_R.fmtGA(p.ga)),
    /* @__PURE__ */ React.createElement("span", { className: "mono", style: { fontSize: 12, color: "var(--ink-2)" } }, p.bw.toLocaleString(), "g"),
    /* @__PURE__ */ React.createElement("span", { style: { color: "var(--ink-3)", fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, p.diagnosis || "—")
  )), filtered.length === 0 && /* @__PURE__ */ React.createElement("div", { style: { padding: "32px 18px", textAlign: "center", color: "var(--ink-3)", fontSize: 13 } }, "ไม่พบผู้ป่วย"))));
}
function EditPatientModal({ patient, patients, onClose, onSubmit, onDelete, mergeBaseFor }) {
  const today = D_R.todayLocal();
  const storedName = D_R.splitPatientName(patient.name);
  const oldName = storedName ? "" : patient.name || patient.initials || "";
  const [nameIn, setNameIn] = React.useState(storedName ? { first: storedName.first, last: storedName.last, foreign: storedName.foreign } : { first: "", last: "", foreign: false });
  const nameOk = D_R.nameComplete(nameIn.first, nameIn.last, nameIn.foreign);
  const nameKept = !storedName && !nameIn.first && !nameIn.last;
  const nameMissing = !nameOk && !nameKept;
  const [bw, setBw] = React.useState(patient.bw || 0);
  const gaTd = D_R.gaTotalDays(patient.ga);
  const gaStoredW = Math.floor(gaTd / 7);
  const gaInRange = GA_WEEK_OPTIONS.includes(gaStoredW);
  const [gaW, setGaW] = React.useState(gaInRange ? String(gaStoredW) : "");
  const [gaD, setGaD] = React.useState(gaInRange ? String(gaTd % 7) : "");
  const sexKnown = patient.sex === "boys" || patient.sex === "girls";
  const [sex, setSex] = React.useState(sexKnown ? patient.sex : "");
  const [bed, setBed] = React.useState(D_R.normalizeBed(patient.currentBed));
  const occupancy = React.useMemo(
    () => D_R.bedOccupancy(patients, patient.sessionId),
    [patients, patient.sessionId]
  );
  const [dx, setDx] = React.useState(patient.diagnosis || "");
  const [status, setStatus] = React.useState(patient.status || "Active");
  const bedTaken = D_R.bedBlocker(patients, { sessionId: patient.sessionId, status, currentBed: bed });
  const initialDol1 = D_R.admissionDol(patient);
  const [dol1, setDol1] = React.useState(initialDol1);
  const [admitDate, setAdmitDate] = React.useState(patient.admissionDate || "");
  const admitIssue = D_R.admissionDateIssue(admitDate, today);
  const admitCE = D_R.toChristianEraDateStr(admitDate, today);
  const mergeBase = useMergeBase(mergeBaseFor, patient.sessionId);
  const dob = React.useMemo(() => {
    if (!admitDate || admitIssue) return patient.dob || "";
    return D_R.addDaysToDateStr(admitDate, -(Math.max(1, parseInt(dol1, 10) || 1) - 1));
  }, [admitDate, dol1, admitIssue, patient.dob]);
  const dol1Missing = String(dol1).trim() === "";
  const growth = React.useMemo(() => {
    const shift = D_R.anchorShiftDays(patient, { ...patient, admissionDate: admitDate, dob });
    const dolAfter = dol1Missing ? initialDol1 : Math.max(1, parseInt(dol1, 10) || 1);
    const moved = {};
    let conflict = null;
    for (const k of ["weights", "lengths", "hcs"]) {
      if (!Array.isArray(patient[k])) continue;
      const r = D_R.moveGrowthRows(patient[k], shift, initialDol1, dolAfter);
      moved[k] = r.rows;
      if (r.conflict && !conflict) conflict = r.conflict;
    }
    return { shift, dolAfter, moved, conflict };
  }, [patient, admitDate, dob, dol1, dol1Missing, initialDol1]);
  const ga = gaW !== "" ? parseInt(gaW, 10) + parseInt(gaD || 0, 10) / 10 : 0;
  const canSave = bw > 0 && gaW !== "" && sex !== "" && !nameMissing && !bedTaken && !admitIssue && !dol1Missing && !growth.conflict;
  const { busy, error: submitError, submit } = useModalSubmit(onSubmit, onClose);
  const handleDelete = () => {
    if (!onDelete) return;
    const label = patient.name || patient.sessionId;
    if (!window.confirm(
      `ลบ session ${label} ถาวรใช่หรือไม่? ข้อมูลผู้ป่วยและบันทึกประจำวันทั้งหมดของ session นี้จะถูกลบออกจากระบบ — การลบนี้ไม่สามารถย้อนกลับได้`
    )) return;
    onDelete(patient);
    onClose();
  };
  const save = () => {
    const prevStatus = patient.status || "Active";
    const statusDate = status === "Active" ? prevStatus === "Active" && !patient.statusDate ? patient.statusDate ?? null : null : status !== prevStatus || !patient.statusDate ? today : patient.statusDate;
    const bwChanged = Number(bw) !== Number(patient.bw);
    const seeded = (patient.weights || []).map((w, i) => i === 0 && w && bwChanged && Number(w.w) === Number(patient.bw) ? { ...w, w: Number(bw) } : w);
    const weights = D_R.moveGrowthRows(seeded, growth.shift, initialDol1, growth.dolAfter).rows;
    const named = nameOk ? {
      name: D_R.composePatientName(nameIn.first, nameIn.last, nameIn.foreign),
      initials: D_R.nameInitials(nameIn.first, nameIn.last)
    } : {};
    submit({
      ...patient,
      ...named,
      bw: Number(bw),
      ga,
      sex,
      currentBed: D_R.normalizeBed(bed),
      diagnosis: dx,
      status,
      statusDate,
      admissionDate: admitDate,
      dob,
      weights,
      ..."lengths" in growth.moved ? { lengths: growth.moved.lengths } : {},
      ..."hcs" in growth.moved ? { hcs: growth.moved.hcs } : {}
    }, mergeBase);
  };
  return /* @__PURE__ */ React.createElement("div", { className: "picker-backdrop", onClick: onClose }, /* @__PURE__ */ React.createElement("div", { className: "picker", style: { width: 560 }, onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "picker-h", style: { justifyContent: "space-between" } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, fontSize: 15 } }, "Edit session · ", patient.sessionId), /* @__PURE__ */ React.createElement("button", { className: "icon-btn", onClick: onClose }, /* @__PURE__ */ React.createElement(Icon, { name: "x", size: 14 }))), /* @__PURE__ */ React.createElement("div", { style: { padding: 18, display: "flex", flexDirection: "column", gap: 12 } }, /* @__PURE__ */ React.createElement("div", { className: "row-3" }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "Birth weight ", /* @__PURE__ */ React.createElement("span", { className: "unit" }, "(g)")), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "0",
      className: "inp",
      value: bw || "",
      onChange: (e) => setBw(Math.max(0, parseInt(e.target.value, 10) || 0)),
      placeholder: "0"
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "GA ", /* @__PURE__ */ React.createElement("span", { className: "unit" }, "(weeks + days)")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("select", { className: "sel", value: gaW, onChange: (e) => setGaW(e.target.value), style: { flex: 1 } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "wk"), GA_WEEK_OPTIONS.map((w) => /* @__PURE__ */ React.createElement("option", { key: w, value: w }, w))), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--ink-3)", fontWeight: 500 } }, "+"), /* @__PURE__ */ React.createElement("select", { className: "sel", value: gaD, onChange: (e) => setGaD(e.target.value), style: { width: 64 } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "d"), [0, 1, 2, 3, 4, 5, 6].map((d) => /* @__PURE__ */ React.createElement("option", { key: d, value: d }, d))))), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "Sex"), /* @__PURE__ */ React.createElement("select", { className: "sel", value: sex, onChange: (e) => setSex(e.target.value) }, sex === "" && /* @__PURE__ */ React.createElement("option", { value: "" }, "— เลือก —"), /* @__PURE__ */ React.createElement("option", { value: "boys" }, "Male"), /* @__PURE__ */ React.createElement("option", { value: "girls" }, "Female")))), !sexKnown && /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 12px", background: "var(--warn-bg)", border: "1px solid var(--warn-line)", borderRadius: 8, fontSize: 11.5, color: "var(--warn-ink)", lineHeight: 1.5 } }, "เพศในทะเบียนของ session นี้ไม่ถูกต้อง", patient.sex ? /* @__PURE__ */ React.createElement(React.Fragment, null, " (", /* @__PURE__ */ React.createElement("strong", null, String(patient.sex)), ")") : null, " — เลือก Male หรือ Female ก่อนจึงจะบันทึกได้ (ใช้เลือกกราฟ Fenton)"), gaTd > 0 && !gaInRange && /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 12px", background: "var(--warn-bg)", border: "1px solid var(--warn-line)", borderRadius: 8, fontSize: 11.5, color: "var(--warn-ink)", lineHeight: 1.5 } }, "GA เดิมของ session นี้ (", /* @__PURE__ */ React.createElement("strong", null, D_R.fmtGA(patient.ga), " wk"), ") อยู่นอกช่วง 22–43 wk ที่ระบบรองรับ — เลือก GA ใหม่ก่อนจึงจะบันทึกได้"), Number(bw) !== Number(patient.bw) && bw > 0 && /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 12px", background: "var(--bg-2)", borderRadius: 8, fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.5 } }, "แก้ BW จาก ", /* @__PURE__ */ React.createElement("strong", null, patient.bw, " g"), " เป็น ", /* @__PURE__ */ React.createElement("strong", null, bw, " g"), " — เป้าหมายสารอาหารและกราฟ Fenton จะคำนวณใหม่ทั้งหมด ส่วนรหัส session ", /* @__PURE__ */ React.createElement("strong", null, patient.sessionId), " ยังคงเดิม (เป็นคีย์ของบันทึกประจำวันทุกรายการ)"), /* @__PURE__ */ React.createElement(NameFields, { value: nameIn, onChange: setNameIn }), oldName && nameKept && /* @__PURE__ */ React.createElement("div", { style: { marginTop: -4, fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.5 } }, "ชื่อเดิม ", /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--ink-2)" } }, oldName), " (แบบเดิม) — เว้นว่างไว้เพื่อใช้ชื่อเดิม หรือกรอกชื่อ + นามสกุลใหม่ อย่างละ 2 ตัว"), /* @__PURE__ */ React.createElement("div", { className: "row-3" }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "DOL แรกรับ"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      className: "inp",
      min: 1,
      value: dol1,
      onChange: (e) => {
        const v = e.target.value;
        setDol1(v === "" ? "" : Math.max(1, parseInt(v, 10) || 1));
      }
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "Admit date"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "date",
      className: "inp",
      max: today,
      min: D_R.ADMIT_DATE_MIN,
      value: admitDate,
      onChange: (e) => setAdmitDate(e.target.value)
    }
  ), /* @__PURE__ */ React.createElement(AdmitDateIssue, { issue: admitIssue, correction: admitCE, onFix: setAdmitDate })), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "Status"), /* @__PURE__ */ React.createElement("select", { className: "sel", value: status, onChange: (e) => setStatus(e.target.value) }, /* @__PURE__ */ React.createElement("option", { value: "Active" }, "Active"), /* @__PURE__ */ React.createElement("option", { value: "Discharged" }, "Discharged"), /* @__PURE__ */ React.createElement("option", { value: "Transferred" }, "Transferred"), /* @__PURE__ */ React.createElement("option", { value: "Expired" }, "Expired")))), /* @__PURE__ */ React.createElement("div", { className: "row-2" }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "Bed"), /* @__PURE__ */ React.createElement(BedSelect, { value: bed, onChange: setBed, allowUnassigned: true, occupancy })), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "Diagnosis"), /* @__PURE__ */ React.createElement("input", { className: "inp", value: dx, onChange: (e) => setDx(e.target.value), placeholder: "ELBW · RDS …" }))), !canSave && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: bedTaken || growth.conflict ? "var(--crit)" : "var(--ink-3)", textAlign: "right" } }, bedTaken ? bedTakenMsg(D_R.normalizeBed(bed), bedTaken) : growth.conflict ? `การแก้วันรับ/DOL แรกรับนี้จะย้ายค่าที่วัดไว้ของ DOL ${growth.conflict.dol} ไป${growth.conflict.to <= 1 ? "อยู่ตรงหรือก่อนวันเกิด" : `ทับ DOL ${growth.conflict.to} ที่มีค่าที่วัดไว้แล้ว`} — ตรวจสอบวันรับและ DOL แรกรับ` : nameMissing ? "กรอกชื่อ + นามสกุลให้ครบ อย่างละ 2 ตัว" : dol1Missing ? "ต้องระบุ DOL แรกรับก่อนบันทึก" : admitIssue ? "แก้วันที่รับเข้าก่อนบันทึก" : sex === "" ? "ต้องระบุเพศก่อนบันทึก" : "ต้องระบุน้ำหนักแรกเกิด · GA ก่อนบันทึก"), /* @__PURE__ */ React.createElement(SubmitError, { error: submitError }), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 8 } }, onDelete && /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn",
      style: { marginRight: "auto", color: "var(--crit)", borderColor: "var(--crit-line)" },
      onClick: handleDelete,
      disabled: busy
    },
    /* @__PURE__ */ React.createElement(Icon, { name: "trash", size: 14, color: "var(--crit)" }),
    " Delete session"
  ), /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: onClose }, "Cancel"), /* @__PURE__ */ React.createElement("button", { className: "btn primary", disabled: !canSave || busy, onClick: save }, /* @__PURE__ */ React.createElement(Icon, { name: "save", size: 14, color: "#fff" }), " ", busy ? "กำลังบันทึก…" : "Save changes")))));
}
function TransferBedModal({ patient, patients, onClose, onSubmit, mergeBaseFor }) {
  const currentBed = D_R.normalizeBed(patient.currentBed);
  const [bed, setBed] = React.useState(currentBed);
  const occupancy = React.useMemo(
    () => D_R.bedOccupancy(patients, patient.sessionId),
    [patients, patient.sessionId]
  );
  const bedTaken = occupancy.get(D_R.normalizeBed(bed)) || null;
  const { busy, error: submitError, submit } = useModalSubmit(onSubmit, onClose);
  const mergeBase = useMergeBase(mergeBaseFor, patient.sessionId);
  const WARDS = ["NICU", "iso", "SCN"];
  const nextFree = React.useMemo(() => {
    const out = {};
    WARDS.forEach((w) => {
      out[w] = D_R.nextFreeBed(patients, w, patient.sessionId);
    });
    return out;
  }, [patients, patient.sessionId]);
  const save = () => {
    const next = D_R.normalizeBed(bed);
    if (!next || next === currentBed) {
      onClose();
      return;
    }
    const holder = occupancy.get(next);
    if (holder) {
      window.alert(bedTakenMsg(next, holder));
      return;
    }
    const bedHistory = currentBed ? [...patient.bedHistory || [], { bed: currentBed, date: D_R.todayLocal() }] : patient.bedHistory || [];
    submit({ ...patient, currentBed: next, bedHistory }, mergeBase);
  };
  const park = () => {
    if (!currentBed) {
      onClose();
      return;
    }
    const bedHistory = [...patient.bedHistory || [], { bed: currentBed, date: D_R.todayLocal() }];
    submit({ ...patient, currentBed: "", bedHistory }, mergeBase);
  };
  return /* @__PURE__ */ React.createElement("div", { className: "picker-backdrop", onClick: onClose }, /* @__PURE__ */ React.createElement("div", { className: "picker", style: { width: 400 }, onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "picker-h", style: { justifyContent: "space-between" } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, fontSize: 15 } }, "Transfer bed · ", patient.name || patient.initials), /* @__PURE__ */ React.createElement("button", { className: "icon-btn", onClick: onClose }, /* @__PURE__ */ React.createElement(Icon, { name: "x", size: 14 }))), /* @__PURE__ */ React.createElement("div", { style: { padding: 18, display: "flex", flexDirection: "column", gap: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--ink-2)" } }, /* @__PURE__ */ React.createElement("span", { className: "chip" }, /* @__PURE__ */ React.createElement("span", { className: "d" }), currentBed || "—"), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--ink-3)" } }, "→"), /* @__PURE__ */ React.createElement(BedSelect, { value: bed, onChange: setBed, style: { flex: 1 }, occupancy })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--ink-3)", marginBottom: 6 } }, "ย้ายไปเตียงว่างถัดไป"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } }, WARDS.map((w) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: w,
      className: `btn${bed === nextFree[w] && nextFree[w] ? " primary" : ""}`,
      style: { fontSize: 12 },
      disabled: !nextFree[w],
      onClick: () => setBed(nextFree[w])
    },
    w,
    " · ",
    nextFree[w] || "เต็ม"
  )))), bedTaken && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--crit)" } }, bedTakenMsg(D_R.normalizeBed(bed), bedTaken), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--ink-3)", marginTop: 4 } }, "สลับเตียง: เปิด ⇄ ของ ", bedTaken.name || bedTaken.initials || bedTaken.sessionId, ' แล้วกด "พักไว้ก่อน" เตียงนี้จะว่าง จึงย้ายรายนี้เข้าได้')), !currentBed && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--warn-ink)" } }, "รอเตียง — ย้ายออกจาก ", D_R.lastBed(patient) || "เตียงเดิม", " แล้ว เลือกเตียงใหม่ด้านบน"), (patient.bedHistory || []).length > 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--ink-3)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, marginBottom: 4 } }, "Previous beds"), patient.bedHistory.map((h, i) => /* @__PURE__ */ React.createElement("div", { key: i }, D_R.normalizeBed(h.bed), " ", /* @__PURE__ */ React.createElement("span", { style: { color: "var(--ink-4)" } }, "until ", h.date)))), /* @__PURE__ */ React.createElement(SubmitError, { error: submitError }), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" } }, currentBed && /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn",
      onClick: park,
      disabled: busy,
      style: { marginRight: "auto" },
      title: "ย้ายออกจากเตียงนี้ก่อน แล้วค่อยเลือกเตียงใหม่ — ข้อมูลและ order ยังอยู่ครบ"
    },
    "พักไว้ก่อน"
  ), /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: onClose }, "Cancel"), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn primary",
      onClick: save,
      disabled: !bed || D_R.normalizeBed(bed) === currentBed || !!bedTaken || busy
    },
    /* @__PURE__ */ React.createElement(Icon, { name: "save", size: 14, color: "#fff" }),
    " ",
    busy ? "กำลังบันทึก…" : "Confirm transfer"
  )))));
}
window.PatientRegistry = PatientRegistry;
window.PatientPicker = PatientPicker;
window.EditPatientModal = EditPatientModal;
