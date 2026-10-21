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
  assert.equal([...html.matchAll(/openMeal\(/g)].length, 5, "the definition, the block tap, the redraw after a tap, the planner's button, the dish editor's way back (d48)");
});

test("the meal screen (d83 to d85): What's this meal?, the Counted line, then the drains; no food tile grids, no note on the automatic drains", () => {
  const i = html.indexOf("function openMeal(b)"), body = html.slice(i, html.indexOf("The meal sheet's kitchen parts"));
  const a = body.indexOf("What's this meal?"), b = body.lastIndexOf("${counted()}"), c = body.indexOf("Drains · lower prana");
  assert.ok(a > 0 && b > a && c > b, "out of order or missing");
  assert.ok(!/Prana foods · Sadhguru|Body foods · Bryan Johnson/.test(body), "d83: the tile grids are gone");
  assert.ok(/<script src="quest-meals\.js\?v=\w+"><\/script>\s*<script src="quest-food-score\.js\?v=\w+"><\/script>/.test(html));
  assert.ok(!/AUTO_NOTE|Eating within 3 hours of bed and staying up past 11 count by themselves/.test(html + fs.readFileSync(new URL("../quest-meals.js", import.meta.url), "utf8")), "d85: the note is gone");
  assert.ok(body.includes("QM.handTap("), "a drain pays as he taps");
  assert.ok(body.includes("QM.autoSync(") && body.includes("FSC().earn(foods, { morning, share:"), "the food tiles follow what was logged");
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
  assert.deepEqual(J(M.IDEAS.map(d => [d.name, d.time])), [["Lentil bowl with soft peppers", "35 min"],
    ["Chickpea and spinach stew", "30 min"], ["Quinoa, broccoli and white beans", "25 min"]]);
  for (const d of M.IDEAS) { assert.ok(d.how && d.how.length > 40, d.id); assert.ok(d.items.length >= 9, d.id); }
  const ids = M.DISHES.concat(M.IDEAS).map(d => d.id);
  assert.equal(new Set(ids).size, ids.length, "dish ids are unique");
});

test("a dish pays its share of the Blueprint meal's +9 as its parts are filled (d52), and an untick takes it back", () => {
  assert.equal(M.dishMax(at15), 9);   // the blueprint habit's 6 times the level multiplier
  assert.equal(M.dishMax({ mult:1.5, dish:6 }), 9); assert.equal(M.dishMax({ mult:1, dish:8 }), 8);   // the page passes the HABITS value
  let r = M.tick(null, sv(), "greens:Broccoli", at15);
  assert.deepEqual(J(r.ops), [{ id:"dish:sv", on:true, m:"b", d:1 }]);   // 1 of 8 parts: round(1.125)
  // Cauliflower fills the same part (greens), so it pays nothing more; a swap (Lemons, Pumpkin seeds) counts like the real thing
  const c = M.tick(r.rec, sv(), "greens:Cauliflower", at15);
  assert.deepEqual(J(c.ops), []);
  r = c;
  for (const n of ["acid:Lemons", "seeds:Pumpkin seeds", "spice:Ground cumin"]) r = M.tick(r.rec, sv(), n, at15);
  assert.equal(r.rec.b, 5); assert.deepEqual(J(r.rec.v["dish:sv"]), ["b", 5, 9, 0]);   // [meter, paid, max, counted as done] (d17, d18); 4 of 8: round(4.5)
  const st = M.dishStatus(r.rec, sv());
  assert.equal(st.n, 4); assert.equal(st.m, 8); assert.equal(st.all, false); assert.equal(st.pct, 50);
  assert.equal(st.text, "Missing: Lentils or beans, Mushroom and 2 more");
  r = M.tick(r.rec, sv(), "acid:Lemons", at15);
  assert.deepEqual(J(r.ops), [{ id:"dish:sv", on:false, m:"b", d:-2 }]);   // 3 of 8: round(3.375) = 3
  assert.equal(r.rec.b, 3); assert.equal(M.dishStatus(r.rec, sv()).n, 3);
});

test("d51: parts read the ticks: a part tick is 'part:food', and a recipe name ticked before parts reads as its part", () => {
  assert.equal(sv().slots.length, 8); assert.equal(M.dishOf("np").slots.length, 11);
  assert.deepEqual(J(M.slotOf(sv(), "greens:Kale")), { slot:"greens", name:"Kale" });
  assert.deepEqual(J(M.slotOf(sv(), "Black lentils, dry")), { slot:"legume", name:"Black lentils, dry" });
  assert.equal(M.slotOf(sv(), "nope:Kale"), null); assert.equal(M.slotOf(sv(), "Bananas"), null);
  assert.equal(M.entryName(sv(), "greens:Kale"), "Kale"); assert.equal(M.entryName(M.dishOf("r1"), "Lemon"), "Lemon");
  // a meal ticked before parts (the recipe's own names) still counts by part and can be unticked
  const old = { sel:[], v:{ "dish:sv":["b", 2, 9, 0] }, p:0, b:2, dish:{ sv:["Broccoli", "Cauliflower", "Lime"] } };
  assert.equal(M.dishStatus(old, sv()).n, 2);
  const r = M.tick(old, sv(), "Lime", at15);
  assert.deepEqual(J(r.rec.dish.sv), ["Broccoli", "Cauliflower"]);
  assert.equal(r.rec.b, 1);   // 1 of 8 now: round(1.125), and it takes back the difference from what it paid
  // a list sets the ticks (the page's Got everything): one food per tick, ticks that do not read are dropped
  const all = M.tick(null, sv(), ["greens:Kale", "greens:Kale", "legume:Chickpeas", "x:y"], at15);
  assert.deepEqual(J(all.rec.dish.sv), ["greens:Kale", "legume:Chickpeas"]);
  assert.equal(all.rec.b, 2);
  // the whole recipe is still there, same names and amounts
  const same = d => assert.deepEqual(J(d.slots.flatMap(s => s.want.map(w => w[0] + " " + w[1])).sort()), J(d.items.map(w => w[0] + " " + w[1]).sort()));
  same(sv()); same(M.dishOf("np"));
});

test("d53: How to make it: numbered steps for every dish, and a part dish names what fills each part today", () => {
  const base = M.stepsOf(sv());
  assert.ok(base.length >= 6);
  assert.ok(base.some(x => /^Cut the broccoli and cauliflower small and steam until soft/.test(x)), base.join(" / "));
  const today = M.stepsOf(sv(), { greens:["Kale"], legume:["Chickpeas"], mushroom:[], ginger:["Fresh ginger, grated"], spice:[], acid:["Lemons"], seeds:["Pumpkin seeds"], oil:["Extra virgin olive oil"] });
  assert.ok(today.some(x => /^Cut the kale small and steam until soft/.test(x)), today.join(" / "));
  assert.ok(!today.some(x => /shiitake|mushroom/i.test(x)), "a step for an empty part is left out");
  assert.ok(today.includes("Stir in the fresh ginger for the last minute."));
  // gentle on the gut (2026-10-21): steamed or simmered, never fried or roasted
  for (const d of M.DISHES) for (const x of M.stepsOf(d)) assert.ok(!/\b(fry|fried|roast)/i.test(x), x);
  const np = M.stepsOf(M.dishOf("np"), { milk:["Oat milk"], nuts:["Almonds"], walnuts:["Walnuts"], brazil:["Brazil nuts"] });
  assert.ok(np.includes("Add the almonds, walnuts and Brazil nuts and blend until smooth, about 1 min."), np.join(" / "));
  // tonight's ideas: their paragraph in sentences; his own dish: his list; nothing: none
  assert.deepEqual(J(M.stepsOf(M.dishOf("r1"))), ["Simmer the lentils 20 min with the cumin and paprika.", "Steam the sliced peppers and courgette until soft, about 10 min.",
    "Wilt the spinach into the hot lentils, then top with the veg, lemon, parsley and almonds.", "Drizzle the oil over at the end."]);
  assert.deepEqual(J(M.stepsOf({ own:true, items:[], steps:[" Boil water ", "", 3] })), ["Boil water"]);
  assert.deepEqual(J(M.stepsOf({ own:true, items:[] })), []);
  for (const d of M.DISHES) assert.ok(!/[—–]/.test(d.steps.join(" ")), "no dashes");
});

test("Got everything pays the full value, Clear takes all of it back, and each dish scores on its own", () => {
  let r = M.tick(null, sv(), "Broccoli", at15);
  r = M.tick(r.rec, sv(), "all", at15);
  assert.deepEqual(J(r.ops), [{ id:"dish:sv", on:true, m:"b", d:8 }]);
  assert.equal(M.dishStatus(r.rec, sv()).text, "All in. Full points.");
  r = M.tick(r.rec, M.dishOf("r2"), "all", at15);
  assert.equal(r.rec.b, 9, "an idea pays nothing (d81)"); assert.equal(M.dishPaid(r.rec, M.dishOf("r2")), 0);
  r = M.tick(r.rec, sv(), "none", at15);
  assert.deepEqual(J(r.ops), [{ id:"dish:sv", on:false, m:"b", d:-9 }]);
  assert.equal(r.rec.b, 0); assert.equal(r.rec.dish.sv, undefined); assert.equal(r.rec.v["dish:sv"], undefined);
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
  assert.deepEqual(J(M.dishStatus(old, sv())), { n:0, m:8, all:false, missing:J(sv().slots.map(x => x.role)), pct:0, text:"" });
  const r = M.tick(old, sv(), "Broccoli", at15);
  assert.deepEqual(J(r.rec.sel), ["fresh", "light", "attn", "fruit"]);
  assert.equal(r.rec.p, 14); assert.equal(r.rec.b, 1);
  assert.ok(M.PRANA_WAYS.some(x => x[0] === "attn"), "the old rows are still named");
  assert.equal(M.value("fresh", at15), 5);
  // a record from even before (no paid values, no dish field) loads too
  assert.deepEqual(J(M.tick({ sel:["pos", "fresh"], p:3 }, sv(), "Lime", at15).rec.sel), ["pos", "fresh"]);
  assert.deepEqual(J(M.tally({ a: old })), { foods:1, drains:0 });
});

test("the meal sheet: Blueprint dishes and tonight's ideas first, compact tiles, one-line headings (the tips left it, d88)", () => {
  const i = html.indexOf("function openMeal(b)"), body = html.slice(i, html.indexOf("A walk, hike or other outdoor block"));
  assert.ok(!body.includes("How to eat") && !body.includes("QM.TIPS"), "d88: one tip on the meal block instead (meal-tip.test.mjs)");
  assert.ok(!/QM\.PRANA_WAYS\.map|How you ate|⏳ Sit with the food/.test(body), "the how-you-ate tiles and the old line are gone");
  // one dish per meal (2026-10-21): the choices first (Blueprint, his dishes, recipes or ideas), then the drains
  const d = body.indexOf('"Blueprint dishes"'), y = body.indexOf('"Your dishes"'), id = body.indexOf("Tonight's ideas · for 2 people"), t = body.indexOf("Drains · lower prana");
  assert.ok(d > 0 && y > d && id > y && t > id, "dishes, his dishes, ideas, then the drains");
  assert.ok(body.includes("QM.tick("), "the dish checklists pay through QuestMeals.tick");
  assert.ok(!/>Got everything<|>Clear</.test(body), "ticking part by part does the job (2026-10-21)");
  assert.ok(!/fill body \(Bryan Johnson\)/.test(body), "the long heading that wrapped is gone");
  assert.match(html, /\.mq-lb \{[^}]*white-space:nowrap/);
  assert.match(html, /\.hgrid\.mqg \{ grid-template-columns:repeat\(4, 1fr\)/);
  assert.equal(M.tileLabel(M.PRANA_FOODS[1]), "Fresh veg, raw or just cooked");   // short on the tile, full in the trends
  assert.equal(M.PRANA_FOODS[1][2], "Fresh vegetables, raw or just cooked");
});

// ---- the daily cap and "Blueprint meal done" (Junyan, 2026-10-20, "17 yes 18 yes") ----
const PAGE = { mult:1.5, dish:6, dim:[1, .7, .5, .35, .25, .2], dishLimit:2 };
const np = () => M.dishOf("np"), dayOf = recs => Object.fromEntries(recs.map((r, i) => ["m" + i, r]));

test("d17: Blueprint dishes share two a day across meals: +9, then +6, then nothing", () => {
  const lunch = M.tick(null, sv(), "all", { ...PAGE, used:M.slotsUsed({}, "m0", sv()) });
  assert.deepEqual(J(lunch.ops), [{ id:"dish:sv", on:true, m:"b", d:9 }]);
  let day = dayOf([lunch.rec]);
  assert.equal(M.slotsUsed(day, "m1", np()), 1);
  const dinner = M.tick(null, np(), "all", { ...PAGE, used:M.slotsUsed(day, "m1", np()) });
  assert.deepEqual(J(dinner.ops), [{ id:"dish:np", on:true, m:"b", d:6 }]);   // round(6 x .7 x 1.5)
  day = dayOf([lunch.rec, dinner.rec]);
  const third = M.tick(null, sv(), "all", { ...PAGE, used:M.slotsUsed(day, "m2", sv()) });
  assert.deepEqual(J(third.ops), []); assert.equal(third.rec.b, 0);
  assert.equal(third.rec.v["dish:sv"], undefined, "a capped dish holds no slot");
  assert.equal(third.rec.dish.sv.length, 10, "its ticks are still kept");
  // the same dish's own slot is not counted against it
  assert.equal(M.slotsUsed(day, "m0", sv()), 1);
});

test("d17: the max is kept, so later ticks and unticks use it and an untick takes back exactly what was paid", () => {
  let r = M.tick(null, np(), "Walnuts", { ...PAGE, used:1 });   // second slot: max 6
  assert.deepEqual(J(r.rec.v["dish:np"]), ["b", 1, 6, 0]);   // round(6 / 12) = 1
  // the first slot is freed meanwhile; this dish keeps its max of 6
  for (const n of ["Cocoa powder", "Cinnamon", "Cherries", "Blueberries", "Chia seeds"]) r = M.tick(r.rec, np(), n, { ...PAGE, used:0 });
  assert.equal(r.rec.b, 3); assert.equal(r.rec.v["dish:np"][2], 6);
  const paid = r.rec.b;
  r = M.tick(r.rec, np(), "none", { ...PAGE, used:0 });
  assert.deepEqual(J(r.ops), [{ id:"dish:np", on:false, m:"b", d:-paid }]);
  assert.equal(r.rec.v["dish:np"], undefined, "Clear frees the slot");
  // points never pass the max: the full dish pays its max exactly
  assert.equal(M.tick(null, np(), "all", { ...PAGE, used:1 }).rec.b, 6);
});

test("d17, d81: tonight's ideas pay nothing now and never use a Blueprint slot", () => {
  const bp = M.tick(null, sv(), "all", { ...PAGE, used:0 }).rec;
  const r1 = M.tick(null, M.dishOf("r1"), "all", { ...PAGE, used:M.slotsUsed(dayOf([bp]), "m1", M.dishOf("r1")) });
  assert.equal(r1.rec.b, 0, "an idea is a suggestion (d81)"); assert.ok(r1.rec.dish.r1.length);
  const day = dayOf([bp, r1.rec]);
  assert.equal(M.slotsUsed(day, "m2", np()), 1, "only the Blueprint dish holds a slot");
  assert.equal(M.slotsUsed(day, "m2", M.dishOf("r2")), 0);
  // an idea that paid before d81 still holds one of the ideas' slots (its record is left as it was)
  const old = { v:{ "dish:r1":["b", 9, 9, 0] }, b:9, dish:{ r1:["Lemon"] } };
  assert.equal(M.slotsUsed({ m1:old }, "m2", M.dishOf("r2")), 1);
});

test("d17: a Blueprint tile ticked before today's change still holds a slot", () => {
  const old = { sel:["blueprint", "veg"], v:{ blueprint:["b", 9], veg:["b", 5] }, p:0, b:14 };
  assert.equal(M.slotsUsed({ a:old }, "b", sv()), 1);
  assert.equal(M.slotsUsed({ a:old }, "b", M.dishOf("r1")), 0);
  assert.equal(M.slotsUsed({ a:{ kind:"gym", sel:["blueprint"] } }, "b", sv()), 0);
});

test("d18: a finished Super Veggie or Nutty Pudding counts as the Blueprint meal done; unfinishing takes it back", () => {
  let r = M.tick(null, sv(), "Broccoli", PAGE);
  assert.equal(r.done, 0);
  r = M.tick(r.rec, sv(), "all", PAGE);
  assert.equal(r.done, 1); assert.equal(r.rec.v["dish:sv"][3], 1);
  assert.equal(M.tick(r.rec, sv(), "all", PAGE).done, 0, "ticking all again counts nothing more");
  const un = M.tick(r.rec, sv(), "Extra virgin olive oil", PAGE);   // the oil part is empty again (d51)
  assert.equal(un.done, -1); assert.equal(un.rec.v["dish:sv"][3], 0);
  assert.equal(M.tick(r.rec, sv(), "none", PAGE).done, -1);
  // a recipe is not the Blueprint meal; a capped Blueprint dish pays nothing and is not counted either
  assert.equal(M.tick(null, M.dishOf("r1"), "all", PAGE).done, 0);
  assert.equal(M.tick(null, sv(), "all", { ...PAGE, used:2 }).done, 0);
});

test("d17 d18 on the page: the meal sheet passes the day's slots and counts a finished dish in the habit", () => {
  const i = html.indexOf("function openMeal(b)"), body = html.slice(i, html.indexOf("A walk, hike or other outdoor block"));
  assert.match(body, /const r = QM\.tick\(cur, d, how, dishOpt\(k, d\)\);/);
  assert.match(body, /if \(r\.done > 0\) G\.day\.habits\.blueprint = \(G\.day\.habits\.blueprint \|\| 0\) \+ 1;/);
  assert.match(body, /else if \(r\.done < 0\) \(G\.day\.voided = G\.day\.voided \|\| \{\}\)\.blueprint = \(\(G\.day\.voided \|\| \{\}\)\.blueprint \|\| 0\) \+ 1;/);
  assert.match(html, /dish:h\[2\], dim:DIM, dishLimit:h\[3\] \}/);
  assert.match(html, /const dishOpt = \(k, d\) => \(\{ \.\.\.mqOpt\(\), used:QM\.slotsUsed\(G\.day\.mealq, k, d\) \}\);/);
});
