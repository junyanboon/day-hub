/* Day Quest gym levels (Junyan, 2026-10-16, ticket 15 "Self-rated levels").
   Jack Woods' level table per move, from his video "How to turn fitness into an addictive video game":
   each level has a test, done on the first fresh rep of a set, and part range counts.
   - the Gym log shows each move's level, its plain name and the next level he is working towards;
   - d16: per move he logs the level trained, how the hardest set went and (optional) its reps, no reps/lbs grid;
   - d17: a weight box only on SLS from L4 (added kg) and NC at L7;
   - d18: a Test button per move, a pass is one level up;
   - d19, d20: body weight, weighed at the gym, in lbs, with the last few readings as a trend;
   - his quiz answers are the starting levels, saved once, never over a level he saved himself.
   The SAME file runs in the page (still/quest-levels.js) and on the server
   (still-api/src/quest-levels.js). Edit one, copy it to the other. */
(function (root) {
  "use strict";
  const LEVELS = {
    OAC: ["Two-arm hang", "One-arm hang", "Partial two-arm chin", "Full two-arm chin",
      "Partial one-arm negative", "Full one-arm negative", "Partial one-arm chin, going up"],
    SLS: ["Two-leg squat", "Single-leg negative", "Full single-leg squat, no weight", "10 kg", "20 kg", "30 kg", "40 kg"],
    NC: ["Hands do most of the work", "Hands help the whole way", "Hands help near the bottom", "Partial range, no hands",
      "Full negative, no hands", "No-hands positive", "Weighted"],
    PPU: ["Weight taken off (wall or incline)", "Leaning push-up", "Tuck", "Hips level with shoulders",
      "Legs extended, hips level", "Advanced tuck (90° at the hip)", "Full planche, some range"],
    HSPU: ["Weight taken off", "Pike push-up", "Feet-elevated pike", "Shoulder stand on straps",
      "Strap-assisted HSPU", "Some unassisted range", "Side-to-side HSPU"],
    FLR: ["Weight taken off", "Leaning row", "Tuck front lever row", "Hips level with shoulders",
      "Legs extended, hips level", "Advanced tuck", "Full front lever row, some range"],
  };
  // his own quiz answers, 2026-10-16 (ticket 15); the Oct 24 to 31 test week confirms or moves them
  const START = { OAC: 4, SLS: 5, NC: 3, PPU: 3, HSPU: 3, FLR: 2 };
  const START_FROM = "quiz";
  const TOP = 7;
  const EFFORT = [["full", "Full ✓"], ["part", "Part way"], ["help", "Needed help"]];

  const clamp = (n) => Math.min(TOP, Math.max(1, Math.round(+n) || 1));
  const name = (code, n) => (LEVELS[code] || [])[clamp(n) - 1] || "";
  const levelText = (code, n) => `L${clamp(n)} · ${name(code, n)}`;
  const nextText = (code, n) => (clamp(n) >= TOP ? "Top level" : `Next: L${clamp(n) + 1} · ${name(code, clamp(n) + 1)}`);
  // d17: weight only matters on SLS from L4 (the levels are added kg) and NC at L7 (weighted)
  const weightBox = (code, n) => ((code === "SLS" && clamp(n) >= 4) || (code === "NC" && clamp(n) === TOP) ? { unit: "kg" } : null);

  // one move in today's session: start (his level when it opened), level (after tests), trained (the progression he did)
  const startMove = (code, n) => ({ start: clamp(n), level: clamp(n), trained: clamp(n), effort: "", reps: "", kg: "", tests: [] });
  const testLevel = (x) => (x && x.level < TOP ? x.level + 1 : null);
  // d18: pass is one level up; "not yet" only records the attempt
  function recordTest(x, pass) {
    const t = testLevel(x);
    if (t == null) return x;
    const out = { ...x, tests: [...(x.tests || []), { level: t, pass: !!pass }] };
    if (pass) out.level = t;   // the level trained stays what he trained today; the next session starts at the new level
    return out;
  }
  // a plain positive number as typed on the phone ("6", "20", "172.4"); anything else is no number
  const num = (v) => { const t = v == null ? "" : String(v).trim(); return /^\d{1,4}(\.\d+)?$/.test(t) ? +t : null; };
  // what goes to the server for one move, or null when nothing was logged
  function toEntry(code, moveName, x) {
    if (!x) return null;
    const reps = num(x.reps), tests = x.tests || [];
    if (!x.effort && reps == null && !tests.length && x.level === x.start) return null;
    const kg = weightBox(code, x.trained) ? num(x.kg) : null;
    return { code, name: moveName, kind: "strength", level: x.level, levelName: name(code, x.level),
      trained: x.trained, trainedName: name(code, x.trained), effort: x.effort || null, reps, kg, tests: tests.map((t) => ({ ...t })),
      ...(x.legacy ? { legacy: x.legacy } : {}) };   // an old draft's four sets travel with it
  }

  /* The quiz levels, saved once. levels: { CODE: { level, at, from? } }. Any level already there is his and stays;
     missing ones are filled; the mark means it never runs again, so a move is never put back to the quiz level. */
  function seedLevels(levels, at) {
    const lv = { ...(levels && typeof levels === "object" ? levels : {}) };
    if (lv._seed) return { levels: lv, changed: false };
    for (const [c, n] of Object.entries(START)) if (!(lv[c] && lv[c].level)) lv[c] = { level: n, at, from: START_FROM };
    lv._seed = { from: START_FROM, at };
    return { levels: lv, changed: true };
  }

  /* Old shape (2026-10-05 to 10-16): reps and lbs, four boxes each (warm-up 1, 2, working 1, 2).
     New shape keeps the level, takes the best working set (else the best set) as the reps, turns lbs into kg
     where the level has a weight box, and keeps the old numbers under legacy so nothing is lost. */
  const isOld = (x) => !!x && Array.isArray(x.reps);
  const best = (arr) => { const v = (arr || []).map(num).filter((n) => n != null); return v.length ? Math.max(...v) : null; };
  function migrateEntry(x) {
    if (!isOld(x)) return x;
    const reps = best(x.reps.slice(2)) ?? best(x.reps);
    const lbs = best((x.lbs || []).slice(2)) ?? best(x.lbs);
    const lvl = x.level ? clamp(x.level) : null;
    const kg = lvl && x.code && weightBox(x.code, lvl) && lbs != null ? Math.round(lbs / 2.20462 * 2) / 2 : null;
    const { reps: _r, lbs: _l, ...rest } = x;
    return { ...rest, trained: lvl, reps, kg, effort: null, tests: [], legacy: { reps: x.reps.slice(), lbs: (x.lbs || []).slice() } };
  }
  const migrateSession = (w) => (w && Array.isArray(w.entries) ? { ...w, entries: w.entries.map(migrateEntry) } : w);
  // a draft kept on the phone (localStorage) in the old shape
  function migrateDraft(d, levels) {
    if (!d || !d.e) return d;
    const e = {};
    for (const [k, x] of Object.entries(d.e)) {
      if (!LEVELS[k] || !x || typeof x !== "object") { e[k] = x; continue; }
      if (!isOld(x)) {   // a draft in the new shape: keep it, with its levels kept in range
        e[k] = { ...startMove(k, x.start), ...x, start: clamp(x.start), level: clamp(x.level), trained: clamp(x.trained),
          tests: Array.isArray(x.tests) ? x.tests : [] };
        continue;
      }
      const lvl = clamp(x.level), b = best(x.reps.slice(2)) ?? best(x.reps), cur = x.start || (levels && levels[k] && levels[k].level) || lvl;
      e[k] = { start: clamp(cur), level: lvl, trained: lvl, effort: "", reps: b == null ? "" : String(b), kg: "", tests: [],
        legacy: { reps: x.reps.slice(), lbs: (x.lbs || []).slice() } };
    }
    return { ...d, e };
  }

  /* Body weight, lbs only (d20). One reading a day, the newest of the day wins. */
  const r1 = (n) => Math.round(n * 10) / 10;
  function parseLbs(v) {
    const n = num(v);
    return n != null && n >= 60 && n <= 500 ? r1(n) : null;
  }
  function addReading(list, date, lbs, at) {
    const out = (Array.isArray(list) ? list : []).filter((x) => x && x.date !== date);
    out.push({ date, lbs: r1(lbs), at });
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  // the server's list when it has one, else the readings saved with sessions
  function readingsFrom(list, sessions) {
    if (Array.isArray(list) && list.length) return list.map((x) => ({ date: x.date, lbs: x.lbs }));
    let out = [];
    for (const w of sessions || []) if (w && w.date && parseLbs(w.bodyWeightLbs) != null) out = addReading(out, w.date, w.bodyWeightLbs);
    return out.map((x) => ({ date: x.date, lbs: x.lbs }));
  }
  function bodyTrend(list, n) {
    const all = (list || []).filter((x) => x && parseLbs(x.lbs) != null);
    if (!all.length) return null;
    const recent = all.slice(-(n || 4)), last = recent[recent.length - 1];
    return { last, recent, change: r1(last.lbs - recent[0].lbs) };
  }
  function trendText(t) {
    if (!t) return "";
    const head = `${r1(t.last.lbs)} lbs`;
    if (t.recent.length < 2) return head;
    const dir = t.change < 0 ? `down ${r1(-t.change)}` : t.change > 0 ? `up ${t.change}` : "same";
    return `${head} · last ${t.recent.length}: ${t.recent.map((x) => r1(x.lbs)).join(", ")} (${dir})`;
  }

  root.QuestLevels = { LEVELS, START, TOP, EFFORT, levelText, nextText, weightBox, startMove, testLevel, recordTest, toEntry,
    seedLevels, migrateEntry, migrateSession, migrateDraft, parseLbs, addReading, readingsFrom, bodyTrend, trendText };
})(typeof self !== "undefined" ? self : globalThis);
