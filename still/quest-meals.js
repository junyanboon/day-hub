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
     past meals keep what they paid. These amounts are what a tick takes off the kitchen (quest-kitchen.js eat).
     2026-10-21 (Junyan, d57 "yes", his gut plan): the olive oil is 15 ml for the two of them (was 30 ml), drizzled on at the
     end. He is prone to colitis, and oil and heavy fibre make it worse. */
  const DISHES = [
    { id: "sv", icon: "🥗", name: "Super Veggie", items: [
      ["Black lentils, dry", "90 g"], ["Broccoli", "175 g"], ["Cauliflower", "175 g"], ["Shiitake mushrooms", "100 g"],
      ["Fresh ginger, grated", "2 tbsp"], ["Lime", "1"], ["Ground cumin", "2 tsp"], ["Apple cider vinegar", "2 tbsp"],
      ["Hemp seeds", "4 tbsp"], ["Extra virgin olive oil", "15 ml"]] },
    { id: "np", icon: "🍮", name: "Nutty Pudding", items: [
      ["Macadamia milk", "240 ml"], ["Macadamia nuts, ground", "4 tbsp"], ["Walnuts", "2 tbsp"], ["Brazil nuts", "2"],
      ["Chia seeds", "2 tbsp"], ["Ground flaxseed", "2 tbsp"], ["Sunflower lecithin", "2 tsp"], ["Cocoa powder", "2 tbsp"],
      ["Cinnamon", "½ tsp"], ["Pomegranate juice", "120 ml"], ["Blueberries", "100 g"], ["Cherries", "100 g"]] },
  ];
  /* "Best you can" dishes (Junyan, 2026-10-21, d51: "I should try my best to make a super-veggie like dish based on what's
     available. Same thing with nutty pudding"; "the goal is to try to help me get to the full recipe as close as I can").
     Each Blueprint dish is made of parts (slots), one per role. A part lists the real ingredients with their amounts (the
     full recipe above, same names and amounts) and, for each, the swaps that can stand in: [name, amount, [swap names],
     any (a pattern: any kitchen item whose name matches, "any mushroom")]. The meal sheet shows each real ingredient if
     the kitchen in use has it, else the closest swap it has, else "none in the kitchen" (QuestIdeas.slotRows). A swap
     takes the real ingredient's amount. d52: the dish pays by parts filled (5 of 8 parts, 5/8 of its value).
     Steps (d53): "How to make it", numbered. A {part} in a step is filled with what he is using today; {a|b} joins the
     names of both parts; a step whose parts are all empty is left out. Cooked soft and with little oil (his gut plan,
     2026-10-21): steamed or simmered, never fried. Plain strings, so a recipe library can feed the same shape later. */
  const SLOTS = {
    sv: [
      { id: "greens", role: "Greens", want: [["Broccoli", "175 g", ["Frozen broccoli", "Kale", "Cabbage", "Brussels sprouts", "Romanesco"]],
        ["Cauliflower", "175 g", ["Frozen broccoli", "Kale", "Cabbage", "Brussels sprouts", "Romanesco"]]] },
      { id: "legume", role: "Lentils or beans", want: [["Black lentils, dry", "90 g", ["Green lentils", "Red lentils", "Brown lentils", "Navy beans", "White beans", "Chickpeas"]]] },
      { id: "mushroom", role: "Mushroom", want: [["Shiitake mushrooms", "100 g", [], "mushroom|portobello|chanterelle|enoki|oyster|cremini|porcini"]] },
      { id: "ginger", role: "Ginger", want: [["Fresh ginger, grated", "2 tbsp", []]] },
      { id: "acid", role: "Lime and vinegar", want: [["Lime", "1", ["Lemons"]], ["Apple cider vinegar", "2 tbsp", [], "vinegar"]] },
      { id: "spice", role: "Spice", want: [["Ground cumin", "2 tsp", ["Ground coriander", "Turmeric", "Smoked paprika", "Curry powder"]]] },
      { id: "seeds", role: "Seeds", want: [["Hemp seeds", "4 tbsp", ["Pumpkin seeds", "Sunflower seeds", "Ground flax"]]] },
      { id: "oil", role: "Oil", want: [["Extra virgin olive oil", "15 ml", [], "\\boil\\b"]] },
    ],
    np: [
      { id: "milk", role: "Nut milk", want: [["Macadamia milk", "240 ml", ["Almond milk", "Cashew milk", "Oat milk", "Soy milk"], "(nut|seed|hemp|coconut) milk"]] },
      { id: "nuts", role: "Ground nuts", want: [["Macadamia nuts, ground", "4 tbsp", ["Almonds", "Cashews", "Hazelnuts", "Pecans"], "\\bnuts?\\b"]] },
      { id: "walnuts", role: "Walnuts", want: [["Walnuts", "2 tbsp", ["Pecans"]]] },
      { id: "brazil", role: "Brazil nuts", want: [["Brazil nuts", "2", []]] },
      { id: "chia", role: "Chia", want: [["Chia seeds", "2 tbsp", []]] },
      { id: "flax", role: "Flax", want: [["Ground flaxseed", "2 tbsp", []]] },
      { id: "lecithin", role: "Lecithin", want: [["Sunflower lecithin", "2 tsp", ["Soy lecithin"]]] },
      { id: "cocoa", role: "Cocoa", want: [["Cocoa powder", "2 tbsp", ["Cacao powder", "Cacao"]]] },
      { id: "cinnamon", role: "Cinnamon", want: [["Cinnamon", "½ tsp", []]] },
      { id: "juice", role: "Juice", want: [["Pomegranate juice", "120 ml", ["Tart cherry juice"], "juice"]] },
      { id: "berries", role: "Berries", want: [["Blueberries", "100 g", ["Frozen berries", "Raspberries", "Blackberries", "Strawberries"], "berr(y|ies)|cherr(y|ies)"],
        ["Cherries", "100 g", ["Frozen berries", "Raspberries", "Blackberries", "Strawberries"], "berr(y|ies)|cherr(y|ies)"]] },
    ],
  };
  const STEPS = {
    sv: [
      "Rinse the {legume}. Dry lentils: simmer in plenty of water until very soft, 25 to 30 min, then drain. Cooked beans or chickpeas: warm them in a little water for 5 min.",
      "Cut the {greens} small and steam until soft, 8 to 10 min. Softer is easier on the gut.",
      "Slice the {mushroom} and simmer in a splash of water until soft, about 5 min.",
      "Stir in the {ginger|spice} for the last minute.",
      "Put everything in a bowl and dress it with the {acid}.",
      "Drizzle over the {oil} at the end, 15 ml for the two of you (1 tbsp).",
      "Top with the {seeds} and eat it warm.",
    ],
    np: [
      "Pour the {milk} into a blender.",
      "Add the {nuts|walnuts|brazil} and blend until smooth, about 1 min.",
      "Add the {chia|flax|lecithin|cocoa|cinnamon} and blend a few seconds more.",
      "Stir in the {juice}.",
      "Let it sit at least 10 min so it thickens and the seeds soften (longer is gentler on the gut).",
      "Top with the {berries}.",
    ],
  };
  /* The core parts (Junyan, 2026-10-21, d59: "I can't have all of these ingredients on my grocery list ... we need something
     manageable"): only these go on the shopping list by themselves when the kitchen has nothing for them
     (QuestKitchen.missing). The minor extras (lecithin, cinnamon, cocoa, spices, vinegar, oil) never do; they are on the
     list only when he has them and they run Low or Out, like any item. */
  const CORE = { sv: ["greens", "legume", "mushroom"], np: ["berries", "milk", "nuts"] };
  for (const d of DISHES) { d.slots = SLOTS[d.id]; d.steps = STEPS[d.id]; d.core = CORE[d.id]; }
  /* The travel versions (Junyan, 2026-10-21, d58: "travel fridge will need its own recipes"). When the travel fridge is the
     kitchen in use, the meal sheet shows these instead of the full recipes (dishesFor), with the full recipe still named
     small (full: the home dish it stands for). A few parts of travel-easy foods (a cooked legume from a jar, greens that
     wilt soft, lemon, seeds; chia, a nut or oat milk, berries, a nut), plants only, no garlic, onion or asafoetida, no oil,
     every vegetable cooked soft. They pay and count like the Blueprint dishes (the same daily cap, by parts filled), and
     every part is core: the travel list gets these few foods, never the full home recipes (d59). */
  const TRAVEL = [
    { id: "tsv", icon: "🥗", name: "Travel Super Veggie", full: "sv", travel: true, slots: [
      { id: "legume", role: "Cooked lentils or beans, a jar", want: [["Cooked lentils", "400 g", ["Chickpeas", "White beans"], "\\b(lentils?|beans?|chickpeas?)\\b"]] },
      { id: "greens", role: "Greens", want: [["Baby spinach", "200 g", ["Kale", "Frozen broccoli", "Broccoli"]]] },
      { id: "lemon", role: "Lemon", want: [["Lemons", "1", ["Limes"]]] },
      { id: "seeds", role: "Seeds", want: [["Hemp seeds", "4 tbsp", ["Pumpkin seeds", "Sunflower seeds"]]] },
    ], steps: [
      "Rinse the {legume} and warm them in a pan with a splash of water, about 5 min.",
      "Add the {greens} with a little more water, cover, and cook until very soft, 3 to 5 min.",
      "Squeeze over the {lemon}.",
      "Top with the {seeds} and eat it warm. No oil needed.",
    ] },
    { id: "tnp", icon: "🍮", name: "Travel Nutty Pudding", full: "np", travel: true, slots: [
      { id: "chia", role: "Chia", want: [["Chia seeds", "4 tbsp", []]] },
      { id: "milk", role: "Nut or oat milk", want: [["Almond milk", "400 ml", ["Macadamia milk", "Oat milk", "Cashew milk", "Soy milk"], "(nut|seed|hemp|coconut|oat|almond|soy|cashew|macadamia) milk"]] },
      { id: "berries", role: "Berries", want: [["Blueberries", "150 g", ["Frozen berries", "Raspberries", "Strawberries", "Cherries"], "berr(y|ies)|cherr(y|ies)"]] },
      { id: "nut", role: "A nut", want: [["Walnuts", "2 tbsp", ["Almonds", "Mixed nuts", "Macadamias", "Brazil nuts", "Pecans"], "\\bnuts?\\b"]] },
    ], steps: [
      "Stir the {chia} into the {milk}, then stir again after 2 min so it does not clump.",
      "Let it sit at least 15 min, or overnight in the cool box, until thick (longer is gentler on the gut).",
      "Top with the {berries} and the {nut}, chopped.",
    ] },
  ];
  for (const d of TRAVEL) { d.items = d.slots.flatMap((s) => s.want.map((w) => [w[0], w[1]])); d.core = d.slots.map((s) => s.id); }
  // the Blueprint dishes for kitchen k: the travel versions in the travel fridge, else the full recipes
  const dishesFor = (k) => (k === "travel" ? TRAVEL : DISHES);
  /* Tonight's ideas, for 2 people. Since 2026-10-21 (d41) the page shows three a day picked from what is in the kitchen
     (quest-ideas.js, whose pool starts with these three, same ids); this list is what shows when that module is not
     loaded. Ids must stay unique across the pool.
     2026-10-21 (Junyan, d61 "yes"): cooked the gut-friendly way, like Super Veggie. Vegetables are steamed or simmered until
     soft, never roasted or fried, and the oil is at most 15 ml (1 tbsp) for the two of them, drizzled on at the end. The
     ingredients are otherwise the same. */
  const IDEAS = [
    { id: "r1", icon: "🫘", name: "Lentil bowl with soft peppers", time: "35 min", items: [
      ["Green or brown lentils, dry", "140 g"], ["Red peppers", "2"], ["Courgette", "1 medium"], ["Baby spinach", "100 g"],
      ["Extra virgin olive oil", "15 ml"], ["Lemon", "1"], ["Ground cumin", "1 tsp"], ["Smoked paprika", "1 tsp"],
      ["Fresh parsley", "20 g"], ["Almonds, soaked", "30 g"]],
      how: "Simmer the lentils 20 min with the cumin and paprika. Steam the sliced peppers and courgette until soft, about 10 min. Wilt the spinach into the hot lentils, then top with the veg, lemon, parsley and almonds. Drizzle the oil over at the end." },
    { id: "r2", icon: "🍲", name: "Chickpea and spinach stew", time: "30 min", items: [
      ["Chickpeas, cooked", "400 g"], ["Spinach", "200 g"], ["Tomatoes", "3 medium"], ["Carrot", "1"],
      ["Extra virgin olive oil", "15 ml"], ["Smoked paprika", "1 tsp"], ["Ground cumin", "1 tsp"], ["Saffron", "a pinch"],
      ["Sherry vinegar", "1 tbsp"], ["Pumpkin seeds", "30 g"]],
      how: "Simmer the grated carrot in a splash of water for 5 min, add the spices and chopped tomatoes for 10 min, then the chickpeas and saffron for 10 more. Fold in the spinach until soft. Finish with vinegar and seeds, and drizzle the oil over at the end." },
    { id: "r3", icon: "🥦", name: "Quinoa, broccoli and white beans", time: "25 min", items: [
      ["Quinoa, dry", "150 g"], ["White beans, cooked", "300 g"], ["Broccoli", "400 g"], ["Rocket", "80 g"],
      ["Cherry tomatoes", "150 g"], ["Tahini", "2 tbsp"], ["Lemon", "1"], ["Extra virgin olive oil", "15 ml"], ["Hemp seeds", "2 tbsp"]],
      how: "Cook the quinoa 15 min. Steam the broccoli until soft, about 8 min. Whisk the tahini, lemon and a little water. Toss everything with the warm beans, rocket and tomatoes, drizzle the oil over and top with hemp seeds." },
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
  const ALL_DISHES = DISHES.concat(TRAVEL, IDEAS);
  /* a dish by id: the Blueprint dishes and the ideas, and (2026-10-21, d41) any idea of the kitchen-ideas pool
     (quest-ideas.js), so a meal ticked on an idea from another day still reads and holds its slot */
  const dishOf = (id, list) => (list || ALL_DISHES).find((d) => d.id === id)
    || (!list && root.QuestIdeas ? root.QuestIdeas.byId(id) : null) || null;
  const gotOf = (rec, d) => { const g = rec && rec.dish && Array.isArray(rec.dish[d.id]) ? rec.dish[d.id] : [];
    return d.items.map((x) => x[0]).filter((n) => g.includes(n)); };
  /* Parts (d51). A tick on a part dish is stored as "<part id>:<what he used>" ("greens:Kale"). A meal ticked before parts
     holds the recipe's own names ("Broccoli"), which read as their part, so it still counts and can be unticked. */
  const isSlotDish = (d) => !!d && Array.isArray(d.slots) && d.slots.length > 0;
  function slotOf(d, entry) {
    if (!isSlotDish(d) || typeof entry !== "string") return null;
    const m = /^([a-z]+):(.+)$/.exec(entry);
    if (m && d.slots.some((s) => s.id === m[1])) return { slot: m[1], name: m[2] };
    const s = d.slots.find((x) => x.want.some((w) => w[0] === entry));
    return s ? { slot: s.id, name: entry } : null;
  }
  // what a tick names: the food of a part tick, else the ingredient itself
  const entryName = (d, entry) => { const p = slotOf(d, entry); return p ? p.name : entry; };
  // the part dish's ticks that read (in order), and the parts they fill
  const entriesOf = (rec, d) => (rec && rec.dish && Array.isArray(rec.dish[d.id]) ? rec.dish[d.id] : []).filter((e) => slotOf(d, e));
  const filledOf = (rec, d) => new Set(entriesOf(rec, d).map((e) => slotOf(d, e).slot));
  // how many parts a dish has: its parts, else its ingredients
  const partsOf = (d) => (isSlotDish(d) ? d.slots.length : d.items.length);
  /* "How to make it" (d53): numbered steps. use: { part id: [names used today] } for a part dish (else the recipe's own
     names). His own dishes and a recipe library give steps as a list; tonight's ideas keep one paragraph (how), split
     into its sentences. */
  const lowName = (n) => String(n).split(",")[0].trim().toLowerCase().replace(/\bbrazil\b/g, "Brazil");
  const joinNames = (l) => (l.length < 2 ? l.join("") : l.slice(0, -1).join(", ") + " and " + l[l.length - 1]);
  function stepsOf(d, use) {
    if (!d) return [];
    if (isSlotDish(d)) {
      const u = use || Object.fromEntries(d.slots.map((s) => [s.id, s.want.map((w) => w[0])]));
      return (d.steps || []).map((t) => {
        let empty = false;
        const out = t.replace(/\{([a-z|]+)\}/g, (m0, ids) => {
          const names = [...new Set(ids.split("|").flatMap((id) => (u[id] || []).map(lowName)))];
          if (!names.length) empty = true;
          return joinNames(names);
        });
        return empty ? null : out;
      }).filter(Boolean);
    }
    if (Array.isArray(d.steps)) return d.steps.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());
    if (typeof d.how === "string" && d.how.trim()) return d.how.trim().split(/(?<=\.)\s+(?=[A-Z0-9])/);
    return [];
  }
  /* A daily cap (Junyan, 2026-10-20, d17: "17 yes"). Blueprint dishes share the Blueprint meal's old limit across all
     meals of the day: two a day, the first worth its full value (+9 at level 1), the second the habit's next step on the
     DIM curve (+6), nothing after. Tonight's ideas get their own cap of the same shape, so a recipe never uses up a
     Blueprint slot and recipes cannot pay without end either. A dish takes a slot when its first ingredient is ticked and
     keeps the most it may pay (its max) on its paid record, so later ticks and unticks always use the same max and an
     untick takes back exactly what it paid; Clear frees the slot. opt: { mult, dish (the habit's value), dim (DIM),
     dishLimit (its daily limit), used (slots other dishes of its group hold today) }. */
  const groupOf = (d) => (d && d.own ? "own" : DISHES.concat(TRAVEL).some((x) => x.id === d.id) ? "bp" : "idea");   // a travel version is a Blueprint dish (d58)
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
  const dishPay = (d, n, opt, max) => { const m = partsOf(d); return m ? Math.round((max ?? dishMax(opt)) * Math.min(n, m) / m) : 0; };
  // "3 of 10 ingredients", what is missing, and whether it is all in
  function dishStatus(rec, d) {
    if (isSlotDish(d)) {   // d52: parts filled, and the parts still empty by their role
      const f = filledOf(rec, d), m = d.slots.length, n = f.size, missing = d.slots.filter((s) => !f.has(s.id)).map((s) => s.role);
      const all = n === m;
      const text = all ? "All in. Full points." : n ? `Missing: ${missing.slice(0, 2).join(", ")}${missing.length > 2 ? ` and ${missing.length - 2} more` : ""}` : "";
      return { n, m, all, missing, pct: Math.round((n / m) * 100), text };
    }
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
    if (isSlotDish(d)) return tickSlots(r, d, how, opt);
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
  /* A part dish (d51, d52): how is one tick ("greens:Kale", or an old recipe name) to tick or untick, a list (the ticks it
     should have now: the page's "Got everything", what each part shows), "all" (the full recipe) or "none" (Clear). It pays its share of the
     dish's value by parts filled. A tick that no longer reads is dropped. */
  function tickSlots(r, d, how, opt) {
    let got = entriesOf(r, d);
    if (how === "none") got = [];
    else if (how === "all") got = d.slots.flatMap((sl) => sl.want.map((w) => w[0]));   // the full recipe, by its own names
    else if (Array.isArray(how)) got = [...new Set(how.filter((e) => slotOf(d, e)))];
    else if (slotOf(d, how)) got = got.includes(how) ? got.filter((x) => x !== how) : got.concat(how);
    const key = "dish:" + d.id, old = r.v[key], was = old ? +old[1] || 0 : 0, wasDone = old && old[3] ? 1 : 0;
    const n = new Set(got.map((e) => slotOf(d, e).slot)).size;
    const max = capOf(r, d, opt), now = n ? dishPay(d, n, opt, max) : 0, dd = now - was;
    const isDone = n === d.slots.length && max > 0 ? 1 : 0;
    if (got.length) r.dish[d.id] = got; else delete r.dish[d.id];
    if (n && max > 0) r.v[key] = ["b", now, max, isDone]; else delete r.v[key];
    r.b += dd;
    return { rec: r, ops: dd ? [{ id: key, on: dd > 0, m: "b", d: dd }] : [], done: (r.v[key] ? isDone : 0) - wasDone };
  }
  // what one dish has paid on this record (shown on its card)
  const dishPaid = (rec, d) => (rec && rec.v && rec.v["dish:" + d.id] ? +rec.v["dish:" + d.id][1] || 0 : 0);

  root.QuestMeals = { PRANA_FOODS, PRANA_WAYS, TIPS, DRAINS, BODY, LEGACY_BODY, JUNK, ONEOF, FOOD_IDS, DRAIN_IDS, AUTO_NOTE,
    DISH_VALUE, DISHES, TRAVEL, CORE, dishesFor, IDEAS, SLOTS, STEPS, isSlotDish, slotOf, entryName, entriesOf, filledOf, partsOf, stepsOf, SHORT, tileLabel, value, score, toggle, tally, tap, meterOf, dishOf, groupOf, slotsUsed, dishMax, capOf, dishPay, dishStatus, tick, dishPaid };
})(typeof window !== "undefined" ? window : globalThis);
