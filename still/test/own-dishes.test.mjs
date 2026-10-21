// node --test still/test/*.test.mjs   (his own dishes: Junyan 2026-10-21, d48)
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
const T0 = Date.parse("2026-10-21T16:00:00Z"), H = 3600000;
const at = (h) => new Date(T0 + h * H).toISOString();

// his example (d48): navy beans 300 g, mushrooms 60 g, pasta 30 g dry, broccoli 150 g
const FOODS = [["Navy beans", "300"], ["Shiitake", "60g"], ["Pasta", "30 g"], ["Broccoli", "150"]];
const make = (Kin = {}, h = 0) => K.saveDish(Kin, { name: "navy bean pasta", items: FOODS }, at(h));
// a kitchen with amounts for all four
function stocked() {
  let k = K.setAmount({}, "h:broccoli", "500 g", at(-2));
  k = K.setAmount(k, "h:shiitake", "200 g", at(-2));
  k = K.add(k, "home", "pantry", "Navy beans", at(-2), null, "1 kg").K;
  k = K.add(k, "home", "pantry", "Pasta", at(-2), null, "500 g").K;
  return k;
}
const left = (k, name) => K.match(k, "home", name).left;

test("d48: a new dish keeps its name, a guessed icon and the usual amounts, read like the kitchen reads them", () => {
  const r = make();
  assert.ok(r.id);
  const d = K.ownDishes(r.K);
  assert.equal(d.length, 1);
  assert.equal(d[0].name, "Navy bean pasta");
  assert.equal(d[0].icon, "🍝");
  assert.equal(d[0].own, true);
  assert.deepEqual(J(d[0].items), [["Navy beans", "300 g"], ["Shiitake", "60 g"], ["Pasta", "30 g"], ["Broccoli", "150 g"]]);
  // counts and ml, and words with no number kept as typed
  const r2 = K.saveDish({}, { name: "Smoothie", items: [["Bananas", "2"], ["Oat milk", "1/4 L"], ["Oat milk", "200"], ["Cinnamon", "a pinch"], ["", "5 g"]] }, at(0));
  assert.deepEqual(J(K.ownDish(r2.K, r2.id).items), [["Bananas", "2"], ["Oat milk", "1/4 L"], ["Cinnamon", "a pinch"]], "one row per food, empty rows dropped");
  // a name is needed
  assert.equal(K.saveDish({}, { name: "  ", items: FOODS }, at(0)).id, null);
  // his own icon stays
  const r3 = K.saveDish({}, { name: "Navy bean pasta", icon: "🥘", items: FOODS }, at(0));
  assert.equal(K.ownDish(r3.K, r3.id).icon, "🥘");
});

test("d48: a bare number takes the unit his kitchen item has", () => {
  let k = K.setAmount({}, "h:limes", "6", at(0));
  const r = K.saveDish(k, { name: "Lime water", items: [["Limes", "1"], ["Water", "500"]] }, at(1));
  assert.deepEqual(J(K.ownDish(r.K, r.id).items), [["Limes", "1"], ["Water", "500 ml"]]);
});

test("d48: his dish ticks take its usual amounts off the kitchen, an untick puts one back, and the dish pays no points", () => {
  let k = make(stocked(), 0);
  const d = K.ownDishes(k.K)[0]; k = k.K;
  let rec = null;
  for (const [n, amt] of d.items) {
    const r = QM.tick(rec, d, n, { mult: 1.5, dish: 6 });
    assert.deepEqual(J(r.ops), [], "no points from his own dish");
    assert.equal(r.done, 0, "never the Blueprint meal done");
    rec = r.rec;
    k = K.eat(k, "home", `2026-10-21|dinner|${d.id}|${n}`, { name: n }, true, at(1), amt).K;
  }
  assert.equal(rec.b, 0); assert.equal(rec.v[`dish:${d.id}`], undefined);
  assert.equal(QM.dishStatus(rec, d).all, true);
  assert.equal(QM.dishStatus(rec, d).text, "All in.");
  assert.equal(left(k, "Navy beans"), 700); assert.equal(left(k, "Shiitake"), 140); assert.equal(left(k, "Pasta"), 470); assert.equal(left(k, "Broccoli"), 350);
  // untick the pasta: it comes back
  k = K.eat(k, "home", `2026-10-21|dinner|${d.id}|Pasta`, { name: "Pasta" }, false, at(2)).K;
  assert.equal(left(k, "Pasta"), 500);
  assert.equal(left(k, "Broccoli"), 350);
  // his own dish never takes a Blueprint slot
  const mealq = { dinner: QM.tick(null, d, "all", {}).rec };
  assert.equal(QM.slotsUsed(mealq, "lunch", QM.DISHES[0]), 0);
});

test("d48: edit renames and changes foods; a food taken out keeps its tick on a meal logged before", () => {
  let r = make(); const id = r.id;
  const before = QM.tick(QM.tick(null, K.ownDish(r.K, id), "Pasta", {}).rec, K.ownDish(r.K, id), "Broccoli", {}).rec;
  const e = K.saveDish(r.K, { id, name: "Bean pasta", icon: "🍝", items: [["Navy beans", "250 g"], ["Broccoli", "150 g"], ["Spinach", "50"]] }, at(1));
  assert.equal(e.id, id);
  const d = K.ownDish(e.K, id);
  assert.equal(d.name, "Bean pasta");
  assert.deepEqual(J(d.items), [["Navy beans", "250 g"], ["Broccoli", "150 g"], ["Spinach", "50 g"]]);
  assert.equal(K.ownDishes(e.K).length, 1);
  // ticking on the old meal keeps Pasta on its record, so the page's before/after does not put the pasta back
  const r2 = QM.tick(before, d, "Navy beans", {});
  assert.deepEqual(J(r2.rec.dish[id]).sort(), ["Broccoli", "Navy beans", "Pasta"]);
  assert.equal(QM.dishStatus(r2.rec, d).n, 2);
  const r3 = QM.tick(r2.rec, d, "none", {});
  assert.deepEqual(J(r3.rec.dish[id]), ["Pasta"], "Clear clears what the dish lists now");
});

test("d48: delete hides the dish but leaves meals and the kitchen as they were", () => {
  let k = make(stocked(), 0); const id = k.id; k = k.K;
  k = K.eat(k, "home", `2026-10-21|dinner|${id}|Broccoli`, { name: "Broccoli" }, true, at(1), "150 g").K;
  const used = J(k.used);
  const k2 = K.delDish(k, id, at(2));
  assert.deepEqual(J(K.ownDishes(k2)), []);
  assert.deepEqual(J(k2.used), used, "kitchen take-offs untouched");
  assert.equal(left(k2, "Broccoli"), 350);
  const dead = K.ownDish(k2, id);
  assert.equal(dead.del, true); assert.equal(dead.name, "Navy bean pasta", "an old meal can still show it");
  assert.equal(K.delDish(k2, "nope", at(3)), k2);
});

test("d48: dishes merge per dish, the later change wins, and a delete is not brought back by an older copy", () => {
  const a = make({}, 0), id = a.id;
  const b = K.saveDish({}, { name: "Porridge", items: [["Oats", "60"]] }, at(1));
  let m = M.mergeKitchen(a.K, b.K);
  assert.deepEqual(J(K.ownDishes(m).map((x) => x.name).sort()), ["Navy bean pasta", "Porridge"]);
  // the phone deletes it later; the Mac's older copy still has it
  const del = K.delDish(m, id, at(3));
  const older = K.saveDish(m, { id, name: "Navy bean pasta", items: FOODS.slice(0, 2) }, at(2)).K;
  for (const x of [M.mergeKitchen(del, older), M.mergeKitchen(older, del)]) assert.deepEqual(J(K.ownDishes(x).map((d) => d.name)), ["Porridge"]);
  // and through the whole game merge
  const q = M.mergeQuest({ xp: 0, ts: 1, kitchen: older }, { xp: 0, ts: 2, kitchen: del });
  assert.deepEqual(J(K.ownDishes(q.kitchen).map((d) => d.name)), ["Porridge"]);
  const q2 = M.mergeQuest({ xp: 0, ts: 2, kitchen: del }, { xp: 0, ts: 1, kitchen: older });
  assert.deepEqual(J(K.ownDishes(q2.kitchen).map((d) => d.name)), ["Porridge"]);
});

test("d48: Save as a dish turns this meal's kitchen ticks and amounts into foods", () => {
  let k = stocked();
  const pre = "2026-10-21|lunch|kitchen|";
  k = K.eat(k, "home", pre + "h:broccoli", { id: "h:broccoli" }, true, at(1), 150).K;
  k = K.eat(k, "home", pre + "h:shiitake", { id: "h:shiitake" }, true, at(1), 60).K;
  k = K.setTake(k, pre + "h:shiitake", 70, at(1));
  k = K.eat(k, "home", pre + "h:shiitake", { id: "h:shiitake" }, false, at(1.5)).K;   // taken back: not in the dish
  k = K.eat(k, "home", "2026-10-21|dinner|kitchen|h:broccoli", { id: "h:broccoli" }, true, at(1), 99).K;   // another meal
  assert.deepEqual(J(K.kitchenFoods(k, pre)), [["Broccoli", "150 g"]]);
});

test("d48: his dishes are in the meal sheet with New dish, Edit and Save as a dish", () => {
  assert.match(html, /Your dishes/);
  assert.match(html, /New dish/);
  assert.match(html, /Save as a dish/);
  assert.match(html, /data-dedit=/);
  // the dish list the sheet looks in includes his own
  assert.match(html, /const allDishes = \(\) =>/);
});
