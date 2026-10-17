/* Day Quest Gym log: the programs and the compact move rows (Junyan, later 2026-10-16: "for Jack Woods, I don't know
   which exercise to do on which day yet so can we set it up so there's flexibility for me to choose whichever I feel
   like? ... it needs to be way more compact / collapsible").
   - One "Jack Woods" program holds all six moves; he opens whichever he does that day. Old drafts and saved sessions
     named "Jack Woods · Day 1" / "Day 2" open and count as Jack Woods.
   - Each move is one shut row: its name, "L3 → Next L4" and a ✓ once logged this session. Tapping opens the level
     stepper, how the hardest set went, reps, the weight box where it applies and Test. One row is open at a time;
     a move he does not touch stays shut and is not logged.
   Pure, so it can be tested (node --test still/test). The level rules are quest-levels.js. */
(function (root) {
  "use strict";
  const MOVE = { NC:"Nordic Hamstring Curl", OAC:"One-Arm Chin", SLS:"Single-Leg Squat", PPU:"Planche Push-Up", HSPU:"Handstand Push-Up", FLR:"Front Lever Rows" };
  const JW = "Jack Woods";
  const PROGRAMS = {
    [JW]: { strength:["NC","OAC","SLS","PPU","HSPU","FLR"], mobility:["Bridge","Pike","Butterfly","Front Split","Pancake","Handstand","V-sit"] },
    "Matthew I. Smith · Phase 1": { mis:[["Rolling Feet","90s per side","1-2"],["Calf Stretch, single-leg standing","90s","2-3"],
      ["Sciatic Nerve Ankle Joint Floss","8 reps · 3s up / 3s down","2-3"],["Hip Internal Rotation, lying","3 reps · 10s hold","2-3"],
      ["Pike Hang, standing B-stance","5 reps · contract 5s / relax 5s","2-3"]] },
    "Matthew I. Smith · Phase 2": { mis:[["Donkey Calf Stretch, single leg","90s","2-3"],["Your Pigeon Variation","30s","2-3"],
      ["Sciatic Nerve Knee Joint Floss","8 reps · 3-1-3-1","2-3"],["Hip Internal Rotation, seated","8 reps · 3s lift / 3s rest","2-3"],
      ["Pike Good Morning, standing round back","8 reps · 3-3-1-0","2-3"]] },
    "Matthew I. Smith · Phase 3": { mis:[["Knee Extension Calf Stretch, single leg","8 reps · 3s","2-3"],["Sciatic Nerve Ankle Joint Glide","6 reps · 3-1-3-1","2-3"],
      ["Pike Good Morning, leg elevated","8 reps · 2-3-1-0","2-3"],["Pike Active Lifts, seated single leg","5 reps · 1-1-1-5","2-3"]] },
  };
  // the old fixed days are Jack Woods now
  const programName = (p) => (/^Jack Woods\b/.test(String(p || "")) ? JW : p);
  // the program a gym block opens: Matthew I. Smith blocks open his phase for that date (ticket 15), anything else Jack Woods
  function programFor(title, ymd) {
    if (!/matthew|\bsmith\b|mobility|stretch/i.test(String(title || ""))) return JW;
    const d = String(ymd || "");
    return d >= "2027-04-04" ? "Matthew I. Smith · Phase 3" : d >= "2026-11-23" ? "Matthew I. Smith · Phase 2" : "Matthew I. Smith · Phase 1";
  }
  function newSession(LV, program, levels, bw, at) {
    const P = PROGRAMS[program] || PROGRAMS[JW], e = {};
    (P.strength || []).forEach((c) => { e[c] = LV.startMove(c, LV.currentLevel(levels, c)); });
    (P.mobility || []).forEach((m) => { e["m:" + m] = { done:false }; });
    (P.mis || []).forEach(([m]) => { e["mis:" + m] = { sets:0 }; });
    return { program: PROGRAMS[program] ? program : JW, e, bw: bw || "", at: at || new Date().toISOString() };
  }
  /* A saved draft brought up to now: the old Day 1 / Day 2 name becomes Jack Woods, its moves are kept (and brought up
     to his levels by LV.migrateDraft), and the moves the old day did not have are added fresh. null when unusable. */
  function fromDraft(LV, d, levels) {
    if (!d || typeof d !== "object" || !d.e) return null;
    const m = LV.migrateDraft({ ...d, program: programName(d.program) }, levels);
    if (!PROGRAMS[m.program]) return null;
    const fresh = newSession(LV, m.program, levels, m.bw, m.at);
    return { ...m, e: { ...fresh.e, ...m.e } };
  }
  const logged = (LV, x) => !!x && LV.touched(x);
  // the short line on a shut row: "L3 → Next L4", "L7 · top level"
  const shortLevel = (LV, x) => (x.level >= LV.TOP ? `L${x.level} · top level` : `L${x.level} → Next L${x.level + 1}`);

  /* One move. x: the move in today's session. open: this row is the open one. testing: its Test question is showing. */
  function moveHTML(LV, esc, c, x, open, testing) {
    const up = x.level > x.start, done = logged(LV, x);
    let h = `<div class="gmove${open ? " open" : ""}${done ? " done" : ""}" id="gm-${c}">
      <button class="grow" data-gopen="${c}" aria-expanded="${open}"><span class="gname">${esc(MOVE[c])}</span>
        <span class="glv${up ? " up" : ""}">${esc(shortLevel(LV, x))}${up ? " ⭐" : ""}</span><span class="gok" aria-label="${done ? "logged" : ""}">${done ? "✓" : ""}</span></button>`;
    if (!open) return h + `</div>`;
    const t = LV.testLevel(x), wb = LV.weightBox(c, x.trained), lastTest = (x.tests || []).slice(-1)[0];
    const eff = LV.EFFORT.map(([k, label]) => `<button class="gchip${x.effort === k ? " on" : ""}" data-eff="${c}" data-v="${k}" aria-pressed="${x.effort === k}">${label}</button>`).join("");
    const diff = x.trained < x.level ? " · easier" : x.trained > x.level ? " · harder" : "";
    h += `<div class="gbody"><div class="gnow">${esc(LV.levelText(c, x.level))}${up ? `<span class="gtag">New level</span>` : ""}</div>
      <div class="gnext">${esc(LV.nextText(c, x.level))}</div>
      <div class="gtr"><span class="gl"><button class="lv" data-tr="${c}" data-d="-1" aria-label="Train an easier level">−</button>
        <span class="lvn">L${x.trained}</span>
        <button class="lv" data-tr="${c}" data-d="1" aria-label="Train a harder level">+</button></span>
        <small>Trained: ${esc(LV.LEVELS[c][x.trained - 1])}${diff}</small></div>
      <div class="geff" aria-label="How the hardest set went">${eff}</div>
      <div class="gnums"><label>Reps <input class="set" data-reps="${c}" inputmode="numeric" placeholder="optional" value="${esc(x.reps)}" aria-label="${esc(MOVE[c])} reps on the hardest set"></label>
        ${wb ? `<label>+${wb.unit} <input class="set" data-kg="${c}" inputmode="decimal" placeholder="${wb.unit}" value="${esc(x.kg)}" aria-label="${esc(MOVE[c])} added weight in ${wb.unit}"></label>` : ""}
        ${t != null && !testing ? `<button class="btn small gtb" data-test="${c}">Test L${t}</button>` : ""}</div>`;
    if (t != null && testing)
      h += `<div class="gtest"><div class="gtest-q"><b>Test L${t} · ${esc(LV.LEVELS[c][t - 1])}</b><br>Do it on the first fresh rep of a set. Part range counts.
        <div class="actions"><button class="btn ghost small" data-tcancel="${c}">Back</button><button class="btn" data-tres="${c}" data-v="0">Not yet</button><button class="btn primary" data-tres="${c}" data-v="1">Passed ✓</button></div></div></div>`;
    if (lastTest) h += `<div class="gtest-h">${lastTest.pass ? `Passed L${lastTest.level} today. It saves with Finish and save.` : `Tried L${lastTest.level}: not yet. The try is saved with the session.`}</div>`;
    return h + `</div></div>`;
  }
  // every strength row of the session; openCode is the one open row (or none)
  function movesHTML(LV, esc, gym, openCode, testing) {
    const P = PROGRAMS[gym.program] || {};
    return (P.strength || []).map((c) => moveHTML(LV, esc, c, gym.e[c], openCode === c, testing === c)).join("");
  }
  // tapping a row: it opens and any other row shuts; tapping the open row shuts it
  const toggle = (openCode, c) => (openCode === c ? null : c);

  /* "How do you feel now?" (Junyan, 2026-10-17, d15 and d16; research: life-wiki answers/2026-10-17-strength-training-
     prana-and-body.md). One tap at Finish and save, and it is the only thing the gym log pays: "don't give any points for
     logging it". Body base points; gains are multiplied by the level's gainMult, losses are not. Wiped out also costs 1
     prana (d16). Good, a healthy tired, is the goal. Paid once per gym block: the answer is kept in G.day.mealq under
     feelKey with kind "gym", which syncs like a meal rating. */
  const FEEL = [
    { id:"energised", icon:"⚡", text:"Energised, light", b:2, p:0 },
    { id:"good", icon:"🙂", text:"Good, a healthy tired", b:1, p:0, goal:true },
    { id:"beat", icon:"😮‍💨", text:"Beat, but a good session", b:0, p:0 },
    { id:"wiped", icon:"🫠", text:"Wiped out, drained or foggy", b:-3, p:-1 },
  ];
  const gain = (v, mult) => (v > 0 ? Math.round(v * mult) : v);
  function feelPoints(id, mult) {
    const f = FEEL.find((x) => x.id === id);
    return f ? { b: gain(f.b, mult), p: gain(f.p, mult) } : null;
  }
  const feelKey = (blockKey, ymd) => "gym:" + (blockKey || ymd);
  // the points to pay now, or null: needs a logged move, an answer, and no answer already kept for this block
  function feelPay(mealq, key, id, moves, mult) {
    if (!moves || !id || (mealq && mealq[key])) return null;
    return feelPoints(id, mult);
  }
  const feelRecord = (id, pts, at) => ({ kind:"gym", feel:id, at, b:pts.b, p:pts.p });
  const ptsText = (pts) => [pts.b ? `${pts.b > 0 ? "+" : "−"}${Math.abs(pts.b)} body` : "", pts.p ? `${pts.p > 0 ? "+" : "−"}${Math.abs(pts.p)} prana` : ""].filter(Boolean).join(", ") || "0";
  function feelHTML(esc, sel, mult) {
    return `<div class="glabel">How do you feel now?</div><div class="gfeel">${FEEL.map((f) =>
      `<button class="gchip gf${sel === f.id ? " on" : ""}${f.goal ? " goal" : ""}" data-feel="${f.id}" aria-pressed="${sel === f.id}">${f.icon} ${esc(f.text)}<b>${esc(ptsText(feelPoints(f.id, mult)))}</b>${f.goal ? `<small>🎯 Aim for this most sessions</small>` : ""}</button>`).join("")}</div>`;
  }
  /* The existing recovery advice (recoveryReasons) gets one more reason: wiped out twice in 7 days, or once after a
     night under 70 (today or yesterday). days: G.days style, keyed by a date string, each { wiped, sleep }. */
  function wipedReason(days, today) {
    const t = Date.parse(today), recent = [];
    for (const [k, v] of Object.entries(days || {})) {
      const ago = Math.round((t - Date.parse(k)) / 86400000);
      if (v && +v.wiped > 0 && ago >= 0 && ago < 7) recent.push({ ago, n: +v.wiped, sleep: v.sleep });
    }
    const n = recent.reduce((a, x) => a + x.n, 0);
    if (n >= 2) return `wiped out after gym ${n} times this week, so a lighter session, Upa Yoga or rest`;
    if (recent.some((x) => x.ago <= 1 && typeof x.sleep === "number" && x.sleep < 70)) return "wiped out after gym on short sleep, so a lighter session, Upa Yoga or rest";
    return null;
  }

  root.QuestGymLog = { MOVE, JW, PROGRAMS, programName, programFor, newSession, fromDraft, logged, shortLevel, moveHTML, movesHTML, toggle,
    FEEL, feelPoints, feelKey, feelPay, feelRecord, feelHTML, wipedReason };
})(typeof window !== "undefined" ? window : globalThis);
