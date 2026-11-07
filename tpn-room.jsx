// tpn-room.jsx — the TPN room's page (openspec/changes/tpn-room-stickers, PR B).
//
// Reads one date's orders with pharmacyOrders, keeps NeoFeed ID → name and AN in an
// encrypted file on this PC, and prints the unit's three stickers from printJson.
// Two things leave the PC: the sign-in, and { action: "pharmacyOrders", token, date }.
// Everything from the server renders as React text, and nothing here computes a figure.
const Core = window.TPNRoomCore;
const NameStore = window.TPNRoomStore;
const VERSIONS = window.TPN_ROOM_VERSIONS || {};
const GAS_URL = window.NEOFEED_GAS_URL || "";

// Its own key, never neofeed_session: the ward app restores that one with no role
// check, so a pharmacy session stored there would open the ward shell (PR A, Task 6).
const SESSION_KEY = "neofeed_tpn_room_session";
const IDLE_LOGOUT_MS = 30 * 60 * 1000;
const REQUEST_MS = 30000;

// ── The server ───────────────────────────────────────────────
async function gas(body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_MS);
  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return await res.json();
  } catch (e) {
    throw new Error("ต่อ NeoFeed ไม่ได้ ลองใหม่อีกครั้ง");
  } finally {
    clearTimeout(timer);
  }
}

function readSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    return s && s.token ? s : null;
  } catch (e) { return null; }
}
function writeSession(u) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(u)); } catch (e) {} }
function clearSession() { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {} }

// ── Sign-in: email and password only. No Google script on a page that holds names. ──
function SignIn({ onUser, notice }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError("กรอก email และรหัสผ่าน"); return; }
    setBusy(true); setError("");
    try {
      const r = await gas({ action: "login", email: email.trim(), password });
      if (r.status !== "ok") { setError(String(r.error || "เข้าสู่ระบบไม่สำเร็จ")); return; }
      if (r.role !== "pharmacy" && r.role !== "admin") {
        gas({ action: "logout", token: r.token }).catch(() => {});
        setError("บัญชีนี้ไม่มีสิทธิ์ใช้หน้าห้อง TPN");
        return;
      }
      onUser({ name: r.name, role: r.role, email: r.email, token: r.token, mustChangePassword: !!r.mustChangePassword });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <main className="narrow">
      <h1>ห้อง TPN</h1>
      <p className="muted">NeoFeed สำหรับเภสัช ดู order และพิมพ์สติกเกอร์ แก้ข้อมูลใน NeoFeed จากหน้านี้ไม่ได้</p>
      {notice && <p className="note" role="status">{notice}</p>}
      <form onSubmit={submit} className="stack">
        <label>Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>รหัสผ่าน<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="bad" role="alert">{error}</p>}
        <button type="submit" className="primary" disabled={busy}>{busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}</button>
      </form>
      <Contacts />
    </main>
  );
}

// ── Change password: forced on a temporary password, by button otherwise. It keeps
//    the rotated token, or the very next call would be refused. ──
function ChangePassword({ user, forced, onDone, onCancel, onLogout }) {
  const [oldPwd, setOld] = React.useState("");
  const [newPwd, setNew] = React.useState("");
  const [again, setAgain] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const submit = async (e) => {
    e.preventDefault();
    if (newPwd !== again) { setError("รหัสผ่านใหม่สองช่องไม่ตรงกัน"); return; }
    setBusy(true); setError("");
    try {
      const r = await gas({ action: "changePassword", token: user.token, oldPassword: oldPwd, newPassword: newPwd });
      if (!r.ok) { setError(String(r.error || "เปลี่ยนรหัสผ่านไม่สำเร็จ")); return; }
      onDone(r.token || user.token);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <main className="narrow">
      <h1>{forced ? "ตั้งรหัสผ่านใหม่ก่อนใช้งาน" : "เปลี่ยนรหัสผ่าน"}</h1>
      <form onSubmit={submit} className="stack">
        <label>รหัสผ่านเดิม<input type="password" autoComplete="current-password" value={oldPwd} onChange={(e) => setOld(e.target.value)} /></label>
        <label>รหัสผ่านใหม่<input type="password" autoComplete="new-password" value={newPwd} onChange={(e) => setNew(e.target.value)} /></label>
        <label>รหัสผ่านใหม่อีกครั้ง<input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></label>
        {error && <p className="bad" role="alert">{error}</p>}
        <div className="row">
          <button type="submit" className="primary" disabled={busy}>บันทึก</button>
          {forced ? <button type="button" onClick={onLogout}>ออกจากระบบ</button> : <button type="button" onClick={onCancel}>ยกเลิก</button>}
        </div>
      </form>
    </main>
  );
}

function Contacts() {
  const c = Core.CONTACTS;
  return (
    <footer className="contacts muted">
      {c.neofeed && <span>เรื่อง NeoFeed: {c.neofeed}</span>}
      {c.passphrase && <span>รหัสผ่านไฟล์ชื่อ: {c.passphrase}</span>}
      {c.wrongOrder && <span>order ผิด: โทรหา{c.wrongOrder}</span>}
    </footer>
  );
}

// ── The name file ────────────────────────────────────────────
// A panel over the list, not a wall in front of it: on a day the file cannot open
// the room still sees the counts and the orders, and only printing stops.
function PassphrasePair({ pass, setPass, again, setAgain }) {
  return (
    <>
      <label>รหัสผ่านของห้อง TPN (อย่างน้อย {NameStore.MIN_PASSPHRASE} ตัวอักษร)
        <input type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} /></label>
      <label>รหัสผ่านอีกครั้ง
        <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></label>
    </>
  );
}

function NameFilePanel({ store, onOpen }) {
  const [view, setView] = React.useState("checking");
  const [dir, setDir] = React.useState(null);
  const [pass, setPass] = React.useState("");
  const [again, setAgain] = React.useState("");
  const [ack, setAck] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const tryOpen = async (folder, passphrase, fromPick) => {
    setDir(folder); setError("");
    try {
      const r = await store.openFile(folder, passphrase);
      if (r.file) { onOpen(r.file); return; }
      if (r.needsPassphrase) { setView("passphrase"); return; }
      setView(fromPick === "first" ? "create" : "missing");
    } catch (err) {
      if (err.kind === "wrongPassphrase") { setError(err.message); setView("passphrase"); return; }
      if (err.kind === "damaged") { setError(err.message); setView("damaged"); return; }
      setError(String(err.message || err)); setView("damaged");
    }
  };

  React.useEffect(() => {
    (async () => {
      if (typeof window.showDirectoryPicker !== "function") { setView("unsupported"); return; }
      const folder = await store.savedFolder().catch(() => null);
      if (!folder) { setView("first"); return; }
      setDir(folder);
      const perm = await folder.queryPermission({ mode: "readwrite" });
      if (perm === "granted") await tryOpen(folder);
      else setView("permission");
    })();
  }, []);

  const pick = async (first) => {
    let folder;
    try { folder = await window.showDirectoryPicker({ mode: "readwrite", id: "tpn-room" }); }
    catch (err) { return; }   // the picker was closed
    await tryOpen(folder, undefined, first ? "first" : "again");
  };
  const allow = async () => {
    const perm = await dir.requestPermission({ mode: "readwrite" });
    if (perm === "granted") await tryOpen(dir);
    else setError("ยังไม่ได้อนุญาตให้เปิดโฟลเดอร์นี้");
  };
  const checkPair = () => {
    if (pass !== again) { setError("รหัสผ่านสองช่องไม่ตรงกัน"); return false; }
    if (pass.length < NameStore.MIN_PASSPHRASE) { setError(`รหัสผ่านต้องยาวอย่างน้อย ${NameStore.MIN_PASSPHRASE} ตัวอักษร`); return false; }
    return true;
  };
  const run = async (fn) => {
    setBusy(true); setError("");
    try { await fn(); }
    catch (err) { setError(String(err.message || err)); }
    finally { setBusy(false); setPass(""); setAgain(""); }
  };
  const create = (e) => { e.preventDefault(); if (checkPair()) run(async () => onOpen(await store.createFile(dir, pass, Core.wardToday()))); };
  const unlock = (e) => { e.preventDefault(); run(() => tryOpen(dir, pass)); };
  const replace = (e) => {
    e.preventDefault();
    if (!ack) { setError("ติ๊กยอมรับก่อนเริ่มไฟล์ใหม่"); return; }
    if (checkPair()) run(async () => onOpen(await store.replaceFile(dir, pass)));
  };

  const folderLine = dir ? <p className="muted">โฟลเดอร์: {dir.name}</p> : null;
  return (
    <section className="panel" aria-label="ไฟล์ชื่อ">
      <h2>ไฟล์ชื่อ</h2>
      {view === "checking" && <p className="muted">กำลังเปิดไฟล์ชื่อ…</p>}
      {view === "unsupported" && <p className="bad">เบราว์เซอร์นี้เปิดไฟล์ชื่อไม่ได้ ใช้ Chrome หรือ Edge บนเครื่องห้อง TPN ระหว่างนี้ยังดูรายการได้ แต่ยังพิมพ์ไม่ได้</p>}
      {view === "first" && (
        <>
          <p>เลือกโฟลเดอร์สำหรับเก็บไฟล์ชื่อบนเครื่องนี้ ห้ามเป็น OneDrive หรือโฟลเดอร์ที่เครื่องล้างเอง ถ้าเคยมีไฟล์ชื่อแล้วให้เลือกโฟลเดอร์เดิม</p>
          <button className="primary" onClick={() => pick(true)}>เลือกโฟลเดอร์</button>
        </>
      )}
      {view === "permission" && (
        <>
          {folderLine}
          <p>เบราว์เซอร์ขออนุญาตเปิดโฟลเดอร์นี้อีกครั้ง</p>
          <button className="primary" onClick={allow}>เปิดไฟล์ชื่อ</button>
        </>
      )}
      {view === "create" && (
        <form onSubmit={create} className="stack">
          {folderLine}
          <p>ยังไม่มีไฟล์ชื่อในโฟลเดอร์นี้ ตั้งรหัสผ่านของห้องเพื่อสร้างไฟล์ รหัสนี้ใช้ตอนล้างเบราว์เซอร์หรือย้ายเครื่อง เก็บไว้ให้ดี ถ้าลืมจะเปิดไฟล์เดิมไม่ได้อีก</p>
          <PassphrasePair pass={pass} setPass={setPass} again={again} setAgain={setAgain} />
          <div className="row"><button type="submit" className="primary" disabled={busy}>สร้างไฟล์ชื่อ</button></div>
        </form>
      )}
      {view === "passphrase" && (
        <form onSubmit={unlock} className="stack">
          {folderLine}
          <p>เครื่องนี้ยังเปิดไฟล์เองไม่ได้ ใส่รหัสผ่านของห้อง TPN</p>
          <label>รหัสผ่านของห้อง TPN<input type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} /></label>
          <div className="row">
            <button type="submit" className="primary" disabled={busy}>{busy ? "กำลังเปิด…" : "เปิดไฟล์ชื่อ"}</button>
            <button type="button" onClick={() => { setError(""); setView("replace"); }}>ลืมรหัสผ่าน</button>
          </div>
        </form>
      )}
      {(view === "missing" || view === "damaged") && (
        <>
          {folderLine}
          <p className="bad">{view === "missing" ? "ไม่พบไฟล์ชื่อในโฟลเดอร์นี้" : "ไฟล์ชื่อเปิดไม่ได้"} หน้านี้จะไม่เริ่มตารางเปล่าเอง</p>
          <div className="row">
            <button onClick={() => pick(false)}>เลือกโฟลเดอร์อื่น</button>
            <button onClick={() => { setError(""); setView("replace"); }}>เริ่มไฟล์ใหม่</button>
          </div>
        </>
      )}
      {view === "replace" && (
        <form onSubmit={replace} className="stack">
          {folderLine}
          <p className="bad">ไฟล์ใหม่ไม่มีชื่อเดิมและไม่มีบันทึกการพิมพ์ ต้องใส่ชื่อใหม่จาก order กระดาษ และหน้านี้จะบอกไม่ได้ว่าถุงไหนพิมพ์ไปแล้ว ทุก order ในช่วง 7 วันต้องเทียบกับ order กระดาษก่อน ไฟล์เดิมยังอยู่ในโฟลเดอร์ แต่เปิดไม่ได้ถ้าไม่มีรหัสเดิม</p>
          <PassphrasePair pass={pass} setPass={setPass} again={again} setAgain={setAgain} />
          <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> เข้าใจแล้ว บันทึกการพิมพ์หายและต้องเทียบกับกระดาษ</label>
          <div className="row"><button type="submit" className="primary" disabled={busy}>เริ่มไฟล์ใหม่</button></div>
        </form>
      )}
      {error && <p className="bad" role="alert">{error}</p>}
    </section>
  );
}

// ── Mapping an infant, from the paper order, which carries the ID and the hospital sticker ──
function MappingDialog({ order, infants, onSave, onClose }) {
  const had = infants[order.sessionId];
  const [name, setName] = React.useState(had ? had.name : "");
  const [an, setAn] = React.useState(had ? had.an : "");
  const [confirmAn, setConfirmAn] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const pj = order.printJson;
  const twin = Core.twinLabel(order.twinSuffix, order.multiplesCount);
  const submit = async (e) => {
    e.preventDefault();
    const cleanName = name.trim(), cleanAn = an.trim();
    if (!cleanName) { setError("ใส่ชื่อที่จะพิมพ์"); return; }
    const bad = Core.anProblem(cleanAn);
    if (bad) { setError(bad); return; }
    const other = Core.anUsedBy(infants, cleanAn, order.sessionId);
    if (other && confirmAn !== cleanAn) {
      setConfirmAn(cleanAn);
      setError(`AN นี้ใส่ไว้กับ NeoFeed ID ${other} แล้ว ถ้าถูกต้องจริงให้กดบันทึกอีกครั้ง`);
      return;
    }
    setBusy(true); setError("");
    try { await onSave({ name: cleanName, an: cleanAn }); }
    catch (err) { setError(String(err.message || err)); setBusy(false); }
  };
  return (
    <div className="scrim">
      <div className="dialog" role="dialog" aria-modal="true" aria-label="ใส่ชื่อกับ AN">
        <h2>ใส่ชื่อกับ AN</h2>
        <p className="muted">ดูจาก order กระดาษ ซึ่งมีทั้ง NeoFeed ID และสติกเกอร์ผู้ป่วย</p>
        <dl className="facts">
          <div><dt>NeoFeed ID</dt><dd>{order.sessionId}</dd></div>
          <div><dt>เตียง</dt><dd>{order.bed || "ไม่มีเตียง"}</dd></div>
          <div><dt>BW</dt><dd>{order.bw} g</dd></div>
          <div><dt>DOL</dt><dd>{order.dol}</dd></div>
          {pj && <div><dt>น้ำหนักที่ใช้คำนวณ</dt><dd>{pj.dosingWeightKg} kg</dd></div>}
        </dl>
        {twin && <p className="twin-big">{twin}</p>}
        <form onSubmit={submit} className="stack">
          <label>ชื่อที่จะพิมพ์<input autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></label>
          <label>AN<input autoComplete="off" value={an} onChange={(e) => setAn(e.target.value)} placeholder="nnnnn/yy" maxLength={8} /></label>
          {error && <p className="bad" role="alert">{error}</p>}
          <div className="row">
            <button type="submit" className="primary" disabled={busy}>บันทึก</button>
            <button type="button" onClick={onClose}>ยกเลิก</button>
          </div>
        </form>
        {had && (
          <div className="history">
            <h3>ประวัติการแก้</h3>
            <p className="muted">ล่าสุด: {had.by} {had.at}</p>
            {had.history.slice().reverse().map((h, i) => (
              <p key={i} className="muted">{h.at} {h.by}: {h.name} · {h.an}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── One order on the list ────────────────────────────────────
function OrderRow({ order, date, file, onMap, onPrint, busy }) {
  const state = file ? file.state : null;
  const mapping = state ? state.infants[order.sessionId] : null;
  const reasons = Core.printReasons(order, {
    date, constantsVersion: VERSIONS.constantsVersion, stickerSchema: VERSIONS.stickerSchema,
    nameFileOpen: !!file, mapping,
  });
  const last = state ? Core.lastPrint(state.printLog, order.sessionId, date) : null;
  const changed = state ? Core.changedAfterPrint(order, state.printLog, date) : false;
  const paper = state ? Core.needsPaperCheck(date, state.meta.logLostOn) : false;
  const crit = order.printJson && order.printJson.critical;
  const twin = Core.twinLabel(order.twinSuffix, order.multiplesCount);
  const [typedDate, setTypedDate] = React.useState("");
  const prepared = typedDate || Core.wardToday();
  const preparedOk = Core.preparedDateOk(prepared);
  return (
    <li className={"order" + (changed ? " order-changed" : "")} data-session={order.sessionId}>
      <div className="order-head">
        <strong className="bed">{order.bed || "ไม่มีเตียง"}</strong>
        <span className="id">{order.sessionId}</span>
        {twin && <span className="twin">{twin}</span>}
        {order.revision > 1 && <span className="tag">ฉบับ {order.revision}</span>}
        <span className="who">{mapping ? <><strong>{mapping.name}</strong> · {mapping.an}</> : <span className="muted">ยังไม่ได้ใส่ชื่อ</span>}</span>
      </div>
      <p className="muted order-facts">
        BW {order.bw} g · DOL {order.dol}
        {order.printJson && <> · น้ำหนักที่ใช้คำนวณ {order.printJson.dosingWeightKg} kg</>}
        {/* Who submitted a submitted order, not a nurse who added only I/O after it
            (P1, stakeholder walk 2026-11-07: gas-backend.gs pharmacyOrders). */}
        {order.prescriber && <> · {order.status === "draft" ? "บันทึกโดย" : "Submit โดย"} {order.prescriber}</>}
        {order.submittedAt && <> · Submit {Core.wardTime(order.submittedAt)}</>}
      </p>
      {crit && (
        <div className="crit" role="note">
          <strong>ค่าวิกฤตที่หมอยืนยัน:</strong> {crit.alerts.join(", ")}
          <div>เหตุผล: {crit.reason}</div>
        </div>
      )}
      {changed && <p className="warn">หมอแก้ order หลังพิมพ์ → ฉบับ {order.revision}</p>}
      {paper && !last && <p className="warn">เทียบกับ order กระดาษก่อน ไฟล์ชื่อเริ่มใหม่ จึงไม่รู้ว่าพิมพ์ไปแล้วหรือยัง</p>}
      {last && !changed && <p className="muted">พิมพ์แล้ว {Core.wardTime(last.at)} โดย {last.by}</p>}
      {reasons.length > 0 && (
        <ul className="reasons">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      )}
      <div className="row order-actions">
        {file && <button onClick={() => onMap(order)}>{mapping ? "แก้ชื่อ / AN" : "ใส่ชื่อ / AN"}</button>}
        {reasons.length === 0 && (
          <>
            <label className="inline">วันที่เตรียม TPN
              <input type="date" value={prepared} onChange={(e) => setTypedDate(e.target.value)} />
            </label>
            <button className="primary" disabled={busy || !preparedOk} onClick={() => onPrint(order, prepared)}>
              {last && !changed ? "พิมพ์ซ้ำ" : "พิมพ์สติกเกอร์"}
            </button>
          </>
        )}
      </div>
    </li>
  );
}

// The sheet and each of its parts hold their content without clipping any of it.
function sheetOverflows() {
  const sheet = document.getElementById("sticker-sheet");
  if (!sheet) return true;
  return [sheet, ...sheet.querySelectorAll(".part")].some((e) => e.scrollHeight > e.clientHeight + 1);
}

// ── The three stickers. `Fig` marks a printJson string, `Lbl` a fixed label; the
//    harness checks that nothing else on the sheet holds a number. ──
const Fig = ({ of, children }) => <span className="fig" data-fig={of}>{children}</span>;
const Lbl = ({ children }) => <span className="lbl" data-lbl="">{children}</span>;

function StickerSheet({ model: m }) {
  return (
    <div className="sheet" id="sticker-sheet">
      <section className="part part-worksheet">
        <div className="part-head">
          <div className="big-name" data-mapped="name">{m.name}</div>
          <div><Lbl>Ward</Lbl> <span data-mapped="ward">{m.ward}</span></div>
        </div>
        <div className="facts-line">
          <span><Lbl>bw</Lbl> <Fig of="dosingWeightKg">{m.dosingWeightKg}</Fig> <Lbl>kg</Lbl></span>
          <span><Lbl>DOL</Lbl> <Fig of="dol">{m.dol}</Fig></span>
          <span><Lbl>TPN date</Lbl> <span data-date="">{m.orderDate}</span></span>
          <span><Lbl>Factor</Lbl> <Fig of="factor">{m.factor}</Fig></span>
          <span><Lbl>Prepared</Lbl> <Fig of="preparedMl">{m.preparedMl}</Fig> <Lbl>mL</Lbl></span>
        </div>
        <div className="worksheet-body">
          <table className="stock">
            <tbody>
              {m.stock.map((r) => (
                <tr key={r.key}>
                  <td className="tick"><Lbl>☐</Lbl></td>
                  <td><Lbl>{r.label}</Lbl></td>
                  <td className="num"><Fig of={"stockMl." + r.key}>{r.value}</Fig></td>
                  <td className="unit"><Lbl>mL</Lbl></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="wfi">
            <Lbl>SWFI</Lbl>
            <div className="wfi-value"><Fig of="stockMl.wfi">{m.wfiMl}</Fig></div>
            <Lbl>mL</Lbl>
          </div>
        </div>
        <div className="small-id"><Lbl>NeoFeed ID</Lbl> <span data-mapped="id">{m.sessionId}</span></div>
      </section>

      <section className="part part-label">
        <div className="fixed-line heading" data-fixed="">{m.heading}</div>
        <div className="part-head">
          <div className="big-name" data-mapped="name">{m.name}</div>
          <div><Lbl>AN</Lbl> <span data-mapped="an">{m.an}</span></div>
        </div>
        <div className="facts-line">
          <span><Lbl>DOL</Lbl> <Fig of="dol">{m.dol}</Fig></span>
          <span><Lbl>Ward</Lbl> <span data-mapped="ward">{m.ward}</span></span>
          <span><Lbl>Order date</Lbl> <span data-date="">{m.orderDate}</span></span>
          <span><Lbl>เวลาที่เริ่มให้</Lbl> ____________</span>
        </div>
        <div className="facts-line">
          <span><Lbl>Delivered</Lbl> <Fig of="deliveredMl">{m.deliveredMl}</Fig> <Lbl>mL</Lbl></span>
          <span><Lbl>Dead space</Lbl> <Fig of="deadMl">{m.deadMl}</Fig> <Lbl>mL</Lbl></span>
          <span><Lbl>Prepared</Lbl> <Fig of="preparedMl">{m.preparedMl}</Fig> <Lbl>mL</Lbl></span>
        </div>
        <div className="amounts">
          <span><Lbl>Dextrose</Lbl> <Fig of="delivered.dextrosePct">{m.dextrosePct}</Fig> <Lbl>%</Lbl> <Fig of="delivered.dextroseG">{m.dextroseG}</Fig> <Lbl>g</Lbl></span>
          <span><Lbl>Amino acid</Lbl> <Fig of="delivered.aminoAcidPct">{m.aminoAcidPct}</Fig> <Lbl>%</Lbl></span>
          {m.amino.map((r) => (
            <span key={r.key}><Lbl>{r.label}</Lbl> <Fig of={"delivered.aminoAcidG." + r.key}>{r.value}</Fig> <Lbl>g</Lbl></span>
          ))}
          {m.delivered.map((r) => (
            <span key={r.key}><Lbl>{r.label}</Lbl> <Fig of={"delivered." + r.key}>{r.value}</Fig> <Lbl>{r.unit}</Lbl></span>
          ))}
          <span><Lbl>Osmolarity</Lbl> <Fig of="delivered.osmolarity">{m.osmolarity}</Fig> <Lbl>mOsm/L</Lbl></span>
          <span><Lbl>Calories</Lbl> <Fig of="delivered.kcal">{m.kcal}</Fig> <Lbl>kcal</Lbl></span>
        </div>
        <div className="facts-line">
          <span><Lbl>วันที่ผลิต</Lbl> <span data-date="">{m.preparedDate}</span></span>
          <span className="fixed-line" data-fixed="">{m.storage}</span>
          <span className="fixed-line" data-fixed="">{m.extension}</span>
        </div>
      </section>

      <section className="part part-bag">
        <div className="bag-name" data-mapped="name">{m.name}</div>
        <div className="bag-ward" data-mapped="ward">{m.ward}</div>
        <div className="facts-line">
          <span><Lbl>AN</Lbl> <span data-mapped="an">{m.an}</span></span>
          <span><Lbl>Date</Lbl> <span data-date="">{m.orderDate}</span></span>
        </div>
      </section>
    </div>
  );
}

// ── The room's screen ────────────────────────────────────────
function Room({ user, store, onLogout, onExpired, onMustChange, onChangePassword }) {
  const win = Core.dateWindow();
  const [date, setDate] = React.useState(win.today);
  const [reply, setReply] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [file, setFile] = React.useState(null);
  const [, bump] = React.useReducer((n) => n + 1, 0);
  const [mappingFor, setMappingFor] = React.useState(null);
  const [printJob, setPrintJob] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  // One read of pharmacyOrders. On open and on a person's press only (design D8):
  // each call adds an Audit_Log row and reads two tabs uncached.
  const fetchDay = React.useCallback(async (day) => {
    const r = await gas({ action: "pharmacyOrders", token: user.token, date: day });
    if (r.error === "Unauthorized") { onExpired(); return null; }
    if (r.error === "PasswordChangeRequired") { onMustChange(); return null; }
    if (r.error === "Forbidden") { onExpired("บัญชีนี้ไม่มีสิทธิ์ใช้หน้าห้อง TPN"); return null; }
    if (!r.ok) throw new Error(String(r.error || "โหลด order ไม่สำเร็จ"));
    const next = { date: day, counts: r.counts, orders: Core.currentOrders(r.orders), loadedAt: Date.now() };
    setReply(next);
    return next;
  }, [user.token]);

  const load = React.useCallback(async (day) => {
    setLoading(true); setError("");
    try { await fetchDay(day); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [fetchDay]);

  React.useEffect(() => { load(date); }, []);

  // An infant the orders mention is still on TPN: keep it out of the 30-day purge.
  // Only a change writes, so a refresh does not rewrite the file.
  React.useEffect(() => {
    if (!file || !reply) return;
    const ids = reply.orders.map((o) => o.sessionId);
    const probe = JSON.parse(JSON.stringify(file.state));
    if (!NameStore.touchSeen(probe, ids, reply.date)) return;
    file.save((s) => NameStore.touchSeen(s, ids, reply.date)).then(bump).catch((err) => setError(err.message));
  }, [file, reply]);

  // Once the sheet is laid out and its font is ready: measure it, log it, print it. The
  // sheet hides what overflows, so a sheet that does not fit is refused here and never
  // printed with its bag label cut off. The log goes before the print: a print the log
  // missed is the one the warning cannot see. The sheet leaves the page after the dialog
  // closes, so no name stays in the DOM for nothing.
  React.useEffect(() => {
    if (!printJob) return;
    let live = true;
    const done = () => { if (live) setPrintJob(null); };
    window.addEventListener("afterprint", done);
    const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(async () => {
      if (!live) return;
      if (sheetOverflows()) {
        setError("ที่ว่างบนแผ่นสติกเกอร์ไม่พอ ชื่อหรือข้อความยาวเกินไป ย่อชื่อแล้วลองใหม่");
        setPrintJob(null);
        return;
      }
      await file.save((s) => NameStore.logPrint(s, printJob.entry));
      bump();
      if (live) window.print();
    }).catch((err) => { setError(err.message); setPrintJob(null); });
    return () => { live = false; window.removeEventListener("afterprint", done); };
  }, [printJob]);

  const who = user.name || user.email;

  const saveMapping = async (values) => {
    const order = mappingFor;
    await file.save((s) => NameStore.mapInfant(s, order.sessionId, values, who, new Date().toISOString(), reply.date));
    setMappingFor(null);
    bump();
  };

  const printOrder = async (order, preparedDate) => {
    setBusy(true); setError("");
    try {
      // A tab left open across a release still holds the old versions.
      const served = await fetch("compiled/tpn-room-version.js", { cache: "no-store" }).then((r) => (r.ok ? r.text() : "")).catch(() => null);
      if (served === null) { setError("เช็กรุ่นของหน้านี้ไม่ได้ ลองใหม่อีกครั้ง"); return; }
      if (!Core.versionsMatch(served, VERSIONS)) { setError("NeoFeed ออกรุ่นใหม่แล้ว โหลดหน้านี้ใหม่ก่อนพิมพ์"); return; }
      // Read once more: the list may be minutes old (spec, "Checked again just before printing").
      const fresh = await fetchDay(reply.date);
      if (!fresh) return;
      const check = Core.recheck(order, fresh.orders);
      if (check.refuse) { setError(check.refuse); return; }
      const mapping = file.state.infants[order.sessionId];
      const reasons = Core.printReasons(check.order, {
        date: fresh.date, constantsVersion: VERSIONS.constantsVersion, stickerSchema: VERSIONS.stickerSchema,
        nameFileOpen: true, mapping,
      });
      if (reasons.length) { setError(reasons.join(" · ")); return; }
      setPrintJob({
        model: Core.stickerModel(check.order, mapping, preparedDate),
        entry: {
          sessionId: order.sessionId, date: fresh.date, entryId: check.order.entryId,
          revision: check.order.revision, preparedDate, by: who, at: new Date().toISOString(),
        },
      });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const dateOk = Core.isRealDate(date) && date >= win.min && date <= win.max;
  const orders = reply ? reply.orders : [];
  const submitted = orders.filter((o) => o.status === "submitted");
  const drafts = orders.filter((o) => o.status !== "submitted");
  const gone = reply && file ? Core.goneAfterPrint(orders, file.state.printLog, reply.date) : [];
  const count = file ? Object.keys(file.state.infants).length : 0;
  const backToDraft = reply && file ? Core.draftAfterPrint(orders, file.state.printLog, reply.date) : [];
  const rowProps = reply ? { date: reply.date, file, onMap: setMappingFor, onPrint: printOrder, busy: busy || !!printJob } : null;

  return (
    <>
      <div className="screen">
        <header className="top">
          <h1>ห้อง TPN</h1>
          <div className="row">
            <button onClick={onChangePassword}>เปลี่ยนรหัสผ่าน</button>
            <button onClick={onLogout}>ออกจากระบบ</button>
          </div>
        </header>
        <p className="status-line" role="status">
          ชื่อในไฟล์ {count} คน · {file ? `ไฟล์เปิดอยู่ · โฟลเดอร์ ${file.folderName}` : "ไฟล์ชื่อยังไม่เปิด"} · เข้าระบบ {who}
        </p>
        {!file && <NameFilePanel store={store} onOpen={setFile} />}
        <section className="controls">
          <label className="inline">วันที่
            <input type="date" value={date} min={win.min} max={win.max}
              onChange={(e) => {
                const d = e.target.value;
                setDate(d);
                if (Core.isRealDate(d) && d >= win.min && d <= win.max) load(d);
              }} />
          </label>
          <button onClick={() => load(date)} disabled={loading || !dateOk}>{loading ? "กำลังโหลด…" : "รีเฟรช"}</button>
          {reply && (
            <div className="counts">
              <span><strong>{reply.counts.submitted}</strong> Submit แล้ว</span>
              <span><strong>{reply.counts.drafts}</strong> ฉบับร่าง</span>
              <span><strong>{reply.counts.active}</strong> ผู้ป่วยในหน่วย</span>
              <span className="muted">โหลดเมื่อ {Core.wardTime(null, reply.loadedAt)}</span>
            </div>
          )}
        </section>
        {!dateOk && <p className="bad" role="alert">เลือกได้ตั้งแต่ {Core.buddhistDate(win.min)} ถึง {Core.buddhistDate(win.max)}</p>}
        {reply && reply.date !== date && dateOk && !loading && <p className="note">รายการด้านล่างเป็นของวันที่ {Core.buddhistDate(reply.date)}</p>}
        {error && <p className="bad" role="alert">{error}</p>}
        {gone.map((p) => (
          <p key={p.sessionId} className="warn gone" data-gone={p.sessionId}>
            {p.sessionId}: พิมพ์แล้ว แต่ถูกลบใน NeoFeed — อย่าใช้ถุงนี้
          </p>
        ))}
        {backToDraft.map((o) => (
          <p key={o.sessionId} className="warn">
            {o.sessionId}: พิมพ์แล้ว แต่ order เปลี่ยนเป็นฉบับร่าง อย่าใช้ถุงนี้จนกว่าหมอจะ Submit ฉบับใหม่
          </p>
        ))}
        {reply && (
          <>
            {submitted.length === 0 && <p className="muted">ยังไม่มี order ที่ Submit แล้วของวันนี้</p>}
            <ul className="orders">
              {submitted.map((o) => <OrderRow key={o.entryId || o.sessionId} order={o} {...rowProps} />)}
            </ul>
            {drafts.length > 0 && (
              <details className="drafts">
                <summary>ฉบับร่าง {drafts.length} รายการ</summary>
                <ul className="orders">
                  {drafts.map((o) => <OrderRow key={o.entryId || o.sessionId} order={o} {...rowProps} />)}
                </ul>
              </details>
            )}
          </>
        )}
        <Contacts />
      </div>
      {mappingFor && file && (
        <MappingDialog order={mappingFor} infants={file.state.infants} onSave={saveMapping} onClose={() => setMappingFor(null)} />
      )}
      {printJob && <StickerSheet model={printJob.model} />}
    </>
  );
}

// ── The page ─────────────────────────────────────────────────
function TpnRoomApp({ store }) {
  const [user, setUser] = React.useState(readSession);
  const [notice, setNotice] = React.useState("");
  const [changing, setChanging] = React.useState(false);

  const signIn = (u) => { writeSession(u); setUser(u); setNotice(""); };
  const signOut = (why) => {
    clearSession();
    setUser(null);
    setChanging(false);
    setNotice(why || "");
  };
  const logout = () => {
    if (user) gas({ action: "logout", token: user.token }).catch(() => {});
    signOut();
  };

  // The ward's rule (2026-09-17): 30 minutes with no real input signs out.
  React.useEffect(() => {
    if (!user) return;
    let lastInput = Date.now();
    const mark = () => { lastInput = Date.now(); };
    window.addEventListener("pointerdown", mark);
    window.addEventListener("keydown", mark);
    const tick = setInterval(() => {
      if (Date.now() - lastInput > IDLE_LOGOUT_MS) {
        gas({ action: "logout", token: user.token }).catch(() => {});
        signOut("ไม่ได้ใช้งาน 30 นาที ออกจากระบบแล้ว");
      }
    }, 60000);
    return () => { clearInterval(tick); window.removeEventListener("pointerdown", mark); window.removeEventListener("keydown", mark); };
  }, [user && user.token]);

  if (!user) return <SignIn onUser={signIn} notice={notice} />;
  if (user.mustChangePassword || changing) {
    return (
      <ChangePassword
        user={user}
        forced={!!user.mustChangePassword}
        onLogout={logout}
        onCancel={() => setChanging(false)}
        onDone={(token) => { signIn({ ...user, token, mustChangePassword: false }); setChanging(false); }}
      />
    );
  }
  return (
    <Room
      user={user}
      store={store}
      onLogout={logout}
      onExpired={(why) => signOut(why || "หมดเวลาเข้าสู่ระบบ เข้าใหม่อีกครั้ง")}
      onMustChange={() => signIn({ ...user, mustChangePassword: true })}
      onChangePassword={() => setChanging(true)}
    />
  );
}

// ── Start. On *.github.io, which every Pages site in the org shares, the page leaves
//    before it touches any storage: Pages sends no CSP, and IndexedDB there is
//    readable by every sibling site. boot.js has already started the redirect for
//    this org's host; this stops the page itself from running under it. ──
(function start() {
  if (/\.github\.io\.?$/i.test(window.location.hostname)) {
    window.location.replace("moved.html");
    return;
  }
  const mount = document.getElementById("root");
  if (!GAS_URL || !window.crypto || !window.crypto.subtle) {
    mount.textContent = "หน้านี้เปิดบนที่อยู่นี้ไม่ได้ ใช้ลิงก์ของ NeoFeed";
    return;
  }
  const store = NameStore.createStore({
    subtle: window.crypto.subtle,
    randomBytes: (n) => window.crypto.getRandomValues(new Uint8Array(n)),
    kv: NameStore.browserKv(window.indexedDB),
    today: () => Core.wardToday(),
  });
  ReactDOM.createRoot(mount).render(<TpnRoomApp store={store} />);
})();
