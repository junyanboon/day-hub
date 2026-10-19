/* Day Quest bedtime screen (Junyan, 2026-10-09, d180). Opens once the day's last
   item ends. In his order:
   1. how today went, 2. tomorrow's schedule, 3. the deathbed practice as a simple
   tile, 4. an exercise for considering the end of life. Keep a memory and Your life in prana
   were taken off on 2026-10-19 (Junyan: "Drop the keep a memory and line in prana").
   quest.html gathers the data and passes callbacks; this file only draws. */
(function (root) {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const YEARS = 84;
  // written for him, in plain words; one a night, "Another" moves on
  const EXERCISES = [
    "Write three lines you would want said about you at the end. Did today live them?",
    "If you had one year left, what would you stop doing tomorrow?",
    "Who would you call tonight if there were no tomorrow? Tell them something true this week.",
    "Name one thing you keep leaving for later. Later is not promised. When will you do it?",
    "Think of someone you knew who has died. What did their life teach you about yours?",
    "Picture the people at your bedside at the very end. How do you want them to remember being treated by you?",
    "Breathe all the way out and rest there a moment before the next breath. Each breath in is not guaranteed. Notice that, without fear.",
    "Look at today's log. If this had been your last day, which hour would you live differently?",
    "Everything you are carrying right now: worries, grudges, plans. Which of it would you take to your last breath? Put the rest down tonight.",
    "Count what is left: about {summers} more summers. What deserves them?",
  ];
  // d198: one tap at day's end, how tired he feels, against the game's number
  const FEEL = [[1, "Wiped out"], [2, "Tired"], [3, "Okay"], [4, "Good"], [5, "Full of energy"]], FEEL_PCT = [10, 30, 50, 70, 90];
  /* The deathbed sitting, guided (Junyan, 2026-10-11: "I need help answering this question"): three things to
     look at, a one-minute timer, then the question with three answers and a line for what it showed him. */
  const BED_ANSWERS = [
    ["yes", "Yes, it was", "Good. Nothing left to finish tonight: let it go to sleep with you. What made it so?"],
    ["partly", "Partly", "Name the part that was. Then one thing that would make tomorrow more so."],
    ["no", "Not really", "That is honest, and useful. What is one small thing you would change tomorrow?"],
  ];

  /* How today went against his recent days (Junyan, 2026-10-19): today's prana and body, pranic foods and drains,
     last night's Oura numbers, each with a small line of the last 7 days, the arrow against his 7-day average (green
     when it moved the right way) and his best day; then the one thing to beat tomorrow. quest-trends.js works it out. */
  const DOW = (ymd) => new Date(ymd + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" });
  function trendsHtml(t) {
    const TR = root.QuestTrends;
    if (!t || !TR) return "";
    const colour = { prana: "#ffd479", body: "#7fe3d4", pf: "#ffd479", dr: "#ffb36b", rhr: "#7fe3d4", hrv: "#7fe3d4", score: "#7fe3d4", wt: "#7fd0ff" };
    const cls = (x) => x.good === true ? "good" : x.good === false ? "off" : "";
    const pct = (k, v) => v == null ? "·" : (k === "prana" || k === "body") ? `${v}%` : `${v}`;
    const row = (k, label, now, avg, arrow, good, series, best, names) =>
      `<div class="tr-r"><span class="tr-l">${esc(label)}${names && names.length ? `<small class="tr-n">${esc(names.join(", "))}</small>` : ""}${best ? `<small>${best}</small>` : ""}</span><b>${esc(now)}</b>${TR.spark(series, colour[k] || "#fff")}` +
      `<span class="tr-a ${good}">${arrow || ""} ${avg == null ? "" : `<small>7-day ${esc(avg)}</small>`}</span></div>`;
    const days = t.rows.map((x) => row(x.k, x.label, pct(x.k, x.today), x.avg == null ? null : pct(x.k, Math.round(x.avg)), x.arrow, cls(x), x.series,
      x.best ? (x.best.isToday ? "🏆 best" : `best ${esc(pct(x.k, x.best.v))} ${esc(DOW(x.best.day))}`) : "", x.names));
    const nights = (t.oura || []).filter((x) => x.last != null || x.avg != null).map((x) => row(x.k, x.label, x.last ?? "·", x.avg, x.arrow, cls(x), x.series,
      x.best == null ? "" : x.last === x.best ? "🏆 best" : `best ${x.best}`));
    // water beside the sleep score (2026-10-19, d23): glasses today, how many before 4 PM, the last 7 days
    const w = t.water;
    const water = w ? row("wt", "Water today, glasses", w.today == null ? "0" : `${w.today}`, w.avg == null ? null : Math.round(w.avg), w.arrow, cls(w), w.series,
      `${w.before4 || 0} before 4 PM · aim ${w.aim || 8}`) : "";
    return `<div class="tr">${days.join("")}${nights.length ? `<div class="tr-h">Last night</div>${nights.join("")}` : ""}${water}
      ${t.cheer ? `<div class="tr-cheer"><span>✨</span><span>${esc(t.cheer)}</span></div>` : ""}
      <div class="tr-beat"><span>🌱</span><span><b>Tomorrow's one thing</b>${esc(t.beat)}</span></div></div>`;
  }

  function open(d) {
    if (document.getElementById("night")) return;
    const el = document.createElement("div");
    el.id = "night"; el.className = "nt";
    let ex = d.exerciseIndex % EXERCISES.length;
    let bedOpen = false, bedLeft = null, bedTimer = null;
    const bed = d.bed || {};
    const bedHtml = () => {
      const did = d.today.done.filter((x) => x.startsWith("✓")).map((x) => x.slice(2));
      const pick = BED_ANSWERS.find((a) => a[0] === bed.answer);
      return `<div class="nt-bed">
        <div class="nt-hint">There is no wrong answer. The point is not to judge the day, only to see it plainly, so you don't carry it into sleep.</div>
        <ol>
          <li>Sit up on your bed and close your eyes. Take it as true: this is your last minute.</li>
          <li>Run back through the day from waking up${did.length ? `: ${esc(did.slice(0, 6).join(", "))}` : ""}.</li>
          <li>For each part, ask: was I really there for it, or somewhere else in my head? Was I kind to the people in it? Is anything left unsaid or undone?</li>
        </ol>
        ${bedLeft != null ? `<div class="nt-min"><b id="ntMinN">${bedLeft}</b><span>seconds left. Eyes closed.</span></div>`
          : `<button class="btn ghost" id="ntMin">${bed.answer ? "Sit the minute again" : "Start the minute"}</button>`}
        <h4>Was today worthwhile?</h4>
        <div class="nt-ans">${BED_ANSWERS.map(([k, l]) => `<button data-bed="${k}" class="${bed.answer === k ? "on" : ""}">${l}</button>`).join("")}</div>
        ${pick ? `<div class="nt-hint" style="margin:10px 0 6px">${esc(pick[2])}</div>
          <textarea id="ntBedLine" rows="2" placeholder="A line, if you want to keep it">${esc(bed.line || "")}</textarea>
          <div class="nt-row"><button class="btn" id="ntBedSave">Keep it</button></div>` : ""}
      </div>`;
    };
    const draw = () => {
      // keep his place and anything typed: a tap used to redraw the screen and throw him back to the top
      const prevBody = el.querySelector(".nt-body"), scroll = prevBody ? prevBody.scrollTop : 0;
      const typed = {}; el.querySelectorAll("textarea[id]").forEach((t) => typed[t.id] = t.value);
      const now = Date.now(), b = d.birth ? Date.parse(d.birth + "T00:00:00") : null;
      const summers = b ? Math.max(0, Math.round(YEARS - (now - b) / (365.25 * 86400000))) : "your remaining";
      el.innerHTML = `
      <div class="nt-top"><b>🌙 Day's end</b><button class="btn" id="ntX">Close</button></div>
      <div class="nt-body">
        <section><h3>Today</h3>
          <div class="nt-stats">${d.today.stats.map(([n, l]) => `<div><b>${esc(n)}</b><span>${esc(l)}</span></div>`).join("")}</div>
          ${trendsHtml(d.today.trends)}
          ${d.today.line || ""}
          ${d.today.done.length ? `<ul class="nt-list">${d.today.done.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        </section>
        <section><h3>How tired do you feel?</h3>
          <div class="nt-feel">${FEEL.map(([n, l]) => `<button data-feel="${n}" class="${d.feel === n ? "on" : ""}"><b>${n}</b><small>${l}</small></button>`).join("")}</div>
          ${d.feel ? `<div class="nt-hint" style="margin-top:8px">Your body reads ${d.prana}%. You said ${esc(FEEL[d.feel - 1][1].toLowerCase())}, which is more like ${FEEL_PCT[d.feel - 1]}%.${Math.abs(d.prana - FEEL_PCT[d.feel - 1]) <= 15 ? " Close enough: the game is reading you well." : " Noted: this is how the game learns where it is off."}</div>` : ""}
        </section>
        <section><h3>Tomorrow · ${esc(d.tomorrow.label)}</h3>
          ${d.tomorrow.ahead ? `<div class="nt-ahead"><div><b>${d.tomorrow.ahead.use}</b><span>it will use</span></div><div><b>${d.tomorrow.ahead.start}%</b><span>you'll likely start</span></div><div><b>${Math.max(0, d.tomorrow.ahead.end)}%</b><span>you'd end near</span></div></div>
            <div class="nt-hint" style="margin:6px 0 8px">${esc(d.tomorrow.ahead.verdict)}${d.tomorrow.ahead.top.length ? " Heaviest: " + d.tomorrow.ahead.top.map((x) => `${esc(x.name)} ${x.d}`).join(", ") + "." : ""} Start assumes a usual night's sleep.</div>` : ""}
          ${d.tomorrow.items.length ? `<ul class="nt-sched">${d.tomorrow.items.map((x) => `<li><span>${esc(x.time)}</span>${esc(x.name)}</li>`).join("")}</ul>`
            : `<div class="nt-hint">${esc(d.tomorrow.note || "Nothing on the calendar yet.")}</div>`}
        </section>
        <section>
          <button class="nt-tile${d.deathbedDone ? " done" : ""}" id="ntBed"><span class="nt-ti">🕯️</span><span>
            <b>Sit as if on your deathbed</b><small>Sit on your bed. One minute left to live. Look back on your day: was it worthwhile?</small></span>
            <em>${d.deathbedDone ? "✓" : bedOpen ? "⌃" : "⌄"}</em></button>
          ${bedOpen ? bedHtml() : ""}
        </section>
        <section><h3>Consider the end</h3>
          <p class="nt-ex">${esc(EXERCISES[ex].replace("{summers}", summers))}</p>
          <textarea id="ntNote" rows="3" placeholder="A line, if you want to keep it">${esc(d.note || "")}</textarea>
          <div class="nt-row"><button class="btn ghost" id="ntNext">Another</button><button class="btn" id="ntSave">Keep it</button></div>
        </section>
      </div>`;
      for (const [id, v] of Object.entries(typed)) { const t = el.querySelector("#" + id); if (t) t.value = v; }
      el.querySelector(".nt-body").scrollTop = scroll;
      el.querySelector("#ntX").onclick = close;
      el.querySelectorAll("[data-feel]").forEach((bn) => bn.onclick = () => { d.feel = +bn.dataset.feel; d.onFeel(d.feel); draw(); });
      el.querySelector("#ntBed").onclick = () => { bedOpen = !bedOpen; draw(); };
      const mn = el.querySelector("#ntMin");
      if (mn) mn.onclick = () => {
        bedLeft = 60; draw();
        bedTimer = setInterval(() => {
          bedLeft--;
          const n = el.querySelector("#ntMinN"); if (n) n.textContent = bedLeft;
          if (bedLeft <= 0) { clearInterval(bedTimer); bedTimer = null; bedLeft = null; try { navigator.vibrate && navigator.vibrate(200); } catch {} draw(); }
        }, 1000);
      };
      el.querySelectorAll("[data-bed]").forEach((bn) => bn.onclick = () => {
        bed.answer = bn.dataset.bed; d.onBed({ ...bed });
        if (!d.deathbedDone) { d.deathbedDone = true; d.onDeathbed(); }
        draw();
      });
      const bs = el.querySelector("#ntBedSave");
      if (bs) bs.onclick = () => { bed.line = el.querySelector("#ntBedLine").value.trim(); d.onBed({ ...bed }); bs.textContent = "Kept ✓"; };
      el.querySelector("#ntNext").onclick = () => { ex = (ex + 1) % EXERCISES.length; draw(); };
      el.querySelector("#ntSave").onclick = () => { d.note = el.querySelector("#ntNote").value.trim(); d.onNote(d.note, EXERCISES[ex]); el.querySelector("#ntSave").textContent = "Kept ✓"; };
    };
    const close = () => { clearInterval(bedTimer); el.classList.remove("open"); setTimeout(() => el.remove(), 250); };
    draw();
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("open"));
  }

  const css = document.createElement("style");
  css.textContent = `
    .nt { position:fixed; inset:0; z-index:65; background:linear-gradient(180deg, #0d1028, #191d3c); color:var(--ink);
      display:flex; flex-direction:column; opacity:0; transition:opacity .4s; padding-top:env(safe-area-inset-top); }
    .nt.open { opacity:1; }
    .nt-top { display:flex; justify-content:space-between; align-items:center; padding:12px 16px; font-size:17px; }
    .nt-top .btn { flex:none; padding:8px 16px; }
    .nt-body { overflow:auto; padding:0 16px calc(env(safe-area-inset-bottom) + 30px); max-width:560px; width:100%; margin:0 auto; }
    .nt section { margin-top:22px; }
    .nt h3 { font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--ink-soft); margin:0 0 10px; font-weight:600; }
    .nt-stats { display:grid; grid-template-columns:repeat(5, 1fr); gap:6px; }
    .nt-stats div { background:var(--glass); border-radius:14px; padding:10px 6px; text-align:center; }
    .nt-stats b { display:block; font-size:20px; } .nt-stats span { font-size:11px; color:var(--ink-soft); }
    .nt-list, .nt-sched { list-style:none; padding:0; margin:10px 0 0; font-size:14px; }
    .nt-list li { padding:4px 0; color:var(--ink-soft); }
    .nt-sched li { display:flex; gap:12px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,.06); }
    .nt-sched span { width:72px; flex:none; color:var(--ink-soft); font-variant-numeric:tabular-nums; }
    .nt-hint { font-size:12px; color:var(--ink-faint); }
    .tr { margin-top:10px; background:var(--glass); border-radius:14px; padding:8px 12px; }
    .tr-r { display:grid; grid-template-columns:1fr 42px 64px 72px; gap:6px; align-items:center; padding:5px 0; border-bottom:1px solid rgba(255,255,255,.05); font-size:13px; }
    .tr-l { color:var(--ink-soft); } .tr-r b { font-size:15px; text-align:right; } .tr-spark { display:block; }
    .tr-a { font-weight:700; color:var(--ink-faint); white-space:nowrap; } .tr-a.good { color:#8fe3b0; } .tr-a.off { color:#ffb36b; }
    .tr-a small { font-weight:400; color:var(--ink-faint); font-size:11px; } .tr-l small { display:block; font-size:11px; color:var(--ink-faint); }
    .tr-h { font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:#7fe3d4; margin:10px 0 2px; }
    .tr-l small.tr-n { color:var(--ink-soft); }
    .tr-cheer { display:flex; gap:10px; margin:10px 0 0; padding:10px 12px; border-radius:12px; background:rgba(127,227,212,.10); font-size:14px; line-height:1.4; }
    .tr-beat { display:flex; gap:10px; margin:10px 0 4px; padding:10px 12px; border-radius:12px; background:linear-gradient(135deg, rgba(143,227,176,.16), rgba(255,212,121,.10)); font-size:14px; line-height:1.4; }
    .tr-beat b { display:block; font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:#8fe3b0; margin-bottom:2px; }
    .nt-tile { width:100%; display:flex; gap:12px; align-items:center; text-align:left; padding:14px; border-radius:16px;
      background:var(--glass); border:1px solid var(--glass-border); }
    .nt-tile.done { border-color:rgba(255,212,121,.6); background:linear-gradient(135deg, rgba(255,212,121,.18), rgba(255,255,255,.05)); }
    .nt-ti { font-size:26px; } .nt-tile b { display:block; font-size:15px; } .nt-tile small { display:block; font-size:12px; color:var(--ink-soft); margin-top:3px; }
    .nt-tile em { margin-left:auto; font-style:normal; color:var(--gold); font-size:18px; }
    .nt-ex { font-size:17px; line-height:1.45; margin:0 0 10px; }
    .nt textarea, .nt input[type=date] { width:100%; background:rgba(0,0,0,.25); border:1px solid var(--glass-border); border-radius:10px;
      padding:9px; color:var(--ink); font:inherit; color-scheme:dark; }
    .nt-row { display:flex; gap:8px; margin-top:8px; }
    .nt-feel { display:grid; grid-template-columns:repeat(5, 1fr); gap:6px; }
    .nt-feel button { background:var(--glass); border:1px solid var(--glass-border); border-radius:12px; padding:8px 2px; color:var(--ink); font:inherit; cursor:pointer; }
    .nt-feel button b { display:block; font-size:18px; } .nt-feel button small { display:block; font-size:10.5px; color:var(--ink-soft); margin-top:2px; }
    .nt-feel button.on { border-color:#ffd479; background:rgba(255,212,121,.16); }
    .nt-ahead { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; }
    .nt-ahead div { background:var(--glass); border-radius:14px; padding:10px 6px; text-align:center; }
    .nt-ahead b { display:block; font-size:20px; } .nt-ahead span { font-size:11px; color:var(--ink-soft); }
    .nt-bed { margin-top:10px; padding:14px; border-radius:16px; background:rgba(0,0,0,.18); border:1px solid var(--glass-border); }
    .nt-bed ol { margin:10px 0 12px; padding-left:20px; font-size:14px; line-height:1.45; } .nt-bed li { margin-bottom:6px; }
    .nt-bed h4 { font-size:15px; margin:14px 0 8px; font-weight:600; }
    .nt-min { display:flex; align-items:baseline; gap:8px; } .nt-min b { font-size:30px; font-variant-numeric:tabular-nums; color:var(--gold); }
    .nt-min span { font-size:13px; color:var(--ink-soft); }
    .nt-ans { display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; }
    .nt-ans button { background:var(--glass); border:1px solid var(--glass-border); border-radius:12px; padding:10px 4px; color:var(--ink); font:inherit; font-size:13.5px; cursor:pointer; }
    .nt-ans button.on { border-color:#ffd479; background:rgba(255,212,121,.16); }`;
  document.head.appendChild(css);
  root.QuestNight = { open };
})(window);
