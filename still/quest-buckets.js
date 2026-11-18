/* Day Quest task buckets (Junyan, 2026-10-30, d1 to d5, d10 layout v6: "I need to see it as part of my week planner
   that pops up every day on my Day Quest"). Work tasks collect in repeating buckets (Supply run, Money and bills, ...);
   still-api keeps the list (GET/POST /quest/buckets, pull-then-write by rev) and one repeating Joint Plans event
   per bucket. This file draws and wires three things, used by the morning planner's "Your week" step and by a
   bucket's block on the day:
     week    a Mon to Sun strip, each day's buckets with how many tasks wait in each; today's open to their tasks.
     list    one bucket's open tasks, each with "Did it" (Waiting for proof, never Done: only proof closes it)
             and "Not this time" (stays for the next one).
     editor  rename, move (day, start, length, weekly or first-of-month), add, remove. Saved with the rev it was
             read at; another device's newer save comes back and is shown, never overwritten.
     approve  (Junyan, 2026-10-30: "I don't want the bucket blocks on my calendar yet. I want it to show on the
             planner in Day Quest for me to approve.") A bucket not yet approved is a proposal: dashed in the week,
             with Approve (POST /quest/buckets/approve: its series goes on Joint Plans), Change (the editor) and
             Not now (hidden from the proposals until tomorrow, on this device). Tasks collect in it either way.
   api: { get(path), post(path, body) } -> JSON (throws Error with .status). redraw(): draw the host again. */
(function (root) {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
  const SHORT = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" };
  const JS_DAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const S = { notNow: {}, rev: 0, buckets: [], tasks: [], today: "", loaded: false, loading: null, err: "", open: null, edit: null, msg: "", busy: "" };

  const addDays = (ymd, n) => new Date(Date.parse(ymd + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  const dowOf = (ymd) => JS_DAY[new Date(ymd + "T12:00:00Z").getUTCDay()];
  function fallsOn(b, ymd) { return dowOf(ymd) === b.day && (b.cycle !== "monthly" || +ymd.slice(8, 10) <= 7); }
  /** Monday to Sunday of the week holding ymd. */
  function weekOf(ymd) { const back = (DAYS.indexOf(dowOf(ymd)) + 7) % 7; const mon = addDays(ymd, -back); return DAYS.map((_, i) => addDays(mon, i)); }
  const titleOf = (b) => `${b.emoji ? b.emoji + " " : ""}${b.name}`;
  const fold = (s) => String(s || "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLowerCase();
  /** The bucket a calendar block stands for ("🛒 Supply run" -> Supply run), or null. */
  // only the series' own title ("🛒 Supply run"): a plain "Admin" block he made is not a bucket
  function matchTitle(t, buckets = S.buckets) { const f = fold(t), raw = String(t || "").trim();
    return buckets.find((b) => fold(b.name) === f && (!b.emoji || raw.startsWith(b.emoji))) || null; }
  const tasksOf = (b, tasks = S.tasks) => tasks.filter((t) => t.bucket === b.name);
  const waitingOf = (b, tasks = S.tasks) => tasksOf(b, tasks).filter((t) => !/^waiting/i.test(t.status));
  function clock(hm) { const [h, m] = hm.split(":").map(Number); return `${(h + 11) % 12 + 1}${m ? ":" + String(m).padStart(2, "0") : ""} ${h < 12 ? "AM" : "PM"}`; }

  async function load(api, force) {
    if (S.loading) return S.loading;
    if (S.loaded && !force) return;
    S.loading = api.get("/quest/buckets").then((d) => {
      S.rev = d.rev; S.buckets = d.buckets || []; S.tasks = d.tasks || []; S.today = d.today || ""; S.loaded = true;
      S.notNow = notNowLoad();
      S.err = d.taskError ? "The tasks did not load: " + d.taskError : "";
    }).catch((e) => { S.err = "The buckets did not load: " + (e.message || e); }).finally(() => { S.loading = null; });
    return S.loading;
  }

  /* ---------- one bucket's tasks ---------- */
  function listHTML(b) {
    const ts = tasksOf(b);
    if (!ts.length) return `<p class="bk-none">Nothing waiting in ${esc(b.name)}.</p>`;
    return `<div class="bk-tasks">${ts.map((t) => {
      const waiting = /^waiting/i.test(t.status);
      return `<div class="bk-t${waiting ? " wait" : ""}"><b>${esc(t.task)}</b>
        ${t.notes ? `<small>${esc(t.notes.split("\n").filter((l) => l.trim().startsWith("- ")).slice(0, 6).map((l) => l.trim().slice(2).replace(/\s*\(Deck Action \w+\)$/, "")).join(" · ") || "")}</small>` : ""}
        ${waiting ? `<small class="bk-w">Did it. Waiting for proof.</small>`
          : `<span class="bk-btns"><button data-bk-did="${esc(t.id)}">Did it</button><button data-bk-skip="${esc(t.id)}">Not this time</button></span>`}</div>`;
    }).join("")}</div>`;
  }

  /* ---------- proposals ---------- */
  const NN_KEY = "quest-bk-notnow";
  function notNowLoad() { try { return JSON.parse(root.localStorage && root.localStorage.getItem(NN_KEY) || "{}") || {}; } catch { return {}; } }
  function notNowSave() { try { root.localStorage && root.localStorage.setItem(NN_KEY, JSON.stringify(S.notNow)); } catch {} }
  const proposalsOf = (today, buckets = S.buckets) => buckets.filter((b) => !b.approved && S.notNow[b.id] !== today);
  function proposalsHTML(today) {
    const ps = proposalsOf(today);
    if (!ps.length) return "";
    return `<div class="bk-props"><div class="bk-oh">Waiting for your OK <small>not on your calendar yet</small></div>
      ${ps.map((b) => { const n = waitingOf(b).length;
        return `<div class="bk-prop"><b>${esc(titleOf(b))}</b><small>${b.cycle === "monthly" ? "First" : "Every"} ${SHORT[b.day]}, ${clock(b.start)}, ${b.min} min${n ? ` · ${n} task${n > 1 ? "s" : ""} waiting` : ""}</small>
        <span class="bk-btns"><button data-bk-ok="${esc(b.id)}"${S.busy ? " disabled" : ""}>Approve</button><button data-bk-change="${esc(b.id)}">Change</button><button data-bk-later="${esc(b.id)}">Not now</button></span></div>`; }).join("")}</div>`;
  }

  /* ---------- the week ---------- */
  function weekHTML(today) {
    today = today || S.today;
    if (!S.loaded) return `<p class="bk-none">${S.err ? esc(S.err) : "Loading your buckets…"}</p>`;
    const days = weekOf(today);
    const strip = days.map((d) => {
      const bs = S.buckets.filter((b) => fallsOn(b, d)).sort((a, b) => a.start.localeCompare(b.start));
      const isToday = d === today, past = d < today;
      return `<div class="bk-day${isToday ? " today" : ""}${past ? " past" : ""}"><div class="bk-dn">${SHORT[dowOf(d)]} ${+d.slice(8)}</div>
        ${bs.length ? bs.map((b) => { const n = waitingOf(b).length;
          return `<button class="bk-chip${S.open === b.id ? " on" : ""}${b.approved ? "" : " prop"}" data-bk-open="${esc(b.id)}"><span>${esc(b.emoji || "•")}</span><span class="bk-cn">${esc(b.name)}</span>${n ? `<i>${n}</i>` : ""}</button>`; }).join("")
          : `<span class="bk-free">free</span>`}</div>`;
    }).join("");
    const shown = S.buckets.filter((b) => S.open ? b.id === S.open : fallsOn(b, today));
    return `${S.err ? `<p class="bk-err">${esc(S.err)}</p>` : ""}<div class="bk-week">${strip}</div>${proposalsHTML(today)}
      ${shown.map((b) => `<div class="bk-open"><div class="bk-oh">${esc(titleOf(b))} <small>${clock(b.start)}, ${b.min} min</small></div>${listHTML(b)}</div>`).join("")}
      ${!shown.length ? `<p class="bk-none">No bucket today. Tap a day's bucket to see what is waiting in it.</p>` : ""}
      ${S.msg ? `<p class="bk-msg">${esc(S.msg)}</p>` : ""}
      <button class="bk-editbtn" data-bk-edit="1">${S.edit ? "Close the bucket editor" : "Change buckets"}</button>${S.edit ? editorHTML() : ""}`;
  }

  /* ---------- the editor ---------- */
  function editorHTML() {
    const row = (b, i) => `<div class="bk-er" data-bk-row="${i}">
      <input class="bk-em" value="${esc(b.emoji)}" data-f="emoji" aria-label="Emoji" maxlength="8">
      <input class="bk-nm" value="${esc(b.name)}" data-f="name" aria-label="Name" maxlength="40">
      <select data-f="cycle"><option value="weekly"${b.cycle !== "monthly" ? " selected" : ""}>Every</option><option value="monthly"${b.cycle === "monthly" ? " selected" : ""}>First</option></select>
      <select data-f="day">${DAYS.map((d) => `<option value="${d}"${b.day === d ? " selected" : ""}>${SHORT[d]}</option>`).join("")}</select>
      <input type="time" value="${esc(b.start)}" data-f="start" step="900" aria-label="Start">
      <select data-f="min">${[30, 45, 60, 90, 120, 180].concat([+b.min]).filter((v, j, a) => a.indexOf(v) === j).sort((x, y) => x - y).map((m) => `<option value="${m}"${+b.min === m ? " selected" : ""}>${m} min</option>`).join("")}</select>
      <button class="bk-rm" data-bk-rm="${i}" aria-label="Remove">✕</button></div>`;
    return `<div class="bk-ed"><p class="bk-hint">An approved bucket is one repeating event on Joint Plans, and saving moves it there too. One you have not approved stays off the calendar.</p>
      ${S.edit.map(row).join("")}
      <div class="bk-btns"><button data-bk-add="1">+ Add a bucket</button><button class="bk-save" data-bk-save="1"${S.busy ? " disabled" : ""}>${S.busy === "save" ? "Saving…" : "Save buckets"}</button></div></div>`;
  }
  function readEditor(box) {
    box.querySelectorAll("[data-bk-row]").forEach((r) => {
      const b = S.edit[+r.dataset.bkRow]; if (!b) return;
      r.querySelectorAll("[data-f]").forEach((x) => { b[x.dataset.f] = x.dataset.f === "min" ? +x.value : x.value; });
    });
  }

  /* ---------- wiring ---------- */
  function bind(box, api, redraw) {
    const on = (sel, fn) => box.querySelectorAll(sel).forEach((x) => x.onclick = (e) => { e.stopPropagation(); fn(x.dataset, x); });
    const act = async (busy, fn) => { if (S.busy) return; S.busy = busy; S.msg = ""; redraw();
      try { await fn(); } catch (e) { S.msg = e.message || String(e); } S.busy = ""; redraw(); };
    on("[data-bk-open]", (d) => { S.open = S.open === d.bkOpen ? null : d.bkOpen; redraw(); });
    on("[data-bk-did]", (d) => act("did", async () => {
      const t = S.tasks.find((x) => x.id === d.bkDid);
      const proof = t && /suppl/i.test(t.task + " " + t.bucket) ? "the shipped email" : "";
      const r = await api.post("/quest/buckets/did", { id: d.bkDid, proof });
      if (t) t.status = r.status || "Waiting for proof";
      S.msg = `Marked: ${t ? t.task : "task"}. It closes when the proof comes in.`;
    }));
    on("[data-bk-skip]", (d) => act("skip", async () => {
      await api.post("/quest/buckets/skip", { id: d.bkSkip });
      const t = S.tasks.find((x) => x.id === d.bkSkip);
      S.msg = `Kept for next time: ${t ? t.task : "task"}.`;
    }));
    on("[data-bk-ok]", (d) => act("approve", async () => {
      const b = S.buckets.find((x) => x.id === d.bkOk);
      const r = await api.post("/quest/buckets/approve", { id: d.bkOk });
      const failed = (r.sync || []).filter((x) => /^failed/.test(x.did) && (!b || x.name === b.name));
      await load(api, true);
      S.msg = failed.length ? `Approved ${b ? b.name : "it"}. The calendar did not take yet; it tries again within 15 minutes.` : `Approved: ${b ? titleOf(b) : "bucket"} is on your calendar now.`;
    }));
    on("[data-bk-later]", (d) => { S.notNow[d.bkLater] = S.today; notNowSave(); redraw(); });
    on("[data-bk-change]", () => { if (!S.edit) S.edit = S.buckets.map((b) => ({ id: b.id, name: b.name, emoji: b.emoji, cycle: b.cycle, day: b.day, start: b.start, min: b.min })); redraw(); });
    on("[data-bk-edit]", () => { S.edit = S.edit ? null : S.buckets.map((b) => ({ id: b.id, name: b.name, emoji: b.emoji, cycle: b.cycle, day: b.day, start: b.start, min: b.min })); redraw(); });
    if (S.edit) {
      box.querySelectorAll(".bk-ed input, .bk-ed select").forEach((x) => x.onchange = () => readEditor(box));
      on("[data-bk-add]", () => { readEditor(box); S.edit.push({ id: "", name: "", emoji: "", cycle: "weekly", day: "TH", start: "16:00", min: 90 }); redraw(); });
      on("[data-bk-rm]", (d) => { readEditor(box); S.edit.splice(+d.bkRm, 1); redraw(); });
      on("[data-bk-save]", () => { readEditor(box); act("save", async () => {
        try {
          const r = await api.post("/quest/buckets", { rev: S.rev, buckets: S.edit });
          const failed = (r.sync || []).filter((x) => /^failed/.test(x.did));
          S.edit = null; await load(api, true);
          S.msg = failed.length ? `Saved. The calendar did not take: ${failed.map((x) => x.name).join(", ")}. It tries again within 15 minutes.` : "Saved, and the calendar matches.";
        } catch (e) {
          if (e.status === 409) { S.edit = null; await load(api, true); throw new Error("Your buckets were changed on another device. Here is that copy; make the change again."); }
          throw e;
        }
      }); });
    }
  }

  const css = `.bk-week{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin:10px 0}
    .bk-day{background:rgba(255,255,255,.08);border-radius:10px;padding:5px 3px;min-height:64px;display:flex;flex-direction:column;gap:3px}
    .bk-day.today{background:rgba(255,255,255,.22);outline:2px solid rgba(255,255,255,.6)}.bk-day.past{opacity:.55}
    .bk-dn{font-size:11px;font-weight:700;text-align:center;opacity:.9}.bk-free{font-size:10px;opacity:.5;text-align:center}
    .bk-chip{display:flex;flex-direction:column;align-items:center;border:0;border-radius:8px;background:rgba(0,0,0,.18);color:inherit;padding:4px 2px;font-size:10px;position:relative;cursor:pointer}
    .bk-chip.prop{background:transparent;border:1.5px dashed rgba(255,255,255,.7)}
    .bk-props{background:rgba(0,0,0,.12);border:1.5px dashed rgba(255,255,255,.55);border-radius:12px;padding:10px;margin:8px 0}
    .bk-prop{padding:8px 0;border-top:1px solid rgba(255,255,255,.12);display:flex;flex-direction:column;gap:4px}.bk-prop:nth-child(2){border-top:0}.bk-prop small{opacity:.8;font-size:12px}
    .bk-chip.on{background:rgba(0,0,0,.4)}.bk-chip .bk-cn{line-height:1.1;word-break:break-word}
    .bk-chip i{position:absolute;top:-4px;right:-3px;background:#ffd166;color:#222;border-radius:9px;font-style:normal;font-weight:700;font-size:10px;padding:0 5px}
    .bk-open{background:rgba(0,0,0,.18);border-radius:12px;padding:10px;margin:8px 0}.bk-oh{font-weight:700;margin-bottom:6px}.bk-oh small{font-weight:400;opacity:.75}
    .bk-t{padding:8px 0;border-top:1px solid rgba(255,255,255,.12);display:flex;flex-direction:column;gap:4px}.bk-t:first-child{border-top:0}
    .bk-t small{opacity:.8;font-size:12px}.bk-t.wait{opacity:.7}.bk-w{font-style:italic}
    .bk-btns{display:flex;gap:6px;flex-wrap:wrap}.bk-btns button,.bk-editbtn{border:0;border-radius:9px;padding:7px 11px;background:rgba(255,255,255,.88);color:#222;font-weight:600;cursor:pointer}
    .bk-editbtn{margin-top:10px;background:rgba(255,255,255,.25);color:inherit}
    .bk-none,.bk-hint{opacity:.8;font-size:13px}.bk-err{color:#ffd1d1;font-size:13px}.bk-msg{font-size:13px;font-weight:600}
    .bk-ed{margin-top:8px}.bk-er{display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:6px 0;border-top:1px solid rgba(255,255,255,.15)}
    .bk-er input,.bk-er select{font-size:16px;border-radius:7px;border:0;padding:4px;background:rgba(255,255,255,.9);color:#222}
    .bk-em{width:2.6em}.bk-nm{flex:1 1 9em;min-width:8em}.bk-rm{border:0;background:none;color:inherit;font-size:16px;cursor:pointer}`;
  function ensureCss() {
    if (typeof document === "undefined" || document.getElementById("bk-css")) return;
    const s = document.createElement("style"); s.id = "bk-css"; s.textContent = css; document.head.appendChild(s);
  }

  root.QuestBuckets = { proposalsOf, S, load, weekHTML, listHTML, bind, ensureCss, matchTitle, fallsOn, weekOf, tasksOf, waitingOf, titleOf };
})(typeof window !== "undefined" ? window : globalThis);
