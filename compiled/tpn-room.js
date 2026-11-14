"use strict";
const Core = window.TPNRoomCore;
const NameStore = window.TPNRoomStore;
const VERSIONS = window.TPN_ROOM_VERSIONS || {};
const GAS_URL = window.NEOFEED_GAS_URL || "";
const SESSION_KEY = "neofeed_tpn_room_session";
const OAUTH_KEY = "neofeed_tpn_room_oauth";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const IDLE_LOGOUT_MS = 30 * 60 * 1e3;
const REQUEST_MS = 3e4;
async function gas(body, { keepalive = false } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_MS);
  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      keepalive
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
  } catch (e) {
    return null;
  }
}
function writeSession(u) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(u));
  } catch (e) {
  }
}
function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (e) {
  }
}
const redirectUri = () => window.location.origin + window.location.pathname;
function randomHex(n) {
  return Array.from(window.crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
}
function startGoogle() {
  const state = randomHex(16), nonce = randomHex(16);
  try {
    sessionStorage.setItem(OAUTH_KEY, JSON.stringify({ state, nonce }));
  } catch (e) {
    return false;
  }
  const q = new URLSearchParams({
    client_id: window.NEOFEED_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "id_token",
    scope: "openid email profile",
    state,
    nonce,
    prompt: "select_account"
  });
  window.location.assign(GOOGLE_AUTH_URL + "?" + q.toString());
  return true;
}
function jwtNonce(token) {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part + "===".slice((part.length + 3) % 4))).nonce || "";
  } catch (e) {
    return "";
  }
}
function takeGoogleReturn() {
  const hash = window.location.hash.replace(/^#/, "");
  if (!/(^|&)(id_token|error|state)=/.test(hash)) return null;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  let want = null;
  try {
    want = JSON.parse(sessionStorage.getItem(OAUTH_KEY));
    sessionStorage.removeItem(OAUTH_KEY);
  } catch (e) {
  }
  const h = new URLSearchParams(hash);
  if (!want || !want.state || h.get("state") !== want.state) return { error: "เข้าสู่ระบบด้วย Google ไม่สำเร็จ ลองใหม่อีกครั้ง" };
  if (h.get("error")) return { error: h.get("error") === "access_denied" ? "ยกเลิกการเข้าสู่ระบบด้วย Google แล้ว" : "เข้าสู่ระบบด้วย Google ไม่สำเร็จ ลองใหม่อีกครั้ง" };
  const token = h.get("id_token") || "";
  if (!token || jwtNonce(token) !== want.nonce) return { error: "เข้าสู่ระบบด้วย Google ไม่สำเร็จ ลองใหม่อีกครั้ง" };
  return { token };
}
function SignIn({ onUser, notice, googleReturn }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(!!(googleReturn && googleReturn.token));
  const [error, setError] = React.useState(googleReturn && googleReturn.error ? googleReturn.error : "");
  const login = async (body) => {
    setBusy(true);
    setError("");
    try {
      const r = await gas({ action: "login", ...body });
      if (r.status !== "ok") {
        setError(String(r.error || "เข้าสู่ระบบไม่สำเร็จ"));
        return;
      }
      if (r.role !== "pharmacy" && r.role !== "admin") {
        gas({ action: "logout", token: r.token }).catch(() => {
        });
        setError("บัญชีนี้ไม่มีสิทธิ์ใช้หน้าห้อง TPN");
        return;
      }
      onUser({ name: r.name, role: r.role, email: r.email, token: r.token, authMethod: r.authMethod === "google" ? "google" : "password", mustChangePassword: !!r.mustChangePassword });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  React.useEffect(() => {
    if (googleReturn && googleReturn.token) login({ googleToken: googleReturn.token });
  }, []);
  const submit = (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("กรอก email และรหัสผ่าน");
      return;
    }
    login({ email: email.trim(), password });
  };
  const google = () => {
    setError("");
    if (!startGoogle()) setError("เบราว์เซอร์นี้เก็บข้อมูลชั่วคราวไม่ได้ ใช้ email และรหัสผ่านแทน");
  };
  return /* @__PURE__ */ React.createElement("main", { className: "narrow" }, /* @__PURE__ */ React.createElement("h1", null, "ห้อง TPN"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "NeoFeed สำหรับเภสัช ดู order และพิมพ์สติกเกอร์ แก้ข้อมูลใน NeoFeed จากหน้านี้ไม่ได้"), notice && /* @__PURE__ */ React.createElement("p", { className: "note", role: "status" }, notice), window.NEOFEED_CLIENT_ID && /* @__PURE__ */ React.createElement("button", { type: "button", className: "google", onClick: google, disabled: busy }, "เข้าสู่ระบบด้วย Google"), /* @__PURE__ */ React.createElement("p", { className: "or muted" }, "หรือใช้ email และรหัสผ่านของ NeoFeed"), /* @__PURE__ */ React.createElement("form", { onSubmit: submit, className: "stack" }, /* @__PURE__ */ React.createElement("label", null, "Email", /* @__PURE__ */ React.createElement("input", { type: "email", autoComplete: "username", value: email, onChange: (e) => setEmail(e.target.value) })), /* @__PURE__ */ React.createElement("label", null, "รหัสผ่าน", /* @__PURE__ */ React.createElement("input", { type: "password", autoComplete: "current-password", value: password, onChange: (e) => setPassword(e.target.value) })), error && /* @__PURE__ */ React.createElement("p", { className: "bad", role: "alert" }, error), /* @__PURE__ */ React.createElement("button", { type: "submit", className: "primary", disabled: busy }, busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ")), /* @__PURE__ */ React.createElement(Contacts, null));
}
function ChangePassword({ user, forced, onDone, onCancel, onLogout }) {
  const [oldPwd, setOld] = React.useState("");
  const [newPwd, setNew] = React.useState("");
  const [again, setAgain] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const submit = async (e) => {
    e.preventDefault();
    if (newPwd !== again) {
      setError("รหัสผ่านใหม่สองช่องไม่ตรงกัน");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await gas({ action: "changePassword", token: user.token, oldPassword: oldPwd, newPassword: newPwd });
      if (!r.ok) {
        setError(String(r.error || "เปลี่ยนรหัสผ่านไม่สำเร็จ"));
        return;
      }
      onDone(r.token || user.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ React.createElement("main", { className: "narrow" }, /* @__PURE__ */ React.createElement("h1", null, forced ? "ตั้งรหัสผ่านใหม่ก่อนใช้งาน" : "เปลี่ยนรหัสผ่าน"), /* @__PURE__ */ React.createElement("form", { onSubmit: submit, className: "stack" }, /* @__PURE__ */ React.createElement("label", null, "รหัสผ่านเดิม", /* @__PURE__ */ React.createElement("input", { type: "password", autoComplete: "current-password", value: oldPwd, onChange: (e) => setOld(e.target.value) })), /* @__PURE__ */ React.createElement("label", null, "รหัสผ่านใหม่", /* @__PURE__ */ React.createElement("input", { type: "password", autoComplete: "new-password", value: newPwd, onChange: (e) => setNew(e.target.value) })), /* @__PURE__ */ React.createElement("label", null, "รหัสผ่านใหม่อีกครั้ง", /* @__PURE__ */ React.createElement("input", { type: "password", autoComplete: "new-password", value: again, onChange: (e) => setAgain(e.target.value) })), error && /* @__PURE__ */ React.createElement("p", { className: "bad", role: "alert" }, error), /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("button", { type: "submit", className: "primary", disabled: busy }, "บันทึก"), forced ? /* @__PURE__ */ React.createElement("button", { type: "button", onClick: onLogout }, "ออกจากระบบ") : /* @__PURE__ */ React.createElement("button", { type: "button", onClick: onCancel }, "ยกเลิก"))));
}
function Contacts() {
  const c = Core.CONTACTS;
  return /* @__PURE__ */ React.createElement("footer", { className: "contacts muted" }, c.neofeed && /* @__PURE__ */ React.createElement("span", null, "เรื่อง NeoFeed: ", c.neofeed), c.passphrase && /* @__PURE__ */ React.createElement("span", null, "รหัสผ่านไฟล์ชื่อ: ", c.passphrase), c.wrongOrder && /* @__PURE__ */ React.createElement("span", null, "order ผิด: โทรหา", c.wrongOrder));
}
function PassphrasePair({ pass, setPass, again, setAgain }) {
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("label", null, "รหัสผ่านของห้อง TPN (อย่างน้อย ", NameStore.MIN_PASSPHRASE, " ตัวอักษร)", /* @__PURE__ */ React.createElement("input", { type: "password", autoComplete: "new-password", value: pass, onChange: (e) => setPass(e.target.value) })), /* @__PURE__ */ React.createElement("label", null, "รหัสผ่านอีกครั้ง", /* @__PURE__ */ React.createElement("input", { type: "password", autoComplete: "new-password", value: again, onChange: (e) => setAgain(e.target.value) })));
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
    setDir(folder);
    setError("");
    try {
      const r = await store.openFile(folder, passphrase);
      if (r.file) {
        onOpen(r.file);
        return;
      }
      if (r.needsPassphrase) {
        setView("passphrase");
        return;
      }
      setView(fromPick === "first" ? "create" : "missing");
    } catch (err) {
      if (err.kind === "wrongPassphrase") {
        setError(err.message);
        setView("passphrase");
        return;
      }
      if (err.kind === "damaged") {
        setError(err.message);
        setView("damaged");
        return;
      }
      setError(String(err.message || err));
      setView("damaged");
    }
  };
  React.useEffect(() => {
    (async () => {
      if (typeof window.showDirectoryPicker !== "function") {
        setView("unsupported");
        return;
      }
      const folder = await store.savedFolder().catch(() => null);
      if (!folder) {
        setView("first");
        return;
      }
      setDir(folder);
      const perm = await folder.queryPermission({ mode: "readwrite" });
      if (perm === "granted") await tryOpen(folder);
      else setView("permission");
    })();
  }, []);
  const pick = async (first) => {
    let folder;
    try {
      folder = await window.showDirectoryPicker({ mode: "readwrite", id: "tpn-room" });
    } catch (err) {
      return;
    }
    await tryOpen(folder, void 0, first ? "first" : "again");
  };
  const allow = async () => {
    const perm = await dir.requestPermission({ mode: "readwrite" });
    if (perm === "granted") await tryOpen(dir);
    else setError("ยังไม่ได้อนุญาตให้เปิดโฟลเดอร์นี้");
  };
  const checkPair = () => {
    if (pass !== again) {
      setError("รหัสผ่านสองช่องไม่ตรงกัน");
      return false;
    }
    if (pass.length < NameStore.MIN_PASSPHRASE) {
      setError(`รหัสผ่านต้องยาวอย่างน้อย ${NameStore.MIN_PASSPHRASE} ตัวอักษร`);
      return false;
    }
    return true;
  };
  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
      setPass("");
      setAgain("");
    }
  };
  const create = (e) => {
    e.preventDefault();
    if (checkPair()) run(async () => onOpen(await store.createFile(dir, pass, Core.wardToday())));
  };
  const unlock = (e) => {
    e.preventDefault();
    run(() => tryOpen(dir, pass));
  };
  const replace = (e) => {
    e.preventDefault();
    if (!ack) {
      setError("ติ๊กยอมรับก่อนเริ่มไฟล์ใหม่");
      return;
    }
    if (checkPair()) run(async () => onOpen(await store.replaceFile(dir, pass)));
  };
  const folderLine = dir ? /* @__PURE__ */ React.createElement("p", { className: "muted" }, "โฟลเดอร์: ", dir.name) : null;
  return /* @__PURE__ */ React.createElement("section", { className: "panel", "aria-label": "ไฟล์ชื่อ" }, /* @__PURE__ */ React.createElement("h2", null, "ไฟล์ชื่อ"), view === "checking" && /* @__PURE__ */ React.createElement("p", { className: "muted" }, "กำลังเปิดไฟล์ชื่อ…"), view === "unsupported" && /* @__PURE__ */ React.createElement("p", { className: "bad" }, "เบราว์เซอร์นี้เปิดไฟล์ชื่อไม่ได้ ใช้ Chrome หรือ Edge บนเครื่องห้อง TPN ระหว่างนี้ยังดูรายการได้ แต่ยังพิมพ์ไม่ได้"), view === "first" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("p", null, "เลือกโฟลเดอร์สำหรับเก็บไฟล์ชื่อบนเครื่องนี้ ห้ามเป็น OneDrive หรือโฟลเดอร์ที่เครื่องล้างเอง ถ้าเคยมีไฟล์ชื่อแล้วให้เลือกโฟลเดอร์เดิม"), /* @__PURE__ */ React.createElement("button", { className: "primary", onClick: () => pick(true) }, "เลือกโฟลเดอร์")), view === "permission" && /* @__PURE__ */ React.createElement(React.Fragment, null, folderLine, /* @__PURE__ */ React.createElement("p", null, "เบราว์เซอร์ขออนุญาตเปิดโฟลเดอร์นี้อีกครั้ง"), /* @__PURE__ */ React.createElement("button", { className: "primary", onClick: allow }, "เปิดไฟล์ชื่อ")), view === "create" && /* @__PURE__ */ React.createElement("form", { onSubmit: create, className: "stack" }, folderLine, /* @__PURE__ */ React.createElement("p", null, "ยังไม่มีไฟล์ชื่อในโฟลเดอร์นี้ ตั้งรหัสผ่านของห้องเพื่อสร้างไฟล์ รหัสนี้ใช้ตอนล้างเบราว์เซอร์หรือย้ายเครื่อง เก็บไว้ให้ดี ถ้าลืมจะเปิดไฟล์เดิมไม่ได้อีก"), /* @__PURE__ */ React.createElement(PassphrasePair, { pass, setPass, again, setAgain }), /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("button", { type: "submit", className: "primary", disabled: busy }, "สร้างไฟล์ชื่อ"))), view === "passphrase" && /* @__PURE__ */ React.createElement("form", { onSubmit: unlock, className: "stack" }, folderLine, /* @__PURE__ */ React.createElement("p", null, "เครื่องนี้ยังเปิดไฟล์เองไม่ได้ ใส่รหัสผ่านของห้อง TPN"), /* @__PURE__ */ React.createElement("label", null, "รหัสผ่านของห้อง TPN", /* @__PURE__ */ React.createElement("input", { type: "password", autoComplete: "current-password", value: pass, onChange: (e) => setPass(e.target.value) })), /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("button", { type: "submit", className: "primary", disabled: busy }, busy ? "กำลังเปิด…" : "เปิดไฟล์ชื่อ"), /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => {
    setError("");
    setView("replace");
  } }, "ลืมรหัสผ่าน"))), (view === "missing" || view === "damaged") && /* @__PURE__ */ React.createElement(React.Fragment, null, folderLine, /* @__PURE__ */ React.createElement("p", { className: "bad" }, view === "missing" ? "ไม่พบไฟล์ชื่อในโฟลเดอร์นี้" : "ไฟล์ชื่อเปิดไม่ได้", " หน้านี้จะไม่เริ่มตารางเปล่าเอง"), /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("button", { onClick: () => pick(false) }, "เลือกโฟลเดอร์อื่น"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    setError("");
    setView("replace");
  } }, "เริ่มไฟล์ใหม่"))), view === "replace" && /* @__PURE__ */ React.createElement("form", { onSubmit: replace, className: "stack" }, folderLine, /* @__PURE__ */ React.createElement("p", { className: "bad" }, "ไฟล์ใหม่ไม่มีชื่อเดิมและไม่มีบันทึกการพิมพ์ ต้องใส่ชื่อใหม่จาก order กระดาษ และหน้านี้จะบอกไม่ได้ว่าถุงไหนพิมพ์ไปแล้ว ทุก order ในช่วง 7 วันต้องเทียบกับ order กระดาษก่อน ไฟล์เดิมยังอยู่ในโฟลเดอร์ แต่เปิดไม่ได้ถ้าไม่มีรหัสเดิม"), /* @__PURE__ */ React.createElement(PassphrasePair, { pass, setPass, again, setAgain }), /* @__PURE__ */ React.createElement("label", { className: "check" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: ack, onChange: (e) => setAck(e.target.checked) }), " เข้าใจแล้ว บันทึกการพิมพ์หายและต้องเทียบกับกระดาษ"), /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("button", { type: "submit", className: "primary", disabled: busy }, "เริ่มไฟล์ใหม่"))), error && /* @__PURE__ */ React.createElement("p", { className: "bad", role: "alert" }, error));
}
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
    if (!cleanName) {
      setError("ใส่ชื่อที่จะพิมพ์");
      return;
    }
    const bad = Core.anProblem(cleanAn);
    if (bad) {
      setError(bad);
      return;
    }
    const other = Core.anUsedBy(infants, cleanAn, order.sessionId);
    if (other && confirmAn !== cleanAn) {
      setConfirmAn(cleanAn);
      setError(`AN นี้ใส่ไว้กับ NeoFeed ID ${other} แล้ว ถ้าถูกต้องจริงให้กดบันทึกอีกครั้ง`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave({ name: cleanName, an: cleanAn });
    } catch (err) {
      setError(String(err.message || err));
      setBusy(false);
    }
  };
  return /* @__PURE__ */ React.createElement("div", { className: "scrim" }, /* @__PURE__ */ React.createElement("div", { className: "dialog", role: "dialog", "aria-modal": "true", "aria-label": "ใส่ชื่อกับ AN" }, /* @__PURE__ */ React.createElement("h2", null, "ใส่ชื่อกับ AN"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "ดูจาก order กระดาษ ซึ่งมีทั้ง NeoFeed ID และสติกเกอร์ผู้ป่วย"), /* @__PURE__ */ React.createElement("dl", { className: "facts" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "NeoFeed ID"), /* @__PURE__ */ React.createElement("dd", null, order.sessionId)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "เตียง"), /* @__PURE__ */ React.createElement("dd", null, order.bed || "ไม่มีเตียง")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "BW"), /* @__PURE__ */ React.createElement("dd", null, order.bw, " g")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "DOL"), /* @__PURE__ */ React.createElement("dd", null, order.dol)), pj && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "น้ำหนักที่ใช้คำนวณ"), /* @__PURE__ */ React.createElement("dd", null, pj.dosingWeightKg, " kg"))), twin && /* @__PURE__ */ React.createElement("p", { className: "twin-big" }, twin), /* @__PURE__ */ React.createElement("form", { onSubmit: submit, className: "stack" }, /* @__PURE__ */ React.createElement("label", null, "ชื่อที่จะพิมพ์", /* @__PURE__ */ React.createElement("input", { autoComplete: "off", value: name, onChange: (e) => setName(e.target.value), maxLength: 80 })), /* @__PURE__ */ React.createElement("label", null, "AN", /* @__PURE__ */ React.createElement("input", { autoComplete: "off", value: an, onChange: (e) => setAn(e.target.value), placeholder: "nnnnn/yy", maxLength: 8 })), error && /* @__PURE__ */ React.createElement("p", { className: "bad", role: "alert" }, error), /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("button", { type: "submit", className: "primary", disabled: busy }, "บันทึก"), /* @__PURE__ */ React.createElement("button", { type: "button", onClick: onClose }, "ยกเลิก"))), had && /* @__PURE__ */ React.createElement("div", { className: "history" }, /* @__PURE__ */ React.createElement("h3", null, "ประวัติการแก้"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "ล่าสุด: ", had.by, " ", had.at), had.history.slice().reverse().map((h, i) => /* @__PURE__ */ React.createElement("p", { key: i, className: "muted" }, h.at, " ", h.by, ": ", h.name, " · ", h.an)))));
}
function OrderRow({ order, date, file, onMap, onPrint, busy }) {
  const state = file ? file.state : null;
  const mapping = state ? state.infants[order.sessionId] : null;
  const reasons = Core.printReasons(order, {
    date,
    constantsVersion: VERSIONS.constantsVersion,
    stickerSchema: VERSIONS.stickerSchema,
    nameFileOpen: !!file,
    mapping
  });
  const last = state ? Core.lastPrint(state.printLog, order.sessionId, date) : null;
  const changed = state ? Core.changedAfterPrint(order, state.printLog, date) : false;
  const paper = state ? Core.needsPaperCheck(date, state.meta.logLostOn) : false;
  const crit = order.printJson && order.printJson.critical;
  const twin = Core.twinLabel(order.twinSuffix, order.multiplesCount);
  const [typedDate, setTypedDate] = React.useState("");
  const prepared = typedDate || Core.wardToday();
  const preparedOk = Core.preparedDateOk(prepared);
  return /* @__PURE__ */ React.createElement("li", { className: "order" + (changed ? " order-changed" : ""), "data-session": order.sessionId }, /* @__PURE__ */ React.createElement("div", { className: "order-head" }, /* @__PURE__ */ React.createElement("strong", { className: "bed" }, order.bed || "ไม่มีเตียง"), /* @__PURE__ */ React.createElement("span", { className: "id" }, order.sessionId), twin && /* @__PURE__ */ React.createElement("span", { className: "twin" }, twin), order.revision > 1 && /* @__PURE__ */ React.createElement("span", { className: "tag" }, "ฉบับ ", order.revision), /* @__PURE__ */ React.createElement("span", { className: "who" }, mapping ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("strong", null, mapping.name), " · ", mapping.an) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "ยังไม่ได้ใส่ชื่อ"))), /* @__PURE__ */ React.createElement("p", { className: "muted order-facts" }, "BW ", order.bw, " g · DOL ", order.dol, order.printJson && /* @__PURE__ */ React.createElement(React.Fragment, null, " · น้ำหนักที่ใช้คำนวณ ", order.printJson.dosingWeightKg, " kg"), order.prescriber && /* @__PURE__ */ React.createElement(React.Fragment, null, " · ", order.status === "draft" ? "บันทึกโดย" : "Submit โดย", " ", order.prescriber), order.submittedAt && /* @__PURE__ */ React.createElement(React.Fragment, null, " · Submit ", Core.wardTime(order.submittedAt))), crit && /* @__PURE__ */ React.createElement("div", { className: "crit", role: "note" }, /* @__PURE__ */ React.createElement("strong", null, "ค่าวิกฤตที่หมอยืนยัน:"), " ", crit.alerts.join(", "), /* @__PURE__ */ React.createElement("div", null, "เหตุผล: ", crit.reason)), changed && /* @__PURE__ */ React.createElement("p", { className: "warn" }, "หมอแก้ order หลังพิมพ์ → ฉบับ ", order.revision), paper && !last && /* @__PURE__ */ React.createElement("p", { className: "warn" }, "เทียบกับ order กระดาษก่อน ไฟล์ชื่อเริ่มใหม่ จึงไม่รู้ว่าพิมพ์ไปแล้วหรือยัง"), last && !changed && /* @__PURE__ */ React.createElement("p", { className: "muted" }, "พิมพ์แล้ว ", Core.wardTime(last.at), " โดย ", last.by), reasons.length > 0 && /* @__PURE__ */ React.createElement("ul", { className: "reasons" }, reasons.map((r) => /* @__PURE__ */ React.createElement("li", { key: r }, r))), /* @__PURE__ */ React.createElement("div", { className: "row order-actions" }, file && /* @__PURE__ */ React.createElement("button", { onClick: () => onMap(order) }, mapping ? "แก้ชื่อ / AN" : "ใส่ชื่อ / AN"), reasons.length === 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("label", { className: "inline" }, "วันที่เตรียม TPN", /* @__PURE__ */ React.createElement("input", { type: "date", value: prepared, onChange: (e) => setTypedDate(e.target.value) })), /* @__PURE__ */ React.createElement("button", { className: "primary", disabled: busy || !preparedOk, onClick: () => onPrint(order, prepared) }, last && !changed ? "พิมพ์ซ้ำ" : "พิมพ์สติกเกอร์"))));
}
function sheetOverflows() {
  const sheet = document.getElementById("sticker-sheet");
  if (!sheet) return true;
  return [sheet, ...sheet.querySelectorAll(".part")].some((e) => e.scrollHeight > e.clientHeight + 1);
}
const Fig = ({ of, children }) => /* @__PURE__ */ React.createElement("span", { className: "fig", "data-fig": of }, children);
const Lbl = ({ children }) => /* @__PURE__ */ React.createElement("span", { className: "lbl", "data-lbl": "" }, children);
function StickerSheet({ model: m }) {
  return /* @__PURE__ */ React.createElement("div", { className: "sheet", id: "sticker-sheet" }, /* @__PURE__ */ React.createElement("section", { className: "part part-worksheet" }, /* @__PURE__ */ React.createElement("div", { className: "part-head" }, /* @__PURE__ */ React.createElement("div", { className: "big-name", "data-mapped": "name" }, m.name), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(Lbl, null, "Ward"), " ", /* @__PURE__ */ React.createElement("span", { "data-mapped": "ward" }, m.ward))), /* @__PURE__ */ React.createElement("div", { className: "facts-line" }, /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Lbl, null, "bw"), " ", /* @__PURE__ */ React.createElement(Fig, { of: "dosingWeightKg" }, m.dosingWeightKg), " ", /* @__PURE__ */ React.createElement(Lbl, null, "kg")), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Lbl, null, "DOL"), " ", /* @__PURE__ */ React.createElement(Fig, { of: "dol" }, m.dol)), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Lbl, null, "TPN date"), " ", /* @__PURE__ */ React.createElement("span", { "data-date": "" }, m.orderDate)), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Lbl, null, "Factor"), " ", /* @__PURE__ */ React.createElement(Fig, { of: "factor" }, m.factor)), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Lbl, null, "Prepared"), " ", /* @__PURE__ */ React.createElement(Fig, { of: "preparedMl" }, m.preparedMl), " ", /* @__PURE__ */ React.createElement(Lbl, null, "mL"))), /* @__PURE__ */ React.createElement("div", { className: "worksheet-body" }, /* @__PURE__ */ React.createElement("table", { className: "stock" }, /* @__PURE__ */ React.createElement("tbody", null, m.stock.map((r) => /* @__PURE__ */ React.createElement("tr", { key: r.key }, /* @__PURE__ */ React.createElement("td", { className: "tick" }, /* @__PURE__ */ React.createElement(Lbl, null, "☐")), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(Lbl, null, r.label)), /* @__PURE__ */ React.createElement("td", { className: "num" }, /* @__PURE__ */ React.createElement(Fig, { of: "stockMl." + r.key }, r.value)), /* @__PURE__ */ React.createElement("td", { className: "unit" }, /* @__PURE__ */ React.createElement(Lbl, null, "mL")))))), /* @__PURE__ */ React.createElement("div", { className: "wfi" }, /* @__PURE__ */ React.createElement(Lbl, null, "SWFI"), /* @__PURE__ */ React.createElement("div", { className: "wfi-value" }, /* @__PURE__ */ React.createElement(Fig, { of: "stockMl.wfi" }, m.wfiMl)), /* @__PURE__ */ React.createElement(Lbl, null, "mL"))), /* @__PURE__ */ React.createElement("div", { className: "small-id" }, /* @__PURE__ */ React.createElement(Lbl, null, "NeoFeed ID"), " ", /* @__PURE__ */ React.createElement("span", { "data-mapped": "id" }, m.sessionId))), /* @__PURE__ */ React.createElement("section", { className: "part part-label" }, /* @__PURE__ */ React.createElement("div", { className: "fixed-line heading", "data-fixed": "" }, m.heading), /* @__PURE__ */ React.createElement("div", { className: "part-head" }, /* @__PURE__ */ React.createElement("div", { className: "big-name", "data-mapped": "name" }, m.name), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(Lbl, null, "AN"), " ", /* @__PURE__ */ React.createElement("span", { "data-mapped": "an" }, m.an))), /* @__PURE__ */ React.createElement("div", { className: "facts-line" }, /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Lbl, null, "DOL"), " ", /* @__PURE__ */ React.createElement(Fig, { of: "dol" }, m.dol)), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Lbl, null, "Ward"), " ", /* @__PURE__ */ React.createElement("span", { "data-mapped": "ward" }, m.ward)), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Lbl, null, "Order date"), " ", /* @__PURE__ */ React.createElement("span", { "data-date": "" }, m.orderDate)), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Lbl, null, "เวลาที่เริ่มให้"), " ____________")), /* @__PURE__ */ React.createElement("div", { className: "facts-line" }, /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Lbl, null, "Delivered"), " ", /* @__PURE__ */ React.createElement(Fig, { of: "deliveredMl" }, m.deliveredMl), " ", /* @__PURE__ */ React.createElement(Lbl, null, "mL")), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Lbl, null, "Dead space"), " ", /* @__PURE__ */ React.createElement(Fig, { of: "deadMl" }, m.deadMl), " ", /* @__PURE__ */ React.createElement(Lbl, null, "mL")), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Lbl, null, "Prepared"), " ", /* @__PURE__ */ React.createElement(Fig, { of: "preparedMl" }, m.preparedMl), " ", /* @__PURE__ */ React.createElement(Lbl, null, "mL"))), /* @__PURE__ */ React.createElement("div", { className: "amounts" }, /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Lbl, null, "Dextrose"), " ", /* @__PURE__ */ React.createElement(Fig, { of: "delivered.dextrosePct" }, m.dextrosePct), " ", /* @__PURE__ */ React.createElement(Lbl, null, "%"), " ", /* @__PURE__ */ React.createElement(Fig, { of: "delivered.dextroseG" }, m.dextroseG), " ", /* @__PURE__ */ React.createElement(Lbl, null, "g")), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Lbl, null, "Amino acid"), " ", /* @__PURE__ */ React.createElement(Fig, { of: "delivered.aminoAcidPct" }, m.aminoAcidPct), " ", /* @__PURE__ */ React.createElement(Lbl, null, "%")), m.amino.map((r) => /* @__PURE__ */ React.createElement("span", { key: r.key }, /* @__PURE__ */ React.createElement(Lbl, null, r.label), " ", /* @__PURE__ */ React.createElement(Fig, { of: "delivered.aminoAcidG." + r.key }, r.value), " ", /* @__PURE__ */ React.createElement(Lbl, null, "g"))), m.delivered.map((r) => /* @__PURE__ */ React.createElement("span", { key: r.key }, /* @__PURE__ */ React.createElement(Lbl, null, r.label), " ", /* @__PURE__ */ React.createElement(Fig, { of: "delivered." + r.key }, r.value), " ", /* @__PURE__ */ React.createElement(Lbl, null, r.unit))), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Lbl, null, "Osmolarity"), " ", /* @__PURE__ */ React.createElement(Fig, { of: "delivered.osmolarity" }, m.osmolarity), " ", /* @__PURE__ */ React.createElement(Lbl, null, "mOsm/L")), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Lbl, null, "Calories"), " ", /* @__PURE__ */ React.createElement(Fig, { of: "delivered.kcal" }, m.kcal), " ", /* @__PURE__ */ React.createElement(Lbl, null, "kcal"))), /* @__PURE__ */ React.createElement("div", { className: "facts-line" }, /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Lbl, null, "วันที่ผลิต"), " ", /* @__PURE__ */ React.createElement("span", { "data-date": "" }, m.preparedDate)), /* @__PURE__ */ React.createElement("span", { className: "fixed-line", "data-fixed": "" }, m.storage), /* @__PURE__ */ React.createElement("span", { className: "fixed-line", "data-fixed": "" }, m.extension))), /* @__PURE__ */ React.createElement("section", { className: "part part-bag" }, /* @__PURE__ */ React.createElement("div", { className: "bag-name", "data-mapped": "name" }, m.name), /* @__PURE__ */ React.createElement("div", { className: "bag-ward", "data-mapped": "ward" }, m.ward), /* @__PURE__ */ React.createElement("div", { className: "facts-line" }, /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Lbl, null, "AN"), " ", /* @__PURE__ */ React.createElement("span", { "data-mapped": "an" }, m.an)), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Lbl, null, "Date"), " ", /* @__PURE__ */ React.createElement("span", { "data-date": "" }, m.orderDate)))));
}
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
  const fetchDay = React.useCallback(async (day) => {
    const r = await gas({ action: "pharmacyOrders", token: user.token, date: day });
    if (r.error === "Unauthorized") {
      onExpired();
      return null;
    }
    if (r.error === "PasswordChangeRequired") {
      onMustChange();
      return null;
    }
    if (r.error === "Forbidden") {
      onExpired("บัญชีนี้ไม่มีสิทธิ์ใช้หน้าห้อง TPN");
      return null;
    }
    if (!r.ok) throw new Error(String(r.error || "โหลด order ไม่สำเร็จ"));
    const next = { date: day, counts: r.counts, orders: Core.currentOrders(r.orders), loadedAt: Date.now() };
    setReply(next);
    return next;
  }, [user.token]);
  const load = React.useCallback(async (day) => {
    setLoading(true);
    setError("");
    try {
      await fetchDay(day);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fetchDay]);
  React.useEffect(() => {
    load(date);
  }, []);
  React.useEffect(() => {
    if (!file || !reply) return;
    const ids = reply.orders.map((o) => o.sessionId);
    const probe = JSON.parse(JSON.stringify(file.state));
    if (!NameStore.touchSeen(probe, ids, reply.date)) return;
    file.save((s) => NameStore.touchSeen(s, ids, reply.date)).then(bump).catch((err) => setError(err.message));
  }, [file, reply]);
  React.useEffect(() => {
    if (!printJob) return;
    let live = true;
    const done = () => {
      if (live) setPrintJob(null);
    };
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
    }).catch((err) => {
      setError(err.message);
      setPrintJob(null);
    });
    return () => {
      live = false;
      window.removeEventListener("afterprint", done);
    };
  }, [printJob]);
  const who = user.name || user.email;
  const saveMapping = async (values) => {
    const order = mappingFor;
    await file.save((s) => NameStore.mapInfant(s, order.sessionId, values, who, (/* @__PURE__ */ new Date()).toISOString(), reply.date));
    setMappingFor(null);
    bump();
  };
  const printOrder = async (order, preparedDate) => {
    setBusy(true);
    setError("");
    try {
      const served = await fetch("compiled/tpn-room-version.js", { cache: "no-store" }).then((r) => r.ok ? r.text() : "").catch(() => null);
      if (served === null) {
        setError("เช็กรุ่นของหน้านี้ไม่ได้ ลองใหม่อีกครั้ง");
        return;
      }
      if (!Core.versionsMatch(served, VERSIONS)) {
        setError("NeoFeed ออกรุ่นใหม่แล้ว โหลดหน้านี้ใหม่ก่อนพิมพ์");
        return;
      }
      const fresh = await fetchDay(reply.date);
      if (!fresh) return;
      const check = Core.recheck(order, fresh.orders);
      if (check.refuse) {
        setError(check.refuse);
        return;
      }
      const mapping = file.state.infants[order.sessionId];
      const reasons = Core.printReasons(check.order, {
        date: fresh.date,
        constantsVersion: VERSIONS.constantsVersion,
        stickerSchema: VERSIONS.stickerSchema,
        nameFileOpen: true,
        mapping
      });
      if (reasons.length) {
        setError(reasons.join(" · "));
        return;
      }
      setPrintJob({
        model: Core.stickerModel(check.order, mapping, preparedDate),
        entry: {
          sessionId: order.sessionId,
          date: fresh.date,
          entryId: check.order.entryId,
          revision: check.order.revision,
          preparedDate,
          by: who,
          at: (/* @__PURE__ */ new Date()).toISOString()
        }
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const dateOk = Core.isRealDate(date) && date >= win.min && date <= win.max;
  const orders = reply ? reply.orders : [];
  const submitted = orders.filter((o) => o.status === "submitted");
  const drafts = orders.filter((o) => o.status !== "submitted");
  const gone = reply && file ? Core.goneAfterPrint(orders, file.state.printLog, reply.date) : [];
  const count = file ? Object.keys(file.state.infants).length : 0;
  const backToDraft = reply && file ? Core.draftAfterPrint(orders, file.state.printLog, reply.date) : [];
  const rowProps = reply ? { date: reply.date, file, onMap: setMappingFor, onPrint: printOrder, busy: busy || !!printJob } : null;
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "screen" }, /* @__PURE__ */ React.createElement("header", { className: "top" }, /* @__PURE__ */ React.createElement("h1", null, "ห้อง TPN"), /* @__PURE__ */ React.createElement("div", { className: "row" }, user.authMethod !== "google" && /* @__PURE__ */ React.createElement("button", { onClick: onChangePassword }, "เปลี่ยนรหัสผ่าน"), /* @__PURE__ */ React.createElement("button", { onClick: onLogout }, "ออกจากระบบ"))), /* @__PURE__ */ React.createElement("p", { className: "status-line", role: "status" }, "ชื่อในไฟล์ ", count, " คน · ", file ? `ไฟล์เปิดอยู่ · โฟลเดอร์ ${file.folderName}` : "ไฟล์ชื่อยังไม่เปิด", " · เข้าระบบ ", who), !file && /* @__PURE__ */ React.createElement(NameFilePanel, { store, onOpen: setFile }), /* @__PURE__ */ React.createElement("section", { className: "controls" }, /* @__PURE__ */ React.createElement("label", { className: "inline" }, "วันที่", /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "date",
      value: date,
      min: win.min,
      max: win.max,
      onChange: (e) => {
        const d = e.target.value;
        setDate(d);
        if (Core.isRealDate(d) && d >= win.min && d <= win.max) load(d);
      }
    }
  )), /* @__PURE__ */ React.createElement("button", { onClick: () => load(date), disabled: loading || !dateOk }, loading ? "กำลังโหลด…" : "รีเฟรช"), reply && /* @__PURE__ */ React.createElement("div", { className: "counts" }, /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("strong", null, reply.counts.submitted), " Submit แล้ว"), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("strong", null, reply.counts.drafts), " ฉบับร่าง"), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("strong", null, reply.counts.active), " ผู้ป่วยในหน่วย"), /* @__PURE__ */ React.createElement("span", { className: "muted" }, "โหลดเมื่อ ", Core.wardTime(null, reply.loadedAt)))), !dateOk && /* @__PURE__ */ React.createElement("p", { className: "bad", role: "alert" }, "เลือกได้ตั้งแต่ ", Core.buddhistDate(win.min), " ถึง ", Core.buddhistDate(win.max)), reply && reply.date !== date && dateOk && !loading && /* @__PURE__ */ React.createElement("p", { className: "note" }, "รายการด้านล่างเป็นของวันที่ ", Core.buddhistDate(reply.date)), error && /* @__PURE__ */ React.createElement("p", { className: "bad", role: "alert" }, error), gone.map((p) => /* @__PURE__ */ React.createElement("p", { key: p.sessionId, className: "warn gone", "data-gone": p.sessionId }, p.sessionId, ": พิมพ์แล้ว แต่ถูกลบใน NeoFeed — อย่าใช้ถุงนี้")), backToDraft.map((o) => /* @__PURE__ */ React.createElement("p", { key: o.sessionId, className: "warn" }, o.sessionId, ": พิมพ์แล้ว แต่ order เปลี่ยนเป็นฉบับร่าง อย่าใช้ถุงนี้จนกว่าหมอจะ Submit ฉบับใหม่")), reply && /* @__PURE__ */ React.createElement(React.Fragment, null, submitted.length === 0 && /* @__PURE__ */ React.createElement("p", { className: "muted" }, "ยังไม่มี order ที่ Submit แล้วของวันนี้"), /* @__PURE__ */ React.createElement("ul", { className: "orders" }, submitted.map((o) => /* @__PURE__ */ React.createElement(OrderRow, { key: o.entryId || o.sessionId, order: o, ...rowProps }))), drafts.length > 0 && /* @__PURE__ */ React.createElement("details", { className: "drafts" }, /* @__PURE__ */ React.createElement("summary", null, "ฉบับร่าง ", drafts.length, " รายการ"), /* @__PURE__ */ React.createElement("ul", { className: "orders" }, drafts.map((o) => /* @__PURE__ */ React.createElement(OrderRow, { key: o.entryId || o.sessionId, order: o, ...rowProps }))))), /* @__PURE__ */ React.createElement(Contacts, null)), mappingFor && file && /* @__PURE__ */ React.createElement(MappingDialog, { order: mappingFor, infants: file.state.infants, onSave: saveMapping, onClose: () => setMappingFor(null) }), printJob && /* @__PURE__ */ React.createElement(StickerSheet, { model: printJob.model }));
}
function TpnRoomApp({ store, googleReturn }) {
  const [user, setUser] = React.useState(readSession);
  const [notice, setNotice] = React.useState("");
  const [changing, setChanging] = React.useState(false);
  const signIn = (u) => {
    writeSession(u);
    setUser(u);
    setNotice("");
  };
  const signOut = (why) => {
    clearSession();
    setUser(null);
    setChanging(false);
    setNotice(why || "");
  };
  const logout = () => {
    if (user) gas({ action: "logout", token: user.token }, { keepalive: true }).catch(() => {
    });
    signOut();
  };
  React.useEffect(() => {
    if (!user) return;
    let lastInput = Date.now();
    const mark = () => {
      lastInput = Date.now();
    };
    window.addEventListener("pointerdown", mark);
    window.addEventListener("keydown", mark);
    const tick = setInterval(() => {
      if (Date.now() - lastInput > IDLE_LOGOUT_MS) {
        gas({ action: "logout", token: user.token }).catch(() => {
        });
        signOut("ไม่ได้ใช้งาน 30 นาที ออกจากระบบแล้ว");
      }
    }, 6e4);
    return () => {
      clearInterval(tick);
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("keydown", mark);
    };
  }, [user && user.token]);
  if (!user) return /* @__PURE__ */ React.createElement(SignIn, { onUser: signIn, notice, googleReturn });
  if (user.mustChangePassword || changing) {
    return /* @__PURE__ */ React.createElement(
      ChangePassword,
      {
        user,
        forced: !!user.mustChangePassword,
        onLogout: logout,
        onCancel: () => setChanging(false),
        onDone: (token) => {
          signIn({ ...user, token, mustChangePassword: false });
          setChanging(false);
        }
      }
    );
  }
  return /* @__PURE__ */ React.createElement(
    Room,
    {
      user,
      store,
      onLogout: logout,
      onExpired: (why) => signOut(why || "หมดเวลาเข้าสู่ระบบ เข้าใหม่อีกครั้ง"),
      onMustChange: () => signIn({ ...user, mustChangePassword: true }),
      onChangePassword: () => setChanging(true)
    }
  );
}
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
    today: () => Core.wardToday()
  });
  const googleReturn = takeGoogleReturn();
  ReactDOM.createRoot(mount).render(/* @__PURE__ */ React.createElement(TpnRoomApp, { store, googleReturn }));
})();
