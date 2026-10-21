// node --test still/test/*.test.mjs   (half counts and container counts: Junyan 2026-10-21, lemons ".5" and "Mini Honey Jars 1 jar")
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
for (const f of ["../quest-meals.js", "../quest-kitchen.js", "../quest-merge.js"]) vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8"), ctx);
const K = ctx.QuestKitchen;
const html = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");
const J = (x) => JSON.parse(JSON.stringify(x));
const T0 = Date.parse("2026-10-21T16:00:00Z"), H = 3600000, D = 24 * H;
const at = (h) => new Date(T0 + h * H).toISOString();
const NOW = T0 + 5 * H;
const stored = (id, x) => ({ items: { [id]: { id, k: "travel", shelf: "cool", lv: 3, hist: [[at(0), 3, "add"]], added: at(0), at: at(0), ...x } } });
const tile = (it) => K.tileLine(it, NOW, NOW + 7 * D, "America/Toronto");

test("halves: '.5', '0.5', '1.5', '½', '1½' and '1/2' save as half counts of a piece food", () => {
  const L = stored("l", { name: "Lemons", amt: "" });
  for (const [typed, q, shown] of [[".5", 0.5, "0.5"], ["0.5", 0.5, "0.5"], ["1.5", 1.5, "1.5"], ["½", 0.5, "0.5"], ["1½", 1.5, "1.5"],
    ["1 ½", 1.5, "1.5"], ["1/2", 0.5, "0.5"], ["0,5", 0.5, "0.5"], [".5 lemon", 0.5, "0.5"], ["½ lemon", 0.5, "0.5"]]) {
    for (const S of [K.setAmount(L, "l", typed, at(1)), K.rename(L, "l", "Lemons", at(1), typed)]) {
      const it = K.item(S, "l");
      assert.deepEqual(J([it.q, it.u, it.amt, tile(it)]), [q, "", shown, shown], typed);
    }
  }
  // the fill-in (What did you buy / bring) and a restock read them the same way
  assert.equal(K.item(K.fill(L, "travel", [{ name: "Lemons", item: "l", amt: "½" }], at(1), "buy").K, "l").q, 0.5);
  assert.equal(K.item(K.restock(L, "l", ".5", at(1), "buy"), "l").q, 0.5);
});

test("halves: - and + step by one from a half, never below 0", () => {
  assert.equal(K.stepCount(".5", "Lemons", 1), "1.5");
  assert.equal(K.stepCount("0.5", "Lemons", 1), "1.5");
  assert.equal(K.stepCount("½", "Lemons", 1), "1.5");
  assert.equal(K.stepCount("1.5", "Lemons", -1), "0.5");
  assert.equal(K.stepCount(".5", "Lemons", -1), "0");
});

test("halves: a meal's took field and an extra's amount read '.5' and '½' (numOf)", () => {
  for (const [t, v] of [[".5", 0.5], ["0.5", 0.5], ["½", 0.5], ["1½", 1.5], ["1/2", 0.5], ["2", 2], ["0,5", 0.5], ["30 g", 30]]) assert.equal(K.numOf(t), v, t);
  for (const t of ["", "a bit"]) assert.ok(Number.isNaN(K.numOf(t)), t);
  // the page's took handlers use it, not parseFloat (parseFloat("½") is NaN, which became 0)
  const kit = html.slice(html.indexOf("function kitMealBind"), html.indexOf("function kitMealBind") + 600);
  assert.ok(kit.length > 100 && kit.includes("QK().numOf(inp.value)"), "data-take");
  const xq = html.slice(html.indexOf('querySelectorAll("[data-xq]")'), html.indexOf('querySelectorAll("[data-xq]")') + 400);
  assert.ok(xq.length > 100 && xq.includes("QK().numOf(raw)"), "data-xq");
  // a meal's take-off of half a lemon comes off as 0.5
  let S = K.setAmount(stored("l", { name: "Lemons", amt: "" }), "l", "2", at(1));
  S = K.eat(S, "travel", "2026-10-21|dinner|x|Lemons", { name: "Lemons" }, true, at(2), 0.5).K;
  assert.equal(K.item(S, "l").left, 1.5);
});

test("containers: '1 jar' in the amount field is a count of jars, tracked like a piece food", () => {
  const S0 = stored("h", { name: "Mini Honey Jars", amt: "", group: "Oils, vinegars and sweet", shelf: "dry" });
  let S = K.rename(S0, "h", "Mini Honey Jars", at(1), "1 jar");
  let it = K.item(S, "h");
  assert.deepEqual(J([it.q, it.u, it.amt, tile(it)]), [1, "", "1 jar", "1 jar"]);
  assert.equal(K.isPiece(it), true, "it gets - and +");
  S = K.setAmount(S, "h", "2 jars", at(2));
  it = K.item(S, "h");
  assert.deepEqual(J([it.q, it.amt, tile(it)]), [2, "2 jars", "2 jars"]);
  // - and + keep the container word
  assert.equal(K.stepCount("1 jar", "Mini Honey Jars", 1), "2 jars");
  assert.equal(K.stepCount("2 jars", "Mini Honey Jars", -1), "1 jar");
  // a meal that logs it takes off 1 by default (a recipe's "1 tbsp" honey cannot be a jar count), and he can change it
  const key = "2026-10-21|breakfast|meal+|Honey";
  S = K.eat(S, "travel", key, { name: "Mini Honey Jars" }, true, at(3), "1 tbsp").K;
  assert.equal(K.item(S, "h").left, 1); assert.equal(K.item(S, "h").amt, "1 jar");
  S = K.setTake(S, key, 0.5, at(4));
  assert.equal(K.item(S, "h").left, 1.5);
  assert.equal(K.firstTake(K.item(S, "h")), 1);
  // grams still work
  it = K.item(K.setAmount(S0, "h", "30 g", at(1)), "h");
  assert.deepEqual(J([it.q, it.u, it.amt]), [30, "g", "30 g"]);
});

test("containers: every container word, singular and plural; other words stay words", () => {
  const N = stored("n", { name: "Chickpeas", amt: "" });
  for (const [typed, q, shown] of [["1 can", 1, "1 can"], ["2 cans", 2, "2 cans"], ["3 tins", 3, "3 tins"], ["1 pack", 1, "1 pack"],
    ["2 packets", 2, "2 packets"], ["1 bottle", 1, "1 bottle"], ["2 pots", 2, "2 pots"], ["1 box", 1, "1 box"], ["2 boxes", 2, "2 boxes"],
    ["1 bag", 1, "1 bag"], ["3 bags", 3, "3 bags"], ["4 slices", 4, "4 slices"], ["2 pieces", 2, "2"], ["2 Jars", 2, "2 jars"], ["½ jar", 0.5, "0.5 jar"]]) {
    const it = K.item(K.setAmount(N, "n", typed, at(1)), "n");
    assert.deepEqual(J([it.q, it.u, it.amt]), [q, "", shown], typed);
  }
  for (const typed of ["a jar", "2 bunches", "1 carton", "jar"]) {
    const it = K.item(K.setAmount(N, "n", typed, at(1)), "n");
    assert.equal(K.hasQ(it), false, typed);
  }
});

test("containers: the item's name gives the container, so a bare '2' on Mini Honey Jars is 2 jars", () => {
  const S0 = stored("h", { name: "Mini Honey Jars", amt: "", group: "Oils, vinegars and sweet" });
  assert.equal(K.isPiece(K.item(S0, "h")), true, "a container name gets - and + before it has a number");
  const it = K.item(K.setAmount(S0, "h", "2", at(1)), "h");
  assert.deepEqual(J([it.q, it.u, it.amt, tile(it)]), [2, "", "2 jars", "2 jars"]);
  assert.equal(K.stepCount("2", "Mini Honey Jars", 1), "3 jars");
  for (const n of ["Tea bags", "Coconut milk cans", "Yogurt pots"]) assert.equal(K.unitFor(n), "", n);
  // names that do not end in a container stay as they were
  for (const [n, u] of [["Honey", "g"], ["Olive oil", "ml"], ["Lemons", ""], ["Brown rice", "g"]]) assert.equal(K.unitFor(n), u, n);
  // a bare number for a container typed on a plain-named item keeps its container
  let S = K.setAmount(stored("x", { name: "Honey", amt: "" }), "x", "1 jar", at(1));
  S = K.setAmount(S, "x", "3", at(2));
  assert.equal(K.item(S, "x").amt, "3 jars");
});

test("containers: his saved '1 jar' text reads as the count 1 jar, with no write", () => {
  const S = stored("h", { name: "Mini Honey Jars", amt: "1 jar", group: "Oils, vinegars and sweet", shelf: "dry" });
  const it = K.item(S, "h");
  assert.deepEqual(J([it.q, it.u, it.amt, tile(it), K.isPiece(it)]), [1, "", "1 jar", "1 jar", true]);
  assert.equal(S.items.h.amt, "1 jar"); assert.equal(S.items.h.q, undefined, "nothing rewritten");
  // a later change stores the count (and the container) with it, and a page from before still reads "1 jar"
  const S2 = K.place(S, "h", "cool", null, at(1));
  assert.deepEqual(J([S2.items.h.q, S2.items.h.u, S2.items.h.cw, S2.items.h.amt]), [1, "", "jar", "1 jar"]);
  // a grams item never carries a container
  const g = K.setAmount(S2, "h", "30 g", at(2));
  assert.equal(g.items.h.cw, undefined);
});

test("page: the item page's - and + show once the field is a count, and halves are explained", () => {
  const f = html.slice(html.indexOf("function openKitchenItem"), html.indexOf("function openKitchenItem") + 5000);
  assert.ok(f.length > 1000);
  assert.ok(f.includes("QK().isCountText("), "the field's input toggles the buttons");
  assert.ok(f.includes('id="kiMinus"') && f.includes('id="kiPlus"'));
});
