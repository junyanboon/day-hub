/* Day Quest kitchen (Junyan, 2026-10-20, d21 and d25 to d31: "31 yes"): what is in the pantry, the fridge and the travel
   fridge, and the shopping list it makes. No points and no rewards (d30: "I don't want a reward system I want a way to make
   things practical (remember NVC)"), so the sheet opens with the need it meets (NEED) and nothing here pays.
   - Two kitchens (d26): Home (Fridge, Freezer, Pantry) and the Travel fridge (Cool box, Dry bag), each with its own items.
   - Levels, not grams (d25): Plenty, Half, Low, Out. One tap steps an item down, Out goes back to Plenty.
   - Home starts from the agreed catalogue (SEED) in a grey "not checked yet" state: no level, not low, not on the list,
     until he taps the item (the first tap means Plenty). The travel fridge starts empty. No level is ever made up.
     The shelf "Looks right" button is gone (2026-10-20, d32): the sheet's "Not checked" filter is the way through first setup.
   - Food groups inside each shelf (2026-10-20, d34): every item stores its own group (item.group, saved and merged with the
     rest of the item). The word list (GROUPS) is only a first guess, for catalogue items and for new ones; he can change it
     when adding, in Edit, or by dragging the item onto another group.
   - Use first: fresh food expected to turn within 2 days. The shelf life (FRESH) is internal only, never shown (d28).
   - Run-low estimate (d28: "once it's low I need to buy more.. it can estimate when I'll go low"): days per level step start
     from rough defaults (fresh food fast, pantry and freezer slow) and learn his pace from his own taps and dinner ticks.
   - Shopping list: Low and Out, plus what will run low before the next Groceries block, by shelf, with an amount and how many
     dinners it covers where a Blueprint dish or tonight's idea uses it (d28).
   - Dinner ticks step the matching item down one level, and an untick steps it back (d21, d28).
   - Trip end (d27, d30): once the travel fridge stops being the active kitchen, ask once what to bring home, then empty it.
   - Receipt photos (d29) are not built. The seam: anything that fills levels in bulk calls setLevel(K, id, lv, at, src) with
     its own src (a receipt would use "receipt", which counts as a restock), so learning and the shopping list need no change.
   2026-10-21 (Junyan, d42 to d47: "42 yes", "44 yes", "45 yes", "46 yes", "47 yes"): amounts instead of levels.
   - An item may hold an amount (q, in u: "g", "ml", or "" for a count, like bananas or limes). Its tile shows what is left
     ("350 g", "4"); the pips are a rough fill against what he last bought (buy). Items with no number keep their levels and
     their tap (d46); nothing gets a made-up number.
   - Amounts go down by themselves from the meal sheet (d44, d47), never from a tap (d43): a tap on an amount item opens
     its Edit page, which is the one manual fix.
   - What a meal took is a record per tick in K.used (key: the day, the meal, the dish and the ingredient, or "kitchen"
     and the item id), { id, q, u, t, at, off }. The amount left is worked out on every read: the stored amount (q, set at
     qt) minus every record for that item ticked since qt that is not taken back, never below 0. Nothing is subtracted in
     place, so a redraw or a merge cannot take anything off twice: the merge keeps one record per key (the later change),
     and an untick is the same record marked off. A tick from before amounts (no q) takes nothing off.
   - Low (d45): under 2 meals' worth by the Blueprint dishes that use it, else under a quarter of what he last bought;
     0 is Out. "Low by" and the shopping amounts use his real use over the last 14 days, else one dish a day.
   The state is G.kitchen, kept across days and synced like the rest of the game; QuestMerge.mergeKitchen (quest-merge.js, also
   run by still-api) merges two devices item by item, the later change winning. Pure, so it can be tested (node --test still/test). */
(function (root) {
  "use strict";
  const DAY = 86400000;
  const NEED = "Knowing what's here, so dinner is easy and nothing goes to waste.";
  const LEVELS = ["Out", "Low", "Half", "Plenty"];
  // slow: pantry-like shelves, whose things last weeks (the run-low default and the shelf an item brought home lands on)
  const KITCHENS = {
    home: { id: "home", icon: "🏠", name: "Home", shelves: [
      { id: "fridge", name: "Fridge", cls: "" }, { id: "freezer", name: "Freezer", cls: "f", slow: true },
      { id: "pantry", name: "Pantry", cls: "p", slow: true }] },
    travel: { id: "travel", icon: "🚐", name: "Travel fridge", shelves: [
      { id: "cool", name: "Cool box", cls: "" }, { id: "dry", name: "Dry bag", cls: "p", slow: true }] },
  };
  // where a travel item goes when he brings it home
  const HOME_SHELF = { cool: "fridge", dry: "pantry" };
  // the agreed catalogue (prototype "Stock the Fridge", 2026-10-20): [shelf, icon, name]. Home only.
  const SEED = [
    ["fridge", "🥦", "Broccoli"], ["fridge", "🥬", "Cauliflower"], ["fridge", "🍄", "Shiitake"], ["fridge", "🫚", "Ginger"],
    ["fridge", "🍋", "Lemons"], ["fridge", "🍋‍🟩", "Limes"], ["fridge", "🥬", "Spinach"], ["fridge", "🍅", "Tomatoes"],
    ["fridge", "🫑", "Red peppers"], ["fridge", "🥒", "Courgette"], ["fridge", "🌿", "Rocket"], ["fridge", "🌿", "Parsley"],
    ["fridge", "🫐", "Blueberries"], ["fridge", "🌱", "Sprouts"], ["fridge", "🍎", "Apples"], ["fridge", "🥕", "Carrots"],
    ["fridge", "🥛", "Macadamia milk"], ["fridge", "🧃", "Pomegranate juice"], ["fridge", "🌾", "Ground flax"], ["fridge", "🥬", "Kale"],
    ["fridge", "🥑", "Avocados"], ["fridge", "🫒", "Olives"], ["fridge", "🍐", "Pears"], ["fridge", "🥥", "Coconut yogurt"],
    ["fridge", "🫙", "Sauerkraut"],
    ["freezer", "🍒", "Cherries"], ["freezer", "🫐", "Frozen berries"], ["freezer", "🫛", "Peas"], ["freezer", "🥦", "Frozen broccoli"],
    ["freezer", "🍞", "Seeded bread"],
    ["pantry", "🫘", "Black lentils"], ["pantry", "🫘", "Green lentils"], ["pantry", "🫘", "Chickpeas"], ["pantry", "🫘", "White beans"],
    ["pantry", "🌾", "Quinoa"], ["pantry", "🍚", "Basmati rice"], ["pantry", "🌾", "Oats"], ["pantry", "🫒", "Olive oil"],
    ["pantry", "🥣", "Tahini"], ["pantry", "🌱", "Hemp seeds"], ["pantry", "🌱", "Chia seeds"], ["pantry", "🥜", "Walnuts"],
    ["pantry", "🌰", "Macadamias"], ["pantry", "🌰", "Brazil nuts"], ["pantry", "🌰", "Almonds"], ["pantry", "🎃", "Pumpkin seeds"],
    ["pantry", "🍫", "Cocoa"], ["pantry", "🍯", "Honey"], ["pantry", "🧂", "Sea salt"], ["pantry", "🌶️", "Smoked paprika"],
    ["pantry", "🟤", "Cumin"], ["pantry", "🟡", "Turmeric"], ["pantry", "🟤", "Cinnamon"], ["pantry", "🍶", "Apple cider vinegar"],
    ["pantry", "🍶", "Sherry vinegar"], ["pantry", "🟡", "Saffron"], ["pantry", "🍵", "Ginger tea"], ["pantry", "🧂", "Electrolytes"],
  ];
  // rough shelf life in days once bought (d28: internal only, never shown), by name key. Over 20 days counts as slow.
  const FRESH = { broccoli: 5, cauliflower: 7, shiitake: 5, ginger: 21, lemon: 21, lime: 14, spinach: 4, tomato: 5,
    "red pepper": 7, courgette: 6, rocket: 3, parsley: 5, blueberry: 5, sprout: 3, apple: 30, carrot: 21, "macadamia milk": 7,
    "pomegranate juice": 7, kale: 5, avocado: 4, pear: 7, "coconut yogurt": 7, "cherry tomato": 5 };
  const FAST_STEP = 3, SLOW_STEP = 15;   // days per level step before he has taught it anything (prototype lowIn)
  const HIST_MAX = 12, CORRECT_MS = 10 * 60000, MIN_SAMPLE_MS = 12 * 3600000;

  const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
  const arr = (x) => (Array.isArray(x) ? x : []);
  const ms = (s) => { const t = typeof s === "number" ? s : Date.parse(s); return isNaN(t) ? 0 : t; };
  const iso = (t) => new Date(ms(t)).toISOString();
  const clone = (x) => JSON.parse(JSON.stringify(x || {}));

  /* An item's name as a match key (d21: "Black lentils, dry" is the Black lentils): lower case, the part before a comma,
     no brackets, no "fresh", "ground", "baby" or "extra virgin", the last word singular, then a few aliases. */
  const ALIAS = { "shiitake mushroom": "shiitake", "macadamia nut": "macadamia", "green or brown lentil": "green lentil",
    "cocoa powder": "cocoa", flaxseed: "flax", "cherry tomato": "tomato", "sea salt flake": "sea salt" };
  const single = (w) => /ies$/.test(w) ? w.slice(0, -3) + "y" : /oes$/.test(w) ? w.slice(0, -2)
    : /(ch|sh|ss|x)es$/.test(w) ? w.slice(0, -2) : /ss$/.test(w) ? w : /s$/.test(w) ? w.slice(0, -1) : w;
  function keyOf(name) {
    let s = String(name || "").toLowerCase().replace(/\([^)]*\)/g, " ").split(",")[0];
    s = s.replace(/\b(fresh|ground|baby|extra virgin|dried|cooked|raw|soaked|grated|organic)\b/g, " ").replace(/\s+/g, " ").trim();
    const w = s.split(" ");
    if (w.length) w[w.length - 1] = single(w[w.length - 1]);
    s = w.join(" ");
    return ALIAS[s] || s;
  }
  const slug = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");   // "Red peppers" -> "red-peppers"
  const SEED_ITEMS = SEED.map(([shelf, em, name], i) => ({ id: "h:" + slug(name), k: "home", shelf, em, name, lv: null, seed: i }));
  // Food groups (2026-10-20, d34), in the order a shelf shows them
  const GROUP_NAMES = ["Vegetables", "Fruit", "Herbs", "Legumes and grains", "Nuts and seeds", "Spices", "Oils, vinegars and sweet",
    "Drinks and ferments", "Other"];
  /* The first guess of an item's group from its name. The rules run in this order on whole words only, so
     "Chickpeas" is a legume before "peas" could make it a vegetable, and "Coconut yogurt" or "Macadamia milk" are drinks
     before "nut" could make them nuts; oils and vinegars come before grains so "Rice vinegar" is a vinegar. A guess only: the item keeps whatever group it is given after. */
  const GROUPS = [
    ["Drinks and ferments", /\b(milk|juices?|yogh?urts?|kefir|sauerkraut|kimchi|kombucha|tea|coffee|electrolytes?|miso)\b/i],
    ["Oils, vinegars and sweet", /\b(oils?|vinegars?|honey|syrup|tahini|jam|sugar|chocolate)\b/i],
    ["Legumes and grains", /\b(lentils?|chickpeas?|beans?|garbanzos?|hummus|tofu|tempeh|edamame|quinoa|rice|oats|bread|pasta|noodles|buckwheat|millet|flour|couscous|barley)\b/i],
    ["Spices", /\b(salt|paprika|cumin|turmeric|cinnamon|saffron|cocoa|(black|white) pepper|peppercorns?|asafoetida|cardamom|nutmeg|cloves|chilli flakes|curry powder|oregano)\b/i],
    ["Nuts and seeds", /\b(nuts?|peanuts?|walnuts?|almonds?|macadamias?|cashews?|pistachios?|hazelnuts?|pecans?|seeds?|flax|flaxseed|chia|hemp|sesame)\b/i],
    ["Herbs", /\b(parsley|coriander|cilantro|basil|mint|dill|rosemary|thyme|chives|sage)\b/i],
    ["Fruit", /\b(lemons?|limes?|berry|berries|blueberries|raspberries|strawberries|apples?|pears?|cherry|cherries|bananas?|oranges?|figs?|dates|grapes?|kiwis?|mangoe?s?|pomegranates?|melons?|peach(es)?|plums?)\b/i],
    ["Vegetables", /\b(broccoli|cauliflower|shiitake|mushrooms?|spinach|tomato(es)?|peppers?|courgettes?|zucchinis?|rocket|arugula|carrots?|kale|avocados?|peas|sprouts|ginger|garlic|olives?|onions?|leeks?|cucumbers?|beetroots?|beets?|lettuce|celery|cabbage|chard|squash|pumpkin|potato(es)?|sweet potato(es)?|aubergines?|eggplants?|asparagus|fennel)\b/i],
  ];
  const guessGroup = (name) => (GROUPS.find((g) => g[1].test(String(name || ""))) || ["Other"])[0];
  const okGroup = (g) => (GROUP_NAMES.includes(g) ? g : null);
  // the shelf a new item's group usually lives on: fresh food in the fridge or cool box, the rest in the pantry or dry bag
  const FRESH_GROUPS = new Set(["Vegetables", "Fruit", "Herbs", "Drinks and ferments"]);
  const guessShelf = (k, group) => (k === "travel" ? (FRESH_GROUPS.has(group) ? "cool" : "dry") : FRESH_GROUPS.has(group) ? "fridge" : "pantry");
  /* Icons (Junyan, 2026-10-20, d38: "38 yes"): a new item showed 🛒. Now: the catalogue's icon for the same food, else a
     word in its name (WORD_ICONS, whole words, first match), else its group's own icon (GROUP_ICONS). An icon that came
     from the group is never stored (put leaves it out), so it follows the item when he moves it to another group. An old
     stored 🛒 counts as no icon, so his items from before show a food icon too: worked out on every read, nothing is
     written for it, and the two devices cannot disagree. Any other stored icon stays as it is. */
  const ICONS = Object.fromEntries(SEED.map(([, em, name]) => [keyOf(name), em]));
  const GROUP_ICONS = { "Vegetables": "🥦", "Fruit": "🍎", "Herbs": "🌿", "Legumes and grains": "🫘", "Nuts and seeds": "🥜", "Spices": "🧂",
    "Oils, vinegars and sweet": "🫒", "Drinks and ferments": "🥛", "Other": "🧺" };
  const WORD_ICONS = [
    [/\bpeanuts?\b/i, "🥜"], [/\bsweet potato(es)?\b/i, "🍠"], [/\b(eggplants?|aubergines?)\b/i, "🍆"], [/\bcoconuts?\b/i, "🥥"],
    [/\bvinegars?\b/i, "🍶"], [/\b(oils?|olives?)\b/i, "🫒"], [/\bhoney\b/i, "🍯"], [/\b(chocolate|cocoa)\b/i, "🍫"],
    [/\b(milk|kefir)\b/i, "🥛"], [/\bjuices?\b/i, "🧃"], [/\b(coffee|espresso)\b/i, "☕"], [/\btea\b/i, "🍵"], [/\bwater\b/i, "💧"],
    [/\bwine\b/i, "🍷"], [/\bbeers?\b/i, "🍺"],
    [/\b(pasta|spaghetti|penne|fusilli|macaroni|linguine)\b/i, "🍝"], [/\b(noodles?|ramen|udon|soba)\b/i, "🍜"], [/\brice\b/i, "🍚"],
    [/\b(bread|loaf|baguette|bagels?)\b/i, "🍞"], [/\b(tortillas?|wraps?)\b/i, "🌯"], [/\b(oats|quinoa|flour|barley|millet|buckwheat|couscous)\b/i, "🌾"],
    [/\b(beans?|lentils?|chickpeas?|hummus|garbanzos?|edamame)\b/i, "🫘"], [/\bpeas\b/i, "🫛"], [/\b(tofu|tempeh)\b/i, "🧊"],
    [/\beggs?\b/i, "🥚"], [/\bcheese\b/i, "🧀"], [/\bbutter\b/i, "🧈"], [/\b(chicken|turkey)\b/i, "🍗"], [/\b(fish|salmon|tuna|sardines?|cod)\b/i, "🐟"],
    [/\b(shrimps?|prawns?)\b/i, "🦐"],
    [/\bbananas?\b/i, "🍌"], [/\b(tomato(es)?|passata)\b/i, "🍅"], [/\bapples?\b/i, "🍎"], [/\bpears?\b/i, "🍐"], [/\b(oranges?|clementines?|mandarins?)\b/i, "🍊"],
    [/\blemons?\b/i, "🍋"], [/\bgrapes?\b/i, "🍇"], [/\bstrawberr(y|ies)\b/i, "🍓"], [/\bcherr(y|ies)\b/i, "🍒"], [/\b(berry|berries|blueberries|raspberries)\b/i, "🫐"],
    [/\b(peach(es)?|apricots?|nectarines?)\b/i, "🍑"], [/\bmangoe?s?\b/i, "🥭"], [/\bpineapples?\b/i, "🍍"], [/\bkiwis?\b/i, "🥝"], [/\bwatermelons?\b/i, "🍉"],
    [/\bmelons?\b/i, "🍈"], [/\bavocados?\b/i, "🥑"],
    [/\bpotato(es)?\b/i, "🥔"], [/\bonions?\b/i, "🧅"], [/\bgarlic\b/i, "🧄"], [/\bcarrots?\b/i, "🥕"], [/\bcorn\b/i, "🌽"], [/\b(cucumbers?|courgettes?|zucchinis?)\b/i, "🥒"],
    [/\b(lettuce|spinach|kale|cabbage|chard|greens)\b/i, "🥬"], [/\bbroccoli\b/i, "🥦"], [/\bmushrooms?\b/i, "🍄"], [/\b(chill?i(es)?|jalapenos?)\b/i, "🌶️"],
    [/\b((black|white) pepper|peppercorns?)\b/i, "🧂"], [/\bpeppers?\b/i, "🫑"], [/\bginger\b/i, "🫚"], [/\b(salt|electrolytes?)\b/i, "🧂"], [/\b(nuts?|almonds?|walnuts?|cashews?|hazelnuts?|pecans?|pistachios?)\b/i, "🌰"],
    [/\b(seeds?|chia|flax|hemp)\b/i, "🌱"], [/\b(cans?|tins?|soup)\b/i, "🥫"], [/\bpopcorn\b/i, "🍿"],
  ];
  const groupIcon = (group) => GROUP_ICONS[okGroup(group) || "Other"];
  // the icon an item gets when it has none of its own: the catalogue's, a word in its name, else its group's
  function iconFor(name, group) {
    const n = String(name || ""), w = WORD_ICONS.find((x) => x[0].test(n));
    return ICONS[keyOf(n)] || (w && w[1]) || groupIcon(group || guessGroup(n));
  }
  const ownIcon = (em) => typeof em === "string" && !!em && em !== "🛒";

  /* Amounts (Junyan, 2026-10-20, d39: "39 yes"): "400g navy beans" became a tile cut off as "400g nav…". An amount at the
     start or end of a name is split off when he adds or renames: "400g navy beans", "500 g pasta", "pasta 500g",
     "2 x 400g chickpeas", "1L oat milk", "6 eggs". The name keeps the food with a capital first letter ("Navy beans"); the
     amount ("400 g") is stored on its own (item.amt) and shows on the tile's second line ("Plenty · 400 g"). Display only:
     nothing counts grams. A count with no unit ("6 eggs") only splits at the start, and an amount at the end needs a unit,
     so "Omega 3" stays whole. An item that never had the split (amt not stored) is split on every read, so his older items
     read right on both devices without a write. */
  const NUM = "\\d+(?:[.,]\\d+)?", UNIT = "kg|g|mg|ml|cl|dl|l|lbs?|oz";
  const LEAD = new RegExp(`^(?:(${NUM})\\s*[x×]\\s*)?(${NUM})(?:\\s*(${UNIT})(?![a-z])|(?=\\s))\\s*(?:of\\s+)?(.*)$`, "i");
  const TRAIL = new RegExp(`^(.*?)\\s+(?:(${NUM})\\s*[x×]\\s*)?(${NUM})\\s*(${UNIT})$`, "i");
  const AMT_ONLY = new RegExp(`^(?:(${NUM})\\s*[x×]\\s*)?(${NUM})\\s*(${UNIT})?$`, "i");
  // a first word in lower case gets a capital ("navy beans" -> "Navy beans"); "iPhone" or "BBQ sauce" stay as typed
  const cap = (s) => (/^[a-z]+(\s|$)/.test(s) ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  function fmtUnit(mult, num, unit) {
    const u = !unit ? "" : /^l$/i.test(unit) ? "L" : /^lbs$/i.test(unit) ? "lb" : unit.toLowerCase();
    return `${mult ? `${mult.replace(",", ".")} × ` : ""}${num.replace(",", ".")}${u ? ` ${u}` : ""}`;
  }
  // "400g navy beans" -> { name: "Navy beans", amt: "400 g" }; no amount -> { name (first letter capital), amt: "" }
  // "1,000 g" is a thousand grams, "1,5 kg" one and a half (review fix, 2026-10-21)
  const thou = (x) => String(x).replace(/(\d),(\d{3})(?!\d)/g, "$1$2");
  function splitName(raw) {
    const s = thou(String(raw || "").replace(/\s+/g, " ").trim());
    let m = LEAD.exec(s);
    /* the food must start with a letter ("2 % milk" stays whole), and a bare count with no unit only splits off a plural
       ("6 eggs", but not "5 spice", "3 bean salad" or "7 Up") */
    if (m && /^[a-z]/i.test(m[4]) && (m[3] || /[a-z]s$/i.test(m[4]))) return { name: cap(m[4].trim()).slice(0, 40), amt: fmtUnit(m[1], m[2], m[3]) };
    m = TRAIL.exec(s);
    if (m && /[a-z]/i.test(m[1])) return { name: cap(m[1].trim()).slice(0, 40), amt: fmtUnit(m[2], m[3], m[4]) };
    /* a bare count at the end (d42: "Bananas 4"): only after a plural or a food bought by the piece, so "Omega 3",
       "Vitamin B 12" or "Room 7" stay whole */
    m = TRAIL_N.exec(s);
    if (m && (/[a-z]s$/i.test(m[1]) || unitFor(m[1]) === "")) return { name: cap(m[1].trim()).slice(0, 40), amt: fmtUnit(null, m[2], "") };
    return { name: cap(s).slice(0, 40), amt: "" };
  }
  const TRAIL_N = /^(.*?[a-z])\s+(\d{1,3}(?:[.,]5)?)$/i;
  /* The unit a bare number means for a food (d42): a count for what is bought by the piece, ml for drinks and oils,
     else grams. "Black pepper", "Coconut yogurt" or "Lemon juice" are not counted by the piece. */
  const COUNT_FOODS = /\b(bananas?|avocados?|limes?|lemons?|apples?|pears?|eggs?|oranges?|clementines?|mandarins?|kiwis?|peach(es)?|nectarines?|plums?|mangoe?s?|grapefruits?|pomegranates?|coconuts?|melons?|pineapples?|courgettes?|zucchinis?|cucumbers?|peppers?|aubergines?|eggplants?|onions?|tomato(es)?|carrots?|potato(es)?|leeks?|lettuces?)\b/i;
  const LIQUID = /\b(milk|juices?|oils?|vinegars?|kefir|kombucha|water|wine|beers?|syrup|sauce|drinks?|shots?)\b/i;
  const NOT_PIECE = /\b(yogh?urts?|flakes|powder|paste|seeds?|flour|butter|dried|(black|white) pepper|peppercorns?|leaves|puree|passata|cherry tomato(es)?)\b/i;
  function unitFor(name) {
    const n = String(name || "");
    return LIQUID.test(n) ? "ml" : !NOT_PIECE.test(n) && COUNT_FOODS.test(n) ? "" : "g";
  }
  /* An amount as a number (d42): "400 g", "1.5 kg", "2 × 400 g", "1 L", "4" -> { q, u } in g, ml or a count (""). A bare
     number takes the unit the item already has (uHint), else the food's own (unitFor). null when there is no number. */
  const AMT_N = /^(?:(\d+(?:\.\d+)?)\s*[x×]\s*)?(\d+(?:\.\d+)?)\s*(kg|g|mg|ml|cl|dl|l|lbs?|oz)?$/i;
  const TO_BASE = { kg: [1000, "g"], g: [1, "g"], mg: [0.001, "g"], lb: [454, "g"], lbs: [454, "g"], oz: [28, "g"], l: [1000, "ml"], ml: [1, "ml"], cl: [10, "ml"], dl: [100, "ml"] };
  function qtyOf(text, name, uHint) {
    const m = AMT_N.exec(thou(String(text == null ? "" : text)).replace(/,/g, ".").replace(/\s+/g, " ").trim());
    if (!m) return null;
    const n = +m[2] * (m[1] ? +m[1] : 1);
    if (!isFinite(n) || n < 0) return null;
    if (!m[3]) return { q: n, u: typeof uHint === "string" ? uHint : unitFor(name) };
    const [f, u] = TO_BASE[m[3].toLowerCase()];
    return { q: Math.round(n * f * 10) / 10, u };
  }
  // an amount for the tile and the fields: "350 g", "1.2 kg", "500 ml", "1.5 L", "4", "0.5"
  function fmtQ(q, u) {
    const v = Math.max(0, +q || 0);
    if (u === "g") return v >= 1000 ? `${+(v / 1000).toFixed(2)} kg` : `${+v.toFixed(v < 10 ? 1 : 0)} g`;
    if (u === "ml") return v >= 1000 ? `${+(v / 1000).toFixed(2)} L` : `${+v.toFixed(v < 10 ? 1 : 0)} ml`;
    return String(+v.toFixed(1));
  }
  /* A recipe amount in an item's unit, for taking it off (d44): grams and ml as they are (1 ml is taken as about 1 g),
     spoons roughly (1 tbsp about 10 g or 15 ml, 1 tsp about 3 g or 5 ml), a count ("1", "2", "1 medium") only for an
     item counted by the piece. "a pinch", a bunch, or a count against grams: null (he can type it). */
  const FRAC = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };
  function recipeIn(amt, u) {
    const s = String(amt || "").trim().replace(/[½¼¾⅓⅔]/g, (c) => ` ${FRAC[c]}`).trim();
    // "2", "1.5", "1/2", "1 1/2", "0.5" (from ½), then the unit
    const m = /^(?:(\d+(?:\.\d+)?)\s+(?=\d+\s*\/))?(?:(\d+)\s*\/\s*(\d+)|(\d+(?:\.\d+)?)(?:\s+(0\.\d+))?)\s*(kg|g|ml|l|tbsp|tsp|medium|large|small)?(?![a-z])/i.exec(s);
    if (!m) return null;
    const n = (m[1] != null ? +m[1] : 0) + (m[2] != null ? +m[2] / +m[3] : 0) + (m[4] != null ? +m[4] : 0) + (m[5] != null ? +m[5] : 0);
    const unit = (m[6] || "").toLowerCase();
    if (!n) return null;
    if (unit === "kg" || unit === "g") return u === "g" || u === "ml" ? n * (unit === "kg" ? 1000 : 1) : null;
    if (unit === "l" || unit === "ml") return u === "g" || u === "ml" ? n * (unit === "l" ? 1000 : 1) : null;
    if (unit === "tbsp") return u === "g" ? n * 10 : u === "ml" ? n * 15 : null;
    if (unit === "tsp") return u === "g" ? n * 3 : u === "ml" ? n * 5 : null;
    return u === "" ? n : null;   // a count, or "1 medium"
  }
  // what he types in Edit's Amount field: "400g" -> "400 g"; anything else is kept as typed (short)
  function amtOf(s) {
    const v = thou(String(s == null ? "" : s).replace(/\s+/g, " ").trim()), m = AMT_ONLY.exec(v);
    return m ? fmtUnit(m[1], m[2], m[3]) : v.slice(0, 20);
  }
  const shelfOf = (k, id) => (KITCHENS[k] ? KITCHENS[k].shelves.find((s) => s.id === id) : null) || null;

  // a level read from saved (synced) state: 0 to 3, else not checked
  const okLv = (v) => (v === 0 || v === 1 || v === 2 || v === 3 ? v : null);
  // its group: the one it stores, else the first guess from its name (stored with the item at its next change)
  /* and (d38, d39) its amount split off a name that never had the split, and its icon: its own, else the one iconFor gives */
  function clean(it) {
    const sp = typeof it.amt === "string" || typeof it.name !== "string" ? null : splitName(it.name);
    const name = sp && sp.amt ? sp.name : it.name, group = okGroup(it.group) || guessGroup(name);
    const out = { ...it, name, amt: sp ? sp.amt : it.amt, lv: okLv(it.lv), group, em: ownIcon(it.em) ? it.em : iconFor(name, group) };
    /* d42: the amount as a number. One stored (q) stands; else the d39 amount ("400 g") is its first amount, read the same
       way on both devices with no write, from the item's last change (so only meals ticked after that count). */
    if (!(typeof out.q === "number" && isFinite(out.q) && out.q >= 0)) {
      delete out.q; delete out.u; delete out.qt; delete out.buy;
      const p = out.amt ? qtyOf(out.amt, name) : null;
      if (p) Object.assign(out, { q: p.q, u: p.u, qt: it.at || it.added || null, buy: p.q });
    } else {
      out.u = out.u === "g" || out.u === "ml" ? out.u : "";
      out.buy = +out.buy > 0 ? +out.buy : out.q;
    }
    return out;
  }
  const hasQ = (it) => !!it && typeof it.q === "number";
  /* The meals' take-offs by item (K.used records with an amount, not taken back), worked out once per used object. */
  const eatCache = new WeakMap();
  function eatsById(K) {
    const u = obj(K).used;
    if (!u || typeof u !== "object") return new Map();
    let m = eatCache.get(u);
    if (m) return m;
    m = new Map();
    for (const [key, e] of Object.entries(u)) {
      if (!e || e.off || typeof e.q !== "number" || !e.id) continue;
      if (!m.has(e.id)) m.set(e.id, []);
      m.get(e.id).push({ key, q: Math.max(0, e.q), t: ms(e.t) });
    }
    eatCache.set(u, m);
    return m;
  }
  /* A meal's worth of an item (d45): the most one Blueprint dish (QuestMeals.DISHES) uses, in the item's unit. Tonight's
     ideas change from day to day, so they do not set what "low" means. 0 when no dish uses it (or the unit cannot match). */
  const perCache = new Map();
  function perMeal(it) {
    const dishes = (root.QuestMeals && root.QuestMeals.DISHES) || [];
    const ck = `${it.name}|${it.u}|${dishes.length}`;
    if (perCache.has(ck)) return perCache.get(ck);
    let best = 0;
    for (const u of usesOf(it.name, dishes)) { const v = recipeIn(u.amt, it.u); if (v != null && v > best) best = v; }
    perCache.set(ck, best);
    return best;
  }
  /* An amount item as read (d42, d45): left (what is there now), low (the line under which it is low), per (a meal's
     worth), eats (its take-offs) and its level worked out: 0 Out, 1 Low, then 2 or 3 pips by how much of what he last
     bought is left. A level stored on it is not used. */
  function withLeft(K, it) {
    if (!hasQ(it)) return it;
    const from = ms(it.qt), eats = eatsById(K).get(it.id) || [];
    const eaten = eats.filter((e) => e.t >= from).reduce((a, e) => a + e.q, 0);
    const left = Math.max(0, Math.round((it.q - eaten) * 10) / 10), buy = it.buy, per = perMeal(it);
    const low = per ? 2 * per : buy / 4;
    const lv = left <= 0 ? 0 : left < low ? 1 : left >= (buy * 2) / 3 ? 3 : 2;
    return { ...it, left, eaten, low, per, eats, lv, amt: fmtQ(left, it.u) };
  }
  // every item of the kitchen, the catalogue under what he changed, deleted ones left out, in shelf then catalogue order
  function items(K, k) {
    const st = obj(obj(K).items), out = [], seen = new Set();
    for (const s of SEED_ITEMS) { seen.add(s.id); const it = clean(st[s.id] ? { ...s, ...st[s.id] } : s); if (!it.del && it.k === k) out.push(withLeft(K, it)); }
    for (const [id, it] of Object.entries(st)) if (!seen.has(id) && it && !it.del && it.k === k && typeof it.name === "string") out.push(withLeft(K, clean({ ...it, id })));
    const order = (KITCHENS[k] || { shelves: [] }).shelves.map((s) => s.id);
    return out.sort((a, b) => (order.indexOf(a.shelf) - order.indexOf(b.shelf)) || ((a.seed ?? 1e6) - (b.seed ?? 1e6)) || ms(b.added) - ms(a.added));
  }
  function item(K, id) {
    const st = obj(obj(K).items)[id], s = SEED_ITEMS.find((x) => x.id === id);
    if (!st && !s) return null;
    const it = clean(st ? { ...(s || {}), ...st, id } : s);
    return it.del ? it : withLeft(K, it);
  }
  /* A shelf's items in food groups (d34): the groups in GROUP_NAMES order, each alphabetical, so a tile never jumps when
     its level changes. list: the items to show. Returns [{ group, list }], empty groups left out. */
  function grouped(list) {
    const by = new Map(GROUP_NAMES.map((g) => [g, []]));
    for (const it of arr(list)) by.get(okGroup(it.group) || guessGroup(it.name)).push(it);
    return [...by].filter(([, l]) => l.length).map(([group, l]) => ({ group, list: l.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || (a.id < b.id ? -1 : 1)) }));
  }
  // write one item back (a change always carries its time, which is what the merge compares)
  function put(K, it, at) {
    const out = clone(K);
    out.items = obj(out.items);
    // left, low, per and eats are only worked out (withLeft), never stored
    const { seed, left, eaten, low, per, eats, ...rest } = it;
    // an icon that is only what iconFor gives (or the old 🛒) is not stored, so a group change can change it (d38)
    if (!ownIcon(rest.em) || (typeof rest.name === "string" && rest.em === iconFor(rest.name, rest.group))) delete rest.em;
    // an amount item stores its base amount (q at qt), and amt as its text, so a page from before still shows a number
    if (hasQ(rest)) rest.amt = fmtQ(rest.q, rest.u);
    out.items[it.id] = { ...rest, at: iso(at) };
    return out;
  }

  /* The history lines that still count: a line taken back is marked "<src>-off" at the same time (a dinner untick, the
     undo of a fill), and both the mark and the line it takes back are left out. The merge keeps lines from both devices
     (so a device that saw the line before the undo still has it); this filter is what makes the take-back stick. */
  function liveHist(hist) {
    const h = arr(hist), off = new Set(h.filter((x) => /-off$/.test(x[2])).map((x) => ms(x[0]) + "|" + x[2].slice(0, -4)));
    return h.filter((x) => !/-off$/.test(x[2]) && !off.has(ms(x[0]) + "|" + x[2]));
  }
  /* Set a level. src: "tap", "check" (the old shelf "Looks right", gone since d32), "dinner", "buy" (Mark ticked items as plenty), "home" (brought home),
     "add", "undo", or a later bulk filler like "receipt". Any rise is a restock: it starts a new run-low cycle and, at
     Plenty or on a first level, a fresh shelf-life clock. Two taps on the same item within 10 minutes are one answer
     (the second corrects the first), so a quick "Plenty, no, Half" never teaches a pace of minutes. */
  function setLevel(K, id, lv, at, src) {
    const it = item(K, id); if (!it) return K;
    const t = ms(at), was = it.lv;
    const hist = arr(it.hist).slice();
    const prev = liveHist(hist).pop();
    if (src === "tap" && prev && (prev[2] === "tap" || prev[2] === "check") && t - ms(prev[0]) < CORRECT_MS) {
      hist[hist.lastIndexOf(prev)] = [prev[0], lv, prev[2]];
      const first = hist.length === 1 || was == null;
      const n = { ...it, lv, hist };
      if (first || lv === 3) n.fresh = prev[0];
      return put(K, n, t);
    }
    hist.push([iso(t), lv, src || "tap"]);
    const n = { ...it, lv, since: iso(t), hist: hist.slice(-HIST_MAX) };
    if (was == null || (lv === 3 && was < 3)) n.fresh = iso(t);
    return put(K, n, t);
  }
  // one tap: not checked yet -> Plenty, then Plenty, Half, Low, Out, and back to Plenty (d25)
  const nextLevel = (lv) => (lv == null || lv === 0 ? 3 : lv - 1);
  // an item with an amount does not step (d43: its tap opens its Edit page, and meals take the amount off)
  const tap = (K, id, at) => { const it = item(K, id); return it && !hasQ(it) ? setLevel(K, id, nextLevel(it.lv), at, "tap") : K; };

  /* Set the amount there is now (d43: Edit's Amount field, the one manual fix). text: "350 g", "4", "1.5 L"; a bare
     number takes the item's unit (else the food's). It becomes the new base (q at qt), so meals ticked before it no longer
     count. "" takes the number away: the item goes back to the level it shows (d46). Text with no number ("a jar") is kept
     as words, as d39 did. Nothing changes (K back as is) when it already reads so. */
  function setAmount(K, id, text, at) {
    const it = item(K, id); if (!it || it.del) return K;
    const s = amtOf(text);
    if (!s) {
      if (!hasQ(it) && !it.amt) return K;
      const { q, u, qt, buy, ...rest } = it;
      return put(K, { ...rest, amt: "", lv: it.lv ?? null }, at);
    }
    const p = qtyOf(s, it.name, hasQ(it) ? it.u : undefined);
    if (!p) { if (s === (it.amt || "") && !hasQ(it)) return K; const { q, u, qt, buy, ...rest } = it; return put(K, { ...rest, amt: s }, at); }
    if (hasQ(it) && p.u === it.u && Math.abs(p.q - it.left) < 0.05) return K;
    // what he last bought (the pips' full mark) stays, unless this is his first number, a new unit, or more than that
    const buy = !hasQ(it) || p.u !== it.u ? p.q : Math.max(it.buy, p.q);
    return put(K, { ...it, q: p.q, u: p.u, qt: iso(at), buy: buy || p.q, lv: it.lv == null ? 3 : it.lv }, at);
  }
  /* Restock (Add, What did you buy?, What did you bring?, Mark ticked items as bought, brought home): what he got is added
     to what is left. amount: text ("500 g", "4") or { q, u }; none given: an amount item adds what he last bought, a level
     item goes to Plenty with no number (d46). Starts a new run-low cycle and a fresh shelf-life clock, as before. */
  function restock(K, id, amount, at, src) {
    const it0 = item(K, id); if (!it0) return K;
    let out = setLevel(K, id, 3, at, src || "buy");
    const it = item(out, id);
    const p = amount && typeof amount === "object" ? amount : amount ? qtyOf(amtOf(amount), it.name, hasQ(it0) ? it0.u : undefined) : null;
    if (hasQ(it0)) {
      const same = p && p.u === it0.u, got = same ? p.q : p ? null : it0.buy;
      if (got == null) out = put(out, { ...it, q: p.q, u: p.u, qt: iso(at), rt: iso(at), buy: p.q }, at);   // a new unit: what he typed is the amount
      else {
        /* the base grows by what he got, from the same qt, so a meal ticked before the shop still counts and its untick
           still puts it back; what meals took past 0 is folded in first, so he has exactly what he bought on top of 0 */
        const over = Math.max(0, it0.eaten - it0.q);
        out = put(out, { ...it, q: it0.q + over + got, rt: iso(at), buy: got || it0.buy }, at);
      }
    } else if (p) out = put(out, { ...it, q: p.q, u: p.u, qt: iso(at), rt: iso(at), buy: p.q }, at);
    else if (typeof amount === "string" && amtOf(amount)) out = put(out, { ...it, amt: amtOf(amount) }, at);   // words ("a jar"), as d39 kept them
    return out;
  }

  /* Add something new (Plenty: he just put it there), in the group he picked (else the guess from its name). The same name
     already in that kitchen is restocked instead of making a second tile; a deleted one comes back on the chosen shelf.
     amt (d42): an amount from a field; else one typed in the name ("Bananas 4", "400g oats"); else none. */
  function add(K, k, shelf, name, at, group, amt) {
    const sp = splitName(name), nm = sp.name;   // "400g navy beans": Navy beans, 400 g (d39)
    const given = amtOf(amt) || sp.amt;
    if (!nm || !shelfOf(k, shelf)) return { K, id: null };
    const key = keyOf(nm);
    const live = items(K, k).find((x) => keyOf(x.name) === key);
    if (live) return { K: restock(K, live.id, given || null, at, "add"), id: live.id };
    const dead = Object.entries(obj(obj(K).items)).find(([, x]) => x && x.del && x.k === k && keyOf(splitName(x.name || (item(K, x.id) || {}).name).name) === key);
    const sd = k === "home" ? SEED_ITEMS.find((x) => keyOf(x.name) === key) : null;
    const id = dead ? dead[0] : sd ? sd.id : "u" + ms(at).toString(36) + Math.random().toString(36).slice(2, 6);
    const g = okGroup(group) || okGroup((obj(obj(K).items)[id] || {}).group) || guessGroup(nm);
    const old = obj(obj(K).items)[id] || {}, sem = sd ? sd.em : null;
    const base = { ...(item(K, id) || {}), id, k, shelf, name: nm, amt: "", group: g, em: ownIcon(old.em) ? old.em : sem || iconFor(nm, g), lv: null, hist: [], added: iso(at) };
    delete base.del; delete base.q; delete base.u; delete base.qt; delete base.buy;
    const p = given ? qtyOf(given, nm) : null;
    if (p) Object.assign(base, { q: p.q, u: p.u, qt: iso(at), buy: p.q });
    else if (given) base.amt = given;
    return { K: setLevel(put(K, base, at), id, 3, at, "add"), id };
  }
  /* Rename, and (d39) the amount: one typed in the name is split off and wins; else amt (Edit's Amount field) when given,
     else the amount it had. An icon that came from its old name or group follows the new name (put leaves it out).
     The amount goes through setAmount (d42), so a new number is the amount there is now. */
  function rename(K, id, name, at, amt) {
    const it = item(K, id), sp = splitName(name);
    if (!it || !sp.name) return K;
    const a = sp.amt || (amt === undefined ? null : amtOf(amt));
    const raw = obj(obj(K).items)[id] || {}, seedEm = (SEED_ITEMS.find((x) => x.id === id) || {}).em;
    // an icon of its own or the catalogue's stays; one worked out from the old name is worked out again from the new one
    const em = ownIcon(raw.em) || seedEm ? it.em : iconFor(sp.name, it.group);
    let out = K;
    if (sp.name !== it.name || typeof raw.amt !== "string") out = put(K, { ...it, name: sp.name, em }, at);
    if (a != null && a !== (it.amt || "")) out = setAmount(out, id, a, at);
    return out;
  }
  const move = (K, id, shelf, at) => { const it = item(K, id); return it && shelfOf(it.k, shelf) ? put(K, { ...it, shelf }, at) : K; };
  /* Put an item in a group and on a shelf (d34: Edit's pickers, or a drag onto another group or shelf). Either may be left
     out (null) to keep it. Nothing changes (K comes back as is) when both are already so, or a value is not a real one. */
  function place(K, id, shelf, group, at) {
    const it = item(K, id); if (!it) return K;
    const sh = shelf == null ? it.shelf : shelf, g = group == null ? it.group : group;
    if (!shelfOf(it.k, sh) || !okGroup(g) || (sh === it.shelf && g === it.group)) return K;
    // an icon from its group (none of its own) follows the new group: put leaves it out and iconFor gives the new one (d38)
    const raw = obj(obj(K).items)[id] || {}, seedEm = (SEED_ITEMS.find((x) => x.id === id) || {}).em;
    const em = ownIcon(raw.em) || seedEm ? it.em : iconFor(it.name, g);
    return put(K, { ...it, shelf: sh, group: g, em }, at);
  }
  // a delete is kept as a mark (del), so the other device's copy cannot bring the item back
  const remove = (K, id, at) => { const it = item(K, id); return it ? put(K, { id, k: it.k, shelf: it.shelf, name: it.name, group: it.group, del: true }, at) : K; };

  /* Days per level step for this item: the default (fresh food 3, pantry, freezer and long-life food 15), averaged with what
     his own history shows: in each cycle since a restock, the time from the restock to its latest drop (a tap or a dinner),
     divided by the levels dropped. Drops under 12 hours from the restock teach nothing. Up to the last four cycles count. */
  function defaultStep(it) {
    const life = FRESH[keyOf(it.name)], sh = shelfOf(it.k, it.shelf);
    return (sh && sh.slow) || (life != null && life > 20) ? SLOW_STEP : FAST_STEP;
  }
  function pace(it) {
    const def = defaultStep(it), samples = [];
    let start = null, prevLv = null, cur = null;
    for (const [at, lv, src] of liveHist(it.hist).sort((a, b) => ms(a[0]) - ms(b[0]))) {
      // a new cycle: any rise, or a restock to Plenty that was already Plenty (a fill: bought or brought again, d35)
      if (start == null || lv > prevLv || (lv === 3 && src !== "tap" && src !== "dinner" && src !== "check")) { if (cur != null) samples.push(cur); cur = null; start = [ms(at), lv]; prevLv = lv; continue; }
      if (lv < start[1] && (src === "tap" || src === "dinner") && ms(at) - start[0] >= MIN_SAMPLE_MS) cur = (ms(at) - start[0]) / DAY / (start[1] - lv);
      prevLv = lv;
    }
    if (cur != null) samples.push(cur);
    const s = samples.slice(-4);
    return Math.max(0.25, Math.min(90, (def + s.reduce((a, b) => a + b, 0)) / (1 + s.length)));
  }
  // when it will be Low (ms); null when not checked yet. Low or Out: already (its level time).
  /* An amount item's use per day (d45): what meals took off it in the last 14 days, over the days since the first of
     those (at least 2), once it has two take-offs; else a meal's worth a day when a Blueprint dish uses it; else null. */
  function rateOf(it, now) {
    if (!hasQ(it)) return null;
    const t = ms(now), recent = arr(it.eats).filter((e) => e.t <= t && e.t > t - 14 * DAY && e.q > 0);
    if (recent.length >= 2) {
      const first = Math.min(...recent.map((e) => e.t)), days = Math.max(2, (t - first) / DAY + 1);
      return recent.reduce((a, e) => a + e.q, 0) / days;
    }
    return it.per || null;
  }
  function lowAt(it, now) {
    if (!it || it.lv == null) return null;
    if (hasQ(it) && typeof it.left === "number") {
      if (it.lv <= 1) return ms(now);
      const r = rateOf(it, now);
      return r ? ms(now) + ((it.left - it.low) / r) * DAY : null;   // no use known: no guess
    }
    const since = ms(it.since) || ms(it.at) || ms(now);
    if (it.lv <= 1) return since;
    const p = pace(it) * DAY;
    let est = since + (it.lv - 1) * p;
    if (it.seen) est = Math.max(est, ms(it.seen) + (it.lv - 1) * p * 0.5);   // still at this level when he last looked
    return est;
  }
  // will it run low before the next shop (only items at Half or Plenty)
  const lowSoon = (it, now, shopAt) => { if (!it || it.lv == null || it.lv < 2) return false; const a = lowAt(it, now); return a != null && a <= ms(shopAt); };
  // when fresh food is expected to turn (ms), or null for food that keeps
  function turnAt(it) {
    const life = FRESH[keyOf(it.name)];
    if (life == null || life > 20 || it.lv == null || it.lv === 0 || !it.fresh) return null;
    return ms(it.fresh) + life * DAY;
  }
  // Use first (d28): fresh food expected to turn within 2 days, soonest first
  function useFirst(K, k, now) {
    const t = ms(now);
    return items(K, k).map((it) => ({ it, at: turnAt(it) })).filter((x) => x.at != null && x.at - t <= 2 * DAY)
      .sort((a, b) => a.at - b.at);
  }

  /* The shop the list plans up to, from the Groceries blocks he has (today and the agenda's days ahead). A Groceries block
     that starts within 12 hours (or is on now) is the shop this list is for (soon), so the list plans to the one after it.
     No later block in sight: a week at home, 2 days on a trip. blocks: [{ t, s }].
     Returns { at (ms, the horizon), block (the block at that horizon, or null), soon (the shop coming up, or null) }. */
  const DEFAULT_SHOP = { home: 7, travel: 2 }, SOON_MS = 12 * 3600000;
  function nextShop(blocks, now, k) {
    const t = ms(now);
    const list = arr(blocks).filter((x) => x && /grocer/i.test(x.t || "") && ms(x.e || x.s) > t).sort((a, c) => ms(a.s) - ms(c.s));
    const soon = list.find((x) => ms(x.s) - t < SOON_MS) || null;
    const b = list.find((x) => ms(x.s) - t >= SOON_MS && (!soon || ms(x.s) - ms(soon.s) >= SOON_MS));
    return b ? { at: ms(b.s), block: b, soon } : { at: t + (DEFAULT_SHOP[k] || 7) * DAY, block: null, soon };
  }

  /* Amounts from the dishes (DISHES and IDEAS of quest-meals.js, passed in): which dishes use the item and how much, and
     what to buy for the dinners until the next shop (the largest amount one dish uses, times the dinners). Spoons and pinches
     are not scaled: those show the dishes only. */
  function parseAmt(s) {
    const m = /^(\d+(?:\.\d+)?)\s*(g|kg|ml|l|tbsp|tsp|medium|large|small|bunch)?\b/i.exec(String(s || "").trim());
    if (!m) return null;
    const u = (m[2] || "").toLowerCase();
    if (u === "tbsp" || u === "tsp") return null;
    if (u === "kg") return { q: +m[1] * 1000, u: "g" };
    if (u === "l") return { q: +m[1] * 1000, u: "ml" };
    return { q: +m[1], u: u === "g" || u === "ml" ? u : u === "bunch" ? "bunch" : "" };
  }
  function fmtAmt(q, u) {
    if (u === "g") return q >= 1000 ? `${+(q / 1000).toFixed(1)} kg` : `${Math.round(q)} g`;
    if (u === "ml") return q >= 1000 ? `${+(q / 1000).toFixed(1)} L` : `${Math.round(q)} ml`;
    if (u === "bunch") return `${Math.ceil(q)} bunch${Math.ceil(q) === 1 ? "" : "es"}`;
    return String(Math.ceil(q));
  }
  function usesOf(name, dishes) {
    const key = keyOf(name), out = [];
    for (const d of arr(dishes)) for (const [ing, amt] of arr(d.items)) if (keyOf(ing) === key) out.push({ dish: d.name, amt });
    return out;
  }
  function amountFor(name, dishes, dinners) {
    const uses = usesOf(name, dishes);
    /* the first amount that can be scaled, then the largest in the same unit; a Blueprint dish's amount (the meals he
       eats most, 2026-10-21: Super Veggie's broccoli is 175 g) comes before one of tonight's ideas */
    const bp = new Set(((root.QuestMeals && root.QuestMeals.DISHES) || []).map((d) => d.name));
    const order = uses.filter((u) => bp.has(u.dish)).concat(uses.filter((u) => !bp.has(u.dish)));
    let best = null, fromBp = false;
    for (const u of order) { const a = parseAmt(u.amt); if (!a) continue; if (fromBp && !bp.has(u.dish)) break;
      if (!best || (a.u === best.u && a.q > best.q)) { best = a; fromBp = bp.has(u.dish); } }
    return { uses, dinners: uses.length ? dinners : 0, amt: best ? fmtAmt(best.q * dinners, best.u) : null };
  }

  /* The shopping list for kitchen k (d28): Low and Out first, then what will run low before the next shop, by shelf.
     Items not checked yet are never on it. Each row: { it, why ("out" | "low" | "soon"), at (run-low ms), on (ticked),
     uses, amt, dinners }. dinners: the days from now to the next shop, 1 to 7. */
  function shopList(K, k, now, shopAt, dishes) {
    const t = ms(now), dinners = Math.max(1, Math.min(7, Math.ceil((ms(shopAt) - t) / DAY)));
    const ticks = obj(obj(K).shop), rank = { out: 0, low: 1, soon: 2, none: 3 };
    const rows = [];
    for (const it of items(K, k)) {
      if (it.lv == null) continue;
      const why = it.lv === 0 ? "out" : it.lv === 1 ? "low" : lowSoon(it, t, shopAt) ? "soon" : null;
      if (!why) continue;
      const row = { it, why, at: lowAt(it, t) ?? t, on: !!(ticks[it.id] && ticks[it.id].on), ...amountFor(it.name, dishes, dinners) };
      if (hasQ(it)) row.amt = fmtQ(toBuy(it, t, shopAt), it.u);   // d45: from what is left and his real use
      rows.push(row);
    }
    for (const it of missing(K, k)) rows.push({ it, why: "none", at: t, on: !!(ticks[it.id] && ticks[it.id].on), ...amountFor(it.name, dishes, dinners) });
    const groups = [];
    for (const sh of KITCHENS[k].shelves) {
      const list = rows.filter((r) => r.it.shelf === sh.id).sort((a, b) => rank[a.why] - rank[b.why] || a.at - b.at);
      if (list.length) groups.push({ shelf: sh, list });
    }
    return { groups, count: rows.length, dinners };
  }
  /* The full Blueprint recipes on the list (Junyan, 2026-10-21, d53: "First I will need to be encouraged based on the
     grocery list"; "it can just put it on my shopping list, no notes needed"). Every real ingredient of Super Veggie and
     Nutty Pudding (QuestMeals.DISHES) that the home kitchen does not have at all (never added, or deleted) is a plain row
     on its list, like any other. Low and Out ones are on it already. It is a row only, not an item: id "n:<name key>",
     none:true, on the shelf it would go on. Ticking it and "Mark ticked items as bought", or "What did you buy?", adds it
     to the kitchen. Home only: the travel fridge holds a few things for a trip, not the full recipes. */
  const shortName = (name) => cap(String(name).split(",")[0].trim().replace(/^(fresh|extra virgin) /i, ""));
  function missing(K, k) {
    if (k !== "home") return [];
    const have = new Set(items(K, k).map((x) => keyOf(x.name))), out = [];
    for (const d of arr(root.QuestMeals && root.QuestMeals.DISHES)) for (const [ing] of arr(d.items)) {
      const key = keyOf(ing);
      if (!key || have.has(key)) continue;
      have.add(key);
      const sd = SEED_ITEMS.find((x) => keyOf(x.name) === key), name = sd ? sd.name : shortName(ing), group = sd ? clean(sd).group : guessGroup(name);
      out.push({ id: "n:" + slug(key), k, name, group, shelf: sd ? sd.shelf : guessShelf(k, group), em: sd ? sd.em : iconFor(name, group), lv: null, none: true });
    }
    return out;
  }
  /* What to buy of an amount item (d45): enough for his use until the shop after this one plus the low line, less what
     is left; with no use known, what he bought last time. Rounded up (10 g or ml, 50 above 200; whole pieces). */
  function toBuy(it, now, shopAt) {
    const r = rateOf(it, now), days = Math.max(1, (ms(shopAt) - ms(now)) / DAY);
    let need = r ? r * days + it.low - it.left : it.buy;
    if (!(need > 0)) need = it.per || it.buy;
    const step = it.u === "" ? 1 : need > 200 ? 50 : 10;
    return Math.ceil(need / step) * step;
  }
  const tick = (K, id, at) => { const out = clone(K), cur = obj(out.shop)[id];
    out.shop = { ...obj(out.shop), [id]: { on: !(cur && cur.on), at: iso(at) } }; return out; };
  // "Mark ticked items as plenty": every ticked item of kitchen k to Plenty, and its tick cleared. Returns { K, n }.
  function buyTicked(K, k, at) {
    let out = clone(K), n = 0;
    for (const it of items(K, k)) {
      const s = obj(obj(K).shop)[it.id];
      if (!s || !s.on) continue;
      out = restock(out, it.id, null, at, "buy"); n++;
      out.shop = { ...obj(out.shop), [it.id]: { on: false, at: iso(at) } };
    }
    // a recipe row not in the kitchen (d53) becomes an item at Plenty
    for (const it of missing(K, k)) {
      const s = obj(obj(K).shop)[it.id];
      if (!s || !s.on) continue;
      const r = add(out, k, it.shelf, it.name, at, it.group);
      if (r.id) { out = r.K; n++; }
      out.shop = { ...obj(out.shop), [it.id]: { on: false, at: iso(at) } };
    }
    return { K: out, n };
  }

  /* The "fill in" picker (Junyan, 2026-10-20, d35: "35 yes also I bought groceries today so what happens in that case?"):
     one list of tick rows, two uses.
     - "bring" (What did you bring?): the travel fridge filled from Home's items plus a short starter list of common travel
       foods (TRAVEL_STARTER). A Home fridge or freezer item goes in the Cool box, a pantry item in the Dry bag. Bringing
       never changes Home's levels (d36: "36 no").
     - "buy" (What did you buy?): the shopping list first (top), then everything else in the kitchen, grey and Out ones
       too, and for the travel fridge the Home catalogue as well (for what it does not have yet).
     Rows: { id (the row's own key), name, em, group, shelf (in kitchen k), item (the kitchen item it fills, or null),
     lv, src ("list" | "have" | "home" | "starter"), top }. Each food once (by its name key). */
  const TRAVEL_STARTER = [
    ["cool", "🍌", "Bananas"], ["cool", "🍎", "Apples"], ["cool", "🥑", "Avocados"], ["cool", "🍅", "Cherry tomatoes"],
    ["cool", "🥒", "Cucumber"], ["cool", "🥕", "Carrots"], ["cool", "🫘", "Hummus"], ["cool", "🥥", "Coconut yogurt"],
    ["dry", "🍞", "Seeded bread"], ["dry", "🌾", "Oats"], ["dry", "🥜", "Mixed nuts"], ["dry", "🍫", "Dark chocolate"],
    ["dry", "🧂", "Electrolytes"],
  ];
  const TRAVEL_SHELF = { fridge: "cool", freezer: "cool", pantry: "dry" };
  function pickList(K, k, use, now, shopAt, dishes) {
    const rows = [], seen = new Set();
    const push = (r) => { const key = keyOf(r.name); if (!key || seen.has(key)) return; seen.add(key); rows.push({ ...r, id: "p:" + key }); };
    const mine = items(K, k), byKey = new Map(mine.map((x) => [keyOf(x.name), x]));
    const row = (it, src, top) => ({ name: it.name, em: it.em, group: it.group, shelf: it.shelf, item: it.id, lv: it.lv, src, top: !!top });
    // a food from Home (or the starter list) as a row of kitchen k: the item k already has, else where it would go
    const from = (name, em, group, shelf, src) => { const have = byKey.get(keyOf(name));
      return have ? row(have, src === "home" || src === "starter" ? "have" : src) : { name, em, group, shelf, item: null, lv: null, src, top: false }; };
    if (use === "buy") {
      for (const g of shopList(K, k, now, shopAt, dishes).groups) for (const r of g.list)
        push(r.it.none ? { name: r.it.name, em: r.it.em, group: r.it.group, shelf: r.it.shelf, item: null, lv: null, src: "list", top: true } : row(r.it, "list", true));
      for (const it of mine) push(row(it, "have"));
    }
    if (k === "travel") {
      for (const h of items(K, "home")) push(from(h.name, h.em, h.group, TRAVEL_SHELF[h.shelf] || guessShelf(k, h.group), "home"));
      if (use === "bring") for (const [shelf, em, name] of TRAVEL_STARTER) push(from(name, em, guessGroup(name), shelf, "starter"));
    }
    return rows;
  }
  /* The seam for later fillers (d29, a receipt photo): the names it read pre-tick the same picker. A name that matches a
     row ticks it; any other becomes a new row (group and shelf guessed, changeable before he adds). Returns { on: row ids,
     extra: new rows, amt: { row id: an amount read with the name } (d42) }. */
  function preTick(rows, names, k) {
    const on = [], extra = [], amt = {}, byKey = new Map(arr(rows).map((r) => [keyOf(r.name), r]));
    for (const n of arr(names)) {
      const nm = String(n || "").trim().slice(0, 40), sp = splitName(nm), food = sp.name, key = keyOf(food);
      if (!key) continue;
      const r = byKey.get(key);
      if (r) { if (!on.includes(r.id)) on.push(r.id); if (sp.amt) amt[r.id] = sp.amt; continue; }
      if (extra.some((x) => keyOf(x.name) === key)) continue;
      const group = guessGroup(food);
      extra.push({ id: "p:" + key, name: nm, em: iconFor(food, group), group, shelf: guessShelf(k || "home", group), item: null, lv: null, src: "new", top: false });
    }
    return { on, extra, amt };
  }
  /* "Add N items": every picked food into kitchen k at Plenty. One already there is set to Plenty (its run-low clock and
     shelf-life clock start again, its shopping tick clears); a new one is added on the shelf the row gives (else, at home,
     its catalogue shelf or the group's guess). src: "buy" or "bring" (or a later filler's own). Only kitchen k is written,
     so bringing from Home leaves Home alone (d36). Returns { K, n, ids, undo } (undo: what unfill needs). */
  function fill(K, k, picks, at, src) {
    if (!KITCHENS[k]) return { K, n: 0, ids: [], undo: null };
    const t = iso(at), s = src || "buy";
    let out = clone(K);
    const ids = [], prev = {}, ticks = {}, keys = new Set();
    for (const p of arr(picks)) {
      const sp = splitName(p && p.name), nm = sp.name, key = keyOf(nm);   // "500g pasta" fills Pasta (d39)
      if (!key || keys.has(key)) continue;
      keys.add(key);
      const have = (p.item && item(out, p.item) && item(out, p.item).k === k && !item(out, p.item).del ? item(out, p.item) : null)
        || items(out, k).find((x) => keyOf(x.name) === key);
      // d42: an amount from the picker's field (p.amt), else one typed in the name, else none (an amount item adds what
      // he last bought; a level item goes to Plenty with no number)
      const given = amtOf(p.amt) || sp.amt;
      if (have) {
        prev[have.id] = clone(have);
        ticks[have.id] = obj(out.shop)[have.id] ? clone(out.shop[have.id]) : null;
        out = restock(out, have.id, given || null, t, s);
        out = put(out, { ...item(out, have.id), fresh: t }, t);
        if (ticks[have.id] && ticks[have.id].on) out.shop = { ...obj(out.shop), [have.id]: { on: false, at: t } };
        ids.push(have.id);
        continue;
      }
      const sd = k === "home" ? SEED_ITEMS.find((x) => keyOf(x.name) === key) : null;
      const group = okGroup(p.group) || (sd && clean(sd).group) || guessGroup(nm);
      const shelf = shelfOf(k, p.shelf) ? p.shelf : sd ? sd.shelf : guessShelf(k, group);
      const r = add(out, k, shelf, p.name, t, group, given);
      if (!r.id) continue;
      out = r.K;
      if (p.em && p.em !== "🛒") out = put(out, { ...item(out, r.id), em: p.em }, t);
      prev[r.id] = null;
      ids.push(r.id);
    }
    return { K: out, n: ids.length, ids, undo: { k, t, src: s, ids, prev, ticks } };
  }
  /* One undo for the whole batch: a new item is deleted again, one that was there goes back to its level, clocks and
     tick, with this fill's history line marked "<src>-off" so it teaches the run-low pace nothing. Written at a new time,
     so the merge keeps the undo over a copy that saw the fill. Like a dinner untick, an item he changed again since the
     fill (no longer Plenty from this fill) keeps what he set. */
  function unfill(K, u, at) {
    if (!u) return K;
    let out = clone(K);
    for (const id of arr(u.ids)) {
      const was = u.prev[id];
      if (!was) { out = remove(out, id, at); continue; }
      const cur = item(out, id) || was;
      // an amount item's level is worked out, so it is "from this fill" when this fill restocked it last (rt)
      if (ms(cur.since) !== ms(u.t) || (hasQ(cur) ? ms(cur.rt) !== ms(u.t) : cur.lv !== 3)) continue;
      const hist = arr(cur.hist).map((h) => (ms(h[0]) === ms(u.t) && h[2] === u.src ? [h[0], h[1], u.src + "-off"] : h));
      out = put(out, { ...was, hist }, at);
      const tk = u.ticks[id];
      if (tk) out.shop = { ...obj(out.shop), [id]: { ...tk, at: iso(at) } };
    }
    return out;
  }

  /* Dinner ticks (d21, d28): ticking an ingredient in a dish on the meal sheet steps the matching item of the active kitchen
     down one level; unticking puts it back. key: one per meal, dish and ingredient. The record (K.used[key]) says what it
     changed, so an untick undoes exactly that, and only while the item still shows that level (a level he set by hand since
     stands). An item not checked yet is left alone (no made-up levels). Returns { K, id } (id: the item it moved, or null). */
  function match(K, k, name) {
    const key = keyOf(name), list = items(K, k).filter((x) => keyOf(x.name) === key);
    return list.find((x) => x.lv != null && x.lv > 0) || list[0] || null;
  }
  function dinner(K, k, key, name, on, at) {
    const used = obj(obj(K).used), rec = used[key];
    if (on) {
      if (rec && !rec.off) return { K, id: null };
      const it = match(K, k, name);
      if (!it || it.lv == null) return { K, id: null };
      const to = Math.max(0, it.lv - 1);
      let out = to === it.lv ? clone(K) : setLevel(K, it.id, to, at, "dinner");
      out.used = { ...obj(out.used), [key]: { id: it.id, from: it.lv, to, since: it.since || null, t: iso(at), at: iso(at) } };
      return { K: out, id: it.id };
    }
    if (!rec || rec.off) return { K, id: null };
    let out = clone(K);
    const it = item(K, rec.id);
    if (it && it.lv === rec.to && rec.from !== rec.to) {
      // the dinner's history line is marked taken back ("dinner-off"), so it teaches nothing about his pace, and the
      // merge drops the same line from a device that never saw the take-back
      const hist = arr(it.hist).map((h) => (h[2] === "dinner" && ms(h[0]) === ms(rec.t) ? [h[0], h[1], "dinner-off"] : h));
      out = put(out, { ...it, lv: rec.from, since: rec.since || it.since, hist }, at);
    }
    out.used = { ...obj(out.used), [key]: { ...rec, off: true, at: iso(at) } };
    return { K: out, id: it && it.lv === rec.to ? rec.id : null };
  }

  /* Meals take amounts off (Junyan, 2026-10-21, d44: "I do modify the nutty pudding and stuff based on what I have", d47).
     eat(K, k, key, ref, on, at, amount): a tick on the meal sheet. ref: { name } (a dish ingredient, matched to kitchen
     k's item by its name key) or { id } (a row of "From your kitchen"). amount: a number in the item's unit, or a recipe
     amount ("175 g", "2 tbsp") turned into it (recipeIn; one that cannot be turned is 0, for him to fill in).
     - Only an item with an amount is touched (d46); a record with no item is never written.
     - A tick already on (a redraw, a second device's copy, the breakfast he ticked before amounts shipped) changes nothing.
     - An untick marks the same record off (a later change, so the merge keeps it); a tick from before amounts (no q) is
       put back the old way (dinner). A tick again after an untick is a new take-off from now.
     Returns { K, id } (id: the item it took from or gave back to, else null). */
  function eat(K, k, key, ref, on, at, amount) {
    const rec = obj(obj(K).used)[key], r = ref || {};
    if (!on) {
      if (!rec || rec.off) return { K, id: null };
      if (typeof rec.q !== "number") return dinner(K, k, key, r.name, false, at);
      const out = clone(K);
      out.used = { ...obj(out.used), [key]: { ...rec, off: true, at: iso(at) } };
      return { K: out, id: rec.id };
    }
    if (rec && !rec.off) return { K, id: null };
    const it = r.id ? item(K, r.id) : match(K, k, r.name);
    if (!it || it.del || it.k !== k || !hasQ(it)) return { K, id: null };
    const q = typeof amount === "number" ? amount : recipeIn(amount, it.u);
    const out = clone(K);
    out.used = { ...obj(out.used), [key]: { id: it.id, q: Math.max(0, Math.round((+q || 0) * 10) / 10), u: it.u, t: iso(at), at: iso(at) } };
    return { K: out, id: it.id };
  }
  // the amount this meal took (d44: changed in the meal sheet); only a tick that is on and has an amount
  function setTake(K, key, q, at) {
    const rec = obj(obj(K).used)[key], v = Math.max(0, Math.round((+q || 0) * 10) / 10);
    if (!rec || rec.off || typeof rec.q !== "number" || !isFinite(v) || v === rec.q) return K;
    const out = clone(K);
    /* stamped just after the record's last change, not now: the merge keeps the later change per key, so an untick made
       on the other device after this tick still wins over an amount changed here on a copy that had not seen it */
    out.used = { ...obj(out.used), [key]: { ...rec, q: v, at: iso(ms(rec.at) + 1) } };
    return out;
  }
  // a tick's take-off record, when it is on and has an amount, else null
  const taken = (K, key) => { const r = obj(obj(K).used)[key]; return r && !r.off && typeof r.q === "number" ? r : null; };

  /* His own dishes (Junyan, 2026-10-21, d48: "I need a create a dish where I can just click on it and then indicate which
     food items I used and how much"). Kept in K.dishes, one record per dish: { id, name, icon, items:[[food, usual amount]],
     added, at, del? }. They read in the same shape as QuestMeals.DISHES and IDEAS plus own:true, so the meal sheet (and a
     later "ideas from the kitchen" job) can use them as they are. The merge keeps one record per dish, the later change
     winning, and a delete is a mark (del) that keeps the name and foods, so an older copy cannot bring it back and a meal
     logged with it can still show it. Nothing here touches K.used: deleting or editing a dish never puts back or takes off
     what a meal already took. */
  /* his steps (d53): "How to make it", one string a step, at most 20 of 300 characters. Typed one step a line; a number
     he typed at the start ("1." or "2)") is dropped, the page numbers them. */
  const stepList = (x) => (Array.isArray(x) ? x : typeof x === "string" ? x.split(/\n+/) : []).filter((t) => typeof t === "string")
    .map((t) => t.replace(/\s+/g, " ").trim().replace(/^\d{1,2}\s*[.)]\s*/, "").slice(0, 300)).filter(Boolean).slice(0, 20);
  // a synced record is only used when it looks like one (its id goes into the page's attributes and selectors)
  const okDish = (x, id) => !!x && typeof x === "object" && typeof x.name === "string" && !!x.name && /^[\w-]{1,40}$/.test(id);
  const shape = (id, x) => ({ id, icon: ownIcon(x.icon) ? x.icon : "🍽️", name: x.name, own: true, items: arr(x.items).filter((r) => Array.isArray(r) && typeof r[0] === "string" && r[0])
    .map((r) => [r[0], typeof r[1] === "string" ? r[1] : ""]), steps: stepList(x.steps), added: x.added || null, ...(x.del ? { del: true } : {}) });
  // his dishes, deleted ones left out, oldest first (a new one goes at the end, so nothing jumps)
  function ownDishes(K) {
    return Object.entries(obj(obj(K).dishes)).filter(([id, x]) => okDish(x, id) && !x.del).map(([id, x]) => shape(id, x))
      .sort((a, b) => ms(a.added) - ms(b.added) || (a.id < b.id ? -1 : 1));
  }
  // one dish, a deleted one too (del:true), else null
  const ownDish = (K, id) => { const x = obj(obj(K).dishes)[id]; return okDish(x, id) ? shape(id, x) : null; };
  // the kitchen item a food names, in either kitchen (the unit a bare number means)
  const anyItem = (K, name) => match(K, "home", name) || match(K, "travel", name);
  /* A usual amount as he types it, read the way the kitchen reads amounts: "300" -> "300 g" (a bare number takes the unit
     his kitchen item has, else the food's own), "1.5kg" -> "1.5 kg", "2" limes -> "2". Words with no number ("a pinch")
     stay as typed (short); a tick of it takes nothing off until he types how much. */
  function dishAmt(K, name, text) {
    const s = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
    if (!s) return "";
    const it = anyItem(K, name), p = qtyOf(s, name, it && hasQ(it) ? it.u : undefined);
    return p ? fmtQ(p.q, p.u) : s.slice(0, 20);
  }
  // the icon a new dish gets: a word in its name ("pasta" 🍝), else its first food's, else a plate
  function dishIcon(name, items) {
    const w = WORD_ICONS.find((x) => x[0].test(String(name || "")));
    if (w) return w[1];
    const f = arr(items).find((r) => Array.isArray(r) && r[0]);
    return f ? iconFor(f[0]) : "🍽️";
  }
  /* Save a dish: new (no id) or an edit of his own (rename, foods, amounts, icon). d: { id?, name, icon?, items:[[food,
     amount text]] }. One row per food (the first of the same name stays), empty rows dropped. No name: nothing saved.
     Returns { K, id }. */
  function saveDish(K, d, at) {
    const name = cap(String((d && d.name) || "").replace(/\s+/g, " ").trim()).slice(0, 40);
    if (!name) return { K, id: null };
    const seen = new Set(), items = [];
    for (const r of arr(d.items)) {
      const f = cap(String((Array.isArray(r) ? r[0] : r && r.name) || "").replace(/\s+/g, " ").trim()).slice(0, 40);
      if (!f || seen.has(f.toLowerCase())) continue;
      seen.add(f.toLowerCase());
      items.push([f, dishAmt(K, f, Array.isArray(r) ? r[1] : r.amt)]);
    }
    const old = d.id ? obj(obj(K).dishes)[d.id] : null;
    const id = old ? d.id : "d" + ms(at).toString(36) + Math.random().toString(36).slice(2, 6);
    const out = clone(K);
    const steps = stepList(d.steps);
    out.dishes = { ...obj(out.dishes), [id]: { id, name, icon: ownIcon(d.icon) ? d.icon : dishIcon(name, items), items, ...(steps.length ? { steps } : {}), added: (old && old.added) || iso(at), at: iso(at) } };
    return { K: out, id };
  }
  // delete one of his dishes: a mark that keeps what it was
  function delDish(K, id, at) {
    const x = obj(obj(K).dishes)[id];
    if (!okDish(x, id) || x.del) return K;
    const out = clone(K);
    out.dishes = { ...obj(out.dishes), [id]: { ...x, del: true, at: iso(at) } };
    return out;
  }
  /* "Save as a dish" (d48): a meal's "From your kitchen" ticks that are on (keys starting with pre), as foods with what
     each took: [[name, amount]], in the order ticked. */
  function kitchenFoods(K, pre) {
    return Object.entries(obj(obj(K).used)).filter(([key]) => key.startsWith(pre)).map(([, r]) => r)
      .filter((r) => r && !r.off && typeof r.q === "number").sort((a, b) => ms(a.t) - ms(b.t))
      .map((r) => { const it = item(K, r.id); return it && it.name ? [it.name, fmtQ(r.q, r.u)] : null; }).filter(Boolean);
  }
  /* A first portion for a "From your kitchen" tick (d47): 1 of a counted item; else a Blueprint dish's meal amount; else
     a small plate by food group. Never more than is left. */
  const PORTION = { "Spices": 3, "Herbs": 10, "Nuts and seeds": 30, "Oils, vinegars and sweet": 15, "Legumes and grains": 80, "Drinks and ferments": 250 };
  // a plate's worth whatever is left (d48: a dish's usual amount must not shrink with today's stock)
  const serving = (it) => (!hasQ(it) ? 0 : it.u === "" ? 1 : it.per || PORTION[it.group] || 100);
  function portion(it) {
    const p = serving(it);
    return Math.max(0, Math.min(p, typeof it.left === "number" ? it.left : p));
  }

  /* Which kitchen is in use: his pick for today, else the travel fridge on a day the app reads as travelling (the same
     home or travelling guess the basics and the gym use, with his Home / Travelling switch first). */
  function active(K, today, mode) {
    const p = obj(obj(K).pick);
    return p.day === today && KITCHENS[p.k] ? p.k : mode === "travel" ? "travel" : "home";
  }
  const pick = (K, k, today, at) => ({ ...clone(K), pick: { k, day: today, at: iso(at) } });
  // the last day the travel fridge was in use (so a trip's end can be seen); null when nothing changes
  function noteActive(K, today, k) {
    if (k !== "travel" || obj(obj(K).trip).last === today) return null;
    return { ...clone(K), trip: { ...obj(obj(K).trip), last: today } };
  }
  // ask "Bring any of this home?" once: home in use again after a trip, the travel fridge not empty, this trip not answered
  function tripEnd(K, today, k) {
    const tr = obj(obj(K).trip), left = items(K, "travel");
    const ask = k === "home" && !!tr.last && tr.last < today && tr.done !== tr.last && left.length > 0;
    return { ask, items: ask ? left : [] };
  }
  /* His answer: the ticked travel items join Home (an item Home already has keeps the higher level; a new one lands on the
     matching shelf: Cool box to Fridge, Dry bag to Pantry), then the travel fridge is emptied and this trip is answered. */
  function bringHome(K, ids, at) {
    let out = clone(K);
    const want = new Set(arr(ids));
    for (const t of items(K, "travel")) {
      if (want.has(t.id)) {
        const home = match(out, "home", t.name);
        if (home && hasQ(home)) {
          // d42: an amount comes home on top of Home's, in the same unit; anything else leaves Home's amount as it is
          if (hasQ(t) && t.u === home.u && t.left > 0) out = restock(out, home.id, { q: t.left, u: t.u }, at, "home");
        } else if (home) {
          const lv = Math.max(home.lv ?? -1, t.lv ?? -1);
          if (lv >= 0 && lv !== home.lv) out = setLevel(out, home.id, lv, at, "home");
        } else {
          const r = add(out, "home", HOME_SHELF[t.shelf] || "fridge", t.name, at, t.group);
          out = r.K;
          if (r.id) {
            const n = item(out, r.id);
            if (t.lv == null) out = put(out, { ...n, lv: null, hist: [], since: null }, at);
            else if (t.lv !== 3 && !hasQ(t)) out = setLevel(out, r.id, t.lv, at, "home");
            const q = hasQ(t) ? { q: t.left, u: t.u, qt: iso(at), buy: t.buy } : {};
            out = put(out, { ...item(out, r.id), ...q, em: t.em || n.em, fresh: t.fresh || n.fresh }, at);
          }
        }
      }
      out = remove(out, t.id, at);
    }
    const tr = obj(out.trip);
    out.trip = { ...tr, done: tr.last || null };
    return out;
  }

  // "low by Fri": a day word in his zone
  function dayWord(t, now, tz) {
    const f = (x) => new Date(x).toLocaleDateString("en-CA", { timeZone: tz || undefined });
    const a = f(ms(now)), b = f(Math.max(ms(t), ms(now)));
    if (a === b) return "today";
    if (f(ms(now) + DAY) === b) return "tomorrow";
    return new Date(Math.max(ms(t), ms(now))).toLocaleDateString("en-US", { weekday: "short", timeZone: tz || undefined });
  }
  /* The shop line under the sheet's title and the shopping list's hint (2026-10-20, d37: "37 yes"). He opened the sheet
     from today's Groceries block and read "no Groceries block in the next few days", which reads as wrong while he is in
     one. So a Groceries block that is on now or was earlier today (the one the sheet was opened from first) reads
     "Shopping today", followed by the next shop after it or "next shop not on the calendar yet". blocks: [{ t, s, e }];
     opened: the block the sheet came from, or null; fmt: the page's time format (ms -> "10:00 AM"). */
  const isShop = (b) => !!b && /grocer/i.test(b.t || "");
  const ymdIn = (x, tz) => new Date(ms(x)).toLocaleDateString("en-CA", { timeZone: tz || undefined });
  const fmtDef = (x) => new Date(x).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  function shopInfo(blocks, now, k, tz, opened) {
    const t = ms(now), all = arr(blocks).concat(isShop(opened) ? [opened] : []);
    const started = (b) => isShop(b) && ms(b.s) <= t && ymdIn(b.s, tz) === ymdIn(t, tz);
    const today = started(opened) ? opened : all.filter(started).sort((a, b) => ms(b.s) - ms(a.s))[0] || null;
    const shop = nextShop(all, t, k);
    if (!today) return { today, shop, next: null };
    const after = Math.max(ms(today.e || today.s), t);
    const next = all.filter((b) => isShop(b) && ms(b.s) >= after).sort((a, b) => ms(a.s) - ms(b.s))[0] || null;
    return { today, shop, next };
  }
  function shopWhen(blocks, now, k, tz, opened, fmt) {
    const I = shopInfo(blocks, now, k, tz, opened), sw = (b) => `${dayWord(ms(b.s), now, tz)} ${(fmt || fmtDef)(ms(b.s))}`;
    if (I.today) return `Shopping today · ${I.next ? `next shop ${sw(I.next)}` : "next shop not on the calendar yet"}`;
    const s = I.shop;
    return s.soon ? (ms(s.soon.s) <= ms(now) ? "shopping now" : `shopping ${sw(s.soon)}`) : s.block ? `next shop ${sw(s.block)}` : "next shop not on the calendar yet";
  }
  // the shopping list hint's "what will run low ..." part, from the same reading
  function shopUpto(blocks, now, k, tz, opened, fmt) {
    const I = shopInfo(blocks, now, k, tz, opened), s = I.shop, sw = (b) => `${dayWord(ms(b.s), now, tz)} ${(fmt || fmtDef)(ms(b.s))}`;
    return s.block ? `before ${s.soon ? "the shop after this one" : "your next shop"} (${sw(s.block)})`
      : `in the next ${DEFAULT_SHOP[k] || 7} days (next shop not on the calendar yet)`;
  }
  /* The status line under a tile's name (d34): Plenty, Half, "Low · buy", "Out · buy", "Low by Thu" (a Half or Plenty that
     runs low before the next shop), or "Not checked". */
  function status(it, now, shopAt, tz) {
    if (!it || it.lv == null) return "Not checked";
    // d42: an amount item shows what is left instead of a level word ("350 g", "120 g · buy", "4 · low by Thu")
    if (hasQ(it) && typeof it.left === "number") {
      if (it.lv === 0) return "Out · buy";
      const a = fmtQ(it.left, it.u);
      if (it.lv === 1) return `${a} · buy`;
      return lowSoon(it, now, shopAt) ? `${a} · low by ${dayWord(lowAt(it, now), now, tz)}` : a;
    }
    if (it.lv === 0) return "Out · buy";
    if (it.lv === 1) return "Low · buy";
    if (lowSoon(it, now, shopAt)) return `Low by ${dayWord(lowAt(it, now), now, tz)}`;
    return LEVELS[it.lv];
  }
  // the sheet's filters (d34): "all", "buy" (what the shopping list holds: low, out, or low before the next shop), "new" (not checked)
  const shows = (it, f, now, shopAt) => f === "buy" ? !!it && it.lv != null && (it.lv <= 1 || lowSoon(it, now, shopAt))
    : f === "new" ? !!it && it.lv == null : !!it;
  // counts for the kitchen card: { low (low or out), soon, unchecked, total }
  function counts(K, k, now, shopAt) {
    const list = items(K, k);
    return { total: list.length, unchecked: list.filter((x) => x.lv == null).length,
      low: list.filter((x) => x.lv != null && x.lv <= 1).length, soon: list.filter((x) => lowSoon(x, now, shopAt)).length };
  }

  // a tile's second line (d39): the status, then the amount when it has one ("Plenty · 400 g")
  // (d42) an amount item's status already is its amount
  const tileLine = (it, now, shopAt, tz) => status(it, now, shopAt, tz) + (it && it.amt && !hasQ(it) ? ` · ${it.amt}` : "");

  root.QuestKitchen = { NEED, LEVELS, KITCHENS, SEED, FRESH, DEFAULT_SHOP, GROUP_NAMES, GROUP_ICONS, keyOf, iconFor, groupIcon, splitName, amtOf, tileLine, guessGroup, guessShelf,
    items, item, grouped, setLevel, nextLevel, tap, add, rename, move, place, remove, status, shows, pace, lowAt, lowSoon, turnAt, useFirst, nextShop, parseAmt, usesOf, amountFor,
    shopList, missing, stepList, tick, buyTicked, hasQ, unitFor, qtyOf, fmtQ, recipeIn, perMeal, setAmount, restock, rateOf, toBuy, eat, setTake, taken, portion, serving, ownDishes, ownDish, saveDish, delDish, dishAmt, dishIcon, kitchenFoods, TRAVEL_STARTER, pickList, preTick, fill, unfill, shopInfo, shopWhen, shopUpto, match, dinner, active, pick, noteActive, tripEnd, bringHome, dayWord, counts };
})(typeof window !== "undefined" ? window : globalThis);
