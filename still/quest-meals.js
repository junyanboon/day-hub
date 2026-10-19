/* Day Quest meal quiz: what goes in it and how it scores (Junyan, 2026-10-19, d3 and d4: "Everything needs
   to be directly connected to what I'm doing right now").
   - The quiz opens only from a meal block on the calendar ("Rate this meal" in its sheet). There is no free
     "Rate a meal" tile and no "How was <meal>?" button any more.
   - Three groups, in the meters' colours:
       Prana foods (gold): Sadhguru's positive pranic foods (fresh fruit, fresh vegetables, sprouts, nuts,
         honey), plus how he ate (fresh, light, with attention). They fill PRANA, not body.
       Body foods (teal): the Blueprint items, unchanged (same gains and daily limits, the quiz-flag habits in
         quest.html), and ultra-processed food takes some body.
       Drains (gold, minus): coffee or tea, onion or garlic, alcohol, leftover or reheated food, a heavy meal.
         They lower PRANA. Eating within 3 hours of bed and staying up past 11 stay automatic (the calendar and
         the Oura ring), never a tap.
   Pure, so it can be tested (node --test still/test). */
(function (root) {
  "use strict";
  // [id, icon, label, prana before the level multiplier]
  const PRANA_FOODS = [
    ["fruit", "🍎", "Fresh fruit", 2],
    ["fveg", "🥕", "Fresh vegetables, raw or just cooked", 2],
    ["sprouts", "🌱", "Sprouts", 2],
    ["pnuts", "🌰", "Nuts (soaked is best)", 1],
    ["honey", "🍯", "Honey", 1],
  ];
  // how he ate: still gold, still Sadhguru (kept from the 2026-10-10 quiz)
  const PRANA_WAYS = [
    ["fresh", "🌿", "Freshly made: cooked within 1.5 hr", 3],
    ["light", "🪶", "Stopped before full, light 30 min after", 2],
    ["attn", "🙏", "Ate with attention: a pause first, phone away", 2],
  ];
  // [id, icon, label, prana]; "heavy" takes the Heavy meal habit's own value (the page passes it in)
  const DRAINS = [
    ["coffee", "☕", "Coffee or tea", -3],
    ["neg", "🧄", "Onion or garlic", -3],
    ["alcohol", "🍷", "Alcohol", -5],
    ["stale", "🧊", "Leftover or reheated food", -2],
    ["heavy", "🥘", "Heavy, or ate too much", -5],
  ];
  // xylitol joined the body foods on 2026-10-19 (d11): one tick is one gram after the meal
  const BODY = ["blueprint", "protein", "legumes", "veg", "greens", "evoo", "nuts", "berries", "seeds", "ferment", "xylitol", "supps"];   // supplements after the meal (2026-10-19)
  const JUNK = ["junk", "🍟", "Ultra-processed, fried or added sugar", -3];
  const ONEOF = { fresh: "stale", stale: "fresh" };
  const FOOD_IDS = PRANA_FOODS.map((x) => x[0]);
  const DRAIN_IDS = DRAINS.map((x) => x[0]);
  // the automatic drains, named in the quiz so he knows they are counted without a tap
  const AUTO_NOTE = "Eating within 3 hours of bed and staying up past 11 count by themselves, from your calendar and your Oura ring.";

  // what one row is worth: gains grow with the level multiplier, drains never do
  function value(id, opt) {
    const o = opt || {}, mult = o.mult ?? 1;
    const row = PRANA_FOODS.concat(PRANA_WAYS, DRAINS).find((x) => x[0] === id);
    if (row) {
      if (id === "heavy" && typeof o.heavy === "number") return o.heavy;
      return row[3] > 0 ? Math.round(row[3] * mult) : row[3];
    }
    if (id === JUNK[0]) return JUNK[3];
    return o.bodyGain ? o.bodyGain(id) : 0;
  }
  // { p, b } for a set of ticks; opt = { mult, heavy, bodyGain(id) }
  function score(sel, opt) {
    let p = 0, b = 0;
    for (const id of FOOD_IDS.concat(PRANA_WAYS.map((x) => x[0]), DRAIN_IDS)) if (sel[id]) p += value(id, opt);
    for (const id of BODY) if (sel[id]) b += value(id, opt);
    if (sel[JUNK[0]]) b += JUNK[3];
    return { p, b };
  }
  // tick or untick one row; fresh and leftover cannot both be true
  function toggle(sel, id) {
    const s = { ...sel, [id]: !sel[id] };
    if (s[id] && ONEOF[id]) s[ONEOF[id]] = false;
    return s;
  }
  // pranic foods eaten and drains hit across a day's ratings (G.day.mealq), activity checks and gym feelings skipped
  function tally(mealq) {
    let foods = 0, drains = 0;
    for (const q of Object.values(mealq || {})) {
      if (!q || q.kind || !Array.isArray(q.sel)) continue;
      for (const id of q.sel) { if (FOOD_IDS.includes(id) || id === "pos") foods++;   // "pos": a pranic food in the quiz before 2026-10-19
        else if (DRAIN_IDS.includes(id)) drains++; }
    }
    return { foods, drains };
  }

  /* Pay as he taps (Junyan, 2026-10-19: one screen that IS the meal, no Confirm step). rec is the meal's record in
     G.day.mealq: { sel:[ids], v:{ id:[meter, paid] }, p, b }. A tap on a picked tile takes back exactly what it paid;
     fresh and leftover cannot both stand, so picking one takes the other back. Returns { rec, ops:[{ id, on, m, d }] }
     (m "p" or "b"); the page moves the meters by each d. A record from before (no v) takes back today's value. */
  const meterOf = (id) => (BODY.includes(id) || id === JUNK[0] ? "b" : "p");
  function tap(rec, id, opt) {
    const r = { sel: [...((rec && Array.isArray(rec.sel)) ? rec.sel : [])], v: { ...((rec && rec.v) || {}) }, p: +((rec && rec.p) || 0), b: +((rec && rec.b) || 0) };
    const ops = [];
    const off = (x) => {
      const i = r.sel.indexOf(x); if (i < 0) return;
      r.sel.splice(i, 1);
      const [m, d] = r.v[x] || [meterOf(x), value(x, opt)];
      delete r.v[x]; r[m] -= d;
      ops.push({ id: x, on: false, m, d: -d });
    };
    if (r.sel.includes(id)) off(id);
    else {
      if (ONEOF[id]) off(ONEOF[id]);
      const m = meterOf(id), d = value(id, opt);
      r.sel.push(id); r.v[id] = [m, d]; r[m] += d;
      ops.push({ id, on: true, m, d });
    }
    return { rec: r, ops };
  }

  root.QuestMeals = { PRANA_FOODS, PRANA_WAYS, DRAINS, BODY, JUNK, ONEOF, FOOD_IDS, DRAIN_IDS, AUTO_NOTE, value, score, toggle, tally, tap, meterOf };
})(typeof window !== "undefined" ? window : globalThis);
