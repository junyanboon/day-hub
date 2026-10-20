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
  const ICONS = Object.fromEntries(SEED.map(([, em, name]) => [keyOf(name), em]));
  const iconFor = (name) => ICONS[keyOf(name)] || "🛒";
  const shelfOf = (k, id) => (KITCHENS[k] ? KITCHENS[k].shelves.find((s) => s.id === id) : null) || null;

  // a level read from saved (synced) state: 0 to 3, else not checked
  const okLv = (v) => (v === 0 || v === 1 || v === 2 || v === 3 ? v : null);
  // its group: the one it stores, else the first guess from its name (stored with the item at its next change)
  const clean = (it) => ({ ...it, lv: okLv(it.lv), group: okGroup(it.group) || guessGroup(it.name) });
  // every item of the kitchen, the catalogue under what he changed, deleted ones left out, in shelf then catalogue order
  function items(K, k) {
    const st = obj(obj(K).items), out = [], seen = new Set();
    for (const s of SEED_ITEMS) { seen.add(s.id); const it = clean(st[s.id] ? { ...s, ...st[s.id] } : s); if (!it.del && it.k === k) out.push(it); }
    for (const [id, it] of Object.entries(st)) if (!seen.has(id) && it && !it.del && it.k === k && typeof it.name === "string") out.push(clean({ ...it, id }));
    const order = (KITCHENS[k] || { shelves: [] }).shelves.map((s) => s.id);
    return out.sort((a, b) => (order.indexOf(a.shelf) - order.indexOf(b.shelf)) || ((a.seed ?? 1e6) - (b.seed ?? 1e6)) || ms(b.added) - ms(a.added));
  }
  function item(K, id) {
    const st = obj(obj(K).items)[id], s = SEED_ITEMS.find((x) => x.id === id);
    if (!st && !s) return null;
    return clean(st ? { ...(s || {}), ...st, id } : s);
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
    const { seed, ...rest } = it;
    out.items[it.id] = { ...rest, at: iso(at) };
    return out;
  }

  /* Set a level. src: "tap", "check" (the old shelf "Looks right", gone since d32), "dinner", "buy" (Mark ticked items as plenty), "home" (brought home),
     "add", "undo", or a later bulk filler like "receipt". Any rise is a restock: it starts a new run-low cycle and, at
     Plenty or on a first level, a fresh shelf-life clock. Two taps on the same item within 10 minutes are one answer
     (the second corrects the first), so a quick "Plenty, no, Half" never teaches a pace of minutes. */
  function setLevel(K, id, lv, at, src) {
    const it = item(K, id); if (!it) return K;
    const t = ms(at), was = it.lv;
    const hist = arr(it.hist).slice();
    const prev = hist.filter((h) => h[2] !== "dinner-off").pop();
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
  const tap = (K, id, at) => { const it = item(K, id); return it ? setLevel(K, id, nextLevel(it.lv), at, "tap") : K; };

  /* Add something new (Plenty: he just put it there), in the group he picked (else the guess from its name). The same name
     already in that kitchen is set to Plenty instead of making a second tile; a deleted one comes back on the chosen shelf. */
  function add(K, k, shelf, name, at, group) {
    const nm = String(name || "").trim().slice(0, 40);
    if (!nm || !shelfOf(k, shelf)) return { K, id: null };
    const key = keyOf(nm);
    const live = items(K, k).find((x) => keyOf(x.name) === key);
    if (live) return { K: setLevel(K, live.id, 3, at, "add"), id: live.id };
    const dead = Object.entries(obj(obj(K).items)).find(([, x]) => x && x.del && x.k === k && keyOf(x.name || (item(K, x.id) || {}).name) === key);
    const sd = k === "home" ? SEED_ITEMS.find((x) => keyOf(x.name) === key) : null;
    const id = dead ? dead[0] : sd ? sd.id : "u" + ms(at).toString(36) + Math.random().toString(36).slice(2, 6);
    const base = { ...(item(K, id) || {}), id, k, shelf, name: nm, group: okGroup(group) || okGroup((obj(obj(K).items)[id] || {}).group) || guessGroup(nm), em: (item(K, id) || {}).em || iconFor(nm), lv: null, hist: [], added: iso(at) };
    delete base.del;
    return { K: setLevel(put(K, base, at), id, 3, at, "add"), id };
  }
  const rename = (K, id, name, at) => { const it = item(K, id), nm = String(name || "").trim().slice(0, 40);
    return it && nm ? put(K, { ...it, name: nm, em: it.em && it.em !== "🛒" ? it.em : iconFor(nm) }, at) : K; };
  const move = (K, id, shelf, at) => { const it = item(K, id); return it && shelfOf(it.k, shelf) ? put(K, { ...it, shelf }, at) : K; };
  /* Put an item in a group and on a shelf (d34: Edit's pickers, or a drag onto another group or shelf). Either may be left
     out (null) to keep it. Nothing changes (K comes back as is) when both are already so, or a value is not a real one. */
  function place(K, id, shelf, group, at) {
    const it = item(K, id); if (!it) return K;
    const sh = shelf == null ? it.shelf : shelf, g = group == null ? it.group : group;
    if (!shelfOf(it.k, sh) || !okGroup(g) || (sh === it.shelf && g === it.group)) return K;
    return put(K, { ...it, shelf: sh, group: g }, at);
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
    for (const [at, lv, src] of arr(it.hist).filter((h) => h[2] !== "dinner-off").sort((a, b) => ms(a[0]) - ms(b[0]))) {
      if (start == null || lv > prevLv) { if (cur != null) samples.push(cur); cur = null; start = [ms(at), lv]; prevLv = lv; continue; }
      if (lv < start[1] && (src === "tap" || src === "dinner") && ms(at) - start[0] >= MIN_SAMPLE_MS) cur = (ms(at) - start[0]) / DAY / (start[1] - lv);
      prevLv = lv;
    }
    if (cur != null) samples.push(cur);
    const s = samples.slice(-4);
    return Math.max(0.25, Math.min(90, (def + s.reduce((a, b) => a + b, 0)) / (1 + s.length)));
  }
  // when it will be Low (ms); null when not checked yet. Low or Out: already (its level time).
  function lowAt(it, now) {
    if (!it || it.lv == null) return null;
    const since = ms(it.since) || ms(it.at) || ms(now);
    if (it.lv <= 1) return since;
    const p = pace(it) * DAY;
    let est = since + (it.lv - 1) * p;
    if (it.seen) est = Math.max(est, ms(it.seen) + (it.lv - 1) * p * 0.5);   // still at this level when he last looked
    return est;
  }
  // will it run low before the next shop (only items at Half or Plenty)
  const lowSoon = (it, now, shopAt) => !!it && it.lv != null && it.lv >= 2 && lowAt(it, now) <= ms(shopAt);
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
    let best = null;   // the first amount that can be scaled, then the largest in the same unit
    for (const u of uses) { const a = parseAmt(u.amt); if (!a) continue; if (!best || (a.u === best.u && a.q > best.q)) best = a; }
    return { uses, dinners: uses.length ? dinners : 0, amt: best ? fmtAmt(best.q * dinners, best.u) : null };
  }

  /* The shopping list for kitchen k (d28): Low and Out first, then what will run low before the next shop, by shelf.
     Items not checked yet are never on it. Each row: { it, why ("out" | "low" | "soon"), at (run-low ms), on (ticked),
     uses, amt, dinners }. dinners: the days from now to the next shop, 1 to 7. */
  function shopList(K, k, now, shopAt, dishes) {
    const t = ms(now), dinners = Math.max(1, Math.min(7, Math.ceil((ms(shopAt) - t) / DAY)));
    const ticks = obj(obj(K).shop), rank = { out: 0, low: 1, soon: 2 };
    const rows = [];
    for (const it of items(K, k)) {
      if (it.lv == null) continue;
      const why = it.lv === 0 ? "out" : it.lv === 1 ? "low" : lowSoon(it, t, shopAt) ? "soon" : null;
      if (!why) continue;
      rows.push({ it, why, at: lowAt(it, t), on: !!(ticks[it.id] && ticks[it.id].on), ...amountFor(it.name, dishes, dinners) });
    }
    const groups = [];
    for (const sh of KITCHENS[k].shelves) {
      const list = rows.filter((r) => r.it.shelf === sh.id).sort((a, b) => rank[a.why] - rank[b.why] || a.at - b.at);
      if (list.length) groups.push({ shelf: sh, list });
    }
    return { groups, count: rows.length, dinners };
  }
  const tick = (K, id, at) => { const out = clone(K), cur = obj(out.shop)[id];
    out.shop = { ...obj(out.shop), [id]: { on: !(cur && cur.on), at: iso(at) } }; return out; };
  // "Mark ticked items as plenty": every ticked item of kitchen k to Plenty, and its tick cleared. Returns { K, n }.
  function buyTicked(K, k, at) {
    let out = clone(K), n = 0;
    for (const it of items(K, k)) {
      const s = obj(obj(K).shop)[it.id];
      if (!s || !s.on) continue;
      out = setLevel(out, it.id, 3, at, "buy"); n++;
      out.shop = { ...obj(out.shop), [it.id]: { on: false, at: iso(at) } };
    }
    return { K: out, n };
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
        if (home) {
          const lv = Math.max(home.lv ?? -1, t.lv ?? -1);
          if (lv >= 0 && lv !== home.lv) out = setLevel(out, home.id, lv, at, "home");
        } else {
          const r = add(out, "home", HOME_SHELF[t.shelf] || "fridge", t.name, at, t.group);
          out = r.K;
          if (r.id) {
            const n = item(out, r.id);
            if (t.lv == null) out = put(out, { ...n, lv: null, hist: [], since: null }, at);
            else if (t.lv !== 3) out = setLevel(out, r.id, t.lv, at, "home");
            out = put(out, { ...item(out, r.id), em: t.em || n.em, fresh: t.fresh || n.fresh }, at);
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
  /* The status line under a tile's name (d34): Plenty, Half, "Low · buy", "Out · buy", "Low by Thu" (a Half or Plenty that
     runs low before the next shop), or "Not checked". */
  function status(it, now, shopAt, tz) {
    if (!it || it.lv == null) return "Not checked";
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

  root.QuestKitchen = { NEED, LEVELS, KITCHENS, SEED, FRESH, DEFAULT_SHOP, GROUP_NAMES, keyOf, iconFor, guessGroup, guessShelf,
    items, item, grouped, setLevel, nextLevel, tap, add, rename, move, place, remove, status, shows, pace, lowAt, lowSoon, turnAt, useFirst, nextShop, parseAmt, usesOf, amountFor,
    shopList, tick, buyTicked, match, dinner, active, pick, noteActive, tripEnd, bringHome, dayWord, counts };
})(typeof window !== "undefined" ? window : globalThis);
