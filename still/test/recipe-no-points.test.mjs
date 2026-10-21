// node --test still/test/*.test.mjs   (Junyan, 2026-10-21, d81 NO: "they are just recommendations for me to make meals")
// Recipe cards (the recipe book), tonight's old ideas (r1 to r3, the IDEAS fallback when the book fails to load) and the
// kitchen-ideas pool earn no points of their own. Ticks still take amounts off the kitchen; the food tiles still score.
// A meal that already paid on a recipe or an idea keeps what it paid: no new tick, untick or Clear moves it.
// The Blueprint dishes (Super Veggie, Nutty Pudding, the travel versions) keep paying by parts.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const ctx = {}; ctx.globalThis = ctx;
for (const f of ["../quest-meals.js", "../quest-kitchen.js", "../quest-merge.js", "../quest-ideas.js", "../quest-recipe-data.js", "../quest-recipes.js"])
  vm.runInNewContext(fs.readFileSync(here(f), "utf8"), ctx);
const QM = ctx.QuestMeals, QR = ctx.QuestRecipes;
const html = fs.readFileSync(here("../quest.html"), "utf8");
const J = (x) => JSON.parse(JSON.stringify(x));
const sheet = html.slice(html.indexOf("function openMeal(b)"), html.indexOf("The meal sheet's kitchen parts"));
const opt = { mult: 1, dish: 9, dim: [1, 0.7], dishLimit: 2 };

test("d81: only the Blueprint dishes pay; recipes, old ideas, pool ideas and his own dishes do not", () => {
  for (const id of ["sv", "np"]) assert.equal(QM.pays(QM.dishOf(id)), true, id);
  for (const d of QM.TRAVEL) assert.equal(QM.pays(d), true, d.id);
  for (const id of ["r1", "r2", "r3", "r7", QR.list()[0].id]) assert.equal(QM.pays(QM.dishOf(id)), false, id);
  assert.equal(QM.pays({ id: "d-x", own: true, items: [["Rice", "1"]] }), false);
});

test("d81: Cook this on a recipe ticks everything and pays nothing", () => {
  const d = QM.dishOf(QR.list()[0].id), ticks = QR.cookTicks(d);
  const r = QM.tick(null, d, ticks, opt);
  assert.deepEqual(J(r.rec.dish[d.id]), J(ticks), "the ticks are kept, so the kitchen amounts come off");
  assert.equal(r.rec.b, 0); assert.deepEqual(J(r.ops), []); assert.equal(r.done, 0);
  assert.equal(r.rec.v["dish:" + d.id], undefined, "no paid record, no slot");
  assert.equal(QM.dishPaid(r.rec, d), 0);
  const u = QM.tick(r.rec, d, ticks[0], opt);
  assert.ok(!u.rec.dish[d.id].includes(ticks[0])); assert.equal(u.rec.b, 0); assert.deepEqual(J(u.ops), []);
  assert.equal(QM.dishStatus(QM.tick(null, d, "all", opt).rec, d).text, "All in.", "no 'Full points' on a recipe");
});

test("d81: tonight's old ideas and a pool idea pay nothing on a new tick", () => {
  for (const id of ["r1", "r7"]) {
    const d = QM.dishOf(id), r = QM.tick(null, d, "all", opt);
    assert.equal(r.rec.dish[id].length, d.items.length);
    assert.equal(r.rec.b, 0, id); assert.deepEqual(J(r.ops), [], id); assert.equal(r.rec.v["dish:" + id], undefined, id);
  }
});

test("d81: a meal that already paid on a recipe or an idea keeps exactly what it paid", () => {
  const d = QM.dishOf("r1"), names = d.items.map((x) => x[0]);
  const old = { sel: [], v: { "dish:r1": ["b", 9, 9, 0] }, p: 0, b: 9, dish: { r1: names } };
  let r = QM.tick(old, d, names[0], opt);   // an untick does not take back
  assert.equal(r.rec.b, 9); assert.deepEqual(J(r.ops), []); assert.deepEqual(J(r.rec.v["dish:r1"]), ["b", 9, 9, 0]);
  assert.ok(!r.rec.dish.r1.includes(names[0]), "the untick itself still happens (the kitchen gets it back)");
  r = QM.tick(r.rec, d, names[0], opt);     // a re-tick pays nothing more
  assert.equal(r.rec.b, 9); assert.deepEqual(J(r.ops), []);
  r = QM.tick(r.rec, d, "none", opt);       // Clear empties the ticks, the points stay
  assert.equal(r.rec.b, 9); assert.deepEqual(J(r.ops), []); assert.equal(r.rec.dish.r1, undefined);
  assert.equal(QM.dishPaid(r.rec, d), 9, "the card still shows what it paid");
  const rc = QM.dishOf(QR.list()[0].id), part = { v: { ["dish:" + rc.id]: ["b", 4, 9, 0] }, b: 4, dish: { [rc.id]: [rc.items[0][0]] } };
  const t = QM.tick(part, rc, QR.cookTicks(rc), opt);
  assert.equal(t.rec.b, 4); assert.deepEqual(J(t.ops), []);
});

test("d81: the Blueprint dishes still pay by parts", () => {
  const r = QM.tick(null, QM.dishOf("sv"), "all", opt);
  assert.equal(r.rec.b, 9); assert.equal(r.done, 1);
  const t = QM.TRAVEL[0];
  assert.ok(QM.tick(null, t, "all", opt).rec.b > 0, t.id);
});

test("d81: the page shows no 'up to +N' on a recipe or idea card and no points line for them", () => {
  const card = sheet.slice(sheet.indexOf("const dishCard ="), sheet.indexOf("const plainRows ="));
  assert.match(card, /QM\.pays\(d\)/, "the dish card asks whether the dish pays before showing up to +N");
  assert.ok(!/It pays like tonight's ideas did/.test(sheet), "the recipe card comment no longer says it pays");
});
