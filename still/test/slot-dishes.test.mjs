// node --test still/test/*.test.mjs   ("best you can" Super Veggie and Nutty Pudding, recipe steps, the full recipe on the
// shopping list: Junyan 2026-10-21, d51 to d53)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
for (const f of ["../quest-meals.js", "../quest-kitchen.js", "../quest-merge.js", "../quest-ideas.js"]) vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8"), ctx);
const K = ctx.QuestKitchen, QM = ctx.QuestMeals, QI = ctx.QuestIdeas;
const html = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");
const J = (x) => JSON.parse(JSON.stringify(x));
const T0 = Date.parse("2026-10-21T16:00:00Z"), H = 3600000, D = 86400000;
const at = (h) => new Date(T0 + h * H).toISOString();
const sv = QM.dishOf("sv"), np = QM.dishOf("np");
function stock(list, h = -30) {
  let k = {};
  for (const [id, v] of list) k = typeof v === "number" ? K.setLevel(k, id, v, at(h), "buy") : K.setAmount(k, id, v, at(h));
  return k;
}
const part = (rows, id) => rows.find((p) => p.id === id);
const show = (p) => p.rows.map((r) => [r.name, r.st, r.swap]);

test("d51: each part shows the real thing if the kitchen has it, else the closest swap it has, else none in the kitchen", () => {
  const k = stock([["h:broccoli", 0], ["h:cauliflower", "400 g"], ["h:kale", "300 g"], ["h:black-lentils", 0], ["h:chickpeas", 3],
    ["h:shiitake", 0], ["h:limes", "3"], ["h:apple-cider-vinegar", 0], ["h:sherry-vinegar", 2], ["h:hemp-seeds", 0], ["h:pumpkin-seeds", "200 g"]]);
  const rows = QI.slotRows(k, "home", sv, []);
  assert.deepEqual(J(rows.map((p) => p.role)), J(sv.slots.map((s) => s.role)));
  assert.deepEqual(J(show(part(rows, "greens"))), [["Kale", "have", true], ["Cauliflower", "have", false]]);
  const g = part(rows, "greens").rows[0];
  assert.equal(g.for, "Broccoli"); assert.equal(g.amt, "175 g"); assert.equal(g.entry, "greens:Kale"); assert.equal(g.word, "have 300 g");
  assert.deepEqual(J(show(part(rows, "legume"))), [["Chickpeas", "have", true]]);
  // the pattern: any vinegar stands in for the cider vinegar
  assert.deepEqual(J(show(part(rows, "acid"))), [["Lime", "have", false], ["Sherry vinegar", "have", true]]);
  assert.deepEqual(J(show(part(rows, "seeds"))), [["Pumpkin seeds", "have", true]]);
  // shiitake is Out and no other mushroom: the real name, marked none in the kitchen
  const m = part(rows, "mushroom").rows[0];
  assert.deepEqual(J([m.name, m.st, m.word, m.entry]), ["Shiitake mushrooms", "none", "none in the kitchen", "mushroom:Shiitake mushrooms"]);
  // ginger was never checked: shown as itself, not checked (never a made-up "have")
  assert.deepEqual(J(show(part(rows, "ginger"))), [["Fresh ginger, grated", "unchecked", false]]);
  assert.equal(part(rows, "ginger").rows[0].word, "not checked");
  assert.equal(QI.slotsHave(k, "home", sv, []), 4);   // greens, legume, acid, seeds
});

test("d51: one food is never in two parts, and a real ingredient is never taken as another part's swap", () => {
  // no macadamias: Ground nuts may use any nut, but not the walnuts or Brazil nuts their own parts need
  const k = stock([["h:macadamias", 0], ["h:walnuts", "200 g"], ["h:brazil-nuts", "10"], ["h:almonds", "300 g"]]);
  const rows = QI.slotRows(k, "home", np, []);
  assert.deepEqual(J(show(part(rows, "nuts"))), [["Almonds", "have", true]]);
  assert.deepEqual(J(show(part(rows, "walnuts"))), [["Walnuts", "have", false]]);
  assert.deepEqual(J(show(part(rows, "brazil"))), [["Brazil nuts", "have", false]]);
  // only frozen berries: one berry row takes them, the other has none
  const b = QI.slotRows(stock([["h:blueberries", 0], ["h:cherries", 0], ["h:frozen-berries", "500 g"]]), "home", np, []);
  assert.deepEqual(J(show(part(b, "berries"))), [["Frozen berries", "have", true], ["Cherries", "none", false]]);
});

test("d51: a tick stays where it is when it takes the last of a food, and a pick from Use something else fills its part", () => {
  let k = stock([["h:broccoli", "175 g"], ["h:kale", "300 g"]]);
  const e = "greens:Broccoli";
  k = K.eat(k, "home", "2026-10-21|dinner|sv|" + e, { name: "Broccoli" }, true, at(0), "175 g").K;
  assert.equal(K.item(k, "h:broccoli").left, 0);
  let rows = QI.slotRows(k, "home", sv, [e]);
  assert.deepEqual(J(part(rows, "greens").rows.map((r) => [r.name, r.on, r.st])), [["Broccoli", true, "none"], ["Kale", false, "have"]]);
  assert.equal(part(rows, "greens").filled, true);
  // an old tick by the recipe's name sits on its own row
  rows = QI.slotRows(k, "home", sv, ["Cauliflower"]);
  assert.deepEqual(J(part(rows, "greens").rows.map((r) => [r.name, r.on, r.swap])), [["Kale", false, true], ["Cauliflower", true, false]]);
  // a free pick (anything from the kitchen) takes the first open row of its part; a second one adds a row
  rows = QI.slotRows(k, "home", sv, ["mushroom:Carrots", "mushroom:Spinach"]);
  assert.deepEqual(J(part(rows, "mushroom").rows.map((r) => [r.name, r.on, r.for, r.amt])),
    [["Carrots", true, "Shiitake mushrooms", "100 g"], ["Spinach", true, "Shiitake mushrooms", "100 g"]]);
  const t = QM.tick(null, sv, ["mushroom:Carrots", "mushroom:Spinach"], { mult: 1 });
  assert.equal(QM.dishStatus(t.rec, sv).n, 1, "two foods in one part still fill one part");
});

test("d51: a swap tick takes the real ingredient's amount off the swap's own kitchen item", () => {
  let k = stock([["h:kale", "300 g"], ["h:pumpkin-seeds", "200 g"]]);
  const r = K.eat(k, "home", "x|dinner|sv|greens:Kale", { name: QM.entryName(sv, "greens:Kale") }, true, at(0), "175 g");
  assert.equal(r.id, "h:kale"); assert.equal(K.item(r.K, "h:kale").left, 125);
  const s = K.eat(r.K, "home", "x|dinner|sv|seeds:Pumpkin seeds", { name: "Pumpkin seeds" }, true, at(0), "4 tbsp");
  assert.equal(K.item(s.K, "h:pumpkin-seeds").left, 160);   // 4 tbsp about 40 g
});

test("d59: the recipe rows on a list are a short set of core foods, never the extras, and a deleted food is not put back", () => {
  const none = (k, kk) => J(K.shopList(k, kk, T0, T0 + 3 * D, QM.dishesFor(kk)).groups.flatMap((g) => g.list.filter((r) => r.why === "none").map((r) => [g.shelf.id, r.it.name, r.it.id])));
  assert.deepEqual(J(QM.DISHES.map((d) => d.core)), [["greens", "legume", "mushroom"], ["berries", "milk", "nuts"]]);
  // home: the catalogue has a food for every core part, so nothing is added, and Sunflower lecithin no longer is
  assert.deepEqual(none({}, "home"), []);
  // he deleted the lecithin and walnuts: neither comes back
  let k = K.remove(K.remove(stock([["h:walnuts", 3]]), "h:walnuts", at(-1)), "h:cocoa", at(-1));
  assert.deepEqual(none(k, "home"), []);
  // a core part with nothing at all (every legume deleted but chickpeas) is still covered by what is left
  for (const id of ["h:black-lentils", "h:green-lentils", "h:white-beans"]) k = K.remove(k, id, at(-1));
  assert.deepEqual(none(k, "home"), []);
  // ...and once the chickpeas go too, the part is empty but its foods were all deleted by him: nothing is put back
  assert.deepEqual(none(K.remove(k, "h:chickpeas", at(-1)), "home"), []);
  // a core food the kitchen never had: its part's first real ingredient is a row (here the berries part, after he removed
  // every berry the catalogue names; the deleted ones are skipped)
  const cat = { items: { "h:blueberries": { id: "h:blueberries", k: "home", name: "Blueberries", del: true, at: at(-1) },
    "h:cherries": { id: "h:cherries", k: "travel", name: "Cherries", shelf: "cool", at: at(-1) },
    "h:frozen-berries": { id: "h:frozen-berries", k: "travel", name: "Frozen berries", shelf: "cool", at: at(-1) } } };
  assert.deepEqual(none(cat, "home"), [["freezer", "Cherries", "n:home:cherry"]]);
  // an extra he has and that runs Low is on the list like any item; one he does not have never is
  const lec = K.add({}, "home", "pantry", "Sunflower lecithin", at(-5), "Other");
  const low = K.setLevel(lec.K, lec.id, 1, at(-1), "tap");
  const L = K.shopList(low, "home", T0, T0 + 3 * D, QM.DISHES).groups.flatMap((g) => g.list).map((r) => [r.it.name, r.why]);
  assert.deepEqual(J(L), [["Sunflower lecithin", "low"]]);
  // the passed list decides; a home dish never puts a row on the travel list
  assert.deepEqual(J(K.missing({}, "travel", QM.DISHES)), []);
});

test("d58, d59: the travel list holds at most 5 of the travel versions' few foods, buying one adds it to the travel fridge", () => {
  const rows = (k) => K.shopList(k, "travel", T0, T0 + 2 * D, QM.dishesFor("travel")).groups.flatMap((g) => g.list.filter((r) => r.why === "none").map((r) => [g.shelf.id, r.it.name]));
  const empty = rows({});   // by shelf: cool box, then dry bag
  assert.equal(empty.length, K.MAX_RECIPE_ROWS);
  assert.deepEqual(J(empty), [["cool", "Spinach"], ["cool", "Almond milk"], ["cool", "Lemons"], ["dry", "Cooked lentils"], ["dry", "Chia seeds"]]);
  const homeOnly = /shiitake|macadamia|lecithin|cocoa|cinnamon|pomegranate|flax|brazil|cumin|vinegar|oil|ginger|cauliflower/i;
  assert.ok(!empty.some(([, n]) => homeOnly.test(n)), "nothing from the full home recipes");
  // with the travel starter's Mixed nuts and some lentils in, those parts are covered and the next foods move up
  let k = K.fill({}, "travel", [{ name: "Mixed nuts", group: "Nuts and seeds", shelf: "dry" }, { name: "Green lentils", group: "Legumes and grains", shelf: "dry" }], at(-5), "bring").K;
  assert.deepEqual(J(rows(k)), [["cool", "Spinach"], ["cool", "Lemons"], ["cool", "Almond milk"], ["dry", "Chia seeds"], ["dry", "Hemp seeds"]]);
  // tick one and Mark ticked items as bought: it is in the travel fridge, off the list
  const id = K.missing(k, "travel").find((x) => x.name === "Chia seeds").id;
  assert.equal(id, "n:travel:chia-seed");
  const b = K.buyTicked(K.tick(k, id, at(0)), "travel", at(1));
  assert.equal(b.n, 1);
  assert.ok(K.items(b.K, "travel").some((x) => x.name === "Chia seeds" && x.lv === 3 && x.shelf === "dry"));
  assert.ok(!K.items(b.K, "home").some((x) => x.name === "Chia seeds" && x.lv === 3), "home is untouched");
  // a food he deleted from the travel fridge is not put back: with the green lentils gone the part is empty, so its real
  // ingredient (cooked lentils) is offered, but not once he has deleted that too
  const g = K.items(k, "travel").find((x) => x.name === "Green lentils");
  const k2 = K.remove(k, g.id, at(0));
  assert.ok(rows(k2).some(([, n]) => n === "Cooked lentils"));
  const c = K.add(k2, "travel", "dry", "Cooked lentils", at(0), "Legumes and grains");
  assert.ok(!rows(K.remove(c.K, c.id, at(0.5))).some(([, n]) => n === "Cooked lentils"));
});

test("d53: his own dishes take optional steps, one a line, kept with the dish", () => {
  const r = K.saveDish({}, { name: "Navy bean pasta", items: [["Navy beans", "200 g"]], steps: "1. Boil the pasta 9 min\n\n2) Warm the beans  \nToss together" }, at(0));
  const d = K.ownDish(r.K, r.id);
  assert.deepEqual(J(d.steps), ["Boil the pasta 9 min", "Warm the beans", "Toss together"]);
  assert.deepEqual(J(QM.stepsOf(d)), J(d.steps));
  const n = K.saveDish({}, { name: "Plain", items: [["Kale", ""]] }, at(0));
  assert.equal(n.K.dishes[n.id].steps, undefined, "no steps: nothing stored");
  assert.deepEqual(J(K.ownDish(n.K, n.id).steps), []);
  assert.equal(K.stepList(Array(30).fill("x")).length, 20);
  // the merge keeps the steps with the rest of the dish
  const m = ctx.QuestMerge.mergeKitchen({ dishes: {} }, r.K);
  assert.deepEqual(J(m.dishes[r.id].steps), J(d.steps));
});

test("d51 to d53 on the page: parts with swaps and Use something else, How to make it, the full recipe, editor steps", () => {
  const i = html.indexOf("function openMeal(b)"), body = html.slice(i, html.indexOf("The meal sheet's kitchen parts"));
  assert.match(body, /QI\(\)\.slotRows\(G\.kitchen, kitToday\(\), d, dishOn\(d\)\)/);
  assert.ok(body.includes("Use something else") && body.includes("data-dpk") && body.includes("data-dsl"));
  assert.ok(body.includes("How to make it") && body.includes("QM.stepsOf(d, use)") && body.includes("<ol>"));
  assert.ok(body.includes("`Full recipe${"), "the full recipe, on a tap since d73");
  assert.ok(/links\(howTo\(d\)\) \+/.test(body), "every other dish (ideas, his own) has How to make it too");
  assert.match(body, /kitDinner\(k, d, [^;]*, amts\);/);
  const kd = html.slice(html.indexOf("function kitDinner("), html.indexOf("function kitEatToast("));
  assert.match(kd, /QM\.entryName\(d, name\)/); assert.match(kd, /\{ name:food \}/);
  const ed = html.slice(html.indexOf("function openDishEdit("), html.indexOf("A walk, hike or other outdoor block"));
  assert.ok(ed.includes('id="deSteps"') && ed.includes("steps:S.steps"));
  assert.match(html, /r\.why === "none" \? "not in the kitchen"/);
  for (const [f, v] of [["quest-meals", "d70"], ["quest-kitchen", "d70d"], ["quest-ideas", "d69b"]]) assert.match(html, new RegExp(`${f}\\.js\\?v=20261021${v}"`), f);
  assert.match(body, /p\.rows\.filter\(r => r\.on \|\| r\.st !== "none"\)\.map\(r => r\.entry\)/, "Got everything skips foods marked none in the kitchen");
  assert.ok(!/For 2 people\. Each part/.test(body), "d72: the intro is gone");
});

test("d57: Super Veggie's oil is 15 ml for the two of them, drizzled on at the end, and the list sizes it from that", () => {
  assert.deepEqual(J(sv.items.find((x) => /olive oil/.test(x[0]))), ["Extra virgin olive oil", "15 ml"]);
  assert.deepEqual(J(sv.slots.find((s) => s.id === "oil").want[0].slice(0, 2)), ["Extra virgin olive oil", "15 ml"]);
  assert.ok(QM.stepsOf(sv).some((x) => /^Drizzle over the extra virgin olive oil at the end, 15 ml/.test(x)), QM.stepsOf(sv).join(" / "));
  assert.equal(K.amountFor("Olive oil", QM.DISHES, 2).amt, "30 ml", "two dinners of 15 ml");
});

test("d58: the travel versions: few parts, plants only, no garlic or onion, no oil, soft cooked; they pay like the Blueprint dishes", () => {
  assert.deepEqual(J(QM.dishesFor("travel").map((d) => [d.id, d.name, d.full, d.slots.length])), [["tsv", "Travel Super Veggie", "sv", 4], ["tnp", "Travel Nutty Pudding", "np", 4]]);
  assert.equal(QM.dishesFor("home"), QM.DISHES);
  for (const d of QM.TRAVEL) {
    assert.ok(!d.items.some((x) => QI.banned(x[0]) || /\boil\b/i.test(x[0])), d.id);
    for (const x of QM.stepsOf(d)) assert.ok(!/\b(fry|fried|roast|raw)\b/i.test(x), x);
    assert.equal(QM.groupOf(d), "bp");
    assert.deepEqual(J(d.core), J(d.slots.map((s) => s.id)));
  }
  assert.deepEqual(J(QM.stepsOf(QM.dishOf("tsv"))), ["Rinse the cooked lentils and warm them in a pan with a splash of water, about 5 min.",
    "Add the baby spinach with a little more water, cover, and cook until very soft, 3 to 5 min.", "Squeeze over the lemons.", "Top with the hemp seeds and eat it warm. No oil needed."]);
  // the travel fridge's foods fill the parts: Mixed nuts stands in for walnuts, Hummus is not a legume swap
  let k = K.fill({}, "travel", [{ name: "Mixed nuts", group: "Nuts and seeds", shelf: "dry" }, { name: "Oat milk", group: "Drinks and ferments", shelf: "cool" },
    { name: "Frozen berries", group: "Fruit", shelf: "cool" }, { name: "Hummus", group: "Legumes and grains", shelf: "cool" }], at(-5), "bring").K;
  const parts = QI.slotRows(k, "travel", QM.dishOf("tnp"), []);
  assert.deepEqual(J(parts.map((p) => [p.id, p.rows[0].name, p.rows[0].st])), [["chia", "Chia seeds", "none"], ["milk", "Oat milk", "have"], ["berries", "Frozen berries", "have"], ["nut", "Mixed nuts", "have"]]);
  assert.equal(QI.slotRows(k, "travel", QM.dishOf("tsv"), [])[0].rows[0].st, "none");
  // green beans are a vegetable, not the legume part
  const gb = K.fill({}, "travel", [{ name: "Green beans", group: "Vegetables", shelf: "cool" }], at(-5), "bring").K;
  assert.ok(K.missing(gb, "travel").some((x) => x.name === "Cooked lentils"));
  // ticks pay by parts and share the Blueprint dishes' daily cap with the full recipes
  const o = { mult: 1.5, dish: 6, dim: [1, 0.7], dishLimit: 2 };
  const t = QM.tick(null, QM.dishOf("tnp"), ["milk:Oat milk", "berries:Frozen berries"], o);
  assert.equal(t.rec.v["dish:tnp"][1], 5);   // 2 of 4 parts of +9
  assert.equal(QM.slotsUsed({ m1: t.rec }, "m2", sv), 1, "it holds a Blueprint slot");
  assert.equal(QM.tick(null, QM.dishOf("tnp"), QM.dishOf("tnp").slots.map((s) => `${s.id}:${s.want[0][0]}`), o).done, 1, "all four parts: the Blueprint meal done");
});

test("d58 on the page: the travel fridge shows the travel versions, the full recipe small, and a tick on the other kitchen's dish still reads", () => {
  assert.match(html, /const bpToday = \(\) => \(QM && QM\.dishesFor && QK\(\) \? QM\.dishesFor\(kitToday\(\)\) : QM \? QM\.DISHES : \[\]\);/);
  const i = html.indexOf("function openMeal(b)"), body = html.slice(i, html.indexOf("The meal sheet's kitchen parts"));
  assert.ok(body.includes("bps.map(d => dishCard(d))") && body.includes("dishGot(bps)"));
  assert.ok(body.includes('" (at home)"') && body.includes("(d.full && QM.dishOf(d.full)) || d"));
  assert.match(html, /QM\.dishOf\(id, QM\.BLUEPRINT \|\| QM\.DISHES\)/);
  // an empty kitchen shows the whole recipe's steps, not only the step that needs no part
  assert.ok(body.includes("return Object.values(u).some(l => l.length) ? u : undefined;"));
  assert.equal(QM.stepsOf(QM.dishOf("tnp"), undefined).length, 3);
  // a list reads the dishes of the kitchen he is looking at, not the one in use today (review, 2026-10-21)
  assert.ok(html.includes("QK().shopList(K, k, t, shop.at, kitDishes(k))") && html.includes("kitDishes(S.k))"));
});

test("d61: tonight's ideas are cooked gut-friendly: steamed or simmered, never roasted, baked or fried, at most 15 ml of oil", () => {
  for (const d of QI.POOL) {
    const oil = d.items.filter((x) => /\boil\b/i.test(x[0]));
    for (const [, a] of oil) assert.ok(parseFloat(a) <= 15, `${d.id} ${a}`);
    assert.ok(!/\b(roast|roasted|bake|baked|fry|fried|in the oil|°C)\b/i.test(d.how + " " + d.name), `${d.id}: ${d.how}`);
    if (oil.length) assert.match(d.how, /drizzl/i, d.id);
  }
});
