/* Day Quest Gym Coach (Junyan, 2026-11-09: "I need exact instructions of how to do my exercises ... so precise that
   minute by minute I know what I'm doing while I'm at the gym"). Three views inside the Gym log:
   - Week: has the move been done this week (Mon to Sun), and the last few weeks' numbers;
   - Prep: the video, each chapter one tap away, and the rules in plain words to read before going;
   - Go: a running clock that walks the session step by step, then logs the set into the Gym log row.
   Move guides come from a video watched and broken down. One-Arm Chin is from Jack Woods, "How anyone can achieve a
   one-arm chinup in 3 minutes a week" (youtu.be/Q3dhtlOq8NE): one set a week, alternating arms, full range,
   assistance taken away until the lowering is forced. Nordic Curl, Handstand Push-Up, Planche Push-Up and Front Lever Row are from his videos 6AxkQmf-8lM, PwutudyK_1Y,
   qoaLWaaWyDM and JcS6_llzbBg (watched 2026-11-09). Single-Leg Squat has no video yet. Warm-ups marked "my addition" are not
   from the videos.
   Pure, so it can be tested (node --test still/test). */
(function (root) {
  "use strict";
  const VID = "Q3dhtlOq8NE";
  const at = s => `https://youtu.be/${VID}?t=${s}`;

  const GUIDES = {
    OAC: {
      code: "OAC", title: "One-Arm Chin", perWeek: 1,
      stopText: "you need a rest · you can't attack the next rep full effort · it stops being fun. Stopping early protects your elbows.",
      video: { url: `https://youtu.be/${VID}`, by: "Jack Woods", name: "One-arm chin-up in 3 minutes a week", len: "12:55",
        chapters: [[0, "0:00", "What this is"], [60, "1:00", "The setup: rings, feet, other hand"], [180, "3:00", "How hard: get to forced negatives"],
          [355, "5:55", "One set a week, alternate arms"], [525, "8:45", "Test rep and milestones"], [700, "11:40", "Biggest mistake: doing too much"]] },
      need: ["Gymnastics rings you can set low", "Chalk if the rings are slippery", "Your phone on this screen"],
      rules: [
        ["Once a week, one set", "The whole week's training for this move is one set, under 3 minutes. If it's already done this week, skip it today."],
        ["One rep = up AND down", "A rep is the full pull up (dead hang until your wrist touches your chest) and the full lowering back to a dead hang. Both halves, every rep, on each arm."],
        ["One continuous set", "Left rep (up and down), straight into right rep (up and down), straight back to left. Almost no break: a second or two to reset your grip is fine, a rest is not."],
        ["Full range, every rep", "Half reps only make you strong in that half. The middle to bottom of the rep is the hardest part; the top and the bottom are easier."],
        ["Help comes from two places", "Your feet on the floor take some weight. Your other hand on its ring takes some more. Use the feet first; if the other arm does too much it tires and the set ends early."],
        ["Change the help during the rep", "Give yourself a little more help through the hard middle-bottom and less at the easy top and bottom. Small changes: think 20 tiny steps, not 2 big ones."],
        ["Right hard: forced negatives", "Take help away until you can't stop yourself sinking on the way down and you get stuck on the way up. You're stronger lowering than lifting, so a lowering you can't hold is the heaviest work there is, and the proof you're at your limit."],
        ["Stop the set when any of these is true", "You need a rest. You can't attack the next rep with full effort. It stops being fun. More after that doesn't build strength, it eats recovery."],
        ["Stopping early protects your elbows", "The most common mistake is doing too much. Extra reps raise the risk of tendonitis and tennis elbow and make you less consistent week to week."],
        ["Test on the first rep of the week", "Your freshest rep is your strength test. Try your next milestone there, then do the set."],
        ["Stuck for 2 weeks or more?", "Check four things: too much volume, not hard enough, poor recovery (sleep), too little protein."],
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
        { s: 60, title: "Test rep (freshest rep of the week)", do: ["Try your next milestone once, with as little help as you can. Up and down both count, part range counts for the partial milestones.",
          "Tap Passed or Not yet below. Then shake out for 30 seconds."], test: true, cue: at(525) },
        { s: 180, title: "The one set (one continuous set)", set: true, do: [
          "One rep = up AND down. Left arm: dead hang, pull until the wrist touches the chest, lower all the way back to a dead hang (3 to 5 seconds down).",
          "Then straight into the right arm, up and down. Then left again. Count every rep per arm.",
          "Almost no break between reps: a second or two to reset your grip, never a rest.",
          "More help through the hard middle-bottom, less at the top and bottom. Feet first, other hand light.",
          "Each rep, take a tiny bit of help away until you sink on the way down and get stuck on the way up (a forced negative). Stay at that edge.",
          "Keep every rep full range, even when it gets hard."], stop: true, cue: at(355) },
        { s: 90, title: "Log it", log: true, do: ["Reps per arm, the hardest thing you did, and how it went.", "Then you're done with this move for the week."] },
      ],
    },
    NC: {
      code: "NC", title: "Nordic Curl", perWeek: 1,
      stopText: "Stop when you feel satisfied and don't want any more. That's the week.",
      video: { url: "https://youtu.be/6AxkQmf-8lM", by: "Jack Woods", name: "Build a Nordic curl from scratch in 2 minutes a week", len: "5:05",
        chapters: [[0, "0:00", "Why: knees, sprint, jump"], [49, "0:49", "Gear: heel anchor, knee pad"], [101, "1:41", "Mechanics: only the knee matters"], [186, "3:06", "One rep a week, full range"]] },
      need: ["Something heavy to hook your heels under (Nordic strap in a door, loaded barbell, fixed rack)", "A pad or folded mat for the knees", "Space to fall forward onto your hands"],
      rules: [
        ["Once a week, one rep", "The whole week is one full rep, a minute or two of grinding. When you feel satisfied and don't want more, you're done for the week."],
        ["Think only about the knee", "The move is the knee going from straight (body upright) to 90 degrees and back. Ignore what the upper body is doing."],
        ["Two ways to get help", "1) Fold at the hips (bend forward): shorter lever, less load on the knee. 2) Hands on the floor pushing you up. Near the top you can't reach the floor, so fold at the hips first, then add the hands."],
        ["Harder = less help", "Take the hands away and open the hips until your body is one straight line from knees to head."],
        ["Every degree is a grind", "On the way down, actively try to pull your heels to your butt and hold yourself up while your weight pries the knee open. You should be getting stuck and failing the whole way."],
        ["A rep only counts to the floor", "Lowering 45 degrees and calling it failure is the big mistake. Go all the way until your hips touch the floor, using as much help as you need."],
        ["Progress = more strength each week", "If your max goes up week to week you're on track. Keep coming back until the full Nordic."],
      ],
      milestones: [[1, "Hands do most of the work"], [2, "Hands help the whole way"], [3, "Hands help only near the bottom"], [4, "Part of the range with no hands"], [5, "Full negative, no hands"], [6, "Pull back up with no hands"], [7, "Weighted"]],
      steps: [
        { s: 60, title: "Set up the anchor", do: ["Heels hooked under the strap or bar, firm. Pull up on it once to check it holds.", "Pad under the knees. Kneel upright, hips straight."], cue: "https://youtu.be/6AxkQmf-8lM?t=49" },
        { s: 120, title: "Warm up (my addition, not in the video)", do: ["0:00 to 0:45 · 10 slow bodyweight good mornings or hip hinges.", "0:45 to 1:30 · 2 easy part-way Nordics, lots of hand help, only a little range.", "1:30 to 2:00 · Shake the legs out, kneel back in position."] },
        { s: 45, title: "Plan your help", do: ["Pick where you'll fold at the hips and where the hands come in.", "Rule: never stop the rep. If you're dropping too fast, fold more or push with the hands."], cue: "https://youtu.be/6AxkQmf-8lM?t=101" },
        { s: 150, title: "The one rep", set: true, stop: true, do: [
          "Start upright, straight line knees to head.",
          "Lower slowly. The whole time, try to pull your heels toward your butt and hold yourself up.",
          "When you start to fall: fold at the hips. Still falling: hands on the floor and push just enough to keep it a grind.",
          "Keep going until your hips touch the floor. That's the rep.",
          "If you have it in you, push back up with as little help as you can, grinding every inch."], cue: "https://youtu.be/6AxkQmf-8lM?t=186" },
        { s: 60, title: "Log it", log: true, do: ["The hardest thing you did and how it went.", "Done with this move for the week."] },
      ],
    },
    HSPU: {
      code: "HSPU", title: "Handstand Push-Up", perWeek: 1,
      stopText: "Stop when it stops being fun, or you can't push every inch at full effort. Have more? Make next week count more.",
      video: { url: "https://youtu.be/PwutudyK_1Y", by: "Jack Woods", name: "The fastest way to build strong shoulders at home", len: "12:05",
        chapters: [[0, "0:00", "What this is"], [46, "0:46", "Equipment"], [70, "1:10", "Goals and roadmap"], [192, "3:12", "Scaling down: the zero, full range"], [307, "5:07", "Scaling up: feet on box, then straps"], [545, "9:05", "One set a week"], [593, "9:53", "Measuring progress"], [660, "11:00", "Common mistakes"]] },
      need: ["Rings set low or parallettes (anything that lets your head go below your hands)", "A sturdy box, stool or chair for the feet", "Ring straps to hook the feet into, if you're there"],
      rules: [
        ["Once a week, one set", "One continuous set, max effort from rep 1, under 3 minutes. Brief pause between reps to breathe, and between up and down to check full range."],
        ["Full range", "Top: arms overhead, shoulders up by your ears. Bottom: shoulders touch the rings or bars. Every up and every down."],
        ["Hips stay up, always", "Scale by moving the FEET, never by dropping the hips. Torso stays steep (45 to 90 degrees to the floor) like a real handstand push-up."],
        ["Know your zero", "Standing on your feet with no weight on the arms, guiding a full-range rep. When tired, go back toward the zero so you can always hit full range."],
        ["The knob: weight on hands vs feet", "Floor feet (pike) → feet on a box → feet in the straps → less strap help → freestanding. More weight on the hands = harder."],
        ["Forced negatives", "Push up as hard as you can with a load heavy enough that you're forced down, failing every inch. On the way up: push, get stuck, step the feet down a level, never drop the hips."],
        ["Mistakes to avoid", "Not full range. Dropping the hips when it gets hard. Not adjusting so every inch is maximum."],
      ],
      milestones: [[1, "Pike, feet on floor, some weight on hands"], [2, "Pike push-up, full range"], [3, "Feet on the box (part of the range)"], [4, "Feet off at the bottom: shoulder stand"], [5, "Strap-assisted push from shoulder stand"], [6, "That range with no strap help"], [7, "Freestanding HSPU 🏆"]],
      steps: [
        { s: 60, title: "Set up", do: ["Rings low, or parallettes. Box behind you at a distance you can step onto.", "Check straps and buckles. Clear space to come down."], cue: "https://youtu.be/PwutudyK_1Y?t=46" },
        { s: 120, title: "Warm up (my addition) and practise the zero", do: ["0:00 to 0:45 · Wrist circles and arm circles.", "0:45 to 1:30 · 2 zero reps: standing, hands on rings, guide a full-range rep with no weight. Shoulders to ears at top, shoulders to rings at bottom.", "1:30 to 2:00 · 2 easy pike push-ups, hips high."], cue: "https://youtu.be/PwutudyK_1Y?t=192" },
        { s: 60, title: "Find your level on the way down", test: true, do: ["Elbows slightly bent, hips stacked over shoulders. Try your hardest foot position.", "Lower until you start being forced down. That's your level. Falling? Step down one level (straps → box → floor)."], cue: "https://youtu.be/PwutudyK_1Y?t=307" },
        { s: 180, title: "The one set (continuous)", set: true, stop: true, do: [
          "Each rep: from the top (shoulders by ears) lower to shoulders touching the rings, fighting the whole way, then push back up.",
          "Always be trying to push up. Hips stay stacked over the shoulders.",
          "Down: forced down slowly at your limit. Use the feet to catch and slow it if needed.",
          "Up: push, get stuck, step the feet down a level, keep pushing. Never drop the hips.",
          "Brief breath between reps. Short check at top and bottom that you hit full range."], cue: "https://youtu.be/PwutudyK_1Y?t=545" },
        { s: 60, title: "Log it", log: true, do: ["Which level you started rep 1 at (that's your weekly number), and how it went."], cue: "https://youtu.be/PwutudyK_1Y?t=593" },
      ],
    },
    PPU: {
      code: "PPU", title: "Planche Push-Up", perWeek: 1,
      stopText: "Stop when you need a break. That ends the week. One set only.",
      video: { url: "https://youtu.be/qoaLWaaWyDM", by: "Jack Woods", name: "How to build push-up strength insanely fast", len: "11:47",
        chapters: [[0, "0:00", "Intro"], [71, "1:11", "The goal: max pushing strength"], [113, "1:53", "The problem with push-ups"], [221, "3:41", "The fix: lean"], [324, "5:24", "How to do the rep"], [543, "9:03", "The protocol: once a week"]] },
      need: ["Floor space (rings or parallettes later)", "Nothing else"],
      rules: [
        ["Once a week, one set", "Continuous reps, as little rest between reps as you can, no set rep count. Under 3 minutes. Stop when you need a break."],
        ["The knob is lean", "How far your shoulders are ahead of your hands. Shoulders over hands = easy, far ahead = hard (planche push-up)."],
        ["Body position", "Plank, body rigid in a straight line, hips about level with shoulders (no sag, no pike), on your toes, elbows locked at the top."],
        ["Full range", "Bottom: chest AND hips touch the floor. Top: elbows locked."],
        ["Down: lean until forced down", "Bend the elbows slightly, lean forward until you start sinking. Push the ground away as hard as you can the whole time. Stuck? Lean more. Falling fast? Lean less."],
        ["Up: back off until you win", "Keep pushing at max. Same impossible spot? Lean back slightly until you start moving. Moving easily? Add lean until stuck again. Repeat to lockout."],
        ["Always be able to scale to zero", "Too hard or tired: bring a foot or knee forward to take weight off the hands, down to no weight at all. Never stop because it's too heavy."],
        ["Progress = lean on rep 1", "How far you can lean on your first, freshest rep. Go a bit further each week."],
      ],
      milestones: [[1, "Weight taken off (knee forward)"], [2, "Leaning push-up"], [3, "Tuck"], [4, "Hips level with shoulders"], [5, "Legs extended, hips level"], [6, "Advanced tuck"], [7, "Full planche push-up, some range 🏆"]],
      steps: [
        { s: 120, title: "Warm up (my addition)", do: ["0:00 to 0:45 · Wrist circles, palms flat rocks forward and back (wrists take a lot here).", "0:45 to 2:00 · 3 easy push-ups with a small lean, chest and hips to floor."] },
        { s: 60, title: "Test rep: how far can you lean?", test: true, do: ["Top of a plank, elbows slightly bent, lean forward as far as you can and still start a controlled lowering.", "Note it: hands at your hips? Your belly? That's this week's number."], cue: "https://youtu.be/qoaLWaaWyDM?t=324" },
        { s: 180, title: "The one set (continuous)", set: true, stop: true, do: [
          "Down: lean until you start being forced down, push the ground away as hard as possible. Stuck → lean more. Too fast → lean less. Inch down until chest and hips touch.",
          "Up: push at max. Stuck at the same spot → lean back a little until you win. Moving easily → add lean. Lock the elbows at the top.",
          "Straight into the next rep, as little rest as you can. Each rep is weaker, so lean less each time.",
          "Too tired? Bring a knee forward to take weight off rather than stopping."], cue: "https://youtu.be/qoaLWaaWyDM?t=543" },
        { s: 60, title: "Log it", log: true, do: ["How far you leaned on rep 1, reps, and how it went."] },
      ],
    },
    FLR: {
      code: "FLR", title: "Front Lever Row", perWeek: 1,
      stopText: "Stop as soon as you can't pull as hard as possible. Short and sweet: one or two intense reps.",
      video: { url: "https://youtu.be/JcS6_llzbBg", by: "Jack Woods", name: "You're not rowing hard enough", len: "8:27",
        chapters: [[0, "0:00", "Intro"], [22, "0:22", "Why normal rows don't work"], [351, "5:51", "How to do it"], [436, "7:16", "Easier, harder, tuck"], [464, "7:44", "Once a week, one set"]] },
      need: ["Gymnastic rings (or TRX, table edge, sturdy bar)", "Check the anchor: you fail the lowering on purpose"],
      rules: [
        ["Once a week, one set", "One or two intense reps. Stop as soon as you can't pull as hard as possible."],
        ["Pull as hard as possible at every point", "The load has to change through the rep so every inch is a max. Rows that don't make you red in the face do nothing."],
        ["The knob: push your hands away", "Push the rings toward your feet. Your shoulders move the other way, so the lever gets longer and harder. You can change it mid-rep."],
        ["Down: forced down", "From the top, keep rowing the elbows down and keep your body where it is, while pushing the hands away until you lose control and sink. Fight until arms are locked straight."],
        ["Up: slightly easier", "Ease the hand push a little so you can still move, but keep pulling as hard as possible every inch. Whole rep slow."],
        ["Full range", "Arms fully locked at the bottom, to the top of the row."],
        ["Levels", "Feet walked back (easier) → feet on floor, hands pushed out → hands pushed far enough that the feet lift off (first goal) → knees to chest: tuck front lever row → full front lever."],
      ],
      milestones: [[1, "Feet walked back, weight off"], [2, "Leaning row, hands pushed out"], [3, "Feet off: tuck front lever row"], [4, "Hips level with shoulders"], [5, "Legs extended, hips level"], [6, "Advanced tuck"], [7, "Full front lever row 🏆"]],
      steps: [
        { s: 60, title: "Set up", do: ["Rings at about hip height, straps and anchor checked.", "Feet flat, knees bent, lean back with arms straight."], cue: "https://youtu.be/JcS6_llzbBg?t=351" },
        { s: 90, title: "Warm up (my addition)", do: ["0:00 to 0:45 · 8 scap pulls in the row position: arms straight, squeeze the shoulder blades together and back.", "0:45 to 1:30 · 3 easy rows, body upright, half effort."] },
        { s: 150, title: "The one set (1 or 2 reps)", set: true, stop: true, test: true, do: [
          "Pull to the top of a row.",
          "Hold the top: keep rowing the elbows down, keep your body where it is.",
          "Push your hands away toward your feet until you lose control and sink. Keep rowing the elbows down the whole way to locked arms.",
          "Up: ease the push slightly so you can move, still pulling as hard as possible every inch. Slow.",
          "Can lift the feet? Do it, knees to chest (tuck). Stuck? Walk the feet back."], cue: "https://youtu.be/JcS6_llzbBg?t=436" },
        { s: 60, title: "Log it", log: true, do: ["Hardest position you held and how it went.", "Other pull days: pull-ups, not more rows."], cue: "https://youtu.be/JcS6_llzbBg?t=464" },
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
    return h + `</table>${g.code === "OAC" ? `<p class="gnote">Getting stuck for 2 weeks or more? The video says check: too many reps, not hard enough, poor sleep, or too little protein.</p>` : ""}`;
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
    if (st.stop) h += `<div class="gc-stop"><b>Stop:</b> ${esc(g.stopText)}</div>`;
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
    return `<div class="gc"><div class="gc-top"><b>🎯 Coach · ${esc(g.title)}</b><button class="btn ghost small" data-gcclose>${ctx.page ? "Open Gym log to save" : "Back to log"}</button></div>
      <div class="gchips gc-tabs">${tabs}</div>${body}</div>`;
  }

  root.QuestGymCoach = { GUIDES, guide, totalSec, elapsed, stepAt, startOf, act, applyLog, weekStatus, mondayOf, html, mmss };
})(typeof window !== "undefined" ? window : globalThis);
