// node --test still/test/*.test.mjs   (Junyan, 2026-10-21, logging a travel Nutty Pudding: "There's no option to add
// bananas. I used collagen so I want to put that there and creatine as well. How do I do it.. there's only 4 options")
// d69: a part's auto-swap is only a real stand-in. d70: "+ Add something you put in" on every dish card.
// Also: "From your kitchen" lists items with no amount (a banana on Plenty), and ticking one takes nothing off.
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
const T0 = Date.parse("2026-10-21T16:00:00Z"), H = 3600000;
const at = (h) => new Date(T0 + h * H).toISOString();
const tnp = QM.dishOf("tnp"), np = QM.dishOf("np"), sv = QM.dishOf("sv");
const part = (rows, id) => rows.find((p) => p.id === id);
const names = (p) => p.rows.map((r) => [r.name, r.st]);
// a travel fridge from names: [name, amount text or level]
function travel(list, h = -30) {
  let k = {};
  for (const [name, v] of list) {
    const shelf = /milk|yog|berr|banana/i.test(name) ? "cool" : "dry";
    const r = K.add(k, "travel", shelf, name, at(h), null, typeof v === "string" ? v : "");
    k = r.K;
    if (typeof v === "number") k = K.setLevel(k, r.id, v, at(h), "tap");
  }
  return k;
}
const idOf = (k, name) => K.items(k, "travel").find((x) => x.name === name).id;
// today's travel fridge, the way he had it
const TODAY = [["Blueberry nut mix", 3], ["Collagen", 3], ["Creatine", 3], ["Coconut yogurt", 3], ["Bananas", 3], ["Blueberries", "300 g"]];

test("d69: what kind of food a name is: nuts, seeds, plant milk or yogurt, fruit, a supplement, or none of those", () => {
  const cases = { "Collagen": "supp", "Creatine": "supp", "Protein powder": "supp", "Whey isolate": "supp", "Magnesium": "supp",
    "Blueberry nut mix": "nut", "Mixed nuts": "nut", "Almonds": "nut", "Macadamias": "nut", "Brazil nuts": "nut", "Peanut butter": "nut", "Trail mix": "nut",
    "Chia seeds": "seed", "Ground flax": "seed", "Hemp seeds": "seed", "Pumpkin seeds": "seed", "Seed mix": "seed",
    "Oat milk": "milk", "Macadamia milk": "milk", "Coconut yogurt": "milk", "Soy yoghurt": "milk",
    "Bananas": "fruit", "Blueberries": "fruit", "Frozen berries": "fruit", "Cherries": "fruit", "Apples": "fruit",
    "Nutmeg": null, "Butternut squash": null, "Cocoa powder": null, "Curry powder": null, "Lemons": null, "Milk": null, "Kale": null };
  for (const [n, want] of Object.entries(cases)) assert.equal(QI.kindOf(n), want, n);
});

test("d69: every listed swap of a nut, seed, milk or berry part is that kind of food", () => {
  for (const d of QM.BLUEPRINT) for (const s of d.slots) {
    if (!s.kind) continue;
    for (const w of s.want) for (const n of [w[0]].concat(w[2] || [])) assert.equal(QI.kindOf(n), s.kind, `${d.id}.${s.id}: ${n}`);
  }
  // the parts named in d69 carry their kind
  const kinds = (d) => Object.fromEntries(d.slots.filter((s) => s.kind).map((s) => [s.id, s.kind]));
  assert.deepEqual(J(kinds(tnp)), { chia: "seed", milk: "milk", berries: "fruit", nut: "nut" });
  assert.deepEqual(J(kinds(np)), { milk: "milk", nuts: "nut", walnuts: "nut", brazil: "nut", chia: "seed", flax: "seed", berries: "fruit" });
  assert.equal(sv.slots.find((s) => s.id === "seeds").kind, "seed");
});

test("d69: today's travel pudding: no nut mix in Chia, no collagen in A nut; the nut mix fills the nut, the yogurt the milk", () => {
  const k = travel(TODAY);
  const rows = QI.slotRows(k, "travel", tnp, []);
  assert.deepEqual(J(names(part(rows, "chia"))), [["Chia seeds", "none"]]);
  assert.deepEqual(J(names(part(rows, "nut"))), [["Blueberry nut mix", "have"]]);
  assert.deepEqual(J(names(part(rows, "milk"))), [["Coconut yogurt", "have"]]);
  assert.deepEqual(J(names(part(rows, "berries"))), [["Blueberries", "have"]]);
  // supplements are never auto-picked, for any part
  for (const p of rows) for (const r of p.rows) assert.ok(!/collagen|creatine/i.test(r.name), `${p.id}: ${r.name}`);
});

test("d69: a seeds part takes any seed or seed mix, berries take other fruit, and nothing unrelated stands in", () => {
  const k = travel([["Seed mix", 3], ["Bananas", 3], ["Collagen", 3], ["Protein powder", 3], ["Kale", 3]]);
  const rows = QI.slotRows(k, "travel", tnp, []);
  assert.deepEqual(J(names(part(rows, "chia"))), [["Seed mix", "have"]]);
  assert.deepEqual(J(names(part(rows, "berries"))), [["Bananas", "have"]]);
  assert.deepEqual(J(names(part(rows, "nut"))), [["Walnuts", "none"]]);
  assert.deepEqual(J(names(part(rows, "milk"))), [["Almond milk", "none"]]);
  // a pattern part (juice) never takes a supplement either
  let h = {};
  for (const n of ["Protein juice shot"]) { const r = K.add(h, "home", "fridge", n, at(-30)); h = r.K; }
  const juice = part(QI.slotRows(h, "home", np, []), "juice");
  assert.deepEqual(J(juice.rows.map((r) => r.name)), ["Pomegranate juice"]);
});

test("d69: Use something else still offers a supplement, and a pick of one fills the part", () => {
  const k = travel(TODAY);
  const rec = QM.tick(null, tnp, "nut:Collagen", {}).rec;
  const rows = QI.slotRows(k, "travel", tnp, rec.dish.tnp);
  assert.deepEqual(J(part(rows, "nut").rows.map((r) => [r.name, r.on])), [["Collagen", true]]);
  assert.ok(/data-dpk=/.test(html) && /const slotOthers = d =>/.test(html), "the Use something else list is still the whole kitchen");
});

test("d70: what he types for an extra: a kitchen item or free text, with an amount read like the kitchen reads one", () => {
  const k = travel([["Almonds", 3], ["Bananas", 3], ["Blueberries", "300 g"], ["Coconut yogurt", 3]]);
  const p = (s) => { const x = K.extraParse(k, "travel", s); return [x.name, x.q, x.u, x.it ? x.it.name : null]; };
  assert.deepEqual(J(p("Creatine 5 g")), ["Creatine", 5, "g", null]);
  assert.deepEqual(J(p("6 almonds")), ["Almonds", 6, "", "Almonds"]);
  assert.deepEqual(J(p("1 banana")), ["Bananas", 1, "", "Bananas"]);
  assert.deepEqual(J(p("200 ml coconut yogurt")), ["Coconut yogurt", 200, "ml", "Coconut yogurt"]);
  assert.deepEqual(J(p("blueberries 150g")), ["Blueberries", 150, "g", "Blueberries"]);
  assert.deepEqual(J(p("Collagen")), ["Collagen", null, "", null]);
  assert.deepEqual(J(p("  ")), [null, null, "", null]);
});

test("d70: the search lists everything in the kitchen in use, with or without an amount, best match first", () => {
  const k = travel([["Almonds", 3], ["Almond milk", "1 L"], ["Bananas", 1], ["Blueberries", "300 g"], ["Collagen", null]]);
  assert.deepEqual(J(K.search(k, "travel", "alm").map((x) => x.name)), ["Almonds", "Almond milk"]);
  assert.deepEqual(J(K.search(k, "travel", "6 almonds").map((x) => x.name)), ["Almonds"]);
  assert.deepEqual(J(K.search(k, "travel", "coll").map((x) => x.name)), ["Collagen"]);
  assert.equal(K.search(k, "travel", "").length, 5);
  assert.equal(K.search(k, "home", "collagen").length, 0, "only the kitchen in use");
});

test("d70: an extra rides on the meal record: no points, the dish's own ticks untouched, one row per food, untick removes it", () => {
  const opt = { dish: 6, mult: 1.5 };
  let rec = QM.tick(null, tnp, "berries:Blueberries", opt).rec;
  const before = J(rec);
  rec = QM.addExtra(rec, "tnp", { n: "Collagen", q: null, u: "" }, at(0));
  rec = QM.addExtra(rec, "tnp", { n: "Creatine", q: 5, u: "g" }, at(0));
  rec = QM.addExtra(rec, "tnp", { n: "collagen", q: 10, u: "g" }, at(0));   // already there: unchanged
  assert.deepEqual(J(QM.extrasOf(rec, "tnp").map((x) => [x.n, x.q, x.u])), [["Collagen", null, ""], ["Creatine", 5, "g"]]);
  assert.deepEqual([rec.p, rec.b, J(rec.v), J(rec.dish)], [before.p, before.b, before.v, before.dish]);
  assert.deepEqual(J(QM.dishStatus(rec, tnp)), J(QM.dishStatus(before, tnp)), "extras do not fill parts");
  rec = QM.setExtraQ(rec, "tnp", "Creatine", 7);
  assert.equal(QM.extrasOf(rec, "tnp")[1].q, 7);
  rec = QM.dropExtra(rec, "tnp", "Collagen");
  assert.deepEqual(J(QM.extrasOf(rec, "tnp").map((x) => x.n)), ["Creatine"]);
  rec = QM.dropExtra(rec, "tnp", "Creatine");
  assert.equal(rec.xtra, undefined, "the last one leaves no empty map behind");
  // a name cannot carry the key separator, and junk on a synced record is ignored
  assert.equal(QM.addExtra(null, "tnp", { n: "a|b", q: 1, u: "" }, at(0)).xtra.tnp[0].n, "a b");
  assert.deepEqual(J(QM.extrasOf({ xtra: { tnp: [null, { n: "" }, { n: "Ok", q: "x" }, 5] } }, "tnp")), [{ n: "Ok", q: null, u: "" }]);
  // Clear and Got everything leave extras alone in the pure tick (the page clears them on Clear)
  const r2 = QM.tick(QM.addExtra(null, "np", { n: "Collagen" }, at(0)), np, "all", opt).rec;
  assert.equal(QM.extrasOf(r2, "np").length, 1);
});

test("d70: an extra of a kitchen item with an amount takes off through a tick record; a level item records but takes nothing", () => {
  let k = travel([["Blueberries", "300 g"], ["Bananas", 3]]);
  const blue = idOf(k, "Blueberries"), ban = idOf(k, "Bananas");
  let r = K.eat(k, "travel", "x1", { id: blue }, true, at(0), 150);
  k = r.K;
  assert.equal(K.item(k, blue).left, 150);
  r = K.eat(k, "travel", "x2", { id: ban, note: true }, true, at(0), 1);
  assert.equal(r.id, ban);
  k = r.K;
  assert.equal(K.item(k, ban).lv, 3, "a level item keeps its level");
  assert.deepEqual(J([K.taken(k, "x2").q, K.taken(k, "x2").u, K.taken(k, "x2").nq]), [1, "", true]);
  // a level record never counts against an amount given later
  k = K.setAmount(k, ban, "4", at(1));
  k = K.eat(k, "travel", "x3", { id: ban, note: true }, true, at(0.5), 1).K;   // ticked before the amount (an older copy)
  assert.equal(K.item(k, ban).left, 4);
  // untick puts back and closes the record
  k = K.eat(k, "travel", "x1", { id: blue }, false, at(2)).K;
  assert.equal(K.item(k, blue).left, 300);
  k = K.eat(k, "travel", "x2", { id: ban }, false, at(2)).K;
  assert.equal(K.taken(k, "x2"), null);
  // without note a level item is left alone, as before
  assert.equal(K.eat(travel([["Kale", 3]]), "travel", "x9", { name: "Kale" }, true, at(0), "100 g").id, null);
});

test("d70: the first amount an extra takes: one of a piece food, else the kitchen's portion, else what he typed", () => {
  const k = travel([["Bananas", 3], ["Blueberries", "300 g"], ["Coconut yogurt", 3]]);
  assert.equal(K.firstTake(K.item(k, idOf(k, "Bananas"))), 1);
  assert.equal(K.firstTake(K.item(k, idOf(k, "Blueberries"))), 100);
  assert.equal(K.firstTake(K.item(k, idOf(k, "Coconut yogurt"))), 250);
  assert.equal(K.firstTake(null), null);
});

test("From your kitchen lists items with no amount too (a banana on Plenty), not Out ones unless ticked", () => {
  const k = travel([["Bananas", 3], ["Dates", null], ["Kale", 0], ["Blueberries", "300 g"], ["Oat milk", "0 ml"]]);
  const list = (mine) => K.mealList(k, "travel", new Set(mine)).map((x) => x.name).sort();
  assert.deepEqual(J(list([])), ["Bananas", "Blueberries", "Dates"]);
  assert.deepEqual(J(list([idOf(k, "Kale"), idOf(k, "Oat milk")])), ["Bananas", "Blueberries", "Dates", "Kale", "Oat milk"]);
  assert.ok(/QK\(\)\.mealList\(G\.kitchen, kk, mine\)/.test(html), "the card uses it");
  assert.ok(/note:\s*true/.test(html.slice(html.indexOf("function kitMealBind"))), "a level item tick is recorded, nothing taken off");
});

test("d70 on the page: every dish card has + Add something you put in, a search with free text, ticked extras with took, and Clear drops them", () => {
  const body = html.slice(html.indexOf("const slotCard = d =>"), html.indexOf("function kitMealBind"));
  assert.equal((body.match(/\$\{extrasBlock\(d\)\}/g) || []).length, 2, "the part dishes and the plain dishes (ideas, his own)");
  assert.ok(/\+ Add something you put in/.test(html));
  assert.ok(/data-xq=/.test(html) && /data-xoff=/.test(html) && /data-xfree/.test(html) && /data-xit=/.test(html));
  assert.ok(/Extras earn no points/.test(html), "says that extras pay nothing");
  const clr = html.slice(html.indexOf('sh.querySelectorAll("[data-dnone]")'), html.indexOf('sh.querySelectorAll("[data-dnone]")') + 400);
  assert.ok(/dropAllExtras/.test(clr), "Clear drops the extras and puts them back");
  assert.ok(!/[—–]/.test(body), "no dashes in the new words");
});
