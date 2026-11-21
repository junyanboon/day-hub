/* Cards (2026-11-20): Junyan's and Caney's credit cards inside the calendar.
   One saved object, localStorage "money-v1", kept apart from the calendar cache so a later money page (the YNAB
   replacement) can share it. Records are separate lists that point at a card by cardId:
     cards         one per card (owner, issuer, last 4, status, limit, statement and due day, fee, spend target, bonus,
                   points, product switch dates, notes)
     todos         {id, cardId, text, done, due}
     transactions  {id, cardId, date, amount, payee, msr}   spend; counts toward the target when msr is not false
     payments      {id, cardId, date, amount, forDue}       a bill paid; marks that month's due date paid
   The repo is public, so no card data lives here: the seed is a private JSON file he imports once (Import button).
   Rules are plain functions (Cards.events, Cards.msrState) so still/test/cards.test.mjs can check them in node. */
(function (root) {
  "use strict";
  const KEY = "money-v1";
  const STATUSES = ["Applied", "Card in Mail", "MSR", "Open", "Keeper", "No Fee", "Need to PS", "Product Switch", "Need to Close", "Pending Close", "Closed", "Rejected"];
  const DONE = new Set(["Closed", "Rejected"]);
  const empty = () => ({ v: 1, cards: [], todos: [], transactions: [], payments: [] });
  const pad = (n) => String(n).padStart(2, "0");
  const addDays = (d, n) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const monthLen = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();   // m is 1..12
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const isActive = (c) => !DONE.has(c.status);
  const short = (c) => (c.last4 ? c.last4 + " " : "") + c.name;
  const money = (n, cur) => n == null || n === "" ? "" : (cur === "USD" ? "US$" : "$") + Number(n).toLocaleString("en-CA", { maximumFractionDigits: 0 });

  function normalize(d) {
    const x = { ...empty(), ...(d && typeof d === "object" ? d : {}) };
    for (const k of ["cards", "todos", "transactions", "payments"]) if (!Array.isArray(x[k])) x[k] = [];
    return x;
  }
  function load(store) { try { return normalize(JSON.parse(store.get(KEY) || "null")); } catch (e) { return empty(); } }
  function save(store, d) { store.set(KEY, JSON.stringify(d)); }

  /** Spend target: base (spend typed in by hand, at baseAt) plus every counted transaction added after it. The current step is the
      first one not yet reached; deadlines are inclusive. */
  function msrState(card, data, today) {
    const m = card.msr; if (!m || !(m.steps || []).length) return null;
    const extra = (data.transactions || []).filter((t) => t.cardId === card.id && t.msr !== false && (!m.baseAt || (t.at || 0) > m.baseAt)).reduce((s, t) => s + (+t.amount || 0), 0);
    const spent = Math.round(((+m.base || 0) + extra) * 100) / 100;
    const steps = m.steps.filter((s) => s.amount);
    const step = steps.find((s) => spent < s.amount) || steps[steps.length - 1];
    const met = spent >= step.amount;
    const daysLeft = step.deadline && today ? Math.round((Date.parse(step.deadline) - Date.parse(today)) / 86400000) : null;
    return { spent, step, steps, met, allMet: steps.every((s) => spent >= s.amount), left: Math.max(0, step.amount - spent), pct: Math.min(100, Math.round(spent / step.amount * 100)), daysLeft, late: !met && daysLeft != null && daysLeft < 0 };
  }

  /** Calendar events between two days (inclusive): bill due dates, annual fees, spend deadlines and dated to-dos, for
      cards that are not closed. Each is an all-day event on the pseudo calendar "cards". */
  function events(data, from, to, today) {
    const out = [], ev = (card, day, type, title, extra) => out.push({ id: `${type}:${card ? card.id : "x"}:${day}${extra ? ":" + extra : ""}`, calId: "cards", title, allDay: true, start: day, end: addDays(day, 1), kind: "other", cardId: card && card.id, cardEvent: type });
    const fy = +from.slice(0, 4), ty = +to.slice(0, 4);
    for (const c of data.cards) {
      if (!isActive(c)) continue;
      const who = c.owner === "Caney" ? " (C)" : "";
      if (c.dueDay) {
        let y = fy, m = +from.slice(5, 7);
        while (`${y}-${pad(m)}` <= to.slice(0, 7)) {
          const day = `${y}-${pad(m)}-${pad(Math.min(c.dueDay, monthLen(y, m)))}`;
          if (day >= from && day <= to) {
            const paid = data.payments.some((p) => p.cardId === c.id && p.forDue === day);
            ev(c, day, "due", `${paid ? "✓ Paid" : "💳 Pay"} ${short(c)}${who}`);
          }
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
      out.push({ id: `todo:${t.id}`, calId: "cards", title: `☐ ${c ? (c.last4 || c.name) + ": " : ""}${t.text}`, allDay: true, start: t.due, end: addDays(t.due, 1), kind: "other", cardId: t.cardId, cardEvent: "todo" });
    }
    return out;
  }

  /* ---------- the page ---------- */
  const V = { who: "all", show: "active", sel: null, edit: false };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDay = (d) => { if (!d) return ""; const [y, m, dd] = d.split("-"); return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m - 1]} ${+dd}${y !== String(new Date().getFullYear()) ? ", " + y : ""}`; };
  const statusCls = (s) => "st-" + s.toLowerCase().replace(/[^a-z]+/g, "-");

  function bar(st) {
    return `<div class="cbar ${st.met ? "met" : st.late ? "late" : st.daysLeft != null && st.daysLeft < 21 ? "soon" : ""}"><i style="width:${st.pct}%"></i></div>`;
  }
  function msrLine(st, cur) {
    if (!st) return "";
    const when = st.step.deadline ? (st.met ? "" : st.daysLeft < 0 ? ` · ${-st.daysLeft} days late` : ` · ${st.daysLeft} days left (${fmtDay(st.step.deadline)})`) : " · deadline not set";
    return `<div class="cmsr">${bar(st)}<small>${money(st.spent, cur)} of ${money(st.step.amount, cur)}${st.met ? " · met ✓" : ` · ${money(st.left, cur)} to go`}${when}</small></div>`;
  }
  function tile(c, data, today) {
    const st = msrState(c, data, today), open = data.todos.filter((t) => t.cardId === c.id && !t.done).length;
    return `<button class="ctile ${V.sel === c.id ? "on" : ""} ${c.owner === "Caney" ? "own-c" : "own-j"}" data-card="${esc(c.id)}">
      <div class="ctop"><b>${esc(c.name)}</b><span class="cst ${statusCls(c.status)}">${esc(c.status)}</span></div>
      <small>${esc(c.owner)}${c.last4 ? " · ••" + esc(c.last4) : ""}${c.dueDay ? " · due " + c.dueDay + "th" : ""}${c.fee && +c.fee.amount ? " · fee " + money(c.fee.amount, c.currency) : ""}${open ? ` · ${open} to-do` : ""}</small>
      ${st && !st.allMet ? msrLine(st, c.currency) : ""}</button>`;
  }
  function upcoming(data, today) {
    const evs = events(data, today, addDays(today, 30), today).filter((e) => e.cardEvent !== "due" || !e.title.startsWith("✓")).sort((a, b) => a.start.localeCompare(b.start));
    return evs.map((e) => `<button class="crow" data-card="${esc(e.cardId)}"><small>${fmtDay(e.start)}</small><span>${esc(e.title)}</span></button>`).join("") || '<span class="meta">Nothing in the next 30 days.</span>';
  }
  function field(label, name, val, type = "text", extra = "") {
    return `<label class="cf"><span>${label}</span><input name="${name}" type="${type}" value="${esc(val ?? "")}" ${extra}></label>`;
  }
  function detail(c, data, today) {
    const st = msrState(c, data, today), todos = data.todos.filter((t) => t.cardId === c.id);
    const tx = data.transactions.filter((t) => t.cardId === c.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    const pays = data.payments.filter((p) => p.cardId === c.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
    const nextDue = c.dueDay ? events(data, today, addDays(today, 40), today).find((e) => e.cardId === c.id && e.cardEvent === "due") : null;
    const m = c.msr || { steps: [] };
    const form = V.edit ? `<form class="cform" id="cardForm">
      ${field("Card name", "name", c.name)}${field("Last 4", "last4", c.last4, "text", 'maxlength="5" inputmode="numeric"')}
      ${field("Issuer", "issuer", c.issuer)}
      <label class="cf"><span>Owner</span><select name="owner">${["Junyan", "Caney"].map((o) => `<option ${o === c.owner ? "selected" : ""}>${o}</option>`).join("")}</select></label>
      <label class="cf"><span>Status</span><select name="status">${STATUSES.map((s) => `<option ${s === c.status ? "selected" : ""}>${s}</option>`).join("")}</select></label>
      <label class="cf"><span>Currency</span><select name="currency">${["CAD", "USD"].map((o) => `<option ${o === c.currency ? "selected" : ""}>${o}</option>`).join("")}</select></label>
      ${field("Credit limit", "limit", c.limit, "number")}${field("Statement day", "statementDay", c.statementDay, "number", 'min="1" max="31"')}${field("Due day", "dueDay", c.dueDay, "number", 'min="1" max="31"')}
      ${field("Annual fee", "feeAmount", c.fee && c.fee.amount, "number")}${field("Fee date (MM-DD)", "feeDate", c.fee && c.fee.date, "text", 'placeholder="11-12" pattern="\\d\\d-\\d\\d"')}
      ${field("Spend so far", "msrBase", m.base, "number", 'step="0.01"')}
      ${field("Target 1", "s0a", m.steps[0] && m.steps[0].amount, "number")}${field("by", "s0d", m.steps[0] && m.steps[0].deadline, "date")}
      ${field("Target 2", "s1a", m.steps[1] && m.steps[1].amount, "number")}${field("by", "s1d", m.steps[1] && m.steps[1].deadline, "date")}
      ${field("Welcome bonus", "bonusExpected", c.bonus && c.bonus.expected, "text", 'placeholder="e.g. 20,000 Avion"')}
      <label class="cf ck"><input type="checkbox" name="bonusReceived" ${c.bonus && c.bonus.received ? "checked" : ""}><span>Bonus received</span></label>
      ${field("Points program", "pointsProgram", c.points && c.points.program)}${field("Points balance", "pointsBalance", c.points && c.points.balance, "number")}
      ${field("Product switch dates (comma)", "productSwitches", (c.productSwitches || []).join(", "))}${field("Closed on", "closed", c.closed, "date")}
      <label class="cf wide"><span>Notes</span><textarea name="notes" rows="4">${esc(c.notes)}</textarea></label>
      <div class="r wide"><button type="button" class="btn" data-cact="del">Delete card</button><span class="spacer"></span><button type="button" class="btn" data-cact="cancel">Cancel</button><button class="btn pri" type="submit">Save</button></div></form>` : "";
    const facts = [["Owner", c.owner], ["Issuer", c.issuer], ["Limit", money(c.limit, c.currency)], ["Statement", c.statementDay ? "day " + c.statementDay : ""], ["Due", c.dueDay ? "day " + c.dueDay : ""],
      ["Annual fee", c.fee && +c.fee.amount ? `${money(c.fee.amount, c.currency)}${c.fee.date ? " · " + fmtDay("2000-" + c.fee.date).replace(", 2000", "") : ""}` : "none"],
      ["Bonus", c.bonus ? `${esc(c.bonus.expected || "")}${c.bonus.received ? " received ✓" : c.msr ? " not yet" : ""}` : ""],
      ["Points", c.points && c.points.balance != null && c.points.balance !== "" ? `${Number(c.points.balance).toLocaleString()} ${esc(c.points.program || "")}` : ""],
      ["Switched", (c.productSwitches || []).map(fmtDay).join(", ")], ["Closed", fmtDay(c.closed)]].filter((f) => f[1]);
    return `<div class="card cdet"><div class="ctop"><h3>${esc(c.name)}${c.last4 ? ` <span class="meta">••${esc(c.last4)}</span>` : ""}</h3><span class="cst ${statusCls(c.status)}">${esc(c.status)}</span></div>
      ${V.edit ? form : `<dl class="cfacts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
      ${st ? `<p class="lbl">Spend target${st.steps.length > 1 ? ` (step ${st.steps.indexOf(st.step) + 1} of ${st.steps.length})` : ""}</p>${msrLine(st, c.currency)}` : ""}
      ${c.notes ? `<p class="cnotes">${esc(c.notes)}</p>` : ""}
      <div class="r"><button class="btn" data-cact="edit">Edit</button>${nextDue ? `<button class="btn" data-cact="paid" data-due="${nextDue.start}">${nextDue.title.startsWith("✓") ? "Paid ✓ " : "Mark paid "}${fmtDay(nextDue.start)}</button>` : ""}</div>`}
      <p class="lbl">To-do</p><div class="ctodos">${todos.map((t) => `<label class="ctodo ${t.done ? "done" : ""}"><input type="checkbox" data-todo="${esc(t.id)}" ${t.done ? "checked" : ""}><span>${esc(t.text)}</span>${t.due ? `<small>${fmtDay(t.due)}</small>` : ""}<button class="x" data-todel="${esc(t.id)}" aria-label="Remove">×</button></label>`).join("") || '<span class="meta">Nothing to do.</span>'}</div>
      <form class="cadd" id="todoForm"><input name="text" placeholder="Add a to-do, e.g. book companion pass" required><input name="due" type="date" title="Due date (shows on the calendar)"><button class="btn">Add</button></form>
      ${c.msr ? `<p class="lbl">Add spend</p><form class="cadd" id="spendForm"><input name="amount" type="number" step="0.01" placeholder="Amount" required><input name="payee" placeholder="What (e.g. Chexy rent)"><input name="date" type="date" value="${today}"><button class="btn">Add</button></form>
      ${tx.length ? `<div class="ctx">${tx.map((t) => `<div><small>${fmtDay(t.date)}</small><span>${esc(t.payee || "Spend")}</span><b>${money(t.amount, c.currency)}</b><button class="x" data-txdel="${esc(t.id)}" aria-label="Remove">×</button></div>`).join("")}</div>` : ""}` : ""}
      ${pays.length ? `<p class="lbl">Payments</p><div class="ctx">${pays.map((p) => `<div><small>${fmtDay(p.date)}</small><span>for ${fmtDay(p.forDue)}</span><b>${p.amount ? money(p.amount, c.currency) : ""}</b><button class="x" data-paydel="${esc(p.id)}" aria-label="Remove">×</button></div>`).join("")}</div>` : ""}
    </div>`;
  }
  function page(data, today) {
    const list = data.cards.filter((c) => (V.who === "all" || c.owner === V.who) && (V.show === "all" || (V.show === "active" ? isActive(c) : !isActive(c))));
    const order = (c) => { const st = msrState(c, data, today); return st && !st.allMet ? 0 : STATUSES.indexOf(c.status) + 1; };
    list.sort((a, b) => order(a) - order(b) || a.owner.localeCompare(b.owner) || a.name.localeCompare(b.name));
    const msrs = data.cards.filter((c) => isActive(c) && (V.who === "all" || c.owner === V.who)).map((c) => [c, msrState(c, data, today)]).filter(([, s]) => s && !s.allMet)
      .sort((a, b) => (a[1].step.deadline || "9").localeCompare(b[1].step.deadline || "9"));
    const todos = data.todos.filter((t) => !t.done && data.cards.some((c) => c.id === t.cardId && (V.who === "all" || c.owner === V.who)));
    const sel = data.cards.find((c) => c.id === V.sel);
    const seg = (name, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button data-cf="${name}" data-v="${v}" aria-pressed="${V[name] === v}">${l}</button>`).join("")}</div>`;
    if (!data.cards.length) return `<div class="phead"><button class="btn" data-page="cal">&#8249; Calendar</button><span class="pi">💳</span><h2>Cards</h2></div>
      <div class="card" style="max-width:520px"><p>No cards here yet. They live in this browser only (the app's code is public, so card details are never in it).</p>
      <p>Import your private card file once (cards-seed.json in your personal folder), or add a card by hand.</p>
      <div class="r"><button class="btn pri" data-cact="import">Import file</button><button class="btn" data-cact="new">+ Add card</button></div></div>`;
    return `<div class="phead"><button class="btn" data-page="cal">&#8249; Calendar</button><span class="pi">💳</span><div style="min-width:0"><h2>Cards</h2><div class="meta">${data.cards.filter(isActive).length} open · saved in this browser</div></div><span class="spacer"></span>
      ${seg("who", [["all", "Both"], ["Junyan", "Junyan"], ["Caney", "Caney"]])}${seg("show", [["active", "Open"], ["closed", "Closed"], ["all", "All"]])}
      <button class="btn" data-cact="new">+ Card</button><button class="btn" data-cact="export" title="Download a backup">Backup</button><button class="btn" data-cact="import">Import</button></div>
      <div class="cgrid">
        <div class="ccol">
          <div class="card"><p class="lbl">Spend targets</p>${msrs.map(([c, s]) => `<button class="cmrow" data-card="${esc(c.id)}"><div class="ctop"><b>${esc(short(c))}</b><small>${esc(c.owner)}</small></div>${msrLine(s, c.currency)}</button>`).join("") || '<span class="meta">No open spend targets.</span>'}</div>
          <div class="card"><p class="lbl">Next 30 days</p>${upcoming(data, today)}</div>
          <div class="card"><p class="lbl">All to-dos</p>${todos.map((t) => { const c = data.cards.find((x) => x.id === t.cardId); return `<button class="crow" data-card="${esc(t.cardId)}"><small>${esc(c.last4 || c.name.slice(0, 6))}</small><span>${esc(t.text)}${t.due ? ` · ${fmtDay(t.due)}` : ""}</span></button>`; }).join("") || '<span class="meta">Nothing to do.</span>'}</div>
        </div>
        <div class="ccol wide">${sel ? detail(sel, data, today) : ""}<div class="ctiles">${list.map((c) => tile(c, data, today)).join("") || '<span class="meta">No cards here.</span>'}</div></div>
      </div>`;
  }

  /** Wires the page's clicks and forms. ctx: {store, today(), redraw(), toast(msg, opts)} */
  function onClick(e, ctx) {
    const d = load(ctx.store), t = e.target, today = ctx.today();
    const f = t.closest("[data-cf]"); if (f) { V[f.dataset.cf] = f.dataset.v; ctx.redraw(); return true; }
    const card = t.closest("[data-card]"); if (card) { V.sel = V.sel === card.dataset.card && card.classList.contains("ctile") ? null : card.dataset.card; V.edit = false; ctx.redraw(); const p = document.querySelector(".cdet"); if (p && V.sel) p.scrollIntoView({ block: "nearest", behavior: "smooth" }); return true; }
    const td = t.closest("[data-todo]"); if (td) { const x = d.todos.find((y) => y.id === td.dataset.todo); if (x) { x.done = td.checked; save(ctx.store, d); ctx.redraw(); } return true; }
    for (const [attr, list] of [["todel", "todos"], ["txdel", "transactions"], ["paydel", "payments"]]) {
      const b = t.closest(`[data-${attr}]`); if (b) { e.preventDefault(); d[list] = d[list].filter((y) => y.id !== b.dataset[attr]); save(ctx.store, d); ctx.redraw(); return true; }
    }
    const a = t.closest("[data-cact]"); if (!a) return false;
    const c = d.cards.find((x) => x.id === V.sel), act = a.dataset.cact;
    if (act === "edit") V.edit = true;
    else if (act === "cancel") V.edit = false;
    else if (act === "new") { const n = { id: uid("c"), owner: V.who === "Caney" ? "Caney" : "Junyan", issuer: "", name: "New card", last4: "", status: "Applied", currency: "CAD", limit: null, statementDay: null, dueDay: null, fee: null, msr: null, bonus: { expected: "", received: false }, points: { program: "", balance: null, asOf: null }, productSwitches: [], closed: null, notes: "" }; d.cards.push(n); save(ctx.store, d); V.sel = n.id; V.edit = true; V.show = "active"; }
    else if (act === "del" && c) { if (!confirm(`Delete ${c.name}? Its to-dos, spend and payments go too.`)) return true; for (const k of ["todos", "transactions", "payments"]) d[k] = d[k].filter((y) => y.cardId !== c.id); d.cards = d.cards.filter((y) => y !== c); save(ctx.store, d); V.sel = null; V.edit = false; }
    else if (act === "paid" && c) { const due = a.dataset.due, had = d.payments.find((p) => p.cardId === c.id && p.forDue === due); if (had) d.payments = d.payments.filter((p) => p !== had); else d.payments.push({ id: uid("p"), cardId: c.id, date: today, amount: null, forDue: due }); save(ctx.store, d); ctx.toast(had ? "Payment removed" : "Marked paid"); }
    else if (act === "export") { const blob = new Blob([JSON.stringify(d, null, 1)], { type: "application/json" }); const u = URL.createObjectURL(blob), l = document.createElement("a"); l.href = u; l.download = `cards-backup-${today}.json`; l.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); return true; }
    else if (act === "import") { importFile(ctx); return true; }
    ctx.redraw(); return true;
  }
  function importFile(ctx) {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json,.json";
    inp.onchange = async () => {
      try {
        const n = normalize(JSON.parse(await inp.files[0].text()));
        if (!n.cards.length) throw new Error("no cards in that file");
        const have = load(ctx.store);
        if (have.cards.length && !confirm(`Replace the ${have.cards.length} cards saved here with the ${n.cards.length} in this file?`)) return;
        save(ctx.store, n); V.sel = null; ctx.toast(`Imported ${n.cards.length} cards`); ctx.redraw();
      } catch (err) { ctx.toast("Import failed: " + err.message, { bad: true }); }
    };
    inp.click();
  }
  function onSubmit(e, ctx) {
    const form = e.target; if (!["cardForm", "todoForm", "spendForm"].includes(form.id)) return false;
    e.preventDefault();
    const d = load(ctx.store), c = d.cards.find((x) => x.id === V.sel); if (!c) return true;
    const fd = Object.fromEntries(new FormData(form)), num = (v) => (v === "" || v == null ? null : +v);
    if (form.id === "todoForm") d.todos.push({ id: uid("t"), cardId: c.id, text: fd.text.trim(), done: false, due: fd.due || null });
    else if (form.id === "spendForm") d.transactions.push({ id: uid("x"), cardId: c.id, date: fd.date || ctx.today(), amount: +fd.amount, payee: fd.payee.trim(), msr: true, at: Date.now() });
    else {
      Object.assign(c, { name: fd.name.trim() || "Card", last4: fd.last4.trim(), issuer: fd.issuer.trim(), owner: fd.owner, status: fd.status, currency: fd.currency,
        limit: num(fd.limit), statementDay: num(fd.statementDay), dueDay: num(fd.dueDay), closed: fd.closed || null, notes: fd.notes,
        fee: num(fd.feeAmount) ? { amount: num(fd.feeAmount), date: fd.feeDate || null } : null,
        bonus: { ...(c.bonus || {}), expected: fd.bonusExpected, received: !!fd.bonusReceived },
        points: { program: fd.pointsProgram, balance: num(fd.pointsBalance), asOf: num(fd.pointsBalance) != null ? ctx.today() : null },
        productSwitches: fd.productSwitches.split(/[,\s]+/).filter((x) => /^\d{4}-\d\d-\d\d$/.test(x)) });
      const steps = [[fd.s0a, fd.s0d], [fd.s1a, fd.s1d]].filter(([a]) => num(a)).map(([a, dl]) => ({ amount: num(a), deadline: dl || null }));
      if (steps.length) {
        const base = num(fd.msrBase) || 0, old = c.msr && msrState(c, d, ctx.today());
        /* a hand-typed "spend so far" restarts the count from today; untouched, it keeps the added spend */
        c.msr = old && Math.abs(old.spent - base) < 0.005 ? { ...c.msr, steps } : { steps, base, baseDate: ctx.today(), baseAt: Date.now() };
      } else c.msr = null;
      V.edit = false;
    }
    save(ctx.store, d); ctx.redraw(); return true;
  }

  root.Cards = { KEY, STATUSES, load, save, normalize, msrState, events, isActive, page, onClick, onSubmit, view: V, select: (id) => { V.sel = id; V.edit = false; } };
})(typeof window !== "undefined" ? window : globalThis);
