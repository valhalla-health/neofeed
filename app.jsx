// ============================================================
// NeoFeed — App shell
// ============================================================
const D_A = window.NEOFEED_DATA;

// ── Config (set in NeoFeed.html window.NEOFEED_* — do NOT hardcode here) ──────
const GAS_URL  = window.NEOFEED_GAS_URL || "";
const GAS_ON   = GAS_URL.length > 10;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "comfortable",
  "accent": "#2a7a8c",
  "showDisclaimer": true
} /*EDITMODE-END*/;

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // user = { name, role, email, token } — stored in sessionStorage (clears on tab close)
  // Login screen removed — default to a stub user so the app skips the gate.
  // sessionStorage is still honored for compatibility with prior real Google sessions.
  const [user, setUser] = React.useState(() => {
    try {
      const s = sessionStorage.getItem("neofeed_session");
      if (s) return JSON.parse(s);
    } catch {}
    // GAS_ON → require real Google login; local dev → stub user
    return GAS_ON ? null : { name: "Local user", role: "doctor", email: "", token: "" };
  });
  const role     = user?.role || null;
  const authName = user?.name || "";

  // Patient registry — empty until GAS sync completes (prevents mock patient identity confusion)
  const [patients, setPatients] = React.useState(GAS_ON ? [] : D_A.MOCK_PATIENTS);
  const [log, setLog] = React.useState(GAS_ON ? {} : D_A.MOCK_DAILY_LOG);
  const [activeId, setActiveId] = React.useState(GAS_ON ? null : D_A.MOCK_PATIENTS[0].sessionId);
  const [view, setView] = React.useState("registry");
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [syncState, setSyncState] = React.useState(GAS_ON ? "loading" : "local"); // local | loading | ok | error
  const [lastSync, setLastSync] = React.useState(null);
  const [calcWeights, setCalcWeights] = React.useState({});
  React.useEffect(() => { setCalcWeights({}); }, [activeId]); // reset typed weight on patient switch

  const active = patients.find((p) => p.sessionId === activeId);
  const lastWt = active?.weights?.slice(-1)[0];
  // DOL = admissionDOL + daysSinceAdmit — single source of truth (data.js → liveDol)
  const dol = D_A.liveDol(active);

  const alertCount = React.useMemo(() => {
    if (!active) return 0;
    let n = 0;
    const entries = log[active.sessionId] || [];
    const last = entries[entries.length - 1];
    // Only flag nutrition alerts if last log is from today — stale entries must not drive the badge
    const todayStr = new Date().toISOString().slice(0, 10);
    if (last && last.ts === todayStr) {
      if (last.gir  > D_A.TARGETS.gir()[1])                        n++;
      if (last.pro  < D_A.TARGETS.protein(last.dol)[0] && last.dol > 2) n++;
      if (last.kcal < D_A.TARGETS.kcal(last.dol)[0]    && last.dol > 4) n++;
    }
    const wts = active.weights || [];
    if (wts.length >= 2) {
      const recent = wts.slice(-Math.min(wts.length, 7));
      const w0 = recent[0], wN = recent[recent.length - 1];
      const vel = (wN.w - w0.w) / Math.max(1, wN.dol - w0.dol) / ((w0.w + wN.w) / 2 / 1000);
      if (vel < 15) n++;
    }
    // Stale weight alert: no measurement in 3+ days
    const lastWt = wts[wts.length - 1];
    if (lastWt && (dol - lastWt.dol) >= 3) n++;
    return n;
  }, [active, log]);

  // ── GAS fetch (initial + manual sync) ────────────────────────
  // Token is sent in POST body — never in URL (prevents token leakage in server logs)
  const syncFromGAS = React.useCallback(() => {
    if (!GAS_ON) return;
    setSyncState("loading");
    const tok = (() => { try { return JSON.parse(sessionStorage.getItem("neofeed_session"))?.token || ""; } catch { return ""; } })();
    fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "getActivePatients", token: tok }),
    })
      .then(r => r.json())
      .then(data => {
        // Auth expired → clear session + force re-login
        if (data.error === "Unauthorized") {
          sessionStorage.removeItem("neofeed_session");
          if (window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
          setUser(null);
          setSyncState("error");
          return;
        }
        if (data.error) { setSyncState("error"); return; }

        if (Array.isArray(data.patients)) {
          // Replace mock data with real GAS data (even if empty registry)
          setPatients(data.patients.length > 0 ? data.patients : []);
          if (data.patients.length > 0) {
            setActiveId(prev =>
              data.patients.find(p => p.sessionId === prev)
                ? prev : data.patients[0].sessionId
            );
          }
        }
        if (data.log) setLog(data.log);
        setSyncState("ok");
        setLastSync(new Date());
      })
      .catch(err => {
        console.warn("GAS sync failed:", err);
        setSyncState("error");
      });
  }, []);

  // Sync after login — fires when user changes (null → logged-in object)
  React.useEffect(() => { if (user) syncFromGAS(); }, [user?.email]);

  // ── Brand accent ─────────────────────────────────────────────
  React.useEffect(() => {
    document.documentElement.style.setProperty("--brand", `oklch(46% 0.085 215)`);
    if (tweaks.accent && tweaks.accent !== "#2a7a8c") {
      document.documentElement.style.setProperty("--brand", tweaks.accent);
      document.documentElement.style.setProperty("--brand-2", tweaks.accent);
    }
  }, [tweaks.accent]);

  // ── Shared GAS write helper ───────────────────────────────────
  // Awaits the GAS response and handles three failure modes:
  //   1. Unauthorized  → clears session + forces re-login (token expired after ~1 hr)
  //   2. GAS error     → shows error toast with server message
  //   3. Network error → shows error toast
  // Returns true on success so callers can fire the confirmatory toast themselves.
  const gasPost = React.useCallback(async (payload) => {
    if (!GAS_ON) return true;
    try {
      const res  = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ ...payload, token: user?.token }),
      });
      const data = await res.json();
      if (data.error === "Unauthorized") {
        showToast("เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่", "error");
        sessionStorage.removeItem("neofeed_session");
        if (window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
        setUser(null);
        return false;
      }
      if (data.error) {
        showToast(`บันทึกไม่สำเร็จ: ${data.error}`, "error");
        return false;
      }
      return true;
    } catch (e) {
      console.warn("GAS POST failed:", e);
      showToast("บันทึกไม่สำเร็จ — ตรวจสอบการเชื่อมต่อ", "error");
      return false;
    }
  }, [user?.token]);

  // ── Handlers ─────────────────────────────────────────────────
  const handleLogToGAS = (entry) => {
    const id = active.sessionId;
    const ts = new Date().toISOString().slice(0, 10);
    // Update local state immediately (optimistic — keeps UI snappy)
    setLog(prev => ({ ...prev, [id]: [...(prev[id] || []), { ...entry, ts }] }));
    // Toast fires AFTER GAS confirms — not before — to avoid false assurance
    if (GAS_ON) {
      gasPost({ action: "logDailyNutrition", sessionId: id, entry: { ...entry, ts } })
        .then(ok => {
          if (ok) showToast(`Logged DOL ${entry.dol} · ${entry.status === "submitted" ? "Submitted" : "Draft saved"}`);
        });
    } else {
      showToast(`Logged DOL ${entry.dol} · ${entry.status === "submitted" ? "Submitted" : "Draft saved"}`);
    }
  };

  const handleAddPatient = (p) => {
    setPatients(prev => [p, ...prev]);
    setActiveId(p.sessionId);
    if (GAS_ON) {
      gasPost({ action: "registerPatient", patient: p })
        .then(ok => {
          showToast(`Session ${p.sessionId} registered${ok ? " → GAS" : " (local only — check connection)"}`);
        });
    } else {
      showToast(`Session ${p.sessionId} registered (local)`);
    }
  };

  // ── Edit patient (update bed, dx, status, admitDOL) ──────────
  const handleEditPatient = (p) => {
    setPatients(prev => prev.map(x => x.sessionId === p.sessionId ? p : x));
    if (GAS_ON) {
      gasPost({ action: "registerPatient", patient: p })
        .then(ok => { if (ok) showToast(`${p.name || p.sessionId} อัปเดตแล้ว`); });
    } else {
      showToast(`${p.name || p.sessionId} อัปเดตแล้ว`);
    }
  };

  // ── Weight update (from Fenton chart logger) ──────────────────
  const handleWeightUpdate = (sessionId, weights) => {
    setPatients(prev => prev.map(p =>
      p.sessionId === sessionId ? { ...p, weights } : p
    ));
    if (GAS_ON) {
      gasPost({ action: "updateWeights", sessionId, weights });
      // weight saves are silent on success; errors surface via gasPost's error toast
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("neofeed_session");
    if (window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
    setUser(null);
  };

  if (!user) {
    return <LoginScreen onLogin={(u) => {
      sessionStorage.setItem("neofeed_session", JSON.stringify(u));
      setUser(u);
    }} />;
  }

  // Block the main UI until the first GAS sync completes — prevents mock patients
  // from being visible or interactable before real patient data arrives.
  if (GAS_ON && syncState === "loading") {
    return (
      <div style={{ position:"fixed", inset:0, display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center", gap:16,
        background:"var(--bg)", color:"var(--ink-2)", fontFamily:"'IBM Plex Sans',sans-serif" }}>
        <div style={{ width:36, height:36, border:"3px solid var(--line)",
          borderTopColor:"var(--brand)", borderRadius:"50%",
          animation:"spin 0.8s linear infinite" }} />
        <div style={{ fontSize:14, fontWeight:500 }}>Loading patient data…</div>
        <div style={{ fontSize:12, color:"var(--ink-3)" }}>Syncing from GAS</div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Top bar */}
      <div className="topbar">
        <div className="brandmark">
          <div className="logo">
            <svg viewBox="0 0 28 28" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 21 V 7 L 21 21 V 7" />
              <circle cx="21" cy="7" r="2.2" fill="#fff" stroke="none" />
            </svg>
          </div>
          <div>
            <div className="name">NeoFeed</div>
          </div>
        </div>

        <button
          className="switch-patient"
          onClick={() => setPickerOpen(true)}>
          <span className="sp-icon"><Icon name="search" size={13} color="var(--ink-2)" /></span>
          <span className="sp-label">Switch patient</span>
        </button>

        <div className="spacer" />

        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div className="pill" data-tip={GAS_ON ? "Google Apps Script · click to refresh" : "GAS_URL not configured"}>
            {syncState === "loading"
              ? <span className="dot dot-spin" style={{ width:7, height:7 }} />
              : <span className="dot" style={{ background:
                  syncState === "ok"    ? "var(--ok)"   :
                  syncState === "error" ? "var(--crit)" : "var(--line)" }} />
            }
            {syncState === "loading" ? "Syncing…" :
             syncState === "ok"      ? `GAS · ${lastSync ? lastSync.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }) : ""}` :
             syncState === "error"   ? "Sync error" : "Local only"}
          </div>
          {GAS_ON && (
            <button className="icon-btn" title="Sync now from GAS"
              onClick={syncFromGAS}
              style={{ opacity: syncState === "loading" ? 0.4 : 1, pointerEvents: syncState === "loading" ? "none" : "auto" }}>
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.8 0 3.4.87 4.4 2.2" />
                <polyline points="14,2 14,5 11,5" />
              </svg>
            </button>
          )}
        </div>



        <div className="user" onClick={handleLogout} style={{ cursor: "pointer" }} title="คลิกเพื่อออกจากระบบ">
          <div className="av">{(authName || "?").slice(0,2).toUpperCase()}</div>
          <div>
            <div className="name">{authName || user?.email || "—"}</div>
            <div className="role">{role === "admin" ? "Administrator · KCMH" : "Neonatology · KCMH"}</div>
          </div>
        </div>
      </div>

      {/* Rail */}
      <nav className="rail">
        <div className="rail-section">Workspace</div>
        <RailItem icon="users" label="Patients" active={view === "registry"} count={patients.length} onClick={() => setView("registry")} />
        {role === "doctor" && <RailItem icon="calc" label="Calculator" active={view === "calculator"} onClick={() => setView("calculator")} />}
        <RailItem icon="chart" label="Growth chart" active={view === "fenton"} onClick={() => setView("fenton")} />
        <RailItem icon="log" label="Daily log" active={view === "log"} count={(log[activeId] || []).length} onClick={() => setView("log")} />
        <RailItem icon="bell" label="Alerts" active={view === "alerts"} count={alertCount || null} crit={alertCount > 0} onClick={() => setView("alerts")} />
        {role === "admin" && <RailItem icon="chart" label="Admin dashboard" active={view === "admin"} onClick={() => setView("admin")} />}

        <div className="rail-section">Reference</div>
        <RailItem icon="info" label="Guidelines (ESPGHAN)" active={view === "guidelines"} onClick={() => setView("guidelines")} />
        <div className="rail-item" style={{ opacity:0.45, cursor:"default", pointerEvents:"none" }}>
          <Icon name="info" size={15} />
          <span>Drug compatibility</span>
          <span className="count" style={{ marginLeft:"auto", fontSize:10 }}>soon</span>
        </div>
        <RailItem icon="info" label="Formulas + products" active={view === "formulas"} onClick={() => setView("formulas")} />

        <div className="rail-foot">
          <div className="conn"><span className="dot" /> Sync · just now</div>
          <div style={{ marginTop: 4 }}>V2.0 · ESPGHAN 2018/2022</div>
        </div>
      </nav>

      {/* Workspace */}
      <main className="work">
        <div className="work-inner">
          {/* Banner: GAS connected but no real patients yet */}
          {GAS_ON && syncState === "ok" && patients.length === 0 && (
            <div style={{ padding:"12px 16px", background:"var(--brand-bg)", border:"1px solid var(--brand-line)",
              borderRadius:8, marginBottom:14, fontSize:13, color:"var(--brand-2)", display:"flex", alignItems:"center", gap:10 }}>
              <Icon name="info" size={14} color="var(--brand)" />
              ยังไม่มีผู้ป่วยในระบบ — ไปที่ <strong>Patients</strong> เพื่อลงทะเบียนผู้ป่วยใหม่
            </div>
          )}
          {view !== "registry" && active &&
          <PatientStrip patient={active} onSwitch={() => setPickerOpen(true)} liveWeight={calcWeights[activeId] || null} currentDol={dol} />
          }

          {view === "registry" && <PatientRegistry patients={patients} activeId={activeId} role={role} log={log} onSelect={(id) => {setActiveId(id);setView("calculator");}} onAdd={handleAddPatient} onEdit={handleEditPatient} />}
          {view === "admin" && <AdminDashboard patients={patients} log={log} />}
          {view === "calculator" && active &&
          <>
              <div className="page-head">
                <div>
                  <h1>TPN + Enteral nutrition order</h1>
                  <div className="sub">Real-time targets vs. ESPGHAN 2018 thresholds · Day of Life {dol}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn" onClick={() => {
                    document.querySelector('.work-inner')?.setAttribute('data-date', new Date().toLocaleDateString('th-TH'));
                    document.dispatchEvent(new CustomEvent('__neofeed_print'));
                  }}>
                    <Icon name="pdf" size={14} /> Print order
                  </button>
                  <button className="btn" onClick={() => setView("guidelines")}><Icon name="info" size={14} /> Reference values</button>
                </div>
              </div>
              <Calculator patient={active} dol={dol} onLog={handleLogToGAS}
                onWeightChange={(w) => setCalcWeights(prev => ({ ...prev, [activeId]: w }))} />
            </>
          }
          {view === "fenton" && active &&
          <>
              <div className="page-head">
                <div>
                  <h1>Fenton 2025 growth chart</h1>
                  <div className="sub">Plot weight, length, and HC by post-menstrual age · Fenton TR et al. 2025 (PMID 40534585)</div>
                </div>
              </div>
              <FentonChart patient={active} currentDol={dol} onUpdate={(weights) =>
                handleWeightUpdate(active.sessionId, weights)
              } />
            </>
          }
          {view === "log" && active && <DailyLog patient={active} log={log} />}
          {view === "alerts" && active && <AlertCenter patient={active} log={log} />}
          {view === "guidelines" && <GuidelinesPanel />}
          {view === "formulas" && <FormulasPanel />}
        </div>
      </main>

      {pickerOpen &&
      <PatientPicker patients={patients} activeId={activeId} onSelect={setActiveId} onClose={() => setPickerOpen(false)} />
      }

      <TweaksPanel title="Tweaks">
        <TweakSection label="Appearance">
          <TweakColor label="Brand accent"
          value={tweaks.accent}
          onChange={(v) => setTweak('accent', v)}
          options={["#2a7a8c", "#3b6f9e", "#4a5da3", "#2f7a5f", "#7a3f5e"]} />
        </TweakSection>
        <TweakSection label="Behavior">
        </TweakSection>
      </TweaksPanel>

      <BottomNav
        view={view}
        setView={setView}
        alertCount={alertCount}
        logCount={(log[activeId] || []).length}
        role={role}
      />

      <div id="toast-host" />
    </div>);

}

// ── Gestational/post-menstrual age formatter ─────────────────
// Input: decimal weeks (e.g. 28.43). Output: "28+3"
// Uses integer days internally → no floating point overflow (28+7 → 29+0)
// Format ISO date → Thai BE short, e.g. "15 พ.ค. 2569"
const THAI_MONTHS_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function fmtDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    const dd = d.getDate();
    const mo = THAI_MONTHS_SHORT[d.getMonth()];
    const yyyy = d.getFullYear() + 543; // Gregorian → พ.ศ.
    return `${dd} ${mo} ${yyyy}`;
  } catch { return iso; }
}
// Expose globally so registry.jsx / other modules can use the same formatter
window.NEOFEED_FMT_DATE = fmtDate;

// fmtGA: GA stored as WW.D shorthand (26.4 = 26 wk 4 d). Display "W+D".
// Delegates to D_A.fmtGA for single source of truth.
function fmtGA(ga) { return D_A.fmtGA(ga); }

function RailItem({ icon, label, active, count, crit, onClick }) {
  return (
    <div className={`rail-item ${active ? "active" : ""} ${crit ? "crit" : ""}`} onClick={onClick}>
      <Icon name={icon} size={15} />
      <span>{label}</span>
      {count && <span className="count">{count}</span>}
    </div>);

}

function PatientStrip({ patient, onSwitch, liveWeight, currentDol }) {
  const last = patient.weights[patient.weights.length - 1];
  const currentW = liveWeight ?? last.w;
  // Use calculated DOL if passed, else fall back to stored value
  const displayDol = currentDol ?? last.dol;
  const delta = currentW - patient.bw;
  const deltaPct = delta / patient.bw * 100;
  const [wtLabel, wtColor] = patient.bw < 1000
    ? ["ELBW", "var(--crit)"]
    : patient.bw < 1500 ? ["VLBW", "var(--warn)"] : ["LBW", "var(--ink-3)"];
  const deltaColor = deltaPct < -10 ? "var(--crit)" : deltaPct < 0 ? "oklch(45% 0.13 65)" : "var(--ok)";
  return (
    <div className="patient-strip">

      {/* ── Identity ── */}
      <div className="lead">
        <div className="lbl">Active session</div>
        <div className="pid">
          <div>
            <div className="id">{patient.name || patient.initials || "—"}</div>
            <div className="bed">
              Bed <span className="num">{patient.currentBed}</span>
              {" · DOL "}
              <span className="num" style={{ color:"var(--brand-2)", fontWeight:700 }}>{displayDol}</span>
            </div>
            <div className="bed">Admit {fmtDate(patient.admissionDate)}</div>
          </div>
        </div>
      </div>

      {/* ── GA ── */}
      <div>
        <div className="lbl">GA at birth</div>
        <div className="val num" style={{ color:"var(--brand-2)" }}>
          {fmtGA(patient.ga)}<span style={{ fontSize:11, color:"var(--ink-3)", marginLeft:4 }}>wk</span>
        </div>
        <div className="sub">{patient.sex === "boys" ? "Male" : "Female"}{patient.twinSuffix ? ` · Twin ${patient.twinSuffix}` : ""}</div>
      </div>

      {/* ── BW + Current weight — merged column ── */}
      <div style={{ padding:0, flexDirection:"row" }}>
        {/* BW — narrower half */}
        <div style={{ flex:"0 0 38%", padding:"10px 8px 10px 14px", display:"flex", flexDirection:"column" }}>
          <div className="lbl">Birth weight</div>
          <div className="val num">
            {patient.bw.toLocaleString()}<span style={{ fontSize:11, color:"var(--ink-3)", marginLeft:3 }}>g</span>
          </div>
          <div className="sub" style={{ color:wtColor, fontWeight:600 }}>{wtLabel}</div>
        </div>
        <div style={{ width:1, background:"var(--line-2)", alignSelf:"stretch" }} />
        {/* Current weight — wider half, val + delta on one line */}
        <div style={{ flex:"1 1 62%", padding:"10px 14px 10px 10px", display:"flex", flexDirection:"column" }}>
          <div className="lbl">Current weight</div>
          <div style={{ display:"flex", alignItems:"baseline", gap:7, marginTop:1, flexWrap:"nowrap" }}>
            <span className="num" style={{ fontFamily:"IBM Plex Mono,monospace", fontSize:17, fontWeight:500, letterSpacing:"-0.01em" }}>
              {currentW.toLocaleString()}<span style={{ fontSize:11, color:"var(--ink-3)", marginLeft:3 }}>g</span>
            </span>
            <span style={{ fontSize:12, color:deltaColor, fontWeight:700, whiteSpace:"nowrap" }}>
              {delta >= 0 ? "+" : ""}{delta}g ({deltaPct.toFixed(1)}%)
            </span>
          </div>
        </div>
      </div>

      {/* ── PMA ── */}
      <div>
        <div className="lbl">PMA</div>
        <div className="val num" style={{ color:"var(--brand-2)" }}>
          {fmtGA(D_A.pmaShort(patient.ga, displayDol))}<span style={{ fontSize:11, color:"var(--ink-3)", marginLeft:4 }}>wk</span>
        </div>
        <div className="sub">Day of life {displayDol}</div>
      </div>

      {/* ── Diagnosis ── */}
      <div>
        <div className="lbl">Diagnosis</div>
        <div className="val" style={{ fontSize:13, lineHeight:1.3, fontWeight:700 }}>{patient.diagnosis}</div>
      </div>

      {/* ── Status ── */}
      <div>
        <div className="lbl">Status</div>
        <div className="val" style={{ fontSize:13 }}><span className="chip ok"><span className="d" />{patient.status}</span></div>
      </div>

    </div>);
}

// ============================================================
// Alert center (cross-cutting view)
// ============================================================
function AlertCenter({ patient, log }) {
  const entries = log[patient.sessionId] || [];
  const last = entries[entries.length - 1];

  // Synthesize alerts from latest log entry vs targets
  const alerts = [];
  if (last) {
    const tGir  = D_A.TARGETS.gir();
    const tPro  = D_A.TARGETS.protein(last.dol);
    const tKcal = D_A.TARGETS.kcal(last.dol);
    if (last.gir > tGir[1]) alerts.push({ level: "crit", title: "GIR critically high", body: `Logged GIR ${last.gir} mg/kg/min — reduce dextrose concentration.`, dol: last.dol, ref: "ESPGHAN 2018" });
    if (last.pro < tPro[0] && last.dol > 2) alerts.push({ level: "warn", title: "Protein below DOL target", body: `${last.pro} g/kg/d on DOL ${last.dol} — target ${tPro[0]}–${tPro[1]} g/kg/d (ESPGHAN 2018).`, dol: last.dol, ref: "ESPGHAN 2018" });
    if (last.kcal < tKcal[0] && last.dol > 4) alerts.push({ level: "warn", title: "Energy below growth target", body: `${last.kcal} kcal/kg/d — target ${tKcal[0]}–${tKcal[1]} kcal/kg/d for DOL ${last.dol}.`, dol: last.dol, ref: "ESPGHAN" });
  }

  // Growth velocity — from patient.weights (Fenton chart data, most reliable)
  const wts = patient.weights || [];
  if (wts.length >= 2) {
    const recent = wts.slice(-Math.min(wts.length, 7));
    const wFirst = recent[0], wLast = recent[recent.length - 1];
    const dW = wLast.w - wFirst.w;
    const days = Math.max(1, wLast.dol - wFirst.dol);
    const avgKg = (wFirst.w + wLast.w) / 2 / 1000;
    const vel = dW / days / avgKg;
    if (vel < 15) alerts.push({
      level: vel < 10 ? "crit" : "warn",
      title: vel < 10 ? "Growth velocity critically low" : "Growth velocity below target",
      body: `${vel.toFixed(1)} g/kg/d over ${days} d (DOL ${wFirst.dol}→${wLast.dol}) — target ≥15 g/kg/d (ESPGHAN 2022 ≥17–20 for catch-up).`,
      dol: wLast.dol, ref: "ESPGHAN 2022"
    });
  }

  // Stale weight: warn when no weight measurement in 3+ days
  const lastWtEntry = (patient.weights || []).slice(-1)[0];
  const todaysDol = D_A.liveDol(patient);
  if (lastWtEntry) {
    const daysSince = todaysDol - lastWtEntry.dol;
    if (daysSince >= 3) {
      alerts.push({
        level: daysSince >= 7 ? "crit" : "warn",
        title: daysSince >= 7 ? "Weight measurement >7 days overdue" : "Weight measurement stale",
        body: `Last weight ${lastWtEntry.w} g on DOL ${lastWtEntry.dol} — ${daysSince} days ago. ESPGHAN: daily weights for VLBW/ELBW infants.`,
        dol: todaysDol, ref: "ESPGHAN 2022"
      });
    }
  }

  // System info
  alerts.push({ level: "info", title: "Weekly electrolyte audit due", body: "Last serum electrolytes >72 h ago. Consider re-check given current Na/K delivery.", dol: last?.dol, ref: "KCMH protocol" });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Alert center</h1>
          <div className="sub">Cross-cutting safety signals based on latest logged values · <span>{patient.name || patient.initials || "—"}</span></div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn"><Icon name="check" size={14} /> Acknowledge all</button>
        </div>
      </div>

      <div className="alert-summary-tiles">
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.06 }}>Active critical</div>
          <div className="num" style={{ fontSize: 32, fontWeight: 500, color: "var(--crit)" }}>{alerts.filter((a) => a.level === "crit").length}</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.06 }}>Cautions</div>
          <div className="num" style={{ fontSize: 32, fontWeight: 500, color: "oklch(45% 0.13 65)" }}>{alerts.filter((a) => a.level === "warn").length}</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.06 }}>Info / reminders</div>
          <div className="num" style={{ fontSize: 32, fontWeight: 500, color: "var(--brand)" }}>{alerts.filter((a) => a.level === "info").length}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <Icon name="bell" size={14} color="var(--brand)" /> Patient alerts
          <span className="h-meta">{alerts.length} total</span>
        </div>
        <div className="card-b" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {alerts.map((a, i) =>
          <div key={i} className={`alert-row ${a.level}`}>
              <div className="ico">{a.level === "crit" ? "!" : a.level === "warn" ? "!" : "i"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="title">{a.title}</span>
                  <span style={{ fontSize: 11, color: "var(--ink-3)" }} className="mono">DOL {a.dol}</span>
                </div>
                <div className="body">{a.body}</div>
                <div className="meta">Ref: {a.ref}</div>
              </div>
              <button className="btn sm">Acknowledge</button>
            </div>
          )}
        </div>
      </div>
    </>);

}

// ============================================================
// Login screen — email + password (any domain)
// ============================================================
function LoginScreen({ onLogin }) {
  const [email, setEmail]     = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError]     = React.useState(null);
  const [showPwd, setShowPwd] = React.useState(false);

  const submit = async (e) => {
    e && e.preventDefault();
    if (!email.trim() || !password) { setError("กรุณากรอก email และรหัสผ่าน"); return; }
    setLoading(true); setError(null);
    try {
      const res  = await fetch(window.NEOFEED_GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "login", email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (data.status !== "ok") throw new Error(data.error || "ไม่พบบัญชีนี้ในระบบ");
      onLogin({ name: data.name, role: data.role, email: data.email, token: data.token });
    } catch (err) {
      setError(err.message || "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง");
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-logo-mark">
        <svg viewBox="0 0 36 36" width="52" height="52" fill="none"
          stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 27 V 9 L 27 27 V 9" />
          <circle cx="27" cy="9" r="3" fill="#fff" stroke="none" />
        </svg>
      </div>

      <div className="login-app-name">NeoFeed</div>
      <div className="login-tagline">Neonatal nutrition,<br />calculated precisely</div>

      <form className="login-btn-area" onSubmit={submit}
        style={{ display: "flex", flexDirection: "column", gap: 10, padding: 0 }}>

        <input
          className="inp"
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoComplete="username"
          disabled={loading}
          style={{ width: "100%", fontSize: 14 }}
        />

        <div style={{ position: "relative", width: "100%" }}>
          <input
            className="inp"
            type={showPwd ? "text" : "password"}
            placeholder="รหัสผ่าน"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={loading}
            style={{ width: "100%", fontSize: 14, paddingRight: 40 }}
          />
          <button type="button"
            onClick={() => setShowPwd(s => !s)}
            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)",
              fontSize: 13, padding: 4 }}>
            {showPwd ? "ซ่อน" : "แสดง"}
          </button>
        </div>

        <button className="btn primary" type="submit" disabled={loading}
          style={{ width: "100%", height: 44, fontSize: 14, marginTop: 2 }}>
          {loading
            ? <><span style={{ display: "inline-block", width: 14, height: 14,
                border: "2px solid rgba(255,255,255,.4)", borderTopColor: "#fff",
                borderRadius: "50%", animation: "spin .9s linear infinite",
                marginRight: 8, verticalAlign: "middle" }} />กำลังตรวจสอบ...</>
            : "เข้าสู่ระบบ"}
        </button>
      </form>

      {error && <div className="login-error">⚠️ {error}</div>}
      <div className="login-footer">VALHALLA TEAM &nbsp;·&nbsp; V2.0</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ============================================================
// Admin dashboard — read-only oversight, syncs from GAS
// ============================================================
function AdminDashboard({ patients, log }) {
  const totalLogs = Object.values(log).reduce((a, l) => a + l.length, 0);
  const active = patients.filter(p => p.status === "Active").length;
  const allEntries = patients.flatMap(p => (log[p.sessionId] || []).map(e => ({ ...e, sid: p.sessionId, bed: p.currentBed })));
  // Compute alert count across all patients (same logic as per-patient alertCount memo)
  const alertsTotal = patients.reduce((sum, p) => {
    const entries = log[p.sessionId] || [];
    const last = entries[entries.length - 1];
    if (!last) return sum;
    let n = 0;
    if (last.gir  > D_A.TARGETS.gir()[1])                        n++;
    if (last.pro  < D_A.TARGETS.protein(last.dol)[0] && last.dol > 2) n++;
    if (last.kcal < D_A.TARGETS.kcal(last.dol)[0]    && last.dol > 4) n++;
    return sum + n;
  }, 0);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Admin dashboard</h1>
          <div className="sub">Read-only oversight · pulled from GAS Patient_Registry & Daily_Log</div>
        </div>
        <div className="pill"><span className="dot" style={{ background: "var(--brand)" }} /> Synced just now</div>
      </div>
      <div className="admin-stat-tiles">
        {[
          ["Active sessions", active, "var(--brand)"],
          ["Total patients", patients.length, "var(--ink)"],
          ["Logged entries", totalLogs, "var(--ok)"],
          ["Active alerts", alertsTotal, "oklch(45% 0.13 65)"]
        ].map(([l, v, c]) =>
          <div key={l} className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.06 }}>{l}</div>
            <div className="num" style={{ fontSize: 30, fontWeight: 500, color: c }}>{v}</div>
          </div>
        )}
      </div>
      <div className="card">
        <div className="card-h"><Icon name="log" size={14} color="var(--brand)" /> Recent log entries<span className="h-meta">{allEntries.length} total</span></div>
        <div className="card-b" style={{ padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead><tr style={{ background: "var(--bg-2)", textAlign: "left" }}>
              <th style={{ padding: "8px 12px", fontWeight: 500, color: "var(--ink-3)" }}>Session</th>
              <th style={{ padding: "8px 12px", fontWeight: 500, color: "var(--ink-3)" }}>Bed</th>
              <th style={{ padding: "8px 12px", fontWeight: 500, color: "var(--ink-3)" }}>DOL</th>
              <th style={{ padding: "8px 12px", fontWeight: 500, color: "var(--ink-3)" }}>Wt (g)</th>
              <th style={{ padding: "8px 12px", fontWeight: 500, color: "var(--ink-3)" }}>kcal</th>
              <th style={{ padding: "8px 12px", fontWeight: 500, color: "var(--ink-3)" }}>Protein</th>
              <th style={{ padding: "8px 12px", fontWeight: 500, color: "var(--ink-3)" }}>Route</th>
            </tr></thead>
            <tbody>
              {allEntries.slice(-20).reverse().map((e, i) =>
                <tr key={i} style={{ borderTop: "1px solid var(--line-2)" }}>
                  <td className="num" style={{ padding: "8px 12px" }}>{e.sid}</td>
                  <td className="num" style={{ padding: "8px 12px" }}>{e.bed}</td>
                  <td className="num" style={{ padding: "8px 12px" }}>{e.dol}</td>
                  <td className="num" style={{ padding: "8px 12px" }}>{e.weight}</td>
                  <td className="num" style={{ padding: "8px 12px" }}>{e.kcal}</td>
                  <td className="num" style={{ padding: "8px 12px" }}>{e.pro}</td>
                  <td style={{ padding: "8px 12px", color: "var(--ink-2)" }}>{e.route}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ============================================================
// BottomNav — mobile-only tab bar (≤767px)
// ============================================================
function BottomNav({ view, setView, alertCount, logCount, role }) {
  const tabs = [
    { id: "registry",   icon: "users",  label: "Patients" },
    ...(role === "doctor" ? [{ id: "calculator", icon: "calc", label: "Calc" }] : []),
    { id: "fenton",     icon: "chart",  label: "Growth"   },
    { id: "log",        icon: "log",    label: "Log",    badge: logCount   },
    { id: "alerts",     icon: "bell",   label: "Alerts", badge: alertCount },
  ];
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {tabs.map(t => (
        <button
          key={t.id}
          className={`bnav-item${view === t.id ? " active" : ""}`}
          onClick={() => setView(t.id)}
          aria-label={t.label}
        >
          {t.badge > 0 && <span className="bnav-badge">{t.badge}</span>}
          <Icon name={t.icon} size={23} color={view === t.id ? "var(--brand)" : "var(--ink-4)"} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

// ============================================================
// GuidelinesPanel — ESPGHAN 2018 PN + 2022 EN quick reference
// ============================================================
function GuidelinesPanel() {
  const G = D_A.ESPGHAN_TARGETS;
  const [tab, setTab] = React.useState("pn");

  const Seg = ({ tabs, active, onChange }) => (
    <div className="seg" style={{ marginBottom: 18 }}>
      {tabs.map(([id, label]) =>
        <button key={id} className={active === id ? "on" : ""} onClick={() => onChange(id)}>{label}</button>
      )}
    </div>
  );

  const RangeRow = ({ label, min, max, unit, note, highlight }) => (
    <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1.2fr", gap: 8, alignItems: "center",
      padding: "7px 0", borderBottom: "1px solid var(--line-2)" }}>
      <div>
        <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>{label}</span>
        {note && <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 1 }}>{note}</div>}
      </div>
      <div className="num" style={{ fontWeight: 600, fontSize: 13,
        color: highlight ? "var(--brand-2)" : "var(--ink)" }}>
        {min}–{max}
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{unit}</div>
    </div>
  );

  const SectionHead = ({ children }) => (
    <div className="sub-h" style={{ marginTop: 18 }}>{children}</div>
  );

  const Badge = ({ children, color = "var(--brand-bg)", text = "var(--brand-2)" }) => (
    <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 999, background: color,
      color: text, fontWeight: 600, marginLeft: 6 }}>{children}</span>
  );

  // ── Phase table helper (fluid, electrolytes) ───────────────
  const PhaseTable = ({ rows, cols }) => (
    <div style={{ overflowX: "auto", marginTop: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "var(--bg-2)" }}>
            {cols.map((c, i) => <th key={i} style={{ padding: "6px 10px", textAlign: i === 0 ? "left" : "center",
              fontWeight: 600, color: "var(--ink-3)", fontSize: 11, letterSpacing: "0.04em",
              borderBottom: "1px solid var(--line)" }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--line-2)", background: i % 2 === 0 ? "var(--surface)" : "var(--bg-2)" }}>
              {r.map((cell, j) => (
                <td key={j} style={{ padding: "6px 10px", textAlign: j === 0 ? "left" : "center",
                  fontFamily: j > 0 ? "IBM Plex Mono, monospace" : "inherit",
                  fontWeight: j > 0 ? 500 : 400, fontSize: j === 0 ? 12 : 12.5 }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // ── Alert rule chip ────────────────────────────────────────
  const Rule = ({ level, title, body }) => (
    <div className={`alert-row ${level}`} style={{ marginBottom: 6 }}>
      <div className="ico">{level === "crit" ? "!" : "i"}</div>
      <div>
        <div className="title">{title}</div>
        <div className="body">{body}</div>
      </div>
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clinical Guidelines</h1>
          <div className="sub">
            ESPGHAN/ESPEN/ESPR/CSPEN 2018 (PN) · ESPGHAN CoN 2022 (EN) · WHO 2023 · Fenton 2025
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", textAlign: "right" }}>
          Quick reference for bedside use<br/>
          <span style={{ color: "var(--brand)" }}>Not a substitute for clinical judgment</span>
        </div>
      </div>

      <Seg
        tabs={[["pn","💉 PN (ESPGHAN 2018)"], ["en","🍼 EN (ESPGHAN 2022)"], ["who","🌍 WHO 2023"]]}
        active={tab}
        onChange={setTab}
      />

      {/* ═══════════ PN TAB ═══════════ */}
      {tab === "pn" && (
        <div className="guidelines-grid">

          {/* Amino Acids */}
          <div className="card">
            <div className="card-h">
              <Icon name="drop" size={14} color="var(--brand)" />
              Amino Acids
              <Badge>R3.1 LOE 1++ · R3.2 LOE 1+</Badge>
            </div>
            <div className="card-b">
              <RangeRow label="Day 1 (preterm)" min="1.5" max="2.5" unit="g/kg/day"
                note="Start from birth or ASAP — avoid 'metabolic shock'" highlight />
              <RangeRow label="Day 2+ (preterm)" min="2.5" max="3.5" unit="g/kg/day"
                note="Needs non-protein energy ≥65 kcal/kg to utilise AA" highlight />
              <RangeRow label="Above 3.5 g/kg" min="—" max="—" unit="" note="Research only (LOE 2+, RG 0)" />
              <RangeRow label="Term stable" min="1.5" max="3.0" unit="g/kg/day" />
              <SectionHead>Specific AAs</SectionHead>
              <RangeRow label="Cysteine" min="50" max="75" unit="mg/kg/day" note="Conditionally essential — add to preterm PN" />
              <RangeRow label="Glutamine" min="—" max="—" unit="" note="Do NOT supplement ≤2 yr (LOE 1++, RG A)" />
              <RangeRow label="Arginine" min="—" max="—" unit="" note="May use for NEC prevention (LOE 1-, RG B)" />
            </div>
          </div>

          {/* GIR */}
          <div className="card">
            <div className="card-h">
              <Icon name="drop" size={14} color="var(--brand)" />
              Glucose Infusion Rate (GIR)
            </div>
            <div className="card-b">
              <RangeRow label="Start (preterm)" min="4" max="8" unit="mg/kg/min" highlight />
              <RangeRow label="Target (preterm)" min="8" max="10" unit="mg/kg/min"
                note="Optimal anabolism without excess lipogenesis" highlight />
              <RangeRow label="Max (all)" min="—" max="12" unit="mg/kg/min"
                note=">12 → ↑lipogenesis, ↑TG, ↑CO₂, ventilator weaning difficulty" />
              <RangeRow label="Advance" min="+1" max="+2" unit="mg/kg/min per day" />
              <RangeRow label="Term start" min="2.5" max="5" unit="mg/kg/min" />
              <SectionHead>Hyperglycemia management</SectionHead>
              <Rule level="warn" title="BG >145 mg/dL" body="Reduce GIR first (step down 1–2 mg/kg/min)" />
              <Rule level="crit" title="BG >180 mg/dL persistent" body="Insulin 0.01–0.05 U/kg/hr — only after GIR minimised" />
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 8 }}>
                Peripheral IV: max dextrose <strong>12.5%</strong>
              </div>
            </div>
          </div>

          {/* Lipid */}
          <div className="card">
            <div className="card-h">
              <Icon name="drop" size={14} color="var(--brand)" />
              Lipid Emulsion
            </div>
            <div className="card-b">
              <RangeRow label="Start (Day 1–2)" min="0.5" max="1.0" unit="g/kg/day" highlight />
              <RangeRow label="Advance" min="+0.5" max="+1.0" unit="g/kg/day per day" />
              <RangeRow label="Max" min="—" max="4.0" unit="g/kg/day" />
              <RangeRow label="TG threshold" min="—" max="265" unit="mg/dL → reduce ILE" />
              <div style={{ marginTop: 10, padding: "8px 10px", background: "var(--brand-bg)",
                borderRadius: 6, fontSize: 11.5, color: "var(--ink-2)" }}>
                <strong>SMOF lipid preferred</strong> — composite ILE (soy+MCT+olive+fish oil)
                reduces PNALD risk vs pure soy-based. Protect all lipid from light.
              </div>
              <div style={{ marginTop: 8, padding: "8px 10px", background: "var(--bg-2)",
                borderRadius: 6, fontSize: 11.5 }}>
                20% ILE = <strong className="mono">2.0 kcal/mL</strong> · 1 g fat = 5 mL SMOF 20%
              </div>
            </div>
          </div>

          {/* Ca / P / Mg */}
          <div className="card">
            <div className="card-h">
              <Icon name="drop" size={14} color="var(--brand)" />
              Ca · P · Mg (PN)
              <Badge>Mihatsch 2018</Badge>
            </div>
            <div className="card-b">
              <SectionHead>Day 1</SectionHead>
              <RangeRow label="Ca" min="0.8" max="2.0" unit="mmol/kg/day = 32–80 mg/kg" highlight />
              <RangeRow label="P" min="1.0" max="2.0" unit="mmol/kg/day = 31–62 mg/kg" highlight />
              <RangeRow label="Mg" min="0.1" max="0.2" unit="mmol/kg/day" />
              <SectionHead>Growing preterm (D2+)</SectionHead>
              <RangeRow label="Ca" min="1.6" max="3.5" unit="mmol/kg/day = 64–140 mg/kg" highlight />
              <RangeRow label="P" min="1.5" max="2.0" unit="mmol/kg/day = 46–62 mg/kg" highlight />
              <RangeRow label="Mg" min="0.2" max="0.3" unit="mmol/kg/day" />
              <SectionHead>Ca:P ratio</SectionHead>
              <RangeRow label="Molar (PN)" min="0.8" max="1.3" unit=":1 — target 1.3:1 for stable growth" highlight />
              <RangeRow label="Mass ratio" min="1.0" max="1.7" unit=":1 (Ca g / P g)" />
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--ink-3)" }}>
                Use <strong>Glycophos®</strong> (organic P) — avoids CaPO₄ precipitation.
                1 mL = 1 mmol P + 2 mmol Na.
              </div>
            </div>
          </div>

          {/* Fluid table */}
          <div className="card" style={{ gridColumn: "1 / -1" }}>
            <div className="card-h">
              <Icon name="drop" size={14} color="var(--brand)" />
              Fluid targets (mL/kg/day) by DOL + birth weight
              <Badge>Jochum 2018</Badge>
            </div>
            <div className="card-b">
              <PhaseTable
                cols={["BW category", "DOL 1", "DOL 2", "DOL 3", "DOL 4", "DOL 5+"]}
                rows={[
                  ["ELBW <1000g",   "80–100","100–120","120–140","140–160","160–180"],
                  ["VLBW 1000–1500g","70–90", "90–110","110–130","130–150","140–160"],
                  ["Preterm >1500g", "60–80", "80–100","100–120","120–140","140–160"],
                  ["Term ≥2500g",    "40–60", "50–70", "60–80", "60–100","100–140"],
                ]}
              />
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--ink-3)" }}>
                ELBW in humidified incubator (80–90%): IWL ≈30 mL/kg/day.
                Open warmer: IWL up to 120 mL/kg/day. Target UO 1–3 mL/kg/hr.
              </div>
            </div>
          </div>

          {/* Electrolytes table */}
          <div className="card" style={{ gridColumn: "1 / -1" }}>
            <div className="card-h">
              <Icon name="drop" size={14} color="var(--brand)" />
              Electrolytes (mmol/kg/day) by phase
              <Badge>Jochum 2018</Badge>
            </div>
            <div className="card-b">
              <PhaseTable
                cols={["Electrolyte","Transition (D1–2)","Intermediate (D3–7)","Stable (D8+)","Notes"]}
                rows={[
                  ["Na — ELBW <1kg",  "0–2","0–5","2–7", "High Na loss possible; guided by serum Na"],
                  ["Na — Preterm",    "0–2","0–3","2–5", "Withhold D1–2; add when UO established"],
                  ["Na — Term",       "0–2","0–2","1–3", ""],
                  ["K — All",         "0–3","0–3","2–3", "Avoid routine K in D1–2 ELBW (hyperkalemia risk)"],
                  ["Cl — All",        "0–3","0–3","2–5", "Keep Na+K > Cl by 1–2 mmol/kg to avoid acidosis"],
                ]}
              />
              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[
                  ["Zn (preterm)", "400–500 µg/kg/day"],
                  ["Fe (preterm)", "200–250 µg/kg/day"],
                  ["Cu", "40 µg/kg/day"],
                ].map(([l,v]) => (
                  <div key={l} style={{ background: "var(--bg-2)", borderRadius: 6, padding: "8px 10px" }}>
                    <div style={{ fontSize: 10.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</div>
                    <div className="num" style={{ fontWeight: 600, fontSize: 13 }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--ink-3)" }}>
                Peditrace® 1–2 mL/kg/day covers Zn, Cu, Se, Mn, I.
                Vitalipid N Infant: BW {'<'}2.5 kg → 4 mL/kg · BW ≥2.5 kg → 10 mL/day (lipid bag).
                Soluvit N: 1 mL/kg/day (aqueous bag).
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ═══════════ EN TAB ═══════════ */}
      {tab === "en" && (
        <div className="guidelines-grid">

          {/* Macronutrients */}
          <div className="card">
            <div className="card-h">
              <Icon name="milk" size={14} color="var(--brand)" />
              Macronutrients
              <Badge>ESPGHAN CoN 2022</Badge>
            </div>
            <div className="card-b">
              <RangeRow label="Energy" min="115" max="140" unit="kcal/kg/day (max 160 for catch-up)" highlight />
              <RangeRow label="Protein" min="3.5" max="4.0" unit="g/kg/day (max 4.5)" highlight />
              <RangeRow label="P:E ratio" min="2.8" max="3.6" unit="g/100 kcal — ensures lean mass" />
              <RangeRow label="Fat" min="4.8" max="8.1" unit="g/kg/day (↑ from 2010)" />
              <RangeRow label="DHA" min="30" max="65" unit="mg/kg/day (↑↑ from 12–30)" highlight />
              <RangeRow label="ARA" min="30" max="100" unit="mg/kg/day (↑ from 18–42)" />
              <RangeRow label="CHO" min="11" max="17" unit="g/kg/day" />
              <RangeRow label="Fluid" min="150" max="180" unit="mL/kg/day (target 165)" />
            </div>
          </div>

          {/* Minerals */}
          <div className="card">
            <div className="card-h">
              <Icon name="drop" size={14} color="var(--brand)" />
              Minerals + Vitamins
              <Badge>ESPGHAN CoN 2022</Badge>
            </div>
            <div className="card-b">
              <RangeRow label="Na" min="3.0" max="5.0" unit="mmol/kg/day (up to 8.0 ELBW)" highlight />
              <RangeRow label="K" min="2.3" max="4.6" unit="mmol/kg/day (↑↑ from 1.7–3.4)" highlight />
              <RangeRow label="Ca" min="120" max="200" unit="mg/kg/day = 3.0–5.0 mmol/kg (↑)" highlight />
              <RangeRow label="P" min="70" max="115" unit="mg/kg/day = 2.2–3.7 mmol/kg (↑)" highlight />
              <SectionHead>Vitamins + trace (enteral)</SectionHead>
              <RangeRow label="Vitamin D" min="400" max="700" unit="IU/kg/day (⚠️ per kg, not per day!)" highlight />
              <RangeRow label="Iron" min="2" max="3" unit="mg/kg/day, start at 2 wks (up to 6)" />
              <RangeRow label="Zinc" min="2.0" max="3.0" unit="mg/kg/day (↑↑ from 1.1–2.0)" highlight />
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--ok)", fontWeight: 500 }}>
                ✅ Key 2022 changes: DHA↑ · K↑ · Ca↑ · P↑ · Zn↑ · Vit D switched to per kg/day
              </div>
            </div>
          </div>

          {/* Feeding advancement */}
          <div className="card" style={{ gridColumn: "1 / -1" }}>
            <div className="card-h">
              <Icon name="milk" size={14} color="var(--brand)" />
              Feeding Advancement Protocol
            </div>
            <div className="card-b">
              <div className="feeding-steps-grid">
                {[
                  ["1. Start ASAP", "12–24 mL/kg/day", "MEF (trophic)", "Day 1 — even ELBW", "GOR B"],
                  ["2. Advance", "+18–30 mL/kg/day", "per day", "WHO 2023: up to 30 safe", "Mod certainty"],
                  ["3. Fortify", "≥40 mL/kg/day", "Start HMF", "<32 wk or <1.5 kg on MOM/DHM", "WHO 2023"],
                  ["4. Full EN", "≥100 mL/kg/day", "Wean PN", "KCMH threshold · switch to EN targets", "KCMH practice"],
                  ["5. Oral feed", "PMA ≥32 wks", "Non-nutritive", "Support breastfeeding", ""],
                ].map(([step, vol, label, note, ref], i) => (
                  <div key={i} style={{ padding: "12px 10px", textAlign: "center",
                    background: i % 2 === 0 ? "var(--surface)" : "var(--bg-2)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--brand-2)", marginBottom: 4 }}>{step}</div>
                    <div className="num" style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{vol}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 2 }}>{label}</div>
                    <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 4 }}>{note}</div>
                    {ref && <div style={{ fontSize: 10, color: "var(--brand)", marginTop: 2 }}>{ref}</div>}
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Rule level="info" title="No routine gastric residual monitoring"
                  body="Not recommended in stable preterm infants (ESPGHAN 2022 GOR B). Check only if: abdominal distension, tenderness, bilious vomiting, bloody stools." />
                <Rule level="info" title="Scheduled feeding preferred"
                  body="q2–3h scheduled feeds for <34 wk, rather than demand feeding — until hospital discharge (WHO 2023, conditional)." />
              </div>

              <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--brand-bg)",
                borderRadius: 8, fontSize: 12, color: "var(--ink-2)" }}>
                <strong>Growth targets (ESPGHAN 2022):</strong> Weight ≥17–20 g/kg/day · Length ≥0.8 cm/wk · HC ≥0.5 cm/wk
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ═══════════ WHO 2023 TAB ═══════════ */}
      {tab === "who" && (
        <div className="guidelines-grid">

          <div className="card" style={{ gridColumn: "1 / -1" }}>
            <div className="card-h">
              <Icon name="info" size={14} color="var(--brand)" />
              WHO 2023 Preterm Feeding — New & Changed Recommendations
            </div>
            <div className="card-b">
              {[
                { level:"crit", title:"Ca/P supplementation: NOT recommended",
                  body:"Changed from 2015 — routine Ca/P supplement for formula-fed preterm/LBW no longer recommended (insufficient evidence)." },
                { level:"info", title:"Early enteral feeding from Day 1 (Strong, Moderate certainty)",
                  body:"All preterm/LBW including <32 wk and <1.5 kg. Clinically stable or not. Base on clinical judgment for unstable infants." },
                { level:"info", title:"Feed advancement: up to 30 mL/kg/day (Conditional, Moderate certainty)",
                  body:"All trials compared fast (30–40 mL/kg/day) vs slow (10–25). Fast advancement: ↓ time to regain BW, ↓ LOS. No ↑ NEC." },
                { level:"info", title:"HMF: conditionally recommended for <32 wk or <1.5 kg on MOM/DHM",
                  body:"Start when EN ≥100 mL/kg/day. Use commercially available multicomponent HMF formulated for preterm infants." },
                { level:"info", title:"Iron: 2–4 mg/kg/day (Strong, Moderate certainty)",
                  body:"For human milk-fed preterm/LBW not receiving iron from another source. Start when EN established." },
                { level:"info", title:"Zinc: 1–3 mg/kg/day (Conditional, Low certainty)",
                  body:"For human milk-fed preterm/LBW. Initiate when EN established." },
                { level:"info", title:"Vitamin D: 400–800 IU/day (Conditional, Low certainty)",
                  body:"For human milk-fed preterm/LBW. Note: WHO says per day (not per kg as ESPGHAN 2022). Use clinical judgment." },
                { level:"warn", title:"Scheduled feeds q2–3h preferred over demand (Conditional, Low certainty)",
                  body:"For <34 wk in health facilities until discharge. Balance with nurturing/responsive caregiving." },
                { level:"info", title:"Probiotics: conditionally recommended for <32 wk on human milk",
                  body:"Moderate certainty for ↓ mortality, NEC, invasive infection. Use only regulatory-approved formulations." },
              ].map((a, i) => (
                <div key={i} className={`alert-row ${a.level}`} style={{ marginBottom: 8 }}>
                  <div className="ico">{a.level === "crit" ? "!" : a.level === "warn" ? "!" : "i"}</div>
                  <div>
                    <div className="title">{a.title}</div>
                    <div className="body">{a.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick compare 2022 vs 2010 */}
          <div className="card" style={{ gridColumn: "1 / -1" }}>
            <div className="card-h">
              <Icon name="info" size={14} color="var(--brand)" />
              ESPGHAN 2022 vs 2010 — Key numeric changes
            </div>
            <div className="card-b">
              <PhaseTable
                cols={["Nutrient","ESPGHAN 2010","ESPGHAN 2022","Change","Unit"]}
                rows={[
                  ["Energy",    "110–135", "115–140 (max 160)", "↑ upper", "kcal/kg/day"],
                  ["Protein",   "3.5–4.5", "3.5–4.0 (max 4.5)", "Quality focus", "g/kg/day"],
                  ["Fat",       "4.8–6.6", "4.8–8.1",           "↑↑ upper",      "g/kg/day"],
                  ["DHA",       "12–30",   "30–65",              "↑↑",            "mg/kg/day"],
                  ["ARA",       "18–42",   "30–100",             "↑",             "mg/kg/day"],
                  ["Na",        "3.0–5.0", "3.0–5.0 (–8.0)",    "↑ upper range", "mmol/kg/day"],
                  ["K",         "1.7–3.4", "2.3–4.6",           "↑↑ both ends",  "mmol/kg/day"],
                  ["Ca",        "3.0–3.5 mmol","3.0–5.0 mmol",  "↑ upper",       "mmol/kg/day"],
                  ["P",         "1.9–2.9 mmol","2.2–3.7 mmol",  "↑",             "mmol/kg/day"],
                  ["Vitamin D", "800–1000 IU/day","400–700 IU/kg/day","Per kg now!","IU"],
                  ["Iron",      "2–3 mg/kg", "2–3 (up to 6)",   "≈same",         "mg/kg/day"],
                  ["Zinc",      "1.1–2.0", "2.0–3.0",           "↑↑",            "mg/kg/day"],
                ]}
              />
            </div>
          </div>

        </div>
      )}
    </>
  );
}

// ============================================================
// FormulasPanel — KCMH formula composition reference
// ============================================================
function FormulasPanel() {
  const DB = D_A.EN_DB;
  const groups = [
    { label: "🤱 Breast Milk", keys: ["BM_20","BM_HMF_24"] },
    { label: "🥛 HiQ LF (Dumex)", keys: ["HIQLF_20","HIQLF_24","HIQLF_27"] },
    { label: "🍼 Enfalac LF (MJN)", keys: ["ENFALAC_20","ENFALAC_24","ENFALAC_27"] },
    { label: "⚡ High-energy / Mixed", keys: ["BM_PF_20","FBM_PF_22","FBM_PF_24","FBM_INF_MIX","INFATRINI_30"] },
  ];

  const cols = ["Formula","kcal","Protein","Fat","Na","K","Ca","P","Osm","LF?","Note"];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Formula + Feed Reference</h1>
          <div className="sub">KCMH NICU formulary · per 100 mL prepared formula</div>
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
          Units: kcal · g · mmol (Na/K) · mg (Ca/P)
        </div>
      </div>

      {groups.map(({ label, keys }) => (
        <div key={label} className="card" style={{ marginBottom: 14 }}>
          <div className="card-h">
            <Icon name="milk" size={14} color="var(--brand)" />
            {label}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: "var(--bg-2)" }}>
                  {["Formula","kcal/100mL","Protein g","Fat g","Na mmol","K mmol","Ca mg","P mg","Osm","LF","Note"].map((h,i) => (
                    <th key={i} style={{ padding: "7px 10px", textAlign: i === 0 ? "left" : "center",
                      fontWeight: 600, color: "var(--ink-3)", fontSize: 11,
                      borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keys.filter(k => DB[k]).map((k, i) => {
                  const f = DB[k];
                  return (
                    <tr key={k} style={{ borderBottom: "1px solid var(--line-2)",
                      background: i % 2 === 0 ? "var(--surface)" : "var(--bg-2)" }}>
                      <td style={{ padding: "7px 10px", color: "var(--ink)", maxWidth: 180, minWidth: 130 }}>
                        {(() => {
                          const m = f.label.match(/^(.*?)\s*\((.+)\)$/);
                          if (!m) return <span style={{ fontWeight: 500 }}>{f.label}</span>;
                          return (
                            <>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{m[1]}</div>
                              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 1 }}>({m[2]})</div>
                            </>
                          );
                        })()}
                      </td>
                      {[f.kcal, f.pro, f.fat, f.na?.toFixed(2), f.k?.toFixed(2), f.ca, f.p].map((v, j) => (
                        <td key={j} className="num" style={{ padding: "7px 10px", textAlign: "center",
                          fontWeight: 500, fontSize: 12.5 }}>{v ?? "—"}</td>
                      ))}
                      <td className="num" style={{ padding: "7px 10px", textAlign: "center", fontSize: 12 }}>{f.osm}</td>
                      <td style={{ padding: "7px 10px", textAlign: "center", fontSize: 12 }}>
                        <span style={{ color: f.lf ? "var(--ok)" : "var(--ink-3)" }}>
                          {f.lf ? "✅" : "—"}
                        </span>
                      </td>
                      <td style={{ padding: "7px 10px", fontSize: 11, color: "var(--ink-3)",
                        maxWidth: 200, wordBreak: "break-word" }}>{f.note || ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

    </>
  );
}

// ============================================================
// Toast
// ============================================================
function showToast(msg, type = "ok") {
  const host = document.getElementById("toast-host");
  if (!host) return;
  const t = document.createElement("div");
  const bg     = type === "error" ? "oklch(38% 0.15 20)" : "oklch(20% 0.01 230)";
  const prefix = type === "error" ? "⚠ " : "✓ ";
  const dur    = type === "error" ? 4200 : 2400;
  const toastBottom = getComputedStyle(document.documentElement).getPropertyValue('--toast-bottom').trim() || '24px';
  t.style.cssText = `position:fixed;bottom:${toastBottom};left:50%;transform:translateX(-50%) translateY(10px);background:${bg};color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;box-shadow:0 6px 24px oklch(20% 0 0 / .25);z-index:80;font-family:'IBM Plex Sans',sans-serif;opacity:0;transition:opacity .18s ease,transform .18s ease;max-width:90vw;text-align:center;`;
  t.textContent = prefix + msg;
  host.appendChild(t);
  requestAnimationFrame(() => {
    t.style.opacity = "1";
    t.style.transform = "translateX(-50%) translateY(0)";
  });
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateX(-50%) translateY(4px)";
  }, dur);
  setTimeout(() => { if (host.contains(t)) host.removeChild(t); }, dur + 250);
}

// CMD+K to open picker
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault();
    document.dispatchEvent(new CustomEvent("__open_picker"));
  }
});

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
