// node --test still/test/*.test.mjs   (Junyan, 2026-10-21, d83 to d85, "yes")
// The Prana foods and Body foods tiles are worked out from what the meal logged (QuestFoodScore.earn), paid through the
// same tap records (QuestMeals.autoSync), and a tile he tapped by hand on an old meal keeps exactly what it paid.
// Onion or garlic is ticked when an onion or garlic family food is logged, and can still be tapped (handTap).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const ctx = {}; ctx.globalThis = ctx;
for (const f of ["../quest-meals.js", "../quest-food-score.js"]) vm.runInNewContext(fs.readFileSync(here(f), "utf8"), ctx);
const QM = ctx.QuestMeals, FS = ctx.QuestFoodScore;
const J = (x) => JSON.parse(JSON.stringify(x));
const ids = (foods, o) => J(FS.earn(foods, o).ids);
const opt = { mult: 1.5, bodyGain: () => 3 };

test("kinds by name: fresh foods, and the made-from ones (juice, oil, milk, powder) are not the fresh food", () => {
  const k = (n) => Object.entries(FS.kindsOf(n)).filter(([, v]) => v).map(([x]) => x).sort().join(",");
  assert.equal(k("Broccoli"), "veg");
  assert.equal(k("Baby spinach"), "greens,veg");
  assert.equal(k("Blueberries"), "berry,fruit");
  assert.equal(k("Cherry tomatoes"), "veg", "a cherry tomato is not a berry");
  assert.equal(k("Pomegranate juice"), "");
  assert.equal(k("Macadamia milk"), "");
  assert.equal(k("Walnuts"), "nut");
  assert.equal(k("Almond butter"), "nut");
  assert.equal(k("Ground flaxseed"), "flaxchia");
  assert.equal(k("Flax oil"), "");
  assert.equal(k("Extra virgin olive oil"), "oliveoil");
  assert.equal(k("Black lentils, dry"), "legume");
  assert.equal(k("Green beans"), "veg", "green beans are a vegetable, not a legume");
  assert.equal(k("Brussels sprouts"), "veg");
  assert.equal(k("Alfalfa sprouts"), "sprouts");
  assert.equal(k("Black pepper"), "", "a spice, not a pepper");
  assert.equal(k("Honey"), "honey");
  assert.equal(k("Garlic"), "allium");
  assert.equal(k("Leeks"), "allium");
  assert.equal(k("Potato chips"), "junk");
  assert.equal(k("Lemons"), "", "a squeeze of lemon is not fresh fruit eaten");
});

test("amounts: logged grams and ml, recipe spoons, counts of a food with a usual weight; nothing typed is unknown", () => {
  assert.equal(FS.gramsOf({ n: "Broccoli", q: 175, u: "g" }), 175);
  assert.equal(FS.gramsOf({ n: "Broccoli", amt: "175 g" }), 175);
  assert.equal(FS.gramsOf({ n: "Extra virgin olive oil", amt: "1 tbsp" }), 15);
  assert.equal(FS.gramsOf({ n: "Chia seeds", amt: "2 tbsp" }), 20);
  assert.equal(FS.gramsOf({ n: "Cinnamon", amt: "½ tsp" }), 1.5);
  assert.equal(FS.gramsOf({ n: "Brazil nuts", amt: "2" }), 10);
  assert.equal(FS.gramsOf({ n: "Red peppers", q: 2, u: "" }), 300);
  assert.equal(FS.gramsOf({ n: "Collagen", q: null, u: "" }), null);
  assert.equal(FS.gramsOf({ n: "Mystery", q: 2, u: "" }), null);
});

test("a full Super Veggie earns fresh veg, lentils (dry counts cooked), 250 g veg and olive oil", () => {
  const sv = QM.dishOf("sv").items.map(([n, amt]) => ({ n, amt }));
  const r = FS.earn(sv);
  assert.deepEqual(J(r.ids), ["fveg", "legumes", "veg", "evoo"]);
  assert.equal(r.got.legumes, 225, "90 g dry is about 225 g cooked");
  assert.equal(r.got.veg, 450, "broccoli, cauliflower, shiitake");
});

test("a full Nutty Pudding earns fresh fruit, nuts, berries, 30 g nuts and flax or chia", () => {
  const np = QM.dishOf("np").items.map(([n, amt]) => ({ n, amt }));
  assert.deepEqual(ids(np), ["fruit", "pnuts", "nuts", "berries", "seeds"]);
});

test("gram tiles need their amount: 40 g spinach is fresh veg but not leafy greens, 60 g is both; no amount counts toward none", () => {
  assert.deepEqual(ids([{ n: "Baby spinach", q: 40, u: "g" }]), ["fveg"]);
  assert.deepEqual(ids([{ n: "Baby spinach", q: 60, u: "g" }]), ["fveg", "greens"]);
  assert.deepEqual(ids([{ n: "Blueberries", q: null, u: "" }]), ["fruit"]);
  assert.deepEqual(ids([{ n: "Blueberries", q: 0, u: "g" }]), [], "took 0: not eaten");
  assert.deepEqual(ids([{ n: "Blueberries", q: 60, u: "g" }, { n: "Cherries", q: 50, u: "g" }]), ["fruit", "berries"], "added up across the meal");
});

test("30 g protein only in a morning meal", () => {
  const f = [{ n: "Pea protein powder", q: 40, u: "g" }];
  assert.deepEqual(ids(f), []);
  assert.deepEqual(ids(f, { morning: true }), ["protein"]);
});

test("processed and onion or garlic only when such a food is logged", () => {
  assert.deepEqual(ids([{ n: "Broccoli", q: 100, u: "g" }]), ["fveg"]);
  assert.deepEqual(ids([{ n: "Garlic", q: 1, u: "" }, { n: "Potato chips", q: 30, u: "g" }]), ["junk", "neg"]);
});

test("autoSync pays what the foods earn, takes back what they no longer earn, and leaves hand taps alone", () => {
  // an old meal: Fresh fruit tapped by hand (paid +3)
  let rec = QM.tap(null, "fruit", opt).rec;
  let r = QM.autoSync(rec, ["fruit", "fveg", "veg"], opt);
  assert.deepEqual(J(r.ops.map((o) => [o.id, o.d])), [["fveg", 3], ["veg", 3]], "fruit was already paid by hand");
  assert.deepEqual(J(r.rec.auto), ["fveg", "veg"]);
  assert.equal(r.rec.p, 6); assert.equal(r.rec.b, 3);
  // the veg is unticked: veg and fresh veg come back off, the hand-tapped fruit stays
  const r2 = QM.autoSync(r.rec, [], opt);
  assert.deepEqual(J(r2.ops.map((o) => [o.id, o.d])), [["fveg", -3], ["veg", -3]]);
  assert.deepEqual(J(r2.rec.sel), ["fruit"]);
  assert.equal(r2.rec.p, 3); assert.equal(r2.rec.b, 0);
  assert.equal(r2.rec.auto, undefined);
  // again with nothing changed: no ops
  assert.equal(QM.autoSync(r.rec, ["fruit", "fveg", "veg"], opt).ops.length, 0);
});

test("autoSync keeps the daily limit: a tile that cannot pay now is not added", () => {
  const r = QM.autoSync(null, ["veg", "nuts"], opt, (id) => id !== "nuts");
  assert.deepEqual(J(r.rec.sel), ["veg"]);
});

test("d84: onion or garlic ticks itself; taken back by hand it stays off; tapped again it is his", () => {
  let r = QM.autoSync(null, ["neg"], opt);
  assert.deepEqual(J(r.ops.map((o) => [o.id, o.d])), [["neg", -3]]);
  const off = QM.handTap(r.rec, "neg", opt);
  assert.deepEqual(J(off.ops.map((o) => [o.id, o.d])), [["neg", 3]]);
  assert.deepEqual(J(off.rec.noauto), ["neg"]);
  assert.equal(QM.autoSync(off.rec, ["neg"], opt).ops.length, 0, "not paid again");
  const on = QM.handTap(off.rec, "neg", opt);
  assert.equal(on.rec.noauto, undefined);
  assert.equal(on.rec.auto, undefined, "a hand tap is not the foods'");
  assert.equal(QM.autoSync(on.rec, [], opt).ops.length, 0, "the foods never take back a hand tap");
});

test("one dish per meal: the pick is stored, and an old record reads by what it holds", () => {
  assert.deepEqual(J(QM.onMeal(null)), []);
  assert.deepEqual(J(QM.onMeal(QM.setPick({}, "sv"))), ["sv"]);
  assert.deepEqual(J(QM.onMeal(QM.setPick({}, "meal"))), ["meal"]);
  const old = { sel: ["fruit"], dish: { np: ["Walnuts"], r1: ["Lemon"] }, xtra: { meal: [{ n: "Banana", q: 1, u: "" }] }, v: { "dish:np": ["b", 2, 9, 0] } };
  assert.deepEqual(J(QM.onMeal(old)), ["np", "r1", "meal"]);
  assert.deepEqual(J(QM.onMeal({ ...old, m: "r1" })), ["r1", "np", "meal"]);
  assert.equal(QM.setPick({ m: "sv" }, null).m, undefined);
  assert.equal(QM.setPick({}, "bad id!").m, undefined, "ids are checked");
});
