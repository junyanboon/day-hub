/* Day Quest morning planner (Junyan, 2026-10-10: "Instead of a usual report I want it to be
   interactive ... we work together to plan out the day and make sure everything makes sense
   ... including assessing which tasks to do"). Replaces the Story slides (d147) with six steps
   he works through, each one changing today's plan as he taps:
   1. Check in: how he feels, body and prana, the weather.
   2. Does it work: clashes, the airport, food, bedtime, body budget, practice, each with a fix.
   3. The schedule: every item left, moved or dropped in place, its prep folded open.
   4. Tasks: his Notion list ranked by deadline and priority, a pick sized to his free time and
      how he feels; the ones he takes go into his free gaps.
   5. Practices, logged the same way as Prana actions.
   6. The day as planned, anything still open, and Let's go.
   quest.html gathers the data and does the writes (today only, through /ops); this file decides
   and draws. Plan state lives on G.day.plan so another device opens on the same step. */
(function (root) {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MIN = 60000, HR = 3600000;
  const STEPS = [
    ["Check in", ["#ffb37a", "#c2557a", "#3b2a6b"]],
    ["Does it work?", ["#ffd39a", "#e0785a", "#5b2d5e"]],
    ["Your schedule", ["#ffe1b0", "#c9786a", "#3a2c63"]],
    ["Tasks", ["#9fe3d0", "#3f8fa0", "#22305e"]],
    ["Practices", ["#fff1c9", "#f0a35e", "#7b3f61"]],
    ["Your day", ["#ffc2d1", "#b8579a", "#2f2a66"]],
  ];
  const FEEL = [[1, "Wiped out"], [2, "Tired"], [3, "Okay"], [4, "Good"], [5, "Full of energy"]];
  const FEEL_LOAD = { 1: .25, 2: .4, 3: .6, 4: .75, 5: .9 };   // how much of the free time to fill with tasks
  const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  let C = null, el = null, busy = false, showAll = false;
  const P = () => { const d = C.data(); d.plan.ok = d.plan.ok || {}; d.plan.tasks = d.plan.tasks || {}; d.plan.lead = d.plan.lead || {}; return d; };
  const T = (d) => C.fmtT(d);
  const names = (xs) => xs.map((x) => x.name).join(", ");
  const span = (a, b) => `${T(a)} to ${T(b)}`;
  const hm = (m) => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? ` ${r}` : ""}` : `${r} min`; };

  /* ---------- reading the day ---------- */
  const upcoming = (D) => D.items.filter((i) => i.e > D.now && !i.brk);
  const fixedOf = (D) => upcoming(D).filter((i) => !i.open);
  const isAirport = (i) => /airport/i.test(i.name);
  // time he cannot use: every fixed item, plus the run-up to a flight nobody has planned yet
  function busyOf(D) {
    const f = fixedOf(D), out = f.map((i) => [+i.s, +i.e]);
    f.filter((i) => i.flight && !f.some((x) => isAirport(x) && +x.e <= +i.s && +x.e > +i.s - 4 * HR))
      .forEach((i) => out.push([+i.s - (D.plan.lead[i.key] || 120) * MIN, +i.s]));
    return out;
  }
  // free gaps: the open spaces (and the short rests between them) minus anything busy, from now on
  function gapsOf(D) {
    const start = Math.ceil(+D.now / (5 * MIN)) * 5 * MIN, busyW = busyOf(D);
    let free = D.items.filter((i) => (i.open || i.brk) && i.e > D.now).map((i) => [Math.max(+i.s, start), +i.e]).filter(([a, b]) => b > a)
      .sort((a, b) => a[0] - b[0]);
    const merged = [];
    free.forEach(([a, b]) => { const l = merged[merged.length - 1]; if (l && a <= l[1]) l[1] = Math.max(l[1], b); else merged.push([a, b]); });
    let gaps = merged;
    busyW.forEach(([bs, be]) => { gaps = gaps.flatMap(([a, b]) => be <= a || bs >= b ? [[a, b]] : [[a, bs], [be, b]].filter(([x, y]) => y - x >= 5 * MIN)); });
    return gaps.map(([a, b]) => ({ s: new Date(a), e: new Date(b), min: (b - a) / MIN }));
  }
  const firstGap = (D, min, after, before) => gapsOf(D).find((g) => g.min >= min && +g.e - min * MIN >= +(after || 0) && (!before || +Math.max(+g.s, +(after || 0)) + min * MIN <= +before));
  const gapStart = (g, after) => new Date(Math.max(+g.s, +(after || 0)));
  const costLeft = (D) => fixedOf(D).map((i) => ({ i, d: i.cost * Math.max(0, Math.min(1, (+i.e - Math.max(+i.s, +D.now)) / Math.max(1, +i.e - +i.s))) }));

  /* ---------- does the day work? each check names the problem and offers fixes ---------- */
  function checks(D) {
    const out = [], f = fixedOf(D), t = D.now, lead = D.plan.lead;
    // the airport: when he has to go, and what is in the way
    f.filter((i) => i.flight).forEach((fl) => {
      const L = lead[fl.key] || 120, by = new Date(+fl.s - L * MIN);
      if (f.some((x) => isAirport(x) && +x.e <= +fl.s && +x.e > +fl.s - 4 * HR) || +by < +t - 30 * MIN) return;
      const clash = f.filter((x) => x !== fl && x.s < fl.s && x.e > by);
      out.push({ id: "fly:" + fl.key, warn: true, icon: "✈️", text: `Flight ${fl.name} at ${T(fl.s)}. Leave by about ${T(by)}.`,
        why: clash.length ? `${names(clash)} runs into that.` : `Nothing on the plan says when you head to the airport. I counted ${hm(L)} for the ride, check-in and security.`,
        fixes: [[`Add "To the airport" at ${T(by)}`, () => C.add("To the airport", by, fl.s)],
          [`Give it ${hm(L + 30)}`, () => { lead[fl.key] = L + 30; C.save(); }],
          ...(L > 60 ? [[`${hm(L - 30)} is enough`, () => { lead[fl.key] = L - 30; C.save(); }]] : [])] });
    });
    // two fixed things at the same time
    const fs = [...f].sort((a, b) => a.s - b.s);
    for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) {
      const a = fs[i], b = fs[j];
      if (b.s >= a.e || a.sleep || b.sleep) continue;
      const over = (Math.min(+a.e, +b.e) - +b.s) / MIN;
      out.push({ id: `clash:${a.key}:${b.key}`, warn: true, icon: "⚠️", text: `${a.name} and ${b.name} overlap by ${hm(over)}.`,
        why: `${a.name} runs ${span(a.s, a.e)}, ${b.name} starts ${T(b.s)}.`,
        fixes: [[`Start ${b.name} at ${T(a.e)}`, () => C.move(b.key, (+a.e - +b.s) / MIN)],
          ...(b.flight ? [] : [[`End ${a.name} at ${T(b.s)}`, () => C.setTime(a.key, a.s, b.s)]]),
          [`Drop ${b.flight ? a.name : b.name}`, () => C.drop(b.flight ? a.key : b.key)]] });
    }
    // food: something planned for the rest of the day
    const end = f.length ? new Date(Math.max(...f.filter((i) => !i.sleep).map((i) => +i.e), +t)) : t;
    const lastMeal = D.items.filter((i) => i.meal && !i.brk).sort((a, b) => b.e - a.e)[0];
    const fedAt = lastMeal ? lastMeal.e : null;
    if (fedAt && +end - +fedAt >= 4.5 * HR && +end - +t >= 2 * HR) {
      const g = firstGap(D, 30, new Date(Math.max(+t, +fedAt + 2.5 * HR)), end);
      const h = g ? C.hour(gapStart(g, new Date(+fedAt + 2.5 * HR))) : 18;
      const meal = h < 11 ? "Breakfast" : h < 16 ? "Lunch" : h < 18 ? "Snack" : "Dinner";
      out.push({ id: "food", icon: "🍽️", text: `No food planned after ${lastMeal.name.toLowerCase()} (ends ${T(fedAt)}).`,
        why: `The day runs to ${T(end)}${f.some((i) => i.flight) ? ", with a flight in between" : ""}.`,
        fixes: [...(g ? [[`Add ${meal.toLowerCase()} at ${T(gapStart(g, new Date(+fedAt + 2.5 * HR)))}`, () => { const s = gapStart(g, new Date(+fedAt + 2.5 * HR)); return C.add(meal, s, new Date(+s + Math.min(45, g.min) * MIN)); }]] : []),
          [f.some((i) => i.flight || i.kind === "travel") ? "I'll eat on the way" : "I'm fine", () => { D.plan.ok.food = true; C.save(); }]] });
    }
    // eating close to bed, and bed itself
    const sleep = f.find((i) => i.sleep);
    if (sleep) {
      const late = f.filter((i) => i.meal && +sleep.s - +i.e < 3 * HR && i.e <= sleep.s).pop();
      if (late) out.push({ id: "late:" + late.key, icon: "🌙", text: `${late.name} ends ${hm((+sleep.s - +late.e) / MIN)} before bed.`,
        why: "Last meal 3 hours before bed keeps sleep deep (and pays in the morning).",
        fixes: [[`Move ${late.name} to ${T(new Date(+sleep.s - 3 * HR - (late.e - late.s)))}`, () => C.move(late.key, (+sleep.s - 3 * HR - +late.e) / MIN)]] });
      const bh = C.hour(sleep.s);
      if (bh >= 23 || bh < 4) out.push({ id: "bed", icon: "🛏️", text: `Bed is at ${T(sleep.s)}.`, why: "Asleep by 11 PM counts for body.",
        fixes: [["Bed at 10:30 PM", () => { const s = C.at(sleep.s, 22.5, bh < 4 ? -1 : 0); return C.setTime(sleep.key, s, new Date(+s + (sleep.e - sleep.s))); }]] });
    }
    // body: will what is left fit in what he has?
    const costs = costLeft(D), use = Math.round(costs.reduce((a, x) => a + x.d, 0)), endB = Math.round(D.body - use);
    const floor = D.plan.feel && D.plan.feel <= 2 ? 30 : 15;
    if (use && endB < floor) {
      const top = costs.filter((x) => x.d > 3 && !x.i.flight).sort((a, b) => b.d - a.d)[0];
      out.push({ id: "body", warn: endB < 0, icon: "🔋", text: `What's left uses about ${use} body. You have ${Math.round(D.body)}.`,
        why: endB < 0 ? "More than you have. Something should get shorter or go." : `You'd end near ${endB}%. Tight.`,
        fixes: top && top.i.e - top.i.s > 45 * MIN ? [[`Cut ${top.i.name} by 30 min`, () => C.setTime(top.i.key, top.i.s, new Date(+top.i.e - 30 * MIN))]] : [] });
    }
    // practice: something for prana still ahead
    if (!f.some((i) => i.sadhana) && !D.practiced) {
      const g = firstGap(D, 15, t);
      if (g) out.push({ id: "sadhana", icon: "🪷", text: "No practice left on the plan today.", why: "Prana only rises through sadhana.",
        fixes: [[`Isha Kriya at ${T(g.s)}`, () => C.add("Isha Kriya", g.s, new Date(+g.s + 15 * MIN))],
          [`Nadi Shuddhi at ${T(g.s)}`, () => C.add("Nadi Shuddhi", g.s, new Date(+g.s + 10 * MIN))]] });
    }
    return out.filter((x) => !D.plan.ok[x.id]);
  }

  /* ---------- tasks: which ones today ---------- */
  function dateIn(text, today) {
    const iso = /(\d{4}-\d{2}-\d{2})/.exec(text);
    let d = iso ? iso[1] : null;
    if (!d) {
      const m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{1,2})\b/i.exec(text);
      if (m) { const y = +today.slice(0, 4), cand = new Date(Date.UTC(y, MON[m[1].toLowerCase()], +m[2]));
        if (+cand < Date.parse(today) - 200 * 86400000) cand.setUTCFullYear(y + 1);
        d = cand.toISOString().slice(0, 10); }
    }
    if (!d) return null;
    let days = Math.round((Date.parse(d) - Date.parse(today)) / 86400000);
    const deadline = /\b(due|before|by|until|deadline)\b/i.test(text);
    if (/\bbefore\b/i.test(text)) days -= 1;
    return { days, deadline, label: new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" }) };
  }
  const estOf = (s) => { const m = /(\d+(?:\.\d+)?)\s*(h|hr|hour|m|min)/i.exec(s || ""); return m ? Math.round(+m[1] * (/^h/i.test(m[2]) ? 60 : 1)) : null; };
  function rankTasks(D) {
    return D.tasks.map((t) => {
      const due = dateIn(t.task, D.today), high = /high/i.test(t.priority || ""), med = /medium/i.test(t.priority || "");
      let score = high ? 40 : med ? 20 : 10, why = high ? "High priority" : "";
      if (t.nextAction) { score += 10; why = why || "Next action"; }
      if (due && due.deadline) {
        if (due.days < 0) { score = 100 - Math.min(9, -due.days) / 10; why = `Overdue (was due ${due.label})`; }
        else if (due.days <= 1) { score = 95 - due.days; why = due.days ? "Due tomorrow" : "Due today"; }
        else if (due.days <= 3) { score += 30; why = `Due in ${due.days} days`; }
        else if (due.days > 7) { score -= 15; why = `Due ${due.label}, can wait`; }
      } else if (due && due.days >= 0 && due.days <= 1) { score = 90 - due.days; why = due.days ? "It's for tomorrow" : "It's for today"; }
      const est = estOf(t.estimate);
      return { ...t, score, why, est: est || 30, guessed: !est };
    }).sort((a, b) => b.score - a.score);
  }
  // his pick: urgent ones first, then the rest while they fit in the time and energy he has
  // task time = the free gaps plus what placed tasks already hold
  function pickTasks(D, ranked) {
    const placedMin = D.items.filter((i) => i.taskId && i.e > D.now).reduce((a, i) => a + (+i.e - Math.max(+i.s, +D.now)) / MIN, 0);
    const left = gapsOf(D).reduce((a, g) => a + g.min, 0), free = left + placedMin, cap = free * (FEEL_LOAD[D.plan.feel] || .6);
    let used = 0;
    const mine = new Set();
    ranked.forEach((t) => { if (t.score >= 85 || (t.score >= 40 && used + t.est <= cap)) { mine.add(t.id); used += t.est; } });
    return { free, left, cap, mine };
  }

  /* ---------- drawing ---------- */
  const css = `
  #morning .mp { position:fixed; inset:0; }
  #morning .mp-scroll { position:absolute; inset:0; overflow-y:auto; -webkit-overflow-scrolling:touch; background:linear-gradient(180deg, var(--g3) 0%, var(--g2) 62%, var(--g1) 100%); }
  #morning .mp-c { position:relative; max-width:560px; margin:0 auto; padding:calc(env(safe-area-inset-top) + 40px) 20px calc(env(safe-area-inset-bottom) + 110px); }
  #morning .mp-step { font-size:11px; letter-spacing:.16em; text-transform:uppercase; opacity:.75; }
  #morning .mp-h { font-family:Georgia, "Times New Roman", serif; font-size:30px; line-height:1.1; margin:6px 0 4px; }
  #morning .mp-lead { font-size:15px; opacity:.88; line-height:1.4; margin:6px 0 14px; }
  #morning .mp-nav { position:fixed; left:0; right:0; bottom:0; z-index:4; display:flex; gap:10px; justify-content:center; padding:12px 16px calc(env(safe-area-inset-bottom) + 12px);
    background:linear-gradient(0deg, rgba(20,14,40,.7), rgba(20,14,40,0)); }
  #morning .mp-nav button { flex:1; max-width:270px; padding:14px; border-radius:16px; font-size:16px; font-weight:700; }
  #morning .mp-back { background:rgba(255,255,255,.18); color:#fff; flex:0 0 auto !important; padding:14px 18px !important; }
  #morning .mp-next { background:#fff; color:#3b2a6b; }
  #morning .mo-bars { cursor:pointer; }
  #morning .mo-bars i { position:relative; }
  #morning .mp-rings { display:flex; gap:14px; margin:16px 0 4px; }
  #morning .mp-rings .mo-ring { margin-top:0; width:96px; height:96px; }
  #morning .mp-chips { display:flex; flex-wrap:wrap; gap:8px; margin:8px 0 4px; }
  #morning .mp-chip { padding:10px 14px; border-radius:14px; background:rgba(255,255,255,.16); color:#fff; font-size:15px; }
  #morning .mp-chip.on { background:#fff; color:#3b2a6b; font-weight:700; }
  #morning .mp-card { border-radius:18px; background:rgba(20,14,40,.32); padding:14px; margin:10px 0; }
  #morning .mp-card.warn { box-shadow:inset 0 0 0 2px #ffb36b; }
  #morning .mp-card b { font-size:16px; }
  #morning .mp-card p { margin:4px 0 0; font-size:14px; opacity:.82; line-height:1.35; }
  #morning .mp-fix { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
  #morning .mp-fix button { padding:9px 12px; border-radius:12px; background:rgba(255,255,255,.92); color:#3b2a6b; font-size:14px; font-weight:700; }
  #morning .mp-fix button.ghost { background:rgba(255,255,255,.14); color:#fff; font-weight:500; }
  #morning .mp-ok { font-size:18px; margin:16px 0; padding:16px; border-radius:18px; background:rgba(255,255,255,.14); }
  #morning .mp-row { display:flex; align-items:center; gap:10px; width:100%; padding:10px 12px; color:#fff; text-align:left; background:none; }
  #morning .mp-it { border-radius:16px; background:rgba(255,255,255,.14); margin:8px 0; overflow:hidden; }
  #morning .mp-it.open { background:rgba(30,20,60,.55); }
  #morning .mp-it.free { background:rgba(255,255,255,.05); border:1px dashed rgba(255,255,255,.3); }
  #morning .mp-it.now { box-shadow:inset 0 0 0 2px #ffd479; }
  #morning .mp-t { width:68px; flex:none; font-size:13px; opacity:.85; }
  #morning .mp-n { flex:1; min-width:0; font-size:15px; }
  #morning .mp-n small { display:block; font-size:12px; opacity:.72; margin-top:1px; }
  #morning .mp-tools { display:flex; flex-wrap:wrap; gap:6px; padding:0 12px 12px; }
  #morning .mp-tools button { padding:8px 11px; border-radius:11px; background:rgba(255,255,255,.9); color:#3b2a6b; font-size:13px; font-weight:700; }
  #morning .mp-tools button.del { background:rgba(255,120,120,.25); color:#fff; }
  #morning .mp-it .mo-det { padding:0 14px 14px; }
  #morning .mp-task { border-radius:16px; background:rgba(20,14,40,.3); padding:12px 14px; margin:8px 0; }
  #morning .mp-task.pick { box-shadow:inset 0 0 0 2px #ffd479; }
  #morning .mp-task.today { background:rgba(255,255,255,.9); color:#3b2a6b; }
  #morning .mp-task.later { opacity:.55; }
  #morning .mp-task b { display:block; font-size:15px; line-height:1.3; }
  #morning .mp-task small { display:block; font-size:12.5px; opacity:.8; margin-top:3px; }
  #morning .mp-tb { display:flex; flex-wrap:wrap; gap:6px; margin-top:9px; }
  #morning .mp-tb button { padding:7px 11px; border-radius:11px; background:rgba(255,255,255,.18); color:inherit; font-size:13px; font-weight:700; }
  #morning .mp-task.today .mp-tb button { background:rgba(59,42,107,.12); }
  #morning .mp-tb button.on { background:#3b2a6b; color:#fff; }
  #morning .mp-meter { height:8px; border-radius:4px; background:rgba(255,255,255,.2); overflow:hidden; margin:8px 0 2px; }
  #morning .mp-meter i { display:block; height:100%; background:#ffd479; }
  #morning .mp-big-btn { display:block; width:100%; margin:12px 0; padding:14px; border-radius:16px; background:#ffd479; color:#3b2a6b; font-size:16px; font-weight:700; }
  #morning .mp-more { margin:6px 0; padding:9px 12px; border-radius:12px; background:rgba(255,255,255,.14); color:#fff; font-size:14px; }
  #morning .mp-line { display:flex; gap:10px; padding:8px 0; border-top:1px solid rgba(255,255,255,.14); font-size:15px; }
  #morning .mp-line span:first-child { width:72px; flex:none; opacity:.8; font-size:13px; padding-top:2px; }
  #morning .mp-line.task span:last-child::before { content:"📝 "; }
  #morning .mp-wx { display:flex; align-items:center; gap:12px; margin-top:12px; }
  #morning .mp-wx .ic { font-size:40px; line-height:1; }
  #morning .mp-busy { position:fixed; top:calc(env(safe-area-inset-top) + 20px); left:50%; transform:translateX(-50%); z-index:6; padding:6px 12px; border-radius:12px; background:rgba(0,0,0,.45); font-size:13px; }
  `;

  function stepCheckIn(D) {
    const w = D.wx;
    let wx = "";
    if (!w || w.state === "loading") wx = `<p class="mo-soft">Checking the sky…</p>`;
    else if (w.state === "ok") wx = `<div class="mp-wx"><span class="ic">${w.ic}</span><div><b style="font-size:20px">${w.hi}° <span class="mo-lo">/ ${w.lo}°</span></b>
      <div class="mo-soft" style="margin-top:2px">${esc(w.word)}${w.where ? ` in ${esc(w.where)}` : ""} · UV ${w.uv} · 🌇 ${esc(w.set)}</div></div></div>
      ${w.tips.map((x) => `<p class="mo-tip">${esc(x)}</p>`).join("")}`;
    else wx = `<p class="mo-soft">No weather right now.</p>`;
    return `<div class="mo-kicker">${esc(D.greet)}, Junyan</div><div class="mo-place">${esc(D.place)}</div><div class="mo-date">${esc(D.date)} · ${T(D.now)}</div>
      <div class="mp-rings"><div class="mo-ring"><b>${D.prana}%</b><span>prana</span></div><div class="mo-ring"><b>${Math.round(D.body)}%</b><span>body</span></div></div>
      <div class="mo-kicker" style="margin-top:22px">How do you feel right now?</div>
      <div class="mp-chips">${FEEL.map(([n, w]) => `<button class="mp-chip${D.plan.feel === n ? " on" : ""}" data-feel="${n}">${w}</button>`).join("")}</div>
      <p class="mo-soft">This sets how much I put on your plate today.</p>${wx}`;
  }

  function stepChecks(D) {
    const cs = checks(D);
    return `<div class="mp-h">Does today work?</div><p class="mp-lead">${cs.length ? `I found ${cs.length} thing${cs.length > 1 ? "s" : ""} to look at. Fix it with a tap, or tell me it's fine.` : "I checked the times, the airport, food, bed, your body and your practice."}</p>
      ${cs.length ? cs.map((c) => `<div class="mp-card${c.warn ? " warn" : ""}"><b>${c.icon} ${esc(c.text)}</b><p>${esc(c.why)}</p>
        <div class="mp-fix">${c.fixes.map((f, i) => `<button data-fix="${esc(c.id)}" data-i="${i}">${esc(f[0])}</button>`).join("")}<button class="ghost" data-fine="${esc(c.id)}">It's fine</button></div></div>`).join("")
        : `<div class="mp-ok">👍 Nothing clashes. The day hangs together.</div>`}`;
  }

  const open = new Set();
  function stepSchedule(D) {
    const up = upcoming(D), costs = new Map(costLeft(D).map((x) => [x.i.key, Math.round(x.d)]));
    const rows = [];
    const gaps = gapsOf(D);
    up.filter((i) => !i.open).forEach((i) => {
      gaps.filter((g) => !g.shown && g.s < i.s).forEach((g) => { g.shown = true; rows.push(freeRow(g)); });
      const on = open.has(i.key), cur = i.s <= D.now && i.e > D.now, c = costs.get(i.key);
      rows.push(`<div class="mp-it${on ? " open" : ""}${cur ? " now" : ""}"><button class="mp-row" data-open="${esc(i.key)}"><span class="mp-t">${cur ? "Now" : T(i.s)}</span>${i.badge}
        <span class="mp-n">${esc(i.name)}<small>${span(i.s, i.e)}${c ? ` · uses ~${c} body` : ""}${i.taskId ? " · task" : ""}</small></span><span class="mo-row-go">${on ? "⌃" : "⌄"}</span></button>
        ${on ? `<div class="mp-tools">${cur ? "" : `<button data-mv="${esc(i.key)}" data-m="-15">−15 min</button>`}<button data-mv="${esc(i.key)}" data-m="15">+15 min</button><button data-mv="${esc(i.key)}" data-m="30">+30 min</button>
          ${i.e - i.s > 30 * MIN ? `<button data-cut="${esc(i.key)}">End 15 min sooner</button>` : ""}<button class="del" data-drop="${esc(i.key)}">Not today</button></div>${C.detail(i.key)}` : ""}</div>`);
    });
    gaps.filter((g) => !g.shown).forEach((g) => rows.push(freeRow(g)));
    const free = gaps.reduce((a, g) => a + g.min, 0);
    return `<div class="mp-h">Your schedule</div><p class="mp-lead">Tap anything to move it, cut it or drop it (today only). ${free ? `${hm(free)} is still free.` : "No free time left."}</p>${rows.join("") || `<div class="mp-ok">Nothing left on today's plan.</div>`}`;
  }
  const freeRow = (g) => `<div class="mp-it free"><div class="mp-row"><span class="mp-t">${T(g.s)}</span><span class="mp-n">Free · ${hm(g.min)}<small>until ${T(g.e)}</small></span>
    <button class="mp-more" data-go="3" style="margin:0">Fill it ›</button></div></div>`;

  function stepTasks(D) {
    const ranked = rankTasks(D), { free, left, cap, mine } = pickTasks(D, ranked), st = D.plan.tasks;
    const placed = (id) => D.items.find((i) => i.taskId === id && i.e > D.now);
    const today = ranked.filter((t) => st[t.id] === "today" || placed(t.id)), want = today.reduce((a, t) => a + t.est, 0);
    const waiting = today.filter((t) => !placed(t.id));
    const list = showAll ? ranked.slice(0, 30) : ranked.slice(0, 8);
    return `<div class="mp-h">What to do today</div>
      <p class="mp-lead">${hm(free)} for tasks${left < free ? ` (${hm(left)} still free)` : ""}. Feeling ${esc((FEEL.find((f) => f[0] === D.plan.feel) || [0, "okay"])[1].toLowerCase())}, I'd fill about ${hm(cap)}. Gold ones are my pick.</p>
      <div class="mp-meter"><i style="width:${Math.min(100, free ? (want / free) * 100 : 0)}%"></i></div>
      <p class="mo-soft" style="margin-top:2px">Today: ${hm(want)} of ${hm(free)}${want > free ? ". That's more than you have." : ""}</p>
      ${waiting.length ? `<button class="mp-big-btn" data-place="1">Put ${waiting.length} on the plan</button>` : ""}
      ${list.map((t) => {
        const s = st[t.id], p = placed(t.id), isToday = s === "today" || p;
        return `<div class="mp-task${isToday ? " today" : s === "later" ? " later" : mine.has(t.id) ? " pick" : ""}"><b>${esc(t.task)}</b>
          <small>${t.why ? `${esc(t.why)} · ` : ""}${t.guessed ? `about ${t.est} min?` : hm(t.est)}${p ? ` · on the plan at ${T(p.s)}` : ""}</small>
          <div class="mp-tb">${p ? `<button data-unplace="${esc(p.key)}" data-t="${esc(t.id)}">Take it off</button>`
            : `<button class="${s === "today" ? "on" : ""}" data-task="${esc(t.id)}" data-v="today">Today</button><button class="${s === "later" ? "on" : ""}" data-task="${esc(t.id)}" data-v="later">Not today</button>`}
            <button data-tdone="${esc(t.id)}">Already done</button>${t.guessed && !p ? [15, 60].map((m) => `<button data-est="${esc(t.id)}" data-m="${m}">${m} min</button>`).join("") : ""}</div></div>`;
      }).join("")}
      ${ranked.length > 8 ? `<button class="mp-more" data-all="1">${showAll ? "Show fewer" : `Show ${Math.min(30, ranked.length) - 8} more`}</button>` : ""}`;
  }

  function stepPractices(D) {
    return `<div class="mp-h">Practices for today</div><p class="mp-lead">Tap one when it's done. Each fills your prana. The rest come from your calendar.</p>
      ${D.practices.map(([group, xs]) => `<div class="mo-kicker" style="margin-top:18px">${esc(group)}</div><div class="mo-prac">${xs.map((p) =>
        `<button class="mo-pr${p.done ? " done" : ""}"${p.auto ? " disabled" : ` data-habit="${p.id}"`}><span class="mo-pr-i">${p.icon}</span>
        <span class="mo-pr-t"><b>${esc(p.label)}</b><small>${esc(p.small)}</small></span><span class="mo-pr-g">${p.done ? "✓" : p.auto ? "auto" : p.gain ? `+${p.gain}` : ""}</span></button>`).join("")}</div>`).join("")}`;
  }

  function stepDay(D) {
    const cs = checks(D), up = fixedOf(D), free = gapsOf(D).reduce((a, g) => a + g.min, 0);
    const use = Math.round(costLeft(D).reduce((a, x) => a + x.d, 0));
    return `<div class="mp-h">Your day</div>
      <p class="mp-lead">${up.length} thing${up.length === 1 ? "" : "s"} left, ${hm(free)} free. Body ${Math.round(D.body)}% now, about ${Math.max(0, Math.round(D.body - use))}% by the end.</p>
      ${cs.length ? `<div class="mp-card warn"><b>${cs.length} thing${cs.length > 1 ? "s" : ""} still open</b><p>${cs.map((c) => esc(c.text)).join(" ")}</p><div class="mp-fix"><button data-go="1">Look again</button></div></div>` : ""}
      <div style="margin-top:8px">${up.map((i) => `<div class="mp-line${i.taskId ? " task" : ""}"><span>${T(i.s)}</span><span>${esc(i.name)}</span></div>`).join("")}</div>`;
  }

  function draw(keep) {
    if (!el) return;
    const D = P(), step = Math.max(0, Math.min(STEPS.length - 1, D.plan.step || 0)), [, pal] = STEPS[step];
    const sc = el.querySelector(".mp-scroll"), y = keep && sc ? sc.scrollTop : 0;
    const body = [stepCheckIn, stepChecks, stepSchedule, stepTasks, stepPractices, stepDay][step](D);
    const last = step === STEPS.length - 1;
    el.innerHTML = `<div class="mp"><div class="mo-bars">${STEPS.map((s, i) => `<i class="${i < step ? "done" : i === step ? "on" : ""}" data-go="${i}" title="${esc(s[0])}"></i>`).join("")}</div>
      <div class="mp-scroll" style="--g1:${pal[0]};--g2:${pal[1]};--g3:${pal[2]}"><div class="mp-c"><div class="mp-step">Step ${step + 1} of ${STEPS.length} · ${esc(STEPS[step][0])}</div>${body}</div></div>
      <div class="mp-nav">${step ? `<button class="mp-back" data-go="${step - 1}">‹ Back</button>` : ""}<button class="mp-next" data-${last ? "begin" : "go"}="${step + 1}">${last ? "Looks good. Let's go" : `Next: ${esc(STEPS[step + 1][0])} ›`}</button></div>
      ${busy ? `<div class="mp-busy">Saving…</div>` : ""}</div><button class="mo-x" data-close="1" aria-label="Close">✕</button>`;
    const sc2 = el.querySelector(".mp-scroll"); if (sc2 && y) sc2.scrollTop = y;
    wire(D);
  }

  // run a change, then draw again where he was
  async function act(fn) {
    if (busy) return;
    busy = true; draw(true);
    try { await fn(); } catch (e) { console.warn("morning", e); }
    busy = false; draw(true);
  }

  function wire(D) {
    const on = (sel, fn) => el.querySelectorAll(sel).forEach((b) => b.onclick = (e) => { e.stopPropagation(); fn(b.dataset, b); });
    on("[data-close]", () => close());
    on("[data-go]", (d) => { D.plan.step = +d.go; C.save(); draw(); });
    on("[data-begin]", () => { C.begin(); close(); });
    on("[data-feel]", (d) => { D.plan.feel = +d.feel; C.log(`Morning check-in: ${FEEL[+d.feel - 1][1].toLowerCase()}`); C.save(); draw(true); });
    on("[data-fix]", (d) => { const c = checks(P()).find((x) => x.id === d.fix); if (c) act(() => c.fixes[+d.i][1]()); });
    on("[data-fine]", (d) => { D.plan.ok[d.fine] = true; C.save(); draw(true); });
    on("[data-open]", (d) => { open.has(d.open) ? open.delete(d.open) : open.add(d.open); draw(true); });
    on("[data-mv]", (d) => act(() => C.move(d.mv, +d.m)));
    on("[data-cut]", (d) => { const i = D.items.find((x) => x.key === d.cut); if (i) act(() => C.setTime(i.key, i.s, new Date(+i.e - 15 * MIN))); });
    on("[data-drop]", (d) => { open.delete(d.drop); act(() => C.drop(d.drop)); });
    on("[data-task]", (d) => { D.plan.tasks[d.task] = D.plan.tasks[d.task] === d.v ? undefined : d.v; C.save(); draw(true); });
    on("[data-est]", (d) => { const t = D.tasks.find((x) => x.id === d.est); if (t) { t.estimate = `${d.m} min`; (D.plan.est = D.plan.est || {})[d.est] = +d.m; C.save(); } draw(true); });
    on("[data-all]", () => { showAll = !showAll; draw(true); });
    on("[data-tdone]", (d) => act(async () => { await C.taskDone(d.tdone); delete D.plan.tasks[d.tdone]; C.save(); }));
    on("[data-unplace]", (d) => act(async () => { await C.drop(d.unplace); D.plan.tasks[d.t] = "later"; C.save(); }));
    on("[data-place]", () => act(() => placeAll()));
    on("[data-habit]", (d) => { C.habit(d.habit); draw(true); });
    C.bind(el, () => draw(true));
  }

  // each task he took goes into the first free gap that fits it, in the order of his list
  async function placeAll() {
    const D = P(), ranked = rankTasks(D);
    for (const t of ranked.filter((x) => D.plan.tasks[x.id] === "today")) {
      const D2 = P();
      if (D2.items.some((i) => i.taskId === t.id && i.e > D2.now)) continue;
      const min = (D2.plan.est || {})[t.id] || t.est, g = firstGap(D2, min, D2.now);
      if (!g) { C.log(`No free gap left for: ${t.task}`); continue; }
      await C.add(t.task.length > 70 ? t.task.slice(0, 69) + "…" : t.task, g.s, new Date(+g.s + min * MIN), { taskId: t.id });
    }
  }

  function close() { if (el) { el.className = ""; el.innerHTML = ""; } el = null; open.clear(); showAll = false; C && C.onClose && C.onClose(); }

  root.QuestMorning = {
    open(ctx) {
      C = ctx;
      if (!document.getElementById("mp-css")) { const s = document.createElement("style"); s.id = "mp-css"; s.textContent = css; document.head.appendChild(s); }
      el = document.getElementById("morning");
      if (!el) { el = document.createElement("div"); el.id = "morning"; document.body.appendChild(el); }
      const fresh = el.className !== "open";
      el.className = "open";
      draw(!fresh);
    },
    redraw() { if (el && el.className === "open") draw(true); },
    isOpen: () => !!(el && el.className === "open"),
    // how many things the day check would raise right now (the button's subtitle)
    count(ctx) { C = C || ctx; try { return checks(P()).length; } catch { return 0; } },
    close,
    // for checks from the console and tests
    _t: { checks, rankTasks, pickTasks, gapsOf, dateIn, estOf },
  };
})(typeof window !== "undefined" ? window : globalThis);
