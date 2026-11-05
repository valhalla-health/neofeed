// Task 0.1: can this PC's browser hold the TPN room's name file? Run on the real PC.
// Step 1 picks a folder and writes a test file. Step 2, after closing the browser or
// restarting the PC, says whether the folder, the permission, the file and the device
// key all survived. No patient data and no network: this page calls nothing.
(function () {
  "use strict";
  if (/\.github\.io\.?$/i.test(window.location.hostname)) { window.location.replace("moved.html"); return; }
  const TEST_FILE = "neofeed-tpn-room-check.txt";
  const out = document.getElementById("out");
  const say = (line) => { out.textContent += line + "\n"; };

  function db() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("neofeed_tpn_room_check", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function kv(mode, fn) {
    const d = await db();
    try {
      return await new Promise((res, rej) => {
        const tx = d.transaction("kv", mode);
        const q = fn(tx.objectStore("kv"));
        tx.oncomplete = () => res(q.result);
        tx.onerror = tx.onabort = () => rej(tx.error);
      });
    } finally { d.close(); }
  }

  function browser() {
    const m = /(Edg|Chrome)\/([\d.]+)/.exec(navigator.userAgent);
    return m ? `${m[1] === "Edg" ? "Edge" : "Chrome"} ${m[2]}` : navigator.userAgent;
  }
  function header() {
    out.textContent = "";
    say(`เบราว์เซอร์: ${browser()}`);
    say(`เวลา: ${new Date().toLocaleString("th-TH")}`);
    say(`เปิดโฟลเดอร์ได้ (File System Access): ${typeof window.showDirectoryPicker === "function" ? "ได้" : "ไม่ได้"}`);
  }

  async function writeTest(folder) {
    const fh = await folder.getFileHandle(TEST_FILE, { create: true });
    const w = await fh.createWritable();
    await w.write(`เขียนเมื่อ ${new Date().toISOString()}\n`);
    await w.close();
    return (await fh.getFile()).text();
  }

  document.getElementById("pick").addEventListener("click", async () => {
    header();
    try {
      const folder = await window.showDirectoryPicker({ mode: "readwrite", id: "tpn-room-check" });
      say(`โฟลเดอร์: ${folder.name}`);
      say(`สร้างไฟล์ทดสอบ: ได้ (${(await writeTest(folder)).trim()})`);
      say(`เขียนทับไฟล์เดิม: ได้ (${(await writeTest(folder)).trim()})`);
      await kv("readwrite", (s) => s.put(folder, "folder"));
      const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]);
      await kv("readwrite", (s) => s.put(key, "deviceKey"));
      say("เก็บโฟลเดอร์กับกุญแจเครื่องในเบราว์เซอร์: ได้");
      say("ขั้นต่อไป: ปิดเบราว์เซอร์ เปิดหน้านี้อีกครั้ง แล้วกดข้อ 2 จากนั้นรีสตาร์ตเครื่องแล้วกดข้อ 2 อีกครั้ง");
    } catch (err) {
      say(`ไม่ผ่าน: ${err.name}: ${err.message}`);
    }
  });

  document.getElementById("again").addEventListener("click", async () => {
    header();
    try {
      const folder = await kv("readonly", (s) => s.get("folder"));
      const key = await kv("readonly", (s) => s.get("deviceKey"));
      say(`กุญแจเครื่องยังอยู่: ${key ? "อยู่" : "หาย"}`);
      if (!folder) { say("โฟลเดอร์ที่เก็บไว้หายแล้ว เบราว์เซอร์ถูกล้างหรือเครื่องคืนค่าเอง"); return; }
      say(`โฟลเดอร์ที่จำไว้: ${folder.name}`);
      const before = await folder.queryPermission({ mode: "readwrite" });
      say(`สิทธิ์ตอนเปิดหน้า: ${before === "granted" ? "ยังอยู่ ไม่ต้องถาม" : "ต้องขอใหม่ (" + before + ")"}`);
      const after = before === "granted" ? before : await folder.requestPermission({ mode: "readwrite" });
      if (after !== "granted") { say("ไม่ได้รับสิทธิ์"); return; }
      const fh = await folder.getFileHandle(TEST_FILE);
      say(`ไฟล์ทดสอบยังอยู่: ${(await (await fh.getFile()).text()).trim()}`);
      say(`เขียนทับอีกครั้ง: ได้ (${(await writeTest(folder)).trim()})`);
    } catch (err) {
      say(`ไม่ผ่าน: ${err.name}: ${err.message}`);
    }
  });

  header();
})();
