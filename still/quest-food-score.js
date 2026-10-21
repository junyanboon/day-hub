/* Day Quest: what a meal's logged foods earn (Junyan, 2026-10-21, d83: "yes"). The Prana foods and Body foods tile grids
   left the meal sheet; the same tiles are now worked out from what he logged in the meal (dish ticks, kitchen foods he
   tapped in, foods he typed), so he never taps a tile for food he already logged.
   - Prana foods (any amount): fresh fruit, fresh vegetables (raw or just cooked), sprouts, nuts, honey.
   - Body foods (by amount, the tiles' own thresholds): 30 g protein in a morning meal, 150 g cooked lentils or beans,
     250 g vegetables, 50 g leafy greens, 15 ml olive oil, 30 g nuts, 100 g berries, 1 tbsp ground flax or chia. Amounts
     are this meal's, added up across its foods (each tile was one tap for one meal before, with its daily limit; the
     page keeps the limits). A food with no amount counts toward no gram tile.
   - Ultra-processed or fried (a minus) only when an obviously processed food is logged.
   - Onion or garlic (d84, a drain): ticked when an onion or garlic family food is logged.
   Amounts are read as logged: what the meal took off the kitchen, or the recipe amount of a tick, so a pot cooked for two
   counts whole. Pure, so it can be tested (node --test still/test). */
(function (root) {
  "use strict";
  const has = (re, s) => re.test(s);
  // the words that make a food something else: a drink, an oil, a jam, a powder (they never count as the fresh food)
  const MADE = /\b(juices?|jams?|jelly|syrups?|powder|dried|dehydrated|oils?|vinegars?|milks?|extracts?|flavou?r(ed)?|sauces?|tea)\b/i;
  const ALLIUM = /\b(onions?|garlic|shallots?|leeks?|chives|scallions?|ramps?)\b/i;
  const JUNK = /\b(chips|crisps|fries|fried|nuggets?|hot ?dogs?|bacon|sausages?|candy|candies|sweets|gumm(y|ies)|sodas?|cola|cookies|biscuits|donuts?|doughnuts?|cakes?|pastr(y|ies)|croissants?|instant noodles|pizza|burgers?|energy drinks?|chocolate bars?|ice cream|margarine)\b/i;
  const TOMATO = /\btomato(es)?\b/i;
  const FRUIT = /\b(berry|berries|blueberries|raspberries|strawberries|blackberries|cherry|cherries|apples?|pears?|bananas?|oranges?|clementines?|mandarins?|figs?|dates|grapes?|kiwis?|mangoe?s?|pomegranates?|melons?|watermelons?|peach(es)?|nectarines?|apricots?|plums?|pineapples?|papayas?|persimmons?|avocados?)\b/i;
  const BERRY = /\b(berry|berries|blueberries|raspberries|strawberries|blackberries|cherry|cherries)\b/i;
  const GREENS = /\b(spinach|kale|rocket|arugula|lettuce|chard|collards?|bok choy|pak choi|watercress|greens|leaves|mesclun|romaine)\b/i;
  const VEG = /\b(broccoli|broccolini|cauliflower|mushrooms?|shiitake|portobello|tomato(es)?|peppers?|capsicums?|courgettes?|zucchinis?|carrots?|cucumbers?|beetroots?|beets?|celery|cabbage|squash|pumpkin|aubergines?|eggplants?|asparagus|fennel|peas|green beans|string beans|runner beans|brussels sprouts|romanesco|radish(es)?|turnips?|parsnips?|okra|artichokes?|corn)\b/i;
  const NOT_FRESH_VEG = /\b(pickled|canned|tinned|crisps|chips|fries|powder|paste|sauce|soup|flakes|(black|white|ground|cayenne) pepper|peppercorns?)\b/i;
  const SPROUTS = /\b(sprouts?|sprouted|microgreens|alfalfa)\b/i;
  const LEGUME = /\b(lentils?|chickpeas?|garbanzos?|beans?|split peas|dal|dhal)\b/i;
  const NOT_LEGUME = /\b(green beans|string beans|runner beans|bean sprouts|coffee beans?|cocoa beans?|vanilla beans?|jelly beans?)\b/i;
  const NUT = /\b(nuts?|walnuts?|almonds?|macadamias?|cashews?|pistachios?|hazelnuts?|pecans?|peanuts?|brazil nuts?|pine nuts?|nut mix|trail mix)\b/i;
  const FLAXCHIA = /\b(flax|flaxseeds?|linseeds?|chia)\b/i;
  const OLIVE_OIL = /\bolive oil\b/i;
  const HONEY = /\bhoney\b/i;
  const DRY = /\b(dry|dried|uncooked|raw)\b/i;

  /* What one food is, by its name: { fruit, berry, veg, greens, sprouts, legume, nut, flaxchia, oliveoil, honey, junk,
     allium } (true or false). Read from the name only, so a food typed by hand counts like a kitchen item. */
  function kindsOf(name) {
    const n = String(name || "");
    const made = has(MADE, n), oil = /\boils?\b/i.test(n);
    const tomato = has(TOMATO, n);
    const brussels = /\bbrussels sprouts\b/i.test(n);
    const k = {
      fruit: !made && !tomato && has(FRUIT, n),
      berry: !made && !tomato && has(BERRY, n),
      greens: !made && !has(NOT_FRESH_VEG, n) && has(GREENS, n),
      veg: false,
      sprouts: !brussels && !made && has(SPROUTS, n),
      legume: !oil && !/\b(milk|flour|pasta|noodles)\b/i.test(n) && has(LEGUME, n) && !has(NOT_LEGUME, n),
      nut: !made && !/\bbutter\b/i.test(n) ? has(NUT, n) : /\b(nut|peanut|almond|cashew) butter\b/i.test(n),
      flaxchia: !oil && has(FLAXCHIA, n),
      oliveoil: has(OLIVE_OIL, n),
      honey: has(HONEY, n),
      junk: has(JUNK, n),
      allium: has(ALLIUM, n),
    };
    k.veg = !made && !has(NOT_FRESH_VEG, n) && !k.sprouts && (k.greens || has(VEG, n) || brussels);
    return k;
  }

  // a piece of a food, in grams, for a count ("1 red pepper", "2 Brazil nuts"); null when it cannot be guessed
  const PIECE = [
    [/\bbrazil nuts?\b/i, 5], [/\bwalnuts?\b/i, 4], [/\b(almonds?|cashews?|hazelnuts?|pecans?|macadamias?|pistachios?)\b/i, 1.5],
    [/\b(cans?|tins?|jars?)\b/i, 240], [/\b(peppers?|capsicums?)\b/i, 150], [/\b(courgettes?|zucchinis?|aubergines?|eggplants?)\b/i, 200],
    [/\bcarrots?\b/i, 70], [/\bcherry tomato(es)?\b/i, 15], [/\btomato(es)?\b/i, 120], [/\bcucumbers?\b/i, 300],
    [/\b(broccoli|cauliflower|cabbage|lettuce|romanesco)\b/i, 400], [/\bbananas?\b/i, 120], [/\b(apples?|pears?|oranges?|peach(es)?|nectarines?)\b/i, 160],
    [/\b(kiwis?|clementines?|mandarins?|plums?|apricots?|figs?)\b/i, 60], [/\bavocados?\b/i, 150], [/\bmangoe?s?\b/i, 300],
    [/\bdates\b/i, 8], [/\bmushrooms?\b/i, 20], [/\b(lemons?|limes?)\b/i, 60],
  ];
  const pieceG = (name) => { const hit = PIECE.find(([re]) => re.test(String(name || ""))); return hit ? hit[1] : null; };
  // "2 tbsp", "½ tsp", "175 g", "15 ml", "1", "1 medium": { n, unit } or null
  const FRAC = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };
  function readAmt(text) {
    const s = String(text || "").trim().replace(/[½¼¾⅓⅔]/g, (c) => ` ${FRAC[c]}`).trim();
    const m = /^(\d+(?:\.\d+)?)?(?:\s*(\d+)\s*\/\s*(\d+)|\s+(0\.\d+))?\s*(kg|g|ml|l|tbsp|tsp|cups?|medium|large|small)?(?![a-z])/i.exec(s);
    if (!m || (m[1] == null && m[2] == null && m[4] == null)) return null;
    const n = (m[1] != null ? +m[1] : 0) + (m[2] != null ? +m[2] / +m[3] : 0) + (m[4] != null ? +m[4] : 0);
    const u = (m[5] || "").toLowerCase();
    return n > 0 ? { n, unit: u === "medium" || u === "large" || u === "small" ? "" : u } : null;
  }
  /* About how many grams (or ml) of a food: { n (name), q, u } with q in u ("g", "ml", "" a count), or { n, amt } (a
     recipe amount text). Spoons: 1 tbsp 15 ml of a liquid or oil, else 10 g; 1 tsp 5 ml or 3 g; a cup 240. null when it
     cannot be told (no amount, or a count of a food with no usual weight). */
  function gramsOf(f) {
    if (!f) return null;
    const liquid = /\b(oils?|milks?|juices?|vinegars?|water|syrups?)\b/i.test(f.n || "");
    let n, u;
    if (typeof f.q === "number" && isFinite(f.q)) { n = f.q; u = f.u === "g" || f.u === "ml" ? f.u : ""; }
    else { const a = readAmt(f.amt); if (!a) return null; n = a.n; u = a.unit; }
    if (u === "g" || u === "ml") return n;
    if (u === "kg" || u === "l") return n * 1000;
    if (u === "tbsp") return n * (liquid ? 15 : 10);
    if (u === "tsp") return n * (liquid ? 5 : 3);
    if (u === "cup" || u === "cups") return n * 240;
    const p = pieceG(f.n);
    return p == null ? null : n * p;
  }
  // grams of protein in a gram of a food (a rough guide, plants first; only for the 30 g protein in a morning meal)
  const PROTEIN = [
    [/\b(protein powder|pea protein|whey|protein)\b/i, 0.75], [/\bcollagen\b/i, 0.9], [/\bseitan\b/i, 0.25], [/\btempeh\b/i, 0.19],
    [/\btofu\b/i, 0.13], [/\bedamame\b/i, 0.11], [/\bnutritional yeast\b/i, 0.5], [/\bhemp\b/i, 0.32], [/\bpumpkin seeds?\b/i, 0.3],
    [/\bpeanuts?\b/i, 0.26], [/\b(sunflower seeds?|chia|flax\w*|linseeds?)\b/i, 0.18], [/\beggs?\b/i, 0.13], [/\b(greek )?yogh?urt\b/i, 0.05],
    [/\bsoy milk\b/i, 0.033], [/\b(oats|quinoa)\b/i, 0.13],
  ];
  function proteinOf(f, g, k) {
    const n = String(f.n || "");
    if (k.legume) return g * 0.08;   // cooked weight (dry is turned into cooked first)
    if (k.nut) return g * 0.18;
    const hit = PROTEIN.find(([re]) => re.test(n));
    return hit ? g * hit[1] : 0;
  }
  // what a food took: none when he set it to 0
  const eaten = (f) => !(typeof f.q === "number" && f.q === 0);

  /* What a meal's foods earn. foods: [{ n, q, u } or { n, amt }]; opt.morning: a morning meal (the protein tile).
     Returns { ids: [tile ids, in TILE_ORDER], got: { veg, greens, legumes, nuts, berries, evoo, seeds, protein } (the
     amounts added up, rounded) }. */
  const TILE_ORDER = ["fruit", "fveg", "sprouts", "pnuts", "honey", "protein", "legumes", "veg", "greens", "evoo", "nuts", "berries", "seeds", "junk", "neg"];
  const NEED = { protein: 30, legumes: 150, veg: 250, greens: 50, evoo: 15, nuts: 30, berries: 100, seeds: 10 };
  function earn(foods, opt) {
    const o = opt || {}, on = new Set(), got = { protein: 0, legumes: 0, veg: 0, greens: 0, evoo: 0, nuts: 0, berries: 0, seeds: 0 };
    for (const f of Array.isArray(foods) ? foods : []) {
      if (!f || !f.n || !eaten(f)) continue;
      const k = kindsOf(f.n);
      if (k.fruit) on.add("fruit");
      if (k.veg) on.add("fveg");
      if (k.sprouts) on.add("sprouts");
      if (k.nut) on.add("pnuts");
      if (k.honey) on.add("honey");
      if (k.junk) on.add("junk");
      if (k.allium) on.add("neg");
      let g = gramsOf(f);
      if (g == null) continue;
      if (k.legume && DRY.test(f.n)) g *= 2.5;   // dry lentils or beans weigh about 2.5 times as much cooked
      if (k.legume) got.legumes += g;
      if (k.veg && !/\bpotato(es)?\b/i.test(f.n)) got.veg += g;
      if (k.greens) got.greens += g;
      if (k.oliveoil) got.evoo += g;
      if (k.nut) got.nuts += g;
      if (k.berry) got.berries += g;
      if (k.flaxchia) got.seeds += g;
      got.protein += proteinOf(f, g, k);
    }
    for (const id of Object.keys(NEED)) {
      got[id] = Math.round(got[id] * 10) / 10;
      if (id === "protein" && !o.morning) continue;
      if (got[id] >= NEED[id] - 0.05) on.add(id);
    }
    return { ids: TILE_ORDER.filter((id) => on.has(id)), got };
  }
  // a short word for each tile on the "Counted:" line
  const WORD = { fruit: "fresh fruit", fveg: "fresh veg", sprouts: "sprouts", pnuts: "nuts", honey: "honey", protein: "30 g protein",
    legumes: "lentils or beans", veg: "250 g veg", greens: "leafy greens", evoo: "olive oil", nuts: "30 g nuts", berries: "berries",
    seeds: "flax or chia", junk: "processed", neg: "onion or garlic", fresh: "freshly made", light: "stopped before full", attn: "ate with attention",
    blueprint: "Blueprint meal", ferment: "fermented food", xylitol: "xylitol", supps: "supplements" };

  root.QuestFoodScore = { kindsOf, gramsOf, readAmt, earn, TILE_ORDER, NEED, WORD };
})(typeof window !== "undefined" ? window : globalThis);
