/* Day Quest state merge (2026-10-08, ticket 08 "phone and Mac out of sync").
   The phone and the Mac each keep the whole game (quest-v1) and the server keeps
   one copy. Newest-wins on the whole object let a device with an older day, or an
   older version of the page, wipe check-ins, habits and prana the other one had
   saved. This folds two copies into one instead:
   - check-ins, closes, starts, opened blocks, log lines, zaps, bag events: kept from both;
   - habit counts, their take-backs (voided), XP: the higher number;
   - a block's checklist: step by step, the later change winning (mergeWork);
   - prana: the newer copy's number plus the log changes only the older copy saw
     (a block's spend and the sleep refill count once even if both devices did them);
   - body (2026-10-19): worked out again from the merged log (bodyOf): the sleep line sets it, every
     other line marked m:"b" moves it. Never a copy's own number, which let a device that rolled the day
     from its own stale yesterday (or held an old copy) drop Body 48 points with nothing logged;
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

  /* Body from the day's log (2026-10-19). The latest sleep line (Oura readiness first) sets the level; every
     other m:"b" line, in time order, moves it, kept between 0 and 100 at each step as addEnergy does.
     null when the log holds no sleep line (the morning before sleep is in): then the copies' own numbers stand. */
  const SLEEP_RE = /^(?:Slept (\d+(?:\.\d+)?) h|Slept (\d+) \(Oura\)|Readiness (\d+) \(Oura\))$/;
  const sleepTo = (e) => {
    if (!e) return null;
    if (typeof e.to === "number") return e.to;
    const m = SLEEP_RE.exec(e.msg || "");
    if (!m) return null;
    return m[1] != null ? +m[1] * 10 : +(m[2] ?? m[3]);
  };
  const isSleep = (e) => !!e && e.m === "b" && (!!e.sl || SLEEP_RE.test(e.msg || ""));
  function bodyOf(day) {
    const lines = arr(day && day.log).filter((e) => e && e.m === "b").sort((a, b) => ms(a.at) - ms(b.at));
    let anchor = null;
    for (const e of lines) if (isSleep(e) && sleepTo(e) != null) {
      const ready = /^Readiness /.test(e.msg || "");
      if (!anchor || ready || !anchor.ready) anchor = { to: sleepTo(e), ready: ready || (anchor && anchor.ready) };
      if (ready) break;
    }
    if (!anchor) return null;
    let b = Math.max(0, Math.min(100, anchor.to));
    for (const e of lines) if (!isSleep(e)) b = Math.max(0, Math.min(100, b + (+e.xp || 0)));
    return Math.round(b);
  }
  // the day's log, newest first: up to LOG_MAX lines, plus every Body line (Body is worked out from them)
  function trimLog(log) {
    const out = [];
    let n = 0;
    for (const e of arr(log)) if (n++ < LOG_MAX || (e && e.m === "b")) out.push(e);
    return out;
  }

  function mergeLog(o, n) {
    const out = [], seen = new Set(), once = new Set();
    let extra = 0, extraB = 0;
    const nl = arr(n.log), nx = nl.filter((e) => !(e && e.m === "b"));
    const floor = nl.length >= LOG_MAX && nx.length ? Math.min(...nx.map((e) => ms(e.at))) : 0;
    for (const e of nl) { const k = evKey(e), ok = onceKey(e); if (seen.has(k) || (ok && once.has(ok))) continue; seen.add(k); out.push(e); if (ok) once.add(ok); }
    for (const e of arr(o.log)) {
      const k = evKey(e), ok = onceKey(e);
      if (seen.has(k) || (ok && once.has(ok)) || (ms(e.at) < floor && e.m !== "b")) continue;
      seen.add(k); if (ok) once.add(ok);
      out.push(e);   // the newer copy never saw this change
      if (e.m === "b") extraB += +e.xp || 0; else extra += +e.xp || 0;
    }
    out.sort((a, b) => ms(b.at) - ms(a.at));
    return { log: trimLog(out), extra, extraB };
  }

  /* A block's checklist (G.day.work[key], 2026-10-19, d28): a block both copies have merges step by step when its
     steps carry change times (t), the later change of each step winning its tick and paid record, so an untick on
     one device and a tick on the other both survive. A block without step times (an old page) is the newer copy's. */
  function mergeWork(ow, nw) {
    const out = { ...obj(ow), ...obj(nw) };
    for (const [k, b] of Object.entries(obj(nw))) {
      const a = obj(ow)[k];
      if (!a || !b || !(a.t || b.t)) continue;
      const tick = { ...obj(b.tick) }, paid = { ...obj(b.paid) }, t = { ...obj(b.t) };
      for (const [i, at] of Object.entries(obj(a.t))) {
        if (ms(at) <= ms(t[i])) continue;   // the older copy changed this step later
        if (obj(a.tick)[i]) tick[i] = a.tick[i]; else delete tick[i];
        if (obj(a.paid)[i]) paid[i] = a.paid[i]; else delete paid[i];
        t[i] = at;
      }
      out[k] = { ...a, ...b, tick, paid, t };
    }
    return out;
  }

  function mergeDay(o, n) {
    if (!o || !o.date) return n;
    if (!n || !n.date) return o;
    if (o.date !== n.date) return ms(o.date) > ms(n.date) ? o : n;
    const out = { ...o, ...n };
    for (const k of ["checks", "closes", "missed", "caches", "started", "spent", "meals", "mealq", "opened"])
      if (o[k] || n[k]) out[k] = { ...obj(o[k]), ...obj(n[k]) };
    if (o.work || n.work) out.work = mergeWork(o.work, n.work);
    // habit counts and their take-backs (voided, 2026-10-19, d28) only go up: the higher number from either copy,
    // so a take-back on one device is never undone by the other device's newer copy
    for (const f of ["habits", "voided"]) if (o[f] || n[f]) {
      const h = { ...obj(o[f]) };
      for (const [k, v] of Object.entries(obj(n[f]))) h[k] = Math.max(+h[k] || 0, +v || 0);
      out[f] = h;
    }
    // water glasses (2026-10-19, d23): kept from both; a glass undone on either device stays undone
    if (o.glasses || n.glasses) {
      const g = { ...obj(o.glasses) };
      for (const [k, v] of Object.entries(obj(n.glasses))) g[k] = g[k] && (g[k].off || (v && v.off)) ? { ...g[k], ...v, off: true } : { ...(g[k] || {}), ...v };
      out.glasses = g;
    }
    // ouraReady (2026-10-19, d58): today's Oura readiness is in; sticks like slept
    for (const k of ["slept", "ouraTried", "ouraReady", "briefDone"]) if (o[k] || n[k]) out[k] = true;
    out.xp = Math.max(+o.xp || 0, +n.xp || 0);
    if (arr(o.sideDone).length > arr(n.sideDone).length) out.sideDone = o.sideDone;
    if (o.feel || n.feel) {   // feelings check-ins and conflicts (2026-10-10): kept from both, once each
      const f = new Map();
      for (const x of [...arr(o.feel), ...arr(n.feel)]) if (x && x.id) f.set(x.id, x);
      out.feel = [...f.values()].sort((a, b) => ms(a.at) - ms(b.at));
    }
    if (o.zaps || n.zaps) {
      const z = new Map();
      for (const x of [...arr(o.zaps), ...arr(n.zaps)]) if (x) z.set(x.s, x);
      out.zaps = [...z.values()].sort((a, b) => ms(a.s) - ms(b.s));
    }
    const { log, extra, extraB } = mergeLog(o, n);
    out.log = log;
    if (typeof n.prana === "number" && extra) out.prana = Math.max(0, Math.min(100, Math.round(n.prana + extra)));
    else if (typeof n.prana !== "number" && typeof o.prana === "number") out.prana = o.prana;
    const derived = bodyOf(out);
    if (derived != null) out.body = derived;
    else if (typeof n.body === "number" && extraB) out.body = Math.max(0, Math.min(100, Math.round(n.body + extraB)));
    else if (typeof n.body !== "number" && typeof o.body === "number") out.body = o.body;
    if (o.bl || n.bl) {
      const p = new Map();
      for (const x of [...arr(o.bl), ...arr(n.bl)]) if (Array.isArray(x)) p.set(x[0], x);
      const bl = [...p.values()].sort((a, b) => ms(a[0]) - ms(b[0]));
      const last = bl[bl.length - 1];
      if (typeof out.body === "number" && last && last[1] !== out.body) {
        const at = Math.max(ms(last[0]), ...log.map((e) => ms(e.at)));
        bl.push([new Date(at + (at === ms(last[0]) ? 1 : 0)).toISOString(), out.body]);
      }
      out.bl = bl;
    }
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
    // the weekly gym slots Day Quest placed on the calendar (2026-10-16): kept from both, so a device that never
    // saw a placement cannot bring a session he deleted back. The newer copy wins a key both have.
    if (o.gymPlan || n.gymPlan) out.gymPlan = { ...obj(o.gymPlan), ...obj(n.gymPlan) };
    // gym sessions he moved from a gym card (2026-10-16): kept from both, so the planner never fills their old slot again
    if (o.gymMoves || n.gymMoves) out.gymMoves = { ...obj(o.gymMoves), ...obj(n.gymMoves) };
    // "I'm ill" and "I'm better", one answer a day (2026-10-16): kept from both; for one day the later answer wins
    if (o.ill || n.ill) {
      const ill = { ...obj(o.ill) };
      for (const [k, v] of Object.entries(obj(n.ill))) if (!ill[k] || ms(v && v.at) >= ms(ill[k].at)) ill[k] = v;
      out.ill = ill;
    }
    if (o.bag || n.bag) out.bag = mergeBag(o.bag, n.bag);
    if (o.nvc || n.nvc) {   // the NVC words he has used: the higher count of each
      const w = {}, nd = {};
      for (const v of [o.nvc, n.nvc]) { for (const [k, c] of Object.entries(obj(v && v.words))) w[k] = Math.max(w[k] || 0, +c || 0);
        for (const [k, c] of Object.entries(obj(v && v.needs))) nd[k] = Math.max(nd[k] || 0, +c || 0); }
      out.nvc = { words: w, needs: nd };
    }
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

  root.QuestMerge = { mergeQuest, same, bodyOf, trimLog };
})(typeof self !== "undefined" ? self : globalThis);
