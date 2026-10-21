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

test("d53: the full recipes go on the home shopping list: a food with no item at all is a plain row, and buying it adds it", () => {
  let k = K.remove(stock([["h:walnuts", 3]]), "h:walnuts", at(-1));   // he deleted walnuts
  const L = K.shopList(k, "home", T0, T0 + 3 * D, QM.DISHES);
  const rows = L.groups.flatMap((g) => g.list.filter((r) => r.why === "none").map((r) => [g.shelf.id, r.it.name, r.it.id]));
  assert.deepEqual(J(rows), [["pantry", "Walnuts", "n:walnut"], ["pantry", "Sunflower lecithin", "n:sunflower-lecithin"]]);
  assert.ok(L.groups.flatMap((g) => g.list).find((r) => r.it.name === "Sunflower lecithin").uses.some((u) => u.dish === "Nutty Pudding"));
  // the travel fridge never gets the full recipes
  assert.equal(K.shopList({}, "travel", T0, T0 + 2 * D, QM.DISHES).count, 0);
  // tick it, then Mark ticked items as bought: it is in the kitchen (the deleted walnuts come back), at Plenty, off the list
  k = K.tick(K.tick(k, "n:walnut", at(0)), "n:sunflower-lecithin", at(0));
  const b = K.buyTicked(k, "home", at(1));
  assert.equal(b.n, 2);
  const it = K.items(b.K, "home").filter((x) => /walnut|lecithin/i.test(x.name)).map((x) => [x.name, x.lv]);
  assert.deepEqual(J(it), [["Walnuts", 3], ["Sunflower lecithin", 3]]);
  assert.equal(K.shopList(b.K, "home", T0, T0 + 3 * D, QM.DISHES).groups.flatMap((g) => g.list).filter((r) => r.why === "none").length, 0);
  // What did you buy? lists it at the top with no item yet, and filling it adds it
  const pk = K.pickList(k, "home", "buy", T0, T0 + 3 * D, QM.DISHES).find((r) => r.name === "Sunflower lecithin");
  assert.deepEqual(J([pk.top, pk.item, pk.shelf]), [true, null, "pantry"]);
  const f = K.fill(k, "home", [pk], at(2), "buy");
  assert.ok(K.items(f.K, "home").some((x) => x.name === "Sunflower lecithin" && x.lv === 3));
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
  assert.ok(body.includes("Full recipe:"));
  assert.ok(/howTo\(d\) \+/.test(body), "every other dish (ideas, his own) has How to make it too");
  assert.match(body, /kitDinner\(k, d, [^;]*, amts\);/);
  const kd = html.slice(html.indexOf("function kitDinner("), html.indexOf("function kitEatToast("));
  assert.match(kd, /QM\.entryName\(d, name\)/); assert.match(kd, /\{ name:food \}/);
  const ed = html.slice(html.indexOf("function openDishEdit("), html.indexOf("A walk, hike or other outdoor block"));
  assert.ok(ed.includes('id="deSteps"') && ed.includes("steps:S.steps"));
  assert.match(html, /r\.why === "none" \? "not in the kitchen"/);
  for (const f of ["quest-meals", "quest-kitchen", "quest-ideas"]) assert.match(html, new RegExp(`${f}\\.js\\?v=20261021d51`), f);
  assert.ok(!/[—–]/.test(body.match(/For 2 people\. Each part[^<]*/)[0]));
});
