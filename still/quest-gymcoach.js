/* Day Quest Gym Coach (Junyan, 2026-11-09: "I need exact instructions of how to do my exercises ... so precise that
   minute by minute I know what I'm doing while I'm at the gym"). Three views inside the Gym log:
   - Week: has the move been done this week (Mon to Sun), and the last few weeks' numbers;
   - Prep: the video, each chapter one tap away, and the rules in plain words to read before going;
   - Go: a running clock that walks the session step by step, then logs the set into the Gym log row.
   Move guides come from a video watched and broken down. One-Arm Chin is from Jack Woods, "How anyone can achieve a
   one-arm chinup in 3 minutes a week" (youtu.be/Q3dhtlOq8NE): one set a week, alternating arms, full range,
   assistance taken away until the lowering is forced. The other moves get a guide when their video is broken down.
   Pure, so it can be tested (node --test still/test). */
(function (root) {
  "use strict";
  const VID = "Q3dhtlOq8NE";
  const at = s => `https://youtu.be/${VID}?t=${s}`;

  const GUIDES = {
    OAC: {
      code: "OAC", title: "One-Arm Chin", perWeek: 1,
      video: { url: `https://youtu.be/${VID}`, by: "Jack Woods", name: "One-arm chin-up in 3 minutes a week", len: "12:55",
        chapters: [[0, "0:00", "What this is"], [60, "1:00", "The setup: rings, feet, other hand"], [180, "3:00", "How hard: get to forced negatives"],
          [355, "5:55", "One set a week, alternate arms"], [525, "8:45", "Test rep and milestones"], [700, "11:40", "Biggest mistake: doing too much"]] },
      need: ["Gymnastics rings you can set low", "Chalk if the rings are slippery", "Your phone on this screen"],
      rules: [
        ["Once a week, one set", "The whole week's training for this move is one set, under 3 minutes. If it's already done this week, skip it today."],
        ["Full range, every rep", "Start from a dead hang (arm straight) and pull until your wrist touches your chest, then lower all the way. Half reps only make you strong in that half."],
        ["Help comes from two places", "Your feet on the floor take some weight. Your other hand on its ring takes some more. Use the feet first; the other arm tires if it does too much."],
        ["Right hard, not wrong hard", "Take help away a little each rep until you can't stop yourself sinking on the way down and you get stuck on the way up. That's your limit, and that's where you train."],
        ["Alternate arms every rep", "Left, right, left, right. Short pauses to reset your grip are fine. No resting."],
        ["Stop the set when any of these is true", "You need a rest. You can't attack the next rep with full effort. It stops being fun."],
      ],
      milestones: [[3, "Partial two-arm chin"], [4, "Full two-arm chin"], [5, "Part of a one-arm negative, controlled"],
        [6, "Full one-arm negative, controlled"], [7, "Partial one-arm chin, going up"], [8, "Full one-arm chin 🏆"]],
      // the session, second by second; t is where the step starts
      steps: [
        { s: 60, title: "Set the rings", do: ["Rings low: hanging with a straight arm, your feet stay flat on the floor.",
          "Stand under them, both hands on the rings, chalk if you have it."], cue: at(60) },
        { s: 180, title: "Warm up", do: ["0:00 to 0:30 · Arm circles, both ways.", "0:30 to 1:15 · 8 scap pulls: two-arm hang, pull your shoulders down without bending the arms.",
          "1:15 to 2:15 · 5 easy two-arm chins or ring rows, half effort.", "2:15 to 3:00 · 1 easy one-arm rep each arm, lots of help from the feet."] },
        { s: 90, title: "Find your help level", do: ["One rep left, one rep right.", "Feet take most of the help. Other hand rests lightly on its ring.",
          "Goal: it feels hard but you can still do it. Remember how much help that was."], cue: at(180) },
        { s: 60, title: "Test rep (freshest rep of the week)", do: ["Try your next milestone once, with as little help as you can.",
          "Tap Passed or Not yet below. Then shake out for 30 seconds."], test: true, cue: at(525) },
        { s: 180, title: "The one set", set: true, do: ["Left, right, left, right. Count the reps.",
          "Each rep: dead hang, pull until the wrist touches the chest, lower slowly (3 to 5 seconds).",
          "Each rep, take a little help away (less leg, lighter other hand) until you sink on the way down and get stuck on the way up. Stay at that edge.",
          "Short grip resets are fine. No rests."], stop: true, cue: at(355) },
        { s: 90, title: "Log it", log: true, do: ["Reps per arm, the hardest thing you did, and how it went.", "Then you're done with this move for the week."] },
      ],
    },
  };
  const guide = code => GUIDES[code] || null;
  const totalSec = g => g.steps.reduce((n, x) => n + x.s, 0);
  const mmss = n => `${Math.floor(Math.max(0, n) / 60)}:${String(Math.floor(Math.max(0, n) % 60)).padStart(2, "0")}`;

  // where the clock is. c: { started (ms), paused (ms, while paused), skip (seconds added by Next / taken by Back) }
  function elapsed(c, nowMs) {
    if (!c || !c.started) return 0;
    return Math.max(0, ((c.paused || nowMs) - c.started) / 1000 + (c.skip || 0));
  }
  // which step a moment falls in: { i, into, left, startAt }; past the end stays on the last step
  function stepAt(g, sec) {
    let t = 0;
    for (let i = 0; i < g.steps.length; i++) {
      const s = g.steps[i].s;
      if (sec < t + s || i === g.steps.length - 1) return { i, into: sec - t, left: t + s - sec, startAt: t };
      t += s;
    }
    return { i: 0, into: 0, left: 0, startAt: 0 };
  }
  const startOf = (g, i) => g.steps.slice(0, i).reduce((n, x) => n + x.s, 0);

  // Monday of a ymd
  const addDays = (ymd, n) => new Date(Date.parse(ymd + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  const mondayOf = ymd => addDays(ymd, -((new Date(Date.parse(ymd + "T12:00:00Z")).getUTCDay() + 6) % 7));

  /* The week view. sessions: [{ day, entries }] (saved ones, newest first); todayX: today's draft move (or null), today:
     the game day. Returns { done, doneOn, weeks:[{ monday, day, reps, level, effort }] } with this week first. */
  function weekStatus(code, sessions, todayX, today, touched) {
    const rows = [];
    (sessions || []).forEach(w => (w.entries || []).forEach(e => { if (e && e.code === code && w.day) rows.push({ day: w.day, reps: e.reps, level: e.trained || e.level, effort: e.effort }); }));
    if (todayX && touched && touched(todayX)) rows.unshift({ day: today, reps: todayX.reps, level: todayX.trained, effort: todayX.effort, now: true });
    const thisMon = mondayOf(today), weeks = [];
    for (let k = 0; k < 6; k++) {
      const m = addDays(thisMon, -7 * k), hit = rows.filter(r => mondayOf(r.day) === m).sort((a, b) => (a.day < b.day ? 1 : -1))[0];
      weeks.push({ monday: m, ...(hit || {}) });
    }
    const cur = weeks[0];
    return { done: !!cur.day, doneOn: cur.day || null, weeks };
  }

  const EFF = { full: "Full ✓", part: "Part way", help: "Needed help" };
  const dayName = ymd => new Date(Date.parse(ymd + "T12:00:00Z")).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

  function weekHTML(esc, g, st, LV) {
    const days = [];
    const mon = st.weeks[0].monday;
    for (let i = 0; i < 7; i++) { const d = addDays(mon, i); days.push(`<span class="gc-d${st.doneOn === d ? " on" : ""}">${"MTWTFSS"[i]}</span>`); }
    let h = `<div class="gc-wk">${days.join("")}</div>
      <p class="gc-big">${st.done ? `✅ Done this week (${esc(dayName(st.doneOn))}). Skip ${esc(g.title)} until Monday.` : `⬜ Not done this week. Today is a good day for the one set.`}</p>
      <div class="glabel">Last 6 weeks</div><table class="gc-tab"><tr><th>Week of</th><th>Hardest</th><th>Reps</th><th>How</th></tr>`;
    st.weeks.forEach((w, k) => { h +=`<tr><td>${esc(dayName(w.monday))}</td><td>${w.day ? esc(w.level ? `L${w.level} ${LV ? LV.LEVELS[g.code][Math.min(7, w.level) - 1] : ""}` : "?") : "·"}</td><td>${w.day && w.reps != null && w.reps !== "" ? esc(String(w.reps)) : "·"}</td><td>${w.day ? esc(EFF[w.effort] || "") : k ? "missed" : "not yet"}</td></tr>`; });
    return h + `</table><p class="gnote">Getting stuck for 2 weeks or more? The video says check: too many reps, not hard enough, poor sleep, or too little protein.</p>`;
  }

  function prepHTML(esc, g) {
    let h = `<a class="btn primary gc-vid" href="${esc(g.video.url)}" target="_blank" rel="noopener">▶ Watch the video (${esc(g.video.len)})</a>
      <div class="glabel">Jump to a part</div><div class="gc-ch">${g.video.chapters.map(([s, t, n]) => `<a href="${esc(at(s))}" target="_blank" rel="noopener"><b>${t}</b> ${esc(n)}</a>`).join("")}</div>
      <div class="glabel">The rules</div><ol class="gc-rules">${g.rules.map(([a, b]) => `<li><b>${esc(a)}.</b> ${esc(b)}</li>`).join("")}</ol>
      <div class="glabel">Milestones, in order</div><ol class="gc-rules">${g.milestones.map(([, n]) => `<li>${esc(n)}</li>`).join("")}</ol>
      <div class="glabel">Bring</div><ul class="gc-rules">${g.need.map(n => `<li>${esc(n)}</li>`).join("")}</ul>
      <div class="glabel">The plan at the gym</div><ol class="gc-plan">`;
    let t = 0;
    g.steps.forEach(x => { h += `<li><b>${mmss(t)} to ${mmss(t + x.s)}</b> ${esc(x.title)}</li>`; t += x.s; });
    return h + `</ol>`;
  }

  /* The Go view. c: the clock, x: today's move in the Gym log, nowMs. Buttons carry data-gc="start|pause|next|back|reset",
     data-gcreps / data-gceff / data-gcmile for the log step and data-gctest for the test rep. */
  function goHTML(esc, g, c, x, nowMs, LV) {
    const sec = elapsed(c, nowMs), p = stepAt(g, sec), st = g.steps[p.i], run = c && c.started && !c.paused, end = totalSec(g);
    const steps = g.steps.map((s, i) => `<span class="gc-dot${i < p.i ? " past" : i === p.i && c && c.started ? " now" : ""}"></span>`).join("");
    let h = `<div class="gc-clock"><div class="gc-t" id="gcT">${mmss(sec)}<small> / ${mmss(end)}</small></div><div class="gc-dots">${steps}</div></div>`;
    if (!c || !c.started) {
      return h + `<p class="gc-big">${g.steps.length} steps, about ${Math.round(end / 60)} minutes. The clock moves you along; tap Next when you're ahead.</p>
        <div class="actions"><button class="btn primary" data-gc="start">▶ Start</button></div>`;
    }
    h += `<div class="gc-step"><div class="gc-h"><span>Step ${p.i + 1} of ${g.steps.length}</span><span id="gcL">${mmss(p.left)} left</span></div>
      <h4>${esc(st.title)}</h4><ul>${st.do.map(d => `<li>${esc(d)}</li>`).join("")}</ul>`;
    if (st.cue) h += `<a class="gc-cue" href="${esc(st.cue)}" target="_blank" rel="noopener">▶ See this part of the video</a>`;
    if (st.stop) h += `<div class="gc-stop"><b>Stop the set when:</b> you need a rest · you can't attack the next rep full effort · it stops being fun.</div>`;
    if (st.test && x && LV) {
      const t = LV.testLevel(x), last = (x.tests || []).slice(-1)[0];
      h += t == null ? `<p class="gnote">You're at the top level in the log.</p>`
        : `<div class="gc-test"><b>Try L${t} · ${esc(LV.LEVELS[g.code][t - 1])}</b>
          <div class="actions"><button class="btn" data-gctest="0">Not yet</button><button class="btn primary" data-gctest="1">Passed ✓</button></div>
          ${last ? `<small>${last.pass ? `Passed L${last.level}` : `Tried L${last.level}: not yet`}. Saved with Finish and save.</small>` : ""}</div>`;
    }
    if (st.log && x) {
      const lr = x.coach || {};
      h += `<div class="gnums"><label>Left reps <input class="set" data-gcreps="l" inputmode="numeric" value="${esc(lr.l || "")}"></label>
        <label>Right reps <input class="set" data-gcreps="r" inputmode="numeric" value="${esc(lr.r || "")}"></label></div>
        <div class="glabel">Hardest thing you did</div><div class="gchips">${g.milestones.filter(([n]) => n <= 7).map(([n, name]) =>
          `<button class="gchip${x.trained === n ? " on" : ""}" data-gcmile="${n}">${esc(name)}</button>`).join("")}</div>
        <div class="glabel">How the set went</div><div class="geff">${Object.entries(EFF).map(([k, v]) =>
          `<button class="gchip${x.effort === k ? " on" : ""}" data-gceff="${k}">${v}</button>`).join("")}</div>
        <p class="gnote">This fills the ${esc(g.title)} row. Tap Finish and save at the bottom of the Gym log when you're done.</p>`;
    }
    h += `</div><div class="actions gc-ctl"><button class="btn ghost small" data-gc="back">‹ Back</button>
      <button class="btn small" data-gc="${run ? "pause" : "start"}">${run ? "⏸ Pause" : "▶ Resume"}</button>
      <button class="btn primary small" data-gc="next">Next ›</button></div>
      <p class="gnote"><button class="btn ghost small" data-gc="reset">Start over</button></p>`;
    return h;
  }

  // clock changes, pure: returns the new clock
  function act(g, c, what, nowMs) {
    c = { ...(c || {}) };
    if (what === "start") { if (!c.started) return { started: nowMs, skip: 0 }; if (c.paused) { c.started += nowMs - c.paused; delete c.paused; } return c; }
    if (what === "pause") { if (c.started && !c.paused) c.paused = nowMs; return c; }
    if (what === "reset") return {};
    if (!c.started) c = { started: nowMs, skip: 0, paused: nowMs };
    const sec = elapsed(c, nowMs), p = stepAt(g, sec);
    const to = what === "next" ? Math.min(g.steps.length - 1, p.i + 1) : (p.into > 5 ? p.i : Math.max(0, p.i - 1));
    c.skip = (c.skip || 0) + (startOf(g, to) - sec);
    return c;
  }
  // the log step writes into the Gym log row: total reps, the level trained, how it went
  function applyLog(x, field, v) {
    x = { ...x, coach: { ...(x.coach || {}) } };
    if (field === "l" || field === "r") {
      x.coach[field] = String(v).trim();
      const n = ["l", "r"].map(k => parseInt(x.coach[k], 10)).filter(n => n >= 0);
      x.reps = n.length ? String(n.reduce((a, b) => a + b, 0)) : "";
    } else if (field === "mile") x.trained = Math.min(7, Math.max(1, +v));
    else if (field === "eff") x.effort = x.effort === v ? "" : v;
    return x;
  }

  function html(esc, code, view, ctx) {
    const g = guide(code); if (!g) return "";
    const tabs = [["week", "📅 Week"], ["prep", "📺 Prep"], ["go", "⏱ Go"]].map(([k, n]) => `<button class="gchip${view === k ? " on" : ""}" data-gcv="${k}">${n}</button>`).join("");
    const body = view === "prep" ? prepHTML(esc, g) : view === "go" ? goHTML(esc, g, ctx.clock, ctx.x, ctx.now, ctx.LV) : weekHTML(esc, g, ctx.week, ctx.LV);
    return `<div class="gc"><div class="gc-top"><b>🎯 Coach · ${esc(g.title)}</b><button class="btn ghost small" data-gcclose>Back to log</button></div>
      <div class="gchips gc-tabs">${tabs}</div>${body}</div>`;
  }

  root.QuestGymCoach = { GUIDES, guide, totalSec, elapsed, stepAt, startOf, act, applyLog, weekStatus, mondayOf, html, mmss };
})(typeof window !== "undefined" ? window : globalThis);
