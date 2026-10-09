/* Day Quest bedtime screen (Junyan, 2026-10-09, d180). Opens once the day's last
   item ends. In his order:
   1. how today went, 2. tomorrow's schedule, 3. the deathbed practice as a simple
   tile, 4. an exercise for considering the end of life, 5. no prana here, only
   reflection: every day's prana laid on a life of 84 years, one square a week.
   quest.html gathers the data and passes callbacks; this file only draws. */
(function (root) {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const YEARS = 84, WEEK = 7 * 86400000;
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
  const colour = (p) => p == null ? null : p >= 70 ? "#8fe3b0" : p >= 45 ? "#ffd479" : p >= 25 ? "#ffb36b" : "#ff9c9c";

  function lifeGrid(birth, days, now) {
    // one square a week, 52 a row, 84 rows; colour = that week's average prana
    const b = Date.parse(birth + "T00:00:00"), weeks = YEARS * 52, cur = Math.floor((now - b) / WEEK);
    const avg = {};
    for (const [ymd, p] of Object.entries(days)) {
      const w = Math.floor((Date.parse(ymd + "T12:00:00") - b) / WEEK);
      (avg[w] = avg[w] || []).push(p);
    }
    const S = 5, G = 1, W = 52 * (S + G), H = YEARS * (S + G);
    let r = "";
    for (let w = 0; w < weeks; w++) {
      const x = (w % 52) * (S + G), y = Math.floor(w / 52) * (S + G);
      const a = avg[w] ? avg[w].reduce((s, v) => s + v, 0) / avg[w].length : null;
      const fill = a != null ? colour(a) : w < cur ? "rgba(255,255,255,.28)" : "rgba(255,255,255,.07)";
      r += `<rect x="${x}" y="${y}" width="${S}" height="${S}" rx="1" fill="${fill}"${w === cur ? ' stroke="#fff" stroke-width="1"' : ""}/>`;
    }
    return `<svg class="nt-life" viewBox="0 0 ${W} ${H}" aria-label="Your life in weeks">${r}</svg>`;
  }
  function recentBars(days) {
    const list = Object.entries(days).sort((a, b) => a[0].localeCompare(b[0])).slice(-30);
    if (!list.length) return "";
    return `<div class="nt-bars">${list.map(([d, p]) => `<i title="${esc(d)}: ${p}" style="height:${Math.max(4, p)}%;background:${colour(p)}"></i>`).join("")}</div>
      <div class="nt-hint">Each bar is a day's ending prana, the last ${list.length} days.</div>`;
  }

  function open(d) {
    if (document.getElementById("night")) return;
    const el = document.createElement("div");
    el.id = "night"; el.className = "nt";
    let ex = d.exerciseIndex % EXERCISES.length;
    const draw = () => {
      const now = Date.now(), b = d.birth ? Date.parse(d.birth + "T00:00:00") : null;
      const lived = b ? Math.floor((now - b) / 86400000) : null, left = b ? Math.max(0, Math.floor((b + YEARS * 365.25 * 86400000 - now) / 86400000)) : null;
      const summers = b ? Math.max(0, Math.round(YEARS - (now - b) / (365.25 * 86400000))) : "your remaining";
      el.innerHTML = `
      <div class="nt-top"><b>🌙 Day's end</b><button class="btn" id="ntX">Close</button></div>
      <div class="nt-body">
        <section><h3>Today</h3>
          <div class="nt-stats">${d.today.stats.map(([n, l]) => `<div><b>${esc(n)}</b><span>${esc(l)}</span></div>`).join("")}</div>
          ${d.today.line || ""}
          ${d.today.done.length ? `<ul class="nt-list">${d.today.done.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        </section>
        <section><h3>Tomorrow · ${esc(d.tomorrow.label)}</h3>
          ${d.tomorrow.items.length ? `<ul class="nt-sched">${d.tomorrow.items.map((x) => `<li><span>${esc(x.time)}</span>${esc(x.name)}</li>`).join("")}</ul>`
            : `<div class="nt-hint">${esc(d.tomorrow.note || "Nothing on the calendar yet.")}</div>`}
        </section>
        <section>
          <button class="nt-tile${d.deathbedDone ? " done" : ""}" id="ntBed"><span class="nt-ti">🕯️</span><span>
            <b>Sit as if on your deathbed</b><small>Sit on your bed. One minute left to live. Look back on your day: was it worthwhile?</small></span>
            <em>${d.deathbedDone ? "✓" : ""}</em></button>
        </section>
        <section><h3>Consider the end</h3>
          <p class="nt-ex">${esc(EXERCISES[ex].replace("{summers}", summers))}</p>
          <textarea id="ntNote" rows="3" placeholder="A line, if you want to keep it">${esc(d.note || "")}</textarea>
          <div class="nt-row"><button class="btn ghost" id="ntNext">Another</button><button class="btn" id="ntSave">Keep it</button></div>
        </section>
        <section><h3>Your life in prana</h3>
          <div class="nt-hint">No prana tonight. At the end there is only this: how the days went.</div>
          ${recentBars(d.days)}
          ${b ? `<div class="nt-hint" style="margin-top:12px">${lived.toLocaleString()} days lived · about ${left.toLocaleString()} left of ${YEARS} years · one square a week, this week outlined</div>${lifeGrid(d.birth, d.days, now)}`
            : `<div class="nt-birth"><label>Your birth date, to lay your days on a life of ${YEARS} years</label><input type="date" id="ntBirth"><button class="btn" id="ntBirthOk">Save</button></div>`}
        </section>
      </div>`;
      el.querySelector("#ntX").onclick = close;
      el.querySelector("#ntBed").onclick = () => { if (!d.deathbedDone) { d.deathbedDone = true; d.onDeathbed(); draw(); } };
      el.querySelector("#ntNext").onclick = () => { ex = (ex + 1) % EXERCISES.length; draw(); };
      el.querySelector("#ntSave").onclick = () => { d.note = el.querySelector("#ntNote").value.trim(); d.onNote(d.note, EXERCISES[ex]); el.querySelector("#ntSave").textContent = "Kept ✓"; };
      const bo = el.querySelector("#ntBirthOk");
      if (bo) bo.onclick = () => { const v = el.querySelector("#ntBirth").value; if (!v) return; d.birth = v; d.onBirth(v); draw(); };
    };
    const close = () => { el.classList.remove("open"); setTimeout(() => el.remove(), 250); };
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
    .nt-stats { display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; }
    .nt-stats div { background:var(--glass); border-radius:14px; padding:10px 6px; text-align:center; }
    .nt-stats b { display:block; font-size:20px; } .nt-stats span { font-size:11px; color:var(--ink-soft); }
    .nt-list, .nt-sched { list-style:none; padding:0; margin:10px 0 0; font-size:14px; }
    .nt-list li { padding:4px 0; color:var(--ink-soft); }
    .nt-sched li { display:flex; gap:12px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,.06); }
    .nt-sched span { width:72px; flex:none; color:var(--ink-soft); font-variant-numeric:tabular-nums; }
    .nt-hint { font-size:12px; color:var(--ink-faint); }
    .nt-tile { width:100%; display:flex; gap:12px; align-items:center; text-align:left; padding:14px; border-radius:16px;
      background:var(--glass); border:1px solid var(--glass-border); }
    .nt-tile.done { border-color:rgba(255,212,121,.6); background:linear-gradient(135deg, rgba(255,212,121,.18), rgba(255,255,255,.05)); }
    .nt-ti { font-size:26px; } .nt-tile b { display:block; font-size:15px; } .nt-tile small { display:block; font-size:12px; color:var(--ink-soft); margin-top:3px; }
    .nt-tile em { margin-left:auto; font-style:normal; color:var(--gold); font-size:18px; }
    .nt-ex { font-size:17px; line-height:1.45; margin:0 0 10px; }
    .nt textarea, .nt input[type=date] { width:100%; background:rgba(0,0,0,.25); border:1px solid var(--glass-border); border-radius:10px;
      padding:9px; color:var(--ink); font:inherit; color-scheme:dark; }
    .nt-row { display:flex; gap:8px; margin-top:8px; }
    .nt-bars { display:flex; align-items:flex-end; gap:2px; height:70px; margin-top:10px; }
    .nt-bars i { flex:1; border-radius:2px 2px 0 0; min-width:3px; }
    .nt-life { width:100%; max-width:330px; display:block; margin:10px auto 0; }
    .nt-birth { display:flex; flex-direction:column; gap:8px; margin-top:12px; } .nt-birth label { font-size:13px; color:var(--ink-soft); }`;
  document.head.appendChild(css);
  root.QuestNight = { open };
})(window);
