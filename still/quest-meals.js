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
   2026-10-20 (Junyan, d12 to d16, "Fill the Plate"):
     - How he ate is tips, not points (d15): the three PRANA_WAYS tiles left the sheet and their words became the "How to eat"
       box (TIPS). PRANA_WAYS stays here only so a meal rated before today still names and takes back what it paid; those
       past points stay. Leftover no longer takes back a "Freshly made" from before, since fresh can no longer be tapped.
     - Blueprint dishes (d13): Super Veggie and Nutty Pudding (DISHES) and tonight's three recipes for 2 people (IDEAS) are
       checklists. A dish pays body as its ingredients are ticked, its share of the Blueprint meal's value (6, times the
       level multiplier: +9 at level 1), each dish on its own. Super Veggie has no garlic (d12: garlic is a Drain).
     - Supplements, fermented food and xylitol moved to the water card (d16, quest-water.js DAY3). blueprint, ferment,
       xylitol and supps left BODY; LEGACY_BODY keeps their meter for records from before.
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
  // how he ate (2026-10-10 quiz): no longer tiles (2026-10-20, d15). Kept so an older record names and values them.
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
  // shorter words on the compact tiles (2026-10-20); the trends keep the full labels above
  const SHORT = { fveg: "Fresh veg, raw or just cooked", pnuts: "Nuts (soaked)", stale: "Leftover or reheated" };
  const tileLabel = (row) => SHORT[row[0]] || row[2];
  // the "How to eat" box at the top of the meal (2026-10-20, d15): [icon, words]; tips, no points
  const TIPS = [
    ["🌿", "Eat it fresh, within 1.5 hours of cooking."],
    ["🙏", "Sit two minutes before the first bite, phone face down."],
    ["🪶", "Stop before full. You should feel light 30 minutes after."],
  ];
  // the body food tiles (2026-10-20, d16): the Blueprint dishes have their own checklists, and supplements, fermented
  // food and xylitol are on the water card, so those four left this list. Same values and daily limits as before.
  const BODY = ["protein", "legumes", "veg", "greens", "evoo", "nuts", "berries", "seeds"];
  const LEGACY_BODY = ["blueprint", "ferment", "xylitol", "supps"];   // tiles before 2026-10-20: still body in old records
  const JUNK = ["junk", "🍟", "Ultra-processed or fried", -3];
  // fresh is a tip now (d15), so nothing is one-of any more; toggle and tap keep the hook for a pair that comes back
  const ONEOF = {};

  /* The Blueprint dishes and tonight's ideas (2026-10-20, d13). { id, icon, name, items:[[ingredient, amount for 2]],
     time?, how? }. A dish pays up to the Blueprint meal's value (DISH_VALUE times the level multiplier), in proportion
     to the ingredients ticked. Super Veggie has no garlic (d12). */
  const DISH_VALUE = 6;   // the "blueprint" habit's value in quest.html, used when the page passes none (opt.dish)
  /* 2026-10-21 (Junyan: "I currently only consume 350g of broccoli and cauliflower for the two of us"): Super Veggie's
     broccoli and cauliflower are 350 g together, 175 g each (was 500 g and 300 g). Points never depended on amounts, so
     past meals keep what they paid. These amounts are what a tick takes off the kitchen (quest-kitchen.js eat). */
  const DISHES = [
    { id: "sv", icon: "🥗", name: "Super Veggie", items: [
      ["Black lentils, dry", "90 g"], ["Broccoli", "175 g"], ["Cauliflower", "175 g"], ["Shiitake mushrooms", "100 g"],
      ["Fresh ginger, grated", "2 tbsp"], ["Lime", "1"], ["Ground cumin", "2 tsp"], ["Apple cider vinegar", "2 tbsp"],
      ["Hemp seeds", "4 tbsp"], ["Extra virgin olive oil", "30 ml"]] },
    { id: "np", icon: "🍮", name: "Nutty Pudding", items: [
      ["Macadamia milk", "240 ml"], ["Macadamia nuts, ground", "4 tbsp"], ["Walnuts", "2 tbsp"], ["Brazil nuts", "2"],
      ["Chia seeds", "2 tbsp"], ["Ground flaxseed", "2 tbsp"], ["Sunflower lecithin", "2 tsp"], ["Cocoa powder", "2 tbsp"],
      ["Cinnamon", "½ tsp"], ["Pomegranate juice", "120 ml"], ["Blueberries", "100 g"], ["Cherries", "100 g"]] },
  ];
  /* Tonight's ideas, for 2 people. Since 2026-10-21 (d41) the page shows three a day picked from what is in the kitchen
     (quest-ideas.js, whose pool starts with these three, same ids); this list is what shows when that module is not
     loaded. Ids must stay unique across the pool. */
  const IDEAS = [
    { id: "r1", icon: "🫘", name: "Lentil bowl with roasted peppers", time: "35 min", items: [
      ["Green or brown lentils, dry", "140 g"], ["Red peppers", "2"], ["Courgette", "1 medium"], ["Baby spinach", "100 g"],
      ["Extra virgin olive oil", "30 ml"], ["Lemon", "1"], ["Ground cumin", "1 tsp"], ["Smoked paprika", "1 tsp"],
      ["Fresh parsley", "20 g"], ["Almonds, soaked", "30 g"]],
      how: "Simmer the lentils 20 min. Roast the peppers and courgette at 220°C for 25 min. Wilt the spinach into the hot lentils, then top with veg, lemon, oil, parsley and almonds." },
    { id: "r2", icon: "🍲", name: "Chickpea and spinach stew", time: "30 min", items: [
      ["Chickpeas, cooked", "400 g"], ["Spinach", "200 g"], ["Tomatoes", "3 medium"], ["Carrot", "1"],
      ["Extra virgin olive oil", "30 ml"], ["Smoked paprika", "1 tsp"], ["Ground cumin", "1 tsp"], ["Saffron", "a pinch"],
      ["Sherry vinegar", "1 tbsp"], ["Pumpkin seeds", "30 g"]],
      how: "Soften the grated carrot in oil, add the spices and chopped tomatoes for 10 min, then the chickpeas and saffron for 10 more. Fold in the spinach, finish with vinegar and seeds." },
    { id: "r3", icon: "🥦", name: "Quinoa, broccoli and white beans", time: "25 min", items: [
      ["Quinoa, dry", "150 g"], ["White beans, cooked", "300 g"], ["Broccoli", "400 g"], ["Rocket", "80 g"],
      ["Cherry tomatoes", "150 g"], ["Tahini", "2 tbsp"], ["Lemon", "1"], ["Extra virgin olive oil", "30 ml"], ["Hemp seeds", "2 tbsp"]],
      how: "Cook the quinoa 15 min. Steam the broccoli 5 min. Whisk tahini, lemon, oil and a little water. Toss everything with the beans, rocket and tomatoes, top with hemp seeds." },
  ];
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
  const meterOf = (id) => (BODY.includes(id) || LEGACY_BODY.includes(id) || id === JUNK[0] || String(id).startsWith("dish:") ? "b" : "p");
  function tap(rec, id, opt) {
    const r = { ...(rec || {}), sel: [...((rec && Array.isArray(rec.sel)) ? rec.sel : [])], v: { ...((rec && rec.v) || {}) }, p: +((rec && rec.p) || 0), b: +((rec && rec.b) || 0) };   // keeps the dish ticks (2026-10-20)
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

  /* Dish checklists (2026-10-20, d13). The ticks live on the meal's record beside the tiles: rec.dish = { <dish id>:
     [ingredient names] }, and what the dish paid in rec.v["dish:<id>"] = ["b", paid]. So they save, sync and merge
     exactly as the tiles do (G.day.mealq, one record per meal). Ingredients are kept by name, so a later change to a list
     never ticks the wrong row. */
  const ALL_DISHES = DISHES.concat(IDEAS);
  /* a dish by id: the Blueprint dishes and the ideas, and (2026-10-21, d41) any idea of the kitchen-ideas pool
     (quest-ideas.js), so a meal ticked on an idea from another day still reads and holds its slot */
  const dishOf = (id, list) => (list || ALL_DISHES).find((d) => d.id === id)
    || (!list && root.QuestIdeas ? root.QuestIdeas.byId(id) : null) || null;
  const gotOf = (rec, d) => { const g = rec && rec.dish && Array.isArray(rec.dish[d.id]) ? rec.dish[d.id] : [];
    return d.items.map((x) => x[0]).filter((n) => g.includes(n)); };
  /* A daily cap (Junyan, 2026-10-20, d17: "17 yes"). Blueprint dishes share the Blueprint meal's old limit across all
     meals of the day: two a day, the first worth its full value (+9 at level 1), the second the habit's next step on the
     DIM curve (+6), nothing after. Tonight's ideas get their own cap of the same shape, so a recipe never uses up a
     Blueprint slot and recipes cannot pay without end either. A dish takes a slot when its first ingredient is ticked and
     keeps the most it may pay (its max) on its paid record, so later ticks and unticks always use the same max and an
     untick takes back exactly what it paid; Clear frees the slot. opt: { mult, dish (the habit's value), dim (DIM),
     dishLimit (its daily limit), used (slots other dishes of its group hold today) }. */
  const groupOf = (d) => (d && d.own ? "own" : DISHES.some((x) => x.id === d.id) ? "bp" : "idea");
  // the slots dishes of d's group hold today across G.day.mealq, leaving out d itself on meal k. A Blueprint tile ticked
  // before 2026-10-20 still holds a Blueprint slot.
  function slotsUsed(mealq, k, d) {
    let n = 0;
    const g = groupOf(d);
    for (const [mk, q] of Object.entries(mealq || {})) {
      if (!q || q.kind || typeof q !== "object") continue;
      if (g === "bp" && Array.isArray(q.sel) && q.sel.includes("blueprint")) n++;
      for (const [key, v] of Object.entries(q.v || {})) {
        if (!key.startsWith("dish:") || (mk === k && key === "dish:" + d.id)) continue;
        const o = dishOf(key.slice(5));
        if (o && groupOf(o) === g && Array.isArray(v) && +v[2] > 0) n++;
      }
    }
    return n;
  }
  // the most a dish pays: its group's next slot on the Blueprint meal's curve at today's level (0 once the cap is reached)
  function dishMax(opt, used) {
    const o = opt || {}, u = used ?? o.used ?? 0, dim = o.dim || [1, 0.7], lim = o.dishLimit ?? 2;
    if (u >= lim) return 0;
    return Math.round((o.dish || DISH_VALUE) * (dim[u] ?? 0.2) * (o.mult ?? 1));
  }
  // the max this dish keeps on the record once started, else what a start now would get
  const capOf = (rec, d, opt) => { const v = rec && rec.v && rec.v["dish:" + d.id]; return v && +v[2] > 0 ? +v[2] : dishMax(opt); };
  // what n of the dish's ingredients are worth: its share of max
  const dishPay = (d, n, opt, max) => (d.items.length ? Math.round((max ?? dishMax(opt)) * Math.min(n, d.items.length) / d.items.length) : 0);
  // "3 of 10 ingredients", what is missing, and whether it is all in
  function dishStatus(rec, d) {
    const got = gotOf(rec, d), m = d.items.length, n = got.length;
    const missing = d.items.map((x) => x[0]).filter((x) => !got.includes(x));
    const all = n === m && m > 0;
    const text = all ? (d.own ? "All in." : "All in. Full points.") : n ? `Missing: ${missing.slice(0, 2).join(", ")}${missing.length > 2 ? ` and ${missing.length - 2} more` : ""}` : "";
    return { n, m, all, missing, pct: m ? Math.round((n / m) * 100) : 0, text };
  }
  /* Tick or untick one ingredient (how = its name), or "all" (Got everything) or "none" (Clear). Pays the difference
     between what the dish is worth now and what it had paid, so an untick takes back exactly its share and Clear takes
     back all of it. Returns { rec, ops } like tap(). */
  function tick(rec, d, how, opt) {
    const r = { ...(rec || {}), sel: [...((rec && Array.isArray(rec.sel)) ? rec.sel : [])], v: { ...((rec && rec.v) || {}) },
      p: +((rec && rec.p) || 0), b: +((rec && rec.b) || 0), dish: { ...((rec && rec.dish) || {}) } };
    let got = gotOf(r, d);
    if (how === "all") got = d.items.map((x) => x[0]);
    else if (how === "none") got = [];
    else if (d.items.some((x) => x[0] === how)) got = got.includes(how) ? got.filter((x) => x !== how) : got.concat(how);
    const key = "dish:" + d.id, old = r.v[key], was = old ? +old[1] || 0 : 0, wasDone = old && old[3] ? 1 : 0;
    /* his own dishes (d48) pay nothing and hold no slot: the food tiles pay for what was in it, and a dish of his can
       never pay the Blueprint dish value. A food he has since taken out of the dish stays ticked on a meal logged before,
       so the page's before and after agree and nothing is put back on the kitchen. */
    const names = d.items.map((x) => x[0]);
    let stale = d.own && rec && rec.dish && Array.isArray(rec.dish[d.id]) ? rec.dish[d.id].filter((x) => !names.includes(x)) : [];
    // the page shows such a food as its own row, so a tap on it (or Clear) unticks it and the kitchen gets it back
    if (how === "none" || stale.includes(how)) stale = how === "none" ? [] : stale.filter((x) => x !== how);
    const max = d.own ? 0 : capOf(r, d, opt), now = got.length ? dishPay(d, got.length, opt, max) : 0, dd = now - was;
    // d18 ("18 yes"): a Blueprint dish with every ingredient ticked counts as the Blueprint meal done today
    const isDone = groupOf(d) === "bp" && got.length === d.items.length && max > 0 ? 1 : 0;
    const keep = names.filter((x) => got.includes(x)).concat(stale);
    if (keep.length) r.dish[d.id] = keep; else delete r.dish[d.id];
    // [meter, paid, max, counted as done]; kept while ticked and the dish has a slot, so the slot and the max hold
    if (got.length && max > 0) r.v[key] = ["b", now, max, isDone]; else delete r.v[key];
    r.b += dd;
    return { rec: r, ops: dd ? [{ id: key, on: dd > 0, m: "b", d: dd }] : [], done: (r.v[key] ? isDone : 0) - wasDone };
  }
  // what one dish has paid on this record (shown on its card)
  const dishPaid = (rec, d) => (rec && rec.v && rec.v["dish:" + d.id] ? +rec.v["dish:" + d.id][1] || 0 : 0);

  root.QuestMeals = { PRANA_FOODS, PRANA_WAYS, TIPS, DRAINS, BODY, LEGACY_BODY, JUNK, ONEOF, FOOD_IDS, DRAIN_IDS, AUTO_NOTE,
    DISH_VALUE, DISHES, IDEAS, SHORT, tileLabel, value, score, toggle, tally, tap, meterOf, dishOf, groupOf, slotsUsed, dishMax, capOf, dishPay, dishStatus, tick, dishPaid };
})(typeof window !== "undefined" ? window : globalThis);
