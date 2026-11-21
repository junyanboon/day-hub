/* Cards (2026-11-20): Junyan's and Caney's credit cards inside the calendar. Page design: mockup v3 (c4: "yes").
   The page answers one question, "what do I need to do next": every card that needs something becomes one row with a
   date, a verb (Pay, Spend, Close, Switch, Do) and one button. Every card is one line in the list on the left.
   Records are separate lists that point at a card by cardId, so a later money page (the YNAB replacement) can share them:
     cards         one per card (owner, issuer, last 4, status, limit, statement and due day, autopay, fee, spend target,
                   bonus, points, product switch dates, opened, closed, notes)
     todos         {id, cardId, text, done, due, doneAt, flow}   flow "close" or "switch": a step of that checklist
     transactions  {id, cardId, date, amount, payee, msr}   spend; counts toward the target when msr is not false
     payments      {id, cardId, date, amount, forDue}       a bill paid; marks that month's due date paid
     history       {id, cardId, date, text}                 a note of something decided ("Kept another year")
   No lock screen (Junyan, 2026-11-20: "Card locking feature is annoying so maybe let's drop that for the time being").
   The lists are still scrambled by cards-vault.js before they are saved, so the Day Hub server (c6: "yes", still-api
   /quest/vault) holds only a file it cannot read. Each device keeps its own key (cards-key-v1), so Cards opens by
   itself there; a new device needs the recovery code once. Only last 4 digits are ever kept, never a full number.
   The repo is public, so no card data lives here: the starting list is a private file he imports once.
   Rules are plain functions (events, msrState, actions, flowState, startFlow, timeline, digest) so still/test/cards.test.mjs can check them in node. */
(function (root) {
  "use strict";
  const VLT = root.CardsVault;
  const K = { env: "cards-vault-v1", sync: "cards-sync-v1", digest: "cards-digest-v1", key: "cards-key-v1", nopk: "cards-nopk-v1", old: "money-v1" };
  const STATUSES = ["Applied", "Card in Mail", "MSR", "Open", "Keeper", "No Fee", "Need to PS", "Product Switch", "Need to Close", "Pending Close", "Closed", "Rejected"];
  const DONE = new Set(["Closed", "Rejected"]), LISTS = ["cards", "todos", "transactions", "payments", "history"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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
      const fl = flowState(data, c);
      if (fl) { const f = nextFee(c, today), fee = f && dayDiff(f, today) <= 90 ? f : null; out.push({ t: fl.kind, card: c, day: fee, fee, flow: fl }); }
    }
    for (const td of data.todos) {
      if (td.done || td.flow) continue;   // a checklist step shows inside its card's Close or Switch row
      const c = data.cards.find((x) => x.id === td.cardId);
      if (c ? !isActive(c) || !mine(c) : who && who !== "all") continue;
      out.push({ t: "do", card: c || null, day: td.due || null, todo: td });
    }
    const rank = { pay: 0, close: 1, switch: 2, spend: 3, do: 4 };
    return out.sort((a, b) => (a.day || "9999").localeCompare(b.day || "9999") || rank[a.t] - rank[b.t]);
  }

  /* Closing a card or switching its product: one button makes a short checklist (to-dos marked flow), and the card's
     one row in the do-next list walks through it (Junyan, 2026-11-20: "Pressing a clean button for when I do close
     cards or product switches that then sets up a to do list (make it very concise)"). */
  const FLOWS = { close: ["Use or move the points", "Move autopays off", "Pay balance to $0", "Call to close"], switch: ["Pick the new card", "Call to switch", "Move autopays if the number changes"] };
  const kindOf = (c) => c.status === "Need to PS" ? "switch" : c.status === "Need to Close" || c.status === "Pending Close" ? "close" : null;
  /** Where a card's close or switch stands: {kind, steps, done, total, next}; null when it is doing neither. */
  function flowState(data, c) {
    const kind = isActive(c) ? kindOf(c) : null; if (!kind) return null;
    const steps = data.todos.filter((t) => t.cardId === c.id && t.flow === kind);
    return { kind, steps, done: steps.filter((t) => t.done).length, total: steps.length, next: steps.find((t) => !t.done) || null };
  }
  /** Drops checklist steps that are not done and no longer fit what the card is doing. */
  function tidyFlow(data, c) { const k = isActive(c) ? kindOf(c) : null; data.todos = data.todos.filter((t) => !(t.cardId === c.id && t.flow && !t.done && t.flow !== k)); }
  /** Starts a close or a switch: marks the card, writes the checklist and notes the day on the timeline. */
  function startFlow(data, id, kind, today) {
    const c = data.cards.find((x) => x.id === id); if (!c || !FLOWS[kind] || !isActive(c)) return false;
    if (kindOf(c) !== kind) c.status = kind === "close" ? "Need to Close" : "Need to PS";
    data.todos = data.todos.filter((t) => !(t.cardId === id && t.flow && !t.done));
    FLOWS[kind].forEach((text, i) => data.todos.push({ id: uid("t") + i, cardId: id, text, done: false, due: null, flow: kind }));
    data.history.push({ id: uid("h"), cardId: id, date: today, text: kind === "close" ? "Started closing" : "Started product switch" });
    return true;
  }
  /** One card's timeline: next holds what is coming (soonest first), past what happened (newest first). Each entry is
      {d, k, t, x, del}: day, kind, text, amount, and what the × removes (Junyan, 2026-11-20: "I want a time line of
      information though.. that is really important to me"). */
  function timeline(data, c, today) {
    const next = [], past = [];
    if (isActive(c)) {
      const d = c.dueDay ? dueNow(c, data, today) : null;
      if (d) next.push({ d: d.day, k: "pay", t: c.autopay ? "Bill due · autopay" : "Bill due" });
      const f = nextFee(c, today); if (f) next.push({ d: f, k: "fee", t: "Annual fee", x: money(c.fee.amount, c.currency) });
      const st = msrState(c, data, today);
      if (st) for (const s of st.steps) if (s.deadline && st.spent < s.amount) next.push({ d: s.deadline, k: "spend", t: `Spend ${money(s.amount, c.currency)}`, x: `${money(s.amount - st.spent, c.currency)} left` });
    }
    for (const t of data.todos) if (t.cardId === c.id) {
      if (t.done) { if (t.doneAt) past.push({ d: t.doneAt, k: "do", t: "✓ " + t.text, del: "todo:" + t.id }); }
      else if (t.due) next.push({ d: t.due, k: "do", t: t.text });
    }
    for (const p of data.payments) if (p.cardId === c.id && p.date) past.push({ d: p.date, k: "pay", t: `Paid the ${fmt(p.forDue)} bill`, x: p.amount ? money(p.amount, c.currency) : "", del: "pay:" + p.id });
    for (const t of data.transactions) if (t.cardId === c.id && t.date) past.push({ d: t.date, k: "spend", t: t.payee || "Spend added", x: money(t.amount, c.currency), del: "tx:" + t.id });
    for (const h of data.history) if (h.cardId === c.id && h.date) (h.date > today ? next : past).push({ d: h.date, k: "note", t: h.text, del: "hist:" + h.id });
    for (const x of c.productSwitches || []) if (x) past.push({ d: x, k: "switch", t: "Product switch" });
    if (c.closed) past.push({ d: c.closed, k: "close", t: "Closed" });
    if (c.opened) past.push({ d: c.opened, k: "open", t: "Opened" });
    return { next: next.sort((a, b) => a.d.localeCompare(b.d)), past: past.sort((a, b) => b.d.localeCompare(a.d)) };
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
  const M = { env: undefined, ses: null, data: null, busy: Promise.resolve(), pending: null, pushT: 0, pulled: 0, syncErr: "", opening: null };
  const V = { own: "all", sel: null, q: "", closed: false, spend: null, spendIn: "main", edit: false, ps: false, note: false, list: false, lv: null, msg: "", undo: null, conflict: null, lastSel: null, code: "" };
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

  /** Drops the open copy (the saved file no longer fits this device's key, or a backup file replaced it). */
  function lock(ctx, why) {
    if (VLT) VLT.forget(M.ses);
    M.ses = null; M.data = null; M.pending = null;
    Object.assign(V, { sel: null, edit: false, ps: false, note: false, spend: null, undo: null, lv: null, msg: why || "", list: false, code: "" });
    if (ctx) ctx.redraw();
  }
  /** The cards are open. This device keeps the key, so next time they open without asking. */
  function opened(ctx, ses, data) {
    M.ses = ses; M.data = normalize(data); V.lv = null; V.msg = "";
    ctx.store.set(K.key, VLT.keyOf(ses)); ctx.store.set(K.nopk, null);
    putDigest(ctx);
  }
  /** Opens the saved file with this device's own key, quietly: on page load, and when Cards is shown. A key that no
      longer fits is dropped, and the page then asks for the recovery code. */
  function wake(ctx) {
    const env = VLT && envOf(ctx.store), key = ctx.store.get(K.key);
    if (M.data || M.opening || !env || !key) return M.opening || Promise.resolve();
    M.opening = VLT.openWithKey(env, key).then((o) => { opened(ctx, o.ses, o.data); refresh(ctx); }, () => { ctx.store.set(K.key, null); }).then(() => { M.opening = null; ctx.redraw(); });
    return M.opening;
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
    if (msg) toast(ctx, msg, true); else { const t = ctx.page().querySelector("#xtoast"); if (t) t.innerHTML = ""; }   // an old Undo must not outlive the change it was for
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
    if (M.ses) { try { M.data = normalize(await VLT.read(M.ses, env)); putDigest(ctx); } catch (e) { lock(null, "Your cards were set up again on another device. Type the recovery code from that set-up."); } }
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

  const relS = (n) => n < 0 ? `${-n}d late` : n === 0 ? "today" : n === 1 ? "tomorrow" : `${n}d`;
  /** One thing to do, on one line: date, verb, what, how soon, one button. In a card's own panel the card name is left out. */
  function row(a, today, where) {
    const c = a.card, n = a.day ? dayDiff(a.day, today) : null, id = c ? esc(c.id) : "", inP = where === "panel", nm = inP ? "" : cname(c || {});
    let line = "", bt = "", bar = "";
    if (a.t === "pay") { line = inP ? `Bill due <b>${fmt(a.day, today)}</b>` : nm; bt = `<button class="btn go" data-x="paid" data-id="${id}" data-due="${a.day}">Paid</button>`; }
    else if (a.t === "spend") {
      const st = a.st;
      line = `<b>${money(st.left, c.currency)} left</b>` + (inP ? (a.day ? ` by ${fmt(a.day, today)}` : "") : ` ${nm}`);
      bar = `<i class="x-bar" style="width:${st.pct}%"></i>`;
      bt = V.spend === c.id && V.spendIn === where ? `<input class="xamt" inputmode="decimal" placeholder="$" aria-label="Amount spent"><button class="btn go" data-x="addspend" data-id="${id}">Add</button>` : `<button class="btn" data-x="spend" data-id="${id}">+ Spend</button>`;
    } else if (a.t === "close" || a.t === "switch") {
      const fl = a.flow, nx = fl && fl.next;
      line = nm + `<span class="x-nx">${nx ? `${esc(nx.text)} · ${fl.done + 1}/${fl.total}` : a.fee ? `before the ${money(c.fee.amount, c.currency)} fee` : ""}</span>`;
      bt = nx ? `<button class="btn go" data-x="tdone" data-id="${esc(nx.id)}">Done</button>` : a.t === "close" ? `<button class="btn go" data-x="closed" data-id="${id}">Closed</button>` : `<button class="btn go" data-x="ps" data-id="${id}">Switched</button>`;
    } else {
      line = `<b>${esc(a.todo.text)}</b>` + (c && !inP ? `<span class="x-nx">${esc(c.name)} ${l4(c)}</span>` : "");
      bt = `<button class="btn go" data-x="tdone" data-id="${esc(a.todo.id)}">Done</button>`;
    }
    const who = !inP && V.own === "all" && c && c.owner === "Caney" ? `<span class="x-who" title="Caney's card">C</span>` : "";
    return `<div class="x-act t-${TYPE[a.t]} ${n != null && n <= 2 ? "u-now" : ""}">${inP || !a.day ? "" : `<span class="x-date">${fmt(a.day, today)}</span>`}<span class="x-vb">${VERB[a.t]}</span><span class="x-line">${line}${who}</span><span class="x-rel">${n == null ? "" : relS(n)}</span><span class="x-bt">${bt}</span>${bar}</div>`;
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
    const line = (c) => { const [t, h] = hint(c, acts, d, today); return `<button class="x-c t-${t} ${t !== "none" ? "has" : ""} ${V.sel === c.id ? "sel" : ""} ${isActive(c) ? "" : "closed"}" data-x="open" data-id="${esc(c.id)}"><i class="xdot"></i><span class="nm"><span class="xn">${esc(c.name)}</span>${c.last4 ? `<small>${l4(c)}</small>` : ""}</span><span class="hint">${esc(h)}</span></button>`; };
    let h = `<div class="x-lh"><span>All cards</span><button class="icon" data-x="list" title="Back">✕</button></div><label class="x-find"><span aria-hidden="true">🔍</span><input id="xq" placeholder="Find a card" value="${esc(V.q)}" aria-label="Find a card"></label>`;
    for (const o of ["Junyan", "Caney"]) {
      const list = all.filter((c) => c.owner === o && isActive(c)).sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
      if (list.length) h += `<div><div class="x-grp"><span>${o}</span><span>${list.length}</span></div>${list.map(line).join("")}</div>`;
    }
    const cl = all.filter((c) => !isActive(c)).sort((a, b) => a.name.localeCompare(b.name));
    if (cl.length) h += `<div><button class="x-more" data-x="showclosed">${V.closed || q ? "▾" : "▸"} Closed cards · ${cl.length}</button>${V.closed || q ? cl.map(line).join("") : ""}</div>`;
    if (!all.length) h += `<div class="x-ok">${q ? "No card matches that." : "No cards yet."}</div>`;
    $(ctx, "#xleft").innerHTML = h;
  }
  function drawMain(ctx, acts, today) {
    const d = M.data;
    $(ctx, "#xown").innerHTML = [["all", "Both"], ["Junyan", "Junyan"], ["Caney", "Caney"]].map(([k, n]) => `<button data-x="own" data-id="${k}" aria-pressed="${V.own === k}">${n}</button>`).join("");
    const first = acts[0], n0 = first && first.day ? dayDiff(first.day, today) : null;
    $(ctx, "#xstatus").textContent = !d.cards.length ? "" : acts.length ? `${acts.length} to do${n0 != null ? " · next " + rel(n0).toLowerCase() : ""}` : "all clear";
    const clash = V.conflict ? `<div class="x-box x-clash"><div><b>Your cards were changed on two devices.</b><div class="x-sub">Pick the copy to keep.</div></div><div class="x-bt"><button class="btn go" data-x="mine">Keep this device's</button><button class="btn" data-x="theirs">Use the other one</button></div></div>` : "";
    let h;
    if (!d.cards.length) h = `<div class="x-clear"><div class="big">No cards yet</div><div class="x-bt c"><button class="btn go" data-x="import">Import your card file</button><button class="btn" data-x="new">+ Add a card</button></div></div>`;
    else if (!acts.length) h = `<div class="x-clear"><div class="big">All clear ✓</div></div>`;
    else {
      const g = [["This week", []], ["Next 30 days", []], ["Later", []], ["Any time", []]];
      for (const a of acts) { const n = a.day ? dayDiff(a.day, today) : null; g[n == null ? 3 : n <= 7 ? 0 : n <= 30 ? 1 : 2][1].push(a); }
      h = g.filter((x) => x[1].length).map(([n, l]) => `<div class="x-h"><h2>${n}</h2><span>${l.length}</span></div><div class="x-box">${l.map((a) => row(a, today, "main")).join("")}</div>`).join("");
    }
    $(ctx, "#xmain").innerHTML = clash + h;
  }
  const fact = (label, val, wide) => val ? `<div${wide ? ' class="w"' : ""}><span>${label}</span><b>${val}</b></div>` : "";
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
      ${field("Closed on", "closed", c.closed, "date")}${field("Opened on", "opened", c.opened, "date")}
      <label class="cf full"><span>Notes</span><textarea name="notes" rows="4">${esc(c.notes)}</textarea></label>
      <div class="r full"><button type="button" class="btn del" data-x="del">Delete card</button><span class="spacer"></span><button type="button" class="btn" data-x="cancel">Cancel</button><button class="btn pri" type="submit">Save</button></div></form>`;
  }
  function settings(ctx) {
    const s = syncOf(ctx.store);
    const sync = M.syncErr ? `<b>Not on the server yet</b>: ${esc(M.syncErr)}. It will try again.` : s.dirty ? "Saving…" : s.rev ? `Saved${s.at ? " " + esc(new Date(s.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })) : ""}. Phone and computer match.` : "Not on the server yet.";
    return `<div class="ptabs"><span class="lbl">Settings</span><span class="spacer"></span><button class="icon" data-x="close" title="Close">✕</button></div><div class="pbody">
      <div><p class="lbl">This device</p><p class="x-p">Cards opens by itself here. No lock.</p></div>
      <div><p class="lbl">Saved copy</p><p class="x-p">${sync}</p><div class="r"><button class="btn" data-x="syncnow">Check now</button><button class="btn" data-x="backup">Download backup</button></div></div>
      <div><p class="lbl">New phone or computer</p><p class="x-p">It asks for your recovery code once.</p>
        ${V.code ? `<div class="x-code">${esc(V.code.slice(0, 14))}<br>${esc(V.code.slice(15))}</div><p class="x-p">Your new code. The old one no longer works. Save it in 1Password now: it is not shown again.</p><div class="r"><button class="btn" data-x="copycode">Copy code</button><button class="btn go" data-x="codeok">I saved it</button></div>`
          : `<div class="r"><button class="btn" data-x="newcode">New recovery code</button></div>`}</div>
      <div><p class="lbl">Card list</p><div class="r"><button class="btn" data-x="import">Import a card file</button><button class="btn" data-x="restore">Restore a backup</button></div></div>
    </div>`;
  }
  const TK = { pay: "pay", fee: "close", spend: "spend", do: "do", close: "close", switch: "close" };
  /** A timeline date: "Feb 2", with the year ('25) when it is not this year. */
  const tfmt = (d, today) => { const [y, m, dd] = d.split("-"); return `${MON[+m - 1]} ${+dd}${y !== today.slice(0, 4) ? " '" + y.slice(2) : ""}`; };
  function drawPanel(ctx, acts, today) {
    const el = $(ctx, "#xpanel"), d = M.data, c = V.sel && V.sel !== "@" ? d.cards.find((x) => x.id === V.sel) : null;
    const old = el.querySelector(".pbody"), top = old && V.lastSel === V.sel ? old.scrollTop : 0, anim = V.lastSel !== V.sel;
    V.lastSel = V.sel;
    if (V.sel === "@") el.innerHTML = settings(ctx);
    else if (!c) { el.innerHTML = ""; return; }
    else {
      const id = esc(c.id), mine = acts.filter((a) => a.card === c && !a.flow), st = msrState(c, d, today), fl = flowState(d, c), tl = timeline(d, c, today), on = isActive(c);
      const tone = st && !st.allMet ? "spend" : fl ? "close" : c.status === "Keeper" ? "do" : "none", fee = nextFee(c, today);
      const facts = fact("Due", c.dueDay ? ord(c.dueDay) + (c.autopay ? " · autopay" : "") : "") + fact("Statement", c.statementDay ? ord(c.statementDay) : "") +
        fact("Fee", c.fee && +c.fee.amount ? money(c.fee.amount, c.currency) + (fee ? " · " + fmt(fee, today) : "") : "") + fact("Limit", c.limit ? money(c.limit, c.currency) : "") +
        fact("Spend", st ? `${money(st.spent, c.currency)} of ${money(st.step.amount, c.currency)}${st.allMet ? " ✓" : ""}` : "", true) +
        fact("Bonus", c.bonus && (c.bonus.expected || c.bonus.received) ? `${esc(c.bonus.expected || "Bonus")}${c.bonus.received ? " ✓" : ""}` : "", true) +
        fact("Points", c.points && c.points.balance != null && c.points.balance !== "" ? `${Number(c.points.balance).toLocaleString("en-CA")} ${esc(c.points.program || "")}` : "", true);
      const flow = !fl ? "" : `<div class="x-flow t-close"><p class="lbl">${fl.kind === "close" ? "Closing" : "Switching"}${fl.total ? ` · ${fl.done}/${fl.total}` : ""}</p>
        ${fl.steps.map((t) => `<label class="x-li ${t.done ? "done" : ""}"><input type="checkbox" data-x="tcheck" data-id="${esc(t.id)}" ${t.done ? "checked" : ""}><span>${esc(t.text)}</span></label>`).join("")}
        <div class="r">${fl.kind === "close" ? `<button class="btn go" data-x="closed" data-id="${id}">Closed it</button><button class="btn" data-x="keep" data-id="${id}">Keep it</button>` : `<button class="btn go" data-x="ps" data-id="${id}">Switched it</button><button class="btn" data-x="flowstop">Cancel</button>`}${fl.total ? "" : `<button class="btn" data-x="flow" data-kind="${fl.kind}">Checklist</button>`}</div></div>`;
      const te = (x, up) => `<div class="x-te ${up ? "up " : ""}t-${TK[x.k] || "note"}"><i></i><time>${tfmt(x.d, today)}</time><span>${esc(x.t)}</span><em>${esc(x.x || "")}</em>${x.del ? `<button class="x" data-x="hdel" data-id="${esc(x.del)}" aria-label="Remove">×</button>` : ""}</div>`;
      const body = V.edit ? editForm(c) : `
       <div class="x-ph"><h2>${esc(c.name)}${c.last4 ? `<small>${l4(c)}</small>` : ""}</h2><span class="x-chip t-${tone}">${esc(c.status)}</span></div>
       ${mine.length ? `<div class="x-box">${mine.map((a) => row(a, today, "panel")).join("")}</div>` : ""}
       ${flow}
       ${V.ps ? `<form class="x-psf" id="psForm"><label class="cf"><span>New name</span><input name="name" value="${esc(c.name)}" required></label><label class="cf"><span>Switched on</span><input name="date" type="date" value="${today}" required></label><div class="r"><button type="button" class="btn" data-x="pscancel">Cancel</button><button class="btn pri" type="submit">Save switch</button></div></form>` : ""}
       ${facts ? `<div class="x-facts">${facts}</div>` : ""}
       <div><div class="x-th"><p class="lbl">Timeline</p><button class="x-tx" data-x="note">+ Note</button></div>
        ${V.note ? `<div class="x-add"><input id="xnote" placeholder="What happened" aria-label="Note for the timeline"><input id="xnoted" type="date" value="${today}" aria-label="Date"><button class="btn" data-x="noteadd">Add</button></div>` : ""}
        <div class="x-tl">${tl.next.slice().reverse().map((x) => te(x, true)).join("")}<div class="x-te now"><i></i><time>Today</time></div>${tl.past.map((x) => te(x)).join("")}</div></div>
       ${c.notes ? `<p class="x-notes">${esc(c.notes)}</p>` : ""}
       <div class="r">${on && !(fl && fl.kind === "close") ? `<button class="btn" data-x="flow" data-kind="close">Close card</button>` : ""}${on && !(fl && fl.kind === "switch") && !V.ps ? `<button class="btn" data-x="flow" data-kind="switch">Product switch</button>` : ""}<button class="btn" data-x="edit">Edit</button></div>`;
      el.innerHTML = `<div class="ptabs"><span class="lbl">${esc(c.issuer || "Card")} · ${esc(c.owner)}</span><span class="spacer"></span><button class="icon" data-x="close" title="Close">✕</button></div><div class="pbody">${body}</div>`;
    }
    const pb = el.querySelector(".pbody"); if (pb) { if (anim) pb.classList.add("in"); else pb.scrollTop = top; }
  }

  /* ---------- first set-up, and opening on a new device ---------- */
  function lockHTML(ctx, st) {
    const env = envOf(ctx.store), pk = VLT.canPasskey() && !!(env && (env.pk || []).length), v = st === "opening" ? "opening" : V.lv || (st === "none" ? "check" : "recover");
    const msg = V.msg ? `<p class="x-msg">${esc(V.msg)}</p>` : "", back = `<button class="txt x-back" data-page="cal">‹ Back to the calendar</button>`;
    const file = `<button class="txt" data-x="restore">Restore from a backup file</button>`;
    const box = (h) => `<div class="x-lock"><div class="x-lk">${h}${back}</div></div>`;
    if (v === "opening") return box(`<div class="ico">💳</div><h2>Cards</h2><p>Opening your cards…</p>`);
    if (v === "check") return box(`<div class="ico">💳</div><h2>Cards</h2><p>Checking for your cards…</p>`);
    if (v === "setup") return box(`<div class="ico">💳</div><h2>Set up Cards</h2><p>Cards opens by itself on this device. The copy saved on the Day Hub server is scrambled. Only last 4 digits are ever kept.</p>${msg}
      <button class="btn go" data-x="setup">Set up</button>${M.syncErr ? `<button class="btn" data-x="recheck">Check the server again</button>` : ""}${file}`);
    if (v === "code") return box(`<div class="ico">🗝️</div><h2>Save your recovery code</h2><p>A new phone or computer needs this code once to open your cards. It is shown once. Keep it in 1Password.</p>
      <div class="x-code">${esc(M.pending.code.slice(0, 14))}<br>${esc(M.pending.code.slice(15))}</div>${msg}
      <button class="btn" data-x="copycode">Copy code</button><button class="btn go" data-x="savedcode">I saved it</button>`);
    if (v === "reset") return box(`<div class="ico">🧹</div><h2>Start over?</h2><p>Without the recovery code nobody can open the saved cards, not even this app. Starting over clears them from this device and replaces the server copy. You then set up again and import your starting file (cards-seed.json on your Mac). Changes made since that file are lost.</p>
      <button class="btn del" data-x="reset">Yes, clear and start over</button><button class="txt" data-x="tolock">Back</button>`);
    return box(`<div class="ico">🗝️</div><h2>Open Cards on this device</h2><p>${pk ? "Use your passkey or your recovery code, once." : "Type your recovery code once."} After that, Cards opens by itself here.</p>${msg}
      ${pk ? `<button class="btn go" data-x="unlock">Use my passkey</button>` : ""}<input id="xrc" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Recovery code"><button class="btn ${pk ? "" : "go"}" data-x="usecode">Open with the code</button>
      ${file}<button class="txt" data-x="toreset">Lost the code? Start over</button>`);
  }
  const SHELL = `<aside class="x-left" id="xleft"></aside>
    <div class="x-main"><div class="bar"><button class="icon x-back" data-page="cal" title="Calendar">‹</button><button class="icon x-menu" data-x="list" title="All cards">☰</button><h1>Cards</h1><span class="status" id="xstatus"></span><span class="spacer"></span>
      <div class="seg" id="xown"></div><button class="icon" data-x="settings" title="Settings">⚙</button><button class="btn pri" data-x="new">+ Card</button></div>
      <div class="x-scroll"><div class="x-w" id="xmain"></div></div></div>
    <aside class="x-panel" id="xpanel"></aside><div id="xtoast"></div>`;

  /** Draws the whole page into ctx.page(). Not set up, or a device with no key yet: the set-up screen only. */
  function draw(ctx, passive) {
    const pg = ctx.page(), st = state(ctx.store);
    /* a passive redraw (the calendar's own ticks) never wipes something he is in the middle of typing */
    if (passive && pg.classList.contains("cards") && (st === "open") === !!pg.querySelector("#xmain")) {
      const f = root.document.activeElement;
      if (pg.querySelector("#cardForm,#psForm") || [...pg.querySelectorAll("#xrc,#xnote,.xamt")].some((i) => i.value) || (f && pg.contains(f) && /INPUT|TEXTAREA|SELECT/.test(f.tagName))) return;
    }
    if (!VLT || !root.crypto || !root.crypto.subtle) { pg.className = "page cards locked"; pg.innerHTML = `<div class="x-lock"><div class="x-lk"><h2>Cards</h2><p>This browser cannot open your cards (it needs a secure https page).</p></div></div>`; return; }
    if (st !== "open") {
      pg.className = "page cards locked";
      if (st === "locked" && !V.lv && ctx.store.get(K.key)) { pg.innerHTML = lockHTML(ctx, "opening"); wake(ctx); return; }
      pg.innerHTML = lockHTML(ctx, st);
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
    const amt = pg.querySelector(V.spendIn === "panel" ? "#xpanel .xamt" : "#xmain .xamt") || pg.querySelector("#xnote"); if (amt) amt.focus();
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
  const OPENED = "Open. Cards now opens by itself on this device.";

  /* the set-up screen's buttons */
  async function lockAct(ctx, act, b) {
    const store = ctx.store;
    if (act === "setup") { M.pending = await VLT.create({ since: ctx.today(), ...normalize(parse(store.get(K.old) || "null")) }); V.lv = "code"; V.msg = ""; }
    else if (act === "copycode") V.msg = await copy(M.pending.code);
    else if (act === "savedcode") {
      const p = M.pending; setEnv(store, p.env); store.set(K.old, null);
      opened(ctx, p.ses, await VLT.read(p.ses, p.env)); M.pending = null; markDirty(store); push(ctx);
    } else if (act === "unlock") {
      b.textContent = "Checking…";
      try { const pk = await VLT.askPasskey(M.env), o = await VLT.openWithPrf(M.env, pk.id, pk.out); opened(ctx, o.ses, o.data); refresh(ctx, true); toastLater(ctx, OPENED); }
      catch (e) { return fail(ctx, e.message === "no-prf" ? new Error("This device's passkey cannot open Cards. Use your recovery code.") : e); }
    } else if (act === "usecode") {
      const code = (ctx.page().querySelector("#xrc") || {}).value || "";
      if (!VLT.codeOk(code)) return fail(ctx, new Error("That does not look like a recovery code: it is 24 letters and numbers."));
      b.textContent = "Checking…";
      try { const o = await VLT.openWithCode(M.env, code); opened(ctx, o.ses, o.data); refresh(ctx, true); toastLater(ctx, OPENED); }
      catch (e) { return fail(ctx, new Error(e.message === "wrong code" ? "That code does not open these cards. Check it and try again." : e.message)); }
    } else if (act === "tolock") { V.lv = null; V.msg = ""; }
    else if (act === "toreset") { V.lv = "reset"; V.msg = ""; }
    else if (act === "reset") { setEnv(store, null); store.set(K.key, null); store.set(K.digest, null); setSync(store, { rev: 0, dirty: false, at: "", fresh: true }); M.pending = null; V.lv = "setup"; V.msg = "Cleared. Set up again, then import your card file."; }
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
          if (envOf(ctx.store) && !root.confirm("Replace the cards on this device with this backup file? If it was made with another set-up, it needs that set-up's recovery code.")) return;
          lock(null); setEnv(ctx.store, j); markDirty(ctx.store); V.msg = "Backup loaded.";
        } else {
          if (!M.data) throw new Error("that is not a backup file. Open your cards first to import a card list");
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
    if (!M.data) { lockAct(ctx, act, b).catch((err) => fail(ctx, err)); return true; }
    const d = M.data, card = (x) => d.cards.find((c) => c.id === x), sel = card(V.sel);
    if (act === "own") V.own = id;
    else if (act === "open") { V.sel = id; V.edit = false; V.ps = false; V.note = false; V.list = false; }
    else if (act === "close") { V.sel = null; V.edit = false; V.ps = false; V.note = false; V.code = ""; }
    else if (act === "settings") { V.sel = V.sel === "@" ? null : "@"; V.edit = false; V.list = false; }
    else if (act === "list") V.list = !V.list;
    else if (act === "showclosed") V.closed = !V.closed;
    else if (act === "spend") { V.spend = id; V.spendIn = b.closest("#xpanel") ? "panel" : "main"; }
    else if (act === "addspend") return addSpend(ctx, id, b.closest(".x-bt")), true;
    else if (act === "paid") return rowChange(ctx, b, (x) => x.payments.push({ id: uid("p"), cardId: id, date: today, amount: null, forDue: b.dataset.due }), `Paid: ${card(id).name}`), true;
    else if (act === "closed") return rowChange(ctx, b, (x) => { const c = x.cards.find((y) => y.id === id); c.status = "Closed"; c.closed = today; tidyFlow(x, c); }, `Closed: ${card(id).name}`), true;
    else if (act === "keep") return rowChange(ctx, b, (x) => { const c = x.cards.find((y) => y.id === id); c.status = "Keeper"; tidyFlow(x, c); x.history.push({ id: uid("h"), cardId: id, date: today, text: "Kept another year" }); }, `Keeping ${card(id).name}`), true;
    else if (act === "flow" && sel) return change(ctx, (x) => startFlow(x, sel.id, b.dataset.kind, today), b.dataset.kind === "close" ? "Closing checklist ready" : "Switch checklist ready"), true;
    else if (act === "flowstop" && sel) return change(ctx, (x) => { const c = x.cards.find((y) => y.id === sel.id); c.status = "Open"; tidyFlow(x, c); }, "Switch cancelled"), true;
    else if (act === "ps") { V.sel = id; V.ps = true; V.edit = false; V.list = false; }
    else if (act === "pscancel") V.ps = false;
    else if (act === "tdone") return rowChange(ctx, b, (x) => { const t = x.todos.find((y) => y.id === id); t.done = true; t.doneAt = today; }, "Done ✓"), true;
    else if (act === "tcheck") return change(ctx, (x) => { const t = x.todos.find((y) => y.id === id); t.done = !t.done; t.doneAt = t.done ? today : null; }), true;
    else if (act === "note") V.note = !V.note;
    else if (act === "noteadd" && sel) {
      const i = $(ctx, "#xnote"), text = i.value.trim(), date = $(ctx, "#xnoted").value || today; if (!text) return i.focus(), true;
      V.note = false; return change(ctx, (x) => x.history.push({ id: uid("h"), cardId: sel.id, date, text })), true;
    }
    else if (act === "hdel") { const [k, hid] = id.split(":"), list = { pay: "payments", tx: "transactions", hist: "history", todo: "todos" }[k]; return change(ctx, (x) => { x[list] = x[list].filter((y) => y.id !== hid); }, "Removed"), true; }
    else if (act === "undo") { if (V.undo) { M.data = normalize(JSON.parse(V.undo)); V.undo = null; persist(ctx); $(ctx, "#xtoast").innerHTML = ""; } }
    else if (act === "edit") { V.edit = true; V.ps = false; V.note = false; }
    else if (act === "cancel") { V.edit = false; if (sel && sel.name === "New card" && !sel.issuer && !sel.last4) return change(ctx, (x) => { x.cards = x.cards.filter((c) => c.id !== sel.id); V.sel = null; }), true; }
    else if (act === "new") { const n = blank(V.own === "Caney" ? "Caney" : "Junyan"); V.sel = n.id; V.edit = true; V.ps = false; V.list = false; return change(ctx, (x) => x.cards.push(n)), true; }
    else if (act === "del" && sel) { if (!root.confirm(`Delete ${sel.name}? Its to-dos, spend and payments go too.`)) return true; V.edit = false; V.sel = null; return change(ctx, (x) => { for (const k of LISTS) x[k] = x[k].filter((y) => k === "cards" ? y.id !== sel.id : y.cardId !== sel.id); }, `Deleted ${sel.name}`), true; }
    else if (act === "import" || act === "restore") return pickFile(ctx), true;
    else if (act === "backup") { const u = URL.createObjectURL(new Blob([JSON.stringify(M.env)], { type: "application/json" })), l = root.document.createElement("a"); l.href = u; l.download = `cards-backup-${today}.json`; l.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); toast(ctx, "Backup downloaded"); return true; }
    else if (act === "syncnow") { b.textContent = "Checking…"; refresh(ctx, true).then(() => { if (!V.conflict && !M.syncErr && syncOf(ctx.store).dirty) return push(ctx); }).then(() => ctx.redraw()); return true; }
    else if (act === "newcode") {
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
      change(ctx, (d) => { c.productSwitches = [...(c.productSwitches || []), fd.date].sort(); if (name !== c.name) { d.history.push({ id: uid("h"), cardId: c.id, date: fd.date, text: `Was ${c.name}` }); c.name = name; } if (c.status === "Need to PS") c.status = "Open"; tidyFlow(d, c); }, `Switched: ${name}`);
      return true;
    }
    V.edit = false;
    change(ctx, (d) => {
      Object.assign(c, { name: fd.name.trim() || "Card", last4: fd.last4.replace(/\D/g, "").slice(-4), issuer: fd.issuer.trim(), owner: fd.owner, status: fd.status, currency: fd.currency,
        limit: num(fd.limit), statementDay: num(fd.statementDay), dueDay: num(fd.dueDay), autopay: !!fd.autopay, closed: fd.closed || (fd.status === "Closed" && !c.closed ? today : null), opened: fd.opened || null, notes: fd.notes,
        fee: num(fd.feeAmount) ? { amount: num(fd.feeAmount), date: fd.feeDate || null } : null,
        bonus: { ...(c.bonus || {}), expected: fd.bonusExpected, received: !!fd.bonusReceived },
        points: { program: fd.pointsProgram, balance: num(fd.pointsBalance), asOf: num(fd.pointsBalance) != null ? today : null } });
      const steps = [[fd.s0a, fd.s0d], [fd.s1a, fd.s1d]].filter(([a]) => num(a)).map(([a, dl]) => ({ amount: num(a), deadline: dl || null }));
      if (steps.length) {
        const base = num(fd.msrBase) || 0, old = c.msr && msrState(c, d, today);
        /* a hand-typed "spend so far" restarts the count from now; left alone, the spend added since still counts */
        c.msr = old && Math.abs(old.spent - base) < 0.005 ? { ...c.msr, steps } : { steps, base, baseDate: today, baseAt: Date.now() };
      } else c.msr = null;
      tidyFlow(d, c);
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
    if (e.key === "Enter" && (t.id === "xnote" || t.id === "xnoted")) { ctx.page().querySelector('[data-x="noteadd"]').click(); return true; }
    if (e.key === "Escape") { if (V.spend) V.spend = null; else if (V.note) V.note = false; else if (V.edit || V.ps) { V.edit = false; V.ps = false; } else if (V.list) V.list = false; else if (V.sel) V.sel = null; else return false; if (t.blur) t.blur(); ctx.redraw(); return true; }
    return false;
  }

  root.Cards = { STATUSES, FLOWS, normalize, msrState, events, actions, flowState, startFlow, tidyFlow, timeline, digest, digestEvents, dueNow, nextFee, isActive, hasAny, calEvents, draw, onClick, onSubmit, onInput, onKey, refresh, wake,
    isOpen: () => !!M.data, view: V, select: (id) => { if (M.data && id) { V.sel = id; V.edit = false; V.ps = false; V.note = false; } } };
})(typeof window !== "undefined" ? window : globalThis);
