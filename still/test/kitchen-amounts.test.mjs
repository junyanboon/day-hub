// node --test still/test/*.test.mjs   (kitchen amounts: Junyan 2026-10-21, d42 to d47)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
for (const f of ["../quest-meals.js", "../quest-kitchen.js", "../quest-merge.js"]) vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8"), ctx);
const K = ctx.QuestKitchen, M = ctx.QuestMerge, QM = ctx.QuestMeals;
const html = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");
const J = (x) => JSON.parse(JSON.stringify(x));
const T0 = Date.parse("2026-10-21T16:00:00Z"), H = 3600000, D = 86400000;
const at = (h) => new Date(T0 + h * H).toISOString();
const it = (k, id) => K.item(k, id);
// Home with Broccoli 350 g (bought at hour 0)
const withBroc = (q = "350 g") => K.setAmount({}, "h:broccoli", q, at(0));

test("d42: a bare count at the end splits ('Bananas 4'), and no false splits", () => {
  for (const [raw, name, amt] of [["Bananas 4", "Bananas", "4"], ["Eggs 12", "Eggs", "12"], ["Lime 2", "Lime", "2"], ["avocados 3", "Avocados", "3"],
    ["Chickpeas 400", "Chickpeas", "400"]]) assert.deepEqual(J(K.splitName(raw)), { name, amt }, raw);
  for (const n of ["Omega 3", "7 Up", "5 spice", "Room 7", "Vitamin B 12", "Coke Zero"]) assert.deepEqual(J(K.splitName(n)), { name: n, amt: "" }, n);
});

test("d42: units: a count for food bought by the piece, ml for drinks and oils, else grams", () => {
  for (const [n, u] of [["Bananas", ""], ["Avocados", ""], ["Limes", ""], ["Lemons", ""], ["Apples", ""], ["Pears", ""], ["Eggs", ""], ["Red peppers", ""],
    ["Broccoli", "g"], ["Walnuts", "g"], ["Macadamia milk", "ml"], ["Olive oil", "ml"], ["Pomegranate juice", "ml"], ["Lemon juice", "ml"],
    ["Coconut yogurt", "g"], ["Black pepper", "g"], ["Chia seeds", "g"]]) assert.equal(K.unitFor(n), u, n);
  assert.deepEqual(J(K.qtyOf("2 × 400 g", "Chickpeas")), { q: 800, u: "g" });
  assert.deepEqual(J(K.qtyOf("1.5 L", "Oat milk")), { q: 1500, u: "ml" });
  assert.deepEqual(J(K.qtyOf("4", "Bananas")), { q: 4, u: "" });
  assert.deepEqual(J(K.qtyOf("350", "Broccoli")), { q: 350, u: "g" });
  assert.deepEqual(J(K.qtyOf("2", "Broccoli", "")), { q: 2, u: "" }, "a bare number takes the unit the item has");
  assert.equal(K.qtyOf("a jar", "Honey"), null);
  // recipe amounts in an item's unit: spoons roughly, a pinch or a count against grams cannot be turned
  assert.equal(K.recipeIn("2 tbsp", "g"), 20); assert.equal(K.recipeIn("2 tbsp", "ml"), 30);
  assert.equal(K.recipeIn("½ tsp", "g"), 1.5); assert.equal(K.recipeIn("2 tsp", "ml"), 10);
  assert.equal(K.recipeIn("a pinch", "g"), null); assert.equal(K.recipeIn("1", ""), 1); assert.equal(K.recipeIn("1", "g"), null);
  assert.equal(K.recipeIn("1 medium", ""), 1); assert.equal(K.recipeIn("30 ml", "ml"), 30); assert.equal(K.recipeIn("175 g", "g"), 175);
});

test("recipe change: Super Veggie broccoli and cauliflower are 175 g each (350 g together)", () => {
  const sv = QM.DISHES.find((d) => d.id === "sv");
  assert.equal(sv.items.find((x) => x[0] === "Broccoli")[1], "175 g");
  assert.equal(sv.items.find((x) => x[0] === "Cauliflower")[1], "175 g");
});

test("d42: the tile shows the amount; an item with no number asks how many (levels retired, 2026-10-21)", () => {
  let r = K.add({}, "home", "fridge", "Bananas 4", at(0));
  assert.equal(it(r.K, r.id).name, "Bananas");
  assert.equal(K.tileLine(it(r.K, r.id), T0, T0 + 7 * D), "4");
  assert.equal(it(r.K, r.id).lv, 3);
  // no number given: "how many?", no made-up number and no level word
  r = K.add({}, "home", "pantry", "Dates", at(0));
  assert.equal(it(r.K, r.id).q, undefined);
  assert.equal(K.tileLine(it(r.K, r.id), T0, T0 + 7 * D), "how many?");
  // the old d39 amount is the first amount, read the same on every device with no write
  const old = { items: { u1: { id: "u1", k: "home", shelf: "pantry", name: "Navy beans", amt: "400 g", group: "Legumes and grains", lv: 2, at: at(-5) } } };
  assert.equal(it(old, "u1").q, 400); assert.equal(it(old, "u1").u, "g"); assert.equal(K.tileLine(it(old, "u1"), T0, T0 + 7 * D), "400 g");
  assert.deepEqual(J(K.items(old, "home")), J(K.items(old, "home")));
});

test("d43: a tap on an amount item changes nothing; since the levels were retired every tile tap opens the item's page", () => {
  const k = withBroc();
  assert.equal(K.tap(k, "h:broccoli", at(1)), k);
  const bind = html.slice(html.indexOf("function bindShelves()"), html.indexOf("function bindShelves()") + 900);
  assert.match(bind, /return openKitchenItem\(bn\.dataset\.kit\);/);
  assert.ok(!/QK\(\)\.tap\(/.test(html), "no tap steps a level on the page");
});

test("d44: a ticked ingredient takes its recipe amount off; a redraw or a second tick takes nothing more; the untick puts it back", () => {
  let k = withBroc();
  const key = "2026-10-21|m1|sv|Broccoli";
  let r = K.eat(k, "home", key, { name: "Broccoli" }, true, at(2), "175 g");
  assert.equal(r.id, "h:broccoli");
  assert.equal(it(r.K, "h:broccoli").left, 175);
  assert.equal(K.tileLine(it(r.K, "h:broccoli"), T0, T0 + 7 * D), "175 g · buy");   // under 2 dinners' worth (d45)
  // the same tick again (a redraw, Got everything after it): nothing more
  const again = K.eat(r.K, "home", key, { name: "Broccoli" }, true, at(3), "175 g");
  assert.equal(again.K, r.K); assert.equal(it(again.K, "h:broccoli").left, 175);
  // the amount changed in the meal sheet is what comes off
  k = K.setTake(r.K, key, 100, at(3));
  assert.equal(it(k, "h:broccoli").left, 250);
  // untick: all of it back
  r = K.eat(k, "home", key, { name: "Broccoli" }, false, at(4));
  assert.equal(it(r.K, "h:broccoli").left, 350);
  assert.equal(K.setTake(r.K, key, 50, at(5)), r.K, "a tick that is off has no amount to change");
  // tick again: a new take-off
  r = K.eat(r.K, "home", key, { name: "Broccoli" }, true, at(6), "175 g");
  assert.equal(it(r.K, "h:broccoli").left, 175);
});

test("d44: never below 0; an amount that cannot be turned is 0 for him to fill in; other kitchen and level items are left alone", () => {
  let k = withBroc("100 g");
  k = K.eat(k, "home", "a", { name: "Broccoli" }, true, at(1), "175 g").K;
  assert.equal(it(k, "h:broccoli").left, 0);
  assert.equal(it(k, "h:broccoli").lv, 0);
  assert.equal(K.tileLine(it(k, "h:broccoli"), T0, T0 + 7 * D), "none left · buy");
  k = K.eat(k, "home", "b", { name: "Broccoli" }, true, at(2), "175 g").K;
  assert.equal(it(k, "h:broccoli").left, 0);
  k = K.eat(k, "home", "a", { name: "Broccoli" }, false, at(3)).K;
  assert.equal(it(k, "h:broccoli").left, 0, "still 175 g taken against 100 g");
  k = K.eat(k, "home", "b", { name: "Broccoli" }, false, at(4)).K;
  assert.equal(it(k, "h:broccoli").left, 100);
  // a pinch of saffron: a record of 0, nothing taken
  let s = K.setAmount({}, "h:saffron", "2 g", at(0));
  s = K.eat(s, "home", "p", { name: "Saffron" }, true, at(1), "a pinch").K;
  assert.equal(s.used.p.q, 0); assert.equal(it(s, "h:saffron").left, 2);
  // a level item (no number): nothing taken, no record (d46)
  const lvl = K.setLevel({}, "h:cauliflower", 3, at(0), "tap");
  const r = K.eat(lvl, "home", "c", { name: "Cauliflower" }, true, at(1), "175 g");
  assert.equal(r.K, lvl); assert.equal(r.id, null);
  // the travel fridge in use: Home's broccoli is not touched
  assert.equal(K.eat(withBroc(), "travel", "t", { name: "Broccoli" }, true, at(1), "175 g").id, null);
});

test("a meal ticked before amounts shipped never subtracts when the new code loads", () => {
  // breakfast this morning on the old page: Walnuts stepped a level, a record with no amount
  let k = K.setLevel({}, "h:walnuts", 3, at(-3), "tap");
  k = K.dinner(k, "home", "2026-10-21|b1|np|Walnuts", "Walnuts", true, at(-2)).K;
  // he gives Walnuts an amount after the new page loads
  k = K.setAmount(k, "h:walnuts", "500 g", at(0));
  assert.equal(it(k, "h:walnuts").left, 500);
  // the redraw ticks nothing, and the same tick again is still the old one: nothing taken
  assert.equal(K.eat(k, "home", "2026-10-21|b1|np|Walnuts", { name: "Walnuts" }, true, at(1), "2 tbsp").K, k);
  // a take-off made before the amount was set does not count either
  const early = J(k); early.used.x = { id: "h:walnuts", q: 50, u: "g", t: at(-1), at: at(-1) };
  assert.equal(it(early, "h:walnuts").left, 500);
  // unticking the old breakfast tick puts back the old way and takes nothing off the amount
  const un = K.eat(k, "home", "2026-10-21|b1|np|Walnuts", { name: "Walnuts" }, false, at(2)).K;
  assert.equal(it(un, "h:walnuts").left, 500);
  assert.equal(un.used["2026-10-21|b1|np|Walnuts"].off, true);
});

test("sync: two devices' take-offs both count, an untick sticks, and merging twice changes nothing", () => {
  const base = withBroc("500 g");
  const a = K.eat(base, "home", "m1|sv|Broccoli", { name: "Broccoli" }, true, at(1), "175 g").K;
  const b = K.eat(base, "home", "m2|k|h:broccoli", { id: "h:broccoli" }, true, at(2), 100).K;
  for (const m of [M.mergeKitchen(a, b), M.mergeKitchen(b, a)]) {
    assert.equal(it(m, "h:broccoli").left, 225);
    assert.equal(it(M.mergeKitchen(m, m), "h:broccoli").left, 225);
  }
  // A unticks; B still holds the tick from before: the later change (the untick) wins on both
  const m = M.mergeKitchen(a, b);
  const aOff = K.eat(m, "home", "m1|sv|Broccoli", { name: "Broccoli" }, false, at(3)).K;
  for (const x of [M.mergeKitchen(aOff, b), M.mergeKitchen(b, aOff)]) assert.equal(it(x, "h:broccoli").left, 400);
  // an amount fixed in Edit on one device and a meal on the other: the meal after the fix counts
  const fixed = K.setAmount(base, "h:broccoli", "300 g", at(4));
  const ate = K.eat(base, "home", "m3", { name: "Broccoli" }, true, at(5), "175 g").K;
  assert.equal(it(M.mergeKitchen(fixed, ate), "h:broccoli").left, 125);
});

test("d45: low is under 2 dinners' worth by the Blueprint dishes, else under a quarter of what he bought; 0 is Out", () => {
  let k = withBroc("400 g");
  assert.equal(it(k, "h:broccoli").low, 350);
  assert.equal(it(k, "h:broccoli").lv, 3);
  k = K.eat(k, "home", "a", { name: "Broccoli" }, true, at(1), 60).K;
  assert.equal(it(k, "h:broccoli").lv, 1, "340 g is under 2 x 175 g");
  let r = K.add({}, "home", "fridge", "Bananas 8", at(0));
  const ban = r.id;
  r.K = K.eat(r.K, "home", "b1", { id: ban }, true, at(1), 6).K;
  assert.equal(it(r.K, ban).lv, 2, "2 of 8 is not under a quarter");
  r.K = K.eat(r.K, "home", "b2", { id: ban }, true, at(2), 1).K;
  assert.equal(it(r.K, ban).lv, 1);
  assert.equal(K.tileLine(it(r.K, ban), T0, T0 + 7 * D), "1 · buy");
  // the shopping list holds it, with an amount
  const L = K.shopList(r.K, "home", T0 + 3 * H, T0 + 7 * D, QM.DISHES.concat(QM.IDEAS));
  const row = L.groups[0].list.find((x) => x.it.id === ban);
  assert.equal(row.why, "low"); assert.ok(row.amt);
});

test("d45: 'low by' and the shopping amount use his real use", () => {
  let k = withBroc("1000 g");
  // two Super Veggies on two days: 175 g a day
  k = K.eat(k, "home", "d1", { name: "Broccoli" }, true, at(2), "175 g").K;
  k = K.eat(k, "home", "d2", { name: "Broccoli" }, true, at(26), "175 g").K;
  const b = it(k, "h:broccoli"), now = T0 + 27 * H;
  assert.equal(b.left, 650);
  const rate = K.rateOf(b, now);
  assert.ok(rate > 150 && rate < 200, String(rate));
  // 650 - 350 = 300 g over the low line: low in under 2 days
  const low = K.lowAt(b, now);
  assert.ok(low > now + 1.4 * D && low < now + 2.1 * D, String((low - now) / D));
  assert.match(K.tileLine(b, now, now + 7 * D), /^650 g · low by /);
  // a week to the next shop: about 175 x 7 + 350 - 650 to buy
  const need = K.toBuy(b, now, now + 7 * D);
  assert.ok(need >= 900 && need <= 1100, String(need));
  // no use known and no dish: no guess, so never "soon"
  const w = K.add({}, "home", "pantry", "Dates 500g", at(0));
  assert.equal(K.lowAt(it(w.K, w.id), T0), null);
  assert.equal(K.lowSoon(it(w.K, w.id), T0, T0 + 30 * D), false);
});

test("d43: Edit's Amount sets what there is now; emptying it goes back to levels (d46)", () => {
  let k = withBroc("350 g");
  k = K.eat(k, "home", "a", { name: "Broccoli" }, true, at(1), "175 g").K;
  k = K.setAmount(k, "h:broccoli", "500g", at(2));
  assert.equal(it(k, "h:broccoli").left, 500, "meals before the fix no longer count");
  assert.equal(it(k, "h:broccoli").buy, 500);
  assert.equal(K.setAmount(k, "h:broccoli", "500 g", at(3)), k, "the same amount: nothing written");
  k = K.rename(k, "h:broccoli", "Broccoli", at(3), "200 g");   // the Edit page's Save goes through rename
  assert.equal(it(k, "h:broccoli").left, 200); assert.equal(it(k, "h:broccoli").buy, 500);
  k = K.setAmount(k, "h:broccoli", "", at(4));
  assert.equal(it(k, "h:broccoli").q, undefined);
  assert.equal(it(k, "h:broccoli").lv, 1, "keeps the level it showed");
  assert.equal(K.item(K.tap(k, "h:broccoli", at(5)), "h:broccoli").lv, 0, "taps step again");
});

test("d42: buying adds to what is left (typed, else what he bought last time); bring and the undo; brought home", () => {
  let k = withBroc("350 g");
  k = K.eat(k, "home", "a", { name: "Broccoli" }, true, at(1), "175 g").K;
  let f = K.fill(k, "home", [{ name: "Broccoli", item: "h:broccoli", amt: "500 g" }, { name: "Bananas", amt: "6" }, { name: "Dates" }], at(2), "buy");
  assert.equal(it(f.K, "h:broccoli").left, 675);
  assert.equal(it(f.K, "h:broccoli").buy, 500);
  const ban = K.items(f.K, "home").find((x) => x.name === "Bananas");
  assert.equal(ban.q, 6); assert.equal(ban.u, "");
  assert.equal(K.items(f.K, "home").find((x) => x.name === "Dates").q, undefined, "no number: none made up");
  // undo puts back exactly what was there
  const u = K.unfill(f.K, f.undo, at(2.01));
  assert.equal(it(u, "h:broccoli").left, 175);
  // nothing typed: what he bought last time
  f = K.fill(k, "home", [{ name: "Broccoli", item: "h:broccoli" }], at(3), "buy");
  assert.equal(it(f.K, "h:broccoli").left, 525);
  // Mark ticked items as bought: the same
  const tk = K.buyTicked(K.tick(k, "h:broccoli", at(3)), "home", at(4));
  assert.equal(it(tk.K, "h:broccoli").left, 525);
  // the picker reads an amount with a name (a receipt)
  assert.deepEqual(J(K.preTick([{ id: "p:pasta", name: "Pasta" }], ["500g pasta"], "home").amt), { "p:pasta": "500 g" });
  // a trip's broccoli comes home on top of Home's
  let t = K.fill(k, "travel", [{ name: "Broccoli", amt: "200 g" }], at(5), "bring").K;
  t = K.pick(t, "travel", "2026-10-21", at(5)); t = K.noteActive(t, "2026-10-21", "travel") || t;
  const tr = K.items(t, "travel")[0];
  const home = K.bringHome(t, [tr.id], at(6));
  assert.equal(it(home, "h:broccoli").left, 375);
});

test("d47: From your kitchen: a banana takes 1 off, a gram item a dish's portion (else by group), changeable", () => {
  let r = K.add({}, "home", "fridge", "Bananas 4", at(0));
  assert.equal(K.portion(it(r.K, r.id)), 1);
  assert.equal(K.portion(it(withBroc(), "h:broccoli")), 175);
  assert.equal(K.portion(it(K.setAmount({}, "h:walnuts", "300 g", at(0)), "h:walnuts")), 20, "Nutty Pudding's 2 tbsp");
  assert.equal(K.portion(it(K.setAmount({}, "h:quinoa", "1 kg", at(0)), "h:quinoa")), 80, "a plate of grains");
  assert.equal(K.portion(it(K.setAmount({}, "h:quinoa", "30 g", at(0)), "h:quinoa")), 30, "never more than is left");
  const k = K.eat(r.K, "home", "2026-10-21|m1|kitchen|" + r.id, { id: r.id }, true, at(1), 1).K;
  assert.equal(it(k, r.id).left, 3);
  assert.equal(K.taken(k, "2026-10-21|m1|kitchen|" + r.id).q, 1);
});

test("the page: take fields in the dishes, a From your kitchen card, amounts in the picker, the amount on Edit", () => {
  assert.match(html, /function kitMealCard\(/);
  assert.match(html, /\$\{kitMealCard\(k\)\}/);
  assert.match(html, /data-take="/);
  assert.match(html, /QK\(\)\.setTake\(/);
  assert.match(html, /QK\(\)\.firstTake\(/);   // d70: portion() for an amount item, a first take for a level one
  assert.match(html, /data-kpq="/);
  assert.match(html, /amt:kitFillAmt\(S, r\)/);
  assert.match(html, /Amount now/);
  assert.match(html, /Mark ticked items as bought/);
  assert.match(html, /From your kitchen/);
});

test("review fixes: an untick after a shop still puts back; a shop after eating past 0 gives what he bought", () => {
  let k = withBroc("350 g");
  k = K.eat(k, "home", "lunch", { name: "Broccoli" }, true, at(1), "175 g").K;
  k = K.fill(k, "home", [{ name: "Broccoli", item: "h:broccoli", amt: "500 g" }], at(2), "buy").K;
  assert.equal(it(k, "h:broccoli").left, 675);
  k = K.eat(k, "home", "lunch", { name: "Broccoli" }, false, at(3)).K;
  assert.equal(it(k, "h:broccoli").left, 850, "the lunch tick before the shop comes back");
  // ate 175 g of 100 g, then bought 500 g: 500 g, not 425 g
  let o = withBroc("100 g");
  o = K.eat(o, "home", "x", { name: "Broccoli" }, true, at(1), "175 g").K;
  o = K.fill(o, "home", [{ name: "Broccoli", item: "h:broccoli", amt: "500 g" }], at(2), "buy").K;
  assert.equal(it(o, "h:broccoli").left, 500);
});

test("review fixes: thousands, plain fractions, cherry tomatoes by weight, words kept on a restock", () => {
  assert.deepEqual(J(K.qtyOf("1,000 g", "Oats")), { q: 1000, u: "g" });
  assert.equal(K.amtOf("1,000 g"), "1000 g");
  assert.equal(K.splitName("1,5kg rice").amt, "1.5 kg");
  assert.equal(K.recipeIn("1/2 tsp", "g"), 1.5); assert.equal(K.recipeIn("1/2", ""), 0.5); assert.equal(K.recipeIn("1 1/2 tbsp", "g"), 15);
  assert.equal(K.unitFor("Cherry tomatoes"), "g"); assert.equal(K.unitFor("Tomatoes"), "");
  const lvl = K.setLevel({}, "h:honey", 1, at(0), "tap");
  const f = K.fill(lvl, "home", [{ name: "Honey", item: "h:honey", amt: "a jar" }], at(1), "buy").K;
  assert.equal(it(f, "h:honey").amt, "a jar"); assert.equal(it(f, "h:honey").lv, 3);
});

test("review fixes: an untick on one device beats an amount changed on the other's stale copy", () => {
  const base = K.eat(withBroc("500 g"), "home", "m1", { name: "Broccoli" }, true, at(1), "175 g").K;
  const a = K.eat(base, "home", "m1", { name: "Broccoli" }, false, at(3)).K;   // device A: untick
  const b = K.setTake(base, "m1", 100, at(4));                                 // device B (had not seen it): a new amount
  for (const m of [M.mergeKitchen(a, b), M.mergeKitchen(b, a)]) assert.equal(it(m, "h:broccoli").left, 500);
  // on one device the change still lands
  assert.equal(it(b, "h:broccoli").left, 400);
  assert.equal(it(M.mergeKitchen(base, b), "h:broccoli").left, 400);
});
