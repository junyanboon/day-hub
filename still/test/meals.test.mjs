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
  assert.deepEqual(J(M.BODY), ["blueprint", "protein", "legumes", "veg", "greens", "evoo", "nuts", "berries", "seeds", "ferment"]);
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

test("the quiz opens only from a calendar meal block's sheet", () => {
  const calls = [...html.matchAll(/openMealQuiz\((b[^)]*)\)/g)].map(m => m[1]);
  assert.equal([...html.matchAll(/openMealQuiz\(/g)].length, 3, "one definition, one redraw, one button");
  // the definition, the redraw after a tap, and the one Rate this meal button in openMeal
  assert.deepEqual(J(calls.sort()), ["b", "b, Object.assign(sel, QM.toggle(sel, bn.dataset.q", "b, sel = {}"]);
  assert.ok(/\$\("mBp"\)\.onclick = \(\) => openMealQuiz\(b\)/.test(html));
  assert.ok(/function openMealQuiz\(b, sel = \{\}\)\{\s*if \(!b\) return;/.test(html), "openMealQuiz must refuse to open without a block");
});

test("the quiz is grouped Prana foods, Body foods, Drains in the meters' colours, and loads quest-meals.js", () => {
  const i = html.indexOf("function openMealQuiz"), body = html.slice(i, i + 4000);
  const a = body.indexOf("Prana foods"), b = body.indexOf("Body foods"), c = body.indexOf("Drains");
  assert.ok(a > 0 && b > a && c > b, "groups out of order or missing");
  assert.ok(/<script src="quest-meals\.js\?v=\w+"><\/script>/.test(html));
  assert.ok(body.includes("QM.AUTO_NOTE"), "the automatic drains are named in the quiz");
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
