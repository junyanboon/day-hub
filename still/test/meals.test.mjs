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
  // 2026-10-20 (d13, d16): the Blueprint meal is the dish checklists; ferment, xylitol and supps are on the water card
  assert.deepEqual(J(M.BODY), ["protein", "legumes", "veg", "greens", "evoo", "nuts", "berries", "seeds"]);
  for (const id of ["blueprint", "ferment", "xylitol", "supps"]) assert.equal(M.meterOf(id), "b", id + " stays body in old records");
  assert.deepEqual(J(M.score({ veg: true, nuts: true, junk: true }, opt)), { p: 0, b: 4 + 3 - 3 });
});

test("how he ate is tips now (d15): fresh, light and attention are no tiles, and leftover leaves an old fresh alone", () => {
  assert.deepEqual(J(M.ONEOF), {});
  let s = M.toggle({ fresh: true }, "stale");
  assert.equal(s.fresh, true); assert.equal(s.stale, true);
  assert.deepEqual(J(M.TIPS.map(t => t[1])), ["Eat it fresh, within 1.5 hours of cooking.",
    "Sit two minutes before the first bite, phone face down.", "Stop before full. You should feel light 30 minutes after."]);
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
  assert.ok(/if \(isMeal\(b\)\) return "meal";/.test(html) && /if \(l === "meal"\) return openMeal\(b\);/.test(html), "a meal block opens openMeal");
  assert.ok(/function openMeal\(b\)\{\s*if \(!b\) return;/.test(html), "openMeal must refuse to open without a block");
  assert.equal([...html.matchAll(/openMeal\(/g)].length, 4, "the definition, the block tap, the redraw after a tap, the planner's button");
});

test("the meal screen is grouped Prana foods, Body foods, Drains in the meters' colours, and loads quest-meals.js", () => {
  const i = html.indexOf("function openMeal(b)"), body = html.slice(i, i + 9000);
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
  // leftover is a drain on its own now (d15): it no longer takes back a fresh
  r = M.tap(r.rec, "stale", opt);
  assert.deepEqual(J(r.ops), [{ id:"stale", on:true, m:"p", d:-2 }]);
  // drains lower prana; the heavy meal uses the page's value
  assert.deepEqual(J(M.tap(null, "heavy", opt).ops), [{ id:"heavy", on:true, m:"p", d:-5 }]);
  // supplements and xylitol (now on the water card) are still body
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

// ---- Fill the Plate (Junyan, 2026-10-20, d12 to d16) ----
const sv = () => M.dishOf("sv"), at15 = { mult:1.5 };

test("Blueprint dishes: Super Veggie and Nutty Pudding with amounts for 2, and no garlic (d12)", () => {
  assert.deepEqual(J(M.DISHES.map(d => d.name)), ["Super Veggie", "Nutty Pudding"]);
  assert.equal(sv().items.length, 10); assert.equal(M.dishOf("np").items.length, 12);
  for (const d of M.DISHES.concat(M.IDEAS)) assert.ok(!d.items.some(([n]) => /garlic|onion|asafoetida/i.test(n)), d.name);
  assert.deepEqual(J(sv().items[0]), ["Black lentils, dry", "90 g"]);
  assert.deepEqual(J(M.dishOf("np").items[8]), ["Cinnamon", "½ tsp"]);
});

test("tonight's ideas: three recipes for 2 with a time and steps, in one list", () => {
  assert.deepEqual(J(M.IDEAS.map(d => [d.name, d.time])), [["Lentil bowl with roasted peppers", "35 min"],
    ["Chickpea and spinach stew", "30 min"], ["Quinoa, broccoli and white beans", "25 min"]]);
  for (const d of M.IDEAS) { assert.ok(d.how && d.how.length > 40, d.id); assert.ok(d.items.length >= 9, d.id); }
  const ids = M.DISHES.concat(M.IDEAS).map(d => d.id);
  assert.equal(new Set(ids).size, ids.length, "dish ids are unique");
});

test("a dish pays its share of the Blueprint meal's +9 as ingredients are ticked, and an untick takes it back", () => {
  assert.equal(M.dishMax(at15), 9);   // the blueprint habit's 6 times the level multiplier
  assert.equal(M.dishMax({ mult:1.5, dish:6 }), 9); assert.equal(M.dishMax({ mult:1, dish:8 }), 8);   // the page passes the HABITS value
  let r = M.tick(null, sv(), "Broccoli", at15);
  assert.deepEqual(J(r.ops), [{ id:"dish:sv", on:true, m:"b", d:1 }]);
  for (const n of ["Cauliflower", "Lime", "Hemp seeds", "Ground cumin"]) r = M.tick(r.rec, sv(), n, at15);
  assert.equal(r.rec.b, 5); assert.deepEqual(J(r.rec.v["dish:sv"]), ["b", 5]);   // 5 of 10: round(4.5)
  const st = M.dishStatus(r.rec, sv());
  assert.equal(st.n, 5); assert.equal(st.m, 10); assert.equal(st.all, false); assert.equal(st.pct, 50);
  assert.equal(st.text, "Missing: Black lentils, dry, Shiitake mushrooms and 3 more");
  r = M.tick(r.rec, sv(), "Lime", at15);
  assert.deepEqual(J(r.ops), [{ id:"dish:sv", on:false, m:"b", d:-1 }]);
  assert.equal(r.rec.b, 4); assert.equal(M.dishStatus(r.rec, sv()).n, 4);
});

test("Got everything pays the full value, Clear takes all of it back, and each dish scores on its own", () => {
  let r = M.tick(null, sv(), "Broccoli", at15);
  r = M.tick(r.rec, sv(), "all", at15);
  assert.deepEqual(J(r.ops), [{ id:"dish:sv", on:true, m:"b", d:8 }]);
  assert.equal(M.dishStatus(r.rec, sv()).text, "All in. Full points.");
  r = M.tick(r.rec, M.dishOf("r2"), "all", at15);
  assert.equal(r.rec.b, 18); assert.equal(M.dishPaid(r.rec, M.dishOf("r2")), 9);
  r = M.tick(r.rec, sv(), "none", at15);
  assert.deepEqual(J(r.ops), [{ id:"dish:sv", on:false, m:"b", d:-9 }]);
  assert.equal(r.rec.b, 9); assert.equal(r.rec.dish.sv, undefined); assert.equal(r.rec.v["dish:sv"], undefined);
  assert.deepEqual(J(M.tick(r.rec, sv(), "none", at15).ops), []);   // nothing to take back twice
  // a partly ticked dish first: half pays its share
  assert.equal(M.dishPay(M.dishOf("np"), 6, at15), 5);   // round(9 * 6 / 12) = round(4.5)
});

test("dish ticks live on the meal's record beside the tiles: a tile tap keeps them, and a level change takes back what was paid", () => {
  let r = M.tick(null, sv(), "all", at15);
  r = M.tap(r.rec, "veg", { mult:1.5, bodyGain:() => 5 });
  assert.equal(r.rec.dish.sv.length, 10); assert.equal(r.rec.b, 14);
  const t = M.tick(r.rec, sv(), "none", { mult:0.6 });   // a lower multiplier later: Clear still takes back the 9 it paid
  assert.deepEqual(J(t.ops), [{ id:"dish:sv", on:false, m:"b", d:-9 }]);
});

test("an old meal record with fresh, light and attention still loads, names them and keeps their points", () => {
  const old = { sel:["fresh", "light", "attn", "fruit"], v:{ fresh:["p", 5], light:["p", 3], attn:["p", 3], fruit:["p", 3] }, p:14, b:0, at:"2026-10-19T23:00:00Z" };
  assert.deepEqual(J(M.dishStatus(old, sv())), { n:0, m:10, all:false, missing:J(sv().items.map(x => x[0])), pct:0, text:"" });
  const r = M.tick(old, sv(), "Broccoli", at15);
  assert.deepEqual(J(r.rec.sel), ["fresh", "light", "attn", "fruit"]);
  assert.equal(r.rec.p, 14); assert.equal(r.rec.b, 1);
  assert.ok(M.PRANA_WAYS.some(x => x[0] === "attn"), "the old rows are still named");
  assert.equal(M.value("fresh", at15), 5);
  // a record from even before (no paid values, no dish field) loads too
  assert.deepEqual(J(M.tick({ sel:["pos", "fresh"], p:3 }, sv(), "Lime", at15).rec.sel), ["pos", "fresh"]);
  assert.deepEqual(J(M.tally({ a: old })), { foods:1, drains:0 });
});

test("the meal sheet: a How to eat box, Blueprint dishes and tonight's ideas first, compact tiles, one-line headings", () => {
  const i = html.indexOf("function openMeal(b)"), body = html.slice(i, html.indexOf("A walk, hike or other outdoor block"));
  assert.ok(body.includes("How to eat") && body.includes("QM.TIPS"));
  assert.ok(!/QM\.PRANA_WAYS\.map|How you ate|⏳ Sit with the food/.test(body), "the how-you-ate tiles and the old line are gone");
  const t = body.indexOf("QM.TIPS"), d = body.indexOf("Blueprint dishes"), id = body.indexOf("Tonight's ideas · for 2 people"), p = body.indexOf("Prana foods");
  assert.ok(t > 0 && d > t && id > d && p > id, "tips, dishes, ideas, then the tiles");
  assert.ok(body.includes("QM.tick("), "the dish checklists pay through QuestMeals.tick");
  assert.ok(body.includes("Got everything") && body.includes("Clear"));
  assert.ok(!/fill body \(Bryan Johnson\)/.test(body), "the long heading that wrapped is gone");
  assert.match(html, /\.mq-lb \{[^}]*white-space:nowrap/);
  assert.match(html, /\.hgrid\.mqg \{ grid-template-columns:repeat\(4, 1fr\)/);
  assert.equal(M.tileLabel(M.PRANA_FOODS[1]), "Fresh veg, raw or just cooked");   // short on the tile, full in the trends
  assert.equal(M.PRANA_FOODS[1][2], "Fresh vegetables, raw or just cooked");
});
