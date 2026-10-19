// node --test still/test/*.test.mjs   (Junyan, 2026-10-19, d3 and d4: "Everything needs to be directly connected to
// what I'm doing right now"). Pranic foods and drains live only inside a calendar meal block's quiz.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url));
const html = fs.readFileSync(here + "quest.html", "utf8");
const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(here + "quest-meals.js", "utf8"), ctx);
const M = ctx.QuestMeals;
const J = x => JSON.parse(JSON.stringify(x));   // objects from the vm realm
const opt = { mult: 1.5, heavy: -5, bodyGain: id => ({ veg: 4, nuts: 3 })[id] || 0 };

test("the quiz has Sadhguru's pranic foods, all gold and positive", () => {
  assert.deepEqual(J(M.FOOD_IDS), ["fruit", "fveg", "sprouts", "pnuts", "honey"]);
  for (const id of M.FOOD_IDS) assert.ok(M.value(id, opt) > 0, id);
  assert.deepEqual(J(M.score({ fruit: true, honey: true }, opt)), { p: 3 + 2, b: 0 });   // prana only, never body
});

test("the drains lower prana and never body: coffee or tea, onion or garlic, alcohol, leftovers, heavy", () => {
  assert.deepEqual(J(M.DRAIN_IDS), ["coffee", "neg", "alcohol", "stale", "heavy"]);
  for (const id of M.DRAIN_IDS) assert.ok(M.value(id, opt) < 0, id);
  assert.deepEqual(J(M.score({ coffee: true, alcohol: true }, opt)), { p: -8, b: 0 });
  assert.equal(M.value("heavy", { ...opt, heavy: -7 }), -7);   // the Heavy meal habit's own value
  assert.equal(M.value("coffee", { mult: 9 }), -3);            // the level multiplier never grows a drain
});

test("Blueprint body foods stay and fill body only; ultra-processed takes body", () => {
  assert.deepEqual(J(M.BODY), ["blueprint", "protein", "legumes", "veg", "greens", "evoo", "nuts", "berries", "seeds", "ferment", "xylitol", "supps"]);   // xylitol moved into the quiz (2026-10-19, d11)
  assert.deepEqual(J(M.score({ veg: true, nuts: true, junk: true }, opt)), { p: 0, b: 4 + 3 - 3 });
});

test("fresh and leftover cannot both be ticked", () => {
  let s = M.toggle({}, "fresh"); s = M.toggle(s, "stale");
  assert.equal(s.fresh, false); assert.equal(s.stale, true);
});

test("a day's tally counts pranic foods and drains from meal ratings only", () => {
  const t = M.tally({ a: { sel: ["fruit", "sprouts", "veg", "coffee"] }, b: { sel: ["heavy", "honey"] },
    c: { kind: "act", sel: ["fruit"] }, d: { kind: "gym", sel: [] }, e: null });
  assert.deepEqual(J(t), { foods: 3, drains: 2 });
});

test("no free-floating meal entry: the Rate a meal tile and the How was <meal>? button are gone", () => {
  assert.ok(!html.includes("Rate a meal"), "quest.html still has the Rate a meal tile");
  assert.ok(!/data-mealq/.test(html), "quest.html still has a data-mealq button");
  assert.ok(!/function unratedMeal/.test(html), "quest.html still looks for an unrated meal to nag about");
});

test("a meal block opens one screen that is the meal: no plate list, no Rate this meal, no Confirm", () => {
  assert.ok(!/openMealQuiz|Rate this meal|id="mqOk"|data-plate|data-bp=|A full glass of water/.test(html));
  assert.ok(/if \(isMeal\(b\)\) return openMeal\(b\);/.test(html), "a meal block opens openMeal");
  assert.ok(/function openMeal\(b\)\{\s*if \(!b\) return;/.test(html), "openMeal must refuse to open without a block");
  assert.equal([...html.matchAll(/openMeal\(/g)].length, 4, "the definition, the block tap, the redraw after a tap, the planner's button");
});

test("the meal screen is grouped Prana foods, Body foods, Drains in the meters' colours, and loads quest-meals.js", () => {
  const i = html.indexOf("function openMeal(b)"), body = html.slice(i, i + 5000);
  const a = body.indexOf("Prana foods"), b = body.indexOf("Body foods"), c = body.indexOf("Drains");
  assert.ok(a > 0 && b > a && c > b, "groups out of order or missing");
  assert.ok(/<script src="quest-meals\.js\?v=\w+"><\/script>/.test(html));
  assert.ok(body.includes("QM.AUTO_NOTE"), "the automatic drains are named in the quiz");
  assert.ok(body.includes("QM.tap("), "each tile pays as he taps");
});

test("tiles pay as he taps, and a second tap takes back exactly what was paid", () => {
  const opt = { mult:1.5, heavy:-5, bodyGain:id => ({ veg:5, supps:2 })[id] || 0 };
  let r = M.tap(null, "fruit", opt);
  assert.deepEqual(J(r.ops), [{ id:"fruit", on:true, m:"p", d:3 }]);
  r = M.tap(r.rec, "veg", opt);
  assert.deepEqual(J(r.ops), [{ id:"veg", on:true, m:"b", d:5 }]);
  assert.equal(r.rec.p, 3); assert.equal(r.rec.b, 5);
  // the body food's value changes later (daily limit): the take-back is still what it paid
  r = M.tap(r.rec, "veg", { ...opt, bodyGain:() => 0 });
  assert.deepEqual(J(r.ops), [{ id:"veg", on:false, m:"b", d:-5 }]);
  assert.equal(r.rec.b, 0); assert.deepEqual(J(r.rec.sel), ["fruit"]);
  // fresh and leftover cannot both stand
  r = M.tap(r.rec, "fresh", opt); r = M.tap(r.rec, "stale", opt);
  assert.deepEqual(J(r.ops), [{ id:"fresh", on:false, m:"p", d:-5 }, { id:"stale", on:true, m:"p", d:-2 }]);
  // drains lower prana; the heavy meal uses the page's value
  assert.deepEqual(J(M.tap(null, "heavy", opt).ops), [{ id:"heavy", on:true, m:"p", d:-5 }]);
  // supplements and xylitol are body foods
  assert.equal(M.meterOf("supps"), "b"); assert.equal(M.meterOf("xylitol"), "b");
});

test("a rating from before (Confirm, no paid values) can be taken back at today's value", () => {
  const r = M.tap({ sel:["fruit"], p:3, b:0 }, "fruit", { mult:1.5 });
  assert.deepEqual(J(r.ops), [{ id:"fruit", on:false, m:"p", d:-3 }]);
});

test("the prana meter's low word names sadhana and pranic food", () => {
  assert.ok(!html.includes('"Build it with sadhana"'));
  assert.ok(/p < 10 \? "Sadhana and pranic food build it"/.test(html));
});

test("a rating from before the regroup still counts its pranic food", () => {
  assert.deepEqual(J(M.tally({ old: { sel: ["pos", "neg", "fresh"] } })), { foods: 1, drains: 1 });
});

test("the morning hint no longer says prana only rises through sadhana", () => {
  const m = fs.readFileSync(here + "quest-morning.js", "utf8");
  assert.ok(!m.includes("Prana only rises through sadhana"));
});

test("user-facing text in the quiz module has no em or en dashes", () => {
  const src = fs.readFileSync(here + "quest-meals.js", "utf8");
  assert.ok(!/[–—]/.test(src));
});
