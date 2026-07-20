// ============================================================
// Patient registry view + picker
// ============================================================
const D_R = window.NEOFEED_DATA;

// Spread onto a clickable row/card div so keyboard users can open a patient
// without tabbing through every nested action button first (Enter/Space
// activates it like a native control; nested buttons still stopPropagation
// their own clicks so they don't double-fire this).
const rowA11y = (onActivate) => ({
  role: "button",
  tabIndex: 0,
  onKeyDown: (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActivate(); }
  },
});

function PatientRegistry({ patients, activeId, log = {}, onSelect, onAdd, onEdit }) {
  const [filter, setFilter]         = React.useState("");
  const [showAdd, setShowAdd]       = React.useState(false);
  const [editPatient, setEditPatient]       = React.useState(null);
  const [transferPatient, setTransferPatient] = React.useState(null);
  const [showArchived, setShowArchived]     = React.useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const q = filter.toLowerCase().trim();
  const filtered = patients.filter(p =>
    !q ||
    (p.name || "").toLowerCase().includes(q) ||
    (p.currentBed || "").toLowerCase().includes(q) ||
    (p.diagnosis || "").toLowerCase().includes(q)
  );
  const bedSort = (a, b) =>
    (a.currentBed || "zzz").localeCompare(b.currentBed || "zzz", undefined, { numeric: true, sensitivity: "base" });
  const sorted   = [...filtered].sort(bedSort);
  const activeSorted   = sorted.filter(p => p.status === "Active" || !p.status);
  // Discharged/Transferred/Expired patients drop off the registry 7 days
  // after their statusDate — the name shouldn't linger on the dashboard
  // once the case is old news. Patients archived before statusDate existed
  // (no value stored) stay visible since we can't tell their age.
  const ARCHIVE_VISIBLE_DAYS = 7;
  const daysSinceStatus = (p) => {
    if (!p.statusDate) return -1;
    const changed = new Date(p.statusDate + "T00:00:00");
    if (isNaN(changed)) return -1;
    return Math.floor((new Date(today + "T00:00:00") - changed) / 86400000);
  };
  const archivedSorted = sorted.filter(p =>
    p.status && p.status !== "Active" && daysSinceStatus(p) <= ARCHIVE_VISIBLE_DAYS
  );

  // Summary stats
  const totalActive  = patients.filter(p => p.status === "Active").length;
  const loggedToday  = patients.filter(p => (log[p.sessionId] || []).some(e => e.ts === today)).length;
  const needsLog     = patients.filter(p => {
    if (p.status !== "Active") return false;
    const entries = log[p.sessionId] || [];
    return entries.length === 0 || entries[entries.length - 1].ts !== today;
  }).length;

  return (
    <>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div>
          <h1>Patient registry</h1>
          <div className="sub">{patients.length} sessions · {totalActive} active</div>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="reg-stats">
        <div className="reg-stat s-brand">
          <span className="reg-stat-val">{totalActive}</span>
          <span className="reg-stat-lbl">Active</span>
        </div>
        <div className="reg-stat">
          <span className="reg-stat-val">{patients.length}</span>
          <span className="reg-stat-lbl">Total sessions</span>
        </div>
        <div className={`reg-stat ${loggedToday === totalActive && totalActive > 0 ? "s-ok" : loggedToday > 0 ? "s-warn" : "s-crit"}`}>
          <span className="reg-stat-val">{loggedToday}</span>
          <span className="reg-stat-lbl">Logged today</span>
        </div>
        <div className={`reg-stat ${needsLog === 0 ? "" : needsLog <= 1 ? "s-warn" : "s-crit"}`}>
          <span className="reg-stat-val">{needsLog}</span>
          <span className="reg-stat-lbl">Needs entry</span>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="reg-filter">
        <div className="reg-search">
          <div className="s-ico"><Icon name="search" size={14} /></div>
          <input
            className="inp"
            placeholder="ค้นหา · ชื่อย่อ · เตียง · วินิจฉัย"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
        <button className="btn primary" style={{ whiteSpace: "nowrap" }} onClick={() => setShowAdd(true)}>
          <Icon name="plus" size={14} color="#fff" /> New session
        </button>
      </div>

      {/* ─── Mobile: card list ─── */}
      <div className="patient-card-list">
        {activeSorted.map(p => {
          const last    = D_R.lastWeighed(p) || p.weights[p.weights.length - 1];
          const dol     = D_R.liveDol(p);
          const delta   = last ? last.w - p.bw : 0;
          const deltaPct = (delta / p.bw) * 100;
          const deltaColor = deltaPct < -10 ? "var(--crit)" : deltaPct < 0 ? "oklch(45% 0.13 65)" : "var(--ok)";
          const isActive  = p.sessionId === activeId;
          const entries   = log[p.sessionId] || [];
          const lastEntry = entries[entries.length - 1];
          const hasToday  = lastEntry?.ts === today;

          return (
            <div key={p.sessionId}
                 className={"patient-mc" + (isActive ? " active" : "")}
                 onClick={() => onSelect(p.sessionId)}
                 {...rowA11y(() => onSelect(p.sessionId))}>

              {/* Row 1: name + DOL + status */}
              <div className="pmc-row pmc-head">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="pmc-name">{p.name || p.initials || "—"}</span>
                  <span className="pmc-dol">DOL {dol}</span>
                </div>
                <span className="chip ok"><span className="d" />Active</span>
              </div>

              {/* Row 2: bed + GA · BW */}
              <div className="pmc-row">
                <span className="chip"><span className="d" />{p.currentBed}</span>
                <span className="pmc-meta">
                  <span className="num">{D_R.fmtGA(p.ga)}</span> wk ·{" "}
                  <span className="num">{p.bw.toLocaleString()}</span> g
                </span>
              </div>

              {/* Diagnosis */}
              {p.diagnosis && <div className="pmc-diagnosis">{p.diagnosis}</div>}

              {/* Row 3: weight stats + log badge */}
              <div className="pmc-row pmc-stats">
                <span>
                  <span className="pmc-lbl">Wt</span>
                  <span className="num">{last?.w?.toLocaleString() || "—"}</span> g
                </span>
                <span style={{ color: deltaColor }}>
                  <span className="pmc-lbl">Δ</span>
                  <span className="num">{delta >= 0 ? "+" : ""}{delta}</span> g ({deltaPct.toFixed(1)}%)
                </span>
                <span style={{ color: hasToday ? "var(--ok)" : "var(--ink-4)", fontSize: 11 }}>
                  {hasToday ? "✓ logged" : lastEntry ? `DOL ${lastEntry.dol}` : "no log"}
                </span>
              </div>

              {/* Actions */}
              <div className="pmc-actions">
                <button className="btn sm" onClick={e => { e.stopPropagation(); setEditPatient(p); }}>
                  Edit
                </button>
                <button className="btn sm primary" onClick={e => { e.stopPropagation(); onSelect(p.sessionId); }}>
                  Open <Icon name="arrow" size={11} color="#fff" />
                </button>
              </div>
            </div>
          );
        })}

        {activeSorted.length === 0 && (
          <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
            {filter ? "ไม่พบผู้ป่วยที่ตรงกัน" : "ยังไม่มีผู้ป่วยในระบบ"}
          </div>
        )}

        {/* Archived toggle */}
        {archivedSorted.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button className="btn" style={{ width: "100%", justifyContent: "center", color: "var(--ink-3)", fontSize: 12 }}
              onClick={() => setShowArchived(s => !s)}>
              {showArchived ? "▲" : "▼"} Discharged / Transferred / Expired ({archivedSorted.length})
            </button>
            {showArchived && archivedSorted.map(p => (
              <div key={p.sessionId} className="patient-mc" style={{ opacity: 0.55 }}
                   onClick={() => onSelect(p.sessionId)}>
                <div className="pmc-row pmc-head">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="pmc-name">{p.name || p.initials || "—"}</span>
                    <span className="chip"><span className="d" />{p.currentBed}</span>
                  </div>
                  <span className="chip"><span className="d" />{p.status}</span>
                </div>
                <div className="pmc-row">
                  <span className="pmc-meta"><span className="num">{D_R.fmtGA(p.ga)}</span> wk · <span className="num">{p.bw.toLocaleString()}</span> g</span>
                </div>
                {p.diagnosis && <div className="pmc-diagnosis">{p.diagnosis}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Desktop: table ─── */}
      <div className="card patient-table">
        <table className="tbl" style={{ tableLayout: "fixed", width: "100%" }}>
          <colgroup>
            {/* Bed */}
            <col style={{ width: 90 }} />
            {/* Name */}
            <col style={{ width: 68 }} />
            {/* GA */}
            <col style={{ width: 62 }} />
            {/* PCA */}
            <col style={{ width: 62 }} />
            {/* BW */}
            <col style={{ width: 68 }} />
            {/* Diagnosis — flex */}
            <col />
            {/* DOL */}
            <col style={{ width: 48 }} />
            {/* Current wt */}
            <col style={{ width: 78 }} />
            {/* Δ */}
            <col style={{ width: 108 }} />
            {/* Status */}
            <col style={{ width: 90 }} />
            {/* Actions */}
            <col style={{ width: 150 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Bed</th>
              <th>Name</th>
              <th>GA</th>
              <th>PCA</th>
              <th>BW (g)</th>
              <th>Diagnosis</th>
              <th>DOL</th>
              <th>Wt now</th>
              <th>Δ birth</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {activeSorted.map(p => {
              const last     = p.weights[p.weights.length - 1];
              const dol      = D_R.liveDol(p);
              const delta    = last ? last.w - p.bw : 0;
              const deltaPct = (delta / p.bw) * 100;
              const entries  = log[p.sessionId] || [];
              const lastEntry = entries[entries.length - 1];
              const hasToday  = lastEntry?.ts === today;
              const isSelected = p.sessionId === activeId;

              return (
                <tr key={p.sessionId}
                    className={isSelected ? "p-active" : ""}
                    style={{ cursor: "pointer" }}
                    onClick={() => onSelect(p.sessionId)}
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(p.sessionId); } }}>
                  <td><span className="chip"><span className="d" />{p.currentBed}</span></td>
                  <td>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name || p.initials || "—"}</div>
                    {p.twinSuffix && <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>· {p.twinSuffix}</div>}
                  </td>
                  <td className="num" style={{ fontWeight: 600, color: "var(--brand-2)" }}>
                    {D_R.fmtGA(p.ga)}
                  </td>
                  <td className="num" style={{ fontWeight: 600, color: "var(--ok)" }}>
                    {D_R.fmtGA(D_R.pmaShort(p.ga, dol))}
                  </td>
                  <td className="num">{p.bw.toLocaleString()}</td>
                  <td style={{ color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.diagnosis}</td>
                  <td className="num" style={{ fontWeight: 700, color: "var(--brand-2)", fontSize: 15 }}>{dol}</td>
                  <td className="num">{last?.w?.toLocaleString() || "—"} g</td>
                  <td className="num" style={{ color: deltaPct < -10 ? "var(--crit)" : deltaPct < 0 ? "oklch(45% 0.13 65)" : "var(--ok)", fontWeight: 600 }}>
                    {delta >= 0 ? "+" : ""}{delta} g
                    <span style={{ fontWeight: 400, color: "var(--ink-3)", fontSize: 11, marginLeft: 3 }}>({deltaPct.toFixed(1)}%)</span>
                  </td>
                  <td>
                    <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11, color:"var(--ok)", fontWeight:600 }}>
                      <span style={{ width:7, height:7, borderRadius:"50%", background:"var(--ok)", flexShrink:0 }} />
                      Active
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "nowrap" }}>
                      <button className="btn sm" title="ย้ายเตียง"
                        onClick={e => { e.stopPropagation(); setTransferPatient(p); }}
                        style={{ padding: "0 8px", fontSize: 13 }}>⇄</button>
                      <button className="btn sm" style={{ padding: "0 8px" }}
                        onClick={e => { e.stopPropagation(); setEditPatient(p); }}>Edit</button>
                      <button className="btn sm" style={{ padding: "0 8px",
                        background: "var(--brand)", color: "#fff", borderColor: "var(--brand-2)" }}
                        onClick={e => { e.stopPropagation(); onSelect(p.sessionId); }}>
                        Open <Icon name="arrow" size={11} color="#fff" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {/* Archived section */}
            {archivedSorted.length > 0 && (
              <tr>
                <td colSpan={11} style={{ padding: "6px 12px", background: "var(--bg-2)", borderTop: "2px solid var(--line)" }}>
                  <button className="btn sm" style={{ color: "var(--ink-3)", fontSize: 11 }}
                    onClick={e => { e.stopPropagation(); setShowArchived(s => !s); }}>
                    {showArchived ? "▲" : "▼"} Discharged / Transferred / Expired ({archivedSorted.length})
                  </button>
                </td>
              </tr>
            )}
            {showArchived && archivedSorted.map(p => (
              <tr key={p.sessionId} style={{ opacity: 0.5, cursor: "pointer" }}
                  onClick={() => onSelect(p.sessionId)}>
                <td><span className="chip"><span className="d" />{p.currentBed}</span></td>
                <td style={{ fontWeight: 600, fontSize: 13 }}>{p.name || p.initials || "—"}</td>
                <td className="num">{D_R.fmtGA(p.ga)}</td>
                <td className="num">{D_R.fmtGA(D_R.pmaShort(p.ga, D_R.liveDol(p)))}</td>
                <td className="num">{p.bw.toLocaleString()}</td>
                <td style={{ color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.diagnosis}</td>
                <td colSpan={4} />
                <td><span className="chip"><span className="d" />{p.status}</span></td>
                <td style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                  <button className="btn sm" onClick={e => { e.stopPropagation(); setEditPatient(p); }}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
            {filter ? "ไม่พบผู้ป่วยที่ตรงกัน" : "ยังไม่มีผู้ป่วยในระบบ — กด New session เพื่อเริ่มต้น"}
          </div>
        )}
      </div>

      {showAdd          && <NewPatientModal onClose={() => setShowAdd(false)} onSubmit={p => { onAdd(p); setShowAdd(false); }} />}
      {editPatient      && <EditPatientModal patient={editPatient} onClose={() => setEditPatient(null)}
        onSubmit={p => { onEdit?.(p); setEditPatient(null); }} />}
      {transferPatient  && <TransferBedModal patient={transferPatient} onClose={() => setTransferPatient(null)}
        onSubmit={p => { onEdit?.(p); setTransferPatient(null); }} />}
    </>
  );
}

const BED_OPTIONS = [
  ...Array.from({ length: 12 }, (_, i) => `NICU ${i + 1}`),
  "iso 1-1", "iso 1-2",
  "iso 2-1", "iso 2-2",
  "iso 3-1", "iso 3-2", "iso 3-3", "iso 3-4",
  ...Array.from({ length: 10 }, (_, i) => `SCN ${i + 1}`),
];

function NewPatientModal({ onClose, onSubmit }) {
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName]         = React.useState("");
  const [bw, setBw]             = React.useState(0);
  const [gaW, setGaW]           = React.useState("");
  const [gaD, setGaD]           = React.useState("");
  const [hc, setHc]             = React.useState(0);
  const [len, setLen]           = React.useState(0);
  const [twin, setTwin]         = React.useState("");
  const [sex, setSex]           = React.useState("boys");
  const [bed, setBed]           = React.useState("NICU 1-1");
  const [dx, setDx]             = React.useState("");
  const [admitDate, setAdmitDate] = React.useState(today);
  const [admitDol, setAdmitDol]   = React.useState(1);

  // GA stored as WW.D shorthand (e.g. 26+4 → 26.4), not decimal weeks
  const ga = gaW !== "" ? parseInt(gaW) + parseInt(gaD || 0) / 10 : 0;
  const sessionId = `${(name || "XX").slice(0, 2).toUpperCase()}-BW${bw}${twin ? "-" + twin : ""}`;

  // Birth weight and GA feed every downstream nutrition calculation (targets,
  // Fenton percentile, HMF threshold) — a 0/blank value here would silently
  // corrupt every subsequent dose for this patient, so block submission on it.
  const canSubmit = name.trim().length > 0 && bw > 0 && gaW !== "";

  // DOB = admitDate − (admitDol − 1) days
  const dob = React.useMemo(() => {
    if (!admitDate) return today;
    const d = new Date(admitDate + "T00:00:00");
    d.setDate(d.getDate() - (Math.max(1, parseInt(admitDol) || 1) - 1));
    return d.toISOString().slice(0, 10);
  }, [admitDate, admitDol]);

  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker" style={{ width: 560 }} onClick={e => e.stopPropagation()}>
        <div className="picker-h" style={{ display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Register new session</div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div style={{ padding: 18 }}>
          <div className="row-2">
            <div className="field">
              <label>ชื่อย่อ <span className="unit">(อักษรแรกของชื่อ + นามสกุล)</span></label>
              <input className="inp" maxLength={2} value={name} onChange={e => setName(e.target.value)} placeholder="เช่น  ปพ" />
            </div>
            <div className="field">
              <label>Multiples <span className="unit">(optional)</span></label>
              <select className="sel" value={twin} onChange={e => setTwin(e.target.value)}>
                <option value="">—</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option>
              </select>
            </div>
          </div>
          <div style={{ height: 10 }} />
          <div className="row-3">
            <div className="field">
              <label>Birth weight <span className="unit">(g)</span></label>
              <input type="number" min="0" className="inp" value={bw || ""} onChange={e => setBw(Math.max(0, parseInt(e.target.value) || 0))} placeholder="0" />
            </div>
            <div className="field">
              <label>GA <span className="unit">(weeks + days)</span></label>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <select className="sel" value={gaW} onChange={e => setGaW(e.target.value)} style={{ flex: 1 }}>
                  <option value="">wk</option>
                  {Array.from({ length: 22 }, (_, i) => 22 + i).map(w => <option key={w} value={w}>{w}</option>)}
                </select>
                <span style={{ color: "var(--ink-3)", fontWeight: 500 }}>+</span>
                <select className="sel" value={gaD} onChange={e => setGaD(e.target.value)} style={{ width: 68 }}>
                  <option value="">d</option>
                  {[0,1,2,3,4,5,6].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Sex</label>
              <select className="sel" value={sex} onChange={e => setSex(e.target.value)}>
                <option value="boys">Male</option><option value="girls">Female</option>
              </select>
            </div>
          </div>
          <div style={{ height: 10 }} />
          <div className="row-2">
            <div className="field">
              <label>Admit date</label>
              <input type="date" className="inp" value={admitDate} onChange={e => setAdmitDate(e.target.value)} />
            </div>
            <div className="field">
              <label>DOL at admit</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="number" className="inp" min={1} style={{ flex: 1 }} value={admitDol}
                  onChange={e => setAdmitDol(Math.max(1, parseInt(e.target.value) || 1))} />
                {admitDol > 1 && (
                  <span style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                    DOB: {dob}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div style={{ height: 10 }} />
          <div className="row-2">
            <div className="field">
              <label>Length at birth <span className="unit">(cm)</span></label>
              <input type="number" min="0" className="inp" step={0.1} value={len || ""} onChange={e => setLen(Math.max(0, parseFloat(e.target.value) || 0))} placeholder="0" />
            </div>
            <div className="field">
              <label>HC at birth <span className="unit">(cm)</span></label>
              <input type="number" min="0" className="inp" step={0.1} value={hc || ""} onChange={e => setHc(Math.max(0, parseFloat(e.target.value) || 0))} placeholder="0" />
            </div>
          </div>
          <div style={{ height: 10 }} />
          <div className="row-2">
            <div className="field">
              <label>Bed</label>
              <select className="sel" value={bed} onChange={e => setBed(e.target.value)}>
                {BED_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Diagnosis</label>
              <input className="inp" value={dx} onChange={e => setDx(e.target.value)} placeholder="ELBW · RDS …" />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 20 }}>
            {!canSubmit && (
              <span style={{ fontSize: 11.5, color: "var(--ink-3)", marginRight: "auto" }}>
                กรอกชื่อย่อ · น้ำหนักแรกเกิด · GA ให้ครบก่อนลงทะเบียน
              </span>
            )}
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={!canSubmit} onClick={() => onSubmit({
              sessionId, name, initials: name, bw, ga, twinSuffix: twin, sex,
              currentBed: bed, diagnosis: dx, status: "Active",
              admissionDate: admitDate,
              dob,
              weights: [{ dol: parseInt(admitDol) || 1, w: bw, l: len || null, hc: hc || null }],
            })}>
              <Icon name="save" size={14} color="#fff" /> Register
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Quick switcher (popup from topbar)
function PatientPicker({ patients, activeId, onSelect, onClose }) {
  const [q, setQ] = React.useState("");
  const ql = q.toLowerCase().trim();
  const filtered = patients
    .filter(p =>
      !ql ||
      (p.name || "").toLowerCase().includes(ql) ||
      (p.currentBed || "").toLowerCase().includes(ql)
    )
    .sort((a, b) =>
      (a.currentBed || "zzz").localeCompare(b.currentBed || "zzz", undefined, { numeric: true, sensitivity: "base" })
    );

  React.useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker" onClick={e => e.stopPropagation()}>
        <div className="picker-h">
          <Icon name="search" size={16} color="var(--ink-3)" />
          <input placeholder="ค้นหา · เลขเตียง หรือ ชื่อย่อ" value={q} onChange={e => setQ(e.target.value)} autoFocus />
          <button className="btn sm" onClick={onClose}>Close</button>
        </div>
        <div style={{ padding: "6px 0", maxHeight: 480, overflowY: "auto" }}>
          {filtered.map(p => (
            <div key={p.sessionId}
              className="picker-row"
              onClick={() => { onSelect(p.sessionId); onClose(); }}
              style={{
                display: "grid",
                gridTemplateColumns: "84px 96px 64px 76px 1fr",
                gap: 10,
                alignItems: "center", padding: "10px 18px", cursor: "pointer",
                background: p.sessionId === activeId ? "var(--brand-bg)" : undefined,
                borderBottom: "1px solid var(--line-2)"
              }}
              onMouseEnter={e => { if (p.sessionId !== activeId) e.currentTarget.style.background = "var(--bg-2)"; }}
              onMouseLeave={e => { if (p.sessionId !== activeId) e.currentTarget.style.background = ""; }}
            >
              <span className="chip" style={{ justifySelf: "start" }}><span className="d" />{p.currentBed}</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{p.name || p.initials || "—"}</span>
              <span className="mono" style={{ fontSize: 12, color: "var(--brand-2)", fontWeight: 600 }}>{D_R.fmtGA(p.ga)}</span>
              <span className="mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>{p.bw.toLocaleString()}g</span>
              <span style={{ color: "var(--ink-3)", fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.diagnosis || "—"}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: "32px 18px", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>ไม่พบผู้ป่วย</div>
          )}
        </div>
      </div>
    </div>
  );
}

function EditPatientModal({ patient, onClose, onSubmit }) {
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName]         = React.useState(patient.name || patient.initials || "");
  const [bed, setBed]           = React.useState(patient.currentBed || "NICU 1-1");
  const [dx, setDx]             = React.useState(patient.diagnosis || "");
  const [status, setStatus]     = React.useState(patient.status || "Active");
  const [dol1, setDol1]         = React.useState(patient.weights?.[0]?.dol ?? 1);
  const [admitDate, setAdmitDate] = React.useState(patient.admissionDate || today);

  // statusDate marks when the patient left Active (Discharged/Transferred/
  // Expired) — the registry list uses it to auto-hide the name after 7 days.
  // Re-stamped only when the status actually changes so re-saving the same
  // archived status doesn't keep resetting the 7-day clock.
  const save = () => {
    const prevStatus = patient.status || "Active";
    const statusDate = status === "Active"
      ? null
      : (status !== prevStatus || !patient.statusDate) ? today : patient.statusDate;
    onSubmit({
      ...patient,
      name, initials: name,
      currentBed: bed,
      diagnosis: dx,
      status,
      statusDate,
      admissionDate: admitDate,
      weights: patient.weights.map((w, i) => i === 0 ? { ...w, dol: Number(dol1) || 1 } : w),
    });
  };

  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker" style={{ width: 480 }} onClick={e => e.stopPropagation()}>
        <div className="picker-h" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Edit session · {patient.sessionId}</div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ padding: "10px 12px", background: "var(--bg-2)", borderRadius: 8, fontSize: 12, color: "var(--ink-2)", display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span>GA: <strong>{D_R.fmtGA(patient.ga)} wk</strong></span>
            <span>BW: <strong>{patient.bw} g</strong></span>
            <span>Sex: <strong>{patient.sex === "boys" ? "Male" : "Female"}</strong></span>
          </div>
          <div className="row-2">
            <div className="field">
              <label>ชื่อย่อ</label>
              <input className="inp" maxLength={2} value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>DOL แรกรับ</label>
              <input type="number" className="inp" min={1} value={dol1} onChange={e => setDol1(Math.max(1, parseInt(e.target.value, 10) || 1))} />
            </div>
          </div>
          <div className="row-2">
            <div className="field">
              <label>Admit date</label>
              <input type="date" className="inp" value={admitDate} onChange={e => setAdmitDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Status</label>
              <select className="sel" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="Active">Active</option>
                <option value="Discharged">Discharged</option>
                <option value="Transferred">Transferred</option>
                <option value="Expired">Expired</option>
              </select>
            </div>
          </div>
          <div className="row-2">
            <div className="field">
              <label>Bed</label>
              <select className="sel" value={bed} onChange={e => setBed(e.target.value)}>
                {BED_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Diagnosis</label>
              <input className="inp" value={dx} onChange={e => setDx(e.target.value)} placeholder="ELBW · RDS …" />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={save}><Icon name="save" size={14} color="#fff" /> Save changes</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Transfer bed modal ───────────────────────────────────────
function TransferBedModal({ patient, onClose, onSubmit }) {
  const [bed, setBed] = React.useState(patient.currentBed || "");

  const save = () => {
    if (!bed || bed === patient.currentBed) { onClose(); return; }
    const bedHistory = [
      ...(patient.bedHistory || []),
      { bed: patient.currentBed, date: new Date().toISOString().slice(0, 10) },
    ];
    onSubmit({ ...patient, currentBed: bed, bedHistory });
  };

  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
        <div className="picker-h" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Transfer bed · {patient.name || patient.initials}</div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>

          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--ink-2)" }}>
            <span className="chip"><span className="d" />{patient.currentBed || "—"}</span>
            <span style={{ color: "var(--ink-3)" }}>→</span>
            <select className="sel" style={{ flex: 1 }} value={bed} onChange={e => setBed(e.target.value)}>
              {BED_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          {/* Bed history */}
          {(patient.bedHistory || []).length > 0 && (
            <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Previous beds</div>
              {patient.bedHistory.map((h, i) => (
                <div key={i}>{h.bed} <span style={{ color: "var(--ink-4)" }}>until {h.date}</span></div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={save}
              disabled={!bed || bed === patient.currentBed}>
              <Icon name="save" size={14} color="#fff" /> Confirm transfer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

window.PatientRegistry    = PatientRegistry;
window.PatientPicker      = PatientPicker;
window.EditPatientModal   = EditPatientModal;
