// The TPN room's name file: NeoFeed ID → name and AN, encrypted, on this PC's disk,
// never in a request (openspec/changes/tpn-room-stickers, D5, D7).
//
// A random AES-GCM data key encrypts the table. The file holds that key wrapped
// twice: by a non-extractable device key in this browser's IndexedDB, which opens
// the file silently every day, and by a key derived from the room's passphrase,
// needed only after the browser's data is cleared or on a new PC.
//
// Any changed byte stops the file. The payload's additional data covers the header,
// so a changed wrap or salt fails too, and the text must equal its own canonical
// form, so a stray space fails. A damaged file is refused and never read as empty.
//
// Plain script, no DOM. test/verify-tpn-room-store-1105.cjs runs it in Node with a
// fake folder. The browser passes real handles and IndexedDB.
(function (root) {
  "use strict";

  const FILE_NAME = "neofeed-tpn-room-names.nfenc";
  const FORMAT = "neofeed-tpn-room-names";
  const FILE_VERSION = 1;
  const PBKDF2_ITERATIONS = 600000;
  const MIN_PASSPHRASE = 10;
  const PURGE_DAYS = 30;
  const DAY_MS = 86400000;

  // kind: "damaged" | "wrongPassphrase" | "changedElsewhere" | "exists"
  class NameFileError extends Error {
    constructor(kind, message) { super(message); this.name = "NameFileError"; this.kind = kind; }
  }

  const enc = new TextEncoder();
  const dec = new TextDecoder("utf-8", { fatal: true });
  const toB64 = (buf) => {
    const bytes = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  };
  const fromB64 = (s) => {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  const damaged = () => new NameFileError("damaged", "ไฟล์ชื่อเสียหายหรือถูกแก้ไข เปิดไม่ได้");

  function createStore({ subtle, randomBytes, kv, today }) {
    const iv = () => randomBytes(12);

    async function keyFromPassphrase(passphrase, kdf) {
      const base = await subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
      return subtle.deriveKey(
        { name: "PBKDF2", hash: "SHA-256", salt: fromB64(kdf.salt), iterations: kdf.iterations },
        base, { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]);
    }
    const newDeviceKey = () => subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]);
    async function wrap(dataKey, kek) {
      const nonce = iv();
      const ct = await subtle.wrapKey("raw", dataKey, kek, { name: "AES-GCM", iv: nonce });
      return { iv: toB64(nonce), ct: toB64(ct) };
    }
    // The key comes out extractable only when it must be wrapped again: on the
    // passphrase path, for the new device key.
    function unwrap(w, kek, extractable) {
      return subtle.unwrapKey("raw", fromB64(w.ct), kek, { name: "AES-GCM", iv: fromB64(w.iv) },
        { name: "AES-GCM", length: 256 }, extractable, ["encrypt", "decrypt"]);
    }

    // One field order, so the text can be compared with its own canonical form.
    const canonical = (e) => JSON.stringify({
      format: e.format, version: e.version,
      kdf: { name: e.kdf.name, hash: e.kdf.hash, iterations: e.kdf.iterations, salt: e.kdf.salt },
      byDevice: e.byDevice ? { iv: e.byDevice.iv, ct: e.byDevice.ct } : null,
      byPassphrase: { iv: e.byPassphrase.iv, ct: e.byPassphrase.ct },
      payload: { iv: e.payload.iv, ct: e.payload.ct },
    });
    const headerBytes = (e) => enc.encode(JSON.stringify({
      format: e.format, version: e.version, kdf: e.kdf, byDevice: e.byDevice, byPassphrase: e.byPassphrase,
    }));

    function parseEnvelope(text) {
      let e;
      try {
        e = JSON.parse(text);
        if (canonical(e) !== text) throw new Error("not canonical");
      } catch (err) { throw damaged(); }
      if (e.format !== FORMAT || e.version !== FILE_VERSION) throw damaged();
      return e;
    }
    async function seal(header, dataKey, state) {
      const nonce = iv();
      const ct = await subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: headerBytes(header) },
        dataKey, enc.encode(JSON.stringify(state)));
      return { ...header, payload: { iv: toB64(nonce), ct: toB64(ct) } };
    }
    async function unseal(e, dataKey) {
      try {
        const plain = await subtle.decrypt({ name: "AES-GCM", iv: fromB64(e.payload.iv), additionalData: headerBytes(e) },
          dataKey, fromB64(e.payload.ct));
        return JSON.parse(dec.decode(plain));
      } catch (err) { throw damaged(); }
    }

    async function writeAll(fileHandle, text) {
      // createWritable writes a swap file and commits on close(), so a crash or a
      // full disk leaves the previous version in place.
      const w = await fileHandle.createWritable();
      try { await w.write(text); await w.close(); }
      catch (err) { try { await w.abort(); } catch (e) {} throw err; }
      return (await fileHandle.getFile()).lastModified;
    }

    // ── An infant not seen in any order for 30 days goes, and so does a print-log
    //    line that old. That infant is mapped again from the paper order. ──
    function purge(state) {
      const cutoff = new Date(Date.parse(today() + "T00:00:00Z") - PURGE_DAYS * DAY_MS).toISOString().slice(0, 10);
      let removed = 0;
      for (const id of Object.keys(state.infants)) {
        if (state.infants[id].lastSeen < cutoff) { delete state.infants[id]; removed++; }
      }
      const kept = state.printLog.filter((p) => p.date >= cutoff);
      removed += state.printLog.length - kept.length;
      state.printLog = kept;
      return removed;
    }

    // A file open in this tab. `state` is plain data; change it only through save().
    function handleFor(fileHandle, dir, dataKey, envelope, state, lastModified) {
      // The change runs on a copy, and the copy replaces `state` only once it is on
      // disk. A failed write changes nothing.
      const write = async (change) => {
        const before = await fileHandle.getFile();
        if (before.lastModified !== lastModified) {
          throw new NameFileError("changedElsewhere", "ไฟล์ชื่อเปลี่ยนจากหน้าต่างอื่น โหลดหน้านี้ใหม่ก่อนแก้");
        }
        const next = JSON.parse(JSON.stringify(state));
        change(next);
        purge(next);
        const { payload, ...header } = envelope;
        const sealed = await seal(header, dataKey, next);
        lastModified = await writeAll(fileHandle, canonical(sealed));
        envelope = sealed;
        state = next;
      };
      // One write at a time: a print-log line and a seen date saved together would
      // each start from the same table, and the second would drop the first's line.
      let queue = Promise.resolve();
      return {
        folderName: dir.name,
        get state() { return state; },
        save(change) {
          const run = queue.then(() => write(change));
          queue = run.catch(() => {});
          return run;
        },
      };
    }

    const emptyState = (logLostOn) => ({ infants: {}, printLog: [], meta: { logLostOn: logLostOn || "" } });

    // ── A new file. Refuses to touch a file already there: use replaceFile. ──
    async function createFile(dir, passphrase, logLostOn) {
      if (String(passphrase).length < MIN_PASSPHRASE) throw new NameFileError("weakPassphrase", `รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSPHRASE} ตัวอักษร`);
      if (await readText(dir) !== null) throw new NameFileError("exists", "โฟลเดอร์นี้มีไฟล์ชื่ออยู่แล้ว");
      return writeNew(dir, passphrase, logLostOn);
    }
    async function writeNew(dir, passphrase, logLostOn) {
      const dataKey = await subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
      const kdf = { name: "PBKDF2", hash: "SHA-256", iterations: PBKDF2_ITERATIONS, salt: toB64(randomBytes(16)) };
      const deviceKey = await newDeviceKey();
      const header = {
        format: FORMAT, version: FILE_VERSION, kdf,
        byDevice: await wrap(dataKey, deviceKey),
        byPassphrase: await wrap(dataKey, await keyFromPassphrase(passphrase, kdf)),
      };
      const state = emptyState(logLostOn);
      const sealed = await seal(header, dataKey, state);
      const fileHandle = await dir.getFileHandle(FILE_NAME, { create: true });
      const lastModified = await writeAll(fileHandle, canonical(sealed));
      await kv.set("deviceKey", deviceKey);
      await kv.set("folder", dir);
      return handleFor(fileHandle, dir, dataKey, sealed, state, lastModified);
    }
    // ── A lost passphrase. The old file stays beside the new one under another name:
    //    it is unreadable without that passphrase, and a found passphrase gets it
    //    back. The new file starts with no print log, and says so (tasks.md 2.9). ──
    async function replaceFile(dir, passphrase) {
      if (String(passphrase).length < MIN_PASSPHRASE) throw new NameFileError("weakPassphrase", `รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSPHRASE} ตัวอักษร`);
      const old = await readText(dir);
      if (old !== null) {
        const stamp = String(today()).replace(/-/g, "") + "-" + Date.now();
        const keep = await dir.getFileHandle(FILE_NAME.replace(".nfenc", `.replaced-${stamp}.nfenc`), { create: true });
        await writeAll(keep, old);
      }
      return writeNew(dir, passphrase, today());
    }

    async function readText(dir) {
      let fh;
      try { fh = await dir.getFileHandle(FILE_NAME); }
      catch (err) {
        if (err && err.name === "NotFoundError") return null;
        throw err;
      }
      return (await fh.getFile()).text();
    }

    // ── Open. Returns { file } or { needsPassphrase: true }, or { missing: true } when
    //    the folder has no file. A damaged file throws. ──
    async function openFile(dir, passphrase) {
      const text = await readText(dir);
      if (text === null) return { missing: true };
      const e = parseEnvelope(text);
      const fileHandle = await dir.getFileHandle(FILE_NAME);
      const lastModified = (await fileHandle.getFile()).lastModified;

      if (passphrase === undefined || passphrase === null) {
        const deviceKey = await kv.get("deviceKey");
        if (!deviceKey || !e.byDevice) return { needsPassphrase: true };
        let dataKey;
        // Wrong device key: a copied file, or another PC wrapped it since. Only the
        // passphrase tells that apart from damage, and it fails closed there too.
        try { dataKey = await unwrap(e.byDevice, deviceKey, false); }
        catch (err) { return { needsPassphrase: true }; }
        const state = await unseal(e, dataKey);
        await kv.set("folder", dir);
        return { file: await afterOpen(fileHandle, dir, dataKey, e, state, lastModified) };
      }

      let dataKey;
      try { dataKey = await unwrap(e.byPassphrase, await keyFromPassphrase(passphrase, e.kdf), true); }
      catch (err) { throw new NameFileError("wrongPassphrase", "รหัสผ่านไม่ถูกต้อง หรือไฟล์เสียหาย"); }
      const state = await unseal(e, dataKey);
      // This browser gets a new device key, so the file opens silently from now on.
      const deviceKey = await newDeviceKey();
      const { payload, ...header } = e;
      const rewrapped = { ...header, byDevice: await wrap(dataKey, deviceKey) };
      const sealed = await seal(rewrapped, dataKey, state);
      const newModified = await writeAll(fileHandle, canonical(sealed));
      await kv.set("deviceKey", deviceKey);
      await kv.set("folder", dir);
      return { file: await afterOpen(fileHandle, dir, dataKey, sealed, state, newModified) };
    }
    async function afterOpen(fileHandle, dir, dataKey, e, state, lastModified) {
      const file = handleFor(fileHandle, dir, dataKey, e, state, lastModified);
      const probe = JSON.parse(JSON.stringify(state));
      if (purge(probe) > 0) await file.save(() => {});
      return file;
    }

    return {
      createFile, replaceFile, openFile, FILE_NAME,
      savedFolder: () => kv.get("folder"),
      forgetFolder: () => kv.del("folder"),
    };
  }

  // ── Plain edits to the table, so the page and the tests make them the same way. ──
  function mapInfant(state, sessionId, { name, an }, who, at, seenOn) {
    const had = state.infants[sessionId];
    const history = had ? had.history.concat([{ name: had.name, an: had.an, by: had.by, at: had.at }]) : [];
    state.infants[sessionId] = { name, an, by: who, at, lastSeen: had && had.lastSeen > seenOn ? had.lastSeen : seenOn, history };
  }
  // Marks the mapped infants in a reply as seen. Says whether anything moved, so a
  // refresh does not rewrite the file when nothing did.
  function touchSeen(state, sessionIds, date) {
    let moved = false;
    for (const id of sessionIds) {
      const it = state.infants[id];
      if (it && it.lastSeen < date) { it.lastSeen = date; moved = true; }
    }
    return moved;
  }
  function logPrint(state, entry) { state.printLog.push(entry); }

  // ── IndexedDB as a small key-value box. Holds the device key and the folder handle. ──
  function browserKv(indexedDB) {
    const open = () => new Promise((res, rej) => {
      const r = indexedDB.open("neofeed_tpn_room", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const run = async (mode, fn) => {
      const db = await open();
      try {
        return await new Promise((res, rej) => {
          const tx = db.transaction("kv", mode);
          const req = fn(tx.objectStore("kv"));
          tx.oncomplete = () => res(req.result);
          tx.onerror = tx.onabort = () => rej(tx.error);
        });
      } finally { db.close(); }
    };
    return {
      get: (k) => run("readonly", (s) => s.get(k)),
      set: (k, v) => run("readwrite", (s) => s.put(v, k)),
      del: (k) => run("readwrite", (s) => s.delete(k)),
    };
  }

  const api = { createStore, browserKv, mapInfant, touchSeen, logPrint, NameFileError, FILE_NAME, MIN_PASSPHRASE, PBKDF2_ITERATIONS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TPNRoomStore = api;
})(typeof window !== "undefined" ? window : globalThis);
