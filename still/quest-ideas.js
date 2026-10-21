/* Day Quest: tonight's ideas from what is in the kitchen (Junyan, 2026-10-21, d41: "yes").
   Each day, three dinner ideas for 2 people, picked from a fixed pool of recipes (POOL) by what the kitchen in use that
   day (home or the travel fridge) has. Plain rules, no AI, nothing to run or approve: the same kitchen on the same day
   gives the same three on both devices.
   - The pool keeps his food rules: Blueprint-style (plants only, no dairy, meat or fish), no garlic or onion (or leek,
     shallot, chives, spring onion: they are the Drain "onion or garlic"), lots of fresh vegetables, sprouts and nuts
     (Sadhguru's pranic foods). The three ideas from before (QuestMeals.IDEAS, r1 to r3) are in it with the same ids, so a
     meal ticked on them still reads.
   - His own dishes (QuestKitchen.ownDishes) are candidates too, but only a whole dinner (3 foods or more) when every
     food in them is in the kitchen and none is garlic or onion, and at most one of the three, so the ideas stay ideas.
   - Ranking: the share of an idea's main ingredients the kitchen has (enough of an amount item, or any level but Out),
     plus a little for each one it uses that should be used first (QuestKitchen.useFirst), that is running Low, or that
     has an amount; then a little for its pranic foods, and a small tie-break from the date so near-equal ideas rotate.
     Spices, oils, vinegars, tahini and honey (staples) never decide the pick. No two of the three share the same base
     (lentils, chickpeas, beans, quinoa, rice) while there are others to pick.
   - The ranking reads the kitchen as it was at the start of the day (meals ticked today put back), so ideas do not
     shuffle while he cooks; what each idea shows (have, short, to buy) reads the kitchen as it is now.
   - Never a made-up amount: an item with no amount shows its level word, one not checked yet shows "not checked", and
     a short kitchen is said in words (note) with the closest ideas and what each needs to buy.
   Pure, so it can be tested (node --test still/test). Needs QuestMeals and QuestKitchen loaded first. */
(function (root) {
  "use strict";
  const QK = () => root.QuestKitchen, QM = () => root.QuestMeals;

  // garlic, onion and their family (the Drain "onion or garlic"), and anything not Blueprint (animal food)
  const BANNED = /\b(garlic|onions?|leeks?|shallots?|chives?|scallions?|spring onions?|asafoetida|hing|meat|beef|pork|lamb|chicken|turkey|fish|salmon|tuna|cod|shrimps?|prawns?|eggs?|cheese|butter|cream|ghee|milk|kefir|yogh?urts?)\b/i;
  // a plant yogurt, milk or butter is fine ("Coconut yogurt", "Macadamia milk", "Peanut butter"), and cream of tartar
  const PLANT = /\b(coconut|soy|oat|almond|macadamia|cashew|peanut|nut|seed|hemp|rice|cocoa|sunflower) (yogh?urts?|milk|cream|butter|kefir)\b|\bcream of tartar\b/gi;
  const banned = (name) => BANNED.test(String(name || "").replace(PLANT, ""));

  /* The pool. { id, icon, name, time, base, items:[[ingredient, amount for 2]], how }. Ingredient names match the
     kitchen catalogue's names the way a dish tick does (QuestKitchen.keyOf), so what an idea says it uses is exactly what
     a tick takes off. Amounts in g, ml or a count where they can be, so they come off amount items. */
  const MORE = [
    { id: "r4", icon: "🥑", name: "Kale, avocado and quinoa salad", time: "20 min", base: "quinoa", items: [
      ["Quinoa, dry", "150 g"], ["Kale", "150 g"], ["Avocados", "2"], ["Cherry tomatoes", "150 g"], ["Sprouts", "50 g"],
      ["Lemon", "1"], ["Extra virgin olive oil", "30 ml"], ["Pumpkin seeds", "30 g"], ["Sea salt", "a pinch"]],
      how: "Cook the quinoa 15 min and let it cool a little. Rub the kale with the lemon juice, oil and salt until soft. Toss in the quinoa, tomatoes and sliced avocado, then top with sprouts and seeds." },
    { id: "r5", icon: "🍛", name: "Turmeric chickpeas with spinach and rice", time: "30 min", base: "chickpea", items: [
      ["Basmati rice, dry", "150 g"], ["Chickpeas, cooked", "400 g"], ["Spinach", "200 g"], ["Tomatoes", "2 medium"],
      ["Fresh ginger, grated", "1 tbsp"], ["Turmeric", "1 tsp"], ["Ground cumin", "1 tsp"], ["Coconut yogurt", "100 g"],
      ["Lime", "1"], ["Fresh parsley", "15 g"]],
      how: "Cook the rice. Warm the ginger and spices in a splash of water, add the chopped tomatoes for 5 min, then the chickpeas for 10. Wilt in the spinach, take off the heat, stir in the yogurt and lime, top with parsley." },
    { id: "r6", icon: "🍄", name: "Shiitake and broccoli with quinoa and tahini", time: "25 min", base: "quinoa", items: [
      ["Quinoa, dry", "150 g"], ["Broccoli", "300 g"], ["Shiitake mushrooms", "150 g"], ["Red peppers", "1"],
      ["Fresh ginger, grated", "1 tbsp"], ["Tahini", "2 tbsp"], ["Lime", "1"], ["Extra virgin olive oil", "15 ml"], ["Hemp seeds", "2 tbsp"]],
      how: "Cook the quinoa. Steam the broccoli 4 min. Cook the shiitake and pepper in the oil for 5 min, add the ginger and broccoli. Whisk tahini, lime and a little water, pour over, top with hemp seeds." },
    { id: "r7", icon: "🥦", name: "Black lentils with roast cauliflower", time: "40 min", base: "lentil", items: [
      ["Black lentils, dry", "120 g"], ["Cauliflower", "400 g"], ["Carrots", "2"], ["Rocket", "60 g"], ["Tahini", "2 tbsp"],
      ["Lemon", "1"], ["Ground cumin", "1 tsp"], ["Smoked paprika", "1 tsp"], ["Extra virgin olive oil", "30 ml"], ["Walnuts", "30 g"]],
      how: "Roast the cauliflower and sliced carrots with half the oil and the spices at 220°C for 30 min. Simmer the lentils 25 min. Serve on the rocket with tahini, lemon and the rest of the oil, walnuts on top." },
    { id: "r8", icon: "🍲", name: "White bean and kale soup", time: "30 min", base: "bean", items: [
      ["White beans, cooked", "400 g"], ["Kale", "150 g"], ["Carrots", "2"], ["Courgette", "1"], ["Tomatoes", "3 medium"],
      ["Smoked paprika", "1 tsp"], ["Extra virgin olive oil", "30 ml"], ["Lemon", "1"], ["Fresh parsley", "20 g"], ["Pumpkin seeds", "30 g"]],
      how: "Soften the diced carrot and courgette in half the oil for 5 min. Add the paprika, chopped tomatoes and 800 ml water for 15 min. Add the beans and kale for 5 more. Finish with lemon, parsley, the rest of the oil and seeds." },
    { id: "r9", icon: "🌱", name: "Green lentil sprout bowl", time: "25 min", base: "lentil", items: [
      ["Green or brown lentils, dry", "140 g"], ["Avocados", "1"], ["Sprouts", "80 g"], ["Baby spinach", "100 g"],
      ["Cherry tomatoes", "150 g"], ["Lime", "1"], ["Extra virgin olive oil", "30 ml"], ["Hemp seeds", "2 tbsp"], ["Ground cumin", "1 tsp"]],
      how: "Simmer the lentils 20 min, drain and toss warm with the cumin, oil and lime. Fold in the spinach so it just wilts, then top with tomatoes, avocado, sprouts and hemp seeds." },
    { id: "r10", icon: "🫛", name: "Quinoa with peas, courgette and lemon", time: "20 min", base: "quinoa", items: [
      ["Quinoa, dry", "150 g"], ["Peas", "200 g"], ["Courgette", "2"], ["Baby spinach", "100 g"], ["Lemon", "1"],
      ["Extra virgin olive oil", "30 ml"], ["Fresh parsley", "20 g"], ["Almonds, soaked", "30 g"], ["Hemp seeds", "2 tbsp"]],
      how: "Cook the quinoa, adding the peas for the last 3 min. Cook the sliced courgette in the oil for 5 min. Toss everything with the spinach, lemon zest and juice, parsley, almonds and hemp seeds." },
    { id: "r11", icon: "🫑", name: "Roast vegetable tray with chickpeas and tahini", time: "35 min", base: "chickpea", items: [
      ["Chickpeas, cooked", "400 g"], ["Red peppers", "2"], ["Courgette", "1"], ["Carrots", "2"], ["Broccoli", "200 g"],
      ["Tahini", "2 tbsp"], ["Lemon", "1"], ["Smoked paprika", "1 tsp"], ["Extra virgin olive oil", "30 ml"], ["Fresh parsley", "20 g"]],
      how: "Toss the chopped vegetables and chickpeas with the oil and paprika and roast at 220°C for 25 min, the broccoli for the last 10. Drizzle with tahini thinned with lemon and water, scatter parsley." },
    { id: "r12", icon: "🍚", name: "Kitchari: rice and lentils with ginger", time: "35 min", base: "rice", items: [
      ["Basmati rice, dry", "100 g"], ["Green or brown lentils, dry", "100 g"], ["Carrots", "2"], ["Spinach", "100 g"],
      ["Fresh ginger, grated", "1 tbsp"], ["Turmeric", "1 tsp"], ["Ground cumin", "1 tsp"], ["Extra virgin olive oil", "15 ml"],
      ["Lime", "1"], ["Fresh parsley", "15 g"]],
      how: "Warm the cumin, ginger and turmeric in the oil for a minute. Add the rinsed rice and lentils, the diced carrot and 1 L water, and simmer 30 min until soft. Stir in the spinach, finish with lime and parsley." },
    { id: "r13", icon: "🥘", name: "Broccoli, pea and chickpea curry", time: "30 min", base: "chickpea", items: [
      ["Frozen broccoli", "300 g"], ["Peas", "150 g"], ["Chickpeas, cooked", "400 g"], ["Tomatoes", "3 medium"],
      ["Coconut yogurt", "150 g"], ["Fresh ginger, grated", "1 tbsp"], ["Turmeric", "1 tsp"], ["Ground cumin", "1 tsp"],
      ["Basmati rice, dry", "150 g"]],
      how: "Cook the rice. Warm the ginger and spices, add the chopped tomatoes for 8 min, then the chickpeas, broccoli and peas for 8 more. Off the heat, stir in the yogurt." },
    { id: "r14", icon: "🍄", name: "Shiitake, kale and white bean skillet", time: "20 min", base: "bean", items: [
      ["White beans, cooked", "400 g"], ["Shiitake mushrooms", "150 g"], ["Kale", "150 g"], ["Tomatoes", "2 medium"],
      ["Extra virgin olive oil", "30 ml"], ["Smoked paprika", "1 tsp"], ["Lemon", "1"], ["Walnuts", "30 g"]],
      how: "Cook the shiitake in the oil for 5 min, add the paprika and chopped tomatoes for 3, then the beans and kale until the kale is soft. Finish with lemon and walnuts." },
    { id: "r15", icon: "🥗", name: "Rainbow sprout salad with black lentils", time: "30 min", base: "lentil", items: [
      ["Black lentils, dry", "100 g"], ["Sprouts", "100 g"], ["Carrots", "2"], ["Red peppers", "1"], ["Rocket", "80 g"],
      ["Apples", "1"], ["Walnuts", "30 g"], ["Apple cider vinegar", "2 tbsp"], ["Extra virgin olive oil", "30 ml"]],
      how: "Simmer the lentils 25 min and cool a little. Grate the carrot and apple, slice the pepper. Toss everything with the vinegar and oil, top with sprouts and walnuts." },
    { id: "r16", icon: "🫑", name: "Stuffed peppers with quinoa and lentils", time: "45 min", base: "quinoa", items: [
      ["Red peppers", "4"], ["Quinoa, dry", "100 g"], ["Black lentils, dry", "80 g"], ["Tomatoes", "2 medium"],
      ["Spinach", "100 g"], ["Ground cumin", "1 tsp"], ["Smoked paprika", "1 tsp"], ["Extra virgin olive oil", "15 ml"], ["Pumpkin seeds", "30 g"]],
      how: "Cook the quinoa and lentils. Mix with the chopped tomatoes, spinach, spices and oil. Halve the peppers, fill them, and bake at 200°C for 25 min. Top with seeds." },
  ];
  // the three ideas from before keep their ids (a meal ticked on them still reads); r1 to r3 get a base too
  const OLD_BASE = { r1: "lentil", r2: "chickpea", r3: "quinoa" };
  const pool = () => ((QM() && QM().IDEAS) || []).map((d) => ({ ...d, base: d.base || OLD_BASE[d.id] || null })).concat(MORE);
  let POOL_C = null;
  const POOL = () => POOL_C || (POOL_C = pool());
  const byId = (id) => POOL().find((d) => d.id === id) || null;

  // spices, oils, vinegars, tahini and honey: never decide the pick, and only "to buy" when the kitchen says Out
  const STAPLE = new Set(["Spices", "Oils, vinegars and sweet"]);
  const staple = (name) => STAPLE.has(QK().guessGroup(name));
  // pranic foods in an idea (fresh vegetables, fruit, herbs, sprouts, nuts and seeds)
  const PRANIC = new Set(["Vegetables", "Fruit", "Herbs", "Nuts and seeds"]);

  /* What the kitchen has of each ingredient. kit: the items of kitchen k by name key (the one a tick would take from:
     QuestKitchen.match's pick, one with something left first). Returns [{ name, amt, st, word, staple, it }], st:
       have (enough, or any level but Out), short (an amount under what the idea uses), out (Out or 0 left),
       none (not in this kitchen), unchecked (in the kitchen, not checked yet). word: what to show, never made up. */
  function byKey(K, k) {
    const m = new Map();
    for (const it of QK().items(K, k)) {
      const key = QK().keyOf(it.name), cur = m.get(key);
      if (!cur || (!(cur.lv != null && cur.lv > 0) && it.lv != null && it.lv > 0)) m.set(key, it);
    }
    return m;
  }
  function read(d, kit) {
    return d.items.map(([name, amt]) => {
      const it = kit.get(QK().keyOf(name)) || null, sp = staple(name);
      if (!it) return { name, amt, st: "none", word: "not in the kitchen", staple: sp, it: null };
      if (it.lv == null) return { name, amt, st: "unchecked", word: "not checked", staple: sp, it };
      if (it.lv === 0) return { name, amt, st: "out", word: "out", staple: sp, it };
      if (typeof it.q === "number") {
        const need = QK().recipeIn(amt, it.u);
        if (need != null && it.left < need) return { name, amt, st: "short", word: `only ${it.amt}`, staple: sp, it };
        return { name, amt, st: "have", word: `have ${it.amt}`, staple: sp, it };
      }
      return { name, amt, st: "have", word: (QK().LEVELS[it.lv] || "").toLowerCase(), staple: sp, it };
    });
  }
  /* An idea against the kitchen now: what it uses and has, what to buy, what to check. buy: main ingredients short, out
     or not in the kitchen, and staples that are Out or short. check: main ingredients not checked yet. */
  function status(K, k, d) {
    const rows = read(d, byKey(K, k));
    const main = rows.filter((r) => !r.staple);
    const buy = rows.filter((r) => (!r.staple && (r.st === "none" || r.st === "out" || r.st === "short")) || (r.staple && (r.st === "out" || r.st === "short")));
    const check = main.filter((r) => r.st === "unchecked");
    const have = main.filter((r) => r.st === "have").length;
    const text = !buy.length && !check.length ? "All in your kitchen"
      : [`you have ${have} of ${main.length}`, buy.length ? `buy ${buy.length}` : "", check.length ? `${check.length} not checked` : ""].filter(Boolean).join(" · ");
    return { rows, have, main: main.length, buy: buy.map((r) => r.name), check: check.map((r) => r.name), text: text.charAt(0).toUpperCase() + text.slice(1) };
  }

  // a small number in [0, 1) from a string: the date's tie-break, the same on every device
  function jitter(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 1000) / 1000;
  }
  // the kitchen as it was at the start of the day: today's meal ticks put back (their records left out)
  function atStart(K, since) {
    const used = (K && K.used) || {}, keep = {};
    for (const [key, r] of Object.entries(used)) if (r && !(Date.parse(r.t) >= since)) keep[key] = r;   // a record with no time is kept
    return { ...K, used: keep };
  }
  // how well an idea fits the kitchen: { fit (the share of main ingredients had), score }
  function rate(d, kit, first, day) {
    const rows = read(d, kit), main = rows.filter((r) => !r.staple);
    let got = 0, extra = 0;
    for (const r of main) {
      if (r.st === "have") got += 1; else if (r.st === "short") got += 0.5; else continue;
      if (first.has(r.it.id)) extra += 1.5;   // should be used first
      if (r.it.lv === 1) extra += 0.5;        // running low: use it up
      if (typeof r.it.q === "number") extra += 0.25;   // has an amount
    }
    const fit = main.length ? got / main.length : 0;
    const pr = rows.filter((r) => PRANIC.has(QK().guessGroup(r.name))).length;
    return { fit, score: fit * 10 + extra + pr * 0.1 + jitter(day + "|" + d.id) * 0.8 };
  }
  const memo = { K: null, k: null, day: null, since: null, out: null };
  /* Today's three. o: { day ("YYYY-MM-DD", the tie-break), since (ms, the start of the day), now (ms, for Use first) }.
     Returns { list: [idea], note (words for a short kitchen, else ""), ready (how many fit well) }. His own dish keeps
     own:true (it is his, it pays no points). */
  function pick(K, k, o) {
    const opt = o || {}, day = opt.day || "", since = +opt.since || 0;
    if (memo.K === K && memo.k === k && memo.day === day && memo.since === since && memo.out) return memo.out;
    const K0 = since ? atStart(K, since) : K, kit = byKey(K0, k);
    // use first as it read when the day began, so a pick holds all day (now only when no start is given)
    const first = new Set(QK().useFirst(K0, k, since || opt.now || Date.now()).map((x) => x.it.id));
    const own = QK().ownDishes(K).filter((d) => d.items.length >= 3 && !d.items.some((x) => banned(x[0])) &&
      read(d, kit).every((r) => r.st === "have"));
    const cands = POOL().concat(own).map((d) => ({ d, ...rate(d, kit, first, day) }))
      .sort((a, b) => b.score - a.score || (a.d.id < b.d.id ? -1 : 1));
    const out = [], bases = new Set(), mine = () => out.some((c) => c.d.own);
    for (const c of cands) { if (out.length === 3) break; if ((c.d.base && bases.has(c.d.base)) || (c.d.own && mine())) continue; out.push(c); if (c.d.base) bases.add(c.d.base); }
    for (const c of cands) { if (out.length === 3) break; if (!out.includes(c) && !(c.d.own && mine())) out.push(c); }
    const known = [...kit.values()].some((it) => it.lv != null);
    // ready: every main ingredient had in full (short counts as missing here, so the note never says too much)
    const ready = out.filter((c) => read(c.d, kit).every((r) => r.staple || r.st === "have")).length;
    const where = k === "travel" ? "travel fridge" : "kitchen";
    const note = !known ? `Nothing in the ${where} is checked yet, so these ideas show what to buy. Check the ${where} and they follow what you have.`
      : ready === 0 && out[0].fit < 0.5 ? `Not much in the ${where} for dinner. These are the closest; each one says what to buy.`
      : ready === 0 ? `None of these is all in the ${where}; each one says what to buy.`
      : ready < 3 ? `Only ${ready === 1 ? "one of these" : "two of these"} can be made from what you have; the ${3 - ready === 1 ? "other says" : "others say"} what to buy.` : "";
    const res = { list: out.map((c) => c.d), note, ready };
    Object.assign(memo, { K, k, day, since, out: res });
    return res;
  }

  /* "Best you can" parts (Junyan, 2026-10-21, d51). For a part dish (QuestMeals SLOTS: Super Veggie, Nutty Pudding) and
     the meal's ticks on it, what each part shows in kitchen k:
     - a tick stays where it is (the food he used, matched to the real ingredient it stands for), so a row never moves
       under his finger when the tick takes the last of it;
     - every other real ingredient shows itself when the kitchen has it, else the closest swap it has (its listed swaps
       in order, then any item matching the part's pattern), else itself when not checked yet, else itself marked
       "none in the kitchen". One food is never shown in two places in the dish, and real ingredients are placed first,
       so a swap never takes a food another part needs.
     Returns [{ id, role, filled, rows: [{ entry (what a tick stores), name, amt, on, swap, for (the real ingredient),
     st ("have" | "unchecked" | "none"), word, it }] }]. */
  function slotRows(K, k, d, entries) {
    const M = QM(), kit = byKey(K, k), all = QK().items(K, k), key = QK().keyOf;
    const look = (name) => { const it = kit.get(key(name)) || null;
      const st = !it || it.lv === 0 ? "none" : it.lv == null ? "unchecked" : "have";
      return { it: st === "none" ? null : it, st }; };
    const ents = (entries || []).map((e) => ({ e, p: M.slotOf(d, e) })).filter((x) => x.p);
    const used = new Set(ents.map((x) => key(x.p.name)));
    const parts = d.slots.map((s) => {
      const rows = s.want.map((w) => ({ w, for: w[0], amt: w[1], entry: null }));
      const mine = ents.filter((x) => x.p.slot === s.id), rest = [];
      for (const x of mine) { const r = rows.find((y) => !y.entry && key(y.for) === key(x.p.name)); if (r) Object.assign(r, { entry: x.e, name: x.p.name, swap: false }); else rest.push(x); }
      for (const x of rest) { const r = rows.find((y) => !y.entry);
        if (r) Object.assign(r, { entry: x.e, name: x.p.name, swap: true });
        else rows.push({ w: s.want[0], for: s.want[0][0], amt: s.want[0][1], entry: x.e, name: x.p.name, swap: true }); }
      return { s, rows };
    });
    const open = () => parts.flatMap((p) => p.rows.filter((r) => !r.entry && !r.name).map((r) => ({ p, r })));
    const take = (r, name, swap) => { r.name = name; r.swap = swap; used.add(key(name)); };
    const cands = (w) => { const out = (w[2] || []).slice();
      if (w[3]) { const re = new RegExp(w[3], "i"); for (const it of all) if (re.test(it.name)) out.push(it.name); }
      return out; };
    // the real ingredients the kitchen has, then swaps it has, then real ones not checked yet, then swaps not checked yet
    for (const { r } of open()) if (!used.has(key(r.for)) && look(r.for).st === "have") take(r, r.for, false);
    for (const { r } of open()) { const n = cands(r.w).find((c) => !used.has(key(c)) && look(c).st === "have"); if (n) take(r, (kit.get(key(n)) || {}).name || n, true); }
    for (const { r } of open()) if (!used.has(key(r.for)) && look(r.for).st === "unchecked") take(r, r.for, false);
    for (const { r } of open()) { const n = (r.w[2] || []).find((c) => !used.has(key(c)) && look(c).st === "unchecked"); if (n) take(r, (kit.get(key(n)) || {}).name || n, true); }
    for (const { r } of open()) { r.name = r.for; r.swap = false; r.none = true; }
    return parts.map(({ s, rows }) => ({ id: s.id, role: s.role, filled: rows.some((r) => r.entry),
      rows: rows.map((r) => { const l = r.none ? { it: null, st: "none" } : look(r.name);
        const word = l.st === "none" ? "none in the kitchen" : l.st === "unchecked" ? "not checked"
          : typeof l.it.q === "number" ? `have ${l.it.amt}` : (QK().LEVELS[l.it.lv] || "").toLowerCase();
        return { entry: r.entry || `${s.id}:${r.name}`, name: r.name, amt: r.amt, on: !!r.entry, swap: !!r.swap, for: r.for, st: l.st, word, it: l.it }; }) }));
  }
  // the parts a part dish could fill from kitchen k now (ticked, or a food it has): "you have 6 of 8 parts"
  const slotsHave = (K, k, d, entries) => slotRows(K, k, d, entries).filter((p) => p.filled || p.rows.some((r) => r.st === "have")).length;

  root.QuestIdeas = { get POOL() { return POOL(); }, MORE, banned, byId, staple, read, status, pick, jitter, atStart, slotRows, slotsHave };
})(typeof window !== "undefined" ? window : globalThis);
