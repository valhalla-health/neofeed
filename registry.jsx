// ============================================================
// Patient registry view + picker
// ============================================================
const D_R = window.NEOFEED_DATA;

function PatientRegistry({ patients, activeId, log = {}, onSelect, onAdd, onEdit }) {
  const [filter, setFilter] = React.useState("");
  const [showAdd, setShowAdd] = React.useState(false);
  const [editPatient, setEditPatient] = React.useState(null);

  const today = new Date().toISOString().slice(0, 10);
  const q = filter.toLowerCase().trim();
  const filtered = patients.filter(p =>
    !q ||
    (p.name || "").toLowerCase().includes(q) ||
    (p.currentBed || "").toLowerCase().includes(q) ||
    (p.diagnosis || "").toLowerCase().includes(q)
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
        {filtered.map(p => {
          const last    = p.weights[p.weights.length - 1];
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
                 onClick={() => onSelect(p.sessionId)}>

              {/* Row 1: name + DOL + status */}
              <div className="pmc-row pmc-head">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="pmc-name">{p.name || p.initials || "—"}</span>
                  <span className="pmc-dol">DOL {dol}</span>
                </div>
                <span className={`chip ${p.status === "Active" ? (p.bw < 1000 ? "crit" : "ok") : ""}`}>
                  <span className="d" />{p.status}
                </span>
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

        {filtered.length === 0 && (
          <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
            {filter ? "ไม่พบผู้ป่วยที่ตรงกัน" : "ยังไม่มีผู้ป่วยในระบบ"}
          </div>
        )}
      </div>

      {/* ─── Desktop: table ─── */}
      <div className="card patient-table">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Bed</th>
              <th>GA</th>
              <th>BW (g)</th>
              <th>DOL</th>
              <th>Current wt</th>
              <th>Δ from birth</th>
              <th>Diagnosis</th>
              <th>Last entry</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const last     = p.weights[p.weights.length - 1];
              const dol      = D_R.liveDol(p);
              const delta    = last ? last.w - p.bw : 0;
              const deltaPct = (delta / p.bw) * 100;
              const entries  = log[p.sessionId] || [];
              const lastEntry = entries[entries.length - 1];
              const hasToday  = lastEntry?.ts === today;
              const isActive  = p.sessionId === activeId;

              return (
                <tr key={p.sessionId}
                    className={isActive ? "p-active" : ""}
                    style={{ cursor: "pointer" }}
                    onClick={() => onSelect(p.sessionId)}>
                  <td>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name || p.initials || "—"}</div>
                    {p.twinSuffix && <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>Twin {p.twinSuffix}</div>}
                  </td>
                  <td><span className="chip"><span className="d" />{p.currentBed}</span></td>
                  <td className="num" style={{ fontWeight: 600, color: "var(--brand-2)" }}>{D_R.fmtGA(p.ga)}</td>
                  <td className="num">{p.bw.toLocaleString()}</td>
                  <td className="num" style={{ fontWeight: 700, color: "var(--brand-2)", fontSize: 15 }}>{dol}</td>
                  <td className="num">{last?.w?.toLocaleString() || "—"} g</td>
                  <td className="num" style={{ color: deltaPct < -10 ? "var(--crit)" : deltaPct < 0 ? "oklch(45% 0.13 65)" : "var(--ok)", fontWeight: 600 }}>
                    {delta >= 0 ? "+" : ""}{delta} g
                    <span style={{ fontWeight: 400, color: "var(--ink-3)", fontSize: 11, marginLeft: 3 }}>({deltaPct.toFixed(1)}%)</span>
                  </td>
                  <td style={{ color: "var(--ink-2)", maxWidth: 160 }}>{p.diagnosis}</td>
                  <td style={{ fontSize: 11.5 }}>
                    {lastEntry
                      ? <span style={{ color: hasToday ? "var(--ok)" : "var(--ink-3)" }}>
                          {hasToday ? "✓ " : ""}DOL {lastEntry.dol}
                          <span style={{ color: "var(--ink-4)", marginLeft: 4 }}>
                            {window.NEOFEED_FMT_DATE?.(lastEntry.ts) || lastEntry.ts}
                          </span>
                        </span>
                      : <span style={{ color: "var(--ink-4)" }}>—</span>
                    }
                  </td>
                  <td>
                    <span className={`chip ${p.status === "Active" ? (p.bw < 1000 ? "crit" : "ok") : ""}`}>
                      <span className="d" />{p.status}
                    </span>
                  </td>
                  <td style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button className="btn sm" onClick={e => { e.stopPropagation(); setEditPatient(p); }}>
                      Edit
                    </button>
                    <button className="btn sm" style={{ background: "var(--brand)", color: "#fff", borderColor: "var(--brand-2)" }}
                      onClick={e => { e.stopPropagation(); onSelect(p.sessionId); }}>
                      Open <Icon name="arrow" size={11} color="#fff" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
            {filter ? "ไม่พบผู้ป่วยที่ตรงกัน" : "ยังไม่มีผู้ป่วยในระบบ — กด New session เพื่อเริ่มต้น"}
          </div>
        )}
      </div>

      {showAdd     && <NewPatientModal onClose={() => setShowAdd(false)} onSubmit={p => { onAdd(p); setShowAdd(false); }} />}
      {editPatient && <EditPatientModal patient={editPatient} onClose={() => setEditPatient(null)}
        onSubmit={p => { onEdit?.(p); setEditPatient(null); }} />}
    </>
  );
}

const BED_OPTIONS = [
  "NICU 1-1", "NICU 1-2",
  "NICU 2-1", "NICU 2-2",
  "NICU 3-1", "NICU 3-2", "NICU 3-3", "NICU 3-4",
  "SCN-1", "SCN-2", "SCN-3", "SCN-4", "SCN-5",
];

function NewPatientModal({ onClose, onSubmit }) {
  const [name, setName] = React.useState("");
  const [bw, setBw]     = React.useState(1000);
  const [ga, setGa]     = React.useState(28);
  const [hc, setHc]     = React.useState(0);
  const [len, setLen]   = React.useState(0);
  const [twin, setTwin] = React.useState("");
  const [sex, setSex]   = React.useState("boys");
  const [bed, setBed]   = React.useState("NICU 1-1");
  const [dx, setDx]     = React.useState("");

  const sessionId = `${(name || "XX").slice(0, 2).toUpperCase()}-BW${bw}${twin ? "-" + twin : ""}`;

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
              <label>Twin suffix (optional)</label>
              <select className="sel" value={twin} onChange={e => setTwin(e.target.value)}>
                <option value="">—</option><option value="A">A</option><option value="B">B</option><option value="C">C</option>
              </select>
            </div>
          </div>
          <div style={{ height: 10 }} />
          <div className="row-3">
            <div className="field">
              <label>Birth weight <span className="unit">(g)</span></label>
              <input type="number" className="inp num" value={bw} onChange={e => setBw(parseInt(e.target.value) || 0)} />
            </div>
            <div className="field">
              <label>GA <span className="unit">(weeks + days)</span></label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 80px", gap: 6, alignItems: "center" }}>
                <input type="number" className="inp num" min={20} max={44}
                  value={Math.floor(ga) || ""}
                  onChange={e => {
                    const w = parseInt(e.target.value, 10) || 0;
                    const d = Math.round((ga - Math.floor(ga)) * 10);
                    setGa(w + (d || 0) / 10);
                  }}
                  placeholder="28" />
                <span style={{ color: "var(--ink-3)", fontWeight: 600 }}>+</span>
                <select className="sel"
                  value={Math.round((ga - Math.floor(ga)) * 10) || 0}
                  onChange={e => {
                    const d = parseInt(e.target.value, 10) || 0;
                    setGa(Math.floor(ga) + d / 10);
                  }}>
                  {[0,1,2,3,4,5,6].map(d => <option key={d} value={d}>{d} d</option>)}
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
              <label>Length at birth <span className="unit">(cm)</span></label>
              <input type="number" className="inp num" step={0.1} value={len || ""} onChange={e => setLen(parseFloat(e.target.value) || 0)} placeholder="0" />
            </div>
            <div className="field">
              <label>HC at birth <span className="unit">(cm)</span></label>
              <input type="number" className="inp num" step={0.1} value={hc || ""} onChange={e => setHc(parseFloat(e.target.value) || 0)} placeholder="0" />
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
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={() => onSubmit({
              sessionId, name, initials: name, bw, ga, twinSuffix: twin, sex,
              currentBed: bed, diagnosis: dx, status: "Active",
              admissionDate: new Date().toISOString().slice(0, 10),
              dob: new Date().toISOString().slice(0, 10),
              weights: [{ dol: 1, w: bw, l: len || null, hc: hc || null }],
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
  const filtered = patients.filter(p =>
    !ql ||
    (p.name || "").toLowerCase().includes(ql) ||
    (p.currentBed || "").toLowerCase().includes(ql)
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
              onClick={() => { onSelect(p.sessionId); onClose(); }}
              style={{
                display: "grid", gridTemplateColumns: "140px 1fr 100px 80px 90px", gap: 14,
                alignItems: "center", padding: "12px 18px", cursor: "pointer",
                background: p.sessionId === activeId ? "var(--brand-bg)" : undefined,
                borderBottom: "1px solid var(--line-2)"
              }}
              onMouseEnter={e => { if (p.sessionId !== activeId) e.currentTarget.style.background = "var(--bg-2)"; }}
              onMouseLeave={e => { if (p.sessionId !== activeId) e.currentTarget.style.background = ""; }}
            >
              <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name || p.initials || "—"}</span>
              <span style={{ color: "var(--ink-2)", fontSize: 12.5 }}>{p.diagnosis}</span>
              <span className="chip"><span className="d" />{p.currentBed}</span>
              <span style={{ fontSize: 11.5, color: "var(--ink-3)" }} className="mono">GA {D_R.fmtGA(p.ga)}</span>
              <span style={{ fontSize: 11.5, color: "var(--ink-3)" }} className="mono">BW {p.bw}g</span>
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
  const [name, setName]     = React.useState(patient.name || patient.initials || "");
  const [bed, setBed]       = React.useState(patient.currentBed || "NICU 1-1");
  const [dx, setDx]         = React.useState(patient.diagnosis || "");
  const [status, setStatus] = React.useState(patient.status || "Active");
  const [dol1, setDol1]     = React.useState(patient.weights?.[0]?.dol ?? 1);

  const save = () => onSubmit({
    ...patient,
    name, initials: name,
    currentBed: bed,
    diagnosis: dx,
    status,
    weights: patient.weights.map((w, i) => i === 0 ? { ...w, dol: Number(dol1) || 1 } : w),
  });

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
            <span>Admit: <strong>{window.NEOFEED_FMT_DATE?.(patient.admissionDate) || patient.admissionDate}</strong></span>
          </div>
          <div className="row-2">
            <div className="field">
              <label>ชื่อย่อ</label>
              <input className="inp" maxLength={2} value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>DOL แรกรับ</label>
              <input type="number" className="inp num" min={1} value={dol1} onChange={e => setDol1(e.target.value)} />
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
              <label>Status</label>
              <select className="sel" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="Active">Active</option>
                <option value="Discharged">Discharged</option>
                <option value="Transferred">Transferred</option>
                <option value="Expired">Expired</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Diagnosis</label>
            <input className="inp" value={dx} onChange={e => setDx(e.target.value)} placeholder="ELBW · RDS …" />
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

window.PatientRegistry = PatientRegistry;
window.PatientPicker   = PatientPicker;
