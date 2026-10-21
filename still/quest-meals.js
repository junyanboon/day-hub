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
       box (TIPS; since d88 one tip on the meal block itself, tipFor). PRANA_WAYS stays here only so a meal rated before today still names and takes back what it paid; those
       past points stay. Leftover no longer takes back a "Freshly made" from before, since fresh can no longer be tapped.
     - Blueprint dishes (d13): Super Veggie and Nutty Pudding (DISHES) and tonight's three recipes for 2 people (IDEAS) are
       checklists. A dish pays body as its ingredients are ticked, its share of the Blueprint meal's value (6, times the
       level multiplier: +9 at level 1), each dish on its own. Super Veggie has no garlic (d12: garlic is a Drain).
       Since d81 (2026-10-21) only the Blueprint dishes pay; the ideas and recipe cards are suggestions (pays()).
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
  /* How to eat (2026-10-20, d15): [icon, words, short line]; tips, no points. Since d88 (2026-10-21) they left the meal
     sheet: ONE tip shows on the meal block itself (the Right now card), only while the meal is on or in the TIP_LEAD
     before it starts. tipFor turns it by date and by which meal of the day it is, so the three meals of a day get three
     different tips and each meal's tip changes the next day. */
  const TIPS = [
    ["🌿", "Eat it fresh, within 1.5 hours of cooking.", "eat it fresh, within 1.5 h of cooking"],
    ["🙏", "Sit two minutes before the first bite, phone face down.", "sit two minutes first, phone face down"],
    ["🪶", "Stop before full. You should feel light 30 minutes after.", "stop before full, feel light 30 min after"],
  ];
  const TIP_LEAD = 10 * 60000;
  // ymd "YYYY-MM-DD" (the meal's day), n = the meal's place among that day's meals (0 = first)
  function tipFor(ymd, n){
    const d = Math.floor(Date.parse(ymd + "T12:00:00Z") / 86400000);
    const i = ((Number.isFinite(d) ? d : 0) + (n | 0)) % TIPS.length;
    return TIPS[(i + TIPS.length) % TIPS.length];
  }
  const tipShows = (s, e, t) => +t >= +s - TIP_LEAD && +t < +e;
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
     d69 (Junyan, 2026-10-21: the auto-swap had put a blueberry nut mix in Chia and collagen in "A nut"): a part with a
     kind ("nut", "seed", "milk", "fruit") only auto-picks a stand-in of that kind (QuestIdeas.kindOf): a nut part nuts, nut
     butters or a nut mix; a seeds part seeds or a seed mix; milk a plant milk or yogurt; berries berries or other fruit.
     Supplements (collagen, creatine, protein powder) are never auto-picked for any part. He can still put anything in
     by hand with "Use something else", or as an extra (d70).
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
      { id: "seeds", role: "Seeds", kind: "seed", want: [["Hemp seeds", "4 tbsp", ["Pumpkin seeds", "Sunflower seeds", "Ground flax"]]] },
      { id: "oil", role: "Oil", want: [["Extra virgin olive oil", "15 ml", [], "\\boil\\b"]] },
    ],
    np: [
      { id: "milk", role: "Nut milk", kind: "milk", want: [["Macadamia milk", "240 ml", ["Almond milk", "Cashew milk", "Oat milk", "Soy milk"], "(nut|seed|hemp|coconut) milk"]] },
      { id: "nuts", role: "Ground nuts", kind: "nut", want: [["Macadamia nuts, ground", "4 tbsp", ["Almonds", "Cashews", "Hazelnuts", "Pecans"], "\\bnuts?\\b"]] },
      { id: "walnuts", role: "Walnuts", kind: "nut", want: [["Walnuts", "2 tbsp", ["Pecans"]]] },
      { id: "brazil", role: "Brazil nuts", kind: "nut", want: [["Brazil nuts", "2", []]] },
      { id: "chia", role: "Chia", kind: "seed", want: [["Chia seeds", "2 tbsp", []]] },
      { id: "flax", role: "Flax", kind: "seed", want: [["Ground flaxseed", "2 tbsp", []]] },
      { id: "lecithin", role: "Lecithin", want: [["Sunflower lecithin", "2 tsp", ["Soy lecithin"]]] },
      { id: "cocoa", role: "Cocoa", want: [["Cocoa powder", "2 tbsp", ["Cacao powder", "Cacao"]]] },
      { id: "cinnamon", role: "Cinnamon", want: [["Cinnamon", "½ tsp", []]] },
      { id: "juice", role: "Juice", want: [["Pomegranate juice", "120 ml", ["Tart cherry juice"], "juice"]] },
      { id: "berries", role: "Berries", kind: "fruit", want: [["Blueberries", "100 g", ["Frozen berries", "Raspberries", "Blackberries", "Strawberries"], "berr(y|ies)|cherr(y|ies)"],
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
      { id: "legume", role: "Cooked lentils or beans, a jar", want: [["Cooked lentils", "400 g", ["Chickpeas", "White beans"], "\\b(lentils?|chickpeas?|(white|black|navy|kidney|pinto|cannellini|butter|borlotti|mung|adzuki) beans?)\\b"]] },
      { id: "greens", role: "Greens", want: [["Baby spinach", "200 g", ["Kale", "Frozen broccoli", "Broccoli"]]] },
      { id: "lemon", role: "Lemon", want: [["Lemons", "1", ["Limes"]]] },
      { id: "seeds", role: "Seeds", kind: "seed", want: [["Hemp seeds", "4 tbsp", ["Pumpkin seeds", "Sunflower seeds"]]] },
    ], steps: [
      "Rinse the {legume} and warm them in a pan with a splash of water, about 5 min.",
      "Add the {greens} with a little more water, cover, and cook until very soft, 3 to 5 min.",
      "Squeeze over the {lemon}.",
      "Top with the {seeds} and eat it warm. No oil needed.",
    ] },
    { id: "tnp", icon: "🍮", name: "Travel Nutty Pudding", full: "np", travel: true, slots: [
      { id: "chia", role: "Chia", kind: "seed", want: [["Chia seeds", "4 tbsp", []]] },
      { id: "milk", role: "Nut or oat milk", kind: "milk", want: [["Almond milk", "400 ml", ["Macadamia milk", "Oat milk", "Cashew milk", "Soy milk"], "(nut|seed|hemp|coconut|oat|almond|soy|cashew|macadamia) milk"]] },
      { id: "berries", role: "Berries", kind: "fruit", want: [["Blueberries", "150 g", ["Frozen berries", "Raspberries", "Strawberries", "Cherries"], "berr(y|ies)|cherr(y|ies)"]] },
      { id: "nut", role: "A nut", kind: "nut", want: [["Walnuts", "2 tbsp", ["Almonds", "Mixed nuts", "Macadamias", "Brazil nuts", "Pecans"], "\\bnuts?\\b"]] },
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
  /* The automatic drains (eating within 3 hours of bed, up past 11) still count by themselves from the calendar and the
     Oura ring; the note naming them left the meal sheet (Junyan, 2026-10-21, d85). */

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
  const BLUEPRINT = DISHES.concat(TRAVEL);   // the Blueprint dishes of both kitchens
  const ALL_DISHES = BLUEPRINT.concat(IDEAS);
  /* a dish by id: the Blueprint dishes and the ideas, and (2026-10-21, d41) any idea of the kitchen-ideas pool
     (quest-ideas.js), so a meal ticked on an idea from another day still reads (and, if it paid before d81, holds its slot) */
  const dishOf = (id, list) => (list || ALL_DISHES).find((d) => d.id === id)
    || (!list && root.QuestIdeas ? root.QuestIdeas.byId(id) : null)
    || (!list && root.QuestRecipes ? root.QuestRecipes.byId(id) : null) || null;   // a recipe card (d79)
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
  const groupOf = (d) => (d && d.own ? "own" : BLUEPRINT.some((x) => x.id === d.id) ? "bp" : "idea");   // a travel version is a Blueprint dish (d58)
  /* Only the Blueprint dishes (Super Veggie, Nutty Pudding, their travel versions) pay points of their own (Junyan,
     2026-10-21, d81 NO: "they are just recommendations for me to make meals"). Recipe cards, tonight's old ideas and the
     kitchen-ideas pool pay nothing, like his own dishes (d48): their ticks only take amounts off the kitchen, and the food
     tiles score the meal. A meal that paid on a recipe or an idea before d81 keeps what it paid (tick leaves it alone). */
  const pays = (d) => !!d && groupOf(d) === "bp";
  // the slots dishes of d's group hold today across G.day.mealq, leaving out d itself on meal k. A Blueprint tile ticked
  // before 2026-10-20 still holds a Blueprint slot.
  // (since d81 an idea only holds one through a record paid before d81)
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
    const text = all ? (pays(d) ? "All in. Full points." : "All in.") : n ? `Missing: ${missing.slice(0, 2).join(", ")}${missing.length > 2 ? ` and ${missing.length - 2} more` : ""}` : "";
    return { n, m, all, missing, pct: m ? Math.round((n / m) * 100) : 0, text };
  }
  /* Tick or untick one ingredient (how = its name), or "all" (Got everything) or "none" (Clear). A Blueprint dish pays the
     difference between what it is worth now and what it had paid, so an untick takes back exactly its share and Clear
     takes back all of it. Any other dish (d81) only keeps its ticks: no ops, and a record paid before d81 stays as it was
     (noPay). Returns { rec, ops, done } like tap(). */
  function tick(rec, d, how, opt) {
    const r = { ...(rec || {}), sel: [...((rec && Array.isArray(rec.sel)) ? rec.sel : [])], v: { ...((rec && rec.v) || {}) },
      p: +((rec && rec.p) || 0), b: +((rec && rec.b) || 0), dish: { ...((rec && rec.dish) || {}) } };
    if (isSlotDish(d)) return tickSlots(r, d, how, opt);
    let got = gotOf(r, d);
    if (how === "all") got = d.items.map((x) => x[0]);
    else if (how === "none") got = [];
    else if (Array.isArray(how)) got = d.items.map((x) => x[0]).filter((n) => how.includes(n));   // "Cook this" (d79): these ticks
    else if (d.items.some((x) => x[0] === how)) got = got.includes(how) ? got.filter((x) => x !== how) : got.concat(how);
    const key = "dish:" + d.id, old = r.v[key], was = old ? +old[1] || 0 : 0, wasDone = old && old[3] ? 1 : 0;
    /* his own dishes (d48) pay nothing and hold no slot: the food tiles pay for what was in it, and a dish of his can
       never pay the Blueprint dish value. A food he has since taken out of the dish stays ticked on a meal logged before,
       so the page's before and after agree and nothing is put back on the kitchen. */
    const names = d.items.map((x) => x[0]);
    let stale = d.own && rec && rec.dish && Array.isArray(rec.dish[d.id]) ? rec.dish[d.id].filter((x) => !names.includes(x)) : [];
    // the page shows such a food as its own row, so a tap on it (or Clear) unticks it and the kitchen gets it back
    if (how === "none" || stale.includes(how)) stale = how === "none" ? [] : stale.filter((x) => x !== how);
    const keep = names.filter((x) => got.includes(x)).concat(stale);
    if (!pays(d)) return noPay(r, d, keep);
    const max = capOf(r, d, opt), now = got.length ? dishPay(d, got.length, opt, max) : 0, dd = now - was;
    // d18 ("18 yes"): a Blueprint dish with every ingredient ticked counts as the Blueprint meal done today
    const isDone = got.length === d.items.length && max > 0 ? 1 : 0;
    if (keep.length) r.dish[d.id] = keep; else delete r.dish[d.id];
    // [meter, paid, max, counted as done]; kept while ticked and the dish has a slot, so the slot and the max hold
    if (got.length && max > 0) r.v[key] = ["b", now, max, isDone]; else delete r.v[key];
    r.b += dd;
    return { rec: r, ops: dd ? [{ id: key, on: dd > 0, m: "b", d: dd }] : [], done: (r.v[key] ? isDone : 0) - wasDone };
  }
  /* A part dish (d51, d52): how is one tick ("greens:Kale", or an old recipe name) to tick or untick, a list (the ticks it
     should have now: the page's "Got everything", what each part shows), "all" (the full recipe) or "none" (Clear). It pays its share of the
     dish's value by parts filled (a part dish that does not pay, d81, only keeps its ticks). A tick that no longer reads
     is dropped. */
  function tickSlots(r, d, how, opt) {
    let got = entriesOf(r, d);
    if (how === "none") got = [];
    else if (how === "all") got = d.slots.flatMap((sl) => sl.want.map((w) => w[0]));   // the full recipe, by its own names
    else if (Array.isArray(how)) got = [...new Set(how.filter((e) => slotOf(d, e)))];
    else if (slotOf(d, how)) got = got.includes(how) ? got.filter((x) => x !== how) : got.concat(how);
    if (!pays(d)) return noPay(r, d, got);
    const key = "dish:" + d.id, old = r.v[key], was = old ? +old[1] || 0 : 0, wasDone = old && old[3] ? 1 : 0;
    const n = new Set(got.map((e) => slotOf(d, e).slot)).size;
    const max = capOf(r, d, opt), now = n ? dishPay(d, n, opt, max) : 0, dd = now - was;
    const isDone = n === d.slots.length && max > 0 ? 1 : 0;
    if (got.length) r.dish[d.id] = got; else delete r.dish[d.id];
    if (n && max > 0) r.v[key] = ["b", now, max, isDone]; else delete r.v[key];
    r.b += dd;
    return { rec: r, ops: dd ? [{ id: key, on: dd > 0, m: "b", d: dd }] : [], done: (r.v[key] ? isDone : 0) - wasDone };
  }
  // d81: a dish that does not pay keeps only its ticks; its paid record from before d81 (r.v) and r.b stay as they were
  function noPay(r, d, ticks) {
    if (ticks.length) r.dish[d.id] = ticks; else delete r.dish[d.id];
    return { rec: r, ops: [], done: 0 };
  }
  // the dishes a meal record holds: ticks on them, or (d81) a paid record left after its ticks were cleared
  const heldIds = (rec) => [...new Set(Object.keys((rec && rec.dish) || {})
    .concat(Object.keys((rec && rec.v) || {}).filter((x) => x.startsWith("dish:")).map((x) => x.slice(5))))];
  // what one dish has paid on this record (shown on its card)
  const dishPaid = (rec, d) => (rec && rec.v && rec.v["dish:" + d.id] ? +rec.v["dish:" + d.id][1] || 0 : 0);

  /* Extras (Junyan, 2026-10-21, d70: "There's no option to add bananas. I used collagen so I want to put that there and
     creatine as well"). "+ Add something you put in" on any dish card puts a food on the meal beyond the dish's own parts
     or ingredients: rec.xtra = { <dish id>: [{ n (the food), q (what it took, a number or null), u ("" a count, "g",
     "ml") }] }, one row per food (by name, any case). They live on the meal's record like the dish ticks, so they save,
     sync and merge with it. They pay no points and fill no part (the parts and the food tiles decide points: tying an
     extra to a food tile could pay the same banana twice). The page takes a kitchen item's amount off through the same
     tick records as a dish tick (QuestKitchen.eat), and puts it back when the extra is removed. */
  const xName = (n) => String(n == null ? "" : n).replace(/[|\s]+/g, " ").trim().slice(0, 40);
  const xKey = (n) => xName(n).toLowerCase();
  function extrasOf(rec, id) {
    const l = rec && rec.xtra && Array.isArray(rec.xtra[id]) ? rec.xtra[id] : [];
    return l.filter((x) => x && typeof x === "object" && xName(x.n)).map((x) => ({ n: xName(x.n),
      q: typeof x.q === "number" && isFinite(x.q) && x.q >= 0 ? x.q : null, u: x.u === "g" || x.u === "ml" ? x.u : "" }));
  }
  function withExtras(rec, id, list) {
    const r = { ...(rec || {}), xtra: { ...((rec && rec.xtra) || {}) } };
    if (list.length) r.xtra[id] = list; else delete r.xtra[id];
    if (!Object.keys(r.xtra).length) delete r.xtra;
    return r;
  }
  // add one: x = { n, q, u }; a food already on the dish is left as it is
  function addExtra(rec, id, x) {
    const l = extrasOf(rec, id), n = xName(x && x.n);
    if (!n || l.some((y) => xKey(y.n) === xKey(n))) return rec || {};
    return withExtras(rec, id, l.concat(extrasOf({ xtra: { [id]: [{ ...x, n }] } }, id)));
  }
  const dropExtra = (rec, id, n) => withExtras(rec, id, extrasOf(rec, id).filter((y) => xKey(y.n) !== xKey(n)));
  const setExtraQ = (rec, id, n, q) => withExtras(rec, id, extrasOf(rec, id).map((y) => (xKey(y.n) === xKey(n)
    ? { ...y, q: typeof q === "number" && isFinite(q) && q >= 0 ? Math.round(q * 10) / 10 : null } : y)));

  /* One dish per meal (Junyan, 2026-10-21: "what's important is me to capture the ingredients by MEAL not dishes. Super
     Veggie is my meal, Nutty pudding is my meal"). rec.m is the dish this meal is: a dish id, or "meal" for Something
     else (its foods are the extras of the pseudo dish "meal"). A meal logged before has no m: what it holds (dish ticks,
     a paid dish record, extras on any dish) reads as the meal, one or more dishes, so it keeps its points and can be
     unticked. */
  const okPick = (x) => typeof x === "string" && /^[\w-]{1,40}$/.test(x);
  const pickOf = (rec) => (rec && okPick(rec.m) ? rec.m : null);
  // the dishes on this meal, its pick first, then anything else it holds (old records), in order
  const onMeal = (rec) => [...new Set([pickOf(rec)].concat(heldIds(rec), Object.keys((rec && rec.xtra) || {})).filter(okPick))];
  const setPick = (rec, id) => { const r = { ...(rec || {}) }; if (okPick(id)) r.m = id; else delete r.m; return r; };

  /* The food tiles from what was logged (d83). want: the tile ids the meal's foods earn now (QuestFoodScore.earn). A tile
     the foods earn is paid (tap) and marked in rec.auto; a tile in rec.auto the foods no longer earn is taken back. A tile
     he tapped by hand (on a record from before, or a drain) is never touched, and one he took back by hand (rec.noauto)
     is not paid again. can(id): whether a new tile may pay now (its daily limit). Returns { rec, ops } like tap(). */
  const AUTO_IDS = FOOD_IDS.concat(BODY, [JUNK[0], "neg"]);
  function autoSync(rec, want, opt, can) {
    let r = { ...(rec || {}) };
    const w = new Set(want || []), auto = new Set(Array.isArray(r.auto) ? r.auto : []), no = new Set(Array.isArray(r.noauto) ? r.noauto : []);
    const ops = [];
    for (const id of AUTO_IDS) {
      const on = Array.isArray(r.sel) && r.sel.includes(id);
      if (w.has(id) && !on && !no.has(id) && (!can || can(id))) { const t = tap(r, id, opt); r = t.rec; ops.push(...t.ops); auto.add(id); }
      else if (!w.has(id) && on && auto.has(id)) { const t = tap(r, id, opt); r = t.rec; ops.push(...t.ops); auto.delete(id); }
      else if (!on) auto.delete(id);
    }
    if (auto.size) r.auto = AUTO_IDS.filter((id) => auto.has(id)); else delete r.auto;
    return { rec: r, ops };
  }
  // a tap by hand on a drain button: a paid-by-the-foods tile taken back by hand stays off; tapped on again, it is his
  function handTap(rec, id, opt) {
    const t = tap(rec, id, opt), r = t.rec, on = r.sel.includes(id);
    const auto = (Array.isArray(r.auto) ? r.auto : []).filter((x) => x !== id), no = (Array.isArray(r.noauto) ? r.noauto : []).filter((x) => x !== id);
    if (!on && Array.isArray(rec && rec.auto) && rec.auto.includes(id)) no.push(id);
    if (auto.length) r.auto = auto; else delete r.auto;
    if (no.length) r.noauto = no; else delete r.noauto;
    return t;
  }

  root.QuestMeals = { PRANA_FOODS, PRANA_WAYS, TIPS, TIP_LEAD, tipFor, tipShows, DRAINS, BODY, LEGACY_BODY, JUNK, ONEOF, FOOD_IDS, DRAIN_IDS,
    DISH_VALUE, DISHES, TRAVEL, BLUEPRINT, CORE, dishesFor, IDEAS, SLOTS, STEPS, isSlotDish, slotOf, entryName, extrasOf, addExtra, dropExtra, setExtraQ, xKey, entriesOf, filledOf, partsOf, stepsOf, SHORT, tileLabel, value, score, toggle, tally, tap, meterOf, dishOf, groupOf, pays, slotsUsed, dishMax, capOf, dishPay, dishStatus, tick, dishPaid, heldIds, pickOf, onMeal, setPick, AUTO_IDS, autoSync, handTap };
})(typeof window !== "undefined" ? window : globalThis);
