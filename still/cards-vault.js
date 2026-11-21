/* Cards vault (2026-11-20, Junyan's c5: "yes"): scrambles the Cards page's lists before they are saved or sent.
   The page no longer locks (Junyan, 2026-11-20: "Card locking feature is annoying"): a device that has opened the
   cards once keeps the data key (keyOf, openWithKey) and opens them by itself after that.
   Card details are scrambled in the browser with AES-GCM (256 bit) under one random data key. That data key is itself
   locked twice, so there are two ways in:
     pk   one entry per passkey (Touch ID, Face ID). The passkey hands back a secret only it can make (the WebAuthn
          "prf" extension); that secret opens the data key.
     rc   the recovery code, shown once at setup (120 random bits, PBKDF2 into a key).
   Only the locked file ("envelope") is ever sent: the Day Hub server holds scrambled text it cannot read. A device
   that has opened the cards keeps the same locked file plus the data key, so that device can open it by itself.
   Everything here is plain functions on plain objects, so still/test/cards-vault.test.mjs runs it in node. */
(function (root) {
  "use strict";
  const cr = root.crypto, sub = cr && cr.subtle, enc = new TextEncoder(), dec = new TextDecoder();
  const KIND = "cards-vault", ITER = 210000, ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // no I, O, 0 or 1 to misread
  const rand = (n) => cr.getRandomValues(new Uint8Array(n));
  const b64 = (buf) => { const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); };
  const unb64 = (s) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  const aes = (raw, uses) => sub.importKey("raw", raw, "AES-GCM", false, uses);
  const sealRaw = async (key, bytes) => { const iv = rand(12); return { iv: b64(iv), ct: b64(await sub.encrypt({ name: "AES-GCM", iv }, key, bytes)) }; };
  const openRaw = async (key, box) => new Uint8Array(await sub.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, key, unb64(box.ct)));

  /** A new recovery code: 24 letters and digits in groups of four. */
  function makeCode() { const r = rand(24); let s = ""; for (let i = 0; i < 24; i++) s += ALPHA[r[i] & 31] + (i % 4 === 3 && i < 23 ? "-" : ""); return s; }
  /** What he typed, tidied: capitals, no spaces or dashes. */
  const normCode = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const codeOk = (s) => { const c = normCode(s); return c.length === 24 && [...c].every((ch) => ALPHA.includes(ch)); };
  async function codeKey(code, salt, iter) {
    const base = await sub.importKey("raw", enc.encode(normCode(code)), "PBKDF2", false, ["deriveKey"]);
    return sub.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: unb64(salt), iterations: iter || ITER }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function prfKey(out, salt) {
    const base = await sub.importKey("raw", out, "HKDF", false, ["deriveKey"]);
    return sub.deriveKey({ name: "HKDF", hash: "SHA-256", salt: unb64(salt), info: enc.encode("day-hub cards v1") }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  const isEnvelope = (e) => !!e && e.kind === KIND && typeof e.ct === "string" && typeof e.iv === "string" && !!e.rc && typeof e.rc.ct === "string";

  /** The open vault: the data key in both forms. raw stays so a passkey or a new recovery code can be added. */
  async function session(raw) { return { raw, dk: await aes(raw, ["encrypt", "decrypt"]) }; }
  async function seal(ses, env, data) { return { ...env, at: new Date().toISOString(), ...(await sealRaw(ses.dk, enc.encode(JSON.stringify(data)))) }; }
  async function read(ses, env) { return JSON.parse(dec.decode(await openRaw(ses.dk, env))); }

  /** A brand new vault around data. Returns the locked file, the open session and the recovery code (shown once). */
  async function create(data) {
    const ses = await session(rand(32)), code = makeCode(), salt = b64(rand(16));
    const rc = { salt, n: ITER, ...(await sealRaw(await codeKey(code, salt, ITER), ses.raw)) };
    const env = await seal(ses, { kind: KIND, v: 1, rc, prf: { salt: b64(rand(32)) }, pk: [] }, data);
    return { env, ses, code };
  }
  /** Opens with the recovery code. Throws "wrong code" when it does not fit. */
  async function openWithCode(env, code) {
    let raw; try { raw = await openRaw(await codeKey(code, env.rc.salt, env.rc.n), env.rc); } catch (e) { throw new Error("wrong code"); }
    const ses = await session(raw); return { ses, data: await read(ses, env) };
  }
  /** Opens with what a passkey handed back (id: which passkey, out: its secret bytes). */
  async function openWithPrf(env, id, out) {
    const w = (env.pk || []).find((p) => p.id === id); if (!w) throw new Error("this passkey is not set up for Cards");
    let raw; try { raw = await openRaw(await prfKey(out, env.prf.salt), w); } catch (e) { throw new Error("that passkey did not open the cards"); }
    const ses = await session(raw); return { ses, data: await read(ses, env) };
  }
  /** The data key as text, for a device that should open the cards by itself next time. */
  const keyOf = (ses) => b64(ses.raw);
  /** Opens with a key that keyOf gave. Throws "wrong key" when it does not fit this file. */
  async function openWithKey(env, key) {
    try { const ses = await session(unb64(key)); return { ses, data: await read(ses, env) }; } catch (e) { throw new Error("wrong key"); }
  }
  /** Adds (or replaces) a passkey's lock on the data key. */
  async function addPasskey(env, ses, id, out, label) {
    const w = { id, label: label || "", at: new Date().toISOString(), ...(await sealRaw(await prfKey(out, env.prf.salt), ses.raw)) };
    return { ...env, pk: (env.pk || []).filter((p) => p.id !== id).concat(w) };
  }
  /** A fresh recovery code; the old one stops working. */
  async function newCode(env, ses) {
    const code = makeCode(), salt = b64(rand(16));
    return { code, env: { ...env, rc: { salt, n: ITER, ...(await sealRaw(await codeKey(code, salt, ITER), ses.raw)) } } };
  }
  function forget(ses) { if (ses && ses.raw) ses.raw.fill(0); }

  /* ---------- the passkey itself (browser only) ---------- */
  const canPasskey = () => !!(root.PublicKeyCredential && root.navigator && root.navigator.credentials && root.isSecureContext);
  const rpId = () => root.location.hostname;
  /** Asks an existing passkey for its secret. ids: the passkeys this vault knows (base64). */
  async function askPasskey(env, ids) {
    const cred = await root.navigator.credentials.get({ publicKey: { challenge: rand(32), rpId: rpId(), userVerification: "required", timeout: 60000,
      allowCredentials: (ids || (env.pk || []).map((p) => p.id)).map((id) => ({ type: "public-key", id: unb64(id) })),
      extensions: { prf: { eval: { first: unb64(env.prf.salt) } } } } });
    const r = cred.getClientExtensionResults().prf, out = r && r.results && r.results.first;
    if (!out) throw new Error("no-prf");
    return { id: b64(cred.rawId), out: new Uint8Array(out) };
  }
  /** Makes a passkey on this device and gets its secret. Throws "no-prf" when the device's passkeys cannot keep one. */
  async function makePasskey(env) {
    const cred = await root.navigator.credentials.create({ publicKey: { challenge: rand(32), rp: { name: "Day Hub Cards", id: rpId() },
      user: { id: rand(16), name: "Cards", displayName: "Day Hub Cards" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" }, timeout: 60000,
      extensions: { prf: { eval: { first: unb64(env.prf.salt) } } } } });
    const r = cred.getClientExtensionResults().prf, id = b64(cred.rawId);
    if (!r || r.enabled === false) throw new Error("no-prf");
    if (r.results && r.results.first) return { id, out: new Uint8Array(r.results.first) };
    return askPasskey(env, [id]);   // some devices only hand the secret back on a second touch
  }

  root.CardsVault = { KIND, makeCode, normCode, codeOk, isEnvelope, create, seal, read, openWithCode, openWithPrf, keyOf, openWithKey, addPasskey, newCode, forget, canPasskey, askPasskey, makePasskey };
})(typeof window !== "undefined" ? window : globalThis);
