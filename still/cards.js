/* Cards (2026-11-20): Junyan's and Caney's credit cards inside the calendar. Page design: mockup v3 (c4: "yes").
   The page answers one question, "what do I need to do next": every card that needs something becomes one row with a
   date, a verb (Pay, Spend, Close, Switch, Do) and one button. Every card is one line in the list on the left.
   Records are separate lists that point at a card by cardId, so a later money page (the YNAB replacement) can share them:
     cards         one per card (owner, issuer, last 4, status, limit, statement and due day, autopay, fee, spend target,
                   bonus, points, product switch dates, notes)
     todos         {id, cardId, text, done, due}
     transactions  {id, cardId, date, amount, payee, msr}   spend; counts toward the target when msr is not false
     payments      {id, cardId, date, amount, forDue}       a bill paid; marks that month's due date paid
     history       {id, cardId, date, text}                 a note of something decided ("Kept another year")
   Locked (c5: "yes"): the lists are scrambled by cards-vault.js before they are saved; this browser's storage and the
   Day Hub server (c6: "yes", still-api /quest/vault) hold only the locked file. The open copy is in memory, and is
   dropped after 5 idle minutes. While locked the calendar still shows that something is due on a day, from a small
   list of dates and kinds only (no card names). Only last 4 digits are ever kept, never a full number.
   The repo is public, so no card data lives here: the starting list is a private file he imports once.
   Rules are plain functions (events, msrState, actions, digest) so still/test/cards.test.mjs can check them in node. */
(function (root) {
  "use strict";
  const VLT = root.CardsVault;
  const K = { env: "cards-vault-v1", sync: "cards-sync-v1", digest: "cards-digest-v1", nopk: "cards-nopk-v1", old: "money-v1" };
  const IDLE = 5 * 60 * 1000;
  const STATUSES = ["Applied", "Card in Mail", "MSR", "Open", "Keeper", "No Fee", "Need to PS", "Product Switch", "Need to Close", "Pending Close", "Closed", "Rejected"];
  const DONE = new Set(["Closed", "Rejected"]), LISTS = ["cards", "todos", "transactions", "payments", "history"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const empty = () => ({ v: 1, cards: [], todos: [], transactions: [], payments: [], history: [] });
  const pad = (n) => String(n).padStart(2, "0");
  const addDays = (d, n) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const dayDiff = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
  const monthLen = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();   // m is 1..12
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const isActive = (c) => !DONE.has(c.status);
  const short = (c) => (c.last4 ? c.last4 + " " : "") + c.name;
  const money = (n, cur) => n == null || n === "" ? "" : (cur === "USD" ? "US$" : "$") + Number(n).toLocaleString("en-CA", { maximumFractionDigits: 0 });
  const ord = (n) => n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");
  const rel = (n) => n < 0 ? `${-n} day${n === -1 ? "" : "s"} late` : n === 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`;
  const fmt = (d, today) => { if (!d) return ""; const [y, m, dd] = d.split("-"); return `${MON[+m - 1]} ${+dd}${today && Math.abs(dayDiff(d, today)) > 300 ? ", " + y : ""}`; };
  const dow = (d) => DOW[new Date(d + "T12:00:00Z").getUTCDay()];

  function normalize(d) {
    const x = { ...empty(), ...(d && typeof d === "object" ? d : {}) };
    for (const k of LISTS) if (!Array.isArray(x[k])) x[k] = [];
    return x;
  }

  /** Spend target: base (spend typed in by hand, at baseAt) plus every counted transaction added after it. The current step is the
      first one not yet reached; deadlines are inclusive. */
  function msrState(card, data, today) {
    const m = card.msr; if (!m || !(m.steps || []).length) return null;
    const extra = (data.transactions || []).filter((t) => t.cardId === card.id && t.msr !== false && (!m.baseAt || (t.at || 0) > m.baseAt)).reduce((s, t) => s + (+t.amount || 0), 0);
    const spent = Math.round(((+m.base || 0) + extra) * 100) / 100;
    const steps = m.steps.filter((s) => s.amount);
    if (!steps.length) return null;
    const step = steps.find((s) => spent < s.amount) || steps[steps.length - 1];
    const met = spent >= step.amount;
    const daysLeft = step.deadline && today ? dayDiff(step.deadline, today) : null;
    return { spent, step, steps, met, allMet: steps.every((s) => spent >= s.amount), left: Math.max(0, step.amount - spent), pct: Math.min(100, Math.round(spent / step.amount * 100)), daysLeft, late: !met && daysLeft != null && daysLeft < 0 };
  }
  const dueOn = (c, y, m) => `${y}-${pad(m)}-${pad(Math.min(c.dueDay, monthLen(y, m)))}`;
  const isPaid = (c, data, day) => data.payments.some((p) => p.cardId === c.id && p.forDue === day);
  /** The bill to look at now: the first due date from a week ago onward that is not marked paid. after is set when the
      nearest coming one is already paid, so the list can say "paid". */
  function dueNow(c, data, today) {
    if (!c.dueDay) return null;
    let y = +today.slice(0, 4), m = +today.slice(5, 7) - 1; if (m < 1) { m = 12; y--; }
    const back = addDays(today, -7), floor = data.since && data.since > back ? data.since : back; let firstPaid = null;   // bills due before he started tracking here are not his to tick off
    for (let i = 0; i < 3; i++) {
      const day = dueOn(c, y, m);
      if (day >= floor) { if (!isPaid(c, data, day)) return { day, after: firstPaid }; if (!firstPaid && day >= today) firstPaid = day; }
      if (++m > 12) { m = 1; y++; }
    }
    return null;
  }
  /** The next time the annual fee lands, on or after today. */
  function nextFee(c, today) {
    if (!c.fee || !(+c.fee.amount > 0) || !c.fee.date) return null;
    const md = c.fee.date.length > 5 ? c.fee.date.slice(5) : c.fee.date, y = +today.slice(0, 4);
    return `${y}-${md}` >= today ? `${y}-${md}` : `${y + 1}-${md}`;
  }

  /** Calendar events between two days (inclusive): bill due dates, annual fees, spend deadlines and dated to-dos, for
      cards that are not closed. Each is an all-day event on the pseudo calendar "cards"; the day is the id's third part. */
  function events(data, from, to, today) {
    const out = [], ev = (card, day, type, title, extra) => out.push({ id: `${type}:${card ? card.id : "x"}:${day}${extra ? ":" + extra : ""}`, calId: "cards", title, allDay: true, start: day, end: addDays(day, 1), kind: "other", cardId: card && card.id, cardEvent: type });
    const fy = +from.slice(0, 4), ty = +to.slice(0, 4);
    for (const c of data.cards) {
      if (!isActive(c)) continue;
      const who = c.owner === "Caney" ? " (C)" : "";
      if (c.dueDay) {
        let y = fy, m = +from.slice(5, 7);
        while (`${y}-${pad(m)}` <= to.slice(0, 7)) {
          const day = dueOn(c, y, m);
          if (day >= from && day <= to) ev(c, day, "due", `${isPaid(c, data, day) ? "✓ Paid" : "💳 Pay"} ${short(c)}${who}`);
          if (++m > 12) { m = 1; y++; }
        }
      }
      if (c.fee && +c.fee.amount > 0 && c.fee.date) {
        const md = c.fee.date.length > 5 ? c.fee.date.slice(5) : c.fee.date;
        for (let y = fy; y <= ty; y++) { const day = `${y}-${md}`; if (day >= from && day <= to) ev(c, day, "fee", `💸 Fee ${money(c.fee.amount, c.currency)} ${short(c)}${who}`); }
      }
      const st = msrState(c, data, today);
      if (st) for (const s of st.steps) if (s.deadline && s.deadline >= from && s.deadline <= to && st.spent < s.amount)
        ev(c, s.deadline, "msr", `🎯 Spend deadline ${short(c)}${who}: ${money(s.amount - st.spent)} left`, s.amount);
    }
    for (const t of data.todos) if (t.due && !t.done && t.due >= from && t.due <= to) {
      const c = data.cards.find((x) => x.id === t.cardId);
      out.push({ id: `todo:${t.id}:${t.due}`, calId: "cards", title: `☐ ${c ? (c.last4 || c.name) + ": " : ""}${t.text}`, allDay: true, start: t.due, end: addDays(t.due, 1), kind: "other", cardId: t.cardId, cardEvent: "todo" });
    }
    return out;
  }

  /** What needs doing, soonest first: one entry per thing, {t, card, day, ...}. day is null when nothing dates it.
        pay     a bill due within 10 days (or up to a week late) that is not marked paid; autopay cards never ask
        spend   the first spend target step not reached yet
        close   a card marked Need to Close or Pending Close, dated by its next annual fee when that is within 90 days
        switch  a card marked Need to PS, dated the same way
        do      a to-do not done yet */
  function actions(data, today, who) {
    const out = [], mine = (c) => !who || who === "all" || c.owner === who;
    for (const c of data.cards) {
      if (!isActive(c) || !mine(c)) continue;
      if (c.dueDay && !c.autopay) { const d = dueNow(c, data, today); if (d && dayDiff(d.day, today) <= 10) out.push({ t: "pay", card: c, day: d.day }); }
      const st = msrState(c, data, today);
      if (st && !st.allMet) out.push({ t: "spend", card: c, day: st.step.deadline || null, st });
      if (c.status === "Need to Close" || c.status === "Pending Close" || c.status === "Need to PS") {
        const f = nextFee(c, today), fee = f && dayDiff(f, today) <= 90 ? f : null;
        out.push({ t: c.status === "Need to PS" ? "switch" : "close", card: c, day: fee, fee });
      }
    }
    for (const td of data.todos) {
      if (td.done) continue;
      const c = data.cards.find((x) => x.id === td.cardId);
      if (c ? !isActive(c) || !mine(c) : who && who !== "all") continue;
      out.push({ t: "do", card: c || null, day: td.due || null, todo: td });
    }
    const rank = { pay: 0, close: 1, switch: 2, spend: 3, do: 4 };
    return out.sort((a, b) => (a.day || "9999").localeCompare(b.day || "9999") || rank[a.t] - rank[b.t]);
  }

  /** What the calendar may show while the cards are locked: dates and kinds only, no names, no amounts. */
  function digest(data, today) {
    const n = {};
    for (const e of events(data, addDays(today, -45), addDays(today, 400), today)) {
      const key = e.start + "|" + (e.cardEvent === "due" && e.title.startsWith("✓") ? "paid" : e.cardEvent);
      n[key] = (n[key] || 0) + 1;
    }
    return Object.keys(n).sort().map((key) => { const [d, k] = key.split("|"); return { d, k, n: n[key] }; });
  }
  const DIGEST = { due: ["💳 Card payment due", "💳", "card payments due"], paid: ["✓ Card paid", "✓", "cards paid"], fee: ["💸 Card fee", "💸", "card fees"], msr: ["🎯 Card spend deadline", "🎯", "card spend deadlines"], todo: ["☐ Card to-do", "☐", "card to-dos"] };
  function digestEvents(list, from, to) {
    return (Array.isArray(list) ? list : []).filter((x) => x && DIGEST[x.k] && x.d >= from && x.d <= to).map((x) => ({ id: `${x.k}:x:${x.d}`, calId: "cards",
      title: x.n > 1 ? `${DIGEST[x.k][1]} ${x.n} ${DIGEST[x.k][2]}` : DIGEST[x.k][0], allDay: true, start: x.d, end: addDays(x.d, 1), kind: "other", cardEvent: x.k, locked: true }));
  }

  /* ---------- the open copy, the lock and the saved file ---------- */
  const M = { env: undefined, ses: null, data: null, seen: 0, busy: Promise.resolve(), pending: null, timer: 0, pushT: 0, pulled: 0, syncErr: "", wired: false };
  const V = { own: "all", sel: null, q: "", closed: false, spend: null, spendIn: "main", edit: false, ps: false, list: false, lv: null, msg: "", undo: null, conflict: null, lastSel: null, code: "" };
  const parse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
  function envOf(store) { if (M.env === undefined) { const e = parse(store.get(K.env) || "null"); M.env = VLT && VLT.isEnvelope(e) ? e : null; } return M.env; }
  function setEnv(store, env) { M.env = env; store.set(K.env, env ? JSON.stringify(env) : null); }
  const syncOf = (store) => ({ rev: 0, dirty: false, at: "", ...(parse(store.get(K.sync) || "null") || {}) });
  const setSync = (store, s) => store.set(K.sync, JSON.stringify(s));
  const markDirty = (store) => setSync(store, { ...syncOf(store), dirty: true });
  const putDigest = (ctx) => ctx.store.set(K.digest, JSON.stringify(digest(M.data, ctx.today())));
  const state = (store) => M.data ? "open" : envOf(store) ? "locked" : "none";
  /** True when Cards has ever been set up here, so the calendar offers its Cards switch. */
  const hasAny = (store) => !!(M.data || store.get(K.env) || store.get(K.digest));
  function calEvents(store, from, to, today) { return M.data ? events(M.data, from, to, today) : digestEvents(parse(store.get(K.digest) || "[]"), from, to); }

  function lock(ctx, why) {
    if (VLT) VLT.forget(M.ses);
    M.ses = null; M.data = null; M.pending = null; clearInterval(M.timer); M.timer = 0;
    Object.assign(V, { sel: null, edit: false, ps: false, spend: null, undo: null, lv: null, msg: why || "", list: false, code: "" });
    if (ctx) ctx.redraw();
  }
  function opened(ctx, ses, data) {
    M.ses = ses; M.data = normalize(data); M.seen = Date.now(); V.lv = null; V.msg = "";
    putDigest(ctx);
    clearInterval(M.timer); M.timer = setInterval(() => { if (M.data && Date.now() - M.seen > IDLE) lock(ctx, "Locked after 5 minutes idle."); }, 15000);
    if (!M.wired && root.document) { M.wired = true; for (const ev of ["pointerdown", "keydown"]) root.document.addEventListener(ev, () => { M.seen = Date.now(); }, true); }
  }
  const pushSoon = (ctx) => { clearTimeout(M.pushT); M.pushT = setTimeout(() => push(ctx), 1200); };
  /** Scrambles the open copy and saves the locked file here, then sends it to the server. One save at a time, in order.
      The key in ses.dk still works after a lock, so a change made just before locking is not lost. */
  function persist(ctx) {
    const ses = M.ses, snap = JSON.stringify(M.data), vid = M.env && M.env.prf.salt;
    putDigest(ctx); markDirty(ctx.store);
    M.busy = M.busy.then(async () => {
      if (!ses || !M.env || M.env.prf.salt !== vid) return;
      setEnv(ctx.store, await VLT.seal(ses, M.env, JSON.parse(snap))); markDirty(ctx.store); pushSoon(ctx);
    }).catch((e) => toast(ctx, "Could not save: " + e.message));
    return M.busy;
  }
  /** A change to the locked file itself (a passkey added, a new recovery code), in line with the saves. */
  function envEdit(ctx, fn) {
    M.busy = M.busy.then(async () => { if (!M.env) return; setEnv(ctx.store, await fn(M.env)); markDirty(ctx.store); pushSoon(ctx); });
    return M.busy;
  }
  /** One change to the cards: do it, save it, redraw, and offer Undo when msg is given. */
  function change(ctx, fn, msg) {
    if (!M.data) return;
    const before = JSON.stringify(M.data);
    fn(M.data); V.undo = msg ? before : null;
    persist(ctx); ctx.redraw();
    if (msg) toast(ctx, msg, true);
  }

  /* ---------- the server copy (still-api /quest/vault): the same locked file, so phone and computer match ---------- */
  async function vaultFetch(ctx, method, body) {
    const key = ctx.api && ctx.api.key(); if (!key) throw new Error("unpaired");
    const r = await root.fetch(ctx.api.base + "/quest/vault", { method, cache: "no-store", headers: { "Content-Type": "application/json", "X-Quest-Key": key }, body: body ? JSON.stringify(body) : undefined });
    let d = {}; try { d = await r.json(); } catch (e) {}
    if (!r.ok && r.status !== 409) throw new Error(d.error || "HTTP " + r.status);
    return { ...d, status: r.status };
  }
  const syncWhy = (e) => e.message === "unpaired" ? "this device is not paired with Day Hub yet" : /Failed to fetch|NetworkError|Load failed/i.test(e.message) ? "the server could not be reached" : e.message;
  /** Takes the server's locked file as this device's. An open session re-reads it; if its key no longer fits, it locks. */
  async function adopt(ctx, env, rev, at) {
    setEnv(ctx.store, env); setSync(ctx.store, { rev, dirty: false, at: at || "" }); V.conflict = null;
    if (M.ses) { try { M.data = normalize(await VLT.read(M.ses, env)); putDigest(ctx); } catch (e) { lock(null, "Your cards were changed on another device. Unlock again."); } }
  }
  /** Asks the server what it holds. Returns "none", "same", "adopted" or "conflict"; throws when it cannot ask. */
  async function pull(ctx) {
    await M.busy;
    const r = await vaultFetch(ctx, "GET"), s = syncOf(ctx.store), mine = envOf(ctx.store);
    M.pulled = Date.now(); M.syncErr = "";
    if (mine && s.fresh) { await push(ctx); return "same"; }
    if (!r.rev) { if (mine) { setSync(ctx.store, { rev: 0, dirty: true, at: "" }); await push(ctx); } return "none"; }
    if (mine && r.rev === s.rev) { if (s.dirty) await push(ctx); return "same"; }
    const theirs = parse(r.blob); if (!VLT.isEnvelope(theirs)) throw new Error("the server copy is not a locked cards file");
    if (mine && s.dirty && mine.ct !== theirs.ct) { V.conflict = { rev: r.rev, at: r.at, env: theirs }; return "conflict"; }
    await adopt(ctx, theirs, r.rev, r.at); return "adopted";
  }
  async function push(ctx) {
    clearTimeout(M.pushT);
    const env = envOf(ctx.store); if (!env) return;
    try {
      const s = syncOf(ctx.store), sent = env.ct + env.rc.ct + (env.pk || []).length, r = await vaultFetch(ctx, "POST", { blob: JSON.stringify(env), base: s.rev, force: !!s.fresh });
      if (r.status === 409) { const theirs = parse(r.blob); if (VLT.isEnvelope(theirs)) { V.conflict = { rev: r.rev, at: r.at, env: theirs }; ctx.redraw(); } return; }
      const now = M.env ? M.env.ct + M.env.rc.ct + (M.env.pk || []).length : sent;
      M.syncErr = ""; setSync(ctx.store, { rev: r.rev, at: r.at, dirty: now !== sent });
      if (now !== sent) pushSoon(ctx);
    } catch (e) { M.syncErr = syncWhy(e); }
    if (V.sel === "@" && M.data) ctx.redraw();
  }
  /** Quiet check with the server: on opening the page, on unlock, and when he comes back to the tab. */
  function refresh(ctx, force) {
    if (!envOf(ctx.store) || (!force && Date.now() - M.pulled < 60000)) return Promise.resolve();
    M.pulled = Date.now();
    return pull(ctx).then((r) => { if (r === "adopted" || r === "conflict") ctx.redraw(); }).catch((e) => { M.syncErr = syncWhy(e); });
  }

  /* ---------- the page ---------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (ctx, sel) => ctx.page().querySelector(sel);
  const l4 = (c) => c.last4 ? `••${esc(c.last4)}` : "";
  const TYPE = { pay: "pay", spend: "spend", close: "close", switch: "close", do: "do" }, VERB = { pay: "Pay", spend: "Spend", close: "Close", switch: "Switch", do: "Do" };
  const cname = (c) => `<button class="lk" data-x="open" data-id="${esc(c.id)}">${esc(c.name)}</button>${c.last4 ? ` <small>${l4(c)}</small>` : ""}`;

  function row(a, today, where) {
    const c = a.card, n = a.day ? dayDiff(a.day, today) : null, id = c ? esc(c.id) : "";
    let line = "", sub = "", bt = "", extra = "";
    const when = n == null ? "" : `<em>${rel(n)}</em> · ${dow(a.day)} ${fmt(a.day, today)}`;
    if (a.t === "pay") { line = cname(c); sub = `${when} · ${esc(c.owner)}`; bt = `<button class="btn go" data-x="paid" data-id="${id}" data-due="${a.day}">Mark paid</button>`; }
    else if (a.t === "spend") {
      const st = a.st, per = n != null && n > 0 ? Math.ceil(st.left / n) : null;
      line = `<b>${money(st.left, c.currency)} more</b> on ${cname(c)}`;
      sub = (n == null ? "<em>no deadline set</em>" : n < 0 ? `<em>${rel(n)}</em> · was due ${fmt(a.day, today)}` : `<em>by ${fmt(a.day, today)}</em> · ${n} day${n === 1 ? "" : "s"} left${per ? ` · about ${money(per, c.currency)} a day` : ""}`) +
        (st.steps.length > 1 ? ` · step ${st.steps.indexOf(st.step) + 1} of ${st.steps.length}` : "");
      extra = `<div class="x-prog"><div><i style="width:${st.pct}%"></i></div>${money(st.spent, c.currency)} of ${money(st.step.amount, c.currency)}</div>`;
      bt = V.spend === c.id && V.spendIn === where ? `<input class="xamt" inputmode="decimal" placeholder="$ spent" aria-label="Amount spent"><button class="btn go" data-x="addspend" data-id="${id}">Add</button>` : `<button class="btn" data-x="spend" data-id="${id}">+ Add spend</button>`;
    } else if (a.t === "close") {
      const wait = c.status === "Pending Close";
      line = a.fee ? `${cname(c)} before the <b>${money(c.fee.amount, c.currency)} fee</b>` : cname(c);
      sub = (a.fee ? `${when} · ` : "") + (wait ? "close asked for, check it went through" : "marked to close") + ` · ${esc(c.owner)}`;
      bt = `<button class="btn go" data-x="closed" data-id="${id}">Closed it</button>${wait ? "" : `<button class="btn" data-x="keep" data-id="${id}">Keep it</button>`}`;
    } else if (a.t === "switch") {
      line = a.fee ? `${cname(c)} before the <b>${money(c.fee.amount, c.currency)} fee</b>` : cname(c);
      sub = (a.fee ? `${when} · ` : "") + `ask the bank for a product switch · ${esc(c.owner)}`;
      bt = `<button class="btn go" data-x="ps" data-id="${id}">Switched it</button>`;
    } else {
      line = `<b>${esc(a.todo.text)}</b>`;
      sub = [n == null ? "" : `<em>by ${fmt(a.day, today)}</em> · ${rel(n).toLowerCase()}`, c ? `${esc(c.name)} ${l4(c)} · ${esc(c.owner)}` : ""].filter(Boolean).join(" · ");
      bt = `<button class="btn go" data-x="tdone" data-id="${esc(a.todo.id)}">Done</button>`;
    }
    const chip = a.day ? `<i>${MON[+a.day.slice(5, 7) - 1]}</i><b>${+a.day.slice(8)}</b>` : `<i>any</i><b>day</b>`;
    return `<div class="x-act t-${TYPE[a.t]} ${n != null && n <= 2 ? "u-now" : ""}"><div class="x-date ${a.day ? "" : "nd"}">${chip}</div><div><div class="x-line"><span class="x-vb">${VERB[a.t]}</span>${line}</div><div class="x-sub">${sub}</div>${extra}</div><div class="x-bt">${bt}</div></div>`;
  }
  function hint(c, acts, data, today) {
    if (!isActive(c)) return ["none", c.status.toLowerCase()];
    const a = acts.find((x) => x.card === c);
    if (!a) { const d = dueNow(c, data, today); return ["none", c.autopay && c.dueDay ? "autopay" : d && d.after ? "paid ✓" : c.dueDay ? `due ${ord(c.dueDay)}` : ""]; }
    const n = a.day ? dayDiff(a.day, today) : null;
    if (a.t === "pay") return ["pay", n < 0 ? `${-n}d late` : n <= 1 ? `Pay ${rel(n).toLowerCase()}` : `Pay ${fmt(a.day)}`];
    if (a.t === "spend") return ["spend", `${money(a.st.left, c.currency)}${a.day ? " · " + fmt(a.day) : " to go"}`];
    if (a.t === "close") return ["close", `Close${a.day ? " " + fmt(a.day) : ""}`];
    if (a.t === "switch") return ["close", `Switch${a.day ? " " + fmt(a.day) : ""}`];
    return ["do", `To-do${a.day ? " " + fmt(a.day) : ""}`];
  }
  function drawLeft(ctx, acts, today) {
    const d = M.data, q = V.q.trim().toLowerCase(), own = (c) => V.own === "all" || c.owner === V.own;
    const all = d.cards.filter((c) => own(c) && (!q || `${c.issuer} ${c.name} ${c.last4}`.toLowerCase().includes(q)));
    const order = (c) => { const i = acts.findIndex((a) => a.card === c); return i < 0 ? 1e6 : i; };
    const line = (c) => { const [t, h] = hint(c, acts, d, today); return `<button class="x-c t-${t} ${t !== "none" ? "has" : ""} ${V.sel === c.id ? "sel" : ""} ${isActive(c) ? "" : "closed"}" data-x="open" data-id="${esc(c.id)}"><i class="dot"></i><span class="nm">${esc(c.name)}${c.last4 ? `<small>${l4(c)}</small>` : ""}</span><span class="hint">${esc(h)}</span></button>`; };
    let h = `<div class="x-lh"><span>All cards</span><button class="icon" data-x="list" title="Back">✕</button></div><label class="x-find"><span aria-hidden="true">🔍</span><input id="xq" placeholder="Find a card" value="${esc(V.q)}" aria-label="Find a card"></label>`;
    for (const o of ["Junyan", "Caney"]) {
      const list = all.filter((c) => c.owner === o && isActive(c)).sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
      if (list.length) h += `<div><div class="x-grp"><span>${o}</span><span>${list.length}</span></div>${list.map(line).join("")}</div>`;
    }
    const cl = all.filter((c) => !isActive(c)).sort((a, b) => a.name.localeCompare(b.name));
    if (cl.length) h += `<div><button class="x-more" data-x="showclosed">${V.closed || q ? "▾" : "▸"} Closed cards · ${cl.length}</button>${V.closed || q ? cl.map(line).join("") : ""}</div>`;
    if (!all.length) h += `<div class="x-ok">${q ? "No card matches that." : "No cards yet."}</div>`;
    h += `<div class="x-safe"><span>🔓 Unlocked on this device</span><button data-x="lock">Lock now</button></div>`;
    $(ctx, "#xleft").innerHTML = h;
  }
  function drawMain(ctx, acts, today) {
    const d = M.data;
    $(ctx, "#xown").innerHTML = [["all", "Both"], ["Junyan", "Junyan"], ["Caney", "Caney"]].map(([k, n]) => `<button data-x="own" data-id="${k}" aria-pressed="${V.own === k}">${n}</button>`).join("");
    const first = acts[0], n0 = first && first.day ? dayDiff(first.day, today) : null;
    $(ctx, "#xstatus").textContent = !d.cards.length ? "" : acts.length ? `${acts.length} to do${n0 != null ? " · next " + rel(n0).toLowerCase() : ""}` : "all clear";
    const clash = V.conflict ? `<div class="x-box x-clash"><div><b>Your cards were changed on two devices.</b><div class="x-sub">Pick the copy to keep. The other one stays on the server as a spare for a while.</div></div><div class="x-bt"><button class="btn go" data-x="mine">Keep this device's</button><button class="btn" data-x="theirs">Use the other one</button></div></div>` : "";
    let h;
    if (!d.cards.length) h = `<div class="x-clear"><div class="big">No cards yet</div><div class="meta">Bring in your starting list (the private file cards-seed.json on your Mac), or add a card by hand.</div><div class="x-bt c"><button class="btn go" data-x="import">Import your card file</button><button class="btn" data-x="new">+ Add a card</button></div></div>`;
    else if (!acts.length) h = `<div class="x-clear"><div class="big">All clear ✓</div><div class="meta">Nothing to pay, spend or decide right now.</div></div>`;
    else {
      const g = [["This week", []], ["Next 30 days", []], ["Later", []], ["Any time", []]];
      for (const a of acts.slice(1)) { const n = a.day ? dayDiff(a.day, today) : null; g[n == null ? 3 : n <= 7 ? 0 : n <= 30 ? 1 : 2][1].push(a); }
      const open = d.cards.filter((c) => isActive(c) && (V.own === "all" || c.owner === V.own)), busy = new Set(acts.filter((a) => a.card).map((a) => a.card.id)).size, quiet = open.length - busy;
      h = `<div class="x-h"><h2>Next up</h2></div><div class="x-box x-hero t-${TYPE[first.t]}">${row(first, today, "main")}</div>` +
        g.filter((x) => x[1].length).map(([n, l]) => `<div class="x-h"><h2>${n}</h2><span>${l.length}</span></div><div class="x-box">${l.map((a) => row(a, today, "main")).join("")}</div>`).join("") +
        (quiet > 0 ? `<div class="x-quiet">${quiet} other card${quiet === 1 ? " needs" : "s need"} nothing from you right now.</div>` : "");
    }
    $(ctx, "#xmain").innerHTML = clash + h;
  }
  const fact = (label, val) => `<div><p class="lbl">${label}</p><b>${val}</b></div>`;
  const field = (label, name, val, type = "text", extra = "") => `<label class="cf"><span>${label}</span><input name="${name}" type="${type}" value="${esc(val ?? "")}" ${extra}></label>`;
  function editForm(c) {
    const m = c.msr || { steps: [] }, sel = (name, opts, cur) => `<select name="${name}">${opts.map((o) => `<option ${o === cur ? "selected" : ""}>${o}</option>`).join("")}</select>`;
    return `<form class="cform" id="cardForm">
      <label class="cf full"><span>Card name</span><input name="name" value="${esc(c.name)}" required></label>
      ${field("Issuer", "issuer", c.issuer)}${field("Last 4 digits", "last4", c.last4, "text", 'maxlength="4" inputmode="numeric" pattern="\\d{0,4}"')}
      <label class="cf"><span>Owner</span>${sel("owner", ["Junyan", "Caney"], c.owner)}</label><label class="cf"><span>Status</span>${sel("status", STATUSES, c.status)}</label>
      <label class="cf"><span>Currency</span>${sel("currency", ["CAD", "USD"], c.currency)}</label>${field("Credit limit", "limit", c.limit, "number")}
      ${field("Statement day", "statementDay", c.statementDay, "number", 'min="1" max="31"')}${field("Payment due day", "dueDay", c.dueDay, "number", 'min="1" max="31"')}
      <label class="cf ck full"><input type="checkbox" name="autopay" ${c.autopay ? "checked" : ""}><span>Pays itself (autopay): do not ask me to pay it</span></label>
      ${field("Annual fee", "feeAmount", c.fee && c.fee.amount, "number")}${field("Fee date (MM-DD)", "feeDate", c.fee && c.fee.date, "text", 'placeholder="11-12" pattern="\\d\\d-\\d\\d"')}
      ${field("Spend so far", "msrBase", m.steps.length ? m.base : "", "number", 'step="0.01"')}<span></span>
      ${field("Spend target 1", "s0a", m.steps[0] && m.steps[0].amount, "number")}${field("by", "s0d", m.steps[0] && m.steps[0].deadline, "date")}
      ${field("Spend target 2", "s1a", m.steps[1] && m.steps[1].amount, "number")}${field("by", "s1d", m.steps[1] && m.steps[1].deadline, "date")}
      ${field("Welcome bonus", "bonusExpected", c.bonus && c.bonus.expected, "text", 'placeholder="e.g. 20,000 Avion"')}<label class="cf ck"><input type="checkbox" name="bonusReceived" ${c.bonus && c.bonus.received ? "checked" : ""}><span>Bonus received</span></label>
      ${field("Points program", "pointsProgram", c.points && c.points.program)}${field("Points now", "pointsBalance", c.points && c.points.balance, "number")}
      ${field("Closed on", "closed", c.closed, "date")}<span></span>
      <label class="cf full"><span>Notes</span><textarea name="notes" rows="4">${esc(c.notes)}</textarea></label>
      <div class="r full"><button type="button" class="btn del" data-x="del">Delete card</button><span class="spacer"></span><button type="button" class="btn" data-x="cancel">Cancel</button><button class="btn pri" type="submit">Save</button></div></form>`;
  }
  function settings(ctx) {
    const s = syncOf(ctx.store), env = M.env || {}, n = (env.pk || []).length, can = VLT.canPasskey();
    const sync = M.syncErr ? `<b>Not saved to the server yet</b>: ${esc(M.syncErr)}. Your cards stay safe on this device, and it will try again.` : s.dirty ? "Saving to the Day Hub server…" : s.rev ? `Saved on the Day Hub server${s.at ? " · " + esc(new Date(s.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })) : ""}. Your phone and computer show the same cards.` : "Not on the server yet.";
    return `<div class="ptabs"><span class="lbl">Lock and copies</span><span class="spacer"></span><button class="icon" data-x="close" title="Close">✕</button></div><div class="pbody">
      <div><p class="lbl">Lock</p><p class="x-p">Your cards lock by themselves after 5 minutes idle, and every time the page is closed.</p><div class="r"><button class="btn" data-x="lock">Lock now</button></div></div>
      <div><p class="lbl">Ways in</p><p class="x-p">🔑 Passkeys on file: <b>${n}</b>${can ? "" : " · this browser cannot use a passkey"}<br>🗝️ Recovery code: set (it was shown once, when you set up)</p>
        ${V.code ? `<div class="x-code">${esc(V.code.slice(0, 14))}<br>${esc(V.code.slice(15))}</div><p class="x-p">This is your new recovery code. The old one no longer works. Save it in 1Password now: it is not shown again.</p><div class="r"><button class="btn" data-x="copycode">Copy code</button><button class="btn go" data-x="codeok">I saved it</button></div>`
          : `<div class="r">${can ? `<button class="btn" data-x="addpk">Add a passkey on this device</button>` : ""}<button class="btn" data-x="newcode">Make a new recovery code</button></div>`}</div>
      <div><p class="lbl">Copies</p><p class="x-p">${sync}</p><div class="r"><button class="btn" data-x="syncnow">Check the server now</button><button class="btn" data-x="backup">Download a locked backup</button></div>
        <p class="x-p meta">A backup file is locked the same way: it opens only with your passkey or recovery code.</p></div>
      <div><p class="lbl">Card list</p><div class="r"><button class="btn" data-x="import">Import a card file</button><button class="btn" data-x="restore">Restore a locked backup</button></div></div>
    </div>`;
  }
  function drawPanel(ctx, acts, today) {
    const el = $(ctx, "#xpanel"), d = M.data, c = V.sel && V.sel !== "@" ? d.cards.find((x) => x.id === V.sel) : null;
    const old = el.querySelector(".pbody"), top = old && V.lastSel === V.sel ? old.scrollTop : 0, anim = V.lastSel !== V.sel;
    V.lastSel = V.sel;
    if (V.sel === "@") el.innerHTML = settings(ctx);
    else if (!c) { el.innerHTML = ""; return; }
    else {
      const mine = acts.filter((a) => a.card === c), st = msrState(c, d, today), tds = d.todos.filter((t) => t.cardId === c.id);
      const tone = st && !st.allMet ? "spend" : /Close|PS/.test(c.status) ? "close" : c.status === "Keeper" ? "do" : "none";
      const hist = [
        ...d.payments.filter((p) => p.cardId === c.id).map((p) => ({ d: p.date, t: `Paid the ${fmt(p.forDue)} bill`, x: p.amount ? money(p.amount, c.currency) : "", del: `pay:${p.id}` })),
        ...d.transactions.filter((t) => t.cardId === c.id).map((t) => ({ d: t.date, t: t.payee || "Spend added", x: money(t.amount, c.currency), del: `tx:${t.id}` })),
        ...d.history.filter((x) => x.cardId === c.id).map((x) => ({ d: x.date, t: x.text, del: `hist:${x.id}` })),
        ...(c.productSwitches || []).map((x) => ({ d: x, t: "Product switch" })), ...(c.closed ? [{ d: c.closed, t: "Card closed" }] : []),
      ].filter((x) => x.d).sort((a, b) => b.d.localeCompare(a.d)).slice(0, 12);
      const fee = nextFee(c, today), bonus = c.bonus && (c.bonus.expected || c.bonus.received) ? `${esc(c.bonus.expected || "Bonus")}${c.bonus.received ? " ✓ received" : ""}` : "none";
      const body = V.edit ? editForm(c) : `
       <div class="x-ph"><h2>${esc(c.name)}${c.last4 ? `<small>${l4(c)}</small>` : ""}</h2><span class="x-chip t-${tone}">${esc(c.status)}</span></div>
       ${isActive(c) ? `<div><p class="lbl">Needs you</p><div class="x-box">${mine.length ? mine.map((a) => row(a, today, "panel")).join("") : `<div class="x-ok">✓ Nothing to do on this card.</div>`}</div></div>` : ""}
       <div class="x-facts">
        ${fact("Payment due", c.dueDay ? `${ord(c.dueDay)} of each month${c.autopay ? " · autopay" : ""}` : "not set")}${fact("Statement closes", c.statementDay ? ord(c.statementDay) : "not set")}
        ${fact("Annual fee", c.fee && +c.fee.amount ? `${money(c.fee.amount, c.currency)}${fee ? " · " + fmt(fee, today) : ""}` : "No fee")}${fact("Credit limit", c.limit ? money(c.limit, c.currency) : "not set")}
        ${fact("Welcome bonus", bonus)}${fact("Points now", c.points && c.points.balance != null && c.points.balance !== "" ? `${Number(c.points.balance).toLocaleString("en-CA")} ${esc(c.points.program || "")}` : "not set")}
       </div>
       ${st ? `<div><p class="lbl">Spend target · ${money(st.spent, c.currency)} so far</p>${st.steps.map((s) => `<div class="x-li"><span class="x-step ${st.spent >= s.amount ? "on" : ""}">${st.spent >= s.amount ? "✓" : ""}</span><span>Spend ${money(s.amount, c.currency)}</span><span class="meta">${st.spent >= s.amount ? "done" : s.deadline ? "by " + fmt(s.deadline, today) : "no deadline"}</span></div>`).join("")}</div>` : ""}
       <div><p class="lbl">To-dos</p>${tds.map((t) => `<div class="x-li ${t.done ? "done" : ""}"><input type="checkbox" data-x="tcheck" data-id="${esc(t.id)}" ${t.done ? "checked" : ""} aria-label="Done"><span>${esc(t.text)}</span><span class="meta">${t.due ? fmt(t.due, today) : ""}</span><button class="x" data-x="tdel" data-id="${esc(t.id)}" aria-label="Remove">×</button></div>`).join("")}
        <div class="x-add"><input id="xtd" placeholder="Add a to-do" aria-label="Add a to-do"><input id="xtdd" type="date" title="Do it by (shows on the calendar)" aria-label="Do it by"><button class="btn" data-x="tadd" data-id="${esc(c.id)}">Add</button></div></div>
       ${V.ps ? `<form class="x-psf" id="psForm"><p class="lbl">Product switch</p><label class="cf"><span>The card is now called</span><input name="name" value="${esc(c.name)}" required></label><label class="cf"><span>Switched on</span><input name="date" type="date" value="${today}" required></label><div class="r"><button type="button" class="btn" data-x="pscancel">Cancel</button><button class="btn pri" type="submit">Save switch</button></div></form>` : ""}
       ${hist.length ? `<div><p class="lbl">History</p>${hist.map((x) => `<div class="x-li"><span>${esc(x.t)}</span><span class="meta">${fmt(x.d, today)}${x.x ? " · " + x.x : ""}</span>${x.del ? `<button class="x" data-x="hdel" data-id="${esc(x.del)}" aria-label="Remove">×</button>` : ""}</div>`).join("")}</div>` : ""}
       ${c.notes ? `<div><p class="lbl">Notes</p><p class="x-notes">${esc(c.notes)}</p></div>` : ""}
       <div class="r"><button class="btn" data-x="edit">Edit card</button>${isActive(c) && !V.ps ? `<button class="btn" data-x="ps" data-id="${esc(c.id)}">Product switch</button>` : ""}</div>`;
      el.innerHTML = `<div class="ptabs"><span class="lbl">${esc(c.issuer || "Card")} · ${esc(c.owner)}</span><span class="spacer"></span><button class="icon" data-x="close" title="Close">✕</button></div><div class="pbody">${body}</div>`;
    }
    const pb = el.querySelector(".pbody"); if (pb) { if (anim) pb.classList.add("in"); else pb.scrollTop = top; }
  }

  /* ---------- the lock screen ---------- */
  function lockHTML(ctx, st) {
    const env = envOf(ctx.store), can = VLT.canPasskey(), hasPk = !!(env && (env.pk || []).length), v = V.lv || (st === "none" ? "check" : hasPk && can ? "locked" : "recover");
    const msg = V.msg ? `<p class="x-msg">${esc(V.msg)}</p>` : "", back = `<button class="txt x-back" data-page="cal">‹ Back to the calendar</button>`;
    const file = `<button class="txt" data-x="restore">Restore from a backup file</button>`;
    const box = (h) => `<div class="x-lock"><div class="x-lk">${h}${back}</div></div>`;
    if (v === "check") return box(`<div class="ico">🔐</div><h2>Cards</h2><p>Checking for your cards…</p>`);
    if (v === "setup") return box(`<div class="ico">🔐</div><h2>Set up Cards</h2><p>Your card details are scrambled on this device before they are saved anywhere. Only last 4 digits are ever kept.</p>${msg}
      <div class="x-ways"><div>🔑<span><b>Passkey</b>: Touch ID or Face ID, every day</span></div><div>🗝️<span><b>Recovery code</b>: your spare key if the passkey is lost</span></div><div>💾<span><b>Backup file</b>: a locked copy you can download any time</span></div></div>
      <button class="btn go" data-x="setup">Set up</button>${M.syncErr ? `<button class="btn" data-x="recheck">Check the server again</button>` : ""}${file}`);
    if (v === "code") return box(`<div class="ico">🗝️</div><h2>Save your recovery code</h2><p>This is your way back in if you ever lose your passkey. It is shown once. Keep it in 1Password or on paper.</p>
      <div class="x-code">${esc(M.pending.code.slice(0, 14))}<br>${esc(M.pending.code.slice(15))}</div>${msg}
      <button class="btn" data-x="copycode">Copy code</button><button class="btn go" data-x="savedcode">I saved it</button>`);
    if (v === "passkey") return box(`<div class="ico">🔑</div><h2>Add your passkey</h2><p>From now on you open Cards on this device with Touch ID or Face ID. Your device may ask you twice.</p>${msg}
      <button class="btn go" data-x="makepk">Add a passkey</button><button class="txt" data-x="skippk">Not now, I will use the recovery code</button>`);
    if (v === "recover") return box(`<div class="ico">🗝️</div><h2>${hasPk && can ? "Recovery code" : "Cards are locked"}</h2><p>${hasPk && can ? "Type the code you saved when you set up Cards. It opens your cards and lets you make a new passkey." : "Type your recovery code to open your cards" + (can ? ". You can add a passkey for this device right after." : " (this browser cannot use a passkey).")}</p>${msg}
      <input id="xrc" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Recovery code"><button class="btn go" data-x="usecode">Unlock</button>
      ${hasPk && can ? `<button class="txt" data-x="tolock">Back</button>` : ""}${file}<button class="txt" data-x="toreset">Lost the code too? Start over</button>`);
    if (v === "reset") return box(`<div class="ico">🧹</div><h2>Start over?</h2><p>Without a passkey or the recovery code nobody can open the locked cards, not even this app. Starting over clears them from this device and replaces the server copy. You then set up again and bring your card list back in from your starting file (cards-seed.json on your Mac). Changes made since that file are lost.</p>
      <button class="btn del" data-x="reset">Yes, clear and start over</button><button class="txt" data-x="tolock">Back</button>`);
    return box(`<div class="ico">🔒</div><h2>Cards are locked</h2><p>Your card details stay scrambled until you unlock them.</p>${msg}
      <button class="btn go" data-x="unlock">Unlock with passkey</button><div class="meta">Touch ID on your Mac, Face ID on your phone</div>
      <button class="txt" data-x="torecover">Lost your passkey? Use your recovery code</button>`);
  }
  const SHELL = `<aside class="x-left" id="xleft"></aside>
    <div class="x-main"><div class="bar"><button class="icon x-back" data-page="cal" title="Calendar">‹</button><button class="icon x-menu" data-x="list" title="All cards">☰</button><h1>Cards</h1><span class="status" id="xstatus"></span><span class="spacer"></span>
      <div class="seg" id="xown"></div><button class="icon" data-x="settings" title="Lock and copies">⚙</button><button class="icon" data-x="lock" title="Lock now">🔒</button><button class="btn pri" data-x="new">+ Card</button></div>
      <div class="x-scroll"><div class="x-w" id="xmain"></div></div></div>
    <aside class="x-panel" id="xpanel"></aside><div id="xtoast"></div>`;

  /** Draws the whole page into ctx.page(). Locked or not set up: only the lock screen. */
  function draw(ctx, passive) {
    const pg = ctx.page(), st = state(ctx.store);
    /* a passive redraw (the calendar's own ticks) never wipes something he is in the middle of typing */
    if (passive && pg.classList.contains("cards") && (st === "open" && V.lv !== "passkey") === !!pg.querySelector("#xmain")) {
      const f = root.document.activeElement;
      if (pg.querySelector("#cardForm,#psForm") || [...pg.querySelectorAll("#xrc,#xtd,.xamt")].some((i) => i.value) || (f && pg.contains(f) && /INPUT|TEXTAREA|SELECT/.test(f.tagName))) return;
    }
    if (!VLT || !root.crypto || !root.crypto.subtle) { pg.className = "page cards locked"; pg.innerHTML = `<div class="x-lock"><div class="x-lk"><h2>Cards</h2><p>This browser cannot lock your cards (it needs a secure https page), so they stay closed here.</p></div></div>`; return; }
    if (st !== "open" || V.lv === "passkey") {
      pg.className = "page cards locked"; pg.innerHTML = lockHTML(ctx, st);
      if (st === "none" && !V.lv) firstCheck(ctx);
      else if (st === "locked" && !V.lv) refresh(ctx);
      const i = pg.querySelector("#xrc"); if (i && root.matchMedia && root.matchMedia("(min-width:761px)").matches) i.focus();
      return;
    }
    if (!pg.querySelector("#xmain")) pg.innerHTML = SHELL;
    if (V.sel && V.sel !== "@" && !M.data.cards.some((c) => c.id === V.sel)) V.sel = null;
    pg.className = "page cards" + (V.sel ? " sel" : " nosel") + (V.list ? " xlist" : "");
    const today = ctx.today(), acts = actions(M.data, today, V.own);
    drawLeft(ctx, acts, today); drawMain(ctx, acts, today); drawPanel(ctx, acts, today);
    const amt = pg.querySelector(V.spendIn === "panel" ? "#xpanel .xamt" : "#xmain .xamt"); if (amt) amt.focus();
  }
  /** First visit on a device: see whether the server already holds his locked cards before offering to set up. */
  function firstCheck(ctx) {
    if (syncOf(ctx.store).fresh) { V.lv = "setup"; return ctx.redraw(); }
    V.lv = "check";
    pull(ctx).then((r) => { V.lv = r === "adopted" ? null : "setup"; V.msg = ""; }, (e) => { M.syncErr = syncWhy(e); V.lv = "setup"; V.msg = `I could not look for cards saved from another device (${M.syncErr}). If you already set up Cards on another device, sort that out first so you do not end up with two sets.`; })
      .then(() => ctx.redraw());
  }
  function toast(ctx, msg, canUndo) {
    const t = ctx.page().querySelector("#xtoast"); if (!t) { ctx.toast(msg); return; }
    clearTimeout(toast.t);
    t.innerHTML = `<div class="x-toast"><span>${esc(msg)}</span>${canUndo ? `<button data-x="undo">Undo</button>` : ""}</div>`;
    toast.t = setTimeout(() => { t.innerHTML = ""; }, 6000);
  }
  const toastLater = (ctx, msg) => setTimeout(() => toast(ctx, msg), 30);
  const fail = (ctx, e) => { V.msg = e && e.name === "NotAllowedError" ? "That was cancelled or timed out. Try again." : (e && e.message) || String(e); ctx.redraw(); };
  const copy = async (text) => { try { await root.navigator.clipboard.writeText(text); return "Copied. Paste it into 1Password now."; } catch (e) { return "Could not copy. Select the code and copy it by hand."; } };
  const UNLOCKED = "Unlocked. Locks again after 5 minutes idle.";

  /* the lock screen's buttons */
  async function lockAct(ctx, act, b) {
    const store = ctx.store, offerPk = () => { if (VLT.canPasskey() && !store.get(K.nopk)) V.lv = "passkey"; else toastLater(ctx, UNLOCKED); };
    if (act === "setup") { M.pending = await VLT.create({ since: ctx.today(), ...normalize(parse(store.get(K.old) || "null")) }); V.lv = "code"; V.msg = ""; }
    else if (act === "copycode") V.msg = await copy(M.pending.code);
    else if (act === "savedcode") {
      const p = M.pending; setEnv(store, p.env); store.set(K.old, null); store.set(K.nopk, null);
      opened(ctx, p.ses, await VLT.read(p.ses, p.env)); M.pending = null; markDirty(store); push(ctx); offerPk();
    } else if (act === "makepk") {
      b.textContent = "Waiting for your device…";
      try { const pk = await VLT.makePasskey(M.env); await envEdit(ctx, (env) => VLT.addPasskey(env, M.ses, pk.id, pk.out, root.navigator.platform || "")); store.set(K.nopk, null); V.lv = null; V.msg = ""; toastLater(ctx, "Passkey added. Cards lock again after 5 minutes idle."); }
      catch (e) { if (e.message !== "no-prf") return fail(ctx, e); store.set(K.nopk, "1"); V.lv = null; V.msg = ""; toastLater(ctx, "This device's passkeys cannot lock Cards. The recovery code opens them here."); }
    } else if (act === "skippk") { store.set(K.nopk, "1"); V.lv = null; V.msg = ""; }
    else if (act === "unlock") {
      b.textContent = "Checking…";
      try { const pk = await VLT.askPasskey(M.env), o = await VLT.openWithPrf(M.env, pk.id, pk.out); opened(ctx, o.ses, o.data); refresh(ctx, true); toastLater(ctx, UNLOCKED); }
      catch (e) { return fail(ctx, e.message === "no-prf" ? new Error("This device's passkey cannot open Cards. Use your recovery code.") : e); }
    } else if (act === "usecode") {
      const code = (ctx.page().querySelector("#xrc") || {}).value || "";
      if (!VLT.codeOk(code)) return fail(ctx, new Error("That does not look like a recovery code: it is 24 letters and numbers."));
      b.textContent = "Checking…";
      try { const o = await VLT.openWithCode(M.env, code); opened(ctx, o.ses, o.data); refresh(ctx, true); offerPk(); }
      catch (e) { return fail(ctx, new Error(e.message === "wrong code" ? "That code does not open these cards. Check it and try again." : e.message)); }
    } else if (act === "torecover") { V.lv = "recover"; V.msg = ""; }
    else if (act === "tolock") { V.lv = null; V.msg = ""; }
    else if (act === "toreset") { V.lv = "reset"; V.msg = ""; }
    else if (act === "reset") { setEnv(store, null); store.set(K.digest, null); setSync(store, { rev: 0, dirty: false, at: "", fresh: true }); M.pending = null; V.lv = "setup"; V.msg = "Cleared. Set up again, then import your card file."; }
    else if (act === "recheck") { V.lv = null; V.msg = ""; M.syncErr = ""; }
    else if (act === "restore") return pickFile(ctx);
    ctx.redraw();
  }

  function pickFile(ctx) {
    const inp = root.document.createElement("input"); inp.type = "file"; inp.accept = "application/json,.json";
    inp.onchange = async () => {
      try {
        const j = JSON.parse(await inp.files[0].text());
        if (VLT.isEnvelope(j)) {
          if (envOf(ctx.store) && !root.confirm("Replace the locked cards on this device with this backup file? You will unlock it with the passkey or recovery code it was made with.")) return;
          lock(null); setEnv(ctx.store, j); markDirty(ctx.store); V.msg = "Backup loaded. Unlock it to carry on.";
        } else {
          if (!M.data) throw new Error("that is not a locked backup. Unlock first to import a card list");
          const n = normalize(j); if (!n.cards.length) throw new Error("no cards in that file");
          if (M.data.cards.length && !root.confirm(`Replace the ${M.data.cards.length} cards here with the ${n.cards.length} in this file?`)) return;
          V.sel = null; return change(ctx, (d) => { for (const k of LISTS) d[k] = n[k]; d.since = n.since || ctx.today(); }, `Imported ${n.cards.length} cards`);
        }
      } catch (e) { if (M.data) toast(ctx, "That file did not work: " + e.message); else V.msg = "That file did not work: " + e.message; }
      ctx.redraw();
    };
    inp.click();
  }
  const blank = (owner) => ({ id: uid("c"), owner, issuer: "", name: "New card", last4: "", status: "Open", currency: "CAD", limit: null, statementDay: null, dueDay: null, autopay: false, fee: null, msr: null, bonus: { expected: "", received: false }, points: { program: "", balance: null, asOf: null }, productSwitches: [], closed: null, notes: "" });
  function addSpend(ctx, id, box) {
    const v = parseFloat(String((box && box.querySelector(".xamt") || {}).value || "").replace(/[$,\s]/g, "")); if (!(v > 0)) return;
    const c = M.data.cards.find((x) => x.id === id), before = msrState(c, M.data, ctx.today());
    change(ctx, (d) => { d.transactions.push({ id: uid("x"), cardId: id, date: ctx.today(), amount: v, payee: "", msr: true, at: Date.now() }); V.spend = null; },
      before && before.spent + v >= before.step.amount ? `🎯 Target hit on ${c.name}` : `Added ${money(v, c.currency)} to ${c.name}`);
  }
  /** A row's own button: the row slides away, then the change lands. */
  function rowChange(ctx, b, fn, msg) { const r = b.closest(".x-act"); if (r) { r.classList.add("x-gone"); setTimeout(() => change(ctx, fn, msg), 280); } else change(ctx, fn, msg); }

  /** Wires the page's clicks. ctx: {store, today(), redraw(), toast(msg), page(), api:{base, key()}} */
  function onClick(e, ctx) {
    const b = e.target.closest("[data-x]"); if (!b) return false;
    const act = b.dataset.x, id = b.dataset.id, today = ctx.today();
    if (!M.data || V.lv === "passkey") { lockAct(ctx, act, b).catch((err) => fail(ctx, err)); return true; }
    const d = M.data, card = (x) => d.cards.find((c) => c.id === x), sel = card(V.sel);
    if (act === "own") V.own = id;
    else if (act === "open") { V.sel = id; V.edit = false; V.ps = false; V.list = false; }
    else if (act === "close") { V.sel = null; V.edit = false; V.ps = false; V.code = ""; }
    else if (act === "settings") { V.sel = V.sel === "@" ? null : "@"; V.edit = false; V.list = false; }
    else if (act === "list") V.list = !V.list;
    else if (act === "showclosed") V.closed = !V.closed;
    else if (act === "lock") return lock(ctx), true;
    else if (act === "spend") { V.spend = id; V.spendIn = b.closest("#xpanel") ? "panel" : "main"; }
    else if (act === "addspend") return addSpend(ctx, id, b.closest(".x-bt")), true;
    else if (act === "paid") return rowChange(ctx, b, (x) => x.payments.push({ id: uid("p"), cardId: id, date: today, amount: null, forDue: b.dataset.due }), `Paid: ${card(id).name}`), true;
    else if (act === "closed") return rowChange(ctx, b, (x) => { const c = x.cards.find((y) => y.id === id); c.status = "Closed"; c.closed = today; }, `Closed: ${card(id).name}`), true;
    else if (act === "keep") return rowChange(ctx, b, (x) => { x.cards.find((y) => y.id === id).status = "Keeper"; x.history.push({ id: uid("h"), cardId: id, date: today, text: "Kept another year" }); }, `Keeping ${card(id).name}. Its fee stays on the calendar.`), true;
    else if (act === "ps") { V.sel = id; V.ps = true; V.edit = false; V.list = false; }
    else if (act === "pscancel") V.ps = false;
    else if (act === "tdone") return rowChange(ctx, b, (x) => { x.todos.find((t) => t.id === id).done = true; }, "Done ✓"), true;
    else if (act === "tcheck") return change(ctx, (x) => { const t = x.todos.find((y) => y.id === id); t.done = !t.done; }), true;
    else if (act === "tdel") return change(ctx, (x) => { x.todos = x.todos.filter((t) => t.id !== id); }, "To-do removed"), true;
    else if (act === "tadd") { const i = $(ctx, "#xtd"), v = i.value.trim(), due = $(ctx, "#xtdd").value || null; if (!v) return i.focus(), true; return change(ctx, (x) => x.todos.push({ id: uid("t"), cardId: id, text: v, done: false, due })), true; }
    else if (act === "hdel") { const [k, hid] = id.split(":"), list = { pay: "payments", tx: "transactions", hist: "history" }[k]; return change(ctx, (x) => { x[list] = x[list].filter((y) => y.id !== hid); }, "Removed"), true; }
    else if (act === "undo") { if (V.undo) { M.data = normalize(JSON.parse(V.undo)); V.undo = null; persist(ctx); $(ctx, "#xtoast").innerHTML = ""; } }
    else if (act === "edit") { V.edit = true; V.ps = false; }
    else if (act === "cancel") { V.edit = false; if (sel && sel.name === "New card" && !sel.issuer && !sel.last4) return change(ctx, (x) => { x.cards = x.cards.filter((c) => c.id !== sel.id); V.sel = null; }), true; }
    else if (act === "new") { const n = blank(V.own === "Caney" ? "Caney" : "Junyan"); V.sel = n.id; V.edit = true; V.ps = false; V.list = false; return change(ctx, (x) => x.cards.push(n)), true; }
    else if (act === "del" && sel) { if (!root.confirm(`Delete ${sel.name}? Its to-dos, spend and payments go too.`)) return true; V.edit = false; V.sel = null; return change(ctx, (x) => { for (const k of LISTS) x[k] = x[k].filter((y) => k === "cards" ? y.id !== sel.id : y.cardId !== sel.id); }, `Deleted ${sel.name}`), true; }
    else if (act === "import" || act === "restore") return pickFile(ctx), true;
    else if (act === "backup") { const u = URL.createObjectURL(new Blob([JSON.stringify(M.env)], { type: "application/json" })), l = root.document.createElement("a"); l.href = u; l.download = `cards-locked-backup-${today}.json`; l.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); toast(ctx, "Locked backup downloaded"); return true; }
    else if (act === "syncnow") { b.textContent = "Checking…"; refresh(ctx, true).then(() => { if (!V.conflict && !M.syncErr && syncOf(ctx.store).dirty) return push(ctx); }).then(() => ctx.redraw()); return true; }
    else if (act === "addpk") {
      b.textContent = "Waiting for your device…";
      VLT.makePasskey(M.env).then((pk) => envEdit(ctx, (env) => VLT.addPasskey(env, M.ses, pk.id, pk.out, root.navigator.platform || ""))).then(() => { ctx.store.set(K.nopk, null); ctx.redraw(); toast(ctx, "Passkey added for this device"); })
        .catch((err) => { ctx.redraw(); toast(ctx, err.message === "no-prf" ? "This device's passkeys cannot lock Cards. Keep using the recovery code here." : err.name === "NotAllowedError" ? "That was cancelled or timed out." : "Could not add a passkey: " + err.message); });
      return true;
    } else if (act === "newcode") {
      if (!root.confirm("Make a new recovery code? The old one stops working, on every device.")) return true;
      let made = ""; envEdit(ctx, async (env) => { const r = await VLT.newCode(env, M.ses); made = r.code; return r.env; }).then(() => { V.code = made; ctx.redraw(); }).catch((err) => toast(ctx, "Could not make a new code: " + err.message));
      return true;
    } else if (act === "copycode") { copy(V.code).then((m) => toast(ctx, m)); return true; }
    else if (act === "codeok") V.code = "";
    else if (act === "mine") { const k = V.conflict; V.conflict = null; setSync(ctx.store, { ...syncOf(ctx.store), rev: k.rev, dirty: true }); push(ctx); }
    else if (act === "theirs") { const k = V.conflict; adopt(ctx, k.env, k.rev, k.at).then(() => ctx.redraw()); return true; }
    else return false;
    ctx.redraw(); return true;
  }
  function onSubmit(e, ctx) {
    const form = e.target; if (!M.data || !["cardForm", "psForm"].includes(form.id)) return false;
    e.preventDefault();
    const c = M.data.cards.find((x) => x.id === V.sel); if (!c) return true;
    const fd = Object.fromEntries(new FormData(form)), num = (v) => (v === "" || v == null ? null : +v), today = ctx.today();
    if (form.id === "psForm") {
      V.ps = false; const name = fd.name.trim() || c.name;
      change(ctx, (d) => { c.productSwitches = [...(c.productSwitches || []), fd.date].sort(); if (name !== c.name) { d.history.push({ id: uid("h"), cardId: c.id, date: fd.date, text: `Was ${c.name}` }); c.name = name; } if (c.status === "Need to PS") c.status = "Open"; }, `Switched: ${name}`);
      return true;
    }
    V.edit = false;
    change(ctx, (d) => {
      Object.assign(c, { name: fd.name.trim() || "Card", last4: fd.last4.replace(/\D/g, "").slice(-4), issuer: fd.issuer.trim(), owner: fd.owner, status: fd.status, currency: fd.currency,
        limit: num(fd.limit), statementDay: num(fd.statementDay), dueDay: num(fd.dueDay), autopay: !!fd.autopay, closed: fd.closed || (fd.status === "Closed" && !c.closed ? today : null), notes: fd.notes,
        fee: num(fd.feeAmount) ? { amount: num(fd.feeAmount), date: fd.feeDate || null } : null,
        bonus: { ...(c.bonus || {}), expected: fd.bonusExpected, received: !!fd.bonusReceived },
        points: { program: fd.pointsProgram, balance: num(fd.pointsBalance), asOf: num(fd.pointsBalance) != null ? today : null } });
      const steps = [[fd.s0a, fd.s0d], [fd.s1a, fd.s1d]].filter(([a]) => num(a)).map(([a, dl]) => ({ amount: num(a), deadline: dl || null }));
      if (steps.length) {
        const base = num(fd.msrBase) || 0, old = c.msr && msrState(c, d, today);
        /* a hand-typed "spend so far" restarts the count from now; left alone, the spend added since still counts */
        c.msr = old && Math.abs(old.spent - base) < 0.005 ? { ...c.msr, steps } : { steps, base, baseDate: today, baseAt: Date.now() };
      } else c.msr = null;
    }, `Saved ${fd.name.trim() || "card"}`);
    return true;
  }
  function onInput(e, ctx) {
    if (!M.data || e.target.id !== "xq") return false;
    V.q = e.target.value; const today = ctx.today(); drawLeft(ctx, actions(M.data, today, V.own), today);
    const i = $(ctx, "#xq"); i.focus(); i.setSelectionRange(V.q.length, V.q.length); return true;
  }
  function onKey(e, ctx) {
    const t = e.target;
    if (e.key === "Enter" && t.id === "xrc") { const b = ctx.page().querySelector('[data-x="usecode"]'); if (b) b.click(); return true; }
    if (!M.data) return false;
    if (e.key === "Enter" && t.classList && t.classList.contains("xamt")) { addSpend(ctx, V.spend, t.closest(".x-bt")); return true; }
    if (e.key === "Enter" && (t.id === "xtd" || t.id === "xtdd")) { ctx.page().querySelector('[data-x="tadd"]').click(); return true; }
    if (e.key === "Escape") { if (V.spend) V.spend = null; else if (V.edit || V.ps) { V.edit = false; V.ps = false; } else if (V.list) V.list = false; else if (V.sel) V.sel = null; else return false; if (t.blur) t.blur(); ctx.redraw(); return true; }
    return false;
  }

  root.Cards = { STATUSES, normalize, msrState, events, actions, digest, digestEvents, dueNow, nextFee, isActive, hasAny, calEvents, draw, onClick, onSubmit, onInput, onKey, refresh, lock,
    isOpen: () => !!M.data, view: V, select: (id) => { if (M.data && id) { V.sel = id; V.edit = false; V.ps = false; } } };
})(typeof window !== "undefined" ? window : globalThis);
