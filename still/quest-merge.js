/* Day Quest state merge (2026-10-08, ticket 08 "phone and Mac out of sync").
   The phone and the Mac each keep the whole game (quest-v1) and the server keeps
   one copy. Newest-wins on the whole object let a device with an older day, or an
   older version of the page, wipe check-ins, habits and prana the other one had
   saved. This folds two copies into one instead:
   - check-ins, closes, starts, log lines, zaps, bag events: kept from both;
   - habit counts, XP: the higher number;
   - prana: the newer copy's number plus the log changes only the older copy saw
     (a block's spend and the sleep refill count once even if both devices did them);
   - a later game day beats an earlier one; anything else: the newer copy (ts).
   The SAME file runs in the page (still/quest-merge.js) and on the server
   (still-api/src/quest-merge.js). Edit one, copy it to the other. */
(function (root) {
  "use strict";
  const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
  const arr = (x) => (Array.isArray(x) ? x : []);
  const ms = (s) => { const t = Date.parse(s); return isNaN(t) ? 0 : t; };
  const LOG_MAX = 80, BAG_LOG_MAX = 60;
  const evKey = (e) => (e && e.at) + "|" + (e && e.msg);
  // a block's spend, the sleep refill and the steps boost happen once a day, whichever device records them.
  // Spend lines carry the block's key (k), so two devices that counted the same block with
  // different times or wording still count once (2026-10-09); a recount carries re = "old>new".
  const onceKey = (e) => {
    if (!e) return null;
    if (e.k) return e.re ? "re:" + e.k + ":" + e.re : "used:" + e.k;
    return /\bused \d+ \(|^Slept |\(Oura\)$/.test(e.msg || "") ? e.msg : null;
  };

  function mergeLog(o, n) {
    const out = [], seen = new Set(), once = new Set();
    let extra = 0;
    const nl = arr(n.log), floor = nl.length >= LOG_MAX ? Math.min(...nl.map((e) => ms(e.at))) : 0;
    for (const e of nl) { const k = evKey(e), ok = onceKey(e); if (seen.has(k) || (ok && once.has(ok))) continue; seen.add(k); out.push(e); if (ok) once.add(ok); }
    for (const e of arr(o.log)) {
      const k = evKey(e), ok = onceKey(e);
      if (seen.has(k) || (ok && once.has(ok)) || ms(e.at) < floor) continue;
      seen.add(k); if (ok) once.add(ok);
      out.push(e); extra += +e.xp || 0;   // the newer copy never saw this change
    }
    out.sort((a, b) => ms(b.at) - ms(a.at));
    return { log: out.slice(0, LOG_MAX), extra };
  }

  function mergeDay(o, n) {
    if (!o || !o.date) return n;
    if (!n || !n.date) return o;
    if (o.date !== n.date) return ms(o.date) > ms(n.date) ? o : n;
    const out = { ...o, ...n };
    for (const k of ["checks", "closes", "missed", "caches", "started", "spent", "work"])
      if (o[k] || n[k]) out[k] = { ...obj(o[k]), ...obj(n[k]) };
    if (o.habits || n.habits) {
      const h = { ...obj(o.habits) };
      for (const [k, v] of Object.entries(obj(n.habits))) h[k] = Math.max(+h[k] || 0, +v || 0);
      out.habits = h;
    }
    for (const k of ["slept", "ouraTried", "briefDone"]) if (o[k] || n[k]) out[k] = true;
    out.xp = Math.max(+o.xp || 0, +n.xp || 0);
    if (arr(o.sideDone).length > arr(n.sideDone).length) out.sideDone = o.sideDone;
    if (o.zaps || n.zaps) {
      const z = new Map();
      for (const x of [...arr(o.zaps), ...arr(n.zaps)]) if (x) z.set(x.s, x);
      out.zaps = [...z.values()].sort((a, b) => ms(a.s) - ms(b.s));
    }
    const { log, extra } = mergeLog(o, n);
    out.log = log;
    if (typeof n.prana === "number" && extra) out.prana = Math.max(0, Math.min(100, Math.round(n.prana + extra)));
    else if (typeof n.prana !== "number" && typeof o.prana === "number") out.prana = o.prana;
    if (o.pl || n.pl) {
      const p = new Map();
      for (const x of [...arr(o.pl), ...arr(n.pl)]) if (Array.isArray(x)) p.set(x[0], x);
      const pl = [...p.values()].sort((a, b) => ms(a[0]) - ms(b[0]));
      const last = pl[pl.length - 1];
      if (typeof out.prana === "number" && last && last[1] !== out.prana) {
        const at = Math.max(ms(last[0]), ...log.map((e) => ms(e.at)));
        pl.push([new Date(at + (at === ms(last[0]) ? 1 : 0)).toISOString(), out.prana]);
      }
      out.pl = pl;
    }
    return out;
  }

  function mergeBag(o, n) {
    if (!o || typeof o !== "object") return n;
    if (!n || typeof n !== "object") return o;
    const lastT = (b) => Math.max(0, ...arr(b.log).map((e) => +(e && e.t) || 0));
    const base = lastT(o) > lastT(n) ? o : n;   // slots and counts from the bag that changed last
    const ev = new Map();
    for (const e of [...arr(o.log), ...arr(n.log)]) if (e) ev.set([e.t, e.ev, e.id].join("|"), e);
    const log = [...ev.values()].sort((a, b) => (a.t || 0) - (b.t || 0)).slice(-BAG_LOG_MAX);
    return { ...base, seen: { ...obj(o.seen), ...obj(n.seen) }, log };
  }

  function mergePr(o, n) {
    if (!o) return n;
    if (!n) return o;
    const at = (p) => ms(p.changedAt);
    const out = at(o) > at(n) ? { ...n, ...o } : { ...o, ...n };   // level from the latest level change
    const e = new Map();
    for (const x of [...arr(o.ends), ...arr(n.ends)]) if (x && x.d) e.set(x.d, x);
    out.ends = [...e.values()].sort((a, b) => ms(a.d) - ms(b.d)).slice(-30);
    return out;
  }

  function mergeQuest(a, b) {
    const okA = a && typeof a.xp === "number", okB = b && typeof b.xp === "number";
    if (!okA) return okB ? b : a;
    if (!okB) return a;
    const [o, n] = (+a.ts || 0) <= (+b.ts || 0) ? [a, b] : [b, a];   // older, newer
    const out = { ...o, ...n };   // a field only one copy has (a newer page's) survives
    out.ts = Math.max(+a.ts || 0, +b.ts || 0);
    out.xp = Math.max(a.xp, b.xp);
    if (o.bestCombo != null || n.bestCombo != null) out.bestCombo = Math.max(+o.bestCombo || 0, +n.bestCombo || 0);
    if (o.days || n.days) out.days = { ...obj(o.days), ...obj(n.days) };
    if (o.pr || n.pr) out.pr = mergePr(o.pr, n.pr);
    if (o.bag || n.bag) out.bag = mergeBag(o.bag, n.bag);
    out.day = mergeDay(o.day, n.day);
    return out;
  }

  // same content, ignoring key order and the ts stamp
  function canon(x) {
    if (Array.isArray(x)) return "[" + x.map(canon).join(",") + "]";
    if (x && typeof x === "object")
      return "{" + Object.keys(x).filter((k) => x[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + canon(x[k])).join(",") + "}";
    return JSON.stringify(x === undefined ? null : x);
  }
  const same = (a, b) => canon({ ...obj(a), ts: 0 }) === canon({ ...obj(b), ts: 0 });

  root.QuestMerge = { mergeQuest, same };
})(typeof self !== "undefined" ? self : globalThis);
